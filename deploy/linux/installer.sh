#!/usr/bin/env bash
# Pipe-Fit CRM — installation ou mise à jour sur un serveur Linux (Debian 12+, Ubuntu 22.04+, RHEL / Rocky / Alma 9+).
# À lancer depuis le pack décompressé :  sudo bash deploy/linux/installer.sh [--domaine crm.votre-domaine.fr] [--domaine-doe doe.votre-domaine.fr]
#
#   - Node.js 22 (binaire officiel vérifié) s'il manque ou s'il est trop ancien ;
#   - compte système « pipefit », application dans /opt/pipefit, données dans /var/lib/pipefit ;
#   - réglages dans /etc/pipefit/pipefit.env (créé au premier passage, jamais écrasé) ;
#   - services systemd « pipefit » et « pipefit-doe » (démarrage automatique, redémarrage en cas d'arrêt) ;
#   - avec --domaine : Caddy en reverse proxy HTTPS (certificat Let's Encrypt automatique).
# Mise à jour : relancer le script avec un pack plus récent (données et réglages conservés, sauvegarde faite avant).
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-22.22.0}"
DOMAINE="" DOMAINE_DOE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --domaine) DOMAINE="$2"; shift 2 ;;
    --domaine-doe) DOMAINE_DOE="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $1" >&2; exit 1 ;;
  esac
done
[ "$(id -u)" -eq 0 ] || { echo "Lancez ce script avec sudo." >&2; exit 1; }
PACK="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$PACK/server/server.js" ] || { echo "Application introuvable dans $PACK (lancez le script depuis le pack décompressé)." >&2; exit 1; }
etape() { printf '\n\033[36m== %s ==\033[0m\n' "$1"; }
ok() { printf '  \033[32mOK\033[0m  %s\n' "$1"; }

etape "1. Node.js"
version_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; }
if version_ok; then ok "Node.js $(node -v) déjà installé"
else
  case "$(uname -m)" in x86_64) ARCH=x64 ;; aarch64|arm64) ARCH=arm64 ;; *) echo "Architecture non prise en charge : $(uname -m)" >&2; exit 1 ;; esac
  TMP="$(mktemp -d)"; NOM="node-v$NODE_VERSION-linux-$ARCH"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$NOM.tar.xz" -o "$TMP/$NOM.tar.xz"
  ATTENDU="$(curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" | awk -v f="$NOM.tar.xz" '$2 == f { print $1 }')"
  [ -n "$ATTENDU" ] && [ "$ATTENDU" = "$(sha256sum "$TMP/$NOM.tar.xz" | cut -d' ' -f1)" ] || { echo "Somme de contrôle de Node.js invalide" >&2; exit 1; }
  tar -xJf "$TMP/$NOM.tar.xz" -C /usr/local --strip-components=1 --exclude='*/include' --exclude='*/share'
  rm -rf "$TMP"; hash -r
  ok "Node.js $(node -v) installé dans /usr/local"
fi

etape "2. Compte et dossiers"
id pipefit >/dev/null 2>&1 || useradd --system --home-dir /var/lib/pipefit --shell /usr/sbin/nologin pipefit
mkdir -p /etc/pipefit /var/lib/pipefit/doe /opt/pipefit
if [ ! -f /etc/pipefit/pipefit.env ]; then
  cp "$PACK/deploy/linux/pipefit.env.exemple" /etc/pipefit/pipefit.env
  ok "réglages créés : /etc/pipefit/pipefit.env (à relire)"
else ok "réglages conservés : /etc/pipefit/pipefit.env"; fi
chmod 640 /etc/pipefit/pipefit.env; chown root:pipefit /etc/pipefit/pipefit.env
# Dossiers indiqués dans les réglages (documents, pièces jointes, sauvegardes)
for cle in DOCUMENTS_DIR PJ_DIR BACKUP_DIR; do
  d="$(sed -n "s/^$cle=//p" /etc/pipefit/pipefit.env | tail -1)"
  [ -n "$d" ] || continue
  if mkdir -p "$d" 2>/dev/null; then chown pipefit:pipefit "$d" 2>/dev/null || true; ok "$d"
  else echo "  Attention : impossible de créer $d (NAS non monté ?)"; fi
done
chown -R pipefit:pipefit /var/lib/pipefit

