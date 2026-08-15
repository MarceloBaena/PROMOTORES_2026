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
  echo "Uso: ./deploy/scripts/restore-postgres.sh /caminho/do/backup.sql.gz"
  exit 1
fi

test -f "$BACKUP_FILE" || { echo "Backup nao encontrado: $BACKUP_FILE"; exit 1; }

gunzip -c "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-promotorpro}" "${POSTGRES_DB:-promotorpro}"

echo "Restore concluido."
