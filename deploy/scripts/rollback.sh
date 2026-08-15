#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/promotorpro}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_FILE="${1:-}"

cd "$APP_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -f .env.api.production ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.api.production
  set +a
fi

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Uso: ./deploy/scripts/rollback.sh /caminho/do/backup.sql"
  exit 1
fi

test -f "$BACKUP_FILE" || { echo "Backup nao encontrado: $BACKUP_FILE"; exit 1; }

echo "[1/4] Parando web e api..."
docker compose -f "$COMPOSE_FILE" stop web api

echo "[2/4] Restaurando banco..."
cat "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-promotorpro}" "${POSTGRES_DB:-promotorpro}"

echo "[3/4] Subindo stack..."
docker compose -f "$COMPOSE_FILE" up -d postgres api web

echo "[4/4] Validando health check..."
sleep 8
curl -fsS http://127.0.0.1:3000/health >/dev/null

echo "Rollback concluido."
