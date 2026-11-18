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
            texte = TypeTexte("Pipe-Fit ISO 2,5 mm", false, HauteurTexteMm);
            texteGras = TypeTexte("Pipe-Fit ISO 2,5 mm gras", true, HauteurTexteMm);
            texteTableau = TypeTexte("Pipe-Fit ISO tableaux 2 mm", false, MiseEnPage.HauteurTexteTableau);
            texteTableauGras = TypeTexte("Pipe-Fit ISO tableaux 2 mm gras", true, MiseEnPage.HauteurTexteTableau);
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

        ElementId texteTableau, texteTableauGras;

        ElementId TypeTexte(string nom, bool gras, double hauteurMm)
        {
            var existant = new FilteredElementCollector(doc).OfClass(typeof(TextNoteType)).Cast<TextNoteType>().FirstOrDefault(t => t.Name == nom);
            if (existant != null) return existant.Id;
            var base_ = doc.GetElement(doc.GetDefaultElementTypeId(ElementTypeGroup.TextNoteType)) as TextNoteType
                ?? new FilteredElementCollector(doc).OfClass(typeof(TextNoteType)).Cast<TextNoteType>().First();
            var t = (TextNoteType)base_.Duplicate(nom);
            t.get_Parameter(BuiltInParameter.TEXT_SIZE)?.Set(Compat.Pieds(hauteurMm));
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
            // Légende des symboles présents, en bande sous le dessin (à gauche du cartouche)
            var zoneBas = zoneVue;
            var entrees = Legende.Pour(spool).Where(x =>
                (r.NumerosSoudure || (x.Code != "SOUD" && x.Code != "SOUDCH")) && (r.Cotation || x.Code != "COTE")
                && (r.SymbolesRobinetterie || !Enum.TryParse(x.Code, true, out GenreRobinet _))).ToList();
            var legende = Legende.Compacte(entrees);
            var hLeg = legende.Hauteur(HauteurLigneMm);
            var zl = zoneVue;
            Etape("légende", res, () => DessinerTableau(feuille, new Placement { Tableau = legende, X = zl.X0, Y = zl.Y0 + 8 + hLeg }));
            zoneVue = new Rect(zoneVue.X0, zoneVue.Y0 + 8 + hLeg + 3, zoneVue.X1, zoneVue.Y1);

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

            var symbolises = new HashSet<string>(r.SymbolesRobinetterie
                ? spool.Composants.Where(c => Robinetterie.Symbolise(c) || SymboleBride.Dessinee(c)).Select(c => c.Id) : Enumerable.Empty<string>());
            if (!r.RepereFeuille)
            {
                Etiqueter(vue, elements.Where(e => !symbolises.Contains(Compat.Cle(e.Id))).ToList(), res);
                if (r.NumerosSoudure) NumeroterAssemblages(vue, spool, res);
            }
            doc.Regenerate();
            vp.SetBoxCenter(centre);
            doc.Regenerate();
            var projection = Projection(vue, vp, res);
            if (projection != null)
            {
                // Annotations sur la feuille : d'abord ce qui est fixe (tuyauterie, cotes, symboles, nord, échelle),
                // puis les étiquettes placées sans chevauchement (renvois, soudures, bulles, cadres de tubes)
                var obs = new Obstacles();
                foreach (var seg in Segments(spool, projection)) obs.Traits.Add(seg);
                obs.Durs.Add(new Rect(zoneVue.X0, zoneVue.Y1 - 32, zoneVue.X0 + 32, zoneVue.Y1));   // flèche du nord
                obs.Durs.Add(cartouche == null ? new Rect(220, 10, 410, 45) : new Rect(cadre.X1 - 180, cadre.Y0 - 12, cadre.X1 + 12, cadre.Y0 + 50)); // cartouche
                if (r.Cotation) Etape("cotes", res, () => Coter(feuille, projection, spool, res, obs));
                if (r.SymbolesRobinetterie) Etape("symboles de robinetterie", res, () => Symboliser(feuille, projection, spool, res, obs));
                Etape("renvois", res, () => Renvoyer(feuille, projection, spool, zoneVue, res, obs));
                Etape("repères", res, () => Reperer(feuille, projection, spool, zoneVue, res, obs, r.RepereFeuille ? null : symbolises));
            }

            Etape("flèche du nord", res, () => DessinerNord(feuille, vue, zoneVue));
            Etape("échelle", res, () => EcrireEchelle(feuille, zoneBas, res.Echelle));
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

        /// <summary>Étape d'annotation non bloquante : en cas d'erreur, la feuille est quand même créée et le bilan le signale.</summary>
        void Etape(string nom, Resultat res, Action action)
        {
            try { action(); }
            catch (Exception ex)
            {
                Journal.Ecrire("Spool " + res.Spool + ", " + nom + " : ERREUR\n" + ex);
                res.Avertissements.Add(nom + " non dessiné(e)s : " + ex.Message);
            }
        }

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
            try { vue.Name = NomVue(spool.Nom); }
            catch { vue.Name = NomVue(spool.Nom) + " " + DateTime.Now.ToString("HHmmss", CultureInfo.InvariantCulture); } // nom déjà pris par une autre vue
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
            // Robinetterie remplacée par les symboles normalisés dessinés sur la feuille
            if (r.SymbolesRobinetterie)
            {
                // … et brides remplacées par le symbole collet + bride tournante
                var cles = new HashSet<string>(spool.Composants.Where(c => Robinetterie.Symbolise(c) || SymboleBride.Dessinee(c)).Select(c => c.Id));
                var masques = elements.Where(e => cles.Contains(Compat.Cle(e.Id))).Select(e => e.Id).ToList();
                if (masques.Count > 0) try { vue.HideElements(masques); } catch { }
            }
            try { vue.SaveOrientationAndLock(); } catch (Exception ex) { Journal.Ecrire("Verrouillage de la vue " + vue.Name + " : " + ex.Message); }
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
        void Coter(ViewSheet f, Func<Point3, (double x, double y)> Feuille, Spool spool, Resultat res, Obstacles obs)
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
                    obs.Traits.Add((a.x + nx * attache, a.y + ny * attache, a.x + nx * (decalage + attache), a.y + ny * (decalage + attache)));
                    obs.Traits.Add((b.x + nx * attache, b.y + ny * attache, b.x + nx * (decalage + attache), b.y + ny * (decalage + attache)));
                    double ax = a.x + nx * decalage, ay = a.y + ny * decalage, bx = b.x + nx * decalage, by = b.y + ny * decalage;
                    Trait(f, ax, ay, bx, by);
                    obs.TraitsForts.Add((ax, ay, bx, by));
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
                    // Texte au milieu, ou glissé le long de la ligne s'il recouvrirait un autre texte
                    var lt = PlacementEtiquettes.LargeurTexte(cote.Valeur, HauteurTexteMm) + 1;
                    double mx = 0, my = 0; Rect cadre = null;
                    // Le long de la ligne, au-dessus puis de l'autre côté de la ligne de cote
                    var libre = false;
                    // Au-dessus, de l'autre côté, sur une deuxième rangée, puis dans le prolongement de la cote (tronçon court)
                    foreach (var cote2 in new[] { 2.2, -2.2, 5.6, 9.0, 12.4, -5.6 })
                    {
                        foreach (var t in new[] { 0.5, 0.35, 0.65, 0.22, 0.78, 0.1, 0.9, -0.6, 1.6, -1.2, 2.2, -1.8, 2.8 })
                        {
                            mx = ax + (bx - ax) * t + nx * cote2; my = ay + (by - ay) * t + ny * cote2;
                            cadre = PlacementEtiquettes.CadreTourne(mx, my, lt, HauteurTexteMm + 0.8, angle);
                            if (!obs.Durs.Any(o => PlacementEtiquettes.Recouvre(cadre, o))) { libre = true; break; }
                        }
                        if (libre) break;
                    }
                    if (!libre) { mx = (ax + bx) / 2 + nx * 2.2; my = (ay + by) / 2 + ny * 2.2; cadre = PlacementEtiquettes.CadreTourne(mx, my, lt, HauteurTexteMm + 0.8, angle); }
                    obs.Durs.Add(cadre);
                    TextNote.Create(doc, f.Id, P(mx, my), cote.Valeur, opt);
                }
                catch { echecs++; }
            }
            if (echecs > 0) res.Avertissements.Add(echecs + " cote(s) non dessinée(s)");
        }

        // ---------- Robinetterie ----------

        /// <summary>
        /// Flèche de pente le long d'un tube en pente, vers son extrémité basse, à côté du milieu du tube.
        /// </summary>
        void FlechePente(ViewSheet f, Composant c, Func<Point3, (double x, double y)> Feuille, Obstacles obs)
        {
            try
            {
                var haut = Feuille(c.Extremites[1 - c.BasIndex].Position); var bas = Feuille(c.Extremites[c.BasIndex].Position);
                double dx = bas.x - haut.x, dy = bas.y - haut.y, l = Math.Sqrt(dx * dx + dy * dy);
                if (l < 12) return;
                dx /= l; dy /= l;
                double nx = -dy, ny = dx, mx = (haut.x + bas.x) / 2 + nx * 2.6, my = (haut.y + bas.y) / 2 + ny * 2.6;
                var segs = new List<(double, double, double, double)>
                {
                    (mx - dx * 4, my - dy * 4, mx + dx * 4, my + dy * 4),
                    (mx + dx * 4, my + dy * 4, mx + dx * 2.4 + nx * 1.1, my + dy * 2.4 + ny * 1.1),
                    (mx + dx * 4, my + dy * 4, mx + dx * 2.4 - nx * 1.1, my + dy * 2.4 - ny * 1.1),
                };
                Traits(f, segs);
                foreach (var g in segs) obs.TraitsForts.Add(g);
            }
            catch { }
        }

        /// <summary>
        /// Symbole normalisé de chaque vanne / accessoire (papillon, réglage, clapet avec flèche d'écoulement, compensateur…),
        /// orienté sur le tube dans le sens de l'écoulement, avec sa bulle de repère.
        /// </summary>
        void Symboliser(ViewSheet f, Func<Point3, (double x, double y)> Feuille, Spool spool, Resultat res, Obstacles obs)
        {
            int echecs = 0;
            var (cxd, cyd) = CentreDessin(spool, Feuille);
            foreach (var c in spool.Composants.Where(Robinetterie.Symbolise))
            {
                try
                {
                    double mx, my, dx, dy;
                    if (c.Extremites.Count == 1) (mx, my, dx, dy) = AxePiquage(c, Feuille, cxd, cyd);
                    else
                    {
                        var o = Robinetterie.Ordre(c);
                        var a = Feuille(o[0].Position); var b = Feuille(o[1].Position);
                        mx = (a.x + b.x) / 2; my = (a.y + b.y) / 2; dx = b.x - a.x; dy = b.y - a.y;
                        var l = Math.Sqrt(dx * dx + dy * dy);
                        if (l < 0.3) { dx = 1; dy = 0; l = 1; } // vu en bout
                        dx /= l; dy /= l;
                    }
                    var segs = Robinetterie.Placer(Robinetterie.Symbole(c.Genre), mx, my, dx, dy);
                    Traits(f, segs);
                    foreach (var s in segs) obs.TraitsForts.Add(s);
                    obs.Durs.Add(new Rect(segs.Min(s => Math.Min(s.x1, s.x2)), segs.Min(s => Math.Min(s.y1, s.y2)), segs.Max(s => Math.Max(s.x1, s.x2)), segs.Max(s => Math.Max(s.y1, s.y2))));
                }
                catch { echecs++; }
            }
            // Brides : tube jusqu'à la face de joint, collet + bride tournante à la face
            foreach (var c in spool.Composants.Where(SymboleBride.Dessinee))
            {
                try
                {
                    var (face, soudure) = SymboleBride.Faces(c, spool);
                    var a = Feuille(face.Position); var b = Feuille(soudure.Position);
                    double dx = b.x - a.x, dy = b.y - a.y, l = Math.Sqrt(dx * dx + dy * dy);
                    if (l < 0.3) continue; // vue en bout : le tube suffit
                    dx /= l; dy /= l;
                    if (l >= 1.25) Trait(f, a.x, a.y, b.x, b.y);
                    var segs = Robinetterie.Placer(SymboleBride.Dessin(), a.x, a.y, dx, dy);
                    Traits(f, segs);
                    foreach (var s in segs) obs.TraitsForts.Add(s);
                    obs.Durs.Add(new Rect(segs.Min(s => Math.Min(s.x1, s.x2)), segs.Min(s => Math.Min(s.y1, s.y2)), segs.Max(s => Math.Max(s.x1, s.x2)), segs.Max(s => Math.Max(s.y1, s.y2))));
                }
                catch { echecs++; }
            }
            if (echecs > 0) res.Avertissements.Add(echecs + " symbole(s) de robinetterie ou de bride non dessiné(s)");
        }

        /// <summary>
        /// Appareil sur piquage (purgeur, manomètre, thermomètre) : origine au raccordement, axe vers l'appareil (à l'opposé du
        /// tube : sens inverse du connecteur de l'appareil), sinon vers l'extérieur du dessin.
        /// </summary>
        static (double x, double y, double dx, double dy) AxePiquage(Composant c, Func<Point3, (double x, double y)> Feuille, double cx, double cy)
        {
            var e = c.Extremites[0];
            var p = Feuille(e.Position);
            double dx = 0, dy = 1;
            if (e.Direction.HasValue)
            {
                var q = Feuille(e.Position - e.Direction.Value.Normalise() * 1000);
                if (Math.Abs(q.x - p.x) + Math.Abs(q.y - p.y) > 1e-6) { dx = q.x - p.x; dy = q.y - p.y; }
            }
            else if (Math.Abs(p.x - cx) + Math.Abs(p.y - cy) > 1e-6) { dx = p.x - cx; dy = p.y - cy; }
            var l = Math.Sqrt(dx * dx + dy * dy);
            return (p.x, p.y, dx / l, dy / l);
        }

        // ---------- Repères placés sans chevauchement ----------

        /// <summary>Tuyauterie projetée sur la feuille (pour que les étiquettes l'évitent).</summary>
        static IEnumerable<(double x1, double y1, double x2, double y2)> Segments(Spool spool, Func<Point3, (double x, double y)> Feuille)
        {
            foreach (var c in spool.Composants)
            {
                if (Cotation.EstNoeud(c))
                {
                    var axe = Feuille(Cotation.PointAxe(c));
                    foreach (var e in c.Extremites) { var p = Feuille(e.Position); yield return (p.x, p.y, axe.x, axe.y); }
                }
                else if (c.Extremites.Count >= 2)
                {
                    var a = Feuille(c.Extremites[0].Position); var b = Feuille(c.Extremites[1].Position);
                    yield return (a.x, a.y, b.x, b.y);
                }
            }
        }

        /// <summary>
        /// Numéros de soudure, bulles de repère (robinetterie, raccords) et cadres des tubes, placés sans chevauchement.
        /// seulement : si non null, seuls ces composants (robinetterie symbolisée) sont repérés ici (les autres ont leurs étiquettes Revit).
        /// </summary>
        void Reperer(ViewSheet f, Func<Point3, (double x, double y)> Feuille, Spool spool, Rect zone, Resultat res, Obstacles obs, HashSet<string> seulement)
        {
            var (cx, cy) = CentreDessin(spool, Feuille);
            var liste = new List<(Etiquette e, string forme)>();
            var h = HauteurTexteMm;

            if (seulement == null && r.NumerosSoudure)
                foreach (var a in spool.Assemblages.Where(x => x.Nature == NatureAssemblage.Soudure || x.Nature == NatureAssemblage.RaccordementChantier))
                {
                    var t = a.Numero + (a.SurlongueurMm > 0 ? " +" + a.SurlongueurMm.ToString("0", CultureInfo.InvariantCulture) : "");
                    var p = Feuille(a.Position);
                    liste.Add((new Etiquette { Texte = t, Largeur = PlacementEtiquettes.LargeurTexte(t, h, true) + 0.6, Hauteur = h + 0.4,
                        Ancrages = { (p.x, p.y) }, Direction = (0, -1), DistanceMin = 1.2, DistanceMax = 9, Rappel = false }, "soudure"));
                }

            (double x, double y) Normale(double dx, double dy, double mx, double my)
            {
                double l = Math.Sqrt(dx * dx + dy * dy);
                if (l < 1e-6) return (0, 1);
                double nx = -dy / l, ny = dx / l;
                return (mx - cx) * nx + (my - cy) * ny < 0 ? (-nx, -ny) : (nx, ny);
            }
            Etiquette Bulle(string texte, double x, double y, (double, double) dir)
            {
                var d = Math.Max(4.8, PlacementEtiquettes.LargeurTexte(texte, h, true) + 1.6);
                return new Etiquette { Texte = texte, Largeur = d, Hauteur = d, Ancrages = { (x, y) }, Direction = dir };
            }

            var robinets = spool.Composants.Where(Robinetterie.Symbolise);
            var raccords = spool.Composants.Where(c => c.Type != TypeComposant.Tube && !Robinetterie.Symbolise(c) && c.Repere != "");
            foreach (var c in robinets.Concat(raccords))
            {
                if (seulement != null && !seulement.Contains(c.Id)) continue;
                double mx, my, dx = 1, dy = 0;
                if (c.Extremites.Count == 1 && Robinetterie.Symbolise(c))
                {
                    // Appareil sur piquage : bulle accrochée au bout de l'appareil, dans le prolongement
                    var (px, py, ax, ay) = AxePiquage(c, Feuille, cx, cy);
                    liste.Add((Bulle(c.Repere, px + ax * 9, py + ay * 9, (ax, ay)), "bulle"));
                    continue;
                }
                if (Cotation.EstNoeud(c)) { var p = Feuille(Cotation.PointAxe(c)); mx = p.x; my = p.y; dx = 0; dy = 0; }
                else if (c.Extremites.Count >= 2)
                {
                    var a = Feuille(c.Extremites[0].Position); var b = Feuille(c.Extremites[1].Position);
                    mx = (a.x + b.x) / 2; my = (a.y + b.y) / 2; dx = b.x - a.x; dy = b.y - a.y;
                }
                else if (c.Extremites.Count == 1) { var p = Feuille(c.Extremites[0].Position); mx = p.x; my = p.y; }
                else continue;
                liste.Add((Bulle(c.Repere, mx, my, dx == 0 && dy == 0 ? (mx - cx, my - cy) : Normale(dx, dy, mx, my)), "bulle"));
            }

            if (seulement == null)
                foreach (var c in spool.Composants.Where(x => x.Type == TypeComposant.Tube && x.Extremites.Count >= 2))
                {
                    var a = Feuille(c.Extremites[0].Position); var b = Feuille(c.Extremites[1].Position);
                    var txt = c.Repere + (c.PentePourcent > 0 ? "  " + c.TextePente : "");
                    var e = new Etiquette { Texte = txt, Largeur = PlacementEtiquettes.LargeurTexte(txt, h, true) + 2.4, Hauteur = h + 1.7,
                        Direction = Normale(b.x - a.x, b.y - a.y, (a.x + b.x) / 2, (a.y + b.y) / 2) };
                    if (c.PentePourcent > 0) FlechePente(f, c, Feuille, obs);
                    foreach (var t in new[] { 0.5, 0.3, 0.7, 0.15, 0.85 }) e.Ancrages.Add((a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
                    liste.Add((e, "cadre"));
                }

            PlacementEtiquettes.Placer(liste.Select(x => x.e), obs, zone);
            int chevauchent = 0;
            foreach (var (e, forme) in liste)
            {
                if (e.Chevauche) chevauchent++;
                var (rx, ry) = PlacementEtiquettes.Bord(e, e.X, e.Y, e.Ancrage);
                if (forme == "soudure")
                {
                    // Point de soudure et numéro ; trait de rappel si le numéro s'est éloigné
                    Cercle(f, e.Ancrage.x, e.Ancrage.y, 0.6);
                    if (Math.Sqrt((rx - e.Ancrage.x) * (rx - e.Ancrage.x) + (ry - e.Ancrage.y) * (ry - e.Ancrage.y)) > 3) Trait(f, e.Ancrage.x, e.Ancrage.y, rx, ry);
                    Texte(f, e.X, e.Y, e.Texte, gras: true, centre: true);
                    continue;
                }
                Trait(f, e.Ancrage.x, e.Ancrage.y, rx, ry);
                if (forme == "bulle")
                {
                    Cercle(f, e.X, e.Y, e.Largeur / 2);
                }
                else
                {
                    var c0 = e.Cadre;
                    Trait(f, c0.X0, c0.Y0, c0.X1, c0.Y0); Trait(f, c0.X1, c0.Y0, c0.X1, c0.Y1); Trait(f, c0.X1, c0.Y1, c0.X0, c0.Y1); Trait(f, c0.X0, c0.Y1, c0.X0, c0.Y0);
                }
                Texte(f, e.X, e.Y, e.Texte, gras: true, centre: true);
            }
            if (chevauchent > 0) res.Avertissements.Add(chevauchent + " étiquette(s) sans place libre (vue trop chargée : agrandir l'échelle ou la feuille)");
        }

        // ---------- Provenance / destination ----------

        /// <summary>
        /// Renvoi à chaque extrémité du spool : flèche dans le sens de l'écoulement (vers le spool à l'arrivée,
        /// vers l'extérieur au départ) et cartouche « VIENT DE SP-100 » / « VA VERS POMPE P1 ».
        /// </summary>
        void Renvoyer(ViewSheet f, Func<Point3, (double x, double y)> Feuille, Spool spool, Rect zone, Resultat res, Obstacles obs)
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

                    obs.TraitsForts.Add((x0, y0, x1, y1));
                    // Cartouche de renvoi au bout de la flèche, placé sans chevauchement
                    var txt = MiseEnPage.Tronquer(l.Numero + "  " + l.Libelle, 110, HauteurTexteMm);
                    var et = new Etiquette { Texte = txt, Largeur = PlacementEtiquettes.LargeurTexte(txt, HauteurTexteMm, true) + 4, Hauteur = 6,
                        Ancrages = { (x1, y1) }, Direction = (dx, dy), DistanceMin = 0.8, DistanceMax = 30 };
                    PlacementEtiquettes.Placer(new[] { et }, obs, zone);
                    var c0 = et.Cadre;
                    Trait(f, c0.X0, c0.Y0, c0.X1, c0.Y0); Trait(f, c0.X1, c0.Y0, c0.X1, c0.Y1);
                    Trait(f, c0.X1, c0.Y1, c0.X0, c0.Y1); Trait(f, c0.X0, c0.Y1, c0.X0, c0.Y0);
                    var (rx, ry) = PlacementEtiquettes.Bord(et, et.X, et.Y, et.Ancrage);
                    Trait(f, x1, y1, rx, ry);
                    Texte(f, c0.X0 + 2, et.Y, txt, gras: true);
                }
                catch { echecs++; }
            }
            if (echecs > 0) res.Avertissements.Add(echecs + " renvoi(s) non dessiné(s)");
        }

        // ---------- Dessin sur la feuille ----------

        static XYZ P(double xMm, double yMm) => new XYZ(Compat.Pieds(xMm), Compat.Pieds(yMm), 0);

        /// <summary>Longueur minimale d'un trait (mm papier) : Revit refuse les courbes plus courtes que sa tolérance (≈ 1,2 mm).</summary>
        const double TraitMin = 1.25;

        /// <summary>Trait sur la feuille ; un trait trop court pour Revit est ignoré (il ne doit jamais arrêter la génération).</summary>
        void Trait(View v, double x0, double y0, double x1, double y1)
        {
            if (Math.Sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)) < TraitMin) return;
            try { doc.Create.NewDetailCurve(v, Line.CreateBound(P(x0, y0), P(x1, y1))); }
            catch (Exception ex) { Journal.Ecrire("Trait ignoré : " + ex.Message); }
        }

        /// <summary>Cercle (arc Revit complet), pour les bulles et les points de soudure.</summary>
        void Cercle(View v, double x, double y, double r)
        {
            try { doc.Create.NewDetailCurve(v, Arc.Create(P(x, y), Compat.Pieds(r), 0, 2 * Math.PI, XYZ.BasisX, XYZ.BasisY)); }
            catch (Exception ex) { Journal.Ecrire("Cercle ignoré : " + ex.Message); }
        }

        /// <summary>
        /// Suite de petits segments (cercles des symboles…) redécoupée en traits d'au moins 1,25 mm : les segments qui se
        /// suivent sont enchaînés, et l'on ne trace une corde que lorsqu'elle est assez longue pour Revit.
        /// </summary>
        void Traits(View v, IEnumerable<(double x1, double y1, double x2, double y2)> segments)
        {
            foreach (var c in Cordes.Decouper(segments, TraitMin)) Trait(v, c.x1, c.y1, c.x2, c.y2);
        }

        void Texte(View v, double x, double y, string t, bool gras = false, bool droite = false, bool centre = false, bool tableau = false)
        {
            if (string.IsNullOrEmpty(t)) return;
            var type = tableau ? (gras ? texteTableauGras : texteTableau) : (gras ? texteGras : texte);
            if (type == null || type == ElementId.InvalidElementId) type = gras ? texteGras : texte;
            var opt = new TextNoteOptions(type)
            {
                HorizontalAlignment = droite ? HorizontalTextAlignment.Right : centre ? HorizontalTextAlignment.Center : HorizontalTextAlignment.Left,
                VerticalAlignment = VerticalTextAlignment.Middle,
            };
            try { TextNote.Create(doc, v.Id, P(x, y), t, opt); }
            catch (Exception ex) { Journal.Ecrire("Texte ignoré « " + t + " » : " + ex.Message); }
        }

        void DessinerTableau(ViewSheet f, Placement pl)
        {
            var t = pl.Tableau;
            double x = pl.X, y = pl.Y, w = t.Largeur, h = HauteurLigneMm, hl = h * t.Interligne;
            bool entete = t.Colonnes.Any(c => c.Titre != "");
            int haut = entete ? 2 : 1;
            double bas = y - t.Hauteur(h);
            double Ligne(int i) => i <= haut ? y - i * h : y - haut * h - (i - haut) * hl; // ordonnée du bas de la ligne i

            // Cadre et lignes horizontales
            Trait(f, x, y, x + w, y); Trait(f, x, bas, x + w, bas);
            Trait(f, x, y, x, bas); Trait(f, x + w, y, x + w, bas);
            for (int i = 1; i < haut + t.Lignes.Count; i++) Trait(f, x, Ligne(i), x + w, Ligne(i));
            // Colonnes (sous le titre)
            double cx = x;
            for (int j = 0; j < t.Colonnes.Count - 1; j++) { cx += t.Colonnes[j].LargeurMm; Trait(f, cx, y - h, cx, bas); }

            Texte(f, x + 1.5, y - h / 2, MiseEnPage.Tronquer(t.Titre, w, HauteurTexteMm, true), gras: true);
            var ht = MiseEnPage.HauteurTexteTableau;
            if (entete)
            {
                cx = x;
                foreach (var c in t.Colonnes)
                {
                    Texte(f, c.Droite ? cx + c.LargeurMm - 1.5 : cx + 1.5, y - h * 1.5, MiseEnPage.Tronquer(c.Titre, c.LargeurMm, ht, true), gras: true, droite: c.Droite, tableau: true);
                    cx += c.LargeurMm;
                }
            }
            for (int i = 0; i < t.Lignes.Count; i++)
            {
                var l = t.Lignes[i];
                double ym = (Ligne(haut + i) + Ligne(haut + i + 1)) / 2;
                cx = x;
                for (int j = 0; j < t.Colonnes.Count && j < l.Length; j++)
                {
                    var c = t.Colonnes[j];
                    if (l[j] != null && l[j].StartsWith(Legende.Marque)) DessinerSymbole(f, cx + c.LargeurMm / 2, ym, l[j].Substring(Legende.Marque.Length));
                    else Texte(f, c.Droite ? cx + c.LargeurMm - 1.5 : cx + 1.5, ym, MiseEnPage.Tronquer(l[j], c.LargeurMm, ht), droite: c.Droite, tableau: true);
                    cx += c.LargeurMm;
                }
            }
        }

        /// <summary>Symbole de légende dessiné dans une case (centre x, y en mm papier).</summary>
        void DessinerSymbole(ViewSheet f, double x, double y, string code)
        {
            var d = Legende.Dessin(code);
            Traits(f, d.Traits.Select(s => (x + s.U1, y + s.V1, x + s.U2, y + s.V2)));
            foreach (var t in d.Textes) Texte(f, x + t.U, y + t.V, t.Texte, gras: t.Gras, centre: true);
        }

        /// <summary>Feuille « LÉGENDE DES SYMBOLES » : tous les symboles des isométries, à joindre au dossier.</summary>
        public ViewSheet FeuilleLegende(string numero)
        {
            var ancienne = new FilteredElementCollector(doc).OfClass(typeof(ViewSheet)).Cast<ViewSheet>().FirstOrDefault(v => v.SheetNumber == numero);
            if (ancienne != null && ancienne.Id != vueActive) doc.Delete(ancienne.Id);
            else if (ancienne != null) ancienne.SheetNumber = numero + " (ancienne)";
            var feuille = ViewSheet.Create(doc, cartouche?.Id ?? ElementId.InvalidElementId);
            feuille.SheetNumber = numero;
            feuille.Name = "Légende des symboles";
            doc.Regenerate();
            Rect cadre;
            if (cartouche != null && FilteredElementCollectorCartouche(feuille) is Element tb && tb.get_BoundingBox(feuille) is BoundingBoxXYZ bb)
                cadre = new Rect(Compat.Mm(bb.Min.X) + 12, Compat.Mm(bb.Min.Y) + 72, Compat.Mm(bb.Max.X) - 12, Compat.Mm(bb.Max.Y) - 12);
            else
            {
                DessinerCadreA3(feuille, "LÉGENDE DES SYMBOLES DES ISOMÉTRIES", "", numero);
                cadre = new Rect(15, 50, 405, 282);
            }
            // Deux colonnes : repérage et cotation, puis robinetterie
            var toutes = Legende.Toutes().ToList();
            var tableaux = new List<Tableau>
            {
                Legende.Tableau(toutes.Where(x => !Enum.TryParse(x.Code, true, out GenreRobinet _)), "REPÈRES, SOUDURES, COTES"),
                Legende.Tableau(toutes.Where(x => Enum.TryParse(x.Code, true, out GenreRobinet _)), "ROBINETTERIE ET ACCESSOIRES"),
            };
            var page = MiseEnPage.Ranger(new Rect(cadre.X0, cadre.Y0, cadre.X0 + 270, cadre.Y1), tableaux, HauteurLigneMm);
            foreach (var p in page.Tableaux) DessinerTableau(feuille, p);
            return feuille;
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
            Texte(f, x0 + 2, 39, MiseEnPage.Tronquer(titre, 186, HauteurTexteMm, true), gras: true);
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
