// Commande « Équilibrage hydraulique » : sur le réseau relié à la sélection (aller et retour), boucle de chaque
// équipement consommateur depuis la production (ou la pompe), débits cumulés, perte de chaque boucle, boucle critique,
// pression à dissiper et Kv requis de chaque vanne de réglage, point de fonctionnement de la pompe ; note de calcul.
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
    [Transaction(TransactionMode.ReadOnly)]
    public sealed class CmdEquilibrage : CommandeBase
    {
        protected override Result Executer(ExternalCommandData data, ref string message, ElementSet elementsErreur)
        {
            var uidoc = data.Application.ActiveUIDocument;
            if (uidoc == null) { message = "Ouvrez un projet Revit."; return Result.Failed; }
            var doc = uidoc.Document;
            var filtre = new FiltreTuyauterie();
            var depart = uidoc.Selection.GetElementIds().Select(doc.GetElement).Where(e => e != null && filtre.AllowElement(e)).ToList();
            if (depart.Count == 0)
            {
                try { depart = new List<Element> { doc.GetElement(uidoc.Selection.PickObject(ObjectType.Element, filtre, "Équilibrage : cliquez un élément du circuit (tube, vanne, équipement)")) }; }
                catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return Result.Cancelled; }
            }

            // Réseau complet relié (aller et retour, à travers les équipements)
            var reseau = new Dictionary<string, Element>(); var liens = new Dictionary<string, HashSet<string>>();
            HashSet<string> L(string k) { if (!liens.TryGetValue(k, out var h)) liens[k] = h = new HashSet<string>(); return h; }
            var file = new Queue<Element>(depart);
            while (file.Count > 0 && reseau.Count < 20000)
            {
                var e = file.Dequeue(); var k = Compat.Cle(e.Id);
                if (reseau.ContainsKey(k)) continue;
                reseau[k] = e;
                foreach (var cn in LectureModele.Connecteurs(e))
                    foreach (Connector r in cn.AllRefs)
                    {
                        var ow = r.Owner;
                        if (ow == null || ow.Id == e.Id || ow is MEPSystem || (r.ConnectorType & ConnectorType.Physical) == 0) continue;
                        var kv = Compat.Cle(ow.Id);
                        L(k).Add(kv); L(kv).Add(k);
                        if (!reseau.ContainsKey(kv)) file.Enqueue(ow);
                    }
            }
            var voisins = liens.ToDictionary(kv => kv.Key, kv => kv.Value.Where(reseau.ContainsKey).ToList());
            bool Pompe(Element e) => CmdPid.Pompe.IsMatch(AnalyseSpool.Normaliser(CmdPerteCharge.Famille(e)));
            var equipements = reseau.Values.Where(CmdPerteCharge.EstEquipement).ToList();
            var productions = equipements.Where(e => !Pompe(e) && CmdPid.Source.IsMatch(AnalyseSpool.Normaliser(CmdPerteCharge.Famille(e)))).OrderByDescending(CmdPerteCharge.DnMax).ToList();
            var source = productions.FirstOrDefault() ?? equipements.Where(Pompe).OrderByDescending(CmdPerteCharge.DnMax).FirstOrDefault();
            if (source == null)
            {
                TaskDialog.Show("Pipe-Fit – Équilibrage", "Aucune production (groupe froid, chaudière, PAC, sous-station…) ni pompe reliée à ce circuit : la source des boucles est introuvable.");
                return Result.Cancelled;
            }
            var consommateurs = new Dictionary<string, double>(); var sansDebit = new List<string>();
            foreach (var e in equipements.Where(e => e.Id != source.Id && !Pompe(e) && !productions.Contains(e)))
            {
                var q = ParametresPerte.Pa(e, GenrePerte.DebitHydraulique);
                if (q > 0) consommateurs[Compat.Cle(e.Id)] = q.Value; else sansDebit.Add(CmdPerteCharge.NomFamille(e).Trim());
            }
            if (consommateurs.Count == 0)
            {
                TaskDialog.Show("Pipe-Fit – Équilibrage", "Aucun équipement consommateur avec un débit sur ce circuit. Renseignez « " + PertesFabricant.NomDebitHydraulique
                    + " » (bouton Paramètres calculs) sur les ventilo-convecteurs, batteries, émetteurs…");
                return Result.Cancelled;
            }

            // Composants analysés (type, genre, angle), diamètres intérieurs, rugosités
            var spool = new Spool { Nom = "equilibrage" };
            var comp = new Dictionary<string, Composant>();
            foreach (var e in reseau.Values.Where(e => !CmdPerteCharge.EstEquipement(e))) { var c = LectureModele.Lire(doc, e); spool.Composants.Add(c); comp[c.Id] = c; }
            AnalyseSpool.Analyser(spool);
            var dint = new Dictionary<string, double>(); var rug = new Dictionary<string, double>(); var vide = new Dictionary<string, double>();
            foreach (var p in reseau.Values.OfType<Pipe>())
            {
                var k = Compat.Cle(p.Id);
                var di = p.get_Parameter(BuiltInParameter.RBS_PIPE_INNER_DIAM_PARAM)?.AsDouble() ?? 0;
                if (di > 0) dint[k] = Compat.Mm(di);
                try { if (p.PipeSegment != null && p.PipeSegment.Roughness > 0) rug[k] = Compat.Mm(p.PipeSegment.Roughness); } catch { }
            }
            bool Traversable(string id) => reseau.TryGetValue(id, out var e) && (!CmdPerteCharge.EstEquipement(e) || Pompe(e));
            Troncon Ligne(string id, string prec, string suiv, double q, Func<string, double> debitDe)
            {
                if (!comp.TryGetValue(id, out var c)) return null; // pompe : moteur du circuit, pas de perte
                double D(string k) => dint.TryGetValue(k, out var v) ? v : 0;
                var t = new Troncon { Id = id, Repere = c.Repere, Designation = c.Designation, Nature = c.Type.ToString(), DebitM3h = q };
                if (c.Type == TypeComposant.Tube)
                {
                    t.LongueurM = c.LongueurMm / 1000; t.DiametreMm = D(id) > 0 ? D(id) : c.DnMm; t.RugositeMm = rug.TryGetValue(id, out var r) ? r : 0.045;
                    return t;
                }
                var dv = new[] { prec, suiv }.Select(D).Where(v => v > 0).DefaultIfEmpty(0).Min();
                t.DiametreMm = dv > 0 ? dv : c.DnMm;
                if ((c.Type == TypeComposant.Te || c.Type == TypeComposant.Croix || c.Type == TypeComposant.Piquage) && c.Extremites.Count >= 2)
                {
                    var commune = c.Extremites.Where(x => x.ConnecteA != null).OrderByDescending(x => debitDe(x.ConnecteA)).FirstOrDefault();
                    var sortie = c.Extremites.FirstOrDefault(x => x != commune && (x.ConnecteA == prec || x.ConnecteA == suiv));
                    bool derivation = true;
                    if (c.Type != TypeComposant.Piquage && c.Extremites.Count >= 3 && commune != null && sortie != null)
                    {
                        var (r1, r2) = ExportPcf.Passage(c.Extremites, Cotation.PointAxe(c));
                        derivation = !((commune == r1 || commune == r2) && (sortie == r1 || sortie == r2));
                    }
                    if (sortie != null && commune != null)
                    {
                        double ds = D(sortie.ConnecteA) > 0 ? D(sortie.ConnecteA) : sortie.DnMm, dc = D(commune.ConnecteA) > 0 ? D(commune.ConnecteA) : commune.DnMm;
                        double qs = debitDe(sortie.ConnecteA) > 0 ? debitDe(sortie.ConnecteA) : q, qc = debitDe(commune.ConnecteA) > 0 ? debitDe(commune.ConnecteA) : q;
                        t.DiametreMm = ds; t.DebitM3h = qs;
                        t.Zeta = PerteCharge.ZetaTe(qc, PerteCharge.AireRonde(dc), qs, PerteCharge.AireRonde(ds), derivation) ?? PerteCharge.ZetaHydraulique(c.Type, c.Genre, c.AngleDeg, derivation);
                    }
                    else t.Zeta = PerteCharge.ZetaHydraulique(c.Type, c.Genre, c.AngleDeg, derivation);
                    t.Designation += derivation ? " (dérivation)" : " (passage)";
                    return t;
                }
                t.Zeta = PerteCharge.ZetaHydraulique(c.Type, c.Genre, c.AngleDeg);
                if (reseau.TryGetValue(id, out var el) && Compat.EstCategorie(el, BuiltInCategory.OST_PipeAccessory))
                {
                    var pa = ParametresPerte.Pa(el, GenrePerte.Hydraulique);
                    if (pa > 0) { t.PerteFixePa = pa.Value; t.Zeta = 0; t.Designation += " (fabricant)"; }
                }
                return t;
            }
            string Nom(string id) => reseau.TryGetValue(id, out var e) ? ((e.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.AsString() is string m && m != "" ? m + " " : "") + CmdPerteCharge.NomFamille(e)).Trim() : id;
            var perteSource = ParametresPerte.Pa(source, GenrePerte.Hydraulique) ?? 0;
            ResultatEquilibrage Calcul(Fluide f) => Equilibrage.Calculer(voisins, Compat.Cle(source.Id), consommateurs, Traversable, Ligne,
                id => reseau.TryGetValue(id, out var e) ? ParametresPerte.Pa(e, GenrePerte.Hydraulique) ?? 0 : 0,
                id => comp.TryGetValue(id, out var c) && c.Genre == GenreRobinet.Reglage, f, perteSource, 3000, Nom);

            var notes = new List<string> { "Source des boucles : " + Nom(Compat.Cle(source.Id)) + (perteSource > 0 ? " (perte côté eau " + Math.Round(perteSource / 1000, 1) + " kPa, ajoutée à la hauteur)" : " (perte de la production non renseignée)") + "." };
            if (sansDebit.Count > 0) notes.Add("Équipements sans débit, non équilibrés : " + string.Join(", ", sansDebit.Distinct().Take(12)) + (sansDebit.Count > 12 ? "…" : "") + ".");
            var projet = doc.ProjectInformation?.Name;
            using (var f = new FenetreEquilibrage(Calcul, string.IsNullOrWhiteSpace(projet) ? doc.Title : projet, notes))
                f.ShowDialog(new FenetreRevit(data.Application.MainWindowHandle));
            return Result.Succeeded;
        }
    }
}
