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
| `packages/contracts/` | Shared Zod schemas and API/domain DTOs |
| `packages/domain/` | Shared team configuration, capabilities, and stable identifier rules |
| `services/api/` | Firebase Functions compatibility API and scheduled cleanup |
| `data/fallback.json` | Bundled fallback match data — keep current |
| `tests/` | Extension Jest tests — must stay green before any PR |

The repository uses npm workspaces with one root lockfile. Use Node 22 and install from the repository root:

```bash
npm ci
```

Do not create or maintain workspace-specific lockfiles.

---

## ZIP Packaging (Chrome Web Store)

```bash
npm run package:extension
npm run verify:extension
```

Packaging follows runtime dependencies and fails on missing files, local telemetry configuration, source maps, service-account material, or secret-like content.

Remove generated build, package, coverage, and emulator output before final review:

```bash
npm run clean
```

---

## CI

GitHub Actions exposes independent `lint`, `typecheck`, `test`, and `build` gates. The test gate covers extension, API, and emulator suites; the build gate produces and verifies the exact extension artifact. All four must pass before merge.

Run the complete local verification pipeline with Node 22 and Java 21 or later:

```bash
npm run verify:phase0
```

Phase 0 cloud deployments use the manually dispatched, environment-protected workflow in `.github/workflows/phase0-deploy.yml`. Authentication configuration, indexes, Functions, temporary migration rules, and final migration rules are separate approval actions. Chrome Web Store submission is never automated by this repository.
