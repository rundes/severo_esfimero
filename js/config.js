const CONFIG = {
  // Client ID de Google Cloud Console (proyecto maipu-datos)
  GOOGLE_CLIENT_ID: '821059657602-44t1k4nshuf25qkc83j72u9k5ienl9gb.apps.googleusercontent.com',

  // API Key de Google Cloud (para lectura del padrón y geocodificación inversa)
  // La planilla del padrón debe tener acceso "Cualquier persona con el vínculo puede ver"
  GOOGLE_API_KEY: '',

  // Planilla donde se guardan los relevamientos (ciudadanos, problemáticas, socio-habitacional)
  // El relevador debe tener acceso de edición a esta planilla
  SURVEY_SPREADSHEET_ID: '1qzLuz42e3GZ0yXf_z-wjpAQJP6rGsCVTgg-whZSt2UA',
  SHEET_CIUDADANOS:       'Ciudadanos',
  SHEET_PROBLEMATICAS:    'Problematicas',
  SHEET_SOCIOHABITACIONAL:'Sociohabitacional',

  // Padrón electoral — planilla separada, pestañas nativos / extranjeros
  // Columnas nativos:     A=TIPO_DOC, B=DOCUMENTO, D=APELLIDO Y NOMBRE, F=DOMICILIO,
  //                       G=LATITUD, H=LONGITUD, I=DOMICILIO REAL
  // Columnas extranjeros: A=DOCUMENTO, C=APELLIDO Y NOMBRE, E=DOMICILIO,
  //                       F=LATITUD, G=LONGITUD, H=DOMICILIO REAL
  SPREADSHEET_ID:          '1CcxJyZOhfOS7ZxMbyZLZ1apjmMrpkAuMMsuqdtmlHUs',
  SHEET_PADRON_NATIVOS:    'nativos',
  SHEET_PADRON_EXTRANJEROS:'extranjeros',
};
