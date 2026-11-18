// Paramètres Pipe-Fit des pertes de charge fabricant (bouches, équipements hydrauliques, équipements aérauliques) et
// lecture d'une perte déjà présente dans une famille sous un autre nom ou dans une autre unité : le calcul lit d'abord
// le paramètre Pipe-Fit, sinon la valeur trouvée (paramètre Revit « Perte de charge », paramètre de famille nommé
// « Pressure Drop », « ΔP (kPa) »…, perte de charge des raccordements de la famille).
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using PipeFit.Isometries.Core;

namespace PipeFit.Isometries.Revit
{
    /// <summary>Paramètres de calcul Pipe-Fit : pertes de charge fabricant (Pa / kPa) et débits (m³/h).</summary>
    enum GenrePerte { Bouche, Hydraulique, Aeraulique, DebitHydraulique, DebitAeraulique }

    static class ParametresPerte
    {
        sealed class Def
        {
            public GenrePerte Genre; public string Nom; public Guid Guid; public double VersPa; public BuiltInCategory[] Categories; public string Description;
        }

        static readonly Def[] Defs =
        {
            new Def { Genre = GenrePerte.Bouche, Nom = PertesFabricant.NomBouche, Guid = new Guid("3e9b5c71-0a2f-4d86-b4c3-91d7e2f05a18"), VersPa = 1,
                Categories = new[] { BuiltInCategory.OST_DuctTerminal },
                Description = "Perte de charge de la bouche au débit de calcul (Pa, valeur fabricant), lue par le calcul de perte de charge aéraulique Pipe-Fit." },
            new Def { Genre = GenrePerte.Hydraulique, Nom = PertesFabricant.NomHydraulique, Guid = new Guid("a7d14f2c-6b38-4e91-8c05-2f6e9b3d7c40"), VersPa = 1000,
                Categories = new[] { BuiltInCategory.OST_MechanicalEquipment, BuiltInCategory.OST_PipeAccessory, BuiltInCategory.OST_PlumbingFixtures },
                Description = "Perte de charge de l'équipement côté eau (kPa, valeur fabricant : batterie, échangeur, chaudière, vanne…), lue par le calcul hydraulique Pipe-Fit." },
            new Def { Genre = GenrePerte.Aeraulique, Nom = PertesFabricant.NomAeraulique, Guid = new Guid("c25e8a93-7f14-4b6d-9e20-58a1d3c7b6f9"), VersPa = 1,
                Categories = new[] { BuiltInCategory.OST_MechanicalEquipment, BuiltInCategory.OST_DuctAccessory },
                Description = "Perte de charge de l'équipement côté air (Pa, valeur fabricant : CTA, batterie, filtre, registre, silencieux…), lue par le calcul aéraulique Pipe-Fit." },
            new Def { Genre = GenrePerte.DebitHydraulique, Nom = PertesFabricant.NomDebitHydraulique, Guid = new Guid("6d2a9f41-c83e-4b17-a5d0-3e7b19c4f862"), VersPa = 1,
                Categories = new[] { BuiltInCategory.OST_MechanicalEquipment, BuiltInCategory.OST_PlumbingFixtures, BuiltInCategory.OST_PipeAccessory },
                Description = "Débit d'eau de l'équipement (m³/h : ventilo-convecteur, batterie, émetteur…), lu par le calcul hydraulique Pipe-Fit quand Revit ne calcule pas le débit." },
            new Def { Genre = GenrePerte.DebitAeraulique, Nom = PertesFabricant.NomDebitAeraulique, Guid = new Guid("f18c3b57-29ad-4e6f-8b42-d07a5e9c1b36"), VersPa = 1,
                Categories = new[] { BuiltInCategory.OST_DuctTerminal, BuiltInCategory.OST_MechanicalEquipment },
                Description = "Débit d'air de la bouche ou de l'équipement (m³/h), lu par les calculs aérauliques Pipe-Fit quand Revit ne donne pas le débit." },
        };

        public static bool EstDebit(GenrePerte g) => g == GenrePerte.DebitHydraulique || g == GenrePerte.DebitAeraulique;

