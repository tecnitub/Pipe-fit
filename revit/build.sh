#!/usr/bin/env bash
# Construit le complément Revit pour chaque version et le paquet d'installation :
#   dist/PipeFit-Revit-Isometries-<version>.zip   (dossiers 2023…2027, manifeste, Installer.bat)
# Prérequis : SDK .NET 8 (Revit 2023 à 2026) et SDK .NET 10 (Revit 2027, ignoré s'il manque).
set -euo pipefail
ici="$(cd "$(dirname "$0")" && pwd)"
racine="$(cd "$ici/.." && pwd)"
version="$(sed -n 's:.*<Version>\(.*\)</Version>.*:\1:p' "$ici/src/PipeFit.Isometries.csproj")"
paquet="$racine/dist/PipeFit-Revit-Isometries-$version"
rm -rf "$paquet" "$paquet.zip"
mkdir -p "$paquet"

dotnet run --project "$ici/test" -c Release

for v in 2023 2024 2025 2026 2027; do
  if [ "$v" -ge 2027 ] && ! dotnet --list-sdks | grep -q '^1[0-9]\.'; then
    echo "Revit $v ignoré : SDK .NET 10 absent" >&2; continue
  fi
  dotnet build "$ici/src/PipeFit.Isometries.csproj" -c Release -p:RevitVersion=$v -nologo -v q
  mkdir -p "$paquet/$v"
  cp "$ici/src/bin/Release/$v/PipeFit.Isometries.dll" "$paquet/$v/"
done

cp "$ici/installer/PipeFit.Isometries.addin" "$ici/installer/Installer.ps1" "$ici/installer/Installer.bat" "$paquet/"
cp "$ici/LISEZMOI.txt" "$paquet/"
# Fins de ligne Windows pour les fichiers ouverts sur le poste
for f in Installer.bat Installer.ps1 LISEZMOI.txt PipeFit.Isometries.addin; do sed -i 's/\r\?$/\r/' "$paquet/$f"; done
(cd "$racine/dist" && zip -qr "$(basename "$paquet").zip" "$(basename "$paquet")")
echo "Paquet : dist/$(basename "$paquet").zip"
