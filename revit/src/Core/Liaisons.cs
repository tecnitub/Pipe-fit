// Provenance et destination d'un spool : chaque extrémité du spool (raccordement chantier ou extrémité libre)
// devient un renvoi « VIENT DE … » ou « VA VERS … » sur l'isométrie.
// Sens : celui de l'écoulement calculé par Revit quand il est connu ; sinon la première extrémité de la ligne
// (point de départ du parcours) est l'arrivée, les autres sont des départs.
using System.Collections.Generic;
using System.Linq;

namespace PipeFit.Isometries.Core
{
    public static class Liaisons
    {
        public static List<Liaison> Calculer(Spool s, List<Composant> ordre)
        {
            var parId = s.Composants.ToDictionary(c => c.Id);
            var res = new List<Liaison>();
            foreach (var c in ordre)
                foreach (var e in c.Extremites)
                {
                    if (e.ConnecteA != null && parId.ContainsKey(e.ConnecteA)) continue;
                    var l = new Liaison { Position = e.Position, Direction = e.Direction, DnMm = e.DnMm, Sens = e.Sens, SensConnu = e.Sens != SensFlux.Inconnu };
                    if (e.ConnecteA != null)
                    {
                        l.RaccordeA = s.NomsExterieurs.TryGetValue(e.ConnecteA, out var nom) && !string.IsNullOrWhiteSpace(nom) ? nom.Trim() : "";
                        l.AutreSpool = s.ExterieursSpool.Contains(e.ConnecteA);
                    }
                    res.Add(l);
                }

            // Sens non fourni par Revit : une arrivée (la première de la ligne s'il n'y en a pas), le reste en départ
            if (res.Any(l => l.Sens == SensFlux.Inconnu))
            {
                if (!res.Any(l => l.Sens == SensFlux.Entree))
                {
                    var premiere = res.FirstOrDefault(l => l.Sens == SensFlux.Inconnu);
                    if (premiere != null) premiere.Sens = SensFlux.Entree;
                }
                foreach (var l in res.Where(x => x.Sens == SensFlux.Inconnu)) l.Sens = SensFlux.Sortie;
            }
            // Arrivées d'abord, puis départs, dans l'ordre de la ligne
            res = res.Where(l => l.Sens == SensFlux.Entree).Concat(res.Where(l => l.Sens != SensFlux.Entree)).ToList();
            for (int i = 0; i < res.Count; i++) res[i].Numero = "L" + (i + 1);
            return res;
        }
    }
}
