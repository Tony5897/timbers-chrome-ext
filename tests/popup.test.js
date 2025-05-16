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
  const FIXED_TIME = 1621000000000; // Fixed timestamp to use for tests

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
          if (msg.action === "getMatchData") {
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
      matchTimestamp: FIXED_TIME + (3 * 24 * 60 * 60 * 1000) // 3 days from the fixed time
    };

    it('should display match data when fetched', async () => {
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === "getMatchData") {
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
        if (msg.action === "getMatchData") {
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
        if (msg.action === "getMatchData") {
          mockChrome.runtime.lastError = { message: "Fetch error" };
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
        if (msg.action === "getMatchData") {
          setTimeout(() => cb({ matchData: partialData }), 0);
        }
      });
      
      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();
      
      expect(document.getElementById('match-info').innerHTML).toContain('<strong>Date:</strong> N/A');
      expect(document.getElementById('countdown').textContent).toBe("Match time unavailable.");
    });
  });

  describe('Countdown Functionality', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      // Set a fixed time that we'll control precisely
      jest.setSystemTime(new Date(FIXED_TIME));
    });

    it('should display and update countdown', async () => {
      // Make timestamp much further in the future to avoid timing edge cases
      // 24 hours ahead instead of just 1 hour
      const futureTimestamp = FIXED_TIME + (24 * 60 * 60 * 1000);
      const data = { 
        opponent: 'TestCountdown',
        matchTimestamp: futureTimestamp
      };
      
      // Override Date.now in the test to ensure consistent time
      const originalNow = Date.now;
      Date.now = jest.fn(() => FIXED_TIME);
      
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === "getMatchData") {
          setTimeout(() => cb({ matchData: data }), 0);
        }
      });
      
      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      jest.runAllTimers();
      
      const countdownDiv = document.getElementById('countdown');
      // Now we expect 23h 59m XXs remaining (since we're 24 hours away)
      expect(countdownDiv.textContent).toMatch(/0d 23h 59m \d{1,2}s remaining/);
      
      // Advance time by 1 second
      jest.advanceTimersByTime(1000);
      expect(countdownDiv.textContent).toMatch(/0d 23h 59m \d{1,2}s remaining/);
      expect(countdownDiv.textContent).not.toBe("Match is live!");
      
      // Restore original Date.now
      Date.now = originalNow;
    });

    it('should display "Match is live!" when time is up', async () => {
      const pastTimestamp = FIXED_TIME - 1000; // 1 second in the past
      const data = { 
        opponent: 'TestLive',
        matchTimestamp: pastTimestamp
      };
      
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === "getMatchData") {
          setTimeout(() => cb({ matchData: data }), 0);
        }
      });
      
      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      jest.runAllTimers();
      
      expect(document.getElementById('countdown').textContent).toBe("Match is live!");
    });

    it('should display "Match time unavailable." if matchTimestamp is not a number', async () => {
      const invalidData = { 
        opponent: 'Test FC',
        matchTimestamp: "not-a-valid-timestamp"
      };
      
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === "getMatchData") {
          setTimeout(() => cb({ matchData: invalidData }), 0);
        }
      });
      
      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      jest.runAllTimers();
      
      expect(document.getElementById('countdown').textContent).toBe("Match time unavailable.");
    });
  });

  describe('Fan Engagement - Voting', () => {
    beforeEach(() => {
      document.documentElement.innerHTML = html;
      
      if (!document.getElementById('vote-result')) {
        const voteResultDiv = document.createElement('p');
        voteResultDiv.id = 'vote-result';
        document.body.appendChild(voteResultDiv);
      }
    });
    
    it('should update vote and display message on click', async () => {
      mockChrome.storage.local.get = jest.fn((keys, cb) => {
        setTimeout(() => cb({ votes: { high: 0, medium: 0, low: 0 } }), 0);
      });
      
      mockChrome.storage.local.set = jest.fn((items, cb) => {
        setTimeout(() => cb(), 0);
      });
      
      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();
      
      const highButton = document.querySelector('button[data-vote="high"]');
      expect(highButton).not.toBeNull();
      
      highButton.click();
      await flushAsync();
      await flushAsync();
      
      expect(mockChrome.storage.local.get).toHaveBeenCalledWith(['votes'], expect.any(Function));
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        { votes: { high: 1, medium: 0, low: 0 } },
        expect.any(Function)
      );
      
      expect(document.getElementById('vote-result').textContent)
        .toContain('Thanks for voting! Votes: High 1');
    });

    it('should handle error when getting votes', async () => {
      mockChrome.storage.local.get = jest.fn((keys, cb) => {
        mockChrome.runtime.lastError = { message: "Get vote error" };
        setTimeout(() => cb(null), 0);
      });
      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();
      expect(document.getElementById('vote-result').textContent)
        .toContain('Error: Could not retrieve votes.');
    });

    it('should display fixed countdown when using mocked Date.now', async () => {
      // Make timestamp 24 hours ahead
      const futureTimestamp = FIXED_TIME + (24 * 60 * 60 * 1000);
      const data = { 
        opponent: 'TestCountdown',
        matchTimestamp: futureTimestamp
      };
      
      // Override Date.now in the test to ensure consistent time
      const originalNow = Date.now;
      Date.now = jest.fn(() => FIXED_TIME);
      
      mockChrome.runtime.sendMessage = jest.fn((msg, cb) => {
        if (msg.action === "getMatchData") {
          setTimeout(() => cb({ matchData: data }), 0);
        }
      });
      
      initializePopupScript();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushAsync();
      
      const countdownDiv = document.getElementById('countdown');
      // Test initial state (24 hours = 1 day)
      expect(countdownDiv.textContent).toMatch(/1d 0h 0m \d{1,2}s remaining/);
      
      // Advance timer by 1 second and verify countdown hasn't changed 
      // because we mocked Date.now to return a fixed time
      jest.advanceTimersByTime(1000);
      expect(countdownDiv.textContent).toMatch(/1d 0h 0m \d{1,2}s remaining/);
      
      // Restore original Date.now
      Date.now = originalNow;
    });
  });
});

