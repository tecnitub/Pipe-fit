#!/usr/bin/env bash
# Construit dist/PipeFitCRM-Setup-<version>.exe (installateur Windows 64 bits).
# Prérequis : makensis (paquet "nsis"), curl, sha256sum.
set -euo pipefail
cd "$(dirname "$0")"

NODE_VERSION="${NODE_VERSION:-22.22.0}"
VERSION="$(node -p "require('../package.json').version" 2>/dev/null || sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' ../package.json)"
CACHE=".cache"
NODE_EXE="$CACHE/node-v$NODE_VERSION-win-x64.exe"

mkdir -p "$CACHE" ../dist
if [ ! -f "$NODE_EXE" ]; then
  echo "Téléchargement de Node.js $NODE_VERSION pour Windows..."
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/win-x64/node.exe" -o "$NODE_EXE.part"
  expected="$(curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" | awk '$2 == "win-x64/node.exe" { print $1 }')"
  actual="$(sha256sum "$NODE_EXE.part" | cut -d' ' -f1)"
  [ -n "$expected" ] && [ "$expected" = "$actual" ] || { echo "Somme de contrôle invalide pour node.exe" >&2; rm -f "$NODE_EXE.part"; exit 1; }
  mv "$NODE_EXE.part" "$NODE_EXE"
fi

rm -rf build
mkdir -p build/node build/app
cp "$NODE_EXE" build/node/node.exe
# Modules de l'application (assistant : SDK Anthropic, JavaScript pur, identique sous Windows)
(cd .. && npm ci --omit=dev --no-audit --no-fund)
cp -r ../server ../public ../doe ../package.json ../node_modules build/app/
rm -rf build/app/doe/data

makensis -V2 -DVERSION="$VERSION" PipeFitCRM.nsi
ls -lh "../dist/PipeFitCRM-Setup-$VERSION.exe"
