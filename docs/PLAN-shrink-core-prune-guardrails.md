# Plan — shrink core & prune guardrail drag

> Source: design doc `docs/DESIGN-shrink-core-prune-guardrails.md` · ADRs `189–198`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

Six parts, one per design concern, split for atomic commits. Two behaviour-preserving
refactors first (P1 observability move, P2 manifest split) — each proven by the existing
suites passing with no logic change. Then three guardrail parts (P3 vendor lint, P4 CI
guardrails, P5 archive) and one advisory feature (P6 drift). P3/P4/P5 are test-infra /
tooling / docs parts with no `src/` behaviour delta — legitimately standalone. Dependency
order: **P1 precedes P3** (P3 asserts the `adapters/claude/` layout P1 creates) **and P6**
(P6 extends the moved `usage-aggregate.js`); P2/P4/P5 are independent; parts run
sequentially on one worktree and build on each other.

Cross-part guardrail invariants every part must respect:
- **No `stryker.conf.json` edit** — the `mutate: ["engine/src/**/*.js"]` glob recurses
  (design PIN A), so new files under `engine/src/observability/…` and the split
  `manifest-*.js` are mutation-covered for free. Nothing narrows the scope.
- **No new runtime dependency, no new package, no gitconfig/hook change.**
- **Tap `testFiles` glob (`engine/test/**/*.test.js`) is untouched** — all engine tests
  stay flat in `engine/test/`; only their import strings may change.

## Part 1 — Carve observability behind engine/src/observability/ (behaviour-preserving)

### Context
Realises ADR-190 (subdirectory boundary), ADR-198 (metrics-split under the claude adapter).
Pure relocation — **no symbol name or export changes, no logic edits**; the existing engine
suites are the safety net and pass with only import strings retargeted (design Requirement 1).

**Six files move** (create `engine/src/observability/` and `engine/src/observability/adapters/claude/`):

| From | To |
|---|---|
| `engine/src/usage-aggregate.js` | `engine/src/observability/usage-aggregate.js` |
| `engine/src/usage-mine-main.js` | `engine/src/observability/usage-mine-main.js` |
| `engine/src/memory.js` | `engine/src/observability/memory.js` |
| `engine/src/telemetry-claude.js` | `engine/src/observability/adapters/claude/telemetry.js` (drops the `-claude` suffix — the **directory** now carries the vendor) |
| `engine/src/pricing-claude.js` | `engine/src/observability/adapters/claude/pricing.js` |
| `engine/src/metrics-split.js` | `engine/src/observability/adapters/claude/metrics-split.js` (binding-coupled: imports `tokensFromClaudeUsage`) |

Use `git mv` so history follows. `usage-aggregate.js`, `telemetry-claude.js`,
`pricing-claude.js` have **no relative imports** (pure) — they move with zero internal edits.

**Exhaustive internal-import retarget** (only these lines change; verified live):
- `engine/src/observability/usage-mine-main.js`:
  - `./contain.js` → `../contain.js` (up one level)
  - `./telemetry-claude.js` (parseLines) → `./adapters/claude/telemetry.js`
  - `./pricing-claude.js` (loadPriceTable) → `./adapters/claude/pricing.js`
  - `./usage-aggregate.js` (aggregate, serializeReport, renderMarkdown) → **unchanged** (same new dir)
- `engine/src/observability/memory.js`:
  - `./frontmatter.js` → `../frontmatter.js`
  - `./contain.js` → `../contain.js`
- `engine/src/observability/adapters/claude/metrics-split.js`:
  - `./telemetry-claude.js` (tokensFromClaudeUsage, CACHE_READ_FIELD, CACHE_CREATION_FIELD) → `./telemetry.js` (same new dir, renamed sibling)

**Bin shim** (the only runtime consumer of a mover — design PIN D/E): `engine/bin/usage-mine.js`
line 3 `../src/usage-mine-main.js` → `../src/observability/usage-mine-main.js`. The **bin path
itself is stable**, so `skills/metrics/SKILL.md` and `scripts/mine-transcripts.sh` need no edit.
No other `engine/src`, `engine/bin`, `adapters/`, or `scripts/` file imports any mover (`engine/src/index.js`
does NOT export observability symbols; `adapters/pi/` imports none — hard-line untouched).

