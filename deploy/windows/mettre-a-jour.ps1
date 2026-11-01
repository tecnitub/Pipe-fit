# Pipe-Fit - mise à jour du serveur Windows avec un pack plus récent (CRM, DOE et Études).
# À lancer en administrateur depuis le dossier du NOUVEAU pack décompressé :
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\deploy\windows\mettre-a-jour.ps1
#
# Ce que fait le script :
#   1. compare la version installée et celle du pack ;
#   2. lance l'installateur du pack sans fenêtre : il arrête Pipe-Fit, copie les bases (CRM, DOE, Études), le certificat
#      et config.cmd dans C:\ProgramData\PipeFitCRM\Sauvegardes-avant-mise-a-jour\<ancienne version>_<date>,
#      remplace l'application et redémarre (données, réglages, compte de service et pare-feu conservés) ;
#   3. vérifie que le CRM, le DOE et les Études répondent.
#
# Retour en arrière (si la nouvelle version pose problème) :
#   .\deploy\windows\mettre-a-jour.ps1 -Revenir -Setup 'C:\Installation\PipeFit-1.0.0\PipeFitCRM-Setup-1.0.0.exe'
#   réinstalle l'ancienne version puis remet les bases copiées juste avant la mise à jour
#   (ce qui a été saisi depuis la mise à jour est perdu : à faire tout de suite, pas une semaine après).
param(
  [string]$Setup,
  [switch]$Revenir,
  [switch]$SansQuestion
)
$ErrorActionPreference = 'Stop'
$CrmHome = Join-Path $env:ProgramData 'PipeFitCRM'
$Copies = Join-Path $CrmHome 'Sauvegardes-avant-mise-a-jour'
$Cle = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PipeFitCRM'

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Write-Host 'Lancez ce script dans une console PowerShell « Exécuter en tant qu''administrateur ».' -ForegroundColor Red; exit 1 }

