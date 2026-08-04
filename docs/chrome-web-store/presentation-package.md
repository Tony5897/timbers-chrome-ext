# Chrome Web Store Presentation Package

**Release:** `1.0.5`
**Status:** Prepared for final human review; not submitted
**Last verified:** August 4, 2026

This package is the source of truth for the public Chrome Web Store presentation. It describes only behavior implemented in release `1.0.5`. Publishing remains a manual owner decision after the staging API, production cutover, support, privacy, rollback, and package gates pass.

## Positioning

- **Name:** Timbers Matchday
- **Publisher position:** Independent fan project
- **Primary promise:** The next Portland Timbers match, kickoff countdown, viewing details, and anonymous community confidence in one toolbar popup.
- **Affiliation statement:** Timbers Matchday is an independent, unofficial fan project. It is not affiliated with, endorsed by, or produced by the Portland Timbers, Major League Soccer, or their affiliates.
- **Visual identity:** The original Kickoff Dial mark represents match time and toolbar utility. Store and runtime artwork must not use the club crest, axe mark, league marks, sponsor marks, or official trade dress.

## Dashboard Values

### Item title

```text
Timbers Matchday
```

### Item summary

The summary is 115 characters, within the Chrome Web Store 132-character limit.

```text
See the next Portland match, kickoff countdown, viewing details, and anonymous fan confidence in one toolbar popup.
```

### Detailed description

```text
Timbers Matchday is an independent fan-made toolbar companion for Portland Timbers supporters.

Open the extension to see the next match without leaving your current tab:

• Opponent, kickoff date and time, venue, and competition
• Live countdown to kickoff
• Available TV and streaming information
• Direct link to the official match schedule
• Anonymous High, Medium, or Low fan-confidence polling
• Public community totals with clear integrity limits
• Recent cached match information when the live schedule source is temporarily unavailable

Community polling uses a Firebase anonymous installation identity so the service can accept at most one response from that identity for a match poll. It does not request a name or email, and it does not claim that one installation equals one unique person. The popup includes a control to delete retained community data.

The extension does not request access to tabs, browsing history, visited pages, page content, geolocation, or all websites. It contains no advertising and no product analytics.

Timbers Matchday is an independent, unofficial fan project. It is not affiliated with, endorsed by, or produced by the Portland Timbers, Major League Soccer, or their affiliates.
```

### Classification and URLs

| Dashboard field | Value |
|---|---|
| Primary category | `Entertainment` |
| Language | `English (United States)` |
| Homepage URL | `https://tony5897.github.io/timbers-chrome-ext/` |
| Support URL | `https://github.com/Tony5897/timbers-chrome-ext/issues/new/choose` |
| Privacy policy URL | `https://tony5897.github.io/timbers-chrome-ext/PRIVACY` |
| Visibility | Preserve the existing listing setting until the owner approves a change |

The homepage and privacy URLs currently use HTTPS GitHub Pages. The support URL opens structured public issue forms. Never ask a user to post a Firebase UID, ID token, refresh token, API key, precise location, or other personal information in a public issue.

## Graphic Assets

| Dashboard asset | Required dimensions | Approved export |
|---|---:|---|
| Store icon | 128×128 PNG | `icons/icon-128.png` |
| Small promo tile | 440×280 PNG | `assets/store/promo-small-440x280.png` |
| Marquee promo tile | 1400×560 PNG | `assets/store/promo-marquee-1400x560.png` |
| Screenshot 1 | 1280×800 PNG | `assets/store/screenshot-01-next-match-1280x800.png` |
| Screenshot 2 | 1280×800 PNG | `assets/store/screenshot-02-confidence-1280x800.png` |
| Screenshot 3 | 1280×800 PNG | `assets/store/screenshot-03-viewing-1280x800.png` |
| Screenshot 4 | 1280×800 PNG | `assets/store/screenshot-04-resilient-1280x800.png` |
| Screenshot 5 | 1280×800 PNG | `assets/store/screenshot-05-privacy-1280x800.png` |

The promotional graphics use limited text and brand-led composition. The screenshots are full-bleed, describe existing UI states, and do not show live scores, notifications, Thorns support, player voting, standings, geographic analytics, or any other unshipped capability.

Regenerate and validate the complete set with:

```bash
npm run build:store-assets
npm run verify:store-assets
```

## Privacy Practices

### Single purpose

```text
Display the next Portland Timbers match and kickoff countdown, provide viewing details, and let an anonymous extension installation contribute one confidence response to the current match poll.
```

### Permission justifications

| Permission or host | Dashboard justification |
|---|---|
| `storage` | Stores recent match data for resilient display, local vote state, a pending retry record, and the Firebase anonymous authentication session. It does not store browsing history or page content. |
| `alarms` | Schedules an hourly background refresh so the next-match countdown and viewing details remain current without requiring the popup to stay open. |
| `site.api.espn.com` | Retrieves structured public schedule data for upcoming Portland Timbers matches. The extension does not load or execute remote code from this host. |
| `identitytoolkit.googleapis.com` | Creates a Firebase anonymous account only when community polling is used. No name, email address, or social sign-in is requested. |
| `securetoken.googleapis.com` | Refreshes the Firebase anonymous ID token used to authenticate community API requests. |
| `us-central1-timbers-matchday.cloudfunctions.net` | Reads integrity-controlled aggregate poll totals, submits an authenticated confidence response, and processes the in-extension community-data deletion request. |

### Remote code

Select **No, I am not using remote code**. All executable JavaScript is packaged in the extension. Remote hosts return structured data only.

### Data-use disclosures

Review the dashboard's current labels before submission. For release `1.0.5`, disclose at minimum:

- **Authentication information:** Firebase anonymous UID and session tokens used only to authenticate community polling and deletion.
- **User activity:** The user-selected High, Medium, or Low confidence response and local response state.

Do not select browsing history, website content, precise location, personal communications, financial information, health information, or personally identifiable information unless the runtime behavior changes and the policy is updated first.

Certify only statements supported by `PRIVACY.md`: data is used for the disclosed single purpose, is not sold, is not used for personalized advertising or credit decisions, and is not transferred outside the disclosed service providers and operational purposes.

## Release Notes

```text
Version 1.0.5 strengthens community polling and release reliability.

• Adds anonymous authenticated confidence submissions
• Adds clear poll-integrity and privacy disclosure
• Adds in-extension community-data deletion
• Improves schedule fallback and delayed-data messaging
• Introduces an original independent visual identity and refreshed popup styling
• Preserves minimal permissions and bundled Manifest V3 code
```

## Final Human Review

Before uploading or changing the public listing:

1. Confirm the staging API and authenticated smoke tests pass, including delayed account cleanup evidence.
2. Confirm production billing, budgets, alerts, IAM, indexes, Auth, API, migration backup, and rollback gates pass.
3. Build and verify the exact `1.0.5` ZIP from the approved release commit.
4. Open every graphic at 100% and half size; check cropping, contrast, text, and icon rendering on light and dark backgrounds.
5. Compare the manifest, detailed description, privacy practices, `PRIVACY.md`, support forms, and runtime behavior field by field.
6. Re-open the homepage, support, privacy, and official schedule URLs from a signed-out browser session.
7. Confirm the independent-project disclaimer appears in the listing description and popup.
8. Record the owner-approved title, copy, assets, URLs, visibility, package SHA-256, submission time, approval time, and publication time.
9. Do not publish until the owner explicitly approves the complete public presentation in the Chrome Web Store Developer Dashboard.
