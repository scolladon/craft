# Design — public-front-door-completion

> Brief: finish the public front door with four small, independent items — an honest
> comparison table vs adjacent approaches, a devcontainer + Codespaces badge, community
> scaffolding (CONTRIBUTING.md, SECURITY.md, issue forms incl. an adapter request), and
> release discipline (CHANGELOG, tagged releases, a version badge) — so `plugin.json`'s
> version stops being the only maturity signal.
> Status: draft → self-reviewed ×3 → accepted-pending-ADR → **revised against ADR-500…507
> (DC-5 deviates: ADR-504), self-reviewed ×3, accepted**

## Context

### What exists today

- **README.md** (280 lines) is the front door. Badges: CI + License only (lines 7–8).
  Sections: Why / What craft is not (57) / Quickstart (68) / What a run looks like /
  What it costs, measured / When not to use craft / craft builds craft (177) / Make it
  yours / Beyond Claude Code / FAQ / Docs (264) / License. Line 189 carries the only
  in-prose version claim, `` Current status: `v1.0.0`. `` — nothing guards it. Line 274
  is the whole contributor entry point: `` Contributing to craft itself? Dev loop:
  `claude --plugin-dir /path/to/craft`. ``
- **`docs/guides/comparison.md`** is a measured n=1 cost experiment (plain prompt vs
  hand-staged vs craft on one refactor, with a `## Where craft lost` section). It is not a
  positioning table and must stay what it is.
- **`.github/`** holds only `CODEOWNERS` and `workflows/ci.yml` (jobs `ci`, `readme-drift`,
  `links`). The `ci` job installs tools inline (lines 27–34): `apt-get install bats
  shellcheck jq`, then a `wget` of mikefarah `yq` v4.44.3 **`linux_amd64` only**, then
  `bash scripts/ci.sh`. The `links` job runs lychee **offline** — relative links and
  `#fragments` are checked, external URLs are not.
- **Release state.** One tag, `v1.0.0` (lightweight, an ancestor of `main`), one GitHub
  release "craft v1.0.0" published 2026-07-25. `.claude-plugin/plugin.json` says
  `"version": "1.0.0"`; `.claude-plugin/marketplace.json` has no `version`. Since the tag:
  85 commits on `main` — 9 `feat`, 18 `fix`, 11 `docs`, 6 `test`, 40 `chore` (30 of them
  `chore(metrics)` run bookkeeping), 1 non-conventional subject. No subject carries `!` or
  `BREAKING` (`git log --format='%s%n%b' v1.0.0..main | grep -E '!:|BREAKING'` → empty).
- **GitHub repo state** (read-only `gh api`, 2026-10-12): public; issues on; discussions
  off; private vulnerability reporting **disabled** (`{"enabled":false}`) — ADR-504 needs
  no repo setting; community
  profile 42% (contributing, issue_template, code_of_conduct, pull_request_template all
  null). Labels: `bug documentation duplicate enhancement good first issue help wanted
  invalid question wontfix`.

### House patterns this feature must follow

- **Repo-shape facts are pinned by `node:test` files under `test/`**, auto-enumerated by
  `run_suite process test` in `scripts/ci.sh` (no registration edit; `test/every-test-file-registers.test.js`
  only checks the enumeration). Reference shapes: `test/plugin-structure.test.js`
  (existence asserts, Given/When/Then titles), `test/static-lints-ci.test.js` (PATH-stub
  binaries that log their argv to a file, then assert on the log), `test/readme-drift.test.js`
  (`withMutatedCopy` throwaway roots).
- **README guards.** `scripts/readme-drift.sh` → `engine/src/readme-drift-main.js` runs four
  sub-guards that *recompute* README claims from data (manifest snippet, phase names,
  telemetry, corpus counts). Two of its extractors read the **whole README**, not a region:
  `CORPUS_CLAIM = /\[(\d+)\s[^\]]*\]\((docs\/[^)]*\/)\)/g` turns any `[N …](docs/…/)` link
  into a guarded corpus claim. Its design doc (`readme-drift-guards.md`) already lists "the
  comparison table" as out of its scope.
- **Source hygiene scans README.md** (`test/source-hygiene.test.js`, `SCANNED_PATHS`):
  Class A forbids `stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise`;
  Class B forbids `\bgh\b|\bgithub\b` (case-sensitive `grep -rEn`), excusing only the
  canonical `github.com/scolladon/craft` token on README lines. CONTRIBUTING.md,
  SECURITY.md, CHANGELOG.md, `.github/**` and `docs/contributing/**` are **not** scanned.
- **`prose-lint`** runs on every touched `*.md` outside the ledger dirs (README.md,
  CONTRIBUTING.md, SECURITY.md, CHANGELOG.md, `docs/contributing/releasing.md`,
  `docs/contributing/maintainer-smokes.md`); ban list `delve, leverage, seamless, robust,
  "it's important to note", "in conclusion"`.
- **`test/plugin-evals-local-only.test.js`** scans every `scripts/*` file and every
  workflow for the eval CLI or an evals path, and every fenced eval command in README and
  guides for required flags. New scripts must not name evals; new docs link to
  `docs/contributing/maintainer-smokes.md` rather than quoting eval commands.
- **Live, non-CI checks** live in `docs/contributing/maintainer-smokes.md` as `## <name> —
  not CI-gated` sections (on demand, record the result).
