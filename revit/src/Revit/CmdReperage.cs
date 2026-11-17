// Commande « Repérage spools » : vue de repérage pour le montage sur chantier.
//  - vue de départ dupliquée (plan, coupe 3D…) ou nouvelle vue 3D isométrique de la tuyauterie ;
//  - chaque spool dans sa couleur (lignes épaisses, surfaces pleines), étiquette « n° de spool · ordre de montage » ;
//  - soudures de chantier marquées « × » ; tuyauterie sans numéro en gris ;
//  - feuille avec le tableau « ORDRE DE MONTAGE » (posé contre, longueur de tube, feuille d'isométrie) et la légende.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using PipeFit.Isometries.Core;

namespace PipeFit.Isometries.Revit
{
    [Transaction(TransactionMode.Manual)]
    public sealed class CmdReperage : CommandeBase
    {
        static readonly (string Nom, byte R, byte G, byte B)[] Palette =
        {
            ("bleu", 0, 94, 184), ("orange", 232, 119, 34), ("vert", 0, 150, 70), ("rouge", 200, 30, 45),
            ("violet", 120, 60, 170), ("turquoise", 0, 160, 190), ("marron", 140, 90, 40), ("rose", 220, 60, 150),
            ("olive", 120, 130, 20), ("marine", 20, 40, 120), ("or", 200, 150, 0), ("gris-bleu", 90, 110, 130),
        };

        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            var tous = LectureModele.ElementsTuyauterie(doc);
            var r = Reglages.Charger();
            var param = CmdIsometries.ParametreSpool(r, tous);
            var groupes = string.IsNullOrEmpty(param) ? new Dictionary<string, List<Element>>() : LectureModele.ParSpool(tous, param, out _);
            if (groupes.Count == 0)
            {
                TaskDialog.Show("Pipe-Fit", "Aucun spool numéroté dans ce projet : numérotez d'abord la tuyauterie (« Numéroter spools »).");
                return Result.Cancelled;
            }

            var active = uidoc.ActiveView;
            var dupliquable = (active is ViewPlan || active is View3D || active is ViewSection) && !active.IsTemplate
                && active.CanViewBeDuplicated(ViewDuplicateOption.Duplicate);
            bool depuisActive, feuilleVoulue, gris, soudures, zone;
            Montage.Regroupement par;
            var avecEnsembles = tous.Any(e => (e.LookupParameter(ParametreSpool.NomEnsemble)?.AsString() ?? "") != "");
            using (var f = new FenetreReperage(dupliquable ? active.Name : null, groupes.Count, avecEnsembles))
            {
                if (f.ShowDialog(new FenetreRevit(data.Application.MainWindowHandle)) != System.Windows.Forms.DialogResult.OK) return Result.Cancelled;
                depuisActive = f.DepuisActive; feuilleVoulue = f.Feuille; gris = f.Gris; soudures = f.Soudures; par = f.Par; zone = f.Zone;
            }

            var spools = groupes.OrderBy(g => g.Key, Comparer<string>.Create(AnalyseSpool.ComparerNaturel))
                .Select(g => LectureModele.Convertir(doc, g.Key, g.Value, param, r.SurlongueurMm)).ToList();
            var feuillesIso = new FilteredElementCollector(doc).OfClass(typeof(ViewSheet)).Cast<ViewSheet>().Select(v => v.SheetNumber).ToHashSet();
            var lots = Montage.Grouper(spools, par);

