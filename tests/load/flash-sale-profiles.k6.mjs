import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Rate, Trend } from 'k6/metrics';

const profile = __ENV.LOAD_PROFILE || 'smoke';
const fixturePath = requiredEnvironment('LOAD_FIXTURE');
// Parse once across VUs; copying every buyer/token into every VU is quadratic.
const fixtureData = new SharedArray('load-fixture', () => {
  const { users, ...metadata } = JSON.parse(open(fixturePath));
  return [metadata, ...users];
});
const fixture = fixtureData[0];
const resultPath = __ENV.LOAD_RESULT_PATH || 'tests/load/.result.json';
const configuredVus = numberEnvironment('LOAD_VUS', fixture.userCount);
const retryCount = numberEnvironment('LOAD_RETRIES', 3);
const connectionMode = __ENV.LOAD_CONNECTION_MODE || 'cold';
if (!['cold', 'warm'].includes(connectionMode))
  throw new Error('LOAD_CONNECTION_MODE must be cold or warm.');
const connectionWarmupMs = numberEnvironment('LOAD_CONNECTION_WARMUP_MS', 3000);
const warmupFailures = new Counter('connection_warmup_failures');
const lateWarmups = new Counter('connection_warmup_late_buyers');
if (configuredVus !== fixture.userCount || fixtureData.length !== configuredVus + 1) {
  throw new Error('LOAD_VUS must match the number of prepared unique buyers.');
}

if (fixture.profile !== profile) {
  throw new Error(`Fixture profile ${fixture.profile} cannot run as ${profile}.`);
}

const checkoutDuration = new Trend('checkout_duration', true);
// Wall time includes connection setup/queueing in the load generator.
const checkoutWallDuration = new Trend('checkout_wall_duration', true);
const successfulCheckoutDuration = new Trend('successful_checkout_duration', true);
const conflictCheckoutDuration = new Trend('conflict_checkout_duration', true);
const requestStartOffset = new Trend('checkout_start_offset', true);
const requestEndOffset = new Trend('checkout_end_offset', true);
const responseStatuses = new Counter('checkout_response_statuses');
const pendingResponses = new Counter('pending_responses');
const saleReadDuration = new Trend('sale_read_duration', true);
const productReadDuration = new Trend('product_read_duration', true);
const checkoutResponses = new Counter('checkout_responses');
const checkoutUserSuccesses = new Counter('checkout_user_successes');
const businessConflicts = new Counter('business_conflicts');
const soldOutConflicts = new Counter('sold_out_conflicts');
const purchaseLimitConflicts = new Counter('purchase_limit_conflicts');
const technicalFailures = new Counter('technical_failures');
const unexpected5xx = new Counter('unexpected_5xx');
const retryMismatches = new Counter('retry_mismatches');
const technicalFailureRate = new Rate('technical_failure_rate');

http.setResponseCallback(http.expectedStatuses(200, 409));

export const options = profileOptions(profile, configuredVus);

export function checkoutOnce() {
  warmConnection();
  const user = fixtureUser();
  const response = checkout(user);
  const classification = classifyCheckout(response);
  checkoutUserSuccesses.add(classification === 'success' ? 1 : 0);
}

export function retryCheckout() {
  warmConnection();
  const user = fixtureUser();
  let firstResult;
  let allResponsesMatch = true;
  let allSucceeded = true;

  for (let attempt = 0; attempt < retryCount; attempt += 1) {
    const response = checkout(user);
    const classification = classifyCheckout(response);
    allSucceeded = allSucceeded && classification === 'success';
    const result = checkoutIdentity(response);
    if (attempt === 0) {
      firstResult = result;
    } else if (!sameIdentity(firstResult, result)) {
      allResponsesMatch = false;
    }
  }

  check(null, {
    'retry responses all succeeded': () => allSucceeded,
    'retry returned the same checkout and order': () => allResponsesMatch,
  });
  checkoutUserSuccesses.add(allSucceeded && allResponsesMatch ? 1 : 0);
  if (!allResponsesMatch) retryMismatches.add(1);
}

