# Simulatore Elezioni USA

Un simulatore delle elezioni presidenziali americane in cui i candidati sono **persone famose
scelte da te**. Inserisci due ticket (presidente + vicepresidente), il modello di Claude ipotizza
come reagirebbe ciascuno dei 56 collegi del Collegio Elettorale, e una simulazione Monte Carlo
trasforma quelle stime in probabilità di vittoria.

![Modalità di funzionamento](https://img.shields.io/badge/node-%E2%89%A520-informational)

## Cosa fa

- **Analisi generata dal modello** — Claude colloca ogni ticket nello spazio politico plausibile
  a partire da biografia, pubblico e posizioni note dei suoi componenti, poi stima per ogni stato
  il margine atteso, l'incertezza e una riga di "reazione dello stato".
- **Simulazione statistica** — 20.000 elezioni simulate (configurabili) con errori correlati a
  livello nazionale, regionale e locale: è la correlazione a rendere realistiche le probabilità.
- **Collegio Elettorale completo** — 538 grandi elettori con la ripartizione 2024-2030, compresi
  i collegi distrettuali di Maine e Nebraska, quota 270 e possibilità di pareggio 269-269.
- **Interfaccia completa** — mappa a tessere, distribuzione degli esiti, stati decisivi
  (*tipping point*), profilo dei due ticket, racconto della campagna, tabella ordinabile di tutti
  i collegi.

## Avvio rapido

```bash
npm install
export ANTHROPIC_API_KEY="la-tua-chiave"   # oppure: ant auth login
npm start
# apri http://localhost:3000
```

Senza chiave API il simulatore parte comunque in **modalità dimostrativa**: i margini vengono da
una formula deterministica applicata ai nomi, servono solo a provare l'interfaccia e ogni schermata
lo dichiara esplicitamente. Nessuna analisi viene generata in quella modalità.

### Variabili d'ambiente

| Variabile | Default | Significato |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Chiave API. In alternativa vale un profilo creato con `ant auth login`, oppure `ANTHROPIC_AUTH_TOKEN`. |
| `ELECTION_MODEL` | `claude-opus-5` | Modello da interrogare. |
| `PORT` | `3000` | Porta del server. |

## Come funziona

```
nomi dei candidati
        │
        ▼
  src/ai.js ──► Claude (structured output: un JSON con margine, incertezza
        │        e reazione per ognuno dei 56 collegi + analisi qualitativa)
        ▼
src/simulation.js ──► 20.000 elezioni simulate
        │              margine = stima + elasticità·shock_nazionale
        │                              + shock_regionale + shock_locale
        ▼
  probabilità di vittoria, distribuzione dei grandi elettori,
  stati decisivi, probabilità di pareggio e di split col voto popolare
```

**Il modello non decide chi vince.** Produce solo le stime di partenza; l'esito è il risultato
della simulazione, che tiene conto dell'incertezza. Un ticket avanti di 2 punti nel margine atteso
non vince "sempre": vince in una certa quota di scenari.

### Il ruolo della base storica

Ogni stato parte dal proprio margine presidenziale 2024 (`src/states.js`, campo `lean`), che serve
come *terreno di gioco*: al modello viene chiesto di ragionare per scostamenti da lì, non di
inventare da zero la geografia politica americana. Se il modello salta un collegio, quel collegio
ricade sulla base storica e l'interfaccia lo segnala.

### Riproducibilità

La simulazione usa un generatore pseudo-casuale con seme derivato dai nomi dei candidati (o
impostato a mano nei parametri avanzati): a parità di stime in ingresso e di seme, il risultato è
identico. La parte variabile è solo la risposta del modello.

## Struttura

```
server.js                 server HTTP (solo moduli Node) + endpoint /api/simulate
src/states.js             i 56 collegi: grandi elettori, base 2024, regione, elasticità, mappa
src/schema.js             schema JSON richiesto al modello
src/ai.js                 prompt di sistema e chiamata a Claude
src/simulation.js         motore Monte Carlo del Collegio Elettorale
src/offline.js            modello euristico della modalità dimostrativa
public/                   interfaccia (HTML/CSS/JS, nessun framework)
test/                     test del motore, dello schema e della validazione
```

## API

`POST /api/simulate`

```json
{
  "ticketA": { "president": "Taylor Swift", "vice": "Tom Hanks", "party": "" },
  "ticketB": { "president": "Elon Musk", "vice": "Dwayne Johnson", "party": "" },
  "scenario": "recessione in corso, il tema dominante è l'intelligenza artificiale",
  "year": 2028,
  "iterations": 20000,
  "seed": null
}
```

Risponde con `analysis` (l'output del modello), `simulation` (probabilità, distribuzione,
stati decisivi, dati per collegio), `coverage` (collegi effettivamente stimati) e `mode`
(`ai` oppure `demo`).

`GET /api/meta` restituisce i 56 collegi, il totale dei grandi elettori e la modalità attiva.

## Test

```bash
npm test
```

Coprono la somma dei 538 grandi elettori, l'unicità delle tessere sulla mappa, la coerenza e la
riproducibilità della simulazione, la validazione degli input e la forma dello schema richiesto al
modello.

## Avvertenza

È una simulazione dichiaratamente immaginaria. I personaggi citati non sono candidati a nulla, e i
numeri prodotti sono ipotesi narrative su persone reali: servono a raccontare uno scenario, non a
prevedere il futuro né a descrivere posizioni politiche effettive di chi viene nominato.
