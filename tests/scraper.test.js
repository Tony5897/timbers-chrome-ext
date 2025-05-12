// tests/scraper.test.js
const cheerio = require('cheerio');

describe('Background scraper logic', () => {
  let html, $;
  beforeAll(() => {
    html = `
      <div class="match-row">
        <span class="match-club">Portland Timbers</span>
        <span class="match-club">Seattle Sounders</span>
        <span class="match-date">2025-05-10</span>
        <span class="match-time">7:30 PM</span>
        <span class="match-venue">Providence Park</span>
      </div>`;
    $ = cheerio.load(html);
  });

  test('extract opponent, date, time, and venue correctly', () => {
    const next = $('.match-row').first();
    expect(next.find('.match-club').eq(1).text().trim()).toBe('Seattle Sounders');
    expect(next.find('.match-date').text().trim()).toBe('2025-05-10');
    expect(next.find('.match-time').text().trim()).toBe('7:30 PM');
    expect(next.find('.match-venue').text().trim()).toBe('Providence Park');
  });
});
