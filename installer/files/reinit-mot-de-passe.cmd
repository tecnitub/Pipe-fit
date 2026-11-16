@echo off
rem Reinitialise le mot de passe d'un compte Pipe-Fit (CRM, Etudes, DOE) : a lancer sur le serveur, en administrateur.
rem Sans argument : liste des comptes, puis demande l'identifiant.
setlocal
set "CRM_HOME=%ProgramData%\PipeFitCRM"
set "DB_FILE=%CRM_HOME%\data\pipefit.db"
if exist "%CRM_HOME%\config.cmd" call "%CRM_HOME%\config.cmd"
chcp 65001 >nul
"%~dp0node\node.exe" --disable-warning=ExperimentalWarning "%~dp0app\server\reinit-mot-de-passe.js"
if "%~1"=="" (
  echo.
  set /p "CIBLE=Identifiant du compte a reinitialiser (ou --creer-admin) : "
) else (
  set "CIBLE=%~1"
)
if "%CIBLE%"=="" goto fin
"%~dp0node\node.exe" --disable-warning=ExperimentalWarning "%~dp0app\server\reinit-mot-de-passe.js" "%CIBLE%"
:fin
echo.
pause
