# Load-test baselines

Flash-sale load runs produce Markdown and adjacent sanitized JSON, including
failed performance thresholds and database checks. Raw execution diagnostics
live under ignored `artifacts/`; retain selected reports here with all trials,
not only the fastest result. Do not commit fixtures containing bearer tokens.

Baselines include CPU, memory, Docker resources, dependency versions, source
fingerprints, workload, launch spread, response/order rates, latency percentiles,
and post-run database checks. They describe local development behavior only.

`concurrency.md` is the historical ramped 100-buyer profile; it is not comparable
to the version 2 burst profile as a speedup measurement. See the
[load guide](../README.md) for the reproducible comparison command.

The [October 23, 2026 evidence](2026-10-23/README.md) retains the original crash,
all cold/warm comparisons, and adjacent raw JSON summaries.

The [October 24, 2026 overload experiment](2026-10-24/ten-thousand/README.md)
retains a 1,000-buyer control and a failed 10,000-buyer attempt, including generator
resource samples, timeout counts and the limits of its database snapshot.
