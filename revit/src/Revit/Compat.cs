// Différences entre versions de l'API Revit (2023 → 2027) et conversions d'unités.
using Autodesk.Revit.DB;

namespace PipeFit.Isometries.Revit
{
    static class Compat
    {
        public const double PiedMm = 304.8;

        public static double Mm(double pieds) => pieds * PiedMm;
        public static double Pieds(double mm) => mm / PiedMm;

        public static long Valeur(ElementId id)
        {
#if REVIT2023
            return id.IntegerValue;
#else
            return id.Value;
#endif
        }

        public static string Cle(ElementId id) => Valeur(id).ToString(System.Globalization.CultureInfo.InvariantCulture);

        public static bool EstCategorie(Element e, BuiltInCategory bic)
        {
            var cat = e?.Category;
            return cat != null && Valeur(cat.Id) == (long)bic;
        }
    }
}
