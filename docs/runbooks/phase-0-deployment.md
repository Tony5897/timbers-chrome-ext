# Phase 0 Production Deployment Runbook

## Purpose

Move community polling from unauthenticated Firestore writes to the authenticated compatibility API without mixing legacy totals into the new integrity-controlled series or silently breaking old extension versions.

## Preconditions

- `docs/runbooks/phase-0-environment-readiness.md` is complete for development, staging, and production.
- Operator is authenticated with Firebase CLI and has approved production access.
- Firebase project aliases, Firestore region, Functions region, budgets, logging, IAM, and support ownership are independently verified.
- Anonymous Firebase Authentication is enabled and tested in a non-production project.
- `npm run verify:phase0` passes from a clean checkout with Node 22 and Java 21 or later.
- A rollback owner and observation window are assigned.
- Chrome Web Store copy, privacy disclosures, screenshots, promotional artwork, support URL, and hosted privacy URL have passed a separate public-presentation review.

Run the release preflight from a clean checkout before any deployment:

```bash
npm run preflight:phase0 -- \
  --require-environments \
  --require-backup \
  --require-cloud-access \
  --require-clean \
  --backup backups/legacy-votes-YYYYMMDDTHHMMSSZ.json \
  --output phase0-preflight.json
```

## Ordered Cutover

1. Export legacy totals before any rule or data mutation:

   ```bash
   npm run export:legacy -- --output backups/legacy-votes-YYYYMMDDTHHMMSSZ.json --api-key PUBLIC_FIREBASE_WEB_API_KEY
   (cd backups && shasum -a 256 -c legacy-votes-YYYYMMDDTHHMMSSZ.json.sha256)
   ```

2. Copy the JSON and checksum to the approved immutable backup location. Record the URI, SHA-256, record count, operator, and timestamp in the cutover log. Never commit the export.
3. Deploy the version-controlled anonymous authentication configuration to staging through the independently approved `auth` component.
4. Deploy indexes to staging through the independently approved `indexes` component. Verify every index reports ready before separately dispatching the API deployment.
5. Run the authenticated staging smoke test. Confirm account creation, token refresh, invalid-token rejection, submission behavior for the current poll state, deletion receipt idempotency, aggregate correction, and delayed account cleanup.
6. Deploy anonymous authentication to production through the independently approved `auth` component. Confirm a test account can be created, refreshed, revoked, and removed before store publication.
7. Deploy the response identity-hash collection-group index and wait until Firebase reports it ready:

   ```bash
   firebase deploy --only firestore:indexes --project production
   ```

8. Deploy only Functions after the index is ready:

   ```bash
   firebase deploy --only functions --project production
   ```

9. Verify `/v1/health`, scheduled poll-window sync, invalid token, unsupported client, closed poll, aggregate response behavior, provider behavior, budgets, alerts, and scheduler health. Perform valid and duplicate response testing only during an approved open poll; do not fabricate or alter a production match poll.
10. Build and retain both the new package and the last known-good rollback package:

   ```bash
   npm run package:extension
   npm run verify:extension
   ```

11. Deploy temporary legacy rules only after the export and API smoke test succeed:

   ```bash
   firebase deploy --only firestore:rules --project production
   ```

12. Stop at the Chrome Web Store publication gate. Review and approve the complete public presentation package: listing title and summary, detailed description, privacy disclosures, category, support and privacy URLs, screenshots, promotional tiles, icon rendering, and release notes.
13. Publish extension `1.0.5` only after that approval. Record Chrome Web Store submission, approval, publication, and observed adoption timestamps.
14. Monitor API errors, auth failures, duplicate rate, aggregate consistency, deletion-queue age, provider sync, spend, and support reports. Do not infer migration completion from passive analytics consent.
15. Keep the temporary rules for at least 30 days from confirmed publication and use store-version adoption evidence plus support risk review before final cutover.
16. Deploy final rules with the separate immutable config:

   ```bash
   firebase --config firebase.final.json deploy --only firestore:rules --project production
   ```

17. Run a packaged legacy-client check: reads still work, direct writes fail, and the UI shows sync unavailable rather than a false success.

The GitHub workflow does not submit or modify the Chrome Web Store listing. Store publication remains a deliberate human-controlled action.

## Rollback

- Extension regression: halt rollout if possible, restore the prior package, and keep the compatibility API online while diagnosing.
- API regression before temporary rules: roll back Functions; legacy writes remain available.
- API regression after temporary rules: restore the last known-good Functions revision. Do not reopen arbitrary Firestore writes.
- Final-rule cutover regression: restore temporary rules only when the documented risk owner explicitly accepts the integrity tradeoff; otherwise keep writes denied and surface sync unavailable.
- Data discrepancy: freeze public aggregate claims, preserve logs and exports, recompute from raw integrity-controlled responses, and never repair by adding legacy totals.

## Required Cutover Record

Record commit SHA, extension version, Functions revisions, rule file SHA-256, export SHA-256, record count, Firebase project ID, regions, operators, timestamps, smoke-test results, rollback package hash, grace-period start/end, and final approval.