- **Docs audience split.** Root `CONTRIBUTING.md` / `SECURITY.md` / `CHANGELOG.md` are
  GitHub-convention entry points; contributor depth stays in `docs/contributing/`
  (`docs/contributing/README.md` is its map table). `docs-structure-lint --audience docs`
  only fences `docs/` top level — root files are unaffected.
- **Outward actions are user-owned**: pushing tags, creating releases, changing repo
  settings (labels, prebuilds). No part does any of them, and none is a merge precondition.

### Pinned external behaviour (probed 2026-10-12, read-only, scratch in `<tmp>`)

**Badges and the README hygiene gate.** Each candidate line was run through the Class B
pattern with the canonical-URL strip, using both `/usr/bin/grep -rEn` and the JS regex:

| Candidate README line | Renders (shields/GitHub) | Class B verdict |
|---|---|---|
| `[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/scolladon/craft)` | 200 `image/svg+xml` | **TRIPS** (`github.com/codespaces`) |
| `[![Release](https://img.shields.io/github/v/release/scolladon/craft)](…)` | 200, title `release: v1.0.0` | **TRIPS** (`/github/`) |
| `[![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fscolladon%2Fcraft%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version)](CHANGELOG.md)` | 200, title `version: 1.0.0` | passes (no hit) |
| `[![Open in Codespaces](https://img.shields.io/badge/Open%20in-Codespaces-blue?logo=github)](https://codespaces.new/scolladon/craft)` | 200 | **TRIPS** (`logo=github`) |
| `[![Open in Codespaces](https://img.shields.io/badge/Open%20in-Codespaces-blue)](https://codespaces.new/scolladon/craft)` | 200, title `Open in: Codespaces` | passes (no hit) |

- The dynamic-JSON badge pointed at a **wrong path** still answers **200**, rendering
  `version: resource not found` — a silent failure only a repo test can catch.
- `https://codespaces.new/scolladon/craft` → 301 to `github.com/codespaces/new/scolladon/craft`.
  GitHub docs (`github/docs` @ `content/codespaces/…/facilitating-quick-creation-and-resumption-of-codespaces.md`)
  document `codespaces.new/OWNER/REPO` as the creation link; `?quickstart=1` opens a
  *resume* page, so it is not used.

**Plugin version semantics** (Claude Code docs, `code.claude.com/docs/en/plugins/host-marketplace`
and `/marketplace-reference`, fetched via ctx7; `claude --version` 2.1.296):

- Users "get a new copy only when the plugin's computed version differs"; "If you set
  `"version": "1.0.0"` and push new commits without changing it, users don't receive
  them." Version comes from `plugin.json` first, then the marketplace entry.
- "Don't set `version` in both" — `plugin.json` wins silently; `claude plugin validate`
  reports the mismatch.
- `claude plugin validate .` on today's tree: passes with 4 warnings (no marketplace
  description; three unquoted `${CLAUDE_PLUGIN_ROOT}` hook commands) — none version-related.
- Consequence (documented, not live-reproduced): marketplace installs of craft have been on
  the cached 1.0.0 copy through all 85 post-tag commits.

**Devcontainer pieces** (registry manifests read anonymously):

| Piece | Pinned fact |
|---|---|
| `mcr.microsoft.com/devcontainers/javascript-node:22` | same digest as `22-trixie` (Debian 13); `linux/amd64` + `linux/arm64`; `NODE_VERSION=22.23.3`; metadata `remoteUser: node`; bundles features `common-utils:2`, `git:1`, `node:2` |
| `ghcr.io/anthropics/devcontainer-features/claude-code:1` | resolves to 1.0.5, "Installs the Claude Code CLI globally" via npm; `installsAfter: ghcr.io/devcontainers/features/node`; no options |
| Debian trixie packages | `bats 1.11.1`, `shellcheck 0.10.0`, `jq 1.7.1`; **`yq 3.4.3` is the Python jq-wrapper, not mikefarah v4** — apt cannot supply the CI `yq` |
| mikefarah `yq` v4.44.3 assets | `yq_linux_amd64` and `yq_linux_arm64` both exist (arm64 matters for local devcontainers on Apple silicon) |
| devcontainer spec schema (`devContainer.base.schema.json` @ d424cc157e) | top-level `image`, `features`, `postCreateCommand`, `customizations`, `secrets`; `secrets` keys match `^[a-zA-Z_][a-zA-Z0-9_]*$` with `{description, documentationUrl}` values |
| Repo test parsing | `JSON.parse` rejects `//` comments → `devcontainer.json` must be strict JSON to be test-parsable; `createRequire('<repo>/engine/package.json')('js-yaml')` loads js-yaml 4.2.0 from a repo-root test |

No container was built: Docker's daemon is not running on this box and the `devcontainer`
CLI is not installed. The built-environment facts (passwordless `sudo` for `node`, `curl`
present, Claude Code login inside a Codespace) are **unverified** and go to a maintainer
smoke.

**Issue forms** (`github/docs` @ e85b5032f0, 2026-10-02, `syntax-for-issue-forms.md` +
`syntax-for-githubs-form-schema.md` + `configuring-issue-templates-for-your-repository.md`):

