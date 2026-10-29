const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

test('retains failed results and provenance without fixture credentials', () => {
  const directory = mkdtempSync(join(tmpdir(), 'load-report-test-'));
  try {
    const fixture = {
      userCount: 100,
      stockLimit: 20,
      baseInventory: 100,
      users: [{ token: 'private-token', email: 'private-email' }],
      gatewayUrl: 'private-url',
    };
    const result = {
      benchmarkVersion: 2,
      options: {
        scenarios: {
          concurrency: {
            executor: 'per-vu-iterations',
            vus: 100,
            iterations: 1,
          },
        },
      },
      retryCount: 1,
      metrics: {
        checkout_duration: {
          values: { 'p(95)': 1500 },
          thresholds: { 'p(95)<1000': { ok: false } },
        },
      },
    };
    const invariants = { invariantStatus: 'FAILED', failures: ['duplicate orders detected'] };
    for (const [name, value] of Object.entries({ fixture, result, invariants })) {
      writeFileSync(join(directory, `${name}.json`), JSON.stringify(value));
    }
    const output = join(directory, 'report.md');
    execFileSync(
      process.execPath,
      [
        'tests/load/support/write-load-baseline.cjs',
        'concurrency',
        join(directory, 'fixture.json'),
        join(directory, 'result.json'),
        join(directory, 'invariants.json'),
        output,
      ],
      {
        env: { ...process.env, LOAD_K6_EXIT: '99', LOAD_VERIFY_EXIT: '1' },
        stdio: 'pipe',
      },
    );
    const report = readFileSync(output, 'utf8');
    const json = readFileSync(`${output}.json`, 'utf8');
    assert.match(report, /Performance thresholds: \*\*FAILED\*\*/);
    assert.match(report, /duplicate orders detected/);
    assert.doesNotMatch(json, /private-token|private-email|private-url/);
    const evidence = JSON.parse(json);
    assert.equal(evidence.k6ExitCode, 99);
    assert.equal(evidence.verifierExitCode, 1);
    assert.match(evidence.source.codeSha256, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
