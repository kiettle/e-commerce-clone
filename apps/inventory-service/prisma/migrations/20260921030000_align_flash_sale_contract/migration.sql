ALTER TYPE "StockReservationStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "stock_reservations"
ADD COLUMN "expires_at" TIMESTAMP(3);

ALTER TABLE "flash_sale_stocks"
ALTER COLUMN "original_price" DROP NOT NULL,
ALTER COLUMN "sale_price" DROP NOT NULL,
DROP CONSTRAINT "flash_sale_stocks_user_limit_check",
ADD CONSTRAINT "flash_sale_stocks_user_limit_check" CHECK ("user_limit" = 1);
