# Flash-sale verification report

Transport note: retained October 23–24 load results used gateway-to-cart HTTP
forwarding and its Undici connection pool. The current implementation uses
gRPC with native deadlines. Those historical numbers do not establish gRPC
capacity; new runs record their transport and RPC timeout configuration.

This report records the local verification baseline for the authenticated
flash-sale workflow, durable product outbox, sale-aware checkout, and
idempotent inventory/order behavior. It is evidence for a development build,
not a production capacity claim.

## October 30: internal gRPC review

The current working tree uses gRPC for all synchronous internal business APIs,
including gateway-to-cart. Cart/auth duplicate REST business routes are removed;
private HTTP liveness endpoints remain. This review reran the local validation
lanes after fixing shutdown error handling and documentation inconsistencies.

| Check | Latest result |
| --- | --- |
| Six-service build and backend lint | Passed |
| Unit suite with CI coverage gate | 464 tests passed |
| Protobuf contract lane, without sockets | 20 tests passed |
| PostgreSQL/Redis/Kafka/gRPC integration | 111 tests passed |
| Full gateway E2E | 11 scenarios passed |
| Focused product-outbox/flash-sale demo | Seven scenarios passed |
| k6 load smoke and post-run database invariants | Three completed checkouts; zero technical failures; passed |
| Load measurement helper regressions | Four tests passed |
| Frontend build and lint | Passed |
| Maintained Markdown links and heading anchors | No broken local references |

Unit coverage: statements **75.64%**, branches **67.78%**, functions **70.56%**,
and lines **76.21%**. The existing thresholds were retained: 70% statements,
functions, and lines; 60% branches. Running unit assertions alone had missed the
function-coverage failure, so the README/test guide now explicitly include the
CI coverage command.

Review corrections:

- A rejected in-flight drain no longer prevents later client/database cleanup.
  Worker tests verify no new poll is scheduled, and real Nest lifecycle tests
  check cleanup after both a successful pass and a failed claim.
- Kafka integration teardown now runs both consumer drain and disconnect phases.
- The six controlled gRPC failure-injection cases moved from the contract lane
  to integration; tests were preserved rather than dropped. Protobuf checks
  remain in the contract lane, consistent with the development guide.
- Cart adapter local validation uses ordinary HTTP exceptions rather than
  manufacturing numeric gRPC error objects for errors that happened locally.

Native deadline tests stall real handlers to prove bounded waits and uncertain
inventory/order classification. Gateway E2E checks real lost-order-response
recovery, replay, conflicts, owner-scoped status, quantity-zero removal, and the
absence of duplicate internal HTTP business routes. These results do not prove
all process-crash recovery cases, an end-to-end database budget, cross-device
client recovery, production deployment, or larger gRPC capacity. See the
[roadmap](roadmap.md) for the remaining work.

Reproduce from the repository root:

```bash
npm run build:all
npm run lint
npm run test:unit
npm run test:coverage
npm run test:contract
npm run test:integration
RUN_LOAD_PROFILE=smoke npm run test:e2e
npm run test:e2e:product-outbox
npm run test:load-harness
npm run frontend:build
npm run frontend:lint
```

Retained October 23–24 results below used the old HTTP/Undici forwarding path.
Their measured failures and thresholds are unchanged and are not current gRPC
capacity evidence.

## October 24: 10,000-buyer stress test

An actual single-run 10,000-buyer experiment completed on October 24, 2026
(Asia/Ho_Chi_Minh), with unchanged 30-second request timeout, 64-connection
downstream pool and existing acceptance thresholds. The same stack first passed
all-service builds and nine E2E scenarios. The
[retained evidence and reproduction command](../tests/load/baselines/2026-10-24/ten-thousand/README.md)
include a 1,000-buyer control and resource monitoring.

| Buyers | Orders | Sold-out responses | Technical failures | HTTP p95 | Database verification |
| ---: | ---: | ---: | ---: | ---: | --- |
| 1,000 | 200 | 800 | 0 | 4.87 s | Passed |
| 10,000 | 2,000 | 1,219 | 6,781 (67.81%) | 30.43 s | Failed |

Both levels failed latency targets. All 10,000 checkout iterations completed;
6,778 requests timed out and three connections reset. Requests started within
416 ms. The snapshot showed exactly 2,000 orders and sold units, zero duplicate
orders/buyers, and no negative stock or invalid sale counters. However, only
3,796 checkout attempts and 1,734 terminal business conflicts were persisted at
verification time. This proves neither successful handling of all buyers nor
eventual recovery after overload; the test did not wait for a later drain.

