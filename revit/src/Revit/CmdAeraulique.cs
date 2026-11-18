// Commande « Débit et vitesse (ventilation) » : sur les gaines sélectionnées (gaines, raccords, accessoires, bouches),
// débit de chaque élément (calcul Revit, sinon somme des bouches en aval de la CTA ou du plus gros élément), section,
// vitesse et perte de charge (rugosité du type de gaine, ζ selon le raccord ou l'organe). Fenêtre de résultats avec
// dimensionnement et note de calcul Excel.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Mechanical;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using PipeFit.Isometries.Core;
using TaskDialog = Autodesk.Revit.UI.TaskDialog;

namespace PipeFit.Isometries.Revit
{
    sealed class FiltreGaines : ISelectionFilter
    {
        public bool AllowElement(Element e) => CmdAeraulique.EstGaine(e);
        public bool AllowReference(Reference r, XYZ p) => true;
    }

    [Transaction(TransactionMode.ReadOnly)]
    public sealed class CmdAeraulique : CommandeBase
    {
        static readonly BuiltInCategory[] Cats = { BuiltInCategory.OST_DuctCurves, BuiltInCategory.OST_FlexDuctCurves, BuiltInCategory.OST_DuctFitting,
            BuiltInCategory.OST_DuctAccessory, BuiltInCategory.OST_DuctTerminal };

        public static bool EstGaine(Element e) => e != null && Cats.Any(c => Compat.EstCategorie(e, c));

        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            var elements = uidoc.Selection.GetElementIds().Select(doc.GetElement).Where(EstGaine).ToList();
            if (elements.Count == 0)
            {
                try
                {
                    elements = uidoc.Selection.PickObjects(ObjectType.Element, new FiltreGaines(), "Ventilation : sélectionnez les gaines (réseau ou chemin à calculer), puis Terminer")
                        .Select(r => doc.GetElement(r)).ToList();
                }
                catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return Result.Cancelled; }
            }
            if (elements.Count == 0) return Result.Cancelled;

