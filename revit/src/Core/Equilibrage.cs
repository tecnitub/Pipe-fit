// Équilibrage d'un réseau hydraulique : pour chaque équipement consommateur, sa boucle complète (aller depuis la source
// — production ou pompe —, l'équipement, retour vers la source : deux chemins sans élément commun). Débit de chaque
// élément = somme des débits des boucles qui le traversent. Perte de charge de chaque boucle ; la plus défavorisée
// (« boucle critique ») fixe la hauteur manométrique ; chaque autre boucle doit dissiper la différence dans sa vanne de
// réglage : perte cible de la vanne, Kv requis = Q / √(ΔP en bar). Point de fonctionnement de la pompe.
using System;
using System.Collections.Generic;
using System.Linq;

namespace PipeFit.Isometries.Core
{
    public sealed class BoucleEquilibrage
    {
        public string Consommateur = "", Libelle = "";
        public double DebitM3h;
        public List<string> Chemin = new List<string>();
        public List<Troncon> Troncons = new List<Troncon>();
        public double CircuitPa, ConsommateurPa, TotalPa, ADissiperPa;
        public string Vanne = "", VanneLibelle = "";
        public double VanneActuellePa, VanneCiblePa, KvRequis;
        public bool Critique;
        public string Remarque = "";
    }

    public sealed class ResultatEquilibrage
    {
        public List<BoucleEquilibrage> Boucles = new List<BoucleEquilibrage>();
        public double DebitTotalM3h, HauteurPa, SourcePa;
        public List<string> NonRelies = new List<string>();
        public double HauteurMce(Fluide f) => (HauteurPa + SourcePa) / (f.Rho * 9.80665);
    }

    public static class Equilibrage
    {
        /// <summary>Plus court chemin de a à b (extrémités exclues) par les nœuds traversables, sans passer par « interdits ».</summary>
        public static List<string> Chemin(Dictionary<string, List<string>> voisins, string a, string b, Func<string, bool> traversable, HashSet<string> interdits = null)
        {
            var parent = new Dictionary<string, string> { [a] = null };
            var file = new Queue<string>(); file.Enqueue(a);
            while (file.Count > 0)
            {
                var u = file.Dequeue();
                foreach (var v in voisins.TryGetValue(u, out var l) ? l : new List<string>())
                {
                    if (parent.ContainsKey(v)) continue;
                    if (v == b) { parent[v] = u; file.Clear(); break; }
                    if (!traversable(v) || (interdits != null && interdits.Contains(v))) continue;
                    parent[v] = u; file.Enqueue(v);
                }
            }
            if (!parent.ContainsKey(b)) return null;
            var res = new List<string>();
            for (var n = parent[b]; n != null && n != a; n = parent[n]) res.Add(n);
            res.Reverse();
            return res;
        }

        /// <summary>Boucle d'un consommateur : aller (source → consommateur) puis retour (consommateur → source), sans nœud commun.</summary>
        public static (List<string> Aller, List<string> Retour)? Boucle(Dictionary<string, List<string>> voisins, string source, string consommateur, Func<string, bool> traversable)
        {
            var aller = Chemin(voisins, source, consommateur, traversable);
            if (aller == null) return null;
            var retour = Chemin(voisins, consommateur, source, traversable, new HashSet<string>(aller));
            return (aller, retour ?? new List<string>());
        }

