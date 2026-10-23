// Démo de l'application Études sans serveur : simule l'API (connexion par les comptes Pipe-Fit de démonstration,
// affaires, études versionnées, réglages). Les études restent sur l'appareil (localStorage).
(function () {
  const KEY = 'pipefit-etudes-demo-v1', ME_KEY = 'pipefit-etudes-demo-me';
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
  const pf = { affaires: (seed.affaires || []).map(a => ({ id: a.id, code: a.code, nom: a.nom, clientId: a.clientId, statut: a.statut, type: a.type })),
    entreprises: (seed.entreprises || []).map(e => ({ id: e.id, nom: e.nom })) };
  const af = pf.affaires.find(a => a.type !== 'horsDevis') || {};
  // Étude d'exemple : distribution vapeur et eau chaude d'un atelier
  const exemple = () => ({
    id: 'demo-etude-1', objet: 'Chaufferie vapeur atelier — distribution vapeur et réseau eau chaude', affaireId: af.id || '', client: ((pf.entreprises.find(e => e.id === af.clientId)) || {}).nom || '',
    indice: 'B', date: new Date().toISOString().slice(0, 10), auteur: 'Jacky (bureau d\'études)', verificateur: 'Claire Martin', motifIndice: 'Débit vapeur porté à 1 800 kg/h',
    description: 'CCTP lot 14 indice C, plans de principe PID-CH-001 indice B.', historique: [{ indice: 'A', date: '2026-09-15', motif: 'Première émission' }],
    notes: [
      { id: 'n1', type: 'vapeur', titre: 'Collecteur vapeur 7 bar → ateliers', entrees: { p: 7, mode: 'debit', m: 1800, serie: 'acier-10216', L: 95, zeta: 9, vmax: 25, dpmax: 0.5, pc: 0.5, vflash: 15 }, commentaire: 'Purges de ligne tous les 40 m, poches de purge DN 80.' },
      { id: 'n2', type: 'reseau', titre: 'Boucle eau chaude 80/60 °C — pompe P1', entrees: {}, commentaire: '' },
      { id: 'n3', type: 'vase', titre: 'Vase d\'expansion boucle eau chaude', entrees: {}, commentaire: '' },
      { id: 'n4', type: 'isolation', titre: 'Isolation de la ligne vapeur DN 80', entrees: { serie: 'acier-10216', tube: '88.9x3.2', Tf: 170, L: 95, heures: 4000, Ta: 15, HR: 60, vent: 0, isolant: 'laine-roche', revetement: 'alu', qmax: 60, TsMax: 50, margeRosee: 1 }, commentaire: '' },
      { id: 'n5', type: 'dilatation', titre: 'Lyres de la ligne vapeur', entrees: { serie: 'acier-10216', tube: '88.9x3.2', L: 45, Tpose: 10, Tmin: 5, Tmax: 170 }, commentaire: '' },
    ], _v: 1, _at: new Date().toISOString(), _by: 'Jacky (bureau d\'études)',
  });
  let db;
  try { db = JSON.parse(storage.get(KEY)); } catch (e) { db = null; }
  if (!db || !Array.isArray(db.etudes)) db = { etudes: [exemple()], config: {} };
  const save = () => { if (!storage.set(KEY, JSON.stringify(db))) console.warn('Stockage local indisponible : les études restent en mémoire.'); };
  const me = () => COMPTES.find(c => c.login === storage.get(ME_KEY));
  const config = () => ({ ...CONFIG_DEFAUT, ...db.config, societe: { ...CONFIG_DEFAUT.societe, ...(db.config.societe || {}) } });
  const rep = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  const err = (status, error, extra) => rep(status, { error, ...(extra || {}) });

  // Téléchargement du PDF : autorisation « downloads » de la page publiée ; sinon téléchargement classique du navigateur
  // Défini dès le chargement : l'autorisation est demandée au moment du clic (pas de clic sans effet si elle arrive tard)
  if (window.claude && window.claude.use) {
    const dlPromesse = window.claude.use('downloads').catch(() => null);
    window.SAVE_FILE = async (filename, data) => {
      const dl = await dlPromesse;
      if (!dl) throw new Error('Le téléchargement n\'est pas autorisé dans cette vue.');
      try { await dl.save({ filename, data: data instanceof Uint8Array ? data.slice(0) : data }); return 'ok'; }
      catch (e) {
        if (e && e.code === 'declined') return 'refuse';
        throw new Error(e && e.code === 'rate_limited' ? 'Une demande de téléchargement est déjà ouverte : réessayez dans un instant.' : `Téléchargement impossible (${(e && (e.message || e.code)) || 'erreur inconnue'}).`);
      }
    };
  }

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
    if (p[0] === 'pf' && p[1] === 'affaires') return rep(200, pf);
    if (p[0] === 'etudes' && !p[1]) return rep(200, db.etudes.slice().sort((x, y) => y._at.localeCompare(x._at)));
    if (p[0] === 'etudes') {
      const i = db.etudes.findIndex(d => d.id === p[1]), exist = db.etudes[i];
      if (method === 'GET') return exist ? rep(200, exist) : err(404, 'Étude introuvable');
      if (method === 'DELETE') { if (exist) db.etudes.splice(i, 1); save(); return rep(200, { ok: true }); }
      const { data, version } = body();
      if (!data || !String(data.objet || '').trim() || !Array.isArray(data.notes)) return err(400, 'Données manquantes (objet de l\'étude, notes)');
      if (exist && version !== exist._v) return err(409, `Modifiée entre-temps par ${exist._by}`, { record: exist });
      const propre = Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith('_') && k !== 'id'));
      const rec = { ...propre, id: p[1], _v: exist ? exist._v + 1 : 1, _at: new Date().toISOString(), _by: s.nom };
      if (exist) db.etudes[i] = rec; else db.etudes.push(rec);
      save(); return rep(200, rec);
    }
    if (p[0] === 'config') {
      if (method === 'GET') return rep(200, config());
      if (s.role !== 'admin') return err(403, 'Réservé à l\'administrateur');
      const b = body(); db.config = { ...db.config, ...b }; save(); return rep(200, config());
    }
    return err(404, 'Route inconnue');
  };
})();
