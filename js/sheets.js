const SheetsDB = {
  _hasToken() {
    return !!localStorage.getItem('severo_access_token');
  },

  async save(type, record) {
    if (!this._hasToken()) return this._mockSave(type, record);
    return this._apiAppend(type, record);
  },

  getAll(type) {
    return this._mockGetAll(type);
  },

  async getAllAsync(type) {
    if (!this._hasToken()) return this._mockGetAll(type);
    return this._apiGetAll(type);
  },

  async update(type, id, updates) {
    return this._mockUpdate(type, id, updates);
  },

  // ── Mock (localStorage) ──────────────────────────────────────────────────

  _mockSave(type, record) {
    const key = `severo_${type}`;
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    const saved = { ...record, id: Date.now(), savedAt: new Date().toISOString() };
    items.unshift(saved);
    localStorage.setItem(key, JSON.stringify(items));
    return saved;
  },

  _mockGetAll(type) {
    const key = `severo_${type}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
  },

  _mockUpdate(type, id, updates) {
    const key = `severo_${type}`;
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    const idx = items.findIndex((i) => i.id === id);
    if (idx >= 0) {
      items[idx] = { ...items[idx], ...updates, updatedAt: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(items));
    }
  },

  // ── Google Sheets API ────────────────────────────────────────────────────

  _sheetForType(type) {
    if (type === 'ciudadano')        return CONFIG.SHEET_CIUDADANOS;
    if (type === 'sociohabitacional') return CONFIG.SHEET_SOCIOHABITACIONAL;
    return CONFIG.SHEET_PROBLEMATICAS;
  },

  async _apiAppend(type, record) {
    const sheet = this._sheetForType(type);
    const token = this._getToken();
    const row = this._toRow(type, record);

    console.log('[SheetsDB] guardando en pestaña:', sheet);
    console.log('[SheetsDB] fila:', row);

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SURVEY_SPREADSHEET_ID}/values/${encodeURIComponent(sheet)}!A1:append?valueInputOption=USER_ENTERED`;

    const doAppend = () => fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
    });

    let res = await doAppend();
    console.log('[SheetsDB] append status:', res.status);

    if (res.status === 400 || res.status === 404) {
      console.log('[SheetsDB] pestaña no encontrada, creando:', sheet);
      const createRes = await this._createSheet(CONFIG.SURVEY_SPREADSHEET_ID, sheet, token);
      console.log('[SheetsDB] createSheet status:', createRes.status);
      await new Promise((r) => setTimeout(r, 800));
      await this._writeHeaders(type, CONFIG.SURVEY_SPREADSHEET_ID, sheet, token);
      res = await doAppend();
      console.log('[SheetsDB] retry status:', res.status);
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error('[SheetsDB] error body:', errBody);
      throw new Error(`Sheets API ${res.status}: ${errBody.error?.message || JSON.stringify(errBody)}`);
    }
    return record;
  },

  async _createSheet(spreadsheetId, sheetName, token) {
    return fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        }),
      }
    );
  },

  _toHeaders(type) {
    const base = ['ID', 'Fecha', 'Email operador', 'Nombre operador', 'Latitud', 'Longitud', 'Precisión (m)'];
    if (type === 'ciudadano') {
      return [...base, 'DNI', 'Apellido y nombre', 'Apodo', 'Domicilio', 'Barrio', 'Edad', 'Residencia',
        'Calidad de vida', 'Problemas', 'Mejoras', 'Comentarios'];
    }
    if (type === 'sociohabitacional') {
      return [...base, 'DNI', 'Apellido y nombre', 'Apodo', 'Domicilio', 'Barrio',
        'Personas total', 'Menores de 18', 'Mayores de 65', 'Familias', 'Tenencia',
        'Escritura', 'Cuotas adeudadas', 'Tipo vivienda', 'Material paredes', 'Ambientes dormir',
        'Desagüe', 'Agua potable', 'Electricidad', 'Gas', 'Discapacidad', 'Tipo discapacidad',
        'CUD', 'Actividades menores', 'Actividades adultos', 'Actividades mayores',
        'Mejora barrio', 'Mejora municipio', 'Falta Maipú', 'Voto'];
    }
    return [...base, 'Categoría', 'Dirección', 'Barrio', 'Descripción', 'Urgencia', 'Afecta tránsito', 'Observaciones'];
  },

  async _writeHeaders(type, spreadsheetId, sheet, token) {
    const headers = this._toHeaders(type);
    return fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheet)}!A1?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [headers] }),
      }
    );
  },

  async _apiGetAll(type) {
    const sheet = this._sheetForType(type);
    const token = this._getToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SURVEY_SPREADSHEET_ID}/values/${encodeURIComponent(sheet)}`;
    console.log('[SheetsDB] getAllAsync:', sheet);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    console.log('[SheetsDB] getAllAsync status:', res.status, sheet);
    if (res.status === 400 || res.status === 404) return []; // pestaña aún no creada
    if (!res.ok) throw new Error(`Sheets API error ${res.status} al leer ${sheet}`);
    const data = await res.json();
    return this._fromRows(type, data.values || []);
  },

  _getToken() {
    const t = localStorage.getItem('severo_access_token');
    if (!t) throw new Error('Sin token de acceso. Reautenticar con scope de Sheets.');
    return t;
  },

  _sc(v) {
    const s = String(v ?? '');
    // Prevent formula injection in Google Sheets
    return /^[=+\-@|]/.test(s) ? "'" + s : s;
  },

  _toRow(type, r) {
    const sc = (v) => this._sc(v);
    const base = [
      r.id || '',
      r.savedAt || new Date().toISOString(),
      r.operador?.email || '',
      r.operador?.name || '',
      r.location?.lat || '',
      r.location?.lng || '',
      r.location?.accuracy || '',
    ];
    if (type === 'ciudadano') {
      const a = r.answers || {};
      return [...base, a.dni || '', sc(a.apellido), sc(a.apodo), sc(a.domicilio), a.barrio || '',
        a.edad || '', a.residencia || '', a.calidad_vida || '',
        (a.problemas || []).join(', '), sc(a.mejoras), sc(a.comentarios)];
    }
    if (type === 'sociohabitacional') {
      const a = r.answers || {};
      return [...base, a.dni || '', sc(a.apellido), sc(a.apodo), sc(a.domicilio),
        a.barrio || '', a.personas_total || '', a.personas_menores || '',
        a.personas_mayores65 || '', a.familias || '', a.tenencia || '',
        a.escritura || '', a.cuotas_adeuda || '', a.tipo_vivienda || '',
        a.material_paredes || '', a.ambientes_dormir || '', a.desague || '',
        a.agua_potable || '', a.electricidad || '', a.gas || '',
        a.discapacidad || '', (a.tipo_discapacidad || []).join(', '), a.cud || '',
        (a.actividades_menores || []).join(', '), (a.actividades_adultos || []).join(', '),
        (a.actividades_mayores || []).join(', '), sc(a.mejora_barrio),
        sc(a.mejora_municipio), sc(a.falta_maipu), a.voto || ''];
    }
    // problematica
    const a = r.answers || {};
    return [...base, a.categoria || '', sc(a.direccion), a.barrio || '', sc(a.descripcion),
      a.urgencia || '', a.afecta_transito || '', sc(a.observaciones)];
  },

  _fromRows(type, rows) {
    return rows.slice(1).filter(row => row.length > 0).map((row) => {
      const base = { id: row[0], savedAt: row[1], operador: { email: row[2], name: row[3] },
        location: { lat: parseFloat(row[4]), lng: parseFloat(row[5]), accuracy: parseInt(row[6]) } };
      if (type === 'ciudadano') {
        return { ...base, answers: { dni: row[7], apellido: row[8], apodo: row[9],
          domicilio: row[10], barrio: row[11], edad: row[12], residencia: row[13],
          calidad_vida: row[14], problemas: row[15] ? row[15].split(', ') : [],
          mejoras: row[16], comentarios: row[17] } };
      }
      if (type === 'sociohabitacional') {
        return { ...base, answers: { dni: row[7], apellido: row[8], apodo: row[9],
          domicilio: row[10], barrio: row[11], personas_total: row[12],
          personas_menores: row[13], personas_mayores65: row[14], familias: row[15],
          tenencia: row[16], escritura: row[17], cuotas_adeuda: row[18],
          tipo_vivienda: row[19], material_paredes: row[20], ambientes_dormir: row[21],
          desague: row[22], agua_potable: row[23], electricidad: row[24], gas: row[25],
          discapacidad: row[26], tipo_discapacidad: row[27] ? row[27].split(', ') : [],
          cud: row[28], actividades_menores: row[29] ? row[29].split(', ') : [],
          actividades_adultos: row[30] ? row[30].split(', ') : [],
          actividades_mayores: row[31] ? row[31].split(', ') : [],
          mejora_barrio: row[32], mejora_municipio: row[33], falta_maipu: row[34],
          voto: row[35] } };
      }
      return { ...base, answers: { categoria: row[7], direccion: row[8], barrio: row[9],
        descripcion: row[10], urgencia: row[11], afecta_transito: row[12], observaciones: row[13] } };
    });
  },
};

// ── Padrón electoral ─────────────────────────────────────────────────────────
// Acceso de LECTURA via API Key de Google (planilla debe permitir "ver con vínculo")
// Acceso de ESCRITURA (lat/lng/domicilio real) via token OAuth del relevador
//
// Pestaña única "Padron integrado":
//   A=PADRON, B=TIPO_DNI, C=DOCUMENTO, D=SEXO, E=APELLIDO Y NOMBRE,
//   F=CLASE,  G=DOMICILIO, H=LATITUD,  I=LONGITUD, J=DOMICILIO REAL

const Padron = {
  _cache: {},

  _apiKeyHeaders() {
    return {};  // API key goes in query param, no auth header needed
  },

  _apiKeyParam() {
    return CONFIG.GOOGLE_API_KEY ? `?key=${CONFIG.GOOGLE_API_KEY}` : '';
  },

  _hasApiKey() {
    return !!CONFIG.GOOGLE_API_KEY;
  },

  searchByDNI(dni) {
    return this._mockSearch(dni);
  },

  async searchByDNIAsync(dni) {
    if (!this._hasApiKey()) return this._mockSearch(dni);
    return this._apiSearch(dni);
  },

  async searchByApellidoAsync(query) {
    if (!this._hasApiKey()) return this._mockSearchByApellido(query);
    return this._apiSearchByApellido(query);
  },

  async updateLatLng(meta, lat, lng, domicilioReal) {
    if (!meta?.coordRange) return;
    // Escribir en padrón requiere token del relevador (debe tener acceso de edición)
    const token = localStorage.getItem('severo_access_token');
    if (!token) {
      // Si no hay token, guardar solo en mock local
      return this._mockUpdateLatLng(meta, lat, lng);
    }
    return this._apiUpdateLatLng(meta, lat, lng, domicilioReal);
  },

  async upsertByDNI(record) {
    return this._mockUpsert(record);
  },

  // ── Conversión ───────────────────────────────────────────────────────────

  _titleCase(str) {
    if (!str) return '';
    return String(str).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  },

  // ── Mock (localStorage) ───────────────────────────────────────────────────

  _mockSearch(dni) {
    if (!dni) return null;
    const dniStr = String(dni).trim();
    const items = JSON.parse(localStorage.getItem('severo_padron') || '[]');
    const found = items.find((r) => r.dni === dniStr);
    if (!found) return null;
    return { ...found, _meta: { dni: dniStr } };
  },

  _mockSearchByApellido(query) {
    if (!query || query.length < 4) return [];
    const q = query.toLowerCase();
    const items = JSON.parse(localStorage.getItem('severo_padron') || '[]');
    return items
      .filter((r) => (r.apellido || '').toLowerCase().includes(q))
      .slice(0, 15)
      .map((r) => ({ ...r, _meta: { dni: r.dni } }));
  },

  _mockUpsert(record) {
    const items = JSON.parse(localStorage.getItem('severo_padron') || '[]');
    const idx = items.findIndex((r) => r.dni === String(record.dni).trim());
    const updated = { ...record, updatedAt: new Date().toISOString() };
    if (idx >= 0) items[idx] = { ...items[idx], ...updated };
    else items.push(updated);
    localStorage.setItem('severo_padron', JSON.stringify(items));
    return updated;
  },

  _mockUpdateLatLng(meta, lat, lng) {
    if (!meta?.dni) return;
    const items = JSON.parse(localStorage.getItem('severo_padron') || '[]');
    const idx = items.findIndex((r) => r.dni === meta.dni);
    if (idx >= 0) {
      items[idx] = { ...items[idx], lat, lng, updatedAt: new Date().toISOString() };
      localStorage.setItem('severo_padron', JSON.stringify(items));
    }
  },

  // ── API helpers ───────────────────────────────────────────────────────────

  async _fetchSheet(sheetName) {
    if (this._cache[sheetName]) return this._cache[sheetName];
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}${this._apiKeyParam()}`;
    console.log('[Padron] GET', sheetName, url.replace(/key=[^&]+/, 'key=…'));
    const res = await fetch(url);
    console.log('[Padron] status', res.status, sheetName);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Padrón API ${res.status}: ${body.error?.message || sheetName}`);
    }
    const rows = (await res.json()).values || [];
    this._cache[sheetName] = rows;
    return rows;
  },

  // ── Google Sheets API ────────────────────────────────────────────────────

  _rowToPadronRecord(row, rowIdx) {
    // A=DNI(0)  B=SEXO(1)  C=TIPO(2)
    // D–L = participación electoral (3–11)
    // M=PADRON(12)  N=TIPO_DNI(13)  O=APELLIDO Y NOMBRE(14)  P=CLASE(15)
    // Q=DOMICILIO(16)  R=LATITUD(17)  S=LONGITUD(18)  T=DOMICILIO REAL(19)
    // U=PROFESION(20)  V=CIRCUITO(21)  W=NRO_MESA(22)  X=ORDEN(23)
    // Y=ESTABLECIMIENTO(24)  Z=ocupacion(25)  AA=nivel_educativo(26)
    // AB=ESTADO CIVIL(27)  AC=AFILIACION(28)  AD=LOCALIDAD(29)
    // AE=EMPLEADOR1(30)  AF=EMPLEADOR2(31)  AG=EMPLEADOR3(32)
    // AH=REGIMEN_IMP(33)  AI=CELULAR1(34)  AJ=CELULAR2(35)
    // AK=EMAIL1(36)  AL=EMAIL2(37)  AM=AUH(38)  AN=IFE(39)  AO=TWITTER(40)
    return {
      dni:            String(row[0]  || '').trim(),
      sexo:           row[1]  || '',
      tipo:           row[2]  || '',
      elec_2025_sep:  row[3]  || '',
      elec_2025_oct:  row[4]  || '',
      elec_2023_paso: row[5]  || '',
      elec_2023_gen:  row[6]  || '',
      elec_2023_bal:  row[7]  || '',
      elec_2021_paso: row[8]  || '',
      elec_2021_gen:  row[9]  || '',
      elec_2019_paso: row[10] || '',
      elec_2019_gen:  row[11] || '',
      padron:         String(row[12] || '').trim(),
      tipo_dni:       row[13] || '',
      apellido:       this._titleCase(row[14] || ''),
      clase:          row[15] || '',
      domicilio:      this._titleCase(row[16] || ''),
      lat:            row[17] || '',
      lng:            row[18] || '',
      domicilio_real: this._titleCase(row[19] || ''),
      profesion:      this._titleCase(row[20] || ''),
      circuito:       row[21] || '',
      nro_mesa:       row[22] || '',
      orden:          row[23] || '',
      establecimiento:this._titleCase(row[24] || ''),
      ocupacion:      this._titleCase(row[25] || ''),
      nivel_educativo:row[26] || '',
      estado_civil:   row[27] || '',
      afiliacion:     row[28] || '',
      localidad:      row[29] || '',
      empleador1:     this._titleCase(row[30] || ''),
      empleador2:     this._titleCase(row[31] || ''),
      empleador3:     this._titleCase(row[32] || ''),
      regimen_imp:    row[33] || '',
      celular1:       row[34] || '',
      celular2:       row[35] || '',
      email1:         String(row[36] || '').toLowerCase(),
      email2:         String(row[37] || '').toLowerCase(),
      beneficiario_auh: row[38] || '',
      beneficiario_ife: row[39] || '',
      twitter:        row[40] || '',
      _meta: {
        coordRange:     `${CONFIG.SHEET_PADRON}!R${rowIdx}:S${rowIdx}`,
        coordRangeFull: `${CONFIG.SHEET_PADRON}!R${rowIdx}:T${rowIdx}`,
      },
    };
  },

  async _apiSearch(dni) {
    const dniStr = String(dni).trim();
    const rows = await this._fetchSheet(CONFIG.SHEET_PADRON);
    // fila 0 = encabezados; A=col 0 = DNI
    const i = rows.findIndex((r, idx) => idx > 0 && String(r[0] || '').trim() === dniStr);
    if (i <= 0) return null;
    return this._rowToPadronRecord(rows[i], i + 1);
  },

  async _apiSearchByApellido(query) {
    if (!query || query.length < 4) return [];
    const q = query.toLowerCase();
    const rows = await this._fetchSheet(CONFIG.SHEET_PADRON);
    const results = [];
    // fila 0 = encabezados; O=col 14 = APELLIDO Y NOMBRE
    rows.slice(1).forEach((row, i) => {
      if ((row[14] || '').toLowerCase().includes(q)) {
        results.push(this._rowToPadronRecord(row, i + 2));
      }
    });
    return results.slice(0, 15);
  },

  async _apiUpdateLatLng(meta, lat, lng, domicilioReal) {
    const token = localStorage.getItem('severo_access_token');
    if (!token) return;

    const useFullRange = !!(domicilioReal && meta.coordRangeFull);
    const range  = useFullRange ? meta.coordRangeFull : meta.coordRange;
    const values = useFullRange ? [[lat, lng, domicilioReal]] : [[lat, lng]];

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      }
    );
  },
};
