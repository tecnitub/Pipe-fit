// Paramètre partagé « Numéro de spool » : créé dans le projet s'il n'y existe pas, lié aux canalisations, raccords,
// accessoires, canalisations souples et pièces de fabrication. GUID fixe : le même paramètre d'un projet à l'autre
// (nomenclatures et étiquettes réutilisables).
using System;
using System.IO;
using System.Linq;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;

namespace PipeFit.Isometries.Revit
{
    static class ParametreSpool
    {
        public const string Nom = "Numéro de spool";
        static readonly Guid Guid = new Guid("6f1d3a52-8c4e-4b7a-9d2f-5e0c1b7a3f91");

        static readonly BuiltInCategory[] Categories =
        {
            BuiltInCategory.OST_PipeCurves, BuiltInCategory.OST_PipeFitting, BuiltInCategory.OST_PipeAccessory,
            BuiltInCategory.OST_FlexPipeCurves, BuiltInCategory.OST_FabricationPipework,
        };

        /// <summary>Crée et lie le paramètre (dans une transaction ouverte). Renvoie son nom.</summary>
        public static string Creer(Document doc, Application app)
        {
            var ancien = app.SharedParametersFilename;
            var fichier = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PipeFit", "Parametres partages Pipe-Fit.txt");
            ExternalDefinition def;
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(fichier));
                if (!File.Exists(fichier)) File.WriteAllText(fichier, "");
                app.SharedParametersFilename = fichier;
                var df = app.OpenSharedParameterFile() ?? throw new InvalidOperationException("fichier de paramètres partagés illisible : " + fichier);
                var groupe = df.Groups.get_Item("Pipe-Fit") ?? df.Groups.Create("Pipe-Fit");
                def = groupe.Definitions.get_Item(Nom) as ExternalDefinition
                    ?? (ExternalDefinition)groupe.Definitions.Create(new ExternalDefinitionCreationOptions(Nom, SpecTypeId.String.Text)
                    {
                        GUID = Guid,
                        Description = "Numéro du spool de préfabrication (Pipe-Fit Isométries).",
                    });
            }
            finally { app.SharedParametersFilename = ancien; }

            var cats = app.Create.NewCategorySet();
            foreach (var bic in Categories)
            {
                var cat = Category.GetCategory(doc, bic);
                if (cat != null && cat.AllowsBoundParameters) cats.Insert(cat);
            }
            if (!doc.ParameterBindings.Insert(def, app.Create.NewInstanceBinding(cats)))
                doc.ParameterBindings.ReInsert(def, app.Create.NewInstanceBinding(cats));
            return Nom;
        }
    }
}
