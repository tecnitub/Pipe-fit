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
  // Ouverte depuis la démo du CRM (même appareil) : les chantiers tels que modifiés dans le CRM, et son compte connecté
  const crm = () => { try { const c = window.PIPEFIT_CRM_KEY && JSON.parse(storage.get(window.PIPEFIT_CRM_KEY)); return c && c.settings ? c : null; } catch (e) { return null; } };
  const donneesPf = () => { const src = crm() || seed; return Object.fromEntries(Object.entries(src).filter(([k, v]) => (Array.isArray(v) && k !== 'accounts' && k !== 'audit') || k === 'settings')); };
  const compteCrm = () => {
    const c = crm(); if (!c) return null;
    const a = (c.accounts || []).find(x => x.id === storage.get('pipefit-crm-demo-me')) || (c.accounts || [])[0];
    return a && ['admin', 'charge'].includes(a.role) ? { login: a.login, nom: a.nom, role: a.role } : null;
  };
  let db;
  try { db = JSON.parse(storage.get(KEY)); } catch (e) { db = null; }
  if (!db || !Array.isArray(db.does)) db = { does: [], fichiers: {}, config: {} };
  const save = () => { if (!storage.set(KEY, JSON.stringify(db))) console.warn('Stockage local plein : les pièces jointes restent en mémoire.'); };
  const me = () => COMPTES.find(c => c.login === storage.get(ME_KEY)) || (storage.get(ME_KEY) === 'deconnecte' ? null : compteCrm());
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
    if (p[0] === 'logout') { storage.set(ME_KEY, 'deconnecte'); return rep(200, { ok: true }); }
    if (p[0] === 'me') return rep(200, { ...s, pipefit: window.parent === window ? window.PIPEFIT_CRM_URL || '' : '' });
    if (p[0] === 'pf' && p[1] === 'donnees') return rep(200, donneesPf());
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
  window.FICHIER_URL = f => versBlobUrl(f.src === 'pf' ? ((crm() || {}).files || seed.files || {})[f.id] : (db.fichiers[f.id] || {}).dataUrl);
  window.ENVOI_FICHIER = file => new Promise((res, rej) => {
    if (file.size > 8 * 1048576) return rej(new Error('Fichier trop volumineux pour la démo (8 Mo max)'));
    const r = new FileReader();
    r.onload = () => { const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
      db.fichiers[id] = { nom: file.name, mime: file.type, dataUrl: r.result }; save(); res({ src: 'doe', id, nom: file.name, mime: file.type || '' }); };
    r.onerror = () => rej(new Error('Lecture du fichier impossible'));
    r.readAsDataURL(file);
  });
  // PDF du DOE : dans le cadre de la démo du CRM, enregistré par la page du CRM (autorisation « downloads ») ;
  // ouverte seule, par l'autorisation de cette page si elle l'a, sinon lien de téléchargement du navigateur
  if (window.parent !== window) {
    window.SAVE_FILE = async (nom, data) => {
      const octets = data instanceof Blob ? await data.arrayBuffer() : typeof data === 'string' ? new TextEncoder().encode(data).buffer : data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
      window.parent.postMessage({ type: 'pipefit-doe-enregistrer', nom: String(nom), data: octets }, '*', [octets]);
    };
  }
  if (!window.SAVE_FILE && window.claude && window.claude.use) {
    window.claude.use('downloads').then(dl => { if (dl) window.SAVE_FILE = (filename, data) => dl.save({ filename, data: new Blob([data]) }).catch(() => {}); }).catch(() => {});
  }
  // CCTP d'exemple (démonstration) : PDF fabriqué sur l'appareil pour essayer la lecture du CCTP et l'étude
  window.CCTP_EXEMPLE = async () => {
    const a = (donneesPf().affaires || []).find(x => location.hash.includes(x.id)) || {};
    const p = t => `<p>${t}</p>`;
    const html = [
      `<h1>${a.nom || 'Résidence Les Tilleuls – rénovation de la chaufferie'}</h1>`, p('CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES'), p('LOT N° 14 – CHAUFFAGE VENTILATION PLOMBERIE'),
      p('Indice B du 12/03/2026'), p('Affaire n° 26-118'), p(`Maître d'ouvrage : ${((donneesPf().entreprises || []).find(e => e.id === a.clientId) || {}).nom || 'Office public de l\'habitat'}`), p('BET Fluides : Ingérop Conseil'),
      p('1.1 Objet du présent CCTP'), p('Le présent document définit les travaux du lot chauffage, ventilation, plomberie.'),
      p('1.2 Normes et réglementation'), p('Les travaux sont conformes aux DTU 65.11, 60.1 et 68.3.'),
      p('3.1 Pompe à chaleur air / eau'), p('Fourniture et pose d\'une pompe à chaleur repère PAC-01 de marque Daikin type EWYT 045 ou équivalent, puissance calorifique 45 kW.'),
      p('3.2 Chaudières gaz à condensation'), p('Deux chaudières CH-01 et CH-02 de marque Viessmann type Vitocrossal 200 ou équivalent, 90 kW chacune.'),
      p('3.3 Circulateurs'), p('Circulateurs à vitesse variable repères P-01, P-02, P-03 et P-04, marque Grundfos type Magna3 ou équivalent.'),
      p('3.4 Vase d\'expansion'), p('Vase d\'expansion à membrane VE-01, 300 litres.'),
      p('3.5 Pot de décantation et filtre magnétique'), p('Désembouage du circuit primaire, quantité : 1.'),
      p('3.6 Radiateurs'), p('Remplacement des radiateurs des parties communes, 24 unités, robinets thermostatiques.'),
      p('4.1 Ventilation mécanique contrôlée'), p('Caisson d\'extraction VMC-01 basse consommation, débit 2 400 m3/h, marque Aldes ou équivalent.'),
      p('5.1 Production d\'eau chaude sanitaire'), p('Ballon de stockage BAL-01 de 1 000 litres avec échangeur.'),
      p('5.2 Disconnecteur'), p('Disconnecteur à zone de pression réduite contrôlable DIS-01 sur l\'appoint.'),
      p('6.1 Calorifugeage'), p('Calorifugeage des réseaux en chaufferie, classe 4.'),
      p('7.1 Essais et mise en service'), p('Essais de pression des réseaux à 1,5 fois la pression de service, équilibrage, mise en service des générateurs.'),
      p('7.2 Dossier des ouvrages exécutés'), p('Remise du DOE en trois exemplaires papier et un exemplaire numérique.'),
    ].join('');
    const bytes = await PDF.depuisHTML(html, 'CCTP lot 14');
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
    db.fichiers[id] = { nom: 'CCTP lot 14 indice B.pdf', mime: 'application/pdf', dataUrl: `data:application/pdf;base64,${btoa(bin)}` }; save();
    return { src: 'doe', id, nom: 'CCTP lot 14 indice B.pdf', mime: 'application/pdf' };
  };
})();
