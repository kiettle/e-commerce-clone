# October 23, 2026 flash-sale evidence

Read the [verification report](../../../../docs/flash-sale-verification-report.md#october-2026-expanded-load-evidence) for methodology, limitations, CV wording, and reproduction.

All available measured trials are preserved; failed or missing runs are not removed:

- [Original bundled HTTP client, cold](bundled-cold/comparison.md): 100 passed; the 500-buyer trial crashed the gateway. Later fixture preparations failed because the gateway was down. See [crash signature](bundled-cold/gateway-crash.txt).
- [Patched client, unbounded pool, cold](patched-unbounded-cold/comparison.md): process stayed alive; larger trials still failed.
- [Patched client, 64 connections, cold](pool64-cold/comparison.md): removed observed downstream 5xx responses; client-to-gateway connection resets still occurred. No cold 1,000-buyer pass is claimed.
- [Patched client, 64 connections, warm](pool64-warm/comparison.md): all nine database verifications passed, with zero technical failures; 500/1,000-buyer latency targets failed.

Each `.md` has an adjacent `.md.json` containing raw k6 metrics/options, environment,
source fingerprint (including uncommitted source), sanitized fixture identifiers,
exit codes, and database checks. The five-buyer warmup is retained but excluded
from comparisons. Baselines from before the connection-mode option existed used
cold connections. Missing cells mean preparation never reached measurement.

The first harness smoke attempt stopped because its report writer could not
read k6's mutated options object. That reporting issue was fixed before the
first matrix here; its raw smoke data remains in local `artifacts/load-matrix/cv-benchmark/`.

Do not average failed connection responses into successful order throughput,
combine cold/warm measurements, or call finite-burst rates sustained capacity.
No statistically controlled speedup percentage is claimed. Runtime, transport,
and connection-mode changes are explicit experiments, not interchangeable trials.
