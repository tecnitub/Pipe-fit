// Planning dans les agendas :
// - Outlook (Microsoft 365) : chaque journée planifiée devient un événement du calendrier de la personne
//   (boîte de son compte Pipe-Fit, ou adresse de sa fiche), mis à jour ou supprimé quand le planning change ;
// - lien d'abonnement iCal personnel (téléphone, Google Agenda, Apple Calendrier…), jeton secret révocable.
const crypto = require('node:crypto');
const Agenda = require('./agenda-format');

const FENETRE_PASSE = 7, FENETRE_FUTUR = 90; // jours synchronisés autour d'aujourd'hui
const empreinte = o => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex');
const iso = d => d.toISOString().slice(0, 10);

function creer({ DB, db, M365 }) {
  db.exec(`CREATE TABLE IF NOT EXISTS agenda_outlook (planning_id TEXT PRIMARY KEY, boite TEXT NOT NULL, event_id TEXT NOT NULL, empreinte TEXT NOT NULL, maj TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agenda_jetons (jeton TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at TEXT NOT NULL)`);
  const etat = { dernier: null, crees: 0, modifies: 0, supprimes: 0, erreurs: [], boites: 0 };
  let enCours = null, delai = null, auto = false;
  const lire = (col, id) => (id ? DB.getRecord(db, col, id) : null);
  const tous = col => db.prepare('SELECT id FROM records WHERE col = ?').all(col).map(r => DB.getRecord(db, col, r.id));
  const ctx = () => ({ affaire: id => lire('affaires', id), entreprise: id => lire('entreprises', id), contact: id => lire('contacts', id),
    site: (cid, sid) => ((lire('entreprises', cid) || {}).adresses || []).find(s => s.id === sid) || null });
  const config = () => { const c = (DB.getConfig(db, 'm365') || {}).agenda || {}; return { actif: !!c.actif, categorie: c.categorie ?? 'Pipe-Fit', rappel: Number(c.rappel) || 0 }; };
  const m365 = () => DB.getConfig(db, 'm365') || {};
  const pret = () => { const c = m365(); return !!(c.actif && c.tenantId && c.clientId && c.clientSecret && config().actif); };
  // Boîte Microsoft 365 d'une personne de l'équipe : e-mail du compte relié, sinon e-mail de sa fiche
  function boiteDe(userId) {
    const a = db.prepare("SELECT email FROM accounts WHERE user_id = ? AND email IS NOT NULL AND email <> '' LIMIT 1").get(userId);
    return (a && a.email) || ((lire('users', userId) || {}).email || '');
  }

  async function synchroniser() {
    if (enCours) return enCours;
    enCours = (async () => {
      const bilan = { crees: 0, modifies: 0, supprimes: 0, erreurs: [] };
      try {
        if (!pret()) return Object.assign(etat, bilan, { actif: false, dernier: new Date().toISOString() });
        const cfg = m365(), opt = config(), c = ctx();
        const auj = new Date(), deb = iso(new Date(auj.getTime() - FENETRE_PASSE * 86400000)), fin = iso(new Date(auj.getTime() + FENETRE_FUTUR * 86400000));
        const planning = tous('planning'), parId = new Map(planning.map(p => [p.id, p]));
        const boites = new Map();
        const voulu = new Map();
        planning.filter(p => p.date && p.date >= deb && p.date <= fin && p.userId).forEach(p => {
          if (!boites.has(p.userId)) boites.set(p.userId, boiteDe(p.userId));
          const boite = boites.get(p.userId), e = Agenda.evenement(p, c);
          if (boite && e) voulu.set(p.id, { boite, corps: { ...Agenda.graph(e, opt), transactionId: `pipefit-${p.id}`.slice(0, 64) } });
        });
        const lignes = new Map(db.prepare('SELECT * FROM agenda_outlook').all().map(l => [l.planning_id, l]));
        const noter = (pid, boite, id, h) => db.prepare(`INSERT INTO agenda_outlook (planning_id, boite, event_id, empreinte, maj) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(planning_id) DO UPDATE SET boite = excluded.boite, event_id = excluded.event_id, empreinte = excluded.empreinte, maj = excluded.maj`).run(pid, boite, id, h, new Date().toISOString());
        const oublier = pid => db.prepare('DELETE FROM agenda_outlook WHERE planning_id = ?').run(pid);
        for (const [pid, v] of voulu) {
          const l = lignes.get(pid), h = empreinte([v.boite, v.corps]);
          try {
            if (l && l.empreinte === h) continue;
            if (l && l.boite === v.boite) {
              const { transactionId, ...maj } = v.corps;
              try { await M365.evenement(cfg, v.boite, 'PATCH', l.event_id, maj); noter(pid, v.boite, l.event_id, h); bilan.modifies++; continue; }
              catch (e) { if (e.status !== 404) throw e; } // supprimé dans Outlook : recréé
            } else if (l) { await M365.evenement(cfg, l.boite, 'DELETE', l.event_id).catch(e => { if (e.status !== 404) throw e; }); }
            const r = await M365.evenement(cfg, v.boite, 'POST', null, v.corps);
            noter(pid, v.boite, r.id, h); bilan.crees++;
          } catch (e) { bilan.erreurs.push(`${v.boite} : ${e.message}`); }
        }
        // Journée retirée du planning, ou personne sans boîte : événement supprimé (les journées passées hors fenêtre restent)
        for (const [pid, l] of lignes) {
          if (voulu.has(pid)) continue;
          const p = parId.get(pid);
          if (p && p.date && p.date < deb) continue;
          try { await M365.evenement(cfg, l.boite, 'DELETE', l.event_id).catch(e => { if (e.status !== 404) throw e; }); oublier(pid); bilan.supprimes++; }
          catch (e) { bilan.erreurs.push(`${l.boite} : ${e.message}`); }
        }
        Object.assign(etat, bilan, { actif: true, boites: new Set([...voulu.values()].map(v => v.boite)).size, erreurs: [...new Set(bilan.erreurs)].slice(0, 20) });
      } finally { etat.dernier = new Date().toISOString(); }
      return etat;
    })();
    try { return await enCours; } finally { enCours = null; }
  }
  function demarrer() {
    auto = true;
    setTimeout(() => synchroniser().catch(e => console.error('Agenda Outlook :', e.message)), 20000).unref();
    setInterval(() => synchroniser().catch(e => console.error('Agenda Outlook :', e.message)), 15 * 60000).unref();
  }
  // Planning modifié : synchronisation quelques secondes plus tard (plusieurs modifications regroupées)
  function signaler() {
    if (!auto || !pret()) return;
    clearTimeout(delai);
    delai = setTimeout(() => synchroniser().catch(e => console.error('Agenda Outlook :', e.message)), 5000);
    delai.unref();
  }

  /* ---------- Lien d'abonnement iCal ---------- */
  const hacher = j => crypto.createHash('sha256').update(String(j)).digest('hex');
  function nouveauLien(accountId) {
    db.prepare('DELETE FROM agenda_jetons WHERE account_id = ?').run(accountId);
    const jeton = crypto.randomBytes(24).toString('base64url');
    db.prepare('INSERT INTO agenda_jetons (jeton, account_id, created_at) VALUES (?, ?, ?)').run(hacher(jeton), accountId, new Date().toISOString());
    return jeton;
  }
  const aUnLien = accountId => !!db.prepare('SELECT 1 FROM agenda_jetons WHERE account_id = ?').get(accountId);
  const revoquer = accountId => db.prepare('DELETE FROM agenda_jetons WHERE account_id = ?').run(accountId).changes;
  // Calendrier du compte : sa propre fiche, et son équipe pour un chef d'équipe
  function calendrier(jeton) {
    const j = /^[A-Za-z0-9_-]{20,64}$/.test(String(jeton || '')) && db.prepare('SELECT account_id FROM agenda_jetons WHERE jeton = ?').get(hacher(jeton));
    if (!j) return null;
    const acc = db.prepare('SELECT id, nom, user_id FROM accounts WHERE id = ?').get(j.account_id);
    if (!acc || !acc.user_id) return { ics: Agenda.ical([], { nom: 'Planning Pipe-Fit' }) };
    const equipe = [acc.user_id, ...tous('users').filter(u => u.chefId === acc.user_id).map(u => u.id)];
    const deb = iso(new Date(Date.now() - 30 * 86400000)), c = ctx();
    const evts = tous('planning').filter(p => p.date && p.date >= deb && equipe.includes(p.userId)).map(p => {
      const e = Agenda.evenement(p, c);
      if (e && p.userId !== acc.user_id) e.titre = `${String((lire('users', p.userId) || {}).nom || '').split(' ')[0]} : ${e.titre}`;
      return e;
    });
    return { ics: Agenda.ical(evts, { nom: `Planning Pipe-Fit – ${acc.nom || ''}`.trim() }) };
  }

  return { synchroniser, demarrer, signaler, config, etat: () => ({ ...etat }), pret, nouveauLien, aUnLien, revoquer, calendrier };
}
module.exports = { creer };
