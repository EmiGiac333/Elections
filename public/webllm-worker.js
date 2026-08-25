/**
 * Worker del modello nel browser.
 *
 * Generare seimila token con un modello locale richiede minuti: se girasse sul
 * thread principale la pagina resterebbe congelata per tutto il tempo, barra di
 * avanzamento compresa. Qui il modello vive in un worker e la pagina resta viva.
 *
 * Il worker non fa altro che girare i messaggi al gestore della libreria.
 */

import { LIBRARY_SOURCES } from './webllm-sources.js';

async function loadLibrary() {
  let ultimoErrore;
  for (const url of LIBRARY_SOURCES) {
    try {
      return await import(/* @vite-ignore */ url);
    } catch (error) {
      ultimoErrore = error;
    }
  }
  throw ultimoErrore ?? new Error('Nessuna sorgente disponibile per la libreria del modello.');
}

const webllm = await loadLibrary();
const handler = new webllm.WebWorkerMLCEngineHandler();

self.onmessage = (event) => handler.onmessage(event);
