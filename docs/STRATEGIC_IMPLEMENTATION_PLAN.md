# Matchday Platform — Strategic Technical Implementation Plan

- **Status:** Audited direction; Phase 0 local foundation implemented, Phase 1 shared-contract foundation implemented locally, production cutover gated
- **Planning date:** August 3, 2026
- **Planning baseline:** Chrome extension v1.0.4, Manifest V3, published unlisted
- **Primary delivery order:** Chrome extension → web experience and aggregate insights → iOS much later

## 1. Executive Direction

The product should stop evolving as a client-only browser popup and become a small, privacy-conscious fan-engagement platform with multiple clients. The Chrome extension remains the first and most important client. The web experience becomes the public home, methodology surface, match archive, and aggregate insights dashboard. A native iOS app is explicitly deferred, while shared identifiers, schemas, and notification concepts are designed so iOS can be added later without rebuilding the backend.

The platform will serve Portland soccer supporters across two independently configurable team contexts:

- Portland Timbers (`timbers`)
- Portland Thorns FC (`thorns`)

The Timbers and Thorns are no longer under common ownership. RAJ Sports completed its acquisition of the Thorns in January 2024, while Merritt Paulson remains owner of the Timbers. The product may still serve both fan communities, but the architecture, data, links, consent, content, and future partnership controls must treat them as separate organizations.

The technical strategy is organized around three durable assets:

1. **A reliable matchday utility:** schedules, state-aware match cards, live scores and events, standings, form, lineups, and useful notifications.
2. **A defensible engagement dataset:** integrity-controlled one-response-per-anonymous-installation polling, consistent survey definitions, stable match identifiers, explicit consent, documented methodology, and longitudinal aggregates. This is not human identity verification.
3. **A reusable distribution platform:** one backend and one contract layer serving the extension first, the public web second, and a future iOS client later.

This plan intentionally does not include outreach, meeting strategy, acquisition speculation, or assumptions about who may notice the product. It defines the engineering work required to make the product reliable, measurable, extensible, and credible.

## 2. Current-State Audit

This section records the repository snapshot used to create the plan on August 3, 2026. It is intentionally historical; use `docs/IMPLEMENTATION_STATUS.md` for current implementation and verification state.

### 2.1 What exists and should be preserved

- A published, unlisted Manifest V3 Chrome extension at version `1.0.4`.
- A compact popup with next-match details, countdown, schedule link, and confidence poll.
- Direct schedule retrieval from an ESPN site API endpoint.
- Current three-level match fallback behavior: live provider response → local cache → bundled fixture file. The bundled season fixture is a migration input, not the target fallback.
- An hourly `chrome.alarms` refresh.
- Local vote state and a Firebase Firestore community aggregate.
- A GA4 Measurement Protocol helper that is disabled in the public build because its local configuration is not packaged.
- Jest and ESLint automation with 37 passing tests at the planning baseline.
- A Safari Web Extension conversion script that should remain supported, but must not dictate the Chrome-first delivery sequence.

### 2.2 Material limitations and immediate risks

These are prerequisites, not optional cleanup:

1. **The data model is single-team and hardcoded.** Team identity, ESPN team ID, copy, links, colors, and assets are all Timbers-specific.
2. **The current match selector cannot power a live center.** It only chooses events whose kickoff time is still in the future. Once kickoff passes, the current match is skipped rather than tracked as live.
3. **Votes are keyed by kickoff timestamp.** A schedule correction can split one real match into multiple poll records. All new data must use stable, namespaced match IDs.
4. **Firestore writes are fully open.** The existing rules permit any unauthenticated client to create, replace, or mutate vote documents. The current comment that clients can only increment by one is not enforced by the rules. Existing totals must be classified as unverified legacy data.
5. **The public build has no active product telemetry.** The analytics secret is intentionally omitted, so public usage behavior is not currently measured. A Measurement Protocol API secret must never be shipped inside the extension.
6. **The CI release artifact omits `community.js`.** The packaging workflow does not match `popup.html` dependencies and can produce an artifact without the community feature.
7. **Community behavior is untested.** `community.js` and Firestore rules are not covered by the current suite. Popup coverage also reports zero because of how the script is evaluated in tests.
8. **The ESPN endpoint is an undocumented dependency.** It is useful as a bootstrap adapter but cannot be the permanent contract exposed to clients or the sole basis for a production live-alert guarantee.
9. **The fallback schedule is manually maintained.** A bundled full-season file will inevitably age and requires a store release to update.
10. **Brand and asset provenance need review.** The current UI describes its image as a club crest. The multi-team product must use an original app identity and only use team marks when permission and asset rights are documented.
11. **README, manifest, privacy, and CI details have drifted.** Permission counts, packaged files, version references, telemetry behavior, and community storage need one release source of truth.

### 2.3 Baseline verification

At planning time:

- `npm test -- --runInBand`: 37 tests passed.
- `npm run lint`: passed.
- The Git worktree was clean before this planning artifact was created.

Passing baseline tests do not prove readiness for the proposed features. The current suite does not test data integrity, security rules, notification delivery, provider drift, consent behavior, or an installed extension in a real browser.

## 3. Product and Engineering Principles

### 3.1 User-facing principles

- The popup answers the most relevant matchday question in under two seconds from cache.
- The interface changes by match state: off-day, pre-match, lineup available, live, halftime, final, post-match, postponed, and unavailable.
- Users can follow Timbers, Thorns, or both.
- A combined view shows the next Portland match when both teams are followed; a team control always makes the active context explicit.
- Notifications are granular, reversible, and off until the user opts in at the product level.
- Data freshness and degraded states are visible. The app never labels stale data as live.
- Empty and error states provide a useful next action, such as viewing the official schedule.

### 3.2 Data principles

- Clients consume a canonical Matchday API, never provider-specific payloads.
- Stable match IDs, not timestamps, are the primary key for every poll, event, notification, and dashboard record.
- UTC timestamps are stored and transmitted; clients format them in the user's timezone.
- Every provider-derived record includes source, provider ID, observed time, source-updated time, and freshness state.
- Raw user-level records are minimized and short-lived. Longitudinal value comes from documented aggregates.
- Legacy totals collected under open Firestore rules are labeled `legacy_unverified` and never merged into the post-cutover series.
- Post-cutover responses are labeled `integrity_controlled`, meaning an authenticated anonymous Firebase installation passed server rules. They are not labeled verified fans, unique people, or representative voters.
- The methodology distinguishes observed aggregate behavior from claims about the entire fan base.

### 3.3 Platform principles

- Chrome remains the reference browser and first release target.
- Safari remains a compatibility target after each stable Chrome milestone, not a blocker for Chrome implementation.
- The backend is the authority for schedules, match state, polls, aggregate data, notification registration, and content capability flags.
- The extension remains useful with the network unavailable through a last-known-good cache and local scheduled reminders.
- After backend migration, bundled full-season fixtures are retired. A fresh install during a total outage shows an honest unavailable state and an official schedule link rather than a stale schedule presented as current.
- Provider changes occur behind adapters without requiring an emergency extension release.
- Every external write endpoint is authenticated, validated, rate-limited, and idempotent.

## 4. Target Architecture

### 4.1 Repository structure

Convert the repository into an npm-workspaces monorepo so the existing npm workflow and lockfile can be retained:

```text
apps/
  extension/        WXT + React + TypeScript Manifest V3 extension
  web/              Next.js App Router public site and internal admin
services/
  api/              Firebase Functions v2 HTTP API and scheduled jobs
  live-worker/      Bounded Cloud Run worker for live provider ingestion
packages/
  contracts/        Zod schemas, API DTOs, enums, OpenAPI generation
  domain/           Match state, poll scoring, accuracy, notification rules
  design-system/    Shared tokens and primitives; platform-specific renderers
  config/           Team, competition, feature, link, and environment config
fixtures/
  providers/        Sanitized provider payloads and event replay sequences
docs/
  adr/              Architecture decision records
  methodology/      Poll and insights methodology
```

Do not move every file at once without a parity gate. First create workspace scaffolding and shared contracts, then migrate the existing extension into `apps/extension` while preserving the published extension ID and behavior.

### 4.2 Technology decisions

#### Chrome extension

