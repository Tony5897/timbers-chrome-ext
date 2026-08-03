import { describe, expect, it } from 'vitest';
import {
  aggregateSchema,
  apiErrorSchema,
  confidencePollSchema,
  matchIdSchema,
  pollAggregateResponseSchema,
  pollIdSchema,
} from '@matchday/contracts';

describe('shared contracts', () => {
  it('rejects aggregates whose choices do not sum to total', () => {
    expect(aggregateSchema.safeParse({ high: 2, medium: 1, low: 0, total: 4 }).success).toBe(false);
  });

  it('rejects non-canonical match IDs', () => {
    expect(matchIdSchema.safeParse('provider:event').success).toBe(false);
    expect(matchIdSchema.safeParse('espn-401999001').success).toBe(true);
  });

  it('validates the stable API problem shape', () => {
    expect(apiErrorSchema.safeParse({
      type: 'about:blank',
      title: 'team not found',
      status: 404,
      code: 'team_not_found',
      detail: 'The requested team does not exist.',
      requestId: '550e8400-e29b-41d4-a716-446655440000',
    }).success).toBe(true);
  });

  it('validates match-qualified confidence poll IDs and time windows', () => {
    expect(pollIdSchema.safeParse('poll-espn-401999001-confidence-v1').success).toBe(true);
    expect(pollIdSchema.safeParse('legacy-1786156200000-confidence-v1').success).toBe(false);
    expect(confidencePollSchema.safeParse({
      id: 'poll-espn-401999001-confidence-v1',
      matchId: 'espn-401999001',
      teamId: 'timbers',
      kind: 'confidence',
      version: 1,
      state: 'open',
      opensAt: '2026-08-05T02:30:00.000Z',
      closesAt: '2026-08-08T02:30:00.000Z',
    }).success).toBe(true);
  });

  it('rejects aggregate responses whose accepted count differs from choices', () => {
    expect(pollAggregateResponseSchema.safeParse({
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
      acceptedResponses: 3,
      choices: { high: 1, medium: 1, low: 0, total: 2 },
      generatedAt: '2026-08-08T02:31:00.000Z',
    }).success).toBe(false);
  });
});
