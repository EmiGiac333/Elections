import test from 'node:test';
import assert from 'node:assert/strict';

import { UNITS, TOTAL_EV, MAJORITY, POPULAR_WEIGHT } from '../src/states.js';
import { runSimulation, hashSeed } from '../src/simulation.js';
import { offlineAnalysis } from '../src/offline.js';
import { validateInput, normalizeEstimates } from '../server.js';
import { PROFILE_SCHEMA, buildStatesSchema, UNIT_CODES } from '../src/schema.js';

test('il collegio elettorale somma a 538 e la maggioranza è 270', () => {
  assert.equal(TOTAL_EV, 538);
  assert.equal(MAJORITY, 270);
});

test('le 56 unità sono uniche e occupano celle distinte della mappa', () => {
  assert.equal(UNITS.length, 56);
  const codes = new Set(UNITS.map((u) => u.code));
  assert.equal(codes.size, 56);

  const cells = UNITS.filter((u) => u.grid).map((u) => u.grid.join(','));
  assert.equal(new Set(cells).size, cells.length);
  assert.equal(cells.length, 51); // 50 stati + DC sulla mappa, i 5 distretti a parte
});

test('Maine e Nebraska pesano per intero nel voto popolare', () => {
  assert.equal(POPULAR_WEIGHT.ME, 4);
  assert.equal(POPULAR_WEIGHT.NE, 5);
  assert.equal(POPULAR_WEIGHT['ME-02'], 0);
  const totale = Object.values(POPULAR_WEIGHT).reduce((s, w) => s + w, 0);
  assert.equal(totale, 538);
});

test('una valanga verso il ticket A produce una vittoria quasi certa', () => {
  const estimates = UNITS.map((u) => ({ code: u.code, margin: u.lean + 30, uncertainty: 3 }));
  const sim = runSimulation(estimates, { iterations: 2000, seed: 1 });
  assert.ok(sim.probA > 0.99, `probabilità troppo bassa: ${sim.probA}`);
  assert.ok(sim.meanEvA > 400);
});

test('la simulazione è riproducibile a parità di seme e cambia con semi diversi', () => {
  const estimates = UNITS.map((u) => ({ code: u.code, margin: u.lean, uncertainty: 4 }));
  const a = runSimulation(estimates, { iterations: 1500, seed: 42 });
  const b = runSimulation(estimates, { iterations: 1500, seed: 42 });
  const c = runSimulation(estimates, { iterations: 1500, seed: 43 });
  assert.equal(a.probA, b.probA);
  assert.notEqual(a.probA, c.probA);
});

test('probabilità e distribuzione sono coerenti', () => {
  const estimates = UNITS.map((u) => ({ code: u.code, margin: u.lean, uncertainty: 4 }));
  const sim = runSimulation(estimates, { iterations: 3000, seed: 7 });

  assert.ok(Math.abs(sim.probA + sim.probB + sim.probTie - 1) < 1e-9);
  const massa = sim.evDistribution.reduce((s, d) => s + d.p, 0);
  assert.ok(Math.abs(massa - 1) < 1e-9);
  assert.ok(sim.evDistribution.every((d) => d.ev >= 0 && d.ev <= 538));
  assert.equal(sim.states.length, 56);
  assert.ok(sim.states.every((s) => s.probA >= 0 && s.probA <= 1));
});

test('una corsa in bilico non produce mai certezze', () => {
  const estimates = UNITS.map((u) => ({ code: u.code, margin: u.lean, uncertainty: 5 }));
  const sim = runSimulation(estimates, { iterations: 4000, seed: 99 });
  assert.ok(sim.probA > 0.05 && sim.probA < 0.95, `corsa non competitiva: ${sim.probA}`);
  assert.ok(sim.tippingPoints.length > 0);
});

test('le stime mancanti ricadono sulla base storica dello stato', () => {
  const sim = runSimulation([{ code: 'PA', margin: 12, uncertainty: 2 }], {
    iterations: 500,
    seed: 3,
  });
  const pa = sim.states.find((s) => s.code === 'PA');
  const tx = sim.states.find((s) => s.code === 'TX');
  assert.equal(pa.expectedMargin, 12);
  assert.equal(tx.expectedMargin, -13.7);
});

