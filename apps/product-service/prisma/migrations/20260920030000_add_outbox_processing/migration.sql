ALTER TYPE "ProductOutboxStatus" ADD VALUE 'PROCESSING';

DROP INDEX "product_outbox_events_status_next_attempt_at_occurred_at_idx";

CREATE INDEX "product_outbox_events_status_next_attempt_at_created_at_id_idx"
    ON "product_outbox_events"("status", "next_attempt_at", "created_at", "id");

CREATE INDEX "product_outbox_events_status_lease_until_created_at_id_idx"
    ON "product_outbox_events"("status", "lease_until", "created_at", "id");
