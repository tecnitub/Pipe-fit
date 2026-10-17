// Notifications : cloche de l'appli (synchronisée en temps réel), écran « Notifications », et appli téléphone :
// installation sur l'écran d'accueil (PWA) et notifications du téléphone (Web Push) même appli fermée.
const Notifs = {
  installEvt: null,
  mes() { return Store.all('notifications').filter(n => Store.me.userId && n.userId === Store.me.userId).sort((a, b) => (b.date || '').localeCompare(a.date || '')); },
  nonLues() { return this.mes().filter(n => !n.lu); },
  majCloche() {
    const c = document.getElementById('cloche');
    if (!c) return;
    c.hidden = !Store.me.userId;
    const n = this.nonLues().length, p = c.querySelector('.pastille');
    p.hidden = !n; p.textContent = n > 9 ? '9+' : String(n);
    c.classList.toggle('active', location.hash.startsWith('#/notifications'));
  },
  // Nouvelle notification reçue en direct (autre poste, serveur)
  recu(n) {
    if (n.userId !== Store.me.userId || n.lu) return;
    this.majCloche();
    App.toast(`🔔 ${n.titre}`, 5000);
  },
  marquerLue(n) { if (n && !n.lu) { Store.upsert('notifications', { ...n, lu: true }); this.majCloche(); } },
  toutLire() { this.nonLues().forEach(n => this.marquerLue(n)); },
  // Journées signalées comme modifiées et pas encore vues (mise en avant dans « Mon planning »)
  joursModifies() { return new Set(this.nonLues().filter(n => n.type === 'planning').flatMap(n => n.jours || [])); },

  /* ---------- Appli téléphone ---------- */
  disponible: () => 'serviceWorker' in navigator && window.isSecureContext && !document.body.classList.contains('demo'),
  pushPossible: () => Notifs.disponible() && 'PushManager' in window && 'Notification' in window,
  installee: () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  iphone: () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  appareil() {
    const ua = navigator.userAgent;
    return `${/Android/.test(ua) ? 'Android' : this.iphone() ? 'iPhone / iPad' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Appareil'}${this.installee() ? ' · appli' : ' · navigateur'}`;
  },
  async demarrer() {
    if (!this.disponible()) return;
    try { await navigator.serviceWorker.register('/sw.js'); } catch (e) { return; }
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.type === 'ouvrir') { location.hash = e.data.lien || '#/notifications'; }
    });
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); this.installEvt = e; if (location.hash.startsWith('#/notifications')) App.render(); });
    window.addEventListener('appinstalled', () => { this.installEvt = null; App.toast('Appli installée sur l\'écran d\'accueil'); });
  },
  async abonnement() {
    if (!this.pushPossible()) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  },
  async activer() {
    if (!this.pushPossible()) throw new Error(this.iphone() && !this.installee() ? 'Sur iPhone, ajoutez d\'abord l\'appli à l\'écran d\'accueil, puis ouvrez-la depuis son icône.' : 'Ce navigateur ne gère pas les notifications.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notifications refusées : autorisez-les dans les réglages du téléphone (Pipe-Fit → Notifications).');
    const { publicKey } = await api('GET', '/api/push/cle');
    const reg = await navigator.serviceWorker.ready;
    const cle = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const delai = new Promise((_, ko) => setTimeout(() => ko(new Error('le service de notification du téléphone ne répond pas')), 20000));
      try { sub = await Promise.race([reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cle }), delai]); } catch (e) {
        throw new Error(/permission|denied|NotAllowed/i.test(`${e.name} ${e.message}`) ? 'Le navigateur refuse l\'abonnement : quittez la navigation privée et vérifiez que les notifications de Pipe-Fit sont autorisées.'
          : `Abonnement impossible (${e.message}). Vérifiez la connexion Internet du téléphone.`);
      }
    }
    await api('POST', '/api/push/abonnement', { subscription: sub.toJSON(), appareil: this.appareil() });
  },
  async desactiver() {
    const sub = await this.abonnement();
    if (sub) { await api('DELETE', '/api/push/abonnement', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
  },
};

/* ---------- Écran « Notifications » ---------- */
const iconeNotif = n => ({ planning: '📅', document: '📎' }[n.type] || '🔔');
const ilYa = iso => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  if (m < 24 * 60) return `il y a ${Math.round(m / 60)} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
};
// Bureau : comment équiper les téléphones des compagnons
function carteInstallation() {
  const https = location.protocol === 'https:', demo = document.body.classList.contains('demo');
  const comptes = Store.all('users').filter(u => u.role !== 'charge');
  return `<div class="card">
    <h2 style="margin-top:0">📲 Appli des compagnons</h2>
    <p class="small">Une seule appli, la même que celle du bureau, reliée en temps réel : chaque compagnon voit son planning, pointe sa journée et reçoit une notification sur son téléphone dès que son planning change (même appli fermée).</p>
    ${demo ? '' : `<p class="small"><strong>Adresse à ouvrir sur le téléphone :</strong> <code>${esc(location.origin)}</code>${https ? '' : ' <span class="warn-text">— adresse non sécurisée : l\'installation et les notifications du téléphone demandent HTTPS (voir le guide d\'installation, « Accès depuis l\'extérieur »).</span>'}</p>`}
    <ol class="small" style="margin:0;padding-left:18px">
      <li>Créez un compte « Opérateur » relié à la personne (Paramètres → Comptes utilisateurs).</li>
      <li><strong>Android</strong> : ouvrir l'adresse dans Chrome, se connecter, menu ⋮ → « Installer l'application ». <strong>iPhone</strong> (iOS 16.4 ou plus) : ouvrir dans Safari, Partager → « Sur l'écran d'accueil », puis ouvrir Pipe-Fit depuis son icône.</li>
      <li>Dans l'appli : 🔔 → « Activer les notifications », puis « Envoyer une notification d'essai ».</li>
    </ol>
    <p class="muted small" style="margin-bottom:0">Les changements faits d'un coup (plusieurs jours, toute une équipe) sont regroupés en une seule notification par personne. Un intérimaire sans compte : c'est son chef d'équipe qui est prévenu. ${comptes.length} personne(s) planifiable(s).</p>
  </div>`;
}
Views.notifications = (params, query) => {
  const liste = Notifs.mes(), nl = liste.filter(n => !n.lu).length, bureau = ['admin', 'charge'].includes(Store.me.role);
  return `<h1>Notifications</h1>
  ${bureau && (query && query.get('installer') || !Store.me.userId) ? carteInstallation() : ''}
  <div class="card telephone" id="tel-carte"><p class="muted small" style="margin:0">Vérification de ce téléphone…</p></div>
  ${Store.me.userId ? `<div class="toolbar"><strong>${nl ? `${nl} nouvelle${nl > 1 ? 's' : ''}` : 'Tout est lu'}</strong><span class="spacer"></span>${nl ? '<button class="secondary small" id="nt-lire">Tout marquer comme lu</button>' : ''}</div>
  ${liste.length ? `<ul class="notifs">${liste.slice(0, 60).map(n => `<li class="${n.lu ? '' : 'nouvelle'}" data-n="${n.id}"><span class="nt-ic">${iconeNotif(n)}</span>
    <div><strong>${esc(n.titre)}</strong><div class="small pre">${esc(n.texte || '')}</div><div class="muted small">${ilYa(n.date)}</div></div></li>`).join('')}</ul>`
    : '<p class="muted">Aucune notification pour l\'instant. Vous serez prévenu ici, et sur votre téléphone, dès que votre planning change.</p>'}`
    : '<p class="muted">Ce compte n\'est relié à aucune personne de l\'équipe : il ne reçoit pas de notification de planning.</p>'}`;
};
Views.notifications.bind = root => {
  Notifs.majCloche();
  root.querySelectorAll('[data-n]').forEach(li => li.onclick = () => {
    const n = Store.get('notifications', li.dataset.n);
    Notifs.marquerLue(n);
    location.hash = (n && n.lien) || '#/notifications';
  });
  const tl = root.querySelector('#nt-lire');
  if (tl) tl.onclick = () => { Notifs.toutLire(); App.render(); };
  carteTelephone(root.querySelector('#tel-carte'));
};

// Carte « Ce téléphone » : installer l'appli, activer / tester / couper les notifications
async function carteTelephone(box) {
  if (!box) return;
  if (document.body.classList.contains('demo')) {
    box.innerHTML = `<strong>📲 Appli téléphone</strong><p class="small" style="margin:6px 0 0">Dans la version installée sur votre serveur, chaque compagnon ouvre l'adresse de Pipe-Fit sur son téléphone, l'ajoute à l'écran d'accueil et active les notifications :
      il est prévenu dès que son planning change, même appli fermée. Ici (démonstration), les notifications apparaissent dans la cloche 🔔 : changez le planning de Kevin au bureau, puis passez sur son profil.</p>`;
    return;
  }
  if (!Notifs.disponible()) {
    box.innerHTML = `<strong>📲 Appli téléphone</strong><p class="small" style="margin:6px 0 0">L'installation et les notifications du téléphone demandent une adresse sécurisée (https://…). Demandez à l'administrateur de publier Pipe-Fit en HTTPS (voir le guide d'installation).
      En attendant, les notifications s'affichent dans la cloche 🔔 de l'appli.</p>`;
    return;
  }
  const [sub, cle] = await Promise.all([Notifs.abonnement().catch(() => null), api('GET', '/api/push/cle').catch(() => ({ appareils: [] }))]);
  const perm = 'Notification' in window ? Notification.permission : 'default';
  const iphoneNonInstalle = Notifs.iphone() && !Notifs.installee();
  box.innerHTML = `<strong>📲 Ce téléphone</strong>
    <div class="tel-etapes">
      <div class="${Notifs.installee() ? 'fait' : ''}"><span>1</span> ${Notifs.installee() ? 'Appli installée sur l\'écran d\'accueil' : Notifs.installEvt ? '<button class="small" id="tel-installer">Installer l\'appli sur l\'écran d\'accueil</button>'
        : Notifs.iphone() ? 'Dans Safari : bouton Partager <span aria-hidden="true">⎋</span> → « Sur l\'écran d\'accueil », puis ouvrez Pipe-Fit depuis son icône' : 'Menu du navigateur ⋮ → « Installer l\'application » (ou « Ajouter à l\'écran d\'accueil »)'}</div>
      <div class="${sub ? 'fait' : ''}"><span>2</span> ${sub ? 'Notifications activées sur ce téléphone' : perm === 'denied' ? '<span class="warn-text">Notifications bloquées : autorisez-les dans les réglages du téléphone, puis revenez ici.</span>'
        : `<button class="small" id="tel-activer" ${iphoneNonInstalle ? 'disabled' : ''}>Activer les notifications</button>${iphoneNonInstalle ? ' <span class="muted small">(après l\'étape 1)</span>' : ''}`}</div>
    </div>
    ${sub ? '<div class="toolbar" style="margin:8px 0 0"><button class="secondary small" id="tel-test">Envoyer une notification d\'essai</button><button class="secondary small" id="tel-couper">Couper sur ce téléphone</button></div>' : ''}
    ${(cle.appareils || []).length ? `<p class="muted small" style="margin:8px 0 0">Appareils prévenus pour ce compte : ${cle.appareils.map(a => esc(a.appareil || 'appareil')).join(', ')}</p>` : ''}`;
  const on = (sel, fn) => { const b = box.querySelector(sel); if (b) b.onclick = async () => { b.disabled = true; const t = b.textContent; b.textContent = 'Un instant…'; try { await fn(); } catch (e) { notify(e.message); } b.textContent = t; carteTelephone(box); }; };
  on('#tel-installer', async () => { Notifs.installEvt.prompt(); await Notifs.installEvt.userChoice; Notifs.installEvt = null; });
  on('#tel-activer', async () => { await Notifs.activer(); App.toast('Notifications activées'); });
  on('#tel-test', async () => { const r = await api('POST', '/api/push/test'); App.toast(r.envois.some(x => x.statut >= 200 && x.statut < 300) ? 'Notification d\'essai envoyée' : 'Envoi impossible : le serveur n\'a pas pu joindre le service de notification'); });
  on('#tel-couper', async () => { await Notifs.desactiver(); App.toast('Notifications coupées sur ce téléphone'); });
}
