#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${DEMO_LOG_DIR:-$ROOT_DIR/.demo-logs}"
SERVICE_NAMES=()
SERVICE_PIDS=()

cd "$ROOT_DIR"

stop_process_tree() {
  local pid="$1"
  local child

  while IFS= read -r child; do
    if [[ -n "$child" ]]; then
      stop_process_tree "$child"
    fi
  done < <(pgrep -P "$pid" 2>/dev/null || true)

  kill "$pid" 2>/dev/null || true
}

cleanup() {
  local index

  if [[ "${#SERVICE_PIDS[@]}" -gt 0 ]]; then
    echo
    echo "Stopping demo application processes..."
  fi

  for ((index=${#SERVICE_PIDS[@]}-1; index>=0; index--)); do
    stop_process_tree "${SERVICE_PIDS[$index]}"
  done

  for pid in "${SERVICE_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
}

trap cleanup EXIT
trap 'exit 130' INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

port_in_use() {
  node -e '
const net = require("net");
const server = net.createServer();
server.once("error", () => process.exit(0));
server.once("listening", () => server.close(() => process.exit(1)));
server.listen(Number(process.argv[1]), "127.0.0.1");
' "$1"
}

find_available_port() {
  local preferred="$1"
  local fallback="$2"
  local candidate

  if ! port_in_use "$preferred"; then
    echo "$preferred"
    return
  fi

  for ((candidate=fallback; candidate<fallback+100; candidate++)); do
    if ! port_in_use "$candidate"; then
      echo "$candidate"
      return
    fi
  done

  echo "No available local port found near $fallback." >&2
  exit 1
}

assert_port_available() {
  local name="$1"
  local port="$2"

  if port_in_use "$port"; then
    echo "$name cannot start because port $port is already in use." >&2
    echo "Stop the process using that port, then run npm run demo again." >&2
    exit 1
  fi
}

wait_for_command() {
  local name="$1"
  shift
  local attempt

  for attempt in {1..60}; do
    if "$@" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  echo "Timed out waiting for $name." >&2
  exit 1
}

start_service() {
  local name="$1"
  shift
  local log_file="$LOG_DIR/$name.log"

  : > "$log_file"
  "$@" > "$log_file" 2>&1 &
  SERVICE_NAMES+=("$name")
  SERVICE_PIDS+=("$!")
}

wait_for_service() {
  local name="$1"
  local url="$2"
  local pid="$3"
  local log_file="$LOG_DIR/$name.log"
  local attempt

  for attempt in {1..60}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "  ✓ $name"
      return
    fi

    if ! kill -0 "$pid" 2>/dev/null; then
      echo "$name stopped before becoming healthy. Last log lines:" >&2
      tail -n 60 "$log_file" >&2
      exit 1
    fi

    sleep 1
  done

  echo "Timed out waiting for $name at $url. Last log lines:" >&2
  tail -n 60 "$log_file" >&2
  exit 1
}

require_command docker
require_command node
require_command npm
require_command curl
require_command pgrep

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example for the local demo."
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

PRODUCT_SERVICE_PORT="${PRODUCT_SERVICE_PORT:-4001}"
CART_SERVICE_PORT="${CART_SERVICE_PORT:-4002}"
INVENTORY_SERVICE_PORT="${INVENTORY_SERVICE_PORT:-4003}"
ORDER_SERVICE_PORT="${ORDER_SERVICE_PORT:-4004}"
AUTH_SERVICE_PORT="${AUTH_SERVICE_PORT:-4005}"
AUTH_GRPC_PORT="${AUTH_GRPC_PORT:-9005}"
INVENTORY_GRPC_PORT="${INVENTORY_GRPC_PORT:-9003}"
ORDER_GRPC_PORT="${ORDER_GRPC_PORT:-9004}"

REQUESTED_GATEWAY_PORT="${DEMO_GATEWAY_PORT:-${GATEWAY_PORT:-4000}}"
REQUESTED_FRONTEND_PORT="${DEMO_FRONTEND_PORT:-5173}"
GATEWAY_PORT="$(find_available_port "$REQUESTED_GATEWAY_PORT" 4100)"
FRONTEND_PORT="$(find_available_port "$REQUESTED_FRONTEND_PORT" 5174)"
export GATEWAY_PORT

if [[ "$GATEWAY_PORT" != "$REQUESTED_GATEWAY_PORT" ]]; then
  echo "Port $REQUESTED_GATEWAY_PORT is busy; using gateway port $GATEWAY_PORT."
fi
if [[ "$FRONTEND_PORT" != "$REQUESTED_FRONTEND_PORT" ]]; then
  echo "Port $REQUESTED_FRONTEND_PORT is busy; using frontend port $FRONTEND_PORT."
fi

assert_port_available product-service "$PRODUCT_SERVICE_PORT"
assert_port_available cart-service "$CART_SERVICE_PORT"
assert_port_available inventory-service "$INVENTORY_SERVICE_PORT"
assert_port_available order-service "$ORDER_SERVICE_PORT"
assert_port_available auth-service "$AUTH_SERVICE_PORT"
assert_port_available auth-service-gRPC "$AUTH_GRPC_PORT"
assert_port_available inventory-service-gRPC "$INVENTORY_GRPC_PORT"
assert_port_available order-service-gRPC "$ORDER_GRPC_PORT"

if [[ ! -d node_modules ]]; then
  echo "Installing backend dependencies..."
  npm install
fi
if [[ ! -d frontend/node_modules ]]; then
  echo "Installing frontend dependencies..."
  npm --prefix frontend install
fi

mkdir -p "$LOG_DIR"

echo "Starting PostgreSQL databases and Redpanda..."
docker compose up -d

wait_for_command auth-database docker compose exec -T postgres-auth pg_isready -U postgres -d auth_db
wait_for_command product-database docker compose exec -T postgres-product pg_isready -U postgres -d product_db
wait_for_command inventory-database docker compose exec -T postgres-inventory pg_isready -U postgres -d inventory_db
wait_for_command cart-database docker compose exec -T postgres-cart pg_isready -U postgres -d cart_db
wait_for_command order-database docker compose exec -T postgres-order pg_isready -U postgres -d order_db

echo "Preparing Prisma clients and databases..."
for service in auth product inventory cart order; do
  npm run "prisma:$service:generate"
done
for service in auth product inventory cart order; do
  npm run "prisma:$service:deploy"
done
npm run demo:seed

echo "Building backend services..."
npm run build:all

echo "Starting backend services..."
start_service auth env PORT="$AUTH_SERVICE_PORT" npm run start:prod:auth
start_service product env PORT="$PRODUCT_SERVICE_PORT" npm run start:prod:product
start_service inventory env PORT="$INVENTORY_SERVICE_PORT" npm run start:prod:inventory
start_service cart env PORT="$CART_SERVICE_PORT" npm run start:prod:cart
start_service order env PORT="$ORDER_SERVICE_PORT" npm run start:prod:order
start_service gateway env PORT="$GATEWAY_PORT" npm run start:prod:gateway

echo "Waiting for service health checks..."
wait_for_service auth "http://localhost:$AUTH_SERVICE_PORT/health" "${SERVICE_PIDS[0]}"
wait_for_service product "http://localhost:$PRODUCT_SERVICE_PORT/health" "${SERVICE_PIDS[1]}"
wait_for_service inventory "http://localhost:$INVENTORY_SERVICE_PORT/health" "${SERVICE_PIDS[2]}"
wait_for_service cart "http://localhost:$CART_SERVICE_PORT/health" "${SERVICE_PIDS[3]}"
wait_for_service order "http://localhost:$ORDER_SERVICE_PORT/health" "${SERVICE_PIDS[4]}"
wait_for_service gateway "http://localhost:$GATEWAY_PORT/health" "${SERVICE_PIDS[5]}"

echo "Starting React frontend..."
start_service frontend env \
  VITE_GATEWAY_PROXY_TARGET="http://localhost:$GATEWAY_PORT" \
  npm --prefix frontend run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort
wait_for_service frontend "http://127.0.0.1:$FRONTEND_PORT" "${SERVICE_PIDS[6]}"

echo
echo "Demo is ready: http://localhost:$FRONTEND_PORT"
echo "Gateway:       http://localhost:$GATEWAY_PORT"
echo "Credentials:   testuser@test.com / password123"
echo "Logs:          $LOG_DIR"
echo
echo "Press Ctrl+C to stop the application processes."
echo "Docker infrastructure will remain running for faster restarts."

while true; do
  for index in "${!SERVICE_PIDS[@]}"; do
    if ! kill -0 "${SERVICE_PIDS[$index]}" 2>/dev/null; then
      echo "${SERVICE_NAMES[$index]} stopped unexpectedly. Last log lines:" >&2
      tail -n 60 "$LOG_DIR/${SERVICE_NAMES[$index]}.log" >&2
      exit 1
    fi
  done
  sleep 2
done