export function readTraffic() {
  const user = fixtureUser(true);
  const headers = authorizationHeaders(user.token);

  const saleResponse = http.get(`${fixture.gatewayUrl}/api/flash-sales?status=active`, {
    headers,
    tags: { operation: 'active-sale-read' },
  });
  saleReadDuration.add(saleResponse.timings.duration);
  classifyRead(saleResponse, 'active sale list returns 200');

  const productResponse = http.get(
    `${fixture.gatewayUrl}/api/products?name=${encodeURIComponent(fixture.productName)}`,
    { headers, tags: { operation: 'product-read' } },
  );
  productReadDuration.add(productResponse.timings.duration);
  classifyRead(productResponse, 'product search returns 200');
}

export function handleSummary(data) {
  const summary = {
    benchmarkVersion: 2,
    connectionMode,
    connectionWarmupMs: connectionMode === 'warm' ? connectionWarmupMs : 0,
    profile,
    options: profileOptions(profile, configuredVus),
    retryCount: profile === 'retry-storm' ? retryCount : 1,
    generatedAt: new Date().toISOString(),
    metrics: data.metrics,
    state: data.state,
  };
  return {
    [resultPath]: `${JSON.stringify(summary, null, 2)}\n`,
    stdout: summaryLine(data),
  };
}

function warmConnection() {
  if (connectionMode !== 'warm') return;
  // Establish keep-alive connections gradually, then release all checkout VUs
  // at the same target time. Setup requests never enter checkout measurements.
  sleep((((exec.vu.idInTest - 1) / fixture.userCount) * connectionWarmupMs) / 2000);
  const response = http.get(`${fixture.gatewayUrl}/health`, {
    tags: { operation: 'connection-warmup', name: 'GET /health (warmup)' },
    timeout: '5s',
  });
  warmupFailures.add(response.status === 200 ? 0 : 1);
  const remaining = exec.scenario.startTime + connectionWarmupMs - Date.now();
  lateWarmups.add(remaining < 0 ? 1 : 0);
  if (remaining > 0) sleep(remaining / 1000);
}

function checkout(user) {
  const startedAt = Date.now();
  requestStartOffset.add(startedAt - exec.scenario.startTime);
  const response = http.post(`${fixture.gatewayUrl}/api/carts/${user.cartId}/checkout`, null, {
    headers: {
      ...authorizationHeaders(user.token),
      'Idempotency-Key': user.idempotencyKey,
    },
    tags: { operation: 'checkout', profile, name: 'POST /api/carts/:cartId/checkout' },
    timeout: __ENV.LOAD_REQUEST_TIMEOUT || '30s',
  });
  const finishedAt = Date.now();
  requestEndOffset.add(finishedAt - exec.scenario.startTime);
  checkoutWallDuration.add(finishedAt - startedAt);
  checkoutDuration.add(response.timings.duration);
  responseStatuses.add(1, { status: String(response.status) });
  checkoutResponses.add(1);
  return response;
}

function classifyCheckout(response) {
  if (response.status === 200) {
    const completed = jsonBody(response)?.status === 'COMPLETED';
    check(response, { 'checkout completed': () => completed });
    if (completed) {
      successfulCheckoutDuration.add(response.timings.duration);
      technicalFailureRate.add(false);
      return 'success';
    }
    recordTechnicalFailure(response);
    return 'technical-failure';
  }

  const code = jsonBody(response)?.code;
  if (
    response.status === 409 &&
    (code === 'FLASH_SALE_SOLD_OUT' || code === 'FLASH_SALE_LIMIT_REACHED')
  ) {
    conflictCheckoutDuration.add(response.timings.duration);
    businessConflicts.add(1, { code });
    if (code === 'FLASH_SALE_SOLD_OUT') {
      soldOutConflicts.add(1);
    } else {
      purchaseLimitConflicts.add(1);
    }
    technicalFailureRate.add(false);
    check(response, { 'business conflict has a stable code': () => Boolean(code) });
    return 'business-conflict';
  }

  if (response.status === 202) pendingResponses.add(1);
  recordTechnicalFailure(response);
  check(response, { 'checkout has an expected response': () => false });
  return 'technical-failure';
}

function classifyRead(response, checkName) {
  const successful = response.status === 200;
  technicalFailureRate.add(!successful);
  if (!successful) recordTechnicalFailure(response, false);
  check(response, { [checkName]: () => successful });
}

function recordTechnicalFailure(response, addRate = true) {
  technicalFailures.add(1, { status: String(response.status || 0) });
  if (response.status >= 500) unexpected5xx.add(1, { status: String(response.status) });
  if (addRate) technicalFailureRate.add(true);
}