            var creees = new List<string>();
            View premiere = null;
            var avertissements = new List<string>();
            using (var tg = new TransactionGroup(doc, "Pipe-Fit : repérage des spools"))
            {
                tg.Start();
                foreach (var (nomLot, lot) in lots)
                {
                    var etapes = Montage.Ordonner(lot);
                    var couleur = new Dictionary<Spool, int>();
                    for (int i = 0; i < etapes.Count; i++) couleur[etapes[i].Spool] = i % Palette.Length;
                    using (var t = new Transaction(doc, "Pipe-Fit : repérage " + (nomLot != "" ? nomLot : "des spools")))
                    {
                        var opt = t.GetFailureHandlingOptions(); opt.SetFailuresPreprocessor(new SansAvertissements()); t.SetFailureHandlingOptions(opt);
                        t.Start();
                        var gen = new GenerateurIso(doc, r, active.Id);
                        gen.Preparer();

                        var suffixe = (depuisActive ? " – " + active.Name : "") + (nomLot != "" ? " – " + nomLot : "");
                        var nom = "REPÉRAGE SPOOLS" + suffixe;
                        foreach (var ancienne in new FilteredElementCollector(doc).OfClass(typeof(View)).Cast<View>().Where(v => !v.IsTemplate && v.Name == nom && v.Id != active.Id).ToList())
                            doc.Delete(ancienne.Id);
                        var elementsLot = lot.SelectMany(x => groupes[x.Nom]).ToList();
                        var vue = depuisActive ? (View)doc.GetElement(active.Duplicate(ViewDuplicateOption.Duplicate)) : Vue3D(doc, r, tous, zone ? elementsLot : null);
                        if (vue.ViewTemplateId != ElementId.InvalidElementId) vue.ViewTemplateId = ElementId.InvalidElementId;
                        try { vue.Name = nom; } catch { vue.Name = nom + " " + DateTime.Now.ToString("HHmmss", CultureInfo.InvariantCulture); }
                        if (depuisActive && zone) Cadrer(vue, elementsLot, avertissements);
                        if (vue is View3D v3 && !v3.IsLocked && !v3.IsPerspective) { try { v3.SaveOrientationAndLock(); } catch { } }

                        // Feuille d'abord : l'échelle fixe la taille des étiquettes
                        if (feuilleVoulue)
                        {
                            var legende = new Tableau { Titre = "LÉGENDE" };
                            legende.Colonnes.Add(new Colonne("", 130));
                            legende.Lignes.Add(new[] { "Une couleur par spool (voir ORDRE DE MONTAGE)" });
                            legende.Lignes.Add(new[] { "Étiquette : n° de spool · ordre de montage" });
                            if (soudures) legende.Lignes.Add(new[] { "× : soudure de chantier" });
                            if (gris) legende.Lignes.Add(new[] { lots.Count > 1 ? "Gris : autres spools et tuyauterie sans numéro" : "Gris : tuyauterie sans numéro de spool" });
                            var tableaux = new List<Tableau>
                            {
                                Montage.Tableau(etapes, x => Palette[couleur[x]].Nom, x => feuillesIso.Contains(GenerateurIso.NumeroFeuille(r, x.Nom)) ? GenerateurIso.NumeroFeuille(r, x.Nom) : "à générer"),
                                legende,
                            };
                            var systemes = string.Join(", ", lot.Select(x => x.Systeme).Where(x => x != "").Distinct());
                            var ensembles = string.Join(", ", lot.Select(x => x.Ensemble).Where(x => x != "").Distinct());
                            var numero = "REP-" + Court((depuisActive ? active.Name : "3D") + (nomLot != "" ? " " + nomLot : ""), 40);
                            var feuille = gen.Feuille(vue, numero, "Repérage des spools" + suffixe,
                                "REPÉRAGE DES SPOOLS POUR LE MONTAGE" + (nomLot != "" ? " – " + nomLot.ToUpperInvariant() : ""),
                                (systemes != "" ? "Système " + systemes : "") + (ensembles != "" ? (systemes != "" ? " · " : "") + ensembles : ""), tableaux, out _, out var z);
                            if (vue is View3D v3d) gen.Nord(feuille, v3d, z);
                            premiere = premiere ?? feuille;
                        }
                        else if (!depuisActive) vue.Scale = 50;
                        premiere = premiere ?? vue;

                        Colorer(doc, vue, lot, couleur, tous, gris);
                        Etiqueter(doc, vue, lot, etapes, couleur, groupes, avertissements);
                        if (soudures) MarquerSoudures(doc, vue, lot, avertissements);
                        t.Commit();
                        creees.Add(vue.Name + " : " + lot.Count + " spool(s)");
                    }
                }
                tg.Assimilate();
            }
            if (premiere != null) uidoc.ActiveView = premiere;
            var msg = string.Join("\n", creees) + (avertissements.Count > 0 ? "\n\n" + string.Join("\n", avertissements.Distinct()) : "");
            new TaskDialog("Pipe-Fit – Repérage") { MainInstruction = creees.Count + " vue(s) de repérage créée(s)", MainContent = msg }.Show();
            return Result.Succeeded;
        }

