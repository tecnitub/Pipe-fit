// Points de mise en service tirés des calculs d'une étude, transmis au chantier (Pipe-Fit) avec le résumé de l'étude :
// valeurs attendues des équipements (débit et HMT des pompes, gonflage des vases, débits et pressions des ventilateurs…),
// réseaux à éprouver (pression de service, pression d'épreuve), contrôles réglementaires (DESP). Le chantier en tire la
// liste des mises en service à faire et préremplit les PV. Module pur (navigateur, node, tests).
const PointsMes = (() => {
  const r = (v, d = 1) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10 ** d) / 10 ** d : null);
  const txt = (v, n = 160) => String(v == null ? '' : v).trim().slice(0, n);
  const att = (libelle, valeur, unite, d = 1) => (r(valeur, d) === null ? null : { libelle, valeur: r(valeur, d), unite });
  const nettoie = l => l.filter(Boolean);
  // Nature du réseau (liste des PV d'épreuve) d'après le fluide et la température d'une note hydraulique
  const natureHydro = e => (Number(e.T) > 0 && Number(e.T) < 18 ? 'Eau glacée' : 'Chauffage (eau chaude)');

  // Entrées complétées par les valeurs par défaut du type (comme le calcul et le métré)
  const N = () => (typeof Notes !== 'undefined' ? Notes : require('./notes'));
  const entrees = n => { let d = {}; try { if (N().TYPES[n.type]) d = N().defauts(n.type); } catch (err) { d = {}; } return { ...d, ...(n.entrees || {}) }; };
  // et : étude ; calc(n) : résultat du calcul de la note (valeurs, resume…)
  function extraire(et, calc) {
    const out = [];
    (et.notes || []).forEach(n => {
      let res;
      try { res = calc(n) || {}; } catch (err) { return; }
      const v = res.valeurs || {}, e = entrees(n), titre = txt(n.titre || n.type), base = { noteId: n.id, source: titre };
      const pompe = p => `pompe|${p}`;
      switch (n.type) {
        case 'reseau':
        case 'arbo': {
          const Q = n.type === 'arbo' ? v.Qp : v.Qpompe;
          if (n.type === 'arbo' && e.memeReseau === 'oui') break; // jumeau froid d'un réseau change-over : fiche du réseau chaud
          if (n.type === 'arbo') {
            // Une fiche par réseau hydraulique : pompe, puis une ligne par émetteur (repère de l'étude, pièce, branche,
            // préréglage de la vanne d'équilibrage) avec le débit attendu, à mesurer
            const tr = new Map((e.troncons || []).map(t => [String(t.rep || '').trim(), t])), nf1 = x => String(Math.round(x * 10) / 10).replace('.', ',');
            const lignes = [...(v.vannes || []).filter(x => x.terminal), ...(v.vannes || []).filter(x => !x.terminal)].map(x => { const t = tr.get(x.rep) || {}, local = txt(t.nom, 50);
              return att(`Débit ${x.rep}${local && local !== x.rep ? ` — ${local}` : ''} · ${x.terminal ? 'vanne' : 'vanne partenaire'} ${x.repVanne || `VE-${x.rep}`} · branche ${txt(x.chemin, 50)}${Number.isFinite(x.tours) ? ` · préréglage ${nf1(x.tours)} tours` : ''}`, x.Q, 'm³/h', 3); });
            const pr = e.pompeRef || (v.pompe && v.pompe.modele) || '';
            out.push({ ...base, nature: 'mes', type: 'reseau', cle: `reseau-hydro|${n.id}`, titre: `Réseau hydraulique — ${titre}`, marque: '', modele: txt(pr, 80),
              detail: `${lignes.length} émetteur(s) : une ligne par émetteur, débit attendu et mesuré`,
              attendus: nettoie([att('Débit de la pompe', Q, 'm³/h', 2), att('Hauteur manométrique', v.HMT, 'mCE', 2), att('Puissance absorbée', v.Pabs, 'W', 0), ...lignes,
                // Courbe de la pompe retenue (fiche du fabricant) : le PV place le point mesuré dessus
                ...String(e.pompeCourbe || '').split(/[;|\n]+/).map(p => p.trim().split(/\s*[:=/]\s*/).map(x => Number(String(x).replace(',', '.')))).filter(p => p.length >= 2 && p[0] >= 0 && p[1] >= 0).slice(0, 15)
                  .map(([q, h]) => att(`Courbe pompe ${String(q).replace('.', ',')} m³/h`, h, 'mCE', 2))]) });
            out.push({ ...base, nature: 'epreuve', titre, reseau: titre, natureReseau: natureHydro(e) });
            break;
          }
          if (v.pompe && v.pompe.modele) out.push({ ...base, nature: 'mes', type: 'pompes', cle: pompe(v.pompe.modele), titre: `Pompe ${txt(v.pompe.modele, 80)} — ${titre}`,
            attendus: nettoie([att('Débit', Q, 'm³/h', 2), att('Hauteur manométrique', v.HMT, 'mCE', 2), att('Puissance absorbée', v.Pabs, 'W', 0)]) });
          out.push({ ...base, nature: 'epreuve', titre, reseau: titre, natureReseau: natureHydro(e) });
          break;
        }
        case 'vase':
          out.push({ ...base, nature: 'mes', type: 'vase', cle: v.choisi ? `vase|${v.choisi}` : '', titre: `Vase d'expansion${v.choisi ? ` ${v.choisi} L` : ''} — ${titre}`,
            attendus: nettoie([att('Pression de gonflage (vase isolé, à vide)', v.p0, 'bar', 2), att('Pression de remplissage à froid', v.pa, 'bar', 2), att('Tarage de la soupape', v.pe, 'bar', 2), att('Volume du vase', v.choisi, 'L', 0)]) });
          break;
        case 'cta':
          out.push({ ...base, nature: 'mes', type: 'cta', cle: e.Qs ? `cta|${Number(e.Qs)}` : '', titre: `CTA — ${titre}`,
            attendus: nettoie([att('Débit de soufflage', e.Qs, 'm³/h', 0), att('Débit de reprise', e.Qr, 'm³/h', 0), att('Puissance chaud', v.Pchaud, 'kW', 1), att('Puissance froid', v.Pfroid, 'kW', 1),
              att('Débit d\'eau chaude', v.QwC, 'm³/h', 2), att('Débit d\'eau glacée', v.QwF, 'm³/h', 2), att('Puissance ventilateur soufflage', v.PvS, 'W', 0), att('Puissance ventilateur reprise', v.PvR, 'W', 0)]) });
          break;
        case 'aero': {
          // Même clé que le métré : CTA reliée à un calcul de CTA, sinon producteur et débit du schéma
          const prod = txt(v.producteur || e.producteur, 60), Q = Math.max(Number(v.Qs) || 0, Number(v.Qr) || 0), lie = e.cta && (et.notes || []).find(x => x.id === e.cta && x.type === 'cta');
          const cle = lie ? `cta|${Number((lie.entrees || {}).Qs)}` : prod && Q ? `aero|${prod}|${Math.round(Q)}` : '';
          out.push({ ...base, nature: 'mes', type: /^cta/.test(prod) || lie ? 'cta' : 'vmc', cle, titre: `Ventilation — ${titre}`,
            attendus: nettoie([att('Débit de soufflage', v.Qs, 'm³/h', 0), att('Débit de reprise', v.Qr, 'm³/h', 0), att('Pression ventilateur soufflage', v.pS, 'Pa', 0), att('Pression ventilateur reprise', v.pR, 'Pa', 0)]) });
          // Même fiche : une ligne par bouche (numéro unique, pièce, zone, réseau, branche) avec le débit attendu, à mesurer
          const fiche = out[out.length - 1], bs = (e.bouchesL || []).filter(b => b && String(b.rep || '').trim());
          fiche.attendus.push(...nettoie(bs.map(b => att(`Débit ${String(b.rep).trim()}${b.salle ? ` — ${txt(b.salle, 40)}` : ''}${b.zone || b.etage ? ` (${txt([b.zone, b.etage].filter(Boolean).join(', '), 30)})` : ''} · ${b.reseau || 'soufflage'} · ${b.troncon ? `branche ${txt(b.troncon, 20)}` : 'branche à rattacher'}`, Number(String(b.Q).replace(',', '.')), 'm³/h', 0))));
          if (bs.length) fiche.detail = `${bs.length} bouche(s) : une ligne par bouche, débit attendu et mesuré`;
          break;
        }
        case 'aeraulique':
          out.push({ ...base, nature: 'mes', type: 'vmc', cle: '', titre: `Ventilateur — ${titre}`, attendus: nettoie([att('Débit', v.Qv, 'm³/h', 0), att('Pression totale du ventilateur', v.pVentilateur, 'Pa', 0), att('Puissance absorbée', v.Pabs, 'W', 0)]) });
          break;
        case 'ecs':
          out.push({ ...base, nature: 'mes', type: 'ecs', cle: '', titre: `Production ECS — ${titre}`, attendus: nettoie([att('Température de stockage', 60, '°C', 0), att('Volume de stockage', v.choisi, 'L', 0), att('Débit de pointe', v.Qp, 'm³/h', 2)]) });
          break;
        case 'terminaux': {
          // Un équipement = une fiche : chaque appareil (plusieurs unités : repères suffixés)
          const T = typeof Terminaux !== 'undefined' ? Terminaux : require('./terminaux');
          const surReseau = new Set((et.notes || []).filter(a => a.type === 'arbo').flatMap(a => ((a.entrees || {}).troncons || []).map(t => t && t.emetteur).filter(Boolean)));
          (v.lignes || []).forEach(x => {
            if (surReseau.has(`${n.id}:${x.rep}`)) return; // ligne de la fiche du réseau hydraulique
            const cat = (x.t || [])[1], type = x.pompe ? 'pompes' : x.type === 'ctaSf' ? 'cta' : x.type === 'tourelle' ? 'vmc' : cat === 'split' ? 'split' : ['registre', 'sondeAir'].includes(cat) ? 'gtb' : cat === 'sansElec' ? '' : 'terminal';
            if (!type) return;
            for (let k = 1; k <= Math.max(1, x.n || 1); k++) {
              const rep = x.n > 1 ? `${x.rep}.${k}` : x.rep, lib = (T.TYPES[x.type] || [x.type])[0];
              const q = x.qc || x.qf;
              out.push({ ...base, nature: 'mes', type, cle: `term|${n.id}|${rep}`, repere: rep, local: txt(x.local, 80), zone: txt(x.zone, 60),
                marque: txt(x.fiche ? x.fiche.fabricant : '', 60), modele: txt(x.fiche ? x.fiche.reference : x.ref, 80), titre: `${lib} ${rep}${x.local ? ` — ${txt(x.local, 60)}` : ''}`,
                attendus: nettoie(x.pompe ? [att('Débit', x.Qp, 'm³/h', 2), att('Hauteur manométrique', x.Hp, 'mCE', 1), att('Puissance absorbée', x.P * 1000, 'W', 0)]
                  : [att('Puissance chaud', x.Pch || null, 'kW', 2), att('Puissance froid', x.Pfr || null, 'kW', 2), att('Débit d\'eau', q || null, 'm³/h', 3), att('Puissance électrique', x.P ? x.P * 1000 : null, 'W', 0),
                    att('Intensité absorbée', x.P ? x.P * 1000 / (x.tension === 'tri' ? 400 * 1.732 * 0.85 : 230 * 0.9) : null, 'A', 2)]) });
            }
          });
          break;
        }
        case 'pid': {
          const Sc = typeof Schema !== 'undefined' ? Schema : require('./schema');
          let d; try { d = Sc.dimensionner(e); } catch (err) { break; }
          const G = (Sc.GENERATEURS || {})[e.generateur] || ['Générateur'], R = (Sc.REGIMES || {})[e.reseau], pac = /^(pac|gf)/.test(e.generateur || '');
          const Td = R && R[1] !== undefined ? R[1] : Number(e.Tdep) || null, Tr = R && R[2] !== undefined ? R[2] : Number(e.Tret) || null;
          const fg = e.fiche || {};
          if (d.multi) d.multi.filter(x => !/^echangeur/.test(x.type)).forEach(x => out.push({ ...base, nature: 'mes', type: /^(pac|gf)/.test(x.type) ? 'pac' : /^chaudiere/.test(x.type) ? 'chaudiere' : 'autre', cle: `gen|${x.type}|${x.P}`, repere: x.rep,
            local: /^(pac|gf)/.test(x.type) ? 'Production (extérieur / local technique)' : 'Chaufferie', titre: `${x.gen[0]} ${x.rep} — ${titre}`,
            attendus: nettoie([att('Puissance', x.P, 'kW', 0), att('Température départ eau', x.regime ? x.regime[0] : Td, '°C', 0), att('Température retour eau', x.regime ? x.regime[1] : Tr, '°C', 0), att('Débit', x.Q, 'm³/h', 2)]) }));
          else if (!/^echangeur/.test(e.generateur || '')) for (let i = 1; i <= (d.n || 1); i++) out.push({ ...base, nature: 'mes', type: pac ? 'pac' : /^chaudiere/.test(e.generateur || '') ? 'chaudiere' : 'autre', cle: `gen|${e.generateur}|${d.Pg}`, repere: `${pac ? 'PAC' : 'G'}${i}`,
            local: pac ? 'Production (extérieur / local technique)' : 'Chaufferie', marque: txt(fg.fabricant, 60), modele: txt(fg.reference, 80), titre: `${G[0]} ${i} — ${titre}`,
            attendus: nettoie([att('Puissance', d.Pg, 'kW', 0), att('Température départ eau', Td, '°C', 0), att('Température retour eau', Tr, '°C', 0), att('Débit', d.Qg, 'm³/h', 2)]) });
          (v.circuits || []).forEach((c, k) => out.push({ ...base, nature: 'mes', type: 'pompes', cle: `pompe-circuit|${n.id}|${k}`, repere: `PC${k + 1}`, titre: `Pompe du circuit ${txt(c.rep, 60)}`, attendus: nettoie([att('Débit', c.Q, 'm³/h', 2), att('Hauteur manométrique', c.hmt, 'mCE', 2)]) }));
          break;
        }
        case 'sanitaire': {
          const PS = r(e.pDispo, 1), PT = PS ? Math.max(10, r(PS * 1.5, 1)) : null;
          out.push({ ...base, nature: 'epreuve', titre: `${titre} — eau froide`, reseau: `${titre} — eau froide sanitaire`, natureReseau: 'Eau froide sanitaire', PS, PT });
          if (v.totC > 0) out.push({ ...base, nature: 'epreuve', titre: `${titre} — eau chaude`, reseau: `${titre} — eau chaude sanitaire et bouclage`, natureReseau: 'Eau chaude sanitaire', PS, PT });
          if (v.bouclage) out.push({ ...base, nature: 'mes', type: 'pompes', cle: 'pompe|bouclage-ecs', titre: `Pompe de bouclage ECS — ${titre}`, attendus: nettoie([att('Débit', v.bouclage.Qb, 'm³/h', 3), att('Hauteur manométrique', v.bouclage.H, 'mCE', 2), att('Température retour bouclage', 55, '°C', 0)]) });
          if (v.surpresseur) out.push({ ...base, nature: 'mes', type: 'pompes', cle: `surp|${String(r(v.surpresseur.Q, 1)).replace('.', ',')}`, titre: `Surpresseur eau froide — ${titre}`, attendus: nettoie([att('Débit', v.surpresseur.Q, 'm³/h', 2), att('Hauteur manométrique', v.surpresseur.H, 'mCE', 1)]) });
          out.push({ ...base, nature: 'controle', titre: `Désinfection du réseau d'eau potable — ${titre}`, detail: 'Rinçage, désinfection et analyse bactériologique avant la mise en service (eau destinée à la consommation humaine) ; certificat joint au DOE.' });
          if (v.bouclage) out.push({ ...base, nature: 'controle', titre: `Températures de l'ECS et légionelles — ${titre}`, detail: `Relevé des températures : départ ≥ 55 °C, retour de chaque boucle ≥ 50 °C (${(v.bouclage.vannes || []).length} vanne(s) thermostatique(s)) ; analyse de légionelles en ERP (arrêté du 1er février 2010).` });
          if (e.remplissageCvc !== 'non') out.push({ ...base, nature: 'controle', titre: 'Disconnecteur BA du remplissage CVC', detail: 'Essai du disconnecteur par un vérificateur agréé à la mise en service, puis contrôle annuel (NF EN 1717).' });
          break;
        }
        case 'elec': {
          // Tests point à point de la GTB : un contrôle par point de la liste
          const pts = (v.listePoints || []).slice(0, 400);
          if (pts.length) out.push({ ...base, nature: 'mes', type: 'gtb', cle: '', titre: `Tests point à point GTB — ${pts.length} points (${titre})`,
            controles: pts.map(p => txt(`${p[0]} — ${p[7] || p[1]} (${p[4] || p[2]}) : ${(typeof Gtb !== 'undefined' ? Gtb : require('./gtb')).essai(p[2])[0].split(' ; ')[0]}`, 160)), attendus: [] });
          // Régulation de chaque installation : une fiche (technologie de son armoire) avec les paramètres à régler et vérifier
          const RG = typeof Regulation !== 'undefined' ? Regulation : require('./regulation');
          ((v.regulation || {}).installations || []).forEach(x => out.push({ ...base, nature: 'mes', type: 'gtb', cle: `regul|${x.noteId}`, titre: `Régulation — ${txt(x.titre, 80)} (${(t => t.charAt(0).toLowerCase() + t.slice(1))((RG.TECHNOS[x.techno] || RG.TECHNOS.automate)[0])})`,
            detail: `${(x.params || []).length} paramètre(s) à régler et vérifier`, controles: (RG.CONTROLES[x.techno] || RG.CONTROLES.automate).slice(),
            attendus: nettoie((x.params || []).map(q => att(q.libelle, q.valeur, q.unite, 2))) }));
          // Réglages du cahier de paramétrage (valeur attendue / valeur réglée) et essais des séquences
          const CP = typeof ConsignesProjet !== 'undefined' ? ConsignesProjet : require('./consignes-projet');
          if (v.consignesProjet) out.push({ ...base, nature: 'mes', type: 'gtb', cle: 'reglages', titre: `Réglages de la régulation — valeurs du cahier de paramétrage (${titre})`,
            detail: 'Chaque consigne, loi d\'eau, seuil et pression : valeur attendue (cahier) face à la valeur réglée dans l\'automate', controles: CP.controlesReglage(v.consignesProjet).slice(0, 80), attendus: CP.attendusReglage(v.consignesProjet).slice(0, 150) });
          const seq = CP.essaisSequences(v.cahierProg || []);
          if (seq.length) out.push({ ...base, nature: 'mes', type: 'gtb', cle: 'sequences', titre: `Essais des séquences de fonctionnement (${titre})`, detail: 'Essais fonctionnels tirés de la logique pas à pas et des alarmes du cahier', controles: seq.map(t => txt(t, 200)), attendus: [] });
          break;
        }
        case 'desenfumage':
          if (v.Qv > 0) out.push({ ...base, nature: 'mes', type: 'desenfumage', cle: '', titre: `Désenfumage — ${titre}`, attendus: nettoie([att('Débit extrait', v.Qv * 3600, 'm³/h', 0)]) });
          out.push({ ...base, nature: 'controle', titre: `Désenfumage : essais avec le SSI — ${titre}`, detail: `Essais de fonctionnement canton par canton (${v.cantons || 0}) depuis le CMSI, mesure des débits et des vitesses, rapport du bureau de contrôle (IT 246).` });
          break;
        case 'evacuation':
          out.push({ ...base, nature: 'controle', titre: `Évacuations EU / EV : essai d'étanchéité et d'écoulement — ${titre}`, detail: 'Essai à l\'eau des chutes et collecteurs (bouchons, mise en charge), contrôle des pentes, des ventilations primaires et des tampons de visite ; inspection caméra des collecteurs enterrés si prévue au CCTP.' });
          break;
        case 'gazReseau':
        case 'gaz':
          out.push({ ...base, nature: 'epreuve', titre, reseau: titre, natureReseau: 'Gaz', fluideEssai: 'Air' });
          out.push({ ...base, nature: 'controle', titre: `Gaz — ${titre}`, detail: 'Contrôle d\'étanchéité, certificat de conformité (modèle 2 ou 4) avant la mise en gaz, essai des organes de coupure.' });
          break;
        case 'vapeur':
        case 'condensats':
          out.push({ ...base, nature: 'epreuve', titre, reseau: titre, natureReseau: 'Vapeur / condensats' });
          break;
        case 'air':
          out.push({ ...base, nature: 'epreuve', titre, reseau: titre, natureReseau: 'Air comprimé', fluideEssai: 'Air' });
          break;
        case 'epaisseur':
          out.push({ ...base, nature: 'epreuve', titre, reseau: titre, natureReseau: 'Eau industrielle / process', PS: r(e.PS, 2), PT: r(v.PT, 1) });
          break;
        case 'desp': {
          const nat = e.fluide === 'vapeur' || e.fluide === 'eau-surchauffee' || e.fluide === 'condensats' ? 'Vapeur / condensats' : /^(air|azote)$/.test(e.fluide) ? 'Air comprimé' : /gaz|propane|hydrog/.test(e.fluide || '') ? 'Gaz' : 'Eau industrielle / process';
          out.push({ ...base, nature: 'epreuve', titre, reseau: titre, natureReseau: nat, PS: r(e.PS, 2), PT: r(v.PT, 1), categorie: v.categorieMax });
          if (v.soumis) out.push({ ...base, nature: 'controle', titre: `DESP catégorie ${['', 'I', 'II', 'III', 'IV'][v.categorieMax] || ''} — ${titre}`,
            detail: `Marquage CE et déclaration UE de conformité des équipements et ensembles${v.categorieMax >= 2 ? ', attestation de l\'organisme notifié, QMOS et qualifications des soudeurs, certificats matière 3.1' : ''} ; notice d'instructions remise ; suivi en service (arrêté du 20/11/2017) : déclaration de mise en service si requise.` });
          break;
        }
        default: {
          // Calculs annexes qui posent du matériel (hotte, parking, solaire, bouclage, plancher, DRV…) : fiches de mise en
          // service tirées de leurs séquences et paramètres (versMes, annexes-exploitation.js)
          const T = N().TYPES[n.type];
          if (T && T.annexe) {
            const A = typeof AnnexesExploitation !== 'undefined' ? AnnexesExploitation : (typeof window === 'undefined' ? (() => { try { return require('./annexes-exploitation'); } catch (err) { return null; } })() : null);
            if (A) out.push(...A.pointsNote(et, n, v, e).map(p => ({ ...base, ...p })));
          }
        }
      }
    });
    // Essais des séquences entre niveaux de l'installation hydraulique (schéma aval → pompe amont, boucle d'eau tempérée,
    // relève / appoint, secours, récupération, pompes d'échangeur) : un PV « Essais des séquences » de plus pour le chantier
    let inter = null;
    try {
      if ((et.notes || []).some(n => n.type === 'pid')) {
        const I = typeof Installation !== 'undefined' ? Installation : require('./installation'), CP = typeof ConsignesProjet !== 'undefined' ? ConsignesProjet : require('./consignes-projet');
        const parId = new Map((et.notes || []).map(n => [n.id, n])), ess = CP.essaisInterNiveaux(I.arbre(et), id => (parId.has(id) ? entrees(parId.get(id)) : {}));
        if (ess.length) inter = { noteId: 'installation', source: 'Installation hydraulique', nature: 'mes', type: 'gtb', cle: 'sequences-installation', titre: 'Essais des séquences entre niveaux de l\'installation hydraulique',
          detail: `${ess.length} essai(s) : demandes entre schémas, relève / appoint, secours, récupération, boucle d'eau tempérée, échangeurs`, controles: ess.map(x => txt(x.texte, 120)), attendus: [] };
      }
    } catch (err) { inter = null; }
    return inter ? [...out.slice(0, 199), inter] : out.slice(0, 200);
  }

  // Débits théoriques des relevés d'équilibrage (schémas aérauliques bouche par bouche et registres, réseaux arborescents
  // par vanne d'équilibrage, désenfumage, bouclage ECS) : repère, local, type, débit, réglage prévu
  function debits(et, Liens) {
    const debits = [];
    (et.notes || []).forEach(n => {
      try {
        if (n.type === 'aero') { const r = Liens.calculer(et, n), v = r.valeurs || {}; if ((v.debits || []).length) debits.push({ installation: Liens.resoudre(et, n).entrees.titreInstallation || n.titre, type: 'Aéraulique', unite: 'm³/h', lignes: v.debits.slice(0, 500) }); }
        if (n.type === 'arbo' && (n.entrees || {}).memeReseau === 'oui') return;
        if (n.type === 'arbo') { const v = Liens.calculer(et, n).valeurs || {}; if ((v.vannes || []).length) debits.push({ installation: n.titre, type: 'Hydraulique', unite: 'm³/h', lignes: v.vannes.map(x => ({ repere: x.repVanne || x.rep, local: `${x.nom || x.rep}${x.terminal ? ` (émetteur ${x.rep})` : ' (antenne, vanne partenaire)'} · branche ${x.chemin || x.rep}`, type: 'Vanne d\'équilibrage', theorique: Math.round(x.Q * 1000) / 1000, reglage: x.tours ? `préréglage ${String(Math.round(x.tours * 10) / 10).replace('.', ',')} tours${x.ref ? ` (${x.ref})` : ''}` : '' })) }); }
        if (n.type === 'desenfumage') { const v = Liens.calculer(et, n).valeurs || {}; if ((v.debits || []).length) debits.push({ installation: `${n.titre}`, type: 'Aéraulique', unite: 'm³/h', lignes: v.debits }); }
        if (n.type === 'sanitaire') { const B = (Liens.calculer(et, n).valeurs || {}).bouclage; if (B && (B.vannes || []).length) debits.push({ installation: `${n.titre} — bouclage ECS`, type: 'Hydraulique', unite: 'L/h', lignes: B.vannes.map(x => ({ repere: `VT-${x.rep}`, local: x.nom || '', type: 'Vanne thermostatique de bouclage', theorique: Math.round(x.q) })) }); }
      } catch (e) { /* calcul incomplet : pas de débits */ }
    });
    return debits;
  }
  return { extraire, debits };
})();
if (typeof module !== 'undefined') module.exports = PointsMes;
