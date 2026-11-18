// Spools d'exemple construits comme le ferait la maquette Revit (tubes, coudes 3D, tés, brides à collerette,
// vanne entre brides, réduction), analysés par le cœur de calcul du complément, exportés en JSON pour la démo web.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Encodings.Web;
using System.Text.Json;
using PipeFit.Isometries.Core;

sealed class Ligne
{
    readonly Spool s; readonly string sys, mat;
    static int n;
    public Point3 Noeud, Pos, Dir; public double Dn;
    public Composant Ouvert; public int Bout;

    public Ligne(Spool s, string sys, string mat) { this.s = s; this.sys = sys; this.mat = mat; }

    // Système de canalisation (type de système Revit) des réseaux d'exemple
    static string TypeSys(string sys) => sys.StartsWith("NEP") ? "NEP aller" : sys.StartsWith("PROC") ? "Process retour" : "Eau glacée départ";

    static double Coude(double dn) => dn <= 25 ? 38 : dn <= 50 ? 76 : dn <= 80 ? 114 : 152;
    static double Te(double dn) => dn <= 25 ? 38 : dn <= 50 ? 64 : dn <= 80 ? 86 : 105;
    static double Bride(double dn) => dn <= 25 ? 54 : dn <= 50 ? 62 : dn <= 80 ? 68 : 75;

    Composant Ajouter(string fam, string type, double dn, Point3? centre, double lg, params (Point3 p, Point3 d, double dn)[] bouts)
    {
        var c = new Composant { Id = "E" + (++n), Famille = fam, TypeNom = type, DnMm = dn, Centre = centre, LongueurMm = lg, Systeme = sys, TypeSysteme = TypeSys(sys),
            Materiau = fam == "Tuyau" ? mat : "", Taille = dn + " mm" };
        foreach (var b in bouts) c.Extremites.Add(new Extremite { Position = b.p, Direction = b.d, DnMm = b.dn });
        s.Composants.Add(c);
        return c;
    }

    void Relier(Composant c, int i)
    {
        if (Ouvert != null) { Ouvert.Extremites[Bout].ConnecteA = c.Id; c.Extremites[i].ConnecteA = Ouvert.Id; }
    }

    void Droit(string fam, string type, double lg, double dn2 = 0)
    {
        if (lg < 1) return;
        var a = Pos; var b = Pos + Dir * lg;
        var c = Ajouter(fam, type, Math.Max(Dn, dn2), null, fam == "Tuyau" ? lg : 0, (a, Dir * -1, Dn), (b, Dir, dn2 > 0 ? dn2 : Dn));
        Relier(c, 0); Ouvert = c; Bout = 1; Pos = b;
        if (dn2 > 0) Dn = dn2;
    }

    void Tube(double jusquA) => Droit("Tuyau", mat, jusquA - Noeud.Distance(Pos) <= 0 ? 0 : jusquA - (Pos - Noeud).Dot(Dir));

    public Ligne Depart(Point3 face, Point3 dir, double dn, string exterieur)
    {
        Noeud = face; Pos = face; Dir = dir.Normalise(); Dn = dn;
        var lf = Bride(dn);
        var c = Ajouter("Bride à collerette", "PN16", dn, null, 0, (face, Dir * -1, dn), (face + Dir * lf, Dir, dn));
        c.Extremites[0].ConnecteA = exterieur; Ouvert = c; Bout = 1; Pos = face + Dir * lf;
        return this;
    }

    /// <summary>Écoulement calculé par Revit (réseau raccordé à une pompe ou une CTA) : l'arrivée est connue.</summary>
    public Ligne Arrivee()
    {
        s.Composants[0].Extremites[0].Sens = SensFlux.Entree;
        return this;
    }

    public Ligne Coude(double axe, Point3 nouvelle)
    {
        var a = Coude(Dn); nouvelle = nouvelle.Normalise();
        Tube(axe - a);
        var v = Noeud + Dir * axe;
        var c = Ajouter("Coude - Soudé", "3D", Dn, v, 0, (v - Dir * a, Dir * -1, Dn), (v + nouvelle * a, nouvelle, Dn));
        Relier(c, 0); Ouvert = c; Bout = 1;
        Noeud = v; Dir = nouvelle; Pos = v + nouvelle * a;
        return this;
    }

