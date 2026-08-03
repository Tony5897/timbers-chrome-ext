import { describe, expect, it } from 'vitest';
import {
  aggregateSchema,
  apiErrorSchema,
  matchIdSchema,
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
});
