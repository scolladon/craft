# Plan — clear backlog candidates + condition-gated items

> Source: design doc `docs/design/clear-backlog-candidates-gated.md` · ADRs `172–177`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Orientation (read once, applies to every part)

**House invariants (thread into every part):**
- **No provenance** in source/test: never write ADR / phase / backlog / part numbers
  into `engine/src/**`, `engine/test/**`, `test/**`, `skills/**`, etc. Provenance lives in
  this plan, the design doc, the ADRs, and the PR body only. (Exception: when porting an
  existing file in P11 that already contains such strings, you carry the file's behaviour,
  but do not *add* new provenance.)
- **No suppression directives** (`eslint-disable`, coverage-ignore, lint-silencers).
- **No swallowed errors** — handle, return-as-value, or rethrow with context. Engine cores
  are pure CQS: a *query* returns accumulated `string[]` errors (never throws); a *command*
  applies and returns a new value. Immutable by default, early returns, functions < 20 lines.
- **Source-hygiene gate** (`test/source-hygiene.bats`; ported to `test/source-hygiene.test.js`
  in P11). SCANNED_PATHS = `pipeline/ skills/ agents/ contracts/ templates/ engine/src/
  docs/adapters/ docs/DOD.md docs/GUIDE-customizing.md README.md`. `engine/test/`, `scripts/`,
  `.claude/`, `examples/`, `test/`, dated docs are **NOT** scanned. CLASS_A bans
  `stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise`;
  CLASS_B bans `\bgh\b|\bgithub\b`. Allowlist anchors that MUST stay valid:
  `engine/src/manifest.js:.*github-issues` (the `NON_BUILTIN_TRACKERS` constant) and the
  `docs/adapters/backlog.md` recipe. D (P7) and I (P9) keep banned vocab in unscanned paths only.

**Two count guards in `scripts/ci.sh` — pin the EXACT number per part:**
- `EXPECTED_TESTS` (`scripts/ci.sh:10`, currently `1156`) gates the **engine suite**
  (`engine/test/**/*.test.js`), asserted **twice** — once after the `cd engine && node --test`
  run (`ci.sh:18-22`) and once after the repo-root `node --test 'engine/test/**/*.test.js'`
  run (`ci.sh:~24-34`). Both read the single line 10, so bumping line 10 updates both.
- `EXPECTED_PROC_TESTS` is **introduced in P6**, gates the **process suite**
  (repo-root `test/**/*.test.js`), asserted **once**. It coexists with the legacy `bats test/`
  on `ci.sh:44` until P11 removes bats.
- Every commit must leave `bash scripts/ci.sh` green (counts match exactly). Each part below
  states: which guard, before→after, and the exact net-new with a per-file test enumeration.
  If your natural test decomposition splits differently, **adjust to land exactly the stated
  net-new** so the guard matches.

**Test-anchoring rules:**
- **Engine tests** (`engine/test/*.test.js`, ESM — `engine/package.json` has `"type":"module"`)
  run from BOTH `engine/` and repo-root cwd. Anchor any file path via
  `fileURLToPath(import.meta.url)` + `dirname` — never a repo-relative literal or `process.cwd()`.
  Pure tests (pass content strings) and `mktemp`-built fixtures are cwd-independent already.
- **Process tests** (repo-root `test/*.test.js`). There is **no repo-root `package.json`**, so
  these are **CommonJS** — use `require('node:test')`, `require('node:assert')`,
  `require('node:child_process')`, `require('node:fs')`, `require('node:path')`; `__dirname` is
  available natively (repo-root anchor = `path.resolve(__dirname, '..')`). Run the real bash
  scripts via `execFileSync('bash', [scriptPath, ...args], { encoding: 'utf8' })` and assert on
  stdout/exit (catch the thrown error to read a non-zero `status`/`stderr`) — same fidelity as
  bats, node:test orchestration. Do NOT add a root `package.json`.

**Per-part Gate** (this repo has no scoped `gates.part`; the substrate gate is the floor):
the binding gate for every part is `bash scripts/ci.sh` (it enforces both counts, shellcheck,
pipeline-lint, contracts-lint). Fast inner loop while iterating RED→GREEN is given per part.

**Ordering is load-bearing.** P1 restructures `manifest.js` (which P2 and P5 also touch); the
two `memory.js`-touching parts are sequenced F→G (P3→P4); P11 (bats→node migration) is LAST and
rebases over every prior `EXPECTED_PROC_TESTS` bump.

---

## Part 1 — B1: extract extends-validation + file-ref modules from manifest

### Context
`engine/src/manifest.js` is **895 lines** (`wc -l`), over the 800-line cap. This part is a
behavior-preserving extraction; the existing `engine/test/manifest.test.js` (which exercises the
moved code through `validateManifest`) is the proof — **net-new tests = 0, count-neutral**.

Symbols to move (exact current locations):
- **Shared file-ref leaf** → new `engine/src/manifest-file-ref.js`:
  - `checkFileRef(label, value, fileExists, errors)` (`manifest.js:~109-118`) and its private
    helpers `isAbsentPath(value)` (`:~86`) and `toStringArray(value)` (`:~95`).
  - `checkFileRef` is consumed in `manifest.js` by `validatePaths` (`:173`), `validateScripts`
    (`:188`), `validateBacklog` (`:242`), `validateMemory`, the `case 'context'` arm of
    `validateManifest` (`checkFileRef('context', …)`), and (after this part) by
    `validateExtendsBacklogAdapters` in the new module. Export `checkFileRef`. Keep
    `isAbsentPath`/`toStringArray` module-private UNLESS `grep -n 'isAbsentPath\|toStringArray'
    engine/src/manifest.js` shows a use outside `checkFileRef` — if so, export and re-import it.
- **extends-validation cluster** → new `engine/src/extends-validation.js` (`manifest.js:613-828`):
  `EXTENDS_KEYS` (`:614`), `PROFILE_EXECUTION_VALUES` (`:617`),
  `validateExtendsPhaseOptionalStrings`, `validateExtendsPhaseEntry`,
  `validateExtendsPhaseContract`, `validateExtendsPhaseStringArray`, `validateExtendsPhases`,
  `validateExtendsAgents`, `validateExtendsProfileEntry`, `validateExtendsProfiles`,
  `validateExtendsBacklogAdapters`, `validateExtends`, plus `registeredBacklogNames` (`:200-204`).
  The new module imports `checkFileRef` from `./manifest-file-ref.js`, `VALID_ARCHETYPES` from
  `./descriptor.js`, `BUNDLE_VOCAB` from `./graph.js`. Export `validateExtends` and
  `registeredBacklogNames`; keep the rest private.