This was also a resource-constrained client/server experiment: 210 connection
warmups failed, k6 reached 2,705 MiB RSS and 465.6% sampled CPU, and host-wide
swap-out increased by 1,359 MiB. The resource guard did not abort the run, but
shared-host contention prevents attributing the latency solely to the backend.
The reported 320.96 completed attempts/s includes failures; successful purchases
averaged 64.19/s over this finite burst. Neither number is sustained capacity.

**Do not claim reliable 10,000-buyer capacity on the CV.** This is defensible
evidence of a stress test that exposed timeout and resource limits. The earlier
three-trial 1,000-buyer result below remains the stronger completed-outcomes claim.
Next, isolate the generator on a separate host, require successful connection
warmup, and measure queue wait, service resources and recovery after overload
before changing the implementation or making a capacity claim.

## October 2026 expanded load evidence

Captured on **2026-10-23**. These are observed local measurements, not generated
estimates. The [complete evidence directory](../tests/load/baselines/2026-10-23/README.md)
retains all measured trials, including failures, raw metric summaries, database
checks, source fingerprints, and the original gateway crash signature.

### What changed

The original k6 profile ramped 100 buyers over five seconds, then ran idle
iterations. Its reported 3.24 requests/s included idle time; it did not establish
100 simultaneous checkout requests or sustained capacity. Version 2 uses one
checkout per preinitialized VU, records actual request launch spread, and separates
successful-checkout latency, sold-out latency, response rate, and completed-buyer
rate. Shared fixture data avoids copying all users into each VU.

