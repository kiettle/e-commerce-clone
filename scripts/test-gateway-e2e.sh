#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date +%s)_$$_${RANDOM}"
POSTGRES_CONTAINER="ecommerce-gateway-e2e-postgres-${RUN_ID}"
REDPANDA_CONTAINER="ecommerce-gateway-e2e-redpanda-${RUN_ID}"
export REDIS_TEST_CONTAINER="ecommerce-gateway-e2e-redis-${RUN_ID}"
source "$ROOT_DIR/scripts/test-redis-support.sh"
POSTGRES_IMAGE="${POSTGRES_TEST_IMAGE:-postgres:17-alpine}"
REDPANDA_IMAGE="${REDPANDA_TEST_IMAGE:-redpandadata/redpanda:v24.3.6}"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ecommerce-gateway-e2e.XXXXXX")"
ARTIFACT_DIR="${E2E_ARTIFACT_DIR:-}"

AUTH_DATABASE_NAME="ecommerce_auth_${RUN_ID}_test"
PRODUCT_DATABASE_NAME="ecommerce_product_${RUN_ID}_test"
INVENTORY_DATABASE_NAME="ecommerce_inventory_${RUN_ID}_test"
CART_DATABASE_NAME="ecommerce_cart_${RUN_ID}_test"
ORDER_DATABASE_NAME="ecommerce_order_${RUN_ID}_test"
PRODUCT_TOPIC="product-events-${RUN_ID}"
FLASH_SALE_TOPIC="flash-sale-events-${RUN_ID}"

SERVICE_NAMES=(auth product inventory cart order gateway)
SERVICE_PIDS=()

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[gateway-e2e] Required command not found: $1" >&2
    exit 1
  fi
}

stop_process() {
  local pid="$1"
  if [[ -z "$pid" ]] || ! kill -0 "$pid" >/dev/null 2>&1; then
    return
  fi

  kill "$pid" >/dev/null 2>&1 || true
  for _attempt in {1..40}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      wait "$pid" 2>/dev/null || true
      return
    fi
    sleep 0.1
  done

  kill -9 "$pid" >/dev/null 2>&1 || true
  wait "$pid" 2>/dev/null || true
}

print_failure_logs() {
  echo >&2
  echo '[gateway-e2e] Test failed. Recent service logs:' >&2
  for service in "${SERVICE_NAMES[@]}"; do
    local log_file="$LOG_DIR/${service}.log"
    if [[ -f "$log_file" ]]; then
      echo "----- ${service} -----" >&2
      tail -n 120 "$log_file" >&2 || true
    fi
  done
  echo '----- postgres -----' >&2
  docker logs --tail 80 "$POSTGRES_CONTAINER" >&2 2>/dev/null || true
  echo '----- redpanda -----' >&2
  docker logs --tail 80 "$REDPANDA_CONTAINER" >&2 2>/dev/null || true
  docker logs --tail 80 "$REDIS_TEST_CONTAINER" >&2 2>/dev/null || true
}

