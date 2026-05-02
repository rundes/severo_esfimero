const CONFIG = {
  // Reemplazar con Client ID real de Google Cloud Console
  GOOGLE_CLIENT_ID: '821059657602-44t1k4nshuf25qkc83j72u9k5ienl9gb.apps.googleusercontent.com',

  // Planilla de relevamientos (donde se guardan las encuestas)
  SPREADSHEET_ID: '1CcxJyZOhfOS7ZxMbyZLZ1apjmMrpkAuMMsuqdtmlHUs',
  SHEET_CIUDADANOS: 'Ciudadanos',
  SHEET_PROBLEMATICAS: 'Problematicas',
  SHEET_SOCIOHABITACIONAL: 'Sociohabitacional',

  // Padrón electoral — misma planilla, pestañas nativos / extranjeros
  SHEET_PADRON_NATIVOS:     'nativos',
  SHEET_PADRON_EXTRANJEROS: 'extranjeros',

  // true = usa localStorage (prototipo sin OAuth), false = usa Google Sheets API real
  USE_MOCK: true,
};
