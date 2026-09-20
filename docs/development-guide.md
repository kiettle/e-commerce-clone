# Development Guide

This guide contains the durable rules for changing the repository. Use the
[README](../README.md) for setup, ports, APIs, and the demo. Use the
[roadmap](roadmap.md) for unfinished work and handoff context.

Source code, Prisma migrations, and protobuf contracts are authoritative when a
document falls behind.

## Project Boundaries

The repository is one NestJS monorepo with six separately runnable services:

| Service             | Owns                                         | Main interfaces                 |
| ------------------- | -------------------------------------------- | ------------------------------- |
| `gateway`           | Public API boundary                          | REST in; HTTP and auth gRPC out |
| `auth-service`      | Users, passwords, and tokens                 | REST and gRPC                   |
| `product-service`   | Categories, products, and SKUs               | REST and Kafka producer         |
| `inventory-service` | Stock and reservations                       | Kafka consumer and gRPC         |
| `cart-service`      | Carts, item snapshots, and checkout attempts | REST; HTTP and gRPC clients     |
| `order-service`     | Orders and order-item snapshots              | gRPC                            |

Each stateful service owns its own PostgreSQL database. Never join across those
databases. Communicate through REST, gRPC, Kafka events, or stored snapshots.

## Architecture Rules

Business domains use this lightweight Clean Architecture layout:

```text
domain/          entities, enums, errors, repository ports
application/     use cases, commands/results, external ports
infrastructure/  Prisma repositories and transport clients
presentation/    HTTP or gRPC controllers and transport DTOs
```

Keep the dependency direction one way:

```text
presentation -> application -> domain
infrastructure -> application/domain ports
```

When changing code:

- Keep controllers responsible for validation, mapping, and status codes only.
- Put business decisions in use cases or domain objects.
- Keep Prisma, Nest decorators, HTTP, Kafka, and gRPC out of the domain layer.
- Inject ports through explicit Nest provider tokens.
- Keep the gateway thin; it must not own business rules or databases.
- Put shared transport contracts in `libs/proto`.
- Put only reusable technical helpers in `libs/common`, never shared business
  logic.
- Use typed DTOs with `class-validator` for public input.
- Read URLs, ports, topics, credentials, and secrets from the environment.
- Never log passwords, bearer tokens, or sensitive request bodies.

## Important Invariants

- Authenticated user IDs come from the validated request context, not request
  bodies or hardcoded values.
- Cart and order items store product snapshots; they do not read another
  service's database.
- Inventory validates a complete reservation request before mutating stock.
- Inventory commits all reservation items atomically after order confirmation;
  a repeated commit is a no-op.
- Product event IDs make inventory initialization idempotent.
- A user can have at most one active cart.
- Checkout callers provide a UUID v4 `Idempotency-Key` and reuse it for retries.
- Cart checkout attempts persist their item snapshot, request hash, state, and
  next reconciliation action.
- Order creation uses the checkout ID as a unique identity and rejects a reused
  identity whose user, cart, or request hash differs.
- Ambiguous downstream outcomes are stored as `RECONCILIATION_REQUIRED` and
  returned as HTTP `202`; a retry with the same key resumes the attempt.
- Completed checkout POSTs return HTTP `200` with stable checkout and order IDs.
  Pending attempts return `202`, malformed requests return `400`, and key/cart
  conflicts return `409`.
- Checkout status reads are owner-scoped. Missing and non-owned checkout IDs
  both return `404`, and the public response omits recovery internals and raw
  stored error text.
- Order totals are calculated in `order-service` from the persisted checkout
  snapshot.

These rules provide replay safety, but they are not a distributed ACID
transaction. A background reconciliation worker and infrastructure-level proof
are still future work.

## Checkout Retry Contract

The caller creates one UUID v4 `Idempotency-Key` for a checkout intent and
reuses it for every retry of that cart. It must not generate a replacement key
after a timeout.

The cart service looks up the durable attempt before checking current cart
state. A completed retry returns the original checkout and order IDs. A pending
retry executes the stored recovery action. `CHECK_ORDER` always queries the
order service before reissuing idempotent order creation, and unknown order
outcomes never release inventory.

`GET /api/checkouts/:checkoutId` returns `checkoutId`, `cartId`, durable
`status`, nullable `orderId`, sanitized nullable `lastError`, and the attempt's
`createdAt` and `updatedAt` timestamps. `FAILED` is terminal;
`RECONCILIATION_REQUIRED` remains pending. Other stored statuses describe
progress within the current checkout workflow. Lease ownership, retry timing,
request hashes, snapshots, and reconciliation actions are internal fields.

There is no automatic reconciliation worker yet. HTTP `202` means the work is
durably recoverable, not that it will advance without a caller retry. After an
order is confirmed, checkout commits stock before completing the cart. An
uncertain commit stores `COMMIT_STOCK` and retries that idempotent operation;
it does not create another order or release inventory.

## Testing Style

Use colocated Vitest files named `*.spec.ts`.

Choose the smallest test boundary that proves the behavior:

1. Test application use cases with fake or mocked ports.
2. Test domain invariants directly.
3. Test pure serializers, hashes, and mappers without Nest.
4. Test controllers with mocked use cases or clients.
5. Use real PostgreSQL, Kafka, or gRPC only for integration tests.
6. Reserve end-to-end tests for complete public workflows.

Unit tests should instantiate the subject directly. Do not use a Nest
`TestingModule`, database, broker, network, or filesystem unless the test is
explicitly verifying an integration boundary.

Use Arrange, Act, Assert and name the observable behavior:

```ts
it('returns the existing order when the checkout request is replayed', async () => {});
```

Do not claim that mocked Prisma tests prove row locks, unique constraints,
transaction rollback, or concurrency. Those require PostgreSQL integration
tests.

## Change Workflow

Before editing:

1. Read the owning service's domain, use case, adapter, schema, and related
   tests.
2. Check the [roadmap](roadmap.md) so the change advances the current priority.
3. Keep the change inside one service boundary unless a contract must change.

When a contract changes:

1. Update the file in `libs/proto` or the public DTO.
2. Update the producer/client and consumer/server together.
3. Add contract mapping tests.
4. Update the README only if the public API or demo changes.

When a Prisma schema changes:

1. Update the owning service's schema.
2. Add a migration; do not edit an already-applied migration.
3. Regenerate that service's Prisma client.
4. Test the repository behavior against PostgreSQL when correctness depends on
   constraints, locks, or transactions.

## Verification

Run the focused test while iterating, then run the repository checks before
finishing a source change:

```bash
npm run build:all
npm run lint
npm test
```

For frontend changes, also run:

```bash
npm run frontend:build
npm run frontend:lint
```

For documentation-only changes, verify Markdown links and references; full
application builds are unnecessary unless the documentation makes an
implementation claim that needs confirmation.

## Documentation Rules

Keep documentation intentionally small:

- `README.md`: what the project is, how to run it, public interfaces, and demo.
- `docs/development-guide.md`: stable contribution and architecture rules.
- `docs/roadmap.md`: current gaps, priorities, acceptance criteria, and handoff
  context for future prompts.
- `docs/assets/`: images referenced by maintained documents.

Do not add separate status reviews, interview notes, weekly plans, or testing
tutorials. Put durable rules here and actionable future work in the roadmap.
Delete completed roadmap detail instead of preserving it as historical prose;
Git already provides history.
