# Plan — P7: pipeline editing

> Source: design doc `docs/DESIGN-P7-pipeline-editing.md` · ADRs 024, 025, 026, 027
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Constraints and risks

### Public-surface decision (binding)

`engine/src/index.js` exports SEVEN symbols and they are FROZEN for P7:
```
parsePipeline, validatePipeline, ALIAS_MAP, resolveAlias,
resolvePipeline, assembleContract, normalizeFindings, validateManifest
```

`applyReorder` and `checkReorderApplicability` are **internal** to `engine/src/edits.js` —
siblings of the already-internal `applyEnableEdits`/`applyInserts`. They are NOT re-exported
from `index.js`. `resolve.js` imports them directly (as it imports `applyEnableEdits` today).

`resolvePipeline`'s signature `(defaults, manifest)` and return shape
`{ ok, errors, effective, record, gateDecisions, waivers }` stay unchanged.
`pipeline/default.yml` (13 descriptors), `graph.js`'s `validatePipeline(descriptors)`,
`contract.js`'s `assembleContract`, and `engine/src/index.js` are untouched by every part.

### Surface-gate tests that must stay green at every commit

SC1, S1, S2, S3, S-lean, S-full, contract-equivalence. CI: `bash scripts/ci.sh`.

### Risk: SC3 effective-order derivation

The design's §SC3 works the example with 12-position indices (omitting `requirements` and
`architecture` which are default-off), so its "slot 5 = review, slot 7 = validation" language
uses enabled-only indices. `applyReorder` operates on the **full 14-descriptor post-insert
list** (including disabled `requirements`, `refactoring`, `architecture`). The plan pre-derives
the correct full-list slot indices in Part 4's Context block.

## Sizing rules

- Every part costs a full agent lifecycle — it must earn it. No standalone test-only parts.
- Sequential parts share one working tree; each builds on the prior.

## Prose follow-ups (session-direct, not plan parts)

These two changes have no RED/GREEN TDD cycle and violate plan-lint's `## Part` schema —
they are tracked here for the session-direct pass after the 4 parts land:

1. **`skills/run/SKILL.md` step-1 walk change** (ADR-025): relax dispatch target from
   `craft:<phase.id>` to `phase.procedure` verbatim (namespace-agnostic). Update the "Walk
   error paths" table: "unknown phase id `<id>`" → "procedure `<phase.procedure>` resolves to
   no installed skill". File: `skills/run/SKILL.md`.

2. **`docs/DESIGN-customizable-engine.md` SoT update**: in the manifest-schema table, change
   the `reorder` row from "deferred, pending DC-5" to the live status; update the walk step-1
   and editing-semantics reorder lines to reflect the P7 landing.

---

## Part 1 — manifest.js: accept and shape-validate `pipeline.reorder`

### Context

**File to edit:** `engine/src/manifest.js`

**Symbol to change:** `PIPELINE_KEYS` (line 48) and `validatePipelineKeys` (lines 156–163).

**Current `PIPELINE_KEYS`** (line 48):
```js
const PIPELINE_KEYS = Object.freeze(new Set(['profile', 'skip', 'insert']));
```

**Current `validatePipelineKeys`** (lines 156–163):
```js
function validatePipelineKeys(pipeline, errors) {
  if (!pipeline || typeof pipeline !== 'object' || Array.isArray(pipeline)) return;
  for (const key of Object.keys(pipeline)) {
    if (!PIPELINE_KEYS.has(key)) {
      errors.push(`unknown pipeline key: ${key}`);
    }
  }
}
```

**New private function to add** — `validateReorder(reorder, errors)`, placed immediately before
`validatePipelineKeys` (mirroring the existing `validateModels`/`validateGates`/`validatePr`/
`validateScripts` private-fn pattern; DC-C from ADR-024):
```js
function validateReorder(reorder, errors) {
  if (!Array.isArray(reorder)) {
    errors.push('pipeline.reorder must be a list of phase ids');
    return;
  }
  for (const [i, item] of reorder.entries()) {
    if (typeof item !== 'string') {
      errors.push(`pipeline.reorder[${i}]: expected a string id, got ${typeof item}`);
    }
  }
}
```

**Updated `PIPELINE_KEYS`**:
```js
const PIPELINE_KEYS = Object.freeze(new Set(['profile', 'skip', 'insert', 'reorder']));
```

**Updated `validatePipelineKeys`** — add the `hasOwn` call for `reorder` after the loop (mirroring
the hasOwn guard pattern found elsewhere in the file):
```js
function validatePipelineKeys(pipeline, errors) {
  if (!pipeline || typeof pipeline !== 'object' || Array.isArray(pipeline)) return;
  for (const key of Object.keys(pipeline)) {
    if (!PIPELINE_KEYS.has(key)) {
      errors.push(`unknown pipeline key: ${key}`);
    }
  }
  if (Object.hasOwn(pipeline, 'reorder')) {
    validateReorder(pipeline.reorder, errors);
  }
}
```

