# Implementation Status

**Updated:** August 4, 2026
**Scope:** Chrome compatibility release, integrity migration foundation, shared platform contracts, and release controls
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
- The repository uses npm workspaces with one root lockfile for the extension, shared packages, and Firebase API.
- `packages/contracts` defines runtime-validated team, capability, canonical match, confidence poll, aggregate response, and problem-details contracts.
- `packages/domain` provides independent Timbers and Thorns configuration, stable provider-qualified match IDs, match-qualified confidence poll IDs, poll-state policy, and capability gates.
- Public read routes expose config, team lists, team detail, the next enabled canonical match with poll discovery, and integrity-controlled aggregate reads by canonical poll ID. Timbers schedule and polling reads are active locally; Thorns is visible as planned with schedule and polling disabled.
- Canonical poll IDs map to existing timestamp-keyed compatibility records inside the repository. New synchronization writes persist the alias and current match status, while provider-event fallback keeps pre-alias records readable without exposing legacy keys publicly. Postponed and cancelled matches resolve to void polls after synchronization. Miss-triggered provider refreshes are coalesced and globally throttled to prevent fabricated public IDs from amplifying provider reads and Firestore writes.
- Provider timeouts, network failures, HTTP failures, and malformed payloads map to stable public error responses rather than leaking implementation details.
- Generated workspace builds, coverage, packages, and emulator logs are removed through `npm run clean`; historical root release ZIPs are intentionally preserved.
- CI exposes independent `lint`, `typecheck`, `test`, and `build` release gates, with verified extension artifacts retained only for `main` builds.
- A manually dispatched, environment-protected deployment workflow uses GitHub OIDC and Google Workload Identity Federation rather than long-lived Firebase tokens or service-account keys.
- Phase 0 preflight binds credential-free JSON evidence to the exact deployment commit, target environment, and immutable backup checksum where rules can mutate access; deployed API smoke scripts support authenticated staging verification without fabricating production polls.
- Environment, IAM, budget, monitoring, authentication, migration, rollback, and Chrome Web Store presentation gates are consolidated in the Phase 0 runbooks.
- Development and staging are separate Firebase projects with delete-protected `nam5` Firestore databases, dedicated web apps, version-controlled anonymous authentication, and verified anonymous-account creation, refresh, and deletion.
- Staging and production have separate keyless GitHub deployer service accounts. Their Workload Identity providers trust only this repository's immutable numeric identity and the Phase 0 workflow; neither account has a user-managed key.
- GitHub `staging` and `production` environments enforce branch policies and required review, and contain the environment-specific project, API, Workload Identity, deployer, and protected web-key configuration required by the deployment workflow.
- The Chrome Web Store presentation foundation includes an original independent mark, reproducible required-size promotional exports, five current-feature screenshots, exact dashboard copy, permission justifications, privacy-field guidance, structured public support forms, and a human-controlled submission checklist.

## Verified Locally

- Forty-nine extension tests and 76 API unit, contract, and shared-domain tests pass under Node 22; all workspace TypeScript builds, type checks, and lint checks pass.
- Fourteen temporary and final Firestore security-rule cases pass in the Firestore emulator, alongside nine repository integration cases and two anonymous-account cleanup cases.
- The repository integration suite exercises duplicate response handling, aggregate sharding, rate limits, canonical timestamp aliases, canonical poll alias persistence, pre-alias fallback, unsupported-provider rejection, alias and provider-reference consistency rejection, retention timestamps, self-service deletion, and aggregate correction against the Firestore emulator.
- The verified extension ZIP contains exactly 13 runtime files and excludes tests, provider observations, environment files, and server-only code.
- The root lockfile pins patched `uuid` releases for affected Google request-library paths while preserving unrelated modern versions. A current-registry audit remains part of branch verification; offline audit output is not treated as current evidence.

## Verified in Staging