    public Ligne Te(double axe, Point3 branche, out Ligne derivation)
    {
        var t = Te(Dn); branche = branche.Normalise();
        Tube(axe - t);
        var ctr = Noeud + Dir * axe;
        var c = Ajouter("Té - Soudé", "Égal", Dn, ctr, 0, (ctr - Dir * t, Dir * -1, Dn), (ctr + Dir * t, Dir, Dn), (ctr + branche * t, branche, Dn));
        Relier(c, 0);
        derivation = new Ligne(s, sys, mat) { Noeud = ctr, Dir = branche, Pos = ctr + branche * t, Dn = Dn, Ouvert = c, Bout = 2 };
        Ouvert = c; Bout = 1; Noeud = ctr; Pos = ctr + Dir * t;
        return this;
    }

    public Ligne Reduction(double axe, double dn2)
    {
        Tube(axe);
        Droit("Réduction concentrique", "Soudée", 89, dn2);
        return this;
    }

    public Ligne Vanne(double axe, string fam, double faceAFace, string type = "PN16")
    {
        var lf = Bride(Dn);
        Tube(axe - lf);
        Droit("Bride à collerette", "PN16", lf);
        var a = Pos; var b = Pos + Dir * faceAFace;
        var v = Ajouter(fam, type, Dn, (a + b) * 0.5, 0, (a, Dir * -1, Dn), (b, Dir, Dn));
        v.EstAccessoire = true;
        Relier(v, 0); Ouvert = v; Bout = 1; Pos = b;
        Droit("Bride à collerette", "PN16", lf);
        Noeud = b; // les cotes repartent de la face de la vanne
        return this;
    }

    public void FinBride(double axe, string exterieur)
    {
        var lf = Bride(Dn);
        Tube(axe - lf);
        Droit("Bride à collerette", "PN16", lf);
        Ouvert.Extremites[1].ConnecteA = exterieur;
    }

    /// <summary>Appareil sur piquage (purgeur, manomètre…) au bout d'une dérivation : un seul raccordement.</summary>
    public void Appareil(double axe, string fam, string type)
    {
        Tube(axe);
        var c = Ajouter(fam, type, Dn, null, 0, (Pos, Dir * -1, Dn));
        c.EstAccessoire = true;
        Relier(c, 0); Ouvert = c; Bout = 0;
    }

    public void FinTube(double axe, string exterieur)
    {
        Tube(axe);
        Ouvert.Extremites[1].ConnecteA = exterieur;
    }
}

static class Demo
{
    static Point3 X => new Point3(1, 0, 0); static Point3 Y => new Point3(0, 1, 0); static Point3 Z => new Point3(0, 0, 1);
    static Point3 M(Point3 p) => p * -1;

