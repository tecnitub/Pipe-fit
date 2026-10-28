# Pipe-Fit CRM - configuration du serveur Windows après l'installation (PipeFitCRM-Setup.exe).
# À lancer en administrateur (clic droit > Exécuter avec PowerShell, ou depuis une console PowerShell administrateur).
#
# Ce que fait ce script (chaque étape est facultative) :
#   1. dossiers des documents, des pièces jointes et des sauvegardes (local, autre disque ou NAS) ;
#   2. partage réseau du dossier des documents pour les postes du bureau (droits lecture / écriture) ;
#   3. certificat HTTPS de l'entreprise (.pfx) pour l'appli des compagnons et l'accès extérieur ;
#   4. compte de service (obligatoire si les dossiers sont sur un NAS) ;
#   5. écriture de C:\ProgramData\PipeFitCRM\config.cmd, puis redémarrage de Pipe-Fit et des applications DOE et Études.
#
# Exemples :
#   .\configurer-serveur.ps1                               (questions posées une par une)
#   .\configurer-serveur.ps1 -Documents 'D:\PipeFit\Documents' -Sauvegardes '\\NAS\PipeFit\Sauvegardes' `
#       -Partage -GroupeBureau 'TECNITUB\Bureau' -CompteService 'TECNITUB\svc-pipefit'
param(
  [string]$Documents,
  [string]$PiecesJointes,
  [string]$Sauvegardes,
  [switch]$Partage,
  [string]$NomPartage = 'PipeFit',
  [string]$GroupeBureau,
  [string]$Pfx,
  [int]$Port = 0,
  [string]$CompteService,
  [switch]$SansQuestion
)
$ErrorActionPreference = 'Stop'
$CrmHome = Join-Path $env:ProgramData 'PipeFitCRM'
$Config = Join-Path $CrmHome 'config.cmd'
$Data = Join-Path $CrmHome 'data'

function Titre($t) { Write-Host ''; Write-Host "== $t ==" -ForegroundColor Cyan }
function Demander($question, $defaut) {
  if ($SansQuestion) { return $defaut }
  $r = Read-Host "$question$(if ($defaut) { " [$defaut]" })"
  if ([string]::IsNullOrWhiteSpace($r)) { return $defaut } else { return $r.Trim() }
}
function OuiNon($question, $defaut = $true) {
  if ($SansQuestion) { return $defaut }
  $r = Read-Host "$question $(if ($defaut) { '[O/n]' } else { '[o/N]' })"
  if ([string]::IsNullOrWhiteSpace($r)) { return $defaut }
  return $r.Trim().ToLower().StartsWith('o')
}

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Write-Host 'Lancez ce script en administrateur.' -ForegroundColor Red; exit 1 }
if (-not (Test-Path $CrmHome)) { Write-Host "Pipe-Fit CRM n'est pas installé sur ce poste (dossier $CrmHome absent) : lancez d'abord PipeFitCRM-Setup.exe." -ForegroundColor Red; exit 1 }

# Réglages déjà présents dans config.cmd : conservés, remplacés seulement s'ils sont modifiés ici
$reglages = [ordered]@{}
if (Test-Path $Config) {
  foreach ($l in Get-Content $Config) { if ($l -match '^\s*set\s+"([A-Z_]+)=(.*)"\s*$') { $reglages[$Matches[1]] = $Matches[2] } }
}

