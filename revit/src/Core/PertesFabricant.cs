// Pertes de charge « fabricant » des bouches et des équipements : reconnaissance des paramètres déjà présents dans les
// familles (noms et unités très variables : « Perte de charge », « Pressure Drop », « ΔP (kPa) », « Chute de pression
// mbar », « Dp_mCE », texte « 25 Pa »…) et conversion en pascals, pour les paramètres Pipe-Fit lus par le calcul.
using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace PipeFit.Isometries.Core
{
    public static class PertesFabricant
    {
        public const string NomBouche = "Perte de charge bouche (Pa)";
        public const string NomHydraulique = "Perte de charge équipement hydraulique (kPa)";
        public const string NomAeraulique = "Perte de charge équipement aéraulique (Pa)";

        /// <summary>Nom de paramètre qui désigne une perte de charge (hors paramètres Pipe-Fit eux-mêmes).</summary>
        public static bool EstNomPerte(string nom)
        {
            var n = AnalyseSpool.Normaliser(nom);
            if (n == "" || n == AnalyseSpool.Normaliser(NomBouche) || n == AnalyseSpool.Normaliser(NomHydraulique) || n == AnalyseSpool.Normaliser(NomAeraulique)) return false;
            if (Regex.IsMatch(n, @"coefficient|facteur|methode|method|kfactor|k factor|\bzeta\b|table")) return false;
            return Regex.IsMatch(n, @"perte(s)? de charge|pressure ?(drop|loss)|chute de pression|perte de pression|druckverlust|\bdelta ?p\b|\bd ?p\b|δp|Δp|\bpdc\b|\bp ?d ?c\b")
                || Regex.IsMatch(nom ?? "", @"ΔP|Δp|∆P");
        }

        /// <summary>Facteur vers le pascal d'après l'unité écrite dans le nom ou le texte (Pa par défaut).</summary>
        public static double FacteurUnite(string texte)
        {
            var t = (texte ?? "").ToLowerInvariant().Replace(" ", "");
            if (Regex.IsMatch(t, @"kpa")) return 1000;
            if (Regex.IsMatch(t, @"mbar")) return 100;
            if (Regex.IsMatch(t, @"mmce|mmwc|mmh2o|mmcol")) return 9.80665;
            if (Regex.IsMatch(t, @"mce|mwc|mh2o|mcol|metrecolonne|\(m\)|_m$")) return 9806.65;
            if (Regex.IsMatch(t, @"(^|[^m])bar")) return 100000;
            if (Regex.IsMatch(t, @"psi")) return 6894.76;
            if (Regex.IsMatch(t, @"inwg|inh2o|inwc|""wg")) return 249.089;
            return 1;
        }

        /// <summary>Valeur (Pa) d'un paramètre numérique sans unité Revit : unité lue dans son nom.</summary>
        public static double DepuisNombre(string nomParametre, double valeur) => valeur * FacteurUnite(nomParametre);

        /// <summary>Valeur (Pa) d'un paramètre texte : « 25 Pa », « 0,3 bar », « 2,5 mCE », « 12 » (unité du nom du paramètre).</summary>
        public static double? DepuisTexte(string texte, string nomParametre = "")
        {
            if (string.IsNullOrWhiteSpace(texte)) return null;
            var m = Regex.Match(texte.Replace(' ', ' '), @"(-?\d+(?:[.,]\d+)?)\s*([^\d\s].*)?$");
            if (!m.Success) return null;
            if (!double.TryParse(m.Groups[1].Value.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out var v)) return null;
            var unite = m.Groups[2].Success && m.Groups[2].Value.Trim() != "" ? m.Groups[2].Value : nomParametre;
            return v * FacteurUnite(unite);
        }
    }
}
