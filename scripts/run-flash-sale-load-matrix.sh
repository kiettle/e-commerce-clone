#!/usr/bin/env bash
# Run serially against one dedicated stack. Keep every run, including failures.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
OUTPUT="${LOAD_MATRIX_DIR:-artifacts/load-matrix/$(date -u +%Y%m%dT%H%M%SZ)-$$}"
REPEATS="${LOAD_REPEATS:-3}"
read -r -a LEVELS <<< "${LOAD_LEVELS:-100 500 1000}"
if [[ ! "$REPEATS" =~ ^[1-9][0-9]*$ ]]; then
  echo 'LOAD_REPEATS must be a positive integer.' >&2
  exit 1
fi
for level in "${LEVELS[@]}"; do
  if [[ ! "$level" =~ ^[1-9][0-9]*$ || "$level" -gt 10000 ]]; then
    echo 'LOAD_LEVELS must contain integer buyer counts from 1 to 10000.' >&2
    exit 1
  fi
done
if [[ -n "${LOAD_FIXTURE:-}" ]]; then
  echo 'Matrix requires a fresh fixture per run; unset LOAD_FIXTURE.' >&2
  exit 1
fi
if [[ -e "$OUTPUT" ]]; then
  echo "Matrix output already exists: $OUTPUT. Choose a fresh LOAD_MATRIX_DIR to avoid mixing trials." >&2
  exit 1
fi
mkdir -p "$OUTPUT"
FAILED=0
# Warm up every service's checkout path, but exclude it from the comparison.
LOAD_VUS=5 LOAD_STOCK_LIMIT=5 LOAD_BASE_INVENTORY=100 \
  LOAD_BASELINE_PATH="$OUTPUT/warmup.md" LOAD_ARTIFACT_DIR="$OUTPUT/warmup" \
  bash scripts/run-flash-sale-load-test.sh smoke
for ((repeat=1; repeat<=REPEATS; repeat++)); do
  for ((position=0; position<${#LEVELS[@]}; position++)); do
    # Alternate direction to expose some warm-cache/order effects.
    index="$position"
    if (( repeat % 2 == 0 )); then index=$((${#LEVELS[@]} - 1 - position)); fi
    buyers="${LEVELS[$index]}"
    stock="$(node -e '
      const ratio = Number(process.env.LOAD_STOCK_RATIO || 0.2);
      if (!(ratio > 0 && ratio <= 1)) throw new Error("LOAD_STOCK_RATIO must be in (0, 1].");
      console.log(Math.max(1, Math.floor(Number(process.argv[1]) * ratio)));
    ' "$buyers")"
    label="buyers-${buyers}-run-${repeat}"
    echo "[load-matrix] $label; stock=$stock"
    if ! LOAD_VUS="$buyers" LOAD_STOCK_LIMIT="$stock" LOAD_BASE_INVENTORY="$buyers" \
      LOAD_BASELINE_PATH="$OUTPUT/$label.md" LOAD_ARTIFACT_DIR="$OUTPUT/$label" \
      bash scripts/run-flash-sale-load-test.sh concurrency; then
      FAILED=1
    fi
  done
done
node tests/load/support/write-load-matrix.cjs "$OUTPUT" "$REPEATS" "${LEVELS[@]}"
echo "[load-matrix] All results (including failures): $OUTPUT/comparison.md"
exit "$FAILED"
