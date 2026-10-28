// Classement des documents de chantier : catégories, catégorie devinée d'après le nom du fichier, noms des dossiers
// du répertoire synchronisé sur le serveur (<racine>/Chantiers/<code> - <nom>/<catégorie>/<fichier>).
// Module commun navigateur / serveur / tests.
const Classement = (() => {
  const CATEGORIES = ['Demande client', 'CCTP', 'Plan', 'Fiche technique', 'Notice', 'Sécurité / PPSPS', 'PGC', 'Plan de prévention', 'Photo', 'Autre'];
  const categorieDevinee = nom => (/\.(eml|msg)$/i.test(nom) ? 'Demande client' : /\bcctp\b|clauses techniques/i.test(nom) ? 'CCTP' : /\bpgc\b|g[ée]n[ée]ral de coordination/i.test(nom) ? 'PGC'
    : /plan.de.pr[ée]vention|\bpdp\b/i.test(nom) ? 'Plan de prévention' : /\.(dwg|dxf|ifc)$|plan|iso(m[ée]trique)?\b|p&?id|implantation|coupe|synoptique/i.test(nom) ? 'Plan'
      : /fiche|\bft\b|datasheet|technique|catalogue/i.test(nom) ? 'Fiche technique' : /notice|manuel|mode d.emploi/i.test(nom) ? 'Notice'
        : /ppsps|s[ée]curit|pr[ée]vention|amiante|permis/i.test(nom) ? 'Sécurité / PPSPS' : /\.(jpe?g|png|webp)$/i.test(nom) ? 'Photo' : 'Autre');

  // Nom de fichier ou de dossier valable sous Windows, Linux et macOS (partage réseau)
  const RESERVES = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
  function propre(s, max = 120) {
    let x = String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim();
    if (x.length > max) { const ext = (/\.[a-z0-9]{1,5}$/i.exec(x) || [''])[0]; x = x.slice(0, max - ext.length).trim() + ext; }
    x = x.replace(/[. ]+$/, '');
    if (RESERVES.test(x)) x = `_${x}`;
    return x || 'document';
  }
  const dossierChantier = a => propre(`${a.code || a.id}${a.nom ? ` - ${a.nom}` : ''}`, 90);
  const dossierCategorie = c => propre(CATEGORIES.includes(c) ? c : 'Autre');
  // Dossier de premier niveau -> catégorie (insensible à la casse et aux accents)
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const categorieDuDossier = d => CATEGORIES.find(c => norm(dossierCategorie(c)) === norm(d)) || null;
  // Dossiers techniques du répertoire, jamais importés
  const ANCIENS = '_Indices précédents', CORBEILLE = '_Corbeille';
  const ignore = nom => /^[.~]|^~\$|^(thumbs\.db|desktop\.ini|\.ds_store)$|\.(tmp|part|crdownload)$/i.test(nom) || nom === ANCIENS || nom === CORBEILLE;

  return { CATEGORIES, categorieDevinee, propre, dossierChantier, dossierCategorie, categorieDuDossier, ANCIENS, CORBEILLE, ignore };
})();
if (typeof module !== 'undefined') module.exports = Classement;