Titre '1. Dossiers'
Write-Host 'Documents des chantiers (synchronisés avec l''appli dans les deux sens), pièces jointes (copie de sécurité),'
Write-Host 'sauvegardes quotidiennes de la base. Chemins locaux (D:\PipeFit\...) ou réseau (\\NAS\PipeFit\...).'
if (-not $Documents) { $Documents = Demander 'Dossier des documents' $(if ($reglages['DOCUMENTS_DIR']) { $reglages['DOCUMENTS_DIR'] } else { Join-Path $Data 'Documents' }) }
if (-not $PiecesJointes) { $PiecesJointes = Demander 'Dossier des pièces jointes' $(if ($reglages['PJ_DIR']) { $reglages['PJ_DIR'] } else { Join-Path $Documents 'Pièces jointes' }) }
if (-not $Sauvegardes) { $Sauvegardes = Demander 'Dossier des sauvegardes (de préférence un autre disque ou un NAS)' $(if ($reglages['BACKUP_DIR']) { $reglages['BACKUP_DIR'] } else { Join-Path $CrmHome 'Sauvegardes' }) }
foreach ($d in @($Documents, $PiecesJointes, $Sauvegardes)) {
  if (-not [IO.Path]::IsPathRooted($d)) { Write-Host "Chemin complet attendu : $d" -ForegroundColor Red; exit 1 }
  try { New-Item -ItemType Directory -Force -Path $d | Out-Null; Write-Host "  OK  $d" -ForegroundColor Green }
  catch { Write-Host "  Impossible de créer $d : $($_.Exception.Message)" -ForegroundColor Yellow }
}
$reglages['DOCUMENTS_DIR'] = $Documents
$reglages['PJ_DIR'] = $PiecesJointes
$reglages['BACKUP_DIR'] = $Sauvegardes
$surReseau = @($Documents, $PiecesJointes, $Sauvegardes) | Where-Object { $_.StartsWith('\\') }

Titre '2. Partage réseau du dossier des documents'
if ($Documents.StartsWith('\\')) { Write-Host 'Le dossier des documents est déjà sur le réseau : rien à partager.' }
elseif ($Partage -or (OuiNon "Partager $Documents sur le réseau sous le nom \\$env:COMPUTERNAME\$NomPartage ?")) {
  if (-not $GroupeBureau) { $GroupeBureau = Demander 'Groupe ou utilisateurs du bureau autorisés (ex. TECNITUB\Bureau)' 'Utilisateurs authentifiés' }
  $existant = Get-SmbShare -Name $NomPartage -ErrorAction SilentlyContinue
  if ($existant) { Write-Host "Le partage $NomPartage existe déjà ($($existant.Path))." }
  else {
    New-SmbShare -Name $NomPartage -Path $Documents -ChangeAccess $GroupeBureau -FolderEnumerationMode AccessBased | Out-Null
    Write-Host "  OK  \\$env:COMPUTERNAME\$NomPartage" -ForegroundColor Green
  }
  # Droits NTFS : modification pour le bureau (sous-dossiers compris)
  icacls $Documents /grant "$($GroupeBureau):(OI)(CI)M" /T /Q | Out-Null
}

Titre '3. HTTPS (certificat de l''entreprise)'
Write-Host 'Indispensable pour l''appli des compagnons et pour tout accès depuis l''extérieur. Certificat émis par une'
Write-Host 'autorité reconnue (Let''s Encrypt, autorité de l''entreprise) : un certificat auto-signé est refusé par les téléphones.'
if (-not $Pfx -and -not $SansQuestion) { $Pfx = Demander 'Fichier .pfx du certificat (vide pour passer)' '' }
if ($Pfx) {
  if (-not (Test-Path $Pfx)) { Write-Host "Fichier introuvable : $Pfx" -ForegroundColor Red; exit 1 }
  $mdp = Read-Host 'Mot de passe du .pfx' -AsSecureString
  $clair = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($mdp))
  New-Item -ItemType Directory -Force -Path (Join-Path $Data 'tls') | Out-Null
  Copy-Item $Pfx (Join-Path $Data 'tls\certificat.pfx') -Force
  $reglages['TLS_PASSPHRASE'] = $clair
  if ($Port -eq 0 -and (OuiNon 'Servir Pipe-Fit sur le port HTTPS standard 443 (adresse sans :3000) ?' $true)) { $Port = 443; $reglages['HTTP_REDIRECT_PORT'] = '80' }
  Write-Host '  OK  certificat copié dans data\tls\certificat.pfx' -ForegroundColor Green
}
if ($Port -gt 0) {
  $reglages['PORT'] = "$Port"
  Remove-NetFirewallRule -DisplayName 'Pipe-Fit CRM' -ErrorAction SilentlyContinue
  $ports = @("$Port"); if ($reglages['HTTP_REDIRECT_PORT']) { $ports += $reglages['HTTP_REDIRECT_PORT'] }
  New-NetFirewallRule -DisplayName 'Pipe-Fit CRM' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $ports -Profile Domain, Private | Out-Null
  Write-Host "  OK  pare-feu ouvert sur le(s) port(s) $($ports -join ', ')" -ForegroundColor Green
}

