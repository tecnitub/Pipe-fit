@echo off
rem Lance l'application DOE (appele par la tache planifiee "PipeFitDOE"), a cote de Pipe-Fit CRM.
set "CRM_HOME=%ProgramData%\PipeFitCRM"
set "PORT=3000"
set "DOE_PORT=3100"
set "DOE_DB_FILE=%CRM_HOME%\data\doe\doe.db"
rem Memes parametres personnalises que le serveur (ex. : set "DOE_PORT=3101")
if exist "%CRM_HOME%\config.cmd" call "%CRM_HOME%\config.cmd"
if not defined PIPEFIT_URL set "PIPEFIT_URL=http://localhost:%PORT%"
if not exist "%CRM_HOME%\data\doe" mkdir "%CRM_HOME%\data\doe"
if not exist "%CRM_HOME%\logs" mkdir "%CRM_HOME%\logs"
set "LOG=%CRM_HOME%\logs\doe.log"
if exist "%LOG%" for %%F in ("%LOG%") do if %%~zF GTR 10000000 move /y "%LOG%" "%LOG%.old" >nul
"%~dp0node\node.exe" --disable-warning=ExperimentalWarning "%~dp0app\doe\server.js" >> "%LOG%" 2>&1
