#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRODUCT_DATABASE_NAME="verify_product_outbox_$$_test"
INVENTORY_DATABASE_NAME="verify_inventory_outbox_$$_test"
CART_DATABASE_NAME="verify_cart_checkout_$$_test"
ORDER_DATABASE_NAME="verify_order_checkout_$$_test"
PRODUCT_DATABASE_URL="postgresql://postgres:postgres@localhost:5001/$PRODUCT_DATABASE_NAME"
INVENTORY_DATABASE_URL="postgresql://postgres:postgres@localhost:5003/$INVENTORY_DATABASE_NAME"
CART_DATABASE_URL="postgresql://postgres:postgres@localhost:5002/$CART_DATABASE_NAME"
ORDER_DATABASE_URL="postgresql://postgres:postgres@localhost:5004/$ORDER_DATABASE_NAME"
PRODUCT_API_PORT="${OUTBOX_PRODUCT_API_PORT:-4211}"
PUBLISHER_API_PORT="${OUTBOX_PUBLISHER_API_PORT:-4212}"
REPLAY_API_PORT="${OUTBOX_REPLAY_API_PORT:-4213}"
INVENTORY_API_PORT="${OUTBOX_INVENTORY_API_PORT:-4311}"
INVENTORY_GRPC_PORT="${OUTBOX_INVENTORY_GRPC_PORT:-9311}"
CART_API_PORT="${SALE_E2E_CART_API_PORT:-4411}"
ORDER_API_PORT="${SALE_E2E_ORDER_API_PORT:-4412}"
ORDER_GRPC_PORT="${SALE_E2E_ORDER_GRPC_PORT:-9412}"
TOPIC="product-events-integration-$(date +%s)-$$"
KAFKA_GROUP="inventory-outbox-integration-$(date +%s)-$$"
FLASH_TOPIC="flash-sale-events-integration-$(date +%s)-$$"
FLASH_KAFKA_GROUP="inventory-flash-sale-integration-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d)"
RESPONSE_FILE="$TEMP_DIR/response.json"
PRODUCT_PID=''
PUBLISHER_PID=''
REPLAY_PID=''
INVENTORY_PID=''
CART_PID=''
ORDER_PID=''
HTTP_STATUS=''
HTTP_BODY=''

cd "$ROOT_DIR"

echo '[e2e] Running the full product, inventory, cart, and order workflow...'

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

request_as_user() {
  local method="$1"
  local url="$2"
  local user_id="$3"
  local body="${4:-}"
  local idempotency_key="${5:-}"
  local args=(-sS -o "$RESPONSE_FILE" -w '%{http_code}' -X "$method" -H "x-user-id: $user_id")

  if [[ -n "$body" ]]; then
    args+=(-H 'Content-Type: application/json' -d "$body")
  fi
  if [[ -n "$idempotency_key" ]]; then
    args+=(-H "Idempotency-Key: $idempotency_key")
  fi

  HTTP_STATUS="$(curl "${args[@]}" "$url")"
  HTTP_BODY="$(cat "$RESPONSE_FILE")"
}

request_as_admin() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local args=(-sS -o "$RESPONSE_FILE" -w '%{http_code}' -X "$method" -H 'x-user-id: 7001')

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
    FLASH_SALE_EVENTS_TOPIC="$FLASH_TOPIC" \
    PRODUCT_OUTBOX_POLL_INTERVAL_MS="$poll_interval" \
    PRODUCT_OUTBOX_BATCH_SIZE=5 \
    PRODUCT_OUTBOX_LEASE_MS=5000 \
    PRODUCT_OUTBOX_SHUTDOWN_TIMEOUT_MS=2000 \
    PRODUCT_OUTBOX_MAX_ATTEMPTS=5 \
    node dist/apps/product-service/main.js >"$log_file" 2>&1 &
  LAST_PID="$!"
}

start_inventory_service() {
  local log_file="$1"

  env \
    NODE_ENV=test \
    PORT="$INVENTORY_API_PORT" \
    INVENTORY_GRPC_URL="0.0.0.0:$INVENTORY_GRPC_PORT" \
    INVENTORY_GRPC_PORT="$INVENTORY_GRPC_PORT" \
    INVENTORY_DATABASE_URL="$INVENTORY_DATABASE_URL" \
    KAFKA_BROKERS=localhost:9094 \
    PRODUCT_EVENTS_TOPIC="$TOPIC" \
    FLASH_SALE_EVENTS_TOPIC="$FLASH_TOPIC" \
    INVENTORY_KAFKA_GROUP_ID="$KAFKA_GROUP" \
    INVENTORY_FLASH_SALE_KAFKA_GROUP_ID="$FLASH_KAFKA_GROUP" \
    node dist/apps/inventory-service/main.js >"$log_file" 2>&1 &
  LAST_PID="$!"
}

