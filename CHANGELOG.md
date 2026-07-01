# Changelog

## v2.10.0 — 2026-07-01 — Reconexión de sesión: fin de las funciones que morían calladas

### Problema
- En algunos dispositivos, tras un rato la sesión de Google se perdía y la
  app **no forzaba un refresco**: las funcionalidades (búsqueda en padrón,
  guardado en Sheets, subida a GCS) dejaban de andar sin aviso y la app
  **parecía rota**.

### Causa raíz
- El único camino de recuperación era el **refresh silencioso**
  `requestAccessToken({ prompt: '' })`. Ese flujo solo funciona si el iframe
  de Google Identity puede leer una cookie de sesión viva de Google.
- Falla en PWA instalada standalone (WebView), iOS con ITP, cookies de
  terceros bloqueadas o sesión de Google ya expirada.
- Al fallar: `ensureFreshTokenIfNeeded()` **tragaba el error** (`catch(_){}`)
  y `withTokenRetry()` tiraba un error genérico. **No había fallback a
  re-login interactivo** → las funciones morían en silencio.

### Fix
- **Overlay de reconexión bloqueante**: cuando el refresh silencioso falla,
  se muestra "Sesión expirada — Reconectar". El botón dispara
  `requestAccessToken({ prompt: 'consent' })`, que corre sobre el gesto del
  usuario y funciona aunque el silencioso no.
- **Escalado, no tragado**: `ensureFreshTokenIfNeeded` y `withTokenRetry`
  ahora escalan al overlay en vez de silenciar el error.
- **Timer proactivo** (cada 4 min, logged-in + foreground): cubre al
  relevador con la app siempre en primer plano, donde `visibilitychange`
  nunca dispara y el token vencía a los 60 min.
- **`expires_in` real**: se usa el TTL que devuelve Google en vez de asumir
  55 min fijos.

## v2.9.6 — 2026-06-03 — Root cause del splash colgado: DOMContentLoaded ya disparó cuando app.js bootea

### Bug raíz (FINALMENTE)
- v2.9.1 → v2.9.5 atacaron síntomas (watchdog, UI manual, bypass SW,
  localStorage clear). El **bug raíz** seguía ahí: la app NUNCA
  llamaba a `render()` automáticamente. Solo arrancaba si la
  recuperación accidental disparaba algo.
- Detectado con Chrome DevTools MCP emulando Android Pixel 8:
  `document.readyState === "complete"`, todos los globals
  (`APP_VERSION`, `render`, `Auth`, `Padron`, etc.) **definidos**,
  pero `<div class="loading-init">` seguía visible. Llamar `render()`
  manualmente desde DevTools mostraba la pantalla de auth normal.

### Causa
- `index.html` carga `js/app.js` dinámicamente vía
  `document.createElement('script')` + `appendChild` con
  `async = false` (introducido en v2.8.9 para evitar `document.write`).
- Per HTML spec, los scripts **DOM-inserted** con `async=false` NO
  demoran `DOMContentLoaded`. **Solo los parser-inserted lo hacen.**
- Resultado: para el momento que `app.js` ejecuta, `document.readyState`
  ya es `'interactive'` o `'complete'` → DCL ya disparó.
- `document.addEventListener('DOMContentLoaded', _bootApp)` registra
  un listener para un evento que ya pasó → handler nunca ejecuta →
  `_bootApp` (que llama `render()`) nunca corre.

### Fix
- `js/app.js` + `severo.html` ahora chequean `document.readyState`:
```js
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _bootApp);
} else {
  _bootApp();  // DCL ya pasó, arrancar ahora
}
```

### Por qué los fixes anteriores parecían ayudar
- v2.9.1 watchdog: forzaba reload. Algunas veces el reload coincidía
  con un timing donde DCL no había disparado todavía cuando app.js
  bootea — boot funcionaba por accidente.
- v2.9.5 `_bypass=1` cleanup: limpiaba todo, pero al recargar caía
  en el mismo bug. El cleanup era correcto, el boot no.
