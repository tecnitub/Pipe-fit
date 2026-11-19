// Ergonomie des fenêtres : mise à l'échelle Windows (125 %, 150 %…) cohérente pour les positions et les textes, taille
// minimale, et contrôle à l'ouverture : libellé trop long pour sa case → raccourci « … » avec info-bulle du texte complet ;
// chevauchement de contrôles ou texte coupé → noté dans le journal (repris par le Diagnostic).
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace PipeFit.Isometries.Revit
{
    static class Ergonomie
    {
        /// <summary>À appeler dans le constructeur, avant d'ajouter les contrôles : coordonnées données à 96 ppp.</summary>
        public static void Preparer(Form f)
        {
            f.AutoScaleDimensions = new SizeF(96F, 96F);
            f.AutoScaleMode = AutoScaleMode.Dpi;
            f.Load += (s, e) =>
            {
                try
                {
                    f.MinimumSize = f.Size;
                    var problemes = Controler(f, true);
                    foreach (var p in problemes) Journal.Ecrire("Ergonomie – " + f.Text + " : " + p);
                }
                catch { }
            };
        }

        static IEnumerable<Control> Tous(Control c) { foreach (Control x in c.Controls) { yield return x; foreach (var y in Tous(x)) yield return y; } }

        /// <summary>
        /// Contrôle d'une fenêtre affichée : chevauchements entre contrôles voisins, textes qui ne tiennent pas, contrôles hors
        /// de la fenêtre. Avec « corriger », les libellés trop longs sont raccourcis (« … ») avec une info-bulle.
        /// </summary>
        public static List<string> Controler(Form f, bool corriger)
        {
            var res = new List<string>();
            ToolTip bulle = null;
            string Nom(Control c) => c.GetType().Name + " « " + (c.Text ?? "").Replace("\n", " ").Trim() + (c.Text?.Length > 0 ? "" : c.Name) + " »";
            foreach (var parent in new Control[] { f }.Concat(Tous(f)).Where(p => p.Controls.Count > 0 && !(p is DataGridView) && !(p is NumericUpDown) && !(p is DateTimePicker)))
            {
                var enfants = parent.Controls.Cast<Control>().Where(c => c.Visible).ToList();
                for (int i = 0; i < enfants.Count; i++)
                {
                    var a = enfants[i];
                    // Hors de la zone du parent
                    var zone = parent.ClientRectangle;
                    if (a.Right > zone.Right + 1 || a.Bottom > zone.Bottom + 1 || a.Left < -1 || a.Top < -1) res.Add(Nom(a) + " dépasse de la fenêtre");
                    for (int j = i + 1; j < enfants.Count; j++)
                    {
                        var b = enfants[j];
                        var r = Rectangle.Intersect(a.Bounds, b.Bounds);
                        if (r.Width > 2 && r.Height > 2) res.Add("chevauchement : " + Nom(a) + " / " + Nom(b));
                    }
                }
            }
            foreach (var c in Tous(f).Where(c => c.Visible && !string.IsNullOrWhiteSpace(c.Text)))
            {
                bool coupe = false;
                if (c is Label l && !l.AutoSize && !(c is LinkLabel))
                {
                    var t = TextRenderer.MeasureText(l.Text, l.Font, new Size(Math.Max(1, l.ClientSize.Width - l.Padding.Horizontal), int.MaxValue), TextFormatFlags.WordBreak | TextFormatFlags.TextBoxControl);
                    coupe = t.Height > l.ClientSize.Height + 2 || (l.ClientSize.Height < l.Font.Height * 2 && t.Width > l.ClientSize.Width + 2);
                    if (coupe && corriger) l.AutoEllipsis = true;
                }
                else if (c is ButtonBase bb && !bb.AutoSize)
                {
                    var marge = c is CheckBox || c is RadioButton ? 22 : 12;
                    var t = TextRenderer.MeasureText(bb.Text.Replace("&", "&&"), bb.Font);
                    coupe = t.Width + marge > bb.ClientSize.Width + 1 && !(c is CheckBox || c is RadioButton) || (c is CheckBox || c is RadioButton) && t.Width + marge > bb.ClientSize.Width + 1
                        && TextRenderer.MeasureText(bb.Text, bb.Font, new Size(Math.Max(1, bb.ClientSize.Width - marge), int.MaxValue), TextFormatFlags.WordBreak).Height > bb.ClientSize.Height + 2;
                    if (coupe && corriger) bb.AutoEllipsis = true;
                }
                if (coupe)
                {
                    res.Add("texte coupé : " + Nom(c));
                    if (corriger) { bulle = bulle ?? new ToolTip(); bulle.SetToolTip(c, c.Text); }
                }
            }
            return res;
        }
    }
}
