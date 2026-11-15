@echo off
rem Installe le complément Revit « Pipe-Fit Isométries » (sans droits administrateur).
rem Pour le retirer : Installer.bat -Desinstaller
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Installer.ps1" %*
pause
