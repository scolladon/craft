# Design — readme-drift-guards

> Brief: three CI-gated checks that keep `README.md` truthful — validate the embedded
> manifest snippet against `scripts/manifest-lint.sh`, assert the README's phase names
> match the real pipeline, and recompute the FAQ's telemetry numbers from
> `docs/metrics-baseline.report.json` — wired into `.github/workflows/ci.yml` as a new
> fail-loud `readme-drift` job, and runnable locally with one command.
> Status: draft → self-reviewed ×3 → accepted-pending-ADR

## Context

What exists today, and the patterns this feature must follow:

- **`README.md` is the public face and drifts silently.** Three regions carry facts
  that duplicate machine truth elsewhere: (1) the `yaml` fenced block in *Make it yours*
  quotes a `.claude/workflow.md` manifest; (2) the `mermaid` block and the `text` block
  in *What a run looks like* name the pipeline phases; (3) the FAQ *What does a run cost?*
  quotes numbers derived from the telemetry report. Nothing forces any of them to stay
  true — a renamed phase, a new manifest key, or fresh telemetry drifts the README and
  only a human reader notices.

- **The lint/gate pattern is established and shared.** `scripts/*.sh` are `set -euo
  pipefail` bash. Several are ~4-line shims over an `engine/bin/*.js` bin
  (`scripts/manifest-lint.sh` → `engine/bin/manifest-lint.js` →
  `engine/src/manifest-lint-main.js`); others are pure awk (`scripts/design-lint.sh`).
  Every lint is enumerated in `scripts/ci.sh` — "the single shared definition that CI
  and local both run" — and CI's `ci` job is just `bash scripts/ci.sh`. This feature
  mirrors that shape: one front-door script, pure logic behind it, one CI entry.

- **`engine/bin` shim convention.** Bins are ~5-line shims over `engine/src/<name>-main.js`;
  all logic lives in `engine/src/` so mutation testing (`npm --prefix engine run mutation`,
  scope `engine/src/**`) covers it. Bins are never mutated; their spawn-smoke tests go in
  `engine/test/<name>.bin.test.js`; core logic tests in `engine/test/<name>.test.js`.
  Reference: `engine/bin/manifest-lint.js` → `engine/src/manifest-lint-main.js` →
  `engine/test/manifest-lint.bin.test.js`. `usage-telemetry-miner`
  ([docs/design/usage-telemetry-miner.md](usage-telemetry-miner.md)) is the closest prior
  art: a parse-plus-recompute feature that put its deterministic core in `engine/src`
  (`usage-aggregate.js`) with a thin `scripts/*.sh` wrapper and a skill front door.

- **The manifest validator is reusable in-process.** `engine/src/manifest-lint-main.js`
  is `extractFrontmatter(content)` → `js-yaml load` → `validateManifest(parsed, {…})`.
  `validateManifest` (`engine/src/manifest.js`) exits/reports on unknown top-level keys,
  unknown pipeline sub-keys, and legacy per-phase `skip`. `js-yaml` is already an engine
  dependency — no new tool is needed to parse YAML or the JSON report.

- **The pipeline descriptor is the phase source of truth.** `pipeline/default.yml` is a
  list of descriptors, each with `id:` and an optional `enabled:` (absent ⇒ enabled).
  `skills/` is NOT a phase list — it also holds non-phase skills (`run`, `init`,
  `metrics`, `promote-config`, `prune`, `tune`).

- **Node-native test harness.** Repo-root `test/*.test.js` are `node:test` files; some
  shell out to a bash script via `execFileSync` (`test/manifest-lint.test.js` runs
  `scripts/manifest-lint.sh` against fixtures and asserts exit code + message). `bats`
  is installed in CI but the repo-root suite is `node --test` (`run_suite process test`).
  `test/every-test-file-registers.test.js` enforces that every `test/*.test.js` is
  wired into `scripts/ci.sh`.

- **CI shape.** `.github/workflows/ci.yml` has two jobs: `ci` (setup-node 22 →
  `cd engine && npm ci` → install bats/shellcheck/jq/yq → `bash scripts/ci.sh`) and
  `links` (a standalone `lycheeverse/lychee-action` offline markdown check — precedent
  for a check that is its own job, not folded into `scripts/ci.sh`).

