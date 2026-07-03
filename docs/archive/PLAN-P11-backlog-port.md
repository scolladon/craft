# Plan — backlog-sot-adapter (P11)

> Source: design doc `docs/DESIGN-P11-backlog-port.md` · ADRs `054, 055, 056, 057, 058, 059, 060`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  mutation/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.

## Slicing rationale (read once, applies to all three)

Three parts, derived from the design's two-layer split (`Design → CORE deltas` + `PORT/ADAPTER deltas`):

- **Part 1 — `validateBacklog`** (`engine/src/manifest.js`, mutation-scored). Its node tests
  fold in (FEATURE code, no standalone test part). The bats fixtures + the `valid-basic.workflow.md`
  migration fold into **this** part — NOT a separate test-infra part — because they exercise the
  *same* `validateBacklog` behaviour through the `manifest-lint.js` CLI, and because ADR-054's
  hard-reject makes the existing `backlog: my-backlog` bats fixture go red the instant `validateBacklog`
  lands. Migrating `valid-basic` must be atomic with the validator or the phase-boundary `bats test/`
  has a red window. Folding them costs nothing and removes that window.
- **Part 2 — `backlogSourceOf` + `buildManifestRecords`** (`engine/src/resolve.js`, mutation-scored).
  Its node tests + the S6 scenario strengthen + the S6 fixture migration fold in. Part 1 leaves
  `resolve.js` untouched, so S6 (a bare-string fixture flowing only through `resolvePipeline`, never
  `validateManifest`) stays green after Part 1; Part 2 migrates the S6 fixture and rewrites
  `buildManifestRecords` together, atomically — no cross-part red window.
- **Part 3 — adapter spec doc + skill wiring** (`docs/adapters/backlog.md`, `skills/run/SKILL.md`,
  `skills/documentation/SKILL.md`). Docs-only, standalone, **no `src/` delta**, **no `EXPECTED_TESTS`
  bump**. Per the template's exception, a docs/prose part with no implementation part to fold into is
  legitimately standalone.

**Public-surface decision (settled up front):** both new symbols — `validateBacklog` and
`backlogSourceOf` — are **internal helpers**, NOT new public/barrel exports. `validateBacklog` is a
file-local helper in `manifest.js` exercised through the already-exported `validateManifest`;
`backlogSourceOf` is a file-local helper in `resolve.js` exercised through the already-exported
`resolvePipeline`. `engine/src/index.js` (the barrel) re-exports only `validateManifest` /
`resolvePipeline` and is **NOT touched** by any part. The one genuinely new public artifact is the doc
surface `docs/adapters/backlog.md` + its two skill pointers, owned by Part 3. There is no
barrel/facade/exhaustiveness/API-report/registry gate to pre-pay for either helper.

**Provenance rule (all parts):** no phase/ADR/backlog numbers in source or test (design docs carry
provenance). Error strings and test titles name behaviour, never `ADR-0xx`.

## Part 1 — validateBacklog: object-shape + two-source validation (manifest.js)

### Context

**Mutation-scored** (`engine/src/**/*.js`, per `engine/stryker.conf.json`).

**File to edit — `engine/src/manifest.js`** (343 lines; read it whole). House style: each top-level key
gets a `validate<Key>(value, …, errors)` helper that **accumulates** into `errors[]`, **never throws**,
**never short-circuits**. Mirror `validateModels` (lines 97–107), `validateGates` (114–121),
`validatePr` (128–135), `validateScripts` (143–151).

Exact anchors:

- `backlog` is ALREADY in `TOP_KEYS` (line 11–14, first entry). Do NOT add it again.
- The frozen-set constants live at lines 42–52 (`MODELS_KEYS`, `PIPELINE_KEYS`, `CONVERGENCE_STRINGS`).
  Add `const BACKLOG_SOURCES = Object.freeze(new Set(['file', 'custom']));` alongside them (a
  `/** … */` one-line JSDoc, no provenance refs).
- `checkFileRef(label, value, fileExists, errors)` (lines 82–90) is the existing path-existence helper:
  it skips absent sentinels, coerces scalar/array via `toStringArray`, and pushes
  `` `${label} references missing file: ${path}` `` on a miss. Route a **`file`** source's `ref` through
  it as `checkFileRef('backlog.ref', ref, fileExists, errors)`. Do NOT route a **`custom`** ref through
  it.
