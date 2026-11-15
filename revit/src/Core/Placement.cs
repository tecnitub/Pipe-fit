// Placement des étiquettes sans chevauchement sur la feuille (mm papier) : bulles de repère, cadres « T1 », numéros de
// soudure. Chaque étiquette essaie des positions autour de son point d'ancrage (16 directions, distances croissantes,
// plusieurs ancrages le long d'un tube) ; une position qui recouvre une étiquette déjà posée, une cote, un symbole ou un
// cartouche est écartée ; on évite aussi de couvrir la tuyauterie et de croiser les lignes de rappel. Les étiquettes
// sont posées dans l'ordre donné (les plus contraintes d'abord).
using System;
using System.Collections.Generic;
using System.Linq;

namespace PipeFit.Isometries.Core
{
    public sealed class Etiquette
    {
        public string Texte = "";
        public double Largeur, Hauteur;
        /// <summary>Points d'ancrage possibles (sur l'élément repéré).</summary>
        public List<(double x, double y)> Ancrages = new List<(double, double)>();
        /// <summary>Direction préférée (perpendiculaire au tube, vers l'extérieur…), facultative.</summary>
        public (double x, double y)? Direction;
        public double DistanceMin = 6, DistanceMax = 36;
        /// <summary>Ligne de rappel de l'ancrage à l'étiquette.</summary>
        public bool Rappel = true;
        // Résultat
        public double X, Y;               // centre
        public (double x, double y) Ancrage;
        public bool Place;
        public bool Chevauche;            // aucune place libre trouvée (rare) : posée au mieux
        public Rect Cadre => new Rect(X - Largeur / 2, Y - Hauteur / 2, X + Largeur / 2, Y + Hauteur / 2);
    }

    public sealed class Obstacles
    {
        /// <summary>À ne jamais recouvrir : étiquettes posées, textes de cote, cartouches de renvoi, symboles.</summary>
        public List<Rect> Durs = new List<Rect>();
        /// <summary>À éviter : tuyauterie, lignes de cote, lignes de rappel.</summary>
        public List<(double x1, double y1, double x2, double y2)> Traits = new List<(double, double, double, double)>();
        /// <summary>À éviter fortement : traits des symboles et lignes de cote (lisibilité).</summary>
        public List<(double x1, double y1, double x2, double y2)> TraitsForts = new List<(double, double, double, double)>();
    }

    public static class PlacementEtiquettes
    {
        const double Marge = 0.7;

        public static void Placer(IEnumerable<Etiquette> etiquettes, Obstacles obs, Rect zone)
        {
            foreach (var e in etiquettes) PlacerUne(e, obs, zone);
        }

        static void PlacerUne(Etiquette e, Obstacles obs, Rect zone)
        {
            double meilleur = double.MaxValue;
            (double x, double y, (double, double) a) choix = (0, 0, (0, 0));
            double baseAngle = e.Direction.HasValue ? Math.Atan2(e.Direction.Value.y, e.Direction.Value.x) : Math.PI / 2;
            // Angles par écart croissant à la direction préférée
            var angles = Enumerable.Range(0, 16).Select(k => (k + 1) / 2 * (k % 2 == 0 ? 1 : -1))
                .Select(k => (a: baseAngle + k * Math.PI / 8, ecart: Math.Abs(k))).ToList();
            foreach (var anc in e.Ancrages)
                for (double d = e.DistanceMin; d <= e.DistanceMax + 1e-9; d += 2.5)
                    foreach (var (a, ecart) in angles)
                    {
                        double ux = Math.Cos(a), uy = Math.Sin(a);
                        // Distance mesurée jusqu'au bord de l'étiquette dans la direction choisie
                        double demi = Math.Abs(ux) * e.Largeur / 2 + Math.Abs(uy) * e.Hauteur / 2;
                        double cx = anc.x + ux * (d + demi), cy = anc.y + uy * (d + demi);
                        var r = new Rect(cx - e.Largeur / 2 - Marge, cy - e.Hauteur / 2 - Marge, cx + e.Largeur / 2 + Marge, cy + e.Hauteur / 2 + Marge);
                        if (r.X0 < zone.X0 || r.Y0 < zone.Y0 || r.X1 > zone.X1 || r.Y1 > zone.Y1) continue;
                        double pen = d * 1.0 + ecart * 0.8;
                        int durs = obs.Durs.Count(o => Recouvre(r, o));
                        pen += durs * 10000;
                        if (pen >= meilleur) continue;
                        pen += obs.Traits.Count(s => Coupe(r, s)) * 250 + obs.TraitsForts.Count(s => Coupe(r, s)) * 400;
                        if (e.Rappel)
                        {
                            var (bx, by) = Bord(e, cx, cy, anc);
                            var rappel = (anc.x, anc.y, bx, by);
                            pen += obs.Durs.Count(o => Coupe(o, rappel)) * 500 + obs.TraitsForts.Count(s => Croise(s, rappel)) * 40;
                        }
                        if (pen < meilleur) { meilleur = pen; choix = (cx, cy, anc); }
                    }
            if (meilleur == double.MaxValue)
            {
                // Zone trop petite : au plus près de l'ancrage
                var anc = e.Ancrages.Count > 0 ? e.Ancrages[0] : (zone.X0, zone.Y0);
                choix = (anc.Item1, anc.Item2 + e.DistanceMin + e.Hauteur / 2, anc);
                meilleur = 10000;
            }
            e.X = choix.x; e.Y = choix.y; e.Ancrage = choix.a; e.Place = true; e.Chevauche = meilleur >= 10000;
            obs.Durs.Add(new Rect(e.X - e.Largeur / 2, e.Y - e.Hauteur / 2, e.X + e.Largeur / 2, e.Y + e.Hauteur / 2));
            if (e.Rappel) { var (bx, by) = Bord(e, e.X, e.Y, e.Ancrage); obs.TraitsForts.Add((e.Ancrage.x, e.Ancrage.y, bx, by)); }
        }