**Test file to extend:** `engine/test/manifest.test.js`

The test file uses `import { validateManifest } from '../src/manifest.js'` and the pattern:
```js
test('Given <condition>, when validateManifest runs, then <assertion>', () => {
  const sut = validateManifest;
  const result = sut(<manifest>, { fileExists: ALWAYS_EXISTS });
  assert.equal(result.ok, <bool>);
  // optional: assert on result.errors
});
```
Constants `ALWAYS_EXISTS = () => true` and `NEVER_EXISTS = () => false` are already defined at
the top of the file. Extend the `// ─── pipeline sub-key validation ───` section.

**No new exports.** `validateReorder` is a named private function — not exported, not in
`index.js`.

### TDD steps

**RED — write these 4 tests in `engine/test/manifest.test.js` before touching `manifest.js`:**

```js
// RED 1
test('Given pipeline.reorder: [validation, review] in manifest, when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;
  const result = sut(
    { pipeline: { reorder: ['validation', 'review'] } },
    { fileExists: ALWAYS_EXISTS },
  );
  assert.deepEqual(result, { ok: true, errors: [] });
});
```
Expected failure: `errors` contains `"unknown pipeline key: reorder"` → `ok: false`.

```js
// RED 2
test('Given pipeline.reorder: "not-a-list" in manifest, when validateManifest runs, then ok:false with shape error', () => {
  const sut = validateManifest;
  const result = sut(
    { pipeline: { reorder: 'not-a-list' } },
    { fileExists: ALWAYS_EXISTS },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('pipeline.reorder must be a list of phase ids')));
});
```
Expected failure: `ok: false` but with `"unknown pipeline key: reorder"` error, not the shape error.

```js
// RED 3
test('Given pipeline.reorder: [1, 2] in manifest (non-string items), when validateManifest runs, then ok:false with item-type error', () => {
  const sut = validateManifest;
  const result = sut(
    { pipeline: { reorder: [1, 2] } },
    { fileExists: ALWAYS_EXISTS },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('pipeline.reorder[0]') && e.includes('number')));
});
```
Expected failure: same reason as RED 2.

```js
// RED 4
test('Given pipeline.reorder: [] in manifest (empty list), when validateManifest runs, then ok:true (empty is valid shape)', () => {
  const sut = validateManifest;
  const result = sut(
    { pipeline: { reorder: [] } },
    { fileExists: ALWAYS_EXISTS },
  );
  assert.deepEqual(result, { ok: true, errors: [] });
});
```
Expected failure: `ok: false` with `"unknown pipeline key: reorder"`.

Run `cd engine && node --test` → confirm 4 new tests fail.

**GREEN — edit `engine/src/manifest.js`:**

1. Change `PIPELINE_KEYS` to add `'reorder'`.
2. Add private `validateReorder(reorder, errors)` above `validatePipelineKeys`.
3. Add `if (Object.hasOwn(pipeline, 'reorder')) validateReorder(pipeline.reorder, errors);`
   at the end of `validatePipelineKeys`.

Run `cd engine && node --test` → all 4 new tests pass; full suite stays green.

**REFACTOR:** No refactor needed — the pattern is already established by `validateModels`,
`validateGates`, etc.

### Gate

```
cd engine && node --test
```

All existing tests must pass. Verify with:
```
cd engine && node --test 2>&1 | tail -5
```

### Commit

```
feat(manifest): accept and shape-validate pipeline.reorder sub-key
```

---

## Part 2 — edits.js: `applyReorder` (pure transform) + `checkReorderApplicability` (CQS query)

### Context

**File to edit:** `engine/src/edits.js`

**Current file structure** (128 lines): imports `DEFAULT_EXECUTION` from `./descriptor.js`;
exports `applyEnableEdits` (line 39) and `applyInserts` (line 89). No edits.test.js exists
today — edits are covered via `resolve.test.js`. This part adds **`engine/test/edits.test.js`**
as a dedicated unit test file for the two new functions. Rationale: `applyReorder` and
`checkReorderApplicability` are pure functions with rich edge-case surfaces (empty list, unknown
id, non-enabled, duplicate, alias-resolved); folding them into `resolve.test.js` would bloat
that file and obscure the unit signal. A dedicated file mirrors the one-file-per-module test
convention already used by `manifest.test.js`, `graph.test.js`, `profile.test.js`, etc.

**Functions to add to `engine/src/edits.js`** (append after `applyInserts`):

