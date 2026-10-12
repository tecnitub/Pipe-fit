// Données de démonstration chargées au premier démarrage (base vide).
const crypto = require('node:crypto');

const uid = () => crypto.randomBytes(5).toString('hex') + Date.now().toString(36).slice(-4);
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
    { id: 'u1', nom: 'Claire Martin', role: 'charge', tauxHoraire: 65, capaciteHebdo: 35 },
    { id: 'u2', nom: 'Julien Bernard', role: 'charge', tauxHoraire: 65, capaciteHebdo: 35 },
    { id: 'u3', nom: 'Atelier Pressage', role: 'atelier', tauxHoraire: 48, capaciteHebdo: 70 },
    { id: 'u4', nom: 'Atelier Cuisson / Four', role: 'atelier', tauxHoraire: 52, capaciteHebdo: 105 },
    { id: 'u5', nom: 'Atelier Émaillage', role: 'atelier', tauxHoraire: 50, capaciteHebdo: 35 },
  ];
  const zones = [
    { id: 'z1', nom: 'Zone 1 (< 50 km)', forfait: 90, prixParTonne: 12, coutTransporteur: 75, coutParTonne: 9 },
    { id: 'z2', nom: 'Zone 2 (50–150 km)', forfait: 180, prixParTonne: 22, coutTransporteur: 160, coutParTonne: 18 },
    { id: 'z3', nom: 'Zone 3 (> 150 km)', forfait: 320, prixParTonne: 35, coutTransporteur: 290, coutParTonne: 30 },
    { id: 'z0', nom: 'Enlèvement usine', forfait: 0, prixParTonne: 0, coutTransporteur: 0, coutParTonne: 0 },
  ];
  const articles = [
    { id: 'a1', ref: 'TC-PLT-ROU', designation: 'Tuile plate terre cuite 17x27 – rouge', famille: 'Tuiles', unite: 'm²', prixVente: 38.5, coutRevient: 21.0, poidsUnitaire: 68, heuresUnitaires: 0.12 },
    { id: 'a2', ref: 'TC-RMN-VIE', designation: 'Tuile romane canal – vieilli', famille: 'Tuiles', unite: 'm²', prixVente: 32.0, coutRevient: 17.5, poidsUnitaire: 45, heuresUnitaires: 0.09 },
    { id: 'a3', ref: 'TC-MEC-ARD', designation: 'Tuile mécanique grand moule – ardoisé', famille: 'Tuiles', unite: 'm²', prixVente: 27.8, coutRevient: 14.9, poidsUnitaire: 42, heuresUnitaires: 0.07 },
    { id: 'a4', ref: 'TC-FAI-REN', designation: 'Faîtière ronde à emboîtement', famille: 'Accessoires', unite: 'ml', prixVente: 24.0, coutRevient: 11.2, poidsUnitaire: 9, heuresUnitaires: 0.15 },
    { id: 'a5', ref: 'TC-RIV-GAU', designation: 'Rive à rabat gauche', famille: 'Accessoires', unite: 'u', prixVente: 6.9, coutRevient: 3.1, poidsUnitaire: 3.2, heuresUnitaires: 0.04 },
    { id: 'a6', ref: 'TC-CHA-VEN', designation: 'Chatière de ventilation', famille: 'Accessoires', unite: 'u', prixVente: 14.5, coutRevient: 6.8, poidsUnitaire: 2.8, heuresUnitaires: 0.06 },
    { id: 'a7', ref: 'TC-SPE-MH', designation: 'Tuile spéciale Monument Historique (moule sur mesure)', famille: 'Sur mesure', unite: 'm²', prixVente: 95.0, coutRevient: 52.0, poidsUnitaire: 72, heuresUnitaires: 0.45 },
    { id: 'a8', ref: 'SRV-MOULE', designation: 'Création de moule spécifique', famille: 'Prestations', unite: 'forfait', prixVente: 2400, coutRevient: 1300, poidsUnitaire: 0, heuresUnitaires: 24 },
    { id: 'a9', ref: 'PAL-CONS', designation: 'Palette consignée', famille: 'Logistique', unite: 'u', prixVente: 18, coutRevient: 12, poidsUnitaire: 25, heuresUnitaires: 0 },
  ];
  const clients = [
    { id: 'c1', nom: 'Négoce Matériaux du Sud', type: 'Négoce', ville: 'Toulouse', cp: '31000', contact: 'P. Garcia', tel: '05 61 00 00 00', email: 'achats@nms.example', zoneId: 'z1' },
    { id: 'c2', nom: 'Couverture Dupuis & Fils', type: 'Couvreur', ville: 'Albi', cp: '81000', contact: 'M. Dupuis', tel: '05 63 00 00 00', email: 'contact@dupuis.example', zoneId: 'z2' },
    { id: 'c3', nom: 'Atelier du Patrimoine', type: 'Entreprise MH', ville: 'Bordeaux', cp: '33000', contact: 'S. Leroy', tel: '05 56 00 00 00', email: 'sleroy@patrimoine.example', zoneId: 'z3' },
    { id: 'c4', nom: 'Promogim Habitat', type: 'Promoteur', ville: 'Montauban', cp: '82000', contact: 'A. Petit', tel: '05 63 11 11 11', email: 'apetit@promo.example', zoneId: 'z1' },
  ];
  const affaires = [
    { id: 'af1', code: 'AF-001', nom: 'Lotissement Les Vignes – 24 maisons', clientId: 'c4', chargeId: 'u1', statut: 'En production', dateCreation: d(-60), heuresPrevues: 900, rex: { note: '', positif: '', negatif: '', actions: '' } },
    { id: 'af2', code: 'AF-002', nom: 'Restauration église Saint-Michel', clientId: 'c3', chargeId: 'u2', statut: 'Facturée', dateCreation: d(-120), heuresPrevues: 180, rex: { note: 3, positif: 'Bonne maîtrise du moule spécifique, client satisfait du rendu.', negatif: 'Sous-estimation des heures d\'émaillage (+35 %). Deux fournées rebutées.', actions: 'Ajouter 30 % de marge d\'heures sur les teintes MH. Faire un essai de cuisson avant devis.' } },
    { id: 'af3', code: 'AF-003', nom: 'Approvisionnement négoce T4', clientId: 'c1', chargeId: 'u1', statut: 'Facturée', dateCreation: d(-90), heuresPrevues: 120, rex: { note: 4, positif: 'Production standard, délais tenus.', negatif: 'Remise négociée trop élevée.', actions: 'Plancher de remise à 8 % sur le négoce.' } },
    { id: 'af4', code: 'AF-004', nom: 'Réfection toiture grange', clientId: 'c2', chargeId: 'u2', statut: 'Devis envoyé', dateCreation: d(-10), heuresPrevues: 40, rex: { note: '', positif: '', negatif: '', actions: '' } },
    { id: 'af5', code: 'AF-005', nom: 'Résidence Le Parc', clientId: 'c4', chargeId: 'u2', statut: 'Perdue', dateCreation: d(-45), heuresPrevues: 0, rex: { note: '', positif: '', negatif: 'Perdu sur le prix face à la tuile béton.', actions: 'Proposer une variante mécanique grand moule.' } },
  ];
  const line = (aid, qte, remise = 0) => {
    const a = articles.find(x => x.id === aid);
    return { articleId: aid, designation: a.designation, unite: a.unite, qte, pu: a.prixVente, remise, cout: a.coutRevient, poids: a.poidsUnitaire, heures: a.heuresUnitaires };
  };
  const devis = [
    { id: 'dv1', numero: `DV-${Y}-` + '0001', affaireId: 'af1', date: d(-55), validite: 30, statut: 'Accepté', zoneId: 'z1', remiseGlobale: 5, lignes: [line('a3', 1900), line('a4', 420), line('a5', 300), line('a6', 96), line('a9', 40)] },
    { id: 'dv2', numero: `DV-${Y}-` + '0002', affaireId: 'af2', date: d(-115), validite: 60, statut: 'Accepté', zoneId: 'z3', remiseGlobale: 0, lignes: [line('a8', 1), line('a7', 320), line('a4', 60)] },
    { id: 'dv3', numero: `DV-${Y}-` + '0003', affaireId: 'af3', date: d(-88), validite: 30, statut: 'Accepté', zoneId: 'z1', remiseGlobale: 12, lignes: [line('a1', 800), line('a2', 600), line('a4', 150), line('a9', 30)] },
    { id: 'dv4', numero: `DV-${Y}-` + '0004', affaireId: 'af4', date: d(-8), validite: 30, statut: 'Envoyé', zoneId: 'z2', remiseGlobale: 0, lignes: [line('a2', 210), line('a4', 24), line('a6', 8)] },
    { id: 'dv5', numero: `DV-${Y}-` + '0005', affaireId: 'af5', date: d(-40), validite: 30, statut: 'Refusé', zoneId: 'z1', remiseGlobale: 3, lignes: [line('a1', 2200), line('a4', 500)] },
  ];
  const factures = [
    { id: 'fa1', numero: `FA-${Y}-` + '0001', devisId: 'dv2', affaireId: 'af2', date: d(-20), echeance: d(25), statut: 'Payée', lignes: JSON.parse(JSON.stringify(devis[1].lignes)), zoneId: 'z3', remiseGlobale: 0 },
    { id: 'fa2', numero: `FA-${Y}-` + '0002', devisId: 'dv3', affaireId: 'af3', date: d(-35), echeance: d(10), statut: 'Émise', lignes: JSON.parse(JSON.stringify(devis[2].lignes)), zoneId: 'z1', remiseGlobale: 12 },
  ];
  const planning = [];
  const temps = [];
  // Planning : 6 semaines glissantes
  for (let i = -2; i <= 3; i++) {
    planning.push({ id: uid(), affaireId: 'af1', userId: 'u3', semaine: w(i), heuresPrevues: 40, libelle: 'Pressage tuiles mécaniques' });
    planning.push({ id: uid(), affaireId: 'af1', userId: 'u4', semaine: w(i), heuresPrevues: i === 1 ? 110 : 60, libelle: 'Cuisson' });
    planning.push({ id: uid(), affaireId: 'af1', userId: 'u1', semaine: w(i), heuresPrevues: 6, libelle: 'Suivi affaire' });
  }
  planning.push({ id: uid(), affaireId: 'af4', userId: 'u2', semaine: w(0), heuresPrevues: 8, libelle: 'Chiffrage / relance' });
  // Heures passées
  const pushT = (aid, uidv, offset, h, tache) => temps.push({ id: uid(), affaireId: aid, userId: uidv, date: d(offset), heures: h, tache });
  for (let i = 1; i <= 14; i++) { pushT('af1', 'u3', -i, 8, 'Pressage'); pushT('af1', 'u4', -i, 10, 'Cuisson'); }
  pushT('af1', 'u1', -3, 4, 'Réunion chantier');
  // AF-002 : dépassement d'heures (REX)
  for (let i = 0; i < 12; i++) { pushT('af2', 'u5', -100 + i, 9, 'Émaillage MH'); pushT('af2', 'u4', -100 + i, 7, 'Cuisson MH'); }
  pushT('af2', 'u2', -110, 30, 'Études & moule');
  // AF-003 : dans le budget
  for (let i = 0; i < 10; i++) { pushT('af3', 'u3', -80 + i, 6, 'Pressage'); pushT('af3', 'u4', -80 + i, 4.5, 'Cuisson'); }
  pushT('af3', 'u1', -85, 6, 'Suivi');

  return {
    settings: { societe: 'Tuilerie Industrielle', adresse: 'ZI des Argiles – 31000 Toulouse', siret: '000 000 000 00000', tva: 20, tauxHoraireDefaut: 55, delaiPaiement: 45 },
    users, zones, articles, clients, affaires, devis, factures, planning, temps,
  };
}

module.exports = { demoData, uid };
