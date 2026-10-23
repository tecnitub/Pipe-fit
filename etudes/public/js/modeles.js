// Modèles d'études : installations types prêtes à adapter (calculs pré-remplis, liens entre calculs, notes créées depuis
// le schéma). Les études enregistrées comme modèle par le bureau (drapeau « modele ») s'ajoutent à cette liste.
const Modeles = ((N, L) => {
  // Notes : { cle, type, titre, entrees } ; « bilan: cle » dans un circuit reprend la puissance de ce bilan ; liees : notes du schéma
  const INTEGRES = [
    { id: 'chaufferie-cascade', nom: 'Chaufferie gaz : 2 chaudières à condensation en cascade', objet: 'Chaufferie gaz — cascade de 2 chaudières à condensation',
      description: 'Bouteille de découplage, radiateurs, CTA, plancher chauffant, ECS ; réseaux et pompes, vannes, vase, isolation.',
      notes: [{ cle: 'pid', type: 'pid', titre: 'Schéma de principe de la chaufferie', entrees: { reseau: 'ch-70-50', generateur: 'chaudiere-cond', nGen: '2', Pgen: 150, bouteille: 'oui' } },
        { type: 'isolation', titre: 'Isolation des réseaux de chauffage', entrees: { Tf: 70, Ta: 15, isolant: 'laine-roche', revetement: 'pvc', tube: '76.1x2.9' } }], liees: ['pid'] },
    { id: 'eau-glacee', nom: 'Production d\'eau glacée de bureaux', objet: 'Production d\'eau glacée — 2 groupes froids',
      description: '2 groupes froids air/eau, bouteille, ballon tampon, CTA et ventilo-convecteurs ; isolation anti-condensation.',
      notes: [{ cle: 'pid', type: 'pid', titre: 'Schéma de principe eau glacée', entrees: { titreInstallation: 'Production d\'eau glacée', reseau: 'eg-7-12', generateur: 'gf-air', nGen: '2', Pgen: 200, bouteille: 'oui', tampon: 'oui', ratioTampon: 8,
        circuits: [{ rep: 'CTA bureaux', emetteur: 'cta', P: 150, regime: '', regulation: '3v', L: 80 }, { rep: 'Ventilos R+1', emetteur: 'ventilo', P: 110, regime: '', regulation: '2v', L: 160 },
          { rep: 'Ventilos R+2', emetteur: 'ventilo', P: 110, regime: '', regulation: '2v', L: 190 }] } },
        { type: 'isolation', titre: 'Isolation du réseau d\'eau glacée', entrees: { Tf: 7, Ta: 26, HR: 65, isolant: 'elastomere', revetement: 'pvc', tube: '88.9x3.2' } }], liees: ['pid'] },
    { id: 'atelier', nom: 'Atelier industriel : bilan et aérothermes', objet: 'Chauffage d\'atelier par aérothermes',
      description: 'Bilan chauffage de l\'atelier (enveloppe, process) relié au circuit d\'aérothermes du schéma ; réseaux, vannes et vase.',
      notes: [{ cle: 'bilan', type: 'bilan', titre: 'Bilan de l\'atelier', entrees: {} },
        { cle: 'pid', type: 'pid', titre: 'Schéma de principe chauffage atelier', entrees: { titreInstallation: 'Chaufferie atelier', reseau: 'ch-80-60', generateur: 'chaudiere-cond', nGen: '1', Pgen: 120, bouteille: 'oui', usage: 'industrie',
          circuits: [{ rep: 'Aérothermes atelier', emetteur: 'aerotherme', P: 100, bilan: 'bilan', regime: '', regulation: '3v', L: 140 }, { rep: 'Radiateurs bureaux', emetteur: 'radiateurs', P: 15, regime: '', regulation: '3v', L: 60 }] } }], liees: ['pid'] },
    { id: 'sous-station', nom: 'Sous-station de réseau de chaleur', objet: 'Sous-station — raccordement au réseau de chaleur',
      description: 'Échangeur à plaques entre réseau primaire et secondaire, radiateurs, CTA et ECS.',
      notes: [{ cle: 'pid', type: 'pid', titre: 'Schéma de la sous-station', entrees: { titreInstallation: 'Sous-station', reseau: 'perso', Tdep: 90, Tret: 60, generateur: 'echangeur', nGen: '1', Pgen: 400, bouteille: 'echangeur', pincement: 5,
        circuits: [{ rep: 'Radiateurs', emetteur: 'radiateurs', P: 180, regime: '', regulation: '3v', L: 150 }, { rep: 'CTA', emetteur: 'cta', P: 120, regime: '', regulation: '3v', L: 60 }, { rep: 'Préparation ECS', emetteur: 'ecs', P: 80, regime: '', regulation: '2v', L: 20 }] } }], liees: ['pid'] },
    { id: 'pac-change-over', nom: 'PAC réversible en change-over', objet: 'PAC réversible — distribution 2 tubes change-over',
      description: '2 PAC réversibles, ballon tampon, ventilo-convecteurs et CTA, chauffage l\'hiver et rafraîchissement l\'été.',
      notes: [{ cle: 'pid', type: 'pid', titre: 'Schéma de principe change-over', entrees: { titreInstallation: 'Production PAC réversible', reseau: 'co', generateur: 'pac-rev', nGen: '2', Pgen: 90, PgenF: 85, bouteille: 'oui', tampon: 'oui',
        circuits: [{ rep: 'Ventilos bureaux', emetteur: 'ventilo', P: 110, Pf: 130, regime: '', regulation: '2v', L: 180 }, { rep: 'CTA', emetteur: 'cta', P: 60, Pf: 40, regime: '', regulation: '3v', L: 50 }] } }], liees: ['pid'] },
    { id: 'vapeur', nom: 'Distribution de vapeur d\'atelier', objet: 'Distribution vapeur 7 bar',
      description: 'Conduite vapeur et condensats, isolation, lyres de dilatation et supportage.',
      notes: [{ type: 'vapeur', titre: 'Collecteur vapeur 7 bar', entrees: { p: 7, m: 1500, L: 90, zeta: 9 } },
        { type: 'isolation', titre: 'Isolation de la ligne vapeur', entrees: { tube: '88.9x3.2', Tf: 170, Ta: 15, HR: 60, isolant: 'laine-roche', revetement: 'alu', TsMax: 50 } },
        { type: 'dilatation', titre: 'Lyres de la ligne vapeur', entrees: { tube: '88.9x3.2', L: 45, Tpose: 10, Tmin: 5, Tmax: 170 } },
        { type: 'supportage', titre: 'Supportage de la ligne vapeur', entrees: { tube: '88.9x3.2', contenu: '0', T: 170, isolant: 'laine-roche', epIso: 80 } }] },
  ];

  // Notes d'un modèle (intégré ou étude enregistrée) avec de nouveaux identifiants et leurs liens reportés
  function instancier(modele, uid) {
    if (modele.notes && modele.notes.every(n => n.id)) {
      // Étude enregistrée comme modèle
      const ids = new Map(modele.notes.map(n => [n.id, uid()]));
      return JSON.parse(JSON.stringify(modele.notes)).map(n => {
        n.id = ids.get(n.id);
        if (n.lien) n.lien.note = ids.get(n.lien.note) || n.lien.note;
        (n.entrees.circuits || []).forEach(c => { if (c.bilan) c.bilan = ids.get(c.bilan) || ''; });
        return n;
      });
    }
    const ids = new Map(), notes = modele.notes.map(m => { const id = uid(); if (m.cle) ids.set(m.cle, id); return { id, type: m.type, titre: m.titre, entrees: { ...N.defauts(m.type), ...JSON.parse(JSON.stringify(m.entrees)) }, commentaire: '' }; });
    notes.forEach(n => (n.entrees.circuits || []).forEach(c => { if (c.bilan) c.bilan = ids.get(c.bilan) || ''; }));
    const etude = { notes };
    (modele.liees || []).forEach(cle => { const pid = notes.find(n => n.id === ids.get(cle)); if (pid) notes.splice(notes.indexOf(pid) + 1, 0, ...L.notesDepuisSchema(etude, pid, uid)); });
    return notes;
  }
  return { INTEGRES, instancier };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Liens !== 'undefined' ? Liens : require('./liens'));
if (typeof module !== 'undefined') module.exports = Modeles;