**Test import edits** (7 files, names unchanged, flat in `engine/test/`):
- `telemetry-claude.test.js:11` → `../src/observability/adapters/claude/telemetry.js`
- `pricing-claude.test.js:9` → `../src/observability/adapters/claude/pricing.js`
- `metrics-split.test.js:4` → `../src/observability/adapters/claude/metrics-split.js`
- `usage-aggregate.test.js:10` → `../src/observability/usage-aggregate.js`
- `usage-mine-main.test.js:22` → `../src/observability/usage-mine-main.js`; `:25` → `../src/observability/usage-aggregate.js`
- `memory.test.js:14` → `../src/observability/memory.js`
- `usage-mine.bin.test.js` — spawns the bin (no `src` import); **no edit**, but it is part of the safety net (must still exit 0 and write `report.{json,md}`).
Keeping the `-claude` suffix on the **test** filenames is fine: `engine/test/` is not in the
source-hygiene scanned set, and P3's Class C keys on `git ls-files` over scanned source dirs only.

**Live port-spec path refs** (in the source-hygiene SCANNED set `docs/adapters/` — must stay accurate):
- `docs/adapters/memory.md:51` and `:144` `engine/src/memory.js` → `engine/src/observability/memory.js`
- `docs/adapters/telemetry.md:19` `engine/src/usage-aggregate.js` → `engine/src/observability/usage-aggregate.js`
- `docs/adapters/telemetry.md:32` `engine/src/telemetry-claude.js` → `engine/src/observability/adapters/claude/telemetry.js`
- `docs/adapters/telemetry.md:44` `engine/src/usage-mine-main.js` → `engine/src/observability/usage-mine-main.js`
Content-level `claude` in these doc paths is allowed (P29 precedent; Class C is filename-only).
**Frozen history is NOT rewritten** even where it names old paths (`docs/adr/*`, dated
`docs/DESIGN-P*`/`PLAN-P*`, discharged `docs/{design,plan}/*`) — P27 frozen-history precedent.

Optional (not gate-blocking): stale in-file comment refs to renamed siblings in
`telemetry.js`/`pricing.js`/`metrics-split.js` may be refreshed for accuracy.

### TDD steps
- RED: run `cd engine && node --test 'test/**/*.test.js'` **before** wiring imports after the
  `git mv` — the six movers' consumers fail with `ERR_MODULE_NOT_FOUND` (old relative paths
  gone). This is the moved-but-unwired state; it proves the tests exercise the relocated code.
- GREEN: apply the internal-import retargets, the bin-shim edit, and the 7 test import edits
  above. Re-run — the engine suite passes with **no assertion change** (only import strings
  moved); `usage-mine.bin.test.js` exits 0 and emits `report.{json,md}` from the relocated bin.
- REFACTOR: update the four `docs/adapters/{memory,telemetry}.md` live path refs; confirm no
  `engine/src/{usage-aggregate,usage-mine-main,memory,metrics-split,telemetry-claude,pricing-claude}.js`
  remain (`git ls-files`), and that `engine/src/observability/**` files are inside the
  unchanged Stryker mutate glob (no `stryker.conf.json` edit).

### Gate
`cd engine && node --test 'test/**/*.test.js'` (phase-boundary gate `bash scripts/ci.sh`; Stryker over `engine/src/**` verified there — must stay green with no config edit).

### Commit
`refactor(engine): carve observability stack behind engine/src/observability boundary`

## Part 2 — Split manifest.js along its vocabulary/harness seams (behaviour-preserving)

### Context
Realises ADR-189: split the 667-line `engine/src/manifest.js` (past the 200–400 norm) into
**three modules** (vocabulary + harness + core), **escalating to a 4th** (`manifest-pipeline-edits.js`)
**only if the core still measures >400 lines**. Pure move; validation behaviour byte-identical.

