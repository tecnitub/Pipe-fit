// Fusion à trois de deux enregistrements concurrents d'une étude (ou d'un DOE) : la version de départ (« base », celle
// chargée ou enregistrée en dernier par ce navigateur), mes changements (« local ») et la version enregistrée entre-temps
// par quelqu'un d'autre (« distant »). Les changements qui portent sur des parties différentes sont réunis
// automatiquement : champ par champ (en-tête, entrées d'un calcul), note par note et ligne par ligne des listes dont les
// éléments ont un identifiant (id), clé par clé des objets (matériel retenu, suivi des étapes), ajouts en fin de liste
// (historiques) et lignes modifiées sans ajout ni retrait (même position). Ce qui a été changé des deux côtés de façon
// différente est un conflit : il est listé (chemin lisible, mes valeurs, les leurs) et tranché élément par élément.
// Module commun navigateur / Node (tests, DOE).
const FusionEtude = (() => {
  const ABSENT = undefined;
  // Champs dérivés (recalculés à chaque enregistrement) : jamais présentés comme conflit, ma valeur est gardée
  const DERIVES = new Set(['avancement', 'consequences', 'etatReference', '_etats', '_v', '_at', '_by']);
  const estObjet = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  function egal(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => egal(x, b[i]));
    const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
    return ka.length === kb.length && ka.every(k => egal(a[k], b[k]));
  }
  const cloner = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  // Identifiant d'un élément de liste : id (notes, lignes identifiées)
  const idDe = x => (estObjet(x) && (typeof x.id === 'string' || typeof x.id === 'number') && x.id !== '' ? String(x.id) : null);
  const identifiee = l => {
    if (!Array.isArray(l)) return false;
    const ids = l.map(idDe);
    return ids.every(Boolean) && new Set(ids).size === ids.length;
  };
  // Nom lisible d'un élément (note de calcul, ligne)
  const nomDe = x => (estObjet(x) ? String(x.titre || x.nom || x.designation || x.rep || x.libelle || x.id || '') : '');
  const cleChemin = ch => ch.map(s => (s.id !== undefined ? `#${s.id}` : s.i !== undefined ? `[${s.i}]` : s.k)).join('/');

  // Fusion récursive ; conflits ajoutés à `out` ; choix : { [cle]: 'local' | 'distant' } (défaut : opts.parDefaut)
  function fusionValeur(b, l, d, ch, ctx) {
    if (egal(l, d)) return cloner(l);
    if (egal(b, l)) return cloner(d);
    if (egal(b, d)) return cloner(l);
    const der = ch.length && DERIVES.has(ch[ch.length - 1].k);
    if (der) return cloner(l);
    if (estObjet(l) && estObjet(d)) return fusionObjet(estObjet(b) ? b : {}, l, d, ch, ctx);
    if (Array.isArray(l) && Array.isArray(d)) {
      const bb = Array.isArray(b) ? b : [];
      if (identifiee(l) && identifiee(d) && identifiee(bb)) return fusionParId(bb, l, d, ch, ctx);
      const r = fusionPositions(bb, l, d, ch, ctx);
      if (r !== null) return r;
    }
    return conflit(b, l, d, ch, ctx);
  }
  function conflit(b, l, d, ch, ctx) {
    const cle = cleChemin(ch), choix = ctx.choix[cle] || ctx.parDefaut;
    ctx.conflits.push({ cle, chemin: ch.map(s => ({ ...s })), base: cloner(b), local: cloner(l), distant: cloner(d) });
    return cloner(choix === 'distant' ? d : l);
  }
  function fusionObjet(b, l, d, ch, ctx) {
    const out = {}, cles = [...new Set([...Object.keys(d), ...Object.keys(l), ...Object.keys(b)])];
    cles.forEach(k => {
      const v = fusionValeur(b[k], l[k], d[k], [...ch, { k }], ctx);
      if (v !== ABSENT) out[k] = v;
    });
    return out;
  }
  // Listes d'éléments identifiés (notes de calcul…) : ajouts, retraits et modifications de chaque côté
  function fusionParId(b, l, d, ch, ctx) {
    const mb = new Map(b.map(x => [idDe(x), x])), ml = new Map(l.map(x => [idDe(x), x])), md = new Map(d.map(x => [idDe(x), x]));
    const ordre = (liste, ref) => liste.map(idDe).filter(id => ref.has(id));
    // Ordre : celui du côté qui a réordonné (sinon celui de l'autre), éléments ajoutés de l'autre côté insérés avant leur suivant
    const communs = new Set([...ml.keys()].filter(id => md.has(id) && mb.has(id)));
    const lOrd = ordre(l, communs), dOrd = ordre(d, communs), bOrd = ordre(b, communs);
    const squelette = egal(dOrd, bOrd) && !egal(lOrd, bOrd) ? l : d, autre = squelette === l ? d : l;
    const ids = squelette.map(idDe);
    autre.forEach((x, i) => {
      const id = idDe(x);
      if (ids.includes(id)) return;
      // Placé avant l'élément qui le suit de son côté (en fin de liste s'il était le dernier)
      let pos = ids.length;
      for (let j = i + 1; j < autre.length; j++) { const p = ids.indexOf(idDe(autre[j])); if (p >= 0) { pos = p; break; } }
      ids.splice(pos, 0, id);
    });
    // Éléments retirés des deux côtés : absents de la fusion
    const out = [];
    ids.forEach(id => {
      const x = mb.get(id), y = ml.get(id), z = md.get(id), s = { id, nom: nomDe(y || z || x), ...(estObjet(y || z || x) && (y || z || x).type ? { type: (y || z || x).type } : {}) };
      const v = fusionValeur(x, y, z, [...ch, s], ctx);
      if (v !== ABSENT) out.push(v);
    });
    return out;
  }
  // Listes sans identifiant : lignes modifiées sans ajout ni retrait (même position), ou ajouts en fin de liste des deux côtés
  function fusionPositions(b, l, d, ch, ctx) {
    if (l.length === b.length && d.length === b.length) return b.map((x, i) => fusionValeur(x, l[i], d[i], [...ch, { i, nom: nomDe(l[i] || d[i] || x) }], ctx)).filter(v => v !== ABSENT);
    const prefixe = (p, t) => p.length <= t.length && p.every((x, i) => egal(x, t[i]));
    if (prefixe(b, l) && prefixe(b, d)) {
      const ajL = l.slice(b.length), ajD = d.slice(b.length).filter(x => !ajL.some(y => egal(x, y)));
      return cloner([...b, ...ajD, ...ajL]);
    }
    return null;
  }

  function fusionner(base, local, distant, opts = {}) {
    const ctx = { conflits: [], choix: opts.choix || {}, parDefaut: opts.parDefaut || 'local' };
    const sans = o => (estObjet(o) ? Object.fromEntries(Object.entries(o).filter(([k]) => !['_v', '_at', '_by'].includes(k))) : o);
    const fusion = fusionValeur(base ? sans(base) : {}, sans(local), sans(distant), [], ctx);
    return { fusion, conflits: ctx.conflits };
  }

  // Libellés des clés connues (en-tête de l'étude, DOE)
  const LIBELLES = {
    objet: 'Objet de l\'étude', client: 'Client / maître d\'ouvrage', indice: 'Indice', date: 'Date', auteur: 'Rédacteur', verificateur: 'Vérificateur', approbateur: 'Approbateur',
    statut: 'Statut', description: 'Objet détaillé', affaireId: 'Affaire Pipe-Fit', clientId: 'Client Pipe-Fit', devisId: 'Devis Pipe-Fit', climat: 'Climat du site', typeBatiment: 'Type de bâtiment',
    notes: 'Calculs', entrees: '', commentaire: 'Commentaire', titre: 'Titre', materiel: 'Matériel retenu', suiviEtapes: 'Suivi des étapes', historique: 'Historique', emissions: 'Émissions',
    equipements: 'Registre des équipements', inventaire: 'Inventaire CCTP / DPGF', reservesConformite: 'Réserves de conformité', motifIndice: 'Motif de l\'indice', fiches: 'Fiches', sections: 'Sections',
  };
  // Chemin lisible : « Calcul « Antenne CTA » › Débit » ; opts.champ(type, cle) donne le libellé d'un champ d'un calcul
  function libelle(c, opts = {}) {
    const morceaux = [];
    let type = '';
    c.chemin.forEach((s, i) => {
      const prec = c.chemin[i - 1];
      if (s.id !== undefined) {
        if (s.type) type = s.type;
        morceaux.push(prec && prec.k === 'notes' ? `Calcul « ${s.nom || s.id} »` : `« ${s.nom || s.id} »`);
        return;
      }
      if (s.k === 'notes' && c.chemin[i + 1] && c.chemin[i + 1].id !== undefined) return;
      if (s.i !== undefined) { morceaux.push(`ligne ${s.i + 1}${s.nom ? ` (${s.nom})` : ''}`); return; }
      const l = (type && opts.champ && opts.champ(type, s.k)) || (s.k in LIBELLES ? LIBELLES[s.k] : s.k);
      if (l) morceaux.push(l);
    });
    return morceaux.join(' › ') || 'Étude';
  }
  // Valeur courte pour le dialogue
  function apercu(v) {
    if (v === undefined) return '(supprimé)';
    if (v === null || v === '') return '(vide)';
    if (Array.isArray(v)) return `${v.length} élément(s)`;
    if (estObjet(v)) { const n = nomDe(v); return n && n !== v.id ? n : `${Object.keys(v).length} donnée(s)`; }
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return s.length > 90 ? `${s.slice(0, 87)}…` : s;
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Dialogue de conflit : un choix par élément (mes changements / ceux de l'autre), tout garder d'un côté
  function dialogueHtml(conflits, opts = {}) {
    const autre = opts.autre || 'l\'autre personne';
    return `<h2>Modifications concurrentes</h2>
      <p>${esc(autre)} a enregistré cette ${esc(opts.objet || 'étude')} pendant que vous la modifiiez. ${opts.fusionnes ? `${opts.fusionnes} changement(s) sur des parties différentes ont été réunis automatiquement. ` : ''}Pour les ${conflits.length} élément(s) ci-dessous, modifiés des deux côtés, choisissez la version à garder.</p>
      <div class="actions-ligne"><button type="button" class="secondaire petit" data-tout="local">Tout garder : mes changements</button><button type="button" class="secondaire petit" data-tout="distant">Tout garder : ceux de ${esc(autre)}</button></div>
      <div class="defile-x"><table class="liste conflits-fusion"><thead><tr><th>Élément</th><th>Mes changements</th><th>Ceux de ${esc(autre)}</th></tr></thead><tbody>
      ${conflits.map((c, i) => `<tr data-conflit="${i}"><td>${esc(libelle(c, opts))}${c.base !== undefined ? `<div class="petit muted">avant : ${esc(apercu(c.base))}</div>` : ''}</td>
        <td><label class="case"><input type="radio" name="cf-${i}" value="local" checked> ${esc(apercu(c.local))}</label></td>
        <td><label class="case"><input type="radio" name="cf-${i}" value="distant"> ${esc(apercu(c.distant))}</label></td></tr>`).join('')}</tbody></table></div>
      <div class="actions"><button type="button" id="cf-ok">Appliquer et enregistrer</button></div>`;
  }
  // Choix lus dans le dialogue (et boutons « tout garder »)
  function lierDialogue(racine, conflits, fini) {
    racine.querySelectorAll('[data-tout]').forEach(b => { b.onclick = () => racine.querySelectorAll(`input[type=radio][value=${b.dataset.tout}]`).forEach(r => { r.checked = true; }); });
    racine.querySelector('#cf-ok').onclick = () => {
      const choix = {};
      conflits.forEach((c, i) => { const r = racine.querySelector(`input[name="cf-${i}"]:checked`); choix[c.cle] = r ? r.value : 'local'; });
      fini(choix);
    };
  }
  // Nombre de changements de l'autre côté réunis sans conflit (pour le message)
  function compterDistants(base, distant) {
    let n = 0;
    const parcourir = (b, d) => {
      if (egal(b, d)) return;
      if (estObjet(b) && estObjet(d)) return [...new Set([...Object.keys(b), ...Object.keys(d)])].filter(k => !DERIVES.has(k)).forEach(k => parcourir(b[k], d[k]));
      if (identifiee(b) && identifiee(d)) { const mb = new Map(b.map(x => [idDe(x), x])), md = new Map(d.map(x => [idDe(x), x])); [...new Set([...mb.keys(), ...md.keys()])].forEach(id => parcourir(mb.get(id), md.get(id))); return; }
      n++;
    };
    parcourir(base || {}, distant || {});
    return n;
  }
  return { fusionner, egal, libelle, apercu, dialogueHtml, lierDialogue, compterDistants, DERIVES };
})();
if (typeof module !== 'undefined') module.exports = FusionEtude;
