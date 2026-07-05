# 🐦 ¿Qué pájaro es?

Página web que graba **10 segundos** desde tu micrófono y te dice qué ave ha
escuchado, usando el modelo **[BirdNET](https://birdnet.cornell.edu)** del
K. Lisa Yang Center for Conservation Bioacoustics (Cornell).

Todo el procesamiento ocurre **en tu navegador** con TensorFlow.js: el audio
nunca sale de tu dispositivo.

## Uso

Al ser una página estática necesita servirse por HTTP (el micrófono requiere un
contexto seguro: `https://` o `localhost`).

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

1. Espera a que cargue el modelo (~50 MB, la primera vez).
2. Pulsa **Grabar 10 segundos** y acerca el micrófono al canto.
3. Verás la especie más probable y hasta 4 alternativas con su confianza.

Opcionalmente puedes permitir la geolocalización: BirdNET la usa para priorizar
las especies probables en tu zona y época del año.

## Despliegue

Es una web estática; funciona tal cual en GitHub Pages (usa rutas relativas,
así que también sirve bajo un subdirectorio como `usuario.github.io/bird/`).

## Estructura

- `index.html` — interfaz y flujo de grabación/análisis.
- `birdnet.js` — worker de inferencia (capa MelSpec + kernel STFT en WebGL/WebGPU).
- `vendor/tf.min.js` — TensorFlow.js incluido localmente (sin CDN).
- `models/birdnet/` — modelo BirdNET, modelo geográfico y etiquetas (es / científico).

## Créditos

Modelo **BirdNET** — <https://birdnet.cornell.edu>. Implementación en navegador
inspirada en [georg95/birdnet-web](https://github.com/georg95/birdnet-web).
