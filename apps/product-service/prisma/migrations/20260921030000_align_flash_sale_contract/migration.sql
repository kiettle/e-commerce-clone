ALTER TABLE "flash_sales"
ADD COLUMN "created_by" BIGINT;

ALTER TABLE "flash_sale_items"
ADD COLUMN "max_quantity_per_user" INTEGER NOT NULL DEFAULT 1,
ADD CONSTRAINT "flash_sale_items_max_quantity_per_user_check"
CHECK ("max_quantity_per_user" = 1);
