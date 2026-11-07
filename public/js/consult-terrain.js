// Fournisseurs consultés par article et par famille, et demande de matériel du terrain envoyée automatiquement :
// chaque article de la bibliothèque a son fournisseur préféré et jusqu'à 3 autres fournisseurs à consulter ; une ligne
// libre prend ceux de sa famille (type de matériel). Les lignes d'une demande sont regroupées par fournisseurs : une
// consultation par groupe, envoyée par e-mail à chaque fournisseur à son adresse des demandes de prix.
// Module pur (navigateur, serveur, démo, tests).
const ConsultTerrain = (() => {
  const MAX_AUTRES = 3;
  const txt = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
  const uniques = ids => [...new Set((ids || []).map(x => txt(x, 64)).filter(Boolean))];
  // Fournisseur préféré puis les autres (3 au plus) d'un article
  const fournisseursArticle = a => uniques([a && a.fournisseurId, ...((a && a.fournisseursConsult) || [])]).slice(0, MAX_AUTRES + 1);
  // parFamille : { [famille]: { prefere, autres: [] } }
  const cleFamille = f => txt(f, 80).toLowerCase();
  function fournisseursFamille(parFamille, famille) {
    const k = cleFamille(famille), e = Object.entries(parFamille || {}).find(([f]) => cleFamille(f) === k);
    return e ? uniques([e[1].prefere, ...(e[1].autres || [])]).slice(0, MAX_AUTRES + 1) : [];
  }
  // Fournisseurs d'une ligne : ceux de l'article, sinon ceux de sa famille (ou de la famille de l'article)
  function fournisseursLigne(l, articles, parFamille) {
    const a = l.articleId && (articles || []).find(x => x.id === l.articleId);
    const f = a ? fournisseursArticle(a) : [];
    return f.length ? f : fournisseursFamille(parFamille, l.famille || (a && a.famille));
  }
  // Lignes nettoyées : article de la bibliothèque (désignation, référence, unité reprises) ou ligne libre avec sa famille
  function lignes(brutes, articles) {
    return (brutes || []).slice(0, 80).map(l => {
      const a = l.articleId && (articles || []).find(x => x.id === l.articleId), qte = Number(String(l.qte ?? '').replace(',', '.'));
      return { articleId: a ? a.id : '', designation: txt(a ? a.designation : l.designation, 200), ref: txt(a ? a.ref : l.ref, 60), famille: txt(a ? a.famille : l.famille, 80), unite: txt(a ? a.unite || 'u' : l.unite || 'u', 12), qte: Number.isFinite(qte) && qte > 0 ? qte : 0, note: txt(l.note, 200) };
    }).filter(l => l.designation && l.qte > 0);
  }
  // Groupes de lignes ayant les mêmes fournisseurs (une consultation chacun) ; lignes sans fournisseur : au bureau
  function grouper(ls, articles, parFamille) {
    const groupes = new Map(), sans = [];
    ls.forEach(l => {
      const f = fournisseursLigne(l, articles, parFamille);
      if (!f.length) return sans.push(l);
      const k = f.slice().sort().join('|');
      if (!groupes.has(k)) groupes.set(k, { fournisseurs: f, lignes: [] });
      groupes.get(k).lignes.push(l);
    });
    return { groupes: [...groupes.values()], sansFournisseur: sans };
  }
  // Adresse des demandes de prix du fournisseur : celle de sa fiche, sinon un contact commercial / ADV, sinon un
  // contact avec e-mail, sinon l'adresse générale
  const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  function adresse(ent, contacts) {
    if (!ent) return '';
    if (EMAIL.test(txt(ent.emailConsultation))) return txt(ent.emailConsultation);
    const cs = (contacts || []).filter(c => c.entrepriseId === ent.id && EMAIL.test(txt(c.email)));
    const com = cs.find(c => /commerc|devis|vente|adv|offre|achat|technico/i.test(`${c.fonction || ''} ${c.service || ''}`));
    return txt((com || cs[0] || {}).email) || (EMAIL.test(txt(ent.email)) ? txt(ent.email) : '');
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Message envoyé au fournisseur (sans pièce jointe : lisible sur un téléphone, réponse vers la boîte des offres)
  function message({ ref, chantier = {}, livraison = '', date = '', lignes: ls = [], demandeur = '', societe = '', note = '' }) {
    const sujet = `Demande de prix ${ref || ''}${chantier.code ? ` – chantier ${chantier.code}` : ''}`.trim();
    const html = `<p>Bonjour,</p><p>Merci de nous faire parvenir votre meilleure offre (prix nets et délai) pour le matériel ci-dessous${date ? `, livrable le <strong>${esc(date.split('-').reverse().join('/'))}</strong> au plus tard` : ''}.</p>
      <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><tr style="background:#eee"><th align="left">Désignation</th><th align="left">Référence</th><th align="right">Quantité</th><th>Unité</th></tr>
      ${ls.map(l => `<tr><td>${esc(l.designation)}${l.note ? `<br><small>${esc(l.note)}</small>` : ''}</td><td>${esc(l.ref)}</td><td align="right">${String(l.qte).replace('.', ',')}</td><td>${esc(l.unite)}</td></tr>`).join('')}</table>
      ${chantier.code || livraison ? `<p>Chantier : <strong>${esc([chantier.code, chantier.nom].filter(Boolean).join(' – '))}</strong>${livraison ? `<br>Livraison : ${esc(livraison)}` : ''}</p>` : ''}
      ${note ? `<p>${esc(note)}</p>` : ''}
      <p>Merci de rappeler la référence <strong>${esc(ref || '')}</strong> dans votre réponse.</p><p>Cordialement,<br>${esc(demandeur)}${societe ? `<br>${esc(societe)}` : ''}</p>`;
    return { sujet, html };
  }
  return { MAX_AUTRES, fournisseursArticle, fournisseursFamille, fournisseursLigne, lignes, grouper, adresse, message, EMAIL };
})();
if (typeof module !== 'undefined') module.exports = ConsultTerrain;
