# Flash-sale concurrency baseline

Captured: 2026-10-23T13:53:46.627Z

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
| Prepared users | 1000 |
| Sale stock limit | 200 |
| Base inventory | 1000 |
| Checkout retries per user | 1 |

## Results

Performance thresholds: **FAILED**.
k6 exit: 99; verifier exit: 1.


| Metric | Result | Initial threshold |
| --- | ---: | ---: |
| Unexpected technical failure rate | 39.50% | < 1% |
| Unexpected HTTP 5xx | 123 | 0 |
| Business conflicts | 453 | Functional outcome |
| Sold-out conflicts | 453 | Profile dependent |
| Purchase-limit conflicts | 0 | Profile dependent |
| Successful checkout users | 152 | Profile dependent |
| Burst response window | 4002.00 ms | First send to last response |
| Request launch spread | 52.00 ms | Not exact simultaneity |
| Burst response throughput | 249.88 responses/s | Includes sold-out and retries |
| Burst completed-buyer throughput | 37.98 buyers/s | Excludes sold-out and replays |
| Successful checkout p95 | 3950.40 ms | Informational |
| Sold-out/limit response p95 | 3336.38 ms | Informational |
| Checkout wall-time p95 | 3851.15 ms | < 1,000 ms |
| Pending HTTP 202 | 272 | Not a completed purchase |
| Whole-scenario request rate | 249.89 requests/s | Informational |
| Checkout p50 | 3021.82 ms | Informational |
| Checkout p95 | 3826.81 ms | < 1,000 ms |
| Checkout p99 | 3942.94 ms | < 2,000 ms |
| Active-sale read p95 | n/a | < 500 ms |
| Product read p95 | n/a | Informational |

## Post-run invariants

| Check | Value |
| --- | ---: |
| Status | FAILED |
| Completed checkouts | 152 |
| Orders | 200 |
| Committed reservations | 152 |
| Sold-out responses | 453 |
| Purchase-limit responses | 0 |
| Duplicate orders | 0 |
| Users purchasing twice | 0 |
| Sale sold quantity | 152 |
| Sale reserved quantity | 48 |
| Normal available quantity | 800 |
| Normal reserved quantity | 48 |
| Negative normal inventory rows | 0 |
| Invalid sale counter rows | 0 |

Failures: completed checkout count: expected 200, received 152.; committed reservation count: expected 200, received 152.; sale sold quantity: expected 200, received 152.; sale reserved quantity: expected 0, received 48.; normal reserved quantity: expected 0, received 48.; Reservation for cart 3927 is not linked to its checkout.; Reservation for cart 3892 is not linked to its checkout.; Reservation for cart 4030 is not linked to its checkout.; Reservation for cart 4027 is not linked to its checkout.; Reservation for cart 4085 is not linked to its checkout.; Reservation for cart 4138 is not linked to its checkout.; Reservation for cart 3899 is not linked to its checkout.; Reservation for cart 3890 is not linked to its checkout.; Reservation for cart 3909 is not linked to its checkout.; Reservation for cart 4047 is not linked to its checkout.; Reservation for cart 4055 is not linked to its checkout.; Reservation for cart 3989 is not linked to its checkout.; Reservation for cart 4096 is not linked to its checkout.; Reservation for cart 3841 is not linked to its checkout.; Reservation for cart 3988 is not linked to its checkout.; Reservation for cart 3904 is not linked to its checkout.; Reservation for cart 3839 is not linked to its checkout.; Reservation for cart 3895 is not linked to its checkout.; Reservation for cart 4038 is not linked to its checkout.; Reservation for cart 4623 is not linked to its checkout.; Reservation for cart 4013 is not linked to its checkout.; Reservation for cart 4084 is not linked to its checkout.; Reservation for cart 3826 is not linked to its checkout.; Reservation for cart 3903 is not linked to its checkout.; Reservation for cart 4041 is not linked to its checkout.; Reservation for cart 4033 is not linked to its checkout.; Reservation for cart 3901 is not linked to its checkout.; Reservation for cart 3997 is not linked to its checkout.; Reservation for cart 3862 is not linked to its checkout.; Reservation for cart 3861 is not linked to its checkout.; Reservation for cart 4610 is not linked to its checkout.; Reservation for cart 3828 is not linked to its checkout.; Reservation for cart 4050 is not linked to its checkout.; Reservation for cart 3900 is not linked to its checkout.; Reservation for cart 4046 is not linked to its checkout.; Reservation for cart 4644 is not linked to its checkout.; Reservation for cart 4135 is not linked to its checkout.; Reservation for cart 3840 is not linked to its checkout.; Reservation for cart 4044 is not linked to its checkout.; Reservation for cart 3823 is not linked to its checkout.; Reservation for cart 3837 is not linked to its checkout.; Reservation for cart 4007 is not linked to its checkout.; Reservation for cart 3953 is not linked to its checkout.; Reservation for cart 3879 is not linked to its checkout.; Reservation for cart 4043 is not linked to its checkout.; Reservation for cart 3934 is not linked to its checkout.; Reservation for cart 3843 is not linked to its checkout.; Reservation for cart 4199 is not linked to its checkout.; checkout-attempt count: expected 1000, received 877.; terminal business-conflict count: expected 800, received 453.; unexpected HTTP 5xx count: expected 0, received 123.; technical failure count: expected 0, received 395.; k6 successful-user count: expected 200, received 152.; k6 business-conflict count: expected 800, received 453.; k6 sold-out conflict count: expected 800, received 453..

Command against a fresh prepared stack:
`LOAD_VUS=1000 LOAD_STOCK_LIMIT=200 LOAD_BASE_INVENTORY=1000 LOAD_RETRIES=1 npm run load:flash-sale:concurrency`

Rates describe a finite burst, not sustained capacity. Setup/login is excluded.
Latency trends use k6 HTTP duration; wall time also includes connection setup.
Raw metrics, scenario options, source fingerprint, and verification accompany this report.

