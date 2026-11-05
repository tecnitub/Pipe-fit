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
x86_64-w64-mingw32-gcc -municode -mwindows -O2 -s -Wall -Wextra -Werror -DVERSION_ATELIER="\"$VERSION\"" \
  -o build-pdf/AtelierPDF.exe lanceur/lanceur.c build-pdf/lanceur-res.o -lshell32 -ladvapi32

# Signature de code, si un certificat est fourni (sinon : programmes non signés, avertissement SmartScreen)
#   ATELIERPDF_CERT_PFX : fichier .pfx (ou ATELIERPDF_CERT_PFX_BASE64 : son contenu en base64, secret GitHub)
#   ATELIERPDF_CERT_PASSWORD : mot de passe du certificat
SIGNER_ARGS=()
if [ -n "${ATELIERPDF_CERT_PFX_BASE64:-}" ] && [ -z "${ATELIERPDF_CERT_PFX:-}" ]; then
  export ATELIERPDF_CERT_PFX="$PWD/build-pdf/certificat.pfx"
  printf '%s' "$ATELIERPDF_CERT_PFX_BASE64" | base64 -d > "$ATELIERPDF_CERT_PFX"
fi
if [ -n "${ATELIERPDF_CERT_PFX:-}" ]; then
  command -v osslsigncode >/dev/null || { echo "osslsigncode requis pour signer (paquet osslsigncode)" >&2; exit 1; }
  bash ./signer.sh build-pdf/AtelierPDF.exe
  SIGNER_ARGS=(-DSIGNER="bash $PWD/signer.sh")
  echo "Signature de code : activée"
else
  echo "Signature de code : aucun certificat fourni, programmes non signés"
fi

makensis -V2 -DVERSION="$VERSION" "${SIGNER_ARGS[@]}" AtelierPDF.nsi
ls -lh "../dist/AtelierPDF-Setup-$VERSION.exe"