| Level | Required | Constraints |
|---|---|---|
| form file `.github/ISSUE_TEMPLATE/*.yml` | `name`, `description`, `body` | `name` unique across templates; optional `labels` — a label that does not exist is silently not added |
| body element | `type`, `attributes` | `type` ∈ `markdown, textarea, input, dropdown, checkboxes` (+ `upload`); `id` optional, `[A-Za-z0-9_-]`, unique per form, not allowed on `markdown` |
| required attributes | `markdown.value`; `textarea/input.label`; `dropdown.label`+`options`; `checkboxes.label`+`options` | dropdown `options` non-empty and distinct |
| `config.yml` | — | `blank_issues_enabled` (bool), `contact_links[]` of `{name, url, about}`; only effective on the default branch |
| form file, optional keys | — | `title` (string) pre-fills the issue title |
| `checkboxes.options[]` item | `label` | optional `required` (bool, default `false`) blocks submission until ticked — "only for public repositories" (craft is public) |

`https://github.com/<owner>/<repo>/issues/new?template=<file>` opens a given form
(`creating-an-issue.md`, same commit). Option-level `required` and `title` re-read at
`syntax-for-githubs-form-schema.md` / `syntax-for-issue-forms.md` @ e85b5032f0.

**Keep a Changelog 1.1.0** (keepachangelog.com, fetched): `## [Unreleased]` on top, then
`## [X.Y.Z] - YYYY-MM-DD` newest first; groups `Added / Changed / Deprecated / Removed /
Fixed / Security`; versions linkable; "Using commit log diffs as changelogs is a bad idea".

## Requirements

1. **R1 Comparison.** README carries a `## How craft compares` section with one table
   comparing craft to adjacent approaches. Every craft-column cell links into this repo
   (relative link, lychee-checked) as its evidence. No cell asserts a feature of a named
   external product without a source. The section holds **no digits**, so it can neither
   restate an unguarded number nor be read by readme-drift's whole-README extractors.
   `docs/guides/comparison.md` is linked, not duplicated.
2. **R2 Devcontainer.** `.devcontainer/devcontainer.json` (strict JSON) gives a container
   where `npm --prefix engine ci` has run, `bash scripts/ci.sh` has every tool it needs,
   and `claude` is on PATH, so `claude --plugin-dir .` loads the working copy. Its Node
   major equals the CI `setup-node` major.
3. **R3 Codespaces badge.** README carries an "Open in Codespaces" badge linking
   `https://codespaces.new/scolladon/craft`, rendered by a URL that passes source-hygiene
   unchanged. README states **no duration** for the Codespace start until the maintainer
   smoke has measured one.
4. **R4 Tool parity.** The CI `ci` job and the devcontainer install the same tool set
   (`bats shellcheck jq` + mikefarah `yq` v4.44.3) from one definition; the install picks
   the `yq` asset for the machine's architecture and fails loud on any other.
5. **R5 CONTRIBUTING.md** at root: the local loop (`npm --prefix engine ci`, `bash
   scripts/ci.sh`, prerequisites), the dev loop (`claude --plugin-dir <path-to-craft>`),
   Conventional Commits, the contribution model (DC-7), and a route into
   `docs/contributing/README.md` — it does not copy contributor docs. README line 274
   points at it.
