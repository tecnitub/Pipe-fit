// Calculs de perte de charge (tuyauteries hydrauliques et gaines de ventilation), sans Revit, testables :
//   - propriétés des fluides : eau (densité et viscosité selon la température), eau glycolée (MEG / MPG), air ;
//   - perte de charge linéaire : Darcy-Weisbach, coefficient de frottement de Colebrook-White (laminaire 64/Re) ;
//   - pertes singulières : ζ × ρv²/2, ζ par défaut selon le raccord ou l'organe (modifiables) ;
//   - débits d'un réseau de ventilation en arbre : somme des bouches en aval de chaque élément ;
//   - dimensionnement : diamètre normalisé ou gaine rectangulaire pour un débit et une vitesse visée.
using System;
using System.Collections.Generic;
using System.Linq;

namespace PipeFit.Isometries.Core
{
    // ---------- Fluides ----------

    public sealed class Fluide
    {
        public string Nom = "";
        /// <summary>Masse volumique (kg/m³).</summary>
        public double Rho;
        /// <summary>Viscosité cinématique (m²/s).</summary>
        public double Nu;

        /// <summary>Eau à la température T (°C), 0 à 100 °C : masse volumique (Tanaka) et viscosité (Vogel).</summary>
        public static Fluide Eau(double t)
        {
            var rho = RhoEau(t);
            return new Fluide { Nom = "Eau " + t.ToString("0") + " °C", Rho = rho, Nu = MuEau(t) / rho };
        }

        static double RhoEau(double t) => 1000 * (1 - (t + 288.9414) / (508929.2 * (t + 68.12963)) * Math.Pow(t - 3.9863, 2));
        static double MuEau(double t) => 2.414e-5 * Math.Pow(10, 247.8 / (t + 273.15 - 140));

        /// <summary>
        /// Eau glycolée : monoéthylène (MEG) ou monopropylène glycol (MPG), pourcentage massique 0 à 50 %.
        /// Approximation de bureau d'études (±5 % sur ρ, ±15 % sur la viscosité entre 0 et 60 °C).
        /// </summary>
        public static Fluide EauGlycolee(double t, double pourcent, bool propylene)
        {
            pourcent = Math.Max(0, Math.Min(50, pourcent));
            var rho = RhoEau(t) * (1 + (propylene ? 0.0009 : 0.00135) * pourcent);
            var mu = MuEau(t) * Math.Exp((propylene ? 0.035 : 0.026) * pourcent) * (t < 10 ? 1 + (10 - t) * 0.012 * pourcent / 30 : 1);
            return new Fluide { Nom = (propylene ? "MPG " : "MEG ") + pourcent.ToString("0") + " % " + t.ToString("0") + " °C", Rho = rho, Nu = mu / rho };
        }

        /// <summary>Air sec à la température T (°C), 1013 hPa (gaz parfait, viscosité de Sutherland).</summary>
        public static Fluide Air(double t)
        {
            var tk = t + 273.15;
            var rho = 101325 / (287.05 * tk);
            var mu = 1.458e-6 * Math.Pow(tk, 1.5) / (tk + 110.4);
            return new Fluide { Nom = "Air " + t.ToString("0") + " °C", Rho = rho, Nu = mu / rho };
        }
    }

    // ---------- Tronçons et résultats ----------

    public sealed class Troncon
    {
        public string Id = "", Repere = "", Designation = "", Nature = "";
        /// <summary>Longueur (m) : 0 pour un raccord ou un organe (perte singulière seule).</summary>
        public double LongueurM;
        /// <summary>Diamètre intérieur (mm) d'une section ronde ; 0 pour une gaine rectangulaire.</summary>
        public double DiametreMm;
        /// <summary>Gaine rectangulaire : largeur × hauteur (mm).</summary>
        public double LargeurMm, HauteurMm;
        /// <summary>Rugosité absolue (mm).</summary>
        public double RugositeMm = 0.045;
        /// <summary>Débit (m³/h).</summary>
        public double DebitM3h;
        /// <summary>Coefficient de perte singulière ζ.</summary>
        public double Zeta;
        /// <summary>Perte de charge fixe ajoutée (Pa) : bouche, batterie, organe donné par le fabricant.</summary>
        public double PerteFixePa;

        // Résultats
        public double SectionM2, DiametreHydrauliqueM, VitesseMs, Reynolds, Lambda, PerteLineairePaM, PerteLineairePa, PerteSinguliere, PerteTotalePa, PressionDynamiquePa;
        public string Alerte = "";

