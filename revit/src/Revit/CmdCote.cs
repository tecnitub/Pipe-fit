// Commande « Ajouter une cote » : une cote que la cotation automatique n'a pas faite, prise dans une VUE EN PLAN ou une
// COUPE (pas en 3D), avec la précision d'une cote alignée :
//   1. conversion de cotes alignées Revit dessinées dans la vue (accrochage précis de Revit aux axes et extrémités) :
//      direction de la cote, position de chaque ligne d'attache, élément visé → point d'attache (axe d'un coude / té,
//      axe d'une vanne, face de bride, bout de tube) le plus proche le long de la direction ;
//   2. deux points cliqués avec accrochage (extrémités, milieux, intersections), direction = celle des deux points,
//      élément le plus proche de chaque point dans le plan de la vue.
// La cote garde sa direction de mesure : la valeur reportée sur l'isométrie est la projection sur cette direction,
// recalculée à chaque génération. Reprendre la même cote la retire.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using PipeFit.Isometries.Core;
using TaskDialog = Autodesk.Revit.UI.TaskDialog;

namespace PipeFit.Isometries.Revit
{
    sealed class FiltreCotes : ISelectionFilter
    {
        public bool AllowElement(Element e) => e is Dimension d && d.Curve is Line;
        public bool AllowReference(Reference r, XYZ p) => true;
    }

    [Transaction(TransactionMode.Manual)]
    public sealed class CmdCote : CommandeBase
    {
        sealed class Attache
        {
            public Element Element; public Composant Composant; public string Code; public Point3 Point;
            public string Texte => (Composant.Designation != "" ? Composant.Designation : Composant.Famille) + " (" + Compat.Cle(Element.Id) + ")";
        }

        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            var vue = uidoc.ActiveView;
            if (!(vue is ViewPlan) && !(vue is ViewSection))
            {
                TaskDialog.Show("Pipe-Fit – Ajouter une cote", "Ouvrez une vue en plan (vue de dessus) ou une coupe : la cote s'y prend comme une cote alignée, "
                    + "avec l'accrochage précis aux axes et extrémités des tuyauteries. Une vue 3D ne permet pas cette précision.");
                return Result.Cancelled;
            }

