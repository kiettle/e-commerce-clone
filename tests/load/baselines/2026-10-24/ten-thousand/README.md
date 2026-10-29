# 10,000-buyer overload experiment

Measured October 24, 2026, Asia/Ho_Chi_Minh (raw UTC timestamps are October 23).
One exploratory run per level, after a five-buyer warmup. All six services built
and all nine gateway E2E scenarios passed before measurement. Same application
code fingerprint as the October 23 final warm trials. No timeout, connection pool,
inventory constraint or acceptance threshold was relaxed.

See [comparison](comparison.md), [10,000-buyer report](buyers-10000-run-1.md), and
its [raw sanitized summary](buyers-10000-run-1.md.json). The 1,000-buyer control
passed database verification but failed latency targets. The 10,000-buyer run
failed both performance and overall verification, as expected from its failures.

## Interpretation

- All 10,000 VUs completed one checkout attempt; none were interrupted. Requests
  started within 416 ms, which does not establish exact simultaneous execution.
- 2,000 successful checkouts, 1,219 sold-out responses, 6,778 request timeouts,
  and three checkout connection resets. Technical failure rate: 67.81%.
- HTTP duration p95: 30.427 s; successful-checkout p95: 24.611 s. Timeout-heavy
  latency is not the latency of successfully processing every buyer.
- The immediate database snapshot recorded exactly 2,000 orders, committed
  reservations and sold units; zero duplicate orders/buyers, negative stock or
  invalid sale counters. Overall verification still failed: only 3,796 attempts
  and 1,734 terminal business conflicts were persisted at that snapshot. This
  is not evidence of eventual recovery for every timed-out request. Cleanup
  followed verification; a later drain/reconciliation test was not performed.
- Warm mode was requested, but 210 warmup connections failed (208 resets,
  two broken pipes). Zero buyers missed the barrier. This is a partially warmed
  overload experiment, not a clean all-warm comparison with the earlier trials.
- k6 peak child RSS: 2,705.34 MiB; maximum sampled process CPU: 465.6% (about
  4.66 cores). The 6 GiB guard did not trigger. Host-wide swap counters increased
  by 1,359.25 MiB out and 23.09 MiB in. The shared 16 GiB machine was resource
  constrained; these timings cannot isolate backend capacity or its bottleneck.
- 320.96 attempts completed/s includes failed attempts. 64.19 completed buyers/s
  counts successful purchases over the burst window. Neither is sustained
  capacity, nor evidence of a speedup over the smaller run.

Resource samples are retained per run. [Diagnostics](diagnostics.json) aggregate
the original k6 warnings and retain the source log hash. Full execution and stack
logs remain under `artifacts/load-matrix/ten-thousand-attempt-1/` locally. Fixtures
containing bearer tokens are excluded from retained evidence.

## Reproduction

Requires the normal Docker/k6 development prerequisites. Use a new output folder:

```bash
LOAD_CONNECTION_MODE=warm LOAD_LEVELS="1000 10000" LOAD_REPEATS=1 \
  LOAD_MATRIX_DIR=artifacts/load-matrix/ten-thousand-repeat \
  E2E_ARTIFACT_DIR=artifacts/load-matrix/ten-thousand-repeat/stack \
  npm run load:flash-sale:benchmark
```

The original invocation additionally placed [monitor-k6.py](monitor-k6.py) on
PATH as `k6` and set `LOAD_GENERATOR_RSS_LIMIT_MB=6144`. It delegates unchanged
arguments to `/opt/homebrew/bin/k6`, samples macOS process/host resources, and
guards against excessive RSS or a 240-second run. It is a retained macOS experiment
script, not a portable benchmark dependency. Both guards remained inactive.

Do not describe this as “reliably handles 10,000 concurrent buyers.” Supported:
“Stress-tested a 10,000-buyer local burst, observed no overselling in the database
snapshot, and documented timeout and load-generator resource limits.” Keep the
three-trial 1,000-buyer evidence for the stronger completed-outcomes CV statement.