- En síntesis: los fixes hacían más rápido el ciclo de reintento
  pero NO arreglaban el motivo por el cual la app no arrancaba sola.

### Validación
- Antes (v2.9.5 en producción, vía DevTools MCP):
  - `document.readyState`: complete
  - `typeof render`: function
  - `appHTML`: contains `loading-init` (stuck)
- Después (v2.9.6 local, mismo flow):
  - `_bootApp()` corre en el branch del else → render() llama →
    `loading-init` se reemplaza con `screen-auth`.

### Infra
- `version.json` 2.9.5 → 2.9.6 vía `node scripts/bump.js patch`.

## v2.9.5 — 2026-06-03 — Botón "Limpiar y reintentar" funciona en PWA Android

### Bug
- En PWA Android, el botón "Limpiar y reintentar" (introducido en
  v2.9.4) hacía el cleanup pero la app volvía a quedarse colgada en
  el mismo estado. El usuario no podía salir del loop.

### Causa
- Per spec del Service Worker: `registration.unregister()` marca el
  registro para remoción, **pero el SW activo sigue controlando los
  clients existentes** hasta que todos navegan fuera o se cierran.
- En PWA standalone Android, la "navegación" del `location.href =
  ...` post-unregister sigue siendo interceptada por el SW viejo
  que está corriendo. Resultado: caches borrados → SW reinstala
  todo igual → mismo bug.
- Además, si el problema raíz estaba en `localStorage` corrupto
  (token inválido, padrón cache roto, etc.), borrar SW + caches no
  cambia nada.

### Fix (3 capas)
**1. Bypass del SW vía query param** (`sw.js`):
```js
if (url.searchParams.has('_bypass')) return;
```
Si la URL trae `?_bypass=1`, el SW no llama `respondWith()` y el
browser hace la request directamente al network. Necesario para
el primer load post-recuperación cuando el SW viejo todavía está
controlando.

**2. Botón limpia más cosas** (`index.html` + `severo.html`):
   - `serviceWorker.unregister()` (todos)
   - `caches.delete()` (todos)
   - `localStorage.clear()` **preservando** los relevamientos
     pendientes (`severo_ciudadano`, `severo_problematica`,
     `severo_sociohabitacional`) — son drafts offline que el
     usuario no quiere perder.
   - `sessionStorage.clear()` entero.

**3. Navegación con `_bypass=1`**:
   - `location.replace(pathname + '?_bypass=1&_v=' + Date.now())`
   - `replace` evita pushear al historial (Back no vuelve al
     estado roto).
   - Una vez que `render()` ejecuta, limpia `_bypass=1` de la URL
     vía `history.replaceState` para que el usuario no vea query
     params raros.

### Infra
- `version.json` 2.9.4 → 2.9.5 vía `node scripts/bump.js patch`.

## v2.9.4 — 2026-06-03 — Watchdog escalonado + UI manual de recuperación

### Bug
- En Android la barra del splash llegaba al 100% y **nada pasaba**.
- v2.9.1 usaba un flag booleano `_bootRetry` en sessionStorage: tras
  un reintento fallido, el flag quedaba seteado y el segundo intento
  saltaba el reload silenciosamente. Si la app NUNCA llegaba a
  `render()` (que limpia el flag), el usuario quedaba colgado mirando
  la barra al 100% sin recuperación automática.

### Fix
- Reemplazado el flag booleano por **estado escalonado** en
  `_bootAttempts` = `{ count, last }` (JSON en sessionStorage):
  - **Intento 1** (count=0): reload silencioso con `?_v=Date.now()`.
  - **Intento 2** (count=1): reload silencioso.
  - **Intento 3** (count=2): **UI manual** con texto explicativo +
    botón **"Limpiar y reintentar"**.
- El botón desregistra todos los `ServiceWorker` y borra todas las
  entradas de `caches.keys()` antes de recargar con cache-bust. Es la
  misma recuperación de tierra arrasada del force-update overlay,
  pero accesible sin necesidad de que `app.js` haya bootear.
- **Cooldown**: si pasaron > 2 minutos desde el último intento,
  reseteamos el estado a 0 (asumimos que el usuario reabrió la app
  a propósito y queremos volver a intentar el reload silencioso).

