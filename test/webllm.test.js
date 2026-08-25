import test from 'node:test';
import assert from 'node:assert/strict';

import { PROVIDERS } from '../src/providers.js';
import { chatJson } from '../src/llm.js';
import { analyzeElection } from '../src/ai.js';
import { buildSimulationResult } from '../src/result.js';
import { validateInput } from '../src/input.js';
import { UNITS } from '../src/states.js';
import { filterModels, suggestModel } from '../src/model-picker.js';

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

test('il catalogo tiene solo i modelli utilizzabili, ordinati per memoria', () => {
  const scelti = filterModels([
    { model_id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', vram_required_MB: 2951 },
    { model_id: 'gemma-2-2b-it-q4f16_1-MLC', vram_required_MB: 1895 },
    { model_id: 'snowflake-arctic-embedding-MLC', vram_required_MB: 500 },
    { model_id: 'DeepSeek-R1-Distill-Qwen-7B-MLC', vram_required_MB: 5106 },
    { model_id: 'Llama-3-70B-Instruct-MLC', vram_required_MB: 40000 },
    { model_id: 'qualcosa-senza-istruzioni-MLC', vram_required_MB: 1200 },
  ]);

  assert.deepEqual(
    scelti.map((m) => m.id),
    ['gemma-2-2b-it-q4f16_1-MLC', 'Llama-3.2-3B-Instruct-q4f16_1-MLC'],
  );
  assert.equal(scelti[0].vramMB, 1895);
});