6. **R6 SECURITY.md** at root: supported versions, the reporting route (ADR-504) — open a
   public issue that asks for a private contact and carries **no vulnerability details**;
   the maintainer replies with a private channel — with the no-details rule as the first
   line of the reporting section, and the scope (hooks, scripts and guards craft runs in a
   user's repo; adapter bindings are portability proofs). No repo setting is a precondition.
7. **R7 Issue forms** under `.github/ISSUE_TEMPLATE/`: bug report, feature request,
   adapter request, security contact request (no free-text field), and `config.yml`;
   each form satisfies the pinned schema; labels only from the repo's existing set. The adapter-request form asks for the facts a binding
   decision needs (headless execution surface, pre-execution deny surface, extension
   mechanism, subagent dispatch, docs link) — the columns of `adapters/README.md`.
8. **R8 CHANGELOG.md** at root in Keep a Changelog 1.1.0 shape, backfilled honestly: a
   `[1.0.0] - 2026-07-25` entry matching the v1.0.0 release notes, and the post-tag work
   curated (not dumped) from the 85 commits.
9. **R9 Version coherence**, enforced by test: the newest released CHANGELOG heading ==
   `plugin.json` version; every backticked `` `vX.Y.Z` `` in README == `v` + that version;
   `marketplace.json` entries carry no `version`; the README version badge reads exactly
   `.claude-plugin/plugin.json` at `$.version` and that file exists.
10. **R10 Release procedure** in `docs/contributing/releasing.md`: how to choose the bump,
    cut the CHANGELOG section, bump `plugin.json` (which is what ships the update to
    marketplace users), and — maintainer-only — tag and publish the release.
11. **R11 Gates stay green**: `bash scripts/ci.sh` (incl. shellcheck, source-hygiene,
    prose-lint, plugin-evals-local-only), `bash scripts/readme-drift.sh`, lychee offline.
    No AI-tooling trace and no absolute home path in any new file.

## Design

Four independent sub-items, each one atomic commit with its own test file. Part order
puts release scaffolding first so later parts can add their `[Unreleased]` bullet.

### 1. Release discipline (R8–R10)

**`CHANGELOG.md`** (root):

```markdown
# Changelog

All notable changes to craft are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version that ships to
plugin users is `.claude-plugin/plugin.json`'s `version`.

## [Unreleased]

### Added
- … curated from the `feat` subjects since v1.0.0 (orchestrator-tax hardening, context-cost
  cut, auto-compaction safety, decision-drift propagation, the local behavioural eval suite,
  the readme corpus-count recount, the codex hook-trust binding, status-tagged findings,
  the compaction estimate at Done)
### Fixed
- … curated from the `fix` subjects (one line per user-visible fix; eval-calibration and
  test-only fixes grouped)
### Changed
- … user-visible `docs` moves (docs split into `docs/guides/` and `docs/contributing/`)

## [1.0.0] - 2026-07-25

- … the v1.0.0 release notes ("First public release …" highlights), verbatim in substance

[Unreleased]: https://github.com/scolladon/craft/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/scolladon/craft/releases/tag/v1.0.0
```

Curation rule (written into `releasing.md`): `chore(metrics)` bookkeeping, test-only
changes and internal refactors are omitted; each entry names the user-visible effect, not
the PR. The implementer reads subjects with `git log --format='%h %s' v1.0.0..main` and
the release notes with `gh release view v1.0.0` (both read-only).

**Version badge** added after the License badge (README line 8):

```markdown
[![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fscolladon%2Fcraft%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version)](CHANGELOG.md)
```

It reads the field the marketplace serves, so it cannot drift from it; it passes
source-hygiene (pinned); it links the CHANGELOG (relative, lychee-checked). A shields
`github/v/release` badge would show the tag instead, and trips Class B.

**README line 189** keeps its `` `v1.0.0` `` literal; R9's test turns it into a guarded claim.

**`docs/contributing/releasing.md`** — the maintainer procedure:

```text
1. Pick the bump from the [Unreleased] groups: Removed/breaking → major, Added → minor,
   only Fixed → patch. Check `git log --format='%s%n%b' vLAST..main | grep -E '!:|BREAKING'`.
2. One PR: rename [Unreleased] → [X.Y.Z] - YYYY-MM-DD, open a fresh empty [Unreleased],
   update the compare links, set .claude-plugin/plugin.json "version", update README's
   `vX.Y.Z` status literal. Commit `chore(release): X.Y.Z`. Gate green, merge.
3. Maintainer only, after merge: git tag -a vX.Y.Z <merge-sha> -m "craft vX.Y.Z";
   git push origin vX.Y.Z; gh release create vX.Y.Z --title "craft vX.Y.Z"
   --notes "<the [X.Y.Z] section>".
4. Never set "version" in marketplace.json (plugin.json wins silently).
```

New tags are annotated; `v1.0.0` stays lightweight (rewriting a published tag is worse).
`docs/contributing/README.md` gains a `releasing.md` row.

**Version bump** — settled by ADR-503: a final part, after the other three land, cuts
`[1.1.0]` and sets `plugin.json` to `1.1.0`; the maintainer tags after integrate.

### 2. Community scaffolding (R5–R7)

```text
CONTRIBUTING.md
SECURITY.md
.github/ISSUE_TEMPLATE/
  bug-report.yml        labels: [bug]
  feature-request.yml   labels: [enhancement]
  adapter-request.yml   labels: [enhancement]
  security-contact.yml  no labels; no textarea/input — a warning and one required checkbox
  config.yml            blank_issues_enabled: true; contact_links: security → SECURITY.md
```

**CONTRIBUTING.md** sections: *Before you start* (contribution model, DC-7) · *Set up*
(Node 22, `jq`, `shellcheck`; `npm --prefix engine ci`; or open the devcontainer) · *The
local gate* (`bash scripts/ci.sh` is what CI runs, ~10 s; `bash scripts/readme-drift.sh`
when README changes) · *Dev loop* (`claude --plugin-dir <path-to-craft>`) · *Commits and
PRs* (Conventional Commits, one-line; no phase/ADR/backlog ids in source or test code —
`test/source-hygiene.test.js` enforces it) · *Where things live* (link to
`docs/contributing/README.md`; behavioural evals are local-only, link to
`docs/contributing/maintainer-smokes.md`, no eval command quoted) · *Releases* (link to
`docs/contributing/releasing.md`).

**SECURITY.md**: *Supported versions* (the latest release only) · *Reporting a
vulnerability* (ADR-504, shape below) · *Scope* — in: hooks under `hooks/`, scripts craft executes in a user's repo, guard
bypasses in shipped bindings, anything that writes outside the worktree; out: the host
agent runtimes themselves, and adapters' declared limitations (`adapters/README.md` guard
postures, e.g. aider's declined guard).

```markdown
## Reporting a vulnerability

**Do not include vulnerability details in a public issue, pull request or comment.**

1. Open a [security contact request](https://github.com/scolladon/craft/issues/new?template=security-contact.yml).
   It asks for a private contact and nothing else.
2. The maintainer replies in that issue with a private channel.
3. Send the details there only. The public issue is closed once you have moved over.
```

The rule is the first line of the section, bold, before any step. The form makes it
structural, not just stated: it has no free-text field to put details in, and the title is
pre-filled so the reporter does not have to write one:

```yaml
name: Security contact request
description: Ask for a private channel to report a vulnerability — no details here
title: Security contact request
body:
  - type: markdown
    attributes:
      value: "**Do not include vulnerability details.** This issue is public. The maintainer replies with a private channel; see SECURITY.md."
  - type: checkboxes
    id: no-details
    attributes:
      label: Confirmation
      options:
        - label: This issue contains no vulnerability details.
          required: true
```

`config.yml`'s security contact link points at SECURITY.md
(`https://github.com/scolladon/craft/blob/main/SECURITY.md`, absolute because the chooser
needs a URL), so the chooser shows the policy next to the form. A blank issue can still
carry details; SECURITY.md and the chooser link are the mitigation — a public tracker
cannot prevent it.

**Issue forms** (abridged `adapter-request.yml`):

```yaml
name: Adapter request
description: Ask for a craft binding to another agent runtime
labels: [enhancement]
body:
  - type: markdown
    attributes:
      value: Bindings are judged on the surfaces below; see adapters/README.md for the existing ones.
  - type: input
    id: runtime
    attributes: { label: Runtime and version }
    validations: { required: true }
  - type: input
    id: docs
    attributes: { label: Link to the runtime's docs }
  - type: dropdown
    id: headless
    attributes:
      label: Can it run one agent turn non-interactively (headless/CLI)?
      options: [yes, no, not sure]
    validations: { required: true }
  - type: dropdown
    id: deny-surface
    attributes:
      label: Can a hook or plugin block a tool call before it executes?
      options: [yes, no, not sure]
  - type: dropdown
    id: subagents
    attributes:
      label: Can it dispatch subagents with their own instructions?
      options: [yes, no, not sure]
  - type: textarea
    id: extension
    attributes: { label: Extension mechanism (plugins, commands, skills, rules files) }
```

Bug report fields: craft version (input, required), runtime (dropdown: Claude Code, the
seven bindings of the README *Beyond Claude Code* table, "other"), what happened / expected (textareas, required), run record
or gate output (textarea, `render: text`). Feature request: problem, proposal,
alternatives. `blank_issues_enabled: true` because discussions are off and questions need
somewhere to go. Labels use only existing ones (`bug`, `enhancement`); an `adapter` label
would need the maintainer to create it first — out of scope.

README line 274 becomes `` Contributing to craft itself? Start at [CONTRIBUTING.md](CONTRIBUTING.md). ``
Line 276 (the evals pointer) is untouched.

### 3. Devcontainer + Codespaces badge (R2–R4)

**`scripts/install-dev-tools.sh`** — the single tool definition (DC-6):

```bash
#!/usr/bin/env bash
# Installs the tools scripts/ci.sh needs beyond Node: the same set in CI and the devcontainer.
set -euo pipefail
readonly APT_PACKAGES=(bats shellcheck jq)
readonly YQ_VERSION=v4.44.3
readonly YQ_BIN_DIR="${YQ_BIN_DIR:-/usr/local/bin}"
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
yq_asset() {
  local arch; arch="$(dpkg --print-architecture)"
  case "$arch" in
    amd64|arm64) printf 'yq_linux_%s' "$arch" ;;
    *) echo "install-dev-tools: no yq asset for architecture: $arch" >&2; return 1 ;;
  esac
}
main() {
  local asset; asset="$(yq_asset)"
  as_root apt-get update
  as_root apt-get install -y "${APT_PACKAGES[@]}"
  as_root curl -fsSL -o "$YQ_BIN_DIR/yq" \
    "https://github.com/mikefarah/yq/releases/download/$YQ_VERSION/$asset"
  as_root chmod +x "$YQ_BIN_DIR/yq"
}
main "$@"
```

The arch check runs before any install, so an unsupported machine fails before mutating
anything. `YQ_BIN_DIR` exists for the test's throwaway root. shellcheck covers it via
`scripts/*.sh` in `scripts/static-lints.sh`.

**`ci.yml`** — the two install steps (lines 27–34) collapse into one:

```yaml
      - name: Install dev tools
        run: bash scripts/install-dev-tools.sh
```

**`.devcontainer/devcontainer.json`** (strict JSON):

```json
{
  "name": "craft",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:22",
  "features": {
    "ghcr.io/anthropics/devcontainer-features/claude-code:1": {}
  },
  "postCreateCommand": "bash scripts/install-dev-tools.sh && npm --prefix engine ci",
  "secrets": {
    "ANTHROPIC_API_KEY": {
      "description": "Optional: an API key for Claude Code. Without it, run `claude` and log in."
    }
  }
}
```

No `node` feature: the image already bundles `node:2` with Node 22. The claude-code
feature's `installsAfter: node` is satisfied by the image's npm.

**Badge** after the version badge:

```markdown
[![Open in Codespaces](https://img.shields.io/badge/Open%20in-Codespaces-blue)](https://codespaces.new/scolladon/craft)
```

GitHub's own `badge.svg` and any `logo=github` variant trip source-hygiene Class B
(pinned); DC-8. A Quickstart addendum: "No local setup: open a Codespace, then run
`claude --plugin-dir .` and try `/craft:review` on a branch, or `/craft:run` on a brief."
Wording carries no duration (R3).

**Maintainer smoke** — a new `## Devcontainer cold-start smoke — not CI-gated` section in
`docs/contributing/maintainer-smokes.md`: open a fresh Codespace from the badge; confirm
`postCreateCommand` exits 0, `yq --version` reports v4.44.3, `claude --version` runs,
`bash scripts/ci.sh` passes, `claude --plugin-dir .` lists `/craft:run`; record wall-clock
from create to ready. Only a recorded time may back a duration in README. Optionally
repeat in a local arm64 devcontainer.

### 4. Comparison table (R1)

Placement and sourcing are DC-1 and DC-2. Recommended shape: a README section placed
right after *What craft is not* (line 66), comparing **categories, not products**:

```markdown
## How craft compares

Categories, not products: each cell says what the approach provides by construction.
A given tool in a category may add more — check it.

| | Plain agent prompting | Spec-driven kits | craft |
|---|---|---|---|
| Where the process lives | in the prompt you wrote | in templates and instructions the agent follows | in hooks, scripts and versioned [contracts](contracts/) |
| A red test suite blocks the commit | not by the approach itself | varies by tool | always — [the gate](docs/contributing/DOD.md) |
| Why a choice was made survives the session | not by the approach itself | in the spec, when written | as a ratified [decision record](docs/contributing/adr/) |
| Review and validation before the PR | when you ask | varies by tool | gated phases — [review dimensions](docs/guides/customizing.md#…) |
| Resume after a killed session | from the transcript, if the tool keeps one | from the spec files | from the last committed artifact — [plans](docs/contributing/plan/) |
| Cost against a plain prompt | baseline | varies by tool | higher — [measured, with where craft lost](docs/guides/comparison.md#where-craft-lost) |
```

Rules the implementer keeps: non-craft cells use only *by-construction* statements or
"varies by tool"; every craft cell has a relative link (exact anchors chosen at
implementation, lychee-checked); no digits; vocabulary passes source-hygiene (no
`mutation`, no lowercase `github`/`gh`). The plain-prompting row's cost evidence is the
measured n=1 experiment, linked, never restated — `comparison.md` stays the single home of
those numbers and is not edited.

### Guarding the new README claims (DC-3)

| New README claim | Drift risk | Guard |
|---|---|---|
| version badge path | path moves → badge shows "resource not found" with a 200 | release-discipline test pins the encoded path + file existence |
| `` `vX.Y.Z` `` status literal | version bump forgets README | release-discipline test: literal == `plugin.json` |
| comparison table | a number creeps in, unguarded | comparison test: no digits in the section |
| Codespaces badge / link | URL shape | devcontainer test pins the `codespaces.new/scolladon/craft` target |

None is a recomputation from data, so none needs a new readme-drift sub-guard.

### Parts (each one commit, each its own test file)

| Part | Files | Commit |
|---|---|---|
| P1 release discipline | `CHANGELOG.md`, `docs/contributing/releasing.md`, `docs/contributing/README.md`, `README.md` (badge), `test/release-discipline.test.js` | `docs(release): add changelog, release procedure and version badge` |
| P2 community scaffolding | `CONTRIBUTING.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/{bug-report,feature-request,adapter-request,security-contact,config}.yml`, `README.md` (line 274), `CHANGELOG.md` (Unreleased bullet), `test/community-scaffolding.test.js` | `docs(community): add contributing guide, security policy and issue forms` |
| P3 devcontainer | `scripts/install-dev-tools.sh`, `.github/workflows/ci.yml`, `.devcontainer/devcontainer.json`, `README.md` (badge + Quickstart line), `docs/contributing/maintainer-smokes.md`, `CHANGELOG.md`, `test/devcontainer.test.js` | `feat(devcontainer): add a devcontainer and Codespaces badge sharing CI's tool install` |
| P4 comparison | `README.md` (new section), `CHANGELOG.md`, `test/readme-comparison.test.js` | `docs(readme): add a category comparison table` |
| P5 release cut | `CHANGELOG.md`, `.claude-plugin/plugin.json`, `README.md` (line 189 literal) | `chore(release): 1.1.0` |

P2–P4 depend only on P1 (the `[Unreleased]` section); they do not touch each other's
files except `README.md` and `CHANGELOG.md`, at distinct lines. P5 runs last.

**Pre-chewed context per part.**

- P1: README badges are lines 7–8; status literal line 189. `docs/contributing/README.md`
  is a two-column `| Path | Holds |` table — add `[`releasing.md`](releasing.md)`. Test
  pattern: `test/plugin-structure.test.js` (fs reads, Given/When/Then titles). Release
  notes: `gh release view v1.0.0 --json body`. Badge URL is the pinned string above,
  verbatim.
- P2: issue-form schema matrix above; labels `bug`, `enhancement`; runtime list =
  README *Beyond Claude Code* table + "claude code" + "other". YAML parse in the test:
  `require('node:module').createRequire(path.join(ROOT, 'engine/package.json'))('js-yaml')`.
  README line 274 replaced, line 276 kept. SECURITY.md reporting section and
  `security-contact.yml` are the two snippets above, verbatim in substance; the form
  carries no `labels` (no existing label fits, creating one is out of scope).
- P3: CI steps to replace are `ci.yml` lines 27–34 (`Install bats, shellcheck, jq`,
  `Install yq`); the `readme-drift` and `links` jobs are untouched. Stub-on-PATH pattern:
  `test/static-lints-ci.test.js` (`shellStub`, `LINT_LOG`, `EXECUTABLE_MODE = 0o755`).
  Stubs needed: `id`, `sudo`, `apt-get`, `dpkg`, `curl`, `chmod`. Maintainer-smokes
  section goes at the end of the file (after line 468), same heading shape as the others.
- P4: insert after README line 66 (end of *What craft is not*), before `## Quickstart`.
  Fragment `#where-craft-lost` exists in `docs/guides/comparison.md`. Source-hygiene
  Class A/B patterns above; `CORPUS_CLAIM` regex above.
- P5: `.claude-plugin/plugin.json` `"version"`; CHANGELOG compare links; README line 189.

## Decision candidates

**All eight candidates are SETTLED** — ratified by the user as ADR-500…507 (`Settled`
column). Seven went as recommended; **DC-5 did not**: the user chose C over A, which is
why SECURITY.md routes reports through a detail-free public issue and no repo setting
gates the merge.

| # | Choice | Alternatives (≤3) | Recommendation | Why | Settled |
|---|---|---|---|---|---|
| DC-1 | Comparison sourcing | A: compare **categories** (plain prompting, spec-driven kits, craft); non-craft cells only by-construction or "varies by tool"; craft cells linked to repo evidence · B: name products (e.g. spec kits, agentic IDEs) with cited links the maintainer verifies before merge · C: compare only against plain prompting, the one arm with in-repo measured evidence | **A** | No source for any named product exists in the repo and the pipeline has none to cite; product features move faster than the README. B also trips source-hygiene the moment a cited link contains lowercase `github`. C drops the spec-driven row the brief asks for. | A — ADR-500 |
| DC-2 | Where the table lives | A: README section after *What craft is not*, linking `comparison.md` for numbers · B: new guide page `docs/guides/positioning.md` + one README line · C: extend `docs/guides/comparison.md` | **A** | The brief scopes it as a README item; one table is small. C mixes a positioning table into a measured experiment page. B adds a page for one table. | A — ADR-501 |
| DC-3 | Home of the new README guards | A: repo-shape `node:test` files under `test/` (one per part) · B: new readme-drift sub-guards in `engine/src` (mutation-covered) | **A** | The new checks are structural equalities and absences, not recomputations from data; readme-drift's design explicitly scoped the comparison table out. A keeps each part's test in its own commit. | A — ADR-502 |
| DC-4 | Cut a release in this change | A: final part bumps to **1.1.0** and cuts `[1.1.0]`; the maintainer tags and publishes after integrate · B: CHANGELOG `[Unreleased]` only; bump later via `releasing.md` · C: bump to 2.0.0 | **A** | Per the Claude Code docs, marketplace users have received none of the 85 post-tag commits because `version` never moved. No `!`/`BREAKING` subject since v1.0.0 → minor. Risk: between merge and tag, `plugin.json` says 1.1.0 while the newest tag is v1.0.0 — the procedure makes tagging the next step. | A — ADR-503 |
| DC-5 | Security reporting channel | A: GitHub private vulnerability reporting (the maintainer enables the repo setting before merge) · B: a maintainer email address in SECURITY.md · C: a public issue asking for a private contact, no details | **A** | Keeps reports private without publishing an address. Today the setting is `enabled:false`; SECURITY.md must not merge pointing at a disabled channel — enabling it is a user-owned action. | **C** — ADR-504 (deviates) |
| DC-6 | Dev-tool install source | A: shared `scripts/install-dev-tools.sh` used by the CI `ci` job and `postCreateCommand` · B: inline in each, plus a test asserting the two lists match · C: devcontainer installs only what `ci.sh` provably uses (`jq`, `shellcheck`), CI unchanged | **A** | One definition; and CI running it on every push is the only automated exercise the devcontainer setup gets (no container build in CI). Cost: the CI job's install path changes, and the CI `yq` download becomes arch-aware. | A — ADR-505 |
| DC-7 | Contribution model in CONTRIBUTING.md | A: any process welcome; the bar is `scripts/ci.sh` green + Conventional Commits; open an issue first for features · B: feature PRs must come from a craft run (design doc, ADRs, plan as receipts) · C: issues only, PRs by invitation | **A** | B makes craft (and a paid model) a prerequisite to contribute; C closes the door the scaffolding opens. craft runs stay the maintainer's own way of working, mentioned, not required. | A — ADR-506 |
| DC-8 | Codespaces badge image | A: shields static badge `Open in-Codespaces` (passes hygiene) · B: GitHub's official `badge.svg` + widen the README allowlist in `test/source-hygiene.test.js` · C: plain text link, no badge | **A** | B weakens a VCS-neutrality gate to fit a picture; A renders the same call to action with no gate change. | A — ADR-507 |

## Test strategy

All tests are `node:test`, repo root, auto-enumerated by `run_suite process test`. Each is
red-first: written before its artifact, it fails on today's tree (artifact absent).
Assertions that already hold today are labelled GUARD.

**`test/release-discipline.test.js`** (P1)

- CHANGELOG.md exists; first `## ` heading is `## [Unreleased]`.
- Released headings match `^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$`; strictly
  descending semver; the first equals `plugin.json` `version`.
- Every released heading and `[Unreleased]` has a link reference definition.
- Every `` `v(\d+\.\d+\.\d+)` `` in README equals `plugin.json` version (GUARD today: 1.0.0).
- `marketplace.json` `plugins[*]` carry no `version` key (GUARD).
- README carries the version badge; its `url=` parameter decodes to
  `https://raw.githubusercontent.com/scolladon/craft/main/.claude-plugin/plugin.json`,
  `query` decodes to `$.version`, and `.claude-plugin/plugin.json` exists.
- `docs/contributing/releasing.md` exists and `docs/contributing/README.md` links it.
- Edge: mutated-copy cases — a CHANGELOG whose top release ≠ `plugin.json`, out-of-order
  headings, a README literal `v9.9.9` — each fails with a message naming the surface.
  Implemented as pure functions over strings inside the test file, fed the live files
  and the mutated strings.

**`test/community-scaffolding.test.js`** (P2)

- CONTRIBUTING.md and SECURITY.md exist; CONTRIBUTING links
  `docs/contributing/README.md`, names `bash scripts/ci.sh`, and does not contain a
  `claude plugin eval` command.
- README links `CONTRIBUTING.md`.
- `.github/ISSUE_TEMPLATE/` holds `bug-report.yml`, `feature-request.yml`,
  `adapter-request.yml`, `security-contact.yml`, `config.yml`.
- Each form (js-yaml): `name`, `description`, non-empty `body`; names unique across forms;
  every element's `type` in the pinned set; required attributes per type (matrix above);
  `id`s match `^[A-Za-z0-9_-]+$`, unique per form, absent on `markdown`; dropdown options
  non-empty and distinct; `labels` ⊆ the repo's existing labels (constant in the test,
  commented as a snapshot of repo state).
