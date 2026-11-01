// Inventaire de l'étude d'après le dossier de consultation : CCTP (PDF) et DPGF (Excel, CSV ou PDF) chargés ici ou pris
// dans les documents du chantier Pipe-Fit ; producteurs, émetteurs et auxiliaires reconnus, vérifiés dans un tableau, puis
// schéma de principe et alimentation électrique préremplis.

// Lecture d'un fichier : CCTP → équipements des articles (et tableaux d'équipements du texte) ; DPGF → lignes d'ouvrages ;
// annexe → tableau des équipements (repère, local, débit, puissance)
async function lireDossier(fichier, nature, progression) {
  const pdf = /\.pdf$/i.test(fichier.name) || fichier.type === 'application/pdf';
  if (nature === 'annexe') {
    if (pdf) { const { lignes } = await PdfLecture.lire(fichier, progression, { pagesMax: 120, ocr: false }); return { items: [], annexe: InventaireCVC.tableauEquipements(lignes.map(l => String(l).split('\t')), `Annexe ${fichier.name}`) }; }
    const buf = await fichier.arrayBuffer(), feuilles = /\.csv$/i.test(fichier.name) ? XLSX.readCSV(buf) : await XLSX.read(buf);
    return { items: [], annexe: feuilles.flatMap(f => InventaireCVC.tableauEquipements(f.rows || [], `Annexe ${fichier.name}`)) };
  }
  if (nature === 'cctp') {
    if (!pdf) throw new Error(`${fichier.name} : le CCTP se lit en PDF.`);
    const { lignes } = await PdfLecture.lire(fichier, progression, { pagesMax: 250, ocr: false });
    if (lignes.join('').replace(/\s/g, '').length < 300) throw new Error(`${fichier.name} : pas de texte lisible (document scanné) ; demandez le PDF d'origine.`);
    const analyse = CctpLecture.analyser(lignes), reseaux = InventaireCVC.reseauxCctp(analyse);
    // Tableaux d'équipements écrits dans le CCTP (liste des repères, carnet des CTA…)
    const annexe = InventaireCVC.tableauEquipements(lignes.map(l => String(l).split('\t')), 'Tableau du CCTP');
    return { items: InventaireCVC.depuisCctp(analyse.equipements, reseaux, analyse.articlesDetail), reseaux, annexe };
  }
  if (pdf) { const { lignes } = await PdfLecture.lire(fichier, progression, { pagesMax: 120, ocr: false }); return InventaireCVC.depuisDpgfTexte(lignes); }
  const buf = await fichier.arrayBuffer(), feuilles = /\.csv$/i.test(fichier.name) ? XLSX.readCSV(buf) : await XLSX.read(buf);
  // Feuille qui donne le plus d'équipements
  const lus = feuilles.map(f => InventaireCVC.depuisDpgf(f.rows || [])).sort((a, b) => b.items.length - a.items.length);
  if (!lus.length || (!lus[0].items.length && lus[0].erreur)) throw new Error(`${fichier.name} : ${(lus[0] || {}).erreur || 'aucune feuille lisible'}`);
  return lus[0];
}
const natureDe = nom => (/annexe|liste des equipements|liste des équipements|carnet|nomenclature|tableau des/i.test(nom) ? 'annexe' : /dpgf|dqe|bpu|\.xlsx?$|\.csv$/i.test(nom) ? 'dpgf' : 'cctp');
// Règles apprises des corrections faites dans le tableau (partagées par le bureau d'études)
async function reglesInventaire() { try { return await api('GET', '/api/regles-inventaire'); } catch (e) { return []; } }

