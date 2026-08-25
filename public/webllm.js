/**
 * Gestione del modello che gira nel browser di chi apre la pagina.
 *
 * Nessuna API, nessuna chiave, nessun account: la libreria scarica i pesi del
 * modello una volta sola (poi restano nella cache del browser) e li esegue
 * sulla scheda grafica tramite WebGPU. Il server non calcola niente.
 */

import { LIBRARY_SOURCES, WEBLLM_VERSION } from './webllm-sources.js';
import { PROVIDERS } from './src/providers.js';
import { filterModels, suggestModel } from './src/model-picker.js';

export { suggestModel };

let libraryPromise = null;
let engine = null;
let loadedModel = null;
let mainThreadFallback = false;

/** Il browser sa fare WebGPU? È il requisito che divide chi può usarlo da chi no. */
export async function webgpuSupport() {
  if (!('gpu' in navigator)) {
    return { ok: false, reason: 'Questo browser non ha WebGPU. Servono Chrome o Edge su computer, oppure Safari 18 e successivi.' };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return { ok: false, reason: 'WebGPU risulta presente ma nessuna scheda grafica è disponibile per il browser.' };
    }
    return { ok: true, reason: '' };
  } catch (error) {
    return { ok: false, reason: `WebGPU non è utilizzabile: ${error.message}` };
  }
}

async function library() {
  if (!libraryPromise) {
    libraryPromise = (async () => {
      let ultimoErrore;
      for (const url of LIBRARY_SOURCES) {
        try {
          return await import(url);
        } catch (error) {
          ultimoErrore = error;
        }
      }
      throw new Error(
        `Non riesco a caricare la libreria del modello (versione ${WEBLLM_VERSION}). ` +
          `Ultimo errore: ${ultimoErrore?.message ?? 'sconosciuto'}`,
      );
    })();
  }
  return libraryPromise;
}

/**
 * I modelli disponibili, letti dalla libreria invece che scritti a mano: il
 * catalogo cambia a ogni versione e una lista fissa invecchierebbe subito.
 */
export async function availableModels() {
  const webllm = await library();
  return filterModels(webllm.prebuiltAppConfig?.model_list ?? []);
}

/** Quanto si aspetta un segno di vita dal motore prima di dichiararlo bloccato. */
const SILENZIO_MASSIMO_MS = 45000;

/**
 * Promessa che si rifiuta se il motore resta muto troppo a lungo.
 *
 * Un avvio che non parte non produce nessun errore: resta semplicemente in
 * attesa. Senza questo controllo la pagina può aspettare all'infinito, che è
 * esattamente il modo peggiore di fallire.
 */
function sorveglia(ultimoSegnale, annulla) {
  return new Promise((_, reject) => {
    const timer = setInterval(() => {
      if (Date.now() - ultimoSegnale() < SILENZIO_MASSIMO_MS) return;
      clearInterval(timer);
      annulla();
      reject(
        new Error(
          `Il motore del modello non ha dato segno di vita per ${Math.round(SILENZIO_MASSIMO_MS / 1000)} secondi.`,
        ),
      );
    }, 2000);
  });
}

/**
 * Carica il modello, riportando l'avanzamento dello scaricamento.
 * Ricaricare lo stesso modello è gratis: il motore resta in memoria.
 *
 * Si prova prima con il worker, che tiene viva la pagina. Se il worker non
 * parte — succede su alcuni browser, soprattutto su telefono — si ripiega sul
 * thread principale: la pagina resterà bloccata durante la generazione, ma
 * almeno il risultato arriva.
 *
 * @param {string} modelId
 * @param {(info: {progress: number, text: string}) => void} onProgress
 * @returns {Promise<{engine: object, suThreadPrincipale: boolean}>}
 */
export async function prepareEngine(modelId, onProgress = () => {}) {
  if (engine && loadedModel === modelId) {
    return { engine, suThreadPrincipale: mainThreadFallback };
  }

  const webllm = await library();
  await scaricaMotore();

  try {
    engine = await creaMotore(webllm, modelId, onProgress, { conWorker: true });
    mainThreadFallback = false;
  } catch (errorWorker) {
    console.warn('Il worker del modello non è partito, ripiego sul thread principale:', errorWorker);
    onProgress({
      progress: 0,
      text: 'Il motore in secondo piano non è partito: riprovo in primo piano. La pagina resterà ferma durante il calcolo.',
    });
    engine = await creaMotore(webllm, modelId, onProgress, { conWorker: false });
    mainThreadFallback = true;
  }

  loadedModel = modelId;
  return { engine, suThreadPrincipale: mainThreadFallback };
}

async function creaMotore(webllm, modelId, onProgress, { conWorker }) {
  let ultimoSegnale = Date.now();
  const initProgressCallback = (report) => {
    ultimoSegnale = Date.now();
    onProgress({ progress: report.progress ?? 0, text: report.text ?? '' });
  };

  const chatOpts = PROVIDERS.webllm.chatOptions;

  if (!conWorker) {
    return webllm.CreateMLCEngine(modelId, { initProgressCallback }, chatOpts);
  }

  const worker = new Worker(new URL('./webllm-worker.js', import.meta.url), { type: 'module' });

  // Il worker segnala da solo se la libreria non si carica, invece di lasciare
  // il thread principale in attesa di un motore che non arriverà.
  const avvioFallito = new Promise((_, reject) => {
    worker.addEventListener('message', (event) => {
      if (event.data?.kind === 'errore-avvio') {
        reject(new Error(`Il worker non è partito: ${event.data.message}`));
      }
    });
    worker.addEventListener('error', (event) => {
      reject(new Error(`Il worker non è partito: ${event.message ?? 'errore sconosciuto'}`));
    });
  });

  try {
    return await Promise.race([
      webllm.CreateWebWorkerMLCEngine(worker, modelId, { initProgressCallback }, chatOpts),
      avvioFallito,
      sorveglia(
        () => ultimoSegnale,
        () => worker.terminate(),
      ),
    ]);
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

/** Libera la memoria video prima di caricare un altro modello. */
async function scaricaMotore() {
  if (!engine) return;
  await engine.unload?.().catch?.(() => {});
  engine = null;
  loadedModel = null;
}

/** Il "target" nel formato che si aspetta lo strato condiviso src/llm.js. */
export function webllmTarget(modelId, chunk) {
  return {
    provider: PROVIDERS.webllm,
    model: modelId,
    baseUrl: null,
    apiKey: null,
    chunk: chunk || PROVIDERS.webllm.chunk,
    timeoutMs: 0, // non serve: non c'è nessuna richiesta di rete da interrompere
    reason: 'modello caricato nel browser',
    autoFallback: false,
    engine,
  };
}

export function loadedModelId() {
  return loadedModel;
}