start_order_service() {
  local log_file="$1"
  env NODE_ENV=test PORT="$ORDER_API_PORT" ORDER_GRPC_URL="0.0.0.0:$ORDER_GRPC_PORT" \
    ORDER_GRPC_PORT="$ORDER_GRPC_PORT" \
    ORDER_DATABASE_URL="$ORDER_DATABASE_URL" node dist/apps/order-service/main.js >"$log_file" 2>&1 &
  LAST_PID="$!"
}

start_cart_service() {
  local log_file="$1"
  env NODE_ENV=test PORT="$CART_API_PORT" CART_DATABASE_URL="$CART_DATABASE_URL" \
    PRODUCT_SERVICE_URL="http://localhost:$PRODUCT_API_PORT" \
    INVENTORY_GRPC_URL="localhost:$INVENTORY_GRPC_PORT" \
    ORDER_GRPC_URL="localhost:$ORDER_GRPC_PORT" \
    node dist/apps/cart-service/main.js >"$log_file" 2>&1 &
  LAST_PID="$!"
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  stop_process "$REPLAY_PID" 2>/dev/null
  stop_process "$PUBLISHER_PID" 2>/dev/null
  stop_process "$INVENTORY_PID" 2>/dev/null
  stop_process "$CART_PID" 2>/dev/null
  stop_process "$ORDER_PID" 2>/dev/null
  stop_process "$PRODUCT_PID" 2>/dev/null

  docker compose up -d redpanda >/dev/null 2>&1 || true
  if wait_for_redpanda >/dev/null 2>&1; then
    docker compose exec -T redpanda rpk topic delete "$TOPIC" >/dev/null 2>&1 || true
    docker compose exec -T redpanda rpk topic delete "$FLASH_TOPIC" >/dev/null 2>&1 || true
  fi
  docker compose exec -T postgres-product psql -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS $PRODUCT_DATABASE_NAME WITH (FORCE);" >/dev/null 2>&1 || true
  docker compose exec -T postgres-inventory psql -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS $INVENTORY_DATABASE_NAME WITH (FORCE);" >/dev/null 2>&1 || true
  docker compose exec -T postgres-cart psql -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS $CART_DATABASE_NAME WITH (FORCE);" >/dev/null 2>&1 || true
  docker compose exec -T postgres-order psql -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS $ORDER_DATABASE_NAME WITH (FORCE);" >/dev/null 2>&1 || true
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
assert_port_available cart-service "$CART_API_PORT"
assert_port_available order-service "$ORDER_API_PORT"
assert_port_available order-grpc "$ORDER_GRPC_PORT"

echo 'Preparing disposable databases and service builds...'
docker compose up -d postgres-product postgres-inventory postgres-cart postgres-order redpanda >/dev/null
wait_for_database postgres-product
wait_for_database postgres-inventory
wait_for_database postgres-cart
wait_for_database postgres-order
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
docker compose exec -T postgres-cart psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS $CART_DATABASE_NAME WITH (FORCE);" \
  -c "CREATE DATABASE $CART_DATABASE_NAME;" >/dev/null
docker compose exec -T postgres-order psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS $ORDER_DATABASE_NAME WITH (FORCE);" \
  -c "CREATE DATABASE $ORDER_DATABASE_NAME;" >/dev/null

env PRODUCT_DATABASE_URL="$PRODUCT_DATABASE_URL" npm run prisma:product:deploy >/dev/null
env INVENTORY_DATABASE_URL="$INVENTORY_DATABASE_URL" npm run prisma:inventory:deploy >/dev/null
env CART_DATABASE_URL="$CART_DATABASE_URL" npm run prisma:cart:deploy >/dev/null
env ORDER_DATABASE_URL="$ORDER_DATABASE_URL" npm run prisma:order:deploy >/dev/null
env PRODUCT_DATABASE_URL="$PRODUCT_DATABASE_URL" npm run prisma:product:generate >/dev/null
env INVENTORY_DATABASE_URL="$INVENTORY_DATABASE_URL" npm run prisma:inventory:generate >/dev/null
npm run build -- product-service >/dev/null
npm run build -- inventory-service >/dev/null
npm run build -- cart-service >/dev/null
npm run build -- order-service >/dev/null

db_execute postgres-product "$PRODUCT_DATABASE_NAME" \
  'DELETE FROM "product_outbox_events"; DELETE FROM "product_skus"; DELETE FROM "products"; DELETE FROM "categories";'
db_execute postgres-inventory "$INVENTORY_DATABASE_NAME" \
  'DELETE FROM "stock_transactions"; DELETE FROM "stock_reservations"; DELETE FROM "flash_sale_stocks"; DELETE FROM "processed_flash_sale_events"; DELETE FROM "inventory_stocks"; DELETE FROM "processed_product_events";'

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
SKU_ID="$(json_field skus.0.id "$HTTP_BODY")"
SECOND_SKU_ID="$(json_field skus.1.id "$HTTP_BODY")"
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
docker compose exec -T redpanda rpk topic create "$FLASH_TOPIC" >/dev/null
start_inventory_service "$TEMP_DIR/inventory.log"
INVENTORY_PID="$LAST_PID"
wait_for_http inventory-service "http://localhost:$INVENTORY_API_PORT/health" "$INVENTORY_PID" "$TEMP_DIR/inventory.log"
start_product_service "$PUBLISHER_API_PORT" 250 "$TEMP_DIR/publisher.log"
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
start_product_service "$REPLAY_API_PORT" 250 "$TEMP_DIR/replay.log"
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

echo 'Scenario C — flash sale scheduling catches up after a broker outage'
stop_process "$REPLAY_PID"
REPLAY_PID=''
stop_process "$INVENTORY_PID"
INVENTORY_PID=''
docker compose stop redpanda >/dev/null

start_order_service "$TEMP_DIR/order.log"
ORDER_PID="$LAST_PID"
wait_for_http order-service "http://localhost:$ORDER_API_PORT/health" "$ORDER_PID" "$TEMP_DIR/order.log"
start_cart_service "$TEMP_DIR/cart.log"
CART_PID="$LAST_PID"
wait_for_http cart-service "http://localhost:$CART_API_PORT/health" "$CART_PID" "$TEMP_DIR/cart.log"

FLASH_STARTS_AT="$(node -e 'process.stdout.write(new Date(Date.now() + 310000).toISOString())')"
FLASH_ENDS_AT="$(node -e 'process.stdout.write(new Date(Date.now() + 610000).toISOString())')"
request_as_admin POST "http://localhost:$PRODUCT_API_PORT/api/flash-sales" \
  "{\"name\":\"Outbox Integration Flash Sale\",\"description\":\"Broker outage verification\",\"startsAt\":\"$FLASH_STARTS_AT\",\"endsAt\":\"$FLASH_ENDS_AT\",\"items\":[{\"productSkuId\":$SKU_ID,\"salePrice\":49.90,\"stockLimit\":3,\"maxQuantityPerUser\":1}]}"
assert_equal 201 "$HTTP_STATUS" 'flash sale draft creation should return HTTP 201'
FLASH_SALE_ID="$(json_field id "$HTTP_BODY")"

request POST "http://localhost:$PRODUCT_API_PORT/api/flash-sales/$FLASH_SALE_ID/schedule"
assert_equal 201 "$HTTP_STATUS" 'flash sale scheduling should return HTTP 201 while Redpanda is down'
FLASH_EVENT_ID="$(db_value postgres-product "$PRODUCT_DATABASE_NAME" "SELECT \"id\" FROM \"product_outbox_events\" WHERE \"event_type\" = 'FLASH_SALE_SCHEDULED' AND \"aggregate_id\" = $FLASH_SALE_ID;")"
assert_equal PENDING "$(db_value postgres-product "$PRODUCT_DATABASE_NAME" "SELECT \"status\" FROM \"product_outbox_events\" WHERE \"id\" = '$FLASH_EVENT_ID';")" 'flash sale event must remain pending'
assert_equal 0 "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "SELECT COUNT(*) FROM \"flash_sale_stocks\" WHERE \"flash_sale_id\" = $FLASH_SALE_ID;")" 'flash sale projection must not initialize while Redpanda is down'
request GET "http://localhost:$PRODUCT_API_PORT/api/flash-sales?status=upcoming"
assert_equal 200 "$HTTP_STATUS" 'sale must remain visible as upcoming while publication is delayed'
assert_equal "$FLASH_SALE_ID" "$(json_field 0.id "$HTTP_BODY")" 'the delayed sale must be listed'
assert_equal UPCOMING "$(json_field 0.status "$HTTP_BODY")" 'the delayed sale must remain upcoming'
curl -fsS "http://localhost:$PRODUCT_API_PORT/health" >/dev/null

