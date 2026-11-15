// Commande « Isométries spools » : ouvre la fenêtre de réglages puis génère une feuille d'isométrie par spool,
// et les exports PDF / PCF / CSV dans le dossier choisi.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using PipeFit.Isometries.Core;

namespace PipeFit.Isometries.Revit
{
    [Transaction(TransactionMode.Manual)]
    [Regeneration(RegenerationOption.Manual)]
    public sealed class CmdIsometries : IExternalCommand
    {
        public Result Execute(ExternalCommandData data, ref string message, ElementSet elementsErreur)
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
            var candidats = LectureModele.ParametresCandidats(tous);
            r.ParametreSpool = ParametreSpool(r, tous, candidats);
            if (r.Dossier == "" && doc.PathName != "") r.Dossier = Path.Combine(Path.GetDirectoryName(doc.PathName) ?? "", "Isométries");

            var donnees = new DonneesFenetre
            {
                Parametres = candidats,
                Cartouches = GenerateurIso.Cartouches(doc).Select(GenerateurIso.NomType).ToList(),
                EtiquettesTube = GenerateurIso.Etiquettes(doc, BuiltInCategory.OST_PipeTags).Select(GenerateurIso.NomType).ToList(),
                EtiquettesRaccord = GenerateurIso.Etiquettes(doc, BuiltInCategory.OST_PipeFittingTags).Select(GenerateurIso.NomType).ToList(),
                EtiquettesAccessoire = GenerateurIso.Etiquettes(doc, BuiltInCategory.OST_PipeAccessoryTags).Select(GenerateurIso.NomType).ToList(),
                TypesAccessoires = tous.Where(e => Compat.EstCategorie(e, BuiltInCategory.OST_PipeAccessory))
                    .Select(e => doc.GetElement(e.GetTypeId()) as ElementType).Where(t => t != null)
                    .Select(t => (t.FamilyName ?? "", t.Name ?? "")).Distinct().OrderBy(t => t.Item1).ThenBy(t => t.Item2).ToList(),
                ParametresRepere = candidats.Where(c => c != LectureModele.SpoolFabrication).ToList(),
                Compter = param =>
                {
                    var groupes = LectureModele.ParSpool(tous, param, out var sans);
                    return (groupes.ToDictionary(g => g.Key, g => g.Value.Count), sans.Count);
                },
            };
            foreach (var id in uidoc.Selection.GetElementIds())
            {
                var e = doc.GetElement(id);
                var v = e == null ? "" : LectureModele.ValeurSpool(e, r.ParametreSpool);
                if (v != "") donnees.Preselection.Add(v);
            }

            ActionFenetre action;
            using (var f = new Fenetre(r, donnees))
            {
                f.ShowDialog(new FenetreRevit(data.Application.MainWindowHandle));
                action = f.Action;
            }
            if (action == ActionFenetre.Annuler) return Result.Cancelled;
            r.Enregistrer();

            var groupesSpool = LectureModele.ParSpool(tous, r.ParametreSpool, out var sansSpool);
            if (action == ActionFenetre.SelectionnerSansSpool)
            {
                uidoc.Selection.SetElementIds(sansSpool.Select(e => e.Id).ToList());
                TaskDialog.Show("Pipe-Fit", sansSpool.Count + " élément(s) sans valeur pour « " + r.ParametreSpool + " » sont sélectionnés.");
                return Result.Succeeded;
            }

            return Generer(uidoc, r, groupesSpool, ref message);
        }

        /// <summary>Paramètre du numéro de spool : celui mémorisé s'il est renseigné dans ce projet, sinon le plus probable.</summary>
        public static string ParametreSpool(Reglages r, List<Element> tous, List<string> candidats = null)
        {
            candidats = candidats ?? LectureModele.ParametresCandidats(tous);
            if (candidats.Contains(r.ParametreSpool) && tous.Any(e => LectureModele.ValeurSpool(e, r.ParametreSpool) != "")) return r.ParametreSpool;
            return LectureModele.ParametreParDefaut(tous, candidats);
        }

        static Result Generer(UIDocument uidoc, Reglages r, Dictionary<string, List<Element>> groupes, ref string message)
        {
            var doc = uidoc.Document;
            var resultats = new List<Resultat>();
            var spools = new List<Spool>();
            var gen = new GenerateurIso(doc, r, uidoc.ActiveView?.Id ?? ElementId.InvalidElementId);

            using (var tg = new TransactionGroup(doc, "Pipe-Fit : isométries de fabrication"))
            {
                tg.Start();
                using (var t = new Transaction(doc, "Pipe-Fit : préparation"))
                {
                    t.Start();
                    gen.Preparer();
                    if (r.FeuilleLegende) { try { gen.FeuilleLegende((r.PrefixeFeuille ?? "") + "LÉGENDE"); } catch { } }
                    t.Commit();
                }
                foreach (var nom in r.Spools)
                {
                    if (!groupes.TryGetValue(nom, out var elements)) continue;
                    var spool = LectureModele.Convertir(doc, nom, elements, r.ParametreSpool, r.SurlongueurMm);
                    using (var t = new Transaction(doc, "Pipe-Fit : isométrie " + nom))
                    {
                        var opt = t.GetFailureHandlingOptions();
                        opt.SetFailuresPreprocessor(new SansAvertissements());
                        t.SetFailureHandlingOptions(opt);
                        t.Start();
                        try
                        {
                            var res = gen.Generer(spool, elements);
                            if (t.Commit() != TransactionStatus.Committed) res.Avertissements.Add("génération annulée par Revit");
                            resultats.Add(res);
                            if (!res.Ignore) spools.Add(spool);
                        }
                        catch (Exception ex)
                        {
                            if (t.HasStarted() && !t.HasEnded()) t.RollBack();
                            resultats.Add(new Resultat { Spool = nom, Ignore = true, Avertissements = { "erreur : " + ex.Message } });
                        }
                    }
                }
                tg.Assimilate();
            }

            var exports = Exporter(doc, r, spools, resultats);
            Bilan(resultats, exports);

            var premiere = resultats.FirstOrDefault(x => !x.Ignore && x.Feuille != ElementId.InvalidElementId);
            if (premiere != null && doc.GetElement(premiere.Feuille) is View v) uidoc.ActiveView = v;
            return Result.Succeeded;
        }

