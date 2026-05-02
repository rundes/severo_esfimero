// ── Estado global ────────────────────────────────────────────────────────────

const State = {
  screen: 'auth',
  user: null,
  location: null,
  surveyType: null,   // 'ciudadano' | 'problematica'
  answers: {},
  currentQ: 0,
  surveys: [],
  detailRecord: null,
  toast: null,
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

// Callback registrado por Google Identity Services
window.gsiCallback = (response) => {
  const user = Auth.handleCredential(response);
  if (user) go('home', { user });
};

// ── Navegación ───────────────────────────────────────────────────────────────

function go(screen, updates = {}) {
  Object.assign(State, updates, { screen });
  render();
}

function render() {
  const el = document.getElementById('app');
  const screens = {
    auth:         renderAuth,
    home:         renderHome,
    geo:          renderGeo,
    typeSelect:   renderTypeSelect,
    survey:       renderSurvey,
    summary:      renderSummary,
    saving:       renderSaving,
    done:         renderDone,
    list:         renderList,
    detail:       renderDetail,
  };
  el.innerHTML = (screens[State.screen] || renderAuth)();
  bindEvents();
  if (State.screen === 'geo') startGeoCapture();
  if (State.screen === 'saving') doSave();
  if (State.screen === 'list') loadList();
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
        <div class="logo-mark">S</div>
        <h1 class="logo-title">Severo</h1>
        <p class="logo-sub">Sistema de Relevamientos</p>
      </div>
      <div class="auth-card">
        ${isConfigured ? `
          <div id="g_id_onload"
            data-client_id="${CONFIG.GOOGLE_CLIENT_ID}"
            data-callback="gsiCallback"
            data-auto_prompt="false"></div>
          <div class="g_id_signin"
            data-type="standard" data-size="large"
            data-theme="outline" data-text="sign_in_with"
            data-shape="rectangular" data-logo_alignment="left">
          </div>
          <div class="divider"><span>o</span></div>
        ` : ''}
        <button class="btn btn-outline" onclick="mockLogin()">
          Entrar como operador de prueba
        </button>
        ${!isConfigured ? `<p class="hint">Prototipo — datos guardados en el navegador</p>` : ''}
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
        <span class="header-title">Relevamientos</span>
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
      ${CONFIG.USE_MOCK ? `<p class="hint center">Modo prototipo — datos en localStorage</p>` : ''}
    </div>`;
}

function logout() {
  Auth.logout();
  go('auth', { user: null });
}

function startNewSurvey() {
  go('geo', { answers: {}, currentQ: 0, location: null, surveyType: null });
}

function renderGeo() {
  return `
    <div class="screen">
      <header class="app-header">
        <button class="btn-icon" onclick="go('home')">←</button>
        <span class="header-title">Ubicación</span>
      </header>
      <div class="geo-content">
        <div class="geo-icon" id="geoIcon">📍</div>
        <p class="geo-status" id="geoStatus">Obteniendo ubicación…</p>
        <p class="geo-coords" id="geoCoords"></p>
        <div id="geoActions" style="display:none">
          <button class="btn btn-primary btn-block" onclick="go('typeSelect')">
            Continuar
          </button>
          <button class="btn btn-ghost btn-block" onclick="go('typeSelect')">
            Continuar sin ubicación
          </button>
        </div>
      </div>
    </div>`;
}

async function startGeoCapture() {
  const statusEl = document.getElementById('geoStatus');
  const coordsEl = document.getElementById('geoCoords');
  const iconEl   = document.getElementById('geoIcon');
  const actionsEl = document.getElementById('geoActions');

  try {
    const loc = await Geo.getLocation();
    State.location = loc;
    iconEl.textContent = '✅';
    statusEl.textContent = 'Ubicación obtenida';
    coordsEl.textContent = Geo.format(loc);
    actionsEl.style.display = 'block';
  } catch (err) {
    iconEl.textContent = '⚠️';
    statusEl.textContent = err.message;
    coordsEl.textContent = 'Podés continuar sin ubicación';
    actionsEl.style.display = 'block';
  }
}

function renderTypeSelect() {
  const locText = State.location ? Geo.format(State.location) : 'Sin ubicación';
  return `
    <div class="screen">
      <header class="app-header">
        <button class="btn-icon" onclick="go('geo')">←</button>
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
  go('survey', { surveyType: type, currentQ: 0, answers: {} });
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

function surveyBack() {
  const questions = PREGUNTAS[State.surveyType] || [];
  const prev = prevVisibleIdx(State.currentQ, questions);
  if (prev < 0) {
    go('typeSelect');
  } else {
    State.currentQ = prev;
    render();
  }
}

function surveyNext(skip) {
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

  const next = nextVisibleIdx(State.currentQ, questions);
  if (next >= questions.length) {
    go('summary');
  } else {
    State.currentQ = next;
    render();
  }
}

function renderSummary() {
  const questions = PREGUNTAS[State.surveyType] || [];
  const rows = questions.map((q) => {
    const val = State.answers[q.id];
    let display = '—';
    if (val !== undefined && val !== null && val !== '') {
      display = Array.isArray(val) ? val.join(', ') : String(val);
    }
    return `<tr>
      <td class="summary-label">${q.label}</td>
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
      type: State.surveyType,
      operador: State.user,
      location: State.location,
      answers: { ...State.answers },
    };
    await SheetsDB.save(State.surveyType, record);
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

function renderList() {
  const ciudadanos      = SheetsDB.getAll('ciudadano');
  const problemas       = SheetsDB.getAll('problematica');
  const sociohabit      = SheetsDB.getAll('sociohabitacional');
  const all = [
    ...ciudadanos.map((r)   => ({...r, type: 'ciudadano'})),
    ...problemas.map((r)    => ({...r, type: 'problematica'})),
    ...sociohabit.map((r)   => ({...r, type: 'sociohabitacional'})),
  ];
  all.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

  const cards = all.length === 0
    ? `<p class="hint center">Todavía no hay relevamientos guardados.</p>`
    : all.map((r) => {
        const firstQ = PREGUNTAS[r.type]?.[0];
        const preview = firstQ ? (r.answers?.[firstQ.id] || '—') : '';
        return `
          <div class="survey-card" onclick="openDetail(${r.id}, '${r.type}')">
            <div class="card-icon">${typeIcon(r.type)}</div>
            <div class="card-body">
              <div class="card-type">${typeLabel(r.type)}</div>
              <div class="card-preview">${String(preview).slice(0, 60)}</div>
              <div class="card-date">${formatDate(r.savedAt)}</div>
              ${r.location ? `<div class="card-loc">📍 ${Geo.format(r.location)}</div>` : ''}
            </div>
          </div>`;
      }).join('');

  return `
    <div class="screen">
      <header class="app-header">
        <button class="btn-icon" onclick="go('home')">←</button>
        <span class="header-title">Historial</span>
        <span class="header-count">${all.length}</span>
      </header>
      <div class="list-body">${cards}</div>
    </div>`;
}

function loadList() {
  // Si se usa API real, aquí iría el fetch async y re-render
}

function openDetail(id, type) {
  const items = SheetsDB.getAll(type);
  const record = items.find((r) => r.id === id);
  if (record) go('detail', { detailRecord: { ...record, type } });
}

function renderDetail() {
  const r = State.detailRecord;
  if (!r) { go('list'); return ''; }
  const questions = PREGUNTAS[r.type] || [];

  const rows = questions.map((q) => {
    const val = r.answers?.[q.id];
    let display = '—';
    if (val !== undefined && val !== null && val !== '') {
      display = Array.isArray(val) ? val.join(', ') : String(val);
    }
    return `<tr>
      <td class="summary-label">${q.label}</td>
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
        <div class="summary-meta">
          <span>${formatDate(r.savedAt)}</span>
          <span>${r.operador?.name || ''}</span>
          ${r.location ? `<a href="${Geo.mapsUrl(r.location)}" target="_blank" class="loc-link">📍 Ver en mapa</a>` : '<span>Sin ubicación</span>'}
        </div>
        <table class="summary-table">${rows}</table>
      </div>
    </div>`;
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
