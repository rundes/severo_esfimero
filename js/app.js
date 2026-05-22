// ── Mapa Leaflet (instancias globales) ───────────────────────────────────────

let _map = null;
let _marker = null;
let _searchDebounce = null;
let _geocodeDebounce = null;
let _homeSearchDebounce = null;
let _familiaSearchDebounce = null;
let _tokenClient = null;
let _silentRefreshResolve = null;
let _silentRefreshReject   = null;
let _listFilter = 'todos';
let _photoBlobs  = {}; // blob URLs keyed by questionId, in-session preview only

// Inicializar el cliente OAuth2 de Google (llamado por onload del script GSI)
function initGoogleTokenClient() {
  if (!window.google?.accounts?.oauth2) return;
  const id = CONFIG.GOOGLE_CLIENT_ID;
  if (!id || id === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') return;

  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: id,
    scope: 'openid email profile https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/devstorage.read_write',
    callback: async (tokenResponse) => {
      // Refresh silencioso iniciado por ensureFreshToken()
      if (_silentRefreshResolve) {
        const resolve = _silentRefreshResolve;
        const reject  = _silentRefreshReject;
        _silentRefreshResolve = null;
        _silentRefreshReject  = null;
        if (tokenResponse.error) return reject(new Error(tokenResponse.error));
        localStorage.setItem('severo_access_token', tokenResponse.access_token);
        return resolve(tokenResponse.access_token);
      }
      // Login normal
      if (tokenResponse.error) return;
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo',
          { headers: { Authorization: `Bearer ${tokenResponse.access_token}` } });
        if (res.ok) {
          const info = await res.json();
          const user = Auth.handleGoogleToken(tokenResponse.access_token, info);
          go('home', { user });
        }
      } catch (e) {
        console.error('Error al obtener datos del usuario:', e);
      }
    },
  });
}

function googleLogin() {
  if (_tokenClient) _tokenClient.requestAccessToken({ prompt: '' });
}

// Renueva el token silenciosamente sin mostrar popup.
function ensureFreshToken() {
  return new Promise((resolve, reject) => {
    if (!_tokenClient) return reject(new Error('Cliente OAuth no disponible'));
    _silentRefreshResolve = resolve;
    _silentRefreshReject  = reject;
    _tokenClient.requestAccessToken({ prompt: '' });
    setTimeout(() => {
      if (_silentRefreshResolve) {
        _silentRefreshResolve = null;
        _silentRefreshReject  = null;
        reject(new Error('Timeout al renovar sesión — volvé a ingresar'));
      }
    }, 15000);
  });
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Estado global ────────────────────────────────────────────────────────────

const State = {
  screen: 'auth',
  user: null,
  location: null,
  domicilioReal: null,
  surveyType: null,   // 'ciudadano' | 'problematica' | 'sociohabitacional'
  answers: {},
  currentQ: 0,
  surveys: [],
  detailRecord: null,
  toast: null,
  padronLoaded: false,
  padronFilled: {},
  padronMeta:   null,
  padronDomicilio: null,  // domicilio registrado en el padrón
  padronLocation:  null,  // { lat, lng } guardados previamente en el padrón
  // citizen search (survey flow)
  citizenSearchQuery: '',
  citizenDNIQuery: '',
  citizenSearchResults: [],
  citizenSearching: false,
  citizenSearchError: null,
  // home padron search
  homeSearchQuery: '',
  homeSearchResults: [],
  homeSearching: false,
  homeSearchError: null,
  // padron detail
  padronDetailRecord: null,
  familiaSearchQuery: '',
  familiaSearchResults: [],
  familiaSearching: false,
  // preselected citizen from detail → new survey
  _preselectedCitizen: null,
  // current DNI context for familia group operations
  familiaDni: '',
};

// ── Entrada ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
  if (Auth.isLoggedIn()) {
    go('home', { user: Auth.getUser() });
  } else {
    render();
  }
});

// Compatibilidad: si GSI carga antes que initGoogleTokenClient se llame
window.addEventListener('load', () => {
  if (!_tokenClient) initGoogleTokenClient();
});

// ── Navegación ───────────────────────────────────────────────────────────────

function go(screen, updates = {}) {
  Object.assign(State, updates, { screen });
  render();
}

function render() {
  // Destruir el mapa Leaflet si salimos de la pantalla geo
  if (_map && State.screen !== 'geo') {
    _map.remove();
    _map = null;
    _marker = null;
  }

  const el = document.getElementById('app');
  const screens = {
    auth:            renderAuth,
    home:            renderHome,
    geo:             renderGeo,
    typeSelect:      renderTypeSelect,
    datosPersonales: renderDatosPersonales,
    citizenSearch:   renderCitizenSearch,
    survey:          renderSurvey,
    summary:         renderSummary,
    saving:          renderSaving,
    done:            renderDone,
    list:            renderList,
    detail:          renderDetail,
    padronDetail:    renderPadronDetail,
  };
  el.innerHTML = (screens[State.screen] || renderAuth)();
  bindEvents();
  if (State.screen === 'geo') startGeoCapture();
  if (State.screen === 'saving') doSave();
  if (State.screen === 'list') loadList();
  if (State.screen === 'detail' && State.detailRecord?.answers?.foto_url) {
    loadDetailPhoto(State.detailRecord.answers.foto_url);
  }
  if (State.toast) showToast(State.toast);
}

// ── Utilidades UI ────────────────────────────────────────────────────────────

