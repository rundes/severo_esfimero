const APP_VERSION = '2.8';

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
        localStorage.setItem('severo_token_expiry', String(Date.now() + 55 * 60 * 1000));
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
        reject(new Error('Timeout al renovar sesión. Volvé a ingresar'));
      }
    }, 15000);
  });
}

// Retorna true si el token está vencido o a menos de 5 min de vencer
function _isTokenNearExpiry() {
  const expiry = parseInt(localStorage.getItem('severo_token_expiry') || '0', 10);
  return !expiry || Date.now() >= expiry - 5 * 60 * 1000;
}

// Refresca el token sólo si es necesario. Silencioso — no lanza en caso de fallo.
async function ensureFreshTokenIfNeeded() {
  if (!SheetsDB._hasToken()) return;
  if (!_isTokenNearExpiry()) return;
  try { await ensureFreshToken(); } catch (_) {}
}

// Envuelve una llamada a la API: si falla con 401 renueva el token y reintenta una vez.
async function withTokenRetry(fn) {
  try { return await fn(); }
  catch (err) {
    if (!String(err.message).includes('401')) throw err;
    await ensureFreshToken();
    return fn();
  }
}

// ── Chequeo de versión contra servidor ───────────────────────────────────────

async function checkForUpdate() {
  try {
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data.version && data.version !== APP_VERSION) _showForceUpdateOverlay();
  } catch (_) {}
}

function _showForceUpdateOverlay() {
  if (document.getElementById('_forceUpdateOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = '_forceUpdateOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(13,71,161,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:36px 28px;max-width:320px;width:100%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,0.4);">
      <div style="font-size:2.4rem;margin-bottom:12px;">🔄</div>
      <h2 style="margin:0 0 8px;font-size:1.15rem;color:#0D47A1;font-weight:700;">Nueva versión disponible</h2>
      <p style="margin:0 0 28px;color:#555;font-size:0.92rem;line-height:1.5;">Hay una actualización disponible. Recargá para continuar.</p>
      <button id="_forceUpdateBtn" style="background:#0D47A1;color:#fff;border:none;padding:14px 0;border-radius:10px;font-size:1rem;font-weight:600;cursor:pointer;width:100%;">Actualizar ahora</button>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  document.getElementById('_forceUpdateBtn').addEventListener('click', async () => {
    document.getElementById('_forceUpdateBtn').textContent = 'Actualizando…';
    try {
      // Desregistrar todos los SW — la próxima carga no pasa por ningún SW
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      // Borrar todos los cachés
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) {}
    // Parámetro único fuerza descarga fresca sin caché HTTP del browser
    window.location.href = window.location.pathname + '?_v=' + Date.now();
  });
}

// Al volver al primer plano, refrescar token y chequear versión
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (Auth.isLoggedIn()) ensureFreshTokenIfNeeded();
    checkForUpdate();
  }
});

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
  citizenSearchMode: 'apellido',  // 'apellido' (apellido/DNI) | 'domicilio'
  citizenSearchQuery: '',
  citizenDNIQuery: '',
  citizenDomicilioQuery: '',
  citizenSearchResults: [],
  citizenSearching: false,
  citizenSearchError: null,
  // home padron search
  homeSearchQuery: '',
  homeSearchMode: 'apellido',
  homeSearchResults: [],
  homeSearching: false,
  homeSearchError: null,
  // padron detail
  padronDetailRecord: null,
  padronCiudadanoRecord: null,   // ciudadano survey record matching padron DNI
  padronCiudadanoLoading: false,
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
  checkForUpdate();
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
  // Destruir el mapa Leaflet si salimos de una pantalla con mapa
  if (_map && State.screen !== 'geo' && State.screen !== 'datosGeo') {
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
    datosDomicilio:  renderDatosDomicilio,
    datosGeo:        renderDatosGeo,
    citizenSearch:   renderCitizenSearch,
    survey:          renderSurvey,
    summary:         renderSummary,
    saving:          renderSaving,
    saveError:       renderSaveError,
    done:            renderDone,
    list:            renderList,
    detail:          renderDetail,
    padronDetail:    renderPadronDetail,
  };
  el.innerHTML = (screens[State.screen] || renderAuth)();
  bindEvents();
  if (State.screen === 'geo' || State.screen === 'datosGeo') startGeoCapture();
  if (State.screen === 'saving') doSave();
  if (State.screen === 'list') loadList();

  if (State.toast) showToast(State.toast);
}

// ── PWA: Install card + Update modal ────────────────────────────────────────

function _pwaIsStandalone() {
  return window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
}

function _pwaIsIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
}

function _pwaShouldShowInstall() {
  if (_pwaIsStandalone()) return false;
  if (localStorage.getItem('pwa_installed')) return false;
  const dismissed = localStorage.getItem('pwa_install_dismissed_at');
  const count = Number(localStorage.getItem('pwa_install_dismiss_count') || 0);
  if (count >= 2) return false;
  if (dismissed) {
    const daysSince = (Date.now() - Number(dismissed)) / 86_400_000;
    if (daysSince < 3) return false;
  }
  return true;
}

