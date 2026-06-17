# Plan — P3: rewire the live orchestrator to consume the Node engine

> Source: design doc `docs/DESIGN-P3-orchestrator-rewire.md` · ADRs `009, 010, 011, 012`
> The plan is the implementation script AND the knowledge handoff. Slice agents start
> with zero context: whatever a slice block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every slice costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only slices: coverage/interop/property tests fold
  into the implementation slice whose code they exercise.
- A slice that would be a pure test pass over already-landed code merges into its
  neighbour.

## Slice 1 — validateManifest pure module + barrel export

### Context

**What this slice builds:** the new `engine/src/manifest.js` module exporting
`validateManifest(manifest, opts)`, plus tests, plus the barrel update.

**Surface gate (PUBLIC EXPORT):** `engine/src/index.js` currently has 6 lines. The
implementer MUST add a 7th line:
```
export { validateManifest } from './manifest.js';
```
This is a new public export — add it in the same commit, not later.

**Files to create/touch:**
- CREATE `engine/src/manifest.js` — pure ESM module, no I/O
- EDIT `engine/src/index.js` at `/Users/scolladon/workspace/perso/craft/engine/src/index.js` — add line 7
- CREATE `engine/test/manifest.test.js` — `node:test` + `node:assert/strict`

**Engine module conventions (match exactly):**
- Pure ESM (`export function`), JSDoc-typed, immutable outputs, early returns
- Tests: `import { test } from 'node:test'; import assert from 'node:assert/strict';`
- Test titles: Given/When/Then; `sut` variable for the function under test
- Fixtures for file-existence tests: `engine/test/fixtures/manifests/` (existing dir)

**Exact semantics to implement in `validateManifest(manifest, opts)`:**
- Returns `{ ok: boolean, errors: string[] }` — never throws
- `manifest` is a pre-parsed JS object (js-yaml `load` output); `null`/`undefined` → `{ ok: true, errors: [] }` (absent manifest is valid — the CLI handles the absent-file message)
- `opts.fileExists(path: string): boolean` — injected; used for dangling-file checks

**Known TOP_KEYS** (from `manifest-lint.sh` line 25, PLUS ADR-010 additions):
`backlog paths context gates phases pr scripts models pipeline retrieval execution`

**Known PHASE_NAMES** (old set, unchanged — alias wiring is P4):
`branch design adr plan implement review refactor mutation docs pr merge`

**Known PHASE_FIELDS** (from `manifest-lint.sh` line 27, MINUS `skip` — `skip` now triggers the ADR-011 loud error instead of PROTECTED check):
`context override strategy merge-flags non-blocking-jobs`

**Known GATE_FIELDS** (line 28): `slice phase review-batch`
**Known PR_FIELDS** (line 29): `creator pre-pr-gate`
**Known SCRIPT_FIELDS** (line 30): `post-setup pre-teardown`
**Known MODELS_KEYS** (line 31): `fallback designer planner reviewer slice-implementer refactor-executor mutation-triager docs-writer backlog-ticker`

