# Strategic Implementation Plan — Independent Readiness Review

- **Review date:** August 3, 2026
- **Reviewed artifact:** `docs/STRATEGIC_IMPLEMENTATION_PLAN.md`
- **Review scope:** Chrome extension first, public web second, native iOS explicitly deferred
- **Verdict:** Phase 0 may proceed through the documented production gates; provider-dependent live features remain gated separately

## 1. Review Standard

This review treated the plan as untrusted until its repository claims, platform assumptions, sequencing, privacy boundaries, failure behavior, and requirement coverage were independently checked.

The review used five tests:

1. **Repository truth:** claims about the current extension, build, rules, tests, packaging, permissions, and fallback behavior must match the checkout.
2. **Platform truth:** Chrome, Firebase, Firestore, FCM, Cloud Run, WXT, and Next.js decisions must be compatible with current primary documentation.
3. **Architectural closure:** each critical capability needs one chosen trust boundary and execution model, not an unresolved “or” between materially different designs.
4. **Safe sequencing:** privacy, support, migration, rollback, and operational foundations must precede the features that depend on them.
5. **Requirement traceability:** every requested technical capability must be implemented, deliberately gated, explicitly deferred, or intentionally excluded.

## 2. Repository Findings Confirmed

The current checkout supports the plan's baseline audit:

| Area | Confirmed state | Planning consequence |
|---|---|---|
| Version | `package.json` and `manifest.json` are `1.0.4` | Preserve the existing listing and define a compatibility release before the large migration |
| Manifest | Manifest V3 with `storage` and `alarms` | New notification permissions require a deliberate store update and upgrade-path test |
| Data source | Popup reads an ESPN site API directly | Move provider payloads behind canonical backend adapters |
| Community writes | `community.js` commits unauthenticated Firestore increments | Existing totals cannot support integrity claims |
| Firestore rules | `/votes/{matchTimestamp}` allows all reads and writes | Harden immediately, migrate writes, then deny the legacy path |
| Poll key | Legacy community records are keyed by kickoff timestamp | Introduce immutable canonical match IDs and versioned polls |
| Fallback | `data/fallback.json` contains bundled fixtures | Retire the bundled season schedule after backend migration |
| CI artifact | Packaging lists runtime files manually and omits `community.js` | Add dependency-derived package inventory and artifact tests |
| Tests | Jest coverage exists for popup/scraper behavior; no community/rules/browser test | Add emulator, contract, installed-extension, replay, and release tests |
| Safari | An Xcode conversion path exists | Preserve packaging, but do not promise Chrome GCM parity |

## 3. Corrected Findings

Every item below was a material ambiguity or defect in the first plan draft and is corrected in the reviewed plan.

| Severity | Finding | Correction now required by the plan |
|---|---|---|
| Critical | The plan could deny legacy writes before released clients had a replacement path | Export first, deploy temporary exact-`+1` rules, ship an authenticated compatibility release, observe a minimum 30-day grace, then deny legacy public writes |
| Critical | “Verified response” could be misread as a verified human | New data is `integrity_controlled`; the public claim is one accepted response per anonymous Firebase UID and poll, not one person |
| Critical | Vercel was allowed a Firebase Admin path despite the no-static-credential rule | Vercel uses the Matchday API exclusively; privileged authorization stays in GCP and is enforced from Firebase token claims |
| Critical | Privacy and support pages arrived after notifications and analytics | A minimal production web foundation ships in Phase 1, before notifications or passive analytics |
| High | Aggregate writes were left as “sharded or event-driven” | Use one transaction for immutable response creation plus a deterministic 32-shard increment, then materialize and repair roll-ups |
| High | Live-worker activation, replacement, and termination were underdefined | A five-minute watchdog, per-match Firestore lease, bounded Cloud Run Job, stale-lease recovery, and independent final reconciliation are specified |
| High | FCM fanout had no latency-safe scaling model | Live alerts use preference-targeted registration-ID multicast in deterministic batches of at most 500; topics are rejected as the default because FCM optimizes them for throughput rather than latency |
| High | Sleeping devices could show stale local reminders | Alarm handlers recheck canonical state and drop stale reminders; post-match fallback checks for final state before presentation |
| High | Local and FCM kickoff/final paths could duplicate alerts | Both use the same deterministic notification ID |
| High | Safari could inherit a Chrome-only push assumption | Safari excludes `chrome.gcm`; local reminders and notifications require separate installed-Safari testing |
| High | A manually bundled season could silently become false data | Post-migration fallback is last-known-good cache; fresh-install outage is explicitly unavailable with an official schedule link |
| High | Postponed matches could contaminate accuracy and sentiment series | Same-day delay extends the poll; a date change or over-24-hour postponement voids the old version and creates a new one |
| High | Provider identifier changes could merge distinct matches | Alias candidates are conservative and ambiguous merges require operator review with source evidence |
| High | Provider rights scoring did not explicitly cover player data | The scorecard now gates display, player data, public aggregates, and push rights |
| High | Passive analytics could become generalized market research | Every collected category must power a disclosed, visible user-facing feature and use separate consent where required |
| High | Future identifiers conflicted with a blanket “no personal data” posture | Privacy must accurately disclose pseudonymous UIDs, installation IDs, FCM registrations, consent records, and short-lived abuse identifiers |
| Medium | Commerce cards could drift into behavioral advertising | Cards are team/result contextual only, never personalized from extension data, paid-targeted, or delivered by notification |
| Medium | Operations named alerts but not the observability stack or redaction boundary | GCP and Vercel operational tools, consented client telemetry, request IDs, and explicit secret/user-data redaction are defined |