- **Guardrails that bind the guard's own source.** No provenance refs (phase/ADR/backlog
  numbers) in the guard scripts/tests; no suppression directives; no swallowed errors;
  determinism (no clock, no network in the recompute). `scripts/ci.sh` shellchecks
  `scripts/*.sh`, so the front-door script must be shellcheck-clean. Design docs under
  `docs/design/` are exempt from `prose-lint` and are not in the `intention-lint` living
  corpus, so this doc may quote ban-list words freely.

## Requirements

Verifiable statements that must hold when this ships:

1. **Manifest-snippet guard.** Every `yaml` fenced block in `README.md` is validated
   through the same manifest validation `scripts/manifest-lint.sh` performs; an invalid
   or unknown-key snippet fails the guard non-zero. (Today: exactly one `yaml` block,
   `pipeline:\n  skip: [refactoring]`.)

2. **Phase-name guard.** The set of phase names shown in the README's `mermaid` pipeline
   diagram AND in the *What a run looks like* `text` timeline equals the set of **enabled**
   phase `id`s in `pipeline/default.yml`. A renamed, added, or removed phase — on either
   the README side or the pipeline side — fails the guard non-zero and names the drift.

3. **Telemetry-claims guard.** The FAQ's quoted numbers are recomputed from
   `docs/metrics-baseline.report.json` and compared to the values written in the README;
   any drift (README edited without data, or data changed without README) fails the guard
   non-zero and names the claim, the README value, and the recomputed value. Claims
   guarded: run count (`27`), median run hours (`≈1.3`), min hours (`half an hour`),
   max hours (`≈5`).

4. **Fail-loud, specific.** Each guard's failure message names *which* README surface
   drifted and prints expected-vs-actual — never a bare non-zero exit.

5. **Local parity.** All three guards run locally from one command
   (`bash scripts/readme-drift.sh`), identical to what CI runs — no check-logic embedded
   only in workflow YAML.

6. **CI-gated.** A new `readme-drift` job in `.github/workflows/ci.yml` runs the same
   command and fails the build on any drift.

7. **Deterministic & self-contained.** The recompute uses no clock, no network, no
   randomness; identical inputs ⇒ identical verdict. No new runtime dependency beyond
   what the guard's chosen home already has.

8. **Acceptance:** on today's tree all three guards pass; a mutation to each input (rename
   a phase in `default.yml`, add an unknown key to the README snippet, bump a run's
   `durationMs` so the median rounds differently) each turns the guard red with a message
   naming the offending surface; the guard source carries no provenance refs / suppression
   directives; `scripts/ci.sh` (shellcheck + `node --test`) stays green.

## Design

Three sub-guards behind one front-door script. Recommended home (DC2): pure logic in
`engine/src`, one bin, thin `scripts/readme-drift.sh` wrapper that is also the
one-command local front door; a separate `readme-drift` CI job calls the script.

```
scripts/readme-drift.sh            # front door + local parity; shellcheck-clean; calls the bin
engine/bin/readme-drift.js         # ~5-line shim over engine/src/readme-drift-main.js
engine/src/readme-drift-main.js    # orchestrates the three sub-guards; aggregates; exit code
engine/src/readme-regions.js       # pure: README text -> { yamlBlocks[], mermaidPhases[], timelinePhases[], costClaims{} }
engine/src/phase-truth.js          # pure: default.yml descriptors -> enabled phase-id set (enabled:false excluded)
engine/src/telemetry-claims.js     # pure: report object -> { runCount, medianHours, minHours, maxHours }; + claim comparison
engine/test/readme-regions.test.js
engine/test/phase-truth.test.js
engine/test/telemetry-claims.test.js
engine/test/readme-drift.bin.test.js
test/readme-drift.test.js          # shells the front-door script against a fixture tree (design-lint/manifest-lint precedent)
```

The three cores are pure `(input) → value` functions (mutation-covered); the bin wires
file reads to them; the script is the human/CI entry point. All region extraction is
anchored on the fenced-block info-string or a named FAQ heading, never on line numbers,
so unrelated README edits do not shift the guard.

### Failure semantics

`readme-drift-main.js` runs all three sub-guards, collects every drift finding, prints
them, and exits non-zero if any found (run-all, not fail-fast — one run surfaces every
drift at once). Each finding is one line: `readme-drift: <surface>: <expected> vs
<actual>`. A guard whose input is structurally absent (e.g. zero `yaml` blocks) is itself
a drift the guard reports — it never silently no-ops (fail-loud requirement).

### Sub-guard 1 — manifest snippet

