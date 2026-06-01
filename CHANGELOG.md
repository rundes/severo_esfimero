# Changelog

## v2.8.10 — 2026-06-01 — Bump de versión centralizado en `version.json` + `scripts/bump.js`

### Problema
- La versión vivía duplicada en 5 lugares: `version.json`, `js/app.js`
  (`APP_VERSION`), `severo.html` (`APP_VERSION`), `index.html`
  (`BUILD` del IIFE) y `sw.js` (`CACHE`). En cada release había que
  editar los 5 a mano y era fácil olvidarse de alguno (la app
  publicada decía v2.8 cuando internamente era v2.8.7).

### Solución
- **Fuente única de verdad**: `version.json`.
- **Nuevo script** `scripts/bump.js` (Node, sin dependencias) que
  propaga el valor de `version.json` a las otras 4 ubicaciones.
- Acepta `patch` / `minor` / `major` para bumpear semver, una versión
  explícita `X.Y.Z`, o ningún argumento (solo re-propaga la versión
  actual de `version.json`).
- `sw.js` `CACHE` ahora es semver (`severo-v2.8.10`) en vez de
  contador (`severo-v20`) → un solo formato consistente.

### Uso
```bash
node scripts/bump.js patch       # bump + propagación
node scripts/bump.js 3.1.4       # versión explícita + propagación
node scripts/bump.js             # solo propagación (post-edit manual)
```

El script no commitea ni pushea: solo escribe. El usuario revisa el
diff y decide cuándo commit + deploy.

### Doc
- `docs/DESPLIEGUE.md` actualizado con el flujo nuevo y la tabla
  de las 5 ubicaciones que el script mantiene en sync.

## v2.8.9 — 2026-05-30 — Force-update propaga `?_v=` a todos los JS desde el primer load

### Bug
- Tras un deploy, algunos relevadores reportaban que la app cargaba la
  pantalla nueva pero los servicios (búsqueda, geo, fotos) seguían
  comportándose como la versión vieja. Síntoma típico de un `index.html`
  fresco que carga JS files cacheados (browser HTTP cache / CDN).

### Causa
- El IIFE en `index.html` propagaba `?_v=` a los scripts SOLO cuando la
  URL ya traía ese parámetro (caso force-update overlay). En primera
  visita / nueva sesión sin `?_v=`, los scripts se cargaban como
  `js/app.js` (sin query) → el browser/CDN podía servir respuestas
  cacheadas previas al deploy, mientras `index.html` venía fresco
  (network-first del SW). Resultado: index nuevo + lógica vieja → los
  "servicios" del JS fallaban silenciosamente.
- Adicionalmente, el SW hacía `fetch(e.request)` sin opciones de
  cache, así que su request al network podía ser servida por el HTTP
  cache del browser y guardarse stale en el cache del SW.

### Fix
- **`index.html`**: el IIFE ahora siempre adjunta `?_v=` a cada script.
  Default = `BUILD` literal del release (hardcoded, bumpear con cada
  deploy). Si la URL trae `?_v=` (overlay de force-update), gana ese
  valor. Garantiza URL única por release → primera visita ya recibe
  JS fresco. Además se reemplazó `document.write()` por
  `document.createElement('script')` + `appendChild` con
  `async = false` para preservar el orden de carga (config.js antes
  que app.js, etc.). Más seguro (XSS / CSP) y sin warnings del browser.
- **`sw.js`**: el network-first para HTML/JS/version.json ahora usa
  `fetch(e.request, { cache: 'no-cache' })`. Fuerza revalidación
  contra el origen (server) y bypasea el HTTP cache del browser, así
  el SW nunca guarda una respuesta stale en su propio cache.

### Infra
- `version.json` 2.8.8 → 2.8.9. `APP_VERSION` actualizado en
  `js/app.js` y `severo.html`. `CACHE = 'severo-v20'` en `sw.js`.
- `BUILD = '2.8.9'` en el IIFE de `index.html` (marcador comentado
  `BUMP_HERE` para acordarse en el próximo release).

## v2.8.8 — 2026-05-30 — Versión dinámica en pantalla de auth y footer

