ALTER TABLE "orders"
    ADD COLUMN "checkout_id" UUID,
    ADD COLUMN "cart_id" BIGINT,
    ADD COLUMN "request_hash" CHAR(64);

CREATE UNIQUE INDEX "orders_checkout_id_key" ON "orders"("checkout_id");
CREATE INDEX "orders_cart_id_idx" ON "orders"("cart_id");