- **Framework:** WXT, Manifest V3, React, TypeScript.
- **Why:** typed entrypoints, generated manifests, Vite-based builds, browser-specific builds, test utilities, and a clean path to Chrome, Edge, Firefox, and Safari package output.
- **Chrome floor:** set `minimum_chrome_version` to `120` when the migrated extension ships, enabling the current 30-second alarm floor and later Manifest V3 service-worker improvements while retiring the outdated Chrome 102 baseline.
- **Entrypoints:** popup, background service worker, onboarding page, and options/settings page.
- **State:** explicit domain stores and browser storage adapters; no service-worker global variable is treated as durable state.
- **Styling:** shared CSS tokens plus component-scoped styles. Do not introduce a large component library into the popup.
- **Browser API:** use WXT's browser abstraction for common APIs and a small Chrome-only adapter for `chrome.gcm`.

#### Web application

- **Framework:** Next.js 16 App Router, React, TypeScript.
- **Deployment:** Vercel for preview deployments and production web delivery.
- **Rendering:** Server Components for public data pages; Client Components only for interactive charts, filters, consent controls, and admin tools.
- **Data access:** all public and admin reads and writes go through the Matchday API. Vercel holds no Firebase Admin credential and has no direct access to raw Firestore collections.
- **Admin authentication:** the operator signs in with a Firebase-supported provider. The web app sends the Firebase ID token to admin API routes; the API verifies an allowlisted account plus a custom `admin` claim on every request. Rendering `/admin` is never an authorization decision.
- **Public write boundary:** the initial website is read-only for community data. Voting remains extension-first until web voting receives its own consent, abuse, and product-scope review through the same API.
- **Caching:** explicit revalidation by data class—long for methodology and guides, short for next-match summaries, and uncached or streaming for live pages.
- **Accessibility:** every chart has a text summary and tabular equivalent.

#### Backend

- **Primary platform:** the existing Firebase/Google Cloud project family.
- **Compute:** Firebase Functions v2 for HTTP endpoints, scheduled synchronization, poll submission, aggregation, exports, token management, and the live-worker watchdog.
- **Live ingestion:** a bounded Cloud Run Job activated only around relevant matches. Prefer a provider webhook or stream when available; use controlled polling only when provider terms and quotas allow it. A Cloud Scheduler-backed watchdog runs every five minutes, checks canonical matches and Firestore leases, and invokes the job only for a match entering T-95 minutes or already live without a valid lease.
- **Notification dispatcher:** a Firebase Functions v2 event processor selects eligible registrations, snapshots deterministic batches of at most 500, and calls FCM multicast with bounded concurrency. Batch completion records let an at-least-once retry skip completed work and resume without trusting process memory.
- **Database:** Cloud Firestore for operational records and materialized aggregates.
- **Analytics warehouse:** partitioned BigQuery tables for consented product events, match-relative timing analysis, and reproducible season analysis; public summaries are materialized back to Firestore rather than querying raw analytics from a client.
- **Authentication:** Firebase Anonymous Authentication for extension installations; role-based Firebase Authentication for private admin access.
- **Push transport:** Firebase Cloud Messaging direct multicast to registration IDs obtained through `chrome.gcm`; the extension displays accepted data messages through `chrome.notifications`. FCM topic messages are not the live-alert default because FCM documents them as throughput- rather than latency-optimized.
- **Secrets:** Google Secret Manager and workload identity. No service account file, provider key, FCM credential, or analytics secret enters a client bundle.
- **Region:** west-US services where available, after confirming the existing Firestore database region. Do not attempt an in-place database-region migration as part of feature work.

### 4.3 Runtime data flow

```text
Sports data provider(s)
         │
         ▼
Provider adapter → canonical validator → Firestore
         │                    │             │
         │                    │             ├── materialized public aggregates
         │                    │             ├── polls and integrity-controlled responses
         │                    │             └── installations and preferences
         │                    │
         │                    └── event diff and notification decision engine
         │                                           │
         │                                           ▼
         │                                      FCM / chrome.gcm
         │                                           │
         ▼                                           ▼
Matchday HTTP API ────────────────► Chrome extension service worker
         │                                      │
         │                                      ├── local cache
         │                                      ├── reminder alarms
         │                                      └── system notifications
         │
         ├── consented event ingestion ───────► BigQuery
         │                                           │
         │                                           └── scheduled aggregate jobs
         ▼
Next.js web app ── public pages, insights, methodology, private operations
```

### 4.4 Environments

Create three isolated environments:

| Environment | Purpose | Firebase/GCP | Web | Extension |
|---|---|---|---|---|
| Local | Fast development | Emulator Suite | Local Next.js | Unpacked dev build |
| Staging | Integration and match replay | Separate staging project | Vercel preview/staging domain | Separate unpacked/staging extension ID |
| Production | Public users | Production project | Production domain | Existing Chrome Web Store listing |

Production data must never be used as the default local development database. CI uses emulators and sanitized provider fixtures.

## 5. Canonical Domain Model

### 5.1 Core identifiers

- `teamId`: internal stable slug such as `timbers` or `thorns`.
- `competitionId`: internal stable slug plus season configuration.
- `matchId`: internal immutable ID. Provider IDs such as `espn:401234567` live in an alias table so a provider change or corrected provider identifier does not change the canonical key.
- `matchEventId`: provider event ID or deterministic hash of match, type, sequence, team, player, and source revision.
- `pollId`: `{matchId}:{pollType}:{version}`.
- `installationId`: server-created identifier bound to one anonymous Firebase UID. Reinstallation or cleared extension storage can create a new UID and installation.
- `notificationEventId`: deterministic ID used for deduplication across ingestion retries and devices.

### 5.2 Team and competition configuration

Team behavior must be data-driven:

```ts
type TeamConfig = {
  id: 'timbers' | 'thorns';
  displayName: string;
  shortName: string;
  timezone: 'America/Los_Angeles';
  providerRefs: Record<string, string>;
  competitionIds: string[];
  officialLinks: {
    home: string;
    schedule: string;
    tickets: string;
    shop?: string;
  };
  capabilities: {
    liveEvents: boolean;
    lineups: boolean;
    injuries: boolean;
    standings: boolean;
    playerVoting: boolean;
  };
};
```

Visual tokens and original app artwork may vary by team context, but official club marks must not be embedded without documented permission.

### 5.3 Match record

The canonical match record includes:

- Stable match and provider identifiers.
- Team, opponent, home/away/neutral status, competition, round, and season.
- `kickoffAt` in UTC and source timezone metadata.
- Venue, city, and broadcast labels when available.
- State enum: `scheduled`, `delayed`, `postponed`, `cancelled`, `pre_match`, `live_first_half`, `halftime`, `live_second_half`, `extra_time`, `penalties`, `final`, `abandoned`.
- Score, period, clock label, and winner/result.
- Lineup publication time and lineup completeness.
- Data source, source revision, observed time, and freshness class.
- Official schedule, ticket, stream, and match-center links where allowed.

Client logic must never infer `live` solely from kickoff time. It uses canonical status and freshness.

### 5.4 Match events and corrections

Supported normalized events:

- Goal, own goal, penalty goal, and penalty miss.
- Yellow card, second yellow, and red card.
- Substitution.
- Lineup published.
- Kickoff, halftime, second-half kickoff, extra time, penalties, final.
- Score correction or event retraction.

Provider event updates are versioned. A goal removed after VAR does not create a second contradictory event; the original event is marked retracted and a correction notification is considered only when the user would otherwise retain incorrect information.

### 5.5 Poll definitions

Do not overload one poll to answer multiple research questions.

1. **Pre-match confidence:** five-point scale, asking confidence in the team's prospects. Open from T-72 hours through kickoff.
2. **Community result call:** Win / Draw / Loss. Open from T-72 hours through kickoff. This, not the confidence score, powers the accuracy tracker.
3. **Post-match reaction:** five-point scale, asking reaction to the performance. Open at final whistle for 48 hours.
4. **Player of the Match:** one eligible player from the confirmed match lineup or participation list. Open at final whistle for 48 hours.

Each definition includes wording version, open/close time, valid choices, eligibility rules, minimum sample threshold, and methodology label.

Pre-match confidence and post-match reaction are separate measures. They may be charted together, but the system must not describe their difference as a scientifically equivalent pre/post delta without validated survey wording.

### 5.6 Poll response integrity

