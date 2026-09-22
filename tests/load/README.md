# Flash-sale load profiles

These profiles use [k6](https://grafana.com/docs/k6/latest/) against a running
gateway and the five service databases. They are separate from Vitest because
load generation is not a unit-test concern.

Each command performs three phases:

1. Prepare a product, active flash sale, users, tokens, and active carts.
2. Run the selected k6 workload. Login and cart setup are outside measured time.
3. Query cart, order, and inventory databases and fail when the persisted state
   does not match the observed workload.

The setup uses gateway APIs for product, sale, cart, and authentication actions.
It writes users directly to the auth database because the application has no
public registration API. It adjusts the scheduled sale window in product and
inventory databases so a five-minute scheduling wait is unnecessary.

## Required environment

The six services must be running and the databases must already be migrated.
Install k6 locally, then provide the service database URLs:

```bash
export LOAD_GATEWAY_URL=http://127.0.0.1:4000
export AUTH_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5005/auth_db
export PRODUCT_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5001/product_db
export INVENTORY_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5003/inventory_db
export CART_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5002/cart_db
export ORDER_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5004/order_db
```

The default administrator is `testuser@test.com / password123`. Override it
with `LOAD_ADMIN_EMAIL` and `LOAD_ADMIN_PASSWORD`.

## Profiles

The smoke profile uses five users by default and should run in CI against an
isolated stack. It validates contracts and setup; it is not a capacity result.

```bash
npm run load:flash-sale:smoke
```

The concurrency profile defaults to 100 users, a stock limit of 20, a five
second ramp-up, a twenty second steady stage, and a five second ramp-down.

```bash
npm run load:flash-sale:concurrency
```

The retry storm sends three checkout requests per user with the same
idempotency key. The verifier requires one order and one committed reservation
per user.

```bash
npm run load:flash-sale:retry-storm
```

The read profile measures authenticated active-sale listing and product search
without checkout mutations.

```bash
npm run load:flash-sale:reads
```

Useful overrides include:

| Variable                                        | Purpose                                 |
| ----------------------------------------------- | --------------------------------------- |
| `LOAD_VUS`                                      | Prepared users and active virtual users |
| `LOAD_STOCK_LIMIT`                              | Flash-sale allocation                   |
| `LOAD_BASE_INVENTORY`                           | Normal inventory quantity               |
| `LOAD_RETRIES`                                  | Requests per user in retry storm        |
| `LOAD_RAMP_UP`, `LOAD_STEADY`, `LOAD_RAMP_DOWN` | Concurrency stages                      |
| `LOAD_READ_DURATION`                            | Read-heavy duration                     |
| `LOAD_FIXTURE`                                  | Reuse an explicitly prepared fixture    |
| `LOAD_BASELINE_PATH`                            | Markdown result destination             |

Expected 409 responses with `FLASH_SALE_SOLD_OUT` or
`FLASH_SALE_LIMIT_REACHED` are recorded as business conflicts. Authentication,
contract, network, and server errors are recorded separately as technical
failures.

The initial thresholds are a technical-failure rate below 1%, checkout p95
below 1,000 ms, checkout p99 below 2,000 ms, active-sale read p95 below 500 ms,
and zero HTTP 5xx responses. Database invariants remain mandatory even when all
performance thresholds pass.

Every successful run writes a Markdown baseline under `tests/load/baselines/`.
The baseline records machine specifications so local laptop measurements are
not presented as production capacity. Load-test fixture rows are retained in
the dedicated environment for inspection; use a disposable database or reset
the environment between runs.
