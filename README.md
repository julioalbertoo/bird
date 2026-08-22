# 🐦 ¿Qué pájaro es?

Página web que escucha **10 segundos** desde tu micrófono y te dice qué ave ha
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
2. Pulsa **Escuchar 10 segundos** y acerca el micrófono al canto.
3. Verás la especie más probable y hasta 4 alternativas con su confianza.

Mientras escucha, el botón late con un halo y aparece un **ecualizador de 28
barras que se mueve con lo que entra por el micrófono** (un `AnalyserNode` mide
el volumen de cada banda de frecuencia), junto a la cuenta atrás. Así se ve de
un vistazo que el micro está captando sonido. Si el navegador no permite
analizar el audio, las barras se mueven igual con una onda de CSS; y si el
sistema pide menos movimiento (`prefers-reduced-motion`), se quedan quietas.

Opcionalmente puedes permitir la geolocalización: BirdNET tiene un **modelo
geográfico** aparte que, a partir de latitud, longitud y semana del año, estima
cómo de habitual es cada especie ahí y en esa época. Las que no llegan al umbral
se descartan directamente, así que no salen aves de otro continente. Debajo del
botón se indica si el filtro está activo y cuántas especies son esperables en tu
zona; sin permiso de ubicación no se filtra nada y se consideran las ~6.500
especies del mundo. La app también anota dónde conseguiste el mejor acierto de
cada especie. Las coordenadas se guardan solo en tu dispositivo, igual que el
resto de la colección.

Dos detalles del modelo geográfico: parte el año en **48 semanas** (4 por mes,
no 52), y no sabe nada de los sonidos que no son aves (perro, sirena, voz…), así
que esos nunca se filtran por zona.

### Las cotorras y demás especies asilvestradas

El modelo geográfico aprende de datos de observación que reflejan sobre todo el
**área de distribución nativa** de cada ave, así que a las poblaciones
introducidas les asigna una frecuencia ridícula aunque estén por todas partes.
La **cotorra argentina** en Madrid saca `0.004` en agosto (frente a `0.997` en
Buenos Aires) y solo supera el umbral entre diciembre y primeros de febrero; la
**cotorra de Kramer** no lo supera **ninguna** semana del año. Resultado: el
filtro las borraba antes de mirar siquiera lo que había oído el micrófono.

Por eso hay en `birdnet.js` una lista corta, `ASILVESTRADAS`, con especies que
crían aquí pero que el modelo geográfico no reconoce como locales (las dos
cotorras, la alejandrina, el miná, el ganso del Nilo, el bengalí rojo, la
estrilda, el obispo, el leiótrix y el tejedor cabecinegro). Igual que los
sonidos que no son aves, **no se filtran por zona**: para ellas manda solo el
umbral de audio. Si te falta alguna, basta con añadir su nombre científico —tal
como aparece en `models/birdnet/labels/en_us.txt`— a ese `Set`.

## ¿Con qué confianza se considera un acierto?

BirdNET no da un sí/no, sino una **confianza de 0 a 1** (0 %–100 %) para cada
una de las ~6.500 especies que conoce. El umbral que decide qué se muestra está
en `birdnet.js`:

| Constante | Valor | Qué hace |
|-----------|-------|----------|
| `MIN_AUDIO_CONFIDENCE` | `0.03` (**3 %**) | Confianza mínima para que una especie cuente como detección. Por debajo se descarta como ruido. |
| `MIN_AREA_CONFIDENCE` | `0.03` (**3 %**) | Umbral geográfico: frecuencia mínima con la que la especie aparece en tu zona y semana para que se tenga en cuenta. Es el valor por defecto de BirdNET (`--sf_thresh`). Las especies de `ASILVESTRADAS` se lo saltan. |

Es decir: **a partir del 3 % una especie ya se considera un acierto** y aparece
en la lista. Es un umbral deliberadamente bajo (BirdNET reparte la probabilidad
entre miles de especies, así que valores del 10 %–50 % ya son coincidencias
fuertes). El porcentaje que ves junto a cada ave es esa confianza, no una
probabilidad de que sea "la correcta".

Puedes hacerlo más estricto subiendo `MIN_AUDIO_CONFIDENCE` (por ejemplo `0.1`
para pedir al menos un 10 %) o afinar el filtro de zona con
`MIN_AREA_CONFIDENCE`: subirlo deja fuera a las especies poco frecuentes de tu
área, bajarlo permite que aparezcan rarezas y aves de paso. Para colar una
especie concreta que el modelo geográfico no ubica bien, es mejor añadirla a
`ASILVESTRADAS` que bajar el umbral a todo el mundo.

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
4. Se muestran hasta **5 cartas**: la primera es la **coincidencia principal**
   (la más alta) y detrás van las alternativas.

