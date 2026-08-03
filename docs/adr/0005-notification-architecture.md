# ADR 0005: Notification Architecture

- **Status:** Accepted as target architecture; not enabled in Phase 0
- **Date:** August 3, 2026
- **Owners:** Client, backend, and operations engineering

## Context

Match reminders and live events have different reliability requirements. Browser alarms can schedule known local reminders without a server push token, while goals, lineups, corrections, and final results require a trusted live source and server fan-out. Chrome, Safari, web, and iOS have different delivery and permission models.

## Decision

- Ask for notification permission in context, after explaining categories and controls. Never bundle it with polling or analytics consent.
- Use browser alarms for known schedule reminders such as 24 hours, one hour, and kickoff. Reconcile alarms whenever canonical match state changes.
- Use server-originated FCM messages for live events only after the live-provider gate passes.
- Store notification preferences by installation and team, with independent controls for reminders, lineup, kickoff, goals, halftime, final, and post-match poll prompts.
- Make event delivery idempotent using canonical event ID plus revision. Corrections can supersede prior notifications but cannot silently duplicate them.
- Include freshness limits so delayed live events do not produce misleading alerts.
- Keep notification payloads minimal; clients fetch canonical detail from the API where practical.
- Implement Chrome first. Safari delivery requires a separate installed-browser proof and is not allowed to delay Chrome. iOS APNs, widgets, and Live Activities remain a later consumer of the same canonical event stream.

## Operational Requirements

Track provider-to-ingest latency, ingest-to-send latency, delivery acceptance, token invalidation, duplicate suppression, correction rate, and per-category opt-out. Provide a kill switch by team, match, provider, and event category.

## Consequences

- Pre-match reminders can ship before live alerts if schedule quality and permission UX pass.
- Live notifications remain blocked by provider evidence rather than roadmap pressure.
- Cross-platform consistency lives in event contracts and policy, not identical client APIs.
