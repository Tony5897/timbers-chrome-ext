# Phase 0 Provider Spike

**Status:** Reduced schedule observation and software boundary complete; provider capability and rights gates not passed
**Date:** August 3, 2026

## Verified Reference Identity

- ESPN's Portland Timbers team page uses provider team ID `9723`.
- ESPN's Portland Thorns FC team page uses provider team ID `15362`.

These references establish only source identity for evaluation. They do not establish API availability, contractual rights, redistribution permission, notification rights, service levels, or suitability for production live events.

## Implemented Evidence

- A strict reduced schedule parser accepts source event ID and offset-aware kickoff time and fails closed on malformed payloads.
- Synthetic Timbers and Thorns replay fixtures exercise the same canonical schedule boundary without committing copied provider payloads.
- The Timbers compatibility adapter uses that parser to materialize temporary pre-kickoff poll windows.
- Provider fetches have an eight-second deadline and stable HTTP failure codes.
- A repeatable observation command stores only counts, identifier uniqueness, kickoff bounds, status, and request latency; it never stores the raw provider response.

## August 3, 2026 Reduced Observation

The 2026 schedule routes returned HTTP 200 for both teams during a single technical observation:

| Team | Competition | Query class | League path | Events | Unique event IDs | Observed latency |
|---|---|---|---|---:|---:|---:|
| Timbers | MLS | Results | `usa.1` | 18 | 18 | 1,870 ms |
| Timbers | MLS | Future fixtures | `usa.1` | 16 | 16 | 58 ms |
| Timbers | Leagues Cup | Results | `concacaf.leagues.cup` | 0 | 0 | 46 ms |
| Timbers | Leagues Cup | Future fixtures | `concacaf.leagues.cup` | 3 | 3 | 60 ms |
| Thorns | NWSL | Results | `usa.nwsl` | 18 | 18 | 43 ms |
| Thorns | NWSL | Future fixtures | `usa.nwsl` | 12 | 12 | 42 ms |

The initial route without `fixture=true` returned results ending August 2 and no future matches after the August 3 observation time. A follow-up proved that `fixture=true` is required for upcoming fixtures; the local extension and compatibility adapter were corrected accordingly. These are availability samples, not service-level measurements. Event counts were not compared with authoritative full-season fixture lists, and no conclusion about completeness, cups, corrections, future stability, or permitted use is drawn from them.

The MLS team route also omitted three August Leagues Cup fixtures. The compatibility adapter now merges and deduplicates the `usa.1` and `concacaf.leagues.cup` team fixture routes. The three reduced fixture observations align by date and venue with the club's published Leagues Cup phase-one schedule. Because the legacy release keys polls by kickoff timestamp, the API resolves one unambiguous provider poll within a one-hour tolerance while the Phase 1 canonical match-ID migration remains gated.

The club's MLS schedule lists the August 16 Chicago match at 3:30 p.m. Pacific, while the observed provider fixture currently resolves to 3:00 p.m. Pacific. The extension therefore keeps the reviewed fallback time when a same-opponent provider event differs materially and labels the source as fallback data. This protects the compatibility release from silently replacing a reviewed value, but it does not resolve which source will ultimately be authoritative.

No Thorns continental competition route has been identified. Two guessed provider league paths, `concacaf.w.champions.cup` and `concacaf.womens.champions.cup`, both returned HTTP 400 and are not enabled. Thorns support remains limited to the observed NWSL route until an identified, measured, and rights-approved source passes the gate.

The corrected reduced artifact was observed at `2026-08-03T11:04:46.443Z` and has SHA-256 `1875cbbcbf0156b54fb49959cae11ae21df9b34267723e62c48cea337afb5dbe`. The artifact remains outside source control because repeated operational observations are local evidence, not product source.

## Gate Status

| Capability | Timbers | Thorns | Decision |
|---|---|---|---|
| Team identity reference | Verified | Verified | Continue evaluation |
| Reduced schedule parser | Passing synthetic replay | Passing synthetic replay | Software boundary only |
| Reduced schedule routes | MLS and Leagues Cup queries return unique fixture IDs | NWSL queries return unique fixture IDs; continental route unidentified | Continue measurement |
| Production schedule completeness | Not measured | Not measured | Blocked |
| Stable match and competition IDs | Not measured | Not measured | Blocked |
| Standings and form | Not implemented | Not implemented | Blocked |
| Lineups and player identity | Not measured | Not measured | Blocked |
| Live events and corrections | Not measured | Not measured | Blocked |
| Display and redistribution rights | Not documented | Not documented | Blocked |
| Push-notification rights | Not documented | Not documented | Blocked |
| Quotas, cost, and incident support | Not documented | Not documented | Blocked |

## Next Measurement Work

1. Capture permitted, reduced observations for at least one Timbers and one Thorns match without committing credentials or prohibited raw payloads.
2. Record schedule completeness, identifier stability, update cadence, outage behavior, corrections, and competition coverage.
3. Evaluate documented commercial candidates against the weighted gate in the strategic plan.
4. Select a bootstrap schedule source independently from the live-alert source.
5. Keep goals, lineups, cards, substitutions, injuries, Player of the Match, and remote live notifications disabled until their specific data and rights gates pass.

Run the reduced schedule observation with:

```bash
npm --prefix services/api run observe:schedules -- --season 2026 --output ../../provider-observations/schedules-YYYYMMDDTHHMMSSZ.json
```

## Sources

- [Portland Timbers 2026 MLS schedule](https://www.timbers.com/news/timbers-announce-schedule-for-2026-mls-regular-season)
- [Portland Timbers 2026 Leagues Cup phase-one schedule](https://www.timbers.com/news/timbers-announce-schedule-for-phase-one-of-leagues-cup-2026)
- [ESPN Portland Timbers team page](https://www.espn.com/soccer/team/_/id/9723/portland-timbers)
- [ESPN Portland Thorns FC team page](https://www.espn.com/soccer/team/_/id/15362/portland-thorns-fc)
