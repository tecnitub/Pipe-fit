// Cotation de fabrication d'un spool : chaîne de cotes le long de chaque tronçon droit,
//   - d'axe en axe entre raccords qui changent de direction (coudes, tés, croix, piquages),
//   - d'axe à face de bride en bout de spool (ou à un joint bride/bride intermédiaire) : la cote d'une bride est au bout de la bride,
//   - à l'AXE de la vanne (milieu entre ses deux faces) pour la robinetterie en ligne (vanne, filtre, clapet, compensateur…),
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
        /// <summary>Cote ajoutée à la main (bouton « Ajouter une cote »), valeur calculée sur la géométrie.</summary>
        public bool Ajoutee;
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
            c.Type == TypeComposant.Coude || c.Type == TypeComposant.Te || c.Type == TypeComposant.Croix || c.Type == TypeComposant.Piquage || Devie(c);

        /// <summary>
        /// Pièce à deux raccordements qui change de direction (coude mal nommé, raccord coudé…) : nœud, coté à son point
        /// d'épure (intersection des axes), jamais traversé par une cote.
        /// </summary>
        public static bool Devie(Composant c)
        {
            if (c.Type == TypeComposant.Tube || c.Extremites.Count != 2) return false;
            var d1 = c.Extremites[0].Direction; var d2 = c.Extremites[1].Direction;
            if (!d1.HasValue || !d2.HasValue || d1.Value.Longueur < 1e-9 || d2.Value.Longueur < 1e-9) return false;
            return d1.Value.Normalise().Dot(d2.Value.Normalise()) > -0.9994; // déviation de plus de 2°
        }

        /// <summary>
        /// Point d'axe d'un raccord : intersection des axes de deux connecteurs non parallèles ; à défaut le point
        /// d'insertion de la famille, ou le milieu des extrémités.
        /// </summary>
        public static Point3 PointAxe(Composant c)
        {
            var e = c.Extremites;
            // Piquage : point de l'axe du collecteur sous la branche (calculé à l'analyse), sinon connecteur côté collecteur
            if (c.Type == TypeComposant.Piquage && c.AxeCollecteur.HasValue) return c.AxeCollecteur.Value;
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

        /// <summary>Robinetterie en ligne (deux raccordements) : la cote s'arrête à son axe, pas à ses faces.</summary>
        public static bool EstVanne(Composant c) =>
            (c.Type == TypeComposant.Vanne || c.Type == TypeComposant.Accessoire) && c.Extremites.Count == 2;

        /// <summary>Axe d'une vanne : milieu entre ses deux faces de raccordement.</summary>
        public static Point3 AxeVanne(Composant c) => (c.Extremites[0].Position + c.Extremites[1].Position) * 0.5;

        /// <summary>La sortie n'est pas sur l'axe qui va de « o » à l'entrée (écart de plus d'1 mm).</summary>
        static bool Decale(Point3 o, Point3 entree, Point3 sortie)
        {
            var d = entree - o;
            if (d.Longueur < 1) return false;
            var u = d.Normalise(); var w = sortie - o;
            var lat = w - u * w.Dot(u);
            return lat.Longueur > 1;
        }

        /// <summary>Extrémité de « c » raccordée à « autre » au point donné (null si aucune).</summary>
        public static Extremite EnFace(Composant c, Composant autre, Point3 point) =>
            c.Extremites.Where(x => x.ConnecteA == autre.Id).OrderBy(x => x.Position.Distance(point)).FirstOrDefault();

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
                    if (EstVanne(cur))
                    {
                        // On sort d'une vanne (la chaîne est à son axe) : cote axe de la vanne → face de sortie
                        Ajouter(o, no, ext.Position, NatureNoeud.Bride);
                        o = ext.Position; no = NatureNoeud.Bride;
                        if (Externe(ext)) return;
                    }
                    else if (Externe(ext))
                    {
                        // Bout piqué sur un collecteur (autre spool) : la cote va à l'axe du collecteur, pas au bout du piquage
                        if (ext.VoisinEstPiquage && ext.AxeCollecteur.HasValue) Ajouter(o, no, ext.AxeCollecteur.Value, NatureNoeud.Axe);
                        else Ajouter(o, no, ext.Position, AnalyseSpool.Boulonnable(cur) ? NatureNoeud.Bride : NatureNoeud.Extremite);
                        return;
                    }
                    var nb = parId[ext.ConnecteA];
                    if (AnalyseSpool.Boulonnable(cur) && AnalyseSpool.Boulonnable(nb))
                    {
                        // Joint boulonné intermédiaire : cote jusqu'au bout de la bride, puis nouvelle chaîne au-delà
                        Ajouter(o, no, ext.Position, NatureNoeud.Bride);
                        o = ext.Position; no = NatureNoeud.Bride;
                    }
                    if (EstVanne(nb))
                    {
                        // Vanne : cote jusqu'à son axe (milieu entre ses faces), puis nouvelle chaîne depuis cet axe
                        var av = AxeVanne(nb);
                        Ajouter(o, no, av, NatureNoeud.Axe);
                        o = av; no = NatureNoeud.Axe;
                    }
                    var entree = nb.Extremites.OrderBy(x => x.Position.Distance(ext.Position)).FirstOrDefault();
                    if (entree == null) return;
                    if (EstNoeud(nb)) { Ajouter(o, no, PointAxe(nb), NatureNoeud.Axe); return; }
                    var autres = nb.Extremites.Where(x => x != entree).ToList();
                    if (autres.Count != 1) { Ajouter(o, no, entree.Position, NatureNoeud.Extremite); return; }
                    // Axe décalé à la traversée (réduction excentrée…) : la cote s'arrête à la face d'entrée et repart de la sortie
                    if (!EstVanne(nb) && Decale(o, entree.Position, autres[0].Position))
                    {
                        var nf = AnalyseSpool.Boulonnable(nb) ? NatureNoeud.Bride : NatureNoeud.Extremite;
                        Ajouter(o, no, entree.Position, nf);
                        o = autres[0].Position; no = nf;
                    }
                    cur = nb; ext = autres[0];
                }
            }

            // Depuis chaque raccord-nœud, dans chaque direction
            foreach (var c in s.Composants.Where(EstNoeud))
            {
                var axe = PointAxe(c);
                // Piquage : le côté collecteur n'est pas suivi (la cote du collecteur est coupée à l'axe du piquage plus bas)
                var cotCol = c.Type == TypeComposant.Piquage && c.AxeCollecteur.HasValue
                    ? c.Extremites.OrderBy(x => x.Position.Distance(axe)).First() : null;
                foreach (var x in c.Extremites)
                {
                    if (x == cotCol) continue;
                    // Piquage : jamais de cote sur sa propre longueur (la branche est cotée de l'axe du collecteur à la bride)
                    if (Externe(x)) { if (c.Type != TypeComposant.Piquage) Ajouter(axe, NatureNoeud.Axe, x.Position, NatureNoeud.Extremite); continue; }
                    Marcher(axe, NatureNoeud.Axe, c, x);
                }
            }
            // Depuis chaque extrémité du spool (tronçons sans raccord : tube droit entre deux brides…)
            foreach (var c in s.Composants.Where(c => !EstNoeud(c)))
                foreach (var x in c.Extremites.Where(Externe))
                {
                    var na = AnalyseSpool.Boulonnable(c) ? NatureNoeud.Bride : NatureNoeud.Extremite;
                    var autres = c.Extremites.Where(y => y != x).ToList();
                    if (autres.Count != 1) continue;
                    if (EstVanne(c))
                    {
                        // Spool qui commence par une vanne : face → axe de la vanne, puis la suite depuis l'axe
                        Ajouter(x.Position, NatureNoeud.Bride, AxeVanne(c), NatureNoeud.Axe);
                        Marcher(AxeVanne(c), NatureNoeud.Axe, c, autres[0]);
                    }
                    // Branche piquée sur un collecteur d'un autre spool : la cote part de l'axe du collecteur, pas du bout du piquage
                    else if (x.VoisinEstPiquage && x.AxeCollecteur.HasValue) Marcher(x.AxeCollecteur.Value, NatureNoeud.Axe, c, autres[0]);
                    else Marcher(x.Position, na, c, autres[0]);
                }
            // Piquage : une seule cote, du bout de la branche à l'axe du collecteur (la cote du collecteur n'est pas coupée)
            // Cotes ajoutées à la main : entre deux points d'attache, valeur recalculée sur la géométrie
            foreach (var c in s.Composants)
                foreach (var ca in c.CotesAjoutees)
                {
                    var pa = CoteAjoutee.Point(c, ca.AttacheA);
                    (Point3, NatureNoeud)? pb = parId.TryGetValue(ca.IdB, out var b) ? CoteAjoutee.Point(b, ca.AttacheB)
                        : ca.PositionB.HasValue ? (ca.PositionB.Value, ca.AttacheB == "axe" ? NatureNoeud.Axe : NatureNoeud.Extremite) : ((Point3, NatureNoeud)?)null;
                    if (pa == null || pb == null || pa.Value.Item1.Distance(pb.Value.Item1) < 1) continue;
                    // Cote alignée : mesurée suivant sa direction, tracée de A dans cette direction
                    if (ca.Axe.HasValue && ca.Axe.Value.Longueur > 1e-9)
                    {
                        var bp = CoteAjoutee.Projete(pa.Value.Item1, pb.Value.Item1, ca.Axe.Value);
                        if (pa.Value.Item1.Distance(bp) < 1) continue;
                        pb = (bp, pb.Value.Item2);
                    }
                    var ka = Cle(pa.Value.Item1); var kb = Cle(pb.Value.Item1);
                    if (cotes.Any(x => (Cle(x.A) == ka && Cle(x.B) == kb) || (Cle(x.A) == kb && Cle(x.B) == ka))) continue; // déjà générée
                    cotes.Add(new Cote { A = pa.Value.Item1, NatureA = pa.Value.Item2, B = pb.Value.Item1, NatureB = pb.Value.Item2, Ajoutee = true });
                }
            return cotes;
        }

        static string Cle(Point3 p) => string.Format(CultureInfo.InvariantCulture, "{0:0}/{1:0}/{2:0}", p.X, p.Y, p.Z);
    }
}
