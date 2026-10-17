// Démo de l'application DOE sans serveur : simule l'API (connexion par les comptes Pipe-Fit de démonstration,
// données des chantiers, dossiers versionnés, pièces jointes). Les dossiers restent sur l'appareil (localStorage).
(function () {
  const KEY = 'pipefit-doe-demo-v1', ME_KEY = 'pipefit-doe-demo-me';
  const COMPTES = [
    { login: 'jacky', nom: 'Jacky (bureau d\'études)', role: 'charge' },
    { login: 'claire', nom: 'Claire Martin', role: 'charge' },
    { login: 'admin', nom: 'Administrateur', role: 'admin' },
    { login: 'kevin', nom: 'Kevin Roux (soudeur)', role: 'atelier' },
  ];
  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* stockage indisponible */ } },
  };
  const seed = DemoSeed.demoData();
  const pf = Object.fromEntries(Object.entries(seed).filter(([k, v]) => Array.isArray(v) || k === 'settings'));
  let db;
  try { db = JSON.parse(storage.get(KEY)); } catch (e) { db = null; }
  if (!db || !Array.isArray(db.does)) db = { does: [], fichiers: {}, config: {} };
  const save = () => { if (!storage.set(KEY, JSON.stringify(db))) console.warn('Stockage local plein : les pièces jointes restent en mémoire.'); };
  const me = () => COMPTES.find(c => c.login === storage.get(ME_KEY));
  const config = () => ({ ...CONFIG_DEFAUT, ...db.config, societe: { ...CONFIG_DEFAUT.societe, ...(db.config.societe || {}) } });
  const rep = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  const err = (status, error, extra) => rep(status, { error, ...(extra || {}) });

  const vraiFetch = window.fetch.bind(window);
  window.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!u.startsWith('/api/')) return vraiFetch(url, opts);
    const method = (opts.method || 'GET').toUpperCase(), p = u.split('?')[0].split('/').slice(2).map(decodeURIComponent);
    const body = () => JSON.parse(opts.body || '{}');
    if (p[0] === 'login' && method === 'POST') {
      const b = body(), c = COMPTES.find(x => x.login === String(b.login || '').trim().toLowerCase());
      if (!c || !b.password) return err(401, 'Identifiant ou mot de passe incorrect');
      if (!['admin', 'charge'].includes(c.role)) return err(403, 'Application réservée au bureau (administrateur, chargé d\'affaires)');
      storage.set(ME_KEY, c.login); return rep(200, c);
    }
    const s = me();
    if (!s) return err(401, 'Non connecté');
    if (p[0] === 'logout') { storage.del(ME_KEY); return rep(200, { ok: true }); }
    if (p[0] === 'me') return rep(200, { ...s, pipefit: '' });
    if (p[0] === 'pf' && p[1] === 'donnees') return rep(200, pf);
    if (p[0] === 'does' && !p[1]) return rep(200, db.does.slice().sort((x, y) => y._at.localeCompare(x._at)));
    if (p[0] === 'does') {
      const i = db.does.findIndex(d => d.id === p[1]), exist = db.does[i];
      if (method === 'GET') return exist ? rep(200, exist) : err(404, 'Dossier introuvable');
      if (method === 'DELETE') { if (exist) db.does.splice(i, 1); save(); return rep(200, { ok: true }); }
      const { data, version } = body();
      if (!data || !data.affaireId) return err(400, 'Données manquantes');
      if (exist && version !== exist._v) return err(409, `Modifié entre-temps par ${exist._by}`, { record: exist });
      if (!exist && db.does.some(d => d.affaireId === data.affaireId)) return err(409, 'Ce chantier a déjà un DOE');
      const propre = Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith('_') && k !== 'id'));
      const rec = { ...propre, id: p[1], _v: exist ? exist._v + 1 : 1, _at: new Date().toISOString(), _by: s.nom };
      if (exist) db.does[i] = rec; else db.does.push(rec);
      save(); return rep(200, rec);
    }
    if (p[0] === 'config') {
      if (method === 'GET') return rep(200, config());
      if (s.role !== 'admin') return err(403, 'Réservé à l\'administrateur');
      const b = body(); db.config = { ...db.config, ...b }; save(); return rep(200, config());
    }
    return err(404, 'Route inconnue');
  };

  // Pièces jointes : stockées en data URL ; affichées via des URL blob
  const blobs = new Map();
  const versBlobUrl = dataUrl => {
    if (!dataUrl) return '#';
    if (!blobs.has(dataUrl)) {
      const [tete, b64] = dataUrl.split(','), mime = (/data:([^;]+)/.exec(tete) || [])[1] || 'application/octet-stream';
      const bin = atob(b64), a = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      blobs.set(dataUrl, URL.createObjectURL(new Blob([a], { type: mime })));
    }
    return blobs.get(dataUrl);
  };
  window.FICHIER_URL = f => versBlobUrl(f.src === 'pf' ? (seed.files || {})[f.id] : (db.fichiers[f.id] || {}).dataUrl);
  window.ENVOI_FICHIER = file => new Promise((res, rej) => {
    if (file.size > 8 * 1048576) return rej(new Error('Fichier trop volumineux pour la démo (8 Mo max)'));
    const r = new FileReader();
    r.onload = () => { const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
      db.fichiers[id] = { nom: file.name, mime: file.type, dataUrl: r.result }; save(); res({ src: 'doe', id, nom: file.name, mime: file.type || '' }); };
    r.onerror = () => rej(new Error('Lecture du fichier impossible'));
    r.readAsDataURL(file);
  });
})();
