// Catalogues de pompes et de vannes de régulation : gamme générique d'exemple (ordres de grandeur, aucune marque) remplacée
// par les catalogues fournisseurs importés en CSV dans les Réglages. Choix du modèle d'après le point de fonctionnement.
const Catalogue = (() => {
  // Pompes : [modèle, type, DN, Hmax (m), Qmax (m³/h), P1 maxi (W)] ; courbe à vitesse maximale H = Hmax · (1 − (Q / Qmax)²)
  const POMPES_GENERIQUES = [
    ['Circulateur 25-40', 'Circulateur à rotor noyé', 25, 4, 3, 45], ['Circulateur 25-60', 'Circulateur à rotor noyé', 25, 6, 4, 70], ['Circulateur 32-80', 'Circulateur à rotor noyé', 32, 8, 9, 180],
    ['Circulateur 40-100', 'Circulateur à rotor noyé', 40, 10, 15, 450], ['Circulateur 50-120', 'Circulateur à rotor noyé', 50, 12, 28, 900], ['Circulateur 65-120', 'Circulateur à rotor noyé', 65, 12, 45, 1300],
    ['Circulateur 80-120', 'Circulateur à rotor noyé', 80, 12, 65, 1800], ['In-line 65-160', 'Pompe in-line à rotor sec', 65, 18, 70, 4000], ['In-line 80-200', 'Pompe in-line à rotor sec', 80, 24, 120, 9200],
    ['In-line 100-200', 'Pompe in-line à rotor sec', 100, 26, 190, 15000], ['In-line 125-250', 'Pompe in-line à rotor sec', 125, 32, 300, 30000],
  ].map(([modele, type, dn, Hmax, Qmax, P1]) => ({ fabricant: 'Gamme générique', modele, type, dn, Hmax, Qmax, P1 }));
  // Vannes : [type, DN, Kvs] — séries usuelles de vannes de régulation à boisseau ou à siège
  const VANNES_GENERIQUES = [[15, [0.4, 0.63, 1, 1.6, 2.5, 4]], [20, [6.3]], [25, [10]], [32, [16]], [40, [25]], [50, [40]], [65, [63]], [80, [100]], [100, [160]], [125, [250]], [150, [400]]]
    .flatMap(([dn, kvs]) => kvs.flatMap(k => ['2v', '3v'].map(type => ({ fabricant: 'Gamme générique', modele: `Vanne ${type === '2v' ? '2' : '3'} voies DN ${dn} Kvs ${String(k).replace('.', ',')}`, type, dn, Kvs: k }))));
  let pompes = POMPES_GENERIQUES, vannes = VANNES_GENERIQUES;

  // Catalogues personnalisés (vides : gamme générique)
  function utiliser(cat) {
    pompes = cat && cat.pompes && cat.pompes.length ? cat.pompes : POMPES_GENERIQUES;
    vannes = cat && cat.vannes && cat.vannes.length ? cat.vannes : VANNES_GENERIQUES;
  }
  const generique = () => ({ pompes: pompes === POMPES_GENERIQUES, vannes: vannes === VANNES_GENERIQUES });
  // Vitesse relative pour passer par le point (Q, H) : lois de similitude sur la courbe Hmax · n² − Hmax · Q² / Qmax²
  const vitesse = (p, Q, H) => Math.sqrt((H + p.Hmax * (Q / p.Qmax) ** 2) / p.Hmax);
  // Pompes capables du point (Q m³/h, H m) avec 10 % de réserve de hauteur, classées de la plus petite à la plus grande
  function pompesPour(Q, H) {
    if (!(Q > 0) || !(H > 0)) return [];
    return pompes.filter(p => Q <= 0.9 * p.Qmax && p.Hmax * (1 - (Q / p.Qmax) ** 2) >= 1.1 * H)
      .map(p => ({ ...p, vitesse: vitesse(p, Q, H) })).sort((a, b) => a.P1 - b.P1 || a.Hmax * a.Qmax - b.Hmax * b.Qmax);
  }
  // Vanne de type donné : Kvs normalisé immédiatement supérieur au Kv, plus petit DN disponible
  function vannePour(Kv, type = '2v') {
    if (!(Kv > 0)) return null;
    const ok = vannes.filter(v => v.type === type && v.Kvs >= Kv * 0.97).sort((a, b) => a.Kvs - b.Kvs || a.dn - b.dn);
    return ok[0] || null;
  }
  // Import CSV (séparateur ; ou ,) — pompes : fabricant;modèle;type;DN;Hmax m;Qmax m³/h;P1 W — vannes : fabricant;modèle;2v|3v;DN;Kvs
  function lireCsv(texte, genre) {
    const nombre = v => parseFloat(String(v || '').replace(',', '.').trim());
    const lignes = String(texte || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean), sep = (lignes[0] || '').includes(';') ? ';' : ',';
    const out = [], rejets = [];
    lignes.forEach((l, i) => {
      const c = l.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
      if (i === 0 && /fabricant|mod[eè]le/i.test(l)) return; // en-tête
      const p = genre === 'pompes' ? { fabricant: c[0], modele: c[1], type: c[2] || 'Pompe', dn: nombre(c[3]), Hmax: nombre(c[4]), Qmax: nombre(c[5]), P1: nombre(c[6]) || 0 }
        : { fabricant: c[0], modele: c[1], type: /3/.test(c[2]) ? '3v' : '2v', dn: nombre(c[3]), Kvs: nombre(c[4]) };
      const valide = p.modele && (genre === 'pompes' ? p.Hmax > 0 && p.Qmax > 0 : p.Kvs > 0);
      (valide ? out : rejets).push(valide ? p : i + 1);
    });
    return { liste: out, rejets };
  }
  const modeleCsv = genre => (genre === 'pompes' ? 'fabricant;modele;type;DN;Hmax_m;Qmax_m3h;P1_W\nMonFabricant;Série 40-120;Circulateur;40;12;16;520\n'
    : 'fabricant;modele;type_2v_3v;DN;Kvs\nMonFabricant;V2V-25;2v;25;10\n');
  return { utiliser, generique, pompesPour, vannePour, lireCsv, modeleCsv, vitesse, POMPES_GENERIQUES, VANNES_GENERIQUES, get pompes() { return pompes; }, get vannes() { return vannes; } };
})();
if (typeof module !== 'undefined') module.exports = Catalogue;
