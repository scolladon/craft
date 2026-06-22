# Plan — Repo-local craft memory (self-improving per repo) (P22)

> Source: design doc `docs/DESIGN-P22-repo-local-craft-memory.md` · ADRs `116, 117, 118, 119, 120, 121, 122, 123`
> The plan is the implementation script AND the knowledge handoff. Slice agents start
> with zero context: whatever a slice block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every slice costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only slices for FEATURE code: coverage/interop/property
  tests fold into the implementation slice whose code they exercise. EXCEPTION:
  test-infra-only and docs-only slices (tooling config, test helpers, fixtures,
  mutation/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation slice to fold into.
- A slice that would be a pure test pass over already-landed code merges into its
  neighbour.

### P22-specific scope facts (read once, applies to every slice)

- **The `src/` delta is exactly Slices 1–3** (`engine/src/manifest.js` in S1; a new
  `engine/src/memory.js` in S2 + S3). Slice 4 is the port doc (docs-only). Slice 5 is
  orchestration prose (`skills/`, no `src/`). Slice 6 is config wiring (`.gitignore`) + a
  bats guard (no `src/`). **No new engine bin, no pipeline descriptor, no contract bundle,
  no gate, no `awaitingHarnesses` entry** — the design loads via the orchestrator session,
  not a new descriptor (Design §"Why a port", §Read/Update lifecycle). Do NOT touch
  `pipeline/default.yml`, `engine/src/gates.js`, `contracts/`, or `engine/bin/`.
- **Dogfooding boundary (HARD — do not trip):** this feature modifies craft's OWN
  engine/skills. Its *runtime artifact* (`.claude/craft-memory.md`) lands in whatever repo
  craft runs against. **No slice writes a live `.claude/craft-memory.md` (or
  `.claude/craft-metrics.md`) into THIS repo.** Slices build the mechanism + the
  default-config re-include + tests with fixtures in `mktemp`/temp dirs only. The store
  resolves against the target repo's ROOT (`dirname(dirname(manifest))`), never
  `${CLAUDE_PLUGIN_ROOT}` (Req 1). State-mutating probes run in `mktemp` throwaways, never
  the worktree.
- **Advisory-only is the load-bearing invariant (ADR-116):** the store NEVER gates. `load`
  of any malformed/poisoned/absent store must **never throw and never yield a gating
  decision** — it yields an empty-or-filtered `MemoryView` (Req 2, Req 6). This is the
  make-or-break property; Slice 2 owns its dedicated suite.
- **Phase-boundary gate = `bash scripts/ci.sh`** (this repo has no manifest, so the engine
  probes defaults; the substrate gate is `scripts/ci.sh`). It runs, in order:
  `cd engine && node --test 'test/**/*.test.js'` with a hard `EXPECTED_TESTS` count-drift
  check; `cd adapters/pi && node --test …` with `EXPECTED_PI_TESTS=202`; `bats test/`;
  `shellcheck scripts/*.sh hooks/*.sh`; `node engine/bin/pipeline-lint.js
  pipeline/default.yml`; `node engine/bin/pipeline-resolve.js pipeline/default.yml`;
  `node engine/bin/contracts-lint.js contracts`.
- **EXPECTED_TESTS bump rule (the easy CI breaker):** any slice that adds engine
  `node --test` cases MUST update `EXPECTED_TESTS` in `scripts/ci.sh` (line 10) in the SAME
  commit, or `ci.sh` fails on count drift. **Current count: `# tests 706`.** The running
  total below — bump in each test-adding slice, never skip:
  - S1 adds **8** → `714`.
  - S2 adds **15** → `729`.
  - S3 adds **15** → `744`.
  - S4/S5/S6 add **0** engine tests (S4 docs, S5 prose, S6 `.gitignore` + bats). `bats
    test/` has **no count gate** — adding a bats file (S6) needs no bump.
  - No slice touches `adapters/pi`, so `EXPECTED_PI_TESTS` stays **202** (do not touch it).
  - The 8/15/15 figures are the *intended* case count — write the cases the TDD steps name;
    if you add or drop a case, set `EXPECTED_TESTS` to the number the test runner actually
    prints (`cd engine && node --test 'test/**/*.test.js'` → `# tests <N>`), not the figure
    here. The figure is a target, the runner is the source of truth.
- **Ordering keeps CI green at every commit, and each slice builds on the prior tree.**
  S2 ships `engine/src/memory.js` with the store-shape + read path; S3 extends the SAME
  module with the write path (it imports S2's serializer + entry shape). S6's bats guard
  asserts the `.gitignore` re-include lines S6 itself adds — it is self-contained, no cross
  ordering needed beyond landing after the file exists in the same commit.

## Slice 1 — manifest validates the top-level `memory:` key like `backlog` (ADR-121)

### Context

The only manifest-validator delta of P22. Today there is **no** `memory:` key; an
unknown top-level key errors with `unknown top-level key: <k>`. ADR-121 adds `memory:
{ source: file|custom, ref }`, validated **exactly like `backlog`**, default `ref` =
`.claude/craft-memory.md` (resolved by the consumer, NOT the validator — the validator
only shape-checks a *declared* key; an omitted `memory:` is simply ok, the default path is
the orchestrator's concern).

- File: `engine/src/manifest.js` (652 lines today). Precise anchors:
  - `TOP_KEYS` (line 13, a `Object.freeze(new Set([...]))`): **add `'memory'`** to the set.
    Current contents: `'backlog', 'paths', 'context', 'gates', 'phases', 'pr', 'scripts',
    'models', 'pipeline', 'retrieval', 'execution', 'extends'`.
  - `BACKLOG_SOURCES` (line 61): `Object.freeze(new Set(['file', 'custom']))`. The memory
    key shares the **same source vocabulary** (`file` default, `custom` reserved). Add a
    sibling `const MEMORY_SOURCES = Object.freeze(new Set(['file', 'custom']));` directly
    after it (do NOT reuse `BACKLOG_SOURCES` by aliasing — a future divergence in either
    vocabulary must not silently couple the two; a distinct named constant is the
    expressive choice and mirrors the existing per-key constant pattern).
  - `validateBacklog(backlog, fileExists, adapterNames, errors)` (lines 195–230) is the
    template. **Add a new `validateMemory(memory, fileExists, errors)` helper** modelled on
    it but SIMPLER — memory has no adapter-name registry and no non-builtin-tracker hint
    (those are backlog-only concerns, ADR-121: `custom` is reserved/unbuilt, no tracker
    aliases). The helper must:
    - guard `typeof memory !== 'object' || memory === null || Array.isArray(memory)` →
      push `'memory must be an object { source, ref }'` and return (mirror line 196–199);
    - reject unknown sub-keys: iterate `Object.keys(memory)`, push `` `unknown memory
      field: ${k}` `` for any key ∉ `{ 'source', 'ref' }` (mirror line 201–205);
    - `source === undefined` → push `'memory must declare a source (one of file, custom)'`
      and return (mirror line 209–212);
    - `!MEMORY_SOURCES.has(source)` → push `` `unknown memory source: ${source} (expected
      one of file, custom)` `` and return (mirror line 218–220; **omit** the
      `NON_BUILTIN_TRACKERS` branch — backlog-only);
    - `source === 'file'` → `checkFileRef('memory.ref', ref, fileExists, errors)` (mirror
      line 223–224; reuses the existing `checkFileRef`, lines 91–99, which skips absent
      sentinels and pushes `memory.ref references missing file: <path>` on a miss);
    - `source === 'custom'` → if `typeof ref !== 'string' || ref.trim() === ''` push
      `'memory.ref is required for source custom'` (mirror line 225–228).
  - Dispatch: in `validateManifest`'s `switch (key)` (lines 615–647), **add `case 'memory':
    validateMemory(value, fileExists, errors); break;`** — place it adjacent to `case
    'backlog':` (line 637) for readability. The `paths` case is already wired (line 643).
  - JSDoc: give `validateMemory` a `@param` block matching `validateBacklog`'s style
    (lines 188–194), minus the `adapterNames` param.
- Test file: `engine/test/manifest.test.js` (node:test; G/W/T titles, AAA bodies, `sut`
  variable). Helpers at top: `ALWAYS_EXISTS = () => true` (line 10), `NEVER_EXISTS =
  () => false` (line 11); imports `{ validateManifest }` (line 8).
  - The **backlog source/shape section (lines 1216–1345)** is the exact pattern to copy —
    each test is `const sut = validateManifest; const result = sut({ memory: {…} }, {
    fileExists: … }); assert…`. Add a new section after it with the header style
    `// ─── memory source/shape validation ─────`.
  - The comprehensive **"all known top-level keys" fixture (lines 50–69)** asserts `ok:
    true` for a manifest naming every key. It does NOT include `memory:` today — leave it
    as-is (adding `memory:` there is optional; the dedicated section below fully covers the
    key). Do not regress it.
- Gate file: `scripts/ci.sh` line 10: `EXPECTED_TESTS=706` → **`714`** (706 + 8). Edit the
  numeric literal only; keep `shellcheck scripts/*.sh` clean (no syntax change).

### TDD steps

- **The RED cases are the failing-shape ones** (RED 2/4/5/6 below) — they fail today
  because `memory` is an unknown top-level key, so the *only* error produced is `unknown
  top-level key: memory`, never the specific shape error. The pass-path cases (RED 1/3) are
  deepEqual locks that go green when the dispatch is wired; they pin that a valid key and an
  absent key both pass.
- RED 1 — *valid `{source: file, ref: existing}` passes*: "Given memory { source: file, ref:
  existing } when validateManifest runs, then ok:true" — `sut({ memory: { source: 'file',
  ref: 'some/file.md' } }, { fileExists: ALWAYS_EXISTS })`, assert `result.ok === true`.
  Fails today: `ok` is false with `unknown top-level key: memory`.
- RED 2 — *`{source: file, ref: missing}` fails with the file-ref message*: "Given memory
  { source: file, ref: missing } with NEVER_EXISTS, then error contains references missing
  file and memory.ref" — `sut({ memory: { source: 'file', ref: 'nope.md' } }, { fileExists:
  NEVER_EXISTS })`, assert `result.ok === false` and `result.errors.some(e =>
  e.includes('references missing file'))` and `…some(e => e.includes('memory.ref'))`.
- RED 3 — *`{source: custom, ref: non-empty}` passes under NEVER_EXISTS* (custom ref is not
  file-checked): "Given memory { source: custom, ref: non-empty } with NEVER_EXISTS, then
  ok:true" — `sut({ memory: { source: 'custom', ref: './scripts/mem.sh' } }, { fileExists:
  NEVER_EXISTS })`, assert `deepEqual(result, { ok: true, errors: [] })`.
- RED 4 — *`{source: custom}` with no ref fails*: "Given memory { source: custom } with no
  ref, then error contains ref is required" — `sut({ memory: { source: 'custom' } }, {
  fileExists: ALWAYS_EXISTS })`, assert `result.ok === false` and `…some(e =>
  e.includes('memory.ref is required'))`.
- RED 5 — *unknown source fails*: "Given memory { source: bogus } then error contains
  unknown memory source" — `sut({ memory: { source: 'bogus', ref: 'x' } }, { fileExists:
  ALWAYS_EXISTS })`, assert false + `…some(e => e.includes('unknown memory source'))`.
- RED 6 — *unknown sub-key fails*: "Given memory { source: file, bogus: 1 } then error
  contains unknown memory field" — `sut({ memory: { source: 'file', ref: 'x', bogus: 1 } },
  { fileExists: ALWAYS_EXISTS })`, assert false + `…some(e => e.includes('unknown memory
  field: bogus'))`.
- RED 7 — *bare string fails with object-shape message*: "Given memory as a bare string,
  then error contains memory must be an object" — `sut({ memory: 'x' }, { fileExists:
  ALWAYS_EXISTS })`, assert false + `…some(e => e.includes('memory must be an object'))`.
- RED 8 — *missing source fails*: "Given memory { ref: x } with no source, then error
  contains must declare a source" — `sut({ memory: { ref: 'x' } }, { fileExists:
  ALWAYS_EXISTS })`, assert false + `…some(e => e.includes('must declare a source'))`.
- GREEN — add `MEMORY_SOURCES`, `validateMemory`, and the `case 'memory':` dispatch as in
  Context. Re-run the 8 tests → all green.
- GREEN (gate count) — set `EXPECTED_TESTS=714` in `scripts/ci.sh` (706 + 8).
- REFACTOR — confirm `validateMemory` carries JSDoc matching `validateBacklog`'s style;
  confirm no magic strings beyond the `'memory.ref'`/`'memory'` labels; confirm
  `MEMORY_SOURCES` is a distinct frozen constant (not aliased to `BACKLOG_SOURCES`); re-run
  the full file to confirm no other section regressed.

### Gate

- Targeted (slice): `cd engine && node --test 'test/manifest.test.js'` (the 8 new cases
  pass; the suite stays green).
- Phase-boundary (valid here too): `bash scripts/ci.sh` (verifies `EXPECTED_TESTS=714`
  matches the runner and shellcheck stays clean on the one-line `ci.sh` edit).

### Commit

`feat(manifest): validate the top-level memory key like backlog (ADR-121)`

## Slice 2 — memory store read path: parse, validate-on-read, advisory empty-view (ADR-116/117)

### Context

The first half of the pure-mechanics heart — a **new module** `engine/src/memory.js` and a
**new test file** `engine/test/memory.test.js`. This slice ships the store SHAPE, the
`parse`/`serialize` round-trip (single markdown + YAML frontmatter, ADR-117), and `load`'s
**validate-on-read** filtering with the **make-or-break advisory safety property**: a `load`
of any absent/empty/malformed/poisoned store NEVER throws and NEVER yields a gating decision
— it yields an empty-or-filtered `MemoryView` (Req 2, Req 6, ADR-116). Slice 3 extends this
same module with the `save`/update-semantics write path.

- **No existing memory module** — confirmed (`grep -rl 'MemoryView\|craft-memory'
  engine/` is empty). This is greenfield in `engine/src/`.
- **Frontmatter precedent to REUSE, not re-implement:** `engine/src/frontmatter.js`
  exports `extractFrontmatter(content) → string|null` (the block between the first two
  `---` fences, CRLF-tolerant) and `parseManifestContent(content) → object|null` (fence
  sniff → `js-yaml` `load`). Import `js-yaml`'s `load`/`dump` the same way
  (`import { load, dump } from 'js-yaml';` — `frontmatter.js` line 6 imports `load`).
  Mirror `extractFrontmatter`'s fence handling for the store body. **The store is the
  inverse of a manifest:** the YAML frontmatter carries the machine-readable entries; the
  markdown body is human-readable rendering. For P22 the frontmatter is authoritative; the
  body is regenerated from it on serialize (so a hand-edit to the frontmatter is the
  source of truth and the body never drifts).
- **Store shape (frontmatter), pinned to Design §Constraints content-whitelist table.** A
  top-level object with per-concern entry lists. Each entry is one of exactly six concerns
  (toolchain, gate-cmd, mutation-tool, findings, slice-sizing — metrics live in the
  SEPARATE artifact, ADR-119, NOT in this store, so the store module never serializes
  metrics). Every entry carries common metadata: `confidence` (number), `provenance`
  (`{ run, commit, date }`), plus its concern-specific payload + the field used as the
  **validate-on-read fingerprint**:
  | concern | payload + fingerprint field |
  |---|---|
  | toolchain | `{ ecosystem, lockfileFingerprint }` |
  | gate-cmd | `{ phase, command }` |
  | mutation-tool | `{ tool, configFingerprint }` |
  | findings | `{ file, severity, pattern }` |
  | slice-sizing | `{ size, outcome }` (`pass`|`blocked`) |
  Keep the exact concern ids and field names above as named constants
  (`const CONCERNS = Object.freeze([...])`) — they are the cross-module contract S3 and the
  port doc (S4) must match byte-for-byte. **No free-form/prose/snippet/PII field on any
  entry** (Req 10, ADR-123 — document-only, so this is a discipline the shape enforces by
  NOT having such a field, not a runtime reject).
- **`load(repoRoot, deps) → MemoryView` — the read verb.** Signature design (keep it pure
  and injectable, the `validateManifest`/`checkFileRef` house style):
  - `repoRoot` is the resolved worktree/checkout root (the orchestrator passes
    `dirname(dirname(manifestAbsPath))`; the module does NOT compute it — it only joins
    `repoRoot` + the configured store ref).
  - Inject I/O + validators via a `deps` bag so the module is node:test-able with no real
    filesystem: `deps.readStore(path) → string|null` (the only FS read; returns `null` for
    absent/unreadable — NEVER throws), and `deps.validators` — a map keyed by concern of
    cheap re-check predicates `(entry) => boolean` (toolchain → lockfile fingerprint still
    matches; gate-cmd → command still resolvable; mutation-tool → config file still
    present; findings → file still exists). slice-sizing has **no** per-use re-check (Design
    §Constraints: "used as a weak planner hint; no per-use re-check") → its validator
    defaults to `() => true`.
  - **post:** `MemoryView` = `{ entries: { <concern>: Entry[] }, evicted: Entry[],
    loadNote: string|null }`. Entries that fail validate-on-read are dropped from `entries`
    and listed in `evicted` (flagged stale-at-use, consumed by S3's eviction). An
    absent/empty/malformed store yields an **empty view** (`entries` all `[]`, `evicted`
    `[]`) with a non-null `loadNote` recording the no-op reason (e.g. `'no store'`,
    `'malformed store'`) — NEVER an error/throw (ADR-120 makes a malformed store a recorded
    load no-op).
  - **Never throws:** wrap the parse in try/catch; any parse failure → empty view +
    `loadNote: 'malformed store'`. This is the make-or-break property's read side.
- **No metrics in this slice** — metrics are the separate append-only artifact (ADR-119),
  orchestrator-prose-filled (like model-class-matrix), with NO engine function. Do not add
  a metrics serializer here or in S3 (avoid dead code; Design §Run-over-run "No new
  measurement machinery").
- Test file `engine/test/memory.test.js`: node:test, `import { test } from 'node:test';
  import assert from 'node:assert/strict';`, G/W/T titles, AAA bodies, `sut` variable.
  Build fixture stores as in-memory markdown strings (frontmatter + body) and inject
  `deps.readStore = () => fixtureString` and `deps.validators` stubs — **no mktemp needed
  for unit tests** (pure injection). Reserve mktemp only for any FS-touching probe (none in
  this slice).

### TDD steps

- RED 1 — *round-trip*: "Given a store with one toolchain entry, when parse then serialize,
  then the frontmatter round-trips" — parse a fixture string, serialize the result, re-parse,
  assert the entry deep-equals. Fails today: module does not exist.
- RED 2 — *cold/absent store → empty view, no throw* (advisory safety): "Given readStore
  returns null, when load runs, then it returns an empty view with a loadNote and does not
  throw" — `sut(repoRoot, { readStore: () => null, validators })`, assert all concern lists
  are `[]`, `evicted` is `[]`, `loadNote` is non-null. Fails today: no module.
- RED 3 — *malformed store → empty view, no throw* (make-or-break): "Given readStore returns
  arbitrary non-YAML garbage, when load runs, then it returns an empty view with loadNote
  'malformed store' and never throws" — assert no throw (`assert.doesNotThrow`) and empty
  view. This is the dedicated advisory-safety case.
- RED 4 — *poisoned store never yields a gating value* (make-or-break): "Given a store whose
  entries all fail validate-on-read, when load runs, then entries are empty and the failed
  entries are in evicted (advisory-only, never a verdict)" — inject `validators` all
  returning `false`; assert every concern list is `[]`, `evicted.length` equals the seeded
  count, `loadNote` records the filter. The assertion proves `load` returns DATA, never a
  gate/blocker/verdict object.
- RED 5 — *validate-on-read drops the stale, keeps the fresh (toolchain)*: "Given a store
  with a toolchain entry whose lockfile fingerprint no longer matches, when load runs, then
  it is dropped from entries.toolchain and added to evicted" — one entry, toolchain
  validator returns `false`; assert dropped + in `evicted`.
- RED 6 — *gate-cmd unresolvable dropped*: same shape, gate-cmd validator `false` → dropped.
- RED 7 — *findings file-gone dropped*: findings validator `false` → dropped.
- RED 8 — *mutation-tool config-absent dropped*: mutation-tool validator `false` → dropped.
- RED 9 — *fresh entries survive*: "Given a store whose entries all pass validate-on-read,
  when load runs, then every entry is in entries (grouped by concern) and evicted is empty"
  — validators all `true`; assert grouping + counts.
- RED 10 — *slice-sizing has no re-check*: "Given a slice-sizing entry and no slice-sizing
  validator, when load runs, then it survives (weak hint, no per-use re-check)" — omit the
  slice-sizing validator; assert it is kept.
- RED 11 — *empty frontmatter block → empty view*: "Given a store with a fenced but empty
  frontmatter block, when load runs, then empty view + loadNote" (mirror `extractFrontmatter`
  returning null → empty view path).
- RED 12 — *serialize is deterministic & diffable*: "Given the same entries serialized
  twice, then the output is byte-identical" (Req 7 diffability; deterministic key order).
- RED 13–15 — *grouping & ordering*: entries serialize/parse **oldest→newest** within each
  concern (Design §Update-semantics ordering — S3 relies on it); assert a multi-entry concern
  preserves insertion order through round-trip (RED 13); assert two concerns don't bleed
  into each other (RED 14); assert an unknown concern key in a fixture is ignored, not
  thrown (RED 15 — forward-compat, advisory safety).
- GREEN — author `engine/src/memory.js`: `CONCERNS` constant; `parseStore(content) →
  { entries }` (reuse `extractFrontmatter`/`js-yaml load`, try/catch → null on bad YAML);
  `serializeStore(view) → string` (deterministic `js-yaml dump` of frontmatter + a generated
  body); `load(repoRoot, deps) → MemoryView` applying validators per concern, building
  `entries`/`evicted`/`loadNote`, never throwing. Re-run the 15 tests → green.
- GREEN (gate count) — set `EXPECTED_TESTS=729` in `scripts/ci.sh` (714 + 15).
- REFACTOR — small functions, early returns, no nesting >2; `CONCERNS`/field names as named
  constants (no magic strings); confirm the try/catch swallows nothing silently — it records
  a `loadNote` (handle-with-context, never a bare swallow); confirm no `any`-style escapes;
  confirm `load` is a pure query (CQS — no FS write).

### Gate

- Targeted (slice): `cd engine && node --test 'test/memory.test.js'` (15 cases pass).
- Phase-boundary: `bash scripts/ci.sh` (verifies `EXPECTED_TESTS=729`; new file is picked
  up by the `test/**/*.test.js` glob).

### Commit

`feat(memory): store read path — parse, validate-on-read, advisory empty-view (ADR-116/117)`

## Slice 3 — memory store write path: update semantics, merge-before-insert, both-caps eviction (ADR-122)

### Context

The second half of the mechanics heart — extends **the same `engine/src/memory.js`** S2
shipped (and **the same `engine/test/memory.test.js`**) with `save`'s delta reconciliation:
the ADDED/REFRESHED/DECAYED/EVICTED transitions, **merge-before-insert** (improve-only value
rewrite), and **eviction-on-cap under BOTH caps** with the **newest-50-window least-relevant**
rule (ties → oldest provenance). This is `save`'s pure core (no FS — the FS write is one
injected dep so the function stays node:test-able).

- Imports S2's `CONCERNS`, `parseStore`, `serializeStore`, and the entry shape — do NOT
  redefine them. The write path operates on the loaded view + a `delta`.
- **`save(repoRoot, delta, deps) → { writeNote, view }` — the write verb.** Design facts to
  encode (Design §Update-semantics + §Constraints, ADR-122):
  - `delta` = this run's buffered observations, grouped by concern (the run-record buffer
    the orchestrator hands over). Each observation = `{ concern, key, payload }`.
  - **Key = a SUBSET of the stored shape** (the merge identity), pinned per concern:
    gate-cmd keyed by `phase`; toolchain keyed by `ecosystem`; mutation-tool keyed by
    `tool`; findings keyed by `file+pattern` (**severity is mutable payload, NOT key** — a
    recurrence at the same `file+pattern` with changed severity is a REFRESH, not a new
    entry — Design §Update-semantics); slice-sizing keyed by `size`. Encode these as a
    `keyOf(concern, payload)` function with a per-concern field list constant.
  - **Per-entry transition (the state machine — Design §Update-semantics table):**
    - **ADDED** — observed, no matching entry at load → new entry, `confidence = FLOOR + 1
      step`, `provenance = { run, commit, date }` stamped now.
    - **REFRESHED** — observed, matching entry exists → `confidence ↑` (capped at CEILING);
      provenance **restamped**; value rewritten **only if the new observation improves the
      entry's meaning** (`improves(concern, oldPayload, newPayload)` — e.g. findings
      severity escalates, a fingerprint genuinely changes); otherwise the stored value is
      left **byte-for-byte untouched** (merge-before-insert: no churn). Re-observation
      **always** counts as a refresh for confidence/decay even when the value is unchanged.
    - **DECAYED** — a matching entry existed but was NOT re-observed this run (and did not
      fail validate-on-read at load) → `confidence ↓` one step; entry **kept** (a one-off
      miss must not evict a stable fact); provenance unchanged.
    - **EVICTED** — confidence would fall **below FLOOR** after decay, **OR** it failed
      validate-on-read at load (S2's `evicted` list — stale-at-use), **OR** the size cap
      forced it out while in the newest-50 window → removed from the flushed store.
  - **Scoring constants** are CORE POLICY (an adapter cannot weaken them) — name them as
    module constants: `FLOOR`, `CEILING`, `STEP` (pick sane integer defaults, e.g.
    `FLOOR=0`, `CEILING=5`, `STEP=1`; document them as the canonical values the port doc
    cites). The `ADDED` confidence is `FLOOR + STEP`.
  - **Ordering:** entries are oldest→newest; a new (ADDED) entry is **appended last**;
    provenance order = store order.
  - **Both caps, eviction-on-cap (ADR-122):** the store is bounded by an **entry-count
    cap** AND a **max-byte guard** on the serialized file. Both default values are tunable
    config passed in (`deps.caps = { maxEntries, maxBytes }` with sane defaults). When a
    `save` would exceed **either** cap, BEFORE the flush:
    1. Restrict the removal candidate set to the **50 newest entries** (`WINDOW = 50`, a
       named constant). Entries older than the window are **NEVER** cap-evicted.
    2. Within the window, drop the **least-relevant** entry: lowest `confidence`; ties →
       **oldest provenance** (oldest `provenance.date`/run).
    3. Repeat (re-compute the window over the now-smaller store; measure bytes via
       `serializeStore`) until **both** caps are satisfied.
    - Small-store edge: ≤ `WINDOW` entries → the window is the whole store, policy degrades
      to "drop the least-relevant overall."
  - **FS write is one injected, atomic op:** `deps.writeStore(path, content) → void`
    performs the single atomic temp-write + rename (or single overwrite) — Req 6 atomicity.
    The module computes the final serialized content and calls `writeStore` exactly **once**.
    A `writeStore` that throws → `save` catches it and returns `writeNote: 'save failed:
    <reason>'` (a recorded warning) and does NOT rethrow — a failed save is **never a
    blocker** (ADR-120). No locking (last-flush-wins).