        static string Court(string s, int max = 20)
        {
            var c = new string(s.Where(ch => char.IsLetterOrDigit(ch) || ch == '-' || ch == ' ').ToArray()).Trim();
            return c.Length > max ? c.Substring(0, max).Trim() : c;
        }

        static BoundingBoxXYZ Englobant(List<Element> elements, double margeMm)
        {
            double x0 = double.MaxValue, y0 = double.MaxValue, z0 = double.MaxValue, x1 = double.MinValue, y1 = double.MinValue, z1 = double.MinValue;
            foreach (var e in elements)
            {
                var b = e.get_BoundingBox(null);
                if (b == null) continue;
                x0 = Math.Min(x0, b.Min.X); y0 = Math.Min(y0, b.Min.Y); z0 = Math.Min(z0, b.Min.Z);
                x1 = Math.Max(x1, b.Max.X); y1 = Math.Max(y1, b.Max.Y); z1 = Math.Max(z1, b.Max.Z);
            }
            var m = Compat.Pieds(margeMm);
            return new BoundingBoxXYZ { Min = new XYZ(x0 - m, y0 - m, z0 - m), Max = new XYZ(x1 + m, y1 + m, z1 + m) };
        }

        /// <summary>Cadrage d'un plan ou d'une coupe sur la zone du groupe (zone cadrée, avec 1 m de marge).</summary>
        static void Cadrer(View vue, List<Element> elements, List<string> avertissements)
        {
            try
            {
                if (vue is View3D v3) { v3.SetSectionBox(Englobant(elements, 1000)); return; }
                var b = Englobant(elements, 1000);
                var cb = vue.CropBox;
                var inv = cb.Transform.Inverse;
                var coins = new[] { b.Min, b.Max, new XYZ(b.Min.X, b.Max.Y, b.Min.Z), new XYZ(b.Max.X, b.Min.Y, b.Max.Z),
                    new XYZ(b.Min.X, b.Min.Y, b.Max.Z), new XYZ(b.Max.X, b.Max.Y, b.Min.Z), new XYZ(b.Min.X, b.Max.Y, b.Max.Z), new XYZ(b.Max.X, b.Min.Y, b.Min.Z) }
                    .Select(p => inv.OfPoint(p)).ToList();
                vue.CropBoxActive = true;
                vue.CropBox = new BoundingBoxXYZ
                {
                    Transform = cb.Transform,
                    Min = new XYZ(coins.Min(p => p.X), coins.Min(p => p.Y), cb.Min.Z),
                    Max = new XYZ(coins.Max(p => p.X), coins.Max(p => p.Y), cb.Max.Z),
                };
                vue.CropBoxVisible = false;
            }
            catch (Exception ex) { avertissements.Add("cadrage de « " + vue.Name + " » impossible : " + ex.Message); }
        }

