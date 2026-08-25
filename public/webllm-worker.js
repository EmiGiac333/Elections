/**
 * Worker del modello nel browser.
 *
 * Generare seimila token con un modello locale richiede minuti: se girasse sul
 * thread principale la pagina resterebbe congelata per tutto il tempo, barra di
 * avanzamento compresa. Qui il modello vive in un worker e la pagina resta viva.
 *
 * Il worker non fa altro che girare i messaggi al gestore della libreria — ma
 * il "quando" è delicato, vedi sotto.
 */

import { LIBRARY_SOURCES } from './webllm-sources.js';

/**
 * I messaggi che arrivano prima che la libreria sia pronta vanno conservati.
 *
 * Caricare la libreria richiede un `await` di qualche MB, mentre il thread
 * principale invia il messaggio di avvio appena creato il worker. Un gestore
 * registrato solo dopo l'await perderebbe quel messaggio: nessun errore,
 * nessun avanzamento, la pagina resta in attesa per sempre. Su una rete veloce
 * l'ordine di solito è benevolo, su una rete mobile no.
 *
 * Per questo la prima riga eseguita registra un gestore che accumula, e i
 * messaggi accumulati vengono riconsegnati appena il gestore vero esiste.
 */
const inAttesa = [];
self.onmessage = (event) => inAttesa.push(event);

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

try {
  const webllm = await loadLibrary();
  const handler = new webllm.WebWorkerMLCEngineHandler();

  self.onmessage = (event) => handler.onmessage(event);
  for (const event of inAttesa.splice(0)) handler.onmessage(event);
} catch (error) {
  // Senza libreria il worker non serve a niente: meglio dirlo al thread
  // principale, che altrimenti aspetterebbe un motore che non arriverà mai.
  self.postMessage({ kind: 'errore-avvio', message: String(error?.message ?? error) });
  throw error;
}
