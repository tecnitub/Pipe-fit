// Bibliothèque des fiches techniques des fabricants : chaque PDF (dossier du serveur, dépôt dans l'appli, lien d'un
// catalogue fournisseur) est rangé par fabricant et par références ; on retrouve la fiche d'un matériel d'après son
// fabricant et sa référence exacte (« DFC 160 » = « DFC-160 » ; une fiche de gamme « DFC » sert à « DFC 160 B »),
// dans la version en vigueur à une date (pose), les versions plus anciennes restant marquées « remplacée ».
// Module commun serveur / navigateur / tests.
const FichesTech = (() => {
  const sansAccents = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Clé d'une référence : majuscules, sans espaces, tirets ni points
  const cle = ref => sansAccents(ref).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleFab = f => sansAccents(f).toLowerCase().replace(/[^a-z0-9]/g, '');
  const memeFab = (a, b) => { const x = cleFab(a), y = cleFab(b); return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)))); };

  // Mots qui ressemblent à une référence mais n'en sont pas : normes, diamètres, indices, fluides, unités, dates
  const PAS_REF = /^(?:ISO|EN|NF|NFEN|DIN|DTU|DN|PN|IP|IK|CE|RAL|HZ|KW|KWH|PAGE|ART|ARTICLE|REV|V|VER|VERSION|ED|R\d{2,4}[A-Z]?|ERP|ECO|A\+*|CLASSE|TYPE|NO|N|FIG|TAB|ANNEXE|EDITION|CEDEX|BP|CS|TEL|FAX|SIRET|APE|TVA|RCS)$/;
  function referencesDans(texte) {
    const t = String(texte || ''), out = [];
    // Mots courants accrochés en fin de référence (« DFC 160 DE MARQUE ») : retirés
    const VIDES = /(?:\s+(?:DE|DU|DES|LA|LE|LES|ET|EN|AU|AUX|OU|A|AVEC|POUR|SUR|PAR|THE|AND|FOR))+$/;
    const ajouter = r => {
      const x = String(r || '').replace(/[,;:)\]]+$/, '').replace(/\s{2,}/g, ' ').trim().replace(VIDES, '');
      const k = cle(x), lettres = /[A-Z]/.test(k), chiffres = /\d/.test(k);
      if (k.length < 3 || k.length > 30 || !(lettres && chiffres) || PAS_REF.test(cle(x.split(/[\s-]/)[0])) && x.split(/[\s-]/).length <= 2 || /^\d{1,2}[A-Z]?$/.test(k) || /^(?:19|20)\d{2}$/.test(k)) return;
      if (/^\d+(?:[.,]\d+)?\s*(?:mm|m|kg|kw|w|v|a|pa|db|l|m3|bar|°c|hz|%)$/i.test(x)) return;
      if (!out.some(y => cle(y) === k)) out.push(x);
    };
    // Après « Référence », « Réf. », « Modèle », « Type », « Code article »
    for (const m of t.matchAll(/(?:r[ée]f[ée]rences?|r[ée]f\.?|mod[eè]les?|code(?: article| produit)?)\s*[:\-–n°]*\s*([A-Z0-9][A-Za-z0-9.\-/+]*(?: [A-Z0-9][A-Za-z0-9.\-/+]*){0,2})/gi)) ajouter(m[1]);
    // Mots mêlant lettres et chiffres (« DFC-160 », « PWE N 511 KR », « CAD HR 3000 »)
    for (const m of t.matchAll(/\b([A-Z]{1,6}(?![A-Z])(?:[ -][A-Z]{1,4}(?![A-Z]))?[ -]?\d{2,5}(?:[ .\-/]?[A-Z0-9]{1,6}(?![A-Za-z0-9])){0,2})/g)) ajouter(m[1]);
    return out.slice(0, 30);
  }

  // Date de la fiche : « Édition 03/2024 », « Version du 12/01/2023 », « Mise à jour : janvier 2024 », sinon celle du fichier
  const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  function dateDans(texte) {
    const x = sansAccents(texte).toLowerCase();
    const m = /(?:edition|version|mise a jour|maj|revision|rev\.?|date|indice \w+ du|du)\s*[:\-–]?\s*(?:du\s*)?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})|(?:edition|version|mise a jour|maj|revision|rev\.?)\s*[:\-–]?\s*(?:(\d{1,2})[/.-](\d{4})|([a-z]+)\s+(\d{4})|(\d{4}))/.exec(x);
    if (!m) return '';
    if (m[1]) { const a = m[3].length === 2 ? `20${m[3]}` : m[3]; return +m[2] >= 1 && +m[2] <= 12 ? `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; }
    if (m[4]) return +m[4] >= 1 && +m[4] <= 12 ? `${m[5]}-${m[4].padStart(2, '0')}-01` : '';
    if (m[6] && MOIS.includes(m[6])) return `${m[7]}-${String(MOIS.indexOf(m[6]) + 1).padStart(2, '0')}-01`;
    if (m[8] && +m[8] > 1990 && +m[8] < 2100) return `${m[8]}-01-01`;
    return '';
  }

  // Famille du matériel (même découpage que le catalogue matériel des études)
  const FAMILLES = [['bouche', /bouches?|diffuseurs?|grilles?|anemostat|buses?/], ['cta', /centrale de traitement|\bcta\b|double flux/], ['caisson', /caissons?|extracteurs?|ventilateurs?|tourelles?|\bvmc\b/],
    ['pac', /pompes? a chaleur|\bpac\b|groupes? (?:froid|d'eau glacee)|refroidisseur|chiller/], ['generateur', /chaudieres?|generateurs?|bruleurs?/], ['pompe', /circulateurs?|pompes?|surpresseur/],
    ['vanne', /vannes?|robinets?|clapets?/], ['vase', /vases? d'expansion/], ['echangeur', /echangeurs?/], ['ballon', /ballons?|preparateurs?|chauffe-eau|tampon/],
    ['regulation', /regulat|sondes?|automates?|thermostats?|capteurs?/], ['split', /splits?|unites? (?:interieure|exterieure)|\bdrv\b|\bvrv\b/], ['ventilo', /ventilo-?convecteurs?|cassettes?/], ['radiateur', /radiateurs?|panneaux? rayonnants?/]];
  const familleDe = t => { const x = sansAccents(t).toLowerCase(); return (FAMILLES.find(([, re]) => re.test(x)) || [''])[0]; };

  // Dossiers qui ne nomment pas un fabricant
  const GENERIQUE = /^(?:fiches?(?: techniques?)?|ft|divers|autres?|a classer|documentation|docs?|pdf|catalogues?|nouveau dossier|new folder|archives?)$/i;
  // Fiche lue : fabricant (premier dossier sous la racine, sinon fabricant connu cité dans le nom ou le texte), références
  // (nom du fichier d'abord, puis texte), désignation, famille, date
  function analyser({ nom = '', chemin = '', texte = '', fabricants = [], dateFichier = '' } = {}) {
    const base = String(nom).replace(/\.[a-z0-9]+$/i, ''), dossiers = String(chemin).split(/[\\/]/).slice(0, -1).filter(d => d && !GENERIQUE.test(d.trim()));
    const debut = String(texte).slice(0, 3000);
    let fabricant = dossiers[0] || '';
    if (!fabricant) fabricant = (fabricants || []).filter(Boolean).sort((a, b) => b.length - a.length).find(f => cleFab(f).length >= 3 && (cleFab(base).includes(cleFab(f)) || cleFab(debut.slice(0, 1500)).includes(cleFab(f)))) || '';
    if (!fabricant) { const w = /www\.([a-z0-9-]{3,30})\.(?:com|fr|de|it|eu|net)/i.exec(debut); if (w) fabricant = w[1].replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()); }
    // Nom du fichier : « DFC-160_fiche » → DFC-160 ; le fabricant écrit dans le nom n'est pas une référence
    const nomSans = base.replace(/[_]+/g, ' ').replace(new RegExp(fabricant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
    const refsNom = referencesDans(nomSans.toUpperCase()), refsTexte = referencesDans(debut);
    const references = [...refsNom, ...refsTexte.filter(r => !refsNom.some(y => cle(y) === cle(r)))].slice(0, 20);
    const ligne = String(texte).split(/\n/).map(l => l.trim()).find(l => l.length >= 8 && l.length <= 90 && /[a-z]{3}/i.test(l) && !/www\.|@|t[ée]l|page|\d{5}/i.test(l));
    // Désignation : le nom du fichier s'il est parlant (deux mots au moins), sinon le titre lu dans le PDF
    const parlant = (base.replace(/[_-]+/g, ' ').match(/[A-Za-zÀ-ÿ]{3,}/g) || []).length >= 2;
    const designation = (parlant || !ligne ? base.replace(/[_]+/g, ' ').trim() : ligne).slice(0, 120);
    return { fabricant: fabricant.trim().slice(0, 60), references, designation, famille: familleDe(`${base} ${debut.slice(0, 800)}`), date: dateDans(debut) || String(dateFichier || '').slice(0, 10) };
  }

  // Score d'une fiche pour une référence : identique 100 ; fiche de gamme (référence demandée plus longue) 85 ;
  // fiche plus précise 75 ; contenue 60 ; fabricant différent : écartée si les deux sont connus
  function score(f, fabricant, reference) {
    const k = cle(reference);
    if (k.length < 3) return 0;
    if (fabricant && f.fabricant && !memeFab(fabricant, f.fabricant)) return 0;
    let s = 0;
    (f.references || []).forEach(r => {
      const x = cle(r);
      if (x.length < 3) return;
      // Fiche de gamme (« DFC » pour « DFC 250 B ») : seulement chez le même fabricant
      const v = x === k ? 100 : (x.length >= 4 || (x.length === 3 && fabricant && f.fabricant)) && k.startsWith(x) ? 85 : k.length >= 4 && x.startsWith(k) ? 75 : (x.length >= 5 && k.includes(x)) || (k.length >= 5 && x.includes(k)) ? 60 : 0;
      if (v > s) s = v;
    });
    return s && fabricant && f.fabricant ? s + 5 : s;
  }
  const groupeDe = f => `${cleFab(f.fabricant)}|${cle((f.references || [])[0] || f.designation)}`;
  // Version en vigueur à une date (dernière fiche datée au plus tard ce jour-là), sinon la plus récente
  function enVigueur(liste, date) {
    const l = (liste || []).filter(f => !f.absente).slice().sort((a, b) => String(a.date || a.creeLe || '').localeCompare(String(b.date || b.creeLe || '')));
    if (!l.length) return null;
    if (date) { const avant = l.filter(f => !f.date || String(f.date) <= String(date)); if (avant.length) return avant[avant.length - 1]; }
    return l[l.length - 1];
  }
  // Fiche d'un matériel : la mieux placée, dans sa version en vigueur à la date demandée (pose) ; null si aucune
  function chercher(fiches, { fabricant = '', reference = '', date = '' } = {}) {
    const notes = (fiches || []).filter(f => !f.absente).map(f => [f, score(f, fabricant, reference)]).filter(([, s]) => s >= 60);
    if (!notes.length) return null;
    const best = Math.max(...notes.map(([, s]) => s)), top = notes.filter(([, s]) => s === best).map(([f]) => f);
    const fiche = enVigueur(top.filter(f => groupeDe(f) === groupeDe(top[0])), date) || top[0];
    return { fiche, score: best, exacte: best >= 100 };
  }

  // Versions : fiches d'un même fabricant et d'une même référence principale ; la plus récente est en vigueur, les
  // autres « remplacées » (gardées). Renvoie les changements { id, remplaceePar }
  function versions(fiches) {
    const g = new Map(), out = [];
    (fiches || []).filter(f => !f.absente && (f.references || []).length).forEach(f => { const k = groupeDe(f); if (!g.has(k)) g.set(k, []); g.get(k).push(f); });
    (fiches || []).filter(f => f.absente && f.remplaceePar).forEach(f => out.push({ id: f.id, remplaceePar: '' }));
    g.forEach(l => {
      const recent = enVigueur(l, '');
      l.forEach(f => { const v = f === recent ? '' : recent.id; if ((f.remplaceePar || '') !== v) out.push({ id: f.id, remplaceePar: v }); });
    });
    return out;
  }

  // Catalogue fournisseur (Excel / CSV) : colonnes fabricant, référence, désignation, lien de la fiche
  function lireCatalogue(rows) {
    const L = (rows || []).map(r => (r || []).map(c => String(c ?? '').trim()));
    const h = L.findIndex(r => r.some(c => /fiche|lien|url|pdf|documentation/i.test(c)) && r.some(c => /r[ée]f|code|mod[eè]le/i.test(c)));
    if (h < 0) return { lignes: [], erreur: 'En-tête non reconnue : colonnes « Fabricant », « Référence », « Désignation » et « Fiche » (lien) attendues.' };
    const t = L[h].map(c => sansAccents(c).toLowerCase()), col = re => t.findIndex(c => re.test(c));
    const i = { fab: col(/fabricant|marque|constructeur/), ref: col(/^ref|reference|code|modele/), des: col(/designation|libelle|description/), url: col(/fiche|lien|url|pdf|documentation/) };
    const lignes = L.slice(h + 1).map(r => ({ fabricant: i.fab >= 0 ? r[i.fab] : '', reference: r[i.ref] || '', designation: i.des >= 0 ? r[i.des] : '', url: r[i.url] || '' }))
      .filter(l => /^https?:\/\/\S+$/i.test(l.url) && (l.reference || l.designation));
    return { lignes: lignes.slice(0, 5000) };
  }
  // Recherche groupée : [{ cle, fabricant, reference, date }] → [{ cle, fiche: { id, fichierId, nom, … } | null }]
  function trouver(fiches, demandes) {
    return (demandes || []).slice(0, 1000).map(d => {
      const r = d.reference ? chercher(fiches, { fabricant: d.fabricant, reference: d.reference, date: d.date }) : null;
      return { cle: d.cle, fiche: r ? { id: r.fiche.id, fichierId: r.fiche.fichierId, nom: r.fiche.nom, designation: r.fiche.designation, fabricant: r.fiche.fabricant, references: r.fiche.references, date: r.fiche.date || '', exacte: r.exacte, remplacee: !!r.fiche.remplaceePar } : null };
    });
  }
  // PDF d'une page (texte en Helvetica) : fiches de la démonstration et des tests
  function pdfMinimal(lignes) {
    const tx = s => sansAccents(s).replace(/[()\\]/g, '').replace(/[^\x20-\x7e]/g, '');
    const flux = `BT /F1 11 Tf 56 780 Td 16 TL ${(lignes || []).map((l, i) => `${i === 0 ? '/F1 16 Tf ' : i === 1 ? '/F1 11 Tf ' : ''}(${tx(l)}) '`).join(' ')} ET`;
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    let out = '%PDF-1.4\n'; const pos = [];
    objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = out.length;
    return `${out}xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  }
  // Nom de fichier propre (dossier réseau Windows / Linux)
  const nomFichier = s => sansAccents(s).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'fiche';
  return { trouver, pdfMinimal, cle, cleFab, memeFab, referencesDans, dateDans, familleDe, analyser, score, chercher, enVigueur, versions, lireCatalogue, nomFichier };
})();
if (typeof module !== 'undefined') module.exports = FichesTech;
