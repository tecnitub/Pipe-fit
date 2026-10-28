﻿; Installateur Windows de Pipe-Fit CRM (NSIS 3).
; Construit par installer/build.sh, qui prépare le dossier build/ (node.exe + application).
Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
!include "LogicLib.nsh"

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define APPNAME "Pipe-Fit CRM"
!define TASKNAME "PipeFitCRM"
!define PORT "3000"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\PipeFitCRM"

Name "${APPNAME}"
OutFile "../dist/PipeFitCRM-Setup-${VERSION}.exe"
InstallDir "$PROGRAMFILES64\PipeFitCRM"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
BrandingText "${APPNAME} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1036 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1036 "FileDescription" "Installation de ${APPNAME}"
VIAddVersionKey /LANG=1036 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "LegalCopyright" "Tecnitub"

Var PCNAME
Var PS

!define MUI_ICON "files/pipefit.ico"
!define MUI_UNICON "files/pipefit.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Installation de ${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "Cet assistant installe ${APPNAME} sur ce poste, qui servira de serveur pour toute l'équipe.$\r$\n$\r$\nLe serveur démarrera automatiquement avec Windows. Les autres postes n'ont rien à installer : ils utilisent simplement leur navigateur.$\r$\n$\r$\nCliquez sur Suivant pour continuer."
!define MUI_FINISHPAGE_TITLE "${APPNAME} est installé"
!define MUI_FINISHPAGE_TEXT "Sur ce poste : icône « ${APPNAME} » du bureau.$\r$\n$\r$\nPour vos collègues, dans leur navigateur :$\r$\nhttp://$PCNAME:${PORT}$\r$\n$\r$\nÀ la première ouverture, créez le compte administrateur, puis les comptes de l'équipe dans Paramètres."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Ouvrir ${APPNAME} maintenant"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenApp
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\LISEZMOI.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Afficher le mode d'emploi"
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "French"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "${APPNAME} nécessite Windows 64 bits."
    Abort
  ${EndIf}
  SetRegView 64
  ReadEnvStr $PCNAME COMPUTERNAME
  ; Réinstallation / mise à jour : même dossier que l'installation existante
  ReadRegStr $0 HKLM "${UNINSTKEY}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $INSTDIR $0
  ${EndIf}
FunctionEnd

Function un.onInit
  SetRegView 64
FunctionEnd

!macro FindPowerShell
  ${DisableX64FSRedirection}
  StrCpy $PS "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
!macroend

Function OpenApp
  ExecShell "open" "http://localhost:${PORT}/"
FunctionEnd

Section "Installer"
  !insertmacro FindPowerShell
  ; Arrêt du serveur s'il tourne déjà (mise à jour)
  ${If} ${FileExists} "$INSTDIR\service.ps1"
    DetailPrint "Arrêt du serveur en cours d'exécution..."
    nsExec::ExecToLog '"$PS" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\service.ps1" -Action stop -InstallDir "$INSTDIR"'
    Pop $0
  ${EndIf}
  ${EnableX64FSRedirection}

  SetOutPath "$INSTDIR"
  ; Application : remplacée entièrement à chaque mise à jour (les données sont ailleurs)
  RMDir /r "$INSTDIR\app"
  File /r "build/*"
  File "files/start-server.cmd"
  File "files/start-doe.cmd"
  File "files/start-etudes.cmd"
  File "files/service.ps1"
  File "files/LISEZMOI.txt"
  File "files/pipefit.ico"

  CreateDirectory "$COMMONPROGRAMDATA\PipeFitCRM\data"
  CreateDirectory "$COMMONPROGRAMDATA\PipeFitCRM\logs"
  CreateDirectory "$COMMONPROGRAMDATA\PipeFitCRM\data\doe"
  CreateDirectory "$COMMONPROGRAMDATA\PipeFitCRM\data\etudes"

  ; Raccourcis pour tous les utilisateurs
  SetShellVarContext all
  WriteINIStr "$INSTDIR\Pipe-Fit CRM.url" "InternetShortcut" "URL" "http://localhost:${PORT}/"
  WriteINIStr "$INSTDIR\Pipe-Fit CRM.url" "InternetShortcut" "IconFile" "$INSTDIR\pipefit.ico"
  WriteINIStr "$INSTDIR\Pipe-Fit CRM.url" "InternetShortcut" "IconIndex" "0"
  CopyFiles /SILENT "$INSTDIR\Pipe-Fit CRM.url" "$DESKTOP"
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CopyFiles /SILENT "$INSTDIR\Pipe-Fit CRM.url" "$SMPROGRAMS\${APPNAME}"
  WriteINIStr "$SMPROGRAMS\${APPNAME}\Pipe-Fit DOE.url" "InternetShortcut" "URL" "http://localhost:3100/"
  WriteINIStr "$SMPROGRAMS\${APPNAME}\Pipe-Fit Études.url" "InternetShortcut" "URL" "http://localhost:3200/"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Données et sauvegarde.lnk" "$COMMONPROGRAMDATA\PipeFitCRM"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Mode d'emploi.lnk" "$INSTDIR\LISEZMOI.txt"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Désinstaller.lnk" "$INSTDIR\Desinstaller.exe"

  ; Désinstallation (Paramètres Windows > Applications)
  WriteUninstaller "$INSTDIR\Desinstaller.exe"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTKEY}" "Publisher" "Tecnitub"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\pipefit.ico"
  WriteRegStr HKLM "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Desinstaller.exe"'
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoRepair" 1

  ; Service (démarrage automatique) + pare-feu, puis démarrage
  DetailPrint "Configuration du démarrage automatique et du pare-feu..."
  !insertmacro FindPowerShell
  nsExec::ExecToLog '"$PS" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\service.ps1" -Action install -InstallDir "$INSTDIR" -Port ${PORT}'
  Pop $0
  ${EnableX64FSRedirection}
  DetailPrint "Serveur démarré : http://localhost:${PORT}"
SectionEnd

Section "Uninstall"
  !insertmacro FindPowerShell
  nsExec::ExecToLog '"$PS" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\service.ps1" -Action uninstall -InstallDir "$INSTDIR"'
  Pop $0
  ${EnableX64FSRedirection}

  SetShellVarContext all
  Delete "$DESKTOP\Pipe-Fit CRM.url"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKLM "${UNINSTKEY}"

  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Supprimer aussi toutes les données (clients, devis, factures, heures...) ?$\r$\n$\r$\nRépondez Non pour les conserver dans $COMMONPROGRAMDATA\PipeFitCRM." IDNO keep
    RMDir /r "$COMMONPROGRAMDATA\PipeFitCRM"
  keep:
SectionEnd