**The barrel is the whole trick (design PIN F):** every consumer imports from `./manifest.js`,
and the moved public symbols are re-exported from `manifest.js`, so **no consumer import changes** —
neither src nor test. External importers to keep working, verified live:
- `engine/src/pipeline-resolve-main.js:9` ← `{ validatePhases, RESERVED_HARNESS_KEYS, validateManifest }`
- `engine/src/edits.js:7` ← `{ insertIdError }`
- `engine/src/resolve.js:19` ← `{ registeredBacklogNames }` (already re-exported at manifest.js:15)
- `engine/src/manifest-lint-main.js:4` ← `{ validateManifest }`
- `engine/src/index.js:7` ← `export { validateManifest }` (**public facade — must stay exported**)
- `engine/test/manifest.test.js:8` ← `{ validateManifest, registeredBacklogNames }`
- `engine/test/init-emit.test.js:9` ← `{ validateManifest }`
No test imports a moving internal symbol (init-emit.test.js defines its own local `TOP_KEYS`;
manifest.test.js references `TECHNIQUE_*` only in mutant-kill **comments**, not imports). So P2
requires **zero test edits** — the unmodified `manifest`/`manifest-lint`/`init-emit` suites are
the behaviour-preservation proof (Requirement 2).

**Seam map** (current line anchors — move verbatim):
- `engine/src/manifest-vocabulary.js` ← the general frozen Sets: `TOP_KEYS` (L18), `PHASE_NAMES`
  (L28), `PHASE_FIELDS` (L35), `GATE_FIELDS` (L41), `PR_FIELDS` (L44), `SCRIPT_FIELDS` (L47),
  `MODELS_KEYS` (L50), `DEPRECATED_AGENT_NAMES` (L57), `PIPELINE_KEYS` (L62), `BACKLOG_SOURCES`
  (L80), `MEMORY_SOURCES` (L83). Pure data.
- `engine/src/manifest-harness.js` ← `validateTechnique` (L396), `validateHarness` (L441), and
  the harness-only Sets that only these use: `CONVERGENCE_STRINGS` (L65), `TECHNIQUE_MODES` (L68),
  `TECHNIQUE_RUN_STYLES` (L71), `TECHNIQUE_SCOPES` (L74), `RESERVED_HARNESS_KEYS` (L77). (This
  resolves the design table's vocabulary/harness overlap: technique/harness Sets travel with
  the harness validators for cohesion; the general Sets go to vocabulary.)
- `engine/src/manifest.js` (core, target ≤~400) keeps: the remaining per-key validators
  `validateModels` (L90), `validateGates` (L107), `validatePr` (L121), `validatePaths` (L140),
  `validateScripts` (L163), `NON_BUILTIN_TRACKERS` (L174) + `validateBacklog` (L183),
  `validateMemory` (L226), `trackPolicyAction` (L266), `validatePolicy` (L280); the
  pipeline-edit cluster `insertLabel` (L317), `insertIdError` (L333), `validateInsert` (L349),
  `validateReorder` (L375), `validatePipelineKeys` (L495); `validatePhaseBlock` (L517),
  `validatePhases` (L559), `validateSkipRequiredCollision` (L575), `validateManifest` (L609);
  its existing top imports (alias-map, policy, manifest-file-ref, extends-validation, dod) and
  the L15 `export { registeredBacklogNames }`.

**Re-export list to add to core `manifest.js`:**
- `export { RESERVED_HARNESS_KEYS } from './manifest-harness.js';` (consumed by pipeline-resolve-main.js)
- Keep direct exports of `validateManifest`, `validatePhases`, `insertIdError`, `insertLabel`, `registeredBacklogNames`.
- Core imports the Sets it still references from `./manifest-vocabulary.js` (e.g. `TOP_KEYS`,
  `PHASE_FIELDS`, `GATE_FIELDS`, …) and any harness Set it references from `./manifest-harness.js`;
  the extracted modules likewise import from `./manifest-vocabulary.js` what they reference.

