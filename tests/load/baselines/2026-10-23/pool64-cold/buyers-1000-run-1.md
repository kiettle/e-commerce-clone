# Flash-sale concurrency baseline

Captured: 2026-10-23T13:56:36.818Z

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
Code SHA-256 (includes untracked source): `faeb7dcc5816c260f6f6ddb9395b938dd8d55df534affe3d147bc62167a5f9e8`.
k6: k6 v2.3.0 (commit/devel, go1.27.1, darwin/arm64). Docker: 28.2.2; CPUs=8; memoryBytes=8384352256; OS=OrbStack.
Undici: 8.12.3; gateway HTTP connections/origin: 64.
Stack: One process per service; postgres:17-alpine with five databases; redpandadata/redpanda:v24.3.6 single broker, one CPU, 512 MiB; checkout recovery poll 60000 ms. HTTP request timeout: 30s.

## Profile

| Setting | Value |
| --- | ---: |
| Profile | concurrency |
| Benchmark version | 2 |
| Executor | per-vu-iterations |
| Prepared users | 1000 |
| Sale stock limit | 200 |
| Base inventory | 1000 |
| Checkout retries per user | 1 |

## Results

Performance thresholds: **FAILED**.
k6 exit: 99; verifier exit: 1.


| Metric | Result | Initial threshold |
| --- | ---: | ---: |
| Unexpected technical failure rate | 1.00% | < 1% |
| Unexpected HTTP 5xx | 0 | 0 |
| Business conflicts | 790 | Functional outcome |
| Sold-out conflicts | 790 | Profile dependent |
| Purchase-limit conflicts | 0 | Profile dependent |
| Successful checkout users | 200 | Profile dependent |
| Burst response window | 4506.00 ms | First send to last response |
| Request launch spread | 108.00 ms | Not exact simultaneity |
| Burst response throughput | 221.93 responses/s | Includes sold-out and retries |
| Burst completed-buyer throughput | 44.39 buyers/s | Excludes sold-out and replays |
| Successful checkout p95 | 2040.54 ms | Informational |
| Sold-out/limit response p95 | 4001.43 ms | Informational |
| Checkout wall-time p95 | 4301.10 ms | < 1,000 ms |
| Pending HTTP 202 | 0 | Not a completed purchase |
| Whole-scenario request rate | 221.89 requests/s | Informational |
| Checkout p50 | 2950.13 ms | Informational |
| Checkout p95 | 3996.41 ms | < 1,000 ms |
| Checkout p99 | 4027.57 ms | < 2,000 ms |
| Active-sale read p95 | n/a | < 500 ms |
| Product read p95 | n/a | Informational |

## Post-run invariants

| Check | Value |
| --- | ---: |
| Status | FAILED |
| Completed checkouts | 200 |
| Orders | 200 |
| Committed reservations | 200 |
| Sold-out responses | 790 |
| Purchase-limit responses | 0 |
| Duplicate orders | 0 |
| Users purchasing twice | 0 |
| Sale sold quantity | 200 |
| Sale reserved quantity | 0 |
| Normal available quantity | 800 |
| Normal reserved quantity | 0 |
| Negative normal inventory rows | 0 |
| Invalid sale counter rows | 0 |

Failures: checkout-attempt count: expected 1000, received 990.; terminal business-conflict count: expected 800, received 790.; technical failure count: expected 0, received 10.; k6 business-conflict count: expected 800, received 790.; k6 sold-out conflict count: expected 800, received 790..

Command against a fresh prepared stack:
`LOAD_VUS=1000 LOAD_STOCK_LIMIT=200 LOAD_BASE_INVENTORY=1000 LOAD_RETRIES=1 npm run load:flash-sale:concurrency`

Rates describe a finite burst, not sustained capacity. Setup/login is excluded.
Latency trends use k6 HTTP duration; wall time also includes connection setup.
Raw metrics, scenario options, source fingerprint, and verification accompany this report.

