# Installation / arret / suppression du service Pipe-Fit CRM (tache planifiee au demarrage de Windows).
param(
  [Parameter(Mandatory = $true)][ValidateSet('install', 'stop', 'uninstall')][string]$Action,
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [int]$Port = 3000,
  [int]$DoePort = 3100
)
$ErrorActionPreference = 'Continue'
$TaskName = 'PipeFitCRM'
$RuleName = 'Pipe-Fit CRM'
$DoeTask = 'PipeFitDOE'
$DoeRule = 'Pipe-Fit DOE'

function Stop-Crm {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Stop-ScheduledTask -TaskName $DoeTask -ErrorAction SilentlyContinue
  Get-Process node -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($InstallDir, [StringComparison]::OrdinalIgnoreCase) } |
    Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
}

switch ($Action) {
  'stop' { Stop-Crm }
  'uninstall' {
    Stop-Crm
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $DoeTask -Confirm:$false -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName $DoeRule -ErrorAction SilentlyContinue
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
    Register-ScheduledTask -TaskName $TaskName -Description 'Serveur Pipe-Fit CRM' -Action $taskAction `
      -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

    Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Action Allow -Protocol TCP `
      -LocalPort $Port -Profile Domain, Private | Out-Null

    # Application DOE (dossiers des ouvrages exécutés), même compte et mêmes réglages
    $doeCmd = Join-Path $InstallDir 'start-doe.cmd'
    if (Test-Path $doeCmd) {
      $doeAction = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$doeCmd`"" -WorkingDirectory $InstallDir
      Register-ScheduledTask -TaskName $DoeTask -Description 'Application DOE de Pipe-Fit' -Action $doeAction `
        -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
      Remove-NetFirewallRule -DisplayName $DoeRule -ErrorAction SilentlyContinue
      New-NetFirewallRule -DisplayName $DoeRule -Direction Inbound -Action Allow -Protocol TCP `
        -LocalPort $DoePort -Profile Domain, Private | Out-Null
    }

    Start-ScheduledTask -TaskName $TaskName
    if (Test-Path $doeCmd) { Start-ScheduledTask -TaskName $DoeTask }
    # Attente du demarrage du serveur (30 s max)
    for ($i = 0; $i -lt 60; $i++) {
      try { Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/api/setup" -TimeoutSec 2 | Out-Null; break }
      catch { Start-Sleep -Milliseconds 500 }
    }
  }
}
exit 0
