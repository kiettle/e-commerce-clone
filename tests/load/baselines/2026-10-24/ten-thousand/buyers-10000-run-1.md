# Flash-sale concurrency baseline

Captured: 2026-10-23T23:02:40.748Z

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
| Profile | concurrency |
| Connection mode | warm |
| Connection warmup | 3000 ms |
| Benchmark version | 2 |
| Executor | per-vu-iterations |
| Prepared users | 10000 |
| Sale stock limit | 2000 |
| Base inventory | 10000 |
| Checkout retries per user | 1 |

## Results

Performance thresholds: **FAILED**.
k6 exit: 99; verifier exit: 1.


| Metric | Result | Initial threshold |
| --- | ---: | ---: |
| Unexpected technical failure rate | 67.81% | < 1% |
| Unexpected HTTP 5xx | 0 | 0 |
| Business conflicts | 1219 | Functional outcome |
| Sold-out conflicts | 1219 | Profile dependent |
| Purchase-limit conflicts | 0 | Profile dependent |
| Successful checkout users | 2000 | Profile dependent |
| Burst response window | 31157.00 ms | First send to last response |
| Request launch spread | 416.00 ms | Not exact simultaneity |
| Burst response throughput | 320.96 responses/s | Includes sold-out and retries |
| Burst completed-buyer throughput | 64.19 buyers/s | Excludes sold-out and replays |
| Successful checkout p95 | 24610.65 ms | Informational |
| Sold-out/limit response p95 | 29779.92 ms | Informational |
| Checkout wall-time p95 | 30886.00 ms | < 1,000 ms |
| Connection warmup failures | 210 | 0 |
| Buyers missing warmup barrier | 0 | 0 |
| Pending HTTP 202 | 0 | Not a completed purchase |
| Whole-scenario request rate | 583.96 requests/s | Informational |
| Checkout p50 | 30074.90 ms | Informational |
| Checkout p95 | 30426.72 ms | < 1,000 ms |
| Checkout p99 | 30461.67 ms | < 2,000 ms |
| Active-sale read p95 | n/a | < 500 ms |
| Product read p95 | n/a | Informational |

## Post-run invariants

| Check | Value |
| --- | ---: |
| Status | FAILED |
| Completed checkouts | 2000 |
| Orders | 2000 |
| Committed reservations | 2000 |
| Sold-out responses | 1219 |
| Purchase-limit responses | 0 |
| Duplicate orders | 0 |
| Users purchasing twice | 0 |
| Sale sold quantity | 2000 |
| Sale reserved quantity | 0 |
| Normal available quantity | 8000 |
| Normal reserved quantity | 0 |
| Negative normal inventory rows | 0 |
| Invalid sale counter rows | 0 |

Failures: checkout-attempt count: expected 10000, received 3796.; terminal business-conflict count: expected 8000, received 1734.; technical failure count: expected 0, received 6781.; k6 business-conflict count: expected 8000, received 1219.; k6 sold-out conflict count: expected 8000, received 1219..

Command against a fresh prepared stack:
`LOAD_CONNECTION_MODE=warm LOAD_VUS=10000 LOAD_STOCK_LIMIT=2000 LOAD_BASE_INVENTORY=10000 LOAD_RETRIES=1 npm run load:flash-sale:concurrency`

Rates describe a finite burst, not sustained capacity. Setup/login is excluded.
Latency trends use k6 HTTP duration; wall time also includes connection setup.
Raw metrics, scenario options, source fingerprint, and verification accompany this report.

