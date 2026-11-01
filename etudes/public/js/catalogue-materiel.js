// Catalogue matériel des fabricants (bouches, CTA, caissons, ventilateurs, générateurs, PAC, pompes, vannes, vases…),
// importé en CSV ou Excel dans les Réglages. Il propose, pour chaque ligne du « Matériel retenu » d'une étude, les modèles
// de la même famille qui couvrent le débit (ou la taille) dimensionné ; le choix remplit fabricant, référence exacte,
// fiche technique et puissance électrique (reprise par l'alimentation électrique).
const CatalogueMateriel = (() => {
  const FAMILLES = {
    bouche: 'Bouche, diffuseur, grille', cta: 'Centrale de traitement d\'air', caisson: 'Caisson, extracteur, ventilateur', generateur: 'Chaudière, générateur',
    pac: 'PAC, groupe froid', pompe: 'Pompe, circulateur', vanne: 'Vanne (régulation, équilibrage, isolement)', vase: 'Vase d\'expansion', echangeur: 'Échangeur',
    ballon: 'Ballon (tampon, ECS)', accessoire: 'Accessoire (pot à boue, soupape, bouteille, compteur)', regulation: 'Régulation, sonde, automate', autre: 'Autre',
  };
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const nombre = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  // Famille d'une ligne du matériel retenu d'après la clé du métré (« bouche|… », « aero|cta-df|3000 », « pompe|… »)
  function familleDe(cle) {
    const [k, a] = String(cle || '').split('|');
    if (k === 'aero') return /^cta/.test(a || '') ? 'cta' : 'caisson';
    return { bouche: 'bouche', cta: 'cta', pompe: 'pompe', vanne: 'vanne', equil: 'vanne', isol: 'vanne', vase: 'vase', echangeur: 'echangeur', tampon: 'ballon',
      desemboueur: 'accessoire', soupape: 'accessoire', bouteille: 'accessoire', ce: 'accessoire', gen: /^(pac|gf)/.test(a || '') ? 'pac' : 'generateur' }[k] || 'autre';
  }
  // Grandeurs de la ligne utiles au choix : débit (m³/h), DN, volume (L), puissance (kW), taille de bouche
  function besoin(ligne) {
    const [k, a, b, c] = String(ligne.cle || '').split('|'), q = Math.max(1, Number(ligne.qte) || 1);
    if (k === 'aero') return { Q: nombre(b) };
    if (k === 'cta') return { Q: nombre(a) };
    if (k === 'bouche') return { taille: b, Q: nombre(ligne.Qunitaire) };
    if (k === 'vanne') return { dn: nombre(b), kvs: nombre(c) };
    if (['equil', 'isol', 'ce', 'desemboueur'].includes(k)) return { dn: nombre(a) };
    if (k === 'vase' || k === 'tampon') return { volume: nombre(a) };
    if (k === 'gen') return { P: nombre(b) };
    if (k === 'echangeur') return { P: nombre(a) };
    return { q };
  }
  // Modèles proposés : même famille, débit (ou puissance, volume, DN) couvert, taille de bouche reconnue ; les mieux placés d'abord
  function candidats(ligne, catalogue, max = 8) {
    const fam = familleDe(ligne.cle), bes = besoin(ligne), txt = norm(ligne.designation);
    return (catalogue || []).filter(p => p.famille === fam).map(p => {
      let s = 1;
      const dans = (v, mini, maxi) => (Number.isFinite(v) && (Number.isFinite(mini) || Number.isFinite(maxi)) ? (!(v < mini) && !(v > maxi) ? 3 : -5) : 0);
      if (Number.isFinite(bes.Q)) s += dans(bes.Q, p.Qmin, p.Qmax);
      if (Number.isFinite(bes.P)) s += Number.isFinite(p.P) ? (p.P >= bes.P && p.P <= bes.P * 1.3 ? 3 : p.P < bes.P ? -5 : 0) : 0;
      if (Number.isFinite(bes.volume)) s += Number.isFinite(p.volume) ? (p.volume >= bes.volume && p.volume <= bes.volume * 1.5 ? 3 : p.volume < bes.volume ? -5 : 0) : 0;
      if (Number.isFinite(bes.dn) && Number.isFinite(p.dn)) s += p.dn === bes.dn ? 3 : -3;
      if (Number.isFinite(bes.kvs) && Number.isFinite(p.kvs)) s += Math.abs(p.kvs - bes.kvs) / bes.kvs < 0.05 ? 2 : -2;
      if (bes.taille && p.taille && norm(bes.taille).includes(norm(p.taille).replace(/^col /, ''))) s += 3;
      // Type de bouche reconnu dans la désignation (diffuseur plafond, hélicoïdal, grille…)
      if (fam === 'bouche') norm(p.designation).split(/\s+/).filter(m => m.length > 5).forEach(m => { if (txt.includes(m)) s += 0.5; });
      return { ...p, score: s };
    }).filter(p => p.score > 0).sort((a, b) => b.score - a.score || (a.Pelec || 0) - (b.Pelec || 0)).slice(0, max);
  }

  /* ---------- Import (CSV ou Excel) ---------- */
  // Colonnes reconnues par leur en-tête (ordre libre) ; sans en-tête : ordre du modèle CSV
  const COLONNES = [['fabricant', /fabricant|marque/], ['reference', /^ref|reference|code/], ['famille', /famille|categorie|type/], ['designation', /designation|libelle|description|modele/],
    ['taille', /taille|dimension|col/], ['Qmin', /q ?min|debit mini/], ['Qmax', /q ?max|debit maxi|debit/], ['P', /puissance (thermique|frigo|calo)|p ?th|^p ?kw$|puissance utile/],
    ['Pelec', /elec|absorbee|p1/], ['dn', /^dn/], ['kvs', /kvs/], ['volume', /volume|capacite/], ['dp', /perte|dp|pa$/], ['Lw', /lw|acoustique|db/], ['fiche', /fiche|url|lien|pdf/]];
  const ORDRE = ['fabricant', 'reference', 'famille', 'designation', 'taille', 'Qmin', 'Qmax', 'Pelec', 'dp', 'fiche'];
  const familleTexte = t => {
    const x = norm(t);
    if (FAMILLES[x]) return x;
    const regles = [['bouche', /bouche|diffuseur|grille|helico/], ['cta', /cta|traitement d.air|centrale/], ['caisson', /caisson|extract|ventil|tourelle|vmc/], ['pac', /pac|pompe a chaleur|groupe froid|groupe de production/],
      ['generateur', /chaudiere|generateur|bruleur/], ['pompe', /pompe|circulateur|accelerateur/], ['vanne', /vanne|robinet/], ['vase', /vase/], ['echangeur', /echangeur/], ['ballon', /ballon|tampon|ecs/],
      ['regulation', /regul|sonde|automate|capteur/], ['accessoire', /pot a boue|desemboueur|soupape|bouteille|compteur/]];
    return (regles.find(([, re]) => re.test(x)) || ['autre'])[0];
  };
  function lireLignes(rows) {
    const lignes = (rows || []).map(r => r.map(c => String(c ?? '').trim())).filter(r => r.some(Boolean));
    if (!lignes.length) return { liste: [], rejets: [] };
    const tete = lignes[0].map(norm), aEntete = tete.some(h => /fabricant|marque|reference|famille/.test(h));
    // Une colonne d'en-tête ne sert qu'une fois : chaque champ prend la première colonne libre qui lui correspond
    const idx = {}, prises = new Set();
    if (aEntete) COLONNES.forEach(([k, re]) => { const i = tete.findIndex((h, j) => !prises.has(j) && re.test(h)); if (i >= 0) { idx[k] = i; prises.add(i); } });
    else ORDRE.forEach((k, i) => { idx[k] = i; });
    const out = [], rejets = [];
    lignes.slice(aEntete ? 1 : 0).forEach((r, i) => {
      const v = k => (idx[k] === undefined ? '' : r[idx[k]] || '');
      const p = { fabricant: v('fabricant').slice(0, 80), reference: v('reference').slice(0, 120), famille: familleTexte(v('famille') || v('designation')), designation: v('designation').slice(0, 200), taille: v('taille').slice(0, 60),
        Qmin: nombre(v('Qmin')), Qmax: nombre(v('Qmax')), P: nombre(v('P')), Pelec: nombre(v('Pelec')), dn: nombre(v('dn')), kvs: nombre(v('kvs')), volume: nombre(v('volume')), dp: nombre(v('dp')), Lw: nombre(v('Lw')),
        fiche: /^https?:\/\//.test(v('fiche')) ? v('fiche').slice(0, 500) : '' };
      Object.keys(p).forEach(k => { if (typeof p[k] === 'number' && !Number.isFinite(p[k])) delete p[k]; });
      (p.reference && p.fabricant ? out : rejets).push(p.reference && p.fabricant ? p : i + (aEntete ? 2 : 1));
    });
    return { liste: out.slice(0, 5000), rejets };
  }
  const lireCsv = texte => { const l = String(texte || '').split(/\r?\n/), sep = (l[0] || '').includes(';') ? ';' : ','; return lireLignes(l.map(x => x.split(sep).map(c => c.replace(/^"|"$/g, '')))); };
  const modeleCsv = () => 'fabricant;reference;famille;designation;taille;Qmin_m3h;Qmax_m3h;P_elec_kW;perte_de_charge_Pa;fiche_url\n'
    + 'MonFabricant;DFC-160;bouche;Diffuseur plafond carré 4 directions;160;80;250;;25;https://exemple.fr/dfc.pdf\n'
    + 'MonFabricant;CTA-DF-3000;cta;Centrale double flux roue;;2000;3500;2,2;;\n'
    + 'MonFabricant;CB-1000;caisson;Caisson d\'extraction basse consommation;;400;1200;0,25;;\n';
  const libelle = p => `${p.fabricant} ${p.reference}${p.designation ? ` — ${p.designation}` : ''}${Number.isFinite(p.Qmin) || Number.isFinite(p.Qmax) ? ` (${Number.isFinite(p.Qmin) ? p.Qmin : '…'}-${Number.isFinite(p.Qmax) ? p.Qmax : '…'} m³/h)` : ''}${Number.isFinite(p.Pelec) ? ` · ${String(p.Pelec).replace('.', ',')} kW élec.` : ''}`;
  /* ---------- Contrôle du matériel retenu face au CCTP ---------- */
  // Équipement du dossier de consultation (inventaire CCTP / DPGF de l'étude) qui correspond à la ligne du matériel retenu :
  // même famille, désignation la plus ressemblante ; puis la marque prescrite, le débit, la puissance, le volume et le
  // niveau sonore demandés sont comparés au modèle choisi (fiche du catalogue)
  const GENRES_FAMILLE = { cta: ['cta'], caisson: ['ventilateur', 'desenfumage'], pac: ['pac-air', 'pac-eau', 'pac-rev', 'gf-air', 'gf-eau'], generateur: ['chaudiere-cond', 'chaudiere-gaz', 'chaudiere-fioul', 'chaudiere-bois', 'echangeur'],
    pompe: ['pompe'], bouche: ['bouche-soufflage', 'bouche-extraction'], ballon: ['ecs', 'tampon'], echangeur: ['echangeur', 'echangeur-aux'], vase: ['vase'], vanne: ['vanne2v', 'vanne3v'] };
  const mots = t => new Set(norm(t).split(/[^a-z0-9]+/).filter(m => m.length >= 3));
  const ressemble = (a, b) => { const x = mots(a), y = mots(b); if (!x.size || !y.size) return 0; let n = 0; x.forEach(m => { if (y.has(m)) n++; }); return n / Math.min(x.size, y.size); };
  const num = v => (v === '' || v == null ? NaN : nombre(v));
  function equipementCctp(ligne, inventaire) {
    const g = GENRES_FAMILLE[familleDe(ligne.cle)] || [], cand = (inventaire || []).filter(x => g.includes(x.genre) && x.inclus !== false && !x.variante);
    if (!cand.length) return null;
    if (cand.length === 1) return cand[0];
    const best = cand.map(x => [x, ressemble(`${x.designation} ${x.local || ''} ${x.chapitre || ''}`, ligne.designation)]).sort((a, b) => b[1] - a[1])[0];
    return best[1] >= 0.34 ? best[0] : null;
  }
  // fiche : fiche technique de la bibliothèque (caractéristiques lues dans le PDF) quand le modèle n'est pas au catalogue
  function controleCctp(ligne, inventaire, catalogue = [], fiche = null) {
    const x = equipementCctp(ligne, inventaire);
    if (!x || !ligne.reference) return { equipement: x, alertes: [] };
    const fc = fiche && fiche.carac, depuisFiche = fc ? { fabricant: ligne.fabricant, reference: `${ligne.reference} (fiche technique)`, ...(fc.Q ? { Qmax: fc.Q } : {}), ...(fc.Pch || fc.Pfr || fc.P ? { P: fc.Pch || fc.Pfr || fc.P } : {}), ...(fc.Lw ? { Lw: fc.Lw } : {}), ...(fc.volume ? { volume: fc.volume } : {}), ...(fc.Pel ? { Pelec: fc.Pel } : {}), ...(fc.Pdispo ? { dp: fc.Pdispo } : {}) } : null;
    const p = (catalogue || []).find(c => norm(c.fabricant) === norm(ligne.fabricant) && norm(c.reference) === norm(ligne.reference)) || depuisFiche;
    const a = [], c = x.carac || {};
    // Marque prescrite : « ou équivalent » → fournir l'équivalence ; sans → non conforme
    const marques = [...String(x.prescrit || '').matchAll(/marque\s+([A-Za-z][\w&'-]+(?:\s[A-Z][\w&'-]+)?)/g)].map(m => m[1]);
    const cmp = t => norm(t).replace(/[^a-z0-9]/g, '');
    if (marques.length && ligne.fabricant && !marques.some(m => cmp(ligne.fabricant).includes(cmp(m)) || cmp(m).includes(cmp(ligne.fabricant)))) {
      a.push(/ou (?:techniquement )?[ée]quivalent/i.test(x.prescrit) ? { niveau: 'info', texte: `CCTP : ${marques.join(' / ')} ou équivalent — joindre la note d'équivalence de ${ligne.fabricant}.` } : { niveau: 'erreur', texte: `CCTP : marque ${marques.join(' / ')} imposée, ${ligne.fabricant} proposé.` });
    }
    if (p) {
      const Q = num(x.Q), P = num(x.P), Pfr = num(x.Pfr);
      if (Q > 0 && Number.isFinite(p.Qmax) && p.Qmax < Q) a.push({ niveau: 'erreur', texte: `Débit : ${Q} m³/h demandés au CCTP, ${p.Qmax} m³/h maxi pour ${p.reference}.` });
      const Pd = familleDe(ligne.cle) === 'pac' && Pfr > 0 && !(P > 0) ? Pfr : P;
      if (Pd > 0 && Number.isFinite(p.P) && p.P < Pd * 0.98) a.push({ niveau: 'erreur', texte: `Puissance : ${Pd} kW demandés au CCTP, ${p.P} kW pour ${p.reference}.` });
      if (Number.isFinite(c.volume) && Number.isFinite(p.volume) && p.volume < c.volume) a.push({ niveau: 'erreur', texte: `Volume : ${c.volume} L au CCTP, ${p.volume} L pour ${p.reference}.` });
      if (Number.isFinite(c.Lw) && Number.isFinite(p.Lw) && p.Lw > c.Lw) a.push({ niveau: 'alerte', texte: `Niveau sonore : Lw ${p.Lw} dB(A) pour ${p.reference}, ${c.Lw} dB(A) maxi au CCTP.` });
      const Pel = num(x.Pel);
      if (Pel > 0 && Number.isFinite(p.Pelec) && p.Pelec > Pel * 1.1 && familleDe(ligne.cle) !== 'cta') a.push({ niveau: 'info', texte: `Puissance électrique : ${p.Pelec} kW pour ${p.reference}, ${Pel} kW au CCTP (bilan électrique à revoir).` });
      if (Number.isFinite(c.Pdispo) && Number.isFinite(p.dp) && ['cta', 'caisson'].includes(familleDe(ligne.cle)) && p.dp < c.Pdispo) a.push({ niveau: 'alerte', texte: `Pression disponible : ${c.Pdispo} Pa au CCTP, ${p.dp} Pa annoncés pour ${p.reference}.` });
    }
    return { equipement: x, produit: p, alertes: a };
  }
  return { FAMILLES, familleDe, besoin, candidats, lireLignes, lireCsv, modeleCsv, libelle, equipementCctp, controleCctp };
})();
if (typeof module !== 'undefined') module.exports = CatalogueMateriel;
