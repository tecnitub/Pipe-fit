// Génération d'une isométrie de fabrication pour un spool :
//  1. vue 3D isométrique (orientation au choix), limitée au spool (zone de coupe + isolement permanent), verrouillée ;
//  2. repères écrits dans les éléments (T1, T2… pour les tubes, n° de nomenclature pour les raccords) et étiquetés ;
//  3. numéros de soudure (S1…) et de raccordement chantier (R1…) posés sur la vue ;
//  4. feuille avec cartouche (ou cadre A3), vue mise à l'échelle normalisée qui tient, flèche du nord,
//     tableaux : informations spool, nomenclature, liste de débit, assemblages.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Autodesk.Revit.DB;
using PipeFit.Isometries.Core;

namespace PipeFit.Isometries.Revit
{
    sealed class Resultat
    {
        public string Spool = "";
        public ElementId Feuille = ElementId.InvalidElementId;
        public string NumeroFeuille = "";
        public int Echelle;
        public bool Ignore;
        public List<string> Avertissements = new List<string>();
    }

    /// <summary>Supprime les avertissements (repères en double…) pour ne pas interrompre la génération.</summary>
    sealed class SansAvertissements : IFailuresPreprocessor
    {
        public FailureProcessingResult PreprocessFailures(FailuresAccessor a)
        {
            foreach (var f in a.GetFailureMessages())
                if (f.GetSeverity() == FailureSeverity.Warning) a.DeleteWarning(f);
            return FailureProcessingResult.Continue;
        }
    }

    sealed class GenerateurIso
    {
        const double HauteurTexteMm = 2.5;
        const double HauteurLigneMm = 5;

        readonly Document doc;
        readonly Reglages r;
        readonly ElementId vueActive;
        ElementId texte, texteGras, typeVue3D;
        FamilySymbol cartouche;
        ElementId etiquetteTube, etiquetteRaccord, etiquetteAccessoire;
        string projet = "";

        public GenerateurIso(Document doc, Reglages r, ElementId vueActive)
        {
            this.doc = doc; this.r = r; this.vueActive = vueActive;
        }

        // ---------- Types utilisés (à appeler dans une transaction) ----------

        public void Preparer()
        {
            texte = TypeTexte("Pipe-Fit ISO 2,5 mm", false);
            texteGras = TypeTexte("Pipe-Fit ISO 2,5 mm gras", true);
            typeVue3D = new FilteredElementCollector(doc).OfClass(typeof(ViewFamilyType)).Cast<ViewFamilyType>()
                .First(v => v.ViewFamily == ViewFamily.ThreeDimensional).Id;
            cartouche = string.IsNullOrEmpty(r.Cartouche) ? null : Cartouches(doc).FirstOrDefault(c => NomType(c) == r.Cartouche);
            if (cartouche != null && !cartouche.IsActive) cartouche.Activate();
            etiquetteTube = Etiquette(BuiltInCategory.OST_PipeTags, r.EtiquetteTube);
            etiquetteRaccord = Etiquette(BuiltInCategory.OST_PipeFittingTags, r.EtiquetteRaccord);
            etiquetteAccessoire = Etiquette(BuiltInCategory.OST_PipeAccessoryTags, r.EtiquetteAccessoire);
            try { ParametreSpool.CreerPouces(doc, doc.Application); } catch { /* sans ce paramètre, les pouces restent sur la feuille */ }
            projet = doc.ProjectInformation?.Name ?? "";
            if (projet == "") projet = doc.Title;
        }

        ElementId TypeTexte(string nom, bool gras)
        {
            var existant = new FilteredElementCollector(doc).OfClass(typeof(TextNoteType)).Cast<TextNoteType>().FirstOrDefault(t => t.Name == nom);
            if (existant != null) return existant.Id;
            var base_ = doc.GetElement(doc.GetDefaultElementTypeId(ElementTypeGroup.TextNoteType)) as TextNoteType
                ?? new FilteredElementCollector(doc).OfClass(typeof(TextNoteType)).Cast<TextNoteType>().First();
            var t = (TextNoteType)base_.Duplicate(nom);
            t.get_Parameter(BuiltInParameter.TEXT_SIZE)?.Set(Compat.Pieds(HauteurTexteMm));
            t.get_Parameter(BuiltInParameter.TEXT_FONT)?.Set("Arial");
            t.get_Parameter(BuiltInParameter.TEXT_BACKGROUND)?.Set(1); // transparent
            t.get_Parameter(BuiltInParameter.TEXT_WIDTH_SCALE)?.Set(1.0);
            t.get_Parameter(BuiltInParameter.TEXT_STYLE_BOLD)?.Set(gras ? 1 : 0);
            return t.Id;
        }

