ALTER TABLE "product_outbox_events"
    ADD COLUMN "aggregate_type" VARCHAR(100),
    ADD COLUMN "aggregate_version" INTEGER;

UPDATE "product_outbox_events"
SET
    "aggregate_type" = 'PRODUCT',
    "aggregate_version" = 1;

ALTER TABLE "product_outbox_events"
    ALTER COLUMN "aggregate_type" SET NOT NULL,
    ALTER COLUMN "aggregate_version" SET NOT NULL;

CREATE UNIQUE INDEX "product_outbox_events_aggregate_identity_key"
    ON "product_outbox_events"("aggregate_type", "aggregate_id", "aggregate_version");
