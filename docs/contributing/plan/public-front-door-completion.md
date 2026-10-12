# Plan — public-front-door-completion

> Source: design doc `docs/contributing/design/public-front-door-completion.md` · ADRs `500, 501, 502, 503, 504, 505, 506, 507`
> (categories, not products (500); the table is a README section with no digits (501); new
> README claims are pinned by root `test/*.test.js` files, readme-drift unchanged (502); the
> last part cuts `1.1.0`, the maintainer tags after merge (503); security reports start with a
> detail-free public issue, no repo setting needed (504); CI and the devcontainer share one
> install script (505); any contribution process, gated by `bash scripts/ci.sh` + Conventional
> Commits (506); the Codespaces badge is a shields static badge (507))
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.
- A part should land in ~100 tool calls. More than ~5 RED→GREEN cycles, or more than 6
  files in its `### Context` block, is two parts. What counts is a backticked path:
  backtick the files the part CREATES or EDITS, and write read-only reference paths in
  plain text.

## Plan shape (7 parts)

| # | Part | Size class | src delta | Files created / edited |
|---|---|---|---|---|
| 1 | Release discipline | docs-prose + repo-shape test | none | CHANGELOG.md, docs/contributing/releasing.md, docs/contributing/README.md, README.md, test/release-discipline.test.js |
| 2 | Issue forms | config + repo-shape test | none | five files under .github/ISSUE_TEMPLATE/, test/issue-forms.test.js |
| 3 | Contributing guide and security policy | docs-prose + repo-shape test | none | CONTRIBUTING.md, SECURITY.md, README.md, CHANGELOG.md, test/community-scaffolding.test.js |
| 4 | Shared dev-tool install script | shell script + CI config + stubbed test | scripts/install-dev-tools.sh (new, ~22 lines) | the script, .github/workflows/ci.yml, test/install-dev-tools.test.js |
| 5 | Devcontainer and Codespaces badge | config + docs-prose + repo-shape test | none | .devcontainer/devcontainer.json, README.md, CONTRIBUTING.md, docs/contributing/maintainer-smokes.md, CHANGELOG.md, test/devcontainer.test.js |
| 6 | Comparison table | docs-prose + repo-shape test | none | README.md, CHANGELOG.md, test/readme-comparison.test.js |
| 7 | Release cut 1.1.0 | data | none | CHANGELOG.md, .claude-plugin/plugin.json, README.md |

Parts run strictly in order in one working tree; each lands one commit.

### Deviations from the design's part table, and why

- **Design P2 split into Parts 2 and 3.** Design P2 touches ten files (five issue forms,
  CONTRIBUTING.md, SECURITY.md, README.md, CHANGELOG.md, its test); the plan schema caps a part
  at six. The split line is cohesive: Part 2 is the YAML forms and their schema validator,
  Part 3 the two root docs. Part 2 lands first because SECURITY.md's test asserts that the
  security-contact form it links exists. Part 2 adds no CHANGELOG bullet (it would be a
  seventh file); Part 3's bullet covers the forms too.
- **Design P3 split into Parts 4 and 5.** Design P3 touches seven files. The install script
  plus its CI wiring (Part 4) is the only executable code in this change and stands on its
  own: CI runs it on every push. Part 5 is the devcontainer that consumes it.
- **CONTRIBUTING's devcontainer clause moves to Part 5.** The design puts "or open the
  devcontainer" in CONTRIBUTING's *Set up* section in design P2, but the devcontainer lands in
  design P3 — that commit would point at a file that does not exist yet. Part 3 writes *Set
  up* without it; Part 5 appends the clause (with a relative link lychee checks).
- **Part 7 has no new test file.** The design gives design P5 none; the coherence suite built
  in Part 1 (test/release-discipline.test.js) is exactly the guard a version bump must
  satisfy, and Part 7's RED is that suite going red after the version source moves.

### Shared files across parts

README.md is edited by Parts 1, 3, 5, 6, 7 and CHANGELOG.md by Parts 1, 3, 5, 6, 7 (plan-lint
prints a cognitive-locality warning for each). Each edit is at a different anchor, and each
part's README claim must land with the test that guards it, so merging them would mix
unrelated tests into one commit. Insert points are given by **anchor text**, never by line
number alone, because earlier parts shift README lines.

## Public-surface decision

No new exported symbol (no `src/` module, no barrel, no engine command). New user-facing
surfaces, each **public** and each guarded in the part that creates it:

