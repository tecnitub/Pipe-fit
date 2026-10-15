// Données de démonstration chargées au premier démarrage (base vide).
// Fichier partagé : utilisé par le serveur (Node.js) et par la version de démonstration en ligne (navigateur).
const IMAGES = typeof DEMO_IMAGES !== 'undefined' ? DEMO_IMAGES : require('./demo-images');
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
    { id: 'u1', nom: 'Claire Martin', role: 'charge', categorieId: '', tauxHoraire: 68, salaireHoraire: 0, capaciteHebdo: 35, email: 'c.martin@pipefit.example', tel: '06 20 00 00 01' },
    { id: 'u2', nom: 'Julien Bernard', role: 'charge', categorieId: '', tauxHoraire: 68, salaireHoraire: 0, capaciteHebdo: 35, email: 'j.bernard@pipefit.example', tel: '06 20 00 00 02' },
    { id: 'o1', nom: 'Kevin Roux', role: 'atelier', categorieId: 'mo1', tauxHoraire: 37, salaireHoraire: 17.5, capaciteHebdo: 35 },
    { id: 'o2', nom: 'Ahmed Haddad', role: 'atelier', categorieId: 'mo1', tauxHoraire: 38, salaireHoraire: 18, capaciteHebdo: 35 },
    { id: 'o3', nom: 'Lucas Petit', role: 'atelier', categorieId: 'mo2', tauxHoraire: 33, salaireHoraire: 15.5, capaciteHebdo: 35 },
    { id: 'o4', nom: 'Romain Blanc', role: 'atelier', categorieId: 'mo2', tauxHoraire: 34, salaireHoraire: 16, capaciteHebdo: 35 },
    { id: 'o5', nom: 'Hugo Faure', role: 'atelier', categorieId: 'mo3', tauxHoraire: 33, salaireHoraire: 16.5, capaciteHebdo: 35 },
    { id: 'o6', nom: 'Émilie Caron', role: 'atelier', categorieId: 'mo4', tauxHoraire: 45, salaireHoraire: 20, capaciteHebdo: 35 },
    // Intérimaires sous les ordres de Lucas Petit (chef d'équipe) ; coût = taux facturé par l'agence
    { id: 'i1', nom: 'Yanis Morel', role: 'atelier', type: 'interimaire', agenceId: 'e8', chefId: 'o3', categorieId: 'mo2', tauxHoraire: 36, salaireHoraire: 0, capaciteHebdo: 35 },
    { id: 'i2', nom: 'Damien Leroy', role: 'atelier', type: 'interimaire', agenceId: 'e8', chefId: 'o3', categorieId: 'mo1', tauxHoraire: 41, salaireHoraire: 0, capaciteHebdo: 35 },
  ];
  users.forEach(u => { u.type = u.type || 'salarie'; u.chefId = u.chefId || ''; u.agenceId = u.agenceId || ''; });
  users.find(u => u.id === 'o4').chefId = 'o3';
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
    { id: 'a14', ref: 'TEE-316-050', designation: 'Té égal inox 316L DN50 à souder', famille: 'Raccords', unite: 'u', prixVente: 38, coutRevient: 30, poidsUnitaire: 0.8, fournisseurId: 'e5' },
    { id: 'a15', ref: 'RED-316-100', designation: 'Réduction concentrique inox 316L DN100×50', famille: 'Raccords', unite: 'u', prixVente: 44, coutRevient: 35, poidsUnitaire: 0.9, fournisseurId: 'e5' },
    { id: 'a16', ref: 'BRI-316-050', designation: 'Bride à collerette inox DN50 PN16', famille: 'Raccords', unite: 'u', prixVente: 41, coutRevient: 33, poidsUnitaire: 2.1, fournisseurId: 'e5' },
    { id: 'a17', ref: 'COU-316-100', designation: 'Coude 90° 3D inox 316L DN100', famille: 'Raccords', unite: 'u', prixVente: 74, coutRevient: 59, poidsUnitaire: 2.4, fournisseurId: 'e5' },
    { id: 'a18', ref: 'TEE-316-100', designation: 'Té égal inox 316L DN100 à souder', famille: 'Raccords', unite: 'u', prixVente: 96, coutRevient: 77, poidsUnitaire: 2.9, fournisseurId: 'e5' },
    { id: 'a11', ref: 'ECH-SEM', designation: 'Location échafaudage', famille: 'Location', unite: 'semaine', prixVente: 400, coutRevient: 320, poidsUnitaire: 0, fournisseurId: 'e7' },
    { id: 'a12', ref: 'CTRL-RX', designation: 'Contrôle radiographique de soudure (sous-traité)', famille: 'Contrôles', unite: 'u', prixVente: 80, coutRevient: 60, poidsUnitaire: 0, fournisseurId: 'e7' },
    { id: 'a13', ref: 'EPR-HYD', designation: 'Consommables épreuve hydraulique + PV', famille: 'Contrôles', unite: 'forfait', prixVente: 260, coutRevient: 120, poidsUnitaire: 0, fournisseurId: '' },
  ];
  const site = (id, libelle, adresse, cp, ville, facturation = false) => ({ id, libelle, adresse, cp, ville, facturation });
  const entreprises = [
    { id: 'e1', nom: 'Pétrochimie du Sud', compteComptable: 'CPETROSUD', categorie: 'Client', secteur: 'Pétrochimie', siret: '412 345 678 00021', tvaIntra: 'FR12412345678', tel: '04 91 00 00 00', email: 'achats@petrosud.example', web: 'petrosud.example', zoneId: 'z3',
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
    { id: 'e10', nom: 'Papeterie du Dauphiné', categorie: 'Client', secteur: 'Papeterie', siret: '398 765 432 00015', tvaIntra: 'FR11398765432', tel: '04 76 00 00 01', email: 'maintenance@pdd.example', web: '', zoneId: 'z1',
      adresses: [site('s13', 'Siège', '2 rue du Papier', '38500', 'Voiron', true), site('s14', 'Usine de Rives – machine à papier PM2', 'Route de Lyon', '38140', 'Rives')] },
    { id: 'e8', nom: 'Intérim Industrie Rhône', categorie: 'Fournisseur', secteur: 'Travail temporaire', siret: '611 222 333 00019', tvaIntra: 'FR40611222333', tel: '04 72 44 44 44', email: 'lyon@interim-ir.example', web: '', zoneId: '',
      adresses: [site('s11', 'Agence de Lyon 7e', '5 avenue Jean Jaurès', '69007', 'Lyon', true)] },
    { id: 'e11', nom: 'Descours & Cabot', categorie: 'Fournisseur', secteur: 'Négoce tubes et raccords', siret: '957 200 000 01234', tvaIntra: 'FR10957200000', tel: '04 72 66 66 66', email: 'agence.lyon@descours-cabot.example', web: '', zoneId: '',
      adresses: [site('s15', 'Agence de Saint-Priest', 'Rue de l\'Industrie', '69800', 'Saint-Priest', true)] },
    { id: 'e12', nom: 'Téréva', categorie: 'Fournisseur', secteur: 'Négoce tubes et raccords', siret: '338 200 000 04321', tvaIntra: 'FR22338200000', tel: '04 76 77 77 77', email: 'voiron@tereva.example', web: '', zoneId: '',
      adresses: [site('s16', 'Agence de Voiron', 'ZA de Centr\'Alp', '38500', 'Voiron', true)] },
    { id: 'e9', nom: 'Ingénierie Process Alpes', categorie: "Maîtrise d'œuvre", secteur: 'Ingénierie', siret: '723 555 666 00031', tvaIntra: 'FR62723555666', tel: '04 50 55 55 55', email: 'contact@ipa.example', web: '', zoneId: '',
      adresses: [site('s12', 'Bureau d\'Annecy', '9 rue des Ingénieurs', '74000', 'Annecy', true)] },
    { id: 'e7', nom: 'Services Industriels Rhône', categorie: 'Fournisseur', secteur: 'Sous-traitance', siret: '512 333 444 00027', tvaIntra: 'FR55512333444', tel: '04 78 33 33 33', email: 'planning@sir.example', web: '', zoneId: '',
      adresses: [site('s10', 'Agence de Saint-Fons', '22 rue de la Chimie', '69190', 'Saint-Fons', true)] },
  ];
  const contacts = [
    { id: 'k1', civilite: 'Monsieur', prenom: 'Marc', nom: 'Durand', fonction: 'Chargé de travaux', entrepriseId: 'e1', siteId: 's2', tel: '04 42 00 00 01', mobile: '06 10 00 00 01', email: 'm.durand@petrosud.example' },
    { id: 'k2', civilite: 'Madame', prenom: 'Sophie', nom: 'Lambert', fonction: 'Acheteuse', entrepriseId: 'e1', siteId: 's1', tel: '04 91 00 00 02', mobile: '', email: 's.lambert@petrosud.example' },
    { id: 'k3', civilite: 'Monsieur', prenom: 'Thomas', nom: 'Girard', fonction: 'Chargé de travaux', entrepriseId: 'e2', siteId: 's4', tel: '04 50 00 00 03', mobile: '06 10 00 00 03', email: 't.girard@laiterie-alpes.example' },
    { id: 'k4', civilite: 'Madame', prenom: 'Nadia', nom: 'Benali', fonction: 'Responsable maintenance', entrepriseId: 'e3', siteId: 's5', tel: '04 72 00 00 04', mobile: '06 10 00 00 04', email: 'n.benali@pharmasynth.example' },
    { id: 'k5', civilite: 'Monsieur', prenom: 'Pierre', nom: 'Morel', fonction: 'Chargé de travaux', entrepriseId: 'e4', siteId: 's7', tel: '04 75 00 00 05', mobile: '06 10 00 00 05', email: 'p.morel@evr.example' },
    { id: 'k6', civilite: 'Madame', prenom: 'Julie', nom: 'Fabre', fonction: 'Commerciale', entrepriseId: 'e5', siteId: 's8', tel: '04 78 11 11 12', mobile: '', email: 'j.fabre@inoxdistri.example' },
    { id: 'k8', civilite: 'Madame', prenom: 'Sandra', nom: 'Vidal', fonction: 'Responsable planning', entrepriseId: 'e7', siteId: 's10', tel: '04 78 33 33 34', mobile: '', email: 's.vidal@sir.example' },
    { id: 'k10', civilite: 'Monsieur', prenom: 'Jérôme', nom: 'Faure', fonction: 'Responsable maintenance PM2', entrepriseId: 'e10', siteId: 's14', tel: '04 76 00 00 12', mobile: '06 11 22 33 44', email: 'j.faure@pdd.example' },
    { id: 'k9', civilite: 'Madame', prenom: 'Camille', nom: 'Rousset', fonction: "Maître d'œuvre (OPC)", entrepriseId: 'e9', siteId: 's12', tel: '04 50 55 55 56', mobile: '06 10 00 00 09', email: 'c.rousset@ipa.example' },
    { id: 'k7', civilite: 'Monsieur', prenom: 'Luc', nom: 'Perrin', fonction: 'Technico-commercial', entrepriseId: 'e6', siteId: 's9', tel: '04 76 22 22 23', mobile: '06 10 00 00 07', email: 'l.perrin@ria.example' },
  ];
  // Composants d'ouvrage : fourniture (article × quantité par unité) ou main-d'œuvre (catégorie × heures par unité)
  const F = (aid, qte) => { const a = articles.find(x => x.id === aid); return { type: 'f', articleId: aid, designation: a.designation, unite: a.unite, qte, pu: a.prixVente, cout: a.coutRevient, poids: a.poidsUnitaire }; };
  const MO = (mid, heures) => { const m = mainoeuvre.find(x => x.id === mid); return { type: 'mo', moId: mid, libelle: m.libelle, heures, taux: m.tauxVente, cout: m.tauxCout }; };
  const chap = titre => ({ type: 'chapitre', titre });
  const ouv = (designation, unite, qte, composants) => ({ type: 'ouvrage', designation, unite, qte, composants });

  const affaires = [
    { id: 'af1', code: `CH-${Y}-` + '001', nom: 'Ligne NEP inox – Usine de Rumilly', clientId: 'e2', contactId: 'k3', siteId: 's4', moeId: 'e9', moeContactId: 'k9', retenueGarantie: 5, caution: '', chargeId: 'u1', statut: 'En cours', devisId: 'dv1', dateCreation: d(-50), heuresPrevues: 0, rex: { note: '', positif: '', negatif: '', actions: '' } },
    { id: 'af2', code: `CH-${Y}-` + '002', nom: 'Remplacement collecteur vapeur DN150', clientId: 'e1', contactId: 'k1', siteId: 's2', retenueGarantie: 5, caution: '', dateReception: d(-24), okFacturation: true, chargeId: 'u2', statut: 'Facturé', devisId: 'dv2', dateCreation: d(-110), heuresPrevues: 0, rex: { note: 3, positif: 'Préfabrication des tronçons en atelier, arrêt de l\'unité tenu en 5 jours.', negatif: '6 soudures reprises après contrôle RX (accès difficile en rack). Heures soudeurs dépassées.', actions: 'Prévoir 15 % de reprises sur les soudures en hauteur. Visite de site systématique avant chiffrage.' } },
    { id: 'af3', code: `CH-${Y}-` + '003', nom: 'Skid de dosage – bâtiment B', clientId: 'e3', contactId: 'k4', siteId: 's5', chargeId: 'u1', statut: 'Facturé', devisId: 'dv3', dateReception: d(-66), okFacturation: true, dateCreation: d(-85), heuresPrevues: 0, rex: { note: 4, positif: 'Skid préfabriqué à 90 % en atelier, montage en 3 jours.', negatif: 'Remise commerciale trop élevée.', actions: 'Plancher de remise à 8 % sur les skids.' } },
    // Interventions hors devis (travaux en régie sur demande du client)
    { id: 'hd1', type: 'horsDevis', code: `HD-${Y}-` + '001', nom: 'Machine à papier PM2 – remplacement du collecteur de purge', clientId: 'e10', contactId: 'k10', siteId: 's14', chargeId: 'u1', statut: 'Terminé', dateCreation: d(-12),
      demande: 'Fuite sur le collecteur de purge DN50 de la sécherie : préfabriquer un collecteur neuf à l\'atelier et le poser pendant l\'arrêt du jeudi.', heuresPrevues: 0, rex: {} },
    { id: 'hd2', type: 'horsDevis', code: `HD-${Y}-` + '002', nom: 'Dépannage fuite vapeur ligne 3', clientId: 'e1', contactId: 'k1', siteId: 's2', chargeId: 'u2', statut: 'Ouvert', dateCreation: d(-1),
      demande: 'Fuite sur bride DN100 de la ligne vapeur 3, intervention demandée par M. Durand.', heuresPrevues: 0, rex: {} },
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
    // Devis structuré : chapitres / sous-chapitres / sous-sous-chapitres numérotés automatiquement, textes, image, poste libre
    { id: 'dv4', numero: `DV-${Y}-` + '0004', objet: 'Modification réseau eau glacée', ...head('', 'u2', 'e4', 'k5', 's7'), date: d(-8), validite: 30, statut: 'Envoyé', zoneId: 'z2', ajustements: [], numAuto: true,
      lignes: [
        { type: 'texte', texte: 'Suite à notre visite du local technique, nous vous proposons la modification du réseau d\'eau glacée entre la production et la nouvelle centrale de traitement d\'air.' },
        chap('Tuyauterie'),
        { type: 'chapitre', niveau: 2, titre: 'Réseau principal DN100' },
        ouv('Tuyauterie inox 316L DN100 fournie et posée', 'ml', 90, [F('a2', 1.05), F('a8', 1), MO('mo1', 0.3), MO('mo2', 0.6)]),
        { type: 'chapitre', niveau: 3, titre: 'Raccordements' },
        ouv('Brides de raccordement DN100', 'u', 16, [F('a5', 1), MO('mo1', 0.5)]),
        { type: 'image', imageId: 'img-rack1', legende: 'Cheminement existant en rack (relevé de visite)', largeur: 'moyenne' },
        { type: 'chapitre', niveau: 2, titre: 'Piquages et dérivations DN50' },
        ouv('Piquage DN50 sur collecteur, vanne d\'isolement comprise', 'u', 4, [F('a14', 1), F('a1', 1.5), F('a7', 1), MO('mo1', 2), MO('mo2', 1.5)]),
        { type: 'ouvrage', libre: true, designation: 'Dépose et évacuation de l\'ancienne tuyauterie acier', detail: 'Y compris découpe, manutention et benne de tri des métaux.', unite: 'forfait', qte: 1,
          composants: [{ type: 'f', designation: 'Location benne métaux 10 m³', unite: 'u', qte: 1, pu: 380, cout: 290, poids: 0 }, MO('mo2', 14)] },
        chap('Essais'),
        ouv('Épreuve hydraulique avec procès-verbal', 'forfait', 1, [F('a13', 1), MO('mo2', 6)]),
        { type: 'texte', texte: 'Non compris : calorifuge, génie civil, raccordement électrique de la centrale.' },
      ] },
    { id: 'dv5', numero: `DV-${Y}-` + '0005', objet: 'Arrêt technique – lot tuyauterie', ...head('', 'u2', 'e1', 'k1', 's2'), date: d(-40), validite: 30, statut: 'Refusé', motifRefus: 'Concurrent retenu', commentaireRefus: 'Écart de 12 % avec le concurrent retenu (prix fournitures).', dateRefus: d(-20), zoneId: 'z3',
      ajustements: [{ libelle: 'Remise commerciale', pct: -3 }],
      lignes: [
        ouv('Remplacement de lignes acier DN150', 'ml', 420, [F('a3', 1.05), F('a6', 0.15), MO('mo1', 0.9), MO('mo2', 0.7)]),
        ouv('Échafaudage', 'semaine', 4, [F('a11', 1)]),
      ] },
  ];
  // Situations de travaux : proposition d'avancement (BL) à la maîtrise d'œuvre, puis facture une fois acceptée
  const lineHT = l => l.qte * l.composants.reduce((t, c) => t + (c.type === 'mo' ? c.heures * c.taux : c.qte * c.pu), 0);
  const livraisonDevis = dv => {
    const z = zones.find(x => x.id === dv.zoneId); if (!z) return 0;
    const poids = dv.lignes.filter(l => l.type !== 'chapitre').reduce((t, l) => t + l.qte * l.composants.reduce((p, c) => p + (c.type === 'mo' ? 0 : c.qte * (c.poids || 0)), 0), 0);
    return z.forfait + z.prixParTonne * poids / 1000;
  };
  const r2 = v => Math.round(v * 100) / 100;
  const situations = [], factures = [];
  const situation = (id, numero, dvId, date, pctFn, statut, factureNum, fDate, fEch, fStatut) => {
    const dv = devis.find(x => x.id === dvId);
    const brut = dv.lignes.filter(l => l.type !== 'chapitre').reduce((t, l) => t + lineHT(l), 0);
    const ratio = 1 + dv.ajustements.reduce((t, x) => t + x.pct, 0) / 100;
    const prev = situations.filter(x => x.devisId === dvId && x.statut === 'Acceptée').pop();
    const av = {}, lignes = [];
    dv.lignes.forEach((l, i) => {
      if (l.type === 'chapitre') { lignes.push({ type: 'chapitre', titre: l.titre }); return; }
      const p = pctFn(l, i), before = prev ? (prev.avancements[i] || 0) : 0;
      av[i] = p;
      if (p !== before) lignes.push({ designation: `${l.designation} – avancement ${before} % → ${p} %`, unite: '', qte: 1, pu: r2(lineHT(l) * ratio * (p - before) / 100) });
    });
    const liv = livraisonDevis(dv), pl = pctFn({}, 'liv'), bl = prev ? (prev.avancements.liv || 0) : 0;
    av.liv = pl;
    if (liv && pl !== bl) lignes.push({ designation: `Transport / livraison – avancement ${bl} % → ${pl} %`, unite: '', qte: 1, pu: r2(liv * (pl - bl) / 100) });
    const sit = { id, numero: `BL-${Y}-` + numero, affaireId: dv.affaireId, devisId: dvId, date, statut, avancements: av, factureId: '', commentaire: '' };
    situations.push(sit);
    if (factureNum) {
      const fid = 'fa' + numero;
      sit.factureId = fid;
      factures.push({ id: fid, numero: `FA-${Y}-` + factureNum, situationId: id, devisId: dvId, affaireId: dv.affaireId, clientId: dv.clientId, contactId: dv.contactId, siteId: dv.siteId, chargeId: dv.chargeId,
        objet: `${dv.objet} – situation n° ${situations.filter(x => x.devisId === dvId).length}`, date: fDate, echeance: fEch, statut: fStatut,
        retenuePct: (affaires.find(a => a.id === dv.affaireId) || {}).retenueGarantie || 0, lignes: lignes.filter((l, k, arr) => l.type !== 'chapitre' || (arr[k + 1] && arr[k + 1].type !== 'chapitre')), ajustements: [], zoneId: '' });
    }
    return sit;
  };
  situation('sit1', '0001', 'dv2', d(-24), () => 100, 'Acceptée', '0001', d(-20), d(25), 'Payée');
  situation('sit2', '0002', 'dv3', d(-38), () => 100, 'Acceptée', '0002', d(-35), d(10), 'Émise');
  // Ligne NEP : situation 1 acceptée et facturée, situation 2 proposée à la maîtrise d'œuvre
  const nep1 = (l, i) => ({ 1: 100, 3: 30, 4: 20, 6: 0, 7: 0, 9: 0, 10: 0, liv: 50 }[i] ?? 0);
  const nep2 = (l, i) => ({ 1: 100, 3: 55, 4: 45, 6: 15, 7: 0, 9: 0, 10: 0, liv: 100 }[i] ?? 0);
  situation('sit3', '0003', 'dv1', d(-12), nep1, 'Acceptée', '0003', d(-9), d(36), 'Émise');
  situation('sit4', '0004', 'dv1', d(-2), nep2, 'Proposée');
  // Avoir partiel sur la facture de la situation 2 (réfaction après réserve)
  const fa2 = factures.find(f => f.id === 'fa0002');
  if (fa2) factures.push({ ...fa2, id: 'av0001', type: 'avoir', numero: `AV-${Y}-0001`, factureId: 'fa0002', situationId: '', date: d(-8), echeance: '', statut: 'Imputé',
    motif: 'Réfaction suite à réserve (calorifuge repris par le client)', objet: `Avoir sur facture FA-${Y}-0002 – ${fa2.objet}`,
    lignes: [{ designation: 'Réfaction : reprise du calorifuge par le client', unite: 'forfait', qte: 1, pu: 650 }] });
  factures.filter(f => f.statut === 'Payée').forEach(f => { f.exportCompta = { date: d(-15), par: 'Administrateur', lot: 'Excel' }; });
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
  // Consultation fournisseurs en cours : 3 négoces consultés, 2 offres reçues
  const consultations = [{ id: 'cs1', ref: `CS-${Y}-0001`, objet: 'Raccords inox DN50 / DN100 – complément ligne NEP', affaireId: 'af1', date: d(-6), dateLimite: d(2), dateLivraison: d(14), statut: 'En cours',
    lignes: [{ articleId: 'a4', designation: 'Coude 90° 3D inox 316L DN50', unite: 'u', qte: 40 }, { articleId: 'a14', designation: 'Té égal inox 316L DN50 à souder', unite: 'u', qte: 12 },
      { articleId: 'a17', designation: 'Coude 90° 3D inox 316L DN100', unite: 'u', qte: 16 }, { articleId: 'a16', designation: 'Bride à collerette inox DN50 PN16', unite: 'u', qte: 10 }],
    fournisseurs: [
      { entrepriseId: 'e5', statut: 'Offre reçue', envoyeLe: d(-6), offre: { date: d(-3), prix: { 0: 20.5, 1: 29.4, 2: 61, 3: 32 }, remise: 3, port: 45, delai: 8, validite: d(30), remarques: 'Coudes DN100 en 3 semaines' } },
      { entrepriseId: 'e11', statut: 'Offre reçue', envoyeLe: d(-6), offre: { date: d(-2), prix: { 0: 19.9, 1: 31.2, 2: 57.5 }, remise: 0, port: 0, delai: 5, validite: d(20), remarques: 'Brides non disponibles' } },
      { entrepriseId: 'e12', statut: 'Consulté', envoyeLe: d(-6) }] }];
  // Familles CAO (Revit) reliées à la bibliothèque : article par diamètre, soudures, temps de préfabrication et de pose
  const familles = [
    { id: 'fa1', nom: 'Tuyau', alias: 'Canalisation, Pipe, Tube inox', categorie: 'tube', unite: 'ml', soudures: 0, tempsPrefab: 0, tempsPose: 0, declinaisons: [{ dn: 50, articleId: 'a1' }, { dn: 100, articleId: 'a2' }, { dn: 150, articleId: 'a3' }] },
    { id: 'fa2', nom: 'Coude - Soudé', alias: 'Coude 90, Coude', categorie: 'raccord', unite: 'u', soudures: 2, tempsPrefab: 0.1, tempsPose: 0, declinaisons: [{ dn: 50, articleId: 'a4' }, { dn: 100, articleId: 'a17' }, { dn: 150, articleId: 'a6' }] },
    { id: 'fa3', nom: 'Té - Soudé', alias: 'Té égal, Té', categorie: 'raccord', unite: 'u', soudures: 3, tempsPrefab: 0.15, tempsPose: 0, declinaisons: [{ dn: 50, articleId: 'a14' }, { dn: 100, articleId: 'a18' }] },
    { id: 'fa4', nom: 'Bride à collerette', alias: 'Bride', categorie: 'raccord', unite: 'u', soudures: 1, tempsPrefab: 0.1, tempsPose: 0.3, declinaisons: [{ dn: 50, articleId: 'a16' }, { dn: 100, articleId: 'a5' }] },
    { id: 'fa5', nom: 'Réduction concentrique', alias: 'Réduction', categorie: 'raccord', unite: 'u', soudures: 2, tempsPrefab: 0.1, tempsPose: 0, declinaisons: [{ dn: 100, articleId: 'a15', soudures: 2 }] },
    { id: 'fa6', nom: 'Vanne papillon', alias: 'Robinet papillon', categorie: 'robinetterie', unite: 'u', soudures: 0, tempsPrefab: 0, tempsPose: 0, declinaisons: [{ dn: 50, articleId: 'a7' }] },
    { id: 'fa7', nom: 'Support de tuyauterie', alias: 'Supportage, Collier', categorie: 'autre', unite: 'ml', soudures: 0, tempsPrefab: 0.1, tempsPose: 0.2, declinaisons: [{ dn: 0, articleId: 'a8' }] },
  ];
  // Factures fournisseurs : rapprochement de commandes et achats au comptoir imputés aux chantiers
  const achats = [
    { id: 'ff1', ref: `FF-${Y}-0001`, fournisseurId: 'e5', numeroFournisseur: 'IDRA-2026-08841', date: d(-36), echeance: d(9), montantHT: 0, montantTVA: '', statut: 'À payer',
      notes: 'Livraison de la commande CF-0001 ; hausse inox appliquée sur les tubes.', imputations: [{ affaireId: 'af1', commandeId: 'cf1', libelle: 'Commande CF-0001 (tubes et coudes inox)', montantHT: 0 }] },
    { id: 'ff2', ref: `FF-${Y}-0002`, fournisseurId: 'e11', numeroFournisseur: 'DC-R-0925-1187', date: d(-12), echeance: d(33), montantHT: 1342.6, montantTVA: '', statut: 'À payer',
      notes: 'Relevé mensuel des achats comptoir (tickets avec n° de chantier).', imputations: [
        { affaireId: 'af1', commandeId: '', libelle: 'Raccords inox, joints et colliers (tickets 4512, 4538)', montantHT: 486.4 },
        { affaireId: 'hd2', commandeId: '', libelle: 'Joints graphite et boulonnerie inox (ticket 4561)', montantHT: 124.8 },
        { affaireId: 'af3', commandeId: '', libelle: 'Vannes à boisseau DN25 (ticket 4402)', montantHT: 389 }] },
    { id: 'ff3', ref: `FF-${Y}-0003`, fournisseurId: 'e12', numeroFournisseur: 'TV-77120', date: d(-4), echeance: d(41), montantHT: 268.35, montantTVA: '', statut: 'À payer',
      notes: 'Comptoir de Voiron, intervention PM2.', imputations: [] },
  ];
  // Facture électronique reçue de la plateforme : vannes de la commande CF-0002 (rapprochement automatique)
  const efactures = [{ id: 'ef1', cle: '445666777|RIA-F-26-3317', statut: 'Reçue', recueLe: d(-1) + 'T06:42:00', origine: 'plateforme', nomFichier: 'RIA-F-26-3317.xml', format: 'CII', type: 'facture', typeCode: '380',
    numero: 'RIA-F-26-3317', date: d(-2), echeance: d(43), devise: 'EUR', refCommande: `CF-${Y}-0002`, refAcheteur: `CH-${Y}-001`, refFacture: '', iban: 'FR7600000000000000000000000',
    vendeur: { nom: 'Robinetterie Industrielle Alpes', siren: '445666777', siret: '44566677700010', tva: 'FR21445666777', adresse: '', cp: '38000', ville: 'Grenoble', email: 'ventes@ria.example' },
    acheteur: { nom: 'Pipe-Fit Industrie', siren: '000000000', siret: '', tva: '', adresse: '', cp: '', ville: '', email: '' },
    totalHT: 3888, totalTVA: 777.6, totalTTC: 4665.6, netAPayer: 4665.6, notes: ['Livraison sur site, usine de Rumilly'],
    lignes: [{ designation: 'Vanne papillon DN50 PN16 à levier', reference: 'VAN-PAP-050', qte: 24, unite: 'C62', pu: 158, montantHT: 3792, tauxTVA: 20 }, { designation: 'Participation transport', reference: '', qte: 1, unite: 'C62', pu: 96, montantHT: 96, tauxTVA: 20 }],
    xmlId: '', pdfId: '' }];
  // Facture de la commande CF-0001 : 2,5 % au-dessus du montant commandé
  const cf1 = commandes.find(c => c.id === 'cf1');
  if (cf1) { const tot = cf1.lignes.reduce((t, l) => t + l.qte * l.pu, 0) * 1.025; achats[0].montantHT = Math.round(tot * 100) / 100; achats[0].imputations[0].montantHT = achats[0].montantHT; }
  const planning = [];
  const temps = [];
  // Planning : charge hebdomadaire au-delà, détail jour par jour (semaine dernière, en cours, prochaine)
  const lundi = addDays(today, -((today.getDay() + 6) % 7));
  const jour = (sem, j) => isoDate(addDays(lundi, sem * 7 + j));
  const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const affecte = (userId, affaireId, sem, jours, tache, h = 8, extra = {}) => jours.forEach(j => planning.push({ id: uid(), date: jour(sem, j), userId, affaireId, tache,
    debut: '07:30', fin: hm(450 + h * 60 + (h > 6 ? 60 : 0)), pause: h > 6 ? 60 : 0, heuresPrevues: h, ...extra }));
  for (const i of [-2, 2, 3]) {
    planning.push({ id: uid(), affaireId: 'af1', userId: 'o5', semaine: w(i), heuresPrevues: 35, libelle: 'Préfabrication des lignes' });
    planning.push({ id: uid(), affaireId: 'af1', userId: 'o1', semaine: w(i), heuresPrevues: 35, libelle: 'Soudure orbitale' });
    planning.push({ id: uid(), affaireId: 'af1', userId: 'o2', semaine: w(i), heuresPrevues: 35, libelle: 'Soudure orbitale' });
    if (i > 0) ['o3', 'o4'].forEach(o => planning.push({ id: uid(), affaireId: 'af1', userId: o, semaine: w(i), heuresPrevues: 35, libelle: 'Montage sur site' }));
  }
  const L5 = [0, 1, 2, 3, 4];
  for (const sem of [-1, 0, 1]) {
    affecte('o5', 'af1', sem, L5, 'Préfabrication');
    affecte('o1', 'af1', sem, L5, 'Soudure');
    affecte('o2', 'af1', sem, L5, 'Soudure');
    affecte('o3', 'af1', sem, L5, 'Montage');
    affecte('i1', 'af1', sem, L5, 'Montage');
    affecte('i2', 'af1', sem, L5, 'Soudure');
    affecte('o4', 'af1', sem, sem === 1 ? [0, 2, 3, 4] : L5, 'Montage');
  }
  planning.filter(p => p.date === jour(1, 0) && ['o3', 'o4', 'i1', 'i2'].includes(p.userId)).forEach(p => { p.note = 'RDV 7h15 au poste de garde de l\'usine, badges nominatifs.'; });
  // Semaine prochaine : pose de la manchette préfabriquée sur le dépannage PM2
  affecte('o4', 'hd2', 1, [1], 'Montage', 8, { note: 'Récupérer la manchette DN80 à l\'atelier avant le départ.' });
  affecte('o6', 'af1', 1, [3, 4], 'Études', 7, { note: 'Isométriques de recollement pour le DOE.' });
  planning.push({ id: uid(), affaireId: 'af1', userId: 'u1', semaine: w(0), heuresPrevues: 6, libelle: 'Suivi chantier' });

  // Pointages des opérateurs (jours ouvrés uniquement) : arrivée, départ, pause
  const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const pointe = (aid, uidv, offset, h, tache) => {
    const day = addDays(today, offset).getDay();
    if (day === 0 || day === 6) return;
    const debut = 7 * 60 + 30, pause = h > 6 ? 60 : 0;
    const enCours = offset > -8; // pointages récents : en attente de validation
    const chef = (users.find(u => u.id === uidv) || {}).chefId;
    temps.push({ id: uid(), affaireId: aid, userId: uidv, date: d(offset), heures: h, debut: hhmm(debut), fin: hhmm(debut + h * 60 + pause), pause, tache,
      panier: h >= 6, statut: enCours ? '' : 'Validé', saisiPar: chef && offset > -9 ? chef : uidv });
  };
  for (let i = 1; i <= 21; i++) {
    pointe('af1', 'o5', -i, 8, 'Préfabrication');
    pointe('af1', 'o1', -i, 8, 'Soudure');
    pointe('af1', 'o2', -i, i % 5 === 0 ? 7 : 9, 'Soudure'); // heures supplémentaires
    if (i <= 8) { pointe('af1', 'o3', -i, 8, 'Montage'); pointe('af1', 'o4', -i, 8, 'Montage'); }
  }
  for (let i = 0; i < 8; i++) pointe('af1', 'o6', -48 + i, 7, 'Isométriques');
  for (let i = 1; i <= 8; i++) { pointe('af1', 'i1', -i, 8, 'Montage'); pointe('af1', 'i2', -i, i % 3 === 0 ? 10 : 8, 'Soudure'); }
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
  // Hors devis : préfabrication à l'atelier puis pose sur site par l'équipe de Lucas
  pointe('hd1', 'o5', -9, 8, 'Préfabrication'); pointe('hd1', 'o5', -8, 6, 'Préfabrication'); pointe('hd1', 'o2', -8, 7, 'Soudure');
  pointe('hd1', 'o3', -7, 9, 'Montage'); pointe('hd1', 'i1', -7, 9, 'Montage');
  pointe('hd2', 'o4', -1, 5, 'Dépannage');

  const frais = [
    { id: 'nf1', numero: `NF-${Y}-` + '0001', userId: 'o3', affaireId: 'af1', date: d(-9), categorie: 'Repas', montantTTC: 68.4, tauxTVA: 10, description: 'Repas équipe montage (4 pers.)', photoId: '', statut: 'Validée' },
    { id: 'nf2', numero: `NF-${Y}-` + '0002', userId: 'o1', affaireId: 'af1', date: d(-3), categorie: 'Carburant', montantTTC: 72.15, tauxTVA: 20, description: 'Gasoil camionnette atelier → Rumilly', photoId: '', statut: 'Soumise' },
    { id: 'nf3', numero: `NF-${Y}-` + '0003', userId: 'o3', affaireId: 'af1', date: d(-2), categorie: 'Péage', montantTTC: 18.6, tauxTVA: 20, description: 'Péage A41 aller-retour', photoId: '', statut: 'Soumise' },
    { id: 'nf4', numero: `NF-${Y}-` + '0004', userId: 'o1', affaireId: 'af2', date: d(-100), categorie: 'Hôtel', montantTTC: 189, tauxTVA: 10, description: '2 nuits à Fos-sur-Mer pendant l\'arrêt', photoId: '', statut: 'Remboursée' },
  ];

  // Matériel utilisé sur les interventions hors devis (saisi sur téléphone, à facturer)
  const conso = (id, aid, userId, offset, articleId, qte, extra = {}) => {
    const a = articles.find(x => x.id === articleId) || {};
    return { id, affaireId: aid, userId, date: d(offset), articleId: articleId || '', designation: a.designation || extra.designation, unite: a.unite || extra.unite || 'u', qte, pu: a.prixVente ?? extra.pu, cout: a.coutRevient ?? extra.cout, rapportId: extra.rapportId || '' };
  };
  const consommations = [
    conso('cs1', 'hd1', 'o5', -9, 'a1', 6, { rapportId: 'ri4' }), conso('cs2', 'hd1', 'o5', -9, 'a4', 8, { rapportId: 'ri4' }), conso('cs3', 'hd1', 'o5', -8, 'a5', 0, { rapportId: 'ri4' }),
    conso('cs4', 'hd1', 'o3', -7, 'a8', 6, { rapportId: 'ri5' }),
    conso('cs5', 'hd1', 'o3', -7, '', 8, { designation: 'Joints PTFE DN50', unite: 'u', pu: 6.5, cout: 3.2, rapportId: 'ri5' }),
    conso('cs6', 'hd2', 'o4', -1, '', 2, { designation: 'Joints graphite DN100 PN40', unite: 'u', pu: 18, cout: 9.5 }),
  ].filter(c => c.qte);

  // Rapports d'intervention saisis sur le téléphone par les équipes
  const rapports = [
    { id: 'ri1', numero: `RI-${Y}-` + '0001', affaireId: 'af1', userId: 'o3', date: d(-3), intervenants: ['o3', 'o4', 'i1'], photos: ['img-rack1'], statut: 'Envoyé',
      travaux: 'Pose et supportage de 48 ml de ligne inox DN50 entre la cuve CIP 2 et le collecteur retour (rack nord). Colliers posés tous les 2 m.',
      observations: 'Accès au rack difficile au-dessus de la cuve 3 : nacelle nécessaire pour la suite.', besoins: '40 colliers DN50 supplémentaires, réservation nacelle jeudi.' },
    { id: 'ri2', numero: `RI-${Y}-` + '0002', affaireId: 'af1', userId: 'o1', date: d(-2), intervenants: ['o1', 'i2'], photos: ['img-rack2'], statut: 'Envoyé',
      travaux: 'Soudure orbitale de 26 joints DN50 sur la ligne retour NEP. Contrôle visuel conforme, marquage des soudures sur l\'isométrique.',
      observations: '', besoins: 'Bouteille d\'argon à remplacer.' },
    { id: 'ri3', numero: `RI-${Y}-` + '0003', affaireId: 'af1', userId: 'o3', date: d(-1), intervenants: ['o3', 'o4'], photos: [], statut: 'Envoyé',
      travaux: 'Mise en place des vannes papillon V12 à V18 sur la ligne aller. Serrage des brides au couple.', observations: 'Vanne V15 livrée avec un levier abîmé : photo envoyée au fournisseur.', besoins: '' },
    { id: 'ri4', numero: `RI-${Y}-` + '0004', affaireId: 'hd1', userId: 'o5', date: d(-8), intervenants: ['o5', 'o2'], photos: ['img-rack2'], statut: 'Envoyé',
      travaux: 'Préfabrication à l\'atelier du collecteur de purge DN50 (6 ml, 8 coudes), soudure TIG et contrôle visuel.', observations: '', besoins: '' },
    { id: 'ri5', numero: `RI-${Y}-` + '0005', affaireId: 'hd1', userId: 'o3', date: d(-7), intervenants: ['o3', 'i1'], photos: ['img-rack1'], statut: 'Envoyé', termine: true,
      travaux: 'Dépose de l\'ancien collecteur, pose du collecteur préfabriqué et supportage (6 ml). Remise en eau et contrôle d\'étanchéité : OK.', observations: 'Joints PTFE fournis par nos soins.', besoins: '',
      signatureClientId: 'img-sig', signataireNom: 'Jérôme Faure', signataireQualite: 'Responsable maintenance PM2', signeLe: d(-7) + 'T17:20:00' },
  ];
  // Réserves de fin de chantier et procès-verbaux de réception signés
  const reserves = [
    { id: 'rs1', affaireId: 'af1', numero: 1, localisation: 'Local CIP – rack nord', description: 'Calorifuge manquant sur 3 m de ligne retour', responsable: 'Pipe-Fit', echeance: d(10), photoId: 'img-rack1', statut: 'Ouverte', pvId: '' },
    { id: 'rs2', affaireId: 'af1', numero: 2, localisation: 'Toutes lignes', description: 'Repérage des lignes (étiquettes sens de circulation) à compléter', responsable: 'Pipe-Fit', echeance: d(10), photoId: '', statut: 'Ouverte', pvId: '' },
    { id: 'rs3', affaireId: 'af3', numero: 1, localisation: 'Skid de dosage', description: 'Suintement sur raccord clamp de la vanne V3', responsable: 'Pipe-Fit', echeance: d(-60), photoId: '', statut: 'Levée', dateLevee: d(-62), commentaireLevee: 'Joint remplacé, essai d\'étanchéité OK', pvId: 'pv2' },
    { id: 'rs4', affaireId: 'af3', numero: 2, localisation: 'Bâtiment B – supports', description: 'Retouches de peinture sur les supports du skid', responsable: 'Pipe-Fit', echeance: d(-50), photoId: '', statut: 'Ouverte', pvId: 'pv2' },
  ];
  const snap = r => ({ numero: r.numero, localisation: r.localisation, description: r.description, responsable: r.responsable, echeance: r.echeance });
  const receptions = [
    { id: 'pv1', numero: `PV-${Y}-` + '0001', affaireId: 'af2', type: 'reception', date: d(-24), lieu: 'Site de Fos', presents: 'M. Durand (Pétrochimie du Sud), J. Bernard (Pipe-Fit)',
      contactId: 'k1', signataireNom: 'Marc Durand', signataireQualite: 'Chargé de travaux', decision: 'Sans réserve', reservesSnapshot: [], commentaire: '',
      signatureClientId: 'img-sig', signatureEntrepriseId: 'img-sig', signataireEntreprise: 'Julien Bernard', signeLe: d(-24) + 'T16:40:00', statut: 'Signé' },
    { id: 'pv2', numero: `PV-${Y}-` + '0002', affaireId: 'af3', type: 'reception', date: d(-66), lieu: 'Usine de Gerland', presents: 'Mme Benali (Pharmasynth), C. Martin (Pipe-Fit)',
      contactId: 'k4', signataireNom: 'Nadia Benali', signataireQualite: 'Responsable maintenance', decision: 'Avec réserves', reservesSnapshot: reserves.filter(r => r.pvId === 'pv2').map(snap), commentaire: 'Réserves à lever sous 15 jours.',
      signatureClientId: 'img-sig', signatureEntrepriseId: 'img-sig', signataireEntreprise: 'Claire Martin', signeLe: d(-66) + 'T11:15:00', statut: 'Signé' },
  ];

  // Bibliothèque d'ouvrages types (réutilisés d'un devis à l'autre)
  const ot = (id, famille, designation, unite, composants, detail = '') => ({ id, famille, designation, unite, detail, composants });
  const ouvrages = [
    ot('ot1', 'Tuyauterie inox', 'Tuyauterie inox 316L DN50 fournie et posée', 'ml', [F('a1', 1.05), F('a4', 0.2), F('a8', 1), MO('mo1', 0.25), MO('mo2', 0.45)]),
    ot('ot2', 'Tuyauterie inox', 'Tuyauterie inox 316L DN100 fournie et posée', 'ml', [F('a2', 1.05), F('a17', 0.2), F('a8', 1), MO('mo1', 0.3), MO('mo2', 0.6)]),
    ot('ot3', 'Essais', 'Épreuve hydraulique avec procès-verbal', 'forfait', [F('a13', 1), MO('mo2', 6)], 'Remplissage, mise en pression à 1,5 × PS, maintien 2 h, procès-verbal signé.'),
    ot('ot4', 'Contrôles', 'Contrôle radiographique des soudures (10 %)', 'u', [F('a12', 1), MO('mo2', 0.5)]),
  ];

  // Historique d'envois par e-mail (Microsoft 365)
  const envoi = (id, jours, type, col, docId, numero, to, objet, par, expediteur) => ({ id, date: d(jours) + 'T09:12:00', type, col, docId, numero, to: [to], cc: [], objet,
    pieces: [`${objet.split(' – ')[0]}.pdf`], mode: 'Microsoft 365', expediteur, par });
  const envois = [
    envoi('env1', -54, 'devis', 'devis', 'dv1', `DV-${Y}-0001`, 't.girard@laiterie-alpes.example', `Devis DV-${Y}-0001 – Ligne NEP inox – Usine de Rumilly`, 'Claire Martin', 'c.martin@pipefit.example'),
    envoi('env2', -2, 'situation', 'situations', 'sit4', `BL-${Y}-0004`, 'c.rousset@ipa.example', 'Proposition de situation n° 2 – CH-' + Y + '-001 – Ligne NEP inox – Usine de Rumilly', 'Claire Martin', 'c.martin@pipefit.example'),
  ];
  return {
    files: { 'img-logo': IMAGES.logo, 'img-sig': IMAGES.signature, 'img-rack1': IMAGES.rack1, 'img-rack2': IMAGES.rack2 },
    settings: { societe: 'Pipe-Fit Industrie', adresse: 'ZI des Forges – 69800 Saint-Priest', siret: '000 000 000 00000', tva: 20, tauxHoraireDefaut: 58, delaiPaiement: 45, dureeHebdo: 35, seuilHS50: 43, montantPanier: 10.5,
      compta: { journal: 'VT', journalLib: 'Ventes', compteClient: '411000', compteTravaux: '704000', compteLivraison: '708500', compteTVA: '445710', compteRG: '411700', auxiliaires: true, emailComptable: 'compta@cabinet-exemple.fr' },
      doc: { logoId: 'img-logo', masquerNom: true, logoHauteur: 56, couleur: '#8f2f1a', police: 'sans', tel: '04 72 00 00 00', email: 'contact@pipefit.example', web: 'www.pipefit.example',
        tvaIntra: 'FR00000000000', formeJuridique: 'SAS', capital: '150 000 €', rcs: 'Lyon 000 000 000', ape: '4322B', banque: 'Banque de démonstration', iban: 'FR76 0000 0000 0000 0000 0000 000', bic: 'DEMOFRPPXXX',
        types: { devis: { conditions: 'Acompte de 30 % à la commande. Travaux réalisés selon les normes EN 13480 et le DTU en vigueur. Hors génie civil, calorifuge et échafaudages sauf mention contraire.' },
          facture: { conditions: 'Paiement par virement à 45 jours fin de mois.' } } } },
    users, mainoeuvre, zones, articles, entreprises, contacts, affaires, devis, situations, commandes, factures, planning, temps, frais, rapports, reserves, receptions, consommations, envois, achats, efactures, familles, consultations, ouvrages,
  };
}

if (typeof module !== 'undefined') module.exports = { demoData, uid };
