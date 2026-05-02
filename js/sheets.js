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
        return { ...base, answers: { nombre: row[7], edad: row[8], residencia: row[9],
          calidad_vida: row[10], problemas: row[11] ? row[11].split(', ') : [],
          mejoras: row[12], comentarios: row[13] } };
      } else {
        return { ...base, answers: { categoria: row[7], direccion: row[8], descripcion: row[9],
          urgencia: row[10], afecta_transito: row[11], observaciones: row[12] } };
      }
    });
  },
};
