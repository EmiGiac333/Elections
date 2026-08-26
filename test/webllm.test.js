import test from 'node:test';
import assert from 'node:assert/strict';

import { PROVIDERS } from '../src/providers.js';
import { chatJson } from '../src/llm.js';
import { analyzeElection } from '../src/ai.js';
import { buildSimulationResult } from '../src/result.js';
import { validateInput } from '../src/input.js';
import { UNITS } from '../src/states.js';
import { filterModels, suggestModel } from '../src/model-picker.js';
import { buildStatesSchema } from '../src/schema.js';

/**
 * Motore finto che parla come WebLLM. Il modello vero gira su WebGPU e i suoi
 * pesi pesano gigabyte: quello che si può provare qui è il codice attorno, cioè
 * come vengono formulate le richieste e come vengono ricomposte le risposte.
 */
function fakeEngine({ dirty = false } = {}) {
  const richieste = [];
  return {
    richieste,
    chat: {
      completions: {
        async create(req) {
          richieste.push(req);
          const schema = JSON.parse(req.response_format.schema);
          const codes = schema.properties?.stati?.items?.properties?.code?.enum;

          const body = codes
            ? {
                stati: codes.map((code, i) => ({
                  code,
                  margine_a: i % 2 === 0 ? 4.5 : -6.25,
                  incertezza: 4,
                  reazione: `Reazione per ${code}.`,
                })),
              }
            : {
                nazionale: { voto_a: 49, voto_b: 47, voto_altri: 4, affluenza: 62, clima: 'Teso.' },
                ticket: [
                  {
                    id: 'A',
                    partito_ipotetico: 'Area progressista',
                    slogan: 'Avanti insieme',
                    coalizione: 'Città e giovani.',
                    punti_di_forza: ['Notorietà'],
                    punti_deboli: ['Nessuna esperienza'],
                    stati_natali: ['pa'],
                  },
                  {
                    id: 'B',
                    partito_ipotetico: 'Area conservatrice',
                    slogan: 'Ricostruire',
                    coalizione: 'Province e imprese.',
                    punti_di_forza: ['Base solida'],
                    punti_deboli: ['Immagine divisiva'],
                    stati_natali: [],
                  },
                ],
                stati_chiave: ['PA', 'MI'],
                racconto: {
                  campagna: 'Lunga.',
                  dibattiti: 'Accesi.',
                  media: 'Ossessiva.',
                  sorpresa_ottobre: 'Uno sciopero.',
                  affluenza_e_demografia: 'Giovani in aumento.',
                  notte_elettorale: 'Lunghissima.',
                },
                titoli_di_giornale: ['Un paese diviso'],
                incognite: [{ titolo: 'Terzo polo', descrizione: 'Sopra il 5%.', impatto: -1.5 }],
              };

          const testo = JSON.stringify(body);
          return {
            choices: [{ message: { content: dirty ? `Ecco:\n\`\`\`json\n${testo}\n\`\`\`` : testo } }],
            usage: { prompt_tokens: 400, completion_tokens: 300 },
          };
        },
      },
    },
  };
}

function browserTarget(engine) {
  return {
    provider: PROVIDERS.webllm,
    model: 'Modello-Finto-MLC',
    baseUrl: null,
    apiKey: null,
    chunk: PROVIDERS.webllm.chunk,
    timeoutMs: 0,
    reason: 'test',
    autoFallback: false,
    engine,
  };
}

const INPUT = validateInput({
  ticketA: { president: 'Taylor Swift', vice: 'Tom Hanks' },
  ticketB: { president: 'Elon Musk', vice: 'Dwayne Johnson' },
  iterations: 1500,
});

test('il dialetto del browser passa lo schema come stringa, non come oggetto', async () => {
  const engine = fakeEngine();
  const risposta = await chatJson({
    target: browserTarget(engine),
    system: 'sistema',
    user: 'richiesta',
    schemaName: 'x',
    schema: { type: 'object', properties: { a: { type: 'number' } } },
  });

  const req = engine.richieste[0];
  assert.equal(req.response_format.type, 'json_object');
  assert.equal(typeof req.response_format.schema, 'string');
  assert.deepEqual(JSON.parse(req.response_format.schema).properties.a, { type: 'number' });
  assert.equal(req.messages[0].role, 'system');
  assert.ok(risposta.usage.output_tokens > 0);
});

test('il provider del browser non richiede nessuna chiave e resta gratuito', () => {
  assert.equal(PROVIDERS.webllm.apiKeyEnv, null);
  assert.equal(PROVIDERS.webllm.free, true);
  assert.equal(PROVIDERS.webllm.browserOnly, true);
});

