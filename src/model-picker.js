/**
 * Scelta del modello da eseguire nel browser.
 *
 * Logica pura, separata dal codice che parla con WebGPU: il catalogo dei
 * modelli arriva dalla libreria, qui si decide soltanto quali ha senso proporre
 * e quale preselezionare.
 */

/** Sopra questa soglia di memoria video quasi nessuna scheda comune ce la fa. */
const VRAM_MASSIMA_MB = 6000;

/** Sotto i 3 GB si resta nel territorio in cui la maggior parte dei computer carica il modello. */
const VRAM_CONSIGLIATA_MB = 3000;

/**
 * Tiene solo i modelli utilizzabili per questo compito: quelli istruiti a
 * seguire istruzioni (gli altri completano testo e basta) e abbastanza piccoli
 * da stare in una scheda grafica normale.
 *
 * @param {Array<{model_id: string, vram_required_MB?: number, low_resource_required?: boolean}>} lista
 */
export function filterModels(lista) {
  return (lista ?? [])
    .filter((m) => typeof m?.model_id === 'string')
    .filter((m) => /instruct|-it-|hermes|chat/i.test(m.model_id))
    // I modelli "reasoning" spendono la loro risposta a ragionare ad alta voce:
    // con una risposta vincolata da uno schema è sprecata.
    .filter((m) => !/embedding|r1-distill/i.test(m.model_id))
    .filter((m) => (m.vram_required_MB ?? 0) > 0 && m.vram_required_MB <= VRAM_MASSIMA_MB)
    .map((m) => ({
      id: m.model_id,
      vramMB: Math.round(m.vram_required_MB),
      lowResource: Boolean(m.low_resource_required),
    }))
    .sort((a, b) => a.vramMB - b.vramMB);
}

/**
 * Il modello da preselezionare: il più grande fra quelli che stanno sotto la
 * soglia consigliata, perché più piccolo peggiora l'analisi e più grande
 * rischia di non essere caricabile.
 *
 * @param {Array<{id: string, vramMB: number}>} models già filtrati e ordinati
 */
export function suggestModel(models) {
  const candidati = (models ?? []).filter((m) => m.vramMB <= VRAM_CONSIGLIATA_MB);
  return (candidati.at(-1) ?? models?.[0])?.id ?? '';
}
