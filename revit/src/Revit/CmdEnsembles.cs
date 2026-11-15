// Commande « Ensembles spools » : regroupe les spools en ensembles de montage (zones géographiques), par exemple
// « Ensemble A » = spools 1 à 10. L'ensemble est écrit dans le paramètre « Ensemble de spools » de tous les éléments du
// spool ; il sert aux vues de repérage (une vue par ensemble) et figure sur les isométries.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using PipeFit.Isometries.Core;
using Point = System.Drawing.Point;
using Size = System.Drawing.Size;
using Font = System.Drawing.Font;
using Form = System.Windows.Forms.Form;
using Control = System.Windows.Forms.Control;
using TaskDialog = Autodesk.Revit.UI.TaskDialog;
using TextBox = System.Windows.Forms.TextBox;
using ComboBox = System.Windows.Forms.ComboBox;

namespace PipeFit.Isometries.Revit
{
    sealed class InfoSpool
    {
        public string Nom = "", Systeme = "", Ensemble = "";
        public List<Element> Elements = new List<Element>();
        public override string ToString() => Nom + "    " + Systeme + (Ensemble != "" ? "    · " + Ensemble : "");
    }

    [Transaction(TransactionMode.Manual)]
    public sealed class CmdEnsembles : IExternalCommand
    {
        public Result Execute(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            var tous = LectureModele.ElementsTuyauterie(doc);
            var r = Reglages.Charger();
            var param = CmdIsometries.ParametreSpool(r, tous);
            var groupes = string.IsNullOrEmpty(param) ? new Dictionary<string, List<Element>>() : LectureModele.ParSpool(tous, param, out _);
            if (groupes.Count == 0) { TaskDialog.Show("Pipe-Fit", "Aucun spool numéroté : numérotez d'abord la tuyauterie (« Numéroter spools »)."); return Result.Cancelled; }

            string Freq(IEnumerable<string> v) => v.Where(x => !string.IsNullOrWhiteSpace(x)).GroupBy(x => x.Trim()).OrderByDescending(g => g.Count()).Select(g => g.Key).FirstOrDefault() ?? "";
            var infos = groupes.OrderBy(g => g.Key, Comparer<string>.Create(AnalyseSpool.ComparerNaturel)).Select(g => new InfoSpool
            {
                Nom = g.Key, Elements = g.Value,
                Systeme = Freq(g.Value.Select(e => e.get_Parameter(BuiltInParameter.RBS_SYSTEM_NAME_PARAM)?.AsString())),
                Ensemble = Freq(g.Value.Select(e => e.LookupParameter(ParametreSpool.NomEnsemble)?.AsString())),
            }).ToList();
            var selection = new HashSet<string>(uidoc.Selection.GetElementIds().Select(id => doc.GetElement(id))
                .Where(e => e != null).Select(e => LectureModele.ValeurSpool(e, param)).Where(v => v != ""));

            var journal = new List<string>();
            // Affectation immédiate (une transaction par clic sur « Affecter »)
            string Affecter(string ensemble, List<InfoSpool> choix)
            {
                int ecrits = 0, refus = 0;
                using (var t = new Transaction(doc, "Pipe-Fit : ensemble " + (ensemble != "" ? ensemble : "retiré")))
                {
                    t.Start();
                    ParametreSpool.CreerEnsemble(doc, data.Application.Application);
                    doc.Regenerate();
                    foreach (var s in choix)
                    {
                        foreach (var e in s.Elements)
                        {
                            var p = e.LookupParameter(ParametreSpool.NomEnsemble);
                            if (p != null && !p.IsReadOnly && p.Set(ensemble)) ecrits++; else refus++;
                        }
                        s.Ensemble = ensemble;
                    }
                    t.Commit();
                }
                var ligne = (ensemble != "" ? ensemble + " : " : "Sans ensemble : ") + string.Join(", ", choix.Select(s => s.Nom));
                journal.Add(ligne);
                return refus > 0 ? refus + " élément(s) sans le paramètre (catégorie non liée)." : "";
            }

            using (var f = new FenetreEnsembles(infos, selection, Affecter))
                f.ShowDialog(new FenetreRevit(data.Application.MainWindowHandle));

            if (journal.Count > 0)
                new TaskDialog("Pipe-Fit – Ensembles")
                {
                    MainInstruction = journal.Count + " affectation(s)",
                    MainContent = string.Join("\n", journal) + "\n\nVues par ensemble : « Repérage spools », une vue par ensemble.",
                }.Show();
            return journal.Count > 0 ? Result.Succeeded : Result.Cancelled;
        }
    }

