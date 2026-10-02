WITH demo_stock ("product_id", "product_sku_id", "sku_code", "available_quantity") AS (
    VALUES
        (1, 1, 'IPH15-BLK-128', 100),
        (1, 2, 'IPH15-BLK-256', 100),
        (1, 3, 'IPH15-BLU-128', 100),
        (1, 4, 'IPH15-WHT-256', 100),
        (2, 5, 'IPH15PRO-TIT-256', 100),
        (2, 6, 'IPH15PRO-TIT-512', 100),
        (2, 7, 'IPH15PRO-BLK-512', 100),
        (3, 8, 'S24-BLK-128', 100),
        (3, 9, 'S24-VIO-256', 100),
        (3, 10, 'S24-GRY-256', 100),
        (4, 11, 'S24U-BLK-256', 100),
        (4, 12, 'S24U-GRY-512', 100),
        (4, 13, 'S24U-VIO-1TB', 100),
        (5, 14, 'MBP14-SLV-512-18', 100),
        (5, 15, 'MBP14-GRY-1TB-18', 100),
        (5, 16, 'MBP14-SLV-1TB-36', 100),
        (6, 17, 'MBA13-SLV-256-8', 100),
        (6, 18, 'MBA13-MID-512-16', 100),
        (6, 19, 'MBA13-STR-512-16', 100),
        (7, 20, 'XPS13-PLT-256-16', 100),
        (7, 21, 'XPS13-PLT-512-16', 100),
        (7, 22, 'XPS13-GRY-1TB-32', 100),
        (8, 23, 'XPS15-PLT-512-16', 100),
        (8, 24, 'XPS15-PLT-1TB-32', 100),
        (9, 25, 'IPADPRO-SLV-128-WIFI', 100),
        (9, 26, 'IPADPRO-GRY-256-WIFI', 100),
        (9, 27, 'IPADPRO-SLV-512-CEL', 100),
        (10, 28, 'TABS9-BLK-128-WIFI', 100),
        (10, 29, 'TABS9-BEI-256-5G', 100)
),
inserted_stock AS (
    INSERT INTO "inventory_stocks" (
        "product_id",
        "product_sku_id",
        "sku_code",
        "status",
        "available_quantity",
        "reserved_quantity",
        "updated_at"
    )
    SELECT
        "product_id",
        "product_sku_id",
        "sku_code",
        'ACTIVE'::"InventoryStockStatus",
        "available_quantity",
        0,
        NOW()
    FROM demo_stock
    ON CONFLICT ("product_sku_id") DO NOTHING
    RETURNING "product_sku_id", "available_quantity"
)
INSERT INTO "stock_transactions" ("product_sku_id", "type", "quantity")
SELECT
    "product_sku_id",
    'INITIALIZE'::"StockTransactionType",
    "available_quantity"
FROM inserted_stock;

WITH demo_stock ("product_id", "product_sku_id", "sku_code", "available_quantity") AS (
    VALUES
        (1, 1, 'IPH15-BLK-128', 100),
        (1, 2, 'IPH15-BLK-256', 100),
        (1, 3, 'IPH15-BLU-128', 100),
        (1, 4, 'IPH15-WHT-256', 100),
        (2, 5, 'IPH15PRO-TIT-256', 100),
        (2, 6, 'IPH15PRO-TIT-512', 100),
        (2, 7, 'IPH15PRO-BLK-512', 100),
        (3, 8, 'S24-BLK-128', 100),
        (3, 9, 'S24-VIO-256', 100),
        (3, 10, 'S24-GRY-256', 100),
        (4, 11, 'S24U-BLK-256', 100),
        (4, 12, 'S24U-GRY-512', 100),
        (4, 13, 'S24U-VIO-1TB', 100),
        (5, 14, 'MBP14-SLV-512-18', 100),
        (5, 15, 'MBP14-GRY-1TB-18', 100),
        (5, 16, 'MBP14-SLV-1TB-36', 100),
        (6, 17, 'MBA13-SLV-256-8', 100),
        (6, 18, 'MBA13-MID-512-16', 100),
        (6, 19, 'MBA13-STR-512-16', 100),
        (7, 20, 'XPS13-PLT-256-16', 100),
        (7, 21, 'XPS13-PLT-512-16', 100),
        (7, 22, 'XPS13-GRY-1TB-32', 100),
        (8, 23, 'XPS15-PLT-512-16', 100),
        (8, 24, 'XPS15-PLT-1TB-32', 100),
        (9, 25, 'IPADPRO-SLV-128-WIFI', 100),
        (9, 26, 'IPADPRO-GRY-256-WIFI', 100),
        (9, 27, 'IPADPRO-SLV-512-CEL', 100),
        (10, 28, 'TABS9-BLK-128-WIFI', 100),
        (10, 29, 'TABS9-BEI-256-5G', 100)
)
UPDATE "inventory_stocks" AS inventory_stock
SET
    "product_id" = demo_stock."product_id",
    "sku_code" = demo_stock."sku_code",
    "status" = 'ACTIVE'::"InventoryStockStatus",
    "available_quantity" = GREATEST(
        inventory_stock."available_quantity",
        demo_stock."available_quantity"
    ),
    "updated_at" = NOW()
FROM demo_stock
WHERE inventory_stock."product_sku_id" = demo_stock."product_sku_id";

