import test from 'node:test';
import assert from 'node:assert/strict';

import { PROVIDERS, resolveProvider, providerCatalog } from '../src/providers.js';
import { parseJsonLoose } from '../src/llm.js';

test('senza nessuna chiave si ripiega sul modello locale, che è gratuito', () => {
  const target = resolveProvider({});
  assert.equal(target.provider.id, 'ollama');
  assert.equal(target.provider.free, true);
  assert.equal(target.apiKey, null);
  assert.equal(target.model, PROVIDERS.ollama.defaultModel);
});

test('il rilevamento automatico preferisce i provider gratuiti a quelli a pagamento', () => {
  const target = resolveProvider({ ANTHROPIC_API_KEY: 'x', GROQ_API_KEY: 'y' });
  assert.equal(target.provider.id, 'groq');
  assert.equal(target.provider.free, true);
});

test('AI_PROVIDER e AI_MODEL hanno la precedenza sul rilevamento', () => {
  const target = resolveProvider({
    AI_PROVIDER: 'openrouter',
    AI_MODEL: 'qualche/modello:free',
    OPENROUTER_API_KEY: 'k',
    GROQ_API_KEY: 'ignorata',
  });
  assert.equal(target.provider.id, 'openrouter');
  assert.equal(target.model, 'qualche/modello:free');
  assert.equal(target.apiKey, 'k');
});

test('un AI_PROVIDER sconosciuto fallisce elencando quelli validi', () => {
  assert.throws(
    () => resolveProvider({ AI_PROVIDER: 'inesistente' }),
    /ollama.*groq.*openrouter/s,
  );
});

test('la dimensione dei blocchi è quella del provider, salvo AI_STATE_CHUNK', () => {
  assert.equal(resolveProvider({}).chunk, PROVIDERS.ollama.chunk);
  assert.equal(resolveProvider({ AI_STATE_CHUNK: '4' }).chunk, 4);
  assert.equal(resolveProvider({ AI_STATE_CHUNK: '0' }).chunk, PROVIDERS.ollama.chunk);
  assert.equal(resolveProvider({ AI_STATE_CHUNK: '900' }).chunk, 56);
});

test("l'URL di base è sovrascrivibile, per esempio un Ollama su un'altra macchina", () => {
  const target = resolveProvider({ AI_PROVIDER: 'ollama', OLLAMA_URL: 'http://192.168.1.9:11434' });
  assert.equal(target.baseUrl, 'http://192.168.1.9:11434');
});

test('il catalogo non espone mai le chiavi, solo il nome della variabile', () => {
  const catalogo = providerCatalog();
  assert.ok(catalogo.length >= 4);
  assert.ok(catalogo.filter((p) => p.free).length >= 4);
  for (const p of catalogo) {
    assert.ok(!('apiKey' in p));
    assert.ok(typeof p.setup === 'string' && p.setup.length > 0);
  }
});

test('parseJsonLoose legge un JSON pulito', () => {
  assert.deepEqual(parseJsonLoose('{"a":1}'), { a: 1 });
});

test('parseJsonLoose supera recinti markdown, preamboli e blocchi di ragionamento', () => {
  const risposte = [
    '```json\n{"stati":[{"code":"PA"}]}\n```',
    'Ecco il risultato richiesto:\n{"stati":[{"code":"PA"}]}\nSpero sia utile!',
    '<think>ragiono un attimo</think>\n{"stati":[{"code":"PA"}]}',
  ];
  for (const risposta of risposte) {
    assert.deepEqual(parseJsonLoose(risposta), { stati: [{ code: 'PA' }] });
  }
});

test('parseJsonLoose non si fa ingannare dalle parentesi dentro le stringhe', () => {
  const testo = 'nota\n{"reazione":"un testo con } e { dentro","code":"MI"}\ncoda';
  assert.deepEqual(parseJsonLoose(testo), {
    reazione: 'un testo con } e { dentro',
    code: 'MI',
  });
});

test('parseJsonLoose segnala risposte vuote o troncate invece di restituire dati falsi', () => {
  assert.throws(() => parseJsonLoose(''), /vuota/);
  assert.throws(() => parseJsonLoose('nessun json qui'), /nessun oggetto JSON/);
  assert.throws(() => parseJsonLoose('{"stati":[{"code":"PA"'), /interrompe a metà/);
});
