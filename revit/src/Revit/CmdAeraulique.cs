// Commande « Débit et vitesse (ventilation) » : sur les gaines sélectionnées (gaines, raccords, accessoires, bouches),
// débit de chaque élément (calcul Revit, sinon somme des bouches en aval de la CTA ou du plus gros élément), section,
// vitesse et perte de charge (rugosité du type de gaine, ζ selon le raccord ou l'organe). Fenêtre de résultats avec
// dimensionnement et note de calcul Excel.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Mechanical;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using PipeFit.Isometries.Core;
using TaskDialog = Autodesk.Revit.UI.TaskDialog;

namespace PipeFit.Isometries.Revit
{
    sealed class FiltreGaines : ISelectionFilter
    {
        public bool AllowElement(Element e) => CmdAeraulique.EstGaine(e);
        public bool AllowReference(Reference r, XYZ p) => true;
    }

    [Transaction(TransactionMode.ReadOnly)]
    public sealed class CmdAeraulique : CommandeBase
    {
        static readonly BuiltInCategory[] Cats = { BuiltInCategory.OST_DuctCurves, BuiltInCategory.OST_FlexDuctCurves, BuiltInCategory.OST_DuctFitting,
            BuiltInCategory.OST_DuctAccessory, BuiltInCategory.OST_DuctTerminal };

        public static bool EstGaine(Element e) => e != null && Cats.Any(c => Compat.EstCategorie(e, c));

        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            var elements = uidoc.Selection.GetElementIds().Select(doc.GetElement).Where(EstGaine).ToList();
            if (elements.Count == 0)
            {
                try
                {
                    elements = uidoc.Selection.PickObjects(ObjectType.Element, new FiltreGaines(), "Ventilation : sélectionnez les gaines (réseau ou chemin à calculer), puis Terminer")
                        .Select(r => doc.GetElement(r)).ToList();
                }
                catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return Result.Cancelled; }
            }
            if (elements.Count == 0) return Result.Cancelled;

