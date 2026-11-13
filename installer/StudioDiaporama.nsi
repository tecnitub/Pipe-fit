; Installateur Windows de Studio Diaporama (NSIS 3).
; Construit par installer/build-diaporama.sh, qui produit d'abord dist/StudioDiaporama.html (application en un seul
; fichier, polices incluses) et le lanceur StudioDiaporama.exe (installer/lanceur-diaporama).
; Installation pour l'utilisateur courant : aucun droit administrateur nécessaire.
; L'application s'ouvre dans sa propre fenêtre Microsoft Edge (mode application), présent sur tout Windows 10/11.
Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define APPNAME "Studio Diaporama"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\StudioDiaporama"
!define PROGID "StudioDiaporama.Projet"

Name "${APPNAME}"
OutFile "../dist/StudioDiaporama-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\StudioDiaporama"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!ifdef SIGNER
  !finalize '${SIGNER} "%1"'
  !uninstfinalize '${SIGNER} "%1"'
!endif
BrandingText "${APPNAME} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1036 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1036 "FileDescription" "Installation de ${APPNAME}"
VIAddVersionKey /LANG=1036 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "LegalCopyright" "Tecnitub"

!define MUI_ICON "files/studio-diaporama.ico"
!define MUI_UNICON "files/studio-diaporama.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Installation de ${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "Studio Diaporama crée des diaporamas et de petits films avec vos photos et vidéos : anniversaires, mariages, voyages, fêtes…$\r$\n$\r$\nTextes animés, 23 thèmes, plusieurs bandes-son, export en vidéo MP4.$\r$\n$\r$\nTout se fait sur cet ordinateur, sans connexion : aucune photo n'est envoyée sur Internet.$\r$\n$\r$\nAucun droit administrateur n'est nécessaire."
!define MUI_FINISHPAGE_TITLE "${APPNAME} est installé"
!define MUI_FINISHPAGE_TEXT "Lancez « ${APPNAME} » depuis l'icône du bureau ou le menu Démarrer.$\r$\n$\r$\nLes projets enregistrés (fichiers .diapo) s'ouvrent par un double-clic."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Ouvrir ${APPNAME} maintenant"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenApp

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "French"

Function .onInit
  ; Mise à jour : même dossier que l'installation existante
  ReadRegStr $0 HKCU "${UNINSTKEY}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $INSTDIR $0
  ${EndIf}
FunctionEnd

Function OpenApp
  Exec '"$INSTDIR\StudioDiaporama.exe"'
FunctionEnd

Section "Installer"
  SetOutPath "$INSTDIR"
  File "../dist/StudioDiaporama.html"
  File "files/studio-diaporama.ico"
  File "/oname=LISEZMOI.txt" "files/StudioDiaporama-LISEZMOI.txt"
  File "build-diaporama/StudioDiaporama.exe"

  SetShellVarContext current
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\StudioDiaporama.exe" "" "$INSTDIR\StudioDiaporama.exe" 0 SW_SHOWNORMAL "" "Créer des diaporamas avec musique"
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\StudioDiaporama.exe" "" "$INSTDIR\StudioDiaporama.exe" 0 SW_SHOWNORMAL "" "Créer des diaporamas avec musique"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Mode d'emploi.lnk" "$INSTDIR\LISEZMOI.txt"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Désinstaller ${APPNAME}.lnk" "$INSTDIR\Desinstaller.exe"

  ; Désinstallation (Paramètres Windows > Applications)
  WriteUninstaller "$INSTDIR\Desinstaller.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Tecnitub"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\studio-diaporama.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Desinstaller.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1

  ; Projets .diapo : double-clic pour les ouvrir
  WriteRegStr HKCU "Software\Classes\.diapo" "" "${PROGID}"
  WriteRegStr HKCU "Software\Classes\${PROGID}" "" "Projet Studio Diaporama"
  WriteRegStr HKCU "Software\Classes\${PROGID}" "FriendlyTypeName" "Projet Studio Diaporama"
  WriteRegStr HKCU "Software\Classes\${PROGID}\DefaultIcon" "" '"$INSTDIR\StudioDiaporama.exe",0'
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open\command" "" '"$INSTDIR\StudioDiaporama.exe" "%1"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  Delete "$INSTDIR\StudioDiaporama.html"
  Delete "$INSTDIR\studio-diaporama.ico"
  Delete "$INSTDIR\LISEZMOI.txt"
  Delete "$INSTDIR\StudioDiaporama.exe"
  Delete "$INSTDIR\Desinstaller.exe"
  RMDir "$INSTDIR"
  ; Fenêtre et pages de démarrage (les projets et vidéos de l'utilisateur ne sont pas touchés)
  RMDir /r "$LOCALAPPDATA\StudioDiaporama"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\Classes\${PROGID}"
  ReadRegStr $0 HKCU "Software\Classes\.diapo" ""
  ${If} $0 == "${PROGID}"
    DeleteRegKey HKCU "Software\Classes\.diapo"
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd
