// Fenêtre « Équilibrage hydraulique » : fluide, tableau par équipement (débit, pertes, à dissiper, vanne, Kv requis),
// point de fonctionnement de la pompe, note de calcul PDF / Excel.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;
using PipeFit.Isometries.Core;

namespace PipeFit.Isometries.Revit
{
    sealed class FenetreEquilibrage : Form
    {
        static readonly CultureInfo Fr = CultureInfo.GetCultureInfo("fr-FR");
        readonly Func<Fluide, ResultatEquilibrage> calcul;
        readonly string projet; readonly List<string> notes;
        ResultatEquilibrage res; Fluide fluide;
        readonly ComboBox cbFluide = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
        readonly NumericUpDown nudGlycol = new NumericUpDown { Minimum = 0, Maximum = 50, Value = 30, Increment = 5 };
        readonly NumericUpDown nudTemp = new NumericUpDown { Minimum = -10, Maximum = 120, Value = 45 };
        readonly DataGridView grille = new DataGridView
        {
            AllowUserToAddRows = false, AllowUserToDeleteRows = false, RowHeadersVisible = false, ReadOnly = true, SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, BackgroundColor = SystemColors.Window,
        };
        readonly Label lblPompe = new Label { AutoSize = false, Font = new Font("Segoe UI", 10f, FontStyle.Bold) };
        static readonly string[] Titres = { "Équipement", "Débit (m³/h)", "Circuit (kPa)", "Équipement (kPa)", "Boucle (kPa)", "À dissiper (kPa)", "Vanne de réglage", "ΔP vanne (kPa)", "Kv requis", "Remarque" };

        public FenetreEquilibrage(Func<Fluide, ResultatEquilibrage> calcul, string projet, List<string> notes)
        {
            this.calcul = calcul; this.projet = projet; this.notes = notes;
            Text = "Pipe-Fit – Équilibrage hydraulique";
            Font = new Font("Segoe UI", 9f); Ergonomie.Preparer(this); StartPosition = FormStartPosition.CenterParent; MinimizeBox = false;
            ClientSize = new Size(1180, 600);
            cbFluide.Items.AddRange(new object[] { "Eau", "Eau + monoéthylène glycol (MEG)", "Eau + monopropylène glycol (MPG)" }); cbFluide.SelectedIndex = 0;
            Controls.Add(new Label { Text = "Fluide :", Location = new Point(12, 15), Size = new Size(50, 20) }); cbFluide.SetBounds(62, 12, 220, 24);
            Controls.Add(new Label { Text = "Glycol (%) :", Location = new Point(292, 15), Size = new Size(72, 20) }); nudGlycol.SetBounds(364, 12, 52, 24);
            Controls.Add(new Label { Text = "Température (°C) :", Location = new Point(426, 15), Size = new Size(110, 20) }); nudTemp.SetBounds(536, 12, 56, 24);
            Controls.AddRange(new Control[] { cbFluide, nudGlycol, nudTemp });
            var lbl = new Label { Text = string.Join("  ", notes) + "  Boucle critique en gras : sa vanne garde au moins 3 kPa ; les autres dissipent l'écart (Kv requis = Q / √ΔP en bar, à régler sur l'abaque du fabricant).",
                Location = new Point(12, 44), Size = new Size(1156, 34), ForeColor = SystemColors.GrayText, Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            Controls.Add(lbl);
            grille.SetBounds(12, 82, 1156, ClientSize.Height - 82 - 90); grille.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            foreach (var t in Titres) grille.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = t, FillWeight = t == "Équipement" || t == "Remarque" ? 22 : t == "Vanne de réglage" ? 18 : 9 });
            Controls.Add(grille);
            lblPompe.SetBounds(12, ClientSize.Height - 82, 1156, 26); lblPompe.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right; Controls.Add(lblPompe);
            var note = new Button { Text = "Note de calcul (PDF, Excel)…", Anchor = AnchorStyles.Bottom | AnchorStyles.Right }; note.SetBounds(ClientSize.Width - 330, ClientSize.Height - 44, 210, 32);
            var fermer = new Button { Text = "Fermer", DialogResult = DialogResult.OK, Anchor = AnchorStyles.Bottom | AnchorStyles.Right }; fermer.SetBounds(ClientSize.Width - 110, ClientSize.Height - 44, 98, 32);
            Controls.AddRange(new Control[] { note, fermer }); CancelButton = fermer;
            EventHandler maj = (s, e) => Recalculer();
            cbFluide.SelectedIndexChanged += maj; nudGlycol.ValueChanged += maj; nudTemp.ValueChanged += maj;
            note.Click += (s, e) => Note();
            Recalculer();
        }

