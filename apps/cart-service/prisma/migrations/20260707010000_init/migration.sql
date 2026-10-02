CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CHECKED_OUT', 'ABANDONED');

CREATE TABLE "carts" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cart_items" (
    "id" BIGSERIAL NOT NULL,
    "cart_id" BIGINT NOT NULL,
    "product_id" BIGINT NOT NULL,
    "product_name" VARCHAR(255) NOT NULL,
    "image_url" TEXT,
    "product_sku_id" BIGINT NOT NULL,
    "sku_code" VARCHAR(255) NOT NULL,
    "price" DECIMAL(10, 2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "carts_user_id_idx" ON "carts"("user_id");
CREATE INDEX "carts_status_idx" ON "carts"("status");
CREATE UNIQUE INDEX "carts_user_id_active_key" ON "carts"("user_id") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "cart_items_cart_id_product_sku_id_key" ON "cart_items"("cart_id", "product_sku_id");
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items"("cart_id");
CREATE INDEX "cart_items_product_sku_id_idx" ON "cart_items"("product_sku_id");

ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
