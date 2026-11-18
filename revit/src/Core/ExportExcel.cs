// Export des quantités vers Excel (.xlsx) : un classeur, cinq feuilles.
//   Synthèse        : par réseau, tube (m), raccords, brides, robinetterie, soudures atelier / chantier (nombre, pouces-diamètre),
//                     joints boulonnés ; totaux.
//   Quantitatif     : mêmes lignes et colonnes que le CSV du chiffrage (relu tel quel par Pipe-Fit, Chiffrage depuis plan),
//                     valeurs numériques, pouces-diamètre des soudures.
//   Soudures        : par spool, soudures atelier / chantier et pouces, joints boulonnés, longueur de tube.
//   Liste de débit  : tubes à couper (longueur Revit, piquage, surlongueur, coupe, barre de 6 m).
//   Nomenclatures   : la nomenclature de chaque spool (repère, désignation, DN, encombrement, matière, quantité, pouces).
using System;
using System.Collections.Generic;
using System.Linq;

namespace PipeFit.Isometries.Core
{
    public static class ExportExcel
    {
        static Cellule T(string s) => new Cellule(s ?? "");
        static Cellule H(string s) => new Cellule(s, StyleCellule.Entete);
        static Cellule N(double v) => new Cellule(v, StyleCellule.Entier);
        static Cellule Nz(double v) => v != 0 ? new Cellule(v, StyleCellule.Entier) : new Cellule(null);
        static Cellule D(double v) => new Cellule(v, StyleCellule.Decimal);
        static Cellule Dz(double v) => v != 0 ? new Cellule(v, StyleCellule.Decimal) : new Cellule(null);
        static Cellule Pz(double v) => v != 0 ? new Cellule(v, StyleCellule.Pouces) : new Cellule(null);
        static Cellule Somme(int col, int de, int a, double valeur, StyleCellule st) =>
            new Cellule(valeur, st, "SUM(" + Xlsx.Colonne(col) + de + ":" + Xlsx.Colonne(col) + a + ")");

        static string Reseau(Composant c, Spool s) => c.Systeme != "" ? c.Systeme : s.Systeme;

        public static byte[] Quantites(IList<Spool> spools, string projet, DateTime date, double barreMm = 6000)
        {
            var lignes = Quantitatif.Calculer(spools);
            var numerotes = spools.Where(s => !s.HorsSpool).ToList();
            var feuilles = new List<FeuilleXlsx> { Synthese(spools, lignes, projet, date), Quanti(lignes), Soudures(numerotes), Debit(numerotes, barreMm), Nomenclatures(numerotes) };
            return Xlsx.Ecrire(feuilles);
        }

        // ---------- Synthèse ----------