            var troncons = Troncons(doc, elements, out var notes);
            if (troncons.Count == 0) { TaskDialog.Show("Pipe-Fit", "Aucune gaine exploitable dans la sélection."); return Result.Cancelled; }
            var projet = doc.ProjectInformation?.Name;
            using (var f = new FenetreCalcul(true, "Débit, vitesse et perte de charge – ventilation", string.IsNullOrWhiteSpace(projet) ? doc.Title : projet, troncons, notes))
                f.ShowDialog(new FenetreRevit(data.Application.MainWindowHandle));
            return Result.Succeeded;
        }

        static IEnumerable<Connector> Connecteurs(Element e)
        {
            ConnectorManager cm = null;
            if (e is MEPCurve mc) cm = mc.ConnectorManager;
            else if (e is FamilyInstance fi) cm = fi.MEPModel?.ConnectorManager;
            if (cm == null) yield break;
            foreach (Connector cn in cm.Connectors)
                if ((cn.ConnectorType & ConnectorType.Physical) != 0 && (cn.Domain == Domain.DomainHvac || cn.Domain == Domain.DomainUndefined)) yield return cn;
        }

        static IEnumerable<Element> Voisins(Element e)
        {
            foreach (var cn in Connecteurs(e))
                foreach (Connector r in cn.AllRefs)
                    if (r.Owner != null && r.Owner.Id != e.Id && !(r.Owner is MEPSystem) && (r.ConnectorType & ConnectorType.Physical) != 0) yield return r.Owner;
        }

        static double M3h(double interne) => UnitUtils.ConvertFromInternalUnits(interne, UnitTypeId.CubicMetersPerHour);

        internal static double DebitElement(Element e) => Debit(e);

        /// <summary>Débit d'un élément du réseau : calcul Revit, sinon somme des bouches en aval.</summary>
        internal static Func<string, double> DebitDe(Document doc, Dictionary<string, Element> reseau, Dictionary<string, double> arbre) => id =>
        {
            if (reseau.TryGetValue(id, out var el) && !Compat.EstCategorie(el, BuiltInCategory.OST_DuctTerminal) && !Compat.EstCategorie(el, BuiltInCategory.OST_MechanicalEquipment))
            {
                var q = Debit(el);
                if (q > 0) return q;
            }
            return arbre.TryGetValue(id, out var qa) ? qa : 0;
        };

        static double Debit(Element e)
        {
            var q = e.get_Parameter(BuiltInParameter.RBS_DUCT_FLOW_PARAM)?.AsDouble() ?? 0;
            if (q <= 0 && Compat.EstCategorie(e, BuiltInCategory.OST_DuctTerminal))
                foreach (var cn in Connecteurs(e)) { try { q = Math.Max(q, Math.Abs(cn.Flow)); } catch { } }
            if (q > 0) return M3h(q);
            // Bouche ou équipement : paramètre « Débit aéraulique (m³/h) », sinon débit trouvé dans la famille
            if (Compat.EstCategorie(e, BuiltInCategory.OST_DuctTerminal) || Compat.EstCategorie(e, BuiltInCategory.OST_MechanicalEquipment))
                return ParametresPerte.Pa(e, GenrePerte.DebitAeraulique) ?? 0;
            return 0;
        }

        static (double d, double l, double h) SectionConnecteur(Connector cn)
        {
            try
            {
                if (cn.Shape == ConnectorProfileType.Round) return (Compat.Mm(cn.Radius * 2), 0, 0);
                return (0, Compat.Mm(cn.Width), Compat.Mm(cn.Height));
            }
            catch { return (0, 0, 0); }
        }

        /// <summary>Section d'un élément : gaine (Ø ou largeur × hauteur), sinon son plus grand raccordement.</summary>
        static (double d, double l, double h) Section(Element e)
        {
            if (e is MEPCurve)
            {
                var d = e.get_Parameter(BuiltInParameter.RBS_CURVE_DIAMETER_PARAM)?.AsDouble() ?? 0;
                if (d > 0) return (Compat.Mm(d), 0, 0);
                var w = e.get_Parameter(BuiltInParameter.RBS_CURVE_WIDTH_PARAM)?.AsDouble() ?? 0;
                var h = e.get_Parameter(BuiltInParameter.RBS_CURVE_HEIGHT_PARAM)?.AsDouble() ?? 0;
                if (w > 0 && h > 0) return (0, Compat.Mm(w), Compat.Mm(h));
            }
            (double, double, double) best = (0, 0, 0); double aire = -1;
            foreach (var cn in Connecteurs(e))
                try
                {
                    if (cn.Shape == ConnectorProfileType.Round) { var dd = Compat.Mm(cn.Radius * 2); var a = Math.PI * dd * dd / 4; if (a > aire) { aire = a; best = (dd, 0, 0); } }
                    else { var w = Compat.Mm(cn.Width); var h = Compat.Mm(cn.Height); if (w * h > aire) { aire = w * h; best = (0, w, h); } }
                }
                catch { }
            return best;
        }

        /// <summary>Réseau de gaines relié aux éléments donnés (bouches et CTA comprises) : éléments et voisinages.</summary>
        internal static (Dictionary<string, Element> Reseau, Dictionary<string, List<string>> Voisins) Reseau(List<Element> elements)
        {
            var reseau = new Dictionary<string, Element>(); var voisins = new Dictionary<string, List<string>>();
            var file = new Queue<Element>(elements);
            foreach (var e in elements) reseau[Compat.Cle(e.Id)] = e;
            while (file.Count > 0 && reseau.Count < 20000)
            {
                var e = file.Dequeue(); var k = Compat.Cle(e.Id);
                var l = voisins[k] = new List<string>();
                foreach (var v in Voisins(e))
                {
                    var kv = Compat.Cle(v.Id);
                    if (!l.Contains(kv)) l.Add(kv);
                    if (!reseau.ContainsKey(kv) && (EstGaine(v) || Compat.EstCategorie(v, BuiltInCategory.OST_MechanicalEquipment))) { reseau[kv] = v; file.Enqueue(v); }
                }
            }
            return (reseau, voisins);
        }

        static double Aire(Element e) { var (d, w, h) = Section(e); return d > 0 ? Math.PI * d * d / 4 : w * h; }

        /// <summary>Débits de chaque élément du réseau (somme des bouches en aval de la source) et source retenue.</summary>
        internal static (Dictionary<string, double> Arbre, string Source, Element Equipement, Dictionary<string, double> Bouches) Debits(
            Dictionary<string, Element> reseau, Dictionary<string, List<string>> voisins, List<Element> elements)
        {
            var bouches = reseau.Where(kv => Compat.EstCategorie(kv.Value, BuiltInCategory.OST_DuctTerminal)).ToDictionary(kv => kv.Key, kv => Debit(kv.Value));
            var equip = reseau.Values.FirstOrDefault(e => Compat.EstCategorie(e, BuiltInCategory.OST_MechanicalEquipment));
            var source = equip != null ? Compat.Cle(equip.Id)
                : reseau.Values.Where(e => !Compat.EstCategorie(e, BuiltInCategory.OST_DuctTerminal)).DefaultIfEmpty(elements[0])
                    .OrderByDescending(Aire).Select(e => Compat.Cle(e.Id)).First();
            var arbre = bouches.Values.Sum() > 0 ? PerteCharge.DebitsArbre(voisins, bouches, source) : new Dictionary<string, double>();
            return (arbre, source, equip, bouches);
        }

        /// <summary>
        /// Ligne de calcul d'un élément. Té : dérivation ou passage d'après les éléments voisins du chemin (amont / aval
        /// donnés), sinon d'après la sélection.
        /// </summary>
        internal static Troncon Ligne(Document doc, Element e, double debit, Func<Element, bool> dansChemin, ref int n, Func<string, double> debitDe = null)
        {
            var k = Compat.Cle(e.Id);
            var (d, w, h) = Section(e);
            var famille = (doc.GetElement(e.GetTypeId()) as ElementType)?.FamilyName ?? e.Name;
            var nom = famille + (e.Name != "" && e.Name != famille ? " " + e.Name : "");
            var t = new Troncon { Id = k, Designation = nom, DiametreMm = d, LargeurMm = w, HauteurMm = h, RugositeMm = 0.15, DebitM3h = debit };
            if (e is MEPCurve mc)
            {
                t.Nature = "Gaine"; t.Repere = "G" + (++n);
                t.LongueurM = Compat.Mm(e.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH)?.AsDouble() ?? 0) / 1000;
                try { var rr = (doc.GetElement(mc.GetTypeId()) as MEPCurveType)?.Roughness ?? 0; if (rr > 0) t.RugositeMm = Compat.Mm(rr); } catch { }
                return t;
            }
            var cns = Connecteurs(e).ToList();
            PerteCharge.OrganeAir o;
            var pt = (e as FamilyInstance)?.MEPModel is MechanicalFitting mf ? mf.PartType : PartType.Undefined;
            if (Compat.EstCategorie(e, BuiltInCategory.OST_DuctTerminal)) o = PerteCharge.OrganeAir.Bouche;
            else if (pt == PartType.Elbow) o = PerteCharge.OrganeAir.Coude;
            else if (pt == PartType.Tee || pt == PartType.Cross || pt == PartType.Wye || pt == PartType.TapPerpendicular || pt == PartType.TapAdjustable
                || pt == PartType.SpudPerpendicular || pt == PartType.SpudAdjustable) o = PerteCharge.OrganeAir.Te;
            else if (pt == PartType.Transition) o = PerteCharge.OrganeAir.Transition;
            else o = PerteCharge.OrganeParNom(nom);
            double angle = 90; bool derivation = false; double? zetaTe = null;
            try
            {
                if (o == PerteCharge.OrganeAir.Coude && cns.Count == 2)
                {
                    var dot = cns[0].CoordinateSystem.BasisZ.DotProduct(cns[1].CoordinateSystem.BasisZ);
                    angle = 180 - Math.Acos(Math.Max(-1, Math.Min(1, dot))) * 180 / Math.PI;
                }
                if (o == PerteCharge.OrganeAir.Te)
                {
                    // Voies du té : élément raccordé, son débit, la section du raccordement. Voie commune = plus fort débit ;
                    // sortie = l'autre voie du chemin. Le tronçon prend la section et le débit de la SORTIE.
                    var voies = cns.Select(cn => (C: cn, V: cn.AllRefs.Cast<Connector>().Select(r => r.Owner).FirstOrDefault(ow => ow != null && ow.Id != e.Id && !(ow is MEPSystem))))
                        .Select(x => (x.C, x.V, Q: x.V != null && debitDe != null ? debitDe(Compat.Cle(x.V.Id)) : 0)).ToList();
                    var parcourus = voies.Where(x => x.V != null && dansChemin(x.V)).ToList();
                    var commune = voies.Where(x => x.Q > 0).OrderByDescending(x => x.Q).Select(x => x.C).FirstOrDefault();
                    Connector sortie = commune != null && parcourus.Any(x => x.C.Id == commune.Id)
                        ? parcourus.Where(x => x.C.Id != commune.Id).Select(x => x.C).FirstOrDefault()
                        : parcourus.OrderBy(x => x.Q).Select(x => x.C).FirstOrDefault();
                    if (commune != null && sortie != null && commune.Id != sortie.Id)
                        derivation = commune.CoordinateSystem.BasisZ.DotProduct(sortie.CoordinateSystem.BasisZ) >= -0.9;
                    else
                        derivation = parcourus.Count >= 2 && !parcourus.Any(a => parcourus.Any(b => a.C.Id != b.C.Id && a.C.CoordinateSystem.BasisZ.DotProduct(b.C.CoordinateSystem.BasisZ) < -0.9));
                    nom += derivation ? " (dérivation)" : " (passage)";
                    if (sortie != null)
                    {
                        var (ds, ws, hs) = SectionConnecteur(sortie);
                        if (ds > 0 || ws * hs > 0) { t.DiametreMm = ds; t.LargeurMm = ws; t.HauteurMm = hs; d = ds; }
                        var qs = voies.First(x => x.C.Id == sortie.Id).Q;
                        if (qs > 0) t.DebitM3h = qs;
                        if (commune != null && commune.Id != sortie.Id)
                        {
                            var (dc, wc, hc) = SectionConnecteur(commune);
                            var ac = dc > 0 ? PerteCharge.AireRonde(dc) : wc * hc / 1e6;
                            var aS = ds > 0 ? PerteCharge.AireRonde(ds) : ws * hs / 1e6;
                            zetaTe = PerteCharge.ZetaTe(voies.First(x => x.C.Id == commune.Id).Q, ac, qs, aS, derivation);
                        }
                    }
                }
            }
            catch { }
            t.Designation = nom;
            t.Zeta = zetaTe ?? PerteCharge.ZetaAir(o, d > 0, angle, derivation);
            t.Nature = o.ToString(); t.Repere = o == PerteCharge.OrganeAir.Bouche ? "B" + (++n) : "R" + (++n);
            // Perte de charge fabricant (paramètre Pipe-Fit, sinon valeur trouvée dans la famille) : remplace le ζ par défaut
            bool equipement = Compat.EstCategorie(e, BuiltInCategory.OST_MechanicalEquipment);
            if (equipement) { t.Nature = "Equipement"; t.Repere = "E" + n; }
            if (o == PerteCharge.OrganeAir.Bouche || equipement || Compat.EstCategorie(e, BuiltInCategory.OST_DuctAccessory))
            {
                var pa = ParametresPerte.Pa(e, o == PerteCharge.OrganeAir.Bouche && !equipement ? GenrePerte.Bouche : GenrePerte.Aeraulique);
                if (pa > 0) { t.PerteFixePa = pa.Value; t.Zeta = 0; t.Designation += " (fabricant)"; }
            }
            return t;
        }

        public static List<Troncon> Troncons(Document doc, List<Element> elements, out List<string> notes)
        {
            notes = new List<string>();
            var (reseau, voisins) = Reseau(elements);
            var (arbre, source, equip, bouches) = Debits(reseau, voisins, elements);
            notes.Add(bouches.Count + " bouche(s) dans le réseau, " + bouches.Values.Sum().ToString("0") + " m³/h ; débits en aval de "
                + (equip != null ? "« " + (equip as FamilyInstance)?.Symbol?.FamilyName + " »" : "l'élément de plus grande section") + ".");
            var ids = new HashSet<ElementId>(elements.Select(x => x.Id));
            var res = new List<Troncon>();
            int n = 0;
            foreach (var e in elements)
            {
                var k = Compat.Cle(e.Id);
                var q = Debit(e);
                res.Add(Ligne(doc, e, q > 0 ? q : arbre.TryGetValue(k, out var qa) ? qa : 0, x => ids.Contains(x.Id), ref n, DebitDe(doc, reseau, arbre)));
            }
            return res;
        }
    }
}

