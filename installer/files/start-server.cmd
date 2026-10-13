@echo off
rem Lance le serveur Tuilerie CRM (appele par la tache planifiee "TuilerieCRM").
set "CRM_HOME=%ProgramData%\TuilerieCRM"
set "PORT=3000"
set "DB_FILE=%CRM_HOME%\data\tuilerie.db"
rem Parametres personnalises (ex. : set "PORT=8080") dans C:\ProgramData\TuilerieCRM\config.cmd
if exist "%CRM_HOME%\config.cmd" call "%CRM_HOME%\config.cmd"
if not exist "%CRM_HOME%\logs" mkdir "%CRM_HOME%\logs"
set "LOG=%CRM_HOME%\logs\serveur.log"
if exist "%LOG%" for %%F in ("%LOG%") do if %%~zF GTR 10000000 move /y "%LOG%" "%LOG%.old" >nul
"%~dp0node\node.exe" --disable-warning=ExperimentalWarning "%~dp0app\server\server.js" >> "%LOG%" 2>&1