`checkReorderApplicability(descriptors, reorderList)` — a pure query, returns `string[]`.
It is a sibling of `checkStrandedConsumers` in `strand.js` (same return contract). Per ADR-026
it accumulates ALL errors (no short-circuit). Error message strings (verbatim — pinned for tests):
- Unknown id: `reorder: unknown id "${id}" — not present in the post-insert descriptor list`
- Non-enabled id: `reorder: "${id}" is not enabled — only enabled phases may be reordered`
- Duplicate id: `reorder: duplicate id "${id}" in pipeline.reorder list`
Unknown/non-enabled check runs before duplicate (per unknown check: look up descriptor first;
if found, check enabled; duplicate detection is independent via a `seen` Set).

Algorithm: one pass over `reorderList` with a `seen` Set —
```js
export function checkReorderApplicability(descriptors, reorderList) {
  const byId = new Map(descriptors.map(d => [d.id, d]));
  const seen = new Set();
  const errors = [];
  for (const id of reorderList) {
    const descriptor = byId.get(id);
    if (!descriptor) {
      errors.push(`reorder: unknown id "${id}" — not present in the post-insert descriptor list`);
    } else if (!descriptor.enabled) {
      errors.push(`reorder: "${id}" is not enabled — only enabled phases may be reordered`);
    }
    if (seen.has(id)) {
      errors.push(`reorder: duplicate id "${id}" in pipeline.reorder list`);
    }
    seen.add(id);
  }
  return errors;
}
```

`applyReorder(descriptors, reorderList)` — a pure command, returns `{ descriptors, records }`.
Never returns errors (CQS). Empty list = no-op. Algorithm:
```js
export function applyReorder(descriptors, reorderList) {
  if (!reorderList || reorderList.length === 0) return { descriptors, records: [] };
  const reorderSet = new Set(reorderList);
  const slots = descriptors.reduce((acc, d, i) => {
    if (reorderSet.has(d.id)) acc.push(i);
    return acc;
  }, []);
  const byId = Object.fromEntries(descriptors.map(d => [d.id, d]));
  const reordered = [...descriptors];
  for (let k = 0; k < slots.length; k++) {
    reordered[slots[k]] = byId[reorderList[k]];
  }
  const records = reorderList.map(id => `reorder: ${id} (pipeline.reorder)`);
  return { descriptors: reordered, records };
}
```
`applyReorder` does NOT import anything new — no new imports needed in `edits.js`.

**Test file to create:** `engine/test/edits.test.js`