        public bool Rond => DiametreMm > 0;
        public string Section => Rond ? "Ø" + Math.Round(DiametreMm, 1).ToString("0.#") : Math.Round(LargeurMm) + "×" + Math.Round(HauteurMm);
    }

    public sealed class ResultatPerte
    {
        public List<Troncon> Troncons = new List<Troncon>();
        public double LineairePa, SingulierPa, TotalPa;
        public double LongueurM;
        public double TotalMce(Fluide f) => TotalPa / (f.Rho * 9.80665);
    }

    public static class PerteCharge
    {
        /// <summary>Coefficient de frottement : laminaire 64/Re, sinon Colebrook-White (itéré depuis Swamee-Jain).</summary>
        public static double Lambda(double re, double rugositeRelative)
        {
            if (re <= 0) return 0;
            if (re < 2300) return 64 / re;
            var e = Math.Max(0, rugositeRelative);
            double l = 0.25 / Math.Pow(Math.Log10(e / 3.7 + 5.74 / Math.Pow(re, 0.9)), 2);
            for (int i = 0; i < 30; i++)
            {
                var n = Math.Pow(-2 * Math.Log10(e / 3.7 + 2.51 / (re * Math.Sqrt(l))), -2);
                if (Math.Abs(n - l) < 1e-10) { l = n; break; }
                l = n;
            }
            return l;
        }

        public static void Calculer(Troncon t, Fluide f)
        {
            double a, dh;
            if (t.Rond) { var d = t.DiametreMm / 1000; a = Math.PI * d * d / 4; dh = d; }
            else
            {
                double w = t.LargeurMm / 1000, h = t.HauteurMm / 1000;
                a = w * h; dh = w + h > 0 ? 2 * w * h / (w + h) : 0;
            }
            t.SectionM2 = a; t.DiametreHydrauliqueM = dh;
            t.VitesseMs = a > 0 ? t.DebitM3h / 3600 / a : 0;
            t.Reynolds = f.Nu > 0 ? t.VitesseMs * dh / f.Nu : 0;
            t.Lambda = dh > 0 ? Lambda(t.Reynolds, t.RugositeMm / 1000 / dh) : 0;
            t.PressionDynamiquePa = f.Rho * t.VitesseMs * t.VitesseMs / 2;
            t.PerteLineairePaM = dh > 0 ? t.Lambda / dh * t.PressionDynamiquePa : 0;
            t.PerteLineairePa = t.PerteLineairePaM * t.LongueurM;
            t.PerteSinguliere = t.Zeta * t.PressionDynamiquePa + t.PerteFixePa;
            t.PerteTotalePa = t.PerteLineairePa + t.PerteSinguliere;
        }

        /// <summary>Hydraulique : vitesses conseillées 0,5 à 2 m/s, perte linéaire au plus 250 Pa/m (critères usuels CVC).</summary>
        public static ResultatPerte Hydraulique(IEnumerable<Troncon> troncons, Fluide f, double vMax = 2.0, double jMax = 250)
        {
            var r = Totaliser(troncons, f);
            foreach (var t in r.Troncons)
            {
                var a = new List<string>();
                if (t.DebitM3h <= 0) a.Add("débit nul");
                else if (t.VitesseMs > vMax) a.Add("vitesse > " + vMax.ToString("0.0#") + " m/s (bruit, érosion)");
                else if (t.LongueurM > 0 && t.VitesseMs < 0.3) a.Add("vitesse < 0,3 m/s (air, dépôts)");
                if (t.LongueurM > 0 && t.PerteLineairePaM > jMax) a.Add("perte linéaire > " + jMax.ToString("0") + " Pa/m");
                t.Alerte = string.Join(" ; ", a);
            }
            return r;
        }

        /// <summary>Aéraulique : vitesse maximale du réseau (6 m/s par défaut, 3 m/s conseillés près des bouches).</summary>
        public static ResultatPerte Aeraulique(IEnumerable<Troncon> troncons, Fluide f, double vMax = 6.0)
        {
            var r = Totaliser(troncons, f);
            foreach (var t in r.Troncons)
            {
                var a = new List<string>();
                if (t.DebitM3h <= 0) a.Add("débit nul");
                else if (t.VitesseMs > vMax) a.Add("vitesse > " + vMax.ToString("0.#") + " m/s (bruit)");
                if (t.LongueurM > 0 && t.PerteLineairePaM > 2) a.Add("perte linéaire > 2 Pa/m");
                if (t.Nature == "Bouche" && t.PerteFixePa == 0) a.Add("perte de la bouche à saisir (fabricant)");
                t.Alerte = string.Join(" ; ", a);
            }
            return r;
        }

