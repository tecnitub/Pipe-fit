// Affichage par accès : l'administrateur choisit, pour les chargés d'affaires et pour les compagnons (et au besoin pour un
// compte précis), les menus, écrans et onglets affichés. L'administrateur voit toujours tout.
// settings.acces = { roles: { charge: { masques: [...] }, atelier: { masques: [...] } }, comptes: { <id compte>: { masques: [...] } } }
// Module commun navigateur / tests.
const Acces = (() => {
  const GROUPES = [
    { id: 'menu', titre: 'Menus du bureau', roles: ['charge'], elements: [['dashboard', 'Tableau de bord'], ['direction', 'Direction'], ['contacts', 'Contacts'], ['devis', 'Devis'], ['chantiers', 'Chantiers'],
      ['commandes', 'Achats'], ['situations', 'Situations'], ['factures', 'Facturation'], ['articles', 'Bibliothèque'], ['planning', 'Planning'], ['pointage', 'Pointage'], ['rh', 'RH'], ['parc', 'Parc'], ['fluides', 'Fluides'], ['analyse', 'Analyse']] },
    { id: 'ecrans', titre: 'Écrans et onglets du bureau', roles: ['charge'], elements: [['consultations', 'Achats › Consultations fournisseurs'], ['efactures', 'Achats › Factures reçues'], ['comptoir', 'Achats › Comptoir'],
      ['prixAchats', 'Achats › Historique des prix'], ['relances', 'Facturation › Relances'], ['tresorerie', 'Facturation › Trésorerie'], ['compta', 'Facturation › Comptabilité'], ['charges', 'Tableau par chargé d\'affaires']] },
    { id: 'compagnon', titre: 'Appli des compagnons (téléphone)', roles: ['atelier'], elements: [['pointage/heures', 'Heures'], ['pointage/planning', 'Planning'], ['pointage/chantiers', 'Chantiers et documents'],
      ['pointage/rapports', 'Rapports'], ['epreuve', 'PV d\'épreuve hydraulique'], ['mes', 'PV de mise en service'], ['equilibrage', 'Relevé d\'équilibrage'], ['pointage/frais', 'Notes de frais'], ['pointage/comptoir', 'Achats au comptoir'], ['pointage/fluides', 'Fluides frigorigènes']] },
  ];
  const ROLES = { charge: 'Chargés d\'affaires', atelier: 'Compagnons' };
  // Éléments masqués pour un compte : son réglage propre, sinon celui de son rôle ; rien pour l'administrateur
  function masques(compte, acces) {
    if (!compte || compte.role === 'admin') return [];
    const a = acces || {}, perso = (a.comptes || {})[compte.id];
    return (perso ? perso.masques : ((a.roles || {})[compte.role] || {}).masques) || [];
  }
  // Clé d'une adresse : onglet du téléphone (« pointage/frais »), sinon l'écran, sinon son entrée de menu
  const cleRoute = (name, params, role) => (role !== 'atelier' ? name : name === 'pointage' ? `pointage/${params[0] === 'chantier' ? 'chantiers' : params[0] || 'heures'}` : name === 'planning' ? 'pointage/planning' : name);
  function routeMasquee(name, params, m, menuOf = {}, role = '') {
    if (!m.length || ['parametres', 'notifications'].includes(name)) return false;
    return m.includes(cleRoute(name, params, role)) || (role !== 'atelier' && m.includes(menuOf[name] || name));
  }
  // Première adresse affichée (après une adresse masquée)
  function accueil(m, role) {
    if (role === 'atelier') { const t = ['pointage/heures', 'pointage/rapports', 'pointage/chantiers', 'pointage/planning', 'pointage/frais', 'pointage/comptoir', 'pointage/fluides'].find(k => !m.includes(k)); return t ? (t === 'pointage/heures' ? 'pointage' : t) : 'parametres'; }
    const e = GROUPES[0].elements.find(([k]) => !m.includes(k));
    return e ? e[0] : 'parametres';
  }
  return { GROUPES, ROLES, masques, routeMasquee, accueil, cleRoute };
})();
if (typeof module !== 'undefined') module.exports = Acces;