- **Metrics are NOT touched here** (ADR-119 separate artifact, no engine function) — same as
  S2. Do not add a metrics diff/serializer (no dead code; the round-over-run "measurement"
  is orchestrator-prose + the SC5-style smoke, Design §Run-over-run "No new machinery").
- Test file: append a new section to `engine/test/memory.test.js`
  (`// ─── save / update semantics ─────`). Seed stores as the parsed view from S2's
  `parseStore` over fixture strings; inject `deps.writeStore` as a spy capturing the
  serialized content (assert against it); inject `deps.caps` per test.

### TDD steps

- RED 1 — *ADDED*: "Given an empty store and a delta with one new observation, when save
  runs, then the entry is added with confidence FLOOR+STEP and a stamped provenance" — assert
  the captured serialized content has the entry, confidence `1`, provenance present.
- RED 2 — *REFRESHED, value unchanged → no churn*: "Given a store with a matching entry and
  an equivalent re-observation, when save runs, then confidence ↑ and provenance restamps but
  the payload bytes are unchanged" — assert payload identical, confidence incremented,
  provenance.run updated. (merge-before-insert, improve-only.)
- RED 3 — *REFRESHED, improving observation → value rewritten*: "Given a findings entry and a
  re-observation that escalates severity at the same file+pattern, when save runs, then the
  stored severity is rewritten (improve) and no duplicate entry is appended" — assert one
  entry, new severity, count unchanged.
