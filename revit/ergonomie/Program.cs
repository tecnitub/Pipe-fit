// Ouvre chaque fenêtre du complément avec des données d'exemple, liste chevauchements et textes coupés (Ergonomie.Controler)
// et enregistre une capture. Sortie : lignes « ERGONOMIE … » ; code de retour = nombre de fenêtres en défaut.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using PipeFit.Isometries.Core;
using PipeFit.Isometries.Revit;

static class Program
{
    static int defauts;
    static string dossier = "captures";

    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length > 0) dossier = args[0];
        Directory.CreateDirectory(dossier);
        Application.EnableVisualStyles();
        Application.SetHighDpiMode(HighDpiMode.SystemAware);

        var e45 = Fluide.Eau(45);
        var troncons = new List<Troncon>
        {
            new Troncon { Id = "1", Repere = "T1", Designation = "Tube acier P235GH DN80", DiametreMm = 82.5, LongueurM = 12.4, DebitM3h = 18 },
            new Troncon { Id = "2", Repere = "2", Designation = "Coude - Soudé 3D 90°", DiametreMm = 82.5, DebitM3h = 18, Zeta = 0.3 },
            new Troncon { Id = "3", Repere = "3", Designation = "Té - Soudé Égal (dérivation)", DiametreMm = 37.2, DebitM3h = 2, Zeta = 2.1 },
            new Troncon { Id = "4", Repere = "5", Designation = "Vanne de réglage IMI STAF DN80 (fabricant)", DiametreMm = 82.5, DebitM3h = 18, PerteFixePa = 12000 },
            new Troncon { Id = "5", Repere = "T2", Designation = "Tube acier P235GH DN80", DiametreMm = 82.5, LongueurM = 8.6, DebitM3h = 0 },
        };
        Essai("Perte de charge hydraulique", () => new FenetreCalcul(false, "Perte de charge hydraulique", "Démonstration", troncons, new List<string> { "Débits calculés en aval de « GF-01 Groupe froid »." }));
        var air = new List<Troncon>
        {
            new Troncon { Id = "a", Repere = "G1", Designation = "Gaine rectangulaire 600×300", LargeurMm = 600, HauteurMm = 300, LongueurM = 8, RugositeMm = 0.15, DebitM3h = 3000 },
            new Troncon { Id = "b", Repere = "B2", Nature = "Bouche", Designation = "Bouche de soufflage", DiametreMm = 200, DebitM3h = 300 },
        };
        Essai("Perte de charge aéraulique (chemins)", () => new FenetreCalcul(true, "Perte de charge aéraulique", "Démonstration",
            new List<(string, List<Troncon>)> { ("Bouche de soufflage 123456 (300 m³/h, B12)", air), ("Bouche de soufflage 123457 (300 m³/h)", air.ToList()) }, new List<string> { "3 bouche(s), 900 m³/h." }, true));
        Essai("Débit et vitesse ventilation", () => new FenetreCalcul(true, "Débit, vitesse et perte de charge – ventilation", "Démonstration", air, new List<string>()));
        Essai("Note de calcul", () => new FenetreNote(new NoteCalcul { Titre = "Note de calcul – perte de charge hydraulique", Projet = "Démonstration", Fluide = e45, Resultat = PerteCharge.Hydraulique(troncons, e45), Hypotheses = { "Débit de calcul 18 m³/h." } }));
        Essai("Équilibrage", () => new FenetreEquilibrage(f => new ResultatEquilibrage
        {
            DebitTotalM3h = 3.5, HauteurPa = 26700, SourcePa = 20000,
            Boucles = { new BoucleEquilibrage { Libelle = "VC-02 Ventilo-convecteur", DebitM3h = 2, CircuitPa = 11700, ConsommateurPa = 15000, TotalPa = 26700, Critique = true, Vanne = "r", VanneLibelle = "R2 STAD DN20", VanneCiblePa = 3000, KvRequis = 11.55 },
                        new BoucleEquilibrage { Libelle = "VC-01 Ventilo-convecteur", DebitM3h = 1.5, CircuitPa = 7600, ConsommateurPa = 12000, TotalPa = 19600, ADissiperPa = 7100, Vanne = "s", VanneLibelle = "R1 STAD DN20", VanneCiblePa = 8900, KvRequis = 5.03 } },
        }, "Démonstration", new List<string> { "Source des boucles : GF-01 Groupe froid (perte côté eau 20 kPa)." }));
        Essai("P&ID du projet", () => new FenetrePid(new List<DefinitionPid> { new DefinitionPid { Nom = "PID chaud", Systemes = { "Chauffage aller" } }, new DefinitionPid { Nom = "PID froid" } },
            new List<TypeSystemeInfo> { new TypeSystemeInfo { Nom = "Chauffage aller", Abreviation = "CH-A", Classification = "aller", Elements = 214 }, new TypeSystemeInfo { Nom = "Eau glacée retour", Abreviation = "EG-R", Classification = "retour", Elements = 180 } }));
        Essai("Symboles de robinetterie", () => new FenetreSymboles(new List<(string, string)> { ("TECOFI VPI 4648-02", "DN100"), ("Robinetterie KSB BOA-H", "DN80"), ("IMI STAF", "DN65") }));
        var r = new Reglages();
        Essai("Isométries spools", () => new Fenetre(r, new DonneesFenetre
        {
            Parametres = { "Numéro de spool" }, Cartouches = { "A3 Cartouche TECNITUB : A3" }, EtiquettesTube = { "Étiquette de canalisation" }, EtiquettesRaccord = { "Étiquette de raccord" },
            EtiquettesAccessoire = { "Étiquette d'accessoire" }, ParametresRepere = { "Marque" },
            Compter = p => (new Dictionary<string, int> { ["SP-001"] = 12, ["SP-002"] = 9 }, 3),
        }));
        Essai("Numéroter les spools", () => new FenetreNumerotation(r, new List<string> { "Numéro de spool" }, "Numéro de spool", 4, (rr, p) => "SP-001", (rr, p, n) => null));
        Essai("Repérage", () => new FenetreReperage("Plan RDC – CVC", 12, true));
        Essai("Générer un spool", () => new FenetreGenererSpool("SP-014", 23, 5400, new List<string> { "EG-D", "EG-R" }, new List<string> { "2 éléments ont déjà un numéro (SP-003)." }, new List<string> { "SP-003" }));
        Essai("Surlongueur", () => new FenetreSurlongueur(100));
        Console.WriteLine("ERGONOMIE bilan : " + defauts + " fenêtre(s) en défaut");
        return defauts;
    }

    static void Essai(string nom, Func<Form> creer)
    {
        Form f = null;
        try
        {
            f = creer();
            f.StartPosition = FormStartPosition.Manual; f.Location = new Point(0, 0); f.ShowInTaskbar = false;
            f.Show(); Application.DoEvents(); f.PerformLayout(); Application.DoEvents();
            var problemes = Ergonomie.Controler(f, false);
            using (var bmp = new Bitmap(f.Width, f.Height))
            {
                f.DrawToBitmap(bmp, new Rectangle(0, 0, f.Width, f.Height));
                bmp.Save(Path.Combine(dossier, string.Concat(nom.Select(c => char.IsLetterOrDigit(c) ? c : '-')) + ".png"), ImageFormat.Png);
            }
            Console.WriteLine("ERGONOMIE " + nom + " : " + (problemes.Count == 0 ? "OK" : problemes.Count + " problème(s)") + " – " + f.ClientSize.Width + "×" + f.ClientSize.Height);
            foreach (var p in problemes) Console.WriteLine("ERGONOMIE   " + nom + " : " + p);
            if (problemes.Count > 0) defauts++;
        }
        catch (Exception ex)
        {
            Console.WriteLine("ERGONOMIE " + nom + " : non testée (" + ex.GetType().Name + " : " + ex.Message.Split('\n')[0] + ")");
        }
        finally { try { f?.Close(); f?.Dispose(); } catch { } }
    }
}
