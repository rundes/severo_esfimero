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

  // Padrón electoral — fuente única de datos personales
  // A=DNI, B=SEXO, C=TIPO, D–L=participación elecciones,
  // M=PADRON, N=TIPO_DNI, O=APELLIDO Y NOMBRE, P=CLASE,
  // Q=DOMICILIO, R=LATITUD, S=LONGITUD, T=DOMICILIO REAL,
  // U=PROFESION, V=CIRCUITO, W=NRO_MESA, X=ORDEN, Y=ESTABLECIMIENTO,
  // Z=ocupacion, AA=nivel_educativo, AB=ESTADO CIVIL, AC=AFILIACION,
  // AD=LOCALIDAD, AE–AG=EMPLEADORES, AH=REGIMEN_IMP,
  // AI–AJ=CELULARES, AK–AL=EMAILS, AM=AUH, AN=IFE, AO=TWITTER
  SPREADSHEET_ID: '1rN-b37nqFm9ymiIf8YwmutUAYz_6ukwZXRPzFtsayxQ',
  SHEET_PADRON:   'padron_maipu_completo.csv',
};