**4-way escalation branch (ADR-189):** after the 3-way, `wc -l engine/src/manifest.js`; if >400,
extract `engine/src/manifest-pipeline-edits.js` ← `insertLabel`, `insertIdError`, `validateInsert`,
`validateReorder`, `validatePipelineKeys`, and change the core export to
`export { insertIdError } from './manifest-pipeline-edits.js';` (still zero consumer edits).

**CROSS-PART SURFACE GATE (source-hygiene Class B):** `test/source-hygiene.test.js:86` allowlists
the `github-issues` hit specifically at `engine/src/manifest.js:<n>` (the `NON_BUILTIN_TRACKERS`
constant, L174). **Keep `NON_BUILTIN_TRACKERS` in the core `manifest.js`** (it belongs with
`validateBacklog`). If it is ever moved, the Class B grep will find `github-issues` un-allowlisted
in the new file → source-hygiene FAILS; the allowlist regex would have to move with it.

### TDD steps
- RED: create the empty new module files and cut a couple of Set definitions out of `manifest.js`
  without wiring the `import`/re-export — `cd engine && node --test 'test/manifest.test.js'` fails
  with `ReferenceError`/`ERR_MODULE_NOT_FOUND` (a symbol the validators reference is gone/unexported).
  Proves the split is load-bearing.
- GREEN: move each seam cluster verbatim, wire the cross-module imports and the core re-exports.
  Re-run the manifest, manifest-lint, and init-emit suites — all pass **unmodified** (barrel keeps
  every consumer path valid). `wc -l` every resulting `manifest*.js`.
- REFACTOR: if core >400, apply the 4-way escalation (extract `manifest-pipeline-edits.js`,
  re-export `insertIdError`). Confirm no file exceeds ~400 lines; confirm source-hygiene still
  green (`NON_BUILTIN_TRACKERS`/`github-issues` still in `manifest.js`).

### Gate
`cd engine && node --test 'test/**/*.test.js'` (phase-boundary gate `bash scripts/ci.sh`; Stryker over `engine/src/**` covers the new `manifest-*.js` with no config edit).

### Commit
`refactor(engine): split manifest.js along vocabulary and harness seams`

## Part 3 — Enforce the vendor-binding location via source-hygiene Class C

### Context
Realises ADR-191: the vendor rule is **filename/location**, not content (design PIN C: 137
legitimate `claude`/`anthropic` content sites make a token ban intractable; PIN B: exactly the
relocated bindings are vendor-named). Depends on P1 having moved the bindings under
`engine/src/observability/adapters/claude/`. Test-infra only, no `src/` delta.

Extend `test/source-hygiene.test.js` (add a third `test(...)` block for **Class C**, beside the
existing Class A at L50 and Class B at L70). Existing structure to reuse:
- `SCANNED_PATHS` (L11–22): `pipeline`, `skills`, `agents`, `contracts`, `templates`,
  `engine/src`, `docs/adapters`, `docs/DOD.md`, `docs/GUIDE-customizing.md`, `README.md`.
- Helper style: `execFileSync('grep', …)` / or `git ls-files`; allowlist-by-path filters (the
  Class B `vcs.md` "CLI called directly" precedent at L79 is the model for path-scoped exemption).

**Class C rule:** enumerate vendor-suffixed/vendor-named source basenames — pattern
`-(claude|anthropic|openai|gemini)\.(js|ts)$` (extensible list) — via `git ls-files` across the
scanned source dirs, and assert **every hit sits under an `**/adapters/<vendor>/**` path segment**.
After P1 there are zero `*-claude.js` files in the neutral core (they were renamed to
`adapters/claude/{telemetry,pricing}.js`), so the real tree passes. A future
`engine/src/foo-claude.js` (vendor binding in the neutral core) must FAIL. Note the relocated
`metrics-split.js` carries **no** vendor suffix — it is exempt by name but correctly homed
(ADR-198); the rule targets vendor-*named* files, so it neither requires nor forbids `metrics-split.js`.

