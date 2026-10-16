// Routeur (hash), connexion et démarrage.
const ROLE_LABELS = { admin: 'Administrateur', charge: "Chargé d'affaires", atelier: 'Opérateur' };
// Écrans accessibles au rôle atelier (saisie des heures + consultation du planning).
const ATELIER_VIEWS = ['pointage', 'planning', 'parametres', 'bon', 'notifications'];
// Anciennes adresses et sous-écrans -> écran et entrée de menu
const ALIASES = { affaires: 'chantiers', affaire: 'chantier', temps: 'rh' };
const MENU_OF = { api: 'parametres', consultations: 'commandes', chiffrages: 'devis', chiffrage: 'devis', familles: 'articles', ouvrages: 'articles', efactures: 'commandes', achats: 'commandes', compta: 'factures', mails: 'parametres', documents: 'parametres', bon: 'chantiers', reception: 'chantiers', pv: 'chantiers', situations: 'factures', chantier: 'chantiers', facture: 'factures', entreprise: 'contacts', mainoeuvre: 'articles', livraison: 'articles' };

const App = {
  render() {
    const hash = location.hash.replace(/^#\/?/, '') || (Store.me.role === 'atelier' ? 'pointage' : 'dashboard');
    const [path, qs] = hash.split('?');
    let [name, ...params] = path.split('/');
    name = ALIASES[name] || name;
    if (Store.me.role === 'atelier' && !ATELIER_VIEWS.includes(name)) name = 'pointage';
    const query = new URLSearchParams(qs || '');
    const view = Views[name] || Views.dashboard;
    if (name !== 'documents') Doc.draft = null;
    if (name !== 'mails') mailEdit.draft = null;
    Doc.appliquer();
    const root = document.getElementById('app');
    root.innerHTML = view(params, query);
    if (view.bind) view.bind(root, params, query);
    this.pendingRemote = false;
    document.getElementById('remote-banner').classList.add('hidden');

    const section = MENU_OF[name] || name;
    document.querySelectorAll('#nav a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === `#/${section}`);
      a.hidden = Store.me.role === 'atelier' && !ATELIER_VIEWS.includes(a.getAttribute('href').slice(2));
    });
    Notifs.majCloche();
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
      <h1>Pipe-Fit CRM</h1>
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

  showSetup(local, error) {
    document.body.classList.add('logged-out');
    const root = document.getElementById('app');
    if (!local) {
      root.innerHTML = `<div class="card login"><h1>Pipe-Fit CRM</h1><p>L'application n'est pas encore configurée.</p>
        <p>Ouvrez <strong>http://localhost:${esc(location.port || '80')}</strong> directement sur le serveur pour créer le compte administrateur.</p></div>`;
      return;
    }
    root.innerHTML = `<form class="card login" id="setup-form">
      <h1>Bienvenue dans Pipe-Fit CRM</h1>
      <p class="muted" style="margin:0">Créez le compte administrateur. Vous pourrez ensuite créer les comptes de vos collègues dans Paramètres.</p>
      <div class="field"><label>Identifiant</label><input name="login" value="admin" required autocomplete="username"></div>
      <div class="field"><label>Nom affiché</label><input name="nom" value="Administrateur"></div>
      <div class="field"><label>Mot de passe (8 caractères min.)</label><input name="password" type="password" minlength="8" required autocomplete="new-password"></div>
      <div class="field"><label>Confirmer le mot de passe</label><input name="confirm" type="password" required autocomplete="new-password"></div>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="demo" style="width:auto"> Charger des données de démonstration (pour découvrir l'outil)</label>
      ${error ? `<p class="neg">${esc(error)}</p>` : ''}
      <button type="submit" style="width:100%;margin-top:8px">Commencer</button>
    </form>`;
    root.querySelector('#setup-form').onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      if (f.password.value !== f.confirm.value) return this.showSetup(true, 'Les mots de passe ne correspondent pas.');
      try {
        await api('POST', '/api/setup', { login: f.login.value, nom: f.nom.value, password: f.password.value, demo: f.demo.checked });
        location.reload();
      } catch (err) { this.showSetup(true, err.message); }
    };
  },

  async start() {
    try {
      Store.me = await api('GET', '/api/me');
    } catch (e) {
      if (e.status === 401) {
        const setup = await api('GET', '/api/setup').catch(() => ({}));
        return setup.needed ? this.showSetup(setup.local) : this.showLogin();
      }
      document.getElementById('app').innerHTML = `<p class="neg">Serveur injoignable : ${esc(e.message)}</p>`;
      return;
    }
    document.body.classList.remove('logged-out');
    document.getElementById('whoami').textContent = `${Store.me.nom} · ${ROLE_LABELS[Store.me.role] || ''}`;
    document.getElementById('logout').onclick = async () => { await api('POST', '/api/logout'); location.hash = ''; location.reload(); };
    document.getElementById('remote-refresh').onclick = () => { Modal.close(); this.render(); };
    await Store.load();
    Store.listen();
    Notifs.demarrer();
    this.render();
    window.addEventListener('hashchange', () => { Modal.close(); this.render(); });
  },
};

document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') Modal.close(); });
App.start();