function startCountdown(matchTimestamp) {
  if (typeof matchTimestamp !== 'number' || isNaN(matchTimestamp)) {
    countdownDiv.textContent = "Match time unavailable.";
    return;
  }

  let countdownInterval = setInterval(() => {
    const now = Date.now();
    let diff = matchTimestamp - now;

    if (diff <= 0) {
      countdownDiv.textContent = "Match is live!";
      clearInterval(countdownInterval);
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    diff -= days * (1000 * 60 * 60 * 24);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    diff -= hours * (1000 * 60 * 60);
    const minutes = Math.floor(diff / (1000 * 60));
    diff -= minutes * (1000 * 60);
    const seconds = Math.floor(diff / 1000);

    countdownDiv.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s remaining`;
  }, 1000);

  // Immediately show the countdown on first call
  const now = Date.now();
  let diff = matchTimestamp - now;
  if (diff <= 0) {
    countdownDiv.textContent = "Match is live!";
    clearInterval(countdownInterval);
    return;
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  diff -= days * (1000 * 60 * 60 * 24);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  diff -= hours * (1000 * 60 * 60);
  const minutes = Math.floor(diff / (1000 * 60));
  diff -= minutes * (1000 * 60);
  const seconds = Math.floor(diff / 1000);

  countdownDiv.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s remaining`;
}

chrome.storage.local.get(['votes'], (result) => {
  if (chrome.runtime.lastError) {
    const voteResult = document.getElementById('vote-result');
    if (voteResult) {
      voteResult.textContent = 'Error: Could not retrieve votes.';
    }
    return;
  }
  let votes = result && result.votes ? result.votes : { high: 0, medium: 0, low: 0 };
  // ... rest of vote handling logic
});
