// Filtre de sélection dans la vue : seuls les éléments de tuyauterie (avec connecteurs) peuvent être cliqués.
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI.Selection;

namespace PipeFit.Isometries.Revit
{
    sealed class FiltreTuyauterie : ISelectionFilter
    {
        public bool AllowElement(Element e) => LectureModele.Connecteurs(e).Any();
        public bool AllowReference(Reference r, XYZ p) => true;
    }
}