- The rename-hint precedent is `validateModels` lines 100–104 — the `mutation-triager` → use
  `validation-triager` hint (`errors.push(...)` + `continue`). Mirror its shape for the non-built-in
  tracker hint.
- The switch is at lines 315–338. `backlog` currently falls through (the comment at line 337,
  `// backlog, paths, retrieval, execution: recognized; no sub-validation`). ADD a
  `case 'backlog': validateBacklog(value, fileExists, errors); break;` and remove `backlog` from that
  trailing comment (leaving `paths, retrieval, execution`).
- `validateManifest` signature (lines 303–342): `(manifest, opts)`; `fileExists` defaults to `() => true`
  when `opts?.fileExists` is absent (line 306). Do not change the signature.

**`validateBacklog(backlog, fileExists, errors)` — required behaviour (design "CORE deltas" + the
contract matrix):**

1. Non-object `backlog` (string, array, number, boolean) → push exactly `backlog must be an object { source, ref }`
   and **return** (nothing else to validate). A `null`/`undefined` backlog never reaches here:
   `validateManifest` iterates `Object.entries(manifest)`, so a missing key emits no entry, and a
   `null` value would be caught — but to match house style, treat non-object via
   `typeof backlog !== 'object' || backlog === null || Array.isArray(backlog)` → the must-be-object error.
2. Object form: iterate `Object.keys(backlog)`; an unknown sub-key (anything other than `source` /
   `ref`) → push `` `unknown backlog field: ${k}` `` (accumulate; do not `continue`-skip the rest of the
   validation).
3. `source`:
   - Missing `source` → treat as a config error: push a named error
     (`backlog must declare a source (one of file, custom)`).
   - `source` present but `∉ BACKLOG_SOURCES`:
     - If it is one of the non-built-in trackers `github-issues` / `jira` / `linear`, push the targeted
       hint **mirroring the `mutation-triager` precedent**:
       `` `backlog source '${source}' is not built-in — use source: custom with a ref to a resolver script` ``
       (this is the *only* error for that source — do NOT also push the generic unknown-source error).
     - Otherwise push `` `unknown backlog source: ${source} (expected one of file, custom)` ``.
4. `ref`:
   - For `source === 'file'`: route `ref` through `checkFileRef('backlog.ref', ref, fileExists, errors)`
     (an absent ref is the current-path default per the matrix — `checkFileRef` already no-ops on absent
     sentinels via `isAbsentPath`, so a `file` with no `ref` is **valid**, no error).
   - For `source === 'custom'`: `ref` is required-and-non-empty but NOT path-checked. Missing/empty
     `ref` (`undefined`, `null`, `''`, whitespace-only) → push
     `` `backlog.ref is required for source custom` ``. A non-empty string `ref` passes with NO
     `fileExists` call (a missing `custom` script is a *runtime* blocker, not a config error).
   - For an unknown/missing `source` (already errored in step 3), do not additionally validate `ref`
     against a source mechanism — but DO still emit the unknown-field check from step 2.

**Why each branch matters for mutation adequacy:** the `file`-vs-`custom` ref routing is the highest-value
mutant — a mutant that routes `custom.ref` through `checkFileRef` must be killed by a test that passes a
**non-existent** `custom.ref` and still expects `ok: true`. The source-set membership and the hint string
are string-literal mutant targets (kill with exact-substring assertions).

**Test file — `engine/test/manifest.test.js`** (read it whole, 1116+ lines). Conventions:
`import { validateManifest } from '../src/manifest.js'`; `const ALWAYS_EXISTS = () => true` (line 10),
`const NEVER_EXISTS = () => false` (line 11); each test is `test('Given … when … then …', () => { const sut = validateManifest; … })`;
AAA body. The rename-hint precedent test pair is lines 684–705 (`validation-triager` ok +
`mutation-triager` rejected-with-`validation-triager`-substring) — copy that exact shape.

**MIGRATION (REQUIRED, ADR-054 — first of three sites):** line 53 in the "all known top-level keys"
test (lines 50–69) is `backlog: 'my-backlog'`. A bare string now ERRORS, so this test would flip red.
Change line 53 to `backlog: { source: 'file', ref: null }` (a `file` source with absent ref is valid
under `ALWAYS_EXISTS`, and even under a real `fileExists` an absent ref no-ops). Keep the test's
`assert.equal(result.ok, true)`.

