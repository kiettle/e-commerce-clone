# Flash-sale concurrency baseline

Captured: 2026-10-23T13:53:25.849Z

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
Code SHA-256 (includes untracked source): `e77617917a82a4b9856d8a5fb41833daec50736e3a3e0810917cd415a58f0950`.
k6: k6 v2.3.0 (commit/devel, go1.27.1, darwin/arm64). Docker: 28.2.2; CPUs=8; memoryBytes=8384352256; OS=OrbStack.

## Profile

| Setting | Value |
| --- | ---: |
| Profile | concurrency |
| Benchmark version | 2 |
| Executor | per-vu-iterations |
| Prepared users | 100 |
| Sale stock limit | 20 |
| Base inventory | 100 |
| Checkout retries per user | 1 |

## Results

Performance thresholds: **PASSED**.
k6 exit: 0; verifier exit: 0.


| Metric | Result | Initial threshold |
| --- | ---: | ---: |
| Unexpected technical failure rate | 0.00% | < 1% |
| Unexpected HTTP 5xx | 0 | 0 |
| Business conflicts | 80 | Functional outcome |
| Sold-out conflicts | 80 | Profile dependent |
| Purchase-limit conflicts | 0 | Profile dependent |
| Successful checkout users | 20 | Profile dependent |
| Burst response window | 832.00 ms | First send to last response |
| Request launch spread | 5.00 ms | Not exact simultaneity |
| Burst response throughput | 120.19 responses/s | Includes sold-out and retries |
| Burst completed-buyer throughput | 24.04 buyers/s | Excludes sold-out and replays |
| Successful checkout p95 | 825.53 ms | Informational |
| Sold-out/limit response p95 | 688.22 ms | Informational |
| Checkout wall-time p95 | 816.30 ms | < 1,000 ms |
| Pending HTTP 202 | 0 | Not a completed purchase |
| Whole-scenario request rate | 120.14 requests/s | Informational |
| Checkout p50 | 546.24 ms | Informational |
| Checkout p95 | 813.86 ms | < 1,000 ms |
| Checkout p99 | 825.35 ms | < 2,000 ms |
| Active-sale read p95 | n/a | < 500 ms |
| Product read p95 | n/a | Informational |

## Post-run invariants

| Check | Value |
| --- | ---: |
| Status | PASSED |
| Completed checkouts | 20 |
| Orders | 20 |
| Committed reservations | 20 |
| Sold-out responses | 80 |
| Purchase-limit responses | 0 |
| Duplicate orders | 0 |
| Users purchasing twice | 0 |
| Sale sold quantity | 20 |
| Sale reserved quantity | 0 |
| Normal available quantity | 80 |
| Normal reserved quantity | 0 |
| Negative normal inventory rows | 0 |
| Invalid sale counter rows | 0 |

Failures: none.

Command against a fresh prepared stack:
`LOAD_VUS=100 LOAD_STOCK_LIMIT=20 LOAD_BASE_INVENTORY=100 LOAD_RETRIES=1 npm run load:flash-sale:concurrency`

Rates describe a finite burst, not sustained capacity. Setup/login is excluded.
Latency trends use k6 HTTP duration; wall time also includes connection setup.
Raw metrics, scenario options, source fingerprint, and verification accompany this report.

