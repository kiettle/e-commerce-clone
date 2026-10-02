ALTER TABLE "processed_product_events"
ADD COLUMN "schema_version" INTEGER,
ADD COLUMN "payload_hash" CHAR(64);

ALTER TABLE "processed_product_events"
ADD CONSTRAINT "processed_product_events_payload_hash_format_check"
CHECK (
  "payload_hash" IS NULL
  OR "payload_hash" ~ '^[0-9a-f]{64}$'
);
