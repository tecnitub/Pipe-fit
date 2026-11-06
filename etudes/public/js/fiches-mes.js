// Fiches de mise en service prêtes à remplir, une par équipement de l'étude (générateurs, pompes, terminaux, CTA,
// ventilateurs, ballon, surpresseur, désenfumage, GTB…) : identification, points de contrôle à cocher, mesures avec la
// valeur attendue de l'étude, une case pour la valeur mesurée, l'écart et la conformité, réglages, conclusion, signatures.
// Mêmes points de contrôle et mesures que les PV de mise en service du chantier (Essais). Module pur (navigateur, node).
const FichesMes = ((PM, Es) => {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const nf = (v, d) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const dec = v => (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
  // Tolérance usuelle de réception selon la grandeur
  // Même tolérance que le PV de mise en service (verdict automatique)
  const tolerance = (lib, unite) => Es.tolerance(lib, unite).texte;

  // Fiches de l'étude : [{ cle, titre, type, libType, repere, local, source, frigo, controles: [libellé], mesures: [{ libelle, unite, attendu, tolerance }] }]
  // Fiche d'un point de mise en service (étude) ou d'une tâche de la liste du chantier (même forme : titre / libelle,
  // type, repère, local, contrôles, attendus)
  function depuisPoint(p) {
    const t = Es.TYPES[p.type] || Es.TYPES.autre, att = p.attendus || [];
      const mesures = t.mesures.map(([libelle, unite]) => { const a = att.find(x => norm(x.libelle) === norm(libelle) && (x.unite || '') === (unite || '')); return { libelle, unite, attendu: a ? a.valeur : null }; });
      att.forEach(a => { if (!mesures.some(m => norm(m.libelle) === norm(a.libelle) && m.unite === a.unite)) mesures.push({ libelle: a.libelle, unite: a.unite, attendu: a.valeur }); });
      mesures.forEach(m => { m.tolerance = m.attendu === null ? '' : tolerance(m.libelle, m.unite); });
      // Les mesures attendues par l'étude d'abord
      mesures.sort((a, b) => (a.attendu === null) - (b.attendu === null));
      return { zone: p.zone || '', marque: p.marque || '', modele: p.modele || '', cle: p.cle && /^(pt|mat)\|/.test(p.cle) ? p.cle : `${p.noteId || ''}|${p.cle || ''}|${p.repere || p.titre || p.libelle}`, titre: p.titre || p.libelle || '', type: p.type, libType: t.libelle, repere: p.repere || '', local: p.local || '', source: p.source || '', frigo: !!t.frigo,
        controles: [...(p.controles || []), ...t.controles], mesures };
  }
  function fiches(et, calc) {
    const vus = new Set();
    return PM.extraire(et, calc).filter(p => p.nature === 'mes').filter(p => { const k = `${p.cle || ''}|${p.repere || ''}|${p.titre}`; if (vus.has(k)) return false; vus.add(k); return true; }).map(depuisPoint);
  }

  // Document HTML (une fiche par page) ; et : étude (objet, client), opts : { societe }
  function html(et, liste, opts = {}) {
    const soc = (opts.societe && opts.societe.nom) || 'TECNITUB';
    return `<div class="doe-doc fiches-mes">${liste.map((f, i) => `${i ? '<div class="pdf-saut"></div>' : ''}
      <h2>FICHE DE MISE EN SERVICE</h2>
      <p class="petit">${esc(soc)} · fiche ${i + 1} / ${liste.length}</p>
      <table class="tn ident"><tbody>
        <tr><th>Chantier</th><td colspan="3"><strong>${esc(et.objet || '')}</strong>${et.client ? ` — ${esc(et.client)}` : ''}${et.adresse ? `<br>${esc(et.adresse)}` : ''}${et.moe ? `<br>Maîtrise d'œuvre : ${esc(et.moe)}` : ''}</td></tr>
        <tr><th>Équipement</th><td colspan="3"><strong>${esc(f.titre)}</strong></td></tr>
        <tr><th>Type</th><td>${esc(f.libType)}</td><th>Repère</th><td>${esc(f.repere) || '&nbsp;'}</td></tr>
        <tr><th>Local / emplacement</th><td>${esc(f.local) || '&nbsp;'}</td><th>Étage / zone</th><td>${esc(f.zone) || '&nbsp;'}</td></tr>
        <tr><th>Marque</th><td>${esc(f.marque) || '&nbsp;'}</td><th>Modèle</th><td>${esc(f.modele) || '&nbsp;'}</td></tr>
        <tr><th>N° de série</th><td>&nbsp;</td><th>Date</th><td>&nbsp;</td></tr>
        ${f.frigo ? '<tr><th>Fluide frigorigène</th><td>&nbsp;</td><th>Charge (kg)</th><td>&nbsp;</td></tr>' : ''}
        <tr><th>Technicien</th><td>&nbsp;</td><th>Entreprise</th><td>${esc(soc)}</td></tr></tbody></table>
      <h3>Points de contrôle</h3>
      <table class="tn"><thead><tr><th>Contrôle</th><th>État</th><th style="width:28%">Observation</th></tr></thead>
        <tbody>${f.controles.map(c => `<tr><td>${esc(c)}</td><td class="case">☐ OK ☐ NC ☐ SO</td><td></td></tr>`).join('')}</tbody></table>
      ${f.mesures.filter(m => !Es.releve(m)).length ? `<h3>Mesures et relevés</h3>
      <table class="tn mesures"><thead><tr><th>Mesure</th><th>Unité</th><th>Attendu (étude)</th><th>Tolérance</th><th style="width:16%">Mesuré</th><th style="width:11%">Écart</th><th>Conforme</th></tr></thead>
        <tbody>${f.mesures.filter(m => !Es.releve(m)).map(m => `<tr><td>${esc(m.libelle)}</td><td>${esc(m.unite)}</td><td class="attendu">${m.attendu === null ? '—' : esc(nf(m.attendu, dec(m.attendu)))}</td><td>${esc(m.tolerance)}</td><td></td><td></td><td class="case">☐ oui ☐ non</td></tr>`).join('')}
        <tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td class="case">☐ oui ☐ non</td></tr></tbody></table>
      <p class="petit">Écart = (mesuré − attendu) / attendu. Valeurs attendues reprises des calculs de l'étude${et.indice ? ` (indice ${esc(et.indice)})` : ''}.</p>` : ''}
      ${(() => { const rl = f.mesures.filter(m => Es.releve(m)); if (!rl.length) return '';
        return `<h3>Relevé ligne par ligne (${rl.length} ${rl.some(m => /vanne/.test(Es.releve(m).detail)) ? 'émetteur(s)' : 'bouche(s)'}) — tolérance ${esc(rl[0].tolerance || '± 10 %')}</h3>
      <table class="tn releve"><thead><tr><th>Repère</th><th>Pièce</th><th>Réseau, branche</th><th>Attendu</th><th style="width:13%">Mesuré</th><th style="width:15%">Réglage</th><th>Conforme</th></tr></thead>
        <tbody>${rl.map(m => { const r = Es.releve(m); return `<tr><td><strong>${esc(r.repere)}</strong></td><td>${esc(r.piece)}</td><td class="petit">${esc(r.detail)}</td><td class="attendu">${m.attendu === null ? '—' : `${esc(nf(m.attendu, dec(m.attendu)))} ${esc(m.unite)}`}</td><td></td><td></td><td class="case">☐ oui ☐ non</td></tr>`; }).join('')}</tbody></table>`; })()}
      <h3>Réglages effectués</h3><div class="zone-ecrire"></div>
      <h3>Observations / réserves</h3><div class="zone-ecrire"></div>
      <h3>Conclusion</h3>
      <p>☐ Mis en service &nbsp;&nbsp; ☐ Mis en service avec réserves &nbsp;&nbsp; ☐ Non mis en service</p>
      <table class="tn signatures"><tbody><tr><th>Technicien (nom, date, signature)</th><th>Client / exploitant (nom, date, signature)</th></tr><tr><td class="signature"></td><td class="signature"></td></tr></tbody></table>`).join('')}
      <style>.fiches-mes .ident th { width: 18%; text-align: left; } .fiches-mes td.case { text-align: center; white-space: nowrap; } .fiches-mes td.attendu { font-weight: bold; }
        .fiches-mes .zone-ecrire { border: 1px solid #999; height: 36px; } .fiches-mes td.signature { height: 50px; } .fiches-mes h3 { margin: 8px 0 4px; } .fiches-mes .mesures td { height: 22px; } .fiches-mes .releve td { height: 20px; } .fiches-mes .releve td.petit { font-size: 0.85em; }</style></div>`;
  }
  return { fiches, depuisPoint, html, tolerance };
})(typeof PointsMes !== 'undefined' ? PointsMes : typeof require !== 'undefined' ? require('./points-mes') : null, typeof Essais !== 'undefined' ? Essais : require('../../../public/js/essais'));
if (typeof module !== 'undefined') module.exports = FichesMes;