namespace PipeFit.Isometries.Revit
{
    /// <summary>
    /// Commande « Perte de charge aéraulique » : sur le réseau relié à la sélection, chemin de la CTA (ou de l'élément de
    /// plus grande section) vers chaque bouche ; perte de charge de chaque chemin (gaines, coudes, tés en passage ou en
    /// dérivation selon le chemin, registres, coupe-feu, silencieux, bouche) ; le chemin le plus défavorisé donne la
    /// pression du réseau au ventilateur. Le chemin choisi peut être sélectionné dans Revit.
    /// </summary>
    [Transaction(TransactionMode.ReadOnly)]
    public sealed class CmdPerteAeraulique : CommandeBase
    {
        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            var elements = uidoc.Selection.GetElementIds().Select(doc.GetElement)
                .Where(e => CmdAeraulique.EstGaine(e) || (e != null && Compat.EstCategorie(e, BuiltInCategory.OST_MechanicalEquipment))).ToList();
            if (elements.Count == 0)
            {
                try
                {
                    var r = uidoc.Selection.PickObject(ObjectType.Element, new FiltreGaines(), "Perte de charge aéraulique : cliquez une gaine du réseau");
                    elements = new List<Element> { doc.GetElement(r) };
                }
                catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return Result.Cancelled; }
            }