Import pattern (matching the project style):
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyReorder, checkReorderApplicability } from '../src/edits.js';
```

Helper for building minimal descriptor stubs:
```js
function makeDescriptor(id, enabled = true) {
  return { id, enabled, contract: [], consumes: [], produces: [], self_supply: [] };
}
```

### TDD steps

**RED — write `engine/test/edits.test.js` with the following test groups:**

Group A: `checkReorderApplicability` — 5 tests:

```js
// RED A1
test('Given an applicable reorder list, when checkReorderApplicability runs, then it returns []', () => {
  const descriptors = [makeDescriptor('review'), makeDescriptor('validation')];
  const result = checkReorderApplicability(descriptors, ['validation', 'review']);
  assert.deepEqual(result, []);
});
```
Expected failure: `checkReorderApplicability is not a function`.

```js
// RED A2
test('Given a reorder list with an unknown id, when checkReorderApplicability runs, then it returns the unknown-id message', () => {
  const descriptors = [makeDescriptor('review')];
  const result = checkReorderApplicability(descriptors, ['ghost']);
  assert.ok(result.some(e => e.includes('"ghost"') && e.includes('not present')));
});
```

```js
// RED A3
test('Given a reorder list with a non-enabled id, when checkReorderApplicability runs, then it returns the non-enabled message', () => {
  const descriptors = [makeDescriptor('review'), makeDescriptor('refactoring', false)];
  const result = checkReorderApplicability(descriptors, ['refactoring']);
  assert.ok(result.some(e => e.includes('"refactoring"') && e.includes('not enabled')));
});
```

```js
// RED A4
test('Given a reorder list with a duplicate id, when checkReorderApplicability runs, then it returns the duplicate message', () => {
  const descriptors = [makeDescriptor('review')];
  const result = checkReorderApplicability(descriptors, ['review', 'review']);
  assert.ok(result.some(e => e.includes('"review"') && e.includes('duplicate')));
});
```

```js
// RED A5
test('Given a list with multiple distinct problems, when checkReorderApplicability runs, then it accumulates ALL errors (no short-circuit)', () => {
  const descriptors = [makeDescriptor('review'), makeDescriptor('refactoring', false)];
  // unknown id, non-enabled id, duplicate
  const result = checkReorderApplicability(descriptors, ['ghost', 'refactoring', 'review', 'review']);
  assert.ok(result.length >= 3, `expected 3+ errors, got ${result.length}: ${JSON.stringify(result)}`);
  assert.ok(result.some(e => e.includes('"ghost"') && e.includes('not present')));
  assert.ok(result.some(e => e.includes('"refactoring"') && e.includes('not enabled')));
  assert.ok(result.some(e => e.includes('"review"') && e.includes('duplicate')));
});
```

Group B: `applyReorder` — 5 tests:

```js
// RED B1
test('Given a valid reorder list, when applyReorder runs, then slots are permuted and record lines emitted', () => {
  const review = makeDescriptor('review');
  const validation = makeDescriptor('validation');
  const descriptors = [review, validation];
  const result = applyReorder(descriptors, ['validation', 'review']);
  assert.equal(result.descriptors[0].id, 'validation');
  assert.equal(result.descriptors[1].id, 'review');
  assert.deepEqual(result.records, [
    'reorder: validation (pipeline.reorder)',
    'reorder: review (pipeline.reorder)',
  ]);
});
```
Expected failure: `applyReorder is not a function`.

```js
// RED B2
test('Given an empty reorder list, when applyReorder runs, then descriptors unchanged and records empty', () => {
  const descriptors = [makeDescriptor('review'), makeDescriptor('validation')];
  const result = applyReorder(descriptors, []);
  assert.deepEqual(result.descriptors, descriptors);
  assert.deepEqual(result.records, []);
});
```

```js
// RED B3
test('Given a reorder list referencing an inserted phase id, when applyReorder runs, then it succeeds and returns correct order', () => {
  const descriptors = [makeDescriptor('validation'), makeDescriptor('bench'), makeDescriptor('documentation')];
  const result = applyReorder(descriptors, ['bench', 'validation']);
  assert.equal(result.descriptors[0].id, 'bench');
  assert.equal(result.descriptors[1].id, 'validation');
  assert.equal(result.descriptors[2].id, 'documentation');
});
```

```js
// RED B4
test('Given any input, when applyReorder runs, then the input descriptor list is not mutated (immutability)', () => {
  const d1 = makeDescriptor('review');
  const d2 = makeDescriptor('validation');
  const original = [d1, d2];
  const originalIds = original.map(d => d.id);
  applyReorder(original, ['validation', 'review']);
  assert.deepEqual(original.map(d => d.id), originalIds, 'input array must not be mutated');
});
```

```js
// RED B5
test('Given a disabled descriptor sandwiched between reordered phases, when applyReorder runs, then the disabled descriptor keeps its position', () => {
  // disabled = refactoring; reorder [validation, review]; slots at index 1 and 3
  const descriptors = [
    makeDescriptor('review'),        // index 0 — in reorderSet
    makeDescriptor('refactoring', false), // index 1 — NOT in reorderSet
    makeDescriptor('validation'),    // index 2 — in reorderSet
  ];
  const result = applyReorder(descriptors, ['validation', 'review']);
  assert.equal(result.descriptors[0].id, 'validation');
  assert.equal(result.descriptors[1].id, 'refactoring');
  assert.equal(result.descriptors[2].id, 'review');
});
```

Run `cd engine && node --test` → all 10 new tests fail with module-not-found or function-not-found errors.

**GREEN — edit `engine/src/edits.js`:**

Append `checkReorderApplicability` and `applyReorder` after the `applyInserts` export, using
the exact implementations shown in the Context block above. No imports needed — no new
dependencies.

Run `cd engine && node --test` → all 10 new tests pass; full suite stays green.

**REFACTOR:** Verify both functions are under 20 lines each; verify no mutation of inputs.
The `checkReorderApplicability` one-pass-with-seen pattern is already the most expressive
form — no further refactor warranted.

### Gate

```
cd engine && node --test
```

### Commit

```
feat(edits): add applyReorder pure transform and checkReorderApplicability CQS query
```

---

## Part 3 — resolve.js: wire reorder into the pipeline resolver

### Context

**File to edit:** `engine/src/resolve.js`

**Current import line 14** (the edits import):
```js
import { applyEnableEdits, applyInserts } from './edits.js';
```

**Change to:**
```js
import { applyEnableEdits, applyInserts, applyReorder, checkReorderApplicability } from './edits.js';
```

**Current `aliasResolve` function** (lines 20–37). The return statement (line 34) currently:
```js
return {
  ...manifest,
  pipeline: { ...pipeline, skip: resolvedSkip, insert: resolvedInsert },
  phases: resolvedPhases,
};
```

**Change to** (add `resolvedReorder` resolution and thread it through):
```js
const resolvedReorder = (pipeline.reorder ?? []).map(resolveAlias);
return {
  ...manifest,
  pipeline: { ...pipeline, skip: resolvedSkip, insert: resolvedInsert, reorder: resolvedReorder },
  phases: resolvedPhases,
};
```

**Current `resolvePipeline` body** (lines 151–211). The relevant block at lines 170–178:
```js
const enableResult = applyEnableEdits([...defaults], skipSet, phaseOverrides);
const insertResult = applyInserts(enableResult.descriptors, resolved.pipeline?.insert ?? []);
const execResult = resolveExecution(
  insertResult.descriptors, phaseOverrides, profile, resolved.execution, profileName,
);

