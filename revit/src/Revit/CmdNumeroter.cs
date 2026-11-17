// Commande « Numéroter spools » :
//  - mode sélection : les éléments sélectionnés (complétés jusqu'aux brides si demandé) reçoivent un numéro ;
//  - mode automatique : la tuyauterie sélectionnée, ou toute celle sans numéro, est découpée en spools aux joints
//    boulonnés et numérotée à la suite (SP-001, SP-002… ou EG-101-SP-001 par réseau).
// Le paramètre « Numéro de spool » est créé dans le projet s'il n'y existe pas encore.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using PipeFit.Isometries.Core;

namespace PipeFit.Isometries.Revit
{
    sealed class PlanNumerotation
    {
        public List<(string Numero, List<Element> Elements)> Spools = new List<(string, List<Element>)>();
        public bool Manuel;   // choix des éléments dans la vue, après la fenêtre
        public string NumeroManuel = "";
        public int ReseauDevant;
        public int Ignores;   // déjà numérotés, laissés tels quels
        public int Isoles;    // vannes / accessoires entre deux joints boulonnés
        public int TropLongs; // tubes de plus que la longueur maxi à eux seuls
        public double LongueurMaxMm;
        public double LongueurManuelleMm; // tube du spool numéroté à la main
        public string Erreur = "";
        /// <summary>Ensemble de chaque nouveau spool (numérotation automatique), par numéro.</summary>
        public Dictionary<string, string> Ensembles = new Dictionary<string, string>();

        public string Apercu()
        {
            if (Erreur != "") return Erreur;
            if (Manuel) return "Spool " + (NumeroManuel != "" ? NumeroManuel : "?") + (ReseauDevant > 0 ? " (le système devant le numéro suit les éléments cliqués)" : "")
                + " : cliquez ses éléments dans la vue après « Numéroter ».";
            if (Spools.Count == 0) return "Rien à numéroter.";
            var n = Spools.Sum(s => s.Elements.Count);
            var sb = new StringBuilder();
            sb.Append(Spools.Count == 1
                ? n + " élément(s) → " + Spools[0].Numero
                : Spools.Count + " spools, " + n + " éléments : " + Spools[0].Numero + " à " + Spools[Spools.Count - 1].Numero);
            if (Ignores > 0) sb.Append(" · " + Ignores + " déjà numéroté(s), conservé(s)");
            if (Isoles > 0) sb.Append(" · " + Isoles + " vanne(s) entre brides, non numérotée(s)");
            if (Ensembles.Count > 0) sb.Append(" · " + Ensembles.Values.Distinct().Count() + " ensemble(s) de montage");
            var m = System.Globalization.CultureInfo.GetCultureInfo("fr-FR");
            if (TropLongs > 0) sb.Append("\n⚠ " + TropLongs + " tube(s) de plus de " + (LongueurMaxMm / 1000).ToString("0.#", m) + " m d'un seul tenant : à diviser dans Revit (Modifier → Diviser l'élément).");
            if (LongueurMaxMm > 0 && LongueurManuelleMm > LongueurMaxMm + 0.5)
                sb.Append("\n⚠ " + (LongueurManuelleMm / 1000).ToString("0.0", m) + " m de tube dans ce spool : plus de " + (LongueurMaxMm / 1000).ToString("0.#", m)
                    + " m. Sélectionnez moins, décochez « compléter », ou utilisez le découpage automatique.");
            return sb.ToString();
        }
    }

    [Transaction(TransactionMode.Manual)]
    public sealed class CmdNumeroter : CommandeBase
    {
        public const string CreerParametre = "Numéro de spool (créé dans le projet)";

        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            if (doc.IsFamilyDocument) { message = "Commande disponible dans un projet, pas dans l'éditeur de familles."; return Result.Failed; }

            var tous = LectureModele.ElementsTuyauterie(doc);
            if (tous.Count == 0) { TaskDialog.Show("Pipe-Fit", "Aucune canalisation, aucun raccord ni accessoire de canalisation dans ce projet."); return Result.Cancelled; }
            var parCle = tous.ToDictionary(e => Compat.Cle(e.Id));
            var selection = uidoc.Selection.GetElementIds().Select(Compat.Cle).Where(parCle.ContainsKey).ToList();