The message must name offenders (mirror the Class A/B `assert.strictEqual(offenders.length, 0, …)`
shape). Class A and Class B assertions and their allowlists stay unchanged.

### TDD steps
- RED: add the Class C test; drive it with a synthetic offender — either a `git ls-files`-independent
  probe over a temp path or a fixture list containing `engine/src/foo-claude.js` — and assert the
  rule flags it (the boundary is proven enforced, not merely asserted). Before the assertion is
  wired to the real enumerator it fails / the offender fixture trips it.
- GREEN: point the rule at the real `git ls-files` enumeration; with P1's relocation in place the
  scanned tree yields zero un-allowlisted vendor-named files outside `adapters/<vendor>/` → passes.
- REFACTOR: fold the vendor list into a named constant (`VENDOR_SUFFIXES`) beside `CLASS_A_PATTERN`/
  `CLASS_B_PATTERN`; confirm Class A/B still green.

### Gate
`node --test 'test/**/*.test.js'` (repo root; phase-boundary gate `bash scripts/ci.sh` runs source-hygiene in the process suite).

### Commit
`test: enforce vendor-binding location via source-hygiene class C`

## Part 4 — Replace count pins with enumerate-and-run; drop the doubled engine run

### Context
Realises ADR-192 (retire `EXPECTED_*` pins) and ADR-193 (drop the repo-root engine rerun). Tooling
+ test-infra, no `src/` delta. `scripts/ci.sh` current shape (design PIN G, verified):
- L10 `EXPECTED_TESTS=1407`; L12–22 engine suite `cd engine && node --test 'test/**/*.test.js'` +
  nonzero-exit check + count-drift assert vs `EXPECTED_TESTS` (count read via `awk '/^# tests / {print $3}'`).
- **L24–34 repo-root engine RERUN** `node --test 'engine/test/**/*.test.js'` + a second count assert — **the doubled run to delete (ADR-193)**.
- L36–42 `EXPECTED_PI_TESTS=202`; pi suite `cd adapters/pi && node --test 'test/**/*.test.js'` + count assert.
- L44–50 `EXPECTED_PROC_TESTS=121`; process suite `node --test 'test/**/*.test.js'` (repo-root `test/`) + count assert.
- L52+ shellcheck, pipeline-lint, pipeline-resolve, contracts-lint, backlog-lint (loop), design-lint (loop over `templates/design.md docs/design/*.md`).

**2a — enumerate-and-run (ADR-192):** for each of the three suites replace the shell-quoted glob
(which `node --test` re-expands) with an explicit file list produced by an **independent enumerator**
`find <pkg>/test -name '*.test.js'` (sorted), passed as argv to `node --test` — a glob miss becomes
structurally impossible because the enumerator *is* the file set; a missing file is a hard error.
Delete all three `EXPECTED_*` constants and their four count-drift assert blocks (keep the
nonzero-exit failure checks). If `find` returns zero files for a suite → hard error.

**2b — drop the doubled run (ADR-193):** remove L24–34 entirely; add a one-line comment crediting
`test/hermetic-suite.test.js` as the cwd/`$HOME`-independence guard (design PIN H: the only
cwd-sensitive engine tests are the default-resolution ones — `manifest-lint-main`,
`contracts-lint-main`, `pipeline-resolve-main` — which hermetic-suite pins under a hostile ambient).
`test/hermetic-suite.test.js` is unchanged and must stay green.

**Registration meta-test (ADR-192):** add `test/every-test-file-registers.test.js` (repo-root
`test/`, runs in the process suite; models: `test/backlog-lint.test.js` for the `execFileSync`/fixture
shape). It walks all three suite dirs (`engine/test`, `adapters/pi/test`, `test`) and:
- asserts each dir enumerates a **non-empty** `*.test.js` set (an enumerator that finds zero → loud fail);
- asserts every real file **registers ≥1 test** via a cheap deterministic detector (read source,
  match a `test(`/`it(` registration) — **not** by re-running the suites (must not double CI runtime);
