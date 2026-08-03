import { randomUUID } from 'node:crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  isValidIdempotencyKey,
  matchTimestampSchema,
  responseBodySchema,
} from './domain.js';
import type { PublicReadService } from './public-read-service.js';
import type { PollReadService } from './poll-read-service.js';
import type { CompatibilityPollService } from './service.js';

type RequestLike = {
  method: string;
  path: string;
  body?: unknown;
  query?: Record<string, unknown>;
  get(name: string): string | undefined;
};

type ResponseLike = {
  status(code: number): ResponseLike;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end(): void;
};

type AuthVerifier = (token: string) => Promise<DecodedIdToken>;

type ApiDependencies = {
  service: CompatibilityPollService;
  publicReadService: PublicReadService;
  pollReadService: PollReadService;
  verifyIdToken: AuthVerifier;
};

const routePattern = /^\/v1\/legacy-polls\/(\d{13})\/(aggregate|responses)$/;
const teamRoutePattern = /^\/v1\/teams\/([^/]+)$/;
const pollAggregateRoutePattern = /^\/v1\/polls\/([^/]+)\/aggregate$/;

export function createApiHandler(dependencies: ApiDependencies) {
  return async (request: RequestLike, response: ResponseLike): Promise<void> => {
    const requestId = randomUUID();
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');

    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }

    if (request.method === 'GET' && request.path === '/v1/health') {
      response.setHeader('Cache-Control', 'no-store');
      response.status(200).json({ status: 'ok', service: 'matchday-compatibility-api' });
      return;
    }

    if (request.method === 'GET' && request.path === '/v1/config') {
      response.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
      response.status(200).json(dependencies.publicReadService.getConfig());
      return;
    }

    if (request.method === 'GET' && request.path === '/v1/teams') {
      response.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
      response.status(200).json({ teams: dependencies.publicReadService.listTeams() });
      return;
    }

    const teamRoute = teamRoutePattern.exec(request.path);
    if (request.method === 'GET' && teamRoute) {
      try {
        response.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
        response.status(200).json({ team: dependencies.publicReadService.getTeam(teamRoute[1]) });
      } catch (error) {
        const code = error instanceof Error ? error.message : 'internal_error';
        const mapped = mapError(code);
        problem(response, requestId, mapped.status, mapped.code, mapped.detail);
      }
      return;
    }

    if (request.method === 'GET' && request.path === '/v1/matches/next') {
      try {
        const result = await dependencies.publicReadService.getNextMatch(request.query?.teamId);
        response.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=180');
        response.status(200).json(result);
      } catch (error) {
        const code = error instanceof Error ? error.message : 'internal_error';
        const mapped = mapError(code);
        problem(response, requestId, mapped.status, mapped.code, mapped.detail);
      }
      return;
    }

    const pollAggregateRoute = pollAggregateRoutePattern.exec(request.path);
    if (request.method === 'GET' && pollAggregateRoute) {
      try {
        const result = await dependencies.pollReadService.getAggregate(pollAggregateRoute[1]);
        response.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
        response.status(200).json(result);
      } catch (error) {
        const code = error instanceof Error ? error.message : 'internal_error';
        const mapped = mapError(code);
        problem(response, requestId, mapped.status, mapped.code, mapped.detail);
      }
      return;
    }

    if (request.method === 'DELETE' && request.path === '/v1/installations/me') {
      try {
        const decodedToken = await authenticateAnonymous(request, dependencies.verifyIdToken);
        const receipt = await dependencies.service.deleteInstallation(decodedToken.uid);
        response.setHeader('Cache-Control', 'no-store');
        response.status(202).json({
          status: 'scheduled',
          receiptId: receipt.receiptId,
          requestedAt: new Date(receipt.requestedAtMs).toISOString(),
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : 'internal_error';
        const mapped = mapError(code);
        problem(response, requestId, mapped.status, mapped.code, mapped.detail);
      }
      return;
    }

    const route = routePattern.exec(request.path);
    if (!route) {
      problem(response, requestId, 404, 'route_not_found', 'The requested API route does not exist.');
      return;
    }

    const timestampResult = matchTimestampSchema.safeParse(route[1]);
    if (!timestampResult.success) {
      problem(response, requestId, 400, 'invalid_match_timestamp', 'The match timestamp is invalid.');
      return;
    }
    const matchTimestamp = timestampResult.data;
    const action = route[2];

    try {
      if (request.method === 'GET' && action === 'aggregate') {
        const result = await dependencies.service.getAggregateResult(matchTimestamp);
        response.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
        response.status(200).json({
          pollId: result.pollId,
          matchTimestamp: result.matchTimestamp,
          identityClass: 'integrity_controlled',
          acceptedResponses: result.aggregate.total,
          choices: result.aggregate,
        });
        return;
      }

      if (request.method === 'POST' && action === 'responses') {
        const decodedToken = await authenticateAnonymous(request, dependencies.verifyIdToken);

        const body = responseBodySchema.safeParse(request.body);
        if (!body.success) {
          problem(response, requestId, 400, 'invalid_response', 'The response choice is invalid.');
          return;
        }

        const clientVersion = request.get('X-Client-Version') ?? '';
        const idempotencyKey = request.get('X-Idempotency-Key') ?? '';
        if (!isValidIdempotencyKey(idempotencyKey)) {
          problem(response, requestId, 400, 'invalid_idempotency_key', 'A valid idempotency key is required.');
          return;
        }

        const result = await dependencies.service.submit({
          matchTimestamp,
          uid: decodedToken.uid,
          choice: body.data.choice,
          clientVersion,
          idempotencyKey,
        });
        response.setHeader('Cache-Control', 'no-store');
        response.status(result.status === 'accepted' ? 201 : 200).json({
          status: result.status,
          acceptedChoice: result.choice,
          identityClass: 'integrity_controlled',
          acceptedResponses: result.aggregate.total,
          choices: result.aggregate,
        });
        return;
      }

      problem(response, requestId, 405, 'method_not_allowed', 'The HTTP method is not allowed for this route.');
    } catch (error) {
      const code = error instanceof Error ? error.message : 'internal_error';
      const mapped = mapError(code);
      problem(response, requestId, mapped.status, mapped.code, mapped.detail);
    }
  };
}

async function authenticate(request: RequestLike, verifyIdToken: AuthVerifier): Promise<DecodedIdToken> {
  const authorization = request.get('Authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(authorization);
  if (!match) throw new Error('authentication_required');
  const token = match[1];
  if (!token) throw new Error('authentication_required');
  try {
    return await verifyIdToken(token);
  } catch {
    throw new Error('invalid_authentication');
  }
}

async function authenticateAnonymous(
  request: RequestLike,
  verifyIdToken: AuthVerifier,
): Promise<DecodedIdToken> {
  const decodedToken = await authenticate(request, verifyIdToken);
  if (decodedToken.firebase?.sign_in_provider !== 'anonymous') {
    throw new Error('anonymous_installation_required');
  }
  return decodedToken;
}

function mapError(code: string): { status: number; code: string; detail: string } {
  const errors: Record<string, { status: number; code: string; detail: string }> = {
    authentication_required: { status: 401, code, detail: 'A Firebase ID token is required.' },
    invalid_authentication: { status: 401, code, detail: 'The Firebase ID token is invalid or expired.' },
    anonymous_installation_required: { status: 403, code, detail: 'An anonymous installation identity is required.' },
    unsupported_client: { status: 426, code, detail: 'This extension version is no longer supported for community submissions.' },
    poll_not_found: { status: 404, code, detail: 'No eligible poll exists for this match.' },
    poll_alias_ambiguous: { status: 503, code: 'poll_unavailable', detail: 'The poll aggregate is temporarily unavailable.' },
    invalid_poll_window: { status: 503, code: 'poll_unavailable', detail: 'The poll aggregate is temporarily unavailable.' },
    poll_not_open: { status: 409, code, detail: 'This poll is not open yet.' },
    poll_closed: { status: 409, code, detail: 'This poll is closed.' },
    rate_limited: { status: 429, code, detail: 'The anonymous installation has reached the daily response limit.' },
    installation_deletion_pending: { status: 409, code, detail: 'This anonymous installation is being deleted.' },
    team_not_found: { status: 404, code, detail: 'The requested team does not exist.' },
    match_not_found: { status: 404, code, detail: 'No upcoming match is available for this team.' },
    capability_unavailable: { status: 409, code, detail: 'This capability is not enabled for the requested team.' },
    provider_timeout: { status: 504, code: 'provider_unavailable', detail: 'The schedule provider timed out.' },
    provider_invalid_response: { status: 502, code: 'provider_unavailable', detail: 'The schedule provider returned an invalid response.' },
    provider_unavailable: { status: 503, code, detail: 'The schedule provider is temporarily unavailable.' },
    provider_http_400: { status: 502, code: 'provider_unavailable', detail: 'The schedule provider is unavailable.' },
    provider_http_401: { status: 502, code: 'provider_unavailable', detail: 'The schedule provider is unavailable.' },
    provider_http_403: { status: 502, code: 'provider_unavailable', detail: 'The schedule provider is unavailable.' },
    provider_http_404: { status: 502, code: 'provider_unavailable', detail: 'The schedule provider is unavailable.' },
    provider_http_429: { status: 503, code: 'provider_unavailable', detail: 'The schedule provider is temporarily unavailable.' },
    provider_http_500: { status: 502, code: 'provider_unavailable', detail: 'The schedule provider is unavailable.' },
    provider_http_502: { status: 502, code: 'provider_unavailable', detail: 'The schedule provider is unavailable.' },
    provider_http_503: { status: 503, code: 'provider_unavailable', detail: 'The schedule provider is temporarily unavailable.' },
    provider_http_504: { status: 504, code: 'provider_unavailable', detail: 'The schedule provider timed out.' },
  };
  return errors[code] ?? { status: 500, code: 'internal_error', detail: 'The request could not be completed.' };
}

function problem(
  response: ResponseLike,
  requestId: string,
  status: number,
  code: string,
  detail: string,
): void {
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json({
    type: 'about:blank',
    title: code.replaceAll('_', ' '),
    status,
    code,
    detail,
    requestId,
  });
}