    static List<Spool> Spools()
    {
        var res = new List<Spool>();

        // SP-101 : NEP aller, inox 316L DN50, piquage d'une branche vers une vanne
        var a = new Spool { Nom = "SP-101" };
        new Ligne(a, "NEP-ALLER", "Inox 316L").Depart(new Point3(0, 0, 0), X, 50, "POMPE-P1").Arrivee()
            .Coude(1200, Z).Coude(900, Y).Te(600, X, out var br).FinBride(1500, "SP-105");
        br.FinBride(450, "VANNE-V12");
        res.Add(a);

        // SP-102 : eau glacée, acier P235GH DN100, vanne papillon entre brides, fin bout de tube (soudure chantier)
        var b = new Spool { Nom = "SP-102" };
        new Ligne(b, "EG-101", "Acier P235GH").Depart(new Point3(0, 0, 0), X, 100, "CTA-01").Arrivee()
            .Coude(2000, Y).Vanne(700, "Vanne papillon", 52).Coude(800, M(Z)).FinTube(1200, "SP-103");
        res.Add(b);

        // SP-104 : essai avec la robinetterie installée par TECNITUB (fiche technique), eau glacée DN100 de la pompe P2 à la
        // CTA-03. La RÉFÉRENCE dans le nom de la FAMILLE donne le symbole (le type ne dit que le DN) (VPI 4648 → papillon, F 3240 → filtre,
        // CB 3448 → clapet, STAF → réglage, V2V → vanne motorisée, DI 7240 → manchon anti-vibratile, FLEXVENT → purgeur)
        var d = new Spool { Nom = "SP-104" };
        new Ligne(d, "EG-104", "Acier P235GH").Depart(new Point3(0, 0, 0), X, 100, "POMPE-P2").Arrivee()
            .Vanne(600, "TECOFI VPI 4648-02", 52, "DN100").Vanne(500, "TECOFI F 3240-EP", 280, "DN100")
            .Vanne(500, "TECOFI CB 3448N", 180, "DN100").Coude(700, Z).Te(500, X, out var brp)
            .Vanne(500, "IMI STAF", 290, "DN100").Coude(700, Y)
            .Vanne(500, "SIEMENS V2V COMBINEE", 250, "DN100").Vanne(500, "TECOFI DI 7240N", 130, "DN100").FinBride(500, "CTA-03");
        brp.Appareil(250, "FLAMCO FLEXVENT SUPER R7", "DN15");
        // Cote ajoutée à la main (bouton « Ajouter une cote ») : axe du clapet → axe de la vanne de réglage STAF
        var clapet = d.Composants.First(c => c.Famille == "TECOFI CB 3448N");
        var staf = d.Composants.First(c => c.Famille == "IMI STAF");
        clapet.CotesAjoutees.Add(new CoteAjoutee { AttacheA = "axe", IdB = staf.Id, AttacheB = "axe" });
        res.Add(d);

        // SP-105 : évacuation des condensats en pente à 1 % (acier galvanisé DN50), descente en chute verticale
        var ev = new Spool { Nom = "SP-105" };
        new Ligne(ev, "EU-105", "Acier galvanisé").Depart(new Point3(0, 0, 0), new Point3(1, 0, -0.01), 50, "CTA-03")
            .Coude(1800, new Point3(0, 1, -0.01)).Coude(1500, M(Z)).FinTube(900, "COLONNE-EU");
        res.Add(ev);

        // SP-103 : retour process DN80 réduit en DN50
        var c = new Spool { Nom = "SP-103" };
        new Ligne(c, "PROC-R", "Inox 304L").Depart(new Point3(0, 0, 0), Y, 80, "SP-102")
            .Reduction(600, 50).Coude(1100, Z).Coude(500, M(X)).FinBride(750, "BAC-T2");
        res.Add(c);

        // Noms des éléments raccordés, comme le complément les lit dans la maquette (numéro de spool ou repère d'équipement)
        var noms = new Dictionary<string, string> { ["POMPE-P2"] = "P2 (pompe)", ["CTA-03"] = "CTA-03", ["POMPE-P1"] = "P1 (pompe NEP)", ["VANNE-V12"] = "V12 (vanne)", ["CTA-01"] = "CTA-01", ["BAC-T2"] = "T2 (bac)" };
        foreach (var s in res)
            foreach (var id in s.Composants.SelectMany(c => c.Extremites).Select(e => e.ConnecteA).Where(i => i != null && !s.Composants.Any(c => c.Id == i)).Distinct())
            {
                s.NomsExterieurs[id] = noms.TryGetValue(id, out var nom) ? nom : id;
                if (id.StartsWith("SP-")) s.ExterieursSpool.Add(id);
            }
        // Surlongueur de 100 mm laissée sur les tubes aux soudures chantier, à recouper sur place
        foreach (var s in res) { s.SurlongueurMm = 100; AnalyseSpool.Analyser(s); }
        return res;
    }

