/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

describe('Popup HTML Content', () => {
  let html;

  beforeAll(() => {
    html = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');
  });

  beforeEach(() => {
    const htmlWithoutScripts = html.replace(/<script.*?<\/script>/gs, '');
    document.documentElement.innerHTML = htmlWithoutScripts;
  });

  it('should display the branded header', () => {
    const team = document.querySelector('.ext-team');
    expect(team).not.toBeNull();
    expect(team.textContent).toBe('Portland Timbers');

    const appName = document.querySelector('.ext-app-name');
    expect(appName).not.toBeNull();
    expect(appName.textContent).toBe('Matchday');
  });

  it('should have "Next Match" card title', () => {
    const title = document.querySelector('.match-card .card-title');
    expect(title).not.toBeNull();
    expect(title.textContent).toBe('Next Match');
  });

  it('should have "Confidence Poll" card title', () => {
    const title = document.querySelector('.vote-card .card-title');
    expect(title).not.toBeNull();
    expect(title.textContent).toBe('Confidence Poll');
  });

  it('should show loading skeleton by default', () => {
    const skeleton = document.getElementById('match-skeleton');
    expect(skeleton).not.toBeNull();
    expect(skeleton.classList.contains('hidden')).toBe(false);
  });

  it('should have match info hidden by default', () => {
    const matchInfo = document.getElementById('match-info');
    expect(matchInfo).not.toBeNull();
    expect(matchInfo.classList.contains('hidden')).toBe(true);
  });

  it('should have three vote buttons', () => {
    const buttons = document.querySelectorAll('.vote-btn');
    expect(buttons.length).toBe(3);
  });

  it('should have footer with external links', () => {
    const footer = document.querySelector('.ext-footer');
    expect(footer).not.toBeNull();
    const links = footer.querySelectorAll('a');
    expect(links.length).toBe(2);
  });
});

describe('Popup.js Functionality', () => {
  let html;
  let mockChrome;
  const FIXED_TIME = 1621000000000;

  const initializePopupScript = () => {
    const existingScript = document.getElementById('popupScript');
    if (existingScript) existingScript.remove();
    const popupScriptContent = fs.readFileSync(path.resolve(__dirname, '../popup.js'), 'utf8');
    const scriptEl = document.createElement('script');
    scriptEl.id = 'popupScript';
    scriptEl.textContent = popupScriptContent;
    document.body.appendChild(scriptEl);
  };

  const flushAsync = async () => {
    return new Promise(resolve => {
      setTimeout(() => {
        setTimeout(resolve, 0);
      }, 0);
    });
  };

  beforeAll(() => {
    html = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');
  });

  beforeEach(() => {
    document.documentElement.innerHTML = html;

    mockChrome = {
      runtime: {
        sendMessage: jest.fn((msg, cb) => {
          if (msg.action === 'getMatchData') {
            setTimeout(() => cb({ matchData: null }), 0);
          }
        }),
        lastError: null,
      },
      storage: {
        local: {
          get: jest.fn((keys, cb) => setTimeout(() => cb({ votes: { high: 0, medium: 0, low: 0 } }), 0)),
          set: jest.fn((items, cb) => setTimeout(() => cb(), 0)),
        },
      },
    };

    global.chrome = mockChrome;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    if (global.chrome === mockChrome) delete global.chrome;
  });

  describe('Match Data Handling', () => {
    const mockMatchData = {
      opponent: 'Seattle Sounders',
      date: '2025-08-01',
      time: '7:00 PM PST',
      location: 'Lumen Field',
      tv: 'FS1',
      matchTimestamp: FIXED_TIME + (3 * 24 * 60 * 60 * 1000),
    };

    it('should display match data and hide skeleton when fetched', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: mockMatchData }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('match-skeleton').classList.contains('hidden')).toBe(true);
      expect(document.getElementById('match-info').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('match-opponent').textContent).toBe('Seattle Sounders');
      expect(document.getElementById('match-details').innerHTML).toContain('FS1');
    });

    it('should show error state when no matchData in response', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: null }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('match-error').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('match-error-text').textContent).toBe('Could not retrieve match data at this time.');
    });

    it('should show error state on runtime.lastError', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          mockChrome.runtime.lastError = { message: 'Fetch error' };
          setTimeout(() => cb(null), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('match-error').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('match-error-text').textContent).toBe('Could not retrieve match data.');
    });

    it('should display N/A for missing detail fields', async () => {
      const partialData = { opponent: 'Vancouver Whitecaps' };
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: partialData }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('match-opponent').textContent).toBe('Vancouver Whitecaps');
      const values = document.querySelectorAll('.detail-value');
      const texts = Array.from(values).map(v => v.textContent);
      expect(texts).toContain('N/A');
    });
  });

  describe('Countdown Functionality', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(FIXED_TIME));
    });

    it('should display segmented countdown for future match', async () => {
      const futureTimestamp = FIXED_TIME + (24 * 60 * 60 * 1000);
      const data = { opponent: 'TestCountdown', matchTimestamp: futureTimestamp };

      const originalNow = Date.now;
      Date.now = jest.fn(() => FIXED_TIME);

      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: data }), 0);
        }
      });

      const originalSetInterval = global.setInterval;
      global.setInterval = jest.fn(() => 123);

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      jest.advanceTimersByTime(100);

      expect(document.getElementById('countdown-wrap').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('cd-days').textContent).toBe('01');
      expect(document.getElementById('cd-hours').textContent).toBe('00');

      global.setInterval = originalSetInterval;
      Date.now = originalNow;
    });

    it('should show LIVE badge when match time has passed', async () => {
      const pastTimestamp = FIXED_TIME - 1000;
      const data = { opponent: 'TestLive', matchTimestamp: pastTimestamp };

      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: data }), 0);
        }
      });

      const originalSetInterval = global.setInterval;
      global.setInterval = jest.fn(() => 123);

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      jest.advanceTimersByTime(100);

      expect(document.getElementById('live-badge').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('countdown-wrap').classList.contains('hidden')).toBe(true);
      global.setInterval = originalSetInterval;
    });
  });

  describe('Fan Engagement - Voting', () => {
    beforeEach(() => {
      document.documentElement.innerHTML = html;
      global.chrome = mockChrome;
    });

    it('should persist vote and show results when a vote button is clicked', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: null }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      const highButton = document.querySelector('button[data-vote="high"]');
      highButton.click();
      await flushAsync();

      expect(mockChrome.storage.local.get).toHaveBeenCalledWith(['votes'], expect.any(Function));
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        { votes: { high: 1, medium: 0, low: 0 }, hasVoted: true },
        expect.any(Function)
      );
    });

    it('should display vote results with thanks message after casting a vote', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: null }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      const mediumButton = document.querySelector('button[data-vote="medium"]');
      mediumButton.click();
      await flushAsync();

      const thanks = document.getElementById('vote-thanks');
      expect(thanks.textContent).toContain('Thanks for voting!');

      expect(document.getElementById('vote-buttons').classList.contains('hidden')).toBe(true);
      expect(document.getElementById('vote-results').classList.contains('hidden')).toBe(false);
    });
  });
});
