# Portland Timbers Matchday

[![CI](https://github.com/Tony5897/timbers-chrome-ext/actions/workflows/ci.yml/badge.svg)](https://github.com/Tony5897/timbers-chrome-ext/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/Tony5897/timbers-chrome-ext/graph/badge.svg)](https://codecov.io/gh/Tony5897/timbers-chrome-ext)

A cross-browser extension (Chrome and Safari) that displays upcoming Portland Timbers matches with a live countdown, TV/streaming info, and a fan confidence poll.

## Features

- Live countdown to the next Timbers match
- Match date/time, venue, and TV/streaming details
- Fan confidence poll with community vote breakdown
- One-click access to the official MLS schedule
- Hourly background refresh via service worker
- Timbers-branded dark-green and gold UI

## Browser Support

| Browser | Minimum Version | Status |
|---------|----------------|--------|
| Chrome  | 102+           | Supported |
| Edge    | 102+           | Supported (Chromium-based) |
| Safari  | 15.4+          | Supported (via Xcode conversion) |

## Installation

### Prerequisites

- Node.js (LTS) and npm

### Setup

```bash
git clone https://github.com/Tony5897/timbers-chrome-ext.git
cd timbers-chrome-ext
npm install
npm run build:icons
```

### Chrome / Edge

1. Navigate to `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked** and select the project root folder

### Safari (macOS)

Safari requires converting the extension into an Xcode project using Apple's tooling.

**Requirements:** macOS with full [Xcode](https://developer.apple.com/xcode/) installed (not just Command Line Tools).

1. Set Xcode as the active developer directory (one-time):

   ```bash
   sudo xcode-select -s /Applications/Xcode.app
   ```

2. Run the conversion script:

   ```bash
   npm run build:safari
   ```

   This creates a `safari/` directory containing the Xcode project.

3. Open the generated Xcode project:

   ```bash
   open safari/Timbers\ Matchday/Timbers\ Matchday.xcodeproj
   ```

4. In Xcode, select a signing team under **Signing & Capabilities**, then build and run (Cmd+R).

5. Enable the extension in Safari:
   - Safari > Settings > Extensions > enable **Timbers Matchday**

**For unsigned development builds:**
- Safari > Settings > Advanced > check **Show Develop menu in menu bar**
- Develop > **Allow Unsigned Extensions** (requires re-enabling after each Safari restart)

### Safari API Compatibility

All APIs used by this extension are natively supported in Safari 15.4+:

- `chrome.runtime` (sendMessage, onMessage)
- `chrome.storage.local`
- `chrome.alarms`
- MV3 service workers

No polyfills or browser-specific code paths are required. The `chrome` namespace works natively in Safari Web Extensions.

## Usage

Click the Timbers Matchday icon in the browser toolbar to open the popup. The extension automatically fetches the latest schedule data from MLS and displays the next upcoming match with a live countdown timer.

Use the **Confidence Poll** section to vote on your confidence level and see how other fans are feeling.

## Development

### npm Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Run Jest test suite with coverage |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |
| `npm run build:icons` | Generate 16/48/128px icons from `icon.png` |
| `npm run build:safari` | Convert to Safari Web Extension (requires Xcode) |

### Project Structure

```
timbers-chrome-ext/
├── background.js             # Service worker — fetches and caches match data
├── popup.html                # Extension popup UI
├── popup.js                  # Popup logic — countdown, voting, data display
├── styles.css                # Popup stylesheet (CSS custom properties design system)
├── manifest.json             # Extension manifest (MV3)
├── icon.png                  # Source icon (640×668)
├── icons/                    # Generated extension icons
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── scripts/
│   ├── generate-icons.js     # Sharp-based icon generator
│   └── convert-safari.sh     # Safari Web Extension converter wrapper
├── tests/
│   ├── scraper.test.js       # Background scraper unit tests
│   ├── popup.test.js         # Popup UI and integration tests
│   └── mocks/
│       └── styleMock.js      # Jest CSS mock
├── .github/workflows/ci.yml  # GitHub Actions CI pipeline
├── PRIVACY.md                # Privacy policy
└── LICENSE                   # ISC License
```

## Chrome Web Store

Submitted to the Chrome Web Store — pending review.

![Chrome Web Store — Pending Review](assets/chrome-web-store-pending.png)

- **Manifest V3** compliant
- Icons at 16px, 48px, and 128px
- Minimal permissions (`storage`, `alarms`, single host)
- Privacy policy included (`PRIVACY.md`)
- No remote code execution; all logic is bundled locally

## Privacy

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

**Summary:** This extension stores all data locally on your device. It fetches publicly available schedule data from mlssoccer.com. No personal information is collected, transmitted, or shared.


## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes and push to your fork
4. Open a pull request against `develop`

## License

This project is licensed under the ISC License. See [LICENSE](LICENSE).
