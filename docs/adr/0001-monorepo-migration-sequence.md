# ADR 0001: Monorepo Migration Sequence

- **Status:** Accepted
- **Date:** August 3, 2026
- **Owners:** Product engineering

## Context

The repository began as a deployable Chrome extension with Safari conversion scripts. The strategic product adds a web application, shared schemas, provider adapters, backend services, and much later an iOS client. Moving every file before the compatibility migration would combine a data-integrity cutover with a high-churn repository rewrite and make rollback harder.

## Decision

Use an incremental monorepo migration:

1. Keep the Chrome compatibility release deployable from the repository root through the legacy polling grace period.
2. Establish the backend under `services/api` without changing the existing extension entry points.
3. Introduce `apps/extension`, `apps/web`, and shared `packages/*` only after the authenticated API is live and the rollback package is retained.
4. Move code by deployable boundary, not by file type. Each move must preserve an independently buildable artifact and a documented rollback.
5. Share contracts, canonical match models, provider fixtures, design tokens, and telemetry schemas. Do not share browser-specific storage or UI implementation by abstraction alone.
6. Keep iOS outside the active workspace until Chrome and web contracts are stable and measured.

The intended post-migration shape is:

```text
apps/extension
apps/web
services/api
packages/contracts
packages/providers
packages/design-tokens
packages/test-fixtures
```

## Consequences

- Phase 0 has temporary root-level extension files and a nested API service.
- CI must validate both dependency trees during the transition.
- Repository cleanup is deferred, but production migration risk is lower.
- Shared packages require explicit consumers and tests; they are not created merely to satisfy a target diagram.

## Revisit Trigger

Begin the directory migration after extension `1.0.5` is published, the authenticated API is stable, and the minimum legacy grace period is underway.
