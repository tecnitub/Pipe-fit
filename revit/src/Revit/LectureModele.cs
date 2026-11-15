// Lecture du modèle Revit : éléments de tuyauterie (canalisations, raccords, accessoires, canalisations souples,
// pièces de fabrication MEP), numéro de spool lu dans un paramètre, conversion en composants du modèle Core.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Plumbing;
using PipeFit.Isometries.Core;

namespace PipeFit.Isometries.Revit
{
    static class LectureModele
    {
        /// <summary>Nom réservé : numéro de spool des pièces de fabrication MEP (propriété « Spool » de Revit).</summary>
        public const string SpoolFabrication = "(Pièces de fabrication : Spool)";

        public static readonly string[] NomsHabituels =
        {
            "Numéro de spool", "Numero de spool", "N° spool", "N° de spool", "No spool", "Num spool", "Spool", "Spool Number", "Spool number",
            "Repère spool", "Repere spool", "PF_Spool", "Isométrie", "ISO",
        };

        static readonly BuiltInCategory[] Categories =
        {
            BuiltInCategory.OST_PipeCurves, BuiltInCategory.OST_PipeFitting, BuiltInCategory.OST_PipeAccessory,
            BuiltInCategory.OST_FlexPipeCurves, BuiltInCategory.OST_FabricationPipework,
        };

        public static List<Element> ElementsTuyauterie(Document doc)
        {
            var filtre = new ElementMulticategoryFilter(Categories.ToList());
            return new FilteredElementCollector(doc).WherePasses(filtre).WhereElementIsNotElementType()
                .Where(e => !(e is FamilyInstance fi) || fi.SuperComponent == null)
                .ToList();
        }

        /// <summary>Paramètres texte présents sur les éléments de tuyauterie, candidats pour le numéro de spool.</summary>
        public static List<string> ParametresCandidats(List<Element> elements)
        {
            var noms = new HashSet<string>();
            foreach (var e in elements.Take(400))
                foreach (Parameter p in e.Parameters)
                    if (p.Definition != null && p.StorageType == StorageType.String && !p.IsReadOnly) noms.Add(p.Definition.Name);
            if (elements.Any(e => e is FabricationPart)) noms.Add(SpoolFabrication);
            return noms.OrderBy(n => NomsHabituels.Contains(n, StringComparer.OrdinalIgnoreCase) ? 0 : 1)
                .ThenBy(n => n, StringComparer.CurrentCultureIgnoreCase).ToList();
        }

        /// <summary>Premier nom habituel de paramètre spool réellement renseigné dans le modèle.</summary>
        public static string ParametreParDefaut(List<Element> elements, List<string> candidats)
        {
            foreach (var nom in NomsHabituels.Concat(new[] { SpoolFabrication }))
            {
                var trouve = candidats.FirstOrDefault(c => string.Equals(c, nom, StringComparison.OrdinalIgnoreCase));
                if (trouve != null && elements.Any(e => ValeurSpool(e, trouve) != "")) return trouve;
            }
            return candidats.FirstOrDefault(c => elements.Count(e => ValeurSpool(e, c) != "") > 0
                && c.IndexOf("spool", StringComparison.OrdinalIgnoreCase) >= 0) ?? "";
        }

        public static string ValeurSpool(Element e, string parametre)
        {
            if (string.IsNullOrEmpty(parametre)) return "";
            if (parametre == SpoolFabrication) return (e as FabricationPart)?.SpoolName?.Trim() ?? "";
            var p = e.LookupParameter(parametre);
            if (p == null)
            {
                var type = e.Document.GetElement(e.GetTypeId());
                p = type?.LookupParameter(parametre);
            }
            if (p == null || !p.HasValue) return "";
            var v = p.StorageType == StorageType.String ? p.AsString() : p.AsValueString();
            return (v ?? "").Trim();
        }

        public static Dictionary<string, List<Element>> ParSpool(List<Element> elements, string parametre, out List<Element> sansSpool)
        {
            var res = new Dictionary<string, List<Element>>(StringComparer.Ordinal);
            sansSpool = new List<Element>();
            foreach (var e in elements)
            {
                var v = ValeurSpool(e, parametre);
                if (v == "") { sansSpool.Add(e); continue; }
                if (!res.TryGetValue(v, out var l)) res[v] = l = new List<Element>();
                l.Add(e);
            }
            return res;
        }

        // ---------- Conversion en composants ----------

