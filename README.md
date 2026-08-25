# Simulatore Elezioni USA

Un simulatore delle elezioni presidenziali americane in cui i candidati sono **persone famose
scelte da te**. Inserisci due ticket (presidente + vicepresidente), un modello linguistico ipotizza
come reagirebbe ciascuno dei 56 collegi del Collegio Elettorale, e una simulazione Monte Carlo
trasforma quelle stime in probabilità di vittoria.

**Funziona con modelli gratuiti**, compreso un modello che gira sul tuo computer senza account,
senza chiave e senza costi. Nessuna dipendenza da installare: serve solo Node 20 o successivo.

## Avvio rapido

```bash
npm start          # nessun npm install necessario: zero dipendenze
# apri http://localhost:3000
```

Prima però serve un modello. Scegline uno fra questi, sono tutti utilizzabili gratuitamente.

### Opzione 1 — Modello locale con Ollama (nessun account, nessun limite)

È la scelta consigliata se hai un computer decente: gira tutto in locale, non esce nessun dato e
non c'è nessun limite di utilizzo.

```bash
# 1. installa Ollama da https://ollama.com
ollama pull llama3.1:8b     # circa 5 GB, una volta sola
ollama serve                # di solito parte già da solo

# 2. avvia il simulatore
npm start
```

Il simulatore rileva Ollama da solo. Con un modello più piccolo (`ollama pull qwen2.5:3b`) va più
veloce ma le analisi sono più povere; con uno più grande (`llama3.1:70b`) succede il contrario.
Per sceglierlo: `AI_MODEL=qwen2.5:7b npm start`.

### Opzione 2 — Piano gratuito nel cloud (nessun hardware richiesto)

Se il computer non regge un modello locale, questi servizi hanno un piano gratuito. Basta una
chiave, che si ottiene in un minuto.

| Servizio | Chiave gratuita da | Comando |
|---|---|---|
| **Groq** (veloce, consigliato) | https://console.groq.com/keys | `GROQ_API_KEY=... npm start` |
| **Google Gemini** | https://aistudio.google.com/apikey | `GEMINI_API_KEY=... npm start` |
| **OpenRouter** (modelli `:free`) | https://openrouter.ai/keys | `OPENROUTER_API_KEY=... npm start` |

Il provider viene rilevato dalla chiave presente; per forzarlo, `AI_PROVIDER=groq`. Se il modello
predefinito non fosse più disponibile sul servizio (i cataloghi cambiano spesso), il simulatore
riporta l'errore del servizio e basta indicarne un altro con `AI_MODEL`.

### Opzione 3 — Anthropic (a pagamento, facoltativa)

Resta disponibile per chi ha già una chiave, ma richiede un pacchetto in più:

```bash
npm install @anthropic-ai/sdk
AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... npm start
```

### Senza nessun modello

Il simulatore parte comunque, e se l'analisi non è disponibile propone la **modalità
dimostrativa**: i margini vengono da una formula deterministica applicata ai nomi, servono solo a
provare l'interfaccia e ogni schermata lo dichiara. Non è un'analisi.

## Variabili d'ambiente

| Variabile | Default | Significato |
|---|---|---|
| `AI_PROVIDER` | rilevato | `ollama`, `groq`, `gemini`, `openrouter`, `anthropic` oppure `demo` |
| `AI_MODEL` | dipende dal provider | Modello da usare |
| `AI_STATE_CHUNK` | dipende dal provider | Quanti collegi chiedere per richiesta |
| `AI_TIMEOUT_MS` | `180000` | Attesa massima per una risposta del modello |
| `OLLAMA_URL` | `http://localhost:11434` | Utile se Ollama gira su un'altra macchina |
| `PORT` | `3000` | Porta del server |

Le stesse variabili possono stare in un file `.env` accanto al progetto (vedi `.env.example`).

## Come funziona