        /// <param name="ligne">Tronçon de calcul d'un élément, connaissant l'élément précédent et suivant sur la boucle, son débit et celui des autres éléments.</param>
        /// <param name="perteConsommateur">Perte de charge propre d'un consommateur (Pa, fabricant).</param>
        /// <param name="estVanneReglage">Vanne d'équilibrage (STAD, STAF…) sur laquelle dissiper.</param>
        public static ResultatEquilibrage Calculer(Dictionary<string, List<string>> voisins, string source, Dictionary<string, double> consommateurs,
            Func<string, bool> traversable, Func<string, string, string, double, Func<string, double>, Troncon> ligne, Func<string, double> perteConsommateur,
            Func<string, bool> estVanneReglage, Fluide f, double perteSourcePa = 0, double vanneMiniPa = 3000, Func<string, string> libelle = null)
        {
            var res = new ResultatEquilibrage { SourcePa = perteSourcePa };
            var boucles = new List<BoucleEquilibrage>();
            foreach (var kv in consommateurs)
            {
                var b = Boucle(voisins, source, kv.Key, traversable);
                if (b == null) { res.NonRelies.Add(kv.Key); continue; }
                var bc = new BoucleEquilibrage { Consommateur = kv.Key, Libelle = libelle?.Invoke(kv.Key) ?? kv.Key, DebitM3h = kv.Value };
                bc.Chemin.Add(source); bc.Chemin.AddRange(b.Value.Aller); bc.Chemin.Add(kv.Key); bc.Chemin.AddRange(b.Value.Retour); bc.Chemin.Add(source);
                if (b.Value.Retour.Count == 0) bc.Remarque = "retour non trouvé (aller seul compté)";
                boucles.Add(bc);
            }
            // Débit de chaque élément : somme des boucles qui le traversent
            var q = new Dictionary<string, double>();
            foreach (var bc in boucles) foreach (var n in bc.Chemin.Distinct()) if (n != source && n != bc.Consommateur) q[n] = (q.TryGetValue(n, out var x) ? x : 0) + bc.DebitM3h;
            foreach (var bc in boucles)
            {
                for (int i = 1; i < bc.Chemin.Count - 1; i++)
                {
                    var n = bc.Chemin[i];
                    if (n == bc.Consommateur) continue;
                    var t = ligne(n, bc.Chemin[i - 1], bc.Chemin[i + 1], q.TryGetValue(n, out var qq) ? qq : bc.DebitM3h, id => q.TryGetValue(id, out var qi) ? qi : 0);
                    if (t == null) continue;
                    PerteCharge.Calculer(t, f);
                    bc.Troncons.Add(t);
                }
                bc.CircuitPa = bc.Troncons.Sum(t => t.PerteTotalePa);
                bc.ConsommateurPa = perteConsommateur?.Invoke(bc.Consommateur) ?? 0;
                bc.TotalPa = bc.CircuitPa + bc.ConsommateurPa;
                var v = bc.Troncons.FirstOrDefault(t => estVanneReglage(t.Id));
                if (v != null) { bc.Vanne = v.Id; bc.VanneLibelle = (v.Repere != "" ? v.Repere + " " : "") + v.Designation; bc.VanneActuellePa = v.PerteTotalePa; }
            }
            if (boucles.Count == 0) return res;
            // Boucle critique : la plus forte perte ; sa vanne garde au moins la perte mini (autorité, mesure)
            var crit = boucles.OrderByDescending(b => b.TotalPa).First();
            crit.Critique = true;
            double appoint = crit.Vanne != "" ? Math.Max(0, vanneMiniPa - crit.VanneActuellePa) : 0;
            res.HauteurPa = crit.TotalPa + appoint;
            foreach (var bc in boucles)
            {
                bc.ADissiperPa = Math.Max(0, res.HauteurPa - bc.TotalPa);
                if (bc.Vanne != "")
                {
                    bc.VanneCiblePa = bc.VanneActuellePa + bc.ADissiperPa;
                    var qv = q.TryGetValue(bc.Vanne, out var qq) ? qq : bc.DebitM3h;
                    bc.KvRequis = bc.VanneCiblePa > 0 ? Math.Round(qv / Math.Sqrt(bc.VanneCiblePa / 1e5), 2) : 0;
                }
                else if (bc.ADissiperPa > 1000) bc.Remarque = (bc.Remarque != "" ? bc.Remarque + " ; " : "") + "pas de vanne de réglage : " + Math.Round(bc.ADissiperPa / 1000, 1) + " kPa à dissiper";
            }
            res.Boucles = boucles.OrderByDescending(b => b.TotalPa).ToList();
            res.DebitTotalM3h = boucles.Sum(b => b.DebitM3h);
            return res;
        }
    }
}
