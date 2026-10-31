// Inventaire de l'étude d'après le dossier de consultation : CCTP (PDF) et DPGF (Excel, CSV ou PDF) chargés ici ou pris
// dans les documents du chantier Pipe-Fit ; producteurs, émetteurs et auxiliaires reconnus, vérifiés dans un tableau, puis
// schéma de principe et alimentation électrique préremplis.

// Lecture d'un fichier : CCTP → équipements des articles ; DPGF → lignes d'ouvrages
async function lireDossier(fichier, nature, progression) {
  const pdf = /\.pdf$/i.test(fichier.name) || fichier.type === 'application/pdf';
  if (nature === 'cctp') {
    if (!pdf) throw new Error(`${fichier.name} : le CCTP se lit en PDF.`);
    const { lignes } = await PdfLecture.lire(fichier, progression, { pagesMax: 250, ocr: false });
    if (lignes.join('').replace(/\s/g, '').length < 300) throw new Error(`${fichier.name} : pas de texte lisible (document scanné) ; demandez le PDF d'origine.`);
    return InventaireCVC.depuisCctp(CctpLecture.analyser(lignes).equipements);
  }
  if (pdf) { const { lignes } = await PdfLecture.lire(fichier, progression, { pagesMax: 120, ocr: false }); return InventaireCVC.depuisDpgfTexte(lignes).items; }
  const buf = await fichier.arrayBuffer(), feuilles = /\.csv$/i.test(fichier.name) ? XLSX.readCSV(buf) : await XLSX.read(buf);
  // Feuille qui donne le plus d'équipements
  const lus = feuilles.map(f => InventaireCVC.depuisDpgf(f.rows || [])).sort((a, b) => b.items.length - a.items.length);
  if (!lus.length || (!lus[0].items.length && lus[0].erreur)) throw new Error(`${fichier.name} : ${(lus[0] || {}).erreur || 'aucune feuille lisible'}`);
  return lus[0].items;
}
const natureDe = nom => (/dpgf|dqe|bpu|\.xlsx?$|\.csv$/i.test(nom) ? 'dpgf' : 'cctp');

function dialogueInventaire(et) {
  const a = affaireDe(et.affaireId), docs = (a && a.documents) || [];
  const b = Modal.open(`<h2>📑 CCTP et DPGF</h2>
    <p class="muted petit">Les producteurs, émetteurs et auxiliaires du dossier de consultation sont reconnus puis vérifiés ici : le schéma de principe et l'alimentation électrique en sont préremplis. CCTP en PDF ; DPGF en Excel, CSV ou PDF.</p>
    ${docs.length ? `<fieldset><legend>Documents du chantier ${esc(a.code || '')} dans Pipe-Fit</legend>${docs.map(d => `<label class="case"><input type="checkbox" data-doc="${esc(d.id)}" checked> ${esc(d.nom)} <span class="badge pf">${natureDe(d.nom) === 'dpgf' ? 'DPGF' : 'CCTP'}</span></label>`).join('')}</fieldset>` : ''}
    <div class="grille-champs"><label>CCTP (PDF)<input type="file" id="inv-cctp" accept=".pdf,application/pdf"></label><label>DPGF (Excel, CSV ou PDF)<input type="file" id="inv-dpgf" accept=".xlsx,.csv,.pdf"></label></div>
    <p id="inv-etat" class="petit muted"></p>
    <div class="actions">${(et.inventaire || []).length ? '<button class="secondaire" id="inv-actuel">Revoir l\'inventaire enregistré</button>' : ''}<button class="secondaire" id="inv-x">Annuler</button><button id="inv-lire">Lire</button></div>`);
  b.classList.add('large');
  const etat = t => { const e = b.querySelector('#inv-etat'); if (e) e.textContent = t; };
  b.querySelector('#inv-x').onclick = Modal.close;
  const act = b.querySelector('#inv-actuel');
  if (act) act.onclick = () => tableauInventaire(et, et.inventaire.map(x => ({ ...x })), []);
  b.querySelector('#inv-lire').onclick = async () => {
    const sources = [];
    for (const cb of b.querySelectorAll('[data-doc]:checked')) {
      const d = docs.find(x => x.id === cb.dataset.doc);
      sources.push({ nature: natureDe(d.nom), charger: async () => { const r = await fetch(`/api/pf/fichier/${encodeURIComponent(d.fichierId)}`); if (!r.ok) throw new Error(`${d.nom} : fichier indisponible`); return new File([await r.blob()], d.nom, { type: d.mime || '' }); } });
    }
    const fc = b.querySelector('#inv-cctp').files[0], fd = b.querySelector('#inv-dpgf').files[0];
    if (fc) sources.push({ nature: 'cctp', charger: async () => fc });
    if (fd) sources.push({ nature: 'dpgf', charger: async () => fd });
    if (!sources.length) return toast('Choisissez le CCTP et / ou le DPGF.');
    b.querySelector('#inv-lire').disabled = true;
    const cctp = [], dpgf = [], erreurs = [];
    for (const s of sources) {
      try {
        const f = await s.charger();
        etat(`Lecture de ${f.name}…`);
        (s.nature === 'cctp' ? cctp : dpgf).push(...await lireDossier(f, s.nature, p => etat(`Lecture de ${f.name}… ${typeof p === 'number' ? `${Math.round(p * 100)} %` : p || ''}`)));
      } catch (e) { erreurs.push(e.message); }
    }
    const inv = InventaireCVC.fusionner(cctp, dpgf);
    if (!inv.length) { b.querySelector('#inv-lire').disabled = false; return etat(erreurs.join(' · ') || 'Aucun producteur ni émetteur reconnu dans ces documents.'); }
    tableauInventaire(et, inv, erreurs);
  };
}

