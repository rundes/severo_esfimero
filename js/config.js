const CONFIG = {
  // Client ID de Google Cloud Console (proyecto maipu-datos)
  GOOGLE_CLIENT_ID: '821059657602-44t1k4nshuf25qkc83j72u9k5ienl9gb.apps.googleusercontent.com',

  // Planilla donde se guardan los relevamientos (ciudadanos, problemáticas, socio-habitacional)
  SURVEY_SPREADSHEET_ID: '1qzLuz42e3GZ0yXf_z-wjpAQJP6rGsCVTgg-whZSt2UA',
  SHEET_CIUDADANOS:       'Ciudadanos',
  SHEET_PROBLEMATICAS:    'Problematicas',
  SHEET_SOCIOHABITACIONAL:'Sociohabitacional',

  // Padrón electoral — planilla separada, pestañas nativos / extranjeros
  SPREADSHEET_ID:          '1CcxJyZOhfOS7ZxMbyZLZ1apjmMrpkAuMMsuqdtmlHUs',
  SHEET_PADRON_NATIVOS:    'nativos',
  SHEET_PADRON_EXTRANJEROS:'extranjeros',

  // true = usa localStorage (prototipo sin OAuth), false = usa Google Sheets API real
  USE_MOCK: true,
};
