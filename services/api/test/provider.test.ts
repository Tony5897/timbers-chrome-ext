import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fetchCompatibilityPollWindows, parseCompatibilitySchedule } from '../src/provider.js';

describe('ESPN compatibility adapter', () => {
  it('normalizes provider events into versioned poll windows', async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({
      events: [
        { id: '401999001', date: '2026-08-08T02:30:00Z', ignored: true },
      ],
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
});
