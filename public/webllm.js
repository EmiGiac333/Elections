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

/**
 * Carica il modello, riportando l'avanzamento dello scaricamento.
 * Ricaricare lo stesso modello è gratis: il motore resta in memoria.
 *
 * @param {string} modelId
 * @param {(info: {progress: number, text: string}) => void} onProgress
 */
export async function prepareEngine(modelId, onProgress = () => {}) {
  if (engine && loadedModel === modelId) return engine;

  const webllm = await library();

  if (engine) {
    // Cambio di modello: libero la memoria video prima di caricare l'altro.
    await engine.unload().catch(() => {});
    engine = null;
    loadedModel = null;
  }

  const worker = new Worker(new URL('./webllm-worker.js', import.meta.url), { type: 'module' });

  engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
    initProgressCallback: (report) => {
      onProgress({ progress: report.progress ?? 0, text: report.text ?? '' });
    },
  });

  loadedModel = modelId;
  return engine;
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