| Surface | Part | Surface gates pre-paid in-part |
|---|---|---|
| CHANGELOG.md + README version badge | 1 | source-hygiene (README scanned), readme-drift (README), lychee offline (badge links CHANGELOG.md), prose-lint |
| docs/contributing/releasing.md | 1 | row in docs/contributing/README.md map table; docs-structure-lint docs/contributing; prose-lint; lychee |
| .github/ISSUE_TEMPLATE/* | 2 | none beyond its own test (not scanned by source-hygiene) |
| CONTRIBUTING.md, SECURITY.md | 3 | README Docs-section link (line "Contributing to craft itself?"); prose-lint; lychee; plugin-evals-local-only (the new test file is a scanned CI surface) |
| scripts/install-dev-tools.sh | 4 | **internal** tooling (not documented in README). shellcheck via scripts/static-lints.sh; source-hygiene class E (scripts/ is shipped code); stub-lint (touched .sh); plugin-evals-local-only (scripts and workflows are scanned) |
| .devcontainer/devcontainer.json + Codespaces badge | 5 | source-hygiene class B (badge line pinned to pass); readme-drift; lychee; CONTRIBUTING link |
| README `## How craft compares` | 6 | source-hygiene A/B; readme-drift CORPUS_CLAIM (no digits ⇒ no claim); lychee fragments |

## Decision candidates

All load-bearing product choices are settled by ADR-500…507. Planning-level choices the
design left open, each with the option this plan scripts (the orchestrator may overrule
before Part 1 starts):

| # | Choice | Options (≤3) | Recommendation (scripted below) |
|---|---|---|---|
| PC-1 | Honour the six-file part ceiling for design P2/P3 | A: split each in two (7 parts) · B: keep five parts, backtick a directory span to dodge the count · C: drop the CHANGELOG bullets from P2–P4 and write them all in the release cut | **A** — B games plan-lint; C leaves intermediate commits with an `[Unreleased]` that misstates the tree and still leaves design P2 at nine files |
| PC-2 | CONTRIBUTING mentions a devcontainer that lands later | A: Part 5 appends the clause to CONTRIBUTING.md · B: reorder so the devcontainer lands before the community docs · C: keep the dangling mention | **A** — keeps the design's part order; costs Part 5 one file (six, at the ceiling) |
| PC-3 | Dropdown option spelling in the adapter form | A: quoted `"Yes"`, `"No"`, `"Not sure"` · B: unquoted `yes`, `no`, `not sure` as in the design | **A** — unquoted `yes`/`no` are booleans under a YAML 1.1 parser; js-yaml 4 (YAML 1.2) would read them as strings, so the test could not catch a mis-render on GitHub. Quoting is correct under both. Unverified on GitHub; proof would be rendering the form on a fork. |
| PC-4 | Evidence link for the "red test blocks the commit" craft cell | A: contracts/core.md (its first line is "Never commit on a red gate.") with cell wording "by contract" · B: docs/contributing/DOD.md with "always" (design draft) | **A** — the contract line is the direct evidence; "always" overstates what a contract line proves |

## Conventions every part follows

- Tests: `node:test` + `node:assert`, `'use strict'`, CommonJS, `const ROOT = path.join(__dirname, '..')`.
  Titles `Given … when … then …`; AAA body; the value under test is named `sut`. Named
  constants, no magic strings inline in assertions. Shape reference: test/plugin-structure.test.js.
- Validators are **pure functions inside the test file** returning a list of violation
  messages, each message naming the surface (e.g. `CHANGELOG.md: …`). Each validator is fed the
  live file AND hand-built bad inputs (two-sided pinning, the idiom of
  test/architecture-boundaries.test.js), so a validator that can only say "clean" is caught.
  The bad-input cases are GUARD entries: they pass as soon as the validator exists.
- YAML: `require('node:module').createRequire(path.join(ROOT, 'engine', 'package.json'))('js-yaml')`
  (js-yaml 4.2.0, verified loadable from the repo root; `npm --prefix engine ci` must have run).
- New test files are auto-enumerated by `run_suite process test` in scripts/ci.sh — no
  registration edit.
- **Test-text traps** (all verified against the tree):
  - test/source-hygiene.test.js scans test titles and comments, case-insensitively, for
    `ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+|DC-\d+` — no such token in any title or comment.
  - test/plugin-evals-local-only.test.js scans every `test/*.test.js` (and scripts/, workflows)
    for `/\bplugin\s+eval\b/` and `/\bevals\//` — never write the words "plugin" and "eval"
    separated by whitespace, nor `evals/`, anywhere in a test file, titles included. Write
    regexes as `/claude\s+plugin\s+eval/` (the `\s+` in source text does not match).
  - README.md is scanned by source-hygiene class A (`stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise`)
    and case-sensitive class B (`\bgh\b|\bgithub\b`, the token `github.com/scolladon/craft` on a
    README line is excused). "GitHub" with a capital G passes.
  - prose-lint bans `delve, leverage, seamless, robust, "it's important to note", "in conclusion"`
    in every touched `.md`.
- **Hard constraints (every part):** no ADR/phase/part/backlog/decision-candidate ids in
  source, tests (titles and comments included) or any committed non-design file; no AI-tooling
  trace (no assistant, agent, session or model reference) in files or commit messages; no
  absolute or home-rooted path (write `<path-to-craft>`, `<tmp>`); never push, tag, or create a
  release — tagging is the maintainer's post-merge action; stage only the part's own files;
  one atomic commit with the exact message given, no body, no trailers.
- Lychee command used in gates (installed locally, ~0.3 s, green on today's tree):
  `lychee --offline --include-fragments --no-progress --exclude-path engine/node_modules './**/*.md'`.

## Part 1 — Release discipline: changelog, release procedure, version badge

### Context

Creates `CHANGELOG.md`, `docs/contributing/releasing.md`, `test/release-discipline.test.js`;
edits `README.md` (one badge line) and `docs/contributing/README.md` (one table row).

Hard constraints: see "Conventions every part follows" — no ADR/phase/part/backlog ids in
files or test titles, no AI-tooling trace, no absolute paths, never push/tag/release.

**Facts (verified on the tree at 37a8fec):**

- .claude-plugin/plugin.json: `"version": "1.0.0"`. .claude-plugin/marketplace.json:
  `plugins[0]` = `{ name, source, description }`, no `version` key.
- One tag `v1.0.0` (lightweight). Release "craft v1.0.0", published 2026-07-25. Its notes
  (fetched read-only — do not call the hosting CLI again):

  ~~~text
  First public release of craft — a feature-delivery workflow engine for agentic coding tools.
  Highlights:
  - One gated 11-phase pipeline: workspace → design → decisions → planning → implementation → review → refactoring → validation → documentation → propose → integrate
  - Shipped as a Claude Code plugin; per-repo customization via a committed .claude/workflow.md declination manifest (no manifest = probed defaults)
  - Harness-as-a-Service: pluggable Model / Execution / Memory / Telemetry ports around an engine-owned invariant contract
  - Seven native bindings under adapters/ (pi, opencode, copilot, codex, cursor, aider, antigravity) proving the ports are pluggable
  - Comprehension & intention debt management: design docs, parted TDD plans, ADRs with user-ratified decisions
  ~~~

- README badges are lines 7–8; insert the version badge as a new line directly **after the
  line starting `[![License: MIT]`**. Exact line, verbatim (pinned: passes source-hygiene
  class A and B; its `url` decodes to the raw plugin.json path, `query` to `$.version`):

  ~~~markdown
  [![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fscolladon%2Fcraft%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version)](CHANGELOG.md)
  ~~~

  A wrong path still renders (HTTP 200, "resource not found"), which is why the test pins
  the decoded path and the file's existence.
- README line 189 (`` Current status: `v1.0.0`. The engine and … ``) is the only backticked
  `vX.Y.Z` literal in README. It stays as is; the test turns it into a guarded claim.
