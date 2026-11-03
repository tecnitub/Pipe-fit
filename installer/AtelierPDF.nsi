; Installateur Windows d'Atelier PDF (NSIS 3).
; Construit par installer/build-pdf.sh, qui produit d'abord dist/AtelierPDF.html (application en un seul fichier).
; Installation pour l'utilisateur courant : aucun droit administrateur nécessaire.
; L'application s'ouvre dans sa propre fenêtre Microsoft Edge (mode application), présent sur tout Windows 10/11.
Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WordFunc.nsh"

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define APPNAME "Atelier PDF"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\AtelierPDF"

Name "${APPNAME}"
OutFile "../dist/AtelierPDF-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\AtelierPDF"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "${APPNAME} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1036 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1036 "FileDescription" "Installation de ${APPNAME}"
VIAddVersionKey /LANG=1036 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "LegalCopyright" "Tecnitub"

Var EDGE
Var URL

!define MUI_ICON "files/atelier-pdf.ico"
!define MUI_UNICON "files/atelier-pdf.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Installation d'${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "Atelier PDF compile vos PDF, photos et scans en un seul document et permet de les modifier : réorganiser les pages, annoter (texte, bulles, traits, flèches, carrés, cercles, images), caviarder, signer, numéroter, diviser.$\r$\n$\r$\nTout se fait sur cet ordinateur : aucun fichier n'est envoyé sur Internet.$\r$\n$\r$\nAucun droit administrateur n'est nécessaire."
!define MUI_FINISHPAGE_TITLE "${APPNAME} est installé"
!define MUI_FINISHPAGE_TEXT "Lancez « ${APPNAME} » depuis l'icône du bureau ou le menu Démarrer."
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
  ; Mise à jour : même dossier que l'installation existante
  ReadRegStr $0 HKCU "${UNINSTKEY}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $INSTDIR $0
  ${EndIf}
FunctionEnd

; Chemin de Microsoft Edge (vide s'il est absent : le navigateur par défaut ouvrira l'application)
Function FindEdge
  StrCpy $EDGE ""
  SetRegView 64
  ReadRegStr $EDGE HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  ${If} $EDGE == ""
    ReadRegStr $EDGE HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  ${EndIf}
  SetRegView 32
  ${If} $EDGE == ""
    ReadRegStr $EDGE HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  ${EndIf}
  ${If} $EDGE == ""
  ${AndIf} ${FileExists} "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe"
    StrCpy $EDGE "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe"
  ${EndIf}
  ${If} $EDGE == ""
  ${AndIf} ${FileExists} "$PROGRAMFILES64\Microsoft\Edge\Application\msedge.exe"
    StrCpy $EDGE "$PROGRAMFILES64\Microsoft\Edge\Application\msedge.exe"
  ${EndIf}
  ${IfNot} ${FileExists} "$EDGE"
    StrCpy $EDGE ""
  ${EndIf}
  ; Adresse file:/// de l'application (barres obliques, espaces encodés)
  ${WordReplace} "$INSTDIR\AtelierPDF.html" "\" "/" "+" $URL
  ${WordReplace} "$URL" " " "%20" "+" $URL
  ${WordReplace} "$URL" "#" "%23" "+" $URL
  StrCpy $URL "file:///$URL"
FunctionEnd

!macro Raccourci CHEMIN
  ${If} $EDGE != ""
    CreateShortcut "${CHEMIN}" "$EDGE" '--app="$URL"' "$INSTDIR\atelier-pdf.ico" 0 SW_SHOWMAXIMIZED "" "Compiler et modifier des PDF"
  ${Else}
    CreateShortcut "${CHEMIN}" "$INSTDIR\AtelierPDF.html" "" "$INSTDIR\atelier-pdf.ico" 0 SW_SHOWNORMAL "" "Compiler et modifier des PDF"
  ${EndIf}
!macroend

Function OpenApp
  ExecShell "open" "$DESKTOP\${APPNAME}.lnk"
FunctionEnd

Section "Installer"
  SetOutPath "$INSTDIR"
  File "../dist/AtelierPDF.html"
  File "files/atelier-pdf.ico"
  File "/oname=LISEZMOI.txt" "files/AtelierPDF-LISEZMOI.txt"

  Call FindEdge
  SetShellVarContext current
  !insertmacro Raccourci "$DESKTOP\${APPNAME}.lnk"
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  !insertmacro Raccourci "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Mode d'emploi.lnk" "$INSTDIR\LISEZMOI.txt"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Désinstaller ${APPNAME}.lnk" "$INSTDIR\Desinstaller.exe"

  ; Désinstallation (Paramètres Windows > Applications)
  WriteUninstaller "$INSTDIR\Desinstaller.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Tecnitub"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\atelier-pdf.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Desinstaller.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  ${If} $EDGE == ""
    DetailPrint "Microsoft Edge introuvable : l'application s'ouvrira dans le navigateur par défaut."
  ${EndIf}
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  Delete "$INSTDIR\AtelierPDF.html"
  Delete "$INSTDIR\atelier-pdf.ico"
  Delete "$INSTDIR\LISEZMOI.txt"
  Delete "$INSTDIR\Desinstaller.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
SectionEnd
