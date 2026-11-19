// Cotes ajoutées à la main (bouton « Ajouter une cote ») : deux points d'attache pris sur deux éléments de tuyauterie.
// La valeur n'est jamais saisie : elle est recalculée à chaque génération depuis la géométrie (axe d'un coude / té /
// piquage, axe d'une vanne, face de bride, bout de tube), donc toujours juste même si le modèle bouge.
// Enregistrée sur le premier élément, paramètre « Cotes ajoutées (Pipe-Fit) » : « attA>idB:attB@x,y,z|… ».
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace PipeFit.Isometries.Core
{
    public sealed class CoteAjoutee
    {
        public string AttacheA = "axe";
        public string IdB = "";
        public string AttacheB = "axe";
        /// <summary>Position du point B à la création (si l'élément B n'est pas dans le spool, la cote s'y arrête quand même).</summary>
        public Point3? PositionB;
        /// <summary>
        /// Direction de mesure (cote alignée prise en plan ou en coupe, vecteur unitaire) : la valeur est la projection de
        /// A→B sur cette direction, et la cote est tracée de A dans cette direction. Null : distance vraie de A à B.
        /// </summary>
        public Point3? Axe;

        /// <summary>Extrémité de la cote mesurée suivant l'axe : A + axe × ((B − A)·axe).</summary>
        public static Point3 Projete(Point3 a, Point3 b, Point3 axe) { var u = axe.Normalise(); return a + u * (b - a).Dot(u); }

        static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        public static List<CoteAjoutee> Lire(string texte)
        {
            var res = new List<CoteAjoutee>();
            foreach (var m in (texte ?? "").Split(new[] { '|' }, StringSplitOptions.RemoveEmptyEntries))
            {
                try
                {
                    var c = new CoteAjoutee();
                    var s = m.Trim();
                    var di = s.IndexOf('#');
                    if (di >= 0)
                    {
                        var v = s.Substring(di + 1).Split(',');
                        if (v.Length == 3) c.Axe = new Point3(double.Parse(v[0], Inv), double.Parse(v[1], Inv), double.Parse(v[2], Inv));
                        s = s.Substring(0, di);
                    }
                    var at = s.IndexOf('@');
                    if (at >= 0)
                    {
                        var xyz = s.Substring(at + 1).Split(',');
                        if (xyz.Length == 3) c.PositionB = new Point3(double.Parse(xyz[0], Inv), double.Parse(xyz[1], Inv), double.Parse(xyz[2], Inv));
                        s = s.Substring(0, at);
                    }
                    var gt = s.IndexOf('>');
                    if (gt <= 0) continue;
                    c.AttacheA = s.Substring(0, gt);
                    var reste = s.Substring(gt + 1);
                    var dp = reste.LastIndexOf(':');
                    if (dp <= 0) continue;
                    c.IdB = reste.Substring(0, dp); c.AttacheB = reste.Substring(dp + 1);
                    res.Add(c);
                }
                catch { /* entrée illisible : ignorée */ }
            }
            return res;
        }

        public static string Ecrire(IEnumerable<CoteAjoutee> cotes) =>
            string.Join("|", cotes.Select(c => c.AttacheA + ">" + c.IdB + ":" + c.AttacheB
                + (c.PositionB.HasValue ? string.Format(Inv, "@{0:0.#},{1:0.#},{2:0.#}", c.PositionB.Value.X, c.PositionB.Value.Y, c.PositionB.Value.Z) : "")
                + (c.Axe.HasValue ? string.Format(Inv, "#{0:0.######},{1:0.######},{2:0.######}", c.Axe.Value.X, c.Axe.Value.Y, c.Axe.Value.Z) : "")));

        /// <summary>
        /// Point d'attache d'un élément le plus proche d'une ligne d'attache de cote alignée : la ligne d'attache est à la
        /// position « t » le long de la direction de mesure (depuis « origine ») ; on prend le point dont la position le long
        /// de cette direction est la plus proche (l'axe à égalité). Écart en mm le long de la direction.
        /// </summary>
        public static (string Code, Point3 Point, double Ecart) PourLigneAttache(Composant c, Point3 origine, Point3 direction, double t)
        {
            var u = direction.Normalise();
            var l = Attaches(c);
            if (l.Count == 0) return ("axe", c.Centre ?? new Point3(), double.MaxValue);
            var m = l.Select(a => (a.Code, a.Point, E: Math.Abs((a.Point - origine).Dot(u) - t) + (a.Code == "axe" ? 0 : 0.01))).OrderBy(x => x.E).First();
            return (m.Code, m.Point, Math.Abs((m.Point - origine).Dot(u) - t));
        }

        public bool Meme(CoteAjoutee o) => o != null && o.IdB == IdB && o.AttacheA == AttacheA && o.AttacheB == AttacheB;

        // ---------- Points d'attache ----------

        /// <summary>
        /// Points d'attache d'un élément : « axe » (coude, té, croix, piquage : intersection des axes ; vanne et accessoire
        /// en ligne : milieu entre ses faces), « bout0 », « bout1 »… (extrémités : face de bride, bout de tube, face de vanne).
        /// </summary>
        public static List<(string Code, Point3 Point, NatureNoeud Nature)> Attaches(Composant c)
        {
            var l = new List<(string, Point3, NatureNoeud)>();
            if (Cotation.EstNoeud(c)) l.Add(("axe", Cotation.PointAxe(c), NatureNoeud.Axe));
            else if (Cotation.EstVanne(c)) l.Add(("axe", Cotation.AxeVanne(c), NatureNoeud.Axe));
            for (int k = 0; k < c.Extremites.Count; k++)
                l.Add(("bout" + k.ToString(Inv), c.Extremites[k].Position,
                    AnalyseSpool.Boulonnable(c) ? NatureNoeud.Bride : c.Type == TypeComposant.Tube ? NatureNoeud.Extremite : NatureNoeud.Axe));
            return l;
        }

        /// <summary>Point d'attache le plus proche du clic (l'axe d'un raccord ou d'une vanne quand le clic est sur son corps).</summary>
        public static (string Code, Point3 Point, NatureNoeud Nature) PlusProche(Composant c, Point3? clic)
        {
            var l = Attaches(c);
            if (l.Count == 0) return ("axe", c.Centre ?? new Point3(), NatureNoeud.Axe);
            if (!clic.HasValue) return l[0];
            return l.OrderBy(a => a.Point.Distance(clic.Value)).First();
        }

        public static (Point3 Point, NatureNoeud Nature)? Point(Composant c, string code)
        {
            var a = Attaches(c).Where(x => x.Code == code).Select(x => ((Point3, NatureNoeud)?)(x.Point, x.Nature)).FirstOrDefault();
            return a ?? (Attaches(c).Count > 0 ? (Attaches(c)[0].Point, Attaches(c)[0].Nature) : ((Point3, NatureNoeud)?)null);
        }

        public static string Libelle(string code) => code == "axe" ? "axe" : code.StartsWith("bout") ? "extrémité" : code;
    }
}
