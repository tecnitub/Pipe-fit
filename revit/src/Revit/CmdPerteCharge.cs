// Commande « Perte de charge » : calcul hydraulique sur une tuyauterie dessinée. On sélectionne le chemin (tubes,
// raccords, vannes, avec Ctrl ou par fenêtre), ou on le clique après la commande. Pour chaque élément : diamètre
// intérieur et rugosité du segment de tuyau Revit, longueur, débit du calcul Revit (sinon débit saisi), ζ selon le
// raccord ou la vanne (té : passage ou dérivation d'après le chemin choisi). Résultats et note Excel dans la fenêtre.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Plumbing;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using PipeFit.Isometries.Core;
using TaskDialog = Autodesk.Revit.UI.TaskDialog;

namespace PipeFit.Isometries.Revit
{
    [Transaction(TransactionMode.Manual)]
    public sealed class CmdPerteCharge : CommandeBase
    {
        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            var filtre = new FiltreTuyauterie();
            var elements = uidoc.Selection.GetElementIds().Select(doc.GetElement).Where(e => e != null && filtre.AllowElement(e)).ToList();
            if (elements.Count == 0)
            {
                try
                {
                    elements = uidoc.Selection.PickObjects(ObjectType.Element, filtre, "Perte de charge : sélectionnez le chemin (tubes, raccords, vannes), puis Terminer")
                        .Select(r => doc.GetElement(r)).ToList();
                }
                catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return Result.Cancelled; }
            }
            if (elements.Count == 0) return Result.Cancelled;

