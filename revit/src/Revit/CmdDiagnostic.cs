// Commande « Diagnostic » : rapport Excel sur ce que Pipe-Fit comprend du projet, à envoyer pour la mise au point :
// versions, éléments par catégorie, paramètres Pipe-Fit, robinetterie (genre / symbole reconnu ou raccord), raccords
// (type déduit), systèmes (classification, aller / retour détecté, style), équipements (production / pompe, pertes de
// charge et débits trouvés) et fin du journal des erreurs.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Mechanical;
using Autodesk.Revit.DB.Plumbing;
using Autodesk.Revit.UI;
using PipeFit.Isometries.Core;
using TaskDialog = Autodesk.Revit.UI.TaskDialog;
using SaveFileDialog = System.Windows.Forms.SaveFileDialog;
using DialogResult = System.Windows.Forms.DialogResult;

namespace PipeFit.Isometries.Revit
{
    [Transaction(TransactionMode.ReadOnly)]
    public sealed class CmdDiagnostic : CommandeBase
    {
        static Cellule T(string s) => new Cellule(s ?? "");
        static Cellule H(string s) => new Cellule(s, StyleCellule.Entete);
        static Cellule Nb(double v) => new Cellule(v, StyleCellule.Entier);

        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            var feuilles = new List<FeuilleXlsx>();
            string Fam(Element e) => (doc.GetElement(e.GetTypeId()) as ElementType)?.FamilyName ?? "";
            string Typ(Element e) => e.Name;

            // Résumé
            var res = new FeuilleXlsx { Nom = "Résumé", Largeurs = { 40, 60 } };
            res.Ajouter(new Cellule("Diagnostic Pipe-Fit", StyleCellule.Titre));
            res.Ajouter(T("Date"), T(DateTime.Now.ToString("dd/MM/yyyy HH:mm")));
            res.Ajouter(T("Revit"), T(data.Application.Application.VersionName + " (" + data.Application.Application.VersionBuild + ")"));
            res.Ajouter(T("Pipe-Fit"), T(Assembly.GetExecutingAssembly().GetName().Version?.ToString()));
            res.Ajouter(T("Projet"), T(doc.Title));
            res.Vide();
            res.Ajouter(H("Catégorie"), H("Éléments"));
            var cats = new[] { (BuiltInCategory.OST_PipeCurves, "Canalisations"), (BuiltInCategory.OST_PipeFitting, "Raccords de canalisation"), (BuiltInCategory.OST_PipeAccessory, "Accessoires de canalisation"),
                (BuiltInCategory.OST_FlexPipeCurves, "Canalisations souples"), (BuiltInCategory.OST_DuctCurves, "Gaines"), (BuiltInCategory.OST_DuctFitting, "Raccords de gaine"),
                (BuiltInCategory.OST_DuctAccessory, "Accessoires de gaine"), (BuiltInCategory.OST_DuctTerminal, "Bouches d'aération"), (BuiltInCategory.OST_MechanicalEquipment, "Équipements de génie climatique"),
                (BuiltInCategory.OST_PlumbingFixtures, "Appareils sanitaires"), (BuiltInCategory.OST_FabricationPipework, "Tuyauterie MEP Fabrication") };
            foreach (var (c, lib) in cats)
                res.Ajouter(T(lib), Nb(new FilteredElementCollector(doc).OfCategory(c).WhereElementIsNotElementType().GetElementCount()));
            res.Vide();
            res.Ajouter(H("Paramètre Pipe-Fit"), H("Présent dans le projet"));
            var partages = new HashSet<string>(new FilteredElementCollector(doc).OfClass(typeof(SharedParameterElement)).Select(p => p.Name));
            foreach (var p in new[] { ParametreSpool.Nom, ParametreSpool.NomEnsemble, ParametreSpool.NomSoudures, ParametreSpool.NomPouces, ParametreSpool.NomCotes,
                PertesFabricant.NomBouche, PertesFabricant.NomHydraulique, PertesFabricant.NomAeraulique, PertesFabricant.NomDebitHydraulique, PertesFabricant.NomDebitAeraulique })
                res.Ajouter(T(p), T(partages.Contains(p) ? "oui" : "non"));
            feuilles.Add(res);

