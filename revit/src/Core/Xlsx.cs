// Classeur Excel (.xlsx) écrit sans bibliothèque externe : SpreadsheetML + archive ZIP (System.IO.Compression).
// Feuilles avec largeurs de colonnes, ligne d'en-tête en gras sur fond gris, volets figés, filtre automatique,
// nombres avec format (0, 0.00, 0.0"), formules de total (avec leur valeur déjà calculée).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;

namespace PipeFit.Isometries.Core
{
    public enum StyleCellule { Texte = 0, Entete = 1, Entier = 2, Decimal = 3, Gras = 4, TotalEntier = 5, TotalDecimal = 6, Titre = 7, Pouces = 8, TotalPouces = 9 }

    public sealed class Cellule
    {
        public object Valeur;          // string, double, int, null
        public StyleCellule Style;
        public string Formule;         // sans « = »
        public Cellule(object v, StyleCellule s = StyleCellule.Texte, string f = null) { Valeur = v; Style = s; Formule = f; }
    }

    public sealed class FeuilleXlsx
    {
        public string Nom = "Feuille";
        public List<double> Largeurs = new List<double>();
        public List<List<Cellule>> Lignes = new List<List<Cellule>>();
        /// <summary>Ligne d'en-tête (base 0) : volets figés sous elle et filtre automatique ; -1 sans.</summary>
        public int LigneEntete = -1;
        public int NbColonnesFiltre;
        /// <summary>Dernière ligne de données filtrée (base 0) ; -1 : jusqu'à la fin des lignes non vides.</summary>
        public int DerniereLigneFiltre = -1;

        internal int FinFiltre()
        {
            if (DerniereLigneFiltre >= LigneEntete) return DerniereLigneFiltre + 1;
            int fin = LigneEntete + 1;
            while (fin < Lignes.Count && Lignes[fin].Count > 0) fin++;
            return Math.Max(LigneEntete + 1, fin);
        }

        public List<Cellule> Ajouter(params Cellule[] c) { var l = c.ToList(); Lignes.Add(l); return l; }
        public void Vide() => Lignes.Add(new List<Cellule>());
        /// <summary>Numéro de ligne Excel (base 1) de la prochaine ligne ajoutée.</summary>
        public int Prochaine => Lignes.Count + 1;
    }

    public static class Xlsx
    {
        static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        public static string Colonne(int i)
        {
            var s = ""; i++;
            while (i > 0) { int r = (i - 1) % 26; s = (char)('A' + r) + s; i = (i - 1) / 26; }
            return s;
        }

        static string Esc(string s) => new string((s ?? "").Where(ch => ch == '\t' || ch == '\n' || ch == '\r' || ch >= 0x20).ToArray())
            .Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");

        static string NomFeuille(string n)
        {
            foreach (var c in new[] { '\\', '/', '?', '*', '[', ']', ':' }) n = n.Replace(c, ' ');
            n = n.Trim();
            return n.Length > 31 ? n.Substring(0, 31) : n == "" ? "Feuille" : n;
        }

        const string Styles = @"<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?>
<styleSheet xmlns=""http://schemas.openxmlformats.org/spreadsheetml/2006/main"">
<numFmts count=""2""><numFmt numFmtId=""164"" formatCode=""#,##0.00""/><numFmt numFmtId=""165"" formatCode=""#,##0.0\&quot;""/></numFmts>
<fonts count=""3""><font><sz val=""10""/><name val=""Arial""/></font><font><b/><sz val=""10""/><name val=""Arial""/></font><font><b/><sz val=""13""/><name val=""Arial""/></font></fonts>
<fills count=""3""><fill><patternFill patternType=""none""/></fill><fill><patternFill patternType=""gray125""/></fill><fill><patternFill patternType=""solid""><fgColor rgb=""FFD9E1F2""/><bgColor indexed=""64""/></patternFill></fill></fills>
<borders count=""2""><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style=""thin""/><bottom style=""thin""/><diagonal/></border></borders>
<cellStyleXfs count=""1""><xf numFmtId=""0"" fontId=""0"" fillId=""0"" borderId=""0""/></cellStyleXfs>
<cellXfs count=""10"">
<xf numFmtId=""0"" fontId=""0"" fillId=""0"" borderId=""0"" xfId=""0""/>
<xf numFmtId=""0"" fontId=""1"" fillId=""2"" borderId=""1"" xfId=""0"" applyFont=""1"" applyFill=""1"" applyBorder=""1""/>
<xf numFmtId=""3"" fontId=""0"" fillId=""0"" borderId=""0"" xfId=""0"" applyNumberFormat=""1""/>
<xf numFmtId=""164"" fontId=""0"" fillId=""0"" borderId=""0"" xfId=""0"" applyNumberFormat=""1""/>
<xf numFmtId=""0"" fontId=""1"" fillId=""0"" borderId=""0"" xfId=""0"" applyFont=""1""/>
<xf numFmtId=""3"" fontId=""1"" fillId=""0"" borderId=""1"" xfId=""0"" applyNumberFormat=""1"" applyFont=""1"" applyBorder=""1""/>
<xf numFmtId=""164"" fontId=""1"" fillId=""0"" borderId=""1"" xfId=""0"" applyNumberFormat=""1"" applyFont=""1"" applyBorder=""1""/>
<xf numFmtId=""0"" fontId=""2"" fillId=""0"" borderId=""0"" xfId=""0"" applyFont=""1""/>
<xf numFmtId=""165"" fontId=""0"" fillId=""0"" borderId=""0"" xfId=""0"" applyNumberFormat=""1""/>
<xf numFmtId=""165"" fontId=""1"" fillId=""0"" borderId=""1"" xfId=""0"" applyNumberFormat=""1"" applyFont=""1"" applyBorder=""1""/>
</cellXfs>
<cellStyles count=""1""><cellStyle name=""Normal"" xfId=""0"" builtinId=""0""/></cellStyles>
</styleSheet>";

