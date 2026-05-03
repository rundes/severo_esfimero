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
      return [...base, a.dni || '', sc(a.apellido), sc(a.apodo), sc(a.domicilio),
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
    return [...base, a.categoria || '', sc(a.direccion), sc(a.descripcion),
      a.urgencia || '', a.afecta_transito || '', sc(a.observaciones)];
  },

  _fromRows(type, rows) {
    return rows.filter(row => row.length > 0).map((row) => {
      const base = { id: row[0], savedAt: row[1], operador: { email: row[2], name: row[3] },
        location: { lat: parseFloat(row[4]), lng: parseFloat(row[5]), accuracy: parseInt(row[6]) } };
      if (type === 'ciudadano') {
        return { ...base, answers: { dni: row[7], apellido: row[8], apodo: row[9],
          domicilio: row[10], edad: row[11], residencia: row[12],
          calidad_vida: row[13], problemas: row[14] ? row[14].split(', ') : [],
          mejoras: row[15], comentarios: row[16] } };
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
      return { ...base, answers: { categoria: row[7], direccion: row[8], descripcion: row[9],
        urgencia: row[10], afecta_transito: row[11], observaciones: row[12] } };
    });
  },
};

// ── Padrón electoral ─────────────────────────────────────────────────────────
// Acceso de LECTURA via API Key de Google (planilla debe permitir "ver con vínculo")
// Acceso de ESCRITURA (lat/lng/domicilio real) via token OAuth del relevador
//
// Pestaña "nativos":
//   A=TIPO_DOC, B=DOCUMENTO, D=APELLIDO Y NOMBRE, F=DOMICILIO,
//   G=LATITUD, H=LONGITUD, I=DOMICILIO REAL  ← col I nueva, no modifica PADRON INICIAL
//
// Pestaña "extranjeros":
//   A=DOCUMENTO, C=APELLIDO Y NOMBRE, E=DOMICILIO,
//   F=LATITUD, G=LONGITUD, H=DOMICILIO REAL  ← col H nueva, no modifica PADRON INICIAL

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

  async _apiSearch(dni) {
    const dniStr = String(dni).trim();

    const nRows = await this._fetchSheet(CONFIG.SHEET_PADRON_NATIVOS);
    const iN = nRows.findIndex((r, idx) => idx > 0 && String(r[1] || '').trim() === dniStr);
    if (iN > 0) {
      return {
        apellido:  this._titleCase(nRows[iN][3] || ''),
        domicilio: this._titleCase(nRows[iN][5] || ''),
        dni:       dniStr,
        lat:       nRows[iN][6] || '',
        lng:       nRows[iN][7] || '',
        _meta: {
          coordRange:     `${CONFIG.SHEET_PADRON_NATIVOS}!G${iN + 1}:H${iN + 1}`,
          coordRangeFull: `${CONFIG.SHEET_PADRON_NATIVOS}!G${iN + 1}:I${iN + 1}`,
        },
      };
    }

    const eRows = await this._fetchSheet(CONFIG.SHEET_PADRON_EXTRANJEROS);
    const iE = eRows.findIndex((r, idx) => idx > 0 && String(r[0] || '').trim() === dniStr);
    if (iE > 0) {
      return {
        apellido:  this._titleCase(eRows[iE][2] || ''),
        domicilio: this._titleCase(eRows[iE][4] || ''),
        dni:       dniStr,
        lat:       eRows[iE][5] || '',
        lng:       eRows[iE][6] || '',
        _meta: {
          coordRange:     `${CONFIG.SHEET_PADRON_EXTRANJEROS}!F${iE + 1}:G${iE + 1}`,
          coordRangeFull: `${CONFIG.SHEET_PADRON_EXTRANJEROS}!F${iE + 1}:H${iE + 1}`,
        },
      };
    }

    return null;
  },

  async _apiSearchByApellido(query) {
    if (!query || query.length < 4) return [];
    const q = query.toLowerCase();
    const results = [];

    const nRows = await this._fetchSheet(CONFIG.SHEET_PADRON_NATIVOS);
    nRows.slice(1).forEach((row, i) => {
      const apellido = this._titleCase(row[3] || '');
      if (apellido.toLowerCase().includes(q)) {
        results.push({
          apellido,
          domicilio: this._titleCase(row[5] || ''),
          dni: String(row[1] || '').trim(),
          lat: row[6] || '',
          lng: row[7] || '',
          _meta: {
            coordRange:     `${CONFIG.SHEET_PADRON_NATIVOS}!G${i + 2}:H${i + 2}`,
            coordRangeFull: `${CONFIG.SHEET_PADRON_NATIVOS}!G${i + 2}:I${i + 2}`,
          },
        });
      }
    });

    const eRows = await this._fetchSheet(CONFIG.SHEET_PADRON_EXTRANJEROS);
    eRows.slice(1).forEach((row, i) => {
      const apellido = this._titleCase(row[2] || '');
      if (apellido.toLowerCase().includes(q)) {
        results.push({
          apellido,
          domicilio: this._titleCase(row[4] || ''),
          dni: String(row[0] || '').trim(),
          lat: row[5] || '',
          lng: row[6] || '',
          _meta: {
            coordRange:     `${CONFIG.SHEET_PADRON_EXTRANJEROS}!F${i + 2}:G${i + 2}`,
            coordRangeFull: `${CONFIG.SHEET_PADRON_EXTRANJEROS}!F${i + 2}:H${i + 2}`,
          },
        });
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
