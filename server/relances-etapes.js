// Relances des étapes des études (suivi des étapes, etudes/public/js/suivi-etapes.js) : échéance dans deux jours ou
// dépassée, étape qui en bloque une autre affectée à quelqu'un d'autre. Lu dans l'avancement mis en cache dans le résumé
// de chaque étude (liens_apps), une notification par personne (cloche de l'appli et téléphone), une seule fois par étape,
// échéance et état (mémoire dans la table config, clé « relances-etapes »).
const SuiviEtapes = require('../etudes/public/js/suivi-etapes');
const Push = require('./push');

function creer({ DB, db, LIENS, NOTIFS }) {
  const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const comptes = () => db.prepare('SELECT id, user_id, role FROM accounts').all();
  // Personnes à prévenir pour un responsable : la personne (ou son chef d'équipe sans compte), le chargé d'affaires du
  // chantier pour le conducteur de travaux et les compagnons, les comptes du bureau pour le BE, les administrateurs
  function destinataires(r, affaire, cs) {
    if (!r) return [];
    if (r.type === 'user') {
      if (cs.some(c => c.user_id === r.id)) return [r.id];
      const u = DB.getRecord(db, 'users', r.id);
      return u && u.chefId && cs.some(c => c.user_id === u.chefId) ? [u.chefId] : [];
    }
    if (r.role === 'conducteur' || r.role === 'compagnon') return affaire && affaire.chargeId ? [affaire.chargeId] : cs.filter(c => c.role === 'admin').map(c => c.user_id);
    if (r.role === 'be') return cs.filter(c => c.role === 'charge').map(c => c.user_id);
    if (r.role === 'admin') return cs.filter(c => c.role === 'admin').map(c => c.user_id);
    return [];
  }
  async function verifier(today = aujourdhui()) {
    const lu = db.prepare("SELECT value FROM config WHERE key = 'relances-etapes'").get();
    const deja = SuiviEtapes.purgerDeja(lu ? JSON.parse(lu.value) : {}, today);
    const liste = SuiviEtapes.relances(LIENS.liste({ app: 'etudes' }), { today, deja, terrain: LIENS.etapesTerrain() });
    if (!liste.length) return 0;
    const cs = comptes(), parPersonne = new Map();
    liste.forEach(x => {
      const a = x.affaireId ? DB.getRecord(db, 'affaires', x.affaireId) : null;
      [...new Set(destinataires(x.responsable, a, cs).filter(Boolean))].forEach(uid => { if (!parPersonne.has(uid)) parPersonne.set(uid, []); parPersonne.get(uid).push({ ...x, code: a ? a.code || '' : '' }); });
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
    db.prepare("INSERT INTO config (key, value) VALUES ('relances-etapes', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(deja));
    return liste.length;
  }
  return { verifier, destinataires };
}

module.exports = { creer };
