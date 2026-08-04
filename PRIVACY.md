# Privacy Policy — Timbers Matchday

**Effective date:** August 3, 2026

## Summary

Timbers Matchday does not request your name, email address, precise location, browsing history, visited URLs, or page content. Community polling uses a pseudonymous Firebase anonymous account so the backend can accept at most one response from that anonymous installation for a match poll. An anonymous installation is not proof of one unique person.

## Data the extension handles

| Data | Purpose | Storage and access |
|---|---|---|
| Upcoming match data | Show the next Portland Timbers match and countdown | Cached in `chrome.storage.local`; fetched from the ESPN schedule endpoint |
| Local vote state | Remember that this browser installation already responded | Stored in `chrome.storage.local` |
| Firebase anonymous UID and auth session | Authenticate the community submission without requesting a personal account | Auth tokens and UID are stored in extension-local storage; the ID token is sent only to the Matchday API |
| Confidence choice | Add High, Medium, or Low to the current match aggregate | Stored server-side in a restricted raw response record keyed by the anonymous UID; never exposed by the public aggregate API |
| Pending submission and idempotency key | Retry safely after a temporary network or service failure | Stored locally until the backend accepts the response |
| Daily abuse-control counter | Limit one anonymous UID to ten newly accepted poll responses per UTC day | Stored under a SHA-256-derived daily key without the raw UID and deleted within 72 hours |
| Deletion request | Make deletion retry-safe and schedule removal of the Firebase anonymous account | Temporarily stores the anonymous UID, a random receipt, and deletion timestamps in a server-only record until account removal succeeds |
| Aggregate response counts | Display community High, Medium, and Low totals | Returned by the Matchday API without UIDs or raw response records |

## Community response integrity

The backend verifies the Firebase ID token, confirms that the identity is anonymous, checks the provider-backed poll window and extension version, validates the choice, and creates at most one response document for that UID and poll. Clearing extension data or reinstalling can create a new anonymous UID, so the product does not describe responses as verified people or representative fan research.

## Analytics and browsing data

The public extension package does not include analytics code or analytics credentials and does not send product analytics. It does not request tab, browsing-history, page-content, geolocation, or broad website access.

Infrastructure providers may process standard network metadata such as an IP address in transient request and security logs. The application does not add raw IP addresses to poll records or product analytics.

## Host access

| Host | Purpose |
|---|---|
| `site.api.espn.com` | Retrieve upcoming Timbers schedule data |
| `identitytoolkit.googleapis.com` | Create a Firebase anonymous account when community polling is first used |
| `securetoken.googleapis.com` | Refresh the anonymous Firebase ID token |
| `us-central1-timbers-matchday.cloudfunctions.net` | Read integrity-controlled aggregates and submit an authenticated response |

## Retention and deletion

- Match data, local response state, pending submissions, and anonymous auth state remain in extension storage until removed by the extension or browser. Uninstalling the extension removes extension-local storage.
- The extension's **Delete my community data** control immediately removes retained raw poll responses, clears community response state from extension storage, and adjusts affected aggregate shards. It then schedules deletion of the Firebase anonymous account after a one-hour retry window; the hourly cleanup normally completes account removal within two hours.
- The server retains the anonymous UID only in the restricted deletion request until account deletion succeeds. A service incident can extend that interval and is an operational alert condition.
- Raw integrity-controlled response records are scheduled for deletion 90 days after the match. Aggregate counts remain as historical community product data.
- Once a raw response reaches scheduled retention deletion, its contribution is no longer linked to an anonymous UID and cannot be selectively removed from historical aggregate counts.
- Pseudonymous daily abuse-control counters are scheduled for deletion within 72 hours.
- Legacy totals created before the authenticated migration are retained separately as `legacy_unverified` and are never merged into integrity-controlled totals.
- The compatibility release does not collect passive usage or regional analytics.

## Data sharing and advertising

Raw responses, Firebase UIDs, auth tokens, and pending submissions are not sold, used for personalized advertising, or shared with clubs, sponsors, data brokers, or advertisers. Public aggregate community counts are a user-facing extension feature.

## Security

Raw responses and authentication data are server-only. Public clients can read aggregate counts but cannot read raw response documents. Firebase web API configuration is public client configuration and is not treated as a secret; authorization relies on verified ID tokens, server validation, IAM, and deny-by-default Firestore rules.

## Children

Timbers Matchday is not directed to children under 13 and does not knowingly request personal information from children.

## Changes and contact

Behavior changes that affect data handling require an updated extension disclosure and privacy policy in the same release. Use the in-extension deletion control for community data. For questions, deletion failures, or deletion requests when the extension is unavailable, use the [public support form](https://github.com/Tony5897/timbers-chrome-ext/issues/new/choose) until the dedicated support route is live. Never post Firebase IDs, authentication tokens, API keys, or personal information in a public issue.

Timbers Matchday's use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.