        string K(double pa) => (pa / 1000).ToString("0.0", Fr);

        string[] LigneDe(BoucleEquilibrage b) => new[]
        {
            b.Libelle, b.DebitM3h.ToString("0.##", Fr), K(b.CircuitPa), K(b.ConsommateurPa), K(b.TotalPa), b.Critique ? "critique" : K(b.ADissiperPa),
            b.VanneLibelle, b.Vanne != "" ? K(b.VanneCiblePa) : "", b.Vanne != "" ? b.KvRequis.ToString("0.00", Fr) : "", b.Remarque,
        };

        void Recalculer()
        {
            double t = (double)nudTemp.Value;
            nudGlycol.Enabled = cbFluide.SelectedIndex > 0;
            fluide = cbFluide.SelectedIndex == 0 ? Fluide.Eau(Math.Max(0.1, t)) : Fluide.EauGlycolee(t, (double)nudGlycol.Value, cbFluide.SelectedIndex == 2);
            res = calcul(fluide);
            grille.Rows.Clear();
            foreach (var b in res.Boucles)
            {
                var i = grille.Rows.Add(LigneDe(b));
                if (b.Critique) grille.Rows[i].DefaultCellStyle.Font = new Font(grille.Font, FontStyle.Bold);
                if (b.Remarque != "") grille.Rows[i].DefaultCellStyle.ForeColor = Color.Firebrick;
            }
            lblPompe.Text = Pompe();
        }

        string Pompe() => "Point de fonctionnement de la pompe : " + res.DebitTotalM3h.ToString("0.##", Fr) + " m³/h sous " + ((res.HauteurPa + res.SourcePa) / 1000).ToString("0.0", Fr)
            + " kPa = " + res.HauteurMce(fluide).ToString("0.00", Fr) + " mCE (réseau " + K(res.HauteurPa) + " kPa" + (res.SourcePa > 0 ? " + production " + K(res.SourcePa) + " kPa" : "") + ")";

        void Note()
        {
            var n = new NoteCalcul
            {
                Titre = "Note de calcul – équilibrage hydraulique", Projet = projet, Fluide = fluide, Date = DateTime.Today, TitreTableau = "Équilibrage par équipement",
                Objet = "Équilibrage du circuit : boucle de chaque équipement depuis la production, pression à dissiper et Kv requis des vannes de réglage, point de fonctionnement de la pompe.",
                Hypotheses = notes.Concat(new[] { "Vanne de la boucle critique : au moins 3 kPa (autorité, mesure du débit).", "Kv requis = Q / √(ΔP en bar) ; réglage à lire sur l'abaque du fabricant de la vanne." }).ToList(),
                Colonnes = new List<(string, double, bool)> { ("Équipement", 150, false), ("Débit m³/h", 54, true), ("Circuit kPa", 56, true), ("Équip. kPa", 56, true), ("Boucle kPa", 56, true),
                    ("À dissiper kPa", 66, true), ("Vanne de réglage", 140, false), ("dP vanne kPa", 60, true), ("Kv requis", 50, true), ("Remarque", 86, false) },
                TexteResultat = Pompe(),
            };
            n.Lignes = res.Boucles.Select(LigneDe).ToList();
            var crit = res.Boucles.FirstOrDefault(b => b.Critique);
            n.ConclusionLibre = "La boucle critique est celle de " + (crit?.Libelle ?? "–") + " (" + K(crit?.TotalPa ?? 0) + " kPa). " + Pompe() + ". "
                + res.Boucles.Count(b => b.Vanne != "" && !b.Critique) + " vanne(s) de réglage à régler au Kv requis"
                + (res.Boucles.Any(b => b.Remarque != "") ? " ; " + res.Boucles.Count(b => b.Remarque != "") + " boucle(s) appellent une remarque." : ".");
            using (var f = new FenetreNote(n)) f.ShowDialog(this);
        }
    }
}
