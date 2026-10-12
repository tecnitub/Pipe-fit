// Routeur (hash), connexion et démarrage.
const ROLE_LABELS = { admin: 'Administrateur', charge: "Chargé d'affaires", atelier: 'Atelier' };
// Écrans accessibles au rôle atelier (saisie des heures + consultation du planning).
const ATELIER_VIEWS = ['planning', 'temps', 'parametres'];

const App = {
  render() {
    const hash = location.hash.replace(/^#\/?/, '') || (Store.me.role === 'atelier' ? 'temps' : 'dashboard');
    const [path, qs] = hash.split('?');
    let [name, ...params] = path.split('/');
    if (Store.me.role === 'atelier' && !ATELIER_VIEWS.includes(name)) name = 'temps';
    const query = new URLSearchParams(qs || '');
    const view = Views[name] || Views.dashboard;
    const root = document.getElementById('app');
    root.innerHTML = view(params, query);
    if (view.bind) view.bind(root, params, query);
    this.pendingRemote = false;
    document.getElementById('remote-banner').classList.add('hidden');

    const section = { affaire: 'affaires', facture: 'factures' }[name] || name;
    document.querySelectorAll('#nav a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === `#/${section}`);
      a.hidden = Store.me.role === 'atelier' && !ATELIER_VIEWS.includes(a.getAttribute('href').slice(2));
    });
  },

  // Modification faite par un autre utilisateur : on rafraîchit sauf si une saisie est en cours.
  remoteUpdate(msg) {
    const editing = !document.getElementById('modal').classList.contains('hidden') ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement || {}).tagName);
    if (!editing) { this.render(); if (msg) this.toast(msg); return; }
    this.pendingRemote = true;
    const b = document.getElementById('remote-banner');
    b.querySelector('span').textContent = msg || 'Des données ont été modifiées par un autre utilisateur.';
    b.classList.remove('hidden');
  },

  toast(msg, ms = 2500) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  },

  showLogin(error) {
    document.body.classList.add('logged-out');
    const root = document.getElementById('app');
    root.innerHTML = `<form class="card login" id="login-form">
      <h1>Tuilerie CRM</h1>
      <div class="field"><label>Identifiant</label><input name="login" autocomplete="username" required autofocus></div>
      <div class="field"><label>Mot de passe</label><input name="password" type="password" autocomplete="current-password" required></div>
      ${error ? `<p class="neg">${esc(error)}</p>` : ''}
      <button type="submit" style="width:100%;margin-top:12px">Se connecter</button>
    </form>`;
    root.querySelector('#login-form').onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      try {
        await api('POST', '/api/login', { login: f.login.value, password: f.password.value });
        location.reload();
      } catch (err) { this.showLogin(err.message); }
    };
  },

  async start() {
    try {
      Store.me = await api('GET', '/api/me');
    } catch (e) {
      if (e.status === 401) return this.showLogin();
      document.getElementById('app').innerHTML = `<p class="neg">Serveur injoignable : ${esc(e.message)}</p>`;
      return;
    }
    document.body.classList.remove('logged-out');
    document.getElementById('whoami').textContent = `${Store.me.nom} · ${ROLE_LABELS[Store.me.role] || ''}`;
    document.getElementById('logout').onclick = async () => { await api('POST', '/api/logout'); location.hash = ''; location.reload(); };
    document.getElementById('remote-refresh').onclick = () => { Modal.close(); this.render(); };
    await Store.load();
    Store.listen();
    this.render();
    window.addEventListener('hashchange', () => { Modal.close(); this.render(); });
  },
};

document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') Modal.close(); });
App.start();
