const background = require('../background');

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
      runtime: { onMessage: { addListener: jest.fn() } },
      alarms: { create: jest.fn(), onAlarm: { addListener: jest.fn() } },
      storage: { local: { set: jest.fn() } },
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
