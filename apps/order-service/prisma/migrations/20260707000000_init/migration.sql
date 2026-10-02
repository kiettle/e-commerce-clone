CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'CONFIRMED', 'CANCELLED', 'SHIPPED', 'DELIVERED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

CREATE TABLE "orders" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "total_amount" DECIMAL(10, 2) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CREATED',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "shipping_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_items" (
    "id" BIGSERIAL NOT NULL,
    "order_id" BIGINT NOT NULL,
    "product_name" VARCHAR(255) NOT NULL,
    "product_sku_id" BIGINT NOT NULL,
    "sku_code" VARCHAR(255) NOT NULL,
    "image_url" TEXT,
    "price" DECIMAL(10, 2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");
CREATE INDEX "orders_status_idx" ON "orders"("status");
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");
CREATE INDEX "order_items_product_sku_id_idx" ON "order_items"("product_sku_id");

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
