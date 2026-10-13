// Données de démonstration chargées au premier démarrage (base vide).
// Fichier partagé : utilisé par le serveur (Node.js) et par la version de démonstration en ligne (navigateur).
const uid = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
const isoDate = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

function demoData() {
  const today = new Date();
  const Y = today.getFullYear();
  const d = n => isoDate(addDays(today, n));
  const w = n => isoWeek(addDays(today, n * 7));

  const users = [
    { id: 'u1', nom: 'Claire Martin', role: 'charge', categorieId: '', tauxHoraire: 68, salaireHoraire: 0, capaciteHebdo: 35 },
    { id: 'u2', nom: 'Julien Bernard', role: 'charge', categorieId: '', tauxHoraire: 68, salaireHoraire: 0, capaciteHebdo: 35 },
    { id: 'o1', nom: 'Kevin Roux', role: 'atelier', categorieId: 'mo1', tauxHoraire: 37, salaireHoraire: 17.5, capaciteHebdo: 35 },
    { id: 'o2', nom: 'Ahmed Haddad', role: 'atelier', categorieId: 'mo1', tauxHoraire: 38, salaireHoraire: 18, capaciteHebdo: 35 },
    { id: 'o3', nom: 'Lucas Petit', role: 'atelier', categorieId: 'mo2', tauxHoraire: 33, salaireHoraire: 15.5, capaciteHebdo: 35 },
    { id: 'o4', nom: 'Romain Blanc', role: 'atelier', categorieId: 'mo2', tauxHoraire: 34, salaireHoraire: 16, capaciteHebdo: 35 },
    { id: 'o5', nom: 'Hugo Faure', role: 'atelier', categorieId: 'mo3', tauxHoraire: 33, salaireHoraire: 16.5, capaciteHebdo: 35 },
    { id: 'o6', nom: 'Émilie Caron', role: 'atelier', categorieId: 'mo4', tauxHoraire: 45, salaireHoraire: 20, capaciteHebdo: 35 },
  ];
  // Taux de main-d'œuvre : prix de vente et coût horaire moyen chargé par catégorie
  const mainoeuvre = [
    { id: 'mo1', code: 'SOUD', libelle: 'Soudeur (orbital / TIG)', tauxVente: 55, tauxCout: 38 },
    { id: 'mo2', code: 'MONT', libelle: 'Tuyauteur monteur', tauxVente: 48, tauxCout: 34 },
    { id: 'mo3', code: 'PREF', libelle: 'Préfabrication atelier', tauxVente: 46, tauxCout: 33 },
    { id: 'mo4', code: 'BE', libelle: "Bureau d'études / dessin", tauxVente: 62, tauxCout: 45 },
    { id: 'mo5', code: 'CHEF', libelle: 'Chef de chantier', tauxVente: 60, tauxCout: 45 },
  ];
  const zones = [
    { id: 'z1', nom: 'Zone 1 (< 50 km)', forfait: 120, prixParTonne: 25, coutTransporteur: 95, coutParTonne: 18 },
    { id: 'z2', nom: 'Zone 2 (50–150 km)', forfait: 240, prixParTonne: 40, coutTransporteur: 200, coutParTonne: 30 },
    { id: 'z3', nom: 'Zone 3 (> 150 km)', forfait: 420, prixParTonne: 60, coutTransporteur: 360, coutParTonne: 48 },
    { id: 'z0', nom: 'Enlèvement à l\'atelier', forfait: 0, prixParTonne: 0, coutTransporteur: 0, coutParTonne: 0 },
  ];
  // Bibliothèque des fournitures : prix d'achat (coutRevient), prix de vente, fournisseur habituel
  const articles = [
    { id: 'a1', ref: 'TUB-316-050', designation: 'Tube inox 316L DN50 sch10S', famille: 'Tubes', unite: 'ml', prixVente: 51, coutRevient: 41, poidsUnitaire: 4.1, fournisseurId: 'e5' },
    { id: 'a2', ref: 'TUB-316-100', designation: 'Tube inox 316L DN100 sch10S', famille: 'Tubes', unite: 'ml', prixVente: 103, coutRevient: 82, poidsUnitaire: 8.4, fournisseurId: 'e5' },
    { id: 'a3', ref: 'TUB-P235-150', designation: 'Tube acier P235GH DN150 ép. 4,5', famille: 'Tubes', unite: 'ml', prixVente: 57, coutRevient: 46, poidsUnitaire: 18.2, fournisseurId: 'e5' },
    { id: 'a4', ref: 'COU-316-050', designation: 'Coude 90° 3D inox 316L DN50', famille: 'Raccords', unite: 'u', prixVente: 26, coutRevient: 21, poidsUnitaire: 0.6, fournisseurId: 'e5' },
    { id: 'a5', ref: 'BRI-316-100', designation: 'Bride à collerette inox DN100 PN16', famille: 'Raccords', unite: 'u', prixVente: 82, coutRevient: 66, poidsUnitaire: 5.5, fournisseurId: 'e5' },
    { id: 'a6', ref: 'COU-P235-150', designation: 'Coude 90° acier P235GH DN150', famille: 'Raccords', unite: 'u', prixVente: 67, coutRevient: 54, poidsUnitaire: 7.9, fournisseurId: 'e5' },
    { id: 'a7', ref: 'VAN-PAP-050', designation: 'Vanne papillon DN50 PN16 à levier', famille: 'Robinetterie', unite: 'u', prixVente: 200, coutRevient: 160, poidsUnitaire: 3.2, fournisseurId: 'e6' },
    { id: 'a8', ref: 'SUP-RACK', designation: 'Supportage et colliers', famille: 'Supportage', unite: 'ml', prixVente: 12, coutRevient: 9, poidsUnitaire: 1.5, fournisseurId: 'e5' },
    { id: 'a11', ref: 'ECH-SEM', designation: 'Location échafaudage', famille: 'Location', unite: 'semaine', prixVente: 400, coutRevient: 320, poidsUnitaire: 0, fournisseurId: 'e7' },
    { id: 'a12', ref: 'CTRL-RX', designation: 'Contrôle radiographique de soudure (sous-traité)', famille: 'Contrôles', unite: 'u', prixVente: 80, coutRevient: 60, poidsUnitaire: 0, fournisseurId: 'e7' },
    { id: 'a13', ref: 'EPR-HYD', designation: 'Consommables épreuve hydraulique + PV', famille: 'Contrôles', unite: 'forfait', prixVente: 260, coutRevient: 120, poidsUnitaire: 0, fournisseurId: '' },
  ];
  const site = (id, libelle, adresse, cp, ville, facturation = false) => ({ id, libelle, adresse, cp, ville, facturation });
  const entreprises = [
    { id: 'e1', nom: 'Pétrochimie du Sud', categorie: 'Client', secteur: 'Pétrochimie', siret: '412 345 678 00021', tvaIntra: 'FR12412345678', tel: '04 91 00 00 00', email: 'achats@petrosud.example', web: 'petrosud.example', zoneId: 'z3',
      adresses: [site('s1', 'Siège social', '12 boulevard de la Mer', '13002', 'Marseille', true), site('s2', 'Site de Fos – unité de distillation', 'Route des Étangs', '13270', 'Fos-sur-Mer')] },
    { id: 'e2', nom: 'Laiterie des Alpes', categorie: 'Client', secteur: 'Agroalimentaire', siret: '521 987 654 00018', tvaIntra: 'FR45521987654', tel: '04 50 00 00 00', email: 'contact@laiterie-alpes.example', web: '', zoneId: 'z2',
      adresses: [site('s3', 'Siège', '3 rue du Lac', '74000', 'Annecy', true), site('s4', 'Usine de Rumilly', 'ZI de Madrid', '74150', 'Rumilly')] },
    { id: 'e3', nom: 'Pharmasynth', categorie: 'Client', secteur: 'Pharmacie', siret: '398 111 222 00035', tvaIntra: 'FR78398111222', tel: '04 72 00 00 00', email: 'maintenance@pharmasynth.example', web: '', zoneId: 'z1',
      adresses: [site('s5', 'Usine de Gerland – bâtiment B', '40 avenue Tony Garnier', '69007', 'Lyon', true)] },
    { id: 'e4', nom: 'Énergies Vallée du Rhône', categorie: 'Client', secteur: 'Énergie', siret: '803 444 555 00012', tvaIntra: 'FR33803444555', tel: '04 75 00 00 00', email: 'travaux@evr.example', web: '', zoneId: 'z2',
      adresses: [site('s6', 'Direction', '1 quai du Rhône', '26000', 'Valence', true), site('s7', 'Centrale de Saint-Vallier', 'Chemin de la Centrale', '26240', 'Saint-Vallier')] },
    { id: 'e5', nom: 'Inox Distribution Rhône-Alpes', categorie: 'Fournisseur', secteur: 'Négoce tubes et raccords', siret: '334 222 999 00044', tvaIntra: 'FR90334222999', tel: '04 78 11 11 11', email: 'commandes@inoxdistri.example', web: 'inoxdistri.example', zoneId: '',
      adresses: [site('s8', 'Agence de Vénissieux', '15 rue de l\'Industrie', '69200', 'Vénissieux', true)] },
    { id: 'e6', nom: 'Robinetterie Industrielle Alpes', categorie: 'Fournisseur', secteur: 'Robinetterie', siret: '445 666 777 00010', tvaIntra: 'FR21445666777', tel: '04 76 22 22 22', email: 'ventes@ria.example', web: '', zoneId: '',
      adresses: [site('s9', 'Siège et dépôt', '8 avenue des Alpes', '38000', 'Grenoble', true)] },
    { id: 'e7', nom: 'Services Industriels Rhône', categorie: 'Fournisseur', secteur: 'Sous-traitance', siret: '512 333 444 00027', tvaIntra: 'FR55512333444', tel: '04 78 33 33 33', email: 'planning@sir.example', web: '', zoneId: '',
      adresses: [site('s10', 'Agence de Saint-Fons', '22 rue de la Chimie', '69190', 'Saint-Fons', true)] },
  ];
  const contacts = [
    { id: 'k1', prenom: 'Marc', nom: 'Durand', fonction: 'Chargé de travaux', entrepriseId: 'e1', siteId: 's2', tel: '04 42 00 00 01', mobile: '06 10 00 00 01', email: 'm.durand@petrosud.example' },
    { id: 'k2', prenom: 'Sophie', nom: 'Lambert', fonction: 'Acheteuse', entrepriseId: 'e1', siteId: 's1', tel: '04 91 00 00 02', mobile: '', email: 's.lambert@petrosud.example' },
    { id: 'k3', prenom: 'Thomas', nom: 'Girard', fonction: 'Chargé de travaux', entrepriseId: 'e2', siteId: 's4', tel: '04 50 00 00 03', mobile: '06 10 00 00 03', email: 't.girard@laiterie-alpes.example' },
    { id: 'k4', prenom: 'Nadia', nom: 'Benali', fonction: 'Responsable maintenance', entrepriseId: 'e3', siteId: 's5', tel: '04 72 00 00 04', mobile: '06 10 00 00 04', email: 'n.benali@pharmasynth.example' },
    { id: 'k5', prenom: 'Pierre', nom: 'Morel', fonction: 'Chargé de travaux', entrepriseId: 'e4', siteId: 's7', tel: '04 75 00 00 05', mobile: '06 10 00 00 05', email: 'p.morel@evr.example' },
    { id: 'k6', prenom: 'Julie', nom: 'Fabre', fonction: 'Commerciale', entrepriseId: 'e5', siteId: 's8', tel: '04 78 11 11 12', mobile: '', email: 'j.fabre@inoxdistri.example' },
    { id: 'k8', prenom: 'Sandra', nom: 'Vidal', fonction: 'Responsable planning', entrepriseId: 'e7', siteId: 's10', tel: '04 78 33 33 34', mobile: '', email: 's.vidal@sir.example' },
    { id: 'k7', prenom: 'Luc', nom: 'Perrin', fonction: 'Technico-commercial', entrepriseId: 'e6', siteId: 's9', tel: '04 76 22 22 23', mobile: '06 10 00 00 07', email: 'l.perrin@ria.example' },
  ];
  // Composants d'ouvrage : fourniture (article × quantité par unité) ou main-d'œuvre (catégorie × heures par unité)
  const F = (aid, qte) => { const a = articles.find(x => x.id === aid); return { type: 'f', articleId: aid, designation: a.designation, unite: a.unite, qte, pu: a.prixVente, cout: a.coutRevient, poids: a.poidsUnitaire }; };
  const MO = (mid, heures) => { const m = mainoeuvre.find(x => x.id === mid); return { type: 'mo', moId: mid, libelle: m.libelle, heures, taux: m.tauxVente, cout: m.tauxCout }; };
  const chap = titre => ({ type: 'chapitre', titre });
  const ouv = (designation, unite, qte, composants) => ({ type: 'ouvrage', designation, unite, qte, composants });

  const affaires = [
    { id: 'af1', code: `CH-${Y}-` + '001', nom: 'Ligne NEP inox – Usine de Rumilly', clientId: 'e2', contactId: 'k3', siteId: 's4', chargeId: 'u1', statut: 'En cours', devisId: 'dv1', dateCreation: d(-50), heuresPrevues: 0, rex: { note: '', positif: '', negatif: '', actions: '' } },
    { id: 'af2', code: `CH-${Y}-` + '002', nom: 'Remplacement collecteur vapeur DN150', clientId: 'e1', contactId: 'k1', siteId: 's2', chargeId: 'u2', statut: 'Facturé', devisId: 'dv2', dateCreation: d(-110), heuresPrevues: 0, rex: { note: 3, positif: 'Préfabrication des tronçons en atelier, arrêt de l\'unité tenu en 5 jours.', negatif: '6 soudures reprises après contrôle RX (accès difficile en rack). Heures soudeurs dépassées.', actions: 'Prévoir 15 % de reprises sur les soudures en hauteur. Visite de site systématique avant chiffrage.' } },
    { id: 'af3', code: `CH-${Y}-` + '003', nom: 'Skid de dosage – bâtiment B', clientId: 'e3', contactId: 'k4', siteId: 's5', chargeId: 'u1', statut: 'Facturé', devisId: 'dv3', dateCreation: d(-85), heuresPrevues: 0, rex: { note: 4, positif: 'Skid préfabriqué à 90 % en atelier, montage en 3 jours.', negatif: 'Remise commerciale trop élevée.', actions: 'Plancher de remise à 8 % sur les skids.' } },
  ];
  const head = (af, chargeId, clientId, contactId, siteId) => ({ affaireId: af, chargeId, clientId, contactId, siteId });
  const devis = [
    { id: 'dv1', numero: `DV-${Y}-` + '0001', objet: 'Ligne NEP inox – Usine de Rumilly', ...head('af1', 'u1', 'e2', 'k3', 's4'), date: d(-55), validite: 30, statut: 'Accepté', zoneId: 'z2',
      ajustements: [{ libelle: 'Remise commerciale', pct: -5 }],
      lignes: [
        chap('Études et préparation'),
        ouv('Relevés sur site, isométriques et note de calcul', 'forfait', 1, [MO('mo4', 40)]),
        chap('Préfabrication en atelier'),
        ouv('Tuyauterie inox 316L DN50 préfabriquée', 'ml', 1200, [F('a1', 1.05), F('a4', 0.3), MO('mo3', 0.25), MO('mo1', 0.3)]),
        ouv('Tuyauterie inox 316L DN100 préfabriquée', 'ml', 300, [F('a2', 1.05), F('a5', 0.25), MO('mo3', 0.4), MO('mo1', 0.5)]),
        chap('Montage sur site'),
        ouv('Pose et supportage des lignes', 'ml', 1500, [F('a8', 1), MO('mo2', 0.35)]),
        ouv('Vanne papillon DN50 fournie et posée', 'u', 24, [F('a7', 1), MO('mo2', 0.5)]),
        chap('Contrôles et essais'),
        ouv('Épreuve hydraulique avec procès-verbal', 'forfait', 1, [F('a13', 1), MO('mo2', 8)]),
        ouv('Contrôle radiographique des soudures', 'u', 40, [F('a12', 1)]),
      ] },
    { id: 'dv2', numero: `DV-${Y}-` + '0002', objet: 'Remplacement collecteur vapeur DN150', ...head('af2', 'u2', 'e1', 'k1', 's2'), date: d(-115), validite: 60, statut: 'Accepté', zoneId: 'z3',
      ajustements: [{ libelle: 'Majoration travaux en hauteur', pct: 8 }],
      lignes: [
        chap('Préparation'),
        ouv('Visite, relevés et isométriques', 'forfait', 1, [MO('mo4', 16)]),
        chap('Fourniture et préfabrication'),
        ouv('Collecteur acier P235GH DN150 préfabriqué', 'ml', 180, [F('a3', 1.05), F('a6', 0.13), MO('mo3', 0.4), MO('mo1', 0.6)]),
        chap('Montage en rack'),
        ouv('Dépose ancien collecteur, pose et supportage', 'ml', 180, [F('a8', 1), MO('mo2', 0.8)]),
        ouv('Échafaudage', 'semaine', 2, [F('a11', 1)]),
        chap('Contrôles'),
        ouv('Contrôle radiographique des soudures', 'u', 40, [F('a12', 1)]),
        ouv('Épreuve hydraulique avec procès-verbal', 'forfait', 1, [F('a13', 1), MO('mo2', 8)]),
      ] },
    { id: 'dv3', numero: `DV-${Y}-` + '0003', objet: 'Skid de dosage – bâtiment B', ...head('af3', 'u1', 'e3', 'k4', 's5'), date: d(-88), validite: 30, statut: 'Accepté', zoneId: 'z1',
      ajustements: [{ libelle: 'Remise commerciale', pct: -12 }],
      lignes: [
        chap('Études'),
        ouv('Plans du skid et isométriques', 'forfait', 1, [MO('mo4', 24)]),
        chap('Skid préfabriqué'),
        ouv('Skid de dosage inox 316L complet', 'u', 1, [F('a1', 160), F('a4', 70), F('a7', 12), MO('mo3', 90), MO('mo1', 80)]),
        chap('Installation et documentation'),
        ouv('Mise en place et raccordement sur site', 'forfait', 1, [MO('mo2', 40)]),
        ouv('Dossier constructeur / DOE', 'forfait', 1, [MO('mo4', 14)]),
      ] },
    { id: 'dv4', numero: `DV-${Y}-` + '0004', objet: 'Modification réseau eau glacée', ...head('', 'u2', 'e4', 'k5', 's7'), date: d(-8), validite: 30, statut: 'Envoyé', zoneId: 'z2', ajustements: [],
      lignes: [
        chap('Tuyauterie'),
        ouv('Tuyauterie inox 316L DN100 fournie et posée', 'ml', 90, [F('a2', 1.05), F('a8', 1), MO('mo1', 0.3), MO('mo2', 0.6)]),
        ouv('Brides de raccordement DN100', 'u', 16, [F('a5', 1), MO('mo1', 0.5)]),
        chap('Essais'),
        ouv('Épreuve hydraulique avec procès-verbal', 'forfait', 1, [F('a13', 1), MO('mo2', 6)]),
      ] },
    { id: 'dv5', numero: `DV-${Y}-` + '0005', objet: 'Arrêt technique – lot tuyauterie', ...head('', 'u2', 'e1', 'k1', 's2'), date: d(-40), validite: 30, statut: 'Refusé', zoneId: 'z3',
      ajustements: [{ libelle: 'Remise commerciale', pct: -3 }],
      lignes: [
        ouv('Remplacement de lignes acier DN150', 'ml', 420, [F('a3', 1.05), F('a6', 0.15), MO('mo1', 0.9), MO('mo2', 0.7)]),
        ouv('Échafaudage', 'semaine', 4, [F('a11', 1)]),
      ] },
  ];
  const facture = (id, numero, dv, date, echeance, statut) => {
    const src = devis.find(x => x.id === dv);
    return { id, numero, devisId: dv, affaireId: src.affaireId, clientId: src.clientId, contactId: src.contactId, siteId: src.siteId, date, echeance, statut,
      lignes: JSON.parse(JSON.stringify(src.lignes)), ajustements: src.ajustements, zoneId: src.zoneId };
  };
  const factures = [
    facture('fa1', `FA-${Y}-` + '0001', 'dv2', d(-20), d(25), 'Payée'),
    facture('fa2', `FA-${Y}-` + '0002', 'dv3', d(-35), d(10), 'Émise'),
  ];
  // Commandes fournisseurs affectées aux chantiers
  const CL = (aid, qte, pu) => { const a = articles.find(x => x.id === aid); return { articleId: aid, designation: a.designation, unite: a.unite, qte, pu: pu ?? a.coutRevient }; };
  const commandes = [
    { id: 'cf1', numero: `CF-${Y}-` + '0001', fournisseurId: 'e5', affaireId: 'af1', date: d(-45), dateLivraison: d(-38), statut: 'Réceptionnée', lignes: [CL('a1', 1300), CL('a2', 320), CL('a4', 380), CL('a5', 80)] },
    { id: 'cf2', numero: `CF-${Y}-` + '0002', fournisseurId: 'e6', affaireId: 'af1', date: d(-30), dateLivraison: d(5), statut: 'Envoyée', lignes: [CL('a7', 24, 158)] },
    { id: 'cf3', numero: `CF-${Y}-` + '0003', fournisseurId: 'e5', affaireId: 'af2', date: d(-105), dateLivraison: d(-98), statut: 'Réceptionnée', lignes: [CL('a3', 195), CL('a6', 26), CL('a8', 180)] },
    { id: 'cf6', numero: `CF-${Y}-` + '0006', fournisseurId: 'e7', affaireId: 'af2', date: d(-104), dateLivraison: d(-100), statut: 'Réceptionnée', lignes: [CL('a11', 3), CL('a12', 46)] },
    { id: 'cf4', numero: `CF-${Y}-` + '0004', fournisseurId: 'e5', affaireId: 'af3', date: d(-80), dateLivraison: d(-74), statut: 'Réceptionnée', lignes: [CL('a1', 170), CL('a4', 72)] },
    { id: 'cf5', numero: `CF-${Y}-` + '0005', fournisseurId: 'e6', affaireId: 'af3', date: d(-80), dateLivraison: d(-70), statut: 'Réceptionnée', lignes: [CL('a7', 12, 165)] },
  ];
  const planning = [];
  const temps = [];
  // Planning : 6 semaines glissantes sur la ligne NEP
  for (let i = -2; i <= 3; i++) {
    planning.push({ id: uid(), affaireId: 'af1', userId: 'o5', semaine: w(i), heuresPrevues: 35, libelle: 'Préfabrication des lignes' });
    planning.push({ id: uid(), affaireId: 'af1', userId: 'o1', semaine: w(i), heuresPrevues: 35, libelle: 'Soudure orbitale' });
    planning.push({ id: uid(), affaireId: 'af1', userId: 'o2', semaine: w(i), heuresPrevues: i === 1 ? 42 : 35, libelle: 'Soudure orbitale' });
    if (i >= 0) {
      planning.push({ id: uid(), affaireId: 'af1', userId: 'o3', semaine: w(i), heuresPrevues: 35, libelle: 'Montage sur site' });
      planning.push({ id: uid(), affaireId: 'af1', userId: 'o4', semaine: w(i), heuresPrevues: 35, libelle: 'Montage sur site' });
    }
  }
  planning.push({ id: uid(), affaireId: 'af1', userId: 'u1', semaine: w(0), heuresPrevues: 6, libelle: 'Suivi chantier' });

  // Pointages des opérateurs (jours ouvrés uniquement) : arrivée, départ, pause
  const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const pointe = (aid, uidv, offset, h, tache) => {
    const day = addDays(today, offset).getDay();
    if (day === 0 || day === 6) return;
    const debut = 7 * 60 + 30, pause = h > 6 ? 60 : 0;
    temps.push({ id: uid(), affaireId: aid, userId: uidv, date: d(offset), heures: h, debut: hhmm(debut), fin: hhmm(debut + h * 60 + pause), pause, tache });
  };
  for (let i = 1; i <= 21; i++) {
    pointe('af1', 'o5', -i, 8, 'Préfabrication');
    pointe('af1', 'o1', -i, 8, 'Soudure');
    pointe('af1', 'o2', -i, i % 5 === 0 ? 7 : 9, 'Soudure'); // heures supplémentaires
    if (i <= 8) { pointe('af1', 'o3', -i, 8, 'Montage'); pointe('af1', 'o4', -i, 8, 'Montage'); }
  }
  for (let i = 0; i < 8; i++) pointe('af1', 'o6', -48 + i, 7, 'Isométriques');
  // CH-002 : dépassement d'heures soudeurs (REX)
  for (let i = 0; i < 12; i++) pointe('af2', 'o5', -112 + i, 8, 'Préfabrication des tronçons');
  for (let i = 0; i < 22; i++) pointe('af2', 'o1', -106 + i, 9, 'Soudure + reprises RX');
  for (let i = 0; i < 8; i++) pointe('af2', 'o4', -92 + i, 8, 'Montage en rack');
  for (let i = 0; i < 22; i++) { pointe('af2', 'o3', -104 + i, 8, 'Montage en rack'); }
  for (let i = 0; i < 3; i++) pointe('af2', 'o6', -112 + i, 6, 'Relevés');
  // CH-003 : dans le budget
  for (let i = 0; i < 16; i++) { pointe('af3', 'o5', -82 + i, 8, 'Préfabrication skid'); pointe('af3', 'o2', -82 + i, 7, 'Soudure'); }
  for (let i = 0; i < 5; i++) pointe('af3', 'o4', -66 + i, 8, 'Montage');
  for (let i = 0; i < 5; i++) pointe('af3', 'o6', -86 + i, 7, 'Plans et DOE');

  return {
    settings: { societe: 'Pipe-Fit Industrie', adresse: 'ZI des Forges – 69800 Saint-Priest', siret: '000 000 000 00000', tva: 20, tauxHoraireDefaut: 58, delaiPaiement: 45, dureeHebdo: 35, seuilHS50: 43 },
    users, mainoeuvre, zones, articles, entreprises, contacts, affaires, devis, commandes, factures, planning, temps,
  };
}

if (typeof module !== 'undefined') module.exports = { demoData, uid };
