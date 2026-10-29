#!/usr/bin/env bash
# Sourced by the integration and E2E runners, which own cleanup traps.

start_test_redis() {
  # Explicitly reserve a host port: Docker's automatic assignment changes on restart.
  local redis_port
  redis_port="$(node -e '
const server = require("node:net").createServer();
server.listen(0, "127.0.0.1", () => {
  process.stdout.write(String(server.address().port));
  server.close();
});
')"
  docker run --detach --name "$REDIS_TEST_CONTAINER" \
    --publish "127.0.0.1:${redis_port}:6379" "${REDIS_TEST_IMAGE:-redis:8-alpine}" \
    redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru \
    --appendonly no --save '' >/dev/null
  wait_for_test_redis
  export PRODUCT_REDIS_URL="redis://127.0.0.1:${redis_port}"
  export PRODUCT_CACHE_ENABLED=true
  export PRODUCT_CACHE_TTL_SECONDS=2
  export PRODUCT_CACHE_TIMEOUT_MS=100
  export PRODUCT_CACHE_DEBUG=false
}

wait_for_test_redis() {
  for _attempt in {1..150}; do
    if docker exec "$REDIS_TEST_CONTAINER" redis-cli ping 2>/dev/null | grep -q PONG; then
      return
    fi
    sleep 0.2
  done
  echo '[redis-test] Timed out waiting for isolated Redis.' >&2
  return 1
}
