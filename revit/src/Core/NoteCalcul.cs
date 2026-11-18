// Note de calcul de perte de charge (hydraulique ou aéraulique), éditable : cartouche (projet, affaire, indice, date,
// rédacteur, vérificateur), objet, hypothèses, tableau des résultats par élément, remarques, résultat, conclusion.
// Exports : classeur Excel et document PDF (A4 paysage, tableau paginé, en-têtes répétés, page x / N).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace PipeFit.Isometries.Core
{
    public sealed class NoteCalcul
    {
        static readonly CultureInfo Fr = CultureInfo.GetCultureInfo("fr-FR");
        public string Titre = "Note de calcul – perte de charge";
        public string Projet = "", Affaire = "", Indice = "A", Redacteur = "", Verificateur = "", Societe = "", Objet = "", Conclusion = "";
        public DateTime Date = DateTime.Today;
        public List<string> Hypotheses = new List<string>();
        public bool Air;
        public Fluide Fluide;
        public ResultatPerte Resultat;
        /// <summary>Aéraulique par chemins : perte de charge de chaque chemin (le plus défavorisé en tête).</summary>
        public List<(string Libelle, double Pa)> Chemins = new List<(string, double)>();
        /// <summary>Chemin détaillé dans le tableau (mode chemins).</summary>
        public string CheminCalcule = "";
        /// <summary>Tableau libre (équilibrage…) à la place du tableau par élément ; texte du résultat encadré.</summary>
        public List<(string Titre, double Largeur, bool Droite)> Colonnes;
        public List<string[]> Lignes = new List<string[]>();
        public string TexteResultat = "";
        public string TitreTableau = "Résultats par élément";
        public string ConclusionLibre = "";
        double PressionReseau => Chemins.Count > 0 ? Chemins.Max(c => c.Pa) : Resultat?.TotalPa ?? 0;

        public string Total => Resultat == null ? TexteResultat : (Resultat.TotalPa / 1000).ToString("0.00", Fr) + " kPa"
            + (Air ? " (" + Resultat.TotalPa.ToString("0", Fr) + " Pa)" : " = " + Resultat.TotalMce(Fluide).ToString("0.00", Fr) + " mCE");

        /// <summary>Conclusion proposée (modifiable) : perte de charge totale, vitesses, remarques.</summary>
        public string ConclusionProposee()
        {
            if (Resultat == null) return ConclusionLibre;
            var r = Resultat;
            var vmax = r.Troncons.Where(t => t.DebitM3h > 0).Select(t => t.VitesseMs).DefaultIfEmpty(0).Max();
            var alertes = r.Troncons.Count(t => t.Alerte != "");
            var texte = (Chemins.Count > 0
                    ? "La pression du réseau au ventilateur (chemin le plus défavorisé) est de " + PressionReseau.ToString("0", Fr) + " Pa. Le chemin détaillé"
                      + (CheminCalcule != "" ? " (" + CheminCalcule + ")" : "") + " totalise "
                    : Air ? "La perte de charge du réseau calculé est de " : "La perte de charge du circuit calculé est de ") + Total + ", soit " + r.LineairePa.ToString("0", Fr) + " Pa de pertes linéaires sur "
                + r.LongueurM.ToString("0.0", Fr) + " m et " + r.SingulierPa.ToString("0", Fr) + " Pa de pertes singulières. Vitesse maximale : " + vmax.ToString("0.00", Fr) + " m/s.";
            texte += alertes == 0 ? " Aucun élément ne dépasse les critères retenus." : " " + alertes + " élément(s) appellent une remarque (voir la liste) : à vérifier avant validation.";
            if (!Air) texte += " La pompe devra assurer la hauteur manométrique correspondante au débit de calcul, majorée des pertes des équipements non comptés.";
            return texte;
        }

        public IEnumerable<string> Remarques() => Resultat == null ? Enumerable.Empty<string>() : Resultat.Troncons.Where(t => t.Alerte != "").Select(t => (t.Repere != "" ? t.Repere + " – " : "") + t.Designation + " : " + t.Alerte);

        string Methode => "Perte linéaire : Darcy-Weisbach, coefficient de frottement lambda de Colebrook-White (64/Re en laminaire). "
            + "Pertes singulières : zeta · rho·v²/2, plus les pertes fabricant saisies (Pa).";

        // ---------- PDF ----------

        public byte[] Pdf()
        {
            var pdf = new PdfSimple(true);
            double W = pdf.Largeur, H = pdf.Hauteur, m = 34, y = 0;
            const double bas = 40;
            void Page()
            {
                pdf.NouvellePage();
                // Cartouche
                pdf.Rectangle(m, 24, W - 2 * m, 46, -1, 0.8);
                pdf.Texte(m + 8, 41, Titre, 13, true);
                pdf.Texte(m + 8, 58, (Projet != "" ? Projet : "") + (Affaire != "" ? "   –   Affaire " + Affaire : ""), 9);
                pdf.Trait(W - m - 230, 24, W - m - 230, 70, 0.5);
                pdf.Texte(W - m - 222, 37, "Indice " + Indice + "   –   " + Date.ToString("dd/MM/yyyy", Fr), 9, true);
                pdf.Texte(W - m - 222, 51, "Rédigé : " + Redacteur, 8.5);
                pdf.Texte(W - m - 222, 64, "Vérifié : " + Verificateur, 8.5);
                y = 86;
            }
            void Saut(double h) { if (y + h > H - bas) Page(); }
            void Titre2(string t) { Saut(30); y += 6; pdf.Texte(m, y + 9, t.ToUpperInvariant(), 10, true); pdf.Trait(m, y + 13, W - m, y + 13, 0.6, 0.35); y += 22; }
            void Paragraphe(string t, double taille = 9)
            {
                foreach (var l in PdfSimple.Couper(t, W - 2 * m - 6, taille)) { Saut(taille * 1.45); pdf.Texte(m + 4, y + taille, l, taille); y += taille * 1.45; }
                y += 3;
            }
            Page();
            if (Objet != "") { Titre2("Objet"); Paragraphe(Objet); }
            Titre2("Hypothèses");
            var hyp = new List<string>();
            if (Fluide != null) hyp.Add("Fluide : " + Fluide.Nom + " – masse volumique " + Fluide.Rho.ToString("0.0", Fr) + " kg/m³, viscosité cinématique " + (Fluide.Nu * 1e6).ToString("0.000", Fr) + " mm²/s.");
            hyp.AddRange(Hypotheses.Where(h => !string.IsNullOrWhiteSpace(h)));
            hyp.Add(Methode);
            foreach (var h in hyp) Paragraphe("•  " + h);

            // Tableau
            Titre2(TitreTableau);
            var cols = new (string T, double L, bool D)[]
            {
                ("Rep.", 34, false), ("Élément", 166, false), ("Section", 56, false), ("Débit m³/h", 54, true), ("Long. m", 44, true), ("v m/s", 40, true),
                ("Reynolds", 52, true), ("lambda", 42, true), ("J Pa/m", 44, true), ("zeta", 34, true), ("Pd Pa", 42, true), ("dP lin. Pa", 52, true),
                ("dP sing. Pa", 56, true), ("dP total Pa", 58, true),
            };
            if (Colonnes != null) cols = Colonnes.Select(c => (c.Titre, c.Largeur, c.Droite)).ToArray();
            double lt = cols.Sum(c => c.L), x0 = m, hl = 13;
            void Entete()
            {
                pdf.Rectangle(x0, y, lt, hl + 2, 0.88, 0.5);
                double x = x0;
                foreach (var c in cols) { pdf.Texte(c.D ? x + c.L - 3 : x + 3, y + 10, c.T, 7.5, true, c.D ? 2 : 0); x += c.L; }
                y += hl + 2;
            }
            void Ligne(string[] v, bool gras = false, bool rouge = false)
            {
                if (y + hl > H - bas) { Page(); Entete(); }
                double x = x0;
                for (int i = 0; i < cols.Length; i++)
                {
                    var c = cols[i];
                    pdf.Texte(c.D ? x + c.L - 3 : x + 3, y + 9.5, PdfSimple.Tronquer(v[i], c.L - 6, 7.5, gras), 7.5, gras, c.D ? 2 : 0, rouge ? 0 : 0);
                    x += c.L;
                }
                pdf.Trait(x0, y + hl, x0 + lt, y + hl, 0.25, 0.7);
                y += hl;
            }
            Saut(hl * 3); Entete();
            string F(double v, string f) => v.ToString(f, Fr);
            if (Colonnes != null) foreach (var l in Lignes) Ligne(l, l.Length > 0 && l[0] == "Total");
            else foreach (var t in Resultat.Troncons)
                Ligne(new[] { t.Repere + (t.Alerte != "" ? " *" : ""), t.Designation, t.Section, F(t.DebitM3h, "0.##"), t.LongueurM > 0 ? F(t.LongueurM, "0.00") : "", F(t.VitesseMs, "0.00"),
                    F(Math.Round(t.Reynolds), "0"), F(t.Lambda, "0.0000"), t.LongueurM > 0 ? F(t.PerteLineairePaM, Air ? "0.00" : "0") : "", t.Zeta != 0 ? F(t.Zeta, "0.###") : "",
                    F(t.PressionDynamiquePa, "0.0"), F(t.PerteLineairePa, "0.0"), F(t.PerteSinguliere, "0.0"), F(t.PerteTotalePa, "0.0") });
            if (Colonnes == null) Ligne(new[] { "", "Total", "", "", F(Resultat.LongueurM, "0.0"), "", "", "", "", "", "", F(Resultat.LineairePa, "0"), F(Resultat.SingulierPa, "0"), F(Resultat.TotalPa, "0") }, true);
            y += 6;
            var rem = Remarques().ToList();
            if (rem.Count > 0) { Titre2("Remarques (*)"); foreach (var r in rem) Paragraphe("•  " + r, 8.5); }
            if (Chemins.Count > 1)
            {
                Titre2("Chemins du réseau");
                foreach (var (lib, pa) in Chemins.OrderByDescending(c => c.Pa)) Paragraphe("•  " + lib + " : " + pa.ToString("0", Fr) + " Pa", 8.5);
            }
            Titre2("Résultat");
            Saut(30);
            pdf.Rectangle(m, y, W - 2 * m, 24, 0.94, 0.6);
            pdf.Texte(m + 8, y + 16, Resultat == null ? TexteResultat : Chemins.Count > 0
                ? "Pression du réseau au ventilateur : " + PressionReseau.ToString("0", Fr) + " Pa   –   chemin détaillé : " + Total
                : (Air ? "Perte de charge du réseau : " : "Perte de charge du circuit : ") + Total, 11, true);
            y += 32;
            Titre2("Conclusion");
            Paragraphe(Conclusion != "" ? Conclusion : ConclusionProposee());

            // Pieds de page
            int n = pdf.NombrePages;
            for (int i = 0; i < n; i++)
            {
                pdf.Page(i);
                pdf.Trait(m, H - 26, W - m, H - 26, 0.4, 0.5);
                pdf.Texte(m, H - 14, (Societe != "" ? Societe + " – " : "") + Titre + (Affaire != "" ? " – affaire " + Affaire : "") + " – indice " + Indice, 7.5, false, 0, 0.35);
                pdf.Texte(W - m, H - 14, "Page " + (i + 1) + " / " + n, 7.5, false, 2, 0.35);
            }
            return pdf.Ecrire(Titre);
        }

        // ---------- Excel ----------

        public byte[] Excel()
        {
            if (Colonnes != null)
            {
                var fe = new FeuilleXlsx { Nom = "Note de calcul", Largeurs = Colonnes.Select(c => Math.Max(8, c.Largeur / 5.5)).ToList() };
                fe.Ajouter(new Cellule(Titre + (Societe != "" ? " – " + Societe : ""), StyleCellule.Titre));
                fe.Ajouter(new Cellule("Projet : " + Projet + (Affaire != "" ? "   –   Affaire : " + Affaire : "") + "   –   Indice " + Indice + " du " + Date.ToString("dd/MM/yyyy", Fr)
                    + "   –   Rédigé : " + Redacteur + "   –   Vérifié : " + Verificateur));
                if (Objet != "") fe.Ajouter(new Cellule("Objet : " + Objet));
                if (Fluide != null) fe.Ajouter(new Cellule("Fluide : " + Fluide.Nom + " – ρ " + Fluide.Rho.ToString("0.0", Fr) + " kg/m³, ν " + (Fluide.Nu * 1e6).ToString("0.000", Fr) + " mm²/s"));
                foreach (var h in Hypotheses.Where(h => !string.IsNullOrWhiteSpace(h))) fe.Ajouter(new Cellule("Hypothèse : " + h));
                fe.Vide();
                fe.LigneEntete = fe.Lignes.Count; fe.NbColonnesFiltre = Colonnes.Count;
                fe.Lignes.Add(Colonnes.Select(c => new Cellule(c.Titre, StyleCellule.Entete)).ToList());
                foreach (var l in Lignes)
                    fe.Lignes.Add(l.Select((v, i) => Colonnes[i].Droite && double.TryParse((v ?? "").Replace(" ", "").Replace("\u202f", ""), System.Globalization.NumberStyles.Float, Fr, out var d)
                        ? new Cellule(d, l[0] == "Total" ? StyleCellule.TotalDecimal : StyleCellule.Decimal) : new Cellule(v ?? "", l[0] == "Total" ? StyleCellule.Gras : StyleCellule.Texte)).ToList());
                fe.DerniereLigneFiltre = fe.Lignes.Count - 1 - (Lignes.Count > 0 && Lignes[Lignes.Count - 1][0] == "Total" ? 1 : 0);
                fe.Vide();
                fe.Ajouter(new Cellule(TexteResultat, StyleCellule.Gras));
                fe.Vide();
                fe.Ajouter(new Cellule("Conclusion", StyleCellule.Gras));
                fe.Ajouter(new Cellule(Conclusion != "" ? Conclusion : ConclusionProposee()));
                return Xlsx.Ecrire(new[] { fe });
            }
            var lignes = new List<string>
            {
                "Projet : " + Projet + (Affaire != "" ? "   –   Affaire : " + Affaire : ""),
                "Indice " + Indice + " du " + Date.ToString("dd/MM/yyyy", Fr) + "   –   Rédigé : " + Redacteur + "   –   Vérifié : " + Verificateur,
            };
            if (Objet != "") lignes.Add("Objet : " + Objet);
            lignes.AddRange(Hypotheses.Where(h => !string.IsNullOrWhiteSpace(h)).Select(h => "Hypothèse : " + h));
            if (Chemins.Count > 1) lignes.Add("Chemins : " + string.Join(" ; ", Chemins.OrderByDescending(c => c.Pa).Select(c => c.Libelle + " " + c.Pa.ToString("0", Fr) + " Pa")));
            return ExportCalcul.PerteCharge(Resultat, Fluide, Titre, Societe, lignes, Air, Date, Conclusion != "" ? Conclusion : ConclusionProposee());
        }
    }
}