        ElementId Etiquette(BuiltInCategory cat, string nom)
        {
            if (nom == Fenetre.AucuneEtiquette) return ElementId.InvalidElementId;
            var liste = Etiquettes(doc, cat);
            var choisie = liste.FirstOrDefault(s => NomType(s) == nom);
            if (choisie == null)
            {
                var defaut = doc.GetDefaultFamilyTypeId(new ElementId(cat));
                choisie = (defaut != ElementId.InvalidElementId ? doc.GetElement(defaut) as FamilySymbol : null) ?? liste.FirstOrDefault();
            }
            if (choisie != null && !choisie.IsActive) choisie.Activate();
            return choisie?.Id ?? ElementId.InvalidElementId;
        }

        public static List<FamilySymbol> Cartouches(Document doc) =>
            new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_TitleBlocks).OfClass(typeof(FamilySymbol))
                .Cast<FamilySymbol>().OrderBy(NomType).ToList();

        public static List<FamilySymbol> Etiquettes(Document doc, BuiltInCategory cat) =>
            new FilteredElementCollector(doc).OfCategory(cat).OfClass(typeof(FamilySymbol))
                .Cast<FamilySymbol>().OrderBy(NomType).ToList();

        public static string NomType(FamilySymbol s) => s.FamilyName + " : " + s.Name;

        public static string NumeroFeuille(Reglages r, string spool) => (r.PrefixeFeuille ?? "") + spool;
        public static string NomVue(string spool) => "ISO " + spool;

        // ---------- Génération d'un spool ----------

        public Resultat Generer(Spool spool, List<Element> elements)
        {
            var res = new Resultat { Spool = spool.Nom, NumeroFeuille = NumeroFeuille(r, spool.Nom) };
            if (!LibererNoms(spool.Nom, res)) { res.Ignore = true; return res; }

            var parCle = elements.ToDictionary(e => Compat.Cle(e.Id));
            if (r.EcrireRepere) EcrireReperes(spool, parCle, res);
            // Pouces de soudure par élément : nomenclatures Revit (total par spool, par réseau…)
            foreach (var c in spool.Composants)
                if (parCle.TryGetValue(c.Id, out var el) && el.LookupParameter(ParametreSpool.NomPouces) is Parameter pp && !pp.IsReadOnly && pp.StorageType == StorageType.Double)
                    pp.Set(Math.Round(c.PoucesSoudures, 2));

            var vue = CreerVue(spool, elements);
            var feuille = ViewSheet.Create(doc, cartouche?.Id ?? ElementId.InvalidElementId);
            feuille.SheetNumber = res.NumeroFeuille;
            feuille.Name = "Isométrie spool " + spool.Nom;
            res.Feuille = feuille.Id;
            doc.Regenerate();

            // Zone utile de la feuille (mm papier)
            Rect cadre, zoneTableaux;
            if (cartouche != null && FilteredElementCollectorCartouche(feuille) is Element tb && tb.get_BoundingBox(feuille) is BoundingBoxXYZ bb)
            {
                cadre = new Rect(Compat.Mm(bb.Min.X) + 12, Compat.Mm(bb.Min.Y) + 12, Compat.Mm(bb.Max.X) - 12, Compat.Mm(bb.Max.Y) - 12);
                // Le bas à droite est laissé au cartouche de la famille
                zoneTableaux = new Rect(cadre.X0, cadre.Y0 + 60, cadre.X1, cadre.Y1);
            }
            else
            {
                cadre = new Rect(15, 15, 405, 282);
                DessinerCadreA3(feuille, "ISOMÉTRIE DE FABRICATION – SPOOL " + spool.Nom, spool.Systeme != "" ? "Système " + spool.Systeme : "", NumeroFeuille(r, spool.Nom));
                zoneTableaux = new Rect(cadre.X0, 50, cadre.X1, cadre.Y1);
            }

            var date = DateTime.Now.ToString("dd/MM/yyyy", CultureInfo.GetCultureInfo("fr-FR"));
            var page = MiseEnPage.Ranger(zoneTableaux, MiseEnPage.Tableaux(spool, projet, date), HauteurLigneMm);
            var zoneVue = new Rect(cadre.X0, cadre.Y0, page.ZoneVue.X1, cadre.Y1);
            foreach (var p in page.Tableaux) DessinerTableau(feuille, p);

            // Vue sur la feuille, à l'échelle qui tient dans la zone (marge pour les étiquettes)
            var centre = new XYZ(Compat.Pieds((zoneVue.X0 + zoneVue.X1) / 2), Compat.Pieds((zoneVue.Y0 + zoneVue.Y1) / 2), 0);
            vue.Scale = 50;
            var vp = Viewport.Create(doc, feuille.Id, vue.Id, centre);
            doc.Regenerate();
            var o = vp.GetBoxOutline();
            var largeurReelle = Compat.Mm(o.MaximumPoint.X - o.MinimumPoint.X) * 50;
            var hauteurReelle = Compat.Mm(o.MaximumPoint.Y - o.MinimumPoint.Y) * 50;
            res.Echelle = MiseEnPage.ChoisirEchelle(largeurReelle, hauteurReelle, zoneVue.Largeur * 0.78, zoneVue.Hauteur * 0.78);
            vue.Scale = res.Echelle;
            doc.Regenerate();

            Etiqueter(vue, elements, res);
            if (r.NumerosSoudure) NumeroterAssemblages(vue, spool, res);
            doc.Regenerate();
            vp.SetBoxCenter(centre);
            doc.Regenerate();
            var projection = Projection(vue, vp, res);
            if (projection != null)
            {
                if (r.Cotation) Coter(feuille, projection, spool, res);
                Renvoyer(feuille, projection, spool, zoneVue, res);
            }

            DessinerNord(feuille, vue, zoneVue);
            EcrireEchelle(feuille, zoneVue, res.Echelle);
            return res;
        }

