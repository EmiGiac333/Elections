/**
 * Motore statistico del simulatore.
 *
 * Il modello di IA fornisce, per ogni unità del Collegio Elettorale, un margine
 * atteso (in punti percentuali, positivo = vantaggio del ticket A) e una
 * incertezza. Qui quelle stime diventano una distribuzione di esiti possibili
 * tramite una simulazione Monte Carlo con errori correlati:
 *
 *   margine_simulato(unità) = margine_atteso
 *                           + elasticità * shock_nazionale
 *                           + shock_regionale
 *                           + shock_locale
 *
 * Lo shock nazionale è condiviso da tutte le unità (è l'errore sistematico dei
 * sondaggi: se un ticket sovraperforma, lo fa quasi ovunque), quello regionale
 * è condiviso dagli stati della stessa macro-area, quello locale è specifico.
 * È questa struttura di correlazione a rendere realistiche le probabilità:
 * senza di essa 56 unità indipendenti darebbero quasi sempre esiti scontati.
 */

import { UNITS, UNIT_BY_CODE, MAJORITY, TOTAL_EV, POPULAR_WEIGHT } from './states.js';

const REGIONS = [...new Set(UNITS.map((u) => u.region))];

/** Generatore pseudo-casuale deterministico (mulberry32): stesso seed, stessa simulazione. */
export function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Estrae da una normale standard con il metodo di Box-Muller. */
function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Hash stabile di una stringa: usato per derivare un seme riproducibile dai nomi. */
export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Esegue la simulazione.
 *
 * @param {Array<{code:string, margin:number, uncertainty:number}>} estimates
 *        stime per unità (margine = A meno B, in punti percentuali)
 * @param {object} options
 * @param {number} [options.iterations=20000]  numero di elezioni simulate
 * @param {number} [options.nationalSigma=2.6] deviazione standard dell'errore nazionale
 * @param {number} [options.regionalSigma=1.4] deviazione standard dell'errore regionale
 * @param {number} [options.seed]              seme per la riproducibilità
 * @param {number|null} [options.nationalMargin] margine atteso nel voto popolare (A - B)
 */