        static FeuilleXlsx Synthese(IList<Spool> spools, List<LigneQuantitatif> lignes, string projet, DateTime date)
        {
            var f = new FeuilleXlsx { Nom = "Synthèse", Largeurs = { 28, 12, 11, 9, 13, 12, 14, 12, 14, 14, 14, 12 } };
            f.Ajouter(new Cellule("Quantitatif tuyauterie" + (string.IsNullOrWhiteSpace(projet) ? "" : " – " + projet), StyleCellule.Titre));
            f.Ajouter(T("Export Pipe-Fit du " + date.ToString("dd/MM/yyyy HH:mm") + " – " + spools.Count(s => !s.HorsSpool) + " spool(s) numéroté(s)"
                + (spools.Any(s => s.HorsSpool) ? ", tuyauterie hors spool comptée à part" : "")));
            f.Vide();
            f.LigneEntete = f.Lignes.Count;
            f.Ajouter(H("Réseau"), H("Tube (m)"), H("Raccords"), H("Brides"), H("Robinetterie"), H("Soudures atelier"), H("Pouces atelier"),
                H("Soudures chantier"), H("Pouces chantier"), H("Soudures hors spool"), H("Pouces hors spool"), H("Joints boulonnés"));
            f.NbColonnesFiltre = 12;
            const int K = 11;
            var reseaux = new SortedDictionary<string, double[]>(StringComparer.CurrentCultureIgnoreCase);
            double[] R(string r) { if (!reseaux.TryGetValue(r, out var v)) reseaux[r] = v = new double[K]; return v; }
            foreach (var s in spools)
                foreach (var c in s.Composants.Where(x => !x.PiquageDirect))
                {
                    var v = R(Reseau(c, s));
                    switch (c.Type)
                    {
                        case TypeComposant.Tube: v[0] += (c.LongueurMm + c.PiquageMm + c.SurlongueurMm) / 1000; break;
                        case TypeComposant.Bride: v[2]++; break;
                        case TypeComposant.Vanne: case TypeComposant.Accessoire: v[3]++; break;
                        default: v[1]++; break;
                    }
                }
            foreach (var l in lignes.Where(x => x.Rang == 1))
            {
                var v = R(l.Reseau); var p = Diametres.Pouces(l.DnMm) * l.Nombre;
                if (l.Famille == "Soudure atelier") { v[4] += l.Nombre; v[5] += p; }
                else if (l.Famille == "Soudure chantier") { v[6] += l.Nombre; v[7] += p; }
                else if (l.Famille == "Soudure") { v[8] += l.Nombre; v[9] += p; }
                else v[10] += l.Nombre;
            }
            int de = f.Prochaine;
            foreach (var kv in reseaux)
            {
                var v = kv.Value;
                f.Ajouter(T(kv.Key == "" ? "(sans réseau)" : kv.Key), D(Math.Round(v[0], 2)), Nz(v[1]), Nz(v[2]), Nz(v[3]), Nz(v[4]), Pz(v[5]), Nz(v[6]), Pz(v[7]), Nz(v[8]), Pz(v[9]), Nz(v[10]));
            }
            int a = f.Prochaine - 1;
            f.DerniereLigneFiltre = a - 1;
            if (reseaux.Count > 0)
            {
                var t = reseaux.Values.Aggregate(new double[K], (s, v) => s.Zip(v, (x, y) => x + y).ToArray());
                var st = new[] { StyleCellule.TotalDecimal, StyleCellule.TotalEntier, StyleCellule.TotalEntier, StyleCellule.TotalEntier, StyleCellule.TotalEntier,
                    StyleCellule.TotalPouces, StyleCellule.TotalEntier, StyleCellule.TotalPouces, StyleCellule.TotalEntier, StyleCellule.TotalPouces, StyleCellule.TotalEntier };
                var tot = new List<Cellule> { new Cellule("Total", StyleCellule.Gras) };
                for (int j = 0; j < K; j++) tot.Add(Somme(j + 1, de, a, Math.Round(t[j], 2), st[j]));
                f.Lignes.Add(tot);
            }
            f.Vide();
            f.Ajouter(T("Soudures chantier : raccordements entre spools ou vers les équipements (comptés une fois)."));
            f.Ajouter(T("Soudures hors spool : tuyauterie pas encore numérotée en spools, à répartir atelier / chantier."));
            f.Ajouter(T("Pouces-diamètre : DN en pouces × nombre de soudures (DN50 = 2\"). Tube : longueur de coupe (piquages et surlongueurs compris)."));
            return f;
        }

        // ---------- Quantitatif (format du chiffrage) ----------

