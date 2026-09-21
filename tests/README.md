# Test lanes

- Unit tests stay beside production code as `*.spec.ts`. They use direct construction and no Docker, database, broker, or network.
- Contract tests use `*.contract.spec.ts` beside a transport adapter or under `tests/contract/`. They verify protobuf field numbers and boundary mappings without infrastructure by default.
- Integration tests use `*.integration.spec.ts` beside an adapter or under `tests/integration/`. The integration runner provisions disposable infrastructure and runs files serially.
- End-to-end tests use `*.e2e.spec.ts` under `tests/e2e/` and exercise the complete application workflow.
- Shared lane helpers belong in a lane's `support/` directory and must not use a test-file suffix.
- Load tests belong under `tests/load/` and are not discovered by Vitest.

Run the lanes with `npm run test:unit`, `npm run test:contract`, `npm run test:integration`, and `npm run test:e2e`.

## PostgreSQL and Kafka integration harness

`npm run test:integration` starts disposable PostgreSQL and Redpanda containers on random localhost ports. It creates separate auth, product, inventory, cart, and order databases whose names end in `_test`, applies every real migration, runs the integration lane serially, and removes both containers even when a test fails.

Kafka integration tests create a unique topic and consumer group for each case. They use bounded polling, disconnect consumers and producers in teardown, and delete their topics. The disposable Redpanda container is the final isolation boundary if a test is interrupted before topic cleanup.

Use the helpers in `tests/integration/support/` to read guarded database URLs, create service-specific Prisma clients, clean tables in foreign-key-safe order, and disconnect all clients. The URL guard rejects non-local hosts and database names without the `_test` suffix. Integration tests must not read the normal development database URLs directly.

Set `POSTGRES_TEST_IMAGE` or `REDPANDA_TEST_IMAGE` only when compatible test images are required. They default to `postgres:17-alpine` and `redpandadata/redpanda:v24.3.6`.
