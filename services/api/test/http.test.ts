import { describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { CompatibilityPollService } from '../src/service.js';
import type { PublicReadService } from '../src/public-read-service.js';
import { createApiHandler } from '../src/http.js';

type CapturedResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body?: unknown;
  ended: boolean;
};

function responseCapture() {
  const captured: CapturedResponse = { statusCode: 200, headers: {}, ended: false };
  const response = {
    status(code: number) {
      captured.statusCode = code;
      return response;
    },
    setHeader(name: string, value: string) {
      captured.headers[name] = value;
    },
    json(body: unknown) {
      captured.body = body;
    },
    end() {
      captured.ended = true;
    },
  };
  return { response, captured };
}

function request(input: {
  method: string;
  path: string;
  body?: unknown;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
}) {
  return {
    method: input.method,
    path: input.path,
    body: input.body,
    query: input.query,
    get(name: string) {
      return input.headers?.[name];
    },
  };
}

function apiHandler(
  service: CompatibilityPollService,
  verifyIdToken = vi.fn(),
  publicReadService = {} as PublicReadService,
) {
  return createApiHandler({ service, publicReadService, verifyIdToken });
}

function anonymousToken(): DecodedIdToken {
  return {
    aud: 'timbers-matchday',
    auth_time: 1,
    exp: 2,
    firebase: { identities: {}, sign_in_provider: 'anonymous' },
    iat: 1,
    iss: 'issuer',
    sub: 'anonymous-user',
    uid: 'anonymous-user',
  };
}

