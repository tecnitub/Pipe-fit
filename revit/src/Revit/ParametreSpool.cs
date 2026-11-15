// Paramètre partagé « Numéro de spool » : créé dans le projet s'il n'y existe pas, lié aux canalisations, raccords,
// accessoires, canalisations souples et pièces de fabrication. GUID fixe : le même paramètre d'un projet à l'autre
// (nomenclatures et étiquettes réutilisables).
using System;
using System.Collections.Generic;
using System.Globalization;
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

        /// <summary>Joints marqués « soudure chantier » d'un élément : numéros de connecteur, avec la surlongueur (« 1:150 »).</summary>
        public const string NomSoudures = "Soudures chantier (Pipe-Fit)";
        static readonly Guid GuidSoudures = new Guid("b2c74e19-3f6a-4d8b-a1e5-7c0d9f2b6e48");

        /// <summary>Pouces-diamètre des soudures portées par l'élément, écrits à la génération des isométries.</summary>
        public const string NomPouces = "Pouces soudures (Pipe-Fit)";
        static readonly Guid GuidPouces = new Guid("d47a2c6e-91b3-4f05-8e7d-3a6b2f1c9e57");

        static bool Existe(Document doc, string nom) => LectureModele.ElementsTuyauterie(doc).Any(e => e.LookupParameter(nom) != null)
            || new FilteredElementCollector(doc).OfClass(typeof(SharedParameterElement)).Any(p => p.Name == nom);

        /// <summary>Crée les paramètres Pipe-Fit absents du projet ; renvoie, pour chacun, s'il vient d'être créé.</summary>
        public static List<(string Nom, bool Cree)> CreerTous(Document doc, Application app)
        {
            var res = new List<(string, bool)>();
            foreach (var (nom, guid, spec, desc) in new[]
            {
                (Nom, Guid, SpecTypeId.String.Text, "Numéro du spool de préfabrication (Pipe-Fit Isométries)."),
                (NomSoudures, GuidSoudures, SpecTypeId.String.Text, "Connecteurs marqués soudure chantier par Pipe-Fit (n° de connecteur:surlongueur en mm). Se règle avec le bouton Soudure chantier."),
                (NomPouces, GuidPouces, SpecTypeId.Number, "Pouces-diamètre des soudures portées par l'élément (écrits par Isométries spools)."),
            })
            {
                var existe = Existe(doc, nom);
                if (!existe) Creer(doc, app, nom, guid, desc, spec);
                res.Add((nom, !existe));
            }
            return res;
        }

        /// <summary>Crée le paramètre des pouces de soudure s'il manque.</summary>
        public static void CreerPouces(Document doc, Application app)
        {
            if (!Existe(doc, NomPouces)) Creer(doc, app, NomPouces, GuidPouces, "Pouces-diamètre des soudures portées par l'élément (écrits par Isométries spools).", SpecTypeId.Number);
        }

        /// <summary>Crée et lie le paramètre « Numéro de spool » (dans une transaction ouverte). Renvoie son nom.</summary>
        public static string Creer(Document doc, Application app) =>
            Creer(doc, app, Nom, Guid, "Numéro du spool de préfabrication (Pipe-Fit Isométries).");

        /// <summary>Crée et lie le paramètre des soudures chantier marquées, s'il n'existe pas encore.</summary>
        public static void CreerSoudures(Document doc, Application app)
        {
            if (Existe(doc, NomSoudures)) return;
            Creer(doc, app, NomSoudures, GuidSoudures, "Connecteurs marqués soudure chantier par Pipe-Fit (n° de connecteur:surlongueur en mm). Ne pas modifier à la main.");
        }

        static string Creer(Document doc, Application app, string nom, Guid guid, string description, ForgeTypeId spec = null)
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
                def = groupe.Definitions.get_Item(nom) as ExternalDefinition
                    ?? (ExternalDefinition)groupe.Definitions.Create(new ExternalDefinitionCreationOptions(nom, spec ?? SpecTypeId.String.Text) { GUID = guid, Description = description });
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
            return nom;
        }

        /// <summary>Lecture des marques : n° de connecteur → surlongueur propre (null = celle par défaut).</summary>
        public static Dictionary<int, double?> Marques(Element e)
        {
            var res = new Dictionary<int, double?>();
            var v = e.LookupParameter(NomSoudures)?.AsString();
            if (string.IsNullOrWhiteSpace(v)) return res;
            foreach (var morceau in v.Split(new[] { ';', ' ' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var p = morceau.Split(':');
                if (!int.TryParse(p[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var id)) continue;
                res[id] = p.Length > 1 && double.TryParse(p[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var mm) ? mm : (double?)null;
            }
            return res;
        }

        /// <summary>Écrit les marques d'un élément (faux si le paramètre est absent).</summary>
        public static bool Ecrire(Element e, Dictionary<int, double?> marques)
        {
            var p = e.LookupParameter(NomSoudures);
            if (p == null || p.IsReadOnly) return false;
            return p.Set(string.Join(";", marques.OrderBy(k => k.Key).Select(k => k.Key.ToString(CultureInfo.InvariantCulture)
                + (k.Value.HasValue ? ":" + k.Value.Value.ToString("0", CultureInfo.InvariantCulture) : ""))));
        }
    }
}
