# Flash-sale operations runbook

Use this runbook to diagnose checkout, outbox, Kafka, and inventory projection
problems. Run commands from the repository root. Production services continue
to respect database ownership; the cross-database queries below are operator
observations performed separately.

## Internal gRPC and timeout triage

Business HTTP calls go to the gateway only. Cart/auth retain private HTTP health
checks but no duplicate REST business routes. Check `CART_GRPC_URL` as well as
the auth/product/inventory/order addresses; client dial addresses must match
server bind ports. `GRPC_REQUEST_TIMEOUT_MS` defaults to 5000 ms and
`GATEWAY_CHECKOUT_TIMEOUT_MS` to 30000 ms, greater than the ordinary call limit.

A `503` reports an unavailable dependency. A `504` means the gateway stopped
waiting, not that the checkout rolled back. Keep the original cart and
idempotency key, query the owner-scoped checkout status when its ID is known,
or explicitly retry the same intent. Never manufacture a new key, release
stock, or mark a checkout failed solely because a call expired. Only `202`
confirms that cart-service returned a durably recorded pending result.

During shutdown, workers/consumers drain before outgoing clients and Prisma
close. Drain failures/timeouts are logged; database leases and uncommitted
messages preserve unfinished work for recovery. HTTP health remains liveness,
not a gRPC/database readiness guarantee.

## Safety rules

1. Confirm the environment and exact checkout, event, product, sale, or SKU ID
   from the incident before running a command.
2. Start with the public status endpoint and read-only SQL.
3. Never update `inventory_stocks`, `flash_sale_stocks`,
   `stock_reservations`, or `stock_transactions` manually.
4. Never edit outbox payloads, event IDs, hashes, leases, retry counters, or
   checkout snapshots manually.
5. Retry checkout only with its original cart and `Idempotency-Key`.
6. Replay only one `FAILED` outbox event through the supplied CLI. Published
   events cannot be replayed in V1.

Set database URLs for the environment being investigated. The examples require
an explicit ID and fail immediately when it is missing:

```bash
export CART_DATABASE_URL='postgresql://.../cart_db'
export PRODUCT_DATABASE_URL='postgresql://.../product_db'
export INVENTORY_DATABASE_URL='postgresql://.../inventory_db'
```

Do not paste JWTs into logs or tickets. For authenticated HTTP inspection, read
the token without echoing it:

```bash
read -rsp 'Bearer token: ' ACCESS_TOKEN
echo
```

## Pending checkout

First ask the gateway for the owner-visible, sanitized state:

```bash
CHECKOUT_ID="${CHECKOUT_ID:?set the exact checkout UUID}"

curl -fsS \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "${GATEWAY_URL:?set GATEWAY_URL}/api/checkouts/$CHECKOUT_ID"
```

Then inspect the durable action in `cart_db`:

```bash
psql "$CART_DATABASE_URL" -v checkout_id="$CHECKOUT_ID" <<'SQL'
SELECT id, user_id, cart_id, status, order_id, retry_count,
       next_retry_at, reconciliation_action, lease_owner, lease_until,
       created_at, updated_at, last_error
FROM checkout_attempts
WHERE id = :'checkout_id'::uuid;
SQL
```

Interpret the stored action:

| Action          | Expected recovery                                                    |
| --------------- | -------------------------------------------------------------------- |
| `RESERVE_STOCK` | Retry the idempotent inventory reservation                           |
| `CHECK_ORDER`   | Query order-service by checkout ID before considering another create |
| `COMMIT_STOCK`  | Retry commit; retain the existing order and never release stock      |
| `RELEASE_STOCK` | Retry compensation; do not create an order                           |
| `COMPLETE_CART` | Perform local cart completion only                                   |

If `next_retry_at` is in the future, allow the configured backoff. If it is due
and no active lease exists, verify cart-service health and worker configuration.
A customer may resume immediately by repeating the original request:

```bash
CART_ID="${CART_ID:?set the cart ID recorded above}"
IDEMPOTENCY_KEY="${IDEMPOTENCY_KEY:?set the original checkout key}"

curl -i -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  "${GATEWAY_URL}/api/carts/${CART_ID}/checkout"
```

Do not generate a replacement key. Recovery behavior is covered by
[`checkout-recovery.scenarios.spec.ts`](../apps/cart-service/src/carts/application/use-cases/checkout-recovery.scenarios.spec.ts).

## Failed compensation

A failed stock release must remain durable as
`RECONCILIATION_REQUIRED + RELEASE_STOCK`. Inspect the attempt and only its
reservations:

```bash
psql "$INVENTORY_DATABASE_URL" -v checkout_id="$CHECKOUT_ID" <<'SQL'
SELECT id, cart_id, checkout_id, product_sku_id, flash_sale_item_id,
       quantity, status, created_at, updated_at
FROM stock_reservations
WHERE checkout_id = :'checkout_id'::uuid
ORDER BY product_sku_id;
SQL
```

```bash
psql "$INVENTORY_DATABASE_URL" -v checkout_id="$CHECKOUT_ID" <<'SQL'
SELECT tx.product_sku_id, tx.type, tx.quantity, tx.created_at
FROM stock_transactions AS tx
JOIN stock_reservations AS reservation
  ON reservation.cart_id = tx.cart_id
 AND reservation.product_sku_id = tx.product_sku_id
WHERE reservation.checkout_id = :'checkout_id'::uuid
ORDER BY tx.created_at, tx.id;
SQL
```

Retry the original checkout request or restore the cart-service worker. A
confirmed release is idempotent. A committed reservation must not be released.
Do not insert a `RELEASE` transaction or alter counters by hand. The durable
failure path is tested in
[`checkout-recovery.scenarios.spec.ts`](../apps/cart-service/src/carts/application/use-cases/checkout-recovery.scenarios.spec.ts).

## Expired checkout lease

```bash
psql "$CART_DATABASE_URL" -v checkout_id="$CHECKOUT_ID" <<'SQL'
SELECT id, status, reconciliation_action, lease_owner, lease_until,
       NOW() AS database_now,
       CASE
         WHEN lease_until IS NULL THEN 'UNLEASED'
         WHEN lease_until > NOW() THEN 'ACTIVE'
         ELSE 'EXPIRED'
       END AS lease_state
FROM checkout_attempts
WHERE id = :'checkout_id'::uuid;
SQL
```

An active lease must be allowed to finish. An expired lease is reclaimed by a
healthy worker. If it remains expired for several poll intervals, check
cart-service health, database connectivity, and
`CHECKOUT_RECONCILIATION_*` configuration, then restart the service through the
normal deployment mechanism. Never clear `lease_owner` or `lease_until`
manually. Lease competition and expiry are tested in
[`order-checkout-idempotency.integration.spec.ts`](../tests/integration/order-checkout-idempotency.integration.spec.ts).

## Failed outbox event

Inspect one explicit event without printing its payload:

```bash
EVENT_ID="${EVENT_ID:?set the exact event UUID}"

psql "$PRODUCT_DATABASE_URL" -v event_id="$EVENT_ID" <<'SQL'
SELECT id, aggregate_type, aggregate_id, aggregate_version, event_type,
       schema_version, status, attempt_count, next_attempt_at,
       lease_owner, lease_until, published_at, last_error, created_at, updated_at
FROM product_outbox_events
WHERE id = :'event_id'::uuid;
SQL
```

After fixing the reported configuration or validation cause, replay that one
`FAILED` event:

```bash
npm run outbox:replay:product -- "$EVENT_ID"
```

The command preserves the event identity, occurrence time, aggregate version,
partition key, and payload. It returns non-zero for missing, processing, or
published events. An already-pending event is a no-op. See the more focused
[`product-outbox-runbook.md`](product-outbox-runbook.md) and the replay tests in
[`replay-product-outbox-event.use-case.spec.ts`](../apps/product-service/src/catalog/application/use-cases/replay-product-outbox-event.use-case.spec.ts).

## Outbox backlog

Count backlog by state and age without loading payloads:

```bash
psql "$PRODUCT_DATABASE_URL" <<'SQL'
SELECT status,
       COUNT(*) AS event_count,
       MIN(created_at) AS oldest_created_at,
       MAX(NOW() - created_at) AS oldest_age,
       MIN(next_attempt_at) AS next_due_at
FROM product_outbox_events
WHERE status IN ('PENDING', 'PROCESSING', 'FAILED')
GROUP BY status
ORDER BY status;
SQL
```

List due events in claim order:

```bash
psql "$PRODUCT_DATABASE_URL" <<'SQL'
SELECT id, event_type, aggregate_id, status, attempt_count,
       next_attempt_at, lease_owner, lease_until, created_at
FROM product_outbox_events
WHERE (status = 'PENDING' AND next_attempt_at <= NOW())
   OR (status = 'PROCESSING' AND lease_until <= NOW())
ORDER BY created_at, id
LIMIT 100;
SQL
```