function OuiNon($question, $defaut = $true) {
  if ($SansQuestion) { return $defaut }
  $r = Read-Host "$question [$(if ($defaut) { 'O/n' } else { 'o/N' })]"
  if (-not $r) { return $defaut }
  return $r -match '^[oOyY]'
}
function VersionInstallee { $v = Get-ItemProperty -Path $Cle -ErrorAction SilentlyContinue; if ($v) { $v.DisplayVersion } else { '' } }
function VersionDe($exe) { if ($exe -match 'Setup-([\d.]+)\.exe$') { $Matches[1] } else { '' } }
# Ports réellement utilisés (config.cmd peut les changer)
function Ports {
  $p = @{ PORT = 3000; DOE_PORT = 3100; ETUDES_PORT = 3200 }
  $cfg = Join-Path $CrmHome 'config.cmd'
  if (Test-Path $cfg) { Get-Content $cfg | ForEach-Object { if ($_ -match '^\s*set\s+"?(PORT|DOE_PORT|ETUDES_PORT)=(\d+)"?') { $p[$Matches[1]] = [int]$Matches[2] } } }
  return $p
}
function Repond($port) { try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('localhost', $port); $c.Close(); return $true } catch { return $false } }
function Verifier {
  $p = Ports
  foreach ($app in @(@('CRM', $p.PORT), @('DOE', $p.DOE_PORT), @('Études', $p.ETUDES_PORT))) {
    $ok = $false
    for ($i = 0; $i -lt 60 -and -not $ok; $i++) { $ok = Repond $app[1]; if (-not $ok) { Start-Sleep -Seconds 1 } }
    if ($ok) { Write-Host "  ✓ $($app[0]) répond (port $($app[1]))" -ForegroundColor Green }
    else { Write-Host "  ✗ $($app[0]) ne répond pas sur le port $($app[1]) : voir C:\ProgramData\PipeFitCRM\logs\" -ForegroundColor Red }
  }
}
function Installer($exe) {
  Write-Host "Installation de $(Split-Path $exe -Leaf) (quelques minutes, Pipe-Fit est arrêté pendant ce temps)..."
  $proc = Start-Process -FilePath $exe -ArgumentList '/S' -Wait -PassThru
  if ($proc.ExitCode -ne 0) { throw "L'installateur s'est terminé avec le code $($proc.ExitCode)." }
}

# Installateur : celui donné, sinon le plus récent du pack (dossier parent de deploy\)
if (-not $Setup) {
  $pack = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
  $Setup = Get-ChildItem -Path $pack, (Split-Path $PSScriptRoot -Parent) -Filter 'PipeFitCRM-Setup-*.exe' -ErrorAction SilentlyContinue |
    Sort-Object { [version](VersionDe $_.Name) } -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Setup -or -not (Test-Path $Setup)) { Write-Host 'Installateur PipeFitCRM-Setup-x.y.z.exe introuvable : indiquez-le avec -Setup <chemin>.' -ForegroundColor Red; exit 1 }
$avant = VersionInstallee
$nouvelle = VersionDe $Setup
Write-Host ''
Write-Host "Version installée : $(if ($avant) { $avant } else { 'aucune' })"
Write-Host "Version du pack   : $nouvelle"
Write-Host ''

if ($Revenir) {
  $derniere = Get-ChildItem -Path $Copies -Directory -ErrorAction SilentlyContinue | Sort-Object CreationTime -Descending | Select-Object -First 1
  if (-not $derniere) { Write-Host "Aucune copie dans $Copies : retour en arrière impossible." -ForegroundColor Red; exit 1 }
  Write-Host "Copie des données à remettre : $($derniere.FullName) ($($derniere.CreationTime))" -ForegroundColor Yellow
  Write-Host 'Tout ce qui a été saisi dans Pipe-Fit depuis cette date sera perdu.' -ForegroundColor Yellow
  if (-not (OuiNon "Réinstaller la version $nouvelle et remettre ces données ?" $false)) { exit 0 }
  Installer $Setup
  $service = Join-Path ((Get-ItemProperty -Path $Cle).InstallLocation) 'service.ps1'
  & $service -Action stop -InstallDir ((Get-ItemProperty -Path $Cle).InstallLocation)
  $data = Join-Path $CrmHome 'data'
  foreach ($sous in @('', 'doe', 'etudes')) {
    $src = if ($sous) { Join-Path $derniere.FullName $sous } else { $derniere.FullName }
    $dst = if ($sous) { Join-Path $data $sous } else { $data }
    if (-not (Test-Path $src)) { continue }
    # Fichiers -wal / -shm de la version abandonnée retirés : la base remise doit être lue telle quelle
    Get-ChildItem -Path $dst -File -Filter '*.db-*' -ErrorAction SilentlyContinue | Remove-Item -Force
    Get-ChildItem -Path $src -File -Filter '*.db*' | Copy-Item -Destination $dst -Force
  }
  foreach ($t in @('PipeFitCRM', 'PipeFitDOE', 'PipeFitEtudes')) { if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) { Start-ScheduledTask -TaskName $t } }
  Verifier
  Write-Host "Retour à la version $(VersionInstallee) terminé, données du $($derniere.CreationTime)." -ForegroundColor Green
  exit 0
}

if ($avant -and $nouvelle -and ([version]$nouvelle -lt [version]$avant)) {
  Write-Host "Le pack ($nouvelle) est plus ancien que la version installée ($avant) : utilisez -Revenir pour un retour en arrière." -ForegroundColor Red; exit 1
}
if ($avant -eq $nouvelle -and -not (OuiNon "La version $nouvelle est déjà installée. Réinstaller quand même ?" $false)) { exit 0 }
Write-Host 'Conseil : prévenez l''équipe (Pipe-Fit est indisponible quelques minutes ; les téléphones gardent leurs saisies hors ligne et les envoient au retour).'
if (-not (OuiNon "Mettre à jour Pipe-Fit vers la version $nouvelle maintenant ?" $true)) { exit 0 }

Installer $Setup
Write-Host ''
Write-Host "Version installée : $(VersionInstallee)"
$copie = Get-ChildItem -Path $Copies -Directory -ErrorAction SilentlyContinue | Sort-Object CreationTime -Descending | Select-Object -First 1
if ($copie -and $avant) { Write-Host "Données copiées avant la mise à jour : $($copie.FullName)" }
Verifier
Write-Host ''
Write-Host 'Mise à jour terminée. Sur les postes : actualiser la page (F5) ; les téléphones se mettent à jour seuls à la prochaine ouverture.' -ForegroundColor Green