### Cleanup en `render()`
- `js/app.js` y `severo.html` ahora limpian **tanto** `_bootRetry`
  (compat hacia atrás v2.9.1) **como** `_bootAttempts`.

### Por qué no más de 2 reloads silenciosos
- Si dos recargas no resolvieron, el problema es más profundo (SW
  corrupto, datos persistentes inválidos, network completamente
  offline). El reload n+1 silencioso no aporta. Mejor mostrar UI
  accionable.

### Infra
- `version.json` 2.9.3 → 2.9.4 vía `node scripts/bump.js patch`.

## v2.9.3 — 2026-06-03 — Splash con barra de progreso sincronizada al watchdog

### Cambio UX
- El splash "Cargando…" pasa de **texto estático** a **barra de
  progreso** que se llena linealmente en **10 segundos**, exactamente
  sincronizada con el watchdog del boot (v2.9.1). Si la app no
  arranca, la barra llega al 100% justo cuando dispara el hard reload
  → señal coherente para el usuario de que algo se está recuperando
  en vez de quedarse mirando texto inerte.

### Detalle
- HTML: `.loading-init` ahora contiene `.loading-init-bar` +
  `.loading-init-text`. `role="status"` y `aria-label` para
  accesibilidad. La barra lleva `aria-hidden="true"` (decorativa, la
  info la da el texto).
- CSS: `animation: loading-init-fill 10s linear forwards` con
  `transform: scaleX(0 → 1)`. Color de la barra: `#0D47A1` (theme).
  Width 200px, height 4px.
- `prefers-reduced-motion: reduce`: deshabilita la animación y deja
  la barra estática al 30% como indicador visual sin movimiento.
- Aplica a ambos builds (`index.html` + `severo.html`); el CSS vive
  en `css/style.css` (modular) y embebido en `severo.html`.

### Verificación de carga (sanity check)
```bash
curl -s -o /dev/null -w "HTTP %{http_code} %{time_total}s" \
  https://rundes.github.io/severo_esfimero/
# HTTP 200 ~0.6s — sirve fresh, scripts ?_v=2.9.3 también HTTP 200
```

### Infra
- `version.json` 2.9.2 → 2.9.3 vía `node scripts/bump.js patch`.

## v2.9.2 — 2026-06-03 — Subresource Integrity (SRI) en assets de CDN externos

### Hardening
- Los assets de Leaflet 1.9.4 servidos desde unpkg.com (`leaflet.css`
  y `leaflet.js`) ahora llevan `integrity="sha384-..."` +
  `crossorigin="anonymous"`. Si el CDN entregara un contenido
  distinto al hash esperado, el browser **bloquea** el asset en vez
  de ejecutarlo / aplicarlo. Mitiga compromisos del CDN o ataques
  MITM en transit.
- Hashes calculados localmente contra el contenido oficial de
  `unpkg.com/leaflet@1.9.4/dist/` (versión fija pinned en el HTML).
  Si se sube la versión de Leaflet, los hashes hay que regenerar.

### Excepción documentada
- `https://accounts.google.com/gsi/client` (Google Identity Services)
  **no lleva SRI**: Google rotea el script sin avisar y no publica un
  hash estable. Se documentó la decisión inline en `index.html` y
  `severo.html`. Confiamos en `accounts.google.com` como origen —
  postura coherente con cualquier flow OAuth.

### Cómo regenerar hashes (cuando se actualiza Leaflet)
```bash
curl -s https://unpkg.com/leaflet@X.Y.Z/dist/leaflet.css | \
  openssl dgst -sha384 -binary | openssl base64 -A
curl -s https://unpkg.com/leaflet@X.Y.Z/dist/leaflet.js | \
  openssl dgst -sha384 -binary | openssl base64 -A
```

### Infra
- `version.json` 2.9.1 → 2.9.2 vía `node scripts/bump.js patch`.

## v2.9.1 — 2026-06-03 — Fix: app colgada en splash tras update (boot watchdog + SW fallback)

