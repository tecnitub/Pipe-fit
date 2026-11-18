// Fenêtre de calcul de perte de charge, commune aux tuyauteries (hydraulique) et aux gaines (aéraulique) :
// hypothèses (fluide, température, débit par défaut, vitesse maximale), tableau par élément (débit, ζ et perte fixe
// modifiables, recalcul immédiat), totaux, alertes en rouge, export Excel de la note de calcul. En ventilation, un
// petit outil de dimensionnement donne le Ø normalisé et la gaine rectangulaire pour un débit et une vitesse visée.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using PipeFit.Isometries.Core;

namespace PipeFit.Isometries.Revit
{
    sealed class FenetreCalcul : Form
    {
        static readonly CultureInfo Fr = CultureInfo.GetCultureInfo("fr-FR");
        readonly bool air;
        readonly List<Troncon> troncons;
        readonly double[] debitsModele;     // débit lu (Revit ou calculé depuis les bouches), 0 si inconnu
        readonly bool[] debitSaisi;
        readonly string projet, titre;
        readonly List<string> notes;
        ResultatPerte resultat;
        Fluide fluide;
        bool chargement = true;

        readonly ComboBox cbFluide = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
        readonly NumericUpDown nudGlycol = new NumericUpDown { Minimum = 0, Maximum = 50, Value = 30, Increment = 5 };
        readonly NumericUpDown nudTemp = new NumericUpDown { Minimum = -10, Maximum = 120, DecimalPlaces = 0 };
        readonly NumericUpDown nudDebit = new NumericUpDown { Minimum = 0, Maximum = 1000000, DecimalPlaces = 2, Increment = 1 };
        readonly NumericUpDown nudVmax = new NumericUpDown { Minimum = 0.1m, Maximum = 30, DecimalPlaces = 1, Increment = 0.5m };
        readonly DataGridView grille = new DataGridView
        {
            AllowUserToAddRows = false, AllowUserToDeleteRows = false, RowHeadersVisible = false, SelectionMode = DataGridViewSelectionMode.CellSelect,
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, BackgroundColor = SystemColors.Window, EditMode = DataGridViewEditMode.EditOnEnter,
        };
        readonly Label lblTotal = new Label { AutoSize = false, Font = new Font("Segoe UI", 10f, FontStyle.Bold) };
        readonly Label lblNote = new Label { AutoSize = false, ForeColor = SystemColors.GrayText };
        // Dimensionnement (ventilation)
        readonly NumericUpDown nudDimQ = new NumericUpDown { Minimum = 0, Maximum = 1000000, Value = 1000, Increment = 100 };
        readonly NumericUpDown nudDimV = new NumericUpDown { Minimum = 0.5m, Maximum = 20, DecimalPlaces = 1, Value = 4, Increment = 0.5m };
        readonly NumericUpDown nudDimH = new NumericUpDown { Minimum = 50, Maximum = 2000, Value = 200, Increment = 50 };
        readonly Label lblDim = new Label { AutoSize = false };

        const int CDebit = 3, CZeta = 7, CFixe = 8;

        public FenetreCalcul(bool air, string titre, string projet, List<Troncon> troncons, List<string> notes)
        {
            this.air = air; this.titre = titre; this.projet = projet; this.troncons = troncons; this.notes = notes ?? new List<string>();
            debitsModele = troncons.Select(t => t.DebitM3h).ToArray();
            debitSaisi = new bool[troncons.Count];
            Text = "Pipe-Fit – " + titre;
            Font = new Font("Segoe UI", 9f);
            AutoScaleMode = AutoScaleMode.Dpi;
            StartPosition = FormStartPosition.CenterParent;
            MinimizeBox = false;
            ClientSize = new Size(1180, 680);

            int y = 12;
            Label L(string t, int x, int w = 120) { var l = new Label { Text = t, Location = new Point(x, y + 3), Size = new Size(w, 20) }; Controls.Add(l); return l; }
            if (air)
            {
                L("Air à (°C) :", 12, 80); nudTemp.Value = 20; nudTemp.SetBounds(92, y, 60, 24);
                L("Vitesse maxi (m/s) :", 170, 120); nudVmax.Value = 6; nudVmax.SetBounds(290, y, 60, 24);
                L("Débit si inconnu (m³/h) :", 368, 150); nudDebit.SetBounds(518, y, 90, 24);
                Controls.AddRange(new Control[] { nudTemp, nudVmax, nudDebit });
            }
            else
            {
                cbFluide.Items.AddRange(new object[] { "Eau", "Eau + monoéthylène glycol (MEG)", "Eau + monopropylène glycol (MPG)" });
                cbFluide.SelectedIndex = 0;
                L("Fluide :", 12, 50); cbFluide.SetBounds(62, y, 220, 24);
                L("Glycol (%) :", 292, 72); nudGlycol.SetBounds(364, y, 52, 24);
                L("Température (°C) :", 426, 110); nudTemp.Value = 45; nudTemp.SetBounds(536, y, 56, 24);
                L("Débit si inconnu (m³/h) :", 604, 150); nudDebit.SetBounds(754, y, 84, 24);
                L("Vitesse maxi (m/s) :", 850, 118); nudVmax.Value = 2; nudVmax.SetBounds(968, y, 56, 24);
                Controls.AddRange(new Control[] { cbFluide, nudGlycol, nudTemp, nudDebit, nudVmax });
            }
            y += 34;
            lblNote.Text = (air
                ? "Débits : lus dans Revit, sinon calculés depuis les bouches en aval de la CTA (source). ζ et pertes fixes (bouches, batteries, filtres : valeurs fabricant) modifiables."
                : "Débits : lus dans Revit (calcul de débit du système), sinon le débit saisi ci-dessus. ζ par défaut selon le raccord ou la vanne (pleine ouverture), modifiables ; perte fixe : valeur fabricant (Pa).")
                + (this.notes.Count > 0 ? "  " + string.Join("  ", this.notes) : "");
            lblNote.SetBounds(12, y, 1156, 34); lblNote.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            y += 38;
            int basGrille = air ? 128 : 88;
            grille.SetBounds(12, y, 1156, ClientSize.Height - y - basGrille);
            grille.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            void Col(string t, int w, bool ro = true) => grille.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = t, FillWeight = w, ReadOnly = ro, SortMode = DataGridViewColumnSortMode.NotSortable });
            Col("Rep.", 5); Col("Élément", 30); Col("Section (mm)", 9); Col("Débit (m³/h)", 9, false); Col("Long. (m)", 7); Col("Vitesse (m/s)", 8); Col("J (Pa/m)", 7);
            Col("ζ", 6, false); Col("Perte fixe (Pa)", 8, false); Col("ΔP (Pa)", 8); Col("Remarque", 26);
            foreach (var t in troncons) grille.Rows.Add(t.Repere, t.Designation, t.Section, "", t.LongueurM > 0 ? t.LongueurM.ToString("0.00", Fr) : "", "", "", t.Zeta.ToString("0.###", Fr), t.PerteFixePa != 0 ? t.PerteFixePa.ToString("0", Fr) : "", "", "");
            Controls.Add(grille);