docker compose up -d redpanda >/dev/null
if ! wait_for_redpanda; then
  echo 'Timed out waiting for Redpanda after flash sale outage.' >&2
  exit 1
fi
docker compose exec -T redpanda rpk topic create "$FLASH_TOPIC" >/dev/null 2>&1 || true
start_inventory_service "$TEMP_DIR/flash-inventory.log"
INVENTORY_PID="$LAST_PID"
wait_for_http inventory-service "http://localhost:$INVENTORY_API_PORT/health" "$INVENTORY_PID" "$TEMP_DIR/flash-inventory.log"
db_execute postgres-product "$PRODUCT_DATABASE_NAME" \
  "UPDATE \"flash_sales\" SET \"starts_at\" = NOW() - INTERVAL '1 minute', \"ends_at\" = NOW() + INTERVAL '5 minutes' WHERE \"id\" = $FLASH_SALE_ID;"
request_as_user POST "http://localhost:$CART_API_PORT/api/cart-items" 99 \
  "{\"productSkuId\":$SKU_ID,\"quantity\":1}"
assert_equal 201 "$HTTP_STATUS" 'active delayed sale item should be added'
DELAY_CART_ID="$(json_field id "$HTTP_BODY")"
assert_equal FLASH_SALE "$(json_field items.0.priceSource "$HTTP_BODY")" 'delayed sale cart item must keep its sale context'
request_as_user POST "http://localhost:$CART_API_PORT/api/carts/$DELAY_CART_ID/checkout" 99 '' \
  '99999999-9999-4999-8999-999999999999'
