import { describe, expect, it, vi } from 'vitest';
import type { CompatibilityPollService } from '../src/service.js';
import { PollReadService } from '../src/poll-read-service.js';

const now = Date.parse('2026-08-08T02:31:00Z');

describe('PollReadService', () => {
  it('returns a contract-validated aggregate for a canonical poll ID', async () => {
    const compatibilityService = {
      getCanonicalAggregateResult: vi.fn(async () => ({
        aggregate: { high: 3, medium: 2, low: 1, total: 6 },
        window: {
          pollId: 'legacy-1786156200000-confidence-v1',
          canonicalPollId: 'poll-espn-401999001-confidence-v1',
          matchId: 'espn-401999001',
          teamId: 'timbers',
          matchTimestamp: 1786156200000,
          matchStatus: 'scheduled',
          providerEventId: '401999001',
          opensAtMs: 1785897000000,
          closesAtMs: 1786156200000,
        },
      })),
    } as unknown as CompatibilityPollService;
    const service = new PollReadService(compatibilityService, () => now);

    await expect(service.getAggregate('poll-espn-401999001-confidence-v1')).resolves.toEqual({
      poll: {
        id: 'poll-espn-401999001-confidence-v1',
        matchId: 'espn-401999001',
        teamId: 'timbers',
        kind: 'confidence',
        version: 1,
        state: 'closed',
        opensAt: '2026-08-05T02:30:00.000Z',
        closesAt: '2026-08-08T02:30:00.000Z',
      },
      identityClass: 'integrity_controlled',
      acceptedResponses: 6,
      choices: { high: 3, medium: 2, low: 1, total: 6 },
      generatedAt: '2026-08-08T02:31:00.000Z',
    });
  });

  it('maps malformed identifiers to the stable poll-not-found error', async () => {
    const compatibilityService = {} as CompatibilityPollService;
    const service = new PollReadService(compatibilityService, () => now);

    await expect(service.getAggregate('legacy-1786156200000-confidence-v1')).rejects.toThrow(
      'poll_not_found',
    );
  });

  it('keeps planned-team aggregate reads behind the polling capability gate', async () => {
    const compatibilityService = {
      getCanonicalAggregateResult: vi.fn(async () => ({
        aggregate: { high: 0, medium: 0, low: 0, total: 0 },
        window: {
          pollId: 'legacy-1786156200000-confidence-v1',
          canonicalPollId: 'poll-espn-401999001-confidence-v1',
          matchId: 'espn-401999001',
          teamId: 'thorns',
          matchTimestamp: 1786156200000,
          matchStatus: 'scheduled',
          providerEventId: '401999001',
          opensAtMs: 1785897000000,
          closesAtMs: 1786156200000,
        },
      })),
    } as unknown as CompatibilityPollService;
    const service = new PollReadService(compatibilityService, () => now);

    await expect(service.getAggregate('poll-espn-401999001-confidence-v1')).rejects.toThrow(
      'capability_unavailable',
    );
  });

  it('returns a void poll after a postponed match is synchronized', async () => {
    const compatibilityService = {
      getCanonicalAggregateResult: vi.fn(async () => ({
        aggregate: { high: 0, medium: 0, low: 0, total: 0 },
        window: {
          pollId: 'legacy-1786156200000-confidence-v1',
          canonicalPollId: 'poll-espn-401999001-confidence-v1',
          matchId: 'espn-401999001',
          teamId: 'timbers',
          matchTimestamp: 1786156200000,
          matchStatus: 'postponed',
          providerEventId: '401999001',
          opensAtMs: 1785897000000,
          closesAtMs: 1786156200000,
        },
      })),
    } as unknown as CompatibilityPollService;
    const service = new PollReadService(compatibilityService, () => now);

    await expect(service.getAggregate(
      'poll-espn-401999001-confidence-v1',
    )).resolves.toEqual(expect.objectContaining({
      poll: expect.objectContaining({ state: 'void' }),
    }));
  });
});
