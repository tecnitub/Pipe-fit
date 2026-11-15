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
            panneau.AddItem(new PushButtonData("PipeFitNumeroter", "Numéroter\nspools", Assembly.GetExecutingAssembly().Location, typeof(CmdNumeroter).FullName)
            {
                ToolTip = "Attribue les numéros de spool : à la sélection (complétée jusqu'aux brides) ou par découpage automatique aux joints boulonnés.",
                LongDescription = "Sélectionnez un élément d'un spool (un tube suffit) puis cliquez : tout ce qui lui est soudé jusqu'aux brides reçoit le "
                    + "prochain numéro libre (SP-001, SP-002…). Sans sélection, ou en mode automatique, toute la tuyauterie sans numéro est découpée en "
                    + "spools aux brides et vannes et numérotée à la suite. Le paramètre « Numéro de spool » est créé dans le projet s'il manque.",
                LargeImage = Image("numeroter32.png"),
                Image = Image("numeroter16.png"),
            });
            panneau.AddItem(bouton);
            panneau.AddItem(new PushButtonData("PipeFitQuantitatif", "Quantitatif\nchiffrage", Assembly.GetExecutingAssembly().Location, typeof(CmdQuantitatif).FullName)
            {
                ToolTip = "Exporte le quantitatif du projet pour le chiffrage automatique dans Pipe-Fit (Devis → Chiffrage depuis plan).",
                LongDescription = "Fournitures par réseau (tubes en longueur, raccords et robinetterie en nombre, par DN et matériau) et soudures réelles "
                    + "de la maquette : atelier dans les spools, chantier entre spools ; joints boulonnés. La tuyauterie pas encore découpée en spools "
                    + "est comptée aussi, ses soudures étant réparties atelier / chantier par le chiffrage.",
                LargeImage = Image("quantitatif32.png"),
                Image = Image("quantitatif16.png"),
            });
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