        static List<string> Exporter(Document doc, Reglages r, List<Spool> spools, List<Resultat> resultats)
        {
            var notes = new List<string>();
            if (spools.Count == 0 || !(r.ExportPdf || r.ExportPcf || r.ExportCsv)) return notes;
            try { Directory.CreateDirectory(r.Dossier); }
            catch (Exception ex) { notes.Add("Dossier d'export inaccessible : " + ex.Message); return notes; }

            var projet = doc.ProjectInformation?.Name ?? doc.Title;
            int pdf = 0, pcf = 0;
            foreach (var s in spools)
            {
                var res = resultats.First(x => x.Spool == s.Nom);
                var fichier = NomFichier("ISO " + s.Nom);
                if (r.ExportPcf)
                {
                    try { File.WriteAllText(Path.Combine(r.Dossier, fichier + ".pcf"), ExportPcf.Generer(s, projet), Encoding.ASCII); pcf++; }
                    catch (Exception ex) { res.Avertissements.Add("PCF : " + ex.Message); }
                }
                if (r.ExportPdf && res.Feuille != ElementId.InvalidElementId)
                {
                    try
                    {
                        var opt = new PDFExportOptions
                        {
                            FileName = fichier, Combine = true, HideCropBoundaries = true, HideScopeBoxes = true,
                            HideReferencePlane = true, HideUnreferencedViewTags = true, ZoomType = ZoomType.Zoom, ZoomPercentage = 100,
                        };
                        if (doc.Export(r.Dossier, new List<ElementId> { res.Feuille }, opt)) pdf++;
                        else res.Avertissements.Add("PDF non créé");
                    }
                    catch (Exception ex) { res.Avertissements.Add("PDF : " + ex.Message); }
                }
            }
            if (r.ExportCsv)
            {
                try
                {
                    var utf8 = new UTF8Encoding(true);
                    File.WriteAllText(Path.Combine(r.Dossier, "Nomenclature spools.csv"), ExportCsv.Nomenclature(spools), utf8);
                    File.WriteAllText(Path.Combine(r.Dossier, "Soudures spools.csv"), ExportCsv.Soudures(spools), utf8);
                    File.WriteAllText(Path.Combine(r.Dossier, "Cotes spools.csv"), ExportCsv.Cotes(spools), utf8);
                    File.WriteAllText(Path.Combine(r.Dossier, "Liaisons spools.csv"), ExportCsv.Liaisons(spools), utf8);
                    File.WriteAllText(Path.Combine(r.Dossier, "Quantitatif chiffrage Pipe-Fit.csv"), Quantitatif.Csv(spools), utf8);
                    // Liste de débit de l'atelier : par système de canalisation, DN, matière ; barres du commerce (longueur réglée, 6 m)
                    File.WriteAllText(Path.Combine(r.Dossier, "Liste de débit.csv"), ListeDebit.Csv(spools, r.LongueurMaxM > 0 ? r.LongueurMaxM * 1000 : 6000, 3), utf8);
                    notes.Add("CSV : nomenclature, soudures, cotes, liaisons, « Quantitatif chiffrage Pipe-Fit.csv » et « Liste de débit.csv » (atelier, barres de 6 m)");
                }
                catch (Exception ex) { notes.Add("CSV : " + ex.Message); }
            }
            if (r.ExportPdf) notes.Insert(0, "PDF : " + pdf + " fichier(s)");
            if (r.ExportPcf) notes.Insert(0, "PCF : " + pcf + " fichier(s)");
            notes.Add("Dossier : " + r.Dossier);
            return notes;
        }

        static string NomFichier(string s)
        {
            foreach (var c in Path.GetInvalidFileNameChars()) s = s.Replace(c, '_');
            return s.Trim();
        }

        static void Bilan(List<Resultat> resultats, List<string> exports)
        {
            var ok = resultats.Where(x => !x.Ignore).ToList();
            var sb = new StringBuilder();
            foreach (var x in resultats)
            {
                sb.Append(x.Ignore ? "✗ " : "✓ ").Append(x.Spool);
                if (!x.Ignore) sb.Append(" → feuille ").Append(x.NumeroFeuille).Append(" (1:").Append(x.Echelle).Append(')');
                if (x.Avertissements.Count > 0) sb.Append(" – ").Append(string.Join(" ; ", x.Avertissements));
                sb.AppendLine();
            }
            if (exports.Count > 0) sb.AppendLine().AppendLine(string.Join(Environment.NewLine, exports));
            var td = new TaskDialog("Pipe-Fit – Isométries")
            {
                MainInstruction = ok.Count + " isométrie" + (ok.Count > 1 ? "s" : "") + " de fabrication générée" + (ok.Count > 1 ? "s" : ""),
                MainContent = sb.ToString(),
            };
            td.Show();
        }
    }

    /// <summary>Fenêtre principale de Revit comme propriétaire de la boîte de dialogue.</summary>
    sealed class FenetreRevit : System.Windows.Forms.IWin32Window
    {
        public FenetreRevit(IntPtr h) { Handle = h; }
        public IntPtr Handle { get; }
    }
}
