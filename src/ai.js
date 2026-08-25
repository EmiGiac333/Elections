/**
 * Orchestrazione dell'analisi.
 *
 * Due fasi, entrambe indipendenti dal provider:
 *   1. profilo   — chi sono i due ticket, voto nazionale, racconto della campagna
 *   2. collegi   — le stime stato per stato, chieste a blocchi
 *
 * Il profilo viene passato come contesto alle richieste sui collegi: senza,
 * ogni blocco ragionerebbe per conto proprio e le stime non tornerebbero fra
 * loro. Se un blocco fallisce si prosegue con gli altri: i collegi mancanti
 * ricadono sulla base storica e il server lo dichiara.
 */

import { UNITS } from './states.js';
import { PROFILE_SCHEMA, buildStatesSchema } from './schema.js';
import { chatJson, ollamaModels } from './llm.js';
import { resolveProvider } from './providers.js';

const SYSTEM_PROMPT = `Sei un analista elettorale statunitense che lavora a una simulazione dichiaratamente immaginaria.

Ti vengono dati due "ticket" (candidato presidente + candidato vicepresidente) composti da persone famose, che nella realtà possono non essere mai state candidate a nulla. Il tuo compito è ipotizzare come reagirebbe l'elettorato americano.

Metodo:
1. Parti dal terreno di gioco storico di ogni stato (ti viene dato il margine presidenziale 2024) e ragiona per SCOSTAMENTI da quel margine.
2. Colloca ciascun ticket nello spazio politico più plausibile date le posizioni pubbliche note, la biografia e il pubblico dei suoi componenti. Se una persona non ha posizioni politiche note, deducile dal suo settore, dal suo pubblico e dalla sua immagine.
3. Applica gli effetti che contano in una presidenziale americana: effetto stato natale, composizione demografica (istruzione, età, etnia, urbano/rurale), religione, struttura economica dello stato, notorietà, capacità di mobilitare chi di solito non vota, rischio di alienare la propria base.
4. Sii asimmetrico: una celebrità può guadagnare voti fra i giovani e gli indipendenti e perderne fra gli elettori anziani e di partito. Mai uno swing uniforme su tutti gli stati.
5. Alza l'incertezza dove il candidato è polarizzante o politicamente non testato, e negli stati in bilico.

Vincoli:
- Il margine è sempre "ticket A meno ticket B" in punti percentuali.
- Scrivi tutti i testi in italiano, con tono da analisi giornalistica: concreto e specifico, mai generico.
- Le persone nominate sono reali: resta su ciò che è pubblicamente noto e su ciò che è dichiaratamente ipotetico. Non attribuire a persone vere fatti, reati o scandali inventati; le incognite e la "sorpresa di ottobre" devono essere scenari di campagna immaginari, non accuse.
- Rispondi SOLO con un oggetto JSON conforme allo schema richiesto, senza testo prima o dopo.`;

/**
 * Produce l'analisi completa interrogando il modello attivo.
 *
 * @param {object} input dati del modulo già validati
 * @param {(fase: {step: number, total: number, label: string}) => void} [onProgress]
 * @param {object} [providedTarget] provider già risolto: lo passa il browser,
 *        che sceglie il proprio motore invece di leggerlo dall'ambiente
 */
export async function analyzeElection(input, onProgress = () => {}, providedTarget = null) {
  const target = providedTarget ?? resolveProvider();
  await ensureReachable(target);

  const chunks = chunkCodes(UNITS.map((u) => u.code), target.chunk);
  const total = chunks.length + 1;
  const usage = { input_tokens: 0, output_tokens: 0, requests: 0 };
  let model = target.model;

  onProgress({ step: 1, total, label: 'Profilo dei due ticket e clima nazionale' });
  const profileCall = await chatJson({
    target,
    system: SYSTEM_PROMPT,
    schemaName: 'profilo_elezione',
    schema: PROFILE_SCHEMA,
    user: profilePrompt(input),
  });
  accumulate(usage, profileCall);
  model = profileCall.model;
  const profile = normalizeProfile(profileCall.data, input);

  const stati = [];
  const failures = [];

  for (const [index, codes] of chunks.entries()) {
    onProgress({
      step: index + 2,
      total,
      label: `Reazioni dei collegi ${index * target.chunk + 1}-${index * target.chunk + codes.length}`,
    });
    try {
      const call = await chatJson({
        target,
        system: SYSTEM_PROMPT,
        schemaName: 'stime_collegi',
        schema: buildStatesSchema(codes),
        user: statesPrompt(input, profile, codes),
      });
      accumulate(usage, call);
      stati.push(...pickStates(call.data, codes));
    } catch (error) {
      // Un blocco perso non deve buttare via l'intera simulazione.
      failures.push({ codes, message: error.message });
      console.warn(`Blocco di collegi non stimato (${codes.join(', ')}): ${error.message}`);
    }
  }

  if (!stati.length) {
    const motivo = failures[0]?.message ?? 'nessuna stima ricevuta';
    throw new Error(`Il modello non ha prodotto nessuna stima per gli stati: ${motivo}`);
  }

  return {
    analysis: { ...profile, stati },
    model,
    usage,
    provider: {
      id: target.provider.id,
      label: target.provider.label,
      free: target.provider.free,
      cost: target.provider.cost,
      reason: target.reason,
    },
    failures,
  };
}

