#!/usr/bin/env node

const os = require('node:os');
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

## Profile

| Setting | Value |
| --- | ---: |
| Profile | ${profile} |
| Prepared users | ${fixture.userCount} |
| Sale stock limit | ${fixture.stockLimit} |
| Base inventory | ${fixture.baseInventory} |
| Checkout retries per user | ${process.env.LOAD_RETRIES ?? (profile === 'retry-storm' ? 3 : 1)} |

## Results

| Metric | Result | Initial threshold |
| --- | ---: | ---: |
| Unexpected technical failure rate | ${format((technicalRate ?? 0) * 100, '%')} | < 1% |
| Unexpected HTTP 5xx | ${metric('unexpected_5xx', 'count') ?? 0} | 0 |
| Business conflicts | ${metric('business_conflicts', 'count') ?? 0} | Functional outcome |
| Sold-out conflicts | ${metric('sold_out_conflicts', 'count') ?? 0} | Profile dependent |
| Purchase-limit conflicts | ${metric('purchase_limit_conflicts', 'count') ?? 0} | Profile dependent |
| Successful checkout users | ${metric('checkout_user_successes', 'count') ?? 0} | Profile dependent |
| Request rate | ${format(metric('http_reqs', 'rate'), ' requests/s')} | Informational |
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

Command: \`npm run load:flash-sale:${profile}\`
`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown);
  console.log(`[load] Markdown baseline written to ${outputPath}.`);
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|');
}
