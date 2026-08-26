/**
 * Ponte verso il motore nativo dell'app Android.
 *
 * Quando la pagina gira dentro l'app, l'oggetto `AndroidLLM` viene iniettato
 * dal codice Kotlin. Il modello non è più WebGPU nel browser ma un motore
 * nativo, che sullo stesso telefono va parecchie volte più veloce.
 *
 * Fuori dall'app questo file non fa nulla: `disponibile()` risponde di no e la
 * pagina resta esattamente com'era.
 */

import { PROVIDERS } from './src/providers.js';

/** Richieste in volo, in attesa della risposta dal codice nativo. */
const inVolo = new Map();
let prossimoId = 1;

// Il codice Kotlin non può restituire un valore da una generazione che dura
// minuti: chiama questa funzione quando ha finito.
window.__nativeRisposta = (id, testo, errore) => {
  const richiesta = inVolo.get(Number(id));
  if (!richiesta) return;
  inVolo.delete(Number(id));
  if (errore) richiesta.reject(new Error(errore));
  else richiesta.resolve(testo ?? '');
};

/** Notifiche non richieste dal lato nativo: scelta del modello, avanzamenti. */
const ascoltatori = new Set();
window.__nativeEvento = (tipoOJson) => {
  let evento;
  try {
    evento = typeof tipoOJson === 'string' ? JSON.parse(tipoOJson) : tipoOJson;
  } catch {
    return;
  }
  for (const ascoltatore of ascoltatori) ascoltatore(evento);
};

export function suEvento(ascoltatore) {
  ascoltatori.add(ascoltatore);
  return () => ascoltatori.delete(ascoltatore);
}

/** La pagina sta girando dentro l'app Android? */
export function disponibile() {
  return typeof window.AndroidLLM?.genera === 'function';
}

/**
 * Stato del motore nativo: se c'è un modello caricato e quale.
 * @returns {{pronto: boolean, modello: string, motore: string, errore?: string}}
 */
export function stato() {
  if (!disponibile()) return { pronto: false, modello: '', motore: '' };
  try {
    return JSON.parse(window.AndroidLLM.stato());
  } catch (error) {
    return { pronto: false, modello: '', motore: '', errore: error.message };
  }
}

/** Apre il selettore di file dell'app per scegliere il modello da usare. */
export function scegliModello() {
  window.AndroidLLM?.scegliModello?.();
}

/** Ferma la generazione in corso. */
export function interrompi() {
  try {
    window.AndroidLLM?.interrompi?.();
  } catch {
    // Se il motore non sa interrompersi, l'annullamento avviene fra i blocchi.
  }
}

/**
 * Una generazione. Il lato nativo risponde in modo asincrono, perché sul thread
 * dell'interfaccia bloccherebbe l'app per minuti.
 */
function genera({ system, user, maxToken = 1200 }) {
  return new Promise((resolve, reject) => {
    if (!disponibile()) {
      reject(new Error('Il motore nativo non è disponibile.'));
      return;
    }
    const id = prossimoId++;
    inVolo.set(id, { resolve, reject });
    try {
      window.AndroidLLM.genera(id, system, user, maxToken);
    } catch (error) {
      inVolo.delete(id);
      reject(error);
    }
  });
}

/** Il "target" nel formato che si aspetta lo strato condiviso src/llm.js. */
export function nativeTarget() {
  const info = stato();
  return {
    provider: PROVIDERS.native,
    model: info.modello || 'modello locale',
    baseUrl: null,
    apiKey: null,
    chunk: PROVIDERS.native.chunk,
    timeoutMs: 0,
    reason: `motore nativo ${info.motore || ''}`.trim(),
    autoFallback: false,
    generate: genera,
  };
}
