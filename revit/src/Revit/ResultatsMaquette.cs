// Écriture des résultats de calcul dans la maquette : paramètres « Vitesse calculée (m/s) », « Perte linéaire calculée
// (Pa/m) », « Perte de charge calculée (Pa) » sur les canalisations, gaines, raccords et accessoires calculés ; filtre de
// vue « Pipe-Fit – vitesse > x m/s » qui met en rouge, dans la vue active, les éléments trop rapides.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using PipeFit.Isometries.Core;

namespace PipeFit.Isometries.Revit
{
    static class ResultatsMaquette
    {
        public const string NomVitesse = "Vitesse calculée (m/s)", NomJ = "Perte linéaire calculée (Pa/m)", NomDp = "Perte de charge calculée (Pa)";
        static readonly Guid GVitesse = new Guid("2b7e4c19-8d36-4f05-a1e2-6c9f3b8d0a57"), GJ = new Guid("94d1a6f3-0c28-4e7b-b5d9-1f3e8a2c6b04"), GDp = new Guid("e06f2b8a-5d17-4c39-8a4e-b7c1d93f2e65");
        static readonly BuiltInCategory[] Eau = { BuiltInCategory.OST_PipeCurves, BuiltInCategory.OST_FlexPipeCurves, BuiltInCategory.OST_PipeFitting, BuiltInCategory.OST_PipeAccessory };
        static readonly BuiltInCategory[] Air = { BuiltInCategory.OST_DuctCurves, BuiltInCategory.OST_FlexDuctCurves, BuiltInCategory.OST_DuctFitting, BuiltInCategory.OST_DuctAccessory, BuiltInCategory.OST_DuctTerminal };

        static bool Existe(Document doc, string nom) => new FilteredElementCollector(doc).OfClass(typeof(SharedParameterElement)).Any(p => p.Name == nom);

        /// <summary>Écrit les résultats (transaction ouverte ici) ; renvoie un compte rendu.</summary>
        public static string Ecrire(Document doc, Application app, View vue, IEnumerable<Troncon> troncons, double vMax, bool air)
        {
            var liste = troncons.Where(t => !string.IsNullOrEmpty(t.Id)).GroupBy(t => t.Id).Select(g => g.OrderByDescending(t => t.DebitM3h).First()).ToList();
            int ecrits = 0, rapides = 0; string filtre = "";
            using (var tr = new Transaction(doc, "Pipe-Fit : résultats de calcul dans la maquette"))
            {
                tr.Start();
                var cats = Eau.Concat(Air).ToArray();
                foreach (var (nom, g) in new[] { (NomVitesse, GVitesse), (NomJ, GJ), (NomDp, GDp) })
                    if (!Existe(doc, nom)) ParametreSpool.Creer(doc, app, nom, g, "Résultat du dernier calcul Pipe-Fit (bouton « Écrire dans la maquette » des fenêtres de calcul).", SpecTypeId.Number, cats);
                doc.Regenerate();
                foreach (var t in liste)
                {
                    Element e;
                    try { e = doc.GetElement(Compat.IdDepuis(t.Id)); } catch { continue; }
                    if (e == null) continue;
                    bool ok = false;
                    void Set(string n, double v) { var p = e.LookupParameter(n); if (p != null && !p.IsReadOnly && p.Set(Math.Round(v, 3))) ok = true; }
                    Set(NomVitesse, t.VitesseMs);
                    if (t.LongueurM > 0) Set(NomJ, t.PerteLineairePaM);
                    Set(NomDp, t.PerteTotalePa);
                    if (ok) ecrits++;
                    if (t.VitesseMs > vMax) rapides++;
                }
                // Filtre de vue : vitesse au-delà de la vitesse maximale en rouge
                try
                {
                    var pid = SharedParameterElement.Lookup(doc, GVitesse)?.Id;
                    if (pid != null && vue != null && !(vue is ViewSheet) && vue.AreGraphicsOverridesAllowed())
                    {
                        var nomF = "Pipe-Fit – vitesse > " + vMax.ToString("0.#") + " m/s (" + (air ? "gaines" : "canalisations") + ")";
                        var regle = new ElementParameterFilter(ParameterFilterRuleFactory.CreateGreaterRule(pid, vMax, 0.001));
                        var catIds = (air ? Air : Eau).Select(c => new ElementId(c)).ToList();
                        var pf = new FilteredElementCollector(doc).OfClass(typeof(ParameterFilterElement)).Cast<ParameterFilterElement>().FirstOrDefault(x => x.Name == nomF)
                                 ?? ParameterFilterElement.Create(doc, nomF, catIds, regle);
                        pf.SetElementFilter(regle);
                        if (!vue.GetFilters().Contains(pf.Id)) vue.AddFilter(pf.Id);
                        var ogs = new OverrideGraphicSettings().SetProjectionLineColor(new Color(215, 30, 30)).SetProjectionLineWeight(8);
                        vue.SetFilterOverrides(pf.Id, ogs);
                        vue.SetFilterVisibility(pf.Id, true);
                        filtre = "Filtre « " + nomF + " » appliqué à la vue « " + vue.Name + " » : les éléments trop rapides y sont en rouge.";
                    }
                    else filtre = "Pas de filtre : la vue active n'accepte pas les remplacements graphiques (feuille ou gabarit de vue).";
                }
                catch (Exception ex) { filtre = "Filtre de vue non appliqué (" + ex.Message + ") : le gabarit de la vue gère peut-être les filtres."; }
                tr.Commit();
            }
            return ecrits + " élément(s) mis à jour (« " + NomVitesse + " », « " + NomJ + " », « " + NomDp + " »), dont " + rapides + " au-delà de " + vMax.ToString("0.#") + " m/s.\n" + filtre
                + "\nCes paramètres s'ajoutent aux nomenclatures et aux étiquettes ; ils sont mis à jour à chaque écriture.";
        }
    }
}