- docs/contributing/README.md is a `| Path | Holds |` table. Add a row after the
  `maintainer-smokes.md` row: `` | [`releasing.md`](releasing.md) | how a release is cut: choosing the bump, the changelog section, the version bump, and the maintainer's tag | ``.

**CHANGELOG.md content** (Keep a Changelog 1.1.0; the file is not source-hygiene scanned):

~~~markdown
# Changelog

All notable changes to craft are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version that ships to
plugin users is the `version` field of `.claude-plugin/plugin.json`.

## [Unreleased]

### Added
- …
### Changed
- …
### Fixed
- …

## [1.0.0] - 2026-07-25

### Added
- … the five highlights above, one bullet each, same substance

[Unreleased]: https://github.com/scolladon/craft/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/scolladon/craft/releases/tag/v1.0.0
~~~

Curation rule (also written into releasing.md): omit `chore(metrics)` bookkeeping, test-only
changes and internal refactors/CI plumbing; one line per user-visible effect, never a PR
number; group eval-calibration fixes into one line. Raw material — the non-bookkeeping
subjects since v1.0.0, already filtered (85 commits total; do not re-mine):

| Group | Subjects (abridged) → bullet |
|---|---|
| Added | status-tagged review findings + deliberation-review example · orchestrator-tax hardening (the orchestrator protects its own context) · codex binding: scriptable hook-trust · readme-drift recounts the advertised corpus sizes · hygiene lints (stub-lint, prose-lint) with a manifest posture knob, findings normalizer, adapter-agent sync (the non-conventional "Close the eleven scheduled backlog items" commit) · decision-drift propagation (superseded decisions swept by adr-lint) · per-turn context cost cut · orchestrator safe to auto-compact at any turn · local behavioural eval suite, maintainer-run, never CI · session compaction estimate printed at Done · examples catalog: six shipped-surface samples and a decisions-to-Slack example · a measured cost comparison (docs/guides/comparison.md) and when-not-to-use guidance · this changelog, the release procedure and a README version badge |
| Changed | docs split by audience into docs/guides (users) and docs/contributing (contributors) |
| Fixed | telemetry mines sub-agent transcripts and corrects cost accounting · telemetry skips compaction lines already mined · a transient model overload is retried once before degrading the model tier · run-ledger refuses to open a run id that is still open · docs-structure-lint passes on a symlinked checkout · GUARD/RED handling tightened across planner, contracts and part-implementer (four fixes, one line) · waivers honoured only on anchored lines outside fenced blocks · committed docs no longer disclose a home directory · behavioural eval graders calibrated (three fixes, one line) |
| Omitted | `fix(ci)` static-lint exit, stub-lint self-reference and comment rewording, `fix(test)` spawn sites, all `test:` and `chore:` subjects, backlog/docs bookkeeping |

**Test file `test/release-discipline.test.js`** — pure validators over strings:

- `changelogViolations(changelogText, pluginVersion)` → messages. Rules: first `## ` heading
  is `## [Unreleased]`; every other `## ` heading matches
  `/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/`; released versions strictly descending by
  semver (compare numerically per component); the first released version equals
  `pluginVersion`; `[Unreleased]` and every released version have a link reference
  definition line `/^\[<label>\]: \S+$/m`.
- `readmeVersionViolations(readmeText, pluginVersion)` → one message per backticked
  `` `v(\d+\.\d+\.\d+)` `` that is not `v` + `pluginVersion`.
- `versionBadgeTarget(readmeText)` → `{ url, query, href }` or `null` when absent. Match
  `/\[!\[[^\]]*\]\((https:\/\/img\.shields\.io\/badge\/dynamic\/json[^)]*)\)\]\(([^)]+)\)/`;
  group 1 is the image source — `new URL(src).searchParams.get('url')` / `.get('query')` return
  the decoded values (verified) — group 2 is `href`.
- Constants: `RAW_PLUGIN_MANIFEST_URL = 'https://raw.githubusercontent.com/scolladon/craft/main/.claude-plugin/plugin.json'`,
  `VERSION_QUERY = '$.version'`, `PLUGIN_MANIFEST = path.join(ROOT, '.claude-plugin', 'plugin.json')`.

### TDD steps

1. **RED** — "Given CHANGELOG.md and the plugin manifest, when the changelog is validated,
   then it has no violations". Fails: ENOENT reading CHANGELOG.md (file absent).
2. **GREEN** — write CHANGELOG.md per the content above (curated bullets, `[1.0.0]` section,
   link definitions).
3. **GUARD** — bad-input cases for `changelogViolations`, each asserting a message naming
   `CHANGELOG.md`: top release `1.0.0` against plugin version `9.9.9`; headings `[1.0.0]` then
   `[1.1.0]` (ascending); a released heading without a link definition; first heading not
   `[Unreleased]`. Pass: the validator from step 1 rejects them.
4. **GUARD** — "Given README.md, when its backticked version literals are read, then each
   equals the plugin manifest version" (passes: line 189 is `v1.0.0`) plus the bad input
   `` Current status: `v9.9.9`. `` → one message naming `README.md`. And "Given the
   marketplace manifest, then no plugin entry carries a version" (passes today).
5. **RED** — "Given README.md, when the version badge is read, then it reads the plugin
   manifest's version field and links the changelog": `versionBadgeTarget` → url ===
   `RAW_PLUGIN_MANIFEST_URL`, query === `VERSION_QUERY`, href === `'CHANGELOG.md'`, and
   `fs.existsSync(PLUGIN_MANIFEST)`. Fails: no such badge (`null`).
6. **GREEN** — insert the pinned badge line after the License badge.
7. **RED** — "Given the contributor docs map, then the release procedure exists and is
   linked": docs/contributing/releasing.md exists; docs/contributing/README.md contains
   `](releasing.md)`. Fails: file absent.
