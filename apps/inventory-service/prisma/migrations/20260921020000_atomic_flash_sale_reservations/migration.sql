ALTER TABLE "flash_sale_stocks"
ADD COLUMN "user_limit" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sold_quantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "flash_sale_stocks"
ADD CONSTRAINT "flash_sale_stocks_user_limit_check"
CHECK ("user_limit" > 0),
ADD CONSTRAINT "flash_sale_stocks_counters_check"
CHECK (
  "reserved_quantity" >= 0
  AND "sold_quantity" >= 0
  AND "reserved_quantity" + "sold_quantity" <= "quantity_limit"
);

ALTER TABLE "inventory_stocks"
ADD CONSTRAINT "inventory_stocks_counters_check"
CHECK ("available_quantity" >= 0 AND "reserved_quantity" >= 0);

ALTER TABLE "stock_reservations"
ADD COLUMN "checkout_id" UUID,
ADD COLUMN "user_id" BIGINT,
ADD COLUMN "flash_sale_id" BIGINT,
ADD COLUMN "flash_sale_item_id" BIGINT;

ALTER TABLE "stock_reservations"
ADD CONSTRAINT "stock_reservations_quantity_check"
CHECK ("quantity" > 0),
ADD CONSTRAINT "stock_reservations_identity_pair_check"
CHECK (("checkout_id" IS NULL) = ("user_id" IS NULL)),
ADD CONSTRAINT "stock_reservations_sale_context_pair_check"
CHECK (("flash_sale_id" IS NULL) = ("flash_sale_item_id" IS NULL)),
ADD CONSTRAINT "stock_reservations_flash_sale_item_id_fkey"
FOREIGN KEY ("flash_sale_item_id")
REFERENCES "flash_sale_stocks"("flash_sale_item_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "stock_reservations_checkout_id_idx"
ON "stock_reservations"("checkout_id");

CREATE INDEX "stock_reservations_user_id_flash_sale_item_id_idx"
ON "stock_reservations"("user_id", "flash_sale_item_id");

CREATE UNIQUE INDEX "stock_reservations_active_user_sale_item_key"
ON "stock_reservations"("user_id", "flash_sale_item_id")
WHERE "flash_sale_item_id" IS NOT NULL
  AND "status" IN ('RESERVED', 'COMMITTED');
