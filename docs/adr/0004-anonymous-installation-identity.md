# ADR 0004: Anonymous Installation Identity

- **Status:** Accepted for compatibility polling
- **Date:** August 3, 2026
- **Owners:** Product, backend, privacy, and security

## Context

Community polling needs better integrity than a public counter but should not require a fan to provide a name, email address, social login, or paid account. Browser storage alone cannot enforce a backend uniqueness constraint. No anonymous browser mechanism proves one unique human.

## Decision

- Create a Firebase anonymous account only when a user first invokes community polling.
- Store the anonymous UID and refresh session in extension-local storage and send the ID token only to the Matchday API.
- Key each raw poll response by poll ID and UID. A Firestore transaction accepts the first response and returns the original choice on later submissions.
- Use a client-generated idempotency key for network retries and store only its SHA-256 hash server-side.
- Describe the identity class as `anonymous_firebase_uid` internally and `anonymous installation` publicly.
- Never describe counts as verified people, unique fans, representative research, or proof of individual human identity.
- Keep legacy totals under `legacy_unverified`; start post-cutover counts under `integrity_controlled`.
- Delete raw response records after 90 days while preserving aggregate historical counts. The compatibility API provides self-service deletion of retained responses and schedules anonymous-account removal after a one-hour idempotency window.

## Abuse Model

Reinstalling, clearing data, using multiple browser profiles, or automating account creation can create additional UIDs. Minimum client version, poll windows, schema validation, quotas, rate limits, App Check signals, anomaly monitoring, and manual suppression may raise abuse cost but do not create unique-human verification.

## Consequences

- Polling remains low-friction and pseudonymous.
- Product claims must remain precise even if aggregate counts grow.
- Deletion workflows must handle raw records and anonymous accounts without promising to remove already-published aggregate history unless methodology requires recomputation.
