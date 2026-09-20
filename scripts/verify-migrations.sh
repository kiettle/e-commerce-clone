#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

cleanup() {
  docker compose exec -T postgres-cart psql -U postgres -d postgres \
    -c 'DROP DATABASE IF EXISTS verify_empty_cart WITH (FORCE);' >/dev/null || true
  docker compose exec -T postgres-order psql -U postgres -d postgres \
    -c 'DROP DATABASE IF EXISTS verify_empty_order WITH (FORCE);' >/dev/null || true
  docker compose exec -T postgres-inventory psql -U postgres -d postgres \
    -c 'DROP DATABASE IF EXISTS verify_empty_inventory WITH (FORCE);' >/dev/null || true
  docker compose exec -T postgres-cart psql -U postgres -d postgres \
    -c 'DROP DATABASE IF EXISTS verify_existing_cart WITH (FORCE);' >/dev/null || true
  docker compose exec -T postgres-order psql -U postgres -d postgres \
    -c 'DROP DATABASE IF EXISTS verify_existing_order WITH (FORCE);' >/dev/null || true
  docker compose exec -T postgres-inventory psql -U postgres -d postgres \
    -c 'DROP DATABASE IF EXISTS verify_existing_inventory WITH (FORCE);' >/dev/null || true
}

on_exit() {
  local exit_code=$?
  trap - EXIT
  cleanup
  exit "$exit_code"
}

trap on_exit EXIT

docker compose up -d postgres-cart postgres-order postgres-inventory

for service in postgres-cart postgres-order postgres-inventory; do
  for attempt in {1..30}; do
    if docker compose exec -T "$service" pg_isready -U postgres >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
done

cleanup

echo "Deploying cart, order, and inventory migrations to empty databases..."
docker compose exec -T postgres-cart psql -U postgres -d postgres \
  -c 'CREATE DATABASE verify_empty_cart;' >/dev/null
docker compose exec -T postgres-order psql -U postgres -d postgres \
  -c 'CREATE DATABASE verify_empty_order;' >/dev/null
docker compose exec -T postgres-inventory psql -U postgres -d postgres \
  -c 'CREATE DATABASE verify_empty_inventory;' >/dev/null
CART_DATABASE_URL='postgresql://postgres:postgres@localhost:5002/verify_empty_cart' \
  npm run prisma:cart:deploy
ORDER_DATABASE_URL='postgresql://postgres:postgres@localhost:5004/verify_empty_order' \
  npm run prisma:order:deploy
INVENTORY_DATABASE_URL='postgresql://postgres:postgres@localhost:5003/verify_empty_inventory' \
  npm run prisma:inventory:deploy

echo "Applying new migrations over schemas containing existing rows..."
docker compose exec -T postgres-cart psql -U postgres -d postgres \
  -c 'CREATE DATABASE verify_existing_cart;' >/dev/null
docker compose exec -T postgres-order psql -U postgres -d postgres \
  -c 'CREATE DATABASE verify_existing_order;' >/dev/null
docker compose exec -T postgres-inventory psql -U postgres -d postgres \
  -c 'CREATE DATABASE verify_existing_inventory;' >/dev/null

docker compose exec -T postgres-cart psql -U postgres -d verify_existing_cart \
  -v ON_ERROR_STOP=1 < apps/cart-service/prisma/migrations/20260707010000_init/migration.sql
docker compose exec -T postgres-cart psql -U postgres -d verify_existing_cart \
  -v ON_ERROR_STOP=1 -c \
  'INSERT INTO "carts" ("user_id", "status", "updated_at") VALUES (10, '\''ACTIVE'\'', NOW());
   INSERT INTO "cart_items" ("cart_id", "product_id", "product_name", "product_sku_id", "sku_code", "price", "quantity", "updated_at")
   VALUES (1, 1, '\''Existing item'\'', 100, '\''SKU-100'\'', 19.90, 1, NOW());' >/dev/null
docker compose exec -T postgres-cart psql -U postgres -d verify_existing_cart \
  -v ON_ERROR_STOP=1 < apps/cart-service/prisma/migrations/20260917010000_add_checkout_attempt/migration.sql
docker compose exec -T postgres-cart psql -U postgres -d verify_existing_cart \
  -v ON_ERROR_STOP=1 < apps/cart-service/prisma/migrations/20260920010000_commit_stock/migration.sql

docker compose exec -T postgres-order psql -U postgres -d verify_existing_order \
  -v ON_ERROR_STOP=1 < apps/order-service/prisma/migrations/20260707000000_init/migration.sql
docker compose exec -T postgres-order psql -U postgres -d verify_existing_order \
  -v ON_ERROR_STOP=1 -c \
  'INSERT INTO "orders" ("user_id", "total_amount", "updated_at") VALUES (10, 19.90, NOW());
   INSERT INTO "order_items" ("order_id", "product_name", "product_sku_id", "sku_code", "price", "quantity", "updated_at")
   VALUES (1, '\''Existing item'\'', 100, '\''SKU-100'\'', 19.90, 1, NOW());' >/dev/null
docker compose exec -T postgres-order psql -U postgres -d verify_existing_order \
  -v ON_ERROR_STOP=1 < apps/order-service/prisma/migrations/20260917010000_add_checkout_identity/migration.sql

docker compose exec -T postgres-inventory psql -U postgres -d verify_existing_inventory \
  -v ON_ERROR_STOP=1 < apps/inventory-service/prisma/migrations/20260627000000_init/migration.sql
docker compose exec -T postgres-inventory psql -U postgres -d verify_existing_inventory \
  -v ON_ERROR_STOP=1 -c \
  'INSERT INTO "inventory_stocks" ("product_id", "product_sku_id", "sku_code", "available_quantity", "reserved_quantity", "updated_at")
   VALUES (1, 100, '\''SKU-100'\'', 8, 2, NOW());
   INSERT INTO "stock_reservations" ("cart_id", "product_sku_id", "quantity", "status", "updated_at")
   VALUES (20, 100, 2, '\''RESERVED'\'', NOW());' >/dev/null
docker compose exec -T postgres-inventory psql -U postgres -d verify_existing_inventory \
  -v ON_ERROR_STOP=1 < apps/inventory-service/prisma/migrations/20260920010000_commit_stock/migration.sql

cart_rows="$(docker compose exec -T postgres-cart psql -U postgres -d verify_existing_cart -Atq -c 'SELECT COUNT(*) FROM "carts";')"
order_rows="$(docker compose exec -T postgres-order psql -U postgres -d verify_existing_order -Atq -c 'SELECT COUNT(*) FROM "orders" WHERE "checkout_id" IS NULL;')"
inventory_rows="$(docker compose exec -T postgres-inventory psql -U postgres -d verify_existing_inventory -Atq -c 'SELECT COUNT(*) FROM "stock_reservations" WHERE "status" = '\''RESERVED'\'';')"
[[ "${cart_rows//[[:space:]]/}" == 1 ]]
[[ "${order_rows//[[:space:]]/}" == 1 ]]
[[ "${inventory_rows//[[:space:]]/}" == 1 ]]

echo "Deploying migrations to the existing local databases..."
npm run prisma:cart:deploy
npm run prisma:order:deploy
npm run prisma:inventory:deploy

echo "Migration verification passed for empty, populated legacy, and existing local databases."
