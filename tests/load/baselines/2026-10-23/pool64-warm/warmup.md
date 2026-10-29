# Flash-sale smoke baseline

Captured: 2026-10-23T14:00:14.191Z

This is a local or CI development baseline. It is not a production-capacity claim.

## Machine

| Property | Value |
| --- | --- |
| CPU | Apple M2 |
| Logical CPUs | 8 |
| Memory | 16.0 GiB |
| OS | darwin 22.6.0 arm64 |
| Node.js | v24.21.0 |

Source: `2bc48e656329bb998348c870e6bd2a7a4c1385fc`; dirty working tree: **true**.
Code SHA-256 (includes untracked source): `193c1d1f9719b0b0e74e8adb037e582d33a78e4b0e0f2ee615b443cba9996b80`.
k6: k6 v2.3.0 (commit/devel, go1.27.1, darwin/arm64). Docker: 28.2.2; CPUs=8; memoryBytes=8384352256; OS=OrbStack.
Undici: 8.12.3; gateway HTTP connections/origin: 64.
Stack: One process per service; postgres:17-alpine with five databases; redpandadata/redpanda:v24.3.6 single broker, one CPU, 512 MiB; checkout recovery poll 60000 ms. HTTP request timeout: 30s.

## Profile

| Setting | Value |
| --- | ---: |
| Profile | smoke |
| Connection mode | warm |
| Connection warmup | 3000 ms |
| Benchmark version | 2 |
| Executor | per-vu-iterations |
| Prepared users | 5 |
| Sale stock limit | 5 |
| Base inventory | 100 |
| Checkout retries per user | 1 |

## Results

Performance thresholds: **PASSED**.
k6 exit: 0; verifier exit: 0.


| Metric | Result | Initial threshold |
| --- | ---: | ---: |
| Unexpected technical failure rate | 0.00% | < 1% |
| Unexpected HTTP 5xx | 0 | 0 |
| Business conflicts | 0 | Functional outcome |
| Sold-out conflicts | 0 | Profile dependent |
| Purchase-limit conflicts | 0 | Profile dependent |
| Successful checkout users | 5 | Profile dependent |
| Burst response window | 136.00 ms | First send to last response |
| Request launch spread | 1.00 ms | Not exact simultaneity |
| Burst response throughput | 36.76 responses/s | Includes sold-out and retries |
| Burst completed-buyer throughput | 36.76 buyers/s | Excludes sold-out and replays |
| Successful checkout p95 | 135.40 ms | Informational |
| Sold-out/limit response p95 | n/a | Informational |
| Checkout wall-time p95 | 134.80 ms | < 1,000 ms |
| Connection warmup failures | 0 | 0 |
| Buyers missing warmup barrier | 0 | 0 |
| Pending HTTP 202 | 0 | Not a completed purchase |
| Whole-scenario request rate | 3.19 requests/s | Informational |
| Checkout p50 | 132.58 ms | Informational |
| Checkout p95 | 135.40 ms | < 1,000 ms |
| Checkout p99 | 135.72 ms | < 2,000 ms |
| Active-sale read p95 | n/a | < 500 ms |
| Product read p95 | n/a | Informational |

## Post-run invariants

| Check | Value |
| --- | ---: |
| Status | PASSED |
| Completed checkouts | 5 |
| Orders | 5 |
| Committed reservations | 5 |
| Sold-out responses | 0 |
| Purchase-limit responses | 0 |
| Duplicate orders | 0 |
| Users purchasing twice | 0 |
| Sale sold quantity | 5 |
| Sale reserved quantity | 0 |
| Normal available quantity | 95 |
| Normal reserved quantity | 0 |
| Negative normal inventory rows | 0 |
| Invalid sale counter rows | 0 |

Failures: none.

Command against a fresh prepared stack:
`LOAD_CONNECTION_MODE=warm LOAD_VUS=5 LOAD_STOCK_LIMIT=5 LOAD_BASE_INVENTORY=100 LOAD_RETRIES=1 npm run load:flash-sale:smoke`

Rates describe a finite burst, not sustained capacity. Setup/login is excluded.
Latency trends use k6 HTTP duration; wall time also includes connection setup.
Raw metrics, scenario options, source fingerprint, and verification accompany this report.

