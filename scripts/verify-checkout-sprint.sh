#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${GATEWAY_URL:-http://localhost:4000}"
VERIFY_EMAIL="checkout-verify-$(date +%s)-$$@example.com"
VERIFY_PASSWORD='password123'
VERIFY_PASSWORD_HASH='$2b$12$7hoRZfJrRKD2nIm2vHLs7OBETy.LWenXXMLKf99W8M4PUwO6KB7fu'
VERIFY_USER_ID="9$(date +%s)"
RESPONSE_FILE="$(mktemp)"
HTTP_STATUS=""
HTTP_BODY=""
CART_IDS=()

cd "$ROOT_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
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
  local token="$3"
  local idempotency_key="${4:-}"
  local body="${5:-}"
  local args=(-sS -o "$RESPONSE_FILE" -w '%{http_code}' -X "$method")

  if [[ -n "$token" ]]; then
    args+=(-H "Authorization: Bearer $token")
  fi
  if [[ -n "$idempotency_key" ]]; then
    args+=(-H "Idempotency-Key: $idempotency_key")
  fi
  if [[ -n "$body" ]]; then
    args+=(-H 'Content-Type: application/json' -d "$body")
  fi

  HTTP_STATUS="$(curl "${args[@]}" "$url")"
  HTTP_BODY="$(cat "$RESPONSE_FILE")"
}

assert_equal() {
  local expected="$1"
  local actual="$2"
  local message="$3"

  if [[ "$actual" != "$expected" ]]; then
    echo "FAILED: $message" >&2
    echo "Expected: $expected" >&2
    echo "Actual:   $actual" >&2
    [[ -n "$HTTP_BODY" ]] && echo "Response: $HTTP_BODY" >&2
    exit 1
  fi
}

db_value() {
  local service="$1"
  local database="$2"
  local sql="$3"

  docker compose exec -T "$service" \
    psql -U postgres -d "$database" -Atq -c "$sql" | tr -d '[:space:]'
}

cleanup() {
  local cart_list

  rm -f "$RESPONSE_FILE"

  if [[ "${#CART_IDS[@]}" -gt 0 ]]; then
    cart_list="$(IFS=,; echo "${CART_IDS[*]}")"
    docker compose exec -T postgres-inventory psql -U postgres -d inventory_db \
      -v ON_ERROR_STOP=1 -c \
      "WITH restored AS (
         SELECT \"product_sku_id\", SUM(\"quantity\")::integer AS quantity
         FROM \"stock_reservations\"
         WHERE \"cart_id\" IN ($cart_list) AND \"status\" = 'RESERVED'
         GROUP BY \"product_sku_id\"
       )
       UPDATE \"inventory_stocks\" AS stock
       SET \"available_quantity\" = stock.\"available_quantity\" + restored.quantity,
           \"reserved_quantity\" = stock.\"reserved_quantity\" - restored.quantity,
           \"updated_at\" = NOW()
       FROM restored
       WHERE stock.\"product_sku_id\" = restored.\"product_sku_id\";
       DELETE FROM \"stock_transactions\" WHERE \"cart_id\" IN ($cart_list);
       DELETE FROM \"stock_reservations\" WHERE \"cart_id\" IN ($cart_list);" \
      >/dev/null 2>&1 || true
  fi

  docker compose exec -T postgres-order psql -U postgres -d order_db \
    -c "DELETE FROM \"orders\" WHERE \"user_id\" = $VERIFY_USER_ID;" \
    >/dev/null 2>&1 || true
  docker compose exec -T postgres-cart psql -U postgres -d cart_db \
    -c "DELETE FROM \"checkout_attempts\" WHERE \"user_id\" = $VERIFY_USER_ID;
        DELETE FROM \"carts\" WHERE \"user_id\" = $VERIFY_USER_ID;" \
    >/dev/null 2>&1 || true
  docker compose exec -T postgres-auth psql -U postgres -d auth_db \
    -c "DELETE FROM \"users\" WHERE \"id\" = $VERIFY_USER_ID;" \
    >/dev/null 2>&1 || true
}

