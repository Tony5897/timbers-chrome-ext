# Privacy Policy — Timbers Matchday

**Effective date:** March 2026

---

## Data Collection

Timbers Matchday does **not** collect any personally identifiable information (PII). The extension uses anonymous, non-identifying usage analytics to monitor reliability and improve the user experience.

---

## What the extension accesses

| Data | Purpose | Stored where |
|------|---------|-------------|
| MLS schedule page (`mlssoccer.com`) | Fetches upcoming Portland Timbers match info (opponent, date, time, venue) | Cached locally via `chrome.storage.local`; refreshed hourly |
| Fan confidence vote | Records your High / Medium / Low vote | Stored locally via `chrome.storage.local` on your device only |
| Anonymous client ID (`_tc_cid`) | A randomly generated UUID created once per browser profile. Used to distinguish unique installations in aggregate analytics — contains no personal information | Stored locally via `chrome.storage.local` |

---

## Analytics & Telemetry

Timbers Matchday uses the **Google Analytics 4 (GA4) Measurement Protocol** to collect anonymous usage events. No personal information is included in any event payload.

### How it works

- A random UUID (`_tc_cid`) is generated on first use and stored locally. It is never linked to any personal identity.
- A session ID (`Date.now()` timestamp) is created per popup open or service worker startup. It is not persisted.
- Events are sent via a direct `POST` request to `https://www.google-analytics.com/mp/collect`. No third-party scripts are loaded.

### Events collected

| Event | When it fires | Data included |
|-------|--------------|---------------|
| `popup_open` | User opens the extension popup | Surface: `popup` |
| `match_fetch_started` | Background worker begins a data fetch | Surface: `background` |
| `match_fetch_live_success` | Live MLS data fetched successfully | Source, fetch duration (ms), surface |
| `match_fetch_cache_used` | Cached data served (live fetch failed) | Source, surface |
| `match_fetch_fallback_used` | Bundled fallback data served | Source, surface |
| `match_fetch_failed` | All three data sources failed | Surface |
| `schedule_link_clicked` | User taps "View Full Schedule" | Surface: `popup` |

### What is never collected

- Name, email address, or any personally identifiable information
- IP address (not included in the event payload; standard HTTP headers are transmitted as part of normal web traffic)
- Browsing history, page content, or visited URLs
- Location data
- Any data from pages you visit outside the extension

### Public build behavior

The telemetry system requires a local configuration file (`telemetry.local.js`) to activate. This file is **never distributed** in the published Chrome Web Store package. For all public users, every telemetry call exits silently before any network request is made and no UUID is created or stored.

---

## Permissions Explained

| Permission | Why it's needed |
|------------|----------------|
| `storage` | Save cached match data, your poll vote, and the anonymous client ID locally on your device |
| `alarms` | Schedule hourly background refreshes of match data |
| `host_permissions` (`mlssoccer.com`) | Fetch the Portland Timbers schedule page to parse upcoming match details |
| `host_permissions` (`google-analytics.com`) | Send anonymous usage events via the GA4 Measurement Protocol |

---

## Data Retention

All data is stored locally on your device using the browser's extension storage API. Uninstalling the extension removes all stored data. There is no server-side storage operated by this extension.

---

## Third-Party Services

| Service | Purpose | Data sent |
|---------|---------|-----------|
| [mlssoccer.com](https://www.mlssoccer.com) | Source of Portland Timbers schedule data | No user data — outbound fetch only |
| [Google Analytics 4](https://developers.google.com/analytics/devguides/collection/protocol/ga4) | Anonymous usage analytics via Measurement Protocol | Anonymous UUID, session ID, event name, surface label |

No authentication or user credentials are sent in any of these requests.

---

## Children's Privacy

This extension does not knowingly collect information from children under 13.

---

## Changes to This Policy

Updates to this policy will be reflected in this file with a revised effective date.

---

## Contact

For questions about this privacy policy, open an issue on the project's GitHub repository.
