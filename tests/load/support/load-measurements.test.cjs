const { test } = require('node:test');
const assert = require('node:assert/strict');
const { measurements } = require('./load-measurements.cjs');

test('reports mixed burst throughput without counting rejections as orders or including idle time', () => {
  const result = measurements({
    metrics: {
      checkout_start_offset: { values: { min: 200, max: 220 } },
      checkout_end_offset: { values: { max: 1200 } },
      checkout_responses: { values: { count: 100 } },
      checkout_user_successes: { values: { count: 20 } },
      http_reqs: { values: { rate: 3.24 } },
      checkout_duration: { thresholds: { 'p(95)<1000': { ok: false } } },
    },
  });
  assert.equal(result.windowMs, 1000);
  assert.equal(result.launchSpreadMs, 20);
  assert.equal(result.burstResponsesPerSecond, 100);
  assert.equal(result.burstCompletedBuyersPerSecond, 20);
  assert.equal(result.performanceStatus, 'FAILED');
});

test('does not invent zero measurements or pass missing evidence', () => {
  const result = measurements({});
  assert.equal(result.windowMs, null);
  assert.equal(result.burstResponsesPerSecond, null);
  assert.equal(result.burstCompletedBuyersPerSecond, null);
  assert.equal(result.performanceStatus, 'UNKNOWN');
});

test('does not divide by a zero measurement interval', () => {
  const result = measurements({
    metrics: {
      checkout_start_offset: { values: { min: 1, max: 1 } },
      checkout_end_offset: { values: { max: 1 } },
      checkout_responses: { values: { count: 1 } },
    },
  });
  assert.equal(result.burstResponsesPerSecond, null);
});
