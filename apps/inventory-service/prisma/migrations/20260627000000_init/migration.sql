CREATE TYPE "InventoryStockStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "StockReservationStatus" AS ENUM ('RESERVED', 'RELEASED');
CREATE TYPE "StockTransactionType" AS ENUM ('INITIALIZE', 'RESERVE', 'RELEASE');

CREATE TABLE "inventory_stocks" (
    "id" BIGSERIAL NOT NULL,
    "product_id" BIGINT NOT NULL,
    "product_sku_id" BIGINT NOT NULL,
    "sku_code" VARCHAR(255) NOT NULL,
    "status" "InventoryStockStatus" NOT NULL DEFAULT 'ACTIVE',
    "available_quantity" INTEGER NOT NULL,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_stocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_reservations" (
    "id" BIGSERIAL NOT NULL,
    "cart_id" BIGINT NOT NULL,
    "product_sku_id" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "released_at" TIMESTAMP(3),

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_transactions" (
    "id" BIGSERIAL NOT NULL,
    "product_sku_id" BIGINT NOT NULL,
    "cart_id" BIGINT,
    "type" "StockTransactionType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processed_product_events" (
    "event_id" VARCHAR(100) NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "product_id" BIGINT,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_product_events_pkey" PRIMARY KEY ("event_id")
);

CREATE UNIQUE INDEX "inventory_stocks_product_sku_id_key" ON "inventory_stocks"("product_sku_id");
CREATE INDEX "inventory_stocks_product_id_idx" ON "inventory_stocks"("product_id");
CREATE INDEX "inventory_stocks_status_idx" ON "inventory_stocks"("status");
CREATE UNIQUE INDEX "stock_reservations_cart_id_product_sku_id_key" ON "stock_reservations"("cart_id", "product_sku_id");
CREATE INDEX "stock_reservations_status_idx" ON "stock_reservations"("status");
CREATE INDEX "stock_transactions_product_sku_id_idx" ON "stock_transactions"("product_sku_id");
CREATE INDEX "stock_transactions_cart_id_idx" ON "stock_transactions"("cart_id");
CREATE INDEX "processed_product_events_product_id_idx" ON "processed_product_events"("product_id");

ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_sku_id_fkey" FOREIGN KEY ("product_sku_id") REFERENCES "inventory_stocks"("product_sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_product_sku_id_fkey" FOREIGN KEY ("product_sku_id") REFERENCES "inventory_stocks"("product_sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;