- The extension signs in anonymously only when a network-backed feature is first used.
- Poll submission goes through a backend endpoint with a verified Firebase ID token.
- The server validates poll state, match state, choice, client version, and one-response-per-UID rule.
- Response creation is idempotent. A retry returns the existing response instead of incrementing again.
- Before submission, the poll UI states that the response is tied to an anonymous installation, contributes to a public aggregate, and is not treated as a verified unique person.
- Public clients can read only materialized aggregate documents.
- Raw response documents are server-only and are deleted 90 days after the match after aggregates and audit checks are complete.
- Anonymous authentication reduces casual duplication but is not represented as identity verification. Reinstalling can create a new anonymous identity, so abuse monitoring and rate limits remain necessary.
- The accurate claim is “one accepted response per anonymous Firebase UID and poll,” not “one person, one vote.”

### 5.7 Aggregate metrics

- **Confidence Index:** mean of five-point responses normalized to 0–100, with `n` and distribution.
- **Reaction Index:** same normalization, reported separately from confidence.
- **Community Accuracy:** the share of eligible matches where the plurality W/D/L call matches the official result. Ties and matches below the sample threshold are excluded and shown as such.
- **Participation:** accepted response count by poll and match, with the anonymous-installation methodology disclosed.
- **Player of the Match:** vote distribution and winner, only when a confirmed eligible player list exists.
- **Timing distribution:** opted-in opens grouped into match-relative buckets, not browsing behavior.
- **Regional engagement:** opted-in coarse region counts with minimum cohort suppression.

All public metrics show denominator, time range, last updated time, and methodology link.

Aggregate writes use one decided mechanism:

- The server hashes the anonymous UID into one of 32 deterministic shards per poll.
- One Firestore transaction creates the immutable response document and increments its shard. If the response already exists, the transaction returns it and performs no increment.
- Public clients read a materialized roll-up document, never all shards or raw responses.
- A scheduled repair recomputes every open or recent poll from raw responses, corrects shard and roll-up drift, and records reconciliation status before raw-response expiration.
- The initial load test validates whether 32 shards meet the 500-concurrent-submission target; changing the shard count requires a versioned migration rather than an ad hoc production edit.

## 6. API and Contract Surface

Publish an OpenAPI 3.1 contract generated from the shared Zod schemas. The first stable API is `/v1`. Breaking changes require a new version or an additive migration window.

The current local foundation implements `GET /v1/config`, `GET /v1/teams`, `GET /v1/teams/{teamId}`, and `GET /v1/matches/next?teamId=` against shared Zod contracts. These are additive foundation routes, not a claim that the complete target surface below is deployed. OpenAPI generation, richer match queries, canonical poll aggregates, and the remaining target routes stay in the backlog.

### 6.1 Read endpoints

```text
GET /v1/config
GET /v1/teams
GET /v1/teams/{teamId}/overview
GET /v1/teams/{teamId}/standings
GET /v1/teams/{teamId}/form
GET /v1/matches?teamId=&from=&to=&status=
GET /v1/matches/{matchId}
GET /v1/matches/{matchId}/events?after=
GET /v1/matches/{matchId}/lineups
GET /v1/polls/{pollId}/aggregate
GET /v1/insights/season?teamId=&season=
GET /v1/insights/matches/{matchId}
GET /v1/guides/providence-park
```

`/v1/config` exposes capabilities, minimum client version, maintenance state, official links, and feature flags. It contains no secrets.

### 6.2 Write endpoints

```text
POST  /v1/installations
PATCH /v1/installations/{installationId}/preferences
DELETE /v1/installations/{installationId}
DELETE /v1/installations/me
POST  /v1/installations/{installationId}/push-token
DELETE /v1/installations/{installationId}/push-token
POST  /v1/polls/{pollId}/responses
POST  /v1/telemetry/events
```

The compatibility client uses `/v1/installations/me` so the anonymous UID does not appear in request URLs. Deleting an installation requires its current Firebase ID token and starts the deletion behavior in Section 9.7. It is idempotent and returns a deletion receipt without exposing which historical records existed.

### 6.3 Admin endpoints

```text
GET   /v1/admin/health
GET   /v1/admin/reconciliations?status=
POST  /v1/admin/matches/{matchId}/reconcile
PATCH /v1/admin/config/capabilities
POST  /v1/admin/exports
```

Every admin endpoint requires a valid Firebase ID token, allowlisted operator account, custom `admin` claim, recent authentication for destructive actions, and an immutable audit event. There is no browser-to-Firestore admin path.

### 6.4 Request and response rules

- JSON only, validated at the edge of each handler.
- Firebase ID token required for every installation, preference, token, deletion, poll, telemetry, and admin write.
- Idempotency key required for poll submission and push-token registration.
- ISO 8601 UTC timestamps in responses.
- Standard problem-details error shape with a stable machine code and safe user message.
- Request IDs in logs and responses.
- `X-Client-Platform` and `X-Client-Version` headers for compatibility decisions.
- CORS allowlist for the production web origin and installed extension origin; staging is separate.
- Cache headers by endpoint; live data is short-lived, historical aggregates are longer-lived.
- Rate limits by anonymous UID, installation, and endpoint class. If network-level abuse controls need an IP risk bucket, derive a daily rotating HMAC with a Secret Manager key, retain it for no more than 24 hours, and never write raw IP addresses or the bucket to product analytics.

## 7. Data Provider Strategy

### 7.1 Provider abstraction

No client imports ESPN field names or URLs after the backend migration. Every provider implements the same adapter interface:

```ts
interface SoccerProvider {
  getSchedule(teamRef: string, season: string): Promise<ProviderMatch[]>;
  getMatch(matchRef: string): Promise<ProviderMatch>;
  getEvents(matchRef: string): Promise<ProviderEvent[]>;
  getLineups(matchRef: string): Promise<ProviderLineup | null>;
  getStandings(competitionRef: string): Promise<ProviderStanding[]>;
  getRoster(teamRef: string): Promise<ProviderPlayer[]>;
}
```

Each adapter validates the remote payload before normalization. Malformed payloads fail closed and preserve the last-known-good canonical record.

Provider alias reconciliation is conservative. Team, opponent, competition, venue, and kickoff proximity may produce a merge candidate, but they do not automatically merge uncertain records. Ambiguous provider-ID changes, duplicate fixtures, and reschedules enter operator review; every accepted alias preserves source evidence and an audit timestamp.

### 7.2 Decision gate before live alerts

The current ESPN site API may remain the schedule bootstrap adapter. It must not become the production live-alert dependency by inertia.

Run a provider evaluation against actual Timbers and Thorns matches. Candidate categories include the current ESPN feed, API-Football or Sportmonks for an affordable beta, and enterprise providers such as Sportradar or Stats Perform when licensing and cost justify them.

Weighted evaluation:

| Criterion | Weight | Minimum gate |
|---|---:|---|
| Timbers and Thorns competition coverage | 25% | Current regular season and relevant cups |
| Live event latency and correction quality | 20% | Median under 30 seconds in replayed observations |
| Lineup and player coverage | 15% | Confirmed lineups and stable player IDs |
| Schedule, standings, form, history | 10% | Stable IDs and full current season |
| Reliability and support | 10% | Documented limits and incident path |
| Redistribution and push-notification rights | 15% | Written terms allow intended display, player data, public aggregates, and alerts |
| Cost and quota fit | 5% | Predictable at 500, 5,000, and 50,000 users |

No goals, cards, substitutions, lineup alerts, injury alerts, or player voting should be generally enabled for a team whose provider capability has not passed the gate.

### 7.3 Ingestion cadence

- Schedule and standings: every 15 minutes on matchdays, hourly otherwise.
- Pre-match record: every five minutes from T-90 minutes until kickoff.
- Live match: provider webhook/stream when available; otherwise bounded 15–30 second polling by the live worker.
- Final reconciliation: at final, +5 minutes, +30 minutes, and next day to capture corrections.
- Roster: daily in season and on lineup publication.

The live-worker control loop is concrete:

1. A Cloud Scheduler-backed Firebase watchdog runs every five minutes.
2. It finds matches entering T-95 minutes or still canonical-live and atomically checks a per-match Firestore lease.
3. If no valid lease exists, it invokes a Cloud Run Job with `matchId`, provider capability version, and a bounded execution deadline.
4. The job acquires and refreshes the lease, ingests every 15–30 seconds, and exits on final state, cancellation, lease loss, provider kill switch, or five-hour maximum runtime.
5. A later watchdog invocation replaces a stale execution; idempotent event IDs and notification IDs make replacement safe.
6. Final reconciliation runs independently at final, +5, +30, and next day so a worker exit cannot prevent corrections.

Set job maximum instances, provider request ceilings, and project budget alerts before staging live replay. All jobs use least-privilege service identities, Secret Manager, distributed leases, and idempotent upserts. Scheduler overlap must not duplicate events or notifications.

### 7.4 Degraded behavior

- Provider unavailable outside match: serve last-known-good data with age.
- Provider unavailable live: retain last known score, label updates delayed, stop event notifications after freshness threshold.
- Conflicting providers: primary wins until reconciliation; log the difference for admin review.
- Postponed/cancelled match: cancel local reminders and suppress poll windows until disposition is known.
- Short kickoff delay on the same match date: update the stable match record, extend the same poll version, and reconcile alarms.
- Postponement to another date or a change greater than 24 hours: freeze the old pre-match poll as `voided`, retain its aggregate for audit, exclude it from the active prediction and accuracy series, and create a new poll version for the rescheduled match.

## 8. Chrome Extension Product Architecture

### 8.1 Popup information hierarchy

1. Active team or combined Portland context.
2. Current match state and score, or next match and countdown.
3. Highest-value action for the current state.
4. Compact event or form summary.
5. Relevant poll.
6. Official schedule, tickets, or match-center link.

The popup should not attempt to show every feature at once. Match state determines which modules render.

### 8.2 Match-state behavior

| State | Primary content | Engagement content |
|---|---|---|
| Off-day | Next match, standings, last five | Season confidence trend teaser |
| T-72h to T-90m | Opponent preview, countdown | Confidence and W/D/L call |
| T-90m to kickoff | Lineup state, broadcast, countdown | Final pre-match poll prompt |
| Live | Score, clock, key events | No new pre-match responses |
| Halftime | Score and first-half events | Read-only community call summary |
| Final to +48h | Final score and key events | Reaction and Player of the Match |
| Later post-match | Result, form, next match | Aggregate results and trend |
| Delayed/postponed | Official status and refreshed time | Polls paused |

### 8.3 Team selection

- Onboarding asks users to follow Timbers, Thorns, or both.
- The popup remembers the last explicit team context.
- A combined context ranks live matches first, then the nearest kickoff.
- Notification preferences are independently configurable per team.
- Team selection never changes the user's analytics or regional consent.

### 8.4 Storage schema

Use a versioned storage document instead of scattered ad hoc keys:

```ts
type ExtensionStorageV2 = {
  schemaVersion: 2;
  followedTeams: TeamId[];
  activeTeam: TeamId | 'combined';
  notificationPreferences: NotificationPreferences;
  consent: ConsentState;
  lastKnownMatches: Record<string, CachedMatch>;
  pendingTelemetry: TelemetryEvent[];
  installation: {
    id?: string;
    authUid?: string;
    pushRegisteredAt?: string;
  };
};
```

Migrations are deterministic, tested, and never erase existing user preferences without an explicit reason.

### 8.5 Notifications

#### Notification types

- 24 hours before kickoff.
- 1 hour before kickoff.
- Lineup published.
- Kickoff.
- Goal for either side.
- Halftime.
- Final result.
- Post-match reaction and Player of the Match prompt.

Each team and notification type has a toggle. A master toggle disables registration and cancels local alarms.

#### Delivery layers

1. **Local scheduled reminders:** the extension creates and reconciles `chrome.alarms` from canonical fixtures for 24-hour, 1-hour, kickoff, and a post-match fallback check. These continue to work if FCM is temporarily unavailable.
2. **Server live messages:** after authenticated token registration, the backend selects active registration IDs by team and enabled event type. A notification dispatcher snapshots deterministic server-only batches of at most 500 targets and sends data-only FCM multicast messages with bounded concurrency for lineup, kickoff, goals, halftime, corrections, final, and the post-match prompt.
3. **System presentation:** the background worker validates the event, checks preferences, fetches canonical state when necessary, deduplicates, and calls `chrome.notifications.create`.

#### Reliability rules

- Notification ID is deterministic: `{teamId}:{matchId}:{eventType}:{eventId}`.
- Received IDs are retained locally long enough to survive service-worker restarts.
- FCM payloads contain identifiers and revisions, not trusted display HTML.
- Registration tokens are uploaded only after explicit notification opt-in.
- Server-side preferences narrow fanout; the extension checks local preferences again before presentation as defense in depth. Preference and token mutations are authenticated, idempotent, and retried safely.
- If the master notification control is disabled, the extension cancels local alarms and unregisters the push token. Disabled or stale registration IDs are excluded from all dispatch snapshots.
- Each batch has a deterministic event/batch ID, completion state, bounded concurrency, retry with exponential backoff and jitter, and an event-specific expiration so a late retry cannot create a stale sports alert.
- Invalid tokens are deleted server-side immediately after an FCM invalid-registration response.
- Alarm reconciliation runs on install, update, browser startup, preference change, fixture update, and a daily repair alarm.
- Local alarms are best-effort: Chrome does not wake a sleeping device, so a missed alarm may run only after wake. Every alarm handler first fetches or reads canonical state and drops stale 24-hour, 1-hour, and kickoff reminders instead of presenting them after their useful window.
- The local post-match fallback runs at approximately T+135 minutes, checks canonical state, and presents only if the match is final; otherwise it schedules a bounded recheck. The server final event is the primary trigger.
- Local and FCM versions of kickoff and post-match events use the same deterministic notification ID so only one system notification is shown.
- Notification clicks open the canonical web match page or an extension page without requesting browsing-history access.
- Chrome uses the operating system's notification sound. Custom goal-horn sounds are not promised for the Chrome extension.
- Ticket, merchandise, sponsorship, and promotional messages are never sent as system notifications.

### 8.6 Standings, form, and opponent preview

- Standings are competition-aware and never hardcode a playoff line across leagues or seasons.
- Each competition adapter exposes rank, matches played, points, goal difference, and an explicitly configured postseason threshold so the UI can calculate points above or below the current line without assuming MLS and NWSL use the same rules.
- Last-five form is computed from final canonical matches and shown as W/D/L with opponent and home/away available on expansion.
- Opponent preview uses objective provider-backed values: position, last five, goals for/against, and top scorer when available.
- “Key player” is defined by an explicit data rule, not editorial guesswork.
- Injury status remains disabled until a licensed, reliable source and clear status vocabulary are available. Do not scrape or distribute rumors.

### 8.7 Providence Park, tickets, and commerce links

- Stadium guide content starts as version-controlled structured content reviewed against official public sources.
- Guide modules cover transit and bicycle access, parking constraints, gates and entry timing, accessibility services, current bag/security rules, family services, concessions, and official stadium contacts. Every operational fact has a source URL, checked date, owner, and expiration/review date.
- Extension shows a concise guide summary and opens the web guide for full detail.
- Ticket and shop buttons always use team-specific official destinations.
- Click measurement occurs only under analytics consent and is stored as aggregate product behavior.
- “Merch moments” are contextual in-product cards based only on team and canonical result, controlled by server configuration, frequency capped, and never represented as official or sponsored unless an agreement exists.
- Commerce cards never use extension user data for personalization, retargeting, paid placement, or sponsor segmentation, and they are never delivered as notifications.

### 8.8 Safari compatibility boundary

WXT keeps a Safari package path, but Safari feature parity is not a Chrome release gate. The Chrome-only `chrome.gcm` adapter is excluded from Safari builds. Safari receives local reminder support only after its alarm, background-runtime, permission, and notification behavior pass installed Safari tests; live push remains disabled until a separately selected and tested Safari-compatible transport exists. Chrome-specific capabilities must fail closed behind platform capability flags rather than leaving broken settings visible.

## 9. Engagement and Insights System

### 9.1 Sentiment history

For each match, publish:

- Pre-match confidence distribution and normalized index.
- Post-match reaction distribution and normalized index.
- Accepted response counts, explicitly described as anonymous-installation responses.
- Result, home/away, opponent, scoreline, and competition.
- Data source and methodology version.

