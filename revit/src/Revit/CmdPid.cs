// Commande « Schéma de principe (P&ID) » : reprend en filaire les éléments dessinés en 3D. Le réseau relié à la
// sélection (tuyauteries et gaines) est lu, les tubes / coudes / brides sont fondus en lignes, et le schéma (vannes,
// pompes, équipements, bouches, tés, renvois de boucle, réseaux et DN) est dessiné dans une nouvelle vue de dessin.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Mechanical;
using Autodesk.Revit.DB.Plumbing;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using PipeFit.Isometries.Core;
using TaskDialog = Autodesk.Revit.UI.TaskDialog;

namespace PipeFit.Isometries.Revit
{
    sealed class FiltreReseau : ISelectionFilter
    {
        public bool AllowElement(Element e) => CmdPid.EstReseau(e);
        public bool AllowReference(Reference r, XYZ p) => true;
    }

    [Transaction(TransactionMode.Manual)]
    public sealed class CmdPid : CommandeBase
    {
        const double Echelle = 10; // vue de dessin au 1:10 : 1 mm papier = 10 mm de modèle

        static readonly BuiltInCategory[] Cats =
        {
            BuiltInCategory.OST_PipeCurves, BuiltInCategory.OST_FlexPipeCurves, BuiltInCategory.OST_PipeFitting, BuiltInCategory.OST_PipeAccessory,
            BuiltInCategory.OST_DuctCurves, BuiltInCategory.OST_FlexDuctCurves, BuiltInCategory.OST_DuctFitting, BuiltInCategory.OST_DuctAccessory,
            BuiltInCategory.OST_DuctTerminal, BuiltInCategory.OST_MechanicalEquipment, BuiltInCategory.OST_PlumbingFixtures,
        };

        public static bool EstReseau(Element e) => e != null && Cats.Any(c => Compat.EstCategorie(e, c));

        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            var elements = uidoc.Selection.GetElementIds().Select(doc.GetElement).Where(EstReseau).ToList();
            if (elements.Count == 0)
            {
                try
                {
                    elements = uidoc.Selection.PickObjects(ObjectType.Element, new FiltreReseau(), "Schéma de principe : sélectionnez un ou plusieurs éléments du réseau, puis Terminer")
                        .Select(r => doc.GetElement(r)).ToList();
                }
                catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return Result.Cancelled; }
            }
            if (elements.Count == 0) return Result.Cancelled;