capture_logs() {
  if [[ -z "$ARTIFACT_DIR" ]]; then
    return
  fi

  mkdir -p "$ARTIFACT_DIR"
  for service in "${SERVICE_NAMES[@]}"; do
    local log_file="$LOG_DIR/${service}.log"
    if [[ -f "$log_file" ]]; then
      cp "$log_file" "$ARTIFACT_DIR/${service}.log"
    fi
  done
  docker logs "$POSTGRES_CONTAINER" >"$ARTIFACT_DIR/postgres.log" 2>&1 || true
  docker logs "$REDPANDA_CONTAINER" >"$ARTIFACT_DIR/redpanda.log" 2>&1 || true
  docker logs "$REDIS_TEST_CONTAINER" >"$ARTIFACT_DIR/redis.log" 2>&1 || true
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  if [[ "$exit_code" -ne 0 ]]; then
    print_failure_logs
  fi

  for ((index=${#SERVICE_PIDS[@]}-1; index>=0; index-=1)); do
    stop_process "${SERVICE_PIDS[$index]}"
  done

  capture_logs
  docker rm -f "$REDIS_TEST_CONTAINER" >/dev/null 2>&1 || true
  docker rm -f "$REDPANDA_CONTAINER" >/dev/null 2>&1 || true
  docker rm -f "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$LOG_DIR"
  exit "$exit_code"
}

wait_for_postgres() {
  for _attempt in {1..150}; do
    if docker exec "$POSTGRES_CONTAINER" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
      return
    fi
    sleep 0.2
  done
  echo '[gateway-e2e] Timed out waiting for PostgreSQL.' >&2
  exit 1
}

wait_for_redpanda() {
  for _attempt in {1..200}; do
    if docker exec "$REDPANDA_CONTAINER" rpk cluster health >/dev/null 2>&1; then
      return
    fi
    sleep 0.2
  done
  echo '[gateway-e2e] Timed out waiting for Redpanda.' >&2
  exit 1
}

wait_for_http() {
  local service="$1"
  local url="$2"
  local pid="$3"
  local log_file="$LOG_DIR/${service}.log"

  for _attempt in {1..250}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[gateway-e2e] ${service} is healthy."
      return
    fi
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      echo "[gateway-e2e] ${service} stopped before becoming healthy." >&2
      tail -n 120 "$log_file" >&2 || true
      exit 1
    fi
    sleep 0.2
  done

  echo "[gateway-e2e] Timed out waiting for ${service}." >&2
  tail -n 120 "$log_file" >&2 || true
  exit 1
}

create_database() {
  docker exec "$POSTGRES_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "CREATE DATABASE \"$1\";" >/dev/null
}

run_prisma_command() {
  local service="$1"
  local action="$2"
  local variable_name="$3"
  local database_url="${!variable_name}"
  env "$variable_name=$database_url" npm run "prisma:${service}:${action}" >/dev/null
}

start_service() {
  local name="$1"
  shift
  env "$@" node "dist/apps/${name}/main.js" >"$LOG_DIR/${name%%-service}.log" 2>&1 &
  SERVICE_PIDS+=("$!")
  LAST_PID="$!"
}

trap cleanup EXIT INT TERM
cd "$ROOT_DIR"

require_command curl
require_command docker
require_command node
require_command npm
start_test_redis

read -r GATEWAY_PORT AUTH_HTTP_PORT AUTH_GRPC_PORT PRODUCT_PORT PRODUCT_GRPC_PORT INVENTORY_HTTP_PORT \
  INVENTORY_GRPC_PORT CART_PORT ORDER_HTTP_PORT ORDER_GRPC_PORT KAFKA_PORT < <(
  node -e '
const net = require("node:net");
const servers = Array.from({ length: 11 }, () => net.createServer());
Promise.all(servers.map((server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
}))).then(() => {
  process.stdout.write(`${servers.map((server) => server.address().port).join(" ")}\n`);
  return Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
'
)

echo "[gateway-e2e] Starting disposable PostgreSQL ${POSTGRES_CONTAINER}..."
docker run --detach \
  --name "$POSTGRES_CONTAINER" \
  --env POSTGRES_USER=postgres \
  --env POSTGRES_PASSWORD=postgres \
  --env POSTGRES_DB=postgres \
  --publish 127.0.0.1::5432 \
  "$POSTGRES_IMAGE" >/dev/null
wait_for_postgres
POSTGRES_PORT="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' "$POSTGRES_CONTAINER")"

echo "[gateway-e2e] Starting disposable Redpanda ${REDPANDA_CONTAINER}..."
docker run --detach \
  --name "$REDPANDA_CONTAINER" \
  --publish "127.0.0.1:${KAFKA_PORT}:9094" \
  "$REDPANDA_IMAGE" \
  redpanda start \
  --overprovisioned \
  --smp 1 \
  --memory 512M \
  --reserve-memory 0M \
  --node-id 0 \
  --check=false \
  --kafka-addr 'INTERNAL://0.0.0.0:9092,OUTSIDE://0.0.0.0:9094' \
  --advertise-kafka-addr "INTERNAL://localhost:9092,OUTSIDE://127.0.0.1:${KAFKA_PORT}" >/dev/null
wait_for_redpanda
docker exec "$REDPANDA_CONTAINER" rpk topic create "$PRODUCT_TOPIC" "$FLASH_SALE_TOPIC" >/dev/null

for database in \
  "$AUTH_DATABASE_NAME" \
  "$PRODUCT_DATABASE_NAME" \
  "$INVENTORY_DATABASE_NAME" \
  "$CART_DATABASE_NAME" \
  "$ORDER_DATABASE_NAME"; do
  create_database "$database"
done

export AUTH_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${POSTGRES_PORT}/${AUTH_DATABASE_NAME}"
export PRODUCT_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${POSTGRES_PORT}/${PRODUCT_DATABASE_NAME}"
export INVENTORY_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${POSTGRES_PORT}/${INVENTORY_DATABASE_NAME}"
export CART_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${POSTGRES_PORT}/${CART_DATABASE_NAME}"
export ORDER_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${POSTGRES_PORT}/${ORDER_DATABASE_NAME}"

export AUTH_INTEGRATION_DATABASE_URL="$AUTH_DATABASE_URL"
export PRODUCT_INTEGRATION_DATABASE_URL="$PRODUCT_DATABASE_URL"
export INVENTORY_INTEGRATION_DATABASE_URL="$INVENTORY_DATABASE_URL"
export CART_INTEGRATION_DATABASE_URL="$CART_DATABASE_URL"
export ORDER_INTEGRATION_DATABASE_URL="$ORDER_DATABASE_URL"

echo '[gateway-e2e] Applying migrations and generating Prisma clients...'
run_prisma_command auth deploy AUTH_DATABASE_URL
run_prisma_command product deploy PRODUCT_DATABASE_URL
run_prisma_command inventory deploy INVENTORY_DATABASE_URL
run_prisma_command cart deploy CART_DATABASE_URL
run_prisma_command order deploy ORDER_DATABASE_URL
run_prisma_command auth generate AUTH_DATABASE_URL
run_prisma_command product generate PRODUCT_DATABASE_URL
run_prisma_command inventory generate INVENTORY_DATABASE_URL
run_prisma_command cart generate CART_DATABASE_URL
run_prisma_command order generate ORDER_DATABASE_URL

docker exec -i "$POSTGRES_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$AUTH_DATABASE_NAME" >/dev/null <<'SQL'
INSERT INTO "users" (id, email, password, role) VALUES
  (1, 'admin.e2e@example.test', '$2b$12$7hoRZfJrRKD2nIm2vHLs7OBETy.LWenXXMLKf99W8M4PUwO6KB7fu', 'ADMIN'),
  (2, 'customer-one.e2e@example.test', '$2b$12$7hoRZfJrRKD2nIm2vHLs7OBETy.LWenXXMLKf99W8M4PUwO6KB7fu', 'USER'),
  (3, 'customer-two.e2e@example.test', '$2b$12$7hoRZfJrRKD2nIm2vHLs7OBETy.LWenXXMLKf99W8M4PUwO6KB7fu', 'USER'),
  (4, 'customer-three.e2e@example.test', '$2b$12$7hoRZfJrRKD2nIm2vHLs7OBETy.LWenXXMLKf99W8M4PUwO6KB7fu', 'USER');
SQL

echo '[gateway-e2e] Building all six services...'
npm run build:all >/dev/null

COMMON_KAFKA_ENV=(
  "KAFKA_BROKERS=127.0.0.1:${KAFKA_PORT}"
  "PRODUCT_EVENTS_TOPIC=${PRODUCT_TOPIC}"
  "FLASH_SALE_EVENTS_TOPIC=${FLASH_SALE_TOPIC}"
)

export GATEWAY_HTTP_MAX_CONNECTIONS="${GATEWAY_HTTP_MAX_CONNECTIONS:-64}"
export LOAD_STACK_DESCRIPTION="One process per service; ${POSTGRES_IMAGE} with five databases; ${REDPANDA_IMAGE} single broker, one CPU, 512 MiB; checkout recovery poll 60000 ms"
echo '[gateway-e2e] Starting all six built services...'
# Prove product-service can start and pass its health check without Redis.
docker stop "$REDIS_TEST_CONTAINER" >/dev/null
start_service auth-service \
  NODE_ENV=test PORT="$AUTH_HTTP_PORT" AUTH_GRPC_URL="0.0.0.0:${AUTH_GRPC_PORT}" \
  AUTH_DATABASE_URL="$AUTH_DATABASE_URL" JWT_SECRET="${JWT_SECRET:-gateway-e2e-secret}"
AUTH_PID="$LAST_PID"

start_service product-service \
  NODE_ENV=test PORT="$PRODUCT_PORT" PRODUCT_GRPC_URL="0.0.0.0:${PRODUCT_GRPC_PORT}" \
  PRODUCT_DATABASE_URL="$PRODUCT_DATABASE_URL" \
  "${COMMON_KAFKA_ENV[@]}" PRODUCT_OUTBOX_POLL_INTERVAL_MS=250 \
  PRODUCT_OUTBOX_BATCH_SIZE=20 PRODUCT_OUTBOX_LEASE_MS=5000 \
  PRODUCT_OUTBOX_SHUTDOWN_TIMEOUT_MS=2000 PRODUCT_OUTBOX_MAX_ATTEMPTS=5
PRODUCT_PID="$LAST_PID"

start_service inventory-service \
  NODE_ENV=test PORT="$INVENTORY_HTTP_PORT" INVENTORY_GRPC_URL="0.0.0.0:${INVENTORY_GRPC_PORT}" \
  INVENTORY_DATABASE_URL="$INVENTORY_DATABASE_URL" "${COMMON_KAFKA_ENV[@]}" \
  INVENTORY_KAFKA_GROUP_ID="inventory-products-${RUN_ID}" \
  INVENTORY_FLASH_SALE_KAFKA_GROUP_ID="inventory-sales-${RUN_ID}"
INVENTORY_PID="$LAST_PID"

start_service order-service \
  NODE_ENV=test PORT="$ORDER_HTTP_PORT" ORDER_GRPC_URL="0.0.0.0:${ORDER_GRPC_PORT}" \
  ORDER_DATABASE_URL="$ORDER_DATABASE_URL" ORDER_DEMO_LOST_RESPONSE_AFTER=0
ORDER_PID="$LAST_PID"

start_service cart-service \
  NODE_ENV=test PORT="$CART_PORT" CART_DATABASE_URL="$CART_DATABASE_URL" \
  PRODUCT_GRPC_URL="127.0.0.1:${PRODUCT_GRPC_PORT}" \
  INVENTORY_GRPC_URL="127.0.0.1:${INVENTORY_GRPC_PORT}" \
  ORDER_GRPC_URL="127.0.0.1:${ORDER_GRPC_PORT}" \
  CHECKOUT_RECONCILIATION_POLL_INTERVAL_MS=60000 \
  CHECKOUT_RECONCILIATION_BATCH_SIZE=20 CHECKOUT_RECONCILIATION_LEASE_MS=5000 \
  CHECKOUT_RECONCILIATION_SHUTDOWN_TIMEOUT_MS=2000 CHECKOUT_RECONCILIATION_MAX_ATTEMPTS=5
CART_PID="$LAST_PID"

start_service gateway \
  NODE_ENV=test PORT="$GATEWAY_PORT" AUTH_GRPC_URL="127.0.0.1:${AUTH_GRPC_PORT}" \
  PRODUCT_GRPC_URL="127.0.0.1:${PRODUCT_GRPC_PORT}" \
  CART_SERVICE_URL="http://127.0.0.1:${CART_PORT}"
GATEWAY_PID="$LAST_PID"

wait_for_http auth "http://127.0.0.1:${AUTH_HTTP_PORT}/health" "$AUTH_PID"
wait_for_http product "http://127.0.0.1:${PRODUCT_PORT}/health" "$PRODUCT_PID"
wait_for_http inventory "http://127.0.0.1:${INVENTORY_HTTP_PORT}/health" "$INVENTORY_PID"
wait_for_http order "http://127.0.0.1:${ORDER_HTTP_PORT}/health" "$ORDER_PID"
wait_for_http cart "http://127.0.0.1:${CART_PORT}/health" "$CART_PID"
wait_for_http gateway "http://127.0.0.1:${GATEWAY_PORT}/health" "$GATEWAY_PID"
docker start "$REDIS_TEST_CONTAINER" >/dev/null
wait_for_test_redis

export GATEWAY_E2E_ACTIVE=1
export E2E_GATEWAY_URL="http://127.0.0.1:${GATEWAY_PORT}"
export E2E_PRODUCT_HEALTH_URL="http://127.0.0.1:${PRODUCT_PORT}/health"
export E2E_REDPANDA_CONTAINER="$REDPANDA_CONTAINER"
export E2E_PRODUCT_TOPIC="$PRODUCT_TOPIC"
export E2E_FLASH_SALE_TOPIC="$FLASH_SALE_TOPIC"

echo '[gateway-e2e] Running gateway business scenarios...'
npx vitest run --config vitest.e2e.config.mts "$@"

LOAD_PROFILE_TO_RUN="${RUN_LOAD_PROFILE:-}"
if [[ -z "$LOAD_PROFILE_TO_RUN" && "${RUN_LOAD_SMOKE:-0}" == "1" ]]; then
  LOAD_PROFILE_TO_RUN=smoke
fi

if [[ -n "$LOAD_PROFILE_TO_RUN" ]]; then
  require_command k6
  if [[ "$LOAD_PROFILE_TO_RUN" == "smoke" ]]; then
    export LOAD_VUS="${LOAD_VUS:-3}"
    export LOAD_STOCK_LIMIT="${LOAD_STOCK_LIMIT:-5}"
  fi
  LOAD_BASELINE_OUTPUT="${LOAD_BASELINE_PATH:-${ARTIFACT_DIR:-$LOG_DIR}/load-${LOAD_PROFILE_TO_RUN}-baseline.md}"
  echo "[gateway-e2e] Running the flash-sale ${LOAD_PROFILE_TO_RUN} load profile..."
  LOAD_RUNNER=scripts/run-flash-sale-load-test.sh
  if [[ "$LOAD_PROFILE_TO_RUN" == "matrix" ]]; then
    LOAD_RUNNER=scripts/run-flash-sale-load-matrix.sh
  fi
  LOAD_GATEWAY_URL="$E2E_GATEWAY_URL" \
  LOAD_ADMIN_EMAIL='admin.e2e@example.test' \
  LOAD_ADMIN_PASSWORD='password123' \
  LOAD_BASELINE_PATH="$LOAD_BASELINE_OUTPUT" \
    bash "$LOAD_RUNNER" "$LOAD_PROFILE_TO_RUN"
fi

echo '[gateway-e2e] Full gateway E2E suite passed.'