Season views can correlate indices with outcomes and context, but must label correlation as descriptive and avoid causal claims.

### 9.2 Accuracy tracker

- Use only the W/D/L result-call poll.
- The community call is the unique plurality choice.
- A tied plurality is “no call,” not an incorrect call.
- Matches below the minimum response threshold are excluded.
- Publish season accuracy, last-5, last-10, and full-history records with exact eligible-match counts.
- Lock predictions at kickoff and reconcile result only from canonical final state.

### 9.3 Player of the Match

- Eligible choices come from confirmed starters and substitutes who played, when participation data is available.
- If confirmed participation data is unavailable, hide the vote rather than offering a stale roster.
- One accepted response per anonymous UID and poll.
- Results display only after voting or poll close, according to the selected anti-bias rule; use the same rule for every match.
- Aggregate player trends are secondary and require sufficient matches and votes.

### 9.4 Match-day timing behavior

Passive usage analytics require explicit consent. The only captured open behavior is the extension's own surface activity—never visited tabs, URLs, page content, or browsing history.

Events are transformed into match-relative buckets:

- More than 24 hours before kickoff.
- T-24h to T-6h.
- T-6h to T-90m.
- T-90m to kickoff.
- First half.
- Halftime.
- Second half.
- Final to +2h.
- +2h to +48h.

Store raw consented events for 90 days, then retain only daily and match-level aggregates.

An optional social-activity comparison is a later analysis module, not extension tracking. It may ingest timestamped activity from lawful APIs, licensed datasets, or exports from accounts the operator controls, normalize it into the same match-relative buckets, and compare it with opted-in extension engagement. It must not scrape restricted services, access users' social accounts, or imply causation from a timing correlation.

### 9.5 Coarse regional engagement

Regional analytics are a separate opt-in from product analytics.

- Do not request Chrome's geolocation permission.
- Prefer a voluntary, self-reported coarse region selection that directly powers a visible community map, for example Portland metro, another Oregon region, Washington, another U.S. region, or outside the U.S.
- Make “prefer not to say” the default and allow the response to be removed.
- Never store precise latitude, longitude, street, or full postal code.
- Do not infer region from IP address or persist raw IP addresses as analytics fields.
- Aggregate region counts during ingestion and avoid long-lived user-to-region records.
- Store the current coarse region only in the server-only installation record while region consent remains active, for at most the installation retention period. Revocation transactionally removes that installation from the current map aggregate and deletes the region field.
- The first community map is a current opted-in distribution, not an immutable historical regional series; this keeps withdrawal and deletion technically enforceable.
- Suppress public region cells with fewer than 20 opted-in installations.
- Label the map as opted-in user distribution, not total fan distribution.
- Audit infrastructure logs, retention, and redaction because hosting platforms may log request IPs independently of application fields.
- Treat automatic IP-derived geography as out of scope unless a later Chrome Web Store policy and legal review confirms it is proportionate to a prominently disclosed user-facing feature.

### 9.6 Consent model

Consent is granular and versioned:

| Consent | Default | Effect |
|---|---|---|
| Community submissions | Action-specific | Sending a vote submits that explicit response |
| Notifications | Off | Registers push token and schedules selected reminders |
| Anonymous product analytics | Off | Sends allowlisted extension interaction events |
| Coarse community region | Off / unset | Sends a voluntary coarse region that powers the public community map |

Users can change consent from the options page. Revocation stops future collection immediately, unregisters push when applicable, and records only the minimum revocation state required to honor the choice.

The vote action itself includes a just-in-time disclosure of the submitted choice, anonymous-installation identifier, aggregate publication, and retention. Passive analytics and coarse region remain separate opt-ins and are never bundled into voting or notifications.

### 9.7 Retention and publication

- Raw poll responses: delete 90 days after match.
- Raw opted-in usage events: delete after 90 days.
- BigQuery raw-event partitions: enforce a 90-day table expiration; retain only documented aggregate tables after expiration.
- Invalid FCM tokens: delete immediately; inactive tokens reviewed after 90 days.
- Inactive installation records: delete or fully anonymize after 180 days without activity.
- Authenticated deletion requests remove the caller's raw poll responses, raw analytics events still within retention, installation, push registration, consent, and current-region contribution; published aggregate counts are recomputed where removal could change a displayed threshold.
- Match, event, and aggregate insight records: retain as historical product data.
- Public match insights: minimum 10 accepted anonymous-installation responses.
- Public regional cell: minimum 20 opted-in installations.
- CSV exports include aggregate rows only by default.

## 10. Web Experience

### 10.1 Routes and sequencing

A minimal compliance and destination website ships during Phase 1, before notifications or passive analytics. It includes `/`, `/matches/[matchId]`, `/privacy`, `/support`, `/methodology`, `/data-sources`, and `/status`. These pages can begin as concise, server-rendered surfaces, but they must be production-hosted, monitored, linked from the extension and Chrome Web Store listing, and accurate for the behavior in each release.

Phase 6 expands that foundation into the complete product and insights route set:

```text
/                         Product home and current Portland match context
/timbers                  Timbers schedule, form, and current insights
/thorns                   Thorns schedule, form, and current insights
/matches/[matchId]        Match center and aggregate engagement results
/insights                  Season dashboard
/guide/providence-park    Stadium guide
/methodology              Survey, accuracy, consent, and sample methodology
/data-sources             Provider and freshness disclosures
/privacy                  Current privacy policy and retention
/support                  Support, deletion, and incident contact paths
/status                   Data-source and platform status
/admin                    Private operations surface
```

### 10.2 Public dashboard

The first dashboard contains:

- Total accepted anonymous-installation responses by season and team.
- Confidence and reaction index timelines with sample sizes.
- Community W/D/L accuracy.
- Top-engaged matches.
- Player of the Match results.
- Match-relative engagement timing for opted-in users.
- Coarse regional distribution when thresholds are met.
- Data coverage, methodology version, freshness, and last updated timestamp.

Every visualization must provide a table and downloadable aggregate CSV. No public endpoint exposes anonymous UID, installation ID, FCM token, raw timestamp trail, or raw region linkage.

### 10.3 Private operations surface

The admin is initially for the product operator, not a partner portal. It includes:

- Provider health and freshness.
- Match and event reconciliation.
- Notification send counts, failures, and deduplication.
- Poll response and aggregate consistency checks.
- Capability and content flags.
- Official link validation status.
- Aggregate CSV export.
- Data deletion and retention job status.

Future read-only partner roles can be represented through Firebase custom claims without exposing raw data, but must not be activated until Chrome Web Store policy, privacy, disclosure, and consent requirements for external data access are reviewed.

The web runtime never receives a Firebase Admin credential. `/admin` obtains a Firebase ID token through operator sign-in and calls the Matchday API; the API independently enforces the operator allowlist and custom `admin` claim. Raw operational records remain backend-only.

### 10.4 Visual-system planning boundary

Visual design is a separate implementation workstream after the architecture foundation. It must produce an original umbrella identity suitable for Timbers and Thorns contexts without copying either club's trade dress.

Technical requirements for that future system:

- Original product mark and full icon set.
- Documented asset provenance.
- Team context expressed through restrained, configurable accents rather than copied crests.
- Shared design tokens across extension and web.
- Data typography optimized for scores, clocks, standings, and compact charts.
- Responsive behavior from the 380px extension popup through desktop dashboard.
- Keyboard focus, reduced motion, contrast, zoom, and screen-reader acceptance tests.

## 11. Phased Implementation Roadmap

Effort ranges assume one primary engineer and exclude store-review latency, provider contracting, and full visual-identity production.

### Phase 0 — Integrity and provider proof (1–2 engineering weeks, plus a minimum 30-day legacy migration grace)

**Goal:** remove data-integrity hazards and prove the foundations before adding surface area.

Deliverables:

- Export current totals before any rule change and label the snapshot `legacy_unverified`; never merge it into the integrity-controlled series.
- Deploy temporary hardened legacy rules that allow only the existing vote fields and a write whose resulting document increments exactly one choice by one. Firestore rules validate the resulting document, not whether the client used a transform. This limits arbitrary replacement but does not make legacy totals trustworthy or stop repeated clients.
- Ship a small compatibility release before the monorepo migration that uses Firebase anonymous auth and a backend submission endpoint while preserving the existing popup behavior.
- Keep legacy reads available during a documented minimum 30-day auto-update grace. Then deny every public write to the legacy collection; old releases continue local voting and community reads but show sync unavailable rather than pretending the aggregate write succeeded.
- Start all post-cutover metrics in a separate `integrity_controlled` namespace and enforce a server minimum client version for that endpoint.
- Create separate development, staging, and production Firebase configuration.
- Establish budget alerts, secret storage, logging retention, and emulator configuration.
- Write ADRs for monorepo, Firebase/GCP backend, provider adapters, anonymous identity, notifications, and consent.
- Build provider spike scripts and replay fixtures for one Timbers and one Thorns match.
- Choose the bootstrap provider for schedule/standings and decide whether any candidate passes the live-alert gate.
- Correct release packaging so every referenced runtime file is included and no secret/local file is included.

Exit gate:

- Hardened legacy rules and their exact one-field resulting `+1` behavior pass emulator tests before the compatibility release.
- The compatibility release submits authenticated, idempotent responses through the backend.
- After the grace window, unauthenticated direct vote mutation is denied in production and confirmed by a packaged legacy-client test.
- Legacy releases degrade visibly and safely after cutover; no migration step depends on passive analytics consent.
- Provider scorecard is complete with terms and coverage evidence.
- CI-built extension package passes a manifest/resource/secret inventory check.

### Phase 1 — Shared platform foundation and parity (2–4 weeks)

**Goal:** establish the target codebase without changing the user's core experience.

Deliverables:

- Add npm workspaces and the target package layout.
- Create Zod contracts, canonical match model, API error model, and OpenAPI generation.
- Implement Firebase anonymous-auth bootstrap and authenticated API client.
- Implement team, match, config, and poll aggregate read endpoints.
- Deploy the minimal web foundation at the production domain: home, match destination, privacy, support, methodology, data sources, and status.
- Migrate the extension to WXT + React + TypeScript with functional parity.
- Raise and document the production Chrome minimum from 102 to 120; test the update path for existing installations.
- Replace direct ESPN and Firestore calls in the extension with the Matchday API.
- Add versioned extension storage and migrations.
- Add emulator-backed rules tests, provider contract tests, extension unit tests, and installed-extension Playwright smoke tests.
- Expand CI to typecheck, lint, unit test, emulator test, build web, build extension, package, and inspect artifacts.

Exit gate:

- Existing Timbers next-match and poll-read experience is preserved.
- Every notification click destination, privacy disclosure, support path, and methodology link required by later phases is already live.
- Popup cached render meets the performance budget.
- No provider or server secret appears in the built extension.
- Staging and production are isolated.
- The same contract package validates API responses and extension consumption.

### Phase 2 — Thorns and multi-team release (2–3 weeks)

**Goal:** make the first major user-visible release a Portland soccer platform.

Deliverables:

- Add Thorns team and competition adapters using stable provider IDs.
- Add followed-team onboarding, combined context, team switcher, and per-team official links.
- Make schedule, cache, poll definitions, and match cards team-agnostic.
- Add capability flags so unavailable NWSL or MLS fields disappear cleanly.
- Replace single-club hardcoded copy and review all icon/mark usage.
- Update store listing, privacy disclosures, screenshots, and support documentation.
- Preserve the existing Chrome Web Store listing and extension ID.

Exit gate:

- Timbers-only, Thorns-only, and both-team user paths pass browser tests.
- Schedule accuracy is verified against official club schedules for the next five fixtures per team.
- Team switching cannot mix polls, links, cached matches, or notifications.
- No unsupported feature is shown for a team.

### Phase 3 — Notification foundation (2–3 weeks)

**Goal:** deliver reliable opt-in scheduled reminders and establish the live-push transport.

Deliverables:

- Add onboarding and settings controls for notification consent and per-team event types.
- Add required Manifest V3 notification and GCM capabilities with a store-update test plan.
- Implement alarm reconciliation and local 24-hour, 1-hour, kickoff, and post-match reminders.
- Implement `chrome.gcm` registration, authenticated token storage, rotation, unregistration, and invalid-token cleanup.
- Implement preference-targeted registration-ID multicast in batches of at most 500 with deterministic dispatch records, bounded direct concurrency, resumable retries, and client-side preference defense in depth.
- Implement FCM test messages and background notification presentation.
- Add deterministic deduplication, click handling, and notification analytics under consent.
- Add staging tools to simulate reschedules, postponements, and repeated messages.
- Add stale-alarm suppression and the canonical-final post-match fallback check.
- Keep the Safari build free of `chrome.gcm`; do not expose unsupported live-push controls in Safari.

Exit gate:

- Opted-out users register no push token and receive no reminders.
- Rescheduled or postponed fixtures update or cancel every old alarm.
- Duplicate FCM delivery produces one system notification.
- A sleeping-device replay never presents a stale pre-match reminder, and local/FCM overlap never presents duplicate kickoff or post-match notifications.
- Service-worker restart does not lose preferences or dedupe state.
- No notification contains promotional ticket, merchandise, or sponsor content.

### Phase 4 — Live match center and event alerts (3–5 weeks)

**Goal:** make the extension useful during the match.

Prerequisite: the selected provider has passed the live coverage and rights gate.

Deliverables:

- Implement live-worker activation, locking, polling or stream handling, and final reconciliation.
- Add canonical score, clock, status, event, and correction processing.
- Add lineup publication, starters/substitutes, and lineup alert when supported.
- Add live popup states, key event timeline, delayed-data state, and final transition.
- Enable goal, halftime, final, correction, and lineup FCM messages.
- Add standings, last-five form, and objective opponent preview.
- Add provider health dashboards and freshness alerts.

Exit gate:

- Complete staged replay suites cover duplicate goals, VAR reversal, cards, substitutions, halftime, final, delay, postponement, and provider outage.
- Observe at least three real matches in each enabled competition before general live-alert release.
- Median provider-to-backend event latency and backend-to-FCM send latency meet the defined SLO.
- A stale live feed is visibly labeled and stops generating events.

### Phase 5 — Integrity-controlled engagement engine (3–4 weeks)

**Goal:** turn polling into a defensible season dataset.

Deliverables:

- Launch versioned five-point pre-match confidence and post-match reaction polls.
- Launch the separate W/D/L community result call.
- Launch Player of the Match when confirmed participation is available.
- Enforce one accepted response per anonymous UID and poll without claiming one human per UID.
- Implement the decided 32-shard transactional aggregate path and consistency repair jobs.
- Compute confidence, reaction, participation, and accuracy aggregates.
- Add minimum-sample behavior and methodology disclosures.
- Add explicit product-analytics and coarse-region consent.
- Add retention and deletion jobs.

Exit gate:

- Duplicate and concurrent submissions are idempotent under load.
- Rules and API tests prove clients cannot read raw responses or write aggregates.
- Accuracy excludes tied calls, insufficient samples, and non-final matches.
- Consent changes stop future passive collection immediately.
- Legacy unverified totals remain visibly separate.
- Public wording, API fields, exports, and charts use `acceptedResponses` or `integrityControlledResponses`, never “verified fans” or “verified votes.”

### Phase 6 — Public website and insights launch (3–5 weeks)

**Goal:** expand the already-live compliance foundation into a professional product home and transparent aggregate data surface.

Deliverables:

- Expand the Next.js foundation with team pages, full match centers, insights, the guide, and operator admin; refine the existing home, methodology, data-sources, privacy, support, and status routes.
- Add accessible aggregate charts, tables, filters, and CSV downloads.
- Add the Providence Park guide and official team-specific ticket links.
- Add public data freshness and sample-size disclosures.
- Add private operator admin for health, reconciliation, flags, and exports.
- Complete responsive, accessibility, metadata, social-card, performance, and browser QA.

Exit gate:

- Public pages expose aggregate data only.
- Every chart has a table and understandable no-data state.
- Privacy policy, Chrome Web Store disclosure, runtime behavior, and methodology agree.
- Web performance and accessibility budgets pass on mobile and desktop.
- Production domain monitoring, backups, and rollback procedures are active.

### Phase 7 — Partnership-ready operations and refinement (2–4 weeks)

**Goal:** make the system easy to operate, audit, and demonstrate without manual data repair.

Deliverables:

