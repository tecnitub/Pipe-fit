// Prise de cotes tuyauterie : saisie sur place (téléphone, tablette) ou au bureau. Photos avant travaux, cotes relevées,
// ligne dessinée en 3D avec ses accessoires normalisés (tubes, coudes, tés, réductions, robinetterie, brides, raccords),
// longueurs de coupe calculées depuis les cotes axe à axe, nomenclature, photos après travaux et comparatif avant / après ;
// fiche imprimable et PDF avec l'isométrique.

const releveBrouillon = { cle: null, r: null, chemin: '', cam: null, vue: null };
const relevesDe = affaireId => Store.all('releves').filter(r => r.affaireId === affaireId).sort((a, b) => `${b.date}${b.numero || ''}`.localeCompare(`${a.date}${a.numero || ''}`));
// Retour : chantier, ou visite commerciale (client, sinon liste des visites)
const retourReleve = r => (Store.me.role === 'atelier' ? '#/pointage/rapports' : r.affaireId ? `#/chantier/${r.affaireId}` : r.clientId ? `#/entreprise/${r.clientId}` : '#/visites');
const libRetourReleve = r => (Store.me.role === 'atelier' ? 'Rapports' : r.affaireId ? 'Chantier' : r.clientId ? 'Client' : 'Visites');
const clientReleve = r => (r.affaireId ? affaireOf(r.affaireId).clientId : r.clientId) || '';
const nomClientReleve = r => (clientReleve(r) ? clientName(clientReleve(r)) : r.clientLibre || '');
const srcPhoto = p => (String(p.photoId || '').startsWith('data:') ? p.photoId : fileUrl(p.photoId));
const STATUT_BADGE = { Brouillon: 'b-warn', Relevé: 'b-info', Terminé: 'b-ok' };
const badgeReleve = r => `<span class="badge ${STATUT_BADGE[r.statut] || 'b-warn'}">${esc(r.statut || 'Brouillon')}</span>`;
const LIB_EL = { tube: '▬ Tube', coude: '↱ Coude 3D', devoie: '⟋ Dévoiement', te: '┳ Té', reduc: '▷ Réduction', vanne: '⋈ Vanne', v3v: '⋔ Vanne 3 voies', instrument: '🌡 Instrument', brides: '‖ Brides', raccord: '⊡ Raccord', fond: '◗ Fond' };
const dirDe = v => Object.keys(Tuyauterie.DIRS).find(k => Tuyauterie.DIRS[k].every((x, i) => Math.abs(x - v[i]) < 1e-6)) || '';
const dirLib = v => { const k = dirDe(v); return k ? Tuyauterie.DIRS_LIB[k] : 'oblique'; };

function nouveauReleve(query) {
  const me = Store.me.userId || '';
  const prevu = me && typeof planJour === 'function' && planJour(me, isoDate(new Date()))[0];
  // Visite commerciale : relevé rattaché au client (ou à un prospect), sans chantier, pour chiffrer le devis
  const visite = query.get('visite') === '1' || !!query.get('client');
  return { affaireId: visite ? '' : query.get('chantier') || (prevu ? prevu.affaireId : ''), clientId: query.get('client') || '', clientLibre: '', visite, systeme: 'acier', userId: me, date: isoDate(new Date()), ligne: '', fluide: '', matiere: Tuyauterie.MATIERES[0], pn: 'PN16',
    dnDepart: 50, dirDepart: 'E', elements: [], cotes: [{ repere: 'A', libelle: '', valeur: '', remarque: '' }], photosAvant: [], photosApres: [], observations: '', statut: 'Brouillon' };
}

Views.releve = (params, query) => {
  const id = params[0] || 'new';
  const rec = id !== 'new' && Store.get('releves', id);
  if (id !== 'new' && !rec) return '<p>Relevé introuvable.</p>';
  if (params[1] === 'fiche') return releveFicheVue(rec);
  const cle = id === 'new' ? `new|${query.toString()}` : id;
  if (releveBrouillon.cle !== cle) Object.assign(releveBrouillon, { cle, r: rec ? JSON.parse(JSON.stringify(rec)) : nouveauReleve(query), chemin: '', cam: Vue3D.etatInitial() });
  return releveForm(releveBrouillon.r);
};

// DN et direction à la fin de la liste éditée (pour proposer les valeurs du prochain élément)
function finListe(r, chemin, pl) {
  const pcs = pl.pieces.filter(pc => pc.id.slice(0, pc.id.lastIndexOf('.') + 1) === (chemin ? `${chemin}.b.` : ''));
  const der = pcs[pcs.length - 1];
  if (der) return { dn: der.dn2 || der.dn, dir: der.d1 || der.dir };
  if (!chemin) return { dn: +r.dnDepart || 50, dir: Tuyauterie.DIRS[r.dirDepart] || Tuyauterie.DIRS.E };
  const te = pl.pieces.find(pc => pc.id === chemin);
  return { dn: te ? te.dnB : 50, dir: (te && te.vb) || Tuyauterie.DIRS.H };
}
const perpendiculaire = (d, pref) => pref.find(k => Math.abs(Tuyauterie.DIRS[k].reduce((s, x, i) => s + x * d[i], 0)) < 1e-6) || 'N';