    // Réseau complet pour la vue de repérage : eau glacée départ DN100 de la CTA-02 au ballon B1, piquage vers l'aérotherme A1,
    // découpé automatiquement en spools (6 m de tube moins deux surlongueurs de 100 mm), numéroté EGD-SP-001…
    static List<Spool> Reseau()
    {
        var tmp = new Spool { Nom = "réseau" };
        new Ligne(tmp, "EG départ", "Acier P235GH").Depart(new Point3(0, 0, 0), X, 100, "CTA-02")
            .Coude(4500, Y).Te(4200, Z, out var br).Coude(5200, X).Coude(3800, M(Y)).FinBride(2600, "BALLON-B1");
        br.Coude(1500, X).FinBride(2600, "AERO-A1");
        tmp.Composants[0].Extremites[0].Sens = SensFlux.Entree;
        foreach (var c in tmp.Composants) c.Abreviation = "EGD";
        var groupes = Decoupage.Spools(tmp.Composants, 6000 - 2 * 100);
        var spoolDe = new Dictionary<string, string>();
        var noms = new List<string>();
        for (int i = 0; i < groupes.Count; i++)
        {
            var nom = Decoupage.Format(Decoupage.Prefixe("SP-", "EGD"), i + 1, 3);
            noms.Add(nom);
            foreach (var c in groupes[i]) spoolDe[c.Id] = nom;
        }
        var noms2 = new Dictionary<string, string> { ["CTA-02"] = "CTA-02", ["BALLON-B1"] = "B1 (ballon)", ["AERO-A1"] = "A1 (aérotherme)" };
        var res = new List<Spool>();
        for (int i = 0; i < groupes.Count; i++)
        {
            var s = new Spool { Nom = noms[i], Composants = groupes[i], SurlongueurMm = 100 };
            foreach (var e in s.Composants.SelectMany(c => c.Extremites).Where(e => e.ConnecteA != null && !s.Composants.Any(c => c.Id == e.ConnecteA)))
            {
                if (spoolDe.TryGetValue(e.ConnecteA, out var autre)) { s.NomsExterieurs[e.ConnecteA] = autre; s.ExterieursSpool.Add(e.ConnecteA); }
                else s.NomsExterieurs[e.ConnecteA] = noms2.TryGetValue(e.ConnecteA, out var n) ? n : e.ConnecteA;
                var voisin = tmp.Composants.FirstOrDefault(c => c.Id == e.ConnecteA);
                e.VoisinEstTube = voisin != null && voisin.Type == TypeComposant.Tube;
            }
            AnalyseSpool.Analyser(s);
            res.Add(s);
        }
        // Le système est découpé en spools, regroupés en ensembles de montage de 3 spools dans l'ordre de montage
        foreach (var kv in Montage.EnsemblesAuto(res, 3)) kv.Key.Ensemble = kv.Value;
        return res;
    }

    static object Reperage()
    {
        var spools = Reseau();
        var etapes = Montage.Ordonner(spools);
        string[] coul = { "bleu", "orange", "vert", "rouge", "violet", "turquoise", "marron", "rose", "olive", "marine", "or", "gris-bleu" };
        var groupesEns = Montage.Grouper(spools, Montage.Regroupement.Ensemble).Select(g =>
        {
            var et = Montage.Ordonner(g.Spools);
            return new
            {
                nom = g.Nom,
                ordre = et.Select(e => new { spool = e.Spool.Nom, ordre = e.Ordre, couleur = (e.Ordre - 1) % coul.Length }),
                tableau = Montage.Tableau(et, x => coul[(et.First(e => e.Spool == x).Ordre - 1) % coul.Length], x => "ISO-" + x.Nom).Lignes,
            };
        }).ToList();
        string[] couleurs = { "bleu", "orange", "vert", "rouge", "violet", "turquoise", "marron", "rose", "olive", "marine", "or", "gris-bleu" };
        var idx = new Dictionary<Spool, int>();
        for (int i = 0; i < etapes.Count; i++) idx[etapes[i].Spool] = i % couleurs.Length;
        var vus = new HashSet<string>();
        var soudures = spools.SelectMany(s => s.Assemblages).Where(a => a.Nature == NatureAssemblage.RaccordementChantier && a.Soude)
            .Where(a => vus.Add(Math.Round(a.Position.X) + "|" + Math.Round(a.Position.Y) + "|" + Math.Round(a.Position.Z))).Select(a => P(a.Position)).ToList();
        return new
        {
            groupes = groupesEns,
            spools = etapes.Select(e => new
            {
                nom = e.Spool.Nom, ordre = e.Ordre, couleur = idx[e.Spool], ensemble = e.Spool.Ensemble,
                segments = e.Spool.Composants.SelectMany(c => Cotation.EstNoeud(c)
                    ? c.Extremites.Select(x => new[] { P(x.Position), P(Cotation.PointAxe(c)) })
                    : c.Extremites.Count >= 2 ? new[] { new[] { P(c.Extremites[0].Position), P(c.Extremites[1].Position) } } : new double[0][][]).ToList(),
                label = P(e.Spool.Composants.Where(c => c.Type == TypeComposant.Tube).OrderByDescending(c => c.LongueurMm)
                    .Select(c => (c.Extremites[0].Position + c.Extremites[1].Position) * 0.5).DefaultIfEmpty(e.Spool.Composants[0].Extremites[0].Position).First()),
                dir = e.Spool.Composants.Where(c => c.Type == TypeComposant.Tube).OrderByDescending(c => c.LongueurMm)
                    .Select(c => P((c.Extremites[1].Position - c.Extremites[0].Position).Normalise())).FirstOrDefault(),
            }),
            soudures,
            tableau = Montage.Tableau(etapes, s => couleurs[idx[s]], s => "ISO-" + s.Nom).Lignes,
            colonnes = Montage.Tableau(etapes, s => "", s => "").Colonnes.Select(c => c.Titre),
            nbSpools = spools.Count,
            tube = Math.Round(spools.Sum(s => Decoupage.LongueurTube(s.Composants)) / 1000, 1),
        };
    }