- Add scheduled aggregate exports and reproducible season reports.
- Add the optional external social-activity timeline importer only when a lawful, sustainable data source is available; keep its results descriptively labeled and methodologically separate from extension telemetry.
- Add data-quality scorecards, coverage gaps, and source revision history.
- Add schema-ready read-only role support for possible future external viewers without activating third-party access or exposing raw records.
- Add content approval and link-expiration workflows for guides, tickets, and contextual commerce cards.
- Add notification delivery summaries and preference adoption reporting.
- Complete incident runbooks for provider outage, bad score, duplicate alerts, compromised key, privacy request, and store rollback.

Exit gate:

- A season insight export can be regenerated from canonical data and methodology versions.
- An operator can diagnose stale data or a duplicate alert without querying raw production collections manually.
- Data deletion, backup restore, key rotation, and rollback drills are documented and tested.

### Phase 8 — iOS preparation only, no app implementation

The iOS app remains out of implementation scope until the extension and web platform meet reliability, engagement, and operational gates over a sustained period.

Preserve these future capabilities now:

- Platform-neutral match, event, poll, and preference contracts.
- Notification events independent of Chrome rendering.
- Stable universal match URLs.
- Team and competition configuration independent of JavaScript UI code.
- API authentication that can later accept Apple App Attest/App Check.
- Server timestamps and activity state sufficient for widgets and Live Activities.

Do not design SwiftUI screens, widgets, Apple Watch complications, Dynamic Island layouts, custom goal sounds, or App Store workflows during the Chrome and web phases.

## 12. Testing and Verification Strategy

### 12.1 Unit and contract tests

- Provider payload validation and normalization for every supported endpoint.
- Match-state transition logic.
- Poll window, choice, score, and accuracy rules.
- Poll delay, postponement, voiding, and rescheduled-version rules.
- Notification decision and deduplication.
- Timezone and daylight-saving formatting.
- Storage schema migrations.
- Consent and retention decisions.

### 12.2 Provider replay tests

Maintain sanitized event sequences for:

- Normal 90-minute match.
- Goal correction/VAR reversal.
- Duplicate provider event.
- Red card and second yellow.
- Delayed kickoff.
- Postponement and reschedule.
- Extra time and penalties.
- Abandoned match.
- Provider timeout, malformed payload, and out-of-order revisions.

The same replay harness drives canonical state assertions and expected notification assertions.

### 12.3 Firebase security and backend tests

Use the Emulator Suite to prove:

- Anonymous users cannot write aggregate or match documents.
- One UID cannot create two responses for one poll.
- Temporary legacy rules accept only one-field resulting `+1` writes, and final rules deny all public legacy writes.
- A UID cannot vote outside the window or submit an invalid choice.
- Public users cannot read raw responses, installations, or push tokens.
- Admin claims are required for operations routes.
- Retention jobs delete raw records but preserve aggregates.

### 12.4 Extension browser tests

Use Playwright with the built extension:

- Install/onboarding and upgrade migration.
- Timbers, Thorns, and combined paths.
- Cached/offline/degraded/live states.
- Poll submission, retry, and already-voted behavior.
- Notification settings and alarm reconciliation.
- FCM message simulation and dedupe.
- Sleeping-device stale-alarm suppression and local/FCM overlap.
- Safari package capability flags with no GCM code or unsupported controls.
- Keyboard navigation, zoom, reduced motion, and accessible names.
- Artifact CSP and missing-resource checks.

### 12.5 Web tests

- Server-rendered route and metadata tests.
- Responsive visual checks at mobile, tablet, and desktop widths.
- Playwright task flows for team, match, insights, CSV, guide, and admin.
- Automated accessibility checks plus keyboard and screen-reader spot checks.
- Chart/table data equivalence.
- Caching and stale-data indicators.
- No raw or private field leakage in HTML, RSC payloads, source maps, or public APIs.

### 12.6 Load and resilience tests

- Burst of 500 concurrent poll submissions with one response per UID.
- FCM fanout at 500, 5,000, and modeled 50,000 registrations.
- Provider failure during a live replay.
- Duplicate scheduler and worker execution.
- Stale live-worker lease recovery and five-hour bounded exit.
- Firestore aggregate contention and repair.
- API quota and cost-limit behavior.

### 12.7 Release artifact verification

Every extension release must automatically verify:

- Manifest version, extension version, permissions, and host permissions.
- Every HTML/script/style/image reference exists in the ZIP.
- No `.env`, local telemetry config, source map with secrets, service-account file, test fixture with credentials, or unapproved asset is included.
- No remotely hosted executable code.
- Expected icon dimensions and store assets.
- Build is reproducible from the release tag.

## 13. Observability, SLOs, and Operations

### 13.1 Initial service objectives

| Area | Objective |
|---|---|
| Cached popup | Meaningful content within 1.5 seconds at p95 |
| API read | Under 500 ms at p95 outside live streaming paths |
| Poll write | Under 750 ms at p95, excluding client network |
| Schedule freshness | Under 15 minutes on matchday; under 60 minutes otherwise |
| Live freshness | Under 60 seconds while provider is healthy |
| Notification processing | 95% sent to FCM within 30 seconds of canonical event creation |
| Poll integrity | Zero duplicate accepted responses for one UID and poll |
| Public privacy | Zero raw response, token, UID, or private-region records exposed |

FCM acceptance does not guarantee operating-system display time. Report provider ingestion latency, backend processing latency, FCM send success, and observed client receipt separately.

### 13.2 Alerts

- No successful schedule ingestion within freshness window.
- Live worker stopped while canonical match remains live.
- Provider schema validation failure.
- Score differs across reconciliation sources.
- FCM invalid-token or send-failure spike.
- Poll aggregate differs from response audit count.
- API 5xx rate or latency threshold exceeded.
- Firestore or Cloud spend anomaly.
- Retention/deletion job missed.
- Public dashboard older than its declared freshness.

### 13.3 Tooling and data boundaries

- Backend services use Google Cloud Logging, Error Reporting, Cloud Monitoring dashboards, budget alerts, and uptime checks. Logs use an allowlist and redact authorization headers, Firebase tokens, FCM registration IDs, provider secrets, raw poll payloads, and raw IP addresses.
- The Vercel web deployment uses deployment and runtime logs for operational diagnosis. Any user-level web performance or product analytics require the same explicit analytics consent and retention rules as extension telemetry.
- The extension sends only allowlisted error or interaction events after analytics consent. No remote session replay, DOM capture, browsing history, visited URL, or page-content telemetry is allowed.
- Correlation uses generated request IDs and event IDs, never a publicly exposed Firebase UID or FCM token.

### 13.4 Runbooks

Required before general live notifications:

- Disable one event type or one team through server config.
- Stop a live worker safely.
- Correct a canonical score and decide whether to notify.
- Revoke a provider credential.
- Rotate FCM and API credentials.
- Restore Firestore export into staging.
- Roll back the extension to the previous store build.
- Respond to a privacy deletion request.

## 14. Security, Privacy, and Compliance Gates

- Use least-privilege IAM for each service account.
- Deny direct Firestore client writes except narrowly justified, tested paths; the preferred design uses backend writes only.
- Keep push tokens in a server-only collection; treat them as secrets.
- Validate all provider and client input.
- Rate-limit writes and alert on anomalous response patterns.
- Use Secret Manager, workload identity, and automated key rotation where supported.
- Treat the Firebase web API key as public configuration, restrict it to the required project and APIs where supported, and never describe it as the security boundary.
- Do not assume Firebase App Check's browser reCAPTCHA providers are suitable for a Manifest V3 extension. Chrome launch security relies on anonymous Firebase auth, server validation, idempotency, rate limits, anomaly detection, and narrow APIs; a custom attestation design is a later security project. Future iOS may add App Attest/App Check.
- Separate production, staging, and local data.
- Publish privacy, retention, consent, data-source, methodology, support, and status pages before notifications, passive analytics, or regional data are enabled.
- Publish an affirmative Chrome Web Store Limited Use statement on the homepage or one click away and keep the listing disclosures, in-product just-in-time disclosures, and privacy page synchronized with runtime behavior.
- Disclose pseudonymous identifiers accurately: Firebase UID, installation ID, FCM registration ID, consent records, and short-lived abuse-control identifiers are data even when names and email addresses are not collected. Do not retain a blanket “no personal data” claim after those features launch.
- Treat product analytics and community insights as visible parts of the extension's disclosed single purpose; do not collect data only for generalized market research or a private third-party benefit.
- Do not transfer raw extension data or non-public derived data to clubs, sponsors, data brokers, advertisers, or other third parties. Public community aggregates are published only as the user-facing community feature described before collection; any custom external access requires a new policy, privacy, and consent review.
- Update Chrome Web Store privacy disclosures in the same release as behavior changes.
- Request only the minimum extension permissions. Do not add tabs, browsing history, page content, geolocation, or broad host access for these features.
- Review notification content against Chrome Web Store anti-spam rules.
- Maintain an asset-rights register for every logo, player image, headshot, stadium image, and icon.
- Treat player headshots and editorial imagery as unavailable until licensing explicitly permits use.