trap cleanup EXIT

add_item_to_active_cart() {
  local token="$1"
  local sku_id="$2"

  request POST "$BASE_URL/api/cart-items" "$token" '' \
    "{\"productSkuId\":$sku_id,\"quantity\":1}"
  assert_equal 201 "$HTTP_STATUS" 'adding an item should return 201'
  json_field id "$HTTP_BODY"
}

require_command curl
require_command docker
require_command node

if ! curl -fsS "$BASE_URL/health" >/dev/null; then
  echo "Gateway is not available at $BASE_URL." >&2
  echo "Start the demo with ORDER_DEMO_LOST_RESPONSE_AFTER=1 npm run demo" >&2
  exit 1
fi

docker compose exec -T postgres-auth psql -U postgres -d auth_db \
  -v ON_ERROR_STOP=1 -c \
  "INSERT INTO \"users\" (\"id\", \"email\", \"password\", \"role\")
   VALUES ($VERIFY_USER_ID, '$VERIFY_EMAIL', '$VERIFY_PASSWORD_HASH', 'USER');" \
  >/dev/null

request POST "$BASE_URL/api/auth/login" '' '' \
  "{\"email\":\"$VERIFY_EMAIL\",\"password\":\"$VERIFY_PASSWORD\"}"
assert_equal 201 "$HTTP_STATUS" 'login should return 201'
TOKEN="$(json_field token "$HTTP_BODY")"

request GET "$BASE_URL/api/products" "$TOKEN"
assert_equal 200 "$HTTP_STATUS" 'product lookup should return 200'
SKU_ID="${DEMO_PRODUCT_SKU_ID:-$(json_field '0.skus.0.id' "$HTTP_BODY")}"

echo "Scenario A — normal replay"
CART_1_ID="$(add_item_to_active_cart "$TOKEN" "$SKU_ID")"
CART_IDS+=("$CART_1_ID")
KEY_A="$(node -e 'process.stdout.write(crypto.randomUUID())')"

request POST "$BASE_URL/api/carts/$CART_1_ID/checkout" "$TOKEN" "$KEY_A"
assert_equal 200 "$HTTP_STATUS" 'first checkout should complete'
CHECKOUT_A="$(json_field checkoutId "$HTTP_BODY")"
ORDER_A="$(json_field orderId "$HTTP_BODY")"
assert_equal COMPLETED "$(json_field status "$HTTP_BODY")" 'checkout should be completed'

request POST "$BASE_URL/api/carts/$CART_1_ID/checkout" "$TOKEN" "$KEY_A"
assert_equal 200 "$HTTP_STATUS" 'completed replay should return 200'
assert_equal "$CHECKOUT_A" "$(json_field checkoutId "$HTTP_BODY")" 'replay checkout ID must match'
assert_equal "$ORDER_A" "$(json_field orderId "$HTTP_BODY")" 'replay order ID must match'
assert_equal 1 "$(db_value postgres-order order_db "SELECT COUNT(*) FROM \"orders\" WHERE \"checkout_id\" = '$CHECKOUT_A';")" 'replay must leave one order'
assert_equal 1:1 "$(db_value postgres-inventory inventory_db "SELECT COUNT(*) || ':' || COUNT(DISTINCT \"product_sku_id\") FROM \"stock_reservations\" WHERE \"cart_id\" = $CART_1_ID;")" 'cart must have one reservation per SKU'
echo "  PASS checkoutId=$CHECKOUT_A orderId=$ORDER_A"

echo "Scenario B — conflicting key reuse"
CART_2_ID="$(add_item_to_active_cart "$TOKEN" "$SKU_ID")"
CART_IDS+=("$CART_2_ID")
request POST "$BASE_URL/api/carts/$CART_2_ID/checkout" "$TOKEN" "$KEY_A"
assert_equal 409 "$HTTP_STATUS" 'reusing key A for cart 2 should return 409'
echo "  PASS cartId=$CART_2_ID returned 409"