    static double[] P(Point3 p) => new[] { Math.Round(p.X, 1), Math.Round(p.Y, 1), Math.Round(p.Z, 1) };

    /// <summary>Réseau d'essai : groupe froid → pompe → collecteur → CTA et 2 ventilo-convecteurs, retour en boucle ; réseau de gaines.</summary>
    static (List<NoeudSchema> Noeuds, List<(string, string)> Liens) ReseauPid()
    {
        var n = new List<NoeudSchema>(); var l = new List<(string, string)>();
        int k = 0;
        NoeudSchema A(NatureSchema nat, string lib = "", GenreRobinet g = GenreRobinet.Aucun, string dim = "DN100", string sys = "EG-D", bool src = false)
        { var x = new NoeudSchema { Id = "n" + (++k), Nature = nat, Libelle = lib, Genre = g, Dimension = dim, DnMm = double.Parse(dim.Replace("DN", "").Replace("Ø", "").Split('×')[0]), Systeme = sys, Source = src, Retour = sys.EndsWith("-R") }; n.Add(x); return x; }
        void Lier(params NoeudSchema[] ch) { for (int i = 0; i + 1 < ch.Length; i++) l.Add((ch[i].Id, ch[i + 1].Id)); }
        NoeudSchema T(string dim = "DN100", string sys = "EG-D") => A(NatureSchema.Ligne, "", GenreRobinet.Aucun, dim, sys);
        var gf = A(NatureSchema.Equipement, "GF-01 Groupe froid", src: true, dim: "DN125");
        var v1 = A(NatureSchema.Vanne, "V1", GenreRobinet.Papillon); var p1 = A(NatureSchema.Pompe, "P1"); var c1 = A(NatureSchema.Vanne, "CL1", GenreRobinet.Clapet);
        var f1 = A(NatureSchema.Vanne, "F1", GenreRobinet.Filtre);
        var t1 = A(NatureSchema.Te); var t2 = A(NatureSchema.Te);
        var cta = A(NatureSchema.Equipement, "CTA-01 batterie froide", dim: "DN80");
        var r1 = A(NatureSchema.Vanne, "STAF-1", GenreRobinet.Reglage, "DN32"); var vc1 = A(NatureSchema.Equipement, "VC-01", dim: "DN32");
        var r2 = A(NatureSchema.Vanne, "V2V-2", GenreRobinet.Motorisee, "DN32"); var vc2 = A(NatureSchema.Equipement, "VC-02", dim: "DN32");
        var red = A(NatureSchema.Reduction, "", dim: "DN80");
        var pu = A(NatureSchema.Vanne, "PU", GenreRobinet.Purgeur, "DN15");
        Lier(gf, T("DN125"), v1, T(), f1, T(), p1, T(), c1, T(), t1, T(), t2, T(), red, T("DN80"), cta);
        Lier(t1, T("DN32"), r1, T("DN32"), vc1);
        Lier(t2, T("DN32"), r2, T("DN32"), vc2);
        Lier(t2, T("DN15"), pu);
        var pi = A(NatureSchema.Vanne, "PI-1", GenreRobinet.Manometre, "DN15"); var ti = A(NatureSchema.Vanne, "TI-1", GenreRobinet.Thermometre, "DN15", "EG-R");
        Lier(t1, T("DN15"), pi);
        Lier(cta, T("DN15", "EG-R"), ti);
        // Retour
        var t3 = A(NatureSchema.Te, sys: "EG-R"); var t4 = A(NatureSchema.Te, sys: "EG-R"); var vr = A(NatureSchema.Vanne, "V3", GenreRobinet.Papillon, sys: "EG-R");
        Lier(cta, T("DN80", "EG-R"), t3, T("DN100", "EG-R"), t4, T("DN100", "EG-R"), vr, T("DN125", "EG-R"), gf);
        Lier(vc1, T("DN32", "EG-R"), t4);
        Lier(vc2, T("DN32", "EG-R"), t3);
        // Gaines : CTA → soufflage → 3 bouches, avec registre et coupe-feu
        var ctaAir = A(NatureSchema.Equipement, "CTA-01 soufflage", dim: "Ø500", sys: "SOUF", src: true);
        var ta = A(NatureSchema.Te, dim: "Ø500", sys: "SOUF"); var tb = A(NatureSchema.Te, dim: "Ø400", sys: "SOUF");
        var cf = A(NatureSchema.Accessoire, "CF", dim: "Ø500", sys: "SOUF"); var reg = A(NatureSchema.Accessoire, "R1", dim: "Ø250", sys: "SOUF");
        var b1 = A(NatureSchema.Bouche, "B1", dim: "Ø200", sys: "SOUF"); var b2 = A(NatureSchema.Bouche, "B2", dim: "Ø200", sys: "SOUF"); var b3 = A(NatureSchema.Bouche, "B3", dim: "Ø200", sys: "SOUF");
        Lier(ctaAir, T("Ø500", "SOUF"), cf, T("Ø500", "SOUF"), ta, T("Ø400", "SOUF"), tb, T("Ø250", "SOUF"), b1);
        Lier(ta, T("Ø250", "SOUF"), reg, T("Ø250", "SOUF"), b2);
        Lier(tb, T("Ø200", "SOUF"), b3);
        return (n, l);
    }

