# App Android

Il simulatore come app, con il modello che gira **sul telefono**: nessuna rete,
nessuna chiave, nessun account. L'app non ha un'interfaccia propria — mostra la
stessa pagina del sito dentro un WebView — ma sostituisce l'inferenza con un
motore nativo, che sullo stesso telefono va parecchie volte più veloce di
WebGPU dentro il browser.

## ⚠️ Da leggere prima di cominciare

Questo codice Kotlin **non è mai stato compilato né eseguito**. È stato scritto
in un ambiente senza SDK Android, senza Gradle e senza dispositivo. Il lato
JavaScript del ponte invece è collaudato: è stato eseguito in un browser vero
con un finto `AndroidLLM` iniettato, che si comporta come il codice Kotlin.

In pratica: aspettati di dover sistemare qualcosa alla prima compilazione. I
punti più probabili sono elencati in fondo, in *Se qualcosa non compila*.

## Cosa serve

- **Android Studio** (versione recente). Genera da solo il wrapper di Gradle,
  che qui non è incluso perché è un file binario.
- Un **telefono Android 8 o successivo**, meglio se con almeno 6 GB di RAM.
- Un **file del modello** in formato `.task`, scaricato sul telefono.

## Come si compila

```bash
# 1. dalla radice del progetto: assembla il sito e copialo dentro l'app
npm run build:android

# 2. apri la cartella android/ con Android Studio e premi Esegui
```

Il primo passo è necessario a ogni modifica dell'interfaccia: l'app mostra la
copia degli asset, non i file di `public/`.

## Il modello

L'app **non scarica il modello da sola**, di proposito: i modelli distribuiti da
Google richiedono di accettare una licenza, e un download silenzioso fallirebbe
con un errore incomprensibile. Il file lo scegli tu, una volta sola.

1. Sul telefono, scarica un modello in formato `.task` compatibile con
   l'inferenza on-device di MediaPipe. I bundle pronti stanno su Hugging Face
   (cerca la community *LiteRT* e il modello **Gemma 3 1B IT**) e su Kaggle,
   dopo aver accettato la licenza. Un modello da 1 miliardo di parametri
   quantizzato pesa circa mezzo giga.
2. Apri l'app, premi **Scegli il modello** e seleziona il file.
3. L'app lo copia nella propria memoria e lo carica. Da lì in poi parte subito
   a ogni avvio.

Modelli più grandi danno analisi migliori ma vanno più lenti e possono non
entrare in memoria: su un telefono comune, 1-2 miliardi di parametri sono il
punto di equilibrio.

## Com'è fatta

```
MainActivity.kt   il WebView, il ponte verso JavaScript, il selettore del file
MotoreLocale.kt   caricamento del modello e generazione, su MediaPipe
public/native.js  l'altra metà del ponte, lato pagina
src/providers.js  il motore nativo come un provider fra gli altri
```

L'interfaccia viene servita da `https://appassets.androidplatform.net/` invece
che da `file://`: i moduli JavaScript non si caricano da `file://`, e questa è
la via ufficiale per dargli un'origine valida.

Il ponte è volutamente minimo — stato, scegli modello, genera, interrompi — e il
WebView carica soltanto gli asset dell'app: nessuna pagina esterna può parlare
con il motore.

Il codice Kotlin non conosce nulla della simulazione: prompt, suddivisione in
blocchi, riparazione delle risposte e Monte Carlo restano nel JavaScript
condiviso con il sito. Riscriverli in Kotlin sarebbe stato il modo più rapido
per far divergere le due versioni.

## Cosa aspettarsi come velocità

Il motore nativo è più veloce di WebGPU nel browser, ma resta un telefono:
realisticamente **2-5 volte**, non cinquanta. Se nel browser il tuo telefono
faceva meno di un token al secondo, qui dovrebbe stare fra i 2 e i 4 — e su un
telefono recente di fascia alta anche 10-20.

La pagina misura la velocità reale prima di cominciare e dichiara quanto durerà,
quindi lo saprai entro il primo minuto invece che dopo il quindicesimo.

## Una differenza importante rispetto alla versione web

Il motore nativo **non vincola l'uscita alla grammatica dello schema**, cosa che
WebLLM invece fa. La forma della risposta viene chiesta nel prompt e poi
verificata: un modello piccolo sbaglierà il formato più spesso. Le difese che
esistono già valgono doppio qui — il parser tollerante recupera le risposte
sporche, e un blocco perso non annulla la simulazione: quei collegi ricadono
sulla base storica e l'interfaccia lo dichiara.

## Se qualcosa non compila

In ordine di probabilità:

1. **La versione di `tasks-genai` non esiste più.** In `app/build.gradle.kts`
   sostituisci la versione con l'ultima disponibile. L'API usata qui
   (`LlmInference.createFromOptions` e `generateResponse`) è stabile da tempo,
   ma i nomi delle opzioni potrebbero essere cambiati: in quel caso il messaggio
   del compilatore dice esattamente quale.
2. **Android Studio propone di aggiornare il plugin Gradle o Kotlin.** Accetta:
   le versioni fissate in `build.gradle.kts` sono una combinazione nota, non un
   requisito.
3. **Il modello non si carica.** Quasi sempre è il formato: serve un `.task` per
   MediaPipe, non un `.gguf` (quello è per llama.cpp) né un `-MLC` (quello è per
   WebLLM). L'errore compare in pagina.
4. **La pagina resta bianca.** Collega il telefono e apri `chrome://inspect` da
   un computer: il WebView è ispezionabile e la console dice cosa manca. Il
   sospetto numero uno è aver saltato `npm run build:android`.
