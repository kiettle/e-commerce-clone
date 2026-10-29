# Flash-sale burst comparison

One checkout per preinitialized virtual buyer; fresh users, carts, sale, and SKU per run.
Same stack, serial trials, alternating ascending/descending buyer counts; five-buyer warmup excluded.
Setup/login is excluded. Responses/s includes sold-out rejections. Buyers/s counts completed
unique buyers over the same first-send to last-response window. These finite-burst rates
are not sustained capacity. See each report's launch spread, wall time, environment,
source fingerprint, raw JSON, and database checks. Failed runs remain in this table.

| Buyers / trial | Stock | Responses | Completed | Responses/s | Buyers/s | HTTP p95 ms | HTTP p99 ms | Success p95 ms | Technical failures | Thresholds | Invariants |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| [100 / 1](buyers-100-run-1.md) | 20 | 100 | 20 | 200.00 | 40.00 | 485.81 | 496.44 | 496.50 | 0 | PASSED | PASSED |
| [100 / 2](buyers-100-run-2.md) | 20 | 100 | 20 | 191.57 | 38.31 | 509.47 | 517.43 | 517.55 | 0 | PASSED | PASSED |
| [100 / 3](buyers-100-run-3.md) | 20 | 100 | 20 | 120.19 | 24.04 | 813.86 | 825.35 | 825.53 | 0 | PASSED | PASSED |
| [500 / 1](buyers-500-run-1.md) | 100 | 500 | 100 | 232.13 | 46.43 | 2041.07 | 2130.90 | 2131.04 | 1 | FAILED | FAILED |
| [500 / 2](buyers-500-run-2.md) | 100 | 500 | 100 | 236.97 | 47.39 | 2020.24 | 2084.05 | 2084.12 | 8 | FAILED | FAILED |
| [500 / 3](buyers-500-run-3.md) | 100 | 500 | 52 | 134.92 | 14.03 | 3575.79 | 3675.08 | 3685.77 | 119 | FAILED | FAILED |
| [1000 / 1](buyers-1000-run-1.md) | 200 | 1000 | 200 | 251.32 | 50.26 | 3791.74 | 3918.85 | 3919.01 | 132 | FAILED | FAILED |
| [1000 / 2](buyers-1000-run-2.md) | 200 | 1000 | 200 | 253.87 | 50.77 | 3762.55 | 3890.01 | 3890.09 | 303 | FAILED | FAILED |
| [1000 / 3](buyers-1000-run-3.md) | 200 | 1000 | 152 | 249.88 | 37.98 | 3826.81 | 3942.94 | 3950.40 | 395 | FAILED | FAILED |
