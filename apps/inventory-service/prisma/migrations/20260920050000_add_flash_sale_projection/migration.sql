CREATE TABLE "flash_sale_stocks" (
    "id" BIGSERIAL NOT NULL,
    "flash_sale_id" BIGINT NOT NULL,
    "flash_sale_item_id" BIGINT NOT NULL,
    "product_sku_id" BIGINT NOT NULL,
    "original_price" DECIMAL(10,2) NOT NULL,
    "sale_price" DECIMAL(10,2) NOT NULL,
    "quantity_limit" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "flash_sale_stocks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "flash_sale_stocks_quantity_limit_check" CHECK ("quantity_limit" > 0),
    CONSTRAINT "flash_sale_stocks_price_check" CHECK (
      "sale_price" > 0 AND "original_price" > "sale_price"
    ),
    CONSTRAINT "flash_sale_stocks_time_check" CHECK ("starts_at" < "ends_at")
);

CREATE TABLE "processed_flash_sale_events" (
    "event_id" VARCHAR(100) NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "flash_sale_id" BIGINT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "processed_flash_sale_events_pkey" PRIMARY KEY ("event_id"),
    CONSTRAINT "processed_flash_sale_events_payload_hash_format_check"
      CHECK ("payload_hash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "flash_sale_stocks_flash_sale_item_id_key"
ON "flash_sale_stocks"("flash_sale_item_id");

CREATE UNIQUE INDEX "flash_sale_stocks_flash_sale_id_product_sku_id_key"
ON "flash_sale_stocks"("flash_sale_id", "product_sku_id");

CREATE INDEX "flash_sale_stocks_flash_sale_id_idx"
ON "flash_sale_stocks"("flash_sale_id");

CREATE INDEX "flash_sale_stocks_product_sku_id_starts_at_ends_at_idx"
ON "flash_sale_stocks"("product_sku_id", "starts_at", "ends_at");

CREATE INDEX "processed_flash_sale_events_flash_sale_id_idx"
ON "processed_flash_sale_events"("flash_sale_id");
