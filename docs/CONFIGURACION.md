# Configuración

Toda la configuración de entorno vive en **`js/config.js`** (objeto `CONFIG`). No hay variables de entorno ni `.env`: al ser un sitio estático, los valores se sirven tal cual al cliente. Por eso solo deben usarse credenciales **restringidas y de solo el alcance necesario**.

## 1. Google Cloud — proyecto

Necesitás un proyecto en [Google Cloud Console](https://console.cloud.google.com/) con estas APIs habilitadas:

- **Google Sheets API** (relevamientos + padrón)
- **Google Cloud Storage** (fotos)
- **Geocoding API** (búsqueda y geocodificación de direcciones)

## 2. OAuth 2.0 Client ID

Credentials → *Create credentials* → *OAuth client ID* → **Aplicación web**.

- **Orígenes JavaScript autorizados:**
  - `https://rundes.github.io` (producción, GitHub Pages)
  - `http://localhost:8000` (desarrollo local)
- Copiá el Client ID a `CONFIG.GOOGLE_CLIENT_ID`.

**Scopes** que pide la app (definidos en `js/app.js`):

```
openid email profile
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/devstorage.read_write
```

## 3. API Key (solo geocodificación)

Credentials → *Create credentials* → *API key*. Copiala a `CONFIG.GOOGLE_API_KEY` y **restringila**:

- Por **referrer HTTP** a `https://rundes.github.io/severo_esfimero/*`.
- Por **API** a *Geocoding API* únicamente.

> ⚠️ **Seguridad:** la API key se publica en el bundle estático. Mantené la doble restricción (referrer + API). Si la key estuvo expuesta sin restringir, **rotala** en Cloud Console. El padrón **no** se lee con esta key, sino con el token OAuth del relevador.

## 4. Planillas de Google Sheets

| Variable | Qué es | Acceso requerido |
|----------|--------|------------------|
| `SURVEY_SPREADSHEET_ID` | Planilla donde se **guardan** los relevamientos. Pestañas `Ciudadanos`, `Problematicas`, `Sociohabitacional` (se crean solas con sus cabeceras si faltan). | Edición para las cuentas de los relevadores. |
| `SPREADSHEET_ID` | Listado de referencia (*padrón*), pestaña `Padron`. | Solo **lectura/edición compartida** con las cuentas de los relevadores. **Nunca** pública por enlace. |

El mapeo de columnas del padrón está documentado como comentario en `js/config.js` y se materializa en `Padron._rowToPadronRecord` (`js/sheets.js`); si cambia el orden de columnas en la planilla, hay que ajustarlo ahí.

> La planilla de relevamientos es la **misma fuente** que consume el dashboard [severo_data](https://github.com/rundes/severo_data).

## 5. Google Cloud Storage (fotos)

`CONFIG.GCS_BUCKET` (por defecto `maipu-pba`). El bucket necesita:

- **Lectura pública** para mostrar las fotos:
  - IAM: `allUsers` → rol `roles/storage.objectViewer`.
- **CORS** para permitir la subida desde el navegador:

```json
[{ "origin": ["*"], "method": ["GET", "POST", "PUT"], "responseHeader": ["*"], "maxAgeSeconds": 3600 }]
```

```bash
gcloud storage buckets update gs://maipu-pba --cors-file=cors.json
```

Las fotos se comprimen en el cliente (`GCS.compress`, máx ~1200px, JPEG ~0.78) antes de subirse con `predefinedAcl=publicRead`; en la planilla queda solo la URL pública.

## 6. Resumen de `CONFIG`

```js
const CONFIG = {
  GOOGLE_CLIENT_ID:        '…apps.googleusercontent.com',
  GOOGLE_API_KEY:          '…',            // restringida: referrer + Geocoding API
  SURVEY_SPREADSHEET_ID:   '…',            // relevamientos
  SHEET_CIUDADANOS:        'Ciudadanos',
  SHEET_PROBLEMATICAS:     'Problematicas',
  SHEET_SOCIOHABITACIONAL: 'Sociohabitacional',
  SPREADSHEET_ID:          '…',            // padrón (pestaña "Padron")
  SHEET_PADRON:            'Padron',
  GCS_BUCKET:              'maipu-pba',
};
```