/** Verifica in anticipo che il provider sia raggiungibile, con un errore utile. */
async function ensureReachable(target) {
  const { provider } = target;

  // Il modello del browser è già caricato quando si arriva qui: non c'è niente
  // da contattare.
  if (provider.kind === 'webllm') return;

  if (provider.apiKeyEnv && !target.apiKey) {
    throw new Error(
      `Manca la variabile ${provider.apiKeyEnv} per il provider ${provider.label}. ${provider.setup}`,
    );
  }

  if (provider.kind !== 'ollama') return;

  const installed = await ollamaModels(target.baseUrl);
  if (installed === null) {
    // Se siamo finiti su Ollama solo per esclusione, il problema vero è che non
    // è configurato nessun modello: su un server in cloud è il caso normale.
    if (target.autoFallback) {
      throw new Error(
        'Nessun modello configurato. Imposta una chiave gratuita fra GROQ_API_KEY, GEMINI_API_KEY ' +
          'o OPENROUTER_API_KEY, oppure avvia Ollama in locale (https://ollama.com).',
      );
    }
    throw new Error(
      `Ollama non risponde su ${target.baseUrl}. Avvialo (comando: ollama serve) oppure scegli un altro provider con AI_PROVIDER. ${provider.setup}`,
    );
  }
  if (!installed.length) {
    throw new Error(`Ollama è attivo ma non ha nessun modello installato. ${provider.setup}`);
  }
  if (!installed.some((name) => name === target.model || name.startsWith(`${target.model}:`))) {
    throw new Error(
      `Il modello "${target.model}" non è installato in Ollama. Installalo con "ollama pull ${target.model}" ` +
        `oppure scegli con AI_MODEL uno di quelli già presenti: ${installed.join(', ')}.`,
    );
  }
}

function chunkCodes(codes, size) {
  const chunks = [];
  for (let i = 0; i < codes.length; i += size) chunks.push(codes.slice(i, i + size));
  return chunks;
}

function accumulate(usage, call) {
  usage.input_tokens += call.usage?.input_tokens ?? 0;
  usage.output_tokens += call.usage?.output_tokens ?? 0;
  usage.requests += 1;
}

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

function ticketBlock(label, ticket) {
  return `${label}
  Presidente:      ${ticket.president}
  Vicepresidente:  ${ticket.vice}
  Etichetta indicata dall'utente: ${ticket.party || '(nessuna: deducila tu)'}`;
}

function profilePrompt({ ticketA, ticketB, scenario, year }) {
  const extra = scenario?.trim()
    ? `\nContesto scelto dall'utente, tienine conto:\n${scenario.trim()}\n`
    : '';

  return `Elezione presidenziale ipotetica del ${year}.

${ticketBlock('TICKET A', ticketA)}

${ticketBlock('TICKET B', ticketB)}
${extra}
Descrivi i due ticket, il voto popolare nazionale che otterrebbero e come si svolgerebbe la campagna.
Le percentuali voto_a, voto_b e voto_altri devono sommare a 100.`;
}

