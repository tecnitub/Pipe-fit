// Analyse d'un spool : type des composants, ordre de parcours de la ligne, nomenclature repérée,
// liste de débit des tubes et liste des assemblages (soudures atelier, joints boulonnés, raccordements chantier).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace PipeFit.Isometries.Core
{
    public static class AnalyseSpool
    {
        static readonly TypeComposant[] OrdreNomenclature =
        {
            TypeComposant.Tube, TypeComposant.Coude, TypeComposant.Te, TypeComposant.Croix, TypeComposant.Reduction,
            TypeComposant.Piquage, TypeComposant.Manchon, TypeComposant.Bouchon, TypeComposant.Bride, TypeComposant.Vanne,
            TypeComposant.Accessoire, TypeComposant.Autre,
        };

        public static string Libelle(TypeComposant t)
        {
            switch (t)
            {
                case TypeComposant.Tube: return "Tube";
                case TypeComposant.Coude: return "Coude";
                case TypeComposant.Te: return "Té";
                case TypeComposant.Croix: return "Croix";
                case TypeComposant.Reduction: return "Réduction";
                case TypeComposant.Piquage: return "Piquage";
                case TypeComposant.Manchon: return "Manchon";
                case TypeComposant.Bouchon: return "Bouchon";
                case TypeComposant.Bride: return "Bride";
                case TypeComposant.Vanne: return "Vanne";
                case TypeComposant.Accessoire: return "Accessoire";
                default: return "Divers";
            }
        }

        public static void Analyser(Spool s)
        {
            foreach (var c in s.Composants)
            {
                if (c.Type == TypeComposant.Autre) c.Type = Classer(c);
                if (c.DnMm <= 0 && c.Extremites.Count > 0) c.DnMm = c.Extremites.Max(e => e.DnMm);
                c.AngleDeg = c.Type == TypeComposant.Coude ? AngleCoude(c) : 0;
                c.Designation = Designer(c);
            }
            HeriterMateriau(s);

            var ordre = Parcourir(s.Composants);
            NumeroterNomenclature(s, ordre);
            ListerAssemblages(s, ordre);
            Debiter(s, ordre);
            // Matière à prévoir : la nomenclature des tubes comprend les surlongueurs à recouper sur place
            foreach (var l in s.Nomenclature.Where(x => x.EstTube)) l.LongueurMm = l.Composants.Sum(c => c.LongueurMm + c.SurlongueurMm);
            AttribuerSoudures(s);

            s.Systeme = PlusFrequent(s.Composants.Select(c => c.Systeme));
            s.Materiau = PlusFrequent(s.Composants.Where(c => c.Type == TypeComposant.Tube).Select(c => c.Materiau));
            if (s.Materiau == "") s.Materiau = PlusFrequent(s.Composants.Select(c => c.Materiau));
            s.DnMax = s.Composants.Count == 0 ? 0 : s.Composants.Max(c => c.DnMm);
            s.LongueurDeveloppeeMm = s.Composants.Where(c => c.Type == TypeComposant.Tube).Sum(c => c.LongueurMm);
            s.Cotes = Cotation.Calculer(s);
            s.Liaisons = Liaisons.Calculer(s, ordre);
        }

        // ---------- Type de composant ----------

        /// <summary>Type déduit du nom de la famille, puis de la géométrie des extrémités.</summary>
        public static TypeComposant Classer(Composant c)
        {
            var nom = Normaliser(c.Famille + " " + c.TypeNom);
            if (c.EstAccessoire)
                return Regex.IsMatch(nom, @"vanne|robinet|valve|clapet|papillon|opercule|guillotine|soupape|boisseau")
                    ? TypeComposant.Vanne : TypeComposant.Accessoire;
            if (Regex.IsMatch(nom, @"\b(tube|tuyau|pipe|canalisation)\b") && c.Extremites.Count == 2 && c.Centre == null) return TypeComposant.Tube;
            if (Regex.IsMatch(nom, @"coude|elbow|\bbend\b|cintre")) return TypeComposant.Coude;
            if (Regex.IsMatch(nom, @"reduc|reducer|transition|cone")) return TypeComposant.Reduction;
            if (Regex.IsMatch(nom, @"bride|flange|collerette")) return TypeComposant.Bride;
            if (Regex.IsMatch(nom, @"bouchon|\bcap\b|fond bombe|calotte|obturateur")) return TypeComposant.Bouchon;
            if (Regex.IsMatch(nom, @"piquage|olet\b|weldolet|sockolet|\btap\b|spud|selle")) return TypeComposant.Piquage;
            if (Regex.IsMatch(nom, @"croix|\bcross\b")) return TypeComposant.Croix;
            if (Regex.IsMatch(nom, @"\b(te|tee|tes|wye|culotte)\b")) return TypeComposant.Te;
            if (Regex.IsMatch(nom, @"manchon|coupling|union|raccord union|mamelon|nipple")) return TypeComposant.Manchon;
            if (Regex.IsMatch(nom, @"vanne|robinet|valve|clapet")) return TypeComposant.Vanne;

            switch (c.Extremites.Count)
            {
                case 1: return TypeComposant.Bouchon;
                case 3: return TypeComposant.Te;
                case 4: return TypeComposant.Croix;
                case 2:
                    var e1 = c.Extremites[0]; var e2 = c.Extremites[1];
                    if (Math.Abs(e1.DnMm - e2.DnMm) > 0.5) return TypeComposant.Reduction;
                    if (c.Centre.HasValue)
                    {
                        var a = Angle(e1.Position - c.Centre.Value, e2.Position - c.Centre.Value);
                        if (a < 170 && a > 10) return TypeComposant.Coude;
                    }
                    return TypeComposant.Manchon;
                default: return TypeComposant.Autre;
            }
        }

        /// <summary>Angle de déviation d'un coude (90° pour un coude à angle droit).</summary>
        public static double AngleCoude(Composant c)
        {
            if (c.Extremites.Count != 2) return 0;
            var centre = c.Centre ?? Milieu(c.Extremites[0].Position, c.Extremites[1].Position);
            var a = Angle(c.Extremites[0].Position - centre, c.Extremites[1].Position - centre);
            return a < 1 ? 0 : 180 - a;
        }

        static double Angle(Point3 u, Point3 v)
        {
            if (u.Longueur < 1e-6 || v.Longueur < 1e-6) return 0;
            var cos = Math.Max(-1, Math.Min(1, u.Normalise().Dot(v.Normalise())));
            return Math.Acos(cos) * 180 / Math.PI;
        }

        static Point3 Milieu(Point3 a, Point3 b) => (a + b) * 0.5;

        static readonly Dictionary<TypeComposant, string> MotsCles = new Dictionary<TypeComposant, string>
        {
            { TypeComposant.Coude, @"coude|elbow|bend|cintre" }, { TypeComposant.Te, @"\b(te|tee|tes|wye|culotte)\b" },
            { TypeComposant.Croix, @"croix|cross" }, { TypeComposant.Reduction, @"reduc|transition|cone" },
            { TypeComposant.Piquage, @"piquage|olet|tap|spud|selle" }, { TypeComposant.Manchon, @"manchon|coupling|union|mamelon|nipple" },
            { TypeComposant.Bouchon, @"bouchon|\bcap\b|fond|calotte|obturateur" }, { TypeComposant.Bride, @"bride|flange|collerette" },
            { TypeComposant.Vanne, @"vanne|robinet|valve|clapet|papillon|soupape" },
        };

        static string Designer(Composant c)
        {
            var type = SansDefaut(c.TypeNom);
            var fam = c.Famille.Trim();
            string d;
            if (c.Type == TypeComposant.Tube)
                d = "Tube" + (type != "" ? " " + type : fam != "" && !Normaliser(fam).StartsWith("tub") ? " " + fam : "");
            else
            {
                d = fam == "" ? Libelle(c.Type) : fam;
                if (type != "" && !Normaliser(d).Contains(Normaliser(type))) d += " " + type;
                // Préfixe « Coude », « Té »… quand le nom de la famille ne le dit pas
                if (MotsCles.TryGetValue(c.Type, out var mots) && !Regex.IsMatch(Normaliser(d), mots)) d = Libelle(c.Type) + " " + d;
            }
            if (c.Type == TypeComposant.Coude && c.AngleDeg > 0 && !d.Contains("°"))
                d += " " + Math.Round(c.AngleDeg).ToString(CultureInfo.InvariantCulture) + "°";
            return d.Trim();
        }

        static string SansDefaut(string t)
        {
            t = (t ?? "").Trim();
            var n = Normaliser(t);
            return n == "standard" || n == "default" || n == "par defaut" ? "" : t;
        }

        /// <summary>Les raccords sans matériau prennent celui du tube auquel ils sont raccordés.</summary>
        static void HeriterMateriau(Spool s)
        {
            var parId = s.Composants.ToDictionary(c => c.Id);
            for (int passe = 0; passe < 3; passe++)
                foreach (var c in s.Composants.Where(x => string.IsNullOrWhiteSpace(x.Materiau)))
                    foreach (var e in c.Extremites)
                        if (e.ConnecteA != null && parId.TryGetValue(e.ConnecteA, out var v) && !string.IsNullOrWhiteSpace(v.Materiau))
                        { c.Materiau = v.Materiau; break; }
        }

        // ---------- Parcours de la ligne ----------

        /// <summary>Ordre de parcours : en partant d'une extrémité du spool, de proche en proche (puis les branches).</summary>
        public static List<Composant> Parcourir(List<Composant> composants)
        {
            var parId = composants.ToDictionary(c => c.Id);
            int Internes(Composant c) => c.Extremites.Count(e => e.ConnecteA != null && parId.ContainsKey(e.ConnecteA));
            var restants = new HashSet<string>(parId.Keys);
            var ordre = new List<Composant>();
            while (restants.Count > 0)
            {
                // Départ : le composant le moins raccordé dans le spool (une extrémité), le plus bas puis le plus à l'ouest
                var depart = composants.Where(c => restants.Contains(c.Id))
                    .OrderBy(Internes)
                    .ThenBy(c => PointBas(c).Z).ThenBy(c => PointBas(c).X).ThenBy(c => PointBas(c).Y)
                    .ThenBy(c => c.Id, StringComparer.Ordinal).First();
                var pile = new Stack<Composant>();
                pile.Push(depart);
                while (pile.Count > 0)
                {
                    var c = pile.Pop();
                    if (!restants.Remove(c.Id)) continue;
                    ordre.Add(c);
                    // Les voisins sont empilés dans l'ordre inverse : la ligne principale (plus gros DN) d'abord
                    var voisins = c.Extremites.Where(e => e.ConnecteA != null && restants.Contains(e.ConnecteA))
                        .OrderBy(e => e.DnMm).ThenBy(e => e.ConnecteA, StringComparer.Ordinal).ToList();
                    foreach (var e in voisins) pile.Push(parId[e.ConnecteA]);
                }
            }
            return ordre;
        }

        static Point3 PointBas(Composant c)
        {
            if (c.Extremites.Count == 0) return c.Centre ?? new Point3();
            return c.Extremites.OrderBy(e => e.Position.Z).ThenBy(e => e.Position.X).First().Position;
        }

        // ---------- Nomenclature, débit, assemblages ----------

        static void NumeroterNomenclature(Spool s, List<Composant> ordre)
        {
            var rang = new Dictionary<string, int>();
            for (int i = 0; i < ordre.Count; i++) rang[ordre[i].Id] = i;
            var groupes = s.Composants
                .GroupBy(c => string.Join("|", (int)c.Type, Normaliser(c.Designation), Normaliser(c.Taille), Math.Round(c.DnMm), Normaliser(c.Materiau)))
                .Select(g => g.ToList())
                .OrderBy(g => Array.IndexOf(OrdreNomenclature, g[0].Type))
                .ThenByDescending(g => g[0].DnMm)
                .ThenBy(g => g.Min(c => rang[c.Id]))
                .ToList();
            s.Nomenclature.Clear();
            int n = 0;
            foreach (var g in groupes)
            {
                var l = new LigneNomenclature
                {
                    Repere = ++n, Type = g[0].Type, Designation = g[0].Designation, Taille = g[0].Taille, DnMm = g[0].DnMm,
                    Materiau = g[0].Materiau, Quantite = g.Count, LongueurMm = g.Sum(c => c.LongueurMm), Composants = g,
                };
                foreach (var c in g) { c.LigneNomenclature = n; c.Repere = n.ToString(CultureInfo.InvariantCulture); }
                s.Nomenclature.Add(l);
            }
        }

        static void Debiter(Spool s, List<Composant> ordre)
        {
            s.Debits.Clear();
            int n = 0;
            foreach (var t in ordre.Where(c => c.Type == TypeComposant.Tube))
            {
                t.Repere = "T" + (++n).ToString(CultureInfo.InvariantCulture);
                t.SurlongueurMm = s.Assemblages.Where(a => a.Recoupe == t).Sum(a => a.SurlongueurMm);
                s.Debits.Add(new Debit { Repere = t.Repere, Tube = t, LongueurMm = Math.Round(t.LongueurMm + t.SurlongueurMm), SurlongueurMm = t.SurlongueurMm, DnMm = t.DnMm });
            }
        }

        static void ListerAssemblages(Spool s, List<Composant> ordre)
        {
            var parId = s.Composants.ToDictionary(c => c.Id);
            var vus = new HashSet<string>();
            var liste = new List<Assemblage>();
            foreach (var a in ordre)
                foreach (var e in a.Extremites)
                {
                    if (e.ConnecteA == null) { liste.Add(new Assemblage { Nature = NatureAssemblage.ExtremiteLibre, A = a, Position = e.Position, DnMm = e.DnMm }); continue; }
                    if (!parId.TryGetValue(e.ConnecteA, out var b))
                    {
                        var r = new Assemblage { Nature = NatureAssemblage.RaccordementChantier, A = a, Exterieur = e.ConnecteA, Position = e.Position, DnMm = e.DnMm, VoisinTube = e.VoisinEstTube };
                        Surlongueur(s, r, a, e, e.VoisinEstTube, e.ConnecteA);
                        liste.Add(r);
                        continue;
                    }
                    var cle = string.CompareOrdinal(a.Id, b.Id) < 0 ? a.Id + "|" + b.Id : b.Id + "|" + a.Id;
                    cle += "|" + Math.Round(e.Position.X) + "|" + Math.Round(e.Position.Y) + "|" + Math.Round(e.Position.Z);
                    if (!vus.Add(cle)) continue;
                    var nature = Boulonnable(a) && Boulonnable(b) ? NatureAssemblage.Boulonne : NatureAssemblage.Soudure;
                    // Soudure chantier imposée à l'intérieur du spool (pas encore renuméroté) : raccordement chantier
                    var eb = Cotation.EnFace(b, a, e.Position);
                    if (nature == NatureAssemblage.Soudure && (e.CoupeChantier || (eb != null && eb.CoupeChantier)))
                    {
                        var r = new Assemblage { Nature = NatureAssemblage.RaccordementChantier, A = a, B = b, Exterieur = b.Id, Position = e.Position, DnMm = e.DnMm };
                        if (!Surlongueur(s, r, a, e, b.Type == TypeComposant.Tube, b.Id) && b.Type == TypeComposant.Tube && eb != null)
                        {
                            var v = eb.SurlongueurMm ?? e.SurlongueurMm ?? s.SurlongueurMm;
                            if (v > 0) { r.SurlongueurMm = v; r.Recoupe = b; }
                        }
                        liste.Add(r);
                        continue;
                    }
                    liste.Add(new Assemblage { Nature = nature, A = a, B = b, Position = e.Position, DnMm = e.DnMm });
                }
            // Un même couple d'éléments vu des deux côtés (positions légèrement différentes) : une seule fois
            s.Assemblages = Dedoublonner(liste);
            int ns = 0, nb = 0, nc = 0, nl = 0;
            foreach (var x in s.Assemblages)
                switch (x.Nature)
                {
                    case NatureAssemblage.Soudure: x.Numero = "S" + (++ns); break;
                    case NatureAssemblage.Boulonne: x.Numero = "B" + (++nb); break;
                    case NatureAssemblage.RaccordementChantier: x.Numero = "R" + (++nc); break;
                    default: x.Numero = "E" + (++nl); break;
                }
        }

        /// <summary>
        /// Surlongueur d'une soudure chantier, laissée sur le tube « a » pour être recoupée sur place. Entre deux tubes,
        /// un seul côté la porte (le plus grand identifiant), pour ne pas la compter deux fois.
        /// </summary>
        static bool Surlongueur(Spool s, Assemblage r, Composant a, Extremite e, bool voisinTube, string voisin)
        {
            if (a.Type != TypeComposant.Tube || Boulonnable(a)) return false;
            if (voisinTube && string.CompareOrdinal(a.Id, voisin ?? "") < 0) return false;
            var v = e.SurlongueurMm ?? s.SurlongueurMm;
            if (v <= 0) return false;
            r.SurlongueurMm = v; r.Recoupe = a;
            return true;
        }

        /// <summary>
        /// Chaque soudure est portée par un seul élément, pour être comptée une fois dans les nomenclatures (isométrie et
        /// nomenclatures Revit) : le raccord plutôt que le tube ; entre deux tubes ou deux raccords, le plus grand identifiant.
        /// Une soudure de raccordement entre deux spools n'est ainsi comptée que dans l'un des deux.
        /// </summary>
        static void AttribuerSoudures(Spool s)
        {
            foreach (var c in s.Composants) c.PoucesSoudures = 0;
            foreach (var a in s.Assemblages)
            {
                a.Porteur = null;
                if (!a.Soude) continue;
                bool tubeA = a.A.Type == TypeComposant.Tube;
                if (a.B != null)
                {
                    bool tubeB = a.B.Type == TypeComposant.Tube;
                    a.Porteur = tubeA != tubeB ? (tubeA ? a.B : a.A) : string.CompareOrdinal(a.A.Id, a.B.Id) > 0 ? a.A : a.B;
                }
                else if (a.Exterieur == null) a.Porteur = a.A;
                else if (tubeA != a.VoisinTube) a.Porteur = tubeA ? null : a.A;
                else a.Porteur = string.CompareOrdinal(a.A.Id, a.Exterieur) > 0 ? a.A : null;
                if (a.Porteur != null) a.Porteur.PoucesSoudures += a.PoucesDiametre;
            }
            foreach (var l in s.Nomenclature) l.PoucesSoudures = l.Composants.Sum(c => c.PoucesSoudures);
        }

        static List<Assemblage> Dedoublonner(List<Assemblage> liste)
        {
            var res = new List<Assemblage>();
            foreach (var x in liste)
            {
                if (x.B != null && res.Any(y => y.B != null && y.Position.Distance(x.Position) < 5
                    && ((y.A == x.A && y.B == x.B) || (y.A == x.B && y.B == x.A)))) continue;
                res.Add(x);
            }
            return res;
        }

        public static bool Boulonnable(Composant c) =>
            c.Type == TypeComposant.Bride || c.Type == TypeComposant.Vanne || c.Type == TypeComposant.Accessoire;

        // ---------- Outils ----------

        static string PlusFrequent(IEnumerable<string> valeurs) =>
            valeurs.Where(v => !string.IsNullOrWhiteSpace(v)).GroupBy(v => v.Trim())
                .OrderByDescending(g => g.Count()).ThenBy(g => g.Key, StringComparer.Ordinal).Select(g => g.Key).FirstOrDefault() ?? "";

        /// <summary>Minuscules sans accents, pour comparer et reconnaître les noms de familles.</summary>
        public static string Normaliser(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            var d = s.ToLowerInvariant().Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder(d.Length);
            foreach (var ch in d)
                if (CultureInfo.InvariantCulture.CompareInfo.IndexOf("̧̀́̂̈", ch) < 0
                    && char.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark) sb.Append(ch);
            return Regex.Replace(sb.ToString(), @"[\s_\-]+", " ").Trim();
        }

        /// <summary>Tri « naturel » des numéros de spool : SP-2 avant SP-10.</summary>
        public static int ComparerNaturel(string a, string b)
        {
            var ra = Regex.Split(a ?? "", @"(\d+)");
            var rb = Regex.Split(b ?? "", @"(\d+)");
            for (int i = 0; i < Math.Min(ra.Length, rb.Length); i++)
            {
                int r;
                if (i % 2 == 1 && long.TryParse(ra[i], out var na) && long.TryParse(rb[i], out var nb)) r = na.CompareTo(nb);
                else r = string.Compare(ra[i], rb[i], StringComparison.OrdinalIgnoreCase);
                if (r != 0) return r;
            }
            return ra.Length.CompareTo(rb.Length);
        }
    }
}
