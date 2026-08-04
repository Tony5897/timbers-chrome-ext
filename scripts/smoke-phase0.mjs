import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const options = parseArguments(process.argv.slice(2));
const apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl);
const results = [];
let nextMatch;

await step('health endpoint', async () => {
  const result = await apiRequest('/v1/health');
  expectStatus(result, 200);
  assert(result.body?.status === 'ok', 'Health response did not report ok.');
});

await step('public configuration', async () => {
  const result = await apiRequest('/v1/config');
  expectStatus(result, 200);
  assert(result.body?.apiVersion === 'v1', 'Public API version is not v1.');
  assert(/^\d+\.\d+\.\d+$/.test(result.body?.minimumClientVersion ?? ''), 'Minimum client version is invalid.');
});

await step('team directory', async () => {
  const result = await apiRequest('/v1/teams');
  expectStatus(result, 200);
  const teams = result.body?.teams;
  assert(Array.isArray(teams), 'Team directory did not return an array.');
  assert(teams.some((team) => team.id === 'timbers' && team.status === 'active'), 'Active Timbers configuration is missing.');
  assert(teams.some((team) => team.id === 'thorns' && team.status === 'planned'), 'Planned Thorns configuration is missing.');
});

await step('Timbers team detail', async () => {
  const result = await apiRequest('/v1/teams/timbers');
  expectStatus(result, 200);
  assert(result.body?.team?.id === 'timbers', 'Timbers team detail is invalid.');
});

await step('unknown team rejection', async () => {
  const result = await apiRequest('/v1/teams/unknown');
  expectProblem(result, 404, 'team_not_found');
});

await step('next Timbers match', async () => {
  const result = await apiRequest('/v1/matches/next?teamId=timbers');
  expectStatus(result, 200);
  assert(result.body?.match?.teamId === 'timbers', 'Next match response is not for Timbers.');
  assert(Number.isFinite(Date.parse(result.body?.match?.kickoff)), 'Next match kickoff is invalid.');
  assert(Array.isArray(result.body?.polls), 'Next match polls are invalid.');
  nextMatch = result.body;
});

await step('canonical poll aggregate', async () => {
  const poll = nextMatch?.polls?.[0];
  assert(poll?.id, 'Next match did not include a confidence poll.');
  const result = await apiRequest(`/v1/polls/${encodeURIComponent(poll.id)}/aggregate`);
  expectStatus(result, 200);
  assert(result.body?.poll?.id === poll.id, 'Aggregate poll ID does not match discovery.');
  assert(result.body?.identityClass === 'integrity_controlled', 'Aggregate identity class is invalid.');
  assert(result.body?.acceptedResponses === result.body?.choices?.total, 'Aggregate totals are inconsistent.');
});

await step('invalid authentication rejection', async () => {
  const result = await apiRequest('/v1/installations/me', {
    method: 'DELETE',
    headers: { Authorization: 'Bearer invalid-smoke-token' },
  });
  expectProblem(result, 401, 'invalid_authentication');
});

await step('unknown route rejection', async () => {
  const result = await apiRequest('/v1/not-a-route');
  expectProblem(result, 404, 'route_not_found');
});

if (options.authenticated) await runAuthenticatedSmoke();

const report = {
  schemaVersion: 1,
  testedAt: new Date().toISOString(),
  apiBaseUrl,
  authenticated: options.authenticated,
  results,
  summary: {
    passed: results.filter((result) => result.status === 'passed').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    failed: results.filter((result) => result.status === 'failed').length,
  },
};

