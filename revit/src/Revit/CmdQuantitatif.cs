// Commande « Quantitatif chiffrage » : exporte, pour tout le projet, les quantités vers un classeur Excel (synthèse,
// quantitatif, soudures, liste de débit, nomenclatures) ou le CSV lu par Pipe-Fit (Devis → Chiffrage depuis plan) :
// fournitures par réseau, soudures et joints boulonnés réels.
// Les spools numérotés donnent leurs soudures atelier / chantier ; la tuyauterie pas encore numérotée est comptée
// par réseau, avec des soudures « à répartir » (part atelier du chiffrage).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using SaveFileDialog = System.Windows.Forms.SaveFileDialog;
using DialogResult = System.Windows.Forms.DialogResult;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using PipeFit.Isometries.Core;

namespace PipeFit.Isometries.Revit
{
    [Transaction(TransactionMode.ReadOnly)]
    public sealed class CmdQuantitatif : CommandeBase
    {
        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            if (doc.IsFamilyDocument) { message = "Commande disponible dans un projet, pas dans l'éditeur de familles."; return Result.Failed; }

            var tous = LectureModele.ElementsTuyauterie(doc);
            if (tous.Count == 0)
            {
                TaskDialog.Show("Pipe-Fit", "Aucune canalisation, aucun raccord ni accessoire de canalisation dans ce projet.");
                return Result.Cancelled;
            }

            var r = Reglages.Charger();
            var param = CmdIsometries.ParametreSpool(r, tous);
            var spools = Lire(doc, tous, param, r.SurlongueurMm);

            string fichier; bool excel;
            using (var dlg = new SaveFileDialog
            {
                Title = "Quantités : classeur Excel ou CSV pour le chiffrage Pipe-Fit",
                Filter = "Classeur Excel (*.xlsx)|*.xlsx|Fichier CSV pour le chiffrage (*.csv)|*.csv",
                FilterIndex = 1,
                FileName = Nettoyer(doc.Title) + " - quantités Pipe-Fit.xlsx",
                InitialDirectory = Directory.Exists(r.Dossier) ? r.Dossier : doc.PathName != "" ? Path.GetDirectoryName(doc.PathName) : "",
            })
            {
                if (dlg.ShowDialog(new FenetreRevit(data.Application.MainWindowHandle)) != DialogResult.OK) return Result.Cancelled;
                fichier = dlg.FileName;
                excel = dlg.FilterIndex == 1 || Path.GetExtension(fichier).Equals(".xlsx", StringComparison.OrdinalIgnoreCase);
                if (excel && !Path.GetExtension(fichier).Equals(".xlsx", StringComparison.OrdinalIgnoreCase)) fichier = Path.ChangeExtension(fichier, ".xlsx");
            }

            try
            {
                if (excel)
                {
                    var projet = doc.ProjectInformation?.Name;
                    File.WriteAllBytes(fichier, ExportExcel.Quantites(spools, string.IsNullOrWhiteSpace(projet) ? doc.Title : projet, DateTime.Now));
                }
                else File.WriteAllText(fichier, Quantitatif.Csv(spools), new UTF8Encoding(true));
            }
            catch (IOException ex) { message = "Écriture impossible (fichier ouvert dans Excel ?) : " + ex.Message; return Result.Failed; }
            catch (Exception ex) { message = "Écriture impossible : " + ex.Message; return Result.Failed; }

            Bilan(spools, fichier, param, excel);
            if (excel) try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(fichier) { UseShellExecute = true }); } catch { /* Excel absent : le fichier reste enregistré */ }
            return Result.Succeeded;
        }

        /// <summary>Spools numérotés, puis tuyauterie non numérotée regroupée par réseau.</summary>
        public static List<Spool> Lire(Document doc, List<Element> tous, string param, double surlongueurMm = 0)
        {
            var res = new List<Spool>();
            var groupes = LectureModele.ParSpool(tous, param, out var sansSpool);
            foreach (var g in groupes.OrderBy(k => k.Key, Comparer<string>.Create(AnalyseSpool.ComparerNaturel)))
                res.Add(LectureModele.Convertir(doc, g.Key, g.Value, param, surlongueurMm));
            foreach (var g in sansSpool.GroupBy(e => e.get_Parameter(BuiltInParameter.RBS_SYSTEM_NAME_PARAM)?.AsString() ?? ""))
            {
                var s = LectureModele.Convertir(doc, g.Key == "" ? "hors spool" : g.Key, g.ToList(), param, surlongueurMm);
                s.HorsSpool = true;
                res.Add(s);
            }
            return res;
        }

        static void Bilan(List<Spool> spools, string fichier, string param, bool excel)
        {
            var lignes = Quantitatif.Calculer(spools);
            int N(string famille) => lignes.Where(l => l.Famille == famille).Sum(l => l.Nombre);
            var numerotes = spools.Count(s => !s.HorsSpool);
            var horsSpool = spools.Where(s => s.HorsSpool).Sum(s => s.Composants.Count);
            var sb = new StringBuilder();
            sb.AppendLine(lignes.Count + " lignes, " + lignes.Select(l => l.Reseau).Distinct().Count() + " réseau(x), "
                + (lignes.Where(l => l.EstTube).Sum(l => l.LongueurMm) / 1000).ToString("0.0") + " m de tube.");
            sb.AppendLine(numerotes + " spool(s) numéroté(s) : " + N("Soudure atelier") + " soudures atelier, " + N("Soudure chantier") + " soudures chantier, "
                + (N("Joint boulonné atelier") + N("Joint boulonné chantier")) + " joints boulonnés.");
            if (horsSpool > 0)
                sb.AppendLine(horsSpool + " élément(s) sans numéro de spool" + (param != "" ? " (« " + param + " »)" : "") + " : "
                    + N("Soudure") + " soudures à répartir atelier / chantier dans le chiffrage.");
            sb.AppendLine();
            if (excel) sb.AppendLine("Classeur Excel : Synthèse par réseau, Quantitatif, Soudures par spool, Liste de débit, Nomenclatures. "
                + "Il s'importe aussi tel quel dans Pipe-Fit (Devis → Chiffrage depuis plan → Importer la nomenclature).");
            else sb.AppendLine("Dans Pipe-Fit : Devis → Chiffrage depuis plan → Importer la nomenclature, puis choisir ce fichier.");
            sb.Append(fichier);
            new TaskDialog("Pipe-Fit – Quantitatif") { MainInstruction = excel ? "Quantités exportées vers Excel" : "Quantitatif exporté pour le chiffrage", MainContent = sb.ToString() }.Show();
        }

        static string Nettoyer(string s)
        {
            foreach (var c in Path.GetInvalidFileNameChars()) s = s.Replace(c, '_');
            return s;
        }
    }
}
