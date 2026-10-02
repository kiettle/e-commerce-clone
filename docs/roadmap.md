# Roadmap and Handoff

This file is the compact source of truth for future work. Update it when a
milestone is completed, reprioritized, or intentionally deferred. Do not copy
the README or preserve a diary of completed steps.

## Current Baseline

The implemented vertical flow is:

```text
login -> create product -> publish ProductCreated -> initialize inventory
-> add snapshot to cart -> reserve stock -> create order -> commit stock
-> complete cart
```

The current tree also contains the checkout reliability foundation:

- caller-provided UUID v4 idempotency keys;
- durable checkout attempts with request hashes and item snapshots;
- replay-safe order creation keyed by checkout ID;
- order lookup after an ambiguous create response;
- persisted reconciliation actions and HTTP `202` pending responses;
- a leased reconciliation worker with bounded retries and expired-lease recovery;
- idempotent inventory commit after order confirmation;
- an owner-scoped checkout-status endpoint for polling durable state;
- reproducible scripts for replay, conflict, lost-response, and migration
  verification;
- focused unit tests around auth, inventory, order, checkout, persistence
  adapters, and gateway checkout mapping.

This foundation still needs full-stack checkout recovery proof before it should
be described as production complete.

## Priority 1: Finish Checkout Reliability

Goal: retries and ambiguous failures converge without manual API replay.

- Update the frontend to generate one UUID v4 `Idempotency-Key` per checkout
  intent and reuse it for retries.
- Add full-stack recovery tests across the real inventory and order services.
- Decide whether committed and released reservations need expiration or
  archival.
- Keep worker concurrency safe with database-backed claiming; do not rely on an
  in-memory mutex.

Done when:

- the same idempotency key always returns or converges on the same outcome;
- two keys cannot checkout the same cart;
- a lost order response cannot create a duplicate order or release stock for a
  confirmed order;
- pending work is processed after a service restart;
- the UI and demo script handle `200`, `202`, and terminal failures.

## Priority 2: Add Integration and End-to-End Evidence

Goal: prove the database and transport guarantees that unit tests cannot.

- PostgreSQL tests for active-cart uniqueness, checkout-attempt uniqueness,
  row-lock transitions, order uniqueness, rollback, and competing stock updates.
- Kafka test for product publish/consume and duplicate event delivery.
- gRPC tests for inventory reserve/release and order create/query contracts.
- End-to-end tests through the gateway for login to successful checkout, an
  idempotent replay, and an order-failure compensation path.
- Add CI that starts dependencies, applies migrations, and runs build, lint,
  unit, integration, and end-to-end checks.

Done when the tests fail on a broken constraint or contract, not merely on a
mocked method call.

## Priority 3: Reliable Product Events

Goal: a committed product cannot permanently miss inventory initialization.

- Write product state and an outbox row in one product-database transaction.
- Publish pending outbox rows with retry/backoff and mark them delivered.
- Keep inventory's processed-event table as the consumer-side idempotency
  boundary.
- Add tests for producer failure, duplicate delivery, and restart recovery.

## Priority 4: Authorization and Operability

- Restrict catalog mutations by role and derive seller identity from the
  authenticated principal.
- Add explicit HTTP/gRPC deadlines and conservative retry policies.
- Propagate a correlation ID through gateway, HTTP, gRPC, and Kafka boundaries.
- Split liveness from dependency readiness.
- Make the application container/deployment path reproducible.

## Deferred Scope

Defer these until the priorities above are complete unless a requirement changes:

- payments, shipping, order history, and cancellation;
- search infrastructure and caching;
- Kubernetes, Terraform, service mesh, and multi-region deployment;
- broad tracing or abstractions without an immediate consumer.

## Handoff Template for Future Prompts

Use this context when asking another agent to continue work:

```text
Read AGENTS.md, README.md, docs/development-guide.md, and docs/roadmap.md.
Work on: <one roadmap item>.

Preserve service ownership and Clean Architecture boundaries. Inspect the
current implementation before changing it because source and migrations are
authoritative. Add tests that prove behavior, not startup. Keep the gateway
thin and do not add deferred infrastructure.

Acceptance criteria:
- <observable behavior>
- <failure or concurrency behavior>
- relevant focused tests pass
- npm run build:all, npm run lint, and npm test pass

Update docs/roadmap.md only if the milestone state or next priority changes.
```

For a smaller prompt, name the exact service, behavior, failure mode, and
acceptance test. Avoid requests such as "make it production ready" because they
hide scope and make review difficult.
