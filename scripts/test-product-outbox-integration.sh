#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRODUCT_DATABASE_NAME="test_product_integration_$$_test"
INVENTORY_DATABASE_NAME="test_inventory_integration_$$_test"
PRODUCT_DATABASE_URL="postgresql://postgres:postgres@localhost:5001/$PRODUCT_DATABASE_NAME"
INVENTORY_DATABASE_URL="postgresql://postgres:postgres@localhost:5003/$INVENTORY_DATABASE_NAME"

cd "$ROOT_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

wait_for_database() {
  local service="$1"

  for _attempt in {1..100}; do
    if docker compose exec -T "$service" pg_isready -U postgres >/dev/null 2>&1; then
      return
    fi
    sleep 0.1
  done

  echo "Timed out waiting for $service." >&2
  exit 1
}

drop_database() {
  local service="$1"
  local database="$2"

  docker compose exec -T "$service" psql -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS $database WITH (FORCE);" >/dev/null 2>&1 || true
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  drop_database postgres-product "$PRODUCT_DATABASE_NAME"
  drop_database postgres-inventory "$INVENTORY_DATABASE_NAME"
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

require_command docker
require_command node
require_command npm

echo '[integration] Preparing disposable PostgreSQL databases...'
docker compose up -d postgres-product postgres-inventory >/dev/null
wait_for_database postgres-product
wait_for_database postgres-inventory

drop_database postgres-product "$PRODUCT_DATABASE_NAME"
drop_database postgres-inventory "$INVENTORY_DATABASE_NAME"
docker compose exec -T postgres-product psql -U postgres -d postgres \
  -c "CREATE DATABASE $PRODUCT_DATABASE_NAME;" >/dev/null
docker compose exec -T postgres-inventory psql -U postgres -d postgres \
  -c "CREATE DATABASE $INVENTORY_DATABASE_NAME;" >/dev/null

env PRODUCT_DATABASE_URL="$PRODUCT_DATABASE_URL" npm run prisma:product:deploy >/dev/null
env INVENTORY_DATABASE_URL="$INVENTORY_DATABASE_URL" npm run prisma:inventory:deploy >/dev/null
env PRODUCT_DATABASE_URL="$PRODUCT_DATABASE_URL" npm run prisma:product:generate >/dev/null
env INVENTORY_DATABASE_URL="$INVENTORY_DATABASE_URL" npm run prisma:inventory:generate >/dev/null

echo '[integration] Running serial repository tests...'
env \
  PRODUCT_INTEGRATION_DATABASE_URL="$PRODUCT_DATABASE_URL" \
  INVENTORY_INTEGRATION_DATABASE_URL="$INVENTORY_DATABASE_URL" \
  npx vitest run --config vitest.integration.config.mts
