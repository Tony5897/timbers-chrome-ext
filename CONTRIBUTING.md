# Timbers Matchday — Contributing & Workflow

## Branch Protection Rules

Direct pushes to `main` or `develop` are forbidden. All changes go through a pull request reviewed and merged by the repository owner.

---

## PR Workflow (required for every change)

1. **Branch off `develop`**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/short-description
   ```

2. **Commit to the feature branch only**
   ```bash
   git add <specific files>
   git commit -m "type: description"
   ```

3. **Push the feature branch**
   ```bash
   git push origin feature/short-description
   ```

4. **Open a PR targeting `develop`**
   ```bash
   gh pr create --base develop --title "..." --body "..."
   ```

5. **Owner reviews and merges — do not merge your own PR**

`develop` → `main` is merged separately by the owner after review.

---

## Branch Naming

| Type | Pattern | Example |
|---|---|---|
| Bug fix | `fix/...` | `fix/team-name-wrapping` |
| Feature | `feature/...` | `feature/next-match-api` |
| Data update | `data/...` | `data/fallback-mar-match` |
| Chore / config | `chore/...` | `chore/update-mailmap` |

---

## Forbidden Actions

- `git push origin main` — forbidden
- `git push origin develop` — forbidden
- `git push --force` on any protected branch — forbidden
- Merging your own PR — forbidden

---

## Project Structure

| File | Purpose |
|---|---|
| `manifest.json` | MV3, current release version, service worker, storage + alarms |
| `background.js` | Three-tier fetch: live → cache → fallback |
| `popup.js / popup.html / styles.css` | Popup UI, countdown, confidence poll |
| `runtime-config.js / auth.js / community.js` | Public runtime config, anonymous auth, compatibility API client |
| `services/api/` | Firebase Functions compatibility API and scheduled cleanup |
| `data/fallback.json` | Bundled fallback match data — keep current |
| `tests/` | Extension Jest tests — must stay green before any PR |

---

## ZIP Packaging (Chrome Web Store)

```bash
npm run package:extension
npm run verify:extension
```

Packaging follows runtime dependencies and fails on missing files, local telemetry configuration, source maps, service-account material, or secret-like content.

---

## CI

GitHub Actions runs linting, type checks, extension tests, API tests, emulator tests, and exact artifact verification. All must pass before merge.