function statesPrompt({ ticketA, ticketB, year }, profile, codes) {
  const board = codes
    .map((code) => {
      const u = UNITS.find((x) => x.code === code);
      return `${u.code}\t${u.name}\t${u.ev} grandi elettori\tmargine 2024: ${fmt(u.lean)}`;
    })
    .join('\n');

  const sintesi = (profile.ticket ?? [])
    .map(
      (t) =>
        `  Ticket ${t.id}: ${t.partito_ipotetico}. Coalizione: ${t.coalizione}` +
        (t.stati_natali?.length ? ` Stati natali: ${t.stati_natali.join(', ')}.` : ''),
    )
    .join('\n');

  const margine = profile.nazionale.voto_a - profile.nazionale.voto_b;

  return `Stessa elezione ipotetica del ${year}.

${ticketBlock('TICKET A', ticketA)}

${ticketBlock('TICKET B', ticketB)}

Analisi già stabilita, da rispettare:
${sintesi}
  Voto popolare nazionale: ticket A ${profile.nazionale.voto_a}%, ticket B ${profile.nazionale.voto_b}% (margine nazionale ${fmt(margine)}).

Stima adesso SOLO queste ${codes.length} unità del Collegio Elettorale. Nel margine 2024 il segno positivo indica un vantaggio democratico; il margine che devi restituire è invece positivo se è avanti il TICKET A.

${board}

Per ognuna dai margine, incertezza e una frase sulla reazione dello stato. La media dei tuoi margini, pesata per grandi elettori, deve restare compatibile con il margine nazionale indicato sopra.`;
}

function fmt(value) {
  return `${value > 0 ? '+' : ''}${Number(value).toFixed(1)}`;
}

/* ------------------------------------------------------------------ */
/* Normalizzazione                                                     */
/* ------------------------------------------------------------------ */

/** Ripara i punti in cui un modello piccolo tende a sbagliare la forma. */
function normalizeProfile(data, input) {
  const nazionale = data?.nazionale ?? {};
  let votoA = Number(nazionale.voto_a);
  let votoB = Number(nazionale.voto_b);
  let altri = Number(nazionale.voto_altri);

  if (!Number.isFinite(votoA)) votoA = 48;
  if (!Number.isFinite(votoB)) votoB = 48;
  if (!Number.isFinite(altri) || altri < 0) altri = Math.max(0, 100 - votoA - votoB);

  // Se le tre percentuali non fanno 100, si riscalano mantenendo i rapporti.
  const somma = votoA + votoB + altri;
  if (somma > 0 && Math.abs(somma - 100) > 0.5) {
    votoA = (votoA / somma) * 100;
    votoB = (votoB / somma) * 100;
    altri = (altri / somma) * 100;
  }

  const ticket = ['A', 'B'].map((id) => {
    const found = (data?.ticket ?? []).find((t) => t?.id === id) ?? {};
    const source = id === 'A' ? input.ticketA : input.ticketB;
    return {
      id,
      partito_ipotetico: text(found.partito_ipotetico) || source.party || 'Non dichiarato',
      slogan: text(found.slogan),
      coalizione: text(found.coalizione),
      punti_di_forza: list(found.punti_di_forza),
      punti_deboli: list(found.punti_deboli),
      stati_natali: list(found.stati_natali).map((s) => String(s).toUpperCase()),
    };
  });

  return {
    nazionale: {
      voto_a: round(votoA),
      voto_b: round(votoB),
      voto_altri: round(altri),
      affluenza: Number.isFinite(Number(nazionale.affluenza)) ? round(Number(nazionale.affluenza)) : 60,
      clima: text(nazionale.clima),
    },
    ticket,
    stati_chiave: list(data?.stati_chiave).map((s) => String(s).toUpperCase()),
    racconto: {
      campagna: text(data?.racconto?.campagna),
      dibattiti: text(data?.racconto?.dibattiti),
      media: text(data?.racconto?.media),
      sorpresa_ottobre: text(data?.racconto?.sorpresa_ottobre),
      affluenza_e_demografia: text(data?.racconto?.affluenza_e_demografia),
      notte_elettorale: text(data?.racconto?.notte_elettorale),
    },
    titoli_di_giornale: list(data?.titoli_di_giornale).map(text).filter(Boolean),
    incognite: list(data?.incognite)
      .map((w) => ({
        titolo: text(w?.titolo),
        descrizione: text(w?.descrizione),
        impatto: Number.isFinite(Number(w?.impatto)) ? Number(w.impatto) : 0,
      }))
      .filter((w) => w.titolo || w.descrizione),
  };
}

/** Tiene solo le voci del blocco richiesto, senza duplicati. */
function pickStates(data, codes) {
  const wanted = new Set(codes);
  const seen = new Set();
  const out = [];

  for (const entry of list(data?.stati)) {
    const code = String(entry?.code ?? '').trim().toUpperCase();
    if (!wanted.has(code) || seen.has(code)) continue;
    const margine = Number(entry.margine_a);
    if (!Number.isFinite(margine)) continue;
    seen.add(code);
    out.push({
      code,
      margine_a: margine,
      incertezza: Number(entry.incertezza),
      reazione: text(entry.reazione),
    });
  }
  return out;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function round(value) {
  return Math.round(value * 10) / 10;
}
