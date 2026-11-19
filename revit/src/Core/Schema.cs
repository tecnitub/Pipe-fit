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

    /// <summary>Catégorie Revit d'un élément pour le schéma.</summary>
    public enum CategorieSchema { Ligne, Raccord, Accessoire, AccessoireGaine, Bouche, Equipement }

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
        /// <summary>Renvoi : élément où la ligne revient (boucle aller / retour), relié par un tracé.</summary>
        public string Cible = "";
    }

    public sealed class TraitSchema { public double X1, Y1, X2, Y2; public string Systeme = ""; public bool Liaison; }
    public sealed class SymboleSchema { public string Id = ""; public NatureSchema Nature; public GenreRobinet Genre; public double X, Y, Dx = 1, Dy; public string Libelle = ""; public double DemiLargeur; public string Cible = ""; }
    public sealed class TexteSchema { public double X, Y; public string Texte = ""; public double Taille = 2.5; public bool Gras, Centre; public double Largeur => MiseEnPage.LargeurTexte(Texte, Taille, Gras); }

    public sealed class Schema
    {
        public List<TraitSchema> Traits = new List<TraitSchema>();
        public List<SymboleSchema> Symboles = new List<SymboleSchema>();
        public List<TexteSchema> Textes = new List<TexteSchema>();
        public double X0, Y0, X1, Y1;
        public int Reseaux;
        /// <summary>Systèmes de retour (style de trait en démonstration ; dans Revit, le style vient du type de système).</summary>
        public HashSet<string> SystemesRetour = new HashSet<string>();
        /// <summary>Espace laissé de part et d'autre d'un croisement, sur la ligne qui passe (mm).</summary>
        public const double Saut = 1.3;

        public const double PasLigne = 18, Ecart = 6, Hauteur = 2.5, Petit = 2.0;

        // ---------- Symbole d'après le nom de la famille (même règle que les isométries) ----------

        public static readonly System.Text.RegularExpressions.Regex Pompe = new System.Text.RegularExpressions.Regex(@"pompe|pump|circulateur|surpresseur");
        public static readonly System.Text.RegularExpressions.Regex Source = new System.Text.RegularExpressions.Regex(
            @"groupe (froid|de production)|chiller|refroidisseur|chaudi|boiler|\bpac\b|chaleur|heat ?pump|production|thermofrigopompe|\btfp\b|sous.?station|\bcta\b|centrale (de traitement|double flux)|caisson|extracteur|ventilateur|rooftop|air handling|\bahu\b|\bvmc\b");

        /// <summary>
        /// Nature et genre d'un élément d'après le seul NOM DE SA FAMILLE (le nom du type n'est pas lu), comme les isométries :
        /// accessoire → vanne du genre reconnu (correspondances « Symboles… » comprises) ou raccord si la famille le dit
        /// (bride, réduction, té…) ; raccord → vanne si sa famille nomme une robinetterie, réduction ou té d'après le nom,
        /// sinon « parDefaut » (type de pièce Revit) ; équipement → pompe, source (production, CTA) ou vanne d'après le nom.
        /// </summary>
        public static (NatureSchema Nature, GenreRobinet Genre, bool Source) Classer(CategorieSchema cat, string famille, NatureSchema parDefaut = NatureSchema.Ligne)
        {
            var n = AnalyseSpool.Normaliser(famille);
            NatureSchema DepuisRaccord(TypeComposant t) => t == TypeComposant.Reduction ? NatureSchema.Reduction
                : t == TypeComposant.Te || t == TypeComposant.Croix || t == TypeComposant.Piquage ? NatureSchema.Te : NatureSchema.Ligne;
            switch (cat)
            {
                case CategorieSchema.Accessoire:
                    {
                        var r = Robinetterie.Raccord(famille);
                        if (r != null) return (DepuisRaccord(r.Value), GenreRobinet.Aucun, false);
                        return (NatureSchema.Vanne, Robinetterie.Genre(new Composant { Famille = famille ?? "", EstAccessoire = true }), false);
                    }
                case CategorieSchema.Raccord:
                    {
                        var choisi = Robinetterie.Correspondances.TryGetValue(Robinetterie.Cle(famille), out var c) ? c : GenreRobinet.Aucun;
                        var g = choisi != GenreRobinet.Aucun ? choisi : Robinetterie.ParMots(famille);
                        if (g != GenreRobinet.Aucun) return (NatureSchema.Vanne, g, false);
                        if (System.Text.RegularExpressions.Regex.IsMatch(n, @"reduc|reducer|transition|cone")) return (NatureSchema.Reduction, GenreRobinet.Aucun, false);
                        if (System.Text.RegularExpressions.Regex.IsMatch(n, @"\b(te|tee|tes)\b|croix|cross|culotte|wye|piquage|olet\b|\btap\b")) return (NatureSchema.Te, GenreRobinet.Aucun, false);
                        return (parDefaut, GenreRobinet.Aucun, false);
                    }
                case CategorieSchema.AccessoireGaine: return (NatureSchema.Accessoire, GenreRobinet.Aucun, false);
                case CategorieSchema.Bouche: return (NatureSchema.Bouche, GenreRobinet.Aucun, false);
                case CategorieSchema.Equipement:
                    {
                        if (Pompe.IsMatch(n)) return (NatureSchema.Pompe, GenreRobinet.Aucun, false);
                        if (Source.IsMatch(n)) return (NatureSchema.Equipement, GenreRobinet.Aucun, true);
                        // Robinetterie dessinée en équipement (vanne motorisée, filtre, compteur…) : son symbole
                        var g = Robinetterie.ParMots(famille);
                        if (g != GenreRobinet.Aucun && g != GenreRobinet.Compensateur && g != GenreRobinet.Purgeur) return (NatureSchema.Vanne, g, false);
                        return (NatureSchema.Equipement, GenreRobinet.Aucun, false);
                    }
                default: return (NatureSchema.Ligne, GenreRobinet.Aucun, false);
            }
        }

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
                case NatureSchema.Vanne when n.Genre == GenreRobinet.Manometre || n.Genre == GenreRobinet.Thermometre: return 6;
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
                int s0 = s.Symboles.Count, t0 = s.Traits.Count, x0 = s.Textes.Count;
                s.Chaine(arbre, 0, ligne, ref ligne, null);
                s.Relier(s0, t0, x0, ref ligne);
                ligne++;
            }
            foreach (var n in parId.Values) if (n.Retour && n.Systeme != "") s.SystemesRetour.Add(n.Systeme);
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
            foreach (var (rn, c) in renvois) rn.D.Cible = c;
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
                    Symboles.Add(new SymboleSchema { Id = d.Id, Nature = d.Nature, Genre = d.Genre, X = xs, Y = y, Libelle = d.Libelle, DemiLargeur = DemiSymbole(d), Cible = d.Cible });
                    if (d.Nature == NatureSchema.Renvoi) xBord = xs + 4; // relié ensuite par un tracé (texte « vers … » à défaut)
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

        // ---------- Liaisons de retour (boucles) ----------

        (double X0, double Y0, double X1, double Y1) Boite(SymboleSchema sy)
        {
            var d = Dessin(sy);
            if (d.Count == 0) return (sy.X, sy.Y, sy.X, sy.Y);
            return (sy.X + d.Min(g => Math.Min(g.U1, g.U2)), sy.Y + d.Min(g => Math.Min(g.V1, g.V2)), sy.X + d.Max(g => Math.Max(g.U1, g.U2)), sy.Y + d.Max(g => Math.Max(g.V1, g.V2)));
        }

        static (double X0, double Y0, double X1, double Y1) Boite(TexteSchema t) =>
            (t.Centre ? t.X - t.Largeur / 2 : t.X, t.Y - t.Taille / 2 - 0.3, t.Centre ? t.X + t.Largeur / 2 : t.X + t.Largeur, t.Y + t.Taille / 2 + 0.3);

        /// <summary>
        /// Chaque renvoi d'un réseau devient un tracé orthogonal jusqu'à sa cible (bas ou haut du cadre d'un équipement, té).
        /// Plusieurs tracés sont essayés (passage juste sous ou au-dessus des lignes concernées, plus loin, plusieurs abscisses
        /// de départ et d'arrivée) : on garde celui qui ne traverse ni symbole ni texte, ne longe aucun trait, croise le moins
        /// de lignes et reste le plus court. Là où il croise une ligne, le tracé est interrompu (espace de lecture).
        /// </summary>
        void Relier(int s0, int t0, int x0, ref int ligne)
        {
            var renvois = Symboles.Skip(s0).Where(r => r.Nature == NatureSchema.Renvoi).ToList();
            if (renvois.Count == 0) return;
            var obstacles = Symboles.Skip(s0).Where(z => z.Nature != NatureSchema.Te && z.Nature != NatureSchema.Renvoi).Select(z => (Sym: z, B: Boite(z))).ToList();
            var textes = Textes.Skip(x0).Select(Boite).ToList();
            double yBas = new[] { Traits.Skip(t0).Select(t => Math.Min(t.Y1, t.Y2)).DefaultIfEmpty(0).Min(), obstacles.Select(o => o.B.Y0).DefaultIfEmpty(0).Min(),
                textes.Select(t => t.Y0).DefaultIfEmpty(0).Min() }.Min();
            double yHaut = new[] { Traits.Skip(t0).Select(t => Math.Max(t.Y1, t.Y2)).DefaultIfEmpty(0).Max(), obstacles.Select(o => o.B.Y1).DefaultIfEmpty(0).Max() }.Max();
            var liaisons = new List<TraitSchema>();

            bool Bloque((double x1, double y1, double x2, double y2) g, SymboleSchema sauf)
            {
                double ax = Math.Min(g.x1, g.x2), bx = Math.Max(g.x1, g.x2), ay = Math.Min(g.y1, g.y2), by = Math.Max(g.y1, g.y2);
                bool h = by - ay < 1e-6;
                foreach (var o in obstacles)
                    if (o.Sym != sauf && bx > o.B.X0 - 0.6 && ax < o.B.X1 + 0.6 && by > o.B.Y0 - 0.6 && ay < o.B.Y1 + 0.6) return true;
                foreach (var t in textes)
                    if (bx > t.X0 - 0.4 && ax < t.X1 + 0.4 && by > t.Y0 - 0.2 && ay < t.Y1 + 0.2) return true;
                // Pas de trait confondu ni trop proche en parallèle
                foreach (var t in Traits.Concat(liaisons))
                {
                    bool th = Math.Abs(t.Y1 - t.Y2) < 1e-6;
                    if (th != h) continue;
                    if (h && Math.Abs(t.Y1 - ay) < 1.0 && Math.Max(t.X1, t.X2) > ax + 0.01 && Math.Min(t.X1, t.X2) < bx - 0.01) return true;
                    if (!h && Math.Abs(t.X1 - ax) < 1.0 && Math.Max(t.Y1, t.Y2) > ay + 0.01 && Math.Min(t.Y1, t.Y2) < by - 0.01) return true;
                }
                return false;
            }
            int Croisements((double x1, double y1, double x2, double y2) g)
            {
                bool h = Math.Abs(g.y1 - g.y2) < 1e-6; int n = 0;
                double a = h ? Math.Min(g.x1, g.x2) : Math.Min(g.y1, g.y2), b = h ? Math.Max(g.x1, g.x2) : Math.Max(g.y1, g.y2), f = h ? g.y1 : g.x1;
                foreach (var t in Traits.Concat(liaisons))
                {
                    bool th = Math.Abs(t.Y1 - t.Y2) < 1e-6;
                    if (th == h) continue;
                    double ta = th ? Math.Min(t.X1, t.X2) : Math.Min(t.Y1, t.Y2), tb = th ? Math.Max(t.X1, t.X2) : Math.Max(t.Y1, t.Y2), tf = th ? t.Y1 : t.X1;
                    if (tf > a + 0.05 && tf < b - 0.05 && f > ta + 0.05 && f < tb - 0.05) n++;
                }
                return n;
            }

            var parCible = new Dictionary<string, int>();
            double yMin = yBas;
            foreach (var r in renvois.OrderBy(z => z.Y).ThenByDescending(z => z.X))
            {
                var cible = Symboles.Skip(s0).FirstOrDefault(z => z.Id == r.Cible && z.Nature != NatureSchema.Renvoi);
                if (cible == null) { Textes.Add(new TexteSchema { X = r.X + 5.5, Y = r.Y, Texte = "vers " + Court(r.Libelle), Taille = Petit }); continue; }
                var sys = Traits.Where(t => Math.Abs(t.Y1 - r.Y) < 1e-6 && Math.Abs(t.Y2 - r.Y) < 1e-6 && Math.Abs(Math.Max(t.X1, t.X2) - (r.X - r.DemiLargeur)) < 0.5).Select(t => t.Systeme).FirstOrDefault() ?? "";
                double xs = r.X - r.DemiLargeur, ys = r.Y;
                int n = parCible.TryGetValue(cible.Id, out var k) ? k : 0; parCible[cible.Id] = n + 1;
                // Points d'arrivée : sous ou sur le cadre (équipement, pompe), sous ou sur le té
                var arrivees = new List<(double X, double Y, bool ParDessous)>();
                var abscisses = new List<double>();
                if (cible.Nature == NatureSchema.Equipement)
                    for (double f = 0.5; f > 0.05; f -= 0.1) { abscisses.Add(cible.X + cible.DemiLargeur * f + 1.5 * n); abscisses.Add(cible.X - cible.DemiLargeur * f - 1.5 * n); }
                else for (int i2 = 0; i2 < 9; i2++) abscisses.Add(cible.X + (i2 % 2 == 0 ? 1 : -1) * 2.5 * ((i2 + 1) / 2) + 1.5 * n);
                double haut = cible.Nature == NatureSchema.Equipement ? 5 : cible.Nature == NatureSchema.Pompe ? 4 : cible.Nature == NatureSchema.Te ? 0 : Boite(cible).Y1 - cible.Y;
                double bas = cible.Nature == NatureSchema.Equipement ? 5 : cible.Nature == NatureSchema.Pompe ? 4 : cible.Nature == NatureSchema.Te ? 0 : cible.Y - Boite(cible).Y0;
                foreach (var ax in abscisses) { arrivees.Add((ax, cible.Y - bas, true)); arrivees.Add((ax, cible.Y + haut, false)); }
                // Niveaux de passage : juste sous / au-dessus des deux extrémités, puis plus loin
                var niveauxBas = new List<double>(); var niveauxHaut = new List<double>();
                for (double l = Math.Min(ys, cible.Y - bas) - 7; l >= yBas - 4 - 3 * renvois.Count - 1e-9; l -= 2.5) niveauxBas.Add(l);
                for (double l = Math.Max(ys, cible.Y + haut) + 7; l <= yHaut - 2 + 1e-9; l += 2.5) niveauxHaut.Add(l);
                (double x1, double y1, double x2, double y2)[] meilleur = null; double score = double.MaxValue;
                for (int dxi = 0; dxi < 40 && score > 1e8; dxi++)
                {
                    double xd = xs + 2.5 * dxi;
                    foreach (var (axv, ay, dessous) in arrivees)
                        foreach (var lv in dessous ? niveauxBas : niveauxHaut)
                        {
                            var chemin = new[] { (xs, ys, xd, ys), (xd, ys, xd, lv), (xd, lv, axv, lv), (axv, lv, axv, ay) }
                                .Where(g => Math.Abs(g.Item1 - g.Item3) > 1e-6 || Math.Abs(g.Item2 - g.Item4) > 1e-6).ToArray();
                            bool ok = true; int cr = 0; double lg = 0;
                            for (int gi = 0; gi < chemin.Length && ok; gi++)
                            {
                                var g = chemin[gi];
                                if (Bloque(g, gi == chemin.Length - 1 ? cible : null)) ok = false;
                                cr += Croisements(g); lg += Math.Abs(g.Item1 - g.Item3) + Math.Abs(g.Item2 - g.Item4);
                            }
                            if (!ok) continue;
                            var sc = cr * 60 + lg;
                            if (sc < score) { score = sc; meilleur = chemin; }
                        }
                    if (meilleur != null && dxi >= 6) break;
                }
                if (meilleur == null)
                {
                    // Aucun tracé propre : couloir sous le réseau
                    double yL = yBas - 4 - 3 * liaisons.Count(t => t.Liaison && Math.Abs(t.Y1 - t.Y2) < 1e-6 && t.Y1 < yBas);
                    meilleur = new[] { (xs, ys, xs, yL), (xs, yL, abscisses[0], yL), (abscisses[0], yL, abscisses[0], cible.Y - bas) };
                }
                foreach (var g in meilleur) { liaisons.Add(new TraitSchema { X1 = g.Item1, Y1 = g.Item2, X2 = g.Item3, Y2 = g.Item4, Systeme = sys, Liaison = true }); yMin = Math.Min(yMin, Math.Min(g.Item2, g.Item4)); }
                Symboles.Remove(r);
            }
            // Croisements : la liaison s'interrompt de part et d'autre de la ligne croisée (les liaisons entre elles : la plus récente)
            var poses = new List<TraitSchema>();
            foreach (var l in liaisons)
            {
                bool hz = Math.Abs(l.Y1 - l.Y2) < 1e-6;
                double a = hz ? Math.Min(l.X1, l.X2) : Math.Min(l.Y1, l.Y2), b = hz ? Math.Max(l.X1, l.X2) : Math.Max(l.Y1, l.Y2), fixe = hz ? l.Y1 : l.X1;
                var coupes = new List<double>();
                foreach (var t in Traits.Concat(poses))
                {
                    bool th = Math.Abs(t.Y1 - t.Y2) < 1e-6;
                    if (th == hz) continue;
                    double ta = th ? Math.Min(t.X1, t.X2) : Math.Min(t.Y1, t.Y2), tb = th ? Math.Max(t.X1, t.X2) : Math.Max(t.Y1, t.Y2), tf = th ? t.Y1 : t.X1;
                    if (tf > a + 0.05 && tf < b - 0.05 && fixe > ta + 0.05 && fixe < tb - 0.05) coupes.Add(tf);
                }
                double debut = a;
                foreach (var c in coupes.OrderBy(c => c))
                {
                    if (c - Saut > debut + 0.05) poses.Add(Morceau(hz, fixe, debut, c - Saut, l.Systeme));
                    debut = Math.Max(debut, c + Saut);
                }
                if (b > debut + 0.05) poses.Add(Morceau(hz, fixe, debut, b, l.Systeme));
            }
            Traits.AddRange(poses);
            ligne = Math.Max(ligne, (int)Math.Ceiling(-yMin / PasLigne));
        }

        static TraitSchema Morceau(bool horizontal, double fixe, double a, double b, string sys) =>
            horizontal ? new TraitSchema { X1 = a, Y1 = fixe, X2 = b, Y2 = fixe, Systeme = sys, Liaison = true }
                       : new TraitSchema { X1 = fixe, Y1 = a, X2 = fixe, Y2 = b, Systeme = sys, Liaison = true };

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

        // ---------- Légende ----------

        static string LibelleLegende(SymboleSchema s)
        {
            switch (s.Nature)
            {
                case NatureSchema.Te: return "Piquage / té";
                case NatureSchema.Vanne: return s.Genre == GenreRobinet.Manometre ? "Manomètre (PI)" : s.Genre == GenreRobinet.Thermometre ? "Thermomètre (TI)" : Robinetterie.Libelle(s.Genre) is string l && l != "" ? l : "Vanne";
                case NatureSchema.Accessoire: return "Accessoire de gaine (registre, coupe-feu…)";
                case NatureSchema.Reduction: return "Réduction";
                case NatureSchema.Pompe: return "Pompe";
                case NatureSchema.Equipement: return "Équipement (repère, famille)";
                case NatureSchema.Bouche: return "Bouche d'air";
                case NatureSchema.Extremite: return "Extrémité libre";
                case NatureSchema.Renvoi: return "Renvoi « vers … »";
                default: return "";
            }
        }

        /// <summary>
        /// Légende sous le schéma : chaque symbole présent (une fois) et le style de ligne de chaque système, sur 4 colonnes.
        /// </summary>
        public void AjouterLegende()
        {
            var types = Symboles.GroupBy(s => s.Nature + "|" + (s.Nature == NatureSchema.Vanne || s.Nature == NatureSchema.Accessoire ? s.Genre.ToString() : ""))
                .Select(g => g.First()).Where(s => LibelleLegende(s) != "").OrderBy(s => (int)s.Nature).ThenBy(s => (int)s.Genre).ToList();
            var systemes = Traits.Select(t => t.Systeme).Where(x => x != "").Distinct().OrderBy(x => x, StringComparer.CurrentCultureIgnoreCase).ToList();
            if (types.Count == 0 && systemes.Count == 0) return;
            Bornes();
            double y0 = Y0 - 12, colonne = 72, x0 = X0;
            Textes.Add(new TexteSchema { X = x0, Y = y0, Texte = "LÉGENDE", Taille = Hauteur, Gras = true });
            int i = 0;
            void Case(out double x, out double y) { x = x0 + (i % 4) * colonne; y = y0 - 9 - (i / 4) * 12; i++; }
            foreach (var t in types)
            {
                Case(out var x, out var y);
                var d = new SymboleSchema { Nature = t.Nature, Genre = t.Genre, X = x + 10, Y = y, DemiLargeur = t.Nature == NatureSchema.Equipement ? 7 : t.DemiLargeur, Libelle = t.Nature == NatureSchema.Equipement ? "" : "" };
                if (t.Nature != NatureSchema.Equipement && t.Nature != NatureSchema.Te && t.Nature != NatureSchema.Renvoi && t.Nature != NatureSchema.Extremite)
                { Trait(x, y, x + 10 - d.DemiLargeur, y, ""); if (!(t.Nature == NatureSchema.Vanne && Robinetterie.UnPort(t.Genre)) && t.Nature != NatureSchema.Bouche) Trait(x + 10 + d.DemiLargeur, y, x + 20, y, ""); }
                if (t.Nature == NatureSchema.Te || t.Nature == NatureSchema.Renvoi || t.Nature == NatureSchema.Extremite) Trait(x, y, x + (t.Nature == NatureSchema.Te ? 20 : 10), y, "");
                if (t.Nature == NatureSchema.Equipement) d.Y = y;
                Symboles.Add(d);
                Textes.Add(new TexteSchema { X = x + 23, Y = y, Texte = LibelleLegende(t), Taille = Petit });
            }
            foreach (var sys in systemes)
            {
                Case(out var x, out var y);
                Traits.Add(new TraitSchema { X1 = x, Y1 = y, X2 = x + 20, Y2 = y, Systeme = sys });
                Textes.Add(new TexteSchema { X = x + 23, Y = y, Texte = "Réseau " + sys + (SystemesRetour.Contains(sys) ? " (retour)" : ""), Taille = Petit });
            }
            Bornes();
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
                case NatureSchema.Vanne when s.Genre == GenreRobinet.Manometre || s.Genre == GenreRobinet.Thermometre:
                    // Instrument : bulle normalisée (PI, TI) sur piquage
                    S(-6, 0, -3, 0); Cercle(0, 0, 3, 24);
                    break;
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
        public static string TexteCadre(SymboleSchema s) => s.Nature == NatureSchema.Equipement ? Court(s.Libelle)
            : s.Nature == NatureSchema.Vanne && s.Genre == GenreRobinet.Manometre ? "PI" : s.Nature == NatureSchema.Vanne && s.Genre == GenreRobinet.Thermometre ? "TI" : "";

        // ---------- SVG (démonstration, vérification) ----------

        static readonly string[] Couleurs = { "#1f6fd1", "#d14b1f", "#1b9e5a", "#8a3fd1", "#c79100", "#0f8f9e", "#b8326b", "#5a6b7a" };

        /// <summary>Couleur et pointillé d'un système (démonstration) : une couleur par fluide, le retour en tirets.</summary>
        public (string Couleur, string Tirets) Style(string systeme)
        {
            if (string.IsNullOrEmpty(systeme)) return ("#1d2733", "");
            var fluide = System.Text.RegularExpressions.Regex.Replace(systeme ?? "", @"[-_ ]?(d|r|dep|ret|depart|retour|aller|s|souf|rep|ext)$", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            int h = 0; foreach (var ch in fluide) h = (h * 31 + ch) & 0x7fffffff;
            return (Couleurs[h % Couleurs.Length], SystemesRetour.Contains(systeme ?? "") ? "2.2 1.4" : "");
        }

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
            foreach (var t in Traits)
            {
                var (c, d) = Style(t.Systeme);
                sb.Append("<line x1=\"" + X(t.X1) + "\" y1=\"" + Yv(t.Y1) + "\" x2=\"" + X(t.X2) + "\" y2=\"" + Yv(t.Y2) + "\" stroke=\"" + c + "\" stroke-width=\"0.5\"" + (d != "" ? " stroke-dasharray=\"" + d + "\"" : "") + "/>");
            }
            foreach (var sy in Symboles)
                foreach (var g in Dessin(sy))
                    sb.Append("<line x1=\"" + X(sy.X + g.U1) + "\" y1=\"" + Yv(sy.Y + g.V1) + "\" x2=\"" + X(sy.X + g.U2) + "\" y2=\"" + Yv(sy.Y + g.V2) + "\"/>");
            sb.Append("</g><g fill=\"#1d2733\">");
            foreach (var sy in Symboles.Where(x => x.Nature == NatureSchema.Te))
                sb.Append("<circle cx=\"" + X(sy.X) + "\" cy=\"" + Yv(sy.Y) + "\" r=\"0.7\"/>");
            foreach (var sy in Symboles.Where(x => TexteCadre(x) != ""))
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