if [[ "$HTTP_STATUS" != 409 ]]; then
  echo "Unexpected delayed-projection checkout response: $HTTP_BODY" >&2
  db_value postgres-cart "$CART_DATABASE_NAME" \
    "SELECT COALESCE(\"last_error\", '') || ':' || COALESCE(\"reconciliation_action\"::text, '') FROM \"checkout_attempts\" WHERE \"cart_id\" = $DELAY_CART_ID;" >&2
  tail -n 40 "$TEMP_DIR/cart.log" >&2 || true
  tail -n 40 "$TEMP_DIR/flash-inventory.log" >&2 || true
fi
assert_equal 409 "$HTTP_STATUS" 'checkout before projection should fail definitely'
assert_equal FLASH_SALE_NOT_READY "$(json_field code "$HTTP_BODY")" 'missing projection must return FLASH_SALE_NOT_READY'
start_product_service "$REPLAY_API_PORT" 250 "$TEMP_DIR/flash-publisher.log"
REPLAY_PID="$LAST_PID"
wait_for_http replay-worker "http://localhost:$REPLAY_API_PORT/health" "$REPLAY_PID" "$TEMP_DIR/flash-publisher.log"

wait_for_db_value postgres-product "$PRODUCT_DATABASE_NAME" \
  "SELECT \"status\"::text FROM \"product_outbox_events\" WHERE \"id\" = '$FLASH_EVENT_ID';" \
  PUBLISHED 'the pending flash sale event to publish'
wait_for_db_value postgres-inventory "$INVENTORY_DATABASE_NAME" \
  "SELECT COUNT(*) FROM \"processed_flash_sale_events\" WHERE \"event_id\" = '$FLASH_EVENT_ID';" \
  1 'the flash sale processed-event marker'
assert_equal 1 "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "SELECT COUNT(*) FROM \"flash_sale_stocks\" WHERE \"flash_sale_id\" = $FLASH_SALE_ID;")" 'inventory must contain one flash sale projection row'
db_execute postgres-inventory "$INVENTORY_DATABASE_NAME" \
  "UPDATE \"flash_sale_stocks\" SET \"starts_at\" = NOW() - INTERVAL '1 minute', \"ends_at\" = NOW() + INTERVAL '5 minutes' WHERE \"flash_sale_id\" = $FLASH_SALE_ID;"

db_execute postgres-product "$PRODUCT_DATABASE_NAME" \
  "UPDATE \"product_outbox_events\" SET \"status\" = 'PROCESSING', \"lease_owner\" = 'lost-worker', \"lease_until\" = NOW() - INTERVAL '1 second', \"published_at\" = NULL WHERE \"id\" = '$FLASH_EVENT_ID';"
wait_for_db_value postgres-product "$PRODUCT_DATABASE_NAME" \
  "SELECT \"status\"::text || ':' || \"attempt_count\" FROM \"product_outbox_events\" WHERE \"id\" = '$FLASH_EVENT_ID';" \
  'PUBLISHED:2' 'the flash sale event to be republished after lease expiry'
