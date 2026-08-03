import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchCanonicalMatches,
  fetchCompatibilityPollWindows,
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
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({
      events: [canonicalEvent],
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
      matchTimestamp: 1786156200000,
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
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({
      events: [canonicalEvent],
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
