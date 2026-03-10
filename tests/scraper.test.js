const background = require('../background');
const fallbackFixture = require('../data/fallback.json');

describe('Background scraper logic', () => {
  const matchHtml = `
    <html><body>
      <div class="match-row">
        <span class="match-club">Portland Timbers</span>
        <span class="match-club">Seattle Sounders</span>
        <span class="match-date">2025-05-10</span>
        <span class="match-time">7:30 PM</span>
        <span class="match-venue">Providence Park</span>
      </div>
    </body></html>`;

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

  test('extracts match data correctly from valid HTML', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ text: () => Promise.resolve(matchHtml) })
    );

    const matchData = await background.fetchAndParseSchedule();
    expect(matchData.opponent).toBe('Seattle Sounders');
    expect(matchData.date).toBe('2025-05-10');
    expect(matchData.time).toBe('7:30 PM');
    expect(matchData.location).toBe('Providence Park');
    expect(matchData.tv).toBe('Check Local Listings');
    expect(typeof matchData.matchTimestamp).toBe('number');
  });

  test('returns null when no match-row is found', async () => {
    const emptyHtml = '<html><body><div class="no-matches">No upcoming matches</div></body></html>';
    global.fetch = jest.fn(() =>
      Promise.resolve({ text: () => Promise.resolve(emptyHtml) })
    );

    const matchData = await background.fetchAndParseSchedule();
    expect(matchData).toBeNull();
  });

  test('returns null when fetch throws a network error', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network failure')));

    const matchData = await background.fetchAndParseSchedule();
    expect(matchData).toBeNull();
  });

  test('returns TBA for missing fields', async () => {
    const sparseHtml = `
      <html><body>
        <div class="match-row">
          <span class="match-club">Portland Timbers</span>
        </div>
      </body></html>`;
    global.fetch = jest.fn(() =>
      Promise.resolve({ text: () => Promise.resolve(sparseHtml) })
    );

    const matchData = await background.fetchAndParseSchedule();
    expect(matchData.opponent).toBe('TBA');
    expect(matchData.date).toBe('TBA');
    expect(matchData.time).toBe('TBA');
    expect(matchData.location).toBe('TBA');
  });
});

describe('Fallback data flow', () => {
  const cachedData = {
    opponent: 'LAFC',
    date: '2026-03-20',
    time: '8:00 PM PT',
    location: 'Providence Park',
    tv: 'Apple TV',
    matchTimestamp: 1774123200000,
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

  test('returns live data with source "live" when fetch succeeds', async () => {
    const liveHtml = `
      <html><body>
        <div class="match-row">
          <span class="match-club">Portland Timbers</span>
          <span class="match-club">Real Salt Lake</span>
          <span class="match-date">2026-06-01</span>
          <span class="match-time">7:00 PM</span>
          <span class="match-venue">Providence Park</span>
        </div>
      </body></html>`;

    global.fetch = jest.fn(() =>
      Promise.resolve({ text: () => Promise.resolve(liveHtml) })
    );

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
        json: () => Promise.resolve(fallbackFixture),
      });
    });

    global.chrome.storage.local.get = jest.fn((_key, cb) => {
      cb({});
    });

    const result = await background.getMatchDataWithFallback();
    expect(result.source).toBe('fallback');
    expect(result.matchData.opponent).toBe('Seattle Sounders FC');
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
