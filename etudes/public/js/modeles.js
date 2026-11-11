// Modèles d'études : installations types prêtes à adapter (calculs pré-remplis, liens entre calculs, notes créées depuis
// le schéma). Les études enregistrées comme modèle par le bureau (drapeau « modele ») s'ajoutent à cette liste.
const Modeles = ((N, L) => {
  // Notes : { cle, type, titre, entrees, commentaire } ; « bilan: cle » dans un circuit reprend la puissance de ce bilan ;
  // toute valeur « @cle… » des entrées désigne la note de cette clé (« @pid|Circuit », « @term:VC-01 », « @froid ») ;
  // liees : schémas dont on crée les notes (réseau et pompe, vanne, vase)
  const VC4T = ['01', '02', '03', '04', '05', '06'];
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
    { id: 'pac-change-over', nom: 'PAC réversible en change-over', objet: 'PAC réversible — distribution 2 tubes change-over',
      description: '2 PAC réversibles, ballon tampon, ventilo-convecteurs et CTA, chauffage l\'hiver et rafraîchissement l\'été.',
      notes: [{ cle: 'pid', type: 'pid', titre: 'Schéma de principe change-over', entrees: { titreInstallation: 'Production PAC réversible', reseau: 'co', generateur: 'pac-rev', nGen: '2', Pgen: 90, PgenF: 85, bouteille: 'oui', tampon: 'oui',
        circuits: [{ rep: 'Ventilos bureaux', emetteur: 'ventilo', P: 110, Pf: 130, regime: '', regulation: '2v', L: 180 }, { rep: 'CTA', emetteur: 'cta', P: 60, Pf: 40, regime: '', regulation: '3v', L: 50 }] } }], liees: ['pid'] },
    /* ---------- Installations prêtes à l'emploi : notes reliées entre elles (« @clé » = identifiant de la note de cette clé) ---------- */
    { id: 'chaufferie-cascade-ecs', nom: 'Chaufferie gaz en cascade avec production d\'ECS', objet: 'Chaufferie gaz — cascade, radiateurs, CTA et ECS',
      description: '2 chaudières à condensation en cascade, bouteille, radiateurs en loi d\'eau, CTA reliée à son circuit, ballon d\'ECS sur le circuit primaire relié au calcul d\'ECS.',
      notes: [
        { cle: 'pid', type: 'pid', titre: 'Schéma de principe de la chaufferie', entrees: { titreInstallation: 'Chaufferie gaz', reseau: 'ch-80-60', generateur: 'chaudiere-cond', nGen: '2', Pgen: 160, bouteille: 'oui',
          circuits: [{ rep: 'Radiateurs bâtiment A', emetteur: 'radiateurs', P: 110, regime: '70/50', regulation: '3v', L: 140, depMini: 30 },
            { rep: 'Radiateurs bâtiment B', emetteur: 'radiateurs', P: 70, regime: '70/50', regulation: '3v', L: 180, depMini: 30 },
            { rep: 'CTA', emetteur: 'cta', P: '', regime: '70/50', regulation: '3v', L: 60, annexe: '@cta' },
            { rep: 'Préparation ECS', emetteur: 'ecs', P: 60, regime: '', regulation: 'direct', L: 20 }],
          ballons: [{ rep: 'BECS', fonction: 'ecs', V: 1500, position: 'circuit:Préparation ECS', piquages: '', sondes: '' }] } },
        { cle: 'cta', type: 'cta', titre: 'CTA des bureaux (batterie chaude)', entrees: { Qs: 6000, Qr: 6000, froid: 'non' } },
        { cle: 'ecs', type: 'ecs', titre: 'Production d\'eau chaude sanitaire', entrees: { circuitPrim: '@pid|Préparation ECS', usage: 'perso', Vj: 3000, pointe: 30, tp: 2, Tf: 10, Tc: 60 } },
        { type: 'isolation', titre: 'Isolation des réseaux de chauffage', entrees: { source: '@pid|c|0', isolant: 'laine-roche', revetement: 'pvc', Ta: 15 } }], liees: ['pid'] },
    { id: 'pac-appoint-chaudiere', nom: 'PAC air/eau avec appoint chaudière', objet: 'PAC air/eau en bivalence avec chaudière d\'appoint',
      description: 'PAC air/eau en base et chaudière à condensation en appoint (bivalence parallèle), ballon tampon, plancher chauffant et radiateurs basse température en loi d\'eau.',
      notes: [
        { cle: 'pid', type: 'pid', titre: 'Schéma de principe PAC + appoint', entrees: { titreInstallation: 'Production PAC et appoint gaz', reseau: 'ch-45-35', generateur: 'pac-air',
          generateurs: [{ rep: 'PAC1', type: 'pac-air', P: 70, role: 'base', pompe: 'integree', regime: '', alim: '' }, { rep: 'CH1', type: 'chaudiere-cond', P: 60, role: 'appoint', pompe: '', regime: '', alim: '' }],
          bivalence: 'parallele', Tbivalence: -3, seuilReleve: 3, bouteille: 'oui',
          ballons: [{ rep: 'BT1', fonction: 'tampon', V: '', position: 'production', piquages: '4', sondes: 'haut,bas' }],
          circuits: [{ rep: 'Plancher chauffant RDC', emetteur: 'plancher', P: 50, regime: '35/30', regulation: '3v', L: 60, depMini: 25 },
            { rep: 'Radiateurs étage', emetteur: 'radiateurs', P: 60, regime: '', regulation: '3v', L: 110, depMini: 30 }] } }], liees: ['pid'] },
    { id: 'thermofrigopompe', nom: 'Groupe froid avec récupération de chaleur (thermofrigopompe)', objet: 'Thermofrigopompe — eau glacée et récupération sur le chauffage',
      description: 'Groupe froid à récupération totale au condenseur reprise par le schéma chaud (chaudière en appoint) ; CTA à batteries chaude et froide reliées aux deux schémas.',
      notes: [
        { cle: 'froid', type: 'pid', titre: 'Schéma de principe eau glacée (récupération)', entrees: { titreInstallation: 'Production d\'eau glacée', reseau: 'eg-7-12', generateur: 'gf-air', nGen: '1', Pgen: 220, bouteille: 'oui', tampon: 'oui',
          recupGf: 'totale', eerRecup: 3.5, regimeRecup: '45/40', pompeRecup: '',
          circuits: [{ rep: 'Ventilo-convecteurs', emetteur: 'ventilo', P: 130, regime: '', regulation: '2v', L: 200 },
            { rep: 'CTA (batterie froide)', emetteur: 'cta', P: '', regime: '', regulation: '3v', L: 60, annexe: '@cta' }] } },
        { cle: 'chaud', type: 'pid', titre: 'Schéma de principe chauffage (récupération + appoint)', entrees: { titreInstallation: 'Production d\'eau chaude', reseau: 'ch-45-35', generateur: 'chaudiere-cond', nGen: '1', Pgen: 130, bouteille: 'oui',
          recupDe: '@froid',
          circuits: [{ rep: 'Radiateurs basse température', emetteur: 'radiateurs', P: 90, regime: '', regulation: '3v', L: 150, depMini: 30 },
            { rep: 'CTA (batterie chaude)', emetteur: 'cta', P: '', regime: '', regulation: '3v', L: 60, annexe: '@cta' }] } },
        { cle: 'cta', type: 'cta', titre: 'CTA double flux (batteries chaude et froide)', entrees: { Qs: 8000, Qr: 8000, froid: 'oui' } }], liees: ['froid', 'chaud'] },
    { id: 'boucle-eau-temperee', nom: 'Boucle d\'eau tempérée et PAC eau/eau réparties', objet: 'Boucle d\'eau tempérée — PAC eau/eau par zone',
      description: 'Boucle d\'eau tempérée maintenue par des chaudières, PAC eau/eau de zone représentées par des circuits « process » de la boucle, et schéma type d\'une PAC de zone sur la boucle.',
      notes: [
        { cle: 'boucle', type: 'pid', titre: 'Schéma de la boucle d\'eau tempérée', commentaire: 'Boucle d\'eau tempérée (25/20 °C) : chaque PAC eau/eau de zone est représentée par un circuit « process » de la boucle, dont la puissance est celle prélevée à son évaporateur (puissance chaud de la PAC × (1 − 1/COP)). Le schéma aval de chaque PAC (côté émetteurs) se décrit dans un schéma de principe propre, sur le modèle du schéma « PAC de zone A » (source d\'eau : boucle). Les chaudières maintiennent la boucle en hiver ; en été, la chaleur rejetée par les PAC en froid est à évacuer (aéroréfrigérant, non représenté).',
          entrees: { titreInstallation: 'Boucle d\'eau tempérée', reseau: 'perso', Tdep: 25, Tret: 20, generateur: 'chaudiere-cond', nGen: '2', Pgen: 90, bouteille: 'oui',
            circuits: [{ rep: 'PAC zone A', emetteur: 'process', P: 45, regime: '', regulation: 'direct', L: 80 }, { rep: 'PAC zone B', emetteur: 'process', P: 60, regime: '', regulation: 'direct', L: 120 },
              { rep: 'PAC zone C', emetteur: 'process', P: 35, regime: '', regulation: 'direct', L: 160 }] } },
        { cle: 'zoneA', type: 'pid', titre: 'PAC de zone A (eau/eau sur la boucle)', commentaire: 'Schéma aval de la PAC eau/eau de la zone A, alimentée par la boucle d\'eau tempérée (circuit « PAC zone A » du schéma de la boucle).',
          entrees: { titreInstallation: 'PAC eau/eau zone A', reseau: 'ch-45-35', generateur: 'pac-eau', nGen: '1', Pgen: 60, sourceEau: 'boucle', copForage: 4.5, bouteille: 'non', tampon: 'oui',
            circuits: [{ rep: 'Plancher chauffant zone A', emetteur: 'plancher', P: 35, regime: '35/30', regulation: '3v', L: 50, depMini: 25 }, { rep: 'Ventilos zone A', emetteur: 'ventilo', P: 20, regime: '', regulation: '2v', L: 70 }] } }], liees: ['boucle'] },
    { id: 'sous-station', nom: 'Sous-station de réseau de chaleur', objet: 'Sous-station — raccordement au réseau de chaleur',
      description: 'Échangeur à plaques entre réseau primaire et secondaire, pompe secondaire d\'échangeur, radiateurs, CTA reliée et production d\'ECS reliée au calcul d\'ECS.',
      notes: [
        { cle: 'pid', type: 'pid', titre: 'Schéma de la sous-station', entrees: { titreInstallation: 'Sous-station', reseau: 'perso', Tdep: 90, Tret: 60, generateur: 'echangeur', nGen: '1', Pgen: 400, bouteille: 'echangeur', pincement: 5,
          pompeEchPrim: '', pompeEchSec: 'ajouter',
          circuits: [{ rep: 'Radiateurs', emetteur: 'radiateurs', P: 180, regime: '70/50', regulation: '3v', L: 150, depMini: 30 }, { rep: 'CTA', emetteur: 'cta', P: '', regime: '70/50', regulation: '3v', L: 60, annexe: '@cta' },
            { rep: 'Préparation ECS', emetteur: 'ecs', P: 80, regime: '', regulation: 'direct', L: 20 }],
          ballons: [{ rep: 'BECS', fonction: 'ecs', V: 2000, position: 'circuit:Préparation ECS', piquages: '', sondes: '' }] } },
        { cle: 'cta', type: 'cta', titre: 'CTA (batterie chaude)', entrees: { Qs: 9000, Qr: 9000, froid: 'non' } },
        { cle: 'ecs', type: 'ecs', titre: 'Production d\'eau chaude sanitaire', entrees: { circuitPrim: '@pid|Préparation ECS', usage: 'perso', Vj: 4000, pointe: 30, tp: 2, Tf: 10, Tc: 60 } }], liees: ['pid'] },
    { id: 'eau-glacee-vc4t', nom: 'Groupe froid et ventilo-convecteurs 4 tubes', objet: 'Eau glacée et ventilo-convecteurs 4 tubes',
      description: 'Groupe froid et chaudière, réseaux arborescents chaud et froid équilibrés jusqu\'aux ventilo-convecteurs 4 tubes (terminaux reliés aux deux productions).',
      notes: [
        { cle: 'froid', type: 'pid', titre: 'Schéma de principe eau glacée', entrees: { titreInstallation: 'Production d\'eau glacée', reseau: 'eg-7-12', generateur: 'gf-air', nGen: '1', Pgen: 25, bouteille: 'oui', tampon: 'oui', ratioTampon: 8,
          circuits: [{ rep: 'Réseau ventilos (froid)', emetteur: 'ventilo', P: '', regime: '', regulation: 'direct', L: 0, annexe: '@arboF' }] } },
        { cle: 'chaud', type: 'pid', titre: 'Schéma de principe eau chaude', entrees: { titreInstallation: 'Production d\'eau chaude', reseau: 'ch-55-45', generateur: 'chaudiere-cond', nGen: '1', Pgen: 20, bouteille: 'oui',
          circuits: [{ rep: 'Réseau ventilos (chaud)', emetteur: 'ventilo', P: '', regime: '', regulation: 'direct', L: 0, annexe: '@arboC' }] } },
        { cle: 'term', type: 'terminaux', titre: 'Ventilo-convecteurs 4 tubes', entrees: { prodChaud: '@chaud', prodFroid: '@froid', dpVanne: 15,
          appareils: VC4T.map((k, i) => ({ rep: `VC-${k}`, local: `Bureau ${k}`, type: 'vc4', Pch: i < 4 ? 2.5 : 3.5, Pfr: i < 4 ? 3 : 4.2, batterie: '4t', vanne: '2v', Pvent: 45, Pbe: '', tension: 'mono', alim: 'elec', regul: 'propre', maitre: '', ref: '', dpEauC: 12, dpEauF: 18 })) } },
        ...[['arboF', 'froid', 'Réseau arborescent eau glacée'], ['arboC', 'chaud', 'Réseau arborescent eau chaude']].map(([cle, saison, titre]) => ({ cle, type: 'arbo', titre, entrees: { saison,
          troncons: [{ rep: 'D', amont: '', nom: 'Local technique → palier', L: 20, zeta: 4, tube: '', P: '', dpEm: '' }, { rep: 'A1', amont: 'D', nom: 'Antenne aile est', L: 25, zeta: 3, tube: '', P: '', dpEm: '' },
            { rep: 'A2', amont: 'D', nom: 'Antenne aile ouest', L: 30, zeta: 3, tube: '', P: '', dpEm: '' },
            ...VC4T.map((k, i) => ({ rep: `${i < 3 ? 'A1' : 'A2'}.${(i % 3) + 1}`, amont: i < 3 ? 'A1' : 'A2', nom: '', L: 6 + 3 * (i % 3), zeta: 5, tube: '', P: '', dpEm: '', emetteur: `@term:VC-${k}` }))] } }))], liees: ['froid', 'chaud'] },
    { id: 'vapeur', nom: 'Distribution de vapeur d\'atelier', objet: 'Distribution vapeur 7 bar',
      description: 'Conduite vapeur et condensats, isolation, lyres de dilatation et supportage.',
      notes: [{ type: 'vapeur', titre: 'Collecteur vapeur 7 bar', entrees: { p: 7, m: 1500, L: 90, zeta: 9 } },
        { type: 'isolation', titre: 'Isolation de la ligne vapeur', entrees: { tube: '88.9x3.2', Tf: 170, Ta: 15, HR: 60, isolant: 'laine-roche', revetement: 'alu', TsMax: 50 } },
        { type: 'dilatation', titre: 'Lyres de la ligne vapeur', entrees: { tube: '88.9x3.2', L: 45, Tpose: 10, Tmin: 5, Tmax: 170 } },
        { type: 'supportage', titre: 'Supportage de la ligne vapeur', entrees: { tube: '88.9x3.2', contenu: '0', T: 170, isolant: 'laine-roche', epIso: 80 } }] },
  ];

  // Notes d'un modèle (intégré ou étude enregistrée) avec de nouveaux identifiants et leurs liens reportés
  // Remplace dans toutes les valeurs (chaînes) des entrées les références aux notes : f(chaîne) rend la nouvelle valeur
  const remplacer = (o, f) => {
    if (Array.isArray(o)) o.forEach((v, k) => { if (typeof v === 'string') o[k] = f(v); else if (v && typeof v === 'object') remplacer(v, f); });
    else if (o && typeof o === 'object') Object.keys(o).forEach(k => { if (typeof o[k] === 'string') o[k] = f(o[k]); else if (o[k] && typeof o[k] === 'object') remplacer(o[k], f); });
    return o;
  };
  function instancier(modele, uid) {
    if (modele.notes && modele.notes.every(n => n.id)) {
      // Étude enregistrée comme modèle : tout identifiant d'une note de l'étude (seul ou suivi de « | » ou « : ») est reporté
      const ids = new Map(modele.notes.map(n => [n.id, uid()]));
      const f = v => { const m = /^([^|:]+)([|:].*)?$/.exec(v); return m && ids.has(m[1]) ? ids.get(m[1]) + (m[2] || '') : v; };
      return JSON.parse(JSON.stringify(modele.notes)).map(n => {
        n.id = ids.get(n.id);
        if (n.lien) n.lien.note = ids.get(n.lien.note) || n.lien.note;
        if (n.entrees && n.entrees.cta) n.entrees.cta = ids.get(n.entrees.cta) || '';
        (n.entrees.circuits || []).forEach(c => { if (c.bilan) c.bilan = ids.get(c.bilan) || ''; if (c.annexe) c.annexe = ids.get(c.annexe) || ''; });
        remplacer(n.entrees || {}, f);
        return n;
      });
    }
    const ids = new Map(), notes = modele.notes.map(m => { const id = uid(); if (m.cle) ids.set(m.cle, id); return { id, type: m.type, titre: m.titre, entrees: { ...N.defauts(m.type), ...JSON.parse(JSON.stringify(m.entrees)) }, commentaire: m.commentaire || '' }; });
    notes.forEach(n => (n.entrees.circuits || []).forEach(c => { if (c.bilan) c.bilan = ids.get(c.bilan) || ''; }));
    // Références « @cle » (suivies ou non de « |circuit », « :repère »…) : identifiant de la note ; clé inconnue : lien vide
    notes.forEach(n => remplacer(n.entrees, v => { const m = /^@([\w-]+)(.*)$/.exec(v); return m ? (ids.has(m[1]) ? ids.get(m[1]) + m[2] : '') : v; }));
    const etude = { notes };
    (modele.liees || []).forEach(cle => { const pid = notes.find(n => n.id === ids.get(cle)); if (pid) notes.splice(notes.indexOf(pid) + 1, 0, ...L.notesDepuisSchema(etude, pid, uid)); });
    return notes;
  }
  return { INTEGRES, instancier };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Liens !== 'undefined' ? Liens : require('./liens'));
if (typeof module !== 'undefined') module.exports = Modeles;