        /// <summary>
        /// Feuille avec cartouche (ou cadre A3), tableaux rangés à droite et vue posée à l'échelle normalisée qui tient
        /// (vue de repérage des spools…). La feuille de même numéro est remplacée.
        /// </summary>
        public ViewSheet Feuille(View vue, string numero, string nom, string titre, string sousTitre, List<Tableau> tableaux, out int echelle, out Rect zoneVue)
        {
            var ancienne = new FilteredElementCollector(doc).OfClass(typeof(ViewSheet)).Cast<ViewSheet>().FirstOrDefault(v => v.SheetNumber == numero);
            if (ancienne != null)
            {
                if (ancienne.Id == vueActive) ancienne.SheetNumber = numero + " (ancienne " + DateTime.Now.ToString("HHmmss", CultureInfo.InvariantCulture) + ")";
                else doc.Delete(ancienne.Id);
            }
            var feuille = ViewSheet.Create(doc, cartouche?.Id ?? ElementId.InvalidElementId);
            feuille.SheetNumber = numero;
            feuille.Name = nom;
            doc.Regenerate();
            Rect cadre, zoneTableaux;
            if (cartouche != null && FilteredElementCollectorCartouche(feuille) is Element tb && tb.get_BoundingBox(feuille) is BoundingBoxXYZ bb)
            {
                cadre = new Rect(Compat.Mm(bb.Min.X) + 12, Compat.Mm(bb.Min.Y) + 12, Compat.Mm(bb.Max.X) - 12, Compat.Mm(bb.Max.Y) - 12);
                zoneTableaux = new Rect(cadre.X0, cadre.Y0 + 60, cadre.X1, cadre.Y1);
            }
            else
            {
                cadre = new Rect(15, 15, 405, 282);
                DessinerCadreA3(feuille, titre, sousTitre, numero);
                zoneTableaux = new Rect(cadre.X0, 50, cadre.X1, cadre.Y1);
            }
            var page = MiseEnPage.Ranger(zoneTableaux, tableaux, HauteurLigneMm);
            zoneVue = new Rect(cadre.X0, cadre.Y0, page.ZoneVue.X1, cadre.Y1);
            foreach (var p in page.Tableaux) DessinerTableau(feuille, p);

            var centre = new XYZ(Compat.Pieds((zoneVue.X0 + zoneVue.X1) / 2), Compat.Pieds((zoneVue.Y0 + zoneVue.Y1) / 2), 0);
            vue.Scale = 100;
            var vp = Viewport.Create(doc, feuille.Id, vue.Id, centre);
            doc.Regenerate();
            var o = vp.GetBoxOutline();
            echelle = MiseEnPage.ChoisirEchelle(Compat.Mm(o.MaximumPoint.X - o.MinimumPoint.X) * 100, Compat.Mm(o.MaximumPoint.Y - o.MinimumPoint.Y) * 100,
                zoneVue.Largeur * 0.92, zoneVue.Hauteur * 0.92);
            vue.Scale = echelle;
            doc.Regenerate();
            vp.SetBoxCenter(centre);
            Texte(feuille, zoneVue.X0 + 2, zoneVue.Y0 + 4, "Échelle 1:" + echelle.ToString(CultureInfo.InvariantCulture));
            return feuille;
        }