echo "Scenario C — lost order response"
KEY_C="$(node -e 'process.stdout.write(crypto.randomUUID())')"
request POST "$BASE_URL/api/carts/$CART_2_ID/checkout" "$TOKEN" "$KEY_C"
if [[ "$HTTP_STATUS" != 202 ]]; then
  echo "FAILED: lost-response checkout should return 202." >&2
  echo "Start order-service with ORDER_DEMO_LOST_RESPONSE_AFTER=1." >&2
  echo "Actual HTTP status: $HTTP_STATUS" >&2
  echo "Response: $HTTP_BODY" >&2
  exit 1
fi
CHECKOUT_C="$(json_field checkoutId "$HTTP_BODY")"
assert_equal RECONCILIATION_REQUIRED "$(json_field status "$HTTP_BODY")" 'lost response should require reconciliation'
assert_equal RECONCILIATION_REQUIRED:CHECK_ORDER "$(db_value postgres-cart cart_db "SELECT \"status\"::text || ':' || \"reconciliation_action\"::text FROM \"checkout_attempts\" WHERE \"id\" = '$CHECKOUT_C';")" 'attempt must persist CHECK_ORDER'
assert_equal 1 "$(db_value postgres-order order_db "SELECT COUNT(*) FROM \"orders\" WHERE \"checkout_id\" = '$CHECKOUT_C';")" 'lost response must still create one order'
assert_equal 1 "$(db_value postgres-inventory inventory_db "SELECT COUNT(*) FROM \"stock_reservations\" WHERE \"cart_id\" = $CART_2_ID AND \"status\" = 'RESERVED';")" 'inventory must remain reserved'
RESERVED_BEFORE_COMMIT="$(db_value postgres-inventory inventory_db "SELECT \"reserved_quantity\" FROM \"inventory_stocks\" WHERE \"product_sku_id\" = $SKU_ID;")"
ORDER_C="$(db_value postgres-order order_db "SELECT \"id\" FROM \"orders\" WHERE \"checkout_id\" = '$CHECKOUT_C';")"

request GET "$BASE_URL/api/checkouts/$CHECKOUT_C" "$TOKEN"
assert_equal 200 "$HTTP_STATUS" 'pending checkout status should be readable'
assert_equal RECONCILIATION_REQUIRED "$(json_field status "$HTTP_BODY")" 'status endpoint should report pending'

request POST "$BASE_URL/api/carts/$CART_2_ID/checkout" "$TOKEN" "$KEY_C"
assert_equal 200 "$HTTP_STATUS" 'retry should resolve the existing order'
assert_equal "$CHECKOUT_C" "$(json_field checkoutId "$HTTP_BODY")" 'retry checkout ID must match'
assert_equal "$ORDER_C" "$(json_field orderId "$HTTP_BODY")" 'retry must return the existing order'
assert_equal 1 "$(db_value postgres-order order_db "SELECT COUNT(*) FROM \"orders\" WHERE \"checkout_id\" = '$CHECKOUT_C';")" 'retry must not duplicate the order'
assert_equal CHECKED_OUT "$(db_value postgres-cart cart_db "SELECT \"status\" FROM \"carts\" WHERE \"id\" = $CART_2_ID;")" 'retry must complete the cart'
assert_equal COMMITTED "$(db_value postgres-inventory inventory_db "SELECT \"status\" FROM \"stock_reservations\" WHERE \"cart_id\" = $CART_2_ID AND \"product_sku_id\" = $SKU_ID;")" 'successful stock must be committed'
assert_equal "$((RESERVED_BEFORE_COMMIT - 1))" "$(db_value postgres-inventory inventory_db "SELECT \"reserved_quantity\" FROM \"inventory_stocks\" WHERE \"product_sku_id\" = $SKU_ID;")" 'commit must decrement reserved quantity'
echo "  PASS checkoutId=$CHECKOUT_C orderId=$ORDER_C"

echo
echo "All checkout sprint scenarios passed."