8. **GREEN** — write `docs/contributing/releasing.md` (title `# Releasing craft`; a short
   "why": marketplace users receive a new copy only when plugin.json's `version` changes;
   the four steps below; the curation rule; the note that `v1.0.0` is a lightweight tag left
   as published and new tags are annotated; that test/release-discipline.test.js enforces
   changelog ↔ plugin.json ↔ README coherence) and add the map row.

   ~~~text
   1. Pick the bump from the [Unreleased] groups: Removed or a breaking change → major,
      Added → minor, only Fixed → patch. Check
      git log --format='%s%n%b' vLAST..main | grep -E '!:|BREAKING'
   2. One PR: rename [Unreleased] → [X.Y.Z] - YYYY-MM-DD, open a fresh empty [Unreleased],
      update the compare links, set .claude-plugin/plugin.json "version", update README's
      `vX.Y.Z` status literal. Commit `chore(release): X.Y.Z`. Gate green, merge.
   3. Maintainer only, after merge: git tag -a vX.Y.Z <merge-sha> -m "craft vX.Y.Z";
      git push origin vX.Y.Z; gh release create vX.Y.Z --title "craft vX.Y.Z"
      --notes "<the [X.Y.Z] section>".
   4. Never set "version" in .claude-plugin/marketplace.json — plugin.json wins silently.
   ~~~

9. **REFACTOR** — one `readRepoFile(relativePath)` helper; constants named; no inline literals
   in assertions.

### Gate

```bash
node --test test/release-discipline.test.js test/source-hygiene.test.js
bash scripts/readme-drift.sh
lychee --offline --include-fragments --no-progress --exclude-path engine/node_modules './**/*.md'
node engine/bin/prose-lint.js --gate blocking -- CHANGELOG.md README.md docs/contributing/releasing.md docs/contributing/README.md
```

### Commit

`docs(release): add changelog, release procedure and version badge`

## Part 2 — Issue forms, including a detail-free security contact request

### Context

Creates `.github/ISSUE_TEMPLATE/bug-report.yml`, `.github/ISSUE_TEMPLATE/feature-request.yml`,
`.github/ISSUE_TEMPLATE/adapter-request.yml`, `.github/ISSUE_TEMPLATE/security-contact.yml`,
`.github/ISSUE_TEMPLATE/config.yml`, `test/issue-forms.test.js`. No CHANGELOG bullet here —
Part 3's bullet covers the forms.

Hard constraints: see "Conventions every part follows" — no ADR/phase/part/backlog ids in
files or test titles, no AI-tooling trace, no absolute paths, never push/tag/release.

**Pinned issue-form schema** (GitHub docs, read 2026-10-02 revision):

| Level | Required | Constraints |
|---|---|---|
| form file | `name`, `description`, `body` (non-empty array) | `name` unique across forms; optional `labels` (a missing label is silently dropped); optional `title` pre-fills the issue title |
| body element | `type`, `attributes` | `type` ∈ markdown, textarea, input, dropdown, checkboxes, upload; `id` optional, `/^[A-Za-z0-9_-]+$/`, unique per form, **not allowed on markdown** |
| attributes | markdown → `value`; textarea, input → `label`; dropdown → `label` + `options`; checkboxes → `label` + `options` | dropdown `options` non-empty, distinct; each checkboxes option has `label`, optional `required` (bool) |
| config file | — | `blank_issues_enabled` boolean; `contact_links[]` items `{ name, url, about }` |

Existing repo labels (snapshot 2026-10-12; constant in the test, commented as a snapshot of
repo state): `bug, documentation, duplicate, enhancement, good first issue, help wanted,
invalid, question, wontfix`. Use only `bug` and `enhancement`; creating labels is out of scope.

**Form contents** (option strings quoted — see decision PC-3):

- bug-report.yml — `name: Bug report`, `description: Report something craft did wrong`,
  `labels: [bug]`. Body: markdown (`"Do not include vulnerability details here — see SECURITY.md."`);
  input `craft-version` "craft version" required; dropdown `runtime` "Runtime" options
  `["Claude Code", "pi", "opencode", "copilot", "codex", "cursor", "aider", "antigravity", "Other"]`
  required (the seven bindings are README's *Beyond Claude Code* table); textarea
  `what-happened` required; textarea `expected` required; textarea `output` "Run record or
  gate output" with `render: text`.
- feature-request.yml — `name: Feature request`, `labels: [enhancement]`; textareas
  `problem` (required), `proposal` (required), `alternatives`.
- adapter-request.yml — `name: Adapter request`, `description: Ask for a craft binding to another agent runtime`,
  `labels: [enhancement]`. Body: markdown ("Bindings are judged on the surfaces below; see
  adapters/README.md for the existing ones."); input `runtime` "Runtime and version"
  required; input `docs` "Link to the runtime's docs"; dropdown `headless` "Can it run one
  agent turn non-interactively (headless or CLI)?" required; dropdown `deny-surface` "Can a
  hook or plugin block a tool call before it executes?"; dropdown `subagents` "Can it
  dispatch subagents with their own instructions?" — each dropdown
  `options: ["Yes", "No", "Not sure"]`; textarea `extension` "Extension mechanism (plugins,
  commands, skills, rules files)".
- security-contact.yml — verbatim:

  ~~~yaml
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
  ~~~

  No `labels`, no textarea, no input: nowhere to put details.
- config.yml — `blank_issues_enabled: true` (discussions are off; questions need a home);
  `contact_links:` one item `{ name: Security policy, url: https://github.com/scolladon/craft/blob/main/SECURITY.md, about: Read this before reporting a vulnerability; never post details publicly. }`
  (absolute: the chooser needs a URL; SECURITY.md lands in Part 3).

**Test file `test/issue-forms.test.js`** — validators:
`formViolations(form, fileName)`, `formSetViolations(forms)` (unique names),
`configViolations(config)`, `securityFormViolations(form)` (no textarea/input element; first
element is markdown whose `value` contains `Do not include vulnerability details`; a
checkboxes element has an option with `required === true` whose label contains
`no vulnerability details`; `title` is a non-empty string). `KNOWN_LABELS` snapshot constant.
Directory constant `path.join(ROOT, '.github', 'ISSUE_TEMPLATE')`.

### TDD steps

1. **RED** — "Given the issue template directory, when listed, then it holds the bug, feature,
   adapter and security forms and the chooser config". Fails: ENOENT — the directory is absent.
2. **RED** — "Given each issue form, when validated against the form schema, then none has a
   violation, names are unique and labels are existing ones" (`formViolations` and
   `formSetViolations` empty over the four forms). Fails: ENOENT reading the first form.
