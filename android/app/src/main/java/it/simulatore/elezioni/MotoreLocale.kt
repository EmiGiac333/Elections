package it.simulatore.elezioni

import android.content.Context
import android.net.Uri
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInference.LlmInferenceOptions
import java.io.File

/**
 * Il modello che gira sul telefono.
 *
 * A differenza della versione web, qui l'inferenza è nativa: sullo stesso
 * dispositivo va parecchie volte più veloce di WebGPU dentro il browser, che
 * paga il costo di passare per il motore grafico del browser.
 *
 * Il file del modello lo sceglie l'utente dalla memoria del telefono. Non viene
 * scaricato in automatico di proposito: i modelli distribuiti da Google
 * richiedono di accettare una licenza, e un download silenzioso fallirebbe con
 * un errore incomprensibile.
 */
class MotoreLocale(private val context: Context) {

    private var inferenza: LlmInference? = null
    private var nomeModello: String = ""
    @Volatile private var interrotto = false

    val pronto: Boolean get() = inferenza != null
    val modello: String get() = nomeModello

    /**
     * Copia il modello scelto dentro l'app e lo carica.
     *
     * La copia serve perché il motore vuole un percorso di file leggibile
     * direttamente, mentre il selettore di sistema restituisce un URI che non
     * sempre corrisponde a un file accessibile.
     */
    fun carica(uri: Uri, nomeVisibile: String) {
        chiudi()

        val destinazione = File(context.filesDir, "modello.task")
        context.contentResolver.openInputStream(uri).use { ingresso ->
            requireNotNull(ingresso) { "Non riesco ad aprire il file scelto." }
            destinazione.outputStream().use { uscita -> ingresso.copyTo(uscita) }
        }

        val opzioni = LlmInferenceOptions.builder()
            .setModelPath(destinazione.absolutePath)
            // Deve bastare al prompt di un blocco più la sua risposta.
            .setMaxTokens(4096)
            .build()

        inferenza = LlmInference.createFromOptions(context, opzioni)
        nomeModello = nomeVisibile
    }

    /**
     * Genera una risposta. Bloccante: va chiamata fuori dal thread
     * dell'interfaccia, altrimenti l'app resta ferma per minuti.
     */
    fun genera(sistema: String, richiesta: String): String {
        val motore = inferenza ?: error("Nessun modello caricato: scegline uno dal telefono.")
        interrotto = false

        // L'API non separa istruzioni di sistema e richiesta: si uniscono.
        val prompt = buildString {
            append(sistema.trim())
            append("\n\n")
            append(richiesta.trim())
        }

        val risposta = motore.generateResponse(prompt)
        if (interrotto) error("Generazione interrotta.")
        return risposta
    }

    /**
     * Segnala che la generazione in corso non serve più.
     *
     * Il motore non espone un annullamento vero: quel che si può fare è
     * scartare il risultato ed evitare che parta la richiesta successiva, cosa
     * di cui si occupa la pagina.
     */
    fun interrompi() {
        interrotto = true
    }

    fun chiudi() {
        inferenza?.close()
        inferenza = null
        nomeModello = ""
    }
}
