# Legacy Vote Cutover Record

This file is the template for the production migration record. Do not add the vote export itself to source control.

| Field | Value |
|---|---|
| Status | Local read-only snapshot verified; immutable archive pending |
| Firebase project | `timbers-matchday` |
| Export classification | `legacy_unverified` |
| Export time | `2026-08-03T09:33:25.143Z` |
| Immutable storage URI | Pending |
| Export record count | `2` |
| Export anomalies | `1`; document ID `9999000001` has an unexpected 10-digit format and remains unmodified in the source-preserving artifact |
| Export SHA-256 | `c2c9e0e4e418740be23db418c9672eba47cc7e41214797fb3ba7a8892a5cf010` |
| Operator | Local development snapshot; production operator attestation pending |
| Compatibility release | `1.0.5` |
| Chrome publication time | Pending |
| Grace-period start | Pending |
| Earliest final-rule date | Pending; at least 30 days after confirmed publication |
| Final-rule deployment | Pending |

Legacy totals are historical, unverified community counts. They are not unique-person data and must remain separate from the `integrity_controlled` namespace.

## Canonical Read Alias

The compatibility collection continues to use `legacy-{matchTimestamp}-confidence-v1` document IDs during the migration window so released clients, retained responses, aggregate shards, and deletion correction remain stable. Public platform clients do not receive or construct those storage IDs.

Newly synchronized poll windows persist a canonical alias in the form `poll-{matchId}-confidence-v1`, along with the stable match ID, team ID, and current match status. `GET /v1/polls/{pollId}/aggregate` resolves that alias inside the repository and returns only the canonical poll contract; postponed and cancelled matches are represented as void polls. Records created before the alias field existed remain readable through an exact, single-result provider-event fallback; multiple matches are treated as ambiguous and fail closed.

This alias is a compatibility bridge, not permission to merge `legacy_unverified` totals into `integrity_controlled` aggregates. Data classification remains determined by the collection and submission path described above.