const manifestRecords = buildManifestRecords(resolved);
const record = [...enableResult.records, ...insertResult.records, ...execResult.records, ...manifestRecords];
```

**Change to** (insert the reorder guard + transform between `insertResult` and `execResult`):
```js
const enableResult = applyEnableEdits([...defaults], skipSet, phaseOverrides);
const insertResult = applyInserts(enableResult.descriptors, resolved.pipeline?.insert ?? []);

const reorderErrors = checkReorderApplicability(insertResult.descriptors, resolved.pipeline?.reorder ?? []);
if (reorderErrors.length > 0) {
  return { ok: false, errors: reorderErrors, effective: [], record: [], gateDecisions: [], waivers: [] };
}
const reorderResult = applyReorder(insertResult.descriptors, resolved.pipeline?.reorder ?? []);

const execResult = resolveExecution(
  reorderResult.descriptors, phaseOverrides, profile, resolved.execution, profileName,
);

const manifestRecords = buildManifestRecords(resolved);
const record = [
  ...enableResult.records,
  ...insertResult.records,
  ...reorderResult.records,
  ...execResult.records,
  ...manifestRecords,
];
```

Also update the `checkStrandedConsumers` call (line 179) — it already uses `execResult.descriptors`
which is correct (strand check still operates on the post-reorder, post-exec descriptor list).
The `validatePipeline` call (line 184) similarly uses `execResult.descriptors` — this is the
post-reorder list, so a consumer-before-producer reorder fires the graph check correctly.

**No change** to `resolvePipeline`'s signature, return shape, or any step outside the block above.

**Test file to extend:** `engine/test/resolve.test.js`

The file imports `resolvePipeline` from `'../src/resolve.js'`. The `loadDefault()` helper reads
`pipeline/default.yml` via `parsePipeline`. Existing test patterns use inline manifests for
structural tests and `loadManifest(name)` for fixture-based tests.

Add 4 new inline tests at the end of the file:

**Test 1 — alias-resolved reorder id:**
```js
test('Given pipeline.reorder containing an alias id (mutation), when resolvePipeline runs, then ok:true and reorder applies via canonical id', () => {
  const defaults = loadDefault();
  const manifest = { pipeline: { reorder: ['mutation', 'review'] } };
  const result = resolvePipeline(defaults, manifest);
  assert.equal(result.ok, true, `Expected ok but got errors: ${JSON.stringify(result.errors)}`);
  const ids = result.effective.map(d => d.id);
  assert.ok(ids.indexOf('validation') < ids.indexOf('review'),
    'validation (alias: mutation) must precede review after reorder');
});
```

**Test 2 — fail-fast on applicability error:**
```js
test('Given pipeline.reorder containing an unknown id, when resolvePipeline runs, then ok:false with unknown-id error', () => {
  const defaults = loadDefault();
  const manifest = { pipeline: { reorder: ['ghost-phase'] } };
  const result = resolvePipeline(defaults, manifest);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('"ghost-phase"') && e.includes('not present')));
});
```

**Test 3 — valid reorder changes effective order:**
```js
test('Given pipeline.reorder: [validation, review], when resolvePipeline runs, then effective has validation before review', () => {
  const defaults = loadDefault();
  const manifest = { pipeline: { reorder: ['validation', 'review'] } };
  const result = resolvePipeline(defaults, manifest);
  assert.equal(result.ok, true, `Expected ok but got errors: ${JSON.stringify(result.errors)}`);
  const ids = result.effective.map(d => d.id);
  assert.ok(ids.indexOf('validation') < ids.indexOf('review'),
    'validation must precede review after reorder');
  assert.ok(result.record.some(r => r === 'reorder: validation (pipeline.reorder)'));
  assert.ok(result.record.some(r => r === 'reorder: review (pipeline.reorder)'));
});
```

**Test 4 — reorder-refused via graph (consumer before producer):**
```js
test('Given pipeline.reorder:[validation, implementation] (consumer before producer), when resolvePipeline runs, then ok:false with a graph error mentioning validation and change', () => {
  const defaults = loadDefault();
  const manifest = { pipeline: { reorder: ['validation', 'implementation'] } };
  const result = resolvePipeline(defaults, manifest);
  assert.equal(result.ok, false);
  const hasGraphError = result.errors.some(e => e.includes('validation') && e.includes('change'));
  assert.ok(hasGraphError, `errors must mention validation+change consumer-before-producer; got: ${JSON.stringify(result.errors)}`);
});
```

### TDD steps

**RED — add the 4 tests to `engine/test/resolve.test.js` before editing `resolve.js`:**

Run `cd engine && node --test` → all 4 new tests fail:
- Test 1: `alias mutation` → ok:true but validation still comes AFTER review (no reorder wiring) — so assertion fails.
- Test 2: ok:true (reorder key is silently ignored without wiring) — fails `ok === false` assertion.
- Test 3: same — ok:true but order unchanged.
- Test 4: ok:true (reorder ignored, graph not violated in original order) — fails `ok === false`.

**GREEN — edit `engine/src/resolve.js`:**

1. Extend the `import` line to add `applyReorder, checkReorderApplicability`.
2. In `aliasResolve`: add `resolvedReorder` line and include in return.
3. In `resolvePipeline`: insert the guard + reorder block between `insertResult` and `execResult`;
   update `record` array construction.

Run `cd engine && node --test` → all 4 new tests pass; all existing tests remain green.

**REFACTOR:** Verify the `resolvePipeline` function is still under 60 lines. The new block
adds 6 lines; the function was ~60 before — extract helpers if it exceeds 80. In practice the
new block matches the existing guard+transform pattern for `checkStrandedConsumers` and stays
readable without extraction.

### Gate

```
cd engine && node --test
```

### Commit

```
feat(resolve): wire checkReorderApplicability + applyReorder between insert and exec steps
```

---

## Part 4 — scenarios: SC3 composed golden + S-reorder positive + reorder-refused negative

### Context

**This part is the P7 gate (SC3 green).**

**New fixture files:**

`engine/test/fixtures/scenarios/SC3/manifest.yml`:
```yaml
pipeline:
  skip:
    - refactoring
  insert:
    - id: bench
      archetype: harness
      contract:
        - harness-exec
      procedure: craft:bench
      role: craft:bench-runner
      after: validation
      consumes:
        - change
      produces:
        - bench-report
      gate: node --test engine/test/bench.test.js
  reorder:
    - validation
    - review