**Bats fixtures — `test/fixtures/manifest/`** (read `valid-basic.workflow.md`, one `invalid-*` for the
shape, and `test/manifest-lint.bats`). Key facts:

- `manifest-lint.js` (`engine/bin/manifest-lint.js`) builds `fileExists` via `buildFileExists`: it
  resolves a manifest-relative `ref` against `ROOT = dirname(dirname(manifestAbsPath))`. For a fixture
  at `test/fixtures/manifest/<name>.workflow.md`, `ROOT = test/fixtures/`. Existing stub files live at
  `test/fixtures/manifest/stubs/a.md` and `…/b.md`, referenced in fixtures as `manifest/stubs/a.md`
  (see `valid-inline-array.workflow.md`, `valid-quoting.workflow.md`). **Use `manifest/stubs/a.md` as
  the existing `file.ref` in good fixtures and a path like `manifest/stubs/nope.md` for the bad-ref
  fixture.**
- `run_lint <fixture>` (helper `test/helpers/manifest-lint.bash`) runs `manifest-lint.sh`; stderr merges
  into `$output`. Exit 0 ⇒ `*"valid."*`; exit 2 ⇒ `*"INVALID manifest"*` + the specific error substring.
- Invalid-fixture shape precedent: `invalid-renamed-agent-model.workflow.md` is just frontmatter
  (`---\nmodels: { mutation-triager: sonnet }\n---\n# …`). New fixtures follow that minimal shape.

**MIGRATION (REQUIRED, ADR-054 — second site):** `test/fixtures/manifest/valid-basic.workflow.md`
line 2 is `backlog: my-backlog`. Under the hard-reject this flips the green
`"Given a valid basic manifest … exits 0 … valid."` bats test (lines 27–31) red. Change line 2 to
`backlog: { source: file, ref: manifest/stubs/a.md }`. (yaml inline-map form, matching the file's other
inline maps like `pr: { creator: auto }`.)

**New bats fixtures (design Test strategy) + their tests in `test/manifest-lint.bats`:**

| fixture file | frontmatter `backlog:` | expect |
|---|---|---|
| `valid-backlog-file.workflow.md` | `{ source: file, ref: manifest/stubs/a.md }` | exit 0, `valid.` |
| `valid-backlog-custom.workflow.md` | `{ source: custom, ref: ./scripts/backlog.sh }` (ref NOT path-checked → passes even though no such file under `test/fixtures/`) | exit 0, `valid.` |
| `invalid-backlog-string.workflow.md` | `my-backlog` (bare string) | exit 2, `INVALID manifest` + `must be an object` |
| `invalid-backlog-file-bad-ref.workflow.md` | `{ source: file, ref: manifest/stubs/nope.md }` | exit 2, `INVALID manifest` + `references missing file` |
| `invalid-backlog-custom-no-ref.workflow.md` | `{ source: custom }` | exit 2, `INVALID manifest` + `ref is required` |
| `invalid-backlog-unknown-source.workflow.md` | `{ source: bogus, ref: x }` | exit 2, `INVALID manifest` + `unknown backlog source` |
| `invalid-backlog-linear.workflow.md` | `{ source: linear, ref: x }` | exit 2, `INVALID manifest` + `use source: custom` |

Place the new bats `@test` blocks after the existing renamed-agent-model block (end of file, lines
131–137), under a new comment banner `# --- backlog source/shape validation ---`.

**`scripts/ci.sh` count bump:** this part adds N node `test()` cases to `manifest.test.js` (the
migrated line-53 case is edited-in-place, NOT new; count only the genuinely NEW `test(...)` calls you
write). `EXPECTED_TESTS=423` at `scripts/ci.sh:10` MUST become `423 + N` in this part. bats tests are
NOT counted in `EXPECTED_TESTS` (they have their own `bats test/` gate). Compute N from the GREEN test
list below.

### TDD steps

RED (write these `test()` cases in `engine/test/manifest.test.js` first; each fails because
`validateBacklog` does not yet exist / the switch still falls through, so the rejection/hint never
fires and `result.ok` is wrongly `true` or the expected substring is absent):

