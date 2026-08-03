# ADR 0002: Firebase and Google Cloud Backend

- **Status:** Accepted for Phase 0 and Phase 1
- **Date:** August 3, 2026
- **Owners:** Backend engineering and operations

## Context

Direct public Firestore writes cannot enforce one response per installation, poll windows, client versions, idempotency, provider validity, or operational policy. Chrome notifications and a future web dashboard also require a server authority. The existing project already uses Firebase client configuration, making a constrained Firebase migration the lowest-risk path.

## Decision

- Use Firebase Authentication anonymous accounts for pseudonymous installation identity.
- Use Cloud Functions for Firebase v2 on Node 22 as the public API and scheduled-job runtime.
- Use Firestore as the canonical operational store for polls, raw responses, aggregate shards, consent, and later installations or push registrations.
- Keep public Firestore access deny-by-default. Public clients use API responses; Admin SDK access is controlled by service IAM.
- Deploy production Functions in `us-west1` only after confirming the Firestore location and cross-region cost/latency implications.
- Create distinct development, staging, and production projects before Phase 1. Local emulators are not a substitute for staging.
- Use Firebase Cloud Messaging for Chrome remote notifications only after notification consent, token lifecycle, and live-provider gates pass.
- Treat Firebase web API keys as public client configuration. Store provider credentials and operational secrets in Secret Manager, never extension code or repository files.
- Add budgets, quota alerts, structured logs, error monitoring, retention settings, and least-privilege service accounts before public feature expansion.

## Data Boundary

Raw responses, anonymous UIDs, idempotency hashes, consent records, and push tokens are server-only. Public endpoints return bounded aggregate or match data. App Check may be added as an abuse signal but will not replace authenticated authorization or server validation.

## Consequences

- Firebase becomes an operational dependency and cost center requiring explicit ownership.
- The compatibility API can be deployed without a full web platform migration.
- Anonymous account deletion and abuse controls remain production requirements, not assumptions.
- A later backend migration remains possible because clients depend on versioned HTTP contracts rather than direct database layout.
