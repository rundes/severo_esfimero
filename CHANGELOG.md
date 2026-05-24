# Changelog

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
