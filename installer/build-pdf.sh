#!/usr/bin/env bash
# Construit dist/AtelierPDF.html puis dist/AtelierPDF-Setup-<version>.exe (installateur Windows).
# Prérequis : node, makensis (paquet "nsis").
set -euo pipefail
cd "$(dirname "$0")"
VERSION="$(tr -d '[:space:]' < ../pdf/VERSION)"
node ../pdf/build.js
makensis -V2 -DVERSION="$VERSION" AtelierPDF.nsi
ls -lh "../dist/AtelierPDF-Setup-$VERSION.exe"
