// Commande « Perte de charge » : calcul hydraulique sur une tuyauterie dessinée. On sélectionne le chemin (tubes,
// raccords, vannes, avec Ctrl ou par fenêtre), ou on le clique après la commande. Pour chaque élément : diamètre
// intérieur et rugosité du segment de tuyau Revit, longueur, débit du calcul Revit (sinon débit saisi), ζ selon le
// raccord ou la vanne (té : passage ou dérivation d'après le chemin choisi). Résultats et note Excel dans la fenêtre.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Plumbing;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using PipeFit.Isometries.Core;
using TaskDialog = Autodesk.Revit.UI.TaskDialog;

namespace PipeFit.Isometries.Revit
{
    [Transaction(TransactionMode.ReadOnly)]
    public sealed class CmdPerteCharge : CommandeBase
    {
        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            var filtre = new FiltreTuyauterie();
            var elements = uidoc.Selection.GetElementIds().Select(doc.GetElement).Where(e => e != null && filtre.AllowElement(e)).ToList();
            if (elements.Count == 0)
            {
                try
                {
                    elements = uidoc.Selection.PickObjects(ObjectType.Element, filtre, "Perte de charge : sélectionnez le chemin (tubes, raccords, vannes), puis Terminer")
                        .Select(r => doc.GetElement(r)).ToList();
                }
                catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return Result.Cancelled; }
            }
            if (elements.Count == 0) return Result.Cancelled;

            var troncons = Troncons(doc, elements, out var notes);
            if (troncons.Count == 0) { TaskDialog.Show("Pipe-Fit", "Aucune canalisation exploitable dans la sélection."); return Result.Cancelled; }
            var projet = doc.ProjectInformation?.Name;
            using (var f = new FenetreCalcul(false, "Perte de charge hydraulique", string.IsNullOrWhiteSpace(projet) ? doc.Title : projet, troncons, notes))
                f.ShowDialog(new FenetreRevit(data.Application.MainWindowHandle));
            return Result.Succeeded;
        }

        static double M3h(double interne) => UnitUtils.ConvertFromInternalUnits(interne, UnitTypeId.CubicMetersPerHour);

        public static List<Troncon> Troncons(Document doc, List<Element> elements, out List<string> notes)
        {
            notes = new List<string>();
            var parCle = elements.ToDictionary(e => Compat.Cle(e.Id));
            var spool = new Spool { Nom = "calcul" };
            foreach (var e in elements) spool.Composants.Add(LectureModele.Lire(doc, e));
            AnalyseSpool.Analyser(spool);

            // Tubes : diamètre intérieur, rugosité du segment, débit calculé par Revit
            var dint = new Dictionary<string, double>(); var rug = new Dictionary<string, double>(); var debit = new Dictionary<string, double>();
            foreach (var e in elements.OfType<Pipe>())
            {
                var k = Compat.Cle(e.Id);
                var di = e.get_Parameter(BuiltInParameter.RBS_PIPE_INNER_DIAM_PARAM)?.AsDouble() ?? 0;
                if (di > 0) dint[k] = Compat.Mm(di);
                try { var sg = e.PipeSegment; if (sg != null && sg.Roughness > 0) rug[k] = Compat.Mm(sg.Roughness); } catch { }
                var q = e.get_Parameter(BuiltInParameter.RBS_PIPE_FLOW_PARAM)?.AsDouble() ?? 0;
                if (q > 0) debit[k] = M3h(q);
            }
            if (debit.Count == 0) notes.Add("Pas de débit calculé par Revit sur ces tubes : débit saisi appliqué.");

            var res = new List<Troncon>();
            foreach (var c in AnalyseSpool.Parcourir(spool.Composants))
            {
                if (c.Type != TypeComposant.Tube && Robinetterie.UnPort(c.Genre)) continue; // purgeur, manomètre : hors écoulement
                var voisins = c.Extremites.Where(x => x.ConnecteA != null && parCle.ContainsKey(x.ConnecteA)).ToList();
                double D(string id) => dint.TryGetValue(id, out var v) ? v : 0;
                var t = new Troncon { Id = c.Id, Repere = c.Repere, Designation = c.Designation, Nature = c.Type.ToString() };
                if (c.Type == TypeComposant.Tube)
                {
                    t.LongueurM = c.LongueurMm / 1000;
                    t.DiametreMm = D(c.Id) > 0 ? D(c.Id) : c.DnMm;
                    t.RugositeMm = rug.TryGetValue(c.Id, out var r) ? r : 0.045;
                    t.DebitM3h = debit.TryGetValue(c.Id, out var q) ? q : 0;
                }
                else
                {
                    // Raccord, vanne : diamètre intérieur et débit des tubes voisins du chemin
                    var di = voisins.Select(x => D(x.ConnecteA)).Where(v => v > 0).DefaultIfEmpty(0).Min();
                    t.DiametreMm = di > 0 ? di : c.DnMm;
                    t.DebitM3h = voisins.Select(x => debit.TryGetValue(x.ConnecteA, out var q) ? q : 0).DefaultIfEmpty(0).Max();
                    bool derivation = false;
                    if ((c.Type == TypeComposant.Te || c.Type == TypeComposant.Croix) && c.Extremites.Count >= 3)
                    {
                        var (r1, r2) = ExportPcf.Passage(c.Extremites, Cotation.PointAxe(c));
                        derivation = voisins.Count >= 2 && !(voisins.Contains(r1) && voisins.Contains(r2));
                    }
                    else if (c.Type == TypeComposant.Piquage) derivation = voisins.Count >= 2;
                    t.Zeta = PerteCharge.ZetaHydraulique(c.Type, c.Genre, c.AngleDeg, derivation);
                    if (c.Type == TypeComposant.Te || c.Type == TypeComposant.Croix) t.Designation += derivation ? " (dérivation)" : " (passage)";
                    // Équipement ou accessoire avec sa perte fabricant (paramètre Pipe-Fit, sinon valeur de la famille) : remplace le ζ
                    if (parCle.TryGetValue(c.Id, out var el) && (Compat.EstCategorie(el, BuiltInCategory.OST_PipeAccessory)
                        || Compat.EstCategorie(el, BuiltInCategory.OST_MechanicalEquipment) || Compat.EstCategorie(el, BuiltInCategory.OST_PlumbingFixtures)))
                    {
                        if (Compat.EstCategorie(el, BuiltInCategory.OST_MechanicalEquipment)) { t.Nature = "Equipement"; t.Zeta = 0; t.Designation = "Équipement " + t.Designation; }
                        var pa = ParametresPerte.Pa(el, GenrePerte.Hydraulique);
                        if (pa > 0) { t.PerteFixePa = pa.Value; t.Zeta = 0; t.Designation += " (fabricant)"; }
                    }
                }
                res.Add(t);
            }
            return res;
        }
    }
}
