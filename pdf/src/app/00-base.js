  'use strict';
  const $ = s => document.querySelector(s);
  const A4 = MoteurPDF.A4;
  const COULEURS = ['#2f80ed', '#eb5757', '#27ae60', '#f2994a', '#9b51e0', '#00a3a3', '#d4a017', '#e056a0'];

  // ---------- pdf.js ----------
  const pdfjs = window.pdfjsLib;
  (function configurerPdfjs() {
    if (window.PDFJS_WORKER_SRC) {
      // Version compilée (un seul fichier) : le module de lecture tourne dans un « worker » créé à partir du texte embarqué
      try {
        const url = URL.createObjectURL(new Blob([window.PDFJS_WORKER_SRC], { type: 'text/javascript' }));
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(url);
        return;
      } catch { /* worker interdit : lecture dans la page */ }
      // eslint-disable-next-line no-new-func
      (0, eval)(window.PDFJS_WORKER_SRC);
    }
    // Sinon, si pdf.worker.min.js est chargé dans la page, pdf.js l'utilise directement (globalThis.pdfjsWorker)
  })();

  // ---------- État ----------
  const etat = {
    sources: new Map(),   // id -> { id, nom, type: 'pdf'|'image', octets, mime, couleur, doc (promesse pdf.js), nbPages, rasteriser, alerte, img }
    pages: [],            // { id, type: 'pdf'|'image'|'blanche', source, index, rotBase, rot, boite: {x,y,width,height}, elements: [], titre }
    images: new Map(),    // id -> { octets, mime, url, l, h }
    selection: new Set(),
    ancre: null,
    historique: [],
    futur: [],
  };
  let compteur = 0;
  const nouvelId = p => `${p}${Date.now().toString(36)}${(compteur++).toString(36)}`;

  // ---------- Petites aides ----------
  function note(texte, type = '') {
    const n = document.createElement('div');
    n.className = `note ${type}`;
    n.textContent = texte;
    $('#notes').appendChild(n);
    setTimeout(() => n.remove(), type === 'erreur' ? 8000 : 4000);
  }
  // Fenêtre d'attente ; avec { arretable: true }, bouton « Arrêter » : avance.arrete devient vrai, le travail s'arrête
  // proprement à la prochaine étape et garde ce qui est fait
  async function occupe(texte, travail, { arretable = false } = {}) {
    const fen = $('#occupe');
    $('#occupe-texte').textContent = texte;
    $('#occupe-barre').value = 0;
    const bouton = $('#occupe-arreter');
    bouton.hidden = !arretable;
    bouton.disabled = false;
    bouton.textContent = 'Arrêter';
    const avance = v => { $('#occupe-barre').value = v; };
    avance.arrete = false;
    bouton.onclick = () => { avance.arrete = true; bouton.disabled = true; bouton.textContent = 'Arrêt après la page en cours…'; };
    fen.hidden = false;
    try { return await travail(avance); }
    finally { fen.hidden = true; bouton.hidden = true; }
  }
  const sansExtension = n => n.replace(/\.[^.]+$/, '');
  const nomFichier = n => (n || 'Document').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Document';
  const pause = ms => new Promise(r => setTimeout(r, ms));

  // ---------- Historique (annuler / rétablir) ----------
  const instantane = () => ({ pages: structuredClone(etat.pages), selection: [...etat.selection] });
  function memoriser() {
    etat.historique.push(instantane());
    if (etat.historique.length > 100) etat.historique.shift();
    etat.futur = [];
  }
  function restaurer(i) {
    etat.pages = i.pages;
    etat.selection = new Set(i.selection.filter(id => etat.pages.some(p => p.id === id)));
    rafraichir();
  }
  function annuler() { if (!etat.historique.length) return; etat.futur.push(instantane()); restaurer(etat.historique.pop()); }
  function retablir() { if (!etat.futur.length) return; etat.historique.push(instantane()); restaurer(etat.futur.pop()); }