Re-wiring (minimal-diff, back-compat):
- `manifest.js` imports `checkFileRef` from `./manifest-file-ref.js`, and `validateExtends`,
  `registeredBacklogNames` from `./extends-validation.js` (it calls both internally:
  `validateManifest` does `const adapterNames = registeredBacklogNames(manifest.extends)` and the
  `case 'extends'` arm calls `validateExtends`).
- **Re-export for back-compat:** add `export { registeredBacklogNames } from './extends-validation.js'`
  to `manifest.js`, because `engine/src/resolve.js:19` and `engine/test/manifest.test.js:line ~3`
  both `import { … registeredBacklogNames } from '../src/manifest.js'`. Re-exporting keeps those
  imports valid with zero edits to resolve.js / the test (truly green-by-construction).
- **Do NOT move `NON_BUILTIN_TRACKERS`** (`manifest.js:193`, holds the literal `github-issues`):
  it is consumed by `validateBacklog` which stays in `manifest.js`, and the source-hygiene
  CLASS_B allowlist anchors the exemption to `engine/src/manifest.js:.*github-issues`. Moving it
  would break that anchor.
- No import cycle: neither new leaf imports `manifest.js`; `descriptor.js`/`graph.js` do not import
  it either. Confirm with `node --check` + the test run.

**Public-surface decision:** the three new exports (`checkFileRef`, `validateExtends`,
`registeredBacklogNames`) are **engine-internal** cross-module exports. The repo has no barrel /
generated API report / exhaustiveness switch over `engine/src` exports — the only surface gate is
source-hygiene (scanned `engine/src/`). Pre-pay it: the new files carry no banned vocab (the
extends validators name `backlog-adapters`/archetypes/bundles only — clean), and every export is
consumed in-part (no dead export). After extraction, `wc -l engine/src/manifest.js` must read < 800.

### TDD steps
- This is a **refactor with no behaviour change** → no RED/GREEN cycle on new tests. The existing
  `engine/test/manifest.test.js` is the characterization harness (REFACTOR-under-green):
  1. Run `cd engine && node --test 'test/**/*.test.js'` — confirm baseline green at 1156.
  2. Create `engine/src/manifest-file-ref.js`; cut `checkFileRef` (+ its private helpers) into it;
     import it back into `manifest.js`. Run the engine suite — still 1156 green.
  3. Create `engine/src/extends-validation.js`; cut the `validateExtends*` cluster +
     `registeredBacklogNames` into it; import + re-export from `manifest.js`. Run the engine suite
     — still 1156 green.
  4. `node --check engine/src/manifest.js engine/src/manifest-file-ref.js
     engine/src/extends-validation.js engine/src/resolve.js`; confirm `wc -l engine/src/manifest.js`
     < 800.
- No `EXPECTED_TESTS` change (stays `1156`).

### Gate
`bash scripts/ci.sh` (must stay green; `EXPECTED_TESTS` unchanged at `1156`).
Fast loop: `cd engine && node --test 'test/**/*.test.js'`.

### Commit
`refactor(engine): extract extends-validation + file-ref modules from manifest`

---

## Part 2 — C: reject null-id pipeline.insert at resolve time (fail-closed)

### Context
ADR-172: a malformed insert (from `pipeline.insert` OR a folded `extends.phases` with no matching
id) yields a descriptor with no valid string `id` and currently returns `ok:true`. Close it
fail-closed, reusing the lint vocabulary.

Files & symbols:
- `engine/src/edits.js` `applyInserts(descriptors, inserts)` (`:101-140`) spreads `{...phaseData}`
  with no id check. The sibling to mirror is the pure CQS query `checkReorderApplicability(
  descriptors, reorderList)` (`:150-168`) — accumulates a `string[]`, no short-circuit, no throw.
- `engine/src/manifest.js`: `validateInsert` (`:~363-382`) emits the canonical
  `pipeline.insert[${label}].id must be a non-empty string`; `insertLabel` (`:~347-354`) builds
  `<label>` from `id ?? after ?? before ?? index`. **`insertLabel` is currently private.**
- `engine/src/resolve.js` `resolvePipeline` (`:262`): builds
  `const allInserts = [...(resolved.pipeline?.insert ?? []), ...foldResult.inserts]` (`:286`) then
  `applyInserts(foldResult.descriptors, allInserts)` (`:287`). The reorder early-return at
  `:291-302` is the exact shape to copy. `enableResult.records` (`:284`) are the records available
  before insert; `foldRegisteredPhases` (`:230-251`) produces no records.

Implementation:
1. In `manifest.js`: export `insertLabel`, and add a tiny single-source builder
   `export function insertIdError(label) { return \`pipeline.insert[${label}].id must be a
   non-empty string\`; }`. Refactor `validateInsert`'s existing message to call `insertIdError`
   (so lint-time and resolve-time strings are byte-identical). These are **engine-internal
   exports** — surface gate is source-hygiene only (no banned vocab; both consumed in-part).
2. In `edits.js`: add a pure query
   `export function checkInsertApplicability(inserts)` mirroring `checkReorderApplicability`:
   `if (!inserts || inserts.length === 0) return [];` then for each `ins`, when
   `typeof ins.id !== 'string' || ins.id.trim() === ''`, push `insertIdError(insertLabel(ins, i))`.
   Import `insertLabel`, `insertIdError` from `./manifest.js`. **No cycle:** `manifest.js` (and its
   new leaves) do not import `edits.js`; `edits.js` is imported only by `resolve.js`. Confirm with
   `node --check`. (If `node --check` surprises with a cycle, fall back to placing the query in
   `resolve.js`, which already imports `manifest.js` — but the no-cycle path is expected.)
3. In `resolve.js`: immediately before `applyInserts` (`:287`), run
   `const insertIdErrors = checkInsertApplicability(allInserts);` and early-return on non-empty,
   copying the reorder shape exactly:
   ```js
   if (insertIdErrors.length > 0) {
     return { ok: false, errors: insertIdErrors, effective: [],
              record: [...enableResult.records], gateDecisions: [], waivers: [] };
   }
   ```
   Import `checkInsertApplicability` alongside the existing `applyInserts` import.

This does **not** revert ADR-171's lint-only scope — lint stays the primary gate; this is the
resolve-time floor for the null-id phantom only.

### TDD steps
RED → GREEN in `engine/test/edits.test.js` (extend the existing file; co-locate with the
`applyInserts`/`checkReorderApplicability` describe blocks) — `checkInsertApplicability`:
1. RED: insert with no `id` key → returns one error == `insertIdError(insertLabel(...))`
   (fails: function does not exist). GREEN: implement the query.