3. **RED** — "Given the adapter request form, then it asks for the runtime, headless execution,
   deny surface and subagent dispatch" (element ids `runtime`, `headless`, `deny-surface`,
   `subagents` present). Fails: ENOENT.
4. **RED** — "Given the chooser config, then blank issues are a boolean and one contact link
   points at the security policy" (`configViolations` empty; one `url` ends with
   `/SECURITY.md`). Fails: ENOENT.
5. **RED** — "Given the security contact form, then it has no free-text field, warns first and
   requires the no-details confirmation" (`securityFormViolations` empty). Fails: ENOENT.
6. **GREEN** — write the four forms and config.yml per the contents above. Steps 1–5 green.
7. **GUARD** — bad inputs for `formViolations`, each yielding a message naming the file: a
   markdown element carrying an `id`; a dropdown with duplicate options; a label `adapter`
   not in the snapshot; an element of type `select`. Passes: the validator rejects them.
8. **GUARD** — bad inputs for `securityFormViolations`, built from the live form: a `textarea`
   appended; the checkbox option's `required` removed; the markdown moved after the
   checkboxes — each yields a message naming `security-contact.yml`. Passes: the validator
   rejects them.
9. **REFACTOR** — one `loadYaml(fileName)` helper; the per-type required-attribute table as a
   frozen constant map.

### Gate

```bash
node --test test/issue-forms.test.js test/source-hygiene.test.js test/plugin-evals-local-only.test.js
```

### Commit

`docs(community): add issue forms for bugs, features, adapters and security contact`

## Part 3 — Contributing guide and security policy

### Context

Creates `CONTRIBUTING.md`, `SECURITY.md`, `test/community-scaffolding.test.js`; edits
`README.md` (one line) and `CHANGELOG.md` (one `### Added` bullet under `[Unreleased]`).

Hard constraints: see "Conventions every part follows" — no ADR/phase/part/backlog ids in
files or test titles, no AI-tooling trace, no absolute paths, never push/tag/release.

**README edit** — in the `## Docs` section, replace the line
`` Contributing to craft itself? Dev loop: `claude --plugin-dir /path/to/craft`. `` with
`Contributing to craft itself? Start at [CONTRIBUTING.md](CONTRIBUTING.md).` Leave the next
line (`Behavioural evals (local, on demand, never CI): …`) untouched.

**CHANGELOG bullet** (under `## [Unreleased]` → `### Added`): a contributing guide, a
security policy, and issue forms for bugs, features, adapter requests and security contact.

**CONTRIBUTING.md** sections, in order (contribution model is process-agnostic):

