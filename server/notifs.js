// Notifications de planning : chaque changement d'affectation d'un compagnon (aujourd'hui ou plus tard) est
// regroupé quelques secondes (le bureau planifie souvent plusieurs jours d'un coup), puis une notification est
// enregistrée (cloche de l'appli, synchronisée en temps réel) et envoyée sur ses téléphones (Web Push).
// Un intérimaire sans compte : c'est son chef d'équipe qui est prévenu.
const crypto = require('node:crypto');
const Push = require('./push');
const NotifPlanning = require('../public/js/notif-planning');
const Compagnon = require('../public/js/compagnon');
const Echeances = require('../public/js/echeances');
const Fluides = require('../public/js/fluides');
const Derive = require('../public/js/derive');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Calculs de chantier du navigateur (calc.js), exécutés à part sur une copie des données
const CALC_SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'calc.js'), 'utf8') + '\nthis.Calc = Calc;';
function calcSur(tous, settings) {
  const cache = {}, Store = { data: { settings }, all: c => cache[c] || (cache[c] = tous(c)), get: (c, id) => Store.all(c).find(x => x.id === id) };
  const ctx = vm.createContext({ Store });
  vm.runInContext(CALC_SRC, ctx);
  return ctx.Calc;
}

const DELAI = () => Math.max(0, parseInt(process.env.NOTIF_DELAI_MS || '20000', 10));
const CONSERVATION_JOURS = 60;

