// tests/popup.test.js
/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');

describe('Popup UI initial state', () => {
  beforeEach(() => {
    const html = fs.readFileSync(
      path.resolve(__dirname, '../popup.html'),
      'utf8'
    );
    document.documentElement.innerHTML = html;
  });

  test('shows loading message before data arrives', () => {
    const info = document.getElementById('match-info');
    expect(info.textContent).toMatch(/Loading match data/i);
  });

  test('renders three vote buttons', () => {
    const buttons = document.querySelectorAll('.fan-engagement button');
    expect(buttons.length).toBe(3);
  });
});
