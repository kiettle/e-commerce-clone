#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date +%s)_$$_${RANDOM}"
CONTAINER_NAME="ecommerce-postgres-integration-${RUN_ID}"
REDPANDA_CONTAINER_NAME="ecommerce-redpanda-integration-${RUN_ID}"
POSTGRES_IMAGE="${POSTGRES_TEST_IMAGE:-postgres:17-alpine}"
REDPANDA_IMAGE="${REDPANDA_TEST_IMAGE:-redpandadata/redpanda:v24.3.6}"

AUTH_DATABASE_NAME="ecommerce_auth_${RUN_ID}_test"
PRODUCT_DATABASE_NAME="ecommerce_product_${RUN_ID}_test"
INVENTORY_DATABASE_NAME="ecommerce_inventory_${RUN_ID}_test"
CART_DATABASE_NAME="ecommerce_cart_${RUN_ID}_test"
ORDER_DATABASE_NAME="ecommerce_order_${RUN_ID}_test"

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  docker rm -f "$REDPANDA_CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  exit "$exit_code"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[integration] Required command not found: $1" >&2
    exit 1
  fi
}

wait_for_postgres() {
  for _attempt in {1..150}; do
    if docker logs "$CONTAINER_NAME" 2>&1 | grep -q 'PostgreSQL init process complete' && \
      docker exec "$CONTAINER_NAME" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
      return
    fi
    sleep 0.2
  done

  echo '[integration] Timed out waiting for disposable PostgreSQL.' >&2
  exit 1
}

wait_for_redpanda() {
  for _attempt in {1..150}; do
    if docker exec "$REDPANDA_CONTAINER_NAME" rpk cluster health >/dev/null 2>&1; then
      return
    fi
    sleep 0.2
  done

  echo '[integration] Timed out waiting for disposable Redpanda.' >&2
  exit 1
}

create_database() {
  local database="$1"
  docker exec "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "CREATE DATABASE \"${database}\";" >/dev/null
}

run_prisma_command() {
  local service="$1"
  local action="$2"
  local url_name="$3"
  local database_url="${!url_name}"
  env "$url_name=$database_url" npm run "prisma:${service}:${action}" >/dev/null
}

trap cleanup EXIT INT TERM
cd "$ROOT_DIR"

require_command docker
require_command npm
require_command node

KAFKA_PORT="$(node -e '
const net = require("node:net");
const server = net.createServer();
server.listen(0, "127.0.0.1", () => {
  process.stdout.write(String(server.address().port));
  server.close();
});
')"

echo "[integration] Starting disposable PostgreSQL container ${CONTAINER_NAME}..."
docker run --rm --detach \
  --name "$CONTAINER_NAME" \
  --env POSTGRES_USER=postgres \
  --env POSTGRES_PASSWORD=postgres \
  --env POSTGRES_DB=postgres \
  --publish 127.0.0.1::5432 \
  "$POSTGRES_IMAGE" >/dev/null

wait_for_postgres
HOST_PORT="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' "$CONTAINER_NAME")"

echo "[integration] Starting disposable Redpanda container ${REDPANDA_CONTAINER_NAME}..."
docker run --rm --detach \
  --name "$REDPANDA_CONTAINER_NAME" \
  --publish "127.0.0.1:${KAFKA_PORT}:9094" \
  "$REDPANDA_IMAGE" \
  redpanda start \
  --overprovisioned \
  --smp 1 \
  --memory 512M \
  --reserve-memory 0M \
  --node-id 0 \
  --check=false \
  --kafka-addr "INTERNAL://0.0.0.0:9092,OUTSIDE://0.0.0.0:9094" \
  --advertise-kafka-addr "INTERNAL://localhost:9092,OUTSIDE://127.0.0.1:${KAFKA_PORT}" >/dev/null
wait_for_redpanda

for database in \
  "$AUTH_DATABASE_NAME" \
  "$PRODUCT_DATABASE_NAME" \
  "$INVENTORY_DATABASE_NAME" \
  "$CART_DATABASE_NAME" \
  "$ORDER_DATABASE_NAME"; do
  create_database "$database"
done

export POSTGRES_INTEGRATION_ADMIN_URL="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/postgres"
export AUTH_INTEGRATION_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/${AUTH_DATABASE_NAME}"
export PRODUCT_INTEGRATION_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/${PRODUCT_DATABASE_NAME}"
export INVENTORY_INTEGRATION_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/${INVENTORY_DATABASE_NAME}"
export CART_INTEGRATION_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/${CART_DATABASE_NAME}"
export ORDER_INTEGRATION_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/${ORDER_DATABASE_NAME}"
export KAFKA_INTEGRATION_BROKERS="127.0.0.1:${KAFKA_PORT}"

export AUTH_DATABASE_URL="$AUTH_INTEGRATION_DATABASE_URL"
export PRODUCT_DATABASE_URL="$PRODUCT_INTEGRATION_DATABASE_URL"
export INVENTORY_DATABASE_URL="$INVENTORY_INTEGRATION_DATABASE_URL"
export CART_DATABASE_URL="$CART_INTEGRATION_DATABASE_URL"
export ORDER_DATABASE_URL="$ORDER_INTEGRATION_DATABASE_URL"

echo '[integration] Applying real migrations to five isolated test databases...'
run_prisma_command auth deploy AUTH_DATABASE_URL
run_prisma_command product deploy PRODUCT_DATABASE_URL
run_prisma_command inventory deploy INVENTORY_DATABASE_URL
run_prisma_command cart deploy CART_DATABASE_URL
run_prisma_command order deploy ORDER_DATABASE_URL

echo '[integration] Generating service-specific Prisma clients...'
run_prisma_command auth generate AUTH_DATABASE_URL
run_prisma_command product generate PRODUCT_DATABASE_URL
run_prisma_command inventory generate INVENTORY_DATABASE_URL
run_prisma_command cart generate CART_DATABASE_URL
run_prisma_command order generate ORDER_DATABASE_URL

echo '[integration] Running serial PostgreSQL integration tests...'
npx vitest run --config vitest.integration.config.mts