describe('compatibility HTTP API', () => {
  it('returns a minimal health response', async () => {
    const service = {} as CompatibilityPollService;
    const handler = apiHandler(service);
    const { response, captured } = responseCapture();

    await handler(request({ method: 'GET', path: '/v1/health' }), response);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual({ status: 'ok', service: 'matchday-compatibility-api' });
    expect(captured.headers['X-Request-Id']).toBeTruthy();
  });

  it('serves public configuration with cache metadata', async () => {
    const service = {} as CompatibilityPollService;
    const publicReadService = {
      getConfig: vi.fn(() => ({
        apiVersion: 'v1',
        generatedAt: '2026-08-03T12:00:00.000Z',
        minimumClientVersion: '1.0.5',
        teams: [],
        features: {
          canonicalMatches: true,
          multiTeamSelection: false,
          liveEvents: false,
          notifications: false,
        },
      })),
    } as unknown as PublicReadService;
    const handler = apiHandler(service, vi.fn(), publicReadService);
    const { response, captured } = responseCapture();

    await handler(request({ method: 'GET', path: '/v1/config' }), response);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual(expect.objectContaining({ apiVersion: 'v1' }));
    expect(captured.headers['Cache-Control']).toContain('max-age=300');
  });

  it('lists teams with active and planned availability', async () => {
    const service = {} as CompatibilityPollService;
    const teams = [
      { id: 'timbers', status: 'active' },
      { id: 'thorns', status: 'planned' },
    ];
    const publicReadService = {
      listTeams: vi.fn(() => teams),
    } as unknown as PublicReadService;
    const handler = apiHandler(service, vi.fn(), publicReadService);
    const { response, captured } = responseCapture();

    await handler(request({ method: 'GET', path: '/v1/teams' }), response);

    expect(captured.body).toEqual({ teams });
  });

  it('serves a team capability document by stable team ID', async () => {
    const service = {} as CompatibilityPollService;
    const team = { id: 'timbers', status: 'active', capabilities: { schedule: true } };
    const publicReadService = {
      getTeam: vi.fn(() => team),
    } as unknown as PublicReadService;
    const handler = apiHandler(service, vi.fn(), publicReadService);
    const { response, captured } = responseCapture();

    await handler(request({ method: 'GET', path: '/v1/teams/timbers' }), response);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual({ team });
    expect(publicReadService.getTeam).toHaveBeenCalledWith('timbers');
  });

  it('returns a stable not-found error for an unknown team ID', async () => {
    const service = {} as CompatibilityPollService;
    const publicReadService = {
      getTeam: vi.fn(() => { throw new Error('team_not_found'); }),
    } as unknown as PublicReadService;
    const handler = apiHandler(service, vi.fn(), publicReadService);
    const { response, captured } = responseCapture();

    await handler(request({ method: 'GET', path: '/v1/teams/unknown' }), response);

    expect(captured.statusCode).toBe(404);
    expect(captured.body).toEqual(expect.objectContaining({ code: 'team_not_found' }));
  });

  it('serves a canonical next match for a requested team', async () => {
    const service = {} as CompatibilityPollService;
    const canonicalMatch = {
      id: 'espn-401999001',
      teamId: 'timbers',
      competitionId: 'mls',
    };
    const publicReadService = {
      getNextMatch: vi.fn(async () => ({ match: canonicalMatch })),
    } as unknown as PublicReadService;
    const handler = apiHandler(service, vi.fn(), publicReadService);
    const { response, captured } = responseCapture();

    await handler(request({
      method: 'GET',
      path: '/v1/matches/next',
      query: { teamId: 'timbers' },
    }), response);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual({ match: canonicalMatch });
    expect(publicReadService.getNextMatch).toHaveBeenCalledWith('timbers');
    expect(captured.headers['Cache-Control']).toContain('max-age=60');
  });

  it('returns a stable capability error for planned team data', async () => {
    const service = {} as CompatibilityPollService;
    const publicReadService = {
      getNextMatch: vi.fn(async () => { throw new Error('capability_unavailable'); }),
    } as unknown as PublicReadService;
    const handler = apiHandler(service, vi.fn(), publicReadService);
    const { response, captured } = responseCapture();

    await handler(request({
      method: 'GET',
      path: '/v1/matches/next',
      query: { teamId: 'thorns' },
    }), response);

    expect(captured.statusCode).toBe(409);
    expect(captured.body).toEqual(expect.objectContaining({ code: 'capability_unavailable' }));
  });

  it('returns a stable gateway timeout when the schedule provider times out', async () => {
    const service = {} as CompatibilityPollService;
    const publicReadService = {
      getNextMatch: vi.fn(async () => { throw new Error('provider_timeout'); }),
    } as unknown as PublicReadService;
    const handler = apiHandler(service, vi.fn(), publicReadService);
    const { response, captured } = responseCapture();

    await handler(request({
      method: 'GET',
      path: '/v1/matches/next',
      query: { teamId: 'timbers' },
    }), response);

    expect(captured.statusCode).toBe(504);
    expect(captured.body).toEqual(expect.objectContaining({ code: 'provider_unavailable' }));
  });

  it('requires authentication for response submissions', async () => {
    const service = { submit: vi.fn() } as unknown as CompatibilityPollService;
    const handler = apiHandler(service);
    const { response, captured } = responseCapture();

    await handler(request({
      method: 'POST',
      path: `/v1/legacy-polls/${matchTimestamp}/responses`,
      body: { choice: 'high' },
    }), response);

    expect(captured.statusCode).toBe(401);
    expect(captured.body).toEqual(expect.objectContaining({ code: 'authentication_required' }));
  });

  it('accepts an authenticated anonymous response without exposing the UID', async () => {
    const service = {
      submit: vi.fn(async () => ({
        status: 'accepted',
        choice: 'high',
        aggregate: { high: 1, medium: 0, low: 0, total: 1 },
      })),
    } as unknown as CompatibilityPollService;
    const handler = apiHandler(service, vi.fn(async () => anonymousToken()));
    const { response, captured } = responseCapture();

    await handler(request({
      method: 'POST',
      path: `/v1/legacy-polls/${matchTimestamp}/responses`,
      body: { choice: 'high' },
      headers: {
        Authorization: 'Bearer token',
        'X-Client-Version': '1.0.5',
        'X-Idempotency-Key': '550e8400-e29b-41d4-a716-446655440000',
      },
    }), response);

    expect(captured.statusCode).toBe(201);
    expect(captured.body).toEqual({
      status: 'accepted',
      acceptedChoice: 'high',
      identityClass: 'integrity_controlled',
      acceptedResponses: 1,
      choices: { high: 1, medium: 0, low: 0, total: 1 },
    });
    expect(JSON.stringify(captured.body)).not.toContain('anonymous-user');
  });

  it('rejects non-anonymous Firebase identities', async () => {
    const token = anonymousToken();
    token.firebase.sign_in_provider = 'password';
    const service = { submit: vi.fn() } as unknown as CompatibilityPollService;
    const handler = apiHandler(service, vi.fn(async () => token));
    const { response, captured } = responseCapture();

    await handler(request({
      method: 'POST',
      path: `/v1/legacy-polls/${matchTimestamp}/responses`,
      body: { choice: 'high' },
      headers: {
        Authorization: 'Bearer token',
        'X-Client-Version': '1.0.5',
        'X-Idempotency-Key': '550e8400-e29b-41d4-a716-446655440000',
      },
    }), response);

    expect(captured.statusCode).toBe(403);
    expect(captured.body).toEqual(expect.objectContaining({ code: 'anonymous_installation_required' }));
  });

  it('serves aggregate responses with identity-class metadata', async () => {
    const service = {
      getAggregateResult: vi.fn(async () => ({
        aggregate: { high: 3, medium: 2, low: 1, total: 6 },
        pollId: `legacy-${matchTimestamp}-confidence-v1`,
        matchTimestamp,
      })),
    } as unknown as CompatibilityPollService;
    const handler = apiHandler(service);
    const { response, captured } = responseCapture();

    await handler(request({
      method: 'GET',
      path: `/v1/legacy-polls/${matchTimestamp}/aggregate`,
    }), response);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual(expect.objectContaining({
      pollId: `legacy-${matchTimestamp}-confidence-v1`,
      matchTimestamp,
      identityClass: 'integrity_controlled',
      acceptedResponses: 6,
    }));
  });

  it('returns the canonical poll identity for a legacy timestamp alias', async () => {
    const canonicalTimestamp = matchTimestamp - 30 * 60 * 1000;
    const service = {
      getAggregateResult: vi.fn(async () => ({
        aggregate: { high: 1, medium: 0, low: 0, total: 1 },
        pollId: `legacy-${canonicalTimestamp}-confidence-v1`,
        matchTimestamp: canonicalTimestamp,
      })),
    } as unknown as CompatibilityPollService;
    const handler = apiHandler(service);
    const { response, captured } = responseCapture();

    await handler(request({
      method: 'GET',
      path: `/v1/legacy-polls/${matchTimestamp}/aggregate`,
    }), response);

    expect(captured.body).toEqual(expect.objectContaining({
      pollId: `legacy-${canonicalTimestamp}-confidence-v1`,
      matchTimestamp: canonicalTimestamp,
    }));
  });

  it('returns a stable rate-limit problem without exposing identity', async () => {
    const service = {
      submit: vi.fn(async () => { throw new Error('rate_limited'); }),
    } as unknown as CompatibilityPollService;
    const handler = apiHandler(service, vi.fn(async () => anonymousToken()));
    const { response, captured } = responseCapture();

    await handler(request({
      method: 'POST',
      path: `/v1/legacy-polls/${matchTimestamp}/responses`,
      body: { choice: 'high' },
      headers: {
        Authorization: 'Bearer token',
        'X-Client-Version': '1.0.5',
        'X-Idempotency-Key': '550e8400-e29b-41d4-a716-446655440000',
      },
    }), response);

    expect(captured.statusCode).toBe(429);
    expect(captured.body).toEqual(expect.objectContaining({ code: 'rate_limited' }));
    expect(JSON.stringify(captured.body)).not.toContain('anonymous-user');
  });

  it('schedules authenticated deletion without exposing historical record counts', async () => {
    const service = {
      deleteInstallation: vi.fn(async () => ({
        receiptId: 'deletion-receipt-001',
        requestedAtMs: Date.parse('2026-08-03T12:00:00Z'),
      })),
    } as unknown as CompatibilityPollService;
    const handler = apiHandler(service, vi.fn(async () => anonymousToken()));
    const { response, captured } = responseCapture();

    await handler(request({
      method: 'DELETE',
      path: '/v1/installations/me',
      headers: { Authorization: 'Bearer token' },
    }), response);

    expect(captured.statusCode).toBe(202);
    expect(captured.body).toEqual({
      status: 'scheduled',
      receiptId: 'deletion-receipt-001',
      requestedAt: '2026-08-03T12:00:00.000Z',
    });
    expect(JSON.stringify(captured.body)).not.toContain('anonymous-user');
    expect(JSON.stringify(captured.body)).not.toContain('deletedResponses');
  });

  it('requires authentication for installation deletion', async () => {
    const service = { deleteInstallation: vi.fn() } as unknown as CompatibilityPollService;
    const handler = apiHandler(service);
    const { response, captured } = responseCapture();

    await handler(request({ method: 'DELETE', path: '/v1/installations/me' }), response);

    expect(captured.statusCode).toBe(401);
    expect(service.deleteInstallation).not.toHaveBeenCalled();
  });
});

const matchTimestamp = 1786156200000;