            var r = Reglages.Charger();
            var candidats = LectureModele.ParametresCandidats(tous);
            var parametres = new List<string>(candidats);
            if (!candidats.Any(c => string.Equals(c, ParametreSpool.Nom, StringComparison.OrdinalIgnoreCase))) parametres.Insert(0, CreerParametre);
            var defaut = candidats.Contains(r.ParametreSpool) ? r.ParametreSpool : LectureModele.ParametreParDefaut(tous, candidats);
            if (string.IsNullOrEmpty(defaut)) defaut = parametres[0];

            // Composants lus une fois (raccordements, types)
            Dictionary<string, Composant> composants = null;
            Dictionary<string, Composant> Composants() => composants ??= tous.ToDictionary(e => Compat.Cle(e.Id), e => LectureModele.Lire(doc, e));

            PlanNumerotation Planifier(Reglages rg, string param, string numeroManuel) => Plan(doc, tous, parCle, selection, Composants(), rg, param, numeroManuel);
            string Suggerer(Reglages rg, string param)
            {
                var reseau = rg.ReseauDevant == 0 ? "" : Decoupage.Reseau(selection.Select(id => Composants()[id]), rg.ReseauDevant == 1);
                var prefixe = Decoupage.Prefixe(rg.PrefixeSpool, reseau);
                return Decoupage.Format(prefixe, Decoupage.Prochain(Valeurs(tous, param), prefixe), rg.Chiffres);
            }

            string param, numero;
            bool numeroSaisi;
            using (var f = new FenetreNumerotation(r, parametres, defaut, selection.Count, Suggerer, Planifier))
            {
                if (f.ShowDialog(new FenetreRevit(data.Application.MainWindowHandle)) != System.Windows.Forms.DialogResult.OK) return Result.Cancelled;
                param = f.Parametre; numero = f.Numero; numeroSaisi = f.NumeroSaisi;
            }
            if (r.ModeNumerotation == 2)
            {
                r.Enregistrer();
                return Manuel(data, uidoc, tous, r, param, numeroSaisi ? numero : null, ref message);
            }

            var plan = Planifier(r, param, numero);
            if (plan.Erreur != "" || plan.Spools.Count == 0) { TaskDialog.Show("Pipe-Fit", plan.Apercu()); return Result.Cancelled; }

            int ecrits = 0, refus = 0;
            using (var t = new Transaction(doc, "Pipe-Fit : numérotation des spools"))
            {
                t.Start();
                if (param == CreerParametre)
                {
                    try { param = ParametreSpool.Creer(doc, data.Application.Application); doc.Regenerate(); }
                    catch (Exception ex) { t.RollBack(); message = "Création du paramètre « " + ParametreSpool.Nom + " » impossible : " + ex.Message; return Result.Failed; }
                }
                if (plan.Ensembles.Count > 0) { try { ParametreSpool.CreerEnsemble(doc, data.Application.Application); doc.Regenerate(); } catch { } }
                foreach (var (num, elements) in plan.Spools)
                    foreach (var e in elements)
                    {
                        if (Ecrire(e, param, num)) ecrits++; else refus++;
                        if (plan.Ensembles.TryGetValue(num, out var ens)) e.LookupParameter(ParametreSpool.NomEnsemble)?.Set(ens);
                    }
                t.Commit();
            }

            r.ParametreSpool = param;
            r.Enregistrer();
            uidoc.Selection.SetElementIds(plan.Spools.SelectMany(s => s.Elements).Select(e => e.Id).ToList());

            var sb = new StringBuilder();
            sb.AppendLine(plan.Apercu());
            if (refus > 0) sb.AppendLine(refus + " élément(s) n'ont pas pu recevoir le numéro (paramètre absent ou en lecture seule sur leur catégorie).");
            sb.AppendLine();
            sb.Append("Les éléments numérotés sont sélectionnés. Cliquez ensuite sur « Isométries spools » pour générer les feuilles.");
            new TaskDialog("Pipe-Fit – Numérotation") { MainInstruction = ecrits + " élément(s) numéroté(s) dans « " + param + " »", MainContent = sb.ToString() }.Show();
            return Result.Succeeded;
        }