**Validation rules (reproduce faithfully — the bats suite guards a subset):**
1. Top-level key not in TOP_KEYS → error `"unknown top-level key: <key>"`
2. `pipeline` key: sub-keys `profile`, `skip`, `insert` are recognized shape — no further sub-validation of the `skip` array contents (the resolver strand-checks those). Unknown `pipeline` sub-keys → error `"unknown pipeline key: <key>"`
3. `retrieval` and `execution` top-level keys: recognized as valid keys, no sub-validation (shape only)
4. `models.<k>` not in MODELS_KEYS → error `"unknown models key: <k> (expected an agent name or 'fallback')"`
5. `context` (top-level): value(s) are file refs → `opts.fileExists` check. Supports scalar string and array. Path OK if `null`/`undefined`/`''`/`'~'`; else check existence.
6. `gates.<f>` not in GATE_FIELDS → error `"unknown gates field: <f>"`
7. `pr.<f>` not in PR_FIELDS → error `"unknown pr field: <f>"`
8. `scripts.<f>` not in SCRIPT_FIELDS → error `"unknown scripts field: <f>"`. Value(s) are file refs → `opts.fileExists` check.
9. `phases.<p>` not in PHASE_NAMES → error `"unknown phase: <p>"`
10. `phases.<p>.<f>` not in PHASE_FIELDS (and `f` is NOT `skip`) → error `"unknown field on phase <p>: <f>"`
11. **ADR-011:** `phases.<p>.skip` present (regardless of value) → error `"per-phase skip: is inert — use top-level pipeline.skip: [<p>]"` (exact substring `"pipeline.skip"` must appear)
12. `phases.<p>.context` value(s) are file refs → `opts.fileExists` check
13. `phases.<p>.override` value is a file ref → `opts.fileExists` check
14. **Dangling-file check logic** (mirrors `check_one_file` in `manifest-lint.sh` lines 38–41): a path is OK if null/undefined/empty/`~`; else must satisfy `opts.fileExists(path)`. The CLI will inject a `fileExists` that checks `ROOT/path` OR `path` directly (where `ROOT = dirname(dirname(manifestFilePath))`). The pure function just calls `opts.fileExists(resolvedPath)` — but since the pure function doesn't know ROOT, the **implementer resolves** by passing a closure from the CLI layer. In the pure module, call `opts.fileExists(path)` directly — the CLI closure handles the ROOT logic.

**What to test in `engine/test/manifest.test.js`:**
The test file must cover each rule above. Key cases:
- null/undefined manifest → `{ ok: true, errors: [] }`
- empty object `{}` → `{ ok: true, errors: [] }`
- unknown top-level key → error with `"unknown top-level key"`
- unknown phase name → error with `"unknown phase"`
- ADR-011: `phases.plan.skip: true` → error containing `"pipeline.skip"` (this is the re-baseline target)
- known phase field → ok
- unknown phase field → error with `"unknown field on phase"`
- unknown gates field → error with `"unknown gates field"`
- dangling file ref via injected `fileExists` returning false → error with `"references missing file"`
- `fileExists` returning true → ok
- `pipeline: { skip: ['decisions'] }` → `{ ok: true, errors: [] }` (ADR-010 acceptance)
- `pipeline: { skip: ['decisions'], profile: 'solo' }` → ok
- unknown `pipeline` sub-key → error
- `retrieval: {}` top-level → ok
- `execution: 'inline'` top-level → ok
- multiple errors accumulate → all errors in `errors[]`, `ok: false`

**`engine/src/index.js` current content (6 lines — add the 7th):**
```
export { parsePipeline }           from './descriptor.js';
export { validatePipeline }        from './graph.js';
export { ALIAS_MAP, resolveAlias } from './alias-map.js';
export { resolvePipeline }         from './resolve.js';
export { assembleContract }        from './contract.js';
export { normalizeFindings }       from './findings.js';
```

**DO NOT TOUCH:** `resolve.js`, `gates.js`, `descriptor.js`, `graph.js`, `strand.js` — the engine resolver is frozen. Do not modify `scenarios.test.js` or any existing test file.

### TDD steps

**RED — write tests first, run `node --test engine/test/manifest.test.js`, confirm they fail with "not found" or similar:**
1. `engine/test/manifest.test.js` imports `{ validateManifest }` from `../src/manifest.js` — import fails (file absent) → all tests error
2. Write tests for: null manifest ok; unknown top-level key; unknown phase; ADR-011 legacy-skip rejection (error containing `"pipeline.skip"`); unknown gates field; dangling file via `opts.fileExists`; `pipeline.skip` array accepted; `retrieval` key accepted; `execution` key accepted; multiple errors accumulate.

