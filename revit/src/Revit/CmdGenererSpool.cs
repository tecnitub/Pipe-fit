// Commande « Générer un spool » (mode manuel) : on sélectionne avec Ctrl (ou une fenêtre de sélection) toute une partie
// de tuyauterie, on clique : ces éléments reçoivent le prochain numéro de spool (modifiable), le paramètre est créé s'il
// manque, et l'isométrie de ce spool est générée tout de suite avec les réglages habituels.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using PipeFit.Isometries.Core;
using Form = System.Windows.Forms.Form;
using Control = System.Windows.Forms.Control;
using TextBox = System.Windows.Forms.TextBox;
using Point = System.Drawing.Point;
using Size = System.Drawing.Size;
using Font = System.Drawing.Font;
using Color = System.Drawing.Color;
using TaskDialog = Autodesk.Revit.UI.TaskDialog;

namespace PipeFit.Isometries.Revit
{
    [Transaction(TransactionMode.Manual)]
    [Regeneration(RegenerationOption.Manual)]
    public sealed class CmdGenererSpool : CommandeBase
    {
        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            if (doc.IsFamilyDocument) { message = "Commande disponible dans un projet, pas dans l'éditeur de familles."; return Result.Failed; }
            var filtre = new FiltreTuyauterie();

            // 1. Les éléments du spool : la sélection faite avant de cliquer, sinon on la demande
            var choix = uidoc.Selection.GetElementIds().Select(id => doc.GetElement(id)).Where(e => e != null && filtre.AllowElement(e)).ToList();
            if (choix.Count == 0)
            {
                IList<Reference> refs;
                try
                {
                    refs = uidoc.Selection.PickObjects(Autodesk.Revit.UI.Selection.ObjectType.Element, filtre,
                        "Générer un spool : sélectionnez la tuyauterie du spool (clic, Ctrl + clic, ou fenêtre), puis Terminer");
                }
                catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return Result.Cancelled; }
                choix = refs.Select(x => doc.GetElement(x)).Where(e => e != null).GroupBy(e => e.Id).Select(g => g.First()).ToList();
            }
            if (choix.Count == 0) { TaskDialog.Show("Pipe-Fit", "Aucun élément de tuyauterie sélectionné (canalisations, raccords, accessoires)."); return Result.Cancelled; }

            var tous = LectureModele.ElementsTuyauterie(doc);
            var r = Reglages.Charger();
            if (r.Dossier == "" && doc.PathName != "") r.Dossier = Path.Combine(Path.GetDirectoryName(doc.PathName) ?? "", "Isométries");

            // 2. Le paramètre du numéro : celui déjà utilisé, sinon « Numéro de spool » (créé au besoin)
            var candidats = LectureModele.ParametresCandidats(tous);
            string param;
            if (candidats.Contains(r.ParametreSpool) && r.ParametreSpool != "") param = r.ParametreSpool;
            else if (candidats.Any(c => string.Equals(c, ParametreSpool.Nom, StringComparison.OrdinalIgnoreCase)))
                param = candidats.First(c => string.Equals(c, ParametreSpool.Nom, StringComparison.OrdinalIgnoreCase));
            else
            {
                var p = LectureModele.ParametreParDefaut(tous, candidats);
                param = p != "" ? p : CmdNumeroter.CreerParametre;
            }
            string Valeur(Element e) => param == CmdNumeroter.CreerParametre ? "" : LectureModele.ValeurSpool(e, param);

            // 3. Numéro proposé : celui que portent déjà tous les éléments choisis (on régénère), sinon le prochain libre du système
            var comps = choix.Select(e => LectureModele.Lire(doc, e)).ToList();
            var existants = tous.Select(Valeur).Where(v => v != "").ToList();
            var actuels = choix.Select(Valeur).Distinct().ToList();
            string propose;
            if (actuels.Count == 1 && actuels[0] != "") propose = actuels[0];
            else
            {
                var reseau = r.ReseauDevant == 0 ? "" : Decoupage.Reseau(comps, r.ReseauDevant == 1);
                var prefixe = Decoupage.Prefixe(r.PrefixeSpool, reseau);
                propose = Decoupage.Format(prefixe, Decoupage.Prochain(existants, prefixe), r.Chiffres);
            }

            // 4. Contrôles affichés avant de valider
            var alertes = new List<string>();
            var morceaux = Decoupage.Morceaux(comps);
            if (morceaux > 1) alertes.Add("Les éléments forment " + morceaux + " morceaux non raccordés entre eux.");
            var systemes = comps.Select(c => c.Systeme).Where(x => x != "").Distinct().ToList();
            if (systemes.Count > 1) alertes.Add("Plusieurs systèmes : " + string.Join(", ", systemes) + ".");
            var tube = Decoupage.LongueurTube(comps);
            if (r.LongueurMaxM > 0 && tube > r.LongueurMaxM * 1000 + 0.5) alertes.Add((tube / 1000).ToString("0.00") + " m de tube : plus de " + r.LongueurMaxM.ToString("0.#") + " m.");
            var autres = actuels.Where(v => v != "").ToList();