function _pwaInstallCard() {
  if (!_pwaShouldShowInstall()) return '';
  if (_pwaIsIOS()) {
    return `
      <div class="pwa-install-card" id="pwaInstallCard">
        <div class="pwa-install-icon">📲</div>
        <div class="pwa-install-text">
          <strong>Instalá Proyecto Severo</strong>
          <span>Tocá <strong>Compartir</strong> (⬆) y luego<br>"Agregar a pantalla de inicio"</span>
        </div>
        <button class="pwa-install-dismiss" onclick="pwaInstallDismiss()" aria-label="Cerrar">×</button>
      </div>`;
  }
  if (window._deferredInstallPrompt) {
    return `
      <div class="pwa-install-card" id="pwaInstallCard">
        <div class="pwa-install-icon">📲</div>
        <div class="pwa-install-text">
          <strong>Instalá Proyecto Severo</strong>
          <span>Accedé más rápido, funciona sin conexión</span>
        </div>
        <button class="btn btn-primary pwa-install-btn" onclick="pwaInstallNow()">Instalar</button>
        <button class="pwa-install-dismiss" onclick="pwaInstallDismiss()" aria-label="Cerrar">×</button>
      </div>`;
  }
  return '';
}

async function pwaInstallNow() {
  const prompt = window._deferredInstallPrompt;
  if (!prompt) return;
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  window._deferredInstallPrompt = null;
  if (outcome === 'accepted') {
    localStorage.setItem('pwa_installed', '1');
  } else {
    pwaInstallDismiss();
  }
  const card = document.getElementById('pwaInstallCard');
  if (card) card.remove();
}

function pwaInstallDismiss() {
  localStorage.setItem('pwa_install_dismissed_at', String(Date.now()));
  const count = Number(localStorage.getItem('pwa_install_dismiss_count') || 0);
  localStorage.setItem('pwa_install_dismiss_count', String(count + 1));
  const card = document.getElementById('pwaInstallCard');
  if (card) card.remove();
}

// Hooks llamados desde index.html cuando llegan los eventos del navegador
window._pwaRenderInstallCard = () => {
  const card = document.getElementById('pwaInstallCard');
  if (!card && _pwaShouldShowInstall() && !_pwaIsIOS()) {
    const home = document.querySelector('.home-actions');
    if (home) home.insertAdjacentHTML('beforebegin', _pwaInstallCard());
  }
};
window._pwaHideInstallCard = () => {
  const card = document.getElementById('pwaInstallCard');
  if (card) card.remove();
};

let _pwaWaitingWorker = null;
window._pwaShowUpdateModal = (worker) => {
  _pwaWaitingWorker = worker;
  if (document.getElementById('pwaUpdateModal')) return;
  const modal = document.createElement('div');
  modal.id = 'pwaUpdateModal';
  modal.className = 'pwa-update-modal';
  // Bloquear scroll del body y cualquier escape del modal
  document.body.style.overflow = 'hidden';
  modal.addEventListener('click', (e) => e.stopPropagation());
  modal.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') e.preventDefault(); }, { capture: true });
  modal.innerHTML = `
    <div class="pwa-update-box">
      <div class="pwa-update-icon">🔄</div>
      <h2 class="pwa-update-title">Nueva versión disponible</h2>
      <p class="pwa-update-body">
        Se publicó una actualización.<br>
        La app se recarga para aplicarla.
      </p>
      <button class="btn btn-primary btn-block pwa-update-btn" id="pwaUpdateBtn">
        Actualizar ahora
      </button>
      <p class="pwa-update-hint">Tus encuestas guardadas no se pierden.</p>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('pwaUpdateBtn').addEventListener('click', () => {
    document.getElementById('pwaUpdateBtn').textContent = 'Actualizando…';
    document.getElementById('pwaUpdateBtn').disabled = true;
    if (_pwaWaitingWorker) {
      _pwaWaitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  });
};

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
        <img src="icons/icon-512.png" class="logo-img" alt="Proyecto Severo">
        <h1 class="logo-title">Proyecto Severo</h1>
        <p class="logo-sub">Sistema de Relevamientos</p>
        <span class="auth-version">v2.8</span>
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
        ${CONFIG.USE_MOCK ? `<p class="hint" style="margin-top:0">Modo prototipo: surveys en localStorage · padrón desde Google Sheets</p>` : ''}
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
    <div class="screen screen-home">
      <header class="app-header">
        <img src="icons/icon-header.svg" class="header-logo" alt="">
        <h1 class="header-title">Proyecto Severo</h1>
        <button class="btn-icon" onclick="logout()" title="Salir" aria-label="Cerrar sesión">⏏</button>
      </header>
      <div class="home-user">
        ${avatar(u)}
        <div>
          <div class="user-name">${u?.name || ''}</div>
          <div class="user-email">${u?.email || ''}</div>
        </div>
      </div>
      ${_pwaInstallCard()}
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
        <div class="search-mode-tabs">
          <button class="search-mode-tab ${State.homeSearchMode !== 'domicilio' ? 'active' : ''}"
            onclick="setHomeSearchMode('apellido')">Apellido / DNI</button>
          <button class="search-mode-tab ${State.homeSearchMode === 'domicilio' ? 'active' : ''}"
            onclick="setHomeSearchMode('domicilio')">Domicilio</button>
        </div>
        <input type="text" class="input" id="homeSearchInput"
          placeholder="${State.homeSearchMode === 'domicilio' ? 'Nombre de calle o número…' : 'Apellido (4+ letras) o DNI (6+ dígitos)…'}"
          value="${esc(State.homeSearchQuery || '')}"
          oninput="onHomeSearchInput(this.value)"
          autocomplete="off">
        <div id="homeSearchResults">${renderHomeSearchResults()}</div>
      </div>
      ${CONFIG.USE_MOCK ? `<p class="hint center">Modo prototipo: datos en localStorage</p>` : ''}
      <footer class="app-footer">
        <img src="icons/icon-header.svg" class="footer-logo" alt="">
        <span>Proyecto Severo — Relevamientos</span>
        <span class="footer-version">v2.8</span>
      </footer>
    </div>`;
}

function logout() {
  Auth.logout();
  go('auth', { user: null });
}

