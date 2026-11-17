// Base des commandes Pipe-Fit : toute erreur est affichée en clair (message et détail) et écrite dans le journal
// %AppData%\PipeFit\journal.txt, à envoyer pour le dépannage.
using System;
using System.IO;
using System.Text;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace PipeFit.Isometries.Revit
{
    public abstract class CommandeBase : IExternalCommand
    {
        public Result Execute(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var nom = GetType().Name;
            try
            {
                Journal.Ecrire(nom + " : début (Revit " + data.Application.Application.VersionNumber + ")");
                var res = Executer(data, ref message, elementsErreur);
                Journal.Ecrire(nom + " : " + res + (string.IsNullOrEmpty(message) ? "" : " – " + message));
                return res;
            }
            catch (Autodesk.Revit.Exceptions.OperationCanceledException)
            {
                Journal.Ecrire(nom + " : annulé");
                return Result.Cancelled;
            }
            catch (Exception ex)
            {
                Journal.Ecrire(nom + " : ERREUR\n" + ex);
                new TaskDialog("Pipe-Fit – erreur")
                {
                    MainInstruction = "La commande s'est arrêtée sur une erreur",
                    MainContent = ex.Message + "\n\nRien n'a été modifié par l'étape en cours. Envoyez le fichier journal pour le dépannage :\n" + Journal.Chemin,
                    ExpandedContent = ex.ToString(),
                }.Show();
                return Result.Cancelled;
            }
        }

        protected abstract Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur);
    }

    public static class Journal
    {
        public static string Chemin => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PipeFit", "journal.txt");

        public static void Ecrire(string texte)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(Chemin));
                // Journal limité : au-delà de 2 Mo, on repart d'un fichier neuf
                if (File.Exists(Chemin) && new FileInfo(Chemin).Length > 2_000_000) File.Delete(Chemin);
                File.AppendAllText(Chemin, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + texte + Environment.NewLine, Encoding.UTF8);
            }
            catch { }
        }
    }
}
