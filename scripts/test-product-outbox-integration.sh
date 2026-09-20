#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRODUCT_DATABASE_NAME="verify_product_outbox_$$_test"
INVENTORY_DATABASE_NAME="verify_inventory_outbox_$$_test"
PRODUCT_DATABASE_URL="postgresql://postgres:postgres@localhost:5001/$PRODUCT_DATABASE_NAME"
INVENTORY_DATABASE_URL="postgresql://postgres:postgres@localhost:5003/$INVENTORY_DATABASE_NAME"
PRODUCT_API_PORT="${OUTBOX_PRODUCT_API_PORT:-4211}"
PUBLISHER_API_PORT="${OUTBOX_PUBLISHER_API_PORT:-4212}"
REPLAY_API_PORT="${OUTBOX_REPLAY_API_PORT:-4213}"
INVENTORY_API_PORT="${OUTBOX_INVENTORY_API_PORT:-4311}"
INVENTORY_GRPC_PORT="${OUTBOX_INVENTORY_GRPC_PORT:-9311}"
TOPIC="product-events-integration-$(date +%s)-$$"
KAFKA_GROUP="inventory-outbox-integration-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d)"
RESPONSE_FILE="$TEMP_DIR/response.json"
PRODUCT_PID=''
PUBLISHER_PID=''
REPLAY_PID=''
INVENTORY_PID=''
HTTP_STATUS=''
HTTP_BODY=''

cd "$ROOT_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

assert_equal() {
  local expected="$1"
  local actual="$2"
  local message="$3"

  if [[ "$actual" != "$expected" ]]; then
    echo "FAILED: $message" >&2
    echo "Expected: $expected" >&2
    echo "Actual:   $actual" >&2
    exit 1
  fi
}

json_field() {
  node -e '
const path = process.argv[1].split(".");
let value = JSON.parse(process.argv[2]);
for (const key of path) value = value?.[key];
if (value === undefined || value === null) process.exit(1);
process.stdout.write(String(value));
' "$1" "$2"
}

request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local args=(-sS -o "$RESPONSE_FILE" -w '%{http_code}' -X "$method")

  if [[ -n "$body" ]]; then
    args+=(-H 'Content-Type: application/json' -d "$body")
  fi

  HTTP_STATUS="$(curl "${args[@]}" "$url")"
  HTTP_BODY="$(cat "$RESPONSE_FILE")"
}

db_value() {
  local service="$1"
  local database="$2"
  local sql="$3"

  docker compose exec -T "$service" \
    psql -U postgres -d "$database" -Atq -c "$sql" | tr -d '[:space:]'
}

