# Roadmap and Handoff

Use this file for remaining work and acceptance criteria. The
[README](../README.md) owns setup/configuration, the
[development guide](development-guide.md) owns stable rules, and the
[verification report](flash-sale-verification-report.md) owns retained evidence.
Source, migrations, and executable tests are authoritative.

## Current Baseline

The six services implement:

```text
public gateway HTTP -> auth/product/cart gRPC
cart -> product snapshot -> inventory reserve -> order create/find
-> inventory commit -> durable cart completion
product transaction + outbox -> Kafka -> idempotent inventory projections
```

Implemented behavior includes:

- Separate PostgreSQL databases and service-owned business rules.
- Admin-protected catalog/flash-sale mutations and owner-scoped checkout status.
- Cart gRPC business APIs; duplicate cart/auth REST business routes removed.
- Native gateway/cart per-call deadlines, `503` for unavailable dependencies,
  `504` for expired gateway calls, and `202` only for persisted recovery results.
- Caller UUID v4 checkout keys, frozen snapshots/hashes, replay-safe orders,
  idempotent stock operations, and leased reconciliation with bounded retries.
- Frontend keys persisted across same-tab reloads, explicit pending retries,
  and completed receipts; automatic status polling is not implemented.
- Transactional product/sale outbox, retry/backoff, failed-event replay CLI,
  and idempotent event consumption with payload conflict detection.
- Redis product-search cache with TTL, bounded commands, database fallback,
  and integration/E2E coverage; writes do not invalidate searches.
- Worker/consumer draining before client/database closure, including failed drains.
- Unit/coverage, protobuf contract, PostgreSQL/Kafka/Redis/gRPC integration,
  full gateway E2E, product-outbox demonstrations, and CI/load-smoke lanes.

The tests prove defined local behaviors, not complete production readiness.
Historical HTTP pool benchmarks do not establish capacity for the current gRPC
transport. Preserve failed overload trials and their original thresholds.

## Priority 1: Close Remaining Recovery and Client Gaps

- Add a full-stack process-kill/restart scenario proving the cart worker resumes
  persisted pending work without an immediate caller POST. Existing E2E proves
  lost-order-response recovery by same-key retry; unit/integration tests cover
  claiming, leases, and worker behavior.
- Add checkout-status polling and recovery UX for an interrupted/closed browser
  tab or another device. Session storage currently covers reloads in one tab.
- Expose operational visibility for exhausted reconciliation attempts and decide
  which ID-scoped manual recovery actions are safe.
- Decide retention/archival for attempts and committed/released reservations.

Done when restart-driven recovery is proven through real services, client
recovery does not silently replace an existing checkout identity, and exhausted
work is diagnosable without unsafe stock release or duplicate order creation.

## Priority 2: Measure gRPC Capacity and Overload Recovery

- Establish a new gRPC baseline using the existing load harness and unchanged
  correctness/latency thresholds; keep historical HTTP evidence separate.
- Investigate DB pool/lock waits, request queues, cold connection behavior,
  sustained arrival rates, and recovery after overload in a dedicated environment.
- Tune per-call deadlines using measurements. End-to-end request budgets and
  admission control remain distinct from native RPC deadlines.

Done when repeated trials preserve stock/order invariants and failures remain
visible and recoverable. A three-buyer smoke test is a wiring/invariant check,
not a capacity claim.

## Priority 3: Security, Operations, and Deployment

- Add service identity/TLS and enforce private internal ports; a gRPC `user_id`
  is trusted context, not independent authentication.
- Review product seller identity: catalog mutations require admin, but product
  creation still accepts a seller ID; flash-sale creator identity already comes
  from the authenticated principal.
- Add meaningful readiness separate from HTTP liveness, correlation IDs, and
  metrics for RPC failures, outbox lag, recovery age, and database contention.
- Make service container images and coordinated configuration/cutover reproducible.
- Define inventory synchronization for product updates/deletes, which currently
  do not emit corresponding inventory events.

Done when service access and deployment are explicit and measured recovery
behavior is observable without logging credentials, tokens, or sensitive bodies.

## Deferred Scope

- Payments, shipping, order history, and cancellation.
- Reservation expiry or scheduled-sale cancellation without a defined recovery
  design; scheduled campaigns are immutable in the current implementation.
- Search infrastructure beyond PostgreSQL and the current optional search cache;
  write invalidation, stampede coordination, and Redis clustering need a measured use case.
- Kubernetes, Terraform, service mesh, multi-region deployment, and broad
  framework abstractions without an immediate consumer.

## Handoff Template

```text
Read AGENTS.md, README.md, docs/development-guide.md, and docs/roadmap.md.
Work on: <one remaining behavior and its owning service>.

Inspect source and related tests before changing implementation. Preserve
service/data ownership, explicit checkout identities, uncertainty handling,
and Clean Architecture dependency direction.

Acceptance criteria:
- <observable successful behavior>
- <failure, replay, or concurrency behavior>
- required build/lint/unit/coverage/contract checks pass
- integration checks for infrastructure; E2E for complete workflows
- docs describe the current code and separate retained historical evidence
```