            var choix = new TaskDialog("Pipe-Fit – Schéma de principe")
            {
                MainInstruction = "Que faut-il reprendre dans le schéma ?",
                MainContent = elements.Count + " élément(s) sélectionné(s).",
                CommonButtons = TaskDialogCommonButtons.Cancel,
            };
            choix.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, "Tout le réseau relié à la sélection", "Tuyauteries et gaines raccordées, équipements et bouches compris.");
            choix.AddCommandLink(TaskDialogCommandLinkId.CommandLink2, "La sélection seulement");
            choix.VerificationText = "Placer le schéma sur une feuille (cartouche du projet), s'il n'est pas déjà sur une feuille";
            var r2 = choix.Show();
            bool surFeuille = choix.WasVerificationChecked();
            if (r2 != TaskDialogResult.CommandLink1 && r2 != TaskDialogResult.CommandLink2) return Result.Cancelled;
            var reseau = r2 == TaskDialogResult.CommandLink1 ? Relie(elements) : elements.GroupBy(e => e.Id).Select(g => g.First()).ToList();

            var (noeuds, liens) = Lire(doc, reseau);
            var schema = Schema.Construire(noeuds, liens);
            schema.AjouterLegende();
            if (schema.Symboles.Count == 0 && schema.Traits.Count == 0) { TaskDialog.Show("Pipe-Fit", "Rien à dessiner dans cette sélection."); return Result.Cancelled; }

            var systemes = noeuds.Select(n => n.Systeme).Where(x => x != "").Distinct().OrderBy(x => x).ToList();
            ViewDrafting vue; bool misAJour; ViewSheet feuille = null;
            var libSys = systemes.Count > 0 ? string.Join(", ", systemes.Take(6)) + (systemes.Count > 6 ? "…" : "") : "réseau";
            using (var t = new Transaction(doc, "Pipe-Fit : schéma de principe"))
            {
                t.Start();
                vue = Dessiner(doc, schema, "Schéma de principe – " + libSys, "PID – " + libSys, out misAJour);
                if (surFeuille) feuille = PlacerSurFeuille(doc, vue);
                t.Commit();
            }
            try { uidoc.ActiveView = vue; } catch { }
            TaskDialog.Show("Pipe-Fit – Schéma de principe", "Vue « " + vue.Name + " » " + (misAJour ? "mise à jour" : "créée") + (feuille != null ? ", placée sur la feuille " + feuille.SheetNumber : "") + " : " + schema.Reseaux + " réseau(x), " + schema.Symboles.Count(s => s.Nature != NatureSchema.Te && s.Nature != NatureSchema.Renvoi)
                + " élément(s) (vannes, pompes, équipements, bouches…), " + schema.Symboles.Count(s => s.Nature == NatureSchema.Renvoi) + " renvoi(s) de boucle.\n\n"
                + "Relancez la commande après une modification de la maquette : la même vue est redessinée (elle reste sur sa feuille).");
            return Result.Succeeded;
        }

        // ---------- Lecture du réseau ----------

        static IEnumerable<Connector> Connecteurs(Element e)
        {
            ConnectorManager cm = null;
            if (e is MEPCurve mc) cm = mc.ConnectorManager;
            else if (e is FamilyInstance fi) cm = fi.MEPModel?.ConnectorManager;
            else if (e is FabricationPart fp) cm = fp.ConnectorManager;
            if (cm == null) yield break;
            foreach (Connector c in cm.Connectors)
                if ((c.ConnectorType & ConnectorType.Physical) != 0 && (c.Domain == Domain.DomainPiping || c.Domain == Domain.DomainHvac)) yield return c;
        }

        static IEnumerable<Element> Voisins(Element e)
        {
            foreach (var c in Connecteurs(e))
                foreach (Connector r in c.AllRefs)
                    if (r.Owner != null && r.Owner.Id != e.Id && !(r.Owner is MEPSystem) && (r.ConnectorType & ConnectorType.Physical) != 0 && EstReseau(r.Owner)) yield return r.Owner;
        }

        static List<Element> Relie(List<Element> depart)
        {
            var vus = new Dictionary<ElementId, Element>();
            var file = new Queue<Element>(depart);
            while (file.Count > 0 && vus.Count < 8000)
            {
                var e = file.Dequeue();
                if (vus.ContainsKey(e.Id)) continue;
                vus[e.Id] = e;
                foreach (var v in Voisins(e)) if (!vus.ContainsKey(v.Id)) file.Enqueue(v);
            }
            return vus.Values.ToList();
        }

        static string Texte(Element e, BuiltInParameter p) { try { return e.get_Parameter(p)?.AsString() ?? ""; } catch { return ""; } }

        internal static bool EstRetour(Element e)
        {
            foreach (var c in Connecteurs(e))
            {
                try
                {
                    if (c.MEPSystem is PipingSystem ps)
                        return ps.SystemType == PipeSystemType.ReturnHydronic || Regex.IsMatch(AnalyseSpool.Normaliser(ps.Name), @"retour|return");
                    if (c.MEPSystem is MechanicalSystem ms)
                        return ms.SystemType == DuctSystemType.ReturnAir || ms.SystemType == DuctSystemType.ExhaustAir;
                }
                catch { }
            }
            return Regex.IsMatch(AnalyseSpool.Normaliser(Texte(e, BuiltInParameter.RBS_SYSTEM_NAME_PARAM)), @"retour|return");
        }

        internal static readonly Regex Pompe = new Regex(@"pompe|pump|circulateur|surpresseur");
        internal static readonly Regex Source = new Regex(@"groupe (froid|de production)|chiller|refroidisseur|chaudi|boiler|\bpac\b|chaleur|heat ?pump|production|thermofrigopompe|\btfp\b|sous.?station|\bcta\b|centrale (de traitement|double flux)|caisson|extracteur|ventilateur|rooftop|air handling|\bahu\b|\bvmc\b");

        /// <summary>Type de système (pour son style de trait) de chaque système affiché, lu sur les éléments.</summary>
        public static Dictionary<string, ElementId> TypesSystemes = new Dictionary<string, ElementId>();

        public static (List<NoeudSchema>, List<(string, string)>) Lire(Document doc, List<Element> reseau)
        {
            TypesSystemes = new Dictionary<string, ElementId>();
            var noeuds = new List<NoeudSchema>();
            var ids = new HashSet<string>(reseau.Select(e => Compat.Cle(e.Id)));
            var liens = new List<(string, string)>();
            var inv = CultureInfo.InvariantCulture;
            foreach (var e in reseau)
            {
                var k = Compat.Cle(e.Id);
                var famille = (doc.GetElement(e.GetTypeId()) as ElementType)?.FamilyName ?? e.Name;
                var nomN = AnalyseSpool.Normaliser(famille + " " + e.Name);
                var marque = Texte(e, BuiltInParameter.ALL_MODEL_MARK);
                var n = new NoeudSchema
                {
                    Id = k, Retour = EstRetour(e),
                    Systeme = Texte(e, BuiltInParameter.RBS_SYSTEM_ABBREVIATION_PARAM) is string ab && ab != "" ? ab : Texte(e, BuiltInParameter.RBS_SYSTEM_NAME_PARAM),
                };
                // Type de système : couleur, motif et épaisseur des lignes du schéma
                if (n.Systeme != "" && !TypesSystemes.ContainsKey(n.Systeme))
                {
                    var tid = e.get_Parameter(BuiltInParameter.RBS_PIPING_SYSTEM_TYPE_PARAM)?.AsElementId();
                    if (tid == null || tid == ElementId.InvalidElementId) tid = e.get_Parameter(BuiltInParameter.RBS_DUCT_SYSTEM_TYPE_PARAM)?.AsElementId();
                    if (tid != null && tid != ElementId.InvalidElementId) TypesSystemes[n.Systeme] = tid;
                }
                var cns = Connecteurs(e).ToList();
                foreach (var c in cns)
                    try { n.DnMm = Math.Max(n.DnMm, c.Shape == ConnectorProfileType.Round ? Compat.Mm(c.Radius * 2) : Compat.Mm(Math.Max(c.Width, c.Height))); } catch { }
                if (e is MEPCurve)
                {
                    n.Nature = NatureSchema.Ligne;
                    if (e is Pipe || e is FlexPipe)
                    {
                        var d = e.get_Parameter(BuiltInParameter.RBS_PIPE_DIAMETER_PARAM)?.AsDouble() ?? 0;
                        n.Dimension = d > 0 ? "DN" + Math.Round(Compat.Mm(d)).ToString(inv) : "";
                    }
                    else
                    {
                        var d = e.get_Parameter(BuiltInParameter.RBS_CURVE_DIAMETER_PARAM)?.AsDouble() ?? 0;
                        var w = e.get_Parameter(BuiltInParameter.RBS_CURVE_WIDTH_PARAM)?.AsDouble() ?? 0;
                        var h = e.get_Parameter(BuiltInParameter.RBS_CURVE_HEIGHT_PARAM)?.AsDouble() ?? 0;
                        n.Dimension = d > 0 ? "Ø" + Math.Round(Compat.Mm(d)).ToString(inv) : w > 0 && h > 0 ? Math.Round(Compat.Mm(w)) + "×" + Math.Round(Compat.Mm(h)) : "";
                    }
                }
                else if (Compat.EstCategorie(e, BuiltInCategory.OST_PipeFitting) || Compat.EstCategorie(e, BuiltInCategory.OST_DuctFitting))
                {
                    var pt = (e as FamilyInstance)?.MEPModel is MechanicalFitting mf ? mf.PartType : PartType.Undefined;
                    n.Nature = pt == PartType.Transition ? NatureSchema.Reduction
                        : pt == PartType.Tee || pt == PartType.Cross || pt == PartType.Wye || pt == PartType.TapPerpendicular || pt == PartType.TapAdjustable
                          || pt == PartType.SpudPerpendicular || pt == PartType.SpudAdjustable ? NatureSchema.Te : NatureSchema.Ligne;
                }
                else if (Compat.EstCategorie(e, BuiltInCategory.OST_PipeAccessory))
                {
                    n.Nature = NatureSchema.Vanne;
                    try
                    {
                        var c = LectureModele.Lire(doc, e);
                        c.EstAccessoire = true;
                        n.Genre = Robinetterie.Genre(c);
                    }
                    catch { n.Genre = GenreRobinet.Vanne; }
                    n.Libelle = marque != "" ? marque : Schema.Court(famille);
                }
                else if (Compat.EstCategorie(e, BuiltInCategory.OST_DuctAccessory))
                {
                    n.Nature = NatureSchema.Accessoire;
                    var o = PerteCharge.OrganeParNom(famille + " " + e.Name);
                    n.Libelle = marque != "" ? marque : o == PerteCharge.OrganeAir.CoupeFeu ? "CF" : o == PerteCharge.OrganeAir.Registre ? "Registre"
                        : o == PerteCharge.OrganeAir.Silencieux ? "Silencieux" : Schema.Court(famille);
                }
                else if (Compat.EstCategorie(e, BuiltInCategory.OST_DuctTerminal))
                {
                    n.Nature = NatureSchema.Bouche;
                    n.Libelle = marque != "" ? marque : "";
                }
                else
                {
                    n.Nature = Pompe.IsMatch(nomN) ? NatureSchema.Pompe : NatureSchema.Equipement;
                    n.Source = n.Nature == NatureSchema.Equipement && Source.IsMatch(nomN);
                    n.Libelle = n.Nature == NatureSchema.Pompe ? (marque != "" ? marque : "Pompe") : ((marque != "" ? marque + " " : "") + famille).Trim();
                }
                noeuds.Add(n);
                foreach (var v in Voisins(e))
                {
                    var kv = Compat.Cle(v.Id);
                    if (ids.Contains(kv) && string.CompareOrdinal(k, kv) < 0) liens.Add((k, kv));
                }
            }
            return (noeuds, liens);
        }

        // ---------- Dessin ----------

        static XYZ P(double x, double y) => new XYZ(Compat.Pieds(x * Echelle), Compat.Pieds(y * Echelle), 0);

        /// <summary>Place la vue sur une nouvelle feuille (premier cartouche du projet) si elle n'est encore sur aucune feuille.</summary>
        static ViewSheet PlacerSurFeuille(Document doc, View vue)
        {
            if (new FilteredElementCollector(doc).OfClass(typeof(Viewport)).Cast<Viewport>().Any(v => v.ViewId == vue.Id)) return null;
            var cartouche = new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_TitleBlocks).OfClass(typeof(FamilySymbol)).Cast<FamilySymbol>().FirstOrDefault();
            if (cartouche != null && !cartouche.IsActive) cartouche.Activate();
            var f = ViewSheet.Create(doc, cartouche?.Id ?? ElementId.InvalidElementId);
            var numeros = new HashSet<string>(new FilteredElementCollector(doc).OfClass(typeof(ViewSheet)).Cast<ViewSheet>().Select(v => v.SheetNumber));
            int n = 1; while (numeros.Contains("PID-" + n.ToString("00"))) n++;
            f.SheetNumber = "PID-" + n.ToString("00");
            try { f.Name = vue.Name.Replace("PID – ", "Schéma de principe – "); } catch { }
            doc.Regenerate();
            var o = f.Outline;
            var centre = o != null && o.Max.U > o.Min.U ? new XYZ((o.Min.U + o.Max.U) / 2, (o.Min.V + o.Max.V) / 2, 0) : new XYZ(Compat.Pieds(210), Compat.Pieds(148), 0);
            if (Viewport.CanAddViewToSheet(doc, f.Id, vue.Id)) Viewport.Create(doc, f.Id, vue.Id, centre);
            return f;
        }

        static ViewDrafting Dessiner(Document doc, Schema s, string titre, string nomVue, out bool misAJour)
        {
            // Même réseau : la vue existante est vidée puis redessinée (elle garde sa place sur la feuille)
            var vue = new FilteredElementCollector(doc).OfClass(typeof(ViewDrafting)).Cast<ViewDrafting>().FirstOrDefault(v => v.Name == nomVue && !v.IsTemplate);
            misAJour = vue != null;
            if (vue != null)
            {
                var anciens = new FilteredElementCollector(doc, vue.Id).WhereElementIsNotElementType()
                    .Where(e => e.OwnerViewId == vue.Id && (e is CurveElement || e is TextNote || e is FilledRegion)).Select(e => e.Id).ToList();
                if (anciens.Count > 0) doc.Delete(anciens);
            }
            else
            {
                var type = new FilteredElementCollector(doc).OfClass(typeof(ViewFamilyType)).Cast<ViewFamilyType>().First(v => v.ViewFamily == ViewFamily.Drafting);
                vue = ViewDrafting.Create(doc, type.Id);
                var noms = new HashSet<string>(new FilteredElementCollector(doc).OfClass(typeof(View)).Cast<View>().Select(v => v.Name));
                var nom = nomVue; int i = 2;
                while (noms.Contains(nom)) nom = nomVue + " (" + i++ + ")";
                try { vue.Name = nom; } catch { vue.Name = "PID " + DateTime.Now.ToString("yyyy-MM-dd HH'h'mm"); }
            }
            vue.Scale = (int)Echelle;
            var texte = TypeTexte(doc, "Pipe-Fit schéma 2 mm", 2.0, false);
            var gras = TypeTexte(doc, "Pipe-Fit schéma 2 mm gras", 2.0, true);
            var titreT = TypeTexte(doc, "Pipe-Fit schéma 3,5 mm gras", 3.5, true);
            var large = StyleLarge(doc);
            double tol = doc.Application.ShortCurveTolerance;

            void Trait(double x1, double y1, double x2, double y2, GraphicsStyle style = null)
            {
                var a = P(x1, y1); var b = P(x2, y2);
                if (a.DistanceTo(b) <= tol * 1.05) return;
                try { var dc = doc.Create.NewDetailCurve(vue, Line.CreateBound(a, b)); if (style != null) dc.LineStyle = style; } catch { }
            }
            void Texte(double x, double y, string t, ElementId typ, bool centre)
            {
                if (string.IsNullOrWhiteSpace(t)) return;
                try
                {
                    TextNote.Create(doc, vue.Id, P(x, y), t, new TextNoteOptions(typ)
                    {
                        HorizontalAlignment = centre ? HorizontalTextAlignment.Center : HorizontalTextAlignment.Left,
                        VerticalAlignment = VerticalTextAlignment.Middle,
                    });
                }
                catch { }
            }

            // Lignes du schéma avec le style du type de système Revit (couleur, motif, épaisseur), départ comme retour
            var styles = new Dictionary<string, GraphicsStyle>();
            GraphicsStyle StyleDe(string sys)
            {
                if (sys == null || sys == "") return large;
                if (styles.TryGetValue(sys, out var st)) return st;
                st = TypesSystemes.TryGetValue(sys, out var tid) ? StyleSysteme(doc, sys, doc.GetElement(tid) as MEPSystemType) : null;
                return styles[sys] = st ?? large;
            }
            foreach (var t in s.Traits) Trait(t.X1, t.Y1, t.X2, t.Y2, StyleDe(t.Systeme));
            foreach (var sy in s.Symboles)
            {
                if (sy.Nature == NatureSchema.Te)
                {
                    // Point de piquage : petit disque plein (région remplie), sinon cercle
                    try
                    {
                        var c = P(sy.X, sy.Y); var r = Compat.Pieds(0.7 * Echelle);
                        var boucle = new CurveLoop();
                        boucle.Append(Arc.Create(c, r, 0, Math.PI, XYZ.BasisX, XYZ.BasisY));
                        boucle.Append(Arc.Create(c, r, Math.PI, 2 * Math.PI, XYZ.BasisX, XYZ.BasisY));
                        var frt = new FilteredElementCollector(doc).OfClass(typeof(FilledRegionType)).Cast<FilledRegionType>().FirstOrDefault();
                        if (frt != null) FilledRegion.Create(doc, frt.Id, vue.Id, new List<CurveLoop> { boucle });
                    }
                    catch { }
                    continue;
                }
                foreach (var g in Schema.Dessin(sy)) Trait(sy.X + g.U1, sy.Y + g.V1, sy.X + g.U2, sy.Y + g.V2);
                var tc = Schema.TexteCadre(sy);
                if (tc != "") Texte(sy.X, sy.Y, tc, gras, true);
            }
            foreach (var t in s.Textes) Texte(t.X, t.Y, t.Texte, t.Gras ? gras : texte, t.Centre);
            Texte(s.X0, s.Y1 + 8, titre, titreT, false);
            return vue;
        }

        /// <summary>
        /// Style de ligne « Pipe-Fit schéma – système » (sous-catégorie de Lignes) reprenant la couleur, le motif de ligne et
        /// l'épaisseur du type de système ; mis à jour à chaque schéma si le type de système a changé.
        /// </summary>
        static GraphicsStyle StyleSysteme(Document doc, string systeme, MEPSystemType type)
        {
            if (type == null) return null;
            try
            {
                var lignes = doc.Settings.Categories.get_Item(BuiltInCategory.OST_Lines);
                var nom = "Pipe-Fit schéma - " + System.Text.RegularExpressions.Regex.Replace(systeme, @"[\\:{}\[\]|;<>?`~]", "_");
                Category sc = null;
                foreach (Category c in lignes.SubCategories) if (c.Name == nom) { sc = c; break; }
                if (sc == null) sc = doc.Settings.Categories.NewSubcategory(lignes, nom);
                var couleur = type.LineColor;
                sc.LineColor = couleur != null && couleur.IsValid ? couleur : new Color(0, 0, 0);
                var motif = type.LinePatternId;
                sc.SetLinePatternId(motif != null && motif != ElementId.InvalidElementId ? motif : LinePatternElement.GetSolidPatternId(), GraphicsStyleType.Projection);
                var ep = type.LineWeight;
                sc.SetLineWeight(ep > 0 && ep <= 16 ? Math.Max(ep, 3) : 5, GraphicsStyleType.Projection);
                return sc.GetGraphicsStyle(GraphicsStyleType.Projection);
            }
            catch { return null; }
        }

        static GraphicsStyle StyleLarge(Document doc)
        {
            try
            {
                var lignes = doc.Settings.Categories.get_Item(BuiltInCategory.OST_Lines);
                foreach (Category sc in lignes.SubCategories)
                {
                    var n = AnalyseSpool.Normaliser(sc.Name);
                    if (n == "lignes larges" || n == "wide lines" || n == "traits larges") return sc.GetGraphicsStyle(GraphicsStyleType.Projection);
                }
            }
            catch { }
            return null;
        }

        static ElementId TypeTexte(Document doc, string nom, double hauteurMm, bool gras)
        {
            var existant = new FilteredElementCollector(doc).OfClass(typeof(TextNoteType)).Cast<TextNoteType>().FirstOrDefault(t => t.Name == nom);
            if (existant != null) return existant.Id;
            var base_ = doc.GetElement(doc.GetDefaultElementTypeId(ElementTypeGroup.TextNoteType)) as TextNoteType
                ?? new FilteredElementCollector(doc).OfClass(typeof(TextNoteType)).Cast<TextNoteType>().First();
            var t = (TextNoteType)base_.Duplicate(nom);
            t.get_Parameter(BuiltInParameter.TEXT_SIZE)?.Set(Compat.Pieds(hauteurMm));
            t.get_Parameter(BuiltInParameter.TEXT_FONT)?.Set("Arial");
            t.get_Parameter(BuiltInParameter.TEXT_BACKGROUND)?.Set(1);
            t.get_Parameter(BuiltInParameter.TEXT_STYLE_BOLD)?.Set(gras ? 1 : 0);
            return t.Id;
        }
    }
}
