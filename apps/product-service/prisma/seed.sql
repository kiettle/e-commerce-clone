INSERT INTO "categories" ("id", "name", "slug")
VALUES
    (1, 'Smartphones', 'smartphones'),
    (2, 'Laptops', 'laptops'),
    (3, 'Tablets', 'tablets'),
    (4, 'Accessories', 'accessories')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "products" (
    "id",
    "name",
    "description",
    "image_url",
    "category_id",
    "seller_id",
    "status"
)
VALUES
    (1, 'iPhone 15', 'Latest iPhone with A17 chip and advanced camera system', NULL, 1, 6, 'ACTIVE'),
    (2, 'iPhone 15 Pro', 'Pro model with titanium design and ProRAW camera', NULL, 1, 6, 'ACTIVE'),
    (3, 'Samsung Galaxy S24', 'Flagship Android phone with AI features', NULL, 1, 7, 'ACTIVE'),
    (4, 'Samsung Galaxy S24 Ultra', 'Ultimate performance with S Pen', NULL, 1, 7, 'ACTIVE'),
    (5, 'MacBook Pro 14"', 'Apple M3 Pro chip for professional workflows', NULL, 2, 6, 'ACTIVE'),
    (6, 'MacBook Air 13"', 'Lightweight with M2 chip and all-day battery', NULL, 2, 6, 'ACTIVE'),
    (7, 'Dell XPS 13', 'Premium Windows laptop with InfinityEdge display', NULL, 2, 8, 'ACTIVE'),
    (8, 'Dell XPS 15', 'Creator laptop with powerful graphics', NULL, 2, 8, 'ACTIVE'),
    (9, 'iPad Pro 12.9"', 'Most advanced iPad with M2 chip', NULL, 3, 6, 'ACTIVE'),
    (10, 'Samsung Galaxy Tab S9', 'Premium Android tablet with S Pen included', NULL, 3, 7, 'ACTIVE')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "product_skus" ("id", "product_id", "sku_code", "price", "status")
VALUES
    (1, 1, 'IPH15-BLK-128', 799.00, 'AVAILABLE'),
    (2, 1, 'IPH15-BLK-256', 899.00, 'AVAILABLE'),
    (3, 1, 'IPH15-BLU-128', 799.00, 'AVAILABLE'),
    (4, 1, 'IPH15-WHT-256', 899.00, 'AVAILABLE'),
    (5, 2, 'IPH15PRO-TIT-256', 999.00, 'AVAILABLE'),
    (6, 2, 'IPH15PRO-TIT-512', 1199.00, 'AVAILABLE'),
    (7, 2, 'IPH15PRO-BLK-512', 1199.00, 'AVAILABLE'),
    (8, 3, 'S24-BLK-128', 749.00, 'AVAILABLE'),
    (9, 3, 'S24-VIO-256', 849.00, 'AVAILABLE'),
    (10, 3, 'S24-GRY-256', 849.00, 'AVAILABLE'),
    (11, 4, 'S24U-BLK-256', 1199.00, 'AVAILABLE'),
    (12, 4, 'S24U-GRY-512', 1419.00, 'AVAILABLE'),
    (13, 4, 'S24U-VIO-1TB', 1659.00, 'AVAILABLE'),
    (14, 5, 'MBP14-SLV-512-18', 1999.00, 'AVAILABLE'),
    (15, 5, 'MBP14-GRY-1TB-18', 2499.00, 'AVAILABLE'),
    (16, 5, 'MBP14-SLV-1TB-36', 2999.00, 'AVAILABLE'),
    (17, 6, 'MBA13-SLV-256-8', 1099.00, 'AVAILABLE'),
    (18, 6, 'MBA13-MID-512-16', 1499.00, 'AVAILABLE'),
    (19, 6, 'MBA13-STR-512-16', 1499.00, 'AVAILABLE'),
    (20, 7, 'XPS13-PLT-256-16', 1299.00, 'AVAILABLE'),
    (21, 7, 'XPS13-PLT-512-16', 1499.00, 'AVAILABLE'),
    (22, 7, 'XPS13-GRY-1TB-32', 1899.00, 'AVAILABLE'),
    (23, 8, 'XPS15-PLT-512-16', 1799.00, 'AVAILABLE'),
    (24, 8, 'XPS15-PLT-1TB-32', 2299.00, 'AVAILABLE'),
    (25, 9, 'IPADPRO-SLV-128-WIFI', 1099.00, 'AVAILABLE'),
    (26, 9, 'IPADPRO-GRY-256-WIFI', 1299.00, 'AVAILABLE'),
    (27, 9, 'IPADPRO-SLV-512-CEL', 1699.00, 'AVAILABLE'),
    (28, 10, 'TABS9-BLK-128-WIFI', 799.00, 'AVAILABLE'),
    (29, 10, 'TABS9-BEI-256-5G', 999.00, 'AVAILABLE')
ON CONFLICT ("product_id", "sku_code") DO NOTHING;

SELECT setval(pg_get_serial_sequence('"categories"', 'id'), COALESCE((SELECT MAX("id") FROM "categories"), 1), true);
SELECT setval(pg_get_serial_sequence('"products"', 'id'), COALESCE((SELECT MAX("id") FROM "products"), 1), true);
SELECT setval(pg_get_serial_sequence('"product_skus"', 'id'), COALESCE((SELECT MAX("id") FROM "product_skus"), 1), true);
