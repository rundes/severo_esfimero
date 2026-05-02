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

// ── Padrón de ciudadanos ─────────────────────────────────────────────────────
// Columns: DNI | Nombre | Apellido | Domicilio | ActualizadoEn

const Padron = {
  searchByDNI(dni) {
    if (CONFIG.USE_MOCK) return this._mockSearch(dni);
    return null; // modo API: usar searchByDNIAsync
  },

  async searchByDNIAsync(dni) {
    if (CONFIG.USE_MOCK) return this._mockSearch(dni);
    return this._apiSearch(dni);
  },

  async upsertByDNI(record) {
    if (CONFIG.USE_MOCK) return this._mockUpsert(record);
    return this._apiUpsert(record);
  },

  // ── Mock ──────────────────────────────────────────────────────────────────

  _mockSearch(dni) {
    if (!dni) return null;
    const items = JSON.parse(localStorage.getItem('severo_padron') || '[]');
    return items.find((r) => r.dni === String(dni).trim()) || null;
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

  // ── Google Sheets API ────────────────────────────────────────────────────

  async _apiSearch(dni) {
    const token = SheetsDB._getToken();
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.SHEET_PADRON}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Sheets API error: ${res.status}`);
    const data = await res.json();
    const found = (data.values || []).slice(1).find((r) => r[0] === String(dni).trim());
    if (!found) return null;
    return { dni: found[0], nombre: found[1] || '', apellido: found[2] || '', domicilio: found[3] || '' };
  },

  async _apiUpsert(record) {
    const token = SheetsDB._getToken();
    const sheet = CONFIG.SHEET_PADRON;

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${sheet}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Sheets API error: ${res.status}`);
    const data = await res.json();
    const rows = data.values || [];
    const rowIdx = rows.slice(1).findIndex((r) => r[0] === String(record.dni).trim());
    const row = [record.dni, record.nombre || '', record.apellido || '', record.domicilio || '', new Date().toISOString()];

    if (rowIdx >= 0) {
      const range = `${sheet}!A${rowIdx + 2}:E${rowIdx + 2}`;
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [row] }),
        }
      );
    } else {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${sheet}!A1:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [row] }),
        }
      );
    }
  },
};
