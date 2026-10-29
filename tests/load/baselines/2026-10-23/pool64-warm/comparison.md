# Flash-sale burst comparison

Connection mode: **warm**. Cold and warm results are different experiments.

One checkout per preinitialized virtual buyer; fresh users, carts, sale, and SKU per run.
Same stack, serial trials, alternating ascending/descending buyer counts; five-buyer warmup excluded.
Setup/login is excluded. Responses/s includes sold-out rejections. Buyers/s counts completed
unique buyers over the same first-send to last-response window. These finite-burst rates
are not sustained capacity. See each report's launch spread, wall time, environment,
source fingerprint, raw JSON, and database checks. Failed runs remain in this table.

| Buyers / trial | Stock | Responses | Completed | Responses/s | Buyers/s | HTTP p95 ms | HTTP p99 ms | Success p95 ms | Technical failures | Thresholds | Invariants |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| [100 / 1](buyers-100-run-1.md) | 20 | 100 | 20 | 186.92 | 37.38 | 514.20 | 522.10 | 471.18 | 0 | PASSED | PASSED |
| [100 / 2](buyers-100-run-2.md) | 20 | 100 | 20 | 245.70 | 49.14 | 398.13 | 403.30 | 360.25 | 0 | PASSED | PASSED |
| [100 / 3](buyers-100-run-3.md) | 20 | 100 | 20 | 251.26 | 50.25 | 384.64 | 389.91 | 352.97 | 0 | PASSED | PASSED |
| [500 / 1](buyers-500-run-1.md) | 100 | 500 | 100 | 244.86 | 48.97 | 1982.67 | 2016.76 | 1063.73 | 0 | FAILED | PASSED |
| [500 / 2](buyers-500-run-2.md) | 100 | 500 | 100 | 260.42 | 52.08 | 1861.02 | 1893.77 | 995.17 | 0 | FAILED | PASSED |
| [500 / 3](buyers-500-run-3.md) | 100 | 500 | 100 | 282.81 | 56.56 | 1716.42 | 1745.36 | 886.50 | 0 | FAILED | PASSED |
| [1000 / 1](buyers-1000-run-1.md) | 200 | 1000 | 200 | 237.98 | 47.60 | 4096.52 | 4163.24 | 2200.56 | 0 | FAILED | PASSED |
| [1000 / 2](buyers-1000-run-2.md) | 200 | 1000 | 200 | 265.04 | 53.01 | 3631.93 | 3695.07 | 1789.71 | 0 | FAILED | PASSED |
| [1000 / 3](buyers-1000-run-3.md) | 200 | 1000 | 200 | 249.56 | 49.91 | 3898.49 | 3969.99 | 1824.52 | 0 | FAILED | PASSED |
