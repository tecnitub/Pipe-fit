// Onglet « Pipe-Fit » du ruban Revit, groupe « Fabrication », bouton « Isométries spools ».
using System;
using System.Reflection;
using System.Windows.Media.Imaging;
using Autodesk.Revit.UI;

namespace PipeFit.Isometries.Revit
{
    public sealed class App : IExternalApplication
    {
        const string Onglet = "Pipe-Fit";

        public Result OnStartup(UIControlledApplication app)
        {
            try { app.CreateRibbonTab(Onglet); } catch { /* onglet déjà créé par un autre complément Pipe-Fit */ }
            var panneau = app.CreateRibbonPanel(Onglet, "Fabrication");
            var bouton = new PushButtonData("PipeFitIsometries", "Isométries\nspools", Assembly.GetExecutingAssembly().Location, typeof(CmdIsometries).FullName)
            {
                ToolTip = "Génère une isométrie de fabrication par numéro de spool : vue 3D isolée, nomenclature repérée, liste de débit, soudures.",
                LongDescription = "Lit le numéro de spool renseigné sur les canalisations, raccords et accessoires, puis crée pour chaque spool "
                    + "une feuille avec la vue isométrique verrouillée, les repères, la nomenclature, la liste de débit des tubes et le décompte "
                    + "des soudures (pouces-diamètre). Exports PDF, PCF (Isogen) et CSV (chiffrage Pipe-Fit).",
                LargeImage = Image("icone32.png"),
                Image = Image("icone16.png"),
            };
            panneau.AddItem(bouton);
            return Result.Succeeded;
        }

        public Result OnShutdown(UIControlledApplication app) => Result.Succeeded;

        static BitmapSource Image(string nom)
        {
            try
            {
                var flux = Assembly.GetExecutingAssembly().GetManifestResourceStream("PipeFit.Isometries.Resources." + nom);
                if (flux == null) return null;
                var dec = new PngBitmapDecoder(flux, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
                return dec.Frames[0];
            }
            catch (Exception) { return null; }
        }
    }
}
