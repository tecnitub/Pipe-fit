// Réglages de génération, mémorisés d'une utilisation à l'autre dans %AppData%\PipeFit\Isometries.ini.
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace PipeFit.Isometries.Revit
{
    public enum Orientation { SudEst, SudOuest, NordEst, NordOuest }

    public sealed class Reglages
    {
        public string ParametreSpool = "";
        public List<string> Spools = new List<string>();
        /// <summary>Cartouche « Famille : Type » ; vide = cadre A3 dessiné par le complément.</summary>
        public string Cartouche = "";
        public string PrefixeFeuille = "ISO-";
        public Orientation Orientation = Orientation.SudEst;
        public bool Unifilaire = true;
        public bool Remplacer = true;
        public string EtiquetteTube = "";
        public string EtiquetteRaccord = "";
        public string EtiquetteAccessoire = "";
        public bool EcrireRepere = true;
        /// <summary>Paramètre texte qui reçoit le repère (T1, 2…) ; vide = paramètre « Marque » de Revit.</summary>
        public string ParametreRepere = "";
        public bool NumerosSoudure = true;
        /// <summary>Cotes d'axe en axe et d'axe à bride sur la feuille.</summary>
        public bool Cotation = true;
        /// <summary>Robinetterie dessinée avec les symboles d'isométrie normalisés (familles masquées dans la vue).</summary>
        public bool SymbolesRobinetterie = true;
        /// <summary>Surlongueur laissée sur les tubes à toutes les soudures chantier, à recouper sur place (mm).</summary>
        public double SurlongueurMm;
        /// <summary>Surlongueur proposée en marquant une soudure chantier (transport, incertitude).</summary>
        public double SurlongueurMarqueMm = 100;
        public bool ExportPdf = true;
        public bool ExportPcf = true;
        public bool ExportCsv = true;
        public string Dossier = "";

        // Numérotation des spools
        public string PrefixeSpool = "SP-";
        public int Chiffres = 3;
        /// <summary>Système devant le numéro : 0 aucun, 1 abréviation du système (EGD-SP-001), 2 nom du système.</summary>
        public int ReseauDevant = 1;
        /// <summary>Longueur de tube maximale d'un spool, en mètres (barre du commerce : 6 m) ; 0 = sans limite.</summary>
        public double LongueurMaxM = 6;
        public bool CompleterBrides = true;
        /// <summary>0 : la sélection (complétée) forme un spool ; 1 : découpage automatique ; 2 : choix manuel élément par élément.</summary>
        public int ModeNumerotation;
        public bool RemplacerNumeros;

        static string Fichier => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PipeFit", "Isometries.ini");

        public static Reglages Charger()
        {
            var r = new Reglages();
            try
            {
                if (!File.Exists(Fichier)) return r;
                foreach (var ligne in File.ReadAllLines(Fichier, Encoding.UTF8))
                {
                    var i = ligne.IndexOf('=');
                    if (i <= 0) continue;
                    var k = ligne.Substring(0, i).Trim();
                    var v = ligne.Substring(i + 1).Trim();
                    switch (k)
                    {
                        case "ParametreSpool": r.ParametreSpool = v; break;
                        case "Cartouche": r.Cartouche = v; break;
                        case "PrefixeFeuille": r.PrefixeFeuille = v; break;
                        case "Orientation": if (Enum.TryParse(v, out Orientation o)) r.Orientation = o; break;
                        case "Unifilaire": r.Unifilaire = v == "1"; break;
                        case "Remplacer": r.Remplacer = v == "1"; break;
                        case "EtiquetteTube": r.EtiquetteTube = v; break;
                        case "EtiquetteRaccord": r.EtiquetteRaccord = v; break;
                        case "EtiquetteAccessoire": r.EtiquetteAccessoire = v; break;
                        case "EcrireRepere": r.EcrireRepere = v == "1"; break;
                        case "ParametreRepere": r.ParametreRepere = v; break;
                        case "NumerosSoudure": r.NumerosSoudure = v == "1"; break;
                        case "Cotation": r.Cotation = v == "1"; break;
                        case "SymbolesRobinetterie": r.SymbolesRobinetterie = v == "1"; break;
                        case "SurlongueurMm": if (double.TryParse(v, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var sl) && sl >= 0) r.SurlongueurMm = sl; break;
                        case "SurlongueurMarqueMm": if (double.TryParse(v, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var sm) && sm >= 0) r.SurlongueurMarqueMm = sm; break;
                        case "ExportPdf": r.ExportPdf = v == "1"; break;
                        case "ExportPcf": r.ExportPcf = v == "1"; break;
                        case "ExportCsv": r.ExportCsv = v == "1"; break;
                        case "Dossier": r.Dossier = v; break;
                        case "PrefixeSpool": r.PrefixeSpool = v; break;
                        case "Chiffres": if (int.TryParse(v, out var ch) && ch >= 1 && ch <= 6) r.Chiffres = ch; break;
                        case "ReseauDevant": if (int.TryParse(v, out var rd) && rd >= 0 && rd <= 2) r.ReseauDevant = rd; break;
                        case "LongueurMaxM": if (double.TryParse(v, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var lm) && lm >= 0) r.LongueurMaxM = lm; break;
                        case "CompleterBrides": r.CompleterBrides = v == "1"; break;
                        case "ModeNumerotation": r.ModeNumerotation = v == "1" ? 1 : v == "2" ? 2 : 0; break;
                        case "RemplacerNumeros": r.RemplacerNumeros = v == "1"; break;
                    }
                }
            }
            catch { /* réglages illisibles : valeurs par défaut */ }
            return r;
        }

        public void Enregistrer()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(Fichier));
                string B(bool b) => b ? "1" : "0";
                File.WriteAllLines(Fichier, new[]
                {
                    "ParametreSpool=" + ParametreSpool, "Cartouche=" + Cartouche, "PrefixeFeuille=" + PrefixeFeuille,
                    "Orientation=" + Orientation, "Unifilaire=" + B(Unifilaire), "Remplacer=" + B(Remplacer),
                    "EtiquetteTube=" + EtiquetteTube, "EtiquetteRaccord=" + EtiquetteRaccord, "EtiquetteAccessoire=" + EtiquetteAccessoire,
                    "EcrireRepere=" + B(EcrireRepere), "ParametreRepere=" + ParametreRepere, "NumerosSoudure=" + B(NumerosSoudure), "Cotation=" + B(Cotation), "SymbolesRobinetterie=" + B(SymbolesRobinetterie),
                    "SurlongueurMm=" + SurlongueurMm.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    "SurlongueurMarqueMm=" + SurlongueurMarqueMm.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    "ExportPdf=" + B(ExportPdf), "ExportPcf=" + B(ExportPcf), "ExportCsv=" + B(ExportCsv), "Dossier=" + Dossier,
                    "PrefixeSpool=" + PrefixeSpool, "Chiffres=" + Chiffres, "ReseauDevant=" + ReseauDevant, "LongueurMaxM=" + LongueurMaxM.ToString(System.Globalization.CultureInfo.InvariantCulture), "CompleterBrides=" + B(CompleterBrides),
                    "ModeNumerotation=" + ModeNumerotation, "RemplacerNumeros=" + B(RemplacerNumeros),
                }, Encoding.UTF8);
            }
            catch { /* pas bloquant */ }
        }
    }
}
