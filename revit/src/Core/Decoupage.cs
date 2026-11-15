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

        /// <summary>
        /// Deux composants raccordés restent dans le même spool sauf si le joint est boulonné, ou s'ils appartiennent à deux
        /// systèmes différents (un système Revit par fluide et par sens : départ, retour).
        /// </summary>
        public static bool MemeSpool(Composant a, Composant b) =>
            !(AnalyseSpool.Boulonnable(a) && AnalyseSpool.Boulonnable(b))
            && (a.Systeme == "" || b.Systeme == "" || string.Equals(a.Systeme, b.Systeme, StringComparison.OrdinalIgnoreCase));

        public static double LongueurTube(IEnumerable<Composant> g) => g.Where(c => c.Type == TypeComposant.Tube).Sum(c => c.LongueurMm);

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
        public static List<List<Composant>> Spools(List<Composant> composants, double longueurMaxMm = 0) =>
            Spools(composants, longueurMaxMm, out _);

        /// <param name="longueurMaxMm">Longueur de tube maximale d'un spool (6 000 mm : une barre du commerce) ; 0 = sans limite.</param>
        /// <param name="tropLongs">Tubes qui dépassent à eux seuls la longueur maximale (à diviser dans la maquette).</param>
        public static List<List<Composant>> Spools(List<Composant> composants, double longueurMaxMm, out List<Composant> tropLongs)
        {
            tropLongs = longueurMaxMm > 0 ? composants.Where(c => c.Type == TypeComposant.Tube && c.LongueurMm > longueurMaxMm + 0.5).ToList() : new List<Composant>();
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
            if (longueurMaxMm > 0) groupes = groupes.SelectMany(g => Limiter(g, longueurMaxMm)).ToList();
            Point3 Bas(List<Composant> g) => g.SelectMany(c => c.Extremites).Select(e => e.Position)
                .DefaultIfEmpty(new Point3()).OrderBy(p => p.Z).ThenBy(p => p.X).ThenBy(p => p.Y).First();
            string Reseau(List<Composant> g) => g.Select(c => c.Systeme).Where(s => s != "").GroupBy(s => s).OrderByDescending(x => x.Count()).Select(x => x.Key).FirstOrDefault() ?? "";
            return groupes.OrderBy(g => Reseau(g), StringComparer.CurrentCultureIgnoreCase)
                .ThenBy(g => Math.Round(Bas(g).Z)).ThenBy(g => Math.Round(Bas(g).X)).ThenBy(g => Math.Round(Bas(g).Y)).ToList();
        }

        /// <summary>
        /// Coupe un ensemble soudé dont le tube dépasse la longueur maximale : en suivant la ligne depuis son extrémité basse,
        /// un nouveau spool commence dès que le tube suivant ferait dépasser la limite (la coupe tombe sur une soudure,
        /// qui devient une soudure de chantier). Chaque morceau reste d'un seul tenant.
        /// </summary>
        public static List<List<Composant>> Limiter(List<Composant> groupe, double maxMm)
        {
            if (maxMm <= 0 || LongueurTube(groupe) <= maxMm + 0.5) return new List<List<Composant>> { groupe };
            var parId = groupe.ToDictionary(c => c.Id);
            double Lg(Composant c) => c.Type == TypeComposant.Tube ? c.LongueurMm : 0;
            var places = new HashSet<string>();
            var departs = new List<Composant> { AnalyseSpool.Parcourir(groupe)[0] };
            var res = new List<List<Composant>>();
            while (places.Count < groupe.Count)
            {
                var graine = departs.FirstOrDefault(x => !places.Contains(x.Id)) ?? groupe.First(x => !places.Contains(x.Id));
                var morceau = new List<Composant>();
                var cumul = Lg(graine);
                places.Add(graine.Id);
                var pile = new Stack<Composant>();
                pile.Push(graine);
                while (pile.Count > 0)
                {
                    var c = pile.Pop();
                    morceau.Add(c);
                    // Voisins empilés à l'envers : on suit d'abord la ligne principale (plus gros DN)
                    var voisins = c.Extremites.Where(e => e.ConnecteA != null && parId.ContainsKey(e.ConnecteA) && !places.Contains(e.ConnecteA))
                        .OrderBy(e => e.DnMm).Select(e => parId[e.ConnecteA]).Where(v => MemeSpool(c, v)).Distinct().ToList();
                    foreach (var v in voisins)
                    {
                        if (places.Contains(v.Id)) continue;
                        var l = Lg(v);
                        if (l > 0 && cumul > 0 && cumul + l > maxMm + 0.5) { departs.Add(v); continue; } // spool suivant
                        places.Add(v.Id);
                        cumul += l;
                        pile.Push(v);
                    }
                }
                res.Add(morceau);
            }
            return res;
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

        /// <summary>Préfixe effectif : le système devant (« EGD-SP- ») quand il est donné, sinon le préfixe seul.</summary>
        public static string Prefixe(string prefixe, string reseau) =>
            !string.IsNullOrWhiteSpace(reseau) ? reseau.Trim() + "-" + (prefixe ?? "") : string.IsNullOrEmpty(prefixe) ? "SP-" : prefixe;

        /// <summary>Système d'un groupe (le plus fréquent) : abréviation (EGD) si demandée et connue, sinon nom.</summary>
        public static string Reseau(IEnumerable<Composant> g, bool abreviation)
        {
            string Freq(IEnumerable<string> v) => v.Where(x => !string.IsNullOrWhiteSpace(x)).GroupBy(x => x.Trim())
                .OrderByDescending(x => x.Count()).Select(x => x.Key).FirstOrDefault() ?? "";
            var liste = g.ToList();
            var a = abreviation ? Freq(liste.Select(c => c.Abreviation)) : "";
            return a != "" ? a : Freq(liste.Select(c => c.Systeme));
        }
    }
}
