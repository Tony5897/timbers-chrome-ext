# Phase 0 Implementation Status

**Updated:** August 3, 2026
**Scope:** Chrome compatibility release, integrity migration foundation, and release controls
**Production state:** Not deployed

## Implemented Locally

- Chrome release `1.0.5` replaces direct Firestore mutation with Firebase anonymous authentication and an authenticated compatibility API.
- The API validates client version, poll eligibility, open/close time, anonymous identity, response schema, and idempotency input.
- The API limits each anonymous UID to ten newly accepted poll responses per UTC day using a short-lived hashed quota key.
- Firestore transactions create at most one raw response per poll and UID while incrementing a deterministic aggregate shard.
- Raw response records receive a 90-day expiration timestamp; a scheduled cleanup function deletes expired records.
- Authenticated self-service deletion removes retained responses, transactionally corrects aggregate shards, clears short-lived quota state, returns an idempotent receipt, and schedules anonymous-account deletion.
- Temporary migration rules restrict legacy writes to one allowed field whose resulting value increases by exactly one.
- Final post-grace rules preserve public legacy reads and deny every public legacy write.
- Packaging follows the extension runtime dependency graph, verifies exact ZIP inventory, rejects secret-like files, and includes `community.js`, `auth.js`, and `runtime-config.js`.
- The provider boundary has strict parsing plus reduced synthetic replay fixtures for both Timbers and Thorns; capability and rights gates remain blocked.
- Reduced live observation identified and corrected the missing `fixture=true` query that previously returned results instead of upcoming matches.
- Timbers MLS and Leagues Cup fixtures are merged and deduplicated; a bounded one-hour legacy timestamp alias prevents small schedule corrections from splitting compatibility polls.
- CI uses Node 22 and validates extension tests, API tests, Firestore rules, and the release artifact.

## Verified Locally

- Forty-nine extension tests and 37 API unit tests pass under Node 22; API TypeScript build and lint checks pass.
- Fourteen temporary and final Firestore security-rule cases pass in the Firestore emulator, alongside four repository integration cases and two anonymous-account cleanup cases.
- The repository integration suite exercises duplicate response handling, aggregate sharding, rate limits, canonical timestamp aliases, retention timestamps, self-service deletion, and aggregate correction against the Firestore emulator.
- The verified extension ZIP contains exactly 13 runtime files and excludes tests, provider observations, environment files, and server-only code.
- Production dependency audit using the installed lockfile reports no known production vulnerabilities in offline mode. This is not a current-registry audit.

## Production Gates Still Open

- Create and document distinct development and staging Firebase projects; only the production alias currently exists locally.
- Confirm the production Firestore region and the selected Functions region before deployment.
- Enable Firebase anonymous authentication and configure anonymous-account cleanup or an equivalent operator process.
- Create budget alerts, log retention, Secret Manager ownership, least-privilege service identities, and operational alerting.
- Archive the verified local `legacy_unverified` export in approved immutable storage before any rule deployment. The local snapshot contains two documents, including one anomalous 10-digit document ID preserved for review.
- Deploy and smoke-test the API before publishing extension `1.0.5` or changing legacy rules.
- Start and record the minimum 30-day auto-update grace period before deploying final write-deny rules.
- Select a production domain, monitored support address, and hosted privacy URL before Phase 1 public launch; deploy and exercise the implemented deletion route in staging.

## Explicit Non-Claims

- Anonymous Firebase identity limits one response per UID and poll; it does not verify one unique human.
- Legacy totals remain `legacy_unverified` and must not be merged with `integrity_controlled` data.
- The bootstrap ESPN adapter is an implementation spike, not confirmation of redistribution rights or live-alert suitability.
- No notification, regional analytics, Thorns production support, public dashboard, or iOS implementation is enabled by this compatibility release.

Use `docs/runbooks/phase-0-deployment.md` for the ordered production cutover and rollback sequence.