db_execute() {
  local service="$1"
  local database="$2"
  local sql="$3"

  docker compose exec -T "$service" \
    psql -U postgres -d "$database" -v ON_ERROR_STOP=1 -c "$sql" >/dev/null
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

wait_for_redpanda() {
  for _attempt in {1..150}; do
    if docker compose exec -T redpanda rpk cluster health >/dev/null 2>&1; then
      return
    fi
    sleep 0.1
  done

  return 1
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local pid="$3"
  local log_file="$4"

  for _attempt in {1..150}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return
    fi
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      echo "$name stopped before becoming healthy." >&2
      tail -n 80 "$log_file" >&2
      exit 1
    fi
    sleep 0.1
  done

  echo "Timed out waiting for $name." >&2
  tail -n 80 "$log_file" >&2
  exit 1
}

wait_for_db_value() {
  local service="$1"
  local database="$2"
  local sql="$3"
  local expected="$4"
  local description="$5"
  local actual=''

  for _attempt in {1..200}; do
    actual="$(db_value "$service" "$database" "$sql")"
    if [[ "$actual" == "$expected" ]]; then
      return
    fi
    sleep 0.1
  done

  echo "Timed out waiting for $description." >&2
  echo "Expected: $expected" >&2
  echo "Actual:   $actual" >&2
  exit 1
}

assert_port_available() {
  local name="$1"
  local port="$2"

  if node -e '
const net = require("node:net");
const server = net.createServer();
server.once("error", () => process.exit(0));
server.listen(Number(process.argv[1]), "127.0.0.1", () => server.close(() => process.exit(1)));
' "$port"; then
    echo "$name cannot start because port $port is already in use." >&2
    exit 1
  fi
}

stop_process() {
  local pid="$1"

  if [[ -z "$pid" ]] || ! kill -0 "$pid" >/dev/null 2>&1; then
    return
  fi

  kill "$pid" >/dev/null 2>&1 || true
  for _attempt in {1..50}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      wait "$pid" 2>/dev/null || true
      return
    fi
    sleep 0.1
  done

  kill -9 "$pid" >/dev/null 2>&1 || true
  wait "$pid" 2>/dev/null || true
}

start_product_service() {
  local port="$1"
  local poll_interval="$2"
  local log_file="$3"

  env \
    NODE_ENV=test \
    PORT="$port" \
    PRODUCT_DATABASE_URL="$PRODUCT_DATABASE_URL" \
    KAFKA_BROKERS=localhost:9094 \
    PRODUCT_EVENTS_TOPIC="$TOPIC" \
    PRODUCT_OUTBOX_POLL_INTERVAL_MS="$poll_interval" \
    PRODUCT_OUTBOX_BATCH_SIZE=5 \
    PRODUCT_OUTBOX_LEASE_DURATION_MS=5000 \
    PRODUCT_OUTBOX_SHUTDOWN_TIMEOUT_MS=2000 \
    PRODUCT_OUTBOX_MAX_ATTEMPTS=5 \
    PRODUCT_OUTBOX_RETRY_BASE_DELAY_MS=100 \
    PRODUCT_OUTBOX_RETRY_MAX_DELAY_MS=1000 \
    node dist/apps/product-service/main.js >"$log_file" 2>&1 &
  LAST_PID="$!"
}

start_inventory_service() {
  local log_file="$1"

  env \
    NODE_ENV=test \
    PORT="$INVENTORY_API_PORT" \
    INVENTORY_GRPC_PORT="$INVENTORY_GRPC_PORT" \
    INVENTORY_DATABASE_URL="$INVENTORY_DATABASE_URL" \
    KAFKA_BROKERS=localhost:9094 \
    PRODUCT_EVENTS_TOPIC="$TOPIC" \
    INVENTORY_KAFKA_GROUP_ID="$KAFKA_GROUP" \
    node dist/apps/inventory-service/main.js >"$log_file" 2>&1 &
  LAST_PID="$!"
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  stop_process "$REPLAY_PID" 2>/dev/null
  stop_process "$PUBLISHER_PID" 2>/dev/null
  stop_process "$INVENTORY_PID" 2>/dev/null
  stop_process "$PRODUCT_PID" 2>/dev/null

  docker compose up -d redpanda >/dev/null 2>&1 || true
  if wait_for_redpanda >/dev/null 2>&1; then
    docker compose exec -T redpanda rpk topic delete "$TOPIC" >/dev/null 2>&1 || true
  fi
  docker compose exec -T postgres-product psql -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS $PRODUCT_DATABASE_NAME WITH (FORCE);" >/dev/null 2>&1 || true
  docker compose exec -T postgres-inventory psql -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS $INVENTORY_DATABASE_NAME WITH (FORCE);" >/dev/null 2>&1 || true
  rm -rf "$TEMP_DIR"
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

require_command curl
require_command docker
require_command node
require_command npm

assert_port_available product-service "$PRODUCT_API_PORT"
assert_port_available publisher-worker "$PUBLISHER_API_PORT"
assert_port_available replay-worker "$REPLAY_API_PORT"
assert_port_available inventory-service "$INVENTORY_API_PORT"
assert_port_available inventory-grpc "$INVENTORY_GRPC_PORT"

echo 'Preparing disposable databases and service builds...'
docker compose up -d postgres-product postgres-inventory redpanda >/dev/null
wait_for_database postgres-product
wait_for_database postgres-inventory
if ! wait_for_redpanda; then
  echo 'Timed out waiting for Redpanda.' >&2
  exit 1
fi

docker compose exec -T postgres-product psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS $PRODUCT_DATABASE_NAME WITH (FORCE);" \
  -c "CREATE DATABASE $PRODUCT_DATABASE_NAME;" >/dev/null
docker compose exec -T postgres-inventory psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS $INVENTORY_DATABASE_NAME WITH (FORCE);" \
  -c "CREATE DATABASE $INVENTORY_DATABASE_NAME;" >/dev/null

env PRODUCT_DATABASE_URL="$PRODUCT_DATABASE_URL" npm run prisma:product:deploy >/dev/null
env INVENTORY_DATABASE_URL="$INVENTORY_DATABASE_URL" npm run prisma:inventory:deploy >/dev/null
env PRODUCT_DATABASE_URL="$PRODUCT_DATABASE_URL" npm run prisma:product:generate >/dev/null
env INVENTORY_DATABASE_URL="$INVENTORY_DATABASE_URL" npm run prisma:inventory:generate >/dev/null
npm run build -- product-service >/dev/null
npm run build -- inventory-service >/dev/null

echo 'Scenario C — product and SKUs roll back when outbox insertion fails'
echo 'Scenario D — competing workers claim disjoint work and publish every due event'
env \
  PRODUCT_INTEGRATION_DATABASE_URL="$PRODUCT_DATABASE_URL" \
  INVENTORY_INTEGRATION_DATABASE_URL="$INVENTORY_DATABASE_URL" \
  npx vitest run \
    --no-file-parallelism \
    apps/product-service/src/catalog/infrastructure/persistence/prisma/product.prisma.repository.integration.spec.ts \
    apps/product-service/src/catalog/infrastructure/persistence/prisma/product-outbox.prisma.repository.integration.spec.ts \
    apps/inventory-service/src/inventory/infrastructure/persistence/prisma/inventory.prisma.repository.integration.spec.ts

db_execute postgres-product "$PRODUCT_DATABASE_NAME" \
  'DELETE FROM "product_outbox_events"; DELETE FROM "product_skus"; DELETE FROM "products"; DELETE FROM "categories";'
db_execute postgres-inventory "$INVENTORY_DATABASE_NAME" \
  'DELETE FROM "stock_transactions"; DELETE FROM "stock_reservations"; DELETE FROM "inventory_stocks"; DELETE FROM "processed_product_events";'

echo 'Scenario A — broker outage during product creation'
docker compose stop redpanda >/dev/null
start_product_service "$PRODUCT_API_PORT" 60000 "$TEMP_DIR/product.log"
PRODUCT_PID="$LAST_PID"
wait_for_http product-service "http://localhost:$PRODUCT_API_PORT/health" "$PRODUCT_PID" "$TEMP_DIR/product.log"

request POST "http://localhost:$PRODUCT_API_PORT/api/categories" \
  '{"name":"Integration Accessories","slug":"integration-accessories"}'
assert_equal 201 "$HTTP_STATUS" 'category creation should return HTTP 201'
CATEGORY_ID="$(json_field id "$HTTP_BODY")"

request POST "http://localhost:$PRODUCT_API_PORT/api/products" \
  "{\"name\":\"Outbox Integration Keyboard\",\"description\":\"Broker outage verification\",\"categoryId\":$CATEGORY_ID,\"sellerId\":7001,\"status\":\"ACTIVE\",\"skus\":[{\"skuCode\":\"OUTBOX-BLACK\",\"price\":79.90,\"status\":\"AVAILABLE\",\"quantity\":12},{\"skuCode\":\"OUTBOX-WHITE\",\"price\":84.90,\"status\":\"AVAILABLE\",\"quantity\":7}]}"
assert_equal 201 "$HTTP_STATUS" 'product creation should return HTTP 201 while Redpanda is down'
PRODUCT_ID="$(json_field id "$HTTP_BODY")"
SKU_COUNT="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).skus.length))' "$HTTP_BODY")"
EVENT_ID="$(db_value postgres-product "$PRODUCT_DATABASE_NAME" "SELECT \"id\" FROM \"product_outbox_events\" WHERE \"aggregate_id\" = $PRODUCT_ID;")"

assert_equal 1 "$(db_value postgres-product "$PRODUCT_DATABASE_NAME" "SELECT COUNT(*) FROM \"products\" WHERE \"id\" = $PRODUCT_ID;")" 'product must exist'
assert_equal "$SKU_COUNT" "$(db_value postgres-product "$PRODUCT_DATABASE_NAME" "SELECT COUNT(*) FROM \"product_skus\" WHERE \"product_id\" = $PRODUCT_ID;")" 'all SKUs must exist'
assert_equal PENDING "$(db_value postgres-product "$PRODUCT_DATABASE_NAME" "SELECT \"status\" FROM \"product_outbox_events\" WHERE \"id\" = '$EVENT_ID';")" 'outbox event must remain pending'
assert_equal 0 "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" 'SELECT COUNT(*) FROM "inventory_stocks";')" 'inventory must not initialize while Redpanda is down'
curl -fsS "http://localhost:$PRODUCT_API_PORT/health" >/dev/null