    sealed class FenetreEnsembles : Form
    {
        readonly List<InfoSpool> infos;
        readonly Func<string, List<InfoSpool>, string> affecter;
        readonly CheckedListBox liste = new CheckedListBox { CheckOnClick = true, IntegralHeight = false, Font = new Font("Consolas", 9.5f) };
        readonly TextBox tbFiltre = new TextBox(), tbDu = new TextBox(), tbAu = new TextBox();
        readonly ComboBox cbEnsemble = new ComboBox { DropDownStyle = ComboBoxStyle.DropDown };
        readonly Label lblCompte = new Label { AutoSize = false }, lblInfo = new Label { AutoSize = false, ForeColor = SystemColors.GrayText };
        readonly HashSet<string> coches = new HashSet<string>();
        bool remplissage;

        public FenetreEnsembles(List<InfoSpool> infos, HashSet<string> selection, Func<string, List<InfoSpool>, string> affecter)
        {
            this.infos = infos; this.affecter = affecter;
            Text = "Pipe-Fit – Ensembles de spools (zones de montage)";
            Font = new Font("Segoe UI", 9f);
            AutoScaleMode = AutoScaleMode.Dpi;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(720, 520);

            Controls.Add(new Label { Text = "Spools (numéro, système, ensemble actuel) :", Location = new Point(14, 12), AutoSize = true });
            tbFiltre.SetBounds(14, 34, 400, 24);
            liste.SetBounds(14, 62, 400, 400);
            var btTout = new Button { Text = "Tout" }; btTout.SetBounds(14, 468, 70, 28);
            var btAucun = new Button { Text = "Aucun" }; btAucun.SetBounds(90, 468, 70, 28);
            var btSel = new Button { Text = "Sélection Revit", Enabled = selection.Count > 0 }; btSel.SetBounds(166, 468, 120, 28);
            lblCompte.SetBounds(296, 474, 120, 20);
            Controls.AddRange(new Control[] { tbFiltre, liste, btTout, btAucun, btSel, lblCompte });

            var gPlage = new GroupBox { Text = "Cocher une plage", Location = new Point(430, 30), Size = new Size(276, 96) };
            gPlage.Controls.Add(new Label { Text = "du", Location = new Point(12, 28), AutoSize = true });
            tbDu.SetBounds(40, 25, 90, 24);
            gPlage.Controls.Add(new Label { Text = "au", Location = new Point(140, 28), AutoSize = true });
            tbAu.SetBounds(166, 25, 96, 24);
            var btPlage = new Button { Text = "Cocher la plage" }; btPlage.SetBounds(12, 56, 250, 28);
            gPlage.Controls.AddRange(new Control[] { tbDu, tbAu, btPlage });
            Controls.Add(gPlage);

            var gEns = new GroupBox { Text = "Ensemble des spools cochés", Location = new Point(430, 138), Size = new Size(276, 150) };
            gEns.Controls.Add(new Label { Text = "Nom :", Location = new Point(12, 30), AutoSize = true });
            cbEnsemble.SetBounds(60, 27, 202, 24);
            var btAffecter = new Button { Text = "Affecter" }; btAffecter.SetBounds(12, 64, 250, 30);
            var btRetirer = new Button { Text = "Retirer de leur ensemble" }; btRetirer.SetBounds(12, 102, 250, 30);
            gEns.Controls.AddRange(new Control[] { cbEnsemble, btAffecter, btRetirer });
            Controls.Add(gEns);

            lblInfo.SetBounds(430, 300, 276, 120);
            lblInfo.Text = "Exemple : cochez la plage SP-001 à SP-010, nommez « Ensemble A », Affecter ; puis la plage suivante en « Ensemble B ». "
                + "L'affectation est enregistrée aussitôt (annulable avec Ctrl+Z après fermeture).";
            Controls.Add(lblInfo);
            var btFermer = new Button { Text = "Fermer", DialogResult = DialogResult.OK }; btFermer.SetBounds(614, 476, 92, 30);
            Controls.Add(btFermer);
            CancelButton = btFermer;

            if (infos.Count > 0) { tbDu.Text = infos[0].Nom; tbAu.Text = infos[Math.Min(9, infos.Count - 1)].Nom; }
            foreach (var s in selection) coches.Add(s);
            MajEnsembles();
            Afficher();

            tbFiltre.TextChanged += (s, e) => Afficher();
            liste.ItemCheck += (s, e) =>
            {
                if (remplissage) return;
                var nom = ((InfoSpool)liste.Items[e.Index]).Nom;
                if (e.NewValue == CheckState.Checked) coches.Add(nom); else coches.Remove(nom);
                BeginInvoke(new Action(Compter));
            };
            btTout.Click += (s, e) => { foreach (InfoSpool i in liste.Items) coches.Add(i.Nom); Afficher(); };
            btAucun.Click += (s, e) => { coches.Clear(); Afficher(); };
            btSel.Click += (s, e) => { coches.Clear(); foreach (var n in selection) coches.Add(n); Afficher(); };
            btPlage.Click += (s, e) =>
            {
                string du = tbDu.Text.Trim(), au = tbAu.Text.Trim();
                foreach (var i in infos)
                    if ((du == "" || AnalyseSpool.ComparerNaturel(du, i.Nom) <= 0) && (au == "" || AnalyseSpool.ComparerNaturel(i.Nom, au) <= 0)) coches.Add(i.Nom);
                Afficher();
            };
            btAffecter.Click += (s, e) => Appliquer(cbEnsemble.Text.Trim());
            btRetirer.Click += (s, e) => Appliquer("");
        }

