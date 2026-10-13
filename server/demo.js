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
    { id: 'u1', nom: 'Claire Martin', role: 'charge', tauxHoraire: 68, capaciteHebdo: 35 },
    { id: 'u2', nom: 'Julien Bernard', role: 'charge', tauxHoraire: 68, capaciteHebdo: 35 },
    { id: 'u3', nom: 'Atelier préfabrication', role: 'atelier', tauxHoraire: 52, capaciteHebdo: 105 },
    { id: 'u4', nom: 'Soudeurs (orbital / TIG)', role: 'atelier', tauxHoraire: 58, capaciteHebdo: 105 },
    { id: 'u5', nom: 'Équipe montage chantier', role: 'atelier', tauxHoraire: 55, capaciteHebdo: 140 },
    { id: 'u6', nom: "Bureau d'études", role: 'atelier', tauxHoraire: 62, capaciteHebdo: 35 },
  ];
  const zones = [
    { id: 'z1', nom: 'Zone 1 (< 50 km)', forfait: 120, prixParTonne: 25, coutTransporteur: 95, coutParTonne: 18 },
    { id: 'z2', nom: 'Zone 2 (50–150 km)', forfait: 240, prixParTonne: 40, coutTransporteur: 200, coutParTonne: 30 },
    { id: 'z3', nom: 'Zone 3 (> 150 km)', forfait: 420, prixParTonne: 60, coutTransporteur: 360, coutParTonne: 48 },
    { id: 'z0', nom: 'Enlèvement à l\'atelier', forfait: 0, prixParTonne: 0, coutTransporteur: 0, coutParTonne: 0 },
  ];
  const articles = [
    { id: 'a1', ref: 'TUB-316-050', designation: 'Tube inox 316L DN50 sch10S', famille: 'Tubes', unite: 'ml', prixVente: 68, coutRevient: 41, poidsUnitaire: 4.1, heuresUnitaires: 0.15 },
    { id: 'a2', ref: 'TUB-316-100', designation: 'Tube inox 316L DN100 sch10S', famille: 'Tubes', unite: 'ml', prixVente: 132, coutRevient: 82, poidsUnitaire: 8.4, heuresUnitaires: 0.25 },
    { id: 'a3', ref: 'TUB-P235-150', designation: 'Tube acier P235GH DN150 ép. 4,5', famille: 'Tubes', unite: 'ml', prixVente: 74, coutRevient: 46, poidsUnitaire: 18.2, heuresUnitaires: 0.3 },
    { id: 'a4', ref: 'COU-316-050', designation: 'Coude 90° 3D inox 316L DN50', famille: 'Raccords', unite: 'u', prixVente: 38, coutRevient: 21, poidsUnitaire: 0.6, heuresUnitaires: 0.6 },
    { id: 'a5', ref: 'BRI-316-100', designation: 'Bride à collerette inox DN100 PN16', famille: 'Raccords', unite: 'u', prixVente: 115, coutRevient: 66, poidsUnitaire: 5.5, heuresUnitaires: 0.8 },
    { id: 'a6', ref: 'COU-P235-150', designation: 'Coude 90° acier P235GH DN150', famille: 'Raccords', unite: 'u', prixVente: 96, coutRevient: 54, poidsUnitaire: 7.9, heuresUnitaires: 1.2 },
    { id: 'a7', ref: 'VAN-PAP-050', designation: 'Vanne papillon DN50 PN16 à levier', famille: 'Robinetterie', unite: 'u', prixVente: 245, coutRevient: 160, poidsUnitaire: 3.2, heuresUnitaires: 0.5 },
    { id: 'a8', ref: 'SUP-RACK', designation: 'Supportage et colliers (le ml)', famille: 'Supportage', unite: 'ml', prixVente: 22, coutRevient: 9, poidsUnitaire: 1.5, heuresUnitaires: 0.2 },
    { id: 'a9', ref: 'MO-SOUD', designation: 'Soudure orbitale / TIG (heure soudeur)', famille: "Main d'œuvre", unite: 'h', prixVente: 78, coutRevient: 0, poidsUnitaire: 0, heuresUnitaires: 1 },
    { id: 'a10', ref: 'MO-MONT', designation: 'Montage sur site (heure monteur)', famille: "Main d'œuvre", unite: 'h', prixVente: 65, coutRevient: 0, poidsUnitaire: 0, heuresUnitaires: 1 },
    { id: 'a11', ref: 'ECH-SEM', designation: 'Location échafaudage', famille: 'Prestations', unite: 'semaine', prixVente: 450, coutRevient: 320, poidsUnitaire: 0, heuresUnitaires: 0 },
    { id: 'a12', ref: 'CTRL-RX', designation: 'Contrôle radiographique de soudure', famille: 'Contrôles', unite: 'u', prixVente: 95, coutRevient: 60, poidsUnitaire: 0, heuresUnitaires: 0 },
    { id: 'a13', ref: 'EPR-HYD', designation: 'Épreuve hydraulique avec PV', famille: 'Contrôles', unite: 'forfait', prixVente: 850, coutRevient: 120, poidsUnitaire: 0, heuresUnitaires: 6 },
    { id: 'a14', ref: 'ETU-ISO', designation: 'Études et isométriques', famille: 'Prestations', unite: 'forfait', prixVente: 2400, coutRevient: 0, poidsUnitaire: 0, heuresUnitaires: 32 },
    { id: 'a15', ref: 'DOS-CONST', designation: 'Dossier constructeur / DOE', famille: 'Prestations', unite: 'forfait', prixVente: 1200, coutRevient: 0, poidsUnitaire: 0, heuresUnitaires: 14 },
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
  ];
  const contacts = [
    { id: 'k1', prenom: 'Marc', nom: 'Durand', fonction: 'Chargé de travaux', entrepriseId: 'e1', siteId: 's2', tel: '04 42 00 00 01', mobile: '06 10 00 00 01', email: 'm.durand@petrosud.example' },
    { id: 'k2', prenom: 'Sophie', nom: 'Lambert', fonction: 'Acheteuse', entrepriseId: 'e1', siteId: 's1', tel: '04 91 00 00 02', mobile: '', email: 's.lambert@petrosud.example' },
    { id: 'k3', prenom: 'Thomas', nom: 'Girard', fonction: 'Chargé de travaux', entrepriseId: 'e2', siteId: 's4', tel: '04 50 00 00 03', mobile: '06 10 00 00 03', email: 't.girard@laiterie-alpes.example' },
    { id: 'k4', prenom: 'Nadia', nom: 'Benali', fonction: 'Responsable maintenance', entrepriseId: 'e3', siteId: 's5', tel: '04 72 00 00 04', mobile: '06 10 00 00 04', email: 'n.benali@pharmasynth.example' },
    { id: 'k5', prenom: 'Pierre', nom: 'Morel', fonction: 'Chargé de travaux', entrepriseId: 'e4', siteId: 's7', tel: '04 75 00 00 05', mobile: '06 10 00 00 05', email: 'p.morel@evr.example' },
    { id: 'k6', prenom: 'Julie', nom: 'Fabre', fonction: 'Commerciale', entrepriseId: 'e5', siteId: 's8', tel: '04 78 11 11 12', mobile: '', email: 'j.fabre@inoxdistri.example' },
    { id: 'k7', prenom: 'Luc', nom: 'Perrin', fonction: 'Technico-commercial', entrepriseId: 'e6', siteId: 's9', tel: '04 76 22 22 23', mobile: '06 10 00 00 07', email: 'l.perrin@ria.example' },
  ];
  const affaires = [
    { id: 'af1', code: 'AF-001', nom: 'Ligne NEP inox – Usine de Rumilly', clientId: 'e2', contactId: 'k3', siteId: 's4', chargeId: 'u1', statut: 'En production', dateCreation: d(-60), heuresPrevues: 1350, rex: { note: '', positif: '', negatif: '', actions: '' } },
    { id: 'af2', code: 'AF-002', nom: 'Remplacement collecteur vapeur DN150', clientId: 'e1', contactId: 'k1', siteId: 's2', chargeId: 'u2', statut: 'Facturée', dateCreation: d(-120), heuresPrevues: 330, rex: { note: 3, positif: 'Préfabrication des tronçons en atelier, arrêt de l\'unité tenu en 5 jours.', negatif: '6 soudures reprises après contrôle RX (accès difficile en rack). Heures soudeurs dépassées de 30 %.', actions: 'Prévoir 15 % de reprises sur les soudures en hauteur. Visite de site systématique avant chiffrage.' } },
    { id: 'af3', code: 'AF-003', nom: 'Skid de dosage – bâtiment B', clientId: 'e3', contactId: 'k4', siteId: 's5', chargeId: 'u1', statut: 'Facturée', dateCreation: d(-90), heuresPrevues: 230, rex: { note: 4, positif: 'Skid préfabriqué à 90 % en atelier, montage en 3 jours.', negatif: 'Remise commerciale trop élevée.', actions: 'Plancher de remise à 8 % sur les skids.' } },
    { id: 'af4', code: 'AF-004', nom: 'Modification réseau eau glacée', clientId: 'e4', contactId: 'k5', siteId: 's7', chargeId: 'u2', statut: 'Devis envoyé', dateCreation: d(-10), heuresPrevues: 120, rex: { note: '', positif: '', negatif: '', actions: '' } },
    { id: 'af5', code: 'AF-005', nom: 'Arrêt technique – lot tuyauterie', clientId: 'e1', contactId: 'k1', siteId: 's2', chargeId: 'u2', statut: 'Perdue', dateCreation: d(-45), heuresPrevues: 0, rex: { note: '', positif: '', negatif: 'Perdu sur le délai de mobilisation des équipes.', actions: 'Proposer une équipe d\'astreinte pour les arrêts techniques.' } },
  ];
  const line = (aid, qte, remise = 0) => {
    const a = articles.find(x => x.id === aid);
    return { articleId: aid, designation: a.designation, unite: a.unite, qte, pu: a.prixVente, remise, cout: a.coutRevient, poids: a.poidsUnitaire, heures: a.heuresUnitaires };
  };
  const ref = af => { const a = affaires.find(x => x.id === af); return { clientId: a.clientId, contactId: a.contactId, siteId: a.siteId }; };
  const devis = [
    { id: 'dv1', numero: `DV-${Y}-` + '0001', affaireId: 'af1', ...ref('af1'), date: d(-55), validite: 30, statut: 'Accepté', zoneId: 'z2', remiseGlobale: 5, lignes: [line('a14', 1), line('a1', 1200), line('a2', 300), line('a4', 400), line('a5', 80), line('a7', 24), line('a8', 600), line('a9', 380), line('a10', 260), line('a13', 1)] },
    { id: 'dv2', numero: `DV-${Y}-` + '0002', affaireId: 'af2', ...ref('af2'), date: d(-115), validite: 60, statut: 'Accepté', zoneId: 'z3', remiseGlobale: 0, lignes: [line('a3', 180), line('a6', 24), line('a8', 180), line('a9', 140), line('a10', 90), line('a11', 2), line('a12', 40), line('a13', 1)] },
    { id: 'dv3', numero: `DV-${Y}-` + '0003', affaireId: 'af3', ...ref('af3'), date: d(-88), validite: 30, statut: 'Accepté', zoneId: 'z1', remiseGlobale: 12, lignes: [line('a14', 1), line('a1', 160), line('a4', 70), line('a7', 12), line('a9', 90), line('a10', 40), line('a15', 1)] },
    { id: 'dv4', numero: `DV-${Y}-` + '0004', affaireId: 'af4', ...ref('af4'), date: d(-8), validite: 30, statut: 'Envoyé', zoneId: 'z2', remiseGlobale: 0, lignes: [line('a2', 90), line('a5', 16), line('a8', 90), line('a9', 30), line('a10', 40), line('a13', 1)] },
    { id: 'dv5', numero: `DV-${Y}-` + '0005', affaireId: 'af5', ...ref('af5'), date: d(-40), validite: 30, statut: 'Refusé', zoneId: 'z3', remiseGlobale: 3, lignes: [line('a3', 420), line('a6', 60), line('a9', 400), line('a10', 300), line('a11', 4)] },
  ];
  const facture = (id, numero, dv, date, echeance, statut) => {
    const src = devis.find(x => x.id === dv);
    return { id, numero, devisId: dv, affaireId: src.affaireId, clientId: src.clientId, contactId: src.contactId, siteId: src.siteId, date, echeance, statut,
      lignes: JSON.parse(JSON.stringify(src.lignes)), zoneId: src.zoneId, remiseGlobale: src.remiseGlobale };
  };
  const factures = [
    facture('fa1', `FA-${Y}-` + '0001', 'dv2', d(-20), d(25), 'Payée'),
    facture('fa2', `FA-${Y}-` + '0002', 'dv3', d(-35), d(10), 'Émise'),
  ];
  const planning = [];
  const temps = [];
  // Planning : 6 semaines glissantes sur la ligne NEP
  for (let i = -2; i <= 3; i++) {
    planning.push({ id: uid(), affaireId: 'af1', userId: 'u3', semaine: w(i), heuresPrevues: i <= 0 ? 80 : 40, libelle: 'Préfabrication des lignes' });
    planning.push({ id: uid(), affaireId: 'af1', userId: 'u4', semaine: w(i), heuresPrevues: i === 1 ? 120 : 70, libelle: 'Soudure orbitale' });
    planning.push({ id: uid(), affaireId: 'af1', userId: 'u5', semaine: w(i), heuresPrevues: i >= 1 ? 105 : 0, libelle: 'Montage sur site' });
    planning.push({ id: uid(), affaireId: 'af1', userId: 'u1', semaine: w(i), heuresPrevues: 6, libelle: 'Suivi affaire / réunion chantier' });
  }
  planning.push({ id: uid(), affaireId: 'af4', userId: 'u2', semaine: w(0), heuresPrevues: 8, libelle: 'Chiffrage / visite de site' });
  planning.push({ id: uid(), affaireId: 'af4', userId: 'u6', semaine: w(1), heuresPrevues: 16, libelle: 'Relevés et isométriques' });
  // Heures passées
  const pushT = (aid, uidv, offset, h, tache) => temps.push({ id: uid(), affaireId: aid, userId: uidv, date: d(offset), heures: h, tache });
  for (let i = 1; i <= 14; i++) { pushT('af1', 'u3', -i, 12, 'Préfabrication'); pushT('af1', 'u4', -i, 10, 'Soudure orbitale'); }
  pushT('af1', 'u6', -40, 30, 'Isométriques');
  pushT('af1', 'u1', -3, 4, 'Réunion chantier');
  // AF-002 : dépassement d'heures soudeurs (REX)
  for (let i = 0; i < 12; i++) { pushT('af2', 'u4', -100 + i, 22, 'Soudure + reprises RX'); pushT('af2', 'u5', -100 + i, 9, 'Montage en rack'); }
  pushT('af2', 'u2', -110, 20, 'Visite, chiffrage, suivi');
  // AF-003 : dans le budget
  for (let i = 0; i < 10; i++) { pushT('af3', 'u3', -80 + i, 10, 'Préfabrication skid'); pushT('af3', 'u4', -80 + i, 8, 'Soudure'); }
  pushT('af3', 'u5', -68, 24, 'Montage');
  pushT('af3', 'u1', -85, 6, 'Suivi');

  return {
    settings: { societe: 'Pipe-Fit Industrie', adresse: 'ZI des Forges – 69800 Saint-Priest', siret: '000 000 000 00000', tva: 20, tauxHoraireDefaut: 58, delaiPaiement: 45 },
    users, zones, articles, entreprises, contacts, affaires, devis, factures, planning, temps,
  };
}

if (typeof module !== 'undefined') module.exports = { demoData, uid };