Extract every `yaml` fenced block body from `README.md` (info-string `yaml`, between the
opening and closing fence). For each, validate it exactly as `scripts/manifest-lint.sh`
does. Recommended mechanism (DC3): reuse the engine core in-process — a README `yaml`
block is frontmatter-shaped content, so wrap it as `---\n<block>\n---\n<dummy body>`,
run `extractFrontmatter` → `js-yaml load` → `validateManifest`, and report any error the
validator returns. This is the identical validation path `manifest-lint.sh` runs, with no
temp file. (If DC2 lands as bash instead, the mechanism is the empirically-pinned
mktemp-wrap-and-shell below.)

**Empirical pin — the wrap is accepted by `manifest-lint.sh` today** (ran in a mktemp
throwaway, never the worktree):

| Snippet body | Wrapped file → `manifest-lint.sh` | Exit |
|---|---|---|
| `pipeline:`<br>`  skip: [refactoring]` (the README block) | `---\n<snippet>\n---\n\n<body>` | `0` — `… valid.` |
| `pipeline:`<br>`  bogusKey: [refactoring]` (control) | same wrap | `2` — `unknown pipeline key: bogusKey` |

Robustness: the guard validates **all** `yaml` blocks, so a future second manifest
example is covered automatically; zero `yaml` blocks is reported as drift, not a pass.

### Sub-guard 2 — phase names

**Truth source (DC1): `pipeline/default.yml`, enabled descriptors only.** Parse with
`js-yaml`; keep every descriptor whose `enabled` is not `false` (absent ⇒ enabled); the
`id`s of that set are the truth.

**Empirical pin — enabled set = the 11 README phases:**

| default.yml `id` | state | README mermaid | README timeline |
|---|---|---|---|
| workspace | enabled | ✓ | ✓ |
| requirements | **enabled:false** | — (prose only) | — |
| design, decisions, planning, implementation, review, refactoring, validation | enabled | ✓ | ✓ |
| architecture | **enabled:false** | — (prose only) | — |
| documentation, propose, integrate | enabled | ✓ | ✓ |

Enabled-only ids, in order: `workspace design decisions planning implementation review
refactoring validation documentation propose integrate` — exactly the phases the mermaid
and timeline name. `requirements` and `architecture` are the two the README mentions only
as "default-off" prose.

> **Footgun pinned:** the idiomatic `.enabled // true` (jq/yq alternative operator, and
> the JS `??`/`||` analogue) returns the RHS when the LHS is `false`, so it treats
> `enabled: false` as enabled and silently pulls `requirements`/`architecture` into the
> truth set — verified live (`jq 'select(.enabled // true)'` emits 13 ids, not 11). The
> filter MUST be explicit: `has("enabled") and .enabled == false | not`. `phase-truth.js`
> carries a unit test pinning that `enabled: false` is excluded.

**README extraction (`readme-regions.js`):**
- *mermaid*: from the `mermaid` fenced block, capture node display labels — text inside
  `[...]` (rectangle nodes, e.g. `W[workspace]`) and inside `{{"..."}}` (hexagon nodes,
  e.g. `IN{{"integrate 🧑"}}`); strip a trailing `🧑` decision marker and whitespace.
  **Exclude subgraph group labels**: a `[...]` on a line beginning with `subgraph`
  (`subgraph spec [specify]`) is a group name (`specify`/`verify`/`ship`), not a phase.
- *timeline*: from the `text` fenced block, take the first whitespace-delimited token of
  each line that contains `→` (skips the leading `/craft:run "…"` line); strip the `🧑`
  marker.

**Comparison:** the mermaid phase set, the timeline phase set, and the enabled-id set
must all be equal (set equality, order-insensitive). Any asymmetric difference is reported
naming the side that has the extra/missing phase.

### Sub-guard 3 — telemetry claims

**Truth source: `docs/metrics-baseline.report.json`** — top-level `{schemaVersion,
recommendations, runs[]}`; each run `{run, slug, reviewCycles, groups[]}`; each group
carries `durationMs`. Per-run duration = sum of its groups' `durationMs`.

**Recompute (`telemetry-claims.js`, deterministic):**
- `runCount = runs.length`.
- Over runs whose summed `durationMs > 0` (duration-bearing runs), in hours
  (`ms / 3_600_000`): `minHours`, `maxHours`, and `medianHours` (even n ⇒ average of the
  two central order statistics — see convention note).

**Empirical pin — recomputed from today's report:**

