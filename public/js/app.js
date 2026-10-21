// Routeur (hash), connexion et démarrage.
const ROLE_LABELS = { admin: 'Administrateur', charge: "Chargé d'affaires", atelier: 'Opérateur' };
// Écrans accessibles au rôle atelier (saisie des heures + consultation du planning).
const ATELIER_VIEWS = ['pointage', 'planning', 'parametres', 'bon', 'notifications', 'epreuve', 'mes', 'equilibrage'];
// Anciennes adresses et sous-écrans -> écran et entrée de menu
const ALIASES = { affaires: 'chantiers', affaire: 'chantier', temps: 'rh' };
const MENU_OF = { api: 'parametres', consultations: 'commandes', chiffrages: 'devis', chiffrage: 'devis', familles: 'articles', ouvrages: 'articles', efactures: 'commandes', achats: 'commandes', comptoir: 'commandes', prixAchats: 'commandes', compta: 'factures', mails: 'parametres', documents: 'parametres', bon: 'chantiers', reception: 'chantiers', pv: 'chantiers', epreuve: 'chantiers', mes: 'chantiers', equilibrage: 'chantiers', chantier: 'chantiers', facture: 'factures', entreprise: 'contacts', mainoeuvre: 'articles', livraison: 'articles' };

const App = {
  render() {
    const hash = location.hash.replace(/^#\/?/, '') || (Store.me.role === 'atelier' ? 'pointage' : 'dashboard');
    const [path, qs] = hash.split('?');
    let [name, ...params] = path.split('/');
    name = ALIASES[name] || name;
    if (Store.me.role === 'atelier' && !ATELIER_VIEWS.includes(name)) name = 'pointage';
    // Écran masqué pour cet accès (Paramètres → Affichage par accès) : premier écran affiché
    const masques = accesMasques();
    if (Acces.routeMasquee(name, params, masques, MENU_OF, Store.me.role)) { location.hash = `#/${Acces.accueil(masques, Store.me.role)}`; return; }
    const query = new URLSearchParams(qs || '');
    const view = Views[name] || Views.dashboard;
    if (name !== 'documents') Doc.draft = null;
    if (name !== 'mails') mailEdit.draft = null;
    Doc.appliquer();
    const root = document.getElementById('app');
    root.innerHTML = view(params, query);
    if (view.bind) view.bind(root, params, query);
    // Onglets plus larges que l'écran (téléphone) : l'onglet actif reste visible
    root.querySelectorAll('.tabs a.active').forEach(a => { const t = a.parentElement; if (t.scrollWidth > t.clientWidth) t.scrollLeft = a.offsetLeft - t.offsetLeft - (t.clientWidth - a.offsetWidth) / 2; });
    masquerLiensAcces(root);
    if (typeof brancherDicteeTexte === 'function') brancherDicteeTexte(root);
    this.pendingRemote = false;
    document.getElementById('remote-banner').classList.add('hidden');

    const section = MENU_OF[name] || name;
    document.querySelectorAll('#nav a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === `#/${section}`);
      a.hidden = (Store.me.role === 'atelier' && !ATELIER_VIEWS.includes(a.getAttribute('href').slice(2))) || Acces.routeMasquee(a.getAttribute('href').slice(2), [], masques, MENU_OF, Store.me.role);
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
      <div class="field"><label>Mot de passe (10 caractères min.)</label><input name="password" type="password" minlength="10" required autocomplete="new-password"></div>
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
      // Sans réseau : démarrage avec les données gardées sur le téléphone
      const c = HorsLigne.estReseau(e) && await HorsLigne.lireDonnees();
      if (c) { Store.me = c.me; return this.demarrerSession(); }
      if (e.status === 401) {
        const setup = await api('GET', '/api/setup').catch(() => ({}));
        return setup.needed ? this.showSetup(setup.local) : this.showLogin();
      }
      document.getElementById('app').innerHTML = `<p class="neg">Serveur injoignable : ${esc(e.message)}</p>`;
      return;
    }
    return this.demarrerSession();
  },
  async demarrerSession() {
    document.body.classList.remove('logged-out');
    document.getElementById('whoami').textContent = `${Store.me.nom} · ${ROLE_LABELS[Store.me.role] || ''}`;
    document.getElementById('logout').onclick = async () => {
      if (HorsLigne.nombre() && !(await ask(`${HorsLigne.nombre()} saisie(s) faite(s) hors connexion n'ont pas encore été envoyées : elles seront perdues. Se déconnecter quand même ?`, 'Se déconnecter'))) return;
      try { await api('POST', '/api/logout'); } catch (e) { if (!HorsLigne.estReseau(e)) throw e; }
      await HorsLigne.effacer(); location.hash = ''; location.reload();
    };
    document.getElementById('remote-refresh').onclick = () => { Modal.close(); this.render(); };
    await Store.load();
    Store.listen();
    Notifs.demarrer();
    await HorsLigne.demarrer();
    this.render();
    if (Store.horsLigne) this.toast('Hors connexion : vous travaillez avec les données gardées sur ce téléphone. Vos saisies partiront au retour du réseau.', 6000);
    window.addEventListener('hashchange', () => { Modal.close(); this.render(); });
  },
};

document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') Modal.close(); });
// Liens et actions déclarés en attributs (aucun gestionnaire inline : la politique de sécurité du contenu les bloque)
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) {
    // Clic sur un lien, un bouton ou un champ placé dans une ligne cliquable : c'est lui qui compte
    const ctrl = e.target.closest('a, button, input, select, textarea, label');
    if (!ctrl || ctrl === go || !go.contains(ctrl)) location.hash = go.dataset.go;
    return;
  }
  if (e.target.closest('[data-print]')) { window.print(); return; }
  const ch = e.target.closest('[data-chiffrage]');
  if (ch) ouvrirChiffrage(ch.dataset.chiffrage);
});
App.start();