        static string Feuille(FeuilleXlsx f)
        {
            var sb = new StringBuilder();
            sb.Append(@"<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?><worksheet xmlns=""http://schemas.openxmlformats.org/spreadsheetml/2006/main"" xmlns:r=""http://schemas.openxmlformats.org/officeDocument/2006/relationships""><sheetPr><pageSetUpPr fitToPage=""1""/></sheetPr>");
            if (f.LigneEntete >= 0)
                sb.Append("<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"" + (f.LigneEntete + 1) + "\" topLeftCell=\"A" + (f.LigneEntete + 2)
                    + "\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews>");
            // Largeur de colonne : au moins celle du titre d'en-tête (gras) et des valeurs courtes
            if (f.LigneEntete >= 0 && f.LigneEntete < f.Lignes.Count)
                for (int c = 0; c < f.Lignes[f.LigneEntete].Count; c++)
                {
                    var t = f.Lignes[f.LigneEntete][c]?.Valeur as string ?? "";
                    while (f.Largeurs.Count <= c) f.Largeurs.Add(10);
                    f.Largeurs[c] = Math.Max(f.Largeurs[c], Math.Ceiling(t.Length * 1.15 + 2.5));
                }
            if (f.Largeurs.Count > 0)
            {
                sb.Append("<cols>");
                for (int i = 0; i < f.Largeurs.Count; i++)
                    sb.Append("<col min=\"" + (i + 1) + "\" max=\"" + (i + 1) + "\" width=\"" + f.Largeurs[i].ToString("0.##", Inv) + "\" customWidth=\"1\"/>");
                sb.Append("</cols>");
            }
            sb.Append("<sheetData>");
            for (int r = 0; r < f.Lignes.Count; r++)
            {
                var ligne = f.Lignes[r];
                sb.Append("<row r=\"" + (r + 1) + "\">");
                for (int c = 0; c < ligne.Count; c++)
                {
                    var cel = ligne[c];
                    if (cel == null) continue;
                    var refc = Colonne(c) + (r + 1);
                    var s = (int)cel.Style;
                    if (cel.Formule != null)
                    {
                        sb.Append("<c r=\"" + refc + "\" s=\"" + s + "\"><f>" + Esc(cel.Formule) + "</f>");
                        if (cel.Valeur is IConvertible cv && !(cel.Valeur is string)) sb.Append("<v>" + Convert.ToDouble(cv, Inv).ToString("R", Inv) + "</v>");
                        sb.Append("</c>");
                    }
                    else if (cel.Valeur == null) { if (s != 0) sb.Append("<c r=\"" + refc + "\" s=\"" + s + "\"/>"); }
                    else if (cel.Valeur is string t)
                    {
                        if (t.Length > 0) sb.Append("<c r=\"" + refc + "\" s=\"" + s + "\" t=\"inlineStr\"><is><t xml:space=\"preserve\">" + Esc(t) + "</t></is></c>");
                        else if (s != 0) sb.Append("<c r=\"" + refc + "\" s=\"" + s + "\"/>");
                    }
                    else
                        sb.Append("<c r=\"" + refc + "\" s=\"" + s + "\"><v>" + Convert.ToDouble(cel.Valeur, Inv).ToString("R", Inv) + "</v></c>");
                }
                sb.Append("</row>");
            }
            sb.Append("</sheetData>");
            if (f.LigneEntete >= 0 && f.NbColonnesFiltre > 0)
            {
                // Filtre sur l'en-tête et les lignes de données (sans la ligne de total)
                sb.Append("<autoFilter ref=\"A" + (f.LigneEntete + 1) + ":" + Colonne(f.NbColonnesFiltre - 1) + f.FinFiltre() + "\"/>");
            }
            sb.Append("<pageMargins left=\"0.5\" right=\"0.5\" top=\"0.6\" bottom=\"0.6\" header=\"0.3\" footer=\"0.3\"/>");
            sb.Append("<pageSetup orientation=\"landscape\" paperSize=\"9\" fitToWidth=\"1\" fitToHeight=\"0\"/>");
            sb.Append("</worksheet>");
            return sb.ToString();
        }

