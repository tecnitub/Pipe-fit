using System;
using System.Collections.Generic;
using System.Linq;
using PipeFit.Isometries.Core;

static class Tests
{
    static int echecs, total;

    static void Verifier(bool ok, string message)
    {
        total++;
        if (!ok) { echecs++; Console.WriteLine("ÉCHEC : " + message); }
    }

    static Extremite E(double x, double y, double z, double dn, string vers) =>
        new Extremite { Position = new Point3(x, y, z), DnMm = dn, ConnecteA = vers };

    static Composant C(string id, string fam, string type, TypeComposant t, double dn, double lg, Point3? centre, params Extremite[] e) =>
        new Composant { Id = id, Famille = fam, TypeNom = type, Type = t, DnMm = dn, LongueurMm = lg, Centre = centre, Extremites = e.ToList(), Systeme = "EG-101", Taille = dn + " mm" };

    // Spool type : tube horizontal, coude 90°, tube vertical, té, piquage de branche vers un tube DN25, bride en bout vers une vanne hors spool
    static Spool Exemple()
    {
        var s = new Spool { Nom = "SP-02" };
        s.Composants.Add(C("1", "Tuyau", "Inox 316L", TypeComposant.Tube, 50, 924, null, E(0, 0, 0, 50, null), E(924, 0, 0, 50, "2")));
        s.Composants[0].Materiau = "Inox 316L";
        s.Composants.Add(C("2", "Coude - Soudé", "Standard", TypeComposant.Autre, 50, 0, new Point3(1000, 0, 0), E(924, 0, 0, 50, "1"), E(1000, 0, 76, 50, "3")));
        s.Composants.Add(C("3", "Tuyau", "Inox 316L", TypeComposant.Tube, 50, 1350, null, E(1000, 0, 76, 50, "2"), E(1000, 0, 1426, 50, "4")));
        s.Composants[2].Materiau = "Inox 316L";
        s.Composants.Add(C("4", "Raccord générique", "Égal", TypeComposant.Autre, 50, 0, new Point3(1000, 0, 1500), E(1000, 0, 1426, 50, "3"), E(1000, 0, 1574, 50, "5"), E(1074, 0, 1500, 50, "6")));
        s.Composants.Add(C("5", "Bride à collerette", "PN16", TypeComposant.Autre, 50, 0, new Point3(1000, 0, 1600), E(1000, 0, 1574, 50, "4"), E(1000, 0, 1620, 50, "VANNE-EXT")));
        s.Composants.Add(C("6", "Tuyau", "Inox 316L", TypeComposant.Tube, 50, 600, null, E(1074, 0, 1500, 50, "4"), E(1674, 0, 1500, 50, null)));
        s.Composants[5].Materiau = "Inox 316L";
        return s;
    }

