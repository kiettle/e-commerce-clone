# Flash-sale concurrency baseline

Captured: 2026-10-23T13:48:10.941Z

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
Code SHA-256 (includes untracked source): `b135a2202f23acff264b3d58b19a07835cd2c5190318fcc43c2366d21623f0b0`.
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
| Unexpected technical failure rate | 100.00% | < 1% |
| Unexpected HTTP 5xx | 22 | 0 |
| Business conflicts | 0 | Functional outcome |
| Sold-out conflicts | 0 | Profile dependent |
| Purchase-limit conflicts | 0 | Profile dependent |
| Successful checkout users | 0 | Profile dependent |
| Burst response window | 351.00 ms | First send to last response |
| Request launch spread | 43.00 ms | Not exact simultaneity |
| Burst response throughput | 1424.50 responses/s | Includes sold-out and retries |
| Burst completed-buyer throughput | 0.00 buyers/s | Excludes sold-out and replays |
| Successful checkout p95 | n/a | Informational |
| Sold-out/limit response p95 | n/a | Informational |
| Checkout wall-time p95 | 346.00 ms | < 1,000 ms |
| Pending HTTP 202 | 0 | Not a completed purchase |
| Whole-scenario request rate | 1423.48 requests/s | Informational |
| Checkout p50 | 311.13 ms | Informational |
| Checkout p95 | 328.90 ms | < 1,000 ms |
| Checkout p99 | 329.96 ms | < 2,000 ms |
| Active-sale read p95 | n/a | < 500 ms |
| Product read p95 | n/a | Informational |

## Post-run invariants

| Check | Value |
| --- | ---: |
| Status | FAILED |
| Completed checkouts | 7 |
| Orders | 100 |
| Committed reservations | 8 |
| Sold-out responses | 0 |
| Purchase-limit responses | 0 |
| Duplicate orders | 0 |
| Users purchasing twice | 0 |
| Sale sold quantity | 8 |
| Sale reserved quantity | 92 |
| Normal available quantity | 400 |
| Normal reserved quantity | 92 |
| Negative normal inventory rows | 0 |
| Invalid sale counter rows | 0 |

