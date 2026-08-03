import { describe, expect, it } from 'vitest';
import {
  confidencePollForWindow,
  confidencePollIdForMatch,
  matchIdFromConfidencePollId,
  providerReferenceForMatchId,
} from '@matchday/domain';

describe('shared poll domain', () => {
  it('round-trips stable match-qualified confidence poll IDs', () => {
    const pollId = confidencePollIdForMatch('espn-401999001');

    expect(pollId).toBe('poll-espn-401999001-confidence-v1');
    expect(matchIdFromConfidencePollId(pollId)).toBe('espn-401999001');
    expect(providerReferenceForMatchId('espn-401999001')).toEqual({
      provider: 'espn',
      providerEventId: '401999001',
    });
  });

  it.each([
    [1785896999999, 'scheduled'],
    [1785897000000, 'open'],
    [1786156199999, 'open'],
    [1786156200000, 'closed'],
  ] as const)('derives poll state at boundary %s', (nowMs, state) => {
    expect(confidencePollForWindow({
      matchId: 'espn-401999001',
      teamId: 'timbers',
      opensAtMs: 1785897000000,
      closesAtMs: 1786156200000,
    }, nowMs).state).toBe(state);
  });

  it('voids polls for postponed or cancelled matches', () => {
    expect(confidencePollForWindow({
      matchId: 'espn-401999001',
      teamId: 'timbers',
      opensAtMs: 1785897000000,
      closesAtMs: 1786156200000,
      matchStatus: 'postponed',
    }, 1785897000000).state).toBe('void');
  });
});
