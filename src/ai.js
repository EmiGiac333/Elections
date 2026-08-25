/**
 * Interrogazione del modello: Claude produce l'analisi qualitativa e le stime
 * per stato, la simulazione Monte Carlo fa il resto.
 */

import Anthropic from '@anthropic-ai/sdk';
import { UNITS } from './states.js';
import { ANALYSIS_SCHEMA } from './schema.js';

export const MODEL = process.env.ELECTION_MODEL ?? 'claude-opus-5';

const SYSTEM_PROMPT = `Sei un analista elettorale statunitense che lavora a una simulazione dichiaratamente immaginaria.

Ti vengono dati due "ticket" (candidato presidente + candidato vicepresidente) composti da persone famose, che nella realtà possono non essere mai state candidate a nulla. Il tuo compito è ipotizzare, stato per stato, come reagirebbe l'elettorato americano.

Metodo che devi seguire:
1. Parti dal terreno di gioco storico di ogni stato (ti viene fornito il margine presidenziale 2024 come ancoraggio) e ragiona per SCOSTAMENTI da quel margine.
2. Colloca ciascun ticket nello spazio politico più plausibile date le posizioni pubbliche note, la biografia e la base di pubblico dei suoi componenti. Se una persona non ha posizioni politiche note, deducile dal suo settore, dal suo pubblico e dalla sua immagine pubblica.
3. Applica gli effetti che contano davvero in una presidenziale americana: effetto stato natale, composizione demografica (istruzione, età, etnia, urbano/rurale/suburbano), religione, struttura economica dello stato, notorietà pregressa, capacità di mobilitare non votanti e rischio di alienare la base del proprio schieramento.
4. Sii asimmetrico: una celebrità può guadagnare voti tra i giovani e gli indipendenti e perderne tra gli elettori anziani e di partito. Non applicare uno swing uniforme a tutti gli stati.
5. L'incertezza deve essere più alta dove il candidato è una figura polarizzante o poco testata politicamente, e negli stati in bilico.

Vincoli:
- Il margine è sempre "ticket A meno ticket B" in punti percentuali.
- Devi restituire una riga per OGNI unità del Collegio Elettorale che ti viene elencata, comprese le unità distrettuali di Maine e Nebraska.
- Le percentuali nazionali di voto_a, voto_b e voto_altri devono sommare a 100.
- Il margine nazionale implicito (voto_a - voto_b) deve essere coerente con la media dei margini statali pesata per popolazione.
- Scrivi tutti i testi in italiano, con tono da analisi giornalistica: concreto, specifico, mai generico.
- Trattandosi di persone reali, resta sul terreno di ciò che è pubblicamente noto e di ciò che è chiaramente ipotetico. Non inventare fatti, reati o scandali reali attribuiti a persone vere: le incognite e la "sorpresa di ottobre" devono essere esplicitamente scenari di fantasia legati alla campagna, non accuse.`;

function buildUserPrompt({ ticketA, ticketB, scenario, year }) {
  const board = UNITS.map((u) => `${u.code}\t${u.name}\t${u.ev} GE\tbase 2024: ${fmt(u.lean)}`).join(
    '\n',
  );

  const extra = scenario?.trim()
    ? `\nContesto aggiuntivo scelto dall'utente (tienine conto):\n${scenario.trim()}\n`
    : '';

  return `Elezione presidenziale ipotetica del ${year}.

TICKET A
  Presidente:      ${ticketA.president}
  Vicepresidente:  ${ticketA.vice}
  Etichetta scelta dall'utente: ${ticketA.party || '(nessuna: deducila tu)'}

TICKET B
  Presidente:      ${ticketB.president}
  Vicepresidente:  ${ticketB.vice}
  Etichetta scelta dall'utente: ${ticketB.party || '(nessuna: deducila tu)'}
${extra}
Unità del Collegio Elettorale da valutare (sigla, nome, grandi elettori, margine presidenziale 2024 con segno positivo = Democratici):

${board}

Produci l'analisi completa nel formato richiesto. Il margine positivo indica un vantaggio del TICKET A, indipendentemente da quale sia il suo schieramento.`;
}

function fmt(value) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

export function hasApiKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/**
 * Chiede a Claude l'analisi dell'elezione ipotetica.
 * @returns {Promise<{analysis: object, usage: object, model: string}>}
 */
export async function analyzeElection(input) {
  const client = new Anthropic();

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: ANALYSIS_SCHEMA },
    },
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    const detail = message.stop_details?.explanation ?? 'nessun dettaglio disponibile';
    throw new Error(`Il modello ha rifiutato di generare questa simulazione: ${detail}`);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Risposta troncata dal limite di token: riprova con meno contesto aggiuntivo.');
  }

  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  let analysis;
  try {
    analysis = JSON.parse(text);
  } catch {
    throw new Error('Il modello non ha restituito un JSON valido.');
  }

  return {
    analysis,
    model: message.model,
    usage: {
      input_tokens: message.usage?.input_tokens ?? 0,
      output_tokens: message.usage?.output_tokens ?? 0,
    },
  };
}
