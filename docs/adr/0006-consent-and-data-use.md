# ADR 0006: Consent and Data Use

- **Status:** Accepted
- **Date:** August 3, 2026
- **Owners:** Product, privacy, security, and analytics

## Context

The strategic product can create useful aggregate sentiment, timing, regional, and engagement signals. Those uses have different user expectations and risks. A polling action should not become hidden consent for passive analytics, location inference, advertising, or external data sharing.

## Decision

- Use just-in-time disclosure for a poll response: submitted choice, anonymous-installation identity, aggregate publication, raw retention, and uniqueness limitation.
- Treat notification permission, passive product analytics, and coarse regional analytics as separate optional choices with separate controls.
- Default passive analytics and regional analytics off. No feature may require those consents unless technically necessary and plainly explained.
- Do not request browser history, tab contents, page content, precise geolocation, contacts, or unrelated host access.
- Do not derive region from GPS. Any future coarse region program requires explicit opt-in, server-side coarse mapping, minimum publication thresholds, revocation, and documented infrastructure-log review.
- Publish only aggregate data that passes minimum-count and methodology checks. Do not expose raw responses, UIDs, push tokens, or installation records.
- Prohibit sale, personalized advertising, data-broker sharing, and undisclosed club, sponsor, or partner access.
- Keep data inventory, privacy policy, Chrome Web Store disclosures, runtime host permissions, retention jobs, and public methodology synchronized in the same release.
- Support authenticated deletion of every enabled data class before that class expands. Compatibility polling now deletes retained raw responses and corrects aggregate shards; later analytics, push, consent, and regional systems must join the same deletion workflow before launch.

## Retention Baseline

- Extension-local operational state: until cleared or uninstalled.
- Raw compatibility poll responses: 90 days after the match.
- Published aggregates: historical product data, with methodology and identity class retained.
- Infrastructure logs: shortest operationally sufficient period, with access control and redaction reviewed before production expansion.

## Consequences

- Some potentially valuable datasets remain unavailable until users affirmatively opt in.
- Public data claims require methodology labels and cannot imply representativeness.
- Any future external data access is a new product, legal, privacy, and security decision rather than a silent extension of this ADR.
