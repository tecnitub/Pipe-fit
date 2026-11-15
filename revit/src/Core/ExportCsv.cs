// Exports CSV (séparateur « ; », UTF-8) : nomenclature par spool, directement importable dans Pipe-Fit
// (Devis → Chiffrage depuis plan : colonnes Spool, Famille, Type, Taille, Longueur, Nombre reconnues), et liste des soudures.
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace PipeFit.Isometries.Core
{
    public static class ExportCsv
    {
        static readonly CultureInfo Fr = CultureInfo.GetCultureInfo("fr-FR");

        public static string Nomenclature(IEnumerable<Spool> spools)
        {
            var sb = new StringBuilder();
            Ligne(sb, "Spool", "Rep.", "Famille", "Type", "Taille", "Longueur", "Nombre", "Matériau", "Système", "Désignation");
            foreach (var s in spools)
                foreach (var l in s.Nomenclature)
                {
                    var c = l.Composants[0];
                    Ligne(sb, s.Nom, l.Repere.ToString(CultureInfo.InvariantCulture), c.Famille, c.TypeNom, l.Taille != "" ? l.Taille : Diametres.Dn(l.DnMm),
                        l.EstTube ? System.Math.Round(l.LongueurMm).ToString(Fr) : "", l.EstTube ? "1" : l.Quantite.ToString(CultureInfo.InvariantCulture),
                        l.Materiau, c.Systeme, l.Designation);
                }
            return sb.ToString();
        }

        public static string Soudures(IEnumerable<Spool> spools)
        {
            var sb = new StringBuilder();
            Ligne(sb, "Spool", "N°", "Nature", "DN", "Pouces-diamètre", "Élément 1", "Élément 2", "X (mm)", "Y (mm)", "Z (mm)");
            foreach (var s in spools)
                foreach (var a in s.Assemblages)
                    Ligne(sb, s.Nom, a.Numero, Nature(a.Nature), Diametres.Dn(a.DnMm), a.PoucesDiametre.ToString("0.##", Fr),
                        Rep(a.A), a.B != null ? Rep(a.B) : a.Nature == NatureAssemblage.RaccordementChantier ? "hors spool" : "libre",
                        a.Position.X.ToString("0", Fr), a.Position.Y.ToString("0", Fr), a.Position.Z.ToString("0", Fr));
            return sb.ToString();
        }

        public static string Cotes(IEnumerable<Spool> spools)
        {
            var sb = new StringBuilder();
            Ligne(sb, "Spool", "Cote (mm)", "De / à", "X1", "Y1", "Z1", "X2", "Y2", "Z2");
            foreach (var s in spools)
                foreach (var c in s.Cotes)
                    Ligne(sb, s.Nom, c.Valeur, c.Libelle, c.A.X.ToString("0", Fr), c.A.Y.ToString("0", Fr), c.A.Z.ToString("0", Fr),
                        c.B.X.ToString("0", Fr), c.B.Y.ToString("0", Fr), c.B.Z.ToString("0", Fr));
            return sb.ToString();
        }

        public static string Nature(NatureAssemblage n)
        {
            switch (n)
            {
                case NatureAssemblage.Soudure: return "Soudure atelier";
                case NatureAssemblage.Boulonne: return "Joint boulonné";
                case NatureAssemblage.RaccordementChantier: return "Raccordement chantier";
                default: return "Extrémité libre";
            }
        }

        static string Rep(Composant c) => c == null ? "" : "Rep. " + c.Repere + " " + c.Designation;

        static void Ligne(StringBuilder sb, params string[] champs)
        {
            sb.Append(string.Join(";", champs.Select(Champ))).Append("\r\n");
        }

        static string Champ(string v)
        {
            v = v ?? "";
            return v.IndexOfAny(new[] { ';', '"', '\n', '\r' }) >= 0 ? "\"" + v.Replace("\"", "\"\"") + "\"" : v;
        }
    }
}
