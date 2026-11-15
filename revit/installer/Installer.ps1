# Installe le complément « Pipe-Fit Isométries » pour toutes les versions de Revit présentes sur le poste
# (2023 à 2027), dans le profil de l'utilisateur : aucun droit administrateur nécessaire.
#   Installer.ps1              installe ou met à jour
#   Installer.ps1 -Desinstaller   retire le complément
param([switch]$Desinstaller)
$ErrorActionPreference = 'Stop'
$ici = Split-Path -Parent $MyInvocation.MyCommand.Path
$racine = Join-Path $env:APPDATA 'Autodesk\Revit\Addins'
$fait = @()

foreach ($dossier in Get-ChildItem -Path $ici -Directory | Where-Object { $_.Name -match '^20\d\d$' } | Sort-Object Name) {
    $v = $dossier.Name
    $cible = Join-Path $racine $v
    $revitPresent = (Test-Path "$env:ProgramFiles\Autodesk\Revit $v") -or (Test-Path $cible)
    if ($Desinstaller) {
        Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $cible 'PipeFit.Isometries.addin')
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $cible 'PipeFit.Isometries')
        $fait += "Revit $v : retiré"
        continue
    }
    if (-not $revitPresent) { continue }
    $dll = Join-Path $cible 'PipeFit.Isometries'
    New-Item -ItemType Directory -Force -Path $dll | Out-Null
    Copy-Item -Force (Join-Path $dossier.FullName '*') $dll
    Copy-Item -Force (Join-Path $ici 'PipeFit.Isometries.addin') $cible
    # Fichiers téléchargés : levée du blocage Windows, sans quoi Revit refuse de charger la DLL
    Get-ChildItem -Recurse $dll | Unblock-File
    Unblock-File (Join-Path $cible 'PipeFit.Isometries.addin')
    $fait += "Revit $v : installé"
}

if ($fait.Count -eq 0) {
    Write-Host 'Aucune version de Revit (2023 à 2027) trouvée sur ce poste.' -ForegroundColor Yellow
} else {
    $fait | ForEach-Object { Write-Host $_ -ForegroundColor Green }
    if (-not $Desinstaller) { Write-Host "Redémarrez Revit : onglet « Pipe-Fit » > Fabrication > Isométries spools." }
}