2. empty-string `id` (`''`) → one error.
3. whitespace-only `id` (`'  '`) → one error.
4. non-string `id` (number) → one error.
5. valid non-empty string `id` → `[]` (no error).
6. mixed multi-insert (one bad, one good) → exactly one error, label points at the bad entry.

RED → GREEN in `engine/test/resolve.test.js` (extend; mirror an existing `resolvePipeline`
early-return test):
7. `pipeline.insert` carrying a null-id entry → `ok:false`, `errors` contains the canonical
   message, `effective` is `[]`, `record` surfaces the prior enable records.
8. folded `extends.phases` entry with no matching descriptor and a null/empty `id` → `ok:false`
   (same path via `allInserts`).

**Guard:** `EXPECTED_TESTS` `1156 → 1164` (net-new **8**: 6 in `edits.test.js`, 2 in
`resolve.test.js`). Edit `scripts/ci.sh:10` to `EXPECTED_TESTS=1164`.

### Gate
`bash scripts/ci.sh` (green; `EXPECTED_TESTS=1164`).
Fast loop: `cd engine && node --test 'test/edits.test.js' 'test/resolve.test.js'`.

### Commit
`feat(engine): reject null-id pipeline.insert at resolve time (fail-closed)`

---

## Part 3 — F: realpath-harden path containment against symlink escape (SECURITY)

### Context
ADR-175: two symmetric *lexical-only* containment helpers must re-check containment after
`realpathSync` and fail-closed (`return null`) on a symlink escape, while still accepting a
not-yet-created leaf (ENOENT) and rejecting a dangling-symlink leaf.

Files & symbols:
- `engine/src/policy.js` `containUserPolicyPath(root, path)` (`:~176-181`): `resolve()` +
  `startsWith(root + sep)`, returns `null` on escape. Callers treat `null` as "no user scope"
  (call site `pipeline-resolve-main.js:204`, user policy `~/.claude/craft-policy.md`).
- `engine/src/memory.js` `resolveStorePath(repoRoot, ref)` (`:37-43`): same idiom; default ref
  `.claude/craft-memory.md`; called by `load`/`save` (around `:200`, `:601`). `null` ⇒ "no store".
- The empirically pinned edge matrix (design F table, probed on Darwin 25.5.0): symlink-dir escape
  → realpath catches what lexical misses; non-existent leaf → `realpathSync` throws `ENOENT`;
  dangling-symlink leaf → `realpathSync` throws `ENOENT` (so realpath-of-parent alone would wrongly
  accept it — an `lstat` leaf guard is required).

New shared leaf `engine/src/contain.js` (imported by both helpers — "harden them together"):
```js
import { resolve, sep, dirname } from 'node:path';
import { realpathSync, lstatSync } from 'node:fs';

// walk up via realpathSync, catching ENOENT, to the deepest EXISTING ancestor's real path,
// re-appending the unresolved lexical tail. Returns an absolute real-prefixed path.
export function realExistingPrefix(absPath) { /* loop dirname() until realpathSync succeeds */ }

// fail-closed containment. Returns the lexical target on success, null on escape / symlink leaf
// / any non-ENOENT fs error (handle, never swallow-silent — caller's null path records a note).
export function containByRealpath(root, target) {
  const lexRoot = resolve(root);
  const lexTarget = resolve(target);
  if (lexTarget !== lexRoot && !lexTarget.startsWith(lexRoot + sep)) return null; // cheap lexical reject
  // leaf guard: a symlink leaf (even dangling) fails closed
  try { if (lstatSync(lexTarget).isSymbolicLink()) return null; } catch (e) { if (e.code !== 'ENOENT') return null; }
  let realRoot, realTarget;
  try { realRoot = realExistingPrefix(lexRoot); realTarget = realExistingPrefix(lexTarget); }
  catch (e) { if (e.code !== 'ENOENT') return null; /* ENOENT already handled inside realExistingPrefix */ }
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) return null;
  return lexTarget;
}
```
(Exact loop/guard shape is the implementer's, but the contract is the four bullets in ADR-175 +
the edge matrix. Errors other than ENOENT are caught and treated as fail-closed `null` — handled,
not silently swallowed.) Both helpers delegate: `containUserPolicyPath` and `resolveStorePath`
keep their signatures and `null` semantics, replacing their lexical bodies with a
`containByRealpath(...)` call.

**Public-surface decision:** `contain.js` exports (`containByRealpath`, `realExistingPrefix`) are
**engine-internal** (consumed by `policy.js` + `memory.js`). Surface gate = source-hygiene only
(no banned vocab; both consumed in-part).

### TDD steps
All symlink fixtures are built inside the test in a `mktemp` throwaway (`fs.mkdtempSync`) — **never
the worktree** — and removed in teardown. Anchor nothing to cwd.

RED → GREEN in new `engine/test/contain.test.js`:
1. in-root non-symlink path → returns the resolved lexical target unchanged.
2. symlink directory inside root pointing outside → `null`.
3. not-yet-created leaf under a real in-root dir → returns the path (accepted).
4. dangling-symlink leaf (symlink whose target is absent) → `null`.
5. `root` itself → returns `root`.
6. a non-ENOENT fs failure path (e.g. a parent that is a file, ENOTDIR) → `null` (fail-closed).
7. `realExistingPrefix` resolves to the deepest existing ancestor for a multi-segment missing tail.

RED → GREEN extend `engine/test/policy.test.js` (`containUserPolicyPath` via `contain`):
8. symlink escape → `null`. 9. valid in-root path → returned unchanged.

RED → GREEN extend `engine/test/memory.test.js` (`resolveStorePath` via `contain`):
10. symlink-dir escape → `null` (no store). 11. not-yet-created leaf under real `.claude` →
accepted. 12. valid existing path → returned.

**Guard:** `EXPECTED_TESTS` `1164 → 1176` (net-new **12**: 7 contain + 2 policy + 3 memory). Edit
`scripts/ci.sh:10` to `EXPECTED_TESTS=1176`.

### Gate
`bash scripts/ci.sh` (green; `EXPECTED_TESTS=1176`).
Fast loop: `cd engine && node --test 'test/contain.test.js' 'test/policy.test.js' 'test/memory.test.js'`.

### Commit
`fix(engine): realpath-harden path containment against symlink escape`

---

## Part 4 — G: collapse same-key memory entries on load (SECURITY, after F)