- RED 4 — *no duplicate on same key*: "Given a delta whose observation matches an existing
  key, when save runs, then the entry count for that concern stays 1 (merge, never append)."
- RED 5 — *findings severity is payload not key*: "Given a findings entry keyed by
  file+pattern and a re-observation with a different severity, when save runs, then it is a
  REFRESH (one entry), not a second entry" — proves the key subset rule.
- RED 6 — *DECAYED*: "Given a store entry not re-observed this run, when save runs, then its
  confidence ↓ one step and the entry is kept" — empty delta; assert decremented, still present.
- RED 7 — *EVICTED below floor*: "Given an entry at FLOOR not re-observed, when save runs,
  then decay drops it below floor and it is removed from the flushed store."
- RED 8 — *EVICTED via validate-on-read*: "Given a load whose evicted[] carried a stale
  entry, when save runs, then that entry is absent from the flushed store" (consume S2's
  `evicted`).
- RED 9 — *both caps — entry-count*: "Given a store over the entry-count cap, when save
  runs, then the flushed store has ≤ maxEntries entries" — `deps.caps = { maxEntries: N,
  maxBytes: Infinity }`, seed N+k; assert eviction fired to N.
- RED 10 — *both caps — byte cap*: "Given a store under the entry-count cap but over the
  byte cap, when save runs, then the flushed serialized content is ≤ maxBytes" —
  `maxEntries: Infinity, maxBytes: B`; assert `Buffer.byteLength(captured) <= B`.
- RED 11 — *newest-window eviction protects old facts*: "Given a store over the entry-count
  cap with a LOW-confidence entry OUTSIDE the 50-newest window and a higher-confidence entry
  INSIDE it, when save runs, then the dropped entry is the least-relevant WITHIN the window
  and the old outside-window low-confidence entry SURVIVES" — seed > `WINDOW` entries; assert
  the outside-window entry is retained and an in-window entry was dropped. (The make-or-break
  cap-policy test, ADR-122.)
- RED 12 — *tie-break by oldest provenance*: "Given two in-window entries with equal lowest
  confidence, when the cap forces one out, then the one with the oldest provenance is
  dropped."
- RED 13 — *atomic single write*: "Given a save, when it runs, then deps.writeStore is
  called exactly once with the final content" — assert spy call count is 1.
- RED 14 — *failed save is a warning, never a throw* (ADR-120): "Given deps.writeStore
  throws, when save runs, then it returns a writeNote recording the failure and does not
  throw" — `assert.doesNotThrow`; assert `writeNote` contains `'save failed'`.
- RED 15 — *small-store edge*: "Given a store with ≤ WINDOW entries over the entry-count
  cap, when save runs, then the least-relevant overall is dropped (window = whole store)."
- GREEN — extend `engine/src/memory.js` with `keyOf(concern, payload)`, `improves(concern,
  old, new)`, the `FLOOR/CEILING/STEP/WINDOW` constants, the transition reconciler, the
  both-caps newest-window eviction loop, and `save(repoRoot, delta, deps)` calling
  `serializeStore` + `writeStore` once (try/catch → `writeNote`, never rethrow). Re-run all
  memory tests → green.
- GREEN (gate count) — set `EXPECTED_TESTS=744` in `scripts/ci.sh` (729 + 15).
- REFACTOR — extract the transition reconciler and the eviction loop into small named
  functions (each < 20 lines); confirm scoring/window constants are named (no magic
  numbers); confirm `save` is command-side (CQS) and the failed-save path logs context, never
  swallows; confirm no provenance refs (`P22`/`ADR`) appear in `memory.js` or its tests
  (entry `provenance` is `{ run, commit, date }` — a SHA/date, NOT a craft backlog ref).

### Gate

- Targeted (slice): `cd engine && node --test 'test/memory.test.js'` (the new save cases +
  S2's read cases all pass).
- Phase-boundary: `bash scripts/ci.sh` (verifies `EXPECTED_TESTS=744`).

### Commit

`feat(memory): store write path — update semantics, merge-before-insert, both-caps eviction (ADR-122)`

## Slice 4 — author the memory port doc `docs/adapters/memory.md` (ADR-117/121/123) — docs-only

### Context

Docs-only slice (no `src/` delta), legitimately standalone — it has no implementation slice
to fold into and IS the whitelist enforcement surface (ADR-123: the whitelist is enforced
**document-only** via this spec + write-surface discipline, NOT a runtime guard). Mirror the
existing port-doc schema exactly.

- New file: `docs/adapters/memory.md`. Siblings live FLAT at `docs/adapters/`:
  `backlog.md`, `execution.md`, `model.md`, `gate.md`, `vcs.md`. **`model.md` and
  `backlog.md` are the two closest templates** — read both; copy their section skeleton.
- **Required schema (the five port docs share it):**
  - `## Port interface` — the two verbs with **pre/post**, copied from Design §Memory port:
    - `load(repoRoot) → MemoryView` — read the store rooted at `repoRoot`, return a
      validated view (each entry through validate-on-read, surviving entries grouped by
      concern). **Called exactly once per run, at run start.** pre: `repoRoot` is the
      resolved worktree/checkout root (never the plugin dir). post: the view contains only
      entries that passed validation (or advisory-low-confidence); an absent/empty/malformed
      store yields an **empty view, never an error** (Req 2) — a malformed store is a
      recorded load no-op, not a blocker.
    - `save(repoRoot, delta) → void` — flush the run's buffered learnings as **one atomic
      write**, merging `delta` with confidence/decay update + provenance stamp. pre: the run
      reached its write point (run end); `delta` is the run-record-buffered learnings. post:
      atomic temp-write+rename (no half-write); not-re-observed entries are **decayed, not
      deleted**.
  - `## Core policy retained (NOT port verbs)` — owned by the orchestrator/core, never
    re-decided by an adapter (Design §Memory port): **what each phase contributes** (the
    write surface); **validate-on-read policy** (the cheap per-concern re-check); the
    **confidence/decay model** (FLOOR/CEILING/STEP/WINDOW values from S3 — cite them as the
    canonical values); the **advisory-only bound** (the store never gates — ADR-116); the
    **size ceiling + both-caps + newest-50 eviction** (ADR-122); the **content whitelist**
    (the per-concern schemas + the hard ban). State explicitly: an adapter persists/loads
    bytes; it never decides what, how much, or how an entry is re-checked.
  - `## Binding set` — `{ claude, pi }`.
  - `## Claude binding` — `load` once at run start, `save` once at run end; both are
    filesystem reads/writes against `repoRoot` performed by the session orchestrator. The
    single `MemoryView` is held in-session; at each phase's entry the orchestrator slices the
    concern this phase reads and **prepends it into the step-3 injected contract block as
    part of the pre-chewed context** (`skills/run/SKILL.md` §"Agent spawns" slot 1) — the
    same slot whether the phase spawns (block PREPENDED to the Task prompt) or runs inline
    (block loaded at phase entry). No second injection surface. Metrics come from the usage
    block the spawn already returns — zero extra cost.
  - `## Pi binding` — identical filesystem semantics rooted at the pi run's working dir; pi
    has no fan-out, so per-phase metrics are collected sequentially (the artifact-handoff
    invariant carries state between pi phases — cite `docs/adapters/execution.md` Pi binding).
  - `## Failure → blocker` — **Config errors** (knowable from the manifest alone): unknown
    `memory:` sub-key, bad `source`/`ref` (ADR-121) — caught by the validator (S1); non-zero
    exit before any phase (mirror backlog/model config-error rows). **Runtime errors**: a
    store that is malformed/unreadable/fails validate-on-read is **NOT a blocker** — falls
    through to full probing, recorded as a load no-op (Req 2). A `save` that cannot write
    (disk full / permission) is **also never a blocker** — a **recorded warning**; **no
    locking** (last-flush-wins) (ADR-120).
  - `## Content whitelist (per-concern entry schemas)` — the table from Design §Constraints,
    naming the six concerns, what each entry holds, its validate-on-read re-check, and the
    **explicitly-NOT-stored** column. State the hard ban verbatim: **no free-form, semantic,
    or LLM-inferred content — no prose summaries, no "this codebase prefers X", no code
    snippets, no PII.** Note this is enforced **document-only** (ADR-123): the spec defines
    the schemas and forbids non-mechanical content; each phase's documented write surface is
    trusted to comply; there is **no reject-at-write code and no schema lint**.
