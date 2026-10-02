CREATE TYPE "CheckoutStatus" AS ENUM (
    'STARTED',
    'STOCK_RESERVED',
    'ORDER_CONFIRMED',
    'COMPLETED',
    'COMPENSATING',
    'FAILED',
    'RECONCILIATION_REQUIRED'
);

CREATE TYPE "ReconciliationAction" AS ENUM (
    'RESERVE_STOCK',
    'CHECK_ORDER',
    'RELEASE_STOCK',
    'COMPLETE_CART'
);

CREATE TABLE "checkout_attempts" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "cart_id" BIGINT NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "items_snapshot" JSONB NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'STARTED',
    "order_id" BIGINT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "last_error" TEXT,
    "reconciliation_action" "ReconciliationAction",
    "lease_owner" TEXT,
    "lease_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checkout_attempts_cart_id_key" ON "checkout_attempts"("cart_id");
CREATE UNIQUE INDEX "checkout_attempts_user_id_idempotency_key_key"
    ON "checkout_attempts"("user_id", "idempotency_key");
CREATE INDEX "checkout_attempts_status_next_retry_at_idx"
    ON "checkout_attempts"("status", "next_retry_at");

ALTER TABLE "checkout_attempts"
    ADD CONSTRAINT "checkout_attempts_cart_id_fkey"
    FOREIGN KEY ("cart_id") REFERENCES "carts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
