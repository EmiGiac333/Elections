/**
 * Strato di accesso al modello linguistico.
 *
 * Espone una sola funzione, `chatJson`, che chiede al modello attivo una
 * risposta conforme a uno schema JSON. Dietro ci sono tre dialetti diversi:
 *
 *  - `ollama`     API nativa /api/chat, che accetta lo schema in `format`
 *  - `openai`     /chat/completions, il dialetto parlato da Groq, OpenRouter,
 *                 Gemini e praticamente ogni servizio compatibile
 *  - `anthropic`  SDK ufficiale, con structured output
 *
 * I modelli piccoli sbagliano spesso la forma della risposta: il testo viene
 * quindi ripulito (recinti markdown, blocchi di ragionamento) e il JSON estratto
 * bilanciando le parentesi, invece di fidarsi di un JSON.parse diretto.
 */

import { resolveProvider } from './providers.js';

const DEFAULT_TIMEOUT_MS = 180000;

/**
 * Chiede al modello un oggetto JSON conforme allo schema.
 *
 * @param {object} args
 * @param {string} args.system     istruzioni di sistema
 * @param {string} args.user       richiesta
 * @param {object} args.schema     schema JSON della risposta attesa
 * @param {string} args.schemaName nome dello schema (richiesto dal dialetto OpenAI)
 * @param {object} [args.target]   provider già risolto; se assente lo risolve
 * @returns {Promise<{data: object, model: string, usage: object}>}
 */
export async function chatJson({ system, user, schema, schemaName, target }) {
  const active = target ?? resolveProvider();

  switch (active.provider.kind) {
    case 'webllm':
      return callWebllm(active, { system, user, schema });
    case 'ollama':
      return callOllama(active, { system, user, schema });
    case 'openai':
      return callOpenAiCompatible(active, { system, user, schema, schemaName });
    case 'anthropic':
      return callAnthropic(active, { system, user, schema });
    default:
      throw new Error(`Dialetto sconosciuto: ${active.provider.kind}`);
  }
}

/* ------------------------------------------------------------------ */
/* Modello nel browser (WebLLM)                                        */
/* ------------------------------------------------------------------ */

/**
 * Qui non c'è nessuna rete: il modello è già caricato nella scheda grafica di
 * chi sta guardando la pagina. `target.engine` è il motore WebLLM, preparato
 * da public/webllm.js, e parla lo stesso dialetto di OpenAI.
 */