| Aggregate | Raw | README token | Rounding rule |
|---|---|---|---|
| run count | `27` (`runs.length`) | `27 telemetered runs` | exact integer |
| runs with duration > 0 | `26` (1 run has zero group duration) | — (basis for below) | — |
| median hours | `1.2942` (avg-of-two) / `1.3078` (upper-middle) | `≈1.3 hours` | round to 1 dp |
| min hours | `0.4609` | `half an hour` | nearest ½ h ⇒ `0.5` ⇒ "half an hour" |
| max hours | `5.0083` | `≈5 hours` | round to integer |

> **Median convention:** with 26 duration-bearing runs (even), the standard median is the
> average of the two central values (`1.2942 h`); the upper-middle order statistic is
> `1.3078 h`. Both round to `1.3` today, but a data change could split them — the guard
> commits to one convention (recommended: average-of-two, the statistical median) and
> documents it, so its verdict is reproducible. This convention is part of DC4.

**Comparison (drift-guard direction — README is the assertion, report is truth):**
`readme-regions.js` extracts the four claim tokens from the FAQ *What does a run cost?*
region (anchored on the question text): `(\d+) telemetered runs`, `≈([\d.]+) hours`
(median), the literal `half an hour` (min), and the max `≈(\d+) hours`. The guard applies
each rounding rule to the recomputed raw value and asserts the rounded result equals the
README token (DC4). Drift on either side (README hand-edited, or `report.json`
regenerated) trips the guard, naming claim + README value + recomputed value.

### CI wiring

