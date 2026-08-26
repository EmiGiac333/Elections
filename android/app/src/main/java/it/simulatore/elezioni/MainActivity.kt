package it.simulatore.elezioni

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * L'app è l'interfaccia web del simulatore dentro un WebView, con una sola
 * differenza: l'inferenza non passa più da WebGPU ma dal motore nativo.
 *
 * Riusare la pagina invece di riscrivere l'interfaccia in Kotlin non è pigrizia:
 * simulazione, prompt, suddivisione in blocchi e riparazione delle risposte
 * sono già scritti e collaudati: riscriverli sarebbe stato il modo più rapido
 * per introdurre differenze fra le due versioni.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var motore: MotoreLocale
    private val ambito = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val selettoreModello =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            if (uri == null) {
                inviaEvento("modello-annullato", JSONObject())
                return@registerForActivityResult
            }
            caricaModello(uri)
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        motore = MotoreLocale(applicationContext)

        // I moduli JavaScript non si caricano da file://: serve un'origine
        // https, e questa la fabbrica servendo gli asset dell'app.
        val caricatore = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = caricatore.shouldInterceptRequest(request.url)
            }
            addJavascriptInterface(PonteJs(), "AndroidLLM")
            loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
        }

        setContentView(webView)
        WebView.setWebContentsDebuggingEnabled(true)
    }

    override fun onDestroy() {
        ambito.cancel()
        motore.chiudi()
        super.onDestroy()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    private fun caricaModello(uri: Uri) {
        val nome = uri.lastPathSegment?.substringAfterLast('/') ?: "modello"
        inviaEvento("modello-caricamento", JSONObject().put("nome", nome))

        ambito.launch {
            val esito = runCatching {
                withContext(Dispatchers.IO) {
                    contentResolver.takePersistableUriPermission(
                        uri,
                        android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION,
                    )
                    motore.carica(uri, nome)
                }
            }

            if (esito.isSuccess) {
                inviaEvento("modello-pronto", JSONObject().put("nome", nome))
            } else {
                inviaEvento(
                    "modello-errore",
                    JSONObject().put("messaggio", esito.exceptionOrNull()?.message ?: "errore sconosciuto"),
                )
            }
        }
    }

    /** Manda una notifica alla pagina, che la smista ai suoi ascoltatori. */
    private fun inviaEvento(tipo: String, dati: JSONObject) {
        val payload = dati.put("tipo", tipo).toString()
        runOnUiThread {
            webView.evaluateJavascript("window.__nativeEvento && window.__nativeEvento($payload)", null)
        }
    }

    private fun rispondi(id: Int, testo: String?, errore: String?) {
        val argomenti = listOf(
            id.toString(),
            if (testo == null) "null" else JSONObject.quote(testo),
            if (errore == null) "null" else JSONObject.quote(errore),
        ).joinToString(", ")

        runOnUiThread {
            webView.evaluateJavascript("window.__nativeRisposta && window.__nativeRisposta($argomenti)", null)
        }
    }

    /**
     * Quel che la pagina può chiedere al lato nativo.
     *
     * Ogni metodo qui è raggiungibile dal JavaScript della pagina: la superficie
     * va tenuta al minimo, e il WebView carica soltanto gli asset dell'app.
     */
    private inner class PonteJs {

        @JavascriptInterface
        fun stato(): String =
            JSONObject()
                .put("pronto", motore.pronto)
                .put("modello", motore.modello)
                .put("motore", "MediaPipe")
                .toString()

        @JavascriptInterface
        fun scegliModello() {
            runOnUiThread {
                // I modelli non hanno un tipo MIME riconosciuto: si accetta
                // qualsiasi file e si lascia fallire il caricamento con un
                // messaggio chiaro se non è un modello valido.
                selettoreModello.launch(arrayOf("*/*"))
            }
        }

        @JavascriptInterface
        fun genera(id: Int, sistema: String, richiesta: String, maxToken: Int) {
            ambito.launch {
                val esito = runCatching {
                    withContext(Dispatchers.Default) { motore.genera(sistema, richiesta) }
                }
                esito.fold(
                    onSuccess = { rispondi(id, it, null) },
                    onFailure = { rispondi(id, null, it.message ?: "errore durante la generazione") },
                )
            }
        }

        @JavascriptInterface
        fun interrompi() {
            motore.interrompi()
        }
    }
}
