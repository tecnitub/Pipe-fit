#!/usr/bin/env bash
# Construit dist/AtelierPDF.html, le lanceur Windows AtelierPDF.exe, puis dist/AtelierPDF-Setup-<version>.exe.
# Prérequis : node, makensis (paquet « nsis »), compilateur Windows (paquet « gcc-mingw-w64-x86-64 »).
set -euo pipefail
cd "$(dirname "$0")"
VERSION="$(tr -d '[:space:]' < ../pdf/VERSION)"
IFS=. read -r VMAJ VMIN VPAT <<< "$VERSION"
node ../pdf/build.js

# Lanceur : ouvre l'application dans Edge et reçoit les fichiers ouverts depuis l'Explorateur
mkdir -p build-pdf
x86_64-w64-mingw32-windres -DVMAJ="$VMAJ" -DVMIN="$VMIN" -DVPAT="$VPAT" -c 65001 lanceur/lanceur.rc -O coff -o build-pdf/lanceur-res.o
x86_64-w64-mingw32-gcc -municode -mwindows -O2 -s -Wall -Wextra -Werror \
  -o build-pdf/AtelierPDF.exe lanceur/lanceur.c build-pdf/lanceur-res.o -lshell32 -ladvapi32

makensis -V2 -DVERSION="$VERSION" AtelierPDF.nsi
ls -lh "../dist/AtelierPDF-Setup-$VERSION.exe"