### Bug
- La pantalla inicial (auth) y el footer mostraban "v2.8" hardcoded
  desde que se introdujo la display. Cada bump de versión obligaba
  a editarlas a mano y se olvidaba; la app publicada decía v2.8
  aunque internamente fuera v2.8.7.

### Fix
- `js/app.js:446` y `js/app.js:513`: reemplacé `v2.8` por
  `v${APP_VERSION}` dentro de los template literals de `renderAuth()`
  y del `<footer class="app-footer">`. `APP_VERSION` ya está definido
  en `js/app.js:1` y disponible en scope.
- Mismas dos posiciones en `severo.html` (build monolítico).

### Infra
- `version.json` 2.8.7 → 2.8.8. `APP_VERSION` actualizado en
  `js/app.js` y `severo.html`. `CACHE = 'severo-v19'` en `sw.js`.

## v2.8.7 — 2026-05-30 — Fix completo: nombre real de la pestaña + quoting helper

### Bug
- v2.8.6 (parallel) agregó comillas simples al sheet name pero seguía
  apuntando a `'Padron integrado'`. La pestaña real se llama
  **`Padron`** (sin el sufijo), así que el 400 persistía: `"Unable to
  parse range"` porque la hoja no existe con ese nombre.

### Fix
- `CONFIG.SHEET_PADRON: 'Padron'` (era `'Padron integrado'`) en
  `js/config.js` y bloque CONFIG inline de `severo.html`.
- `docs/CONFIGURACION.md` actualizado.

### Mejoras sobre el quoting de v2.8.6
- Helper nuevo `Padron._quoteSheetName(name)` que escapa correctamente
  single quotes embebidos (`'` → `''`) según la sintaxis A1 del Sheets
  API. Reemplaza el `"'" + sheetName + "'"` inline introducido en
  v2.8.6 (que no escapaba quotes).
- Mismo helper aplicado a `coordRange` / `coordRangeFull` de
  `_rowToPadronRecord` (usado por `_apiUpdateLatLng` para escribir
  lat/lng tras la captura).

### Infra
- `version.json` 2.8.6 → 2.8.7. `APP_VERSION` actualizado en
  `js/app.js` y `severo.html`. `CACHE = 'severo-v18'` en `sw.js`.

## v2.8.6 — 2026-05-30 — Fix: búsqueda en padrón devolvía 400 (sheet name incorrecto)

### Bug
- La búsqueda por apellido/DNI/domicilio en el inicio y en la
  pre-encuesta fallaba con **HTTP 400** del Google Sheets API. Cada
  request al padrón devolvía `"Unable to parse range"`.

### Causa
- `CONFIG.SHEET_PADRON` apuntaba a `'Padron integrado'`, pero la
  pestaña real de la planilla del padrón se llama **`Padron`** (sin
  el sufijo). El Sheets API rechazaba el range porque la hoja no
  existía con ese nombre.
- Bug latente desde el commit `harden(padron)`. La planilla quedó
  renombrada en algún momento y la config nunca se actualizó.

### Fix
- `js/config.js` y bloque CONFIG inline en `severo.html`:
  `SHEET_PADRON: 'Padron'` (era `'Padron integrado'`).
- `docs/CONFIGURACION.md` actualizado con el nombre correcto.
- Comentarios en `js/sheets.js` y `severo.html` actualizados.

### Endurecimiento defensivo
- `Padron._fetchSheet` ahora envuelve el sheet name en single quotes
  antes de URL-encodearlo (`'Padron'` → `%27Padron%27`). La sintaxis
  A1 del Sheets API acepta quoting siempre y es **obligatorio** si el
  nombre llegara a tener espacios o caracteres no-alfanuméricos.
- Mismo quoting en `coordRange` / `coordRangeFull` de
  `_rowToPadronRecord` (usado por `_apiUpdateLatLng` para escribir
  lat/lng tras la captura).
- Helper nuevo `Padron._quoteSheetName(name)` con escape de `'` a `''`
  según la sintaxis A1.

### Infra
- `version.json` 2.8.5 → 2.8.6. `APP_VERSION` actualizado en
  `js/app.js` y `severo.html`. `CACHE = 'severo-v17'` en `sw.js`
  para forzar reinstalación del SW.

