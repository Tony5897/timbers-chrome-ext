const background = require('../background');
const fallbackFixture = require('../data/fallback.json');

// ESPN API response factory.
// Uses a date far enough in the future to always pass the "upcoming match"
// filter without needing to mock Date.now().
// Apr 5 2030 02:30 UTC = Apr 4 2030 7:30 PM PDT
const ESPN_FUTURE_DATE = '2030-04-05T02:30:00Z';

function makeEspnResponse(overrides = {}) {
  return {
    events: [
      {
        date: overrides.date !== undefined ? overrides.date : ESPN_FUTURE_DATE,
        competitions: [
          {
            status: {
              type: { completed: overrides.completed !== undefined ? overrides.completed : false },
            },
            venue: { fullName: overrides.venue !== undefined ? overrides.venue : 'BC Place' },
            competitors: [
              { team: { id: '9723', displayName: 'Portland Timbers' }, homeAway: 'away' },
              {
                team: {
                  id: '1234',
                  displayName: overrides.opponent !== undefined ? overrides.opponent : 'Vancouver Whitecaps FC',
                },
                homeAway: 'home',
              },
            ],
            broadcasts:
              overrides.broadcasts !== undefined ? overrides.broadcasts : [{ names: ['Apple TV'] }],
          },
        ],
      },
    ],
  };
}

function mockFetch(json, ok = true) {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok,
      json: () => Promise.resolve(json),
    })
  );
}

