# Phase 0 Environment Readiness

## Purpose

Establish isolated development, staging, and production Firebase environments with auditable deployment identity, cost controls, monitoring, and release evidence. Complete this runbook before using the production deployment sequence.

Firebase recommends a separate project for each release environment so test identities, data, rules, and scheduled workloads cannot contaminate production. Project IDs are operational identifiers, not branding; choose stable names and record the final values only after Firebase confirms availability.

## Environment Register

Complete this table with verified values. Do not invent or reserve project IDs in source control before the projects exist.

| Environment | Firebase alias | Firebase project ID | Firestore region | Functions region | Billing | Anonymous auth | Owner |
|---|---|---|---|---|---|---|---|
| Development | `development` | Pending | `nam5` proposed | `us-central1` | Pending | Pending | Pending |
| Staging | `staging` | Pending | `nam5` proposed | `us-central1` | Pending | Pending | Pending |
| Production | `production` | `timbers-matchday` | `nam5` confirmed | `us-central1` | Billing disabled | Disabled or unverified | Pending |

The Firestore location is effectively permanent after database creation. Production was verified as `nam5` on August 3, 2026. Firebase maps `nam5` to `us-central1` as the closest supported Functions region, so the API and extension runtime use `us-central1`. Development and staging should use the same Firestore/Functions pairing unless a documented architecture decision establishes otherwise.

## Local Operator Prerequisites

- Node.js 22 from `.nvmrc`.
- Java 21 or later for Firestore emulator tests.
- Firebase CLI installed from the repository lockfile.
- Firebase CLI authenticated with the approved project-owner account.
- Google Cloud CLI installed for IAM, budget, monitoring, and Workload Identity Federation setup.
- A monitored operational email address and named rollback owner.

On macOS with the currently installed local toolchains:

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
export JAVA_HOME="/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
npm ci
npx firebase-tools login
```

Do not use a legacy `FIREBASE_TOKEN` for GitHub Actions. The deployment workflow uses GitHub OpenID Connect and Google Workload Identity Federation so no long-lived service-account key is stored in GitHub.

## Firebase Project Setup

1. Create or select three distinct Firebase projects.
2. Upgrade staging and production only to the billing plan required by deployed Functions and scheduled jobs.
3. Create the default Firestore database in the independently approved region.
4. Enable anonymous Firebase Authentication.
5. Register a web app in each environment and retain only its public web configuration.
6. Restrict each Firebase web API key to the intended project and required APIs where supported.
7. Add verified aliases after project creation:

   ```bash
   npx firebase-tools use --add
   ```

   The committed `.firebaserc` must ultimately contain unique `development`, `staging`, and `production` aliases.

8. Deploy and validate development first, then staging. Production remains blocked until staging evidence is complete.

## Deployment Identity

Create one deployer service account per environment. Do not reuse the Firebase runtime identity or a human owner account. Grant only permissions required to deploy the configured Functions, Firestore indexes, and rules; review Firebase CLI permission failures individually rather than granting project-wide Owner.

Create a GitHub Workload Identity provider restricted to this repository:

- Repository: `Tony5897/timbers-chrome-ext`
- Allowed GitHub environments: `staging` and `production`
- Production deployment ref: `refs/heads/main`
- Required GitHub permission: `id-token: write`
- Credential model: Workload Identity Federation through the environment-specific deployer service account

In each GitHub environment, configure:

| Name | Type | Purpose |
|---|---|---|
| `GCP_PROJECT_ID` | Variable | Exact Firebase/Google Cloud project ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Variable | Full Workload Identity provider resource name |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | Variable | Environment-specific deployer service account email |
| `MATCHDAY_API_BASE_URL` | Variable | Exact deployed API base URL |
| `FIREBASE_WEB_API_KEY` | Secret | Public client key retained as a protected operational value to avoid accidental log exposure |

Configure required reviewers for the production GitHub environment. Never place service-account JSON, refresh tokens, Firebase CLI tokens, or provider credentials in repository files or GitHub variables.

## Cost and Operations Baseline

Before staging deployment, configure:

- Monthly budget thresholds with notifications at 50%, 80%, and 100% of actual spend and 100% of forecast spend.
- Cloud Logging retention appropriate for operational diagnosis without retaining raw authorization headers, tokens, UIDs, IP addresses, or request bodies.
- Uptime monitoring for `/v1/health` from at least two regions.
- Alerts for Functions 5xx rate, latency, invocation failures, scheduler failures, Firestore denial spikes, deletion-queue age, and abnormal spend.
- A dashboard covering request count, error rate, latency, scheduled sync success, cleanup success, and deletion backlog.
- Named owners for billing, incident response, privacy requests, and rollback.

The API emits generated request IDs. Operational logs must correlate with those IDs and stable event categories, never with publicly exposed Firebase UIDs or tokens.

## Authentication Verification

In development and staging, verify all of the following before production:

1. Anonymous account creation succeeds.
2. ID token refresh succeeds.
3. Invalid and revoked tokens receive `401` responses.
4. Non-anonymous Firebase identities receive `403` for installation-scoped writes.
5. Self-service deletion produces an idempotent receipt.
6. Retained raw responses and aggregate shards are corrected.
7. Scheduled account cleanup removes the anonymous account after the retry window.

Use the authenticated smoke test only in staging or during an approved production poll window:

```bash
npm run smoke:phase0 -- \
  --api-base-url "https://us-central1-PROJECT_ID.cloudfunctions.net/api" \
  --api-key "PUBLIC_FIREBASE_WEB_API_KEY" \
  --authenticated \
  --output phase0-smoke-staging.json
```

Add `--require-open-poll` only when an open confidence poll is expected. The smoke test never fabricates a production poll; it records a skipped submission when the discovered poll is not open.

## Release Preflight

Run from a clean release checkout:

```bash
npm run preflight:phase0 -- \
  --require-environments \
  --require-backup \
  --require-cloud-access \
  --require-clean \
  --backup backups/legacy-votes-YYYYMMDDTHHMMSSZ.json \
  --output phase0-preflight.json

npm run verify:phase0
```

The preflight report contains no credentials or raw authentication identifiers. Store it with deployment evidence; do not commit local legacy exports or generated operational records.

## Exit Criteria

- Three distinct Firebase project IDs are recorded and aliased.
- Firestore and Functions regions are confirmed.
- Development and staging deployments pass public and authenticated smoke tests.
- Production deployer identity is keyless and repository-restricted.
- Production has manual GitHub environment approval.
- Budgets, alerts, logging, dashboards, and uptime checks are active.
- Anonymous identity creation, refresh, deletion, and cleanup are proven in staging.
- The immutable legacy export location and checksum are recorded.
- A monitored support address, hosted privacy URL, and rollback owner are assigned.
