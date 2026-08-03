# ADR 0003: Provider Adapter Boundary

- **Status:** Accepted
- **Date:** August 3, 2026
- **Owners:** Data platform engineering

## Context

Schedule, standings, lineup, injury, and live-event data differ in identifiers, timing, corrections, coverage, quotas, and permitted uses. An undocumented endpoint that works for a countdown is not automatically suitable for server redistribution or goal notifications. Provider replacement must not force client rewrites or corrupt historical identity.

## Decision

- Place every external sports source behind a provider adapter that emits a canonical internal model.
- Use provider event IDs only as source references. Generate stable internal team, competition, season, match, player, and event IDs with an explicit mapping table.
- Keep raw provider payloads out of client responses and long-term storage unless rights and retention allow them.
- Validate provider payloads strictly at the boundary and fail closed on malformed dates, absent identifiers, or unknown event states.
- Preserve source, observed time, provider revision, and canonical revision for reconciliation.
- Maintain replay fixtures for Timbers and Thorns cases including postponement, cancellation, extra time, penalties, duplicate events, correction, and out-of-order delivery.
- Separate the bootstrap schedule provider decision from the live-alert provider decision.

## Live-Alert Gate

A provider cannot drive goal, lineup, card, final-whistle, or Live Activity behavior until measured evidence covers rights, stability, update latency, correction behavior, quotas, incident support, and both Timbers and Thorns competitions. Synthetic fixtures may prove software behavior but not provider capability or rights.

## Current Phase 0 Position

The strict ESPN schedule adapter is a bootstrap implementation spike for Timbers poll windows. It is not an endorsement, a contractual data-rights finding, or evidence that ESPN is suitable for live alerts. Thorns production support remains gated on a provider evaluation that covers NWSL data.

## Consequences

- Clients receive one versioned contract regardless of source.
- Provider changes are isolated but mapping and replay testing become permanent engineering work.
- Features remain intentionally unavailable when evidence does not pass the relevant gate.
