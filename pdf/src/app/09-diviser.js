  // ---------- Diviser ----------
  function ouvrirDiviser() {
    const premier = etat.sources.get(etat.pages[0]?.source);
    $('#div-nom').value = $('#o-titre').value.trim() || (premier ? premier.nom : 'Document');
    $('#dlg-diviser').hidden = false;
  }
  async function diviser() {
    const mode = document.querySelector('input[name=mode]:checked').value;
    const base = nomFichier($('#div-nom').value);
    let lots = [];
    try {
      if (mode === 'page') lots = etat.pages.map(p => [p]);
      else if (mode === 'n') {
        const n = Math.max(1, Number($('#div-n').value) || 1);
        for (let i = 0; i < etat.pages.length; i += n) lots.push(etat.pages.slice(i, i + n));
      } else if (mode === 'plages') {
        lots = MoteurPDF.lirePlages($('#div-plages').value, etat.pages.length).map(g => g.map(i => etat.pages[i]));
      } else {
        etat.pages.forEach((p, i) => {
          const prec = etat.pages[i - 1];
          if (prec && prec.source && prec.source === p.source) lots[lots.length - 1].push(p); else lots.push([p]);
        });
      }
    } catch (e) { note(e.message, 'erreur'); return; }
    $('#dlg-diviser').hidden = true;
    const largeurNum = String(lots.length).length;
    const noms = lots.map((lot, i) => {
      if (mode === 'document') {
        const s = etat.sources.get(lot[0].source);
        return `${String(i + 1).padStart(largeurNum, '0')} - ${nomFichier(s ? s.nom : (lot[0].titre || 'Page blanche'))}.pdf`;
      }
      return `${base}-${String(i + 1).padStart(largeurNum, '0')}.pdf`;
    });
    // Dossier de destination si le navigateur le permet (Edge, Chrome), sinon téléchargements successifs
    let dossier = null;
    if (window.showDirectoryPicker) {
      try { dossier = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e) { if (e.name === 'AbortError') return; }
    }
    const opts = { ...options(), titre: '' };
    try {
      await occupe(`Création de ${lots.length} fichiers…`, async avance => {
        for (let i = 0; i < lots.length; i++) {
          const octets = await produire(lots[i], { ...opts, sommaire: false });
          const blob = new Blob([octets], { type: 'application/pdf' });
          if (dossier) {
            const h = await dossier.getFileHandle(noms[i], { create: true });
            const w = await h.createWritable(); await w.write(blob); await w.close();
          } else { telecharger(blob, noms[i]); await pause(350); }
          avance((i + 1) / lots.length);
        }
      });
      note(`${lots.length} fichier(s) PDF créé(s)${dossier ? ` dans « ${dossier.name} »` : ' (dossier Téléchargements)'}.`, 'ok');
    } catch (e) {
      console.error(e);
      note(`Division interrompue : ${e.message || e}`, 'erreur');
    }
  }
