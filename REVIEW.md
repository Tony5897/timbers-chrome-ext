# Local verification record

October 1, 2026. Baseline main: `7cb124a0b81f6230b431597ad0d86e5b9af0bf9b`.
Results apply to the local review patch on `feat/reviewable-repository`, not the
unchanged baseline or installed store binary. Record and retest the resulting
commit when publishing.

Node 22.23.2, npm 10.9.8, Java 21.0.12.1, macOS arm64:

```sh
npm ci
env -u DEBUG npm run verify:phase0
npm audit --omit=dev
npm audit
```

Passed: clean install, lint, workspace type-check, 76 extension tests, 87 API tests,
25 demo-project Firestore tests, API build, 16-file extension ZIP verification,
and store-asset/runtime-integrity checks. No production credentials or live writes
were used. An unpacked Chromium profile with external networking blocked opened
the popup and Standings/Settings tabs, displaying a delayed-data state without
uncaught page errors. Live auth, votes, deletion, and notifications were not exercised.

Popup tests now use Jest's instrumented module loader rather than raw script
injection. Popup statement coverage is 89.06%; total coverage across background,
popup, auth, and community is 73.14% statements. API/emulator results are separate.
The earlier zero popup result was not evidence that its behavior tests did nothing.

Production audit: zero advisories. Full audit: three moderate entries on one
development-only chain, `firebase-tools → @google-cloud/pubsub → @opentelemetry/core`,
for [Baggage allocation](https://github.com/advisories/GHSA-8988-4f7v-96qf).
This chain is absent from the extension ZIP and production dependency tree.
No compatible core-v1 fix was available; a forced major override or CLI downgrade
was not used. Keep emulator/development services local and track a compatible
upstream fix. This is a qualified remaining finding, not a repaired vulnerability.

Default develop remains `2287dcefc5ee49642cea5ffbd87b6fcad320bf4c`; main has four
unique commits and develop nine. No reconciliation/default-branch change occurred.
The store displayed version 1.0.5, but binary equality with the generated ZIP was
not checked. Edge/Safari support and live production behavior remain separate checks.
Dependabot's configuration must reach the default branch through a separately
reviewed change before its automation can run there.