            lblTotal.SetBounds(12, ClientSize.Height - basGrille + 8, 900, 24); lblTotal.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            Controls.Add(lblTotal);
            if (air)
            {
                int yb = ClientSize.Height - 86;
                var t1 = new Label { Text = "Dimensionner : débit (m³/h)", Location = new Point(12, yb + 3), Size = new Size(170, 20), Anchor = AnchorStyles.Bottom | AnchorStyles.Left };
                nudDimQ.SetBounds(182, yb, 90, 24); nudDimQ.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
                var t2 = new Label { Text = "à (m/s)", Location = new Point(280, yb + 3), Size = new Size(50, 20), Anchor = AnchorStyles.Bottom | AnchorStyles.Left };
                nudDimV.SetBounds(330, yb, 60, 24); nudDimV.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
                var t3 = new Label { Text = "hauteur rect. (mm)", Location = new Point(398, yb + 3), Size = new Size(118, 20), Anchor = AnchorStyles.Bottom | AnchorStyles.Left };
                nudDimH.SetBounds(516, yb, 70, 24); nudDimH.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
                lblDim.SetBounds(596, yb + 3, 580, 20); lblDim.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
                Controls.AddRange(new Control[] { t1, nudDimQ, t2, nudDimV, t3, nudDimH, lblDim });
                EventHandler dim = (s, e) => Dimensionner();
                nudDimQ.ValueChanged += dim; nudDimV.ValueChanged += dim; nudDimH.ValueChanged += dim;
                Dimensionner();
            }

            var export = new Button { Text = "Exporter vers Excel…", Anchor = AnchorStyles.Bottom | AnchorStyles.Right };
            export.SetBounds(ClientSize.Width - 290, ClientSize.Height - 44, 170, 32);
            var fermer = new Button { Text = "Fermer", DialogResult = DialogResult.OK, Anchor = AnchorStyles.Bottom | AnchorStyles.Right };
            fermer.SetBounds(ClientSize.Width - 110, ClientSize.Height - 44, 98, 32);
            Controls.AddRange(new Control[] { export, fermer });
            CancelButton = fermer;
            export.Click += (s, e) => Exporter();

