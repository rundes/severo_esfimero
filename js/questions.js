const PREGUNTAS = {
  ciudadano: [
    {
      id: 'nombre',
      label: 'Nombre completo',
      type: 'text',
      required: false,
      placeholder: 'Opcional',
    },
    {
      id: 'edad',
      label: 'Rango de edad',
      type: 'select',
      required: true,
      options: ['18–30', '31–45', '46–60', 'Más de 60'],
    },
    {
      id: 'residencia',
      label: '¿Hace cuánto tiempo vive en el barrio?',
      type: 'select',
      required: true,
      options: ['Menos de 1 año', '1 a 5 años', '5 a 10 años', 'Más de 10 años'],
    },
    {
      id: 'calidad_vida',
      label: '¿Cómo evaluaría la calidad de vida en el barrio?',
      type: 'scale',
      required: true,
      labels: ['Muy mala', 'Mala', 'Regular', 'Buena', 'Muy buena'],
    },
    {
      id: 'problemas',
      label: '¿Cuáles son los principales problemas que nota en el barrio?',
      type: 'checkbox',
      required: false,
      options: ['Seguridad', 'Limpieza', 'Iluminación', 'Estado de calles', 'Espacios verdes', 'Transporte público', 'Otro'],
    },
    {
      id: 'mejoras',
      label: '¿Qué mejoras le gustaría ver en el barrio?',
      type: 'textarea',
      required: false,
      placeholder: 'Describa las mejoras que considera necesarias…',
    },
    {
      id: 'comentarios',
      label: 'Comentarios adicionales',
      type: 'textarea',
      required: false,
      placeholder: 'Cualquier otra información relevante…',
    },
  ],

  problematica: [
    {
      id: 'categoria',
      label: 'Categoría del problema',
      type: 'select',
      required: true,
      options: [
        'Bache / Grieta en calzada',
        'Suciedad / Basura acumulada',
        'Luminaria apagada o rota',
        'Vereda en mal estado',
        'Problema cloacal',
        'Árbol caído o peligroso',
        'Poda necesaria',
        'Otro',
      ],
    },
    {
      id: 'direccion',
      label: 'Referencia de ubicación',
      type: 'text',
      required: false,
      placeholder: 'Ej: Av. San Martín 1234, esquina Rivadavia',
    },
    {
      id: 'descripcion',
      label: 'Descripción del problema',
      type: 'textarea',
      required: true,
      placeholder: 'Describa detalladamente el problema observado…',
    },
    {
      id: 'urgencia',
      label: '¿Cuál es el nivel de urgencia?',
      type: 'radio',
      required: true,
      options: [
        { value: 'bajo',  label: 'Bajo — no requiere atención inmediata' },
        { value: 'medio', label: 'Medio — requiere atención en los próximos días' },
        { value: 'alto',  label: 'Alto — riesgo para personas o el tránsito' },
      ],
    },
    {
      id: 'afecta_transito',
      label: '¿El problema afecta el tránsito vehicular o peatonal?',
      type: 'radio',
      required: true,
      options: [
        { value: 'si', label: 'Sí' },
        { value: 'no', label: 'No' },
      ],
    },
    {
      id: 'observaciones',
      label: 'Observaciones adicionales',
      type: 'textarea',
      required: false,
      placeholder: 'Información adicional relevante…',
    },
  ],

  // ── Encuesta Socio-Habitacional Maipú 2026 ──────────────────────────────────
  // P01 (lat/lng) se captura automáticamente por geolocalización, no aparece aquí.
  sociohabitacional: [
    // BLOQUE 1 — Identificación
    {
      id: 'barrio',
      block: 'Identificación y localización',
      label: 'Barrio',
      type: 'radio',
      required: false,
      options: [
        { value: 'Alvarado',      label: 'Alvarado' },
        { value: 'Belgrano',      label: 'Belgrano' },
        { value: 'Unión',         label: 'Unión' },
        { value: 'Centro',        label: 'Centro' },
        { value: 'Villa Vannelli',label: 'Villa Vannelli' },
        { value: 'Villa Italia',  label: 'Villa Italia' },
      ],
    },

    // BLOQUE 2 — Composición del hogar
    {
      id: 'personas_total',
      block: 'Composición del hogar',
      label: 'Cantidad de personas que viven en la vivienda',
      type: 'number',
      required: false,
    },
    {
      id: 'personas_menores',
      label: 'Cantidad de personas menores de 18 años',
      type: 'number',
      required: false,
    },
    {
      id: 'personas_mayores65',
      label: 'Cantidad de personas mayores de 65 años',
      type: 'number',
      required: false,
    },
    {
      id: 'familias',
      label: '¿Cuántas familias viven en la vivienda?',
      type: 'number',
      required: false,
    },

    // BLOQUE 3 — Tenencia y características
    {
      id: 'tenencia',
      block: 'Tenencia y características de la vivienda',
      label: 'Tenencia de la vivienda',
      hint: 'Si es propia seguirá P08 y P09. Si es alquilada, cedida u ocupada pasará directamente a tipo de vivienda.',
      type: 'radio',
      required: false,
      options: [
        { value: 'Propia',                      label: 'Propia' },
        { value: 'Propia en proceso de pago',   label: 'Propia en proceso de pago (crédito/cuotas)' },
        { value: 'Alquilada',                   label: 'Alquilada' },
        { value: 'Cedida/prestada',             label: 'Cedida/prestada' },
        { value: 'Ocupación informal',          label: 'Ocupación informal' },
      ],
    },
    {
      id: 'escritura',
      label: '¿Cuenta con la escritura?',
      type: 'radio',
      required: false,
      showIf: (a) => ['Propia', 'Propia en proceso de pago'].includes(a.tenencia),
      options: [
        { value: 'Si',         label: 'Sí' },
        { value: 'No',         label: 'No' },
        { value: 'En trámite', label: 'En trámite' },
      ],
    },
    {
      id: 'cuotas_adeuda',
      label: '¿Cuántas cuotas adeuda?',
      type: 'number',
      required: false,
      showIf: (a) => a.tenencia === 'Propia en proceso de pago',
    },
    {
      id: 'tipo_vivienda',
      label: 'Tipo de vivienda',
      type: 'radio',
      required: false,
      options: [
        { value: 'Casa',                 label: 'Casa' },
        { value: 'Departamento',         label: 'Departamento' },
        { value: 'Vivienda precaria',    label: 'Vivienda precaria' },
        { value: 'Pieza de inquilinato', label: 'Pieza de inquilinato' },
        { value: 'Otra',                 label: 'Otra' },
      ],
    },
    {
      id: 'material_paredes',
      label: 'Material predominante de las paredes',
      type: 'radio',
      required: false,
      options: [
        { value: 'Ladrillo/material', label: 'Ladrillo/material' },
        { value: 'Madera',            label: 'Madera' },
        { value: 'Chapa',             label: 'Chapa' },
        { value: 'Mixto',             label: 'Mixto' },
        { value: 'Otro',              label: 'Otro' },
      ],
    },
    {
      id: 'ambientes_dormir',
      label: 'Cantidad de ambientes para dormir (piezas)',
      type: 'number',
      required: false,
    },

    // BLOQUE 4 — Servicios básicos
    {
      id: 'desague',
      block: 'Servicios básicos',
      label: 'Condiciones del baño: desagüe',
      type: 'radio',
      required: false,
      options: [
        { value: 'Red cloacal', label: 'Red cloacal' },
        { value: 'Pozo ciego',  label: 'Pozo ciego' },
        { value: 'Otro',        label: 'Otro' },
      ],
    },
    {
      id: 'agua_potable',
      label: '¿Tiene agua potable?',
      type: 'radio',
      required: false,
      options: [
        { value: 'Si', label: 'Sí' },
        { value: 'No', label: 'No' },
      ],
    },
    {
      id: 'electricidad',
      label: '¿Tiene electricidad?',
      type: 'radio',
      required: false,
      options: [
        { value: 'Conexión formal',   label: 'Conexión formal' },
        { value: 'Conexión informal', label: 'Conexión informal' },
        { value: 'No tiene',          label: 'No tiene' },
      ],
    },
    {
      id: 'gas',
      label: '¿Tiene gas?',
      type: 'radio',
      required: false,
      options: [
        { value: 'De red',   label: 'De red' },
        { value: 'Garrafa',  label: 'Garrafa' },
        { value: 'No tiene', label: 'No tiene' },
      ],
    },

    // BLOQUE 5 — Discapacidad
    {
      id: 'discapacidad',
      block: 'Discapacidad',
      label: '¿En el hogar vive alguna persona con alguna discapacidad?',
      type: 'radio',
      required: false,
      options: [
        { value: 'Si', label: 'Sí' },
        { value: 'No', label: 'No' },
      ],
    },
    {
      id: 'tipo_discapacidad',
      label: '¿Qué tipo de discapacidad?',
      type: 'checkbox',
      required: false,
      showIf: (a) => a.discapacidad === 'Si',
      options: ['Motriz', 'Visual', 'Auditiva', 'Intelectual', 'Psicosocial', 'Otra'],
    },
    {
      id: 'cud',
      label: '¿Cuenta con Certificado Único de Discapacidad (CUD)?',
      type: 'radio',
      required: false,
      showIf: (a) => a.discapacidad === 'Si',
      options: [
        { value: 'Si', label: 'Sí' },
        { value: 'No', label: 'No' },
      ],
    },

    // BLOQUE 6 — Participación municipal
    {
      id: 'actividades_menores',
      block: 'Participación en actividades municipales',
      label: '¿Participan de actividades del municipio los menores de 18 años?',
      type: 'checkbox',
      required: false,
      options: ['Deportes', 'Cultura'],
    },
    {
      id: 'actividades_adultos',
      label: '¿Participan de actividades del municipio los que tienen entre 15 y 64 años?',
      type: 'checkbox',
      required: false,
      options: ['Deportes', 'Cultura'],
    },
    {
      id: 'actividades_mayores',
      label: '¿Participan de actividades del municipio los mayores de 65 años?',
      type: 'checkbox',
      required: false,
      options: ['Deportes', 'Cultura'],
    },

    // BLOQUE 7 — Opinión y cierre
    {
      id: 'mejora_barrio',
      block: 'Opinión y cierre',
      label: '¿Qué considera que debe mejorar su barrio?',
      type: 'textarea',
      required: false,
      placeholder: 'Describa libremente…',
    },
    {
      id: 'mejora_municipio',
      label: 'Pensando en su barrio, ¿qué le gustaría que el municipio mejorara?',
      type: 'text',
      required: true,
      placeholder: 'Respuesta libre…',
    },
    {
      id: 'falta_maipu',
      label: '¿Qué le falta a Maipú?',
      type: 'text',
      required: true,
      placeholder: 'Respuesta libre…',
    },
    {
      id: 'voto',
      label: '¿Nos votaría?',
      type: 'radio',
      required: true,
      options: [
        { value: 'SI',      label: 'Sí' },
        { value: 'NO',      label: 'No' },
        { value: 'DUDOSO',  label: 'Dudoso' },
      ],
    },
  ],
};
