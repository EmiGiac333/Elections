/**
 * Assemblaggio del risultato finale.
 *
 * Sta qui, e non nel server, perché lo usano in due: il server quando il
 * modello è remoto, e la pagina quando il modello gira nel browser. Il formato
 * del risultato deve essere identico nei due casi, altrimenti l'interfaccia
 * dovrebbe conoscere la differenza.
 */

import { UNITS, TOTAL_EV, MAJORITY } from './states.js';
import { runSimulation } from './simulation.js';

/** Riporta le stime del modello nella forma attesa dal motore di simulazione. */
export function normalizeEstimates(stati) {
  if (!Array.isArray(stati)) return [];
  const valid = new Set(UNITS.map((u) => u.code));
  const seen = new Set();
  const estimates = [];

  for (const entry of stati) {
    const code = typeof entry?.code === 'string' ? entry.code.trim().toUpperCase() : '';
    if (!valid.has(code) || seen.has(code)) continue;
    seen.add(code);
    estimates.push({
      code,
      margin: Number(entry.margine_a),
      uncertainty: Number(entry.incertezza),
    });
  }
  return estimates;
}

function nationalMarginFrom(nazionale) {
  const a = Number(nazionale?.voto_a);
  const b = Number(nazionale?.voto_b);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a - b;
}

/**
 * Trasforma l'analisi del modello nel risultato completo mostrato in pagina.
 *
 * @param {object} args
 * @param {object} args.input      dati del modulo già validati
 * @param {object} args.analysis   output del modello (o della modalità dimostrativa)
 * @param {'ai'|'demo'} args.mode
 */
export function buildSimulationResult({
  input,
  analysis,
  mode,
  model = null,
  provider = null,
  usage = null,
  failures = [],
  elapsedMs = 0,
}) {
  const estimates = normalizeEstimates(analysis.stati);

  const simulation = runSimulation(estimates, {
    iterations: input.iterations,
    seed: input.seed,
    nationalMargin: nationalMarginFrom(analysis.nazionale),
  });

  const reactions = Object.fromEntries(
    (analysis.stati ?? []).map((s) => [s.code, s.reazione]).filter(([code]) => code),
  );

  // Se il modello salta qualche collegio, quel collegio ricade sulla base
  // storica: lo si dichiara invece di far finta che l'analisi fosse completa.
  const received = new Set(estimates.map((e) => e.code));
  const missing = UNITS.filter((u) => !received.has(u.code)).map((u) => u.code);

  return {
    type: 'result',
    mode,
    model,
    provider,
    usage,
    failures,
    coverage: { expected: UNITS.length, received: estimates.length, missing },
    elapsedMs,
    input,
    analysis,
    reactions,
    simulation,
    meta: { totalEv: TOTAL_EV, majority: MAJORITY },
  };
}