**GREEN — create `engine/src/manifest.js` with `validateManifest`:**
- Start with all validation constants (TOP_KEYS, PHASE_NAMES, etc.) as frozen Sets
- Pure function: iterate manifest keys, accumulate errors, return `{ ok, errors }`
- Wire `opts.fileExists` for context/scripts/override paths
- ADR-011: detect `phases.<p>.skip` presence, emit legacy-skip guidance error
- ADR-010: accept `pipeline`/`retrieval`/`execution` in TOP_KEYS, validate `pipeline.{profile,skip,insert}` sub-keys

**GREEN — add export to `engine/src/index.js`:**
- Add line: `export { validateManifest } from './manifest.js';`

**REFACTOR:**
- Extract constants into named frozen Sets at top of file
- Confirm all error message substrings match what the bats suite asserts (see Slice 2 for the exact strings the bats helpers check)
- Functions <20 lines, no nesting >2, early returns

### Gate

```
node --test engine/test/manifest.test.js
```

Then confirm the engine suite still passes:
```
(cd engine && node --test)
```

### Commit

```
feat(engine): validateManifest pure module + barrel export (ADR-010/011/012)
```

---

## Slice 2 — manifest-lint.js CLI + thin shell wrapper + bats reconciliation

### Context

**What this slice builds:**
1. CREATE `engine/bin/manifest-lint.js` — the Node CLI that owns I/O, calls `validateManifest`
2. REWRITE `scripts/manifest-lint.sh` to a thin `exec node` wrapper (~3 lines)
3. EDIT `test/manifest-lint.bats` — re-baseline one test, retire 9 yq-equivalence tests + `run_lint_no_yq` helper
4. EDIT `test/helpers/manifest-lint.bash` — remove `run_lint_no_yq` function
5. CREATE `test/fixtures/manifest/valid-pipeline-skip.workflow.md` — ADR-010 coverage
6. CREATE `test/fixtures/manifest/invalid-legacy-skip.workflow.md` — optional, or reuse `invalid-skip-protected` (content unchanged: `phases: { plan: { skip: true } }`)

**Slice 1 must land before this slice** — `validateManifest` must exist.

**`engine/bin/manifest-lint.js` — exact I/O contract (the bats suite asserts these strings):**

Argument: optional manifest path. Default: `.claude/workflow.md`.

1. **Absent file:** if file does not exist →
   `process.stdout.write('craft-manifest: no manifest at <MF> — pure defaults via capability probing.\n')` + `process.exit(0)`

2. **No frontmatter:** read file; if no `---` delimited YAML frontmatter block →
   `process.stdout.write('craft-manifest: <MF> has no YAML frontmatter — pure defaults.\n')` + `process.exit(0)`

3. **Valid:** call `validateManifest(parsed, { fileExists })` → `{ ok: true }` →
   `process.stdout.write('craft-manifest: <MF> valid.\n')` + `process.exit(0)`

4. **Invalid:** `{ ok: false, errors[] }` →
   write to **stderr**: `'craft-manifest: INVALID manifest <MF>:\n'` + `'- <err>\n'` per error + `'Fix the manifest — craft refuses to run on a misconfigured declination (fail loudly, never silently).\n'`
   + `process.exit(2)`

**Frontmatter extraction (mirrors the bash `awk` in `manifest-lint.sh` line 19):**
Extract the block between the first `---` and the second `---`. If none found → "no frontmatter" path. Parse with `js-yaml` `load()`.

**`fileExists` closure (mirrors `check_one_file` in `manifest-lint.sh` lines 38–41):**
```js
const ROOT = path.dirname(path.dirname(path.resolve(MF)));
const fileExists = (p) => existsSync(path.join(ROOT, p)) || existsSync(p);
```
`import { existsSync } from 'node:fs'` and `import path from 'node:path'`.

