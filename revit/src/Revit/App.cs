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
            // Mode manuel le plus direct : sélectionner la tuyauterie avec Ctrl, cliquer, l'isométrie est générée
            panneau.AddItem(new PushButtonData("PipeFitGenererSpool", "Générer\nun spool", Assembly.GetExecutingAssembly().Location, typeof(CmdGenererSpool).FullName)
            {
                ToolTip = "Sélectionnez avec Ctrl toute une partie de tuyauterie, puis cliquez : numéro de spool attribué et isométrie générée.",
                LongDescription = "Les éléments sélectionnés (canalisations, raccords, accessoires) reçoivent le prochain numéro de spool, modifiable ; "
                    + "le paramètre « Numéro de spool » est créé s'il manque ; l'isométrie de ce spool est générée et ouverte. "
                    + "Sans sélection, cliquez les éléments puis Terminer.",
                LargeImage = Image("icone32.png"),
                Image = Image("icone16.png"),
            });
            panneau.AddItem(new PushButtonData("PipeFitParametres", "Paramètres\nPipe-Fit", Assembly.GetExecutingAssembly().Location, typeof(CmdParametres).FullName)
            {
                ToolTip = "Crée dans le projet (ou le gabarit) les paramètres Numéro de spool, Soudures chantier et Pouces soudures.",
                LongDescription = "Paramètres partagés d'occurrence sur les canalisations, raccords et accessoires, à ajouter à vos nomenclatures et étiquettes. "
                    + "Les autres boutons les créent aussi tout seuls au besoin.",
                LargeImage = Image("parametres32.png"),
                Image = Image("parametres16.png"),
            });
            panneau.AddItem(new PushButtonData("PipeFitNumeroter", "Numéroter\nspools", Assembly.GetExecutingAssembly().Location, typeof(CmdNumeroter).FullName)
            {
                ToolTip = "Attribue les numéros de spool : à la sélection (complétée jusqu'aux brides) ou par découpage automatique aux joints boulonnés.",
                LongDescription = "Sélectionnez un élément d'un spool (un tube suffit) puis cliquez : tout ce qui lui est soudé jusqu'aux brides reçoit le "
                    + "prochain numéro libre (SP-001, SP-002…). Sans sélection, ou en mode automatique, toute la tuyauterie sans numéro est découpée en "
                    + "spools aux brides et vannes et numérotée à la suite. Le paramètre « Numéro de spool » est créé dans le projet s'il manque.",
                LargeImage = Image("numeroter32.png"),
                Image = Image("numeroter16.png"),
            });
            panneau.AddItem(new PushButtonData("PipeFitSoudureChantier", "Soudure\nchantier", Assembly.GetExecutingAssembly().Location, typeof(CmdSoudureChantier).FullName)
            {
                ToolTip = "Marque un joint comme soudure de chantier (transport, incertitude), avec une surlongueur à recouper sur place.",
                LongDescription = "Cliquez près des joints dans la vue : le spool y est coupé (la plus petite partie prend le numéro suivant), la soudure "
                    + "apparaît en R… sur l'isométrie et la surlongueur s'ajoute au débit du tube. Cliquer un joint marqué retire la marque.",
                LargeImage = Image("soudure32.png"),
                Image = Image("soudure16.png"),
            });
            panneau.AddItem(bouton);
            panneau.AddItem(new PushButtonData("PipeFitCote", "Ajouter\nune cote", Assembly.GetExecutingAssembly().Location, typeof(CmdCote).FullName)
            {
                ToolTip = "Ajoute une cote que la cotation automatique n'a pas faite : cliquez deux points, la valeur est calculée.",
                LongDescription = "Dans la vue 3D de l'isométrie (ou une vue de la maquette), cliquez deux éléments : chaque clic s'accroche au point "
                    + "d'attache le plus proche (axe d'un coude, d'un té, d'un piquage, axe d'une vanne, face de bride, bout de tube). La valeur "
                    + "est recalculée sur la géométrie à chaque génération. Recliquer les deux mêmes points retire la cote. Échap pour terminer.",
                LargeImage = Image("cote32.png"),
                Image = Image("cote16.png"),
            });
            panneau.AddItem(new PushButtonData("PipeFitEnsembles", "Ensembles\nspools", Assembly.GetExecutingAssembly().Location, typeof(CmdEnsembles).FullName)
            {
                ToolTip = "Regroupe les spools en ensembles de montage (zones géographiques) : « Ensemble A » = spools 1 à 10…",
                LongDescription = "Cochez des spools (ou une plage, ou ceux de la sélection) et nommez leur ensemble ; écrit dans le paramètre « Ensemble de spools ». "
                    + "Le repérage peut ensuite faire une vue par ensemble, par système, ou par système et ensemble.",
                LargeImage = Image("ensembles32.png"),
                Image = Image("ensembles16.png"),
            });
            panneau.AddItem(new PushButtonData("PipeFitReperage", "Repérage\nspools", Assembly.GetExecutingAssembly().Location, typeof(CmdReperage).FullName)
            {
                ToolTip = "Vue de repérage pour le montage : chaque spool dans sa couleur, son numéro et son ordre de montage, soudures de chantier marquées.",
                LongDescription = "Copie de la vue active (plan, coupe, 3D) ou nouvelle vue 3D de la tuyauterie ; feuille avec le tableau « ordre de montage » "
                    + "(posé contre, longueur de tube, feuille d'isométrie) et la légende des couleurs.",
                LargeImage = Image("reperage32.png"),
                Image = Image("reperage16.png"),
            });
            // Groupe « Calculs » : perte de charge hydraulique, débit / vitesse en ventilation
            var calculs = app.CreateRibbonPanel(Onglet, "Calculs");
            calculs.AddItem(new PushButtonData("PipeFitParametresPerte", "Paramètres\nperte de charge", Assembly.GetExecutingAssembly().Location, typeof(CmdParametresPerte).FullName)
            {
                ToolTip = "Crée les paramètres « Perte de charge bouche (Pa) », « … équipement hydraulique (kPa) », « … équipement aéraulique (Pa) » et y recopie les valeurs déjà présentes dans les familles.",
                LongDescription = "Paramètres partagés d'occurrence sur les bouches, équipements de génie climatique, accessoires de canalisation et de gaine. "
                    + "Les pertes de charge fabricant déjà présentes sous un autre nom ou une autre unité (Pressure Drop, ΔP (kPa), mbar, mCE, paramètre Revit "
                    + "« Perte de charge », raccordements de la famille) sont converties et recopiées. Les calculs de perte de charge lisent ces paramètres.",
                LargeImage = Image("parametres32.png"),
                Image = Image("parametres16.png"),
            });
            calculs.AddItem(new PushButtonData("PipeFitPerteCharge", "Perte de\ncharge", Assembly.GetExecutingAssembly().Location, typeof(CmdPerteCharge).FullName)
            {
                ToolTip = "Perte de charge hydraulique sur la tuyauterie sélectionnée (tubes, raccords, vannes) : vitesses, Pa/m, ΔP totale en kPa et mCE.",
                LongDescription = "Sélectionnez le chemin à calculer (avec Ctrl ou par fenêtre) puis cliquez. Diamètre intérieur et rugosité du segment de tuyau Revit, "
                    + "débit du calcul Revit (sinon débit saisi), fluide (eau, eau glycolée MEG / MPG) et température au choix. Darcy-Weisbach / Colebrook, "
                    + "ζ par raccord et par vanne modifiables. Note de calcul Excel.",
                LargeImage = Image("hydraulique32.png"),
                Image = Image("hydraulique16.png"),
            });
            calculs.AddItem(new PushButtonData("PipeFitPerteAeraulique", "Perte de charge\naéraulique", Assembly.GetExecutingAssembly().Location, typeof(CmdPerteAeraulique).FullName)
            {
                ToolTip = "Perte de charge aéraulique de la CTA à chaque bouche : chemin le plus défavorisé et pression du réseau au ventilateur.",
                LongDescription = "Sélectionnez une gaine (ou la CTA) du réseau puis cliquez. Pour chaque bouche, le chemin depuis la CTA : gaines (Pa/m), coudes, "
                    + "tés en passage ou en dérivation selon le chemin, transitions, registres, clapets coupe-feu, silencieux, bouche (perte fabricant à saisir). "
                    + "Débits : Revit, sinon somme des bouches en aval. Le chemin le plus défavorisé donne la pression du réseau ; sélection du chemin dans Revit "
                    + "et note de calcul Excel.",
                LargeImage = Image("aeraulique32.png"),
                Image = Image("aeraulique16.png"),
            });
            calculs.AddItem(new PushButtonData("PipeFitAeraulique", "Débit et vitesse\nventilation", Assembly.GetExecutingAssembly().Location, typeof(CmdAeraulique).FullName)
            {
                ToolTip = "Débit, vitesse et perte de charge sur les gaines de ventilation sélectionnées ; dimensionnement Ø / rectangulaire.",
                LongDescription = "Sélectionnez les gaines (réseau ou chemin) puis cliquez. Débit de chaque gaine : calcul Revit, sinon somme des bouches en aval "
                    + "de la CTA. Section, vitesse (alerte au-delà de la vitesse maximale), Pa/m, pertes des coudes, tés, registres, coupe-feu, silencieux. "
                    + "Outil de dimensionnement et note de calcul Excel.",
                LargeImage = Image("ventilation32.png"),
                Image = Image("ventilation16.png"),
            });
            panneau.AddItem(new PushButtonData("PipeFitQuantitatif", "Quantités\nExcel", Assembly.GetExecutingAssembly().Location, typeof(CmdQuantitatif).FullName)
            {
                ToolTip = "Exporte les quantités du projet vers Excel (synthèse, quantitatif, soudures, liste de débit, nomenclatures) ou en CSV pour le chiffrage Pipe-Fit.",
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