// ── Home padron search ───────────────────────────────────────────────────────

function setHomeSearchMode(mode) {
  State.homeSearchMode = mode;
  State.homeSearchQuery = '';
  State.homeSearchResults = [];
  State.homeSearching = false;
  State.homeSearchError = null;
  clearTimeout(_homeSearchDebounce);
  render();
}

function onHomeSearchInput(value) {
  State.homeSearchQuery = value;
  clearTimeout(_homeSearchDebounce);
  const isDomicilio = State.homeSearchMode === 'domicilio';
  const isNumeric = !isDomicilio && /^\d+$/.test(value.trim());
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
    if (State.homeSearchMode === 'domicilio') {
      results = await withTokenRetry(() => Padron.searchByDomicilioAsync(value));
    } else if (isNumeric) {
      const record = await withTokenRetry(() => Padron.searchByDNIAsync(value));
      results = record ? [record] : [];
    } else {
      results = await withTokenRetry(() => Padron.searchByApellidoAsync(value));
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
      <div class="citizen-result" role="button" tabindex="0" onclick="openPadronDetail(${i})">
        <div class="citizen-result-name">${esc(r.apellido) || '—'}${resultBarrioPill(r)}</div>
        <div class="citizen-result-info">DNI ${esc(r.dni)} · ${esc(r.domicilio) || 'Sin domicilio'}</div>
      </div>`).join('')}
  </div>`;
}

function openPadronDetail(idx) {
  const record = (State.homeSearchResults || [])[idx];
  if (record) {
    go('padronDetail', { padronDetailRecord: record,
      familiaSearchQuery: '', familiaSearchResults: [], familiaSearching: false,
      padronCiudadanoRecord: null, padronCiudadanoLoading: true });
    loadPadronCiudadanoRecord(record.dni);
  }
}

async function loadPadronCiudadanoRecord(dni) {
  if (!dni) { State.padronCiudadanoLoading = false; render(); return; }
  try {
    const fromState = (State.surveys || []).find(
      (r) => r.type === 'ciudadano' && String(r.answers?.dni).trim() === String(dni).trim()
    );
    if (fromState) {
      State.padronCiudadanoRecord = fromState;
      State.padronCiudadanoLoading = false;
      if (State.screen === 'padronDetail') render();
      return;
    }
    const all = await SheetsDB.getAllAsync('ciudadano');
    const found = all.map((r) => ({ ...r, type: 'ciudadano' }))
      .find((r) => String(r.answers?.dni).trim() === String(dni).trim());
    State.padronCiudadanoRecord = found || null;
    State.padronCiudadanoLoading = false;
    if (State.screen === 'padronDetail') render();
  } catch {
    State.padronCiudadanoLoading = false;
    if (State.screen === 'padronDetail') render();
  }
}

async function setFallecidoFromPadron(value) {
  const cr = State.padronCiudadanoRecord;
  if (!cr) return;
  State.padronCiudadanoRecord = { ...cr, fallecido: value };
  const idx = (State.surveys || []).findIndex((r) => String(r.id) === String(cr.id));
  if (idx >= 0) State.surveys[idx] = { ...State.surveys[idx], fallecido: value };
  render();
  try {
    await SheetsDB.update('ciudadano', cr.id, { fallecido: value });
    if (value) showToast(value === 'FALLECIDO' ? '† Registrado como fallecido' : `† Fallecido en ${value}`);
    else showToast('Marca de fallecido eliminada');
  } catch {
    showToast('Error al guardar');
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
              <button class="btn-icon btn-remove" onclick="removeFamiliaMember('${esc(r.dni)}',${i})" title="Quitar" aria-label="Quitar">✕</button>
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
      const record = await withTokenRetry(() => Padron.searchByDNIAsync(value));
      results = record ? [record] : [];
    } else {
      results = await withTokenRetry(() => Padron.searchByApellidoAsync(value));
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

// Pastilla de barrio para resultados de búsqueda: deriva el barrio del padrón
// desde lat/lng (point-in-polygon). Si no hay match geográfico, cae al campo
// localidad del padrón. Devuelve '' si no hay ninguno.
function resultBarrioPill(r) {
  let b = null;
  const lat = _parseCoord(r.lat), lng = _parseCoord(r.lng);
  if (!isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0) && typeof barrioFromPoint === 'function') {
    b = barrioFromPoint(lat, lng);
  }
  if (!b && r.localidad) b = String(r.localidad).trim();
  return b ? ` <span class="card-barrio" style="margin-left:8px">${esc(b)}</span>` : '';
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

  const elecClass = (v) => {
    if (!v) return '';
    const u = v.toUpperCase();
    if (u.includes('VOTÓ') && !u.includes('NO')) return 'elec-voted';
    if (u.includes('NO VOTO') || u.includes('NO VOTÓ')) return 'elec-absent';
    if (u === '0' || u === 'N') return 'elec-absent';
    if (u === '1' || u === 'S' || u === 'SI' || u === 'SÍ') return 'elec-voted';
    return 'elec-neutral';
  };

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
  ].filter((e) => e.val && e.val !== '' && elecClass(e.val) === 'elec-voted');

  return `
    <div class="screen">
      <header class="app-header">
        <button class="btn-icon" onclick="go('home')" aria-label="Volver">←</button>
        <h1 class="header-title">Perfil del ciudadano</h1>
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

        <div class="padron-section">
          <div class="padron-section-title">Estado vital</div>
          ${State.padronCiudadanoLoading
            ? `<div class="padron-row" style="color:var(--text-2);font-size:.85rem"><div class="geo-spinner geo-spinner-sm" style="display:inline-block;margin-right:6px"></div>Buscando encuesta…</div>`
            : State.padronCiudadanoRecord
              ? (State.padronCiudadanoRecord.fallecido
                ? `<div class="fallecido-active-row">
                     <span class="fallecido-badge fallecido-badge-lg">† Fallecido${State.padronCiudadanoRecord.fallecido !== 'FALLECIDO' ? ' ' + State.padronCiudadanoRecord.fallecido : ''}</span>
                     <select class="input fallecido-anio-select" onchange="setFallecidoFromPadron(this.value)">
                       <option value="FALLECIDO" ${State.padronCiudadanoRecord.fallecido === 'FALLECIDO' ? 'selected' : ''}>Sin año especificado</option>
                       ${Array.from({length: 2026 - 1999}, (_, i) => 2026 - i).map((y) =>
                         `<option value="${y}" ${State.padronCiudadanoRecord.fallecido == y ? 'selected' : ''}>${y}</option>`).join('')}
                     </select>
                     <button class="btn btn-ghost btn-fallecido-quitar" onclick="setFallecidoFromPadron('')">Quitar</button>
                   </div>`
                : `<button class="btn btn-fallecido" onclick="setFallecidoFromPadron('FALLECIDO')">† Registrar como fallecido</button>`)
              : `<p style="font-size:.85rem;color:var(--text-2)">Sin encuesta ciudadana registrada para este DNI.</p>`}
        </div>

        <div class="padron-actions">
          ${State.padronCiudadanoRecord?.fallecido
            ? `<div class="fallecido-block-msg">† Este ciudadano figura como fallecido: no es posible iniciar un relevamiento.</div>`
            : `<button class="btn btn-primary btn-block" onclick="startSurveyFromPadron()">+ Nuevo relevamiento</button>`}
        </div>

      </div>
    </div>`;
}

function startSurveyFromPadron() {
  if (State.padronCiudadanoRecord?.fallecido) {
    showToast('† Ciudadano registrado como fallecido');
    return;
  }
  _photoBlobs = {};
  go('typeSelect', { answers: {}, currentQ: 0, location: null, domicilioReal: null,
    surveyType: null, padronLoaded: false, padronFilled: {}, padronMeta: null,
    padronDomicilio: null, padronLocation: null,
    citizenSearchQuery: '', citizenDNIQuery: '', citizenDomicilioQuery: '', citizenSearchResults: [],
    citizenSearching: false, citizenSearchError: null,
    _preselectedCitizen: State.padronDetailRecord || null });
}

function startNewSurvey() {
  go('typeSelect', { answers: {}, currentQ: 0, location: null, domicilioReal: null,
    surveyType: null, padronLoaded: false, padronFilled: {}, padronMeta: null,
    padronDomicilio: null, padronLocation: null,
    citizenSearchQuery: '', citizenDNIQuery: '', citizenDomicilioQuery: '', citizenSearchResults: [],
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
  const backTarget = State.surveyType === 'sociohabitacional' ? 'datosDomicilio'
    : State.surveyType === 'ciudadano' ? 'citizenSearch'
    : 'typeSelect';
  return `
    <div class="screen screen-geo">
      <header class="app-header">
        <button class="btn-icon" onclick="go('${backTarget}')" aria-label="Volver">←</button>
        <h1 class="header-title">📍 ${title}</h1>
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
      ? 'Domicilio del padrón. Arrastrá el pin para actualizar'
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
    statusEl.textContent = `${err.message}. Ajustá el pin manualmente`;
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
      // Sincronizar la dirección confirmada al campo de la encuesta
      if (State.surveyType === 'sociohabitacional') {
        State.answers.domicilio_calle = addr;
      } else {
        State.answers.domicilio = addr;
      }
      State.padronDomicilio = addr;
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
  if (State.screen === 'datosGeo') {
    go('survey', { currentQ: 6 });
  } else {
    go('survey');
  }
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
        <button class="btn-icon" onclick="go('home')" aria-label="Volver">←</button>
        <h1 class="header-title">Tipo de relevamiento</h1>
      </header>
      <div class="type-loc">📍 ${locText}</div>
      <div class="type-cards">
        <button class="type-card" onclick="selectType('sociohabitacional')">
          <div class="type-card-icon">🏠</div>
          <div class="type-card-title">Encuesta socio-habitacional</div>
          <div class="type-card-desc">Vivienda, servicios básicos, composición del hogar y opinión ciudadana (26 preguntas)</div>
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
      (PREGUNTAS.sociohabitacional || []).slice(0, 6).forEach((q) => {
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
      citizenSearchMode: 'apellido',
      citizenSearchQuery: preselected?.apellido || '',
      citizenDNIQuery: '',
      citizenSearchResults: preselected ? [preselected] : [],
      citizenSearching: false, citizenSearchError: null });
  } else if (type === 'ciudadano') {
    go('citizenSearch', { ...base,
      citizenSearchMode: 'apellido',
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
  return `
    <div class="screen">
      <header class="app-header">
        <button class="btn-icon" onclick="go('typeSelect')" aria-label="Volver">←</button>
        <h1 class="header-title">🏠 Socio-habitacional</h1>
        <span class="header-count">1/3</span>
      </header>
      <div class="block-header">Datos personales</div>
      <div class="dp-body">
        <div class="dp-search-section">
          <div class="dp-section-title">Buscar en el padrón</div>
          <div class="search-mode-tabs">
            <button class="search-mode-tab ${State.citizenSearchMode !== 'domicilio' ? 'active' : ''}"
              onclick="setCitizenSearchMode('apellido')">Apellido / DNI</button>
            <button class="search-mode-tab ${State.citizenSearchMode === 'domicilio' ? 'active' : ''}"
              onclick="setCitizenSearchMode('domicilio')">Domicilio</button>
          </div>
          <input type="text" class="input" id="dpSearchInput"
            placeholder="${State.citizenSearchMode === 'domicilio' ? 'Nombre de calle o número…' : 'Apellido (4+ letras) o DNI (6+ dígitos)…'}"
            value="${esc(State.citizenSearchQuery || '')}"
            oninput="onCitizenSearchInput(this.value)"
            autocomplete="off">
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
        </div>
      </div>
      <div class="survey-footer">
        <button class="btn btn-ghost" onclick="skipDatosPersonales()">Omitir</button>
        <button class="btn btn-primary" onclick="confirmDatosPersonales()">Continuar →</button>
      </div>
    </div>`;
}

// ── Datos Domicilio screen (sociohabitacional step 2) ────────────────────────

function renderDatosDomicilio() {
  const barrioQ = (PREGUNTAS.sociohabitacional || []).find((q) => q.id === 'barrio');
  const barrioOpts = barrioQ?.options || [];
  return `
    <div class="screen screen-datosDomicilio">
      <header class="app-header">
        <button class="btn-icon" onclick="go('datosPersonales')" aria-label="Volver">←</button>
        <h1 class="header-title">🏠 Socio-habitacional</h1>
        <span class="header-count">2/3</span>
      </header>
      <div class="block-header">Domicilio</div>
      <div class="dp-body">
        <div class="dp-fields-section">
          <div class="dp-field">
            <label class="dp-field-label">Nombre de calle</label>
            <input type="text" class="input" id="dpFieldCalle"
              placeholder="Ej: Av. San Martín"
              value="${esc(State.answers.domicilio_calle || '')}"
              oninput="saveAnswer('domicilio_calle', this.value)">
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Número de puerta</label>
            <input type="text" inputmode="numeric" class="input" id="dpFieldNumero"
              placeholder="Ej: 1234"
              value="${esc(State.answers.domicilio_numero || '')}"
              oninput="saveAnswer('domicilio_numero', this.value)">
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
      <div class="block-header">Foto del frente</div>
      <div class="dp-body">
        <div class="dp-fields-section">
          ${renderFotoFrente()}
        </div>
      </div>
      <div class="survey-footer">
        <button class="btn btn-ghost" onclick="go('datosPersonales')">← Atrás</button>
        <button class="btn btn-primary" onclick="confirmDatosDomicilio()">Continuar →</button>
      </div>
    </div>`;
}

function renderFotoFrente() {
  const qid = 'foto_frente';
  const blobs = Array.isArray(_photoBlobs[qid]) ? _photoBlobs[qid] : [];
  const saved = Array.isArray(State.answers[qid]) ? State.answers[qid]
    : (State.answers[qid] ? [State.answers[qid]] : []);
  const urls = saved.map((u, i) => blobs[i] || u);
  const canAdd = urls.length < 5;
  return `
    <div class="photo-wrap" id="photoWrap_${qid}">
      ${urls.length > 0 ? `
        <div class="photo-grid">
          ${urls.map((url, i) => `
            <div class="photo-thumb-wrap">
              <img class="photo-thumb" loading="lazy" src="${esc(url)}" alt="Foto ${i + 1}">
              <button class="photo-thumb-remove" onclick="removePhoto('${qid}',${i})">×</button>
            </div>`).join('')}
          ${canAdd ? `
            <label class="photo-add-btn">
              <span class="photo-add-icon">📷</span>
              <span>Agregar</span>
              <input type="file" accept="image/*" capture="environment" style="display:none"
                onchange="onPhotoSelected(this,'${qid}')">
            </label>` : ''}
        </div>` : `
        <label class="btn btn-outline photo-btn">
          📷 Tomar / seleccionar foto
          <input type="file" accept="image/*" capture="environment" style="display:none"
            onchange="onPhotoSelected(this,'${qid}')">
        </label>`}
      <div class="photo-status" id="photoStatus_${qid}"></div>
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
    const hasQuery = (State.citizenSearchQuery?.length >= 4) || (State.citizenDNIQuery?.length >= 6) || (State.citizenDomicilioQuery?.length >= 4);
    return hasQuery ? `<div class="search-status">Sin resultados en el padrón</div>` : '';
  }
  return `<div class="citizen-results">
    ${results.map((r, i) => `
      <div class="citizen-result" role="button" tabindex="0" onclick="selectDPCitizen(${i})">
        <div class="citizen-result-name">${esc(r.apellido) || '—'}${resultBarrioPill(r)}</div>
        <div class="citizen-result-info">DNI: ${esc(r.dni) || '—'} · ${esc(r.domicilio) || 'Sin domicilio registrado'}</div>
      </div>`).join('')}
  </div>`;
}

// onDPSearchInput eliminado: el buscador de datosPersonales usa el diseño
// unificado (tabs Apellido/DNI · Domicilio) con onCitizenSearchInput / setCitizenSearchMode.

function selectDPCitizen(idx) {
  const record = (State.citizenSearchResults || [])[idx];
  if (!record) return;
  (PREGUNTAS.sociohabitacional || []).slice(0, 6).forEach((q) => {
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
  go('datosDomicilio');
}

function skipDatosPersonales() {
  ['dni', 'apellido', 'apodo'].forEach((k) => {
    delete State.answers[k];
    delete State.padronFilled[k];
  });
  State.padronMeta = null;
  State.padronDomicilio = null;
  State.padronLocation = null;
  go('datosDomicilio');
}

function confirmDatosDomicilio() {
  go('datosGeo');
}

function skipDatosDomicilio() {
  ['domicilio_calle', 'domicilio_numero', 'barrio'].forEach((k) => {
    delete State.answers[k];
    delete State.padronFilled[k];
  });
  State.location = null;
  go('survey', { currentQ: 6 });
}

function renderDatosGeo() {
  const prefill = State.answers.domicilio_calle
    ? (State.answers.domicilio_calle + (State.answers.domicilio_numero ? ' ' + State.answers.domicilio_numero : ''))
    : (State.padronDomicilio || '');
  return `
    <div class="screen screen-geo">
      <header class="app-header">
        <button class="btn-icon" onclick="go('datosDomicilio')" aria-label="Volver">←</button>
        <h1 class="header-title">📍 Ubicación de la vivienda</h1>
        <span class="header-count">3/3</span>
      </header>
      <div class="geo-search-row">
        <input type="text" class="input geo-search-input" id="geoSearchInput"
          placeholder="Buscar dirección…" autocomplete="off"
          value="${esc(prefill)}"
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
          <button class="btn btn-ghost" onclick="skipDatosGeo()">Sin ubicación</button>
          <button class="btn btn-primary" onclick="confirmGeo()">✓ Confirmar</button>
        </div>
      </div>
    </div>`;
}

function skipDatosGeo() {
  State.location = null;
  go('survey', { currentQ: 6 });
}

// ── Citizen Search screen ────────────────────────────────────────────────────

function renderCitizenSearch() {
  return `
    <div class="screen">
      <header class="app-header">
        <button class="btn-icon" onclick="go('typeSelect')" aria-label="Volver">←</button>
        <h1 class="header-title">🧑 Buscar en el padrón</h1>
      </header>
      <div class="survey-body">
        <div class="search-mode-tabs">
          <button class="search-mode-tab ${State.citizenSearchMode !== 'domicilio' ? 'active' : ''}"
            onclick="setCitizenSearchMode('apellido')">Apellido / DNI</button>
          <button class="search-mode-tab ${State.citizenSearchMode === 'domicilio' ? 'active' : ''}"
            onclick="setCitizenSearchMode('domicilio')">Domicilio</button>
        </div>
        <input type="text" class="input" id="citizenSearchInput"
          placeholder="${State.citizenSearchMode === 'domicilio' ? 'Nombre de calle o número…' : 'Apellido (4+ letras) o DNI (6+ dígitos)…'}"
          value="${esc(State.citizenSearchQuery || '')}"
          oninput="onCitizenSearchInput(this.value)"
          autocomplete="off">
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
    const hasQuery = (State.citizenSearchQuery?.length >= 4) || (State.citizenDNIQuery?.length >= 6) || (State.citizenDomicilioQuery?.length >= 4);
    return hasQuery ? `<div class="search-status">Sin resultados en el padrón</div>` : '';
  }
  return `<div class="citizen-results">
    ${results.map((r, i) => `
      <div class="citizen-result" role="button" tabindex="0" onclick="selectCitizen(${i})">
        <div class="citizen-result-name">${esc(r.apellido) || '—'}${resultBarrioPill(r)}</div>
        <div class="citizen-result-info">DNI: ${esc(r.dni) || '—'} · ${esc(r.domicilio) || 'Sin domicilio registrado'}</div>
      </div>`).join('')}
  </div>`;
}

function setCitizenSearchMode(mode) {
  State.citizenSearchMode = mode;
  State.citizenSearchQuery = '';
  State.citizenSearchResults = [];
  State.citizenSearching = false;
  State.citizenSearchError = null;
  clearTimeout(_searchDebounce);
  render();
}

function onCitizenSearchInput(value) {
  State.citizenSearchQuery = value;
  clearTimeout(_searchDebounce);
  const isDomicilio = State.citizenSearchMode === 'domicilio';
  const isNumeric = !isDomicilio && /^\d+$/.test(value.trim());
  const minLen = isNumeric ? 6 : 4;

  if (value.length >= minLen) {
    State.citizenSearching = true;
    State.citizenSearchResults = [];
    State.citizenSearchError = null;
    updateCitizenSearchUI();
    const field = isDomicilio ? 'domicilio' : (isNumeric ? 'dni' : 'apellido');
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
      const record = await withTokenRetry(() => Padron.searchByDNIAsync(value));
      results = record ? [record] : [];
    } else if (field === 'domicilio') {
      results = await withTokenRetry(() => Padron.searchByDomicilioAsync(value));
    } else {
      results = await withTokenRetry(() => Padron.searchByApellidoAsync(value));
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

  if (record) {
    const ciuRecord = (State.surveys || []).find(
      (r) => r.type === 'ciudadano' && String(r.answers?.dni).trim() === String(record.dni).trim()
    );
    if (ciuRecord?.fallecido) {
      showToast('† Ciudadano registrado como fallecido: no se puede relevar');
      return;
    }
  }

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
        <button class="btn-icon" onclick="surveyBack()" aria-label="Volver">←</button>
        <h1 class="header-title">${typeIcon(State.surveyType)} ${typeLabel(State.surveyType)}</h1>
        <span class="header-count">${visPos}/${visTotal}</span>
      </header>
      <div class="progress-bar"><div class="progress-fill" style="transform:scaleX(${(progress || 0) / 100})"></div></div>
      ${blockHeader}
      <div class="survey-body">
        <label class="question-label" for="q_${q.id}">
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
      const blobs = Array.isArray(_photoBlobs[q.id]) ? _photoBlobs[q.id] : [];
      const saved = Array.isArray(State.answers[q.id]) ? State.answers[q.id]
        : (State.answers[q.id] ? [State.answers[q.id]] : []);
      // Merge: use blob URL for preview when available (same index), else saved URL
      const urls = saved.map((u, i) => blobs[i] || u);
      const max = 5;
      const canAdd = urls.length < max;
      return `
        <div class="photo-wrap" id="photoWrap_${q.id}">
          ${urls.length > 0 ? `
            <div class="photo-grid">
              ${urls.map((url, i) => `
                <div class="photo-thumb-wrap">
                  <img class="photo-thumb" loading="lazy" src="${esc(url)}" alt="Foto ${i + 1}">
                  <button class="photo-thumb-remove" onclick="removePhoto('${q.id}',${i})">×</button>
                </div>`).join('')}
              ${canAdd ? `
                <label class="photo-add-btn">
                  <span class="photo-add-icon">📷</span>
                  <span>Agregar</span>
                  <input type="file" accept="image/*" capture="environment" style="display:none"
                    onchange="onPhotoSelected(this,'${q.id}')">
                </label>` : ''}
            </div>` : `
            <label class="btn btn-outline photo-btn">
              📷 Tomar / seleccionar foto
              <input type="file" accept="image/*" capture="environment" style="display:none"
                onchange="onPhotoSelected(this,'${q.id}')">
            </label>`}
          <div class="photo-status" id="photoStatus_${q.id}"></div>
        </div>`;
    }

    case 'chips_otros': {
      const selected = Array.isArray(State.answers[q.id]) ? State.answers[q.id] : [];
      const otrosVal = State.answers[q.id + '_otros'] || '';
      return `
        <div class="chip-group">
          ${(q.options || []).map((o) => {
            const v = typeof o === 'string' ? o : o.value;
            const l = typeof o === 'string' ? o : o.label;
            return `<button class="chip ${selected.includes(v) ? 'active' : ''}"
              onclick="toggleChip('${q.id}', '${esc(v)}')">
              ${esc(l)}
            </button>`;
          }).join('')}
        </div>
        <input type="text" class="input" style="margin-top:8px"
          placeholder="${esc(q.otrosPlaceholder || 'Otros…')}"
          value="${esc(otrosVal)}"
          oninput="saveAnswer('${q.id}_otros', this.value)">`;
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

  // Init arrays
  if (!Array.isArray(_photoBlobs[questionId])) _photoBlobs[questionId] = [];
  if (!Array.isArray(State.answers[questionId])) {
    State.answers[questionId] = State.answers[questionId] ? [State.answers[questionId]] : [];
  }

  // Append blob URL for immediate preview and re-render
  const localUrl = URL.createObjectURL(file);
  const idx = State.answers[questionId].length;
  _photoBlobs[questionId].push(localUrl);
  State.answers[questionId].push(localUrl);
  render();

  const statusEl = document.getElementById(`photoStatus_${questionId}`);
  if (statusEl) statusEl.innerHTML = '<div class="geo-spinner geo-spinner-sm"></div> Comprimiendo…';

  try {
    const blob = await GCS.compress(file);

    const token = localStorage.getItem('severo_access_token');
    if (!token) {
      const reader = new FileReader();
      reader.onload = (e) => { State.answers[questionId][idx] = e.target.result; };
      reader.readAsDataURL(blob);
      const st = document.getElementById(`photoStatus_${questionId}`);
      if (st) st.innerHTML = '<span class="photo-warn">⚠ Sin sesión Google: foto guardada localmente</span>';
      return;
    }

    const st = document.getElementById(`photoStatus_${questionId}`);
    if (st) st.innerHTML = '<div class="geo-spinner geo-spinner-sm"></div> Subiendo…';
    const filename = GCS.filename(State.surveyType || 'relevamientos');
    let gcsUrl;
    try {
      gcsUrl = await GCS.upload(blob, filename);
    } catch (err) {
      if (err.message === '401') { await ensureFreshToken(); gcsUrl = await GCS.upload(blob, filename); }
      else throw err;
    }
    State.answers[questionId][idx] = gcsUrl;
    const count = State.answers[questionId].length;
    const st2 = document.getElementById(`photoStatus_${questionId}`);
    if (st2) st2.innerHTML = `<span class="photo-ok">✓ ${count} foto${count > 1 ? 's' : ''} subida${count > 1 ? 's' : ''}</span>`;
  } catch (err) {
    console.error('[GCS] upload error:', err.message, err);
    const st = document.getElementById(`photoStatus_${questionId}`);
    if (st) st.innerHTML = `<span class="photo-warn">⚠ ${err.message || 'Error al subir'}. Reintentá al finalizar</span>`;
  }
}

function removePhoto(questionId, idx) {
  if (Array.isArray(_photoBlobs[questionId])) _photoBlobs[questionId].splice(idx, 1);
  if (Array.isArray(State.answers[questionId])) State.answers[questionId].splice(idx, 1);
  render();
}

function surveyBack() {
  const questions = PREGUNTAS[State.surveyType] || [];
  const personalQCount = State.surveyType === 'sociohabitacional' ? 6 : 0;
  const prev = prevVisibleIdx(State.currentQ, questions);
  if (prev < personalQCount) {
    const hasUserAnswers = Object.keys(State.answers || {}).some((k) => !State.padronFilled?.[k]);
    if (hasUserAnswers && !confirm('¿Salir del relevamiento? Se perderán los datos ingresados.')) return;
    go(State.surveyType === 'sociohabitacional' ? 'datosGeo' : 'geo');
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
    record = await withTokenRetry(() => Padron.searchByDNIAsync(dni));
  } catch {
    return;
  }

  if (!record) return; // ciudadano no encontrado en el padrón

  // Bloquear si el ciudadano está registrado como fallecido
  let ciuRecord = (State.surveys || []).find(
    (r) => r.type === 'ciudadano' && String(r.answers?.dni).trim() === dni
  );
  // Si la lista en memoria está vacía (app recién abierta), consultar directamente
  if (!ciuRecord && !(State.surveys || []).some((r) => r.type === 'ciudadano')) {
    try {
      const rows = await SheetsDB.load('ciudadano');
      ciuRecord = rows.find((r) => String(r.answers?.dni).trim() === dni);
    } catch { /* no bloquear por error de red */ }
  }
  if (ciuRecord?.fallecido) {
    showToast('† Ciudadano registrado como fallecido: no se puede relevar');
    go('home');
    return;
  }

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
  const fotoRaw = State.answers['foto_url'];
  const photoList = Array.isArray(fotoRaw) ? fotoRaw.filter(Boolean) : (fotoRaw ? [fotoRaw] : []);
  // Use blob URLs for preview when available
  const blobList = Array.isArray(_photoBlobs['foto_url']) ? _photoBlobs['foto_url'] : [];
  const previewList = photoList.map((u, i) => blobList[i] || u);
  const rows = questions.filter((q) => q.type !== 'photo').map((q) => {
    const val = State.answers[q.id];
    let display = '—';
    if (q.type === 'chips_otros') {
      const parts = [...(Array.isArray(val) ? val : (val ? [val] : [])),
        State.answers[q.id + '_otros'] || ''].filter(Boolean);
      display = parts.length ? esc(parts.join(', ')) : '—';
    } else if (val !== undefined && val !== null && val !== '') {
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
        <button class="btn-icon" onclick="go('survey')" aria-label="Volver">←</button>
        <h1 class="header-title">Resumen</h1>
      </header>
      <div class="summary-body">
        ${previewList.length > 0 ? `
          <div class="detail-photo-grid">
            ${previewList.map(url => `
              <div class="detail-photo-item" role="button" tabindex="0" onclick="this.classList.toggle('detail-photo-item-expand')">
                <img src="${esc(url)}" alt="Foto" loading="lazy">
              </div>`).join('')}
          </div>` : ''}
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
    State.saveError = err.message;
    go('saveError');
  }
}

function renderSaveError() {
  const msg = State.saveError || 'Error desconocido';
  return `
    <div class="screen screen-center">
      <div class="done-icon">⚠️</div>
      <h2 style="color:var(--danger)">No se pudo guardar</h2>
      <p class="done-sub" style="color:var(--text-secondary);padding:0 24px;text-align:center">${esc(msg)}</p>
      <p style="font-size:.82rem;color:var(--text-secondary);padding:0 24px;text-align:center;margin-top:4px">
        Tus respuestas no se perdieron. Podés reintentar o volver al resumen.
      </p>
      <div class="done-actions" style="margin-top:24px">
        <button class="btn btn-primary btn-block" onclick="go('saving')">Reintentar</button>
        <button class="btn btn-outline btn-block" onclick="go('summary')">Ver resumen</button>
      </div>
    </div>`;
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
    subtitle = r.answers?.domicilio_calle
      ? [r.answers.domicilio_calle, r.answers.domicilio_numero].filter(Boolean).join(' ')
      : (r.answers?.domicilio || '');
  }
  const barrio = r.answers?.barrio
    ? `<span class="card-barrio">${esc(r.answers.barrio)}</span>` : '';
  const estadoBadge = isProb ? renderEstadoBadge(r.estado) : '';
  const fallecidoBadge = r.type === 'ciudadano' && r.fallecido
    ? `<span class="fallecido-badge">† Fallecido${r.fallecido !== 'FALLECIDO' ? ' ' + r.fallecido : ''}</span>` : '';
  return `
    <div class="survey-card survey-card--${r.type}" role="button" tabindex="0" onclick="openDetail(${idx})">
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
      <div class="card-arrow" aria-hidden="true">›</div>
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
        <button class="btn-icon" onclick="go('home')" aria-label="Volver">←</button>
        <h1 class="header-title">Mis relevamientos</h1>
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


function renderDetail() {
  const r = State.detailRecord;
  if (!r) { go('list'); return ''; }
  const questions = PREGUNTAS[r.type] || [];
  const fotoRaw = r.answers?.foto_url;
  const photoList = Array.isArray(fotoRaw) ? fotoRaw.filter(Boolean) : (fotoRaw ? [fotoRaw] : []);

  const rows = questions.filter((q) => q.type !== 'photo').map((q) => {
    const val = r.answers?.[q.id];
    let display = '—';
    if (q.type === 'chips_otros') {
      const parts = [...(Array.isArray(val) ? val : (val ? [val] : [])),
        r.answers?.[q.id + '_otros'] || ''].filter(Boolean);
      display = parts.length ? esc(parts.join(', ')) : '—';
    } else if (val !== undefined && val !== null && val !== '') {
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
        <button class="btn-icon" onclick="go('list')" aria-label="Volver">←</button>
        <h1 class="header-title">${typeIcon(r.type)} ${typeLabel(r.type)}</h1>
      </header>
      <div class="summary-body">
        ${photoList.length > 0 ? `
          <div class="detail-photo-grid">
            ${photoList.map(url => `
              <div class="detail-photo-item" role="button" tabindex="0" onclick="this.classList.toggle('detail-photo-item-expand')">
                <img src="${esc(url)}" alt="Foto" loading="lazy">
              </div>`).join('')}
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

// A11y: activate role="button" elements with Enter/Space (keyboard parity for click-only divs)
document.addEventListener("keydown", function (e) {
  if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
  var t = e.target;
  if (t && t.getAttribute && t.getAttribute("role") === "button" && t.hasAttribute("tabindex")) {
    e.preventDefault();
    t.click();
  }
});