### Bug
- En Android, algunos relevadores reportaban que tras abrir la app
  quedaba pegada en la pantalla "Cargando…" indefinidamente. Solo se
  recuperaba desinstalando y reinstalando la PWA.

### Causa probable
- Tras el deploy de v2.9.0, el SW viejo (v2.8.x) tenía cacheados los
  scripts con URLs *sin query string* (`js/app.js`). El IIFE nuevo de
  `index.html` los pide con `?_v=2.9.1` (URL distinta).
- Si el SW pasaba a network y el network estaba en flap (cellular,
  app abierta en background, etc.), el `.catch()` hacía
  `caches.match(e.request)` — pero el cache no tenía la URL con query
  → undefined → script no cargaba → `app.js` no se ejecutaba → boot
  screen permanente.
- El SW también queda en estado "waiting" hasta que el usuario use
  la app, durante ese tiempo controla con código viejo.

### Fix defensivo (dos capas)

**1. SW fallback offline más robusto** (`sw.js`):
   ```js
   .catch(() => caches.match(e.request).then((r) => r || caches.match(path)))
   ```
   Si el match exacto con query falla, intenta sin query (pathname
   pelado). Bridge entre el cache del SW viejo y las URLs nuevas.

**2. Boot watchdog** (`index.html` + `severo.html`):
   ```js
   setTimeout(function() {
     if (document.querySelector('#app .loading-init') &&
         !sessionStorage.getItem('_bootRetry')) {
       sessionStorage.setItem('_bootRetry', '1');
       location.href = location.pathname + '?_v=' + Date.now();
     }
   }, 10000);
   ```
   Si la app no booteó en 10s, hard reload con cache-bust único
   (`Date.now()`). El `sessionStorage` previene loops: si el segundo
   intento tampoco arranca, no se reintenta automáticamente.
   `render()` en `js/app.js` y `severo.html` limpia el flag al
   booter OK, así futuras cargas lentas pueden volver a disparar el
   watchdog.

### Por qué watchdog y no force-update overlay
- El overlay de force-update solo funciona si `app.js` cargó (vive en
  ahí). Si el bug ocurre ANTES de que `app.js` ejecute, el overlay
  nunca aparece. El watchdog es código inline en `index.html`, corre
  aunque ningún script local haya bootear.

### Infra
- `version.json` 2.9.0 → 2.9.1 vía `node scripts/bump.js patch`.

## v2.9.0 — 2026-06-03 — Milestone: consolidación de v2.8.x (búsqueda + force-update + tooling)

Minor bump que consolida los fixes acumulados en v2.8.6 → v2.8.10. Sin
features nuevas, pero la línea v2.9 deja saneados los tres frentes que
estaban quebrados o frágiles:

- **Búsqueda en padrón** (v2.8.6 → v2.8.7): `CONFIG.SHEET_PADRON`
  apuntaba a una pestaña inexistente (`Padron integrado`) y el
  endpoint devolvía 400. Corregido a `Padron`. Helper
  `Padron._quoteSheetName(name)` para defensa futura.
- **Versión en pantalla** (v2.8.8): la copy de auth y footer mostraba
  `v2.8` hardcoded. Ahora renderea `v${APP_VERSION}` y refleja la
  versión publicada automáticamente.
- **Force-update + cache-busting** (v2.8.9): el IIFE de `index.html`
  ahora siempre adjunta `?_v=BUILD` a los scripts (no solo cuando la
  URL viene del overlay). El SW usa `fetch(_, { cache: 'no-cache' })`
  para bypasear el HTTP cache del browser. Combinación = los JS files
  no se quedan stale tras un deploy.
- **Tooling de release** (v2.8.10): `scripts/bump.js` centraliza el
  bump en `version.json` y propaga a los otros 4 lugares
  (`APP_VERSION` × 2, `BUILD`, `CACHE`). `sw.js` CACHE pasó de
  contador a semver (`severo-v2.9.0`).

### Infra
- `version.json` 2.8.10 → 2.9.0 vía `node scripts/bump.js minor`.
  Resto sincronizado por el script.

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