async function callWebllm(active, { system, user, schema }) {
  const engine = active.engine;
  if (!engine) {
    throw new Error('Il modello del browser non è stato caricato: ricarica la pagina e riprova.');
  }

  const reply = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    // Con lo schema, la decodifica è vincolata dalla grammatica: un modello
    // piccolo non può più restituire qualcosa che non sia il JSON richiesto.
    response_format: { type: 'json_object', schema: JSON.stringify(schema) },
    temperature: 0.7,
    max_tokens: 4000,
  });

  return {
    data: parseJsonLoose(reply?.choices?.[0]?.message?.content ?? ''),
    model: active.model,
    usage: {
      input_tokens: reply?.usage?.prompt_tokens ?? 0,
      output_tokens: reply?.usage?.completion_tokens ?? 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Ollama (locale, gratuito)                                           */
/* ------------------------------------------------------------------ */

async function callOllama(active, { system, user, schema }) {
  const body = {
    model: active.model,
    stream: false,
    format: schema, // Ollama accetta direttamente uno schema JSON
    options: {
      num_ctx: active.provider.contextTokens ?? 8192,
      temperature: 0.7,
    },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  const payload = await postJson(`${active.baseUrl}/api/chat`, body, {}, 'Ollama', active.timeoutMs);
  const text = payload?.message?.content ?? '';
  return {
    data: parseJsonLoose(text),
    model: payload?.model ?? active.model,
    usage: {
      input_tokens: payload?.prompt_eval_count ?? 0,
      output_tokens: payload?.eval_count ?? 0,
    },
  };
}

/** Elenca i modelli installati localmente: serve a dare errori utili. */
export async function ollamaModels(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const body = await res.json();
    return (body?.models ?? []).map((m) => m.name);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Dialetto OpenAI: Groq, OpenRouter, Gemini e compatibili             */
/* ------------------------------------------------------------------ */

async function callOpenAiCompatible(active, { system, user, schema, schemaName }) {
  const body = {
    model: active.model,
    temperature: 0.7,
    max_tokens: 8000,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  // Non tutti i servizi accettano lo schema completo: chi non lo supporta
  // riceve almeno la richiesta di rispondere in JSON.
  if (active.provider.json === 'json_schema') {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: schemaName, strict: true, schema },
    };
  } else {
    body.response_format = { type: 'json_object' };
  }

  const headers = { Authorization: `Bearer ${active.apiKey}` };
  if (active.provider.id === 'openrouter') {
    headers['X-Title'] = 'Simulatore Elezioni USA';
  }

  let payload;
  try {
    payload = await postJson(
      `${active.baseUrl}/chat/completions`,
      body,
      headers,
      active.provider.label,
      active.timeoutMs,
    );
  } catch (error) {
    // Se lo schema viene rifiutato, si riprova con la sola modalità JSON.
    if (body.response_format?.type === 'json_schema' && /schema|response_format/i.test(error.message)) {
      body.response_format = { type: 'json_object' };
      payload = await postJson(
        `${active.baseUrl}/chat/completions`,
        body,
        headers,
        active.provider.label,
        active.timeoutMs,
      );
    } else {
      throw error;
    }
  }

  const text = payload?.choices?.[0]?.message?.content ?? '';
  return {
    data: parseJsonLoose(text),
    model: payload?.model ?? active.model,
    usage: {
      input_tokens: payload?.usage?.prompt_tokens ?? 0,
      output_tokens: payload?.usage?.completion_tokens ?? 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Anthropic (a pagamento, opzionale)                                  */
/* ------------------------------------------------------------------ */

async function callAnthropic(active, { system, user, schema }) {
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    throw new Error(
      "Il provider anthropic richiede il pacchetto @anthropic-ai/sdk: eseguilo con 'npm install @anthropic-ai/sdk' oppure scegli un provider gratuito.",
    );
  }

  const client = new Anthropic({ apiKey: active.apiKey ?? undefined });
  const stream = client.messages.stream({
    model: active.model,
    max_tokens: 16000,
    system,
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: user }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    const detail = message.stop_details?.explanation ?? 'nessun dettaglio disponibile';
    throw new Error(`Il modello ha rifiutato di rispondere: ${detail}`);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Risposta troncata dal limite di token.');
  }

  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return {
    data: parseJsonLoose(text),
    model: message.model,
    usage: {
      input_tokens: message.usage?.input_tokens ?? 0,
      output_tokens: message.usage?.output_tokens ?? 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Utilità condivise                                                   */
/* ------------------------------------------------------------------ */

async function postJson(url, body, headers, label, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error(`${label} non ha risposto entro ${Math.round(timeoutMs / 1000)} secondi.`);
    }
    throw new Error(`Non riesco a contattare ${label} (${url}): ${error.message}`);
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 400);
    throw new Error(`${label} ha risposto ${res.status}: ${detail || 'nessun dettaglio'}`);
  }

  return res.json();
}

/**
 * Estrae un oggetto JSON da una risposta che può contenere anche altro:
 * recinti markdown, testo introduttivo, blocchi di ragionamento dei modelli
 * "reasoning". Cerca il primo oggetto con le parentesi bilanciate, ignorando
 * parentesi che stanno dentro una stringa.
 */
export function parseJsonLoose(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Il modello ha restituito una risposta vuota.');
  }

  const text = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    // si prosegue con l'estrazione
  }

  const start = text.indexOf('{');
  if (start === -1) throw new Error('Nella risposta del modello non c\'è nessun oggetto JSON.');

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch (error) {
          throw new Error(`Il JSON del modello non è valido: ${error.message}`);
        }
      }
    }
  }

  throw new Error('Il JSON del modello si interrompe a metà: probabilmente la risposta è stata troncata.');
}
