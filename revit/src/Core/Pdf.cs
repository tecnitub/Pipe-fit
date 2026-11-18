// Document PDF simple, écrit sans bibliothèque : pages A4 (paysage ou portrait), textes en Helvetica / Helvetica-Bold
// (codage WinAnsi : accents français, °, ², ³, Ø, ×, €…), traits, rectangles (gris), pied de page « page x / N ».
// Les lettres grecques des formules sont écrites en toutes lettres (lambda, zeta, rho, nu, Delta).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;

namespace PipeFit.Isometries.Core
{
    public sealed class PdfSimple
    {
        static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
        public readonly double Largeur, Hauteur;
        readonly List<StringBuilder> pages = new List<StringBuilder>();
        StringBuilder cur;

        public PdfSimple(bool paysage = true) { Largeur = paysage ? 841.89 : 595.28; Hauteur = paysage ? 595.28 : 841.89; }

        public int NombrePages => pages.Count;
        public void NouvellePage() { cur = new StringBuilder(); pages.Add(cur); }
        public void Page(int i) => cur = pages[i];

        static string N(double v) => Math.Round(v, 2).ToString("0.##", Inv);

        /// <summary>Texte transcrit pour Helvetica WinAnsi (lettres grecques en toutes lettres, symboles absents remplacés).</summary>
        public static string Transcrire(string s)
        {
            var sb = new StringBuilder();
            foreach (var ch in s ?? "")
            {
                switch (ch)
                {
                    case 'Δ': case '∆': sb.Append("Delta "); break;
                    case 'λ': sb.Append("lambda"); break;
                    case 'ζ': sb.Append("zeta"); break;
                    case 'ρ': sb.Append("rho"); break;
                    case 'ν': sb.Append("nu"); break;
                    case '≈': sb.Append("~"); break;
                    case '√': sb.Append("racine"); break;
                    case '≤': sb.Append("<="); break;
                    case '≥': sb.Append(">="); break;
                    case '→': sb.Append("->"); break;
                    case '◄': case '►': break;
                    case ' ': case ' ': sb.Append(' '); break;
                    case '·': sb.Append('·'); break;
                    default: sb.Append(ch); break;
                }
            }
            return sb.ToString();
        }

        static readonly Dictionary<char, byte> Speciaux = new Dictionary<char, byte>
        {
            ['€'] = 0x80, ['‚'] = 0x82, ['„'] = 0x84, ['…'] = 0x85, ['‘'] = 0x91, ['’'] = 0x92, ['“'] = 0x93, ['”'] = 0x94, ['•'] = 0x95,
            ['–'] = 0x96, ['—'] = 0x97, ['™'] = 0x99, ['œ'] = 0x9C, ['Œ'] = 0x8C, ['Ÿ'] = 0x9F, ['ŝ'] = (byte)'s',
        };

        static byte Octet(char c)
        {
            if (c < 0x80 || (c >= 0xA0 && c <= 0xFF)) return (byte)c;
            return Speciaux.TryGetValue(c, out var b) ? b : (byte)'?';
        }

        static string Chaine(string s)
        {
            var sb = new StringBuilder("(");
            foreach (var ch in Transcrire(s))
            {
                var b = Octet(ch);
                if (b == '(' || b == ')' || b == '\\') sb.Append('\\').Append((char)b);
                else if (b < 32 || b > 126) sb.Append('\\').Append(Convert.ToString(b, 8).PadLeft(3, '0'));
                else sb.Append((char)b);
            }
            return sb.Append(')').ToString();
        }

        /// <summary>Largeur (pt) d'un texte en Helvetica (chasse Arial, très proche).</summary>
        public static double LargeurTexte(string s, double taille, bool gras = false) =>
            Transcrire(s).Sum(ch => MiseEnPage.Chasse(ch)) * taille * (gras ? 1.06 : 1.0);

        /// <summary>Texte raccourci (« … ») pour tenir dans une largeur.</summary>
        public static string Tronquer(string s, double largeur, double taille, bool gras = false)
        {
            s = s ?? "";
            if (LargeurTexte(s, taille, gras) <= largeur) return s;
            for (int n = s.Length - 1; n > 0; n--) { var t = s.Substring(0, n).TrimEnd() + "…"; if (LargeurTexte(t, taille, gras) <= largeur) return t; }
            return "";
        }

