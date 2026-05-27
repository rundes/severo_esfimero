# Despliegue

El sitio se publica con **GitHub Pages** desde la rama **`gh-pages`** (raíz `/`). No hay build ni GitHub Actions: el deploy es manual y consiste en copiar los archivos de la app a `gh-pages`.

URL: https://rundes.github.io/severo_esfimero/ · `basePath` efectivo: `/severo_esfimero/` (ver `manifest.json` `start_url`/`scope`).

## Convención de ramas

| Rama | Contiene | Historia |
|------|----------|----------|
| **`main`** | Fuente completa: app **+ documentación** (`README.md`, `docs/`, `PRODUCT.md`, `DESIGN.md`, `CHANGELOG.md`). | Commits `feat:` / `fix:`. |
| **`gh-pages`** | **Solo la app** que se sirve: `index.html`, `severo.html`, `css/`, `js/`, `icons/`, `manifest.json`, `sw.js`, `version.json`. **No** lleva docs. | Commits `Deploy vX.Y: …`, uno por cada cambio publicado. |

`gh-pages` omite deliberadamente la documentación: solo viaja lo necesario para correr.

## Pasos para publicar

1. **Subir versión** (ver abajo) en `main`.
2. Commit en `main`:
   ```bash
   git add -A
   git commit -m "feat: <descripción> (vX.Y)"
   git push origin main
   ```
3. **Deploy a `gh-pages`** — copiar solo los archivos de app cambiados:
   ```bash
   git checkout gh-pages
   git checkout main -- index.html severo.html manifest.json js/app.js version.json
   git commit -m "Deploy vX.Y: <descripción>"
   git push origin gh-pages
   git checkout main
   ```
   (Ajustá la lista de archivos a lo que tocó el cambio; nunca incluyas docs.)
4. **Verificar** que el sitio quedó en la versión nueva:
   ```bash
   curl -s "https://rundes.github.io/severo_esfimero/version.json?t=$(date +%s)"
   # → {"version":"X.Y"}
   ```
   GitHub Pages tarda ~1 min en reconstruir; la CDN (Fastly) puede cachear, así que forzá recarga con cache-bust.

## Subir versión (force-update)

La actualización forzada compara `version.json` (servidor) contra `APP_VERSION` (código). Si no subís la versión, **los dispositivos en campo no reciben el aviso de actualización**. Subí estos valores en **ambos builds**:

| Lugar | Archivo |
|-------|---------|
| `{"version":"X.Y"}` | `version.json` |
| `const APP_VERSION = 'X.Y'` | `js/app.js` **y** `severo.html` |
| `<span class="auth-version">vX.Y</span>` | `js/app.js` **y** `severo.html` |
| `<span class="footer-version">vX.Y</span>` | `js/app.js` **y** `severo.html` |

> `VERSION` y `CHANGELOG.md` históricamente quedaron rezagados respecto de la versión real; la fuente de verdad para el force-update es `version.json` + `APP_VERSION`.

## Mantener `severo.html` en sync

`severo.html` es un espejo monolítico de `index.html` + `js/*.js`. **Todo cambio funcional, de copy o de versión debe aplicarse también ahí**, en el mismo commit. Antes de publicar, verificá que no quedaron divergencias.

## Service Worker

Al publicar código nuevo, el SW es *network-first* para HTML/JS/`version.json`, así que el contenido fresco se sirve en la próxima carga. El overlay de force-update se encarga de desregistrar SW viejos y limpiar cachés cuando cambia la versión. Si hace falta invalidar todo manualmente, subir `const CACHE` en `sw.js`.
