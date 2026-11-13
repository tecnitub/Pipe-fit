// Inventaire de l'étude d'après le dossier de consultation : CCTP (PDF) et DPGF (Excel, CSV ou PDF) chargés ici ou pris
// dans les documents du chantier Pipe-Fit ; producteurs, émetteurs et auxiliaires reconnus, vérifiés dans un tableau, puis
// schéma de principe et alimentation électrique préremplis.

// Classeur : Excel 97-2003 (.xls, conteneur OLE2), CSV, sinon .xlsx
async function lireClasseur(fichier) {
  const buf = await fichier.arrayBuffer();
  if (/\.xls$/i.test(fichier.name) || (typeof Xls !== 'undefined' && Xls.estXls(buf))) return Xls.lire(buf);
  return /\.csv$/i.test(fichier.name) ? XLSX.readCSV(buf) : XLSX.read(buf);
}

// Lignes d'un PDF : texte du document ; s'il n'y en a pas (scan, « Imprimer en PDF » d'images), lecture des caractères
// (OCR, sur l'appareil) des pages sans texte — longue : environ 5 à 10 s par page
async function lignesPdf(fichier, progression, pagesMax) {
  const r = await PdfLecture.lire(fichier, progression, { pagesMax, ocr: false });
  if (r.lignes.join('').replace(/\s/g, '').length >= 300 || typeof OCR === 'undefined') return r.lignes;
  const n = Math.min(r.pages || pagesMax, pagesMax);
  if (typeof confirmer === 'function' && !(await confirmer(`${fichier.name} ne contient pas de texte (document scanné ou imprimé en PDF). Lire ses ${n} page(s) par reconnaissance des caractères ? Compter environ ${Math.max(1, Math.round(n * 7 / 60))} min ; la lecture se fait sur cet ordinateur, rien n'est envoyé.`, 'Lire les pages'))) return r.lignes;
  return (await PdfLecture.lire(fichier, p => progression(typeof p === 'number' ? `lecture des caractères ${Math.round(p * 100)} %` : p), { pagesMax, ocr: true })).lignes;
}
// CCTP en plusieurs fichiers (parties A, B, C…) : textes mis bout à bout dans l'ordre des noms, puis lus comme un seul CCTP
async function lireCctp(fichiers, progression) {
  const lignes = [];
  for (const f of [...fichiers].sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr', { numeric: true }))) {
    if (/\.docx$/i.test(f.name)) { lignes.push(...await lignesDocx(f)); continue; }
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') throw new Error(`${f.name} : le CCTP se lit en PDF (ou Word .docx).`);
    lignes.push(...await lignesPdf(f, p => progression(`${f.name} : ${typeof p === 'number' ? `${Math.round(p * 100)} %` : p}`), 400));
  }
  if (lignes.join('').replace(/\s/g, '').length < 300) throw new Error(`${[...fichiers].map(f => f.name).join(', ')} : pas de texte lisible (document scanné) ; demandez le PDF d'origine.`);
  const analyse = CctpLecture.analyser(lignes), reseaux = InventaireCVC.reseauxCctp(analyse);
  // Tableaux d'équipements écrits dans le CCTP (liste des repères, carnet des CTA…)
  const annexe = InventaireCVC.tableauEquipements(lignes.map(l => String(l).split('\t')), 'Tableau du CCTP');
  return { items: InventaireCVC.depuisCctp(analyse.equipements, reseaux, analyse.articlesDetail), reseaux, annexe };
}