### Context
ADR (G, designer disposition): ship load-time dedupe now; document (b)/(d)/(e) as remaining
advisory-cache edges (no code). Sequenced after F (both edit `engine/src/memory.js`'s load path).

Files & symbols (`engine/src/memory.js`):
- Load path: `load`/`applyValidators` (`:199-246`) — where the collapse lands.
- Merge identity: `entryKey(concern, payload)` (`:~340`) → `keyOf(concern, payload)` joins
  `KEY_FIELDS[concern]` values with `\x00`; an entry stores its key fields at top level alongside
  `confidence` (number) and `provenance: { run, commit, date }`.
- `reconcileConcern` (`:404-441`) decays/refreshes each existing entry independently and does NOT
  enforce same-key uniqueness on load (the write surface normally maintains it; a hand-edited store
  can carry duplicates). Tie-break precedent already present: `b.entry.provenance?.date` comparison
  near `:450`.

Implementation: add a load-time collapse step (a small pure helper `dedupeByKey(concern, entries)`
or fold into `applyValidators`) keyed by `entryKey(concern, entry)`: among entries sharing a key,
keep the **highest `confidence`**; tie → **newest `provenance.date`**. Cross-concern entries with
the same payload are never collapsed (the key is namespaced by concern). Keep it immutable
(build a new array), early-return when no concern has duplicates.

Documented no-ops (prose only, NO code — record in the commit body / leave as the design's
"remaining edges"): (b) content-whitelist reject-at-write, (d) `evictToCaps` O(n²) cap-shrink,
(e) run-over-run measurement smoke.

### TDD steps
RED → GREEN extend `engine/test/memory.test.js` (co-locate with the reconcile/load describe block;
build store content as parsed objects / frontmatter strings — pure, cwd-independent):
1. two same-key entries on load collapse to one.
2. highest-confidence entry wins the collapse.
3. confidence tie → newest `provenance.date` wins.
4. no-duplicate input → unchanged (count preserved).
5. same payload under two different concerns → NOT collapsed (both survive).
6. three same-key entries collapse to one (the survivor is the max-confidence one).

**Guard:** `EXPECTED_TESTS` `1176 → 1182` (net-new **6**). Edit `scripts/ci.sh:10` to
`EXPECTED_TESTS=1182`.

### Gate
`bash scripts/ci.sh` (green; `EXPECTED_TESTS=1182`).
Fast loop: `cd engine && node --test 'test/memory.test.js'`.

### Commit
`fix(engine): collapse same-key memory entries on load`

---

## Part 5 — E: structured checkable DoD criteria verified against gate evidence (SECURITY)

### Context
ADR-174 (2a+3a): an optional structured sidecar at the existing `paths.dod` knob; free-text DoD
stays valid (back-compat). Each criterion is `kind: auto|judgment`; an `auto` criterion is
satisfied **only** by engine-recorded gate evidence (`assert.gate: <phase-id>`) or a real
`file-exists` check — **never** by executing a command the DoD supplies. This is the
injection-safety crux: a contributor editing the DoD can only *reference* evidence the engine
already produced.

Files & symbols:
- `paths.dod` is validated as a file-ref by `validatePaths` (`engine/src/manifest.js:171-174` →
  `checkFileRef`, now in `manifest-file-ref.js`). `docs/DOD.md` is the live free-text DoD.
- Frontmatter parsing precedent: `engine/src/frontmatter.js` exports
  `extractFrontmatter(content)` (`:19`, returns the YAML block string or `null`) — reuse it +
  `js-yaml` `load` (as `manifest-lint-main.js` does).
- DoD read flow today: `skills/validation/SKILL.md` Step 2 ("DoD assertion", `:12-33`) reads the
  DoD verbatim as trusted operator input and evidences engineering criteria by reading
  `gates.phase` results — never re-runs. `NO-OP(verify):` is recorded on absence. `docs/DOD.md`
  is purely durable, every-change criteria (no per-change section).
- Manifest validation seam: `validateManifest(manifest, opts)` (`manifest.js:838`) injects
  `opts.fileExists`; `engine/src/manifest-lint-main.js` builds it via `buildFileExists` (ROOT =
  `dirname(dirname(manifestAbsPath))`) and already does `readFileSync`.

New pure `engine/src/dod.js` (no I/O; imports `extractFrontmatter` from `./frontmatter.js`,
`load` from `js-yaml`):
- `parseDod(content) → { criteria: Criterion[] } | null` — `null` for no-frontmatter / no
  `criteria` key / malformed YAML (advisory; **never throws**). Structured →
  `{ criteria: [{ id, kind, text, assert? }] }`.
- `validateDodCriteria(criteria) → string[]` — pure shape check: each criterion needs a non-empty
  string `id`; `kind ∈ {auto, judgment}`; an `auto` criterion needs an `assert` with a string
  `gate` xor a string `file-exists`; `criteria` must be an array. Accumulate; never throw.
- `assertDodCriteria(criteria, evidence) → outcome[]` where
  `evidence = { gateGreen: (phaseId) => boolean | undefined, fileExists: (path) => boolean }`.
  For `kind:auto` + `assert.gate` → `gateGreen(phaseId)` (`undefined`/unknown phase ⇒ **unmet**,
  never met-by-default); + `assert.file-exists` → `fileExists(path)`. For `kind:judgment` →
  outcome `'judgment'` (human-asserted). **A stray `command`/`run` field on a criterion is
  ignored — assertion uses gate/file evidence only and never executes anything.**

Manifest wiring (honor ADR-174 "manifest.js validates the structured shape when present" without
breaking purity): add an **optional injected** `opts.readFile?: (path) => string | null` to
`validateManifest`, thread it into `validatePaths(paths, fileExists, errors, readFile)`. When
`paths.dod` is set and `readFile` is provided, `const parsed = parseDod(readFile(paths.dod)); if
(parsed) for (const e of validateDodCriteria(parsed.criteria)) errors.push(e);`. Default `readFile`
to `() => null` so existing callers/tests are unaffected (count-neutral for them). `manifest.js`
imports `parseDod`, `validateDodCriteria` from `./dod.js`. `manifest-lint-main.js` builds and
passes a real `readFile` closure (ROOT-relative, mirrors `buildFileExists`, returns `null` on miss).

Prose (SCANNED — DoD/gate/evidence vocab only; NO banned tokens):
- `skills/validation/SKILL.md` Step 2: when the DoD is structured, assert each `kind:auto`
  criterion against the engine-recorded `gates.phase` evidence it already reads / a `file-exists`
  check — never run a DoD-supplied command; document the **contributor-branch trust model**
  (criteria are claims to verify against phase evidence by phase-id, never ground truth; DoD
  content is part of the reviewed diff). `judgment` criteria stay human-asserted; absence still
  records `NO-OP(verify): …`.
- `docs/DOD.md`: a short reference note that the structured sidecar is opt-in and `auto` criteria
  are verified against engine-recorded gate evidence (not executed).

**Public-surface decision:** `dod.js` exports are **engine-internal** (consumed by `manifest.js`,
`manifest-lint-main.js`, and conceptually by the validation skill). Surface gate = source-hygiene
(scanned `engine/src/`, `skills/`, `docs/DOD.md`) — keep it clean (no `mutation`/`gh` vocab; the
DoD prose is about gates and evidence). No new manifest top-level key; no engine gate-floor change.

### TDD steps
RED → GREEN in new `engine/test/dod.test.js` (pure; pass content strings + injected evidence) —
**exactly 18 cases**, e.g.:
- `parseDod`: free-text (no frontmatter) → `null`; structured with N criteria → `{criteria}` of
  length N; malformed YAML frontmatter → `null` (no throw); frontmatter without `criteria` key →
  `null`; empty `criteria: []` → `{criteria:[]}`; criterion fields (`id/kind/text/assert`)
  preserved.
- `validateDodCriteria`: valid auto (with `assert.gate`) → no error; valid judgment → no error;
  missing `id` → error; bad `kind` → error; auto missing `assert` → error; `assert.gate`
  non-string → error; `criteria` not an array → error.
- `assertDodCriteria`: auto+gate-green → met; auto+gate-red → unmet; auto+unknown-phase → unmet;
  auto+file-exists → met/unmet per the predicate; judgment → `'judgment'`; **auto carrying a stray
  `command` field → that field ignored, outcome derived from gate evidence only (security)**.

RED → GREEN extend `engine/test/manifest.test.js` (`validateManifest` with injected `readFile`) —
**exactly 7 cases**:
- structured DoD criteria valid → accepted; criterion missing id → error surfaced; bad kind →
  error; `assert.gate` non-string → error; `assert.file-exists` non-string → error; free-text DoD
  (readFile returns plain markdown) → no criteria errors (back-compat); no `readFile` injected →
  no criteria check (existing behaviour preserved).

**Guard:** `EXPECTED_TESTS` `1182 → 1207` (net-new **25**: 18 + 7). Edit `scripts/ci.sh:10` to
`EXPECTED_TESTS=1207`.

### Gate
`bash scripts/ci.sh` (green; `EXPECTED_TESTS=1207`).
Fast loop: `cd engine && node --test 'test/dod.test.js' 'test/manifest.test.js'`.

### Commit
`feat(engine): structured checkable DoD criteria verified against gate evidence`

---

## Part 6 — A2: pin NO-OP token spelling + introduce node:test process suite

### Context
A1 is an already-satisfied honest no-op (P27 rewrote validation/architecture onto the token) — no
code, recorded in the commit body. A2 is the live work: a mechanical spelling guard. **This part
also introduces the process-suite harness** in `scripts/ci.sh`.

Canonical token literals and their owning skills (verified by grep):
| literal (grep `-F`) | owning skill file |
|---|---|
| `NO-OP(decisions):` | `skills/decisions/SKILL.md` |
| `NO-OP(refactoring):` | `skills/refactoring/SKILL.md` |
| `NO-OP(validation):` | `skills/validation/SKILL.md` |
| `NO-OP(validation:<technique-id>):` | `skills/validation/SKILL.md` |
| `NO-OP(architecture):` | `skills/architecture/SKILL.md` |
| `NO-OP(architecture:<technique-id>):` | `skills/architecture/SKILL.md` |
| `NO-OP(verify):` | `skills/validation/SKILL.md` |

New `test/no-op-token.test.js` (CommonJS process suite — see Orientation):
`const { test } = require('node:test'); const assert = require('node:assert'); const fs =
require('node:fs'); const path = require('node:path'); const ROOT = path.resolve(__dirname, '..');`
One `test()` per row above: read the owning skill file and assert
`fs.readFileSync(path.join(ROOT, skill), 'utf8').includes(literal)`. Pins spelling, not prose.

**ci.sh wiring (the introduction):** insert a process-suite block modeled exactly on the pi block
(`ci.sh:36-42`), placed after the pi block and **before** the existing line 44 (`bats test/ …`),
which stays unchanged (the 12 `.bats` files keep running via bats during the transition; the glob
`test/**/*.test.js` matches only the new `.test.js`, never `.bats`, and never `engine/test/`):
```sh
EXPECTED_PROC_TESTS=7

proc_output="$(node --test 'test/**/*.test.js' 2>&1)" && proc_status=0 || proc_status=$?
echo "$proc_output"
[ "$proc_status" -eq 0 ] || { echo "ci: process node --test failed (exit ${proc_status})" >&2; exit "$proc_status"; }
actual_proc_tests="$(printf '%s\n' "$proc_output" | awk '/^# tests / {print $3}')"
[ "$actual_proc_tests" = "$EXPECTED_PROC_TESTS" ] || { echo "ci: process test count drift — expected ${EXPECTED_PROC_TESTS}, got ${actual_proc_tests}" >&2; exit 1; }
```

**Source-hygiene:** `test/` is unscanned. No `EXPECTED_TESTS` change (no engine test).

### TDD steps
- RED: add `EXPECTED_PROC_TESTS=7` + the proc block to `ci.sh` and create
  `test/no-op-token.test.js` with the 7 tests. Run `node --test 'test/**/*.test.js'` — confirm 7
  tests pass and the `# tests 7` line matches.
- If a literal is absent from its owning skill, the test fails RED → that is the guard working;
  do NOT edit skills to satisfy it unless a token genuinely drifted (it should not — these are the
  pinned current spellings).
- GREEN: `bash scripts/ci.sh` green with both `bats test/` (legacy) and the new proc block.

**Guard:** `EXPECTED_PROC_TESTS` **introduced = 7**.

### Gate
`bash scripts/ci.sh` (green; `EXPECTED_TESTS=1207`, `EXPECTED_PROC_TESTS=7`).
Fast loop: `node --test 'test/no-op-token.test.js'`.

### Commit
`test(craft): pin NO-OP token spelling + introduce node:test process suite`

---

## Part 7 — D: guard per-hunk mutation scope is one comma-separated --mutate

### Context
Craft dogfoods its validation technique via `.claude/workflow.md` (UNSCANNED — may name the
technique freely). The validated finding (advisory memory): two separate `--mutate` flags silently
drop all but the last, faking a clean score; a per-hunk run must emit ONE combined
`--mutate "fileA:r1,fileB:r2"`.

`.claude/workflow.md` current shape (frontmatter): `phases.validation.harness.techniques: [{ id:
mutation, run: "npm --prefix engine run mutation", … }]` plus prose at `:16-20` describing the
technique.

**Source-hygiene correction (honor it):** the guard does NOT go in `skills/validation/SKILL.md`
(P27 made it technique-agnostic; `mutation`/`mutant` would trip CLASS_A). The contract lives in
`.claude/workflow.md`; the test lives in `test/` — both unscanned. **No allowlist change.**

Implementation:
1. Extend `.claude/workflow.md` prose with the contract sentence: per-hunk scopes emit ONE combined
   `--mutate "fileA:r1,fileB:r2"` (two separate `--mutate` flags silently drop all but the last);
   verify the instrumented mutant count is plausible (≥ the adjacent-hunk count) before trusting a
   green. Use a fixed, greppable phrasing the test can pin.
2. New `test/mutation-scope.test.js` (CommonJS; reads `.claude/workflow.md` via the `ROOT` anchor):
   - test 1: `.claude/workflow.md` contains the combined-single-`--mutate` contract sentence
     (grep the fixed phrasing).
   - test 2: it documents the mutant-count plausibility check (grep the fixed phrasing).

### TDD steps
- RED: write `test/mutation-scope.test.js` (2 tests) asserting the contract sentences are present;
  run `node --test 'test/mutation-scope.test.js'` → fails (sentences not yet in workflow.md).
- GREEN: add the two fixed contract sentences to `.claude/workflow.md`; tests pass.
- Bump `scripts/ci.sh` `EXPECTED_PROC_TESTS` `7 → 9`.

**Guard:** `EXPECTED_PROC_TESTS` `7 → 9` (net-new **2**).

### Gate
`bash scripts/ci.sh` (green; `EXPECTED_PROC_TESTS=9`).
Fast loop: `node --test 'test/mutation-scope.test.js'`.

### Commit
`test(craft): guard per-hunk mutation scope is one comma-separated --mutate`

---

## Part 8 — H: backlog-lint and design-lint structure linters

### Context
Model: `scripts/plan-lint.sh` — `awk` required-heading presence, `exit 2` + diagnostic on a missing
section, exit 0 with a count summary on pass; parameterized `REQUIRED="A|B|C"`. `scripts/ci.sh:44`
shellchecks `scripts/*.sh` (so the new scripts must be shellcheck-clean). Target structures:
- `templates/backlog.md` (shipped P4) defines the backlog structure: `## Status at a glance`,
  `## Done`, `## Next`, `## Then`, `## Deferred / parked`, `## Notes`, plus the `SoT —` pointer
  line and `Surface gate` line. **Read `templates/backlog.md` to extract the exact required
  headings** before writing `REQUIRED`.
- `templates/design.md` defines the design-doc structure: `## Context`, `## Requirements`,
  `## Design`, `## Decision candidates`, `## Test strategy`, `## Out of scope`. **Read
  `templates/design.md`** to confirm the exact headings.

**Brief correction (honor it):** these are bash markdown-structure linters (heading presence), a
different layer from B's JS `checkFileRef`; H reuses nothing from B and is order-independent.

Implementation:
1. `scripts/backlog-lint.sh <file>` and `scripts/design-lint.sh <file>` — awk required-heading
   checks in the `plan-lint.sh` house style (structure-only: heading presence/order, not content),
   `exit 2` + diagnostic on a missing section, exit 0 + count summary on pass. Shellcheck-clean.
2. `test/backlog-lint.test.js` + `test/design-lint.test.js` (CommonJS; `execFileSync('bash',
   [script, fixture])`, catch for non-zero `status`). Good + section-missing fixtures under
   `test/fixtures/` (create `test/fixtures/backlog-good.md`, `test/fixtures/backlog-missing.md`,
   `test/fixtures/design-good.md`, `test/fixtures/design-missing.md`).
3. Wire both linters into `scripts/ci.sh:44`'s chain (append `&& bash scripts/backlog-lint.sh
   <target> && bash scripts/design-lint.sh <target>` — lint this repo's own `BACKLOG.md` and the
   design template/doc, or whatever target the chain already implies; keep it shellcheck-safe).
   The new scripts are picked up by the existing `shellcheck scripts/*.sh`.

### TDD steps
RED → GREEN, `test/backlog-lint.test.js` (3 tests):
1. good fixture → exit 0.
2. section-missing fixture → exit 2 + names the missing section in stderr.
3. good fixture → stdout carries the count summary.

RED → GREEN, `test/design-lint.test.js` (3 tests):
4. good fixture → exit 0. 5. section-missing fixture → exit 2. 6. good fixture → summary on stdout.

(Write the failing tests first against the not-yet-created scripts; implement the awk linters to
green; confirm `shellcheck scripts/backlog-lint.sh scripts/design-lint.sh` is clean.)

**Guard:** `EXPECTED_PROC_TESTS` `9 → 15` (net-new **6**).

### Gate
`bash scripts/ci.sh` (green; `EXPECTED_PROC_TESTS=15`; shellcheck clean).
Fast loop: `node --test 'test/backlog-lint.test.js' 'test/design-lint.test.js'`.

### Commit
`feat(craft): backlog-lint and design-lint structure linters`

---

## Part 9 — I: github-issues backlog adapter via extends.backlog-adapters

### Context
ADR-176 (4b): ship a first-class *named* backlog source through the P14 `extends.backlog-adapters`
surface — zero engine change; the host CLI lives ONLY in unscanned `examples/`; scanned docs use a
GENERIC pointer (no banned token). Model the example on `examples/derived-plugin/workflow.md`
(`extends:` block) and `examples/backlog-custom/workflow.md` (the tracker recipe + how
`resolve`/`complete` map to a script).

How a named adapter resolves (already built): `manifest.js` `registeredBacklogNames(extends)`
collects `extends.backlog-adapters[].name`; `validateBacklog` accepts those names as
`backlog.source`; `validateExtendsBacklogAdapters` checks each `{name, ref}` and the `ref` must
exist at lint time (`checkFileRef`). So a manifest with `backlog: { source: github-issues, ref:
"#42" }` + `extends.backlog-adapters: [{ name: github-issues, ref: ./resolve.sh }]` lints clean
when `resolve.sh` exists beside it.

Deliverables (all under unscanned `examples/`):
- `examples/backlog-github-issues/workflow.md` — the adapter manifest fragment (the `extends.
  backlog-adapters` registration + a `backlog.source: github-issues` selection) + prose. The
  example must pass `manifest-lint` (the existing `examples-lint` discipline lints every
  `examples/*/workflow.md`).
- `examples/backlog-github-issues/resolve.sh` — the custom resolver wrapping the host CLI with an
  argv array and an id-form allowlist `^#?\d+$`; `resolve <id>` / `complete <id> <refs>`. The host
  CLI token appears ONLY here.
- `examples/backlog-github-issues/README.md` — usage; plus an index entry in
  `examples/README.md` (under the backlog/Tier rows).
- `docs/GUIDE-customizing.md` (SCANNED): a GENERIC pointer only — "a tracker adapter, see
  `examples/`" — **NO `gh`/`github` literal**. (The existing allowlisted `file / gh /` hexagon
  label at `:58` is untouched.) `docs/adapters/backlog.md`'s existing allowlisted recipe is NOT
  modified (no new gh added there).