- proves the detector by applying it to a **synthetic empty `*.test.js`** created in `os.tmpdir()`
  (asserted flagged as zero-registration, then removed) — the residual "emptied/renamed file" mode
  the enumerate-and-run step cannot see. No committed count, no committed file list, zero per-PR edit.

### TDD steps
- RED: add `test/every-test-file-registers.test.js`; its synthetic-empty-fixture assertion fails
  until the detector exists, and the real-tree assertion documents the invariant. Run
  `node --test test/every-test-file-registers.test.js` → RED.
- GREEN: implement the enumerator + registration detector; the synthetic empty file is flagged, the
  real tree passes. Rewrite `scripts/ci.sh`: delete the three `EXPECTED_*` blocks, delete the L24–34
  doubled run (add the hermetic-suite credit comment), convert all three suites to `find`-enumerated
  argv lists. Run `bash scripts/ci.sh` → green, materially faster (≈⅓ engine runtime removed).
- REFACTOR: factor a shared `run_suite <dir>` helper in `ci.sh` if it reduces duplication; keep
  shellcheck clean (it runs in ci.sh).

### Gate
`node --test 'test/**/*.test.js'` (repo root) AND `bash scripts/ci.sh` (this part rewrites ci.sh — the rewritten script must be green; also the phase-boundary gate).

### Commit
`ci: replace count pins with enumerate-and-run and drop the doubled engine run`

## Part 5 — Archive dated program docs and enforce it with a docs-structure lint

### Context
Realises ADR-194 (archive dated P-numbered docs only; carve out the customizable-engine SoT) and
ADR-195 (docs-structure lint keyed on the `-P<number>-` pattern). Docs + tooling, no `src/` delta.

**Move to `docs/archive/`** (create it; use `git mv`) — the **dated** program artifacts only:
- `docs/DESIGN-P*.md`, `docs/PLAN-P*.md` (every `docs/*-P<number>-*.md`)
- `docs/SPIKE.md`, `docs/SC5-*.md` (the named non-dated program set ADR-194 lists)

**Keep at `docs/` top level (do NOT archive):**
- `docs/PRD-customizable-engine.md`, `docs/DESIGN-customizable-engine.md` (live SoT, cited at BACKLOG.md:8 — carve-out).
- All slug-named docs: `docs/DESIGN-history.md`, `docs/DESIGN-nested-insert-fail-loud.md`,
  **`docs/PR-nested-insert-fail-loud.md`** (a slug PR whose program keeps live slug docs at
  `docs/plan/nested-insert-fail-loud.md` — a broad `PR-*` match would wrongly grab it; only `-P<n>-`-dated docs move),
  `docs/DOD.md`, `docs/GUIDE-customizing.md`, `docs/model-class-matrix.md`, and this design/plan pair.
- `docs/design/*.md`, `docs/plan/*.md` (live slug convention — the design-lint glob is unaffected).

**Rewrite the SoT/reference pointers (design PIN I, verified):**
- `BACKLOG.md:8` — `*build scripts:* docs/PLAN-*.md · *spikes:* docs/SPIKE.md` → `docs/archive/PLAN-*.md` / `docs/archive/SPIKE.md`.
- `BACKLOG.md:163` — `docs/{DESIGN,PLAN}-P*.md` → `docs/archive/{DESIGN,PLAN}-P*.md`.
- `skills/run/SKILL.md:387` — `docs/DESIGN-P6-execution-topology.md` → `docs/archive/DESIGN-P6-execution-topology.md`.
- `skills/run/SKILL.md:404` — `docs/DESIGN-P13-nfr-hardening.md` → `docs/archive/DESIGN-P13-nfr-hardening.md`.
- `examples/everything-claude-toolkit/workflow.md:35` — bare `SPIKE.md` reference → `docs/archive/SPIKE.md`.