Check product-service health, database connectivity, Kafka health, and worker
configuration. Do not bulk-update rows or replay every event. Multi-worker
claiming and stale-lease fencing are tested with 50 rows in
[`product-outbox.prisma.repository.integration.spec.ts`](../apps/product-service/src/catalog/infrastructure/persistence/prisma/product-outbox.prisma.repository.integration.spec.ts).

## Product exists without an inventory projection

Use the exact product ID to locate its event:

```bash
PRODUCT_ID="${PRODUCT_ID:?set the exact product ID}"

psql "$PRODUCT_DATABASE_URL" -v product_id="$PRODUCT_ID" <<'SQL'
SELECT id, aggregate_id, aggregate_version, event_type, status,
       attempt_count, next_attempt_at, published_at, last_error
FROM product_outbox_events
WHERE aggregate_type = 'PRODUCT'
  AND aggregate_id = :'product_id'::bigint
ORDER BY aggregate_version;
SQL
```

Inspect the marker and projection separately in `inventory_db`:

```bash
psql "$INVENTORY_DATABASE_URL" -v product_id="$PRODUCT_ID" <<'SQL'
SELECT event_id, schema_version, payload_hash, processed_at
FROM processed_product_events
WHERE product_id = :'product_id'::bigint;

SELECT product_sku_id, status, available_quantity, reserved_quantity
FROM inventory_stocks
WHERE product_id = :'product_id'::bigint
ORDER BY product_sku_id;
SQL
```

- `PENDING`: wait for its due time and verify the worker.
- `FAILED`: fix the cause and replay that exact event ID.
- `PUBLISHED` with no marker: inspect the inventory consumer group, topic
  retention, and consumer logs. V1 intentionally refuses to replay a published
  row; escalate for an audited repair instead of editing the outbox row.

Atomic product/event creation and projection rollback are tested in
[`product.prisma.repository.integration.spec.ts`](../apps/product-service/src/catalog/infrastructure/persistence/prisma/product.prisma.repository.integration.spec.ts)
and [`inventory.prisma.repository.integration.spec.ts`](../apps/inventory-service/src/inventory/infrastructure/persistence/prisma/inventory.prisma.repository.integration.spec.ts).

## Sale not ready

`FLASH_SALE_NOT_READY` means the sale definition is visible but inventory has
not recorded its scheduled-event projection. Inspect the exact sale:

```bash
FLASH_SALE_ID="${FLASH_SALE_ID:?set the exact flash-sale ID}"

psql "$PRODUCT_DATABASE_URL" -v sale_id="$FLASH_SALE_ID" <<'SQL'
SELECT id, event_type, status, attempt_count, next_attempt_at,
       published_at, last_error
FROM product_outbox_events
WHERE aggregate_type = 'FLASH_SALE'
  AND aggregate_id = :'sale_id'::bigint
ORDER BY aggregate_version;
SQL
```

```bash
psql "$INVENTORY_DATABASE_URL" -v sale_id="$FLASH_SALE_ID" <<'SQL'
SELECT event_id, schema_version, payload_hash, processed_at
FROM processed_flash_sale_events
WHERE flash_sale_id = :'sale_id'::bigint;

SELECT flash_sale_item_id, product_sku_id, starts_at, ends_at,
       quantity_limit, reserved_quantity, sold_quantity, user_limit
FROM flash_sale_stocks
WHERE flash_sale_id = :'sale_id'::bigint
ORDER BY flash_sale_item_id;
SQL
```

Resolve `PENDING` or `FAILED` outbox state as above. A customer retry is safe
after the projection appears and while the sale window remains active. The
outage/catch-up scenario is tested in
[`gateway-stack.e2e.spec.ts`](../tests/e2e/gateway-stack.e2e.spec.ts).

## Inventory mismatch

Read the normal and sale counters for one SKU and sale item:

```bash
PRODUCT_SKU_ID="${PRODUCT_SKU_ID:?set the exact product SKU ID}"
FLASH_SALE_ITEM_ID="${FLASH_SALE_ITEM_ID:?set the exact flash-sale item ID}"

psql "$INVENTORY_DATABASE_URL" \
  -v sku_id="$PRODUCT_SKU_ID" \
  -v sale_item_id="$FLASH_SALE_ITEM_ID" <<'SQL'
SELECT product_sku_id, available_quantity, reserved_quantity, status
FROM inventory_stocks
WHERE product_sku_id = :'sku_id'::bigint;

SELECT flash_sale_id, flash_sale_item_id, product_sku_id, quantity_limit,
       reserved_quantity, sold_quantity, user_limit, starts_at, ends_at
FROM flash_sale_stocks
WHERE flash_sale_item_id = :'sale_item_id'::bigint;

SELECT status, COUNT(*) AS reservations, COALESCE(SUM(quantity), 0) AS quantity
FROM stock_reservations
WHERE product_sku_id = :'sku_id'::bigint
GROUP BY status
ORDER BY status;
SQL
```

