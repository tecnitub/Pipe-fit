// Fenêtre « Symboles de robinetterie » : pour chaque FAMILLE d'accessoire du projet, le symbole trouvé d'après le nom de
// la famille (le nom du type n'est pas lu), modifiable. Les choix sont mémorisés par nom de famille.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using PipeFit.Isometries.Core;

namespace PipeFit.Isometries.Revit
{
    sealed class FenetreSymboles : Form
    {
        const string Auto = "(automatique)";
        static readonly GenreRobinet[] Genres =
            { GenreRobinet.Vanne, GenreRobinet.Papillon, GenreRobinet.Reglage, GenreRobinet.Clapet, GenreRobinet.Boisseau, GenreRobinet.Filtre, GenreRobinet.Compensateur,
              GenreRobinet.Motorisee, GenreRobinet.Purgeur, GenreRobinet.Manometre, GenreRobinet.Thermometre };

        readonly DataGridView grille = new DataGridView
        {
            AllowUserToAddRows = false, AllowUserToDeleteRows = false, RowHeadersVisible = false, SelectionMode = DataGridViewSelectionMode.CellSelect,
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, BackgroundColor = SystemColors.Window, EditMode = DataGridViewEditMode.EditOnEnter,
        };

        public FenetreSymboles(List<(string Famille, string Type)> types)
        {
            Text = "Pipe-Fit – Symboles de robinetterie";
            Font = new Font("Segoe UI", 9f);
            AutoScaleMode = AutoScaleMode.Dpi;
            StartPosition = FormStartPosition.CenterParent;
            MinimizeBox = false;
            ClientSize = new Size(820, 480);
            var intro = new Label
            {
                Text = "Le symbole est trouvé d'après le NOM DE LA FAMILLE de l'accessoire (mots « papillon », « clapet », « réglage », références "
                    + "« STAF », « VPI 4648 », « FLEXVENT »…) ; le nom du type n'est pas lu. Choisissez un symbole pour corriger une famille ; « (automatique) » revient à la recherche.",
                Location = new Point(12, 10), Size = new Size(796, 36),
            };
            grille.SetBounds(12, 52, 796, 372);
            grille.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            grille.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Famille", ReadOnly = true, FillWeight = 30 });
            grille.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Types (pour information)", ReadOnly = true, FillWeight = 34 });
            grille.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Trouvé par la famille", ReadOnly = true, FillWeight = 18 });
            var choix = new DataGridViewComboBoxColumn { HeaderText = "Symbole", FillWeight = 22, FlatStyle = FlatStyle.Flat };
            choix.Items.Add(Auto);
            foreach (var g in Genres) choix.Items.Add(Robinetterie.Libelle(g));
            grille.Columns.Add(choix);

            var actuel = Robinetterie.Correspondances;
            foreach (var grp in types.GroupBy(t => t.Famille).OrderBy(g => g.Key, StringComparer.CurrentCultureIgnoreCase))
            {
                var fam = grp.Key;
                var noms = string.Join(", ", grp.Select(t => t.Type).Where(t => !string.IsNullOrWhiteSpace(t)).Distinct());
                var trouve = Robinetterie.ParMots(fam);
                var rac = Robinetterie.Raccord(fam);
                var auto = rac != null ? AnalyseSpool.Libelle(rac.Value) + " (raccord, sans symbole)"
                    : trouve == GenreRobinet.Aucun ? "Vanne (par défaut)" : Robinetterie.Libelle(trouve);
                var val = actuel.TryGetValue(Robinetterie.Cle(fam), out var g) && g != GenreRobinet.Aucun ? Robinetterie.Libelle(g) : Auto;
                grille.Rows.Add(fam, noms, auto, val);
            }
            if (types.Count == 0) intro.Text += "\n(Aucun accessoire de canalisation dans ce projet.)";

            var ok = new Button { Text = "Enregistrer", DialogResult = DialogResult.OK, Anchor = AnchorStyles.Bottom | AnchorStyles.Right };
            ok.SetBounds(ClientSize.Width - 212, ClientSize.Height - 42, 110, 30);
            var annuler = new Button { Text = "Annuler", DialogResult = DialogResult.Cancel, Anchor = AnchorStyles.Bottom | AnchorStyles.Right };
            annuler.SetBounds(ClientSize.Width - 94, ClientSize.Height - 42, 82, 30);
            Controls.AddRange(new Control[] { intro, grille, ok, annuler });
            AcceptButton = ok; CancelButton = annuler;
            grille.CurrentCellDirtyStateChanged += (s, e) => { if (grille.IsCurrentCellDirty) grille.CommitEdit(DataGridViewDataErrorContexts.Commit); };

            ok.Click += (s, e) =>
            {
                var d = new Dictionary<string, GenreRobinet>(Robinetterie.Correspondances);
                foreach (DataGridViewRow row in grille.Rows)
                {
                    var cle = Robinetterie.Cle(row.Cells[0].Value as string ?? "");
                    var v = row.Cells[3].Value as string ?? Auto;
                    var g = Genres.FirstOrDefault(x => Robinetterie.Libelle(x) == v);
                    if (v == Auto) d.Remove(cle); else d[cle] = g;
                }
                Reglages.EnregistrerSymboles(d);
            };
        }
    }
}
