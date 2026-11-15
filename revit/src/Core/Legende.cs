// Légende des symboles des isométries : robinetterie (mêmes dessins que sur la feuille), soudures atelier et chantier,
// bulle de repère, cadre de tube, cote, renvoi, flèche du nord. Chaque symbole est défini en coordonnées locales (mm
// papier, u vers la droite, v vers le haut, centré) pour être dessiné dans une case de tableau : par le complément
// sur la feuille Revit comme par la démonstration.
using System;
using System.Collections.Generic;
using System.Linq;

namespace PipeFit.Isometries.Core
{
    public sealed class DessinLegende
    {
        public List<Robinetterie.Segment> Traits = new List<Robinetterie.Segment>();
        /// <summary>Textes du symbole : position (u, v), texte, gras.</summary>
        public List<(double U, double V, string Texte, bool Gras)> Textes = new List<(double, double, string, bool)>();
        /// <summary>Le symbole est en couleur de soudure (orange) dans la démonstration.</summary>
        public bool Soudure;
    }

    public static class Legende
    {
        /// <summary>Préfixe d'une case de tableau qui contient un symbole (« §PAPILLON »).</summary>
        public const string Marque = "§";

        static readonly (string Code, string Libelle)[] Tous =
        {
            ("TUBE", "Tube : repère de débit (liste de débit)"),
            ("BULLE", "Raccord, bride, robinetterie : repère de nomenclature"),
            ("SOUD", "Soudure atelier et son numéro"),
            ("SOUDCH", "Soudure chantier, surlongueur à recouper"),
            ("COTE", "Cote d'axe en axe / d'axe à bride (mm)"),
            ("RENVOI", "Renvoi : vient de / va vers (sens d'écoulement)"),
            ("NORD", "Nord du projet"),
            ("VANNE", "Vanne (opercule)"),
            ("PAPILLON", "Vanne papillon"),
            ("REGLAGE", "Vanne de réglage / d'équilibrage"),
            ("CLAPET", "Clapet anti-retour (flèche : écoulement)"),
            ("BOISSEAU", "Vanne à boisseau"),
            ("FILTRE", "Filtre en Y"),
            ("COMPENSATEUR", "Compensateur de dilatation"),
        };

        public static IEnumerable<(string Code, string Libelle)> Toutes() => Tous;

        /// <summary>Libellés courts de la légende compacte (colonne de 62 mm).</summary>
        static readonly Dictionary<string, string> Courts = new Dictionary<string, string>
        {
            ["TUBE"] = "Repère de tube (liste de débit)", ["BULLE"] = "Repère de nomenclature", ["SOUD"] = "Soudure atelier",
            ["SOUDCH"] = "Soudure chantier, surlongueur", ["COTE"] = "Cote axe / axe, axe / bride (mm)", ["RENVOI"] = "Renvoi vient de / va vers",
            ["NORD"] = "Nord du projet", ["REGLAGE"] = "Vanne de réglage / équilibrage", ["CLAPET"] = "Clapet anti-retour (écoulement)",
            ["COMPENSATEUR"] = "Compensateur de dilatation", ["FILTRE"] = "Filtre en Y", ["VANNE"] = "Vanne (opercule)",
        };

        public static string Court(string code, string libelle) => Courts.TryGetValue(code, out var c) ? c : libelle;

        public static string Code(GenreRobinet g) => g == GenreRobinet.Aucun ? "" : g.ToString().ToUpperInvariant();

        /// <summary>Symboles qui figurent sur l'isométrie du spool.</summary>
        public static List<(string Code, string Libelle)> Pour(Spool s)
        {
            var codes = new HashSet<string> { "BULLE", "NORD" };
            if (s.Composants.Any(c => c.Type == TypeComposant.Tube)) codes.Add("TUBE");
            if (s.Assemblages.Any(a => a.Nature == NatureAssemblage.Soudure)) codes.Add("SOUD");
            if (s.Assemblages.Any(a => a.Nature == NatureAssemblage.RaccordementChantier && a.Soude)) codes.Add("SOUDCH");
            if (s.Cotes.Count > 0) codes.Add("COTE");
            if (s.Liaisons.Count > 0) codes.Add("RENVOI");
            foreach (var c in s.Composants.Where(c => c.Genre != GenreRobinet.Aucun && c.Extremites.Count >= 2)) codes.Add(Code(c.Genre));
            return Tous.Where(t => codes.Contains(t.Code)).ToList();
        }

        /// <summary>Tableau « LÉGENDE » : symbole dessiné dans la première colonne, signification dans la seconde.</summary>
        public static Tableau Tableau(IEnumerable<(string Code, string Libelle)> entrees, string titre = "LÉGENDE")
        {
            var t = new Tableau { Titre = titre, Interligne = 1.6 };
            t.Colonnes.Add(new Colonne("Symbole", 26)); t.Colonnes.Add(new Colonne("Signification", 104));
            foreach (var (code, lib) in entrees) t.Lignes.Add(new[] { Marque + code, lib });
            return t;
        }