function releveForm(r) {
  const a = Store.get('affaires', r.affaireId) || {}, pl = Tuyauterie.placer(r), b = releveBrouillon;
  const lignes = [...new Set(Store.all('releves').filter(x => x.affaireId === r.affaireId).map(x => x.ligne).filter(Boolean))];
  const f = (k, lib, type = 'text', extra = '') => `<div class="field"><label for="rl-${k}">${lib}</label><input id="rl-${k}" data-rl="${k}" type="${type}" value="${esc(r[k] ?? '')}" ${extra}></div>`;
  const deja = relevesDe(r.affaireId).filter(x => x.id !== r.id);
  const S = Tuyauterie.systeme(r);
  return `<div class="toolbar no-print"><a href="${retourReleve(r)}" class="btn secondary">← ${libRetourReleve(r)}</a><span class="spacer"></span>
    ${r.id && Store.get('releves', r.id) ? `<a class="btn secondary" href="#/releve/${esc(r.id)}/fiche">Fiche imprimable</a>` : ''}</div>
  <h1>Prise de cotes${r.numero ? ` ${esc(r.numero)}` : ''} ${badgeReleve(r)}${r.affaireId ? '' : ' <span class="badge b-info">Visite commerciale</span>'}</h1>
  <div class="card releve-form">
    <fieldset class="hd-bloc"><legend>Ligne relevée</legend>
      <div class="grid2">
        <div class="field"><label for="rl-aff">Chantier ou visite</label><select id="rl-aff" class="big-select">${Store.me.role === 'atelier' ? '' : `<option value="" ${r.affaireId ? '' : 'selected'}>Visite commerciale (sans chantier, pour chiffrer)</option>`}${options(chantiersActifs().concat(a.id && !chantiersActifs().includes(a) ? [a] : []), r.affaireId, affaireLabel, false)}</select></div>
        <div class="field"><label for="rl-ligne">Repère de la ligne *</label><input id="rl-ligne" data-rl="ligne" list="rl-lignes" value="${esc(r.ligne)}" placeholder="Ex. EG-DN80-012, by-pass pompe P2, collecteur départ…">
          <datalist id="rl-lignes">${lignes.map(x => `<option>${esc(x)}</option>`).join('')}</datalist></div>
      </div>
      ${r.affaireId ? '' : `<div class="grid2">
        <div class="field"><label for="rl-client">Client</label><select id="rl-client" data-rl="clientId"><option value="">Prospect (saisir son nom)</option>${options(clientsList(), r.clientId, undefined, false)}</select></div>
        ${r.clientId ? '<div></div>' : f('clientLibre', 'Nom du prospect', 'text', 'placeholder="Ex. Fromagerie du Val – M. Durand"')}
      </div>`}
      <div class="grid3">
        <div class="field"><label for="rl-userId">${r.affaireId ? 'Technicien' : 'Relevé par'}</label><select id="rl-userId" data-rl="userId">${options(Store.all('users').filter(u => !u.archive), r.userId)}</select></div>
        ${f('date', 'Date', 'date')}
        ${f('fluide', 'Fluide véhiculé', 'text', 'placeholder="Eau glacée, vapeur, air comprimé…"')}
        <div class="field"><label for="rl-systeme">Type de tube</label><select id="rl-systeme">${Object.entries(Tuyauterie.SYSTEMES).map(([k, s]) => `<option value="${k}" ${Tuyauterie.cleSysteme(r) === k ? 'selected' : ''}>${esc(s.lib)}</option>`).join('')}</select></div>
        <div class="field"><label for="rl-matiere">Matière</label><select id="rl-matiere" data-rl="matiere">${optionsStr(Tuyauterie.MATIERES, r.matiere)}</select></div>
        <div class="field"><label for="rl-pn">Pression nominale</label><select id="rl-pn" data-rl="pn">${optionsStr(Tuyauterie.PN, r.pn)}</select></div>
        <div class="field"><label for="rl-typeBride">Brides de la ligne</label><select id="rl-typeBride" data-rl="typeBride">${Object.entries(Tuyauterie.BRIDES_TYPES).map(([k, l]) => `<option value="${k}" ${(r.typeBride || 'collerette') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      </div>
      ${deja.length ? `<p class="small muted">Déjà relevé sur ce chantier : ${deja.map(x => `<a href="#/releve/${esc(x.id)}">${esc(x.ligne)}</a> (${dateFr(x.date)})`).join(' · ')}</p>` : ''}
    </fieldset>

    <fieldset class="hd-bloc"><legend>Photos avant travaux <span class="muted small">${r.photosAvant.length}</span></legend>
      ${photosReleveHtml(r.photosAvant, 'avant')}
    </fieldset>

    <fieldset class="hd-bloc"><legend>Cotes relevées</legend>
      <div class="rl-cotes">${r.cotes.map((c, i) => `<div class="rl-cote">
        <input data-cote="${i}" data-k="repere" value="${esc(c.repere)}" placeholder="Repère" aria-label="Repère" class="rl-rep">
        <input data-cote="${i}" data-k="libelle" value="${esc(c.libelle)}" placeholder="Ex. axe collecteur → nu du mur" aria-label="Désignation" class="rl-lib">
        <span class="rl-val"><input data-cote="${i}" data-k="valeur" value="${esc(String(c.valeur ?? '').replace('.', ','))}" inputmode="decimal" placeholder="0" aria-label="Cote en mm"> mm</span>
        <input data-cote="${i}" data-k="remarque" value="${esc(c.remarque || '')}" placeholder="Remarque" aria-label="Remarque" class="rl-lib">
        <button class="icon" data-rmcote="${i}" aria-label="Retirer la cote">✕</button></div>`).join('')}</div>
      <button class="small secondary" id="rl-addcote">+ Ajouter une cote</button>
    </fieldset>

    <fieldset class="hd-bloc"><legend>Isométrique 3D et accessoires</legend>
      <div class="rl-3d-bar">${[['iso', 'Iso'], ['dessus', 'Dessus'], ['face', 'Face'], ['cote', 'Côté']].map(([k, l]) => `<button class="small secondary" data-vue="${k}">${l}</button>`).join('')}
        <span class="rl-3d-opts">${[['cotes', 'Cotes à l\'axe'], ['coupes', 'Longueurs de coupe'], ['notes', 'Annotations']].map(([k, l]) => `<label class="check small"><input type="checkbox" data-opt3d="${k}" ${b.cam[k] !== false && (k !== 'coupes' || b.cam.coupes) ? 'checked' : ''}> ${l}</label>`).join('')}</span>
        <span class="small muted">${S.sertir ? '<span class="rl-pt-bleu rl-pt-vert" aria-hidden="true"></span> sertissage' : '<span class="rl-pt-bleu" aria-hidden="true"></span> soudure'}</span></div>
      <canvas class="rl-3d" id="rl-3d" aria-label="Vue 3D de la ligne"></canvas>
      <p class="small muted">Tournez avec le doigt ou la souris, pincez ou molette pour zoomer, deux doigts ou clic droit pour déplacer ; touchez une pièce pour la retrouver dans la liste.</p>
      <div id="rl-erreurs">${erreursReleveHtml(pl)}</div>
      ${editeurListeHtml(r, pl)}
    </fieldset>

    <fieldset class="hd-bloc"><legend>Fiche de débit, nomenclature et prix</legend>${pl.pieces.length ? `<div class="toolbar">${boutonsChiffrageReleve(r)}</div>` : ''}<div id="rl-calc">${calculsReleveHtml(r, pl)}</div></fieldset>

    <fieldset class="hd-bloc"><legend>Photos après travaux <span class="muted small">${r.photosApres.length}</span></legend>
      ${photosReleveHtml(r.photosApres, 'apres')}
      ${r.photosAvant.length && r.photosApres.length ? `<h3 class="small">Avant / après</h3>${comparatifHtml(r, srcPhoto)}` : ''}
    </fieldset>

    <div class="field"><label for="rl-obs">Observations</label><textarea id="rl-obs" data-rl="observations" data-dictee rows="2" placeholder="Accès, supportage existant, calorifuge à déposer, points de piquage, contraintes…">${esc(r.observations || '')}</textarea></div>
    <p class="neg small" id="rl-err"></p>
    <div class="toolbar">${r.statut !== 'Terminé' ? '<button class="secondary" id="rl-save">Enregistrer</button>' : ''}<span class="spacer"></span>
      ${r.statut !== 'Terminé' ? `<button class="${r.statut === 'Relevé' ? 'secondary' : 'big'}" id="rl-valider">${r.statut === 'Relevé' ? 'Enregistrer le relevé' : 'Valider le relevé'}</button>` : ''}
      ${r.statut !== 'Brouillon' ? `<button class="big" id="rl-terminer">${r.statut === 'Terminé' ? 'Enregistrer' : 'Travaux terminés'}</button>` : ''}</div>
  </div>`;
}

function photosReleveHtml(liste, cle) {
  return `<div class="photos-grid big rl-photos">${liste.map((p, i) => `<div class="ph"><img src="${srcPhoto(p)}" alt="Photo ${i + 1}"><button class="icon" data-rmph="${cle}|${i}" aria-label="Retirer la photo">✕</button>
      <input class="rl-leg" data-leg="${cle}|${i}" value="${esc(p.legende || '')}" placeholder="Légende (repère, vue…)" aria-label="Légende de la photo ${i + 1}"></div>`).join('')}
    <label class="ph add" for="rl-ph-${cle}"><span aria-hidden="true">📷</span><span class="small">${cle === 'avant' ? 'Photo avant travaux' : 'Photo après travaux'}</span><input id="rl-ph-${cle}" data-addph="${cle}" type="file" accept="image/*" capture="environment" multiple hidden></label></div>`;
}
// Photos avant et après côte à côte (même ordre)
function comparatifHtml(r, src) {
  const n = Math.max(r.photosAvant.length, r.photosApres.length);
  const cell = (p, lib) => (p ? `<figure><img src="${src(p)}" alt="${lib}"><figcaption>${lib}${p.legende ? ` · ${esc(p.legende)}` : ''}</figcaption></figure>` : '<figure class="vide"></figure>');
  return `<div class="rl-comparatif">${Array.from({ length: n }, (_, i) => `${cell(r.photosAvant[i], `Avant ${i + 1}`)}${cell(r.photosApres[i], `Après ${i + 1}`)}`).join('')}</div>`;
}

function erreursReleveHtml(pl) {
  return pl.erreurs.length ? `<ul class="neg small rl-errs">${pl.erreurs.map(e => `<li>Élément ${esc(numeroEl(e.chemin))} : ${esc(e.msg)}</li>`).join('')}</ul>` : '';
}
// « 4.b.2 » -> « 5 › 3 » (numérotation à partir de 1, dérivation après le té)
const numeroEl = chemin => String(chemin).split('.b.').map(x => +x + 1).join(' › ');

function editeurListeHtml(r, pl) {
  const b = releveBrouillon, chemin = b.chemin, liste = Tuyauterie.listeDe(r, chemin) || [];
  const S = Tuyauterie.systeme(r);
  const dnSel = (k, v, i, lib = S.sertir ? 'Ø' : 'DN') => `<label class="rl-p">${lib} <select data-el="${i}" data-k="${k}">${S.dns.map(d => `<option value="${d}" ${+v === d ? 'selected' : ''}>${S.sertir ? `${String(S.de[d]).replace('.', ',')}` : d}</option>`).join('')}</select></label>`;
  const dirSel = (k, v, i, lib) => `<label class="rl-p">${lib} <select data-el="${i}" data-k="${k}">${Object.entries(Tuyauterie.DIRS_LIB).map(([d, l]) => `<option value="${d}" ${v === d ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  const sel = (k, v, i, lib, opts) => `<label class="rl-p">${lib} <select data-el="${i}" data-k="${k}">${Object.entries(opts).map(([o, l]) => `<option value="${esc(o)}" ${String(v ?? '') === o ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const mm = (k, v, i, lib, ph = '') => `<label class="rl-p">${lib} <input data-el="${i}" data-k="${k}" value="${esc(String(v ?? '').replace('.', ','))}" inputmode="decimal" placeholder="${esc(ph)}" class="rl-mm"> mm</label>`;
  const piece = i => pl.pieces.find(pc => pc.id === `${chemin ? `${chemin}.b.` : ''}${i}`);
  const params = (el, i) => {
    const pc = piece(i) || {};
    switch (el.t) {
      case 'tube': return `${sel('auto', el.auto ? '1' : '', i, '', { '': 'Longueur de coupe', 1: 'Cote axe à axe' })}${el.auto ? mm('cote', el.cote, i, 'cote', 'axe à axe') : mm('l', el.l, i, '', 'longueur')}`;
      // Cote axe-face : celle de la norme (ou du raccord à sertir) proposée, remplacée par celle du fabricant si saisie
      case 'coude': return `${sel('angle', String(el.angle || 90), i, 'Angle', { 90: '90°', 45: '45°' })}${dirSel('vers', el.vers, i, 'vers')}${mm('af', el.af, i, 'axe-face', pc.axeFace && !el.af ? String(pc.axeFace).replace('.', ',') : '')}`;
      case 'devoie': return `${sel('angle', String(Tuyauterie.ANGLES_DEVOIEMENT.includes(+el.angle) ? +el.angle : 45), i, 'Coudes', Object.fromEntries(Tuyauterie.ANGLES_DEVOIEMENT.map(a => [a, `${a}°`])))}${dirSel('vers', el.vers, i, 'vers')}${mm('dec', el.dec, i, 'décalage', 'mm')}
        <label class="rl-p">puis <select data-el="${i}" data-k="vers2"><option value="">— (simple)</option>${Object.entries(Tuyauterie.DIRS_LIB).map(([d, l]) => `<option value="${d}" ${el.vers2 === d ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${el.vers2 ? mm('dec2', el.dec2, i, 'décalage', 'mm') : ''}`;
      case 'v3v': return `${dirSel('vers', el.vers, i, 'Voie B vers')}${sel('rac', el.rac || 'bride', i, '', Tuyauterie.RACCORDEMENTS)}
        ${(el.rac || 'bride') === 'bride' ? sel('typeBride', el.typeBride === 'tournante' ? 'tournante' : 'collerette', i, 'contre-brides', { collerette: 'à collerette', tournante: 'tournantes + collets' }) : ''}
        ${dirSel('tige', el.tige || dirDe(pc.tige || []) || 'H', i, 'Moteur vers')}${mm('l', el.l, i, 'Face à face', String(pc.ftf ? Math.round(pc.ftf) : ''))}<button class="small" data-branche="${i}">Voie B (${(el.branche || []).length}) ›</button>`;
      case 'te': return `${dirSel('vers', el.vers, i, 'Dérivation vers')}${dnSel('dnB', el.dnB || el.dn, i, S.sertir ? 'Ø dériv.' : 'DN dériv.')}${mm('af', el.af, i, 'axe-face', pc.axeFace && !el.af ? String(pc.axeFace).replace('.', ',') : '')}<button class="small" data-branche="${i}">Dérivation (${(el.branche || []).length}) ›</button>`;
      case 'reduc': return `${dnSel('dn2', el.dn2, i, 'vers DN')}${sel('exc', el.exc || '', i, '', { '': 'Concentrique', haut: 'Excentrique plat dessus', bas: 'Excentrique plat dessous' })}`;
      case 'vanne': return `${sel('type', el.type || 'boisseau', i, '', Object.fromEntries(Object.entries(Tuyauterie.VANNES).map(([k, v]) => [k, v.lib])))}${sel('rac', el.rac || 'bride', i, '', Tuyauterie.RACCORDEMENTS)}
        ${(el.rac || 'bride') === 'bride' ? sel('typeBride', el.typeBride === 'tournante' ? 'tournante' : 'collerette', i, 'contre-brides', { collerette: 'à collerette', tournante: 'tournantes + collets' }) : ''}
        ${Tuyauterie.VANNES[el.type || 'boisseau'].commande ? dirSel('tige', el.tige || dirDe(pc.tige || []) || 'H', i, 'Commande vers') : ''}${mm('l', el.l, i, 'Face à face', String(pc.ftf ? Math.round(pc.ftf) : ''))}`;
      case 'raccord': return sel('type', el.type || 'union', i, '', Tuyauterie.RACCORDS);
      case 'instrument': return `${sel('type', el.type || 'thermometre', i, '', { thermometre: 'Thermomètre', sonde_t: 'Sonde de température', sonde_p: 'Sonde de pression' })}${dirSel('vers', el.vers || dirDe(pc.tige || []) || 'H', i, 'tige vers')}
        <label class="rl-p">plage <input data-el="${i}" data-k="plage" value="${esc(el.plage || '')}" placeholder="${el.type === 'sonde_p' ? '0-10 bar' : '0-120 °C'}" class="rl-mm"></label>`;
      case 'brides': return sel('typeBride', el.typeBride || r.typeBride || 'collerette', i, '', Tuyauterie.BRIDES_TYPES);
      default: return '';
    }
  };
  const encombrement = (el, i) => {
    const pc = piece(i);
    if (!pc) return '';
    if (el.t === 'tube') return `coupe <strong>${fmt(pc.coupe || 0)}</strong> mm`;
    if (el.t === 'devoie') { const tb = pl.pieces.find(x => x.id === pc.id && x.t === 'tube'); return tb ? `oblique ${fmt(tb.el.cote)} · coupe <strong>${fmt(tb.coupe)}</strong> mm` : ''; }
    if (['coude', 'te', 'v3v'].includes(el.t)) return `axe-face ${fmt(pc.axeFace, 1)} mm`;
    return `${fmt(pc.L, 0)} mm`;
  };
  const te = chemin && Tuyauterie.trouver(r, chemin);
  const parent = chemin.includes('.b.') ? chemin.slice(0, chemin.lastIndexOf('.b.')) : '';
  const fin = finListe(r, chemin, pl);
  return `<div class="rl-editeur">
    <div class="rl-fil">${chemin ? `<button class="small secondary" data-chemin="${esc(parent)}">← ${parent ? 'Dérivation précédente' : 'Ligne principale'}</button> <strong>${te && te.el.t === 'v3v' ? 'Voie B de la vanne 3 voies' : 'Dérivation du té'} n° ${esc(numeroEl(chemin))}</strong> (DN${esc(te && (te.el.dnB || te.el.dn))})`
      : `<strong>Ligne principale</strong> · départ ${dnSel('dnDepart', r.dnDepart, '-1', 'DN')} ${dirSel('dirDepart', r.dirDepart, '-1', 'vers')}
        <input data-el="-1" data-k="noteDepart" value="${esc(r.noteDepart || '')}" placeholder="Annotation du départ (ex. départ sur existant, piquage…)" aria-label="Annotation du départ" class="rl-note">`}</div>
    <ol class="rl-liste">${liste.map((el, i) => { const id = `${chemin ? `${chemin}.b.` : ''}${i}`; return `<li class="rl-el ${b.cam.sel === id ? 'sel' : ''}" data-elid="${esc(id)}">
      <span class="rl-num" data-pick="${esc(id)}">${i + 1}</span><span class="rl-type" data-pick="${esc(id)}">${LIB_EL[el.t] || esc(el.t)}</span>
      ${dnSel('dn', el.dn, i)}
      ${params(el, i)}
      <input data-el="${i}" data-k="repere" value="${esc(el.repere || '')}" placeholder="Repère" aria-label="Repère de l'élément" class="rl-repel">
      <input data-el="${i}" data-k="note" value="${esc(el.note || '')}" placeholder="Annotation (ex. début filetage sur existant)" aria-label="Annotation sur l'isométrique" class="rl-note">
      <span class="rl-enc small" data-enc="${i}">${encombrement(el, i)}</span>
      <span class="rl-act"><button class="icon" data-mv="${i}|-1" aria-label="Monter" ${i ? '' : 'disabled'}>↑</button><button class="icon" data-mv="${i}|1" aria-label="Descendre" ${i < liste.length - 1 ? '' : 'disabled'}>↓</button><button class="icon" data-rmel="${i}" aria-label="Retirer">✕</button></span></li>`; }).join('')
      || '<li class="muted small">Aucun élément : ajoutez les pièces dans l\'ordre de la ligne, depuis le départ.</li>'}</ol>
    <p class="small muted">Fin de ${chemin ? 'la dérivation' : 'la ligne'} : DN${fin.dn}, direction ${dirLib(fin.dir)}.</p>
    <div class="rl-ajouts">${Object.entries(LIB_EL).map(([t, l]) => `<button class="small secondary" data-add="${t}">+ ${l.replace(/^\S+ /, '')}</button>`).join('')}</div>
  </div>`;
}

function calculsReleveHtml(r, pl) {
  const deb = Tuyauterie.debit(pl), nom = Tuyauterie.nomenclature(r, pl);
  if (!pl.pieces.length) return '<p class="muted small">La fiche de débit et la nomenclature se remplissent avec les éléments de la ligne.</p>';
  const parDN = {};
  deb.forEach(d => { parDN[d.dn] = (parDN[d.dn] || 0) + d.coupe; });
  return `<div class="table-wrap"><table class="compact"><tr><th>Élément</th><th>Repère</th><th>DN</th><th class="num">Ø ext.</th><th class="num">Cote axe à axe</th><th class="num">Longueur de coupe</th></tr>
    ${deb.map(d => `<tr><td>${esc(numeroEl(d.id))}</td><td>${esc(d.repere)}</td><td>${esc(Tuyauterie.taille(r, d.dn))}</td><td class="num">${fmt(d.de, 1)}</td><td class="num">${d.cote !== null ? `${fmt(d.cote)} mm` : '—'}</td><td class="num"><strong>${fmt(d.coupe)} mm</strong></td></tr>`).join('')}
    <tr class="total"><td colspan="5">Total tube ${Object.entries(parDN).map(([dn, l]) => `DN${dn} : ${fmt(l / 1000, 2)} m`).join(' · ')}</td><td class="num">${fmt(deb.reduce((s, d) => s + d.coupe, 0) / 1000, 2)} m</td></tr></table></div>
  ${souduresHtml(pl)}
  <div class="table-wrap"><table class="compact"><tr><th>Désignation</th><th>Norme</th><th class="num">Qté</th></tr>
    ${nom.map(l => `<tr><td>${esc(l.designation)}</td><td class="small">${esc(l.norme)}</td><td class="num">${fmt(l.quantite, l.unite === 'm' ? 2 : 0)} ${esc(l.unite)}</td></tr>`).join('')}</table></div>
  <p class="small muted">Dimensions des accessoires : valeurs nominales des normes (ISO 3419 / EN 10253 pour les raccords à souder, EN 1092-1 pour les brides PN16, EN 558 pour la robinetterie). À confirmer avec les fiches techniques des fabricants avant découpe ; une longueur saisie remplace la valeur de la norme.</p>
  ${prixReleveHtml(r)}`;
}
// Soudures bout à bout (points bleus de l'isométrique)
function souduresHtml(pl) {
  if (pl.sertir) { const s = Tuyauterie.bilanSoudures(pl, 'sertissages'); return s.nombre ? `<p class="small"><span class="rl-pt-bleu rl-pt-vert" aria-hidden="true"></span> <strong>${s.nombre} sertissage(s)</strong> : ${Object.entries(s.parDN).map(([dn, k]) => `Ø${String(Tuyauterie.SYSTEMES.inoxSertir.de[dn]).replace('.', ',')} × ${k}`).join(' · ')} · aucune soudure</p>` : ''; }
  const s = Tuyauterie.bilanSoudures(pl);
  return s.nombre ? `<p class="small"><span class="rl-pt-bleu" aria-hidden="true"></span> <strong>${s.nombre} soudure(s) bout à bout</strong> : ${Object.entries(s.parDN).map(([dn, k]) => `DN${dn} × ${k}`).join(' · ')} · ${fmt(s.pouces, 1)} pouces-diamètre</p>` : '';
}

// Prix du relevé, calculé comme un chiffrage depuis plan : familles CAO et articles de la bibliothèque, cadences de soudage,
// barèmes de pose, niveau de complexité (paramètres du dernier chiffrage). Bureau seulement (les compagnons ne voient pas les prix).
function prixReleve(r) {
  const dernier = Store.all('chiffrages').slice(-1)[0], p = { ...((dernier && dernier.params) || {}) };
  if (r.niveau !== undefined && r.niveau !== '') p.niveau = +r.niveau;
  return calculerChiffrage({ lignes: Tuyauterie.lignesChiffrage(r), extras: [], params: { ...p, regroupement: '' } });
}
function prixReleveHtml(r) {
  const hd = estHorsDevis(affaireOf(r.affaireId));
  if (Store.me.role === 'atelier') return hd && (r.elements || []).length ? `<div class="toolbar"><button id="rl-hd">📦 Ajouter le matériel à l'intervention</button></div>` : '';
  const res = prixReleve(r), t = res.tot;
  if (!res.liste.length) return '';
  const marge = t.total ? ((t.total - t.cout) / t.total) * 100 : 0;
  return `<h3>Prix estimé <span class="muted small">comme un devis depuis plan</span> ${t.manquants ? `<span class="badge b-warn">${t.manquants} élément(s) sans prix</span>` : '<span class="badge b-ok">tout est chiffré</span>'}</h3>
  <div class="toolbar"><label class="inline small" for="rl-niveau">Complexité</label><select id="rl-niveau" style="width:auto">${res.p.niveaux.map((x, i) => `<option value="${i}" ${+res.p.niveau === i ? 'selected' : ''}>${esc(x.nom)} (× ${fmt(x.coef, 2)})</option>`).join('')}</select>
    ${hd ? '<button id="rl-hd">📦 Ajouter le matériel à l\'intervention</button>' : ''}</div>
  <div class="table-wrap"><table class="compact"><tr><th>Élément</th><th>DN</th><th class="num">Qté</th><th>Article</th><th class="num">PU vente</th><th class="num">Fournitures</th><th class="num">h préfab</th><th class="num">h pose</th></tr>
    ${res.liste.map(g => `<tr class="${g.statut !== 'ok' ? 'a-chiffrer' : ''}"><td>${esc(g.fam ? g.fam.nom : g.brut)}</td><td>${g.dn || ''}</td><td class="num">${fmt(g.qte, 2)} ${esc(g.unite)}</td>
      <td class="small">${g.a ? esc(g.a.designation) : `<span class="badge b-warn">${g.statut === 'famille' ? 'famille à créer' : `article DN${g.dn} à choisir`}</span>`}</td><td class="num">${g.a ? eur(g.pu) : '—'}</td><td class="num">${g.a ? eur(g.pu * g.qte) : '—'}</td>
      <td class="num">${fmt(g.hA * g.qte, 2)}</td><td class="num">${fmt(g.hC * g.qte, 2)}</td></tr>`).join('')}</table></div>
  <div class="cards rl-prix">
    <div class="card"><div class="label">Fournitures</div><div class="value">${eur(t.fournitures)}</div><div class="sub">achat ${eur(t.achats)} · marge ${fmt(res.niv.marge, 0)} %</div></div>
    <div class="card"><div class="label">Préfabrication atelier</div><div class="value">${eur(t.prefab - t.fournitures)}</div><div class="sub">${fmt(t.hA, 1)} h à ${eur(res.A.vente)}/h</div></div>
    <div class="card"><div class="label">Pose sur site</div><div class="value">${eur(t.pose)}</div><div class="sub">${fmt(t.hC, 1)} h à ${eur(res.C.vente)}/h</div></div>
    <div class="card"><div class="label">Total HT</div><div class="value">${eur(t.total)}</div><div class="sub">${marginBadge(marge)} marge</div></div>
  </div>
  <p class="small muted">Cadences, taux et barèmes de pose du dernier chiffrage depuis plan. ${t.manquants ? 'Les éléments sans prix se relient à la bibliothèque dans le chiffrage (« → Chiffrage »), qui crée aussi le devis.' : '« → Chiffrage » crée le devis avec ces lignes.'}${hd ? ' Intervention hors devis : le matériel s\'ajoute à facturer, les heures restent celles pointées.' : ''}</p>`;
}
// Intervention hors devis : le matériel du relevé passe dans le matériel à facturer (un nouvel envoi remplace le précédent)
async function ajouterMaterielHD(r) {
  const a = affaireOf(r.affaireId);
  if (!estHorsDevis(a)) return;
  if (!r.id) r.id = uid();
  const res = prixReleve(r), anciens = Store.all('consommations').filter(c => c.releveId === r.id);
  if (!res.liste.length) return notify('Aucun élément de tuyauterie dans ce relevé.');
  // Le compagnon ne remplace que ses propres lignes : celles du bureau restent (il le prévient)
  if (Store.me.role === 'atelier' && anciens.some(c => c.userId !== Store.me.userId)) return notify('Le matériel de ce relevé est déjà sur l\'intervention (ajouté par le bureau).');
  if (anciens.length && !(await ask(`Remplacer les ${anciens.length} ligne(s) déjà ajoutées depuis ce relevé ?`, 'Remplacer', false))) return;
  anciens.forEach(c => Store.remove('consommations', c.id));
  res.liste.forEach(g => Store.upsert('consommations', { articleId: g.a ? g.a.id : '', designation: g.a ? g.a.designation : `${g.fam ? g.fam.nom : g.brut} DN${g.dn}`, unite: g.a ? g.a.unite : g.unite,
    qte: g.qte, pu: g.a ? g.pu : 0, cout: g.a ? g.cout : 0, affaireId: a.id, date: isoDate(new Date()), userId: Store.me.userId || '', releveId: r.id }));
  App.toast(`${res.liste.length} ligne(s) de matériel ajoutée(s) à l'intervention ${a.code || ''}`, 4000);
  if (Store.me.role !== 'atelier') location.hash = `#/chantier/${a.id}`;
}

Views.releve.bind = (root, params) => {
  if (params[1] === 'fiche') {
    const rec = Store.get('releves', params[0]), pdf = root.querySelector('#rl-pdf');
    if (pdf && rec) pdf.onclick = () => PDF.telecharger(releveDocument(rec), `Releve-cotes-${rec.numero || rec.id}.pdf`).catch(err => notify(err.message));
    if (rec) brancherChiffrageReleve(root, () => rec);
    return;
  }
  const b = releveBrouillon, r = b.r, $ = s => root.querySelector(s);
  if (!r) return;
  if (b.vue) b.vue.detruire();
  b.vue = Vue3D.creer($('#rl-3d'), b.cam, { onPick: id => { b.cam.sel = id; if (id) b.chemin = id.includes('.b.') ? id.slice(0, id.lastIndexOf('.b.')) : ''; App.render(); const li = document.querySelector('.rl-el.sel'); if (li) li.scrollIntoView({ block: 'nearest' }); } });
  b.vue.maj(Tuyauterie.placer(r));
  // Mise à jour sans tout redessiner (le champ en cours de saisie garde le curseur)
  const majCalculs = () => {
    const pl = Tuyauterie.placer(r);
    b.vue.maj(pl);
    $('#rl-calc').innerHTML = calculsReleveHtml(r, pl);
    $('#rl-erreurs').innerHTML = erreursReleveHtml(pl);
    const ed = document.createElement('div'); ed.innerHTML = editeurListeHtml(r, pl);
    root.querySelectorAll('[data-enc]').forEach(s => { const n = ed.querySelector(`[data-enc="${s.dataset.enc}"]`); if (n) s.innerHTML = n.innerHTML; });
  };
  root.querySelectorAll('[data-rl]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
    r[el.dataset.rl] = el.value;
    if (el.dataset.rl === 'typeBride') App.render(); else if (['matiere', 'pn'].includes(el.dataset.rl)) majCalculs();
  }));
  $('#rl-aff').onchange = () => { r.affaireId = $('#rl-aff').value; r.visite = !r.affaireId; App.render(); };
  if ($('#rl-client')) $('#rl-client').onchange = () => { r.clientId = $('#rl-client').value; App.render(); };
  // Type de tube : matière proposée, diamètres ramenés à ceux du système (tube à sertir jusqu'au Ø108)
  $('#rl-systeme').onchange = () => {
    const S = Tuyauterie.SYSTEMES[$('#rl-systeme').value];
    r.systeme = $('#rl-systeme').value; r.matiere = S.matiere;
    const borne = d => (S.dns.includes(+d) ? +d : S.dns.reduce((x, y) => (Math.abs(y - d) < Math.abs(x - d) ? y : x)));
    const fixer = l => (l || []).forEach(e => { ['dn', 'dn2', 'dnB'].forEach(k => { if (e[k]) e[k] = borne(+e[k]); }); if (S.sertir && ['vanne', 'v3v'].includes(e.t) && e.rac === 'souder') e.rac = 'sertir'; if (!S.sertir && e.rac === 'sertir') e.rac = 'bride'; fixer(e.branche); });
    r.dnDepart = borne(+r.dnDepart || 50); fixer(r.elements);
    App.render();
  };
  // Cotes relevées
  root.querySelectorAll('[data-cote]').forEach(el => el.addEventListener('input', () => { const c = r.cotes[+el.dataset.cote]; c[el.dataset.k] = el.dataset.k === 'valeur' ? el.value.replace(',', '.') : el.value; }));
  root.querySelectorAll('[data-rmcote]').forEach(x => x.onclick = () => { r.cotes.splice(+x.dataset.rmcote, 1); App.render(); });
  $('#rl-addcote').onclick = () => {
    const der = r.cotes[r.cotes.length - 1], rep = der && /^[A-Y]$/.test(der.repere) ? String.fromCharCode(der.repere.charCodeAt(0) + 1) : '';
    r.cotes.push({ repere: rep, libelle: '', valeur: '', remarque: '' }); App.render();
    const ins = document.querySelectorAll('[data-k="libelle"][data-cote]'); if (ins.length) ins[ins.length - 1].focus();
  };
  // Photos avant / après
  const liste = cle => (cle === 'avant' ? r.photosAvant : r.photosApres);
  root.querySelectorAll('[data-addph]').forEach(inp => inp.onchange = async ev => {
    for (const fi of ev.target.files) { try { liste(inp.dataset.addph).push({ photoId: await compressImage(fi), legende: '', date: isoDate(new Date()) }); } catch (err) { notify('Photo illisible.'); } }
    App.render();
  });
  root.querySelectorAll('[data-rmph]').forEach(x => x.onclick = () => { const [c, i] = x.dataset.rmph.split('|'); liste(c).splice(+i, 1); App.render(); });
  root.querySelectorAll('[data-leg]').forEach(x => x.addEventListener('input', () => { const [c, i] = x.dataset.leg.split('|'); liste(c)[+i].legende = x.value; }));
  brancherChiffrageReleve(root, () => r);
  // Prix et matériel de l'intervention : zone redessinée à chaque modification de la ligne, d'où la délégation
  $('#rl-calc').addEventListener('change', e => { if (e.target.id === 'rl-niveau') { r.niveau = +e.target.value; majCalculs(); } });
  $('#rl-calc').addEventListener('click', e => { if (e.target.closest('#rl-hd')) ajouterMaterielHD(r); });
  // Vue 3D
  root.querySelectorAll('[data-vue]').forEach(x => x.onclick = () => b.vue.vue(x.dataset.vue));
  root.querySelectorAll('[data-opt3d]').forEach(x => x.onchange = () => { b.cam[x.dataset.opt3d] = x.checked; b.vue.rendu(); });
  // Éléments de la ligne
  const courante = () => Tuyauterie.listeDe(r, b.chemin) || [];
  const STRUCTURE = ['auto', 'angle', 'vers', 'type', 'rac', 'dn', 'dn2', 'dnB', 'exc', 'tige', 'typeBride', 'vers2', 'dnDepart', 'dirDepart'];
  root.querySelectorAll('[data-el]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
    const k = el.dataset.k, i = +el.dataset.el, cible = i < 0 ? r : courante()[i];
    if (!cible) return;
    const v = el.value.replace(',', '.');
    cible[k] = ['dn', 'dn2', 'dnB', 'dnDepart', 'angle'].includes(k) ? +v : k === 'auto' ? !!v : ['l', 'cote', 'dec', 'dec2', 'af'].includes(k) ? v : el.value;
    // Changement de DN : les éléments suivants de même DN suivent (jusqu'à la prochaine réduction)
    // Filtre, disconnecteur : raccordement imposé par le DN (taraudé jusqu'au DN50, à brides au-delà)
    if (i >= 0 && cible.t === 'vanne' && ['type', 'dn'].includes(k)) {
      const racs = (Tuyauterie.VANNES[cible.type] || {}).racs, ok = rc => racs[rc] && cible.dn >= racs[rc][0] && cible.dn <= racs[rc][1];
      if (racs && !ok(cible.rac || 'bride')) cible.rac = ok('taraude') ? 'taraude' : 'bride';
    }
    if (k === 'dn' && i >= 0) { const l = courante(); for (let j = i + 1; j < l.length && l[j].t !== 'reduc'; j++) l[j].dn = +v; }
    if (k === 'dn2' && i >= 0) { const l = courante(); for (let j = i + 1; j < l.length && l[j].t !== 'reduc'; j++) l[j].dn = +v; }
    if (k === 'dnDepart') { const l = r.elements; for (let j = 0; j < l.length && l[j].t !== 'reduc'; j++) l[j].dn = +v; }
    if (STRUCTURE.includes(k)) App.render(); else majCalculs();
  }));
  root.querySelectorAll('[data-pick]').forEach(x => x.onclick = () => {
    b.cam.sel = b.cam.sel === x.dataset.pick ? null : x.dataset.pick;
    root.querySelectorAll('.rl-el').forEach(li => li.classList.toggle('sel', li.dataset.elid === b.cam.sel));
    b.vue.rendu();
  });
  root.querySelectorAll('[data-add]').forEach(x => x.onclick = () => {
    const pl = Tuyauterie.placer(r), fin = finListe(r, b.chemin, pl), t = x.dataset.add, d = fin.dir, vertical = Math.abs(d[2]) > 0.5;
    const el = { t, dn: fin.dn };
    if (t === 'tube') Object.assign(el, { auto: true, cote: '' });
    if (t === 'coude') Object.assign(el, { angle: 90, vers: perpendiculaire(d, vertical ? ['E', 'N'] : ['N', 'E', 'H']) });
    if (t === 'devoie') Object.assign(el, { angle: 45, vers: perpendiculaire(d, vertical ? ['E', 'N'] : ['H', 'N', 'E']), dec: '' });
    const racDefaut = Tuyauterie.systeme(r).sertir ? 'sertir' : 'bride';
    if (t === 'v3v') Object.assign(el, { vers: perpendiculaire(d, vertical ? ['E', 'N'] : ['B', 'N', 'E']), rac: racDefaut, typeBride: r.typeBride === 'tournante' ? 'tournante' : 'collerette', branche: [] });
    if (t === 'te') Object.assign(el, { vers: perpendiculaire(d, vertical ? ['E', 'N'] : ['H', 'N', 'E']), dnB: fin.dn, branche: [] });
    if (t === 'reduc') el.dn2 = Tuyauterie.DN[Math.max(0, Tuyauterie.DN.indexOf(fin.dn) - 1)];
    if (t === 'vanne') Object.assign(el, { type: 'boisseau', rac: racDefaut, typeBride: r.typeBride === 'tournante' ? 'tournante' : 'collerette' });
    if (t === 'brides') el.typeBride = r.typeBride || 'collerette';
    if (t === 'raccord') el.type = 'union';
    if (t === 'instrument') Object.assign(el, { type: 'thermometre', vers: vertical ? 'E' : 'H' });
    courante().push(el);
    b.cam.sel = `${b.chemin ? `${b.chemin}.b.` : ''}${courante().length - 1}`;
    App.render();
    const der = document.querySelector('.rl-el.sel input[data-k="cote"], .rl-el.sel input[data-k="l"], .rl-el.sel input[data-k="dec"]');
    if (der && (t === 'tube' || t === 'devoie')) der.focus();
  });
  root.querySelectorAll('[data-rmel]').forEach(x => x.onclick = async () => {
    const el = courante()[+x.dataset.rmel];
    if (Tuyauterie.aBranche(el) && (el.branche || []).length && !(await ask(`Retirer ${el.t === 'v3v' ? 'la vanne 3 voies' : 'le té'} et les ${el.branche.length} élément(s) de sa dérivation ?`, 'Retirer'))) return;
    courante().splice(+x.dataset.rmel, 1); b.cam.sel = null; App.render();
  });
  root.querySelectorAll('[data-mv]').forEach(x => x.onclick = () => {
    const [i, s] = x.dataset.mv.split('|').map(Number), l = courante();
    [l[i], l[i + s]] = [l[i + s], l[i]]; b.cam.sel = null; App.render();
  });
  root.querySelectorAll('[data-branche]').forEach(x => x.onclick = () => { b.chemin = `${b.chemin ? `${b.chemin}.b.` : ''}${x.dataset.branche}`; b.cam.sel = null; App.render(); });
  root.querySelectorAll('[data-chemin]').forEach(x => x.onclick = () => { b.chemin = x.dataset.chemin; b.cam.sel = null; App.render(); });

  const enregistrer = async statut => {
    const err = $('#rl-err');
    if (statut !== 'Brouillon') {
      const m = Tuyauterie.manques(r);
      if (statut === 'Terminé' && !r.photosApres.length) m.push('au moins une photo après travaux');
      if (m.length) { err.textContent = `À compléter : ${m.join(', ')}.`; return; }
    } else if (!r.affaireId) { err.textContent = 'Choisissez le chantier.'; return; }
    root.querySelectorAll('#rl-save, #rl-valider, #rl-terminer').forEach(x => { x.disabled = true; });
    try {
      const envoyer = async l => { const out = []; for (const p of l) out.push({ ...p, photoId: String(p.photoId).startsWith('data:') ? await envoyerImage(p.photoId) : p.photoId }); return out; };
      const o = { ...JSON.parse(JSON.stringify(r)), statut, photosAvant: await envoyer(r.photosAvant), photosApres: await envoyer(r.photosApres), technicien: userName(r.userId) };
      o.cotes = o.cotes.filter(c => c.libelle || c.valeur !== '' || c.remarque);
      const pl = Tuyauterie.placer(o);
      o.longueurTube = Math.round(Tuyauterie.debit(pl).reduce((s, d) => s + d.coupe, 0));
      const rec = Store.upsert('releves', o);
      Object.assign(releveBrouillon, { cle: null, r: null });
      App.toast(statut === 'Terminé' ? 'Relevé terminé : photos après travaux enregistrées' : statut === 'Relevé' ? 'Relevé de cotes validé' : 'Relevé enregistré', 4000);
      location.hash = statut === 'Brouillon' ? retourReleve(o) : `#/releve/${rec.id}/fiche`;
    } catch (x) { root.querySelectorAll('#rl-save, #rl-valider, #rl-terminer').forEach(y => { y.disabled = false; }); err.textContent = x.message; }
  };
  if ($('#rl-save')) $('#rl-save').onclick = () => enregistrer(r.statut || 'Brouillon');
  if ($('#rl-valider')) $('#rl-valider').onclick = () => enregistrer('Relevé');
  if ($('#rl-terminer')) $('#rl-terminer').onclick = () => enregistrer('Terminé');
};

function releveFicheVue(r) {
  const bureau = Store.me.role !== 'atelier';
  return `<div class="toolbar no-print"><a href="${retourReleve(r)}" class="btn secondary">← ${bureau ? 'Chantier' : 'Rapports'}</a><span class="spacer"></span>
    <a class="btn secondary" href="#/releve/${esc(r.id)}">${r.statut === 'Terminé' ? 'Modifier' : 'Compléter (photos après…)'}</a>
    ${boutonsChiffrageReleve(r)}<button class="secondary print-btn" data-print>Imprimer</button><button class="secondary dl-btn" id="rl-pdf">PDF</button></div>
  <h1 class="no-print">Prise de cotes ${esc(r.numero || '')} · ${esc(r.ligne)} ${badgeReleve(r)}</h1>
  <div class="doc-print">${releveDocument(r)}</div>`;
}

// Document imprimable : identification, isométrique, fiche de débit, nomenclature, cotes, photos avant / après
function releveDocument(r) {
  const a = affaireOf(r.affaireId), site = siteOf(a.clientId, a.siteId), pl = Tuyauterie.placer(r), deb = Tuyauterie.debit(pl), nom = Tuyauterie.nomenclature(r, pl);
  const l = (k, v) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
  const cotes = (r.cotes || []).filter(c => c.libelle || c.valeur !== '');
  return `${Doc.entete('pv', 'RELEVÉ DE COTES TUYAUTERIE', `N° ${esc(r.numero || '—')} du ${dateFr(r.date)}`)}
    <div class="doc-parties"><div>Client : <strong>${esc(nomClientReleve(r))}</strong>${site ? `<br>${esc(site.libelle)}<br>${esc(fullAddress(site))}` : ''}</div>
      <div>${r.affaireId ? `Chantier : <strong>${esc(a.code || '')} – ${esc(a.nom || '')}</strong>` : '<strong>Visite commerciale</strong> (relevé pour chiffrage)'}</div></div>
    <table class="doc-lines compact ppsps-t">${[l('Ligne', `<strong>${esc(r.ligne)}</strong>`), r.fluide ? l('Fluide', esc(r.fluide)) : '', l('Type de tube', esc(Tuyauterie.systeme(r).lib)), l('Matière, pression nominale', esc(`${r.matiere || ''} · ${r.pn || ''}`)),
      l('Relevé par', esc(r.technicien || userName(r.userId))), l('État', esc(r.statut || ''))].join('')}</table>
    ${pl.pieces.length ? `<h3 class="doc-h">Isométrique</h3><div class="rl-iso"><img src="${Vue3D.image(pl)}" alt="Isométrique de la ligne"></div><p class="small">Repère : Nord vers la droite en haut, Est vers la droite en bas. Cotes à l'axe en mm, d'un nœud au suivant (départ, centre des coudes 3D et des tés, extrémité). Point bleu : soudure bout à bout. Triangles hachurés : dévoiements (avance et décalages cotés).</p>` : ''}
    ${annotationsHtml(r, pl)}${souduresHtml(pl)}
    ${deb.length ? `<h3 class="doc-h">Fiche de débit</h3><table class="doc-lines compact"><tr><th>Élément</th><th>Repère</th><th>DN</th><th class="num">Ø ext.</th><th class="num">Cote axe à axe</th><th class="num">Longueur de coupe</th></tr>
      ${deb.map(d => `<tr><td>${esc(numeroEl(d.id))}</td><td>${esc(d.repere)}</td><td>${esc(Tuyauterie.taille(r, d.dn))}</td><td class="num">${fmt(d.de, 1)}</td><td class="num">${d.cote !== null ? fmt(d.cote) : '—'}</td><td class="num"><strong>${fmt(d.coupe)}</strong></td></tr>`).join('')}</table>` : ''}
    ${nom.length ? `<h3 class="doc-h">Nomenclature</h3><table class="doc-lines compact"><tr><th>Désignation</th><th>Norme</th><th class="num">Quantité</th></tr>
      ${nom.map(x => `<tr><td>${esc(x.designation)}</td><td>${esc(x.norme)}</td><td class="num">${fmt(x.quantite, x.unite === 'm' ? 2 : 0)} ${esc(x.unite)}</td></tr>`).join('')}</table>` : ''}
    ${cotes.length ? `<h3 class="doc-h">Cotes relevées</h3><table class="doc-lines compact"><tr><th>Repère</th><th>Désignation</th><th class="num">Cote (mm)</th><th>Remarque</th></tr>
      ${cotes.map(c => `<tr><td>${esc(c.repere)}</td><td>${esc(c.libelle)}</td><td class="num">${c.valeur !== '' ? fmt(num(c.valeur), String(c.valeur).includes('.') ? 1 : 0) : ''}</td><td>${esc(c.remarque || '')}</td></tr>`).join('')}</table>` : ''}
    ${(r.photosAvant || []).length || (r.photosApres || []).length ? `<h3 class="doc-h">Photos avant / après travaux</h3>${comparatifHtml({ photosAvant: r.photosAvant || [], photosApres: r.photosApres || [] }, p => fileUrl(p.photoId))}` : ''}
    ${r.observations ? `<h3 class="doc-h">Observations</h3><p class="pre">${esc(r.observations)}</p>` : ''}
    <p class="small">Dimensions des accessoires selon ISO 4200 / EN 10220 (tubes), ISO 3419 / EN 10253 (raccords à souder), EN 1092-1 / ISO 7005-1 (brides), EN 558 / ISO 5752 (robinetterie) : valeurs nominales, à confirmer avec les fiches techniques des fabricants.</p>
    <div class="doc-pied">${esc(Doc.piedLegal())}</div>`;
}

// Fiche chantier : prises de cotes
function relevesChantierHtml(a) {
  const l = relevesDe(a.id);
  return `<h2>Prises de cotes <span class="muted small">${l.length}</span></h2>
  <div class="toolbar"><a class="btn secondary small" href="#/releve/new?chantier=${esc(a.id)}">+ Prise de cotes</a></div>
  ${l.length ? `<div class="table-wrap"><table><tr><th>N°</th><th>Date</th><th>Ligne</th><th>Matière</th><th class="num">Tube</th><th>Photos</th><th>Relevé par</th><th>État</th></tr>
    ${l.map(r => `<tr class="clickable" data-go="#/releve/${esc(r.id)}${r.statut === 'Brouillon' ? '' : '/fiche'}"><td>${esc(r.numero || '')}</td><td>${dateFr(r.date)}</td><td>${esc(r.ligne)}</td><td>${esc(r.matiere || '')}</td>
      <td class="num">${r.longueurTube ? `${fmt(r.longueurTube / 1000, 2)} m` : ''}</td><td>${[...(r.photosAvant || []).slice(0, 2), ...(r.photosApres || []).slice(0, 2)].map(p => `<img class="thumb" src="${fileUrl(p.photoId)}" alt="">`).join('')}</td>
      <td>${esc(userName(r.userId))}</td><td>${badgeReleve(r)}</td></tr>`).join('')}</table></div>`
  : '<p class="muted">Aucune prise de cotes. Le technicien la fait sur place (Pointage › Rapports › Prise de cotes) ou depuis ici.</p>'}`;
}

// Liste du matériel vers le chiffrage depuis plan (bureau) et en fichier .csv (Excel, logiciel de chiffrage, fournisseur)
const boutonsChiffrageReleve = r => `${Store.can('write', 'chiffrages') && Store.me.role !== 'atelier' ? '<button class="secondary" id="rl-chiffrage">→ Chiffrage</button>' : ''}<button class="secondary dl-btn" id="rl-csv">Liste matériel (.csv)</button>`;
function brancherChiffrageReleve(root, releve) {
  const csv = root.querySelector('#rl-csv'), ch = root.querySelector('#rl-chiffrage');
  if (csv) csv.onclick = () => { const r = releve(); download(`Liste-materiel-${r.numero || r.ligne || 'releve'}.csv`.replace(/[^\w.-]+/g, '_'), `\ufeff${Tuyauterie.csvChiffrage(Tuyauterie.lignesChiffrage(r))}`, 'text/csv'); };
  if (ch) ch.onclick = () => envoyerAuChiffrage(releve());
}
// Ajoute les lignes du relevé à un chiffrage (nouveau ou existant) ; un nouvel envoi du même relevé remplace ses lignes
async function envoyerAuChiffrage(r) {
  const lignes = Tuyauterie.lignesChiffrage(r);
  if (!lignes.length) return notify('Aucun élément de tuyauterie dans ce relevé.');
  if (!r.id) r.id = uid(); // relevé pas encore enregistré : son identifiant relie déjà les lignes envoyées
  const a = affaireOf(r.affaireId), cle = r.id;
  const chs = Store.all('chiffrages').slice().reverse();
  const choix = await dialog(`<form><h3 style="margin-top:0">Envoyer la liste du matériel au chiffrage</h3>
      <p class="small muted">${lignes.length} ligne(s) : tubes en mètres par DN, raccords, robinetterie, brides, joints. Elles sont reliées aux familles CAO de la bibliothèque comme une nomenclature importée.</p>
      <label class="field"><span>Chiffrage</span><select id="dlg-ch"><option value="">Nouveau chiffrage</option>${chs.map(c => `<option value="${esc(c.id)}">${esc(c.nom || 'Chiffrage')} · ${(c.lignes || []).length} ligne(s)</option>`).join('')}</select></label>
      <div class="modal-actions"><button type="button" class="secondary" data-cancel>Annuler</button><button type="submit">Envoyer</button></div></form>`,
  (wrap, done) => {
    wrap.querySelector('[data-cancel]').onclick = () => done(null);
    wrap.querySelector('form').onsubmit = e => { e.preventDefault(); done({ id: wrap.querySelector('#dlg-ch').value }); };
  });
  if (!choix) return;
  let ch = choix.id && Store.get('chiffrages', choix.id);
  if (!ch) { ch = nouveauChiffrage(''); ch.nom = `${a.code ? `${a.code} – ` : nomClientReleve(r) ? `${nomClientReleve(r)} – ` : ''}${r.ligne || 'Prise de cotes'}`; }
  // Client du devis qui sera créé : celui du chantier ou de la visite
  if (!ch.clientId && clientReleve(r)) ch.clientId = clientReleve(r);
  const deja = (ch.lignes || []).some(l => l.releveId === cle);
  ch.lignes = [...(ch.lignes || []).filter(l => l.releveId !== cle), ...lignes.map(l => ({ ...l, releveId: cle }))];
  ch.fichier = ch.fichier || `Prise de cotes ${r.numero || r.ligne || ''}`.trim();
  Store.upsert('chiffrages', ch);
  App.toast(`${lignes.length} ligne(s) ${deja ? 'mises à jour' : 'ajoutées'} dans le chiffrage « ${ch.nom} »`, 4000);
  location.hash = `#/chiffrage/${ch.id}`;
}

// Annotations portées sur l'isométrique (départ et éléments)
function annotationsHtml(r, pl) {
  const l = [...(pl.depart && pl.depart.note ? [['Départ', pl.depart.note]] : []), ...pl.pieces.filter(pc => String(pc.el.note || '').trim()).map(pc => [`${numeroEl(pc.id)} · ${(LIB_EL[pc.t] || pc.t).replace(/^\S+ /, '')}${pc.el.repere ? ` ${pc.el.repere}` : ''}`, pc.el.note.trim()])];
  return l.length ? `<h3 class="doc-h">Annotations</h3><table class="doc-lines compact"><tr><th>Élément</th><th>Annotation</th></tr>${l.map(([e, n]) => `<tr><td>${esc(e)}</td><td>${esc(n)}</td></tr>`).join('')}</table>` : '';
}

// Visites commerciales : prises de cotes sans chantier (Devis › Visites), pour chiffrer le devis
function relevesVisiteHtml(liste, nouveau) {
  return `<div class="toolbar"><a class="btn${liste.length ? ' secondary' : ''}" href="${nouveau}">+ Prise de cotes de visite</a></div>
  ${liste.length ? `<div class="table-wrap"><table><tr><th>N°</th><th>Date</th><th>Client ou prospect</th><th>Ligne</th><th>Type de tube</th><th class="num">Tube</th><th>Chiffrage / devis</th><th>Relevé par</th></tr>
    ${liste.map(r => { const ch = Store.all('chiffrages').find(c => (c.lignes || []).some(l => l.releveId === r.id)), d = ch && Store.get('devis', ch.devisId);
      return `<tr class="clickable" data-go="#/releve/${esc(r.id)}"><td>${esc(r.numero || '')}</td><td>${dateFr(r.date)}</td><td>${esc(nomClientReleve(r) || '—')}</td><td>${esc(r.ligne)}</td><td class="small">${esc(Tuyauterie.systeme(r).lib)}</td>
      <td class="num">${r.longueurTube ? `${fmt(r.longueurTube / 1000, 2)} m` : ''}</td><td>${d ? `<a href="#/devis/${esc(d.id)}">Devis ${esc(d.numero || '…')}</a>` : ch ? `<a href="#/chiffrage/${esc(ch.id)}">Chiffrage</a>` : '<span class="muted small">à chiffrer</span>'}</td><td>${esc(userName(r.userId))}</td></tr>`; }).join('')}</table></div>`
  : '<p class="muted">Aucune prise de cotes de visite. Lors d\'une visite chez un client ou un prospect, dessinez la ligne sur la tablette : le prix se calcule tout de suite, et « → Chiffrage » crée le devis.</p>'}`;
}
const relevesVisite = () => Store.all('releves').filter(r => !r.affaireId).sort((a, b) => `${b.date}${b.numero || ''}`.localeCompare(`${a.date}${a.numero || ''}`));
Views.visites = () => `<h1>Devis</h1>${devisTabs('visites')}${relevesVisiteHtml(relevesVisite(), '#/releve/new?visite=1')}`;
// Fiche du client : ses prises de cotes de visite
function relevesClientHtml(e) {
  const l = relevesVisite().filter(r => r.clientId === e.id);
  return `<h2>Prises de cotes de visite <span class="muted small">${l.length}</span></h2>${relevesVisiteHtml(l, `#/releve/new?client=${esc(e.id)}`)}`;
}
