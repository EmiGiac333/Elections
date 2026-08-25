/**
 * Scelta del modello da eseguire nel browser.
 *
 * Logica pura, separata dal codice che parla con WebGPU: il catalogo dei
 * modelli arriva dalla libreria, qui si decide soltanto quali ha senso proporre
 * e quale preselezionare.
 *
 * Il catalogo grezzo contiene oltre cento voci ed è pieno di trappole per
 * questo compito: modelli del 2023 ormai superati, varianti specializzate in
 * codice o matematica, quantizzazioni doppie dello stesso modello e — la
 * trappola peggiore — versioni con finestra di contesto da 1024 token, in cui
 * il nostro prompt non entra nemmeno. Sceglierne uno "per dimensione" pesca
 * quasi sempre la voce sbagliata.
 */

/** Sopra questa soglia di memoria video quasi nessuna scheda comune ce la fa. */
const VRAM_MASSIMA_MB = 6000;

/** Sotto i 3 GB si resta nel territorio in cui la maggior parte dei computer carica il modello. */
const VRAM_CONSIGLIATA_MB = 3000;

/** Sotto questa soglia i modelli sono troppo piccoli per un'analisi con questa struttura. */
const VRAM_MINIMA_UTILE_MB = 700;

/**
 * Le famiglie che vale la pena proporre. È un elenco esplicito e non un filtro
 * generico su "instruct" proprio perché il catalogo mescola generazioni diverse:
 * senza questo, un modello del 2023 può risultare il più grande che sta in
 * memoria e vincere la selezione pur essendo il peggiore del gruppo.
 */
const FAMIGLIE_UTILI =
  /^(Llama-3\.[123]|Qwen3|Qwen2\.5|gemma-2-|gemma3|Phi-3\.5|Hermes-3|SmolLM2|Mistral-7B-Instruct-v0\.3|OLMo-2)/;

/** Varianti da scartare, con il motivo. */
const SCARTI = [
  // Finestra di contesto da 1024 token: il prompt di un blocco non ci sta.
  /-1k(-|$)/,
  // Specializzazioni inutili qui, e peggiori del modello generico sul testo.
  // I modelli con vista pesano di più senza servire a niente: qui non ci sono
  // immagini da guardare.
  /-Coder-|-Math-|-jpn-|-vision-/,
  // I modelli "reasoning" spendono la risposta a ragionare ad alta voce:
  // con un'uscita vincolata da uno schema è sprecata.
  /r1-distill/i,
  /embedding/i,
];

/**
 * Tiene solo i modelli utilizzabili per questo compito, in una sola
 * quantizzazione per modello (`q4f16_1`, la più compatta e veloce), ordinati
 * per memoria richiesta.
 *
 * @param {Array<{model_id: string, vram_required_MB?: number, low_resource_required?: boolean}>} lista
 */
export function filterModels(lista) {
  return (lista ?? [])
    .filter((m) => typeof m?.model_id === 'string')
    .filter((m) => FAMIGLIE_UTILI.test(m.model_id))
    .filter((m) => m.model_id.includes('q4f16_1'))
    .filter((m) => !SCARTI.some((scarto) => scarto.test(m.model_id)))
    .filter((m) => (m.vram_required_MB ?? 0) > 0 && m.vram_required_MB <= VRAM_MASSIMA_MB)
    .map((m) => ({
      id: m.model_id,
      etichetta: prettyName(m.model_id),
      vramMB: Math.round(m.vram_required_MB),
      lowResource: Boolean(m.low_resource_required),
    }))
    .sort((a, b) => a.vramMB - b.vramMB);
}

/** Nome leggibile: il suffisso tecnico non dice niente a chi sceglie. */
export function prettyName(modelId) {
  return modelId
    .replace(/-q4f16_1-MLC.*$/, '')
    .replace(/-MLC.*$/, '')
    .replace(/-Instruct$/, '')
    .replace(/-it$/, '');
}

/**
 * Il modello da preselezionare: il più grande fra quelli che stanno sotto la
 * soglia consigliata, perché più piccolo peggiora l'analisi e più grande
 * rischia di non essere caricabile.
 *
 * Su un telefono la scelta cambia: si prende il più piccolo che abbia ancora
 * senso. La memoria concessa a una scheda del browser è poca e la GPU è lenta,
 * quindi lì un modello grande non è "migliore": è uno che non finisce, o che
 * non parte proprio.
 *
 * @param {Array<{id: string, vramMB: number}>} models già filtrati e ordinati
 * @param {{compact?: boolean}} [opzioni] compact = dispositivo con poca memoria
 */
export function suggestModel(models, { compact = false } = {}) {
  const lista = models ?? [];
  if (!lista.length) return '';

  if (compact) {
    const utile = lista.find((m) => m.vramMB >= VRAM_MINIMA_UTILE_MB);
    return (utile ?? lista[0]).id;
  }

  const candidati = lista.filter((m) => m.vramMB <= VRAM_CONSIGLIATA_MB);
  return (candidati.at(-1) ?? lista[0]).id;
}
