# Plan — P8: per-phase harness config

> Source: design doc `docs/DESIGN-P8-harness-config.md` · ADRs 028, 029, 030, 031
> The plan is the implementation script AND the knowledge handoff. Slice agents start
> with zero context: whatever a slice block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Constraints and risks

### Public-surface decision (binding)

`engine/src/index.js` exports SEVEN symbols and they are FROZEN for P8:
```
parsePipeline, validatePipeline, ALIAS_MAP, resolveAlias,
resolvePipeline, assembleContract, normalizeFindings, validateManifest
```

`applyAllowedOverrides` is **internal** to `engine/src/edits.js` — not exported and
not in `index.js`. `validateHarness` is **internal** to `engine/src/manifest.js` —
named private function, not exported, not in `index.js`.

`resolvePipeline`'s signature `(defaults, manifest)` and return shape
`{ ok, errors, effective, record, gateDecisions, waivers }` stay unchanged.
`pipeline/default.yml` (13 descriptors, enabled/disabled state), `graph.js`'s
`validatePipeline(descriptors)`, `contract.js`'s `assembleContract`, and
`engine/src/index.js` are untouched by every slice — except that `pipeline/default.yml`
gains exactly one `harness:` block addition on the `review` descriptor (Slice 3).

### Surface-gate tests that must stay green at every commit

SC1, S1, S2, S3, S-lean, S-full, S-reorder, SC3, contract-equivalence.
CI: `bash scripts/ci.sh`.

### Risk: golden safety of the `review.harness` addition (Slice 3)

ADR-031 asserts the `pipeline/default.yml` `review.harness` add is **golden-safe**
because no test currently asserts a descriptor's `harness` value. This has been
verified against `engine/test/scenarios.test.js` and
`engine/test/contract-equivalence.test.js`. Specifically:
- SC1 pins `effective.map(d => d.id)`, execution values, gateDecisions length,
  propose's `awaitingHarnesses`, waivers, and the exact `record[]` strings
  (`default-skip: requirements` + `default-skip: architecture`). None of these
  concern the `harness:` field value.
- contract-equivalence tests pin `assembleContract` output blocks, which reads the
  `contract:` field, not `harness:`.
- S3 (insert bench) pins effective ids and gateDecisions; no harness assertion.
- S-reorder, SC3 pin effective id order and record lines; no harness assertion.

If a future test is added that pins `review.harness` BEFORE slice 3 lands, Slice 3's
`pipeline/default.yml` edit will cause that test to fail. The implementer must confirm
no such test exists before editing `pipeline/default.yml`.

### Risk: `applyEnableEdits` already wires `applyAllowedOverrides`

`resolve.js` line 171: `applyEnableEdits([...defaults], skipSet, phaseOverrides)`.
`applyEnableEdits` (edits.js line 39–67) calls `applyAllowedOverrides` internally.
Fixing the merge semantics in Slice 2 (`applyAllowedOverrides` in `edits.js`) is
**sufficient** — no new resolver wiring is needed. The merged harness flows onto every
descriptor in `enableResult.descriptors` automatically. The Slice 3 implementer must
NOT add new resolver steps.

### Risk: `validateManifest` not called by scenario tests

Scenario tests (`engine/test/scenarios.test.js`) call `resolvePipeline` directly,
bypassing `validateManifest`. The bad-harness-shape negative in Slice 3 therefore calls
`validateManifest` directly (same pattern as manifest.test.js), not through the
resolver. The deep-merge path is tested at the resolver level via S-harness fixtures.

## Sizing rules

- Every slice costs a full agent lifecycle — it must earn it. No standalone test-only slices.
- Sequential slices share one working tree; each builds on the prior.

## Prose follow-ups (session-direct, Slice 4)

`skills/review/SKILL.md`, `skills/validation/SKILL.md`, and `skills/run/SKILL.md`
have no RED/GREEN TDD cycle (prose edits). They are handled in Slice 4 as a
**session-direct** slice (no slice-implementer agent). Slice 4 carries no `node --test`
gate; it gets a focused consistency review.

---

## Work breakdown

| ID | Shape | Agent | Scope |
|----|-------|-------|-------|
| S1 | TDD | slice-implementer | `manifest.js`: expand `PHASE_FIELDS` + add `validateHarness` + inline role/model/enabled checks in `validatePhaseBlock` |
| S2 | TDD | slice-implementer | `edits.js`: change `applyAllowedOverrides` to deep-merge `harness` one level; new unit tests in `edits.test.js` |
| S3 | TDD | slice-implementer | `pipeline/default.yml` `review.harness` add + S-harness fixture dirs + scenario golden assertions |
| S4 | session-direct | (orchestrator session) | `skills/review/SKILL.md`, `skills/validation/SKILL.md`, `skills/run/SKILL.md` prose edits; `passes>1` parked items documented explicitly |

## Dependency order

