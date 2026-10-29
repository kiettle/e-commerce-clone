# Flash-sale burst comparison

One checkout per preinitialized virtual buyer; fresh users, carts, sale, and SKU per run.
Same stack, serial trials, alternating ascending/descending buyer counts; five-buyer warmup excluded.
Setup/login is excluded. Responses/s includes sold-out rejections. Buyers/s counts completed
unique buyers over the same first-send to last-response window. These finite-burst rates
are not sustained capacity. See each report's launch spread, wall time, environment,
source fingerprint, raw JSON, and database checks. Failed runs remain in this table.

| Buyers / trial | Stock | Responses | Completed | Responses/s | Buyers/s | HTTP p95 ms | HTTP p99 ms | Success p95 ms | Technical failures | Thresholds | Invariants |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| [100 / 1](buyers-100-run-1.md) | 20 | 100 | 20 | 179.21 | 35.84 | 543.90 | 554.91 | 555.02 | 0 | PASSED | PASSED |
| 100 / 2 | — | — | — | — | — | — | — | — | — | MISSING | MISSING |
| 100 / 3 | — | — | — | — | — | — | — | — | — | MISSING | MISSING |
| [500 / 1](buyers-500-run-1.md) | 100 | 500 | 0 | 1424.50 | 0.00 | 328.90 | 329.96 | n/a | 500 | FAILED | FAILED |
| 500 / 2 | — | — | — | — | — | — | — | — | — | MISSING | MISSING |
| 500 / 3 | — | — | — | — | — | — | — | — | — | MISSING | MISSING |
| 1000 / 1 | — | — | — | — | — | — | — | — | — | MISSING | MISSING |
| 1000 / 2 | — | — | — | — | — | — | — | — | — | MISSING | MISSING |
| 1000 / 3 | — | — | — | — | — | — | — | — | — | MISSING | MISSING |
