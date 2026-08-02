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
las especies probables en tu zona y época del año, y la app anota dónde
conseguiste el mejor acierto de cada especie. Las coordenadas se guardan solo en
tu dispositivo, igual que el resto de la colección.

## ¿Con qué confianza se considera un acierto?

BirdNET no da un sí/no, sino una **confianza de 0 a 1** (0 %–100 %) para cada
una de las ~6.500 especies que conoce. El umbral que decide qué se muestra está
en `birdnet.js`:

| Constante | Valor | Qué hace |
|-----------|-------|----------|
| `MIN_AUDIO_CONFIDENCE` | `0.03` (**3 %**) | Confianza mínima para que una especie cuente como detección. Por debajo se descarta como ruido. |
| `MIN_AREA_CONFIDENCE` | `0.0` (**0 %**) | Umbral geográfico. En `0` no descarta ninguna especie por la zona; el dato geográfico solo se usa para reordenar. |

Es decir: **a partir del 3 % una especie ya se considera un acierto** y aparece
en la lista. Es un umbral deliberadamente bajo (BirdNET reparte la probabilidad
entre miles de especies, así que valores del 10 %–50 % ya son coincidencias
fuertes). El porcentaje que ves junto a cada ave es esa confianza, no una
probabilidad de que sea "la correcta".

Puedes hacerlo más estricto subiendo `MIN_AUDIO_CONFIDENCE` (por ejemplo `0.1`
para pedir al menos un 10 %) o filtrar por zona subiendo `MIN_AREA_CONFIDENCE`.

## ¿Y si escucha varias aves (o varios sonidos)?

La grabación de 10 s se analiza por **ventanas de 3 segundos** (lo que espera el
modelo). Para cada ventana BirdNET puntúa todas las especies a la vez, así que
un mismo audio puede devolver varias aves distintas. El flujo (`index.html`) es:

1. Se recorren las ventanas de 3 s (la última se rellena con silencio si hace
   falta) y se ejecuta el modelo en cada una.
2. De todas las detecciones (confianza > 3 %) se guarda, **por especie, la
   confianza más alta** de cualquier ventana. Así una ave que solo canta en un
   tramo no se penaliza por los tramos en que calla.
3. La lista se ordena de mayor a menor confianza.
4. Se muestra la **coincidencia principal** (la más alta) y hasta **4
   alternativas** debajo.

BirdNET también reconoce sonidos que no son de aves (perro, motor, voz humana,
sirena…). Si el resultado más probable es uno de esos, la interfaz lo señala
como "No parece un pájaro" y lista aparte las posibles aves de fondo.

## Tu colección: cartas tipo Ultimate Team

Al final de la página se muestra **"Tu colección"**: cada ave o sonido escuchado
es una **carta** al estilo Ultimate Team, en una cuadrícula de **3 por fila**.

**La valoración de la carta** es el **mejor acierto** registrado para esa especie
(la confianza máxima, en %), y esa valoración decide su **categoría base**:

| Categoría | Valoración |
| --- | --- |
| 🥉 **Bronce** | hasta 64 |
| 🥈 **Plata** | de 65 a 74 |
| 🥇 **Oro** | 75 o más |

- Cada especie tiene **una sola carta**, la de **mayor categoría** alcanzada: la
  cuadrícula muestra solo la valoración y el nombre; la categoría ya se ve en el
  color de la carta, así que no se escribe.
- **Pulsa una carta para maximizarla** (o navega con el tabulador y pulsa Enter).
  La carta ampliada añade el nombre científico, la categoría escrita y sus
  estadísticas: `MÁX` mejor acierto (la valoración), `MED` media, `MÍN` peor,
  `ÚLT` último, `REG` regularidad (100 = siempre acierta parecido) y `VEC` veces
  escuchada. Debajo indica **cuándo y dónde se logró el `MÁX`** (fecha y
  coordenadas); la ubicación solo aparece si diste permiso de geolocalización en
  esa grabación. Se cierra con la ✕, con Escape o pulsando fuera.
- Las cartas se ordenan por **valoración, de mayor a menor** (primero el oro), y los
  **sonidos que no son aves** (motor, voz humana, ruido…) van siempre al final.
  Cada uno lleva su emoji: 🐦 aves, 🐕 perro, 🚗 motor, 🗣️ voz…
- Se guarda **localmente en tu dispositivo** (`localStorage`), no se sube a
  ningún sitio y persiste entre visitas.
- Cada grabación suma **+1** por especie/sonido mostrado; si algo aparece varias
  veces en la misma grabación solo cuenta una vez.
- Las entradas guardadas antes de que se registraran confianzas no tienen datos:
  su carta muestra `—` y se queda en bronce hasta que vuelvas a escucharlas. Lo
  mismo con la fecha y el sitio del `MÁX`: no se muestran hasta que batas esa
  marca con una escucha nueva.
- El botón **Borrar** vacía la colección.

## Versión

El pie de página muestra la **versión** de la app (p. ej. `v1.0.0`). Es un
número incremental que sube en cada push a `main`: el dígito de parche aumenta
en uno por publicación (`v1.0.0` → `v1.0.1` → …). La constante vive en el
`<div class="version">` de `index.html`, junto al comentario `APP_VERSION`.

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