        static ResultatPerte Totaliser(IEnumerable<Troncon> troncons, Fluide f)
        {
            var r = new ResultatPerte { Troncons = troncons.ToList() };
            foreach (var t in r.Troncons) Calculer(t, f);
            r.LineairePa = r.Troncons.Sum(t => t.PerteLineairePa);
            r.SingulierPa = r.Troncons.Sum(t => t.PerteSinguliere);
            r.TotalPa = r.LineairePa + r.SingulierPa;
            r.LongueurM = r.Troncons.Sum(t => t.LongueurM);
            return r;
        }

        // ---------- Coefficients ζ par défaut ----------

        /// <summary>
        /// ζ d'un raccord ou d'un organe hydraulique (valeurs usuelles, pleine ouverture) : coude 90° grand rayon 0,3
        /// (au prorata de l'angle), té passage 0,3 / dérivation 1,3, réduction 0,1, vanne à opercule 0,2, papillon 0,3,
        /// boisseau 0,1, vanne de réglage 6, clapet 2, filtre 2,5, vanne motorisée 4, compensateur 0,2.
        /// </summary>
        public static double ZetaHydraulique(TypeComposant type, GenreRobinet genre, double angleDeg = 90, bool derivation = false)
        {
            switch (type)
            {
                case TypeComposant.Tube: case TypeComposant.Bride: case TypeComposant.Manchon: case TypeComposant.Bouchon: return 0;
                case TypeComposant.Coude: return Math.Round(0.3 * Math.Max(0.25, (angleDeg > 0 ? angleDeg : 90) / 90), 3);
                case TypeComposant.Te: case TypeComposant.Croix: return derivation ? 1.3 : 0.3;
                case TypeComposant.Piquage: return derivation ? 1.0 : 0.1;
                case TypeComposant.Reduction: return 0.1;
            }
            switch (genre)
            {
                case GenreRobinet.Papillon: return 0.3;
                case GenreRobinet.Boisseau: return 0.1;
                case GenreRobinet.Reglage: return 6;
                case GenreRobinet.Clapet: return 2;
                case GenreRobinet.Filtre: return 2.5;
                case GenreRobinet.Motorisee: return 4;
                case GenreRobinet.Compensateur: return 0.2;
                case GenreRobinet.Purgeur: case GenreRobinet.Manometre: case GenreRobinet.Thermometre: return 0;
                case GenreRobinet.Vanne: return 0.2;
            }
            return 0.2;
        }

        public enum OrganeAir { Gaine, Coude, Te, Transition, Registre, CoupeFeu, Silencieux, Bouche, Autre }

        /// <summary>
        /// ζ d'un élément de réseau aéraulique : coude 90° rond 0,25 / rectangulaire 0,3 (au prorata de l'angle), té passage
        /// 0,2 / dérivation 0,6, transition 0,1, registre ouvert 0,5, clapet coupe-feu 0,6, silencieux 1,5 ; bouche 0 (sa perte
        /// fabricant se saisit en Pa).
        /// </summary>
        public static double ZetaAir(OrganeAir o, bool rond, double angleDeg = 90, bool derivation = false)
        {
            switch (o)
            {
                case OrganeAir.Coude: return Math.Round((rond ? 0.25 : 0.3) * Math.Max(0.25, (angleDeg > 0 ? angleDeg : 90) / 90), 3);
                case OrganeAir.Te: return derivation ? 0.6 : 0.2;
                case OrganeAir.Transition: return 0.1;
                case OrganeAir.Registre: return 0.5;
                case OrganeAir.CoupeFeu: return 0.6;
                case OrganeAir.Silencieux: return 1.5;
                case OrganeAir.Autre: return 0.2;
                default: return 0;
            }
        }