1. `Given backlog { source: file, ref: <existing> }, when validateManifest runs, then ok:true` —
   `fileExists: ALWAYS_EXISTS`. *Fails today:* passes vacuously (no validation) — kept as the
   characterization anchor; will fail only if a later mutant breaks it. (Counts as 1 new test.)
2. `Given backlog { source: custom, ref: <non-empty> }, when validateManifest runs, then ok:true` with
   `fileExists: NEVER_EXISTS` AND assert no error mentions `references missing file` (pins that
   `custom.ref` is NOT path-checked). *Fails today:* `ok` is true but the assertion exists to kill the
   `checkFileRef`-on-custom mutant later; against the unimplemented validator it passes vacuously —
   write it as a strict `assert.deepEqual(result, { ok: true, errors: [] })` so it is meaningful.
3. `Given backlog as a bare string, when validateManifest runs, then error contains "backlog must be an object"`.
   *Fails today:* `ok:true`, no such error (the bare string falls through). (ADR-054 hard-reject pin.)
4. `Given backlog as an array, when validateManifest runs, then error contains "backlog must be an object"`.
   *Fails today:* `ok:true`.
5. `Given backlog { source: bogus, ref: x }, when validateManifest runs, then error contains "unknown backlog source"`.
   *Fails today:* `ok:true`.
6. `Given backlog { source: linear, ref: x }, when validateManifest runs, then error contains "use source: custom"`
   (the hint) AND does NOT contain `unknown backlog source` (the hint replaces the generic error).
   Add sibling cases for `github-issues` and `jira` (same hint substring). *Fails today:* `ok:true`.
7. `Given backlog { source: file, ref: <missing> }, when validateManifest runs, then error contains "references missing file"`
   with `fileExists: NEVER_EXISTS`. *Fails today:* `ok:true`.
8. `Given backlog { source: custom } with no ref, when validateManifest runs, then error contains "ref is required"`.
   *Fails today:* `ok:true`.
9. `Given backlog with an unknown sub-key, when validateManifest runs, then error contains "unknown backlog field"`
   (e.g. `{ source: file, ref: manifest/stubs/a.md, bogus: 1 }`, `fileExists: ALWAYS_EXISTS`).
   *Fails today:* `ok:true`.
10. `Given backlog { source: bogus } (one bad field), when validateManifest runs, then errors has length exactly 1`
    (the ADV-1 exactly-one-error count assert — kills accumulator off-by-one mutants).
    *Fails today:* `errors.length === 0`.

GREEN (`engine/src/manifest.js`):
- Add `BACKLOG_SOURCES` frozen set near line 42–52.
- Add the `validateBacklog(backlog, fileExists, errors)` helper (place it near the other
  `validate<Key>` helpers, e.g. after `validateScripts`).
- Add `case 'backlog': validateBacklog(value, fileExists, errors); break;` to the switch (315–338) and
  drop `backlog` from the trailing fall-through comment.
- Edit the migration sites: `manifest.test.js:53` → `{ source: 'file', ref: null }`;
  `test/fixtures/manifest/valid-basic.workflow.md:2` → `{ source: file, ref: manifest/stubs/a.md }`.
- Add the 7 new bats fixture files + their `@test` blocks in `test/manifest-lint.bats`.
- Bump `scripts/ci.sh` `EXPECTED_TESTS` from 423 to `423 + <new node test count>`.

REFACTOR: ensure `validateBacklog` reads like its sibling helpers (early `return` only on the non-object
guard; accumulate thereafter — no nested `if` beyond depth 2; named constant for the source set; no magic
strings beyond the user-facing error text). Confirm no provenance refs leaked into strings/titles.

### Gate

Part gate (targeted): `cd engine && node --test test/manifest.test.js` (must be green) AND
`bats test/manifest-lint.bats` (from the worktree root: `bats test/manifest-lint.bats` — must be green,
all migrated + new fixtures pass). Run both before committing; never commit on red.

### Commit

`feat(engine): validate backlog as object with file|custom source`

## Part 2 — backlogSourceOf + record line names the active adapter (resolve.js)

### Context

**Mutation-scored** (`engine/src/**/*.js`).

**File to edit — `engine/src/resolve.js`** (244 lines; read it whole). The target is
`buildManifestRecords(manifest)` at lines 123–141. Current backlog branch (lines 127–131):

