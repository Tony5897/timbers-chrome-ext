# Privacy Policy — Timbers Matchday

**Effective date:** March 2026

## Data Collection

Timbers Matchday does **not** collect, transmit, or store any personally identifiable information (PII).

### What the extension accesses

| Data | Purpose | Stored where |
|------|---------|-------------|
| MLS schedule page (`mlssoccer.com`) | Fetches upcoming Portland Timbers match info (opponent, date, time, venue) | Cached locally via `chrome.storage.local`; refreshed hourly |
| Fan confidence vote | Records your High / Medium / Low vote | Stored locally via `chrome.storage.local` on your device only |

### What the extension does NOT do

- Does **not** collect names, emails, IP addresses, or any PII
- Does **not** use analytics, telemetry, or tracking scripts
- Does **not** send data to any third-party server
- Does **not** read or modify any web page content you visit
- Does **not** access browsing history, bookmarks, or cookies

## Permissions Explained

| Permission | Why it's needed |
|------------|----------------|
| `storage` | Save cached match data and your poll vote locally on your device |
| `alarms` | Schedule hourly background refreshes of match data |
| `host_permissions` (`mlssoccer.com`) | Fetch the Portland Timbers schedule page to parse upcoming match details |

## Data Retention

All data is stored locally on your device using the browser's extension storage API. Uninstalling the extension removes all stored data. There is no server-side storage.

## Third-Party Services

The extension fetches publicly available schedule data from [mlssoccer.com](https://www.mlssoccer.com). No authentication or user credentials are sent in these requests. Your browser's standard HTTP headers (User-Agent, etc.) are transmitted as part of normal web traffic.

## Children's Privacy

This extension does not knowingly collect information from children under 13.

## Changes to This Policy

Updates to this policy will be reflected in this file with a revised effective date.

## Contact

For questions about this privacy policy, open an issue on the project's GitHub repository.
