# Design — shrink core & prune guardrail drag

> Brief: a hardening pass that shrinks the invariant engine core (carve the observability
> stack behind its own boundary; split the 667-line manifest validator along its seams),
> retires guardrails that add drag without safety (the `EXPECTED_TESTS` count pins, the
> doubled cwd-independence suite run), makes the "no vendor name in plugin source" rule
> lint-enforceable, archives closed-program docs, and adds an advisory prompt-regression
> drift signal on top of the metrics miner. No behaviour change to the shipping features.
> Status: draft → self-reviewed ×3 → accepted-pending-ADR

## Context

craft is a hexagonal phase-pipeline engine (`BACKLOG.md` header). Its durable premise is a
**small invariant core** (pipeline resolution, manifest handling, contracts) surrounded by
ports whose vendor specifics live in adapter bindings. This change is maintenance on that
premise: two files grew past the 200–400-line house norm (`engine/src/manifest.js` 667,
`engine/src/memory.js` 650), an observability stack accreted into the core over P22+P29, and
several guardrails now cost an edit-per-PR or a doubled runtime without catching anything the
successor mechanism does not. The patterns this change must follow already exist in-repo:

- **Barrel re-export on split.** `engine/src/manifest.js:15` already does
  `export { registeredBacklogNames } from './extends-validation.js';` — the house way to
  extract a validator into its own file while keeping every import site (`pipeline-resolve-main.js`,
  `edits.js`, `manifest-lint-main.js`) unchanged. A split re-exports the moved symbols from the
  original module path; consumers never learn the file moved.
- **`engine/bin` shim + `engine/src/**` mutate scope (conf 0.7).** Bins are ~5-line shims over
  `engine/src/<name>-main.js`; all logic lives in `engine/src/` so Stryker
  (`engine/stryker.conf.json` `mutate: ["engine/src/**/*.js"]`) covers it. **Empirically pinned
  below**: that glob is recursive — a move into `engine/src/observability/…` stays inside the
  mutate scope with no config edit and no coverage loss.
- **Vendor lives in a declared adapter boundary, not the core.** P27 de-specialization
  (`docs/design/despecialize-craft-sources.md`, ADRs 148–155) established "no validation-technique
  or VCS-host name in plugin-defining source", enforced by a **reviewed grep gate**
  (`test/source-hygiene.test.js`, Class A = technique names, Class B = `\bgh\b|\bgithub\b`), with
  path-scoped allowlists marking the one adapter binding where the host CLI legitimately lives
  (`docs/adapters/vcs.md` "CLI called directly" lines). `adapters/pi/` is the reference adapter
  boundary shape (a sibling package; reference, not a production runner). This change extends the
  **same allowlist-by-path enforcement discipline** to the vendor axis (`*-claude.js`).
- **The metrics miner + `--baseline` deltas already exist.** P29 (`docs/adapters/telemetry.md`,
  `docs/design/usage-telemetry-miner.md`, ADRs 182–188) shipped a deterministic
  `engine/src/usage-aggregate.js` core that already emits per-`(run, phase, model)` sums and, when
  a baseline report is supplied via `--baseline`, per-phase token/cost/cacheEfficiency **deltas**.
  The `craft:metrics` skill already documents `--baseline <path>`. Concern 5 is a thin threshold +
  surfacing layer over that existing delta, not a new engine.
- **Advisory-never-gating precedent.** The Memory port (ADR-116) and the miner are advisory: an
  absent/empty/malformed input is a recorded no-op, exit 0, never a blocker. The drift signal
  (concern 5) inherits this posture verbatim — advisory output, not a CI gate.
- **Structure lints are the doc guardrail.** `scripts/backlog-lint.sh` (BACKLOG.md section
  headings), `scripts/design-lint.sh` (design-doc headings). `scripts/ci.sh:54` runs design-lint
  over `templates/design.md docs/design/*.md` — the **live** slug-doc convention. The closed
  dated program docs live one level up at `docs/DESIGN-P*.md` / `docs/PLAN-P*.md` / `docs/PR-*.md`
  and are **not** in that glob, so archiving them is lint-neutral.

Prior constraints that bind this design (non-negotiable): no behaviour change to shipping
features (the existing suites are the safety net, modified only for import paths); no new runtime
dependency; no mutation-coverage weakening; no gitconfig/hook change; the three engine floors
(never-commit-on-red, validation-triage-gates-propose, artifact-handoff) untouched.

