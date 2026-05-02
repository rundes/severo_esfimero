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

  // Llamado por el callback de Google Identity Services
  handleCredential(response) {
    try {
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      this._user = {
        name: payload.name,
        email: payload.email,
        picture: payload.picture || null,
      };
      localStorage.setItem('severo_user', JSON.stringify(this._user));
      return this._user;
    } catch (e) {
      console.error('Error al procesar credencial de Google:', e);
      return null;
    }
  },

  logout() {
    this._user = null;
    localStorage.removeItem('severo_user');
    if (window.google?.accounts?.id) {
      google.accounts.id.disableAutoSelect();
    }
  },
};