assert_equal 1 "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "SELECT COUNT(*) FROM \"processed_flash_sale_events\" WHERE \"event_id\" = '$FLASH_EVENT_ID';")" 'duplicate flash sale delivery must keep one marker'
assert_equal 1 "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "SELECT COUNT(*) FROM \"flash_sale_stocks\" WHERE \"flash_sale_id\" = $FLASH_SALE_ID;")" 'duplicate flash sale delivery must keep one projection row'
request_as_user POST "http://localhost:$CART_API_PORT/api/cart-items" 99 \
  "{\"productSkuId\":$SKU_ID,\"quantity\":1}"
assert_equal 201 "$HTTP_STATUS" 'the customer should receive a new cart after projection catches up'
RECOVERED_CART_ID="$(json_field id "$HTTP_BODY")"
request_as_user POST "http://localhost:$CART_API_PORT/api/carts/$RECOVERED_CART_ID/checkout" 99 '' \
  '99999999-9999-4999-8999-999999999998'
assert_equal 200 "$HTTP_STATUS" 'checkout should succeed after the delayed projection arrives'
echo "  PASS flashSaleId=$FLASH_SALE_ID eventId=$FLASH_EVENT_ID recoveredCartId=$RECOVERED_CART_ID"

echo 'Scenario D — sale checkout completes through cart, inventory, and order services'
SALE_SOLD_BEFORE="$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "SELECT \"sold_quantity\" FROM \"flash_sale_stocks\" WHERE \"flash_sale_id\" = $FLASH_SALE_ID;")"
request_as_user POST "http://localhost:$CART_API_PORT/api/cart-items" 101 \
  "{\"productSkuId\":$SKU_ID,\"quantity\":1}"
assert_equal 201 "$HTTP_STATUS" 'adding an active sale SKU should return HTTP 201'
SALE_CART_ID="$(json_field id "$HTTP_BODY")"
assert_equal FLASH_SALE "$(json_field items.0.priceSource "$HTTP_BODY")" 'cart must store the sale price source'
assert_equal 49.9 "$(json_field items.0.price "$HTTP_BODY")" 'cart must store the sale price'

request_as_user POST "http://localhost:$CART_API_PORT/api/carts/$SALE_CART_ID/checkout" 101 '' \
  '11111111-1111-4111-8111-111111111111'
for _attempt in {1..50}; do
  if [[ "$HTTP_STATUS" != 202 ]]; then
    break
  fi
  sleep 0.1
  request_as_user POST "http://localhost:$CART_API_PORT/api/carts/$SALE_CART_ID/checkout" 101 '' \
    '11111111-1111-4111-8111-111111111111'
done
assert_equal 200 "$HTTP_STATUS" 'sale checkout should complete'
SALE_ORDER_ID="$(json_field orderId "$HTTP_BODY")"
assert_equal CHECKED_OUT "$(json_field cart.status "$HTTP_BODY")" 'cart must be checked out'
assert_equal 49.90 "$(db_value postgres-order "$ORDER_DATABASE_NAME" "SELECT \"total_amount\" FROM \"orders\" WHERE \"id\" = $SALE_ORDER_ID;")" 'order total must use the sale price'
assert_equal "$((SALE_SOLD_BEFORE + 1))" "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "SELECT \"sold_quantity\" FROM \"flash_sale_stocks\" WHERE \"flash_sale_id\" = $FLASH_SALE_ID;")" 'sale sold quantity must increment'
assert_equal 0 "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "SELECT \"reserved_quantity\" FROM \"inventory_stocks\" WHERE \"product_sku_id\" = $SKU_ID;")" 'normal reserved stock must be finalized'
echo "  PASS cartId=$SALE_CART_ID orderId=$SALE_ORDER_ID"

echo 'Scenario E — an item added during a sale fails after authoritative inventory expiry'
EXPIRY_STARTS_AT="$(node -e 'process.stdout.write(new Date(Date.now() + 310000).toISOString())')"
EXPIRY_ENDS_AT="$(node -e 'process.stdout.write(new Date(Date.now() + 370000).toISOString())')"
request_as_admin POST "http://localhost:$PRODUCT_API_PORT/api/flash-sales" \
  "{\"name\":\"Expiry Integration Sale\",\"startsAt\":\"$EXPIRY_STARTS_AT\",\"endsAt\":\"$EXPIRY_ENDS_AT\",\"items\":[{\"productSkuId\":$SECOND_SKU_ID,\"salePrice\":39.90,\"stockLimit\":1,\"maxQuantityPerUser\":1}]}"
