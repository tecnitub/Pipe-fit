// Étude d'exemple des démonstrations (application Études et CRM) : distribution vapeur et eau chaude d'un atelier,
// chaufferie avec robinetterie, cassettes, plomberie sanitaire ; reliée au premier chantier de la démonstration.
const EtudeDemoExemple = ({ affaireId, client } = {}) => ({
    id: 'demo-etude-1', objet: 'Chaufferie vapeur atelier — distribution vapeur et réseau eau chaude', affaireId: affaireId || '', client: client || '',
    indice: 'B', date: new Date().toISOString().slice(0, 10), auteur: 'Jacky (bureau d\'études)', verificateur: 'Claire Martin', motifIndice: 'Débit vapeur porté à 1 800 kg/h',
    description: 'CCTP lot 14 indice C, plans de principe PID-CH-001 indice B.', historique: [{ indice: 'A', date: '2026-09-15', motif: 'Première émission' }],
    notes: [
      { id: 'n1', type: 'vapeur', titre: 'Collecteur vapeur 7 bar → ateliers', entrees: { p: 7, mode: 'debit', m: 1800, serie: 'acier-10216', L: 95, zeta: 9, vmax: 25, dpmax: 0.5, pc: 0.5, vflash: 15 }, commentaire: 'Purges de ligne tous les 40 m, poches de purge DN 80.' },
      { id: 'n2', type: 'reseau', titre: 'Boucle eau chaude 80/60 °C — pompe P1', entrees: {}, commentaire: '' },
      { id: 'n3', type: 'vase', titre: 'Vase d\'expansion boucle eau chaude', entrees: {}, commentaire: '' },
      { id: 'n4', type: 'isolation', titre: 'Isolation de la ligne vapeur DN 80', entrees: { serie: 'acier-10216', tube: '88.9x3.2', Tf: 170, L: 95, heures: 4000, Ta: 15, HR: 60, vent: 0, isolant: 'laine-roche', revetement: 'alu', qmax: 60, TsMax: 50, margeRosee: 1 }, commentaire: '' },
      { id: 'n5', type: 'dilatation', titre: 'Lyres de la ligne vapeur', entrees: { serie: 'acier-10216', tube: '88.9x3.2', L: 45, Tpose: 10, Tmin: 5, Tmax: 170 }, commentaire: '' },
      { id: 'n6', type: 'desp', titre: 'Classement DESP du collecteur vapeur', entrees: { equipement: 'tuyauterie', fluide: 'vapeur', PS: 12, TS: 190, DN: 100, nuance: 'P235GH', troncons: [{ rep: 'Antennes ateliers', fluide: '', DN: 50, PS: '', TS: '' }, { rep: 'Retour condensats', fluide: 'condensats', DN: 40, PS: 3, TS: 120 }] }, commentaire: '' },
      // Chaufferie, terminaux et plomberie sanitaire : alimentent la liste des mises en service du chantier
      { id: 'n7', type: 'pid', titre: 'Chaufferie bâtiment A — schéma de principe', entrees: { robinetterie: [
        { rep: 'VI1', circuit: 'Radiateurs bureaux', type: 'isolement', dn: '', qte: 4, kv: '', dp: '', ref: 'Exemplair VS-40' }, { rep: 'VE1', circuit: 'Radiateurs bureaux', type: 'equilibrage', dn: '', qte: 1, kv: 25, dp: '', ref: 'Exemplair EQ-40' },
        { rep: 'F1', circuit: 'Radiateurs bureaux', type: 'filtre', dn: '', qte: 1, kv: '', dp: 6, ref: 'Exemplair FY-40' }, { rep: 'TH1', circuit: 'Radiateurs bureaux', type: 'thermometre', dn: '', qte: 2, kv: '', dp: '', ref: '' }] }, commentaire: '' },
      { id: 'n8', type: 'terminaux', titre: 'Cassettes des bureaux', entrees: { appareils: [
        { rep: 'CA-01', local: 'Bureau 1', zone: 'R+1 — Bâtiment A', type: 'cassette4', n: 1, Pch: 3, Pfr: 3.6, batterie: '4t', vanne: '2v', Pvent: 50, alim: 'cvc', regul: 'propre', ref: 'Exemplair CK-36', fiche: { fabricant: 'Exemplair', reference: 'CK-36' } },
        { rep: 'CA-02', local: 'Bureau 2', zone: 'R+1 — Bâtiment A', type: 'cassette4', n: 1, Pch: 3, Pfr: 3.6, batterie: '4t', vanne: '2v', Pvent: 50, alim: 'cvc', regul: 'propre', ref: 'Exemplair CK-36', fiche: { fabricant: 'Exemplair', reference: 'CK-36' } },
        { rep: 'CA-03', local: 'Salle de réunion', zone: 'R+1 — Bâtiment A', type: 'cassette4', n: 1, Pch: 4.5, Pfr: 5.2, batterie: '4t', vanne: '2v', Pvent: 70, alim: 'cvc', regul: 'propre', ref: 'Exemplair CK-52', fiche: { fabricant: 'Exemplair', reference: 'CK-52' } }] }, commentaire: '' },
      { id: 'n9', type: 'ecs', titre: 'Ballon d\'eau chaude sanitaire', entrees: {}, commentaire: '' },
      { id: 'n10', type: 'sanitaire', titre: 'Eau froide et eau chaude sanitaires — vestiaires', entrees: { production: 'n9', usage: 'vestiaire' }, commentaire: '' },
      // Réseau hydraulique des cassettes : une branche par cassette (repère de l'étude) ; une fiche de mise en service
      // pour le réseau, une ligne de débit par cassette
      { id: 'n11', type: 'arbo', titre: 'Réseau eau chaude des cassettes — R+1', entrees: { troncons: [
        { rep: 'C', amont: '', nom: 'Départ pompe → collecteur R+1', L: 12, zeta: 4, tube: '', P: '', dpEm: '' },
        { rep: 'A1', amont: 'C', nom: 'Antenne bureaux', L: 18, zeta: 3, tube: '', P: '', dpEm: '' },
        { rep: 'CA-01', amont: 'A1', nom: 'Bureau 1', L: 6, zeta: 5, tube: '', emetteur: 'n8:CA-01', P: '', Q: '', dpEm: '' },
        { rep: 'CA-02', amont: 'A1', nom: 'Bureau 2', L: 10, zeta: 5, tube: '', emetteur: 'n8:CA-02', P: '', Q: '', dpEm: '' },
        { rep: 'CA-03', amont: 'A1', nom: 'Salle de réunion', L: 15, zeta: 5, tube: '', emetteur: 'n8:CA-03', P: '', Q: '', dpEm: '' }] }, commentaire: '' },
      // Ventilation des bureaux : chaque bouche a son numéro, sa pièce, sa zone et sa branche ; une fiche de mise en
      // service pour la centrale, une ligne de débit par bouche
      { id: 'n12', type: 'aero', titre: 'Ventilation des bureaux — R+1', entrees: { structure: 'arborescence', titreInstallation: 'Bureaux R+1', bouchesL: [
        { rep: 'S-01', installation: 'n12', reseau: 'soufflage', salle: 'Bureau 1', zone: 'Zone A', etage: 'R+1', type: 'plafond', Q: 200, troncon: 'S1.1', ref: 'Exemplair DF4-200', fiche: { fabricant: 'Exemplair', reference: 'DF4-200' } },
        { rep: 'S-02', installation: 'n12', reseau: 'soufflage', salle: 'Bureau 2', zone: 'Zone A', etage: 'R+1', type: 'plafond', Q: 200, troncon: 'S1.1', ref: 'Exemplair DF4-200', fiche: { fabricant: 'Exemplair', reference: 'DF4-200' } },
        { rep: 'S-03', installation: 'n12', reseau: 'soufflage', salle: 'Bureau 3', zone: 'Zone A', etage: 'R+1', type: 'plafond', Q: 200, troncon: 'S1.2', ref: 'Exemplair DF4-200', fiche: { fabricant: 'Exemplair', reference: 'DF4-200' } },
        { rep: 'S-04', installation: 'n12', reseau: 'soufflage', salle: 'Salle de réunion', zone: 'Zone B', etage: 'R+1', type: 'plafond', Q: 450, troncon: 'S2.1', ref: 'Exemplair DF4-200', fiche: { fabricant: 'Exemplair', reference: 'DF4-200' } },
        { rep: 'R-01', installation: 'n12', reseau: 'reprise', salle: 'Bureaux', zone: 'Zone A', etage: 'R+1', type: 'extraction', Q: 600, troncon: 'R1' },
        { rep: 'R-02', installation: 'n12', reseau: 'reprise', salle: 'Salle de réunion', zone: 'Zone B', etage: 'R+1', type: 'extraction', Q: 450, troncon: 'R2.1' }] }, commentaire: '' },
    ], _v: 1, _at: new Date().toISOString(), _by: 'Jacky (bureau d\'études)',
  });
if (typeof module !== 'undefined') module.exports = EtudeDemoExemple;
