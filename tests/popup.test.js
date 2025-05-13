// tests/popup.test.js
/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

describe('Popup', () => {
  test('initial test to verify CI', () => {
    expect(true).toBe(true);
  });
});

describe('Popup HTML Content', () => {
  let html;

  beforeAll(() => {
    // Read the HTML file content once before all tests in this describe block
    const htmlFilePath = path.resolve(__dirname, '../popup.html');
    html = fs.readFileSync(htmlFilePath, 'utf8');
  });

  beforeEach(() => {
    // Set up the JSDOM environment with the HTML content before each test
    document.documentElement.innerHTML = html.toString();
  });

  it('should display the main header with correct text', () => {
    // Find the h1 element within the header
    // Your HTML structure is <header><h1>Timbers Matchday</h1></header>
    // So, we can select the h1 directly or be more specific
    const headerElement = document.querySelector('header h1');
    
    // Check 1: Ensure the header element was found
    expect(headerElement).not.toBeNull(); 
    
    // Check 2: Verify the text content of the header
    if (headerElement) { // Only try to access textContent if the element exists
      expect(headerElement.textContent).toBe('Timbers Matchday');
    }
  });

  it('should have a section for "Next Match"', () => {
    const nextMatchSection = document.querySelector('.match-info h2');
    expect(nextMatchSection).not.toBeNull();
    if (nextMatchSection) {
      expect(nextMatchSection.textContent).toBe('Next Match');
    }
  });

  it('should have a section for "Fan Engagement"', () => {
    const fanEngagementSection = document.querySelector('.fan-engagement h2');
    expect(fanEngagementSection).not.toBeNull();
    if (fanEngagementSection) {
      expect(fanEngagementSection.textContent).toBe('Fan Engagement');
    }
  });

  it('should initially display "Loading match data..." in the match info section', () => {
    const matchInfoDiv = document.getElementById('match-info');
    expect(matchInfoDiv).not.toBeNull();
    if (matchInfoDiv) {
      // .trim() is used to remove any leading/trailing whitespace
      expect(matchInfoDiv.textContent.trim()).toBe('Loading match data...');
    }
  });

  // You can add more tests here for other static elements:
  // - Existence of the countdown div
  // - Existence and attributes of the "View Full Schedule" link
  // - Existence of the fan engagement buttons
});
