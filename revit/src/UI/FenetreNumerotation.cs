// Fenêtre « Numéroter les spools » : paramètre, mode (sélection ou découpage automatique), format du numéro, aperçu.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using PipeFit.Isometries.Core;

namespace PipeFit.Isometries.Revit
{
    sealed class FenetreNumerotation : Form
    {
        public string Parametre => cbParam.SelectedItem as string ?? "";
        public string Numero => tbNumero.Text.Trim();

        readonly Reglages r;
        readonly Func<Reglages, string, string> suggerer;
        readonly Func<Reglages, string, string, PlanNumerotation> planifier;
        readonly ComboBox cbParam = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
        readonly RadioButton rbSel = new RadioButton { Text = "Les éléments sélectionnés forment un spool", AutoSize = false };
        readonly CheckBox ckCompleter = new CheckBox { Text = "Compléter jusqu'aux brides (tout ce qui leur est soudé)", AutoSize = false };
        readonly Label lblNumero = new Label { Text = "Numéro :", AutoSize = false };
        readonly TextBox tbNumero = new TextBox();
        readonly RadioButton rbAuto = new RadioButton { Text = "Découper automatiquement en spools aux brides et vannes", AutoSize = false };
        readonly Label lblPortee = new Label { AutoSize = false, ForeColor = SystemColors.GrayText };
        readonly TextBox tbPrefixe = new TextBox();
        readonly NumericUpDown nudChiffres = new NumericUpDown { Minimum = 1, Maximum = 6 };
        readonly CheckBox ckReseau = new CheckBox { Text = "Réseau devant le numéro (EG-101-SP-001)", AutoSize = false };
        readonly CheckBox ckRemplacer = new CheckBox { Text = "Renuméroter les éléments qui ont déjà un numéro", AutoSize = false };
        readonly Label lblApercu = new Label { AutoSize = false, Font = new Font("Segoe UI", 9f, FontStyle.Bold) };
        bool pret;

