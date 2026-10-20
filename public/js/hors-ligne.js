// Appli utilisable sans réseau (sous-sol, chaufferie, zone blanche) :
// - les données du compagnon sont gardées sur le téléphone (IndexedDB) et l'appli démarre avec elles hors connexion ;
// - pointages, rapports, notes de frais, fiches fluides, photos et signatures saisis hors ligne attendent dans une file,
//   envoyée dans l'ordre dès le retour du réseau (photos d'abord, avec un identifiant choisi sur le téléphone).
// Tout est effacé à la déconnexion.
const HorsLigne = (() => {
  const BASE = 'pipefit-hors-ligne', VERSION = 1;
  let dbp = null, file = [], envoi = null, minuterie = null;
  const locales = new Map(); // photos en attente : id -> data URL (affichage avant envoi)
  const ouvrir = () => dbp || (dbp = new Promise((ok, ko) => {
    if (!('indexedDB' in window)) return ko(new Error('IndexedDB indisponible'));
    const r = indexedDB.open(BASE, VERSION);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('cache')) d.createObjectStore('cache'); if (!d.objectStoreNames.contains('file')) d.createObjectStore('file', { keyPath: 'cle' }); };
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  }));
  const tx = async (store, mode, fn) => { const d = await ouvrir(); return new Promise((ok, ko) => { const t = d.transaction(store, mode), s = t.objectStore(store); const r = fn(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => ko(t.error); }); };
  const sur = p => p.catch(() => null);

  // Erreur réseau (pas de réponse du serveur), à distinguer d'un refus du serveur
  const estReseau = e => e && !e.status && (e.name === 'TypeError' || e.reseau || /fetch|réseau|network|Failed/i.test(e.message || ''));
  const enLigne = () => navigator.onLine !== false;

  /* ---------- Données gardées sur le téléphone ---------- */
  let attenteSauvegarde = null;
  function sauverDonnees() {
    if (!Store.me || Store.me.role !== 'atelier' || !Store.data) return;
    clearTimeout(attenteSauvegarde);
    attenteSauvegarde = setTimeout(() => sur(tx('cache', 'readwrite', s => s.put({ me: Store.me, data: Store.data, date: new Date().toISOString() }, 'donnees'))), 1500);
  }
  const lireDonnees = () => sur(tx('cache', 'readonly', s => s.get('donnees')));

  /* ---------- File des envois ---------- */
  async function charger() {
    const l = await sur(tx('file', 'readonly', s => s.getAll()));
    file = (l || []).sort((a, b) => a.t - b.t);
    file.filter(o => o.type === 'fichier').forEach(o => locales.set(o.id, o.dataUrl));
    indicateur();
  }
  const cleDe = o => (o.type === 'fichier' ? `f/${o.id}` : `r/${o.col}/${o.id}`);
  async function ajouter(o) {
    o.cle = cleDe(o);
    const ancien = file.find(x => x.cle === o.cle);
    o.t = ancien ? ancien.t : Date.now() + Math.random(); // une modification plus récente garde sa place dans la file
    file = [...file.filter(x => x.cle !== o.cle), o].sort((a, b) => a.t - b.t);
    if (o.type === 'fichier') locales.set(o.id, o.dataUrl);
    await sur(tx('file', 'readwrite', s => s.put(o)));
    indicateur();
    programmer();
  }
  async function retirer(o) {
    file = file.filter(x => x.cle !== o.cle);
    await sur(tx('file', 'readwrite', s => s.delete(o.cle)));
    indicateur();
  }
  const enAttente = (col, id) => file.some(x => x.cle === `r/${col}/${id}`);

  // Envoi de la file, dans l'ordre ; s'arrête à la première coupure réseau
  async function envoyer() {
    if (envoi) return envoi;
    envoi = (async () => {
      let envoyes = 0;
      for (const o of [...file]) {
        try {
          if (o.type === 'fichier') await api('POST', '/api/files', { dataUrl: o.dataUrl, id: o.id });
          else if (o.type === 'delete') await api('DELETE', `/api/records/${o.col}/${encodeURIComponent(o.id)}`);
          else {
            const rec = await api('PUT', `/api/records/${o.col}/${encodeURIComponent(o.id)}`, { data: o.obj, version: o.obj._v });
            const local = Store.get(o.col, o.id);
            if (local) { Object.assign(local, rec); Store._put(o.col, local); }
          }
          if (o.type === 'fichier') locales.delete(o.id);
          await retirer(o); envoyes++;
        } catch (e) {
          if (estReseau(e)) break;
          // Refusé par le serveur (version plus récente, droits, données invalides) : retiré de la file, signalé
          await retirer(o);
          if (e.status === 409 && e.data && e.data.record) Store._put(o.col, e.data.record);
          App.toast(`Une saisie faite hors connexion n'a pas pu être enregistrée : ${e.message}`, 8000);
        }
      }
      if (envoyes) { App.toast(`${envoyes} saisie(s) faite(s) hors connexion envoyée(s)`); sauverDonnees(); if (!file.length) Store.load().then(() => App.remoteUpdate()).catch(() => {}); }
      indicateur();
    })();
    try { await envoi; } finally { envoi = null; }
  }
  function programmer() {
    clearTimeout(minuterie);
    if (file.length) minuterie = setTimeout(() => envoyer().finally(programmer), enLigne() ? 3000 : 20000);
  }

  // Photo ou signature : envoyée tout de suite, ou gardée avec un identifiant choisi ici (le serveur l'accepte tel quel)
  async function envoyerImage(dataUrl) {
    if (enLigne() && !file.length) {
      try { return (await api('POST', '/api/files', { dataUrl })).id; } catch (e) { if (!estReseau(e)) throw e; }
    }
    const a = new Uint8Array(12); crypto.getRandomValues(a);
    const id = Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
    await ajouter({ type: 'fichier', id, dataUrl });
    return id;
  }

  /* ---------- Bandeau ---------- */
  function indicateur() {
    let el = document.getElementById('hors-ligne');
    if (!el) {
      const s = document.querySelector('.session');
      if (!s) return;
      el = document.createElement('button'); el.id = 'hors-ligne'; el.type = 'button'; el.className = 'hors-ligne small';
      el.onclick = () => { if (enLigne()) envoyer(); else App.toast('Pas de réseau : les saisies partiront automatiquement au retour de la connexion.', 4000); };
      s.prepend(el);
    }
    const n = file.filter(o => o.type !== 'fichier').length, f = file.length - n;
    el.hidden = enLigne() && !file.length;
    el.classList.toggle('off', !enLigne());
    el.textContent = !enLigne() ? `📴 Hors ligne${file.length ? ` · ${n} saisie(s)${f ? `, ${f} photo(s)` : ''} en attente` : ''}` : `⏳ ${n} saisie(s)${f ? `, ${f} photo(s)` : ''} à envoyer`;
    el.title = 'Saisies faites sans réseau : elles partent automatiquement dès le retour de la connexion';
  }

  async function demarrer() {
    await charger();
    window.addEventListener('online', () => { indicateur(); envoyer(); });
    window.addEventListener('offline', indicateur);
    programmer();
    if (file.length && enLigne()) envoyer();
  }
  async function effacer() { file = []; locales.clear(); await sur(tx('file', 'readwrite', s => s.clear())); await sur(tx('cache', 'readwrite', s => s.clear())); }

  return { estReseau, enLigne, sauverDonnees, lireDonnees, ajouter, enAttente, envoyer, envoyerImage, demarrer, effacer, indicateur,
    urlLocale: id => locales.get(id) || null, nombre: () => file.length };
})();