            string numero;
            using (var f = new FenetreGenererSpool(propose, choix.Count, tube, systemes, alertes, autres))
            {
                if (f.ShowDialog(new FenetreRevit(data.Application.MainWindowHandle)) != DialogResult.OK) return Result.Cancelled;
                numero = f.Numero;
            }
            if (numero == "") return Result.Cancelled;

            // 5. Écriture du numéro (et création du paramètre s'il manque)
            int refus = 0;
            using (var t = new Transaction(doc, "Pipe-Fit : spool " + numero))
            {
                t.Start();
                if (param == CmdNumeroter.CreerParametre) { param = ParametreSpool.Creer(doc, data.Application.Application); doc.Regenerate(); }
                foreach (var e in choix) if (!CmdNumeroter.Ecrire(e, param, numero)) refus++;
                t.Commit();
            }
            if (refus == choix.Count)
            {
                TaskDialog.Show("Pipe-Fit", "Le numéro n'a pu être écrit sur aucun élément : le paramètre « " + param + " » est absent ou en lecture seule.");
                return Result.Cancelled;
            }
            Journal.Ecrire("Générer un spool : " + numero + ", " + (choix.Count - refus) + " élément(s), paramètre « " + param + " »");

            // 6. Isométrie de ce spool, avec les réglages habituels (cartouche, cotes, symboles, exports…)
            r.ParametreSpool = param;
            r.Spools = new List<string> { numero };
            r.Enregistrer();
            var groupes = LectureModele.ParSpool(LectureModele.ElementsTuyauterie(doc), param, out _);
            if (!groupes.ContainsKey(numero)) { TaskDialog.Show("Pipe-Fit", "Le spool " + numero + " n'a pas été retrouvé après numérotation."); return Result.Failed; }
            return CmdIsometries.Generer(uidoc, r, groupes, ref message);
        }
    }

    /// <summary>Petite fenêtre : numéro du spool à générer, contrôles de la sélection.</summary>
    sealed class FenetreGenererSpool : Form
    {
        readonly TextBox tbNumero = new TextBox();
        public string Numero => tbNumero.Text.Trim();

        public FenetreGenererSpool(string propose, int nbElements, double tubeMm, List<string> systemes, List<string> alertes, List<string> numerosActuels)
        {
            Text = "Pipe-Fit – Générer un spool";
            Font = new Font("Segoe UI", 9f);
            Ergonomie.Preparer(this);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(500, 300);

            var resume = nbElements + " élément(s) sélectionné(s)" + (tubeMm > 0 ? ", " + (tubeMm / 1000).ToString("0.00") + " m de tube" : "")
                + (systemes.Count == 1 ? ", système " + systemes[0] : "") + ".";
            if (numerosActuels.Count == 1) resume += "\nCes éléments portent déjà le numéro " + numerosActuels[0] + " : l'isométrie sera régénérée.";
            else if (numerosActuels.Count > 1) resume += "\nCertains éléments portent déjà un numéro (" + string.Join(", ", numerosActuels) + ") : ils seront renumérotés.";
            Controls.Add(new Label { Text = resume, Location = new Point(14, 12), Size = new Size(472, 48) });

            Controls.Add(new Label { Text = "Numéro du spool :", Location = new Point(14, 75), AutoSize = true });
            tbNumero.SetBounds(140, 72, 200, 24);
            tbNumero.Text = propose;
            Controls.Add(tbNumero);

            var lblAlertes = new Label
            {
                Text = alertes.Count > 0 ? "À vérifier :\n- " + string.Join("\n- ", alertes) : "Sélection d'un seul tenant, un seul système : rien à signaler.",
                Location = new Point(14, 110), Size = new Size(472, 120), ForeColor = alertes.Count > 0 ? Color.DarkRed : SystemColors.GrayText,
            };
            Controls.Add(lblAlertes);

            var ok = new Button { Text = "Générer l'isométrie", DialogResult = DialogResult.OK };
            ok.SetBounds(ClientSize.Width - 252, ClientSize.Height - 44, 150, 30);
            var annuler = new Button { Text = "Annuler", DialogResult = DialogResult.Cancel };
            annuler.SetBounds(ClientSize.Width - 94, ClientSize.Height - 44, 80, 30);
            Controls.AddRange(new Control[] { ok, annuler });
            AcceptButton = ok; CancelButton = annuler;
        }
    }
}