        public void Nord(ViewSheet f, View3D vue, Rect zone) => DessinerNord(f, vue, zone);

        Element FilteredElementCollectorCartouche(ViewSheet feuille) =>
            new FilteredElementCollector(doc, feuille.Id).OfCategory(BuiltInCategory.OST_TitleBlocks).FirstElement();

        /// <summary>Supprime (ou renomme) la feuille et la vue d'une génération précédente du même spool.</summary>
        bool LibererNoms(string spool, Resultat res)
        {
            var num = NumeroFeuille(r, spool);
            var nomVue = NomVue(spool);
            var feuille = new FilteredElementCollector(doc).OfClass(typeof(ViewSheet)).Cast<ViewSheet>().FirstOrDefault(v => v.SheetNumber == num);
            var vue = new FilteredElementCollector(doc).OfClass(typeof(View3D)).Cast<View3D>().FirstOrDefault(v => !v.IsTemplate && v.Name == nomVue);
            if ((feuille != null || vue != null) && !r.Remplacer)
            {
                res.Avertissements.Add("déjà généré (feuille " + num + ") : non remplacé");
                return false;
            }
            foreach (var v in new View[] { feuille, vue })
            {
                if (v == null) continue;
                if (v.Id == vueActive)
                {
                    // La vue ouverte ne peut pas être supprimée : on la renomme
                    var suffixe = " (ancienne " + DateTime.Now.ToString("HHmmss", CultureInfo.InvariantCulture) + ")";
                    if (v is ViewSheet vs) vs.SheetNumber = num + suffixe; else v.Name = nomVue + suffixe;
                    res.Avertissements.Add("l'ancienne " + (v is ViewSheet ? "feuille" : "vue") + " est ouverte : renommée « …" + suffixe + " »");
                }
                else doc.Delete(v.Id);
            }
            return true;
        }

        void EcrireReperes(Spool spool, Dictionary<string, Element> parCle, Resultat res)
        {
            int echecs = 0;
            foreach (var c in spool.Composants)
            {
                if (!parCle.TryGetValue(c.Id, out var e)) continue;
                var p = string.IsNullOrEmpty(r.ParametreRepere) ? e.get_Parameter(BuiltInParameter.ALL_MODEL_MARK) : e.LookupParameter(r.ParametreRepere);
                if (p == null || p.IsReadOnly || p.StorageType != StorageType.String) { echecs++; continue; }
                p.Set(c.Repere);
            }
            if (echecs > 0) res.Avertissements.Add(echecs + " élément(s) sans paramètre de repère modifiable");
        }

        View3D CreerVue(Spool spool, List<Element> elements)
        {
            var vue = View3D.CreateIsometric(doc, typeVue3D);
            vue.Name = NomVue(spool.Nom);
            if (vue.ViewTemplateId != ElementId.InvalidElementId) vue.ViewTemplateId = ElementId.InvalidElementId;

            // Encombrement du spool
            double x0 = double.MaxValue, y0 = double.MaxValue, z0 = double.MaxValue, x1 = double.MinValue, y1 = double.MinValue, z1 = double.MinValue;
            foreach (var e in elements)
            {
                var b = e.get_BoundingBox(null);
                if (b == null) continue;
                x0 = Math.Min(x0, b.Min.X); y0 = Math.Min(y0, b.Min.Y); z0 = Math.Min(z0, b.Min.Z);
                x1 = Math.Max(x1, b.Max.X); y1 = Math.Max(y1, b.Max.Y); z1 = Math.Max(z1, b.Max.Z);
            }
            var marge = Compat.Pieds(150);
            var min = new XYZ(x0 - marge, y0 - marge, z0 - marge);
            var max = new XYZ(x1 + marge, y1 + marge, z1 + marge);
            var centre = (min + max) / 2;

            var avant = Direction(r.Orientation);
            var haut = (XYZ.BasisZ - avant * avant.DotProduct(XYZ.BasisZ)).Normalize();
            vue.SetOrientation(new ViewOrientation3D(centre - avant * (max - min).GetLength() * 2, haut, avant));

            vue.SetSectionBox(new BoundingBoxXYZ { Min = min, Max = max });
            try { vue.SetCategoryHidden(new ElementId(BuiltInCategory.OST_SectionBox), true); } catch { }
            vue.DetailLevel = r.Unifilaire ? ViewDetailLevel.Coarse : ViewDetailLevel.Fine;
            vue.DisplayStyle = DisplayStyle.HLR;

            vue.IsolateElementsTemporary(elements.Select(e => e.Id).ToList());
            vue.ConvertTemporaryHideIsolateToPermanent();
            vue.SaveOrientationAndLock();
            return vue;
        }

