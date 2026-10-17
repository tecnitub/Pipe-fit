// Notifications de planning : chaque changement d'affectation d'un compagnon (aujourd'hui ou plus tard) est
// regroupé quelques secondes (le bureau planifie souvent plusieurs jours d'un coup), puis une notification est
// enregistrée (cloche de l'appli, synchronisée en temps réel) et envoyée sur ses téléphones (Web Push).
// Un intérimaire sans compte : c'est son chef d'équipe qui est prévenu.
const crypto = require('node:crypto');
const Push = require('./push');
const NotifPlanning = require('../public/js/notif-planning');
const Compagnon = require('../public/js/compagnon');

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

  // Pour les tests et l'arrêt du serveur : envoie tout de suite ce qui attend
  const vider = () => Promise.all([...attente.keys()].map(u => { clearTimeout(attente.get(u).timer); return envoyer(u); }));

  return { planningModifie, documentsModifies, vider, enregistrer };
}

module.exports = { creer };
