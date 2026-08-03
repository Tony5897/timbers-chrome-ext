import { describe, expect, it, vi } from 'vitest';
import type { CanonicalMatch } from '@matchday/contracts';
import { PublicReadService } from '../src/public-read-service.js';

const now = Date.parse('2026-08-03T12:00:00Z');
const nextMatch: CanonicalMatch = {
  id: 'espn-401999001',
  teamId: 'timbers',
  competitionId: 'mls',
  provider: 'espn_bootstrap',
  providerEventId: '401999001',
  kickoff: '2026-08-08T02:30:00.000Z',
  opponent: 'Fixture Opponent',
  homeAway: 'home',
  venue: 'Providence Park',
  status: 'scheduled',
  dataUpdatedAt: '2026-08-03T12:00:00.000Z',
};

describe('PublicReadService', () => {
  it('exposes contract-validated config with gated capabilities', () => {
    const service = new PublicReadService(vi.fn(), () => now);

    expect(service.getConfig()).toEqual(expect.objectContaining({
      apiVersion: 'v1',
      minimumClientVersion: '1.0.5',
      generatedAt: '2026-08-03T12:00:00.000Z',
      features: expect.objectContaining({
        canonicalMatches: true,
        canonicalPolls: true,
        multiTeamSelection: false,
        liveEvents: false,
      }),
    }));
  });

  it('lists active Timbers and planned Thorns without enabling unsupported capabilities', () => {
    const service = new PublicReadService(vi.fn(), () => now);

    expect(service.listTeams()).toEqual([
      expect.objectContaining({ id: 'timbers', status: 'active' }),
      expect.objectContaining({
        id: 'thorns',
        status: 'planned',
        capabilities: expect.objectContaining({ schedule: false, polling: false }),
      }),
    ]);
  });

  it('returns the next scheduled Timbers match', async () => {
    const fetchMatches = vi.fn(async () => [
      { ...nextMatch, kickoff: '2026-08-02T02:30:00.000Z' },
      nextMatch,
    ]);
    const service = new PublicReadService(fetchMatches, () => now);

    await expect(service.getNextMatch('timbers')).resolves.toEqual({
      match: nextMatch,
      polls: [{
        id: 'poll-espn-401999001-confidence-v1',
        matchId: 'espn-401999001',
        teamId: 'timbers',
        kind: 'confidence',
        version: 1,
        state: 'scheduled',
        opensAt: '2026-08-05T02:30:00.000Z',
        closesAt: '2026-08-08T02:30:00.000Z',
      }],
    });
    expect(fetchMatches).toHaveBeenCalledWith('timbers');
  });

  it('keeps Thorns schedule reads disabled behind the capability gate', async () => {
    const fetchMatches = vi.fn(async () => [nextMatch]);
    const service = new PublicReadService(fetchMatches, () => now);

    await expect(service.getNextMatch('thorns')).rejects.toThrow('capability_unavailable');
    expect(fetchMatches).not.toHaveBeenCalled();
  });

  it('rejects unknown team IDs without leaking schema details', () => {
    const service = new PublicReadService(vi.fn(), () => now);

    expect(() => service.getTeam('unknown')).toThrow('team_not_found');
  });
});
