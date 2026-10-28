# Pipe-Fit CRM - préparation de Microsoft 365 en une fois (à lancer par un administrateur global du locataire).
#
#   1. inscription d'application « Pipe-Fit CRM » dans Microsoft Entra ID, autorisations d'application Microsoft Graph :
#        Mail.Send (envoi des devis, factures, commandes, demandes de prix), Mail.ReadWrite (boîtes des factures et des
#        offres), Calendars.ReadWrite (planning dans Outlook), consentement administrateur accordé ;
#   2. secret client (valable 24 mois) ;
#   3. boîtes partagées : offres@ (offres des fournisseurs), factures@ (factures des fournisseurs) et, au choix,
#        commercial@ (devis), comptabilite@ (factures clients), achats@ (commandes et demandes de prix) ;
#   4. groupe de sécurité « Pipe-Fit CRM » (utilisateurs du CRM + boîtes partagées) et stratégie d'accès d'application :
#        l'application ne peut lire / envoyer que depuis les boîtes de ce groupe.
# À la fin, les valeurs à saisir dans Pipe-Fit (Paramètres > E-mails et Microsoft 365) sont affichées.
#
# Prérequis (une fois, PowerShell 5.1 ou 7, en administrateur) :
#   Install-Module Microsoft.Graph.Applications, Microsoft.Graph.Authentication -Scope CurrentUser
#   Install-Module ExchangeOnlineManagement -Scope CurrentUser
#
# Exemple :
#   .\configurer-microsoft365.ps1 -Domaine tecnitub.fr -Utilisateurs claire@tecnitub.fr, paul@tecnitub.fr
param(
  [Parameter(Mandatory = $true)][string]$Domaine,
  [string[]]$Utilisateurs = @(),
  [string]$NomApplication = 'Pipe-Fit CRM',
  [string[]]$BoitesPartagees = @('offres', 'factures', 'commercial', 'comptabilite', 'achats'),
  [switch]$SansStrategie
)
$ErrorActionPreference = 'Stop'
function Titre($t) { Write-Host ''; Write-Host "== $t ==" -ForegroundColor Cyan }

Titre 'Connexion à Microsoft Graph (fenêtre de connexion : compte administrateur global)'
Import-Module Microsoft.Graph.Authentication, Microsoft.Graph.Applications
Connect-MgGraph -Scopes 'Application.ReadWrite.All', 'AppRoleAssignment.ReadWrite.All' -NoWelcome
$tenantId = (Get-MgContext).TenantId

Titre "1. Application « $NomApplication »"
$graph = Get-MgServicePrincipal -Filter "appId eq '00000003-0000-0000-c000-000000000000'"
$roles = foreach ($nom in @('Mail.Send', 'Mail.ReadWrite', 'Calendars.ReadWrite')) {
  $r = $graph.AppRoles | Where-Object { $_.Value -eq $nom -and $_.AllowedMemberTypes -contains 'Application' }
  if (-not $r) { throw "Autorisation $nom introuvable dans Microsoft Graph" }
  $r
}
$app = Get-MgApplication -Filter "displayName eq '$NomApplication'" | Select-Object -First 1
$acces = @{ ResourceAppId = $graph.AppId; ResourceAccess = @($roles | ForEach-Object { @{ Id = $_.Id; Type = 'Role' } }) }
if ($app) {
  Update-MgApplication -ApplicationId $app.Id -RequiredResourceAccess @($acces)
  Write-Host "  Application existante mise à jour ($($app.AppId))"
} else {
  $app = New-MgApplication -DisplayName $NomApplication -SignInAudience 'AzureADMyOrg' -RequiredResourceAccess @($acces)
  Write-Host "  OK  application créée ($($app.AppId))" -ForegroundColor Green
}
$sp = Get-MgServicePrincipal -Filter "appId eq '$($app.AppId)'" | Select-Object -First 1
if (-not $sp) { $sp = New-MgServicePrincipal -AppId $app.AppId }
# Consentement administrateur : attribution des rôles d'application au principal de service
$deja = Get-MgServicePrincipalAppRoleAssignment -ServicePrincipalId $sp.Id -All | ForEach-Object { $_.AppRoleId }
foreach ($r in $roles) {
  if ($deja -contains $r.Id) { continue }
  New-MgServicePrincipalAppRoleAssignment -ServicePrincipalId $sp.Id -PrincipalId $sp.Id -ResourceId $graph.Id -AppRoleId $r.Id | Out-Null
  Write-Host "  OK  consentement accordé : $($r.Value)" -ForegroundColor Green
}

