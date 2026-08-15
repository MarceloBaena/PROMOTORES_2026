#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/promotorpro}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-/opt/promotorpro/backups/postgres}"
KEEP_DAYS="${KEEP_DAYS:-14}"

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

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/promotorpro-$STAMP.sql.gz"

docker compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U "${POSTGRES_USER:-promotorpro}" "${POSTGRES_DB:-promotorpro}" | gzip > "$FILE"

find "$BACKUP_DIR" -type f -name 'promotorpro-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

echo "Backup gerado em $FILE"