```
nomi dei candidati
        │
        ▼
 1. profilo  ──►  una richiesta al modello: chi sono i due ticket, voto
        │         nazionale, racconto della campagna
        ▼
 2. collegi  ──►  N richieste a blocchi: margine, incertezza e reazione
        │         di ogni stato, col profilo come contesto
        ▼
src/simulation.js ──► 20.000 elezioni simulate
        │              margine = stima + elasticità·shock_nazionale
        │                              + shock_regionale + shock_locale
        ▼
  probabilità di vittoria, distribuzione dei grandi elettori,
  stati decisivi, pareggio 269-269, scarto col voto popolare
```

**Perché due fasi e non una sola richiesta.** Chiedere a un modello gratuito 56 stime più tutta
l'analisi in un colpo solo è il modo più rapido per farlo troncare o sbandare. Il profilo viene
quindi chiesto a parte e passato come contesto ai blocchi di stati, così le stime restano coerenti
fra loro. Un blocco che fallisce non butta via la simulazione: quei collegi ricadono sulla base
storica e l'interfaccia lo dichiara.

**Il modello non decide chi vince.** Produce solo le stime di partenza; l'esito è il risultato
della simulazione, che tiene conto dell'incertezza. Un ticket avanti di 2 punti nel margine atteso
non vince "sempre": vince in una certa quota di scenari.

### Il ruolo della base storica

Ogni stato parte dal proprio margine presidenziale 2024 (`src/states.js`, campo `lean`), che serve
come *terreno di gioco*: al modello viene chiesto di ragionare per scostamenti da lì, non di
inventare da zero la geografia politica americana. È anche ciò che rende utilizzabili i modelli
piccoli, che da soli non conoscono bene i numeri stato per stato.

### Riproducibilità

La simulazione usa un generatore pseudo-casuale con seme derivato dai nomi dei candidati (o
impostato a mano nei parametri avanzati): a parità di stime in ingresso e di seme, il risultato è
identico. La parte variabile è solo la risposta del modello.

## Struttura

```
server.js                 server HTTP (solo moduli Node) + endpoint /api/simulate
src/providers.js          i provider disponibili e la scelta di quello attivo
src/llm.js                dialetti Ollama, OpenAI-compatibile e Anthropic + parser JSON tollerante
src/schema.js             schemi JSON del profilo e dei blocchi di collegi
src/ai.js                 prompt e orchestrazione delle due fasi
src/simulation.js         motore Monte Carlo del Collegio Elettorale
src/states.js             i 56 collegi: grandi elettori, base 2024, regione, elasticità, mappa
src/offline.js            modello euristico della modalità dimostrativa
public/                   interfaccia (HTML/CSS/JS, nessun framework)
test/                     test del motore, dei provider, degli schemi e della validazione
```

## API

`POST /api/simulate` risponde con un flusso **NDJSON**: prima le righe di avanzamento, poi il
risultato. Serve perché con un modello locale l'analisi può durare minuti.

```json
{
  "ticketA": { "president": "Taylor Swift", "vice": "Tom Hanks", "party": "" },
  "ticketB": { "president": "Elon Musk", "vice": "Dwayne Johnson", "party": "" },
  "scenario": "recessione in corso, il tema dominante è l'intelligenza artificiale",
  "year": 2028,
  "iterations": 20000,
  "seed": null,
  "mode": null
}
```

Righe della risposta: `{"type":"progress",…}`, poi `{"type":"result",…}` con `analysis`,
`simulation`, `coverage`, `provider` e `mode`, oppure `{"type":"error","canFallback":true}`.
Con `"mode": "demo"` si ottiene la modalità dimostrativa senza interrogare nessun modello.

`GET /api/meta` restituisce i 56 collegi, il provider attivo e il catalogo dei provider
disponibili con le istruzioni per attivarli.

## Test

```bash
npm test
```

26 test su: somma dei 538 grandi elettori, unicità delle tessere sulla mappa, coerenza e
riproducibilità della simulazione, validazione degli input, scelta del provider, forma degli
schemi e parser JSON tollerante (recinti markdown, preamboli, blocchi di ragionamento, risposte
troncate).

## Avvertenza

È una simulazione dichiaratamente immaginaria. I personaggi citati non sono candidati a nulla, e i
numeri prodotti sono ipotesi narrative su persone reali: servono a raccontare uno scenario, non a
prevedere il futuro né a descrivere posizioni politiche effettive di chi viene nominato.