            var (reseau, voisins) = CmdAeraulique.Reseau(elements);
            var (arbre, source, equip, bouches) = CmdAeraulique.Debits(reseau, voisins, elements);
            if (bouches.Count == 0)
            {
                TaskDialog.Show("Pipe-Fit", "Aucune bouche reliée à ce réseau : les chemins vont de la CTA aux bouches. "
                    + "Pour une gaine seule, utilisez « Débit et vitesse ventilation ».");
                return Result.Cancelled;
            }
            var chemins = PerteCharge.Chemins(voisins, source, bouches.Keys);
            // CTA source avec sa perte de charge côté air (paramètre ou famille) : comptée en tête de chaque chemin
            var paCta = equip != null ? ParametresPerte.Pa(equip, GenrePerte.Aeraulique) : null;
            var cta = paCta > 0 ? equip : null;
            var notes = new List<string>
            {
                bouches.Count + " bouche(s), " + bouches.Values.Sum().ToString("0") + " m³/h ; chemins depuis "
                    + (equip != null ? "« " + (equip as FamilyInstance)?.Symbol?.FamilyName + " »" : "l'élément de plus grande section (pas de CTA reliée)") + ".",
                cta != null ? "Pertes internes de la CTA comptées (" + paCta.Value.ToString("0") + " Pa) : le total est la pression au ventilateur."
                    : "Pertes internes de la CTA non renseignées (paramètre « " + ParametresPerte.Nom(GenrePerte.Aeraulique) + " ») : le total est la pression du réseau seul.",
            };
            if (chemins.Count < bouches.Count) notes.Add((bouches.Count - chemins.Count) + " bouche(s) non reliée(s) à la source.");