            var troncons = Troncons(doc, elements, out var notes);
            if (troncons.Count == 0) { TaskDialog.Show("Pipe-Fit", "Aucune canalisation exploitable dans la sélection."); return Result.Cancelled; }
            var projet = doc.ProjectInformation?.Name;
            using (var f = new FenetreCalcul(false, "Perte de charge hydraulique", string.IsNullOrWhiteSpace(projet) ? doc.Title : projet, troncons, notes))
            {
                f.EcrireMaquette = (tr, vmax) => ResultatsMaquette.Ecrire(doc, data.Application.Application, uidoc.ActiveView, tr, vmax, false);
                f.ShowDialog(new FenetreRevit(data.Application.MainWindowHandle));
            }
            return Result.Succeeded;
        }

        internal static double M3h(double interne) => UnitUtils.ConvertFromInternalUnits(interne, UnitTypeId.CubicMetersPerHour);

        internal static bool EstEquipement(Element e) => Compat.EstCategorie(e, BuiltInCategory.OST_MechanicalEquipment) || Compat.EstCategorie(e, BuiltInCategory.OST_PlumbingFixtures);

        internal static string NomFamille(Element e) => ((e.Document.GetElement(e.GetTypeId()) as ElementType)?.FamilyName ?? "") + " " + e.Name;

        internal static double DnMax(Element e) => LectureModele.Connecteurs(e).Select(c => { try { return Compat.Mm(c.Radius * 2); } catch { return 0; } }).DefaultIfEmpty(0).Max();

        /// <summary>
        /// Débits du réseau relié à la sélection : somme des débits des équipements consommateurs en aval de la source
        /// (équipement de production ou pompe, sinon l'élément sélectionné de plus gros diamètre). Le parcours s'arrête aux
        /// équipements (on ne passe pas de l'aller au retour à travers un émetteur).
        /// </summary>
        static Dictionary<string, double> DebitsHydrauliques(Document doc, List<Element> elements, out string note)
        {
            note = null;
            var reseau = new Dictionary<string, Element>(); var liens = new Dictionary<string, HashSet<string>>();
            HashSet<string> L(string k) { if (!liens.TryGetValue(k, out var h)) liens[k] = h = new HashSet<string>(); return h; }
            var file = new Queue<Element>();
            foreach (var e in elements) { reseau[Compat.Cle(e.Id)] = e; file.Enqueue(e); }
            var vus = new HashSet<string>();
            while (file.Count > 0 && reseau.Count < 20000)
            {
                var e = file.Dequeue(); var k = Compat.Cle(e.Id);
                if (!vus.Add(k)) continue;
                foreach (var cn in LectureModele.Connecteurs(e))
                    foreach (Connector r in cn.AllRefs)
                    {
                        var ow = r.Owner;
                        if (ow == null || ow.Id == e.Id || ow is MEPSystem || (r.ConnectorType & ConnectorType.Physical) == 0) continue;
                        var kv = Compat.Cle(ow.Id);
                        L(k).Add(kv); L(kv).Add(k);
                        if (!reseau.ContainsKey(kv)) reseau[kv] = ow;
                        if (!EstEquipement(e) && !EstEquipement(ow) && !vus.Contains(kv)) file.Enqueue(ow);
                    }
            }
            var production = new System.Text.RegularExpressions.Regex(@"pompe|pump|circulateur|groupe (froid|de production)|chiller|refroidisseur|chaudi|boiler|\bpac\b|chaleur|heat ?pump|production|thermofrigopompe|\btfp\b|sous.?station|echangeur primaire");
            var equipements = reseau.Values.Where(EstEquipement).ToList();
            var sources = equipements.Where(e => production.IsMatch(AnalyseSpool.Normaliser(NomFamille(e)))).OrderByDescending(DnMax).ToList();
            var consommateurs = new Dictionary<string, double>();
            foreach (var e in equipements.Except(sources))
            {
                var q = ParametresPerte.Pa(e, GenrePerte.DebitHydraulique);
                if (q > 0) consommateurs[Compat.Cle(e.Id)] = q.Value;
            }
            if (consommateurs.Count == 0) return new Dictionary<string, double>();
            var src = sources.FirstOrDefault() ?? elements.OrderByDescending(DnMax).First();
            var voisins = liens.ToDictionary(kv => kv.Key, kv => kv.Value.ToList());
            var res = PerteCharge.DebitsArbre(voisins, consommateurs, Compat.Cle(src.Id));
            note = consommateurs.Count + " équipement(s) avec un débit (" + consommateurs.Values.Sum().ToString("0.##") + " m³/h) : débits calculés en aval de « "
                + NomFamille(src).Trim() + " »" + (sources.Count == 0 ? " (pas de production ni de pompe reliée : élément sélectionné de plus gros diamètre)" : "") + ".";
            return res;
        }

        /// <summary>Diamètre intérieur (mm) et débit (m³/h) du tube raccordé à une extrémité, sélectionné ou non.</summary>
        internal static (double D, double Q) Tube(Document doc, Extremite x, Dictionary<string, double> dint, Dictionary<string, double> debit)
        {
            if (x.ConnecteA == null) return (x.DnMm, 0);
            double d = dint.TryGetValue(x.ConnecteA, out var dd) ? dd : 0, q = debit.TryGetValue(x.ConnecteA, out var qq) ? qq : 0;
            if (d > 0 && q > 0) return (d, q);
            try
            {
                if (doc.GetElement(Compat.IdDepuis(x.ConnecteA)) is Pipe p)
                {
                    var di = p.get_Parameter(BuiltInParameter.RBS_PIPE_INNER_DIAM_PARAM)?.AsDouble() ?? 0;
                    if (d <= 0 && di > 0) d = Compat.Mm(di);
                    var f = p.get_Parameter(BuiltInParameter.RBS_PIPE_FLOW_PARAM)?.AsDouble() ?? 0;
                    if (q <= 0 && f > 0) q = M3h(f);
                }
            }
            catch { }
            return (d > 0 ? d : x.DnMm, q);
        }

        public static List<Troncon> Troncons(Document doc, List<Element> elements, out List<string> notes)
        {
            notes = new List<string>();
            var parCle = elements.ToDictionary(e => Compat.Cle(e.Id));
            var spool = new Spool { Nom = "calcul" };
            foreach (var e in elements) spool.Composants.Add(LectureModele.Lire(doc, e));
            AnalyseSpool.Analyser(spool);

            // Tubes : diamètre intérieur, rugosité du segment, débit calculé par Revit
            var dint = new Dictionary<string, double>(); var rug = new Dictionary<string, double>(); var debit = new Dictionary<string, double>();
            foreach (var e in elements.OfType<Pipe>())
            {
                var k = Compat.Cle(e.Id);
                var di = e.get_Parameter(BuiltInParameter.RBS_PIPE_INNER_DIAM_PARAM)?.AsDouble() ?? 0;
                if (di > 0) dint[k] = Compat.Mm(di);
                try { var sg = e.PipeSegment; if (sg != null && sg.Roughness > 0) rug[k] = Compat.Mm(sg.Roughness); } catch { }
                var q = e.get_Parameter(BuiltInParameter.RBS_PIPE_FLOW_PARAM)?.AsDouble() ?? 0;
                if (q > 0) debit[k] = M3h(q);
            }
            // Débits par l'arborescence quand Revit n'en donne pas : équipements consommateurs (« Débit hydraulique (m³/h) »
            // ou débit trouvé dans la famille), en aval de la production / pompe
            var arbreQ = DebitsHydrauliques(doc, elements, out var noteQ);
            int completes = 0;
            foreach (var kv in arbreQ) if (kv.Value > 0 && !debit.ContainsKey(kv.Key)) { debit[kv.Key] = kv.Value; completes++; }
            if (noteQ != null) notes.Add(noteQ);
            if (debit.Count == 0) notes.Add("Pas de débit calculé par Revit ni d'équipement avec un débit : débit saisi appliqué.");

            var res = new List<Troncon>();
            foreach (var c in AnalyseSpool.Parcourir(spool.Composants))
            {
                if (c.Type != TypeComposant.Tube && Robinetterie.UnPort(c.Genre)) continue; // purgeur, manomètre : hors écoulement
                var voisins = c.Extremites.Where(x => x.ConnecteA != null && parCle.ContainsKey(x.ConnecteA)).ToList();
                double D(string id) => dint.TryGetValue(id, out var v) ? v : 0;
                var t = new Troncon { Id = c.Id, Repere = c.Repere, Designation = c.Designation, Nature = c.Type.ToString() };
                if (c.Type == TypeComposant.Tube)
                {
                    t.LongueurM = c.LongueurMm / 1000;
                    t.DiametreMm = D(c.Id) > 0 ? D(c.Id) : c.DnMm;
                    t.RugositeMm = rug.TryGetValue(c.Id, out var r) ? r : 0.045;
                    t.DebitM3h = debit.TryGetValue(c.Id, out var q) ? q : 0;
                }
                else
                {
                    // Raccord, vanne : diamètre intérieur et débit des tubes voisins du chemin
                    var di = voisins.Select(x => D(x.ConnecteA)).Where(v => v > 0).DefaultIfEmpty(0).Min();
                    t.DiametreMm = di > 0 ? di : c.DnMm;
                    t.DebitM3h = voisins.Select(x => debit.TryGetValue(x.ConnecteA, out var q) ? q : 0).DefaultIfEmpty(0).Max();
                    bool derivation = false;
                    bool te = (c.Type == TypeComposant.Te || c.Type == TypeComposant.Croix) && c.Extremites.Count >= 3;
                    if (te || (c.Type == TypeComposant.Piquage && c.Extremites.Count == 2))
                    {
                        // Té : chaque voie avec le diamètre intérieur et le débit du tube raccordé (même hors sélection) ;
                        // voie commune = plus fort débit, sortie = l'autre voie du chemin. Le tronçon prend la section et le
                        // débit de la SORTIE (branche en dérivation), et ζ selon la répartition des débits.
                        var voies = c.Extremites.Select(x => (X: x, Info: Tube(doc, x, dint, debit))).ToList();
                        var commune = voies.Where(v => v.Info.Q > 0).OrderByDescending(v => v.Info.Q).Select(v => v.X).FirstOrDefault();
                        var chemin = voies.Where(v => voisins.Contains(v.X)).ToList();
                        Extremite sortie = null;
                        if (commune != null && chemin.Any(v => v.X == commune)) sortie = chemin.Where(v => v.X != commune).Select(v => v.X).FirstOrDefault();
                        else sortie = chemin.OrderBy(v => v.Info.Q).Select(v => v.X).FirstOrDefault();
                        if (te)
                        {
                            var (r1, r2) = ExportPcf.Passage(c.Extremites, Cotation.PointAxe(c));
                            if (commune != null && sortie != null) derivation = !((commune == r1 || commune == r2) && (sortie == r1 || sortie == r2));
                            else derivation = voisins.Count >= 2 && !(voisins.Contains(r1) && voisins.Contains(r2));
                        }
                        else derivation = true; // piquage : on entre ou on sort par la branche
                        if (sortie != null)
                        {
                            var so = voies.First(v => v.X == sortie).Info;
                            t.DiametreMm = so.D > 0 ? so.D : sortie.DnMm;
                            t.DebitM3h = so.Q;
                            var co = commune != null ? voies.First(v => v.X == commune).Info : default;
                            var z = commune != null && commune != sortie
                                ? PerteCharge.ZetaTe(co.Q, PerteCharge.AireRonde(co.D > 0 ? co.D : commune.DnMm), so.Q, PerteCharge.AireRonde(t.DiametreMm), derivation) : null;
                            t.Zeta = z ?? PerteCharge.ZetaHydraulique(c.Type, c.Genre, c.AngleDeg, derivation);
                        }
                        else t.Zeta = PerteCharge.ZetaHydraulique(c.Type, c.Genre, c.AngleDeg, derivation);
                    }
                    else t.Zeta = PerteCharge.ZetaHydraulique(c.Type, c.Genre, c.AngleDeg, derivation);
                    if (c.Type == TypeComposant.Te || c.Type == TypeComposant.Croix) t.Designation += derivation ? " (dérivation)" : " (passage)";
                    // Équipement ou accessoire avec sa perte fabricant (paramètre Pipe-Fit, sinon valeur de la famille) : remplace le ζ
                    if (parCle.TryGetValue(c.Id, out var el) && (Compat.EstCategorie(el, BuiltInCategory.OST_PipeAccessory)
                        || Compat.EstCategorie(el, BuiltInCategory.OST_MechanicalEquipment) || Compat.EstCategorie(el, BuiltInCategory.OST_PlumbingFixtures)))
                    {
                        if (Compat.EstCategorie(el, BuiltInCategory.OST_MechanicalEquipment)) { t.Nature = "Equipement"; t.Zeta = 0; t.Designation = "Équipement " + t.Designation; }
                        var pa = ParametresPerte.Pa(el, GenrePerte.Hydraulique);
                        if (pa > 0) { t.PerteFixePa = pa.Value; t.Zeta = 0; t.Designation += " (fabricant)"; }
                    }
                }
                res.Add(t);
            }
            return res;
        }
    }
}
