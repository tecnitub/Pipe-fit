@echo off
rem Lance l'application Etudes (appele par la tache planifiee "PipeFitEtudes"), a cote de Pipe-Fit CRM.
set "CRM_HOME=%ProgramData%\PipeFitCRM"
set "PORT=3000"
set "ETUDES_PORT=3200"
set "ETUDES_DB_FILE=%CRM_HOME%\data\etudes\etudes.db"
rem Memes parametres personnalises que le serveur (ex. : set "ETUDES_PORT=3201")
if exist "%CRM_HOME%\config.cmd" call "%CRM_HOME%\config.cmd"
if not defined PIPEFIT_URL set "PIPEFIT_URL=http://localhost:%PORT%"
if not exist "%CRM_HOME%\data\etudes" mkdir "%CRM_HOME%\data\etudes"
if not exist "%CRM_HOME%\logs" mkdir "%CRM_HOME%\logs"
set "LOG=%CRM_HOME%\logs\etudes.log"
if exist "%LOG%" for %%F in ("%LOG%") do if %%~zF GTR 10000000 move /y "%LOG%" "%LOG%.old" >nul
"%~dp0node\node.exe" --disable-warning=ExperimentalWarning "%~dp0app\etudes\server.js" >> "%LOG%" 2>&1