assert_equal 201 "$HTTP_STATUS" 'expiry sale draft creation should succeed'
EXPIRY_SALE_ID="$(json_field id "$HTTP_BODY")"
request POST "http://localhost:$PRODUCT_API_PORT/api/flash-sales/$EXPIRY_SALE_ID/schedule"
assert_equal 201 "$HTTP_STATUS" 'expiry sale scheduling should succeed'
wait_for_db_value postgres-inventory "$INVENTORY_DATABASE_NAME" \
  "SELECT COUNT(*) FROM \"flash_sale_stocks\" WHERE \"flash_sale_id\" = $EXPIRY_SALE_ID;" 1 \
  'the expiry sale inventory projection'
db_execute postgres-product "$PRODUCT_DATABASE_NAME" \
  "UPDATE \"flash_sales\" SET \"starts_at\" = NOW() - INTERVAL '1 minute', \"ends_at\" = NOW() + INTERVAL '3 seconds' WHERE \"id\" = $EXPIRY_SALE_ID;"
db_execute postgres-inventory "$INVENTORY_DATABASE_NAME" \
  "UPDATE \"flash_sale_stocks\" SET \"starts_at\" = NOW() - INTERVAL '1 minute', \"ends_at\" = NOW() + INTERVAL '3 seconds' WHERE \"flash_sale_id\" = $EXPIRY_SALE_ID;"
request_as_user POST "http://localhost:$CART_API_PORT/api/cart-items" 202 \
  "{\"productSkuId\":$SECOND_SKU_ID,\"quantity\":1}"
