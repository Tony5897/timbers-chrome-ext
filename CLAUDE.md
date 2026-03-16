# Timbers Matchday — Contributing & Workflow

## Branch Protection Rules

Direct pushes to `main` or `develop` are forbidden. All changes go through a pull request reviewed and merged by the repository owner.

---

## PR Workflow (required for every change)

1. **Branch off `develop`**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b fix/short-description
   ```

2. **Commit to the feature branch only**
   ```bash
   git add <specific files>
   git commit -m "type: description"
   ```

3. **Push the feature branch**
   ```bash
   git push origin fix/short-description
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
| Feature | `feat/...` | `feat/next-match-api` |
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
| `manifest.json` | MV3, v1.0.1, service worker, storage + alarms |
| `background.js` | Three-tier fetch: live → cache → fallback |
| `popup.js / popup.html / styles.css` | Popup UI, countdown, confidence poll |
| `telemetry.js` | GA4 Measurement Protocol (never breaks extension) |
| `telemetry.local.js` | **Never commit. Never ship in ZIP.** Lives in `.gitignore` |
| `data/fallback.json` | Bundled fallback match data — keep current |
| `tests/` | Jest, 27 tests — must stay green before any PR |

---

## ZIP Packaging (Chrome Web Store)

```bash
zip timbers-matchday-v<version>.zip \
  manifest.json popup.html popup.js background.js \
  telemetry.js styles.css icon.png \
  icons/icon-16.png icons/icon-48.png icons/icon-128.png \
  data/fallback.json
```

`telemetry.local.js` is never included.

---

## CI

GitHub Actions runs ESLint + Jest on every push. Both must pass before any PR can merge.
