# Installation / arret / suppression du service Pipe-Fit CRM (tache planifiee au demarrage de Windows).
param(
  [Parameter(Mandatory = $true)][ValidateSet('install', 'stop', 'uninstall', 'backup')][string]$Action,
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [int]$Port = 3000,
  [int]$DoePort = 3100,
  [int]$EtudesPort = 3200,
  [string]$Label = 'version-precedente'
)
$ErrorActionPreference = 'Continue'
$TaskName = 'PipeFitCRM'
$RuleName = 'Pipe-Fit CRM'
$DoeTask = 'PipeFitDOE'
$DoeRule = 'Pipe-Fit DOE'
$EtudesTask = 'PipeFitEtudes'
$EtudesRule = 'Pipe-Fit Etudes'

function Stop-Crm {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Stop-ScheduledTask -TaskName $DoeTask -ErrorAction SilentlyContinue
  Stop-ScheduledTask -TaskName $EtudesTask -ErrorAction SilentlyContinue
  Get-Process node -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($InstallDir, [StringComparison]::OrdinalIgnoreCase) } |
    Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
}

# Copie des bases (CRM, DOE, Etudes), du certificat et des reglages avant une mise a jour (serveur arrete).
# Dossier : C:\ProgramData\PipeFitCRM\Sauvegardes-avant-mise-a-jour\<version>_<date> ; les 5 dernieres sont gardees.
function Backup-Donnees {
  $crm = Join-Path $env:ProgramData 'PipeFitCRM'
  $data = Join-Path $crm 'data'
  if (-not (Test-Path $data)) { return }
  $racine = Join-Path $crm 'Sauvegardes-avant-mise-a-jour'
  $dest = Join-Path $racine ("{0}_{1}" -f ($Label -replace '[^\w.-]', '_'), (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  foreach ($sous in @('', 'doe', 'etudes')) {
    $src = if ($sous) { Join-Path $data $sous } else { $data }
    if (-not (Test-Path $src)) { continue }
    $cible = if ($sous) { Join-Path $dest $sous } else { $dest }
    New-Item -ItemType Directory -Force -Path $cible | Out-Null
    Get-ChildItem -Path $src -File -Filter '*.db*' -ErrorAction SilentlyContinue | Copy-Item -Destination $cible -Force
  }
  $tls = Join-Path $data 'tls'
  if (Test-Path $tls) { Copy-Item -Path $tls -Destination (Join-Path $dest 'tls') -Recurse -Force }
  $cfg = Join-Path $crm 'config.cmd'
  if (Test-Path $cfg) { Copy-Item -Path $cfg -Destination $dest -Force }
  Write-Output "Sauvegarde avant mise a jour : $dest"
  Get-ChildItem -Path $racine -Directory | Sort-Object CreationTime -Descending | Select-Object -Skip 5 |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

switch ($Action) {
  'stop' { Stop-Crm }
  'backup' { Stop-Crm; Backup-Donnees }
  'uninstall' {
    Stop-Crm
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $DoeTask -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $EtudesTask -Confirm:$false -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName $DoeRule -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName $EtudesRule -ErrorAction SilentlyContinue
  }
  'install' {
    Stop-Crm
    $cmd = Join-Path $InstallDir 'start-server.cmd'
    $taskAction = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$cmd`"" -WorkingDirectory $InstallDir
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 `
      -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -StartWhenAvailable -MultipleInstances IgnoreNew
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    # Tache deja presente (mise a jour) : gardee telle quelle, avec son compte de service (configurer-serveur.ps1)
    if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
      Register-ScheduledTask -TaskName $TaskName -Description 'Serveur Pipe-Fit CRM' -Action $taskAction `
      -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
    }

    # Regle deja presente (mise a jour) : gardee (port eventuellement change par configurer-serveur.ps1)

    if (-not (Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue)) {

      New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Domain, Private | Out-Null

    }

    # Application DOE (dossiers des ouvrages exécutés), même compte et mêmes réglages
    $doeCmd = Join-Path $InstallDir 'start-doe.cmd'
    if (Test-Path $doeCmd) {
      $doeAction = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$doeCmd`"" -WorkingDirectory $InstallDir
      # Tache deja presente (mise a jour) : gardee telle quelle, avec son compte de service (configurer-serveur.ps1)
      if (-not (Get-ScheduledTask -TaskName $DoeTask -ErrorAction SilentlyContinue)) {
        Register-ScheduledTask -TaskName $DoeTask -Description 'Application DOE de Pipe-Fit' -Action $doeAction `
        -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
      }
      # Regle deja presente (mise a jour) : gardee (port eventuellement change par configurer-serveur.ps1)
      if (-not (Get-NetFirewallRule -DisplayName $DoeRule -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $DoeRule -Direction Inbound -Action Allow -Protocol TCP -LocalPort $DoePort -Profile Domain, Private | Out-Null
      }
    }
    # Application Etudes (notes de calcul du bureau d'etudes), meme compte et memes reglages
    $etudesCmd = Join-Path $InstallDir 'start-etudes.cmd'
    if (Test-Path $etudesCmd) {
      $etudesAction = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$etudesCmd`"" -WorkingDirectory $InstallDir
      # Tache deja presente (mise a jour) : gardee telle quelle, avec son compte de service (configurer-serveur.ps1)
      if (-not (Get-ScheduledTask -TaskName $EtudesTask -ErrorAction SilentlyContinue)) {
        Register-ScheduledTask -TaskName $EtudesTask -Description 'Application Etudes de Pipe-Fit' -Action $etudesAction `
        -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
      }
      # Regle deja presente (mise a jour) : gardee (port eventuellement change par configurer-serveur.ps1)
      if (-not (Get-NetFirewallRule -DisplayName $EtudesRule -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $EtudesRule -Direction Inbound -Action Allow -Protocol TCP -LocalPort $EtudesPort -Profile Domain, Private | Out-Null
      }
    }

    Start-ScheduledTask -TaskName $TaskName
    if (Test-Path $doeCmd) { Start-ScheduledTask -TaskName $DoeTask }
    if (Test-Path $etudesCmd) { Start-ScheduledTask -TaskName $EtudesTask }
    # Attente du demarrage du serveur (30 s max)
    for ($i = 0; $i -lt 60; $i++) {
      try { Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/api/setup" -TimeoutSec 2 | Out-Null; break }
      catch { Start-Sleep -Milliseconds 500 }
    }
  }
}
exit 0
