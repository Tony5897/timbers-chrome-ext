# Timbers Matchday — Claude Code Rules

## CRITICAL: Branch & Merge Workflow

**Claude must NEVER push directly to `main` or `develop`.** No exceptions.

Every change — no matter how small — must go through a pull request that Tony reviews and merges manually.

### Required workflow for every change

1. Create a feature branch from `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b fix/description-of-change
   ```

2. Make changes, commit normally:
   ```bash
   git add <specific files>
   git commit -m "type: description"
   ```

3. Push the feature branch:
   ```bash
   git push origin fix/description-of-change
   ```

4. Open a pull request targeting `develop`:
   ```bash
   gh pr create --base develop --title "..." --body "..."
   ```

5. **Stop. Do not merge. Tony reviews and merges the PR manually.**

### Branch naming conventions

| Type | Pattern | Example |
|---|---|---|
| Bug fix | `fix/...` | `fix/team-name-wrapping` |
| Feature | `feat/...` | `feat/next-match-api` |
| Data update | `data/...` | `data/fallback-apr-match` |
| Chore / config | `chore/...` | `chore/update-mailmap` |

### Merge target

All PRs target **`develop`** first. Tony merges `develop` → `main` separately.

### What Claude must NEVER do

- `git push origin main` — forbidden
- `git push origin develop` — forbidden
- `git push --force` on any protected branch — forbidden
- Merge PRs — Tony does this
- Approve PRs — Tony does this

### Contributor identity

Claude must not add any `Co-Authored-By`, `Signed-off-by`, or any other trailer
to commit messages that references Claude, Anthropic, or any AI system.
Commit messages must look like sole-developer work by Tony Martinez.

## Project Overview

Chrome Extension (MV3) — Portland Timbers match info for fans.

- **manifest.json** — v1.0.1, MV3, service worker, storage + alarms permissions
- **background.js** — three-tier data fetch: live scrape → chrome.storage cache → bundled fallback
- **popup.js / popup.html / styles.css** — popup UI, countdown, confidence poll
- **telemetry.js** — GA4 Measurement Protocol helper (IIFE, never breaks extension)
- **telemetry.local.js** — NEVER commit, NEVER ship in ZIP (in .gitignore)
- **data/fallback.json** — bundled last-resort match data, must be kept current
- **tests/** — Jest, 27 tests, must stay green before any PR

## ZIP packaging (Chrome Web Store)

```bash
zip timbers-matchday-v<version>.zip \
  manifest.json popup.html popup.js background.js \
  telemetry.js styles.css icon.png \
  icons/icon-16.png icons/icon-48.png icons/icon-128.png \
  data/fallback.json
```

`telemetry.local.js` is NEVER included in any ZIP or CWS package.

## CI

GitHub Actions runs on every push: ESLint + Jest. Both must pass before merging.