        public FenetreNumerotation(Reglages r, List<string> parametres, string defaut, int nbSelection,
            Func<Reglages, string, string> suggerer, Func<Reglages, string, string, PlanNumerotation> planifier)
        {
            this.r = r; this.suggerer = suggerer; this.planifier = planifier;
            Text = "Pipe-Fit – Numéroter les spools";
            Font = new Font("Segoe UI", 9f);
            AutoScaleMode = AutoScaleMode.Dpi;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(560, 470);

            int y = 14;
            Controls.Add(new Label { Text = "Paramètre du numéro de spool :", Location = new Point(14, y + 3), AutoSize = true });
            cbParam.SetBounds(210, y, 334, 24); Controls.Add(cbParam);
            y += 38;

            var gMode = new GroupBox { Text = "Quoi numéroter", Location = new Point(14, y), Size = new Size(530, 172) };
            rbSel.SetBounds(12, 22, 500, 22);
            ckCompleter.SetBounds(32, 46, 480, 22);
            lblNumero.SetBounds(32, 75, 70, 20);
            tbNumero.SetBounds(104, 72, 160, 24);
            rbAuto.SetBounds(12, 108, 500, 22);
            lblPortee.SetBounds(32, 132, 480, 32);
            gMode.Controls.AddRange(new Control[] { rbSel, ckCompleter, lblNumero, tbNumero, rbAuto, lblPortee });
            Controls.Add(gMode);
            y += 182;

            var gFormat = new GroupBox { Text = "Format du numéro", Location = new Point(14, y), Size = new Size(530, 112) };
            gFormat.Controls.Add(new Label { Text = "Préfixe :", Location = new Point(12, 27), AutoSize = true });
            tbPrefixe.SetBounds(80, 24, 90, 24);
            gFormat.Controls.Add(new Label { Text = "Chiffres :", Location = new Point(190, 27), AutoSize = true });
            nudChiffres.SetBounds(256, 24, 50, 24);
            ckReseau.SetBounds(12, 54, 500, 22);
            ckRemplacer.SetBounds(12, 80, 500, 22);
            gFormat.Controls.AddRange(new Control[] { tbPrefixe, nudChiffres, ckReseau, ckRemplacer });
            Controls.Add(gFormat);
            y += 122;

            lblApercu.SetBounds(14, y, 530, 40);
            Controls.Add(lblApercu);

            var ok = new Button { Text = "Numéroter", DialogResult = DialogResult.None };
            ok.SetBounds(ClientSize.Width - 214, ClientSize.Height - 42, 110, 30);
            var annuler = new Button { Text = "Annuler", DialogResult = DialogResult.Cancel };
            annuler.SetBounds(ClientSize.Width - 96, ClientSize.Height - 42, 82, 30);
            Controls.AddRange(new Control[] { ok, annuler });
            AcceptButton = ok; CancelButton = annuler;

            // Valeurs
            cbParam.Items.AddRange(parametres.Cast<object>().ToArray());
            cbParam.SelectedItem = parametres.Contains(defaut) ? defaut : parametres.FirstOrDefault();
            rbSel.Enabled = nbSelection > 0;
            rbSel.Text = nbSelection > 0 ? "Les " + nbSelection + " élément(s) sélectionné(s) forment un spool" : "Les éléments sélectionnés forment un spool (rien n'est sélectionné)";
            if (r.ModeNumerotation == 0 && nbSelection > 0) rbSel.Checked = true; else rbAuto.Checked = true;
            lblPortee.Text = nbSelection > 0 ? "Portée : les " + nbSelection + " élément(s) sélectionné(s)." : "Portée : toute la tuyauterie du projet.";
            ckCompleter.Checked = r.CompleterBrides;
            tbPrefixe.Text = r.PrefixeSpool;
            nudChiffres.Value = Math.Max(1, Math.Min(6, r.Chiffres));
            ckReseau.Checked = r.ParReseau;
            ckRemplacer.Checked = r.RemplacerNumeros;

            // Mise à jour de l'aperçu
            EventHandler maj = (s, e) => Maj(s == tbNumero);
            foreach (var c in new Control[] { cbParam, rbSel, rbAuto, ckCompleter, tbPrefixe, nudChiffres, ckReseau, ckRemplacer, tbNumero })
                switch (c)
                {
                    case ComboBox cb: cb.SelectedIndexChanged += maj; break;
                    case RadioButton rb: rb.CheckedChanged += maj; break;
                    case CheckBox ck: ck.CheckedChanged += maj; break;
                    case NumericUpDown nud: nud.ValueChanged += maj; break;
                    default: c.TextChanged += maj; break;
                }
            ok.Click += (s, e) =>
            {
                Lire();
                var plan = planifier(r, Parametre, Numero);
                if (plan.Erreur != "" || plan.Spools.Count == 0) { MessageBox.Show(this, plan.Apercu(), Text, MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
                DialogResult = DialogResult.OK;
            };
            pret = true;
            Maj(false);
        }

        void Lire()
        {
            r.ModeNumerotation = rbSel.Checked ? 0 : 1;
            r.CompleterBrides = ckCompleter.Checked;
            r.PrefixeSpool = tbPrefixe.Text.Trim();
            r.Chiffres = (int)nudChiffres.Value;
            r.ParReseau = ckReseau.Checked;
            r.RemplacerNumeros = ckRemplacer.Checked;
        }

        void Maj(bool saisieNumero)
        {
            if (!pret) return;
            Lire();
            ckCompleter.Enabled = lblNumero.Enabled = tbNumero.Enabled = rbSel.Checked;
            lblPortee.Enabled = rbAuto.Checked;
            // Numéro proposé : le prochain libre, tant que l'utilisateur ne l'a pas changé lui-même
            if (!saisieNumero && rbSel.Checked)
            {
                pret = false;
                tbNumero.Text = suggerer(r, Parametre);
                pret = true;
            }
            try { lblApercu.Text = planifier(r, Parametre, Numero).Apercu(); }
            catch (Exception ex) { lblApercu.Text = "Aperçu impossible : " + ex.Message; }
        }
    }
}