describe('Background scraper logic', () => {
  beforeEach(() => {
    global.chrome = {
      runtime: {
        onMessage: { addListener: jest.fn() },
        getURL: jest.fn((p) => 'chrome-extension://fake-id/' + p),
      },
      alarms: { create: jest.fn(), onAlarm: { addListener: jest.fn() } },
      storage: { local: { set: jest.fn(), get: jest.fn() } },
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  test('extracts match data correctly from valid ESPN API response', async () => {
    mockFetch(makeEspnResponse());

    const matchData = await background.fetchAndParseSchedule();
    expect(matchData.opponent).toBe('Vancouver Whitecaps FC');
    expect(matchData.date).toBe('04-04-2030');
    expect(matchData.time).toBe('7:30 PM PT');
    expect(matchData.location).toBe('BC Place');
    expect(matchData.tv).toBe('Apple TV');
    expect(typeof matchData.matchTimestamp).toBe('number');
    expect(matchData.matchTimestamp).toBeGreaterThan(0);
  });

  test('returns null when response.ok is false', async () => {
    mockFetch({}, false);

    const matchData = await background.fetchAndParseSchedule();
    expect(matchData).toBeNull();
  });

  test('returns { noMatch: true } when API responds but all events are completed', async () => {
    // API is healthy but every event is in the past — no upcoming fixture yet
    mockFetch(makeEspnResponse({ completed: true }));

    const matchData = await background.fetchAndParseSchedule();
    expect(matchData).toEqual({ noMatch: true });
  });

  test('returns { noMatch: true } when events array is empty', async () => {
    // API responded successfully but schedule has no events (between seasons or not yet published)
    mockFetch({ events: [] });

    const matchData = await background.fetchAndParseSchedule();
    expect(matchData).toEqual({ noMatch: true });
  });

  test('returns null when ESPN payload is malformed (missing events key)', async () => {
    // If ESPN changes their API shape we must treat it as an API failure,
    // not as a legitimate "no upcoming fixture" — guards against false no_match.
    mockFetch({ someOtherKey: 'unexpected' });

    const matchData = await background.fetchAndParseSchedule();
    expect(matchData).toBeNull();
  });

  test('returns null when fetch throws a network error', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network failure')));

    const matchData = await background.fetchAndParseSchedule();
    expect(matchData).toBeNull();
  });

  test('uses TBA for missing opponent', async () => {
    const response = makeEspnResponse();
    // Remove the non-Timbers competitor to simulate missing opponent
    response.events[0].competitions[0].competitors = [
      { team: { id: '9723', displayName: 'Portland Timbers' }, homeAway: 'home' },
    ];
    mockFetch(response);

    const matchData = await background.fetchAndParseSchedule();
    expect(matchData.opponent).toBe('TBA');
  });

  test('uses TBA for missing venue', async () => {
    const response = makeEspnResponse();
    delete response.events[0].competitions[0].venue;
    mockFetch(response);

    const matchData = await background.fetchAndParseSchedule();
    expect(matchData.location).toBe('TBA');
  });

  test('falls back to Check Local Listings when broadcasts array is empty', async () => {
    mockFetch(makeEspnResponse({ broadcasts: [] }));

    const matchData = await background.fetchAndParseSchedule();
    expect(matchData.tv).toBe('Check Local Listings');
  });

  test('joins multiple broadcast names with comma', async () => {
    mockFetch(makeEspnResponse({ broadcasts: [{ names: ['Apple TV', 'FOX'] }] }));

    const matchData = await background.fetchAndParseSchedule();
    expect(matchData.tv).toBe('Apple TV, FOX');
  });
});

describe('Fallback data flow', () => {
  const cachedData = {
    opponent: 'LAFC',
    date: '06-20-2026',
    time: '8:00 PM PT',
    location: 'Providence Park',
    tv: 'Apple TV',
    matchTimestamp: 1782043200000,
  };

  beforeEach(() => {
    global.chrome = {
      runtime: {
        onMessage: { addListener: jest.fn() },
        getURL: jest.fn((p) => 'chrome-extension://fake-id/' + p),
      },
      alarms: { create: jest.fn(), onAlarm: { addListener: jest.fn() } },
      storage: {
        local: {
          set: jest.fn(),
          get: jest.fn(),
        },
      },
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  test('returns live data with source "live" when ESPN API succeeds', async () => {
    mockFetch(makeEspnResponse({ opponent: 'Real Salt Lake', venue: 'Providence Park' }));

    const result = await background.getMatchDataWithFallback();
    expect(result.source).toBe('live');
    expect(result.matchData.opponent).toBe('Real Salt Lake');
    expect(global.chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ latestMatchData: expect.any(Object) })
    );
  });

  test('falls back to cache with source "cache" when live fails', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network down')));

    global.chrome.storage.local.get = jest.fn((_key, cb) => {
      cb({ latestMatchData: cachedData });
    });

    const result = await background.getMatchDataWithFallback();
    expect(result.source).toBe('cache');
    expect(result.matchData.opponent).toBe('LAFC');
  });

  test('falls back to bundled JSON with source "fallback" when live and cache fail', async () => {
    // Use a far-future fixture so this test never fails when the real match date passes.
    // The actual fallback.json content is tested by the integration smoke test below.
    const stableFallbackFixture = {
      opponent: 'FC Future',
      date: '01-01-2099',
      time: '7:00 PM PT',
      location: 'Future Stadium',
      tv: 'Apple TV',
      matchTimestamp: new Date('2099-01-01T03:00:00Z').getTime(),
    };

    let callCount = 0;
    global.fetch = jest.fn((_url) => {
      if (callCount === 0) {
        callCount++;
        return Promise.reject(new Error('Network down'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(stableFallbackFixture),
      });
    });

    global.chrome.storage.local.get = jest.fn((_key, cb) => {
      cb({});
    });

    const result = await background.getMatchDataWithFallback();
    expect(result.source).toBe('fallback');
    expect(result.matchData.opponent).toBe('FC Future');
  });

  test('bundled fallback.json is a valid season schedule array with future fixtures', () => {
    // Smoke test: the full-season array is well-formed and not expired.
    expect(Array.isArray(fallbackFixture)).toBe(true);
    expect(fallbackFixture.length).toBeGreaterThan(0);
    // Every entry has required fields.
    fallbackFixture.forEach((m) => {
      expect(typeof m.opponent).toBe('string');
      expect(typeof m.matchTimestamp).toBe('number');
    });
    // Array is sorted chronologically.
    for (let i = 1; i < fallbackFixture.length; i++) {
      expect(fallbackFixture[i].matchTimestamp).toBeGreaterThan(fallbackFixture[i - 1].matchTimestamp);
    }
    // At least the final entry (end of season) is still in the future.
    const lastEntry = fallbackFixture[fallbackFixture.length - 1];
    expect(lastEntry.matchTimestamp).toBeGreaterThan(Date.now());
  });

  test('returns null matchData and null source when all tiers fail due to network error', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Everything broken')));

    global.chrome.storage.local.get = jest.fn((_key, cb) => {
      cb({});
    });

    const result = await background.getMatchDataWithFallback();
    expect(result.matchData).toBeNull();
    expect(result.source).toBeNull();
  });

  test('returns source "no_match" when ESPN is healthy but has no fixture and cache/fallback are empty', async () => {
    let callCount = 0;
    global.fetch = jest.fn((_url) => {
      if (callCount === 0) {
        callCount++;
        // ESPN responds successfully but no upcoming match
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeEspnResponse({ completed: true })),
        });
      }
      // Bundled fallback fetch fails
      return Promise.reject(new Error('Fallback unavailable'));
    });

    global.chrome.storage.local.get = jest.fn((_key, cb) => {
      cb({});
    });

    const result = await background.getMatchDataWithFallback();
    expect(result.matchData).toBeNull();
    expect(result.source).toBe('no_match');
  });

  test('skips stale cached entry and falls through to no_match after match ends', async () => {
    // Simulates what happens the moment the match timestamp passes:
    // ESPN has no upcoming matches, and the cache holds the just-finished game.
    global.fetch = jest.fn((_url) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) })
    );
    global.chrome.storage.local.get = jest.fn((_key, cb) => {
      // Past matchTimestamp — the match has already been played
      cb({ latestMatchData: { opponent: 'San Diego FC', matchTimestamp: 1 } });
    });

    const result = await background.getMatchDataWithFallback();
    // Stale cache must NOT be served; ESPN was healthy (noMatch), so source = no_match
    expect(result.source).toBe('no_match');
    expect(result.matchData).toBeNull();
  });

  test('getBundledFallback selects first future entry from season schedule array', async () => {
    const now = Date.now();
    const scheduleArray = [
      { opponent: 'Past Team',   matchTimestamp: 1 },                   // epoch — stale
      { opponent: 'Next Match',  matchTimestamp: now + 86400000 },      // tomorrow ← pick this
      { opponent: 'Later Match', matchTimestamp: now + 172800000 },     // day after
    ];
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(scheduleArray) })
    );

    const result = await background.getBundledFallback();
    expect(result.opponent).toBe('Next Match');
  });
});
