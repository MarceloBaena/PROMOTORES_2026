#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Execute como root: sudo bash deploy/scripts/hostinger-bootstrap.sh"
  exit 1
fi

apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx git curl unzip jq ufw fail2ban

systemctl enable docker
systemctl start docker
systemctl enable nginx
systemctl start nginx

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl enable fail2ban
systemctl start fail2ban

mkdir -p /opt/promotorpro/backups/postgres
mkdir -p /opt/promotorpro/backups/predeploy

echo "Bootstrap basico da VPS concluido."