docker compose up -d redpanda >/dev/null
if ! wait_for_redpanda; then
  echo 'Timed out waiting for Redpanda after restart.' >&2
  exit 1
fi
docker compose exec -T redpanda rpk topic create "$TOPIC" >/dev/null
start_inventory_service "$TEMP_DIR/inventory.log"
INVENTORY_PID="$LAST_PID"
wait_for_http inventory-service "http://localhost:$INVENTORY_API_PORT/health" "$INVENTORY_PID" "$TEMP_DIR/inventory.log"
start_product_service "$PUBLISHER_API_PORT" 50 "$TEMP_DIR/publisher.log"
PUBLISHER_PID="$LAST_PID"
wait_for_http publisher-worker "http://localhost:$PUBLISHER_API_PORT/health" "$PUBLISHER_PID" "$TEMP_DIR/publisher.log"

wait_for_db_value postgres-product "$PRODUCT_DATABASE_NAME" \
  "SELECT \"status\"::text || ':' || \"attempt_count\" FROM \"product_outbox_events\" WHERE \"id\" = '$EVENT_ID';" \
  'PUBLISHED:1' 'the pending outbox event to publish'
wait_for_db_value postgres-inventory "$INVENTORY_DATABASE_NAME" \
  "SELECT COUNT(*) FROM \"processed_product_events\" WHERE \"event_id\" = '$EVENT_ID';" \
  1 'the inventory processed-event marker'
