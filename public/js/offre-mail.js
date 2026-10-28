// Offres fournisseurs reçues par e-mail (réponse du fournisseur ou e-mail transféré par un collègue) : reconnaissance de la
// consultation (son n° dans l'objet ou le message, sinon le code du chantier) et du fournisseur consulté (adresse e-mail,
// domaine, nom cité), puis rangement des pièces jointes dans son offre « reçue, à lire ». Module commun serveur / démo / tests.
const OffreMail = (() => {
  // Messageries grand public : leur domaine ne désigne pas une entreprise
  const COMMUNS = new Set(['gmail.com', 'outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr', 'live.fr', 'live.com', 'msn.com', 'yahoo.fr', 'yahoo.com', 'orange.fr', 'wanadoo.fr',
    'free.fr', 'sfr.fr', 'neuf.fr', 'laposte.net', 'icloud.com', 'me.com', 'bbox.fr', 'aol.com', 'gmx.fr', 'proton.me', 'protonmail.com']);
  const PIECE = /\.(pdf|jpe?g|png|webp|xlsx|xls|csv)$/i;
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const domaine = e => (String(e || '').toLowerCase().split('@')[1] || '').trim();
  const echap = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cite = (code, texte) => !!code && new RegExp(`(^|[^A-Za-z0-9])${echap(code)}($|[^A-Za-z0-9])`, 'i').test(texte);
  const emailsDans = t => [...new Set((String(t || '').match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || []).map(x => x.toLowerCase()))];
  // Texte d'un message HTML (recherche des n°, adresses et noms)
  const texteDe = html => String(html || '').replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

  // mail : { objet, texte, deEmail } ; d : { consultations, entreprises, contacts, affaires, internes (adresses ou domaines de l'entreprise) }
  // Renvoie { consultation, fournisseurId (ou '' si à classer), raison } ou null
  function reconnaitre(mail, d) {
    const texte = `${mail.objet || ''}\n${mail.texte || ''}`, nt = norm(texte);
    const internes = new Set((d.internes || []).map(x => String(x).toLowerCase()).flatMap(x => (x.includes('@') ? [x, domaine(x)] : [x])));
    const estInterne = e => internes.has(e) || internes.has(domaine(e));
    const consultations = d.consultations || [];
    let cands = consultations.filter(c => cite(c.ref, texte)), raison = cands.length ? `n° ${cands[0].ref}` : '';
    if (!cands.length) {
      const chantiers = (d.affaires || []).filter(a => cite(a.code, texte));
      cands = consultations.filter(c => c.statut === 'En cours' && chantiers.some(a => a.id === c.affaireId));
      if (cands.length) raison = `chantier ${chantiers.find(a => a.id === cands[0].affaireId).code}`;
    }
    if (!cands.length) return null;
    const enCours = cands.filter(c => c.statut === 'En cours');
    if (enCours.length) cands = enCours;
    // Fournisseur : adresse exacte (3), même domaine d'entreprise (2), nom cité dans le message (1) ; l'expéditeur interne
    // (collègue qui transfère) est ignoré, les adresses citées dans le message transféré comptent
    const emails = [mail.deEmail, ...emailsDans(texte)].map(e => String(e || '').toLowerCase()).filter(e => e && !estInterne(e));
    const ent = id => (d.entreprises || []).find(e => e.id === id) || {};
    let meilleur = null;
    cands.forEach(c => (c.fournisseurs || []).forEach(f => {
      const e = ent(f.entrepriseId), adresses = [e.email, ...(d.contacts || []).filter(k => k.entrepriseId === f.entrepriseId).map(k => k.email)].map(x => String(x || '').toLowerCase()).filter(Boolean);
      const doms = new Set(adresses.map(domaine).filter(x => x && !COMMUNS.has(x)));
      let score = 0;
      if (emails.some(x => adresses.includes(x))) score = 3;
      else if (emails.some(x => doms.has(domaine(x)))) score = 2;
      else if (norm(e.nom).length >= 4 && nt.includes(norm(e.nom))) score = 1;
      if (score && f.statut !== 'Offre reçue') score += 0.5;
      if (score && (!meilleur || score > meilleur.score)) meilleur = { score, c, f };
    }));
    if (meilleur) return { consultation: meilleur.c, fournisseurId: meilleur.f.entrepriseId, raison };
    // Une seule consultation et un seul fournisseur encore attendu : c'est lui
    if (cands.length === 1) {
      const attendus = (cands[0].fournisseurs || []).filter(f => !['Offre reçue', 'Décline'].includes(f.statut));
      if (attendus.length === 1) return { consultation: cands[0], fournisseurId: attendus[0].entrepriseId, raison: `${raison}, seul fournisseur attendu` };
    }
    return { consultation: cands[0], fournisseurId: '', raison };
  }

  // Range les pièces (déjà enregistrées : { id, nom }) dans l'offre du fournisseur, ou parmi les offres à classer
  function appliquer(c, fournisseurId, pieces, mail) {
    const recu = { de: String(mail.de || '').slice(0, 120), deEmail: String(mail.deEmail || '').slice(0, 200), objet: String(mail.objet || '').slice(0, 200), recuLe: mail.recuLe || new Date().toISOString() };
    const f = fournisseurId && (c.fournisseurs || []).find(x => x.entrepriseId === fournisseurId);
    if (!f) {
      c.offresAClasser = [...(c.offresAClasser || []), { pieces, mail: recu }];
      return { classee: false };
    }
    const o = f.offre || {};
    f.offre = { ...o, prix: o.prix || {}, pieceId: pieces[0] ? pieces[0].id : o.pieceId || '', pieceNom: pieces[0] ? pieces[0].nom : o.pieceNom || '', pieces, aLire: true, mail: recu, date: (recu.recuLe || '').slice(0, 10) };
    f.statut = 'Offre reçue';
    return { classee: true };
  }

  return { reconnaitre, appliquer, texteDe, emailsDans, PIECE, COMMUNS };
})();
if (typeof module !== 'undefined') module.exports = OffreMail;