function creer({ DB, db, broadcast }) {
  const attente = new Map(); // userId -> { jours: Set, timer }
  const lire = (col, id) => DB.getRecord(db, col, id);
  const tous = col => db.prepare('SELECT data FROM records WHERE col = ?').all(col).map(r => JSON.parse(r.data));
  const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const comptesDe = userId => db.prepare('SELECT id, user_id FROM accounts WHERE user_id = ?').all(userId);

  function enregistrer(obj) {
    const id = crypto.randomBytes(8).toString('hex'), now = new Date().toISOString();
    db.prepare('INSERT INTO records (col, id, data, version, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)').run('notifications', id, JSON.stringify({ ...obj, id }), now, 'Pipe-Fit');
    const record = DB.getRecord(db, 'notifications', id);
    broadcast('change', { col: 'notifications', record, client: null });
    return record;
  }
  function purger() {
    const limite = new Date(Date.now() - CONSERVATION_JOURS * 86400000).toISOString();
    tous('notifications').filter(n => (n.date || '') < limite).forEach(n => db.prepare("DELETE FROM records WHERE col = 'notifications' AND id = ?").run(n.id));
  }

  async function envoyer(userId) {
    const a = attente.get(userId);
    attente.delete(userId);
    if (!a) return;
    const user = lire('users', userId);
    if (!user) return;
    // Destinataires : la personne si elle a un compte, sinon son chef d'équipe
    let dest = comptesDe(userId), pourChef = false;
    if (!dest.length && user.chefId) { dest = comptesDe(user.chefId); pourChef = true; }
    if (!dest.length) return;
    const planning = tous('planning').filter(p => p.userId === userId);
    const m = NotifPlanning.message({ user, jours: [...a.jours], planning, affaire: id => lire('affaires', id), pourChef });
    purger();
    const destinataire = dest[0].user_id;
    enregistrer({ type: 'planning', userId: destinataire, pour: userId, titre: m.titre, texte: m.texte, lien: m.lien, jours: m.jours, date: new Date().toISOString(), lu: false });
    const doc = (DB.getSettings(db).doc || {});
    await Push.envoyer(DB, db, dest.map(c => c.id), { titre: m.titre, texte: m.texte, lien: m.lien, tag: m.tag }, doc.email ? `mailto:${doc.email}` : undefined)
      .catch(e => console.error('Notification :', e.message));
  }

  // Appelé après chaque création / modification / suppression d'une affectation du planning
  function planningModifie(acc, avant, apres) {
    if (!NotifPlanning.change(avant, apres)) return;
    const auj = aujourdhui();
    [avant, apres].filter(Boolean).forEach(p => {
      if (!p.userId || !p.date || p.date < auj || p.userId === acc.user_id) return;
      const a = attente.get(p.userId) || { jours: new Set() };
      a.jours.add(p.date);
      clearTimeout(a.timer);
      a.timer = setTimeout(() => envoyer(p.userId).catch(e => console.error('Notification :', e.message)), DELAI());
      if (a.timer.unref) a.timer.unref();
      attente.set(p.userId, a);
    });
  }
  /* ---------- Documents transmis aux compagnons (plans, fiches techniques) ---------- */
  const attenteDocs = new Map(); // affaireId -> { docs: Map(id -> doc), timer }
  const cleDoc = d => `${d.nom}|${d.indice || ''}|${d.fichierId}`;
  async function envoyerDocs(affaireId) {
    const a = attenteDocs.get(affaireId);
    attenteDocs.delete(affaireId);
    const af = lire('affaires', affaireId);
    if (!a || !af || !Compagnon.regles(DB.getSettings(db)).documents) return;
    // Destinataires : les compagnons planifiés sur le chantier aujourd'hui ou plus tard (le chef d'équipe pour un intérimaire sans compte)
    const auj = aujourdhui(), users = [...new Set(tous('planning').filter(p => p.affaireId === affaireId && p.date && p.date >= auj).map(p => p.userId))];
    const dest = new Map();
    users.forEach(uid => {
      let comptes = comptesDe(uid);
      if (!comptes.length) { const u = lire('users', uid); if (u && u.chefId) comptes = comptesDe(u.chefId); }
      comptes.forEach(c => dest.set(c.id, c.user_id));
    });
    if (!dest.size) return;
    const docs = [...a.docs.values()], n = docs.length;
    const m = { titre: `📎 ${n > 1 ? `${n} nouveaux documents` : 'Nouveau document'} : ${af.code || af.nom}`,
      texte: docs.map(d => `${d.categorie || 'Document'} : ${d.nom}${d.indice ? ` (indice ${d.indice})` : ''}`).join('\n'), lien: `#/pointage/chantier/${affaireId}`, tag: `docs-${affaireId}` };
    purger();
    [...new Set(dest.values())].forEach(uid => enregistrer({ type: 'document', userId: uid, affaireId, titre: m.titre, texte: m.texte, lien: m.lien, date: new Date().toISOString(), lu: false }));
    const doc = (DB.getSettings(db).doc || {});
    await Push.envoyer(DB, db, [...dest.keys()], m, doc.email ? `mailto:${doc.email}` : undefined).catch(e => console.error('Notification :', e.message));
  }
  // Appelé après chaque enregistrement d'un chantier : documents nouvellement transmis (ou nouvel indice)
  function documentsModifies(acc, avant, apres) {
    if (!apres) return;
    const deja = new Set(((avant && avant.documents) || []).filter(d => d.visible).map(cleDoc));
    const nouveaux = (apres.documents || []).filter(d => d.visible && !deja.has(cleDoc(d)));
    if (!nouveaux.length) return;
    const a = attenteDocs.get(apres.id) || { docs: new Map() };
    nouveaux.forEach(d => a.docs.set(d.id, d));
    clearTimeout(a.timer);
    a.timer = setTimeout(() => envoyerDocs(apres.id).catch(e => console.error('Notification :', e.message)), DELAI());
    if (a.timer.unref) a.timer.unref();
    attenteDocs.set(apres.id, a);
  }

  /* ---------- Intervention hors devis ouverte par un compagnon : prévenir le bureau ---------- */
  async function horsDevisOuvert(acc, a) {
    const comptes = db.prepare("SELECT id, user_id FROM accounts WHERE role IN ('admin', 'charge')").all();
    if (!comptes.length) return;
    const client = a.clientId ? (lire('entreprises', a.clientId) || {}).nom : a.clientLibre;
    const m = { titre: `🛠️ Intervention hors devis ouverte : ${a.code || ''}`, texte: `${acc.nom || acc.login} — ${a.nom}${client ? ` chez ${client}` : ''}. À compléter (client, site, chargé d'affaires).`,
      lien: `#/chantier/${a.id}`, tag: `hd-${a.id}` };
    purger();
    [...new Set(comptes.map(c => c.user_id).filter(Boolean))].forEach(uid => enregistrer({ type: 'horsDevis', userId: uid, affaireId: a.id, titre: m.titre, texte: m.texte, lien: m.lien, date: new Date().toISOString(), lu: false }));
    const doc = (DB.getSettings(db).doc || {});
    await Push.envoyer(DB, db, comptes.map(c => c.id), m, doc.email ? `mailto:${doc.email}` : undefined).catch(e => console.error('Notification :', e.message));
  }

  // Intérimaire déclaré depuis le pointage : le bureau complète la mission (registre du personnel, contrat, motif)
  async function interimaireDeclare(acc, u) {
    const comptes = db.prepare("SELECT id, user_id FROM accounts WHERE role IN ('admin', 'charge')").all();
    if (!comptes.length) return;
    const agence = u.agenceId ? (lire('entreprises', u.agenceId) || {}).nom : u.agenceLibre;
    const m = { titre: `👷 Intérimaire déclaré : ${u.nom}`, texte: `${acc.nom || acc.login} l'a pointé avec lui${agence ? ` (agence ${agence})` : ''}. Mission à compléter dans RH → Intérim (contrat, motif, état civil).`,
      lien: '#/rh/interim', tag: `interim-${u.id}` };
    purger();
    [...new Set(comptes.map(c => c.user_id).filter(Boolean))].forEach(id => enregistrer({ type: 'interim', userId: id, titre: m.titre, texte: m.texte, lien: m.lien, date: new Date().toISOString(), lu: false }));
    const doc = (DB.getSettings(db).doc || {});
    await Push.envoyer(DB, db, comptes.map(c => c.id), m, doc.email ? `mailto:${doc.email}` : undefined).catch(e => console.error('Notification :', e.message));
  }

  /* ---------- Échéances : habilitations, visites médicales, contrôles du parc ---------- */
  // Chaque alerte part une fois à « bientôt » (60 j, 30 j pour le parc) et une fois à l'expiration :
  // un résumé pour le bureau, et un message à la personne concernée (ou à son chef d'équipe).
  async function echeances() {
    const auj = aujourdhui(), lu = db.prepare("SELECT value FROM config WHERE key = 'alertes-echeances'").get();
    const deja = lu ? JSON.parse(lu.value) : {}, nouvelles = [];
    tous('habilitations').forEach(h => Echeances.alertesPersonne([h], auj).forEach(a => {
      const cle = `h:${h.id}:${h.expire}:${a.etat}`;
      if (!deja[cle]) nouvelles.push({ cle, type: 'hab', userId: h.userId, texte: `${a.libelle} : ${Echeances.texte(a)}`, etat: a.etat });
    }));
    tous('materiels').filter(m => !m.archive).forEach(m => Echeances.alertesMateriel(m, auj).forEach(a => {
      const cle = `m:${m.id}:${a.cle}:${a.expire}:${a.etat}`;
      if (!deja[cle]) nouvelles.push({ cle, type: 'parc', userId: m.affectation && m.affectation.userId, texte: `${m.designation}${m.immat ? ` (${m.immat})` : ''} – ${a.libelle} : ${Echeances.texte(a)}`, etat: a.etat });
    }));
    // Contrôles d'étanchéité des équipements frigorifiques des clients (registre des fluides)
    const fiches = tous('fichesFluides');
    tous('equipementsFrigo').filter(e => !e.archive).forEach(e => {
      const p = Fluides.prochainControle(e, fiches);
      if (!p) return;
      const x = Echeances.etat(p.date, auj, 30);
      if (x.etat !== 'expire' && x.etat !== 'bientot') return;
      const cle = `f:${e.id}:${p.date}:${x.etat}`;
      const client = (lire('entreprises', e.clientId) || {}).nom || '';
      if (!deja[cle]) nouvelles.push({ cle, type: 'fluide', texte: `${client ? `${client} – ` : ''}${e.designation} (${e.fluide}) : ${p.suiviFuite ? 'contrôle de suivi après fuite' : 'contrôle d\'étanchéité'} ${Echeances.texte({ ...x, expire: p.date })}`, etat: x.etat });
    });
    if (!nouvelles.length) return 0;
    purger();
    const doc = (DB.getSettings(db).doc || {}), sujet = doc.email ? `mailto:${doc.email}` : undefined;
    // Bureau : un résumé
    const bureau = db.prepare("SELECT id, user_id FROM accounts WHERE role IN ('admin', 'charge')").all();
    const nh = nouvelles.filter(n => n.type === 'hab'), np = nouvelles.filter(n => n.type === 'parc'), nf = nouvelles.filter(n => n.type === 'fluide');
    const titre = `⏰ Échéances : ${[nh.length && `${nh.length} habilitation(s) / visite(s) médicale(s)`, np.length && `${np.length} contrôle(s) du parc`, nf.length && `${nf.length} contrôle(s) d'étanchéité`].filter(Boolean).join(', ')}`;
    const texte = nouvelles.map(n => `${n.type === 'hab' ? `${(lire('users', n.userId) || {}).nom || ''} : ` : ''}${n.texte}`).join('\n');
    const lien = nh.length ? '#/rh/habilitations' : np.length ? '#/parc' : '#/fluides';
    [...new Set(bureau.map(c => c.user_id).filter(Boolean))].forEach(uid => enregistrer({ type: 'echeance', userId: uid, titre, texte, lien, date: new Date().toISOString(), lu: false }));
    await Push.envoyer(DB, db, bureau.map(c => c.id), { titre, texte, lien, tag: 'echeances' }, sujet).catch(e => console.error('Notification :', e.message));
    // Personnes concernées (compagnon, ou son chef d'équipe s'il n'a pas de compte)
    const parPersonne = new Map();
    nouvelles.filter(n => n.userId).forEach(n => { if (!parPersonne.has(n.userId)) parPersonne.set(n.userId, []); parPersonne.get(n.userId).push(n); });
    for (const [uid, l] of parPersonne) {
      let dest = comptesDe(uid), pour = uid;
      if (!dest.length) { const u = lire('users', uid); if (u && u.chefId) { dest = comptesDe(u.chefId); pour = u.chefId; } }
      if (!dest.length || bureau.some(c => c.user_id === pour)) continue;
      const m = { titre: l.some(n => n.etat === 'expire') ? '⛔ Habilitation ou contrôle expiré' : '⚠ À renouveler bientôt', texte: l.map(n => n.texte).join('\n'), lien: '#/pointage/chantiers', tag: 'echeances' };
      enregistrer({ type: 'echeance', userId: pour, titre: m.titre, texte: m.texte, lien: m.lien, date: new Date().toISOString(), lu: false });
      await Push.envoyer(DB, db, dest.map(c => c.id), m, sujet).catch(e => console.error('Notification :', e.message));
    }
    nouvelles.forEach(n => { deja[n.cle] = auj; });
    db.prepare("INSERT INTO config (key, value) VALUES ('alertes-echeances', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(deja));
    return nouvelles.length;
  }

  /* ---------- Dérive des chantiers : heures, achats, marge à terminaison ---------- */
  // Chaque alerte part une fois par chantier, poste et niveau (attention, dépassement…) au chargé d'affaires du
  // chantier (à défaut, aux administrateurs), dans la cloche et sur son téléphone.
  async function derives() {
    const settings = DB.getSettings(db), r = Derive.cfg(settings.derives);
    if (!r.actif) return 0;
    const lu = db.prepare("SELECT value FROM config WHERE key = 'alertes-derives'").get(), deja = lu ? JSON.parse(lu.value) : {};
    const Calc = calcSur(tous, settings), parCharge = new Map();
    tous('affaires').forEach(a => {
      let l;
      try { l = Derive.alertes(a, Calc.affaire(a), r); } catch (e) { console.error('Dérive', a.code, e.message); return; }
      const nouvelles = l.filter(x => !deja[`${a.id}:${x.cle}:${x.niveau}`]);
      if (!nouvelles.length) return;
      nouvelles.forEach(x => { deja[`${a.id}:${x.cle}:${x.niveau}`] = aujourdhui(); });
      const k = a.chargeId || '';
      if (!parCharge.has(k)) parCharge.set(k, []);
      parCharge.get(k).push({ a, l: nouvelles });
    });
    if (!parCharge.size) return 0;
    purger();
    const doc = settings.doc || {}, sujet = doc.email ? `mailto:${doc.email}` : undefined;
    const admins = db.prepare("SELECT id, user_id FROM accounts WHERE role = 'admin'").all();
    let n = 0;
    for (const [chargeId, liste] of parCharge) {
      const dest = chargeId && comptesDe(chargeId).length ? comptesDe(chargeId) : admins;
      const grave = liste.some(x => x.l.some(y => y.niveau === 'depassement'));
      const titre = liste.length === 1 ? `${grave ? '🔴' : '🟠'} Dérive du chantier ${liste[0].a.code || ''}` : `${grave ? '🔴' : '🟠'} ${liste.length} chantiers en dérive`;
      const texte = liste.map(x => `${x.a.code || ''} ${x.a.nom || ''}\n${x.l.map(y => `– ${y.texte}`).join('\n')}`).join('\n');
      const lien = liste.length === 1 ? `#/chantier/${liste[0].a.id}` : '#/direction';
      [...new Set(dest.map(c => c.user_id).filter(Boolean))].forEach(uid => enregistrer({ type: 'derive', userId: uid, titre, texte, lien, date: new Date().toISOString(), lu: false }));
      await Push.envoyer(DB, db, dest.map(c => c.id), { titre, texte, lien, tag: 'derive' }, sujet).catch(e => console.error('Notification :', e.message));
      n += liste.length;
    }
    db.prepare("INSERT INTO config (key, value) VALUES ('alertes-derives', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(deja));
    return n;
  }

  // Pour les tests et l'arrêt du serveur : envoie tout de suite ce qui attend
  const vider = () => Promise.all([...attente.keys()].map(u => { clearTimeout(attente.get(u).timer); return envoyer(u); }));

  return { planningModifie, documentsModifies, horsDevisOuvert, interimaireDeclare, echeances, derives, vider, enregistrer };
}

module.exports = { creer };