## 15. CI/CD and Branching

Follow the repository's protected `develop` → `main` flow. Implementation starts from `develop` on topic branches; no direct push to either permanent branch.

Required CI checks after the workspace migration:

1. Dependency install with lockfile enforcement.
2. Typecheck all workspaces.
3. Lint all workspaces.
4. Unit and contract tests.
5. Firebase emulator and rules tests.
6. Extension build for Chrome MV3.
7. Web production build.
8. Installed-extension Playwright smoke test.
9. Web Playwright smoke test.
10. Package ZIP and artifact inspection.
11. Dependency and secret scanning.
12. Preview/staging deployment for approved branches.

Production deployment remains manual-approval gated until rollback and data-migration procedures have been exercised.

## 16. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Undocumented ESPN payload changes | Schedule or live outage | Backend adapter, schema validation, last-known-good cache, provider evaluation |
| Live-data rights do not permit push | Blocks goal/lineup alerts | Make rights a provider gate; do not infer permission from technical access |
| Open legacy Firestore data is manipulated | Invalid historical story | Freeze, export as `legacy_unverified`, and start a separate `integrity_controlled` series after migration |
| Anonymous auth can be reset by reinstall | Repeat voting remains possible | Rate limits, anomaly detection, and explicit “anonymous installation, not verified person” wording |
| MV3 service worker stops unexpectedly | Missed client processing | Persist state, event-driven handlers, alarms, FCM wake, idempotent repair |
| Added permissions reduce update adoption | Users disable extension | Narrow permissions, clear onboarding, staged store QA, preserve single purpose |
| Both-team UI becomes crowded | Reduced popup usefulness | State-aware modules, combined ranking, explicit team context, web for detail |
| Firestore hot aggregate contention | Lost/slow poll totals | Immutable responses plus decided 32-shard transactional counters, materialized roll-up, and repair job |
| Incorrect score produces bad alert | Trust damage | Provider revisions, reconciliation, correction model, one-click feature disable |
| Regional analytics harms trust | Adoption and policy risk | Separate opt-in, no geolocation permission, coarse aggregation, thresholds, retention |
| Brand or image use is challenged | Store or legal disruption | Original identity, nominative text use, asset registry, no unlicensed headshots |
| Web dashboard overstates representativeness | Misleading data | Methodology, `n`, consent scope, sample thresholds, self-selection disclosure |
| Costs rise during live polling or fanout | Service interruption | Budget alerts, bounded workers, quotas, max instances, scale tests |

## 17. First Implementation Backlog

The first executable backlog, in order:

1. Create `docs/adr` and record the six architecture decisions.
2. Export current Firestore vote documents as `legacy_unverified` and record the cutover manifest.
3. Deploy tested temporary legacy `+1` rules and build the authenticated compatibility submission endpoint.
4. Ship the compatibility release, begin the minimum 30-day grace, then deny all legacy public writes.
5. Add production package inventory verification and include every runtime dependency.
6. Create local/staging/production Firebase environment definitions, IAM roles, Secret Manager entries, budgets, and redacted logging.
7. Build provider scorecard tooling and capture Timbers/Thorns schedule and match fixtures.
8. Scaffold npm workspaces, `packages/contracts`, and `packages/domain`. **Local foundation complete:** one root lockfile now governs both shared packages and `services/api`.
9. Define canonical team, match, alias, event, poll, aggregate, consent, and error schemas. **In progress:** team, capability, canonical match, compatibility aggregate, and error contracts exist; alias, event, canonical poll, and consent contracts remain.
10. Implement `/v1/config`, team, match, and aggregate read endpoints against the compatibility data source. **In progress:** config, team list/detail, and next-match reads exist; canonical aggregate reads remain separate from the legacy compatibility aggregate.
11. Deploy the minimal production web foundation and required compliance/support routes.
12. Scaffold WXT/React/TypeScript extension and port the existing Timbers experience behind shared contracts.
13. Add installed-extension Playwright smoke tests and artifact checks.
14. Add Thorns adapter and multi-team settings only after the parity gate passes.

Do not begin live notifications, public analytics, regional analytics, or the dashboard before this backlog establishes stable IDs, authenticated writes, provider capability evidence, and a trusted release artifact.

## 18. Program-Level Definition of Done

The Chrome-and-web foundation is complete when all of the following are true:

- Timbers and Thorns schedules are served through one canonical backend with stable IDs.
- The extension supports one or both teams without data or preference leakage.
- Scheduled notifications are opt-in, resilient to reschedules, and deduplicated.
- Live alerts are enabled only on verified provider coverage and meet measured latency/freshness objectives.
- Pre-match confidence, W/D/L calls, post-match reaction, and Player of the Match use authenticated, idempotent submissions.
- Legacy `legacy_unverified` and new `integrity_controlled` data are clearly separated, and public language does not imply unique-person verification.
- Passive usage and coarse regional behavior require explicit, revocable consent.
- The public website presents aggregate insights with sample sizes, methodology, freshness, and accessible tables.
- No raw response, installation, region linkage, or push token is publicly accessible.
- Tests cover security rules, provider replay, installed extension behavior, web behavior, load, packaging, and rollback.
- Operations can disable a broken provider or notification type without an extension release.
- Privacy policy, store disclosures, runtime behavior, retention jobs, and public methodology agree.
- iOS has not been started, but no core backend contract assumes Chrome-only presentation.

## 19. Primary Technical References

- Chrome extension service-worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Chrome GCM API: https://developer.chrome.com/docs/extensions/reference/api/gcm
- Chrome notifications API: https://developer.chrome.com/docs/extensions/reference/api/notifications
- Chrome alarms API: https://developer.chrome.com/docs/extensions/reference/api/alarms
- Chrome Web Store Limited Use policy: https://developer.chrome.com/docs/webstore/program-policies/limited-use/
- Chrome Web Store user-data guidance: https://developer.chrome.com/docs/webstore/user_data
- Firebase anonymous authentication: https://firebase.google.com/docs/auth/web/anonymous-auth
- Firebase authentication in Manifest V3 Chrome extensions: https://firebase.google.com/docs/auth/web/chrome-extension
- Firestore rule conditions: https://firebase.google.com/docs/firestore/security/rules-conditions
- Firestore transactions: https://firebase.google.com/docs/firestore/manage-data/transactions
- Firestore distributed counters: https://firebase.google.com/docs/firestore/solutions/counters
- Firebase scheduled functions: https://firebase.google.com/docs/functions/schedule-functions
- Cloud Run jobs on a schedule: https://cloud.google.com/run/docs/execute/jobs-on-schedule
- FCM HTTP v1 sending: https://firebase.google.com/docs/cloud-messaging/send/v1-api
- FCM trusted server environment: https://firebase.google.com/docs/cloud-messaging/server-environment
- FCM topic latency guidance: https://firebase.google.com/docs/cloud-messaging/topic-messaging
- FCM Admin SDK multicast sending: https://firebase.google.com/docs/cloud-messaging/send/admin-sdk
- FCM scaling guidance: https://firebase.google.com/docs/cloud-messaging/scale-fcm
- WXT project structure and entrypoints: https://wxt.dev/guide/essentials/project-structure
- WXT testing: https://wxt.dev/guide/essentials/e2e-testing.html
- Next.js App Router documentation: https://nextjs.org/docs/app
- Official Thorns ownership announcement: https://www.thorns.com/news/raj-sports-finalizes-acquisition-of-portland-thorns-fc
- Official Timbers front office: https://www.timbers.com/club/front-office/
