const Auth = {
  _user: null,

  init() {
    const saved = localStorage.getItem('severo_user');
    if (saved) {
      try { this._user = JSON.parse(saved); } catch (_) { this._user = null; }
    }
  },

  getUser() { return this._user; },
  isLoggedIn() { return !!this._user; },

  // Called after OAuth2 token flow + userinfo fetch
  handleGoogleToken(accessToken, userInfo, expiresIn) {
    this._user = {
      name: userInfo.name,
      email: userInfo.email,
      picture: userInfo.picture || null,
    };
    localStorage.setItem('severo_user', JSON.stringify(this._user));
    localStorage.setItem('severo_access_token', accessToken);
    // Usa el expires_in real de Google (fallback 3600 s). El margen de 5 min
    // lo aplica _isTokenNearExpiry() al decidir cuándo refrescar.
    const ttlMs = (parseInt(expiresIn, 10) || 3600) * 1000;
    localStorage.setItem('severo_token_expiry', String(Date.now() + ttlMs));
    return this._user;
  },

  mockLogin() {
    this._user = {
      name: 'Operador Prueba',
      email: 'operador@municipio.gob.ar',
      picture: null,
      isMock: true,
    };
    localStorage.setItem('severo_user', JSON.stringify(this._user));
    return this._user;
  },

  logout() {
    const token = localStorage.getItem('severo_access_token');
    this._user = null;
    localStorage.removeItem('severo_user');
    localStorage.removeItem('severo_access_token');
    localStorage.removeItem('severo_token_expiry');
    if (token && window.google?.accounts?.oauth2) {
      try { google.accounts.oauth2.revoke(token); } catch {}
    }
    if (window.google?.accounts?.id) {
      google.accounts.id.disableAutoSelect();
    }
  },
};
