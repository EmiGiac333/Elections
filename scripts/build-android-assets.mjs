/**
 * Copia il sito dentro l'app Android.
 *
 * L'app non ha un'interfaccia propria: mostra la stessa pagina del sito, dentro
 * un WebView. Questo script assembla il sito e lo mette dove il WebView lo
 * cerca, così le due versioni non possono divergere.
 *
 *   npm run build:android
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const DEST = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'web');

console.log('Assemblo il sito…');
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-site.mjs')], { stdio: 'inherit' });

await fs.rm(DEST, { recursive: true, force: true });
await fs.mkdir(DEST, { recursive: true });
await fs.cp(SITE, DEST, { recursive: true });

const file = await fs.readdir(DEST, { recursive: true });
console.log(`Copiato in android/app/src/main/assets/web/ — ${file.length} file.`);
console.log('Ora apri la cartella android/ con Android Studio e premi Esegui.');
