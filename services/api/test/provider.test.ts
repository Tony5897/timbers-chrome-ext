import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchCanonicalMatches,
  fetchCompatibilityPollWindows,
  fetchLiveMatch,
  fetchStandings,
  parseCanonicalSchedule,
  parseCompatibilitySchedule,
} from '../src/provider.js';

const canonicalEvent = {
  id: '401999001',
  date: '2026-08-08T02:30:00Z',
  competitions: [{
    competitors: [
      { homeAway: 'home', team: { id: '9723', displayName: 'Portland Timbers' } },
      { homeAway: 'away', team: { id: '9999', displayName: 'Fixture Opponent' } },
    ],
    venue: { fullName: 'Providence Park' },
    status: { type: { state: 'pre', completed: false, name: 'STATUS_SCHEDULED' } },
  }],
};

describe('ESPN compatibility adapter', () => {
  it('normalizes provider events into versioned poll windows', async () => {
    const fetchImplementation = vi.fn(async (url: string) => new Response(JSON.stringify({
      events: url.includes('/usa.nwsl/') ? [] : [canonicalEvent],
    }), { status: 200 })) as unknown as typeof fetch;

    const windows = await fetchCompatibilityPollWindows(
      fetchImplementation,
      new Date('2026-08-03T12:00:00Z'),
    );

    expect(fetchImplementation).toHaveBeenCalledWith(
      expect.stringMatching(/season=2026&fixture=true$/),
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    );
    expect(windows).toEqual([{
      pollId: 'legacy-1786156200000-confidence-v1',
      canonicalPollId: 'poll-espn-401999001-confidence-v1',
      matchId: 'espn-401999001',
      teamId: 'timbers',
      matchTimestamp: 1786156200000,
      matchStatus: 'scheduled',
      providerEventId: '401999001',
      opensAtMs: 1785897000000,
      closesAtMs: 1786156200000,
    }]);
  });

  it('fails closed on malformed provider data', async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({ events: 'invalid' }), {
      status: 200,
    })) as unknown as typeof fetch;

    await expect(fetchCompatibilityPollWindows(fetchImplementation)).rejects.toThrow();
  });

  it('surfaces a stable provider HTTP failure', async () => {
    const fetchImplementation = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch;

    await expect(fetchCompatibilityPollWindows(fetchImplementation)).rejects.toThrow('provider_http_503');
  });

  it('maps malformed provider data to a stable invalid-response failure', async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({ events: 'invalid' }), {
      status: 200,
    })) as unknown as typeof fetch;

    await expect(fetchCanonicalMatches('timbers', fetchImplementation)).rejects.toThrow(
      'provider_invalid_response',
    );
  });

  it('maps aborted provider requests to a stable timeout failure', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchImplementation = vi.fn(async () => Promise.reject(abortError)) as unknown as typeof fetch;

    await expect(fetchCanonicalMatches('timbers', fetchImplementation)).rejects.toThrow(
      'provider_timeout',
    );
  });

  it('normalizes canonical matches with stable provider-qualified IDs', async () => {
    const fetchImplementation = vi.fn(async (url: string) => new Response(JSON.stringify({
      events: url.includes('/usa.nwsl/') ? [] : [canonicalEvent],
    }), { status: 200 })) as unknown as typeof fetch;

    const matches = await fetchCanonicalMatches(
      'timbers',
      fetchImplementation,
      new Date('2026-08-03T12:00:00Z'),
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual(expect.objectContaining({
      id: 'espn-401999001',
      teamId: 'timbers',
      providerEventId: '401999001',
      opponent: 'Fixture Opponent',
      homeAway: 'home',
      venue: 'Providence Park',
      status: 'scheduled',
      dataUpdatedAt: '2026-08-03T12:00:00.000Z',
    }));
  });

  it.each(['timbers', 'thorns'] as const)('normalizes %s standings into shared rows', async (teamId) => {
    const providerTeamId = teamId === 'timbers' ? '9723' : '15362';
    const leaguePath = teamId === 'timbers' ? 'usa.1' : 'usa.nwsl';
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({
      children: [{ standings: { entries: [{ team: { id: providerTeamId, displayName: teamId === 'timbers' ? 'Portland Timbers' : 'Portland Thorns FC' }, stats: [
        { name: 'rank', value: 1 }, { name: 'points', value: 42 }, { name: 'gamesplayed', value: 20 },
      ] }] } }],
    }), { status: 200 })) as unknown as typeof fetch;

    const standings = await fetchStandings(teamId, fetchImplementation, new Date('2026-08-03T12:00:00Z'));

    expect(fetchImplementation).toHaveBeenCalledWith(
      `https://site.api.espn.com/apis/v2/sports/soccer/${leaguePath}/standings?season=2026`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(standings[0]).toEqual(expect.objectContaining({ teamId, group: null, rank: 1, points: 42, highlight: true }));
  });

  it('splits a multi-conference table into named groups with independent per-conference ranks', async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({
      children: [
        {
          name: 'Eastern Conference',
          abbreviation: 'East',
          standings: { entries: [
            { team: { id: '9999', displayName: 'Nashville SC' }, stats: [{ name: 'rank', value: 1 }, { name: 'points', value: 57 }] },
            { team: { id: '182', displayName: 'Chicago Fire FC' }, stats: [{ name: 'rank', value: 5 }, { name: 'points', value: 39 }] },
          ] },
        },
        {
          name: 'Western Conference',
          abbreviation: 'West',
          standings: { entries: [
            { team: { id: '8888', displayName: 'Vancouver Whitecaps FC' }, stats: [{ name: 'rank', value: 1 }, { name: 'points', value: 49 }] },
            { team: { id: '9723', displayName: 'Portland Timbers' }, stats: [{ name: 'rank', value: 9 }, { name: 'points', value: 32 }] },
          ] },
        },
      ],
    }), { status: 200 })) as unknown as typeof fetch;

    const standings = await fetchStandings('timbers', fetchImplementation, new Date('2026-09-24T12:00:00Z'));

    expect(standings).toEqual([
      expect.objectContaining({ group: 'Eastern Conference', rank: 1, club: 'Nashville SC', highlight: false }),
      expect.objectContaining({ group: 'Eastern Conference', rank: 5, club: 'Chicago Fire FC', highlight: false }),
      expect.objectContaining({ group: 'Western Conference', rank: 1, club: 'Vancouver Whitecaps FC', highlight: false }),
      expect.objectContaining({ group: 'Western Conference', rank: 9, club: 'Portland Timbers', highlight: true }),
    ]);
  });

  it('falls back to a 1-based rank within its own group when the provider omits a rank stat', async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({
      children: [
        { name: 'Eastern Conference', standings: { entries: [
          { team: { id: '1', displayName: 'Club A' }, stats: [{ name: 'points', value: 50 }] },
          { team: { id: '2', displayName: 'Club B' }, stats: [{ name: 'points', value: 40 }] },
        ] } },
        { name: 'Western Conference', standings: { entries: [
          { team: { id: '9723', displayName: 'Portland Timbers' }, stats: [{ name: 'points', value: 45 }] },
        ] } },
      ],
    }), { status: 200 })) as unknown as typeof fetch;

    const standings = await fetchStandings('timbers', fetchImplementation, new Date('2026-09-24T12:00:00Z'));

    expect(standings.map((row) => row.rank)).toEqual([1, 2, 1]);
  });

  it('normalizes live score and goal details for Thorns', async () => {
    const match = {
      id: 'espn-live-thorns-1', teamId: 'thorns' as const, competitionId: 'nwsl' as const,
      provider: 'espn_bootstrap' as const, providerEventId: 'live-thorns-1',
      kickoff: '2026-08-08T02:30:00.000Z', opponent: 'Fixture Opponent', homeAway: 'away' as const,
      venue: 'Fixture Stadium', broadcasts: [], status: 'live' as const, dataUpdatedAt: '2026-08-08T02:30:00.000Z',
    };
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({ events: [{ id: 'live-thorns-1', competitions: [{ competitors: [
      { homeAway: 'home', score: '0', team: { id: '8888', displayName: 'Fixture Opponent' } },
      { homeAway: 'away', score: '1', team: { id: '15362', displayName: 'Portland Thorns FC' } },
    ], details: [{ id: 'goal-1', text: 'Goal', clock: { displayValue: '27' }, team: { id: '15362' }, athlete: { displayName: 'Fixture Player' } }] }] }] }), { status: 200 })) as unknown as typeof fetch;

    const live = await fetchLiveMatch('thorns', match, fetchImplementation);

    expect(live).toEqual(expect.objectContaining({ homeScore: 0, awayScore: 1, source: 'live', freshness: 'fresh' }));
    expect(live.events[0]).toEqual(expect.objectContaining({ type: 'goal', teamId: 'thorns', player: 'Fixture Player' }));
  });

  it.each([
    ['timbers', 'timbers.schedule.json', 'fixture-timbers-001'],
    ['thorns', 'thorns.schedule.json', 'fixture-thorns-001'],
  ] as const)('replays the reduced %s schedule fixture', (teamId, fixtureName, providerEventId) => {
    const fixture = JSON.parse(readFileSync(new URL(`./fixtures/${fixtureName}`, import.meta.url), 'utf8'));

    expect(parseCompatibilitySchedule(fixture, teamId)).toEqual([{
      teamId,
      providerEventId,
      kickoffMs: expect.any(Number),
    }]);
  });

  it('replays a canonical Timbers fixture through the shared match contract', () => {
    const fixture = JSON.parse(readFileSync(
      new URL('./fixtures/timbers.schedule.json', import.meta.url),
      'utf8',
    ));

    expect(parseCanonicalSchedule(fixture, {
      teamId: 'timbers',
      competitionId: 'mls',
      leaguePath: 'usa.1',
      providerTeamId: '9723',
    }, new Date('2026-08-03T12:00:00Z'))).toEqual([expect.objectContaining({
      id: 'espn-fixture-timbers-001',
      competitionId: 'mls',
      opponent: 'Fixture Opponent',
    })]);
  });
});
