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

  test('returns null when no upcoming events exist', async () => {
    // All events marked as completed
    mockFetch(makeEspnResponse({ completed: true }));

    const matchData = await background.fetchAndParseSchedule();
    expect(matchData).toBeNull();
  });

  test('returns null when events array is empty', async () => {
    mockFetch({ events: [] });

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
    let callCount = 0;
    global.fetch = jest.fn((_url) => {
      if (callCount === 0) {
        callCount++;
        return Promise.reject(new Error('Network down'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(fallbackFixture),
      });
    });

    global.chrome.storage.local.get = jest.fn((_key, cb) => {
      cb({});
    });

    const result = await background.getMatchDataWithFallback();
    expect(result.source).toBe('fallback');
    expect(result.matchData.opponent).toBe('Vancouver Whitecaps FC');
  });

  test('returns null matchData when all tiers fail', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Everything broken')));

    global.chrome.storage.local.get = jest.fn((_key, cb) => {
      cb({});
    });

    const result = await background.getMatchDataWithFallback();
    expect(result.matchData).toBeNull();
    expect(result.source).toBeNull();
  });
});