```

`engine/test/fixtures/scenarios/S-reorder/manifest.yml`:
```yaml
pipeline:
  reorder:
    - validation
    - review
```

**Test file to extend:** `engine/test/scenarios.test.js`

Imports already present: `test`, `assert`, `readFileSync`, `fileURLToPath`, `join`, `dirname`,
`load` (js-yaml), `parsePipeline`, `resolvePipeline`, `assembleContract`, `HARNESS_ARCHETYPE`.
Helper `loadScenarioManifest(scenario)` already reads from `scenariosDir`. Helpers `loadDefault()`
and `loadScenarioManifest` are at lines 31–39.

**SC3 effective order — pre-derived (binding for golden assertions):**

Full descriptor pipeline after all three edits (14 entries, 0-based):

After `applyEnableEdits` (skip `refactoring`):
- [0] workspace (enabled)
- [1] requirements (enabled:false — default-off)
- [2] design (enabled)
- [3] decisions (enabled)
- [4] planning (enabled)
- [5] implementation (enabled)
- [6] review (enabled)
- [7] refactoring (enabled:false — skipped)
- [8] validation (enabled)
- [9] architecture (enabled:false — default-off)
- [10] documentation (enabled)
- [11] propose (enabled)
- [12] integrate (enabled)

After `applyInserts` (insert `bench` after `validation` at full-list index 8 → bench inserts at index 9):
- [0] workspace (enabled)
- [1] requirements (enabled:false)
- [2] design (enabled)
- [3] decisions (enabled)
- [4] planning (enabled)
- [5] implementation (enabled)
- [6] review (enabled)
- [7] refactoring (enabled:false)
- [8] validation (enabled)
- [9] bench (enabled — inserted)
- [10] architecture (enabled:false)
- [11] documentation (enabled)
- [12] propose (enabled)
- [13] integrate (enabled)

After `applyReorder` with `reorderList = ['validation', 'review']`:
- `reorderSet = {'validation', 'review'}`
- Scan all 14 descriptors: review at index 6 → slot; validation at index 8 → slot
- `slots = [6, 8]`
- Refill: slot 6 ← `reorderList[0]` = `validation`; slot 8 ← `reorderList[1]` = `review`
- Result: [0] workspace, [1] requirements(disabled), [2] design, [3] decisions, [4] planning,
  [5] implementation, **[6] validation**, [7] refactoring(disabled), **[8] review**, [9] bench,
  [10] architecture(disabled), [11] documentation, [12] propose, [13] integrate

Graph validity: validation (index 6) consumes `change` ← implementation (index 5) produces ✓.
Review (index 8) consumes `change` ← implementation (index 5) produces ✓.

**SC3 effective ids (enabled-only, 11 phases):**
```
['workspace', 'design', 'decisions', 'planning', 'implementation', 'validation', 'review', 'bench', 'documentation', 'propose', 'integrate']
```

**SC3 pinned record lines** (subset that tests must assert; must appear in this relative order):
1. `skip: refactoring (manifest pipeline.skip)`
2. `insert: bench (after:validation)`
3. `reorder: validation (pipeline.reorder)`
4. `reorder: review (pipeline.reorder)`

**SC3 gateDecisions assertions:**
- `gateDecisions.find(g => g.phaseId === 'bench').gate === 'node --test engine/test/bench.test.js'`
- `gateDecisions.find(g => g.phaseId === 'propose').awaitingHarnesses` includes `'validation'` and `'bench'`
  (both are `harness-exec` archetype, both enabled)
- `gateDecisions.find(g => g.phaseId === 'propose').awaitingHarnesses` does NOT include `'review'`
  (review is `harness-read`, not `harness-exec`)
- `gateDecisions.find(g => g.phaseId === 'refactoring')` is undefined
  (refactoring is skipped → not in effective → no gateDecision entry)

**S-reorder assertions** (simple reorder `[validation, review]` on default pipeline):
- `result.ok === true`
- `result.effective.length === 11` (same count as SC1)
- `ids.indexOf('validation') < ids.indexOf('review')` (swapped from SC1)
- `result.record.includes('reorder: validation (pipeline.reorder)')`
- `result.record.includes('reorder: review (pipeline.reorder)')`

**Reorder-refused negative** — inline test, no fixture dir:
- Manifest: `{ pipeline: { reorder: ['validation', 'implementation'] } }`
- Reorder algorithm with `reorderList = ['validation', 'implementation']`:
  - In the default post-insert (= default) list: implementation is at index 5, validation at index 8
  - slots = [5, 8]; refill slot 5 ← `validation`, slot 8 ← `implementation`
  - validation (now at 5) consumes `change` ← must come from implementation; but implementation is now at index 8 (after validation) → graph refuses
- Expected: `ok: false`; `errors.some(e => e.includes('validation') && e.includes('change'))`

### TDD steps

**RED — create the two fixture files, then add tests to `engine/test/scenarios.test.js`:**

Create `engine/test/fixtures/scenarios/SC3/manifest.yml` and
`engine/test/fixtures/scenarios/S-reorder/manifest.yml` using the YAML shown in the Context block.

Then add the following test blocks at the end of `engine/test/scenarios.test.js`
(after the `S-full` tests):

```js
// ─── S-reorder: valid reorder alone ──────────────────────────────────────────