BirdNET también reconoce sonidos que no son de aves (perro, motor, voz humana,
sirena…). Si el resultado más probable es uno de esos, la interfaz lo avisa
antes de las cartas ("lo que más suena no parece un pájaro") y detrás enseña las
posibles aves de fondo.

### Revelado tipo sobre

Lo que se acaba de escuchar sale como **cartas**, iguales que las de la
colección, y se revelan **una a una**, como al abrir un sobre en FUT: cada carta
gira sobre sí misma, estalla un destello del color de su categoría y un brillo
la recorre al aterrizar. Las de **oro** son el premio gordo: destellan más fuerte
y se quedan un rato con el halo dorado.

- La **valoración** de estas cartas es el acierto de **esa escucha**, no el mejor
  histórico (eso es lo que muestra la colección de abajo). La categoría también
  mira solo a esa escucha: si la hiciste sin ubicación, salen todas negras
  aunque en la colección esas especies ya tuvieran medalla.
- Debajo del nombre, en lugar del recuento, las especies que **nunca se habían
  escuchado** se cantan con un **¡NUEVA!**; el resto indica por cuántas veces van.
- **Pulsa cualquiera** para maximizarla: se abre la misma carta ampliada de la
  colección, con todas las estadísticas acumuladas de esa especie.
- Quien tenga activado *reducir movimiento* ve las cartas ya puestas, sin
  revelado ni destellos.

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

**…salvo que la escucharas sin ubicación.** Sin geolocalización no hay filtro
por zona: la especie no se ha contrastado con lo que de verdad vuela por allí,
así que por muy alta que sea la confianza **no se lleva medalla** y sale como
**carta negra** (⬛ *Sin zona*), detrás de todas las demás en la colección.

Basta con volver a escucharla **una vez** con la ubicación activada para que
recupere medalla, y a partir de ese momento **la carta se valora solo con las
escuchas hechas con zona**: la categoría sale de la mejor nota lograda con la
ubicación activada, y todas sus estadísticas (`MÁX`, `MED`, `MÍN`, `ÚLT`, `REG`)
se calculan con ese grupo. Un 95 % conseguido a ciegas no sirve para subir de
categoría; solo `VEC` sigue contando todas las veces que la has escuchado.

Las cartas que ya estaban en la colección antes de esta regla conservan su
categoría: no hay forma de saber si se escucharon con ubicación, y no tendría
gracia que la colección entera se volviera negra. Eso sí, en cuanto vuelvas a
escuchar una de ellas con la ubicación puesta pasa a valorarse solo con esa
nota, que es la primera contrastada de verdad — así que puede bajar de
categoría.

- Cada especie tiene **una sola carta**, la de **mayor categoría** alcanzada: la
  cuadrícula muestra solo la valoración y el nombre; la categoría ya se ve en el
  color de la carta, así que no se escribe.
- **El icono se ve más nítido cuanto mejor es la carta**: la negra es la más
  borrosa, el bronce sale bastante desenfocado, la plata solo un poco y el oro
  perfectamente limpio.
- **Pulsa una carta para maximizarla** (o navega con el tabulador y pulsa Enter).
  La carta ampliada añade el nombre científico, la categoría escrita y sus
  estadísticas: `MÁX` mejor acierto (la valoración), `MED` media, `MÍN` peor,
  `ÚLT` último, `REG` regularidad (100 = siempre acierta parecido) y `VEC` veces
  escuchada. Debajo indica **cuándo y dónde se logró el `MÁX`** (fecha y
  coordenadas); la ubicación solo aparece si diste permiso de geolocalización en
  esa grabación. Las cartas negras avisan además de que están sin categoría por
  haberse escuchado sin ubicación. Se cierra con la ✕, con Escape o pulsando fuera.
- La carta ampliada de un ave enseña también un enlace **📖 Wikipedia** al
  artículo de la especie. Solo aparece **si el artículo existe**: se comprueba
  con la API de Wikipedia buscando el nombre científico primero en español y,
  si esa especie no lo tiene, en inglés (entonces el enlace pone `📖 Wikipedia
  (EN)`). El resultado se guarda en el dispositivo, así que cada especie se
  consulta una sola vez; sin conexión la carta sale igual, sin enlace.