        /// <summary>
        /// Choix vraiment manuel : l'utilisateur clique tous les éléments du spool dans la vue (rien n'est ajouté ni retiré),
        /// le numéro est écrit après contrôle, puis on enchaîne sur le spool suivant jusqu'à Échap.
        /// numeroImpose : numéro tapé dans la fenêtre ; null = prochain numéro libre selon le système des éléments cliqués.
        /// </summary>
        Result Manuel(ExternalCommandData data, UIDocument uidoc, List<Element> tous, Reglages r, string param, string numeroImpose, ref string message)
        {
            var doc = uidoc.Document;
            var filtre = new FiltreTuyauterie();
            var faits = new List<string>();
            var dejaPris = new List<string>();
            var numero = numeroImpose;
            var preselection = uidoc.Selection.GetElementIds().Select(id => doc.GetElement(id)).Where(e => e != null && filtre.AllowElement(e))
                .Select(e => new Reference(e)).ToList();
            double maxMm = r.LongueurMaxM > 0 ? r.LongueurMaxM * 1000 : 0;

            while (true)
            {
                // Numéro de ce spool : imposé (puis suivants), ou calculé après le choix, d'après le système
                var invite = numero != null ? "Spool " + numero : "Nouveau spool";
                IList<Reference> refs;
                try
                {
                    refs = preselection.Count > 0
                        ? uidoc.Selection.PickObjects(Autodesk.Revit.UI.Selection.ObjectType.Element, filtre, invite + " : cliquez tous ses éléments (recliquer retire), puis Terminer. Échap pour arrêter.", preselection)
                        : uidoc.Selection.PickObjects(Autodesk.Revit.UI.Selection.ObjectType.Element, filtre, invite + " : cliquez tous ses éléments (recliquer retire), puis Terminer. Échap pour arrêter.");
                }
                catch (Autodesk.Revit.Exceptions.OperationCanceledException) { break; }
                preselection.Clear();
                var elements = refs.Select(x => doc.GetElement(x)).Where(e => e != null).GroupBy(e => e.Id).Select(g => g.First()).ToList();
                if (elements.Count == 0) break;

                var comps = elements.Select(e => LectureModele.Lire(doc, e)).ToList();
                var existants = Valeurs(tous, param).Concat(dejaPris).ToList();
                var num = numero;
                if (num == null)
                {
                    var reseau = r.ReseauDevant == 0 ? "" : Decoupage.Reseau(comps, r.ReseauDevant == 1);
                    var prefixe = Decoupage.Prefixe(r.PrefixeSpool, reseau);
                    num = Decoupage.Format(prefixe, Decoupage.Prochain(existants, prefixe), r.Chiffres);
                }

                // Contrôles : l'utilisateur décide, mais en connaissance de cause
                var alertes = new List<string>();
                var morceaux = Decoupage.Morceaux(comps);
                if (morceaux > 1) alertes.Add("les éléments forment " + morceaux + " morceaux non raccordés entre eux");
                var systemes = comps.Select(c => c.Systeme).Where(x => x != "").Distinct().ToList();
                if (systemes.Count > 1) alertes.Add("plusieurs systèmes : " + string.Join(", ", systemes));
                var tube = Decoupage.LongueurTube(comps);
                if (maxMm > 0 && tube > maxMm + 0.5) alertes.Add((tube / 1000).ToString("0.00") + " m de tube (plus de " + r.LongueurMaxM.ToString("0.#") + " m)");
                var autres = param == CreerParametre ? new List<string>()
                    : elements.Select(e => LectureModele.ValeurSpool(e, param)).Where(v => v != "" && v != num).Distinct().ToList();
                if (autres.Count > 0) alertes.Add("élément(s) déjà numéroté(s) " + string.Join(", ", autres) + " : ils seront renumérotés");
                var choisis = new HashSet<ElementId>(elements.Select(e => e.Id));
                if (param != CreerParametre && tous.Any(e => !choisis.Contains(e.Id) && LectureModele.ValeurSpool(e, param) == num))
                    alertes.Add("le numéro " + num + " est déjà porté par d'autres éléments : ils formeront un seul spool avec ceux-ci");

                var td = new TaskDialog("Pipe-Fit – Spool " + num)
                {
                    MainInstruction = "Numéroter " + elements.Count + " élément(s) en " + num + " ?",
                    MainContent = (alertes.Count > 0 ? "À vérifier :\n- " + string.Join("\n- ", alertes) + "\n\n" : "")
                        + (tube > 0 ? (tube / 1000).ToString("0.00") + " m de tube. " : "") + "Oui : écrire le numéro. Non : refaire le choix. Annuler : arrêter.",
                    CommonButtons = TaskDialogCommonButtons.Yes | TaskDialogCommonButtons.No | TaskDialogCommonButtons.Cancel,
                    DefaultButton = alertes.Count > 0 ? TaskDialogResult.No : TaskDialogResult.Yes,
                };
                var rep = td.Show();
                if (rep == TaskDialogResult.Cancel) break;
                if (rep == TaskDialogResult.No) { preselection = refs.ToList(); continue; }

                int ecrits = 0, refus = 0;
                using (var t = new Transaction(doc, "Pipe-Fit : spool " + num))
                {
                    t.Start();
                    if (param == CreerParametre)
                    {
                        try { param = ParametreSpool.Creer(doc, data.Application.Application); doc.Regenerate(); }
                        catch (Exception ex) { t.RollBack(); message = "Création du paramètre « " + ParametreSpool.Nom + " » impossible : " + ex.Message; return Result.Failed; }
                        r.ParametreSpool = param; r.Enregistrer();
                    }
                    foreach (var e in elements) if (Ecrire(e, param, num)) ecrits++; else refus++;
                    t.Commit();
                }
                dejaPris.Add(num);
                faits.Add(num + " : " + ecrits + " élément(s)" + (refus > 0 ? " (" + refus + " sans paramètre)" : ""));
                uidoc.Selection.SetElementIds(elements.Select(e => e.Id).ToList());
                numero = numero != null ? Decoupage.NumeroSuivant(num, Valeurs(tous, param).Concat(dejaPris)) : null;
            }

            if (faits.Count > 0)
            {
                r.ParametreSpool = param; r.Enregistrer();
                new TaskDialog("Pipe-Fit – Numérotation manuelle")
                {
                    MainInstruction = faits.Count + " spool(s) numéroté(s) dans « " + param + " »",
                    MainContent = string.Join("\n", faits) + "\n\nCliquez ensuite sur « Isométries spools » pour générer les feuilles.",
                }.Show();
            }
            return faits.Count > 0 ? Result.Succeeded : Result.Cancelled;
        }

