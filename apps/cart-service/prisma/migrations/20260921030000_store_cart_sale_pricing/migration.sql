CREATE TYPE "CartItemPriceSource" AS ENUM ('REGULAR', 'FLASH_SALE');

ALTER TABLE "cart_items"
ADD COLUMN "regular_price" DECIMAL(10,2),
ADD COLUMN "price_source" "CartItemPriceSource" NOT NULL DEFAULT 'REGULAR',
ADD COLUMN "sale_ends_at" TIMESTAMP(3),
ADD COLUMN "max_per_user_quantity" INTEGER;

UPDATE "cart_items"
SET "regular_price" = "price",
    "price_source" = CASE
      WHEN "flash_sale_id" IS NULL THEN 'REGULAR'::"CartItemPriceSource"
      ELSE 'FLASH_SALE'::"CartItemPriceSource"
    END;

ALTER TABLE "cart_items"
ALTER COLUMN "regular_price" SET NOT NULL,
ADD CONSTRAINT "cart_items_regular_price_check"
CHECK ("regular_price" > 0),
ADD CONSTRAINT "cart_items_max_per_user_quantity_check"
CHECK ("max_per_user_quantity" IS NULL OR "max_per_user_quantity" > 0),
ADD CONSTRAINT "cart_items_price_source_context_check"
CHECK (
  ("price_source" = 'REGULAR' AND "flash_sale_id" IS NULL AND "flash_sale_item_id" IS NULL)
  OR
  ("price_source" = 'FLASH_SALE' AND "flash_sale_id" IS NOT NULL AND "flash_sale_item_id" IS NOT NULL)
);
