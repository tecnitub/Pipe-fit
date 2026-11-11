// Document Word (.docx) simple : titres, paragraphes, listes numérotées, cases à cocher et tableaux à bordures,
// page A4 paysage. Sert au cahier de paramétrage de l'automate (document modifiable par l'automaticien).
// Module pur ; l'archive est faite par XLSX.zip (même format ZIP « stocké » que les classeurs).
const Docx = (() => {
  const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const run = (t, o = {}) => `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.c ? `<w:color w:val="${o.c}"/>` : ''}<w:sz w:val="${o.sz || 20}"/></w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
  const para = (t, o = {}) => `<w:p><w:pPr><w:spacing w:before="${o.avant ?? 0}" w:after="${o.apres ?? 80}"/>${o.retrait ? `<w:ind w:left="${o.retrait}" w:hanging="${o.retrait}"/>` : ''}${o.garder ? '<w:keepNext/>' : ''}</w:pPr>${run(t, o)}</w:p>`;
  const cell = (t, o = {}) => `<w:tc><w:tcPr><w:tcW w:w="${o.w || 0}" w:type="${o.w ? 'dxa' : 'auto'}"/>${o.fond ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fond}"/>` : ''}</w:tcPr>${String(t ?? '').split('\n').map(l => para(l, { b: o.b, sz: 17, apres: 0 })).join('')}</w:tc>`;
  function table(entetes, lignes) {
    const n = entetes.length, larg = 15400, w = Math.floor(larg / n);
    const bord = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="8A96A3"/>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="${larg}" w:type="dxa"/><w:tblBorders>${bord}</w:tblBorders><w:tblLayout w:type="autofit"/><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr>
<w:tblGrid>${entetes.map(() => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>
<w:tr><w:trPr><w:tblHeader/></w:trPr>${entetes.map(h => cell(h, { b: true, fond: 'DCE6F1' })).join('')}</w:tr>
${lignes.map(l => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${Array.from({ length: n }, (_, i) => cell(l[i])).join('')}</w:tr>`).join('')}</w:tbl>${para('', { apres: 120 })}`;
  }
  // blocs : { h1 | h2 | h3 | p | note | num: [texte…] | cases: [texte…] | table: { entetes, lignes } }
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
  return { build, corps, cahierBlocs, analyseFonctionnelle };
})();
if (typeof module !== 'undefined') module.exports = Docx;