        void Appliquer(string ensemble)
        {
            var choix = infos.Where(i => coches.Contains(i.Nom)).ToList();
            if (choix.Count == 0) { MessageBox.Show(this, "Cochez au moins un spool.", Text); return; }
            if (ensemble == "" && !choix.Any(i => i.Ensemble != "")) return;
            var avert = affecter(ensemble, choix);
            if (avert != "") MessageBox.Show(this, avert, Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            coches.Clear();
            MajEnsembles();
            Afficher();
        }

        /// <summary>Ensembles existants dans la liste, et le suivant proposé (Ensemble A, B, C…).</summary>
        void MajEnsembles()
        {
            var existants = infos.Select(i => i.Ensemble).Where(x => x != "").Distinct().OrderBy(x => x, Comparer<string>.Create(AnalyseSpool.ComparerNaturel)).ToList();
            cbEnsemble.Items.Clear();
            cbEnsemble.Items.AddRange(existants.Cast<object>().ToArray());
            var lettre = Enumerable.Range(0, 26).Select(i => "Ensemble " + (char)('A' + i)).FirstOrDefault(x => !existants.Contains(x)) ?? "";
            cbEnsemble.Text = lettre;
        }

        void Afficher()
        {
            remplissage = true;
            liste.BeginUpdate();
            liste.Items.Clear();
            var f = AnalyseSpool.Normaliser(tbFiltre.Text);
            foreach (var i in infos)
            {
                if (f != "" && !AnalyseSpool.Normaliser(i.ToString()).Contains(f)) continue;
                liste.Items.Add(i, coches.Contains(i.Nom));
            }
            liste.EndUpdate();
            remplissage = false;
            Compter();
        }

        void Compter() => lblCompte.Text = coches.Count + " / " + infos.Count + " coché(s)";
    }
}