S1 → S2 → S3 → S4 (strictly sequential; S3 depends on S2's deep-merge being green).

---

## Slice 1 — manifest.js: PHASE_FIELDS expansion + validateHarness + inline shape checks

### Context

**Shape:** TDD / slice-implementer

**File to edit:** `engine/src/manifest.js`

**Current `PHASE_FIELDS`** (line 27–29):
```js
const PHASE_FIELDS = Object.freeze(new Set([
  'context', 'override', 'strategy', 'merge-flags', 'non-blocking-jobs',
]));
```

**New `PHASE_FIELDS`** (ADR-028 — add `harness`, `execution`, `enabled`, `role`, `model`):
```js
const PHASE_FIELDS = Object.freeze(new Set([
  'context', 'override', 'strategy', 'merge-flags', 'non-blocking-jobs',
  'harness', 'execution', 'enabled', 'role', 'model',
]));
```

Note: `execution` is accepted by `PHASE_FIELDS` but its VALUE is NOT checked in
`validatePhaseBlock` — value checking already lives in `validateExecutionValues` in
`resolve.js`. Adding a value check here would duplicate ownership (ADR-028). The
`manifest.js` comment on line 274 already says `// backlog, paths, retrieval, execution:
recognized; no sub-validation` for the top-level key; the same reasoning applies here.

**New private function to add — `validateHarness(harness, phaseName, errors)`** (ADR-030):

Placed immediately before `validatePipelineKeys` (lines 173–183), mirroring the
`validateReorder` naming convention (the private-fn pattern set by
`validateModels`/`validateGates`/`validatePr`/`validateScripts`/`validateReorder`).

```js
/**
 * Validate the shape of a harness block on a phase override (ADR-030).
 * Named sub-keys are type-checked; unknown sub-keys are allowed (forward-compat).
 * Errors accumulate — no short-circuit.
 * @param {unknown} harness
 * @param {string} phaseName
 * @param {string[]} errors
 */
function validateHarness(harness, phaseName, errors) {
  if (!harness || typeof harness !== 'object' || Array.isArray(harness)) {
    errors.push(`phases.${phaseName}.harness must be an object`);
    return;
  }
  if (Object.hasOwn(harness, 'dimensions')) {
    const d = harness.dimensions;
    if (!Array.isArray(d) || d.some(item => typeof item !== 'string')) {
      errors.push(`phases.${phaseName}.harness.dimensions must be a list of strings`);
    }
  }
  if (Object.hasOwn(harness, 'passes')) {
    const p = harness.passes;
    if (!Number.isInteger(p) || p <= 0) {
      errors.push(`phases.${phaseName}.harness.passes must be a positive integer`);
    }
  }
  if (Object.hasOwn(harness, 'max_cycles')) {
    const m = harness.max_cycles;
    if (!Number.isInteger(m) || m <= 0) {
      errors.push(`phases.${phaseName}.harness.max_cycles must be a positive integer`);
    }
  }
  if (Object.hasOwn(harness, 'convergence')) {
    const c = harness.convergence;
    const validStrings = new Set(['low-only', 'none']);
    if (!(validStrings.has(c) || (typeof c === 'number' && c >= 0))) {
      errors.push(`phases.${phaseName}.harness.convergence must be 'low-only', 'none', or a non-negative number`);
    }
  }
  if (Object.hasOwn(harness, 'tool') && typeof harness.tool !== 'string') {
    errors.push(`phases.${phaseName}.harness.tool must be a string`);
  }
  if (Object.hasOwn(harness, 'scope') && typeof harness.scope !== 'string') {
    errors.push(`phases.${phaseName}.harness.scope must be a string`);
  }
  if (Object.hasOwn(harness, 'incremental') && typeof harness.incremental !== 'boolean') {
    errors.push(`phases.${phaseName}.harness.incremental must be a boolean`);
  }
}
```

**Updated `validatePhaseBlock`** (currently lines 192–212): after the `PHASE_FIELDS` guard allows
the field (i.e. the `!PHASE_FIELDS.has(field)` check passes), add value-shape checks inside the
loop. Current loop body ends with the `context`/`override` file-ref checks. Extend it:

```js
// After the existing context/override branches:
if (field === 'role' && typeof value !== 'string') {
  errors.push(`phases.${phaseName}.role must be a string`);
}
if (field === 'model' && typeof value !== 'string') {
  errors.push(`phases.${phaseName}.model must be a string`);
}
if (field === 'enabled' && typeof value !== 'boolean') {
  errors.push(`phases.${phaseName}.enabled must be a boolean`);
}
if (field === 'harness') {
  validateHarness(value, phaseName, errors);
}
// execution: accepted by PHASE_FIELDS; value checked by validateExecutionValues in resolve.js — no check here
```

**Test file to extend:** `engine/test/manifest.test.js`

Current file structure (line count ~350): imports `validateManifest` from `'../src/manifest.js'`;
constants `ALWAYS_EXISTS = () => true` and `NEVER_EXISTS = () => false` at lines 10–11.
Existing sections: null/undefined/empty · top-level key validation · pipeline sub-key validation ·
retrieval and execution · models key validation · gates field · pr field · scripts field · phase
validation. Extend by adding two new sections:
`// ─── phases: newly accepted fields (ADR-028 lint-gap closure) ───`
`// ─── phases.harness shape validation (ADR-030) ───`

No new exports. `validateHarness` is internal.

**Surface-gate assertion for this slice:** `PHASE_FIELDS` currently rejects `harness`, `execution`,
`enabled`, `role`, `model` as unknown. After the change, `S2` fixture
(`engine/test/fixtures/scenarios/S2/manifest.yml`) which contains `phases.planning.role:
craft:planner` now lints clean (previously an unknown-field error if run through validateManifest).
The SC1 golden (11 effective ids, canonical order) must remain byte-identical.

### TDD steps

**RED — add these 19 tests to `engine/test/manifest.test.js` before touching `manifest.js`:**

Section 1: lint-gap closure (ADR-028) — 7 tests:

```js
// ─── phases: newly accepted fields (ADR-028 lint-gap closure) ────────────────

test('Given phases.documentation.execution: inline, when validateManifest runs, then ok:true (no longer rejected)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { documentation: { execution: 'inline' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.planning.role: "my:domain-planner", when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { planning: { role: 'my:domain-planner' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.review.harness: { max_cycles: 2 }, when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { max_cycles: 2 } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.requirements.enabled: true, when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { requirements: { enabled: true } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.review.role: 42 (non-string), when validateManifest runs, then ok:false with role-type error', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { role: 42 } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('phases.review.role') && e.includes('string')));
});

test('Given phases.review.model: true (non-string), when validateManifest runs, then ok:false with model-type error', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { model: true } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('phases.review.model') && e.includes('string')));
});

test('Given phases.review.enabled: "yes" (non-boolean), when validateManifest runs, then ok:false with enabled-type error', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { enabled: 'yes' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('phases.review.enabled') && e.includes('boolean')));
});
```

Section 2: validateHarness shape checks (ADR-030) — 12 tests:

```js
// ─── phases.harness shape validation (ADR-030) ───────────────────────────────

test('Given phases.review.harness: "not-an-object", when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: 'not-an-object' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('phases.review.harness') && e.includes('object')));
});

test('Given phases.review.harness: { max_cycles: "three" }, when validateManifest runs, then ok:false with max_cycles type error', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { max_cycles: 'three' } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('max_cycles')));
});

test('Given phases.review.harness: { passes: 0 }, when validateManifest runs, then ok:false (passes must be positive)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { passes: 0 } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('passes') && e.includes('positive')));
});

test('Given phases.review.harness: { convergence: "bad-value" }, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { convergence: 'bad-value' } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('convergence')));
});

test('Given phases.review.harness: { convergence: 0 }, when validateManifest runs, then ok:true (numeric 0 is valid)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { convergence: 0 } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.review.harness: { convergence: "low-only" }, when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { convergence: 'low-only' } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.review.harness: { convergence: "none" }, when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { convergence: 'none' } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.review.harness: { dimensions: "not-a-list" }, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { dimensions: 'not-a-list' } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('dimensions') && e.includes('list of strings')));
});

test('Given phases.review.harness: { dimensions: ["code", "tests"] }, when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { dimensions: ['code', 'tests'] } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.review.harness: { tool: 42 }, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { tool: 42 } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('tool') && e.includes('string')));
});

test('Given phases.review.harness: { incremental: "yes" }, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { incremental: 'yes' } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('incremental') && e.includes('boolean')));
});

test('Given phases.review.harness: { rules: ".dependency-cruiser.json" } (unknown sub-key), when validateManifest runs, then ok:true (forward-compat)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { rules: '.dependency-cruiser.json' } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});
```

Run `cd engine && node --test` → confirm 19 new tests fail:
- lint-gap tests 1–4: fail with `ok: false` and `unknown field on phase …` errors.
- lint-gap tests 5–7 (bad-type negatives): fail with `ok: true` (PHASE_FIELDS rejects
  the key before the value check, so `ok: false` assertion fails OR the error message
  says "unknown field" not the expected type-error message).
- harness tests 1, 7–8 (non-object, bad-dimensions, bad-convergence): fail with `ok: true`
  (harness key not yet accepted → unknown field error causes ok:false BUT for the wrong reason;
  for ok:true expected tests, the key is rejected as unknown so the assertion fails).
- harness tests 2–3, 4, 9–11: similar failure modes.

**GREEN — edit `engine/src/manifest.js`:**

1. Change `PHASE_FIELDS` to add `'harness', 'execution', 'enabled', 'role', 'model'`.
2. Add private `validateHarness(harness, phaseName, errors)` function immediately before
   `validatePipelineKeys` (insert between line 152 and 165 in the current file), using the
   implementation in the Context block above.
3. In `validatePhaseBlock` (currently lines 192–212): inside the for-loop, after the
   existing `if (field === 'context')` / `else if (field === 'override')` branches, add
   the four new branches for `role`, `model`, `enabled`, `harness`.

Run `cd engine && node --test` → all 19 new tests pass; full suite stays green.

**REFACTOR:**
- Verify `validateHarness` is under 40 lines with the per-knob guards.
- Verify no short-circuit (all checks use independent `if` + `Object.hasOwn`, not
  `else if`, so every present sub-key is always checked).
- Verify the `execution` field gets no value check in `validatePhaseBlock` (the comment
  documents this is intentional — value lives in `validateExecutionValues`).

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
feat(manifest): expand PHASE_FIELDS to full honored set + validateHarness + role/model/enabled shape checks (ADR-028,030)
```

---

## Slice 2 — edits.js: `applyAllowedOverrides` deep-merge for harness

### Context

**Shape:** TDD / slice-implementer

**File to edit:** `engine/src/edits.js`

**Current `applyAllowedOverrides`** (lines 20–28):
```js
function applyAllowedOverrides(descriptor, override) {
  const patch = {};
  for (const field of ALLOWED_PHASE_OVERRIDE_FIELDS) {
    if (Object.hasOwn(override, field)) {
      patch[field] = override[field];
    }
  }
  return { ...descriptor, ...patch };
}
```

`ALLOWED_PHASE_OVERRIDE_FIELDS` (line 12): `new Set(['role', 'model', 'harness'])`.

**P8 change — deep-merge harness one level (ADR-029):**
```js
function applyAllowedOverrides(descriptor, override) {
  const patch = {};
  for (const field of ALLOWED_PHASE_OVERRIDE_FIELDS) {
    if (!Object.hasOwn(override, field)) continue;
    if (
      field === 'harness' &&
      descriptor[field] !== undefined &&
      descriptor[field] !== null &&
      typeof descriptor[field] === 'object' &&
      !Array.isArray(descriptor[field]) &&
      typeof override[field] === 'object' &&
      !Array.isArray(override[field]) &&
      override[field] !== null
    ) {
      patch[field] = { ...descriptor[field], ...override[field] };
    } else {
      patch[field] = override[field];
    }
  }
  return { ...descriptor, ...patch };
}
```

**Semantics (pre-chewed for the implementer):**
- Both sides plain objects → merge: `{ ...descriptor.harness, ...override.harness }`.
  Override keys win; unset default keys survive.
- Either side null/array/absent → scalar-replace. The shape validator (Slice 1)
  rejects malformed values before the resolver runs, so a null/array override that
  bypasses the validator still lands as scalar-replace without silent error.
- Arrays within harness (e.g. `dimensions`) replace wholesale — not union. A
  manifest that names `dimensions: [code]` wants exactly `[code]`.
- `role`/`model` are not `harness`; they go through the `else` branch unchanged
  (scalar-replace as before).
- **Immutability:** `{ ...descriptor[field], ...override[field] }` produces a new
  object. `{ ...descriptor, ...patch }` produces a new descriptor. Neither the
  (deep-frozen) default descriptor nor the override is mutated.
- **Edge — descriptor has no default harness** (e.g. `review` before Slice 3 adds
  one): `descriptor.harness === undefined` → guard fails → scalar-replace → the full
  override object lands as-is. This is correct.

**Test file to extend:** `engine/test/edits.test.js`

Current file (153 lines) imports `applyReorder, checkReorderApplicability` from
`'../src/edits.js'`. The import line must be extended to also import
`applyAllowedOverrides` — but wait: **`applyAllowedOverrides` is not currently
exported**. This slice must add an export OR test it indirectly via `applyEnableEdits`.

**Resolution (pre-chewed):** `applyAllowedOverrides` is a private function. The
cleanest approach, consistent with the project's CQS/hexagonal style, is to test it
**through the public API** (`applyEnableEdits`) — which is how the resolver uses it.
`applyEnableEdits(defaults, skipSet, phaseOverrides)` calls `applyAllowedOverrides`
for each descriptor. A minimal descriptor with `harness: { tool: 'stryker',
scope: 'per-hunk' }` and a `phaseOverrides` Map with `{ harness: { scope: 'per-file' }
}` is sufficient to exercise the merge path through `applyEnableEdits`.

The test titles use "when applyAllowedOverrides runs" (naming the function under test)
even though they invoke it through `applyEnableEdits`. This is the same indirect unit
pattern used by the existing `edits.test.js` tests which test `applyEnableEdits`
directly.

Import extension (at line 3 of `edits.test.js`):
```js
import { applyReorder, checkReorderApplicability, applyEnableEdits } from '../src/edits.js';
```

Helper for building minimal descriptors with a harness field:
```js
function makeHarnessDescriptor(id, harness) {
  return { id, enabled: true, contract: [], consumes: [], produces: [], self_supply: [], harness };
}
```

Helper to call `applyAllowedOverrides` indirectly:
```js
function applyOverride(descriptor, override) {
  const skipSet = new Set();
  const phaseOverrides = new Map([[descriptor.id, override]]);
  const { descriptors } = applyEnableEdits([descriptor], skipSet, phaseOverrides);
  return descriptors[0];
}
```

### TDD steps

**RED — add these 7 tests to `engine/test/edits.test.js` (new section after Group B):**

```js
// ─── Group C: applyAllowedOverrides (via applyEnableEdits) — harness deep-merge ──

test('Given descriptor.harness: { tool: "stryker", scope: "per-hunk" } and override.harness: { scope: "per-file" }, when applyAllowedOverrides runs, then result.harness is { tool: "stryker", scope: "per-file" } (tool preserved, scope overridden)', () => {
  const sut = applyOverride;
  const descriptor = makeHarnessDescriptor('validation', { tool: 'stryker', scope: 'per-hunk' });

  const result = sut(descriptor, { harness: { scope: 'per-file' } });

  assert.deepEqual(result.harness, { tool: 'stryker', scope: 'per-file' });
});

test('Given descriptor.harness: { tool: "stryker", scope: "per-hunk" } and override.harness: { max_cycles: 2 }, when applyAllowedOverrides runs, then result.harness contains tool, scope, and max_cycles', () => {
  const sut = applyOverride;
  const descriptor = makeHarnessDescriptor('validation', { tool: 'stryker', scope: 'per-hunk' });

  const result = sut(descriptor, { harness: { max_cycles: 2 } });

  assert.equal(result.harness.tool, 'stryker');
  assert.equal(result.harness.scope, 'per-hunk');
  assert.equal(result.harness.max_cycles, 2);
});

test('Given descriptor has no harness and override.harness: { scope: "per-file" }, when applyAllowedOverrides runs, then result.harness is { scope: "per-file" } (scalar-replace fallback)', () => {
  const sut = applyOverride;
  const descriptor = makeHarnessDescriptor('review', undefined);

  const result = sut(descriptor, { harness: { scope: 'per-file' } });

  assert.deepEqual(result.harness, { scope: 'per-file' });
});

test('Given override.harness is null, when applyAllowedOverrides runs, then result.harness is null (scalar-replace for non-object)', () => {
  const sut = applyOverride;
  const descriptor = makeHarnessDescriptor('validation', { tool: 'stryker' });

  const result = sut(descriptor, { harness: null });

  assert.equal(result.harness, null);
});

test('Given descriptor.harness: { dimensions: ["code","tests"] } and override.harness: { dimensions: ["code"] }, when applyAllowedOverrides runs, then result.harness.dimensions is ["code"] (array replace, not union)', () => {
  const sut = applyOverride;
  const descriptor = makeHarnessDescriptor('review', { dimensions: ['code', 'tests'] });

  const result = sut(descriptor, { harness: { dimensions: ['code'] } });

  assert.deepEqual(result.harness.dimensions, ['code']);
});

test('Given descriptor has harness and override.role: "my:role", when applyAllowedOverrides runs, then role is scalar-replaced (scalar semantics unchanged)', () => {
  const sut = applyOverride;
  const descriptor = { ...makeHarnessDescriptor('review', { tool: 'stryker' }), role: 'craft:reviewer' };

  const result = sut(descriptor, { role: 'my:role', harness: { scope: 'per-file' } });

  assert.equal(result.role, 'my:role');
  assert.equal(result.harness.tool, 'stryker');
  assert.equal(result.harness.scope, 'per-file');
});

test('Given any call to applyAllowedOverrides, when it runs, then the input descriptor object is not mutated (immutability)', () => {
  const sut = applyOverride;
  const harnessBefore = { tool: 'stryker', scope: 'per-hunk' };
  const descriptor = makeHarnessDescriptor('validation', harnessBefore);

  sut(descriptor, { harness: { scope: 'per-file', max_cycles: 2 } });

  assert.equal(descriptor.harness.scope, 'per-hunk', 'input descriptor.harness must not be mutated');
  assert.equal(descriptor.harness.tool, 'stryker', 'input descriptor.harness must not be mutated');
  assert.equal(Object.keys(descriptor.harness).length, 2, 'no new keys must be added to input harness');
});
```

Run `cd engine && node --test` → all 7 new tests fail because `applyAllowedOverrides`
currently uses scalar-replace:
- Test 1: `result.harness` is `{ scope: 'per-file' }` (tool dropped) → deepEqual fails.
- Test 2: `result.harness` is `{ max_cycles: 2 }` (tool + scope dropped) → assertions fail.
- Tests 3–4: scalar-replace already correct for these cases → these tests MAY pass.
  Mark them as "pass on RED" — this is acceptable; the remaining tests drive the impl.
- Test 5: deepEqual `['code']` passes (arrays replace) → may pass on RED.
- Test 6: role scalar-replace already works; harness.tool preserved via merge... actually
  fails because without the merge, `harness: { scope:'per-file' }` drops tool. → fails.
- Test 7: immutability — current impl does not mutate, so this may pass on RED.

The implementer must confirm: tests 1, 2, 6 fail on RED (they exercise the merge path).
The others being green on RED is fine — they assert existing correct behavior.

**GREEN — edit `engine/src/edits.js`:**

Replace the body of `applyAllowedOverrides` with the implementation shown in the Context
block above (the harness-branch deep-merge + else scalar-replace).

Run `cd engine && node --test` → all 7 new tests pass; full suite stays green; Group A and
Group B tests (applyReorder/checkReorderApplicability) are unaffected.

**REFACTOR:**
- Verify `applyAllowedOverrides` is under 20 lines.
- Verify no mutation: the spread `{ ...descriptor[field], ...override[field] }` produces a
  new object; `{ ...descriptor, ...patch }` produces a new descriptor.
- Verify the harness guard condition is readable — extract to a named predicate if it
  exceeds the 80-char line limit.

### Gate

```
cd engine && node --test
```

### Commit

```
feat(edits): deep-merge harness one level in applyAllowedOverrides (ADR-029)
```

---

## Slice 3 — pipeline/default.yml + S-harness scenarios

### Context

**Shape:** TDD / slice-implementer

**This slice is the P8 gate (S-harness green).**

**Verified pre-condition (do not re-verify):** No test in `engine/test/scenarios.test.js`
or `engine/test/contract-equivalence.test.js` asserts a descriptor's `harness` field value
(ADR-031 verified this). The SC1 golden pins: `effective.map(d => d.id)` (11 ids), execution
values, gateDecisions length, propose's `awaitingHarnesses`, waivers, and the exact `record[]`
strings. None concern `harness` values.

**Verified pre-condition:** `descriptor.js` (lines 91–93) already passes `raw.harness`
through to the entry object as-is (raw passthrough, deep-frozen via `deepFreeze`). No
descriptor.js change needed.

**Verified pre-condition:** `resolve.js` already chains `applyEnableEdits → ...`. After Slice 2
fixes the merge semantics in `applyAllowedOverrides`, the merged harness automatically flows
onto `enableResult.descriptors`. No new resolver wiring is needed.

**File to edit 1:** `pipeline/default.yml`

Add `harness:` block to the `review` descriptor (currently lines 74–84). The descriptor
currently ends at `gate: <gates.phase>` with no `harness:` key. Insert immediately after the
`gate:` line:

```yaml
  harness:
    dimensions: [code, security, tests, perf]
    passes: 1
    max_cycles: 3
    convergence: low-only
```

Full review descriptor after edit (lines 74–89):
```yaml
- id: review
  archetype: harness
  contract:
    - harness-read
  procedure: craft:review
  role: craft:reviewer
  consumes:
    - change
  produces:
    - review-report
  gate: <gates.phase>
  harness:
    dimensions: [code, security, tests, perf]
    passes: 1
    max_cycles: 3
    convergence: low-only
```

The `validation` descriptor already has `harness: { tool: stryker, scope: per-hunk }` (lines
109–111). The `architecture` descriptor already has `harness: { tool: dependency-cruiser }`.
No other descriptors change.

**File to create 2:** `engine/test/fixtures/scenarios/S-harness-review/manifest.yml`
```yaml
phases:
  review:
    harness:
      max_cycles: 2
```

**File to create 3:** `engine/test/fixtures/scenarios/S-harness-validation/manifest.yml`
```yaml
phases:
  validation:
    harness:
      scope: per-file
```

**Test file to extend:** `engine/test/scenarios.test.js`

The `SC1_IDS` constant already at line 55–67 (`['workspace', 'design', 'decisions', 'planning',
'implementation', 'review', 'refactoring', 'validation', 'documentation', 'propose', 'integrate']`).
Use it directly in S-harness assertions — do NOT redefine it.

`loadDefault()` (line 31–33): reads `pipeline/default.yml` via `parsePipeline`.
`loadScenarioManifest(scenario)` (line 35–38): reads from `scenariosDir`.

Add two new test groups after the SC3/S-reorder block:

**S-harness-review assertions (5 tests):**
- `result.ok === true`
- `review` descriptor in `result.effective` has `harness.max_cycles === 2` (override wins)
- `review` descriptor in `result.effective` has `harness.dimensions` deeply equal to
  `['code', 'security', 'tests', 'perf']` (default survives — the merge guarantee)
- `result.effective.map(d => d.id)` equals `SC1_IDS` (no phase-count or order change)
- `result.effective.find(d => d.id === 'validation').harness.tool === 'stryker'`
  (unrelated descriptor's harness is unchanged)

**S-harness-validation assertions (3 tests):**
- `result.ok === true`
- `result.effective.find(d => d.id === 'validation').harness.tool === 'stryker'` (default tool preserved)
- `result.effective.find(d => d.id === 'validation').harness.scope === 'per-file'` (override wins)
- `result.effective.map(d => d.id)` equals `SC1_IDS`

**Bad-harness-shape inline negative (1 test):** calls `validateManifest` directly (not via the
resolver — see constraint above). Import `validateManifest` at the top of `scenarios.test.js`:
```js
import { validateManifest } from '../src/manifest.js';
```

**Surface-gate assertion for this slice:** Run the lint and resolve bins after committing:
```
node engine/bin/pipeline-lint.js pipeline/default.yml
node engine/bin/pipeline-resolve.js pipeline/default.yml
```
Both must exit 0. SC1's `result.record[]` golden must be byte-identical (the `review.harness`
add to `pipeline/default.yml` does not produce any new record lines — `applyEnableEdits`
records enable/disable/skip actions and `applyAllowedOverrides` does not push to records).

### TDD steps

**RED — create fixture files, then add tests to `engine/test/scenarios.test.js`:**

Step 1: Create the two fixture YAML files listed in the Context block (no logic yet —
their creation enables the `ENOENT`-failing tests to reach the resolver).

Step 2: Add the import for `validateManifest` if not already present:
```js
import { validateManifest } from '../src/manifest.js';
```

Step 3: Add the following test blocks:

```js
// ─── S-harness-review: partial harness override preserves default knobs ───────

test('S-harness-review Given phases.review.harness: { max_cycles: 2 }, when resolvePipeline runs, then ok:true', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-review');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('S-harness-review Given phases.review.harness: { max_cycles: 2 }, when resolvePipeline runs, then review descriptor has max_cycles:2 (override wins)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-review');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const reviewDesc = result.effective.find(d => d.id === 'review');
  assert.ok(reviewDesc, 'review must be in effective');
  assert.equal(reviewDesc.harness.max_cycles, 2);
});

