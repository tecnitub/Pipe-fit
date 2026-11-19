// Définitions des P&ID d'un projet : chaque P&ID (« PID chaud », « PID froid », « PID aéraulique »…) regroupe des types
// de systèmes. Proposition automatique d'après les noms, enregistrement texte (paramètre des informations du projet).
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace PipeFit.Isometries.Core
{
    public sealed class TypeSystemeInfo
    {
        public string Nom = "", Abreviation = "", Classification = "";
        public bool Air;
        public int Elements;
        public string Libelle => (Abreviation != "" ? Abreviation + " – " : "") + Nom + (Classification != "" ? " (" + Classification + ")" : "") + (Elements > 0 ? " – " + Elements + " élément(s)" : "");
    }

    public sealed class DefinitionPid
    {
        public string Nom = "";
        /// <summary>Noms des types de systèmes du P&ID.</summary>
        public List<string> Systemes = new List<string>();
    }

    public static class DefinitionsPid
    {
        const char SepEntree = '¤', SepNom = '¦';

        public static string Ecrire(IEnumerable<DefinitionPid> defs) =>
            string.Join(SepEntree.ToString(), defs.Where(d => d.Nom.Trim() != "").Select(d => string.Join(SepNom.ToString(), new[] { Nettoyer(d.Nom) }.Concat(d.Systemes.Select(Nettoyer)))));

        static string Nettoyer(string s) => (s ?? "").Replace(SepEntree, ' ').Replace(SepNom, ' ').Trim();

        public static List<DefinitionPid> Lire(string texte)
        {
            var res = new List<DefinitionPid>();
            foreach (var e in (texte ?? "").Split(new[] { SepEntree }, StringSplitOptions.RemoveEmptyEntries))
            {
                var p = e.Split(SepNom);
                if (p[0].Trim() == "") continue;
                res.Add(new DefinitionPid { Nom = p[0].Trim(), Systemes = p.Skip(1).Select(x => x.Trim()).Where(x => x != "").Distinct().ToList() });
            }
            return res;
        }

        static readonly Regex Chaud = new Regex(@"chaud|chauffage|calo|\bch\b|\bec\b|eau chaude|hot|heating|\becs\b|sanitaire chaude|bouclage|vapeur|condensat|plancher chauffant|radiateur|primaire chaud");
        static readonly Regex Froid = new Regex(@"froid|glac|\beg\b|\bef\b|cold|chilled|frigo|refroid|eau perdue|\btour\b|condenseur|\bnr\b|\bebt\b|basse temperature");

        /// <summary>
        /// P&ID proposés : « PID chaud » (chauffage, eau chaude), « PID froid » (eau glacée, refroidissement), « PID aéraulique »
        /// (gaines), « PID autres réseaux » pour le reste des tuyauteries. Seuls les P&ID non vides sont proposés.
        /// </summary>
        public static List<DefinitionPid> Proposer(IEnumerable<TypeSystemeInfo> types)
        {
            var chaud = new DefinitionPid { Nom = "PID chaud" }; var froid = new DefinitionPid { Nom = "PID froid" };
            var air = new DefinitionPid { Nom = "PID aéraulique" }; var autres = new DefinitionPid { Nom = "PID autres réseaux" };
            foreach (var t in types)
            {
                var n = AnalyseSpool.Normaliser(t.Nom + " " + t.Abreviation);
                if (t.Air) air.Systemes.Add(t.Nom);
                else if (Froid.IsMatch(n)) froid.Systemes.Add(t.Nom);
                else if (Chaud.IsMatch(n)) chaud.Systemes.Add(t.Nom);
                else autres.Systemes.Add(t.Nom);
            }
            return new[] { chaud, froid, air, autres }.Where(d => d.Systemes.Count > 0).ToList();
        }
    }
}