        /// <summary>Direction de regard : de l'angle choisi, en surplomb, vers le centre.</summary>
        public static XYZ Direction(Orientation o)
        {
            switch (o)
            {
                case Orientation.SudOuest: return new XYZ(1, 1, -1).Normalize();
                case Orientation.NordEst: return new XYZ(-1, -1, -1).Normalize();
                case Orientation.NordOuest: return new XYZ(1, -1, -1).Normalize();
                default: return new XYZ(-1, 1, -1).Normalize();
            }
        }

        void Etiqueter(View3D vue, List<Element> elements, Resultat res)
        {
            var haut = vue.UpDirection;
            var droite = vue.RightDirection;
            var pas = Compat.Pieds(9 * vue.Scale); // 9 mm papier
            int i = 0, echecs = 0;
            foreach (var e in elements)
            {
                ElementId type;
                if (Compat.EstCategorie(e, BuiltInCategory.OST_PipeCurves) || Compat.EstCategorie(e, BuiltInCategory.OST_FlexPipeCurves)) type = etiquetteTube;
                else if (Compat.EstCategorie(e, BuiltInCategory.OST_PipeFitting)) type = etiquetteRaccord;
                else if (Compat.EstCategorie(e, BuiltInCategory.OST_PipeAccessory)) type = etiquetteAccessoire;
                else continue; // pièces de fabrication : étiquetées par les familles de fabrication, non gérées ici
                if (type == ElementId.InvalidElementId) continue;

                var point = PointEtiquette(e);
                if (point == null) continue;
                // Têtes d'étiquette alternées en haut à droite / en haut à gauche
                var sens = (i++ % 2 == 0) ? 1 : -1;
                var tete = point + haut * pas + droite * (sens * pas * 0.6);
                try { IndependentTag.Create(doc, type, vue.Id, new Reference(e), true, TagOrientation.Horizontal, tete); }
                catch { echecs++; }
            }
            if (echecs > 0) res.Avertissements.Add(echecs + " étiquette(s) non posée(s)");
        }

        static XYZ PointEtiquette(Element e)
        {
            if (e.Location is LocationCurve lc) return lc.Curve.Evaluate(0.5, true);
            if (e.Location is LocationPoint lp) return lp.Point;
            var b = e.get_BoundingBox(null);
            return b == null ? null : (b.Min + b.Max) / 2;
        }

        void NumeroterAssemblages(View3D vue, Spool spool, Resultat res)
        {
            var bas = -vue.UpDirection * Compat.Pieds(4 * vue.Scale);
            var opt = new TextNoteOptions(texteGras) { HorizontalAlignment = HorizontalTextAlignment.Center };
            foreach (var a in spool.Assemblages)
            {
                if (a.Nature != NatureAssemblage.Soudure && a.Nature != NatureAssemblage.RaccordementChantier) continue;
                var p = new XYZ(Compat.Pieds(a.Position.X), Compat.Pieds(a.Position.Y), Compat.Pieds(a.Position.Z)) + bas;
                try { TextNote.Create(doc, vue.Id, p, a.Numero + (a.SurlongueurMm > 0 ? " +" + a.SurlongueurMm.ToString("0", CultureInfo.InvariantCulture) : ""), opt); }
                catch
                {
                    res.Avertissements.Add("numéros de soudure non posés sur la vue (voir le tableau ASSEMBLAGES et l'export CSV)");
                    return;
                }
            }
        }

        // ---------- Cotation ----------