        static Def D(GenrePerte g) => Defs.First(d => d.Genre == g);
        public static string Nom(GenrePerte g) => D(g).Nom;
        public static string Unite(GenrePerte g) => g == GenrePerte.Hydraulique ? "kPa" : EstDebit(g) ? "m³/h" : "Pa";
        public static IEnumerable<BuiltInCategory> Categories(GenrePerte g) => D(g).Categories;

        static bool Existe(Document doc, string nom) =>
            new FilteredElementCollector(doc).OfClass(typeof(SharedParameterElement)).Any(p => p.Name == nom);

        /// <summary>Crée les paramètres s'ils manquent (transaction ouverte). Renvoie ceux créés.</summary>
        public static List<string> Creer(Document doc, Application app)
        {
            var res = new List<string>();
            foreach (var d in Defs)
                if (!Existe(doc, d.Nom)) { ParametreSpool.Creer(doc, app, d.Nom, d.Guid, d.Description, SpecTypeId.Number, d.Categories); res.Add(d.Nom); }
            return res;
        }

        /// <summary>Valeur du paramètre Pipe-Fit (Pa), null s'il est absent ou vide.</summary>
        public static double? Lire(Element e, GenrePerte g)
        {
            var p = e?.LookupParameter(D(g).Nom);
            if (p == null || !p.HasValue || p.StorageType != StorageType.Double) return null;
            var v = p.AsDouble();
            return v > 0 ? v * D(g).VersPa : (double?)null;
        }

        public static bool Ecrire(Element e, GenrePerte g, double pa)
        {
            var p = e?.LookupParameter(D(g).Nom);
            if (p == null || p.IsReadOnly) return false;
            return p.Set(Math.Round(pa / D(g).VersPa, 3));
        }

        static double? Valeur(Parameter p)
        {
            try
            {
                if (p == null || !p.HasValue) return null;
                var nom = p.Definition?.Name ?? "";
                if (p.StorageType == StorageType.String) return PertesFabricant.DepuisTexte(p.AsString(), nom);
                if (p.StorageType != StorageType.Double) return null;
                var v = p.AsDouble();
                if (v <= 0) return null;
                ForgeTypeId t = null;
                try { t = p.Definition.GetDataType(); } catch { }
                if (t != null && (t == SpecTypeId.HvacPressure || t == SpecTypeId.PipingPressure)) return UnitUtils.ConvertFromInternalUnits(v, UnitTypeId.Pascals);
                return PertesFabricant.DepuisNombre(nom, v);
            }
            catch { return null; }
        }

        /// <summary>
        /// Perte de charge déjà présente dans l'élément sous une autre forme (Pa) : paramètre Revit « Perte de charge »,
        /// paramètre d'occurrence ou de type nommé comme une perte de charge, perte de charge des raccordements.
        /// </summary>
        static double? ValeurDebit(Parameter p)
        {
            try
            {
                if (p == null || !p.HasValue) return null;
                var nom = p.Definition?.Name ?? "";
                if (p.StorageType == StorageType.String) return PertesFabricant.DebitDepuisTexte(p.AsString(), nom);
                if (p.StorageType != StorageType.Double) return null;
                var v = p.AsDouble();
                if (v <= 0) return null;
                ForgeTypeId t = null;
                try { t = p.Definition.GetDataType(); } catch { }
                if (t != null && (t == SpecTypeId.AirFlow || t == SpecTypeId.Flow)) return UnitUtils.ConvertFromInternalUnits(v, UnitTypeId.CubicMetersPerHour);
                return PertesFabricant.DebitDepuisNombre(nom, v);
            }
            catch { return null; }
        }

