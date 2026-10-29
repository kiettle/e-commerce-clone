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
| [1000 / 1](buyers-1000-run-1.md) | 200 | 1000 | 200 | 195.96 | 39.19 | 4871.33 | 4983.94 | 2324.04 | 0 | FAILED | PASSED |
| [10000 / 1](buyers-10000-run-1.md) | 2000 | 10000 | 2000 | 320.96 | 64.19 | 30426.72 | 30461.67 | 24610.65 | 6781 | FAILED | FAILED |
