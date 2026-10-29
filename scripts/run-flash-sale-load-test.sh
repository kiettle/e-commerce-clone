#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${1:-smoke}"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/flash-sale-load.XXXXXX")"
CREATED_FIXTURE=0

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT INT TERM

case "$PROFILE" in
  smoke|concurrency|retry-storm|reads) ;;
  *)
    echo "Unsupported flash-sale load profile: $PROFILE" >&2
    exit 1
    ;;
esac

if ! command -v k6 >/dev/null 2>&1; then
  echo 'k6 is required. Install k6 from https://grafana.com/docs/k6/latest/set-up/install-k6/.' >&2
  exit 1
fi

cd "$ROOT_DIR"

FIXTURE_PATH="${LOAD_FIXTURE:-$TEMP_DIR/fixture.json}"
ARTIFACT_DIR="${LOAD_ARTIFACT_DIR:-artifacts/load/$(date -u +%Y%m%dT%H%M%SZ)-$$-${PROFILE}}"
mkdir -p "$ARTIFACT_DIR"
ARTIFACT_DIR="$(cd "$ARTIFACT_DIR" && pwd)"
RESULT_PATH="${LOAD_RESULT_PATH:-$ARTIFACT_DIR/k6-result.json}"
INVARIANT_PATH="$ARTIFACT_DIR/invariants.json"
BASELINE_PATH="${LOAD_BASELINE_PATH:-tests/load/baselines/${PROFILE}.md}"
if [[ -e "$RESULT_PATH" || -e "$INVARIANT_PATH" ]]; then
  echo 'Load evidence already exists; choose fresh LOAD_RESULT_PATH and LOAD_ARTIFACT_DIR.' >&2
  exit 1
fi

if [[ -z "${LOAD_FIXTURE:-}" ]]; then
  CREATED_FIXTURE=1
  node tests/load/support/prepare-flash-sale-fixture.cjs "$PROFILE" "$FIXTURE_PATH"
fi

echo "[load] Running $PROFILE profile against $(node -e 'const f=require(process.argv[1]); process.stdout.write(f.gatewayUrl)' "$FIXTURE_PATH")..."
set +e
export K6_SUMMARY_TREND_STATS="${K6_SUMMARY_TREND_STATS:-avg,min,med,p(90),p(95),p(99),max}"
LOAD_PROFILE="$PROFILE" \
LOAD_FIXTURE="$FIXTURE_PATH" \
LOAD_RESULT_PATH="$RESULT_PATH" \
  k6 run tests/load/flash-sale-profiles.k6.mjs >"$ARTIFACT_DIR/k6.log" 2>&1
K6_EXIT=$?
cat "$ARTIFACT_DIR/k6.log"

node tests/load/support/verify-flash-sale-invariants.cjs \
  "$FIXTURE_PATH" "$RESULT_PATH" "$INVARIANT_PATH" >"$ARTIFACT_DIR/verification.log" 2>&1
VERIFY_EXIT=$?
cat "$ARTIFACT_DIR/verification.log"
set -e
if [[ ! -f "$INVARIANT_PATH" ]]; then
  printf '%s\n' '{"invariantStatus":"ERROR","failures":["Verification could not finish; see verification.log"]}' >"$INVARIANT_PATH"
fi

if [[ -f "$RESULT_PATH" ]]; then
  LOAD_K6_EXIT="$K6_EXIT" LOAD_VERIFY_EXIT="$VERIFY_EXIT" node tests/load/support/write-load-baseline.cjs \
    "$PROFILE" "$FIXTURE_PATH" "$RESULT_PATH" "$INVARIANT_PATH" "$BASELINE_PATH"
fi

echo "[load] Raw evidence retained in $ARTIFACT_DIR (fixtures containing tokens are excluded)."

if [[ "$K6_EXIT" -ne 0 ]]; then
  echo "[load] k6 failed or a performance threshold was exceeded." >&2
fi
if [[ "$VERIFY_EXIT" -ne 0 ]]; then
  echo "[load] Post-run database invariants failed." >&2
fi

if [[ "$CREATED_FIXTURE" -eq 1 ]]; then
  echo '[load] Fixture rows are intentionally retained for inspection in the dedicated load environment.'
fi

if [[ "$K6_EXIT" -ne 0 || "$VERIFY_EXIT" -ne 0 ]]; then
  exit 1
fi

echo "[load] $PROFILE profile and post-run invariants passed."