New `test/examples-github-adapter.test.js` (CommonJS; SEPARATE file — does NOT collide with the
existing `test/examples-lint.bats` that P11 ports). Anchor via `ROOT`. Uses `execFileSync('bash',
['scripts/manifest-lint.sh', exampleManifest])` for the lint assertion.

**Public-surface decision:** no new engine export; the named source resolves through existing
`registeredBacklogNames`. The only surface is the example structure (pinned by the new test) and
the generic GUIDE pointer. **Source-hygiene:** `gh`/`github` confined to `examples/`; the test
file in `test/` may name them (unscanned); GUIDE pointer carries no banned token — **no allowlist
entry added.**

### TDD steps
RED → GREEN, `test/examples-github-adapter.test.js` (4 tests):
1. `examples/backlog-github-issues/workflow.md` exists and contains the `extends.backlog-adapters`
   registration.
2. `examples/backlog-github-issues/resolve.sh` exists and is executable.
3. `examples/backlog-github-issues/README.md` exists AND `examples/README.md` carries an index
   entry pointing at it.
4. `manifest-lint.sh` on the example manifest exits 0 (the registered `github-issues` name resolves
   as a valid source).

(Write the 4 failing tests; create the example dir + files + GUIDE pointer to green. Confirm
`bash scripts/ci.sh` still passes the source-hygiene gate — no banned token entered a scanned path.)

