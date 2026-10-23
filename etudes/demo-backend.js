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
  const pf = { affaires: (seed.affaires || []).map(a => ({ id: a.id, code: a.code, nom: a.nom, clientId: a.clientId, contactId: a.contactId, siteId: a.siteId, chargeId: a.chargeId, statut: a.statut, type: a.type })),
    entreprises: (seed.entreprises || []).map(e => ({ id: e.id, nom: e.nom, regimeTVA: e.regimeTVA })),
    articles: (seed.articles || []).map(a => ({ id: a.id, ref: a.ref, designation: a.designation, famille: a.famille, sousFamille: a.sousFamille, unite: a.unite, prixVente: a.prixVente, coutRevient: a.coutRevient, poidsUnitaire: a.poidsUnitaire })),
    mainoeuvre: (seed.mainoeuvre || []).map(m => ({ id: m.id, code: m.code, libelle: m.libelle, tauxVente: m.tauxVente, tauxCout: m.tauxCout })) };
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
  // Archive ZIP minimale (un fichier, sans compression)
  function zipUnFichier(nom, octets) {
    const crc = (() => { let c = ~0; for (const b of octets) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; })();
    const n = new TextEncoder().encode(nom), en = (taille, champs) => { const v = new DataView(new ArrayBuffer(taille)); champs.forEach(([o, val, l]) => (l === 4 ? v.setUint32(o, val, true) : v.setUint16(o, val, true))); return new Uint8Array(v.buffer); };
    const local = en(30, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x800, 2], [12, 0x21, 2], [14, crc, 4], [18, octets.length, 4], [22, octets.length, 4], [26, n.length, 2]]);
    const central = en(46, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x800, 2], [14, 0x21, 2], [16, crc, 4], [20, octets.length, 4], [24, octets.length, 4], [28, n.length, 2]]);
    const debutCentral = local.length + n.length + octets.length, fin = en(22, [[0, 0x06054b50, 4], [8, 1, 2], [10, 1, 2], [12, central.length + n.length, 4], [16, debutCentral, 4]]);
    const out = new Uint8Array(debutCentral + central.length + n.length + fin.length);
    let p = 0; for (const part of [local, n, octets, central, n, fin]) { out.set(part, p); p += part.length; }
    return out;
  }
  window.ZIP_UN_FICHIER = zipUnFichier;
  // Défini dès le chargement : l'autorisation est demandée au moment du clic (pas de clic sans effet si elle arrive tard)
  if (window.claude && window.claude.use) {
    const dlPromesse = window.claude.use('downloads').catch(() => null);
    window.SAVE_FILE = async (filename, data) => {
      const dl = await dlPromesse;
      if (!dl) throw new Error('Le téléchargement n\'est pas autorisé dans cette vue.');
      // Formats non acceptés par la page publiée (DXF…) : remis dans une archive ZIP
      if (!/\.(pdf|svg|png|jpe?g|csv|xlsx|zip|txt|json|html|docx)$/i.test(filename)) { data = zipUnFichier(filename, data instanceof Uint8Array ? data : new TextEncoder().encode(String(data))); filename = filename.replace(/\.[^.]+$/, '') + '.zip'; }
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
    // Démo : dépôt de note et devis simulés (pas de Pipe-Fit derrière), mémorisés sur l'appareil
    if (p[0] === 'pf' && p[1] === 'document' && method === 'POST') {
      const b = body(); db.envoisPF = db.envoisPF || [];
      const ex = db.envoisPF.find(x => x.genre === 'document' && x.etudeId === b.etudeId);
      if (ex) { ex.indice = b.indice; ex.date = new Date().toISOString(); } else db.envoisPF.push({ genre: 'document', etudeId: b.etudeId, affaireId: b.affaireId, nom: b.nom, indice: b.indice, date: new Date().toISOString() });
      save(); return rep(200, { ok: true, docId: 'demo', indice: b.indice || 'A' });
    }
    if (p[0] === 'pf' && p[1] === 'devis' && method === 'POST') {
      const b = body(); db.envoisPF = db.envoisPF || [];
      const numero = `DV-${new Date().getFullYear()}-${String(90 + db.envoisPF.filter(x => x.genre === 'devis').length).padStart(4, '0')}`;
      db.envoisPF.push({ genre: 'devis', etudeId: b.etudeId, affaireId: b.affaireId, numero, lignes: (b.lignes || []).length, date: new Date().toISOString() }); save();
      return rep(200, { id: `demo-${numero}`, numero });
    }
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