assert_equal 201 "$HTTP_STATUS" 'active expiring sale item should be added'
EXPIRY_CART_ID="$(json_field id "$HTTP_BODY")"
ORDER_COUNT_BEFORE="$(db_value postgres-order "$ORDER_DATABASE_NAME" 'SELECT COUNT(*) FROM "orders";')"
EXPIRY_INVENTORY_BEFORE="$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "
  SELECT stock.\"available_quantity\" || ':' || stock.\"reserved_quantity\" || ':' ||
         sale.\"reserved_quantity\" || ':' || sale.\"sold_quantity\" || ':' ||
         (SELECT COUNT(*) FROM \"stock_reservations\" WHERE \"product_sku_id\" = $SECOND_SKU_ID) || ':' ||
         (SELECT COUNT(*) FROM \"stock_transactions\" WHERE \"product_sku_id\" = $SECOND_SKU_ID)
  FROM \"inventory_stocks\" stock
  JOIN \"flash_sale_stocks\" sale ON sale.\"product_sku_id\" = stock.\"product_sku_id\"
  WHERE stock.\"product_sku_id\" = $SECOND_SKU_ID AND sale.\"flash_sale_id\" = $EXPIRY_SALE_ID;")"
wait_for_db_value postgres-inventory "$INVENTORY_DATABASE_NAME" \
  "SELECT CASE WHEN NOW() >= \"ends_at\" THEN 1 ELSE 0 END FROM \"flash_sale_stocks\" WHERE \"flash_sale_id\" = $EXPIRY_SALE_ID;" 1 \
  'the inventory sale window to end'
request_as_user POST "http://localhost:$CART_API_PORT/api/carts/$EXPIRY_CART_ID/checkout" 202 '' \
  '22222222-2222-4222-8222-222222222222'
assert_equal 409 "$HTTP_STATUS" 'expired sale checkout should fail'
assert_equal FLASH_SALE_ENDED "$(json_field code "$HTTP_BODY")" 'expired sale must return its stable code'
assert_equal "$ORDER_COUNT_BEFORE" "$(db_value postgres-order "$ORDER_DATABASE_NAME" 'SELECT COUNT(*) FROM "orders";')" 'expired checkout must not create an order'
assert_equal "$EXPIRY_INVENTORY_BEFORE" "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "
  SELECT stock.\"available_quantity\" || ':' || stock.\"reserved_quantity\" || ':' ||
         sale.\"reserved_quantity\" || ':' || sale.\"sold_quantity\" || ':' ||
         (SELECT COUNT(*) FROM \"stock_reservations\" WHERE \"product_sku_id\" = $SECOND_SKU_ID) || ':' ||
         (SELECT COUNT(*) FROM \"stock_transactions\" WHERE \"product_sku_id\" = $SECOND_SKU_ID)
  FROM \"inventory_stocks\" stock
  JOIN \"flash_sale_stocks\" sale ON sale.\"product_sku_id\" = stock.\"product_sku_id\"
  WHERE stock.\"product_sku_id\" = $SECOND_SKU_ID AND sale.\"flash_sale_id\" = $EXPIRY_SALE_ID;")" 'expired checkout must not change any inventory state'
echo "  PASS cartId=$EXPIRY_CART_ID code=FLASH_SALE_ENDED"

echo 'Scenario F — two concurrent checkouts cannot exceed a one-unit sale allocation'
request POST "http://localhost:$PRODUCT_API_PORT/api/products" \
  "{\"name\":\"Concurrency Verification Mouse\",\"description\":\"Sale checkout race verification\",\"categoryId\":$CATEGORY_ID,\"sellerId\":7001,\"status\":\"ACTIVE\",\"skus\":[{\"skuCode\":\"RACE-BLACK\",\"price\":29.90,\"status\":\"AVAILABLE\",\"quantity\":5},{\"skuCode\":\"LIMIT-WHITE\",\"price\":39.90,\"status\":\"AVAILABLE\",\"quantity\":5}]}"
assert_equal 201 "$HTTP_STATUS" 'concurrency product creation should succeed'
CONCURRENCY_PRODUCT_ID="$(json_field id "$HTTP_BODY")"
SOLD_OUT_SKU_ID="$(json_field skus.0.id "$HTTP_BODY")"
USER_LIMIT_SKU_ID="$(json_field skus.1.id "$HTTP_BODY")"
wait_for_db_value postgres-inventory "$INVENTORY_DATABASE_NAME" \
  "SELECT COUNT(*) FROM \"inventory_stocks\" WHERE \"product_id\" = $CONCURRENCY_PRODUCT_ID;" 2 \
  'the concurrency product inventory projection'

CONCURRENCY_STARTS_AT="$(node -e 'process.stdout.write(new Date(Date.now() + 310000).toISOString())')"
CONCURRENCY_ENDS_AT="$(node -e 'process.stdout.write(new Date(Date.now() + 610000).toISOString())')"
request_as_admin POST "http://localhost:$PRODUCT_API_PORT/api/flash-sales" \
  "{\"name\":\"Checkout Concurrency Sale\",\"startsAt\":\"$CONCURRENCY_STARTS_AT\",\"endsAt\":\"$CONCURRENCY_ENDS_AT\",\"items\":[{\"productSkuId\":$SOLD_OUT_SKU_ID,\"salePrice\":19.90,\"stockLimit\":1,\"maxQuantityPerUser\":1},{\"productSkuId\":$USER_LIMIT_SKU_ID,\"salePrice\":24.90,\"stockLimit\":2,\"maxQuantityPerUser\":1}]}"
assert_equal 201 "$HTTP_STATUS" 'concurrency sale draft creation should succeed'
CONCURRENCY_SALE_ID="$(json_field id "$HTTP_BODY")"
request POST "http://localhost:$PRODUCT_API_PORT/api/flash-sales/$CONCURRENCY_SALE_ID/schedule"
assert_equal 201 "$HTTP_STATUS" 'concurrency sale scheduling should succeed'
wait_for_db_value postgres-inventory "$INVENTORY_DATABASE_NAME" \
  "SELECT COUNT(*) FROM \"flash_sale_stocks\" WHERE \"flash_sale_id\" = $CONCURRENCY_SALE_ID;" 2 \
  'both concurrency sale inventory projections'
db_execute postgres-product "$PRODUCT_DATABASE_NAME" \
  "UPDATE \"flash_sales\" SET \"starts_at\" = NOW() - INTERVAL '1 minute', \"ends_at\" = NOW() + INTERVAL '5 minutes' WHERE \"id\" = $CONCURRENCY_SALE_ID;"
db_execute postgres-inventory "$INVENTORY_DATABASE_NAME" \
  "UPDATE \"flash_sale_stocks\" SET \"starts_at\" = NOW() - INTERVAL '1 minute', \"ends_at\" = NOW() + INTERVAL '5 minutes' WHERE \"flash_sale_id\" = $CONCURRENCY_SALE_ID;"

request_as_user POST "http://localhost:$CART_API_PORT/api/cart-items" 301 \
  "{\"productSkuId\":$SOLD_OUT_SKU_ID,\"quantity\":1}"
assert_equal 201 "$HTTP_STATUS" 'first sold-out competitor should create a cart'
FIRST_RACE_CART_ID="$(json_field id "$HTTP_BODY")"
request_as_user POST "http://localhost:$CART_API_PORT/api/cart-items" 302 \
  "{\"productSkuId\":$SOLD_OUT_SKU_ID,\"quantity\":1}"
assert_equal 201 "$HTTP_STATUS" 'second sold-out competitor should create a cart'
SECOND_RACE_CART_ID="$(json_field id "$HTTP_BODY")"

curl -sS -o "$TEMP_DIR/race-first.json" -w '%{http_code}' -X POST \
  -H 'x-user-id: 301' -H 'Idempotency-Key: 33333333-3333-4333-8333-333333333333' \
  "http://localhost:$CART_API_PORT/api/carts/$FIRST_RACE_CART_ID/checkout" \
  >"$TEMP_DIR/race-first.status" &
FIRST_RACE_PID=$!
curl -sS -o "$TEMP_DIR/race-second.json" -w '%{http_code}' -X POST \
  -H 'x-user-id: 302' -H 'Idempotency-Key: 44444444-4444-4444-8444-444444444444' \
  "http://localhost:$CART_API_PORT/api/carts/$SECOND_RACE_CART_ID/checkout" \
  >"$TEMP_DIR/race-second.status" &
SECOND_RACE_PID=$!
wait "$FIRST_RACE_PID"
wait "$SECOND_RACE_PID"
FIRST_RACE_STATUS="$(cat "$TEMP_DIR/race-first.status")"
SECOND_RACE_STATUS="$(cat "$TEMP_DIR/race-second.status")"
assert_equal '200 409' "$(printf '%s\n%s\n' "$FIRST_RACE_STATUS" "$SECOND_RACE_STATUS" | sort -n | tr '\n' ' ' | sed 's/ $//')" 'one concurrent checkout must win and one must be rejected'
if [[ "$FIRST_RACE_STATUS" == 409 ]]; then
  SOLD_OUT_BODY="$(cat "$TEMP_DIR/race-first.json")"
else
  SOLD_OUT_BODY="$(cat "$TEMP_DIR/race-second.json")"
fi
assert_equal FLASH_SALE_SOLD_OUT "$(json_field code "$SOLD_OUT_BODY")" 'the losing concurrent checkout must report sold out'
assert_equal 1 "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "SELECT \"sold_quantity\" FROM \"flash_sale_stocks\" WHERE \"flash_sale_id\" = $CONCURRENCY_SALE_ID AND \"product_sku_id\" = $SOLD_OUT_SKU_ID;")" 'the sale allocation must be sold once'
assert_equal 0 "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "SELECT \"reserved_quantity\" FROM \"inventory_stocks\" WHERE \"product_sku_id\" = $SOLD_OUT_SKU_ID;")" 'the winning reservation must be finalized'
echo "  PASS flashSaleId=$CONCURRENCY_SALE_ID code=FLASH_SALE_SOLD_OUT"

