// Numérotation des spools : découpage de la tuyauterie en spools et numéros.
// Un spool est un ensemble soudé : on le coupe aux joints boulonnés (bride contre bride, bride contre vanne),
// là où la ligne se démonte. On n'entre pas non plus dans un élément qui porte déjà un autre numéro.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace PipeFit.Isometries.Core
{
    public static class Decoupage
    {
        static void Classer(IEnumerable<Composant> composants)
        {
            foreach (var c in composants) if (c.Type == TypeComposant.Autre) c.Type = AnalyseSpool.Classer(c);
        }

        /// <summary>Deux composants raccordés restent dans le même spool sauf si le joint est boulonné.</summary>
        public static bool MemeSpool(Composant a, Composant b) => !(AnalyseSpool.Boulonnable(a) && AnalyseSpool.Boulonnable(b));

        /// <summary>
        /// Complète une sélection jusqu'aux joints boulonnés : tout ce qui est soudé aux éléments de départ.
        /// bloques : éléments à ne pas prendre (déjà numérotés autrement).
        /// </summary>
        public static HashSet<string> Etendre(List<Composant> tous, IEnumerable<string> depart, ISet<string> bloques = null)
        {
            Classer(tous);
            var parId = tous.ToDictionary(c => c.Id);
            var res = new HashSet<string>();
            var file = new Queue<string>(depart.Where(parId.ContainsKey));
            foreach (var id in file) res.Add(id);
            while (file.Count > 0)
            {
                var c = parId[file.Dequeue()];
                foreach (var e in c.Extremites)
                {
                    if (e.ConnecteA == null || !parId.TryGetValue(e.ConnecteA, out var v) || res.Contains(v.Id)) continue;
                    if (bloques != null && bloques.Contains(v.Id)) continue;
                    if (!MemeSpool(c, v)) continue;
                    res.Add(v.Id);
                    file.Enqueue(v.Id);
                }
            }
            return res;
        }

        /// <summary>
        /// Découpe en spools : groupes soudés, triés par réseau puis du plus bas au plus haut, d'ouest en est.
        /// Les pièces seules entre deux joints boulonnés (vanne entre brides) ne forment pas de spool.
        /// </summary>
        public static List<List<Composant>> Spools(List<Composant> composants)
        {
            Classer(composants);
            var restants = new HashSet<string>(composants.Select(c => c.Id));
            var groupes = new List<List<Composant>>();
            foreach (var c in composants)
            {
                if (!restants.Contains(c.Id)) continue;
                var ids = Etendre(composants, new[] { c.Id }, new HashSet<string>(composants.Where(x => !restants.Contains(x.Id)).Select(x => x.Id)));
                var g = composants.Where(x => ids.Contains(x.Id)).ToList();
                foreach (var x in g) restants.Remove(x.Id);
                groupes.Add(g);
            }
            // Une vanne (ou un accessoire) prise entre deux joints boulonnés n'est pas un spool : pièce livrée à part, non numérotée
            groupes = groupes.Where(g => g.Any(c => !AnalyseSpool.Boulonnable(c))).ToList();
            Point3 Bas(List<Composant> g) => g.SelectMany(c => c.Extremites).Select(e => e.Position)
                .DefaultIfEmpty(new Point3()).OrderBy(p => p.Z).ThenBy(p => p.X).ThenBy(p => p.Y).First();
            string Reseau(List<Composant> g) => g.Select(c => c.Systeme).Where(s => s != "").GroupBy(s => s).OrderByDescending(x => x.Count()).Select(x => x.Key).FirstOrDefault() ?? "";
            return groupes.OrderBy(g => Reseau(g), StringComparer.CurrentCultureIgnoreCase)
                .ThenBy(g => Math.Round(Bas(g).Z)).ThenBy(g => Math.Round(Bas(g).X)).ThenBy(g => Math.Round(Bas(g).Y)).ToList();
        }

        /// <summary>Numéro formé du préfixe et d'un nombre sur « chiffres » positions : SP-007.</summary>
        public static string Format(string prefixe, int n, int chiffres) => (prefixe ?? "") + n.ToString(new string('0', Math.Max(1, chiffres)), CultureInfo.InvariantCulture);

        /// <summary>Prochain numéro libre après les numéros existants de même préfixe (SP-001, SP-007 → 8).</summary>
        public static int Prochain(IEnumerable<string> existants, string prefixe)
        {
            var max = 0;
            var motif = new Regex("^" + Regex.Escape(prefixe ?? "") + @"(\d+)$", RegexOptions.IgnoreCase);
            foreach (var v in existants)
            {
                var m = motif.Match((v ?? "").Trim());
                if (m.Success && int.TryParse(m.Groups[1].Value, out var n)) max = Math.Max(max, n);
            }
            return max + 1;
        }

        /// <summary>Préfixe effectif : avec le réseau devant (« EG-101-SP- ») si demandé.</summary>
        public static string Prefixe(string prefixe, bool parReseau, string reseau) =>
            parReseau && !string.IsNullOrWhiteSpace(reseau) ? reseau.Trim() + "-" + (prefixe ?? "") : prefixe ?? "";
    }
}