function avatar(user) {
  if (user?.picture) return `<img src="${user.picture}" class="avatar" alt="">`;
  const initials = (user?.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return `<div class="avatar avatar-initials">${initials}</div>`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit' });
}

function typeLabel(type) {
  if (type === 'ciudadano')        return 'Ciudadano';
  if (type === 'sociohabitacional') return 'Socio-habitacional';
  return 'Problemática';
}

function typeIcon(type) {
  if (type === 'ciudadano')        return '🧑';
  if (type === 'sociohabitacional') return '🏠';
  return '⚠️';
}

// ── Helpers de visibilidad condicional ───────────────────────────────────────

function isVisible(q) {
  return !q.showIf || q.showIf(State.answers);
}

function nextVisibleIdx(from, questions) {
  let idx = from + 1;
  while (idx < questions.length && !isVisible(questions[idx])) idx++;
  return idx;
}

function prevVisibleIdx(from, questions) {
  let idx = from - 1;
  while (idx >= 0 && !isVisible(questions[idx])) idx--;
  return idx;
}

function visibleQuestions(questions) {
  return questions.filter(isVisible);
}

function visiblePosition(questions, currentIdx) {
  return questions.slice(0, currentIdx + 1).filter(isVisible).length;
}

// ── Pantallas ────────────────────────────────────────────────────────────────

function renderAuth() {
  const isConfigured = CONFIG.GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
  return `
    <div class="screen screen-auth">
      <div class="auth-hero">
        <img src="https://cpelectoral.org/wp-content/uploads/2024/09/escarapela-05-768x775.png"
          class="logo-img" alt="Severo">
        <h1 class="logo-title">Severo</h1>
        <p class="logo-sub">Sistema de Relevamientos</p>
      </div>
      <div class="auth-card">
        ${isConfigured
          ? `<button class="btn btn-google btn-block" onclick="googleLogin()">
               <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" height="18" alt="">
               Ingresar con Google
             </button>`
          : `<p class="google-not-configured">⚠ Configurar GOOGLE_CLIENT_ID para habilitar el acceso con Google</p>`}
        <div class="divider"><span>o</span></div>
        <button class="btn btn-ghost btn-block" onclick="mockLogin()" style="font-size:.9rem;border:1px solid var(--border)">
          Entrar como operador de prueba
        </button>
        ${CONFIG.USE_MOCK ? `<p class="hint" style="margin-top:0">Modo prototipo — surveys en localStorage · padrón desde Google Sheets</p>` : ''}
      </div>
    </div>`;
}

function mockLogin() {
  const user = Auth.mockLogin();
  go('home', { user });
}

function renderHome() {
  const u = State.user;
  return `
    <div class="screen">
      <header class="app-header">
        <img src="https://cpelectoral.org/wp-content/uploads/2024/09/escarapela-05-768x775.png" class="header-logo" alt="">
        <span class="header-title">Severo</span>
        <button class="btn-icon" onclick="logout()" title="Salir">⏏</button>
      </header>
      <div class="home-user">
        ${avatar(u)}
        <div>
          <div class="user-name">${u?.name || ''}</div>
          <div class="user-email">${u?.email || ''}</div>
        </div>
      </div>
      <div class="home-actions">
        <button class="btn btn-primary btn-block" onclick="startNewSurvey()">
          + Nuevo relevamiento
        </button>
        <button class="btn btn-outline btn-block" onclick="go('list')">
          Ver historial
        </button>
      </div>
      <div class="home-search-section">
        <div class="home-search-label">Buscar ciudadano en el padrón</div>
        <input type="text" class="input" id="homeSearchInput"
          placeholder="Apellido (4+ letras) o DNI (6+ dígitos)…"
          value="${esc(State.homeSearchQuery || '')}"
          oninput="onHomeSearchInput(this.value)"
          autocomplete="off">
        <div id="homeSearchResults">${renderHomeSearchResults()}</div>
      </div>
      ${CONFIG.USE_MOCK ? `<p class="hint center">Modo prototipo — datos en localStorage</p>` : ''}
    </div>`;
}

function logout() {
  Auth.logout();
  go('auth', { user: null });
}

// ── Home padron search ───────────────────────────────────────────────────────

function onHomeSearchInput(value) {
  State.homeSearchQuery = value;
  clearTimeout(_homeSearchDebounce);
  const isNumeric = /^\d+$/.test(value.trim());
  const minLen = isNumeric ? 6 : 4;
  if (value.length >= minLen) {
    State.homeSearching = true;
    State.homeSearchResults = [];
    State.homeSearchError = null;
    updateHomeSearchUI();
    _homeSearchDebounce = setTimeout(() => doHomeSearch(value, isNumeric), 450);
  } else {
    State.homeSearchResults = [];
    State.homeSearching = false;
    State.homeSearchError = null;
    updateHomeSearchUI();
  }
}

function updateHomeSearchUI() {
  const el = document.getElementById('homeSearchResults');
  if (el) el.innerHTML = renderHomeSearchResults();
}

async function doHomeSearch(value, isNumeric) {
  try {
    let results;
    if (isNumeric) {
      const record = await Padron.searchByDNIAsync(value);
      results = record ? [record] : [];
    } else {
      results = await Padron.searchByApellidoAsync(value);
    }
    State.homeSearchResults = results || [];
    State.homeSearchError = null;
    State.homeSearching = false;
  } catch (err) {
    console.error('[homeSearch] error:', err);
    State.homeSearchError = err.message;
    State.homeSearchResults = [];
    State.homeSearching = false;
  }
  updateHomeSearchUI();
}

function renderHomeSearchResults() {
  if (State.homeSearching) {
    return `<div class="search-status"><div class="geo-spinner"></div> Buscando en el padrón…</div>`;
  }
  if (State.homeSearchError) {
    return `<div class="search-status search-error">⚠ ${esc(State.homeSearchError)}</div>`;
  }
  const results = State.homeSearchResults || [];
  if (!results.length) {
    const hasQuery = (State.homeSearchQuery?.length >= 4);
    return hasQuery ? `<div class="search-status">Sin resultados en el padrón</div>` : '';
  }
  return `<div class="citizen-results">
    ${results.map((r, i) => `
      <div class="citizen-result" onclick="openPadronDetail(${i})">
        <div class="citizen-result-name">${esc(r.apellido) || '—'}</div>
        <div class="citizen-result-info">DNI ${esc(r.dni)} · ${esc(r.domicilio) || 'Sin domicilio'}</div>
      </div>`).join('')}
  </div>`;
}

function openPadronDetail(idx) {
  const record = (State.homeSearchResults || [])[idx];
  if (record) {
    go('padronDetail', { padronDetailRecord: record,
      familiaSearchQuery: '', familiaSearchResults: [], familiaSearching: false });
  }
}

// ── Padron detail screen ─────────────────────────────────────────────────────

function getFamiliaGroup(dni) {
  if (!dni) return [];
  const grupos = JSON.parse(localStorage.getItem('severo_grupos_familiares') || '{}');
  return grupos[String(dni)] || [];
}

function saveFamiliaGroup(dni, group) {
  const grupos = JSON.parse(localStorage.getItem('severo_grupos_familiares') || '{}');
  grupos[String(dni)] = group;
  localStorage.setItem('severo_grupos_familiares', JSON.stringify(grupos));
}

function addFamiliaMember(idx) {
  const member = (State.familiaSearchResults || [])[idx];
  const r = State.padronDetailRecord;
  if (!member || !r?.dni) return;
  const group = getFamiliaGroup(r.dni);
  if (!group.find((m) => m.dni === member.dni)) {
    group.push({ dni: member.dni, apellido: member.apellido, domicilio: member.domicilio });
    saveFamiliaGroup(r.dni, group);
    const reverseGroup = getFamiliaGroup(member.dni);
    if (!reverseGroup.find((m) => m.dni === r.dni)) {
      reverseGroup.push({ dni: r.dni, apellido: r.apellido, domicilio: r.domicilio });
      saveFamiliaGroup(member.dni, reverseGroup);
    }
  }
  State.familiaSearchResults = [];
  State.familiaSearchQuery = '';
  const input = document.getElementById('familiaSearchInput');
  if (input) input.value = '';
  const el = document.getElementById('familiaSection');
  if (el) el.innerHTML = renderFamiliaSection();
}

function removeFamiliaMember(mainDni, idx) {
  const group = getFamiliaGroup(mainDni);
  const removed = group[idx];
  group.splice(idx, 1);
  saveFamiliaGroup(mainDni, group);
  if (removed) {
    const rev = getFamiliaGroup(removed.dni).filter((m) => m.dni !== mainDni);
    saveFamiliaGroup(removed.dni, rev);
  }
  const el = document.getElementById('familiaSection');
  if (el) el.innerHTML = renderFamiliaSection();
}

function renderFamiliaSection() {
  const r = State.padronDetailRecord;
  if (!r) return '';
  const familia = getFamiliaGroup(r.dni);
  return `
    ${familia.length > 0
      ? `<div class="familia-list">
          ${familia.map((m, i) => `
            <div class="familia-member">
              <div class="familia-member-info">
                <div class="familia-member-name">${esc(m.apellido) || '—'}</div>
                <div class="familia-member-sub">DNI ${esc(m.dni)}${m.domicilio ? ' · ' + esc(m.domicilio) : ''}</div>
              </div>
              <button class="btn-icon btn-remove" onclick="removeFamiliaMember('${esc(r.dni)}',${i})" title="Quitar">✕</button>
            </div>`).join('')}
        </div>`
      : '<p class="hint" style="text-align:left;padding:4px 0 8px;color:var(--text-2)">Sin miembros registrados</p>'}
    <div class="familia-add-row">
      <input type="text" class="input" id="familiaSearchInput"
        placeholder="Buscar por apellido o DNI para agregar…"
        oninput="onFamiliaSearchInput(this.value)"
        autocomplete="off">
    </div>
    <div id="familiaSearchResults"></div>`;
}

function onFamiliaSearchInput(value) {
  State.familiaSearchQuery = value;
  clearTimeout(_familiaSearchDebounce);
  const isNumeric = /^\d+$/.test(value.trim());
  const minLen = isNumeric ? 6 : 4;
  if (value.length >= minLen) {
    State.familiaSearching = true;
    State.familiaSearchResults = [];
    const el = document.getElementById('familiaSearchResults');
    if (el) el.innerHTML = `<div class="search-status"><div class="geo-spinner"></div> Buscando…</div>`;
    _familiaSearchDebounce = setTimeout(() => doFamiliaSearch(value, isNumeric), 450);
  } else {
    State.familiaSearchResults = [];
    State.familiaSearching = false;
    const el = document.getElementById('familiaSearchResults');
    if (el) el.innerHTML = '';
  }
}

async function doFamiliaSearch(value, isNumeric) {
  try {
    let results;
    if (isNumeric) {
      const record = await Padron.searchByDNIAsync(value);
      results = record ? [record] : [];
    } else {
      results = await Padron.searchByApellidoAsync(value);
    }
    const mainDni = State.padronDetailRecord?.dni;
    const existingDnis = new Set([mainDni, ...getFamiliaGroup(mainDni).map((m) => m.dni)]);
    State.familiaSearchResults = (results || []).filter((r) => !existingDnis.has(r.dni));
    State.familiaSearching = false;
  } catch (err) {
    State.familiaSearchResults = [];
    State.familiaSearching = false;
  }
  const el = document.getElementById('familiaSearchResults');
  if (el) el.innerHTML = renderFamiliaAddResults();
}

function renderFamiliaAddResults() {
  const results = State.familiaSearchResults || [];
  if (!results.length) return '';
  return `<div class="familia-search-results">
    ${results.map((r, i) => `
      <div class="familia-search-result">
        <div class="familia-member-info">
          <div class="familia-member-name">${esc(r.apellido) || '—'}</div>
          <div class="familia-member-sub">DNI ${esc(r.dni)}${r.domicilio ? ' · ' + esc(r.domicilio) : ''}</div>
        </div>
        <button class="btn btn-ghost familia-add-btn" onclick="addFamiliaMember(${i})">+ Agregar</button>
      </div>`).join('')}
  </div>`;
}

function _parseCoord(v) {
  return parseFloat(String(v || '').replace(/,/g, '.'));
}

function renderPadronDetail() {
  const r = State.padronDetailRecord;
  if (!r) { go('home'); return ''; }

  const lat = _parseCoord(r.lat);
  const lng = _parseCoord(r.lng);
  const hasCoords = !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0
    && Math.abs(lat) < 90 && Math.abs(lng) < 180;
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps?q=${encodeURIComponent(lat + ',' + lng)}`
    : null;

  const field = (label, val) => val
    ? `<div class="padron-row">
         <span class="padron-key">${esc(label)}</span>
         <span class="padron-val">${esc(val)}</span>
       </div>`
    : '';

  const elections = [
    { label: '2019 PASO',  val: r.elec_2019_paso },
    { label: '2019 Gral',  val: r.elec_2019_gen },
    { label: '2021 PASO',  val: r.elec_2021_paso },
    { label: '2021 Gral',  val: r.elec_2021_gen },
    { label: '2023 PASO',  val: r.elec_2023_paso },
    { label: '2023 Gral',  val: r.elec_2023_gen },
    { label: '2023 Bal.',  val: r.elec_2023_bal },
    { label: '2025 Sep',   val: r.elec_2025_sep },
    { label: '2025 Oct',   val: r.elec_2025_oct },
  ].filter((e) => e.val && e.val !== '');

  const elecClass = (v) => {
    if (!v) return '';
    const u = v.toUpperCase();
    if (u.includes('VOTÓ') && !u.includes('NO')) return 'elec-voted';
    if (u.includes('NO')) return 'elec-absent';
    return 'elec-neutral';
  };

  return `
    <div class="screen">
      <header class="app-header">
        <button class="btn-icon" onclick="go('home')">←</button>
        <span class="header-title">Perfil del ciudadano</span>
      </header>
      <div class="padron-detail-body">

        <div class="padron-detail-hero">
          <div class="padron-detail-name">${esc(r.apellido) || '—'}</div>
          <div class="padron-detail-sub">
            DNI ${esc(r.dni)}${r.sexo ? ' · ' + esc(r.sexo) : ''}${r.tipo ? ' · ' + esc(r.tipo) : ''}
          </div>
        </div>

        <div class="padron-section">
          <div class="padron-section-title">Datos personales</div>
          ${field('Clase / Año', r.clase)}
          ${field('Estado civil', r.estado_civil)}
          ${field('Localidad', r.localidad)}
          ${field('Profesión', r.profesion)}
          ${field('Ocupación', r.ocupacion)}
          ${field('Nivel educativo', r.nivel_educativo)}
          ${field('Régimen impositivo', r.regimen_imp)}
          ${field('Afiliación política', r.afiliacion)}
        </div>

        ${(r.celular1 || r.celular2 || r.email1 || r.email2 || r.twitter) ? `
        <div class="padron-section">
          <div class="padron-section-title">Contacto</div>
          ${field('Celular 1', r.celular1)}
          ${field('Celular 2', r.celular2)}
          ${field('Email 1', r.email1)}
          ${field('Email 2', r.email2)}
          ${field('Twitter', r.twitter)}
          ${field('Benef. AUH', r.beneficiario_auh)}
          ${field('Benef. IFE', r.beneficiario_ife)}
        </div>` : ''}

        <div class="padron-section">
          <div class="padron-section-title">Domicilio</div>
          ${field('Electoral', r.domicilio)}
          ${field('Real', r.domicilio_real)}
          ${hasCoords ? `<div class="padron-row">
            <span class="padron-key">Ubicación</span>
            <span class="padron-val">
              <a href="${mapsUrl}" target="_blank" class="loc-link">
                📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}
              </a>
            </span>
          </div>` : ''}
        </div>

        ${(r.empleador1 || r.empleador2 || r.empleador3) ? `
        <div class="padron-section">
          <div class="padron-section-title">Empleadores</div>
          ${field('Empleador 1', r.empleador1)}
          ${field('Empleador 2', r.empleador2)}
          ${field('Empleador 3', r.empleador3)}
        </div>` : ''}

        <div class="padron-section">
          <div class="padron-section-title">Datos electorales</div>
          ${field('N° padrón', r.padron)}
          ${field('Tipo DNI', r.tipo_dni)}
          ${field('Circuito', r.circuito)}
          ${field('Mesa', r.nro_mesa)}
          ${field('Orden en mesa', r.orden)}
          ${field('Establecimiento', r.establecimiento)}
        </div>

        ${elections.length > 0 ? `
        <div class="padron-section">
          <div class="padron-section-title">Participación electoral</div>
          <div class="elec-grid">
            ${elections.map((e) => `
              <div class="elec-cell">
                <div class="elec-label">${esc(e.label)}</div>
                <div class="elec-value ${elecClass(e.val)}">${esc(e.val)}</div>
              </div>`).join('')}
          </div>
        </div>` : ''}

        <div class="padron-section">
          <div class="padron-section-title">Grupo familiar</div>
          <div id="familiaSection">${renderFamiliaSection()}</div>
        </div>

        <div class="padron-actions">
          <button class="btn btn-primary btn-block" onclick="startSurveyFromPadron()">
            + Nuevo relevamiento
          </button>
        </div>

      </div>
    </div>`;
}

function startSurveyFromPadron() {
  _photoBlobs = {};
  go('typeSelect', { answers: {}, currentQ: 0, location: null, domicilioReal: null,
    surveyType: null, padronLoaded: false, padronFilled: {}, padronMeta: null,
    padronDomicilio: null, padronLocation: null,
    citizenSearchQuery: '', citizenDNIQuery: '', citizenSearchResults: [],
    citizenSearching: false, citizenSearchError: null,
    _preselectedCitizen: State.padronDetailRecord || null });
}

function startNewSurvey() {
  go('typeSelect', { answers: {}, currentQ: 0, location: null, domicilioReal: null,
    surveyType: null, padronLoaded: false, padronFilled: {}, padronMeta: null,
    padronDomicilio: null, padronLocation: null,
    citizenSearchQuery: '', citizenDNIQuery: '', citizenSearchResults: [],
    citizenSearching: false, citizenSearchError: null,
    _preselectedCitizen: null });
}

function _updateGeoBarrio(lat, lng) {
  const el = document.getElementById('geoBarrio');
  const nameEl = document.getElementById('geoBarrioName');
  if (!el || !nameEl) return;
  const b = typeof barrioFromPoint === 'function' ? barrioFromPoint(lat, lng) : null;
  if (b) { nameEl.textContent = b; el.style.display = ''; }
  else { el.style.display = 'none'; }
}

function renderGeo() {
  const geoTitles = {
    ciudadano:        'Ubicación del domicilio',
    sociohabitacional:'Ubicación de la vivienda',
    problematica:     'Ubicación de la problemática',
  };
  const title = geoTitles[State.surveyType] || 'Ubicación';
  const backTarget = State.surveyType === 'sociohabitacional' ? 'datosPersonales'
    : State.surveyType === 'ciudadano' ? 'citizenSearch'
    : 'typeSelect';
  return `
    <div class="screen screen-geo">
      <header class="app-header">
        <button class="btn-icon" onclick="go('${backTarget}')">←</button>
        <span class="header-title">📍 ${title}</span>
      </header>
      <div class="geo-search-row">
        <input type="text" class="input geo-search-input" id="geoSearchInput"
          placeholder="Buscar dirección…" autocomplete="off"
          value="${esc(State.padronDomicilio || '')}"
          onkeydown="if(event.key==='Enter'){event.preventDefault();doGeoSearch()}">
        <button class="btn btn-ghost geo-search-btn" onclick="doGeoSearch()">Buscar</button>
      </div>
      <div class="geo-status-bar" id="geoStatusBar">
        <div class="geo-spinner" id="geoSpinner"></div>
        <span id="geoStatus">Obteniendo ubicación…</span>
      </div>
      <div id="geoMap" class="geo-map"></div>
      <div class="geo-footer" id="geoFooter" style="display:none">
        <p class="geo-coords" id="geoCoords"></p>
        <p class="geo-barrio" id="geoBarrio" style="display:none">Barrio detectado: <strong id="geoBarrioName"></strong></p>
        <div class="geo-actions">
          <button class="btn btn-ghost" onclick="skipGeo()">Sin ubicación</button>
          <button class="btn btn-primary" onclick="confirmGeo()">✓ Confirmar</button>
        </div>
      </div>
    </div>`;
}

async function startGeoCapture() {
  const statusEl  = document.getElementById('geoStatus');
  const spinnerEl = document.getElementById('geoSpinner');
  const coordsEl  = document.getElementById('geoCoords');
  const footerEl  = document.getElementById('geoFooter');
  // Coordenadas por defecto: Maipú, Mendoza
  const DEFAULT = { lat: -32.9817, lng: -68.7946 };

  async function updateAddress(lat, lng) {
    const searchEl = document.getElementById('geoSearchInput');
    if (!searchEl) return;
    spinnerEl.style.display = 'inline-block';
    statusEl.textContent = 'Obteniendo dirección…';
    const addr = await Geo.reverseGeocode(lat, lng);
    spinnerEl.style.display = 'none';
    statusEl.textContent = 'Arrastrá el pin o tocá el mapa para ajustar';
    if (addr) searchEl.value = addr;
  }

  function scheduleGeocode(lat, lng) {
    clearTimeout(_geocodeDebounce);
    _geocodeDebounce = setTimeout(() => updateAddress(lat, lng), 600);
  }

  function initMap(lat, lng) {
    _map = L.map('geoMap').setView([lat, lng], 17);
    L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{y}.png', {
      tms: true,
      maxNativeZoom: 15,
      maxZoom: 20,
      attribution: 'Mapa del <a href="https://www.ign.gob.ar">Instituto Geográfico Nacional</a> · &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(_map);

    if (typeof BARRIOS_GEOJSON !== 'undefined') {
      L.geoJSON(BARRIOS_GEOJSON, BARRIOS_LAYER_OPTIONS).addTo(_map);
    }

    _marker = L.marker([lat, lng], { draggable: true }).addTo(_map);

    const updateCoords = (latlng) => {
      coordsEl.textContent = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
      _updateGeoBarrio(latlng.lat, latlng.lng);
    };

    _marker.on('drag', (e) => updateCoords(e.latlng));
    _marker.on('dragend', (e) => {
      const ll = e.target.getLatLng();
      updateCoords(ll);
      scheduleGeocode(ll.lat, ll.lng);
    });

    // Tap/click en el mapa mueve el pin
    _map.on('click', (e) => {
      _marker.setLatLng(e.latlng);
      updateCoords(e.latlng);
      scheduleGeocode(e.latlng.lat, e.latlng.lng);
    });

    updateCoords({ lat, lng });
    footerEl.style.display = 'block';
    setTimeout(() => _map.invalidateSize(), 100);
    // Solo geocodificar si no tenemos ya un domicilio del padrón
    if (!State.padronDomicilio) updateAddress(lat, lng);
  }

  // Si el padrón tiene coordenadas guardadas, usarlas como centro inicial
  if (State.padronLocation) {
    spinnerEl.style.display = 'none';
    statusEl.textContent = State.padronDomicilio
      ? 'Domicilio del padrón — arrastrá el pin para actualizar'
      : 'Arrastrá el pin o tocá el mapa para ajustar';
    initMap(State.padronLocation.lat, State.padronLocation.lng);
    return;
  }

  try {
    const loc = await Geo.getLocation();
    spinnerEl.style.display = 'none';
    statusEl.textContent = 'Arrastrá el pin o tocá el mapa para ajustar';
    initMap(loc.lat, loc.lng);
  } catch (err) {
    spinnerEl.style.display = 'none';
    statusEl.textContent = `${err.message} — ajustá el pin manualmente`;
    initMap(DEFAULT.lat, DEFAULT.lng);
  }
}

function confirmGeo() {
  if (_marker) {
    const pos = _marker.getLatLng();
    State.location = { lat: pos.lat, lng: pos.lng, accuracy: 0 };
    const searchEl = document.getElementById('geoSearchInput');
    const addr = searchEl?.value?.trim() || null;
    State.domicilioReal = addr;
    if (addr) {
      // Sincronizar la dirección confirmada al campo domicilio de la encuesta
      // (sobreescribe el pre-llenado del padrón si el relevador lo editó en el mapa)
      State.answers.domicilio = addr;
      State.padronDomicilio   = addr;
    }
    if (State.surveyType === 'problematica' && addr) {
      State.answers.direccion = addr;
    }
    // Auto-detectar barrio desde la posición del pin
    if (!State.answers.barrio && typeof barrioFromPoint === 'function') {
      const detected = barrioFromPoint(pos.lat, pos.lng);
      if (detected) State.answers.barrio = detected;
    }
  }
  go('survey');
}

async function doGeoSearch() {
  const input = document.getElementById('geoSearchInput');
  const query = input?.value?.trim();
  if (!query) return;
  const statusEl = document.getElementById('geoStatus');
  const spinnerEl = document.getElementById('geoSpinner');
  if (statusEl) statusEl.textContent = 'Buscando…';
  if (spinnerEl) spinnerEl.style.display = 'inline-block';
  const result = await Geo.geocode(query);
  if (spinnerEl) spinnerEl.style.display = 'none';
  if (!result) {
    if (statusEl) statusEl.textContent = 'No se encontró la dirección';
    return;
  }
  if (statusEl) statusEl.textContent = 'Arrastrá el pin o tocá el mapa para ajustar';
  if (input && result.address) input.value = result.address;
  if (_map && _marker) {
    const ll = L.latLng(result.lat, result.lng);
    _marker.setLatLng(ll);
    _map.setView(ll, 17);
    const coordsEl = document.getElementById('geoCoords');
    if (coordsEl) coordsEl.textContent = `${result.lat.toFixed(6)}, ${result.lng.toFixed(6)}`;
    _updateGeoBarrio(result.lat, result.lng);
  }
}

function skipGeo() {
  State.location = null;
  go('survey');
}

function renderTypeSelect() {
  const locText = State.location ? Geo.format(State.location) : 'Sin ubicación';
  return `
    <div class="screen">
      <header class="app-header">
        <button class="btn-icon" onclick="go('home')">←</button>
        <span class="header-title">Tipo de relevamiento</span>
      </header>
      <div class="type-loc">📍 ${locText}</div>
      <div class="type-cards">
        <button class="type-card" onclick="selectType('sociohabitacional')">
          <div class="type-card-icon">🏠</div>
          <div class="type-card-title">Encuesta socio-habitacional</div>
          <div class="type-card-desc">Maipú 2026 — vivienda, servicios básicos, composición del hogar y opinión ciudadana (26 preguntas)</div>
        </button>
        <button class="type-card" onclick="selectType('ciudadano')">
          <div class="type-card-icon">🧑</div>
          <div class="type-card-title">Entrevistar ciudadano</div>
          <div class="type-card-desc">Ciclo de preguntas sobre percepción del barrio y calidad de vida</div>
        </button>
        <button class="type-card" onclick="selectType('problematica')">
          <div class="type-card-icon">⚠️</div>
          <div class="type-card-title">Relevar problemática</div>
          <div class="type-card-desc">Registro de problemas en vía pública: baches, luminarias, arbolado y más</div>
        </button>
      </div>
    </div>`;
}

function selectType(type) {
  _photoBlobs = {};
  const preselected = State._preselectedCitizen;
  const base = { surveyType: type, currentQ: 0, answers: {}, padronLoaded: false, padronFilled: {},
    padronMeta: null, padronDomicilio: null, padronLocation: null, location: null,
    _preselectedCitizen: null };
  if (type === 'sociohabitacional') {
    const answers = {};
    const padronFilled = {};
    if (preselected) {
      (PREGUNTAS.sociohabitacional || []).slice(0, 5).forEach((q) => {
        if (q.padronKey && preselected.dni) { answers[q.id] = preselected.dni; padronFilled[q.id] = true; }
        else if (q.padronField && preselected[q.padronField]) { answers[q.id] = preselected[q.padronField]; padronFilled[q.id] = true; }
      });
    }
    const padLat = preselected ? _parseCoord(preselected.lat) : NaN;
    const padLng = preselected ? _parseCoord(preselected.lng) : NaN;
    const padronLocation = (!isNaN(padLat) && !isNaN(padLng) && padLat !== 0 && padLng !== 0)
      ? { lat: padLat, lng: padLng } : null;
    go('datosPersonales', { ...base,
      answers, padronFilled,
      padronMeta: preselected?._meta || null,
      padronDomicilio: preselected?.domicilio || null,
      padronLocation,
      citizenSearchQuery: preselected?.apellido || '',
      citizenDNIQuery: '',
      citizenSearchResults: preselected ? [preselected] : [],
      citizenSearching: false, citizenSearchError: null });
  } else if (type === 'ciudadano') {
    go('citizenSearch', { ...base,
      citizenSearchQuery: preselected?.apellido || '',
      citizenDNIQuery: '',
      citizenSearchResults: preselected ? [preselected] : [],
      citizenSearching: false, citizenSearchError: null });
  } else {
    go('geo', { ...base, citizenSearchQuery: '', citizenDNIQuery: '',
      citizenSearchResults: [], citizenSearching: false, citizenSearchError: null });
  }
}

// ── Datos Personales screen (sociohabitacional step 1) ───────────────────────

function renderDatosPersonales() {
  const barrioQ = (PREGUNTAS.sociohabitacional || []).find((q) => q.id === 'barrio');
  const barrioOpts = barrioQ?.options || [];
  return `
    <div class="screen">
      <header class="app-header">
        <button class="btn-icon" onclick="go('typeSelect')">←</button>
        <span class="header-title">🏠 Socio-habitacional</span>
        <span class="header-count">1/3</span>
      </header>
      <div class="block-header">Datos personales</div>
      <div class="dp-body">
        <div class="dp-search-section">
          <div class="dp-section-title">Buscar en el padrón</div>
          <div class="search-group">
            <label class="question-label">Apellido y nombre</label>
            <input type="text" class="input" id="dpSearchApellido"
              placeholder="Ingresá las primeras 4 letras…"
              value="${esc(State.citizenSearchQuery || '')}"
              oninput="onDPSearchInput('apellido', this.value)"
              autocomplete="off">
          </div>
          <div class="search-divider">— o por número de documento —</div>
          <div class="search-group">
            <label class="question-label">DNI</label>
            <input type="text" inputmode="numeric" class="input" id="dpSearchDNI"
              placeholder="Número de documento"
              value="${esc(State.citizenDNIQuery || '')}"
              oninput="onDPSearchInput('dni', this.value)"
              autocomplete="off">
          </div>
          <div id="dpSearchResults">${renderDPResults()}</div>
        </div>
        <div class="dp-fields-section">
          <div class="dp-section-title">Datos del encuestado</div>
          <div class="dp-field">
            <label class="dp-field-label">DNI</label>
            <input type="text" inputmode="numeric" class="input" id="dpFieldDni"
              placeholder="Número de documento"
              value="${esc(State.answers.dni || '')}"
              oninput="saveAnswer('dni', this.value)">
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Apellido y nombre</label>
            <input type="text" class="input" id="dpFieldApellido"
              placeholder="Apellido y nombre completo"
              value="${esc(State.answers.apellido || '')}"
              oninput="saveAnswer('apellido', this.value)">
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Apodo <span class="dp-optional">(opcional)</span></label>
            <input type="text" class="input" id="dpFieldApodo"
              placeholder="Opcional"
              value="${esc(State.answers.apodo || '')}"
              oninput="saveAnswer('apodo', this.value)">
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Domicilio <span class="dp-optional">(electoral)</span></label>
            <input type="text" class="input" id="dpFieldDomicilio"
              placeholder="Calle y número"
              value="${esc(State.answers.domicilio || '')}"
              oninput="saveAnswer('domicilio', this.value)">
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Barrio</label>
            <div class="chip-group">
              ${barrioOpts.map((o) => `
                <button class="chip ${State.answers.barrio === o.value ? 'active' : ''}"
                  onclick="saveAnswer('barrio', '${esc(o.value)}'); render()">
                  ${esc(o.label)}
                </button>`).join('')}
            </div>
          </div>
        </div>
      </div>
      <div class="survey-footer">
        <button class="btn btn-ghost" onclick="skipDatosPersonales()">Omitir</button>
        <button class="btn btn-primary" onclick="confirmDatosPersonales()">Continuar →</button>
      </div>
    </div>`;
}

function renderDPResults() {
  if (State.citizenSearching) {
    return `<div class="search-status"><div class="geo-spinner"></div> Buscando en el padrón…</div>`;
  }
  if (State.citizenSearchError) {
    return `<div class="search-status search-error">⚠ ${esc(State.citizenSearchError)}</div>`;
  }
  const results = State.citizenSearchResults || [];
  if (!results.length) {
    const hasQuery = (State.citizenSearchQuery?.length >= 4) || (State.citizenDNIQuery?.length >= 6);
    return hasQuery ? `<div class="search-status">Sin resultados en el padrón</div>` : '';
  }
  return `<div class="citizen-results">
    ${results.map((r, i) => `
      <div class="citizen-result" onclick="selectDPCitizen(${i})">
        <div class="citizen-result-name">${esc(r.apellido) || '—'}</div>
        <div class="citizen-result-info">DNI: ${esc(r.dni) || '—'} · ${esc(r.domicilio) || 'Sin domicilio registrado'}</div>
      </div>`).join('')}
  </div>`;
}

function onDPSearchInput(field, value) {
  if (field === 'apellido') {
    State.citizenSearchQuery = value;
    State.citizenDNIQuery = '';
    const other = document.getElementById('dpSearchDNI');
    if (other) other.value = '';
  } else {
    State.citizenDNIQuery = value;
    State.citizenSearchQuery = '';
    const other = document.getElementById('dpSearchApellido');
    if (other) other.value = '';
  }
  clearTimeout(_searchDebounce);
  const minLen = field === 'apellido' ? 4 : 6;
  if (value.length >= minLen) {
    State.citizenSearching = true;
    State.citizenSearchResults = [];
    State.citizenSearchError = null;
    updateCitizenSearchUI();
    _searchDebounce = setTimeout(() => doCitizenSearch(field, value), 450);
  } else {
    State.citizenSearchResults = [];
    State.citizenSearching = false;
    State.citizenSearchError = null;
    updateCitizenSearchUI();
  }
}

function selectDPCitizen(idx) {
  const record = (State.citizenSearchResults || [])[idx];
  if (!record) return;
  (PREGUNTAS.sociohabitacional || []).slice(0, 5).forEach((q) => {
    if (q.padronKey && record.dni) {
      State.answers[q.id] = record.dni;
      State.padronFilled[q.id] = true;
    } else if (q.padronField && record[q.padronField]) {
      State.answers[q.id] = record[q.padronField];
      State.padronFilled[q.id] = true;
    }
  });
  State.padronMeta = record._meta || null;
  State.padronDomicilio = record.domicilio || null;
  const padLat = _parseCoord(record.lat);
  const padLng = _parseCoord(record.lng);
  State.padronLocation = (!isNaN(padLat) && !isNaN(padLng) && padLat !== 0 && padLng !== 0)
    ? { lat: padLat, lng: padLng } : null;
  State.padronLoaded = true;
  State.citizenSearchResults = [];
  State.citizenSearchQuery = '';
  State.citizenDNIQuery = '';
  render();
}

function confirmDatosPersonales() {
  go('geo', { currentQ: 5 });
}

function skipDatosPersonales() {
  ['dni', 'apellido', 'apodo', 'domicilio', 'barrio'].forEach((k) => {
    delete State.answers[k];
    delete State.padronFilled[k];
  });
  State.padronMeta = null;
  State.padronDomicilio = null;
  State.padronLocation = null;
  go('geo', { currentQ: 5 });
}

// ── Citizen Search screen ────────────────────────────────────────────────────

function renderCitizenSearch() {
  return `
    <div class="screen">
      <header class="app-header">
        <button class="btn-icon" onclick="go('typeSelect')">←</button>
        <span class="header-title">🧑 Buscar en el padrón</span>
      </header>
      <div class="survey-body">
        <div class="search-group">
          <label class="question-label">Apellido y nombre</label>
          <input type="text" class="input" id="searchApellido"
            placeholder="Ingresá las primeras 4 letras…"
            value="${State.citizenSearchQuery || ''}"
            oninput="onCitizenSearchInput('apellido', this.value)"
            autocomplete="off">
        </div>
        <div class="search-divider">— o por número de documento —</div>
        <div class="search-group">
          <label class="question-label">DNI</label>
          <input type="text" inputmode="numeric" class="input" id="searchDNI"
            placeholder="Número de documento"
            value="${State.citizenDNIQuery || ''}"
            oninput="onCitizenSearchInput('dni', this.value)"
            autocomplete="off">
        </div>
        <div id="searchResults">${renderCitizenResults()}</div>
      </div>
      <div class="survey-footer">
        <button class="btn btn-ghost" onclick="selectCitizen(null)">Continuar sin buscar</button>
      </div>
    </div>`;
}

function renderCitizenResults() {
  if (State.citizenSearching) {
    return `<div class="search-status"><div class="geo-spinner"></div> Buscando en el padrón…</div>`;
  }
  if (State.citizenSearchError) {
    return `<div class="search-status search-error">⚠ ${State.citizenSearchError}</div>`;
  }
  const results = State.citizenSearchResults || [];
  if (!results.length) {
    const hasQuery = (State.citizenSearchQuery?.length >= 4) || (State.citizenDNIQuery?.length >= 6);
    return hasQuery ? `<div class="search-status">Sin resultados en el padrón</div>` : '';
  }
  return `<div class="citizen-results">
    ${results.map((r, i) => `
      <div class="citizen-result" onclick="selectCitizen(${i})">
        <div class="citizen-result-name">${esc(r.apellido) || '—'}</div>
        <div class="citizen-result-info">DNI: ${esc(r.dni) || '—'} · ${esc(r.domicilio) || 'Sin domicilio registrado'}</div>
      </div>`).join('')}
  </div>`;
}

function onCitizenSearchInput(field, value) {
  if (field === 'apellido') {
    State.citizenSearchQuery = value;
    State.citizenDNIQuery = '';
    const other = document.getElementById('searchDNI');
    if (other) other.value = '';
  } else {
    State.citizenDNIQuery = value;
    State.citizenSearchQuery = '';
    const other = document.getElementById('searchApellido');
    if (other) other.value = '';
  }

  clearTimeout(_searchDebounce);
  const minLen = field === 'apellido' ? 4 : 6;

  if (value.length >= minLen) {
    State.citizenSearching = true;
    State.citizenSearchResults = [];
    State.citizenSearchError = null;
    updateCitizenSearchUI();
    _searchDebounce = setTimeout(() => doCitizenSearch(field, value), 450);
  } else {
    State.citizenSearchResults = [];
    State.citizenSearching = false;
    State.citizenSearchError = null;
    updateCitizenSearchUI();
  }
}

function updateCitizenSearchUI() {
  const el = document.getElementById('searchResults');
  if (el) el.innerHTML = renderCitizenResults();
  const dpEl = document.getElementById('dpSearchResults');
  if (dpEl) dpEl.innerHTML = renderDPResults();
}

async function doCitizenSearch(field, value) {
  try {
    let results;
    if (field === 'dni') {
      const record = await Padron.searchByDNIAsync(value);
      results = record ? [record] : [];
    } else {
      results = await Padron.searchByApellidoAsync(value);
    }
    State.citizenSearchResults = results || [];
    State.citizenSearchError = null;
    State.citizenSearching = false;
  } catch (err) {
    console.error('[search] error:', err);
    State.citizenSearchError = err.message;
    State.citizenSearchResults = [];
    State.citizenSearching = false;
  }
  updateCitizenSearchUI();
}

function selectCitizen(idx) {
  const record = (idx !== null && State.citizenSearchResults?.[idx]) ? State.citizenSearchResults[idx] : null;
  const questions = PREGUNTAS[State.surveyType] || [];
  const answers = {};
  const padronFilled = {};

  if (record) {
    questions.forEach((q) => {
      if (q.padronKey && record.dni) {
        answers[q.id] = record.dni;
        padronFilled[q.id] = true;
      } else if (q.padronField && record[q.padronField]) {
        answers[q.id] = record[q.padronField];
        padronFilled[q.id] = true;
      }
    });
  }

  const padLat = record ? _parseCoord(record.lat) : NaN;
  const padLng = record ? _parseCoord(record.lng) : NaN;
  const padronLocation = (!isNaN(padLat) && !isNaN(padLng) && padLat !== 0 && padLng !== 0)
    ? { lat: padLat, lng: padLng } : null;

  go('geo', {
    surveyType: State.surveyType,
    currentQ: 0,
    answers,
    location: null,
    padronLoaded: !!record,
    padronFilled,
    padronMeta:      record?._meta || null,
    padronDomicilio: record?.domicilio || null,
    padronLocation,
    citizenSearchResults: [],
    citizenSearchQuery: '',
    citizenDNIQuery: '',
    citizenSearching: false,
  });
}

function renderSurvey() {
  const questions = PREGUNTAS[State.surveyType] || [];

  // Asegurar que la pregunta actual sea visible; si no, avanzar al siguiente visible
  if (questions[State.currentQ] && !isVisible(questions[State.currentQ])) {
    State.currentQ = nextVisibleIdx(State.currentQ - 1, questions);
  }

  const q = questions[State.currentQ];
  if (!q) { go('summary'); return ''; }

  const visible     = visibleQuestions(questions);
  const visPos      = visiblePosition(questions, State.currentQ);
  const visTotal    = visible.length;
  const progress    = ((visPos - 1) / visTotal) * 100;
  const isLast      = nextVisibleIdx(State.currentQ, questions) >= questions.length;
  const val         = State.answers[q.id];

  // Encabezado de bloque (cuando cambia respecto al anterior visible)
  const prevVisIdx  = prevVisibleIdx(State.currentQ, questions);
  const prevQ       = questions[prevVisIdx];
  const blockHeader = q.block && q.block !== prevQ?.block
    ? `<div class="block-header">${q.block}</div>`
    : '';

  return `
    <div class="screen">
      <header class="app-header">
        <button class="btn-icon" onclick="surveyBack()">←</button>
        <span class="header-title">${typeIcon(State.surveyType)} ${typeLabel(State.surveyType)}</span>
        <span class="header-count">${visPos}/${visTotal}</span>
      </header>
      <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
      ${blockHeader}
      <div class="survey-body">
        <label class="question-label">
          ${q.label}
          ${q.required ? '<span class="required">*</span>' : ''}
          ${(q.padronField || q.padronKey) && State.padronFilled[q.id] ? '<span class="padron-badge">padrón</span>' : ''}
        </label>
        ${q.hint ? `<p class="question-hint">${q.hint}</p>` : ''}
        <div class="question-input">
          ${renderInput(q, val)}
        </div>
      </div>
      <div class="survey-footer">
        ${!q.required ? `<button class="btn btn-ghost" onclick="surveyNext(true)">Omitir</button>` : ''}
        <button class="btn btn-primary" onclick="surveyNext(false)" id="btnNext">
          ${isLast ? 'Revisar' : 'Siguiente →'}
        </button>
      </div>
    </div>`;
}

function renderInput(q, val) {
  switch (q.type) {
    case 'text':
      return `<input type="text" class="input" id="q_${q.id}"
        value="${val || ''}" placeholder="${q.placeholder || ''}"
        oninput="saveAnswer('${q.id}', this.value)">`;

    case 'number':
      return `<input type="number" inputmode="numeric" class="input" id="q_${q.id}"
        value="${val || ''}" placeholder="0" min="0"
        oninput="saveAnswer('${q.id}', this.value)">`;

    case 'select':
      return `<select class="input" id="q_${q.id}" onchange="saveAnswer('${q.id}', this.value)">
        <option value="">Seleccionar…</option>
        ${q.options.map((o) => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('')}
      </select>`;

    case 'textarea':
      return `<textarea class="input textarea" id="q_${q.id}" rows="4"
        placeholder="${q.placeholder || ''}"
        oninput="saveAnswer('${q.id}', this.value)">${val || ''}</textarea>`;

    case 'scale': {
      const labels = q.labels || [];
      return `<div class="scale-row">
        ${[1,2,3,4,5].map((n) => `
          <button class="scale-btn ${val == n ? 'active' : ''}"
            onclick="saveAnswer('${q.id}', ${n}); render()">
            <span class="scale-num">${n}</span>
            <span class="scale-lbl">${labels[n-1] || ''}</span>
          </button>`).join('')}
      </div>`;
    }

    case 'checkbox': {
      const selected = Array.isArray(val) ? val : [];
      return `<div class="chip-group">
        ${q.options.map((o) => `
          <button class="chip ${selected.includes(o) ? 'active' : ''}"
            onclick="toggleChip('${q.id}', '${o}')">
            ${o}
          </button>`).join('')}
      </div>`;
    }

    case 'radio':
      return `<div class="radio-group">
        ${q.options.map((o) => `
          <label class="radio-option ${val === o.value ? 'active' : ''}">
            <input type="radio" name="q_${q.id}" value="${o.value}"
              ${val === o.value ? 'checked' : ''}
              onchange="saveAnswer('${q.id}', this.value); render()">
            <span>${o.label}</span>
          </label>`).join('')}
      </div>`;

    case 'photo': {
      const url = _photoBlobs[q.id] || State.answers[q.id];
      return `
        <div class="photo-wrap">
          ${url
            ? `<img src="${url}" class="photo-preview" alt="Foto" id="photoImg_${q.id}">`
            : `<div class="photo-empty" id="photoEmpty_${q.id}">Sin foto adjunta</div>`}
          <div class="photo-status" id="photoStatus_${q.id}"></div>
          <label class="btn btn-outline photo-btn">
            📷 ${url ? 'Cambiar foto' : 'Tomar / seleccionar foto'}
            <input type="file" accept="image/*" capture="environment" style="display:none"
              onchange="onPhotoSelected(this,'${q.id}')">
          </label>
        </div>`;
    }

    default:
      return '';
  }
}

function saveAnswer(id, value) {
  State.answers[id] = value;
}

function toggleChip(id, option) {
  const current = Array.isArray(State.answers[id]) ? State.answers[id] : [];
  const idx = current.indexOf(option);
  if (idx >= 0) current.splice(idx, 1);
  else current.push(option);
  State.answers[id] = [...current];
  render();
}

async function onPhotoSelected(input, questionId) {
  const file = input.files[0];
  if (!file) return;

  const imgEl    = document.getElementById(`photoImg_${questionId}`);
  const emptyEl  = document.getElementById(`photoEmpty_${questionId}`);
  const statusEl = document.getElementById(`photoStatus_${questionId}`);

  // Mostrar preview local inmediatamente
  const localUrl = URL.createObjectURL(file);
  if (imgEl) {
    imgEl.src = localUrl;
  } else if (emptyEl) {
    const img = document.createElement('img');
    img.src = localUrl; img.className = 'photo-preview';
    img.id = `photoImg_${questionId}`; img.alt = 'Foto';
    emptyEl.replaceWith(img);
  }
  if (statusEl) statusEl.innerHTML = '<div class="geo-spinner geo-spinner-sm"></div> Comprimiendo…';

  try {
    const blob = await GCS.compress(file);

    const token = localStorage.getItem('severo_access_token');
    if (!token) {
      const reader = new FileReader();
      reader.onload = (e) => { State.answers[questionId] = e.target.result; };
      reader.readAsDataURL(blob);
      if (statusEl) statusEl.innerHTML = '<span class="photo-warn">⚠ Sin sesión Google — foto guardada localmente</span>';
      return;
    }

    if (statusEl) statusEl.innerHTML = '<div class="geo-spinner geo-spinner-sm"></div> Subiendo…';
    const filename = GCS.filename('problematicas');
    let gcsUrl;
    try {
      gcsUrl = await GCS.upload(blob, filename);
    } catch (err) {
      if (err.message === '401') { await ensureFreshToken(); gcsUrl = await GCS.upload(blob, filename); }
      else throw err;
    }
    State.answers[questionId] = gcsUrl;
    _photoBlobs[questionId] = localUrl; // mantener blob para preview durante la sesión
    if (statusEl) statusEl.innerHTML = '<span class="photo-ok">✓ Foto subida</span>';
  } catch (err) {
    console.error('[GCS] upload error:', err.message, err);
    // Mantener el blob URL en la preview y en State hasta que se suba correctamente
    if (statusEl) statusEl.innerHTML = `<span class="photo-warn">⚠ ${err.message || 'Error al subir'} — reintentá al finalizar</span>`;
  }
}

function surveyBack() {
  const questions = PREGUNTAS[State.surveyType] || [];
  const personalQCount = State.surveyType === 'sociohabitacional' ? 5 : 0;
  const prev = prevVisibleIdx(State.currentQ, questions);
  if (prev < personalQCount) {
    go(State.surveyType === 'sociohabitacional' ? 'datosPersonales' : 'geo');
  } else {
    State.currentQ = prev;
    render();
  }
}

async function surveyNext(skip) {
  const questions = PREGUNTAS[State.surveyType] || [];
  const q = questions[State.currentQ];

  if (!skip && q.required) {
    const val = State.answers[q.id];
    const empty = val === undefined || val === null || val === '' ||
      (Array.isArray(val) && val.length === 0);
    if (empty) {
      showToast('Este campo es obligatorio');
      return;
    }
  }

  // Búsqueda en el padrón al salir del campo DNI
  if (!skip && q.padronKey && State.answers[q.id] && !State.padronLoaded) {
    await doPadronLookup(q, questions);
  }

  const next = nextVisibleIdx(State.currentQ, questions);
  if (next >= questions.length) {
    go('summary');
  } else {
    State.currentQ = next;
    render();
  }
}

async function doPadronLookup(dniQuestion, questions) {
  const dni = String(State.answers[dniQuestion.id]).trim();
  if (!dni) return;

  State.padronLoaded = true;

  let record;
  try {
    record = await Padron.searchByDNIAsync(dni);
  } catch {
    return;
  }

  if (!record) return; // ciudadano no encontrado en el padrón

  // Guardar meta para el update de lat/lng al guardar
  State.padronMeta = record._meta || null;

  // Pre-llenar campos mapeados que todavía no tienen respuesta
  let filled = 0;
  questions.forEach((q) => {
    if (q.padronField && record[q.padronField] !== undefined && !State.answers[q.id]) {
      State.answers[q.id] = record[q.padronField];
      State.padronFilled[q.id] = true;
      filled++;
    }
  });

  if (filled > 0) showToast('Datos del ciudadano cargados del padrón');
}

function renderSummary() {
  const questions = PREGUNTAS[State.surveyType] || [];
  const fotoUrl = State.answers['foto_url'];
  const rows = questions.filter((q) => q.type !== 'photo').map((q) => {
    const val = State.answers[q.id];
    let display = '—';
    if (val !== undefined && val !== null && val !== '') {
      display = Array.isArray(val) ? esc(val.join(', ')) : esc(String(val));
    }
    return `<tr>
      <td class="summary-label">${esc(q.label)}</td>
      <td class="summary-value">${display}</td>
    </tr>`;
  }).join('');

  return `
    <div class="screen">
      <header class="app-header">
        <button class="btn-icon" onclick="go('survey')">←</button>
        <span class="header-title">Resumen</span>
      </header>
      <div class="summary-body">
        ${fotoUrl ? `<img src="${fotoUrl}" class="summary-photo" alt="Foto de la problemática">` : ''}
        <div class="summary-meta">
          <span>${typeIcon(State.surveyType)} ${typeLabel(State.surveyType)}</span>
          ${State.location ? `<a href="${Geo.mapsUrl(State.location)}" target="_blank" class="loc-link">📍 Ver en mapa</a>` : '<span>📍 Sin ubicación</span>'}
        </div>
        <table class="summary-table">${rows}</table>
      </div>
      <div class="survey-footer">
        <button class="btn btn-ghost" onclick="go('survey')">Editar</button>
        <button class="btn btn-primary" onclick="go('saving')">Guardar</button>
      </div>
    </div>`;
}

function renderSaving() {
  return `
    <div class="screen screen-center">
      <div class="spinner"></div>
      <p>Guardando…</p>
    </div>`;
}

async function doSave() {
  try {
    const record = {
      id: Date.now(),
      savedAt: new Date().toISOString(),
      type: State.surveyType,
      operador: State.user,
      location: State.location,
      answers: { ...State.answers },
    };
    try {
      await SheetsDB.save(State.surveyType, record);
    } catch (err) {
      if (!err.message.includes('401')) throw err;
      await ensureFreshToken();
      await SheetsDB.save(State.surveyType, record);
    }

    // Actualizar el padrón si hay DNI, ubicación y meta conocida (lat/lng + DOMICILIO REAL)
    const questions = PREGUNTAS[State.surveyType] || [];
    const dniQ = questions.find((q) => q.padronKey);
    if (dniQ && State.answers[dniQ.id] && State.location && State.padronMeta) {
      try {
        await Padron.updateLatLng(
          State.padronMeta,
          State.location.lat,
          State.location.lng,
          State.domicilioReal || null
        );
      } catch { /* no bloquea el guardado */ }
    }

    go('done');
  } catch (err) {
    go('summary');
    State.toast = 'Error al guardar: ' + err.message;
    render();
  }
}

function renderDone() {
  return `
    <div class="screen screen-center">
      <div class="done-icon">✅</div>
      <h2>Relevamiento guardado</h2>
      <p class="done-sub">${typeIcon(State.surveyType)} ${typeLabel(State.surveyType)}</p>
      <div class="done-actions">
        <button class="btn btn-primary btn-block" onclick="startNewSurvey()">+ Nuevo relevamiento</button>
        <button class="btn btn-outline btn-block" onclick="go('list')">Ver historial</button>
      </div>
    </div>`;
}

function renderSurveyCard(r, idx) {
  const isProb = r.type === 'problematica';
  let title, subtitle;
  if (isProb) {
    title = r.answers?.categoria || '—';
    subtitle = r.answers?.descripcion
      ? String(r.answers.descripcion).slice(0, 80)
      : (r.answers?.direccion || '');
  } else {
    title = r.answers?.apellido || (r.answers?.dni ? `DNI ${r.answers.dni}` : '—');
    subtitle = r.answers?.domicilio || '';
  }
  const barrio = r.answers?.barrio
    ? `<span class="card-barrio">${esc(r.answers.barrio)}</span>` : '';
  const estadoBadge = isProb ? renderEstadoBadge(r.estado) : '';
  const fallecidoBadge = r.type === 'ciudadano' && r.fallecido
    ? `<span class="fallecido-badge">† Fallecido${r.fallecido !== 'FALLECIDO' ? ' ' + r.fallecido : ''}</span>` : '';
  return `
    <div class="survey-card survey-card--${r.type}" onclick="openDetail(${idx})">
      <div class="card-accent"></div>
      <div class="card-body">
        <div class="card-top-row">
          <span class="card-type-label">${typeIcon(r.type)} ${typeLabel(r.type)}</span>
          ${barrio}
          ${estadoBadge}
          ${fallecidoBadge}
        </div>
        <div class="card-title">${esc(title)}</div>
        ${subtitle ? `<div class="card-subtitle">${esc(subtitle)}</div>` : ''}
        <div class="card-bottom-row">
          <span class="card-date">${formatDate(r.savedAt)}</span>
          ${r.location ? `<span class="card-loc">📍 ${r.location.lat.toFixed(4)}, ${r.location.lng.toFixed(4)}</span>` : ''}
        </div>
      </div>
      <div class="card-arrow">›</div>
    </div>`;
}

function _listFilterTabs(all) {
  const counts = { todos: all.length, ciudadano: 0, problematica: 0, sociohabitacional: 0 };
  all.forEach((r) => { if (counts[r.type] !== undefined) counts[r.type]++; });
  return [
    { key: 'todos',            label: 'Todos' },
    { key: 'ciudadano',        label: 'Ciudadanos' },
    { key: 'problematica',     label: 'Problemáticas' },
    { key: 'sociohabitacional',label: 'Socio-hab.' },
  ].map((t) => `
    <button class="filter-tab${_listFilter === t.key ? ' active' : ''}" onclick="setListFilter('${t.key}')">
      ${t.label}${counts[t.key] ? ` <span class="filter-tab-count">${counts[t.key]}</span>` : ''}
    </button>`).join('');
}

function setListFilter(f) {
  _listFilter = f;
  render();
}

function renderList() {
  const myEmail = State.user?.email;
  const all = (State.surveys || [])
    .filter((r) => r.operador?.email && r.operador.email === myEmail)
    .slice()
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

  const paired = all
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => _listFilter === 'todos' || r.type === _listFilter);

  const emptyMsg = !State.surveys
    ? `<div class="list-empty"><div class="list-spinner"></div><p>Cargando historial…</p></div>`
    : paired.length === 0 && all.length > 0
      ? `<div class="list-empty"><p>No hay relevamientos de este tipo.</p></div>`
      : `<div class="list-empty"><p>Todavía no hay relevamientos propios.</p></div>`;

  const cardsHtml = paired.length > 0
    ? paired.map(({ r, idx }) => renderSurveyCard(r, idx)).join('')
    : emptyMsg;

  return `
    <div class="screen">
      <header class="app-header">
        <button class="btn-icon" onclick="go('home')">←</button>
        <span class="header-title">Mis relevamientos</span>
        <span class="header-count" id="listCount">${all.length}</span>
      </header>
      <div class="list-filter-bar">${_listFilterTabs(all)}</div>
      <div class="list-body" id="listBody">${cardsHtml}</div>
    </div>`;
}

async function loadList() {
  const fetchAll = () => Promise.all([
    SheetsDB.getAllAsync('ciudadano'),
    SheetsDB.getAllAsync('problematica'),
    SheetsDB.getAllAsync('sociohabitacional'),
  ]);

  try {
    let result;
    try {
      result = await fetchAll();
    } catch (err) {
      if (!err.message.includes('401')) throw err;
      await ensureFreshToken();
      result = await fetchAll();
    }
    const [ciudadanos, problemas, sociohabit] = result;
    const myEmail = State.user?.email;
    const all = [
      ...ciudadanos.map((r) => ({ ...r, type: 'ciudadano' })),
      ...problemas.map((r) => ({ ...r, type: 'problematica' })),
      ...sociohabit.map((r) => ({ ...r, type: 'sociohabitacional' })),
    ].filter((r) => r.operador?.email && r.operador.email === myEmail);
    all.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    State.surveys = all;

    const bodyEl = document.getElementById('listBody');
    const countEl = document.getElementById('listCount');
    const filterEl = document.querySelector('.list-filter-bar');
    if (!bodyEl) return;

    const visible = _listFilter === 'todos' ? all : all.filter((r) => r.type === _listFilter);
    const paired = all.map((r, idx) => ({ r, idx }))
      .filter(({ r }) => _listFilter === 'todos' || r.type === _listFilter);

    bodyEl.innerHTML = paired.length > 0
      ? paired.map(({ r, idx }) => renderSurveyCard(r, idx)).join('')
      : `<div class="list-empty"><p>${all.length === 0 ? 'Todavía no hay relevamientos propios.' : 'No hay relevamientos de este tipo.'}</p></div>`;

    if (countEl) countEl.textContent = all.length;
    if (filterEl) filterEl.innerHTML = _listFilterTabs(all);
  } catch (err) {
    const bodyEl = document.getElementById('listBody');
    if (bodyEl) bodyEl.innerHTML = `<div class="list-empty"><p>Error al cargar: ${esc(err.message)}</p></div>`;
  }
}

function openDetail(idx) {
  const record = (State.surveys || [])[idx];
  if (record) go('detail', { detailRecord: record });
}

function renderEstadoBadge(estado) {
  if (estado === 'resuelto') return `<span class="estado-badge estado-resuelto">✓ Resuelto</span>`;
  if (estado === 'persiste') return `<span class="estado-badge estado-persiste">↩ Persiste</span>`;
  return `<span class="estado-badge estado-pendiente">◦ Pendiente</span>`;
}

async function loadDetailPhoto(url) {
  if (!url) return;
  const imgEl = document.getElementById('detailPhoto');
  if (!imgEl) return;
  const token = localStorage.getItem('severo_access_token');
  try {
    const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    if (!res.ok) throw new Error(`${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    imgEl.onload = () => URL.revokeObjectURL(blobUrl);
    imgEl.src = blobUrl;
    imgEl.style.display = '';
  } catch (_) {
    imgEl.remove();
    const fallback = document.getElementById('detailPhotoFallback');
    if (fallback) fallback.style.display = '';
  }
}

function renderDetail() {
  const r = State.detailRecord;
  if (!r) { go('list'); return ''; }
  const questions = PREGUNTAS[r.type] || [];
  const fotoUrl = r.answers?.foto_url;

  const rows = questions.filter((q) => q.type !== 'photo').map((q) => {
    const val = r.answers?.[q.id];
    let display = '—';
    if (val !== undefined && val !== null && val !== '') {
      display = Array.isArray(val) ? esc(val.join(', ')) : esc(String(val));
    }
    return `<tr>
      <td class="summary-label">${esc(q.label)}</td>
      <td class="summary-value">${display}</td>
    </tr>`;
  }).join('');

  return `
    <div class="screen">
      <header class="app-header">
        <button class="btn-icon" onclick="go('list')">←</button>
        <span class="header-title">${typeIcon(r.type)} ${typeLabel(r.type)}</span>
      </header>
      <div class="summary-body">
        ${fotoUrl ? `
          <img id="detailPhoto" src="" class="detail-photo" alt="Foto" style="display:none"
            onclick="this.classList.toggle('detail-photo-expand')">
          <div id="detailPhotoFallback" class="detail-photo-fallback" style="display:none">
            <a href="${esc(fotoUrl)}" target="_blank" rel="noopener">Ver foto adjunta ↗</a>
          </div>` : ''}
        <div class="summary-meta">
          <span>${formatDate(r.savedAt)}</span>
          <span>${r.operador?.name || ''}</span>
          ${r.type === 'problematica' ? renderEstadoBadge(r.estado) : ''}
          ${r.location ? `<a href="${Geo.mapsUrl(r.location)}" target="_blank" class="loc-link">📍 Ver en mapa</a>` : '<span>Sin ubicación</span>'}
        </div>
        <table class="summary-table">${rows}</table>
        ${r.type === 'problematica' ? `
        <div class="estado-section">
          <div class="estado-section-title">Actualizar estado</div>
          <div class="estado-actions">
            <button class="btn btn-estado ${r.estado === 'persiste' ? 'btn-estado-active' : ''}"
              onclick="updateEstado('${r.id}', 'persiste')">↩ Persiste</button>
            <button class="btn btn-estado btn-estado-ok ${r.estado === 'resuelto' ? 'btn-estado-active' : ''}"
              onclick="updateEstado('${r.id}', 'resuelto')">✓ Resuelto</button>
          </div>
        </div>` : ''}
        ${r.type === 'ciudadano' ? `
        <div class="estado-section">
          <div class="estado-section-title">Estado vital</div>
          ${r.fallecido ? `
            <div class="fallecido-active-row">
              <span class="fallecido-badge fallecido-badge-lg">† Fallecido${r.fallecido !== 'FALLECIDO' ? ' ' + r.fallecido : ''}</span>
              <select class="input fallecido-anio-select" onchange="setFallecido('${r.id}', this.value)">
                <option value="FALLECIDO" ${r.fallecido === 'FALLECIDO' ? 'selected' : ''}>Sin año especificado</option>
                ${Array.from({length: 2026 - 1999}, (_, i) => 2026 - i).map(y =>
                  `<option value="${y}" ${r.fallecido == y ? 'selected' : ''}>${y}</option>`).join('')}
              </select>
              <button class="btn btn-ghost btn-fallecido-quitar" onclick="setFallecido('${r.id}', '')">Quitar</button>
            </div>` : `
            <button class="btn btn-fallecido" onclick="setFallecido('${r.id}', 'FALLECIDO')">† Registrar como fallecido</button>`}
        </div>` : ''}
      </div>
    </div>`;
}

async function updateEstado(recordId, estado) {
  if (!['resuelto', 'persiste'].includes(estado)) return;
  const idx = (State.surveys || []).findIndex((r) => String(r.id) === String(recordId));
  if (idx < 0) return;
  const prev = State.surveys[idx].estado;
  const next = prev === estado ? '' : estado;
  State.surveys[idx] = { ...State.surveys[idx], estado: next };
  State.detailRecord = { ...State.detailRecord, estado: next };
  render();
  try {
    await SheetsDB.update('problematica', recordId, { estado: next });
    showToast(next === 'resuelto' ? '✓ Marcado como resuelto' : next === 'persiste' ? 'Marcado como persiste' : 'Estado reiniciado');
  } catch (err) {
    showToast('Error al guardar estado: ' + err.message);
  }
}

async function setFallecido(recordId, value) {
  const idx = (State.surveys || []).findIndex((r) => String(r.id) === String(recordId));
  if (idx < 0) return;
  State.surveys[idx] = { ...State.surveys[idx], fallecido: value };
  State.detailRecord = { ...State.detailRecord, fallecido: value };
  render();
  try {
    await SheetsDB.update('ciudadano', recordId, { fallecido: value });
    if (value) showToast(value === 'FALLECIDO' ? '† Registrado como fallecido' : `† Fallecido en ${value}`);
    else showToast('Marca de fallecido eliminada');
  } catch (err) {
    showToast('Error al guardar: ' + err.message);
  }
}

// ── Eventos y utilidades ─────────────────────────────────────────────────────

function bindEvents() {
  // Los eventos están inline via onclick para simplicidad del prototipo
}

function showToast(msg) {
  State.toast = null;
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.getElementById('app').appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 3000);
}