```js
if (typeof manifest.backlog === 'string' && manifest.backlog) {
  records.push(
    `backlog: "${manifest.backlog}" declared — Backlog.resolve required at input-classify.`,
  );
}
```

REPLACE it with object-shaped reading that **names the resolved source**. The sibling `models.fallback`
branch (lines 133–138) is the record-line house pattern to mirror (a guarded `records.push(...)` with a
single back-ticked template line). Required output (design "CORE deltas", Requirement 3):

- Add a file-local helper `backlogSourceOf(backlog)` → returns the `source` string when `backlog` is an
  object with a `source` (`'file'` | `'custom'`), else `null` (or `undefined`) when `backlog` is absent
  or not an object. Keep it pure, no I/O, no throw. It is the single source-of-truth normaliser the
  record line consumes. It is **internal** — NOT exported from `resolve.js` or `index.js` (tested
  through `resolvePipeline`'s `record`).
- In `buildManifestRecords`: `const source = backlogSourceOf(manifest.backlog);` then push a line ONLY
  when `source` is truthy. The line MUST name the source. For `custom`, include the ref, e.g.
  `` `backlog: source "custom" (ref: ${manifest.backlog.ref}) — Backlog.resolve required at input-classify.` ``.
  For `file`, emit a `file`-naming line that STILL contains the substring `backlog` (S6 matches
  `/backlog/i`) and names `file`, e.g.
  `` `backlog: source "file" (ref: ${ref ?? '<default path>'}) — Backlog.resolve required at input-classify.` ``.
- A non-object / absent backlog → `backlogSourceOf` returns falsy → NO line (preserves "absent backlog →
  no record line").

**Note on the no-validation path:** `resolvePipeline` does NOT call `validateManifest` — it reads the
(already alias-resolved) manifest directly. So `buildManifestRecords` must defend against a malformed
backlog itself (hence `backlogSourceOf` returning falsy for non-objects); it must never throw on a
bare-string backlog that a non-linted caller might still pass.

**Mutation-adequacy targets:** the two string literals `"file"` and `"custom"` in the record lines are
prime mutant targets — a mutant that collapses both sources to one label, or swaps `"custom"` → `""`,
must be killed by per-source marker assertions (one test asserts the `file` line contains `file`; another
asserts the `custom` line contains `custom` AND the ref). The `backlogSourceOf` object-guard
(`typeof === 'object'`, `source` membership) is a conditional-boundary mutant target — kill with the
non-object → no-line test.

**Test file — `engine/test/resolve.test.js`** (read it whole, ~479 lines). Conventions:
`import { resolvePipeline } from '../src/resolve.js'`; `loadDefault()` (lines 14–16) parses
`pipeline/default.yml`; tests call `resolvePipeline(sut, manifest)` (no opts ⇒ `roleExists`/`fileExists`
default to `() => true`). The "record contents" section is lines 446–468 (skip record + default-off
record tests); ADD the new backlog record tests there, under a new banner
`// ─── backlog record line names the active source ───`. **This file has ZERO existing backlog tests**
(confirmed) — you are adding the first. A manifest fixture is built inline as a plain object passed
straight to `resolvePipeline` (no file needed), e.g.
`resolvePipeline(loadDefault(), { backlog: { source: 'custom', ref: './scripts/bl.sh' } })`.

**Scenario test — `engine/test/scenarios.test.js`** (read lines 1–40 + 418–435). S6 is the test at
lines 422–434. The current assertion (line 432) is partial:
`const hasBacklogRecord = result.record.some(r => r.toLowerCase().includes('backlog'));`. STRENGTHEN it
to a **source-naming** assertion: assert the record contains a line that names the active source
(`file` — see the migrated fixture below). Update the test title/comment to drop the "partial — P11
lands later" framing (P11 IS this change), per the design's "S6 strengthened". Keep `result.ok === true`.
Loader: `loadScenarioManifest('S6')` (lines 36–39) loads
`engine/test/fixtures/scenarios/S6/manifest.yml` and is passed to `resolvePipeline` (no
`validateManifest`, no `fileExists`).

**MIGRATION (REQUIRED, ADR-054 — third site) — `engine/test/fixtures/scenarios/S6/manifest.yml`:**
currently the single line `backlog: PROJ-42`. Migrate to the object form. Use the `file` variant (the
byte-for-byte characterization, Requirement 1):

```yaml
backlog: { source: file, ref: BACKLOG.md }
```

(`ref` is not existence-checked in the scenario path — `resolvePipeline` does not call `fileExists` —
so any path string is fine; `BACKLOG.md` is this repo's real backlog file and reads naturally.)

**`scripts/ci.sh` count bump:** this part adds M new node `test()` cases to `resolve.test.js` (the S6
strengthen is an edit-in-place to an existing test, NOT a new test — do NOT count it). Bump
`EXPECTED_TESTS` (whatever Part 1 left it at) by M.

### TDD steps

RED (write in `engine/test/resolve.test.js` first; each fails because `buildManifestRecords` still keys
on `typeof manifest.backlog === 'string'`, so an object-form backlog produces NO record line and the
source name is absent):

1. `Given backlog { source: custom, ref: ./x.sh }, when resolvePipeline runs, then record has a line naming "custom" and the ref`
   — assert `result.record.some(r => r.includes('custom') && r.includes('./x.sh'))`. *Fails today:*
   object backlog ⇒ string branch skipped ⇒ no backlog line ⇒ assertion false.
2. `Given backlog { source: file, ref: BACKLOG.md }, when resolvePipeline runs, then record has a line naming "file" and still matches /backlog/i`
   — assert a record line `.includes('file')` and `/backlog/i.test(line)`. *Fails today:* no backlog line.
3. `Given backlog as a bare string, when resolvePipeline runs, then it does not throw and emits no backlog source line`
   — pass `{ backlog: 'PROJ-42' }`; assert `result.ok === true` and
   `!result.record.some(r => /source "(file|custom)"/.test(r))` (the new line shape is absent for a
   malformed backlog). *Fails today:* the OLD code emits the legacy `"PROJ-42" declared` line — this
   test pins the *new* contract that a bare string no longer produces a source-named line. (After GREEN,
   `backlogSourceOf` returns falsy for the string, so no source line.)
4. `Given no backlog key, when resolvePipeline runs, then record has no backlog source line` — pass
   `{}`; assert no `source "…"` backlog line. *Fails today:* passes vacuously; kept to kill a mutant
   that would emit a line unconditionally.

Then STRENGTHEN the existing S6 test in `scenarios.test.js` (edit-in-place, not a new test): replace the
`includes('backlog')` assertion with the source-naming assertion
(`result.record.some(r => r.includes('file'))` AND a `/backlog/i` line still present). *Fails today:*
once the S6 fixture is migrated to the object form (below), the OLD `buildManifestRecords` emits no line
at all (object backlog skips the string branch), so the strengthened assertion fails → drives GREEN.

GREEN (`engine/src/resolve.js`):
- Add the `backlogSourceOf(backlog)` file-local helper.
- Rewrite the backlog branch of `buildManifestRecords` to use it and emit the source-naming line(s).
- Migrate `engine/test/fixtures/scenarios/S6/manifest.yml` to `{ source: file, ref: BACKLOG.md }`.
- Bump `scripts/ci.sh` `EXPECTED_TESTS` by M (new resolve.test cases only).

REFACTOR: keep `backlogSourceOf` tiny and single-responsibility (one expression / early returns, no
nesting > 2); ensure the two source labels are the only string literals and the line template mirrors the
`models.fallback` sibling's phrasing. No provenance refs in any string/title.

### Gate

Part gate (targeted): `cd engine && node --test test/resolve.test.js test/scenarios.test.js` (both
green). Run before committing; never commit on red.

### Commit

`feat(engine): record line names the resolved backlog source`

## Part 3 — backlog adapter spec doc + skill source-dispatch wiring

### Context

**Docs-only, standalone, NO `src/` delta, NO `EXPECTED_TESTS` bump, NO new tests.** This part writes one
new doc and edits two skill prose bodies. No engine code, no mutation surface, no node/bats test changes.

**New file — `docs/adapters/backlog.md`** (the `docs/adapters/` directory does not exist yet — create
it). This is the single home (ADR-056) for the port interface + per-source procedures + the gh/jira
custom recipes. Transcribe the pinned content from `docs/DESIGN-P11-backlog-port.md` — specifically the
**"The contract matrix (two sources)"** table (design lines 132–148) and **"Custom recipes (gh, jira)"**
(design lines 150–172). Required sections:

1. **Port interface** — `resolve(id) → { title, brief }` and `complete(id, refs[]) → void`. One sentence
   each. State that *which id-form is a backlog id* and *when `complete` fires* (delivery, after the PR
   exists) are owned by the orchestrator/core prose, not the adapter (design Requirement 7).
2. **Source set** — exactly `{ file, custom }`. `file` is the only built-in adapter (today's behaviour
   byte-for-byte); `custom` is the single runtime-resolvable escape hatch. `github-issues`/`jira`/
   `linear` are NOT sources — they are custom recipes below.
3. **`file` adapter procedure** —
   - `resolve`: look the id up in the backlog markdown; id-form is **the repo's own backlog convention,
     judged by the orchestrator in prose — no engine regex, no `backlog.id-pattern` knob** (design
     Requirement 7 / the id-form ownership paragraph). Name that this repo's `BACKLOG.md` keys by
     free-text + `P<n>`/`P<n>.<m>` labels, so a universal regex would be wrong here.
   - `complete`: flip `[ ]`/`[~]` → `[x]` and append the reference suffix via `craft:backlog-ticker`
     (one file, one edit, exact-line diff guard). Unchanged from today.
4. **`custom` invocation contract** —
   - `resolve <id>` → `<ref> resolve <id>`, prints `{ title, brief }` on stdout.
   - `complete <id> <refs…>` → `<ref> complete <id> <refs…>`; **exit 0 = success; a non-zero exit is a
     blocker (never a silent tick-skip)**. **Idempotency** (re-running converges — a closed item stays
     closed, refs appended once) is the **custom script's documented contract**, NOT framework-asserted
     (design "Error semantics" + the matrix `custom` row).
   - id-form for `custom` is the script's concern; the engine has no opinion.
5. **Failure → blocker** — RELY on the existing `contracts/core.md` invariant ("adapter failure is a
   blocker, never a silent pass"); **reference it, never restate it** (ADR-057 / the P5 one-contract-home
   rule). Name the split (design "Error semantics"): config errors (non-object backlog, unknown source,
   unknown sub-key, missing required ref, a `file` ref that does not exist) → engine non-zero exit at
   manifest-lint / pipeline-resolve (loud STOP at `run/SKILL.md` step 1); runtime errors (custom script
   missing/non-exec/non-zero, id-not-found, tool unauthed/down) → session blocker protocol
   `{ unit, reason, ≤3 options }`.
6. **Custom recipes (copy-paste reference)** — transcribe verbatim from design lines 150–172:
   - **GitHub issues** (`custom` script wrapping `gh`): `resolve <id>` →
     `gh issue view <id> --json title,body` (map `title`→title, `body`→brief); `complete <id> <refs…>` →
     `gh issue close <id> --comment "<refs>" --reason completed` (single idempotent call — re-closing a
     closed issue is a no-op); id-form `^#?\d+$`.
   - **Jira** (`custom` script wrapping the Atlassian MCP / a CLI): `resolve <id>` → `getJiraIssue`
     (`fields: [summary, description]`, `responseContentFormat: markdown`) → title=summary,
     brief=description; `complete <id> <refs…>` → `transitionJiraIssue` → Done +
     `addCommentToJiraIssue` (refs); id-form `^[A-Z][A-Z0-9]+-\d+$`.
   - State that **Linear** has no MCP here, so it is just another `custom` recipe a user would write — NOT
     a built-in source.
   - Note these recipes' failure modes (tool missing/unauthed, 404) are runtime blockers via the
     `custom` seam (the script exits non-zero).

   **PROVENANCE:** the doc is a design/spec doc — it MAY name `BACKLOG.md`, tools, regexes, but the
   *source/test* provenance rule does not apply to docs. Do NOT, however, sprinkle `ADR-0xx`/`P11` tags
   into the prose body; the design doc and the ADRs carry provenance. Cross-link the ADRs only if the
   repo's existing `docs/adapters`-style docs do (none exist yet — keep it clean, no `[[…]]` refs needed).

**Skill edit 1 — `skills/run/SKILL.md` step 2** (read lines 65–68). Current text:

> 2. Classify the input (the non-flag remainder from step 0a): **backlog id** (matches the repo's backlog
>    convention — only if the manifest declares `backlog:`; look the entry up there) | **file path**
>    (read it) | **free-text brief** (use verbatim). Empty or ambiguous → STOP and ask.

ADD (a one-line spec pointer + source-dispatch, per ADR-056 — do NOT inline the matrix): after the
backlog-id clause, point at `docs/adapters/backlog.md` for the per-source `resolve` mechanism, and name
the source dispatch: for `file`, classify by the repo's backlog convention (prose-judgment) and
`resolve` by reading the entry; for `custom`, the script owns the id-form and `resolve` runs
`<ref> resolve <id>`. State that id-not-found or an unreachable `custom` source is a **runtime blocker**
(never a guessed brief). Keep it to one or two sentences — the spec doc holds the detail.

**Skill edit 2 — `skills/documentation/SKILL.md` step 2** (read lines 22–25). Current text:

> 2. **Backlog tick — guarded:** spawn **craft:backlog-ticker** with the exact entry line and the exact
>    reference suffix. **Accept ONLY if the diff touches exactly the expected line(s)** — otherwise
>    discard and do the one-line edit yourself. Commit `docs(<slug>): backlog flip`.

GENERALISE by source (ADR-059 / design "Tick"): keep the `file` path exactly as-is (today's
`craft:backlog-ticker` + exact-line diff guard, `craft:backlog-ticker` stays the `file` adapter body
verbatim). ADD a `custom` branch: run `<ref> complete <id> <refs…>`; a **non-zero exit ⇒ blocker** (never
a silent tick-skip); idempotency is the custom script's documented contract (see
`docs/adapters/backlog.md`), NOT framework-asserted. Add the one-line pointer to the spec doc. Keep the
commit message convention.

Also note the preamble probe at `skills/documentation/SKILL.md:10` (`backlog:` declared?) is unchanged —
it still gates whether any backlog work runs; only the tick *mechanism* gains the source dispatch.

**Do NOT touch** `agents/backlog-ticker.md` (it stays the `file` adapter body verbatim) or
`contracts/core.md` / `contracts/delivery.md` (ADR-057: no new/duplicated clause).

### TDD steps

This is a docs/prose part with NO `src/` delta and NO test surface, so there is no RED/GREEN/REFACTOR
code cycle. The verification is the phase-boundary gate (below) plus a content checklist (treated as the
"GREEN" acceptance):

- RED-equivalent (pre-state): `docs/adapters/backlog.md` does not exist; `run/SKILL.md` step 2 and
  `documentation/SKILL.md` step 2 carry no source-dispatch / spec pointer.
- GREEN (acceptance checklist — all must hold):
  1. `docs/adapters/backlog.md` exists with all six sections above; the matrix names exactly
     `{ file, custom }`; both gh and jira recipes are present with their id-form regexes; Linear is named
     as a custom recipe, not a source.
  2. The failure-is-a-blocker section *references* `contracts/core.md` and does NOT restate the invariant
     text.
  3. `skills/run/SKILL.md` step 2 points at `docs/adapters/backlog.md` and names the file/custom resolve
     dispatch + the runtime-blocker-on-unreachable rule.
  4. `skills/documentation/SKILL.md` step 2 keeps the `file` `craft:backlog-ticker` exact-line guard and
     adds the `custom` → `<ref> complete …`, non-zero-exit-⇒-blocker branch + the spec pointer.
  5. `agents/backlog-ticker.md`, `contracts/core.md`, `contracts/delivery.md` are untouched.
  6. No `EXPECTED_TESTS` change; no engine/test files touched.
- REFACTOR: prose reads cleanly, no duplicated invariant text, no stray `ADR-0xx`/`P11` tags in the body.

### Gate

Part gate (targeted): no node/bats tests change, so the targeted gate is the phase-boundary gate run
from the worktree root: `bash scripts/ci.sh` (it must stay green — `EXPECTED_TESTS` is unchanged at the
value Part 2 left it, node + bats + shellcheck + pipeline-lint + pipeline-resolve + contracts-lint all
green; the new doc and skill prose introduce no lint regressions). Confirm green before committing.

### Commit

`docs(backlog): adapter spec doc and skill source-dispatch wiring`
