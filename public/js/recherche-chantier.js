// Recherche d'un chantier pour pointer (chantier non planifié) : par code ou nom, client, chargé d'affaires, site ou lieu,
// et par type (chantier sur devis / intervention hors devis). Chaque mot tapé doit se retrouver quelque part, sans tenir
// compte des accents ; les chantiers prévus ce jour-là puis ceux pointés récemment passent devant.
// Module commun navigateur / tests.
const RechercheChantier = (() => {
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const estHD = a => a && a.type === 'horsDevis';

  // ctx : { client(a), charge(a), site(a) -> textes ; prevus, recents : Set d'identifiants }
  function filtrer(affaires, { q = '', type = 'tous', clientId = '', chargeId = '' } = {}, ctx = {}) {
    const mots = norm(q).split(/\s+/).filter(Boolean), prevus = ctx.prevus || new Set(), recents = ctx.recents || new Set();
    const champ = (a, f) => norm(f ? f(a) : '');
    return affaires
      .filter(a => (type === 'tous' || (type === 'hd') === estHD(a)) && (!clientId || a.clientId === clientId) && (!chargeId || a.chargeId === chargeId))
      .map(a => {
        const z = { code: norm(a.code), nom: norm(a.nom), client: champ(a, ctx.client) + ' ' + norm(a.clientLibre), charge: champ(a, ctx.charge), site: `${champ(a, ctx.site)} ${norm(a.siteLibre)} ${norm(a.lieu)}` };
        let score = 0;
        for (const m of mots) {
          const s = z.code.startsWith(m) ? 6 : z.code.includes(m) ? 5 : z.nom.includes(m) ? 4 : z.client.includes(m) ? 3 : z.charge.includes(m) ? 2 : z.site.includes(m) ? 1 : 0;
          if (!s) return null;
          score += s;
        }
        return { a, score, prevu: prevus.has(a.id), recent: recents.has(a.id) };
      })
      .filter(Boolean)
      .sort((x, y) => (y.prevu - x.prevu) || (y.recent - x.recent) || (y.score - x.score) || String(y.a.code || '').localeCompare(String(x.a.code || '')));
  }
  return { filtrer, norm };
})();
if (typeof module !== 'undefined') module.exports = RechercheChantier;
