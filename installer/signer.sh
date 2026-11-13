#!/usr/bin/env bash
# Signe un programme Windows (Authenticode) avec le certificat d'Atelier PDF, horodatage compris.
# Usage : signer.sh fichier.exe   (variables ATELIERPDF_CERT_PFX et ATELIERPDF_CERT_PASSWORD ;
#   ATELIERPDF_HORODATAGE : serveur d'horodatage, « aucun » pour s'en passer lors d'un essai)
set -euo pipefail
f="$1"
horodatage=(-t "${ATELIERPDF_HORODATAGE:-http://timestamp.sectigo.com}")
[ "${ATELIERPDF_HORODATAGE:-}" = "aucun" ] && horodatage=()
osslsigncode sign -pkcs12 "$ATELIERPDF_CERT_PFX" -pass "${ATELIERPDF_CERT_PASSWORD:-}" \
  -n "${SIGNATURE_NOM:-Atelier PDF}" -i "https://www.tecnitub.com" "${horodatage[@]}" -in "$f" -out "$f.signe"
mv -f "$f.signe" "$f"