        /// <summary>Découpe un paragraphe en lignes de largeur donnée.</summary>
        public static List<string> Couper(string texte, double largeur, double taille, bool gras = false)
        {
            var res = new List<string>();
            foreach (var para in (texte ?? "").Replace("\r", "").Split('\n'))
            {
                var mots = para.Split(' '); var l = "";
                foreach (var m in mots)
                {
                    var essai = l == "" ? m : l + " " + m;
                    if (LargeurTexte(essai, taille, gras) <= largeur || l == "") l = essai;
                    else { res.Add(l); l = m; }
                    while (LargeurTexte(l, taille, gras) > largeur && l.Length > 1)
                    {
                        int n = l.Length - 1; while (n > 1 && LargeurTexte(l.Substring(0, n), taille, gras) > largeur) n--;
                        res.Add(l.Substring(0, n)); l = l.Substring(n);
                    }
                }
                res.Add(l);
            }
            return res;
        }

        /// <summary>Texte à la position (x, y) depuis le haut de la page ; alignement 0 gauche, 1 centre, 2 droite.</summary>
        public void Texte(double x, double y, string s, double taille = 9, bool gras = false, int alignement = 0, double gris = 0)
        {
            if (string.IsNullOrEmpty(s)) return;
            var w = LargeurTexte(s, taille, gras);
            var xx = alignement == 1 ? x - w / 2 : alignement == 2 ? x - w : x;
            cur.Append(gris > 0 ? N(gris) + " g " : "").Append("BT /").Append(gras ? "F2 " : "F1 ").Append(N(taille)).Append(" Tf ")
               .Append(N(xx)).Append(' ').Append(N(Hauteur - y)).Append(" Td ").Append(Chaine(s)).Append(" Tj ET").Append(gris > 0 ? " 0 g" : "").Append('\n');
        }

        public void Trait(double x1, double y1, double x2, double y2, double epaisseur = 0.5, double gris = 0)
        {
            cur.Append(N(gris)).Append(" G ").Append(N(epaisseur)).Append(" w ").Append(N(x1)).Append(' ').Append(N(Hauteur - y1)).Append(" m ")
               .Append(N(x2)).Append(' ').Append(N(Hauteur - y2)).Append(" l S 0 G\n");
        }

        public void Rectangle(double x, double y, double l, double h, double fond = -1, double epaisseur = 0.5)
        {
            var r = N(x) + " " + N(Hauteur - y - h) + " " + N(l) + " " + N(h) + " re ";
            if (fond >= 0) cur.Append(N(fond)).Append(" g ").Append(r).Append("f 0 g\n");
            if (epaisseur > 0) cur.Append(N(epaisseur)).Append(" w ").Append(r).Append("S\n");
        }

        public byte[] Ecrire(string titre = "")
        {
            using (var ms = new MemoryStream())
            {
                var offsets = new List<long>();
                void W(string s) { var b = s.Select(Octet).ToArray(); ms.Write(b, 0, b.Length); }
                void Obj(string corps) { offsets.Add(ms.Position); W(offsets.Count + " 0 obj\n" + corps + "\nendobj\n"); }
                W("%PDF-1.4\n%âãÏÓ\n");
                int n = pages.Count;
                // 1 catalogue, 2 pages, 3 F1, 4 F2, 5 infos, puis (page, contenu) × n
                Obj("<< /Type /Catalog /Pages 2 0 R >>");
                Obj("<< /Type /Pages /Count " + n + " /Kids [" + string.Join(" ", Enumerable.Range(0, n).Select(i => (6 + 2 * i) + " 0 R")) + "] >>");
                Obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
                Obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
                Obj("<< /Title <FEFF" + string.Concat((titre ?? "").Select(c => ((int)c).ToString("X4"))) + "> /Producer (Pipe-Fit) /CreationDate (D:" + DateTime.Now.ToString("yyyyMMddHHmmss", Inv) + ") >>");
                for (int i = 0; i < n; i++)
                {
                    Obj("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + N(Largeur) + " " + N(Hauteur) + "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + (7 + 2 * i) + " 0 R >>");
                    var contenu = pages[i].ToString();
                    var octets = contenu.Select(Octet).Count();
                    Obj("<< /Length " + octets + " >>\nstream\n" + contenu + "\nendstream");
                }
                var xref = ms.Position;
                var sb = new StringBuilder("xref\n0 " + (offsets.Count + 1) + "\n0000000000 65535 f \n");
                foreach (var o in offsets) sb.Append(o.ToString("0000000000", Inv)).Append(" 00000 n \n");
                sb.Append("trailer\n<< /Size " + (offsets.Count + 1) + " /Root 1 0 R /Info 5 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
                W(sb.ToString());
                return ms.ToArray();
            }
        }
    }
}
