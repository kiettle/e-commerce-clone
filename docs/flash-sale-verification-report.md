# Flash-sale verification report

This report records the local verification baseline for the authenticated
flash-sale workflow, durable product outbox, sale-aware checkout, and
idempotent inventory/order behavior. It is evidence for a development build,
not a production capacity claim.

## Environment

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

The concurrency assertions are database-backed and begin from barriers. They do
not infer correctness from sequential promises or mocked repositories.

## Performance baseline

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
| Roles originate from token validation and only administrators mutate products or sales                                | [`roles.guard.spec.ts`](../apps/gateway/src/common/guards/roles.guard.spec.ts), [`grpc-client-failure-injection.contract.spec.ts`](../tests/contract/grpc-client-failure-injection.contract.spec.ts), and the E2E administrator scenario in [`gateway-stack.e2e.spec.ts`](../tests/e2e/gateway-stack.e2e.spec.ts)                                                                                                                                                                                                                 |
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
| 100 concurrent buyers cannot oversell, duplicate orders, or purchase twice                                            | The k6 concurrency profile, its database verifier, and the committed [`concurrency.md`](../tests/load/baselines/concurrency.md) baseline                                                                                                                                                                                                                                                                                                                                                                                          |
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
- There is no virtual queue, Redis/Valkey, CDN, or WebSocket update path.
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
- Service clients do not yet have a uniform deadline, circuit-breaker, and retry policy.
- Database pool usage and Kafka publication lag are not instrumented as metrics.
- Health endpoints report process liveness and do not prove all dependencies are ready.
- Observability is limited to logs and test artifacts; there are no production metrics, traces, or alerts.
- Production container images and a deployment workflow are not complete.
- Local load results are development baselines, not production capacity guarantees.
