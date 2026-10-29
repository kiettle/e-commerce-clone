const { readFile, writeFile } = require('node:fs/promises');
const { resolve } = require('node:path');

async function main() {
  const directory = resolve(process.argv[2]);
  const repeats = Number(process.argv[3]);
  const levels = process.argv.slice(4).map(Number);
  const rows = [];
  const modes = new Set();
  for (const buyers of levels) {
    for (let repeat = 1; repeat <= repeats; repeat += 1) {
      const name = `buyers-${buyers}-run-${repeat}.md`;
      try {
        const evidence = JSON.parse(await readFile(`${directory}/${name}.json`, 'utf8'));
        const { result, measured, invariants } = evidence;
        modes.add(result.connectionMode ?? 'cold');
        const metric = (key, stat) => result.metrics[key]?.values?.[stat];
        const f = (value) => (Number.isFinite(value) ? value.toFixed(2) : 'n/a');
        rows.push(
          `| [${buyers} / ${repeat}](${name}) | ${evidence.fixture.stockLimit} | ${metric('checkout_responses', 'count') ?? 0} | ${metric('checkout_user_successes', 'count') ?? 0} | ${f(measured.burstResponsesPerSecond)} | ${f(measured.burstCompletedBuyersPerSecond)} | ${f(metric('checkout_duration', 'p(95)'))} | ${f(metric('checkout_duration', 'p(99)'))} | ${f(metric('successful_checkout_duration', 'p(95)'))} | ${metric('technical_failures', 'count') ?? 0} | ${measured.performanceStatus} | ${invariants.invariantStatus} |`,
        );
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        rows.push(
          `| ${buyers} / ${repeat} | — | — | — | — | — | — | — | — | — | MISSING | MISSING |`,
        );
      }
    }
  }
  await writeFile(
    `${directory}/comparison.md`,
    `# Flash-sale burst comparison

Connection mode: **${[...modes].join(', ')}**. Cold and warm results are different experiments.

One checkout per preinitialized virtual buyer; fresh users, carts, sale, and SKU per run.
Same stack, serial trials, alternating ascending/descending buyer counts; five-buyer warmup excluded.
Setup/login is excluded. Responses/s includes sold-out rejections. Buyers/s counts completed
unique buyers over the same first-send to last-response window. These finite-burst rates
are not sustained capacity. See each report's launch spread, wall time, environment,
source fingerprint, raw JSON, and database checks. Failed runs remain in this table.

| Buyers / trial | Stock | Responses | Completed | Responses/s | Buyers/s | HTTP p95 ms | HTTP p99 ms | Success p95 ms | Technical failures | Thresholds | Invariants |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
${rows.join('\n')}
`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
