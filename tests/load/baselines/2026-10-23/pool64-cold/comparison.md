# Flash-sale burst comparison

One checkout per preinitialized virtual buyer; fresh users, carts, sale, and SKU per run.
Same stack, serial trials, alternating ascending/descending buyer counts; five-buyer warmup excluded.
Setup/login is excluded. Responses/s includes sold-out rejections. Buyers/s counts completed
unique buyers over the same first-send to last-response window. These finite-burst rates
are not sustained capacity. See each report's launch spread, wall time, environment,
source fingerprint, raw JSON, and database checks. Failed runs remain in this table.

| Buyers / trial | Stock | Responses | Completed | Responses/s | Buyers/s | HTTP p95 ms | HTTP p99 ms | Success p95 ms | Technical failures | Thresholds | Invariants |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| [100 / 1](buyers-100-run-1.md) | 20 | 100 | 20 | 205.76 | 41.15 | 474.26 | 479.50 | 413.89 | 0 | PASSED | PASSED |
| [100 / 2](buyers-100-run-2.md) | 20 | 100 | 20 | 209.21 | 41.84 | 467.82 | 473.51 | 331.57 | 0 | PASSED | PASSED |
| [100 / 3](buyers-100-run-3.md) | 20 | 100 | 20 | 263.16 | 52.63 | 369.88 | 374.92 | 320.41 | 0 | PASSED | PASSED |
| [500 / 1](buyers-500-run-1.md) | 100 | 500 | 100 | 252.02 | 50.40 | 1860.31 | 1892.59 | 1048.93 | 23 | FAILED | FAILED |
| [500 / 2](buyers-500-run-2.md) | 100 | 500 | 100 | 268.53 | 53.71 | 1699.48 | 1731.32 | 935.67 | 0 | FAILED | PASSED |
| [500 / 3](buyers-500-run-3.md) | 100 | 500 | 100 | 108.81 | 21.76 | 4293.74 | 4355.50 | 2091.54 | 42 | FAILED | FAILED |
| [1000 / 1](buyers-1000-run-1.md) | 200 | 1000 | 200 | 221.93 | 44.39 | 3996.41 | 4027.57 | 2040.54 | 10 | FAILED | FAILED |
| [1000 / 2](buyers-1000-run-2.md) | 200 | 1000 | 200 | 237.93 | 47.59 | 3853.53 | 3915.56 | 1857.16 | 4 | FAILED | FAILED |
| [1000 / 3](buyers-1000-run-3.md) | 200 | 1000 | 200 | 261.37 | 52.27 | 3475.44 | 3527.52 | 2029.86 | 104 | FAILED | FAILED |