- Protected Auth deployment [run 30884585063](https://github.com/Tony5897/timbers-chrome-ext/actions/runs/30884585063) passed the complete Phase 0 verification, keyless Workload Identity authentication, exact-commit preflight, evidence upload, and version-controlled anonymous-provider deployment from commit `98e6b4214dc830ddc2258df54e63d71a8ef216b9`.
- A direct Identity Platform configuration read after deployment confirmed anonymous sign-in is enabled in `timbers-matchday-staging`.
- Protected index deployment [run 30884728558](https://github.com/Tony5897/timbers-chrome-ext/actions/runs/30884728558) passed the same controls. The deletion-queue composite index and response identity-hash collection-group index both report `READY`.
- Firebase Auth provisioning uses a two-permission environment-local custom role derived from denied audit-log evidence: `firebase.projects.update` and `serviceusage.services.enable`. No Owner, Editor, Firebase Admin, long-lived key, or legacy Firebase token was introduced.
- Staging billing is active on open Cloud Billing account `01B3E0-9B5B27-05FB9C` (`Firebase Payment`). A `$25` monthly budget with 50%/80%/100% actual and 100% forecast thresholds notifies the operator email channel.
- Protected API deployment [run 30903666044](https://github.com/Tony5897/timbers-chrome-ext/actions/runs/30903666044) from commit `f20ad971610a04163e1f67253f16f8655a655b3f` deployed Gen2 Functions `api`, `syncCompatibilityPollWindows`, `cleanupCompatibilityResponses`, and `cleanupCompatibilityAccounts` in `us-central1`, then passed authenticated Phase 0 smoke (17/17), including health, public reads, anonymous auth, submission, idempotent existing response, deletion scheduling, and aggregate correction. Immediate smoke proves cleanup was scheduled; delayed anonymous-account deletion still requires separate post-window evidence.
- Live staging health returns `{"status":"ok","service":"matchday-compatibility-api"}` at `https://us-central1-timbers-matchday-staging.cloudfunctions.net/api/v1/health`. No production resource or Chrome Web Store listing was changed.

## Production Gates Still Open

- Production Firestore is confirmed in `nam5`; deploy Functions in the Firebase-recommended `us-central1` region only after production billing controls are active and the staging API continues to succeed.
- Link an approved active billing account to production before deploying production Functions or scheduled jobs. Staging billing is active; production remains unbilled until explicitly approved.
- Grant the production deployer `Service Account User` only on the selected least-privilege Functions runtime and Cloud Build identities after production billing and required Google APIs are enabled.
- Configure the canonical staging API URL and project-level billing-status read permission before production API deployment; the workflow now fails closed unless production billing is active and staging `/v1/health` reports `ok`.
- Enable version-controlled anonymous authentication in production only after staging delayed-cleanup evidence is recorded; then verify account creation, refresh, revocation, deletion, and scheduled cleanup.
- Create production budget alerts, log retention, Secret Manager ownership, runtime service identities, and operational alerting after production billing is activated.
- Archive the verified local `legacy_unverified` export in approved immutable storage before any rule deployment. The local snapshot contains two documents, including one anomalous 10-digit document ID preserved for review.
- Record delayed staging cleanup evidence (scheduler success, deleted deletion-request, failed token refresh) before treating staging API validation as complete for production Auth.
- Start and record the minimum 30-day auto-update grace period before deploying final write-deny rules.
- Select a production domain, monitored support address, and hosted privacy URL before Phase 1 public launch.
- Complete a separate Chrome Web Store public-presentation review before submitting release `1.0.5`; automated workflows intentionally cannot publish the listing.

## Explicit Non-Claims

- Anonymous Firebase identity limits one response per UID and poll; it does not verify one unique human.
- Legacy totals remain `legacy_unverified` and must not be merged with `integrity_controlled` data.
- The bootstrap ESPN adapter is an implementation spike, not confirmation of redistribution rights or live-alert suitability.
- No notification, regional analytics, Thorns production support, public dashboard, or iOS implementation is enabled by this compatibility release.
- Shared contracts and local API routes are implementation foundations, not evidence that the Phase 1 web or migrated extension clients are deployed.

Use `docs/runbooks/phase-0-deployment.md` for the ordered production cutover and rollback sequence.
