/**
 * Scarica la libreria del modello nel browser dentro public/vendor/.
 *
 * Serve solo a chi vuole una pagina che non dipenda da nessuna rete esterna per
 * il codice: senza questo file la pagina prende la libreria da un CDN. I pesi
 * del modello arrivano comunque dalla rete al primo caricamento.
 *
 *   npm run vendor:webllm
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES_FILE = path.join(ROOT, 'public', 'webllm-sources.js');
const DEST_DIR = path.join(ROOT, 'public', 'vendor');
const DEST = path.join(DEST_DIR, 'web-llm.js');

// La versione è scritta una volta sola, accanto agli indirizzi da cui caricare
// la libreria: così non può divergere da quella usata dalla pagina.
const { WEBLLM_VERSION } = await import(SOURCES_FILE);
const url = `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${WEBLLM_VERSION}/lib/index.js`;

console.log(`Scarico @mlc-ai/web-llm ${WEBLLM_VERSION}…`);
const res = await fetch(url);
if (!res.ok) {
  console.error(`Scaricamento fallito: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const codice = await res.text();
await fs.mkdir(DEST_DIR, { recursive: true });
await fs.writeFile(DEST, codice);

console.log(`Salvato in public/vendor/web-llm.js (${(codice.length / 1024 / 1024).toFixed(1)} MB).`);
console.log('Da ora la pagina usa questa copia invece del CDN.');