assert_equal "$SKU_COUNT" "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "SELECT COUNT(*) FROM \"inventory_stocks\" WHERE \"product_id\" = $PRODUCT_ID;")" 'inventory must contain one stock row per SKU'
assert_equal "$SKU_COUNT" "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "SELECT COUNT(*) FROM \"stock_transactions\" WHERE \"type\" = 'INITIALIZE';")" 'inventory must contain one initialization transaction per SKU'
stop_process "$PUBLISHER_PID"
PUBLISHER_PID=''
echo "  PASS productId=$PRODUCT_ID eventId=$EVENT_ID"

echo 'Scenario B — acknowledged event is republished after an expired lease'
db_execute postgres-product "$PRODUCT_DATABASE_NAME" \
  "UPDATE \"product_outbox_events\" SET \"status\" = 'PROCESSING', \"lease_owner\" = 'lost-worker', \"lease_until\" = NOW() - INTERVAL '1 second', \"published_at\" = NULL WHERE \"id\" = '$EVENT_ID';"
start_product_service "$REPLAY_API_PORT" 50 "$TEMP_DIR/replay.log"
REPLAY_PID="$LAST_PID"
wait_for_http replay-worker "http://localhost:$REPLAY_API_PORT/health" "$REPLAY_PID" "$TEMP_DIR/replay.log"

wait_for_db_value postgres-product "$PRODUCT_DATABASE_NAME" \
  "SELECT \"status\"::text || ':' || \"attempt_count\" FROM \"product_outbox_events\" WHERE \"id\" = '$EVENT_ID';" \
  'PUBLISHED:2' 'the expired event to be republished and acknowledged'
DELIVERY_COUNT="$(env NODE_NO_WARNINGS=1 KAFKA_BROKERS=localhost:9094 node scripts/count-kafka-event-deliveries.js "$TOPIC" "$EVENT_ID" 2 15000)"
assert_equal 2 "$DELIVERY_COUNT" 'Kafka must contain the same event ID twice'
assert_equal 1 "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "SELECT COUNT(*) FROM \"processed_product_events\" WHERE \"event_id\" = '$EVENT_ID';")" 'inventory must keep one processed marker'
assert_equal "$SKU_COUNT" "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "SELECT COUNT(*) FROM \"inventory_stocks\" WHERE \"product_id\" = $PRODUCT_ID;")" 'duplicate delivery must not duplicate stock'
assert_equal "$SKU_COUNT" "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "SELECT COUNT(*) FROM \"stock_transactions\" WHERE \"type\" = 'INITIALIZE';")" 'duplicate delivery must not duplicate initialization transactions'
echo "  PASS eventId=$EVENT_ID deliveries=$DELIVERY_COUNT"

echo
echo 'All product outbox integration scenarios passed.'