echo 'Scenario G — one user cannot claim the same sale item through a second cart'
request_as_user POST "http://localhost:$CART_API_PORT/api/cart-items" 401 \
  "{\"productSkuId\":$USER_LIMIT_SKU_ID,\"quantity\":1}"
assert_equal 201 "$HTTP_STATUS" 'first per-user cart should be created'
FIRST_LIMIT_CART_ID="$(json_field id "$HTTP_BODY")"
request_as_user POST "http://localhost:$CART_API_PORT/api/carts/$FIRST_LIMIT_CART_ID/checkout" 401 '' \
  '55555555-5555-4555-8555-555555555555'
assert_equal 200 "$HTTP_STATUS" 'the first per-user checkout should succeed'

request_as_user POST "http://localhost:$CART_API_PORT/api/cart-items" 401 \
  "{\"productSkuId\":$USER_LIMIT_SKU_ID,\"quantity\":1}"
assert_equal 201 "$HTTP_STATUS" 'a checked-out cart should allow a new active cart'
SECOND_LIMIT_CART_ID="$(json_field id "$HTTP_BODY")"
request_as_user POST "http://localhost:$CART_API_PORT/api/carts/$SECOND_LIMIT_CART_ID/checkout" 401 '' \
  '66666666-6666-4666-8666-666666666666'
assert_equal 409 "$HTTP_STATUS" 'the second per-user checkout should fail'
assert_equal FLASH_SALE_LIMIT_REACHED "$(json_field code "$HTTP_BODY")" 'the second cart must report the per-user limit'
assert_equal 1 "$(db_value postgres-inventory "$INVENTORY_DATABASE_NAME" "SELECT COUNT(*) FROM \"stock_reservations\" WHERE \"user_id\" = 401 AND \"flash_sale_id\" = $CONCURRENCY_SALE_ID;")" 'the user must have one sale reservation'
assert_equal 1 "$(db_value postgres-order "$ORDER_DATABASE_NAME" 'SELECT COUNT(*) FROM "orders" WHERE "user_id" = 401;')" 'the user must have one sale order'
echo "  PASS userId=401 code=FLASH_SALE_LIMIT_REACHED"

echo
echo 'All product, flash sale, and checkout E2E scenarios passed.'