**Guard:** `EXPECTED_PROC_TESTS` `15 → 19` (net-new **4**). No `EXPECTED_TESTS` change.

### Gate
`bash scripts/ci.sh` (green; `EXPECTED_PROC_TESTS=19`; source-hygiene clean).
Fast loop: `node --test 'test/examples-github-adapter.test.js'`.

### Commit
`feat(examples): github-issues backlog adapter via extends.backlog-adapters`

---

## Part 10 — J: deterministic init land-helper + named-config example

### Context
Designer disposition: ship the land helper (c) + the named-config example (d) now; defer
headless/answer-file (a) and merge-into-existing (b) (document as remaining edges). This part
**splits across both guards**: the engine helper bumps `EXPECTED_TESTS`; the example check bumps
`EXPECTED_PROC_TESTS`.

Files & symbols:
- The land sequence is prose-only in `skills/init/SKILL.md` Step 3 (temp-lint via
  `scripts/manifest-lint.sh "$manifest_tmp"`, `:202-212`) → Step 4 (`mv "$manifest_tmp"
  "$manifest_final"`, `:218-224`). The review found the move-gate is prose-only.
- Bin pattern to mirror: `engine/src/init-config-main.js` (exports `main(argv, io)`, returns an exit
  code, writes to `io.stdout`/`io.stderr`) + thin wrapper `engine/bin/init-config.js`
  (`if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2),
  {stdout, stderr}))`). `engine/src/init-config.js` `resolveConfigPath` returns
  `{ok:true, path} | {ok:false, error}` — the value-shaped style to follow.

