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
  handleGoogleToken(accessToken, userInfo) {
    this._user = {
      name: userInfo.name,
      email: userInfo.email,
      picture: userInfo.picture || null,
    };
    localStorage.setItem('severo_user', JSON.stringify(this._user));
    localStorage.setItem('severo_access_token', accessToken);
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
    if (token && window.google?.accounts?.oauth2) {
      try { google.accounts.oauth2.revoke(token); } catch {}
    }
    if (window.google?.accounts?.id) {
      google.accounts.id.disableAutoSelect();
    }
  },
};
