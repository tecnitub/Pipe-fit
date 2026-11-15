// Quantitatif pour le chiffrage automatique dans Pipe-Fit (Devis → Chiffrage depuis plan) :
//  - fournitures par réseau : tubes en longueur totale (mm), raccords et robinetterie en nombre, par famille, type, DN, matériau ;
//  - soudures et joints boulonnés réellement présents dans la maquette, par réseau et par DN :
//      « Soudure atelier » (dans un spool), « Soudure chantier » (entre deux spools ou vers un équipement),
//      « Joint boulonné atelier » / « Joint boulonné chantier » ;
//      pour la tuyauterie pas encore découpée en spools : « Soudure » et « Joint boulonné », à répartir par le CRM
//      selon sa part atelier.
// Un raccordement entre deux spools exportés ensemble n'est compté qu'une fois.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace PipeFit.Isometries.Core
{
    public sealed class LigneQuantitatif
    {
        public string Reseau = "", Famille = "", Type = "", Taille = "", Materiau = "", Designation = "";
        public double DnMm, LongueurMm;
        public int Nombre;
        public SortedSet<string> Spools = new SortedSet<string>(Comparer<string>.Create(AnalyseSpool.ComparerNaturel));
        public bool EstTube;
        /// <summary>0 fournitures, 1 soudures / joints (ordre d'affichage).</summary>
        public int Rang;
    }

    public static class Quantitatif
    {
        static readonly CultureInfo Fr = CultureInfo.GetCultureInfo("fr-FR");

        public static List<LigneQuantitatif> Calculer(IEnumerable<Spool> spools)
        {
            var lignes = new Dictionary<string, LigneQuantitatif>();
            var raccordsVus = new HashSet<string>();

            LigneQuantitatif Ligne(string cle, Func<LigneQuantitatif> nouvelle)
            {
                if (!lignes.TryGetValue(cle, out var l)) lignes[cle] = l = nouvelle();
                return l;
            }

            foreach (var s in spools)
            {
                var nomSpool = s.HorsSpool ? "" : s.Nom;
                foreach (var c in s.Composants)
                {
                    var reseau = c.Systeme != "" ? c.Systeme : s.Systeme;
                    var taille = Taille(c);
                    var tube = c.Type == TypeComposant.Tube;
                    var famille = tube ? "Tube" : c.Famille;
                    var type = c.TypeNom;
                    var cle = string.Join("|", "F", reseau, AnalyseSpool.Normaliser(famille), AnalyseSpool.Normaliser(type), taille, AnalyseSpool.Normaliser(c.Materiau));
                    var l = Ligne(cle, () => new LigneQuantitatif
                    {
                        Reseau = reseau, Famille = famille, Type = type, Taille = taille, DnMm = c.DnMm, Materiau = c.Materiau,
                        Designation = c.Designation, EstTube = tube,
                    });
                    // Tube acheté surlongueurs comprises (recoupées sur place)
                    if (tube) l.LongueurMm += c.LongueurMm + c.SurlongueurMm; else l.Nombre++;
                    if (nomSpool != "") l.Spools.Add(nomSpool);
                }

                foreach (var a in s.Assemblages)
                {
                    string famille;
                    switch (a.Nature)
                    {
                        case NatureAssemblage.Soudure: famille = s.HorsSpool ? "Soudure" : "Soudure atelier"; break;
                        case NatureAssemblage.Boulonne: famille = s.HorsSpool ? "Joint boulonné" : "Joint boulonné atelier"; break;
                        case NatureAssemblage.RaccordementChantier:
                            // Compté une fois pour les deux spools qui se raccordent l'un à l'autre (même paire d'éléments)
                            if (!raccordsVus.Add(string.CompareOrdinal(a.A.Id, a.Exterieur) < 0 ? a.A.Id + "|" + a.Exterieur : a.Exterieur + "|" + a.A.Id)) continue;
                            var boulonne = AnalyseSpool.Boulonnable(a.A);
                            famille = s.HorsSpool ? (boulonne ? "Joint boulonné" : "Soudure") : (boulonne ? "Joint boulonné chantier" : "Soudure chantier");
                            break;
                        default: continue; // extrémité libre : rien de connu à cet endroit
                    }
                    var reseau = a.A.Systeme != "" ? a.A.Systeme : s.Systeme;
                    var dn = Diametres.Dn(a.DnMm);
                    var l = Ligne(string.Join("|", "A", reseau, famille, dn), () => new LigneQuantitatif
                    {
                        Reseau = reseau, Famille = famille, Type = famille.StartsWith("Soudure") ? "bout à bout" : "brides", Taille = dn, DnMm = a.DnMm,
                        Designation = Libelle(famille), Rang = 1,
                    });
                    l.Nombre++;
                    if (nomSpool != "") l.Spools.Add(nomSpool);
                }
            }

            return lignes.Values
                .OrderBy(l => l.Reseau, StringComparer.CurrentCultureIgnoreCase).ThenBy(l => l.Rang)
                .ThenBy(l => l.EstTube ? 0 : 1).ThenBy(l => l.Famille, StringComparer.CurrentCultureIgnoreCase)
                .ThenByDescending(l => l.DnMm).ThenBy(l => l.Type, StringComparer.CurrentCultureIgnoreCase)
                .ToList();
        }

        static string Libelle(string famille)
        {
            switch (famille)
            {
                case "Soudure atelier": return "Soudures dans les spools (préfabrication)";
                case "Soudure chantier": return "Soudures de raccordement entre spools / équipements";
                case "Joint boulonné atelier": return "Joints boulonnés dans les spools";
                case "Joint boulonné chantier": return "Joints boulonnés de raccordement";
                case "Soudure": return "Soudures (tuyauterie non découpée en spools)";
                default: return "Joints boulonnés (tuyauterie non découpée en spools)";
            }
        }

        /// <summary>« DN50 », ou « DN80 x DN50 » pour une réduction ou un té réduit (le plus grand d'abord).</summary>
        public static string Taille(Composant c)
        {
            var dns = c.Extremites.Select(e => Math.Round(e.DnMm)).Where(d => d > 0).Distinct().OrderByDescending(d => d).ToList();
            if (dns.Count == 0) return Diametres.Dn(c.DnMm);
            return string.Join(" x ", dns.Select(d => Diametres.Dn(d)));
        }

        /// <summary>
        /// Fichier CSV (« ; », UTF-8) lu par Pipe-Fit : colonnes Réseau, Famille, Type, Taille, Longueur (mm), Nombre reconnues
        /// par l'import du chiffrage ; Matériau, Désignation et Spools pour la lecture.
        /// </summary>
        public static string Csv(IEnumerable<Spool> spools)
        {
            var sb = new StringBuilder();
            void Ligne(params string[] champs) =>
                sb.Append(string.Join(";", champs.Select(v => (v ?? "").IndexOfAny(new[] { ';', '"', '\n', '\r' }) >= 0 ? "\"" + v.Replace("\"", "\"\"") + "\"" : v ?? ""))).Append("\r\n");
            Ligne("Réseau", "Famille", "Type", "Taille", "Longueur", "Nombre", "Matériau", "Désignation", "Repères spools");
            foreach (var l in Calculer(spools))
                Ligne(l.Reseau, l.Famille, l.Type, l.Taille, l.EstTube ? Math.Round(l.LongueurMm).ToString("0", CultureInfo.InvariantCulture) : "",
                    l.EstTube ? "1" : l.Nombre.ToString(CultureInfo.InvariantCulture), l.Materiau, l.Designation, string.Join(", ", l.Spools));
            return sb.ToString();
        }
    }
}