The first real 500-buyer burst crashed the gateway with `setTypeOfService EINVAL`
in Node's bundled Undici implementation. The gateway now uses pinned Undici
8.12.3 and an explicit dispatcher. Importing patched `fetch` alone was insufficient:
it could reuse Node's older global dispatcher. The regression test injects a
failing socket QoS method and verifies real concurrent forwarding still works.
The upstream cause/fix is documented in [Undici #5547](https://github.com/nodejs/undici/pull/5547).

`GATEWAY_HTTP_MAX_CONNECTIONS` now defaults to 64 connections per downstream
origin. Excess requests wait in the dispatcher; checkout POSTs are not pipelined
or automatically replayed. A transport contract test verifies that a two-connection
pool delivers all twelve queued POSTs once and never exceeds two active requests.
No inventory lock, uniqueness constraint, or order-idempotency check was weakened.

### Environment and method

- Apple M2, 8 logical CPUs, 16 GiB host RAM; macOS/Darwin 22.6.0 arm64.
- Docker Engine 28.2.2 on OrbStack, 8 CPUs and 8,384,352,256 bytes of VM memory.
- Node v24.21.0, k6 v2.3.0; final gateway uses Undici 8.12.3.
- One process per service; PostgreSQL 17 in one container with five service databases;
  one Redpanda v24.3.6 broker (one CPU, 512 MiB); Redis for catalog E2E checks.
  The search cache does not serve checkout. All components and k6 share the host.
- Base commit `2bc48e656329bb998348c870e6bd2a7a4c1385fc` plus uncommitted changes.
  All nine final trials share code SHA-256
  `193c1d1f9719b0b0e74e8adb037e582d33a78e4b0e0f2ee615b443cba9996b80`.
- Fresh users, carts, SKU and sale per trial; one unit requested per buyer;
  sale allocation is 20% of buyer count and base stock equals buyer count.
- Three trials each at 100, 500 and 1,000 buyers, alternating ascending/descending
  load order on the same stack, after a separate five-buyer warmup.
- Authentication, cart preparation and event propagation are outside measurement.
  Each measured checkout still traverses gateway authentication, cart orchestration,
  inventory and order services. This is not an event-throughput benchmark.
- In **warm** mode, each VU establishes a keep-alive connection via `/health`,
  staggered over 1.5 seconds, then waits for a shared 3-second barrier. No warmup
  request failed or missed the barrier. The 1,000 checkout requests actually
  started within 24–64 ms per trial; exact server-side simultaneity was not measured.
- The cold mode sends checkout on a new connection and is retained as a separate
  experiment. This Mac's `kern.ipc.somaxconn` was 128; no OS settings were changed.

### Final warm-connection results

Each value below is the **median of three per-run measurements**, not a pooled
percentile. Raw trials and ranges are in the
[warm comparison](../tests/load/baselines/2026-10-23/pool64-warm/comparison.md).

| Virtual buyers | Orders / sold-out per trial | Burst responses/s | Completed buyers/s | All-response p95 | All-response p99 | Successful-checkout p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 20 / 80 | 245.70 | 49.14 | 398.13 ms | 403.30 ms | 360.25 ms |
| 500 | 100 / 400 | 260.42 | 52.08 | 1,861.02 ms | 1,893.77 ms | 995.17 ms |
| 1,000 | 200 / 800 | 249.56 | 49.91 | 3,898.49 ms | 3,969.99 ms | 1,824.52 ms |

At 1,000 buyers, response throughput ranged from **237.98 to 265.04 responses/s**,
all-response p95 from **3.63 to 4.10 seconds**, and successful-checkout p95 from
**1.79 to 2.20 seconds**. All three trials returned exactly 200 completed checkouts
and 800 `FLASH_SALE_SOLD_OUT` responses, with zero technical failures.

All nine warm trials passed exact database/response verification: orders linked
to checkout IDs, committed reservations linked to carts, expected sold quantity,
zero remaining reserved stock, expected normal-stock decrement, zero duplicate
orders/buyers, and no negative or over-allocated stock counters. These checks
establish observed correctness for this workload; they are not a universal proof.

**The 500- and 1,000-buyer runs failed the existing latency targets** (p95 <1,000 ms,
p99 <2,000 ms, including the wall-time check). The benchmark correctly exited
nonzero. Only the 100-buyer level passed every target in all three trials.
Response throughput stays near 250/s as concurrency increases while latency grows;
this is a measured saturation signal, not evidence of linear scaling. No database
wait/CPU instrumentation was collected to attribute the remaining bottleneck.

Rates use first checkout send through last checkout response, excluding warmup.
Responses/s includes the 800 sold-out rejections. Completed buyers/s counts 200
unique completed purchases over that same interval. Neither rate is sustained
capacity, and this does not claim 1,000 successful purchases per burst.

### Failure and change comparison

| Experiment | Observed result | Evidence |
| --- | --- | --- |
| Bundled HTTP client, cold connections | 100 buyers passed; 500 buyers crashed the gateway, all 500 checkouts were technical failures. Remaining fixture preparations could not reach the gateway. | [Original run](../tests/load/baselines/2026-10-23/bundled-cold/comparison.md) |
| Patched HTTP client, unbounded pool, cold connections | Gateway stayed alive. At 1,000 buyers, 117–132 HTTP 5xx responses per trial, plus other failures; verification failed. | [Patched unbounded trials](../tests/load/baselines/2026-10-23/patched-unbounded-cold/comparison.md) |
| Patched client, 64-connection pool, cold connections | No observed HTTP 5xx; client-to-gateway connection resets remained. At 1,000 buyers, 4–104 technical failures per trial. | [Bounded cold trials](../tests/load/baselines/2026-10-23/pool64-cold/comparison.md) |
| Same bounded client, warm connections | Zero technical failures and exact persisted outcomes in all nine trials; larger levels missed latency targets. | [Bounded warm trials](../tests/load/baselines/2026-10-23/pool64-warm/comparison.md) |

Cold and warm trials change the workload and must not be compared as an application
speedup. The listen backlog is a plausible contributor to cold connection resets,
not a fully isolated root-cause measurement. The supported conclusion is that
cold-connection reliability at 500/1,000 buyers is still unresolved on this host.
The pool bounds outgoing sockets, not the pending request queue; sustained overload,
admission control, uniform deadlines, and recovery after overload need separate tests.

### Reproduction and checks

```bash
# Requires Node >=22.19.0, installed dependencies, Docker, and k6.
npm run test:load-harness
npm run load:flash-sale:benchmark
LOAD_CONNECTION_MODE=warm npm run load:flash-sale:benchmark
```

The matrix runs the full E2E suite and builds all six services before measuring.
Use a fresh `LOAD_MATRIX_DIR` for each invocation. Expect nonzero exit status when
latency or correctness checks fail; read the evidence instead of treating an exit
code as a reason to discard the trial. See [load methodology](../tests/load/README.md).

Validation on this working tree: all-service build and lint passed; 417 unit tests,
26 contract tests, 94 integration tests, 9 E2E scenarios, and 4 load-harness tests
passed. The contract lane initially needed loopback socket access outside the
sandbox; its rerun passed. Disposable processes/containers were cleaned up.

### CV wording supported by this evidence

- Built a six-service NestJS e-commerce backend using REST, gRPC, PostgreSQL and
  Kafka/Redpanda, with a transactional outbox and idempotent consumers for reliable
  event delivery.
- Designed durable checkout orchestration with idempotency keys, inventory
  reservation, replay-safe orders, compensation and persisted reconciliation for
  ambiguous downstream outcomes.
- Stress-tested 1,000-buyer flash-sale bursts on a single machine with warm
  connections: approximately 250 checkout responses/s and 3.9 s p95; verified
  exactly 200 orders from 200 available units, with zero overselling or duplicate
  orders across three trials.

The first two bullets describe implementation, not exactly-once delivery or
production-complete recovery. For the third, say “observed zero” when discussing
correctness, explain that 800 responses were sold-out rejections, and disclose the
failed latency target and cold-connection results. Do not claim 250 orders/s,
1,000 successful orders, a 10x performance improvement, or production capacity.

The following sections retain the historical September evidence.

## Historical environment

| Property          | Value                                                   |
| ----------------- | ------------------------------------------------------- |
| Verification date | 2026-09-22                                              |
| Base commit       | `a14b9de5def436fa72a89383bbe4ab4d973dd5d2`              |
| Source state      | Base commit plus the current uncommitted sprint changes |
| Node.js           | `v24.21.0`                                              |
| npm               | `11.19.0`                                               |
| Docker Engine     | `28.2.2`, build `e6534b4`                               |
| Docker Compose    | `v2.36.2`                                               |
| Host              | macOS 13.7.8, Darwin 22.6.0, arm64                      |
| CPU               | Apple M2, 8 logical cores                               |
| Memory            | 16 GiB                                                  |

The integration and E2E harnesses used `postgres:17-alpine` and
`redpandadata/redpanda:v24.3.6`. PostgreSQL ran as one disposable container
with five isolated databases. Redpanda ran with one broker, one CPU, 512 MiB
memory, and unique topics and consumer groups for each run. All application
and infrastructure ports were allocated dynamically on loopback.

The E2E services used this recovery configuration:

| Setting                            |     Value |
| ---------------------------------- | --------: |
| Product outbox poll interval       |    250 ms |
| Product outbox batch size          |        20 |
| Product outbox lease               |  5,000 ms |
| Product outbox maximum attempts    |         5 |
| Checkout recovery poll interval    | 60,000 ms |
| Checkout recovery batch size       |        20 |
| Checkout recovery lease            |  5,000 ms |
| Checkout recovery maximum attempts |         5 |

The checkout worker performs its initial empty pass at startup and then waits
60 seconds in this harness. That makes the explicit lost-response HTTP retry
deterministic; worker scheduling and lease recovery are covered separately by
unit and PostgreSQL integration tests.

The main correctness datasets were:

- 100 concurrent customers against a sale limit of 20 and base stock of 1,000.
- 100 concurrent customers against a sale limit of 20 and base stock of 5.
- One customer using 20 carts concurrently.
- 20 concurrent order creates for one checkout identity.
- 50 due outbox events claimed by two workers.
- Three prepared customers, base stock 100, and sale limit 5 for load smoke.
- 100 prepared customers, base stock 1,000, and sale limit 20 for the full-stack concurrency profile.

## Automated suites

Historical original-sprint snapshot: these counts, timings, and coverage values
are retained for attribution. The [October 30 review](#october-30-internal-grpc-review)
above records the current gRPC validation results.

| Suite                     | Result |                                 Cases |               Duration |
| ------------------------- | ------ | ------------------------------------: | ---------------------: |
| Unit                      | Pass   |                 373 tests in 59 files |                 2.60 s |
| Contract                  | Pass   |                   18 tests in 4 files |                 0.39 s |
| PostgreSQL integration    | Pass   |                   83 tests in 8 files |       8.50 s test time |
| Kafka integration         | Pass   |                     5 tests in 1 file |      18.48 s test time |
| Complete integration lane | Pass   |                   88 tests in 9 files |      29.10 s test time |
| Gateway E2E               | Pass   |                           8 scenarios |      13.44 s test time |
| Load smoke                | Pass   |          3 VUs, 3 checkout iterations |  0.12 s measured stage |
| Load concurrency          | Pass   | 100 buyers, 20 purchases, 80 sold out | 30.80 s measured stage |

Unit coverage passed the configured thresholds:

| Metric     | Result | Threshold |
| ---------- | -----: | --------: |
| Statements | 75.27% |       70% |
| Lines      | 75.94% |       70% |
| Functions  | 70.86% |       70% |
| Branches   | 66.99% |       60% |

## Correctness evidence

| Evidence                            | Observed result                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maximum concurrent sale reservation | 100 calls started from a barrier; exactly 20 reserved against sale limit 20                                                                        |
| Successful versus sold-out          | 20 successful, 80 `FLASH_SALE_SOLD_OUT`                                                                                                            |
| Counters after reservation          | Normal available 980, normal reserved 20, sale reserved 20, sale sold 0                                                                            |
| Counters after commit               | Normal available 980, normal reserved 0, sale reserved 0, sale sold 20                                                                             |
| Base-stock cap                      | Base stock 5 produced exactly 5 successes and 95 insufficient-stock results; no negative counter                                                   |
| One-per-user claim                  | One customer using 20 carts produced 1 reservation and 19 `FLASH_SALE_LIMIT_REACHED` results                                                       |
| Duplicate orders                    | 20 concurrent creates returned one order ID, one order row, and one item set; duplicate order count 0                                              |
| Duplicate active sale claims        | One active claim for the 20-cart same-user race; duplicate claim count 0                                                                           |
| Outbox worker competition           | Two workers claimed all 50 due rows in disjoint batches; duplicate active outbox claims 0                                                          |
| Product duplicate delivery          | One outbox row was published twice with the same event ID; inventory retained one processed marker and one initialization transaction per SKU      |
| Sale duplicate delivery             | One sale outbox row was published twice; inventory retained one processed marker and one `FlashSaleStock` row per sale item                        |
| Smoke post-run state                | 3 completed checkouts, 3 orders, 3 committed reservations, sale sold 3, sale reserved 0, normal available 97, normal reserved 0                    |
| Full-stack checkout concurrency     | 100 buyers produced exactly 20 completed checkouts and 80 `FLASH_SALE_SOLD_OUT` responses, with 20 orders, 0 duplicate orders, and 0 repeat buyers |
| Lost order response                 | Order persisted before `UNAVAILABLE`; checkout stored `CHECK_ORDER`, stock remained reserved, and the same key resumed the original order          |

The PostgreSQL repository concurrency assertions begin from barriers. The
historical full-stack k6 profile below ramped buyers over five seconds, with one
checkout each and idle iterations afterward; it did not prove 100 simultaneous
HTTP requests. Both paths verify persisted state rather than mocked repositories.

## Historical performance baseline (September 2026)

The smoke profile used k6 2.3.0 with three authenticated users. Authentication,
product creation, sale scheduling, cart creation, and token preparation were
outside the measured checkout stage.

| Metric                          |                                          Result |
| ------------------------------- | ----------------------------------------------: |
| Checkout requests               |                                               3 |
| Request rate                    |                           25.34 requests/second |
| Checkout p50                    |                                        86.07 ms |
| Checkout p95                    |                                       112.66 ms |
| Checkout p99                    |                                       115.02 ms |
| Unexpected technical error rate |                                           0.00% |
| Unexpected HTTP 5xx             |                                               0 |
| Expected business conflicts     |                                               0 |
| Database connection usage       |               Not instrumented in this baseline |
| Kafka publication lag           | Not independently instrumented in this baseline |

The recorded broker-outage E2E scenario completed in 4.70 seconds, including stopping
Redpanda, committing product and sale API requests, restarting the broker, and
waiting for both inventory projections. That duration is an end-to-end test
time and must not be presented as Kafka publication lag.

This baseline ran all six services, PostgreSQL, Redpanda, and k6 on one laptop.
The smoke sample contains three checkout requests. A separate concurrency run
prepared 100 authenticated buyers and exercised one checkout per buyer:

| Metric                          |               Result |
| ------------------------------- | -------------------: |
| Request rate                    | 3.24 requests/second |
| Checkout p50                    |             59.65 ms |
| Checkout p95                    |            513.37 ms |
| Checkout p99                    |            627.06 ms |
| Successful purchases            |                   20 |
| Sold-out business conflicts     |                   80 |
| Unexpected technical error rate |                0.00% |
| Duplicate orders                |                    0 |
| Users purchasing twice          |                    0 |
| Negative inventory rows         |                    0 |

The committed machine-specific result is in
[`tests/load/baselines/concurrency.md`](../tests/load/baselines/concurrency.md).
Both runs use a single broker and region with no production network latency.
They detect contract, correctness, and gross performance regressions; they
cannot establish production capacity.

## Guarantee-to-test traceability

| Implemented guarantee                                                                                                 | Automated evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roles originate from token validation and only administrators mutate products or sales                                | [`roles.guard.spec.ts`](../apps/gateway/src/common/guards/roles.guard.spec.ts), [`grpc-client-failure-injection.integration.spec.ts`](../tests/integration/grpc-client-failure-injection.integration.spec.ts), and the E2E administrator scenario in [`gateway-stack.e2e.spec.ts`](../tests/e2e/gateway-stack.e2e.spec.ts)                                                                                                                                                                                                                 |
| Product, SKUs, and the outbox event commit atomically                                                                 | Atomic success and rollback cases in [`product.prisma.repository.integration.spec.ts`](../apps/product-service/src/catalog/infrastructure/persistence/prisma/product.prisma.repository.integration.spec.ts)                                                                                                                                                                                                                                                                                                                       |
| Stored event identity and bytes remain stable across retries                                                          | [`protobuf-product-event-serializer.spec.ts`](../apps/product-service/src/catalog/infrastructure/messaging/protobuf-product-event-serializer.spec.ts) and the stable-envelope Kafka case in [`kafka-event-delivery.integration.spec.ts`](../tests/integration/kafka-event-delivery.integration.spec.ts)                                                                                                                                                                                                                           |
| Outbox workers claim disjoint batches, fence stale workers, reclaim expired work, and expose the publish crash window | The 50-event, lease, fencing, and republish cases in [`product-outbox.prisma.repository.integration.spec.ts`](../apps/product-service/src/catalog/infrastructure/persistence/prisma/product-outbox.prisma.repository.integration.spec.ts)                                                                                                                                                                                                                                                                                         |
| Product and sale duplicate events are no-ops only for identical payloads                                              | [`inventory.prisma.repository.integration.spec.ts`](../apps/inventory-service/src/inventory/infrastructure/persistence/prisma/inventory.prisma.repository.integration.spec.ts), [`flash-sale-stock.prisma.repository.integration.spec.ts`](../apps/inventory-service/src/inventory/infrastructure/persistence/prisma/flash-sale-stock.prisma.repository.integration.spec.ts), and [`kafka-event-delivery.integration.spec.ts`](../tests/integration/kafka-event-delivery.integration.spec.ts)                                     |
| Scheduling and its sale outbox event are atomic, immutable, and overlap-safe                                          | [`flash-sale.prisma.repository.integration.spec.ts`](../apps/product-service/src/flash-sales/infrastructure/persistence/prisma/flash-sale.prisma.repository.integration.spec.ts) and [`flash-sale.entity.spec.ts`](../apps/product-service/src/flash-sales/domain/entities/flash-sale.entity.spec.ts)                                                                                                                                                                                                                             |
| Effective sale pricing is selected server-side and stored in the cart snapshot                                        | [`get-product-sku-snapshot.use-case.spec.ts`](../apps/product-service/src/catalog/application/use-cases/get-product-sku-snapshot.use-case.spec.ts), [`add-cart-item.use-case.spec.ts`](../apps/cart-service/src/carts/application/use-cases/add-cart-item.use-case.spec.ts), and the sale E2E scenario                                                                                                                                                                                                                            |
| Checkout and order identities converge under concurrent retries                                                       | The 20-call order and checkout-attempt races in [`order-checkout-idempotency.integration.spec.ts`](../tests/integration/order-checkout-idempotency.integration.spec.ts)                                                                                                                                                                                                                                                                                                                                                           |
| Unknown inventory/order outcomes retain a durable next action and avoid destructive compensation                      | [`checkout-recovery.scenarios.spec.ts`](../apps/cart-service/src/carts/application/use-cases/checkout-recovery.scenarios.spec.ts), [`checkout-cart.use-case.spec.ts`](../apps/cart-service/src/carts/application/use-cases/checkout-cart.use-case.spec.ts), [`checkout-reconciliation.worker.spec.ts`](../apps/cart-service/src/carts/infrastructure/workers/checkout-reconciliation.worker.spec.ts), and the persisted-order/lost-response E2E scenario in [`gateway-stack.e2e.spec.ts`](../tests/e2e/gateway-stack.e2e.spec.ts) |
| Sale allocation, normal stock, one-per-user claims, mixed-cart rollback, boundaries, and lifecycle retries are atomic | The real PostgreSQL concurrency matrix in [`inventory.prisma.repository.integration.spec.ts`](../apps/inventory-service/src/inventory/infrastructure/persistence/prisma/inventory.prisma.repository.integration.spec.ts)                                                                                                                                                                                                                                                                                                          |
| Repeated checkout returns the same order and regular checkout remains unaffected                                      | Sale replay and regular regression scenarios in [`gateway-stack.e2e.spec.ts`](../tests/e2e/gateway-stack.e2e.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                             |
| Product and sale creation survive broker outage and inventory catches up                                              | Broker-outage scenario in [`gateway-stack.e2e.spec.ts`](../tests/e2e/gateway-stack.e2e.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 100 ramped buyers produced correct stock and order outcomes                                            | The k6 concurrency profile, its database verifier, and the committed [`concurrency.md`](../tests/load/baselines/concurrency.md) baseline                                                                                                                                                                                                                                                                                                                                                                                          |
| Schema constraints, indexes, compatibility, and repeatable migrations remain valid                                    | [`postgres-migrations.integration.spec.ts`](../tests/integration/postgres-migrations.integration.spec.ts), [`protobuf-backward-compatibility.contract.spec.ts`](../tests/contract/protobuf-backward-compatibility.contract.spec.ts), and the inventory/order proto contract suites                                                                                                                                                                                                                                                |

## Reproduction

From a clean checkout with Docker running:

```bash
npm ci
npm run prisma:generate:all
npm run lint
npm run build:all
npm run test:coverage
npm run test:contract
npm run test:integration
npm run test:e2e
```

The four test lanes can also be run in sequence with `npm run test:all`.

Install k6 2.3.0, then run the CI-equivalent E2E plus smoke path:

```bash
RUN_LOAD_SMOKE=1 npm run test:e2e
```

Reproduce the recorded 100-buyer baseline against the same disposable stack:

```bash
RUN_LOAD_PROFILE=concurrency \
  LOAD_BASELINE_PATH=tests/load/baselines/concurrency.md \
  npm run test:e2e
```

The integration and E2E scripts create unique databases, topics, consumer
groups, containers, and ports. They collect diagnostics and remove their
temporary processes and containers on both success and failure.

## Known limitations

- PostgreSQL remains the hot inventory store.
- There is no virtual queue, Redis/Valkey inventory counter, CDN, or WebSocket
  update path. The later Redis product-search cache does not change the inventory
  design or establish new flash-sale performance evidence for this report.
- The system runs as a single-region design.
- There is no payment provider, payment authorization, or refund workflow.
- Scheduled sales cannot be edited or cancelled in V1.
- Adding an item to a cart does not reserve inventory.
- A sale price remains provisional until checkout succeeds during its active window.
- Cart items are not automatically repriced when a sale starts or ends.
- Exact remaining sale quantities are not exposed publicly.
- Sale stock is a purchase cap, not physically separated stock; regular sales can consume the underlying inventory.
- `ACTIVE` and `ENDED` are calculated from time; no scheduler writes those states to the database.
- V1 fixes `maxQuantityPerUser` at one and does not support customer segments, category discounts, coupons, or seller-created sales.
- Automatic checkout recovery is bounded by retry count and retains terminal diagnostics; there is no admin recovery API.
- A published outbox event has no force-replay command in V1.
- Product updates and deletes do not publish inventory synchronization events.
- Internal HTTP and gRPC services rely on network isolation; there is no mTLS or service identity.
- The current gateway/cart RPC clients have native per-call deadlines. Circuit
  breakers, complete workflow budgets, and broader service resilience policy
  remain follow-up work; the retained October 23–24 trials predate this change.
- Database pool usage and Kafka publication lag are not instrumented as metrics.
- Health endpoints report process liveness and do not prove all dependencies are ready.
- Observability is limited to logs and test artifacts; there are no production metrics, traces, or alerts.
- Production container images and a deployment workflow are not complete.
- Local load results are development baselines, not production capacity guarantees.