test('esattamente una fra finestra di contesto e finestra scorrevole è positiva', () => {
  // La libreria rifiuta di avviare il modello se lo sono entrambe, e alcuni
  // modelli le dichiarano entrambe: la scelta va fatta qui, non lasciata al
  // caso. Il controllo vale come promemoria se un domani si toccano i valori.
  const { context_window_size: contesto, sliding_window_size: scorrevole } =
    PROVIDERS.webllm.chatOptions;

  assert.equal([contesto, scorrevole].filter((v) => v > 0).length, 1);
  // Il contesto deve bastare al prompt di un blocco più la sua risposta.
  assert.ok(contesto >= 2048, `finestra di contesto troppo stretta: ${contesto}`);
});

test("l'analisi completa gira sul motore del browser senza toccare la rete", async () => {
  const engine = fakeEngine();
  const fasi = [];
  const { analysis, usage, failures } = await analyzeElection(
    INPUT,
    (f) => fasi.push(f),
    browserTarget(engine),
  );

  // Una richiesta per il profilo più una per ogni blocco di collegi.
  const blocchiAttesi = Math.ceil(UNITS.length / PROVIDERS.webllm.chunk);
  assert.equal(usage.requests, blocchiAttesi + 1);
  assert.equal(failures.length, 0);
  assert.equal(analysis.stati.length, UNITS.length);
  assert.equal(fasi.length, blocchiAttesi + 1);
  assert.equal(fasi.at(-1).total, blocchiAttesi + 1);
});

test('le risposte avvolte in recinti markdown non fanno saltare nessun blocco', async () => {
  const { analysis, failures } = await analyzeElection(
    INPUT,
    () => {},
    browserTarget(fakeEngine({ dirty: true })),
  );
  assert.equal(failures.length, 0);
  assert.equal(analysis.stati.length, UNITS.length);
});

test('un blocco che fallisce non annulla la simulazione', async () => {
  const engine = fakeEngine();
  const originale = engine.chat.completions.create;
  let chiamata = 0;
  engine.chat.completions.create = async (req) => {
    chiamata += 1;
    if (chiamata === 3) throw new Error('memoria video esaurita');
    return originale(req);
  };

  const { analysis, failures } = await analyzeElection(INPUT, () => {}, browserTarget(engine));
  assert.equal(failures.length, 1);
  assert.match(failures[0].message, /memoria video/);

  const result = buildSimulationResult({ input: INPUT, analysis, mode: 'ai' });
  assert.equal(result.coverage.missing.length, PROVIDERS.webllm.chunk);
  assert.equal(result.simulation.states.length, UNITS.length); // i mancanti usano la base storica
});

test("l'interruzione ferma la simulazione fra un blocco e l'altro", async () => {
  const engine = fakeEngine();
  const annulla = new AbortController();
  const originale = engine.chat.completions.create;
  let chiamate = 0;
  engine.chat.completions.create = async (req) => {
    chiamate += 1;
    if (chiamate === 2) annulla.abort(); // l'utente preme "Interrompi"
    return originale(req);
  };

  await assert.rejects(
    () => analyzeElection(INPUT, () => {}, browserTarget(engine), { signal: annulla.signal }),
    /interrotta/i,
  );
  // Il blocco in corso finisce, ma i successivi non partono: su un dispositivo
  // lento sono minuti risparmiati.
  assert.ok(chiamate < 5, `troppe richieste dopo l'interruzione: ${chiamate}`);
});

test("un'interruzione chiesta prima di iniziare non lancia nessuna richiesta", async () => {
  const engine = fakeEngine();
  const annulla = new AbortController();
  annulla.abort();

  await assert.rejects(
    () => analyzeElection(INPUT, () => {}, browserTarget(engine), { signal: annulla.signal }),
    /interrotta/i,
  );
  assert.equal(engine.richieste.length, 0);
});

test('il dialetto nativo chiede la forma nel prompt, non alla grammatica', async () => {
  // Il motore nativo non vincola l'uscita: la forma va chiesta a parole e poi
  // verificata dal parser tollerante.
  const richieste = [];
  const target = {
    ...browserTarget(null),
    provider: PROVIDERS.native,
    generate: async (req) => {
      richieste.push(req);
      return 'Ecco il risultato:\n```json\n{"stati":[{"code":"PA","margine_a":2,"incertezza":4,"reazione":"x"}]}\n```';
    },
  };

  const risposta = await chatJson({
    target,
    system: 'sistema',
    user: 'analizza PA',
    schemaName: 'stime',
    schema: buildStatesSchema(['PA']),
  });

  assert.equal(risposta.data.stati[0].code, 'PA');

  const prompt = richieste[0].user;
  assert.match(prompt, /analizza PA/);
  assert.match(prompt, /SOLO con un oggetto JSON valido/);
  // Lo scheletro deve nominare i campi attesi senza riversare tutto lo schema,
  // che su un telefono occuperebbe metà del contesto.
  assert.match(prompt, /"margine_a": 0/);
  assert.match(prompt, /"reazione": "testo"/);
  assert.ok(prompt.length < 2000, `istruzioni di formato troppo lunghe: ${prompt.length}`);
});