            var troncons = Troncons(doc, elements, out var notes);
            if (troncons.Count == 0) { TaskDialog.Show("Pipe-Fit", "Aucune gaine exploitable dans la sélection."); return Result.Cancelled; }
            var projet = doc.ProjectInformation?.Name;
            using (var f = new FenetreCalcul(true, "Débit, vitesse et perte de charge – ventilation", string.IsNullOrWhiteSpace(projet) ? doc.Title : projet, troncons, notes))
                f.ShowDialog(new FenetreRevit(data.Application.MainWindowHandle));
            return Result.Succeeded;
        }

        static IEnumerable<Connector> Connecteurs(Element e)
        {
            ConnectorManager cm = null;
            if (e is MEPCurve mc) cm = mc.ConnectorManager;
            else if (e is FamilyInstance fi) cm = fi.MEPModel?.ConnectorManager;
            if (cm == null) yield break;
            foreach (Connector cn in cm.Connectors)
                if ((cn.ConnectorType & ConnectorType.Physical) != 0 && (cn.Domain == Domain.DomainHvac || cn.Domain == Domain.DomainUndefined)) yield return cn;
        }

        static IEnumerable<Element> Voisins(Element e)
        {
            foreach (var cn in Connecteurs(e))
                foreach (Connector r in cn.AllRefs)
                    if (r.Owner != null && r.Owner.Id != e.Id && !(r.Owner is MEPSystem) && (r.ConnectorType & ConnectorType.Physical) != 0) yield return r.Owner;
        }

        static double M3h(double interne) => UnitUtils.ConvertFromInternalUnits(interne, UnitTypeId.CubicMetersPerHour);

        static double Debit(Element e)
        {
            var q = e.get_Parameter(BuiltInParameter.RBS_DUCT_FLOW_PARAM)?.AsDouble() ?? 0;
            if (q <= 0 && Compat.EstCategorie(e, BuiltInCategory.OST_DuctTerminal))
                foreach (var cn in Connecteurs(e)) { try { q = Math.Max(q, Math.Abs(cn.Flow)); } catch { } }
            return q > 0 ? M3h(q) : 0;
        }

        /// <summary>Section d'un élément : gaine (Ø ou largeur × hauteur), sinon son plus grand raccordement.</summary>
        static (double d, double l, double h) Section(Element e)
        {
            if (e is MEPCurve)
            {
                var d = e.get_Parameter(BuiltInParameter.RBS_CURVE_DIAMETER_PARAM)?.AsDouble() ?? 0;
                if (d > 0) return (Compat.Mm(d), 0, 0);
                var w = e.get_Parameter(BuiltInParameter.RBS_CURVE_WIDTH_PARAM)?.AsDouble() ?? 0;
                var h = e.get_Parameter(BuiltInParameter.RBS_CURVE_HEIGHT_PARAM)?.AsDouble() ?? 0;
                if (w > 0 && h > 0) return (0, Compat.Mm(w), Compat.Mm(h));
            }
            (double, double, double) best = (0, 0, 0); double aire = -1;
            foreach (var cn in Connecteurs(e))
                try
                {
                    if (cn.Shape == ConnectorProfileType.Round) { var dd = Compat.Mm(cn.Radius * 2); var a = Math.PI * dd * dd / 4; if (a > aire) { aire = a; best = (dd, 0, 0); } }
                    else { var w = Compat.Mm(cn.Width); var h = Compat.Mm(cn.Height); if (w * h > aire) { aire = w * h; best = (0, w, h); } }
                }
                catch { }
            return best;
        }

        public static List<Troncon> Troncons(Document doc, List<Element> elements, out List<string> notes)
        {
            notes = new List<string>();
            // Réseau relié à la sélection (bouches et CTA comprises), pour les débits en aval
            var reseau = new Dictionary<string, Element>(); var voisins = new Dictionary<string, List<string>>();
            var file = new Queue<Element>(elements);
            foreach (var e in elements) reseau[Compat.Cle(e.Id)] = e;
            while (file.Count > 0 && reseau.Count < 20000)
            {
                var e = file.Dequeue(); var k = Compat.Cle(e.Id);
                var l = voisins[k] = new List<string>();
                foreach (var v in Voisins(e))
                {
                    var kv = Compat.Cle(v.Id);
                    if (!l.Contains(kv)) l.Add(kv);
                    if (!reseau.ContainsKey(kv) && (EstGaine(v) || Compat.EstCategorie(v, BuiltInCategory.OST_MechanicalEquipment))) { reseau[kv] = v; file.Enqueue(v); }
                }
            }
            var propres = reseau.Where(kv => Compat.EstCategorie(kv.Value, BuiltInCategory.OST_DuctTerminal)).ToDictionary(kv => kv.Key, kv => Debit(kv.Value));
            var equip = reseau.Values.FirstOrDefault(e => Compat.EstCategorie(e, BuiltInCategory.OST_MechanicalEquipment));
            string source = equip != null ? Compat.Cle(equip.Id)
                : elements.OrderByDescending(e => { var (d, w, h) = Section(e); return d > 0 ? Math.PI * d * d / 4 : w * h; }).Select(e => Compat.Cle(e.Id)).First();
            var arbre = propres.Values.Sum() > 0 ? PerteCharge.DebitsArbre(voisins, propres, source) : new Dictionary<string, double>();
            notes.Add(propres.Count + " bouche(s) dans le réseau, " + propres.Values.Sum().ToString("0") + " m³/h ; débits en aval de "
                + (equip != null ? "« " + (equip as FamilyInstance)?.Symbol?.FamilyName + " »" : "l'élément de plus grande section") + ".");

            var res = new List<Troncon>();
            int n = 0;
            foreach (var e in elements)
            {
                var k = Compat.Cle(e.Id);
                var (d, w, h) = Section(e);
                var famille = (doc.GetElement(e.GetTypeId()) as ElementType)?.FamilyName ?? e.Name;
                var nom = famille + (e.Name != "" && e.Name != famille ? " " + e.Name : "");
                var t = new Troncon { Id = k, Designation = nom, DiametreMm = d, LargeurMm = w, HauteurMm = h, RugositeMm = 0.15 };
                var qRevit = Debit(e);
                t.DebitM3h = qRevit > 0 ? qRevit : arbre.TryGetValue(k, out var qa) ? qa : 0;
                if (e is MEPCurve mc)
                {
                    t.Nature = "Gaine"; t.Repere = "G" + (++n);
                    t.LongueurM = Compat.Mm(e.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH)?.AsDouble() ?? 0) / 1000;
                    try { var rr = (doc.GetElement(mc.GetTypeId()) as MEPCurveType)?.Roughness ?? 0; if (rr > 0) t.RugositeMm = Compat.Mm(rr); } catch { }
                }
                else
                {
                    var cns = Connecteurs(e).ToList();
                    PerteCharge.OrganeAir o;
                    var pt = (e as FamilyInstance)?.MEPModel is MechanicalFitting mf ? mf.PartType : PartType.Undefined;
                    if (Compat.EstCategorie(e, BuiltInCategory.OST_DuctTerminal)) o = PerteCharge.OrganeAir.Bouche;
                    else if (pt == PartType.Elbow) o = PerteCharge.OrganeAir.Coude;
                    else if (pt == PartType.Tee || pt == PartType.Cross || pt == PartType.Wye || pt == PartType.TapPerpendicular || pt == PartType.TapAdjustable
                        || pt == PartType.SpudPerpendicular || pt == PartType.SpudAdjustable) o = PerteCharge.OrganeAir.Te;
                    else if (pt == PartType.Transition) o = PerteCharge.OrganeAir.Transition;
                    else o = PerteCharge.OrganeParNom(nom);
                    double angle = 90; bool derivation = false;
                    try
                    {
                        if (o == PerteCharge.OrganeAir.Coude && cns.Count == 2)
                        {
                            var dot = cns[0].CoordinateSystem.BasisZ.DotProduct(cns[1].CoordinateSystem.BasisZ);
                            angle = 180 - Math.Acos(Math.Max(-1, Math.Min(1, dot))) * 180 / Math.PI;
                        }
                        if (o == PerteCharge.OrganeAir.Te)
                        {
                            // Passage si le chemin choisi entre et sort par deux raccordements opposés
                            var dansChemin = cns.Where(cn => cn.AllRefs.Cast<Connector>().Any(r => r.Owner != null && r.Owner.Id != e.Id && elements.Any(x => x.Id == r.Owner.Id))).ToList();
                            derivation = dansChemin.Count >= 2 && !dansChemin.Any(a => dansChemin.Any(b => a.Id != b.Id && a.CoordinateSystem.BasisZ.DotProduct(b.CoordinateSystem.BasisZ) < -0.9));
                            nom += derivation ? " (dérivation)" : " (passage)";
                        }
                    }
                    catch { }
                    t.Designation = nom;
                    t.Zeta = PerteCharge.ZetaAir(o, d > 0, angle, derivation);
                    t.Nature = o.ToString(); t.Repere = o == PerteCharge.OrganeAir.Bouche ? "B" + (++n) : "R" + (++n);
                }
                res.Add(t);
            }
            return res;
        }
    }
}