test('S-harness-review Given phases.review.harness: { max_cycles: 2 }, when resolvePipeline runs, then review descriptor retains default dimensions (default survives deep-merge)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-review');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const reviewDesc = result.effective.find(d => d.id === 'review');
  assert.deepEqual(reviewDesc.harness.dimensions, ['code', 'security', 'tests', 'perf']);
});

test('S-harness-review Given phases.review.harness: { max_cycles: 2 }, when resolvePipeline runs, then effective ids equal SC1_IDS (no phase change)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-review');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.deepEqual(result.effective.map(d => d.id), SC1_IDS);
});

test('S-harness-review Given phases.review.harness: { max_cycles: 2 }, when resolvePipeline runs, then unrelated validation descriptor keeps harness.tool: stryker', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-review');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const validationDesc = result.effective.find(d => d.id === 'validation');
  assert.equal(validationDesc.harness.tool, 'stryker');
});

// ─── S-harness-validation: partial harness override preserves default tool ────

test('S-harness-validation Given phases.validation.harness: { scope: "per-file" }, when resolvePipeline runs, then ok:true', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-validation');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('S-harness-validation Given phases.validation.harness: { scope: "per-file" }, when resolvePipeline runs, then validation keeps harness.tool: stryker (default preserved)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-validation');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const validationDesc = result.effective.find(d => d.id === 'validation');
  assert.equal(validationDesc.harness.tool, 'stryker');
});

