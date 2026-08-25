/**
 * Provider del modello linguistico.
 *
 * Il simulatore non è legato a un fornitore: qui sono descritti i backend
 * disponibili, tutti utilizzabili gratuitamente tranne l'ultimo.
 *
 *  - ollama      modello in esecuzione sul tuo computer: nessun account,
 *                nessuna chiave, nessun costo e nessun dato che esce di casa
 *  - groq        piano gratuito con limiti di frequenza, chiave gratuita
 *  - openrouter  modelli con suffisso ":free", chiave gratuita
 *  - gemini      piano gratuito di Google AI Studio, chiave gratuita
 *  - anthropic   a pagamento, resta disponibile per chi ha già una chiave
 *
 * Il provider si sceglie con AI_PROVIDER; senza indicazioni viene rilevato
 * automaticamente il primo utilizzabile, dando la precedenza a quelli gratuiti.
 */

export const PROVIDERS = {
  ollama: {
    id: 'ollama',
    label: 'Ollama (modello locale)',
    kind: 'ollama',
    free: true,
    cost: 'gratuito, gira sul tuo computer',
    baseUrlEnv: 'OLLAMA_URL',
    baseUrl: 'http://localhost:11434',
    apiKeyEnv: null,
    defaultModel: 'llama3.1:8b',
    // I modelli locali piccoli reggono male risposte lunghissime: si chiedono
    // pochi collegi per volta.
    chunk: 8,
    contextTokens: 8192,
    setup: 'Installa Ollama da https://ollama.com, poi: ollama pull llama3.1:8b',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    kind: 'openai',
    free: true,
    cost: 'piano gratuito con limiti di frequenza',
    baseUrlEnv: 'GROQ_URL',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    json: 'json_schema',
    chunk: 14,
    setup: 'Chiave gratuita da https://console.groq.com/keys',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai',
    free: true,
    cost: 'gratuito con i modelli che finiscono per ":free"',
    baseUrlEnv: 'OPENROUTER_URL',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    json: 'json_object',
    chunk: 14,
    setup: 'Chiave gratuita da https://openrouter.ai/keys',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'openai',
    free: true,
    cost: 'piano gratuito di Google AI Studio',
    baseUrlEnv: 'GEMINI_URL',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnv: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.0-flash',
    json: 'json_schema',
    chunk: 28,
    setup: 'Chiave gratuita da https://aistudio.google.com/apikey',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    kind: 'anthropic',
    free: false,
    cost: 'a consumo, non gratuito',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-opus-5',
    json: 'json_schema',
    chunk: 56,
    setup: 'Chiave da https://console.anthropic.com',
  },
};

/** Ordine di rilevamento automatico: prima i gratuiti, il locale per ultimo. */
const AUTO_ORDER = ['groq', 'gemini', 'openrouter', 'anthropic', 'ollama'];

/**
 * Decide quale provider usare.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{provider: object, model: string, baseUrl: string|null,
 *            apiKey: string|null, reason: string}}
 */
export function resolveProvider(env = process.env) {
  const requested = (env.AI_PROVIDER ?? '').trim().toLowerCase();

  if (requested) {
    const provider = PROVIDERS[requested];
    if (!provider) {
      const noti = Object.keys(PROVIDERS).join(', ');
      throw new Error(`AI_PROVIDER="${requested}" non riconosciuto. Valori validi: ${noti}.`);
    }
    return describe(provider, env, 'scelto con AI_PROVIDER', false);
  }

  for (const id of AUTO_ORDER) {
    const provider = PROVIDERS[id];
    if (provider.apiKeyEnv && env[provider.apiKeyEnv]) {
      return describe(provider, env, `rilevato da ${provider.apiKeyEnv}`, false);
    }
  }

  // Nessuna chiave: si prova comunque il modello locale, che non ne richiede.
  return describe(PROVIDERS.ollama, env, 'nessuna chiave configurata, provo il modello locale', true);
}

function describe(provider, env, reason, autoFallback) {
  return {
    provider,
    model: (env.AI_MODEL ?? '').trim() || provider.defaultModel,
    baseUrl: provider.baseUrlEnv ? (env[provider.baseUrlEnv] ?? provider.baseUrl) : (provider.baseUrl ?? null),
    apiKey: provider.apiKeyEnv ? (env[provider.apiKeyEnv] ?? null) : null,
    chunk: clampChunk(env.AI_STATE_CHUNK, provider.chunk),
    reason,
    // Vero quando nessuno ha scelto questo provider: ci siamo arrivati per
    // esclusione. Serve a dare un messaggio d'errore sensato se non risponde.
    autoFallback,
  };
}

function clampChunk(raw, fallback) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.round(value), 56);
}

/** Riepilogo leggibile dei provider, per la pagina e per i messaggi d'errore. */
export function providerCatalog() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    free: p.free,
    cost: p.cost,
    apiKeyEnv: p.apiKeyEnv,
    defaultModel: p.defaultModel,
    setup: p.setup,
  }));
}