## 4. Requirement Coverage Matrix

Status meanings:

- **Planned:** implementation is in the phased roadmap with tests and an exit gate.
- **Gated:** architecture is ready, but release depends on provider capability, rights, or a later compliance decision.
- **Deferred:** contracts preserve the capability, but implementation is intentionally out of current scope.
- **Excluded:** deliberately not part of the technical program.

| Requested capability | Status | Plan location and implementation decision |
|---|---|---|
| Timbers and Thorns support | Planned | Sections 5.2, 8.3, Phase 2; independent team config, links, capability flags, cache, polls, and preferences |
| 24-hour reminder | Planned | Section 8.5, Phase 3; local alarm with stale-state suppression |
| 1-hour reminder | Planned | Section 8.5, Phase 3; local alarm with stale-state suppression |
| Kickoff alert | Planned | Section 8.5, Phase 3; local and FCM paths share one dedupe ID |
| Goal alerts for both sides | Gated | Sections 5.4, 7.2, 8.5, Phase 4; requires coverage, latency, correction quality, and push rights |
| Halftime alert | Gated | Sections 5.4, 8.5, Phase 4; canonical event plus bounded registration-ID multicast |
| Final result alert | Gated | Sections 5.4, 8.5, Phase 4; server final is primary and local final-state check is fallback |
| Post-match poll prompt | Planned | Sections 5.5, 8.5, Phase 3/5; deduplicated server event plus state-aware local fallback |
| Lineup alert | Gated | Sections 7.2, 8.5, Phase 4; hidden unless confirmed lineup coverage and rights pass |
| Injury alert or status | Gated | Section 8.6; disabled until a licensed, reliable source and vocabulary exist |
| Live score and clock | Gated | Sections 5.3, 7.3, 8.2, Phase 4; canonical live state and freshness labels |
| Goals, cards, substitutions | Gated | Sections 5.4, 7.2, Phase 4; normalized events, revisions, retractions, and replay tests |
| Standings and playoff line | Planned | Section 8.6, Phase 4; competition-specific thresholds, never hardcoded across MLS/NWSL |
| Last-five form | Planned | Section 8.6, Phase 4; final canonical matches only |
| Opponent preview | Planned | Section 8.6, Phase 4; objective provider-backed metrics |
| Opponent key player | Gated | Section 8.6; explicit data rule and licensed data, no editorial guessing |
| Pre-match sentiment | Planned | Sections 5.5, 9.1, Phase 5; versioned five-point poll |
| Post-match reaction | Planned | Sections 5.5, 9.1, Phase 5; separately worded and reported measure |
| Community W/D/L prediction | Planned | Sections 5.5, 9.2, Phase 5; distinct poll locked at kickoff |
| Accuracy leaderboard | Planned | Section 9.2, Phase 5; plurality rule, tie/no-call handling, sample threshold, exact eligible count |
| Player of the Match | Gated | Sections 5.5, 9.3, Phase 5; only confirmed participants and sufficient provider rights |
| Match-day timing behavior | Planned | Section 9.4, Phase 5/6; explicit opt-in, match-relative buckets, no browsing activity |
| Social-activity timing comparison | Gated | Section 9.4, Phase 7; lawful external source only and descriptive correlation only |
| Geographic engagement heatmap | Planned | Section 9.5, Phase 5/6; voluntary coarse region, separate opt-in, suppression under 20 |
| Automatic IP geography | Excluded | Section 9.5; prohibited from product analytics unless a later policy/legal review changes scope |
| Providence Park guide | Planned | Sections 8.7, 10, Phase 6; version-controlled official-source content |
| Official ticket deep link | Planned | Sections 5.2, 8.7, Phase 2/6; team-specific official destination |
| Ticket click measurement | Planned | Section 8.7; aggregate only under analytics consent |
| Contextual merch card | Planned | Section 8.7, Phase 7; result/team contextual, frequency capped, non-personalized, never a notification |
| Public aggregate dashboard | Planned | Sections 10.1–10.2, Phase 6; accessible charts, tables, CSV, sample and freshness labels |
| Private operator dashboard | Planned | Section 10.3, Phase 6/7; API-enforced admin claims and no raw Vercel access |
| Aggregate data export | Planned | Sections 10.2–10.3, Phase 6/7; aggregate CSV by default and reproducible season reports |
| Original product identity | Planned later | Section 10.4; separate visual workstream with provenance, tokens, accessibility, and no copied trade dress |
| iOS home-screen widget | Deferred | Phase 8; data contracts preserved, no SwiftUI implementation |
| Apple Watch complication | Deferred | Phase 8; explicitly not designed during Chrome/web work |
| Live Activity / Dynamic Island | Deferred | Phase 8; server state remains platform-neutral, UI implementation postponed |
| iOS rich push and custom sound | Deferred | Phase 8; event contracts preserved, no iOS notification implementation |
| Outreach, meetings, acquisition, and attention strategy | Excluded | Executive Direction; outside the technical program by instruction |

