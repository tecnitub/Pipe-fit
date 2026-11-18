// Commande « Ajouter une cote » : une cote que la cotation automatique n'a pas faite. On clique deux éléments ; chaque
// clic s'accroche au point d'attache le plus proche (axe d'un coude, d'un té, d'un piquage, axe d'une vanne, face de
// bride, bout de tube ; y compris la vanne ou la bride voisine masquée dans la vue d'isométrie). La valeur n'est jamais
// saisie : elle est recalculée sur la géométrie à chaque génération. Recliquer les deux mêmes points retire la cote.
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
    [Transaction(TransactionMode.Manual)]
    public sealed class CmdCote : CommandeBase
    {
        sealed class Choix
        {
            public Element Element;
            public Composant Composant;
            public string Code;
            public Point3 Point;
            public NatureNoeud Nature;
            public string Texte => (Composant.Designation != "" ? Composant.Designation : Composant.Famille) + " (" + Compat.Cle(Element.Id) + ") – "
                + (Nature == NatureNoeud.Axe ? "axe" : Nature == NatureNoeud.Bride ? "face de bride" : "extrémité");
        }

        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            if (uidoc.ActiveView is ViewSheet)
            {
                TaskDialog.Show("Pipe-Fit – Ajouter une cote", "Ouvrez la vue 3D de l'isométrie (ou une vue de la maquette) : les points se cliquent sur la tuyauterie, "
                    + "pas sur la feuille. Astuce : double-cliquez la vue sur la feuille, ou ouvrez « ISO … » dans l'arborescence.");
                return Result.Cancelled;
            }
            var filtre = new FiltreTuyauterie();
            var journal = new List<string>();

            while (true)
            {
                var a = Choisir(uidoc, filtre, "Ajouter une cote : cliquez le 1er point (près de l'axe du raccord, de la vanne, de la bride ou du bout de tube) – Échap pour terminer");
                if (a == null) break;
                var b = Choisir(uidoc, filtre, "Cliquez le 2e point de la cote (" + a.Texte + " choisi)");
                if (b == null) break;
                if (a.Element.Id == b.Element.Id && a.Code == b.Code) { TaskDialog.Show("Pipe-Fit", "Les deux clics donnent le même point d'attache."); continue; }
                var valeur = a.Point.Distance(b.Point);
                if (valeur < 1) { TaskDialog.Show("Pipe-Fit", "Les deux points sont confondus."); continue; }

                string action;
                using (var t = new Transaction(doc, "Pipe-Fit : cote ajoutée"))
                {
                    t.Start();
                    ParametreSpool.CreerCotes(doc, data.Application.Application);
                    doc.Regenerate();
                    var nouvelle = new CoteAjoutee { AttacheA = a.Code, IdB = Compat.Cle(b.Element.Id), AttacheB = b.Code, PositionB = b.Point };
                    var inverse = new CoteAjoutee { AttacheA = b.Code, IdB = Compat.Cle(a.Element.Id), AttacheB = a.Code };
                    var ca = ParametreSpool.Cotes(a.Element);
                    var cb = ParametreSpool.Cotes(b.Element);
                    bool ok;
                    if (ca.Any(nouvelle.Meme) || cb.Any(inverse.Meme))
                    {
                        // Même cote recliquée : retirée
                        ca.RemoveAll(nouvelle.Meme); cb.RemoveAll(inverse.Meme);
                        ok = ParametreSpool.EcrireCotes(a.Element, ca) & ParametreSpool.EcrireCotes(b.Element, cb);
                        action = "retirée";
                    }
                    else
                    {
                        ca.Add(nouvelle);
                        ok = ParametreSpool.EcrireCotes(a.Element, ca);
                        action = "ajoutée";
                    }
                    if (!ok)
                    {
                        t.RollBack();
                        TaskDialog.Show("Pipe-Fit", "Impossible d'enregistrer la cote sur cet élément (catégorie sans le paramètre « " + ParametreSpool.NomCotes + " »).");
                        continue;
                    }
                    t.Commit();
                }
                var ligne = Math.Round(valeur).ToString("0") + " mm : " + a.Texte + " → " + b.Texte;
                journal.Add("Cote " + action + " : " + ligne);
                Journal.Ecrire("Cote " + action + " : " + ligne);
                TaskDialog.Show("Pipe-Fit – Cote", "Cote " + action + " : " + ligne + Environment.NewLine + Environment.NewLine
                    + "Continuez avec la cote suivante, ou Échap pour terminer.");
            }

            if (journal.Count > 0)
                new TaskDialog("Pipe-Fit – Cotes ajoutées")
                {
                    MainInstruction = journal.Count + " cote(s) modifiée(s)",
                    MainContent = string.Join(Environment.NewLine, journal) + Environment.NewLine + Environment.NewLine
                        + "Régénérez l'isométrie du spool (« Isométries spools » ou « Générer un spool ») : la cote y est dessinée avec sa valeur "
                        + "recalculée. Elle figure sur l'isométrie du spool du 1er point cliqué.",
                }.Show();
            return Result.Succeeded;
        }

        /// <summary>
        /// Un clic : point d'attache le plus proche parmi ceux de l'élément cliqué et de ses voisins vanne / bride / accessoire
        /// (masqués dans la vue d'isométrie, remplacés par leur symbole).
        /// </summary>
        static Choix Choisir(UIDocument uidoc, ISelectionFilter filtre, string invite)
        {
            Reference r;
            try { r = uidoc.Selection.PickObject(ObjectType.Element, filtre, invite); }
            catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return null; }
            var doc = uidoc.Document;
            var e = doc.GetElement(r);
            Point3? clic = r.GlobalPoint != null ? LectureModele.P(r.GlobalPoint) : (Point3?)null;
            var candidats = new List<(Element E, Composant C)>();
            var c = LectureModele.Lire(doc, e);
            AnalyseSeule(c);
            candidats.Add((e, c));
            foreach (var x in c.Extremites.Where(x => x.ConnecteA != null))
            {
                Element v;
                try { v = doc.GetElement(Compat.IdDepuis(x.ConnecteA)); } catch { continue; }
                if (v == null) continue;
                var cv = LectureModele.Lire(doc, v);
                AnalyseSeule(cv);
                if (cv.Type == TypeComposant.Vanne || cv.Type == TypeComposant.Accessoire || cv.Type == TypeComposant.Bride) candidats.Add((v, cv));
            }
            Choix meilleur = null; double dmin = double.MaxValue;
            foreach (var (el, comp) in candidats)
                foreach (var at in CoteAjoutee.Attaches(comp))
                {
                    var d = clic.HasValue ? at.Point.Distance(clic.Value) : (el == e ? 0 : 1);
                    // À distance égale, l'élément cliqué passe avant son voisin, et l'axe avant les extrémités
                    d += (el == e ? 0 : 0.5) + (at.Code == "axe" ? 0 : 0.1);
                    if (d < dmin) { dmin = d; meilleur = new Choix { Element = el, Composant = comp, Code = at.Code, Point = at.Point, Nature = at.Nature }; }
                }
            return meilleur;
        }

        /// <summary>Type, genre et désignation d'un élément lu seul (hors spool).</summary>
        static void AnalyseSeule(Composant c)
        {
            var s = new Spool { Nom = "" };
            s.Composants.Add(c);
            try { AnalyseSpool.Analyser(s); } catch { }
        }
    }
}