**`scripts/manifest-lint.sh` replacement (3 lines):**
```bash
#!/usr/bin/env bash
set -euo pipefail
exec node "${BASH_SOURCE[0]%/scripts/*}/engine/bin/manifest-lint.js" "$@"
```
The `${BASH_SOURCE[0]%/scripts/*}` extracts the plugin root from the script's own path so it works regardless of CWD. This must pass `shellcheck`. The `exec` replaces the shell process so exit codes flow through unchanged.

**`test/manifest-lint.bats` changes — be precise:**

RETIRE (delete) these 9 tests (lines 89–152 in the current file) and `run_lint_no_yq` helper:
- "Given a non-existent manifest, when lint runs without yq, ..."
- "Given a manifest with no YAML frontmatter, when lint runs without yq, ..."
- "Given a valid basic manifest, when lint runs without yq, ..."
- "Given comma-bearing inline arrays, when lint runs without yq, ..."
- "Given quoted colon values and trailing comments, when lint runs without yq, ..."
- "Given a manifest with an unknown top-level key, when lint runs without yq, ..."
- "Given a manifest with an unknown phase name, when lint runs without yq, ..."
- "Given a manifest with skip on a protected phase, when lint runs without yq, ..."
- "Given a manifest referencing a missing file, when lint runs without yq, ..."
- "Given an inline-map gates with an unknown field, when lint runs without yq, ..."

RE-BASELINE (edit) the test at bats line 63–68 (currently: `"Given a manifest with skip on a protected phase, when lint runs, then it exits 2 and reports skip refused"`):
- Keep: `[ "$status" -eq 2 ]` and `[[ "$output" == *"INVALID manifest"* ]]`
- Change: `[[ "$output" == *"skip: is refused on protected phase"* ]]` → `[[ "$output" == *"pipeline.skip"* ]]`
- Update test title to: `"Given a manifest with a per-phase skip field, when lint runs, then it exits 2 with legacy-skip guidance"`
- Fixture `test/fixtures/manifest/invalid-skip-protected.workflow.md` content is UNCHANGED (still `phases: { plan: { skip: true } }`)

ADD new test after the re-baselined skip test:
```bats
@test "Given a manifest with pipeline.skip top-level key, when lint runs, then it exits 0 and reports valid" {
  run_lint "${FIXTURES}/valid-pipeline-skip.workflow.md"
  [ "$status" -eq 0 ]
  [[ "$output" == *"valid."* ]]
}
```

**CREATE `test/fixtures/manifest/valid-pipeline-skip.workflow.md`:**
```yaml
---
pipeline:
  skip: [decisions]
---

# Pipeline skip — valid ADR-010 surface
```

**`test/helpers/manifest-lint.bash` — remove `run_lint_no_yq`:**
Delete the entire `run_lint_no_yq()` function block (lines ~14–38 in the current file). Keep `run_lint()` unchanged.

**Existing behavior-preserving tests that MUST stay green** (these now drive the node-backed wrapper):
- absent file → exit 0, `"no manifest"`
- no frontmatter → exit 0, `"no YAML frontmatter"`
- valid-basic → exit 0, `"valid."`
- valid-inline-array → exit 0, `"valid."` (comma-protection)
- valid-quoting → exit 0, `"valid."` (comment-strip + quoting)
- invalid-unknown-top-key → exit 2, `"INVALID manifest"`, `"unknown top-level key"`
- invalid-unknown-phase → exit 2, `"INVALID manifest"`, `"unknown phase"`
- invalid-dangling-file → exit 2, `"INVALID manifest"`, `"references missing file"`
- invalid-unknown-gates-field → exit 2, `"INVALID manifest"`, `"unknown gates field"`
- invalid-skip-protected (re-baselined) → exit 2, `"INVALID manifest"`, `"pipeline.skip"`
- valid-pipeline-skip (new) → exit 0, `"valid."`

**`valid-basic.workflow.md` fixture (already exists — must stay valid):**
Contains: `backlog`, `paths`, `context: ~`, `gates` (with `slice`/`phase`/`review-batch`), `pr`, `scripts`, `models`, `phases` with `branch`/`design`/`docs`. All in OLD phase names — they must still pass after the fold.