            // Robinetterie et accessoires : genre reconnu par le nom de famille
            var rob = new FeuilleXlsx { Nom = "Robinetterie", Largeurs = { 36, 30, 10, 22, 22, 14 }, LigneEntete = 0, NbColonnesFiltre = 6 };
            rob.Ajouter(H("Famille"), H("Types"), H("Nombre"), H("Reconnu comme"), H("Symbole d'isométrie"), H("DN"));
            foreach (var g in new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_PipeAccessory).WhereElementIsNotElementType().GroupBy(Fam).OrderBy(g => g.Key))
            {
                var e0 = g.First();
                var c = LectureModele.Lire(doc, e0); c.EstAccessoire = true;
                var sp = new Spool(); sp.Composants.Add(c);
                try { AnalyseSpool.Analyser(sp); } catch { }
                var r = Robinetterie.Raccord(g.Key);
                var dns = g.Select(e => LectureModele.Lire(doc, e).DnMm).Where(d => d > 0).Distinct().OrderBy(d => d).Select(d => "DN" + Math.Round(d)).ToList();
                rob.Ajouter(T(g.Key), T(string.Join(", ", g.Select(Typ).Distinct().Take(6))), Nb(g.Count()),
                    T(r != null ? AnalyseSpool.Libelle(r.Value) + " (raccord)" : Robinetterie.Libelle(c.Genre) is string l && l != "" ? l : "Vanne (par défaut)"),
                    T(r != null ? "bride / raccord" : Robinetterie.Symbolise(c) ? Legende.Code(c.Genre) : "–"), T(string.Join(" ", dns.Take(5))));
            }
            feuilles.Add(rob);

