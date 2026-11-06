  // ---------- Formulaires PDF (champs à remplir) ----------
  // Champs d'une page, d'après pdf.js : position sur la page affichée (fractions), type, valeur d'origine
  const cacheChamps = new Map();
  function champsPage(p) {
    const s = etat.sources.get(p.source);
    if (p.type !== 'pdf' || !s || s.rasteriser) return Promise.resolve([]);
    const cle = `${p.source}|${p.index}|${rotTotale(p)}`;
    if (!cacheChamps.has(cle)) cacheChamps.set(cle, (async () => {
      const page = await (await s.doc).getPage(p.index + 1);
      const vp = page.getViewport({ scale: 1, rotation: rotTotale(p) });
      const annots = await page.getAnnotations({ intent: 'display' });
      return annots.filter(a => a.annotationType === 20 && a.fieldName && !a.pushButton && a.fieldType !== 'Sig' && !a.hidden).map(a => {
        const [x1, y1, x2, y2] = vp.convertToViewportRectangle(a.rect);
        const c = { nom: a.fieldName, x: Math.min(x1, x2) / vp.width, y: Math.min(y1, y2) / vp.height, w: Math.abs(x2 - x1) / vp.width, h: Math.abs(y2 - y1) / vp.height,
          lectureSeule: !!a.readOnly, taille: a.defaultAppearanceData?.fontSize || 0 };
        if (a.fieldType === 'Tx') Object.assign(c, { type: 'texte', initiale: a.fieldValue || '', multiligne: !!a.multiLine, max: a.maxLen || 0 });
        else if (a.fieldType === 'Btn' && a.radioButton) Object.assign(c, { type: 'radio', valeurExport: a.buttonValue, initiale: a.fieldValue && a.fieldValue !== 'Off' ? a.fieldValue : '' });
        else if (a.fieldType === 'Btn') Object.assign(c, { type: 'case', initiale: !!a.fieldValue && a.fieldValue !== 'Off' });
        else if (a.fieldType === 'Ch') Object.assign(c, { type: 'liste', options: (a.options || []).map(o => ({ v: o.exportValue, t: o.displayValue })), initiale: Array.isArray(a.fieldValue) ? (a.fieldValue[0] || '') : (a.fieldValue || '') });
        return c.type ? c : null;
      }).filter(Boolean);
    })().catch(e => { console.warn('Formulaire illisible', e); return []; }));
    return cacheChamps.get(cle);
  }
  const valeurChamp = (s, c) => (s.champs && c.nom in s.champs ? s.champs[c.nom] : c.initiale);
  // Valeurs saisies dessinées sur la page (vignettes, pages recopiées en image)
  async function dessinerChamps(p, canvas) {
    const s = etat.sources.get(p.source);
    if (!s || !s.champs || !Object.keys(s.champs).length) return;
    const champs = (await champsPage(p)).filter(c => c.nom in s.champs);
    if (!champs.length) return;
    const g = canvas.getContext('2d');
    const L = canvas.width, H = canvas.height, k = L / dims(p).l;
    for (const c of champs) {
      const v = s.champs[c.nom];
      const x = c.x * L, y = c.y * H, w = c.w * L, h = c.h * H;
      g.save();
      g.beginPath(); g.rect(x, y, w, h); g.clip();
      g.fillStyle = '#fff'; g.fillRect(x, y, w, h);
      g.fillStyle = '#000';
      if (c.type === 'case' && v) { g.font = `${h * 0.9}px Arial`; g.textAlign = 'center'; g.fillText('✓', x + w / 2, y + h * 0.82); }
      else if (c.type === 'radio' && v === c.valeurExport) { g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.25, 0, 7); g.fill(); }
      else if (c.type === 'texte' || c.type === 'liste') {
        const hPt = c.h * dims(p).h;
        const t = (c.multiligne ? Math.min(c.taille || 10, 12) : c.taille ? Math.min(c.taille, hPt * 0.8) : Math.min(12, hPt * 0.65)) * k;
        g.font = `${t}px Helvetica, Arial, sans-serif`;
        String(v || '').split('\n').forEach((l, i) => g.fillText(l, x + 2 * k, y + (c.multiligne ? t * (1.1 + i * 1.15) : h / 2 + t * 0.35)));
      }
      g.restore();
    }
  }
  function changerChamp(s, nom, valeur) {
    s.champs = s.champs || {};
    s.champs[nom] = valeur;
    s.champsV = (s.champsV || 0) + 1;
    rafraichir();
  }
  // Champs de saisie posés sur la page dans l'éditeur (calque à part : la saisie n'est pas interrompue)
  async function afficherChamps() {
    const zone = $('#ed-champs');
    zone.replaceChildren();
    const p = ed.page, s = etat.sources.get(p.source);
    const champs = await champsPage(p);
    if (ed.page !== p || !champs.length) return;
    // Taille du texte : celle du formulaire, bornée ; automatique (0) : d'après la hauteur du champ
    const pt = c => {
      const hPt = c.h * dims(p).h;
      if (c.multiligne) return Math.min(c.taille || 10, 12);
      return c.taille ? Math.min(c.taille, hPt * 0.8) : Math.min(12, hPt * 0.65);
    };
    zone.replaceChildren(...champs.map(c => {
      let el;
      const v = valeurChamp(s, c);
      if (c.type === 'texte') {
        el = document.createElement(c.multiligne ? 'textarea' : 'input');
        el.value = v || '';
        if (c.max) el.maxLength = c.max;
        el.addEventListener('input', () => changerChamp(s, c.nom, el.value));
      } else if (c.type === 'case' || c.type === 'radio') {
        el = document.createElement('input');
        el.type = 'checkbox';
        el.checked = c.type === 'case' ? !!v : v === c.valeurExport;
        el.addEventListener('change', () => {
          if (c.type === 'case') changerChamp(s, c.nom, el.checked);
          else { changerChamp(s, c.nom, el.checked ? c.valeurExport : ''); zone.querySelectorAll(`[data-nom="${CSS.escape(c.nom)}"]`).forEach(o => { if (o !== el) o.checked = false; }); }
        });
      } else {
        el = document.createElement('select');
        el.append(new Option('', ''), ...c.options.map(o => new Option(o.t, o.v)));
        el.value = v || '';
        el.addEventListener('change', () => changerChamp(s, c.nom, el.value));
      }
      el.className = `champ-form champ-${c.type}`;
      el.dataset.nom = c.nom;
      el.title = c.nom;
      el.disabled = c.lectureSeule;
      Object.assign(el.style, { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` });
      el.style.setProperty('--pt', pt(c));
      return el;
    }));
    if (!ed.noteFormulaire) { ed.noteFormulaire = true; note('Ce document contient un formulaire : cliquez dans les champs (outil Sélection) pour le remplir. Les valeurs sont écrites dans le PDF à l\'enregistrement.'); }
  }
