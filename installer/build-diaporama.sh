#!/usr/bin/env bash
# Construit dist/StudioDiaporama.html (polices incluses), le lanceur StudioDiaporama.exe,
# puis dist/StudioDiaporama-Setup-<version>.exe.
# Prérequis : node (accès à fonts.googleapis.com pendant la construction), makensis (paquet « nsis »),
# compilateur Windows (paquet « gcc-mingw-w64-x86-64 »).
set -euo pipefail
cd "$(dirname "$0")"
VERSION="$(tr -d '[:space:]' < ../diaporama/VERSION)"
IFS=. read -r VMAJ VMIN VPAT <<< "$VERSION"
node ../diaporama/build.js

mkdir -p build-diaporama
x86_64-w64-mingw32-windres -DVMAJ="$VMAJ" -DVMIN="$VMIN" -DVPAT="$VPAT" -c 65001 lanceur-diaporama/lanceur.rc -O coff -o build-diaporama/lanceur-res.o
x86_64-w64-mingw32-gcc -municode -mwindows -O2 -s -Wall -Wextra -Werror \
  -o build-diaporama/StudioDiaporama.exe lanceur-diaporama/lanceur.c build-diaporama/lanceur-res.o -lshell32 -ladvapi32

# Signature de code avec le certificat d'Atelier PDF, s'il est fourni (sinon : avertissement SmartScreen)
SIGNER_ARGS=()
if [ -n "${ATELIERPDF_CERT_PFX_BASE64:-}" ] && [ -z "${ATELIERPDF_CERT_PFX:-}" ]; then
  export ATELIERPDF_CERT_PFX="$PWD/build-diaporama/certificat.pfx"
  printf '%s' "$ATELIERPDF_CERT_PFX_BASE64" | base64 -d > "$ATELIERPDF_CERT_PFX"
fi
if [ -n "${ATELIERPDF_CERT_PFX:-}" ]; then
  command -v osslsigncode >/dev/null || { echo "osslsigncode requis pour signer (paquet osslsigncode)" >&2; exit 1; }
  export SIGNATURE_NOM="Studio Diaporama"
  bash ./signer.sh build-diaporama/StudioDiaporama.exe
  SIGNER_ARGS=(-DSIGNER="bash $PWD/signer.sh")
  echo "Signature de code : activée"
else
  echo "Signature de code : aucun certificat fourni, programmes non signés"
fi

makensis -V2 -DVERSION="$VERSION" "${SIGNER_ARGS[@]}" StudioDiaporama.nsi
ls -lh "../dist/StudioDiaporama-Setup-$VERSION.exe"
