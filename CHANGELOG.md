# Changelog

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
