ALTER TABLE "checkout_attempts"
ADD COLUMN "request_hash_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "checkout_attempts"
ALTER COLUMN "request_hash_version" SET DEFAULT 2;
