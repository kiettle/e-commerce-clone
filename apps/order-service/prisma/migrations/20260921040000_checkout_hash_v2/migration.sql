ALTER TABLE "orders"
ADD COLUMN "request_hash_version" INTEGER;

ALTER TABLE "order_items"
ADD COLUMN "regular_price" DECIMAL(10,2),
ADD COLUMN "price_source" VARCHAR(32),
ADD COLUMN "flash_sale_id" BIGINT,
ADD COLUMN "flash_sale_item_id" BIGINT,
ADD COLUMN "sale_ends_at" TIMESTAMP(3);
