// Suivi des étapes du « Reste à faire » de l'étude (guide-etude.js) : responsable et échéance par étape, étape « sans
// objet » justifiée (qui, quand, pourquoi), historique (fait, rouvert, affecté, sans objet, rétabli, fait sur le terrain),
// résumé d'avancement mis en cache dans l'étude (et.avancement, calculé à l'enregistrement) pour les tableaux de bord
// (portefeuille des études, liste des chantiers du CRM), relances (échéance à J-2, dépassée, étape qui en bloque une
// autre), étapes de l'utilisateur (« Mes étapes », appli des compagnons) et synthèse imprimable « État d'avancement ».
// Données : et.suiviEtapes[id] = { responsable, echeance, sansObjet, motif, etat, faitTerrain, historique: [] }.
// Fonctions pures (testées sous Node) ; affichage et dialogues dans le navigateur (application Études).
const SuiviEtapes = (() => {
  const essai = f => { try { return f(); } catch (e) { return null; } };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const jour = d => { const x = d ? new Date(d) : new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const dateFr = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
  const ecartJours = (a, b) => Math.round((Date.parse(`${String(a).slice(0, 10)}T12:00:00Z`) - Date.parse(`${String(b).slice(0, 10)}T12:00:00Z`)) / 86400000);
  const MAX_HISTORIQUE = 40, MAX_RESTES = 80, DELAI_RELANCE = 2;

  // Phases d'une affaire, dans l'ordre (le guide étendu donne `phase` à chaque étape ; sans phase : étude)
  const PHASES = [['etude', 'Étude', '📐'], ['achats', 'Achats', '🛒'], ['chantier', 'Chantier', '🏗️'], ['mes', 'Mise en service', '🔧'], ['reception', 'Réception', '🤝'], ['doe', 'DOE', '📚'], ['exploitation', 'Exploitation', '♻️']];
  const PHASE = Object.fromEntries(PHASES.map(([k, l, i]) => [k, { libelle: l, ico: i }]));
  const sansAccent = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  function normPhase(p) {
    const s = sansAccent(p);
    if (!s) return '';
    if (PHASE[s]) return s;
    if (/mise en service|^mes$|essai/.test(s)) return 'mes';
    if (/achat|commande|approvision/.test(s)) return 'achats';
    if (/chantier|travaux|execution/.test(s)) return 'chantier';
    if (/reception|reserve/.test(s)) return 'reception';
    if (/doe|ouvrages? execute/.test(s)) return 'doe';
    if (/exploit|maintenance|entretien/.test(s)) return 'exploitation';
    if (/etude/.test(s)) return 'etude';
    return '';
  }
  const phaseDe = e => normPhase(e && e.phase) || 'etude';
  // Phases « terrain » : vues dans l'appli des compagnons
  const PHASES_TERRAIN = ['chantier', 'mes', 'reception'];

  // Responsables : une personne (fiche de l'équipe Pipe-Fit) ou un rôle
  const ROLES = [['be', 'Bureau d\'études'], ['conducteur', 'Conducteur de travaux'], ['compagnon', 'Compagnon'], ['admin', 'Administrateur']];
  const ROLE = Object.fromEntries(ROLES);
  // Rôles Pipe-Fit (comptes) → rôles de responsable
  const ROLES_COMPTE = { admin: ['admin', 'be'], charge: ['be', 'conducteur'], atelier: ['compagnon'] };
  const libelleResponsable = r => (!r ? '' : r.type === 'role' ? ROLE[r.role] || r.role || '' : r.nom || r.id || '');
  function responsableValide(r) {
    if (!r || typeof r !== 'object') return null;
    if (r.type === 'role' && ROLE[r.role]) return { type: 'role', role: r.role };
    if (r.type === 'user' && r.id) return { type: 'user', id: String(r.id).slice(0, 64), nom: String(r.nom || '').slice(0, 80) };
    return null;
  }
  // La personne (user = { id: fiche de l'équipe, role: rôle du compte, nom }) est-elle concernée par ce responsable ?
  // ctx.chargeId : chargé d'affaires du chantier (le conducteur de travaux) ; ctx.planifie : compagnon prévu sur le chantier
  function correspond(r, user, ctx = {}) {
    if (!r || !user) return false;
    if (r.type === 'user') return !!user.id && r.id === user.id;
    if (r.type !== 'role') return false;
    const roles = ROLES_COMPTE[user.role] || [];
    if (r.role === 'conducteur' && ctx.chargeId) return !!user.id && user.id === ctx.chargeId;
    if (r.role === 'compagnon' && ctx.planifie !== undefined) return roles.includes('compagnon') && !!ctx.planifie;
    return roles.includes(r.role);
  }

  /* ---------- Données de suivi d'une étape ---------- */
  const suivi = (et, id) => ((et && et.suiviEtapes) || {})[id] || {};
  const suiviEcrit = (et, id) => { et.suiviEtapes = et.suiviEtapes || {}; return (et.suiviEtapes[id] = et.suiviEtapes[id] || {}); };
  const historique = (et, id) => (suivi(et, id).historique || []).slice();
  const estSansObjet = (et, id) => !!suivi(et, id).sansObjet;
  const qui = u => (u ? { par: String(u.nom || u.login || '').slice(0, 80), ...(u.id ? { parId: String(u.id) } : {}) } : { par: '' });
  function noter(et, id, action, user, detail, date) {
    const s = suiviEcrit(et, id), h = s.historique = s.historique || [];
    h.push({ le: date || new Date().toISOString(), ...qui(user), action, ...(detail ? { detail: String(detail).slice(0, 300) } : {}) });
    if (h.length > MAX_HISTORIQUE) h.splice(0, h.length - MAX_HISTORIQUE);
    return s;
  }
  const ACTIONS = { fait: '✅ Fait', rouvert: '↩️ Rouvert', affecte: '👤 Affecté', 'sans-objet': '⊘ Sans objet', retabli: '♻️ Rétabli', 'fait-terrain': '📱 Fait sur le terrain', relance: '🔔 Relancé' };

  // Responsable et échéance (vides : retirés)
  function affecter(et, id, { responsable, echeance } = {}, user, date) {
    const s = suiviEcrit(et, id), r = responsableValide(responsable), e = /^\d{4}-\d{2}-\d{2}$/.test(String(echeance || '')) ? String(echeance) : '';
    const avant = `${libelleResponsable(s.responsable)}|${s.echeance || ''}`;
    if (r) s.responsable = r; else delete s.responsable;
    if (e) s.echeance = e; else delete s.echeance;
    if (avant === `${libelleResponsable(s.responsable)}|${s.echeance || ''}`) return false;
    noter(et, id, 'affecte', user, [r ? libelleResponsable(r) : 'sans responsable', e ? `échéance ${dateFr(e)}` : 'sans échéance'].join(', '), date);
    return true;
  }
  function marquerSansObjet(et, id, motif, user, date) {
    const m = String(motif || '').trim();
    if (!m) throw new Error('Motif obligatoire pour une étape sans objet');
    const s = suiviEcrit(et, id);
    s.sansObjet = true; s.motif = m.slice(0, 300); s.sansObjetLe = date || new Date().toISOString(); s.sansObjetPar = qui(user).par;
    noter(et, id, 'sans-objet', user, m, date);
    return s;
  }
  function retablir(et, id, user, date) {
    const s = suiviEcrit(et, id);
    if (!s.sansObjet) return false;
    delete s.sansObjet; delete s.motif; delete s.sansObjetLe; delete s.sansObjetPar;
    noter(et, id, 'retabli', user, '', date);
    return true;
  }
  // Étape faite : notée une fois (pas de doublon tant qu'elle n'a pas été rouverte)
  function noterFait(et, etape, user, date) {
    const id = etape && (etape.id || etape), s = suivi(et, id);
    if (!id || s.etat === 'fait') return false;
    noter(et, id, 'fait', user, '', date).etat = 'fait';
    return true;
  }
  function noterRouvert(et, etape, user, date) {
    const id = etape && (etape.id || etape), s = suivi(et, id);
    if (!id || s.etat !== 'fait') return false;
    noter(et, id, 'rouvert', user, '', date).etat = 'ouvert';
    return true;
  }
  // États des étapes (calculés par le guide) comparés au dernier état noté : fait / rouvert ajoutés à l'historique.
  // Une étape ouverte jamais faite ne crée pas d'entrée.
  function suivreEtats(et, etapes, user, date) {
    let n = 0;
    (etapes || []).forEach(e => {
      const s = suivi(et, e.id), fait = !!e.fait || !!s.faitTerrain;
      if (s.sansObjet) return;
      // Faite sur le terrain : déjà dans l'historique (« fait sur le terrain »), état seulement
      if (fait && !e.fait && s.faitTerrain) { if (s.etat !== 'fait') suiviEcrit(et, e.id).etat = 'fait'; return; }
      if (fait && noterFait(et, e, user, date)) n++;
      else if (!fait && noterRouvert(et, e, user, date)) n++;
    });
    return n;
  }
  // Étapes faites sur le terrain (appli des compagnons : photo, commentaire), relues dans Pipe-Fit
  function fusionnerTerrain(et, retours) {
    let n = 0;
    (retours || []).forEach(r => {
      if (!r || !r.etapeId || !r.cle) return;
      const s = suivi(et, r.etapeId);
      if (s.faitTerrain && s.faitTerrain.cle === r.cle) return;
      const st = suiviEcrit(et, r.etapeId);
      st.faitTerrain = { cle: String(r.cle), le: String(r.le || '').slice(0, 10), par: String(r.par || '').slice(0, 80), ...(r.parId ? { parId: String(r.parId) } : {}), commentaire: String(r.commentaire || '').slice(0, 500), ...(r.photoId ? { photoId: String(r.photoId) } : {}) };
      noter(et, r.etapeId, 'fait-terrain', { nom: r.par, id: r.parId }, [r.commentaire, r.photoId ? 'photo jointe' : ''].filter(Boolean).join(' — '), r.le ? `${String(r.le).slice(0, 10)}T12:00:00.000Z` : undefined);
      n++;
    });
    return n;
  }

  /* ---------- Étapes décorées ---------- */
  function etatEcheance(echeance, today, fait) {
    if (fait || !echeance) return '';
    const d = ecartJours(echeance, today || jour());
    return d < 0 ? 'retard' : d <= DELAI_RELANCE ? 'bientot' : '';
  }
  const prerequis = e => [...new Set([].concat(e.bloquePar || e.blocages || e.dependances || []).map(x => (x && typeof x === 'object' ? x.id : x)).filter(Boolean).map(String))];
  // Copie des étapes avec leur suivi ; une étape sans objet ou faite sur le terrain compte comme faite
  function decorer(et, etapes, opts = {}) {
    const today = opts.today || jour();
    return (etapes || []).map(e => {
      const s = suivi(et, e.id), fait = !!e.fait || !!s.sansObjet || !!s.faitTerrain;
      return { ...e, phase: phaseDe(e), fait, faitGuide: !!e.fait, sansObjet: !!s.sansObjet, motif: s.motif || '', sansObjetPar: s.sansObjetPar || '', sansObjetLe: s.sansObjetLe || '',
        responsable: s.responsable || null, echeance: s.echeance || '', faitTerrain: s.faitTerrain || null, historique: (s.historique || []).slice(), etatEcheance: etatEcheance(s.echeance, today, fait), bloquePar: prerequis(e) };
    });
  }
  const restes = decorees => decorees.filter(e => !e.fait);
  const mesEtapes = (decorees, user, ctx) => restes(decorees).filter(e => correspond(e.responsable, user, ctx));

  /* ---------- Résumé d'avancement (mis en cache dans l'étude) ---------- */
  const Gd = () => essai(() => (typeof GuideEtude !== 'undefined' ? GuideEtude : require('./guide-etude')));
  const etapesEtude = et => { const G = Gd(), r = G ? essai(() => G.restesAFaire(et)) : null; return r ? r.etapes || [] : null; };
  // { le, pct, faits, total, sansObjet, retards, bientot, phases: { phase: { faits, total } }, restes: [compact] }
  function avancement(et, decorees, today) {
    today = today || jour();
    const phases = {}, d = decorees || [];
    d.forEach(e => { const p = phases[e.phase] = phases[e.phase] || { faits: 0, total: 0 }; p.total++; if (e.fait) p.faits++; });
    const faits = d.filter(e => e.fait).length, total = d.length, ouverts = new Set(restes(d).map(e => e.id));
    const rang = e => (e.etatEcheance === 'retard' ? 0 : e.etatEcheance === 'bientot' ? 1 : e.responsable ? 2 : 3);
    const r = restes(d).slice().sort((a, b) => rang(a) - rang(b) || String(a.echeance || '9').localeCompare(String(b.echeance || '9')));
    return { le: today, pct: total ? Math.round(faits / total * 100) : 100, faits, total, sansObjet: d.filter(e => e.sansObjet).length,
      retards: d.filter(e => e.etatEcheance === 'retard').length, bientot: d.filter(e => e.etatEcheance === 'bientot').length, phases,
      restes: r.slice(0, MAX_RESTES).map(e => ({ id: String(e.id), titre: String(e.titre || '').slice(0, 120), phase: e.phase, ...(e.responsable ? { responsable: e.responsable } : {}), ...(e.echeance ? { echeance: e.echeance } : {}),
        ...(e.bloquePar.filter(x => ouverts.has(x)).length ? { bloquePar: e.bloquePar.filter(x => ouverts.has(x)) } : {}) })) };
  }
  // À l'enregistrement : états suivis (historique) et résumé mis en cache ; rien si le guide n'est pas chargé
  function mettreAJour(et, user, opts = {}) {
    if (!et || et.modele) return null;
    const brutes = opts.etapes || etapesEtude(et);
    if (!brutes) return null;
    suivreEtats(et, brutes, user, opts.date);
    et.avancement = avancement(et, decorer(et, brutes, opts), opts.today);
    return et.avancement;
  }

  /* ---------- Portefeuille (toutes les études / affaires) ---------- */
  // items : [{ etudeId, objet, affaireId, affaire, chargeId, avancement }] ; filtres : { responsable ('user:id' | 'role:be'),
  // phase, retard (true), moi: user } ; renvoie les lignes d'étapes restantes et les totaux par étude
  function portefeuille(items, f = {}, today) {
    today = today || jour();
    const lignes = [], etudes = [];
    (items || []).forEach(it => {
      const av = it.avancement;
      if (!av) return;
      const rs = (av.restes || []).map(r => ({ ...r, etatEcheance: etatEcheance(r.echeance, today, false), etudeId: it.etudeId, objet: it.objet, affaireId: it.affaireId || '', affaire: it.affaire || '' }))
        .filter(r => (!f.phase || r.phase === f.phase) && (!f.retard || r.etatEcheance === 'retard')
          && (!f.responsable || (f.responsable === 'aucun' ? !r.responsable : `${(r.responsable || {}).type}:${(r.responsable || {}).type === 'role' ? r.responsable.role : (r.responsable || {}).id}` === f.responsable))
          && (!f.moi || correspond(r.responsable, f.moi, { chargeId: it.chargeId })));
      const filtre = f.phase || f.retard || f.responsable || f.moi;
      if (filtre && !rs.length) return;
      lignes.push(...rs);
      etudes.push({ ...it, retards: rs.filter(r => r.etatEcheance === 'retard').length, lignes: rs.length });
    });
    const rang = r => (r.etatEcheance === 'retard' ? 0 : r.etatEcheance === 'bientot' ? 1 : 2);
    lignes.sort((a, b) => rang(a) - rang(b) || String(a.echeance || '9').localeCompare(String(b.echeance || '9')));
    return { etudes, lignes, retards: lignes.filter(r => r.etatEcheance === 'retard').length };
  }
  // Responsables présents dans les résumés (pour le filtre) : [[valeur, libellé]]
  function responsables(items) {
    const m = new Map();
    (items || []).forEach(it => ((it.avancement || {}).restes || []).forEach(r => { const x = r.responsable; if (x) m.set(x.type === 'role' ? `role:${x.role}` : `user:${x.id}`, libelleResponsable(x)); }));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  }

  /* ---------- Étapes d'une personne (appli des compagnons), relances ---------- */
  // liens : états des études dans Pipe-Fit ({ id, affaireId, resume: { objet, avancement } }) ; ctx : { chargeDe(affaireId),
  // planifie(userId, affaireId), terrain: [{ etudeId, etapeId, ... }], phases } ; seuls les champs utiles sont renvoyés
  function etapesPour(liens, user, ctx = {}) {
    const today = ctx.today || jour(), faitsTerrain = new Map((ctx.terrain || []).map(t => [`${t.etudeId}|${t.etapeId}`, t])), out = [];
    (liens || []).forEach(l => {
      const av = (l.resume || {}).avancement;
      if (!av || !l.affaireId) return;
      const c = { chargeId: ctx.chargeDe ? ctx.chargeDe(l.affaireId) : '', ...(ctx.planifie ? { planifie: ctx.planifie(user.id, l.affaireId) } : {}) };
      (av.restes || []).forEach(r => {
        if (ctx.phases && !ctx.phases.includes(r.phase)) return;
        if (!correspond(r.responsable, user, c)) return;
        const t = faitsTerrain.get(`${l.id}|${r.id}`);
        out.push({ etudeId: l.id, affaireId: l.affaireId, objet: String((l.resume || {}).objet || '').slice(0, 120), id: r.id, titre: r.titre, phase: r.phase, echeance: r.echeance || '',
          etatEcheance: t ? '' : etatEcheance(r.echeance, today, false), responsable: libelleResponsable(r.responsable), ...(t ? { faitTerrain: { le: t.le || '', par: t.par || '', commentaire: t.commentaire || '', photoId: t.photoId || '' } } : {}) });
      });
    });
    return out.sort((a, b) => (a.faitTerrain ? 1 : 0) - (b.faitTerrain ? 1 : 0) || String(a.echeance || '9').localeCompare(String(b.echeance || '9')));
  }
  // Relances à envoyer : échéance à J-2 ou dépassée, étape qui en bloque une autre affectée à quelqu'un d'autre.
  // deja : { cle: date } des relances déjà envoyées (pas de doublon) ; terrain : étapes déjà faites sur le terrain
  function relances(liens, { today, deja = {}, terrain = [] } = {}) {
    today = today || jour();
    const faits = new Set((terrain || []).map(t => `${t.etudeId}|${t.etapeId}`)), out = [];
    (liens || []).forEach(l => {
      const av = (l.resume || {}).avancement;
      if (!av) return;
      const parId = new Map((av.restes || []).map(r => [r.id, r])), objet = String((l.resume || {}).objet || '');
      const ajouter = (cle, o) => { if (!deja[cle]) out.push({ cle, etudeId: l.id, affaireId: l.affaireId || '', objet, ...o }); };
      (av.restes || []).forEach(r => {
        if (faits.has(`${l.id}|${r.id}`)) return;
        const e = etatEcheance(r.echeance, today, false);
        if (e && r.responsable) ajouter(`${e}:${l.id}:${r.id}:${r.echeance}`, { type: e, etapeId: r.id, titre: r.titre, responsable: r.responsable, echeance: r.echeance,
          texte: `${objet} — ${r.titre} : ${e === 'retard' ? `échéance dépassée (${dateFr(r.echeance)})` : `échéance le ${dateFr(r.echeance)}`}` });
        (r.bloquePar || []).forEach(bid => {
          const b = parId.get(bid);
          if (!b || !b.responsable || faits.has(`${l.id}|${bid}`)) return;
          if (r.responsable && libelleResponsable(r.responsable) === libelleResponsable(b.responsable) && r.responsable.type === b.responsable.type) return;
          ajouter(`bloque:${l.id}:${bid}:${r.id}`, { type: 'bloque', etapeId: bid, titre: b.titre, responsable: b.responsable, bloque: r.id,
            texte: `${objet} — ${b.titre} : bloque « ${r.titre} »${r.responsable ? ` (${libelleResponsable(r.responsable)})` : ''}` });
        });
      });
    });
    return out;
  }
  // Mémoire des relances : entrées de plus de 120 jours oubliées
  const purgerDeja = (deja, today) => Object.fromEntries(Object.entries(deja || {}).filter(([, d]) => ecartJours(today || jour(), d) <= 120));

  /* ---------- Affichage (navigateur, application Études) ---------- */
  let cfg = {};
  // { utilisateur: () => user, utilisateurs: () => [{ id, nom, role }], enregistrer: et => …, aujourdhui: () => 'AAAA-MM-JJ' }
  const configurer = c => { cfg = { ...cfg, ...c }; };
  const moi = () => (cfg.utilisateur ? essai(cfg.utilisateur) : null) || null;
  const today = () => (cfg.aujourdhui ? cfg.aujourdhui() : jour());
  const sauver = et => { if (cfg.enregistrer) return cfg.enregistrer(et); if (typeof enregistrer === 'function') return enregistrer(et); return null; };
  const badgeEch = e => (e.echeance ? `<span class="badge ${e.etatEcheance === 'retard' ? 'erreur' : e.etatEcheance === 'bientot' ? 'attention' : 'info'} suivi-ech" title="${e.etatEcheance === 'retard' ? 'Échéance dépassée' : 'Échéance'}">${e.etatEcheance === 'retard' ? '⏰ en retard · ' : '📅 '}${dateFr(e.echeance)}</span>` : '');
  // HTML additionnel d'une étape (badges, boutons) : etape décorée (decorer), ou brute (décorée ici)
  function htmlEtape(et, etape) {
    const e = etape && etape.historique ? etape : decorer(et, [etape], { today: today() })[0];
    if (!e) return '';
    const id = esc(e.id);
    return `<span class="suivi-etape">${e.responsable ? `<span class="badge info suivi-resp" title="Responsable">👤 ${esc(libelleResponsable(e.responsable))}</span>` : ''}${badgeEch(e)}
      ${e.sansObjet ? `<span class="badge suivi-so" title="Sans objet : ${esc(e.motif)}${e.sansObjetPar ? ` (${esc(e.sansObjetPar)})` : ''}">⊘ sans objet</span>` : ''}${e.faitTerrain ? `<span class="badge ok" title="${esc(e.faitTerrain.commentaire)}">📱 fait par ${esc(e.faitTerrain.par)}</span>` : ''}
      <span class="suivi-actions">${e.sansObjet ? `<button type="button" class="secondaire petit" data-suivi-action="retablir" data-suivi-id="${id}">Rétablir</button>` : `${e.fait ? '' : `<button type="button" class="secondaire petit" data-suivi-action="affecter" data-suivi-id="${id}" title="Responsable et échéance">Affecter…</button>`}${e.faitGuide ? '' : `<button type="button" class="secondaire petit" data-suivi-action="sans-objet" data-suivi-id="${id}" title="L'étape ne s'applique pas à cette affaire (motif demandé)">Sans objet</button>`}`}
      ${e.historique.length ? `<button type="button" class="secondaire petit" data-suivi-action="historique" data-suivi-id="${id}" title="Qui, quand, quoi">Historique</button>` : ''}</span></span>`;
  }
  const optionsResponsable = sel => {
    const v = sel ? (sel.type === 'role' ? `role:${sel.role}` : `user:${sel.id}`) : '';
    const us = (cfg.utilisateurs ? essai(cfg.utilisateurs) || [] : []).filter(u => u && u.id).slice().sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'));
    const bureau = us.filter(u => ['admin', 'charge'].includes(u.role)), terrain = us.filter(u => !['admin', 'charge'].includes(u.role));
    const opt = (val, lib) => `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(lib)}</option>`;
    return `<option value="">— Aucun —</option><optgroup label="Rôles">${ROLES.map(([k, l]) => opt(`role:${k}`, l)).join('')}</optgroup>
      ${bureau.length ? `<optgroup label="Bureau">${bureau.map(u => opt(`user:${u.id}`, u.nom)).join('')}</optgroup>` : ''}${terrain.length ? `<optgroup label="Compagnons">${terrain.map(u => opt(`user:${u.id}`, u.nom)).join('')}</optgroup>` : ''}
      ${v.startsWith('user:') && !us.some(u => `user:${u.id}` === v) ? opt(v, sel.nom || sel.id) : ''}`;
  };
  const lireResponsable = val => {
    if (!val) return null;
    const [t, k] = [val.slice(0, val.indexOf(':')), val.slice(val.indexOf(':') + 1)];
    if (t === 'role') return { type: 'role', role: k };
    const u = (cfg.utilisateurs ? essai(cfg.utilisateurs) || [] : []).find(x => x.id === k);
    return { type: 'user', id: k, nom: u ? u.nom : k };
  };
  const ouvrir = html => (typeof Modal !== 'undefined' ? Modal.open(html) : null);
  const fermer = () => { if (typeof Modal !== 'undefined') Modal.close(); };
  const titreDe = (et, id) => { const e = (etapesEtude(et) || []).find(x => x.id === id); return e ? e.titre : id; };
  function dialogueAffecter(et, id, apres) {
    const s = suivi(et, id);
    const b = ouvrir(`<h2>Affecter l'étape</h2><p><strong>${esc(titreDe(et, id))}</strong></p>
      <label>Responsable<select id="se-resp">${optionsResponsable(s.responsable)}</select></label>
      <label>Échéance<input type="date" id="se-ech" value="${esc(s.echeance || '')}"></label>
      <p class="petit muted">La personne est relancée dans Pipe-Fit deux jours avant l'échéance et le jour où elle est dépassée.</p>
      <div class="actions"><button class="secondaire" id="se-x">Annuler</button><button id="se-ok">Enregistrer</button></div>`);
    if (!b) return;
    b.querySelector('#se-x').onclick = fermer;
    b.querySelector('#se-ok').onclick = () => {
      affecter(et, id, { responsable: lireResponsable(b.querySelector('#se-resp').value), echeance: b.querySelector('#se-ech').value }, moi());
      fermer(); sauver(et); if (apres) apres();
    };
  }
  function dialogueSansObjet(et, id, apres) {
    const b = ouvrir(`<h2>Étape sans objet</h2><p><strong>${esc(titreDe(et, id))}</strong></p>
      <label>Motif (obligatoire)<textarea id="se-motif" rows="3" placeholder="Ex. pas de désenfumage mécanique dans ce bâtiment (CCTP § 4.2)"></textarea></label>
      <p class="petit muted">L'étape compte comme faite et n'est plus signalée par le contrôle de l'étude. Le motif, la personne et la date sont gardés dans l'historique.</p>
      <p class="erreur" id="se-err" hidden>Indiquez le motif.</p>
      <div class="actions"><button class="secondaire" id="se-x">Annuler</button><button id="se-ok">Sans objet</button></div>`);
    if (!b) return;
    b.querySelector('#se-x').onclick = fermer;
    b.querySelector('#se-ok').onclick = () => {
      const m = b.querySelector('#se-motif').value.trim();
      if (!m) { b.querySelector('#se-err').hidden = false; b.querySelector('#se-motif').focus(); return; }
      marquerSansObjet(et, id, m, moi()); fermer(); sauver(et); if (apres) apres();
    };
  }
  const ligneHistorique = h => `<tr><td class="petit">${esc(new Date(h.le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}</td><td>${esc(h.par || '—')}</td><td>${esc(ACTIONS[h.action] || h.action)}</td><td class="petit">${esc(h.detail || '')}</td></tr>`;
  function dialogueHistorique(et, id) {
    const h = historique(et, id).reverse(), t = suivi(et, id).faitTerrain;
    const b = ouvrir(`<h2>Historique de l'étape</h2><p><strong>${esc(titreDe(et, id))}</strong></p>
      ${h.length ? `<div class="defile-x"><table class="liste"><thead><tr><th>Quand</th><th>Qui</th><th>Quoi</th><th>Détail</th></tr></thead><tbody>${h.map(ligneHistorique).join('')}</tbody></table></div>` : '<p class="muted">Rien de noté pour l\'instant.</p>'}
      ${t && t.photoId ? `<p><a href="/api/pf/fichier/${encodeURIComponent(t.photoId)}" target="_blank" rel="noopener">📷 Photo prise sur le terrain</a></p>` : ''}
      <div class="actions"><button id="se-x">Fermer</button></div>`);
    if (b) b.querySelector('#se-x').onclick = fermer;
  }
  // Branche les boutons de htmlEtape / carte sous root ; rafraichir() après chaque modification
  function lier(root, et, rafraichir) {
    if (!root) return;
    const apres = () => { if (rafraichir) rafraichir(); };
    root.querySelectorAll('[data-suivi-action]').forEach(b => b.onclick = ev => {
      ev.preventDefault(); ev.stopPropagation();
      const id = b.dataset.suiviId, a = b.dataset.suiviAction;
      if (a === 'affecter') return dialogueAffecter(et, id, apres);
      if (a === 'sans-objet') return dialogueSansObjet(et, id, apres);
      if (a === 'retablir') { retablir(et, id, moi()); sauver(et); return apres(); }
      if (a === 'historique') return dialogueHistorique(et, id);
    });
    root.querySelectorAll('[data-suivi-filtre]').forEach(b => b.onclick = () => { filtreCarte = b.dataset.suiviFiltre; apres(); });
    const pdf = root.querySelector('[data-suivi-pdf]');
    if (pdf) pdf.onclick = () => genererPdf(et);
  }

  // Carte « Suivi des étapes » de l'étude : Mes étapes / en retard / toutes / sans objet
  let filtreCarte = 'mes';
  const FILTRES = [['mes', 'Mes étapes'], ['retard', 'En retard'], ['restes', 'À faire'], ['sans-objet', 'Sans objet']];
  function carte(et) {
    if (!et || et.modele) return '';
    const brutes = etapesEtude(et);
    if (!brutes || !brutes.length) return '';
    const d = decorer(et, brutes, { today: today() }), u = moi(), ctx = { chargeId: cfg.chargeDe ? essai(() => cfg.chargeDe(et.affaireId)) : '' };
    const mes = u ? mesEtapes(d, u, ctx) : [], av = avancement(et, d, today());
    const liste = filtreCarte === 'mes' ? mes : filtreCarte === 'retard' ? d.filter(e => e.etatEcheance === 'retard') : filtreCarte === 'sans-objet' ? d.filter(e => e.sansObjet) : restes(d);
    const parPhase = PHASES.filter(([k]) => av.phases[k]).map(([k]) => `<span class="suivi-phase" title="${esc(PHASE[k].libelle)} : ${av.phases[k].faits} / ${av.phases[k].total}">${PHASE[k].ico} ${esc(PHASE[k].libelle)} <strong>${Math.round(av.phases[k].faits / av.phases[k].total * 100)} %</strong></span>`).join('');
    const nb = { mes: mes.length, retard: av.retards, restes: av.total - av.faits, 'sans-objet': av.sansObjet };
    return `<details class="carte suivi-etapes" id="suivi-etapes"${mes.length || av.retards ? ' open' : ''}><summary><strong>👥 Suivi des étapes</strong> <span class="muted petit">${av.pct} % · ${mes.length} pour moi${av.retards ? ` · <span class="txt-erreur">${av.retards} en retard</span>` : ''}</span></summary>
      <div class="suivi-phases">${parPhase}</div>
      <div class="suivi-filtres" role="group" aria-label="Étapes affichées">${FILTRES.map(([k, l]) => `<button type="button" class="${filtreCarte === k ? '' : 'secondaire '}petit" data-suivi-filtre="${k}" aria-pressed="${filtreCarte === k}">${esc(l)} (${nb[k]})</button>`).join('')}
        <span class="espace"></span><button type="button" class="secondaire petit" data-suivi-pdf="1" title="Phases, %, étapes restantes par responsable, retards, sans objet et dernières actions">🖨️ État d'avancement PDF</button></div>
      ${liste.length ? `<ul class="suivi-liste">${liste.map(e => `<li class="${e.etatEcheance === 'retard' ? 'suivi-retard' : ''}"><span class="guide-txt"><span class="petit muted">${PHASE[e.phase].ico} ${esc(PHASE[e.phase].libelle)}</span><strong>${esc(e.titre)}</strong>${e.sansObjet ? `<span class="petit">Motif : ${esc(e.motif)}${e.sansObjetPar ? ` (${esc(e.sansObjetPar)}, ${dateFr(jour(e.sansObjetLe))})` : ''}</span>` : e.info ? `<span class="petit">${esc(e.info)}</span>` : ''}</span>${htmlEtape(et, e)}</li>`).join('')}</ul>`
        : `<p class="muted petit">${filtreCarte === 'mes' ? 'Aucune étape ne vous est affectée : « À faire » pour affecter les étapes.' : 'Aucune étape.'}</p>`}</details>`;
  }

  /* ---------- Synthèse imprimable « État d'avancement » ---------- */
  function htmlPdf(et, opts = {}) {
    const brutes = opts.etapes || etapesEtude(et) || [], t = opts.today || today(), d = decorer(et, brutes, { today: t }), av = avancement(et, d, t);
    const parResp = new Map();
    restes(d).forEach(e => { const k = e.responsable ? libelleResponsable(e.responsable) : 'Non affectées'; if (!parResp.has(k)) parResp.set(k, []); parResp.get(k).push(e); });
    const actions = d.flatMap(e => e.historique.map(h => ({ ...h, titre: e.titre }))).sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, 15);
    const so = d.filter(e => e.sansObjet), retards = d.filter(e => e.etatEcheance === 'retard');
    return `<div class="doe-doc ndc"><h2>ÉTAT D'AVANCEMENT</h2><p class="petit">${esc(et.objet || '')}${opts.affaire ? ` — ${esc(opts.affaire)}` : ''} — indice ${esc(et.indice || '')} — le ${dateFr(t)}</p>
      <p><strong>Avancement global : ${av.pct} %</strong> (${av.faits} étape(s) faite(s) sur ${av.total}${av.sansObjet ? `, dont ${av.sansObjet} sans objet` : ''})${av.retards ? ` — <strong>${av.retards} étape(s) en retard</strong>` : ''}</p>
      <h3>Phases</h3><table class="tn"><thead><tr><th>Phase</th><th>Faites</th><th>Total</th><th>%</th></tr></thead><tbody>${PHASES.filter(([k]) => av.phases[k]).map(([k]) => `<tr><td>${esc(PHASE[k].libelle)}</td><td>${av.phases[k].faits}</td><td>${av.phases[k].total}</td><td>${Math.round(av.phases[k].faits / av.phases[k].total * 100)} %</td></tr>`).join('')}</tbody></table>
      ${retards.length ? `<h3>Retards</h3><table class="tn"><thead><tr><th>Étape</th><th>Responsable</th><th>Échéance</th></tr></thead><tbody>${retards.map(e => `<tr><td>${esc(e.titre)}</td><td>${esc(libelleResponsable(e.responsable) || '—')}</td><td>${dateFr(e.echeance)}</td></tr>`).join('')}</tbody></table>` : ''}
      <h3>Étapes restantes par responsable</h3>${parResp.size ? [...parResp.entries()].map(([k, l]) => `<h4>${esc(k)} (${l.length})</h4><table class="tn"><thead><tr><th>Phase</th><th>Étape</th><th>Échéance</th></tr></thead><tbody>${l.map(e => `<tr><td>${esc(PHASE[e.phase].libelle)}</td><td>${esc(e.titre)}</td><td>${e.echeance ? `${dateFr(e.echeance)}${e.etatEcheance === 'retard' ? ' (en retard)' : ''}` : '—'}</td></tr>`).join('')}</tbody></table>`).join('') : '<p>Aucune étape restante.</p>'}
      ${so.length ? `<h3>Étapes sans objet</h3><table class="tn"><thead><tr><th>Étape</th><th>Motif</th><th>Par, le</th></tr></thead><tbody>${so.map(e => `<tr><td>${esc(e.titre)}</td><td>${esc(e.motif)}</td><td>${esc(e.sansObjetPar)}${e.sansObjetLe ? `, ${dateFr(jour(e.sansObjetLe))}` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
      ${actions.length ? `<h3>Dernières actions</h3><table class="tn"><thead><tr><th>Date</th><th>Qui</th><th>Action</th><th>Étape</th></tr></thead><tbody>${actions.map(h => `<tr><td>${dateFr(jour(h.le))}</td><td>${esc(h.par || '—')}</td><td>${esc(String(ACTIONS[h.action] || h.action).replace(/^\S+\s/, ''))}${h.detail ? ` : ${esc(h.detail)}` : ''}</td><td>${esc(h.titre)}</td></tr>`).join('')}</tbody></table>` : ''}</div>`;
  }
  async function genererPdf(et) {
    const b = ouvrir('<h2>État d\'avancement</h2><p>Mise en page…</p>');
    try {
      const a = cfg.affaireDe ? essai(() => cfg.affaireDe(et.affaireId)) : '';
      const html = htmlPdf(et, { affaire: a || '' }), conv = typeof pourPdf === 'function' ? pourPdf : x => x;
      const bytes = await PDF.depuisHTML(conv(html), 'État d\'avancement', null, { margeHaut: 36, margeBas: 36 });
      const nom = `Etat_avancement_${String(et.objet || 'etude').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').slice(0, 40)}.pdf`;
      b.innerHTML = `<h2>État d'avancement généré</h2><p><strong>${esc(nom)}</strong></p><div class="actions"><button class="secondaire" id="se-f">Fermer</button><button id="se-dl">Télécharger le PDF</button></div>`;
      b.querySelector('#se-f').onclick = fermer;
      b.querySelector('#se-dl').onclick = () => (typeof enregistrerFichier === 'function' ? enregistrerFichier(b, nom, bytes, 'application/pdf') : null);
    } catch (e) { if (b) b.innerHTML = `<h2>Génération impossible</h2><p class="erreur">${esc(e.message)}</p><div class="actions"><button id="se-f">Fermer</button></div>`; const f = b && b.querySelector('#se-f'); if (f) f.onclick = fermer; }
  }

  return { PHASES, PHASE, PHASES_TERRAIN, ROLES, ROLE, ROLES_COMPTE, normPhase, phaseDe, libelleResponsable, responsableValide, correspond, suivi, historique, estSansObjet,
    affecter, marquerSansObjet, retablir, noterFait, noterRouvert, suivreEtats, fusionnerTerrain, etatEcheance, decorer, mesEtapes, avancement, mettreAJour, etapesEtude,
    portefeuille, responsables, etapesPour, relances, purgerDeja, configurer, htmlEtape, lier, carte, htmlPdf, genererPdf, dialogueHistorique, ACTIONS };
})();
if (typeof module !== 'undefined') module.exports = SuiviEtapes;