**New `scripts/docs-structure-lint.sh`** (model: `scripts/backlog-lint.sh` — `#!/bin/bash`,
`set -euo pipefail`, exit 2 + stderr message on violation): fail if any `docs/**/*.md` whose
basename matches the dated `-P[0-9]` pattern (or `SC5-*`, `SPIKE.md`) exists **outside**
`docs/archive/`. Keyed on the dated pattern per ADR-195, so live slug docs (including this doc,
`DESIGN-shrink-core-prune-guardrails.md`) never trip it — every currently-dated doc is a discharged
closed program, and new programs use slug names, so a dated doc at top level is by definition a
mis-filed closed doc. The lint checks **filenames**, not content, so prose/ADR references to
`DESIGN-P*` names are unaffected.

**Wire it into `ci.sh`** beside `backlog-lint`/`design-lint` (the L52+ structure-lint block; this
lands after P4's ci.sh rewrite — build on the updated file). **New `test/docs-structure-lint.test.js`**
(model: `test/backlog-lint.test.js`): a `docs/archive/`-clean fixture tree exits 0; a fixture with a
`DESIGN-P9-foo.md` planted outside `archive/` exits 2 and names it in stderr; the **live `docs/`
tree** passes after the sweep. `backlog-lint`/`design-lint` stay green across the move.

### TDD steps
- RED: add `test/docs-structure-lint.test.js` with the good/bad fixtures against the not-yet-written
  `scripts/docs-structure-lint.sh` → fails (`no such file`). The "live tree" assertion also fails
  while dated docs still sit at `docs/` top level.
- GREEN: write `scripts/docs-structure-lint.sh`; `git mv` the dated docs into `docs/archive/`; rewrite
  the five pointer sites; wire the lint into `ci.sh`. The fixtures pass, the live-tree assertion
  passes, and `bash scripts/backlog-lint.sh BACKLOG.md` / `design-lint` over `docs/design/*.md` stay green.
- REFACTOR: `grep -rn 'docs/\(DESIGN\|PLAN\)-P\|docs/SPIKE\.md\|docs/SC5-'` across `BACKLOG.md skills
  agents examples README.md` to prove no live pointer dangles (all now resolve to `docs/archive/…`);
  confirm `git ls-files 'docs/*-P[0-9]*'` returns empty (all dated docs relocated).

### Gate
`node --test 'test/**/*.test.js'` (repo root) AND `bash scripts/ci.sh` (adds the docs-structure lint invocation — also the phase-boundary gate).

### Commit
`chore(docs): archive dated program docs and enforce with a docs-structure lint`

## Part 6 — Advisory prompt-regression drift signal on the usage miner

### Context
Realises ADR-196 (committed report.json baseline) and ADR-197 (single relative threshold +
`--threshold` override). Builds on P1's relocated observability core. Advisory only — an absent
baseline is a recorded no-op, exit 0, never a gate (Memory/miner posture, Requirement 7). **No
metrics-schema rewrite** (hard line): `report.drift` is *derived* output alongside the existing
derived `baselineDeltas`, not a change to `UsageEvent` or the `.claude/craft-metrics.md` format.

**Reuse the existing delta path** in `engine/src/observability/usage-aggregate.js` (post-P1 path):
- `aggregate(events, priceTable, baselineReport)` (L267) already sets
  `report.baselineDeltas = computeBaselineDeltas(report, baselineReport)` when a baseline is supplied.
- Report groups carry (L90–107) `phase`, `role`, `model`, `tokens{input,cacheRead,cacheCreation,output}`,
  `durationMs`, `cost{priced|relative}`, `cacheEfficiency`. `computeBaselineDeltas` (≈L237) emits
  per matched `(run,phase,role,model)` group `{ tokensDelta, pricedCostDelta, cacheEfficiencyDelta }`.
- `serializeReport` uses `sortDeep` (byte-stable, sorted keys); `renderMarkdown` (L295) writes the
  `# Usage Report` markdown consumed as `report.md`.

**Add a pure `computeDrift(currentReport, baselineReport, threshold)`** to `usage-aggregate.js`
(the mutate target — mutation-covered): for each `(run,phase,role,model)` group present in both,
compute the **relative** delta per dimension — tokens (total) and `durationMs` (cost optional via
`pricedCostDelta/basePriced`) — and flag dimensions where `|relDelta| > threshold`, pushing a sorted
`{ phase, dimension, delta, threshold }` entry. Edge: base dimension 0 with current > 0 ⇒ drift;
both 0 ⇒ no drift (no division by zero). Wire it as `report.drift` — extend `aggregate` to an
optional 4th arg `threshold = DEFAULT_DRIFT_THRESHOLD` (backward-compatible: existing 3-arg callers
and all current `usage-aggregate.test.js` cases keep passing, `drift` empty when no baseline). Add a
named `DEFAULT_DRIFT_THRESHOLD` relative constant (e.g. `0.25`). `computeDrift` stays internal to the
observability boundary (consumed by `usage-mine-main.js` + tests); `engine/src/index.js` does not
re-export usage-aggregate symbols, so **no barrel/facade edit** is required.

**Surface:**
- `engine/src/observability/usage-mine-main.js`: parse `--threshold <n>` argv (default → the
  constant), thread it into the `aggregate(...)` call; `--baseline <path>` already exists.
- `renderMarkdown`: add a `## Phases drifted since baseline` section rendered only when
  `report.drift?.length` (advisory; omitted otherwise).
- `skills/metrics/SKILL.md`: add a `--baseline <path>` / `--threshold <n>` / drift note pointing at
  the committed baseline.
- **Committed baseline (ADR-196):** generate a `report.json` snapshot via the miner over current
  transcripts and commit it at `docs/metrics-baseline.report.json` (diff-reviewable). Path
  rationale: **`/report.json` and `/report.md` are gitignored** (so the miner's default output can't
  be the committed baseline); `docs/` top level is **outside** the source-hygiene scanned set (so
  `claude-*` model-ids and run slugs in the JSON can't trip Class A/B/C); and it is `.json`, so P5's
  `-P[0-9]`-`.md` docs-structure lint ignores it. Reference it as the default `--baseline` in the skill note.

**Tests** attach in `engine/test/usage-aggregate.test.js` beside the baseline cases (L226, L587,
L843) and `engine/test/usage-mine-main.test.js` (argv):
- given current+baseline+threshold, `report.drift` flags exactly the phases whose relative
  token/duration delta exceeds it and **no others**;
- absent baseline ⇒ `report.drift` empty + advisory no-op (exit 0);
- deterministic/byte-stable (sorted `drift`, `sortDeep`, no clock — the P29 property);
- `renderMarkdown` includes the drift section iff `drift` non-empty;
- `usage-mine-main` honours `--threshold` (override) and default; the `usage-mine.bin.test.js`
  spawn-smoke still exits 0. State-mutating bin probes run in a `mktemp` throwaway, never the worktree.

### TDD steps
- RED: add the `computeDrift`/`report.drift` tests to `usage-aggregate.test.js` — they fail (`report.drift`
  is `undefined`; `computeDrift` unexported). `cd engine && node --test 'test/usage-aggregate.test.js'` → RED.
- GREEN: implement `DEFAULT_DRIFT_THRESHOLD` + `computeDrift`, wire `report.drift` into `aggregate`
  (4th arg), extend `renderMarkdown`, add `--threshold` to `usage-mine-main.js`; generate + commit
  `docs/metrics-baseline.report.json`; add the `skills/metrics/SKILL.md` note. Suites pass.
- REFACTOR: confirm `serializeReport` output is byte-stable with `drift` present (sorted);
  confirm existing 3-arg `aggregate` callers and all prior baseline tests unaffected.

### Gate
`cd engine && node --test 'test/**/*.test.js'` (phase-boundary gate `bash scripts/ci.sh`; Stryker over `engine/src/**` covers `computeDrift` in the relocated `usage-aggregate.js` with no config edit).

### Commit
`feat(metrics): advisory prompt-regression drift signal on the usage miner`