/* ---------- Navigateur : masques du compte connecté, carte de réglage (Paramètres, administrateur) ---------- */
if (typeof window !== 'undefined') {
  window.accesMasques = () => Acces.masques(Store.me, Store.data.settings.acces);
  // Liens d'onglets et boutons vers des écrans masqués : retirés de la page
  window.masquerLiensAcces = root => {
    const m = accesMasques();
    if (!m.length) return;
    root.querySelectorAll('.tabs a[href^="#/"], .essais-boutons a[href^="#/"]').forEach(a => {
      const [n, ...pr] = a.getAttribute('href').slice(2).split('?')[0].split('/');
      if (Acces.routeMasquee(n, pr, m, MENU_OF, Store.me.role)) a.hidden = true;
    });
  };
  window.accesCarte = () => (Store.can('admin') ? '<h2>Affichage par accès</h2><div class="card" id="acc-carte"><p class="muted small">Chargement…</p></div>' : '');
  window.bindAcces = root => {
    const carte = root.querySelector('#acc-carte');
    if (!carte) return;
    let comptes = [];
    const lire = () => JSON.parse(JSON.stringify(Store.data.settings.acces || {}));
    const enregistrer = async a => { try { await Store.saveSettings({ ...Store.data.settings, acces: a }); dessiner(); App.toast('Affichage enregistré'); } catch (e) { notify(e.message); } };
    const dessiner = () => {
      const a = lire();
      carte.innerHTML = `<p class="muted small" style="margin-top:0">Cochez ce que chaque accès affiche. Un compte peut avoir son propre réglage (par exemple une assistante sans la Direction ni la Trésorerie). L'administrateur voit toujours tout. Ce réglage masque les écrans ; ce que les compagnons reçoivent comme données se règle juste en dessous.</p>
        ${Object.entries(Acces.ROLES).map(([role, lib]) => {
          const perso = comptes.filter(c => c.role === role && (a.comptes || {})[c.id]);
          const cols = [{ cle: `r:${role}`, lib, m: ((a.roles || {})[role] || {}).masques || [] }, ...perso.map(c => ({ cle: `c:${c.id}`, lib: c.nom || c.login, m: a.comptes[c.id].masques || [], perso: c.id }))];
          const libres = comptes.filter(c => c.role === role && !(a.comptes || {})[c.id]);
          return `<h3>${esc(lib)}</h3><div class="table-wrap"><table class="acces-table"><tr><th></th>${cols.map(c => `<th>${esc(c.lib)}${c.perso ? ` <button class="icon" data-acc-retirer="${esc(c.perso)}" title="Revenir au réglage du rôle" aria-label="Revenir au réglage du rôle">✕</button>` : ''}</th>`).join('')}</tr>
            ${Acces.GROUPES.filter(g => g.roles.includes(role)).map(g => `<tr class="acces-groupe"><td colspan="${cols.length + 1}">${esc(g.titre)}</td></tr>${g.elements.map(([k, l]) => `<tr><td>${esc(l)}</td>${cols.map(c => `<td class="center"><input type="checkbox" data-acc-col="${esc(c.cle)}" data-acc-el="${esc(k)}" ${c.m.includes(k) ? '' : 'checked'} aria-label="${esc(`${l} — ${c.lib}`)}"></td>`).join('')}</tr>`).join('')}`).join('')}</table></div>
            ${libres.length ? `<div class="toolbar"><select data-acc-choix="${role}" style="width:auto" aria-label="Compte à personnaliser"><option value="">Personnaliser un compte…</option>${libres.map(c => `<option value="${esc(c.id)}">${esc(c.nom || c.login)}</option>`).join('')}</select></div>` : ''}`;
        }).join('')}`;
      carte.querySelectorAll('[data-acc-col]').forEach(cb => cb.onchange = () => {
        const a2 = lire(), [t, id] = cb.dataset.accCol.split(':'), cible = t === 'r' ? ((a2.roles = a2.roles || {})[id] = (a2.roles || {})[id] || { masques: [] }) : a2.comptes[id];
        const el = cb.dataset.accEl;
        cible.masques = cb.checked ? (cible.masques || []).filter(k => k !== el) : [...new Set([...(cible.masques || []), el])];
        enregistrer(a2);
      });
      carte.querySelectorAll('[data-acc-choix]').forEach(s => s.onchange = () => {
        if (!s.value) return;
        const a2 = lire(), role = s.dataset.accChoix;
        a2.comptes = a2.comptes || {};
        a2.comptes[s.value] = { masques: [...(((a2.roles || {})[role] || {}).masques || [])] };
        enregistrer(a2);
      });
      carte.querySelectorAll('[data-acc-retirer]').forEach(b => b.onclick = () => { const a2 = lire(); delete (a2.comptes || {})[b.dataset.accRetirer]; enregistrer(a2); });
    };
    api('GET', '/api/accounts').then(l => { comptes = l.filter(c => c.role !== 'admin'); dessiner(); }).catch(() => dessiner());
  };
}
