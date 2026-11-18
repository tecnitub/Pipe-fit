// Commande « Paramètres perte de charge » : crée les paramètres Pipe-Fit « Perte de charge bouche (Pa) », « Perte de
// charge équipement hydraulique (kPa) », « Perte de charge équipement aéraulique (Pa) », puis recopie dedans les pertes
// de charge déjà présentes dans les familles sous un autre nom ou une autre unité (« Pressure Drop », « ΔP (kPa) »,
// paramètre Revit « Perte de charge », raccordements…), converties. Bilan : renseignés, récupérés, manquants.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using TaskDialog = Autodesk.Revit.UI.TaskDialog;

namespace PipeFit.Isometries.Revit
{
    [Transaction(TransactionMode.Manual)]
    public sealed class CmdParametresPerte : CommandeBase
    {
        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            if (doc.IsFamilyDocument) { message = "Commande disponible dans un projet."; return Result.Failed; }

            var choix = new TaskDialog("Pipe-Fit – Paramètres perte de charge")
            {
                MainInstruction = "Paramètres de perte de charge des bouches et des équipements",
                MainContent = "Crée les paramètres « " + ParametresPerte.Nom(GenrePerte.Bouche) + " » (bouches d'air), « " + ParametresPerte.Nom(GenrePerte.Hydraulique)
                    + " » (équipements de génie climatique, accessoires de canalisation) et « " + ParametresPerte.Nom(GenrePerte.Aeraulique)
                    + " » (équipements, accessoires de gaine), lus par les calculs de perte de charge.\n\n"
                    + "Les pertes de charge déjà présentes dans les familles sous un autre nom ou dans une autre unité (Pressure Drop, ΔP (kPa), mbar, mCE, "
                    + "paramètre Revit « Perte de charge », raccordements) sont recopiées et converties.",
                CommonButtons = TaskDialogCommonButtons.Cancel,
            };
            choix.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, "Créer les paramètres et récupérer les valeurs existantes", "Les valeurs déjà saisies dans les paramètres Pipe-Fit sont gardées.");
            choix.AddCommandLink(TaskDialogCommandLinkId.CommandLink2, "Créer les paramètres et tout remplacer par les valeurs des familles", "Écrase les valeurs Pipe-Fit quand la famille en donne une.");
            choix.AddCommandLink(TaskDialogCommandLinkId.CommandLink3, "Créer les paramètres seulement", "Aucune valeur n'est recopiée.");
            var r = choix.Show();
            if (r != TaskDialogResult.CommandLink1 && r != TaskDialogResult.CommandLink2 && r != TaskDialogResult.CommandLink3) return Result.Cancelled;
            bool recopier = r != TaskDialogResult.CommandLink3, remplacer = r == TaskDialogResult.CommandLink2;

            var bilan = new StringBuilder();
            using (var t = new Transaction(doc, "Pipe-Fit : paramètres perte de charge"))
            {
                t.Start();
                var crees = ParametresPerte.Creer(doc, data.Application.Application);
                doc.Regenerate();
                bilan.AppendLine(crees.Count > 0 ? "Paramètres créés : " + string.Join(", ", crees) + "." : "Les trois paramètres existaient déjà.");
                foreach (GenrePerte g in Enum.GetValues(typeof(GenrePerte)))
                {
                    var elements = new FilteredElementCollector(doc).WherePasses(new ElementMulticategoryFilter(ParametresPerte.Categories(g).ToList()))
                        .WhereElementIsNotElementType().Where(e => !(e is FamilyInstance fi) || fi.SuperComponent == null)
                        .Where(e => Concerne(e, g)).ToList();
                    int deja = 0, recup = 0, manque = 0, echec = 0;
                    var sources = new Dictionary<string, int>();
                    foreach (var e in elements)
                    {
                        var actuel = ParametresPerte.Lire(e, g);
                        var trouve = recopier ? ParametresPerte.Trouver(e, g) : null;
                        if (actuel.HasValue && (!remplacer || trouve == null)) { deja++; continue; }
                        if (trouve == null) { manque++; continue; }
                        if (ParametresPerte.Ecrire(e, g, trouve.Value.Pa))
                        {
                            recup++;
                            sources[trouve.Value.Source] = sources.TryGetValue(trouve.Value.Source, out var k) ? k + 1 : 1;
                        }
                        else echec++;
                    }
                    bilan.AppendLine();
                    bilan.AppendLine(ParametresPerte.Nom(g) + " : " + elements.Count + " élément(s)");
                    bilan.AppendLine("   déjà renseignés : " + deja + "   –   récupérés : " + recup + "   –   à saisir : " + manque + (echec > 0 ? "   –   non modifiables : " + echec : ""));
                    foreach (var kv in sources.OrderByDescending(x => x.Value).Take(4)) bilan.AppendLine("   source : " + kv.Key + " (" + kv.Value + ")");
                }
                t.Commit();
            }
            bilan.AppendLine();
            bilan.AppendLine("Saisissez les valeurs manquantes (fiche fabricant) dans les propriétés des éléments, ou dans une nomenclature. "
                + "Les calculs « Perte de charge » et « Perte de charge aéraulique » les lisent ; sans paramètre renseigné, ils prennent "
                + "aussi la valeur trouvée dans la famille.");
            new TaskDialog("Pipe-Fit – Paramètres perte de charge") { MainInstruction = "Paramètres de perte de charge prêts", MainContent = bilan.ToString() }.Show();
            return Result.Succeeded;
        }

        /// <summary>Équipement concerné : raccordement d'eau pour l'hydraulique, d'air pour l'aéraulique.</summary>
        static bool Concerne(Element e, GenrePerte g)
        {
            if (g == GenrePerte.Bouche || !Compat.EstCategorie(e, BuiltInCategory.OST_MechanicalEquipment)) return true;
            try
            {
                var cm = (e as FamilyInstance)?.MEPModel?.ConnectorManager;
                if (cm == null) return false;
                foreach (Connector c in cm.Connectors)
                    if (g == GenrePerte.Hydraulique ? c.Domain == Domain.DomainPiping : c.Domain == Domain.DomainHvac) return true;
            }
            catch { }
            return false;
        }
    }
}