        /// <summary>Débit (m³/h) déjà présent : paramètre Revit « Débit », paramètre nommé comme un débit, débit des raccordements.</summary>
        static (double Pa, string Source)? TrouverDebit(Element e, GenrePerte g)
        {
            var natif = ValeurDebit(e.get_Parameter(g == GenrePerte.DebitAeraulique ? BuiltInParameter.RBS_DUCT_FLOW_PARAM : BuiltInParameter.RBS_PIPE_FLOW_PARAM));
            if (natif > 0) return (natif.Value, "paramètre Revit « Débit »");
            var type = e.Document.GetElement(e.GetTypeId());
            foreach (var (el, ou) in new[] { (e, "occurrence"), (type, "type") })
            {
                if (el == null) continue;
                foreach (Parameter p in el.Parameters)
                {
                    var nom = p.Definition?.Name ?? "";
                    if (!PertesFabricant.EstNomDebit(nom)) continue;
                    var n = AnalyseSpool.Normaliser(nom);
                    if (g == GenrePerte.DebitHydraulique && System.Text.RegularExpressions.Regex.IsMatch(n, @"\bair\b|aeraul|soufflage|extraction|reprise")) continue;
                    if (g == GenrePerte.DebitAeraulique && System.Text.RegularExpressions.Regex.IsMatch(n, @"\beau\b|water|hydraul|fluide|glycol")) continue;
                    var v = ValeurDebit(p);
                    if (v > 0) return (v.Value, "« " + nom + " » (" + ou + ")");
                }
            }
            try
            {
                ConnectorManager cm = (e as FamilyInstance)?.MEPModel?.ConnectorManager;
                if (cm != null)
                {
                    double max = 0;
                    foreach (Connector c in cm.Connectors)
                    {
                        if (g == GenrePerte.DebitHydraulique ? c.Domain != Domain.DomainPiping : c.Domain != Domain.DomainHvac) continue;
                        try { max = Math.Max(max, UnitUtils.ConvertFromInternalUnits(Math.Abs(c.Flow), UnitTypeId.CubicMetersPerHour)); } catch { }
                    }
                    if (max > 0) return (max, "débit des raccordements de la famille");
                }
            }
            catch { }
            return null;
        }

        public static (double Pa, string Source)? Trouver(Element e, GenrePerte g)
        {
            if (e == null) return null;
            if (EstDebit(g)) return TrouverDebit(e, g);
            var natif = Valeur(e.get_Parameter(BuiltInParameter.RBS_PRESSURE_DROP));
            if (natif > 0) return (natif.Value, "paramètre Revit « Perte de charge »");
            var type = e.Document.GetElement(e.GetTypeId());
            foreach (var (el, ou) in new[] { (e, "occurrence"), (type, "type") })
            {
                if (el == null) continue;
                foreach (Parameter p in el.Parameters)
                {
                    var nom = p.Definition?.Name ?? "";
                    if (!PertesFabricant.EstNomPerte(nom)) continue;
                    // Côté eau / côté air quand la famille donne les deux
                    var n = AnalyseSpool.Normaliser(nom);
                    if (g == GenrePerte.Hydraulique && System.Text.RegularExpressions.Regex.IsMatch(n, @"\bair\b|aeraul")) continue;
                    if (g != GenrePerte.Hydraulique && System.Text.RegularExpressions.Regex.IsMatch(n, @"\beau\b|water|hydraul|fluide")) continue;
                    var v = Valeur(p);
                    if (v > 0) return (v.Value, "« " + nom + " » (" + ou + ")");
                }
            }
            // Raccordements de la famille (perte de charge définie sur les connecteurs)
            try
            {
                ConnectorManager cm = (e as FamilyInstance)?.MEPModel?.ConnectorManager;
                if (cm != null)
                {
                    double max = 0;
                    foreach (Connector c in cm.Connectors)
                    {
                        if (g == GenrePerte.Hydraulique ? c.Domain != Domain.DomainPiping : c.Domain != Domain.DomainHvac) continue;
                        try { max = Math.Max(max, UnitUtils.ConvertFromInternalUnits(c.PressureDrop, UnitTypeId.Pascals)); } catch { }
                    }
                    if (max > 0) return (max, "raccordements de la famille");
                }
            }
            catch { }
            return null;
        }

        /// <summary>Valeur utilisée par le calcul (Pa, ou m³/h pour un débit) : paramètre Pipe-Fit, sinon valeur trouvée dans la famille.</summary>
        public static double? Pa(Element e, GenrePerte g) => Lire(e, g) ?? Trouver(e, g)?.Pa;
    }
}
