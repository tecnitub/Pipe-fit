// Quantitatif du complément Revit « Pipe-Fit Isométries » dans le chiffrage depuis plan : en plus des fournitures,
// le fichier porte les soudures et joints boulonnés réellement présents dans la maquette, par réseau et par DN :
//   « Soudure atelier » (dans un spool), « Soudure chantier » (entre spools ou vers un équipement),
//   « Joint boulonné atelier » / « Joint boulonné chantier »,
//   « Soudure » / « Joint boulonné » sans lieu (tuyauterie pas encore découpée en spools) : répartis selon la part atelier.
// Quand le fichier contient des soudures réelles, elles remplacent l'estimation par famille (soudures par raccord).
// Module commun navigateur / tests.
const Quantitatif = (() => {
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const nb = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };

  // Nature d'une ligne de la nomenclature : 'soudureA', 'soudureC', 'soudure', 'jointA', 'jointC', 'joint' ou '' (fourniture)
  function nature(famille, type) {
    const f = norm(famille);
    const quoi = /^soudures?\b/.test(f) ? 'soudure' : /^joints? boulonnes?\b/.test(f) ? 'joint' : '';
    if (!quoi) return '';
    const n = norm(`${famille} ${type}`);
    return quoi + (/\b(chantier|site|montage sur site|raccordement)\b/.test(n) ? 'C' : /\b(atelier|prefabrication|prefab)\b/.test(n) ? 'A' : '');
  }
  const estSoudure = nat => /^soudure/.test(nat || '');

  // Montage d'un joint boulonné (mise en place du joint, boulonnage, serrage), heures par joint selon le DN
  const JOINTS_DEFAUT = [[25, 0.3], [50, 0.5], [80, 0.7], [100, 0.9], [150, 1.3], [200, 1.8], [300, 2.6]].map(([dn, h]) => ({ dn, h }));

  // Barème par diamètre : la ligne du DN, sinon celle du diamètre supérieur le plus proche
  function bareme(liste, dn) {
    const l = (liste || []).filter(x => nb(x.dn) > 0).sort((a, b) => nb(a.dn) - nb(b.dn));
    if (!l.length) return null;
    return nb((l.find(x => nb(x.dn) >= nb(dn)) || l[l.length - 1]).h);
  }

  // Heures et pouces par unité d'une ligne réelle. p : paramètres du chiffrage ; coef : complexité ; pouces(dn) : pouces-diamètre
  function unitaire(nat, dn, p, coef, pouces) {
    const hj = nb(p.heuresJour) || 7, inch = pouces(dn);
    const part = Math.min(1, Math.max(0, nb(p.partAtelier) / 100));
    const A = nat.endsWith('A') ? 1 : nat.endsWith('C') ? 0 : part;   // part réalisée en atelier
    const r = { inch, poucesA: 0, poucesC: 0, hA: 0, hPose: 0, hSoudC: 0, souduresC: 0 };
    if (estSoudure(nat)) {
      r.poucesA = inch * A; r.poucesC = inch * (1 - A); r.souduresC = 1 - A;
      r.hA = r.poucesA / Math.max(1, nb(p.cadenceAtelier)) * hj * coef;
      r.hSoudC = r.poucesC / Math.max(1, nb(p.cadenceChantier)) * hj * coef;
    } else {
      const h = (bareme(p.jointsBoulonnes || JOINTS_DEFAUT, dn) ?? 0) * coef;
      r.hA = h * A; r.hPose = h * (1 - A);
    }
    return r;
  }

  function libelle(nat) {
    return {
      soudureA: 'Soudures atelier', soudureC: 'Soudures de raccordement sur site', soudure: 'Soudures (atelier / site)',
      jointA: 'Montage des joints boulonnés en atelier', jointC: 'Montage des joints boulonnés sur site', joint: 'Montage des joints boulonnés',
    }[nat] || '';
  }

  return { nature, estSoudure, unitaire, bareme, libelle, JOINTS_DEFAUT };
})();
if (typeof module !== 'undefined') module.exports = Quantitatif;