        static IEnumerable<string> Valeurs(List<Element> tous, string param) =>
            param == CreerParametre ? Enumerable.Empty<string>() : tous.Select(e => LectureModele.ValeurSpool(e, param)).Where(v => v != "");

        static PlanNumerotation Plan(Document doc, List<Element> tous, Dictionary<string, Element> parCle, List<string> selection,
            Dictionary<string, Composant> composants, Reglages r, string param, string numeroManuel)
        {
            // Une surlongueur peut s'ajouter à chaque bout coupé : la barre du commerce doit les contenir
            var plan = new PlanNumerotation { LongueurMaxMm = r.LongueurMaxM > 0 ? Math.Max(500, r.LongueurMaxM * 1000 - 2 * r.SurlongueurMm) : 0 };
            var numerotes = new HashSet<string>(param == CreerParametre ? Enumerable.Empty<string>()
                : parCle.Where(kv => LectureModele.ValeurSpool(kv.Value, param) != "").Select(kv => kv.Key));
            var bloques = r.RemplacerNumeros ? new HashSet<string>() : numerotes;
            var tousComp = composants.Values.ToList();

            if (r.ModeNumerotation == 2) { plan.Manuel = true; plan.NumeroManuel = (numeroManuel ?? "").Trim(); plan.ReseauDevant = r.ReseauDevant; return plan; }

            if (r.ModeNumerotation == 0)
            {
                if (selection.Count == 0) { plan.Erreur = "Sélectionnez d'abord, dans Revit, des éléments du spool (un tube suffit si « compléter jusqu'aux brides » est coché)."; return plan; }
                if (string.IsNullOrWhiteSpace(numeroManuel)) { plan.Erreur = "Indiquez le numéro du spool."; return plan; }
                var depart = selection.Where(id => !bloques.Contains(id)).ToList();
                plan.Ignores = selection.Count - depart.Count;
                if (depart.Count == 0) { plan.Erreur = "Les éléments sélectionnés ont déjà un numéro : cochez « Renuméroter les éléments qui ont déjà un numéro » pour le changer."; return plan; }
                var ids = r.CompleterBrides ? Decoupage.Etendre(tousComp, depart, bloques) : new HashSet<string>(depart);
                if (ids.Count > 0) plan.Spools.Add((numeroManuel.Trim(), ids.Select(id => parCle[id]).ToList()));
                plan.LongueurManuelleMm = Decoupage.LongueurTube(ids.Select(id => composants[id]));
                return plan;
            }

            // Découpage automatique : la sélection, ou toute la tuyauterie
            var portee = selection.Count > 0 ? selection : parCle.Keys.ToList();
            var libres = portee.Where(id => !bloques.Contains(id)).ToList();
            plan.Ignores = portee.Count - libres.Count;
            var sousEnsemble = libres.Select(id => composants[id]).ToList();
            var groupes = Decoupage.Spools(sousEnsemble, plan.LongueurMaxMm, out var tropLongs);
            plan.TropLongs = tropLongs.Count;
            plan.Isoles = sousEnsemble.Count - groupes.Sum(g => g.Count);

            var existants = Valeurs(tous, param).ToList();
            var compteurs = new Dictionary<string, int>();
            foreach (var g in groupes)
            {
                var reseau = r.ReseauDevant == 0 ? "" : Decoupage.Reseau(g, r.ReseauDevant == 1);
                var prefixe = Decoupage.Prefixe(r.PrefixeSpool, reseau);
                if (!compteurs.TryGetValue(prefixe, out var n)) n = Decoupage.Prochain(existants, prefixe);
                compteurs[prefixe] = n + 1;
                plan.Spools.Add((Decoupage.Format(prefixe, n, r.Chiffres), g.Select(c => parCle[c.Id]).ToList()));
            }

            // Chaque système découpé en spools, regroupés en ensembles de montage (ordre de montage, N spools par ensemble)
            if (r.EnsemblesAuto && groupes.Count > 0)
            {
                var spools = groupes.Select((g, i) => new Spool { Nom = plan.Spools[i].Numero, Composants = g }).ToList();
                var tousIds = new HashSet<string>(spools.SelectMany(x => x.Composants).Select(c => c.Id));
                foreach (var sp in spools)
                {
                    foreach (var e in sp.Composants.SelectMany(c => c.Extremites).Where(e => e.ConnecteA != null && !tousIds.Contains(e.ConnecteA)))
                        sp.NomsExterieurs[e.ConnecteA] = e.ConnecteA; // équipement ou spool existant : point de départ du montage
                    AnalyseSpool.Analyser(sp);
                }
                // Ensembles déjà formés dans chaque système : les nouveaux continuent après
                var ensemblesExistants = param == CreerParametre ? new Dictionary<string, int>() : tous
                    .Where(e => (e.LookupParameter(ParametreSpool.NomEnsemble)?.AsString() ?? "") != "")
                    .GroupBy(e => e.get_Parameter(BuiltInParameter.RBS_SYSTEM_NAME_PARAM)?.AsString() ?? "")
                    .ToDictionary(g => g.Key, g => g.Select(e => e.LookupParameter(ParametreSpool.NomEnsemble).AsString()).Distinct().Count());
                foreach (var kv in Montage.EnsemblesAuto(spools, r.TailleEnsemble, sys => ensemblesExistants.TryGetValue(sys, out var k) ? k : 0))
                    plan.Ensembles[kv.Key.Nom] = kv.Value;
            }
            return plan;
        }

        internal static bool Ecrire(Element e, string param, string numero)
        {
            if (param == LectureModele.SpoolFabrication)
            {
                if (!(e is FabricationPart fp)) return false;
                try { fp.SpoolName = numero; return true; } catch { return false; }
            }
            var p = e.LookupParameter(param);
            if (p == null || p.IsReadOnly || p.StorageType != StorageType.String) return false;
            return p.Set(numero);
        }
    }
}