        static FeuilleXlsx Quanti(List<LigneQuantitatif> lignes)
        {
            var f = new FeuilleXlsx { Nom = "Quantitatif", Largeurs = { 22, 30, 22, 14, 14, 10, 18, 46, 14, 30 }, LigneEntete = 0, NbColonnesFiltre = 10 };
            f.Ajouter(H("Réseau"), H("Famille"), H("Type"), H("Taille"), H("Longueur (mm)"), H("Nombre"), H("Matériau"), H("Désignation"), H("Pouces-diamètre"), H("Repères spools"));
            foreach (var l in lignes)
                f.Ajouter(T(l.Reseau), T(l.Famille), T(l.Type), T(l.Taille), l.EstTube ? N(Math.Round(l.LongueurMm)) : new Cellule(null), l.EstTube ? new Cellule(null) : N(l.Nombre),
                    T(l.Materiau), T(l.Designation), l.Rang == 1 && l.Famille.StartsWith("Soudure") ? Pz(Diametres.Pouces(l.DnMm) * l.Nombre) : new Cellule(null), T(string.Join(", ", l.Spools)));
            return f;
        }

        // ---------- Soudures par spool ----------

        static FeuilleXlsx Soudures(List<Spool> spools)
        {
            var f = new FeuilleXlsx { Nom = "Soudures", Largeurs = { 14, 22, 14, 12, 12, 14, 14, 14, 12 }, LigneEntete = 0, NbColonnesFiltre = 9 };
            f.Ajouter(H("Spool"), H("Réseau"), H("Ensemble"), H("Soudures atelier"), H("Pouces atelier"), H("Soudures chantier"), H("Pouces chantier"), H("Joints boulonnés"), H("Tube (m)"));
            int de = f.Prochaine;
            double[] t = new double[6];
            foreach (var s in spools)
            {
                int sa = s.Nombre(NatureAssemblage.Soudure), sc = s.Assemblages.Count(x => x.Nature == NatureAssemblage.RaccordementChantier && x.Soude);
                double pa = s.PoucesDiametre(NatureAssemblage.Soudure), pc = s.PoucesDiametre(NatureAssemblage.RaccordementChantier);
                int jb = s.Nombre(NatureAssemblage.Boulonne) + s.Assemblages.Count(x => x.Nature == NatureAssemblage.RaccordementChantier && !x.Soude);
                double tube = s.Composants.Where(c => c.Type == TypeComposant.Tube).Sum(c => c.LongueurMm + c.PiquageMm + c.SurlongueurMm) / 1000;
                f.Ajouter(T(s.Nom), T(s.Systeme), T(s.Ensemble), Nz(sa), Pz(pa), Nz(sc), Pz(pc), Nz(jb), D(Math.Round(tube, 2)));
                t[0] += sa; t[1] += pa; t[2] += sc; t[3] += pc; t[4] += jb; t[5] += tube;
            }
            int a = f.Prochaine - 1;
            f.DerniereLigneFiltre = a - 1;
            if (spools.Count > 0)
                f.Ajouter(new Cellule("Total", StyleCellule.Gras), T(""), T(""), Somme(3, de, a, t[0], StyleCellule.TotalEntier), Somme(4, de, a, t[1], StyleCellule.TotalPouces),
                    Somme(5, de, a, t[2], StyleCellule.TotalEntier), Somme(6, de, a, t[3], StyleCellule.TotalPouces), Somme(7, de, a, t[4], StyleCellule.TotalEntier),
                    Somme(8, de, a, Math.Round(t[5], 2), StyleCellule.TotalDecimal));
            f.Vide();
            f.Ajouter(T("Soudures chantier : comptées sur chacun des deux spools raccordés (le total de la Synthèse les compte une fois)."));
            return f;
        }

        // ---------- Liste de débit ----------