        /// <summary>
        /// Légende compacte de l'isométrie : deux symboles par ligne (168 mm de large), posée en bande sous le dessin,
        /// à gauche du cartouche, pour ne pas prendre la place des tableaux.
        /// </summary>
        public static Tableau Compacte(IEnumerable<(string Code, string Libelle)> entrees)
        {
            var t = new Tableau { Titre = "LÉGENDE", Interligne = 1.5 };
            t.Colonnes.Add(new Colonne("", 22)); t.Colonnes.Add(new Colonne("", 62)); t.Colonnes.Add(new Colonne("", 22)); t.Colonnes.Add(new Colonne("", 62));
            var l = entrees.ToList();
            for (int i = 0; i < l.Count; i += 2)
                t.Lignes.Add(i + 1 < l.Count
                    ? new[] { Marque + l[i].Code, Court(l[i].Code, l[i].Libelle), Marque + l[i + 1].Code, Court(l[i + 1].Code, l[i + 1].Libelle) }
                    : new[] { Marque + l[i].Code, Court(l[i].Code, l[i].Libelle), "", "" });
            return t;
        }

        /// <summary>Dessin d'un symbole de légende, tenant dans une case de 22 × 7 mm.</summary>
        public static DessinLegende Dessin(string code)
        {
            var d = new DessinLegende();
            void S(double u1, double v1, double u2, double v2) => d.Traits.Add(new Robinetterie.Segment(u1, v1, u2, v2));
            void Cercle(double cu, double cv, double r, int n = 16)
            {
                for (int i = 0; i < n; i++)
                {
                    double t1 = 2 * Math.PI * i / n, t2 = 2 * Math.PI * (i + 1) / n;
                    S(cu + r * Math.Cos(t1), cv + r * Math.Sin(t1), cu + r * Math.Cos(t2), cv + r * Math.Sin(t2));
                }
            }
            void Tuyau(double a = 10) => S(-a, 0, a, 0);
            if (Enum.TryParse(code, true, out GenreRobinet g) && g != GenreRobinet.Aucun)
            {
                // Robinetterie : le symbole de la feuille, réduit, sur un bout de tuyauterie
                const double k = 0.62;
                S(-10, 0, -7 * k / 2 - 0.4, 0); S(7 * k / 2 + 0.4, 0, 10, 0);
                foreach (var s in Robinetterie.Symbole(g)) S(s.U1 * k, s.V1 * k, s.U2 * k, s.V2 * k);
                return d;
            }
            switch (code)
            {
                case "TUBE":
                    S(-10, -2, 10, 0 - 2); S(-1, -2, -1.6, -0.8);
                    S(-3.4, -0.8, 3.4, -0.8); S(3.4, -0.8, 3.4, 3.2); S(3.4, 3.2, -3.4, 3.2); S(-3.4, 3.2, -3.4, -0.8);
                    d.Textes.Add((0, 1.2, "T1", true));
                    break;
                case "BULLE":
                    S(-10, -2, 10, -2); S(-4, -2, -1.2, -0.3); Cercle(0.6, 1.2, 2.2); d.Textes.Add((0.6, 1.2, "2", true));
                    break;
                case "SOUD":
                    Tuyau(); Cercle(0, 0, 0.6, 8); d.Textes.Add((0, -2.3, "S1", true)); d.Soudure = true;
                    break;
                case "SOUDCH":
                    Tuyau(); S(0, 0, 1.2, 2.1); S(1.2, 2.1, -1.2, 2.1); S(-1.2, 2.1, 0, 0); d.Textes.Add((0, -2.3, "R1 +100", true)); d.Soudure = true;
                    break;
                case "COTE":
                    S(-8, -2.5, -8, 2.5); S(8, -2.5, 8, 2.5); S(-8, 0, 8, 0);
                    S(-8.9, -0.9, -7.1, 0.9); S(7.1, -0.9, 8.9, 0.9);
                    d.Textes.Add((0, 1.6, "1200", false));
                    break;
                case "RENVOI":
                    S(-10, 0, -3, 0); S(-3, 0, -5, 1); S(-3, 0, -5, -1);
                    S(-2, -2.2, 10.5, -2.2); S(10.5, -2.2, 10.5, 2.2); S(10.5, 2.2, -2, 2.2); S(-2, 2.2, -2, -2.2);
                    d.Textes.Add((4.2, 0, "VA VERS", true));
                    break;
                case "NORD":
                    S(-4, -2, 4, 2); S(4, 2, 1.4, 2.2); S(4, 2, 2.2, 0.2); d.Textes.Add((6.6, 2.8, "N", true));
                    break;
            }
            return d;
        }
    }
}