New `readme-drift` job in `.github/workflows/ci.yml` (DC5 rec: separate job, `links`-style
isolation + brief's literal ask): `actions/checkout` → `actions/setup-node@v4` (node 22)
→ `cd engine && npm ci` → `bash scripts/readme-drift.sh`. With the node home (DC2 rec (a)),
the job needs neither `jq` nor `yq` — `js-yaml` (already an engine dep) parses the
pipeline YAML and `JSON.parse` reads the report. `test/readme-drift.test.js` is registered
in `scripts/ci.sh` so the guard's own logic is exercised by the existing `ci` job too.

## Decision candidates

The designer never decides these; the user does, in the ADR phase.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | **Phase-name truth source** | (a) `pipeline/default.yml`, enabled descriptors only; (b) `skills/` directory listing; (c) both, cross-checked | **(a)** | `default.yml` is the descriptor source of truth; the enabled-only filter yields exactly the 11 phases the README shows (pinned). `skills/` is noisy — it holds non-phase skills (`run`/`init`/`metrics`/`promote-config`/`prune`/`tune`), so a set-diff against it needs a hand-maintained exclude list that itself drifts. (c) adds a second source to keep in sync for no extra signal. |
| 2 | **Where the guard logic lives** | (a) pure cores in `engine/src` + one `engine/bin` + thin `scripts/readme-drift.sh` + `engine/test` (mutation-covered); (b) fully bash in `scripts/readme-drift.sh` (awk/jq/yq, shell `manifest-lint.sh`) + `node --test` wrapper in `test/`; (c) mixed — bash extraction, node only for the numeric recompute | **(a)** | Mirrors the `usage-telemetry-miner` precedent (parse + recompute → `engine/src` core, thin script, tests) and gives mutation coverage over the deterministic median/min/max and the enabled-filter — the very place the `.enabled // true` footgun would otherwise hide untested. `js-yaml`/`JSON.parse` remove the need for `jq`/`yq`. (b) leaves median/rounding/regex extraction untested at unit granularity; (c) splits logic across two homes. |
| 3 | **Manifest-snippet validation mechanism** | (a) reuse engine `extractFrontmatter` + `validateManifest` in-process (wrap snippet in `---…---` string, no temp file); (b) black-box: write mktemp `---<snippet>---<body>` file and shell `scripts/manifest-lint.sh` | **(a)** *(if DC2=a)* | In the node home the engine validator IS the exact validation `manifest-lint.sh` runs (it delegates to it) — reusing it in-process is faithful and drops temp-file I/O + a subprocess. If DC2 lands as bash, (b) is the mechanism (empirically pinned: valid→0, unknown-key→2). Depends on DC2. |
| 4 | **Telemetry rounding / tolerance policy** | (a) recompute raw + apply the README author's per-claim rounding (count→exact int; median→1 dp; min→nearest ½ h; max→int) and assert the rounded value equals the FAQ token; (b) tolerance bands (count exact, median ±0.1 h, max ±0.5 h); (c) exact-match a pinned expected-values table checked against both README and report | **(a)** | Deterministic and maximally drift-sensitive: any data change that moves a *rounded* value trips it, mirroring how the numbers were actually produced. Requires committing to the median convention (average-of-two central values) and the min-label rule (nearest ½ h ⇒ "half an hour"), both documented. (b) is laxer than "drift detection" wants; (c) double-maintains an expected table. |
| 5 | **CI job shape** | (a) separate `readme-drift` job that runs `bash scripts/readme-drift.sh`; (b) fold into the `ci` job by appending the guard to `scripts/ci.sh`; (c) separate job with steps inlined in YAML | **(a)** | Honors the brief's literal "new `readme-drift` job", gives an isolated failure signal + parallelism (like `links`), and preserves one-command local parity via the script. Extra `setup-node` + `npm ci` steps are cheap. (b) mixes the signal into the substrate gate and is not a separately-named job; (c) puts check-logic in YAML, breaking local parity. Note: (b) is coherent with ci.sh's "single shared definition" ethos if a single gate is preferred. |
| 6 | **Phase-guard strictness / scope** | (a) set-equality of enabled ids vs the mermaid∪timeline phase sets, excluding subgraph labels + `🧑` markers; (b) also assert `requirements`/`architecture` appear in the "default-off" prose; (c) order-sensitive sequence match | **(a)** | The brief's requirement is "a renamed/added/removed phase breaks CI" — set-equality on the enabled set delivers exactly that and is robust to the mermaid's presentational ordering/subgraphs. (b) guards the default-off prose too but couples to fragile sentence wording for marginal value; (c) makes benign diagram reordering a false failure. |

## Test strategy

TDD, London-school, Given/When/Then titles; ≥80% coverage; `engine/src` cores are the
mutation target. No provenance refs, no suppression directives, no swallowed errors in
any guard source or test.

- **`readme-regions.test.js`** (pure extraction): fixture README fragments assert —
  `yaml` block bodies extracted (0, 1, and 2 blocks); mermaid phase labels captured with
  subgraph labels (`specify`/`verify`/`ship`) and `🧑` markers excluded; timeline first
  tokens captured, `/craft:run` line skipped; FAQ claim tokens (`27`, `1.3`, `half an
  hour`, `5`) parsed. Property lens: extraction is anchored on info-strings/heading, so
  inserting unrelated prose between regions does not change the result.
- **`phase-truth.test.js`** (pure filter): a descriptor list with an explicit
  `enabled: false` entry ⇒ that id excluded (the footgun regression — pins that
  `enabled: false` is dropped, not kept); absent `enabled` ⇒ kept; order-insensitive
  set output.
- **`telemetry-claims.test.js`** (pure recompute): hand-built report objects assert —
  `runCount = runs.length`; median over duration-bearing runs with the even-n
  average-of-two convention; a run with all-zero group durations excluded from
  median/min/max but counted in `runCount`; the rounding rules map raw→token; a
  drifted value (bumped `durationMs`) flips the verdict. Deterministic: no clock/random.
- **`readme-drift.bin.test.js`** (bin smoke): `spawnSync` the bin against a fixture tree
  in a mktemp throwaway — clean tree → exit 0; a tree with a renamed phase / unknown
  snippet key / bumped telemetry → exit non-zero with the surface named.
- **`test/readme-drift.test.js`** (front-door, `execFileSync` like
  `test/manifest-lint.test.js`): the real repo tree passes; three mutated copies (in
  mktemp) each fail with the expected message. Registered in `scripts/ci.sh` so
  `test/every-test-file-registers.test.js` stays green.
- **Lints:** `scripts/readme-drift.sh` is shellcheck-clean; `scripts/ci.sh`
  (`node --test` + shellcheck) green; the new job green on today's tree.

## Out of scope

- **Auto-regeneration / `--fix` of README numbers or phase lists** — the brief asks for
  drift *detection* that fails loudly; a regen mode is a possible follow-up, not the core
  check.
- **Guarding README regions beyond the three named** — the comparison table, the adapter
  bindings table, the *craft builds craft* receipts counts (18 design docs, 270 ADRs, …),
  the VHS demo GIF, the docs site: each is its own drift surface and its own follow-up.
- **The `requirements`/`architecture` default-off prose wording** — DC6 rec (a) guards
  the enabled-phase set only; asserting the prose sentence is deferred.
- **External-URL / badge liveness** — the `links` job already covers relative links and
  fragments offline; live external URLs remain unchecked by design.
