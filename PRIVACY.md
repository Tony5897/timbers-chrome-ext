# Privacy Policy — Timbers Matchday

**Effective date:** March 2026

---

## Data Collection

Timbers Matchday does **not** collect any personally identifiable information (PII). The extension uses anonymous, non-identifying usage analytics to monitor reliability and improve the user experience.

---

## What the extension accesses

| Data | Purpose | Stored where |
|------|---------|-------------|
| ESPN schedule API (`site.api.espn.com`) | Fetches upcoming Portland Timbers match info (opponent, date, time, venue) | Cached locally via `chrome.storage.local`; refreshed hourly |
| Fan confidence vote | Records your High / Medium / Low vote for the current match | Stored locally via `chrome.storage.local` on your device; vote choice (High / Medium / Low) also sent to Firebase Firestore to power the community aggregate display |
| Community vote totals | Aggregate High / Medium / Low counts across all users for the current match | Read from Firebase Firestore on popup open; no personal information is included |
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
| `host_permissions` (`site.api.espn.com`) | Fetch the Portland Timbers schedule from the ESPN API |
| `host_permissions` (`google-analytics.com`) | Send anonymous usage events via the GA4 Measurement Protocol |
| `host_permissions` (`firestore.googleapis.com`) | Read community vote totals and submit your vote to the shared Firebase Firestore database |

---

## Data Retention

Local data (cached match info, your vote choice, anonymous client ID) is stored on your device via the browser's extension storage API. Uninstalling the extension removes all locally stored data.

Community vote counts (aggregate High / Medium / Low tallies per match) are stored server-side in Firebase Firestore. Only the vote category is recorded — no identifier, IP address, or personal information is sent or stored. These aggregated counts are retained until manually deleted from the Firebase project.

---

## Third-Party Services

| Service | Purpose | Data sent |
|---------|---------|-----------|
| [site.api.espn.com](https://site.api.espn.com) | Source of Portland Timbers schedule data via ESPN API | No user data — outbound fetch only |
| [Google Analytics 4](https://developers.google.com/analytics/devguides/collection/protocol/ga4) | Anonymous usage analytics via Measurement Protocol | Anonymous UUID, session ID, event name, surface label |
| [Firebase Firestore](https://firebase.google.com/products/firestore) (Google) | Stores and serves community vote aggregates (High / Medium / Low counts per match) | Vote category only (High, Medium, or Low) — no identifier or personal data |

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