        /// <summary>Passage d'un point du modèle (mm) à la feuille (mm papier), à travers la vue posée dans la fenêtre.</summary>
        Func<Point3, (double x, double y)> Projection(View3D vue, Viewport vp, Resultat res)
        {
            try
            {
                var versProjection = vue.GetModelToProjectionTransforms().First().GetModelToProjectionTransform();
                var versFeuille = vp.GetProjectionToSheetTransform();
                return p =>
                {
                    var q = versFeuille.OfPoint(versProjection.OfPoint(new XYZ(Compat.Pieds(p.X), Compat.Pieds(p.Y), Compat.Pieds(p.Z))));
                    return (Compat.Mm(q.X), Compat.Mm(q.Y));
                };
            }
            catch (Exception ex)
            {
                res.Avertissements.Add("cotes et renvois non dessinés (" + ex.Message + ") : voir les tableaux et les CSV");
                return null;
            }
        }

        static (double x, double y) CentreDessin(Spool spool, Func<Point3, (double x, double y)> Feuille)
        {
            double cx = 0, cy = 0; int n = 0;
            foreach (var c in spool.Composants)
                foreach (var e in c.Extremites) { var q = Feuille(e.Position); cx += q.x; cy += q.y; n++; }
            return n > 0 ? (cx / n, cy / n) : (0, 0);
        }

        /// <summary>
        /// Cotes de fabrication dessinées sur la feuille, projetées sur la vue isométrique : lignes d'attache,
        /// ligne de cote décalée vers l'extérieur du spool, traits obliques aux extrémités, valeur en mm alignée.
        /// </summary>
        void Coter(ViewSheet f, Func<Point3, (double x, double y)> Feuille, Spool spool, Resultat res)
        {
            if (spool.Cotes.Count == 0) return;
            // Centre du dessin : les cotes sont rejetées du côté opposé
            var (cx, cy) = CentreDessin(spool, Feuille);

            const double decalage = 7, attache = 1.5, trait = 1.3;
            int echecs = 0;
            foreach (var cote in spool.Cotes)
            {
                var a = Feuille(cote.A); var b = Feuille(cote.B);
                double vx = b.x - a.x, vy = b.y - a.y, l = Math.Sqrt(vx * vx + vy * vy);
                if (l < 2) continue; // tronçon vu en bout : pas de cote lisible
                double ux = vx / l, uy = vy / l, nx = -uy, ny = ux;
                if (((a.x + b.x) / 2 - cx) * nx + ((a.y + b.y) / 2 - cy) * ny < 0) { nx = -nx; ny = -ny; }
                try
                {
                    Trait(f, a.x + nx * attache, a.y + ny * attache, a.x + nx * (decalage + attache), a.y + ny * (decalage + attache));
                    Trait(f, b.x + nx * attache, b.y + ny * attache, b.x + nx * (decalage + attache), b.y + ny * (decalage + attache));
                    double ax = a.x + nx * decalage, ay = a.y + ny * decalage, bx = b.x + nx * decalage, by = b.y + ny * decalage;
                    Trait(f, ax, ay, bx, by);
                    double tx = (ux + nx) / Math.Sqrt(2) * trait, ty = (uy + ny) / Math.Sqrt(2) * trait;
                    Trait(f, ax - tx, ay - ty, ax + tx, ay + ty);
                    Trait(f, bx - tx, by - ty, bx + tx, by + ty);

                    var angle = Math.Atan2(uy, ux);
                    if (angle > Math.PI / 2 + 1e-9) angle -= Math.PI;
                    if (angle <= -Math.PI / 2 + 1e-9) angle += Math.PI;
                    var opt = new TextNoteOptions(texte)
                    {
                        HorizontalAlignment = HorizontalTextAlignment.Center,
                        VerticalAlignment = VerticalTextAlignment.Middle,
                        Rotation = angle,
                    };
                    double mx = (ax + bx) / 2 + nx * 2.2, my = (ay + by) / 2 + ny * 2.2;
                    TextNote.Create(doc, f.Id, P(mx, my), cote.Valeur, opt);
                }
                catch { echecs++; }
            }
            if (echecs > 0) res.Avertissements.Add(echecs + " cote(s) non dessinée(s)");
        }

        // ---------- Provenance / destination ----------

