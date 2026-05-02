const SheetsDB = {
  async save(type, record) {
    if (CONFIG.USE_MOCK) return this._mockSave(type, record);
    return this._apiAppend(type, record);
  },

  getAll(type) {
    if (CONFIG.USE_MOCK) return this._mockGetAll(type);
    // En modo API se necesita await; usar getAllAsync()
    throw new Error('Modo API: usar await SheetsDB.getAllAsync(type)');
  },

  async getAllAsync(type) {
    if (CONFIG.USE_MOCK) return this._mockGetAll(type);
    return this._apiGetAll(type);
  },

  async update(type, id, updates) {
    if (CONFIG.USE_MOCK) return this._mockUpdate(type, id, updates);
    // La actualización en Sheets requiere conocer la fila exacta; se implementa en v2
    console.warn('update() en modo API aún no implementado');
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

  async _apiAppend(type, record) {
    const sheet = type === 'ciudadano' ? CONFIG.SHEET_CIUDADANOS : CONFIG.SHEET_PROBLEMATICAS;
    const token = this._getToken();
    const row = this._toRow(type, record);

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${sheet}!A1:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [row] }),
      }
    );
    if (!res.ok) throw new Error(`Sheets API error: ${res.status}`);
    return record;
  },

  async _apiGetAll(type) {
    const sheet = type === 'ciudadano' ? CONFIG.SHEET_CIUDADANOS : CONFIG.SHEET_PROBLEMATICAS;
    const token = this._getToken();

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${sheet}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Sheets API error: ${res.status}`);
    const data = await res.json();
    return this._fromRows(type, data.values || []);
  },

  _getToken() {
    // El token de acceso se obtiene al hacer login con scope de Sheets
    // Ver: https://developers.google.com/identity/oauth2/web/guides/use-token-model
    const t = localStorage.getItem('severo_access_token');
    if (!t) throw new Error('Sin token de acceso. Reautenticar con scope de Sheets.');
    return t;
  },

  _toRow(type, r) {
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
      return [...base, a.nombre || '', a.edad || '', a.residencia || '',
        a.calidad_vida || '', (a.problemas || []).join(', '), a.mejoras || '', a.comentarios || ''];
    } else {
      const a = r.answers || {};
      return [...base, a.categoria || '', a.direccion || '', a.descripcion || '',
        a.urgencia || '', a.afecta_transito || '', a.observaciones || ''];
    }
  },

  _fromRows(type, rows) {
    // Inverse of _toRow; first row assumed to be headers
    return rows.slice(1).map((row) => {
      const base = { id: row[0], savedAt: row[1], operador: { email: row[2], name: row[3] },
        location: { lat: parseFloat(row[4]), lng: parseFloat(row[5]), accuracy: parseInt(row[6]) } };
      if (type === 'ciudadano') {
        return { ...base, answers: { dni: row[7], apellido: row[8], nombre: row[9],
          domicilio: row[10], edad: row[11], residencia: row[12],
          calidad_vida: row[13], problemas: row[14] ? row[14].split(', ') : [],
          mejoras: row[15], comentarios: row[16] } };
      } else {
        return { ...base, answers: { categoria: row[7], direccion: row[8], descripcion: row[9],
          urgencia: row[10], afecta_transito: row[11], observaciones: row[12] } };
      }
    });
  },
};

// ── Padrón electoral ─────────────────────────────────────────────────────────
// Pestaña "nativos":    A=TIPO_DOC, B=DOCUMENTO, D=APELLIDO Y NOMBRE, F=DOMICILIO, G=LATITUD, H=LOGITUD
// Pestaña "extranjeros": A=DOCUMENTO, C=APELLIDO Y NOMBRE, E=DOMICILIO, F=LATITUD, G=LONGITUD
// En mock: localStorage 'severo_padron' (para pruebas sin OAuth)

const Padron = {
  _cache: {},  // In-session cache: { [sheetName]: rows[] }

  searchByDNI(dni) {
    if (CONFIG.USE_MOCK) return this._mockSearch(dni);
    return null;
  },

  async searchByDNIAsync(dni) {
    if (CONFIG.USE_MOCK) return this._mockSearch(dni);
    return this._apiSearch(dni);
  },

  // Búsqueda por apellido parcial (mínimo 4 chars) — devuelve array de coincidencias
  async searchByApellidoAsync(query) {
    if (CONFIG.USE_MOCK) return this._mockSearchByApellido(query);
    return this._apiSearchByApellido(query);
  },

  async updateLatLng(meta, lat, lng) {
    if (CONFIG.USE_MOCK) return this._mockUpdateLatLng(meta, lat, lng);
    return this._apiUpdateLatLng(meta, lat, lng);
  },

  async upsertByDNI(record) {
    if (!CONFIG.USE_MOCK) return;
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
    const token = SheetsDB._getToken();
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${sheetName}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [];
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
        _meta: { coordRange: `${CONFIG.SHEET_PADRON_NATIVOS}!G${iN + 1}:H${iN + 1}` },
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
        _meta: { coordRange: `${CONFIG.SHEET_PADRON_EXTRANJEROS}!F${iE + 1}:G${iE + 1}` },
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
          _meta: { coordRange: `${CONFIG.SHEET_PADRON_NATIVOS}!G${i + 2}:H${i + 2}` },
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
          _meta: { coordRange: `${CONFIG.SHEET_PADRON_EXTRANJEROS}!F${i + 2}:G${i + 2}` },
        });
      }
    });

    return results.slice(0, 15);
  },

  async _apiUpdateLatLng(meta, lat, lng) {
    if (!meta?.coordRange) return;
    const token = SheetsDB._getToken();
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${meta.coordRange}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [[lat, lng]] }),
      }
    );
  },
};