Failures: completed checkout count: expected 100, received 7.; committed reservation count: expected 100, received 8.; sale sold quantity: expected 100, received 8.; sale reserved quantity: expected 0, received 92.; normal reserved quantity: expected 0, received 92.; Reservation for cart 128 is not linked to its checkout.; Reservation for cart 113 is not linked to its checkout.; Reservation for cart 225 is not linked to its checkout.; Reservation for cart 129 is not linked to its checkout.; Reservation for cart 119 is not linked to its checkout.; Reservation for cart 213 is not linked to its checkout.; Reservation for cart 115 is not linked to its checkout.; Reservation for cart 159 is not linked to its checkout.; Reservation for cart 198 is not linked to its checkout.; Reservation for cart 184 is not linked to its checkout.; Reservation for cart 477 is not linked to its checkout.; Reservation for cart 259 is not linked to its checkout.; Reservation for cart 174 is not linked to its checkout.; Reservation for cart 233 is not linked to its checkout.; Reservation for cart 166 is not linked to its checkout.; Reservation for cart 315 is not linked to its checkout.; Reservation for cart 285 is not linked to its checkout.; Reservation for cart 382 is not linked to its checkout.; Reservation for cart 126 is not linked to its checkout.; Reservation for cart 383 is not linked to its checkout.; Reservation for cart 454 is not linked to its checkout.; Reservation for cart 162 is not linked to its checkout.; Reservation for cart 188 is not linked to its checkout.; Reservation for cart 175 is not linked to its checkout.; Reservation for cart 381 is not linked to its checkout.; Reservation for cart 411 is not linked to its checkout.; Reservation for cart 158 is not linked to its checkout.; Reservation for cart 270 is not linked to its checkout.; Reservation for cart 268 is not linked to its checkout.; Reservation for cart 227 is not linked to its checkout.; Reservation for cart 123 is not linked to its checkout.; Reservation for cart 230 is not linked to its checkout.; Reservation for cart 231 is not linked to its checkout.; Reservation for cart 358 is not linked to its checkout.; Reservation for cart 468 is not linked to its checkout.; Reservation for cart 134 is not linked to its checkout.; Reservation for cart 374 is not linked to its checkout.; Reservation for cart 378 is not linked to its checkout.; Reservation for cart 130 is not linked to its checkout.; Reservation for cart 283 is not linked to its checkout.; Reservation for cart 202 is not linked to its checkout.; Reservation for cart 302 is not linked to its checkout.; Reservation for cart 209 is not linked to its checkout.; Reservation for cart 155 is not linked to its checkout.; Reservation for cart 232 is not linked to its checkout.; Reservation for cart 294 is not linked to its checkout.; Reservation for cart 199 is not linked to its checkout.; Reservation for cart 132 is not linked to its checkout.; Reservation for cart 373 is not linked to its checkout.; Reservation for cart 215 is not linked to its checkout.; Reservation for cart 457 is not linked to its checkout.; Reservation for cart 201 is not linked to its checkout.; Reservation for cart 154 is not linked to its checkout.; Reservation for cart 229 is not linked to its checkout.; Reservation for cart 342 is not linked to its checkout.; Reservation for cart 414 is not linked to its checkout.; Reservation for cart 217 is not linked to its checkout.; Reservation for cart 160 is not linked to its checkout.; Reservation for cart 185 is not linked to its checkout.; Reservation for cart 196 is not linked to its checkout.; Reservation for cart 168 is not linked to its checkout.; Reservation for cart 122 is not linked to its checkout.; Reservation for cart 235 is not linked to its checkout.; Reservation for cart 163 is not linked to its checkout.; Reservation for cart 287 is not linked to its checkout.; Reservation for cart 299 is not linked to its checkout.; Reservation for cart 212 is not linked to its checkout.; Reservation for cart 224 is not linked to its checkout.; Reservation for cart 245 is not linked to its checkout.; Reservation for cart 164 is not linked to its checkout.; Reservation for cart 137 is not linked to its checkout.; Reservation for cart 236 is not linked to its checkout.; Reservation for cart 178 is not linked to its checkout.; Reservation for cart 241 is not linked to its checkout.; Reservation for cart 354 is not linked to its checkout.; Reservation for cart 450 is not linked to its checkout.; Reservation for cart 124 is not linked to its checkout.; Reservation for cart 228 is not linked to its checkout.; Reservation for cart 143 is not linked to its checkout.; Reservation for cart 368 is not linked to its checkout.; Reservation for cart 458 is not linked to its checkout.; Reservation for cart 167 is not linked to its checkout.; Reservation for cart 464 is not linked to its checkout.; Reservation for cart 456 is not linked to its checkout.; Reservation for cart 146 is not linked to its checkout.; Reservation for cart 218 is not linked to its checkout.; Reservation for cart 118 is not linked to its checkout.; Reservation for cart 453 is not linked to its checkout.; Reservation for cart 421 is not linked to its checkout.; Reservation for cart 282 is not linked to its checkout.; Reservation for cart 252 is not linked to its checkout.; Reservation for cart 296 is not linked to its checkout.; Reservation for cart 452 is not linked to its checkout.; checkout-attempt count: expected 500, received 353.; terminal business-conflict count: expected 400, received 13.; unexpected HTTP 5xx count: expected 0, received 22.; technical failure count: expected 0, received 500.; k6 successful-user count: expected 100, received 0.; k6 business-conflict count: expected 400, received 0.; k6 sold-out conflict count: expected 400, received 0..

Command against a fresh prepared stack:
`LOAD_VUS=500 LOAD_STOCK_LIMIT=100 LOAD_BASE_INVENTORY=500 LOAD_RETRIES=1 npm run load:flash-sale:concurrency`

Rates describe a finite burst, not sustained capacity. Setup/login is excluded.
Latency trends use k6 HTTP duration; wall time also includes connection setup.
Raw metrics, scenario options, source fingerprint, and verification accompany this report.