        static FeuilleXlsx Debit(List<Spool> spools, double barreMm)
        {
            var f = new FeuilleXlsx { Nom = "Liste de débit", Largeurs = { 24, 9, 18, 12, 7, 15, 12, 13, 12, 10 }, LigneEntete = 0, NbColonnesFiltre = 10 };
            f.Ajouter(H("Système de canalisation"), H("DN"), H("Matière"), H("Spool"), H("Rep."), H("Longueur Revit (mm)"), H("Piquage (mm)"), H("Surlongueur (mm)"),
                H("Coupe (mm)"), H("Barre de " + (barreMm / 1000).ToString("0.#") + " m"));
            int de = f.Prochaine; double tot = 0;
            foreach (var l in ListeDebit.Calculer(spools, barreMm))
            {
                f.Ajouter(T(l.Systeme), T(Diametres.Dn(l.DnMm)), T(l.Materiau), T(l.Spool), T(l.Repere), N(l.LongueurRevitMm), Nz(l.PiquageMm), Nz(l.SurlongueurMm), N(l.CoupeMm),
                    l.Barre > 0 ? N(l.Barre) : T("hors barre"));
                tot += l.CoupeMm;
            }
            int a = f.Prochaine - 1;
            f.DerniereLigneFiltre = a - 1;
            if (a >= de) f.Ajouter(new Cellule("Total", StyleCellule.Gras), T(""), T(""), T(""), T(""), T(""), T(""), T(""), Somme(8, de, a, tot, StyleCellule.TotalEntier));
            return f;
        }

        // ---------- Nomenclatures des spools ----------

        static FeuilleXlsx Nomenclatures(List<Spool> spools)
        {
            var f = new FeuilleXlsx { Nom = "Nomenclatures", Largeurs = { 12, 6, 48, 14, 15, 18, 8, 13, 10 }, LigneEntete = 0, NbColonnesFiltre = 9 };
            f.Ajouter(H("Spool"), H("Rep."), H("Désignation"), H("DN"), H("Encombrement (mm)"), H("Matière"), H("Qté"), H("Longueur (m)"), H("Pouces"));
            foreach (var s in spools)
                foreach (var l in s.Nomenclature)
                    f.Ajouter(T(s.Nom), N(l.Repere), T(l.Designation), T(Diametres.Dn(l.DnMm)), Nz(l.FaceAFaceMm), T(l.Materiau),
                        l.EstTube ? new Cellule(null) : N(l.Quantite), l.EstTube ? D(Math.Round(l.LongueurMm / 1000, 2)) : new Cellule(null), Pz(l.PoucesSoudures));
            return f;
        }
    }
}