// Lecture d'un fichier : CCTP → équipements des articles (et tableaux d'équipements du texte) ; DPGF → lignes d'ouvrages ;
// annexe → tableau des équipements (repère, local, débit, puissance)
async function lireDossier(fichier, nature, progression) {
  const pdf = /\.pdf$/i.test(fichier.name) || fichier.type === 'application/pdf';
  if (nature === 'annexe') {
    if (pdf) { const lignes = await lignesPdf(fichier, progression, 120); return { items: [], annexe: InventaireCVC.tableauEquipements(lignes.map(l => String(l).split('\t')), `Annexe ${fichier.name}`) }; }
    const feuilles = await lireClasseur(fichier);
    return { items: [], annexe: feuilles.flatMap(f => InventaireCVC.tableauEquipements(f.rows || [], `Annexe ${fichier.name}`)) };
  }
  if (nature === 'cctp') return lireCctp([fichier], progression);
  if (pdf) return InventaireCVC.depuisDpgfTexte(await lignesPdf(fichier, progression, 120));
  const feuilles = await lireClasseur(fichier);
  // Feuilles d'ouvrages (une par zone, tranche, PSE…) réunies ; page de garde et récapitulatif écartés
  const lu = InventaireCVC.depuisFeuilles(feuilles);
  if (!lu.items.length && lu.erreur) throw new Error(`${fichier.name} : ${lu.erreur}`);
  return lu;
}
// Lignes d'un document Word (.docx) : un paragraphe par ligne, cellules d'un tableau séparées par des tabulations
async function lignesDocx(fichier) {
  const z = await XLSX.unzip(await fichier.arrayBuffer(), `${fichier.name} : document Word illisible.`);
  const xml = await z.text('word/document.xml') || '';
  const ent = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:tc>/g, '\u0001').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').split(/\n/)
    .map(l => ent(l).replace(/\u0001\s*$/, '').replace(/\u0001/g, '\t').trim()).filter(Boolean);
}
const natureDe = nom => (/annexe|liste des equipements|liste des équipements|carnet|nomenclature|tableau des/i.test(nom) ? 'annexe' : /dpgf|dqe|bpu|\.xlsx?$|\.csv$/i.test(nom) ? 'dpgf' : 'cctp');
// Dossier de consultation en zip (ou pièces déposées en vrac) : pièces décompressées, triées d'après le nom et le début
// de leur contenu (Dce.trier : CCTP, DPGF, annexes ; plans et pièces administratives listés ; lots hors CVC décochés)
const MIME_DCE = { pdf: 'application/pdf', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12', csv: 'text/csv', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const fichierPiece = p => new File([p.data], p.nom, { type: MIME_DCE[Dce.ext(p.nom)] || '' });
async function texteDebutPiece(p) {
  const e = Dce.ext(p.nom);
  try {
    if (e === 'pdf' && typeof PdfLecture !== 'undefined') return (await PdfLecture.lire(fichierPiece(p), undefined, { pagesMax: 2, ocr: false })).lignes.join('\n');
    if (/^(xlsx?|xlsm|csv)$/.test(e)) return (await lireClasseur(fichierPiece(p))).flatMap(f => (f.rows || []).slice(0, 40)).map(r => (r || []).join(' ')).join('\n');
    if (e === 'docx') return (await lignesDocx(fichierPiece(p))).slice(0, 80).join('\n');
  } catch (err) { /* contenu illisible : tri d'après le nom seul */ }
  return '';
}
async function piecesDce(fichiers, etat) {
  const pieces = [];
  let archive = '';
  for (const f of fichiers) {
    if (/\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed') {
      etat(`Décompression de ${f.name}…`); archive = archive || f.name;
      pieces.push(...await Dce.decompresser(await f.arrayBuffer()));
    } else pieces.push({ chemin: f.name, nom: f.name, dossier: '', data: new Uint8Array(await f.arrayBuffer()), taille: f.size });
  }
  const textes = {};
  for (const [k, p] of pieces.entries()) {
    // Contenu regardé quand le nom ne suffit pas (ou pour un classeur nommé « annexe » qui serait un DPGF)
    const n = Dce.natureNom(p.nom);
    if (!n || n === 'annexe') { etat(`Tri des pièces ${k + 1}/${pieces.length} : ${p.nom}…`); textes[p.chemin] = await texteDebutPiece(p); }
  }
  return Dce.trier(pieces, { textes, archive });
}
const tailleCourte = o => (o >= 1048576 ? `${(o / 1048576).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(o / 1024))} ko`);
function listeDce(pieces) {
  if (!pieces.length) return '';
  const nb = pieces.filter(p => p.retenu).length;
  return `<fieldset><legend>Dossier de consultation : ${pieces.length} pièce(s), ${nb} à lire</legend>
    <p class="muted petit">Pièces triées d'après leur nom et leur contenu. Seuls le CCTP, le DPGF et les annexes techniques des lots CVC / plomberie sont lus ; les plans et pièces administratives sont listés pour mémoire. Corrigez la nature ou cochez au besoin.</p>
    <div class="defile-x"><table class="liste compact dce-pieces"><thead><tr><th></th><th>Pièce</th><th>Nature</th><th>Lot</th></tr></thead><tbody>
    ${pieces.map((p, i) => `<tr${p.retenu ? '' : ' class="muted"'}><td><input type="checkbox" data-dce="${i}" ${p.retenu ? 'checked' : ''} aria-label="Lire ${esc(p.nom)}"></td>
      <td style="word-break:break-word;min-width:160px">${esc(p.nom)}${p.dossier ? `<br><span class="petit muted">📁 ${esc(p.dossier)}</span>` : ''}<br><span class="petit muted">${tailleCourte(p.taille)}${p.source === 'contenu' ? ' · reconnu au contenu' : ''}${p.raison ? ` · ${esc(p.raison)}` : ''}</span></td>
      <td><select data-dce-nature="${i}" aria-label="Nature">${Object.entries(Dce.NATURES).map(([k, l]) => `<option value="${k}" ${k === p.nature ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td>
      <td class="petit">${p.lot ? `${esc(p.lot.numero)}${p.lot.intitule ? ` ${esc(p.lot.intitule.slice(0, 40))}` : ''}${p.lot.cvc === false ? ' <span class="badge attention">hors CVC</span>' : ''}` : '—'}</td></tr>`).join('')}</tbody></table></div></fieldset>`;
}
// Règles apprises des corrections faites dans le tableau (partagées par le bureau d'études)
async function reglesInventaire() { try { return await api('GET', '/api/regles-inventaire'); } catch (e) { return []; } }

function dialogueInventaire(et) {
  const a = affaireDe(et.affaireId), docs = (a && a.documents) || [];
  const b = Modal.open(`<h2>📑 CCTP et DPGF</h2>
    <p class="muted petit">Les producteurs, émetteurs et auxiliaires du dossier de consultation sont reconnus puis vérifiés ici : le schéma de principe et l'alimentation électrique en sont préremplis. CCTP en PDF ; DPGF en Excel, CSV ou PDF.</p>
    ${docs.length ? `<fieldset><legend>Documents du chantier ${esc(a.code || '')} dans Pipe-Fit</legend>${docs.map(d => `<label class="case"><input type="checkbox" data-doc="${esc(d.id)}" checked> ${esc(d.nom)} <span class="badge pf">${{ dpgf: 'DPGF', cctp: 'CCTP', annexe: 'Annexe' }[natureDe(d.nom)]}</span></label>`).join('')}</fieldset>` : ''}
    <label class="dce-depot" id="inv-dce-zone">📦 <strong>Dossier de consultation (zip)</strong> <span class="muted petit">— ou glissez ici l'archive ou les pièces : CCTP, DPGF et annexes sont triés automatiquement</span><input type="file" id="inv-dce" accept=".zip,application/zip,.pdf,.xls,.xlsx,.xlsm,.csv,.docx,.dwg" multiple></label>
    <div id="inv-dce-liste"></div>
    <p class="muted petit">Ou pièce par pièce :</p>
    <div class="grille-champs"><label>CCTP (PDF ; plusieurs fichiers si le CCTP est en parties)<input type="file" id="inv-cctp" accept=".pdf,application/pdf,.docx" multiple></label><label>DPGF (Excel, CSV ou PDF)<input type="file" id="inv-dpgf" accept=".xls,.xlsx,.csv,.pdf"></label>
      <label>Liste des équipements / annexe (PDF, Excel, CSV) <span class="muted petit">facultatif : repères, locaux, débits, puissances</span><input type="file" id="inv-annexe" accept=".xls,.xlsx,.csv,.pdf"></label></div>
    <p id="inv-etat" class="petit muted"></p>
    <div class="actions">${(et.inventaire || []).length ? '<button class="secondaire" id="inv-actuel">Revoir l\'inventaire enregistré</button>' : ''}<button class="secondaire" id="inv-x">Annuler</button><button id="inv-lire">Lire</button></div>`);
  b.classList.add('large');
  const etat = t => { const e = b.querySelector('#inv-etat'); if (e) e.textContent = t; };
  b.querySelector('#inv-x').onclick = Modal.close;
  let dce = [];
  const rendreDce = () => {
    b.querySelector('#inv-dce-liste').innerHTML = listeDce(dce);
    b.querySelectorAll('[data-dce]').forEach(cb => cb.onchange = () => { dce[+cb.dataset.dce].retenu = cb.checked; rendreDce(); });
    b.querySelectorAll('[data-dce-nature]').forEach(sl => sl.onchange = () => { const p = dce[+sl.dataset.dceNature]; p.nature = sl.value; p.retenu = Dce.LUES.includes(sl.value); p.raison = ''; rendreDce(); });
  };
  const chargerDce = async fichiers => {
    if (!fichiers.length) return;
    try { dce = [...dce, ...await piecesDce(fichiers, etat)]; etat(`${dce.filter(p => p.retenu).length} pièce(s) retenue(s) sur ${dce.length} : vérifiez le tri puis « Lire ».`); } catch (e) { etat(e.message); }
    rendreDce();
  };
  const zd = b.querySelector('#inv-dce-zone'), id = b.querySelector('#inv-dce');
  id.onchange = () => { chargerDce([...id.files]); id.value = ''; };
  b.ondragover = e => { e.preventDefault(); zd.classList.add('survol'); };
  b.ondragleave = () => zd.classList.remove('survol');
  b.ondrop = e => { e.preventDefault(); zd.classList.remove('survol'); chargerDce([...((e.dataTransfer && e.dataTransfer.files) || [])]); };
  const act = b.querySelector('#inv-actuel');
  if (act) act.onclick = async () => tableauInventaire(et, et.inventaire.map(x => ({ ...x })), [], (et.inventaireReseaux || []).map(r => ({ ...r })), { regles: await reglesInventaire() });
  b.querySelector('#inv-lire').onclick = async () => {
    const sources = [];
    for (const cb of b.querySelectorAll('[data-doc]:checked')) {
      const d = docs.find(x => x.id === cb.dataset.doc);
      sources.push({ nature: d.categorie === 'DPGF' ? 'dpgf' : natureDe(d.nom), charger: async () => { const r = await fetch(`/api/pf/fichier/${encodeURIComponent(d.fichierId)}`); if (!r.ok) throw new Error(`${d.nom} : fichier indisponible`); return new File([await r.blob()], d.nom, { type: d.mime || '' }); } });
    }
    // Pièces du dossier de consultation : CCTP en parties lus ensemble, DPGF et annexes un par un
    const dl = dce.filter(p => p.retenu && Dce.LUES.includes(p.nature)), dc = dl.filter(p => p.nature === 'cctp').map(fichierPiece);
    if (dc.length) sources.push({ nature: 'cctp', fichiers: dc });
    dl.filter(p => p.nature !== 'cctp').forEach(p => sources.push({ nature: p.nature, charger: async () => fichierPiece(p) }));
    const fc = [...b.querySelector('#inv-cctp').files], fd = b.querySelector('#inv-dpgf').files[0], fa = b.querySelector('#inv-annexe').files[0];
    if (fc.length) sources.push({ nature: 'cctp', fichiers: fc });
    if (fd) sources.push({ nature: 'dpgf', charger: async () => fd });
    if (fa) sources.push({ nature: 'annexe', charger: async () => fa });
    if (!sources.length) return toast('Choisissez le CCTP et / ou le DPGF.');
    b.querySelector('#inv-lire').disabled = true;
    const cctp = [], dpgf = [], resC = [], resD = [], annexe = [], erreurs = [], lus = { cctp: false, dpgf: false };
    for (const s of sources) {
      try {
        const f = s.fichiers ? { name: s.fichiers.map(x => x.name).join(', ') } : await s.charger();
        etat(`Lecture de ${f.name}…`);
        const suivi = p => etat(`Lecture de ${f.name}… ${typeof p === 'number' ? `${Math.round(p * 100)} %` : p || ''}`);
        const r = s.fichiers ? await lireCctp(s.fichiers, suivi) : await lireDossier(f, s.nature, suivi);
        (s.nature === 'cctp' ? cctp : dpgf).push(...r.items); (s.nature === 'cctp' ? resC : resD).push(...(r.reseaux || [])); annexe.push(...(r.annexe || []));
        if (s.nature !== 'annexe') lus[s.nature] = true;
      } catch (e) { erreurs.push(e.message); }
    }
    const fus = InventaireCVC.fusionner(cctp, dpgf), reseaux = InventaireCVC.fusionnerReseaux(resC, resD, fus);
    // Écarts CCTP / DPGF avant le détail par repère ; puis tableau d'équipements, corrections apprises, rattachement aux réseaux
    const ecarts = lus.cctp && lus.dpgf ? InventaireCVC.ecarts(fus, lus) : [];
    const inv = annexe.length ? InventaireCVC.fusionnerAnnexe(fus, annexe) : fus;
    const regles = await reglesInventaire();
    // Lecture automatique gardée : les corrections faites ensuite dans le tableau deviennent des règles
    inv.forEach(x => { x.auto = { designation: x.designation, genre: x.genre, inclus: x.inclus }; });
    reseaux.forEach(z => { z.auto = { nom: z.nom, nature: z.nature }; });
    InventaireCVC.appliquerRegles(inv, reseaux, regles);
    InventaireCVC.rattacher(inv, reseaux);
    if (!inv.length && !reseaux.length) { b.querySelector('#inv-lire').disabled = false; return etat(erreurs.join(' · ') || 'Aucun producteur ni émetteur reconnu dans ces documents.'); }
    tableauInventaire(et, inv, erreurs, reseaux, { ecarts, regles, annexe: annexe.length });
  };
}

// Inventaire à vérifier : genre, désignation, quantité, puissance, régime ; puis création des calculs
// Sources d'une ligne en bref : premier article du CCTP, première ligne du DPGF (le détail en infobulle)
// Rapprochement de l'article du CCTP et de la ligne du DPGF, détails techniques lus, provenance de chaque valeur
const LIB_RAPPROCHEMENT = { numero: 'n° d\'article', designation: 'désignation', chapitre: 'chapitre', genre: 'seul de son genre', capacite: 'même capacité' };
const LIB_DETAILS = { montage: { '3v': 'vanne 3 voies', '2v': 'vanne 2 voies', '4v': 'vanne 4 voies', injection3: 'injection 3 voies', injection2: 'injection 2 voies', decharge: 'décharge', bouteille: 'bouteille de circuit', echangeur: 'échangeur de circuit' },
  pompe: { integree: 'pompe intégrée', deportee: 'pompe déportée' }, recup: { desurchauffeur: 'désurchauffeur', totale: 'récupération totale' }, role: { base: 'en base', appoint: 'en appoint', releve: 'en relève', secours: 'en secours', recuperation: 'en récupération' },
  recuperateur: { plaques: 'récupérateur à plaques', roue: 'roue', glycol: 'boucle glycolée', aucun: 'sans récupérateur' } };
function detailsTexte(x) {
  const d = x.details || {}, b = d.batteries || {};
  return [d.role && LIB_DETAILS.role[d.role], d.montage && LIB_DETAILS.montage[d.montage], d.pompe && LIB_DETAILS.pompe[d.pompe], d.recup && LIB_DETAILS.recup[d.recup], d.recuperateur && LIB_DETAILS.recuperateur[d.recuperateur],
    Object.keys(b).length && `batteries ${[b.chaude && 'eau chaude', b.froide && 'eau glacée', b.co && 'change-over', b.elec && `électrique (${b.elec})`].filter(Boolean).join(' + ')}${d.PelBe ? ` ${Notes.nf(d.PelBe, 1)} kW` : ''}`,
    d.reference && `réf. ${d.reference}`, d.equivalent && 'ou équivalent', d.regulation && `régulation ${[d.regulation.marque, d.regulation.gtb, d.regulation.bus].filter(Boolean).join(' · ')}`].filter(Boolean).join(' · ');
}
const titreProvenance = x => [(x.sources || []).join(', '), ...Object.entries(x.champs || {}).map(([k, c]) => `${(InventaireCVC.LIB_CHAMP[k] || { libelle: k }).libelle} : ${InventaireCVC.valeurChamp(k, c.v)} — ${c.source} (confiance ${c.confiance})${c.autre ? ` ; autre document : ${InventaireCVC.valeurChamp(k, c.autre.v)} (${c.autre.source})` : ''}`)].join('\n');
const sourcesCourtes = l => { const c = (l || []).find(x => /^CCTP/.test(x)), d = (l || []).find(x => /^DPGF/.test(x)); return [c, d].filter(Boolean).join(' · ').replace('CCTP art. ', 'CCTP ') || (l || []).join(', '); };
function tableauInventaire(et, inv, erreurs, reseaux = [], info = {}) {
  const ecarts = info.ecarts || et.inventaireEcarts || [];
  const G = InventaireCVC.GENRES, NAT = InventaireCVC.NATURE;
  // Gros équipements d'abord (production, CTA, caissons, ECS, splits), puis le reste ; variantes et moins-values à part
  const GROUPES = [['Gros équipements — production, CTA, caissons, ECS', x => !x.variante && (x.categorie === 'producteur' || x.principal)],
    ['Émetteurs', x => !x.variante && !x.principal && x.categorie === 'emetteur'], ['Auxiliaires', x => !x.variante && !x.principal && x.categorie === 'auxiliaire'],
    ['Appareils sanitaires (points de puisage)', x => !x.variante && !x.principal && x.categorie === 'sanitaire'],
    ['Variantes, options et moins-values (non retenues par défaut)', x => !!x.variante]];
  const nb = r => inv.filter(x => x.reseau === r.id && x.inclus !== false).length;
  const optReseaux = v => `<option value="">—</option>${reseaux.map(r => `<option value="${esc(r.id)}" ${r.id === v ? 'selected' : ''}>${esc(r.nom.slice(0, 40))}</option>`).join('')}`;
  const rendu = () => `<h2>📑 Inventaire du dossier de consultation <span class="compte">${inv.length}</span></h2>
    ${erreurs.length ? `<p class="erreur petit">${erreurs.map(esc).join('<br>')}</p>` : ''}
    <h3>Réseaux reconnus <span class="compte">${reseaux.length}</span></h3>
    ${reseaux.length ? `<p class="muted petit">Titres de chapitres du DPGF et articles du CCTP qui désignent un réseau ; les équipements écrits dessous y sont rattachés. Le schéma de principe crée un circuit par réseau hydraulique (puissance des émetteurs cumulée, longueur des tuyauteries du DPGF). Corrigez la nature si besoin.</p>
      <div class="defile-x"><table class="edit"><thead><tr><th>Réseau</th><th>Nature</th><th>Régime</th><th>Tuyauteries / gaines</th><th>Équipements</th><th>Source</th></tr></thead><tbody>
      ${reseaux.map((r, k) => `<tr><td><input data-r="${k}" data-rk="nom" value="${esc(r.nom)}">${r.chapitre ? `<br><span class="petit muted">${esc(r.chapitre)}</span>` : ''}${r.appris ? '<br><span class="ligne-auto">↺ nature d\'après une correction précédente</span>' : ''}</td>
        <td><select data-r="${k}" data-rk="nature"><option value="">— non reconnue —</option>${Object.entries(NAT).map(([n, x]) => `<option value="${n}" ${n === r.nature ? 'selected' : ''}>${esc(x.libelle)}</option>`).join('')}</select></td>
        <td><input data-r="${k}" data-rk="regime" value="${esc(r.regime || '')}" placeholder="70/50" style="width:70px"></td>
        <td class="petit">${r.L ? `${Notes.nf(r.L, 0)} ml${Number.isFinite(r.dnMax) ? ` · jusqu'au ${r.hydro ? 'DN' : 'Ø'} ${r.dnMax}` : ''}` : '<span class="muted">—</span>'}</td><td>${nb(r)}</td><td class="petit muted">${esc((r.sources || []).join(', '))}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted petit">Aucun réseau reconnu : les titres « Réseau … », « Circuit … », « Distribution … » ou « Gaines de soufflage … » du DPGF (lignes sans quantité) et les articles du CCTP qui en parlent sont attendus. Chaque émetteur fera son propre circuit.</p>'}
    ${ecarts.length ? `<h3>Écarts entre le CCTP et le DPGF <span class="compte">${ecarts.length}</span></h3>
      <p class="muted petit">Questions à poser pendant la consultation (sécurisent le chiffrage) : équipements décrits mais non chiffrés, chiffrés mais non décrits, quantités ou marques différentes.</p>
      <div class="defile-x"><table class="liste compact"><thead><tr><th>Écart</th><th>Équipement</th><th>Détail</th></tr></thead><tbody>${ecarts.map(e => `<tr><td><span class="badge ${e.type === 'marque' || e.type === 'quantite' ? 'attention' : 'erreur'}">${esc(InventaireCVC.LIB_ECART[e.type])}</span></td><td>${esc(e.designation)}</td><td class="petit">${esc(e.texte)}</td></tr>`).join('')}</tbody></table></div>
      <div class="actions-ligne"><button class="secondaire petit" id="ti-ecarts-copier">📋 Copier les questions</button><button class="secondaire petit" id="ti-ecarts-csv">CSV</button>
        <button class="${et.inventaireEcartsTraites ? '' : 'secondaire '}petit" id="ti-ecarts-traites" title="Questions posées ou écarts tranchés : retirés du « Reste à faire » de l'étude">${et.inventaireEcartsTraites ? '✓ Écarts traités' : 'Marquer les écarts comme traités'}</button></div>` : ''}
    <h3>Équipements</h3>
    <p class="muted petit">Décochez ce qui ne concerne pas l'étude, corrigez le genre, la quantité ou les puissances (unitaires, kW : <strong>chaud</strong> pour le schéma de chauffage, <strong>froid</strong> pour l'eau glacée, <strong>électrique</strong> pour le bilan électrique). Les quantités viennent du DPGF, les repères et prescriptions du CCTP${info.annexe ? ', le détail par repère du tableau d\'équipements' : ''}. Vos corrections sont retenues pour les prochains dossiers${(info.regles || []).length ? ` (${info.regles.length} règle(s) apprise(s))` : ''}.</p>
    <div class="defile-x"><table class="edit"><thead><tr><th></th><th>Genre</th><th>Désignation</th><th>Repère</th><th>Qté</th><th>P chaud</th><th>P froid</th><th>P élec.</th><th>Débit (m³/h)</th><th>Régime</th><th>Réseau</th><th>Source, prescription, caractéristiques</th></tr></thead><tbody>
    ${GROUPES.map(([titre, f]) => { const l = inv.map((x, i) => [x, i]).filter(([x]) => f(x)); return l.length ? `<tr><th colspan="12" class="petit">${titre}</th></tr>${l.map(([x, i]) => `<tr${x.variante ? ' class="muted"' : ''}>
      <td><input type="checkbox" data-i="${i}" data-k="inclus" ${x.inclus !== false ? 'checked' : ''} aria-label="Retenir"></td>
      <td><select data-i="${i}" data-k="genre">${Object.entries(G).map(([k, g]) => `<option value="${k}" ${k === x.genre ? 'selected' : ''}>${esc(g.libelle)}</option>`).join('')}</select></td>
      <td><input data-i="${i}" data-k="designation" value="${esc(x.designation)}" style="min-width:300px" title="${esc(x.designation)}">${x.chapitre && !x.designation.includes(x.chapitre) ? `<br><span class="petit muted">${esc(x.chapitre)}</span>` : ''}${x.local ? `<br><span class="petit muted">📍 ${esc(x.local)}</span>` : ''}${x.appris ? '<br><span class="ligne-auto">↺ corrigé d\'après une correction précédente</span>' : ''}${x.horsSchema ? `<br><span class="petit avert">${esc(x.horsSchema)} : hors schéma hydraulique</span>` : ''}</td><td><input data-i="${i}" data-k="repere" value="${esc(x.repere || '')}" style="width:80px"></td>
      <td><input data-i="${i}" data-k="qte" value="${esc(x.qte)}" class="nombre" style="width:60px"></td><td><input data-i="${i}" data-k="P" value="${esc(x.P ?? '')}" class="nombre" style="width:62px" title="Puissance calorifique unitaire (kW)"></td><td><input data-i="${i}" data-k="Pfr" value="${esc(x.Pfr ?? '')}" class="nombre" style="width:62px" title="Puissance frigorifique unitaire (kW)"></td><td><input data-i="${i}" data-k="Pel" value="${esc(x.Pel ?? '')}" class="nombre" style="width:62px" title="Puissance électrique unitaire (kW), reprise par l'alimentation électrique"></td><td><input data-i="${i}" data-k="Q" value="${esc(x.Q ?? '')}" class="nombre" style="width:70px" title="Débit d'air par bouche ou de l'équipement"></td>
      <td><input data-i="${i}" data-k="regime" value="${esc(x.regime || '')}" placeholder="70/50" style="width:70px"></td><td><select data-i="${i}" data-k="reseau" style="max-width:170px">${optReseaux(x.reseau)}</select>${x.rattache && x.reseau ? `<br><span class="ligne-auto" title="Rattaché automatiquement">↳ d'après ${x.rattache === 'texte' ? 'le texte (alimentation)' : x.rattache === 'numero' ? 'le numéro d\'article' : 'le chapitre de la production'}</span>` : ''}</td><td class="petit muted" style="min-width:260px" title="${esc(titreProvenance(x))}">${esc(sourcesCourtes(x.sources))}${x.rapprochement && LIB_RAPPROCHEMENT[x.rapprochement] ? ` <span class="badge">${LIB_RAPPROCHEMENT[x.rapprochement]}</span>` : ''}${x.prescrit ? `<br>${esc(x.prescrit)}` : ''}${InventaireCVC.caracTexte(x.carac) ? `<br><span style="color:var(--texte)">${esc(InventaireCVC.caracTexte(x.carac))}</span>` : ''}${detailsTexte(x) ? `<br><span style="color:var(--texte)">${esc(detailsTexte(x))}</span>` : ''}
        ${InventaireCVC.aVerifier(x).length ? `<br>${InventaireCVC.aVerifier(x).map(v => `<span class="${v.conflit ? 'avert' : ''}">⚠ ${esc(v.libelle)} : ${esc(v.texte)}</span>`).join('<br>')}<br><label class="case petit"><input type="checkbox" data-i="${i}" data-k="verifie" ${x.verifie ? 'checked' : ''}> valeurs vérifiées</label>` : ''}</td></tr>`).join('')}` : ''; }).join('')}
    </tbody></table></div>
    <div class="actions"><button class="secondaire" id="ti-x">Fermer</button><button class="secondaire" id="ti-questions" title="Questions à poser pendant la consultation : écarts CCTP / DPGF, caractéristiques manquantes">❓ Questions au maître d'œuvre</button><button class="secondaire" id="ti-ok">Enregistrer l'inventaire</button>
      <button data-creer="pid">🗺️ Créer le schéma de principe</button><button data-creer="aero">🌬️ Créer le schéma aéraulique et les CTA</button><button data-creer="terminaux">🌀 Créer les terminaux</button><button data-creer="elec">⚡ Créer l'alimentation électrique et la régulation</button>${inv.some(x => x.genre === 'sanitaire' && x.inclus !== false) ? '<button data-creer="sanitaire">🚰 Créer le calcul sanitaire</button>' : ''}
      <button id="ti-tout" title="Schémas de principe, réseaux, CTA, terminaux, sanitaire, ECS, électricité et régulation en une fois, chaque consommateur raccordé à sa production, puissances manquantes estimées">⚡ Créer toute l'étude</button></div>`;
  const b = Modal.open(rendu());
  b.classList.add('large');
  const lier = () => {
    b.querySelectorAll('[data-i]').forEach(el => el.onchange = () => {
      const x = inv[+el.dataset.i], k = el.dataset.k;
      x[k] = ['inclus', 'verifie'].includes(k) ? el.checked : ['qte', 'P', 'Pfr', 'Pel', 'Q'].includes(k) ? (el.value === '' ? '' : Notes.num(el.value)) : el.value;
      if (k === 'reseau') delete x.rattache;
      if (k === 'genre' || k === 'reseau') { if (k === 'genre') x.categorie = G[el.value].categorie; b.innerHTML = rendu(); lier(); }
    });
    b.querySelectorAll('[data-r]').forEach(el => el.onchange = () => {
      const r = reseaux[+el.dataset.r], k = el.dataset.rk;
      r[k] = el.value;
      if (k === 'nature') { r.hydro = !!(NAT[el.value] || {}).hydro; b.innerHTML = rendu(); lier(); }
    });
    b.querySelector('#ti-x').onclick = Modal.close;
    const garder = () => {
      et.inventaire = inv.map(x => ({ ...x })); et.inventaireReseaux = reseaux.map(r => ({ ...r })); et.inventaireEcarts = ecarts; enregistrer(et);
      // Corrections retenues pour les prochains dossiers (genre changé, ligne écartée, nature de réseau)
      const nouvelles = InventaireCVC.apprendre(inv, reseaux, info.regles || []);
      if (JSON.stringify(nouvelles) !== JSON.stringify(info.regles || [])) { const n = nouvelles.length - (info.regles || []).length; info.regles = nouvelles; api('PUT', '/api/regles-inventaire', nouvelles).then(() => { if (n > 0) toast(`${n} correction(s) retenue(s) pour les prochains dossiers.`); }).catch(() => {}); }
    };
    const bc = b.querySelector('#ti-ecarts-copier');
    if (bc) bc.onclick = async () => { try { await navigator.clipboard.writeText(InventaireCVC.ecartsTexte(ecarts)); toast('Questions copiées : à coller dans la plateforme de consultation ou un mail.'); } catch (e) { toast('Copie impossible : utilisez le CSV.'); } };
    const bx = b.querySelector('#ti-ecarts-csv');
    if (bx) bx.onclick = () => enregistrerFichier(b, `Ecarts_CCTP_DPGF_${sansAccents(et.objet || 'etude').slice(0, 40)}.csv`, new TextEncoder().encode(`\uFEFFÉcart;Équipement;Détail\n${ecarts.map(e => [InventaireCVC.LIB_ECART[e.type], e.designation, e.texte].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')}`), 'text/csv');
    b.querySelector('#ti-questions').onclick = () => { garder(); dialogueQuestionsMoe(et); };
    b.querySelector('#ti-ok').onclick = () => { garder(); Modal.close(); App.render(); toast(`Inventaire enregistré : ${inv.filter(x => x.inclus !== false).length} équipement(s).`); };
    b.querySelectorAll('[data-creer]').forEach(bt => bt.onclick = () => { garder(); Modal.close(); creerCalculInventaire(et, bt.dataset.creer); });
    b.querySelector('#ti-tout').onclick = () => { garder(); Modal.close(); EtudeAuto.lancer(et); };
    const tr = b.querySelector('#ti-ecarts-traites');
    if (tr) tr.onclick = () => { et.inventaireEcartsTraites = !et.inventaireEcartsTraites; garder(); b.innerHTML = rendu(); lier(); };
  };
  lier();
}

// Calculs créés d'après l'inventaire enregistré de l'étude : schéma de principe (générateurs et rôles, montages, ballons,
// découplage, récupération), schéma aéraulique et CTA (batteries, récupérateur), terminaux, alimentation électrique et
// régulation (marque de l'automate, GTB, bus). Les notes créées sont marquées « origine : inventaire ».
function creerCalculInventaire(et, quoi) {
  const inv = et.inventaire || [], reseaux = et.inventaireReseaux || [];
  if (!inv.length) { toast('Inventaire vide : lisez d\'abord le CCTP et le DPGF.'); return dialogueInventaire(et); }
  const marquer = n => { n.origine = 'inventaire'; return n; };
  const aller = (n, msg, alertes = []) => { enregistrer(et); if (typeof Modal !== 'undefined' && Modal.close) Modal.close(); location.hash = `#/etude/${et.id}/${n.id}`; toast(alertes.length ? `${msg} À vérifier : ${alertes[0]}${alertes.length > 1 ? ` (+${alertes.length - 1})` : ''}` : msg, 8000); };
  if (quoi === 'pid') {
    // Un schéma, ou deux (froid + chaud : thermofrigopompe, productions chaud et froid distinctes), reliés par la récupération
    const { schemas } = InventaireCVC.versSchemas(inv, Schema, reseaux), cree = {};
    schemas.forEach(sc => {
      const n = marquer(nouvelleNote('pid', { ...Notes.defauts('pid'), ...sc.entrees, circuits: sc.entrees.circuits.length ? sc.entrees.circuits : Notes.defauts('pid').circuits }));
      n.titre = `Schéma de principe — ${sc.titre}`;
      n.commentaire = [`Prérempli d'après le dossier de consultation (CCTP / DPGF).`, sc.commentaire, sc.alertes.length ? `À vérifier : ${sc.alertes.join(' ')}` : ''].filter(Boolean).join(' ');
      cree[sc.cle] = n; et.notes.push(n);
    });
    Object.values(cree).forEach(n => { if (n.entrees.recupDe === '@froid') n.entrees.recupDe = cree.froid ? cree.froid.id : ''; });
    const premier = cree.chaud || Object.values(cree)[0], alertes = schemas.flatMap(x => x.alertes);
    return aller(premier, schemas.length > 1 ? `${schemas.length} schémas de principe créés (froid et chaud, reliés par la récupération).` : schemas[0].entrees.generateurs ? `Schéma créé : ${schemas[0].entrees.generateurs.length} générateurs détaillés.` : 'Schéma de principe créé d\'après le dossier.', alertes);
  }
  if (quoi === 'aero') {
    const { entrees, alertes, ctas } = InventaireCVC.versSchemaAir(inv, reseaux);
    // Une note « CTA » par centrale (pas deux fois la même)
    const nouvelles = (ctas || []).filter(c => !et.notes.some(n => n.type === 'cta' && n.titre === c.titre)).map(c => {
      const n = marquer(nouvelleNote('cta', { ...Notes.defauts('cta'), ...c.entrees }));
      n.titre = c.titre; n.commentaire = `Reprise du dossier de consultation (${c.sources.join(', ')}) : batteries, récupérateur, débits et puissances à vérifier.`;
      et.notes.push(n); return n;
    });
    const bouches = (entrees.zones || []).length;
    if (!bouches && nouvelles.length) return aller(nouvelles[0], `${nouvelles.length} CTA créée(s) d'après le dossier (pas de bouches reconnues pour le schéma aéraulique).`);
    const n = marquer(nouvelleNote('aero', { ...Notes.defauts('aero'), ...entrees, zones: bouches ? entrees.zones : Notes.defauts('aero').zones }));
    n.titre = `Schéma aéraulique — ${entrees.titreInstallation || 'd\'après le CCTP / DPGF'}`;
    n.commentaire = `Prérempli d'après le dossier de consultation (CCTP / DPGF) : vérifier les distances des zones au ventilateur et les longueurs d'antenne.${alertes.length ? ` À vérifier : ${alertes.join(' ')}` : ''}`;
    et.notes.push(n);
    return aller(n, `Schéma aéraulique créé${nouvelles.length ? ` et ${nouvelles.length} CTA` : ''} d'après le dossier.`, alertes);
  }
  if (quoi === 'terminaux') {
    const { appareils, alertes } = InventaireCVC.versTerminaux(inv);
    if (!appareils.length) return toast('Aucun terminal (ventilo-convecteur, cassette, aérotherme, split, radiateur) dans l\'inventaire.');
    const n = marquer(nouvelleNote('terminaux', { ...Notes.defauts('terminaux'), appareils }));
    n.titre = 'Terminaux — d\'après le CCTP / DPGF';
    n.commentaire = `Terminaux repris du dossier de consultation : locaux, puissances, batteries et vannes à vérifier.${alertes.length ? ` À vérifier : ${alertes.join(' ')}` : ''}`;
    et.notes.push(n);
    return aller(n, `${appareils.length} terminal(aux) repris du dossier.`, alertes);
  }
  if (quoi === 'sanitaire') {
    // Appareils sanitaires du dossier → points de puisage (un par appareil) ; production d'ECS citée en commentaire
    const { points, alertes, ecs } = InventaireCVC.versSanitaire(inv);
    if (!points.length) return toast('Aucun appareil sanitaire (lavabo, WC, douche, évier…) dans l\'inventaire.');
    const n = marquer(nouvelleNote('sanitaire', { ...Notes.defauts('sanitaire'), points }));
    n.titre = 'Eau froide et eau chaude sanitaires — d\'après le CCTP / DPGF';
    n.commentaire = `Appareils repris du dossier de consultation : tronçons, salles et étages à compléter.${ecs.length ? ` Production d'ECS du dossier : ${ecs.join(' ; ')}.` : ''}`;
    et.notes.push(n);
    return aller(n, `${points.length} point(s) de puisage repris du dossier.`, alertes);
  }
  if (quoi === 'elec') {
    const lignes = InventaireCVC.versElec(inv), reg = InventaireCVC.versRegulation(inv).entrees;
    if (!lignes.length) return toast('Aucun équipement alimenté électriquement dans l\'inventaire.');
    // Régulation : marque de l'automate, supervision et bus lus au CCTP ; techno « régulateurs préprogrammés » sur l'armoire
    const regul = e => {
      const d = Notes.defauts('elec');
      ['marqueAutomate', 'gtb', 'busEquip'].forEach(k => { if (reg[k] !== undefined && (e[k] === undefined || e[k] === d[k])) e[k] = reg[k]; });
      if (reg.techno && (e.armoires || []).length && (e.armoires || []).every(a => !a.techno || a.techno === 'automate')) e.armoires = e.armoires.map(a => ({ ...a, techno: reg.techno }));
      return e;
    };
    const ex = et.notes.find(x => x.type === 'elec');
    if (ex) { ex.entrees = regul({ ...ex.entrees, equipements: Electricite.fusionner((ex.entrees || {}).equipements, lignes).lignes }); return aller(ex, 'Équipements et régulation ajoutés au calcul d\'alimentation électrique existant.'); }
    const n = marquer(nouvelleNote('elec', regul({ ...Notes.defauts('elec'), equipements: Electricite.fusionner([], lignes).lignes })));
    n.commentaire = `Équipements repris du dossier de consultation (CCTP / DPGF) : choisissez pour chacun son alimentation et sa régulation.${Object.keys(reg).length ? ` Régulation reprise du CCTP : ${[reg.marqueAutomate, reg.gtb, reg.busEquip].filter(Boolean).join(', ')}.` : ''}`;
    et.notes.push(n);
    return aller(n, `${lignes.length} équipement(s) repris : choisissez leur alimentation et leur régulation.`);
  }
}

// Questions au maître d'œuvre (période de consultation) : écarts CCTP / DPGF et caractéristiques manquantes, regroupées
// par chapitre et numérotées ; suivi « posée » / « réponse reçue » et réponse mémorisés dans l'étude (et.questionsMoe) ;
// une réponse qui tranche une valeur (quantité, puissance, débit, régime) corrige l'inventaire
function dialogueQuestionsMoe(et) {
  const inv = et.inventaire || [];
  if (!inv.length) { toast('Inventaire vide : lisez d\'abord le CCTP et le DPGF.'); return dialogueInventaire(et); }
  const qs = Dce.avecSuivi(Dce.questions(et.inventaireEcarts || [], inv), et.questionsMoe);
  let nonPosees = false;
  const garder = () => { et.questionsMoe = Dce.suiviDe(qs, et.questionsMoe); enregistrer(et); };
  const choisies = () => (nonPosees ? qs.filter(q => !q.posee && !q.recue) : qs);
  const affaire = () => [et.objet, et.client].filter(Boolean).join(' — ');
  const rendu = () => {
    const posees = qs.filter(q => q.posee || q.recue).length, recues = qs.filter(q => q.recue).length;
    return `<h2>❓ Questions au maître d'œuvre <span class="compte">${qs.length}</span></h2>
    <p class="muted petit">À poser pendant la consultation pour sécuriser le chiffrage : équipements décrits mais non chiffrés (ou l'inverse), quantités, valeurs ou marques différentes entre le CCTP et le DPGF, caractéristiques manquantes pour dimensionner. ${posees} posée(s), ${recues} réponse(s) reçue(s).</p>
    ${qs.length ? [...new Set(qs.map(q => q.chapitre))].map(c => `<h3>${esc(c)}</h3>${qs.filter(q => q.chapitre === c).map(q => { const i = qs.indexOf(q); return `<div class="carte petit question-moe${q.recue ? ' muted' : ''}">
      <p><strong>${q.n}.</strong> ${esc(q.texte)}${(q.refs || []).length ? `<br><span class="muted">${esc(q.refs.join(' · '))}</span>` : ''}</p>
      <div class="actions-ligne"><label class="case"><input type="checkbox" data-q="${i}" data-qk="posee" ${q.posee ? 'checked' : ''}> posée</label><label class="case"><input type="checkbox" data-q="${i}" data-qk="recue" ${q.recue ? 'checked' : ''}> réponse reçue</label>
        ${(q.choix || []).length ? `<label class="petit">Valeur retenue <select data-q="${i}" data-qk="retenu"><option value="">—</option>${q.choix.map((c, k) => `<option value="${k}" ${q.retenu !== undefined && String(q.retenu) === String(c.v) ? 'selected' : ''}>${esc(c.libelle)}</option>`).join('')}</select></label>` : ''}</div>
      ${q.recue || q.reponse ? `<textarea data-q="${i}" data-qk="reponse" rows="2" placeholder="Réponse du maître d'œuvre" aria-label="Réponse" style="width:100%">${esc(q.reponse || '')}</textarea>` : ''}</div>`; }).join('')}`).join('')
      : '<p class="muted">Aucune question : pas d\'écart entre le CCTP et le DPGF, et les caractéristiques des gros équipements sont renseignées.</p>'}
    <label class="case petit"><input type="checkbox" id="qm-nonposees" ${nonPosees ? 'checked' : ''}> n'exporter que les questions pas encore posées</label>
    <div class="actions"><button class="secondaire" id="qm-x">Fermer</button><button class="secondaire" id="qm-copier">📋 Copier pour un mail</button><button id="qm-word">📝 Word</button></div>`;
  };
  const b = Modal.open(rendu());
  b.classList.add('large');
  const lier = () => {
    b.querySelector('#qm-x').onclick = () => { garder(); Modal.close(); App.render(); };
    b.querySelector('#qm-nonposees').onchange = e => { nonPosees = e.target.checked; };
    b.querySelectorAll('[data-q]').forEach(el => { el[el.tagName === 'TEXTAREA' ? 'oninput' : 'onchange'] = () => {
      const q = qs[+el.dataset.q], k = el.dataset.qk;
      if (k === 'reponse') { q.reponse = el.value; q.recue = q.recue || !!el.value.trim(); q.date = q.date || new Date().toISOString().slice(0, 10); return garder(); }
      if (k === 'retenu') {
        if (el.value === '') delete q.retenu;
        else {
          const c = q.choix[+el.value], n = Dce.appliquerReponse(inv, q, c.v);
          Object.assign(q, { retenu: c.v, recue: true, posee: true });
          if (n) toast(`Inventaire corrigé : ${q.designation} — ${c.libelle}.`);
        }
      } else { q[k] = el.checked; if (k === 'recue' && el.checked) q.posee = true; if (el.checked) q.date = new Date().toISOString().slice(0, 10); }
      garder(); b.innerHTML = rendu(); lier();
    }; });
    b.querySelector('#qm-copier').onclick = async () => {
      const l = choisies();
      if (!l.length) return toast('Aucune question à copier.');
      try { await navigator.clipboard.writeText(Dce.questionsTexte(l, { objet: affaire() })); toast(`${l.length} question(s) copiée(s) : à coller dans un mail ou la plateforme de consultation.`); }
      catch (e) { toast('Copie impossible : utilisez l\'export Word.'); }
    };
    b.querySelector('#qm-word').onclick = () => {
      const l = choisies();
      if (!l.length) return toast('Aucune question à exporter.');
      telecharger(`Questions_MOE_${sansAccents(et.objet || 'etude').slice(0, 40)}.docx`, Docx.build(Dce.questionsBlocs(l, { affaire: affaire(), date: new Date().toLocaleDateString('fr-FR') })), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    };
  };
  lier();
}
