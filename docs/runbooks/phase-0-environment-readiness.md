# Phase 0 Environment Readiness

## Purpose

Establish isolated development, staging, and production Firebase environments with auditable deployment identity, cost controls, monitoring, and release evidence. Complete this runbook before using the production deployment sequence.

Firebase recommends a separate project for each release environment so test identities, data, rules, and scheduled workloads cannot contaminate production. Project IDs are operational identifiers, not branding; choose stable names and record the final values only after Firebase confirms availability.

## Environment Register

Complete this table with verified values. Do not invent or reserve project IDs in source control before the projects exist.

| Environment | Firebase alias | Firebase project ID | Firestore region | Functions region | Billing | Anonymous auth | Owner |
|---|---|---|---|---|---|---|---|
| Development | `development` | `timbers-matchday-dev` | `nam5` confirmed | `us-central1` | Billing disabled | Enabled; lifecycle verified | Tony Martinez |
| Staging | `staging` | `timbers-matchday-staging` | `nam5` confirmed | `us-central1` | Billing disabled | Protected deployment complete; lifecycle verified | Tony Martinez |
| Production | `production` | `timbers-matchday` | `nam5` confirmed | `us-central1` | Billing disabled | Disabled pending staging API | Tony Martinez |

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

1. Create or select three distinct Firebase projects. The registered development, staging, and production project IDs are recorded in the environment register and `.firebaserc`.
2. Upgrade staging and production only to the billing plan required by deployed Functions and scheduled jobs.
3. Create the default Firestore database in the independently approved region.
4. Enable anonymous Firebase Authentication through the independently approved `auth` component in `.github/workflows/phase0-deploy.yml`.
5. Register a web app in each environment and retain only its public web configuration.
6. Restrict each Firebase web API key to the intended project and required APIs where supported.
7. Add verified aliases after project creation:

   ```bash
   npx firebase-tools use --add
   ```

   The committed `.firebaserc` contains unique `development`, `staging`, and `production` aliases and is enforced by Phase 0 preflight.

8. Deploy and validate development first, then staging. Production remains blocked until staging evidence is complete.

## Deployment Identity

Create one deployer service account per environment. Do not reuse the Firebase runtime identity or a human owner account. Grant only permissions required to deploy the configured Authentication settings, Functions, Firestore indexes, and rules; review Firebase CLI permission failures individually rather than granting project-wide Owner.

Create a GitHub Workload Identity provider restricted to this repository:

- Repository: `Tony5897/timbers-chrome-ext`
- Allowed GitHub environments: `staging` and `production`
- Production deployment ref: `refs/heads/main`
- Required GitHub permission: `id-token: write`
- Credential model: Workload Identity Federation through the environment-specific deployer service account

The staging and production identities are provisioned as `github-deployer` service accounts with no user-managed keys. Each provider requires repository ID `954691057`, owner ID `92329104`, and the exact `.github/workflows/phase0-deploy.yml` workflow path. Each deployer has `Firebase Authentication Admin`, `Cloud Datastore Index Admin`, `Cloud Functions Admin`, `Service Usage Consumer`, and an environment-local custom role limited to Firebase Security Rules deployment. Do not broaden these grants to Owner, Editor, or Firebase Admin.

Firebase CLI's version-controlled Auth deployment invokes the Firebase provisioning endpoint even when the project, web app, and required APIs already exist. The staging deployer therefore also has an environment-local `Matchday Firebase Auth Provisioner` custom role containing only `firebase.projects.update` and `serviceusage.services.enable`. Those permissions were added individually from denied audit-log checks rather than by assigning a broad predefined administrator role. Recreate and independently review the same narrow role before the approved production Auth deployment.

After billing and the Functions build/runtime APIs are enabled, grant `Service Account User` on only the selected Functions runtime and Cloud Build service accounts. Verify those runtime identities are themselves least-privilege before the first API deployment.

In each GitHub environment, configure:

| Name | Type | Purpose |
|---|---|---|
| `GCP_PROJECT_ID` | Variable | Exact Firebase/Google Cloud project ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Variable | Full Workload Identity provider resource name |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | Variable | Environment-specific deployer service account email |
| `MATCHDAY_API_BASE_URL` | Variable | Exact deployed API base URL |
| `FIREBASE_WEB_API_KEY` | Secret | Public client key retained as a protected operational value to avoid accidental log exposure |

The `staging` and `production` GitHub environments are configured with required review, branch policies, environment-specific variables, and protected web API keys. Never place service-account JSON, refresh tokens, Firebase CLI tokens, or provider credentials in repository files or GitHub variables.

## Cost and Operations Baseline

Before staging Functions deployment, activate an explicitly approved billing account. As of August 4, 2026, billing is disabled on all three projects and the only account visible to the operator is closed; no paid workload may be enabled until that external blocker is resolved.

After billing activation and before staging Functions deployment, configure:

- Monthly budget thresholds with notifications at 50%, 80%, and 100% of actual spend and 100% of forecast spend.
- Cloud Logging retention appropriate for operational diagnosis without retaining raw authorization headers, tokens, UIDs, IP addresses, or request bodies.
- Uptime monitoring for `/v1/health` from at least two regions.
- Alerts for Functions 5xx rate, latency, invocation failures, scheduler failures, Firestore denial spikes, deletion-queue age, and abnormal spend.
- A dashboard covering request count, error rate, latency, scheduled sync success, cleanup success, and deletion backlog.
- Named owners for billing, incident response, privacy requests, and rollback.

The API emits generated request IDs. Operational logs must correlate with those IDs and stable event categories, never with publicly exposed Firebase UIDs or tokens.

## Staging Deployment Evidence

The non-billed staging foundation was deployed from commit `98e6b4214dc830ddc2258df54e63d71a8ef216b9` on August 4, 2026:

- Protected [Auth deployment run 30884585063](https://github.com/Tony5897/timbers-chrome-ext/actions/runs/30884585063) passed release verification, Workload Identity Federation, exact-commit preflight, evidence upload, and anonymous-provider deployment. A direct Identity Platform configuration read confirmed anonymous sign-in is enabled.
- Protected [Firestore index deployment run 30884728558](https://github.com/Tony5897/timbers-chrome-ext/actions/runs/30884728558) passed the same gates. The `compatibilityDeletionRequests(status, deleteAfter)` composite index and `responses.identityHash` collection-group field index both subsequently reported `READY`.
- Staging billing remained disabled throughout. Functions, migration rules, production Auth, and Chrome Web Store publication were not deployed or changed.

Generated preflight reports remain attached to their protected GitHub Actions runs under the configured 90-day retention policy; do not duplicate them in source control.

## Authentication Verification

In development and staging, verify all of the following before production:

1. Anonymous account creation succeeds.
2. ID token refresh succeeds.
3. Invalid and revoked tokens receive `401` responses.
4. Non-anonymous Firebase identities receive `403` for installation-scoped writes.
5. Self-service deletion produces an idempotent receipt.
6. Retained raw responses and aggregate shards are corrected.
7. Scheduled account cleanup removes the anonymous account after the retry window.

The immediate authenticated smoke test covers account creation, refresh, deletion scheduling, receipt idempotency, and aggregate correction. Delayed cleanup requires separate post-window evidence from the scheduler execution, deletion-request state, and a failed token refresh or Authentication lookup; never infer completion from the immediate smoke report.

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
