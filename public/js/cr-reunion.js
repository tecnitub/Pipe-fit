// Comptes rendus de réunion de chantier (PDF, scan, photo) → tâches à faire pour le lot de l'entreprise :
// repère la date et le n° du CR, les rubriques par lot (« LOT 05 – CVC PLOMBERIE »), les lignes des tableaux
// d'actions dont la colonne « Qui » désigne le lot ou l'entreprise, et les points adressés à toutes les entreprises.
// Les points soldés (« fait », « soldé », « levé ») sont écartés ; l'échéance est lue quand elle est donnée
// (« pour le 12/03 », « avant le 15/03/2026 », « S12 »). Module partagé navigateur / serveur.
const CrReunion = (() => {
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’`]/g, '\'');
  const propre = s => String(s || '').replace(/[\t\u00a0]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s:.\-–•·*>]+(?=\S)|[\s:\-–•·*]+$/g, '').trim();
  const cellules = l => String(l).split(/\t|\s{3,}/).map(x => x.trim()).filter(Boolean);
  const echapper = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const MOTS_DEFAUT = ['CVC', 'plomberie', 'plombier', 'chauffage', 'chauffagiste', 'ventilation', 'climatisation', 'génie climatique', 'sanitaire', 'fluides', 'PB', 'CFA'];
  const TOUS = /\b(tous|tce|toutes entreprises|toutes les entreprises|ensemble des entreprises|chaque entreprise|les entreprises)\b/;
  const SOLDE = /(^|\s)(fait|faite|soldee?|levee?|clos|close|realisee?|ok|termine|terminee)\s*\.?$/;
  const INFO = /^(ras|r\.a\.s|sans objet|neant|pas de remarque|sans observation|\/|-)\.?$/;
  const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

  function lireDate(s, annee) {
    const t = norm(s);
    let m = /(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?!\d)/.exec(t);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) { const a = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : String(annee || new Date().getFullYear()); return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    m = new RegExp(`(\\d{1,2})(?:er)?\\s+(${MOIS.join('|')})(?:\\s+(\\d{4}))?`).exec(t);
    if (m) return `${m[3] || annee || new Date().getFullYear()}-${String(MOIS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return '';
  }
  // Lundi de la semaine ISO n
  function semaine(n, annee) {
    const j4 = new Date(Date.UTC(annee, 0, 4)), d = new Date(j4);
    d.setUTCDate(j4.getUTCDate() - ((j4.getUTCDay() || 7) - 1) + (n - 1) * 7);
    return d.toISOString().slice(0, 10);
  }
  // Échéance d'un point : « pour le », « avant le », « au plus tard le », date seule en fin de ligne, « S12 », « semaine 12 »
  function echeance(texte, annee) {
    const t = norm(texte);
    let m = /(?:pour le|avant le|au plus tard le|delai\s*:?|echeance\s*:?|le)\s*(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|\d{1,2}(?:er)?\s+[a-z]+(?:\s+\d{4})?)/.exec(t);
    if (m) { const d = lireDate(m[1], annee); if (d) return d; }
    m = /(?:^|\s)(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)\s*$/.exec(t);
    if (m) { const d = lireDate(m[1], annee); if (d) return d; }
    m = /\b(?:s|sem\.?|semaine)\s*(\d{1,2})\b/.exec(t);
    if (m && +m[1] >= 1 && +m[1] <= 53) return semaine(+m[1], annee || new Date().getFullYear());
    return '';
  }
  const LOT_TITRE = /^\W*(lot\s*(?:n[°o.]?\s*)?\d+[a-z]?\b.{0,70}|(?:entreprises?|lots?)\s*:?\s*[A-Z].{0,60})$/i;

  function analyser(lignesBrutes, opts = {}) {
    const mots = [...new Set([...(opts.mots && opts.mots.length ? opts.mots : MOTS_DEFAUT), ...(opts.societe ? [opts.societe] : [])].map(m => String(m).trim()).filter(Boolean))];
    const kw = new RegExp(`(^|[^a-z0-9])(${mots.map(m => echapper(norm(m))).join('|')})($|[^a-z0-9])`);
    const lignes = (lignesBrutes || []).map(String).filter(l => l.trim());
    const tete = lignes.slice(0, 25).join('\n'), nt = norm(tete);
    const r = { taches: [] };
    // Date et n° du compte rendu, prochaine réunion
    const iDate = lignes.slice(0, 25).findIndex(l => /reunion|compte[- ]rendu|\bcr\b|visite|date/.test(norm(l)) && lireDate(l));
    r.date = iDate >= 0 ? lireDate(lignes[iDate]) : lireDate(tete);
    const n = /(?:compte[- ]rendu|\bcr|reunion|visite)[^\n\d]{0,25}n\s*[°o.]?\s*(\d{1,3})/.exec(nt); if (n) r.numero = +n[1];
    const annee = r.date ? +r.date.slice(0, 4) : new Date().getFullYear();
    const ip = lignes.findIndex(l => /prochaine reunion|prochain rendez-vous|prochaine visite/.test(norm(l)));
    if (ip >= 0) r.prochaine = lireDate(lignes[ip], annee) || lireDate(lignes[ip + 1] || '', annee);
    // Parcours : rubriques par lot, lignes de tableau, suites de lignes
    let section = '', notre = false, tous = false, cur = null;
    const items = [];
    lignes.forEach(brute => {
      const t = propre(brute), nl = norm(t), c = cellules(brute);
      if (!t || /page \d+\s*(\/|sur)\s*\d+/i.test(t)) return;
      if (LOT_TITRE.test(t) && t.length < 90 && c.length <= 2) { section = t; notre = kw.test(norm(t)); tous = TOUS.test(norm(t)) && !notre; cur = null; return; }
      // Suite d'une ligne coupée (minuscule, sans colonne « qui »)
      if (cur && /^[a-zàâéèêëîïôûùç(«"]/.test(t) && !/[.]$/.test(cur.texte) && c.length <= 2) { cur.texte += ` ${t}`; cur.suite = `${cur.suite || ''} ${t}`; return; }
      const courtes = c.filter(x => x.length <= 40).map(norm);
      const qui = courtes.some(x => kw.test(x)) || kw.test(nl), pourTous = courtes.some(x => TOUS.test(x) && x.length < 30);
      // Échéance : colonne « pour le » (date seule ou « S12 ») ou dans le texte de la ligne
      const celDate = c.slice(1).find(x => x.length <= 12 && (lireDate(x, annee) || /^(s|sem)\s*\d{1,2}$/i.test(x)));
      cur = { texte: t, cells: c, section, ech: celDate ? echeance(celDate, annee) : echeance(t, annee), concerne: notre || qui, tous: !notre && !qui && (tous || pourTous), solde: SOLDE.test(norm(c[c.length - 1] || '')) || SOLDE.test(nl) };
      items.push(cur);
    });
    const vus = new Set();
    r.taches = items.filter(x => (x.concerne || x.tous) && !x.solde && x.texte.length > 12 && !INFO.test(norm(x.texte)) && !/^(n°|sujet|objet|observations?|qui|pour le|delai|lot)\b/i.test(x.texte))
      .map(x => {
        // Texte de la tâche : la ligne sans les cellules « qui », date et n° d'ordre
        const corps = x.cells.length > 1 ? x.cells.filter(cel => !(cel.length <= 40 && (kw.test(norm(cel)) || TOUS.test(norm(cel)))) && !/^\d{1,3}(\.\d+)*$/.test(cel) && !(lireDate(cel, annee) && cel.length <= 12) && !/^(s|sem)\s*\d{1,2}$/i.test(cel)).join(' – ') : x.texte;
        return { texte: propre(`${corps || x.texte}${x.cells.length > 1 && x.suite ? x.suite : ''}`).slice(0, 400), echeance: x.ech || echeance(x.texte, annee), section: x.section, tous: x.tous };
      })
      .filter(x => x.texte.length > 8 && !INFO.test(norm(x.texte)))
      .filter(x => { const k = cle(x.texte); if (vus.has(k)) return false; vus.add(k); return true; });
    return r;
  }
  // Clé de rapprochement d'une tâche d'un CR à l'autre (les points restent d'une semaine sur l'autre)
  const cle = t => norm(t).replace(/\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?/g, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70);
  return { analyser, lireDate, echeance, semaine, cle, MOTS_DEFAUT };
})();
if (typeof module !== 'undefined') module.exports = CrReunion;
