# Universal Git Workflow Policy

_For all projects by Tony Martinez. Applies to all contributors — human and AI alike._

---

## Table of Contents

1. [Branching Strategy](#branching-strategy)
2. [Commit Standards](#commit-standards)
3. [AI Contributor Policy](#ai-contributor-policy)
4. [CI/CD & Branch Protection](#cicd--branch-protection)
5. [Day-to-Day Workflow Recipes](#day-to-day-workflow-recipes)
6. [Quick Reference Card](#quick-reference-card)

---

## Branching Strategy

This project follows a structured branching model with a two-tier permanent branch hierarchy and short-lived topic branches. All merges use `--no-ff` to preserve branch topology. Direct pushes to `main` or `develop` are prohibited; all changes flow through pull requests.

---

### Branch Hierarchy

```
origin/main          ← production-ready, tagged releases only
    │
origin/develop       ← integration branch; all work lands here first
    │
    ├── feature/*    ← new user-facing capabilities
    ├── fix/*        ← non-urgent bug fixes
    ├── hotfix/*     ← urgent production patches (branch off main)
    ├── chore/*      ← builds, config, deps, tooling, store assets
    └── release/*    ← release-candidate stabilization (optional)
```

---

### ASCII Relationship Diagram

```
main     ────────────────────────────────────────────────────────► (tagged releases)
              ▲                                        ▲
              │  merge --no-ff + tag                   │  merge --no-ff + tag
              │                                        │
develop  ─────┼──────────────────────────────────────────────────►
              │       ▲           ▲           ▲
              │       │ PR merge  │ PR merge  │ PR merge
              │       │           │           │
feature/x ───┘        │           │           │
                  fix/y ──────────┘           │
                                    chore/z ──┘


hotfix/* flow (emergency only — branches from main, merges into main AND develop):

main     ──────────────────────┬──────────────────────────────────►
                               ▲  merge --no-ff + tag
hotfix/issue ──────────────────┤
                               │
develop  ──────────────────────┴──────────────────────────────────►
                               ▲  also merge --no-ff here


release/* flow (optional freeze period):

develop  ──────┬──────────────────────────────────────────────────►
               │                            ▲  merge --no-ff back
release/x.y.z ─┤                            │
               │                            │
main     ───────────────────────────────────┴──────────────────────►
                                            ▲  merge --no-ff + tag
```

---

### Branch Reference Table

| Branch | Purpose | Branches From | Merges Into | Notes |
|---|---|---|---|---|
| `main` | Shipped, production-ready code. Every commit represents a tagged release. | — | — | No direct pushes. Tag every merge with a semantic version. |
| `develop` | Living integration branch. Reflects the state of the next release. | `main` (created once) | `main` via `release/*` or direct merge | No direct pushes. All topic branches target this first. |
| `feature/*` | New user-facing capability or behavior. | `develop` | `develop` | Delete branch after merge. One logical feature per branch. |
| `fix/*` | Non-urgent bug fix that can wait for the next planned release. | `develop` | `develop` | Delete branch after merge. |
| `hotfix/*` | Emergency patch for a production defect requiring an immediate release. | `main` | `main` **and** `develop` | Requires two PRs. Tag a patch version on merge to `main`. Back-merge to `develop` is mandatory. |
| `chore/*` | Maintenance work: dependency updates, build config, CI, store assets, tooling. | `develop` | `develop` | No production behavior change. |
| `release/*` | Release-candidate freeze and final QA stabilization. | `develop` | `main` **and** `develop` | Optional. Use when a freeze period is needed before shipping. Requires two PRs. |

---

### Naming Convention Rules

Branch names use a `type/kebab-case-description` format. The description must be lowercase, hyphen-separated, and specific enough to identify the work without reading the code.

**`feature/`** — new capability being added

```
feature/merchant-api-integration
feature/offer-tooltip-ui
feature/serp-position-tracking
feature/analytics-opt-in
```

**`fix/`** — non-urgent defect correction

```
fix/banner-z-index-overlap
fix/storage-cache-expiry
fix/serp-selector-update
fix/google-serp-selector-drift
```

**`hotfix/`** — urgent production patch only; branches from `main`, not `develop`

```
hotfix/csp-violation-crash
hotfix/manifest-permission-error
hotfix/host-permission-missing
```

**`chore/`** — build, config, dependency, CI, or store-listing work

```
chore/update-vite-5
chore/add-playwright-tests
chore/cws-store-listing-fix
chore/merchant-data-pipeline
```

**`release/`** — release stabilization; named after the target version

```
release/0.4.0
release/1.0.0
```

---

### Merge Strategy

| Rule | Detail |
|---|---|
| Always `--no-ff` | Every merge uses `git merge --no-ff`. Fast-forward merges are prohibited so branch history is always preserved in the graph. |
| No direct pushes | `main` and `develop` are protected. All changes arrive via pull request, regardless of author. |
| PR required | Every topic branch (`feature/*`, `fix/*`, `hotfix/*`, `chore/*`, `release/*`) must be merged through a reviewed and approved PR. |
| Status checks must pass | PRs targeting `main` or `develop` require `typecheck`, `lint`, `test`, and `build` to be green before merge is permitted. |
| `main` tagging | Every merge into `main` is immediately followed by a semantic version tag (`vMAJOR.MINOR.PATCH`). No untagged commits should exist on `main`. |
| Hotfix back-merge | After a `hotfix/*` branch merges into `main`, a second PR merging the same branch into `develop` is mandatory before the hotfix branch is deleted. |
| Release back-merge | After a `release/*` branch merges into `main`, a second PR merging it back into `develop` is mandatory to keep version bumps and changelog entries in sync. |
| Branch cleanup | Topic branches are deleted from the remote immediately after their PR is merged. |

---

## Commit Standards

### Format

All commit messages must conform to the [Conventional Commits v1.0.0](https://www.conventionalcommits.org/) specification.

```
<type>(<scope>): <summary>

[optional body]

[optional footer(s)]
```

- The summary line must not exceed **72 characters**
- The summary is written in the **imperative mood** (`add`, `fix`, `remove` — not `added`, `fixes`, `removing`)
- The summary is **lowercase** and has **no trailing period**
- The body, when present, explains the *why* — not a restatement of what the diff shows
- Footers use `Token: value` format (e.g., `Closes: #42`, `BREAKING CHANGE: ...`)

---

### Types

| Type | When to Use |
|---|---|
| `feat` | A new user-facing capability or behavior that did not exist before |
| `fix` | Corrects a defect — something that was broken and is now working as intended |
| `hotfix` | Emergency correction to a production defect; used only on `hotfix/*` branches |
| `chore` | Maintenance with no production code change: dependency updates, build config, tooling, CI pipeline, repo hygiene |
| `refactor` | Code restructuring that changes neither behavior nor bug status — purely internal reorganization |
| `docs` | Changes to documentation only: README, inline comments, JSDoc, wiki pages |
| `test` | Adding, correcting, or reorganizing tests; no production code is modified |
| `style` | Formatting-only changes: whitespace, indentation, semicolons, trailing commas — zero logic change |
| `perf` | A measurable performance improvement with no observable behavior change |

When in doubt between `fix` and `refactor`: if there was a bug, it is a `fix`. If the code simply looked or performed poorly, it is a `refactor` or `perf`.

---

### Scopes (Chrome Extension Project)

Scope is optional but strongly encouraged. It identifies the subsystem or module affected. For a Chrome extension project, use these scopes consistently:

| Scope | Covers |
|---|---|
| `content` | Content scripts injected into web pages |
| `background` | Background service worker or background page |
| `manifest` | `manifest.json` — permissions, host patterns, metadata |
| `ui` | Extension popup, options page, side panel, or any user-facing DOM |
| `store` | Chrome Web Store listing assets, descriptions, screenshots, promotional tiles |
| `ci` | GitHub Actions workflows, CI configuration, automated pipeline changes |
| `deps` | Dependency additions, removals, or version updates (`package.json`, lockfiles) |
| `injector` | The core link/offer injection logic |
| `config` | Runtime configuration, feature flags, domain lists, settings schema |

---

### Breaking Changes

A breaking change must be signaled in **both** of the following ways simultaneously:

1. Append `!` to the type and scope on the header line
2. Include a `BREAKING CHANGE:` footer describing what breaks and the migration path

```
feat(manifest)!: require activeTab permission instead of host wildcards

Users who previously granted broad host access will be prompted to
re-approve permissions on update. This removes the ability to run
the extension without explicit per-tab user interaction.

BREAKING CHANGE: host_permissions wildcard removed from manifest.json;
extension now requests activeTab at runtime instead of install time.
Users must re-grant access after updating.
```

Both signals must be present. A `!` without the footer, or a footer without the `!`, is an incomplete breaking change declaration.

---

### Concrete Examples

```
feat(injector): add cashback rate badge to matched product listings
feat(ui): add toggle to enable or disable injection per domain
fix(content): prevent duplicate injection when SPA route changes
fix(background): resolve race condition in affiliate link resolver on slow networks
hotfix(injector): stop injection from firing on checkout confirmation page
chore(deps): update webextension-polyfill to 0.10.0
chore(ci): add automated zip artifact upload to release workflow
refactor(injector): extract domain matching into standalone utility module
refactor(background): replace callback-based message handler with async/await
docs(store): update privacy policy section to reflect activeTab usage
test(injector): add unit tests for affiliate URL resolver edge cases
style(ui): normalize indentation and remove trailing whitespace in popup.js
perf(content): debounce MutationObserver callback to reduce injection overhead
feat(manifest)!: require activeTab permission instead of host wildcards

BREAKING CHANGE: host_permissions wildcard removed; extension now
requests activeTab at runtime. Users must re-grant access after update.
```

---

### Rules

- **Imperative mood.** Write the summary as a command: `add`, `fix`, `remove`, `update`, `replace`, `extract`. Not `added`, `fixes`, `removing`.
- **Lowercase.** The entire header line is lowercase, including the first word of the summary.
- **No trailing period.** The summary line does not end with a `.`
- **72-character limit on the summary line.** If you cannot fit the summary in 72 characters, the commit is likely doing too much.
- **One logical change per commit.** A commit that touches unrelated systems or fixes two separate bugs is two commits.
- **Body explains why, not what.** The diff shows what changed. The body explains the reasoning, constraints, or context that the diff cannot communicate.

---

### What NOT to Write

| Unacceptable | Why It Fails |
|---|---|
| `fixed stuff` | No type, no scope, no description of what was fixed or why |
| `wip` | Not a complete unit of work; should never be on a shared branch |
| `changes` | Entirely content-free |
| `update` | No object — update *what*, to *what*, and *why* |
| `misc fixes` | Implies multiple unrelated changes bundled into one commit |
| `Aug 14 updates` | Timestamps belong in `git log`, not commit messages |
| `per code review` | Describes the trigger, not the change |
| `Claude suggested this` | AI attribution is irrelevant to the codebase history |
| `hopefully fixes the thing` | Uncertainty and vagueness are not commit messages |
| `asdfgh` | Placeholder text that was never replaced |

A commit message is permanent. It will be read during a production incident at 2am, during a security audit, and by a new contributor trying to understand why a decision was made. Write accordingly.

---

## AI Contributor Policy

This section governs the use of AI tools (including but not limited to Claude, GitHub Copilot, Cursor, GPT-4, Gemini, and any agentic or automated systems) within this repository. The rules below are non-negotiable and apply to every commit, branch, tag, and pull request.

---

### Core Rule

**Every commit in this repository must be authored exclusively by Tony Martinez (GitHub: Tony5897).**

No AI system, automated agent, or third-party tool may appear — directly or indirectly — as an author, co-author, committer, or contributor in the git history, on GitHub, or in any associated metadata.

This is not a preference. It is a hard requirement with no exceptions.

---

### 1. Commit Authorship

- Every commit must carry the project owner's name and email as the `author` and `committer`.
- The expected identity for all commits in projects owned by Tony Martinez is:
  ```
  Author: Tony5897 <tony.martinez5897@gmail.com>
  ```
- No other name or email may appear in the `author` or `committer` fields of any commit object, under any circumstances.
- AI tools that draft or execute commits must pass through the configured git identity — they must not substitute their own.

---

### 2. Git Config Is Off-Limits to AI

AI tools are strictly forbidden from modifying git configuration at any scope.

**Prohibited actions:**
- `git config --global user.name <any value>`
- `git config --global user.email <any value>`
- `git config user.name <any value>` (local)
- `git config user.email <any value>` (local)
- Modifying `.git/config`, `~/.gitconfig`, or `~/.config/git/config` directly
- Setting `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, or `GIT_COMMITTER_EMAIL` environment variables to any value other than the project owner's identity

The git identity belongs to Tony Martinez. AI tools operate within it — they do not touch it.

---

### 3. No Co-Authored-By Trailers

AI tools must never append `Co-authored-by:` trailers to commit messages.

**Prohibited trailer formats include (but are not limited to):**
```
Co-authored-by: Claude <noreply@anthropic.com>
Co-authored-by: GitHub Copilot <copilot@github.com>
Co-authored-by: GPT-4 <openai@example.com>
Co-authored-by: AI Assistant <ai@example.com>
```

Any trailer attributing authorship, assistance, or co-authorship to an AI system is forbidden. Commit messages must contain no trailers beyond what the project owner explicitly chooses to include.

---

### 4. No AI Attribution in Any Artifact

AI tools must never insert language identifying AI involvement into any of the following:

**Commit messages:**
- No phrases such as: `Generated by Claude`, `Written by AI`, `AI-assisted`, `Drafted with Copilot`, `Created using GPT`, or any variation thereof.

**Code comments:**
- No inline comments such as: `// Generated by Claude`, `# AI-written`, `/* Copilot suggestion */`, or equivalent.

**File headers:**
- No headers such as `# This file was generated by Claude AI` or `# Auto-generated with GitHub Copilot`.

**Documentation (README, CHANGELOG, inline docs, JSDoc, etc.):**
- No attributions, footnotes, or disclosures crediting AI tools for content generation.

**Pull request bodies and descriptions:**
- No language indicating the PR was drafted, summarized, or written by an AI tool.

If AI tooling was used, that fact is implicit in the development process and is not surfaced anywhere in the repository's artifacts.

---

### 5. No Separate AI Identity or Credentials

AI tools must not create, use, or impersonate a separate git identity to perform actions in this repository.

**Prohibited:**
- Creating or using a GitHub personal access token issued to or associated with an AI service account
- Using an SSH key tied to a bot or AI service account to push commits or interact with the remote
- Creating a GitHub account, bot account, or machine user that acts on behalf of an AI tool
- Authorizing an AI tool with OAuth scopes that allow it to commit or push as an independent actor

All remote operations (push, fetch, clone, PR creation) must occur through the project owner's authenticated credentials only.

---

### 6. Commit Message Voice and Style

Commit messages must read as if Tony Martinez wrote them — because, for the record, he did.

**Required style:**
- Written in the imperative mood for the subject line (e.g., `fix login redirect bug`, `add cashback injection for matched merchants`)
- Past-tense or intentional framing in the body where context is provided
- Concise, direct, and free of filler language

**Prohibited AI phrasing patterns:**
- `Certainly! Here is a commit message:`
- `As an AI language model...`
- `This commit was generated to...`
- Overly verbose, padded, or sycophantic commit message bodies
- Any hedging constructions that sound machine-generated

If an AI tool drafts a commit message, the project owner must review and approve it before committing. The message must pass the standard: would a human developer, reading this log in six months, have any reason to suspect a machine wrote it?

---

### 7. Auditing the Git Log for AI Fingerprints

Run the following commands periodically and before any public release to verify the commit history is clean.

**Check all author identities in the log:**
```bash
git log --format="%H %an <%ae>" | sort -u
```
Every line must show `Tony5897 <tony.martinez5897@gmail.com>`. Any other identity is a violation.

**Check all committer identities:**
```bash
git log --format="%H %cn <%ce>" | sort -u
```
Same expectation applies.

**Scan commit messages for AI attribution keywords:**
```bash
git log --format="%H %s %b" | grep -iE \
  "co-authored-by|generated by|written by ai|ai-assisted|copilot|claude|chatgpt|gpt-4|openai|anthropic|gemini"
```
This command must return no output. Any match is a violation.

**Scan for AI attribution in file content:**
```bash
grep -rn --include="*.js" --include="*.ts" --include="*.py" --include="*.md" \
  -iE "generated by|ai-assisted|co-authored|copilot|claude|chatgpt" .
```
All matches must be reviewed and removed before publishing.

**Verify a specific commit's full metadata:**
```bash
git show --stat <commit-hash>
git cat-file -p <commit-hash>
```
Inspect the raw commit object to confirm author, committer, and message body are clean.

---

### 8. Remediation: Fixing a Violation

If an AI fingerprint is found in the git history, it must be removed before the branch is merged or made public.

**If the violation is in the most recent commit only:**
```bash
# Amend the author identity
git commit --amend --author="Tony5897 <tony.martinez5897@gmail.com>" --no-edit

# Or amend the commit message to remove AI language
git commit --amend
# Edit the message in the editor, save and close
```

**If the violation is in multiple recent commits:**
```bash
# Interactively rebase the last N commits
git rebase -i HEAD~N
# Mark each offending commit as 'edit', then for each:
git commit --amend --author="Tony5897 <tony.martinez5897@gmail.com>"
git rebase --continue
```

**If the violation is deep in history (full history rewrite — use git-filter-repo):**
```bash
git filter-repo --name-callback 'return b"Tony5897"' \
                --email-callback 'return b"tony.martinez5897@gmail.com"'
```

**After any history rewrite on a shared or published branch:**
- Coordinate with all collaborators before force-pushing.
- Force-push with `git push --force-with-lease` (never bare `--force`) to reduce the risk of overwriting concurrent work.
- Re-run the audit commands above to confirm the history is clean before re-publishing.

---

### Summary

| Rule | Status |
|---|---|
| All commits authored by Tony5897 | **Required** |
| AI modification of git config | **Forbidden** |
| `Co-authored-by:` AI trailers | **Forbidden** |
| AI attribution in commit messages | **Forbidden** |
| AI attribution in code, comments, docs | **Forbidden** |
| Separate AI git identity or credentials | **Forbidden** |
| Human-voice commit messages | **Required** |
| Periodic log audits | **Required** |
| Prompt remediation of violations | **Required** |

---

> **Hard stop.** Before pushing any branch or opening any PR, run `git log --format="%an <%ae>" | sort -u`. Every single line must read `Tony5897 <tony.martinez5897@gmail.com>`. If any other name or email appears — from an AI tool, a misconfigured environment, or any other source — do not push. Fix the authorship using the remediation steps in Section 8, re-audit, and only proceed when the log is clean. There are no exceptions to this rule and no urgency that overrides it.

---

## CI/CD & Branch Protection

### GitHub Actions CI

Every push and pull request to **any branch** must pass the following jobs before merging is permitted:

| Job | Trigger | Description |
|-----|---------|-------------|
| `typecheck` | All branches | Runs `tsc --noEmit` to enforce TypeScript correctness |
| `lint` | All branches | Runs ESLint across all source files; zero warnings permitted |
| `test` | All branches | Runs the full test suite; coverage thresholds must be met |
| `build` | All branches | Produces a production build; fails if the output directory is not generated |
| `package-artifact` | `main` only | Zips the build output into a versioned `.zip` artifact and uploads it for Chrome Web Store submission |

A representative workflow structure:

```yaml
on:
  push:
    branches: ["**"]
  pull_request:
    branches: ["**"]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx eslint . --max-warnings 0

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build

  package-artifact:
    if: github.ref == 'refs/heads/main'
    needs: [typecheck, lint, test, build]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: |
          VERSION=$(node -p "require('./package.json').version")
          zip -r "extension-v${VERSION}.zip" dist/
      - uses: actions/upload-artifact@v4
        with:
          name: extension-${{ github.sha }}
          path: "*.zip"
          retention-days: 90
```

---

### Branch Protection Rules

Configure the following in **GitHub Settings → Branches → Branch protection rules**.

#### `main`

| Setting | Value |
|---------|-------|
| Require a pull request before merging | Enabled |
| Required number of approvals | 1 |
| Dismiss stale PR approvals when new commits are pushed | Enabled |
| Require status checks to pass before merging | Enabled |
| Required status checks | `typecheck`, `lint`, `test`, `build` |
| Require branches to be up to date before merging | Enabled |
| Require conversation resolution before merging | Enabled |
| Allow force pushes | **Disabled** |
| Allow deletions | **Disabled** |
| Do not allow bypassing the above settings | Enabled (applies to administrators) |

#### `develop`

| Setting | Value |
|---------|-------|
| Require a pull request before merging | Enabled |
| Required number of approvals | 0 |
| Require status checks to pass before merging | Enabled |
| Required status checks | `typecheck`, `lint`, `test`, `build` |
| Require branches to be up to date before merging | Enabled |
| Allow force pushes | **Disabled** |
| Allow deletions | **Disabled** |

> After adding the required status checks by name in the GitHub UI, confirm the check names exactly match the `jobs.<job-id>` keys in the workflow file. A mismatch silently renders the protection rule inert.

---

### Release Tagging

All releases must use **annotated tags** on `main` after the merge commit is verified clean.

```bash
# Confirm you are on main and it is clean
git checkout main
git pull origin main

# Create an annotated tag with a release message
git tag -a v1.2.3 -m "Release v1.2.3: <one-line summary of changes>"

# Push the tag to origin explicitly
git push origin v1.2.3
```

Tag format: `v{major}.{minor}.{patch}` — the leading `v` is required. Do not push tags using `git push --tags`; push each tag individually to avoid accidentally publishing stale or test tags.

---

### SemVer Rules

#### Patch bump (`x.y.Z`)

- Bug fixes that restore previously working behavior
- Internal refactors with no change to functionality
- Dependency updates with no API or behavior changes
- Performance improvements with no feature changes

#### Minor bump (`x.Y.0`)

- A new user-visible feature added in a backward-compatible way
- A new supported site, domain pattern, or integration added
- A new permission requested that does not break existing users

#### Major bump (`X.0.0`)

- A breaking change to stored user data requiring a migration
- The extension is rebranded or its core purpose changes
- A previously supported behavior is intentionally removed
- The manifest version changes (e.g., MV2 → MV3)

> The Chrome Web Store enforces that the version in `manifest.json` is strictly greater than the currently published version. The version in `manifest.json` and `package.json` must be kept in sync and committed together in the same release commit.

---

### What Never to Do

- **`git commit --no-verify`** — Pre-commit hooks exist to catch errors before they reach CI. Bypassing them defeats the purpose of the pipeline.
- **`git push --force` on `main` or `develop`** — Force-pushing rewrites history on shared branches, breaking collaborators' local state and invalidating CI results.
- **Skipping or bypassing required status checks** — No merge may proceed while any required check is failing or pending, regardless of urgency. A failing build is not an exception; it is a blocker.
- **Bypassing branch protection rules as an administrator** — This capability must not be used.
- **Tagging directly on a feature or development branch** — Release tags must only be created on `main` after the merge is complete and CI has passed.
- **Committing directly to `main` or `develop`** — All changes arrive via pull request.

---

## Day-to-Day Workflow Recipes

### 1. Starting a New Feature (from `develop`)

```bash
git checkout develop
git pull origin develop             # always pull before branching to avoid stale state
git checkout -b feature/my-feature-name
```

---

### 2. Starting a Bug Fix (from `develop`)

```bash
git checkout develop
git pull origin develop
git checkout -b fix/short-description-of-bug
```

---

### 3. Starting an Emergency Hotfix (from `main`)

```bash
# Branch from main — the exact state users are experiencing
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug-description

# Make your fix and commit
git add <affected-files>
git commit -m "hotfix(<scope>): <short description>"

# Merge into main and tag
git checkout main
git merge --no-ff hotfix/critical-bug-description
git tag -a v1.2.1 -m "Hotfix: <short description>"
git push origin main --follow-tags

# Back-merge into develop so the fix is not lost in future releases
git checkout develop
git pull origin develop
git merge --no-ff hotfix/critical-bug-description
git push origin develop

# Clean up
git branch -d hotfix/critical-bug-description
git push origin --delete hotfix/critical-bug-description
```

---

### 4. Preparing a Release

```bash
# Cut the release branch from develop
git checkout develop
git pull origin develop
git checkout -b release/1.3.0

# Bump the version in manifest.json + package.json, update CHANGELOG
# Only version bumps and release-prep changes on this branch — no new features
git add manifest.json package.json CHANGELOG.md
git commit -m "chore: bump version to 1.3.0"

# Merge into main and tag
git checkout main
git pull origin main
git merge --no-ff release/1.3.0
git tag -a v1.3.0 -m "Release version 1.3.0"
git push origin main --follow-tags

# Merge back into develop so the version bump is not lost
git checkout develop
git merge --no-ff release/1.3.0
git push origin develop

# Clean up
git branch -d release/1.3.0
git push origin --delete release/1.3.0
```

---

### 5. Keeping Your Branch Up to Date with `develop`

```bash
git checkout develop
git pull origin develop
git checkout feature/my-feature-name

# Rebase replays your commits on top of the latest develop,
# keeping a linear history and avoiding unnecessary merge commits
git rebase develop

# If there are conflicts, resolve each one then:
# git add <resolved-files>
# git rebase --continue

# Force-push is required after rebase, but ONLY on your own topic branch
git push origin feature/my-feature-name --force-with-lease
```

---

### 6. Cleaning Up After a Merged Branch

```bash
git checkout develop
git pull origin develop

git branch -d feature/my-feature-name       # -d refuses deletion if not fully merged
git push origin --delete feature/my-feature-name

# Prune stale remote-tracking references
git fetch --prune
```

---

### 7. Undoing a Bad Commit Before Pushing

```bash
# Undo the last commit, keep changes staged
git reset --soft HEAD~1

# Undo the last commit, unstage changes (files remain modified on disk)
git reset HEAD~1

# Undo the last commit and discard changes entirely (destructive)
git reset --hard HEAD~1

# Safe only because the commit has NOT been pushed yet.
# Once pushed, use `git revert` instead — see recipe 8.
```

---

### 8. Reverting a Bad Commit After Pushing

```bash
# Find the SHA of the commit to undo
git log --oneline -10

# Create a new commit that is the exact inverse — never rewrites history
git revert <commit-sha> --no-edit

git push origin <your-branch>

# NEVER use git push --force on develop or main to erase a pushed commit.
```

---

### 9. Checking Branch Cleanliness Before Submitting a PR

```bash
# 1. Confirm you are on the right branch
git branch --show-current

# 2. Verify no uncommitted changes will be left out
git status

# 3. Review the exact diff your PR introduces
git diff develop...HEAD

# 4. Review commit history — check messages are clean and purposeful
git log develop..HEAD --oneline

# 5. Confirm your branch is up to date with develop
git fetch origin
git log HEAD..origin/develop --oneline   # empty = fully up to date

# 6. AI identity audit — must pass before every push
git log --format="%an <%ae>" | sort -u
# Every line must read: Tony5897 <tony.martinez5897@gmail.com>
```

---

## Quick Reference Card

| Branch Prefix | Use Case | Base Branch | Merge Target |
|---|---|---|---|
| `feature/*` | New user-facing capability or behavior | `develop` | `develop` |
| `fix/*` | Non-urgent bug fix for the next planned release | `develop` | `develop` |
| `hotfix/*` | Emergency production patch requiring immediate release | `main` | `main` AND `develop` |
| `chore/*` | Build config, dependencies, CI, tooling, store assets | `develop` | `develop` |
| `release/*` | Release-candidate stabilization and version bump | `develop` | `main` AND `develop` |

---

_This document is the source of truth for git practices in all projects. When in doubt, follow this — not what feels convenient._
