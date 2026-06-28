# Design — activate-dod-and-live-doc-lints

> Brief: two follow-ups from the merged *clear-backlog-candidates-gated* run, landing as ONE
> run but TWO independent atomic conventional commits — (T1) wire the dormant DC-5 v2 structured
> DoD so its `auto` criteria are mechanically asserted against actual per-phase gate evidence,
> and (T2) point `backlog-lint`/`design-lint` at the live `BACKLOG.md` and design docs instead of
> only the templates.
> Status: draft → self-reviewed ×3 → accepted

## Context

Craft is a hexagonal Claude-Code feature-delivery engine: `pipeline/default.yml` is the SoT
descriptor table, `engine/src/*` is the pure core, `engine/bin/*` are thin I/O shims over
`engine/src/*-main.js` glue, `skills/*` are the phase procedures the session follows, and
`docs/adapters/*` are the port bindings. The PRD program (P0–P16) is complete; the
*clear-backlog-candidates-gated* run shipped P-class follow-ups as workstreams A–K. This change
discharges two residuals that run left:

- **T1 — DC-5 v2 is built but DORMANT.** `engine/src/dod.js` (ADR-174) already exports
  `parseDod(content) → { criteria } | null`, `validateDodCriteria(criteria) → string[]`, and
  `assertDodCriteria(criteria, evidence) → ('met'|'unmet'|'judgment')[]`, where
  `evidence = { gateGreen(phaseId) → boolean|undefined, fileExists(path) → boolean }`. The
  module is pure (header: *"Pure — no I/O. All file reads and gate evidence are injected."*) and
  fully unit-tested (29 tests in `engine/test/dod.test.js`). `assertAutoCriterion` returns `'met'`
  for a `gate` criterion **iff** `evidence.gateGreen(assert.gate) === true`, else `'unmet'`; for a
  `file-exists` criterion **iff** `evidence.fileExists(path)`, else `'unmet'`; a `judgment` kind →
  `'judgment'`. It is injection-safe — a stray `command`/`run` field is ignored; it never executes
  a DoD-supplied string. **But nothing invokes `assertDodCriteria` at runtime.** `manifest-lint`
  validates only the SCHEMA (`validateDodCriteria` via `validatePaths`). `skills/validation/SKILL.md`
  Preamble step 2 describes the intent in PROSE (*"assert mechanically using only the
  engine-recorded gate evidence"*) but performs no mechanical call — today it effectively records a
  NO-OP because `docs/DOD.md` is free-text (no frontmatter → `parseDod` returns `null`).
  `skills/run/SKILL.md` records phase-boundary gate outcomes only as prose (steps 6 *Gate* / 7
  *Record outcome*); there is no fixed, greppable per-phase gate token to read back.

- **T2 — the structure linters guard only the templates.** `scripts/backlog-lint.sh` and
  `scripts/design-lint.sh` are awk required-heading checkers (prefix match `index($0,R[i])==1`,
  firing only on `/^## /`, exit 2 + diagnostic on a missing section). `scripts/ci.sh:52` is one
  long `&&` chain ending `… && bash scripts/backlog-lint.sh templates/backlog.md && bash
  scripts/design-lint.sh templates/design.md`. The live `BACKLOG.md` and the four
  `docs/design/*.md` are never linted.

Prior art / house style that constrains this change:

- **ADR-174 (DC-5 v2, the security contract).** `assert.gate` names a phase whose result the
  **engine recorded** — never a command to execute. A red gate cannot be flipped green: `gateGreen`
  returns `true` only for recorded-green phases, so red/unknown → not-`true` → `'unmet'`. DoD content
  is part of the reviewed diff (claims-to-verify, never ground truth). A `file-exists` check must be
  containment-bound so a criterion cannot probe outside the repo root.
- **`engine/src/contain.js`** exports `containByRealpath(root, target) → string|null` (fail-closed:
  `null` on lexical escape, symlink leaf incl. dangling, realpath-ancestor escape, or any non-ENOENT
  fs error) and `realExistingPrefix(absPath)`. This is the containment primitive the T1 `file-exists`
  evidence must use.
- **Bin convention.** Every bin is a 6-line shim (`engine/bin/<name>.js`) that imports `main` from
  `engine/src/<name>-main.js` and calls `process.exit(main(process.argv.slice(2), { stdout, stderr }))`.
  Pure decision logic lives in `engine/src/<name>.js` (unit-tested, *mutation-covered*); the
  `-main.js` glue does argv/I/O and is unit-tested in-process by `engine/test/<name>-main.test.js`;
  a `engine/test/<name>.bin.test.js` spawns the real bin. All three live under `engine/test/` and are
  counted by `EXPECTED_TESTS` (e.g. `init-land.test.js` + `init-land.bin.test.js`,
  `manifest-lint-main.test.js` + `manifest-lint.bin.test.js`).
- **The gate (`scripts/ci.sh`).** `node --test` runs over `engine/test/**` **twice** (cd'd into
  `engine/`, and from repo root); both must equal the single `EXPECTED_TESTS=1234` line. A separate
  repo-root run over `test/**` must equal `EXPECTED_PROC_TESTS=117`. `adapters/pi` is its own
  `EXPECTED_PI_TESTS=202`. New `engine/test/` files MUST be counted by both `EXPECTED_TESTS` passes;
  repo-root `test/*.test.js` (CommonJS, `require('node:test')`, `__dirname`, `execFileSync`/`grep`)
  are counted by `EXPECTED_PROC_TESTS`. The bats→`node:test` migration already shipped — `test/` now
  holds `.test.js` files (e.g. `test/no-op-token.test.js`, `test/source-hygiene.test.js`,
  `test/backlog-lint.test.js`, `test/design-lint.test.js`).
- **Source-hygiene (`test/source-hygiene.test.js`).** Class-A (technique names:
  `stryker|…|mutation|mutant|dependency-cruiser|…`) and Class-B (`\bgh\b|\bgithub\b`) tokens are
  banned in the SCANNED set: `pipeline/ skills/ agents/ contracts/ templates/ engine/src/
  docs/adapters/ docs/DOD.md docs/GUIDE-customizing.md README.md`. `scripts/`, `test/`, `.claude/`,
  `examples/`, and dated docs are NOT scanned.
- **Conventions to honour:** no provenance refs (phase/ADR/backlog numbers) in source or test code
  — provenance lives in this doc and the PR body only; prefer a FIXED greppable token
  `TOKEN(<param>):` over per-context idioms (grep + LLM recall); fail LOUD (no swallowed errors);
  immutable, small functions, early returns.

## Requirements

When this ships:

1. **T1 — mechanical assertion.** A declared structured DoD (`paths.dod`/`docs/DOD.md` carrying a
   `criteria:` frontmatter) has its `kind: auto` criteria mechanically asserted at validation time
   against the run's **actual per-phase gate evidence**; `kind: judgment` criteria stay
   human-asserted; the no-DoD path still records the non-blocking `NO-OP(verify):` line.
2. **T1 — evidence provenance.** `skills/run/SKILL.md` records every phase-boundary gate as a fixed
   greppable token `GATE(<phase-id>): green|red`; the validation DoD sub-concern collects the green
   phase-ids from the run record and feeds them as the gate evidence to a thin engine bin
   (`engine/bin/dod-assert.js`) that calls `assertDodCriteria` and prints per-criterion
   `{ id, kind, outcome }` machine-readably.
3. **T1 — security (ADR-174 holds).** `assert.gate` resolves only against recorded-green phase-ids
   (a red/absent/unknown gate → `'unmet'`, never flippable to met); a stray `command`/`run` field is
   ignored; `file-exists` is containment-bound via `containByRealpath` (fail-closed) so it cannot
   probe outside the repo root; an unmet `auto` criterion escalates as a blocker.
4. **T2 — live-doc structure enforced.** `backlog-lint` enforces the live `BACKLOG.md` structure
   (including its H3 sections) AND the migrated `templates/backlog.md` (both pass the one generalized
   required-set); `design-lint` enforces every `docs/design/*.md` plus `templates/design.md`;
   `scripts/ci.sh` is retargeted accordingly; the one divergent design doc
   (`despecialize-craft-sources.md`) is repaired so the glob is green.
5. **Cross-cutting.** T1 and T2 land as two independent atomic conventional commits; full
   `bash scripts/ci.sh` is green at each commit; `EXPECTED_TESTS`/`EXPECTED_PROC_TESTS` are bumped
   per commit by that commit's exact net-new count; no technique/VCS-host-CLI vocabulary enters a
   scanned source; no provenance refs enter source/test code.

## Design

Two cleanly separable parts. T1 touches `engine/src/`, `engine/bin/`, `engine/test/`,
`skills/run/SKILL.md`, `skills/validation/SKILL.md`, and `test/` (one token guard). T2 touches
`scripts/`, `scripts/ci.sh`, `test/` (+ fixtures), and one design doc. They share no file, so commit
order is free; each re-baselines its counters to the running total.

### Part T1 — activate the structured-DoD auto-assertion

**Context block.**
- `engine/src/dod.js` — pure; current exports `parseDod`, `validateDodCriteria`, `assertDodCriteria`,
  plus private `assertAutoCriterion`. Evidence shape:
  `{ gateGreen: (phaseId) => boolean|undefined, fileExists: (path) => boolean }`.
- `engine/src/contain.js` — `containByRealpath(root, target) → string|null`, `realExistingPrefix`.
- `engine/bin/init-land.js` + `engine/src/init-land-main.js` — the bin I/O conventions to mirror
  (`main(argv, io) → exitCode`, `REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)),'..','..')`,
  deps injected, errors surfaced to `io.stderr`, never swallowed). `dod-assert` keeps its glue IN the bin
  (`engine/bin/dod-assert.js`) rather than a separate `-main.js`: all its decision logic is already
  pure-core in `dod.js`/`contain.js`, and the bin is OUTSIDE Stryker's `engine/src/**/*.js` mutate scope
  (so the glue is process-tested black-box, with no mutants to strand).
- `skills/validation/SKILL.md` Preamble step 2, *"Structured sidecar"* branch (the prose that today
  performs no call).
- `skills/run/SKILL.md` Phase-walk steps 6 (*Gate*) / 7 (*Record outcome*) — where the fixed token is
  emitted.
- `scripts/ci.sh:10` — single `EXPECTED_TESTS=1234`; `scripts/ci.sh:44` — `EXPECTED_PROC_TESTS=117`.

**Pure/glue split (sub-recommendation).** Keep `engine/src/dod.js` PURE (honour its header). Add one
pure builder there:

```
// engine/src/dod.js
export function buildGateGreen(greenPhaseIds) {
  const green = new Set(greenPhaseIds);
  return (phaseId) => green.has(phaseId);   // boolean → red/absent ⇒ false ⇒ '=== true' fails ⇒ 'unmet'
}
```

`buildGateGreen` is pure (a Set-membership closure), so it is unit-tested in `engine/test/dod.test.js`
and **mutation-covered** by the dogfood technique (which runs the engine suite over `engine/src/**/*.js`).
The `fileExists` builder needs `node:fs` + `containByRealpath`, which `dod.js`'s purity forbids — so it
lives in the BIN glue (`engine/bin/dod-assert.js`, OUTSIDE Stryker's `engine/src/**/*.js` mutate scope),
as a small local function injected into the evidence object:

```
// engine/bin/dod-assert.js (sketch)
function buildFileExists(repoRoot, deps) {
  return (relOrAbs) => {
    const contained = containByRealpath(repoRoot, resolve(repoRoot, relOrAbs));
    return contained !== null && deps.exists(contained);   // null ⇒ escaped ⇒ false ⇒ 'unmet'
  };
}
```

This is the answer to the brief's pure-vs-glue question: **split** — pure gate-evidence builder in
`dod.js` (`engine/src/**`, mutation-covered); fs/containment `file-exists` builder + argv/IO glue in the
BIN `engine/bin/dod-assert.js`, which is OUTSIDE Stryker's mutate scope (`engine/src/**/*.js` only) and
therefore carries no mutants to strand — so the bin glue is tested BLACK-BOX via a process test in
repo-root `test/` (the brief-literal placement), not colocated in the engine suite.

**New bin.** `engine/bin/dod-assert.js` — a thin glue bin (NOT split into a separate
`engine/src/dod-assert-main.js`; all decision logic is imported pure-core from `engine/src/dod.js` plus
`containByRealpath` from `engine/src/contain.js`). `main(argv, io)`:
- `argv[0]` = DoD file path (trusted operator input — `paths.dod` is already a lint-validated
  contained file-ref); `argv[1]` = repo root; `argv[2]` = comma-separated green phase-ids (mirroring
  `--skip <id,…>`); an empty/absent list means "no green gates recorded".
- read the DoD file; `parseDod(content)`:
  - `null` (free-text / no `criteria`) → print the envelope `{"outcomes": null}` and exit 0 (the
    no-DoD / free-text path stays non-blocking; the SKILL records `NO-OP(verify):`).
  - throws (malformed frontmatter) → fail LOUD: surface the message to `io.stderr`, exit non-zero.
- `validateDodCriteria(criteria)`; on errors → surface to `io.stderr`, exit non-zero (schema is the
  reviewed diff's responsibility; a malformed structured DoD is an author error, not a silent pass).
- build `evidence = { gateGreen: buildGateGreen(greenIds), fileExists: buildFileExists(repoRoot, { exists: existsSync }) }`.
- `assertDodCriteria(criteria, evidence)` → outcomes; print the SAME envelope shape
  `{"outcomes": [{ id, kind, outcome }, …]}` to `io.stdout`; **exit 0** (assessment completed;
  outcomes are DATA). The single `{"outcomes": …}` envelope (array when structured, `null` when
  free-text) gives the SKILL one stable parse shape for both branches.

**Bin exit semantics (Decision candidate #3).** The bin is a *reporter* (CQS query): exit 0 with the
outcomes JSON whenever it could assess (even when some `auto` criteria are `'unmet'`); non-zero only
on an OPERATIONAL error (bad argv, unreadable DoD, malformed frontmatter, invalid schema). The SESSION
reads the outcomes and escalates the blocker — this keeps "couldn't assess" distinct from "assessed
unmet" and keeps the engine policy-free.

**Evidence wiring (Decision candidate #1).** Map `assert.gate: <phase-id>` onto the run record's
per-phase gate results:
- `skills/run/SKILL.md` steps 6/7 emit, at each phase-boundary gate, the fixed token
  `GATE(<phase-id>): green` or `GATE(<phase-id>): red` into the in-session run record — a fixed
  greppable `TOKEN(<param>):`, distinct from `WAIVER:`, `NO-OP(<phase>):`, and
  `auto-skip: <phase> …`. An auto-skipped or waived executing-harness records no `GATE(...)` line (its
  phase did not produce a recorded gate result), so its phase-id is simply absent from the green set
  → any criterion naming it → `'unmet'` (fail-closed, consistent with ADR-174).
- `skills/validation/SKILL.md` Preamble step 2 *Structured sidecar* branch changes from prose to a
  mechanical call: collect the green phase-ids by reading the run record's `GATE(<phase-id>): green`
  lines, then invoke
  `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/dod-assert.js" <dod-path> <repo-root> <green-ids-csv>`,
  parse the per-criterion JSON, record each `{ id, kind, outcome }`, and escalate any `auto`
  `'unmet'` as a blocker `{ verify, "<criterion> unmet", ≤3 options }` (existing semantics; headless
  → record + halt, never a silent pass). `judgment` criteria stay human-asserted on the DoD's terms.
  The free-text / no-criteria branch (`{"outcomes": null}`) keeps the existing `NO-OP(verify): no
  DoD declared` line.

**Gate-collection ordering edge.** The green set is exactly the `GATE(<phase-id>): green` lines
present in the run record *at the moment of assertion* — i.e. the gates of phases that have already
gated green upstream of this assertion. A criterion naming a phase whose gate is not (yet) recorded
green — a downstream phase, a skipped/waived/auto-skipped harness, or `validation`'s own
not-yet-recorded gate — resolves `'unmet'` (fail-closed). This is the safe direction and matches
ADR-174: a criterion is met only by a gate the engine has actually recorded green.

Rejected alternative (1b): a thin "did `ci.sh` pass" boolean loses per-phase granularity — it cannot
tell which gate a criterion names, and a DoD with `assert.gate: architecture` could be satisfied by an
unrelated green gate. The per-phase token is required for `assert.gate` to mean what ADR-174 says.

**Security clearance (ADR-174 invariants, mechanically held).**
- A red/absent/unknown gate yields `green.has(id) === false`, so `assertAutoCriterion`'s `=== true`
  check fails → `'unmet'`. The run SKILL only ever writes `GATE(<id>): green` for a recorded-green
  phase; a contributor editing the DoD cannot add to the green set (the set is built from the engine's
  own run record, not from the DoD).
- The bin never executes a DoD-supplied string; `assertDodCriteria` already ignores `command`/`run`.
- `file-exists` paths flow through `containByRealpath(repoRoot, …)` → `null` on escape → `false` →
  `'unmet'`; the probe cannot be aimed outside the repo root.

**Source-hygiene.** `dod-assert`, `GATE(`, `gateGreen`, `file-exists` are not technique/VCS-host
tokens — none trip Class-A/B. The validation SKILL referencing `engine/bin/dod-assert.js` is in the
scanned set but introduces no banned vocabulary. No provenance refs enter the new code or tests.

### Part T2 — point the structure linters at the live docs

**Context block.**
- `scripts/backlog-lint.sh` — `REQUIRED="## Status at a glance|## Done|## Next|## Then|## Deferred /
  parked|## Notes"`, awk firing on `/^## /`.
- `scripts/design-lint.sh` — `REQUIRED="## Context|## Requirements|## Design|## Decision
  candidates|## Test strategy|## Out of scope"`, awk firing on `/^## /`.
- `scripts/ci.sh:52` (verbatim tail): `… && bash scripts/backlog-lint.sh templates/backlog.md &&
  bash scripts/design-lint.sh templates/design.md`.
- `test/backlog-lint.test.js`, `test/design-lint.test.js` (CommonJS, `execFileSync('bash',[SCRIPT,
  FIXTURE])`); fixtures `test/fixtures/{backlog,design}-{good,missing}.md`.

**Empirically pinned matrix** (read-only probes re-run in this worktree; a generalized linter built in
a `mktemp` throwaway):

| probe | result |
|---|---|
| live `BACKLOG.md` H2/H3 headings | `## Status — …`, `## Candidate phases …`, `## Parked`, `### Condition-gated …`, `### Closed …` |
| current `backlog-lint` vs `BACKLOG.md` | **FAIL** (template sections absent) |
| generalized set `## Status\|## Candidate phases\|## Parked\|### Condition-gated\|### Closed`, awk widened to `/^#{2,3} /`, vs `BACKLOG.md` | **PASS** (5 sections) |
| same generalized linter vs a `BACKLOG.md` with `### Closed` removed | **FAIL exit 2** (proves H3 sections are checked) |
| current `design-lint` vs each `docs/design/*.md` | PASS `clear-backlog-candidates-gated`, `hermetic-test-suites`, `simpler-phase-authoring`; **FAIL `despecialize-craft-sources`** |
| `despecialize-craft-sources.md` divergence | uses `## Decision log (resolved — …)` and OMITS `## Decision candidates` |
| current `design-lint` vs `templates/design.md` | PASS (unchanged set) |
| `templates/backlog.md` H2s (current, pre-migration) | `## Status at a glance / Done / Next / Then / Deferred / parked / Notes` — generic onboarding shape; FAILS the live set (missing Candidate phases / Parked / Condition-gated / Closed) → T2 MIGRATES it to the live shape (placeholders, not craft's roadmap) so the one generalized set passes both it and `BACKLOG.md` |

**backlog-lint (Decision candidate #2 — generalize, do NOT migrate).** Change `REQUIRED` to the live
set and widen the awk address from `/^## /` to `/^#{2,3} /` so the two H3 sections are checked:

```
REQUIRED="## Status|## Candidate phases|## Parked|### Condition-gated|### Closed"
...
/^#{2,3} / { for (i = 1; i <= n; i++) if (index($0, R[i]) == 1) seen[R[i]] = 1 }
```

Prefix-match (`index==1`) is preserved, so `## Status` matches `## Status — PRD program complete …`
and `### Closed` matches `### Closed — won't-do …`. The widened address only ADDS H3 lines to the scan;
an H3 that matches no required entry (e.g. a `### P1` sub-heading in a fixture) sets nothing — no
false positive. The summary line count changes from 6 → 5 sections.

**templates/backlog.md disposition (Decision candidate #4 — RESOLVED: migrate + keep, see Decision
outcomes / ADR-181).** The ratified decision DEVIATES from this doc's original recommendation (option a,
"drop it from the chain"): `templates/backlog.md` is MIGRATED to the live backlog structure — its section
headings are rewritten to the generalized required-set (`## Status`, `## Candidate phases`, `## Parked`,
`### Condition-gated`, `### Closed`) while it stays a GENERIC fresh-repo template (placeholder bodies, NOT
craft's actual roadmap content). It is KEPT in the `backlog-lint` chain ALONGSIDE `BACKLOG.md`, so one
generalized required-set guards both. Newly-onboarded repos receive the richer roadmap shape; the linter
keeps a single required-set (no second generic set, no dropped target). (`templates/design.md` is likewise
kept in the design-lint chain — it already passes the unchanged design set and is craft's canonical design
shape, the very template this doc fills.)

**ci.sh retarget — both linters point at the live docs + the kept/migrated templates.** No `REQUIRED`
change to `design-lint` (the live design docs already conform). Retarget `scripts/ci.sh:52` so
`backlog-lint` runs over BOTH the live `BACKLOG.md` AND the migrated `templates/backlog.md` (one
generalized required-set passes both), and `design-lint` runs over `templates/design.md` AND each
`docs/design/*.md`:

```
… && for b in BACKLOG.md templates/backlog.md; do bash scripts/backlog-lint.sh "$b" || exit 1; done \
   && for d in templates/design.md docs/design/*.md; do bash scripts/design-lint.sh "$d" || exit 1; done
```

The `|| exit 1` inside each loop propagates a per-file failure (the surrounding `&&` chain disables
`set -e`); the glob expands from the repo root (`ci.sh` cd's there at line 8); shellcheck stays clean
(`for x in glob` is idiomatic). This doc — `docs/design/activate-dod-and-live-doc-lints.md` — is in the
glob and passes (all six required H2s present), as do the other three live design docs once the
divergent one is repaired.

**Repair `despecialize-craft-sources.md`.** It captured its choices under `## Decision log (resolved —
…)` and omitted the template's `## Decision candidates`. Add a short `## Decision candidates` section,
e.g. *"none — choices captured in the Decision log below."* This is the minimal repair that greens the
glob without rewriting the doc's resolved-decisions narrative.

**Fixtures rewrite.** `test/fixtures/backlog-good.md` and `backlog-missing.md` are template-shaped and
would now FAIL the generalized linter. Rewrite them to the LIVE shape: `backlog-good.md` carries all
five live sections (`## Status …`, `## Candidate phases …`, `## Parked`, `### Condition-gated …`,
`### Closed …`); `backlog-missing.md` drops one H3 (`### Closed`) to prove H3 checking. The design
fixtures stay as-is (set unchanged); add one fixture missing `## Decision candidates` for the new
design-lint assertion.

**Source-hygiene.** `scripts/` and `test/` are NOT scanned; no concern. No provenance refs enter the
linters, fixtures, or tests.

### Cross-cutting — counters, commits, ordering

- T1's net-new `engine/test/` pure-core tests bump the single `EXPECTED_TESTS` line; T1's bin black-box
  process test + the repo-root token guard, and all T2 process tests, bump `EXPECTED_PROC_TESTS`. The
  implementer pins the exact emitted counts; *Test strategy* carries the estimates.
- Two atomic commits, e.g. `feat: assert structured DoD auto criteria against recorded gate evidence`
  (T1) and `feat: lint the live backlog and design docs` (T2). They share no file; either order works;
  each commit must be green standalone, so each sets the counter to the running total at that commit.
- This very run's own validation will run the dogfood mutation harness over the diff AND record
  `NO-OP(verify): no DoD declared` — `docs/DOD.md` is free-text (no frontmatter → `parseDod` returns
  `null`). That is expected and fine: the new code is proven by its own tests, not by this run
  asserting a structured DoD.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | **T1 — where the gate evidence comes from** | (a) map `assert.gate: <phase-id>` onto the run record's per-phase `GATE(<phase-id>): green\|red` tokens (run SKILL emits the fixed token; validation collects the green ids and feeds them as evidence); (b) a thinner "did `ci.sh` pass" boolean signal | **(a)** | Per-phase granularity is exactly what `assert.gate` requires (ADR-174: the named phase's recorded result). (b) is coarser — it cannot tell which gate a criterion names, so an unrelated green could satisfy `assert.gate: architecture`. (a) aligns with the prefer-fixed-greppable-tokens convention and a red/absent gate stays unflippable (absent from the green set ⇒ `'unmet'`). |
| 2 | **T2 — enforce the live structure vs migrate the doc** | (a) generalize `backlog-lint`'s required set to the live `BACKLOG.md` structure (incl. the H3 widening) and point `ci.sh` at `BACKLOG.md` + the design-docs glob; (b) migrate `BACKLOG.md` to the `templates/backlog.md` shape and keep the linter strict | **(a)** | Least churn; enforces what actually exists. Empirically pinned: the generalized set + `/^#{2,3} /` PASSES the live `BACKLOG.md` and FAILS a backlog missing an H3. (b) rewrites the live roadmap for no enforcement gain. |
| 3 | **T1 — `dod-assert` bin exit semantics** | (a) reporter — exit 0 with per-criterion JSON whenever assessable; non-zero only on operational error (bad argv / unreadable DoD / malformed frontmatter / invalid schema); the session escalates any `auto` `'unmet'`; (b) gater — bin exits non-zero when any `auto` criterion is `'unmet'` (simpler session check); (c) tri-state exit code encoding met/unmet/error | **(a)** | Keeps "couldn't assess" distinct from "assessed unmet" and the engine policy-free (CQS query); the SKILL already owns blocker escalation/headless-halt. (b) conflates the two; (c) overloads the exit code for no gain over reading the JSON. |
| 4 | **T2 — `templates/backlog.md` in the lint chain** | (a) drop it from the `backlog-lint` invocation (it is a generic fresh-repo template, not craft's structural instance); (b) keep linting it against its OWN generic required set (parameterize `REQUIRED`, two shapes); (c) migrate it to the live shape | **(a)** | `templates/backlog.md` cannot match the live set (pinned) and is the *seed* shape for a new repo, not an instance of craft's roadmap. (b) adds a second required-set + a linter param for a template that needs no enforcement; (c) destroys its purpose as a generic template. |

> **Designer dispositions** (house-style-determined, not forks — overridable by the user but not
> agent-forked): **pure/glue split** — pure `buildGateGreen` in `engine/src/dod.js` (mutation-covered),
> fs/containment `buildFileExists` + argv/IO glue in the bin `engine/bin/dod-assert.js`, honouring
> `dod.js`'s pure-no-I/O header. **Test placement** — Stryker's mutate scope is `engine/src/**/*.js` only
> (verified in `engine/stryker.conf.json`); it does NOT mutate `engine/bin/**`, so the bin's glue carries
> no mutants to strand. The mutation-worthy pure core (`buildGateGreen`) is engine-tested under
> `engine/test/` (`EXPECTED_TESTS`); the bin glue (fs + `contain.js` wiring, argv parse, output) is tested
> BLACK-BOX via a process test in repo-root `test/` (`EXPECTED_PROC_TESTS`) — the brief-literal placement.
> This supersedes the earlier "all `dod-assert` tests under `engine/test/`" disposition: because the bin is
> outside the mutate scope, there is no mutation-coverage reason to colocate its tests in the engine suite,
> so the draft's `engine/test/dod-assert-main.test.js` / `engine/test/dod-assert.bin.test.js` are dropped.
> The other T1 repo-root addition is the `GATE(` token spelling guard, mirroring the existing
> `test/no-op-token.test.js` greppable-token guard.

## Decision outcomes (resolved — folded back, authoritative)

Resolved with the operator; captured as ADRs 178–181. The `## Decision candidates` table above is the
pre-decision record; where an outcome differs from its recommendation, **this block wins**.

| # | Choice | Resolved | ADR |
|---|---|---|---|
| 1 | T1 — where the gate evidence comes from | **per-phase `GATE(<phase-id>): green\|red` token** (run SKILL emits the fixed token; validation collects the green ids and feeds them as evidence) — ratified **as recommended** (option a) | 178 |
| 2 | T2 — enforce the live structure vs migrate the doc | **generalize `backlog-lint` to the live structure** (incl. the H3 widening) + point `ci.sh` at the live docs — ratified **as recommended** (option a); the live `BACKLOG.md` is NOT migrated | 179 |
| 3 | T1 — `dod-assert` bin exit semantics | **reporter (CQS query)** — exit 0 with per-criterion JSON whenever assessable, non-zero only on operational error — **adopted as recommended** (option a; no user judgment) | 180 |
| 4 | T2 — `templates/backlog.md` in the lint chain | **MIGRATE the template to the live structure and KEEP it in the chain** (option c) — **DEVIATES** from this doc's original recommendation (option a, "drop it"); one generalized required-set now guards both `BACKLOG.md` and the migrated template | 181 |

Outcome #4 supersedes the "drop it" disposition wherever it still reads in Part T2 / Decision candidate
#4: `templates/backlog.md` is migrated to the live backlog shape (generic placeholders, not craft's
roadmap content) and stays in `backlog-lint` alongside `BACKLOG.md`.

## Test strategy

All counter deltas below are **ESTIMATES**. Stryker's mutate scope is `engine/src/**/*.js` ONLY (verified
in `engine/stryker.conf.json`) — it does NOT mutate `engine/bin/**`. So the split is: mutation-worthy pure
logic is engine-tested (`EXPECTED_TESTS`), and the un-mutated bin glue is process-tested black-box
(`EXPECTED_PROC_TESTS`). The implementer **pins the EXACT emitted counts** and sets BOTH `EXPECTED_TESTS`
(`scripts/ci.sh:10`, asserted twice — engine-cwd run and repo-root run, both passes must equal) and
`EXPECTED_PROC_TESTS` (`scripts/ci.sh:44`) to the running total at each commit.

**T1 — `engine/test/` (bump `EXPECTED_TESTS`; mutation-covered):** the only engine additions are the
pure-core tests for `buildGateGreen` — the only new mutation-worthy logic, living in `engine/src/dod.js`.

- `engine/test/dod.test.js` (extend, est. **+5**): `buildGateGreen` returns `true` for a green id;
  returns `false` for a red/absent id (red CANNOT be flipped green); `assertDodCriteria` over
  `buildGateGreen(greenSet)` → gate criterion `'met'` from REAL green evidence; over an empty/red set →
  `'unmet'`; with a stray `command`/`run` field on the criterion → outcome still gate-derived (injection
  ignored, builder-fed).

T1 engine subtotal: est. **+5** → `EXPECTED_TESTS` 1234 → ~**1239** (estimate; implementer pins exact).

**T1 — repo-root `test/` (bump `EXPECTED_PROC_TESTS`):** the bin `engine/bin/dod-assert.js` is outside the
mutate scope, so its glue (fs + `contain.js` wiring, argv parse, output, exit codes) is covered BLACK-BOX
by a process test that spawns the real bin — the brief-literal placement. This consolidates what the
earlier draft split across `engine/test/dod-assert-main.test.js` + `engine/test/dod-assert.bin.test.js`
(both dropped: there is no mutation-coverage reason to colocate them in the engine suite, since the bin is
never mutated).

- `test/dod-assert.test.js` (new, est. **+9**): spawn `engine/bin/dod-assert.js` against `mktemp` DoD
  files — structured DoD + green set → JSON `'met'`, exit 0; + empty/red set → `'unmet'`, exit 0;
  `file-exists` criterion on a contained existing file → `'met'`; `file-exists` path escaping the repo
  root → `'unmet'` (real `contain.js`, cannot probe outside); free-text DoD (no frontmatter) →
  `{"outcomes": null}`, exit 0 (non-blocking no-DoD path); malformed-frontmatter DoD → fails LOUD,
  non-zero exit, message surfaced (not swallowed); invalid criteria schema → non-zero exit, validation
  errors surfaced; missing argv → usage error, non-zero exit; injection — criterion carrying
  `command`/`run` → outcome gate-derived end-to-end.
- `test/gate-token.test.js` (new, est. **+1**): grep `skills/run/SKILL.md` for the fixed token literal
  `GATE(` (the greppable-token spelling guard; pins the spelling, not the surrounding prose), mirroring
  `test/no-op-token.test.js`.

T1 process subtotal: est. **+10**.

**T2 — repo-root `test/` (bump `EXPECTED_PROC_TESTS`; NO engine tests — T2 adds no `engine/test/` files):**

- `test/backlog-lint.test.js` (est. **+2 net**): add "live `BACKLOG.md` passes the generalized linter" and
  "migrated `templates/backlog.md` passes the same generalized linter (one required-set guards both)"; the
  existing missing-section test is re-pointed to a fixture dropping the H3 `### Closed` (still exits 2),
  and the count-summary assertion changes 6 → 5 (these two are modifications, not new tests). Rewrite
  `test/fixtures/backlog-good.md` / `backlog-missing.md` to the live shape.
- `test/design-lint.test.js` (est. **+1**): a fixture missing `## Decision candidates`
  (`test/fixtures/design-missing-dc.md`) exits 2 — proves the glob catches the very omission the
  divergent doc had; the existing three tests hold (set unchanged).

T2 process subtotal: est. **+3**.

**Counter summary (ESTIMATES — implementer pins the exact emitted counts and sets both lines to match).**
- `EXPECTED_TESTS` (`ci.sh:10`, asserted twice): est. 1234 → ~**1239** (T1 pure-core only; T2 adds no
  engine tests).
- `EXPECTED_PROC_TESTS` (`ci.sh:44`): est. 117 → ~**130** (T1 bin process test + token guard ≈ +10; T2
  ≈ +3). Per-commit: T1's commit sets both counters to its running total; T2's commit bumps ONLY
  `EXPECTED_PROC_TESTS`. Final totals are order-independent; each commit bumps by its own exact net count
  and is green standalone.

Edge matrix carried by the tests: green vs red/absent gate (red-cannot-flip), `file-exists`
contained vs escaping (containment-bound), free-text vs structured vs malformed-frontmatter vs
invalid-schema DoD, injection field ignored, bin operational-error exits; and for T2: live backlog
passes, migrated template passes, missing-H3 fails, missing-`## Decision candidates` design doc fails.

## Out of scope

- **Asserting a structured DoD on THIS run** — `docs/DOD.md` stays free-text; this run records
  `NO-OP(verify):` and proves the new code by its own tests, not by self-assertion.
- **A new manifest key or DoD schema change** — `paths.dod` and the DC-5 v2 schema (ADR-174) are
  reused as-is; T1 only adds the runtime call path.
- **Re-running gates inside the bin** — the bin reads recorded gate evidence (the green phase-id set);
  it never re-runs a gate or executes a DoD-supplied command (ADR-174 fence unchanged).
- **`judgment`-criterion mechanization** — `judgment` criteria remain human-asserted on the DoD's
  terms; only the `auto` subset is mechanized.
- **Migrating the live `BACKLOG.md`** — the live roadmap is left as-is; only the linter and its targets
  change (Decision candidate #2 / ADR-179). NOTE: `templates/backlog.md` is NOT out of scope — per the
  Decision outcomes (#4 / ADR-181) it IS migrated to the live shape and kept in the lint chain.
- **Content/semantic linting of docs** — both linters stay thin structure-only heading-presence checks
  (house style of `plan-lint.sh`); they do not validate section content or order beyond presence.
- **Rewriting `despecialize-craft-sources.md`'s resolved-decisions narrative** — only a short
  `## Decision candidates` section is added to green the glob; its `## Decision log` stays.
- **`adapters/pi` (`EXPECTED_PI_TESTS=202`)** — untouched; no item names it.