    static int Main()
    {
        var s = Exemple();
        AnalyseSpool.Analyser(s);
        var parId = s.Composants.ToDictionary(c => c.Id);

        // Types
        Verifier(parId["2"].Type == TypeComposant.Coude, "coude reconnu par le nom");
        Verifier(Math.Abs(parId["2"].AngleDeg - 90) < 0.5, "angle du coude = 90° (" + parId["2"].AngleDeg + ")");
        Verifier(parId["4"].Type == TypeComposant.Te, "té reconnu par la géométrie (3 extrémités)");
        Verifier(parId["5"].Type == TypeComposant.Bride, "bride reconnue");
        Verifier(parId["2"].Materiau == "Inox 316L", "le coude hérite du matériau du tube");
        Verifier(parId["2"].Designation.Contains("90°"), "désignation du coude avec angle : " + parId["2"].Designation);
        Verifier(parId["4"].Designation.StartsWith("Té "), "désignation préfixée « Té » : " + parId["4"].Designation);

        // Nomenclature : 1 ligne tube (3 pièces, 2874 mm), coude, té, bride
        Verifier(s.Nomenclature.Count == 4, "4 lignes de nomenclature (" + s.Nomenclature.Count + ")");
        var tube = s.Nomenclature[0];
        Verifier(tube.EstTube && tube.Quantite == 3 && Math.Abs(tube.LongueurMm - 2874) < 0.1, "ligne tube : 3 pièces, 2874 mm");
        Verifier(s.Nomenclature[1].Type == TypeComposant.Coude && s.Nomenclature[1].Repere == 2, "coude en repère 2");

        // Débit : T1 = tube de départ (le plus bas), puis dans l'ordre de la ligne
        Verifier(s.Debits.Count == 3, "3 débits");
        Verifier(s.Debits[0].Tube.Id == "1" && s.Debits[0].Repere == "T1", "T1 = tube de départ");
        Verifier(parId["3"].Repere == "T2", "T2 = tube vertical");
        Verifier(parId["2"].Repere == "2", "repère du coude = 2");

        // Assemblages : soudures 1-2, 2-3, 3-4, 4-5, 4-6 = 5 ; raccordement chantier bride-vanne ; extrémités libres : 2
        Verifier(s.Nombre(NatureAssemblage.Soudure) == 5, "5 soudures atelier (" + s.Nombre(NatureAssemblage.Soudure) + ")");
        Verifier(s.Nombre(NatureAssemblage.RaccordementChantier) == 1, "1 raccordement chantier");
        Verifier(s.Nombre(NatureAssemblage.ExtremiteLibre) == 2, "2 extrémités libres");
        Verifier(Math.Abs(s.PoucesDiametre(NatureAssemblage.Soudure) - 10) < 1e-9, "10 pouces-diamètre de soudure (5 × 2\")");
        Verifier(s.Assemblages.Where(a => a.Nature == NatureAssemblage.Soudure).Select(a => a.Numero).SequenceEqual(new[] { "S1", "S2", "S3", "S4", "S5" }), "soudures numérotées S1…S5");
        Verifier(Math.Abs(s.LongueurDeveloppeeMm - 2874) < 0.1, "longueur développée");

        // Cotation : axe coude → axe té (1500), axe té → face de bride (120), axe té → bout de tube (674),
        // bout de tube de départ → axe coude (1000)
        var cotes = s.Cotes.Select(c => c.Valeur + " " + c.Libelle).OrderBy(x => x).ToList();
        Verifier(cotes.Count == 4, "4 cotes : " + string.Join(", ", cotes));
        Verifier(cotes.Contains("1500 axe / axe"), "cote d'axe en axe coude/té");
        Verifier(cotes.Contains("120 axe / bride"), "cote d'axe à bride");
        Verifier(cotes.Contains("674 axe / extrémité"), "cote d'axe à bout de tube (branche)");
        Verifier(cotes.Contains("1000 extrémité / axe") || cotes.Contains("1000 axe / extrémité"), "cote bout de tube / axe coude");

        // Point d'axe par intersection des directions des connecteurs (coude dont l'insertion n'est pas au sommet)
        var coudeDir = C("k", "Coude", "", TypeComposant.Coude, 50, 0, new Point3(978, 0, 22), E(924, 0, 0, 50, null), E(1000, 0, 76, 50, null));
        coudeDir.Extremites[0].Direction = new Point3(-1, 0, 0); coudeDir.Extremites[1].Direction = new Point3(0, 0, 1);
        var pa = Cotation.PointAxe(coudeDir);
        Verifier(pa.Distance(new Point3(1000, 0, 0)) < 0.01, "sommet du coude = intersection des axes : " + pa);

        // Ligne droite bride – tube – vanne – bride – tube – bride : bride/bride à chaque joint boulonné
        var d = new Spool { Nom = "D" };
        d.Composants.Add(C("f1", "Bride", "PN16", TypeComposant.Bride, 80, 0, null, E(0, 0, 0, 80, "EXT1"), E(50, 0, 0, 80, "t1")));
        d.Composants.Add(C("t1", "Tuyau", "Acier", TypeComposant.Tube, 80, 500, null, E(50, 0, 0, 80, "f1"), E(550, 0, 0, 80, "f2")));
        d.Composants.Add(C("f2", "Bride", "PN16", TypeComposant.Bride, 80, 0, null, E(550, 0, 0, 80, "t1"), E(600, 0, 0, 80, "v")));
        d.Composants.Add(C("v", "Vanne", "", TypeComposant.Vanne, 80, 0, null, E(600, 0, 0, 80, "f2"), E(800, 0, 0, 80, "f3")));
        d.Composants.Add(C("f3", "Bride", "PN16", TypeComposant.Bride, 80, 0, null, E(800, 0, 0, 80, "v"), E(850, 0, 0, 80, "t2")));
        d.Composants.Add(C("t2", "Tuyau", "Acier", TypeComposant.Tube, 80, 300, null, E(850, 0, 0, 80, "f3"), E(1150, 0, 0, 80, null)));
        AnalyseSpool.Analyser(d);
        var cd = d.Cotes.Select(c => c.Valeur + " " + c.Libelle).OrderBy(x => x).ToList();
        Verifier(cd.Count == 3 && cd.Contains("600 bride / bride") && cd.Contains("200 bride / bride") && cd.Contains("350 bride / extrémité"),
            "chaîne droite coupée aux joints boulonnés : " + string.Join(", ", cd));

        // Provenance / destination : sans sens Revit, la première extrémité de la ligne est l'arrivée
        var sl = Exemple();
        sl.NomsExterieurs["VANNE-EXT"] = "SP-03"; sl.ExterieursSpool.Add("VANNE-EXT");
        AnalyseSpool.Analyser(sl);
        Verifier(sl.Liaisons.Count == 3, "3 liaisons (départ libre, bride vers SP-03, bout de branche libre)");
        Verifier(sl.Liaisons[0].Sens == SensFlux.Entree && sl.Liaisons[0].RaccordeA == "" && sl.Liaisons[0].Numero == "L1", "L1 = arrivée au début de la ligne");
        var vers = sl.Liaisons.FirstOrDefault(l => l.RaccordeA == "SP-03");
        Verifier(vers != null && vers.Sens == SensFlux.Sortie && vers.AutreSpool && vers.Libelle == "VA VERS SP-03", "renvoi « VA VERS SP-03 »");
        var tl = MiseEnPage.Tableaux(sl, "P", "d").FirstOrDefault(t => t.Titre == "PROVENANCE / DESTINATION");
        Verifier(tl != null && tl.Lignes.Any(l => l[1] == "Va vers" && l[2] == "SP-03 (isométrie)"), "tableau PROVENANCE / DESTINATION");
        Verifier(ExportPcf.Generer(sl, "").Contains("END-CONNECTION-PIPELINE\r\n    CO-ORDS 1000.0 0.0 1620.0 50\r\n    PIPELINE-REFERENCE SP-03"), "PCF : renvoi vers le spool suivant");
        // Sens fourni par Revit : respecté
        var sr = Exemple();
        sr.Composants.First(c => c.Id == "5").Extremites[1].Sens = SensFlux.Entree;
        AnalyseSpool.Analyser(sr);
        Verifier(sr.Liaisons[0].Position.Z == 1620 && sr.Liaisons[0].Sens == SensFlux.Entree && sr.Liaisons[0].SensConnu
            && sr.Liaisons.Skip(1).All(l => l.Sens == SensFlux.Sortie), "sens d'écoulement Revit respecté");
        Verifier(ExportCsv.Liaisons(new[] { sl }).Contains(";Va vers;SP-03;DN50;déduit de la ligne"), "CSV liaisons : " + ExportCsv.Liaisons(new[] { sl }));

        // Quantitatif pour le chiffrage Pipe-Fit
        var q1 = Exemple(); q1.Composants.ForEach(c => c.Systeme = "EG-101");
        var q2 = Exemple(); q2.Nom = "SP-03"; q2.Composants.ForEach(c => { c.Systeme = "EG-101"; c.Id = "b" + c.Id; foreach (var e in c.Extremites) if (e.ConnecteA != null && e.ConnecteA != "VANNE-EXT") e.ConnecteA = "b" + e.ConnecteA; });
        // Les deux spools se raccordent bride contre bride : 5 (SP-02) ↔ b5 (SP-03)
        q1.Composants.First(c => c.Id == "5").Extremites[1].ConnecteA = "b5";
        q2.Composants.First(c => c.Id == "b5").Extremites[1].ConnecteA = "5";
        AnalyseSpool.Analyser(q1); AnalyseSpool.Analyser(q2);
        var ql = Quantitatif.Calculer(new[] { q1, q2 });
        var qtube = ql.FirstOrDefault(l => l.EstTube);
        Verifier(qtube != null && qtube.Famille == "Tube" && Math.Abs(qtube.LongueurMm - 2 * 2874) < 0.1 && qtube.Spools.Count == 2, "quantitatif : tube cumulé sur les 2 spools");
        Verifier(ql.Any(l => l.Famille == "Soudure atelier" && l.Taille == "DN50" && l.Nombre == 10), "quantitatif : 10 soudures atelier DN50");
        // Raccordement entre les deux spools : un seul joint, vu des deux côtés
        Verifier(ql.Count(l => l.Famille == "Joint boulonné chantier") == 1 && ql.First(l => l.Famille == "Joint boulonné chantier").Nombre == 1,
            "quantitatif : raccordement commun compté une fois, boulonné (bride)");
        var hs = Exemple(); hs.HorsSpool = true; AnalyseSpool.Analyser(hs);
        var qh = Quantitatif.Calculer(new[] { hs });
        Verifier(qh.Any(l => l.Famille == "Soudure" && l.Nombre == 5) && !qh.Any(l => l.Famille == "Soudure atelier"), "quantitatif hors spool : soudures à répartir");
        var qcsv = Quantitatif.Csv(new[] { q1 }).Split(new[] { "\r\n" }, StringSplitOptions.RemoveEmptyEntries);
        Verifier(qcsv[0] == "Réseau;Famille;Type;Taille;Longueur;Nombre;Matériau;Désignation;Repères spools", "CSV quantitatif : en-tête");
        Verifier(qcsv.Contains("EG-101;Tube;Inox 316L;DN50;2874;1;Inox 316L;Tube Inox 316L;SP-02"), "CSV quantitatif : ligne tube : " + qcsv[1]);
        Verifier(qcsv.Any(l => l.StartsWith("EG-101;Soudure atelier;bout à bout;DN50;;5;")), "CSV quantitatif : soudures atelier");
        var sred = new Spool { Nom = "R" };
        sred.Composants.Add(C("x", "Réduction", "", TypeComposant.Reduction, 80, 0, null, E(0, 0, 0, 80, null), E(90, 0, 0, 50, null)));
        AnalyseSpool.Analyser(sred);
        Verifier(Quantitatif.Calculer(new[] { sred }).Any(l => l.Taille == "DN80 x DN50"), "quantitatif : taille d'une réduction");

        // Numérotation : découpage aux joints boulonnés
        {
            // Ligne : tube a – bride b | bride c – tube d – coude e – tube f | vanne g | bride h – tube i
            var L = new List<Composant>
            {
                C("a", "Tuyau", "", TypeComposant.Tube, 50, 500, null, E(0, 0, 0, 50, null), E(500, 0, 0, 50, "b")),
                C("b", "Bride", "", TypeComposant.Autre, 50, 0, null, E(500, 0, 0, 50, "a"), E(550, 0, 0, 50, "c")),
                C("c", "Bride", "", TypeComposant.Autre, 50, 0, null, E(550, 0, 0, 50, "b"), E(600, 0, 0, 50, "d")),
                C("d", "Tuyau", "", TypeComposant.Tube, 50, 400, null, E(600, 0, 0, 50, "c"), E(1000, 0, 0, 50, "e")),
                C("e", "Coude", "", TypeComposant.Autre, 50, 0, new Point3(1076, 0, 0), E(1000, 0, 0, 50, "d"), E(1076, 0, 76, 50, "f")),
                C("f", "Tuyau", "", TypeComposant.Tube, 50, 400, null, E(1076, 0, 76, 50, "e"), E(1076, 0, 476, 50, "g")),
                C("g", "Vanne", "", TypeComposant.Autre, 50, 0, null, E(1076, 0, 476, 50, "f"), E(1076, 0, 526, 50, "h")),
                C("h", "Bride", "", TypeComposant.Autre, 50, 0, null, E(1076, 0, 526, 50, "g"), E(1076, 0, 576, 50, "i")),
                C("i", "Tuyau", "", TypeComposant.Tube, 50, 300, null, E(1076, 0, 576, 50, "h"), E(1076, 0, 876, 50, null)),
            };
            L.First(c => c.Id == "g").EstAccessoire = true;
            var et = Decoupage.Etendre(L, new[] { "d" });
            Verifier(string.Join(",", et.OrderBy(x => x)) == "c,d,e,f,g", "sélection complétée jusqu'aux brides : " + string.Join(",", et.OrderBy(x => x)));
            var etb = Decoupage.Etendre(L, new[] { "d" }, new HashSet<string> { "f" });
            Verifier(string.Join(",", etb.OrderBy(x => x)) == "c,d,e", "arrêt sur un élément déjà numéroté");
            var gr = Decoupage.Spools(L);
            Verifier(gr.Count == 3 && gr.Select(g => string.Join("", g.Select(c => c.Id).OrderBy(x => x))).SequenceEqual(new[] { "ab", "cdefg", "hi" }),
                "découpage en 3 spools : " + string.Join(" | ", gr.Select(g => string.Join("", g.Select(c => c.Id)))));
            // Vanne entre deux brides : pièce à part, pas de spool
            var V = new List<Composant>
            {
                C("p", "Tuyau", "", TypeComposant.Tube, 80, 500, null, E(0, 0, 0, 80, null), E(500, 0, 0, 80, "q")),
                C("q", "Bride", "", TypeComposant.Autre, 80, 0, null, E(500, 0, 0, 80, "p"), E(550, 0, 0, 80, "v")),
                C("v", "Vanne papillon", "", TypeComposant.Autre, 80, 0, null, E(550, 0, 0, 80, "q"), E(600, 0, 0, 80, "r")),
                C("r", "Bride", "", TypeComposant.Autre, 80, 0, null, E(600, 0, 0, 80, "v"), E(650, 0, 0, 80, "t")),
                C("t", "Tuyau", "", TypeComposant.Tube, 80, 500, null, E(650, 0, 0, 80, "r"), E(1150, 0, 0, 80, null)),
            };
            V.First(c => c.Id == "v").EstAccessoire = true;
            var gv = Decoupage.Spools(V);
            Verifier(gv.Count == 2 && !gv.Any(g => g.Any(c => c.Id == "v")), "vanne entre brides : non numérotée, 2 spools");
            Verifier(Decoupage.Prochain(new[] { "SP-001", "SP-007", "EG-SP-020", "SP-x", null }, "SP-") == 8, "prochain numéro libre");
            Verifier(Decoupage.Format("SP-", 8, 3) == "SP-008" && Decoupage.Format("", 12, 2) == "12", "format du numéro");
            Verifier(Decoupage.Prefixe("SP-", "EGD") == "EGD-SP-" && Decoupage.Prefixe("SP-", "") == "SP-" && Decoupage.Prefixe("", "EGD") == "EGD-"
                && Decoupage.Prefixe("", "") == "SP-", "préfixe par système");

            // Systèmes : un spool ne mélange jamais départ et retour
            var S2 = new List<Composant>
            {
                C("s1", "Tuyau", "", TypeComposant.Tube, 50, 1000, null, E(0, 0, 0, 50, null), E(1000, 0, 0, 50, "s2")),
                C("s2", "Tuyau", "", TypeComposant.Tube, 50, 1000, null, E(1000, 0, 0, 50, "s1"), E(2000, 0, 0, 50, null)),
            };
            S2[0].Systeme = "EG départ"; S2[1].Systeme = "EG retour"; S2[0].Abreviation = "EGD";
            Verifier(Decoupage.Spools(S2).Count == 2, "changement de système : deux spools");
            Verifier(Decoupage.Reseau(new[] { S2[0] }, true) == "EGD" && Decoupage.Reseau(new[] { S2[1] }, true) == "EG retour", "abréviation, sinon nom du système");

            // Longueur maxi : 10 tubes de 1,5 m soudés bout à bout (15 m) → 3 spools de 6 m, 6 m et 3 m, d'un seul tenant
            var B = new List<Composant>();
            for (int i = 0; i < 10; i++)
                B.Add(C("t" + i, "Tuyau", "", TypeComposant.Tube, 50, 1500, null,
                    E(i * 1500, 0, 0, 50, i > 0 ? "t" + (i - 1) : null), E((i + 1) * 1500, 0, 0, 50, i < 9 ? "t" + (i + 1) : null)));
            var gb = Decoupage.Spools(B, 6000);
            Verifier(gb.Select(g => Decoupage.LongueurTube(g)).SequenceEqual(new double[] { 6000, 6000, 3000 }), "découpe à 6 m : " + string.Join(" / ", gb.Select(g => Decoupage.LongueurTube(g))));
            Verifier(gb[0].Any(c => c.Id == "t0") && gb.All(g => Decoupage.Etendre(g, new[] { g[0].Id }).Count == g.Count), "morceaux d'un seul tenant, depuis l'extrémité basse");
            Verifier(Decoupage.Spools(B, 0).Count == 1, "sans limite : un seul spool");
            // Coudes inclus avec le tube qui les précède ; un tube de 8 m seul est signalé
            var T = new List<Composant>
            {
                C("u1", "Tuyau", "", TypeComposant.Tube, 50, 5000, null, E(0, 0, 0, 50, null), E(5000, 0, 0, 50, "k1")),
                C("k1", "Coude", "", TypeComposant.Coude, 50, 0, new Point3(5076, 0, 0), E(5000, 0, 0, 50, "u1"), E(5076, 0, 76, 50, "u2")),
                C("u2", "Tuyau", "", TypeComposant.Tube, 50, 8000, null, E(5076, 0, 76, 50, "k1"), E(5076, 0, 8076, 50, null)),
            };
            var gt = Decoupage.Spools(T, 6000, out var tlong);
            Verifier(gt.Count == 2 && gt[0].Select(c => c.Id).OrderBy(x => x).SequenceEqual(new[] { "k1", "u1" }) && tlong.Count == 1 && tlong[0].Id == "u2",
                "coude avec le premier tube, tube de 8 m signalé");
        }

        // Bride contre bride (ou vanne) : joint boulonné
        var b = new Spool { Nom = "B" };
        b.Composants.Add(C("a", "Bride", "PN16", TypeComposant.Bride, 80, 0, null, E(0, 0, 0, 80, "x"), E(10, 0, 0, 80, "b")));
        b.Composants.Add(C("b", "Vanne papillon", "", TypeComposant.Autre, 80, 0, null, E(10, 0, 0, 80, "a"), E(60, 0, 0, 80, null)));
        b.Composants[1].EstAccessoire = true;
        AnalyseSpool.Analyser(b);
        Verifier(b.Composants[1].Type == TypeComposant.Vanne, "accessoire « vanne papillon » = vanne");
        Verifier(b.Nombre(NatureAssemblage.Boulonne) == 1 && b.Nombre(NatureAssemblage.Soudure) == 0, "bride + vanne = joint boulonné");

        // Classement géométrique
        var red = C("r", "Raccord", "", TypeComposant.Autre, 0, 0, null, E(0, 0, 0, 80, null), E(100, 0, 0, 50, null));
        Verifier(AnalyseSpool.Classer(red) == TypeComposant.Reduction, "réduction par la géométrie");
        var bou = C("c", "Raccord", "", TypeComposant.Autre, 0, 0, null, E(0, 0, 0, 80, null));
        Verifier(AnalyseSpool.Classer(bou) == TypeComposant.Bouchon, "bouchon par la géométrie");
        var cou = C("d", "Raccord", "", TypeComposant.Autre, 0, 0, new Point3(0, 0, 0), E(50, 0, 0, 50, null), E(0, 50, 0, 50, null));
        Verifier(AnalyseSpool.Classer(cou) == TypeComposant.Coude, "coude par la géométrie");
        Verifier(AnalyseSpool.Classer(C("e", "Tee - Welded", "", TypeComposant.Autre, 0, 0, null)) == TypeComposant.Te, "« Tee » reconnu");
        Verifier(AnalyseSpool.Classer(C("f", "Tête de vis", "", TypeComposant.Autre, 0, 0, null)) != TypeComposant.Te, "« Tête » n'est pas un té");

        // PCF
        var pcf = ExportPcf.Generer(s, "Projet Été");
        Verifier(pcf.Contains("PIPELINE-REFERENCE SP-02"), "PCF : référence de ligne");
        Verifier(pcf.Contains("UNITS-CO-ORDS MM"), "PCF : unités");
        Verifier(pcf.Split(new[] { "\r\nPIPE\r\n" }, StringSplitOptions.None).Length - 1 == 3, "PCF : 3 tubes");
        Verifier(pcf.Contains("ELBOW") && pcf.Contains("    CENTRE-POINT 1000.0 0.0 0.0") && pcf.Contains("SKEY ELBW"), "PCF : coude avec centre");
        Verifier(pcf.Contains("TEE\r\n    END-POINT 1000.0 0.0 1426.0 50\r\n    END-POINT 1000.0 0.0 1574.0 50\r\n    CENTRE-POINT 1000.0 0.0 1500.0\r\n    BRANCH1-POINT 1074.0 0.0 1500.0 50"), "PCF : té (passage droit et branche)");
        Verifier(pcf.Contains("PROJECT-IDENTIFIER Projet Ete"), "PCF : texte sans accents");
        Verifier(pcf.Contains("MATERIALS") && pcf.Contains("ITEM-CODE TUBE-INOX-316L-50"), "PCF : section MATERIALS");
        Verifier(!pcf.Any(ch => ch > 127), "PCF : ASCII uniquement");

        // CSV
        var csv = ExportCsv.Nomenclature(new[] { s });
        var lignes = csv.Split(new[] { "\r\n" }, StringSplitOptions.RemoveEmptyEntries);
        Verifier(lignes[0].StartsWith("Spool;Rep.;Famille;Type;Taille;Longueur;Nombre"), "CSV : en-tête compatible Pipe-Fit");
        Verifier(lignes.Length == 5 && lignes[1].Contains(";2874;1;"), "CSV : ligne tube en mm : " + lignes[1]);
        var soud = ExportCsv.Soudures(new[] { s }).Split(new[] { "\r\n" }, StringSplitOptions.RemoveEmptyEntries);
        Verifier(soud.Length == 1 + s.Assemblages.Count && soud.Count(l => l.Contains(";Soudure atelier;")) == 5, "CSV soudures : " + string.Join(" / ", soud.Take(3)) + " n=" + soud.Length + "/" + s.Assemblages.Count);

        // Mise en page
        var tabs = MiseEnPage.Tableaux(s, "Projet", "15/11/2026");
        Verifier(tabs.Count == 5 && tabs.All(t => t.Largeur <= 130.001), "5 tableaux de 130 mm maxi");
        var page = MiseEnPage.Ranger(new Rect(10, 10, 410, 287), tabs, 5);
        Verifier(page.Tableaux.All(p => p.X >= 10 && p.Y <= 287 && p.Y - p.Tableau.Hauteur(5) >= 10 - 1e-9), "tableaux dans la zone");
        Verifier(page.ZoneVue.X1 <= page.Tableaux.Min(p => p.X), "la vue ne chevauche pas les tableaux");
        var gros = Enumerable.Range(0, 3).Select(_ => new Tableau { Colonnes = { new Colonne("a", 100) }, Lignes = Enumerable.Range(0, 30).Select(i => new[] { "x" }).ToList() }).ToList();
        var page2 = MiseEnPage.Ranger(new Rect(0, 0, 400, 200), gros, 5);
        Verifier(page2.Tableaux.Select(p => p.X).Distinct().Count() == 3, "débordement : une colonne par tableau");
        Verifier(MiseEnPage.ChoisirEchelle(5000, 3000, 250, 250) == 20, "échelle 1:20 pour 5 m dans 250 mm");
        Verifier(MiseEnPage.ChoisirEchelle(400, 200, 250, 250) == 2, "échelle 1:2 pour une petite pièce");
        Verifier(MiseEnPage.Tronquer("Coude soudé inox 316L à grand rayon", 30, 2.5) == "Coude soudé inox…", "texte tronqué : " + MiseEnPage.Tronquer("Coude soudé inox 316L à grand rayon", 30, 2.5));

        // Tri naturel des spools
        var noms = new List<string> { "SP-10", "SP-2", "SP-1", "A", "SP-02b" };
        noms.Sort(AnalyseSpool.ComparerNaturel);
        Verifier(string.Join(",", noms) == "A,SP-1,SP-2,SP-02b,SP-10", "tri naturel : " + string.Join(",", noms));
        Verifier(Diametres.Pouces(50) == 2 && Diametres.Pouces(65) == 2.5 && Diametres.Pouces(100) == 4, "pouces-diamètre");

        Console.WriteLine(echecs == 0 ? $"OK : {total} vérifications" : $"{echecs} échec(s) sur {total}");
        return echecs == 0 ? 0 : 1;
    }
}
