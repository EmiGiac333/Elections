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
import { buildSimulationResult, normalizeEstimates } from './src/result.js';
import { validateInput } from './src/input.js';
import { analyzeElection } from './src/ai.js';
import { ollamaModels } from './src/llm.js';
import { offlineAnalysis } from './src/offline.js';
import { resolveProvider, providerCatalog } from './src/providers.js';

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
    if (req.method === 'GET' && req.url === '/api/health') {
      return sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
    }

    if (req.method === 'GET' && req.url === '/api/meta') {
      return sendJson(res, 200, {
        units: UNITS,
        totalEv: TOTAL_EV,
        majority: MAJORITY,
        battlegrounds: CORE_BATTLEGROUNDS,
        provider: await activeProvider({ probe: true }),
        catalog: providerCatalog(),
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

/**
 * Restituisce un flusso NDJSON: prima le righe di avanzamento, poi il risultato.
 * Con un modello locale l'analisi può durare minuti e l'attesa va raccontata.
 */
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

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  });
  const send = (line) => res.write(`${JSON.stringify(line)}\n`);

  // I proxy dei servizi di hosting chiudono le connessioni che restano mute
  // troppo a lungo, e fra un blocco di collegi e l'altro il modello può
  // impiegarci minuti: una riga di battito tiene viva la risposta.
  const heartbeat = setInterval(() => send({ type: 'ping', at: Date.now() }), 15000);
  heartbeat.unref?.();
  res.on('close', () => clearInterval(heartbeat));

  const startedAt = Date.now();
  const wantsDemo = payload?.mode === 'demo' || process.env.AI_PROVIDER === 'demo';

  let analysis;
  let mode;
  let usage = null;
  let model = null;
  let provider = null;
  let failures = [];

  if (wantsDemo) {
    analysis = offlineAnalysis(input);
    mode = 'demo';
  } else {
    try {
      const result = await analyzeElection(input, (phase) => send({ type: 'progress', ...phase }));
      analysis = result.analysis;
      usage = result.usage;
      model = result.model;
      provider = result.provider;
      failures = result.failures;
      mode = 'ai';
    } catch (error) {
      console.error('Analisi con il modello fallita:', error);
      clearInterval(heartbeat);
      send({ type: 'error', error: error.message, canFallback: true });
      return res.end();
    }
  }

  send({ type: 'progress', step: 0, total: 0, label: 'Simulazione delle elezioni' });

  const result = buildSimulationResult({
    input,
    analysis,
    mode,
    model,
    provider: provider ?? (await activeProvider()),
    usage,
    failures,
    elapsedMs: Date.now() - startedAt,
  });

  if (result.coverage.missing.length) {
    console.warn(
      `Collegi non stimati dal modello (uso la base storica): ${result.coverage.missing.join(', ')}`,
    );
  }

  send(result);
  clearInterval(heartbeat);
  res.end();
}

/**
 * Descrizione del provider attivo, senza mai esporre le chiavi.
 *
 * Con `probe` viene anche verificato che il modello risponda davvero: per un
 * modello locale avere la configurazione giusta non basta, il processo deve
 * essere acceso. È quello che permette alla pagina di dire "server pronto"
 * soltanto quando lo è per davvero.
 */
async function activeProvider({ probe = false } = {}) {
  try {
    const target = resolveProvider();
    const needsKey = Boolean(target.provider.apiKeyEnv && !target.apiKey);

    let ready = !needsKey;
    if (probe && ready && target.provider.kind === 'ollama') {
      const installed = await ollamaModels(target.baseUrl);
      ready = Array.isArray(installed) && installed.length > 0;
    }

    return {
      id: target.provider.id,
      label: target.provider.label,
      free: target.provider.free,
      cost: target.provider.cost,
      model: target.model,
      reason: target.reason,
      needsKey,
      ready,
      apiKeyEnv: target.provider.apiKeyEnv,
      setup: target.provider.setup,
    };
  } catch (error) {
    return { id: null, label: 'nessuno', free: true, ready: false, error: error.message };
  }
}


const SRC_DIR = path.join(ROOT, 'src');

/**
 * Serve la pagina da public/ e, in più, i moduli condivisi di src/: quando il
 * modello gira nel browser, è la pagina stessa a eseguire simulazione e
 * orchestrazione, quindi deve poter importare quei file. Fuori da queste due
 * cartelle non si serve nulla.
 */
async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');

  const dentroSrc = relative === 'src' || relative.startsWith('src/');
  const base = dentroSrc ? SRC_DIR : PUBLIC_DIR;
  const target = path.resolve(base, dentroSrc ? relative.slice('src/'.length) : relative);

  if (!target.startsWith(base + path.sep) && target !== base) {
    return sendJson(res, 403, { error: 'Percorso non consentito' });
  }

  // Da src/ escono solo moduli JavaScript, mai altro.
  if (dentroSrc && path.extname(target) !== '.js') {
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
  server.listen(PORT, async () => {
    const active = await activeProvider();
    const modeLabel = active.id
      ? `${active.label} · modello ${active.model} (${active.cost})`
      : `nessun provider disponibile: ${active.error}`;
    console.log(`Simulatore elezioni USA in ascolto su http://localhost:${PORT}`);
    console.log(`Provider attivo: ${modeLabel} — ${active.reason ?? ''}`);
    if (active.needsKey) {
      console.log(`Attenzione: manca ${active.apiKeyEnv}. ${active.setup}`);
    }
  });

  // I servizi di hosting mandano SIGTERM prima di sostituire un'istanza:
  // chiudere con ordine evita risposte troncate a metà.
  for (const segnale of ['SIGTERM', 'SIGINT']) {
    process.on(segnale, () => {
      console.log(`Ricevuto ${segnale}, chiudo il server.`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 10000).unref();
    });
  }
}

export { server };
export { normalizeEstimates } from './src/result.js';
export { validateInput } from './src/input.js';
