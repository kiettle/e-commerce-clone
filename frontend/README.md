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
5. Confirm checkout to reserve inventory and create the order.
6. Capture the order receipt containing the persisted `orderId`.
