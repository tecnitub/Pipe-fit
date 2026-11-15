// Commande « Paramètres Pipe-Fit » : crée d'avance, dans le projet ou le gabarit, les paramètres partagés du complément
// (Numéro de spool, Soudures chantier, Pouces soudures), pour les nomenclatures et étiquettes Revit.
using System;
using System.IO;
using System.Linq;
using System.Text;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace PipeFit.Isometries.Revit
{
    [Transaction(TransactionMode.Manual)]
    public sealed class CmdParametres : IExternalCommand
    {
        public Result Execute(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var doc = data.Application.ActiveUIDocument?.Document;
            if (doc == null || doc.IsFamilyDocument) { message = "Ouvrez un projet ou un gabarit de projet Revit."; return Result.Failed; }
            System.Collections.Generic.List<(string Nom, bool Cree)> res;
            using (var t = new Transaction(doc, "Pipe-Fit : paramètres"))
            {
                t.Start();
                try { res = ParametreSpool.CreerTous(doc, data.Application.Application); }
                catch (Exception ex) { t.RollBack(); message = "Création des paramètres impossible : " + ex.Message; return Result.Failed; }
                t.Commit();
            }
            var sb = new StringBuilder();
            foreach (var (nom, cree) in res) sb.AppendLine((cree ? "✓ créé : " : "• déjà présent : ") + nom);
            sb.AppendLine();
            sb.AppendLine("Paramètres d'occurrence des canalisations, raccords, accessoires, canalisations souples et pièces de fabrication.");
            sb.AppendLine("- Numéro de spool : rempli par « Numéroter spools » (ou à la main).");
            sb.AppendLine("- Soudures chantier (Pipe-Fit) : rempli par « Soudure chantier » ; ne pas modifier à la main.");
            sb.AppendLine("- Pouces soudures (Pipe-Fit) : rempli par « Isométries spools » ; chaque soudure est comptée une fois.");
            sb.AppendLine("Ajoutez-les à vos nomenclatures Revit (regroupement par « Numéro de spool », total des pouces).");
            sb.AppendLine();
            sb.Append("Fichier de paramètres partagés : " + Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PipeFit", "Parametres partages Pipe-Fit.txt"));
            new TaskDialog("Pipe-Fit – Paramètres")
            {
                MainInstruction = res.Count(x => x.Cree) > 0 ? res.Count(x => x.Cree) + " paramètre(s) créé(s)" : "Les paramètres Pipe-Fit sont déjà dans le projet",
                MainContent = sb.ToString(),
            }.Show();
            return Result.Succeeded;
        }
    }
}
