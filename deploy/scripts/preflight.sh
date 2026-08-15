#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/promotorpro}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "$APP_DIR"

echo "Validando ambiente do PromotorPro..."

command -v docker >/dev/null || { echo "docker nao instalado"; exit 1; }
docker compose version >/dev/null || { echo "docker compose nao disponivel"; exit 1; }
command -v curl >/dev/null || { echo "curl nao instalado"; exit 1; }
command -v nginx >/dev/null || { echo "nginx nao instalado"; exit 1; }

test -f .env || { echo ".env nao encontrado"; exit 1; }
test -f .env.api.production || { echo ".env.api.production nao encontrado"; exit 1; }
test -f "$COMPOSE_FILE" || { echo "$COMPOSE_FILE nao encontrado"; exit 1; }

set -a
# shellcheck disable=SC1091
source .env
# shellcheck disable=SC1091
source .env.api.production
set +a

[[ -n "${POSTGRES_PASSWORD:-}" ]] || { echo "POSTGRES_PASSWORD vazio"; exit 1; }
[[ -n "${DATABASE_URL:-}" ]] || { echo "DATABASE_URL vazia"; exit 1; }
[[ -n "${JWT_ACCESS_SECRET:-}" ]] || { echo "JWT_ACCESS_SECRET vazio"; exit 1; }
[[ -n "${JWT_REFRESH_SECRET:-}" ]] || { echo "JWT_REFRESH_SECRET vazio"; exit 1; }

docker compose -f "$COMPOSE_FILE" config >/dev/null

echo "Preflight OK."
