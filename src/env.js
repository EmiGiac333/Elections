/**
 * Carica un eventuale file .env accanto al progetto.
 *
 * Va importato per primo da server.js: le variabili devono essere in ambiente
 * prima che gli altri moduli le leggano. Il file è del tutto facoltativo.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENV_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

try {
  process.loadEnvFile?.(ENV_FILE);
} catch {
  // Nessun .env, o Node troppo vecchio per loadEnvFile: si usa l'ambiente così com'è.
}