            var dims = uidoc.Selection.GetElementIds().Select(doc.GetElement).OfType<Dimension>().Where(d => d.Curve is Line).ToList();
            var choix = new TaskDialog("Pipe-Fit – Ajouter une cote")
            {
                MainInstruction = "Comment prendre la cote ?",
                MainContent = "La cote est reportée sur l'isométrie du spool du premier élément, mesurée suivant sa direction, et recalculée à chaque génération. "
                    + "Reprendre exactement la même cote la retire.",
                CommonButtons = TaskDialogCommonButtons.Cancel,
            };
            choix.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, "Convertir des cotes alignées Revit (recommandé)" + (dims.Count > 0 ? " – " + dims.Count + " sélectionnée(s)" : ""),
                "Dessinez d'abord la cote avec l'outil Revit « Cote alignée » sur les axes ou extrémités des tuyauteries, puis sélectionnez-la. Une cote à plusieurs segments donne plusieurs cotes.");
            choix.AddCommandLink(TaskDialogCommandLinkId.CommandLink2, "Cliquer deux points dans la vue", "Accrochage aux extrémités, milieux et intersections ; la pièce la plus proche de chaque point est retenue.");
            var r = choix.Show();
            List<(Attache A, Attache B, Point3 Axe, double? Revit)> cotes;
            if (r == TaskDialogResult.CommandLink1)
            {
                if (dims.Count == 0)
                {
                    try { dims = uidoc.Selection.PickObjects(ObjectType.Element, new FiltreCotes(), "Sélectionnez les cotes alignées Revit à reporter, puis Terminer").Select(x => doc.GetElement(x)).OfType<Dimension>().ToList(); }
                    catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return Result.Cancelled; }
                }
                cotes = DepuisCotesRevit(doc, dims, out var ignores);
                if (ignores.Count > 0) Journal.Ecrire("Ajouter une cote : " + string.Join(" ; ", ignores));
                if (cotes.Count == 0) { TaskDialog.Show("Pipe-Fit", "Aucune cote exploitable : chaque ligne d'attache doit viser une tuyauterie, un raccord, un accessoire ou un équipement.\n" + string.Join("\n", ignores.Take(6))); return Result.Cancelled; }
            }
            else if (r == TaskDialogResult.CommandLink2)
            {
                var c = DeuxPoints(uidoc, out var msg);
                if (c == null) { if (msg != null) TaskDialog.Show("Pipe-Fit", msg); return Result.Cancelled; }
                cotes = new List<(Attache, Attache, Point3, double?)> { c.Value };
            }
            else return Result.Cancelled;

            var journal = new List<string>();
            using (var t = new Transaction(doc, "Pipe-Fit : cotes ajoutées"))
            {
                t.Start();
                ParametreSpool.CreerCotes(doc, data.Application.Application);
                doc.Regenerate();
                foreach (var (a, b, axe, revit) in cotes)
                {
                    if (a.Element.Id == b.Element.Id && a.Code == b.Code) continue;
                    var valeur = Math.Abs((b.Point - a.Point).Dot(axe.Normalise()));
                    if (valeur < 1) continue;
                    var nouvelle = new CoteAjoutee { AttacheA = a.Code, IdB = Compat.Cle(b.Element.Id), AttacheB = b.Code, PositionB = b.Point, Axe = axe.Normalise() };
                    var liste = ParametreSpool.Cotes(a.Element);
                    string action;
                    if (liste.Any(nouvelle.Meme)) { liste.RemoveAll(nouvelle.Meme); action = "retirée"; }
                    else { liste.Add(nouvelle); action = "ajoutée"; }
                    if (!ParametreSpool.EcrireCotes(a.Element, liste)) { journal.Add("Non enregistrée (paramètre absent) : " + a.Texte); continue; }
                    var ecart = revit.HasValue && Math.Abs(revit.Value - valeur) > 2 ? "   (cote Revit " + Math.Round(revit.Value) + " mm : point d'attache le plus proche retenu)" : "";
                    journal.Add("Cote " + action + " : " + Math.Round(valeur) + " mm – " + a.Texte + " → " + b.Texte + ecart);
                }
                t.Commit();
            }
            foreach (var l in journal) Journal.Ecrire(l);
            new TaskDialog("Pipe-Fit – Cotes ajoutées")
            {
                MainInstruction = journal.Count + " cote(s)",
                MainContent = string.Join(Environment.NewLine, journal) + Environment.NewLine + Environment.NewLine
                    + "Régénérez l'isométrie du spool : la cote y est dessinée suivant sa direction de mesure, valeur recalculée sur la géométrie.",
            }.Show();
            return Result.Succeeded;
        }

        static Composant Analyse(Document doc, Element e)
        {
            var c = LectureModele.Lire(doc, e);
            var s = new Spool { Nom = "" }; s.Composants.Add(c);
            try { AnalyseSpool.Analyser(s); } catch { }
            return c;
        }

        static bool Reseau(Element e) => e != null && LectureModele.Connecteurs(e).Any();

        /// <summary>Cotes alignées Revit → paires de points d'attache (un par segment), direction de la cote.</summary>
        static List<(Attache, Attache, Point3, double?)> DepuisCotesRevit(Document doc, List<Dimension> dims, out List<string> ignores)
        {
            ignores = new List<string>();
            var res = new List<(Attache, Attache, Point3, double?)>();
            foreach (var d in dims)
            {
                try
                {
                    if (!(d.Curve is Line ligne)) { ignores.Add("cote non linéaire"); continue; }
                    var dir = LectureModele.P(ligne.Direction); var u = new Point3(ligne.Direction.X, ligne.Direction.Y, ligne.Direction.Z).Normalise();
                    // Positions des lignes d'attache le long de la cote (mm), depuis la première
                    var segments = new List<(XYZ Origine, double Valeur)>();
                    if (d.NumberOfSegments > 1) foreach (DimensionSegment sg in d.Segments) segments.Add((sg.Origin, sg.Value ?? 0));
                    else segments.Add((d.Origin, d.Value ?? 0));
                    var depart = LectureModele.P(segments[0].Origine) - u * Compat.Mm(segments[0].Valeur / 2);
                    var positions = new List<double> { 0 };
                    double cumul = 0;
                    foreach (var sg in segments) { cumul += Compat.Mm(sg.Valeur); positions.Add(cumul); }
                    var refs = d.References;
                    var attaches = new List<Attache>();
                    for (int i = 0; i < refs.Size && i < positions.Count; i++)
                    {
                        var e = doc.GetElement(refs.get_Item(i).ElementId);
                        if (!Reseau(e)) { attaches.Add(null); ignores.Add("ligne d'attache " + (i + 1) + " : " + (e?.Name ?? "référence") + " n'est pas une tuyauterie"); continue; }
                        var c = Analyse(doc, e);
                        var (code, point, _) = CoteAjoutee.PourLigneAttache(c, depart, u, positions[i]);
                        attaches.Add(new Attache { Element = e, Composant = c, Code = code, Point = point });
                    }
                    for (int i = 0; i + 1 < attaches.Count; i++)
                        if (attaches[i] != null && attaches[i + 1] != null)
                            res.Add((attaches[i], attaches[i + 1], u, Compat.Mm(segments[Math.Min(i, segments.Count - 1)].Valeur)));
                }
                catch (Exception ex) { ignores.Add("cote illisible : " + ex.Message); }
            }
            return res;
        }

        /// <summary>Deux points cliqués avec accrochage ; élément le plus proche de chacun dans le plan de la vue.</summary>
        static (Attache, Attache, Point3, double?)? DeuxPoints(UIDocument uidoc, out string message)
        {
            message = null;
            var doc = uidoc.Document; var vue = uidoc.ActiveView;
            if (vue.SketchPlane == null)
                using (var t = new Transaction(doc, "Pipe-Fit : plan de travail"))
                {
                    t.Start();
                    vue.SketchPlane = SketchPlane.Create(doc, Plane.CreateByNormalAndOrigin(vue.ViewDirection, vue.Origin));
                    t.Commit();
                }
            var snaps = ObjectSnapTypes.Endpoints | ObjectSnapTypes.Midpoints | ObjectSnapTypes.Intersections | ObjectSnapTypes.Centers | ObjectSnapTypes.Nearest | ObjectSnapTypes.Perpendicular;
            XYZ p1, p2;
            try
            {
                p1 = uidoc.Selection.PickPoint(snaps, "Ajouter une cote : 1er point (axe ou extrémité d'une tuyauterie) – Échap pour annuler");
                p2 = uidoc.Selection.PickPoint(snaps, "2e point de la cote alignée");
            }
            catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return null; }
            if (p1.DistanceTo(p2) < Compat.Pieds(1)) { message = "Les deux points sont confondus."; return null; }
            var a = PlusProche(uidoc, p1); var b = PlusProche(uidoc, p2);
            if (a == null || b == null) { message = "Aucune tuyauterie à moins de 500 mm d'un des points cliqués (dans le plan de la vue)."; return null; }
            var axe = LectureModele.P(p2) - LectureModele.P(p1);
            return (a, b, axe.Normalise(), axe.Longueur);
        }

        static Attache PlusProche(UIDocument uidoc, XYZ p)
        {
            var doc = uidoc.Document; var vue = uidoc.ActiveView;
            var n = vue.ViewDirection; var pm = LectureModele.P(p); var nm = new Point3(n.X, n.Y, n.Z).Normalise();
            double r = Compat.Pieds(1500), loin = Compat.Pieds(100000);
            var ext = new XYZ(Math.Abs(n.X) > 0.9 ? loin : r, Math.Abs(n.Y) > 0.9 ? loin : r, Math.Abs(n.Z) > 0.9 ? loin : r);
            var zone = new BoundingBoxIntersectsFilter(new Outline(p - ext, p + ext));
            Attache meilleur = null; double dmin = 500;
            foreach (var e in new FilteredElementCollector(doc, vue.Id).WherePasses(zone).WhereElementIsNotElementType().Where(Reseau))
            {
                var c = Analyse(doc, e);
                foreach (var a in CoteAjoutee.Attaches(c))
                {
                    var w = a.Point - pm; var dans = w - nm * w.Dot(nm);
                    var d = dans.Longueur + (a.Code == "axe" ? 0 : 0.5);
                    if (d < dmin) { dmin = d; meilleur = new Attache { Element = e, Composant = c, Code = a.Code, Point = a.Point }; }
                }
            }
            return meilleur;
        }
    }
}
