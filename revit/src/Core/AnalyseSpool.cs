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
                c.Genre = Robinetterie.Genre(c);
                c.Designation = Designer(c);
            }
            HeriterMateriau(s);
            MarquerPiquages(s);
            foreach (var c in s.Composants) Pente(c);

            var ordre = Parcourir(s.Composants);
            NumeroterNomenclature(s, ordre);
            ListerAssemblages(s, ordre);
            Debiter(s, ordre);
            // Matière à prévoir : la nomenclature des tubes comprend les surlongueurs à recouper sur place
            foreach (var l in s.Nomenclature.Where(x => x.EstTube)) l.LongueurMm = l.Composants.Sum(c => c.LongueurMm + c.PiquageMm + c.SurlongueurMm);
            AttribuerSoudures(s);

            s.Systeme = PlusFrequent(s.Composants.Select(c => c.Systeme));
            s.Materiau = PlusFrequent(s.Composants.Where(c => c.Type == TypeComposant.Tube).Select(c => c.Materiau));
            if (s.Materiau == "") s.Materiau = PlusFrequent(s.Composants.Select(c => c.Materiau));
            s.DnMax = s.Composants.Count == 0 ? 0 : s.Composants.Max(c => c.DnMm);
            s.LongueurDeveloppeeMm = s.Composants.Where(c => c.Type == TypeComposant.Tube).Sum(c => c.LongueurMm);
            s.Cotes = Cotation.Calculer(s);
            s.Liaisons = Liaisons.Calculer(s, ordre);
            Robinetterie.Ecoulement(s);
        }

        // ---------- Type de composant ----------

        /// <summary>Type déduit du nom de la famille, puis de la géométrie des extrémités.</summary>
        public static TypeComposant Classer(Composant c)
        {
            var nom = Normaliser(c.Famille + " " + c.TypeNom);
            if (c.EstAccessoire)
            {
                // Bride (ou autre raccord) dessinée dans une famille d'accessoire : le nom de la famille la désigne
                var r = Robinetterie.Raccord(c.Famille);
                if (r == TypeComposant.Bride && c.Extremites.Count == 1) return TypeComposant.Bride;
                if (r != null) return r.Value;
                var g = Robinetterie.Genre(c);
                return g == GenreRobinet.Aucun ? TypeComposant.Accessoire : Robinetterie.Type(g);
            }
            // Raccord : le type de pièce Revit d'abord (un coude nommé « Courbe » ou « Raccord soudé 90 » reste un coude)
            switch (c.TypePiece ?? "")
            {
                case "Elbow": return TypeComposant.Coude;
                case "Tee": case "Wye": case "LateralTee": return c.Extremites.Count >= 4 ? TypeComposant.Croix : TypeComposant.Te;
                case "Cross": case "LateralCross": return TypeComposant.Croix;
                case "Transition": return TypeComposant.Reduction;
                case "Cap": return TypeComposant.Bouchon;
                case "TapPerpendicular": case "TapAdjustable": case "SpudPerpendicular": case "SpudAdjustable": return TypeComposant.Piquage;
            }
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
                    if (e1.Direction.HasValue && e2.Direction.HasValue && Cotation.Devie(c)) return TypeComposant.Coude;
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
            // Directions des raccordements (sortantes) : déviation = 180° − angle entre elles
            var d1 = c.Extremites[0].Direction; var d2 = c.Extremites[1].Direction;
            if (d1.HasValue && d2.HasValue && d1.Value.Longueur > 1e-9 && d2.Value.Longueur > 1e-9)
                return Math.Round(180 - Angle(d1.Value, d2.Value), 1);
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
                // Préfixe « Coude », « Té », « Clapet anti-retour »… quand le nom de la famille ne le dit pas
                var genre = Robinetterie.Genre(c);
                if (genre != GenreRobinet.Aucun && genre != GenreRobinet.Vanne)
                {
                    var lib = Robinetterie.Libelle(genre);
                    if (!Normaliser(d).Contains(Normaliser(lib.Split(' ')[0]))) d = lib + " " + d;
                }
                else if (MotsCles.TryGetValue(c.Type, out var mots) && !Regex.IsMatch(Normaliser(d), mots)) d = Libelle(c.Type) + " " + d;
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
                // La robinetterie et les accessoires ont leur propre matière (corps fonte, laiton…) : pas d'héritage du tube
                foreach (var c in s.Composants.Where(x => string.IsNullOrWhiteSpace(x.Materiau) && !(x.EstAccessoire && x.Genre != GenreRobinet.Aucun)))
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

        /// <summary>Pente d'un tube (0,05 à 25 %, ni horizontal ni vertical) et son extrémité basse.</summary>
        public static void Pente(Composant c)
        {
            c.PentePourcent = 0; c.BasIndex = 0;
            if (c.Type != TypeComposant.Tube || c.Extremites.Count != 2) return;
            var d = c.Extremites[1].Position - c.Extremites[0].Position;
            var hz = Math.Sqrt(d.X * d.X + d.Y * d.Y);
            if (hz < 1) return;
            var p = Math.Abs(d.Z) / hz;
            if (p < 0.0005 || p > 0.25) return;
            c.PentePourcent = Math.Round(p * 100, p * 100 < 10 ? 1 : 0);
            c.BasIndex = d.Z < 0 ? 1 : 0;
        }

        /// <summary>
        /// Piquages directs : un piquage Revit (raccord à piquage, longueur dessinée) qui n'est pas un olet ni une selle est
        /// en réalité la branche piquée sur le collecteur. On repère son côté branche : l'extrémité raccordée au BOUT d'un
        /// tube (le collecteur, lui, passe sous le piquage), sinon la plus petite.
        /// </summary>
        static void MarquerPiquages(Spool s)
        {
            var parId = s.Composants.ToDictionary(c => c.Id);
            foreach (var c in s.Composants)
            {
                c.PiquageDirect = false; c.CoteBranche = null; c.AxeCollecteur = null;
                if (c.Type != TypeComposant.Piquage || c.Extremites.Count != 2) continue;
                c.AxeCollecteur = AxeDuCollecteur(c, parId);
                bool AuBoutDunTube(Extremite e) =>
                    e.ConnecteA != null && parId.TryGetValue(e.ConnecteA, out var v) && v.Type == TypeComposant.Tube
                    && v.Extremites.Any(x => (x.Position - e.Position).Longueur < 2);
                var bouts = c.Extremites.Where(AuBoutDunTube).ToList();
                var branche = bouts.Count == 1 ? bouts[0] : c.Extremites.OrderBy(x => x.DnMm).First();
                if (bouts.Count == 2 && Math.Abs(c.Extremites[0].DnMm - c.Extremites[1].DnMm) < 0.5)
                {
                    // Deux bouts de tube et même DN : le collecteur est celui dont l'axe passe par le point d'axe du piquage
                    branche = c.Extremites.OrderBy(x => x.DnMm).ThenByDescending(x => (x.Position - Cotation.PointAxe(c)).Longueur).First();
                }
                // Côté branche connu pour tous les piquages (seule la soudure sur le collecteur est comptée) ; les olets et selles
                // restent des pièces achetées, les autres piquages sont la branche piquée directement
                c.CoteBranche = branche;
                c.PiquageDirect = !Regex.IsMatch(Normaliser(c.Famille + " " + c.TypeNom), @"olet|selle|saddle|bossage|manchon|coupling");
            }
        }

        /// <summary>
        /// Point de l'axe du collecteur sous un piquage : le connecteur côté collecteur (Revit le place souvent sur la paroi)
        /// projeté sur l'axe du tube collecteur. Les cotes sont toujours à l'axe.
        /// </summary>
        static Point3 AxeDuCollecteur(Composant p, Dictionary<string, Composant> parId)
        {
            Composant Voisin(Extremite e) => e.ConnecteA != null && parId.TryGetValue(e.ConnecteA, out var v) ? v : null;
            bool AuBout(Extremite e, Composant v) => v.Extremites.Any(x => (x.Position - e.Position).Longueur < 2);
            // Côté collecteur : l'extrémité raccordée à un tube qui passe sous le piquage (pas à son bout), sinon le plus gros DN
            var col = p.Extremites.FirstOrDefault(e => Voisin(e) is Composant v && v.Type == TypeComposant.Tube && v.Extremites.Count == 2 && !AuBout(e, v))
                      ?? p.Extremites.OrderByDescending(x => x.DnMm).First();
            var t = Voisin(col);
            if (t == null || t.Type != TypeComposant.Tube || t.Extremites.Count != 2) return col.Position;
            var a = t.Extremites[0].Position; var d = t.Extremites[1].Position - a;
            var l2 = d.Dot(d);
            if (l2 < 1e-6) return col.Position;
            var k = (col.Position - a).Dot(d) / l2;
            return a + d * k;
        }

        /// <summary>Longueur d'un piquage direct (de son extrémité côté collecteur à celle côté branche).</summary>
        public static double LongueurPiquage(Composant p) =>
            p.Extremites.Count == 2 ? (p.Extremites[0].Position - p.Extremites[1].Position).Longueur : 0;

        /// <summary>Cote face à face d'une vanne ou d'un accessoire en ligne (distance entre ses deux faces), 0 sinon.</summary>
        public static double FaceAFace(Composant c) =>
            Cotation.EstVanne(c) ? c.Extremites[0].Position.Distance(c.Extremites[1].Position) : 0;

        static void NumeroterNomenclature(Spool s, List<Composant> ordre)
        {
            var rang = new Dictionary<string, int>();
            for (int i = 0; i < ordre.Count; i++) rang[ordre[i].Id] = i;
            foreach (var c in s.Composants.Where(x => x.PiquageDirect)) { c.Repere = ""; c.LigneNomenclature = 0; }
            var groupes = s.Composants.Where(c => !c.PiquageDirect)
                .GroupBy(c => string.Join("|", (int)c.Type, Math.Round(FaceAFace(c)), Normaliser(c.Designation), Normaliser(c.Taille), Math.Round(c.DnMm), Normaliser(c.Materiau)))
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
                    FaceAFaceMm = Math.Round(FaceAFace(g[0])),
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
                // Branche piquée directement sur le collecteur : le tube comprend la longueur du piquage dessiné par Revit
                var piq = t.PiquageMm = s.Composants.Where(p => p.PiquageDirect && p.CoteBranche?.ConnecteA == t.Id).Sum(LongueurPiquage);
                s.Debits.Add(new Debit
                {
                    Repere = t.Repere, Tube = t, LongueurRevitMm = Math.Round(t.LongueurMm), LongueurMm = Math.Round(t.LongueurMm + piq + t.SurlongueurMm), PiquageMm = Math.Round(piq),
                    SurlongueurMm = t.SurlongueurMm, DnMm = t.DnMm, Systeme = t.TypeSysteme != "" ? t.TypeSysteme : t.Systeme,
                });
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
                        // Piquage : pas de soudure côté branche, même quand la branche (ou le piquage) est dans un autre spool
                        if (CoteBrancheDirecte(a, e.Position) || (a.Type == TypeComposant.Tube && e.VoisinEstPiquage)) continue;
                        var r = new Assemblage { Nature = NatureAssemblage.RaccordementChantier, A = a, Exterieur = e.ConnecteA, Position = e.Position, DnMm = e.DnMm, VoisinTube = e.VoisinEstTube };
                        Surlongueur(s, r, a, e, e.VoisinEstTube, e.ConnecteA);
                        liste.Add(r);
                        continue;
                    }
                    var cle = string.CompareOrdinal(a.Id, b.Id) < 0 ? a.Id + "|" + b.Id : b.Id + "|" + a.Id;
                    cle += "|" + Math.Round(e.Position.X) + "|" + Math.Round(e.Position.Y) + "|" + Math.Round(e.Position.Z);
                    if (!vus.Add(cle)) continue;
                    // Piquage : pas de soudure côté branche, seule compte celle sur le collecteur
                    if (CoteBrancheDirecte(a, e.Position) || CoteBrancheDirecte(b, e.Position)) continue;
                    // Joint démontable : bride contre bride / vanne, ou appareil vissé sur piquage (purgeur, manomètre, thermomètre)
                    var nature = (Boulonnable(a) && Boulonnable(b)) || Robinetterie.UnPort(a.Genre) || Robinetterie.UnPort(b.Genre)
                        ? NatureAssemblage.Boulonne : NatureAssemblage.Soudure;
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

        static bool CoteBrancheDirecte(Composant c, Point3 p) =>
            c.Type == TypeComposant.Piquage && c.CoteBranche != null && (c.CoteBranche.Position - p).Longueur < 2;

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
