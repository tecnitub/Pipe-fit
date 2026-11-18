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

    static Spool s0BR() { var s = Exemple(); s.Composants.First(c => c.Id == "5").Extremites[1].ConnecteA = "VANNE-EXT"; AnalyseSpool.Analyser(s); return s; }

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
        // Bride : cote au bout de la bride ; vanne : cote à son axe (milieu entre ses faces)
        Verifier(cd.Count == 4 && cd.Contains("600 bride / bride") && cd.Contains("100 bride / axe") && cd.Contains("100 axe / bride") && cd.Contains("350 bride / extrémité"),
            "chaîne droite : bout des brides et axe de la vanne : " + string.Join(", ", cd));
        var (fa1, so1) = SymboleBride.Faces(d.Composants.First(c => c.Id == "f2"), d);
        var (fa0, _) = SymboleBride.Faces(d.Composants.First(c => c.Id == "f1"), d);
        Verifier(fa1.Position.X == 600 && so1.Position.X == 550 && fa0.Position.X == 0, "bride : face de joint côté vanne / équipement, soudure côté tube");
        Verifier(SymboleBride.Dessin().Count > 8, "symbole collet + bride tournante");
        var lv = d.Nomenclature.Single(l => l.Type == TypeComposant.Vanne);
        Verifier(lv.FaceAFaceMm == 200 && d.Nomenclature.Where(l => l.Type != TypeComposant.Vanne).All(l => l.FaceAFaceMm == 0), "nomenclature : cote face à face de la vanne (200)");
        var tnd = MiseEnPage.Tableaux(d, "", "").First(t => t.Titre == "NOMENCLATURE");
        var ic = tnd.Colonnes.FindIndex(c => c.Titre == "Encombrement");
        Verifier(ic > 0 && tnd.Lignes.Any(r => r[ic] == "200") && tnd.Lignes.All(r => r.Length == tnd.Colonnes.Count) && Math.Abs(tnd.Largeur - 150) < 0.01,
            "tableau nomenclature : colonne « Encombrement » de la vanne");
        Verifier(ExportCsv.Nomenclature(new[] { d }).Contains(";200\r\n"), "CSV nomenclature : face à face");
        // Aucun texte ne déborde de sa colonne : titres entiers, cases raccourcies (« … ») à la largeur de la colonne
        foreach (var tb in MiseEnPage.Tableaux(d, "Projet", "17/11/2026").Concat(MiseEnPage.Tableaux(Exemple(), "Projet", "17/11/2026")))
        {
            Verifier(MiseEnPage.TitresEntiers(tb, MiseEnPage.HauteurTexteTableau), "titres de colonnes entiers : " + tb.Titre + " (" + string.Join(", ", tb.Colonnes.Where(c => MiseEnPage.Tronquer(c.Titre, c.LargeurMm, MiseEnPage.HauteurTexteTableau, true) != c.Titre).Select(c => c.Titre)) + ")");
            Verifier(tb.Lignes.All(r => r.Select((v, j) => MiseEnPage.LargeurTexte(MiseEnPage.Tronquer(v, tb.Colonnes[j].LargeurMm, MiseEnPage.HauteurTexteTableau), MiseEnPage.HauteurTexteTableau) <= tb.Colonnes[j].LargeurMm - 3).All(x => x)), "cases dans leur colonne : " + tb.Titre);
        }
        Verifier(MiseEnPage.Tronquer("Vanne papillon TECOFI VPI 4648-02 DN100", 38, 2.5).EndsWith("…"), "désignation longue raccourcie");
        // Légendes : libellés entiers (jamais raccourcis), titres entiers
        foreach (var tlg in new[] { Legende.Compacte(Legende.Toutes()), Legende.Tableau(Legende.Toutes()) })
        {
            var coupes = tlg.Lignes.SelectMany(r => r.Select((v, j) => (v, j))).Where(x => x.v != null && !x.v.StartsWith(Legende.Marque)
                && MiseEnPage.Tronquer(x.v, tlg.Colonnes[x.j].LargeurMm, MiseEnPage.HauteurTexteTableau) != x.v).Select(x => x.v).ToList();
            Verifier(coupes.Count == 0 && MiseEnPage.TitresEntiers(tlg, MiseEnPage.HauteurTexteTableau), "légende sans texte raccourci : " + string.Join(" | ", coupes));
        }
        Verifier(MiseEnPage.LargeurTexte("MMMM", 2.5) > MiseEnPage.LargeurTexte("iiii", 2.5) * 3, "largeur de texte selon les caractères");

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
            Verifier(Decoupage.NumeroSuivant("EGD-SP-007", new[] { "EGD-SP-009", "SP-020" }) == "EGD-SP-010" && Decoupage.NumeroSuivant("SP-01", new string[0]) == "SP-02"
                && Decoupage.NumeroSuivant("A", new string[0]) == "A-01", "numéro suivant");
            Verifier(Decoupage.Morceaux(L.Where(c => "abc".Contains(c.Id)).ToList()) == 1 && Decoupage.Morceaux(L.Where(c => "adi".Contains(c.Id)).ToList()) == 3,
                "choix manuel : nombre de morceaux non raccordés");
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

        // Soudures chantier imposées et surlongueurs à recouper sur place
        {
            // tube t1 (1000) – coude k – tube t2 (2000) ; soudure chantier marquée entre k et t2, surlongueur 150 sur ce joint
            Func<List<Composant>> ligne = () => new List<Composant>
            {
                C("t1", "Tuyau", "", TypeComposant.Tube, 50, 1000, null, E(0, 0, 0, 50, null), E(1000, 0, 0, 50, "k")),
                C("k", "Coude", "", TypeComposant.Coude, 50, 0, new Point3(1076, 0, 0), E(1000, 0, 0, 50, "t1"), E(1076, 0, 76, 50, "t2")),
                C("t2", "Tuyau", "", TypeComposant.Tube, 50, 2000, null, E(1076, 0, 76, 50, "k"), E(1076, 0, 2076, 50, "EQUIP")),
            };
            var L1 = ligne();
            L1[1].Extremites[1].CoupeChantier = true; L1[1].Extremites[1].SurlongueurMm = 150;
            var gs = Decoupage.Spools(L1);
            Verifier(gs.Count == 2 && gs.Any(g => g.Count == 1 && g[0].Id == "t2"), "soudure chantier marquée : spool coupé au joint");
            Verifier(Decoupage.Etendre(L1, new[] { "t1" }).Count == 2, "sélection complétée arrêtée à la soudure chantier");

            // Analyse sans renumérotation : le joint marqué est un raccordement chantier ; surlongueur 150 sur t2 ;
            // l'extrémité vers l'équipement : surlongueur par défaut (80) sur t2 aussi
            var sp = new Spool { Nom = "X", Composants = ligne(), SurlongueurMm = 80 };
            sp.Composants[1].Extremites[1].CoupeChantier = true; sp.Composants[1].Extremites[1].SurlongueurMm = 150;
            AnalyseSpool.Analyser(sp);
            Verifier(sp.Nombre(NatureAssemblage.RaccordementChantier) == 2 && sp.Nombre(NatureAssemblage.Soudure) == 1, "joint marqué compté en soudure chantier");
            var d2 = sp.Debits.First(d => d.Tube.Id == "t2");
            Verifier(d2.SurlongueurMm == 230 && d2.LongueurMm == 2230, "débit t2 : 2000 + 150 + 80 = 2230 (" + d2.LongueurMm + ")");
            Verifier(sp.Debits.First(d => d.Tube.Id == "t1").SurlongueurMm == 0, "t1 : extrémité libre, pas de surlongueur");
            var tdeb = MiseEnPage.Tableaux(sp, "", "").First(t => t.Titre == "LISTE DE DÉBIT");
            Verifier(tdeb.Lignes.Any(l => l[0] == d2.Repere && l[2] == "2000" && l[3] == "+230" && l[4] == "2230"), "tableau de débit : longueur Revit, surlongueur, coupe");
            Verifier(Math.Abs(Quantitatif.Calculer(new[] { sp }).First(l => l.EstTube).LongueurMm - 3230) < 0.1, "quantitatif : tube surlongueurs comprises");
            Verifier(Math.Abs(sp.Nomenclature.First(l => l.EstTube).LongueurMm - 3230) < 0.1, "nomenclature : tube surlongueurs comprises");
            Verifier(ExportCsv.Soudures(new[] { sp }).Contains(";150 sur " + d2.Repere + ";"), "CSV soudures : surlongueur");

            // Entre deux tubes, un seul côté porte la surlongueur
            var tt = new Spool { Nom = "Y", SurlongueurMm = 100 };
            tt.Composants.Add(C("a1", "Tuyau", "", TypeComposant.Tube, 50, 1000, null, E(0, 0, 0, 50, null), E(1000, 0, 0, 50, "a2")));
            tt.Composants.Add(C("a2", "Tuyau", "", TypeComposant.Tube, 50, 1000, null, E(1000, 0, 0, 50, "a1"), E(2000, 0, 0, 50, null)));
            tt.Composants[0].Extremites[1].CoupeChantier = true;
            AnalyseSpool.Analyser(tt);
            Verifier(tt.Debits.Sum(d => d.SurlongueurMm) == 100, "tube contre tube : surlongueur d'un seul côté");
        }

        // Pouces de soudure dans la nomenclature : chaque soudure portée une fois, par le raccord plutôt que le tube
        {
            var sp = Exemple(); AnalyseSpool.Analyser(sp);
            var pid = sp.Composants.ToDictionary(c => c.Id);
            // Soudures : 1-2 (coude), 2-3 (coude), 3-4 (té), 4-5 (té/bride : plus grand id = bride 5), 4-6 (té)
            Verifier(pid["2"].PoucesSoudures == 4 && pid["4"].PoucesSoudures == 4 && pid["5"].PoucesSoudures == 2 && pid["1"].PoucesSoudures == 0,
                "soudures portées par les raccords : coude 4\", té 4\", bride 2\"");
            Verifier(sp.Composants.Sum(c => c.PoucesSoudures) == sp.PoucesDiametre(NatureAssemblage.Soudure), "total = soudures atelier, chacune une fois");
            var tn = MiseEnPage.Tableaux(sp, "", "").First(t => t.Titre == "NOMENCLATURE");
            Verifier(tn.Colonnes.Last().Titre == "Pouces" && tn.Largeur <= 130.001, "colonne Pouces, 130 mm");
            Verifier(tn.Lignes.Last()[1] == "Total soudures (pouces-diamètre)" && tn.Lignes.Last()[5] == "10\"", "ligne de total : " + tn.Lignes.Last()[5]);
            Verifier(tn.Lignes.Any(l => l[1].StartsWith("Coude") && l[5] == "4\""), "pouces de la ligne coude");
            // Raccordement chantier vers une bride d'un autre spool : boulonné, pas de pouces de soudure
            var ta = MiseEnPage.Tableaux(sp, "", "").First(t => t.Titre == "ASSEMBLAGES");
            Verifier(ta.Lignes.Any(l => l[0] == "Joint boulonné chantier" && l[1] == "1") && !ta.Lignes.Any(l => l[0] == "Soudure chantier"),
                "bride en bout : joint boulonné chantier, sans pouces");
            // Soudure chantier entre deux spools (tube contre coude) : comptée par le coude seulement
            var x1 = new Spool { Nom = "A" };
            x1.Composants.Add(C("t", "Tuyau", "", TypeComposant.Tube, 100, 1000, null, E(0, 0, 0, 100, null), E(1000, 0, 0, 100, "k")));
            x1.Composants[0].Extremites[1].VoisinEstTube = false;
            AnalyseSpool.Analyser(x1);
            var x2 = new Spool { Nom = "B" };
            x2.Composants.Add(C("k", "Coude", "", TypeComposant.Coude, 100, 0, new Point3(1076, 0, 0), E(1000, 0, 0, 100, "t"), E(1076, 0, 76, 100, null)));
            x2.Composants[0].Extremites[0].VoisinEstTube = true;
            AnalyseSpool.Analyser(x2);
            Verifier(x1.Composants[0].PoucesSoudures == 0 && x2.Composants[0].PoucesSoudures == 4, "soudure chantier entre spools comptée une fois (côté coude)");
        }

        // Ordre de montage : P1 → A → B → C (A part de la pompe), B a une branche D
        {
            Spool Sp(string nom, params Composant[] cs) { var sp = new Spool { Nom = nom, Composants = cs.ToList() }; sp.NomsExterieurs["POMPE"] = "P1"; return sp; }
            var sA = Sp("SP-3", C("a", "Tuyau", "", TypeComposant.Tube, 50, 1000, null, E(0, 0, 500, 50, "POMPE"), E(1000, 0, 500, 50, "b")));
            var sB = Sp("SP-1", C("b", "Té", "", TypeComposant.Te, 50, 0, new Point3(1076, 0, 500), E(1000, 0, 500, 50, "a"), E(1152, 0, 500, 50, "c"), E(1076, 76, 500, 50, "d")));
            var sC = Sp("SP-2", C("c", "Tuyau", "", TypeComposant.Tube, 50, 2000, null, E(1152, 0, 500, 50, "b"), E(3152, 0, 500, 50, null)));
            var sD = Sp("SP-4", C("d", "Tuyau", "", TypeComposant.Tube, 50, 500, null, E(1076, 76, 500, 50, "b"), E(1076, 576, 500, 50, null)));
            var sE = Sp("SP-9", C("x", "Tuyau", "", TypeComposant.Tube, 50, 500, null, E(0, 0, 0, 50, null), E(500, 0, 0, 50, null)));
            // Noms des spools voisins, comme les donne la lecture du modèle
            void Voisin(Spool sp, string id, string nom) { sp.NomsExterieurs[id] = nom; sp.ExterieursSpool.Add(id); }
            Voisin(sA, "b", "SP-1"); Voisin(sB, "a", "SP-3"); Voisin(sB, "c", "SP-2"); Voisin(sB, "d", "SP-4"); Voisin(sC, "b", "SP-1"); Voisin(sD, "b", "SP-1");
            foreach (var sp in new[] { sA, sB, sC, sD, sE }) AnalyseSpool.Analyser(sp);
            var et = Montage.Ordonner(new List<Spool> { sB, sC, sD, sA, sE });
            Verifier(string.Join(",", et.Where(e => e.Ensemble == et.First(x => x.Spool == sA).Ensemble).Select(e => e.Spool.Nom)) == "SP-3,SP-1,SP-2,SP-4",
                "ordre de montage depuis la pompe : " + string.Join(",", et.Select(e => e.Spool.Nom)));
            Verifier(et.First(e => e.Spool == sA).PoseContre == "P1" && et.First(e => e.Spool == sD).PoseContre == "SP-1", "posé contre : pompe, puis spool précédent");
            Verifier(et.First(e => e.Spool == sB).Voisins.SequenceEqual(new[] { "SP-2", "SP-3", "SP-4" }), "voisins du spool");
            Verifier(et.Select(e => e.Ensemble).Distinct().Count() == 2 && et.Select(e => e.Ordre).SequenceEqual(new[] { 1, 2, 3, 4, 5 }), "deux ensembles, ordre continu");
            // Groupes : par ensemble, par système et ensemble ; un groupe qui ne touche pas la pompe part du spool voisin de l'autre groupe
            sA.Ensemble = "Ensemble A"; sB.Ensemble = "Ensemble A"; sC.Ensemble = "Ensemble B"; sD.Ensemble = "Ensemble B";
            foreach (var sp in new[] { sA, sB, sC, sD, sE }) sp.Systeme = "EGD";
            sE.Systeme = "EGR";
            var ge = Montage.Grouper(new List<Spool> { sA, sB, sC, sD, sE }, Montage.Regroupement.Ensemble);
            Verifier(string.Join("|", ge.Select(g => g.Nom + ":" + string.Join(",", g.Spools.Select(x => x.Nom)))) == "Ensemble A:SP-1,SP-3|Ensemble B:SP-2,SP-4|sans ensemble:SP-9",
                "regroupement par ensemble : " + string.Join("|", ge.Select(g => g.Nom)));
            Verifier(Montage.Grouper(new List<Spool> { sA, sB, sC, sD, sE }, Montage.Regroupement.SystemeEtEnsemble).Select(g => g.Nom)
                .SequenceEqual(new[] { "EGD – Ensemble A", "EGD – Ensemble B", "EGR – sans ensemble" }), "regroupement par système et ensemble");
            var ebB = Montage.Ordonner(ge[1].Spools);
            Verifier(ebB.Count == 2 && ebB.All(e => e.PoseContre == "SP-1"), "ensemble B : chaque morceau posé contre le spool de l'ensemble A");
            Verifier(MiseEnPage.Tableaux(sA, "", "")[0].Lignes.Any(l => l[0] == "Ensemble" && l[1] == "Ensemble A"), "ensemble dans le tableau SPOOL de l'isométrie");

            // Ensembles automatiques : par système, dans l'ordre de montage, 2 spools par ensemble
            var ea = Montage.EnsemblesAuto(new List<Spool> { sA, sB, sC, sD, sE }, 2);
            Verifier(ea[sA] == "Ensemble A" && ea[sB] == "Ensemble A" && ea[sC] == "Ensemble B" && ea[sD] == "Ensemble B" && ea[sE] == "Ensemble A",
                "ensembles automatiques par système (EGD : A, A, B, B ; EGR : A) : " + string.Join(",", new[] { sA, sB, sC, sD, sE }.Select(x => x.Nom + "=" + ea[x])));
            Verifier(Montage.NomEnsemble(0) == "Ensemble A" && Montage.NomEnsemble(25) == "Ensemble Z" && Montage.NomEnsemble(26) == "Ensemble AA", "noms d'ensembles");

            var tm = Montage.Tableau(et, sp => "bleu", sp => "ISO-" + sp.Nom);
            Verifier(tm.Largeur <= 130.001 && tm.Lignes[0][1] == et[0].Spool.Nom && tm.Lignes.Any(l => l[1] == "SP-2" && l[4] == "2,0 m"), "tableau ordre de montage");
        }

        // Robinetterie : genres, désignation, sens d'écoulement, PCF, symboles
        {
            Composant Acc(string fam, string type = "") { var c = C("x", fam, type, TypeComposant.Autre, 100, 0, null, E(0, 0, 0, 100, null), E(100, 0, 0, 100, null)); c.EstAccessoire = true; return c; }
            var genres = new[] { ("Vanne papillon", GenreRobinet.Papillon), ("Clapet à battant", GenreRobinet.Clapet), ("Vanne d'équilibrage STAD", GenreRobinet.Reglage),
                ("Dilatoflex", GenreRobinet.Compensateur), ("Manchette antivibratile", GenreRobinet.Compensateur), ("Filtre à tamis en Y", GenreRobinet.Filtre),
                ("Robinet à boisseau sphérique", GenreRobinet.Boisseau), ("Vanne à opercule", GenreRobinet.Vanne), ("Clapet anti-retour à disque", GenreRobinet.Clapet),
                ("Butterfly Valve - Lug", GenreRobinet.Papillon), ("Balancing Valve", GenreRobinet.Reglage), ("Check Valve", GenreRobinet.Clapet) };
            foreach (var (fam, g) in genres) Verifier(Robinetterie.Genre(Acc(fam)) == g, "genre de « " + fam + " » : " + Robinetterie.Genre(Acc(fam)));
            Verifier(AnalyseSpool.Classer(Acc("Dilatoflex")) == TypeComposant.Accessoire && AnalyseSpool.Classer(Acc("Clapet à battant")) == TypeComposant.Vanne,
                "compensateur = accessoire, clapet = vanne");

            // Robinetterie installée par TECNITUB (fiche technique robinetterie) : reconnue par la référence dans le nom de la FAMILLE
            var refs = new[]
            {
                ("ASTORI 304", GenreRobinet.Boisseau), ("304AB DN25", GenreRobinet.Boisseau), ("VPI 4648-02 DN100", GenreRobinet.Papillon), ("VPE 4508-08 DN400", GenreRobinet.Papillon),
                ("STAD DN40", GenreRobinet.Reglage), ("STAF DN80", GenreRobinet.Reglage), ("CGR 165 DN25", GenreRobinet.Reglage),
                ("FLEXVENT SUPER R7", GenreRobinet.Purgeur), ("Flamco Flexvent R9", GenreRobinet.Purgeur), ("F 3240-EP DN65", GenreRobinet.Filtre),
                ("WIKA 818i 0-6 bar", GenreRobinet.Manometre), ("CGR 293CB", GenreRobinet.Thermometre), ("294CB L100", GenreRobinet.Thermometre),
                ("CB 3448N DN80", GenreRobinet.Clapet), ("DI 7240N DN65", GenreRobinet.Compensateur), ("Manchon anti-vibratile", GenreRobinet.Compensateur),
                ("V2V COMBINEE DN50", GenreRobinet.Motorisee), ("Vanne 2 voies Siemens", GenreRobinet.Motorisee), ("CGR 369 DN100", GenreRobinet.Compensateur),
            };
            foreach (var (fam, g) in refs)
            {
                Verifier(Robinetterie.Genre(Acc(fam, "Standard")) == g, "famille « " + fam + " » : " + Robinetterie.Genre(Acc(fam, "Standard")) + " au lieu de " + g);
                // Le nom du type n'est pas lu : la même référence dans le type seul ne donne pas le symbole
                if (g != GenreRobinet.Vanne) Verifier(Robinetterie.Genre(Acc("Accessoire de canalisation", fam)) == GenreRobinet.Vanne, "référence « " + fam + " » dans le TYPE seul : ignorée");
            }
            Verifier(Robinetterie.Genre(Acc("Inox 304L")) != GenreRobinet.Boisseau, "« 304L » (inox) n'est pas un boisseau");
            // Appareils sur piquage (un seul raccordement) : symbolisés
            var pur = Acc("FLEXVENT SUPER R7", "R7"); pur.Extremites.RemoveAt(1); pur.Type = TypeComposant.Autre;
            var spu = new Spool { Nom = "PU" }; spu.Composants.Add(pur); AnalyseSpool.Analyser(spu);
            Verifier(pur.Genre == GenreRobinet.Purgeur && Robinetterie.Symbolise(pur) && pur.Designation.StartsWith("Purgeur d'air"), "purgeur sur piquage : symbolisé (" + pur.Designation + ")");
            Verifier(Legende.Pour(spu).Any(x => x.Code == "PURGEUR"), "purgeur dans la légende de l'isométrie");
            // Purgeur vissé sur un tube : joint démontable, pas de soudure
            var tpu = new Spool { Nom = "TP" };
            tpu.Composants.Add(C("t", "Tuyau", "", TypeComposant.Tube, 15, 200, null, E(0, 0, 0, 15, null), E(200, 0, 0, 15, "p")));
            var pu2 = Acc("Flamco Flexvent R9", "R9"); pu2.Id = "p"; pu2.Type = TypeComposant.Autre; pu2.Extremites.RemoveAt(1);
            pu2.Extremites[0].Position = new Point3(200, 0, 0); pu2.Extremites[0].ConnecteA = "t"; tpu.Composants.Add(pu2);
            AnalyseSpool.Analyser(tpu);
            Verifier(tpu.Nombre(NatureAssemblage.Soudure) == 0 && tpu.Nombre(NatureAssemblage.Boulonne) == 1, "purgeur vissé : joint démontable, sans soudure");

            // Le nom de la FAMILLE décide, jamais celui du type ; correspondance choisie pour une famille muette
            var gen = Acc("Vanne papillon", "DN100 PN16");
            Verifier(Robinetterie.Genre(gen) == GenreRobinet.Papillon, "genre lu dans le nom de la famille");
            var contra = Acc("Vanne papillon", "Clapet à battant PN16");
            Verifier(Robinetterie.Genre(contra) == GenreRobinet.Papillon, "le nom du type est ignoré (la famille décide)");
            var muet = Acc("Robinetterie KSB BOA-H", "DN80");
            Verifier(Robinetterie.Genre(muet) == GenreRobinet.Vanne, "famille muette : vanne par défaut");
            Robinetterie.Correspondances[Robinetterie.Cle("Robinetterie KSB BOA-H")] = GenreRobinet.Reglage;
            Verifier(Robinetterie.Genre(muet) == GenreRobinet.Reglage, "correspondance choisie pour la famille");
            Robinetterie.Correspondances[Robinetterie.Cle("DN80")] = GenreRobinet.Clapet;
            Verifier(Robinetterie.Genre(muet) == GenreRobinet.Reglage, "une correspondance au nom du type n'est pas lue");
            var spm = new Spool { Nom = "M" }; var cm = Acc("Robinetterie KSB BOA-H", "DN80"); cm.Type = TypeComposant.Autre; spm.Composants.Add(cm); AnalyseSpool.Analyser(spm);
            Verifier(cm.Genre == GenreRobinet.Reglage && cm.Designation == "Vanne de réglage Robinetterie KSB BOA-H DN80", "désignation famille + type : " + cm.Designation);
            Robinetterie.Correspondances.Clear();
            var sps = new Spool { Nom = "S" }; var cs = Acc("IMI STAF", "DN100"); cs.Type = TypeComposant.Autre; sps.Composants.Add(cs); AnalyseSpool.Analyser(sps);
            Verifier(cs.Genre == GenreRobinet.Reglage && cs.Designation == "Vanne de réglage IMI STAF DN100", "famille STAF : genre précisé : " + cs.Designation);

            // Bride dessinée dans une famille d'accessoire (catégorie vanne) : le nom de la famille en fait une bride
            Verifier(AnalyseSpool.Classer(Acc("Bride à collerette PN16", "DN100")) == TypeComposant.Bride, "bride sous famille d'accessoire : bride");
            Verifier(Robinetterie.Genre(Acc("Bride plate à souder", "DN80")) == GenreRobinet.Aucun, "bride sous famille d'accessoire : pas de symbole de vanne");
            Verifier(AnalyseSpool.Classer(Acc("Vanne à brides", "DN100")) == TypeComposant.Vanne, "« vanne à brides » reste une vanne");
            Verifier(AnalyseSpool.Classer(Acc("TECOFI VPI 4648-02 entre brides", "DN100")) == TypeComposant.Vanne, "papillon entre brides reste une vanne");
            var bp = Acc("Bride pleine", "DN100"); bp.Extremites.RemoveAt(1);
            Verifier(AnalyseSpool.Classer(bp) == TypeComposant.Bride, "bride pleine sous famille d'accessoire");
            {
                var sb = new Spool { Nom = "BR" };
                sb.Composants.Add(C("t", "Tuyau", "", TypeComposant.Tube, 100, 1000, null, E(0, 0, 0, 100, null), E(1000, 0, 0, 100, "b")));
                sb.Composants[0].Materiau = "Acier P235GH";
                var br = Acc("Bride à collerette", "DN100"); br.Id = "b"; br.Type = TypeComposant.Autre;
                br.Extremites[0].ConnecteA = "t"; br.Extremites[0].Position = new Point3(1000, 0, 0); br.Extremites[1].Position = new Point3(1080, 0, 0);
                sb.Composants.Add(br); AnalyseSpool.Analyser(sb);
                Verifier(br.Type == TypeComposant.Bride && br.Genre == GenreRobinet.Aucun && !Robinetterie.Symbolise(br) && br.Materiau == "Acier P235GH",
                    "bride sous famille d'accessoire : bride, sans symbole, matière du tube (" + br.Type + ", " + br.Designation + ", " + br.Materiau + ")");
                Verifier(sb.Nombre(NatureAssemblage.Soudure) == 1, "bride soudée au tube : 1 soudure");
            }
            Robinetterie.Correspondances[Robinetterie.Cle("Bride spéciale")] = GenreRobinet.Clapet;
            Verifier(AnalyseSpool.Classer(Acc("Bride spéciale", "DN100")) == TypeComposant.Vanne, "correspondance choisie : passe avant la bride");
            Robinetterie.Correspondances.Clear();

            // Piquage Revit (raccord à piquage avec une longueur) : la branche est piquée directement sur le collecteur
            {
                var sq = new Spool { Nom = "PQ" };
                sq.Composants.Add(C("col", "Tuyau", "", TypeComposant.Tube, 100, 2000, null, E(0, 0, 0, 100, null), E(2000, 0, 0, 100, null)));
                sq.Composants[0].Materiau = "Acier";
                var pq = C("pq", "Raccord à piquage - Soudé", "Standard", TypeComposant.Autre, 50, 0, null, E(1000, 0, 0, 100, "col"), E(1000, 0, 80, 50, "br"));
                sq.Composants.Add(pq);
                sq.Composants.Add(C("br", "Tuyau", "", TypeComposant.Tube, 50, 500, null, E(1000, 0, 80, 50, "pq"), E(1000, 0, 580, 50, null)));
                sq.Composants[2].Materiau = "Acier";
                AnalyseSpool.Analyser(sq);
                Verifier(pq.Type == TypeComposant.Piquage && pq.PiquageDirect && pq.CoteBranche == pq.Extremites[1], "piquage direct reconnu, côté branche = petit DN");
                Verifier(sq.Nombre(NatureAssemblage.Soudure) == 1 && sq.Assemblages.Single(x => x.Nature == NatureAssemblage.Soudure).Position.Z == 0,
                    "piquage : une seule soudure, sur le collecteur (" + sq.Nombre(NatureAssemblage.Soudure) + ")");
                var db = sq.Debits.Single(d => d.Tube.Id == "br");
                Verifier(db.LongueurRevitMm == 500 && db.PiquageMm == 80 && db.LongueurMm == 580, "débit de la branche : 500 + 80 de piquage = " + db.LongueurMm);
                Verifier(sq.Nomenclature.All(l => l.Type != TypeComposant.Piquage) && pq.Repere == "", "piquage : pas de pièce en nomenclature");
                var qp = Quantitatif.Calculer(new[] { sq });
                Verifier(!qp.Any(l => l.Famille.StartsWith("Raccord à piquage")), "piquage : pas de fourniture au quantitatif");
                Verifier(ListeDebit.Csv(new[] { sq }).Contains(";T2;500;80;;580;") || ListeDebit.Csv(new[] { sq }).Contains(";500;80;;580;"), "CSV débit : colonne piquage");
                // Cotes toujours à l'axe : axe du collecteur → bout de la branche ; le collecteur est coté jusqu'à l'axe du piquage
                var cq = sq.Cotes.Select(c => c.Valeur + " " + c.Libelle).OrderBy(x => x).ToList();
                Verifier(cq.Contains("580 axe / extrémité") && cq.Count(x => x == "1000 extrémité / axe" || x == "1000 axe / extrémité") == 2,
                    "piquage : axe collecteur → bout de branche (580), collecteur coupé à l'axe du piquage : " + string.Join(", ", cq));
                // Connecteur Revit sur la paroi du collecteur (z = 57) : la cote part quand même de l'axe du collecteur
                var spr = new Spool { Nom = "PR" };
                spr.Composants.Add(C("col", "Tuyau", "", TypeComposant.Tube, 100, 2000, null, E(0, 0, 0, 100, null), E(2000, 0, 0, 100, null)));
                spr.Composants.Add(C("pq", "Raccord à piquage", "Standard", TypeComposant.Autre, 50, 0, null, E(1000, 0, 57, 100, "col"), E(1000, 0, 120, 50, "br")));
                spr.Composants.Add(C("br", "Tuyau", "", TypeComposant.Tube, 50, 500, null, E(1000, 0, 120, 50, "pq"), E(1000, 0, 620, 50, "cd")));
                spr.Composants.Add(C("cd", "Coude", "", TypeComposant.Coude, 50, 0, new Point3(1000, 0, 700), E(1000, 0, 620, 50, "br"), E(1080, 0, 700, 50, null)));
                AnalyseSpool.Analyser(spr);
                var cr = spr.Cotes.Select(c => c.Valeur + " " + c.Libelle).ToList();
                Verifier(cr.Contains("700 axe / axe"), "piquage : axe du collecteur → axe du coude suivant (700) : " + string.Join(", ", cr));
                // Un weldolet reste une pièce soudée des deux côtés
                var sw = new Spool { Nom = "WO" };
                sw.Composants.Add(C("col", "Tuyau", "", TypeComposant.Tube, 100, 2000, null, E(0, 0, 0, 100, null), E(2000, 0, 0, 100, null)));
                sw.Composants.Add(C("wo", "Weldolet", "Standard", TypeComposant.Autre, 50, 0, null, E(1000, 0, 0, 100, "col"), E(1000, 0, 80, 50, "br")));
                sw.Composants.Add(C("br", "Tuyau", "", TypeComposant.Tube, 50, 500, null, E(1000, 0, 80, 50, "wo"), E(1000, 0, 580, 50, null)));
                AnalyseSpool.Analyser(sw);
                Verifier(!sw.Composants[1].PiquageDirect && sw.Nombre(NatureAssemblage.Soudure) == 1 && sw.Nomenclature.Any(l => l.Type == TypeComposant.Piquage),
                    "weldolet : pièce en nomenclature, seule la soudure sur le collecteur compte");
                // Branche dans un autre spool que le piquage : aucune soudure chantier côté branche, d'un côté comme de l'autre
                var sc = new Spool { Nom = "PC" };
                sc.Composants.Add(C("col", "Tuyau", "", TypeComposant.Tube, 100, 2000, null, E(0, 0, 0, 100, null), E(2000, 0, 0, 100, null)));
                sc.Composants.Add(C("pq", "Raccord à piquage", "Standard", TypeComposant.Autre, 50, 0, null, E(1000, 0, 0, 100, "col"), E(1000, 0, 80, 50, "AUTRE-BR")));
                AnalyseSpool.Analyser(sc);
                Verifier(sc.Nombre(NatureAssemblage.Soudure) == 1 && sc.Nombre(NatureAssemblage.RaccordementChantier) == 0, "piquage, branche dans un autre spool : rien côté branche");
                var sb2 = new Spool { Nom = "BC" };
                sb2.Composants.Add(C("br", "Tuyau", "", TypeComposant.Tube, 50, 500, null, E(1000, 0, 80, 50, "pq"), E(1000, 0, 580, 50, null)));
                sb2.Composants[0].Extremites[0].VoisinEstPiquage = true;
                AnalyseSpool.Analyser(sb2);
                Verifier(sb2.Nombre(NatureAssemblage.RaccordementChantier) == 0, "spool de la branche : pas de soudure chantier sur le piquage");
            }

            // Ligne tube – clapet – tube, arrivée du fluide par le bout gauche
            Spool Ligne(bool depuisGauche)
            {
                var sp = new Spool { Nom = "R" };
                sp.Composants.Add(C("t1", "Tuyau", "", TypeComposant.Tube, 100, 1000, null, E(0, 0, 0, 100, null), E(1000, 0, 0, 100, "v")));
                var v = C("v", "Dilatoflex", "", TypeComposant.Autre, 100, 0, null, E(1000, 0, 0, 100, "t1"), E(1190, 0, 0, 100, "t2"));
                v.Famille = "Clapet à battant"; v.EstAccessoire = true; sp.Composants.Add(v);
                sp.Composants.Add(C("t2", "Tuyau", "", TypeComposant.Tube, 100, 1000, null, E(1190, 0, 0, 100, "v"), E(2190, 0, 0, 100, null)));
                (depuisGauche ? sp.Composants[0].Extremites[0] : sp.Composants[2].Extremites[1]).Sens = SensFlux.Entree;
                AnalyseSpool.Analyser(sp);
                return sp;
            }
            var lg = Ligne(true); var vg = lg.Composants[1];
            Verifier(vg.Genre == GenreRobinet.Clapet && vg.Designation.StartsWith("Clapet à battant"), "désignation du clapet : " + vg.Designation);
            lg.Composants[0].Materiau = "Acier"; AnalyseSpool.Analyser(lg);
            Verifier(lg.Composants[1].Materiau == "", "la robinetterie n'hérite pas de la matière du tube");
            Verifier(vg.Amont != null && vg.Amont.Position.X == 1000, "écoulement de gauche à droite : amont du clapet à x = 1000");
            var pcfg = ExportPcf.Generer(lg, "");
            Verifier(pcfg.Contains("VALVE\r\n    END-POINT 1000.0 0.0 0.0 100\r\n    END-POINT 1190.0 0.0 0.0 100\r\n    SKEY CKFL\r\n    FLOW-ARROW FORWARD"), "PCF : clapet dans le sens de l'écoulement");
            var ld = Ligne(false); var vd = ld.Composants[1];
            Verifier(vd.Amont != null && vd.Amont.Position.X == 1190, "écoulement inversé : amont du clapet à x = 1190");
            Verifier(ExportPcf.Generer(ld, "").Contains("VALVE\r\n    END-POINT 1190.0 0.0 0.0 100\r\n    END-POINT 1000.0"), "PCF : points inversés avec l'écoulement");
            var dila = Acc("Dilatoflex"); dila.Type = TypeComposant.Autre;
            var sd = new Spool { Nom = "D", Composants = { dila } }; AnalyseSpool.Analyser(sd);
            Verifier(dila.Designation == "Compensateur de dilatation Dilatoflex" && ExportPcf.Generer(sd, "").Contains("MISC-COMPONENT"), "compensateur : désignation et PCF (" + dila.Designation + ")");

            // Symboles : chaque genre a le sien ; placés selon l'axe du tube
            var vus = new HashSet<int>();
            foreach (GenreRobinet g in Enum.GetValues(typeof(GenreRobinet)))
                if (g != GenreRobinet.Aucun) vus.Add(Robinetterie.Symbole(g).Count * 100 + (int)Math.Round(Robinetterie.Symbole(g).Sum(x => x.U1 + x.V2) * 10));
            Verifier(vus.Count == 11, "11 symboles différents : " + vus.Count);
            var pl = Robinetterie.Placer(new List<Robinetterie.Segment> { new Robinetterie.Segment(1, 0, 0, 1) }, 10, 20, 0, 1);
            Verifier(Math.Abs(pl[0].x1 - 10) < 1e-9 && Math.Abs(pl[0].y1 - 21) < 1e-9 && Math.Abs(pl[0].x2 - 9) < 1e-9 && Math.Abs(pl[0].y2 - 20) < 1e-9, "symbole tourné sur l'axe du tube");
        }

        // Placement des étiquettes sans chevauchement
        {
            var zone = new Rect(0, 0, 200, 150);
            var obs = new Obstacles();
            // Tuyauterie : une ligne horizontale et une verticale ; une cote et un cartouche déjà posés
            obs.Traits.Add((20, 75, 180, 75)); obs.Traits.Add((100, 20, 100, 130));
            obs.Durs.Add(new Rect(60, 80, 80, 86));
            var ets = new List<Etiquette>();
            // 25 étiquettes ancrées presque au même endroit : le pire cas (brides serrées autour d'une vanne)
            for (int i = 0; i < 25; i++)
                ets.Add(new Etiquette { Texte = (i + 1).ToString(), Largeur = 4.8, Hauteur = 4.8, Ancrages = { (95 + i * 0.4, 75) }, Direction = (0, 1) });
            for (int i = 0; i < 6; i++)
                ets.Add(new Etiquette { Texte = "T" + i, Largeur = 6.8, Hauteur = 4.2, Ancrages = { (30 + i * 3, 75), (40 + i * 3, 75) }, Direction = (0, 1) });
            for (int i = 0; i < 8; i++)
                ets.Add(new Etiquette { Texte = "S" + i, Largeur = 4, Hauteur = 2.4, Ancrages = { (100, 30 + i * 2) }, DistanceMin = 1.5, DistanceMax = 12, Rappel = false });
            PlacementEtiquettes.Placer(ets, obs, zone);
            int chevauchements = 0;
            for (int i = 0; i < ets.Count; i++)
                for (int j = i + 1; j < ets.Count; j++)
                    if (PlacementEtiquettes.Recouvre(ets[i].Cadre, ets[j].Cadre)) chevauchements++;
            Verifier(chevauchements == 0 && ets.All(x => !x.Chevauche), "aucune étiquette ne se chevauche (" + chevauchements + ")");
            Verifier(ets.All(x => !PlacementEtiquettes.Recouvre(x.Cadre, new Rect(60, 80, 80, 86))), "aucune étiquette sur la cote / le cartouche");
            Verifier(ets.All(x => x.Cadre.X0 >= 0 && x.Cadre.Y0 >= 0 && x.Cadre.X1 <= 200 && x.Cadre.Y1 <= 150), "toutes dans la zone");
            // Cas saturé (25 bulles au même point) : quelques-unes peuvent mordre un tube plutôt que croiser d'autres bulles
            Verifier(ets.Take(25).Count(x => PlacementEtiquettes.Coupe(x.Cadre, (20, 75, 180, 75)) || PlacementEtiquettes.Coupe(x.Cadre, (100, 20, 100, 130))) <= 6, "cas saturé : peu de bulles sur la tuyauterie");
            // Cas courant : bulles réparties le long d'une ligne coudée, jamais sur la tuyauterie
            var obs2 = new Obstacles(); obs2.Traits.Add((20, 40, 120, 40)); obs2.Traits.Add((120, 40, 120, 120));
            var ets2 = Enumerable.Range(0, 12).Select(i => new Etiquette { Largeur = 4.8, Hauteur = 4.8, Direction = (0, 1),
                Ancrages = { i < 6 ? (25 + i * 16.0, 40.0) : (120.0, 50 + (i - 6) * 12.0) } }).ToList();
            PlacementEtiquettes.Placer(ets2, obs2, zone);
            Verifier(ets2.All(x => !PlacementEtiquettes.Coupe(x.Cadre, (20, 40, 120, 40)) && !PlacementEtiquettes.Coupe(x.Cadre, (120, 40, 120, 120))), "cas courant : aucune bulle sur la tuyauterie");
            var seule = new Etiquette { Largeur = 4.8, Hauteur = 4.8, Ancrages = { (50, 50) }, Direction = (0, 1) };
            PlacementEtiquettes.Placer(new[] { seule }, new Obstacles(), zone);
            Verifier(Math.Abs(seule.X - 50) < 0.01 && seule.Y > 50 && seule.Y < 60, "sans gêne : au plus près, dans la direction préférée");
            Verifier(PlacementEtiquettes.Coupe(new Rect(0, 0, 10, 10), (-5, 5, 15, 5)) && !PlacementEtiquettes.Coupe(new Rect(0, 0, 10, 10), (-5, 15, 15, 15)), "segment / rectangle");
            Verifier(PlacementEtiquettes.Croise((0, 0, 10, 10), (0, 10, 10, 0)) && !PlacementEtiquettes.Croise((0, 0, 10, 0), (0, 5, 10, 5)), "segments croisés");
        }

        // Légende des symboles
        {
            var toutes = Legende.Toutes().ToList();
            Verifier(toutes.Count == 19 && toutes.All(t => Legende.Dessin(t.Code).Traits.Count > 0), "légende : 19 symboles, tous dessinés");
            Verifier(toutes.All(t => Legende.Dessin(t.Code).Traits.All(x => Math.Abs(x.U1) <= 11 && Math.Abs(x.U2) <= 11 && Math.Abs(x.V1) <= 3.6 && Math.Abs(x.V2) <= 3.6)),
                "chaque symbole tient dans sa case (22 × 7 mm)");
            var spl = Exemple(); AnalyseSpool.Analyser(spl);
            var codes = Legende.Pour(spl).Select(x => x.Code).ToList();
            Verifier(codes.Contains("SOUD") && codes.Contains("TUBE") && codes.Contains("COTE") && !codes.Contains("PAPILLON") && !codes.Contains("SOUDCH"),
                "légende de l'isométrie : seulement les symboles présents (" + string.Join(",", codes) + ")");
            var tleg = Legende.Compacte(Legende.Pour(spl));
            Verifier(tleg.Titre == "LÉGENDE" && tleg.Largeur == 168 && tleg.Lignes.Count == (codes.Count + 1) / 2 && tleg.Lignes.All(l => l[0].StartsWith(Legende.Marque))
                && Math.Abs(tleg.Hauteur(5) - (1 + tleg.Lignes.Count * 1.5) * 5) < 1e-9, "légende compacte : deux symboles par ligne, 168 mm");
            var compl = Legende.Compacte(Legende.Toutes());
            Verifier(compl.Lignes.SelectMany(l => new[] { l[1], l[3] }).All(x => MiseEnPage.Tronquer(x, 62, 2.5) == x), "légende compacte : aucun libellé tronqué");
            var tout = Legende.Tableau(Legende.Toutes());
            Verifier(tout.Lignes.Count == 19 && tout.Largeur <= 130.001, "légende complète : 19 lignes");
            // Bride : symbole collet + bride tournante ; face de joint du côté qui n'est pas soudé au tube
            Verifier(Legende.Pour(s0BR()).Any(x => x.Code == "BRIDE"), "bride dans la légende de l'isométrie");
        }

        // Liste de débit : longueur de l'élément Revit, système de canalisation, calepinage en barres de 6 m
        {
            var sd = Exemple(); sd.SurlongueurMm = 0;
            foreach (var c in sd.Composants) c.TypeSysteme = "Eau glacée départ";
            AnalyseSpool.Analyser(sd);
            var d1 = sd.Debits[0];
            Verifier(d1.LongueurRevitMm == 924 && d1.LongueurMm == 924 && d1.Systeme == "Eau glacée départ", "débit : longueur Revit et système de canalisation");
            var tdeb = MiseEnPage.Tableaux(sd, "", "").First(t => t.Titre == "LISTE DE DÉBIT");
            Verifier(tdeb.Largeur <= 130.001 && tdeb.Colonnes.Last().Titre == "Système de canalisation" && tdeb.Lignes[0][2] == "924" && tdeb.Lignes[0][5] == "Eau glacée départ",
                "tableau de débit : longueur Revit, coupe, système");
            // Deux spools, deux systèmes ; barres de 6 m, trait de scie 3 mm : 5000 → barre 1 (reste 997) ; 2500, 2400 → barre 2 ;
            // 1000 ne tient plus dans les 997 mm de la barre 1 → barre 2 (reste 1094)
            Spool Tubes(string nom, string sys, params double[] lg)
            {
                var sp = new Spool { Nom = nom };
                for (int i = 0; i < lg.Length; i++)
                {
                    var c = C(nom + i, "Tuyau", "Acier", TypeComposant.Tube, 100, lg[i], null, E(0, i * 1000, 0, 100, null), E(lg[i], i * 1000, 0, 100, null));
                    c.TypeSysteme = sys; c.Materiau = "Acier"; sp.Composants.Add(c);
                }
                AnalyseSpool.Analyser(sp);
                return sp;
            }
            var ld = ListeDebit.Calculer(new[] { Tubes("SP-1", "Eau glacée départ", 5000, 2400), Tubes("SP-2", "Eau glacée départ", 2500, 1000), Tubes("SP-3", "Eau glacée retour", 7000) });
            var egd = ld.Where(l => l.Systeme == "Eau glacée départ").ToList();
            Verifier(egd.Select(l => l.CoupeMm).SequenceEqual(new double[] { 5000, 2500, 2400, 1000 }) && egd.Select(l => l.Barre).SequenceEqual(new[] { 1, 2, 2, 2 }),
                "calepinage : " + string.Join(",", egd.Select(l => l.CoupeMm + "→" + l.Barre)));
            Verifier(ListeDebit.Barres(egd) == 2 && ld.First(l => l.Systeme == "Eau glacée retour").Barre == 0, "2 barres ; tube de 7 m hors barre");
            var csvd = ListeDebit.Csv(new[] { Tubes("SP-1", "Eau glacée départ", 5000) });
            Verifier(csvd.StartsWith("Système de canalisation;DN;Matière;Spool;Rep.;Longueur Revit (mm)") && csvd.Contains("Eau glacée départ;DN100;Acier;SP-1;T1;5000;;;5000;1"), "CSV liste de débit");
        }

        // Traits trop courts pour Revit : redécoupage en cordes ≥ 1,25 mm (cause d'arrêt de la génération)
        {
            var tous = new List<(double, double, double, double)>();
            foreach (GenreRobinet g in Enum.GetValues(typeof(GenreRobinet)))
                if (g != GenreRobinet.Aucun) tous.AddRange(Robinetterie.Placer(Robinetterie.Symbole(g), 100, 100, 1, 0));
            foreach (var t in Legende.Toutes()) tous.AddRange(Legende.Dessin(t.Code).Traits.Select(x => (x.U1, x.V1, x.U2, x.V2)));
            var cordes = Cordes.Decouper(tous);
            Verifier(cordes.All(c => Math.Sqrt((c.x2 - c.x1) * (c.x2 - c.x1) + (c.y2 - c.y1) * (c.y2 - c.y1)) >= 1.25 - 1e-9), "aucun trait de moins de 1,25 mm");
            // Petit cercle (r = 0,73 mm, 12 segments de 0,38 mm) : toujours dessiné, en quelques cordes
            var cercle = Robinetterie.Symbole(GenreRobinet.Papillon).Skip(5).Take(12).Select(x => (x.U1, x.V1, x.U2, x.V2)).ToList();
            var cc = Cordes.Decouper(cercle);
            Verifier(cercle.All(x => Math.Sqrt((x.Item3 - x.Item1) * (x.Item3 - x.Item1) + (x.Item4 - x.Item2) * (x.Item4 - x.Item2)) < 1.25) && cc.Count >= 2,
                "petit cercle du papillon redécoupé en " + cc.Count + " cordes");
            Verifier(Cordes.Decouper(new[] { (0.0, 0.0, 0.5, 0.0) }).Count == 0 && Cordes.Decouper(new[] { (0.0, 0.0, 5.0, 0.0) }).Count == 1, "segment isolé trop court abandonné, long conservé");
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
        Verifier(MiseEnPage.Tronquer("Coude soudé inox 316L à grand rayon", 30, 2.5).EndsWith("…") && MiseEnPage.LargeurTexte(MiseEnPage.Tronquer("Coude soudé inox 316L à grand rayon", 30, 2.5), 2.5) <= 27, "texte tronqué : " + MiseEnPage.Tronquer("Coude soudé inox 316L à grand rayon", 30, 2.5));

        // Tri naturel des spools
        var noms = new List<string> { "SP-10", "SP-2", "SP-1", "A", "SP-02b" };
        noms.Sort(AnalyseSpool.ComparerNaturel);
        Verifier(string.Join(",", noms) == "A,SP-1,SP-2,SP-02b,SP-10", "tri naturel : " + string.Join(",", noms));
        Verifier(Diametres.Pouces(50) == 2 && Diametres.Pouces(65) == 2.5 && Diametres.Pouces(100) == 4, "pouces-diamètre");

        Console.WriteLine(echecs == 0 ? $"OK : {total} vérifications" : $"{echecs} échec(s) sur {total}");
        return echecs == 0 ? 0 : 1;
    }
}
