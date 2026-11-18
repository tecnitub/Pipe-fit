// Robinetterie et accessoires de ligne : genre (vanne, papillon, réglage, clapet, boisseau, filtre, compensateur),
// désignation, sens d'écoulement à travers le spool, et symboles d'isométrie normalisés dessinés sur la feuille.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace PipeFit.Isometries.Core
{
    public enum GenreRobinet { Aucun, Vanne, Papillon, Reglage, Clapet, Boisseau, Filtre, Compensateur, Motorisee, Purgeur, Manometre, Thermometre }

    public static class Robinetterie
    {
        /// <summary>
        /// Correspondances choisies par l'utilisateur : nom de la FAMILLE d'accessoire (normalisé) → symbole. Elles passent
        /// avant la recherche par mots-clés (ex. famille « KSB BOA-H » → vanne de réglage).
        /// </summary>
        public static Dictionary<string, GenreRobinet> Correspondances = new Dictionary<string, GenreRobinet>();

        public static string Cle(string famille) => AnalyseSpool.Normaliser(famille);

        /// <summary>
        /// Genre d'un accessoire ou d'une vanne, d'après le seul NOM DE SA FAMILLE (le nom du type n'est pas lu) :
        /// correspondance choisie pour la famille, sinon recherche des mots-clés et références fabricants dans ce nom,
        /// sinon vanne par défaut. reconnu : la famille a donné le genre (pas le défaut).
        /// </summary>
        public static GenreRobinet Genre(Composant c) => Genre(c, out _);

        public static GenreRobinet Genre(Composant c, out bool reconnu)
        {
            reconnu = false;
            if (!c.EstAccessoire && c.Type != TypeComposant.Vanne && c.Type != TypeComposant.Accessoire) return GenreRobinet.Aucun;
            if (Correspondances.TryGetValue(Cle(c.Famille), out var choisi) && choisi != GenreRobinet.Aucun) { reconnu = true; return choisi; }
            var g = ParMots(c.Famille);
            if (g != GenreRobinet.Aucun) { reconnu = true; return g; }
            // Raccord dessiné dans une famille d'accessoire (ex. bride sous une famille de vanne) : pas de robinetterie
            if (Raccord(c.Famille) != null) return GenreRobinet.Aucun;
            return c.EstAccessoire ? GenreRobinet.Vanne : GenreRobinet.Aucun;
        }

        /// <summary>
        /// Raccord désigné par le nom de la FAMILLE d'un accessoire qui ne nomme aucune robinetterie (« Bride à collerette »,
        /// « Bride pleine », « Coude »…) : la pièce est ce raccord, pas une vanne. Null sinon. Une correspondance choisie
        /// pour la famille dans « Symboles… » passe avant.
        /// </summary>
        public static TypeComposant? Raccord(string famille)
        {
            var n = AnalyseSpool.Normaliser(famille);
            if (n == "" || ParMots(famille) != GenreRobinet.Aucun) return null;
            if (Correspondances.TryGetValue(Cle(famille), out var choisi) && choisi != GenreRobinet.Aucun) return null;
            if (Regex.IsMatch(n, @"bride|flange|collerette|\bfaux ?bride")) return TypeComposant.Bride;
            if (Regex.IsMatch(n, @"coude|elbow|\bbend\b|cintre")) return TypeComposant.Coude;
            if (Regex.IsMatch(n, @"reduction|reducer|\breduc")) return TypeComposant.Reduction;
            if (Regex.IsMatch(n, @"bouchon|\bcap\b|fond bombe|calotte|obturateur")) return TypeComposant.Bouchon;
            if (Regex.IsMatch(n, @"\b(te|tee)\b")) return TypeComposant.Te;
            if (Regex.IsMatch(n, @"manchon|coupling|raccord union|mamelon|nipple")) return TypeComposant.Manchon;
            return null;
        }

        /// <summary>Genre reconnu par mots-clés dans un nom (Aucun si rien ne correspond).</summary>
        public static GenreRobinet ParMots(string nom)
        {
            var n = AnalyseSpool.Normaliser(nom);
            if (n == "") return GenreRobinet.Aucun;
            // Mots-clés génériques (français, anglais) et références des fabricants utilisés par TECNITUB
            // (fiche technique robinetterie : ASTORI, TECOFI, IMI Hydronic, CGR, FLAMCO, WIKA, SIEMENS)
            if (Regex.IsMatch(n, @"compensateur|dilatoflex|dilatation|soufflet|manchette|anti ?vibrat|lyre|bellows|expansion|\bdi ?7240|\bcgr ?369")) return GenreRobinet.Compensateur;
            if (Regex.IsMatch(n, @"clapet|anti ?retour|\bcheck\b|non ?return|battant|\bcb ?3448")) return GenreRobinet.Clapet;
            if (Regex.IsMatch(n, @"2 voies|deux voies|3 voies|trois voies|\bv2v|\bv3v|motoris|servomoteur|actionneur|\bpicv|vanne de regulation|regulation motor|control valve|\bsiemens|\bbelimo")) return GenreRobinet.Motorisee;
            if (Regex.IsMatch(n, @"reglage|equilibrage|balancing|\bstad|\bstaf|\btbv|\bmsv|\bimi\b|hydronic|robinet a soupape|\bcgr ?165|debit")) return GenreRobinet.Reglage;
            if (Regex.IsMatch(n, @"papillon|butterfly|\bvpi ?4648|\bvpe ?4508")) return GenreRobinet.Papillon;
            if (Regex.IsMatch(n, @"boisseau|quart de tour|\bball\b|sphere|\bbille|\bastori|\b304 ?ab\b")) return GenreRobinet.Boisseau;
            if (Regex.IsMatch(n, @"filtre|strainer|tamis|\bf ?3240")) return GenreRobinet.Filtre;
            if (Regex.IsMatch(n, @"purgeur|degazeur|air vent|\bvent\b|flexvent|\bflamco|separateur d air")) return GenreRobinet.Purgeur;
            if (Regex.IsMatch(n, @"manometre|pressure gauge|\bgauge\b|\bwika|\b818 ?i?\b")) return GenreRobinet.Manometre;
            if (Regex.IsMatch(n, @"thermometre|thermometer|\b29[34] ?cb")) return GenreRobinet.Thermometre;
            if (Regex.IsMatch(n, @"vanne|robinet|valve|opercule|guillotine|soupape|\bpointeau")) return GenreRobinet.Vanne;
            return GenreRobinet.Aucun;
        }

        public static string Libelle(GenreRobinet g)
        {
            switch (g)
            {
                case GenreRobinet.Papillon: return "Vanne papillon";
                case GenreRobinet.Reglage: return "Vanne de réglage";
                case GenreRobinet.Clapet: return "Clapet anti-retour";
                case GenreRobinet.Boisseau: return "Vanne à boisseau";
                case GenreRobinet.Filtre: return "Filtre";
                case GenreRobinet.Compensateur: return "Compensateur de dilatation";
                case GenreRobinet.Motorisee: return "Vanne de régulation motorisée";
                case GenreRobinet.Purgeur: return "Purgeur d'air";
                case GenreRobinet.Manometre: return "Manomètre";
                case GenreRobinet.Thermometre: return "Thermomètre";
                case GenreRobinet.Vanne: return "Vanne";
                default: return "";
            }
        }

        /// <summary>Mot qui dit le genre dans une désignation (« STAD-F » ne dit pas « réglage » : on le précise).</summary>
        public static string MotCle(GenreRobinet g)
        {
            switch (g)
            {
                case GenreRobinet.Papillon: return "papillon";
                case GenreRobinet.Reglage: return "reglage";
                case GenreRobinet.Clapet: return "clapet";
                case GenreRobinet.Boisseau: return "boisseau";
                case GenreRobinet.Filtre: return "filtre";
                case GenreRobinet.Compensateur: return "compensateur";
                case GenreRobinet.Motorisee: return "motoris";
                case GenreRobinet.Purgeur: return "purgeur";
                case GenreRobinet.Manometre: return "manometre";
                case GenreRobinet.Thermometre: return "thermometre";
                default: return "vanne";
            }
        }

        /// <summary>Le genre vaut composant de ligne démontable (vanne, accessoire) : pas un raccord soudé.</summary>
        public static TypeComposant Type(GenreRobinet g) =>
            g == GenreRobinet.Compensateur || g == GenreRobinet.Filtre || UnPort(g) ? TypeComposant.Accessoire : TypeComposant.Vanne;

        /// <summary>Appareil monté sur un seul raccordement (piquage) : purgeur, manomètre, thermomètre.</summary>
        public static bool UnPort(GenreRobinet g) => g == GenreRobinet.Purgeur || g == GenreRobinet.Manometre || g == GenreRobinet.Thermometre;

        /// <summary>Le composant est dessiné par un symbole normalisé (en ligne entre deux raccordements, ou sur un piquage).</summary>
        public static bool Symbolise(Composant c) =>
            c.Genre != GenreRobinet.Aucun && (c.Extremites.Count >= 2 || (c.Extremites.Count == 1 && UnPort(c.Genre)));

        /// <summary>
        /// Sens d'écoulement : à partir des arrivées du spool (extrémités « entrée »), chaque composant reçoit son extrémité
        /// amont (celle par où le fluide arrive). Sans arrivée connue, rien n'est orienté.
        /// </summary>
        public static void Ecoulement(Spool s)
        {
            foreach (var c in s.Composants) c.Amont = null;
            var parId = s.Composants.ToDictionary(c => c.Id);
            var file = new Queue<Composant>();
            foreach (var l in s.Liaisons.Where(l => l.Sens == SensFlux.Entree))
                foreach (var c in s.Composants)
                {
                    var e = c.Extremites.FirstOrDefault(x => x.Position.Distance(l.Position) < 1 && (x.ConnecteA == null || !parId.ContainsKey(x.ConnecteA)));
                    if (e != null && c.Amont == null) { c.Amont = e; file.Enqueue(c); }
                }
            while (file.Count > 0)
            {
                var c = file.Dequeue();
                foreach (var e in c.Extremites.Where(x => x != c.Amont))
                {
                    if (e.ConnecteA == null || !parId.TryGetValue(e.ConnecteA, out var v) || v.Amont != null) continue;
                    v.Amont = Cotation.EnFace(v, c, e.Position);
                    if (v.Amont != null) file.Enqueue(v);
                }
            }
        }

        /// <summary>Extrémités dans le sens de l'écoulement (amont d'abord) quand il est connu.</summary>
        public static List<Extremite> Ordre(Composant c) =>
            c.Amont == null ? c.Extremites.ToList() : new[] { c.Amont }.Concat(c.Extremites.Where(x => x != c.Amont)).ToList();

        public struct Segment
        {
            public double U1, V1, U2, V2;
            public Segment(double u1, double v1, double u2, double v2) { U1 = u1; V1 = v1; U2 = u2; V2 = v2; }
        }

        /// <summary>
        /// Symbole d'isométrie en coordonnées locales (u le long du tube dans le sens de l'écoulement, v perpendiculaire),
        /// longueur l et demi-hauteur h en mm papier.
        /// </summary>
        public static List<Segment> Symbole(GenreRobinet g, double l = 7, double h = 2.6)
        {
            var s = new List<Segment>();
            double a = l / 2;
            void Seg(double u1, double v1, double u2, double v2) => s.Add(new Segment(u1, v1, u2, v2));
            void Cercle(double cu, double cv, double r)
            {
                const int n = 12;
                for (int i = 0; i < n; i++)
                {
                    double t1 = 2 * Math.PI * i / n, t2 = 2 * Math.PI * (i + 1) / n;
                    Seg(cu + r * Math.Cos(t1), cv + r * Math.Sin(t1), cu + r * Math.Cos(t2), cv + r * Math.Sin(t2));
                }
            }
            void Papillon() { Seg(-a, -h, a, h); Seg(-a, h, a, -h); Seg(-a, -h, -a, h); Seg(a, -h, a, h); }
            void Tige() { Seg(0, 0, 0, h + 2); Seg(-1.4, h + 2, 1.4, h + 2); }
            // Appareils sur piquage : u part du tube (0) vers l'appareil ; queue de 3 mm puis l'appareil
            switch (g)
            {
                case GenreRobinet.Purgeur:
                    Seg(0, 0, 3, 0);
                    Seg(3, -1.6, 6.2, -1.6); Seg(6.2, -1.6, 6.2, 1.6); Seg(6.2, 1.6, 3, 1.6); Seg(3, 1.6, 3, -1.6);
                    Seg(6.2, 0, 8.6, 0); Seg(8.6, 0, 7.6, 0.8); Seg(8.6, 0, 7.6, -0.8);   // évent : flèche de sortie d'air
                    return s;
                case GenreRobinet.Manometre:
                    Seg(0, 0, 3, 0); Cercle(5.4, 0, 2.4); Seg(5.4, 0, 6.8, 1.3);          // cadran et aiguille
                    return s;
                case GenreRobinet.Thermometre:
                    Seg(0, 0, 3, 0);
                    Seg(3, -0.8, 7.6, -0.8); Seg(7.6, -0.8, 7.6, 0.8); Seg(7.6, 0.8, 3, 0.8); Seg(3, 0.8, 3, -0.8);
                    Cercle(8.8, 0, 1.2);                                                       // tige et bulbe
                    return s;
            }
            switch (g)
            {
                case GenreRobinet.Motorisee:
                    // Vanne 2 voies : corps de vanne, tige et servomoteur (carré avec M)
                    Papillon(); Seg(0, 0, 0, h + 0.6);
                    Seg(-1.8, h + 0.6, 1.8, h + 0.6); Seg(1.8, h + 0.6, 1.8, h + 3.2); Seg(1.8, h + 3.2, -1.8, h + 3.2); Seg(-1.8, h + 3.2, -1.8, h + 0.6);
                    Seg(-1.1, h + 1.0, -1.1, h + 2.8); Seg(-1.1, h + 2.8, 0, h + 1.8); Seg(0, h + 1.8, 1.1, h + 2.8); Seg(1.1, h + 2.8, 1.1, h + 1.0);
                    break;
                case GenreRobinet.Compensateur:
                    // Soufflet : brides aux deux bouts et ondes en zigzag
                    Seg(-a, -h, -a, h); Seg(a, -h, a, h);
                    for (int i = 0; i < 4; i++)
                    {
                        double u1 = -a + l * i / 4, u2 = -a + l * (i + 0.5) / 4, u3 = -a + l * (i + 1) / 4;
                        Seg(u1, h * 0.55, u2, h); Seg(u2, h, u3, h * 0.55);
                        Seg(u1, -h * 0.55, u2, -h); Seg(u2, -h, u3, -h * 0.55);
                    }
                    break;
                case GenreRobinet.Filtre:
                    // Filtre en Y : corps et jambe inclinée vers le bas
                    Seg(-a, -h * 0.7, a, -h * 0.7); Seg(-a, h * 0.7, a, h * 0.7); Seg(-a, -h * 0.7, -a, h * 0.7); Seg(a, -h * 0.7, a, h * 0.7);
                    Seg(-a * 0.2, -h * 0.7, a * 0.6, -h * 2.2); Seg(a * 0.6, -h * 0.7, a * 1.2, -h * 1.8); Seg(a * 0.6, -h * 2.2, a * 1.2, -h * 1.8);
                    break;
                case GenreRobinet.Papillon:
                    Papillon(); Seg(0, -h * 1.35, 0, h * 1.35); Cercle(0, 0, h * 0.28); Tige();
                    break;
                case GenreRobinet.Reglage:
                    Papillon(); Cercle(0, 0, h * 0.45); Tige();
                    Seg(-a * 0.55, -h - 1.4, a * 0.55, -h - 1.4); Seg(a * 0.55, -h - 1.4, a * 0.25, -h - 1.0); // flèche de réglage
                    Seg(-a * 0.55, -h - 1.4, -a * 0.25, -h - 1.8);
                    break;
                case GenreRobinet.Clapet:
                    // Clapet : moitié aval hachurée et flèche du sens d'écoulement
                    Papillon();
                    for (int i = 1; i <= 3; i++) { double u = a * i / 4; Seg(u, -h * u / a, u, h * u / a); }
                    Seg(-a, h + 1.6, a, h + 1.6); Seg(a, h + 1.6, a - 1.3, h + 2.3); Seg(a, h + 1.6, a - 1.3, h + 0.9);
                    break;
                case GenreRobinet.Boisseau:
                    Papillon(); Cercle(0, 0, h * 0.5); Tige();
                    break;
                default:
                    Papillon(); Tige();
                    break;
            }
            return s;
        }

        /// <summary>Segments du symbole placés sur la feuille : centre (cx, cy), axe (ax, ay) unitaire dans le sens d'écoulement.</summary>
        public static List<(double x1, double y1, double x2, double y2)> Placer(List<Segment> segs, double cx, double cy, double ax, double ay)
        {
            double px = -ay, py = ax;
            return segs.Select(s => (cx + s.U1 * ax + s.V1 * px, cy + s.U1 * ay + s.V1 * py, cx + s.U2 * ax + s.V2 * px, cy + s.U2 * ay + s.V2 * py)).ToList();
        }
    }
}