            // Un jeu de lignes par chemin (ζ des tés selon le chemin) ; ordre provisoire : le plus long d'abord
            var liste = new List<(string, List<Troncon>)>();
            var a20 = Fluide.Air(20);
            foreach (var kv in chemins)
            {
                var ids = new HashSet<string>(kv.Value); ids.Add(source);
                int n = 0;
                var lignes = new List<Troncon>();
                if (cta != null) { var tc = CmdAeraulique.Ligne(doc, cta, bouches.Values.Sum(), x => false, ref n); tc.Designation = "CTA " + tc.Designation + " – pertes internes"; lignes.Add(tc); }
                foreach (var id in kv.Value)
                {
                    if (!reseau.TryGetValue(id, out var e) || id == source) continue;
                    var q = CmdAeraulique.DebitElement(e);
                    lignes.Add(CmdAeraulique.Ligne(doc, e, q > 0 && !Compat.EstCategorie(e, BuiltInCategory.OST_DuctTerminal) ? q : arbre.TryGetValue(id, out var qa) ? qa : q,
                        x => ids.Contains(Compat.Cle(x.Id)), ref n, CmdAeraulique.DebitDe(doc, reseau, arbre)));
                }
                var b = reseau[kv.Key];
                var nomB = ((doc.GetElement(b.GetTypeId()) as ElementType)?.FamilyName ?? b.Name) + " " + Compat.Cle(b.Id)
                    + " (" + bouches[kv.Key].ToString("0") + " m³/h" + (b.LookupParameter("Marque")?.AsString() is string m && m != "" ? ", " + m : "") + ")";
                liste.Add((nomB, lignes));
            }
            liste = liste.OrderByDescending(c => PerteCharge.Aeraulique(c.Item2.Select(Copie).ToList(), a20).TotalPa).ToList();
            var projet = doc.ProjectInformation?.Name;
            using (var f = new FenetreCalcul(true, "Perte de charge aéraulique", string.IsNullOrWhiteSpace(projet) ? doc.Title : projet, liste, notes, true))
            {
                var res = f.ShowDialog(new FenetreRevit(data.Application.MainWindowHandle));
                if (res == System.Windows.Forms.DialogResult.Yes && f.CheminASelectionner != null)
                    uidoc.Selection.SetElementIds(f.CheminASelectionner.Select(Compat.IdDepuis).ToList());
            }
            return Result.Succeeded;
        }

        static Troncon Copie(Troncon t) => new Troncon
        {
            Id = t.Id, DiametreMm = t.DiametreMm, LargeurMm = t.LargeurMm, HauteurMm = t.HauteurMm, RugositeMm = t.RugositeMm,
            LongueurM = t.LongueurM, DebitM3h = t.DebitM3h, Zeta = t.Zeta, PerteFixePa = t.PerteFixePa,
        };
    }
}
