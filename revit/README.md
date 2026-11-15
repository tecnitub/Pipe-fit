# Pipe-Fit Isométries – complément Revit

Complément Revit (2023 à 2027) qui produit **une isométrie de fabrication par numéro de spool** depuis la maquette 3D :
onglet **Pipe-Fit → Fabrication → Isométries spools**.

Le numéro de spool doit être renseigné au préalable dans un paramètre texte des canalisations, raccords et accessoires
(paramètre partagé « Numéro de spool », « Spool »… : la fenêtre propose tous les paramètres texte trouvés et choisit
d'office celui qui est renseigné), ou dans la propriété *Spool* des pièces de fabrication MEP.

## Ce que fait la commande

Pour chaque spool coché :

| Élément | Contenu |
|---|---|
| Vue 3D `ISO <spool>` | Isométrique (sud-est, sud-ouest, nord-est ou nord-ouest), zone de coupe ajustée au spool, autres éléments masqués (isolement permanent), niveau de détail Faible (unifilaire) ou Élevé, lignes cachées, vue verrouillée |
| Repères | Écrits dans les éléments (paramètre *Marque* ou paramètre texte choisi) : `T1`, `T2`… pour les tubes dans l'ordre de la ligne, `1`, `2`… pour les raccords et accessoires (n° de nomenclature) ; étiquetés avec les familles d'étiquettes choisies |
| Soudures | `S1`, `S2`… (soudures atelier) et `R1`, `R2`… (raccordements chantier) posés sur la vue |
| Cotes | Chaîne de cotes sur chaque tronçon droit : **d'axe en axe** entre coudes, tés, croix et piquages, **d'axe à face de bride** en bout de spool, de face à face aux joints boulonnés intermédiaires (vanne entre brides), d'axe à bout de tube quand le spool se termine sans bride. Dessinées sur la feuille, exactement superposées à la vue, valeur en mm alignée sur la ligne |
| Feuille `<préfixe><spool>` | Cartouche du projet ou cadre A3 fourni ; vue à l'échelle normalisée la plus grande qui tient (1:1 … 1:250) ; flèche du nord ; tableaux **SPOOL**, **NOMENCLATURE**, **LISTE DE DÉBIT**, **ASSEMBLAGES** (soudures en pouces-diamètre, joints boulonnés, raccordements chantier, extrémités libres) |
| Exports | `ISO <spool>.pdf`, `ISO <spool>.pcf` (Piping Component File pour Isogen, Spoolgen, M4 ISO, Plant 3D…), `Nomenclature spools.csv` (importable dans Pipe-Fit : *Devis → Chiffrage depuis plan*), `Soudures spools.csv`, `Cotes spools.csv` |

La génération complète est une seule opération Revit (annulable par Ctrl+Z). Relancer avec l'option *Remplacer*
met à jour les feuilles et vues déjà générées. Les éléments de tuyauterie sans numéro de spool sont signalés et
peuvent être sélectionnés dans le modèle depuis la fenêtre.

## Règles de calcul

- **Type de composant** : type de pièce de la famille Revit (coude, té, réduction, bride, bouchon…), sinon nom de la
  famille (« coude », « elbow », « bride », « vanne »…), sinon géométrie des connecteurs (1 = bouchon, 3 = té,
  2 de DN différents = réduction, 2 non alignés = coude).
- **Assemblages** : chaque raccordement entre deux éléments du même spool est une soudure atelier, sauf entre
  deux éléments boulonnables (bride, vanne, accessoire) : joint boulonné. Un raccordement vers un élément d'un autre
  spool (ou sans spool) est un raccordement chantier ; un connecteur libre, une extrémité libre.
- **Points de cote** : le point d'axe d'un coude ou d'un té est l'intersection des axes de ses connecteurs (sommet du
  coude), indépendamment du point d'insertion de la famille ; la face de bride est le connecteur de la bride côté
  extérieur du spool. Les réductions concentriques et les manchons ne coupent pas la chaîne.
- **Pouces-diamètre** : DN50 = 2", DN65 = 2,5", DN100 = 4"… (même base que le chiffrage Pipe-Fit).
- **Ordre** : la ligne est parcourue depuis son extrémité la plus basse ; les tubes sont repérés dans cet ordre.
- Les raccords sans matériau prennent celui du tube auquel ils sont raccordés.

## Installation sur un poste

Télécharger `PipeFit-Revit-Isometries-x.y.z.zip` (onglet **Actions** du dépôt → dernière exécution →
*Artifacts*), le décompresser, fermer Revit et lancer **`Installer.bat`** : le complément est copié dans
`%AppData%\Autodesk\Revit\Addins\<version>` pour chaque version de Revit installée, sans droits administrateur.
`Installer.bat -Desinstaller` le retire.

## Développement

```
revit/
  src/Core/        calculs sans Revit : analyse du spool, nomenclature, débit, assemblages, PCF, CSV, mise en page
  src/Revit/       lecture du modèle, génération des vues et feuilles, commande, ruban
  src/UI/          fenêtre de réglages (WinForms)
  test/            tests du cœur de calcul : dotnet run --project revit/test
  demo/            démonstration web (3 spools d'exemple calculés par le cœur) : bash revit/demo/build.sh
  installer/       manifeste .addin et installeur PowerShell
  build.sh         compile pour Revit 2023 → 2027 et produit dist/PipeFit-Revit-Isometries-x.y.z.zip
```

Compilation d'une version : `dotnet build revit/src -c Release -p:RevitVersion=2025`
(Revit 2023-2024 : .NET Framework 4.8 ; 2025-2026 : .NET 8 ; 2027 : .NET 10). Les références de l'API Revit
viennent des paquets NuGet `Nice3point.Revit.Api.*` : pas besoin de Revit pour compiler, y compris sous Linux.
