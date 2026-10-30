# Marketflow frontend

A focused React demo client for the repository's end-to-end microservices flow.
It talks only to the public gateway and does not contain a mock API layer.

## Run locally

From the repository root, the complete backend and frontend demo can be started
with one command:

```bash
npm run demo
```

The same command also works when your terminal is already inside `frontend/`.

Press `Ctrl+C` in that terminal to stop the application processes.

### Frontend only

Start the backend infrastructure, seeds, and six services as documented in the
root README. Then run:

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and use the prefilled demo credentials.

The Vite development and preview servers proxy `/api` and `/health` to
`http://localhost:4000`. To change the local gateway port, set
`VITE_GATEWAY_PROXY_TARGET`. To call a different CORS-enabled gateway directly,
copy `.env.example` to `.env` and set `VITE_API_BASE_URL`.

## Demo path

1. Sign in through the gateway and auth-service gRPC.
2. Browse or search through the gateway, which calls product-service over gRPC.
3. Optionally create a product and publish its initial stock event.
4. Add a real SKU to cart, adjust its quantity, and review the snapshot.
5. Confirm checkout. The client creates one UUID v4 key per cart and stores it in session storage.
6. For HTTP `202`, the dialog shows recovery in progress and offers an explicit retry using that same key. It keeps the existing cart until completion.
7. Only a completed response displays the receipt with stable `checkoutId` and `orderId`.

The key survives reloads in the same browser tab/origin, including after a `504`.
Session storage does not provide cross-tab, cross-device, or closed-tab recovery.
The UI does not automatically replay a checkout POST or claim that a timeout
rolled back an order. Automatic status polling is not implemented.

## Internal path and validation

Public calls stay HTTP/JSON at the gateway; auth, catalog, cart, inventory, and
order business connections use gRPC internally. The frontend never calls a
service database or an internal gRPC port. Public dependency failures use `503`
and gateway RPC deadline expiry uses `504`.

Run `npm run frontend:build` and `npm run frontend:lint` from the repository
root. The root `npm run test:unit` and `npm run test:coverage` commands include
`src/lib/api.spec.ts`, covering stable checkout keys, pending responses, explicit
retry, and module reloads. For a changed gateway port, the demo launcher sets
the Vite proxy target automatically; use the gateway URL printed by the launcher
when running `GATEWAY_URL=<url> npm run verify:checkout-sprint`.