function fixtureUser(reuse = false) {
  const index = (exec.vu.idInTest - 1) % fixture.userCount;
  const user = fixtureData[index + 1];
  if (!reuse && exec.vu.idInTest > fixture.userCount) {
    throw new Error(`VU ${exec.vu.idInTest} has no prepared user.`);
  }
  return user;
}

function authorizationHeaders(token) {
  return { Accept: 'application/json', Authorization: `Bearer ${token}` };
}

function checkoutIdentity(response) {
  if (response.status !== 200) return null;
  const body = jsonBody(response);
  return body ? { checkoutId: body.checkoutId, orderId: body.orderId } : null;
}

function sameIdentity(left, right) {
  return (
    left !== null &&
    right !== null &&
    left.checkoutId === right.checkoutId &&
    left.orderId === right.orderId
  );
}

function jsonBody(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

function profileOptions(selectedProfile, vus) {
  const checkoutThresholds = {
    technical_failure_rate: ['rate<0.01'],
    unexpected_5xx: ['count==0'],
    checkout_duration: ['p(95)<1000', 'p(99)<2000'],
    checkout_wall_duration: ['p(95)<1000', 'p(99)<2000'],
    checks: ['rate==1'],
    ...(connectionMode === 'warm'
      ? {
          connection_warmup_failures: ['count==0'],
          connection_warmup_late_buyers: ['count==0'],
        }
      : {}),
    checkout_responses: [`count==${vus * (selectedProfile === 'retry-storm' ? retryCount : 1)}`],
  };

  if (selectedProfile === 'smoke') {
    if (vus < 1 || vus > 5) throw new Error('Smoke LOAD_VUS must be between 1 and 5.');
    return {
      scenarios: {
        smoke: {
          executor: 'per-vu-iterations',
          vus,
          iterations: 1,
          maxDuration: '25s',
          exec: 'checkoutOnce',
        },
      },
      thresholds: checkoutThresholds,
    };
  }

  if (selectedProfile === 'concurrency') {
    return {
      scenarios: {
        concurrency: {
          executor: 'per-vu-iterations',
          vus,
          iterations: 1,
          maxDuration: __ENV.LOAD_MAX_DURATION || '60s',
          exec: 'checkoutOnce',
        },
      },
      thresholds: checkoutThresholds,
    };
  }

  if (selectedProfile === 'retry-storm') {
    return {
      scenarios: {
        retryStorm: {
          executor: 'per-vu-iterations',
          vus,
          iterations: 1,
          maxDuration: __ENV.LOAD_MAX_DURATION || '60s',
          exec: 'retryCheckout',
        },
      },
      thresholds: {
        ...checkoutThresholds,
        retry_mismatches: ['count==0'],
      },
    };
  }

  if (selectedProfile === 'reads') {
    return {
      scenarios: {
        reads: {
          executor: 'constant-vus',
          vus,
          duration: __ENV.LOAD_READ_DURATION || '20s',
          exec: 'readTraffic',
        },
      },
      thresholds: {
        technical_failure_rate: ['rate<0.01'],
        unexpected_5xx: ['count==0'],
        sale_read_duration: ['p(95)<500'],
      },
    };
  }

  throw new Error(`Unsupported LOAD_PROFILE: ${selectedProfile}.`);
}

function summaryLine(data) {
  const metric = (name, value) => data.metrics[name]?.values?.[value] ?? 0;
  return [
    `profile=${profile}`,
    `checkout_users=${metric('checkout_user_successes', 'count')}`,
    `business_conflicts=${metric('business_conflicts', 'count')}`,
    `sold_out_conflicts=${metric('sold_out_conflicts', 'count')}`,
    `purchase_limit_conflicts=${metric('purchase_limit_conflicts', 'count')}`,
    `technical_failures=${metric('technical_failures', 'count')}`,
    `unexpected_5xx=${metric('unexpected_5xx', 'count')}`,
    `checkout_p95_ms=${metric('checkout_duration', 'p(95)')}`,
    `sale_read_p95_ms=${metric('sale_read_duration', 'p(95)')}`,
    '',
  ].join('\n');
}

function numberEnvironment(name, fallback) {
  const value = Number(__ENV[name] || fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be positive.`);
  return value;
}

function requiredEnvironment(name) {
  const value = __ENV[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