### Empirically pinned facts (probed live in this worktree — recorded, not remembered)

| # | Probe | Result | Consequence for this design |
|---|---|---|---|
| A | `minimatch("engine/src/observability/adapters/claude/telemetry.js", "engine/src/**/*.js")` (Stryker's own matcher, `engine/node_modules/minimatch`) | **`true`** (also for one-level `engine/src/observability/memory.js`) | The `mutate` glob is recursive. Moving observability files into `engine/src/observability/…` keeps them mutated with **zero** `stryker.conf.json` edit → the "no weakening" non-goal is met by construction. `engine/test/**/*.test.js` (tap `testFiles`) is likewise recursive. |
| B | `git ls-files 'engine/src/*-claude.js'` | exactly `pricing-claude.js`, `telemetry-claude.js` | A **filename/location** vendor rule targets exactly two files — precise and greppable. |
| C | `grep -riE '\bclaude\b\|\banthropic\b'` over the scanned plugin-source set | **137 occurrences** — `claude-api` skill name, `.claude/…` config paths, the `claude:` policy binding key, model-id literals (`claude-opus-4-8`, …) | A **content-token** ban is intractable (≈130+ legitimate sites to allowlist). The enforceable rule must be filename/location, not content-grep. Empirically forecloses the naive approach. |
| D | importers of `engine/src/memory.js` and `engine/src/metrics-split.js` across `engine/src`, `engine/bin`, `adapters` | **none** — only `engine/test/{memory,metrics-split}.test.js` import them | Both are libraries the orchestrator invokes conceptually (skill prose), not code-imported. Their move is pure import-path fallout in **tests + one bin**, not a wiring change. |
| E | importers of the observability files with runtime edges | `engine/bin/usage-mine.js` → `../src/usage-mine-main.js`; `usage-mine-main.js` → `./{usage-aggregate,telemetry-claude,pricing-claude}.js` + `./contain.js`; `metrics-split.js` → `./telemetry-claude.js`; `memory.js` → `./frontmatter.js`,`./contain.js` | One bin edit; within-boundary imports stay relative; only `../contain.js`/`../frontmatter.js` up-refs change on the move. |
| F | external importers of `manifest.js` symbols | `pipeline-resolve-main.js` ← `{ validatePhases, RESERVED_HARNESS_KEYS, validateManifest }`; `edits.js` ← `{ insertIdError }`; `manifest-lint-main.js` ← `validateManifest` | A split must **barrel re-export** these four names from `manifest.js` (the line-15 pattern) → zero consumer edits. |
| G | `scripts/ci.sh` shape | three pinned counts — `EXPECTED_TESTS=1407` asserted **twice** (engine cwd L12-22, repo-root cwd L24-34), `EXPECTED_PI_TESTS=202`, `EXPECTED_PROC_TESTS=121`; count read via `awk '/^# tests / {print $3}'` | The doubled 1407-run is the cwd-independence proxy. Dropping the repo-root rerun removes ~⅓ of engine test time (the DoD runtime win). |
| H | `test/hermetic-suite.test.js` scope | spawns a **subset** (`manifest-lint-main`, `contracts-lint-main`, `pipeline-resolve-main`) from a hostile cwd/`$HOME` and asserts identical results | The only cwd-sensitive engine tests are the default-resolution ones — exactly the subset hermetic-suite pins. It is a **sharper** cwd guard than the blunt full rerun. |
| I | test/script/skill refs to dated program docs | `skills/run/SKILL.md:387` (`DESIGN-P6-…`), `:404` (`DESIGN-P13-…`); `BACKLOG.md:8-9,163` SoT pointers; `examples/everything-claude-toolkit/workflow.md:35` (`SPIKE.md`) | The archive sweep must rewrite these pointers to `docs/archive/…`. No test enumerates `docs/` beyond the ci.sh `docs/design/*.md` glob (unaffected). 52 dated docs would move. |

## Requirements

No requirements artifact this run — self-supplied from the brief's five concerns, DoD, and hard
lines. When this ships, all are true:

1. **Observability carved out.** `usage-aggregate.js`, `telemetry-claude.js`, `pricing-claude.js`,
   `usage-mine-main.js`, `metrics-split.js`, and `memory.js` live behind an explicit observability
   boundary, out of the invariant core. Pipeline resolution, manifest handling, and contracts
   remain the core. Behaviour is byte-identical; only import paths and the one bin ref change.
2. **`manifest.js` under the norm.** `engine/src/manifest.js` is split along its natural seams so
   no resulting file exceeds ~400 lines, with every external import site unchanged (barrel
   re-export). Validation behaviour is identical (the `manifest`/`manifest-lint` suites pass
   unmodified except import paths).
3. **Count pins retired.** The three `EXPECTED_*` pins in `scripts/ci.sh` are replaced by a
   mechanism that catches the same failure mode (a `test/**/*.test.js` file silently dropped by a
   glob miss, or one that registers zero tests) **without an edit on any test-adding PR**.
4. **Doubled run resolved.** The repo-root engine rerun is either dropped (with `hermetic-suite`
   recorded as the cwd-independence guard) or justified in this doc; `ci.sh` runtime is reduced or
   the retention rationale is written down.
5. **Vendor boundary lint-enforceable.** The "no vendor name in plugin source" rule is enforced by
   `test/source-hygiene.test.js` (not prose): the `*-claude.js` bindings either relocate under a
   declared adapter boundary consistent with `adapters/pi`, or are exempted via a reviewed,
   lint-read allowlist — and a **new** binding dropped into the vendor-neutral core fails the gate.
6. **Closed docs archived.** Dated closed-program docs (`DESIGN-P*`, `PLAN-P*`, `PR-*`, and the
   discharged program set) move to `docs/archive/`; every SoT pointer in `BACKLOG.md` and live
   docs is updated; `backlog-lint` and `design-lint` stay green. A lint/convention makes future
   closed programs archive as part of their closing chore.
7. **Drift signal wired.** A committed baseline of per-phase cost/duration and a `craft:metrics`
   drift mode flags any phase deviating beyond a threshold since the baseline, as an advisory
   proxy alarm for prompt regressions in `skills/`+`agents/`. Advisory output only, never a CI gate.
8. **Gates hold.** Full `node --test` suites + Stryker green; `source-hygiene` enforces the vendor
   rule; docs lints green post-archive; no new runtime dependency; mutation scope uncut; gitconfig
   and hooks untouched.

## Design

Five parts, one per concern. Each carries a pre-chewed context block; the exact seam/threshold
choices are Decision candidates (the designer does not decide them).

### Part 1 — Carve out observability + split `manifest.js`

**1a. Observability boundary (behaviour-preserving relocation).**

Target layout under the recursive mutate scope (PIN A), vendor-neutral core separated from the
`claude` binding (this is where Part 3's boundary is realised):

| From | To | Role |
|---|---|---|
| `engine/src/usage-aggregate.js` | `engine/src/observability/usage-aggregate.js` | vendor-neutral deterministic core |
| `engine/src/usage-mine-main.js` | `engine/src/observability/usage-mine-main.js` | streaming orchestration entrypoint |
| `engine/src/memory.js` | `engine/src/observability/memory.js` | advisory repo-local memory core |
| `engine/src/metrics-split.js` | `engine/src/observability/adapters/claude/metrics-split.js` | `claude`-usage cache-split formatter (binding-coupled — imports `tokensFromClaudeUsage`) |
| `engine/src/telemetry-claude.js` | `engine/src/observability/adapters/claude/telemetry.js` | `claude` JSONL parse binding (drops the `-claude` filename suffix; the **directory** now carries the vendor) |
| `engine/src/pricing-claude.js` | `engine/src/observability/adapters/claude/pricing.js` | `claude` price table binding |

Import fallout (PIN E), exhaustive: `engine/bin/usage-mine.js` `../src/usage-mine-main.js` →
`../src/observability/usage-mine-main.js`; inside `usage-mine-main.js` the two binding imports
retarget to `./adapters/claude/{telemetry,pricing}.js` and `./contain.js` → `../contain.js`;
`memory.js` `./frontmatter.js`,`./contain.js` → `../frontmatter.js`,`../contain.js`;
`metrics-split.js` `./telemetry-claude.js` → `./telemetry.js` (same new dir). Test import paths
update in `engine/test/{usage-aggregate,telemetry-claude,pricing-claude,usage-mine-main,usage-mine.bin,memory,metrics-split}.test.js` (permitted: "existing test suite … must pass unmodified
**except for import paths**"). `engine/stryker.conf.json` and the tap `testFiles` glob need **no**
edit (PIN A). Naming/exports of every symbol are unchanged — this is a move, not a rewrite.

**Live port-spec path refs** (the only non-test/non-bin fallout — these are in the SCANNED source
set, so they must stay accurate): `docs/adapters/memory.md:51,144` → `engine/src/observability/memory.js`;
`docs/adapters/telemetry.md:19,32,44` → the new `engine/src/observability/…` (core) and
`…/adapters/claude/telemetry.js` (binding) paths. The `engine/bin/usage-mine.js` **bin path is
stable** (only its internal `../src/…` import retargets) so `skills/metrics/SKILL.md` and
`scripts/mine-transcripts.sh` need no edit. **Frozen history is NOT rewritten** even where it names
the old paths (`docs/adr/*`, dated `docs/DESIGN-P*`/`PLAN-P*`, discharged `docs/{design,plan}/*`
program docs) — the P27 frozen-history precedent; only the two live port specs update.

**1b. `manifest.js` seam split (barrel-preserving).**

Current 667-line structure (validator module: frozen-Set vocabulary → per-key `validateX(sub,
errors)` functions → pipeline-edit validators → harness/technique validators → phase validators →
top-level `validateManifest`). Natural seams:

| New file | Contents (moved verbatim) | Re-export note |
|---|---|---|
| `engine/src/manifest-vocabulary.js` | the frozen `Set` constants L18-83 (`TOP_KEYS`, `PHASE_NAMES`, `PHASE_FIELDS`, `MODELS_KEYS`, `TECHNIQUE_*`, `BACKLOG_SOURCES`, …) | pure data; imported by the validators |
| `engine/src/manifest-harness.js` | `validateHarness`, `validateTechnique`, `TECHNIQUE_MODES/RUN_STYLES/SCOPES`, `CONVERGENCE_STRINGS`, `RESERVED_HARNESS_KEYS` | `RESERVED_HARNESS_KEYS` **re-exported** from `manifest.js` (PIN F: `pipeline-resolve-main.js`) |
| `engine/src/manifest-pipeline-edits.js` | `insertLabel`, `insertIdError`, `validateInsert`, `validateReorder`, `validatePipelineKeys` | `insertIdError` **re-exported** from `manifest.js` (PIN F: `edits.js`) |
| `engine/src/manifest.js` (core, ≤~400) | remaining per-key validators (models/gates/pr/paths/scripts/backlog/memory/policy/phases) + `validateManifest` + barrel re-exports | keeps `validateManifest`, `validatePhases` exports (PIN F) |

Enforcement of "byte-identical validation": `engine/test/manifest.test.js` (121KB) and
`manifest-lint*.test.js` pass unmodified but for import paths. The exact partition (how many files,
which cluster) is **DC1**.

### Part 2 — Retire the count pins + resolve the doubled run

**2a. Kill the `EXPECTED_*` pins.** The pins catch a glob-miss (a `*.test.js` on disk that the run
glob never loads → tests silently absent → total drops). The successor **eliminates** the failure
mode instead of counting around it: enumerate the on-disk test files independently and run exactly
those, then assert none is silently empty. Concretely (mechanism is **DC4**):

- `scripts/ci.sh` runs each package's suite over a file list produced by an independent enumerator
  (`find <pkg>/test -name '*.test.js'`), not a shell-quoted glob node re-expands — a glob miss
  becomes structurally impossible because the enumerator *is* the file set.
- A self-maintaining meta-test (`test/every-test-file-registers.test.js`, one per package or one at
  root walking all three) enumerates the same set and asserts each file registered ≥1 test
  (catching a renamed/emptied file — the residual mode the enumerate-and-run step cannot see). No
  committed count, no committed file list, **zero edit on any test-adding PR**.

All three `EXPECTED_TESTS/PI_TESTS/PROC_TESTS` constants and their four drift-assertion blocks are
deleted.

**2b. Drop the repo-root engine rerun (DC5).** PIN H shows the only cwd-sensitive engine tests are
the default-resolution ones, which `hermetic-suite.test.js` pins explicitly under a hostile
cwd/`$HOME` — a sharper guard than the blunt second full run. Recommendation: delete `ci.sh`
L24-34, add a one-line comment crediting `hermetic-suite` as the cwd-independence guard, and record
the rationale here (Requirement 4). This is the ~⅓ engine-runtime reduction the DoD asks for.

### Part 3 — Make the vendor boundary lint-enforceable

The tension: `engine/src/{telemetry,pricing}-claude.js` carry a vendor in the filename inside a
scanned plugin-source path, contradicting P27's principle; yet P29 explicitly allowed model-id
literals in "binding" files. PIN C proves a content-token grep for `claude` is intractable (137
legitimate sites). The enforceable rule is therefore **filename/location**, realised by Part 1a
(the bindings move to `engine/src/observability/adapters/claude/…`, the **directory** is the
declared boundary, consistent with `adapters/pi`). New `test/source-hygiene.test.js` rule
(**Class C**, mechanism is **DC2/DC3**):

- Enumerate vendor-suffixed basenames (`-(claude|anthropic|openai|gemini)\.js$`, extensible) via
  `git ls-files` across the scanned source dirs; assert every hit sits under an `**/adapters/<vendor>/**`
  path segment. A future `engine/src/foo-claude.js` (vendor binding in the neutral core) fails;
  the relocated `…/adapters/claude/telemetry.js` passes because the directory *is* the boundary.
- This reuses the existing allowlist-by-path discipline (Class B's `vcs.md` "CLI called directly"
  precedent). The rule is greppable, false-positive-free (PIN C forecloses content grep), and lives
  in the same test file, so it is CI-enforced exactly like Class A/B.

### Part 4 — Archive closed-program docs + future-archive convention

Create `docs/archive/`. Move the dated closed-program docs (`docs/DESIGN-P*.md`, `docs/PLAN-P*.md`,
`docs/PR-*.md`, and the discharged program set — scope is **DC6**) there via `git mv`. Rewrite the
pointers PIN I enumerated: `skills/run/SKILL.md:387,404`, `BACKLOG.md:8-9,163`,
`examples/everything-claude-toolkit/workflow.md:35`. The live slug docs (`docs/design/*.md`,
`docs/plan/*.md`) and the ci.sh design-lint glob are untouched (they never referenced the dated
tree). Future-archive enforcement (**DC7**): a `docs`-structure lint asserting **no** dated
`DESIGN-P*/PLAN-P*/PR-*` doc exists outside `docs/archive/` (keyed on the `-P<number>-` pattern, so
live slug docs — including *this* doc — never trip it); it fails until a newly-closed dated doc is
archived, making archival part of the closing chore commit.

### Part 5 — Prompt-regression drift signal (advisory)

Reuse the P29 delta engine. The miner already computes per-phase deltas vs `--baseline`; this adds
a **threshold + flag** layer and a committed baseline, with **no metrics-schema rewrite** (hard
line):

- **Baseline (DC8):** a committed `report.json` snapshot (default recommendation) that `--baseline`
  already consumes, refreshed on demand as part of a closing chore.
- **Threshold (DC9):** `usage-aggregate.js` (already the mutate target) gains a pure function that,
  given the current report + baseline + a threshold, flags each phase whose token/duration delta
  exceeds it — a `drift: { phase, dimension, delta, threshold }[]` block on the report, purely
  derived, deterministic. Default a single relative threshold; `--threshold` overrides. The
  per-phase **outcome** dimension is a noted gap (the schema carries cost/duration, not a per-phase
  green/no-op field; adding it is a schema change → out of scope, hard line).
- **Surface:** `skills/metrics/SKILL.md` gains a `--drift`/`--baseline` note; `report.md` renders a
  "phases drifted since baseline" section. Advisory: an absent baseline is a recorded no-op (miner
  posture), never a gate.

### Error semantics (cross-part)

- A `manifest.js` split that drops a re-export fails the `manifest-lint` bin/consumers loudly at
  import — caught by the unmodified suites (Part 1b).
- An enumerator that finds zero test files, or a file registering zero tests, fails the meta-test
  loudly (Part 2a) — the count pin's job, now self-maintaining.
- A vendor binding in the neutral core fails `source-hygiene` (Part 3).
- A dated closed doc left outside `docs/archive/` fails the new docs lint (Part 4).
- Drift with no committed baseline → advisory no-op, exit 0 (Part 5).

## Decision candidates

The designer never decides these; the user does, in the ADR phase.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | `manifest.js` split partition | (a) 3-way: `manifest-vocabulary` + `manifest-harness` + core (barrel); (b) 2-way: extract only `manifest-harness`; (c) 4-way: add `manifest-pipeline-edits` | **(a)** (or (c) if core still >400) | The frozen Sets and the harness/technique cluster are the two cohesive, independently-evolving units (P27 grew the harness validators); extracting both lands core under ~400 with the fewest new files. Add pipeline-edits (c) only if (a) leaves core oversized. |
| 2 | Observability boundary + vendor-binding home | (a) `engine/src/observability/` with a nested `adapters/claude/` for the bindings; (b) a sibling package `packages/observability/`; (c) keep flat in `engine/src`, only rename `*-claude.js` | **(a)** | (a) keeps the recursive mutate scope and tap glob unchanged (PIN A — no coverage risk, no ci.sh suite churn), adds no package/`package.json`/runtime-dep surface (hard line), and gives Part 3 its declared adapter directory for free. (b) forces a stryker glob + ci.sh entry + possible new dep; (c) leaves the vendor in the core. |
| 3 | Vendor-rule enforcement shape | (a) filename/location rule (`*-<vendor>.js` only under `**/adapters/<vendor>/**`, via `git ls-files`); (b) content-token ban with a big path allowlist; (c) explicit committed allowlist of "binding" files the lint reads | **(a)** | PIN C empirically forecloses (b) — 137 legitimate `claude`/`anthropic` content sites. (a) is precise (PIN B: 2 files), false-positive-free, and reuses the Class-B allowlist-by-path discipline. (c) is a maintenance burden that drifts. |
| 4 | Count-pin successor | (a) enumerate-and-run (`find`→explicit file list) + a meta-test "every file registers ≥1 test"; (b) diff discovered file-set vs a committed manifest a lint keeps fresh; (c) keep a count but auto-derive it | **(a)** | (a) makes glob-miss structurally impossible and needs **zero** edit on any PR (the brief's bar). (b) still needs an edit per new test *file*; (c) still drifts on every test add. |
| 5 | The doubled engine run | (a) drop the repo-root rerun, credit `hermetic-suite`; (b) drop it but broaden `hermetic-suite` to the full engine suite from root; (c) keep both | **(a)** | PIN H: the cwd-sensitive surface is exactly the default-resolution subset `hermetic-suite` already pins under a hostile ambient — a sharper guard than the blunt rerun. (a) is the DoD runtime win; (b) re-adds the cost it removes. |
| 6 | Archive scope | (a) dated P-numbered docs only (`{DESIGN,PLAN,PR}-P*`, `SPIKE.md`, `SC5-*`, program set), keep live slug docs in place; (b) also relocate discharged slug docs (P27–P29); (c) (a) but keep `PRD-/DESIGN-customizable-engine` at top level as still-cited program SoT | **(a)** with the (c) carve-out for the two `customizable-engine` SoT files | The brief scopes archival to "P0–P16 and later completed P-numbers" — the dated form. Keeping the two program-wide SoT files top-level (referenced live at `BACKLOG.md:8`) avoids churning the header's SoT pointers; everything else dated moves. (b) would disturb the live-doc convention. |
| 7 | Future-archive enforcement | (a) a docs-structure lint: no `-P<n>-` dated doc outside `docs/archive/`; (b) a documented closing-chore checklist item only; (c) a backlog-lint extension cross-checking the Closed table vs archive presence | **(a)** | (a) is mechanically enforceable, cheap, and keyed on the dated pattern so live slug docs never trip. (b) is unenforced prose; (c) couples two documents and is brittle to wording. |
| 8 | Drift baseline source | (a) a committed `report.json` snapshot (`--baseline` already reads it); (b) derive from the already-committed `.claude/craft-metrics.md` history rows; (c) a distilled per-phase baseline file | **(a)** | (a) reuses the existing `--baseline` delta path with the least new code and no schema change (hard line). (b) is tempting (no new artifact) but the metrics file is per-run append and mixing runs needs care; (c) invents a schema the non-goals forbid. |
| 9 | Drift threshold + dimensions | (a) one relative threshold on tokens+duration, outcome deferred as a noted gap; (b) per-dimension configurable thresholds via `--threshold`; (c) include outcome by reading transcript `status` | **(a)** default, with (b)'s `--threshold` override | (a) ships the advisory alarm with no schema change; per-phase outcome is not in the schema and adding it is a rewrite (hard line) → gap-note. (c) risks touching the schema. |
| 10 | `metrics-split.js` placement | (a) under `adapters/claude/` (it imports `tokensFromClaudeUsage` — binding-coupled); (b) in the neutral core importing from the binding; (c) inline its one function into the writer | **(a)** | It is a `claude`-usage formatter; colocating it with the binding keeps the neutral core free of binding-field coupling and matches the Part 3 boundary. |

## Test strategy

- **Part 1 (relocations + split) — safety-net, not new behaviour.** The unmodified engine suites are
  the proof: `engine/test/{usage-aggregate,telemetry-claude,pricing-claude,usage-mine-main,memory,
  metrics-split}.test.js` and `manifest.test.js`/`manifest-lint*.test.js` pass with **only** import
  paths changed. `engine/test/usage-mine.bin.test.js` (spawn-smoke) still exits 0 and writes
  `report.{json,md}` from the relocated bin. Stryker over `engine/src/**` (PIN A) stays green with no
  config edit — the mutation-scope regression guard. `test/mutation-scope.test.js` (workflow doc
  pins) is unaffected.
- **Part 2 — the successor guard itself.** New `test/every-test-file-registers.test.js`: given a
  synthetic empty `*.test.js` fixture it FAILS (RED proving it catches the residual mode); over the
  real tree it passes. Assert the enumerate-and-run file set equals the independent `find` set
  (glob-miss regression). `ci.sh` runs green with the three `EXPECTED_*` blocks removed;
  `hermetic-suite.test.js` unchanged and still green (the retained cwd guard).
- **Part 3 — source-hygiene Class C.** New assertion: with the bindings relocated, zero
  un-allowlisted vendor-suffixed basenames sit outside an adapter dir (GREEN); a fixture path
  `engine/src/foo-claude.js` (or a temp-tree probe) trips it (RED) — the boundary is proven
  enforced, not asserted. Class A/B assertions unchanged.
- **Part 4 — docs lints + archive lint.** `backlog-lint`/`design-lint` green after the sweep; the
  new docs-structure lint FAILS on a dated `DESIGN-P*.md` planted outside `docs/archive/` and passes
  once moved. Grep proves no live pointer dangles (the PIN-I sites now resolve to `docs/archive/…`).
- **Part 5 — drift core (mutate target).** `usage-aggregate.test.js` gains: given a report + a
  baseline + a threshold, the drift function flags exactly the phases whose delta exceeds it and no
  others; deterministic byte-stable (sorted keys, no clock — the P29 property); an absent baseline →
  empty `drift` + advisory no-op. State-mutating bin probes run in a `mktemp` throwaway, never the
  worktree.
- **Phase gate:** `bash scripts/ci.sh` green (all suites + shellcheck + pipeline/contract lints +
  backlog/design lints); `bash scripts/design-lint.sh docs/DESIGN-shrink-core-prune-guardrails.md`
  green on this doc.

## Out of scope

- **Any behaviour change to the shipped features** — memory, the miner, manifest validation, and CI
  semantics are byte-preserved; only structure, guardrails, and the advisory drift add change.
- **Metrics-schema rewrite** (hard line) — Part 5 reuses the existing `report.json` delta; the
  per-phase outcome dimension is a documented gap, not a schema addition.
- **New runtime dependency / new package** (hard line) — DC2 recommends the in-`engine/src` subdir
  precisely to avoid a sibling package's `package.json`/dep/ci surface.
- **`adapters/pi` changes beyond import-path fallout** (hard line) — pi is untouched; PIN D/E show
  it imports none of the moved files.
- **Mutation-scope weakening** (hard line) — PIN A shows the recursive glob covers the new subdirs
  with no `stryker.conf.json` edit; nothing narrows.
- **gitconfig / hook behaviour** (hard line) — untouched.
- **Making the drift signal a CI gate** — advisory only, by the Memory/miner posture; wiring it into
  a gate is a separate, deliberate decision.
- **Re-homing the live slug docs** (`docs/design/*.md`, `docs/plan/*.md`) or the two
  `customizable-engine` SoT files — DC6 keeps the live-doc convention and the header SoT pointers
  stable; only dated closed docs archive.
- **This design doc's own location** — pinned by the invocation to `docs/DESIGN-shrink-core-prune-guardrails.md`; the live authoring convention is `docs/design/<slug>.md`, and the Part-4 archive lint is keyed on the dated `-P<number>-` form, so this slug doc is never an archive target.