- **Concern ids + field names MUST match S2/S3 byte-for-byte** (toolchain
  `{ecosystem,lockfileFingerprint}`, gate-cmd `{phase,command}`, mutation-tool
  `{tool,configFingerprint}`, findings `{file,severity,pattern}`, slice-sizing
  `{size,outcome}`) — this doc is the contract the module implements; a drift here is a real
  defect (the make-or-break cheap-validation guarantee rests on the doc and code agreeing).
- **No-provenance discipline (Design §Test strategy "No-provenance-leak"):** the doc's prose
  MAY reference P22/ADR numbers (a docs artifact, like the design doc). But any **example
  store entry** shown in the doc MUST NOT carry a `P22`/`ADR` token in its `provenance` or
  payload — the entry's `produced-by` is a SHA+date, NOT a craft backlog ref. Keep example
  entries clean (S6's bats grep guards this).
- **Custom adapter:** like backlog, document `source: custom` as a reserved/unbuilt recipe
  (only the `file` binding is built). One short subsection noting `custom` is a documented
  future seam, not implemented.

### TDD steps

- RED — the file does not exist (`test -f docs/adapters/memory.md` is false) and the S6 bats
  guard (next slice) will fail against its absence. For this docs-only slice the "test" is the
  schema contract verified by reading the file back: confirm before writing that
  `grep -l 'Port interface' docs/adapters/memory.md` matches nothing (file absent).
- GREEN — author `docs/adapters/memory.md` with the seven sections above, mirroring
  `model.md`/`backlog.md` heading style. Include the content-whitelist table with concern ids
  matching S2/S3.
- REFACTOR — re-read against `model.md` and `backlog.md`: confirm every shared section
  header is present (`## Port interface`, `## Core policy retained (NOT port verbs)`,
  `## Binding set`, `## Claude binding`, `## Pi binding`, `## Failure → blocker`); confirm the
  concern field names match `engine/src/memory.js`'s `CONCERNS` exactly; confirm no example
  entry carries a `P22`/`ADR` provenance token; confirm the advisory-only + document-only
  whitelist statements are unambiguous.

### Gate

- Targeted (slice): `test -f docs/adapters/memory.md && grep -q '## Port interface'
  docs/adapters/memory.md && grep -q '## Failure → blocker' docs/adapters/memory.md` (the
  file exists and carries the port-doc schema).
- Phase-boundary: `bash scripts/ci.sh` (adding a docs file changes no executable surface; ci
  stays green — S6's bats guard is not yet present, so ci is green here regardless).

### Commit

`docs(adapters): add the memory port spec with the document-only content whitelist (ADR-117/123)`

## Slice 5 — wire the memory port into the orchestrator + per-phase read/write contract (ADR-116/118/119) — prose

### Context

Prose-only slice (no `src/` delta), legitimately standalone — the orchestration is skill
prose, not engine code (Design §Read/Update lifecycle: `load`/`save` are
session-orchestrator filesystem ops, no new bin/descriptor). Wires the one-time `load` at run
start, the one-time `save` at run end, the per-phase concern-slice injection, and the
per-phase read/write surface notes. Land AFTER the port doc (S4) so the prose can cite it.

- **File 1: `skills/run/SKILL.md`** (363 lines). Anchors pinned:
  - **§0 step 1c (lines 49–51)** seeds the run record; **step 4 (lines 81–83)** opens the
    run record as the in-session ledger / write buffer. **Add a `load` step here** — right
    after the run record is seeded, before the first phase walks (Design §Read lifecycle:
    "folded into the run's existing setup, right after the run record is seeded… and before
    the first phase walks. Called exactly once."). Encode: resolve the store path from the
    manifest `memory:` key (default `.claude/craft-memory.md`, ADR-118/121) rooted at the
    repo ROOT (the worktree/checkout root — NEVER `${CLAUDE_PLUGIN_ROOT}`, HARD CONSTRAINT
    Req 1); call `load`; hold the single `MemoryView` in-session beside the run record; a
    cold/absent/malformed store yields an empty view and a recorded load no-op (never a
    blocker, ADR-116/120). State that `load` is **once per run, not per phase** (Design
    §Read lifecycle rationale).
  - **Phase-walk step 3 "Assemble the injected block" (lines 122–142)** is the injection
    surface. **Add a clause:** at each phase's entry the orchestrator slices THIS phase's
    concern from the held `MemoryView` (per the per-phase Reads table below) and **prepends
    it into the step-3 injected contract block as part of the pre-chewed context** — the
    SAME slot for agent (block PREPENDED to the Task prompt) and inline (block loaded at
    phase entry). **No new injection surface** — it is one more pre-chewed fact the assembler
    folds in. A hint that fails validate-on-read was already dropped at `load`, so the phase
    simply probes as today (advisory-only, never gates).
  - **§"Agent spawns" slot 1 "Injected contract block" (around lines 260–275 / the "Agent
    spawns" bullet)** — cross-reference it from the new step-3 clause so an implementer sees
    the hint rides the existing slot, not a new prompt section. Cite `docs/adapters/memory.md`
    Claude binding.
  - **§Done (lines 360–363)** is the run-end synthesis point. The model-class-matrix /
    backlog-follow-up synthesis is the precedent for "fill a committed diffable artifact +
    append a one-line run-record entry" (run skill §"Model-class matrix", lines ~302–312).
    **Add a `save` step at run end** (the same run-end synthesis slot): derive the `delta`
    from the run-record-buffered observations and call `save(repoRoot, delta)` **once**,
    atomically; ALSO append the run's per-spawned-phase metrics (`tokens`, `duration_ms`,
    cache hit/miss — harness-sourced from each spawn's usage block) to the **separate
    append-only `.claude/craft-metrics.md` artifact** (ADR-119), never into the learnings
    store. A **failed `save` is a recorded warning, never a blocker** (ADR-120); no locking.
    State the writes are buffered all run and flushed ONCE at end (so a phase that later
    blocks leaves the store unchanged — atomicity, Req 6).
  - **No-provenance reminder:** the metrics/store writes carry SHA+date provenance only —
    NOT `P22`/`ADR`/backlog refs (run skill §Provenance, lines ~85–86 already states the
    source/test rule; the store's `produced-by @sha` is store bookkeeping, allowed —
    Design §Anti-staleness guard 4).
- **Files 2–6: per-phase read/write surface notes** — add a short, explicit
  read/write-surface note to each phase's Preamble (the advisory hint is read at phase
  entry; the write is buffered to the run record). Per Design §Per-phase read/write contract
  table:
  - **`skills/workspace/SKILL.md`** (Preamble, after line 12): READS last ecosystem/toolchain
    → skip re-detect if the lockfile fingerprint is unchanged (still re-detects on a miss);
    WRITES the detected ecosystem + lockfile fingerprint (the
    `scripts/worktree-setup.sh` lockfile detection already produces this — pnpm/yarn/bun/uv/
    poetry/cargo/go/bundler/composer/npm, lines 15–33). Hint never gates.
  - **`skills/planning/SKILL.md`** (Preamble, after line 13): READS slice-sizing that landed
    cleanly last run as a weak planner hint (no per-use re-check); WRITES none directly
    (sizing is observed at implementation).
  - **`skills/implementation/SKILL.md`** (Preamble, after line 14): READS the discovered
    gate/test command → skip re-discovery but **still RUNS it** (the gate is sacred — Req 2);
    WRITES the gate/test command + per-slice size + pass/blocked outcome.
  - **`skills/review/SKILL.md`** (Preamble, after line 17): READS recurring `Finding[]` as
    advisory **watch-items** the reviewers check FIRST (a cached finding pre-empts, never
    replaces, the full-diff review); WRITES findings that recurred this run
    (file/severity/pattern — **NOT** provenance refs, NOT code snippets, NOT the finding
    prose body, per ADR-123 whitelist).
  - **`skills/validation/SKILL.md`** (Preamble — add as a new numbered step after the DoD
    step (after line 34) and BEFORE/around the mutation-tooling probe at line 37): READS the
    mutation tool present/absent → skip re-probe but **still re-validates presence** (the
    config-file presence check); WRITES the mutation tool + config fingerprint. Keep this
    distinct from and non-interfering with the existing mutation-tooling probe's "phase ends
    here" exit (do not entangle the advisory read with the gating probe).
  - **(cross-cutting, stated in `skills/run/SKILL.md`'s `save` step, not per-phase):**
    per-spawned-phase `tokens` + `duration_ms` + cache hit/miss → the metrics artifact
    (usage-block-sourced; **agent-mode phases only** — role-less/inline phases have no spawn
    usage block; Design §"read/write surfaces already exist" source-boundary note).
- **What NOT to do:** do not add a `consumes`/`produces` pipeline edit, a contract bundle, a
  gate, or an `awaitingHarnesses` entry — the memory port is orchestrator-session wiring, not
  a pipeline artifact (Design §"Why a port"; P22-specific scope facts above). Do not make any
  read GATE — every read is advisory; a miss falls through to the existing probe.

### TDD steps

- RED (self-verified grep checklist — run each `grep` and confirm it was FAILING before the
  edits):
  - `grep -n 'craft-memory.md' skills/run/SKILL.md` → matches (the default store path is
    named at the `load`/`save` wiring). Fails before edit.
  - `grep -n 'craft-metrics.md' skills/run/SKILL.md` → matches (the separate metrics
    artifact, ADR-119). Fails before edit.
  - `grep -ni 'load.*store\|MemoryView\|memory.*once' skills/run/SKILL.md` → matches a
    once-per-run load clause. Fails before edit.
  - `grep -n 'docs/adapters/memory.md' skills/run/SKILL.md` → matches (cross-reference to the
    port doc). Fails before edit.
  - Ordering: the `load` clause line number is GREATER than the run-record-seed (step 1c,
    line 49) and LESS than the phase-walk start (`## Phase walk`, line 85) — i.e. load is in
    setup, before the walk. Verify by reading the two line numbers.
  - The `save` clause sits at/near §Done (line 360) — run-end, after the walk.
  - `grep -nil 'memory\|ecosystem.*fingerprint\|gate.*command.*skip\|watch-item\|mutation
    tool present' skills/{workspace,planning,implementation,review,validation}/SKILL.md` →
    each of the five files matches its read/write-surface note. Fail before edit.
- GREEN — make the prose edits per Context: the `load` step in run §0 setup; the per-phase
  concern-slice clause in phase-walk step 3 (citing §"Agent spawns" slot 1 +
  `docs/adapters/memory.md`); the `save` + metrics-append step at §Done; the five per-phase
  read/write-surface notes. Keep every read advisory (never gating); keep writes buffered to
  the run record, flushed once at run end.
- REFACTOR — re-read each edited region: confirm `load` is stated as once-per-run (not
  per-phase); confirm the store path resolves against repo ROOT, never `${CLAUDE_PLUGIN_ROOT}`
  (HARD CONSTRAINT); confirm the failed-`save`-is-a-warning wording (ADR-120); confirm the
  metrics go to `.claude/craft-metrics.md` and NEVER the learnings store (ADR-119); confirm
  the validation read note does not entangle the mutation-tooling gating probe; confirm no
  read is described as gating.

### Gate

- Targeted (slice): the self-verified grep checklist above against `skills/run/SKILL.md` and
  the five phase skills (all assertions pass).
- Phase-boundary: `bash scripts/ci.sh` (prose edits to `.md` files under `skills/` change no
  executable surface; ci stays green).

### Commit

`feat(run): wire the memory port — load at start, save at end, per-phase advisory read/write (ADR-116/118/119)`

## Slice 6 — emit the `.gitignore` re-include + guard the store-path config wiring (ADR-118/119) — config + test-infra

### Context

Config-wiring + test-infra slice (no `src/` delta), legitimately standalone — it ships the
default-config storage wiring (the `.gitignore` re-include the build "emits/maintains" per
ADR-118) and a bats structure guard so the wiring + the port doc's no-provenance discipline
can't silently regress. **It does NOT create a live store** (dogfooding boundary) — only the
re-include lines that WOULD let a store commit if craft ever ran against this repo and a
guard over the re-include + the port doc.

- **File 1: `.gitignore`** (10 lines today). Current re-include block (lines 6–10) follows
  the ADR-063 `!`-line pattern:
  ```
  !examples/.claude/
  !examples/.claude/workflow/
  !examples/.claude/workflow/*.md
  !adapters/pi/.claude/
  !adapters/pi/.claude/workflow.md
  ```
  The user's global `~/.gitignore` excludes every `.claude/` directory; this repo
  re-includes specific committed `.claude/` paths. **Add the store + metrics re-include
  lines** so the default-configured store path (`.claude/craft-memory.md`) and the metrics
  artifact (`.claude/craft-metrics.md`, ADR-119) are committed-by-default when present
  (ADR-118: "the build emits/maintains a `.gitignore` re-include for the store path; the
  default ships one for `.claude/craft-memory.md` and `.claude/craft-metrics.md`, both under
  the same re-include"). Append:
  ```
  !.claude/
  !.claude/craft-memory.md
  !.claude/craft-metrics.md
  ```
  - **Re-include semantics:** a `!.claude/` directory re-include is required before a
    `!.claude/<file>` file re-include can take effect under a parent-dir ignore (git will not
    descend into an ignored dir to un-ignore a child without the dir re-include — the
    existing `!examples/.claude/` / `!adapters/pi/.claude/` lines prove this exact pattern).
    Keep the file lines specific (the two named artifacts only) — do NOT broaden to
    `!.claude/*` (that would re-include `.claude/workflow.md` and anything else, beyond P22's
    scope).
  - **Dogfooding caveat:** these lines do not CREATE a store; they only re-include the paths
    if/when a store file exists. This repo has no `.claude/craft-memory.md` (and this slice
    must not create one) — the lines are inert until craft runs against this repo and writes
    one. Confirm `git status` shows no new `.claude/craft-memory.md` after this slice.
- **File 2: `test/p22-memory.bats`** (new bats file; gated by `bats test/` in
  `scripts/ci.sh` — **no count gate**, so NO `EXPECTED_TESTS`/`scripts/ci.sh` edit). Precedent
  to mirror exactly: **`test/p10-structure.bats`** (the repo's structure-guard pattern):
  opens with `ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"`, then `@test "…" { [ -f
  "${ROOT}/<path>" ] }` and `grep -q …` assertions. Copy the `ROOT` resolution, `[ -f … ]`
  existence checks, and `grep -q` content checks. (Compare with `test/p20-dod.bats` if
  present for the most recent example of the same idiom.)
- **Guard assertions** (each a separate `@test` for clean failure attribution):
  1. `.gitignore` re-includes the store path — `grep -qx '!.claude/craft-memory.md'
     "${ROOT}/.gitignore"`.
  2. `.gitignore` re-includes the metrics path — `grep -qx '!.claude/craft-metrics.md'
     "${ROOT}/.gitignore"`.
  3. `.gitignore` re-includes the `.claude/` dir (so the file re-includes take effect) —
     `grep -qx '!.claude/' "${ROOT}/.gitignore"`.
  4. the memory port doc exists — `[ -f "${ROOT}/docs/adapters/memory.md" ]` (the S4
     artifact; guards it can't be deleted).
  5. **no-provenance-leak** (Design §Test strategy "No-provenance-leak", core contract): no
     `P22`/`ADR` token appears in `engine/src/memory.js` or `engine/test/memory.test.js`
     (the store's `produced-by` provenance is a SHA, not a craft backlog ref) —
     `! grep -rE 'P22|ADR-[0-9]' "${ROOT}/engine/src/memory.js"
     "${ROOT}/engine/test/memory.test.js"`. (The port doc is exempt — a docs artifact may
     carry ADR refs in prose; the ban is on source/test, matching the existing no-provenance
     lints.)
  - **Do NOT add a standing `[ ! -f .claude/craft-memory.md ]` guard.** A real
    craft-on-craft run legitimately writes a live store into this repo (it is then the
    target) — a permanent absence guard would break the first honest dogfooding run, which
    contradicts the design. The dogfooding boundary is a **build-time, slice-scoped**
    constraint (this slice must not author a live store), verified once in this slice's
    REFACTOR via `git status`, NOT a CI invariant.

  The guard is **five** `@test` cases (1–5 above).
- shellcheck note: bats files are NOT linted by `shellcheck scripts/*.sh hooks/*.sh` (only
  `scripts/`+`hooks/` shell), so no shellcheck concern for `test/p22-memory.bats`. The
  `.gitignore` edit is not shell — no shellcheck impact.

### TDD steps

- RED — author `test/p22-memory.bats` with the five `@test` cases above; run `bats
  test/p22-memory.bats`. Before the `.gitignore` edit, cases 1–3 FAIL (the re-include lines
  are absent); case 4 passes (S4 landed the port doc); case 5 passes (S2/S3 kept source
  clean). Confirm cases 1–3 are red against the current `.gitignore` (read it back / run the
  bats file and see the failures) before editing.
- GREEN — add the three `!.claude/…` re-include lines to `.gitignore`; re-run `bats
  test/p22-memory.bats` → all five pass.
- REFACTOR — confirm G/W/T-style `@test` titles; confirm `ROOT` resolution matches the
  p10/p20 precedent; confirm no assertion mutates the worktree (all are read-only `grep`/`[
  -f ]`/`[ ! -f ]`); confirm the `.gitignore` additions sit with the existing `!`-block and
  do NOT broaden to `!.claude/*`; confirm `git status` shows no new `.claude/craft-memory.md`.

### Gate

- Targeted (slice): `bats test/p22-memory.bats` (all five cases pass against the edited
  `.gitignore`, the landed port doc, and the clean source).
- Phase-boundary: `bash scripts/ci.sh` (the new bats file is picked up by `bats test/`; no
  count gate; shellcheck unaffected; ci stays green).

### Commit

`chore(memory): emit the .gitignore store re-include and guard the config wiring (ADR-118/119)`