            // Raccords : type déduit
            var rac = new FeuilleXlsx { Nom = "Raccords", Largeurs = { 36, 30, 10, 22 }, LigneEntete = 0, NbColonnesFiltre = 4 };
            rac.Ajouter(H("Famille"), H("Types"), H("Nombre"), H("Type Pipe-Fit"));
            foreach (var g in new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_PipeFitting).WhereElementIsNotElementType().GroupBy(Fam).OrderBy(g => g.Key))
            {
                var c = LectureModele.Lire(doc, g.First());
                rac.Ajouter(T(g.Key), T(string.Join(", ", g.Select(Typ).Distinct().Take(6))), Nb(g.Count()), T(AnalyseSpool.Libelle(AnalyseSpool.Classer(c))));
            }
            feuilles.Add(rac);

            // Systèmes
            var sys = new FeuilleXlsx { Nom = "Systèmes", Largeurs = { 30, 30, 14, 26, 14, 18 }, LigneEntete = 0, NbColonnesFiltre = 6 };
            sys.Ajouter(H("Système"), H("Type de système"), H("Abréviation"), H("Classification"), H("Aller / retour"), H("Couleur de ligne"));
            foreach (var s in new FilteredElementCollector(doc).OfClass(typeof(MEPSystem)).Cast<MEPSystem>().OrderBy(s => s.Name))
            {
                var type = doc.GetElement(s.GetTypeId()) as MEPSystemType;
                string classe = s is PipingSystem ps ? ps.SystemType.ToString() : s is MechanicalSystem ms ? ms.SystemType.ToString() : "";
                bool retour = (s is PipingSystem p2 && (p2.SystemType == PipeSystemType.ReturnHydronic || AnalyseSpool.Normaliser(s.Name).Contains("retour")))
                    || (s is MechanicalSystem m2 && (m2.SystemType == DuctSystemType.ReturnAir || m2.SystemType == DuctSystemType.ExhaustAir));
                var col = type?.LineColor;
                sys.Ajouter(T(s.Name), T(type?.Name), T(type?.Abbreviation), T(classe), T(retour ? "retour" : "aller"),
                    T(col != null && col.IsValid ? "RVB " + col.Red + " " + col.Green + " " + col.Blue : "non définie"));
            }
            feuilles.Add(sys);

            // Équipements et bouches
            var eq = new FeuilleXlsx { Nom = "Équipements", Largeurs = { 36, 24, 18, 22, 30, 22, 30 }, LigneEntete = 0, NbColonnesFiltre = 7 };
            eq.Ajouter(H("Famille"), H("Type"), H("Rôle reconnu"), H("Perte de charge"), H("Source de la valeur"), H("Débit"), H("Source du débit"));
            foreach (var e in new FilteredElementCollector(doc).WherePasses(new ElementMulticategoryFilter(new List<BuiltInCategory> { BuiltInCategory.OST_MechanicalEquipment, BuiltInCategory.OST_DuctTerminal }))
                .WhereElementIsNotElementType().Take(400))
            {
                var nom = AnalyseSpool.Normaliser(Fam(e) + " " + Typ(e));
                bool bouche = Compat.EstCategorie(e, BuiltInCategory.OST_DuctTerminal);
                var role = bouche ? "bouche" : CmdPid.Pompe.IsMatch(nom) ? "pompe" : CmdPid.Source.IsMatch(nom) ? "production / CTA (source)" : "équipement";
                var gp = bouche ? GenrePerte.Bouche : (LectureModele.Connecteurs(e).Any() ? GenrePerte.Hydraulique : GenrePerte.Aeraulique);
                var gd = bouche || gp == GenrePerte.Aeraulique ? GenrePerte.DebitAeraulique : GenrePerte.DebitHydraulique;
                var p = ParametresPerte.Lire(e, gp); var pt = p == null ? ParametresPerte.Trouver(e, gp) : null;
                var q = ParametresPerte.Lire(e, gd); var qt = q == null ? ParametresPerte.Trouver(e, gd) : null;
                eq.Ajouter(T(Fam(e)), T(Typ(e)), T(role),
                    T(p.HasValue ? Math.Round(p.Value) + " Pa" : pt.HasValue ? Math.Round(pt.Value.Pa) + " Pa" : "–"), T(p.HasValue ? "paramètre Pipe-Fit" : pt?.Source ?? "à saisir"),
                    T(q.HasValue ? Math.Round(q.Value, 2) + " m³/h" : qt.HasValue ? Math.Round(qt.Value.Pa, 2) + " m³/h" : "–"), T(q.HasValue ? "paramètre Pipe-Fit" : qt?.Source ?? "à saisir"));
            }
            feuilles.Add(eq);

            // Journal
            var jr = new FeuilleXlsx { Nom = "Journal", Largeurs = { 160 } };
            try
            {
                if (File.Exists(Journal.Chemin)) foreach (var l in File.ReadAllLines(Journal.Chemin).Skip(Math.Max(0, File.ReadAllLines(Journal.Chemin).Length - 400))) jr.Ajouter(T(l));
                else jr.Ajouter(T("Pas de journal (aucune commande lancée ou aucune erreur)."));
            }
            catch (Exception ex) { jr.Ajouter(T("Journal illisible : " + ex.Message)); }
            feuilles.Add(jr);

            string fichier;
            using (var dlg = new SaveFileDialog { Title = "Diagnostic Pipe-Fit", Filter = "Classeur Excel (*.xlsx)|*.xlsx", FileName = "Diagnostic Pipe-Fit - " + string.Concat(doc.Title.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c)) + ".xlsx" })
            {
                if (dlg.ShowDialog(new FenetreRevit(data.Application.MainWindowHandle)) != DialogResult.OK) return Result.Cancelled;
                fichier = dlg.FileName;
            }
            try { File.WriteAllBytes(fichier, Xlsx.Ecrire(feuilles)); }
            catch (Exception ex) { message = "Écriture impossible : " + ex.Message; return Result.Failed; }
            try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(fichier) { UseShellExecute = true }); } catch { }
            TaskDialog.Show("Pipe-Fit – Diagnostic", "Rapport enregistré :\n" + fichier + "\n\nIl montre ce que Pipe-Fit reconnaît dans votre projet (robinetterie, raccords, systèmes aller / retour, "
                + "pertes de charge et débits) et la fin du journal des erreurs. Envoyez-le pour la mise au point.");
            return Result.Succeeded;
        }
    }
}