        public static Spool Convertir(Document doc, string nom, List<Element> elements, string parametreSpool)
        {
            var s = new Spool { Nom = nom };
            foreach (var e in elements) s.Composants.Add(Composant(doc, e));

            // Ce qui est raccordé aux extrémités : autre spool, équipement, réseau
            var ids = new HashSet<string>(s.Composants.Select(c => c.Id));
            foreach (var ext in s.Composants.SelectMany(c => c.Extremites))
            {
                if (ext.ConnecteA == null || ids.Contains(ext.ConnecteA) || s.NomsExterieurs.ContainsKey(ext.ConnecteA)) continue;
                var autre = doc.GetElement(Compat.IdDepuis(ext.ConnecteA));
                if (autre == null) continue;
                var spool = ValeurSpool(autre, parametreSpool);
                if (spool != "") { s.NomsExterieurs[ext.ConnecteA] = spool; s.ExterieursSpool.Add(ext.ConnecteA); }
                else s.NomsExterieurs[ext.ConnecteA] = NomExterieur(doc, autre);
            }
            AnalyseSpool.Analyser(s);
            return s;
        }

        /// <summary>Nom lisible d'un élément raccordé hors spool : repère (Marque) de l'équipement, sinon famille et type ; réseau pour une tuyauterie.</summary>
        static string NomExterieur(Document doc, Element e)
        {
            var marque = Texte(e, BuiltInParameter.ALL_MODEL_MARK);
            var estTuyauterie = Categories.Any(c => Compat.EstCategorie(e, c));
            if (estTuyauterie)
            {
                var sys = Texte(e, BuiltInParameter.RBS_SYSTEM_NAME_PARAM);
                return sys != "" ? "réseau " + sys + " (hors spool)" : "tuyauterie hors spool";
            }
            var type = doc.GetElement(e.GetTypeId()) as ElementType;
            var nom = type == null ? e.Name : type.FamilyName + " " + type.Name;
            return marque != "" ? marque + " (" + (type?.FamilyName ?? e.Category?.Name ?? "") + ")" : nom;
        }

        /// <summary>Composant (modèle Core) d'un élément de tuyauterie : type, DN, extrémités et raccordements.</summary>
        public static Composant Lire(Document doc, Element e) => Composant(doc, e);

        static Composant Composant(Document doc, Element e)
        {
            var c = new Composant { Id = Compat.Cle(e.Id) };
            var type = doc.GetElement(e.GetTypeId()) as ElementType;
            c.TypeNom = type?.Name ?? e.Name ?? "";
            c.Famille = type?.FamilyName ?? e.Category?.Name ?? "";
            c.Systeme = Texte(e, BuiltInParameter.RBS_SYSTEM_NAME_PARAM);
            if (c.Systeme == "") c.Systeme = Texte(e, BuiltInParameter.RBS_PIPING_SYSTEM_TYPE_PARAM);
            c.Taille = Texte(e, BuiltInParameter.RBS_CALCULATED_SIZE);
            c.EstAccessoire = Compat.EstCategorie(e, BuiltInCategory.OST_PipeAccessory);

            foreach (var cn in Connecteurs(e))
            {
                var ext = new Extremite { DnMm = Math.Round(Compat.Mm(cn.Radius * 2), 1) };
                try { ext.Position = P(cn.Origin); } catch { continue; }
                try { var z = cn.CoordinateSystem?.BasisZ; if (z != null) ext.Direction = new Point3(z.X, z.Y, z.Z); } catch { }
                ext.Sens = Sens(cn, false);
                foreach (Connector r in cn.AllRefs)
                {
                    var owner = r.Owner;
                    if (owner == null || owner.Id == e.Id || owner is MEPSystem) continue;
                    if ((r.ConnectorType & ConnectorType.Physical) == 0) continue;
                    ext.ConnecteA = Compat.Cle(owner.Id);
                    // Sens inconnu sur notre connecteur : on lit celui d'en face, à l'envers
                    if (ext.Sens == SensFlux.Inconnu) ext.Sens = Sens(r, true);
                    break;
                }
                c.Extremites.Add(ext);
            }

            if (e is Pipe || e is FlexPipe)
            {
                c.Type = TypeComposant.Tube;
                c.LongueurMm = Compat.Mm(Double(e, BuiltInParameter.CURVE_ELEM_LENGTH));
                c.DnMm = Math.Round(Compat.Mm(Double(e, BuiltInParameter.RBS_PIPE_DIAMETER_PARAM)), 1);
                c.Materiau = MateriauTube(doc, e);
                if (e is FlexPipe) c.Famille = "Flexible";
            }
            else if (e is FabricationPart fp)
            {
                if (fp.IsAStraight()) { c.Type = TypeComposant.Tube; c.LongueurMm = Compat.Mm(fp.CenterlineLength); }
                c.Famille = string.IsNullOrWhiteSpace(fp.ProductLongDescription) ? c.Famille : fp.ProductLongDescription;
                c.Materiau = Texte(e, BuiltInParameter.FABRICATION_PART_MATERIAL);
                if (fp.Origin != null && c.Type != TypeComposant.Tube) c.Centre = P(fp.Origin);
            }
            else if (e is FamilyInstance fi)
            {
                if (fi.Location is LocationPoint lp) c.Centre = P(lp.Point);
                var pt = fi.Symbol?.Family?.get_Parameter(BuiltInParameter.FAMILY_CONTENT_PART_TYPE);
                if (pt != null && pt.StorageType == StorageType.Integer) c.Type = TypeRevit((PartType)pt.AsInteger());
                c.Materiau = MateriauParametre(e, type);
            }
            if (c.DnMm <= 0 && c.Extremites.Count > 0) c.DnMm = c.Extremites.Max(x => x.DnMm);
            return c;
        }

