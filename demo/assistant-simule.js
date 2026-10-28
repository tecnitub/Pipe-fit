// Démonstration : assistant simulé, sans IA ni clé. Il reconnaît surtout les commandes, les demandes de prix, les
// demandes de matériel des compagnons, le point sur un chantier et le planning, avec les mêmes règles que le vrai
// (brouillon seulement, droits du compte, coches des compagnons). Utilisé par demo/backend.js.
const AssistantSimule = (() => {
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const eur = v => `${(Math.round(v * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  // « jeudi », « demain », « le 12/11 » -> date (prochaine occurrence)
  function dateDite(t) {
    const n = norm(t), d = new Date();
    if (/\bdemain\b/.test(n)) { d.setDate(d.getDate() + 1); return iso(d); }
    const m = /\b(\d{1,2})[/.](\d{1,2})\b/.exec(n);
    if (m) { const x = new Date(d.getFullYear(), +m[2] - 1, +m[1]); if (x < d) x.setFullYear(x.getFullYear() + 1); return iso(x); }
    const j = JOURS.findIndex(x => new RegExp(`\\b${x}\\b`).test(n));
    if (j >= 0) { const ecart = ((j - d.getDay()) + 7) % 7 || 7; d.setDate(d.getDate() + ecart); return iso(d); }
    return '';
  }
  const actifs = db => db.affaires.filter(a => !a.archive && ['En préparation', 'En cours', 'Ouvert'].includes(a.statut));
  function chantierDe(db, t) {
    const n = norm(t), code = /\b(?:ch|hd)-\d{4}-\d{3}\b/.exec(n);
    if (code) return db.affaires.find(a => norm(a.code) === code[0]);
    const nomEnt = id => (db.entreprises.find(e => e.id === id) || {}).nom || '';
    const notes = actifs(db).map(a => ({ a, s: norm(`${a.nom} ${nomEnt(a.clientId)}`).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !['ligne', 'usine', 'remplacement', 'renovation'].includes(w) && n.includes(w)).length }));
    const best = notes.sort((x, y) => y.s - x.s)[0];
    return best && best.s ? best.a : null;
  }
  // Fournisseur cité : la plupart des mots de son nom dans la demande (« inox » seul ne désigne pas « Inox Distribution Rhône-Alpes »)
  const fournisseursCites = (db, t) => {
    const mots = norm(t).split(/[^a-z0-9]+/);
    return db.entreprises.filter(e => /fournisseur/i.test(e.categorie || '')).map(e => { const w = norm(e.nom).split(/[^a-z0-9]+/).filter(x => x.length >= 3); return { e, s: w.length ? w.filter(x => mots.includes(x)).length / w.length : 0 }; })
      .filter(x => x.s >= 0.5).sort((a, b) => b.s - a.s).map(x => x.e);
  };
  // Lignes de matériel : après « : » s'il y en a un, analysées comme une dictée puis rapprochées de la bibliothèque
  function lignesDe(db, t) {
    const partie = t.includes(':') ? t.slice(t.indexOf(':') + 1) : t;
    const propre = partie.replace(/,?\s*(livraison|pour|sur le chantier|sur le site|à livrer)\b.*$/i, '');
    const fournisseurDe = a => (db.entreprises.find(e => e.id === a.fournisseurId) || {}).nom || '';
    return DicteeMateriel.analyser(propre).map(l => {
      const r = DicteeMateriel.rapprocher(l, db.articles, fournisseurDe), a = r.statut === 'trouve' || r.statut === 'choix' ? r.article : null;
      return { articleId: a ? a.id : '', designation: a ? a.designation : l.texte, unite: l.unite || (a && a.unite) || 'u', qte: l.qte, pu: a ? Number(a.coutRevient) || 0 : 0, ...(a && a.ref ? { refFournisseur: a.ref } : {}), _sur: !a || r.statut === 'choix' };
    }).filter(l => l.qte > 0 && l.designation);
  }

  // -> { texte, actions } ; creer(col, obj) enregistre et renvoie l'enregistrement ; notifier(obj)
  function repondre({ db, acc, acces, texte, creer, notifier }) {
    const n = norm(texte), a = chantierDe(db, texte), userName = id => (db.users.find(u => u.id === id) || {}).nom || '';
    const nomEnt = id => (db.entreprises.find(e => e.id === id) || {}).nom || '';
    const veut = re => re.test(n);
    // Planning
    if (veut(/planning|ou (je suis|suis-je|bosse|travaille)|demain|semaine prochaine/) && !veut(/command|il me faut|besoin/) && (acces.bureau || acces.droits.includes('planning'))) {
      const u = acces.bureau ? db.users.find(x => x.nom && n.includes(norm(x.nom).split(' ')[0])) : db.users.find(x => x.id === acc.userId);
      if (!u) return { texte: 'De qui voulez-vous le planning ? (ex. « le planning de Kevin la semaine prochaine »)', actions: [] };
      const du = iso(new Date()), au = iso(new Date(Date.now() + 14 * 86400000));
      const l = db.planning.filter(p => p.userId === u.id && p.date >= du && p.date <= au).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 10);
      return { texte: l.length ? `Planning de ${u.nom} :\n${l.map(p => `• ${new Date(`${p.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })} : ${p.absence ? p.absence : `${(db.affaires.find(x => x.id === p.affaireId) || {}).code || ''} ${p.tache || ''}${p.debut ? ` (${p.debut}–${p.fin})` : ''}`}`).join('\n')}` : `Rien au planning de ${u.nom} dans les 14 prochains jours.`, actions: [] };
    }
    // Compagnon : demande de matériel transmise au bureau
    if (!acces.bureau) {
      if (veut(/signal|manque|probleme|reserve/) && acces.droits.includes('signaler')) {
        const dest = a && a.chargeId ? a.chargeId : 'u1';
        notifier({ type: 'assistant', userId: dest, affaireId: a ? a.id : '', titre: `Signalement${a ? ` — ${a.code}` : ''}`, texte: `${acc.nom} : ${texte}`.slice(0, 300), lien: a ? `#/chantier/${a.id}` : '', date: new Date().toISOString(), lu: false });
        return { texte: `C'est transmis à ${userName(dest) || 'au bureau'}.`, actions: [{ type: 'signalement', chantier: a ? a.code : '', sujet: texte.slice(0, 60) }] };
      }
      if (!acces.droits.includes('materiel')) return { texte: `Je peux vous aider pour : ${acces.droits.map(d => ({ planning: 'votre planning', chantier: 'les infos du chantier', signaler: 'signaler un problème', articles: 'trouver un article' }[d] || d)).join(', ')}.`, actions: [] };
      if (!a) return { texte: 'Pour quel chantier ? (nom ou code, ex. « Rumilly » ou « CH-2026-001 »)', actions: [] };
      const lignes = lignesDe(db, texte);
      if (!lignes.length) return { texte: 'Quel matériel vous faut-il, avec les quantités ? (ex. « 6 coudes 3D inox DN50 et 2 brides DN50 »)', actions: [] };
      const c = creer('commandes', { fournisseurId: '', affaireId: a.id, date: iso(new Date()), dateLivraison: dateDite(texte), statut: 'Brouillon', lignes: lignes.map(({ _sur, ...l }) => l), origine: 'assistant', demandePar: acc.nom });
      notifier({ type: 'assistant', userId: a.chargeId, affaireId: a.id, titre: `Demande de matériel — ${a.code}`, texte: `${acc.nom} : ${lignes.map(l => `${l.qte} ${l.unite} ${l.designation}`).join(', ')}`.slice(0, 300), lien: `#/commandes/${c.id}`, date: new Date().toISOString(), lu: false });
      return { texte: `Demande transmise à ${userName(a.chargeId) || 'le bureau'} pour ${a.code} :\n${lignes.map(l => `• ${l.qte} ${l.unite} ${l.designation}`).join('\n')}${c.dateLivraison ? `\nPour le ${new Date(`${c.dateLivraison}T12:00:00`).toLocaleDateString('fr-FR')}.` : ''}\nLe bureau choisit le fournisseur et valide.`,
        actions: [{ type: 'demande', id: c.id, numero: c.numero, chantier: `${a.code} ${a.nom}`, lignes: lignes.length }] };
    }
    // Bureau : point sur un chantier
    if (veut(/ou en est|point sur|etat du|avancement/) && a) {
      const cmds = db.commandes.filter(c => c.affaireId === a.id), h = db.temps.filter(t => t.affaireId === a.id).reduce((s, t) => s + (Number(t.heures) || 0), 0);
      return { texte: `${a.code} ${a.nom} — ${a.statut}, chargé d'affaires ${userName(a.chargeId)}.\n• ${Math.round(h)} h pointées\n• ${cmds.length} commande(s) : ${cmds.slice(0, 6).map(c => `${c.numero || 'brouillon'} ${nomEnt(c.fournisseurId)} (${c.statut})`).join(', ') || '—'}`, actions: [] };
    }
    const demandePrix = veut(/demande de prix|consult|devis fournisseur/), commande = veut(/command/);
    if (!demandePrix && !commande) return { texte: 'En démonstration, je sais : préparer une commande (« Commande chez Téréva pour Rumilly : 20 coudes 3D inox DN50, livraison jeudi »), une demande de prix, faire le point sur un chantier, donner le planning de quelqu\'un.', actions: [] };
    const fs = fournisseursCites(db, texte), lignes = lignesDe(db, texte);
    if (!fs.length) return { texte: `Chez quel fournisseur ? (${db.entreprises.filter(e => /fournisseur/i.test(e.categorie || '')).slice(0, 4).map(e => e.nom).join(', ')}…)`, actions: [] };
    if (!lignes.length) return { texte: 'Quelles fournitures, avec les quantités ?', actions: [] };
    const doutes = lignes.filter(l => l._sur).map(l => l.designation);
    if (demandePrix) {
      const c = creer('consultations', { objet: `Fournitures ${a ? a.code : ''}`.trim(), affaireId: a ? a.id : '', date: iso(new Date()), dateLimite: '', dateLivraison: dateDite(texte), statut: 'En cours',
        lignes: lignes.map(({ _sur, pu, refFournisseur, ...l }) => l), fournisseurs: fs.map(f => ({ entrepriseId: f.id, statut: 'À consulter' })), origine: 'assistant' });
      return { texte: `Demande de prix ${c.ref} préparée en brouillon pour ${fs.map(f => f.nom).join(' et ')}${a ? ` (${a.code})` : ''} : ${lignes.length} ligne(s).${doutes.length ? `\nÀ vérifier (hors bibliothèque ou plusieurs articles possibles) : ${doutes.join(', ')}.` : ''}\nOuvrez-la pour l'envoyer aux fournisseurs.`,
        actions: [{ type: 'consultation', id: c.id, numero: c.ref, fournisseurs: fs.map(f => f.nom), lignes: lignes.length }] };
    }
    const f = fs[0], total = lignes.reduce((s, l) => s + l.qte * l.pu, 0);
    const c = creer('commandes', { fournisseurId: f.id, affaireId: a ? a.id : '', date: iso(new Date()), dateLivraison: dateDite(texte), statut: 'Brouillon', lignes: lignes.map(({ _sur, ...l }) => l), origine: 'assistant', preparePar: acc.nom });
    return { texte: `Commande ${c.numero} préparée en brouillon chez ${f.nom}${a ? ` pour ${a.code} ${a.nom}` : ' (stock atelier)'} :\n${lignes.map(l => `• ${l.qte} ${l.unite} ${l.designation}${l.pu ? ` à ${eur(l.pu)}` : ' (prix à renseigner)'}`).join('\n')}\nTotal ${eur(total)} HT${c.dateLivraison ? `, livraison le ${new Date(`${c.dateLivraison}T12:00:00`).toLocaleDateString('fr-FR')}${a ? ' sur le chantier' : ''}` : ''}.${doutes.length ? `\nÀ vérifier : ${doutes.join(', ')}.` : ''}\nRien n'est envoyé : vérifiez puis « Valider et envoyer ».`,
      actions: [{ type: 'commande', id: c.id, numero: c.numero, fournisseur: f.nom, chantier: a ? `${a.code} ${a.nom}` : 'stock atelier', total: Math.round(total * 100) / 100, lignes: lignes.length }] };
  }
  return { repondre, dateDite };
})();
