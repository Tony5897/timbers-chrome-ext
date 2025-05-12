const cheerio = require('cheerio');
const background = require('../background');

describe('Background scraper logic', () => {
  let html;
  beforeAll(() => {
    html = `
      <div class="match-row">
        <span class="match-club">Portland Timbers</span>
        <span class="match-club">Seattle Sounders</span>
        <span class="match-date">2025-05-10</span>
        <span class="match-time">7:30 PM</span>
        <span class="match-venue">Providence Park</span>
      </div>`;
    
    global.fetch = jest.fn(() =>
      Promise.resolve({
        text: () => Promise.resolve(html)
      })
    );

    // Mock chrome API
    global.chrome = {
      runtime: {
        onMessage: { addListener: jest.fn() },
      },
      alarms: {
        create: jest.fn(),
        onAlarm: { addListener: jest.fn() }
      },
      storage: {
        local: { set: jest.fn() }
      }
    };
  });

  test('fetchAndParseSchedule extracts match data correctly', async () => {
    const matchData = await background.fetchAndParseSchedule();
    expect(matchData.opponent).toBe('Seattle Sounders');
    expect(matchData.date).toBe('2025-05-10');
    expect(matchData.time).toBe('7:30 PM');
    expect(matchData.location).toBe('Providence Park');
  });
});