        /// <summary>Sens d'écoulement d'un connecteur (In = le fluide entre dans l'élément), inversé pour le connecteur d'en face.</summary>
        static SensFlux Sens(Connector c, bool enFace)
        {
            try
            {
                switch (c.Direction)
                {
                    case FlowDirectionType.In: return enFace ? SensFlux.Sortie : SensFlux.Entree;
                    case FlowDirectionType.Out: return enFace ? SensFlux.Entree : SensFlux.Sortie;
                    default: return SensFlux.Inconnu;
                }
            }
            catch { return SensFlux.Inconnu; }
        }

        static TypeComposant TypeRevit(PartType t)
        {
            switch (t)
            {
                case PartType.Elbow: return TypeComposant.Coude;
                case PartType.Tee: case PartType.LateralTee: return TypeComposant.Te;
                case PartType.Cross: case PartType.LateralCross: return TypeComposant.Croix;
                case PartType.Transition: return TypeComposant.Reduction;
                case PartType.Cap: return TypeComposant.Bouchon;
                case PartType.Union: case PartType.PipeMechanicalCoupling: return TypeComposant.Manchon;
                case PartType.PipeFlange: return TypeComposant.Bride;
                case PartType.SpudAdjustable: case PartType.SpudPerpendicular: return TypeComposant.Piquage;
                default: return TypeComposant.Autre;
            }
        }

        public static IEnumerable<Connector> Connecteurs(Element e)
        {
            ConnectorManager cm = null;
            if (e is MEPCurve mc) cm = mc.ConnectorManager;
            else if (e is FamilyInstance fi) cm = fi.MEPModel?.ConnectorManager;
            else if (e is FabricationPart fp) cm = fp.ConnectorManager;
            if (cm == null) yield break;
            foreach (Connector cn in cm.Connectors)
            {
                if ((cn.ConnectorType & ConnectorType.Physical) == 0) continue;
                if (cn.Domain != Domain.DomainPiping && cn.Domain != Domain.DomainUndefined) continue;
                if (cn.Shape != ConnectorProfileType.Round) continue;
                yield return cn;
            }
        }

        static string MateriauTube(Document doc, Element e)
        {
            var seg = e.get_Parameter(BuiltInParameter.RBS_PIPE_SEGMENT_PARAM);
            if (seg != null && seg.AsElementId() != ElementId.InvalidElementId && doc.GetElement(seg.AsElementId()) is Segment s
                && doc.GetElement(s.MaterialId) is Material m) return m.Name;
            var mat = e.get_Parameter(BuiltInParameter.RBS_PIPE_MATERIAL_PARAM);
            return mat?.AsValueString() ?? "";
        }

        static string MateriauParametre(Element e, Element type)
        {
            foreach (var nom in new[] { "Matériau", "Materiau", "Material", "Matière", "Matiere" })
            {
                var p = e.LookupParameter(nom) ?? type?.LookupParameter(nom);
                if (p == null || !p.HasValue) continue;
                var v = p.StorageType == StorageType.ElementId
                    ? (e.Document.GetElement(p.AsElementId()) as Material)?.Name
                    : p.StorageType == StorageType.String ? p.AsString() : p.AsValueString();
                if (!string.IsNullOrWhiteSpace(v)) return v.Trim();
            }
            return "";
        }

        static string Texte(Element e, BuiltInParameter bip)
        {
            var p = e.get_Parameter(bip);
            if (p == null || !p.HasValue) return "";
            return ((p.StorageType == StorageType.String ? p.AsString() : p.AsValueString()) ?? "").Trim();
        }

        static double Double(Element e, BuiltInParameter bip) => e.get_Parameter(bip)?.AsDouble() ?? 0;

        static Point3 P(XYZ p) => new Point3(Compat.Mm(p.X), Compat.Mm(p.Y), Compat.Mm(p.Z));
    }
}
