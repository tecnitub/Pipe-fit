// Notice d'exploitation et de maintenance générée à partir du DOE : présentation de l'installation, équipements posés
// (repère, marque, référence, n° de série, localisation), consignes de conduite et de sécurité par famille, réglages et
// mesures relevés à la mise en service (PV signés de Pipe-Fit), carnet d'entretien, formation, contacts.
// Module pur (navigateur, node, tests) ; le HTML est mis en page en PDF par l'application DOE.
const NoticeExploitation = (() => {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const dateFr = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
  const vide = v => v === undefined || v === null || String(v).trim() === '';
  // Consignes par famille du DOE : [mise en marche, arrêt, surveillance courante, sécurités et arrêt d'urgence]
  const CONSIGNES = {
    '3.1': [['Vérifier la pression du réseau (manomètre) et l\'ouverture des vannes d\'isolement.', 'Mettre sous tension, puis en marche depuis le régulateur ou la GTB ; vérifier le démarrage des pompes de circuit.'],
      ['Arrêt depuis le régulateur ou la GTB ; couper l\'alimentation électrique seulement pour une intervention (attendre l\'arrêt des pompes de post-circulation).'],
      ['Contrôler chaque semaine les températures de départ / retour, la pression du réseau et l\'absence d\'alarme.', 'Ne pas obstruer les échangeurs extérieurs ; dégager neige et feuilles.'],
      ['Sécurités HP / BP, débit d\'eau et antigel : en cas de déclenchement répété, appeler le SAV (pas de réarmement en boucle).', 'Arrêt d\'urgence : coupure générale au tableau électrique repéré.']],
    '3.2': [['Ouvrir les vannes d\'isolement des terminaux, vérifier la purge.'], ['Arrêt par le thermostat d\'ambiance ou la GTB.'],
      ['Nettoyer ou remplacer les filtres selon le carnet d\'entretien ; vérifier l\'écoulement des condensats.'], ['Ne pas modifier le préréglage des vannes d\'équilibrage (repérées sur les plans).']],
    '3.3': [['Mise en marche par la télécommande ou la centrale de gestion.'], ['Arrêt par la télécommande ; couper au disjoncteur pour toute intervention.'],
      ['Nettoyer les filtres des unités intérieures ; contrôler l\'écoulement des condensats.'], ['Toute intervention sur le circuit frigorifique est réservée à un frigoriste certifié (fiche d\'intervention Cerfa).']],
    '3.4': [['Vérifier les registres et les filtres, puis mettre en marche depuis la GTB (programmation horaire).'], ['Arrêt depuis la GTB ; ne pas couper l\'alimentation en période de gel (protection antigel des batteries).'],
      ['Surveiller la perte de charge des filtres (pressostats), la température de soufflage, les alarmes.'], ['Sécurité antigel, détection incendie : arrêt automatique de la CTA et fermeture des clapets coupe-feu.']],
    '3.5': [['Mise en marche du caisson depuis l\'interrupteur de proximité ou la GTB.'], ['Ne pas arrêter la ventilation des locaux occupés (hygiène).'],
      ['Nettoyer les bouches et entrées d\'air ; contrôler les débits annuellement.'], ['Interrupteur de proximité cadenassable pour toute intervention.']],
    '3.6': [['Installation de sécurité : commandée par le CMSI, ne pas la mettre en marche manuellement hors essais.'], ['Réarmement depuis le CMSI après un déclenchement.'],
      ['Essai périodique réglementaire par un vérificateur agréé ; consigner les essais dans le registre de sécurité.'], ['Alimentation électrique de sécurité : ne jamais la couper.']],
    '3.7': [['Ouvrir progressivement les vannes ; purger les points hauts.'], ['Fermer les vannes d\'isolement pour isoler un équipement ; consigner avant intervention.'],
      ['Manœuvrer les vannes deux fois par an ; nettoyer les filtres et pots à boue ; contrôler la pression du réseau.'], ['Ne pas dérégler les vannes d\'équilibrage ; soupapes de sécurité raccordées à l\'égout.']],
    '3.8': [['Mise en service progressive des réseaux (purges, montée en pression et en température lentes).'], ['Isoler et vidanger avant toute intervention ; consignation.'],
      ['Inspection visuelle : supportage, calorifuge, fuites, corrosion.'], ['Équipements sous pression : respecter les pressions maximales admissibles inscrites sur les plaques.']],
    '3.9': [['Mettre en chauffe le ballon (au moins 55 °C au stockage), mettre en marche la pompe de bouclage.'], ['Ne pas arrêter le bouclage d\'ECS (risque de légionelles).'],
      ['Relever les températures : départ ≥ 55 °C, retour de boucle ≥ 50 °C ; tenir le carnet sanitaire.'], ['Mitigeurs thermostatiques des pièces de toilette réglés à 50 °C maximum ; disconnecteurs contrôlés chaque année.']],
  };
  const titres = ['Mise en marche', 'Arrêt', 'Surveillance courante', 'Sécurités et arrêt d\'urgence'];

  // doe : dossier DOE ; opts : { trame (TRAME), essais: { mes: [PV signés] }, societe: { raison, tel, email, adresse } }
  function html(doe, opts = {}) {
    const T = opts.trame || (typeof TRAME !== 'undefined' ? TRAME : { familles: [], maintenance: {}, formation: [] }), soc = opts.societe || {}, essais = opts.essais || {};
    const eqs = (doe.equipements || []).filter(e => !vide(e.designation));
    const familles = (T.familles || []).filter(f => eqs.some(e => e.famille === f.id) || (doe.familles || []).includes(f.id));
    const maint = (doe.maintenance || []).length ? doe.maintenance : familles.flatMap(f => (T.maintenance[f.id] || []));
    const mes = (essais.mes || []).filter(m => m.statut === 'Signé'), regulation = (opts.regulation || []).filter(Boolean);
    const tableau = (entetes, lignes) => `<table class="tn"><thead><tr>${entetes.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${lignes.map(l => `<tr>${l.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    let n = 0; const ch = t => `<h2>${++n}. ${esc(t)}</h2>`;
    return `<div class="doe-doc notice">
      <h1>NOTICE D'EXPLOITATION ET DE MAINTENANCE</h1>
      <p><strong>${esc(doe.operation || '')}</strong>${doe.adresse ? `<br>${esc(doe.adresse)}` : ''}<br>Lot ${esc(doe.lot || '')} — ${esc(doe.discipline || '')}${doe.dates && doe.dates.reception ? ` · réception du ${dateFr(doe.dates.reception)}` : ''}</p>
      <p class="petit">Établie par ${esc(soc.raison || 'l\'entreprise')} à partir du DOE (indice ${esc(doe.indice || 'A')}) et des procès-verbaux de mise en service. À conserver dans le local technique avec le carnet d'entretien.</p>
      ${ch('Présentation de l\'installation')}
      <p>L'installation comprend : ${familles.map(f => esc(f.titre.toLowerCase())).join(' ; ') || 'voir la liste des équipements'}. Les schémas de principe et les plans de recollement figurent en annexe A du DOE ; les fiches techniques et notices des constructeurs en annexe B.</p>
      ${ch('Équipements installés')}
      ${familles.map(f => { const l = eqs.filter(e => e.famille === f.id); return l.length ? `<h3>${esc(f.titre)}</h3>${tableau(['Repère', 'Désignation', 'Marque', 'Référence', 'N° de série', 'Qté', 'Localisation'], l.map(e => [esc(e.repere), esc(e.designation), esc(e.marque), esc(e.reference), esc(e.serie), esc(e.quantite), esc(e.localisation)]))}` : ''; }).join('') || '<p>Liste des équipements à compléter dans le DOE (section 3).</p>'}
      ${ch('Consignes de conduite')}
      ${familles.filter(f => CONSIGNES[f.id]).map(f => `<h3>${esc(f.titre)}</h3>${CONSIGNES[f.id].map((l, i) => `<p><strong>${titres[i]}</strong></p><ul>${l.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}`).join('')}
      ${regulation.length ? `${ch('Régulation')}
        <p class="petit">Analyse fonctionnelle, réglages et liste des points établis par l'étude d'exécution ; valeurs réglées relevées sur les PV de mise en service de la régulation.</p>
        ${regulation.flatMap(r => r.installations || []).map(x => { const pv = mes.find(m => String(m.equipement || '').startsWith(`Régulation — ${x.titre}`)), regle = l => { const m = pv && (pv.mesures || []).find(y => y.libelle === l); return m && !vide(m.valeur) ? esc(String(m.valeur).replace('.', ',')) : '—'; };
          return `<h3>${esc(x.titre)}${x.techno ? ` — ${esc(x.techno)}` : ''}</h3>${(x.af || []).length ? `<ul>${x.af.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
          ${(x.params || []).length ? tableau(['Paramètre', 'Valeur de l\'étude', 'Valeur réglée (PV)'], x.params.map(p => [esc(p.libelle), `${esc(String(p.valeur).replace('.', ','))} ${esc(p.unite || '')}`, regle(p.libelle)])) : ''}`; }).join('')}
        ${regulation.flatMap(r => r.courbes || []).map(c => `<h3>${esc(c.titre)}</h3><p><img alt="${esc(c.titre)}" style="width:100%;max-width:640px" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.svg)}"></p>
          ${c.tableau ? tableau(c.tableau.entetes.map(esc), c.tableau.lignes.map(l => l.map(esc))) : ''}${(c.reglages || []).length ? `<p class="petit">Réglage sur le régulateur : ${esc(c.reglages.join(' ; '))}.</p>` : ''}`).join('')}
        ${regulation.flatMap(r => r.sequences || []).map(s => `<h3>Séquences de fonctionnement — ${esc(s.titre)}</h3>${tableau(['Phase', 'Déroulement', 'Paramètres par défaut'], s.lignes.map(l => l.map(esc)))}`).join('')}
        ${regulation.some(r => r.points) ? `<h3>Liste des points GTB</h3>${regulation.filter(r => r.points).map(r => tableau(r.points.entetes.map(esc), r.points.lignes.map(l => l.map(esc)))).join('')}` : ''}
        ${regulation.some(r => r.echange) ? `<h3>Table d'échange GTB (objets BACnet, registres Modbus)</h3>${regulation.filter(r => r.echange).map(r => tableau(r.echange.entetes.map(esc), r.echange.lignes.map(l => l.map(esc)))).join('')}` : ''}
        ${regulation.some(r => r.bacs) ? (() => { const b = regulation.find(r => r.bacs).bacs; return `<h3>Décret BACS et classe de la régulation</h3>
          <p>Puissance nominale chauffage + climatisation : ${esc(String(Math.round(b.P || 0)))} kW — ${b.assujetti ? `bâtiment assujetti (${esc(b.echeance || '')})` : 'non assujetti'} ; classe estimée de la régulation (NF EN ISO 52120-1) : <strong>${esc(b.classe || '—')}</strong>${b.conforme ? ' (A ou B : conforme)' : ' (classe B minimum exigée)'}.</p>
          ${(b.fonctions || []).length ? tableau(['Domaine', 'Fonction', 'Classe'], b.fonctions.map(l => l.map(esc))) : ''}${(b.exigences || []).length ? tableau(['Exigence du décret', 'Disposition', 'Statut'], b.exigences.map(l => l.map(esc))) : ''}`; })() : ''}
        ${regulation.some(r => r.comptages) ? `<h3>Comptage d'énergie par usage</h3><p class="petit">Relever les index chaque mois (suivi des consommations, décret tertiaire / plateforme OPERAT) ; les historiques sont conservés par la GTB.</p>${tableau(regulation.find(r => r.comptages).comptages.entetes.map(esc), regulation.find(r => r.comptages).comptages.lignes.map(l => l.map(esc)))}` : ''}
        ${regulation.some(r => (r.folios || []).length) ? `<h3>Schémas électriques des armoires (folios)</h3><p class="petit">Les folios sont remis au format PDF A3 et DXF dans le dossier des armoires (porte-plans) et en annexe A du DOE.</p>${tableau(['Calcul', 'Folio'], regulation.flatMap(r => r.folios || []).map(f => [esc(f.note), esc(f.titre)]))}
          ${regulation.filter(r => r.unifilaire).slice(0, 1).map(r => `<p><img alt="Schéma unifilaire des armoires" style="width:100%" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(r.unifilaire)}"></p>`).join('')}` : ''}` : ''}
      ${ch('Réglages et mesures relevés à la mise en service')}
      ${mes.length ? mes.map(m => `<h3>${esc(m.equipement)}${m.repere ? ` (${esc(m.repere)})` : ''} — PV ${esc(m.numero || '')} du ${dateFr(m.date)}</h3>
        ${[m.localisation, m.zone].filter(Boolean).length ? `<p class="petit">Localisation : ${esc([m.localisation, m.zone].filter(Boolean).join(' — '))}${m.marque || m.modele ? ` · ${esc([m.marque, m.modele].filter(Boolean).join(' '))}` : ''}${m.numeroSerie ? ` · n° ${esc(m.numeroSerie)}` : ''}</p>` : ''}
        ${(m.mesures || []).some(x => !vide(x.valeur)) ? tableau(['Mesure', 'Valeur relevée', 'Valeur attendue (étude)'], m.mesures.filter(x => !vide(x.valeur)).map(x => [esc(x.libelle), `${esc(String(x.valeur).replace('.', ','))} ${esc(x.unite || '')}`, vide(x.attendu) ? '' : `${esc(String(x.attendu).replace('.', ','))} ${esc(x.unite || '')}`])) : ''}
        ${m.reglages ? `<p><strong>Réglages :</strong> ${esc(m.reglages)}</p>` : ''}${m.resultat ? `<p class="petit">Conclusion : ${esc(m.resultat)}</p>` : ''}`).join('') : '<p>Aucun PV de mise en service signé pour l\'instant : les réglages seront repris à la prochaine génération de la notice.</p>'}
      ${ch('Entretien périodique')}
      ${maint.length ? tableau(['Équipement', 'Opération', 'Fréquence', 'Intervenant'], maint.map(l => (Array.isArray(l) ? l : [l.equipement, l.operation, l.frequence, l.intervenant]).map(esc))) : '<p>Carnet d\'entretien à compléter.</p>'}
      <p class="petit">Contrats d'entretien et visites réglementaires (étanchéité des circuits frigorifiques, désenfumage, disconnecteurs, légionelles) à la charge de l'exploitant.</p>
      ${ch('Formation de l\'exploitant')}
      ${tableau(['Module', 'Contenu', 'Durée'], (T.formation || []).map(l => [esc(l[0]), esc(l[1]), esc(l[2])]))}
      ${ch('Contacts')}
      <p><strong>${esc(soc.raison || '')}</strong>${soc.adresse ? `<br>${esc(soc.adresse)}` : ''}${soc.tel ? `<br>Tél. ${esc(soc.tel)}` : ''}${soc.email ? ` · ${esc(soc.email)}` : ''}<br>SAV et garanties : voir la section 3 du DOE (garantie et SAV de chaque équipement).</p>
    </div>`;
  }
  return { html, CONSIGNES };
})();
if (typeof module !== 'undefined') module.exports = NoticeExploitation;
