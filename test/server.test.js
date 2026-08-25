import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { server } from '../server.js';

let base;

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

/** Legge una risposta NDJSON e restituisce le righe già decodificate. */
async function ndjson(payload) {
  const res = await fetch(`${base}/api/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return {
    status: res.status,
    lines: res.ok ? text.trim().split('\n').map((l) => JSON.parse(l)) : [],
    body: res.ok ? null : JSON.parse(text),
  };
}

test('/api/health risponde ok: è il controllo usato dai servizi di hosting', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(Number.isInteger(body.uptime));
});

test('/api/meta descrive i collegi e il provider senza esporre chiavi', async () => {
  const meta = await (await fetch(`${base}/api/meta`)).json();
  assert.equal(meta.units.length, 56);
  assert.equal(meta.totalEv, 538);
  assert.equal(meta.majority, 270);
  assert.ok(meta.provider.label);
  assert.ok(meta.catalog.some((p) => p.free));
  assert.equal(JSON.stringify(meta).includes('apiKey"'), false);
});

test('la pagina viene servita e i percorsi fuori da public sono negati', async () => {
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);

  const fuori = await fetch(`${base}/../server.js`);
  assert.equal(fuori.status, 404);
});

test('gli input non validi falliscono prima di aprire il flusso', async () => {
  const res = await ndjson({ ticketA: { president: 'A', vice: '' }, ticketB: {} });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /vicepresidente/i);
});

test('la modalità dimostrativa produce un risultato completo senza nessun modello', async () => {
  const res = await ndjson({
    ticketA: { president: 'Taylor Swift', vice: 'Tom Hanks' },
    ticketB: { president: 'Elon Musk', vice: 'Dwayne Johnson' },
    iterations: 1000,
    mode: 'demo',
  });

  assert.equal(res.status, 200);
  const result = res.lines.find((l) => l.type === 'result');
  assert.ok(result, 'manca la riga di risultato');
  assert.equal(result.mode, 'demo');
  assert.equal(result.coverage.missing.length, 0);
  assert.equal(result.simulation.states.length, 56);
  assert.ok(Math.abs(result.simulation.probA + result.simulation.probB + result.simulation.probTie - 1) < 1e-9);
  assert.ok(res.lines.some((l) => l.type === 'progress'));
});