namespace PipeFit.Isometries.Core
{
    public static class ExportCalcul
    {
        /// <summary>Note de calcul de perte de charge (hydraulique ou aéraulique) : hypothèses, tableau par élément, totaux.</summary>
        public static byte[] PerteCharge(ResultatPerte r, Fluide f, string titre, string projet, IEnumerable<string> hypotheses, bool air, DateTime date, string conclusion = null)
        {
            var fe = new FeuilleXlsx { Nom = air ? "Aéraulique" : "Hydraulique", Largeurs = { 8, 40, 14, 12, 10, 10, 9, 10, 10, 8, 11, 12, 12, 12, 40 } };
            fe.Ajouter(new Cellule(titre + (string.IsNullOrWhiteSpace(projet) ? "" : " – " + projet), StyleCellule.Titre));
            fe.Ajouter(new Cellule("Pipe-Fit, " + date.ToString("dd/MM/yyyy HH:mm") + " – " + f.Nom + " : ρ = " + f.Rho.ToString("0.0#") + " kg/m³, ν = " + (f.Nu * 1e6).ToString("0.000") + " mm²/s"));
            foreach (var h in hypotheses ?? Enumerable.Empty<string>()) fe.Ajouter(new Cellule(h));
            fe.Vide();
            fe.LigneEntete = fe.Lignes.Count; fe.NbColonnesFiltre = 15;
            fe.Ajouter(new Cellule("Rep.", StyleCellule.Entete), new Cellule("Élément", StyleCellule.Entete), new Cellule("Section (mm)", StyleCellule.Entete),
                new Cellule("Débit (m³/h)", StyleCellule.Entete), new Cellule("Long. (m)", StyleCellule.Entete), new Cellule("Vitesse (m/s)", StyleCellule.Entete),
                new Cellule("Reynolds", StyleCellule.Entete), new Cellule("λ", StyleCellule.Entete), new Cellule("J (Pa/m)", StyleCellule.Entete), new Cellule("ζ", StyleCellule.Entete),
                new Cellule("Pd (Pa)", StyleCellule.Entete), new Cellule("ΔP linéaire (Pa)", StyleCellule.Entete), new Cellule("ΔP singulière (Pa)", StyleCellule.Entete),
                new Cellule("ΔP total (Pa)", StyleCellule.Entete), new Cellule("Remarque", StyleCellule.Entete));
            int de = fe.Prochaine;
            foreach (var t in r.Troncons)
                fe.Ajouter(new Cellule(t.Repere), new Cellule(t.Designation), new Cellule(t.Section), new Cellule(Math.Round(t.DebitM3h, 2), StyleCellule.Decimal),
                    t.LongueurM > 0 ? new Cellule(Math.Round(t.LongueurM, 2), StyleCellule.Decimal) : new Cellule(null), new Cellule(Math.Round(t.VitesseMs, 2), StyleCellule.Decimal),
                    new Cellule(Math.Round(t.Reynolds), StyleCellule.Entier), new Cellule(Math.Round(t.Lambda, 4)), t.LongueurM > 0 ? new Cellule(Math.Round(t.PerteLineairePaM, 2), StyleCellule.Decimal) : new Cellule(null),
                    t.Zeta != 0 ? new Cellule(t.Zeta) : new Cellule(null), new Cellule(Math.Round(t.PressionDynamiquePa, 1), StyleCellule.Decimal),
                    new Cellule(Math.Round(t.PerteLineairePa, 1), StyleCellule.Decimal), new Cellule(Math.Round(t.PerteSinguliere, 1), StyleCellule.Decimal),
                    new Cellule(Math.Round(t.PerteTotalePa, 1), StyleCellule.Decimal), new Cellule(t.Alerte));
            int a = fe.Prochaine - 1;
            fe.DerniereLigneFiltre = a - 1;
            Cellule S(int col, double v) => new Cellule(Math.Round(v, 1), StyleCellule.TotalDecimal, a >= de ? "SUM(" + Xlsx.Colonne(col) + de + ":" + Xlsx.Colonne(col) + a + ")" : null);
            fe.Ajouter(new Cellule("Total", StyleCellule.Gras), new Cellule(""), new Cellule(""), new Cellule(""), S(4, r.LongueurM), new Cellule(""), new Cellule(""), new Cellule(""),
                new Cellule(""), new Cellule(""), new Cellule(""), S(11, r.LineairePa), S(12, r.SingulierPa), S(13, r.TotalPa));
            fe.Vide();
            fe.Ajouter(new Cellule(""), new Cellule("Perte de charge totale : " + Math.Round(r.TotalPa / 1000, 2).ToString("0.00") + " kPa"
                + (air ? "" : " = " + Math.Round(r.TotalMce(f), 2).ToString("0.00") + " mCE") + " (" + Math.Round(r.TotalPa) + " Pa)", StyleCellule.Gras));
            fe.Ajouter(new Cellule(""), new Cellule("Méthode : Darcy-Weisbach, λ de Colebrook-White (64/Re en laminaire) ; singularités ζ·ρv²/2 (+ pertes fixes saisies)."));
            var rem = r.Troncons.Where(t => t.Alerte != "").ToList();
            if (rem.Count > 0) { fe.Vide(); fe.Ajouter(new Cellule(""), new Cellule("Remarques", StyleCellule.Gras)); foreach (var t in rem) fe.Ajouter(new Cellule(t.Repere), new Cellule(t.Designation + " : " + t.Alerte)); }
            if (!string.IsNullOrWhiteSpace(conclusion)) { fe.Vide(); fe.Ajouter(new Cellule(""), new Cellule("Conclusion", StyleCellule.Gras)); fe.Ajouter(new Cellule(""), new Cellule(conclusion)); }
            return Xlsx.Ecrire(new[] { fe });
        }
    }
}
