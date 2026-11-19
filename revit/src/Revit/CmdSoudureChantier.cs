// Commande « Soudure chantier » : marque un joint comme soudure de chantier (coupe pour le transport, incertitude de
// cote), avec une surlongueur à recouper sur place. Cliquer près du joint sur un élément (ou cliquer l'élément puis
// celui d'en face) ; cliquer à nouveau un joint marqué retire la marque. Échap pour terminer.
// Si les deux côtés portaient le même numéro de spool, la plus petite partie reçoit le numéro suivant.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;

using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using PipeFit.Isometries.Core;
using TaskDialog = Autodesk.Revit.UI.TaskDialog;
using Point = System.Drawing.Point;
using Size = System.Drawing.Size;
using Font = System.Drawing.Font;

namespace PipeFit.Isometries.Revit
{
    [Transaction(TransactionMode.Manual)]
    public sealed class CmdSoudureChantier : CommandeBase
    {
        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            var r = Reglages.Charger();

            // Surlongueur des joints marqués pendant cette commande
            double surl;
            using (var f = new FenetreSurlongueur(r.SurlongueurMarqueMm))
            {
                if (f.ShowDialog(new FenetreRevit(data.Application.MainWindowHandle)) != DialogResult.OK) return Result.Cancelled;
                surl = f.Valeur;
            }
            r.SurlongueurMarqueMm = surl;
            r.Enregistrer();

            var tous = LectureModele.ElementsTuyauterie(doc);
            var param = CmdIsometries.ParametreSpool(r, tous);
            var journal = new List<string>();
            var filtre = new FiltreTuyauterie();

            while (true)
            {
                Reference ref1;
                try { ref1 = uidoc.Selection.PickObject(ObjectType.Element, filtre, "Soudure chantier : cliquez un élément près du joint (Échap pour terminer)"); }
                catch (Autodesk.Revit.Exceptions.OperationCanceledException) { break; }
                var e1 = doc.GetElement(ref1);
                var cn1 = ConnecteurProche(e1, ref1.GlobalPoint);
                if (cn1 == null || Voisin(cn1) == null)
                {
                    // Pas de point cliqué exploitable : on demande l'élément d'en face
                    Reference ref2;
                    try { ref2 = uidoc.Selection.PickObject(ObjectType.Element, filtre, "Cliquez l'élément de l'autre côté du joint"); }
                    catch (Autodesk.Revit.Exceptions.OperationCanceledException) { break; }
                    var e2 = doc.GetElement(ref2);
                    cn1 = LectureModele.Connecteurs(e1).FirstOrDefault(c => Voisin(c)?.Owner.Id == e2.Id);
                    if (cn1 == null) { TaskDialog.Show("Pipe-Fit", "Ces deux éléments ne sont pas raccordés l'un à l'autre."); continue; }
                }
                else if (ref1.GlobalPoint != null && ref1.GlobalPoint.DistanceTo(cn1.Origin) > Compat.Pieds(400))
                {
                    TaskDialog.Show("Pipe-Fit", "Le clic est loin d'un joint. Pour une soudure au milieu d'un tube, divisez d'abord le tube à cet endroit "
                        + "(Modifier → Diviser l'élément), puis cliquez près de la coupe.");
                    continue;
                }
                var cn2 = Voisin(cn1);
                var e2b = cn2.Owner;

                using (var t = new Transaction(doc, "Pipe-Fit : soudure chantier"))
                {
                    t.Start();
                    ParametreSpool.CreerSoudures(doc, data.Application.Application);
                    doc.Regenerate();
                    var m1 = ParametreSpool.Marques(e1);
                    var m2 = ParametreSpool.Marques(e2b);
                    string action;
                    if (m1.ContainsKey(cn1.Id) || m2.ContainsKey(cn2.Id))
                    {
                        m1.Remove(cn1.Id); m2.Remove(cn2.Id);
                        action = "retirée";
                    }
                    else
                    {
                        m1[cn1.Id] = surl; m2[cn2.Id] = surl;
                        action = "ajoutée" + (surl > 0 ? " (surlongueur " + surl.ToString("0") + " mm)" : "");
                    }
                    if (!ParametreSpool.Ecrire(e1, m1) | !ParametreSpool.Ecrire(e2b, m2))
                    {
                        t.RollBack();
                        TaskDialog.Show("Pipe-Fit", "Impossible d'enregistrer la marque sur ces éléments (catégorie sans le paramètre « " + ParametreSpool.NomSoudures + " »).");
                        continue;
                    }
                    doc.Regenerate();
                    var renum = action.StartsWith("ajoutée") ? Recouper(doc, tous, param, e1, e2b) : "";
                    t.Commit();
                    journal.Add("Joint " + Nom(e1) + " / " + Nom(e2b) + " : soudure chantier " + action + renum);
                }
            }

