// Modèle indépendant de Revit : un spool = une liste de composants (tubes, raccords, accessoires) reliés par
// leurs extrémités. Toutes les longueurs et coordonnées sont en millimètres.
using System;
using System.Collections.Generic;
using System.Globalization;

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
        /// <summary>Identifiant du composant raccordé (dans ou hors du spool), null si l'extrémité est libre.</summary>
        public string ConnecteA;
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
        public double LongueurMm;
        public Point3? Centre;
        public List<Extremite> Extremites = new List<Extremite>();

        // Résultats de l'analyse
        /// <summary>Repère affiché sur l'isométrie : « T1 » pour un tube, numéro de nomenclature sinon.</summary>
        public string Repere = "";
        public int LigneNomenclature;
        public double AngleDeg;
        public string Designation = "";
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
        public double PoucesDiametre => Diametres.Pouces(DnMm);
    }

    public sealed class LigneNomenclature
    {
        public int Repere;
        public TypeComposant Type;
        public string Designation = "";
        public string Taille = "";
        public double DnMm;
        public string Materiau = "";
        public int Quantite;
        public double LongueurMm;
        public List<Composant> Composants = new List<Composant>();
        public bool EstTube => Type == TypeComposant.Tube;
    }

    public sealed class Debit
    {
        public string Repere = "";
        public Composant Tube;
        public double LongueurMm;
        public double DnMm;
    }

    public sealed class Spool
    {
        public string Nom = "";
        public List<Composant> Composants = new List<Composant>();

        // Résultats de l'analyse (AnalyseSpool.Analyser)
        public List<LigneNomenclature> Nomenclature = new List<LigneNomenclature>();
        public List<Debit> Debits = new List<Debit>();
        public List<Assemblage> Assemblages = new List<Assemblage>();
        public string Systeme = "";
        public string Materiau = "";
        public double DnMax;
        public double LongueurDeveloppeeMm;

        public int Nombre(NatureAssemblage n) => Assemblages.FindAll(a => a.Nature == n).Count;
        public double PoucesDiametre(NatureAssemblage n)
        {
            double s = 0;
            foreach (var a in Assemblages) if (a.Nature == n) s += a.PoucesDiametre;
            return s;
        }
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