test('normalizeEstimates scarta codici sconosciuti e duplicati', () => {
  const estimates = normalizeEstimates([
    { code: 'pa', margine_a: 3, incertezza: 2 },
    { code: 'PA', margine_a: 9, incertezza: 2 },
    { code: 'ZZ', margine_a: 5, incertezza: 2 },
    { code: 'NE-02', margine_a: -1, incertezza: 3 },
  ]);
  assert.deepEqual(
    estimates.map((e) => e.code),
    ['PA', 'NE-02'],
  );
  assert.equal(estimates[0].margin, 3);
});

test('validateInput normalizza i parametri e rifiuta gli input incompleti', () => {
  const input = validateInput({
    ticketA: { president: '  Taylor   Swift ', vice: 'Tom Hanks' },
    ticketB: { president: 'Elon Musk', vice: 'Dwayne Johnson' },
    iterations: 999999,
    year: 1200,
  });
  assert.equal(input.ticketA.president, 'Taylor Swift');
  assert.equal(input.iterations, 100000);
  assert.equal(input.year, 2028);
  assert.ok(Number.isInteger(input.seed));

  assert.throws(() =>
    validateInput({ ticketA: { president: 'A', vice: '' }, ticketB: { president: 'B', vice: 'C' } }),
  );
  assert.throws(() =>
    validateInput({
      ticketA: { president: 'A', vice: 'B' },
      ticketB: { president: 'A', vice: 'B' },
    }),
  );
});

test("il seme deriva dai nomi ed è stabile", () => {
  const args = {
    ticketA: { president: 'A', vice: 'B' },
    ticketB: { president: 'C', vice: 'D' },
  };
  assert.equal(validateInput(args).seed, validateInput(args).seed);
  assert.notEqual(hashSeed('A|B|C|D|'), hashSeed('C|D|A|B|'));
});

test("l'analisi dimostrativa copre tutte le unità e resta deterministica", () => {
  const input = {
    ticketA: { president: 'Taylor Swift', vice: 'Tom Hanks', party: '' },
    ticketB: { president: 'Elon Musk', vice: 'Dwayne Johnson', party: '' },
    scenario: '',
    year: 2028,
  };
  const uno = offlineAnalysis(input);
  const due = offlineAnalysis(input);

  assert.equal(uno.stati.length, 56);
  assert.deepEqual(uno.stati, due.stati);
  assert.ok(uno.stati.every((s) => Number.isFinite(s.margine_a) && s.incertezza > 0));

  const somma = uno.nazionale.voto_a + uno.nazionale.voto_b + uno.nazionale.voto_altri;
  assert.ok(Math.abs(somma - 100) < 0.2, `le percentuali non sommano a 100: ${somma}`);
});

test("l'etichetta di partito orienta il modello dimostrativo", () => {
  const base = {
    ticketA: { president: 'Persona Uno', vice: 'Persona Due', party: 'Democratici' },
    ticketB: { president: 'Persona Tre', vice: 'Persona Quattro', party: 'Repubblicani' },
    scenario: '',
    year: 2028,
  };
  const stati = offlineAnalysis(base).stati;
  const ca = stati.find((s) => s.code === 'CA');
  const wy = stati.find((s) => s.code === 'WY');
  assert.ok(ca.margine_a > wy.margine_a, 'la California deve restare più favorevole del Wyoming');
});

test('lo schema di un blocco ammette solo le sigle di quel blocco', () => {
  assert.equal(UNIT_CODES.length, 56);
  const codes = ['PA', 'MI', 'WI'];
  const schema = buildStatesSchema(codes);
  assert.deepEqual(schema.properties.stati.items.properties.code.enum, codes);
  assert.deepEqual(schema.properties.stati.items.required, [
    'code',
    'margine_a',
    'incertezza',
    'reazione',
  ]);
});

test('ogni oggetto degli schemi dichiara required e additionalProperties', () => {
  // Gli structured output accettano solo oggetti chiusi: se un ramo se ne
  // dimentica, la richiesta fallirebbe solo a runtime, con il modello attivo.
  const visita = (node, percorso) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false, `additionalProperties mancante in ${percorso}`);
      assert.deepEqual(
        [...(node.required ?? [])].sort(),
        Object.keys(node.properties ?? {}).sort(),
        `required incompleto in ${percorso}`,
      );
      for (const [key, child] of Object.entries(node.properties ?? {})) {
        visita(child, `${percorso}.${key}`);
      }
    }
    if (node.type === 'array') visita(node.items, `${percorso}[]`);
  };
  visita(PROFILE_SCHEMA, 'profilo');
  visita(buildStatesSchema(['PA', 'MI']), 'collegi');
});