        static View3D Vue3D(Document doc, Reglages r, List<Element> tous, List<Element> zone = null)
        {
            var type = new FilteredElementCollector(doc).OfClass(typeof(ViewFamilyType)).Cast<ViewFamilyType>().First(v => v.ViewFamily == ViewFamily.ThreeDimensional);
            var vue = View3D.CreateIsometric(doc, type.Id);
            double x0 = double.MaxValue, y0 = double.MaxValue, z0 = double.MaxValue, x1 = double.MinValue, y1 = double.MinValue, z1 = double.MinValue;
            foreach (var e in tous)
            {
                var b = e.get_BoundingBox(null);
                if (b == null) continue;
                x0 = Math.Min(x0, b.Min.X); y0 = Math.Min(y0, b.Min.Y); z0 = Math.Min(z0, b.Min.Z);
                x1 = Math.Max(x1, b.Max.X); y1 = Math.Max(y1, b.Max.Y); z1 = Math.Max(z1, b.Max.Z);
            }
            var m = Compat.Pieds(500);
            var min = new XYZ(x0 - m, y0 - m, z0 - m); var max = new XYZ(x1 + m, y1 + m, z1 + m);
            if (zone != null && zone.Count > 0) { var bz = Englobant(zone, 1000); min = bz.Min; max = bz.Max; } // zone du groupe seulement
            var avant = GenerateurIso.Direction(r.Orientation);
            var haut = (XYZ.BasisZ - avant * avant.DotProduct(XYZ.BasisZ)).Normalize();
            vue.SetOrientation(new ViewOrientation3D((min + max) / 2 - avant * (max - min).GetLength() * 2, haut, avant));
            vue.SetSectionBox(new BoundingBoxXYZ { Min = min, Max = max });
            try { vue.SetCategoryHidden(new ElementId(BuiltInCategory.OST_SectionBox), true); } catch { }
            vue.DetailLevel = r.Unifilaire ? ViewDetailLevel.Coarse : ViewDetailLevel.Fine;
            vue.DisplayStyle = r.Unifilaire ? DisplayStyle.HLR : DisplayStyle.ShadingWithEdges;
            // La tuyauterie et les équipements qu'elle raccorde, sans le reste du bâtiment
            var ids = tous.Select(e => e.Id).ToList();
            ids.AddRange(new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_MechanicalEquipment).WhereElementIsNotElementType().ToElementIds());
            vue.IsolateElementsTemporary(ids);
            vue.ConvertTemporaryHideIsolateToPermanent();
            return vue;
        }

        static Color Couleur(int i) => new Color(Palette[i].R, Palette[i].G, Palette[i].B);

        static void Colorer(Document doc, View vue, List<Spool> spools, Dictionary<Spool, int> couleur, List<Element> tous, bool gris)
        {
            var plein = new FilteredElementCollector(doc).OfClass(typeof(FillPatternElement)).Cast<FillPatternElement>()
                .FirstOrDefault(f => f.GetFillPattern().IsSolidFill);
            var dansSpool = new HashSet<string>();
            foreach (var s in spools)
            {
                var c = Couleur(couleur[s]);
                var o = new OverrideGraphicSettings();
                o.SetProjectionLineColor(c);
                o.SetProjectionLineWeight(7);
                o.SetCutLineColor(c);
                if (plein != null) { o.SetSurfaceForegroundPatternId(plein.Id); o.SetSurfaceForegroundPatternColor(c); }
                foreach (var comp in s.Composants)
                {
                    dansSpool.Add(comp.Id);
                    try { vue.SetElementOverrides(Compat.IdDepuis(comp.Id), o); } catch { }
                }
            }
            if (!gris) return;
            var g = new OverrideGraphicSettings();
            g.SetHalftone(true);
            foreach (var e in tous.Where(e => !dansSpool.Contains(Compat.Cle(e.Id))))
                try { vue.SetElementOverrides(e.Id, g); } catch { }
        }

        static ElementId TypeTexte(Document doc, string nom, Color c, double tailleMm, bool cadre)
        {
            var existant = new FilteredElementCollector(doc).OfClass(typeof(TextNoteType)).Cast<TextNoteType>().FirstOrDefault(t => t.Name == nom);
            var t = existant ?? (TextNoteType)((doc.GetElement(doc.GetDefaultElementTypeId(ElementTypeGroup.TextNoteType)) as TextNoteType)
                ?? new FilteredElementCollector(doc).OfClass(typeof(TextNoteType)).Cast<TextNoteType>().First()).Duplicate(nom);
            t.get_Parameter(BuiltInParameter.TEXT_SIZE)?.Set(Compat.Pieds(tailleMm));
            t.get_Parameter(BuiltInParameter.TEXT_FONT)?.Set("Arial");
            t.get_Parameter(BuiltInParameter.TEXT_STYLE_BOLD)?.Set(1);
            t.get_Parameter(BuiltInParameter.LINE_COLOR)?.Set(c.Red + c.Green * 256 + c.Blue * 65536);
            t.get_Parameter(BuiltInParameter.TEXT_BOX_VISIBILITY)?.Set(cadre ? 1 : 0);
            t.get_Parameter(BuiltInParameter.TEXT_BACKGROUND)?.Set(cadre ? 0 : 1); // étiquette opaque, croix transparente
            return t.Id;
        }

        /// <summary>Étiquette « n° · ordre » à côté du plus long tube de chaque spool, dans la couleur du spool, avec une ligne de rappel.</summary>
        static void Etiqueter(Document doc, View vue, List<Spool> spools, List<EtapeMontage> etapes, Dictionary<Spool, int> couleur,
            Dictionary<string, List<Element>> groupes, List<string> avertissements)
        {
            var ordre = etapes.ToDictionary(e => e.Spool, e => e.Ordre);
            var types = new Dictionary<int, ElementId>();
            int echecs = 0;
            foreach (var s in spools)
            {
                var i = couleur[s];
                if (!types.TryGetValue(i, out var type)) types[i] = type = TypeTexte(doc, "Pipe-Fit repère spool " + Palette[i].Nom, Couleur(i), 3, true);
                var elements = groupes[s.Nom];
                var tube = elements.Where(e => e.Location is LocationCurve).OrderByDescending(e => ((LocationCurve)e.Location).Curve.Length).FirstOrDefault();
                XYZ point, sens;
                if (tube != null)
                {
                    var courbe = ((LocationCurve)tube.Location).Curve;
                    point = courbe.Evaluate(0.5, true);
                    sens = (courbe.GetEndPoint(1) - courbe.GetEndPoint(0)).Normalize();
                }
                else
                {
                    var b = elements.Select(e => e.get_BoundingBox(null)).FirstOrDefault(x => x != null);
                    if (b == null) continue;
                    point = (b.Min + b.Max) / 2; sens = XYZ.BasisX;
                }
                // Décalage perpendiculaire au tube, dans le plan de la vue
                var normale = vue.ViewDirection;
                var decale = sens.CrossProduct(normale);
                if (decale.GetLength() < 1e-6) decale = vue.UpDirection;
                decale = decale.Normalize();
                if (decale.DotProduct(vue.UpDirection) < 0) decale = -decale;
                var tete = point + decale * Compat.Pieds(9 * vue.Scale);
                try
                {
                    var note = TextNote.Create(doc, vue.Id, tete, s.Nom + " · " + ordre[s], new TextNoteOptions(type) { HorizontalAlignment = HorizontalTextAlignment.Center });
                    try { var l = note.AddLeader(TextNoteLeaderTypes.TNLT_STRAIGHT_L); l.End = point; } catch { }
                }
                catch { echecs++; }
            }
            if (echecs > 0) avertissements.Add(echecs + " étiquette(s) non posée(s) : cette vue n'accepte pas de texte (vue 3D non verrouillée ?).");
        }

        static void MarquerSoudures(Document doc, View vue, List<Spool> spools, List<string> avertissements)
        {
            var type = TypeTexte(doc, "Pipe-Fit soudure chantier", new Color(200, 30, 45), 4, false);
            var vus = new HashSet<string>();
            int echecs = 0;
            foreach (var a in spools.SelectMany(s => s.Assemblages).Where(a => a.Nature == NatureAssemblage.RaccordementChantier && a.Soude))
            {
                if (!vus.Add(string.Format(CultureInfo.InvariantCulture, "{0:0}|{1:0}|{2:0}", a.Position.X / 5, a.Position.Y / 5, a.Position.Z / 5))) continue;
                var p = new XYZ(Compat.Pieds(a.Position.X), Compat.Pieds(a.Position.Y), Compat.Pieds(a.Position.Z));
                try { TextNote.Create(doc, vue.Id, p, "×", new TextNoteOptions(type) { HorizontalAlignment = HorizontalTextAlignment.Center, VerticalAlignment = VerticalTextAlignment.Middle }); }
                catch { echecs++; }
            }
            if (echecs > 0) avertissements.Add(echecs + " soudure(s) chantier non marquée(s) sur la vue.");
        }
    }

    /// <summary>Fenêtre : vue de départ et options de la vue de repérage.</summary>
    sealed class FenetreReperage : System.Windows.Forms.Form
    {
        readonly System.Windows.Forms.RadioButton rbActive = new System.Windows.Forms.RadioButton { AutoSize = false };
        readonly System.Windows.Forms.RadioButton rb3D = new System.Windows.Forms.RadioButton { Text = "Nouvelle vue 3D isométrique de toute la tuyauterie", AutoSize = false };
        readonly System.Windows.Forms.CheckBox ckFeuille = new System.Windows.Forms.CheckBox { Text = "Feuille avec l'ordre de montage et la légende", AutoSize = false, Checked = true };
        readonly System.Windows.Forms.CheckBox ckGris = new System.Windows.Forms.CheckBox { Text = "Tuyauterie sans numéro de spool en gris", AutoSize = false, Checked = true };
        readonly System.Windows.Forms.CheckBox ckSoudures = new System.Windows.Forms.CheckBox { Text = "Marquer les soudures de chantier (×)", AutoSize = false, Checked = true };
        readonly System.Windows.Forms.ComboBox cbPar = new System.Windows.Forms.ComboBox { DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList };
        readonly System.Windows.Forms.CheckBox ckZone = new System.Windows.Forms.CheckBox { Text = "Cadrer chaque vue sur la zone de ses spools", AutoSize = false, Checked = true };

        public bool DepuisActive => rbActive.Checked;
        public bool Feuille => ckFeuille.Checked;
        public bool Gris => ckGris.Checked;
        public bool Soudures => ckSoudures.Checked;
        public Montage.Regroupement Par => (Montage.Regroupement)Math.Max(0, cbPar.SelectedIndex);
        public bool Zone => ckZone.Checked && cbPar.SelectedIndex > 0;

        public FenetreReperage(string vueActive, int nbSpools, bool avecEnsembles = false)
        {
            Text = "Pipe-Fit – Repérage des spools pour le montage";
            Font = new System.Drawing.Font("Segoe UI", 9f);
            AutoScaleMode = System.Windows.Forms.AutoScaleMode.Dpi;
            FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
            MaximizeBox = MinimizeBox = false;
            StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            ClientSize = new System.Drawing.Size(500, 340);
            Controls.Add(new System.Windows.Forms.Label
            {
                Text = nbSpools + " spool(s) numéroté(s) : chacun dans sa couleur, avec son numéro et son ordre de montage.",
                Location = new System.Drawing.Point(14, 12), Size = new System.Drawing.Size(472, 20),
            });
            rbActive.Text = vueActive != null ? "Copie de la vue active « " + vueActive + " » (plan, coupe ou 3D)" : "Copie de la vue active (ouvrez un plan, une coupe ou une vue 3D)";
            rbActive.Enabled = vueActive != null;
            rbActive.SetBounds(14, 44, 472, 22); rb3D.SetBounds(14, 70, 472, 22);
            (vueActive != null ? rbActive : rb3D).Checked = true;
            Controls.Add(new System.Windows.Forms.Label { Text = "Une vue par :", Location = new System.Drawing.Point(14, 111), AutoSize = true });
            cbPar.Items.AddRange(new object[] { "une seule vue pour tous les spools", "système", "ensemble (zone de montage)", "système et ensemble" });
            // Système → spools → ensembles : par défaut une vue par système et ensemble (ou par système sans ensembles)
            cbPar.SelectedIndex = avecEnsembles ? 3 : 1;
            cbPar.SetBounds(110, 108, 376, 24);
            ckZone.SetBounds(30, 136, 456, 22);
            cbPar.SelectedIndexChanged += (s, e) => ckZone.Enabled = cbPar.SelectedIndex > 0;
            ckZone.Enabled = cbPar.SelectedIndex > 0;
            ckFeuille.SetBounds(14, 176, 472, 22); ckGris.SetBounds(14, 202, 472, 22); ckSoudures.SetBounds(14, 228, 472, 22);
            Controls.AddRange(new System.Windows.Forms.Control[] { rbActive, rb3D, cbPar, ckZone, ckFeuille, ckGris, ckSoudures });
            var ok = new System.Windows.Forms.Button { Text = "Créer la vue", DialogResult = System.Windows.Forms.DialogResult.OK };
            ok.SetBounds(292, 294, 110, 30);
            var annuler = new System.Windows.Forms.Button { Text = "Annuler", DialogResult = System.Windows.Forms.DialogResult.Cancel };
            annuler.SetBounds(410, 294, 76, 30);
            Controls.AddRange(new System.Windows.Forms.Control[] { ok, annuler });
            AcceptButton = ok; CancelButton = annuler;
        }
    }
}