        /// <summary>Organe de ventilation reconnu par le nom de sa famille.</summary>
        public static OrganeAir OrganeParNom(string nom)
        {
            var n = AnalyseSpool.Normaliser(nom);
            if (System.Text.RegularExpressions.Regex.IsMatch(n, @"coupe ?feu|\bcf\b|fire|\bcvf|\bdas\b")) return OrganeAir.CoupeFeu;
            if (System.Text.RegularExpressions.Regex.IsMatch(n, @"silencieux|silencer|piege a son|attenuat")) return OrganeAir.Silencieux;
            if (System.Text.RegularExpressions.Regex.IsMatch(n, @"registre|damper|volet|iris|regulateur de debit|\bvav\b|\bcav\b")) return OrganeAir.Registre;
            if (System.Text.RegularExpressions.Regex.IsMatch(n, @"bouche|grille|diffuseur|terminal|grill|diffuser|anemostat|plenum")) return OrganeAir.Bouche;
            if (System.Text.RegularExpressions.Regex.IsMatch(n, @"coude|elbow|\bbend\b")) return OrganeAir.Coude;
            if (System.Text.RegularExpressions.Regex.IsMatch(n, @"\b(te|tee)\b|derivation|piquage|culotte|wye|tap|takeoff|take off|croix|cross")) return OrganeAir.Te;
            if (System.Text.RegularExpressions.Regex.IsMatch(n, @"transition|reduction|reduc|convergent|divergent")) return OrganeAir.Transition;
            return OrganeAir.Autre;
        }

        // ---------- Dimensionnement ----------

        public static readonly double[] DiametresGaine = { 80, 100, 125, 160, 200, 250, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000, 1120, 1250 };

        /// <summary>Plus petit diamètre normalisé (gaine circulaire) dont la vitesse reste sous la vitesse visée.</summary>
        public static double DiametreRond(double debitM3h, double vitesseMs)
        {
            foreach (var d in DiametresGaine)
                if (debitM3h / 3600 / (Math.PI * Math.Pow(d / 1000, 2) / 4) <= vitesseMs + 1e-9) return d;
            return DiametresGaine[DiametresGaine.Length - 1];
        }

        /// <summary>Gaine rectangulaire (pas de 50 mm) de hauteur imposée dont la vitesse reste sous la vitesse visée.</summary>
        public static (double Largeur, double Hauteur) Rectangulaire(double debitM3h, double vitesseMs, double hauteurMm)
        {
            if (hauteurMm <= 0 || vitesseMs <= 0) return (0, 0);
            var aire = debitM3h / 3600 / vitesseMs;
            var l = Math.Max(100, Math.Ceiling(aire / (hauteurMm / 1000) * 1000 / 50) * 50);
            return (l, hauteurMm);
        }

        // ---------- Débits d'un réseau en arbre ----------

        /// <summary>
        /// Chemins d'un réseau depuis la source jusqu'à chaque cible (bouche) : liste d'éléments, source exclue, cible
        /// comprise, dans le sens de l'air. Une cible non reliée à la source n'a pas de chemin.
        /// </summary>
        public static Dictionary<string, List<string>> Chemins(Dictionary<string, List<string>> voisins, string source, IEnumerable<string> cibles)
        {
            var res = new Dictionary<string, List<string>>();
            if (source == null || !voisins.ContainsKey(source)) return res;
            var parent = new Dictionary<string, string> { [source] = null };
            var file = new Queue<string>(); file.Enqueue(source);
            while (file.Count > 0)
            {
                var n = file.Dequeue();
                foreach (var v in voisins.TryGetValue(n, out var l) ? l : new List<string>())
                    if (!parent.ContainsKey(v)) { parent[v] = n; file.Enqueue(v); }
            }
            foreach (var c in cibles)
            {
                if (!parent.ContainsKey(c) || c == source) continue;
                var ch = new List<string>();
                for (var n = c; n != null && n != source; n = parent[n]) ch.Add(n);
                ch.Reverse();
                res[c] = ch;
            }
            return res;
        }

        /// <summary>
        /// Débit de chaque élément d'un réseau en arbre alimenté depuis « source » : somme des débits propres (bouches) des
        /// éléments en aval. Les éléments non reliés à la source gardent 0. Une boucle n'est parcourue qu'une fois.
        /// </summary>
        public static Dictionary<string, double> DebitsArbre(Dictionary<string, List<string>> voisins, Dictionary<string, double> debitsPropres, string source)
        {
            var res = new Dictionary<string, double>();
            if (source == null || !voisins.ContainsKey(source)) return res;
            var parent = new Dictionary<string, string> { [source] = null };
            var ordre = new List<string>();
            var pile = new Stack<string>(); pile.Push(source);
            while (pile.Count > 0)
            {
                var n = pile.Pop(); ordre.Add(n);
                foreach (var v in voisins.TryGetValue(n, out var l) ? l : new List<string>())
                    if (!parent.ContainsKey(v)) { parent[v] = n; pile.Push(v); }
            }
            foreach (var n in ordre) res[n] = debitsPropres.TryGetValue(n, out var q) ? q : 0;
            for (int i = ordre.Count - 1; i > 0; i--) { var n = ordre[i]; res[parent[n]] += res[n]; }
            return res;
        }
    }
}
