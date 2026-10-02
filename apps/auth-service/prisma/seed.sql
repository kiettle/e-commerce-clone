INSERT INTO "users" (id, email, password, role)
SELECT
    1,
    'testuser@test.com',
    '$2b$12$7hoRZfJrRKD2nIm2vHLs7OBETy.LWenXXMLKf99W8M4PUwO6KB7fu',
    'ADMIN'
WHERE NOT EXISTS (
    SELECT 1
    FROM "users"
    WHERE id = 1
       OR email = 'testuser@test.com'
);
