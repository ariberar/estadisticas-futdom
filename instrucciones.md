# Estadísticas F7 — sitio web (GitHub Pages)

Esta carpeta es el sitio listo para publicar. La página (`index.html`) es la misma que
usás localmente, pero cuando está hosteada **lee los datos de la carpeta `data/`**, así que
para agregar un partido nuevo solo tocás los datos y tus amigos lo ven al recargar —
nunca hay que volver a pasar el `.html`.

## Estructura
```
index.html                 ← el panel
data/
  manifest.json            ← lista de archivos que carga la página
  jugadores.json           ← registro de jugadores
  partido_NN_AAAA-MM-DD.json  ← un archivo por partido
  temporada_2026.json      ← bundle (respaldo, no imprescindible)
timelines/
  20260906_timeline.html   ← timeline del anotador con links a YouTube (último partido)
```

## Publicar en GitHub Pages (una sola vez)
1. Creá una cuenta en github.com (gratis) si no tenés.
2. Creá un repositorio nuevo, por ejemplo `estadisticas-f7` (puede ser público; ojo: en el
   plan gratuito de Pages el sitio queda **público**, cualquiera con el link lo ve).
3. Subí **todo el contenido de esta carpeta** al repo (podés arrastrar los archivos en la
   web de GitHub con "Add file → Upload files", o usar git). Importante: que `index.html`
   quede en la raíz del repo, no dentro de otra carpeta.
4. En el repo: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**,
   Branch: `main`, carpeta `/ (root)` → Save.
5. Esperá 1–2 minutos. GitHub te muestra la URL, del tipo
   `https://TU-USUARIO.github.io/estadisticas-f7/`. Ese es el link para tus amigos.

## Agregar un partido nuevo (cada domingo)
1. Conseguí el `.json` del partido nuevo (el que exporta el anotador, o el que
   generemos desde la planilla). Nombralo `partido_33_AAAA-MM-DD.json`.
2. Subilo a la carpeta `data/` del repo.
3. Editá `data/manifest.json` y agregá el nombre del archivo nuevo a la lista `"partidos"`.
4. Listo: al recargar la página aparece el partido. No se toca `index.html`.

**Timeline con videos:** si querés que un partido tenga el botón "▶ Ver timeline con
videos", subí el `AAAAMMDD_timeline.html` que exporta el anotador a la carpeta `timelines/`
y avisame para agregar esa línea en el panel (hay un mapa `TIMELINES` arriba del script).
El último partido (32) ya lo tiene.

## Uso local
Si abrís `index.html` con doble clic (sin servidor), la página usa los datos **embebidos**
dentro del HTML, así que funciona igual offline. Los datos de `data/` solo se leen cuando
está servida por http (GitHub Pages o un servidor local).