test('S-reorder Given reorder:[validation, review], when resolvePipeline runs, then ok:true with validation before review', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-reorder');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const ids = result.effective.map(d => d.id);
  assert.ok(ids.indexOf('validation') < ids.indexOf('review'),
    'validation must precede review after reorder');
});

test('S-reorder Given reorder:[validation, review], when resolvePipeline runs, then effective length is 11', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-reorder');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.equal(result.effective.length, 11);
});

test('S-reorder Given reorder:[validation, review], when resolvePipeline runs, then record contains both reorder lines', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-reorder');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.ok(result.record.includes('reorder: validation (pipeline.reorder)'));
  assert.ok(result.record.includes('reorder: review (pipeline.reorder)'));
});
```

```js
// ─── SC3: composed golden (skip + insert + reorder) ──────────────────────────

const SC3_EFFECTIVE_IDS = [
  'workspace', 'design', 'decisions', 'planning', 'implementation',
  'validation', 'review', 'bench', 'documentation', 'propose', 'integrate',
];

test('SC3 Given skip:refactoring + insert:bench after validation + reorder:[validation,review], when resolvePipeline runs, then ok:true', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC3');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${JSON.stringify(result.errors)}`);
});

test('SC3 Given composed edits, when resolvePipeline runs, then effective id order matches SC3 golden', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC3');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.deepEqual(result.effective.map(d => d.id), SC3_EFFECTIVE_IDS);
});

