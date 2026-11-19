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
            // Ruban regroupé : peu de gros boutons, les commandes voisines en menus déroulants ou en petits boutons empilés,
            // un nom unique par commande (pas deux « Paramètres »).

            // Spools : numéroter (ou générer un spool à partir de la sélection), soudures chantier, ensembles
            var spools = app.CreateRibbonPanel(Onglet, "Spools");
            var numeroter = (SplitButton)spools.AddItem(new SplitButtonData("PipeFitSpoolsMenu", "Numéroter") { ToolTip = "Numéroter les spools, ou générer un spool depuis la sélection." });
            numeroter.IsSynchronizedWithCurrentItem = true;
            numeroter.AddPushButton(B("PipeFitNumeroter", "Numéroter\nspools", typeof(CmdNumeroter), "numeroter", "Attribue les numéros de spool : à la sélection (complétée jusqu'aux brides) ou par découpage automatique aux joints boulonnés.",
                "Sélectionnez un élément d'un spool (un tube suffit) puis cliquez : tout ce qui lui est soudé jusqu'aux brides reçoit le "
                    + "prochain numéro libre (SP-001, SP-002…). Sans sélection, ou en mode automatique, toute la tuyauterie sans numéro est découpée en "
                    + "spools aux brides et vannes et numérotée à la suite. Le paramètre « Numéro de spool » est créé dans le projet s'il manque."));
            numeroter.AddPushButton(B("PipeFitGenererSpool", "Générer\nun spool", typeof(CmdGenererSpool), "icone", "Sélectionnez avec Ctrl toute une partie de tuyauterie, puis cliquez : numéro de spool attribué et isométrie générée.",
                "Les éléments sélectionnés (canalisations, raccords, accessoires) reçoivent le prochain numéro de spool, modifiable ; "
                    + "le paramètre « Numéro de spool » est créé s'il manque ; l'isométrie de ce spool est générée et ouverte. "
                    + "Sans sélection, cliquez les éléments puis Terminer."));
            spools.AddStackedItems(B("PipeFitSoudureChantier", "Soudure chantier", typeof(CmdSoudureChantier), "soudure", "Marque un joint comme soudure de chantier (transport, incertitude), avec une surlongueur à recouper sur place.",
                "Cliquez près des joints dans la vue : le spool y est coupé (la plus petite partie prend le numéro suivant), la soudure "
                    + "apparaît en R… sur l'isométrie et la surlongueur s'ajoute au débit du tube. Cliquer un joint marqué retire la marque."),
                B("PipeFitEnsembles", "Ensembles de spools", typeof(CmdEnsembles), "ensembles", "Regroupe les spools en ensembles de montage (zones géographiques) : « Ensemble A » = spools 1 à 10…",
                "Cochez des spools (ou une plage, ou ceux de la sélection) et nommez leur ensemble ; écrit dans le paramètre « Ensemble de spools ». "
                    + "Le repérage peut ensuite faire une vue par ensemble, par système, ou par système et ensemble."));

            // Isométries : génération, cotes ajoutées, repérage de montage, quantités
            var iso = app.CreateRibbonPanel(Onglet, "Isométries");
            iso.AddItem(B("PipeFitIsometries", "Isométries\nspools", typeof(CmdIsometries), "icone", "Génère une isométrie de fabrication par numéro de spool : vue 3D isolée, nomenclature repérée, liste de débit, soudures.",
                "Lit le numéro de spool renseigné sur les canalisations, raccords et accessoires, puis crée pour chaque spool "
                    + "une feuille avec la vue isométrique verrouillée, les repères, la nomenclature, la liste de débit des tubes et le décompte "
                    + "des soudures (pouces-diamètre). Exports PDF, PCF (Isogen) et CSV (chiffrage Pipe-Fit)."));
            iso.AddStackedItems(B("PipeFitCote", "Ajouter une cote", typeof(CmdCote), "cote", "Ajoute une cote à l'isométrie, prise en plan ou en coupe comme une cote alignée : conversion de cotes alignées Revit, ou deux points cliqués avec accrochage.",
                "Dans une vue en plan ou une coupe : dessinez la cote avec l'outil Revit « Cote alignée » (accrochage précis aux axes et extrémités), "
                    + "sélectionnez-la et cliquez ; ou cliquez deux points. Chaque ligne d'attache est rattachée au point d'attache de la pièce visée (axe d'un coude / té, "
                    + "axe d'une vanne, face de bride, bout de tube). La valeur, mesurée suivant la direction de la cote, est recalculée à chaque génération."),
                B("PipeFitReperage", "Repérage de montage", typeof(CmdReperage), "reperage", "Vue de repérage pour le montage : chaque spool dans sa couleur, son numéro et son ordre de montage, soudures de chantier marquées.",
                "Copie de la vue active (plan, coupe, 3D) ou nouvelle vue 3D de la tuyauterie ; feuille avec le tableau « ordre de montage » "
                    + "(posé contre, longueur de tube, feuille d'isométrie) et la légende des couleurs."),
                B("PipeFitQuantitatif", "Quantités Excel", typeof(CmdQuantitatif), "quantitatif", "Exporte les quantités du projet vers Excel (synthèse, quantitatif, soudures, liste de débit, nomenclatures) ou en CSV pour le chiffrage Pipe-Fit.",
                "Fournitures par réseau (tubes en longueur, raccords et robinetterie en nombre, par DN et matériau) et soudures réelles "
                    + "de la maquette : atelier dans les spools, chantier entre spools ; joints boulonnés. La tuyauterie pas encore découpée en spools "
                    + "est comptée aussi, ses soudures étant réparties atelier / chantier par le chiffrage."));

            // Schémas de principe
            var schemas = app.CreateRibbonPanel(Onglet, "Schémas");
            schemas.AddItem(B("PipeFitPid", "Schéma de\nprincipe (P&ID)", typeof(CmdPid), "pid", "Schémas de principe (P&ID) filaires repris de la maquette 3D. Sans sélection : les P&ID du projet (PID chaud, froid, aéraulique…), dont vous choisissez les systèmes.",
                "Sélectionnez un élément du réseau (tuyauterie ou gaine) puis cliquez : tout le réseau relié (ou la sélection seulement) est "
                    + "redessiné en schéma filaire dans une nouvelle vue de dessin. Tubes, coudes et brides fondus en lignes ; tronc horizontal, dérivations "
                    + "sur leur propre ligne sans croisement ; aller avant retour, boucles fermées par des renvois « vers … » ; réseau et DN sur les lignes."));

            // Calculs : un menu par domaine
            var calculs = app.CreateRibbonPanel(Onglet, "Calculs");
            var hydro = (PulldownButton)calculs.AddItem(new PulldownButtonData("PipeFitMenuHydraulique", "Hydraulique")
                { ToolTip = "Perte de charge d'un chemin, équilibrage des boucles.", LargeImage = Image("hydraulique32.png"), Image = Image("hydraulique16.png") });
            hydro.AddPushButton(B("PipeFitPerteCharge", "Perte de charge (chemin sélectionné)", typeof(CmdPerteCharge), "hydraulique", "Perte de charge hydraulique sur la tuyauterie sélectionnée (tubes, raccords, vannes) : vitesses, Pa/m, ΔP totale en kPa et mCE.",
                "Sélectionnez le chemin à calculer (avec Ctrl ou par fenêtre) puis cliquez. Diamètre intérieur et rugosité du segment de tuyau Revit, "
                    + "débit du calcul Revit (sinon débit saisi), fluide (eau, eau glycolée MEG / MPG) et température au choix. Darcy-Weisbach / Colebrook, "
                    + "ζ par raccord et par vanne modifiables. Note de calcul Excel."));
            hydro.AddPushButton(B("PipeFitEquilibrage", "Équilibrage des boucles et Kv", typeof(CmdEquilibrage), "hydraulique", "Équilibrage du circuit : boucle de chaque équipement, boucle critique, pression à dissiper et Kv requis des vannes de réglage, point de fonctionnement de la pompe.",
                "Cliquez un élément du circuit (aller et retour dessinés). Source : production ou pompe ; consommateurs : équipements avec « Débit hydraulique (m³/h) ». "
                    + "Débits cumulés le long des boucles, pertes (tubes, raccords, tés selon les débits, vannes, pertes fabricant), Kv requis de chaque STAD / STAF, "
                    + "hauteur manométrique de la pompe ; note de calcul PDF / Excel."));
            var air = (PulldownButton)calculs.AddItem(new PulldownButtonData("PipeFitMenuAeraulique", "Aéraulique")
                { ToolTip = "Perte de charge du réseau (CTA → bouches), débit, vitesse et dimensionnement des gaines.", LargeImage = Image("aeraulique32.png"), Image = Image("aeraulique16.png") });
            air.AddPushButton(B("PipeFitPerteAeraulique", "Perte de charge du réseau (CTA → bouches)", typeof(CmdPerteAeraulique), "aeraulique", "Perte de charge aéraulique de la CTA à chaque bouche : chemin le plus défavorisé et pression du réseau au ventilateur.",
                "Sélectionnez une gaine (ou la CTA) du réseau puis cliquez. Pour chaque bouche, le chemin depuis la CTA : gaines (Pa/m), coudes, "
                    + "tés en passage ou en dérivation selon le chemin, transitions, registres, clapets coupe-feu, silencieux, bouche (perte fabricant à saisir). "
                    + "Débits : Revit, sinon somme des bouches en aval. Le chemin le plus défavorisé donne la pression du réseau ; sélection du chemin dans Revit "
                    + "et note de calcul Excel."));
            air.AddPushButton(B("PipeFitAeraulique", "Débit, vitesse et dimensionnement", typeof(CmdAeraulique), "ventilation", "Débit, vitesse et perte de charge sur les gaines de ventilation sélectionnées ; dimensionnement Ø / rectangulaire.",
                "Sélectionnez les gaines (réseau ou chemin) puis cliquez. Débit de chaque gaine : calcul Revit, sinon somme des bouches en aval "
                    + "de la CTA. Section, vitesse (alerte au-delà de la vitesse maximale), Pa/m, pertes des coudes, tés, registres, coupe-feu, silencieux. "
                    + "Outil de dimensionnement et note de calcul Excel."));

            // Réglages : paramètres du projet et diagnostic
            var reglages = app.CreateRibbonPanel(Onglet, "Réglages");
            reglages.AddStackedItems(B("PipeFitParametres", "Paramètres spools", typeof(CmdParametres), "parametres", "Crée dans le projet (ou le gabarit) les paramètres Numéro de spool, Soudures chantier et Pouces soudures.",
                "Paramètres partagés d'occurrence sur les canalisations, raccords et accessoires, à ajouter à vos nomenclatures et étiquettes. "
                    + "Les autres boutons les créent aussi tout seuls au besoin."),
                B("PipeFitParametresPerte", "Paramètres calculs", typeof(CmdParametresPerte), "parametres", "Crée les paramètres de perte de charge (bouche Pa, équipement hydraulique kPa, équipement aéraulique Pa) et de débit (hydraulique, aéraulique m³/h) et y recopie les valeurs déjà présentes dans les familles.",
                "Paramètres partagés d'occurrence sur les bouches, équipements de génie climatique, accessoires de canalisation et de gaine. "
                    + "Les pertes de charge fabricant déjà présentes sous un autre nom ou une autre unité (Pressure Drop, ΔP (kPa), mbar, mCE, paramètre Revit "
                    + "« Perte de charge », raccordements de la famille) sont converties et recopiées. Les calculs de perte de charge lisent ces paramètres."),
                B("PipeFitDiagnostic", "Diagnostic", typeof(CmdDiagnostic), "parametres", "Rapport Excel de ce que Pipe-Fit reconnaît dans le projet, avec le journal des erreurs, à envoyer pour la mise au point.",
                "Versions, éléments par catégorie, paramètres Pipe-Fit présents, robinetterie (genre et symbole reconnus d'après le nom de famille), "
                    + "raccords, systèmes (classification, aller / retour, couleur), équipements et bouches (rôle, pertes de charge et débits trouvés), fin du journal."));
            return Result.Succeeded;
        }

        static PushButtonData B(string nom, string texte, Type commande, string image, string info, string description) =>
            new PushButtonData(nom, texte, Assembly.GetExecutingAssembly().Location, commande.FullName)
            {
                ToolTip = info, LongDescription = description, LargeImage = Image(image + "32.png"), Image = Image(image + "16.png"),
            };

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
