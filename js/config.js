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

  // Padrón electoral — fuente única de datos personales ("Padron integrado")
  // A=DNI, B=SEXO, C=TIPO, D–L=participación elecciones,
  // M=TIPO_DNI, N=APELLIDO Y NOMBRE, O=CLASE, P=DOMICILIO,
  // Q=LATITUD, R=LONGITUD, S=DOMICILIO REAL, T=PROFESION,
  // U=CIRCUITO, V=NRO_MESA, W=ORDEN, X=ESTABLECIMIENTO,
  // Y=ocupacion, Z=nivel_educativo, AA=ESTADO CIVIL, AB=AFILIACION,
  // AC=LOCALIDAD, AD–AF=EMPLEADORES, AG=REGIMEN_IMP,
  // AH–AI=CELULARES, AJ–AK=EMAILS, AL=AUH, AM=IFE, AN=TWITTER
  SPREADSHEET_ID: '1QjhmHFpwL9J7io10v2Ie31avOFrMK4oGYf_zHTi82Vg',
  SHEET_PADRON:   'Padron integrado',

  // Google Cloud Storage — fotos de problemáticas
  GCS_BUCKET: 'maipu-pba',
};