// Inventaire à vérifier : genre, désignation, quantité, puissance, régime ; puis création des calculs
function tableauInventaire(et, inv, erreurs) {
  const G = InventaireCVC.GENRES, CAT = { producteur: 'Producteurs', emetteur: 'Émetteurs', auxiliaire: 'Auxiliaires' };
  const rendu = () => `<h2>📑 Inventaire du dossier de consultation <span class="compte">${inv.length}</span></h2>
    ${erreurs.length ? `<p class="erreur petit">${erreurs.map(esc).join('<br>')}</p>` : ''}
    <p class="muted petit">Décochez ce qui ne concerne pas l'étude, corrigez le genre, la quantité ou la puissance (puissance unitaire, kW). Les quantités viennent du DPGF, les repères et prescriptions du CCTP.</p>
    <div class="defile-x"><table class="edit"><thead><tr><th></th><th>Genre</th><th>Désignation</th><th>Repère</th><th>Qté</th><th>P unit. (kW)</th><th>Régime</th><th>Source</th></tr></thead><tbody>
    ${['producteur', 'emetteur', 'auxiliaire'].map(c => { const l = inv.map((x, i) => [x, i]).filter(([x]) => x.categorie === c); return l.length ? `<tr><th colspan="8" class="petit">${CAT[c]}</th></tr>${l.map(([x, i]) => `<tr>
      <td><input type="checkbox" data-i="${i}" data-k="inclus" ${x.inclus !== false ? 'checked' : ''} aria-label="Retenir"></td>
      <td><select data-i="${i}" data-k="genre">${Object.entries(G).map(([k, g]) => `<option value="${k}" ${k === x.genre ? 'selected' : ''}>${esc(g.libelle)}</option>`).join('')}</select></td>
      <td><input data-i="${i}" data-k="designation" value="${esc(x.designation)}"></td><td><input data-i="${i}" data-k="repere" value="${esc(x.repere || '')}" style="width:80px"></td>
      <td><input data-i="${i}" data-k="qte" value="${esc(x.qte)}" class="nombre" style="width:60px"></td><td><input data-i="${i}" data-k="P" value="${esc(x.P)}" class="nombre" style="width:70px"></td>
      <td><input data-i="${i}" data-k="regime" value="${esc(x.regime || '')}" placeholder="70/50" style="width:70px"></td><td class="petit muted">${esc((x.sources || []).join(', '))}${x.prescrit ? `<br>${esc(x.prescrit)}` : ''}</td></tr>`).join('')}` : ''; }).join('')}
    </tbody></table></div>
    <div class="actions"><button class="secondaire" id="ti-x">Fermer</button><button class="secondaire" id="ti-ok">Enregistrer l'inventaire</button>
      <button id="ti-pid">🗺️ Créer le schéma de principe</button><button id="ti-elec">⚡ Créer l'alimentation électrique</button></div>`;
  const b = Modal.open(rendu());
  b.classList.add('large');
  const lier = () => {
    b.querySelectorAll('[data-i]').forEach(el => el.onchange = () => {
      const x = inv[+el.dataset.i], k = el.dataset.k;
      x[k] = k === 'inclus' ? el.checked : ['qte', 'P'].includes(k) ? (el.value === '' ? '' : Notes.num(el.value)) : el.value;
      if (k === 'genre') { x.categorie = G[el.value].categorie; b.innerHTML = rendu(); lier(); }
    });
    b.querySelector('#ti-x').onclick = Modal.close;
    const garder = () => { et.inventaire = inv.map(x => ({ ...x })); enregistrer(et); };
    b.querySelector('#ti-ok').onclick = () => { garder(); Modal.close(); App.render(); toast(`Inventaire enregistré : ${inv.filter(x => x.inclus !== false).length} équipement(s).`); };
    b.querySelector('#ti-pid').onclick = () => {
      garder();
      const { entrees, alertes } = InventaireCVC.versSchema(inv, Schema);
      const n = nouvelleNote('pid', { ...Notes.defauts('pid'), ...entrees, circuits: entrees.circuits.length ? entrees.circuits : Notes.defauts('pid').circuits });
      n.titre = `Schéma de principe — ${entrees.titreInstallation || 'd\'après le CCTP / DPGF'}`;
      n.commentaire = `Prérempli d'après le dossier de consultation (CCTP / DPGF).${alertes.length ? ` À vérifier : ${alertes.join(' ')}` : ''}`;
      et.notes.push(n); enregistrer(et); Modal.close();
      location.hash = `#/etude/${et.id}/${n.id}`;
      toast(alertes.length ? `Schéma créé. À vérifier : ${alertes[0]}${alertes.length > 1 ? ` (+${alertes.length - 1})` : ''}` : 'Schéma de principe créé d\'après le dossier.', 8000);
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
