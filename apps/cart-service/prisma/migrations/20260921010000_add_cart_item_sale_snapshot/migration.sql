ALTER TABLE "cart_items"
ADD COLUMN "flash_sale_id" BIGINT,
ADD COLUMN "flash_sale_item_id" BIGINT;

ALTER TABLE "cart_items"
ADD CONSTRAINT "cart_items_sale_context_pair_check"
CHECK (("flash_sale_id" IS NULL) = ("flash_sale_item_id" IS NULL));

CREATE INDEX "cart_items_flash_sale_id_idx" ON "cart_items"("flash_sale_id");
