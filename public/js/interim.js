// Intérim : missions (entrées / sorties) des intérimaires et registre du personnel.
// Les salariés temporaires figurent au registre unique du personnel de l'entreprise utilisatrice (art. L1221-13 et D1221-23
// du Code du travail) avec la mention « salarié temporaire » et le nom et l'adresse de l'entreprise de travail temporaire.
// Module commun navigateur / démo / tests.
const Interim = (() => {
  // Motifs de recours et durée maximale usuelle de la mission, renouvellement compris (en mois)
  const MOTIFS = [
    ['accroissement', 'Accroissement temporaire d\'activité', 18],
    ['remplacement', 'Remplacement d\'un salarié absent', 18],
    ['attente', 'Attente de l\'entrée en service d\'un salarié recruté en CDI', 9],
    ['urgence', 'Travaux urgents de sécurité', 9],
    ['saisonnier', 'Emploi à caractère saisonnier', 0],
    ['usage', 'Emploi d\'usage constant', 0],
  ];
  const libelleMotif = k => (MOTIFS.find(m => m[0] === k) || [k, k])[1];
  // Nationalités dispensées de titre de travail (France, Union européenne, EEE, Suisse)
  const DISPENSES = ['française', 'allemande', 'autrichienne', 'belge', 'bulgare', 'chypriote', 'croate', 'danoise', 'espagnole', 'estonienne', 'finlandaise', 'grecque',
    'hongroise', 'irlandaise', 'italienne', 'lettone', 'lituanienne', 'luxembourgeoise', 'maltaise', 'néerlandaise', 'polonaise', 'portugaise', 'roumaine', 'slovaque',
    'slovène', 'suédoise', 'tchèque', 'islandaise', 'liechtensteinoise', 'norvégienne', 'suisse', 'monégasque', 'andorrane', 'saint-marinaise'];
  const sansAccents = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const titreRequis = nationalite => !!String(nationalite || '').trim() && !DISPENSES.some(n => sansAccents(n) === sansAccents(nationalite).replace(/^(nationalite\s+)/, ''));
  // Informations obligatoires au registre pour chaque salarié temporaire
  const OBLIGATOIRES = [['nom', 'Nom et prénom'], ['nationalite', 'Nationalité'], ['dateNaissance', 'Date de naissance'], ['sexe', 'Sexe'], ['qualification', 'Emploi et qualification'],
    ['dateEntree', 'Date d\'entrée'], ['agenceId', 'Entreprise de travail temporaire'], ['numeroContrat', 'N° du contrat de mise à disposition'], ['motif', 'Motif de recours']];
  const d12 = s => new Date(`${String(s).slice(0, 10)}T12:00:00`);
  const jours = (a, b) => Math.round((d12(b) - d12(a)) / 86400000);
  const ajouterMois = (s, n) => { const d = d12(s); d.setMonth(d.getMonth() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  const present = (m, auj) => !!m.dateEntree && m.dateEntree <= auj && (!m.dateSortie || m.dateSortie >= auj);
  const manquants = m => [...OBLIGATOIRES.filter(([k]) => !String(m[k] || '').trim()).map(([, l]) => l),
    ...(titreRequis(m.nationalite) && !(m.titreType && m.titreNumero) ? ['Titre autorisant à travailler (type et n°)'] : [])];
  // Points à surveiller sur une mission : dossier incomplet, fin prévue dépassée sans sortie, durée maximale, titre de séjour
  function alertes(m, auj) {
    const a = [], fin = m.dateSortie || m.finPrevue || auj, max = (MOTIFS.find(x => x[0] === m.motif) || [])[2];
    const manque = manquants(m);
    if (manque.length) a.push({ niveau: 'warn', texte: `Registre incomplet : ${manque.join(', ')}` });
    if (m.finPrevue && m.finPrevue < auj && !m.dateSortie) a.push({ niveau: 'bad', texte: `Fin de mission prévue le ${m.finPrevue.split('-').reverse().join('/')} dépassée : saisir la sortie ou le renouvellement` });
    if (max && m.dateEntree && fin > ajouterMois(m.dateEntree, max)) a.push({ niveau: 'bad', texte: `Mission de plus de ${max} mois pour ce motif` });
    if (titreRequis(m.nationalite) && m.titreExpire && present(m, auj)) {
      const j = jours(auj, m.titreExpire);
      if (j < 0) a.push({ niveau: 'bad', texte: `Titre autorisant à travailler expiré depuis ${-j} j` });
      else if (j <= 60) a.push({ niveau: 'warn', texte: `Titre autorisant à travailler : expire dans ${j} j` });
    }
    return a;
  }
  // Registre : missions par ordre d'entrée, numérotées
  const registre = missions => missions.filter(m => m.dateEntree).slice().sort((a, b) => a.dateEntree.localeCompare(b.dateEntree) || String(a.nom).localeCompare(String(b.nom))).map((m, i) => ({ ...m, ordre: i + 1 }));
  const dureeJours = (m, auj) => (m.dateEntree ? jours(m.dateEntree, m.dateSortie || auj) + 1 : 0);
  return { MOTIFS, OBLIGATOIRES, libelleMotif, titreRequis, present, manquants, alertes, registre, dureeJours, ajouterMois };
})();
if (typeof module !== 'undefined') module.exports = Interim;