test('il provider nativo è gratuito e vive solo dentro l\'app', () => {
  assert.equal(PROVIDERS.native.apiKeyEnv, null);
  assert.equal(PROVIDERS.native.free, true);
  assert.equal(PROVIDERS.native.browserOnly, true);
  assert.equal(PROVIDERS.native.kind, 'native');
});

test('il risultato del browser ha la stessa forma di quello del server', async () => {
  const { analysis, model, usage } = await analyzeElection(
    INPUT,
    () => {},
    browserTarget(fakeEngine()),
  );
  const result = buildSimulationResult({ input: INPUT, analysis, mode: 'ai', model, usage });

  assert.equal(result.type, 'result');
  assert.equal(result.coverage.received, UNITS.length);
  assert.equal(result.simulation.states.length, UNITS.length);
  assert.equal(result.meta.totalEv, 538);
  assert.ok(result.reactions.PA);
  assert.ok(Math.abs(result.simulation.probA + result.simulation.probB + result.simulation.probTie - 1) < 1e-9);
});

test('la scelta automatica del modello preferisce il più grande che sta sotto i 3 GB', () => {
  const modelli = [
    { id: 'piccolo', vramMB: 900 },
    { id: 'medio', vramMB: 2800 },
    { id: 'grande', vramMB: 5200 },
  ];
  assert.equal(suggestModel(modelli), 'medio');
  assert.equal(suggestModel([{ id: 'enorme', vramMB: 5800 }]), 'enorme');
  assert.equal(suggestModel([]), '');
});

test('su un dispositivo compatto si prende il modello più piccolo, non il migliore', () => {
  const modelli = [
    { id: 'piccolo', vramMB: 900 },
    { id: 'medio', vramMB: 2800 },
    { id: 'grande', vramMB: 5200 },
  ];
  assert.equal(suggestModel(modelli, { compact: true }), 'piccolo');
  assert.equal(suggestModel([], { compact: true }), '');
});

test('il catalogo scarta le trappole del listino, non solo i modelli grandi', () => {
  const scelti = filterModels([
    { model_id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', vram_required_MB: 2505 },
    { model_id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', vram_required_MB: 879 },
    // Contesto da 1024 token: il prompt di un blocco non ci starebbe.
    { model_id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC-1k', vram_required_MB: 2264 },
    // Famiglia del 2023: per dimensione vincerebbe, per qualità è la peggiore.
    { model_id: 'RedPajama-INCITE-Chat-3B-v1-q4f16_1-MLC', vram_required_MB: 2041 },
    { model_id: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC', vram_required_MB: 697 },
    // Specializzati o con vista: peso in più senza vantaggio qui.
    { model_id: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC', vram_required_MB: 2505 },
    { model_id: 'Phi-3.5-vision-instruct-q4f16_1-MLC', vram_required_MB: 3952 },
    // Stessa rete, quantizzazione più pesante: sarebbe un doppione nel menù.
    { model_id: 'Qwen2.5-3B-Instruct-q4f32_1-MLC', vram_required_MB: 3200 },
    // Troppo grande per una scheda comune.
    { model_id: 'Llama-3.1-70B-Instruct-q4f16_1-MLC', vram_required_MB: 40000 },
  ]);

  assert.deepEqual(
    scelti.map((m) => m.id),
    ['Llama-3.2-1B-Instruct-q4f16_1-MLC', 'Qwen2.5-3B-Instruct-q4f16_1-MLC'],
  );
  assert.equal(scelti[1].etichetta, 'Qwen2.5-3B');
});

test("il predefinito non è il più piccolo utile né il più grande possibile", () => {
  const catalogo = filterModels([
    { model_id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', vram_required_MB: 376 },
    { model_id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', vram_required_MB: 879 },
    { model_id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', vram_required_MB: 2505 },
    { model_id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', vram_required_MB: 5001 },
  ]);

  // Su un computer: il più capace che sta sotto i 3 GB.
  assert.equal(suggestModel(catalogo), 'Qwen2.5-3B-Instruct-q4f16_1-MLC');
  // Su un telefono: il più piccolo che abbia ancora senso, non il minuscolo.
  assert.equal(suggestModel(catalogo, { compact: true }), 'Llama-3.2-1B-Instruct-q4f16_1-MLC');
});