        /// <summary>
        /// Renvoi à chaque extrémité du spool : flèche dans le sens de l'écoulement (vers le spool à l'arrivée,
        /// vers l'extérieur au départ) et cartouche « VIENT DE SP-100 » / « VA VERS POMPE P1 ».
        /// </summary>
        void Renvoyer(ViewSheet f, Func<Point3, (double x, double y)> Feuille, Spool spool, Rect zone, Resultat res)
        {
            var (cx, cy) = CentreDessin(spool, Feuille);
            int echecs = 0;
            foreach (var l in spool.Liaisons)
            {
                try
                {
                    var p = Feuille(l.Position);
                    // Direction de sortie dans le plan de la feuille : axe du connecteur projeté, sinon depuis le centre
                    double dx = p.x - cx, dy = p.y - cy;
                    if (l.Direction.HasValue)
                    {
                        var q = Feuille(l.Position + l.Direction.Value.Normalise() * 1000);
                        if (Math.Abs(q.x - p.x) + Math.Abs(q.y - p.y) > 1e-6) { dx = q.x - p.x; dy = q.y - p.y; }
                    }
                    var lg = Math.Sqrt(dx * dx + dy * dy);
                    if (lg < 1e-9) { dx = 1; dy = 0; lg = 1; }
                    dx /= lg; dy /= lg;

                    double x0 = p.x + dx * 2, y0 = p.y + dy * 2, x1 = p.x + dx * 13, y1 = p.y + dy * 13;
                    Trait(f, x0, y0, x1, y1);
                    // Pointe : vers le spool à l'arrivée, vers l'extérieur au départ
                    double px = l.Sens == SensFlux.Entree ? x0 : x1, py = l.Sens == SensFlux.Entree ? y0 : y1;
                    double a = Math.Atan2(dy, dx) + (l.Sens == SensFlux.Entree ? Math.PI : 0);
                    foreach (var d in new[] { 0.35, -0.35 })
                        Trait(f, px, py, px - 3 * Math.Cos(a + d), py - 3 * Math.Sin(a + d));

                    // Cartouche de renvoi au bout de la flèche
                    var txt = MiseEnPage.Tronquer(l.Numero + "  " + l.Libelle, 110, HauteurTexteMm);
                    double w = txt.Length * 0.68 * HauteurTexteMm + 4, h = 6;
                    double bx0 = dx >= 0 ? x1 + 1 : x1 - 1 - w, by0 = y1 - h / 2;
                    bx0 = Math.Max(zone.X0 + 1, Math.Min(bx0, zone.X1 - w - 1)); // reste dans la zone de la vue
                    Trait(f, bx0, by0, bx0 + w, by0); Trait(f, bx0 + w, by0, bx0 + w, by0 + h);
                    Trait(f, bx0 + w, by0 + h, bx0, by0 + h); Trait(f, bx0, by0 + h, bx0, by0);
                    Texte(f, bx0 + 2, y1, txt, gras: true);
                }
                catch { echecs++; }
            }
            if (echecs > 0) res.Avertissements.Add(echecs + " renvoi(s) non dessiné(s)");
        }

        // ---------- Dessin sur la feuille ----------

        static XYZ P(double xMm, double yMm) => new XYZ(Compat.Pieds(xMm), Compat.Pieds(yMm), 0);

        void Trait(View v, double x0, double y0, double x1, double y1)
        {
            if (Math.Abs(x1 - x0) + Math.Abs(y1 - y0) < 0.5) return;
            doc.Create.NewDetailCurve(v, Line.CreateBound(P(x0, y0), P(x1, y1)));
        }

        void Texte(View v, double x, double y, string t, bool gras = false, bool droite = false, bool centre = false)
        {
            if (string.IsNullOrEmpty(t)) return;
            var opt = new TextNoteOptions(gras ? texteGras : texte)
            {
                HorizontalAlignment = droite ? HorizontalTextAlignment.Right : centre ? HorizontalTextAlignment.Center : HorizontalTextAlignment.Left,
                VerticalAlignment = VerticalTextAlignment.Middle,
            };
            TextNote.Create(doc, v.Id, P(x, y), t, opt);
        }