if (options.output) {
  const outputPath = path.resolve(options.output);
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

for (const result of results) process.stdout.write(`${result.status.toUpperCase()} ${result.name}\n`);
process.stdout.write(
  `Phase 0 smoke test: ${report.summary.passed} passed, ${report.summary.skipped} skipped, ${report.summary.failed} failed\n`,
);
if (report.summary.failed > 0) process.exitCode = 1;

async function runAuthenticatedSmoke() {
  if (!options.apiKey) {
    results.push({ name: 'authenticated smoke prerequisites', status: 'failed', durationMs: 0, detail: 'Missing --api-key.' });
    return;
  }

  let session;
  await step('anonymous account creation', async () => {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(options.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true }),
      },
    );
    const body = await response.json();
    assert(response.status === 200, `Anonymous account creation returned HTTP ${response.status}.`);
    session = sanitizeSession(body);
  });
  if (!session) return;

  await step('anonymous token refresh', async () => {
    const response = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(options.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: session.refreshToken,
        }),
      },
    );
    const body = await response.json();
    assert(response.status === 200, `Anonymous token refresh returned HTTP ${response.status}.`);
    session = sanitizeSession(body);
  });

  const poll = nextMatch?.polls?.[0];
  const matchTimestamp = Date.parse(nextMatch?.match?.kickoff);
  let aggregateBeforeSubmission;
  if (poll?.state === 'open' && Number.isSafeInteger(matchTimestamp)) {
    await step('pre-submission aggregate snapshot', async () => {
      aggregateBeforeSubmission = await readCanonicalAggregate(poll.id);
    });
    const idempotencyKey = randomUUID();
    await step('accepted anonymous response', async () => {
      const result = await submitResponse(matchTimestamp, session.idToken, idempotencyKey);
      expectStatus(result, 201);
      assert(result.body?.status === 'accepted', 'First response was not accepted.');
    });
    await step('idempotent duplicate response', async () => {
      const result = await submitResponse(matchTimestamp, session.idToken, idempotencyKey);
      expectStatus(result, 200);
      assert(result.body?.status === 'duplicate', 'Duplicate response was not identified.');
    });
  } else {
    const detail = `Next confidence poll state is ${poll?.state ?? 'unavailable'}; no production-shaped response was created.`;
    if (options.requireOpenPoll) results.push({ name: 'accepted anonymous response', status: 'failed', durationMs: 0, detail });
    else results.push({ name: 'accepted anonymous response', status: 'skipped', durationMs: 0, detail });
  }

  let deletionReceipt;
  await step('installation deletion request', async () => {
    const result = await apiRequest('/v1/installations/me', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.idToken}` },
    });
    expectStatus(result, 202);
    assert(result.body?.status === 'scheduled', 'Deletion was not scheduled.');
    assert(typeof result.body?.receiptId === 'string', 'Deletion receipt is missing.');
    deletionReceipt = result.body.receiptId;
  });
  await step('idempotent deletion receipt', async () => {
    const result = await apiRequest('/v1/installations/me', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.idToken}` },
    });
    expectStatus(result, 202);
    assert(result.body?.receiptId === deletionReceipt, 'Deletion receipt changed on retry.');
  });

  if (aggregateBeforeSubmission && poll?.id) {
    await step('aggregate correction after deletion', async () => {
      const correctedAggregate = await readCanonicalAggregate(poll.id);
      assert(
        JSON.stringify(correctedAggregate) === JSON.stringify(aggregateBeforeSubmission),
        'Aggregate did not return to its pre-submission state after deletion.',
      );
    });
  } else {
    results.push({
      name: 'aggregate correction after deletion',
      status: 'skipped',
      durationMs: 0,
      detail: 'No accepted smoke response required correction.',
    });
  }
}

async function submitResponse(matchTimestamp, idToken, idempotencyKey) {
  return apiRequest(`/v1/legacy-polls/${matchTimestamp}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      'X-Client-Version': '1.0.5',
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ choice: 'high' }),
  });
}

async function readCanonicalAggregate(pollId) {
  const result = await apiRequest(`/v1/polls/${encodeURIComponent(pollId)}/aggregate?smoke=${randomUUID()}`);
  expectStatus(result, 200);
  assert(result.body?.acceptedResponses === result.body?.choices?.total, 'Aggregate totals are inconsistent.');
  return result.body.choices;
}

async function step(name, operation) {
  const startedAt = Date.now();
  try {
    await operation();
    results.push({ name, status: 'passed', durationMs: Date.now() - startedAt });
  } catch (error) {
    results.push({
      name,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      detail: error instanceof Error ? error.message : 'Unknown smoke-test failure.',
    });
  }
}

async function apiRequest(route, requestOptions = {}) {
  const response = await fetch(`${apiBaseUrl}${route}`, {
    ...requestOptions,
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, body };
}

function expectStatus(result, expectedStatus) {
  assert(result.status === expectedStatus, `Expected HTTP ${expectedStatus}, received ${result.status}.`);
}

function expectProblem(result, expectedStatus, expectedCode) {
  expectStatus(result, expectedStatus);
  assert(result.body?.code === expectedCode, `Expected problem code ${expectedCode}, received ${result.body?.code ?? 'none'}.`);
  assert(typeof result.body?.requestId === 'string', 'Problem response did not include a request ID.');
}

function sanitizeSession(body) {
  const idToken = body.idToken ?? body.access_token;
  const refreshToken = body.refreshToken ?? body.refresh_token;
  assert(typeof idToken === 'string' && idToken.length > 0, 'Authentication response did not include an ID token.');
  assert(typeof refreshToken === 'string' && refreshToken.length > 0, 'Authentication response did not include a refresh token.');
  return { idToken, refreshToken };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeBaseUrl(value) {
  if (!value) throw new Error('Usage: npm run smoke:phase0 -- --api-base-url <URL> [--authenticated --api-key <key>] [--require-open-poll] [--output <path>]');
  const url = new URL(value);
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocal) throw new Error('Smoke-test API URL must use HTTPS unless it is local.');
  return url.toString().replace(/\/$/, '');
}

function parseArguments(values) {
  const parsed = {
    apiBaseUrl: null,
    apiKey: null,
    authenticated: false,
    requireOpenPoll: false,
    output: null,
    timeoutMs: 15_000,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--authenticated') parsed.authenticated = true;
    else if (value === '--require-open-poll') parsed.requireOpenPoll = true;
    else if (['--api-base-url', '--api-key', '--output', '--timeout-ms'].includes(value)) {
      const argument = values[index + 1];
      if (!argument) throw new Error(`${value} requires a value.`);
      const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      parsed[key] = value === '--timeout-ms' ? Number(argument) : argument;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  if (!Number.isInteger(parsed.timeoutMs) || parsed.timeoutMs < 1_000 || parsed.timeoutMs > 120_000) {
    throw new Error('--timeout-ms must be between 1000 and 120000.');
  }
  return parsed;
}
