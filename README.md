# E-commerce NestJS Microservices

A Shopee-like backend rebuilt as a NestJS monorepo. The project focuses on a small but meaningful commerce workflow: products publish stock events, inventory owns reservations, carts orchestrate checkout, and orders persist the final purchase snapshot.

## Why This Project Exists

This repository is a portfolio backend project for demonstrating:

- NestJS monorepo structure with separately deployable services
- Clean Architecture boundaries inside each business service
- PostgreSQL database ownership per service
- gRPC service-to-service calls
- Kafka-compatible product events through Redpanda
- Checkout compensation logic when order creation fails
- Focused unit tests around risky application behavior

## Service Map

| Service | Port | Responsibility |
| --- | ---: | --- |
| `gateway` | 4000 | Public HTTP entry point, auth forwarding, Swagger docs |
| `auth-service` | 4005 / gRPC 9005 | Users, login, JWT generation, token validation |
| `product-service` | 4001 | Categories, products, SKUs, product-created events |
| `inventory-service` | 4003 / gRPC 9003 | Stock rows, product event consumer, reserve/release stock |
| `cart-service` | 4002 | Active carts, cart items, checkout orchestration |
| `order-service` | 4004 / gRPC 9004 | Order creation, order items, server-side totals |

## Main Workflow

```text
create product
  -> publish ProductCreated event
  -> inventory creates stock rows
  -> add SKU to cart
  -> checkout cart
  -> reserve stock
  -> create order
  -> mark cart checked out
```

If order creation fails after inventory reservation, `cart-service` calls inventory `ReleaseStock` as compensation.

## Current API Surface

### Gateway

- `POST /api/auth/login`
- `GET /api/auth/validate`
- Swagger UI: `GET /docs`

### Product Service

- `GET /api/categories`
- `POST /api/categories`
- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/:productId`
- `DELETE /api/products/:productId`

### Cart Service

- `GET /api/carts/me`
- `POST /api/cart-items`
- `PUT /api/cart-items/:cartItemId`
- `DELETE /api/cart-items/:cartItemId`
- `POST /api/carts/:cartId/checkout`

### gRPC Contracts

- Auth: `Login`, `ValidateToken`
- Inventory: `ReserveStock`, `ReleaseStock`
- Order: `CreateOrder`

Shared protobuf files live in `libs/proto`.

## Local Setup

Install dependencies:

```bash
npm install
```

Copy environment variables:

```bash
cp .env.example .env
```

Start local infrastructure:

```bash
docker compose up -d
```

Generate Prisma clients:

```bash
npm run prisma:auth:generate
npm run prisma:product:generate
npm run prisma:inventory:generate
npm run prisma:cart:generate
npm run prisma:order:generate
```

Run migrations when the matching databases are available:

```bash
npm run prisma:auth:migrate
npm run prisma:product:migrate
npm run prisma:inventory:migrate
npm run prisma:cart:migrate
npm run prisma:order:migrate
```

Seed available demo data:

```bash
npm run prisma:auth:seed
npm run prisma:product:seed
```

## Running Services

Run services in separate terminals:

```bash
npm run start:dev:gateway
npm run start:dev:auth
npm run start:dev:product
npm run start:dev:inventory
npm run start:dev:cart
npm run start:dev:order
```

## Quality Checks

```bash
npm run build:all
npm run lint
npm test
```

## Basic Local Verification

After the services are running, check the basic HTTP surfaces:

```bash
curl http://localhost:4000/health
curl http://localhost:4001/health
curl http://localhost:4002/health
curl http://localhost:4003/health
curl http://localhost:4004/health
curl http://localhost:4005/health
```

Open gateway Swagger docs:

```text
http://localhost:4000/docs
```

At the moment, gateway exposes auth routes. Product and cart APIs can be called
directly while gateway forwarding is still being built.

## Architecture Notes

- Controllers are thin and map transport input to application commands.
- Use cases contain business flow and depend on ports, not Prisma, Kafka, or gRPC clients.
- Infrastructure adapters implement repository and service ports.
- Each business service owns its own Prisma schema and database.
- `libs/common` is reserved for technical helpers only, not shared business logic.

## Current Gaps To Finish Next

- Gateway still needs forwarding routes for product/cart/checkout APIs.
- Add a simple demo script or README curl flow after gateway forwarding is complete.
- Add integration tests for the full checkout workflow after unit-test practice.
