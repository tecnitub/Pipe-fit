// Dictée d'une liste de matériel : micro (reconnaissance vocale du navigateur) ou clavier, puis vérification ligne par ligne :
// article trouvé dans la bibliothèque, à choisir entre plusieurs, ou matériel hors bibliothèque. Renvoie les lignes validées.
const Micro = {
  dispo: () => !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  // Écoute continue en français ; surTexte(final, provisoire) ; renvoie une fonction d'arrêt
  ecouter(surTexte, surFin) {
    const R = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    Object.assign(R, { lang: 'fr-FR', continuous: true, interimResults: true });
    let actif = true;
    R.onresult = e => {
      let final = '', prov = '';
      for (let i = e.resultIndex; i < e.results.length; i++) (e.results[i].isFinal ? (final += e.results[i][0].transcript) : (prov += e.results[i][0].transcript));
      surTexte(final, prov);
    };
    R.onerror = e => { actif = false; surFin(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Micro refusé : autorisez-le, ou utilisez le micro du clavier.' : e.error === 'no-speech' ? '' : 'Dictée interrompue.'); };
    R.onend = () => { if (actif) { actif = false; surFin(''); } };
    try { R.start(); } catch (e) { surFin('Dictée indisponible sur cet appareil.'); }
    return () => { actif = false; try { R.stop(); } catch (e) { /* déjà arrêtée */ } surFin(''); };
  },
};

// Dictée dans un champ de texte (rapport d'intervention, demande du client…) : bouton 🎤 ajouté sous chaque textarea[data-dictee].
// Ponctuation dite : « point », « virgule », « à la ligne ».
const ponctuer = t => DicteeMateriel.ponctuer(t);
function brancherDicteeTexte(root) {
  if (!Micro.dispo() || !root) return;
  root.querySelectorAll('textarea[data-dictee]:not([data-dictee-ok])').forEach(ta => {
    ta.dataset.dicteeOk = '1';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'secondary small micro-ta'; b.textContent = '🎤 Dicter';
    b.setAttribute('aria-label', `Dicter : ${ta.getAttribute('aria-label') || (ta.labels && ta.labels[0] ? ta.labels[0].textContent : 'texte')}`);
    ta.insertAdjacentElement('afterend', b);
    let arret = null;
    b.onclick = () => {
      if (arret) { arret(); return; }
      b.textContent = '⏹ Arrêter la dictée'; b.classList.add('danger');
      arret = Micro.ecouter((final, prov) => {
        b.title = prov;
        if (!final) return;
        const avant = ta.value.replace(/\s+$/, ''), txt = ponctuer(final);
        ta.value = avant ? `${avant}${/[.!?\n]$/.test(avant) ? ' ' : ' '}${/[.!?\n]$/.test(avant) || !avant ? txt.charAt(0).toUpperCase() + txt.slice(1) : txt}` : txt.charAt(0).toUpperCase() + txt.slice(1);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }, msg => { arret = null; b.textContent = '🎤 Dicter'; b.classList.remove('danger'); b.title = ''; if (msg) notify(msg); });
    };
  });
}

function dicterMateriel({ titre = 'Dicter du matériel', prix = false, cible = '' } = {}) {
  return new Promise(resolve => {
    const articles = Store.all('articles'), fournisseurDe = a => (a.fournisseurId ? clientName(a.fournisseurId) : '');
    let lignes = [], arret = null;
    const box = Modal.open(`<h2 style="margin-top:0">🎤 ${esc(titre)}</h2>
      <div id="dc-saisie">
        <p class="muted small">Dites ou tapez la liste, par exemple : « 3 coudes de 50, 2 brides DN100 et 12 mètres de tube inox 50 ».
        Les articles de la bibliothèque sont reconnus ; les autres restent en matériel hors bibliothèque.${cible ? ` Ils seront ajoutés ${esc(cible)}.` : ''}</p>
        <div class="dc-zone"><textarea id="dc-texte" rows="5" placeholder="Touchez 🎤 et parlez, ou utilisez le micro du clavier"></textarea><span id="dc-prov" class="muted small"></span></div>
        <div class="dc-actions">${Micro.dispo() ? '<button class="big" id="dc-micro">🎤 Dicter</button>' : '<p class="small muted">Dictée : utilisez le micro du clavier de votre téléphone.</p>'}
          <button class="big secondary" id="dc-analyser">Reconnaître le matériel</button></div>
      </div>
      <div id="dc-verif" hidden></div>
      <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="dc-x">Annuler</button><button id="dc-ok" hidden>Ajouter</button></div>`, true);
    const $ = s => box.querySelector(s);
    const fin = res => { if (arret) arret(); Modal.close(); resolve(res); };
    $('#dc-x').onclick = () => fin([]);

    // Micro
    const bm = $('#dc-micro');
    if (bm) bm.onclick = () => {
      if (arret) { arret(); return; }
      const ta = $('#dc-texte');
      bm.textContent = '⏹ Arrêter'; bm.classList.add('danger');
      arret = Micro.ecouter((final, prov) => {
        if (final) ta.value = `${ta.value.trim()}${ta.value.trim() ? ', ' : ''}${final.trim()}`;
        $('#dc-prov').textContent = prov;
      }, msg => { arret = null; bm.textContent = '🎤 Dicter'; bm.classList.remove('danger'); $('#dc-prov').textContent = ''; if (msg) notify(msg); });
    };

    const libelle = a => `${a.ref} – ${a.designation}${prix ? ` (${eur(a.prixVente)}/${a.unite || 'u'})` : ''}`;
    const qteTxt = q => String(q).replace('.', ',');
    function ligneHtml(l, i) {
      const r = l.r, icone = r.statut === 'trouve' ? '<span class="badge b-ok">✓ trouvé</span>' : r.statut === 'choix' ? '<span class="badge b-warn">? à choisir</span>' : '<span class="badge">hors bibliothèque</span>';
      return `<div class="dc-ligne ${r.statut}" data-i="${i}">
        <div class="dc-tete"><input class="dc-q" data-q="${i}" value="${esc(qteTxt(l.qte))}" inputmode="decimal" aria-label="Quantité"><span class="dc-u">${esc(l.choix ? l.choix.unite || 'u' : l.unite || 'u')}</span>
          <span class="dc-dit small muted">« ${esc(l.texte)} »</span>${icone}<button class="icon" data-rm="${i}" aria-label="Retirer">✕</button></div>
        <div class="dc-choix"><select data-art="${i}" aria-label="Article">${r.candidats.map(a => `<option value="${a.id}" ${l.choix && l.choix.id === a.id ? 'selected' : ''}>${esc(libelle(a))}</option>`).join('')}
          <option value="" ${l.choix ? '' : 'selected'}>Hors bibliothèque : ${esc(l.texte)}</option></select>
          <input type="search" data-cherche="${i}" value="${esc(l.recherche)}" aria-label="Chercher un autre article" placeholder="Chercher…"></div></div>`;
    }
    function verif() {
      const n = lignes.length, ok = lignes.filter(l => l.choix).length;
      $('#dc-verif').innerHTML = n ? `<p class="small"><strong>${n} ligne${n > 1 ? 's' : ''}</strong> · ${ok} dans la bibliothèque${n - ok ? ` · ${n - ok} hors bibliothèque (prix à compléter)` : ''}
        · <button class="linklike small" id="dc-retour">modifier le texte</button></p>${lignes.map(ligneHtml).join('')}` : '<p class="muted">Aucun matériel reconnu. <button class="linklike" id="dc-retour">Modifier le texte</button></p>';
      $('#dc-ok').hidden = !n; $('#dc-ok').textContent = `Ajouter ${n} ligne${n > 1 ? 's' : ''}`;
      const rt = $('#dc-retour'); if (rt) rt.onclick = () => { $('#dc-saisie').hidden = false; $('#dc-verif').hidden = true; $('#dc-ok').hidden = true; };
      box.querySelectorAll('[data-q]').forEach(x => x.onchange = () => { lignes[+x.dataset.q].qte = num(x.value.replace(',', '.')); });
      box.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { lignes.splice(+x.dataset.rm, 1); verif(); });
      box.querySelectorAll('[data-art]').forEach(x => x.onchange = () => { const l = lignes[+x.dataset.art]; l.choix = Store.get('articles', x.value) || null; verif(); });
      box.querySelectorAll('[data-cherche]').forEach(x => x.onchange = () => {
        const l = lignes[+x.dataset.cherche]; l.recherche = x.value;
        l.r = DicteeMateriel.rapprocher({ recherche: x.value }, articles, fournisseurDe);
        if (!l.r.candidats.length) notify(`Rien trouvé pour « ${x.value} »`);
        l.choix = l.r.candidats.length ? l.r.article : l.choix; verif();
      });
    }
    $('#dc-analyser').onclick = () => {
      if (arret) arret();
      lignes = DicteeMateriel.analyser($('#dc-texte').value).map(l => { const r = DicteeMateriel.rapprocher(l, articles, fournisseurDe); return { ...l, r, choix: r.statut === 'absent' ? null : r.article }; });
      $('#dc-saisie').hidden = true; $('#dc-verif').hidden = false; verif();
    };
    $('#dc-ok').onclick = () => fin(lignes.filter(l => num(l.qte) > 0).map(l => (l.choix
      ? { articleId: l.choix.id, designation: l.choix.designation, unite: l.choix.unite || 'u', qte: num(l.qte), pu: num(l.choix.prixVente), cout: num(l.choix.coutRevient), poids: num(l.choix.poidsUnitaire) }
      : { articleId: '', designation: l.texte.charAt(0).toUpperCase() + l.texte.slice(1), unite: l.unite || 'u', qte: num(l.qte), pu: 0, cout: 0, poids: 0 })));
    setTimeout(() => $('#dc-texte').focus(), 50);
  });
}
