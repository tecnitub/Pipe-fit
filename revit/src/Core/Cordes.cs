// Revit refuse les courbes plus courtes que sa tolérance (≈ 1,2 mm sur la feuille) : une suite de petits segments
// (cercles des symboles, polygones) est redécoupée en cordes d'au moins « min » mm, en enchaînant les segments qui se
// suivent. Un segment isolé trop court est abandonné.
using System;
using System.Collections.Generic;

namespace PipeFit.Isometries.Core
{
    public static class Cordes
    {
        public static List<(double x1, double y1, double x2, double y2)> Decouper(IEnumerable<(double x1, double y1, double x2, double y2)> segments, double min = 1.25)
        {
            var res = new List<(double, double, double, double)>();
            double sx = 0, sy = 0, lx = double.NaN, ly = double.NaN;
            double L(double ax, double ay, double bx, double by) => Math.Sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
            foreach (var s in segments)
            {
                bool suite = !double.IsNaN(lx) && Math.Abs(s.x1 - lx) < 1e-6 && Math.Abs(s.y1 - ly) < 1e-6;
                if (!suite) { sx = s.x1; sy = s.y1; }
                lx = s.x2; ly = s.y2;
                if (L(sx, sy, lx, ly) >= min) { res.Add((sx, sy, lx, ly)); sx = lx; sy = ly; }
            }
            return res;
        }
    }
}