Titre '2. Secret client'
$secret = Add-MgApplicationPassword -ApplicationId $app.Id -PasswordCredential @{ DisplayName = 'Pipe-Fit'; EndDateTime = (Get-Date).AddMonths(24) }
Write-Host "  OK  secret valable jusqu'au $($secret.EndDateTime.ToString('dd/MM/yyyy')) (à renouveler avant : même script)" -ForegroundColor Green

Titre '3. Boîtes partagées (Exchange Online)'
Import-Module ExchangeOnlineManagement
Connect-ExchangeOnline -ShowBanner:$false
$adresses = @()
foreach ($b in $BoitesPartagees) {
  $adr = "$b@$Domaine"
  if (Get-EXOMailbox -Identity $adr -ErrorAction SilentlyContinue) { Write-Host "  Déjà présente : $adr" }
  else {
    New-Mailbox -Shared -Name "Pipe-Fit $b" -DisplayName ((Get-Culture).TextInfo.ToTitleCase($b)) -PrimarySmtpAddress $adr | Out-Null
    Write-Host "  OK  boîte partagée créée : $adr" -ForegroundColor Green
  }
  # Accès dans Outlook pour l'équipe (éléments envoyés communs)
  foreach ($u in $Utilisateurs) { Add-MailboxPermission -Identity $adr -User $u -AccessRights FullAccess -AutoMapping $true -ErrorAction SilentlyContinue | Out-Null }
  $adresses += $adr
}

if (-not $SansStrategie) {
  Titre '4. Groupe « Pipe-Fit CRM » et stratégie d''accès d''application'
  $groupe = "pipefit-crm@$Domaine"
  if (-not (Get-DistributionGroup -Identity $groupe -ErrorAction SilentlyContinue)) {
    New-DistributionGroup -Name 'Pipe-Fit CRM' -Type Security -PrimarySmtpAddress $groupe | Out-Null
    Set-DistributionGroup -Identity $groupe -HiddenFromAddressListsEnabled $true
  }
  foreach ($m in @($Utilisateurs + $adresses)) { Add-DistributionGroupMember -Identity $groupe -Member $m -ErrorAction SilentlyContinue }
  $pol = Get-ApplicationAccessPolicy | Where-Object { $_.AppId -eq $app.AppId }
  if (-not $pol) { New-ApplicationAccessPolicy -AppId $app.AppId -PolicyScopeGroupId $groupe -AccessRight RestrictAccess -Description 'Pipe-Fit CRM : boîtes du groupe Pipe-Fit CRM uniquement' | Out-Null }
  Write-Host "  OK  l'application ne peut utiliser que les boîtes du groupe $groupe (ajoutez-y chaque nouvel utilisateur du CRM)." -ForegroundColor Green
  Write-Host '  La stratégie peut mettre jusqu''à 1 heure à s''appliquer.'
}
Disconnect-ExchangeOnline -Confirm:$false

Titre 'À saisir dans Pipe-Fit'
Write-Host "Paramètres > E-mails et Microsoft 365 > Connexion Microsoft 365 :"
Write-Host "  ID de l'annuaire (locataire) : $tenantId" -ForegroundColor Yellow
Write-Host "  ID d'application (client)    : $($app.AppId)" -ForegroundColor Yellow
Write-Host "  Secret client                : $($secret.SecretText)" -ForegroundColor Yellow
Write-Host '  (le secret n''est affiché qu''une fois : copiez-le maintenant)'
Write-Host ''
Write-Host 'Paramètres > E-mails > Adresses d''envoi par type de document (suggestion) :'
if ($BoitesPartagees -contains 'commercial') { Write-Host "  Devis                       : commercial@$Domaine" }
if ($BoitesPartagees -contains 'comptabilite') { Write-Host "  Factures, situations, relances : comptabilite@$Domaine" }
if ($BoitesPartagees -contains 'achats') { Write-Host "  Commandes, demandes de prix : achats@$Domaine (répondre à : offres@$Domaine)" }
Write-Host 'Achats > Factures reçues > Configuration :'
if ($BoitesPartagees -contains 'factures') { Write-Host "  Boîte des factures          : factures@$Domaine" }
if ($BoitesPartagees -contains 'offres') { Write-Host "  Boîte des offres            : offres@$Domaine" }
Write-Host 'Paramètres > Comptes : adresse Microsoft 365 de chaque utilisateur.'
