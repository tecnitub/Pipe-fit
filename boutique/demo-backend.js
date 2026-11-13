// Serveur simulé de la démonstration de la boutique (sans serveur) : remplace fetch('api/...') dans le navigateur.
// Commandes et demandes de devis enregistrées sur l'appareil (localStorage) ; prix recalculés avec le même catalogue que le serveur.
// Partagé par la page boutique et la page d'administration de la démo (même stockage).
(function () {
  'use strict';
  const C = window.Catalogue;
  const CLE = 'tecnitub-demo-donnees';
  let memoire = null; // navigation privée : données gardées pour la session seulement
  const maintenant = () => new Date().toISOString();

  // Exemples pour que l'administration ne soit pas vide à la première visite (clairement marqués « exemple »)
  function exemples() {
    const cfg = { serie: 'iso', dn: 'DN80', ep: 2, nuance: '316L', finition: 'decape' };
    const lignes = [
      { produit: 'collecteur-sur-mesure', qte: 2, options: ['epreuve'], config: { ...cfg, longueur: 1300, ext: { a: 'collerette', b: 'fond' },
        piquages: [350, 650, 950].map(pos => ({ dn: 'DN40', orient: 'H', pos, h: 250, ext: 'collerette' })), repere: 'COL-01' } },
      { produit: 'coude90', qte: 12, options: [], config: cfg },
    ];
    const t = C.totaliser(lignes);
    t.lignes.forEach(l => { l.designation = C.designation(l); });
    const d = new Date(Date.now() - 3 * 86400000).toISOString();
    return {
      commandes: [{ numero: 'CMD-2026-0001', statut: 'fabrication', created_at: d, updated_at: d, exemple: true,
        client: { societe: 'Exemple — Laiterie des Monts', nom: 'Client exemple', email: 'exemple@exemple.fr', tel: '', adresse: '1 route de la Fromagerie', cp: '07100', ville: 'Annonay', siret: '', tva: '' },
        livraison: { adresse: '1 route de la Fromagerie', cp: '07100', ville: 'Annonay', contact: '', creneau: '' }, paiement: 'virement', reference: 'BC-EXEMPLE', message: '',
        ...t, historique: [{ statut: 'recue', date: d }, { statut: 'confirmee', date: d }, { statut: 'fabrication', date: d }] }],
      devis: [{ numero: 'DEV-2026-0001', statut: 'nouvelle', created_at: d, updated_at: d,
        client: { societe: 'Exemple — Brasserie du Vivarais', nom: 'Client exemple', email: 'exemple@exemple.fr', tel: '', cp: '07300' },
        message: 'Exemple : réseau de soutirage DN50 en 316L poli, 8 spools et un collecteur 4 départs.', fluide: 'Bière, NEP', pression: '6 bar, 85 °C', echeance: '', chantier: 'Exemple',
        fichiers: [{ id: 'exemple', nom: 'isometrique-exemple.pdf', taille: 412000 }] }],
      session: false,
    };
  }
  function lire() {
    if (memoire) return memoire;
    try { const v = localStorage.getItem(CLE); if (v) return (memoire = JSON.parse(v)); } catch (e) { /* stockage indisponible */ }
    return (memoire = exemples());
  }
  function ecrire() { try { localStorage.setItem(CLE, JSON.stringify(memoire)); } catch (e) { /* reste en mémoire */ } }

  const reponse = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  const erreur = (status, msg) => reponse(status, { error: msg });
  const texte = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
  function client(c = {}) {
    const r = { societe: texte(c.societe, 120), siret: texte(c.siret, 20).replace(/\s/g, ''), nom: texte(c.nom, 100), email: texte(c.email, 160).toLowerCase(),
      tel: texte(c.tel, 30), adresse: texte(c.adresse), cp: texte(c.cp, 10), ville: texte(c.ville, 80), tva: texte(c.tva, 20) };
    if (!r.societe) throw new Error('Raison sociale obligatoire');
    if (!r.nom) throw new Error('Nom du contact obligatoire');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email)) throw new Error('Adresse e-mail invalide');
    if (r.siret && !/^\d{14}$/.test(r.siret)) throw new Error('Le SIRET comporte 14 chiffres');
    return r;
  }
  const numero = (liste, prefixe) => `${prefixe}-${new Date().getFullYear()}-${String(liste.filter(x => x.numero.startsWith(`${prefixe}-${new Date().getFullYear()}`)).length + 1).padStart(4, '0')}`;

  async function traiter(url, opts) {
    const chemin = '/' + url.slice(url.indexOf('api/')), m = (opts.method || 'GET').toUpperCase();
    const b = opts.body ? JSON.parse(opts.body) : {};
    const db = lire();
    try {
      if (chemin === '/api/commandes' && m === 'POST') {
        const cl = client(b.client);
        const l = b.livraison || {};
        const liv = { adresse: texte(l.adresse) || cl.adresse, cp: texte(l.cp, 10) || cl.cp, ville: texte(l.ville, 80) || cl.ville, contact: texte(l.contact, 100), creneau: texte(l.creneau, 100) };
        if (!liv.adresse || !/^\d{5}$/.test(liv.cp) || !liv.ville) throw new Error('Adresse de livraison incomplète (code postal à 5 chiffres)');
        if (!b.cgv) throw new Error('Acceptez les conditions générales de vente');
        if (b.paiement === 'compte' && !cl.siret) throw new Error('Le paiement sur compte client (30 jours fin de mois) demande le SIRET');
        const t = C.totaliser(b.lignes || []);
        t.lignes.forEach(x => { x.designation = C.designation(x); });
        const num = numero(db.commandes, 'CMD'), now = maintenant();
        db.commandes.unshift({ numero: num, statut: 'recue', created_at: now, updated_at: now, client: cl, livraison: liv, paiement: b.paiement === 'compte' ? 'compte' : 'virement',
          reference: texte(b.reference, 60), message: texte(b.message, 2000), ...t, historique: [{ statut: 'recue', date: now }] });
        ecrire();
        return reponse(201, { numero: num, ht: t.ht, ttc: t.ttc, delai: t.delai });
      }
      if (chemin === '/api/devis' && m === 'POST') {
        const cl = client(b.client), message = texte(b.message, 5000);
        if (message.length < 10) throw new Error('Décrivez votre besoin (au moins quelques mots)');
        const num = numero(db.devis, 'DEV'), now = maintenant();
        // Démo : seuls le nom et la taille des plans sont gardés
        db.devis.unshift({ numero: num, statut: 'nouvelle', created_at: now, updated_at: now, client: cl, message, fluide: texte(b.fluide, 80), pression: texte(b.pression, 40),
          echeance: texte(b.echeance, 20), chantier: texte(b.chantier, 120), fichiers: (b.fichiers || []).slice(0, 10).map((f, i) => ({ id: `${num}-${i}`, nom: texte(f.nom, 120), taille: Math.round(String(f.base64 || '').length * 0.75) })) });
        ecrire();
        return reponse(201, { numero: num });
      }
      if (chemin === '/api/suivi' && m === 'POST') {
        const c = db.commandes.find(x => x.numero === texte(b.numero, 20).toUpperCase() && x.client.email === texte(b.email, 160).toLowerCase());
        if (!c) return erreur(404, 'Aucune commande avec ce numéro et cette adresse e-mail');
        return reponse(200, { numero: c.numero, statut: c.statut, created_at: c.created_at, historique: c.historique, lignes: c.lignes.map(l => ({ designation: l.designation, qte: l.qte, montant: l.montant })),
          ht: c.ht, ttc: c.ttc, delai: c.delai, suiviTransport: c.suiviTransport || '' });
      }
      if (chemin === '/api/admin/login' && m === 'POST') { db.session = true; ecrire(); return reponse(200, { ok: true }); }
      if (!db.session) return erreur(401, 'Connexion requise');
      if (chemin === '/api/admin/logout') { db.session = false; ecrire(); return reponse(200, { ok: true }); }
      if (chemin === '/api/admin/commandes' && m === 'GET') return reponse(200, db.commandes);
      if (chemin === '/api/admin/devis' && m === 'GET') return reponse(200, db.devis);
      let mm;
      if ((mm = chemin.match(/^\/api\/admin\/commandes\/(CMD-\d{4}-\d{4,})$/)) && m === 'PUT') {
        const c = db.commandes.find(x => x.numero === mm[1]);
        if (!c) return erreur(404, 'Commande introuvable');
        if (b.statut !== c.statut) c.historique.push({ statut: b.statut, date: maintenant() });
        Object.assign(c, { statut: b.statut, suiviTransport: texte(b.suiviTransport, 120), note: texte(b.note, 2000), updated_at: maintenant() });
        ecrire();
        return reponse(200, c);
      }
      if ((mm = chemin.match(/^\/api\/admin\/devis\/(DEV-\d{4}-\d{4,})$/)) && m === 'PUT') {
        const d = db.devis.find(x => x.numero === mm[1]);
        if (!d) return erreur(404, 'Demande introuvable');
        d.statut = b.statut; ecrire();
        return reponse(200, { ok: true });
      }
      return erreur(404, 'Introuvable');
    } catch (e) { return erreur(400, e.message); }
  }

  const fetchOrigine = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = (url, opts = {}) => (String(url).includes('api/') ? traiter(String(url), opts) : fetchOrigine(url, opts));
  window.DemoBoutique = { reinitialiser() { memoire = exemples(); ecrire(); } };
})();
