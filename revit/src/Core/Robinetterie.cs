// Robinetterie et accessoires de ligne : genre (vanne, papillon, réglage, clapet, boisseau, filtre, compensateur),
// désignation, sens d'écoulement à travers le spool, et symboles d'isométrie normalisés dessinés sur la feuille.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace PipeFit.Isometries.Core
{
    public enum GenreRobinet { Aucun, Vanne, Papillon, Reglage, Clapet, Boisseau, Filtre, Compensateur }

    public static class Robinetterie
    {
        /// <summary>Genre d'un accessoire ou d'une vanne, d'après le nom de sa famille et de son type.</summary>
        public static GenreRobinet Genre(Composant c)
        {
            if (!c.EstAccessoire && c.Type != TypeComposant.Vanne && c.Type != TypeComposant.Accessoire) return GenreRobinet.Aucun;
            var n = AnalyseSpool.Normaliser(c.Famille + " " + c.TypeNom);
            if (Regex.IsMatch(n, @"compensateur|dilatoflex|dilatation|soufflet|manchette|antivibrat|lyre|bellows|expansion")) return GenreRobinet.Compensateur;
            if (Regex.IsMatch(n, @"clapet|anti ?retour|\bcheck\b|non ?return")) return GenreRobinet.Clapet;
            if (Regex.IsMatch(n, @"reglage|equilibrage|balancing|\bstad|\btbv|\bmsv|regulat|debit")) return GenreRobinet.Reglage;
            if (Regex.IsMatch(n, @"papillon|butterfly")) return GenreRobinet.Papillon;
            if (Regex.IsMatch(n, @"boisseau|quart de tour|\bball\b|sphere|\bbille")) return GenreRobinet.Boisseau;
            if (Regex.IsMatch(n, @"filtre|strainer|tamis")) return GenreRobinet.Filtre;
            if (Regex.IsMatch(n, @"vanne|robinet|valve|opercule|guillotine|soupape|\bpointeau")) return GenreRobinet.Vanne;
            return c.EstAccessoire ? GenreRobinet.Vanne : GenreRobinet.Aucun;
        }

        public static string Libelle(GenreRobinet g)
        {
            switch (g)
            {
                case GenreRobinet.Papillon: return "Vanne papillon";
                case GenreRobinet.Reglage: return "Vanne de réglage";
                case GenreRobinet.Clapet: return "Clapet anti-retour";
                case GenreRobinet.Boisseau: return "Vanne à boisseau";
                case GenreRobinet.Filtre: return "Filtre";
                case GenreRobinet.Compensateur: return "Compensateur de dilatation";
                case GenreRobinet.Vanne: return "Vanne";
                default: return "";
            }
        }

        /// <summary>Le genre vaut composant de ligne démontable (vanne, accessoire) : pas un raccord soudé.</summary>
        public static TypeComposant Type(GenreRobinet g) =>
            g == GenreRobinet.Compensateur || g == GenreRobinet.Filtre ? TypeComposant.Accessoire : TypeComposant.Vanne;

        /// <summary>
        /// Sens d'écoulement : à partir des arrivées du spool (extrémités « entrée »), chaque composant reçoit son extrémité
        /// amont (celle par où le fluide arrive). Sans arrivée connue, rien n'est orienté.
        /// </summary>
        public static void Ecoulement(Spool s)
        {
            foreach (var c in s.Composants) c.Amont = null;
            var parId = s.Composants.ToDictionary(c => c.Id);
            var file = new Queue<Composant>();
            foreach (var l in s.Liaisons.Where(l => l.Sens == SensFlux.Entree))
                foreach (var c in s.Composants)
                {
                    var e = c.Extremites.FirstOrDefault(x => x.Position.Distance(l.Position) < 1 && (x.ConnecteA == null || !parId.ContainsKey(x.ConnecteA)));
                    if (e != null && c.Amont == null) { c.Amont = e; file.Enqueue(c); }
                }
            while (file.Count > 0)
            {
                var c = file.Dequeue();
                foreach (var e in c.Extremites.Where(x => x != c.Amont))
                {
                    if (e.ConnecteA == null || !parId.TryGetValue(e.ConnecteA, out var v) || v.Amont != null) continue;
                    v.Amont = Cotation.EnFace(v, c, e.Position);
                    if (v.Amont != null) file.Enqueue(v);
                }
            }
        }

        /// <summary>Extrémités dans le sens de l'écoulement (amont d'abord) quand il est connu.</summary>
        public static List<Extremite> Ordre(Composant c) =>
            c.Amont == null ? c.Extremites.ToList() : new[] { c.Amont }.Concat(c.Extremites.Where(x => x != c.Amont)).ToList();

        public struct Segment
        {
            public double U1, V1, U2, V2;
            public Segment(double u1, double v1, double u2, double v2) { U1 = u1; V1 = v1; U2 = u2; V2 = v2; }
        }

        /// <summary>
        /// Symbole d'isométrie en coordonnées locales (u le long du tube dans le sens de l'écoulement, v perpendiculaire),
        /// longueur l et demi-hauteur h en mm papier.
        /// </summary>
        public static List<Segment> Symbole(GenreRobinet g, double l = 7, double h = 2.6)
        {
            var s = new List<Segment>();
            double a = l / 2;
            void Seg(double u1, double v1, double u2, double v2) => s.Add(new Segment(u1, v1, u2, v2));
            void Cercle(double cu, double cv, double r)
            {
                const int n = 12;
                for (int i = 0; i < n; i++)
                {
                    double t1 = 2 * Math.PI * i / n, t2 = 2 * Math.PI * (i + 1) / n;
                    Seg(cu + r * Math.Cos(t1), cv + r * Math.Sin(t1), cu + r * Math.Cos(t2), cv + r * Math.Sin(t2));
                }
            }
            void Papillon() { Seg(-a, -h, a, h); Seg(-a, h, a, -h); Seg(-a, -h, -a, h); Seg(a, -h, a, h); }
            void Tige() { Seg(0, 0, 0, h + 2); Seg(-1.4, h + 2, 1.4, h + 2); }
            switch (g)
            {
                case GenreRobinet.Compensateur:
                    // Soufflet : brides aux deux bouts et ondes en zigzag
                    Seg(-a, -h, -a, h); Seg(a, -h, a, h);
                    for (int i = 0; i < 4; i++)
                    {
                        double u1 = -a + l * i / 4, u2 = -a + l * (i + 0.5) / 4, u3 = -a + l * (i + 1) / 4;
                        Seg(u1, h * 0.55, u2, h); Seg(u2, h, u3, h * 0.55);
                        Seg(u1, -h * 0.55, u2, -h); Seg(u2, -h, u3, -h * 0.55);
                    }
                    break;
                case GenreRobinet.Filtre:
                    // Filtre en Y : corps et jambe inclinée vers le bas
                    Seg(-a, -h * 0.7, a, -h * 0.7); Seg(-a, h * 0.7, a, h * 0.7); Seg(-a, -h * 0.7, -a, h * 0.7); Seg(a, -h * 0.7, a, h * 0.7);
                    Seg(-a * 0.2, -h * 0.7, a * 0.6, -h * 2.2); Seg(a * 0.6, -h * 0.7, a * 1.2, -h * 1.8); Seg(a * 0.6, -h * 2.2, a * 1.2, -h * 1.8);
                    break;
                case GenreRobinet.Papillon:
                    Papillon(); Seg(0, -h * 1.35, 0, h * 1.35); Cercle(0, 0, h * 0.28); Tige();
                    break;
                case GenreRobinet.Reglage:
                    Papillon(); Cercle(0, 0, h * 0.45); Tige();
                    Seg(-a * 0.55, -h - 1.4, a * 0.55, -h - 1.4); Seg(a * 0.55, -h - 1.4, a * 0.25, -h - 1.0); // flèche de réglage
                    Seg(-a * 0.55, -h - 1.4, -a * 0.25, -h - 1.8);
                    break;
                case GenreRobinet.Clapet:
                    // Clapet : moitié aval hachurée et flèche du sens d'écoulement
                    Papillon();
                    for (int i = 1; i <= 3; i++) { double u = a * i / 4; Seg(u, -h * u / a, u, h * u / a); }
                    Seg(-a, h + 1.6, a, h + 1.6); Seg(a, h + 1.6, a - 1.3, h + 2.3); Seg(a, h + 1.6, a - 1.3, h + 0.9);
                    break;
                case GenreRobinet.Boisseau:
                    Papillon(); Cercle(0, 0, h * 0.5); Tige();
                    break;
                default:
                    Papillon(); Tige();
                    break;
            }
            return s;
        }

        /// <summary>Segments du symbole placés sur la feuille : centre (cx, cy), axe (ax, ay) unitaire dans le sens d'écoulement.</summary>
        public static List<(double x1, double y1, double x2, double y2)> Placer(List<Segment> segs, double cx, double cy, double ax, double ay)
        {
            double px = -ay, py = ax;
            return segs.Select(s => (cx + s.U1 * ax + s.V1 * px, cy + s.U1 * ay + s.V1 * py, cx + s.U2 * ax + s.V2 * px, cy + s.U2 * ay + s.V2 * py)).ToList();
        }
    }
}
