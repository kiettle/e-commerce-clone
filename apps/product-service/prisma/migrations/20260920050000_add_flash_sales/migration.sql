CREATE TYPE "FlashSaleStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'CANCELLED');

CREATE TABLE "flash_sales" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "FlashSaleStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flash_sales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "flash_sales_time_window_check" CHECK ("ends_at" > "starts_at")
);

CREATE TABLE "flash_sale_items" (
    "id" BIGSERIAL NOT NULL,
    "flash_sale_id" BIGINT NOT NULL,
    "product_sku_id" BIGINT NOT NULL,
    "regular_price" DECIMAL(10, 2) NOT NULL,
    "sale_price" DECIMAL(10, 2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flash_sale_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "flash_sale_items_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "flash_sale_items_regular_price_check" CHECK ("regular_price" > 0),
    CONSTRAINT "flash_sale_items_sale_price_check" CHECK (
        "sale_price" > 0 AND "sale_price" < "regular_price"
    ),
    CONSTRAINT "flash_sale_items_flash_sale_id_fkey"
        FOREIGN KEY ("flash_sale_id") REFERENCES "flash_sales"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "flash_sale_items_product_sku_id_fkey"
        FOREIGN KEY ("product_sku_id") REFERENCES "product_skus"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "flash_sales_status_starts_at_ends_at_idx"
    ON "flash_sales"("status", "starts_at", "ends_at");

CREATE UNIQUE INDEX "flash_sale_items_flash_sale_id_product_sku_id_key"
    ON "flash_sale_items"("flash_sale_id", "product_sku_id");

CREATE INDEX "flash_sale_items_product_sku_id_idx"
    ON "flash_sale_items"("product_sku_id");