Titre '4. Compte de service'
Write-Host 'Par défaut Pipe-Fit tourne sous le compte SYSTEM : il ne peut pas écrire sur un NAS hors domaine.'
if ($surReseau -and -not $CompteService) { Write-Host "Dossier(s) réseau : $($surReseau -join ', ')" -ForegroundColor Yellow }
if (-not $CompteService -and ($surReseau -or -not $SansQuestion)) { $CompteService = Demander 'Compte Windows ayant les droits d''écriture sur ces dossiers (ex. TECNITUB\svc-pipefit, vide = SYSTEM)' '' }
if ($CompteService) {
  $cred = Get-Credential -UserName $CompteService -Message 'Mot de passe du compte de service Pipe-Fit'
  icacls $CrmHome /grant "$($CompteService):(OI)(CI)M" /T /Q | Out-Null
  foreach ($t in @('PipeFitCRM', 'PipeFitDOE', 'PipeFitEtudes')) {
    if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) {
      Set-ScheduledTask -TaskName $t -User $cred.UserName -Password $cred.GetNetworkCredential().Password | Out-Null
      Write-Host "  OK  tâche $t lancée sous $($cred.UserName)" -ForegroundColor Green
    }
  }
  Write-Host '  Le compte doit avoir le droit « Ouvrir une session en tant que tâche » (stratégie locale) : c''est le cas des administrateurs.'
}

Titre '5. Enregistrement et redémarrage'
$lignes = @('@echo off', 'rem Réglages de Pipe-Fit CRM (écrit par deploy\windows\configurer-serveur.ps1, modifiable à la main)')
foreach ($k in $reglages.Keys) { $lignes += "set `"$k=$($reglages[$k])`"" }
# Fichier lu par cmd.exe : encodage OEM du poste pour les accents des chemins
$oem = [Text.Encoding]::GetEncoding([Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage)
[IO.File]::WriteAllLines($Config, $lignes, $oem)
Write-Host "  OK  $Config" -ForegroundColor Green
foreach ($t in @('PipeFitCRM', 'PipeFitDOE', 'PipeFitEtudes')) {
  if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
    Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*PipeFitCRM*' } | Stop-Process -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Seconds 1
foreach ($t in @('PipeFitCRM', 'PipeFitDOE', 'PipeFitEtudes')) { if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) { Start-ScheduledTask -TaskName $t } }
$schema = if ($reglages['TLS_PASSPHRASE']) { 'https' } else { 'http' }
$p = if ($reglages['PORT']) { $reglages['PORT'] } else { '3000' }
$adresse = if (($schema -eq 'https' -and $p -eq '443') -or ($schema -eq 'http' -and $p -eq '80')) { "${schema}://$env:COMPUTERNAME" } else { "${schema}://$env:COMPUTERNAME`:$p" }
Write-Host ''
Write-Host "Pipe-Fit redémarré. Adresse pour l'équipe : $adresse" -ForegroundColor Green
Write-Host "Vérifiez dans Paramètres : Répertoire des documents, Pièces jointes et sauvegardes sur le réseau, Sécurité."
Write-Host "Journal du serveur : $CrmHome\logs\serveur.log"