        public static byte[] Ecrire(IList<FeuilleXlsx> feuilles)
        {
            var noms = new List<string>();
            foreach (var f in feuilles)
            {
                var n = NomFeuille(f.Nom); var b = n; int k = 2;
                while (noms.Contains(n, StringComparer.OrdinalIgnoreCase)) n = (b.Length > 27 ? b.Substring(0, 27) : b) + " (" + k++ + ")";
                noms.Add(n);
            }
            using (var ms = new MemoryStream())
            {
                using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, true))
                {
                    void Part(string nom, string contenu)
                    {
                        var e = zip.CreateEntry(nom, CompressionLevel.Optimal);
                        using (var w = new StreamWriter(e.Open(), new UTF8Encoding(false))) w.Write(contenu);
                    }
                    Part("[Content_Types].xml", @"<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?><Types xmlns=""http://schemas.openxmlformats.org/package/2006/content-types""><Default Extension=""rels"" ContentType=""application/vnd.openxmlformats-package.relationships+xml""/><Default Extension=""xml"" ContentType=""application/xml""/><Override PartName=""/xl/workbook.xml"" ContentType=""application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml""/><Override PartName=""/xl/styles.xml"" ContentType=""application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml""/>"
                        + string.Concat(feuilles.Select((_, i) => "<Override PartName=\"/xl/worksheets/sheet" + (i + 1) + ".xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>")) + "</Types>");
                    Part("_rels/.rels", @"<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?><Relationships xmlns=""http://schemas.openxmlformats.org/package/2006/relationships""><Relationship Id=""rId1"" Type=""http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"" Target=""xl/workbook.xml""/></Relationships>");
                    var defs = new StringBuilder();
                    for (int i = 0; i < feuilles.Count; i++)
                        if (feuilles[i].LigneEntete >= 0 && feuilles[i].NbColonnesFiltre > 0)
                        {
                            var f = feuilles[i]; int fin = f.FinFiltre();
                            defs.Append("<definedName name=\"_xlnm._FilterDatabase\" localSheetId=\"" + i + "\" hidden=\"1\">'" + Esc(noms[i].Replace("'", "''")) + "'!$A$" + (f.LigneEntete + 1)
                                + ":$" + Colonne(f.NbColonnesFiltre - 1) + "$" + fin + "</definedName>");
                        }
                    Part("xl/workbook.xml", @"<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?><workbook xmlns=""http://schemas.openxmlformats.org/spreadsheetml/2006/main"" xmlns:r=""http://schemas.openxmlformats.org/officeDocument/2006/relationships""><sheets>"
                        + string.Concat(noms.Select((n, i) => "<sheet name=\"" + Esc(n) + "\" sheetId=\"" + (i + 1) + "\" r:id=\"rId" + (i + 1) + "\"/>")) + "</sheets>"
                        + (defs.Length > 0 ? "<definedNames>" + defs + "</definedNames>" : "") + "<calcPr calcId=\"191029\" fullCalcOnLoad=\"1\"/></workbook>");
                    Part("xl/_rels/workbook.xml.rels", @"<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?><Relationships xmlns=""http://schemas.openxmlformats.org/package/2006/relationships"">"
                        + string.Concat(feuilles.Select((_, i) => "<Relationship Id=\"rId" + (i + 1) + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet" + (i + 1) + ".xml\"/>"))
                        + "<Relationship Id=\"rId" + (feuilles.Count + 1) + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>");
                    Part("xl/styles.xml", Styles);
                    for (int i = 0; i < feuilles.Count; i++) Part("xl/worksheets/sheet" + (i + 1) + ".xml", Feuille(feuilles[i]));
                }
                return ms.ToArray();
            }
        }
    }
}