function dialogueInventaire(et) {
  const a = affaireDe(et.affaireId), docs = (a && a.documents) || [];
  const b = Modal.open(`<h2>📑 CCTP et DPGF</h2>
    <p class="muted petit">Les producteurs, émetteurs et auxiliaires du dossier de consultation sont reconnus puis vérifiés ici : le schéma de principe et l'alimentation électrique en sont préremplis. CCTP en PDF ; DPGF en Excel, CSV ou PDF.</p>
    ${docs.length ? `<fieldset><legend>Documents du chantier ${esc(a.code || '')} dans Pipe-Fit</legend>${docs.map(d => `<label class="case"><input type="checkbox" data-doc="${esc(d.id)}" checked> ${esc(d.nom)} <span class="badge pf">${{ dpgf: 'DPGF', cctp: 'CCTP', annexe: 'Annexe' }[natureDe(d.nom)]}</span></label>`).join('')}</fieldset>` : ''}
    <div class="grille-champs"><label>CCTP (PDF)<input type="file" id="inv-cctp" accept=".pdf,application/pdf"></label><label>DPGF (Excel, CSV ou PDF)<input type="file" id="inv-dpgf" accept=".xlsx,.csv,.pdf"></label>
      <label>Liste des équipements / annexe (PDF, Excel, CSV) <span class="muted petit">facultatif : repères, locaux, débits, puissances</span><input type="file" id="inv-annexe" accept=".xlsx,.csv,.pdf"></label></div>
    <p id="inv-etat" class="petit muted"></p>
    <div class="actions">${(et.inventaire || []).length ? '<button class="secondaire" id="inv-actuel">Revoir l\'inventaire enregistré</button>' : ''}<button class="secondaire" id="inv-x">Annuler</button><button id="inv-lire">Lire</button></div>`);
  b.classList.add('large');
  const etat = t => { const e = b.querySelector('#inv-etat'); if (e) e.textContent = t; };
  b.querySelector('#inv-x').onclick = Modal.close;
  const act = b.querySelector('#inv-actuel');
  if (act) act.onclick = async () => tableauInventaire(et, et.inventaire.map(x => ({ ...x })), [], (et.inventaireReseaux || []).map(r => ({ ...r })), { regles: await reglesInventaire() });
  b.querySelector('#inv-lire').onclick = async () => {
    const sources = [];
    for (const cb of b.querySelectorAll('[data-doc]:checked')) {
      const d = docs.find(x => x.id === cb.dataset.doc);
      sources.push({ nature: natureDe(d.nom), charger: async () => { const r = await fetch(`/api/pf/fichier/${encodeURIComponent(d.fichierId)}`); if (!r.ok) throw new Error(`${d.nom} : fichier indisponible`); return new File([await r.blob()], d.nom, { type: d.mime || '' }); } });
    }
    const fc = b.querySelector('#inv-cctp').files[0], fd = b.querySelector('#inv-dpgf').files[0], fa = b.querySelector('#inv-annexe').files[0];
    if (fc) sources.push({ nature: 'cctp', charger: async () => fc });
    if (fd) sources.push({ nature: 'dpgf', charger: async () => fd });
    if (fa) sources.push({ nature: 'annexe', charger: async () => fa });
    if (!sources.length) return toast('Choisissez le CCTP et / ou le DPGF.');
    b.querySelector('#inv-lire').disabled = true;
    const cctp = [], dpgf = [], resC = [], resD = [], annexe = [], erreurs = [], lus = { cctp: false, dpgf: false };
    for (const s of sources) {
      try {
        const f = await s.charger();
        etat(`Lecture de ${f.name}…`);
        const r = await lireDossier(f, s.nature, p => etat(`Lecture de ${f.name}… ${typeof p === 'number' ? `${Math.round(p * 100)} %` : p || ''}`));
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
const sourcesCourtes = l => { const c = (l || []).find(x => /^CCTP/.test(x)), d = (l || []).find(x => /^DPGF/.test(x)); return [c, d].filter(Boolean).join(' · ').replace('CCTP art. ', 'CCTP ') || (l || []).join(', '); };
function tableauInventaire(et, inv, erreurs, reseaux = [], info = {}) {
  const ecarts = info.ecarts || et.inventaireEcarts || [];
  const G = InventaireCVC.GENRES, NAT = InventaireCVC.NATURE;
  // Gros équipements d'abord (production, CTA, caissons, ECS, splits), puis le reste ; variantes et moins-values à part
  const GROUPES = [['Gros équipements — production, CTA, caissons, ECS', x => !x.variante && (x.categorie === 'producteur' || x.principal)],
    ['Émetteurs', x => !x.variante && !x.principal && x.categorie === 'emetteur'], ['Auxiliaires', x => !x.variante && !x.principal && x.categorie === 'auxiliaire'],
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
      <div class="actions-ligne"><button class="secondaire petit" id="ti-ecarts-copier">📋 Copier les questions</button><button class="secondaire petit" id="ti-ecarts-csv">CSV</button></div>` : ''}
    <h3>Équipements</h3>
    <p class="muted petit">Décochez ce qui ne concerne pas l'étude, corrigez le genre, la quantité ou les puissances (unitaires, kW : <strong>chaud</strong> pour le schéma de chauffage, <strong>froid</strong> pour l'eau glacée, <strong>électrique</strong> pour le bilan électrique). Les quantités viennent du DPGF, les repères et prescriptions du CCTP${info.annexe ? ', le détail par repère du tableau d\'équipements' : ''}. Vos corrections sont retenues pour les prochains dossiers${(info.regles || []).length ? ` (${info.regles.length} règle(s) apprise(s))` : ''}.</p>
    <div class="defile-x"><table class="edit"><thead><tr><th></th><th>Genre</th><th>Désignation</th><th>Repère</th><th>Qté</th><th>P chaud</th><th>P froid</th><th>P élec.</th><th>Débit (m³/h)</th><th>Régime</th><th>Réseau</th><th>Source, prescription, caractéristiques</th></tr></thead><tbody>
    ${GROUPES.map(([titre, f]) => { const l = inv.map((x, i) => [x, i]).filter(([x]) => f(x)); return l.length ? `<tr><th colspan="12" class="petit">${titre}</th></tr>${l.map(([x, i]) => `<tr${x.variante ? ' class="muted"' : ''}>
      <td><input type="checkbox" data-i="${i}" data-k="inclus" ${x.inclus !== false ? 'checked' : ''} aria-label="Retenir"></td>
      <td><select data-i="${i}" data-k="genre">${Object.entries(G).map(([k, g]) => `<option value="${k}" ${k === x.genre ? 'selected' : ''}>${esc(g.libelle)}</option>`).join('')}</select></td>
      <td><input data-i="${i}" data-k="designation" value="${esc(x.designation)}" style="min-width:300px" title="${esc(x.designation)}">${x.chapitre && !x.designation.includes(x.chapitre) ? `<br><span class="petit muted">${esc(x.chapitre)}</span>` : ''}${x.local ? `<br><span class="petit muted">📍 ${esc(x.local)}</span>` : ''}${x.appris ? '<br><span class="ligne-auto">↺ corrigé d\'après une correction précédente</span>' : ''}${x.horsSchema ? `<br><span class="petit avert">${esc(x.horsSchema)} : hors schéma hydraulique</span>` : ''}</td><td><input data-i="${i}" data-k="repere" value="${esc(x.repere || '')}" style="width:80px"></td>
      <td><input data-i="${i}" data-k="qte" value="${esc(x.qte)}" class="nombre" style="width:60px"></td><td><input data-i="${i}" data-k="P" value="${esc(x.P ?? '')}" class="nombre" style="width:62px" title="Puissance calorifique unitaire (kW)"></td><td><input data-i="${i}" data-k="Pfr" value="${esc(x.Pfr ?? '')}" class="nombre" style="width:62px" title="Puissance frigorifique unitaire (kW)"></td><td><input data-i="${i}" data-k="Pel" value="${esc(x.Pel ?? '')}" class="nombre" style="width:62px" title="Puissance électrique unitaire (kW), reprise par l'alimentation électrique"></td><td><input data-i="${i}" data-k="Q" value="${esc(x.Q ?? '')}" class="nombre" style="width:70px" title="Débit d'air par bouche ou de l'équipement"></td>
      <td><input data-i="${i}" data-k="regime" value="${esc(x.regime || '')}" placeholder="70/50" style="width:70px"></td><td><select data-i="${i}" data-k="reseau" style="max-width:170px">${optReseaux(x.reseau)}</select>${x.rattache && x.reseau ? `<br><span class="ligne-auto" title="Rattaché automatiquement">↳ d'après ${x.rattache === 'texte' ? 'le texte (alimentation)' : 'le chapitre de la production'}</span>` : ''}</td><td class="petit muted" style="min-width:260px" title="${esc((x.sources || []).join(', '))}">${esc(sourcesCourtes(x.sources))}${x.prescrit ? `<br>${esc(x.prescrit)}` : ''}${InventaireCVC.caracTexte(x.carac) ? `<br><span style="color:var(--texte)">${esc(InventaireCVC.caracTexte(x.carac))}</span>` : ''}</td></tr>`).join('')}` : ''; }).join('')}
    </tbody></table></div>
    <div class="actions"><button class="secondaire" id="ti-x">Fermer</button><button class="secondaire" id="ti-ok">Enregistrer l'inventaire</button>
      <button id="ti-pid">🗺️ Créer le schéma de principe</button><button id="ti-aero">🌬️ Créer le schéma aéraulique</button><button id="ti-elec">⚡ Créer l'alimentation électrique</button></div>`;
  const b = Modal.open(rendu());
  b.classList.add('large');
  const lier = () => {
    b.querySelectorAll('[data-i]').forEach(el => el.onchange = () => {
      const x = inv[+el.dataset.i], k = el.dataset.k;
      x[k] = k === 'inclus' ? el.checked : ['qte', 'P', 'Pfr', 'Pel', 'Q'].includes(k) ? (el.value === '' ? '' : Notes.num(el.value)) : el.value;
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
    b.querySelector('#ti-ok').onclick = () => { garder(); Modal.close(); App.render(); toast(`Inventaire enregistré : ${inv.filter(x => x.inclus !== false).length} équipement(s).`); };
    b.querySelector('#ti-pid').onclick = () => {
      garder();
      const { entrees, alertes } = InventaireCVC.versSchema(inv, Schema, reseaux);
      const n = nouvelleNote('pid', { ...Notes.defauts('pid'), ...entrees, circuits: entrees.circuits.length ? entrees.circuits : Notes.defauts('pid').circuits });
      n.titre = `Schéma de principe — ${entrees.titreInstallation || 'd\'après le CCTP / DPGF'}`;
      n.commentaire = `Prérempli d'après le dossier de consultation (CCTP / DPGF).${alertes.length ? ` À vérifier : ${alertes.join(' ')}` : ''}`;
      et.notes.push(n); enregistrer(et); Modal.close();
      location.hash = `#/etude/${et.id}/${n.id}`;
      toast(alertes.length ? `Schéma créé. À vérifier : ${alertes[0]}${alertes.length > 1 ? ` (+${alertes.length - 1})` : ''}` : 'Schéma de principe créé d\'après le dossier.', 8000);
    };
    b.querySelector('#ti-aero').onclick = () => {
      garder();
      const { entrees, alertes } = InventaireCVC.versSchemaAir(inv, reseaux);
      const n = nouvelleNote('aero', { ...Notes.defauts('aero'), ...entrees, zones: entrees.zones.length ? entrees.zones : Notes.defauts('aero').zones });
      n.titre = `Schéma aéraulique — ${entrees.titreInstallation || 'd\'après le CCTP / DPGF'}`;
      n.commentaire = `Prérempli d'après le dossier de consultation (CCTP / DPGF) : vérifier les distances des zones au ventilateur et les longueurs d'antenne.${alertes.length ? ` À vérifier : ${alertes.join(' ')}` : ''}`;
      et.notes.push(n); enregistrer(et); Modal.close();
      location.hash = `#/etude/${et.id}/${n.id}`;
      toast(alertes.length ? `Schéma aéraulique créé. À vérifier : ${alertes[0]}${alertes.length > 1 ? ` (+${alertes.length - 1})` : ''}` : 'Schéma aéraulique créé d\'après le dossier.', 8000);
    };
    b.querySelector('#ti-elec').onclick = () => {
      garder();
      const lignes = InventaireCVC.versElec(inv);
      if (!lignes.length) return toast('Aucun équipement alimenté électriquement dans l\'inventaire.');
      const ex = et.notes.find(x => x.type === 'elec');
      if (ex) { ex.entrees = { ...ex.entrees, equipements: Electricite.fusionner((ex.entrees || {}).equipements, lignes).lignes }; enregistrer(et); Modal.close(); location.hash = `#/etude/${et.id}/${ex.id}`; toast('Équipements ajoutés au calcul d\'alimentation électrique existant.', 6000); return; }
      const n = nouvelleNote('elec', { ...Notes.defauts('elec'), equipements: Electricite.fusionner([], lignes).lignes });
      n.commentaire = 'Équipements repris du dossier de consultation (CCTP / DPGF) : choisissez pour chacun son alimentation et sa régulation.';
      et.notes.push(n); enregistrer(et); Modal.close();
      location.hash = `#/etude/${et.id}/${n.id}`;
      toast(`${lignes.length} équipement(s) repris : choisissez leur alimentation et leur régulation.`, 6000);
    };
  };
  lier();
}
