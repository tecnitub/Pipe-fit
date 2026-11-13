// Administration de la boutique : commandes (statut, suivi transporteur, note interne) et demandes de devis (plans joints).
(function () {
  'use strict';
  const C = window.Catalogue;
  const zone = document.getElementById('contenu'), nav = document.getElementById('nav-admin');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => (+n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const date = d => new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const STATUTS = { recue: 'Reçue', confirmee: 'Confirmée', fabrication: 'En fabrication', expediee: 'Expédiée', livree: 'Livrée', annulee: 'Annulée' };
  const STATUTS_DEVIS = { nouvelle: 'Nouvelle', 'en-cours': 'En cours d\'étude', envoye: 'Devis envoyé', gagne: 'Gagné', perdu: 'Perdu' };
  let donnees = { commandes: [], devis: [] }, filtre = '', filtreStatut = '';

  function toast(msg, type = 'ok') {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = `toast visible ${type}`;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 3000);
  }
  async function api(methode, url, corps) {
    const r = await fetch(url, { method: methode, headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps ? JSON.stringify(corps) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && !url.endsWith('/login')) { connexion(); throw new Error('Session expirée'); }
    if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
    return j;
  }

  function connexion() {
    nav.hidden = true;
    zone.innerHTML = `<form class="connexion" id="form-connexion"><h1>Administration</h1>
      <label class="champ"><span>Mot de passe</span><input type="password" name="password" autocomplete="current-password" required autofocus></label>
      <button class="btn btn-primaire" type="submit">Se connecter</button></form>`;
    document.getElementById('form-connexion').addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('POST', 'api/admin/login', { password: e.target.elements.password.value }); await charger(); }
      catch (err) { toast(err.message, 'erreur'); }
    });
  }

  async function charger() {
    const [commandes, devis] = await Promise.all([api('GET', 'api/admin/commandes'), api('GET', 'api/admin/devis')]);
    donnees = { commandes, devis };
    nav.hidden = false;
    afficher();
  }

  const onglet = () => (location.hash === '#devis' ? 'devis' : 'commandes');
  function afficher() {
    if (nav.hidden) return;
    const o = onglet();
    nav.querySelectorAll('[data-onglet]').forEach(a => a.classList.toggle('actif', a.dataset.onglet === o));
    const statuts = o === 'devis' ? STATUTS_DEVIS : STATUTS;
    const liste = donnees[o].filter(x => (!filtreStatut || x.statut === filtreStatut) &&
      (!filtre || `${x.numero} ${x.client.societe} ${x.client.nom} ${x.client.email} ${x.reference || ''} ${x.chantier || ''}`.toLowerCase().includes(filtre.toLowerCase())));
    let chiffres = '';
    if (o === 'commandes') {
      const actives = donnees.commandes.filter(c => c.statut !== 'annulee');
      const mois = new Date().toISOString().slice(0, 7);
      chiffres = `<div class="chiffres">
        <div><strong>${donnees.commandes.filter(c => c.statut === 'recue').length}</strong><span>à confirmer</span></div>
        <div><strong>${donnees.commandes.filter(c => ['confirmee', 'fabrication'].includes(c.statut)).length}</strong><span>en cours de fabrication</span></div>
        <div><strong>${eur(actives.filter(c => c.created_at.startsWith(mois)).reduce((s, c) => s + c.ht, 0))}</strong><span>commandé ce mois-ci (HT)</span></div>
        <div><strong>${donnees.devis.filter(d => d.statut === 'nouvelle').length}</strong><span>demandes de devis nouvelles</span></div></div>`;
    }
    zone.innerHTML = `${chiffres}
      <div class="barre">
        <input type="search" id="recherche" placeholder="Rechercher (numéro, société, e-mail, référence)" value="${esc(filtre)}">
        <select id="filtre-statut"><option value="">Tous les statuts</option>${Object.entries(statuts).map(([k, v]) => `<option value="${k}"${k === filtreStatut ? ' selected' : ''}>${v}</option>`).join('')}</select>
        <button class="btn btn-secondaire btn-petit" id="actualiser" type="button">Actualiser</button>
      </div>
      <div class="liste">${liste.length ? liste.map(o === 'devis' ? itemDevis : itemCommande).join('') : '<div class="vide">Aucun élément</div>'}</div>`;
    const r = document.getElementById('recherche');
    r.addEventListener('input', () => { filtre = r.value; const pos = r.selectionStart; afficher(); const n = document.getElementById('recherche'); n.focus(); n.setSelectionRange(pos, pos); });
    document.getElementById('filtre-statut').addEventListener('change', e => { filtreStatut = e.target.value; afficher(); });
    document.getElementById('actualiser').addEventListener('click', () => charger().then(() => toast('Liste actualisée')).catch(e => toast(e.message, 'erreur')));
  }

  const adresse = a => [a.adresse, `${a.cp || ''} ${a.ville || ''}`.trim()].filter(Boolean).map(esc).join('<br>');
  function itemCommande(c) {
    return `<details class="item" data-numero="${esc(c.numero)}">
      <summary><span class="num">${esc(c.numero)}</span><span class="client"><strong>${esc(c.client.societe)}</strong> — ${esc(c.client.nom)} <span class="discret">· ${date(c.created_at)}</span></span>
        <span class="statut statut-${c.statut}">${STATUTS[c.statut]}</span><span class="montant">${eur(c.ht)} HT</span></summary>
      <div class="detail-item">
        <div>
          <table><thead><tr><th>Désignation</th><th>Qté</th><th class="n">P.U. HT</th><th class="n">Montant HT</th></tr></thead><tbody>
          ${c.lignes.map(l => `<tr><td>${esc(l.designation)}${l.options.length ? `<br><span class="discret">${l.options.map(o => esc((C.OPTIONS[o] || {}).nom || o)).join(', ')}</span>` : ''}
            ${l.config.troncons ? `<br><span class="discret">Extrémités : ${esc((C.EXTREMITES[l.config.ext.a] || {}).nom)} / ${esc((C.EXTREMITES[l.config.ext.b] || {}).nom)}</span>` : ''}</td>
            <td>${l.qte}</td><td class="n">${eur(l.pu)}</td><td class="n">${eur(l.montant)}${l.remise ? `<br><span class="discret">−${l.remise * 100} %</span>` : ''}</td></tr>`).join('')}
          ${c.certificats ? `<tr><td colspan="3">Certificats 3.1</td><td class="n">${eur(c.certificats)}</td></tr>` : ''}
          <tr><td colspan="3">Transport</td><td class="n">${eur(c.port)}</td></tr>
          <tr><td colspan="3"><strong>Total HT / TTC</strong></td><td class="n"><strong>${eur(c.ht)}</strong><br>${eur(c.ttc)}</td></tr></tbody></table>
          <div class="deux">
            <h4>Client</h4><p>${esc(c.client.societe)}${c.client.siret ? ` · SIRET ${esc(c.client.siret)}` : ''}${c.client.tva ? ` · TVA ${esc(c.client.tva)}` : ''}<br>
              ${esc(c.client.nom)} · <a href="mailto:${esc(c.client.email)}">${esc(c.client.email)}</a>${c.client.tel ? ` · ${esc(c.client.tel)}` : ''}<br>${adresse(c.client)}</p>
            <h4>Livraison</h4><p>${adresse(c.livraison)}${c.livraison.contact ? `<br>Contact : ${esc(c.livraison.contact)}` : ''}${c.livraison.creneau ? `<br>${esc(c.livraison.creneau)}` : ''}</p>
            <h4>Paiement et référence</h4><p>${c.paiement === 'compte' ? 'Sur compte, 30 jours fin de mois' : 'Virement à la commande'}${c.reference ? ` · Réf. client : <strong>${esc(c.reference)}</strong>` : ''}</p>
            ${c.message ? `<h4>Message</h4><p>${esc(c.message).replace(/\n/g, '<br>')}</p>` : ''}
            <h4>Historique</h4><p class="discret">${c.historique.map(h => `${STATUTS[h.statut]} le ${date(h.date)}`).join(' · ')}</p>
          </div>
        </div>
        <form class="actions-item" data-type="commande">
          <label class="champ"><span>Statut</span><select name="statut">${Object.entries(STATUTS).map(([k, v]) => `<option value="${k}"${k === c.statut ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="champ"><span>N° de suivi transporteur</span><input name="suiviTransport" value="${esc(c.suiviTransport || '')}"></label>
          <label class="champ"><span>Note interne</span><textarea name="note" rows="3">${esc(c.note || '')}</textarea></label>
          <button class="btn btn-primaire btn-petit" type="submit">Enregistrer</button>
        </form>
      </div></details>`;
  }
  function itemDevis(d) {
    return `<details class="item" data-numero="${esc(d.numero)}">
      <summary><span class="num">${esc(d.numero)}</span><span class="client"><strong>${esc(d.client.societe)}</strong> — ${esc(d.client.nom)} <span class="discret">· ${date(d.created_at)}</span></span>
        <span class="statut statut-${d.statut}">${STATUTS_DEVIS[d.statut]}</span><span class="montant">${d.fichiers.length} fichier(s)</span></summary>
      <div class="detail-item">
        <div>
          <h4>Contact</h4><p>${esc(d.client.nom)} · <a href="mailto:${esc(d.client.email)}">${esc(d.client.email)}</a>${d.client.tel ? ` · ${esc(d.client.tel)}` : ''}${d.client.cp ? ` · chantier ${esc(d.client.cp)}` : ''}</p>
          ${d.chantier ? `<p>Affaire : <strong>${esc(d.chantier)}</strong></p>` : ''}
          <p>${[d.fluide && `Fluide : ${esc(d.fluide)}`, d.pression && `Service : ${esc(d.pression)}`, d.echeance && `Besoin le ${new Date(d.echeance).toLocaleDateString('fr-FR')}`].filter(Boolean).join(' · ')}</p>
          <h4>Besoin</h4><p>${esc(d.message).replace(/\n/g, '<br>')}</p>
          ${d.fichiers.length ? `<h4>Plans joints</h4><p>${d.fichiers.map(f => `<a href="api/admin/fichiers/${esc(f.id)}" download>${esc(f.nom)}</a> <span class="discret">(${(f.taille / 1048576).toFixed(1).replace('.', ',')} Mo)</span>`).join('<br>')}</p>` : ''}
        </div>
        <form class="actions-item" data-type="devis">
          <label class="champ"><span>Statut</span><select name="statut">${Object.entries(STATUTS_DEVIS).map(([k, v]) => `<option value="${k}"${k === d.statut ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
          <button class="btn btn-primaire btn-petit" type="submit">Enregistrer</button>
        </form>
      </div></details>`;
  }

  zone.addEventListener('submit', async e => {
    const f = e.target.closest('.actions-item');
    if (!f) return;
    e.preventDefault();
    const numero = f.closest('.item').dataset.numero, el = f.elements;
    try {
      if (f.dataset.type === 'commande') {
        const c = await api('PUT', `api/admin/commandes/${numero}`, { statut: el.statut.value, suiviTransport: el.suiviTransport.value, note: el.note.value });
        donnees.commandes = donnees.commandes.map(x => (x.numero === numero ? c : x));
      } else {
        await api('PUT', `api/admin/devis/${numero}`, { statut: el.statut.value });
        donnees.devis.find(x => x.numero === numero).statut = el.statut.value;
      }
      afficher();
      const ouvert = zone.querySelector(`.item[data-numero="${numero}"]`); if (ouvert) ouvert.open = true;
      toast(`${numero} enregistrée`);
    } catch (err) { toast(err.message, 'erreur'); }
  });
  document.getElementById('deconnexion').addEventListener('click', async () => { await api('POST', 'api/admin/logout').catch(() => {}); connexion(); });
  window.addEventListener('hashchange', afficher);
  charger().catch(() => connexion());
})();
