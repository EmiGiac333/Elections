/**
 * Server del simulatore: serve l'interfaccia statica ed espone /api/simulate.
 * Nessuna dipendenza web esterna, solo il modulo http di Node.
 */

import './src/env.js'; // deve stare per primo: popola process.env prima degli altri moduli

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { UNITS, TOTAL_EV, MAJORITY, CORE_BATTLEGROUNDS } from './src/states.js';
import { runSimulation, hashSeed } from './src/simulation.js';
import { analyzeElection, hasApiKey, MODEL } from './src/ai.js';
import { offlineAnalysis } from './src/offline.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT ?? 3000);
const MAX_BODY = 64 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/meta') {
      return sendJson(res, 200, {
        units: UNITS,
        totalEv: TOTAL_EV,
        majority: MAJORITY,
        battlegrounds: CORE_BATTLEGROUNDS,
        aiEnabled: hasApiKey(),
        model: MODEL,
      });
    }

    if (req.method === 'POST' && req.url === '/api/simulate') {
      return await handleSimulate(req, res);
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      return await serveStatic(req, res);
    }

    sendJson(res, 405, { error: 'Metodo non consentito' });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { error: 'Errore interno del server' });
    else res.end();
  }
});

async function handleSimulate(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  let input;
  try {
    input = validateInput(payload);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const startedAt = Date.now();
  let analysis;
  let mode;
  let usage = null;
  let model = null;

  if (hasApiKey()) {
    try {
      const result = await analyzeElection(input);
      analysis = result.analysis;
      usage = result.usage;
      model = result.model;
      mode = 'ai';
    } catch (error) {
      console.error('Analisi con il modello fallita:', error);
      return sendJson(res, 502, {
        error: `Il modello non è riuscito a produrre l'analisi: ${error.message}`,
      });
    }
  } else {
    analysis = offlineAnalysis(input);
    mode = 'demo';
  }

  const estimates = normalizeEstimates(analysis.stati);
  const nationalMargin = nationalMarginFrom(analysis.nazionale);

  const simulation = runSimulation(estimates, {
    iterations: input.iterations,
    seed: input.seed,
    nationalMargin,
  });

  const reactions = Object.fromEntries(
    (analysis.stati ?? []).map((s) => [s.code, s.reazione]).filter(([code]) => code),
  );

  // Se il modello salta qualche collegio, quel collegio ricade sulla base storica:
  // lo dichiaro invece di far finta che l'analisi fosse completa.
  const missing = UNITS.filter((u) => !estimates.some((e) => e.code === u.code)).map((u) => u.code);
  if (missing.length) {
    console.warn(`Collegi non stimati dal modello (uso la base storica): ${missing.join(', ')}`);
  }

  sendJson(res, 200, {
    mode,
    model,
    usage,
    coverage: { expected: UNITS.length, received: estimates.length, missing },
    elapsedMs: Date.now() - startedAt,
    input,
    analysis,
    reactions,
    simulation,
    meta: { totalEv: TOTAL_EV, majority: MAJORITY },
  });
}

function validateInput(payload) {
  const ticketA = validateTicket(payload?.ticketA, 'Ticket A');
  const ticketB = validateTicket(payload?.ticketB, 'Ticket B');

  const sameTicket =
    ticketA.president.toLowerCase() === ticketB.president.toLowerCase() &&
    ticketA.vice.toLowerCase() === ticketB.vice.toLowerCase();
  if (sameTicket) throw new Error('I due ticket devono essere diversi.');

  const year = Number(payload?.year);
  const iterations = Number(payload?.iterations);
  const scenario = typeof payload?.scenario === 'string' ? payload.scenario.slice(0, 1200) : '';

  return {
    ticketA,
    ticketB,
    scenario,
    year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : 2028,
    iterations: Number.isFinite(iterations)
      ? Math.min(Math.max(Math.round(iterations), 1000), 100000)
      : 20000,
    seed:
      Number.isFinite(Number(payload?.seed)) && payload?.seed !== '' && payload?.seed !== null
        ? Math.abs(Math.round(Number(payload.seed))) >>> 0
        : hashSeed(
            `${ticketA.president}|${ticketA.vice}|${ticketB.president}|${ticketB.vice}|${scenario}`,
          ),
  };
}

function validateTicket(ticket, label) {
  const president = cleanName(ticket?.president);
  const vice = cleanName(ticket?.vice);
  if (!president) throw new Error(`${label}: manca il nome del candidato presidente.`);
  if (!vice) throw new Error(`${label}: manca il nome del candidato vicepresidente.`);
  if (president.toLowerCase() === vice.toLowerCase()) {
    throw new Error(`${label}: presidente e vicepresidente devono essere due persone diverse.`);
  }
  return {
    president,
    vice,
    party: typeof ticket?.party === 'string' ? ticket.party.trim().slice(0, 60) : '',
  };
}

function cleanName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** Riporta le stime del modello nella forma attesa dal motore di simulazione. */
function normalizeEstimates(stati) {
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

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const target = path.resolve(PUBLIC_DIR, relative);

  if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== PUBLIC_DIR) {
    return sendJson(res, 403, { error: 'Percorso non consentito' });
  }

  try {
    const data = await fs.readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Pagina non trovata');
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Richiesta troppo grande.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('Corpo della richiesta non valido: atteso JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

// Avvia l'ascolto solo quando il file è eseguito direttamente: importarlo da un
// test non deve occupare la porta.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    const modeLabel = hasApiKey()
      ? `analisi con ${MODEL}`
      : "MODALITÀ DIMOSTRATIVA (nessuna ANTHROPIC_API_KEY: i risultati non sono un'analisi)";
    console.log(`Simulatore elezioni USA in ascolto su http://localhost:${PORT} — ${modeLabel}`);
  });
}

export { server, validateInput, normalizeEstimates };
