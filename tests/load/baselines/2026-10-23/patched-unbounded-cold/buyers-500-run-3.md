# Flash-sale concurrency baseline

Captured: 2026-10-23T13:53:35.463Z

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
| Prepared users | 500 |
| Sale stock limit | 100 |
| Base inventory | 500 |
| Checkout retries per user | 1 |

## Results

Performance thresholds: **FAILED**.
k6 exit: 99; verifier exit: 1.


| Metric | Result | Initial threshold |
| --- | ---: | ---: |
| Unexpected technical failure rate | 23.80% | < 1% |
| Unexpected HTTP 5xx | 0 | 0 |
| Business conflicts | 329 | Functional outcome |
| Sold-out conflicts | 329 | Profile dependent |
| Purchase-limit conflicts | 0 | Profile dependent |
| Successful checkout users | 52 | Profile dependent |
| Burst response window | 3706.00 ms | First send to last response |
| Request launch spread | 18.00 ms | Not exact simultaneity |
| Burst response throughput | 134.92 responses/s | Includes sold-out and retries |
| Burst completed-buyer throughput | 14.03 buyers/s | Excludes sold-out and replays |
| Successful checkout p95 | 3685.77 ms | Informational |
| Sold-out/limit response p95 | 2616.51 ms | Informational |
| Checkout wall-time p95 | 3580.30 ms | < 1,000 ms |
| Pending HTTP 202 | 50 | Not a completed purchase |
| Whole-scenario request rate | 134.88 requests/s | Informational |
| Checkout p50 | 2297.87 ms | Informational |
| Checkout p95 | 3575.79 ms | < 1,000 ms |
| Checkout p99 | 3675.08 ms | < 2,000 ms |
| Active-sale read p95 | n/a | < 500 ms |
| Product read p95 | n/a | Informational |

## Post-run invariants

| Check | Value |
| --- | ---: |
| Status | FAILED |
| Completed checkouts | 52 |
| Orders | 100 |
| Committed reservations | 52 |
| Sold-out responses | 329 |
| Purchase-limit responses | 0 |
| Duplicate orders | 0 |
| Users purchasing twice | 0 |
| Sale sold quantity | 52 |
| Sale reserved quantity | 48 |
| Normal available quantity | 400 |
| Normal reserved quantity | 48 |
| Negative normal inventory rows | 0 |
| Invalid sale counter rows | 0 |

Failures: completed checkout count: expected 100, received 52.; committed reservation count: expected 100, received 52.; sale sold quantity: expected 100, received 52.; sale reserved quantity: expected 0, received 48.; normal reserved quantity: expected 0, received 48.; Reservation for cart 3533 is not linked to its checkout.; Reservation for cart 3525 is not linked to its checkout.; Reservation for cart 3501 is not linked to its checkout.; Reservation for cart 3345 is not linked to its checkout.; Reservation for cart 3341 is not linked to its checkout.; Reservation for cart 3536 is not linked to its checkout.; Reservation for cart 3531 is not linked to its checkout.; Reservation for cart 3337 is not linked to its checkout.; Reservation for cart 3504 is not linked to its checkout.; Reservation for cart 3537 is not linked to its checkout.; Reservation for cart 3357 is not linked to its checkout.; Reservation for cart 3355 is not linked to its checkout.; Reservation for cart 3348 is not linked to its checkout.; Reservation for cart 3397 is not linked to its checkout.; Reservation for cart 3389 is not linked to its checkout.; Reservation for cart 3499 is not linked to its checkout.; Reservation for cart 3346 is not linked to its checkout.; Reservation for cart 3364 is not linked to its checkout.; Reservation for cart 3500 is not linked to its checkout.; Reservation for cart 3394 is not linked to its checkout.; Reservation for cart 3376 is not linked to its checkout.; Reservation for cart 3526 is not linked to its checkout.; Reservation for cart 3321 is not linked to its checkout.; Reservation for cart 3316 is not linked to its checkout.; Reservation for cart 3393 is not linked to its checkout.; Reservation for cart 3371 is not linked to its checkout.; Reservation for cart 3502 is not linked to its checkout.; Reservation for cart 3534 is not linked to its checkout.; Reservation for cart 3319 is not linked to its checkout.; Reservation for cart 3505 is not linked to its checkout.; Reservation for cart 3528 is not linked to its checkout.; Reservation for cart 3809 is not linked to its checkout.; Reservation for cart 3388 is not linked to its checkout.; Reservation for cart 3529 is not linked to its checkout.; Reservation for cart 3498 is not linked to its checkout.; Reservation for cart 3509 is not linked to its checkout.; Reservation for cart 3396 is not linked to its checkout.; Reservation for cart 3386 is not linked to its checkout.; Reservation for cart 3506 is not linked to its checkout.; Reservation for cart 3381 is not linked to its checkout.; Reservation for cart 3647 is not linked to its checkout.; Reservation for cart 3372 is not linked to its checkout.; Reservation for cart 3356 is not linked to its checkout.; Reservation for cart 3521 is not linked to its checkout.; Reservation for cart 3362 is not linked to its checkout.; Reservation for cart 3491 is not linked to its checkout.; Reservation for cart 3407 is not linked to its checkout.; Reservation for cart 3384 is not linked to its checkout.; checkout-attempt count: expected 500, received 431.; terminal business-conflict count: expected 400, received 329.; technical failure count: expected 0, received 119.; k6 successful-user count: expected 100, received 52.; k6 business-conflict count: expected 400, received 329.; k6 sold-out conflict count: expected 400, received 329..

Command against a fresh prepared stack:
`LOAD_VUS=500 LOAD_STOCK_LIMIT=100 LOAD_BASE_INVENTORY=500 LOAD_RETRIES=1 npm run load:flash-sale:concurrency`

Rates describe a finite burst, not sustained capacity. Setup/login is excluded.
Latency trends use k6 HTTP duration; wall time also includes connection setup.
Raw metrics, scenario options, source fingerprint, and verification accompany this report.