            EventHandler maj = (s, e) => Recalculer();
            cbFluide.SelectedIndexChanged += maj; nudGlycol.ValueChanged += maj; nudTemp.ValueChanged += maj; nudDebit.ValueChanged += maj; nudVmax.ValueChanged += maj;
            grille.CellEndEdit += (s, e) => { LireCellule(e.RowIndex, e.ColumnIndex); Recalculer(); };
            chargement = false;
            Recalculer();
        }

        static double Nombre(object v, double defaut)
        {
            var s = (v as string ?? v?.ToString() ?? "").Trim().Replace(" ", "").Replace('.', ',');
            return double.TryParse(s, NumberStyles.Float, Fr, out var x) ? x : defaut;
        }

        void LireCellule(int i, int j)
        {
            if (i < 0 || i >= troncons.Count) return;
            var t = troncons[i]; var v = grille.Rows[i].Cells[j].Value;
            if (j == CDebit)
            {
                var s = (v as string ?? "").Trim();
                if (s == "") { debitSaisi[i] = false; }
                else { debitSaisi[i] = true; t.DebitM3h = Math.Max(0, Nombre(v, t.DebitM3h)); }
            }
            else if (j == CZeta) t.Zeta = Math.Max(0, Nombre(v, t.Zeta));
            else if (j == CFixe) t.PerteFixePa = Nombre(v, t.PerteFixePa);
        }

        Fluide FluideChoisi()
        {
            double t = (double)nudTemp.Value;
            if (air) return Fluide.Air(t);
            nudGlycol.Enabled = cbFluide.SelectedIndex > 0;
            return cbFluide.SelectedIndex == 0 ? Fluide.Eau(Math.Max(0.1, t)) : Fluide.EauGlycolee(t, (double)nudGlycol.Value, cbFluide.SelectedIndex == 2);
        }

        void Recalculer()
        {
            if (chargement) return;
            fluide = FluideChoisi();
            for (int i = 0; i < troncons.Count; i++)
                if (!debitSaisi[i]) troncons[i].DebitM3h = debitsModele[i] > 0 ? debitsModele[i] : (double)nudDebit.Value;
            resultat = air ? PerteCharge.Aeraulique(troncons, fluide, (double)nudVmax.Value) : PerteCharge.Hydraulique(troncons, fluide, (double)nudVmax.Value);
            for (int i = 0; i < troncons.Count; i++)
            {
                var t = troncons[i]; var r = grille.Rows[i];
                r.Cells[CDebit].Value = t.DebitM3h.ToString("0.##", Fr) + (debitSaisi[i] ? "" : debitsModele[i] > 0 ? "" : " *");
                r.Cells[5].Value = t.VitesseMs.ToString("0.00", Fr);
                r.Cells[6].Value = t.LongueurM > 0 ? t.PerteLineairePaM.ToString(air ? "0.00" : "0", Fr) : "";
                r.Cells[CZeta].Value = t.Zeta.ToString("0.###", Fr);
                r.Cells[CFixe].Value = t.PerteFixePa != 0 ? t.PerteFixePa.ToString("0", Fr) : "";
                r.Cells[9].Value = t.PerteTotalePa.ToString(air ? "0.0" : "0", Fr);
                r.Cells[10].Value = t.Alerte;
                r.DefaultCellStyle.ForeColor = t.Alerte != "" ? Color.Firebrick : SystemColors.ControlText;
            }
            var tot = "ΔP totale : " + (resultat.TotalPa / 1000).ToString("0.00", Fr) + " kPa"
                + (air ? " (" + resultat.TotalPa.ToString("0", Fr) + " Pa)" : " = " + resultat.TotalMce(fluide).ToString("0.00", Fr) + " mCE")
                + "   –   linéaire " + resultat.LineairePa.ToString("0", Fr) + " Pa, singulière " + resultat.SingulierPa.ToString("0", Fr) + " Pa, "
                + resultat.LongueurM.ToString("0.0", Fr) + " m";
            var alertes = troncons.Count(t => t.Alerte != "");
            lblTotal.Text = tot + (alertes > 0 ? "   –   " + alertes + " remarque(s)" : "");
            lblTotal.ForeColor = alertes > 0 ? Color.Firebrick : SystemColors.ControlText;
        }

        void Dimensionner()
        {
            double q = (double)nudDimQ.Value, v = (double)nudDimV.Value, h = (double)nudDimH.Value;
            var d = PerteCharge.DiametreRond(q, v);
            var (l, hh) = PerteCharge.Rectangulaire(q, v, h);
            double vd = q / 3600 / (Math.PI * Math.Pow(d / 1000, 2) / 4), vr = l > 0 ? q / 3600 / (l / 1000 * hh / 1000) : 0;
            lblDim.Text = "→ Ø" + d.ToString("0") + " (" + vd.ToString("0.0", Fr) + " m/s)   ou   " + l.ToString("0") + " × " + hh.ToString("0") + " (" + vr.ToString("0.0", Fr) + " m/s)";
        }

        void Exporter()
        {
            Recalculer();
            using (var dlg = new SaveFileDialog { Title = "Note de calcul", Filter = "Classeur Excel (*.xlsx)|*.xlsx", FileName = titre + ".xlsx" })
            {
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                var hyp = new List<string>
                {
                    "Débit si inconnu : " + ((double)nudDebit.Value).ToString("0.##", Fr) + " m³/h (repéré * dans la fenêtre) ; vitesse maximale " + ((double)nudVmax.Value).ToString("0.0", Fr) + " m/s.",
                };
                hyp.AddRange(notes);
                try
                {
                    File.WriteAllBytes(dlg.FileName, ExportCalcul.PerteCharge(resultat, fluide, titre, projet, hyp, air, DateTime.Now));
                    try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(dlg.FileName) { UseShellExecute = true }); } catch { }
                }
                catch (Exception ex) { MessageBox.Show(this, "Écriture impossible (fichier ouvert dans Excel ?) : " + ex.Message, "Pipe-Fit"); }
            }
        }
    }
}
