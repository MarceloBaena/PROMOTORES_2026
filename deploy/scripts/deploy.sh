#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/promotorpro}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-/opt/promotorpro/backups/predeploy}"
KEEP_BACKUPS="${KEEP_BACKUPS:-5}"

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

echo "[1/8] Atualizando codigo..."
git fetch --all --prune
git pull --ff-only

echo "[2/8] Validando arquivos de ambiente..."
test -f .env.api.production || { echo ".env.api.production nao encontrado"; exit 1; }

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"

echo "[3/8] Backup preventivo do banco..."
docker compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U "${POSTGRES_USER:-promotorpro}" "${POSTGRES_DB:-promotorpro}" > "$BACKUP_DIR/promotorpro-$STAMP.sql"
ls -1t "$BACKUP_DIR"/promotorpro-*.sql 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f

echo "[4/8] Buildando imagens..."
docker compose -f "$COMPOSE_FILE" build --pull

echo "[5/8] Subindo banco..."
docker compose -f "$COMPOSE_FILE" up -d postgres

echo "[6/8] Aplicando migrations Prisma..."
docker compose -f "$COMPOSE_FILE" run --rm api npx prisma migrate deploy

echo "[7/8] Subindo aplicacao..."
docker compose -f "$COMPOSE_FILE" up -d api web

echo "[8/8] Validando health check..."
sleep 8
curl -fsS http://127.0.0.1:3000/health >/dev/null

echo "Deploy concluido com sucesso."
