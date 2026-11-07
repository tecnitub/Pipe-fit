  // ---------- Impression des grands plans sur A4 / A3 ----------
  // Pages choisies (ou toutes) compilées avec leurs annotations, puis découpées en mosaïque à l'échelle réelle
  // (feuilles qui se recouvrent, repères, plan d'assemblage) ou réduites sur une feuille (échelle recalculée).
  function pagesPlans() { return etat.selection.size ? pagesChoisies() : etat.pages.slice(); }
  function ouvrirPlans() {
    if (!etat.pages.length) return;
    if (!$('#editeur').hidden) validerEditeur();
    const pages = pagesPlans();
    const grands = pages.filter(p => { const d = dims(p); return Math.max(d.l, d.h) > 1200 || Math.min(d.l, d.h) > 850; });
    const fmt = p => { const d = dims(p); return `${Math.round(d.l * 25.4 / 72)} × ${Math.round(d.h * 25.4 / 72)} mm`; };
    $('#plans-info').textContent = `${pages.length} page(s) ${etat.selection.size ? 'sélectionnée(s)' : 'du document'}` +
      (grands.length ? `, dont ${grands.length} grand(s) format(s) (ex. ${fmt(grands[0])}).` : ' : aucune n\'est plus grande que l\'A3, elles seront imprimées telles quelles.') +
      ' Les pages qui tiennent sur une feuille ne sont pas découpées.';
    $('#dlg-plans').hidden = false;
  }
  async function produirePlans() {
    const pages = pagesPlans();
    const opts = { ...options(), sommaire: false, signets: false, editable: false, commentaires: false, numerotation: { actif: false }, filigrane: options().filigrane };
    const reglage = {
      format: $('#plans-format').value,
      mode: document.querySelector('input[name=plans-mode]:checked').value,
      recouvrement: Math.max(0, Math.min(40, Number($('#plans-recouvrement').value) || 0)),
      titre: opts.titre || '',
      // Échelle de chaque page (1/50 -> 50) : affichée sur les feuilles, recalculée quand le plan est réduit
      echelles: pages.map(p => (p.echelle && p.echelle.libelle ? Number(p.echelle.libelle.split('/')[1]) : null)),
    };
    try { localStorage.setItem('atelierpdf.plans', JSON.stringify({ format: reglage.format, mode: reglage.mode, recouvrement: reglage.recouvrement })); } catch { /* rien */ }
    $('#dlg-plans').hidden = true;
    return occupe('Préparation des feuilles…', async avance => {
      const octets = await produire(pages, opts, v => avance(v * 0.7));
      const res = await MoteurPDF.mosaique(octets, reglage);
      avance(1);
      return { octets: res, feuilles: res.feuilles, reglage };
    });
  }
  async function plans(action) {
    let r;
    try { r = await produirePlans(); } catch (e) { console.error(e); note(`Préparation impossible : ${e.message || e}`, 'erreur'); return; }
    const titre = `${nomFichier(r.reglage.titre || 'Plans')} - ${r.reglage.mode === 'reduire' ? 'réduit' : 'mosaïque'} ${r.reglage.format}`;
    if (action === 'imprimer') { imprimerOctets(r.octets); note(`${r.feuilles} feuille(s) ${r.reglage.format} : imprimez à 100 % (taille réelle).`, 'ok'); return; }
    const nom = await enregistrer(r.octets, `${titre}.pdf`);
    if (nom) note(`« ${nom} » enregistré : ${r.feuilles} feuille(s) ${r.reglage.format}.`, 'ok');
  }
  $('#b-plans').onclick = ouvrirPlans;
  $('#plans-annuler').onclick = () => { $('#dlg-plans').hidden = true; };
  $('#plans-imprimer').onclick = () => plans('imprimer');
  $('#plans-enregistrer').onclick = () => plans('enregistrer');
  try {
    const m = JSON.parse(localStorage.getItem('atelierpdf.plans') || '{}');
    if (m.format) $('#plans-format').value = m.format;
    if (m.mode) document.querySelector(`input[name=plans-mode][value=${m.mode}]`).checked = true;
    if (m.recouvrement != null) $('#plans-recouvrement').value = m.recouvrement;
  } catch { /* rien */ }
