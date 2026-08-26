plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "it.simulatore.elezioni"
    compileSdk = 35

    defaultConfig {
        applicationId = "it.simulatore.elezioni"
        // L'inferenza su GPU richiede Android 8; sotto non ha senso provarci.
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    // I file del modello sono già compressi: comprimerli di nuovo nell'APK
    // rallenterebbe soltanto.
    androidResources {
        noCompress += listOf("task", "litertlm", "bin", "gguf")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    // Serve a servire l'interfaccia da un'origine https finta: i moduli
    // JavaScript non si caricano da file://.
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Inferenza on-device. Se Gradle non trovasse questa versione, sostituirla
    // con l'ultima disponibile: l'API usata qui è stabile da tempo.
    implementation("com.google.mediapipe:tasks-genai:0.10.24")
}