**`valid-inline-array.workflow.md`** uses `scripts.post-setup: [manifest/stubs/a.md, manifest/stubs/b.md]` — the node CLI must handle array values for file refs (check each element).

**`valid-quoting.workflow.md`** uses `phases.design.context: manifest/stubs/a.md # trailing comment` — the node CLI must strip trailing YAML comments when extracting the path. NOTE: js-yaml's `load()` handles comment stripping natively; the bats test exercises that the stubs resolve.

**DO NOT TOUCH** the large bash body in `scripts/manifest-lint.sh` yet — you are REPLACING the entire file. The new file is 3 lines only.

**`scripts/ci.sh` current content (unchanged — shellcheck must still pass on `scripts/*.sh`):**
```bash
(cd engine && node --test) && bats test/ && shellcheck scripts/*.sh hooks/*.sh && node engine/bin/pipeline-lint.js pipeline/default.yml && node engine/bin/pipeline-resolve.js pipeline/default.yml
```
After this slice, `shellcheck scripts/manifest-lint.sh` must pass on the new 3-line wrapper.

### TDD steps

**RED — write new bats tests first, then run `bats test/manifest-lint.bats`, confirm RED on the re-baselined test:**
1. Edit bats file: re-baseline the protected-skip test (change the `"skip: is refused"` substring assertion to `"pipeline.skip"`) → test now fails because the bash implementation still emits the old message
2. Add the `valid-pipeline-skip` test + fixture → test fails because `pipeline` is currently an unknown top-level key

**GREEN — build the CLI and wrapper:**
1. Create `engine/bin/manifest-lint.js` with frontmatter extraction, fileExists closure, and calls to `validateManifest`
2. Replace `scripts/manifest-lint.sh` with the 3-line wrapper
3. Remove `run_lint_no_yq` from `test/helpers/manifest-lint.bash`
4. Delete the 9 yq-equivalence tests from `test/manifest-lint.bats`
5. Run `bats test/manifest-lint.bats` — all remaining tests must be green

**REFACTOR:**
- Ensure `engine/bin/manifest-lint.js` is <200 lines total
- Frontmatter extraction in a named helper function
- `fileExists` closure named and documented
- No magic strings — use named constants for exit codes

### Gate

```
bats test/manifest-lint.bats && shellcheck scripts/manifest-lint.sh scripts/ci.sh
```

Then confirm full CI still green:
```
bash scripts/ci.sh
```

### Commit

```
feat(manifest-lint): fold shape-validation into Node core, retire yq backend (ADR-012)
```

---

## Slice 3 — rewrite `skills/run/SKILL.md` — dynamic walk + archetype-generalized invariants

### Context

**What this slice builds:** a complete rewrite of `skills/run/SKILL.md` replacing:
1. The hardcoded `1→11` phase table (lines 32–46 of the current file)
2. The §"Cross-phase invariants" section (lines 55–97) — generalize by archetype
3. §0 Resolve (lines 17–30) — add engine invocation + run-record seeding

**This slice touches ONE file:** `skills/run/SKILL.md` at
`/Users/scolladon/workspace/perso/craft/skills/run/SKILL.md`

No compiled code changes. No new test files. The gate is `scripts/ci.sh` staying green
(regression safety — touching no tested code) plus a structural review confirming the
walk faithfully consumes the Resolution shape.

**Current `skills/run/SKILL.md` structure (lines to replace):**

Lines 1–16: frontmatter + preamble — KEEP unchanged
Lines 17–30: §0 Resolve — EXTEND (add engine invocation after step 1)
Lines 32–46: `## 1→11 — Phase sequence (fixed; this order is not declinable)` table — REPLACE entirely
Lines 47–53: paragraph about manifest declination — REPLACE (refer to archetype walk)
Lines 55–97: `## Cross-phase invariants (non-overridable)` — REWRITE by archetype
Lines 99–103: `## Done` — KEEP unchanged

