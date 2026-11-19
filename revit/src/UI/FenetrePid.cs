// Fenêtre « P&ID du projet » : liste des P&ID (cochés = à générer) et, pour le P&ID sélectionné, les types de systèmes
// qui lui appartiennent. Ajouter, renommer, supprimer, proposer (chaud / froid / aéraulique d'après les noms).
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using PipeFit.Isometries.Core;

namespace PipeFit.Isometries.Revit
{
    sealed class FenetrePid : Form
    {
        public List<DefinitionPid> Definitions { get; private set; }
        public List<DefinitionPid> AGenerer => Definitions.Where((d, i) => lbPid.GetItemChecked(i)).ToList();
        public bool SurFeuille => ckFeuille.Checked;
        readonly List<TypeSystemeInfo> types;
        readonly CheckedListBox lbPid = new CheckedListBox { CheckOnClick = false, IntegralHeight = false };
        readonly CheckedListBox lbSys = new CheckedListBox { CheckOnClick = true, IntegralHeight = false };
        readonly Label lblSys = new Label { AutoSize = false };
        readonly CheckBox ckFeuille = new CheckBox { Text = "Placer chaque nouveau P&ID sur une feuille (cartouche du projet)", AutoSize = true };
        bool chargement;

        public FenetrePid(List<DefinitionPid> definitions, List<TypeSystemeInfo> types)
        {
            Definitions = definitions.Select(d => new DefinitionPid { Nom = d.Nom, Systemes = d.Systemes.ToList() }).ToList();
            this.types = types;
            Text = "Pipe-Fit – P&ID du projet";
            Font = new Font("Segoe UI", 9f); Ergonomie.Preparer(this); StartPosition = FormStartPosition.CenterParent; MinimizeBox = false;
            ClientSize = new Size(900, 560);
            Controls.Add(new Label { Text = "P&ID (cochez ceux à générer) :", Location = new Point(12, 12), Size = new Size(280, 20) });
            lbPid.SetBounds(12, 34, 280, 380); lbPid.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left;
            Controls.Add(lbPid);
            int yb = 422;
            Button B(string t, int x, int w) { var b = new Button { Text = t, Anchor = AnchorStyles.Bottom | AnchorStyles.Left }; b.SetBounds(x, yb, w, 28); Controls.Add(b); return b; }
            var ajouter = B("Ajouter…", 12, 66); var renommer = B("Renommer…", 82, 80); var supprimer = B("Supprimer", 166, 72); var proposer = B("Proposer", 242, 50);
            lblSys.SetBounds(310, 12, 578, 20); lblSys.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right; Controls.Add(lblSys);
            lbSys.SetBounds(310, 34, 578, 416); lbSys.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            foreach (var t in types) lbSys.Items.Add(t.Libelle);
            Controls.Add(lbSys);
            Controls.Add(new Label
            {
                Text = "Un type de système peut appartenir à plusieurs P&ID. Les équipements et bouches raccordés aux réseaux choisis sont repris. "
                    + "Les définitions sont enregistrées dans le projet (informations du projet) : toute l'équipe les retrouve.",
                Location = new Point(12, 458), Size = new Size(876, 34), ForeColor = SystemColors.GrayText, Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right,
            });
            ckFeuille.Location = new Point(12, ClientSize.Height - 38); ckFeuille.Anchor = AnchorStyles.Bottom | AnchorStyles.Left; Controls.Add(ckFeuille);
            var generer = new Button { Text = "Générer les P&ID cochés", DialogResult = DialogResult.OK, Anchor = AnchorStyles.Bottom | AnchorStyles.Right };
            generer.SetBounds(ClientSize.Width - 418, ClientSize.Height - 44, 180, 32);
            var enregistrer = new Button { Text = "Enregistrer", DialogResult = DialogResult.Yes, Anchor = AnchorStyles.Bottom | AnchorStyles.Right };
            enregistrer.SetBounds(ClientSize.Width - 230, ClientSize.Height - 44, 110, 32);
            var annuler = new Button { Text = "Annuler", DialogResult = DialogResult.Cancel, Anchor = AnchorStyles.Bottom | AnchorStyles.Right };
            annuler.SetBounds(ClientSize.Width - 112, ClientSize.Height - 44, 100, 32);
            Controls.AddRange(new Control[] { generer, enregistrer, annuler });
            AcceptButton = generer; CancelButton = annuler;

            Remplir(true);
            lbPid.SelectedIndexChanged += (s, e) => Afficher();
            lbSys.ItemCheck += (s, e) =>
            {
                if (chargement || lbPid.SelectedIndex < 0) return;
                var d = Definitions[lbPid.SelectedIndex]; var nom = types[e.Index].Nom;
                if (e.NewValue == CheckState.Checked) { if (!d.Systemes.Contains(nom)) d.Systemes.Add(nom); } else d.Systemes.Remove(nom);
                BeginInvoke(new Action(() => { lbPid.Items[lbPid.SelectedIndex] = Libelle(d); }));
            };
            ajouter.Click += (s, e) =>
            {
                var nom = Saisie("Nom du nouveau P&ID :", "PID ");
                if (string.IsNullOrWhiteSpace(nom)) return;
                Definitions.Add(new DefinitionPid { Nom = nom.Trim() }); Remplir(false); lbPid.SelectedIndex = Definitions.Count - 1; lbPid.SetItemChecked(Definitions.Count - 1, true);
            };
            renommer.Click += (s, e) =>
            {
                if (lbPid.SelectedIndex < 0) return;
                var d = Definitions[lbPid.SelectedIndex];
                var nom = Saisie("Nouveau nom :", d.Nom);
                if (string.IsNullOrWhiteSpace(nom)) return;
                d.Nom = nom.Trim(); lbPid.Items[lbPid.SelectedIndex] = Libelle(d);
            };
            supprimer.Click += (s, e) =>
            {
                var i = lbPid.SelectedIndex; if (i < 0) return;
                Definitions.RemoveAt(i); Remplir(false); if (Definitions.Count > 0) lbPid.SelectedIndex = Math.Min(i, Definitions.Count - 1);
            };
            proposer.Click += (s, e) =>
            {
                if (Definitions.Count > 0 && MessageBox.Show(this, "Remplacer les P&ID par la proposition (chaud, froid, aéraulique, autres d'après les noms des systèmes) ?", "Pipe-Fit", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
                Definitions = DefinitionsPid.Proposer(types); Remplir(true);
            };
        }

        static string Libelle(DefinitionPid d) => d.Nom + "   (" + d.Systemes.Count + " système" + (d.Systemes.Count > 1 ? "s" : "") + ")";

        void Remplir(bool tousCoches)
        {
            var coches = new HashSet<string>(Enumerable.Range(0, lbPid.Items.Count).Where(lbPid.GetItemChecked).Select(i => i < Definitions.Count ? Definitions[i].Nom : ""));
            lbPid.Items.Clear();
            foreach (var d in Definitions) lbPid.Items.Add(Libelle(d), tousCoches || coches.Contains(d.Nom));
            if (Definitions.Count > 0) lbPid.SelectedIndex = 0; else Afficher();
        }

        void Afficher()
        {
            chargement = true;
            var d = lbPid.SelectedIndex >= 0 && lbPid.SelectedIndex < Definitions.Count ? Definitions[lbPid.SelectedIndex] : null;
            lblSys.Text = d == null ? "Ajoutez un P&ID, ou « Proposer »." : "Systèmes du « " + d.Nom + " » :";
            lbSys.Enabled = d != null;
            for (int i = 0; i < types.Count; i++) lbSys.SetItemChecked(i, d != null && d.Systemes.Contains(types[i].Nom));
            chargement = false;
        }

        string Saisie(string invite, string valeur)
        {
            using (var f = new Form { AutoScaleDimensions = new SizeF(96F, 96F), AutoScaleMode = AutoScaleMode.Dpi, Text = "Pipe-Fit", FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent, ClientSize = new Size(380, 110), MinimizeBox = false, MaximizeBox = false, Font = Font })
            {
                var tb = new TextBox { Text = valeur }; tb.SetBounds(12, 36, 356, 24);
                var ok = new Button { Text = "OK", DialogResult = DialogResult.OK }; ok.SetBounds(196, 72, 80, 28);
                var an = new Button { Text = "Annuler", DialogResult = DialogResult.Cancel }; an.SetBounds(288, 72, 80, 28);
                f.Controls.AddRange(new Control[] { new Label { Text = invite, Location = new Point(12, 12), Size = new Size(356, 20) }, tb, ok, an });
                f.AcceptButton = ok; f.CancelButton = an;
                return f.ShowDialog(this) == DialogResult.OK ? tb.Text : null;
            }
        }
    }
}
