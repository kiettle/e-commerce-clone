#!/usr/bin/env node

const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { measurements } = require('./load-measurements.cjs');
const { readFile, writeFile, mkdir } = require('node:fs/promises');
const { dirname, resolve } = require('node:path');

const profile = process.argv[2];
const fixturePath = resolve(process.argv[3]);
const resultPath = resolve(process.argv[4]);
const invariantPath = resolve(process.argv[5]);
const outputPath = resolve(process.argv[6]);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const result = JSON.parse(await readFile(resultPath, 'utf8'));
  const invariants = JSON.parse(await readFile(invariantPath, 'utf8'));
  const measured = measurements(result);
  const sourcePaths = command('git', ['ls-files', '--cached', '--others', '--exclude-standard'])
    .split('\n')
    .filter(
      (path) =>
        (/^(apps|libs|scripts|tests)\//.test(path) && !path.startsWith('tests/load/baselines/')) ||
        /^(package(-lock)?\.json|vitest.*|tsconfig.*|nest-cli.json)$/.test(path),
    );
  const hash = createHash('sha256');
  for (const path of [...new Set(sourcePaths)].sort()) {
    hash.update(path);
    hash.update('\0');
    try {
      hash.update(readFileSync(path));
    } catch {
      hash.update('<deleted>');
    }
  }
  const source = {
    commit: command('git', ['rev-parse', 'HEAD']),
    dirty: Boolean(command('git', ['status', '--porcelain'])),
    codeSha256: hash.digest('hex'),
  };
  const environment = {
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    memoryBytes: os.totalmem(),
    os: `${os.platform()} ${os.release()} ${os.arch()}`,
    node: process.version,
    internalTransport: 'grpc',
    grpcRequestTimeoutMs: process.env.GRPC_REQUEST_TIMEOUT_MS ?? '5000',
    stack: process.env.LOAD_STACK_DESCRIPTION ?? 'externally managed; document separately',
    requestTimeout: process.env.LOAD_REQUEST_TIMEOUT || '30s',

    k6: command('k6', ['version']),
    docker: command('docker', [
      'info',
      '--format',
      '{{.ServerVersion}}; CPUs={{.NCPU}}; memoryBytes={{.MemTotal}}; OS={{.OperatingSystem}}',
    ]),
  };
  // No bearer tokens, emails, passwords, or database URLs in retained evidence.
  const { users, gatewayUrl, ...safeFixture } = fixture;
  const evidence = {
    source,
    environment,
    fixture: safeFixture,
    result,
    invariants,
    measured,
    k6ExitCode: Number(process.env.LOAD_K6_EXIT),
    verifierExitCode: Number(process.env.LOAD_VERIFY_EXIT),
  };
  const cpu = os.cpus()[0]?.model ?? 'Unknown CPU';
  const totalMemoryGb = (os.totalmem() / 1024 ** 3).toFixed(1);
  const metric = (name, value) => result.metrics?.[name]?.values?.[value];
  const format = (value, suffix = '') =>
    value === undefined || value === null ? 'n/a' : `${Number(value).toFixed(2)}${suffix}`;
  const technicalRate = metric('technical_failure_rate', 'rate');
  const markdown = `# Flash-sale ${profile} baseline

Captured: ${new Date().toISOString()}

This is a local or CI development baseline. It is not a production-capacity claim.

## Machine

| Property | Value |
| --- | --- |
| CPU | ${escapeCell(cpu)} |
| Logical CPUs | ${os.cpus().length} |
| Memory | ${totalMemoryGb} GiB |
| OS | ${escapeCell(`${os.platform()} ${os.release()} ${os.arch()}`)} |
| Node.js | ${process.version} |

Source: \`${source.commit}\`; dirty working tree: **${source.dirty}**.
Code SHA-256 (includes untracked source): \`${source.codeSha256}\`.
k6: ${environment.k6}. Docker: ${environment.docker}.
Internal transport: ${environment.internalTransport}; RPC deadline: ${environment.grpcRequestTimeoutMs}ms.
Stack: ${environment.stack}. HTTP request timeout: ${environment.requestTimeout}.

## Profile

| Setting | Value |
| --- | ---: |
| Profile | ${profile} |
| Connection mode | ${result.connectionMode ?? 'cold'} |
| Connection warmup | ${result.connectionWarmupMs ?? 0} ms |
| Benchmark version | ${result.benchmarkVersion} |
| Executor | ${Object.values(result.options.scenarios)[0].executor} |
| Prepared users | ${fixture.userCount} |
| Sale stock limit | ${fixture.stockLimit} |
| Base inventory | ${fixture.baseInventory} |
| Checkout retries per user | ${process.env.LOAD_RETRIES ?? (profile === 'retry-storm' ? 3 : 1)} |

## Results

Performance thresholds: **${measured.performanceStatus}**.
k6 exit: ${evidence.k6ExitCode}; verifier exit: ${evidence.verifierExitCode}.


| Metric | Result | Initial threshold |
| --- | ---: | ---: |
| Unexpected technical failure rate | ${format(technicalRate === undefined ? undefined : technicalRate * 100, '%')} | < 1% |
| Unexpected HTTP 5xx | ${metric('unexpected_5xx', 'count') ?? 0} | 0 |
| Business conflicts | ${metric('business_conflicts', 'count') ?? 0} | Functional outcome |
| Sold-out conflicts | ${metric('sold_out_conflicts', 'count') ?? 0} | Profile dependent |
| Purchase-limit conflicts | ${metric('purchase_limit_conflicts', 'count') ?? 0} | Profile dependent |
| Successful checkout users | ${metric('checkout_user_successes', 'count') ?? 0} | Profile dependent |
| Burst response window | ${format(measured.windowMs, ' ms')} | First send to last response |
| Request launch spread | ${format(measured.launchSpreadMs, ' ms')} | Not exact simultaneity |
| Burst response throughput | ${format(measured.burstResponsesPerSecond, ' responses/s')} | Includes sold-out and retries |
| Burst completed-buyer throughput | ${format(measured.burstCompletedBuyersPerSecond, ' buyers/s')} | Excludes sold-out and replays |
| Successful checkout p95 | ${format(metric('successful_checkout_duration', 'p(95)'), ' ms')} | Informational |
| Sold-out/limit response p95 | ${format(metric('conflict_checkout_duration', 'p(95)'), ' ms')} | Informational |
| Checkout wall-time p95 | ${format(metric('checkout_wall_duration', 'p(95)'), ' ms')} | < 1,000 ms |
| Connection warmup failures | ${metric('connection_warmup_failures', 'count') ?? 0} | 0 |
| Buyers missing warmup barrier | ${metric('connection_warmup_late_buyers', 'count') ?? 0} | 0 |
| Pending HTTP 202 | ${metric('pending_responses', 'count') ?? 0} | Not a completed purchase |
| Whole-scenario request rate | ${format(metric('http_reqs', 'rate'), ' requests/s')} | Informational |
| Checkout p50 | ${format(metric('checkout_duration', 'med'), ' ms')} | Informational |
| Checkout p95 | ${format(metric('checkout_duration', 'p(95)'), ' ms')} | < 1,000 ms |
| Checkout p99 | ${format(metric('checkout_duration', 'p(99)'), ' ms')} | < 2,000 ms |
| Active-sale read p95 | ${format(metric('sale_read_duration', 'p(95)'), ' ms')} | < 500 ms |
| Product read p95 | ${format(metric('product_read_duration', 'p(95)'), ' ms')} | Informational |

## Post-run invariants

| Check | Value |
| --- | ---: |
| Status | ${invariants.invariantStatus} |
| Completed checkouts | ${invariants.completedCheckouts} |
| Orders | ${invariants.orders} |
| Committed reservations | ${invariants.committedReservations} |
| Sold-out responses | ${invariants.soldOutConflicts} |
| Purchase-limit responses | ${invariants.purchaseLimitConflicts} |
| Duplicate orders | ${invariants.duplicateOrderCount} |
| Users purchasing twice | ${invariants.duplicateBuyerPurchaseCount} |
| Sale sold quantity | ${invariants.saleSoldQuantity} |
| Sale reserved quantity | ${invariants.saleReservedQuantity} |
| Normal available quantity | ${invariants.normalAvailableQuantity} |
| Normal reserved quantity | ${invariants.normalReservedQuantity} |
| Negative normal inventory rows | ${invariants.negativeNormalInventoryRows} |
| Invalid sale counter rows | ${invariants.invalidSaleCounterRows} |

Failures: ${invariants.failures?.join('; ') || 'none'}.

Command against a fresh prepared stack:
\`LOAD_CONNECTION_MODE=${result.connectionMode ?? 'cold'} LOAD_VUS=${fixture.userCount} LOAD_STOCK_LIMIT=${fixture.stockLimit} LOAD_BASE_INVENTORY=${fixture.baseInventory} LOAD_RETRIES=${result.retryCount} npm run load:flash-sale:${profile}\`

Rates describe a finite burst, not sustained capacity. Setup/login is excluded.
Latency trends use k6 HTTP duration; wall time also includes connection setup.
Raw metrics, scenario options, source fingerprint, and verification accompany this report.

`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown);
  await writeFile(`${outputPath}.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`[load] Markdown baseline written to ${outputPath}.`);
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|');
}

function command(binary, args) {
  try {
    return execFileSync(binary, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unavailable';
  }
}
