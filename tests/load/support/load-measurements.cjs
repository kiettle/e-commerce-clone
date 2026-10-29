// Keep finite-burst rates separate from k6's whole-scenario rate.
function measurements(result) {
  const metric = (name, value) => result.metrics?.[name]?.values?.[value];
  const firstStart = metric('checkout_start_offset', 'min');
  const lastStart = metric('checkout_start_offset', 'max');
  const lastEnd = metric('checkout_end_offset', 'max');
  const windowMs =
    Number.isFinite(firstStart) && Number.isFinite(lastEnd) ? lastEnd - firstStart : null;
  const count = metric('checkout_responses', 'count');
  const successes = metric('checkout_user_successes', 'count');
  const perSecond = (value) =>
    windowMs > 0 && Number.isFinite(value) ? (value * 1000) / windowMs : null;
  const thresholds = Object.entries(result.metrics ?? {}).flatMap(([name, entry]) =>
    Object.entries(entry.thresholds ?? {}).map(([expression, outcome]) => ({
      metric: name,
      expression,
      ok: outcome.ok === true,
    })),
  );
  return {
    windowMs,
    launchSpreadMs:
      Number.isFinite(firstStart) && Number.isFinite(lastStart) ? lastStart - firstStart : null,
    burstResponsesPerSecond: perSecond(count),
    // Unique completed buyers, not replay responses or sold-out responses.
    burstCompletedBuyersPerSecond: perSecond(successes),
    thresholds,
    performanceStatus:
      thresholds.length === 0
        ? 'UNKNOWN'
        : thresholds.every((threshold) => threshold.ok)
          ? 'PASSED'
          : 'FAILED',
  };
}
module.exports = { measurements };
