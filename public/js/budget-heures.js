// Budget d'heures par poste d'un chantier : heures chiffrées dans les devis acceptés (main-d'œuvre des ouvrages) face
// aux heures pointées, classées par poste d'après la désignation de l'ouvrage et la tâche du pointage. Alerte quand un
// poste de régulation atteint 80 % de son budget alors que son PV (réglages, essais) n'est pas signé.
// Module pur (navigateur, tests).
const BudgetHeures = (() => {
  const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Postes suivis : désignation de l'ouvrage / tâche du pointage, PV qui clôt le poste
  const POSTES = [
    { cle: 'pap', libelle: 'Essais point à point', re: /point a point|essais gtb|tests gtb/, pv: /^Tests point à point/i },
    { cle: 'mes', libelle: 'Mise en service et essais des séquences', re: /mise en service|sequence|reglages? de la regul|essais fonctionnels/, pv: /^(Essais des séquences|Régulation —)/i },
    { cle: 'prog', libelle: 'Programmation de l\'automate', re: /programm|parametrage automate|automate|analyse fonctionnelle/, pv: /^Réglages de la régulation/i },
  ];
  const posteDe = t => (POSTES.find(p => p.re.test(norm(t))) || {}).cle || 'autres';
  const SEUIL = 0.8;
  // devis : devis acceptés du chantier ; temps : pointages du chantier ; mises : PV de mise en service du chantier
  function calculer({ devis = [], temps = [], mises = [] } = {}) {
    const b = Object.fromEntries([...POSTES.map(p => [p.cle, { ...p, chiffre: 0, pointe: 0 }]), ['autres', { cle: 'autres', libelle: 'Autres travaux', chiffre: 0, pointe: 0 }]]);
    devis.forEach(d => (d.lignes || []).filter(l => l.type !== 'chapitre').forEach(l => {
      const h = (l.composants || []).filter(c => c.type === 'mo').reduce((s, c) => s + num(c.heures), 0) * (num(l.qte) || (l.qte === 0 ? 0 : 1));
      if (h) b[posteDe(l.designation)].chiffre += h;
    }));
    temps.forEach(t => { b[posteDe(t.tache)].pointe += num(t.heures); });
    return Object.values(b).filter(x => x.chiffre || x.pointe).map(x => {
      const pvs = x.pv ? mises.filter(m => x.pv.test(String(m.equipement || ''))) : [], signes = pvs.filter(m => m.statut === 'Signé').length;
      const ratio = x.chiffre ? x.pointe / x.chiffre : (x.pointe ? Infinity : 0), pvFait = !x.pv || (pvs.length > 0 && signes === pvs.length);
      return { cle: x.cle, libelle: x.libelle, chiffre: Math.round(x.chiffre * 100) / 100, pointe: Math.round(x.pointe * 100) / 100, ratio, pv: x.pv ? (pvs.length ? `${signes}/${pvs.length} PV signé(s)` : 'PV pas encore créé') : '',
        alerte: !!x.pv && x.chiffre > 0 && ratio >= SEUIL && !pvFait, depasse: x.chiffre > 0 && ratio > 1 };
    });
  }
  const TACHES_REGULATION = ['Programmation automate', 'Essais point à point', 'Mise en service / séquences'];
  return { POSTES, SEUIL, posteDe, calculer, TACHES_REGULATION };
})();
if (typeof module !== 'undefined') module.exports = BudgetHeures;