1. *Before you start* — any way of working is welcome; a PR is accepted when
   `bash scripts/ci.sh` is green and commits follow Conventional Commits; open an issue first
   for a feature (link the forms: [open an issue](https://github.com/scolladon/craft/issues/new/choose)).
   craft runs are the maintainer's own way of working, mentioned, never required.
2. *Set up* — Node 22, `jq`, `shellcheck` on PATH; `npm --prefix engine ci`. (No
   devcontainer mention yet — Part 5 appends it.)
3. *The local gate* — `bash scripts/ci.sh` is what CI runs (~10 s); also
   `bash scripts/readme-drift.sh` when README.md changes.
4. *Dev loop* — `claude --plugin-dir <path-to-craft>` loads the working copy.
5. *Commits and PRs* — Conventional Commits, one line, no body; no phase, decision-record or
   backlog ids in source or test code (test/source-hygiene.test.js enforces it).
6. *Where things live* — link `docs/contributing/README.md`;
   behavioural evals are local-only and never CI: link
   maintainer smokes (`docs/contributing/maintainer-smokes.md`). **Quote no eval command.**
7. *Releases* — link `docs/contributing/releasing.md`.

**SECURITY.md**:

~~~markdown
# Security policy

## Supported versions

Only the latest release receives security fixes — the newest entry in
[CHANGELOG.md](CHANGELOG.md).

## Reporting a vulnerability

**Do not include vulnerability details in a public issue, pull request or comment.**

1. Open a [security contact request](https://github.com/scolladon/craft/issues/new?template=security-contact.yml).
   It asks for a private contact and nothing else.
2. The maintainer replies in that issue with a private channel.
3. Send the details there only. The public issue is closed once you have moved over.

## Scope
~~~

Scope — in: hooks under hooks/; scripts craft executes in a user's repository; guard
bypasses in the shipped adapter bindings; anything that writes outside the run's worktree.
Out: the host agent runtimes themselves; limitations an adapter declares in
`adapters/README.md` (its guard posture — e.g. the aider binding declines
a guard because aider has no deny surface). Add one line: the adapter bindings are
portability proofs, not supported products. A blank issue can still carry details; this
policy and the chooser link are the mitigation.

**Test file `test/community-scaffolding.test.js`** — validators:
`securityPolicyViolations(securityText)`: has `## Reporting a vulnerability`; the first
non-blank line after it contains `Do not include vulnerability details`; the section contains
`issues/new?template=security-contact.yml`. `EVAL_COMMAND = /claude\s+plugin\s+eval/`
(regex literal — see the test-text traps; title wording: "quotes no eval command").

### TDD steps

1. **RED** — "Given CONTRIBUTING.md, when read, then it routes to the contributor docs, names
   the local gate and quotes no eval command": contains `](docs/contributing/README.md)`,
   contains `bash scripts/ci.sh`, contains `](docs/contributing/releasing.md)`, does not
   match `EVAL_COMMAND`. Fails: ENOENT.
2. **RED** — "Given README.md, then its contributor entry point links CONTRIBUTING.md"
   (contains `[CONTRIBUTING.md](CONTRIBUTING.md)`). Fails: README still carries the dev-loop line.
3. **GREEN** — write CONTRIBUTING.md; replace the README line.
4. **RED** — "Given SECURITY.md, when its reporting section is read, then the no-details rule
   comes first and the section links the security contact form, which exists"
   (`securityPolicyViolations` empty and `.github/ISSUE_TEMPLATE/security-contact.yml`
   exists — it does, from Part 2). Fails: ENOENT.
5. **GREEN** — write SECURITY.md; add the CHANGELOG bullet.
6. **GUARD** — bad inputs for `securityPolicyViolations`: the rule moved below the numbered
   steps; the form link removed — each yields a message naming `SECURITY.md`. Pass:
   validator exists.
7. **GUARD** — test/release-discipline.test.js still green (CHANGELOG shape unchanged).
8. **REFACTOR** — section extraction helper `sectionAfter(text, heading)`; constants named.

### Gate

```bash
node --test test/community-scaffolding.test.js test/release-discipline.test.js test/source-hygiene.test.js test/plugin-evals-local-only.test.js
bash scripts/readme-drift.sh
lychee --offline --include-fragments --no-progress --exclude-path engine/node_modules './**/*.md'
node engine/bin/prose-lint.js --gate blocking -- CONTRIBUTING.md SECURITY.md README.md CHANGELOG.md
```

### Commit

`docs(community): add contributing guide and security policy`

## Part 4 — One arch-aware dev-tool install script for CI

### Context

Creates `scripts/install-dev-tools.sh` (mode 755) and `test/install-dev-tools.test.js`; edits
`.github/workflows/ci.yml`. No CHANGELOG bullet (CI plumbing; the devcontainer bullet in
Part 5 is the user-visible effect). The script is **internal** tooling.

Hard constraints: see "Conventions every part follows" — no ADR/phase/part/backlog ids in
files or test titles (scripts/ is scanned whole-line, case-insensitive, as shipped code), no
AI-tooling trace, no absolute paths, never push/tag/release. Never name evals in the script,
the workflow or the test.

**Current ci.yml, `ci` job** — replace these two steps (lines 27–34) and nothing else; the
`readme-drift` and `links` jobs are untouched; `setup-node` keeps `node-version: '22'`:

~~~yaml
      - name: Install bats, shellcheck, jq
        run: sudo apt-get update && sudo apt-get install -y bats shellcheck jq

      - name: Install yq
        run: |
          sudo wget -qO /usr/local/bin/yq \
            https://github.com/mikefarah/yq/releases/download/v4.44.3/yq_linux_amd64
          sudo chmod +x /usr/local/bin/yq
~~~

with

~~~yaml
      - name: Install dev tools
        run: bash scripts/install-dev-tools.sh
~~~

**The script, verbatim** (probed in a throwaway: shellcheck clean, stub-lint clean, the three
arch cases behave as below):

~~~bash
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
~~~

The arch check runs before any install, so an unsupported machine fails before mutating
anything. Both `yq_linux_amd64` and `yq_linux_arm64` exist for v4.44.3.

**Test file `test/install-dev-tools.test.js`** — PATH-stub pattern of
test/static-lints-ci.test.js (`EXECUTABLE_MODE = 0o755`, throwaway via
`fs.mkdtempSync(path.join(os.tmpdir(), 'install-dev-tools-'))`, removed in `finally` with
`fs.rmSync(..., { recursive: true, force: true })`). Stubs written to `<tmp>/bin`:

| Stub | Body |
|---|---|
| `dpkg` | `echo "$FAKE_ARCH"` |
| `id` | `echo "$FAKE_UID"` |
| `sudo` | `echo "sudo" >> "$TOOL_LOG"; exec "$@"` |
| `apt-get`, `curl`, `chmod` | `echo "<name> $*" >> "$TOOL_LOG"` |

Run: `spawnSync('bash', [SCRIPT], { encoding: 'utf8', env: { ...process.env, PATH: stubDir + path.delimiter + process.env.PATH, TOOL_LOG, FAKE_ARCH, FAKE_UID, YQ_BIN_DIR: tmp } })`,
SCRIPT = `path.join(ROOT, 'scripts', 'install-dev-tools.sh')`. Expected log for amd64 /
uid 1000 (sudo lines interleaved before each tool line):
`apt-get update`, `apt-get install -y bats shellcheck jq`,
`curl -fsSL -o <tmp>/yq https://github.com/mikefarah/yq/releases/download/v4.44.3/yq_linux_amd64`,
`chmod +x <tmp>/yq`. The test is hermetic on macOS and Linux (every external binary the
script calls is stubbed).

ci.yml parsing: js-yaml (see conventions); `steps = doc.jobs.ci.steps`.

### TDD steps

1. **RED** — the arch table, three tests: "Given an amd64 machine, when the install script
   runs, then it installs bats, shellcheck and jq and fetches the amd64 yq v4.44.3 into the
   target dir"; "Given an arm64 machine, … then it fetches the arm64 yq"; "Given an
   unsupported architecture, … then it exits non-zero naming the architecture and installs
   nothing" (status ≠ 0, stderr contains `riscv64`, log has no `apt-get` line). Fails:
   `bash` exits 127 — the script does not exist.
2. **GREEN** — write the script verbatim; `chmod 755`.
3. **GUARD** — "Given root, when the script runs, then it calls the tools without sudo"
   (`FAKE_UID=0` → no `sudo` line; tool lines identical). Passes: `as_root` already branches.
4. **RED** — "Given the CI workflow, when the ci job's steps are read, then dev tools come from
   the shared install script and no step installs them inline": some step's `run` ===
   `bash scripts/install-dev-tools.sh`; no step in any job has a `run` matching
   `/apt-get install/` or `/mikefarah\/yq/`. Fails: the inline steps are still there.
5. **GREEN** — replace the two ci.yml steps with the one step.
6. **REFACTOR** — `runInstall({ arch, uid })` helper returning `{ status, stderr, log }`;
   `toolLines(log)` filters out `sudo`.

### Gate

```bash
node --test test/install-dev-tools.test.js test/source-hygiene.test.js test/plugin-evals-local-only.test.js
bash scripts/static-lints.sh
node engine/bin/stub-lint.js --gate blocking -- scripts/install-dev-tools.sh
```

### Commit

`ci: install dev tools from one arch-aware script`

## Part 5 — Devcontainer and Codespaces badge

### Context

Creates `.devcontainer/devcontainer.json` and `test/devcontainer.test.js`; edits `README.md`
(badge line + one Quickstart paragraph), `CONTRIBUTING.md` (one clause in *Set up*),
`docs/contributing/maintainer-smokes.md` (one section appended) and `CHANGELOG.md` (one
`### Added` bullet).

Hard constraints: see "Conventions every part follows" — no ADR/phase/part/backlog ids in
files or test titles, no AI-tooling trace, no absolute paths, never push/tag/release.

**devcontainer.json, verbatim — strict JSON (no comments; the test uses `JSON.parse`):**

~~~json
{
  "name": "craft",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:22",
  "features": {
    "ghcr.io/anthropics/devcontainer-features/claude-code:1": {}
  },
  "postCreateCommand": "bash scripts/install-dev-tools.sh && npm --prefix engine ci",
  "secrets": {
    "ANTHROPIC_API_KEY": {
      "description": "Optional: an API key for Claude Code. Without it, run claude and log in."
    }
  }
}
~~~

Image facts: `javascript-node:22` = Debian trixie, amd64 + arm64, bundles the `node`
feature, `remoteUser: node`. No separate node feature. The claude-code feature installs the
CLI via npm. The built container is **unverified** (no Docker daemon here) — hence the
maintainer smoke.

**README edits:**

- Badge — new line directly **after the line starting `[![version]`** (from Part 1), verbatim
  (pinned to pass source-hygiene class B; GitHub's own badge.svg and any `logo=github`
  variant fail it):

  ~~~markdown
  [![Open in Codespaces](https://img.shields.io/badge/Open%20in-Codespaces-blue)](https://codespaces.new/scolladon/craft)
  ~~~

- Quickstart — new paragraph after the paragraph starting `Requirement: **a discoverable test command**`
  and before `## What a run looks like`, verbatim, **no duration** (only a recorded smoke
  time may back one):

  ~~~markdown
  No local setup: open a Codespace from the badge above, then run `claude --plugin-dir .` and
  try `/craft:review` on a branch, or `/craft:run` on a brief.
  ~~~

**CONTRIBUTING edit** — in *Set up*, append: "Or open the repository in its
devcontainer (`.devcontainer/devcontainer.json`), locally or as a Codespace: it runs the shared
dev-tool install and `npm --prefix engine ci` for you."

**maintainer-smokes.md** — append at the end of the file (after the
`## SC5 second-instantiation smoke — not CI-gated` section), same heading shape:
`## Devcontainer cold-start smoke — not CI-gated`. Body: on demand, open a fresh Codespace
from the README badge; confirm the post-create command exits 0, `yq --version` reports
v4.44.3, `claude --version` runs, `bash scripts/ci.sh` passes, and `claude --plugin-dir .`
lists `/craft:run`; record the wall-clock time from create to ready — only a recorded time may
back a duration in README; optionally repeat in a local arm64 devcontainer.

**CHANGELOG bullet** (`[Unreleased]` → `### Added`): a devcontainer and an "Open in
Codespaces" badge; CI and the devcontainer install the same dev tools.

**Test file `test/devcontainer.test.js`**: ci.yml read with js-yaml; the CI Node major is the
`node-version` of the step whose `uses` starts with actions/setup-node in `jobs.ci.steps`
(today `'22'`). Constants: `IMAGE_PATTERN = /^mcr\.microsoft\.com\/devcontainers\/javascript-node:(\d+)$/`,
`CLAUDE_FEATURE = 'ghcr.io/anthropics/devcontainer-features/claude-code:1'`,
`CODESPACES_URL = 'https://codespaces.new/scolladon/craft'`,
`SMOKE_HEADING = '## Devcontainer cold-start smoke — not CI-gated'`.

### TDD steps

1. **RED** — "Given the devcontainer definition, when parsed, then it uses the CI Node major,
   adds the Claude Code feature and runs the shared install then the engine install": JSON
   parses; image major === CI major; `features` has `CLAUDE_FEATURE`; `postCreateCommand`
   contains `scripts/install-dev-tools.sh` and `npm --prefix engine ci`. Fails: ENOENT.
2. **GREEN** — write devcontainer.json.
3. **RED** — "Given README.md, then it carries a Codespaces badge and its Codespace prose
   states no duration": a line contains `](${CODESPACES_URL})`; every README line containing
   `Codespace` that does not start with `[![` contains no digit, and at least one such line
   exists. Fails: no badge, no prose line.
4. **GREEN** — add the badge and the Quickstart paragraph.
5. **RED** — "Given the maintainer smokes, then the devcontainer cold start has a not-CI-gated
   smoke" (a line === `SMOKE_HEADING`). Fails: heading absent.
6. **RED** — "Given CONTRIBUTING.md, then its set-up section offers the devcontainer"
   (contains `](.devcontainer/devcontainer.json)`). Fails: Part 3 wrote no such link.
7. **GREEN** — append the smoke section; add the CONTRIBUTING clause; add the CHANGELOG bullet.
8. **GUARD** — test/release-discipline.test.js and test/community-scaffolding.test.js still green.
9. **REFACTOR** — `ciNodeMajor()` helper; constants named.

### Gate

```bash
node --test test/devcontainer.test.js test/release-discipline.test.js test/community-scaffolding.test.js test/source-hygiene.test.js
bash scripts/readme-drift.sh
lychee --offline --include-fragments --no-progress --exclude-path engine/node_modules './**/*.md'
node engine/bin/prose-lint.js --gate blocking -- README.md CONTRIBUTING.md CHANGELOG.md docs/contributing/maintainer-smokes.md
```

### Commit

`feat(devcontainer): add a devcontainer and Codespaces badge sharing CI's tool install`

## Part 6 — Category comparison table in README

### Context

Edits `README.md` (new section) and `CHANGELOG.md` (one `### Added` bullet); creates
`test/readme-comparison.test.js`. docs/guides/comparison.md is linked, **not edited** — it stays
the single home of the measured numbers.

Hard constraints: see "Conventions every part follows" — no ADR/phase/part/backlog ids in
files or test titles, no AI-tooling trace, no absolute paths, never push/tag/release.

**Insert point** — after the last bullet of `## What craft is not` (the bullet starting
`- **Not a spec generator.**`, ending "…validated, documented.") and before `## Quickstart`,
with one blank line on each side. Verbatim section (categories, not products; non-craft
cells only by-construction statements or "varies by tool"; every craft cell links in-repo
evidence; **no digit anywhere in the section, link targets included**; every link target
verified to exist, the fragment `#where-craft-lost` included):

~~~markdown
## How craft compares

Categories, not products: each cell says what the approach provides by construction.
A given tool in a category may add more — check it.

| | Plain agent prompting | Spec-driven kits | craft |
|---|---|---|---|
| Where the process lives | in the prompt you wrote | in templates and instructions the agent follows | in hooks, scripts and versioned [contracts](contracts/) |
| A red test suite blocks the commit | not by the approach itself | varies by tool | by contract — [never commit on a red gate](contracts/core.md) |
| Why a choice was made survives the session | not by the approach itself | in the spec, when written | as a ratified [decision record](docs/contributing/adr/) |
| Review and validation before the PR | when you ask | varies by tool | gated phases — [the review phase](skills/review/SKILL.md) |
| Resume after a killed session | from the transcript, if the tool keeps one | from the spec files | from the last committed artifact — [plans](docs/contributing/plan/) |
| Cost against a plain prompt | baseline | varies by tool | higher — [measured, with where craft lost](docs/guides/comparison.md#where-craft-lost) |
~~~

Why no digits: readme-drift's whole-README extractor `CORPUS_CLAIM = /\[(\d+)\s[^\]]*\]\((docs\/[^)]*\/)\)/g`
(engine/src/readme-regions.js:33) would turn any `[N …](docs/…/)` link into a guarded claim,
and the README's numbers already have one home. Vocabulary: no `mutation`/`mutant`, no
lowercase `github`/`gh`.

**CHANGELOG bullet** (`[Unreleased]` → `### Added`): a README section comparing craft with
plain agent prompting and spec-driven kits.

**Test file `test/readme-comparison.test.js`** — validator
`comparisonViolations(readmeText)` → messages naming `README.md`: the section
`## How craft compares` exists; its index is after `## What craft is not` and before
`## Quickstart`; the section (heading to next `## `) holds a table whose header row has a
cell equal to `craft`; every body row's cell in that column contains a markdown link whose
target does not start with `http` (`/\]\((?!https?:)[^)]+\)/`); the section matches no `/\d/`.
Table parsing: rows are lines starting `|`; split on `|`, trim, drop the empty first/last
cells; skip the `|---|` separator row.

### TDD steps

1. **RED** — "Given README.md, when the comparison section is validated, then it sits between
   what craft is not and the quickstart, links evidence from every craft cell and holds no
   digit" (`comparisonViolations` empty). Fails: section absent.
2. **GREEN** — insert the section; add the CHANGELOG bullet.
3. **GUARD** — bad inputs (the live README with one edit each): a digit added to a cell; a
   craft cell's link made absolute (`https://example.com`); a craft cell with its link
   removed; the section moved after `## Quickstart` — each yields a message naming
   `README.md`. Pass: validator exists.
4. **REFACTOR** — `sectionOf(text, heading)` and `tableRows(section)` helpers.

### Gate

```bash
node --test test/readme-comparison.test.js test/release-discipline.test.js test/source-hygiene.test.js test/concepts-frames.test.js
bash scripts/readme-drift.sh
lychee --offline --include-fragments --no-progress --exclude-path engine/node_modules './**/*.md'
node engine/bin/prose-lint.js --gate blocking -- README.md CHANGELOG.md
```

### Commit

`docs(readme): add a category comparison table`

## Part 7 — Release cut 1.1.0

### Context

Edits `CHANGELOG.md`, `.claude-plugin/plugin.json` and `README.md`. **Files only**: no tag,
no push, no release — tagging `v1.1.0` and publishing are the maintainer's actions after
merge (docs/contributing/releasing.md step 3).

Hard constraints: see "Conventions every part follows" — no ADR/phase/part/backlog ids in
files, no AI-tooling trace, no absolute paths, never push/tag/release.

Why minor: `git log --format='%s%n%b' v1.0.0..main | grep -E '!:|BREAKING'` is empty, and
`[Unreleased]` has `### Added` entries. Why now: marketplace users receive a new copy only
when plugin.json's `version` changes — they have been on 1.0.0 through every post-tag commit.

Edits:

- plugin.json: `"version": "1.0.0"` → `"version": "1.1.0"` (only that field).
- CHANGELOG: rename `## [Unreleased]` to `## [1.1.0] - <today, UTC, YYYY-MM-DD>` (use
  `date -u +%F`); insert a new empty `## [Unreleased]` above it (no groups under it); link
  definitions become
  `[Unreleased]: https://github.com/scolladon/craft/compare/v1.1.0...HEAD`,
  `[1.1.0]: https://github.com/scolladon/craft/compare/v1.0.0...v1.1.0`,
  `[1.0.0]: https://github.com/scolladon/craft/releases/tag/v1.0.0` (the compare links 404
  until the maintainer pushes the tag — expected).
- README: in the line starting `Current status:`, `` `v1.0.0` `` → `` `v1.1.0` ``.

Optional, not a gate: if `claude` is on PATH, `claude plugin validate .` reports no
version-mismatch warning (four unrelated warnings exist today and stay).

### TDD steps

1. **GUARD** — `node --test test/release-discipline.test.js` passes on the tree as Part 6
   left it (CHANGELOG top release, plugin.json and README literal all `1.0.0`).
2. **GREEN** — set plugin.json `version` to `1.1.0` (the version source the release is about).
3. **RED** — the same suite now fails, naming two surfaces: `CHANGELOG.md` (newest release
   `1.0.0` ≠ `1.1.0`) and `README.md` (`v1.0.0` ≠ `v1.1.0`). This is the coherence guard
   doing its job, not induced breakage.
4. **GREEN** — cut the CHANGELOG section and its links; update the README literal. Suite green.
5. **REFACTOR** — none.

### Gate

```bash
node --test test/release-discipline.test.js test/source-hygiene.test.js
bash scripts/readme-drift.sh
lychee --offline --include-fragments --no-progress --exclude-path engine/node_modules './**/*.md'
```

Phase gate after Part 7: `bash scripts/ci.sh` (~10 s).

### Commit

`chore(release): 1.1.0`