Check invariants without modifying data:

```bash
psql "$INVENTORY_DATABASE_URL" <<'SQL'
SELECT product_sku_id, available_quantity, reserved_quantity
FROM inventory_stocks
WHERE available_quantity < 0 OR reserved_quantity < 0;

SELECT flash_sale_item_id, quantity_limit, reserved_quantity, sold_quantity
FROM flash_sale_stocks
WHERE reserved_quantity < 0
   OR sold_quantity < 0
   OR reserved_quantity + sold_quantity > quantity_limit;
SQL
```

If either query returns rows, stop new checkout traffic through the normal
deployment/routing procedure, preserve database and service logs, and escalate
for a code-level repair or backup restoration. Never repair the counters with
SQL. The counter and rollback invariants are proved by
[`inventory.prisma.repository.integration.spec.ts`](../apps/inventory-service/src/inventory/infrastructure/persistence/prisma/inventory.prisma.repository.integration.spec.ts).

## Duplicate-event conflict

A conflict means the same event ID arrived with a different canonical payload
hash. Treat it as high severity; it is not a harmless Kafka duplicate.

```bash
psql "$INVENTORY_DATABASE_URL" -v event_id="$EVENT_ID" <<'SQL'
SELECT event_id, event_type, schema_version, payload_hash, processed_at
FROM processed_product_events
WHERE event_id = :'event_id'
UNION ALL
SELECT event_id, event_type, schema_version, payload_hash, processed_at
FROM processed_flash_sale_events
WHERE event_id = :'event_id';
SQL
```

Capture the consumer log entry, topic, partition, offset, event ID, and stored
marker hash. Compare them with the immutable producer outbox metadata without
editing either database. Stop the affected consumer through the deployment
platform if it is repeatedly processing a poison record, then investigate the
producer or serializer. Do not change the processed marker, payload, or Kafka
offset merely to make the error disappear. Conflict rejection and unchanged
inventory are tested in
[`kafka-event-delivery.integration.spec.ts`](../tests/integration/kafka-event-delivery.integration.spec.ts).

## Sold-out spike

Confirm clients are receiving the structured `FLASH_SALE_SOLD_OUT` code rather
than HTTP 500. Then inspect the exact sale item and base stock with the queries
from **Inventory mismatch**.

Expected sold-out traffic has:

```text
reserved_quantity + sold_quantity = quantity_limit
```

Base stock can also end the sale early when normal available quantity reaches
zero. V1 sale definitions are immutable after scheduling, so do not increase
the sale allocation in the database. The 100-customer allocation and base-stock
caps are tested in
[`inventory.prisma.repository.integration.spec.ts`](../apps/inventory-service/src/inventory/infrastructure/persistence/prisma/inventory.prisma.repository.integration.spec.ts).

## Kafka unavailable

For the local Docker Compose environment:

```bash
docker compose ps redpanda
docker compose logs --tail=200 redpanda
docker compose exec redpanda rpk cluster health
docker compose exec redpanda rpk group list
```

Restore the existing broker without deleting its volume:

```bash
docker compose up -d redpanda
```

Then inspect due outbox rows and consumer groups. Product creation and sale
scheduling should already have committed and should not be submitted again.
The background worker publishes the existing event identity after recovery.
Checkout inventory or order calls that returned an uncertain outcome retain a
durable reconciliation action and must be resumed with the original checkout
key.

The broker outage and automatic catch-up path is tested in
[`gateway-stack.e2e.spec.ts`](../tests/e2e/gateway-stack.e2e.spec.ts); duplicate
publication after a lost acknowledgement is tested in
[`kafka-event-delivery.integration.spec.ts`](../tests/integration/kafka-event-delivery.integration.spec.ts).

## Reproduce the verification suites

```bash
npm ci
npm run prisma:generate:all
npm run test:coverage
npm run test:contract
npm run test:integration
npm run test:e2e
```

With k6 2.3.0 installed, reproduce the CI smoke profile against the disposable
E2E stack:

```bash
K6_SUMMARY_TREND_STATS='avg,min,med,p(90),p(95),p(99),max' \
  RUN_LOAD_SMOKE=1 npm run test:e2e
```

The integration and E2E harnesses use bounded polling, unique databases and
topics, and teardown traps. They do not require a developer-managed `.env` or
manually running services.