- Adapter form carries ids `runtime`, `headless`, `deny-surface`, `subagents`.
- `config.yml`: boolean `blank_issues_enabled`; each contact link has `name`, `url`, `about`;
  one contact link's `url` ends with `/SECURITY.md`.
- SECURITY.md has `## Reporting a vulnerability`; its first non-blank line contains
  `Do not include vulnerability details`; the section links
  `issues/new?template=security-contact.yml`, and that file exists (the link's target).
- `security-contact.yml`: no element of type `textarea` or `input` (nowhere to put
  details); its first element is `markdown` whose `value` contains
  `Do not include vulnerability details`; one `checkboxes` element has an option with
  `required: true` whose label contains `no vulnerability details`; `title` is set.
- Edge: mutated-string cases — a security form with a `textarea` added, a SECURITY.md whose
  rule sits below the steps, a checkbox option without `required` — each fails naming the
  surface. Pure functions over strings, fed the live files and the mutated strings (same
  shape as P1's edge cases).

**`test/devcontainer.test.js`** (P3)

- `.devcontainer/devcontainer.json` parses with `JSON.parse`.
- `image` matches `mcr.microsoft.com/devcontainers/javascript-node:<N>` with `N` equal to
  the `node-version` of `actions/setup-node` in `ci.yml`'s `ci` job (js-yaml).
- `features` has `ghcr.io/anthropics/devcontainer-features/claude-code:1`.
- `postCreateCommand` invokes `scripts/install-dev-tools.sh` and `npm --prefix engine ci`.
- `ci.yml` `ci` job runs `bash scripts/install-dev-tools.sh` and no step runs
  `apt-get install` or downloads `yq` inline (single definition).
- `install-dev-tools.sh` under PATH stubs (`dpkg` prints the arch; `id -u` prints 1000;
  `sudo` execs its argv; `apt-get`, `curl`, `chmod` log argv): with `amd64` it installs
  exactly `bats shellcheck jq` and fetches `…/v4.44.3/yq_linux_amd64` into `YQ_BIN_DIR`;
  with `arm64` it fetches `yq_linux_arm64`; with `riscv64` it exits non-zero naming the
  arch and the log shows **no** `apt-get` call.
- README carries a badge linking `https://codespaces.new/scolladon/craft`.
- `maintainer-smokes.md` has a `## Devcontainer cold-start smoke — not CI-gated` heading.

**`test/readme-comparison.test.js`** (P4)

- README has `## How craft compares`, placed after `## What craft is not` and before
  `## Quickstart`.
- The section holds one table whose header names `craft`; every craft-column cell
  contains a relative markdown link (`](` not followed by `http`).
- The section contains no digit.

**Existing gates that must stay green**: `test/source-hygiene.test.js` (badge lines and
table vocabulary), `scripts/readme-drift.sh` (no new `[N …](docs/…/)` links), lychee
offline (all new relative links and fragments), prose-lint on every new `.md`,
`test/plugin-evals-local-only.test.js` (new script and workflow), shellcheck
(`install-dev-tools.sh`). By hand, not CI: `claude plugin validate .` still passes with no
version-mismatch warning.

**Live, not CI**: the devcontainer cold-start smoke (P3) — the only proof the built
container works, and the only source for a README duration.

## Out of scope

- Creating labels, configuring Codespaces prebuilds, pushing tags, publishing releases —
  user-owned repo actions; the docs say when.
- Enabling GitHub private vulnerability reporting — not used (ADR-504); switching to it
  later is a SECURITY.md edit.
- Building the devcontainer in CI (`devcontainers/ci`) — adds a slow job; the maintainer
  smoke covers it for now.
- CODE_OF_CONDUCT.md and a pull-request template — the community profile lists them, the
  brief does not.
- A generated changelog (release-please, git-cliff) — Keep a Changelog advises against
  commit-log dumps, and release automation would tag outward on its own.
- Rewriting the lightweight `v1.0.0` tag as annotated — it is published.
- Fixing the `claude plugin validate` warnings (marketplace description, unquoted hook
  placeholders) — unrelated to versioning.
- `yq` and `bats` have no consumer outside the CI install line (`git grep -w yq` / `bats`
  outside docs hits only `ci.yml` and `test/helpers/*.bash`, which no suite runs); trimming
  the CI tool set is a separate change.
- A yq checksum check on download — CI does not have one today either.
