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
  // Búsqueda sincrónica (mock) — no usar en modo API
  searchByDNI(dni) {
    if (CONFIG.USE_MOCK) return this._mockSearch(dni);
    return null;
  },

  // Búsqueda asíncrona — busca primero en nativos, luego en extranjeros
  async searchByDNIAsync(dni) {
    if (CONFIG.USE_MOCK) return this._mockSearch(dni);
    return this._apiSearch(dni);
  },

  // Persiste lat/lng en el padrón (mock: localStorage; API: escribe G-H o F-G según pestaña)
  async updateLatLng(meta, lat, lng) {
    if (CONFIG.USE_MOCK) return this._mockUpdateLatLng(meta, lat, lng);
    return this._apiUpdateLatLng(meta, lat, lng);
  },

  // Upsert completo de registro en mock (solo se usa en modo prototipo)
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

  // ── Google Sheets API ────────────────────────────────────────────────────

  async _apiSearch(dni) {
    const token = SheetsDB._getToken();
    const dniStr = String(dni).trim();

    // 1. Buscar en nativos (DOCUMENTO = col B, índice 1)
    const rN = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.SHEET_PADRON_NATIVOS}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (rN.ok) {
      const rows = (await rN.json()).values || [];
      const i = rows.findIndex((r, idx) => idx > 0 && String(r[1] || '').trim() === dniStr);
      if (i > 0) {
        return {
          apellido:  this._titleCase(rows[i][3] || ''),   // APELLIDO Y NOMBRE
          domicilio: this._titleCase(rows[i][5] || ''),   // DOMICILIO
          lat:       rows[i][6] || '',                    // LATITUD
          lng:       rows[i][7] || '',                    // LOGITUD
          _meta: { coordRange: `${CONFIG.SHEET_PADRON_NATIVOS}!G${i + 1}:H${i + 1}` },
        };
      }
    }

    // 2. Buscar en extranjeros (DOCUMENTO = col A, índice 0)
    const rE = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.SHEET_PADRON_EXTRANJEROS}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (rE.ok) {
      const rows = (await rE.json()).values || [];
      const i = rows.findIndex((r, idx) => idx > 0 && String(r[0] || '').trim() === dniStr);
      if (i > 0) {
        return {
          apellido:  this._titleCase(rows[i][2] || ''),   // APELLIDO Y NOMBRE
          domicilio: this._titleCase(rows[i][4] || ''),   // DOMICILIO
          lat:       rows[i][5] || '',                    // LATITUD
          lng:       rows[i][6] || '',                    // LONGITUD
          _meta: { coordRange: `${CONFIG.SHEET_PADRON_EXTRANJEROS}!F${i + 1}:G${i + 1}` },
        };
      }
    }

    return null; // no encontrado en ninguna pestaña
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
