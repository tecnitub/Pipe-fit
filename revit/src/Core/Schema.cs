// Schéma de principe (P&ID) filaire d'un réseau dessiné en 3D : les tubes, coudes, brides, manchons sont fondus en
// lignes ; restent les éléments significatifs (tés, vannes et accessoires, réductions, pompes, équipements, bouches,
// extrémités). Disposition en arbre orthogonal sans croisement :
//   - le tronc (plus longue chaîne depuis la source : production, CTA, sinon l'élément le plus gros) est horizontal ;
//   - chaque dérivation descend verticalement depuis son té puis repart horizontalement sur sa propre ligne ;
//   - les dérivations d'un même tronc sont placées de la plus à droite à la plus à gauche, leurs lignes l'une sous
//     l'autre : une descente ne traverse jamais une ligne déjà posée ;
//   - une boucle (aller / retour par un équipement) est fermée par un renvoi « vers … », comme sur un P&ID.
// Coordonnées en mm papier, y vers le haut (la première ligne en haut).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace PipeFit.Isometries.Core
{
    public enum NatureSchema { Ligne, Te, Vanne, Accessoire, Reduction, Pompe, Equipement, Bouche, Extremite, Renvoi }

    public sealed class NoeudSchema
    {
        public string Id = "";
        public NatureSchema Nature;
        public GenreRobinet Genre;
        /// <summary>Repère ou nom court affiché près du symbole (équipement : dans son cadre).</summary>
        public string Libelle = "";
        /// <summary>« DN50 », « Ø315 », « 400×200 ».</summary>
        public string Dimension = "";
        public double DnMm;
        public string Systeme = "";
        /// <summary>Source du réseau (production, CTA) : racine du schéma.</summary>
        public bool Source;
        /// <summary>Réseau de retour (classification Revit) : parcouru après l'aller, pour que les équipements soient en aval de l'aller.</summary>
        public bool Retour;
    }

    public sealed class TraitSchema { public double X1, Y1, X2, Y2; public string Systeme = ""; }
    public sealed class SymboleSchema { public string Id = ""; public NatureSchema Nature; public GenreRobinet Genre; public double X, Y, Dx = 1, Dy; public string Libelle = ""; public double DemiLargeur; }
    public sealed class TexteSchema { public double X, Y; public string Texte = ""; public double Taille = 2.5; public bool Gras, Centre; public double Largeur => MiseEnPage.LargeurTexte(Texte, Taille, Gras); }

    public sealed class Schema
    {
        public List<TraitSchema> Traits = new List<TraitSchema>();
        public List<SymboleSchema> Symboles = new List<SymboleSchema>();
        public List<TexteSchema> Textes = new List<TexteSchema>();
        public double X0, Y0, X1, Y1;
        public int Reseaux;

        public const double PasLigne = 18, Ecart = 6, Hauteur = 2.5, Petit = 2.0;

        // ---------- Construction ----------

        sealed class N
        {
            public NoeudSchema D;
            public List<N> Enfants = new List<N>();
            public int Chaine;   // nombre d'éléments significatifs de la plus longue chaîne descendante
        }

        static bool Significatif(NoeudSchema n) => n.Nature != NatureSchema.Ligne;

        static double DemiSymbole(NoeudSchema n)
        {
            switch (n.Nature)
            {
                case NatureSchema.Te: case NatureSchema.Extremite: case NatureSchema.Renvoi: return 0.5;
                case NatureSchema.Vanne: case NatureSchema.Accessoire: return Robinetterie.UnPort(n.Genre) ? 3 : 4;
                case NatureSchema.Reduction: return 2;
                case NatureSchema.Pompe: return 4;
                case NatureSchema.Bouche: return 3;
                case NatureSchema.Equipement: return Math.Max(10, MiseEnPage.LargeurTexte(Court(n.Libelle), Petit, true) / 2 + 2);
                default: return 0;
            }
        }

        static double DemiHauteur(NoeudSchema n) => n.Nature == NatureSchema.Equipement ? 5 : n.Nature == NatureSchema.Pompe ? 4 : 0;

        /// <summary>Hauteur du symbole au-dessus de l'axe (tige, servomoteur, flèche) : l'étiquette est posée au-dessus.</summary>
        static double Haut(NoeudSchema n)
        {
            var d = Dessin(new SymboleSchema { Nature = n.Nature, Genre = n.Genre, DemiLargeur = DemiSymbole(n) });
            return d.Count == 0 ? 0 : d.Max(g => Math.Max(g.V1, g.V2));
        }

        /// <summary>Libellé d'un équipement, coupé à 28 caractères.</summary>
        public static string Court(string s) { s = (s ?? "").Trim(); return s.Length > 28 ? s.Substring(0, 27) + "…" : s; }

        /// <summary>Texte placé au-dessus du symbole (repère de vanne, nom de pompe, renvoi).</summary>
        static string Etiquette(NoeudSchema n) =>
            n.Nature == NatureSchema.Equipement || n.Nature == NatureSchema.Renvoi ? "" : Court(n.Libelle);

        static string TexteRenvoi(NoeudSchema n) => "vers " + Court(n.Libelle);

        static double Demi(NoeudSchema n) => Math.Max(DemiSymbole(n), MiseEnPage.LargeurTexte(Etiquette(n), Petit) / 2);

        public static Schema Construire(IList<NoeudSchema> noeuds, IEnumerable<(string A, string B)> liens)
        {
            var parId = new Dictionary<string, NoeudSchema>();
            foreach (var n in noeuds) parId[n.Id] = n;
            var adj = parId.Keys.ToDictionary(k => k, k => new List<string>());
            foreach (var (a, b) in liens)
                if (a != b && adj.ContainsKey(a) && adj.ContainsKey(b) && !adj[a].Contains(b)) { adj[a].Add(b); adj[b].Add(a); }
            // Un élément « ligne » (raccord) d'où partent 3 voies ou plus est un té
            foreach (var n in parId.Values) if (n.Nature == NatureSchema.Ligne && adj[n.Id].Count >= 3) n.Nature = NatureSchema.Te;
            // Bout de ligne libre : extrémité
            foreach (var n in parId.Values) if (n.Nature == NatureSchema.Ligne && adj[n.Id].Count <= 1) n.Nature = NatureSchema.Extremite;

            var s = new Schema();
            var place = new HashSet<string>();
            int ligne = 0;
            foreach (var racine in Racines(parId.Values.ToList(), adj))
            {
                if (place.Contains(racine.Id)) continue;
                var arbre = Arbre(racine, parId, adj, place);
                Mesurer(arbre);
                if (s.Reseaux > 0) ligne += 1;
                s.Reseaux++;
                s.Chaine(arbre, 0, ligne, ref ligne, null);
                ligne++;
            }
            s.Bornes();
            return s;
        }

        /// <summary>Racines : sources, puis équipements, puis extrémités, du plus gros au plus petit.</summary>
        static IEnumerable<NoeudSchema> Racines(List<NoeudSchema> n, Dictionary<string, List<string>> adj) =>
            n.OrderByDescending(x => x.Source).ThenByDescending(x => x.Nature == NatureSchema.Pompe || x.Nature == NatureSchema.Equipement)
             .ThenByDescending(x => adj[x.Id].Count == 1).ThenByDescending(x => x.DnMm).ThenBy(x => x.Id, StringComparer.Ordinal);

        static N Arbre(NoeudSchema racine, Dictionary<string, NoeudSchema> parId, Dictionary<string, List<string>> adj, HashSet<string> place)
        {
            var r = new N { D = racine };
            var noeud = new Dictionary<string, N> { [racine.Id] = r };
            var parentDe = new Dictionary<string, string> { [racine.Id] = null };
            var liensVus = new HashSet<string>();
            var renvois = new List<(N Renvoi, string Cible)>();
            var reportes = new HashSet<string>();
            // Parcours en largeur, l'aller d'abord : un passage vers le retour attend que l'aller soit épuisé
            var aller = new Queue<string>(); var retour = new Queue<string>();
            aller.Enqueue(racine.Id); place.Add(racine.Id);
            while (aller.Count > 0 || retour.Count > 0)
            {
                var u = aller.Count > 0 ? aller.Dequeue() : retour.Dequeue();
                foreach (var v in adj[u].OrderBy(x => parId[x].Retour))
                {
                    var cle = string.CompareOrdinal(u, v) < 0 ? u + "|" + v : v + "|" + u;
                    if (liensVus.Contains(cle)) continue;
                    if (!noeud.ContainsKey(v))
                    {
                        // Vers le retour depuis l'aller : plus tard (sauf depuis le retour lui-même)
                        if (parId[v].Retour && !parId[u].Retour)
                        {
                            // La source ne déroule pas le retour : il part des équipements et revient à la source par un renvoi
                            if (u == racine.Id) continue;
                            if (reportes.Add(u + "|" + v)) { retour.Enqueue(u); continue; }
                        }
                        liensVus.Add(cle);
                        var nv = new N { D = parId[v] }; noeud[v] = nv; noeud[u].Enfants.Add(nv); place.Add(v); parentDe[v] = u;
                        (parId[v].Retour ? retour : aller).Enqueue(v);
                    }
                    else
                    {
                        liensVus.Add(cle);
                        // Boucle : renvoi vers l'élément déjà placé
                        var rn = new N { D = new NoeudSchema { Id = u + ">" + v, Nature = NatureSchema.Renvoi, Systeme = parId[u].Systeme, Dimension = parId[u].Dimension, Retour = parId[u].Retour } };
                        noeud[u].Enfants.Add(rn);
                        renvois.Add((rn, v));
                    }
                }
            }
            // Repère des cibles de renvoi : leur nom, sinon une lettre posée aussi sur la cible (té)
            int lettre = 0;
            // Cible « ligne » (tube) : l'élément visible le plus proche en remontant l'arbre
            string Visible(string id) { var c = id; while (c != null && !Significatif(parId[c])) c = parentDe.TryGetValue(c, out var pp) ? pp : null; return c ?? id; }
            renvois = renvois.Select(x => (x.Renvoi, Visible(x.Cible))).ToList();
            foreach (var g in renvois.GroupBy(x => x.Cible))
            {
                var cible = parId[g.Key];
                if (cible.Libelle == "") cible.Libelle = ((char)('A' + lettre++ % 26)).ToString();
                foreach (var (rn, _) in g) rn.D.Libelle = cible.Libelle;
            }
            return r;
        }

        static int Mesurer(N n)
        {
            int m = 0;
            foreach (var e in n.Enfants) m = Math.Max(m, Mesurer(e));
            n.Chaine = m + (Significatif(n.D) ? 1 : 0);
            return n.Chaine;
        }

        double Y(int ligne) => -ligne * PasLigne;

        /// <summary>
        /// Pose une chaîne horizontale commençant au point (x, ligne) — coin de la descente, ou origine — puis ses dérivations.
        /// </summary>
        void Chaine(N debut, double x, int ligneChaine, ref int derniere, NoeudSchema precedent)
        {
            double y = Y(ligneChaine);
            var derivations = new List<(double X, N Enfant, double Bas)>();
            double xBord = x;            // fin du dernier trait tracé (bord droit du dernier symbole)
            string dimTrait = debut.D.Dimension, sysTrait = debut.D.Systeme, sysAffiche = precedent?.Systeme, dimAffichee = null;
            double xDebutTrait = x;
            NoeudSchema dernierSymbole = precedent;
            var cur = debut;
            bool premier = true;
            while (cur != null)
            {
                var d = cur.D;
                if (d.Dimension != "" && d.Nature == NatureSchema.Ligne) dimTrait = d.Dimension;
                if (d.Systeme != "") sysTrait = d.Systeme;
                if (Significatif(d))
                {
                    // Libellé du trait qui arrive sur ce symbole : réseau (s'il change) et dimension (si elle change)
                    var lib = ((sysTrait != "" && sysTrait != sysAffiche ? sysTrait + " " : "") + (dimTrait != "" && dimTrait != dimAffichee ? dimTrait : "")).Trim();
                    double ecart = lib != "" ? Math.Max(Ecart, MiseEnPage.LargeurTexte(lib, Petit) + 3) : Ecart;
                    double demi = Demi(d), xs = premier && precedent == null ? x + demi : (premier ? x : xBord) + ecart + demi;
                    // Trait depuis le symbole précédent (ou le coin) jusqu'à ce symbole
                    var g = xs - DemiSymbole(d);
                    if (g > xDebutTrait + 0.01) Trait(xDebutTrait, y, g, y, sysTrait);
                    if (lib != "" && g - xDebutTrait >= MiseEnPage.LargeurTexte(lib, Petit) + 2)
                    {
                        Textes.Add(new TexteSchema { X = (xDebutTrait + g) / 2, Y = y - 3.4, Texte = lib, Taille = Petit, Centre = true });
                        sysAffiche = sysTrait; dimAffichee = dimTrait;
                    }
                    Symboles.Add(new SymboleSchema { Id = d.Id, Nature = d.Nature, Genre = d.Genre, X = xs, Y = y, Libelle = d.Libelle, DemiLargeur = DemiSymbole(d) });
                    if (d.Nature == NatureSchema.Renvoi)
                    {
                        // Renvoi : texte à droite de la flèche
                        Textes.Add(new TexteSchema { X = xs + 5.5, Y = y, Texte = TexteRenvoi(d), Taille = Petit });
                        xBord = xs + 5.5 + MiseEnPage.LargeurTexte(TexteRenvoi(d), Petit);
                    }
                    var et = Etiquette(d);
                    if (et != "") Textes.Add(new TexteSchema { X = xs, Y = y + Math.Max(1.4, Haut(d)) + 0.6 + Petit / 2, Texte = et, Taille = Petit, Centre = true });
                    xDebutTrait = xs + DemiSymbole(d);
                    xBord = xs + demi;
                    dernierSymbole = d;
                    premier = false;
                }
                if (cur.Enfants.Count == 0) break;
                var tronc = cur.Enfants.OrderByDescending(e => e.Chaine).ThenBy(e => e.D.Nature == NatureSchema.Renvoi).First();
                foreach (var e in cur.Enfants.Where(e => e != tronc && e.Chaine > 0))
                {
                    // Dérivation depuis un élément « ligne » (rare) : point de départ au bout du trait courant
                    var xa = Significatif(d) ? Symboles[Symboles.Count - 1].X : xDebutTrait;
                    derivations.Add((xa, e, Significatif(d) ? DemiHauteur(d) : 0));
                }
                cur = tronc;
            }
            // Petit bout de trait après une extrémité libre de ligne (chaîne sans symbole final)
            if (xDebutTrait > xBord - 0.01 && dernierSymbole != null && dernierSymbole.Nature == NatureSchema.Ligne) Trait(xDebutTrait, y, xDebutTrait + 6, y, sysTrait);
            // Dérivations : de la plus à droite à la plus à gauche, chacune sur une nouvelle ligne
            foreach (var (xa, e, bas) in derivations.OrderByDescending(t => t.X))
            {
                int l = ++derniere;
                Trait(xa, y - bas, xa, Y(l), e.D.Systeme != "" ? e.D.Systeme : sysTrait);
                Chaine(e, xa, l, ref derniere, dernierSymbole ?? debut.D);
            }
        }

        void Trait(double x1, double y1, double x2, double y2, string sys)
        {
            if (Math.Abs(x1 - x2) < 1e-6 && Math.Abs(y1 - y2) < 1e-6) return;
            Traits.Add(new TraitSchema { X1 = x1, Y1 = y1, X2 = x2, Y2 = y2, Systeme = sys ?? "" });
        }

        void Bornes()
        {
            var xs = new List<double>(); var ys = new List<double>();
            foreach (var t in Traits) { xs.Add(t.X1); xs.Add(t.X2); ys.Add(t.Y1); ys.Add(t.Y2); }
            foreach (var sy in Symboles) { xs.Add(sy.X - sy.DemiLargeur); xs.Add(sy.X + sy.DemiLargeur); ys.Add(sy.Y - 6); ys.Add(sy.Y + 6); }
            foreach (var t in Textes) { xs.Add(t.Centre ? t.X - t.Largeur / 2 : t.X); xs.Add(t.Centre ? t.X + t.Largeur / 2 : t.X + t.Largeur); ys.Add(t.Y - t.Taille); ys.Add(t.Y + t.Taille); }
            if (xs.Count == 0) return;
            X0 = xs.Min(); X1 = xs.Max(); Y0 = ys.Min(); Y1 = ys.Max();
        }

        // ---------- Dessin des symboles (mm papier, centrés sur le point du symbole) ----------

        /// <summary>Traits d'un symbole du schéma ; l'axe de la ligne est horizontal (u vers la droite).</summary>
        public static List<Robinetterie.Segment> Dessin(SymboleSchema s)
        {
            var l = new List<Robinetterie.Segment>();
            void S(double u1, double v1, double u2, double v2) => l.Add(new Robinetterie.Segment(u1, v1, u2, v2));
            void Rect(double u0, double v0, double u1, double v1) { S(u0, v0, u1, v0); S(u1, v0, u1, v1); S(u1, v1, u0, v1); S(u0, v1, u0, v0); }
            void Cercle(double cu, double cv, double r, int n = 20)
            {
                for (int i = 0; i < n; i++)
                {
                    double a1 = 2 * Math.PI * i / n, a2 = 2 * Math.PI * (i + 1) / n;
                    S(cu + r * Math.Cos(a1), cv + r * Math.Sin(a1), cu + r * Math.Cos(a2), cv + r * Math.Sin(a2));
                }
            }
            switch (s.Nature)
            {
                case NatureSchema.Te: Cercle(0, 0, 0.6, 8); break;
                case NatureSchema.Vanne:
                case NatureSchema.Accessoire:
                    if (s.Genre != GenreRobinet.Aucun)
                    {
                        var sym = Robinetterie.Symbole(s.Genre);
                        if (Robinetterie.UnPort(s.Genre)) foreach (var x in sym) S(x.U1 - 3, x.V1, x.U2 - 3, x.V2);
                        else l.AddRange(sym);
                    }
                    else { Rect(-3.5, -2.2, 3.5, 2.2); }
                    break;
                case NatureSchema.Reduction: S(-2, -1.8, 2, -1); S(2, -1, 2, 1); S(2, 1, -2, 1.8); S(-2, 1.8, -2, -1.8); break;
                case NatureSchema.Pompe: Cercle(0, 0, 4); S(-2.8, 2.8, 4, 0); S(4, 0, -2.8, -2.8); break;
                case NatureSchema.Equipement: Rect(-s.DemiLargeur, -5, s.DemiLargeur, 5); break;
                case NatureSchema.Bouche: S(-3, 0, 3, 3); S(3, 3, 3, -3); S(3, -3, -3, 0); break;
                case NatureSchema.Extremite: S(0, -2, 0, 2); break;
                case NatureSchema.Renvoi: S(0, 0, 4, 0); S(4, 0, 2.6, 1.2); S(4, 0, 2.6, -1.2); break;
            }
            return l;
        }

        /// <summary>Libellé écrit dans le cadre d'un équipement.</summary>
        public static string TexteCadre(SymboleSchema s) => s.Nature == NatureSchema.Equipement ? Court(s.Libelle) : "";

        // ---------- SVG (démonstration, vérification) ----------

        public string Svg(string titre = "")
        {
            var inv = CultureInfo.InvariantCulture;
            double m = 10, w = X1 - X0 + 2 * m, h = Y1 - Y0 + 2 * m + (titre != "" ? 8 : 0);
            string X(double x) => (x - X0 + m).ToString("0.##", inv);
            string Yv(double y) => (Y1 - y + m + (titre != "" ? 8 : 0)).ToString("0.##", inv);
            var sb = new StringBuilder();
            sb.Append("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + w.ToString("0.#", inv) + " " + h.ToString("0.#", inv) + "\" font-family=\"Arial, sans-serif\">");
            if (titre != "") sb.Append("<text x=\"" + m + "\" y=\"" + (m + 2) + "\" font-size=\"3.4\" font-weight=\"700\">" + Esc(titre) + "</text>");
            sb.Append("<g stroke=\"#1d2733\" stroke-width=\"0.35\" stroke-linecap=\"round\" fill=\"none\">");
            foreach (var t in Traits) sb.Append("<line x1=\"" + X(t.X1) + "\" y1=\"" + Yv(t.Y1) + "\" x2=\"" + X(t.X2) + "\" y2=\"" + Yv(t.Y2) + "\" stroke-width=\"0.5\"/>");
            foreach (var sy in Symboles)
                foreach (var g in Dessin(sy))
                    sb.Append("<line x1=\"" + X(sy.X + g.U1) + "\" y1=\"" + Yv(sy.Y + g.V1) + "\" x2=\"" + X(sy.X + g.U2) + "\" y2=\"" + Yv(sy.Y + g.V2) + "\"/>");
            sb.Append("</g><g fill=\"#1d2733\">");
            foreach (var sy in Symboles.Where(x => x.Nature == NatureSchema.Te))
                sb.Append("<circle cx=\"" + X(sy.X) + "\" cy=\"" + Yv(sy.Y) + "\" r=\"0.7\"/>");
            foreach (var sy in Symboles.Where(x => x.Nature == NatureSchema.Equipement))
                sb.Append("<text x=\"" + X(sy.X) + "\" y=\"" + Yv(sy.Y - 0.8) + "\" font-size=\"" + Petit.ToString(inv) + "\" font-weight=\"700\" text-anchor=\"middle\">" + Esc(TexteCadre(sy)) + "</text>");
            foreach (var t in Textes)
                sb.Append("<text x=\"" + X(t.X) + "\" y=\"" + Yv(t.Y - t.Taille * 0.35) + "\" font-size=\"" + t.Taille.ToString(inv) + "\"" + (t.Gras ? " font-weight=\"700\"" : "")
                    + (t.Centre ? " text-anchor=\"middle\"" : "") + ">" + Esc(t.Texte) + "</text>");
            sb.Append("</g></svg>");
            return sb.ToString();
        }

        static string Esc(string s) => (s ?? "").Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");
    }
}
