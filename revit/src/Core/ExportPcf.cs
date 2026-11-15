// Export PCF (Piping Component File, format Isogen) d'un spool : lisible par Isogen, Spoolgen, M4 ISO, PDMS/E3D,
// Autodesk Plant 3D… pour produire des isométriques normalisées. Coordonnées en mm, dans le repère interne du projet.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace PipeFit.Isometries.Core
{
    public static class ExportPcf
    {
        static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        public static string Generer(Spool s, string projet)
        {
            var sb = new StringBuilder();
            void L(string ligne) => sb.Append(ligne).Append("\r\n");

            L("ISOGEN-FILES ISOGEN.FLS");
            L("UNITS-BORE MM");
            L("UNITS-CO-ORDS MM");
            L("UNITS-WEIGHT KGS");
            L("UNITS-BOLT-DIA MM");
            L("UNITS-BOLT-LENGTH MM");
            L("PIPELINE-REFERENCE " + Ascii(s.Nom));
            if (!string.IsNullOrWhiteSpace(projet)) L("    PROJECT-IDENTIFIER " + Ascii(projet));
            if (!string.IsNullOrWhiteSpace(s.Systeme)) L("    ATTRIBUTE1 " + Ascii(s.Systeme));
            if (!string.IsNullOrWhiteSpace(s.Materiau)) L("    PIPING-SPEC " + Ascii(s.Materiau));

            var codes = new Dictionary<string, string>();
            foreach (var c in AnalyseSpool.Parcourir(s.Composants))
            {
                var bloc = Composant(c);
                if (bloc == null) continue;
                sb.Append(bloc);
                var code = CodeArticle(c);
                L("    ITEM-CODE " + code);
                if (!string.IsNullOrEmpty(c.Repere)) L("    COMPONENT-IDENTIFIER " + Ascii(c.Repere));
                codes[code] = c.Designation + (c.Materiau != "" ? " - " + c.Materiau : "") + (c.Taille != "" ? " - " + c.Taille : "");
            }

            L("MATERIALS");
            foreach (var kv in codes.OrderBy(k => k.Key, StringComparer.Ordinal))
            {
                L("ITEM-CODE " + kv.Key);
                L("    DESCRIPTION " + Ascii(kv.Value));
            }
            return sb.ToString();
        }

        static string Composant(Composant c)
        {
            var e = c.Extremites;
            var sb = new StringBuilder();
            void L(string ligne) => sb.Append(ligne).Append("\r\n");
            void Bout(Extremite x) => L("    END-POINT " + Pt(x.Position) + " " + Bore(x.DnMm));
            Point3 centre = c.Centre ?? (e.Count >= 2 ? (e[0].Position + e[1].Position) * 0.5 : e.Count == 1 ? e[0].Position : new Point3());

            switch (c.Type)
            {
                case TypeComposant.Tube:
                    if (e.Count < 2) return null;
                    L("PIPE"); Bout(e[0]); Bout(e[1]);
                    break;
                case TypeComposant.Coude:
                    if (e.Count < 2) return null;
                    L("ELBOW"); Bout(e[0]); Bout(e[1]);
                    L("    CENTRE-POINT " + Pt(centre));
                    if (c.AngleDeg > 0) L("    ANGLE " + Math.Round(c.AngleDeg * 100).ToString(Inv));
                    L("    SKEY ELBW");
                    break;
                case TypeComposant.Te:
                case TypeComposant.Croix:
                    {
                        if (e.Count < 3) return null;
                        var (r1, r2) = Passage(e, centre);
                        var branches = e.Where(x => x != r1 && x != r2).ToList();
                        L(c.Type == TypeComposant.Te ? "TEE" : "CROSS"); Bout(r1); Bout(r2);
                        L("    CENTRE-POINT " + Pt(centre));
                        for (int i = 0; i < branches.Count && i < 2; i++)
                            L("    BRANCH" + (i + 1) + "-POINT " + Pt(branches[i].Position) + " " + Bore(branches[i].DnMm));
                        L(c.Type == TypeComposant.Te ? "    SKEY TEBW" : "    SKEY CRBW");
                        break;
                    }
                case TypeComposant.Reduction:
                    if (e.Count < 2) return null;
                    L("REDUCER-CONCENTRIC"); Bout(e[0]); Bout(e[1]);
                    L("    SKEY RCBW");
                    break;
                case TypeComposant.Piquage:
                    {
                        if (e.Count < 2) return null;
                        var principal = e.OrderByDescending(x => x.DnMm).First();
                        var branche = e.First(x => x != principal);
                        L("OLET");
                        L("    CENTRE-POINT " + Pt(principal.Position));
                        L("    BRANCH1-POINT " + Pt(branche.Position) + " " + Bore(branche.DnMm));
                        L("    SKEY WOBW");
                        break;
                    }
                case TypeComposant.Bride:
                    if (e.Count >= 2) { L("FLANGE"); Bout(e[0]); Bout(e[1]); L("    SKEY FLWN"); }
                    else if (e.Count == 1) { L("FLANGE-BLIND"); Bout(e[0]); L("    SKEY FLBL"); }
                    else return null;
                    break;
                case TypeComposant.Bouchon:
                    if (e.Count < 1) return null;
                    L("CAP"); Bout(e[0]);
                    L("    SKEY CPBW");
                    break;
                case TypeComposant.Vanne:
                    if (e.Count < 2) return null;
                    L("VALVE"); Bout(e[0]); Bout(e[1]);
                    L("    SKEY VVFL");
                    break;
                case TypeComposant.Accessoire:
                    if (e.Count < 2) return null;
                    L("INSTRUMENT"); Bout(e[0]); Bout(e[1]);
                    L("    CENTRE-POINT " + Pt(centre));
                    L("    SKEY INFL");
                    break;
                case TypeComposant.Manchon:
                    if (e.Count < 2) return null;
                    L("COUPLING"); Bout(e[0]); Bout(e[1]);
                    break;
                default:
                    if (e.Count < 2) return null;
                    L("MISC-COMPONENT"); Bout(e[0]); Bout(e[1]);
                    break;
            }
            return sb.ToString();
        }

        /// <summary>Extrémités du passage droit d'un té : les deux qui sont le plus à l'opposé l'une de l'autre.</summary>
        public static (Extremite, Extremite) Passage(List<Extremite> e, Point3 centre)
        {
            Extremite a = e[0], b = e[1];
            double meilleur = double.MaxValue;
            for (int i = 0; i < e.Count; i++)
                for (int j = i + 1; j < e.Count; j++)
                {
                    var u = (e[i].Position - centre).Normalise();
                    var v = (e[j].Position - centre).Normalise();
                    var d = u.Dot(v);
                    if (d < meilleur - 1e-6) { meilleur = d; a = e[i]; b = e[j]; }
                }
            return (a, b);
        }

        static string CodeArticle(Composant c)
        {
            var brut = AnalyseSpool.Libelle(c.Type) + "-" + (c.TypeNom != "" ? c.TypeNom : c.Famille) + "-" + Math.Round(c.DnMm).ToString(Inv);
            var sb = new StringBuilder();
            foreach (var ch in Ascii(brut).ToUpperInvariant()) sb.Append(char.IsLetterOrDigit(ch) || ch == '-' ? ch : '-');
            var code = sb.ToString();
            while (code.Contains("--")) code = code.Replace("--", "-");
            return code.Trim('-');
        }

        static string Pt(Point3 p) => string.Format(Inv, "{0:0.0} {1:0.0} {2:0.0}", p.X, p.Y, p.Z);
        static string Bore(double dn) => Math.Round(dn).ToString(Inv);

        /// <summary>Texte ASCII sans accents (les lecteurs PCF n'acceptent pas toujours l'UTF-8).</summary>
        public static string Ascii(string s)
        {
            var d = (s ?? "").Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder();
            foreach (var ch in d)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
                if (ch == '°') sb.Append("DEG");
                else if (ch < 128 && !char.IsControl(ch)) sb.Append(ch);
                else if (ch == 'œ') sb.Append("oe");
                else sb.Append(' ');
            }
            return sb.ToString().Trim();
        }
    }
}