## 5. Platform Verification

Only primary or official sources were used for platform decisions.

| Decision checked | Verified constraint | Plan consequence | Primary source |
|---|---|---|---|
| Manifest V3 runtime | Extension service workers can terminate and global variables are not durable | Persist preferences, dedupe state, leases, and caches; use event-driven repair | [Chrome service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) |
| Local reminders | Alarms do not wake sleeping devices and can be delayed | Treat alarms as best-effort and suppress stale reminders after wake | [Chrome alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms) |
| Chrome push | `chrome.gcm` supplies GCM/FCM registration and receive events behind the `gcm` permission | Isolate it behind a Chrome-only adapter and render through notifications | [Chrome GCM API](https://developer.chrome.com/docs/extensions/reference/api/gcm) |
| System notifications | Extension notifications require the notifications permission and explicit presentation | Keep payloads data-only and let the service worker validate and render | [Chrome notifications API](https://developer.chrome.com/docs/extensions/reference/api/notifications) |
| Anonymous extension auth | Manifest V3 extensions can import anonymous auth from `firebase/auth/web-extension` | Compatibility release and WXT client can use supported anonymous Firebase auth | [Firebase Chrome extension authentication](https://firebase.google.com/docs/auth/web/chrome-extension) |
| Atomic response write | Firestore transactions are all-or-nothing and retry on concurrent edits | Create the immutable response and increment its deterministic shard in one transaction | [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions) |
| Counter scaling | A single hot counter contends; distributed shards increase write capacity | Use 32 shards plus a materialized roll-up and repair process | [Firestore distributed counters](https://firebase.google.com/docs/firestore/solutions/counters) |
| Live push fanout | FCM topics favor throughput over latency; Admin SDK multicast accepts at most 500 direct targets per invocation | Use deterministic, rate-limited direct batches for latency-sensitive sports alerts | [FCM topic messaging](https://firebase.google.com/docs/cloud-messaging/topic-messaging), [FCM Admin SDK sending](https://firebase.google.com/docs/cloud-messaging/send/admin-sdk) |
| Push trust boundary | FCM sending belongs in a trusted server environment | Keep FCM credentials and sends in GCP, never in extension or Vercel client code | [FCM server environment](https://firebase.google.com/docs/cloud-messaging/server-environment) |
| Scheduled live jobs | Cloud Scheduler can invoke Cloud Run Jobs through authenticated service identity | Use a scheduled watchdog plus bounded, leased match jobs | [Cloud Run scheduled jobs](https://cloud.google.com/run/docs/execute/jobs-on-schedule) |
| Chrome disclosure | Collection/use/sharing must be disclosed; behavior changes require prominent disclosure | Ship web privacy/support surfaces early and synchronize listing, UI, and policy | [Chrome disclosure requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements) |
| Limited Use | Data use must support the disclosed user-facing purpose; personalized advertising from extension data is prohibited | Keep analytics visible and consented, prohibit private third-party data products and personalized commerce | [Chrome user-data guidance](https://developer.chrome.com/docs/webstore/user_data) |
| Web App Check | Standard web providers are reCAPTCHA-based web integrations, not an automatic MV3 extension attestation solution | Do not claim App Check protection for Chrome; use auth, validation, idempotency, and abuse controls | [Firebase App Check web provider](https://firebase.google.com/docs/app-check/web/recaptcha-provider) |
| Multi-club framing | The Thorns were acquired by RAJ Sports; the Timbers list Merritt Paulson as owner | Treat teams and future organizational permissions independently | [Thorns acquisition announcement](https://www.thorns.com/news/raj-sports-finalizes-acquisition-of-portland-thorns-fc), [Timbers front office](https://www.timbers.com/club/front-office/) |

## 6. Architecture Invariants

Implementation should stop and open an ADR amendment if any change would violate these invariants:

1. Clients never consume provider-specific payloads.
2. Canonical match IDs never depend on mutable kickoff time.
3. Vercel never holds raw Firestore access or Firebase Admin credentials.
4. Public clients never read raw responses, installations, regions, tokens, or abuse identifiers.
5. New response data never implies verified human identity or representative sampling.
6. Legacy and integrity-controlled poll series never merge.
7. Notifications are off by default, team/event configurable, deterministic, and non-promotional.
8. Provider capability and rights flags can disable every live or player-dependent feature without an extension release.
9. Passive analytics and coarse region are separate, revocable opt-ins tied to visible product features.
10. A stale provider response, alarm, cache, or bundled file is never presented as current live truth.
11. Chrome remains the reference client; Safari and future iOS capabilities fail closed when unsupported.
12. iOS implementation does not begin during the Chrome and web foundation program.

## 7. External Decision Gates

These are not defects in the plan and should not be guessed during implementation:

| Gate | Required evidence | Features held behind it |
|---|---|---|
| Bootstrap provider | Timbers/Thorns schedule, standings, stable IDs, quotas, and redistribution terms | Canonical schedule and standings migration |
| Live provider | Measured coverage/latency/corrections plus written display and push rights | Score, clock, goals, cards, substitutions, lineup, final alerts |
| Player data rights | Stable player IDs, participation, roster/headshot redistribution terms | Player of the Match, key player, player imagery |
| Injury source | Licensed source, update reliability, clear status vocabulary | Injury status and injury alerts |
| Production domain and support contact | Controlled domain, TLS, monitored deployment, deletion/support mailbox | Phase 1 public compliance foundation |
| Original identity and asset register | Approved original mark, provenance, icon exports, contrast/accessibility checks | Final visual polish and store assets |
| Safari transport | Installed-browser behavior and a supported push design | Safari live push; not a Chrome gate |
| Future external data access | New policy, privacy, consent, contract, and security review | Any non-public club, sponsor, or partner access |

## 8. Phase 0 Start Checklist

Phase 0 may begin when the implementer can answer yes to each item:

- A Firestore export destination and immutable cutover manifest format are selected.
- Emulator tests exist for current-open, temporary-hardened, and final-deny rule states.
- The compatibility endpoint contract includes anonymous auth, idempotency, stable error codes, rate limits, and minimum client version.
- The compatibility extension release has a rollback package and explicitly visible community-sync failure state.
- Staging and production Firebase projects, service identities, budgets, logs, and Secret Manager ownership are documented.
- Provider spike fixtures contain no prohibited licensed payload or credential.
- CI packages files from the built dependency graph and fails on missing runtime resources or secret patterns.
- The production domain, privacy route, support route, and operator contact owner are selected before Phase 1 closes.

## 9. Readiness Conclusion

The reviewed plan is technically coherent and implementation-ready at the strategic level. It does not promise unavailable provider capabilities, unique-human identity, exact Chrome notification timing, Safari push parity, or early iOS work. It now establishes a safe production migration before feature expansion, a single backend authority, an auditable response model, explicit compliance sequencing, bounded live operations, and complete traceability to the requested Chrome and web capabilities.

“Ready” means Phase 0 engineering can start from this plan. It does not mean the provider rights/capability gates have already passed, the production data migration has already occurred, or any future club/partner access is authorized.
