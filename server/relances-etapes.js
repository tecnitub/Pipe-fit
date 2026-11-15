// Relances des étapes des études (suivi des étapes, etudes/public/js/suivi-etapes.js) : échéance dans deux jours ou
// dépassée, étape qui en bloque une autre affectée à quelqu'un d'autre. Lu dans l'avancement mis en cache dans le résumé
// de chaque étude (liens_apps), une notification par personne (cloche de l'appli et téléphone), une seule fois par étape,
// échéance et état (mémoire dans la table config, clé « relances-etapes »).
// E-mail : un récapitulatif par personne et par jour au plus (Microsoft 365, adresse d'envoi « Relances des étapes »),
// relances de la journée mises en attente (clé « relances-etapes-mail »), désinscription par personne (« etapes-prefs »).
// Étape affectée au rôle « compagnon » : les compagnons prévus au planning du chantier (le chargé d'affaires sinon).
// Contrôle aussi à la connexion (au plus toutes les 10 minutes).
const SuiviEtapes = require('../etudes/public/js/suivi-etapes');
const AdressesEnvoi = require('../public/js/adresses-envoi');
const Push = require('./push');
const M365 = require('./m365');

const MAX_ATTENTE = 80, GARDE_ATTENTE_JOURS = 7, ECART_CONNEXION_MS = 10 * 60e3;

