#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${GATEWAY_URL:-http://localhost:4000}"
EMAIL="${DEMO_EMAIL:-testuser@test.com}"
PASSWORD="${DEMO_PASSWORD:-password123}"
QUANTITY="${DEMO_QUANTITY:-1}"
IDEMPOTENCY_KEY="${DEMO_IDEMPOTENCY_KEY:-$(node -e 'process.stdout.write(crypto.randomUUID())')}"

json_field() {
  node -e '
const path = process.argv[1].split(".");
let value = JSON.parse(process.argv[2]);
for (const key of path) {
  value = value?.[key];
}
if (value === undefined || value === null) {
  process.exit(1);
}
process.stdout.write(String(value));
' "$1" "$2"
}

echo "Logging in through gateway..."
LOGIN_RESPONSE="$(
  curl -fsS \
    -H "Content-Type: application/json" \
    -X POST "$BASE_URL/api/auth/login" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
)"
TOKEN="$(json_field token "$LOGIN_RESPONSE")"

echo "Loading products through gateway..."
PRODUCTS_RESPONSE="$(
  curl -fsS \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/api/products"
)"
SKU_ID="${DEMO_PRODUCT_SKU_ID:-$(json_field "0.skus.0.id" "$PRODUCTS_RESPONSE")}"

echo "Adding SKU $SKU_ID to cart..."
ADD_CART_RESPONSE="$(
  curl -fsS \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -X POST "$BASE_URL/api/cart-items" \
    -d "{\"productSkuId\":$SKU_ID,\"quantity\":$QUANTITY}"
)"
CART_ID="$(json_field id "$ADD_CART_RESPONSE")"

echo "Reading active cart $CART_ID..."
curl -fsS \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/carts/me"
echo

echo "Checking out cart $CART_ID..."
CHECKOUT_RESPONSE="$(
  curl -fsS \
    -H "Authorization: Bearer $TOKEN" \
    -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
    -X POST "$BASE_URL/api/carts/$CART_ID/checkout"
)"
ORDER_ID="$(json_field orderId "$CHECKOUT_RESPONSE")"
CHECKOUT_ID="$(json_field checkoutId "$CHECKOUT_RESPONSE")"

echo "$CHECKOUT_RESPONSE"
echo
echo "Checkout completed. checkoutId=$CHECKOUT_ID orderId=$ORDER_ID"
