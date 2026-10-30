# Flash-sale load profiles

Transport note: retained October 23–24 load results used gateway-to-cart HTTP
forwarding and its Undici connection pool. The current implementation uses
gRPC with native deadlines. Those historical numbers do not establish gRPC
capacity; new runs record their transport and RPC timeout configuration.


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

The concurrency profile defaults to 100 preinitialized virtual buyers and a stock
limit of 20. Each VU sends one checkout using its own user, cart, and key through
the gateway. The `per-vu-iterations` executor starts the buyers together; the
report records actual launch spread rather than claiming exact simultaneity.
Buyer data is shared between VUs to avoid copying the full fixture into every VU.

```bash
npm run load:flash-sale:concurrency
```

The historical [`baselines/concurrency.md`](baselines/concurrency.md) used a
five-second ramp, followed by idle iterations. It did not maintain 100 in-flight
checkouts, and its 3.24 requests/s included idle time. Version 2 uses a finite
burst. Do not compare the two rates as an application speedup.

The retry storm sends three sequential checkout requests per user with the same
idempotency key, with buyers running concurrently. It does not simulate three
simultaneous retries from the same buyer. The verifier requires one order and one committed reservation
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
| `LOAD_MAX_DURATION`, `LOAD_REQUEST_TIMEOUT` | Scenario cap (60s), individual request timeout (30s) |
| `LOAD_READ_DURATION`                            | Read-heavy duration                     |
| `LOAD_FIXTURE`                                  | Reuse an explicitly prepared fixture    |
| `LOAD_BASELINE_PATH`                            | Markdown and adjacent `.md.json` evidence destination |
| `LOAD_ARTIFACT_DIR` | Raw k6 summary, k6 log, invariant result, verification log |
| `LOAD_CONNECTION_MODE` | `cold` (default), or explicit `warm` connection experiment |
| `LOAD_CONNECTION_WARMUP_MS` | Warm-mode common checkout barrier, default 3,000 ms |

Expected 409 responses with `FLASH_SALE_SOLD_OUT` or
`FLASH_SALE_LIMIT_REACHED` are recorded as business conflicts. Authentication,
contract, network, and server errors are recorded separately as technical
failures.

The initial thresholds are a technical-failure rate below 1%, checkout p95
below 1,000 ms, checkout p99 below 2,000 ms, active-sale read p95 below 500 ms,
and zero HTTP 5xx responses. Checkout wall-time p95/p99 has the same limits,
including connection setup. All planned checkout responses must be accounted
for; `202` is pending, not success. Database verification requires zero technical
failures and exact expected outcomes even though the rate threshold is <1%.
Database invariants remain mandatory even when all
performance thresholds pass.

Every run that produces a k6 summary writes Markdown plus sanitized JSON,
including runs that fail thresholds or invariants. Raw results and verifier
errors remain under `artifacts/load/`. Temporary fixtures contain bearer tokens
and are removed, never copied into evidence. A supplied `LOAD_FIXTURE` is the
caller's responsibility and must be fresh for mutation tests.

## Repeated 100 / 500 / 1,000 buyer comparison

With Docker and k6 installed, this command creates a disposable stack, builds
all six services, runs the full E2E suite, warms up checkout with five buyers,
and runs three trials at each level:

```bash
npm run load:flash-sale:benchmark
```

Cold mode opens each VU's first connection with its checkout. Warm mode first
stagger-connects VUs to `/health` over half the 3-second warmup window, then waits
until a common barrier before sending checkout. Those health calls are excluded
from checkout rates/latencies, but failures or late arrivals fail the run. The
actual checkout launch spread is still measured. Keep connections alive through
the barrier; an overly long custom warmup can exceed the server keep-alive timeout.

```bash
LOAD_CONNECTION_MODE=warm npm run load:flash-sale:benchmark
```

Always include connection mode with a CV/interview result. Warm checkout results
do not establish cold-connection capacity. The October 2026 Mac had a listen
backlog cap of 128 and cold burst connection resets; no OS settings were changed.

The matrix uses fresh users/carts/SKU/sale for every trial and a constant 20%
stock-to-buyer ratio: 20, 100, and 200 units. Base inventory equals buyer count.
It alternates ascending and descending load order and runs serially. All levels
continue after threshold failures; the overall command exits nonzero if any
trial fails. An existing output directory is rejected to prevent stale reports
from being mistaken for new trials. Stack processes and containers are removed afterward.

```bash
LOAD_LEVELS="100 500 1000" LOAD_REPEATS=3 \
  LOAD_MATRIX_DIR=artifacts/load-matrix/my-run npm run load:flash-sale:benchmark
# Separately measure the full order-creation path with stock for every buyer:
LOAD_STOCK_RATIO=1 npm run load:flash-sale:benchmark
# Run a matrix against an already configured dedicated stack:
bash scripts/run-flash-sale-load-matrix.sh
```

Do not run application builds, other tests, or competing load generators during
measurement. Report CPU/RAM, Docker allocation, service topology, dependency
versions, source fingerprint, trial count, stock ratio, and failures with results.
The isolated runner uses one process per service, one PostgreSQL container with
five databases, one Redpanda broker, and Redis for the catalog tests. Checkout
does not use that search cache. Login and cart setup are excluded. The isolated
runner's reconciliation interval is 60 seconds; this burst is not proof of
recovery under sustained overload.

Read `comparison.md` and each adjacent JSON file in the matrix output directory:

- Burst responses/s = all checkout responses divided by first-send to last-response
  wall time. This includes sold-out responses and, for retry storms, replays.
- Completed buyers/s = unique completed buyers divided by the same interval.
  This is distinct from HTTP request rate and must not be called sustained order TPS.
- HTTP p50/p95/p99 = k6 request duration. Wall-time p95 includes client connection
  setup. Success and conflict latency are separate, because most buyers sell out.
- Launch spread = last request start minus first request start. VU count alone is
  not a measurement of simultaneous server-side requests.
- Threshold status and post-run verification status are separate. Zero overselling
  does not imply acceptable latency. Missing evidence is not a pass.

The verifier compares exact checkout/order/reservation counts and identities,
sold/reserved/available counters, duplicates, business outcomes, and response
coverage. Repeated overload/recovery and sustained arrival-rate tests would be
separate experiments; this harness establishes finite-burst behavior only.

Run measurement-helper regressions with `npm run test:load-harness`.

## Gateway transport configuration

The public API uses HTTP; gateway-to-service business calls use gRPC. Native
RPC deadlines default to 5 seconds, with a 30-second gateway checkout deadline.
Configure `GRPC_REQUEST_TIMEOUT_MS` and `GATEWAY_CHECKOUT_TIMEOUT_MS` per process;
the checkout deadline must exceed the ordinary call limit. Timeouts do not
prove rollback, and the gateway never automatically replays checkout POSTs.
The load fixture reuses each buyer's checkout identity for retries.

The older HTTP/Undici pool and its 64-connection limit apply only to the retained
October 23–24 baseline. gRPC multiplexing changes transport behavior; rerun
measurements rather than treating those results as current capacity. New evidence
records `internalTransport` and the configured RPC timeout. Admission control
and complete workflow budgets remain separate work.
