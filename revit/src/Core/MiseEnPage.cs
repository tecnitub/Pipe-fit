// Mise en page d'une feuille d'isométrie : tableaux (nomenclature, débit, assemblages, informations spool) rangés en
// colonnes à droite de la feuille, vue 3D dans la place restante, choix de l'échelle normalisée qui tient dans la zone.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace PipeFit.Isometries.Core
{
    public sealed class Rect
    {
        public double X0, Y0, X1, Y1; // mm papier, Y vers le haut
        public Rect(double x0, double y0, double x1, double y1) { X0 = x0; Y0 = y0; X1 = x1; Y1 = y1; }
        public double Largeur => X1 - X0;
        public double Hauteur => Y1 - Y0;
        public override string ToString() => string.Format(CultureInfo.InvariantCulture, "[{0:0},{1:0} - {2:0},{3:0}]", X0, Y0, X1, Y1);
    }

    public sealed class Colonne
    {
        public string Titre;
        public double LargeurMm;
        public bool Droite;
        public Colonne(string titre, double largeur, bool droite = false) { Titre = titre; LargeurMm = largeur; Droite = droite; }
    }

    public sealed class Tableau
    {
        public string Titre = "";
        public List<Colonne> Colonnes = new List<Colonne>();
        public List<string[]> Lignes = new List<string[]>();
        public double Largeur => Colonnes.Sum(c => c.LargeurMm);
        /// <summary>Hauteur des lignes du corps, en multiple de la hauteur de ligne (1,6 pour la légende des symboles).</summary>
        public double Interligne = 1;
        /// <summary>Hauteur : titre + en-tête + lignes.</summary>
        public double Hauteur(double hLigne) => ((Colonnes.Any(c => c.Titre != "") ? 2 : 1) + Lignes.Count * Interligne) * hLigne;
    }

    public sealed class Placement
    {
        public Tableau Tableau;
        public double X, Y; // coin haut gauche, mm papier
    }

    public sealed class Page
    {
        public Rect ZoneVue;
        public List<Placement> Tableaux = new List<Placement>();
    }

    public static class MiseEnPage
    {
        public static readonly int[] Echelles = { 1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250 };
        static readonly CultureInfo Fr = CultureInfo.GetCultureInfo("fr-FR");

        public static List<Tableau> Tableaux(Spool s, string projet, string date)
        {
            var res = new List<Tableau>();

            var info = new Tableau { Titre = "SPOOL " + s.Nom };
            info.Colonnes.Add(new Colonne("", 40)); info.Colonnes.Add(new Colonne("", 90));
            if (!string.IsNullOrWhiteSpace(projet)) info.Lignes.Add(new[] { "Projet", projet });
            if (s.Systeme != "") info.Lignes.Add(new[] { "Système", s.Systeme });
            if (s.Ensemble != "") info.Lignes.Add(new[] { "Ensemble", s.Ensemble });
            if (s.Materiau != "") info.Lignes.Add(new[] { "Matière", s.Materiau });
            info.Lignes.Add(new[] { "DN maxi", Diametres.Dn(s.DnMax) });
            info.Lignes.Add(new[] { "Longueur développée", (s.LongueurDeveloppeeMm / 1000).ToString("0.00", Fr) + " m" });
            info.Lignes.Add(new[] { "Éléments", s.Composants.Count.ToString(CultureInfo.InvariantCulture) });
            info.Lignes.Add(new[] { "Date", date });
            res.Add(info);

            if (s.Liaisons.Count > 0)
            {
                var lia = new Tableau { Titre = "PROVENANCE / DESTINATION" };
                lia.Colonnes.Add(new Colonne("Rep.", 12)); lia.Colonnes.Add(new Colonne("Sens", 22));
                lia.Colonnes.Add(new Colonne("Raccordé à", 76)); lia.Colonnes.Add(new Colonne("DN", 20));
                foreach (var l in s.Liaisons)
                    lia.Lignes.Add(new[] { l.Numero, l.SensTexte, l.RaccordeA != "" ? l.RaccordeA + (l.AutreSpool ? " (isométrie)" : "") : "extrémité libre", Diametres.Dn(l.DnMm) });
                res.Add(lia);
            }

            var nom = new Tableau { Titre = "NOMENCLATURE" };
            // « Encombrement » : face à face des vannes et accessoires en ligne (clapet, filtre, dilatoflex…), en mm
            bool faf = s.Nomenclature.Any(l => l.FaceAFaceMm > 0);
            // (tableau élargi à 150 mm quand la colonne est présente : chaque titre tient entier)
            nom.Colonnes.Add(new Colonne("Rep.", 10)); nom.Colonnes.Add(new Colonne("Désignation", faf ? 50 : 56));
            nom.Colonnes.Add(new Colonne("DN", 13));
            if (faf) nom.Colonnes.Add(new Colonne("Encombrement", 26, true));
            nom.Colonnes.Add(new Colonne("Matière", 22)); nom.Colonnes.Add(new Colonne("Qté", 15, true));
            nom.Colonnes.Add(new Colonne("Pouces", 14, true));
            foreach (var l in s.Nomenclature)
                nom.Lignes.Add(new[]
                {
                    l.Repere.ToString(CultureInfo.InvariantCulture), l.Designation, Taille(l) }
                    .Concat(faf ? new[] { l.FaceAFaceMm > 0 ? l.FaceAFaceMm.ToString("0", Fr) : "" } : new string[0]).Concat(new[] { l.Materiau,
                    l.EstTube ? (l.LongueurMm / 1000).ToString("0.00", Fr) + " m" : l.Quantite.ToString(CultureInfo.InvariantCulture),
                    l.PoucesSoudures > 0 ? l.PoucesSoudures.ToString("0.##", Fr) + "\"" : "",
                }).ToArray());
            var total = s.Nomenclature.Sum(l => l.PoucesSoudures);
            nom.Lignes.Add(new[] { "", "Total soudures (pouces-diamètre)", "" }.Concat(faf ? new[] { "" } : new string[0])
                .Concat(new[] { "", "", total.ToString("0.##", Fr) + "\"" }).ToArray());
            res.Add(nom);

            if (s.Debits.Count > 0)
            {
                var deb = new Tableau { Titre = "LISTE DE DÉBIT" };
                // Longueur de l'élément dans Revit, surlongueur, longueur de coupe, système de canalisation
                deb.Colonnes.Add(new Colonne("Rep.", 10)); deb.Colonnes.Add(new Colonne("DN", 14));
                deb.Colonnes.Add(new Colonne("Revit", 18, true));
                // « Piq. » : longueur du piquage Revit ajoutée (branche piquée directement sur le collecteur)
                bool piq = s.Debits.Any(d => d.PiquageMm > 0);
                if (piq) deb.Colonnes.Add(new Colonne("Piq.", 12, true));
                deb.Colonnes.Add(new Colonne("Surl.", 14, true));
                deb.Colonnes.Add(new Colonne("Coupe", 18, true)); deb.Colonnes.Add(new Colonne("Système de canalisation", piq ? 44 : 56));
                foreach (var d in s.Debits)
                    deb.Lignes.Add(new[] { d.Repere, Diametres.Dn(d.DnMm), d.LongueurRevitMm.ToString("0", Fr) }
                        .Concat(piq ? new[] { d.PiquageMm > 0 ? "+" + d.PiquageMm.ToString("0", Fr) : "" } : new string[0]).Concat(new[] {
                        d.SurlongueurMm > 0 ? "+" + d.SurlongueurMm.ToString("0", Fr) : "", d.LongueurMm.ToString("0", Fr), d.Systeme }).ToArray());
                res.Add(deb);
            }

            var ass = new Tableau { Titre = "ASSEMBLAGES" };
            ass.Colonnes.Add(new Colonne("Nature", 70)); ass.Colonnes.Add(new Colonne("Nombre", 25, true)); ass.Colonnes.Add(new Colonne("Pouces-dia.", 35, true));
            void Ligne(string nature, int nb, double pouces, bool toujours = false)
            {
                if (nb > 0 || toujours) ass.Lignes.Add(new[] { nature, nb.ToString(CultureInfo.InvariantCulture), pouces > 0 ? pouces.ToString("0.##", Fr) : "" });
            }
            Ligne("Soudure atelier", s.Nombre(NatureAssemblage.Soudure), s.PoucesDiametre(NatureAssemblage.Soudure), true);
            Ligne("Soudure chantier", s.RaccordementsChantier(true), s.PoucesDiametre(NatureAssemblage.RaccordementChantier));
            Ligne("Joint boulonné", s.Nombre(NatureAssemblage.Boulonne), 0);
            Ligne("Joint boulonné chantier", s.RaccordementsChantier(false), 0);
            Ligne("Extrémité libre", s.Nombre(NatureAssemblage.ExtremiteLibre), 0);
            res.Add(ass);
            return res;
        }

        static string Taille(LigneNomenclature l)
        {
            var dns = l.Composants.SelectMany(c => c.Extremites).Select(e => Math.Round(e.DnMm)).Where(d => d > 0).Distinct().OrderByDescending(d => d).ToList();
            if (dns.Count > 1) return string.Join("x", dns.Select(d => d.ToString(CultureInfo.InvariantCulture)));
            return Diametres.Dn(l.DnMm);
        }

        /// <summary>
        /// Range les tableaux de haut en bas le long du bord droit de la zone ; quand une colonne est pleine, la suivante
        /// se place à sa gauche. La vue occupe ce qui reste à gauche.
        /// </summary>
        public static Page Ranger(Rect zone, List<Tableau> tableaux, double hLigne, double marge = 5)
        {
            var page = new Page();
            double xDroite = zone.X1, y = zone.Y1, largeurCol = 0;
            foreach (var t in tableaux)
            {
                var h = t.Hauteur(hLigne);
                if (largeurCol > 0 && y - h < zone.Y0)
                {
                    xDroite -= largeurCol + marge;
                    y = zone.Y1;
                    largeurCol = 0;
                }
                page.Tableaux.Add(new Placement { Tableau = t, X = xDroite - t.Largeur, Y = y });
                y -= h + marge;
                largeurCol = Math.Max(largeurCol, t.Largeur);
            }
            var gauche = page.Tableaux.Count == 0 ? zone.X1 : page.Tableaux.Min(p => p.X);
            page.ZoneVue = new Rect(zone.X0, zone.Y0, Math.Max(zone.X0 + 20, gauche - marge), zone.Y1);
            return page;
        }

        /// <summary>Plus petite échelle normalisée (1:n) à laquelle un encombrement réel (mm) tient dans la zone (mm papier).</summary>
        public static int ChoisirEchelle(double largeurReelleMm, double hauteurReelleMm, double largeurZoneMm, double hauteurZoneMm)
        {
            foreach (var n in Echelles)
                if (largeurReelleMm / n <= largeurZoneMm && hauteurReelleMm / n <= hauteurZoneMm) return n;
            var k = Math.Max(largeurReelleMm / Math.Max(1, largeurZoneMm), hauteurReelleMm / Math.Max(1, hauteurZoneMm));
            return (int)(Math.Ceiling(k / 50) * 50);
        }

        /// <summary>
        /// Largeur estimée d'un texte (mm) : chasse de chaque caractère en police Arial, rapportée à la hauteur des
        /// majuscules (la « taille » d'un texte Revit), un peu plus large en gras. Volontairement prudente.
        /// </summary>
        public static double LargeurTexte(string texte, double hauteurTexteMm, bool gras = false)
        {
            double em = 0;
            foreach (var ch in texte ?? "") em += Chasse(ch);
            return em * hauteurTexteMm / 0.716 * (gras ? 1.07 : 1.0);
        }

        public static double Chasse(char c)
        {
            if (c == ' ') return 0.28;
            if ("iljìíîï.,;:'!|".IndexOf(c) >= 0) return 0.24;
            if ("frt()-[]/\\".IndexOf(c) >= 0) return 0.36;
            if (c == 'm') return 0.84;
            if (c == 'w') return 0.73;
            if (c == 'M' || c == 'W') return 0.86;
            if (c == 'I') return 0.28;
            if (c == 'J') return 0.52;
            if (c == '…') return 1.0;
            if (c == '"' || c == '°') return 0.4;
            if (char.IsDigit(c)) return 0.56;
            if (char.IsUpper(c)) return 0.72;
            if (char.IsLower(c)) return 0.56;
            return 0.62;
        }

        /// <summary>Hauteur des textes dans les cases des tableaux (mm, hauteur des majuscules).</summary>
        public const double HauteurTexteTableau = 2.0;

        /// <summary>Marge intérieure d'une case de tableau, de chaque côté (mm).</summary>
        public const double MargeCase = 1.5;

        /// <summary>Texte raccourci (« … ») pour tenir dans une colonne, marges comprises : jamais de débordement sur la voisine.</summary>
        public static string Tronquer(string texte, double largeurMm, double hauteurTexteMm, bool gras = false)
        {
            texte = texte ?? "";
            var dispo = largeurMm - 2 * MargeCase - 0.3;
            if (LargeurTexte(texte, hauteurTexteMm, gras) <= dispo) return texte;
            for (int n = texte.Length - 1; n >= 1; n--)
            {
                var t = texte.Substring(0, n).TrimEnd() + "…";
                if (LargeurTexte(t, hauteurTexteMm, gras) <= dispo) return t;
            }
            return "";
        }

        /// <summary>Le titre de chaque colonne tient sans être raccourci.</summary>
        public static bool TitresEntiers(Tableau t, double hauteurTexteMm) =>
            t.Colonnes.All(c => string.IsNullOrEmpty(c.Titre) || Tronquer(c.Titre, c.LargeurMm, hauteurTexteMm, true) == c.Titre);
    }
}