        /// <summary>Point du bord de l'étiquette sur la ligne qui va vers l'ancrage (fin de la ligne de rappel).</summary>
        public static (double x, double y) Bord(Etiquette e, double cx, double cy, (double x, double y) anc)
        {
            double dx = anc.x - cx, dy = anc.y - cy;
            double tx = Math.Abs(dx) < 1e-9 ? double.MaxValue : e.Largeur / 2 / Math.Abs(dx);
            double ty = Math.Abs(dy) < 1e-9 ? double.MaxValue : e.Hauteur / 2 / Math.Abs(dy);
            var t = Math.Min(1, Math.Min(tx, ty));
            return (cx + dx * t, cy + dy * t);
        }

        public static bool Recouvre(Rect a, Rect b) => a.X0 < b.X1 && b.X0 < a.X1 && a.Y0 < b.Y1 && b.Y0 < a.Y1;

        /// <summary>Le segment traverse (ou touche) le rectangle.</summary>
        public static bool Coupe(Rect r, (double x1, double y1, double x2, double y2) s)
        {
            // Liang-Barsky
            double t0 = 0, t1 = 1, dx = s.x2 - s.x1, dy = s.y2 - s.y1;
            foreach (var (p, q) in new[] { (-dx, s.x1 - r.X0), (dx, r.X1 - s.x1), (-dy, s.y1 - r.Y0), (dy, r.Y1 - s.y1) })
            {
                if (Math.Abs(p) < 1e-12) { if (q < 0) return false; continue; }
                var t = q / p;
                if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
                else { if (t < t0) return false; if (t < t1) t1 = t; }
            }
            return true;
        }

        /// <summary>Deux segments se croisent (hors extrémités communes).</summary>
        public static bool Croise((double x1, double y1, double x2, double y2) a, (double x1, double y1, double x2, double y2) b)
        {
            double d(double ax, double ay, double bx, double by, double cx, double cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
            double d1 = d(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1), d2 = d(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
            double d3 = d(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1), d4 = d(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
            return d1 * d2 < -1e-9 && d3 * d4 < -1e-9;
        }

        /// <summary>Rectangle englobant d'un texte tourné (pour les cotes) : largeur l, hauteur h, angle en radians.</summary>
        public static Rect CadreTourne(double cx, double cy, double l, double h, double angle)
        {
            double c = Math.Abs(Math.Cos(angle)), s = Math.Abs(Math.Sin(angle));
            double hw = (l * c + h * s) / 2, hh = (l * s + h * c) / 2;
            return new Rect(cx - hw, cy - hh, cx + hw, cy + hh);
        }

        /// <summary>Largeur approximative d'un texte Arial (mm) : 0,62 × hauteur par caractère (0,68 en gras).</summary>
        public static double LargeurTexte(string t, double hauteur, bool gras = false) => (t ?? "").Length * hauteur * (gras ? 0.68 : 0.62);
    }
}
