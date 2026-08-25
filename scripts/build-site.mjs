/**
 * Assembla il sito statico da pubblicare.
 *
 * Mette in site/ il contenuto di public/ e, dentro site/src/, i moduli
 * condivisi: è la stessa forma che il server espone a runtime (la pagina alla
 * radice, i moduli sotto /src/), quindi gli stessi import funzionano nei due
 * casi senza differenze.
 *
 * Il sito che ne esce non ha nessun server dietro: funzionano il modello nel
 * browser e la modalità dimostrativa, mentre le opzioni che passano da un
 * server restano disattivate, perché `api/meta` non risponde.
 *
 *   npm run build:site
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');

await fs.rm(SITE, { recursive: true, force: true });
await fs.mkdir(SITE, { recursive: true });

// public/ diventa la radice del sito. La cartella vendor/, se qualcuno l'ha
// creata con `npm run vendor:webllm`, viene copiata con tutto il resto.
await fs.cp(path.join(ROOT, 'public'), SITE, {
  recursive: true,
  filter: (src) => path.basename(src) !== '.gitignore',
});

// I moduli condivisi vanno dove la pagina li cerca: /src/.
await fs.cp(path.join(ROOT, 'src'), path.join(SITE, 'src'), {
  recursive: true,
  // env.js legge un file .env con le API di Node: nel browser non serve e non
  // verrebbe nemmeno importato.
  filter: (src) => path.basename(src) !== 'env.js',
});

// Senza questo file GitHub Pages passerebbe tutto da Jekyll, che ignora le
// cartelle che iniziano per underscore e può sorprendere.
await fs.writeFile(path.join(SITE, '.nojekyll'), '');

const conteggio = async (dir) => (await fs.readdir(dir, { recursive: true })).length;
console.log(`Sito assemblato in site/ — ${await conteggio(SITE)} file.`);
console.log('Per provarlo: npx serve site   (oppure qualunque server di file statici)');
