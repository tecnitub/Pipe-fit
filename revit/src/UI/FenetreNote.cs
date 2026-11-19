// Fenêtre « Note de calcul » : cartouche (titre, projet, affaire, indice, date, société, rédacteur, vérificateur),
// objet, hypothèses et conclusion pré-remplis et modifiables ; exports PDF et Excel. Société, rédacteur, vérificateur
// et affaire sont mémorisés (%AppData%\PipeFit\Note de calcul.ini).
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using PipeFit.Isometries.Core;

namespace PipeFit.Isometries.Revit
{
    sealed class FenetreNote : Form
    {
        readonly NoteCalcul note;
        readonly TextBox tbTitre = new TextBox(), tbProjet = new TextBox(), tbAffaire = new TextBox(), tbIndice = new TextBox(), tbSociete = new TextBox(),
            tbRedacteur = new TextBox(), tbVerificateur = new TextBox();
        readonly DateTimePicker dtDate = new DateTimePicker { Format = DateTimePickerFormat.Short };
        readonly TextBox tbObjet = new TextBox { Multiline = true, ScrollBars = ScrollBars.Vertical };
        readonly TextBox tbHyp = new TextBox { Multiline = true, ScrollBars = ScrollBars.Vertical, AcceptsReturn = true };
        readonly TextBox tbConclusion = new TextBox { Multiline = true, ScrollBars = ScrollBars.Vertical, AcceptsReturn = true };

        static string Fichier => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PipeFit", "Note de calcul.ini");

        static Dictionary<string, string> Lire()
        {
            var d = new Dictionary<string, string>();
            try { if (File.Exists(Fichier)) foreach (var l in File.ReadAllLines(Fichier, Encoding.UTF8)) { var i = l.IndexOf('='); if (i > 0) d[l.Substring(0, i)] = l.Substring(i + 1); } } catch { }
            return d;
        }

        public FenetreNote(NoteCalcul note)
        {
            this.note = note;
            Text = "Pipe-Fit – Note de calcul";
            Font = new Font("Segoe UI", 9f);
            Ergonomie.Preparer(this);
            StartPosition = FormStartPosition.CenterParent;
            MinimizeBox = false;
            ClientSize = new Size(820, 660);
            var memo = Lire();
            string M(string k, string defaut) => memo.TryGetValue(k, out var v) && v != "" ? v : defaut;
            tbTitre.Text = note.Titre; tbProjet.Text = note.Projet; tbAffaire.Text = M("Affaire", note.Affaire); tbIndice.Text = note.Indice;
            tbSociete.Text = M("Societe", note.Societe); tbRedacteur.Text = M("Redacteur", note.Redacteur); tbVerificateur.Text = M("Verificateur", note.Verificateur);
            dtDate.Value = note.Date;
            tbObjet.Text = note.Objet;
            tbHyp.Text = string.Join(Environment.NewLine, note.Hypotheses);
            tbConclusion.Text = note.Conclusion != "" ? note.Conclusion : note.ConclusionProposee();

            int y = 12;
            void Champ(string lib, Control c, int x, int lx, int w)
            {
                Controls.Add(new Label { Text = lib, Location = new Point(x, y + 3), Size = new Size(lx, 20) });
                c.SetBounds(x + lx, y, w, 24); Controls.Add(c);
            }
            Champ("Titre :", tbTitre, 12, 90, 706); y += 30;
            Champ("Projet :", tbProjet, 12, 90, 330); Champ("Affaire n° :", tbAffaire, 450, 80, 120); Champ("Indice :", tbIndice, 668, 50, 40); y += 30;
            Champ("Société :", tbSociete, 12, 90, 200); Champ("Date :", dtDate, 320, 50, 110); y += 30;
            Champ("Rédigé par :", tbRedacteur, 12, 90, 250); Champ("Vérifié par :", tbVerificateur, 370, 90, 250); y += 34;
            Controls.Add(new Label { Text = "Objet de la note :", Location = new Point(12, y), Size = new Size(300, 20) }); y += 22;
            tbObjet.SetBounds(12, y, 796, 52); Controls.Add(tbObjet); y += 60;
            Controls.Add(new Label { Text = "Hypothèses (une par ligne ; le fluide et la méthode de calcul sont ajoutés automatiquement) :", Location = new Point(12, y), Size = new Size(700, 20) }); y += 22;
            tbHyp.SetBounds(12, y, 796, 130); Controls.Add(tbHyp); y += 138;
            Controls.Add(new Label { Text = "Conclusion (proposée d'après les résultats, modifiable) :", Location = new Point(12, y), Size = new Size(500, 20) });
            var reprop = new LinkLabel { Text = "reprendre la conclusion proposée", Location = new Point(520, y), Size = new Size(288, 20), TextAlign = ContentAlignment.TopRight };
            reprop.LinkClicked += (s, e) => tbConclusion.Text = note.ConclusionProposee();
            Controls.Add(reprop); y += 22;
            tbConclusion.SetBounds(12, y, 796, 110); Controls.Add(tbConclusion);

            var pdf = new Button { Text = "Exporter en PDF…" }; pdf.SetBounds(ClientSize.Width - 470, ClientSize.Height - 44, 160, 32);
            var xl = new Button { Text = "Exporter vers Excel…" }; xl.SetBounds(ClientSize.Width - 300, ClientSize.Height - 44, 170, 32);
            var fermer = new Button { Text = "Fermer", DialogResult = DialogResult.OK }; fermer.SetBounds(ClientSize.Width - 120, ClientSize.Height - 44, 108, 32);
            Controls.AddRange(new Control[] { pdf, xl, fermer });
            CancelButton = fermer;
            pdf.Click += (s, e) => Exporter(true);
            xl.Click += (s, e) => Exporter(false);
        }

        void Appliquer()
        {
            note.Titre = tbTitre.Text.Trim(); note.Projet = tbProjet.Text.Trim(); note.Affaire = tbAffaire.Text.Trim(); note.Indice = tbIndice.Text.Trim();
            note.Societe = tbSociete.Text.Trim(); note.Redacteur = tbRedacteur.Text.Trim(); note.Verificateur = tbVerificateur.Text.Trim(); note.Date = dtDate.Value.Date;
            note.Objet = tbObjet.Text.Trim();
            note.Hypotheses = tbHyp.Lines.Select(l => l.Trim()).Where(l => l != "").ToList();
            note.Conclusion = tbConclusion.Text.Trim();
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(Fichier));
                File.WriteAllLines(Fichier, new[] { "Societe=" + note.Societe, "Redacteur=" + note.Redacteur, "Verificateur=" + note.Verificateur, "Affaire=" + note.Affaire }, Encoding.UTF8);
            }
            catch { }
        }

        void Exporter(bool pdf)
        {
            Appliquer();
            var nom = string.Concat((note.Titre + (note.Affaire != "" ? " " + note.Affaire : "") + " ind " + note.Indice).Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
            using (var dlg = new SaveFileDialog { Title = "Note de calcul", Filter = pdf ? "Document PDF (*.pdf)|*.pdf" : "Classeur Excel (*.xlsx)|*.xlsx", FileName = nom + (pdf ? ".pdf" : ".xlsx") })
            {
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                try
                {
                    File.WriteAllBytes(dlg.FileName, pdf ? note.Pdf() : note.Excel());
                    try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(dlg.FileName) { UseShellExecute = true }); } catch { }
                }
                catch (Exception ex) { MessageBox.Show(this, "Écriture impossible (fichier déjà ouvert ?) : " + ex.Message, "Pipe-Fit"); }
            }
        }
    }
}