## v2.8 — 2026-05-27
- La pastilla de barrio cae al campo `localidad` del padrón cuando no hay match geográfico (lat/lng fuera de los polígonos)

## v2.7 — 2026-05-27
- Pastilla de barrio en los resultados de búsqueda (inicio y pre-encuesta): el barrio se deriva de las coordenadas del padrón

## v2.6 — 2026-05-27
- Descripción y funcionalidades genéricas (meta/OG, manifest, tarjeta de tipo, PRODUCT.md, DESIGN.md)
- Buscadores de persona unificados: pestañas Apellido/DNI · Domicilio + input único, en inicio y pre-encuesta
- Documentación del proyecto: `README.md` + `docs/` (arquitectura, configuración, despliegue)

## v2.5 — 2026-05-27
- Pastillas (chips) seleccionables en las preguntas de opinión

## v2.4 — 2026-05-27
- Búsqueda por domicilio en los buscadores de inicio y de pre-encuesta

## v2.3 — 2026-05-27
- Foto del frente de la vivienda en el paso 2 del relevamiento socio-habitacional
- Actualización más confiable: desregistro del Service Worker y recarga con cache-bust

## v2.2 — 2026-05-27
- Pantalla de ubicación (pin) separada como tercer paso del relevamiento socio-habitacional
- Actualización forzada vía `version.json`, independiente del Service Worker

## v2.1 — 2026-05-25

### Sistema de diseño (Constelación, evolucionado)
- Capa de tokens ampliada: escalas de tipografía y espaciado, niveles de elevación tintados al azul de marca, curva de movimiento ease-out, tokens de foco y de superficies semánticas
- Documentación del sistema: `DESIGN.md`, `PRODUCT.md` y sidecar `.impeccable/design.json`
- Tokens semánticos consolidados (se eliminaron colores hardcodeados salvo el botón de Google)

### Accesibilidad
- Zoom habilitado (se quitó `user-scalable=no`) y `viewport-fit=cover` para safe-area
- Tarjetas y resultados clicables ahora accesibles por teclado (`role`/`tabindex` + Enter/Espacio)
- `aria-label` en botones de ícono, títulos de pantalla como encabezados `<h1>`, labels asociadas a sus campos
- Contraste AA en textos de estado (`--warn-text`, `--accent-text`) y en el pie de página

### Rendimiento
- Carga diferida de fotos (`loading="lazy"`), barra de progreso por `transform`, CSS de Leaflet fuera de la ruta crítica

### Interfaz
- Indicador de tipo de relevamiento como punto guía (sin franja lateral); foco visible en todos los controles; objetivos táctiles ≥44px

## v2.0 — 2026-05-24

### Identidad visual oficial
- Constelación territorial Proyecto Severo (`#0D47A1` + `#FFC845`)
- Set completo de íconos 16–512px + variantes maskable para Android
- Pantalla de login y header rediseñados con activos locales (sin dependencias externas)
- Paleta actualizada: `--primary: #0D47A1`, `--gold: #FFC845`

### PWA
- Botón de instalación en pantalla de inicio (Android: prompt nativo · iOS: instrucciones paso a paso)
- Snooze inteligente: se oculta 3 días tras cerrar, máximo 2 veces
- Modal bloqueante de actualización automática vía Service Worker
- Service Worker network-first para HTML/JS (evita código desactualizado post-deploy)
- Open Graph para WhatsApp y redes sociales

### Nuevas funcionalidades
- Relevamiento socio-habitacional con foto del frente de vivienda
- Toggle de fallecido en el perfil del ciudadano (padrón)
- Bloqueo de nuevo relevamiento para ciudadanos fallecidos
- Participación electoral: solo muestra elecciones donde el ciudadano efectivamente votó

### Seguridad y UX
- Confirmación al abandonar un relevamiento con datos sin guardar
- Pantalla de error al guardar con botón Reintentar (en lugar de toast fugaz)
- Guard de fallecido en `selectCitizen()` — bypass cerrado
- Chequeo de fallecido con fallback a Sheets cuando la lista en memoria está vacía
- Touch target del botón eliminar foto: 24px → 32px
- Service Worker network-first para HTML/JS