test('S-harness-validation Given phases.validation.harness: { scope: "per-file" }, when resolvePipeline runs, then validation.harness.scope is per-file (override wins)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-validation');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const validationDesc = result.effective.find(d => d.id === 'validation');
  assert.equal(validationDesc.harness.scope, 'per-file');
});

test('S-harness-validation Given phases.validation.harness: { scope: "per-file" }, when resolvePipeline runs, then effective ids equal SC1_IDS', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-validation');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.deepEqual(result.effective.map(d => d.id), SC1_IDS);
});

// ─── bad-harness-shape negative ───────────────────────────────────────────────

test('Given phases.review.harness.max_cycles is a string, when validateManifest runs, then ok:false with max_cycles error', () => {
  const sut = validateManifest;
  const manifest = { phases: { review: { harness: { max_cycles: 'three' } } } };

  const result = sut(manifest, { fileExists: () => true });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => e.includes('max_cycles')),
    `errors must mention max_cycles; got: ${JSON.stringify(result.errors)}`,
  );
});
```

Run `cd engine && node --test` → failures:
- S-harness-review tests 1, 4 may pass if `ok:true` is already the case (review has no
  harness in default.yml yet, so there's nothing to merge → scalar-replace of
  `{max_cycles:2}` lands; ok:true because resolveManifest path works). BUT tests 2, 3
  (checking `dimensions` survival) FAIL because the default `review` descriptor has no
  `harness` yet → `reviewDesc.harness` will be `{ max_cycles: 2 }` with no `dimensions`
  key → assertion fails. **This confirms the RED state requires the Slice 3 data change.**
- S-harness-validation tests 2, 3 (checking tool survival + scope override): validation
  already has `harness: { tool: stryker, scope: per-hunk }` in `pipeline/default.yml`.
  With Slice 2 green, `{ scope: per-file }` deep-merges → `{ tool: stryker, scope: per-file }`.
  So tests 2 and 3 MAY already pass after Slice 2. Test 1 (ok:true) also passes.
  The RED state for S-harness-validation is subtle — confirm by running BEFORE editing
  `pipeline/default.yml`. If S-harness-validation tests all pass before editing the YAML,
  that's fine; the RED is established by S-harness-review test 3 (dimensions failure).

**GREEN — edit `pipeline/default.yml`:**

Add the `harness:` block to the `review` descriptor as shown in the Context block above.

Run `cd engine && node --test` → all 10 new tests pass; full existing suite stays green.

Verify CI gate:
```
bash scripts/ci.sh
```
Then spot-check lint and resolve bins:
```
node engine/bin/pipeline-lint.js pipeline/default.yml
node engine/bin/pipeline-resolve.js pipeline/default.yml
```

**REFACTOR:**
- Verify `SC1_IDS` is used by reference (not re-declared) in the new test block.
- Verify the `validateManifest` import is added once (not duplicated if already present).
- Confirm the `review.harness` YAML uses consistent indentation (2-space, matching the
  existing `validation.harness` block at lines 109–111).

### Gate

Full CI gate (this is the P8 phase gate):
```
bash scripts/ci.sh
```

Verifies: `cd engine && node --test` + `bats test/` + `shellcheck` + `pipeline-lint` +
`pipeline-resolve` + `contracts-lint`. All must be green.

Surface-gate invariants to spot-check manually before committing:
- SC1 effective ids (11 phases, canonical order) unchanged.
- SC1 `record[]` exact strings unchanged (no new record lines from the harness add).
- S-reorder, SC3 effective id orders unchanged.
- S-lean / S-full execution assignments unchanged.
- contract-equivalence suite passes.
- `pipeline/default.yml` still has exactly 13 descriptors.

### Commit

```
feat(scenarios): S-harness-review + S-harness-validation golden + review.harness data relocation (ADR-031, P8 gate)
```

---

## Slice 4 — walk prose: review/validation/run SKILL.md harness knob wiring

### Context

**Shape:** session-direct (NOT slice-implementer — no RED/GREEN TDD cycle)

**This slice is prose editing only.** It carries no `node --test` gate. It gets a focused
consistency review (not the 4-dimension code review), checking that:
1. All four `review` knobs are read from `phase.harness` with correct fallbacks.
2. All three `validation` knobs are read from `phase.harness` with correct fallbacks.
3. `run/SKILL.md` step 4 harness rows name where `phase.harness` is available.
4. `passes > 1` and numeric `convergence` are documented as **parked** (not silent).

**Files to edit:**

1. `skills/review/SKILL.md` — step 2 and step 4.
2. `skills/validation/SKILL.md` — preamble step 2 and procedure step 1.
3. `skills/run/SKILL.md` — step 4 session-owned responsibilities table, harness rows.

**`skills/review/SKILL.md` — current state:**

Preamble step 2 (line 12):
> Probe: dimensions = code, security, tests, perf (a repo `context:` may refine their
> definitions); gates as in implementation's preamble; `gates.review-batch` optional extra.

Procedure step 4 (lines 33–35):
> **Converge per dimension, ≤3 cycles:** LOW-only → converged once fixed, NO
> relaunch. MEDIUM+ → fresh reviewer scoped to the FIX DELTA only …

**Target state for `skills/review/SKILL.md`:**

Replace preamble step 2 with:
> **Probe: read harness knobs from `phase.harness` (the resolved descriptor for this
> phase — available to the orchestrator session throughout the walk).** Strong fallback
> defaults apply when a knob is absent:
>
> | Knob | Field | Fallback |
> |---|---|---|
> | Dimensions | `phase.harness.dimensions` | `[code, security, tests, perf]` |
> | Reviewers per dimension | `phase.harness.passes` | `1` |
> | Convergence cap | `phase.harness.max_cycles` | `3` |
> | Convergence stop rule | `phase.harness.convergence` | `low-only` |
>
> A repo `context:` file may further refine dimension definitions; it does not override
> the knob values (those come from the descriptor).
>
> **`passes > 1` (multi-reviewer fan-out) — parked.** The `passes` knob is accepted
> by the validator and deep-merged correctly onto the descriptor. The walk reads it and
> honors it as a self-directed constraint (N reviewers per dimension in parallel), but
> the multi-reviewer fan-out is not engine-enforced in P8. This is not a silent cap —
> it is documented here. A `passes: 2` manifest is valid and will reach the walk.

Replace procedure step 4 with:
> **Converge per dimension, up to `phase.harness.max_cycles` cycles** (default 3):
> - `convergence: low-only` → converged once only LOW findings remain; no relaunch.
> - `convergence: none` → no convergence loop; one pass only.
> - `convergence: <n>` (numeric ≥ 0) → stop when remaining finding count ≤ n.
>   **Numeric convergence enforcement — parked.** The validator accepts numeric ≥ 0
>   and the descriptor carries the value. Exact stopping behavior for arbitrary
>   numeric thresholds (e.g. finding-count vs. severity-weighted) is walk-judgment
>   and not engine-enforced in P8. Not a silent cap — stated here.
> MEDIUM+ surviving findings → fresh reviewer scoped to the FIX DELTA only.

**`skills/validation/SKILL.md` — current state:**

Preamble step 2 (lines 14–15): mentions stryker/mutmut/cosmic-ray/cargo-mutants implicitly.
Procedure step 1 (lines 20–26): "scope the run to exactly the change's touched code" and
"per-hunk" semantics — hardcoded scope.

**Target state for `skills/validation/SKILL.md`:**

Add before preamble step 2 (insert as a new step 1a or prefix step 2):
> **Read harness knobs from `phase.harness` (the resolved descriptor for this phase).**
> Strong fallback defaults apply when a knob is absent:
>
> | Knob | Field | Fallback |
> |---|---|---|
> | Mutation tool | `phase.harness.tool` | probe determines the tool (see preamble step 2) |
> | Hunk scope | `phase.harness.scope` | `per-hunk` |
> | Incremental run | `phase.harness.incremental` | `false` |
>
> `phase.harness.tool` names WHICH tool to invoke when the preamble step 2 probe passes;
> its absence means "probe determines the tool". The probe runs regardless.

In procedure step 1: change "derive one range per *contiguous changed hunk*" to reference
`phase.harness.scope` (default `per-hunk`):
> scope = `phase.harness.scope` (default `per-hunk`): with `per-hunk`, derive one range per
> *contiguous changed hunk*; with `per-file`, scope to the full touched files. Do NOT
> consolidate across unchanged gaps regardless of scope mode.

**`skills/run/SKILL.md` — current state:**

Step 4 session-owned responsibilities (lines 139–148), harness rows:
```
   - `harness` (`harness-read ∈ contract`): apply ALL findings; convergence
   - `harness` (`harness-exec ∈ contract`): start background run; gate `propose`
     on triage completion (see invariants below)