**§0 Resolve — new steps to add after existing step 1 (manifest-lint):**

Insert between step 1 ("Run manifest-lint.sh") and step 2 ("Classify the input"):

```
1b. Run `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/pipeline-resolve.js" \
        "${CLAUDE_PLUGIN_ROOT}/pipeline/default.yml" [manifest-path]` via Bash,
    capturing stdout. The manifest path argument is included only when a manifest
    file was found in step 1.
    - On non-zero exit: STOP; surface stderr to the user; refuse to proceed.
    - On `ok: false` in the JSON: STOP; surface all `errors[]` entries; refuse.
    - If `effective[]` is empty: STOP; surface "no enabled phases in resolution".
    Parse the JSON as `Resolution`.

1c. Seed the run record (step 4) with every entry in `Resolution.record[]` as
    its initial lines. Subsequent phase outcomes, skip reasons, no-op
    justifications, probe results, and forced actions are appended.

1d. Read `Resolution.gateDecisions` and extract `awaitingHarnesses[]` from the
    `propose` entry. Store this set in-session as the executing-harness ids that
    must land before `propose` starts `pr create`.

1e. Note `Resolution.waivers[]`. Waiver entries are already written into
    `Resolution.record[]` as `WAIVER: …` lines by the engine; they arrive
    pre-formatted. The structured `waivers[]` array is available for conditional
    logic (e.g., checking if `propose` is released) but is NOT re-formatted here.
```

**§ Phase walk — replaces the `## 1→11` section:**

Replace lines 32–53 with:

```markdown
## Phase walk (driven by Resolution.effective[])

Walk each phase descriptor in `Resolution.effective[]` order. For each phase:

1. **Resolve the skill dir** — look up `phase.id` in the ALIAS_MAP inverse table
   below and invoke `craft:<skill-dir-name>`. If `phase.id` has no entry and no
   same-named `skills/` dir exists: STOP and surface "unknown phase id <id>; P4
   may fix this".

2. **Resolve execution** — use `phase.execution` (`agent` | `inline`) from the
   Resolution. Apply manifest override (`phases.<id>.override`,
   `phases.<id>.context`) as before.

3. **Assemble the injected block** — P5 TODO: call `assembleContract(phase.contract,
   FRAGMENTS)` and inject the result as the contract block. For now, agent defs
   carry their own contracts.

4. **Execute** via the resolved execution mode. Session-owned responsibilities by
   archetype:
   - `setup`: workspace preparation and setup
   - `specification`: verify artifact; conversation if no `role` field (decisions)
   - `construction`: verify each slice; run phase gate per gate-cadence invariant
   - `harness` (`harness-read ∈ contract`): apply ALL findings; convergence
   - `refinement`: judgment (scan + scoping); apply ALL findings
   - `harness` (`harness-exec ∈ contract`): start background run; gate `propose`
     on triage completion (see invariants below)
   - `delivery` (`documentation`): synthesis (follow-ups, backlog guard) — may
     parallel a running executing-harness
   - `delivery` (`propose`): pre-propose gate; body; PR creation per policy — does
     NOT start until every id in the in-session `awaitingHarnesses` set has landed
     and its gate is green
   - `delivery` (`integrate`): user confirms; cleanup

5. **Gate** — read gate string from `Resolution.gateDecisions[phase.id].gate`.
   If `codeProducing: true`: apply gate-cadence invariant (targeted gate per fix
   commit; phase gate once per round; never commit on known-red).
   If `codeProducing: false` and gate non-empty: run gate once at phase boundary.
   If gate is empty string: no gate check.

6. **Record outcome** in the run record (appended to the seeded entries).

7. **On blocker**: escalate `{ phase/slice, reason, ≤3 candidate options }`. Never
   spin, never silently abandon.

8. **On model-down** (not a task blocker): mark tier degraded; re-resolve to
   fallback; respawn from artifact. Record degradation in run record.

ALIAS_MAP inverse table (canonical id → skill dir, single authoritative copy
derived from `engine/src/alias-map.js` — DC-4; this table is deleted at P4):

| canonical id   | skill dir    |
|---|---|
| workspace      | branch       |
| requirements   | prd          |
| decisions      | adr          |
| planning       | plan         |
| implementation | implement    |
| design         | design       |
| review         | review       |
| refactoring    | refactor     |
| validation     | mutation     |
| architecture   | architecture |
| documentation  | docs         |
| propose        | pr           |
| integrate      | merge        |

`requirements` and `architecture` are disabled by default (not in SC1 `effective[]`).
`design` and `review` map to themselves (no alias entry; `skills/design/` and
`skills/review/` already exist under those names).
```

