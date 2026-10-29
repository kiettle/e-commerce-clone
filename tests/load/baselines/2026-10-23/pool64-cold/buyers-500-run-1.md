# Flash-sale concurrency baseline

Captured: 2026-10-23T13:56:26.064Z

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
| Prepared users | 500 |
| Sale stock limit | 100 |
| Base inventory | 500 |
| Checkout retries per user | 1 |

## Results

Performance thresholds: **FAILED**.
k6 exit: 99; verifier exit: 1.


| Metric | Result | Initial threshold |
| --- | ---: | ---: |
| Unexpected technical failure rate | 4.60% | < 1% |
| Unexpected HTTP 5xx | 0 | 0 |
| Business conflicts | 377 | Functional outcome |
| Sold-out conflicts | 377 | Profile dependent |
| Purchase-limit conflicts | 0 | Profile dependent |
| Successful checkout users | 100 | Profile dependent |
| Burst response window | 1984.00 ms | First send to last response |
| Request launch spread | 20.00 ms | Not exact simultaneity |
| Burst response throughput | 252.02 responses/s | Includes sold-out and retries |
| Burst completed-buyer throughput | 50.40 buyers/s | Excludes sold-out and replays |
| Successful checkout p95 | 1048.93 ms | Informational |
| Sold-out/limit response p95 | 1868.80 ms | Informational |
| Checkout wall-time p95 | 1913.10 ms | < 1,000 ms |
| Pending HTTP 202 | 0 | Not a completed purchase |
| Whole-scenario request rate | 252.06 requests/s | Informational |
| Checkout p50 | 1336.15 ms | Informational |
| Checkout p95 | 1860.31 ms | < 1,000 ms |
| Checkout p99 | 1892.59 ms | < 2,000 ms |
| Active-sale read p95 | n/a | < 500 ms |
| Product read p95 | n/a | Informational |

## Post-run invariants

| Check | Value |
| --- | ---: |
| Status | FAILED |
| Completed checkouts | 100 |
| Orders | 100 |
| Committed reservations | 100 |
| Sold-out responses | 377 |
| Purchase-limit responses | 0 |
| Duplicate orders | 0 |
| Users purchasing twice | 0 |
| Sale sold quantity | 100 |
| Sale reserved quantity | 0 |
| Normal available quantity | 400 |
| Normal reserved quantity | 0 |
| Negative normal inventory rows | 0 |
| Invalid sale counter rows | 0 |

Failures: checkout-attempt count: expected 500, received 477.; terminal business-conflict count: expected 400, received 377.; technical failure count: expected 0, received 23.; k6 business-conflict count: expected 400, received 377.; k6 sold-out conflict count: expected 400, received 377..

Command against a fresh prepared stack:
`LOAD_VUS=500 LOAD_STOCK_LIMIT=100 LOAD_BASE_INVENTORY=500 LOAD_RETRIES=1 npm run load:flash-sale:concurrency`

Rates describe a finite burst, not sustained capacity. Setup/login is excluded.
Latency trends use k6 HTTP duration; wall time also includes connection setup.
Raw metrics, scenario options, source fingerprint, and verification accompany this report.

