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

    const countdownDiv = document.getElementById('countdown');
    if (countdownDiv) {
      countdownDiv.textContent = 'Loading countdown...';
    }

    const matchInfoDiv = document.getElementById('match-info');
    if (matchInfoDiv) {
      matchInfoDiv.textContent = 'Loading match data...';
    }
  });

  it('should display the main header', () => {
    const headerElement = document.querySelector('header h1');
    expect(headerElement).not.toBeNull();
    expect(headerElement.textContent).toBe('Timbers Matchday');
  });

  it('should have "Next Match" section', () => {
    const nextMatchSection = document.querySelector('.match-info h2');
    expect(nextMatchSection).not.toBeNull();
    expect(nextMatchSection.textContent).toBe('Next Match');
  });

  it('should have "Fan Engagement" section', () => {
    const fanEngagementSection = document.querySelector('.fan-engagement h2');
    expect(fanEngagementSection).not.toBeNull();
    expect(fanEngagementSection.textContent).toBe('Fan Engagement');
  });

  it('should initially display "Loading match data..."', () => {
    const matchInfoDiv = document.getElementById('match-info');
    expect(matchInfoDiv).not.toBeNull();
    expect(matchInfoDiv.textContent.trim()).toBe('Loading match data...');
  });

  it('should initially display "Loading countdown..."', () => {
    const countdownDiv = document.getElementById('countdown');
    expect(countdownDiv).not.toBeNull();
    expect(countdownDiv.textContent.trim()).toBe('Loading countdown...');
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

    it('should display match data when fetched', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: mockMatchData }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      const matchInfoDiv = document.getElementById('match-info');
      expect(matchInfoDiv.innerHTML).toContain(mockMatchData.opponent);
      expect(matchInfoDiv.innerHTML).toContain(mockMatchData.tv);
    });

    it('should handle no matchData in response', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: null }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('match-info').textContent).toBe('Could not retrieve match data at this time.');
    });

    it('should handle runtime.lastError on fetch', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          mockChrome.runtime.lastError = { message: 'Fetch error' };
          setTimeout(() => cb(null), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('match-info').textContent).toBe('Error: Could not retrieve match data.');
    });

    it('should display "N/A" for missing fields and handle missing timestamp', async () => {
      const partialData = { opponent: 'Vancouver Whitecaps' };
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: partialData }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('match-info').innerHTML).toContain('<strong>Date:</strong> N/A');
      expect(document.getElementById('countdown').textContent).toBe('Match time unavailable.');
    });
  });

  describe('Countdown Functionality', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(FIXED_TIME));
    });

    it('should display and update countdown', async () => {
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

      const countdownDiv = document.getElementById('countdown');
      expect(countdownDiv.textContent).toMatch(/1d 0h 0m \d{1,2}s remaining/);

      global.setInterval = originalSetInterval;
      expect(countdownDiv.textContent).not.toBe('Match is live!');
      Date.now = originalNow;
    });

    it('should display "Match is live!" when time is up', async () => {
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

      expect(document.getElementById('countdown').textContent).toBe('Match is live!');
      global.setInterval = originalSetInterval;
    });

    it('should display "Match time unavailable." if matchTimestamp is not a number', async () => {
      const invalidData = { opponent: 'Test FC', matchTimestamp: 'not-a-valid-timestamp' };

      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: invalidData }), 0);
        }
      });

      const originalSetInterval = global.setInterval;
      global.setInterval = jest.fn(() => 123);

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      jest.advanceTimersByTime(100);

      expect(document.getElementById('countdown').textContent).toBe('Match time unavailable.');
      global.setInterval = originalSetInterval;
    });
  });

  describe('Fan Engagement - Voting', () => {
    beforeEach(() => {
      document.documentElement.innerHTML = html;
      global.chrome = mockChrome;
    });

    it('should call storage.local.set when a vote button is clicked', async () => {
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
        { votes: { high: 1, medium: 0, low: 0 } },
        expect.any(Function)
      );
    });

    it('should display vote tallies after casting a vote', async () => {
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

      const voteResult = document.getElementById('vote-result');
      expect(voteResult.textContent).toContain('Thanks for voting!');
      expect(voteResult.textContent).toContain('Medium 1');
    });
  });
});
