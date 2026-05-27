# Arquitectura

App de una sola página, **JavaScript vanilla sin framework ni build**. Todo el comportamiento vive en `js/app.js`; el resto de `js/*.js` son módulos de apoyo cargados como globales (`<script>` clásicos, sin módulos ES).

## Modelo de estado y render

Hay un único objeto global **`State`** y una función **`render()`**:

- `State` guarda todo: pantalla actual, usuario, ubicación, tipo de relevamiento, respuestas, resultados de búsqueda, etc.
- `go(screen, updates)` hace `Object.assign(State, updates, { screen })` y llama a `render()`.
- `render()` elige una función `renderX()` según `State.screen`, escribe su HTML en `#app` con `innerHTML`, y corre side-effects de la pantalla (capturar GPS, guardar, cargar lista).
- Los handlers se cablean **inline con `onclick`/`oninput`** sobre funciones globales. No hay event delegation salvo el atajo de teclado Enter/Espacio para elementos `role="button"`.

No hay framework de componentes: cada pantalla es una función que devuelve un template string.

## Flujo de pantallas

```
auth ──login──▶ home
                 │
                 ├─ buscar en padrón ──▶ padronDetail ──▶ (nuevo relevamiento)
                 ├─ ver historial ─────▶ list ──▶ detail
                 └─ nuevo relevamiento ▶ typeSelect
                                          │
        ┌─────────────────────────────────┼───────────────────────────────┐
        ▼ (sociohabitacional)             ▼ (ciudadano)                    ▼ (problemática)
   datosPersonales                    citizenSearch                       geo
        ▼                                  ▼                                ▼
   datosDomicilio                        geo                             survey
        ▼                                  ▼                                ▼
   datosGeo                             survey                           summary
        ▼                                  ▼                                ▼
   survey ──▶ summary ──▶ saving ──▶ done (o saveError ──reintento──▶ saving)
```

- **`typeSelect`** elige el tipo. Según el tipo el flujo difiere: socio-habitacional tiene tres pantallas previas (datos del encuestado → domicilio + foto → geo); ciudadano pasa por una búsqueda en padrón; problemática va directo a geo.
- **`survey`** recorre el esquema `PREGUNTAS[tipo]` pregunta por pregunta, respetando visibilidad condicional (`showIf`) y cabeceras de bloque.
- **`summary`** muestra todo antes de guardar; **`saving`** persiste; **`saveError`** ofrece reintento sin perder respuestas.

## Módulos `js/`

| Módulo | Responsabilidad |
|--------|-----------------|
| `config.js` | Constantes de entorno: Client ID, API key, IDs de planillas, nombres de pestañas, bucket GCS. Ver [CONFIGURACION.md](CONFIGURACION.md). |
| `auth.js` | Objeto `Auth`: persistencia de usuario/token en `localStorage`, login mock, logout (revoca token). |
| `app.js` | Controlador completo: `State`, `render()`, pantallas, búsquedas, OAuth token client, lógica PWA. |
| `questions.js` | `PREGUNTAS`: esquema declarativo de los 3 tipos. Tipos de campo: `text`, `number`, `select`, `textarea`, `scale`, `radio`, `checkbox`, `photo`, `chips_otros`. Soporta `showIf`, `padronKey`, `padronField`, `block`. |
| `sheets.js` | `SheetsDB` (relevamientos) y `Padron` (lectura/escritura del listado de referencia) contra Google Sheets API; con fallback mock a `localStorage`. |
| `gcs.js` | `GCS`: comprime imágenes en canvas y las sube a Google Cloud Storage. |
| `geo.js` | `Geo`: geolocalización del dispositivo, geocodificación directa/inversa (Google → Nominatim). |
| `barrios.js` | Polígonos de barrios (GeoJSON embebido), `barrioFromPoint()` por ray-casting, estilo de la capa Leaflet. |

## Autenticación

Login con **Google Identity Services** (token client OAuth 2.0). Scopes: `openid email profile`, `spreadsheets`, `devstorage.read_write`.

- El token se guarda en `localStorage` con vencimiento estimado (~55 min).
- `ensureFreshTokenIfNeeded()` renueva silenciosamente antes de vencer; `withTokenRetry()` reintenta una vez ante un `401`.
- Sin Client ID configurado o sin login, la app usa **modo prueba**: relevamientos en `localStorage` y búsqueda de padrón sobre datos mock.

## Capa de datos

Dos planillas de Google Sheets (ver [CONFIGURACION.md](CONFIGURACION.md)):

- **Planilla de relevamientos** — una pestaña por tipo. `SheetsDB` agrega filas (`append`), crea la pestaña + cabeceras si no existe, y permite actualizar estado / estado vital. Sanitiza celdas para evitar inyección de fórmulas.
- **Listado de referencia (padrón)** — `Padron` lo lee con el token del relevador y resuelve búsquedas por apellido, DNI o domicilio. Al confirmar la ubicación, puede escribir de vuelta lat/lng y domicilio real. El mapeo exacto de columnas vive en `js/config.js` y `Padron._rowToPadronRecord` (`js/sheets.js`).

Las **fotos** no van a Sheets: se suben a Cloud Storage y solo se guarda la URL pública en la planilla.

## Buscador unificado

Las tres búsquedas de personas (inicio, pre-encuesta ciudadano, paso 1 socio-habitacional) comparten un mismo diseño:

- Pestañas de modo: **Apellido / DNI** y **Domicilio** (`State.citizenSearchMode` / `setCitizenSearchMode`).
- Un único input; en modo *Apellido / DNI* un valor numérico se interpreta como DNI.
- `onCitizenSearchInput(value)` debouncea y delega en `Padron.searchBy*Async`. El inicio usa su propio par `homeSearchMode` / `onHomeSearchInput`.

## PWA y actualización

- **Service Worker** (`sw.js`): *network-first* para HTML, JS y `version.json` (siempre fresco tras un deploy); *cache-first* para CSS, imágenes e íconos.
- **Force-update**: al volver al primer plano, la app compara `version.json` (servidor) contra `APP_VERSION` (código). Si difieren, muestra un overlay bloqueante que desregistra el SW, limpia cachés y recarga con cache-bust. Por eso **cada publicación debe subir la versión** (ver [DESPLIEGUE.md](DESPLIEGUE.md)).
- **Instalación**: tarjeta de instalación (prompt nativo en Android, instrucciones en iOS) con snooze inteligente.
