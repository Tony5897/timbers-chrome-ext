# Portland Timbers Matchday Notifier

[![CI](https://github.com/Tony5897/timbers-chrome-ext/actions/workflows/ci.yml/badge.svg)](https://github.com/Tony5897/timbers-chrome-ext/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/Tony5897/timbers-chrome-ext/graph/badge.svg)](https://codecov.io/gh/Tony5897/timbers-chrome-ext)

A Chrome extension that notifies you about upcoming Portland Timbers matches and engages fans with interactive features.

## Features

- Displays a countdown to the next Timbers match.
- Shows match date/time (converted to your local timezone) and venue details.
- Provides TV/streaming info (if available).
- **Fan Engagement:** Vote on match predictions and track community confidence.
- One-click access to the official Timbers schedule.

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Tony5897/timbers-chrome-ext.git
   cd timbers-chrome-ext
   npm install
   ```

2. Load the extension in Chrome:
   - Navigate to `chrome://extensions`
   - Enable **Developer mode** (toggle in the top-right corner)
   - Click **Load unpacked** and select the project root folder

## Usage

Once installed, click the Timbers Matchday icon in the Chrome toolbar to open the popup. The extension will automatically fetch the latest schedule data from MLS and display the next upcoming match with a live countdown timer.

Use the **Fan Engagement** section to vote on your confidence level for the next match and see how other fans are feeling.

## Development

- **Prerequisites:** Node.js (LTS), npm
- **Run tests:**

  ```bash
  npm test
  ```

- **Watch mode:**

  ```bash
  npm run test:watch
  ```

- **Lint:**

  ```bash
  npm run lint
  ```

## Project Structure

```
timbers-chrome-ext/
├── background.js           # Service worker — fetches and caches match data
├── popup.html              # Extension popup UI
├── popup.js                # Popup logic — countdown, voting, data display
├── styles.css              # Popup stylesheet (CSS custom properties design system)
├── manifest.json           # Chrome extension manifest (MV3)
├── icon.png                # Source icon (640×668)
├── icons/                  # Generated extension icons
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── scripts/
│   └── generate-icons.js   # Build script — generates sized icons from source
├── tests/
│   ├── scraper.test.js     # Background scraper unit tests
│   ├── popup.test.js       # Popup UI and integration tests
│   └── mocks/
│       └── styleMock.js    # Jest CSS mock
└── .github/
    └── workflows/
        └── ci.yml          # GitHub Actions CI pipeline
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes and push to your fork
4. Open a pull request against `develop`

## License

This project is licensed under the ISC License.
