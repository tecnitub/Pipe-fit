// Modèle indépendant de Revit : un spool = une liste de composants (tubes, raccords, accessoires) reliés par
// leurs extrémités. Toutes les longueurs et coordonnées sont en millimètres.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace PipeFit.Isometries.Core
{
    public enum TypeComposant { Tube, Coude, Te, Croix, Reduction, Piquage, Manchon, Bouchon, Bride, Vanne, Accessoire, Autre }

    public struct Point3
    {
        public double X, Y, Z;
        public Point3(double x, double y, double z) { X = x; Y = y; Z = z; }
        public static Point3 operator +(Point3 a, Point3 b) => new Point3(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
        public static Point3 operator -(Point3 a, Point3 b) => new Point3(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
        public static Point3 operator *(Point3 a, double k) => new Point3(a.X * k, a.Y * k, a.Z * k);
        public double Dot(Point3 b) => X * b.X + Y * b.Y + Z * b.Z;
        public Point3 Cross(Point3 b) => new Point3(Y * b.Z - Z * b.Y, Z * b.X - X * b.Z, X * b.Y - Y * b.X);
        public double Longueur => Math.Sqrt(Dot(this));
        public Point3 Normalise() { var l = Longueur; return l < 1e-9 ? this : this * (1 / l); }
        public double Distance(Point3 b) => (this - b).Longueur;
        public override string ToString() => string.Format(CultureInfo.InvariantCulture, "{0:0.0} {1:0.0} {2:0.0}", X, Y, Z);
    }

    /// <summary>Extrémité (connecteur) d'un composant : position, diamètre nominal et composant raccordé.</summary>
    public sealed class Extremite
    {
        public Point3 Position;
        public double DnMm;
        /// <summary>Direction de l'axe du connecteur, vers l'extérieur du composant (si connue).</summary>
        public Point3? Direction;
        /// <summary>Identifiant du composant raccordé (dans ou hors du spool), null si l'extrémité est libre.</summary>
        public string ConnecteA;
        /// <summary>Sens d'écoulement à cette extrémité, quand Revit le connaît (réseau avec équipement).</summary>
        public SensFlux Sens;
        /// <summary>Soudure chantier imposée à ce joint (transport, incertitude) : le spool est coupé ici.</summary>
        public bool CoupeChantier;
        /// <summary>Surlongueur à recouper sur place propre à ce joint (sinon celle du spool).</summary>
        public double? SurlongueurMm;
        /// <summary>L'élément raccordé de l'autre côté est un tube (pour ne mettre la surlongueur que d'un côté).</summary>
        public bool VoisinEstTube;
    }

    public enum SensFlux { Inconnu, Entree, Sortie }

    /// <summary>
    /// Extrémité du spool sur l'isométrie : d'où il vient (entrée) ou où il va (sortie), et à quoi il se raccorde
    /// (autre spool, équipement, réseau) ; extrémité libre si rien n'est raccordé dans la maquette.
    /// </summary>
    public sealed class Liaison
    {
        public string Numero = "";
        public SensFlux Sens;
        /// <summary>Vrai quand le sens vient de Revit (écoulement calculé), faux s'il est déduit de l'ordre de la ligne.</summary>
        public bool SensConnu;
        /// <summary>Nom de ce qui est raccordé : « SP-102 », « POMPE P1 », « Réseau EG-101 »… ; vide = extrémité libre.</summary>
        public string RaccordeA = "";
        /// <summary>Vrai si l'élément raccordé appartient à un autre spool (renvoi vers son isométrie).</summary>
        public bool AutreSpool;
        public Point3 Position;
        public Point3? Direction;
        public double DnMm;
        public string Libelle => (Sens == SensFlux.Entree ? "VIENT DE " : "VA VERS ") + (RaccordeA != "" ? RaccordeA : "(extrémité libre)");
        public string SensTexte => Sens == SensFlux.Entree ? "Vient de" : "Va vers";
    }

    public sealed class Composant
    {
        public string Id = "";
        public TypeComposant Type = TypeComposant.Autre;
        /// <summary>Vrai pour les accessoires de canalisation (vannes, filtres, instruments…).</summary>
        public bool EstAccessoire;
        public string Famille = "";
        public string TypeNom = "";
        public string Taille = "";
        public double DnMm;
        public string Materiau = "";
        public string Systeme = "";
        /// <summary>Abréviation du système Revit (ex. « EGD » pour eau glacée départ).</summary>
        public string Abreviation = "";
        /// <summary>Système de canalisation (type de système Revit : « Eau glacée départ »…).</summary>
        public string TypeSysteme = "";
        public double LongueurMm;
        public Point3? Centre;
        public List<Extremite> Extremites = new List<Extremite>();

        // Résultats de l'analyse
        /// <summary>Repère affiché sur l'isométrie : « T1 » pour un tube, numéro de nomenclature sinon.</summary>
        public string Repere = "";
        public int LigneNomenclature;
        public double AngleDeg;
        public string Designation = "";
        /// <summary>Surlongueur ajoutée au débit de ce tube, à recouper sur place (soudures chantier).</summary>
        public double SurlongueurMm;
        /// <summary>Pouces-diamètre des soudures portées par cet élément (chaque soudure comptée une seule fois).</summary>
        public double PoucesSoudures;
        /// <summary>Genre de robinetterie (vanne papillon, réglage, clapet, compensateur…), Aucun pour un tube ou un raccord.</summary>
        public GenreRobinet Genre;
        /// <summary>
        /// Piquage dessiné par Revit avec une longueur, qui n'existe pas en atelier : la branche est piquée directement
        /// sur le collecteur. Pas de pièce, pas de soudure côté branche ; sa longueur s'ajoute au débit du tube de branche.
        /// </summary>
        public bool PiquageDirect;
        /// <summary>Tube de branche : longueur du piquage direct ajoutée à son débit.</summary>
        public double PiquageMm;
        /// <summary>Extrémité côté branche d'un piquage direct.</summary>
        public Extremite CoteBranche;
        /// <summary>Extrémité par où arrive le fluide (sens d'écoulement), null s'il n'est pas connu.</summary>
        public Extremite Amont;
    }

    public enum NatureAssemblage { Soudure, Boulonne, RaccordementChantier, ExtremiteLibre }

    public sealed class Assemblage
    {
        public string Numero = "";
        public NatureAssemblage Nature;
        public Point3 Position;
        public double DnMm;
        public Composant A;
        /// <summary>Composant du spool de l'autre côté (null pour un raccordement chantier ou une extrémité libre).</summary>
        public Composant B;
        /// <summary>Identifiant de l'élément hors spool, pour un raccordement chantier.</summary>
        public string Exterieur;
        /// <summary>Surlongueur laissée sur le tube à cette soudure chantier, à recouper sur place.</summary>
        public double SurlongueurMm;
        /// <summary>Tube qui porte la surlongueur.</summary>
        public Composant Recoupe;
        /// <summary>L'élément de l'autre côté (hors spool) est un tube.</summary>
        public bool VoisinTube;
        /// <summary>Assemblage soudé (soudure atelier, ou raccordement chantier soudé) ; faux pour un joint boulonné.</summary>
        public bool Soude => Nature == NatureAssemblage.Soudure
            || (Nature == NatureAssemblage.RaccordementChantier && !AnalyseSpool.Boulonnable(A) && (B == null || !AnalyseSpool.Boulonnable(B)));
        /// <summary>Élément qui porte la soudure dans les nomenclatures (null : portée par l'élément hors spool).</summary>
        public Composant Porteur;
        public double PoucesDiametre => Diametres.Pouces(DnMm);
    }

    public sealed class LigneNomenclature
    {
        public int Repere;
        /// <summary>Cote face à face (mm) d'une vanne ou d'un accessoire en ligne (clapet, filtre, compensateur…), 0 sinon.</summary>
        public double FaceAFaceMm;
        public TypeComposant Type;
        public string Designation = "";
        public string Taille = "";
        public double DnMm;
        public string Materiau = "";
        public int Quantite;
        public double LongueurMm;
        /// <summary>Pouces-diamètre des soudures portées par les éléments de la ligne.</summary>
        public double PoucesSoudures;
        public List<Composant> Composants = new List<Composant>();
        public bool EstTube => Type == TypeComposant.Tube;
    }

    public sealed class Debit
    {
        public string Repere = "";
        public Composant Tube;
        /// <summary>Longueur de coupe, surlongueur comprise.</summary>
        public double LongueurMm;
        /// <summary>Longueur du piquage Revit ajoutée (branche piquée directement sur le collecteur).</summary>
        public double PiquageMm;
        /// <summary>Longueur de l'élément tube dans Revit (paramètre « Longueur »), arrondie au mm.</summary>
        public double LongueurRevitMm;
        public double SurlongueurMm;
        public double DnMm;
        /// <summary>Système de canalisation du tube (type de système, à défaut nom du système).</summary>
        public string Systeme = "";
    }

    public sealed class Spool
    {
        public string Nom = "";
        /// <summary>Tuyauterie pas encore découpée en spools (un groupe par réseau) : soudures à répartir atelier / chantier.</summary>
        public bool HorsSpool;
        /// <summary>Ensemble de montage (zone géographique) : « Ensemble A » regroupe par exemple les spools 1 à 10.</summary>
        public string Ensemble = "";
        /// <summary>Surlongueur laissée sur les tubes aux soudures chantier, à recouper sur place (mm).</summary>
        public double SurlongueurMm;
        public List<Composant> Composants = new List<Composant>();

        // Résultats de l'analyse (AnalyseSpool.Analyser)
        public List<LigneNomenclature> Nomenclature = new List<LigneNomenclature>();
        public List<Debit> Debits = new List<Debit>();
        public List<Assemblage> Assemblages = new List<Assemblage>();
        /// <summary>Cotes de fabrication : axe/axe, axe/bride, axe/extrémité (Cotation.Calculer).</summary>
        public List<Cote> Cotes = new List<Cote>();
        /// <summary>Provenance et destination du spool (Liaisons.Calculer).</summary>
        public List<Liaison> Liaisons = new List<Liaison>();
        /// <summary>Nom des éléments hors spool raccordés, par identifiant (renseigné à la lecture du modèle).</summary>
        public Dictionary<string, string> NomsExterieurs = new Dictionary<string, string>();
        /// <summary>Identifiants des éléments hors spool qui appartiennent à un autre spool.</summary>
        public HashSet<string> ExterieursSpool = new HashSet<string>();
        public string Systeme = "";
        public string Materiau = "";
        public double DnMax;
        public double LongueurDeveloppeeMm;

        public int Nombre(NatureAssemblage n) => Assemblages.FindAll(a => a.Nature == n).Count;
        public double PoucesDiametre(NatureAssemblage n)
        {
            double s = 0;
            foreach (var a in Assemblages) if (a.Nature == n && (n != NatureAssemblage.RaccordementChantier || a.Soude)) s += a.PoucesDiametre;
            return s;
        }

        /// <summary>Raccordements chantier soudés (vrai) ou boulonnés (faux).</summary>
        public int RaccordementsChantier(bool soudes) => Assemblages.Count(a => a.Nature == NatureAssemblage.RaccordementChantier && a.Soude == soudes);
    }

    public static class Diametres
    {
        static readonly Dictionary<int, double> DnPouces = new Dictionary<int, double>
        {
            { 6, 0.125 }, { 8, 0.25 }, { 10, 0.375 }, { 15, 0.5 }, { 20, 0.75 }, { 25, 1 }, { 32, 1.25 }, { 40, 1.5 }, { 50, 2 },
            { 65, 2.5 }, { 80, 3 }, { 90, 3.5 }, { 100, 4 }, { 125, 5 }, { 150, 6 }, { 200, 8 }, { 250, 10 }, { 300, 12 },
            { 350, 14 }, { 400, 16 }, { 450, 18 }, { 500, 20 }, { 550, 22 }, { 600, 24 }, { 700, 28 }, { 800, 32 },
        };

        /// <summary>Pouces-diamètre d'un DN (DN50 = 2"), base du temps de soudure dans Pipe-Fit.</summary>
        public static double Pouces(double dnMm)
        {
            var dn = (int)Math.Round(dnMm);
            return DnPouces.TryGetValue(dn, out var p) ? p : Math.Round(dnMm / 25.0 * 4) / 4;
        }

        public static string Dn(double dnMm) => dnMm > 0 ? "DN" + Math.Round(dnMm).ToString(CultureInfo.InvariantCulture) : "";
    }
}