- Las cartas se ordenan por **valoración, de mayor a menor** (primero el oro); las
  **negras** van detrás de todas las que tienen medalla, y los **sonidos que no
  son aves** (motor, voz humana, ruido…) siempre al final.
- Cada especie luce el **icono de su grupo** (ver abajo), y los sonidos que no son
  aves el suyo: 🐕 perro, 🚗 motor, 🗣️ voz…
- Se guarda **localmente en tu dispositivo** (`localStorage`), no se sube a
  ningún sitio y persiste entre visitas.
- Cada grabación suma **+1** por especie/sonido mostrado; si algo aparece varias
  veces en la misma grabación solo cuenta una vez.
- Las entradas guardadas antes de que se registraran confianzas no tienen datos:
  su carta muestra `—` y se queda en bronce hasta que vuelvas a escucharlas. Lo
  mismo con la fecha y el sitio del `MÁX`: no se muestran hasta que batas esa
  marca con una escucha nueva.

## Los iconos: uno por grupo de especie

Ninguna carta se queda ya con el pájaro genérico si se puede afinar más. BirdNET
conoce ~6.500 especies, así que en vez de mapearlas una a una la app busca la
palabra del grupo en el nombre (español o inglés) o en el género científico, y le
asigna su icono. Son **50 iconos distintos** y cubren el 85 % de las especies;
el resto se queda con 🐦. El icono sale tanto en los resultados de cada escucha
como en las cartas de la colección.

| Icono | Grupo | Icono | Grupo |
| --- | --- | --- | --- |
| 🦅 | rapaces | 🦉 | búhos y lechuzas |
| 🌙 | chotacabras y nictibios | 🦜 | loros y cotorras |
| 🎵 | zorzales, alondras, currucas de canto | 🍃 | mosquiteros, reinitas, vireos |
| 🪰 | papamoscas y tiranos | 🐜 | hormigueros y batarás |
| 🐤 | pinzones, gorriones, semilleros | 🎨 | tangaras y eufonias |
| 🪵 | pájaros carpinteros | 🪺 | horneros, pijuíes, ticoticos |
| 🌺 | colibríes, suimangas, mieleros | 🐦‍⬛ | cuervos, urracas, estorninos |
| 🕊️ | palomas y tórtolas | 🪽 | vencejos y golondrinas |
| 🦆 🪿 🦢 | patos, gansos, cisnes | 💧 | zampullines y colimbos |
| 🦩 | garzas, cigüeñas, grullas | 🌾 | rascones y fochas |
| 🌊 | gaviotas y aves marinas | 🏖️ | limícolas de orilla |
| 🐔 🐓 🦃 🦚 | gallináceas | 🦤 | avestruces y tinamúes |
| ⏰ | cucos | 🌈 | trogones, pitas, carracas |
| 🥭 | tucanes, cálaos, barbudos | 🐟 | martines pescadores |
| 🐝 | abejarucos | 🍯 | indicadores |
| 👓 | anteojitos | 🪹 | tejedores y oropéndolas |
| 🗡️ | alcaudones | 🥜 | carboneros y herrerillos |
| 🌳 | trepadores y agateadores | 👑 | abubillas |
| 🪶 | aves del paraíso, cotingas | 🐧 | pingüinos |
| 🐸 🦗 | ranas, grillos, chicharras | 🐿️ 🐒 🐺 🦌 | mamíferos |

Las reglas viven en `SPECIES_EMOJI` (`index.html`) y se prueban en orden, así que
lo específico va antes que lo general: un «Antpitta» es hormiguero y no pita, y un
«Owlet-nightjar» es chotacabras y no búho. Las cartas guardadas antes de que
existieran los iconos por grupo se recalculan al dibujarlas.

## Versión

El pie de página muestra la **versión** de la app (p. ej. `v1.0.0`). Es un
número incremental que sube en cada push a `main`: el dígito de parche aumenta
en uno por publicación (`v1.0.0` → `v1.0.1` → …). La constante vive en el
`<div class="version">` de `index.html`, junto al comentario `APP_VERSION`.

No hay que tocarla a mano: el workflow `.github/workflows/version-bump.yml` se
dispara con cada push a `main`, incrementa el parche y publica un commit
`vX.Y.Z [skip version]`. Ese sufijo evita que el propio commit vuelva a
disparar el bump. Para saltarte el incremento en un push concreto, incluye
`[skip version]` en el mensaje del commit.

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