        void DessinerTableau(ViewSheet f, Placement pl)
        {
            var t = pl.Tableau;
            double x = pl.X, y = pl.Y, w = t.Largeur, h = HauteurLigneMm;
            bool entete = t.Colonnes.Any(c => c.Titre != "");
            int nbLignes = t.Lignes.Count + (entete ? 2 : 1);
            double bas = y - nbLignes * h;

            // Cadre et lignes horizontales
            Trait(f, x, y, x + w, y); Trait(f, x, bas, x + w, bas);
            Trait(f, x, y, x, bas); Trait(f, x + w, y, x + w, bas);
            for (int i = 1; i < nbLignes; i++) Trait(f, x, y - i * h, x + w, y - i * h);
            // Colonnes (sous le titre)
            double cx = x;
            for (int j = 0; j < t.Colonnes.Count - 1; j++) { cx += t.Colonnes[j].LargeurMm; Trait(f, cx, y - h, cx, bas); }

            Texte(f, x + 1.5, y - h / 2, t.Titre, gras: true);
            int ligne = 1;
            if (entete)
            {
                cx = x;
                foreach (var c in t.Colonnes)
                {
                    Texte(f, c.Droite ? cx + c.LargeurMm - 1.5 : cx + 1.5, y - h * 1.5, MiseEnPage.Tronquer(c.Titre, c.LargeurMm, HauteurTexteMm), gras: true, droite: c.Droite);
                    cx += c.LargeurMm;
                }
                ligne = 2;
            }
            foreach (var l in t.Lignes)
            {
                cx = x;
                for (int j = 0; j < t.Colonnes.Count && j < l.Length; j++)
                {
                    var c = t.Colonnes[j];
                    Texte(f, c.Droite ? cx + c.LargeurMm - 1.5 : cx + 1.5, y - h * (ligne + 0.5), MiseEnPage.Tronquer(l[j], c.LargeurMm, HauteurTexteMm), droite: c.Droite);
                    cx += c.LargeurMm;
                }
                ligne++;
            }
        }

        /// <summary>Cadre A3 paysage et cartouche simple, quand aucun cartouche n'est choisi.</summary>
        void DessinerCadreA3(ViewSheet f, string titre, string sousTitre, string numeroFeuille)
        {
            Trait(f, 0, 0, 420, 0); Trait(f, 420, 0, 420, 297); Trait(f, 420, 297, 0, 297); Trait(f, 0, 297, 0, 0);
            Trait(f, 10, 10, 410, 10); Trait(f, 410, 10, 410, 287); Trait(f, 410, 287, 10, 287); Trait(f, 10, 287, 10, 10);
            // Cartouche : 190 × 35 mm en bas à droite
            double x0 = 220, x1 = 410, y0 = 10, y1 = 45;
            Trait(f, x0, y0, x0, y1); Trait(f, x0, y1, x1, y1);
            Trait(f, x0, 33, x1, 33); Trait(f, x0, 21, x1, 21);
            Trait(f, 330, y0, 330, 33);
            Texte(f, x0 + 2, 39, MiseEnPage.Tronquer(titre, 186, HauteurTexteMm), gras: true);
            Texte(f, x0 + 2, 27, MiseEnPage.Tronquer(projet, 108, HauteurTexteMm));
            Texte(f, 332, 27, "Feuille " + numeroFeuille);
            Texte(f, x0 + 2, 15.5, MiseEnPage.Tronquer(sousTitre, 108, HauteurTexteMm));
            Texte(f, 332, 15.5, DateTime.Now.ToString("dd/MM/yyyy", CultureInfo.GetCultureInfo("fr-FR")));
        }

        void EcrireEchelle(ViewSheet f, Rect zone, int echelle)
        {
            Texte(f, zone.X0 + 2, zone.Y0 + 4, "Échelle 1:" + echelle.ToString(CultureInfo.InvariantCulture) + "   –   cotes en mm   –   " + Libelle(r.Orientation), gras: false);
        }

        public static string Libelle(Orientation o)
        {
            switch (o)
            {
                case Orientation.SudOuest: return "vue depuis le sud-ouest";
                case Orientation.NordEst: return "vue depuis le nord-est";
                case Orientation.NordOuest: return "vue depuis le nord-ouest";
                default: return "vue depuis le sud-est";
            }
        }

        /// <summary>Flèche du nord (nord du projet) projetée dans le plan de la vue isométrique.</summary>
        void DessinerNord(ViewSheet f, View3D vue, Rect zone)
        {
            var n = XYZ.BasisY;
            double dx = n.DotProduct(vue.RightDirection), dy = n.DotProduct(vue.UpDirection);
            var l = Math.Sqrt(dx * dx + dy * dy);
            if (l < 1e-6) return;
            dx /= l; dy /= l;
            double ox = zone.X0 + 12, oy = zone.Y1 - 22, lg = 14;
            double tx = ox + dx * lg, ty = oy + dy * lg;
            Trait(f, ox, oy, tx, ty);
            // Pointe
            double a = Math.Atan2(dy, dx);
            foreach (var d in new[] { 0.4, -0.4 })
                Trait(f, tx, ty, tx - 4 * Math.Cos(a + d), ty - 4 * Math.Sin(a + d));
            Texte(f, tx + dx * 4, ty + dy * 4, "N", gras: true, centre: true);
        }
    }
}
