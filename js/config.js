const CONFIG = {
  // Client ID de Google Cloud Console (proyecto maipu-datos)
  GOOGLE_CLIENT_ID: '821059657602-44t1k4nshuf25qkc83j72u9k5ienl9gb.apps.googleusercontent.com',

  // API Key de Google Cloud (para lectura del padrón y geocodificación inversa)
  // La planilla del padrón debe tener acceso "Cualquier persona con el vínculo puede ver"
  GOOGLE_API_KEY: 'AIzaSyAFICbCFMxxLS7HWwsvRVCGiKCfoaF4x4I',

  // Planilla donde se guardan los relevamientos (ciudadanos, problemáticas, socio-habitacional)
  // El relevador debe tener acceso de edición a esta planilla
  SURVEY_SPREADSHEET_ID: '1qzLuz42e3GZ0yXf_z-wjpAQJP6rGsCVTgg-whZSt2UA',
  SHEET_CIUDADANOS:       'Ciudadanos',
  SHEET_PROBLEMATICAS:    'Problematicas',
  SHEET_SOCIOHABITACIONAL:'Sociohabitacional',

  // Padrón electoral — planilla separada, pestaña única "Padron integrado"
  // Columnas: A=PADRON, B=TIPO_DNI, C=DOCUMENTO, D=SEXO, E=APELLIDO Y NOMBRE,
  //           F=CLASE, G=DOMICILIO, H=LATITUD, I=LONGITUD, J=DOMICILIO REAL
  SPREADSHEET_ID: '1QjhmHFpwL9J7io10v2Ie31avOFrMK4oGYf_zHTi82Vg',
  SHEET_PADRON:   'Padron integrado',
};
