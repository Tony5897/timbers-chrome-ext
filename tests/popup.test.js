/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

describe('Popup HTML Content', () => {
  let html;

  beforeAll(() => {
    html = fs.readFileSync(path.resolve(__dirname, '../extension/popup.html'), 'utf8');
  });

  beforeEach(() => {
    const htmlWithoutScripts = html.replace(/<script.*?<\/script>/gs, '');
    document.documentElement.innerHTML = htmlWithoutScripts;
  });

  it('should display the branded header', () => {
    const appName = document.querySelector('.app-name');
    expect(appName).not.toBeNull();
    expect(appName.textContent).toBe('PDX Matchday');
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

  let activeDomContentLoadedListener;

  const initializePopupScript = () => {
    const existingScript = document.getElementById('popupScript');
    if (existingScript) existingScript.remove();
    // document persists across tests in this file, so a DOMContentLoaded listener from a
    // prior test's script injection would otherwise still fire (and re-run stale closures)
    // alongside the one this call is about to register. Swap it out instead of stacking.
    if (activeDomContentLoadedListener) {
      document.removeEventListener('DOMContentLoaded', activeDomContentLoadedListener);
      activeDomContentLoadedListener = undefined;
    }
    const originalAddEventListener = document.addEventListener.bind(document);
    document.addEventListener = (type, listener, options) => {
      if (type === 'DOMContentLoaded') activeDomContentLoadedListener = listener;
      originalAddEventListener(type, listener, options);
    };
    const popupScriptContent = fs.readFileSync(path.resolve(__dirname, '../extension/popup.js'), 'utf8');
    const scriptEl = document.createElement('script');
    scriptEl.id = 'popupScript';
    scriptEl.textContent = popupScriptContent;
    document.body.appendChild(scriptEl);
    document.addEventListener = originalAddEventListener;
  };

  const flushAsync = async () => {
    return new Promise(resolve => {
      setTimeout(() => {
        setTimeout(resolve, 0);
      }, 0);
    });
  };

  beforeAll(() => {
    html = fs.readFileSync(path.resolve(__dirname, '../extension/popup.html'), 'utf8');
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
    delete globalThis.CommunityVotes;
    delete window.confirm;
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
          setTimeout(() => cb({ matchData: mockMatchData, source: 'live' }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('match-skeleton').classList.contains('hidden')).toBe(true);
      expect(document.getElementById('match-info').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('match-opponent').textContent).toBe('Seattle Sounders');
      expect(document.getElementById('match-details').innerHTML).toContain('FS1');
      expect(document.querySelector('a.detail-value-link')).toBeNull();
      expect(document.getElementById('data-notice').classList.contains('hidden')).toBe(true);
    });

    it('should link TV/Stream to Apple MLS when broadcast includes Apple TV', async () => {
      const appleMatchData = { ...mockMatchData, tv: 'Apple TV' };
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: appleMatchData, source: 'live' }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      const link = document.querySelector('a.detail-value-link');
      expect(link).not.toBeNull();
      expect(link.textContent).toBe('Apple TV');
      expect(link.getAttribute('href')).toBe('https://tv.apple.com/us/channel/mls/tvs.sbd.7000');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('should link TV/Stream when Apple TV is combined with other networks', async () => {
      const appleMatchData = { ...mockMatchData, tv: 'Apple TV, FOX' };
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: appleMatchData, source: 'live' }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      const link = document.querySelector('a.detail-value-link');
      expect(link).not.toBeNull();
      expect(link.textContent).toBe('Apple TV, FOX');
      expect(link.getAttribute('href')).toBe('https://tv.apple.com/us/channel/mls/tvs.sbd.7000');
    });

    it('should show data-notice when source is cache', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: mockMatchData, source: 'cache' }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('match-info').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('data-notice').classList.contains('hidden')).toBe(false);
    });

    it('should show data-notice when source is fallback', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: mockMatchData, source: 'fallback' }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('match-info').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('data-notice').classList.contains('hidden')).toBe(false);
    });

    it('should show error state when no matchData in response', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: null, source: null }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('match-error').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('match-error-text').textContent).toBe('Could not retrieve match data at this time.');
    });

    it('should show error state on runtime.lastError', async () => {
      jest.useRealTimers();
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
    }, 30000);

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
      expect(document.querySelector('a.detail-value-link')).toBeNull();
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

    it('should show LIVE badge when match time has passed and source is live', async () => {
      const pastTimestamp = FIXED_TIME - 1000;
      const data = { opponent: 'TestLive', matchTimestamp: pastTimestamp };

      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: data, source: 'live' }), 0);
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

    it('should NOT show LIVE badge when source is cache even if match time passed', async () => {
      const pastTimestamp = FIXED_TIME - 1000;
      const data = { opponent: 'TestStale', matchTimestamp: pastTimestamp };

      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: data, source: 'cache' }), 0);
        }
      });

      const originalSetInterval = global.setInterval;
      global.setInterval = jest.fn(() => 123);

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      jest.advanceTimersByTime(100);

      expect(document.getElementById('live-badge').classList.contains('hidden')).toBe(true);
      expect(document.getElementById('countdown-wrap').classList.contains('hidden')).toBe(true);
      global.setInterval = originalSetInterval;
    });

    it('should NOT show LIVE badge when source is fallback even if match time passed', async () => {
      const pastTimestamp = FIXED_TIME - 1000;
      const data = { opponent: 'TestFallback', matchTimestamp: pastTimestamp };

      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: data, source: 'fallback' }), 0);
        }
      });

      const originalSetInterval = global.setInterval;
      global.setInterval = jest.fn(() => 123);

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      jest.advanceTimersByTime(100);

      expect(document.getElementById('live-badge').classList.contains('hidden')).toBe(true);
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
      const ts = FIXED_TIME + (3 * 24 * 60 * 60 * 1000);
      const votesKey = `votes_${ts}`;
      const hasVotedKey = `hasVoted_${ts}`;
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: { opponent: 'LAFC', matchTimestamp: ts }, source: 'live' }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      const highButton = document.querySelector('button[data-vote="high"]');
      highButton.click();
      await flushAsync();

      expect(mockChrome.storage.local.get).toHaveBeenCalledWith([votesKey], expect.any(Function));
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        { [votesKey]: { high: 1, medium: 0, low: 0 }, [hasVotedKey]: true },
        expect.any(Function)
      );
    });

    it('should display vote results with thanks message after casting a vote', async () => {
      const ts = FIXED_TIME + (3 * 24 * 60 * 60 * 1000);
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') {
          setTimeout(() => cb({ matchData: { opponent: 'LAFC', matchTimestamp: ts }, source: 'live' }), 0);
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

  describe('Live Score Card', () => {
    it('should display the live score and the most recent goal description', async () => {
      const data = {
        teamId: 'timbers',
        opponent: 'Seattle Sounders',
        matchTimestamp: FIXED_TIME - 30 * 60 * 1000,
        live: {
          homeScore: 2,
          awayScore: 1,
          events: [
            { type: 'period', description: 'Second half begins' },
            { type: 'goal', description: 'Goal! Timbers 2-1 Seattle Sounders' },
          ],
        },
      };
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: data, source: 'live' }), 0);
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('live-score-card').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('live-score').textContent).toBe('2–1');
      expect(document.getElementById('live-event').textContent).toBe('Goal! Timbers 2-1 Seattle Sounders');
    });

    it('should show a refreshing message when live data has no goal event yet', async () => {
      const data = {
        opponent: 'Seattle Sounders',
        matchTimestamp: FIXED_TIME - 5 * 60 * 1000,
        live: { homeScore: 0, awayScore: 0, events: [{ type: 'period', description: 'Kickoff' }] },
      };
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: data, source: 'live' }), 0);
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('live-score-card').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('live-event').textContent).toBe('Live match updates are being refreshed.');
    });

    it('should keep the live score card hidden when the match has no live data', async () => {
      const data = { opponent: 'Seattle Sounders', matchTimestamp: FIXED_TIME + 3 * 24 * 60 * 60 * 1000 };
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: data, source: 'live' }), 0);
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('live-score-card').classList.contains('hidden')).toBe(true);
    });
  });

  describe('Freshness and No-Match Messaging', () => {
    it('should label a live response as live schedule data', async () => {
      const data = { opponent: 'LAFC', matchTimestamp: FIXED_TIME + 24 * 60 * 60 * 1000 };
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: data, source: 'live' }), 0);
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('freshness-label').textContent).toBe('Live schedule data');
      expect(document.getElementById('freshness-tag').textContent).toBe('Live');
    });

    it('should label a cached response as delayed', async () => {
      const data = { opponent: 'LAFC', matchTimestamp: FIXED_TIME + 24 * 60 * 60 * 1000 };
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: data, source: 'cache' }), 0);
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('freshness-label').textContent).toBe('Cached schedule data');
      expect(document.getElementById('freshness-tag').textContent).toBe('Delayed');
    });

    it('should show a dedicated message when the provider confirms there is no upcoming match', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: null, source: 'no_match' }), 0);
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('match-error').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('match-error-text').textContent).toBe('No upcoming match scheduled. Check the full schedule below.');
    });
  });

  describe('Standings', () => {
    it('should show a loading message immediately after switching to the Standings tab', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: null, source: null }), 0);
        if (msg.action === 'getStandings') setTimeout(() => cb({ standings: [], source: 'live', freshness: 'fresh' }), 0);
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      document.getElementById('tab-standings').click();

      expect(document.getElementById('standings-note').textContent).toBe('Loading current standings…');
      await flushAsync();
    });

    it('should render standings rows and highlight the selected team', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: null, source: null }), 0);
        if (msg.action === 'getStandings') {
          setTimeout(() => cb({
            standings: [
              { rank: 1, club: 'Seattle Sounders FC', points: 44, highlight: false },
              { rank: 2, club: 'Portland Timbers', points: 41, highlight: true },
            ],
            source: 'live',
            freshness: 'fresh',
          }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      document.getElementById('tab-standings').click();
      await flushAsync();

      const rows = document.querySelectorAll('#standings-body tr');
      expect(rows).toHaveLength(2);
      expect(rows[1].classList.contains('is-highlighted')).toBe(true);
      expect(rows[1].textContent).toContain('Portland Timbers');
      expect(document.getElementById('standings-note').textContent).toBe('Current provider standings.');
    });

    it('should escape HTML in club names instead of rendering injected markup', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: null, source: null }), 0);
        if (msg.action === 'getStandings') {
          setTimeout(() => cb({
            standings: [{ rank: 1, club: '<img src=x onerror=alert(1)>', points: 10, highlight: false }],
            source: 'live',
            freshness: 'fresh',
          }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      document.getElementById('tab-standings').click();
      await flushAsync();

      expect(document.querySelector('#standings-body img')).toBeNull();
      expect(document.getElementById('standings-body').textContent).toContain('<img src=x onerror=alert(1)>');
    });

    it('should note delayed data when standings freshness is stale', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: null, source: null }), 0);
        if (msg.action === 'getStandings') {
          setTimeout(() => cb({
            standings: [{ rank: 1, club: 'Timbers', points: 10, highlight: true }],
            source: 'cache',
            freshness: 'stale',
          }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      document.getElementById('tab-standings').click();
      await flushAsync();

      expect(document.getElementById('standings-note').textContent).toBe('Standings data may be delayed.');
    });

    it('should show an unavailable message when standings cannot be retrieved', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: null, source: null }), 0);
        if (msg.action === 'getStandings') setTimeout(() => cb({ standings: null }), 0);
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      document.getElementById('tab-standings').click();
      await flushAsync();

      expect(document.getElementById('standings-note').textContent).toBe('Standings are temporarily unavailable.');
      expect(document.getElementById('standings-body').textContent).toContain('Check the official standings.');
    });

    it('should render a group header between conferences and keep group rows out of the tab order', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: null, source: null }), 0);
        if (msg.action === 'getStandings') {
          setTimeout(() => cb({
            standings: [
              { group: 'Eastern Conference', rank: 1, club: 'Nashville SC', points: 57, highlight: false },
              { group: 'Eastern Conference', rank: 5, club: 'Chicago Fire FC', points: 39, highlight: false },
              { group: 'Western Conference', rank: 1, club: 'Vancouver Whitecaps FC', points: 49, highlight: false },
              { group: 'Western Conference', rank: 9, club: 'Portland Timbers', points: 32, highlight: true },
            ],
            source: 'live',
            freshness: 'fresh',
          }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      document.getElementById('tab-standings').click();
      await flushAsync();

      const rows = document.querySelectorAll('#standings-body tr');
      expect(rows).toHaveLength(6);
      const groupHeaders = document.querySelectorAll('#standings-body tr.standings-group-row');
      expect(groupHeaders).toHaveLength(2);
      expect(groupHeaders[0].textContent).toBe('Eastern Conference');
      expect(groupHeaders[1].textContent).toBe('Western Conference');
      expect(rows[0]).toBe(groupHeaders[0]);
      expect(rows[3]).toBe(groupHeaders[1]);
      expect(rows[5].classList.contains('is-highlighted')).toBe(true);
      expect(rows[5].textContent).toContain('Portland Timbers');
    });

    it('should render a flat table with no group headers when the league has no conference split', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: null, source: null }), 0);
        if (msg.action === 'getStandings') {
          setTimeout(() => cb({
            standings: [
              { group: null, rank: 1, club: 'Gotham FC', points: 51, highlight: false },
              { group: null, rank: 5, club: 'Portland Thorns FC', points: 42, highlight: true },
            ],
            source: 'live',
            freshness: 'fresh',
          }), 0);
        }
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      document.getElementById('tab-standings').click();
      await flushAsync();

      expect(document.querySelectorAll('#standings-body tr.standings-group-row')).toHaveLength(0);
      expect(document.querySelectorAll('#standings-body tr')).toHaveLength(2);
    });
  });

  describe('Team Switching', () => {
    it('should switch club branding, links, and the selected match when Thorns is chosen', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action !== 'getMatchData') return;
        const data = msg.teamId === 'thorns'
          ? { teamId: 'thorns', opponent: 'Kansas City Current', matchTimestamp: FIXED_TIME + 24 * 60 * 60 * 1000 }
          : { teamId: 'timbers', opponent: 'Seattle Sounders', matchTimestamp: FIXED_TIME + 24 * 60 * 60 * 1000 };
        setTimeout(() => cb({ matchData: data, source: 'live' }), 0);
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      document.querySelector('input[value="thorns"]').click();
      await flushAsync();

      expect(document.body.dataset.team).toBe('thorns');
      expect(document.getElementById('match-team-name').textContent).toBe('Thorns');
      expect(document.getElementById('club-link').getAttribute('href')).toBe('https://www.thorns.com');
      expect(document.getElementById('footer-schedule-link').getAttribute('href')).toBe('https://www.thorns.com/schedule');
      expect(document.getElementById('match-opponent').textContent).toBe('Kansas City Current');
      expect(document.getElementById('team-option-thorns').classList.contains('is-selected')).toBe(true);
      expect(document.getElementById('team-option-timbers').classList.contains('is-selected')).toBe(false);
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({ selectedTeam: 'thorns' }, expect.any(Function));
    });

    it('should ignore a stale response for a team that is no longer selected', async () => {
      let resolveTimbersRequest;
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action !== 'getMatchData') return;
        if (msg.teamId === 'timbers') {
          resolveTimbersRequest = () => cb({
            matchData: { teamId: 'timbers', opponent: 'Late Timbers Response', matchTimestamp: FIXED_TIME + 24 * 60 * 60 * 1000 },
            source: 'live',
          });
          return;
        }
        setTimeout(() => cb({
          matchData: { teamId: 'thorns', opponent: 'Thorns Opponent', matchTimestamp: FIXED_TIME + 24 * 60 * 60 * 1000 },
          source: 'live',
        }), 0);
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      // Switch to Thorns before the in-flight Timbers request resolves.
      document.querySelector('input[value="thorns"]').click();
      await flushAsync();

      expect(document.getElementById('match-opponent').textContent).toBe('Thorns Opponent');

      resolveTimbersRequest();
      await flushAsync();

      expect(document.getElementById('match-opponent').textContent).toBe('Thorns Opponent');
    });
  });

  describe('Tab Navigation', () => {
    it('should show the Standings panel and update ARIA and tab-order state', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: null, source: null }), 0);
        if (msg.action === 'getStandings') setTimeout(() => cb({ standings: [], source: 'live', freshness: 'fresh' }), 0);
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      document.getElementById('tab-standings').click();
      await flushAsync();

      expect(document.getElementById('panel-standings').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('panel-match').classList.contains('hidden')).toBe(true);
      expect(document.getElementById('tab-standings').getAttribute('aria-selected')).toBe('true');
      expect(document.getElementById('tab-standings').getAttribute('tabindex')).toBe('0');
      expect(document.getElementById('tab-match').getAttribute('aria-selected')).toBe('false');
      expect(document.getElementById('tab-match').getAttribute('tabindex')).toBe('-1');
    });

    it('should move focus and activate tabs with the arrow keys, wrapping at each end', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: null, source: null }), 0);
        if (msg.action === 'getStandings') setTimeout(() => cb({ standings: [], source: 'live', freshness: 'fresh' }), 0);
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      const tabs = document.querySelector('.tabs');
      document.getElementById('tab-match').focus();

      tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(document.activeElement.id).toBe('tab-standings');
      expect(document.getElementById('panel-standings').classList.contains('hidden')).toBe(false);

      tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(document.activeElement.id).toBe('tab-match');
      expect(document.getElementById('panel-match').classList.contains('hidden')).toBe(false);

      tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(document.activeElement.id).toBe('tab-settings');

      await flushAsync();
    });
  });

  describe('Notifications Toggle', () => {
    it('should enable notifications, update the switch, and persist the choice', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: null, source: null }), 0);
      });

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('notification-toggle').getAttribute('aria-checked')).toBe('false');

      document.getElementById('notification-toggle').click();
      await flushAsync();

      expect(document.getElementById('notification-toggle').getAttribute('aria-checked')).toBe('true');
      expect(document.getElementById('notification-label').textContent).toBe('Kickoff + goal alerts on');
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({ notificationsEnabled: true }, expect.any(Function));
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'setNotifications', enabled: true });
    });

    it('should reflect a previously stored notification preference on load', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: null, source: null }), 0);
      });
      mockChrome.storage.local.get = jest.fn((keys, cb) => setTimeout(() => cb({ notificationsEnabled: true }), 0));

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('notification-toggle').getAttribute('aria-checked')).toBe('true');
      expect(document.getElementById('notification-label').textContent).toBe('Kickoff + goal alerts on');
    });
  });

  describe('Community Vote Sync', () => {
    it('should show the community total when the fan has not voted yet', async () => {
      const ts = FIXED_TIME + 3 * 24 * 60 * 60 * 1000;
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: { opponent: 'LAFC', matchTimestamp: ts }, source: 'live' }), 0);
      });
      globalThis.CommunityVotes = {
        get: jest.fn(() => Promise.resolve({ high: 5, medium: 3, low: 2 })),
        increment: jest.fn(() => Promise.resolve({ synced: true })),
        deleteInstallation: jest.fn(() => Promise.resolve({ deleted: true })),
      };

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      expect(document.getElementById('community-count').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('community-count').textContent).toBe('10 accepted community responses');
    });

    it('should report sync status and merge the server aggregate after casting a vote', async () => {
      const ts = FIXED_TIME + 3 * 24 * 60 * 60 * 1000;
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: { opponent: 'LAFC', matchTimestamp: ts }, source: 'live' }), 0);
      });
      globalThis.CommunityVotes = {
        get: jest.fn(() => Promise.resolve(null)),
        increment: jest.fn(() => Promise.resolve({ synced: true, aggregate: { high: 9, medium: 4, low: 1 } })),
        deleteInstallation: jest.fn(() => Promise.resolve({ deleted: true })),
      };

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      document.querySelector('button[data-vote="high"]').click();
      await flushAsync();

      expect(globalThis.CommunityVotes.increment).toHaveBeenCalledWith(ts, 'high');
      expect(document.getElementById('community-sync').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('community-sync').textContent).toBe('Response accepted for the anonymous-installation community total.');
      expect(document.getElementById('pct-high').textContent).toBe('64%');
    });

    it('should report that the response was saved locally when sync fails', async () => {
      const ts = FIXED_TIME + 3 * 24 * 60 * 60 * 1000;
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: { opponent: 'LAFC', matchTimestamp: ts }, source: 'live' }), 0);
      });
      globalThis.CommunityVotes = {
        get: jest.fn(() => Promise.resolve(null)),
        increment: jest.fn(() => Promise.resolve({ synced: false })),
        deleteInstallation: jest.fn(() => Promise.resolve({ deleted: true })),
      };

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      document.querySelector('button[data-vote="low"]').click();
      await flushAsync();

      expect(document.getElementById('community-sync').textContent).toBe('Saved on this device. Community sync will retry.');
    });

    it('should delete retained community data after the fan confirms the prompt', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: null, source: null }), 0);
      });
      globalThis.CommunityVotes = {
        get: jest.fn(() => Promise.resolve(null)),
        increment: jest.fn(() => Promise.resolve({ synced: true })),
        deleteInstallation: jest.fn(() => Promise.resolve({ deleted: true })),
      };
      window.confirm = jest.fn(() => true);

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      document.getElementById('community-delete').click();
      await flushAsync();

      expect(globalThis.CommunityVotes.deleteInstallation).toHaveBeenCalled();
      expect(document.getElementById('community-delete-status').textContent).toBe('Retained responses were deleted. Anonymous account removal is scheduled.');
      expect(document.getElementById('community-delete').disabled).toBe(false);
    });

    it('should not delete anything when the fan cancels the confirmation prompt', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === 'getMatchData') setTimeout(() => cb({ matchData: null, source: null }), 0);
      });
      globalThis.CommunityVotes = {
        get: jest.fn(() => Promise.resolve(null)),
        increment: jest.fn(() => Promise.resolve({ synced: true })),
        deleteInstallation: jest.fn(() => Promise.resolve({ deleted: true })),
      };
      window.confirm = jest.fn(() => false);

      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();

      document.getElementById('community-delete').click();
      await flushAsync();

      expect(globalThis.CommunityVotes.deleteInstallation).not.toHaveBeenCalled();
      expect(document.getElementById('community-delete-status').classList.contains('hidden')).toBe(true);
    });
  });
});
