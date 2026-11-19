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

    static void TestHydraulique()
    {
        // Fluides : valeurs de référence
        var e20 = Fluide.Eau(20); var e80 = Fluide.Eau(80); var a20 = Fluide.Air(20);
        Verifier(Math.Abs(e20.Rho - 998.2) < 0.5 && Math.Abs(e20.Nu * 1e6 - 1.004) < 0.02, "eau 20 °C : 998 kg/m³, 1,00 mm²/s (" + e20.Rho.ToString("0.0") + ", " + (e20.Nu * 1e6).ToString("0.000") + ")");
        Verifier(Math.Abs(e80.Rho - 971.8) < 0.8 && Math.Abs(e80.Nu * 1e6 - 0.365) < 0.02, "eau 80 °C : 972 kg/m³, 0,365 mm²/s (" + e80.Rho.ToString("0.0") + ", " + (e80.Nu * 1e6).ToString("0.000") + ")");
        Verifier(Math.Abs(a20.Rho - 1.204) < 0.01 && Math.Abs(a20.Nu * 1e6 - 15.1) < 0.3, "air 20 °C : 1,20 kg/m³, 15,1 mm²/s");
        var g = Fluide.EauGlycolee(20, 30, false);
        Verifier(g.Rho > 1030 && g.Rho < 1050 && g.Nu > 1.8 * e20.Nu && g.Nu < 2.8 * e20.Nu, "MEG 30 % : plus dense et plus visqueux que l'eau");
        // Frottement : laminaire, lisse (Blasius), rugueux
        Verifier(Math.Abs(PerteCharge.Lambda(1000, 0) - 0.064) < 1e-9, "laminaire : 64/Re");
        Verifier(Math.Abs(PerteCharge.Lambda(1e5, 0) - 0.0180) < 0.0005, "Colebrook lisse Re 1e5 : 0,018");
        Verifier(Math.Abs(PerteCharge.Lambda(1e7, 0.01) - 0.0379) < 0.0006, "Colebrook rugueux ε/D 0,01 : 0,038");
        // Acier DN50 (Ø int. 54,5), 10 m³/h d'eau à 20 °C : 1,19 m/s, environ 300 Pa/m
        var t = new Troncon { DiametreMm = 54.5, LongueurM = 10, RugositeMm = 0.045, DebitM3h = 10 };
        PerteCharge.Calculer(t, e20);
        Verifier(Math.Abs(t.VitesseMs - 1.19) < 0.01 && t.PerteLineairePaM > 280 && t.PerteLineairePaM < 320 && Math.Abs(t.PerteLineairePa - t.PerteLineairePaM * 10) < 1e-6,
            "DN50 10 m³/h : 1,19 m/s, ≈ 300 Pa/m (" + t.VitesseMs.ToString("0.00") + " m/s, " + t.PerteLineairePaM.ToString("0") + " Pa/m)");
        // Singulière : ζ × ρv²/2
        var c = new Troncon { DiametreMm = 54.5, DebitM3h = 10, Zeta = PerteCharge.ZetaHydraulique(TypeComposant.Coude, GenreRobinet.Aucun, 90) };
        PerteCharge.Calculer(c, e20);
        Verifier(Math.Abs(c.PerteSinguliere - 0.3 * 998.2 * 1.19 * 1.19 / 2) < 5 && c.PerteLineairePa == 0, "coude 90° : 0,3 × ρv²/2 (" + c.PerteSinguliere.ToString("0") + " Pa)");
        Verifier(PerteCharge.ZetaHydraulique(TypeComposant.Coude, GenreRobinet.Aucun, 45) == 0.15 && PerteCharge.ZetaHydraulique(TypeComposant.Te, GenreRobinet.Aucun, 0, true) == 1.3
            && PerteCharge.ZetaHydraulique(TypeComposant.Vanne, GenreRobinet.Clapet) == 2 && PerteCharge.ZetaHydraulique(TypeComposant.Vanne, GenreRobinet.Reglage) == 6, "ζ par défaut");
        var r = PerteCharge.Hydraulique(new[] { t, c, new Troncon { DiametreMm = 54.5, DebitM3h = 30, LongueurM = 1 } }, e20);
        Verifier(Math.Abs(r.TotalPa - (t.PerteTotalePa + c.PerteTotalePa + r.Troncons[2].PerteTotalePa)) < 1e-6 && r.Troncons[2].Alerte.Contains("vitesse") && r.Troncons[0].Alerte.Contains("Pa/m") && r.Troncons[1].Alerte == ""
            && Math.Abs(r.TotalMce(e20) - r.TotalPa / (998.2 * 9.80665)) < 0.01, "total, mCE et alerte de vitesse");
        // Té : ζ selon les débits, rapporté à la vitesse de sortie ; perte = ζc × ρvc²/2
        {
            double ac = PerteCharge.AireRonde(107.1), ab = PerteCharge.AireRonde(37.2);  // DN100 / DN32
            var zb = PerteCharge.ZetaTe(30, ac, 2, ab, true).Value;
            double vc = 30 / 3600.0 / ac, vb = 2 / 3600.0 / ab;
            var tb = new Troncon { DiametreMm = 37.2, DebitM3h = 2, Zeta = zb }; PerteCharge.Calculer(tb, e20);
            var attendu = 0.9 * (1 + Math.Pow(vb / vc, 2)) * 998.2 * vc * vc / 2;
            Verifier(Math.Abs(tb.PerteSinguliere - attendu) < 0.02 * attendu && tb.VitesseMs < 0.6, "té DN100 30 m³/h → dérivation DN32 2 m³/h : vitesse de la branche ("
                + tb.VitesseMs.ToString("0.00") + " m/s), perte " + tb.PerteSinguliere.ToString("0") + " Pa ≈ " + attendu.ToString("0"));
            // Ancien calcul (Ø de la branche avec le débit du collecteur) : perte plus de 100 fois trop forte
            var faux = new Troncon { DiametreMm = 37.2, DebitM3h = 30, Zeta = 1.3 }; PerteCharge.Calculer(faux, e20);
            Verifier(faux.PerteSinguliere > 50 * tb.PerteSinguliere, "l'ancien calcul surestimait la dérivation (" + faux.PerteSinguliere.ToString("0") + " Pa)");
            var zp = PerteCharge.ZetaTe(30, ac, 28, ac, false).Value;
            Verifier(zp >= 0 && zp < 0.01, "té passage, débit presque inchangé : perte quasi nulle (ζ " + zp + ")");
            Verifier(Math.Abs(PerteCharge.ZetaTe(10, ac, 10, ac, true).Value - 1.8) < 1e-9, "dérivation à vitesse égale : ζ 1,8");
            Verifier(PerteCharge.ZetaTe(0, ac, 2, ab, true) == null, "débits inconnus : ζ par défaut");
        }
        // Air : Ø315, 1500 m³/h : 5,35 m/s, ≈ 1,1 Pa/m ; rectangulaire 400×200
        var ga = new Troncon { DiametreMm = 315, LongueurM = 5, RugositeMm = 0.15, DebitM3h = 1500 };
        PerteCharge.Calculer(ga, a20);
        Verifier(Math.Abs(ga.VitesseMs - 5.35) < 0.02 && ga.PerteLineairePaM > 0.95 && ga.PerteLineairePaM < 1.3, "Ø315 1500 m³/h : 5,35 m/s, ≈ 1,1 Pa/m (" + ga.PerteLineairePaM.ToString("0.00") + ")");
        var gr = new Troncon { LargeurMm = 400, HauteurMm = 200, LongueurM = 1, RugositeMm = 0.15, DebitM3h = 1440 };
        PerteCharge.Calculer(gr, a20);
        Verifier(Math.Abs(gr.VitesseMs - 5.0) < 0.001 && Math.Abs(gr.DiametreHydrauliqueM - 0.2667) < 0.001 && gr.Section == "400×200", "400×200, 1440 m³/h : 5 m/s, Dh 267 mm");
        Verifier(PerteCharge.Aeraulique(new[] { gr }, a20, 4).Troncons[0].Alerte.Contains("vitesse"), "air : alerte au-delà de la vitesse maximale");
        Verifier(PerteCharge.Aeraulique(new[] { new Troncon { Nature = "Bouche", DiametreMm = 200, DebitM3h = 300 } }, a20).Troncons[0].Alerte.Contains("bouche")
            && PerteCharge.Aeraulique(new[] { new Troncon { Nature = "Bouche", DiametreMm = 200, DebitM3h = 300, PerteFixePa = 20 } }, a20).Troncons[0].Alerte == "", "bouche : perte fabricant à saisir");
        Verifier(PerteCharge.OrganeParNom("Clapet coupe-feu CF 2h") == PerteCharge.OrganeAir.CoupeFeu && PerteCharge.OrganeParNom("Bouche d'extraction") == PerteCharge.OrganeAir.Bouche
            && PerteCharge.OrganeParNom("Registre de réglage") == PerteCharge.OrganeAir.Registre && PerteCharge.OrganeParNom("Coude 90 rond") == PerteCharge.OrganeAir.Coude, "organes de ventilation par le nom");
        // Dimensionnement
        Verifier(PerteCharge.DiametreRond(1500, 5) == 355 && PerteCharge.DiametreRond(1500, 6) == 315, "Ø normalisé pour 1500 m³/h : 355 à 5 m/s, 315 à 6 m/s");
        Verifier(PerteCharge.Rectangulaire(1440, 4, 200) == (500, 200), "rectangulaire 1440 m³/h à 4 m/s, h 200 : 500×200");
        // Débits d'un arbre : CTA → gaine A → (té) → B → bouche 1 (300) ; → C → bouches 2 et 3 (200 + 100)
        var v = new Dictionary<string, List<string>>
        {
            ["CTA"] = new List<string> { "A" }, ["A"] = new List<string> { "CTA", "T" }, ["T"] = new List<string> { "A", "B", "C" },
            ["B"] = new List<string> { "T", "b1" }, ["C"] = new List<string> { "T", "b2", "b3" }, ["b1"] = new List<string> { "B" }, ["b2"] = new List<string> { "C" }, ["b3"] = new List<string> { "C" },
        };
        var q = PerteCharge.DebitsArbre(v, new Dictionary<string, double> { ["b1"] = 300, ["b2"] = 200, ["b3"] = 100 }, "CTA");
        var chem = PerteCharge.Chemins(v, "CTA", new[] { "b1", "b2", "b3", "isolée" });
        Verifier(chem.Count == 3 && string.Join(">", chem["b2"]) == "A>T>C>b2" && string.Join(">", chem["b1"]) == "A>T>B>b1", "chemins de la CTA vers chaque bouche");
        Verifier(q["A"] == 600 && q["T"] == 600 && q["B"] == 300 && q["C"] == 300 && q["b2"] == 200 && q["CTA"] == 600, "débits de l'arbre : somme des bouches en aval");
        // Note de calcul Excel : chemin hydraulique type (pompe → CTA) et réseau de ventilation
        {
            var e45 = Fluide.EauGlycolee(7, 30, false);
            var ch = new List<Troncon>
            {
                new Troncon { Repere = "T1", Designation = "Tube acier DN80", DiametreMm = 82.5, LongueurM = 12.4, DebitM3h = 18 },
                new Troncon { Repere = "2", Designation = "Coude 90°", DiametreMm = 82.5, DebitM3h = 18, Zeta = PerteCharge.ZetaHydraulique(TypeComposant.Coude, GenreRobinet.Aucun) },
                new Troncon { Repere = "5", Designation = "Vanne papillon TECOFI VPI 4648", DiametreMm = 82.5, DebitM3h = 18, Zeta = PerteCharge.ZetaHydraulique(TypeComposant.Vanne, GenreRobinet.Papillon) },
                new Troncon { Repere = "6", Designation = "Filtre TECOFI F 3240", DiametreMm = 82.5, DebitM3h = 18, Zeta = PerteCharge.ZetaHydraulique(TypeComposant.Vanne, GenreRobinet.Filtre) },
                new Troncon { Repere = "7", Designation = "Vanne de réglage IMI STAF", DiametreMm = 82.5, DebitM3h = 18, Zeta = PerteCharge.ZetaHydraulique(TypeComposant.Vanne, GenreRobinet.Reglage) },
                new Troncon { Repere = "T2", Designation = "Tube acier DN80", DiametreMm = 82.5, LongueurM = 8.6, DebitM3h = 18 },
                new Troncon { Repere = "9", Designation = "Batterie froide CTA (fabricant)", DiametreMm = 82.5, DebitM3h = 18, PerteFixePa = 25000 },
            };
            var rh = PerteCharge.Hydraulique(ch, e45);
            var xh = ExportCalcul.PerteCharge(rh, e45, "Perte de charge hydraulique", "Démonstration", new[] { "Chemin pompe P2 → CTA-03" }, false, new DateTime(2026, 11, 18, 10, 0, 0));
            var ventil = new List<Troncon>
            {
                new Troncon { Repere = "G1", Designation = "Gaine 600×300", LargeurMm = 600, HauteurMm = 300, LongueurM = 8, RugositeMm = 0.15, DebitM3h = 3000 },
                new Troncon { Repere = "R2", Designation = "Coude 90° rect.", LargeurMm = 600, HauteurMm = 300, DebitM3h = 3000, Zeta = PerteCharge.ZetaAir(PerteCharge.OrganeAir.Coude, false) },
                new Troncon { Repere = "R3", Designation = "Clapet coupe-feu", LargeurMm = 600, HauteurMm = 300, DebitM3h = 3000, Zeta = PerteCharge.ZetaAir(PerteCharge.OrganeAir.CoupeFeu, false) },
                new Troncon { Repere = "G4", Designation = "Gaine Ø315", DiametreMm = 315, LongueurM = 6, RugositeMm = 0.15, DebitM3h = 1500 },
                new Troncon { Repere = "B5", Nature = "Bouche", Designation = "Bouche de soufflage", DiametreMm = 200, DebitM3h = 300, PerteFixePa = 25 },
            };
            var ra = PerteCharge.Aeraulique(ventil, Fluide.Air(20));
            var xa = ExportCalcul.PerteCharge(ra, Fluide.Air(20), "Perte de charge aéraulique", "Démonstration", new[]
            {
                "Chemin calculé : CTA-01 → bouche B5 (300 m³/h) – " + ra.TotalPa.ToString("0") + " Pa. Pression du réseau au ventilateur (chemin le plus défavorisé) : " + ra.TotalPa.ToString("0") + " Pa.",
            }, true, new DateTime(2026, 11, 18, 10, 0, 0));
            foreach (var x in new[] { xh, xa })
                using (var z = new System.IO.Compression.ZipArchive(new System.IO.MemoryStream(x)))
                    foreach (var en in z.Entries.Where(en => en.FullName.EndsWith(".xml"))) System.Xml.Linq.XDocument.Load(en.Open());
            Verifier(rh.TotalPa > 25000 && ra.Troncons[0].VitesseMs > 4.6 && ra.Troncons[0].VitesseMs < 4.7, "notes de calcul hydraulique et aéraulique");
            // Note de calcul éditable : PDF et Excel
            var note = new NoteCalcul
            {
                Titre = "Note de calcul – perte de charge hydraulique", Projet = "Démonstration Pipe-Fit", Affaire = "2026-118", Indice = "B", Redacteur = "C. Vert",
                Verificateur = "J. Martin", Societe = "TECNITUB", Objet = "Vérification de la hauteur manométrique de la pompe P2 sur le circuit eau glacée pompe P2 → CTA-03 (DN80).",
                Date = new DateTime(2026, 11, 18), Fluide = e45, Resultat = rh, Hypotheses = { "Débit de calcul 18 m³/h (puissance froid 105 kW, ΔT 5 K).", "Vannes pleine ouverture ; batterie froide : perte fabricant 25 kPa." },
            };
            var pdfOctets = note.Pdf();
            var debut = System.Text.Encoding.ASCII.GetString(pdfOctets, 0, 8);
            var fin = System.Text.Encoding.ASCII.GetString(pdfOctets, pdfOctets.Length - 6, 6);
            Verifier(debut.StartsWith("%PDF-1.4") && fin.Contains("%%EOF") && note.ConclusionProposee().Contains("kPa"), "note de calcul : PDF valide, conclusion proposée");
            Verifier(PdfSimple.Transcrire("ΔP λ ζ ρ") == "Delta P lambda zeta rho" && PdfSimple.Couper("un deux trois quatre cinq six sept", 60, 9).Count > 1, "PDF : lettres grecques transcrites, lignes coupées");
            var noteXl = note.Excel();
            using (var z = new System.IO.Compression.ZipArchive(new System.IO.MemoryStream(noteXl)))
                Verifier(new System.IO.StreamReader(z.GetEntry("xl/worksheets/sheet1.xml").Open()).ReadToEnd().Contains("Conclusion"), "note de calcul : Excel avec conclusion");
            // Note longue : plusieurs pages, en-têtes répétés
            var longue = new NoteCalcul { Fluide = e45, Resultat = PerteCharge.Hydraulique(Enumerable.Range(1, 90).Select(i => new Troncon { Repere = "T" + i, Designation = "Tube acier DN80 n° " + i, DiametreMm = 82.5, LongueurM = 2, DebitM3h = 18 }).ToList(), e45) };
            var pl = longue.Pdf();
            var txt = System.Text.Encoding.ASCII.GetString(pl);
            Verifier(System.Text.RegularExpressions.Regex.Matches(txt, "/Type /Page /").Count >= 3, "note longue : plusieurs pages");
            var dossier = Environment.GetEnvironmentVariable("PIPEFIT_CALC");
            if (!string.IsNullOrEmpty(dossier))
            {
                System.IO.File.WriteAllBytes(System.IO.Path.Combine(dossier, "Perte de charge hydraulique (exemple).xlsx"), xh);
                System.IO.File.WriteAllBytes(System.IO.Path.Combine(dossier, "Perte de charge aéraulique (exemple).xlsx"), xa);
                System.IO.File.WriteAllBytes(System.IO.Path.Combine(dossier, "Note de calcul hydraulique (exemple).pdf"), pdfOctets);
                System.IO.File.WriteAllBytes(System.IO.Path.Combine(dossier, "Note de calcul hydraulique (exemple).xlsx"), noteXl);
                System.IO.File.WriteAllBytes(System.IO.Path.Combine(dossier, "note-longue.pdf"), pl);
            }
        }
    }

    static void TestPertesFabricant()
    {
        foreach (var n in new[] { "Perte de charge", "Pressure Drop", "ΔP (kPa)", "Chute de pression mbar", "Dp_mCE", "Perte de charge eau (kPa)", "Druckverlust", "PDC" })
            Verifier(PertesFabricant.EstNomPerte(n), "nom de perte de charge reconnu : " + n);
        foreach (var n in new[] { "Coefficient de perte de charge", "Méthode de perte de charge", "Débit", "Diamètre", PertesFabricant.NomBouche, "Pression statique" })
            Verifier(!PertesFabricant.EstNomPerte(n), "pas une perte de charge : " + n);
        Verifier(PertesFabricant.DepuisNombre("ΔP (kPa)", 12) == 12000 && PertesFabricant.DepuisNombre("Perte de charge mbar", 3) == 300
            && Math.Abs(PertesFabricant.DepuisNombre("Dp_mCE", 2) - 19613.3) < 0.1 && PertesFabricant.DepuisNombre("Pressure Drop", 25) == 25
            && PertesFabricant.DepuisNombre("Perte de charge bar", 0.5) == 50000, "conversion d'après l'unité du nom");
        Verifier(PertesFabricant.DepuisTexte("25 Pa") == 25 && PertesFabricant.DepuisTexte("0,3 bar") == 30000 && Math.Abs(PertesFabricant.DepuisTexte("2,5 mCE").Value - 24516.6) < 0.1
            && PertesFabricant.DepuisTexte("12", "Perte de charge (kPa)") == 12000 && PertesFabricant.DepuisTexte("n.c.") == null && PertesFabricant.DepuisTexte("15 mmCE") == 15 * 9.80665,
            "lecture d'une perte de charge écrite en texte");
        foreach (var n in new[] { "Débit", "Débit d'air", "Airflow", "Flow", "Débit eau (l/s)", "Water Flow", "Q nominal", "Volumenstrom" })
            Verifier(PertesFabricant.EstNomDebit(n), "nom de débit reconnu : " + n);
        foreach (var n in new[] { "Coefficient de débit", "Kvs", "Configuration du débit", "Direction du débit", "Méthode de débit", PertesFabricant.NomDebitAeraulique, "Perte de charge", "Vitesse" })
            Verifier(!PertesFabricant.EstNomDebit(n), "pas un débit : " + n);
        Verifier(PertesFabricant.DebitDepuisNombre("Débit (l/s)", 100) == 360 && PertesFabricant.DebitDepuisNombre("Airflow cfm", 1000) == 1699.01
            && PertesFabricant.DebitDepuisNombre("Débit m3/s", 0.5) == 1800 && PertesFabricant.DebitDepuisNombre("Débit", 1200) == 1200 && PertesFabricant.DebitDepuisNombre("Débit l/h", 500) == 0.5,
            "débit converti d'après l'unité du nom");
        Verifier(PertesFabricant.DebitDepuisTexte("85 l/s") == 306 && PertesFabricant.DebitDepuisTexte("1 200") == null || PertesFabricant.DebitDepuisTexte("1200 m³/h") == 1200, "débit écrit en texte");
    }

    /// <summary>Réseau d'essai : groupe froid → pompe → collecteur → CTA et 2 ventilo-convecteurs, retour en boucle ; réseau de gaines.</summary>
    public static (List<NoeudSchema> Noeuds, List<(string, string)> Liens) ReseauEssai()
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

    static void TestSchema()
    {
        // P&ID par systèmes : proposition et enregistrement
        var types = new[]
        {
            new TypeSystemeInfo { Nom = "Eau glacée départ", Abreviation = "EG-D" }, new TypeSystemeInfo { Nom = "Eau glacée retour", Abreviation = "EG-R" },
            new TypeSystemeInfo { Nom = "Chauffage aller", Abreviation = "CH-A" }, new TypeSystemeInfo { Nom = "Chauffage retour", Abreviation = "CH-R" },
            new TypeSystemeInfo { Nom = "Soufflage", Air = true }, new TypeSystemeInfo { Nom = "Reprise", Air = true }, new TypeSystemeInfo { Nom = "Gaz naturel", Abreviation = "GAZ" },
        };
        var prop = DefinitionsPid.Proposer(types);
        Verifier(prop.Count == 4 && prop[0].Nom == "PID chaud" && prop[0].Systemes.Count == 2 && prop[1].Systemes.Contains("Eau glacée retour") && prop[2].Systemes.Count == 2
            && prop[3].Systemes.Single() == "Gaz naturel", "P&ID proposés : chaud, froid, aéraulique, autres");
        prop[0].Nom = "PID chaufferie ¦ RDC";
        var relu = DefinitionsPid.Lire(DefinitionsPid.Ecrire(prop));
        Verifier(relu.Count == 4 && relu[0].Nom == "PID chaufferie   RDC" && relu[1].Systemes.SequenceEqual(prop[1].Systemes), "P&ID : définitions relues telles qu'écrites");

        // Symbole du schéma d'après le seul nom de la famille, comme les isométries
        Verifier(Schema.Classer(CategorieSchema.Accessoire, "TECOFI CB 3448N") == (NatureSchema.Vanne, GenreRobinet.Clapet, false), "P&ID : clapet par le nom de famille");
        Verifier(Schema.Classer(CategorieSchema.Accessoire, "Bride à collerette PN16").Nature == NatureSchema.Ligne, "P&ID : bride dessinée en famille de vanne → ligne, pas de vanne");
        Verifier(Schema.Classer(CategorieSchema.Accessoire, "Réduction concentrique").Nature == NatureSchema.Reduction, "P&ID : réduction dessinée en accessoire");
        Verifier(Schema.Classer(CategorieSchema.Accessoire, "Robinetterie KSB").Genre == GenreRobinet.Vanne, "P&ID : famille muette → vanne par défaut");
        Verifier(Schema.Classer(CategorieSchema.Raccord, "Vanne papillon soudée").Genre == GenreRobinet.Papillon && Schema.Classer(CategorieSchema.Raccord, "Té égal").Nature == NatureSchema.Te
            && Schema.Classer(CategorieSchema.Raccord, "Coude 90", NatureSchema.Ligne).Nature == NatureSchema.Ligne && Schema.Classer(CategorieSchema.Raccord, "Raccord générique", NatureSchema.Te).Nature == NatureSchema.Te,
            "P&ID : raccords (vanne en raccord, té par le nom, sinon type de pièce Revit)");
        Verifier(Schema.Classer(CategorieSchema.Equipement, "Pompe double Wilo").Nature == NatureSchema.Pompe && Schema.Classer(CategorieSchema.Equipement, "Groupe froid Carrier").Source
            && Schema.Classer(CategorieSchema.Equipement, "Vanne 3 voies SIEMENS").Genre == GenreRobinet.Motorisee && Schema.Classer(CategorieSchema.Equipement, "Vase d'expansion").Nature == NatureSchema.Equipement,
            "P&ID : équipements (pompe, production, vanne motorisée, vase d'expansion)");
        Robinetterie.Correspondances[Robinetterie.Cle("KSB BOA-H")] = GenreRobinet.Reglage;
        Verifier(Schema.Classer(CategorieSchema.Accessoire, "KSB BOA-H").Genre == GenreRobinet.Reglage, "P&ID : correspondance « Symboles… » par famille");
        Robinetterie.Correspondances.Clear();

        var (noeuds, liens) = ReseauEssai();
        var sc = Schema.Construire(noeuds, liens);
        var significatifs = noeuds.Where(x => x.Nature != NatureSchema.Ligne).Select(x => x.Id).ToList();
        var places = sc.Symboles.Where(x => x.Nature != NatureSchema.Renvoi).Select(x => x.Id).ToList();
        Verifier(significatifs.All(places.Contains) && places.Count == places.Distinct().Count(), "schéma : chaque élément significatif placé une fois (" + places.Count + "/" + significatifs.Count + ")");
        Verifier(sc.Reseaux == 2 && sc.Symboles.Count(x => x.Nature == NatureSchema.Renvoi) == 0 && sc.Traits.Count(t => t.Liaison) >= 4, "schéma : 2 réseaux, retours tracés jusqu'à leur cible (pas de renvoi)");
        var gf = sc.Symboles.First(x => x.Libelle.StartsWith("GF-01"));
        Verifier(sc.Traits.Any(t => t.Liaison && Math.Abs(Math.Max(t.Y1, t.Y2) - (gf.Y - 5)) < 0.01 && t.X1 > gf.X - gf.DemiLargeur && t.X1 < gf.X + gf.DemiLargeur), "schéma : le retour arrive sous le groupe froid");
        Verifier(sc.Traits.Where(t => t.Liaison).All(t => t.Systeme == "EG-R"), "schéma : les retours gardent leur système (style de trait)");
        // Espace de lecture : une liaison qui croise une ligne est interrompue (aucun croisement franc, des coupures présentes)
        var lz = sc.Traits.Where(t => t.Liaison).ToList();
        int sauts = 0;
        foreach (var a in lz) foreach (var b in lz)
        {
            if (a == b) continue;
            bool ah = Math.Abs(a.Y1 - a.Y2) < 1e-6, bh = Math.Abs(b.Y1 - b.Y2) < 1e-6;
            if (ah && bh && Math.Abs(a.Y1 - b.Y1) < 1e-6 && Math.Abs(Math.Min(b.X1, b.X2) - Math.Max(a.X1, a.X2) - 2 * Schema.Saut) < 0.01) sauts++;
            if (!ah && !bh && Math.Abs(a.X1 - b.X1) < 1e-6 && Math.Abs(Math.Min(b.Y1, b.Y2) - Math.Max(a.Y1, a.Y2) - 2 * Schema.Saut) < 0.01) sauts++;
        }
        Verifier(sauts >= 1, "schéma : espace de lecture aux croisements (" + sauts + ")");
        Verifier(sc.Traits.All(t => Math.Abs(t.X1 - t.X2) < 1e-6 || Math.Abs(t.Y1 - t.Y2) < 1e-6), "schéma : traits orthogonaux");
        // Aucun croisement : deux traits ne se coupent qu'en un point d'extrémité commun
        int croisements = 0;
        foreach (var a in sc.Traits) foreach (var b in sc.Traits)
        {
            if (ReferenceEquals(a, b)) continue;
            bool ah = Math.Abs(a.Y1 - a.Y2) < 1e-6, bh = Math.Abs(b.Y1 - b.Y2) < 1e-6;
            if (ah == bh) continue;
            var h = ah ? a : b; var v = ah ? b : a;
            double hx0 = Math.Min(h.X1, h.X2), hx1 = Math.Max(h.X1, h.X2), vy0 = Math.Min(v.Y1, v.Y2), vy1 = Math.Max(v.Y1, v.Y2);
            if (v.X1 > hx0 + 0.01 && v.X1 < hx1 - 0.01 && h.Y1 > vy0 + 0.01 && h.Y1 < vy1 - 0.01) croisements++;
        }
        Verifier(croisements == 0, "schéma : aucun croisement de traits (" + croisements + ")");
        // Textes : pas de chevauchement entre eux ni avec les cadres des symboles
        var boites = sc.Textes.Select(t => (X0: t.Centre ? t.X - t.Largeur / 2 : t.X, X1: t.Centre ? t.X + t.Largeur / 2 : t.X + t.Largeur, Y0: t.Y - t.Taille / 2, Y1: t.Y + t.Taille / 2, T: t.Texte)).ToList();
        int chev = 0; var ex = new List<string>();
        for (int i = 0; i < boites.Count; i++) for (int j = i + 1; j < boites.Count; j++)
        {
            var a = boites[i]; var b = boites[j];
            if (a.X0 < b.X1 - 0.2 && b.X0 < a.X1 - 0.2 && a.Y0 < b.Y1 - 0.2 && b.Y0 < a.Y1 - 0.2) { chev++; if (ex.Count < 4) ex.Add(a.T + " / " + b.T); }
        }
        Verifier(chev == 0, "schéma : textes sans chevauchement (" + chev + " " + string.Join(" | ", ex) + ")");
        // Textes : ni sur un symbole, ni sur un trait
        int surSymbole = 0, surTrait = 0; var ex2 = new List<string>();
        foreach (var b in boites)
        {
            foreach (var sy in sc.Symboles.Where(x => x.Nature != NatureSchema.Te))
            {
                var d = Schema.Dessin(sy);
                if (d.Count == 0) continue;
                double x0 = sy.X + d.Min(g => Math.Min(g.U1, g.U2)), x1 = sy.X + d.Max(g => Math.Max(g.U1, g.U2)), y0 = sy.Y + d.Min(g => Math.Min(g.V1, g.V2)), y1 = sy.Y + d.Max(g => Math.Max(g.V1, g.V2));
                if (b.X0 < x1 - 0.2 && x0 < b.X1 - 0.2 && b.Y0 < y1 - 0.2 && y0 < b.Y1 - 0.2) { surSymbole++; if (ex2.Count < 4) ex2.Add(b.T + " sur " + sy.Nature + " " + sy.Libelle); }
            }
            foreach (var t in sc.Traits)
            {
                double tx0 = Math.Min(t.X1, t.X2), tx1 = Math.Max(t.X1, t.X2), ty0 = Math.Min(t.Y1, t.Y2), ty1 = Math.Max(t.Y1, t.Y2);
                if (b.X0 < tx1 - 0.2 && tx0 < b.X1 - 0.2 && b.Y0 < ty1 + 0.2 && ty0 - 0.2 < b.Y1) { surTrait++; if (ex2.Count < 6) ex2.Add(b.T + " sur un trait"); }
            }
        }
        Verifier(surSymbole == 0 && surTrait == 0, "schéma : textes hors symboles et traits (" + surSymbole + ", " + surTrait + " : " + string.Join(" | ", ex2) + ")");

        sc.AjouterLegende();
        Verifier(sc.Textes.Any(t => t.Texte == "LÉGENDE") && sc.Textes.Any(t => t.Texte == "Manomètre (PI)") && sc.Textes.Any(t => t.Texte.StartsWith("Réseau EG-R")), "schéma : légende des symboles et des réseaux");
        Verifier(sc.Symboles.Any(x => Schema.TexteCadre(x) == "PI") && sc.Symboles.Any(x => Schema.TexteCadre(x) == "TI"), "schéma : instruments PI / TI");
        var svg = Environment.GetEnvironmentVariable("PIPEFIT_PID");
        if (!string.IsNullOrEmpty(svg)) System.IO.File.WriteAllText(svg, sc.Svg("Schéma de principe – essai"));
    }

    static void TestEquilibrage()
    {
        // Production P → aller A1 → té TA → (VC1 par R1) / (A2 → VC2 par R2) ; retours vers TR → B → P
        var v = new Dictionary<string, List<string>>();
        void L(string a, string b) { (v.TryGetValue(a, out var x) ? x : v[a] = new List<string>()).Add(b); (v.TryGetValue(b, out var y) ? y : v[b] = new List<string>()).Add(a); }
        L("P", "A1"); L("A1", "TA"); L("TA", "R1"); L("R1", "VC1"); L("TA", "A2"); L("A2", "R2"); L("R2", "VC2");
        L("VC1", "B1"); L("B1", "TR"); L("VC2", "B2"); L("B2", "B3"); L("B3", "TR"); L("TR", "RB"); L("RB", "P");
        var eq = new HashSet<string> { "P", "VC1", "VC2" };
        var b = Equilibrage.Boucle(v, "P", "VC2", n => !eq.Contains(n)).Value;
        Verifier(string.Join(">", b.Aller) == "A1>TA>A2>R2" && string.Join(">", b.Retour) == "B2>B3>TR>RB", "équilibrage : boucle aller / retour du VC2");
        var e = Fluide.Eau(45);
        var tubes = new Dictionary<string, double> { ["A1"] = 20, ["A2"] = 30, ["B1"] = 5, ["B2"] = 10, ["B3"] = 20, ["RB"] = 20 };
        Troncon Ligne(string n, string prec, string suiv, double q, Func<string, double> debitDe) =>
            n.StartsWith("R") && n.Length == 2 && n != "RB"
                ? new Troncon { Id = n, Repere = n, Designation = "STAD", DiametreMm = 27.3, DebitM3h = q, Zeta = 6 }
                : new Troncon { Id = n, Repere = n, Designation = "Tube", DiametreMm = n.StartsWith("T") ? 41.9 : 41.9, LongueurM = tubes.TryGetValue(n, out var lg) ? lg : 0, DebitM3h = q, Zeta = n.StartsWith("T") ? 0.5 : 0 };
        var r = Equilibrage.Calculer(v, "P", new Dictionary<string, double> { ["VC1"] = 1.5, ["VC2"] = 2.0 }, n => !eq.Contains(n), Ligne,
            c => c == "VC1" ? 12000 : 15000, n => n == "R1" || n == "R2", e, 20000);
        var c1 = r.Boucles.First(x => x.Consommateur == "VC1"); var c2 = r.Boucles.First(x => x.Consommateur == "VC2");
        Verifier(r.DebitTotalM3h == 3.5 && c2.Critique && !c1.Critique, "équilibrage : boucle la plus longue critique, débit total 3,5 m³/h");
        var a1 = c1.Troncons.First(t => t.Id == "A1"); var a2 = c2.Troncons.First(t => t.Id == "A2");
        Verifier(a1.DebitM3h == 3.5 && a2.DebitM3h == 2.0, "équilibrage : débit d'un tube commun = somme des boucles (A1 3,5 ; A2 2)");
        Verifier(Math.Abs(c1.TotalPa + c1.ADissiperPa - r.HauteurPa) < 1e-6 && c1.ADissiperPa > 0 && c1.KvRequis > 0 && c1.KvRequis < c2.KvRequis * 3,
            "équilibrage : VC1 dissipe l'écart dans R1 (Kv " + c1.KvRequis + " ; VC2 " + c2.KvRequis + ")");
        Verifier(Math.Abs(c1.KvRequis - 1.5 / Math.Sqrt(c1.VanneCiblePa / 1e5)) < 0.01, "Kv requis = Q / √ΔP(bar)");
        Verifier(r.HauteurMce(e) > (r.HauteurPa) / (e.Rho * 9.81) && r.SourcePa == 20000, "hauteur manométrique : réseau + production");
        var fr = System.Globalization.CultureInfo.GetCultureInfo("fr-FR");
        string K(double pa) => (pa / 1000).ToString("0.0", fr);
        var n = new NoteCalcul
        {
            Titre = "Note de calcul – équilibrage hydraulique", Projet = "Démonstration Pipe-Fit", Affaire = "2026-118", Indice = "A", Redacteur = "C. Vert", Societe = "TECNITUB",
            Fluide = e, Date = new DateTime(2026, 11, 18), TitreTableau = "Équilibrage par équipement",
            Objet = "Équilibrage du circuit chauffage : VC1 et VC2 depuis la chaufferie.",
            Hypotheses = { "Vanne de la boucle critique : au moins 3 kPa.", "Kv requis = Q / √(ΔP en bar)." },
            Colonnes = new List<(string, double, bool)> { ("Équipement", 150, false), ("Débit m³/h", 54, true), ("Circuit kPa", 56, true), ("Équip. kPa", 56, true), ("Boucle kPa", 56, true),
                ("À dissiper kPa", 66, true), ("Vanne de réglage", 140, false), ("dP vanne kPa", 60, true), ("Kv requis", 50, true), ("Remarque", 86, false) },
            TexteResultat = "Point de fonctionnement de la pompe : " + r.DebitTotalM3h.ToString("0.##", fr) + " m³/h sous " + K(r.HauteurPa + r.SourcePa) + " kPa = " + r.HauteurMce(e).ToString("0.00", fr) + " mCE",
            ConclusionLibre = "La boucle critique est celle de VC2 ; R1 est à régler au Kv requis.",
        };
        n.Lignes = r.Boucles.Select(b => new[] { b.Libelle, b.DebitM3h.ToString("0.##", fr), K(b.CircuitPa), K(b.ConsommateurPa), K(b.TotalPa), b.Critique ? "critique" : K(b.ADissiperPa),
            b.VanneLibelle, b.Vanne != "" ? K(b.VanneCiblePa) : "", b.Vanne != "" ? b.KvRequis.ToString("0.00", fr) : "", b.Remarque }).ToList();
        var pdfE = n.Pdf(); var xlE = n.Excel();
        Verifier(System.Text.Encoding.ASCII.GetString(pdfE, 0, 8).StartsWith("%PDF") && xlE.Length > 1000, "note d'équilibrage : PDF et Excel");
        var dos = Environment.GetEnvironmentVariable("PIPEFIT_CALC");
        if (!string.IsNullOrEmpty(dos)) { System.IO.File.WriteAllBytes(System.IO.Path.Combine(dos, "Note d'équilibrage (exemple).pdf"), pdfE); }
    }

    static void TestExcel()
    {
        var sp = Exemple(); AnalyseSpool.Analyser(sp);
        var hs = Exemple(); hs.Nom = "EG-101"; hs.HorsSpool = true; AnalyseSpool.Analyser(hs);
        var octets = ExportExcel.Quantites(new List<Spool> { sp, hs }, "Projet <test> & co", new DateTime(2026, 11, 18));
        using (var z = new System.IO.Compression.ZipArchive(new System.IO.MemoryStream(octets)))
        {
            var noms = z.Entries.Select(e => e.FullName).ToList();
            Verifier(noms.Contains("xl/workbook.xml") && noms.Count(n => n.StartsWith("xl/worksheets/sheet")) == 5, "Excel : classeur de 5 feuilles");
            var wb = new System.IO.StreamReader(z.GetEntry("xl/workbook.xml").Open()).ReadToEnd();
            Verifier(wb.Contains("name=\"Synthèse\"") && wb.Contains("name=\"Quantitatif\"") && wb.Contains("name=\"Liste de débit\""), "Excel : noms des feuilles");
            foreach (var e in z.Entries.Where(e => e.FullName.EndsWith(".xml")))
                try { System.Xml.Linq.XDocument.Load(e.Open()); } catch (Exception ex) { Verifier(false, "Excel : XML invalide " + e.FullName + " : " + ex.Message); }
            var s2 = new System.IO.StreamReader(z.GetEntry("xl/worksheets/sheet2.xml").Open()).ReadToEnd();
            Verifier(s2.Contains("Soudure atelier") && s2.Contains("<autoFilter"), "Excel : feuille Quantitatif (soudures, filtre)");
            var s1 = new System.IO.StreamReader(z.GetEntry("xl/worksheets/sheet1.xml").Open()).ReadToEnd();
            Verifier(s1.Contains("<f>SUM(") && s1.Contains("Projet &lt;test&gt; &amp; co"), "Excel : totaux en formules, texte échappé");
        }
        var sortie = Environment.GetEnvironmentVariable("PIPEFIT_XLSX");
        if (!string.IsNullOrEmpty(sortie)) System.IO.File.WriteAllBytes(sortie, octets);
        Verifier(Xlsx.Colonne(0) == "A" && Xlsx.Colonne(25) == "Z" && Xlsx.Colonne(26) == "AA", "Excel : lettres de colonnes");
    }

    static Spool s0BR() { var s = Exemple(); s.Composants.First(c => c.Id == "5").Extremites[1].ConnecteA = "VANNE-EXT"; AnalyseSpool.Analyser(s); return s; }

    static int Main()
    {
        TestExcel();
        TestHydraulique();
        TestPertesFabricant();
        TestSchema();
        TestEquilibrage();
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

        // Pente : évacuation à 1 %, tube horizontal, tube vertical
        {
            var tp = C("p", "Tuyau", "", TypeComposant.Tube, 100, 2000, null, E(0, 0, 0, 100, null), E(2000, 0, -20, 100, null));
            AnalyseSpool.Pente(tp);
            Verifier(tp.PentePourcent == 1 && tp.BasIndex == 1 && tp.TextePente == "pente 1 %", "pente 1 % vers l'extrémité basse (" + tp.TextePente + ")");
            var th = C("h", "Tuyau", "", TypeComposant.Tube, 100, 2000, null, E(0, 0, 0, 100, null), E(2000, 0, 0, 100, null)); AnalyseSpool.Pente(th);
            var tv = C("v", "Tuyau", "", TypeComposant.Tube, 100, 2000, null, E(0, 0, 0, 100, null), E(0, 0, 2000, 100, null)); AnalyseSpool.Pente(tv);
            var t5 = C("q", "Tuyau", "", TypeComposant.Tube, 100, 2000, null, E(0, 0, 10, 100, null), E(2000, 0, 0, 100, null)); AnalyseSpool.Pente(t5);
            Verifier(th.PentePourcent == 0 && tv.PentePourcent == 0 && t5.TextePente == "pente 0,5 %" && t5.BasIndex == 1, "pas de pente à l'horizontale ni à la verticale ; 0,5 %");
        }

        // Cotes ajoutées à la main : enregistrement, point d'attache le plus proche du clic, valeur recalculée
        {
            var lu = CoteAjoutee.Lire(CoteAjoutee.Ecrire(new[] { new CoteAjoutee { AttacheA = "axe", IdB = "6", AttacheB = "bout1", PositionB = new Point3(1674, 0, 1500) } }));
            Verifier(lu.Count == 1 && lu[0].IdB == "6" && lu[0].AttacheB == "bout1" && lu[0].PositionB.Value.X == 1674, "cote ajoutée : relue telle qu'écrite");
            Verifier(CoteAjoutee.Lire("n'importe quoi|axe>12:bout0").Count == 1, "cote ajoutée : entrée illisible ignorée");
            var sm = Exemple();
            AnalyseSpool.Analyser(sm);
            var coude = sm.Composants.First(c => c.Id == "2");
            Verifier(CoteAjoutee.PlusProche(coude, new Point3(990, 0, 20)).Code == "axe", "clic sur le coude : axe du coude");
            var t6 = sm.Composants.First(c => c.Id == "6");
            Verifier(CoteAjoutee.PlusProche(t6, new Point3(1650, 0, 1500)).Code == "bout1", "clic près du bout du tube : son extrémité");
            coude.CotesAjoutees.Add(new CoteAjoutee { AttacheA = "axe", IdB = "6", AttacheB = "bout1" });
            AnalyseSpool.Analyser(sm);
            var aj = sm.Cotes.Where(c => c.Ajoutee).ToList();
            Verifier(aj.Count == 1 && aj[0].Valeur == "1644" && aj[0].Libelle == "axe / extrémité", "cote ajoutée axe coude → bout de branche : " + string.Join(", ", aj.Select(c => c.Valeur + " " + c.Libelle)));
            // Cote alignée prise en plan (direction X) : valeur = projection sur X, relue telle qu'écrite
            coude.CotesAjoutees.Clear(); coude.CotesAjoutees.Add(new CoteAjoutee { AttacheA = "axe", IdB = "6", AttacheB = "bout1", Axe = new Point3(1, 0, 0) });
            var relue = CoteAjoutee.Lire(CoteAjoutee.Ecrire(coude.CotesAjoutees));
            Verifier(relue[0].Axe.HasValue && relue[0].Axe.Value.X == 1, "cote alignée : direction relue");
            AnalyseSpool.Analyser(sm);
            var al = sm.Cotes.Where(c => c.Ajoutee).ToList();
            Verifier(al.Count == 1 && al[0].Valeur == "674" && Math.Abs(al[0].B.Z - al[0].A.Z) < 1e-6, "cote alignée suivant X : 674 (projection), pas la distance en biais 1644");
            // Ligne d'attache d'une cote alignée : point de l'élément le plus proche le long de la direction
            var pl = CoteAjoutee.PourLigneAttache(t6, new Point3(0, 0, 0), new Point3(1, 0, 0), 1674);
            Verifier(pl.Code == "bout1" && pl.Ecart < 1, "ligne d'attache à x = 1674 : bout du tube");
            var pa2 = CoteAjoutee.PourLigneAttache(coude, new Point3(0, 0, 0), new Point3(1, 0, 0), 1000);
            Verifier(pa2.Code == "axe", "ligne d'attache sur le coude : son point d'épure");
            // Même cote que l'automatique : pas en double
            coude.CotesAjoutees.Clear(); coude.CotesAjoutees.Add(new CoteAjoutee { AttacheA = "axe", IdB = "4", AttacheB = "axe" });
            AnalyseSpool.Analyser(sm);
            Verifier(sm.Cotes.Count(c => c.Ajoutee) == 0 && sm.Cotes.Count(c => c.Valeur == "1500") == 1, "cote ajoutée déjà générée : pas de doublon");
            // Élément B hors du spool : la cote s'arrête à la position enregistrée
            coude.CotesAjoutees.Clear(); coude.CotesAjoutees.Add(new CoteAjoutee { AttacheA = "axe", IdB = "AUTRE", AttacheB = "axe", PositionB = new Point3(1000, 3000, 0) });
            AnalyseSpool.Analyser(sm);
            Verifier(sm.Cotes.Any(c => c.Ajoutee && c.Valeur == "3000"), "cote ajoutée vers un élément hors spool");
        }

        // Cotes toujours à l'axe : coude mal nommé (« Courbe »), type de pièce Revit, réduction excentrée
        {
            Spool Ligne(string famCoude, string typePiece, bool directions)
            {
                var sp = new Spool { Nom = "AX" };
                sp.Composants.Add(C("t1", "Tuyau", "", TypeComposant.Tube, 100, 924, null, E(0, 0, 0, 100, null), E(924, 0, 0, 100, "k")));
                var k = C("k", famCoude, "", TypeComposant.Autre, 100, 0, null, E(924, 0, 0, 100, "t1"), E(1000, 76, 0, 100, "t2"));
                k.TypePiece = typePiece;
                if (directions) { k.Extremites[0].Direction = new Point3(-1, 0, 0); k.Extremites[1].Direction = new Point3(0, 1, 0); }
                sp.Composants.Add(k);
                sp.Composants.Add(C("t2", "Tuyau", "", TypeComposant.Tube, 100, 924, null, E(1000, 76, 0, 100, "k"), E(1000, 1000, 0, 100, null)));
                AnalyseSpool.Analyser(sp);
                return sp;
            }
            var s1 = Ligne("Courbe 90 acier", "", true);
            var c1 = s1.Cotes.Select(c => c.Valeur + " " + c.Libelle).OrderBy(x => x).ToList();
            Verifier(c1.Count == 2 && c1.All(x => x.StartsWith("1000")) && s1.Composants.First(c => c.Id == "k").Type == TypeComposant.Coude,
                "coude nommé « Courbe » : coude, cotes au point d'épure (" + string.Join(", ", c1) + ")");
            Verifier(Math.Abs(s1.Composants.First(c => c.Id == "k").AngleDeg - 90) < 0.1, "angle du coude d'après les directions : 90°");
            var s2 = Ligne("Raccord soudé", "Elbow", false);
            Verifier(s2.Composants.First(c => c.Id == "k").Type == TypeComposant.Coude, "type de pièce Revit « Elbow » : coude, quel que soit le nom");
            // Réduction excentrée : axe décalé de 20 mm
            var sx = new Spool { Nom = "EX" };
            sx.Composants.Add(C("a", "Tuyau", "", TypeComposant.Tube, 100, 1000, null, E(0, 0, 0, 100, null), E(1000, 0, 0, 100, "r")));
            var rd = C("r", "Réduction excentrée", "", TypeComposant.Autre, 100, 0, null, E(1000, 0, 0, 100, "a"), E(1100, 0, -20, 65, "b"));
            rd.Extremites[0].Direction = new Point3(-1, 0, 0); rd.Extremites[1].Direction = new Point3(1, 0, 0);
            sx.Composants.Add(rd);
            sx.Composants.Add(C("b", "Tuyau", "", TypeComposant.Tube, 65, 900, null, E(1100, 0, -20, 65, "r"), E(2000, 0, -20, 65, null)));
            AnalyseSpool.Analyser(sx);
            var cr2 = sx.Cotes.Select(c => c.Valeur).OrderBy(x => x).ToList();
            Verifier(sx.Cotes.All(c => Math.Abs(c.A.Z - c.B.Z) < 1e-6), "réduction excentrée : aucune cote ne relie deux axes décalés (" + string.Join(", ", cr2) + ")");
        }

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
                Verifier(db.LongueurRevitMm == 500 && db.PiquageMm == 0 && db.LongueurMm == 500, "débit de la branche : longueur du piquage non comptée (" + db.LongueurMm + ")");
                Verifier(sq.Nomenclature.All(l => l.Type != TypeComposant.Piquage) && pq.Repere == "", "piquage : pas de pièce en nomenclature");
                var qp = Quantitatif.Calculer(new[] { sq });
                Verifier(!qp.Any(l => l.Famille.StartsWith("Raccord à piquage")), "piquage : pas de fourniture au quantitatif");
                Verifier(!ListeDebit.Csv(new[] { sq }).Contains("Piquage"), "CSV débit : pas de colonne piquage");
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
                // Piquage seul (branche dans un autre spool) : pas de cote sur sa longueur
                var sp1 = new Spool { Nom = "P1" };
                sp1.Composants.Add(C("col", "Tuyau", "", TypeComposant.Tube, 100, 2000, null, E(0, 0, 0, 100, null), E(2000, 0, 0, 100, null)));
                sp1.Composants.Add(C("pq", "Raccord à piquage", "Standard", TypeComposant.Autre, 50, 0, null, E(1000, 0, 57, 100, "col"), E(1000, 0, 120, 50, "AUTRE")));
                AnalyseSpool.Analyser(sp1);
                Verifier(!sp1.Cotes.Any(c => Math.Round(c.LongueurMm) == 120 || Math.Round(c.LongueurMm) == 63), "piquage seul : aucune cote sur sa longueur (" + string.Join(", ", sp1.Cotes.Select(c => c.Valeur)) + ")");
                // Spool de la branche : tube + bride, piquage dans le spool du collecteur → cote axe du collecteur → face de bride
                var sb3 = new Spool { Nom = "B3" };
                sb3.Composants.Add(C("br", "Tuyau", "", TypeComposant.Tube, 50, 500, null, E(1000, 0, 120, 50, "pq"), E(1000, 0, 620, 50, "fl")));
                sb3.Composants.Add(C("fl", "Bride à collerette", "PN16", TypeComposant.Autre, 50, 0, null, E(1000, 0, 620, 50, "br"), E(1000, 0, 670, 50, "VANNE")));
                sb3.Composants[0].Extremites[0].VoisinEstPiquage = true; sb3.Composants[0].Extremites[0].AxeCollecteur = new Point3(1000, 0, 0);
                AnalyseSpool.Analyser(sb3);
                Verifier(sb3.Cotes.Count == 1 && sb3.Cotes[0].Valeur == "670" && sb3.Cotes[0].Libelle == "axe / bride", "branche : cote de l'axe du collecteur à la bride (" + string.Join(", ", sb3.Cotes.Select(c => c.Valeur + " " + c.Libelle)) + ")");
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
            Verifier(csvd.StartsWith("Système de canalisation;DN;Matière;Spool;Rep.;Longueur Revit (mm)") && csvd.Contains("Eau glacée départ;DN100;Acier;SP-1;T1;5000;;5000;1"), "CSV liste de débit");
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