    static int Main(string[] args)
    {
        var spools = Spools();
        var date = "15/11/2026";
        var sortie = spools.Select(s =>
        {
            var tabs = MiseEnPage.Tableaux(s, "Démonstration Pipe-Fit", date);
            var page = MiseEnPage.Ranger(new Rect(15, 50, 405, 282), tabs, 5);
            // Légende des symboles présents, en bande sous le dessin (comme le complément)
            var leg = Legende.Compacte(Legende.Pour(s));
            var hLeg = leg.Hauteur(5);
            page.Tableaux.Add(new Placement { Tableau = leg, X = 15, Y = 15 + 8 + hLeg });
            var basVue = 15 + 8 + hLeg + 3;
            return new
            {
                nom = s.Nom, systeme = s.Systeme, materiau = s.Materiau, dnMax = s.DnMax, longueur = Math.Round(s.LongueurDeveloppeeMm),
                symBride = SymboleBride.Dessin().Select(x => new[] { x.U1, x.V1, x.U2, x.V2 }),
                composants = s.Composants.Select(c => new
                {
                    id = c.Id, type = c.Type.ToString(), designation = c.Designation, repere = c.Repere, dn = c.DnMm, genre = c.Genre.ToString(),
                    sym = Robinetterie.Symbolise(c) ? Robinetterie.Symbole(c.Genre).Select(x => new[] { x.U1, x.V1, x.U2, x.V2 }) : null,
                    o = c.Genre != GenreRobinet.Aucun ? Robinetterie.Ordre(c).Select(x => P(x.Position)) : null,
                    // Appareil sur piquage : axe vers l'appareil (sens inverse de son connecteur)
                    dirp = Robinetterie.Symbolise(c) && c.Extremites.Count == 1 && c.Extremites[0].Direction.HasValue ? P(c.Extremites[0].Direction.Value * -1) : null,
                    axe = Cotation.EstNoeud(c) ? P(Cotation.PointAxe(c)) : null,
                    pente = c.TextePente, bas = c.PentePourcent > 0 ? P(c.Extremites[c.BasIndex].Position) : null,
                    // Bride : face de joint, côté soudé et symbole collet + bride tournante (u = 0 à la face)
                    bride = SymboleBride.Dessinee(c) ? new { f = P(SymboleBride.Faces(c, s).Face.Position), s = P(SymboleBride.Faces(c, s).Soudure.Position) } : null,
                    ext = c.Extremites.Select(e => new { p = P(e.Position), dn = e.DnMm, ext = e.ConnecteA != null && !s.Composants.Any(x => x.Id == e.ConnecteA) ? e.ConnecteA : null }),
                }),
                liaisons = s.Liaisons.Select(l => new { n = l.Numero, entree = l.Sens == SensFlux.Entree, texte = l.Libelle, sens = l.SensTexte,
                    a = l.RaccordeA, spool = l.AutreSpool, connu = l.SensConnu, p = P(l.Position), d = l.Direction.HasValue ? P(l.Direction.Value) : null, dn = l.DnMm }),
                cotes = s.Cotes.Select(c => new { a = P(c.A), b = P(c.B), v = c.Valeur, l = c.Libelle + (c.Ajoutee ? " (cote ajoutée)" : ""), aj = c.Ajoutee }),
                assemblages = s.Assemblages.Select(x => new { n = x.Numero, nature = x.Nature.ToString(), p = P(x.Position), dn = x.DnMm, pd = x.PoucesDiametre, s = x.SurlongueurMm }),
                tableaux = page.Tableaux.Select(pl => new
                {
                    x = pl.X, y = pl.Y, titre = pl.Tableau.Titre, il = pl.Tableau.Interligne,
                    colonnes = pl.Tableau.Colonnes.Select(k => new { t = k.Titre, w = k.LargeurMm, d = k.Droite }),
                    lignes = pl.Tableau.Lignes,
                }),
                zoneVue = new[] { page.ZoneVue.X0, basVue, page.ZoneVue.X1, 282.0 },
                soudures = s.Nombre(NatureAssemblage.Soudure), pouces = s.PoucesDiametre(NatureAssemblage.Soudure),
                pcf = ExportPcf.Generer(s, "Demonstration Pipe-Fit"),
                csv = ExportCsv.Nomenclature(new[] { s }),
                quantitatif = Quantitatif.Csv(new[] { s }),
            };
        });
        // Légende : dessins des symboles, définis dans le cœur du complément
        var legende = Legende.Toutes().Select(t =>
        {
            var d = Legende.Dessin(t.Code);
            return new { code = t.Code, libelle = t.Libelle, soudure = d.Soudure, traits = d.Traits.Select(x => new[] { x.U1, x.V1, x.U2, x.V2 }), textes = d.Textes.Select(x => new object[] { x.U, x.V, x.Texte, x.Gras }) };
        });
        // Liste de débit de l'atelier, tous spools d'exemple : par système de canalisation, DN, matière ; barres de 6 m
        var listeDebit = ListeDebit.Calculer(spools).Select(l => new { sys = l.Systeme, dn = l.DnMm, mat = l.Materiau, spool = l.Spool, rep = l.Repere, revit = l.LongueurRevitMm, surl = l.SurlongueurMm, coupe = l.CoupeMm, barre = l.Barre });
        var (pn, pl) = ReseauPid();
        var schemaPid = Schema.Construire(pn, pl); schemaPid.AjouterLegende();
        var pid = schemaPid.Svg();
        var json = JsonSerializer.Serialize(new { spools = sortie, reperage = Reperage(), legende, listeDebit, pid }, new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
        File.WriteAllText(args.Length > 0 ? args[0] : "demo.json", json);
        if (args.Length > 1) File.WriteAllText(args[1], Quantitatif.Csv(spools)); // exemple de quantitatif pour la démo du CRM
        if (args.Length > 2) File.WriteAllBytes(args[2], ExportExcel.Quantites(spools, "Démonstration Pipe-Fit", new DateTime(2026, 11, 18, 9, 0, 0))); // classeur Excel des quantités
        foreach (var e in Montage.Ordonner(Reseau()))
            Console.WriteLine($"{e.Ordre}. {e.Spool.Nom} contre {e.PoseContre} : {Decoupage.LongueurTube(e.Spool.Composants) / 1000:0.00} m, voisins {string.Join(",", e.Voisins)}");
        return 0;
    }
}