test('SC3 Given composed edits, when resolvePipeline runs, then record includes all four pinned lines in order', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC3');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const rec = result.record;
  const skipIdx    = rec.indexOf('skip: refactoring (manifest pipeline.skip)');
  const insertIdx  = rec.indexOf('insert: bench (after:validation)');
  const reorder1Idx = rec.indexOf('reorder: validation (pipeline.reorder)');
  const reorder2Idx = rec.indexOf('reorder: review (pipeline.reorder)');
  assert.ok(skipIdx !== -1, 'record must include skip:refactoring line');
  assert.ok(insertIdx !== -1, 'record must include insert:bench line');
  assert.ok(reorder1Idx !== -1, 'record must include reorder:validation line');
  assert.ok(reorder2Idx !== -1, 'record must include reorder:review line');
  assert.ok(skipIdx < insertIdx, 'skip line must precede insert line');
  assert.ok(insertIdx < reorder1Idx, 'insert line must precede first reorder line');
  assert.ok(reorder1Idx < reorder2Idx, 'first reorder line must precede second');
});

test('SC3 Given composed edits, when resolvePipeline runs, then bench gateDecision has a non-empty gate', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC3');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const benchDecision = result.gateDecisions.find(g => g.phaseId === 'bench');
  assert.ok(benchDecision, 'gateDecisions must include bench');
  assert.ok(benchDecision.gate, 'bench must have a non-empty gate');
});

test('SC3 Given composed edits, when resolvePipeline runs, then propose awaits validation and bench but not review', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC3');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const proposeDecision = result.gateDecisions.find(g => g.phaseId === 'propose');
  assert.ok(proposeDecision, 'propose must have a gateDecision');
  assert.ok(proposeDecision.awaitingHarnesses.includes('validation'),
    'propose must await validation (harness-exec)');
  assert.ok(proposeDecision.awaitingHarnesses.includes('bench'),
    'propose must await bench (harness-exec)');
  assert.ok(!proposeDecision.awaitingHarnesses.includes('review'),
    'propose must not await review (harness-read, not harness-exec)');
});

test('SC3 Given composed edits, when resolvePipeline runs, then refactoring has no gateDecision entry (skipped)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC3');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const refactoringDecision = result.gateDecisions.find(g => g.phaseId === 'refactoring');
  assert.ok(!refactoringDecision, 'refactoring must have no gateDecision (it is skipped)');
});
```

```js
// ─── reorder-refused negative: consumer before producer ───────────────────────

test('Given reorder puts validation before implementation (consumer before producer), when resolvePipeline runs, then ok:false with a graph error mentioning validation and change', () => {
  const defaults = loadDefault();
  // reorder: [validation, implementation] — slots collected at implementation(5) and validation(8)
  // refilled: slot 5 gets validation, slot 8 gets implementation → validation precedes its change producer
  const manifest = { pipeline: { reorder: ['validation', 'implementation'] } };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, false);
  const hasGraphError = result.errors.some(e => e.includes('validation') && e.includes('change'));
  assert.ok(hasGraphError,
    `errors must mention the consumer-before-producer violation; got: ${JSON.stringify(result.errors)}`);
});
```

Run `cd engine && node --test` → the S-reorder and SC3 tests fail because the fixture dirs don't
exist yet (module error), or because the manifests don't produce the expected results.

Wait — fixture files must be created FIRST. Creation of the two fixture YAML files is part of
the GREEN step, since the RED for scenario tests fails due to missing fixture dirs (not due to
a logic failure). Create the fixture dirs+files immediately after writing the tests.

Correct RED sequence:
1. Write all new tests in `scenarios.test.js`.
2. Run `cd engine && node --test` → S-reorder and SC3 tests throw `ENOENT` (fixtures missing) — RED confirmed.
3. Create fixture dirs and YAML files.
4. Re-run `cd engine && node --test` → tests now exercise the resolver; some may fail if prior
   parts are already wired; all must pass after GREEN edits.

**GREEN:**

The fixture files created in step 3 above are the primary GREEN action for S-reorder and SC3
(assuming Parts 1–3 landed correctly). The inline reorder-refused negative test requires no
fixture. Run `cd engine && node --test` → all tests green.

**REFACTOR:** Verify the `SC3_EFFECTIVE_IDS` constant is declared once (not repeated per test).
Confirm test titles follow the existing `SC1 Given...` / `S3 Given...` naming pattern.

### Gate

Full CI gate (this is the P7 phase gate):
```
bash scripts/ci.sh
```

Verifies: `cd engine && node --test` + `bats test/` + `shellcheck` + `pipeline-lint` +
`pipeline-resolve` + `contracts-lint`. All must be green.

Surface-gate invariants to spot-check manually before committing:
- `result.effective.map(d => d.id)` for SC1 (null manifest) still equals `SC1_IDS` (11 phases, canonical order).
- S3 `bench` still present after `validation`.
- S-lean / S-full execution assignments unchanged.
- contract-equivalence suite passes.

### Commit

```
test(scenarios): SC3 composed golden + S-reorder positive + reorder-refused negative (P7 gate)
```