Implementation:
1. New `engine/src/init-land.js` — pure-ish core `land({ tmpPath, finalPath }, deps)`:
   run `deps.lint(tmpPath)`; on exit 0 → `deps.rename(tmpPath, finalPath)` and return
   `{ ok: true, path: finalPath }`; on non-zero → return `{ ok: false, errors }` and **never
   move**; if `deps.rename` throws → catch and return `{ ok: false, errors: [<message with
   context>] }` (handle-or-return; **never swallow, never leave a half-move**). `deps = { lint,
   rename }` injected (no direct fs/child_process in the core).
2. New `engine/src/init-land-main.js` (mirror `init-config-main.js`): `main(argv, io)` parses
   `argv[0]=tmpPath`, `argv[1]=finalPath`; builds real deps — `lint` = `execFileSync('bash',
   [manifestLintScript, tmpPath])` mapped to an exit code, `rename` = `fs.renameSync`; calls
   `land`; maps the result to an exit code + `io` writes. Thin wrapper `engine/bin/init-land.js`
   (the `init-config.js` bin shape).
3. `skills/init/SKILL.md`: replace the inline Step 3+4 lint-then-`mv` prose with a call to the bin
   (`node "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-land.js" "$manifest_tmp" "$manifest_final"`),
   keeping the existing abort/cleanup semantics. (SCANNED — no banned vocab; init prose is clean.)
4. New `examples/named-config/` (unscanned) — a sample proving the `craft:init` →
   `/craft:run --config <name>` generate→consume loop: a valid named-config manifest + README. Must
   pass `manifest-lint` (examples-lint discipline).
5. Document deferred (a)/(b) as remaining edges in the commit body (no code).

**Public-surface decision:** `init-land.js` `land`, `init-land-main.js` `main`, and
`engine/bin/init-land.js` are **engine-internal** (the init skill is the only consumer). Surface
gate = source-hygiene (scanned `engine/src/`, `skills/`) — clean. No barrel/API report.

### TDD steps
RED → GREEN, new `engine/test/init-land.test.js` (`land` with injected `deps`; cwd-independent) —
5 tests:
1. lint-pass → `deps.rename(tmp,final)` called once; returns `{ok:true, path:finalPath}`.
2. lint-fail (non-zero) → `rename` NOT called; returns `{ok:false, errors}`.
3. `deps.rename` throws → returns `{ok:false}` with the error surfaced (not thrown, not swallowed).
4. `deps.lint` receives `tmpPath` (correct argument threaded).
5. on lint-fail the final path is never written (no move side-effect).

RED → GREEN, new `engine/test/init-land.bin.test.js` (`execFileSync('node', [binPath, …])`,
anchored via `fileURLToPath(import.meta.url)`; build tmp/final in `mkdtempSync`) — 3 tests:
6. two valid argv paths, lint passes → exit 0; file moved.
7. lint fails → non-zero exit; no move.
8. missing argv → usage error, non-zero exit.