**§ Cross-phase invariants — archetype-generalized rewrite:**

Replace lines 55–97 with:

```markdown
## Cross-phase invariants (non-overridable)

- **Executing-harness triage gates `propose`**: a phase is an executing-harness when
  `archetype: harness` and `harness-exec ∈ contract`. `propose` does not start
  `pr create` until every phase id in the in-session `awaitingHarnesses` set (read
  from `Resolution.gateDecisions[propose].awaitingHarnesses` in §0) has landed its
  run and its gate is green. `documentation` (archetype: `delivery`) may parallel a
  background executing-harness; `propose` may not.
  If an executing-harness was waived (skipped via `pipeline.skip`), its gate is
  released — the waiver is in `Resolution.waivers[]` and pre-formatted in
  `Resolution.record[]` — and `propose` may proceed without waiting for it.

- **Scope expansion re-enters the harness-read phase**: any feature behavior added
  after a phase with `archetype: harness` and `harness-read ∈ contract` has run —
  during phases of archetype `construction` or `refinement` — that is NOT a fix to an
  existing finding gets its own feature-scoped review before the executing-harness gate
  closes. The `refinement` phase's re-review is scoped to the refinement diff only and
  does not substitute. A scope expansion that reaches the executing-harness gate
  unreviewed is a workflow breach.

- **Artifact is the handoff**: every delegated agent's contribution must be in a
  committed artifact before the phase closes. A dead agent = fresh respawn fed from
  the artifact, never a continuation.

- **Gates**: each fix commit gates on the TARGETED check (`gates.slice` over the
  touched files + `gates.review-batch` if declared); the full phase-boundary gate
  runs ONCE per round — after each code-producing phase, after each
  `harness`/`refinement` fix round, and before push — not after every intra-round
  commit. Nothing is ever committed on a known-red gate.

- **Agent spawns**: every role-agent invocation carries the working directory, the
  task dynamics, AND the manifest's context file(s) verbatim (a phase's `context:`
  may be one file or a list — inject all of them). Artifacts already committed in the
  worktree are passed by PATH — the agent reads them in-place; the prompt embeds the
  pre-chewed context and the load-bearing deltas, not a second verbatim copy, and a
  respawn from a partial artifact points at the on-disk state rather than
  re-transcribing it. The pre-chew mandate forbids making an agent re-explore the
  codebase — not reading a committed plan.

- **Model resolution & fallback**: resolve each spawn's model as manifest
  `models.<agent>` → the agent def's pinned model (pass it as the spawn's model
  param). If a spawn dies on a model-availability error (model down/overloaded/unknown
  — NOT a task blocker, which uses the blocker protocol), mark that model **degraded
  for the rest of the run** and re-resolve to `models.fallback` if declared, else the
  session's own model (guaranteed available). Record the degradation in the run record,
  then respawn from the artifact. Once a tier is known degraded this run, later spawns
  skip straight to the fallback — never pay the same dead spawn twice.

- **Blockers** escalate to the user as `{ phase/slice, reason, ≤3 candidate options }`
  — never spin, never silently abandon.

- **Provenance**: no phase/ADR/backlog references inside source or test code, ever.
  Design docs and the PR body carry provenance.
```

