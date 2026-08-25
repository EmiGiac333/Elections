/**
 * Dove cercare la libreria del modello nel browser, in ordine di preferenza.
 *
 * La prima voce è una copia locale, che di norma non c'è: il bundle pesa più di
 * 6 MB e tenerlo nel repository lo appesantirebbe per tutti, anche per chi usa
 * il simulatore con un modello remoto. Chi vuole una pagina che non dipenda da
 * nessuna rete esterna la scarica con `npm run vendor:webllm` e da quel momento
 * viene usata quella.
 *
 * I pesi del modello arrivano comunque dalla rete al primo caricamento (poi
 * restano nella cache del browser), quindi la copia locale toglie una
 * dipendenza, non tutte.
 */

export const WEBLLM_VERSION = '0.2.84';

export const LIBRARY_SOURCES = [
  new URL('./vendor/web-llm.js', import.meta.url).href,
  `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${WEBLLM_VERSION}/lib/index.js`,
];
