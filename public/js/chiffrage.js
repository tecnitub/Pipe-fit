// Chiffrage depuis plan : la nomenclature exportée du logiciel de dessin (Revit, AutoCAD Plant 3D… : .txt, .csv, .xlsx)
// est rapprochée des familles CAO, elles-mêmes reliées à la bibliothèque de prix (article par diamètre, nombre de
// soudures, temps de préfabrication et de pose). Les heures de soudure sont calculées en pouces-diamètre (cadence
// atelier / chantier), un niveau de complexité ajuste les heures et la marge sur les achats du plan, et des chapitres
// hors plan (container, levage, manutention, nacelle…) complètent le devis généré.
const DN_POUCES = { 8: 0.25, 10: 0.375, 15: 0.5, 20: 0.75, 25: 1, 32: 1.25, 40: 1.5, 50: 2, 65: 2.5, 80: 3, 100: 4, 125: 5, 150: 6, 200: 8, 250: 10, 300: 12, 350: 14, 400: 16, 450: 18, 500: 20, 600: 24 };
const DE_DN = { 13.5: 8, 17.2: 10, 21.3: 15, 26.9: 20, 33.7: 25, 42.4: 32, 48.3: 40, 60.3: 50, 76.1: 65, 88.9: 80, 114.3: 100, 139.7: 125, 168.3: 150, 219.1: 200, 273: 250, 323.9: 300, 355.6: 350, 406.4: 400, 457: 450, 508: 500, 610: 600 };
const poucesDN = dn => DN_POUCES[dn] || num(dn) / 25;
// Diamètre lu dans la nomenclature : « DN50 », « 50 mm », « 60,3 » (diamètre extérieur), « 2" », « 100-50 » (réduction : le plus grand)
function lireDN(v) {
  const s = String(v ?? '').replace(',', '.');
  let m = /DN\s*(\d+)/i.exec(s);
  if (m) return +m[1];
  m = /(\d+(?:\.\d+)?)\s*(?:"|''|pouces?|inch|in\b)/i.exec(s);
  if (m) { const p = +m[1]; const dn = Object.keys(DN_POUCES).find(k => DN_POUCES[k] === p); return dn ? +dn : Math.round(p * 25); }
  m = /(\d+(?:\.\d+)?)/.exec(s);
  if (!m) return 0;
  const x = +m[1];
  if (DE_DN[x]) return DE_DN[x];
  if (DN_POUCES[x]) return x;
  if (x <= 12) { const dn = Object.keys(DN_POUCES).find(k => DN_POUCES[k] === x); if (dn) return +dn; }
  return Math.round(x);
}

const COLONNES_PLAN = {
  systeme: ['systeme', 'nomdusysteme', 'systemname', 'system', 'ligne', 'reseau', 'repere', 'spool', 'circuit', 'abreviationdusysteme', 'typedesysteme'],
  famille: ['famille', 'family', 'familleettype', 'familyandtype', 'objet', 'designation', 'description', 'element', 'composant'],
  type: ['type', 'typename', 'nomdutype'],
  taille: ['taille', 'size', 'diametre', 'dn', 'diametrenominal', 'nominaldiameter', 'dimension', 'diametreexterieur'],
  longueur: ['longueur', 'length', 'long', 'longueurmm', 'longueurm', 'longueurdecoupe', 'cutlength'],
  quantite: ['nombre', 'quantite', 'qte', 'count', 'qty', 'quantity', 'nb'],
};
const nomCol = s => normRecherche(s).replace(/[^a-z0-9]/g, '');
// En-tête : la ligne (parmi les 10 premières) qui reconnaît le plus de colonnes (les exports Revit commencent par le titre)
function analyserNomenclature(sheet) {
  let best = { score: 0, idx: 0, map: {} };
  sheet.rows.slice(0, 10).forEach((r, idx) => {
    const map = {};
    r.forEach((c, j) => { const n = nomCol(c); Object.entries(COLONNES_PLAN).forEach(([k, syn]) => { if (map[k] === undefined && syn.includes(n)) map[k] = j; }); });
    if (Object.keys(map).length > best.score) best = { score: Object.keys(map).length, idx, map };
  });
  return { entete: best.idx, colonnes: best.map, titres: sheet.rows[best.idx] || [] };
}
function lignesPlan(sheet, analyse, uniteLongueur) {
  const c = analyse.colonnes, val = (r, k) => (c[k] === undefined ? '' : String(r[c[k]] ?? '').trim());
  const rows = sheet.rows.slice(analyse.entete + 1).filter(r => val(r, 'famille') || val(r, 'type'));
  const long = rows.map(r => num(String(val(r, 'longueur')).replace(/[^\d.,-]/g, '').replace(',', '.')));
  const enMm = uniteLongueur === 'mm' || (uniteLongueur !== 'm' && Math.max(0, ...long) > 60);
  return rows.map((r, i) => ({ systeme: val(r, 'systeme'), famille: val(r, 'famille'), type: val(r, 'type'), taille: val(r, 'taille'), dn: lireDN(val(r, 'taille') || val(r, 'type') || val(r, 'famille')),
    longueur: Math.round((enMm ? long[i] / 1000 : long[i]) * 1000) / 1000, qte: num(String(val(r, 'quantite')).replace(',', '.')) || 1 }));
}

/* ---------- Familles CAO ---------- */
const cleFamille = s => normRecherche(s).replace(/[^a-z0-9]+/g, ' ').trim();
function familleDe(ligne) {
  const texte = cleFamille(`${ligne.famille} ${ligne.type}`), fam = cleFamille(ligne.famille);
  let best = null, lg = 0;
  Store.all('familles').forEach(f => [f.nom, ...String(f.alias || '').split(',')].map(cleFamille).filter(Boolean).forEach(k => {
    if ((fam === k || ` ${texte} `.includes(` ${k} `)) && k.length > lg) { best = f; lg = k.length; }
  }));
  return best;
}
const articleDe = (f, dn) => { if (!f) return null; const d = (f.declinaisons || []).find(x => num(x.dn) === num(dn)) || (f.declinaisons || []).find(x => !num(x.dn)); return d ? Store.get('articles', d.articleId) : null; };

/* ---------- Paramètres et calcul ---------- */
const NIVEAUX_DEFAUT = [{ nom: 'Simple (atelier, accès facile)', coef: 1, marge: 15 }, { nom: 'Standard', coef: 1.15, marge: 20 }, { nom: 'Complexe (encombré, en hauteur, en site occupé)', coef: 1.35, marge: 25 }, { nom: 'Très complexe (arrêt technique, ATEX, travail de nuit)', coef: 1.6, marge: 30 }];
const EXTRAS_TYPES = ['Container de chantier', 'Levage (grue, camion-grue)', 'Manutention', 'Nacelle', 'Échafaudage', 'Études et plans d\'exécution', 'Essais et contrôles', 'Dossier des ouvrages exécutés (DOE)', 'Transport', 'Consignation / mise en sécurité', 'Installation de chantier'];
function parametresDefaut() {
  const mo = code => (Store.all('mainoeuvre').find(m => m.code === code) || {}).id || '';
  return { cadenceAtelier: 70, cadenceChantier: 35, partAtelier: 70, heuresJour: 7, moAtelier: mo('PREF') || mo('SOUD'), moChantier: mo('MONT') || mo('SOUD'), niveaux: NIVEAUX_DEFAUT.map(n => ({ ...n })), niveau: 1, regroupement: 'systeme', uniteLongueur: 'auto' };
}
// Groupes (système × famille × DN) avec quantités, article, heures atelier / chantier par unité et prix
function calculerChiffrage(ch) {
  const p = { ...parametresDefaut(), ...(ch.params || {}) }, niv = p.niveaux[p.niveau] || p.niveaux[0];
  const groupes = {};
  (ch.lignes || []).forEach(l => {
    const fam = familleDe(l), cle = `${p.regroupement === 'systeme' ? l.systeme : ''}|${fam ? fam.id : cleFamille(`${l.famille} ${l.type}`)}|${l.dn}`;
    const g = groupes[cle] = groupes[cle] || { systeme: p.regroupement === 'systeme' ? l.systeme : '', fam, dn: l.dn, brut: `${l.famille}${l.type ? ' : ' + l.type : ''}`, qte: 0, n: 0 };
    g.qte += fam && fam.unite === 'ml' ? (l.longueur || 0) * l.qte : l.qte; g.n += l.qte;
  });
  const moA = Store.get('mainoeuvre', p.moAtelier) || {}, moC = Store.get('mainoeuvre', p.moChantier) || {};
  const liste = Object.values(groupes).map(g => {
    const a = articleDe(g.fam, g.dn), inch = poucesDN(g.dn), sd = g.fam ? num(g.fam.soudures) : 0, part = num(p.partAtelier) / 100;
    const poucesA = sd * part * inch, poucesC = sd * (1 - part) * inch;
    const hA = g.fam ? (poucesA / Math.max(1, num(p.cadenceAtelier)) * num(p.heuresJour) + num(g.fam.tempsPrefab)) * niv.coef : 0;
    const hC = g.fam ? (poucesC / Math.max(1, num(p.cadenceChantier)) * num(p.heuresJour) + num(g.fam.tempsPose)) * niv.coef : 0;
    const cout = a ? num(a.coutRevient) : 0, pu = Math.round(cout * (1 + num(niv.marge) / 100) * 100) / 100;
    return { ...g, a, qte: Math.round(g.qte * 100) / 100, unite: g.fam ? g.fam.unite || 'u' : 'u', poucesA: poucesA * g.qte, poucesC: poucesC * g.qte, hA, hC, cout, pu, moA, moC,
      statut: !g.fam ? 'famille' : !a ? 'article' : 'ok' };
  }).sort((x, y) => x.systeme.localeCompare(y.systeme) || (x.fam ? x.fam.nom : x.brut).localeCompare(y.fam ? y.fam.nom : y.brut) || x.dn - y.dn);
  const extras = (ch.extras || []).filter(e => e.designation && num(e.qte));
  const tot = {
    poucesA: sumBy(liste, g => g.poucesA), poucesC: sumBy(liste, g => g.poucesC), hA: sumBy(liste, g => g.hA * g.qte), hC: sumBy(liste, g => g.hC * g.qte),
    achats: sumBy(liste, g => g.cout * g.qte), fournitures: sumBy(liste, g => g.pu * g.qte),
    mo: sumBy(liste, g => (g.hA * num(g.moA.tauxVente) + g.hC * num(g.moC.tauxVente)) * g.qte), coutMO: sumBy(liste, g => (g.hA * num(g.moA.tauxCout) + g.hC * num(g.moC.tauxCout)) * g.qte),
    extras: sumBy(extras, e => num(e.qte) * (e.moId ? num(e.heures) * num((Store.get('mainoeuvre', e.moId) || {}).tauxVente) : num(e.pu))),
    coutExtras: sumBy(extras, e => num(e.qte) * (e.moId ? num(e.heures) * num((Store.get('mainoeuvre', e.moId) || {}).tauxCout) : num(e.cout))),
    manquants: liste.filter(g => g.statut !== 'ok').length,
  };
  tot.total = tot.fournitures + tot.mo + tot.extras; tot.cout = tot.achats + tot.coutMO + tot.coutExtras;
  return { p, niv, liste, extras, tot };
}

// Lignes de devis générées : un chapitre par système (ou un chapitre « Tuyauterie »), puis les chapitres hors plan
function lignesDevisDepuis(ch) {
  const { liste, extras } = calculerChiffrage(ch), out = [];
  const mo = (m, h) => ({ type: 'mo', moId: m.id, libelle: m.libelle, heures: Math.round(h * 1000) / 1000, taux: num(m.tauxVente), cout: num(m.tauxCout) });
  const chapitres = [...new Set(liste.map(g => g.systeme))];
  chapitres.forEach(sys => {
    out.push({ type: 'chapitre', titre: sys ? `Réseau ${sys}` : 'Tuyauterie (d\'après plan)', plan: ch.id });
    liste.filter(g => g.systeme === sys).forEach(g => {
      const comp = [];
      if (g.a) comp.push({ type: 'f', articleId: g.a.id, designation: g.a.designation, unite: g.a.unite, qte: 1, pu: g.pu, cout: g.cout, poids: num(g.a.poidsUnitaire) });
      if (g.hA > 0 && g.moA.id) comp.push(mo(g.moA, g.hA));
      if (g.hC > 0 && g.moC.id) comp.push(mo(g.moC, g.hC));
      out.push({ type: 'ouvrage', plan: ch.id, designation: g.a ? g.a.designation : `${g.fam ? g.fam.nom : g.brut}${g.dn ? ' DN' + g.dn : ''}`, unite: g.unite, qte: g.qte,
        detail: g.fam && num(g.fam.soudures) ? `${g.fam.soudures} soudure(s) de ${fmt(poucesDN(g.dn), 2)}" par ${g.unite}` : '', composants: comp });
    });
  });
  [...new Set(extras.map(e => e.chapitre || 'Prestations complémentaires'))].forEach(titre => {
    out.push({ type: 'chapitre', titre, plan: ch.id });
    extras.filter(e => (e.chapitre || 'Prestations complémentaires') === titre).forEach(e => {
      const m = Store.get('mainoeuvre', e.moId);
      out.push({ type: 'ouvrage', plan: ch.id, designation: e.designation, unite: e.unite || 'forfait', qte: num(e.qte),
        composants: m ? [mo(m, num(e.heures))] : [{ type: 'f', articleId: e.articleId || '', designation: e.designation, unite: e.unite || 'forfait', qte: 1, pu: num(e.pu), cout: num(e.cout), poids: 0 }] });
    });
  });
  return out;
}

/* ---------- Écrans ---------- */
function devisTabs(actif) {
  return `<div class="tabs"><a href="#/devis" class="${actif === 'devis' ? 'active' : ''}">Devis</a><a href="#/chiffrages" class="${actif === 'chiffrages' ? 'active' : ''}">Chiffrage depuis plan <span class="count">${Store.all('chiffrages').length}</span></a></div>`;
}
Views.chiffrages = () => `<h1>Devis</h1>${devisTabs('chiffrages')}
  <p class="muted">Importez la nomenclature exportée de votre logiciel de dessin (Revit : Exporter → Rapports → Nomenclature, fichier .txt ; ou .csv / .xlsx) :
    chaque élément est relié à une famille CAO de la bibliothèque (article par diamètre, soudures, temps de préfabrication et de pose), les heures de soudure sont
    calculées en pouces-diamètre, puis le devis est généré par réseau avec les chapitres hors plan.</p>
  <div class="toolbar"><button id="ch-new">+ Nouveau chiffrage</button><a class="btn secondary" href="#/familles">Familles CAO (${Store.all('familles').length})</a></div>
  ${Store.all('chiffrages').length ? `<div class="table-wrap"><table><tr><th>Chiffrage</th><th>Devis</th><th>Client</th><th class="num">Éléments</th><th class="num">Pouces atelier / chantier</th><th class="num">Total HT</th><th class="num">Marge</th></tr>
    ${Store.all('chiffrages').map(ch => { const r = calculerChiffrage(ch), d = Store.get('devis', ch.devisId) || {};
      return `<tr class="clickable" onclick="location.hash='#/chiffrage/${ch.id}'"><td>${esc(ch.nom || 'Sans titre')}${r.tot.manquants ? ` <span class="badge b-warn">${r.tot.manquants} à relier</span>` : ''}</td><td>${esc(d.numero || '')}</td><td>${esc(clientName(docClientId(d)))}</td>
        <td class="num">${(ch.lignes || []).length}</td><td class="num">${fmt(r.tot.poucesA, 0)} / ${fmt(r.tot.poucesC, 0)}</td><td class="num">${eur(r.tot.total)}</td><td class="num">${r.tot.total ? marginBadge((r.tot.total - r.tot.cout) / r.tot.total * 100) : '—'}</td></tr>`; }).join('')}</table></div>`
  : '<p class="muted">Aucun chiffrage. Créez-en un, ou ouvrez un devis et cliquez sur « Chiffrage depuis plan ».</p>'}`;
Views.chiffrages.bind = root => { root.querySelector('#ch-new').onclick = () => { const ch = nouveauChiffrage(''); location.hash = `#/chiffrage/${ch.id}`; }; };

function nouveauChiffrage(devisId) {
  const d = Store.get('devis', devisId);
  return Store.upsert('chiffrages', { nom: d ? (d.objet || d.numero || 'Chiffrage') : 'Nouveau chiffrage', devisId: devisId || '', fichier: '', lignes: [], extras: [], params: parametresDefaut() });
}
function ouvrirChiffrage(devisId) {
  const ch = Store.all('chiffrages').find(c => c.devisId === devisId) || nouveauChiffrage(devisId);
  location.hash = `#/chiffrage/${ch.id}`;
}

Views.chiffrage = params => {
  const ch = Store.get('chiffrages', params[0]);
  if (!ch) return '<p>Chiffrage introuvable. <a href="#/chiffrages">Retour</a></p>';
  const r = calculerChiffrage(ch), p = r.p, d = Store.get('devis', ch.devisId), t = r.tot;
  const moOpts = sel => options(Store.all('mainoeuvre'), sel, m => m.libelle, false);
  const marge = t.total ? (t.total - t.cout) / t.total * 100 : 0;
  return `<div class="toolbar"><a href="#/chiffrages" class="btn secondary">← Chiffrages</a>${d ? `<a class="btn secondary" href="#/devis/${d.id}">Devis ${esc(d.numero || '')}</a>` : ''}<span class="spacer"></span>
    <button class="danger" id="ch-del">Supprimer</button><button class="secondary" id="ch-cs" ${r.liste.some(g => g.a) ? '' : 'disabled'}>Consulter les fournisseurs</button><button id="ch-gen" ${(ch.lignes || []).length || r.extras.length ? '' : 'disabled'}>${d ? 'Mettre à jour le devis' : 'Créer le devis'}</button></div>
  <h1>Chiffrage depuis plan</h1>
  <div class="card"><div class="grid2">
    <div class="field"><label for="ch-nom">Intitulé</label><input id="ch-nom" value="${esc(ch.nom || '')}"></div>
    <div class="field"><label for="ch-devis">Devis à alimenter</label><select id="ch-devis"><option value="">Nouveau devis</option>${options(Store.all('devis').filter(x => x.statut !== 'Accepté' && !x.archive || x.id === ch.devisId), ch.devisId, x => `${x.numero || '…'} – ${x.objet || ''}`, false)}</select></div>
  </div></div>

  <h2>1. Nomenclature du plan</h2>
  <div class="toolbar">
    <label class="btn secondary">${(ch.lignes || []).length ? 'Remplacer la nomenclature' : 'Importer la nomenclature (.txt, .csv, .xlsx)'}<input type="file" id="ch-file" accept=".txt,.csv,.tsv,.xlsx" hidden></label>
    ${document.body.classList.contains('demo') ? '<button class="secondary" id="ch-exemple">Nomenclature d\'exemple (Revit)</button>' : ''}
    <label class="inline small">Longueurs <select id="ch-ul"><option value="auto" ${p.uniteLongueur === 'auto' ? 'selected' : ''}>détection auto</option><option value="mm" ${p.uniteLongueur === 'mm' ? 'selected' : ''}>en mm</option><option value="m" ${p.uniteLongueur === 'm' ? 'selected' : ''}>en m</option></select></label>
    <label class="inline small">Regrouper <select id="ch-grp"><option value="systeme" ${p.regroupement === 'systeme' ? 'selected' : ''}>par réseau / système</option><option value="" ${p.regroupement !== 'systeme' ? 'selected' : ''}>tout ensemble</option></select></label>
  </div>
  ${ch.fichier ? `<p class="muted small">${esc(ch.fichier)} · ${(ch.lignes || []).length} ligne(s) · colonnes reconnues : ${esc(Object.keys(ch.colonnes || {}).join(', '))}</p>` : ''}

  ${r.liste.length ? `<h2>2. Correspondance avec la bibliothèque ${t.manquants ? `<span class="badge b-warn">${t.manquants} à relier</span>` : '<span class="badge b-ok">complète</span>'}</h2>
  <div class="table-wrap"><table class="compact ch-table"><tr><th>Réseau</th><th>Élément du plan</th><th>DN</th><th class="num">Qté</th><th>Famille CAO / article</th><th class="num">Pouces atelier / chantier</th><th class="num">h atelier / u</th><th class="num">h pose / u</th><th class="num">Achat / u</th><th class="num">Vente / u</th></tr>
    ${r.liste.map((g, i) => `<tr class="${g.statut !== 'ok' ? 'a-chiffrer' : ''}"><td class="small">${esc(g.systeme)}</td><td>${esc(g.fam ? g.fam.nom : g.brut)}</td><td>${g.dn || ''}</td><td class="num">${fmt(g.qte, 2)} ${esc(g.unite)}</td>
      <td>${g.statut === 'famille' ? `<button class="small" data-creer="${i}">Créer la famille</button>` : g.statut === 'article' ? `<button class="small" data-relier="${i}">Choisir l'article DN${g.dn}</button>` : `<span class="small">${esc(g.a.ref)} · ${esc(g.a.designation)}</span>`}</td>
      <td class="num">${fmt(g.poucesA, 1)} / ${fmt(g.poucesC, 1)}</td><td class="num">${fmt(g.hA, 2)}</td><td class="num">${fmt(g.hC, 2)}</td><td class="num">${g.a ? eur(g.cout) : '—'}</td><td class="num">${g.a ? eur(g.pu) : '—'}</td></tr>`).join('')}</table></div>` : ''}

  <h2>3. Paramètres du chiffrage</h2>
  <div class="card"><div class="grid2">
    <div class="field"><label for="cp-cA">Cadence atelier (pouces / jour / soudeur)</label><input id="cp-cA" data-p="cadenceAtelier" type="number" step="1" value="${esc(p.cadenceAtelier)}"></div>
    <div class="field"><label for="cp-cC">Cadence chantier (pouces / jour / soudeur)</label><input id="cp-cC" data-p="cadenceChantier" type="number" step="1" value="${esc(p.cadenceChantier)}"></div>
    <div class="field"><label for="cp-part">Soudures réalisées en atelier (%)</label><input id="cp-part" data-p="partAtelier" type="number" step="5" min="0" max="100" value="${esc(p.partAtelier)}"></div>
    <div class="field"><label for="cp-hj">Heures par jour</label><input id="cp-hj" data-p="heuresJour" type="number" step="0.5" value="${esc(p.heuresJour)}"></div>
    <div class="field"><label for="cp-moA">Main-d'œuvre atelier</label><select id="cp-moA" data-p="moAtelier">${moOpts(p.moAtelier)}</select></div>
    <div class="field"><label for="cp-moC">Main-d'œuvre chantier</label><select id="cp-moC" data-p="moChantier">${moOpts(p.moChantier)}</select></div>
  </div>
  <h3>Complexité du chantier</h3>
  <div class="table-wrap"><table class="compact"><tr><th></th><th>Niveau</th><th class="num">Coefficient sur les heures</th><th class="num">Marge sur les achats du plan (%)</th></tr>
    ${p.niveaux.map((n, i) => `<tr><td><input type="radio" name="ch-niv" value="${i}" ${+p.niveau === i ? 'checked' : ''} aria-label="${esc(n.nom)}"></td><td><input data-niv="${i}" data-k="nom" value="${esc(n.nom)}"></td>
      <td class="num"><input data-niv="${i}" data-k="coef" type="number" step="0.05" value="${esc(n.coef)}" style="width:90px"></td><td class="num"><input data-niv="${i}" data-k="marge" type="number" step="1" value="${esc(n.marge)}" style="width:90px"></td></tr>`).join('')}</table></div></div>

  <h2>4. Chapitres hors plan</h2>
  <div class="table-wrap"><table class="compact ch-extras"><tr><th>Chapitre</th><th>Désignation</th><th>Unité</th><th class="num">Qté</th><th>Main-d'œuvre</th><th class="num">Heures / u</th><th class="num">PU vente</th><th class="num">Coût / u</th><th></th></tr>
    ${(ch.extras || []).map((e, i) => `<tr data-x="${i}"><td><input data-k="chapitre" value="${esc(e.chapitre || '')}" list="ch-chaps"></td><td><input data-k="designation" value="${esc(e.designation || '')}"></td><td><input data-k="unite" value="${esc(e.unite || '')}" style="width:80px"></td>
      <td class="num"><input data-k="qte" type="number" step="any" value="${esc(e.qte ?? '')}" style="width:70px"></td><td><select data-k="moId"><option value="">— (fourniture / prestation)</option>${options(Store.all('mainoeuvre'), e.moId, m => m.libelle, false)}</select></td>
      <td class="num"><input data-k="heures" type="number" step="0.5" value="${esc(e.heures ?? '')}" style="width:70px" ${e.moId ? '' : 'disabled'}></td><td class="num"><input data-k="pu" type="number" step="0.01" value="${esc(e.pu ?? '')}" style="width:90px" ${e.moId ? 'disabled' : ''}></td>
      <td class="num"><input data-k="cout" type="number" step="0.01" value="${esc(e.cout ?? '')}" style="width:90px" ${e.moId ? 'disabled' : ''}></td><td><button class="small danger" data-xdel="${i}" aria-label="Retirer">✕</button></td></tr>`).join('') || '<tr><td colspan="9" class="muted">Aucun chapitre complémentaire.</td></tr>'}</table></div>
  <datalist id="ch-chaps">${EXTRAS_TYPES.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
  <div class="toolbar"><select id="ch-xadd" style="width:auto"><option value="">+ Ajouter…</option>${EXTRAS_TYPES.map(x => `<option>${esc(x)}</option>`).join('')}<option value="libre">Autre (libre)</option></select></div>

  <h2>Synthèse</h2>
  <div class="cards">
    <div class="card"><div class="label">Soudures</div><div class="value">${fmt(t.poucesA + t.poucesC, 0)} pouces</div><div class="sub">atelier ${fmt(t.poucesA, 0)} · chantier ${fmt(t.poucesC, 0)}</div></div>
    <div class="card"><div class="label">Heures</div><div class="value">${fmt(t.hA + t.hC, 1)} h</div><div class="sub">préfabrication ${fmt(t.hA, 1)} h · pose ${fmt(t.hC, 1)} h · coef ${fmt(r.niv.coef, 2)}</div></div>
    <div class="card"><div class="label">Fournitures du plan</div><div class="value">${eur(t.fournitures)}</div><div class="sub">achat ${eur(t.achats)} · marge ${fmt(r.niv.marge, 0)} %</div></div>
    <div class="card"><div class="label">Total HT</div><div class="value">${eur(t.total)}</div><div class="sub">MO ${eur(t.mo)} · hors plan ${eur(t.extras)} · ${marginBadge(marge)} marge</div></div>
  </div>`;
};

Views.chiffrage.bind = (root, params) => {
  const ch = Store.get('chiffrages', params[0]);
  if (!ch) return;
  ch.params = { ...parametresDefaut(), ...(ch.params || {}) }; ch.extras = ch.extras || [];
  const save = (rerender = true) => { Store.upsert('chiffrages', ch); if (rerender) App.render(); };
  const q = s => root.querySelector(s);
  q('#ch-nom').onchange = e => { ch.nom = e.target.value; save(false); };
  q('#ch-devis').onchange = e => { ch.devisId = e.target.value; save(); };
  q('#ch-ul').onchange = e => { ch.params.uniteLongueur = e.target.value; if (ch.sheet) ch.lignes = lignesPlan(ch.sheet, analyserNomenclature(ch.sheet), e.target.value); save(); };
  q('#ch-grp').onchange = e => { ch.params.regroupement = e.target.value; save(); };
  const charger = (nom, sheet) => {
    const an = analyserNomenclature(sheet);
    if (an.colonnes.famille === undefined && an.colonnes.type === undefined) return notify('Colonnes « Famille » ou « Type » introuvables dans la nomenclature.');
    Object.assign(ch, { fichier: nom, sheet, colonnes: Object.fromEntries(Object.entries(an.colonnes).map(([k, j]) => [k, an.titres[j]])), lignes: lignesPlan(sheet, an, ch.params.uniteLongueur) });
    save(); App.toast(`${ch.lignes.length} élément(s) importé(s)`);
  };
  q('#ch-file').onchange = async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try { const buf = await file.arrayBuffer(); const sheets = /\.xlsx$/i.test(file.name) ? await XLSX.read(buf) : XLSX.readCSV(buf); charger(file.name, sheets.sort((a, b) => b.rows.length - a.rows.length)[0]); }
    catch (err) { notify('Lecture impossible : ' + err.message); }
  };
  const ex = q('#ch-exemple');
  if (ex) ex.onclick = () => charger('Nomenclature tuyauterie (exemple Revit).txt', XLSX.readCSV(new TextEncoder().encode(nomenclatureExemple()).buffer)[0]);
  root.querySelectorAll('[data-p]').forEach(el => el.onchange = () => { ch.params[el.dataset.p] = el.tagName === 'SELECT' ? el.value : num(el.value); save(); });
  root.querySelectorAll('[name="ch-niv"]').forEach(el => el.onchange = () => { ch.params.niveau = +el.value; save(); });
  root.querySelectorAll('[data-niv]').forEach(el => el.onchange = () => { const n = ch.params.niveaux[+el.dataset.niv]; n[el.dataset.k] = el.dataset.k === 'nom' ? el.value : num(el.value); save(); });
  root.querySelectorAll('.ch-extras tr[data-x] [data-k]').forEach(el => el.onchange = () => {
    const e = ch.extras[+el.closest('tr').dataset.x];
    e[el.dataset.k] = ['qte', 'heures', 'pu', 'cout'].includes(el.dataset.k) ? num(el.value) : el.value;
    save(el.dataset.k === 'moId');
  });
  root.querySelectorAll('[data-xdel]').forEach(b => b.onclick = () => { ch.extras.splice(+b.dataset.xdel, 1); save(); });
  q('#ch-xadd').onchange = e => {
    const v = e.target.value;
    if (!v) return;
    const chef = Store.all('mainoeuvre').find(m => m.code === 'CHEF');
    const modele = { 'Container de chantier': ['forfait', 1, '', 650, 480], 'Levage (grue, camion-grue)': ['jour', 1, '', 1250, 980], 'Manutention': ['h', 8, (Store.all('mainoeuvre').find(m => m.code === 'MONT') || {}).id, 0, 0],
      'Nacelle': ['semaine', 1, '', 690, 520], 'Échafaudage': ['semaine', 1, '', 400, 320], 'Études et plans d\'exécution': ['h', 16, (Store.all('mainoeuvre').find(m => m.code === 'BE') || {}).id, 0, 0],
      'Installation de chantier': ['forfait', 1, chef ? chef.id : '', 0, 0] }[v] || ['forfait', 1, '', 0, 0];
    ch.extras.push({ chapitre: v === 'libre' ? 'Prestations complémentaires' : v, designation: v === 'libre' ? '' : v, unite: modele[0], qte: modele[1], moId: modele[2] || '', heures: modele[2] ? (modele[0] === 'h' ? 1 : 8) : '', pu: modele[3], cout: modele[4] });
    save();
  };
  // Liaisons manquantes : création de la famille CAO ou choix de l'article pour le diamètre
  const r = calculerChiffrage(ch);
  root.querySelectorAll('[data-creer]').forEach(b => b.onclick = () => { const g = r.liste[+b.dataset.creer]; editerFamille({ nom: g.brut.split(' : ')[0], alias: g.brut, unite: /tuyau|tube|pipe/i.test(g.brut) ? 'ml' : 'u', soudures: /coude|elbow/i.test(g.brut) ? 2 : /t[ée]\b|tee/i.test(g.brut) ? 3 : /bride|flange/i.test(g.brut) ? 1 : /r[ée]duction|reducer/i.test(g.brut) ? 2 : 0, tempsPrefab: 0.1, tempsPose: 0.1, declinaisons: [{ dn: g.dn, articleId: '' }] }); });
  root.querySelectorAll('[data-relier]').forEach(b => b.onclick = () => { const g = r.liste[+b.dataset.relier]; const f = { ...g.fam, declinaisons: [...(g.fam.declinaisons || []), { dn: g.dn, articleId: '' }] }; editerFamille(f); });
  q('#ch-gen').onclick = async () => {
    const lignes = lignesDevisDepuis(ch), t = calculerChiffrage(ch).tot;
    if (t.manquants && !await ask(`${t.manquants} élément(s) ne sont pas reliés à la bibliothèque : ils seront « à chiffrer » dans le devis. Continuer ?`, 'Générer', false)) return;
    let d = Store.get('devis', ch.devisId);
    if (!d) { d = newDevis({ objet: ch.nom }); ch.devisId = d.id; }
    if (d.statut === 'Accepté') return notify('Ce devis est accepté : dupliquez-le pour chiffrer un avenant.');
    d.lignes = [...lignes, ...(d.lignes || []).filter(l => l.plan !== ch.id)];
    Store.upsert('devis', d); save(false);
    location.hash = `#/devis/${d.id}`;
    App.toast(`Devis mis à jour : ${lignes.filter(l => l.type !== 'chapitre').length} ouvrage(s) depuis le plan`, 4000);
  };
  q('#ch-cs').onclick = () => {
    const d = Store.get('devis', ch.devisId) || {}, lignes = [];
    calculerChiffrage(ch).liste.filter(g => g.a).forEach(g => { const ex = lignes.find(x => x.articleId === g.a.id); if (ex) ex.qte = Math.round((ex.qte + g.qte) * 100) / 100; else lignes.push({ articleId: g.a.id, designation: g.a.designation, unite: g.a.unite, qte: g.qte }); });
    const fs = [...new Set(lignes.map(l => (Store.get('articles', l.articleId) || {}).fournisseurId).filter(Boolean))].map(eid => ({ entrepriseId: eid, statut: 'À consulter' }));
    const cs = nouvelleConsultation({ objet: ch.nom, affaireId: d.affaireId || '', lignes, fournisseurs: fs });
    location.hash = `#/consultations/${cs.id}`;
  };
  q('#ch-del').onclick = () => ask('Supprimer ce chiffrage ? Le devis déjà généré est conservé.', 'Supprimer').then(ok => { if (ok) { Store.remove('chiffrages', ch.id); location.hash = '#/chiffrages'; } });
};

/* ---------- Bibliothèque → Familles CAO ---------- */
Views.familles = () => `<h1>Bibliothèque</h1>${biblioTabs('familles')}
  <p class="muted">Familles du logiciel de dessin reliées à la bibliothèque de prix : l'article est choisi selon le diamètre de l'élément, et chaque famille porte son nombre de soudures et ses temps de préfabrication et de pose (par unité, ou par mètre pour les tubes). Le nom et les synonymes servent à reconnaître les éléments de la nomenclature.</p>
  <div class="toolbar"><button id="fam-add">+ Famille</button></div>
  <div class="table-wrap"><table><tr><th>Famille</th><th>Synonymes</th><th>Unité</th><th class="num">Soudures</th><th class="num">Préfab. h</th><th class="num">Pose h</th><th>Articles par diamètre</th></tr>
    ${Store.all('familles').slice().sort((a, b) => a.nom.localeCompare(b.nom)).map(f => `<tr class="clickable" data-fam="${f.id}"><td><strong>${esc(f.nom)}</strong></td><td class="small">${esc(f.alias || '')}</td><td>${esc(f.unite)}</td><td class="num">${fmt(f.soudures)}</td><td class="num">${fmt(f.tempsPrefab, 2)}</td><td class="num">${fmt(f.tempsPose, 2)}</td>
      <td class="small">${(f.declinaisons || []).map(d => `${d.dn ? 'DN' + d.dn : 'tous DN'} → ${esc((Store.get('articles', d.articleId) || {}).ref || '?')}`).join(' · ')}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Aucune famille.</td></tr>'}</table></div>`;
Views.familles.bind = root => {
  root.querySelector('#fam-add').onclick = () => editerFamille({ nom: '', unite: 'u', soudures: 0, tempsPrefab: 0, tempsPose: 0, declinaisons: [] });
  root.querySelectorAll('[data-fam]').forEach(tr => tr.onclick = () => editerFamille({ ...Store.get('familles', tr.dataset.fam) }));
};
function editerFamille(f) {
  f.declinaisons = (f.declinaisons || []).map(d => ({ ...d }));
  const art = sel => `<option value="">— choisir —</option>${Store.all('articles').slice().sort((a, b) => (a.famille || '').localeCompare(b.famille || '') || a.ref.localeCompare(b.ref)).map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.ref)} · ${esc(a.designation)}</option>`).join('')}`;
  const dessiner = () => `<h2 style="margin-top:0">${f.id ? 'Famille CAO' : 'Nouvelle famille CAO'}</h2>
    <div class="grid2">
      <div class="field"><label for="fa-nom">Nom (tel qu'il apparaît dans la nomenclature)</label><input id="fa-nom" value="${esc(f.nom)}"></div>
      <div class="field"><label for="fa-alias">Synonymes (séparés par des virgules)</label><input id="fa-alias" value="${esc(f.alias || '')}"></div>
      <div class="field"><label for="fa-unite">Unité</label><select id="fa-unite"><option value="u" ${f.unite !== 'ml' ? 'selected' : ''}>à l'unité</option><option value="ml" ${f.unite === 'ml' ? 'selected' : ''}>au mètre (tubes)</option></select></div>
      <div class="field"><label for="fa-sd">Soudures par ${f.unite === 'ml' ? 'mètre' : 'unité'}</label><input id="fa-sd" type="number" step="0.5" value="${esc(f.soudures)}"></div>
      <div class="field"><label for="fa-pf">Temps de préfabrication (h, hors soudure)</label><input id="fa-pf" type="number" step="0.05" value="${esc(f.tempsPrefab)}"></div>
      <div class="field"><label for="fa-po">Temps de pose (h, hors soudure)</label><input id="fa-po" type="number" step="0.05" value="${esc(f.tempsPose)}"></div>
    </div>
    <h3>Article de la bibliothèque par diamètre</h3>
    <div class="table-wrap"><table class="compact"><tr><th>DN (vide = tous)</th><th>Article</th><th></th></tr>
      ${f.declinaisons.map((d, i) => `<tr><td><input data-di="${i}" data-k="dn" type="number" value="${esc(d.dn || '')}" style="width:90px"></td><td><select data-di="${i}" data-k="articleId">${art(d.articleId)}</select></td><td><button class="small danger" data-ddel="${i}" type="button">✕</button></td></tr>`).join('')}</table></div>
    <button class="secondary small" id="fa-plus" type="button">+ Diamètre</button>
    <div class="modal-actions">${f.id ? '<button class="danger" id="fa-del">Supprimer</button>' : ''}<span style="flex:1"></span><button class="secondary" id="fa-annuler">Annuler</button><button id="fa-ok">Enregistrer</button></div>`;
  const box = Modal.open(dessiner());
  const lire = () => {
    const v = s => box.querySelector(s).value;
    Object.assign(f, { nom: v('#fa-nom').trim(), alias: v('#fa-alias').trim(), unite: v('#fa-unite'), soudures: num(v('#fa-sd')), tempsPrefab: num(v('#fa-pf')), tempsPose: num(v('#fa-po')) });
    box.querySelectorAll('[data-di]').forEach(el => { f.declinaisons[+el.dataset.di][el.dataset.k] = el.dataset.k === 'dn' ? num(el.value) : el.value; });
  };
  const lier = () => {
    box.querySelector('#fa-plus').onclick = () => { lire(); f.declinaisons.push({ dn: '', articleId: '' }); box.innerHTML = dessiner(); lier(); };
    box.querySelectorAll('[data-ddel]').forEach(b => b.onclick = () => { lire(); f.declinaisons.splice(+b.dataset.ddel, 1); box.innerHTML = dessiner(); lier(); });
    box.querySelector('#fa-unite').onchange = () => { lire(); box.innerHTML = dessiner(); lier(); };
    box.querySelector('#fa-annuler').onclick = Modal.close;
    const del = box.querySelector('#fa-del');
    if (del) del.onclick = () => ask(`Supprimer la famille ${f.nom} ?`, 'Supprimer').then(ok => { if (ok) { Store.remove('familles', f.id); Modal.close(); App.render(); } });
    box.querySelector('#fa-ok').onclick = () => {
      lire();
      if (!f.nom) return notify('Indiquez le nom de la famille.');
      f.declinaisons = f.declinaisons.filter(d => d.articleId);
      Store.upsert('familles', f); Modal.close(); App.render();
    };
  };
  lier();
}

// Démonstration : export de nomenclature Revit (texte séparé par tabulations, longueurs en mm, titre en première ligne)
function nomenclatureExemple() {
  const L = [['Nomenclature de canalisations et raccords – Ligne NEP'], ['Abréviation du système', 'Famille', 'Type', 'Taille', 'Longueur', 'Nombre']];
  const sys = [['NEP-ALLER', 50], ['NEP-RETOUR', 50], ['EG-101', 100]];
  sys.forEach(([s, dn]) => {
    L.push([s, 'Tuyau', 'Inox 316L soudé', `${dn} mm`, dn === 100 ? '42500' : '61800', '1']);
    L.push([s, 'Coude - Soudé', 'Standard 90°', `${dn} mm`, '', dn === 100 ? '9' : '14']);
    L.push([s, 'Té - Soudé', 'Égal', `${dn} mm`, '', dn === 100 ? '2' : '4']);
    L.push([s, 'Bride à collerette', 'PN16', `${dn} mm`, '', '4']);
    if (dn === 50) L.push([s, 'Vanne papillon', 'À levier PN16', `${dn} mm`, '', '3']);
    L.push([s, 'Support de tuyauterie', 'Collier sur rail', `${dn} mm`, dn === 100 ? '42500' : '61800', '1']);
  });
  L.push(['EG-101', 'Réduction concentrique', 'Soudée', '100 mm-50 mm', '', '2']);
  L.push(['EG-101', 'Purgeur automatique', 'Standard', '15 mm', '', '2']);
  return L.map(r => r.map(c => `"${c}"`).join('\t')).join('\r\n');
}
