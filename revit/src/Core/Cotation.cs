// Cotation de fabrication d'un spool : chaîne de cotes le long de chaque tronçon droit,
//   - d'axe en axe entre raccords qui changent de direction (coudes, tés, croix, piquages),
//   - d'axe à face de bride en bout de spool (ou à un joint boulonné intermédiaire : vanne, bride/bride),
//   - d'axe à extrémité quand le spool se termine sur un bout de tube (raccordement chantier, chanfrein).
// Les points d'axe sont l'intersection des axes des connecteurs (sommet du coude, centre du té).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace PipeFit.Isometries.Core
{
    public enum NatureNoeud { Axe, Bride, Extremite }

    public sealed class Cote
    {
        public Point3 A, B;
        public NatureNoeud NatureA, NatureB;
        public double LongueurMm => A.Distance(B);
        public string Valeur => Math.Round(LongueurMm).ToString("0", CultureInfo.InvariantCulture);
        /// <summary>« axe / axe », « axe / bride »…</summary>
        public string Libelle => Nom(NatureA) + " / " + Nom(NatureB);
        static string Nom(NatureNoeud n) => n == NatureNoeud.Axe ? "axe" : n == NatureNoeud.Bride ? "bride" : "extrémité";
    }

    public static class Cotation
    {
        /// <summary>Composants où l'axe change de direction : la cote s'arrête à leur point d'axe.</summary>
        public static bool EstNoeud(Composant c) =>
            c.Type == TypeComposant.Coude || c.Type == TypeComposant.Te || c.Type == TypeComposant.Croix || c.Type == TypeComposant.Piquage;

        /// <summary>
        /// Point d'axe d'un raccord : intersection des axes de deux connecteurs non parallèles ; à défaut le point
        /// d'insertion de la famille, ou le milieu des extrémités.
        /// </summary>
        public static Point3 PointAxe(Composant c)
        {
            var e = c.Extremites;
            // Piquage : le connecteur côté tube principal est sur l'axe de ce tube
            if (c.Type == TypeComposant.Piquage && e.Count >= 2) return e.OrderByDescending(x => x.DnMm).First().Position;
            for (int i = 0; i < e.Count; i++)
                for (int j = i + 1; j < e.Count; j++)
                {
                    if (!e[i].Direction.HasValue || !e[j].Direction.HasValue) continue;
                    if (Intersection(e[i].Position, e[i].Direction.Value, e[j].Position, e[j].Direction.Value, out var p)) return p;
                }
            if (c.Centre.HasValue) return c.Centre.Value;
            if (e.Count == 0) return new Point3();
            var s = new Point3();
            foreach (var x in e) s = s + x.Position;
            return s * (1.0 / e.Count);
        }

        /// <summary>Milieu du plus court segment entre deux droites (faux si elles sont parallèles).</summary>
        public static bool Intersection(Point3 p1, Point3 d1, Point3 p2, Point3 d2, out Point3 p)
        {
            p = new Point3();
            d1 = d1.Normalise(); d2 = d2.Normalise();
            var w = p1 - p2;
            double b = d1.Dot(d2), d = d1.Dot(w), e = d2.Dot(w);
            var den = 1 - b * b;
            if (den < 1e-6) return false;
            var t1 = (b * e - d) / den;
            var t2 = (e - b * d) / den;
            p = ((p1 + d1 * t1) + (p2 + d2 * t2)) * 0.5;
            return true;
        }

        public static List<Cote> Calculer(Spool s)
        {
            var parId = s.Composants.ToDictionary(c => c.Id);
            var cotes = new List<Cote>();
            var cles = new HashSet<string>();

            void Ajouter(Point3 a, NatureNoeud na, Point3 b, NatureNoeud nb)
            {
                if (a.Distance(b) < 1) return;
                var ka = Cle(a); var kb = Cle(b);
                if (!cles.Add(string.CompareOrdinal(ka, kb) < 0 ? ka + "|" + kb : kb + "|" + ka)) return;
                cotes.Add(new Cote { A = a, NatureA = na, B = b, NatureB = nb });
            }

            bool Externe(Extremite x) => x.ConnecteA == null || !parId.ContainsKey(x.ConnecteA);

            // On quitte le composant « cur » par l'extrémité « ext » en venant du point « o »
            void Marcher(Point3 o, NatureNoeud no, Composant cur, Extremite ext)
            {
                for (int garde = 0; garde < 10000; garde++)
                {
                    if (Externe(ext))
                    {
                        Ajouter(o, no, ext.Position, AnalyseSpool.Boulonnable(cur) ? NatureNoeud.Bride : NatureNoeud.Extremite);
                        return;
                    }
                    var nb = parId[ext.ConnecteA];
                    if (AnalyseSpool.Boulonnable(cur) && AnalyseSpool.Boulonnable(nb))
                    {
                        // Joint boulonné intermédiaire : cote jusqu'à la face, puis nouvelle chaîne au-delà
                        Ajouter(o, no, ext.Position, NatureNoeud.Bride);
                        o = ext.Position; no = NatureNoeud.Bride;
                    }
                    var entree = nb.Extremites.OrderBy(x => x.Position.Distance(ext.Position)).FirstOrDefault();
                    if (entree == null) return;
                    if (EstNoeud(nb)) { Ajouter(o, no, PointAxe(nb), NatureNoeud.Axe); return; }
                    var autres = nb.Extremites.Where(x => x != entree).ToList();
                    if (autres.Count != 1) { Ajouter(o, no, entree.Position, NatureNoeud.Extremite); return; }
                    cur = nb; ext = autres[0];
                }
            }

            // Depuis chaque raccord-nœud, dans chaque direction
            foreach (var c in s.Composants.Where(EstNoeud))
            {
                var axe = PointAxe(c);
                foreach (var x in c.Extremites)
                {
                    if (Externe(x)) { Ajouter(axe, NatureNoeud.Axe, x.Position, NatureNoeud.Extremite); continue; }
                    Marcher(axe, NatureNoeud.Axe, c, x);
                }
            }
            // Depuis chaque extrémité du spool (tronçons sans raccord : tube droit entre deux brides…)
            foreach (var c in s.Composants.Where(c => !EstNoeud(c)))
                foreach (var x in c.Extremites.Where(Externe))
                {
                    var na = AnalyseSpool.Boulonnable(c) ? NatureNoeud.Bride : NatureNoeud.Extremite;
                    var autres = c.Extremites.Where(y => y != x).ToList();
                    if (autres.Count == 1) Marcher(x.Position, na, c, autres[0]);
                }
            return cotes;
        }

        static string Cle(Point3 p) => string.Format(CultureInfo.InvariantCulture, "{0:0}/{1:0}/{2:0}", p.X, p.Y, p.Z);
    }
}
