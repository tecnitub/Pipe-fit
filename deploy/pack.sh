#!/usr/bin/env bash
# Construit dist/PipeFit-Pack-<version>.zip : tout ce qu'il faut pour installer Pipe-Fit (CRM + DOE + Études) sur un serveur
# Windows (installateur, s'il a été construit avant par installer/build.sh), Linux ou Docker, les scripts de
# configuration (serveur Windows, Microsoft 365) et le mode d'emploi pas à pas (Markdown + page HTML hors ligne).
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="$(node -p "require('./package.json').version")"
NOM="PipeFit-Pack-$VERSION"
OUT="dist/$NOM"
rm -rf "$OUT" "dist/$NOM.zip"
mkdir -p "$OUT"
npm ci --omit=dev --no-audit --no-fund >/dev/null
cp -r server public doe etudes deploy docs node_modules package.json package-lock.json Dockerfile README.md "$OUT/"
rm -rf "$OUT/doe/data" "$OUT/etudes/data" "$OUT/deploy/pack.sh"
node deploy/guide-html.js docs/INSTALLATION.md "$OUT/docs/guide-installation.html" >/dev/null
if [ -f "dist/PipeFitCRM-Setup-$VERSION.exe" ]; then cp "dist/PipeFitCRM-Setup-$VERSION.exe" "$OUT/"
else echo "Attention : installateur Windows absent (bash installer/build.sh pour l'inclure)." >&2; fi
cat > "$OUT/LISEZ-MOI.txt" <<TXT
PIPE-FIT CRM $VERSION - PACK DE DÉPLOIEMENT
==========================================

Ouvrez d'abord le mode d'emploi : docs/guide-installation.html (dans le navigateur).

Windows : PipeFitCRM-Setup-$VERSION.exe, puis deploy\\windows\\configurer-serveur.ps1
Linux   : sudo bash deploy/linux/installer.sh --domaine crm.votre-domaine.fr
Docker  : deploy/docker (cp .env.exemple .env, puis docker compose up -d --build)
Microsoft 365 : deploy\\microsoft365\\configurer-microsoft365.ps1 -Domaine votre-domaine.fr
TXT
sed -i 's/$/\r/' "$OUT/LISEZ-MOI.txt"
(cd dist && zip -qr "$NOM.zip" "$NOM")
ls -lh "dist/$NOM.zip"
