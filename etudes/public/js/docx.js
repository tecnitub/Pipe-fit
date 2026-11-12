// Document Word (.docx) simple : titres, paragraphes, listes numérotées, cases à cocher et tableaux à bordures,
// page A4 paysage. Sert au cahier de paramétrage de l'automate (document modifiable par l'automaticien).
// Module pur ; l'archive est faite par XLSX.zip (même format ZIP « stocké » que les classeurs).
const Docx = (() => {
  const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const run = (t, o = {}) => `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.c ? `<w:color w:val="${o.c}"/>` : ''}<w:sz w:val="${o.sz || 20}"/></w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
  const para = (t, o = {}) => `<w:p><w:pPr><w:spacing w:before="${o.avant ?? 0}" w:after="${o.apres ?? 80}"/>${o.retrait ? `<w:ind w:left="${o.retrait}" w:hanging="${o.retrait}"/>` : o.gauche ? `<w:ind w:left="${o.gauche}"/>` : ''}${o.garder ? '<w:keepNext/>' : ''}</w:pPr>${run(t, o)}</w:p>`;
  const cell = (t, o = {}) => `<w:tc><w:tcPr><w:tcW w:w="${o.w || 0}" w:type="${o.w ? 'dxa' : 'auto'}"/>${o.fond ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fond}"/>` : ''}</w:tcPr>${String(t ?? '').split('\n').map(l => para(l, { b: o.b, sz: 17, apres: 0 })).join('')}</w:tc>`;
  function table(entetes, lignes) {
    const n = entetes.length, larg = 15400, w = Math.floor(larg / n);
    const bord = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="8A96A3"/>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="${larg}" w:type="dxa"/><w:tblBorders>${bord}</w:tblBorders><w:tblLayout w:type="autofit"/><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr>
<w:tblGrid>${entetes.map(() => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>
<w:tr><w:trPr><w:tblHeader/></w:trPr>${entetes.map(h => cell(h, { b: true, fond: 'DCE6F1' })).join('')}</w:tr>
${lignes.map(l => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${Array.from({ length: n }, (_, i) => cell(l[i])).join('')}</w:tr>`).join('')}</w:tbl>${para('', { apres: 120 })}`;
  }
  // blocs : { h1 | h2 | h3 | p | note | num: [texte…] | cases: [texte…] | table: { entetes, lignes } | arbre: [{ niveau, texte, b }] }
  function corps(blocs) {
    return blocs.map(b => {
      if (b.h1) return para(b.h1, { b: true, sz: 36, c: '1F3864', apres: 120 });
      if (b.h2) return para(b.h2, { b: true, sz: 28, c: '1F3864', avant: 240, apres: 100, garder: true });
      if (b.h3) return para(b.h3, { b: true, sz: 22, avant: 160, apres: 60, garder: true });
      if (b.p) return para(b.p, { sz: 20, b: !!b.b, garder: !!b.b });
      if (b.note) return para(b.note, { sz: 18, i: true, c: '595959' });
      if (b.num) return b.num.map((t, i) => para(`${i + 1}. ${t}`, { sz: 20, retrait: 360, apres: 40 })).join('');
      if (b.cases) return b.cases.map(t => para(`☐  ${t}`, { sz: 20, retrait: 360, apres: 40 })).join('');
      if (b.table) return table(b.table.entetes, b.table.lignes || []);
      if (b.arbre) return b.arbre.map(l => para(`${l.niveau ? '└ ' : ''}${l.texte}`, { sz: 19, b: !!l.b, gauche: 360 * (l.niveau || 0), apres: 30 })).join('') + para('', { apres: 80 });
      return '';
    }).join('');
  }
  function build(blocs) {
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corps(blocs)}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    return XLSX.zip([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/document.xml', data: doc }]);
  }
  // Cahier de paramétrage de l'automate → blocs du document (une partie par armoire, une rubrique numérotée par section)
  function cahierBlocs(cahier, { titre = 'Cahier de paramétrage de l\'automate', affaire = '', indice = '', date = '', entetesDefaut = [] } = {}) {
    const blocs = [{ h1: titre }, { note: [affaire, indice ? `indice ${indice}` : '', date].filter(Boolean).join(' · ') },
      { p: 'Tout ce qu\'il faut saisir dans l\'outil de paramétrage de l\'automate, armoire par armoire : points et noms, boucles, moteurs, plannings, consignes, sécurités, alarmes et logique de fonctionnement. Les valeurs sont celles de l\'étude ; les réglages des boucles sont des valeurs de départ à ajuster à la mise en service.' }];
    cahier.forEach(c => {
      blocs.push({ h2: `Armoire ${c.armoire}` });
      c.sections.forEach((s, i) => {
        blocs.push({ h3: `${i + 1}. ${s.titre}` });
        if (s.intro) blocs.push({ p: s.intro });
        if (s.cases) blocs.push({ cases: s.lignes.map(l => l[l.length - 1]) });
        else if (/^Logique/.test(s.titre)) {
          const g = new Map(); s.lignes.forEach(l => { if (!g.has(l[0])) g.set(l[0], []); g.get(l[0]).push(l[2]); });
          g.forEach((l, f) => { blocs.push({ p: f, b: true }, { num: l }); });
        } else blocs.push({ table: { entetes: s.entetes || entetesDefaut, lignes: s.lignes } });
      });
    });
    return blocs;
  }
  // Analyse fonctionnelle de la régulation (maîtrise d'œuvre, visa, DOE) : consignes, plannings, fonctionnement par
  // installation (analyse de l'étude puis logique pas à pas), sécurités et alarmes avec la conduite à tenir
  function analyseFonctionnelle({ cahier = [], projet = null, afs = [], queFaire = () => '', titre = 'Analyse fonctionnelle de la régulation', affaire = '', indice = '', date = '' } = {}) {
    const blocs = [{ h1: titre }, { note: [affaire, indice ? `indice ${indice}` : '', date].filter(Boolean).join(' · ') },
      { p: 'Fonctionnement attendu des installations de chauffage, ventilation et climatisation et de leur régulation : consignes, horaires, séquences de marche, sécurités et alarmes. Les valeurs sont celles de l\'étude, à confirmer à la mise en service.' }];
    let k = 1;
    if (projet) {
      blocs.push({ h2: `${k++}. Consignes et horaires` }, { table: { entetes: ['Objet', 'Nom', 'Consignes', 'Occupation / régime', 'Origine'], lignes: projet.saisie } });
      blocs.push({ h3: 'Plannings' }, { table: { entetes: ['Planning', 'Agit sur', 'Occupation', 'Relance (h)', 'Hors occupation'], lignes: projet.plannings.map(p => [p.nom, p.agit, p.occupation, p.relance ? String(p.relance).replace('.', ',') : '—', p.hors]) } });
      blocs.push({ p: `Jours fériés ${projet.feries[0][0].slice(0, 4)} : ${projet.feries.map(([d, l]) => `${d.slice(8, 10)}/${d.slice(5, 7)} ${l}`).join(', ')}.` });
    }
    blocs.push({ h2: `${k++}. Fonctionnement des installations` });
    afs.filter(a => (a.liste || []).length).forEach(a => blocs.push({ h3: a.titre }, { num: a.liste }));
    cahier.forEach(c => {
      const lg = (c.sections.find(s => /^Logique/.test(s.titre)) || { lignes: [] }).lignes, g = new Map();
      lg.forEach(l => { if (!g.has(l[0])) g.set(l[0], []); g.get(l[0]).push(l[2]); });
      if (g.size) blocs.push({ h3: `Séquences pas à pas — armoire ${c.armoire}` });
      g.forEach((l, f) => blocs.push({ p: f, b: true }, { num: l }));
    });
    const al = cahier.flatMap(c => (c.sections.find(s => s.titre === 'Alarmes') || { lignes: [] }).lignes);
    if (al.length) blocs.push({ h2: `${k++}. Alarmes et conduite à tenir` }, { table: { entetes: ['Alarme', 'Condition', 'Priorité', 'Action automatique', 'Que faire'], lignes: al.map(l => [`${l[0]} — ${l[1]}`, `${l[2]} (${l[3]})`, l[4], l[5], queFaire(l[1], l[5])]) } });
    const secu = cahier.flatMap(c => (c.sections.find(s => /^Sécurités/.test(s.titre)) || { lignes: [] }).lignes);
    if (secu.length) blocs.push({ h2: `${k++}. Sécurités et asservissements` }, { table: { entetes: ['Repère', 'Fonction', 'Entrée(s)', 'Agit sur', 'Fonctionnement', 'Remarque'], lignes: secu } });
    return blocs;
  }
  // Analyse fonctionnelle de l'installation complète, organisée par niveau : production racine → circuits → schémas aval
  // (sous-stations, PAC de zone…) → réseaux → CTA / terminaux. arbre : Installation.arbre(et) ; installations :
  // Regulation.contexte(et, Liens).installations ({ noteId, titre, af, params }) ; notes : notes de l'étude (liaisons de
  // récupération d'énergie). Rend les blocs du document (Docx.build).
  function analyseInstallation({ arbre = {}, installations = [], notes = [], titre = 'Analyse fonctionnelle de l\'installation', affaire = '', indice = '', date = '' } = {}) {
    const nf = (v, d = 0) => (Number.isFinite(v) ? (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',') : '');
    const kW = v => (Number.isFinite(v) && v ? `${nf(v, 1)} kW` : '');
    const parCle = new Map((arbre.consommateurs || []).map(c => [c.cle, c])), parNote = new Map(installations.map(x => [x.noteId, x])), vues = [];
    const instDe = id => parNote.get(id) || null;
    const nomNiv = s => `Niveau ${s.niveau + 1} — ${s.titre}`;
    const autresDe = (s, c) => c.consommateurs.filter(k => k !== `${s.note}|${c.i}` && !(c.schema && k === `${c.schema.note}:schema`) && !(c.reseau && k === `${c.reseau.note}:reseau`)).map(k => parCle.get(k)).filter(Boolean);
    const consoReseau = r => r.branches.map(b => b.consommateur && parCle.get(b.consommateur)).filter(Boolean);

    // 1. Description (arbre en texte) et liaisons entre niveaux
    const lignes = [], liaisons = [];
    const descrConso = (c, niv, prefixe = '') => lignes.push({ niveau: niv, texte: `${prefixe}${c.libelle}${[kW(c.P), c.regime].filter(Boolean).length ? ` — ${[kW(c.P), c.regime].filter(Boolean).join(', ')}` : ''}` });
    const descrReseau = (r, niv) => {
      lignes.push({ niveau: niv, texte: `Réseau arborescent ${r.libelle} (${r.saison === 'froid' ? 'eau glacée' : 'eau chaude'}${kW(r.P) ? `, ${kW(r.P)}` : ''}, ${r.branches.length} branche(s))` });
      r.branches.forEach(b => { const c = b.consommateur && parCle.get(b.consommateur); if (c) descrConso(c, niv + 1, `Branche ${b.rep} : `); });
    };
    const descr = (s, niv) => {
      lignes.push({ niveau: niv, b: true, texte: `${nomNiv(s)} : ${s.nGen > 1 ? `${s.nGen} × ` : ''}${String(s.generateur).toLowerCase()}${s.Pgen ? ` de ${nf(s.Pgen)} kW` : ''}, ${s.regime || 'régime —'} ; production ${nf(s.Pprod) || '—'} kW, appelée ${nf(s.Pdem) || '—'} kW` });
      s.circuits.forEach(c => {
        lignes.push({ niveau: niv + 1, texte: `Circuit ${c.rep} : ${String(c.emetteur).toLowerCase()}, ${String(c.montage).toLowerCase()}${c.regime ? `, ${c.regime}` : ''}${kW(c.P) ? `, ${kW(c.P)}` : ''}` });
        if (c.schema) {
          const boucle = /boucle/i.test((c.schema.primaire || {}).libelle || ''), ech = /changeur/i.test(c.schema.generateur || '');
          liaisons.push([nomNiv(s), `Circuit ${c.rep}`, nomNiv(c.schema), `Demande de marche du schéma aval vers la régulation amont : pompe du circuit ${c.rep} en marche (post-circulation 3 min) ; ${boucle ? 'PAC autorisée seulement si l\'eau de la boucle est entre 15 et 30 °C, arrêt et alarme sinon' : ech ? 'vanne primaire de l\'échangeur ouverte avec la pompe amont en marche' : 'production autorisée avec la pompe amont en marche'} ; défaut de la source reporté.`]);
          descr(c.schema, niv + 2);
        }
        if (c.reseau) {
          liaisons.push([nomNiv(s), `Circuit ${c.rep}`, `Réseau ${c.reseau.titre}`, 'Le circuit alimente le réseau arborescent : la pompe du circuit voit le réseau jusqu\'à la branche la plus défavorisée.']);
          descrReseau(c.reseau, niv + 2);
        }
        autresDe(s, c).forEach(x => {
          descrConso(x, niv + 2);
          liaisons.push([nomNiv(s), `Circuit ${c.rep}`, x.libelle, x.type === 'ecs' ? 'Primaire de la production d\'ECS : pompe du circuit en marche sur demande du ballon (priorité ECS).' : x.type === 'cta' ? 'Batterie de la CTA : pompe du circuit en marche avec la CTA et en antigel.' : 'Consommateur raccordé au circuit.']);
        });
      });
    };
    (arbre.schemas || []).forEach(s => descr(s, 0));
    (arbre.reseaux || []).forEach(r => descrReseau(r, 0));
    // Récupération d'énergie : schéma froid → schéma chaud
    notes.filter(n => n.type === 'pid' && (n.entrees || {}).recupDe).forEach(n => {
      const f = notes.find(x => x.id === n.entrees.recupDe);
      if (f) liaisons.push([f.titre || 'Schéma froid', 'Récupération sur le groupe froid', n.titre || 'Schéma chaud', 'Chaleur rejetée par le groupe froid envoyée en priorité au schéma chaud ; sans besoin de chaleur, rejet par le condenseur (vanne de basculement) ; le générateur du schéma chaud n\'est enclenché qu\'en appoint ou en secours.']);
    });

    // 2. Fonctionnement par niveau, dans l'ordre de l'arbre
    const fct = [];
    const bloc = (inst, h3, intro) => {
      if (!inst) { fct.push({ h3 }, ...(intro ? [{ p: intro }] : []), { note: 'Pas d\'analyse fonctionnelle calculée pour cet élément.' }); return; }
      if (vues.includes(inst)) { fct.push({ h3 }, ...(intro ? [{ p: intro }] : []), { note: `Fonctionnement décrit plus haut (${inst.titre}).` }); return; }
      vues.push(inst);
      fct.push({ h3 }, ...(intro ? [{ p: intro }] : []), ...((inst.af || []).length ? [{ num: inst.af }] : [{ note: 'Aucune séquence particulière.' }]));
    };
    const consos = (l, ou) => l.forEach(x => { const i = instDe(x.source.id); if (i) bloc(i, `${x.type === 'cta' ? 'CTA' : x.type === 'ecs' ? 'ECS' : x.type === 'terminal' ? 'Terminaux' : 'Consommateur'} — ${i.titre}`, `Raccordé ${ou}.`); });
    const fonctionnement = s => {
      bloc(instDe(s.note), nomNiv(s), s.amont ? `Schéma aval alimenté par le circuit ${s.amont.rep} de ${s.amont.libelle}.` : 'Production racine.');
      if (s.circuits.length) fct.push({ p: 'Circuits :', b: true }, { num: s.circuits.map(c => `${c.rep} — ${String(c.emetteur).toLowerCase()}, ${String(c.montage).toLowerCase()}${c.regime ? `, ${c.regime}` : ''}${kW(c.P) ? `, ${kW(c.P)}` : ''}${c.schema ? ` ; alimente ${nomNiv(c.schema)}` : c.reseau ? ` ; alimente le réseau ${c.reseau.titre}` : ''}`) });
      s.circuits.forEach(c => {
        if (c.schema) fonctionnement(c.schema);
        if (c.reseau) {
          fct.push({ h3: `Réseau arborescent — ${c.reseau.titre}` }, { p: `Alimenté par le circuit ${c.rep} (${s.titre}) ; ${c.reseau.branches.length} branche(s)${kW(c.reseau.P) ? `, ${kW(c.reseau.P)}` : ''}. Vannes d'équilibrage au préréglage de l'étude ; la pompe du circuit voit la branche la plus défavorisée.` });
          consos(consoReseau(c.reseau), `au réseau ${c.reseau.titre}`);
        }
        consos(autresDe(s, c), `au circuit ${c.rep} (${s.titre})`);
      });
    };
    (arbre.schemas || []).forEach(fonctionnement);
    (arbre.reseaux || []).forEach(r => { fct.push({ h3: `Réseau arborescent — ${r.titre}` }, { p: 'Réseau non relié à un schéma de principe.' }); consos(consoReseau(r), `au réseau ${r.titre}`); });
    const autres = installations.filter(x => !vues.includes(x) && (x.af || []).length);
    autres.forEach(x => vues.push(x));

    // Sections et sommaire
    const sections = [
      { titre: 'Description de l\'installation', blocs: lignes.length ? [{ p: 'Arbre de l\'installation hydraulique, de la production racine aux consommateurs :' }, { arbre: lignes }] : [{ note: 'Aucun schéma de principe dans l\'étude.' }] },
      { titre: 'Liaisons entre niveaux', blocs: liaisons.length ? [{ table: { entetes: ['Amont', 'Par', 'Aval', 'Asservissement'], lignes: liaisons } }] : [{ note: 'Installation sur un seul niveau : pas de liaison entre schémas.' }] },
      { titre: 'Fonctionnement par niveau', blocs: fct.length ? fct : [{ note: 'Aucun schéma de principe dans l\'étude.' }] },
      ...(autres.length ? [{ titre: 'Autres installations', blocs: autres.flatMap(x => [{ h3: x.titre }, { num: x.af }]) }] : []),
      { titre: 'Paramètres par installation', blocs: vues.filter(x => (x.params || []).length).flatMap(x => [{ h3: x.titre }, { table: { entetes: ['Paramètre', 'Valeur de l\'étude', 'Unité', 'Valeur réglée'], lignes: x.params.map(q => [q.libelle, nf(q.valeur, 2), q.unite || '', '']) } }]) },
    ];
    const blocs = [{ h1: titre }, { note: [affaire, indice ? `indice ${indice}` : '', date].filter(Boolean).join(' · ') },
      { p: 'Fonctionnement attendu de l\'installation hydraulique complète, niveau par niveau : production racine, circuits, schémas alimentés en aval (sous-stations, PAC de zone…), réseaux et consommateurs (CTA, terminaux, ECS), avec les asservissements entre niveaux. Les valeurs sont celles de l\'étude, à confirmer à la mise en service.' },
      { h2: 'Sommaire' }, { num: sections.map(x => x.titre) }];
    const sous = fct.filter(b => b.h3).map(b => ({ niveau: 1, texte: b.h3 }));
    if (sous.length) blocs.push({ p: 'Fonctionnement par niveau :', b: true }, { arbre: sous });
    sections.forEach((x, i) => blocs.push({ h2: `${i + 1}. ${x.titre}` }, ...x.blocs));
    return blocs;
  }
  return { build, corps, cahierBlocs, analyseFonctionnelle, analyseInstallation };
})();
if (typeof module !== 'undefined') module.exports = Docx;
