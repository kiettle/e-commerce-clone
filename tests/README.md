# Test lanes

- Unit tests stay beside production code in `apps/`, `libs/`, and `frontend/src/` as `*.spec.ts`. They use direct construction and no Docker, database, broker, or network.
- Contract tests use `*.contract.spec.ts` beside a transport adapter or under `tests/contract/`. They verify protobuf field numbers, encoding, presence, and boundary mappings without network access or external services.
- Integration tests use `*.integration.spec.ts` beside an adapter or under `tests/integration/`. Real gRPC calls, including controlled dependency servers, belong here. The integration runner provisions disposable infrastructure and runs files serially.
- End-to-end tests use `*.e2e.spec.ts` under `tests/e2e/` and exercise the complete application workflow.
- Shared lane helpers belong in a lane's `support/` directory and must not use a test-file suffix.
- Load tests belong under `tests/load/` and are not discovered by Vitest.

Run the lanes with `npm run test:unit`, `npm run test:contract`, `npm run test:integration`, and `npm run test:e2e`.

Run `npm run test:integration:inventory-concurrency` to repeat the real
PostgreSQL inventory concurrency matrix ten times against one disposable test
database container. Every repetition cleans its rows before running.

## PostgreSQL, Redis, and Kafka integration harness

`npm run test:integration` starts disposable PostgreSQL, Redis, and Redpanda containers on random localhost ports. It creates separate auth, product, inventory, cart, and order databases whose names end in `_test`, applies every real migration, runs the integration lane serially, and removes all three containers even when a test fails.

Redis tests exercise the product-search adapter with real PostgreSQL: counted
repository calls prove cache reuse, including across independent clients.
They also check filter isolation, expiry, malformed entries, read/write stalls,
startup while Redis is down, and reconnection. The runner explicitly configures
cache settings; it never reuses the developer's Redis URL. The host port remains
fixed across test-container restarts.

Kafka integration tests create a unique topic and consumer group for each case. They use bounded polling, disconnect consumers and producers in teardown, and delete their topics. The disposable Redpanda container is the final isolation boundary if a test is interrupted before topic cleanup.

Use the helpers in `tests/integration/support/` to read guarded database URLs, create service-specific Prisma clients, clean tables in foreign-key-safe order, and disconnect all clients. The URL guard rejects non-local hosts and database names without the `_test` suffix. Integration tests must not read the normal development database URLs directly.

Set `POSTGRES_TEST_IMAGE`, `REDIS_TEST_IMAGE`, or `REDPANDA_TEST_IMAGE` only when compatible test images are required. They default to `postgres:17-alpine`, `redis:8-alpine`, and `redpandadata/redpanda:v24.3.6`.

## Full gateway E2E harness

`npm run test:e2e` owns the complete stack lifecycle. It starts disposable
PostgreSQL, Redis, and Redpanda containers, creates and migrates five service databases,
seeds an administrator and three customers, builds and starts all six services,
waits for their health endpoints, and runs the gateway scenarios. Business
actions use only gateway HTTP APIs. Database clients are used for controlled
clock setup and cross-service assertions. Redis inspection verifies cached
payloads and TTLs. Redis is temporarily stopped during service startup to prove
that product-service health does not depend on it, then restarted before tests.
The catalog scenario covers authenticated hits, stale edits, deletion, empty
results, outage fallback, and recovery.

The runner assigns random localhost ports, prints recent logs from every service
and all three containers when a failure occurs, then stops all processes and removes
all containers. No development database or already-running service is used.

The older focused product/outbox demonstration remains available as
`npm run test:e2e:product-outbox`.

Flash-sale load profiles live under `tests/load/` and run with k6 rather than
Vitest. See [load/README.md](load/README.md) for fixture setup, profile commands,
thresholds, and the mandatory post-run database verification.

## gRPC cutover regression evidence

- [Cart protobuf](contract/cart-proto.contract.spec.ts): six RPCs, oneof checkout outcomes, field presence, and large IDs.
- [Cart transport](integration/cart-grpc.integration.spec.ts): all operations, missing quantity versus zero, structured errors, real deadlines, and lost-response replay.
- [Existing clients](integration/grpc-client-failure-injection.integration.spec.ts): auth roles, inventory/order classifications, and int64 identity preservation.
- [Native deadlines](integration/grpc-deadlines.integration.spec.ts): stalled auth/product/inventory/order handlers fail within the configured caller deadline.
- [Shutdown ordering](integration/cart-shutdown.integration.spec.ts): worker draining precedes client/database closure, including a rejected claim during shutdown.
- [Frontend identity](../frontend/src/lib/api.spec.ts): a pending result or timeout never silently replaces the checkout key, including module reloads.

The full gateway suite additionally checks that internal cart/auth HTTP business
routes are absent while their health endpoints still respond. HTTP `202` means
persisted recoverable work; `503` means unavailable and `504` means the gateway
stopped waiting. Run `npm run test:coverage` as well as `test:unit`: CI enforces
70% statements/lines/functions and 60% branches, and passing unit assertions alone
does not prove that coverage passes.