```

**Target state for `skills/run/SKILL.md`:**

Replace the two harness rows with:
```
   - `harness` (`harness-read ∈ contract`): apply ALL findings; convergence per
     `phase.harness` knobs (dimensions, passes, max_cycles, convergence — see
     `craft:review` SKILL.md for the read protocol).
   - `harness` (`harness-exec ∈ contract`): start background run using the tool and
     scope from `phase.harness` (tool, scope, incremental — see `craft:validation`
     SKILL.md for the read protocol); gate `propose` on triage completion.
```

**No node test.** After editing, run:
```
bash scripts/ci.sh
```
to confirm bats + shellcheck still pass (the skill files are not node-tested directly,
but the manifest-lint.sh bats suite and shellcheck cover adjacent shell behavior).

**Parked items to confirm are stated explicitly in the prose (not silently omitted):**
- `passes > 1` fan-out: documented as parked in `review/SKILL.md` preamble step 2.
- `convergence: <n>` numeric enforcement: documented as parked in `review/SKILL.md`
  procedure step 4.
- Per-invocation `--harness` CLI flag: out of scope for P8 (follows ADR-022 pattern
  in a later phase) — no mention needed in P8 prose.

### TDD steps

**No RED/GREEN cycle for prose.** The implementer reads the current file state (shown in
the Context block above), applies the targeted diff-minded edits, and verifies consistency.

REFACTOR (consistency check):
- `review/SKILL.md`: confirm "≤3 cycles" (hardcoded) is fully replaced by the
  `max_cycles` knob reference; no leftover hardcoded "3" in the convergence rule.
- `validation/SKILL.md`: confirm "per-hunk" (hardcoded in step 1) is replaced by
  `phase.harness.scope` reference with `per-hunk` as the documented fallback.
- `run/SKILL.md`: confirm step 4 harness rows still end with "gate `propose` on triage
  completion" (the cross-phase invariant sentence must survive the prose edit).
- All three files: confirm `phase.harness` is described as "the resolved descriptor for
  this phase" so the reader knows where to find it in the walk context.

### Gate

```
bash scripts/ci.sh
```

### Commit

```
docs(skills): wire phase.harness knobs into review/validation/run walk prose; document passes>1 + numeric convergence as parked (ADR-031)
```

---

## Surface-gate checklist

The following must hold at every commit in this phase:

| Surface | Must stay |
|---|---|
| `resolvePipeline(defaults, manifest)` signature | unchanged |
| `engine/src/index.js` 7-export surface | unchanged (parsePipeline, validatePipeline, ALIAS_MAP, resolveAlias, resolvePipeline, assembleContract, normalizeFindings, validateManifest) |
| `pipeline/default.yml` descriptor count | 13 (unchanged) |
| `pipeline/default.yml` enabled/disabled state | unchanged (review stays enabled; architecture stays enabled:false; requirements stays enabled:false) |
| `graph.js` `validatePipeline(descriptors)` | unchanged |
| `contract.js` `assembleContract` | unchanged |
| SC1 effective ids (11 phases) | `SC1_IDS` unchanged |
| SC1 `record[]` golden strings | unchanged (no new record lines from harness edits) |
| S1/S2/S3/S-lean/S-full/S-reorder/SC3 + contract-equivalence | green |
| CI (`scripts/ci.sh`) | green at every commit |

**Change limited to `pipeline/default.yml`:** only the `review` descriptor gains a
`harness:` block (4 keys). No other descriptor changes. The descriptor count stays 13.
No enabled/disabled state changes.

**`validateHarness` and `applyAllowedOverrides`'s deep-merge branch are internal** — not
exported from `index.js`, not exposed via `edits.js` export surface. The existing 4-export
surface of `edits.js` (`applyEnableEdits`, `applyInserts`, `checkReorderApplicability`,
`applyReorder`) is unchanged.