**Error paths to include in the walk (from the design §Error paths):**

Add an error-path table after the ALIAS_MAP inverse table and before §Cross-phase
invariants:

```markdown
### Walk error paths

| Condition | Behavior |
|---|---|
| `ok: false` from `pipeline-resolve` | Stop; surface all `errors[]`; refuse to proceed |
| Non-zero exit from `pipeline-resolve` | Stop; surface stderr; refuse to proceed |
| `effective[]` is empty | Stop; surface "no enabled phases in resolution" |
| A phase id has no matching inverse-alias and no same-named `skills/` dir | Stop; surface "unknown phase id <id>; P4 may fix this" |
| `awaitingHarnesses` on `propose` is empty | Propose is not gated on any harness; proceed normally |
| `waivers[]` is non-empty | Entries are already in `record[]` as `WAIVER: …` lines; continue |
| A skip strands a consumer | `ok: false` already; covered by the stop-on-error path |
| manifest-lint exits 2 (invalid) | Stop; surface errors (existing behavior; unchanged) |
```

**What does NOT change** in `skills/run/SKILL.md`:
- Lines 1–16 (frontmatter + preamble): unchanged
- Step 1 of §0 (the `manifest-lint.sh` invocation): unchanged
- Steps 2–4 of §0 (classify input, slug derivation, open run record): unchanged
- `## Done` section: unchanged

**No unit test is possible** for this markdown file — it is LLM policy text. The gate is:
1. `scripts/ci.sh` stays green (this slice touches no tested code)
2. Manual structural review: the walk section references `Resolution.effective[]`, `gateDecisions`, `record[]`, `waivers[]` consistently with the pinned SC1 output; the ALIAS_MAP inverse table covers all 11 SC1 phase ids without a gap; ADR-009/010/011/012 semantics are reflected.

### TDD steps

This slice rewrites LLM policy markdown, not compiled code. The TDD framing applies
to structural correctness, not automated tests:

**RED — before edit:** `scripts/ci.sh` is green; `skills/run/SKILL.md` still references
the hardcoded table and phase numbers.

**GREEN — edit `skills/run/SKILL.md`:**
1. Extend §0 Resolve: add steps 1b–1e (engine invocation, record seeding, awaitingHarnesses extraction, waivers note) between existing step 1 and step 2
2. Replace `## 1→11 — Phase sequence` section with `## Phase walk (driven by Resolution.effective[])` section including: walk steps 1–8, ALIAS_MAP inverse table, error-paths table
3. Replace `## Cross-phase invariants` section with the archetype-generalized version

**VERIFY — structural self-check before committing:**
- Every canonical id in SC1 (`workspace`, `design`, `decisions`, `planning`, `implementation`, `review`, `refactoring`, `validation`, `documentation`, `propose`, `integrate`) resolves through the ALIAS_MAP inverse table
- `gateDecisions[propose].awaitingHarnesses` is named in the walk (not the hardcoded string `"validation"`)
- `waivers[]` and `record[]` are mentioned for waiver handling
- No hardcoded phase numbers (1→11) remain; no hardcoded phase names in invariants
- ADR-011 legacy-skip surface is NOT referenced in the walk (that's manifes-lint's job)
- P5 TODO comment is present for `assembleContract`

**REFACTOR:** tighten prose; no phase numbers in the invariants section.

### Gate

```
bash scripts/ci.sh
```

This slice touches no compiled code — `node --test engine/` and `bats test/` pass
unchanged; `shellcheck scripts/*.sh hooks/*.sh` passes (this slice touches no `.sh`
files). The gate confirms no regression was introduced.

### Commit

```
feat(run): rewire orchestrator walk — dynamic Resolution.effective[] loop, archetype-generalized invariants (ADR-009)
```
