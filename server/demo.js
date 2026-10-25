// Données de démonstration chargées au premier démarrage (base vide).
// Fichier partagé : utilisé par le serveur (Node.js) et par la version de démonstration en ligne (navigateur).
const IMAGES = typeof DEMO_IMAGES !== 'undefined' ? DEMO_IMAGES : require('./demo-images');
// Petit PDF d'une page (plans et fiches d'exemple des documents de chantier)
function pdfExemple(titre, lignes) {
  const t = x => String(x).replace(/[\\()]/g, m => '\\' + m).replace(/[^\x20-\x7e]/g, c => ({ 'é': 'e', 'è': 'e', 'ê': 'e', 'à': 'a', 'â': 'a', 'ô': 'o', 'î': 'i', 'ç': 'c', 'É': 'E', '–': '-', '’': "'", '°': ' ' }[c] || '?'));
  const flux = ['BT /F1 18 Tf 60 780 Td (' + t(titre) + ') Tj ET', '0.6 0.2 0.1 RG 2 w 60 765 m 535 765 l S',
    ...lignes.map((l, i) => `BT /F1 11 Tf 60 ${740 - i * 18} Td (${t(l)}) Tj ET`), '0.5 g BT /F1 9 Tf 60 40 Td (Pipe-Fit Industrie - document d\'exemple de la demonstration) Tj ET'].join('\n');
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`];
  let out = '%PDF-1.4\n';
  const offs = objs.map((o, i) => { const off = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return off; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return 'data:application/pdf;base64,' + (typeof Buffer !== 'undefined' ? Buffer.from(out, 'latin1').toString('base64') : btoa(out));
}
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
    { id: 'a1', ref: 'TUB-316-050', designation: 'Tube inox 316L DN50 sch10S', famille: 'Tubes', sousFamille: 'Inox 316L', unite: 'ml', prixVente: 51, coutRevient: 41, poidsUnitaire: 4.1, fournisseurId: 'e5' },
    { id: 'a2', ref: 'TUB-316-100', designation: 'Tube inox 316L DN100 sch10S', famille: 'Tubes', sousFamille: 'Inox 316L', unite: 'ml', prixVente: 103, coutRevient: 82, poidsUnitaire: 8.4, fournisseurId: 'e5' },
    { id: 'a3', ref: 'TUB-P235-150', designation: 'Tube acier P235GH DN150 ép. 4,5', famille: 'Tubes', sousFamille: 'Acier P235GH', unite: 'ml', prixVente: 57, coutRevient: 46, poidsUnitaire: 18.2, fournisseurId: 'e5' },
    { id: 'a4', ref: 'COU-316-050', designation: 'Coude 90° 3D inox 316L DN50', famille: 'Raccords', sousFamille: 'Coudes', unite: 'u', prixVente: 26, coutRevient: 21, poidsUnitaire: 0.6, fournisseurId: 'e5' },
    { id: 'a5', ref: 'BRI-316-100', designation: 'Bride à collerette inox DN100 PN16', famille: 'Raccords', sousFamille: 'Brides', unite: 'u', prixVente: 82, coutRevient: 66, poidsUnitaire: 5.5, fournisseurId: 'e5' },
    { id: 'a6', ref: 'COU-P235-150', designation: 'Coude 90° acier P235GH DN150', famille: 'Raccords', sousFamille: 'Coudes', unite: 'u', prixVente: 67, coutRevient: 54, poidsUnitaire: 7.9, fournisseurId: 'e5' },
    { id: 'a7', ref: 'VAN-PAP-050', designation: 'Vanne papillon DN50 PN16 à levier', famille: 'Robinetterie', sousFamille: 'Vannes papillon', unite: 'u', prixVente: 200, coutRevient: 160, poidsUnitaire: 3.2, fournisseurId: 'e6' },
    { id: 'a8', ref: 'SUP-RACK', designation: 'Supportage et colliers', famille: 'Supportage', sousFamille: 'Colliers et rails', unite: 'ml', prixVente: 12, coutRevient: 9, poidsUnitaire: 1.5, fournisseurId: 'e5' },
    { id: 'a14', ref: 'TEE-316-050', designation: 'Té égal inox 316L DN50 à souder', famille: 'Raccords', sousFamille: 'Tés', unite: 'u', prixVente: 38, coutRevient: 30, poidsUnitaire: 0.8, fournisseurId: 'e5' },
    { id: 'a15', ref: 'RED-316-100', designation: 'Réduction concentrique inox 316L DN100×50', famille: 'Raccords', sousFamille: 'Réductions', unite: 'u', prixVente: 44, coutRevient: 35, poidsUnitaire: 0.9, fournisseurId: 'e5' },
    { id: 'a16', ref: 'BRI-316-050', designation: 'Bride à collerette inox DN50 PN16', famille: 'Raccords', sousFamille: 'Brides', unite: 'u', prixVente: 41, coutRevient: 33, poidsUnitaire: 2.1, fournisseurId: 'e5' },
    { id: 'a17', ref: 'COU-316-100', designation: 'Coude 90° 3D inox 316L DN100', famille: 'Raccords', sousFamille: 'Coudes', unite: 'u', prixVente: 74, coutRevient: 59, poidsUnitaire: 2.4, fournisseurId: 'e5' },
    { id: 'a18', ref: 'TEE-316-100', designation: 'Té égal inox 316L DN100 à souder', famille: 'Raccords', sousFamille: 'Tés', unite: 'u', prixVente: 96, coutRevient: 77, poidsUnitaire: 2.9, fournisseurId: 'e5' },
    { id: 'a11', ref: 'ECH-SEM', designation: 'Location échafaudage', famille: 'Location', sousFamille: 'Échafaudages', unite: 'semaine', prixVente: 400, coutRevient: 320, poidsUnitaire: 0, fournisseurId: 'e7' },
    { id: 'a12', ref: 'CTRL-RX', designation: 'Contrôle radiographique de soudure (sous-traité)', famille: 'Contrôles', sousFamille: 'Contrôles non destructifs', unite: 'u', prixVente: 80, coutRevient: 60, poidsUnitaire: 0, fournisseurId: 'e7' },
    { id: 'a13', ref: 'EPR-HYD', designation: 'Consommables épreuve hydraulique + PV', famille: 'Contrôles', sousFamille: 'Épreuves', unite: 'forfait', prixVente: 260, coutRevient: 120, poidsUnitaire: 0, fournisseurId: '' },
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
    // Entreprise générale : nous intervenons en sous-traitance, TVA autoliquidée
    { id: 'e13', nom: 'Bâtiment Général Alpes', categorie: 'Client', secteur: 'Entreprise générale du bâtiment', siret: '789 456 123 00017', tvaIntra: 'FR67789456123', regimeTVA: 'AL', tel: '04 76 50 50 50', email: 'travaux@bga.example', web: '', zoneId: 'z1',
      adresses: [site('s15', 'Siège', '12 avenue Jean Jaurès', '38100', 'Grenoble', true), site('s16', 'Chantier clinique des Cèdres', 'Rue des Cèdres', '38400', 'Saint-Martin-d\'Hères')] },
    // Bailleur social : travaux dans des logements de plus de deux ans, TVA à 10 %
    { id: 'e14', nom: 'Habitat Dauphiné', categorie: 'Client', secteur: 'Bailleur social', siret: '275 380 000 00028', tvaIntra: 'FR93275380000', regimeTVA: '10', tel: '04 76 60 60 60', email: 'patrimoine@habitat-dauphine.example', web: '', zoneId: 'z1',
      adresses: [site('s17', 'Siège', '5 place Grenette', '38000', 'Grenoble', true), site('s18', 'Résidence Les Tilleuls – chaufferie', '20 rue des Tilleuls', '38130', 'Échirolles')] },
    { id: 'e8', nom: 'Intérim Industrie Rhône', compteCharge: '621100', categorie: 'Fournisseur', secteur: 'Travail temporaire', siret: '611 222 333 00019', tvaIntra: 'FR40611222333', tel: '04 72 44 44 44', email: 'lyon@interim-ir.example', web: '', zoneId: '',
      adresses: [site('s11', 'Agence de Lyon 7e', '5 avenue Jean Jaurès', '69007', 'Lyon', true)] },
    { id: 'e11', nom: 'Descours & Cabot', categorie: 'Fournisseur', secteur: 'Négoce tubes et raccords', siret: '957 200 000 01234', tvaIntra: 'FR10957200000', tel: '04 72 66 66 66', email: 'agence.lyon@descours-cabot.example', web: '', zoneId: '',
      adresses: [site('s15', 'Agence de Saint-Priest', 'Rue de l\'Industrie', '69800', 'Saint-Priest', true)] },
    { id: 'e12', nom: 'Téréva', categorie: 'Fournisseur', secteur: 'Négoce tubes et raccords', siret: '338 200 000 04321', tvaIntra: 'FR22338200000', tel: '04 76 77 77 77', email: 'voiron@tereva.example', web: '', zoneId: '',
      adresses: [site('s16', 'Agence de Voiron', 'ZA de Centr\'Alp', '38500', 'Voiron', true)] },
    { id: 'e9', nom: 'Ingénierie Process Alpes', categorie: "Maîtrise d'œuvre", secteur: 'Ingénierie', siret: '723 555 666 00031', tvaIntra: 'FR62723555666', tel: '04 50 55 55 55', email: 'contact@ipa.example', web: '', zoneId: '',
      adresses: [site('s12', 'Bureau d\'Annecy', '9 rue des Ingénieurs', '74000', 'Annecy', true)] },
    { id: 'e7', nom: 'Services Industriels Rhône', compteCharge: '611000', categorie: 'Fournisseur', secteur: 'Sous-traitance', siret: '512 333 444 00027', tvaIntra: 'FR55512333444', tel: '04 78 33 33 33', email: 'planning@sir.example', web: '', zoneId: '',
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
    { id: 'k11', civilite: 'Monsieur', prenom: 'Karim', nom: 'Belkacem', fonction: 'Conducteur de travaux', entrepriseId: 'e13', siteId: 's16', tel: '04 76 50 50 51', mobile: '06 20 30 40 50', email: 'k.belkacem@bga.example' },
    { id: 'k12', civilite: 'Madame', prenom: 'Hélène', nom: 'Roche', fonction: 'Chargée d\'opérations patrimoine', entrepriseId: 'e14', siteId: 's18', tel: '04 76 60 60 61', mobile: '06 21 31 41 51', email: 'h.roche@habitat-dauphine.example' },
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
    { id: 'af1', documents: [
        { id: 'dc1', fichierId: 'pdf-iso', nom: 'Isométrique NEP aller – ISO-NEP-01.pdf', categorie: 'Plan', indice: 'B', note: 'Cotes de raccordement mises à jour après la visite du 12.', mime: 'application/pdf', taille: 2600, date: d(-6), par: 'Claire Martin', visible: true, anciens: [{ fichierId: 'pdf-iso-a', indice: 'A', date: d(-30) }] },
        { id: 'dc2', fichierId: 'pdf-ft-vanne', nom: 'Fiche technique vanne papillon DN50.pdf', categorie: 'Fiche technique', indice: '', note: '', mime: 'application/pdf', taille: 2100, date: d(-20), par: 'Claire Martin', visible: true },
        { id: 'dc3', fichierId: 'pdf-ppsps', nom: 'PPSPS Laiterie des Alpes.pdf', categorie: 'Sécurité / PPSPS', indice: '', note: 'À lire avant le premier jour sur site.', mime: 'application/pdf', taille: 2300, date: d(-40), par: 'Claire Martin', visible: true },
        { id: 'dc4', fichierId: 'img-rack1', nom: 'Rack existant – relevé.jpg', categorie: 'Photo', indice: '', note: '', mime: 'image/png', taille: 3400, date: d(-35), par: 'Claire Martin', visible: true },
        { id: 'dc5', fichierId: 'pdf-calcul', nom: 'Note de calcul supportage.pdf', categorie: 'Autre', indice: '', note: 'Usage bureau.', mime: 'application/pdf', taille: 2200, date: d(-25), par: 'Claire Martin', visible: false }],
      code: `CH-${Y}-` + '001', nom: 'Ligne NEP inox – Usine de Rumilly', clientId: 'e2', contactId: 'k3', siteId: 's4', moeId: 'e9', moeContactId: 'k9', retenueGarantie: 5, caution: '', chargeId: 'u1', statut: 'En cours', devisId: 'dv1', dateCreation: d(-50), heuresPrevues: 0, rex: { note: '', positif: '', negatif: '', actions: '' } },
    { id: 'af2', code: `CH-${Y}-` + '002', nom: 'Remplacement collecteur vapeur DN150', clientId: 'e1', contactId: 'k1', siteId: 's2', retenueGarantie: 5, caution: '', dateReception: d(-24), okFacturation: true, chargeId: 'u2', statut: 'Facturé', devisId: 'dv2', dateCreation: d(-110), heuresPrevues: 0, rex: { note: 3, positif: 'Préfabrication des tronçons en atelier, arrêt de l\'unité tenu en 5 jours.', negatif: '6 soudures reprises après contrôle RX (accès difficile en rack). Heures soudeurs dépassées.', actions: 'Prévoir 15 % de reprises sur les soudures en hauteur. Visite de site systématique avant chiffrage.' } },
    { id: 'af3', code: `CH-${Y}-` + '003', nom: 'Skid de dosage – bâtiment B', clientId: 'e3', contactId: 'k4', siteId: 's5', chargeId: 'u1', statut: 'Facturé', devisId: 'dv3', dateReception: d(-66), okFacturation: true, dateCreation: d(-85), heuresPrevues: 0, rex: { note: 4, positif: 'Skid préfabriqué à 90 % en atelier, montage en 3 jours.', negatif: 'Remise commerciale trop élevée.', actions: 'Plancher de remise à 8 % sur les skids.' } },
    // Interventions hors devis (travaux en régie sur demande du client)
    { id: 'af4', documents: [{ id: 'dc6', fichierId: 'pdf-chaufferie', nom: 'Plan chaufferie existante.pdf', categorie: 'Plan', indice: 'A', note: '', mime: 'application/pdf', taille: 2400, date: d(-1), par: 'Julien Bernard', visible: true }],
      code: `CH-${Y}-` + '004', nom: 'Résidence Les Tilleuls – rénovation de la chaufferie', clientId: 'e14', contactId: 'k12', siteId: 's18', chargeId: 'u2', statut: 'En préparation', devisId: 'dv7', dateCreation: d(-1), heuresPrevues: 0, rex: {} },
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
    // Sous-traitance pour une entreprise générale : autoliquidation de la TVA
    { id: 'dv6', numero: `DV-${Y}-` + '0006', objet: 'Clinique des Cèdres – réseaux fluides médicaux et eau glacée (sous-traitance)', ...head('', 'u1', 'e13', 'k11', 's16'), date: d(-3), validite: 30, statut: 'Envoyé', zoneId: 'z1', ajustements: [], numAuto: true,
      autoliquidation: true, tauxTVA: '',
      lignes: [
        chap('Réseau eau glacée'),
        ouv('Tuyauterie inox 316L DN100 fournie et posée', 'ml', 60, [F('a2', 1.05), F('a8', 1), MO('mo1', 0.3), MO('mo2', 0.6)]),
        ouv('Vanne papillon DN50 PN16 à levier', 'u', 6, [F('a7', 1), MO('mo2', 0.6)]),
        chap('Essais'),
        ouv('Épreuve hydraulique avec procès-verbal', 'forfait', 1, [F('a13', 1), MO('mo2', 6)]),
      ] },
    // Logements de plus de deux ans : TVA à 10 %, isolation et régulation de la chaufferie à 5,5 %
    { id: 'dv7', numero: `DV-${Y}-` + '0007', objet: 'Résidence Les Tilleuls – rénovation de la chaufferie collective', ...head('af4', 'u2', 'e14', 'k12', 's18'), date: d(-2), validite: 60, statut: 'Accepté', zoneId: 'z1', ajustements: [], numAuto: true,
      tauxTVA: 10, mentionTVA: 'Attestation simplifiée du client jointe au devis.',
      lignes: [
        chap('Remplacement des collecteurs'),
        ouv('Collecteur départ / retour acier DN150 préfabriqué', 'ml', 18, [F('a3', 1.05), F('a6', 0.3), MO('mo3', 0.5), MO('mo1', 0.6)]),
        ouv('Vanne papillon DN50 PN16 à levier', 'u', 8, [F('a7', 1), MO('mo2', 0.6)]),
        chap('Amélioration énergétique'),
        { ...ouv('Calorifuge des réseaux de chaufferie (laine de roche + tôle)', 'ml', 40, [{ type: 'f', designation: 'Coquilles laine de roche 50 mm + tôle alu', unite: 'ml', qte: 1, pu: 32, cout: 21, poids: 1.2 }, MO('mo2', 0.4)]), tva: 5.5 },
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
  situation('sit2', '0002', 'dv3', d(-68), () => 100, 'Acceptée', '0002', d(-65), d(-20), 'Émise');
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
  // Facture de la situation 2 en retard : un rappel déjà envoyé, un appel noté
  if (fa2) fa2.relances = [{ niveau: 'relance1', date: d(-18), par: 'Claire Martin', libelle: '1re relance' }, { niveau: 'note', date: d(-10), par: 'Claire Martin', libelle: 'Appel compta client : paiement prévu fin du mois' }];
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
  // Historique d'achats sur deux ans (plusieurs négoces, prix qui varient) : analyse des prix mini / moyen / maxi
  const HC = (id, fournisseurId, affaireId, jours, lignes) => ({ id, numero: `CF-${id.toUpperCase()}`, fournisseurId, affaireId, date: d(jours), dateLivraison: d(jours + 6), statut: 'Réceptionnée', lignes });
  commandes.push(
    HC('h01', 'e5', 'af2', -620, [CL('a1', 240, 41.2), CL('a4', 60, 18.9), CL('a16', 12, 29.5)]),
    HC('h02', 'e11', 'af2', -560, [CL('a1', 120, 39.8), CL('a4', 40, 19.6), CL('a14', 10, 27.9)]),
    HC('h03', 'e12', 'af3', -470, [CL('a1', 80, 43.5), CL('a7', 6, 149)]),
    HC('h04', 'e5', 'af3', -400, [CL('a2', 90, 78.4), CL('a17', 20, 52.3), CL('a5', 8, 44)]),
    HC('h05', 'e11', 'af1', -330, [CL('a1', 300, 42.1), CL('a4', 80, 19.2), CL('a16', 20, 30.8)]),
    HC('h06', 'e6', 'af1', -300, [CL('a7', 10, 152)]),
    HC('h07', 'e12', 'af1', -210, [CL('a2', 60, 82.9), CL('a17', 12, 55.6), CL('a14', 16, 30.4)]),
    HC('h08', 'e11', '', -150, [CL('a1', 140, 44.8), CL('a4', 50, 20.4), CL('a7', 4, 161)]),
    HC('h09', 'e12', '', -60, [CL('a1', 90, 46.2), CL('a16', 10, 31.9), CL('a14', 8, 31.5)]));
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
  // Enlèvements au comptoir déclarés par les compagnons (n° de chantier donné au magasin) : le relevé de Descours & Cabot
  // les a facturés (FF-0002) ; deux enlèvements du mois attendent le prochain relevé
  const enlevements = [
    { id: 'en1', userId: 'o1', date: d(-41), fournisseurId: 'e11', affaireId: 'af1', bl: '4512', montant: 212.4, note: 'Raccords inox DN50, joints', photoId: '', statut: 'Facturé', achatId: 'ff2', montantFacture: 212.4 },
    { id: 'en2', userId: 'o2', date: d(-33), fournisseurId: 'e11', affaireId: 'af1', bl: '4538', montant: 274, note: 'Colliers et tiges filetées', photoId: '', statut: 'Facturé', achatId: 'ff2', montantFacture: 274 },
    { id: 'en3', userId: 'o3', date: d(-27), fournisseurId: 'e11', affaireId: 'hd2', bl: '4561', montant: '', note: 'Joints graphite, boulonnerie inox', photoId: '', statut: 'Facturé', achatId: 'ff2', montantFacture: 124.8 },
    { id: 'en4', userId: 'o1', date: d(-6), fournisseurId: 'e11', affaireId: 'af1', bl: '4697', montant: 86.5, note: 'Coudes DN50 manquants', photoId: '', statut: 'Déclaré' },
    { id: 'en5', userId: 'o4', date: d(-2), fournisseurId: 'e12', affaireId: 'af4', bl: '77304', montant: 142.3, note: 'Vannes d\'isolement 1"', photoId: '', statut: 'Déclaré' },
  ];
  // PV d'épreuve hydraulique signé sur la ligne NEP (manomètre étalon du parc)
  const epreuves = [{ id: 'ep1', numero: `EP-${Y}-0001`, affaireId: 'af1', userId: 'o1', technicien: 'Kevin Roux', date: d(-25), heureDebut: '08:30', heureFin: '10:30', reseau: 'NEP aller DN50 – rack nord',
    nature: 'Eau industrielle / process', description: 'Inox 316L DN50, isométrique ISO-NEP-01 indice B', fluideEssai: 'Eau', pressionService: 6, pressionEpreuve: 9, dureePrevue: 120, chuteAdmissible: 0,
    pressionDebut: 9.1, pressionFin: 9.1, chute: 0, dureeReelle: 120, temperature: 14, manometreId: 'pm5', manometre: 'Manomètre étalon 0-60 bar (épreuves hydrauliques) · n° WK-2209-17',
    observations: 'Réseau isolé par les vannes V12 et V18, purgé aux points hauts. Aucune fuite constatée.', photos: [], resultat: 'Conforme', signataireNom: 'Thomas Girard', signataireQualite: 'Responsable maintenance',
    signatureTechId: 'img-sig', signatureClientId: 'img-sig', signeLe: `${d(-25)}T10:42:00.000Z`, statut: 'Signé' }];
  // Prise de cotes du by-pass de la ligne NEP : photos avant / après, ligne en 3D, longueurs de coupe et nomenclature
  const releves = [{ id: 'rc1', numero: `RC-${Y}-0001`, affaireId: 'af1', userId: 'o1', technicien: 'Kevin Roux', date: d(-40), ligne: 'NEP-DN50-07 by-pass vanne V12', fluide: 'Solution de NEP (soude 2 %)',
    matiere: 'Inox 316L', pn: 'PN16', typeBride: 'collerette', dnDepart: 50, dirDepart: 'E', noteDepart: 'Départ sur collecteur existant (coupe et chanfrein sur place)', statut: 'Terminé', longueurTube: 2558,
    elements: [{ t: 'tube', dn: 50, auto: true, cote: 1200, repere: 'T1' }, { t: 'vanne', dn: 50, type: 'boisseau', rac: 'bride', repere: 'V12' }, { t: 'coude', dn: 50, angle: 90, vers: 'N' },
      { t: 'tube', dn: 50, auto: true, cote: 900, repere: 'T2' },
      { t: 'te', dn: 50, vers: 'H', dnB: 25, branche: [{ t: 'tube', dn: 25, auto: true, cote: 350, repere: 'T5' }, { t: 'vanne', dn: 25, type: 'boisseau', rac: 'taraude', repere: 'V13 purge', note: 'Début filetage sur existant' }, { t: 'fond', dn: 25 }] },
      { t: 'tube', dn: 50, auto: true, cote: 600, repere: 'T3' }, { t: 'coude', dn: 50, angle: 90, vers: 'B' }, { t: 'tube', dn: 50, l: 450, repere: 'T4' }, { t: 'brides', dn: 50, typeBride: 'mixte', repere: 'raccordement cuve', note: 'Bride tournante côté cuve existante' }],
    cotes: [{ repere: 'A', libelle: 'Axe collecteur → nu du mur nord', valeur: '640', remarque: '' }, { repere: 'B', libelle: 'Axe ligne → dessus du rack', valeur: '185', remarque: 'rack à 3,20 m' },
      { repere: 'C', libelle: 'Entraxe piquage existant → bride cuve', valeur: '2100', remarque: 'bride cuve DN50 PN16' }],
    photosAvant: [{ photoId: 'img-rack1', legende: 'Ligne existante, vue depuis le rack nord', date: d(-40) }],
    photosApres: [{ photoId: 'img-rack2', legende: 'By-pass posé, vanne V12 et purge V13', date: d(-30) }],
    observations: 'Supportage existant réutilisable sur le rack. Calorifuge à déposer sur 2 m avant découpe.' },
  // Chaufferie des Tilleuls : départ circuit radiateurs (vanne 3 voies, équilibrage, dilatation, dévoiements)
  { id: 'rc2', numero: `RC-${Y}-0002`, affaireId: 'af4', userId: 'o2', technicien: 'Ahmed Haddad', date: d(-20), ligne: 'CH-DEP-R1 départ radiateurs bât. A', fluide: 'Eau chaude chauffage 70/50 °C',
    matiere: 'Acier S235 (noir)', pn: 'PN16', typeBride: 'collerette', dnDepart: 80, dirDepart: 'E', noteDepart: 'Piquage sur collecteur départ existant DN150', statut: 'Relevé', longueurTube: 5308,
    elements: [{ t: 'vanne', dn: 80, type: 'papillon', rac: 'bride', repere: 'V1' }, { t: 'tube', dn: 80, auto: true, cote: 900, repere: 'T1' },
      { t: 'v3v', dn: 80, vers: 'B', rac: 'bride', repere: 'V3V-R1', branche: [{ t: 'tube', dn: 80, auto: true, cote: 600, repere: 'T6' }, { t: 'coude', dn: 80, angle: 90, vers: 'O' }, { t: 'tube', dn: 80, l: 300, repere: 'T7', note: 'Retour vers collecteur (by-pass de mélange)' }] },
      { t: 'tube', dn: 80, auto: true, cote: 1800, repere: 'T2' }, { t: 'vanne', dn: 80, type: 'dilatation', rac: 'bride', repere: 'MD1' },
      { t: 'tube', dn: 80, l: 500, repere: 'T3' }, { t: 'devoie', dn: 80, angle: 45, vers: 'H', dec: 500, repere: 'passage poutre' },
      { t: 'tube', dn: 80, auto: true, cote: 1200, repere: 'T4' }, { t: 'devoie', dn: 80, angle: 45, vers: 'N', dec: 400, vers2: 'B', dec2: 300 },
      { t: 'tube', dn: 80, auto: true, cote: 1600, repere: 'T5' }, { t: 'vanne', dn: 80, type: 'equilibrage', rac: 'bride', repere: 'VE1', note: 'Prises de pression accessibles côté allée' },
      { t: 'vanne', dn: 80, type: 'clapet', rac: 'bride', repere: 'CL1' }, { t: 'brides', dn: 80, repere: 'raccord réseau existant', typeBride: 'mixte' }],
    cotes: [{ repere: 'A', libelle: 'Axe collecteur → sol fini', valeur: '1450', remarque: '' }, { repere: 'B', libelle: 'Dessous de poutre', valeur: '2350', remarque: 'dévoiement de 500 pour passer dessus' }],
    photosAvant: [{ photoId: 'img-rack1', legende: 'Collecteur existant, piquage à créer', date: d(-20) }], photosApres: [],
    observations: 'Vanne 3 voies motorisée fournie par le lot régulation : longueur face à face à confirmer avant préfabrication.' },
  // Dépannage hors devis : reprise d'un tronçon vapeur percé (le matériel relevé passe à facturer sur l'intervention)
  { id: 'rc3', numero: `RC-${Y}-0003`, affaireId: 'hd2', userId: 'o1', technicien: 'Kevin Roux', date: d(-1), ligne: 'VAP-L3 tronçon percé après détendeur', fluide: 'Vapeur 6 bar',
    matiere: 'Acier P235GH', pn: 'PN16', typeBride: 'collerette', dnDepart: 50, dirDepart: 'E', noteDepart: 'Coupe sur tube existant sain', statut: 'Relevé', longueurTube: 2122,
    elements: [{ t: 'tube', dn: 50, auto: true, cote: 1100, repere: 'T1' }, { t: 'coude', dn: 50, angle: 90, vers: 'H' }, { t: 'tube', dn: 50, auto: true, cote: 850, repere: 'T2' },
      { t: 'coude', dn: 50, angle: 90, vers: 'E' }, { t: 'tube', dn: 50, l: 400, repere: 'T3', note: 'Raccord sur existant après la vanne' }, { t: 'brides', dn: 50, repere: 'vers purgeur' }],
    cotes: [{ repere: 'A', libelle: 'Longueur percée à remplacer', valeur: '2300', remarque: 'corrosion sous calorifuge' }], photosAvant: [{ photoId: 'img-rack1', legende: 'Fuite sous calorifuge', date: d(-1) }], photosApres: [],
    observations: 'Calorifuge à refaire sur 3 m (hors intervention).' }];
  // Chaufferie des Tilleuls : épreuve du réseau, mise en service de la chaudière, équilibrage des radiateurs (repris dans le DOE)
  const signe = (jours, h) => ({ signatureTechId: 'img-sig', signatureClientId: 'img-sig', signataireNom: 'Gardien de la résidence', signataireQualite: 'Habitat Dauphiné', signeLe: `${d(jours)}T${h}:00.000Z`, statut: 'Signé' });
  epreuves.push({ id: 'ep2', numero: `EP-${Y}-0002`, affaireId: 'af4', userId: 'o2', technicien: 'Ahmed Haddad', date: d(-12), heureDebut: '08:00', heureFin: '10:00', reseau: 'Collecteurs départ / retour chauffage DN150',
    nature: 'Chauffage (eau chaude)', description: 'Acier noir DN150 soudé, plan chaufferie indice B', fluideEssai: 'Eau', pressionService: 3, pressionEpreuve: 6, dureePrevue: 120, chuteAdmissible: 0, pressionDebut: 6, pressionFin: 6,
    chute: 0, dureeReelle: 120, temperature: 15, manometreId: 'pm5', manometre: 'Manomètre étalon 0-60 bar · n° WK-2209-17', observations: 'Aucune fuite sur les soudures ni les brides.', photos: [], resultat: 'Conforme', ...signe(-12, '10:20') });
  const misesEnService = [{ id: 'ms1', numero: `MS-${Y}-0001`, affaireId: 'af4', userId: 'o2', technicien: 'Ahmed Haddad', date: d(-6), heure: '09:30', type: 'chaudiere', equipement: 'Chaudière gaz à condensation 2 × 150 kW', repere: 'CH1 / CH2',
    localisation: 'Chaufferie sous-sol', marque: 'De Dietrich', modele: 'C 330-280 Eco', numeroSerie: 'DD-77812-01', controles: [
      { libelle: 'Étanchéité du raccordement gaz', etat: 'OK', obs: '' }, { libelle: 'Évacuation des fumées et amenée d\'air conformes', etat: 'OK', obs: '' }, { libelle: 'Remplissage, purge et pression du circuit', etat: 'OK', obs: '' },
      { libelle: 'Sécurités (manque d\'eau, surchauffe, flamme) testées', etat: 'OK', obs: '' }, { libelle: 'Régulation paramétrée', etat: 'OK', obs: '' }],
    mesures: [{ libelle: 'CO2', unite: '%', valeur: '9.1' }, { libelle: 'CO', unite: 'ppm', valeur: '18' }, { libelle: 'Température des fumées', unite: '°C', valeur: '52' }, { libelle: 'Rendement de combustion', unite: '%', valeur: '97.8' },
      { libelle: 'Pression gaz', unite: 'mbar', valeur: '20' }, { libelle: 'Température départ', unite: '°C', valeur: '70' }, { libelle: 'Température retour', unite: '°C', valeur: '52' }],
    reglages: 'Loi d\'eau : 70 °C à -10 °C extérieur, 30 °C à +18 °C. Réduit de nuit 22 h – 5 h.', observations: '', photos: [], resultat: 'Mis en service', ...signe(-6, '11:05') }];
  const equilibrages = [{ id: 'eq1', numero: `EQ-${Y}-0001`, affaireId: 'af4', userId: 'o2', technicien: 'Ahmed Haddad', date: d(-5), heure: '08:30', installation: 'Circuit radiateurs bâtiment A', type: 'Hydraulique', unite: 'l/h', tolerance: 10,
    appareil: 'Valise d\'équilibrage hydraulique', lignes: [
      { repere: 'V1', local: 'Colonne A1', type: 'Vanne d\'équilibrage', theorique: 1850, mesure: 1810, reglage: '3,2 tours' }, { repere: 'V2', local: 'Colonne A2', type: 'Vanne d\'équilibrage', theorique: 1650, mesure: 1700, reglage: '2,8 tours' },
      { repere: 'V3', local: 'Colonne A3', type: 'Vanne d\'équilibrage', theorique: 1420, mesure: 1395, reglage: '2,4 tours' }, { repere: 'V4', local: 'Colonne A4', type: 'Vanne d\'équilibrage', theorique: 1200, mesure: 1240, reglage: '2,1 tours' }],
    observations: 'Pompe réglée en pression différentielle constante 4,5 mCE.', photos: [], resultat: 'Conforme', ...signe(-5, '12:00') }];
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
  if (cf1) {
    // Livraison : un reliquat de 20 ml de tube DN100 ; facture : hausse de 6 % sur le tube DN50, DN100 facturé en entier, frais de port
    cf1.lignes.forEach(l => { l.qteRecue = l.articleId === 'a2' ? l.qte - 20 : l.qte; });
    cf1.receptions = [{ date: d(-38), bl: 'BL-IDRA-55120', note: 'Reliquat de 20 ml de tube DN100 annoncé', photoId: '', lignes: cf1.lignes.map((l, i) => ({ i, qte: l.qteRecue })), par: 'Kevin Roux' }];
    achats[0].lignes = [...cf1.lignes.map(l => ({ designation: l.designation.toUpperCase(), reference: (articles.find(a => a.id === l.articleId) || {}).ref || '', qte: l.qte, unite: l.unite,
      pu: l.articleId === 'a1' ? Math.round(l.pu * 1.06 * 100) / 100 : l.pu })), { designation: 'Participation frais de port', qte: 1, unite: 'u', pu: 85 }];
    achats[0].lignes.forEach(l => { l.montantHT = Math.round(l.qte * l.pu * 100) / 100; });
    achats[0].montantHT = Math.round(achats[0].lignes.reduce((t, l) => t + l.montantHT, 0) * 100) / 100; achats[0].imputations[0].montantHT = achats[0].montantHT;
  }
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
  // Semaine prochaine : démarrage de la chaufferie des Tilleuls, dépannage, congés et formation
  const reaffecte = (userId, sem, jours, fn) => jours.forEach(j => { for (let k = planning.length - 1; k >= 0; k--) if (planning[k].userId === userId && planning[k].date === jour(sem, j)) planning.splice(k, 1); fn(j); });
  const RDV_TILLEULS = 'RDV 7h30 devant la chaufferie (clé à la loge du gardien). Prévoir les EPI amiante : flocage à proximité.';
  ['o3', 'i1'].forEach(o => reaffecte(o, 1, [0, 1, 2], j => affecte(o, 'af4', 1, [j], 'Montage', 8, { note: RDV_TILLEULS })));
  reaffecte('i2', 1, [0, 1, 2], j => affecte('i2', 'af4', 1, [j], 'Manutention', 8, { note: RDV_TILLEULS }));
  reaffecte('o1', 1, [1, 2], j => affecte('o1', 'af4', 1, [j], 'Soudure', 8, { note: 'Soudure des collecteurs DN150 sur place.' }));
  reaffecte('o2', 1, [1], j => affecte('o2', 'hd2', 1, [j], 'Soudure', 4));
  reaffecte('o2', 1, [3, 4], j => planning.push({ id: uid(), date: jour(1, j), userId: 'o2', absence: 'Congés', affaireId: '', heuresPrevues: 0 }));
  reaffecte('o5', 1, [0], j => planning.push({ id: uid(), date: jour(1, j), userId: 'o5', absence: 'Formation', affaireId: '', heuresPrevues: 0 }));
  // Notification non lue de Kevin : son planning de la semaine prochaine a changé
  const jc = n => new Date(`${jour(1, n)}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\.(?=\s|$)/g, '');
  const notifications = [{ id: 'nt1', type: 'planning', userId: 'o1', pour: 'o1', titre: 'Votre planning a changé : 2 jours', lien: '#/pointage/planning', jours: [jour(1, 1), jour(1, 2)],
    texte: `${jc(1)} : CH-${Y}-004 07:30–16:30 (Soudure)\n${jc(2)} : CH-${Y}-004 07:30–16:30 (Soudure)`, date: new Date(Date.now() - 25 * 60000).toISOString(), lu: false },
    { id: 'nt2', type: 'document', userId: 'o1', affaireId: 'af4', titre: `📎 Nouveau document : CH-${Y}-004`, texte: 'Plan : Plan chaufferie existante.pdf (indice A)', lien: '#/pointage/chantier/af4', date: new Date(Date.now() - 10 * 60000).toISOString(), lu: false }];

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
    { id: 'nf1', numero: `NF-${Y}-` + '0001', userId: 'o3', affaireId: 'af1', date: d(-9), categorie: 'Repas', montantTTC: 68.4, tauxTVA: 10, description: 'Repas équipe montage (4 pers.)', photoId: '', statut: 'Validée',
      convives: [{ nom: 'Lucas Petit', userId: 'o3' }, { nom: 'Kevin Roux', userId: 'o1' }, { nom: 'Ahmed Haddad', userId: 'o2' }, { nom: 'Yanis Morel', userId: 'i1' }] },
    { id: 'nf2', numero: `NF-${Y}-` + '0002', userId: 'o1', affaireId: 'af1', date: d(-3), categorie: 'Carburant', montantTTC: 72.15, tauxTVA: 20, description: 'Gasoil camionnette atelier → Rumilly', photoId: '', statut: 'Soumise' },
    { id: 'nf3', numero: `NF-${Y}-` + '0003', userId: 'o3', affaireId: 'af1', date: d(-2), categorie: 'Péage', montantTTC: 18.6, tauxTVA: 20, description: 'Péage A41 aller-retour', photoId: '', statut: 'Soumise' },
    { id: 'nf4', numero: `NF-${Y}-` + '0004', userId: 'o1', affaireId: 'af2', date: d(-100), categorie: 'Hôtel', montantTTC: 189, tauxTVA: 10, description: '2 nuits à Fos-sur-Mer pendant l\'arrêt', photoId: '', statut: 'Remboursée' },
    { id: 'nf5', numero: `NF-${Y}-` + '0005', userId: 'o1', affaireId: 'af1', date: d(-1), categorie: 'Repas', montantTTC: 49.3, tauxTVA: 10, montantTVA: 4.48, description: 'Le Bistrot du Port — réunion de chantier', photoId: '', statut: 'Soumise',
      convives: [{ nom: 'Kevin Roux', userId: 'o1' }, { nom: 'Hugo Faure', userId: 'o5' }, { nom: 'Thomas Girard', societe: 'Laiterie des Alpes', externe: true }], ticketLu: { montantTTC: 49.3, date: d(-1), couverts: 3 } },
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
    { id: 'rs4', affaireId: 'af3', numero: 2, localisation: 'Bâtiment B – supports', description: 'Retouches de peinture sur les supports du skid', responsable: 'Pipe-Fit', echeance: d(-50), photoId: 'img-rack2', statut: 'Ouverte', pvId: 'pv2' },
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
  // Habilitations et visites médicales (dates d'expiration autour d'aujourd'hui pour montrer les alertes)
  const H = (id, userId, cle, obtenue, expire, niveau = '', numero = '') => ({ id, userId, cle, obtenue: d(obtenue), expire: d(expire), niveau, numero, fichierId: '' });
  const habilitations = [
    H('hb1', 'o1', 'visite', -600, 130, 'SIR, apte'), H('hb2', 'o1', 'qmos', -700, 25, '141 + 111, inox / P235GH', 'QMOS-2024-118'), H('hb3', 'o1', 'hauteur', -300, 400), H('hb4', 'o1', 'sst', -740, -12),
    H('hb5', 'o2', 'visite', -30, 700, 'VIP, apte'), H('hb6', 'o2', 'fluides', -900, 900, 'Catégorie I'), H('hb7', 'o2', 'elec', -1050, 45, 'BR, B1V'),
    H('hb8', 'o3', 'visite', -735, -5, 'SIR'), H('hb9', 'o3', 'caces_nacelle', -1200, 600, 'Catégories A et B'), H('hb10', 'o3', 'aipr', -1000, 800, 'Encadrant'), H('hb11', 'o3', 'sst', -400, 330),
    H('hb12', 'o4', 'visite', -230, 500, 'SIR, apte'), H('hb13', 'o4', 'qmos', -430, 300, '141, inox'),
    H('hb14', 'o5', 'visite', -530, 200, 'VIP'), H('hb15', 'o5', 'caces_chariot', -800, 1000, 'Catégorie 3'),
    H('hb16', 'o6', 'visite', -380, 350, 'VIP'), H('hb17', 'o6', 'elec', -900, 200, 'B0, H0V'),
    H('hb18', 'i1', 'visite', -580, 150, 'Visite agence intérim'), H('hb19', 'i1', 'hauteur', -1000, 90),
  ];
  // Parc : véhicules et outillage, affectations et contrôles périodiques
  const E = (cle, libelle, derniere, prochaine, periodicite) => ({ cle, libelle, derniere: derniere === null ? '' : d(derniere), prochaine: d(prochaine), periodicite });
  const materiels = [
    { id: 'pm1', categorie: 'Véhicule utilitaire', designation: 'Renault Master L3H2', marque: 'Renault', immat: 'FX-482-QA', dateAchat: d(-1460), valeur: 32000, km: 84250, kmDate: d(-3),
      affectation: { userId: 'o3', affaireId: '', depuis: d(-400) }, historique: [{ date: d(-400), userId: 'o3', affaireId: '', par: 'Administrateur' }],
      echeances: [E('ct', 'Contrôle technique', -712, 18, 24), E('entretien', 'Entretien / vidange', -240, 120, 12), E('assurance', 'Échéance assurance', -165, 200, 12)], notes: 'Galerie + porte-tubes 6 m' },
    { id: 'pm2', categorie: 'Véhicule utilitaire', designation: 'Peugeot Partner', marque: 'Peugeot', immat: 'GB-115-TR', dateAchat: d(-900), valeur: 21000, km: 56300, kmDate: d(-10),
      affectation: { userId: 'o1', affaireId: '', depuis: d(-120) }, historique: [{ date: d(-120), userId: 'o1', affaireId: '', par: 'Administrateur' }],
      echeances: [E('ct', 'Contrôle technique', null, 300, 24), E('entretien', 'Entretien / vidange', -373, -8, 12), E('assurance', 'Échéance assurance', -165, 200, 12)], notes: '' },
    { id: 'pm3', categorie: 'Nacelle / PEMP', designation: 'Nacelle ciseaux Haulotte Compact 12', marque: 'Haulotte', numeroSerie: 'HC12-55871', dateAchat: d(-2000), valeur: 18500,
      affectation: { userId: '', affaireId: 'af1', depuis: d(-30) }, historique: [{ date: d(-30), userId: '', affaireId: 'af1', par: 'Claire Martin' }],
      echeances: [E('vgp', 'VGP (vérification générale périodique)', -170, 12, 6)], notes: '' },
    { id: 'pm4', categorie: 'Poste à souder', designation: 'Poste TIG Fronius MagicWave 230i', marque: 'Fronius', numeroSerie: 'FR-30158822', dateAchat: d(-700), valeur: 6200,
      affectation: { userId: 'o1', affaireId: '', depuis: d(-90) }, historique: [], echeances: [E('elec', 'Vérification électrique', -215, 150, 12)], notes: '' },
    { id: 'pm5', categorie: 'Appareil de mesure', designation: 'Manomètre étalon 0-60 bar (épreuves hydrauliques)', marque: 'Wika', numeroSerie: 'WK-2209-17', dateAchat: d(-1100), valeur: 850,
      affectation: { userId: '', affaireId: '', depuis: '' }, historique: [], echeances: [E('etalonnage', 'Étalonnage', -385, -20, 12)], notes: 'Rangé à l\'atelier, armoire métrologie' },
    { id: 'pm6', categorie: 'Échafaudage', designation: 'Échafaudage roulant Layher Uni 8 m', marque: 'Layher', dateAchat: d(-1600), valeur: 3900,
      affectation: { userId: '', affaireId: 'af1', depuis: d(-30) }, historique: [{ date: d(-30), userId: '', affaireId: 'af1', par: 'Claire Martin' }], echeances: [E('verif', 'Vérification avant mise en service / trimestrielle', -30, 60, 3)], notes: '' },
    { id: 'pm7', categorie: 'Récupération fluides frigorigènes', designation: 'Station de récupération + balance électronique', marque: 'Refco', numeroSerie: 'RF-88120', dateAchat: d(-500), valeur: 2400,
      affectation: { userId: 'o2', affaireId: '', depuis: d(-60) }, historique: [], echeances: [E('etalonnage', 'Contrôle / étalonnage (détecteur, balance)', -145, 220, 12)], notes: '' },
  ];
  // Missions d'intérim (registre du personnel : entrées et sorties des salariés temporaires)
  const AG = { agenceId: 'e8' };
  const missions = [
    { id: 'mi1', userId: 'i1', nom: 'Yanis Morel', nationalite: 'Française', dateNaissance: '1996-04-12', sexe: 'M', qualification: 'Tuyauteur N2P2', ...AG, numeroContrat: 'MAD-2026-02114', motif: 'accroissement',
      motifDetail: 'Chantier skid de dosage', dateEntree: d(-300), finPrevue: d(-250), dateSortie: d(-250), finMotif: 'Fin de mission', affaireIds: ['af3'], notes: '' },
    { id: 'mi2', userId: 'i1', nom: 'Yanis Morel', nationalite: 'Française', dateNaissance: '1996-04-12', sexe: 'M', qualification: 'Tuyauteur N2P2', ...AG, numeroContrat: 'MAD-2026-03390', motif: 'accroissement',
      motifDetail: 'Ligne NEP Rumilly', dateEntree: d(-90), finPrevue: d(30), dateSortie: '', affaireIds: ['af1'], notes: '' },
    { id: 'mi3', userId: 'i2', nom: 'Damien Leroy', nationalite: 'Portugaise', dateNaissance: '1989-11-03', sexe: 'M', qualification: 'Soudeur TIG N3P1', ...AG, numeroContrat: 'MAD-2026-03511', motif: 'remplacement',
      motifDetail: 'Remplacement de R. Blanc (arrêt maladie)', dateEntree: d(-40), finPrevue: d(-2), dateSortie: '', affaireIds: ['af1'], notes: '' },
  ];
  // Registre des fluides frigorigènes : équipements des clients, bouteilles, fiches d'intervention
  const equipementsFrigo = [
    { id: 'eqf1', clientId: 'e2', siteId: 's4', designation: 'Groupe froid chambre négative', localisation: 'Toiture bât. expédition', fluide: 'R449A', charge: 45, marque: 'Bitzer', modele: 'LH124E', numeroSerie: 'BZ-2017-55410', miseEnService: d(-2900), detectionPermanente: false },
    { id: 'eqf2', clientId: 'e2', siteId: 's4', designation: 'Climatisation salle de conditionnement', localisation: 'Local technique 2', fluide: 'R410A', charge: 12.5, marque: 'Daikin', modele: 'RZQG140', numeroSerie: 'DK-140-88213', miseEnService: d(-1800) },
    { id: 'eqf3', clientId: 'e3', siteId: 's5', designation: 'Groupe d\'eau glacée process', localisation: 'Bâtiment utilités', fluide: 'R134a', charge: 380, marque: 'Carrier', modele: '30XW', numeroSerie: 'CA-30XW-1021', miseEnService: d(-3200), detectionPermanente: true },
    { id: 'eqf4', clientId: 'e3', designation: 'Ancienne armoire de climatisation', localisation: 'Salle informatique', fluide: 'R22', charge: 6, marque: 'Airwell', modele: 'CRS', miseEnService: d(-8000) },
    { id: 'eqf5', clientId: 'e1', siteId: 's2', designation: 'Pompe à chaleur bureaux', localisation: 'Façade nord', fluide: 'R32', charge: 3.2, marque: 'Mitsubishi', modele: 'PUZ-ZM100', miseEnService: d(-400) },
  ];
  const bouteilles = [
    { id: 'bt1', numero: 'R449A-8812', fluide: 'R449A', type: 'neuve', contenance: 10, masseInitiale: 10, userId: 'o2', fournisseurId: '' },
    { id: 'bt2', numero: 'REC-4471', fluide: 'R449A', type: 'recuperation', contenance: 27, masseInitiale: 0, userId: 'o2', fournisseurId: '' },
    { id: 'bt3', numero: 'R410A-3021', fluide: 'R410A', type: 'neuve', contenance: 11.3, masseInitiale: 11.3, userId: 'o2', fournisseurId: '' },
  ];
  const ff = (id, numero, eq, j, nature, extra) => ({ id, numero, equipementId: eq, clientId: (equipementsFrigo.find(e => e.id === eq) || {}).clientId, date: d(j), nature, userId: 'o2', detecteur: 'Détecteur électronique Testo 316-4 (contrôlé le ' + d(-120).split('-').reverse().join('/') + ')',
    fuites: [], statut: 'Signée', signataireNom: 'Thomas Girard', signataireQualite: 'Chargé de travaux', signeLe: new Date(today.getTime() + j * 86400000).toISOString(), ...extra });
  const fichesFluides = [
    ff('ffi1', `FI-${Y}-0001`, 'eqf1', -200, 'controlePeriodique', {}),
    ff('ffi2', `FI-${Y}-0002`, 'eqf1', -20, 'maintenance', { fuites: [{ localisation: 'Raccord flare détendeur évaporateur 2', reparee: true }], chargeVierge: 3.4, bouteilleCharge: 'bt1', observations: 'Raccord refait, recharge après tirage au vide.' }),
    ff('ffi3', `FI-${Y}-0003`, 'eqf2', -340, 'controlePeriodique', {}),
    ff('ffi5', `FI-${Y}-0005`, 'eqf3', -190, 'controlePeriodique', { signataireNom: 'Service maintenance', signataireQualite: 'Pharmasynth' }),
    ff('ffi4', `FI-${Y}-0004`, 'eqf4', -60, 'demantelement', { recupTraitement: 5.6, bouteilleRecup: 'bt2', signataireNom: 'Service maintenance', signataireQualite: 'Pharmasynth', observations: 'Armoire R22 déposée, fluide récupéré pour destruction.' }),
  ];
  // Produits dangereux transportés dans les véhicules et leurs FDS
  const produits = [
    { id: 'pr1', nom: 'Acétylène dissous', fabricant: 'Air Liquide', usage: 'Soudage et coupage oxyacétylénique', pictos: ['GHS02', 'GHS04'], mentionsH: 'H220, H230, H280', epi: 'Lunettes de soudage, gants cuir',
      stockage: 'Bouteille debout, arrimée, robinet fermé ; véhicule ventilé', secours: 'Inhalation : air frais, repos. Brûlure : refroidir à l\'eau 15 min.', fdsFichierId: 'pdf-fds-acetylene', fdsNom: 'FDS Acétylène dissous.pdf', dateFds: d(-400) },
    { id: 'pr2', nom: 'Oxygène comprimé', fabricant: 'Air Liquide', usage: 'Soudage et coupage oxyacétylénique', pictos: ['GHS03', 'GHS04'], mentionsH: 'H270, H280', epi: 'Gants propres, sans graisse',
      stockage: 'Bouteille debout, arrimée ; aucune graisse sur le détendeur', secours: 'Brûlure : refroidir à l\'eau. Vêtements imprégnés : s\'éloigner de toute flamme.', fdsFichierId: 'pdf-fds-oxygene', fdsNom: 'FDS Oxygène.pdf', dateFds: d(-400) },
    { id: 'pr3', nom: 'Argon (gaz de protection TIG)', fabricant: 'Linde', usage: 'Soudage TIG inox', pictos: ['GHS04'], mentionsH: 'H280', epi: '',
      stockage: 'Bouteille arrimée', secours: 'Asphyxie en local confiné : sortir la victime à l\'air libre, appeler le 15.', fdsFichierId: 'pdf-fds-argon', fdsNom: 'FDS Argon.pdf', dateFds: d(-1500) },
    { id: 'pr4', nom: 'Pâte de décapage inox', fabricant: 'Fabricant de démonstration', usage: 'Décapage et passivation des soudures inox', pictos: ['GHS05', 'GHS06', 'GHS08'], mentionsH: 'H300+H310+H330, H314, H373',
      epi: 'Gants nitrile longs, lunettes étanches, tablier', stockage: 'Pot fermé, dans un bac de rétention', secours: 'Contact peau : rincer 15 min et appliquer le gel de gluconate de calcium. Appeler le 15.', fdsFichierId: 'pdf-fds-decapant', fdsNom: 'FDS Pâte de décapage.pdf', dateFds: d(-200) },
    { id: 'pr5', nom: 'Colle PVC pression', fabricant: 'Fabricant de démonstration', usage: 'Collage des canalisations PVC', pictos: ['GHS02', 'GHS07'], mentionsH: 'H225, H319, H336', epi: 'Gants nitrile, lunettes',
      stockage: 'Flacon fermé, à l\'abri de la chaleur', secours: 'Yeux : rincer 15 min à l\'eau.', fdsFichierId: 'pdf-fds-colle', fdsNom: 'FDS Colle PVC.pdf', dateFds: d(-300) },
    { id: 'pr6', nom: 'Spray dégrippant', fabricant: 'Fabricant de démonstration', usage: 'Démontage de brides et boulonnerie', pictos: ['GHS02', 'GHS07'], mentionsH: 'H222, H229, H336', epi: 'Gants', stockage: 'Aérosol à l\'abri de la chaleur', secours: '' },
  ];
  materiels.find(m => m.id === 'pm1').produits = ['pr1', 'pr2', 'pr5'];
  materiels.find(m => m.id === 'pm2').produits = ['pr3', 'pr4', 'pr6'];
  // Plan de prévention annuel du client et préparation du PPSPS de la ligne NEP
  entreprises.find(e => e.id === 'e2').plansPrevention = [{ id: 'pp1', nom: `Plan de prévention annuel ${new Date().getFullYear()} – Laiterie des Alpes`, fichierId: 'pdf-pdp-laiterie', debut: d(-280), fin: d(85), siteId: '', note: 'Inspection commune faite avec le responsable maintenance' }];
  Object.assign(affaires.find(a => a.id === 'af1'), { securite: { coordonnateur: '', contraintes: 'Site agroalimentaire en production : accueil sécurité au poste de garde, badge nominatif. Permis de feu obligatoire pour toute soudure ou meulage. Travaux dans le rack à 4 m de hauteur depuis la nacelle. Coactivité avec l\'entreprise de calorifuge. Lignes NEP en service : consignation par la maintenance avant toute ouverture.',
    risques: { feu: { mesures: 'Permis de feu délivré par la maintenance de la laiterie chaque matin. Extincteur CO2 au pied de la nacelle. Surveillance 2 h après la dernière soudure. Écran de soudage pour protéger les lignes voisines.', epi: 'Masque de soudeur, gants et tablier cuir' },
      hauteur: { mesures: 'Travail dans le rack depuis la nacelle ciseaux (VGP à jour). Échafaudage roulant Layher vérifié avant mise en service.', epi: 'Harnais en nacelle, casque à jugulaire' },
      chimique: { mesures: 'Décapage des soudures inox à la pâte : FDS dans le véhicule, bac de rétention, rinçage à l\'eau récupéré. Aucun contact avec les produits NEP de la laiterie.', epi: 'Gants nitrile longs, lunettes étanches' } },
    urgences: { samu: '15', pompiers: '18', europe: '112', antipoison: '04 72 11 69 11' }, hopital: 'Centre hospitalier Annecy Genevois, 1 avenue de l\'Hôpital, Épagny Metz-Tessy', rassemblement: 'Parking visiteurs, devant le poste de garde', horaires: '7 h – 12 h · 13 h – 16 h, du lundi au vendredi' } });
  return {
    files: { 'img-logo': IMAGES.logo, 'img-sig': IMAGES.signature, 'img-rack1': IMAGES.rack1, 'img-rack2': IMAGES.rack2,
      'pdf-iso': pdfExemple('Isometrique NEP aller - ISO-NEP-01 - indice B', ['Ligne NEP aller DN50 inox 316L', 'Longueur developpee : 61,8 m', '14 coudes 90 3D, 4 tes egaux, 4 brides PN16', 'Supportage tous les 2,5 m (colliers sur rail)', 'Indice B : cotes de raccordement mises a jour']),
      'pdf-iso-a': pdfExemple('Isometrique NEP aller - ISO-NEP-01 - indice A', ['Premiere diffusion']),
      'pdf-ft-vanne': pdfExemple('Fiche technique - vanne papillon DN50 PN16', ['Corps fonte GS, papillon inox 316', 'Manchette EPDM alimentaire', 'Commande par levier crante', 'Couple de serrage des boulons : 60 N.m']),
      'pdf-ppsps': pdfExemple('PPSPS - Laiterie des Alpes, usine de Rumilly', ['Accueil securite au poste de garde (badge nominatif)', 'Permis de feu obligatoire pour toute soudure', 'EPI : casque, lunettes, chaussures, gants, bouchons', 'Point de rassemblement : parking visiteurs']),
      'pdf-fds-acetylene': pdfExemple('FDS - Acetylene dissous', ['Rubrique 2 : H220 gaz extremement inflammable, H230, H280', 'Rubrique 4 : inhalation - air frais', 'Rubrique 7 : stocker debout, arrime, ventile', 'Document d\'exemple : utilisez la FDS de votre fournisseur']),
      'pdf-fds-oxygene': pdfExemple('FDS - Oxygene comprime', ['H270 peut provoquer ou aggraver un incendie ; comburant', 'H280 gaz sous pression', 'Aucune graisse ni huile sur les raccords']),
      'pdf-fds-argon': pdfExemple('FDS - Argon', ['H280 gaz sous pression', 'Risque d\'asphyxie en espace confine']),
      'pdf-fds-decapant': pdfExemple('FDS - Pate de decapage inox', ['Contient acide fluorhydrique et acide nitrique', 'H300+H310+H330 mortel par ingestion, contact cutane, inhalation', 'H314 brulures graves de la peau et lesions oculaires', 'Premiers secours : gel de gluconate de calcium, appeler le 15']),
      'pdf-fds-colle': pdfExemple('FDS - Colle PVC pression', ['H225 liquide et vapeurs tres inflammables', 'H319 irritation des yeux, H336 somnolence']),
      'pdf-pdp-laiterie': pdfExemple('Plan de prevention annuel - Laiterie des Alpes', ['Entreprise utilisatrice : Laiterie des Alpes', 'Entreprise exterieure : Pipe-Fit Industrie', 'Inspection commune prealable realisee', 'Permis de feu et consignations delivres par la maintenance', 'Zones de production : charlotte et blouse obligatoires']),
      'pdf-calcul': pdfExemple('Note de calcul du supportage', ['Usage interne au bureau']),
      'pdf-chaufferie': pdfExemple('Plan de la chaufferie existante - indice A', ['Residence Les Tilleuls, Echirolles', 'Collecteurs depart / retour DN150 a remplacer', 'Acces par la porte cote parking (cle a la loge)']) },
    settings: { tresorerie: { solde: 315000, dateSolde: d(-1), chargesFixes: 9500, delaiFournisseurs: 45, tauxCharges: 45, retards: true }, fluides: { numero: 'FR-ATT-2024-01587', categorie: 'I', organisme: 'Organisme agréé (démonstration)', validite: d(800) }, societe: 'Pipe-Fit Industrie', adresse: 'ZI des Forges – 69800 Saint-Priest', siret: '000 000 000 00000', tva: 20, tauxHoraireDefaut: 58, delaiPaiement: 45, dureeHebdo: 35, seuilHS50: 43, montantPanier: 10.5,
      compta: { journal: 'VT', journalLib: 'Ventes', compteClient: '411000', compteTravaux: '704000', compteLivraison: '708500', compteTVA: '445710', compteRG: '411700', auxiliaires: true, emailComptable: 'compta@cabinet-exemple.fr' },
      doc: { logoId: 'img-logo', masquerNom: true, logoHauteur: 56, couleur: '#8f2f1a', police: 'sans', tel: '04 72 00 00 00', email: 'contact@pipefit.example', web: 'www.pipefit.example',
        tvaIntra: 'FR00000000000', formeJuridique: 'SAS', capital: '150 000 €', rcs: 'Lyon 000 000 000', ape: '4322B', banque: 'Banque de démonstration', iban: 'FR76 0000 0000 0000 0000 0000 000', bic: 'DEMOFRPPXXX',
        types: { devis: { conditions: 'Acompte de 30 % à la commande. Travaux réalisés selon les normes EN 13480 et le DTU en vigueur. Hors génie civil, calorifuge et échafaudages sauf mention contraire.' },
          facture: { conditions: 'Paiement par virement à 45 jours fin de mois.' } } } },
    users, mainoeuvre, zones, articles, entreprises, contacts, affaires, devis, situations, commandes, factures, planning, temps, frais, rapports, reserves, receptions, consommations, envois, achats, efactures, familles, consultations, ouvrages, notifications, habilitations, materiels, missions, produits, equipementsFrigo, fichesFluides, bouteilles, enlevements, epreuves, releves, misesEnService, equilibrages,
  };
}

if (typeof module !== 'undefined') module.exports = { demoData, uid };
