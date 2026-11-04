; Installateur Windows d'Atelier PDF (NSIS 3).
; Construit par installer/build-pdf.sh, qui produit d'abord dist/AtelierPDF.html (application en un seul fichier).
; Installation pour l'utilisateur courant : aucun droit administrateur nécessaire.
; L'application s'ouvre dans sa propre fenêtre Microsoft Edge (mode application), présent sur tout Windows 10/11,
; par le lanceur AtelierPDF.exe (installer/lanceur), qui reçoit aussi les fichiers ouverts depuis l'Explorateur.
Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define APPNAME "Atelier PDF"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\AtelierPDF"
!define PROGID "AtelierPDF.Document"
!define CAPAS "Software\AtelierPDF\Capabilities"

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

!define MUI_ICON "files/atelier-pdf.ico"
!define MUI_UNICON "files/atelier-pdf.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Installation d'${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "Atelier PDF compile vos PDF, photos et scans en un seul document et permet de les modifier : réorganiser les pages, annoter, tamponner, signer, mesurer sur plan, reconnaître le texte des scans (OCR), caviarder, numéroter, diviser.$\r$\n$\r$\nTout se fait sur cet ordinateur : aucun fichier n'est envoyé sur Internet.$\r$\n$\r$\nAucun droit administrateur n'est nécessaire."
!define MUI_FINISHPAGE_TITLE "${APPNAME} est installé"
!define MUI_FINISHPAGE_TEXT "Lancez « ${APPNAME} » depuis l'icône du bureau ou le menu Démarrer.$\r$\n$\r$\nLes PDF de l'ordinateur peuvent s'ouvrir avec ${APPNAME} : clic droit sur un PDF › Ouvrir avec › ${APPNAME}.$\r$\n$\r$\nPour que tous les PDF s'ouvrent avec ${APPNAME} par un double-clic, cochez la case ci-dessous : Windows vous demandera de confirmer ce choix."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Ouvrir ${APPNAME} maintenant"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenApp
!define MUI_FINISHPAGE_SHOWREADME ""
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Ouvrir les PDF avec ${APPNAME} par défaut (choix dans Windows)"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION ChoisirParDefaut

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

; Windows ne laisse pas un programme se déclarer lecteur par défaut : on ouvre le réglage, l'utilisateur confirme
Function ChoisirParDefaut
  ExecShell "open" "ms-settings:defaultapps?registeredAppUser=AtelierPDF"
FunctionEnd

Function OpenApp
  ExecShell "open" "$DESKTOP\${APPNAME}.lnk"
FunctionEnd

Section "Installer"
  SetOutPath "$INSTDIR"
  File "../dist/AtelierPDF.html"
  File "files/atelier-pdf.ico"
  File "/oname=LISEZMOI.txt" "files/AtelierPDF-LISEZMOI.txt"
  File "build-pdf/AtelierPDF.exe"

  ; Raccourcis : le lanceur ouvre l'application dans Edge (ou le navigateur par défaut)
  SetShellVarContext current
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\AtelierPDF.exe" "" "$INSTDIR\AtelierPDF.exe" 0 SW_SHOWNORMAL "" "Compiler et modifier des PDF"
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\AtelierPDF.exe" "" "$INSTDIR\AtelierPDF.exe" 0 SW_SHOWNORMAL "" "Compiler et modifier des PDF"
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

  ; Ouverture des PDF de l'ordinateur (pour cet utilisateur) : « Ouvrir avec », menu du clic droit, applications par défaut
  DetailPrint "Inscription d'${APPNAME} pour l'ouverture des PDF..."
  WriteRegStr HKCU "Software\Classes\${PROGID}" "" "Document PDF"
  WriteRegStr HKCU "Software\Classes\${PROGID}" "FriendlyTypeName" "Document PDF"
  WriteRegStr HKCU "Software\Classes\${PROGID}\DefaultIcon" "" '"$INSTDIR\AtelierPDF.exe",0'
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell" "" "open"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open" "MultiSelectModel" "Player"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open\command" "" '"$INSTDIR\AtelierPDF.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\.pdf\OpenWithProgids" "${PROGID}" ""
  WriteRegStr HKCU "Software\Classes\Applications\AtelierPDF.exe" "FriendlyAppName" "${APPNAME}"
  WriteRegStr HKCU "Software\Classes\Applications\AtelierPDF.exe\SupportedTypes" ".pdf" ""
  WriteRegStr HKCU "Software\Classes\Applications\AtelierPDF.exe\DefaultIcon" "" '"$INSTDIR\AtelierPDF.exe",0'
  WriteRegStr HKCU "Software\Classes\Applications\AtelierPDF.exe\shell\open" "MultiSelectModel" "Player"
  WriteRegStr HKCU "Software\Classes\Applications\AtelierPDF.exe\shell\open\command" "" '"$INSTDIR\AtelierPDF.exe" "%1"'
  ; Clic droit sur un PDF (Windows 11 : « Afficher plus d'options ») : « Ouvrir avec Atelier PDF », aussi pour plusieurs fichiers
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\AtelierPDF" "" "Ouvrir avec ${APPNAME}"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\AtelierPDF" "Icon" '"$INSTDIR\AtelierPDF.exe",0'
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\AtelierPDF" "MultiSelectModel" "Player"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\AtelierPDF\command" "" '"$INSTDIR\AtelierPDF.exe" "%1"'
  ; Applications par défaut (Paramètres Windows)
  WriteRegStr HKCU "${CAPAS}" "ApplicationName" "${APPNAME}"
  WriteRegStr HKCU "${CAPAS}" "ApplicationDescription" "Compiler et modifier des PDF"
  WriteRegStr HKCU "${CAPAS}" "ApplicationIcon" '"$INSTDIR\AtelierPDF.exe",0'
  WriteRegStr HKCU "${CAPAS}\FileAssociations" ".pdf" "${PROGID}"
  WriteRegStr HKCU "Software\RegisteredApplications" "AtelierPDF" "${CAPAS}"
  ; Prévenir l'Explorateur que les associations ont changé
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  Delete "$INSTDIR\AtelierPDF.html"
  Delete "$INSTDIR\atelier-pdf.ico"
  Delete "$INSTDIR\LISEZMOI.txt"
  Delete "$INSTDIR\AtelierPDF.exe"
  Delete "$INSTDIR\Desinstaller.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\Classes\${PROGID}"
  DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "${PROGID}"
  DeleteRegKey HKCU "Software\Classes\Applications\AtelierPDF.exe"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\AtelierPDF"
  DeleteRegKey HKCU "Software\AtelierPDF"
  DeleteRegValue HKCU "Software\RegisteredApplications" "AtelierPDF"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd
