// Fenêtre « Symboles de robinetterie » : pour chaque type d'accessoire du projet, le symbole trouvé d'après le nom du
// type (puis de la famille), modifiable. Les choix sont mémorisés par nom de type (Symboles robinetterie.ini).
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
            { GenreRobinet.Vanne, GenreRobinet.Papillon, GenreRobinet.Reglage, GenreRobinet.Clapet, GenreRobinet.Boisseau, GenreRobinet.Filtre, GenreRobinet.Compensateur };

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
                Text = "Le symbole est trouvé d'après le NOM DU TYPE de l'accessoire (mots « papillon », « clapet », « réglage », « STAD », "
                    + "« Dilatoflex »…), puis d'après la famille. Choisissez un symbole pour corriger un type ; « (automatique) » revient à la recherche.",
                Location = new Point(12, 10), Size = new Size(796, 36),
            };
            grille.SetBounds(12, 52, 796, 372);
            grille.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            grille.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Famille", ReadOnly = true, FillWeight = 30 });
            grille.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Type", ReadOnly = true, FillWeight = 34 });
            grille.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Trouvé par le nom", ReadOnly = true, FillWeight = 18 });
            var choix = new DataGridViewComboBoxColumn { HeaderText = "Symbole", FillWeight = 22, FlatStyle = FlatStyle.Flat };
            choix.Items.Add(Auto);
            foreach (var g in Genres) choix.Items.Add(Robinetterie.Libelle(g));
            grille.Columns.Add(choix);

            var actuel = Robinetterie.Correspondances;
            foreach (var (fam, type) in types)
            {
                var c = new Composant { Famille = fam, TypeNom = type, EstAccessoire = true };
                var trouve = Robinetterie.ParMots(type);
                var source = trouve != GenreRobinet.Aucun ? "type" : (trouve = Robinetterie.ParMots(fam)) != GenreRobinet.Aucun ? "famille" : "aucun mot-clé";
                var auto = trouve == GenreRobinet.Aucun ? "Vanne (par défaut)" : Robinetterie.Libelle(trouve) + " (" + source + ")";
                var val = actuel.TryGetValue(Robinetterie.Cle(type), out var g) && g != GenreRobinet.Aucun ? Robinetterie.Libelle(g) : Auto;
                grille.Rows.Add(fam, type, auto, val);
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
                    var cle = Robinetterie.Cle(row.Cells[1].Value as string ?? "");
                    var v = row.Cells[3].Value as string ?? Auto;
                    var g = Genres.FirstOrDefault(x => Robinetterie.Libelle(x) == v);
                    if (v == Auto) d.Remove(cle); else d[cle] = g;
                }
                Reglages.EnregistrerSymboles(d);
            };
        }
    }
}