etape "3. Application"
if systemctl is-active --quiet pipefit 2>/dev/null; then
  # Mise à jour : copie de la base avant de remplacer l'application
  DB="$(sed -n 's/^DB_FILE=//p' /etc/pipefit/pipefit.env | tail -1)"; DB="${DB:-/var/lib/pipefit/pipefit.db}"
  [ -f "$DB" ] && runuser -u pipefit -- node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync(process.argv[1]).exec(\"VACUUM INTO '\"+process.argv[2]+\"'\")" "$DB" "$DB.avant-mise-a-jour-$(date +%Y%m%d-%H%M).db" 2>/dev/null && ok "base copiée avant mise à jour"
  systemctl stop pipefit-doe pipefit 2>/dev/null || true
fi
rm -rf /opt/pipefit/server /opt/pipefit/public /opt/pipefit/doe /opt/pipefit/node_modules
cp -r "$PACK/server" "$PACK/public" "$PACK/doe" "$PACK/package.json" /opt/pipefit/
# Modules (assistant) : fournis par le pack, sinon installés depuis le registre npm
if [ -d "$PACK/node_modules" ]; then cp -r "$PACK/node_modules" /opt/pipefit/
else cp "$PACK/package-lock.json" /opt/pipefit/ 2>/dev/null; (cd /opt/pipefit && npm ci --omit=dev --no-audit --no-fund); fi
rm -rf /opt/pipefit/doe/data
chown -R root:root /opt/pipefit; chmod -R a+rX /opt/pipefit
ok "application copiée dans /opt/pipefit ($(node -p "require('/opt/pipefit/package.json').version"))"

etape "4. Services"
cp "$PACK/deploy/linux/pipefit.service" "$PACK/deploy/linux/pipefit-doe.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now pipefit pipefit-doe >/dev/null 2>&1
sleep 2
systemctl is-active --quiet pipefit && ok "pipefit démarré" || { echo "Le service pipefit ne démarre pas : journalctl -u pipefit -n 50" >&2; exit 1; }
systemctl is-active --quiet pipefit-doe && ok "pipefit-doe démarré" || echo "  Attention : pipefit-doe ne démarre pas (journalctl -u pipefit-doe -n 50)"

PORT="$(sed -n 's/^PORT=//p' /etc/pipefit/pipefit.env | tail -1)"; PORT="${PORT:-3000}"
if [ -n "$DOMAINE" ]; then
  etape "5. HTTPS avec Caddy ($DOMAINE)"
  if ! command -v caddy >/dev/null; then
    if command -v apt-get >/dev/null; then apt-get update -qq && apt-get install -y -qq caddy
    elif command -v dnf >/dev/null; then dnf install -y -q 'dnf-command(copr)' && dnf copr enable -y @caddy/caddy && dnf install -y -q caddy
    fi
  fi
  command -v caddy >/dev/null || { echo "Installez Caddy (https://caddyserver.com/docs/install) puis relancez avec --domaine." >&2; exit 1; }
  {
    printf '%s {\n\tencode gzip\n\treverse_proxy localhost:%s\n}\n' "$DOMAINE" "$PORT"
    [ -n "$DOMAINE_DOE" ] && printf '\n%s {\n\tencode gzip\n\treverse_proxy localhost:3100\n}\n' "$DOMAINE_DOE"
  } > /etc/caddy/Caddyfile
  grep -q '^PIPEFIT_PUBLIC_URL=' /etc/pipefit/pipefit.env || echo "PIPEFIT_PUBLIC_URL=https://$DOMAINE" >> /etc/pipefit/pipefit.env
  systemctl enable --now caddy >/dev/null 2>&1; systemctl reload caddy
  systemctl restart pipefit-doe
  ok "https://$DOMAINE (certificat obtenu automatiquement si le DNS et les ports 80/443 sont en place)"
fi
if command -v ufw >/dev/null && ufw status | grep -q active; then
  if [ -n "$DOMAINE" ]; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; else ufw allow "$PORT"/tcp >/dev/null; ufw allow 3100/tcp >/dev/null; fi
  ok "pare-feu (ufw) ouvert"
fi

printf '\n\033[32mPipe-Fit CRM est installé.\033[0m\n'
if [ -n "$DOMAINE" ]; then echo "  Adresse : https://$DOMAINE"; else echo "  Adresse : http://$(hostname -I | awk '{print $1}'):$PORT  (HTTPS : relancez avec --domaine)"; fi
echo "  Premier démarrage : créez le compte administrateur depuis le serveur lui-même (http://localhost:$PORT),"
echo "  ou définissez ADMIN_PASSWORD dans /etc/pipefit/pipefit.env puis : systemctl restart pipefit"
echo "  Journal : journalctl -u pipefit -f      Réglages : /etc/pipefit/pipefit.env"