export function runSimulation(estimates, options = {}) {
  const {
    iterations = 20000,
    nationalSigma = 2.6,
    regionalSigma = 1.4,
    seed = 20241105,
    nationalMargin = null,
  } = options;

  const rng = createRng(seed);
  const estimateByCode = new Map(estimates.map((e) => [e.code, e]));

  // Allineo le stime alle unità ufficiali: quel che manca ricade sul lean storico.
  const units = UNITS.map((unit) => {
    const est = estimateByCode.get(unit.code);
    return {
      code: unit.code,
      name: unit.name,
      ev: unit.ev,
      region: unit.region,
      elastic: unit.elastic,
      lean: unit.lean,
      weight: POPULAR_WEIGHT[unit.code] ?? 0,
      margin: clampMargin(est?.margin ?? unit.lean),
      sigma: Math.min(Math.max(Number(est?.uncertainty) || 4, 0.8), 20),
    };
  });

  const n = units.length;
  const popTotalWeight = units.reduce((s, u) => s + u.weight, 0);
  const expectedPopMargin = units.reduce((s, u) => s + u.margin * u.weight, 0) / popTotalWeight;
  // Se il modello dichiara anche un voto popolare nazionale, lo uso per
  // riconciliare la media pesata degli stati con quella stima.
  const popOffset = nationalMargin === null ? 0 : nationalMargin - expectedPopMargin;

  const wins = new Int32Array(n);
  const marginSum = new Float64Array(n);
  const simMargin = new Float64Array(n);
  const order = new Int32Array(n);
  const evHistogram = new Map();
  const tippingPoint = new Map();

  let winsA = 0;
  let winsB = 0;
  let ties = 0;
  let evSumA = 0;
  let popSumA = 0;
  let popWinsA = 0;
  let splitDecision = 0; // vincitore del Collegio diverso dal vincitore del voto popolare

  const regionShock = new Map();

  for (let iter = 0; iter < iterations; iter++) {
    const national = gaussian(rng) * nationalSigma;
    for (const region of REGIONS) regionShock.set(region, gaussian(rng) * regionalSigma);

    let evA = 0;
    let popWeighted = 0;

    for (let i = 0; i < n; i++) {
      const u = units[i];
      const margin =
        u.margin + u.elastic * national + regionShock.get(u.region) + gaussian(rng) * u.sigma;
      simMargin[i] = margin;
      marginSum[i] += margin;
      if (margin > 0) {
        wins[i] += 1;
        evA += u.ev;
      }
      popWeighted += margin * u.weight;
      order[i] = i;
    }

    const popMargin = popWeighted / popTotalWeight + popOffset;
    popSumA += popMargin;
    const popWinnerA = popMargin > 0;
    if (popWinnerA) popWinsA += 1;

    evSumA += evA;
    evHistogram.set(evA, (evHistogram.get(evA) ?? 0) + 1);

    const evB = TOTAL_EV - evA;
    const collegeWinnerA = evA >= MAJORITY;
    const collegeWinnerB = evB >= MAJORITY;
    if (collegeWinnerA) winsA += 1;
    else if (collegeWinnerB) winsB += 1;
    else ties += 1;

    if ((collegeWinnerA || collegeWinnerB) && collegeWinnerA !== popWinnerA) splitDecision += 1;

    if (collegeWinnerA || collegeWinnerB) {
      recordTippingPoint(order, simMargin, units, collegeWinnerA, tippingPoint);
    }
  }

  const states = units.map((u, i) => ({
    code: u.code,
    name: u.name,
    ev: u.ev,
    region: u.region,
    lean: u.lean,
    expectedMargin: round(u.margin, 1),
    meanMargin: round(marginSum[i] / iterations, 1),
    uncertainty: round(u.sigma, 1),
    probA: wins[i] / iterations,
    tippingShare: (tippingPoint.get(u.code) ?? 0) / iterations,
  }));

  return {
    iterations,
    probA: winsA / iterations,
    probB: winsB / iterations,
    probTie: ties / iterations,
    meanEvA: round(evSumA / iterations, 1),
    meanEvB: round(TOTAL_EV - evSumA / iterations, 1),
    popularMarginA: round(popSumA / iterations, 1),
    popularWinProbA: popWinsA / iterations,
    splitDecisionProb: splitDecision / iterations,
    states,
    evDistribution: [...evHistogram.entries()]
      .map(([ev, count]) => ({ ev, p: count / iterations }))
      .sort((a, b) => a.ev - b.ev),
    tippingPoints: [...tippingPoint.entries()]
      .map(([code, count]) => ({
        code,
        name: UNIT_BY_CODE.get(code)?.name ?? code,
        p: count / iterations,
      }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 8),
    closestStates: [...states]
      .sort((a, b) => Math.abs(a.expectedMargin) - Math.abs(b.expectedMargin))
      .slice(0, 10)
      .map((s) => s.code),
  };
}

/**
 * Trova lo "stato decisivo" di una singola simulazione: ordino le unità vinte
 * dal vincitore dalla più larga alla più stretta e prendo quella che gli fa
 * toccare quota 270.
 */
function recordTippingPoint(order, simMargin, units, winnerIsA, tippingPoint) {
  const sorted = Array.prototype.slice.call(order);
  sorted.sort((x, y) => (winnerIsA ? simMargin[y] - simMargin[x] : simMargin[x] - simMargin[y]));
  let running = 0;
  for (const idx of sorted) {
    const goesToWinner = winnerIsA ? simMargin[idx] > 0 : simMargin[idx] < 0;
    if (!goesToWinner) return;
    running += units[idx].ev;
    if (running >= MAJORITY) {
      const code = units[idx].code;
      tippingPoint.set(code, (tippingPoint.get(code) ?? 0) + 1);
      return;
    }
  }
}

function clampMargin(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(Math.max(num, -95), 95);
}

function round(value, digits) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