RED → GREEN, new `test/named-config-example.test.js` (CommonJS) — 2 tests:
9. `examples/named-config/` exists with a manifest that `manifest-lint.sh` passes (exit 0).
10. the named-config README/structure is present (pin the example shape).

**Guards (split):**
- `EXPECTED_TESTS` `1207 → 1215` (net-new **8**: 5 + 3). Edit `scripts/ci.sh:10` to
  `EXPECTED_TESTS=1215`.
- `EXPECTED_PROC_TESTS` `19 → 21` (net-new **2**).

### Gate
`bash scripts/ci.sh` (green; `EXPECTED_TESTS=1215`, `EXPECTED_PROC_TESTS=21`).
Fast loop: `cd engine && node --test 'test/init-land.test.js' 'test/init-land.bin.test.js'` and
`node --test 'test/named-config-example.test.js'`.

### Commit
`feat(engine): deterministic init land-helper + named-config example`

---

## Part 11 — K: migrate bats suite to node:test, drop bats dependency (LAST)

### Context
ADR-177 (operator override): migrate **all-at-once**, LAST. Port the **12** existing `test/*.bats`
(**96** `@test` cases total) → `test/*.test.js` (CommonJS — see Orientation), each running the REAL
bash script/hook via `execFileSync('bash', [script, …])` and asserting stdout/stderr/exit
case-for-case. node:test orchestrates; bash still executes (no fidelity loss). The 12 files and
their exact `@test` counts (the port must reproduce each — count is load-bearing):

| bats file | @test | → ported file |
|---|---|---|
| `test/archetype-inference.bats` | 1 | `test/archetype-inference.test.js` |
| `test/detect-ecosystem.bats` | 15 | `test/detect-ecosystem.test.js` |
| `test/examples-lint.bats` | 2 | `test/examples-lint.test.js` |
| `test/hermetic-suite.bats` | 2 | `test/hermetic-suite.test.js` |
| `test/hooks.bats` | 13 | `test/hooks.test.js` |
| `test/manifest-lint.bats` | 25 | `test/manifest-lint.test.js` |
| `test/p10-structure.bats` | 17 | `test/p10-structure.test.js` |
| `test/p20-dod.bats` | 4 | `test/p20-dod.test.js` |
| `test/p22-memory.bats` | 5 | `test/p22-memory.test.js` |
| `test/smoke.bats` | 1 | `test/smoke.test.js` |
| `test/source-hygiene.bats` | 2 | `test/source-hygiene.test.js` |
| `test/worktree.bats` | 9 | `test/worktree.test.js` |
| **total** | **96** | |

Porting notes:
- Each `@test` → one `test()` (flat, no subtests) so the ported count equals the `@test` count.
  Read each `.bats` file; translate `run <cmd>` + `[ "$status" -eq N ]` + `[ "$output" = … ]` into
  `execFileSync` (catch the thrown error to read `e.status`/`e.stdout`/`e.stderr` on non-zero) +
  `assert`. Reproduce helpers under `test/helpers/*` (e.g. `test/helpers/manifest-lint`) as small
  CommonJS modules or inline functions. Build all fixtures in `mkdtempSync` (preserve the
  `$BATS_TMPDIR`/`$BATS_TEST_DIRNAME` hermeticity).
- `test/source-hygiene.bats` carries the SCANNED_PATHS array, CLASS_A/CLASS_B patterns, and the
  reviewed allowlist filters — reproduce them **exactly** (same scanned paths, same patterns, same
  `grep -vE` allowlist anchors) so the gate keeps biting identically. Do not introduce new
  provenance strings into the ported titles (rephrase to Given/When/Then without phase/part numbers
  where the original used them).
- Delete each `.bats` file as it is ported (one suite, one commit).

ci.sh + setup rewire:
- `scripts/ci.sh:44`: remove `bats test/ && ` from the head of the chain; keep `shellcheck
  scripts/*.sh hooks/*.sh && node engine/bin/pipeline-lint.js … && … contracts-lint.js contracts`
  (plus the `backlog-lint`/`design-lint` additions from P8). The repo-root `node --test
  'test/**/*.test.js'` proc block (added in P6) now ALSO matches the 12 ported files.
- `scripts/ci.sh` `EXPECTED_PROC_TESTS`: set to the FINAL total **`21 → 117`** (21 process tests
  from P6–P10 + 96 ported). Edit the single line.
- `.github/workflows/ci.yml`: the step `Install bats, shellcheck, jq` (`apt-get install -y bats
  shellcheck jq`) → drop `bats`, keep `shellcheck jq` (rename the step accordingly). bats is no
  longer a CI prerequisite. (There is no `bats` entry in any `package.json` — the only declaration
  is this apt-get line; confirm with `grep -rn '\bbats\b' .github/ scripts/ package.json
  engine/package.json`.)

**Source-hygiene:** the ported `test/*.test.js` live in unscanned `test/` (free to name
`mutation`/`gh` where the originals did — e.g. the source-hygiene patterns themselves).

### TDD steps
- This is a **behavior-preserving port** (REFACTOR-under-green): the assertions already exist; the
  proof is that the ported suite passes case-for-case and `# tests` totals 96 across the new files.
  1. Baseline: `bash scripts/ci.sh` green (`EXPECTED_PROC_TESTS=21`, `bats test/` still on line 44).
  2. Port the 12 files one at a time; after each, run `node --test 'test/**/*.test.js'` and watch
     the running total climb (the legacy `bats test/` keeps the deleted suite's coverage until the
     ci.sh flip, since bats only sees remaining `.bats`).
  3. When all 12 are ported (proc `# tests` == 117): flip `ci.sh:44` (drop `bats test/`), set
     `EXPECTED_PROC_TESTS=117`, edit `ci.yml` to drop bats.
  4. `bash scripts/ci.sh` green: engine `EXPECTED_TESTS=1215` (unchanged), proc
     `EXPECTED_PROC_TESTS=117`, no `bats` invocation remains.

**Guard:** `EXPECTED_PROC_TESTS` `21 → 117` (net-new **96** ported). `EXPECTED_TESTS` unchanged at
`1215`.

### Gate
`bash scripts/ci.sh` (green; `EXPECTED_TESTS=1215`, `EXPECTED_PROC_TESTS=117`; no `bats` in ci.sh
or ci.yml). Confirm `grep -rn '\bbats\b' scripts/ci.sh .github/workflows/ci.yml` returns nothing.
Fast loop: `node --test 'test/**/*.test.js'`.

### Commit
`test(craft): migrate bats suite to node:test, drop bats dependency`
