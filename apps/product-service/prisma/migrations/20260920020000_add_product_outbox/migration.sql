CREATE TYPE "ProductOutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

CREATE TABLE "product_outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_id" BIGINT NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "partition_key" VARCHAR(255) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "status" "ProductOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "lease_owner" VARCHAR(255),
    "lease_until" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_outbox_events_status_next_attempt_at_occurred_at_idx"
    ON "product_outbox_events"("status", "next_attempt_at", "occurred_at");

CREATE INDEX "product_outbox_events_lease_until_idx"
    ON "product_outbox_events"("lease_until");

CREATE INDEX "product_outbox_events_aggregate_id_occurred_at_idx"
    ON "product_outbox_events"("aggregate_id", "occurred_at");
