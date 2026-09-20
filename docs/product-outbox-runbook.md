# Product outbox recovery runbook

Use this runbook when product events remain pending, exhaust their retry limit,
or appear stuck in processing. Product creation writes the product, SKUs, and
outbox event in one `product_db` transaction. The background worker later
publishes the stored event to Redpanda, and inventory records the event in
`inventory_db` after initializing stock.

Run these commands from the repository root. Set `PRODUCT_DATABASE_URL` and
`INVENTORY_DATABASE_URL` to the databases you intend to inspect. The SQL
examples deliberately omit `payload` so product data is not printed in an
operator terminal.

## List pending and failed events

```bash
psql "$PRODUCT_DATABASE_URL" <<'SQL'
  SELECT id, aggregate_type, aggregate_id, aggregate_version,
         status, attempt_count, next_attempt_at, created_at, last_error
  FROM product_outbox_events
  WHERE status IN ('PENDING', 'FAILED')
  ORDER BY created_at, id;
SQL
```

`PENDING` events are retried automatically when `next_attempt_at` is due.
`FAILED` means the worker reached a permanent validation error or the configured
attempt limit. Read `last_error`, fix the underlying cause, and replay only that
event.

## Inspect event age

```bash
psql "$PRODUCT_DATABASE_URL" <<'SQL'
  SELECT id, status, NOW() - created_at AS event_age,
         NOW() - updated_at AS time_since_update,
         next_attempt_at, attempt_count
  FROM product_outbox_events
  WHERE status IN ('PENDING', 'PROCESSING', 'FAILED')
  ORDER BY created_at, id;
SQL
```

A pending event is due when `next_attempt_at <= NOW()`. A recent pending event
may simply be waiting for its retry backoff or the next worker poll.

## Replay one failed event

```bash
npm run outbox:replay:product -- 550e8400-e29b-41d4-a716-446655440000
```

The command accepts one UUID v4. For a failed event it preserves the stored ID,
aggregate type, aggregate ID, aggregate version, event type, schema version,
occurrence time, partition key, and payload. It resets the status to `PENDING`,
attempt count to zero, retry time to now, and clears error and lease metadata.

An already-pending event is reported as a successful no-op. Missing IDs,
processing events, and published events return a non-zero exit code. There is no
force replay for published events.

After replay, confirm the same row became pending:

```bash
psql "$PRODUCT_DATABASE_URL" -c "
  SELECT id, status, attempt_count, next_attempt_at, last_error,
         lease_owner, lease_until
  FROM product_outbox_events
  WHERE id = '550e8400-e29b-41d4-a716-446655440000';
"
```

Then wait for a bounded period based on
`PRODUCT_OUTBOX_POLL_INTERVAL_MS` and confirm it becomes `PUBLISHED`:

```bash
psql "$PRODUCT_DATABASE_URL" -c "
  SELECT id, status, attempt_count, published_at
  FROM product_outbox_events
  WHERE id = '550e8400-e29b-41d4-a716-446655440000';
"
```

## Verify inventory processed the event

Query `inventory_db` separately; services do not perform cross-database joins.

```bash
psql "$INVENTORY_DATABASE_URL" -c "
  SELECT event_id, event_type, schema_version, payload_hash, processed_at
  FROM processed_product_events
  WHERE event_id = '550e8400-e29b-41d4-a716-446655440000';
"
```

The query should return exactly one marker. For the product ID shown by the
outbox row's `aggregate_id`, verify the initialized stock rows and transactions:

```bash
psql "$INVENTORY_DATABASE_URL" <<'SQL'
  SELECT product_sku_id, product_id, available_quantity, reserved_quantity
  FROM inventory_stocks
  WHERE product_id = 100
  ORDER BY product_sku_id;
SQL

psql "$INVENTORY_DATABASE_URL" <<'SQL'
  SELECT tx.product_sku_id, tx.type, tx.quantity, tx.created_at
  FROM stock_transactions AS tx
  JOIN inventory_stocks AS stock
    ON stock.product_sku_id = tx.product_sku_id
  WHERE stock.product_id = 100
    AND tx.type = 'INITIALIZE'
  ORDER BY tx.product_sku_id;
SQL
```

## Identify a stuck processing lease

```bash
psql "$PRODUCT_DATABASE_URL" <<'SQL'
  SELECT id, lease_owner, lease_until, NOW() - lease_until AS overdue_by
  FROM product_outbox_events
  WHERE status = 'PROCESSING'
  ORDER BY lease_until, id;
SQL
```

An active lease has `lease_until > NOW()` and must be allowed to finish. An
expired lease has `lease_until <= NOW()` and is reclaimed automatically by a
worker using `FOR UPDATE SKIP LOCKED`. The replay command rejects both active
and expired processing rows so it cannot compete with lease recovery. If an
expired row remains unchanged across several polling intervals, check that a
product-service worker is running and can reach `product_db`.

## Why duplicate delivery is normal

Kafka delivery and the database update cannot be one atomic transaction. A
worker can receive a broker acknowledgement and stop before marking the outbox
row published. After the lease expires, another worker publishes the same
stored event again. Both publications carry the same event ID and deterministic
envelope. Inventory treats the same ID and payload hash as a successful no-op;
reuse of the ID with different data is rejected.

Never edit an outbox payload or its envelope fields manually. The stored event
is the durable record used to create deterministic Protobuf bytes. Editing it
can turn a legitimate duplicate into a conflicting event, leave product and
inventory data inconsistent, and defeat the audit trail. Fix the cause of a
failure in code or configuration, then replay the original row with the CLI.
