// Repérage des spools pour le montage : ordre de pose et voisins de chaque spool. Les spools sont reliés par leurs
// raccordements chantier ; dans chaque ensemble raccordé, le montage part du spool d'arrivée (sens d'écoulement connu
// par Revit, sinon spool raccordé à un spool d'un autre groupe déjà monté, sinon à un équipement, sinon le plus bas)
// et avance de proche en proche.
using System;
using System.Collections.Generic;
using System.Linq;

namespace PipeFit.Isometries.Core
{
    public sealed class EtapeMontage
    {
        public int Ordre;
        public Spool Spool;
        /// <summary>Spool (ou équipement) contre lequel on pose celui-ci.</summary>
        public string PoseContre = "";
        /// <summary>Spools voisins (raccordés à celui-ci).</summary>
        public List<string> Voisins = new List<string>();
        /// <summary>Numéro de l'ensemble raccordé (une ligne, un réseau), à partir de 1.</summary>
        public int Ensemble;
    }

    public static class Montage
    {
        public static List<EtapeMontage> Ordonner(List<Spool> spools)
        {
            var spoolDe = new Dictionary<string, Spool>();
            foreach (var s in spools) foreach (var c in s.Composants) spoolDe[c.Id] = s;
            var voisins = spools.ToDictionary(s => s, s => new List<Spool>());
            foreach (var s in spools)
                foreach (var e in s.Composants.SelectMany(c => c.Extremites))
                    if (e.ConnecteA != null && spoolDe.TryGetValue(e.ConnecteA, out var v) && v != s && !voisins[s].Contains(v))
                    { voisins[s].Add(v); if (!voisins[v].Contains(s)) voisins[v].Add(s); }

            // Ensembles raccordés
            var ensembles = new List<List<Spool>>();
            var vus = new HashSet<Spool>();
            foreach (var s in spools)
            {
                if (!vus.Add(s)) continue;
                var g = new List<Spool> { s };
                var file = new Queue<Spool>(new[] { s });
                while (file.Count > 0) foreach (var v in voisins[file.Dequeue()]) if (vus.Add(v)) { g.Add(v); file.Enqueue(v); }
                ensembles.Add(g);
            }

            Point3 Bas(Spool s) => s.Composants.SelectMany(c => c.Extremites).Select(e => e.Position)
                .DefaultIfEmpty(new Point3()).OrderBy(p => p.Z).ThenBy(p => p.X).ThenBy(p => p.Y).First();
            // Un spool raccordé à un spool d'un autre groupe (autre ensemble, autre zone) se pose contre lui
            var noms = new HashSet<string>(spools.Select(x => x.Nom));
            bool Dehors(Liaison l) => !l.AutreSpool || !noms.Contains(l.RaccordeA);
            Liaison Arrivee(Spool s, bool connue) => s.Liaisons.FirstOrDefault(l => l.Sens == SensFlux.Entree && (!connue || l.SensConnu) && l.RaccordeA != "" && Dehors(l));
            Liaison Equipement(Spool s) => s.Liaisons.FirstOrDefault(l => l.RaccordeA != "" && !l.AutreSpool);
            Liaison AutreGroupe(Spool s) => s.Liaisons.FirstOrDefault(l => l.AutreSpool && Dehors(l));

            var res = new List<EtapeMontage>();
            int ordre = 0, n = 0;
            foreach (var g in ensembles.OrderBy(g => g.Select(x => x.Systeme).OrderBy(x => x, StringComparer.CurrentCultureIgnoreCase).FirstOrDefault() ?? "", StringComparer.CurrentCultureIgnoreCase)
                         .ThenBy(g => g.Min(x => Bas(x).Z)))
            {
                n++;
                var depart = g.FirstOrDefault(s => Arrivee(s, true) != null)
                    // On prolonge ce qui est déjà monté (spool d'un autre ensemble) avant de partir d'un équipement
                    ?? g.FirstOrDefault(s => AutreGroupe(s) != null)
                    ?? g.FirstOrDefault(s => Equipement(s) != null)
                    ?? g.OrderBy(s => Bas(s).Z).ThenBy(s => Bas(s).X).ThenBy(s => Bas(s).Y).First();
                var parent = new Dictionary<Spool, Spool>();
                var places = new HashSet<Spool> { depart };
                var file = new Queue<Spool>(new[] { depart });
                while (file.Count > 0)
                {
                    var s = file.Dequeue();
                    var contre = parent.TryGetValue(s, out var p) ? p.Nom
                        : (Arrivee(s, true) ?? AutreGroupe(s) ?? Equipement(s))?.RaccordeA ?? "";
                    res.Add(new EtapeMontage
                    {
                        Ordre = ++ordre, Spool = s, PoseContre = contre, Ensemble = n,
                        Voisins = voisins[s].Select(v => v.Nom).OrderBy(x => x, Comparer<string>.Create(AnalyseSpool.ComparerNaturel)).ToList(),
                    });
                    foreach (var v in voisins[s].OrderBy(x => x.Nom, Comparer<string>.Create(AnalyseSpool.ComparerNaturel)))
                        if (places.Add(v)) { parent[v] = s; file.Enqueue(v); }
                }
            }
            return res;
        }

        public enum Regroupement { Tout, Systeme, Ensemble, SystemeEtEnsemble }

        /// <summary>Groupes de spools pour les vues de repérage : un par système, par ensemble, ou par système et ensemble.</summary>
        public static List<(string Nom, List<Spool> Spools)> Grouper(List<Spool> spools, Regroupement par)
        {
            string Ens(Spool s) => s.Ensemble != "" ? s.Ensemble : "sans ensemble";
            string Sys(Spool s) => s.Systeme != "" ? s.Systeme : "sans système";
            Func<Spool, string> cle;
            switch (par)
            {
                case Regroupement.Systeme: cle = Sys; break;
                case Regroupement.Ensemble: cle = Ens; break;
                case Regroupement.SystemeEtEnsemble: cle = s => Sys(s) + " – " + Ens(s); break;
                default: cle = s => ""; break;
            }
            return spools.GroupBy(cle).OrderBy(g => g.Key, Comparer<string>.Create(AnalyseSpool.ComparerNaturel))
                .Select(g => (g.Key, g.OrderBy(s => s.Nom, Comparer<string>.Create(AnalyseSpool.ComparerNaturel)).ToList())).ToList();
        }

        /// <summary>Tableau « ORDRE DE MONTAGE » pour la feuille de repérage.</summary>
        public static Tableau Tableau(List<EtapeMontage> etapes, Func<Spool, string> couleur, Func<Spool, string> feuille)
        {
            var fr = System.Globalization.CultureInfo.GetCultureInfo("fr-FR");
            var t = new Tableau { Titre = "ORDRE DE MONTAGE" };
            t.Colonnes.Add(new Colonne("N°", 9)); t.Colonnes.Add(new Colonne("Spool", 24)); t.Colonnes.Add(new Colonne("Couleur", 18));
            t.Colonnes.Add(new Colonne("Posé contre", 30)); t.Colonnes.Add(new Colonne("Tube", 15, true)); t.Colonnes.Add(new Colonne("Isométrie", 34));
            foreach (var e in etapes)
                t.Lignes.Add(new[]
                {
                    e.Ordre.ToString(fr), e.Spool.Nom, couleur(e.Spool), e.PoseContre,
                    (Decoupage.LongueurTube(e.Spool.Composants) / 1000).ToString("0.0", fr) + " m", feuille(e.Spool),
                });
            return t;
        }
    }
}