            if (journal.Count > 0)
                new TaskDialog("Pipe-Fit – Soudures chantier")
                {
                    MainInstruction = journal.Count + " joint(s) modifié(s)",
                    MainContent = string.Join(Environment.NewLine, journal) + Environment.NewLine + Environment.NewLine
                        + "Régénérez les isométries des spools concernés (« Isométries spools ») : la soudure y apparaît en R…, "
                        + "la surlongueur dans la liste de débit.",
                }.Show();
            return Result.Succeeded;
        }

        static Connector ConnecteurProche(Element e, XYZ point)
        {
            var liste = LectureModele.Connecteurs(e).Where(c => Voisin(c) != null).ToList();
            if (liste.Count == 0) return null;
            if (point == null) return liste.Count == 1 ? liste[0] : null;
            return liste.OrderBy(c => c.Origin.DistanceTo(point)).First();
        }

        static Connector Voisin(Connector c)
        {
            foreach (Connector r in c.AllRefs)
            {
                if (r.Owner == null || r.Owner.Id == c.Owner.Id || r.Owner is MEPSystem) continue;
                if ((r.ConnectorType & ConnectorType.Physical) == 0) continue;
                if (!LectureModele.Connecteurs(r.Owner).Any()) continue;
                return r;
            }
            return null;
        }

        static string Nom(Element e) => (e.Document.GetElement(e.GetTypeId()) as ElementType)?.FamilyName + " " + Compat.Cle(e.Id);

        /// <summary>Même numéro de spool des deux côtés : la plus petite partie, séparée par la marque, prend le numéro suivant.</summary>
        static string Recouper(Document doc, List<Element> tous, string param, Element e1, Element e2)
        {
            if (string.IsNullOrEmpty(param)) return "";
            var num = LectureModele.ValeurSpool(e1, param);
            if (num == "" || num != LectureModele.ValeurSpool(e2, param)) return "";
            var memes = tous.Where(e => LectureModele.ValeurSpool(e, param) == num).ToList();
            var comps = memes.Select(e => LectureModele.Lire(doc, e)).ToList();
            var cote2 = Decoupage.Etendre(comps, new[] { Compat.Cle(e2.Id) });
            if (cote2.Count == comps.Count) return ""; // la ligne fait une boucle : pas de coupure
            var cote1 = Decoupage.Etendre(comps, new[] { Compat.Cle(e1.Id) });
            var petit = cote2.Count <= cote1.Count ? cote2 : cote1;

            var m = Regex.Match(num, @"^(.*?)(\d+)$");
            var prefixe = m.Success ? m.Groups[1].Value : num + "-";
            var chiffres = m.Success ? m.Groups[2].Value.Length : 2;
            var nouveau = Decoupage.Format(prefixe, Decoupage.Prochain(tous.Select(e => LectureModele.ValeurSpool(e, param)), prefixe), chiffres);
            int n = 0;
            foreach (var e in memes.Where(x => petit.Contains(Compat.Cle(x.Id))))
            {
                var p = e.LookupParameter(param);
                if (p != null && !p.IsReadOnly && p.StorageType == StorageType.String && p.Set(nouveau)) n++;
            }
            return " ; spool " + num + " coupé : " + n + " élément(s) → " + nouveau;
        }
    }

    /// <summary>Petite fenêtre : surlongueur à recouper sur place des joints marqués.</summary>
    sealed class FenetreSurlongueur : System.Windows.Forms.Form
    {
        readonly NumericUpDown nud = new NumericUpDown { Minimum = 0, Maximum = 2000, Increment = 50 };
        public double Valeur => (double)nud.Value;

        public FenetreSurlongueur(double defaut)
        {
            Text = "Pipe-Fit – Soudure chantier";
            Font = new Font("Segoe UI", 9f);
            Ergonomie.Preparer(this);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(460, 170);
            Controls.Add(new Label
            {
                Text = "Cliquez ensuite, dans la vue, près de chaque joint à souder sur chantier (transport, incertitude de cote). "
                    + "Un joint déjà marqué est démarqué. Échap pour terminer.",
                Location = new Point(14, 12), Size = new Size(432, 48),
            });
            Controls.Add(new Label { Text = "Surlongueur à recouper sur place :", Location = new Point(14, 75), AutoSize = true });
            nud.SetBounds(226, 72, 70, 24);
            nud.Value = (decimal)Math.Max(0, Math.Min(2000, defaut));
            Controls.Add(nud);
            Controls.Add(new Label { Text = "mm sur le tube", Location = new Point(302, 75), AutoSize = true });
            var ok = new Button { Text = "Commencer", DialogResult = DialogResult.OK };
            ok.SetBounds(254, 124, 100, 30);
            var annuler = new Button { Text = "Annuler", DialogResult = DialogResult.Cancel };
            annuler.SetBounds(362, 124, 84, 30);
            Controls.AddRange(new System.Windows.Forms.Control[] { ok, annuler });
            AcceptButton = ok; CancelButton = annuler;
        }
    }
}
