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

    static double Coude(double dn) => dn <= 25 ? 38 : dn <= 50 ? 76 : dn <= 80 ? 114 : 152;
    static double Te(double dn) => dn <= 25 ? 38 : dn <= 50 ? 64 : dn <= 80 ? 86 : 105;
    static double Bride(double dn) => dn <= 25 ? 54 : dn <= 50 ? 62 : dn <= 80 ? 68 : 75;

    Composant Ajouter(string fam, string type, double dn, Point3? centre, double lg, params (Point3 p, Point3 d, double dn)[] bouts)
    {
        var c = new Composant { Id = "E" + (++n), Famille = fam, TypeNom = type, DnMm = dn, Centre = centre, LongueurMm = lg, Systeme = sys,
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

    public Ligne Vanne(double axe, string fam, double faceAFace)
    {
        var lf = Bride(Dn);
        Tube(axe - lf);
        Droit("Bride à collerette", "PN16", lf);
        var a = Pos; var b = Pos + Dir * faceAFace;
        var v = Ajouter(fam, "PN16", Dn, (a + b) * 0.5, 0, (a, Dir * -1, Dn), (b, Dir, Dn));
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

        // SP-103 : retour process DN80 réduit en DN50
        var c = new Spool { Nom = "SP-103" };
        new Ligne(c, "PROC-R", "Inox 304L").Depart(new Point3(0, 0, 0), Y, 80, "SP-102")
            .Reduction(600, 50).Coude(1100, Z).Coude(500, M(X)).FinBride(750, "BAC-T2");
        res.Add(c);

        // Noms des éléments raccordés, comme le complément les lit dans la maquette (numéro de spool ou repère d'équipement)
        var noms = new Dictionary<string, string> { ["POMPE-P1"] = "P1 (pompe NEP)", ["VANNE-V12"] = "V12 (vanne)", ["CTA-01"] = "CTA-01", ["BAC-T2"] = "T2 (bac)" };
        foreach (var s in res)
            foreach (var id in s.Composants.SelectMany(c => c.Extremites).Select(e => e.ConnecteA).Where(i => i != null && !s.Composants.Any(c => c.Id == i)).Distinct())
            {
                s.NomsExterieurs[id] = noms.TryGetValue(id, out var nom) ? nom : id;
                if (id.StartsWith("SP-")) s.ExterieursSpool.Add(id);
            }
        foreach (var s in res) AnalyseSpool.Analyser(s);
        return res;
    }

    static double[] P(Point3 p) => new[] { Math.Round(p.X, 1), Math.Round(p.Y, 1), Math.Round(p.Z, 1) };

    static int Main(string[] args)
    {
        var spools = Spools();
        var date = "15/11/2026";
        var sortie = spools.Select(s =>
        {
            var tabs = MiseEnPage.Tableaux(s, "Démonstration Pipe-Fit", date);
            var page = MiseEnPage.Ranger(new Rect(15, 50, 405, 282), tabs, 5);
            return new
            {
                nom = s.Nom, systeme = s.Systeme, materiau = s.Materiau, dnMax = s.DnMax, longueur = Math.Round(s.LongueurDeveloppeeMm),
                composants = s.Composants.Select(c => new
                {
                    id = c.Id, type = c.Type.ToString(), designation = c.Designation, repere = c.Repere, dn = c.DnMm,
                    axe = Cotation.EstNoeud(c) ? P(Cotation.PointAxe(c)) : null,
                    ext = c.Extremites.Select(e => new { p = P(e.Position), dn = e.DnMm, ext = e.ConnecteA != null && !s.Composants.Any(x => x.Id == e.ConnecteA) ? e.ConnecteA : null }),
                }),
                liaisons = s.Liaisons.Select(l => new { n = l.Numero, entree = l.Sens == SensFlux.Entree, texte = l.Libelle, sens = l.SensTexte,
                    a = l.RaccordeA, spool = l.AutreSpool, connu = l.SensConnu, p = P(l.Position), d = l.Direction.HasValue ? P(l.Direction.Value) : null, dn = l.DnMm }),
                cotes = s.Cotes.Select(c => new { a = P(c.A), b = P(c.B), v = c.Valeur, l = c.Libelle }),
                assemblages = s.Assemblages.Select(x => new { n = x.Numero, nature = x.Nature.ToString(), p = P(x.Position), dn = x.DnMm, pd = x.PoucesDiametre }),
                tableaux = page.Tableaux.Select(pl => new
                {
                    x = pl.X, y = pl.Y, titre = pl.Tableau.Titre,
                    colonnes = pl.Tableau.Colonnes.Select(k => new { t = k.Titre, w = k.LargeurMm, d = k.Droite }),
                    lignes = pl.Tableau.Lignes,
                }),
                zoneVue = new[] { page.ZoneVue.X0, 15.0, page.ZoneVue.X1, 282.0 },
                soudures = s.Nombre(NatureAssemblage.Soudure), pouces = s.PoucesDiametre(NatureAssemblage.Soudure),
                pcf = ExportPcf.Generer(s, "Demonstration Pipe-Fit"),
                csv = ExportCsv.Nomenclature(new[] { s }),
                quantitatif = Quantitatif.Csv(new[] { s }),
            };
        });
        var json = JsonSerializer.Serialize(sortie, new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
        File.WriteAllText(args.Length > 0 ? args[0] : "demo.json", json);
        if (args.Length > 1) File.WriteAllText(args[1], Quantitatif.Csv(spools)); // exemple de quantitatif pour la démo du CRM
        foreach (var s in spools)
            Console.WriteLine($"{s.Nom} : " + string.Join(" | ", s.Liaisons.Select(l => l.Numero + " " + l.Libelle)));
        return 0;
    }
}
