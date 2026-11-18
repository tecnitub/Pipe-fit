// Symbole d'isométrie d'une bride : COLLET (embout à collerette soudé au tube) + BRIDE TOURNANTE (bride libre, non
// soudée, qui tourne autour du collet). Dessiné sur la feuille à la place de la famille Revit de la bride.
//   u : le long du tube, 0 à la face de joint, positif vers le tube soudé ; v : perpendiculaire.
//
//        ┌──┐            bride tournante (deux rectangles qui ne touchent pas le tube : elle est libre)
//        └──┘
//   ┃━━┓                 collet : lèvre à la face (u = 0) et épaulement
//   ┃──────────── tube
//   ┃━━┛
//        ┌──┐
//        └──┘
using System;
using System.Collections.Generic;
using System.Linq;

namespace PipeFit.Isometries.Core
{
    public static class SymboleBride
    {
        /// <summary>Bride dessinée par le symbole collet + bride tournante (bride en ligne, deux raccordements).</summary>
        public static bool Dessinee(Composant c) => c.Type == TypeComposant.Bride && c.Extremites.Count == 2;

        /// <summary>
        /// Face de joint et côté soudé d'une bride : la face est l'extrémité qui n'est PAS raccordée à un tube (vanne, autre
        /// bride, équipement, hors spool) ; le côté soudé est celle raccordée au tube.
        /// </summary>
        public static (Extremite Face, Extremite Soudure) Faces(Composant c, Spool s)
        {
            var parId = s.Composants.ToDictionary(x => x.Id);
            bool SurTube(Extremite e) => e.ConnecteA != null
                && (parId.TryGetValue(e.ConnecteA, out var v) ? v.Type == TypeComposant.Tube : e.VoisinEstTube);
            var e0 = c.Extremites[0]; var e1 = c.Extremites[1];
            if (SurTube(e0) && !SurTube(e1)) return (e1, e0);
            if (SurTube(e1) && !SurTube(e0)) return (e0, e1);
            // Indécis : la face est du côté d'un élément boulonnable (vanne, bride) ou hors spool
            bool Boulon(Extremite e) => e.ConnecteA == null || !parId.TryGetValue(e.ConnecteA, out var v) || AnalyseSpool.Boulonnable(v);
            return Boulon(e1) && !Boulon(e0) ? (e1, e0) : (e0, e1);
        }

        /// <summary>Traits du symbole (mm papier), u = 0 à la face, u &gt; 0 vers le tube soudé. Le tube lui-même n'est pas compris.</summary>
        public static List<Robinetterie.Segment> Dessin()
        {
            var s = new List<Robinetterie.Segment>();
            void Seg(double u1, double v1, double u2, double v2) => s.Add(new Robinetterie.Segment(u1, v1, u2, v2));
            void Rect(double u0, double v0, double u1, double v1) { Seg(u0, v0, u1, v0); Seg(u1, v0, u1, v1); Seg(u1, v1, u0, v1); Seg(u0, v1, u0, v0); }
            const double hl = 1.7, ep = 0.55, col = 0.7;
            // Collet : lèvre (face de joint) et épaulement qui revient sur le tube
            Seg(0, -hl, 0, hl);
            Seg(0, hl, ep, hl); Seg(ep, hl, ep, col);
            Seg(0, -hl, ep, -hl); Seg(ep, -hl, ep, -col);
            // Bride tournante : libre derrière la lèvre, ne touche pas le tube
            Rect(ep + 0.3, 1.0, ep + 1.6, 3.3);
            Rect(ep + 0.3, -1.0, ep + 1.6, -3.3);
            return s;
        }
    }
}
