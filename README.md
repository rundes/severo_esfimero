# Proyecto Severo — Relevamientos

Sistema de relevamientos territoriales del Proyecto Severo. Es una **PWA mobile-first instalable**, pensada para que voluntarios de campo registren encuestas a vecinos puerta a puerta —incluso con conexión inestable— y los datos fluyan a los tableros de análisis ([severo_data](#proyectos-relacionados)).

> **Sitio en vivo:** https://rundes.github.io/severo_esfimero/

---

## Qué hace

Un voluntario abre la app en su teléfono, ubica a la persona en el listado de referencia (*padrón*) y registra un **relevamiento**. Hay tres tipos:

| Tipo | Ícono | Para qué |
|------|-------|----------|
| **Ciudadano** | 🧑 | Percepción del barrio, calidad de vida e intención de voto |
| **Socio-habitacional** | 🏠 | Vivienda, servicios básicos, composición del hogar y opinión (26 preguntas, con foto del frente) |
| **Problemática** | ⚠️ | Problemas en vía pública: baches, luminarias, arbolado, cloacas, etc. (con fotos) |

Objetivo de diseño: capturar un relevamiento preciso **en menos de un minuto**, sin perder datos y sin que la interacción se sienta intrusiva.

## Funcionalidades

- **Búsqueda en el padrón** por **apellido, DNI o domicilio**, con un buscador unificado (pestañas *Apellido / DNI* · *Domicilio*) disponible en el inicio y antes de cada encuesta.
- **Pre-llenado** de datos desde el padrón al seleccionar a una persona.
- **Geolocalización**: captura del punto en un mapa (Leaflet + capa IGN), ajuste por arrastre del pin, geocodificación directa/inversa y **detección automática de barrio** por polígonos.
- **Fotos**: captura desde la cámara, compresión en el cliente y subida a Google Cloud Storage (hasta 5 por registro).
- **Funciona sin conexión estable**: PWA instalable, Service Worker, y guardado recuperable (confirmación al abandonar, reintento al fallar el guardado).
- **Historial propio** de relevamientos con filtros por tipo y detalle por registro.
- **Estados**: seguimiento de problemáticas (pendiente / persiste / resuelto) y marcado de estado vital del ciudadano.
- **Actualización forzada** al publicar una versión nueva (vía `version.json`).
- **Accesibilidad de campo**: alto contraste para sol directo, objetivos táctiles ≥44px, navegación por teclado, `prefers-reduced-motion`.

## Stack técnico

- **Front-end:** JavaScript vanilla, **sin framework ni build step**. Un objeto `State` global + `render()` que dibuja pantallas con `innerHTML`.
- **Mapas:** [Leaflet](https://leafletjs.com/) 1.9 + teselas del IGN (Argentina) y OpenStreetMap.
- **Auth:** Google Identity Services (OAuth 2.0 token client).
- **Datos:** Google Sheets API (relevamientos + padrón).
- **Fotos:** Google Cloud Storage.
- **Geocodificación:** Google Geocoding API con fallback a Nominatim.
- **PWA:** manifest + Service Worker (network-first para HTML/JS, cache-first para assets).

## Estructura del proyecto

```
severo_esfimero/
├── index.html            # Entrada modular (carga js/*.js) — build principal
├── severo.html           # Build monolítico espejo (CSS+JS inline) — mantener en sync
├── css/style.css         # Sistema de diseño "Constelación territorial"
├── js/
│   ├── config.js         # IDs de planillas, scopes, bucket GCS (ver docs/CONFIGURACION.md)
│   ├── auth.js           # Sesión y token OAuth
│   ├── gcs.js            # Compresión y subida de fotos a Cloud Storage
│   ├── geo.js            # Geolocalización + geocodificación
│   ├── barrios.js        # Polígonos de barrios + point-in-polygon
│   ├── sheets.js         # Lectura/escritura de relevamientos y padrón
│   ├── questions.js      # Esquema PREGUNTAS de los 3 tipos de encuesta
│   └── app.js            # Controlador: State, render(), todas las pantallas
├── icons/                # Set de íconos PWA 16–512px + maskable
├── sw.js                 # Service Worker
├── manifest.json         # Manifiesto PWA
├── version.json          # Versión publicada (gatilla el force-update)
├── docs/                 # Documentación (ver abajo)
├── PRODUCT.md            # Contexto de producto (impeccable)
├── DESIGN.md             # Sistema de diseño (impeccable)
└── CHANGELOG.md          # Historial de versiones
```

### Dos builds

El proyecto mantiene **dos artefactos equivalentes**:

- **`index.html` + `js/*.js`** — build modular, el que se desarrolla y el que sirve GitHub Pages como raíz.
- **`severo.html`** — build monolítico autocontenido (todo el CSS y JS inline en un solo archivo).

Ambos se actualizan en el mismo commit. **Cualquier cambio funcional o de copy debe replicarse en los dos.**

## Correr localmente

No hay build: se sirve como estático. Desde la raíz del repo:

```bash
python -m http.server 8000
# o:  npx serve .
```

Abrí http://localhost:8000/ . Para que funcione el login con Google, agregá `http://localhost:8000` como origen autorizado del Client ID (ver [docs/CONFIGURACION.md](docs/CONFIGURACION.md)). Sin sesión, la app cae en **modo prueba** (datos en `localStorage`).

## Documentación

- **[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)** — modelo de estado, flujo de pantallas, módulos y capa de datos.
- **[docs/CONFIGURACION.md](docs/CONFIGURACION.md)** — Google Cloud: OAuth, scopes, planillas, bucket GCS y CORS.
- **[docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)** — flujo `main` + `gh-pages`, bump de versión y actualización forzada.
- **[PRODUCT.md](PRODUCT.md)** / **[DESIGN.md](DESIGN.md)** — contexto de producto y sistema de diseño.
- **[CHANGELOG.md](CHANGELOG.md)** — historial de versiones.

## Proyectos relacionados

- **[severo_data](https://github.com/rundes/severo_data)** — tablero (dashboard Next.js) que lee y analiza los relevamientos que esta app captura. Comparten las mismas planillas de Google Sheets.

## Licencia

[GNU GPL v3](LICENSE).
