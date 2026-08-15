#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Execute como root: sudo bash deploy/scripts/install-nginx-site.sh app.seudominio.com api.seudominio.com"
  exit 1
fi

APP_DOMAIN="${1:-}"
API_DOMAIN="${2:-}"
SOURCE_FILE="${SOURCE_FILE:-/opt/promotorpro/deploy/nginx/promotorpro.vps.conf}"
TARGET_FILE="/etc/nginx/sites-available/promotorpro.conf"

if [[ -z "$APP_DOMAIN" || -z "$API_DOMAIN" ]]; then
  echo "Uso: sudo bash deploy/scripts/install-nginx-site.sh app.seudominio.com api.seudominio.com"
  exit 1
fi

test -f "$SOURCE_FILE" || { echo "Arquivo base nao encontrado: $SOURCE_FILE"; exit 1; }

cp "$SOURCE_FILE" "$TARGET_FILE"
sed -i "s/app\.seudominio\.com/${APP_DOMAIN}/g" "$TARGET_FILE"
sed -i "s/api\.seudominio\.com/${API_DOMAIN}/g" "$TARGET_FILE"

ln -sf "$TARGET_FILE" /etc/nginx/sites-enabled/promotorpro.conf
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

echo "Site Nginx instalado para:"
echo "  painel: https://${APP_DOMAIN}"
echo "  api:    https://${API_DOMAIN}"
