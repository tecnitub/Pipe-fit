// Liste de débit de l'atelier, tous spools confondus : tubes classés par système de canalisation, DN et matière, du plus
// long au plus court, avec la barre du commerce (6 m) dans laquelle couper chacun (calepinage par « premier qui tient »,
// tubes les plus longs d'abord, trait de scie compris).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace PipeFit.Isometries.Core
{
    public sealed class LigneDebit
    {
        public string Systeme = "", Materiau = "", Spool = "", Repere = "";
        public double DnMm, LongueurRevitMm, PiquageMm, SurlongueurMm, CoupeMm;
        /// <summary>Barre du commerce où couper ce tube (1, 2…), dans son groupe système / DN / matière ; 0 si plus long qu'une barre.</summary>
        public int Barre;
    }

    public static class ListeDebit
    {
        public static List<LigneDebit> Calculer(IEnumerable<Spool> spools, double barreMm = 6000, double traitScieMm = 3)
        {
            var lignes = spools.SelectMany(s => s.Debits.Select(d => new LigneDebit
            {
                Systeme = d.Systeme, Materiau = d.Tube.Materiau, Spool = s.Nom, Repere = d.Repere, DnMm = d.DnMm,
                LongueurRevitMm = d.LongueurRevitMm, PiquageMm = d.PiquageMm, SurlongueurMm = d.SurlongueurMm, CoupeMm = d.LongueurMm,
            })).ToList();
            var res = new List<LigneDebit>();
            foreach (var g in lignes.GroupBy(l => (l.Systeme, Math.Round(l.DnMm), l.Materiau))
                         .OrderBy(g => g.Key.Systeme, StringComparer.CurrentCultureIgnoreCase).ThenByDescending(g => g.Key.Item2).ThenBy(g => g.Key.Materiau))
            {
                var restes = new List<double>();
                foreach (var l in g.OrderByDescending(x => x.CoupeMm).ThenBy(x => x.Spool, Comparer<string>.Create(AnalyseSpool.ComparerNaturel)))
                {
                    if (barreMm <= 0 || l.CoupeMm > barreMm) { l.Barre = 0; res.Add(l); continue; }
                    var i = restes.FindIndex(r => r >= l.CoupeMm);
                    if (i < 0) { restes.Add(barreMm); i = restes.Count - 1; }
                    restes[i] -= l.CoupeMm + traitScieMm;
                    l.Barre = i + 1;
                    res.Add(l);
                }
            }
            return res;
        }

        /// <summary>Nombre de barres par groupe système / DN / matière.</summary>
        public static int Barres(IEnumerable<LigneDebit> groupe) => groupe.Select(l => l.Barre).DefaultIfEmpty(0).Max();

        public static string Csv(IEnumerable<Spool> spools, double barreMm = 6000, double traitScieMm = 3)
        {
            var fr = CultureInfo.GetCultureInfo("fr-FR");
            var sb = new StringBuilder();
            void Ligne(params string[] c) => sb.Append(string.Join(";", c.Select(v => (v ?? "").IndexOfAny(new[] { ';', '"' }) >= 0 ? "\"" + v.Replace("\"", "\"\"") + "\"" : v ?? ""))).Append("\r\n");
            Ligne("Système de canalisation", "DN", "Matière", "Spool", "Rep.", "Longueur Revit (mm)", "Piquage (mm)", "Surlongueur (mm)", "Coupe (mm)",
                "Barre de " + (barreMm / 1000).ToString("0.#", fr) + " m");
            foreach (var l in Calculer(spools, barreMm, traitScieMm))
                Ligne(l.Systeme, Diametres.Dn(l.DnMm), l.Materiau, l.Spool, l.Repere, l.LongueurRevitMm.ToString("0", fr),
                    l.PiquageMm > 0 ? l.PiquageMm.ToString("0", fr) : "", l.SurlongueurMm > 0 ? l.SurlongueurMm.ToString("0", fr) : "", l.CoupeMm.ToString("0", fr), l.Barre > 0 ? l.Barre.ToString(fr) : "hors barre");
            return sb.ToString();
        }
    }
}
