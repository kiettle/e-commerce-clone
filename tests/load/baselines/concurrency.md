# Flash-sale concurrency baseline

Captured: 2026-09-22T07:27:07.853Z

This is a local or CI development baseline. It is not a production-capacity claim.

## Machine

| Property     | Value               |
| ------------ | ------------------- |
| CPU          | Apple M2            |
| Logical CPUs | 8                   |
| Memory       | 16.0 GiB            |
| OS           | darwin 22.6.0 arm64 |
| Node.js      | v24.21.0            |

## Profile

| Setting                   |       Value |
| ------------------------- | ----------: |
| Profile                   | concurrency |
| Prepared users            |         100 |
| Sale stock limit          |          20 |
| Base inventory            |        1000 |
| Checkout retries per user |           1 |

## Results

| Metric                            |          Result |  Initial threshold |
| --------------------------------- | --------------: | -----------------: |
| Unexpected technical failure rate |           0.00% |               < 1% |
| Unexpected HTTP 5xx               |               0 |                  0 |
| Business conflicts                |              80 | Functional outcome |
| Sold-out conflicts                |              80 |  Profile dependent |
| Purchase-limit conflicts          |               0 |  Profile dependent |
| Successful checkout users         |              20 |  Profile dependent |
| Request rate                      | 3.24 requests/s |      Informational |
| Checkout p50                      |        59.65 ms |      Informational |
| Checkout p95                      |       513.37 ms |         < 1,000 ms |
| Checkout p99                      |       627.06 ms |         < 2,000 ms |
| Active-sale read p95              |             n/a |           < 500 ms |
| Product read p95                  |             n/a |      Informational |

## Post-run invariants

| Check                          |  Value |
| ------------------------------ | -----: |
| Status                         | PASSED |
| Completed checkouts            |     20 |
| Orders                         |     20 |
| Committed reservations         |     20 |
| Sold-out responses             |     80 |
| Purchase-limit responses       |      0 |
| Duplicate orders               |      0 |
| Users purchasing twice         |      0 |
| Sale sold quantity             |     20 |
| Sale reserved quantity         |      0 |
| Normal available quantity      |    980 |
| Normal reserved quantity       |      0 |
| Negative normal inventory rows |      0 |
| Invalid sale counter rows      |      0 |

Command: `npm run load:flash-sale:concurrency`