function creer({ DB, db, LIENS, NOTIFS, recordsDe }) {
  const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const comptes = () => db.prepare('SELECT id, user_id, role, nom, email FROM accounts').all();
  const lireConfig = (k, d) => { const r = db.prepare('SELECT value FROM config WHERE key = ?').get(k); try { return r ? JSON.parse(r.value) : d; } catch (e) { return d; } };
  const ecrireConfig = (k, v) => db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
  const tous = col => (recordsDe ? recordsDe(col) : db.prepare('SELECT data FROM records WHERE col = ?').all(col).map(r => JSON.parse(r.data)));
  // Compagnons (comptes de terrain) prévus au planning du chantier
  const planifies = (affaireId, cs) => {
    if (!affaireId) return [];
    const ids = new Set(tous('planning').filter(x => x.affaireId === affaireId && x.userId).map(x => x.userId));
    return cs.filter(c => c.role === 'atelier' && c.user_id && ids.has(c.user_id)).map(c => c.user_id);
  };
  // Personnes à prévenir pour un responsable : la personne (ou son chef d'équipe sans compte), les compagnons au planning
  // du chantier pour le rôle compagnon (sinon le chargé d'affaires), le chargé d'affaires pour le conducteur de travaux,
  // les comptes du bureau pour le BE, les administrateurs
  function destinataires(r, affaire, cs) {
    if (!r) return [];
    if (r.type === 'user') {
      if (cs.some(c => c.user_id === r.id)) return [r.id];
      const u = DB.getRecord(db, 'users', r.id);
      return u && u.chefId && cs.some(c => c.user_id === u.chefId) ? [u.chefId] : [];
    }
    if (r.role === 'compagnon') { const p = planifies(affaire && affaire.id, cs); if (p.length) return [...new Set(p)]; }
    if (r.role === 'conducteur' || r.role === 'compagnon') return affaire && affaire.chargeId ? [affaire.chargeId] : cs.filter(c => c.role === 'admin').map(c => c.user_id);
    if (r.role === 'be') return cs.filter(c => c.role === 'charge').map(c => c.user_id);
    if (r.role === 'admin') return cs.filter(c => c.role === 'admin').map(c => c.user_id);
    return [];
  }
  const relancesDues = (today, deja = {}) => SuiviEtapes.relances(LIENS.liste({ app: 'etudes' }), { today, deja, terrain: LIENS.etapesTerrain() });
  const avecCode = (x, a) => ({ ...x, code: a ? a.code || '' : '' });

  /* ---------- Préférences (par personne) ---------- */
  const prefs = () => lireConfig('etapes-prefs', {});
  const preference = userId => ({ email: true, ...((prefs()[userId]) || {}) });
  function choisirPreference(userId, p) {
    if (!userId) throw Object.assign(new Error('Compte sans fiche de l\'équipe'), { status: 400 });
    const t = prefs();
    t[userId] = { ...(t[userId] || {}), email: p && p.email !== undefined ? !!p.email : true, le: new Date().toISOString() };
    ecrireConfig('etapes-prefs', t);
    return { email: t[userId].email };
  }

  /* ---------- Récapitulatif quotidien par e-mail ---------- */
  const m365Pret = () => { const c = DB.getConfig(db, 'm365'); return !!(c && c.actif && c.tenantId && c.clientId && c.clientSecret); };
  // Adresses complètes des écrans (CRM : PIPEFIT_PUBLIC_URL ; Études : réglage « etudesUrl » du CRM)
  const base = v => (/^https?:\/\//i.test(String(v || '').trim()) ? String(v).trim().replace(/\/+$/, '') : '');
  function liensMail(bureau) {
    const crm = base(process.env.PIPEFIT_PUBLIC_URL), etudes = base((DB.getSettings(db) || {}).etudesUrl);
    return { etapes: crm ? `${crm}/#${bureau ? '/etapes' : '/pointage/chantiers'}` : '', preferences: crm ? `${crm}/#${bureau ? '/etapes?preferences=1' : '/pointage/chantiers?preferences=1'}` : '',
      etude: bureau && etudes ? id => `${etudes}/#/etude/${encodeURIComponent(id)}` : null, chantier: crm ? id => `${crm}/#${bureau ? `/chantier/${encodeURIComponent(id)}` : `/pointage/chantier/${encodeURIComponent(id)}`}` : null };
  }
  // attente : { userId: { dernier: jour du dernier envoi, items: [relance] } } ; envoyées si le jour a changé
  async function envoyerMails(today, ajouts = new Map()) {
    const attente = lireConfig('relances-etapes-mail', {}), cs = comptes();
    for (const [uid, l] of ajouts) {
      const a = attente[uid] = attente[uid] || { dernier: '', items: [] };
      l.forEach(x => { if (!a.items.some(y => y.cle === x.cle)) a.items.push({ cle: x.cle, type: x.type, texte: String(x.texte || '').slice(0, 300), etudeId: x.etudeId || '', affaireId: x.affaireId || '', etapeId: x.etapeId || '', code: x.code || '', jour: today }); });
    }
    let envoyes = 0;
    const pret = m365Pret(), cfgM = DB.getConfig(db, 'm365'), soc = ((DB.getSettings(db) || {}).societe || '').split('\n')[0];
    const restes = new Set(), terrain = new Set(LIENS.etapesTerrain().map(t => `${t.etudeId}|${t.etapeId}`));
    LIENS.liste({ app: 'etudes' }).forEach(l => (((l.resume || {}).avancement || {}).restes || []).forEach(r => restes.add(`${l.id}|${r.id}`)));
    for (const uid of Object.keys(attente)) {
      const a = attente[uid];
      // Étapes faites entre-temps et relances trop anciennes retirées
      a.items = (a.items || []).filter(x => (!x.etapeId || (restes.has(`${x.etudeId}|${x.etapeId}`) && !terrain.has(`${x.etudeId}|${x.etapeId}`))) && (Date.parse(today) - Date.parse(x.jour || today)) <= GARDE_ATTENTE_JOURS * 86400000).slice(-MAX_ATTENTE);
      const compte = cs.find(c => c.user_id === uid && c.email);
      if (!a.items.length || a.dernier === today) continue;
      if (!compte || !preference(uid).email) { a.items = []; continue; }
      if (!pret) continue;
      const exp = AdressesEnvoi.pour(DB.getConfig(db, 'mail-adresses'), 'relance-etapes', '');
      const expediteur = exp.expediteur || String(((DB.getSettings(db) || {}).doc || {}).email || '').trim().toLowerCase();
      if (!expediteur) continue;
      const bureau = ['admin', 'charge'].includes(compte.role), m = SuiviEtapes.mailRelances({ nom: compte.nom || '', items: a.items, liens: liensMail(bureau), societe: soc, today });
      try {
        await M365.envoyer(cfgM, expediteur, { to: [compte.email], cc: [], bcc: exp.bcc || [], replyTo: exp.repondreA ? [exp.repondreA] : [], subject: m.sujet, html: m.html, attachments: [] });
        DB.audit(db, 'pipe-fit', 'relances des étapes par e-mail', 'users', uid, `${a.items.length} étape(s) — ${compte.email}`);
        Object.assign(a, { dernier: today, items: [] }); envoyes++;
      } catch (e) { console.error('Relances des étapes (e-mail) :', e.message); }
    }
    Object.keys(attente).forEach(uid => { if (!attente[uid].items.length && attente[uid].dernier && attente[uid].dernier !== today) delete attente[uid]; });
    ecrireConfig('relances-etapes-mail', attente);
    return envoyes;
  }

  // Contrôles à la suite (périodique, connexion) : jamais deux à la fois, pas de relance en double
  let file = Promise.resolve();
  function verifier(today = aujourdhui()) {
    const p = file.then(() => controler(today));
    file = p.catch(() => {});
    return p;
  }
  async function controler(today) {
    const deja = SuiviEtapes.purgerDeja(lireConfig('relances-etapes', {}), today);
    const liste = relancesDues(today, deja);
    const cs = comptes(), parPersonne = new Map();
    liste.forEach(x => {
      const a = x.affaireId ? DB.getRecord(db, 'affaires', x.affaireId) : null;
      [...new Set(destinataires(x.responsable, a, cs).filter(Boolean))].forEach(uid => { if (!parPersonne.has(uid)) parPersonne.set(uid, []); parPersonne.get(uid).push(avecCode(x, a)); });
      deja[x.cle] = today;
    });
    const doc = (DB.getSettings(db).doc || {}), sujet = doc.email ? `mailto:${doc.email}` : undefined;
    for (const [uid, l] of parPersonne) {
      const bureau = cs.some(c => c.user_id === uid && ['admin', 'charge'].includes(c.role)), retard = l.some(x => x.type === 'retard');
      const titre = `${retard ? '⏰' : '🔔'} ${l.length === 1 ? `Étape ${l[0].type === 'retard' ? 'en retard' : l[0].type === 'bloque' ? 'qui bloque' : 'à échéance'}` : `${l.length} étapes à suivre`}${l[0].code && l.every(x => x.code === l[0].code) ? ` — ${l[0].code}` : ''}`;
      const texte = l.map(x => `${x.code ? `${x.code} · ` : ''}${x.texte}`).join('\n').slice(0, 1500);
      const lien = bureau ? '#/etapes' : l[0].affaireId ? `#/pointage/chantier/${l[0].affaireId}` : '#/pointage/chantiers';
      NOTIFS.enregistrer({ type: 'etape', userId: uid, affaireId: l[0].affaireId || '', titre, texte, lien, date: new Date().toISOString(), lu: false });
      await Push.envoyer(DB, db, cs.filter(c => c.user_id === uid).map(c => c.id), { titre, texte, lien, tag: 'etapes' }, sujet).catch(e => console.error('Notification :', e.message));
    }
    if (liste.length) ecrireConfig('relances-etapes', deja);
    await envoyerMails(today, parPersonne).catch(e => console.error('Relances des étapes (e-mail) :', e.message));
    return liste.length;
  }
  // Ouverture d'une session : relances dues traitées sans attendre le contrôle périodique (au plus toutes les 10 minutes)
  let derniereConnexion = 0;
  function aLaConnexion() {
    if (Date.now() - derniereConnexion < ECART_CONNEXION_MS) return false;
    derniereConnexion = Date.now();
    setImmediate(() => verifier().catch(e => console.error('Relances des étapes :', e.message)));
    return true;
  }
  // Étapes qui attendent la personne aujourd'hui (retard, échéance proche, blocage), relancées ou non : affichées à
  // l'ouverture de sa session. Un compagnon ne reçoit que les siennes (champs limités).
  function duesPour(acc, today = aujourdhui()) {
    if (!acc || !acc.user_id) return [];
    const cs = comptes();
    return relancesDues(today, {}).filter(x => destinataires(x.responsable, x.affaireId ? DB.getRecord(db, 'affaires', x.affaireId) : null, cs).includes(acc.user_id))
      .map(x => { const a = x.affaireId ? DB.getRecord(db, 'affaires', x.affaireId) : null; return { type: x.type, etudeId: x.etudeId, affaireId: x.affaireId, etapeId: x.etapeId, titre: x.titre || '', echeance: x.echeance || '', texte: x.texte, code: a ? a.code || '' : '' }; });
  }
  return { verifier, destinataires, envoyerMails, aLaConnexion, duesPour, preference, choisirPreference, liensMail };
}

module.exports = { creer };
