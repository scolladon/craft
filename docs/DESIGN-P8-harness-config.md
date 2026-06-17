# DESIGN — P8: per-phase harness config

> Brief: surface the `harness:` block end-to-end — deep-merge override semantics in
> `edits.js`, `validateHarness` in `manifest.js`, the full honored-field set in
> `PHASE_FIELDS`, review/validation/run walk prose reading the knobs, and review's
> defaults relocated from SKILL.md prose into `pipeline/default.yml` data — resolving G6
> and closing the latent lint gap (execution/enabled/role/model all silently pass the
> resolver today but are rejected by validateManifest); gate = S-harness green.
> Status: draft → self-reviewed ×3 → accepted (decisions ADR-028…031)

## Context

### What the engine already provides (do not redesign)

P1–P7 are complete and green. The resolver pipeline in `engine/src/resolve.js` is:

```
aliasResolve → validateExecutionValues → expandProfile →
applyEnableEdits → applyInserts → checkReorderApplicability → applyReorder →
resolveExecution → checkStrandedConsumers → validatePipeline → resolveGatesAndWaivers
```

**`descriptor.js` lines 91–93** already passes `raw.harness` through to the entry
object (raw passthrough, deep-frozen via `deepFreeze`). No descriptor change is needed.

**`pipeline/default.yml`** already carries `harness:` blocks on two descriptors:
- `validation.harness: { tool: stryker, scope: per-hunk }` (line 109–111)
- `architecture.harness: { tool: dependency-cruiser }` (line 125–126)

`review` has no `harness:` block in the YAML today. Its knobs live in
`skills/review/SKILL.md` prose (step 1–4 hardcode `dimensions = code, security, tests,
perf`, "≤3 cycles", "LOW-only convergence").

**`edits.js` — `ALLOWED_PHASE_OVERRIDE_FIELDS`** already includes `harness`. However
`applyAllowedOverrides` performs a **scalar-replace**: `patch[field] = override[field]`.
A manifest `phases.validation.harness: { scope: per-file }` therefore DROPS the default
`tool: stryker`. This is the merge seam that P8 fixes.

**`edits.js` — `applyEnableEdits`** calls `applyAllowedOverrides` which also copies
`role` and `model` onto the descriptor. The resolver therefore already honors these
fields at run time — but `manifest.js` PHASE_FIELDS does not include them, causing
`validateManifest` to reject them as unknown. The same gap covers `execution` (resolved
by `validateExecutionValues` + `resolveExecution` but absent from `PHASE_FIELDS`) and
`enabled` (consumed by `applyEnableEdits` but absent from `PHASE_FIELDS`). Examples of
live rejections empirically verified:
- `phases.documentation.execution: inline` — rejected (PRD §7 #4 catalog sample)
- `phases.planning.role: my:domain-planner` — rejected (S2 scenario fixture)
- `phases.review.harness: { max_cycles: 2 }` — rejected (P8's own target)
- `phases.requirements.enabled: true` — rejected

All four bypass `validateManifest` in scenario tests because those tests call
`resolvePipeline` directly. P8 closes this lint gap.

**`resolve.js`** — `applyEnableEdits([...defaults], skipSet, phaseOverrides)` calls
`applyAllowedOverrides`, so once the merge semantics are corrected in `edits.js`, the
merged harness block flows onto the effective descriptor automatically. No new resolver
wiring is needed.

**`skills/review/SKILL.md`** step 2 hardcodes the probe: `dimensions = code, security,
tests, perf`; steps 1/4 hardcode "≤3 cycles" and "LOW-only convergence".

**`skills/validation/SKILL.md`** references the tool and scope implicitly (step 1 uses
`stryker`, step 1 scopes per-hunk) — the knobs are not read from any data source.

**`skills/run/SKILL.md`** step 4 names harness archetypes (`harness-read`,
`harness-exec`) in the session-owned responsibilities table but does not surface
`phase.harness` knobs to the walk.

The **7-export surface** (`engine/src/index.js`) and `resolvePipeline`'s signature are
stable; P8 does not change them.

### What the ADR conversation settled (do not re-open)

The four decisions were ratified before design was written. They are documented as
accepted below (ADR-028…031) and are not re-opened.

---

## Requirements

| # | Requirement | Mechanism |
|---|---|---|
| R1 | `PHASE_FIELDS` in `manifest.js` is extended to the full honored set: `context`, `override`, `strategy`, `merge-flags`, `non-blocking-jobs`, `harness`, `execution`, `enabled`, `role`, `model` | `PHASE_FIELDS` expansion; one slice, not incremental |
| R2 | `validatePhaseBlock` rejects `phases.<id>.harness` values that fail the typed shape check; unknown sub-keys are ALLOWED (forward-compat) | new `validateHarness` private function |
| R3 | `validatePhaseBlock` adds string shape checks for `role` and `model`; a boolean check for `enabled`; does NOT duplicate the execution-value check (already in `validateExecutionValues`) | inline checks in `validatePhaseBlock` |
| R4 | A partial manifest `phases.<id>.harness` override DEEP-MERGES over the descriptor's default `harness` block; unset default knobs survive the merge | `applyAllowedOverrides` in `edits.js` — harness gets a one-level deep-merge path |
| R5 | `pipeline/default.yml`'s `review` descriptor gains a `harness:` block holding the four defaults that were previously hardcoded in `skills/review/SKILL.md` prose | YAML data change; walk reads from data |
| R6 | `skills/review/SKILL.md` reads `dimensions`, `passes`, `max_cycles`, and `convergence` from the resolved `phase.harness` block; falls back to strong defaults when a knob is absent | prose edit |
| R7 | `skills/validation/SKILL.md` reads `tool`, `scope`, and `incremental` from the resolved `phase.harness` block | prose edit |
| R8 | `skills/run/SKILL.md` step 4's harness-archetype session-owned responsibilities note where `phase.harness` knobs are available to the executing phase | prose addition |
| R9 | S-harness scenario(s) test the merged harness block on the effective descriptor: override knob wins; default knobs survive; a bad harness shape produces `validateManifest` errors | new fixtures + tests |
| R10 | SC1/S1/S2/S3/S-lean/S-full/S-reorder/SC3 + contract-equivalence remain green; `resolvePipeline` signature, 7-export surface, `graph.js`, `contract.js` untouched | surface-gate invariant |
| R11 | `passes > 1` is accepted by `validateHarness` and deep-merged correctly, but the walk's multi-reviewer fan-out for `passes > 1` is **documented as parked** — the skill prose describes it as advisory | parked item in design + walk prose |

---

## Design

### Files that change

- `engine/src/manifest.js` — expand `PHASE_FIELDS` (ADR-028); add `validateHarness` private fn (ADR-030); add inline checks for `role`/`model`/`enabled` in `validatePhaseBlock`; do NOT add execution check (ADR-028).
- `engine/src/edits.js` — change `applyAllowedOverrides` to deep-merge `harness` instead of scalar-replace (ADR-029); all other fields remain scalar-replace.
- `pipeline/default.yml` — add `review.harness:` block with four keys (ADR-031).
- `skills/review/SKILL.md` — replace hardcoded knobs with `phase.harness` reads (ADR-031).
- `skills/validation/SKILL.md` — replace implicit tool/scope with `phase.harness` reads (ADR-031).
- `skills/run/SKILL.md` — add one sentence to step 4's harness-archetype block.
- `engine/test/scenarios.test.js` — add S-harness-review, S-harness-validation golden assertions; add bad-harness-shape inline negative.
- `engine/test/fixtures/scenarios/S-harness-review/manifest.yml` — new fixture.
- `engine/test/fixtures/scenarios/S-harness-validation/manifest.yml` — new fixture.

### Decision candidates

**All four decisions were ratified by the user before this doc was written. They are
recorded here as accepted ADRs (ADR-028 through ADR-031).**

| # | Choice | Resolution | ADR |
|---|---|---|---|
| DC-A / ADR-028 | **PHASE_FIELDS reconciliation scope** — harness-only vs. whole honored set (harness + execution + enabled + role + model in one slice) | **Whole honored set in one slice.** Closes the real lint bug (PRD §7 #4 + S2 both fail lint today). Fixes the same gap class. Execution is accepted by PHASE_FIELDS but the value check stays in `validateExecutionValues` (no duplication); `manifest.js` need only ACCEPT the field. Same fix-cost; smooths P9. | ADR-028 |
| DC-B / ADR-029 | **Harness override merge semantics** — scalar-replace (current, drops unset keys) vs. deep-merge one level vs. deep-merge recursively | **Deep-merge one level.** Objects merge one level: `{ tool:stryker, scope:per-hunk }` overridden by `{ scope:per-file }` yields `{ tool:stryker, scope:per-file }`. Role/model/enabled stay scalar-replace. Implemented in `applyAllowedOverrides` — harness gets a dedicated merge path, others scalar. Pure; immutable (new object via spread). Recursive merge is not needed: the `harness:` block is at most two levels (known sub-keys are all scalar; forward-compat unknown sub-keys may be nested, but only the top-level merge is guaranteed). | ADR-029 |
| DC-C / ADR-030 | **`validateHarness` shape strictness** — reject all unknown sub-keys (tight) vs. allow unknown sub-keys (forward-compat) vs. no sub-validation | **Typed + allow unknown sub-keys.** Named private `validateHarness` mirroring `validateReorder` style: dimensions=list-of-strings, passes/max_cycles=positive integer, convergence ∈ {`low-only`|`none`|numeric≥0}, tool/scope=string, incremental=bool. Unknown sub-keys are silently passed through (forward-compat for repo-specific config like `rules:` on `dependency-cruiser`). Catches `max_cycles: 'three'` without blocking "any harness a repo adds" (PRD §8). | ADR-030 |
| DC-D / ADR-031 | **Review defaults SoT** — keep in SKILL.md prose vs. relocate to `pipeline/default.yml` data | **Relocate to data.** Move review's four knobs (`dimensions`/`passes`/`max_cycles`/`convergence`) into `review.harness` in `pipeline/default.yml`. Data is the SoT; the walk reads them from the resolved descriptor with strong fallback defaults. Golden-safe — no existing test asserts a descriptor's `harness` value (verified against scenarios.test.js and contract-equivalence.test.js). | ADR-031 |

### `manifest.js` changes

#### PHASE_FIELDS expansion (ADR-028)

```js
const PHASE_FIELDS = Object.freeze(new Set([
  'context', 'override', 'strategy', 'merge-flags', 'non-blocking-jobs',
  'harness', 'execution', 'enabled', 'role', 'model',
]));
```

`execution` is accepted here; its VALUE is checked by the already-present
`validateExecutionValues` step in `resolve.js`. `validatePhaseBlock` must not
duplicate that check — it only gates acceptance of the key.

#### `validateHarness(harness, phaseName, errors)` — new private function (ADR-030)

A named private function called from `validatePhaseBlock` when `field === 'harness'`.
Mirrors the `validateReorder` naming convention.

Shape rules:

| Sub-key | Accepted shape | Rejection message |
|---|---|---|
| `dimensions` | array of strings | `phases.<id>.harness.dimensions must be a list of strings` |
| `passes` | positive integer (>0) | `phases.<id>.harness.passes must be a positive integer` |
| `max_cycles` | positive integer (>0) | `phases.<id>.harness.max_cycles must be a positive integer` |
| `convergence` | string `low-only` or `none`, OR number ≥ 0 | `phases.<id>.harness.convergence must be 'low-only', 'none', or a non-negative number` |
| `tool` | string | `phases.<id>.harness.tool must be a string` |
| `scope` | string | `phases.<id>.harness.scope must be a string` |
| `incremental` | boolean | `phases.<id>.harness.incremental must be a boolean` |
| any other key | allowed (no error) | — |

Implementation:
- `harness` must be a non-null object (not array); otherwise push `phases.<id>.harness must be an object` and return.
- Check each known sub-key only if present (optional; absence is valid).
- Accumulate ALL errors (no short-circuit) — same policy as `validateReorder` and `checkReorderApplicability`.

#### Inline checks for `role`, `model`, `enabled` in `validatePhaseBlock`

After the `PHASE_FIELDS` guard allows the key, add value-shape checks:

```js
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
// execution: accepted by PHASE_FIELDS; value checked by validateExecutionValues — no check here
```

### `edits.js` changes — deep-merge for harness (ADR-029)

**Current `applyAllowedOverrides`:**
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

**P8 change:**
```js
function applyAllowedOverrides(descriptor, override) {
  const patch = {};
  for (const field of ALLOWED_PHASE_OVERRIDE_FIELDS) {
    if (!Object.hasOwn(override, field)) continue;
    if (field === 'harness' && descriptor[field] !== undefined && descriptor[field] !== null
        && typeof descriptor[field] === 'object' && !Array.isArray(descriptor[field])
        && typeof override[field] === 'object' && !Array.isArray(override[field])
        && override[field] !== null) {
      patch[field] = { ...descriptor[field], ...override[field] };
    } else {
      patch[field] = override[field];
    }
  }
  return { ...descriptor, ...patch };
}
```

**Semantics:**
- If both the descriptor's default `harness` and the override's `harness` are plain
  objects, merge one level: override keys win, unset default keys survive.
- If either side is not a plain object (null, array, or absent), fall through to
  scalar-replace — no silent error; the shape validator catches malformed values before
  the resolver runs.
- `role`, `model`, `enabled` remain scalar-replace (no change).

**Immutability.** The spread `{ ...descriptor[field], ...override[field] }` produces a
new object; neither the descriptor nor the override is mutated. The resulting merged
object is then spread into the new descriptor via `{ ...descriptor, ...patch }`. No
mutation anywhere.

**Edge case — descriptor has no default harness (e.g. `review` before P8 adds one):**
The descriptor's `harness` field is `undefined`. The guard fails (`undefined !== null`
branch or type check fails) → scalar-replace applies. The full override harness object
lands on the descriptor as-is. This is correct: there is no default to preserve.

**Edge case — nested array values in harness (e.g. `dimensions: [code, tests]`):**
Deep-merge is one level only. If both descriptor and override have `dimensions`, the
override's array REPLACES the descriptor's array (arrays are not deep-merged). This is
the intended behavior: a manifest that specifies `dimensions: [code]` wants exactly
`[code]`, not a union. Document this explicitly in the walk-reading section.

### `pipeline/default.yml` change — review.harness (ADR-031)

Add `harness:` to the `review` descriptor:

```yaml
- id: review
  archetype: harness
  contract:
    - harness-read
  procedure: forge:review
  role: forge:reviewer
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

This is golden-safe: no existing test in `scenarios.test.js` or
`contract-equivalence.test.js` asserts on a descriptor's `harness` field value
(verified by reading both test files). The SC1 golden pins effective ids,
roles/archetypes, gate decisions, and waivers — not harness values.

### Walk wiring — how the skill reads phase.harness

The resolved descriptor is available to the walk via `Resolution.effective[]`. The
orchestrator iterates that array and, for each phase, holds the full descriptor as
`phase` throughout steps 1–5 of the walk. `phase.harness` is therefore available
to the orchestrator session at every step.

**`contract-assemble` does NOT carry harness knobs.** The `engine/bin/contract-assemble.js`
bin reads the descriptor from `pipeline/default.yml` directly (keyed by `--descriptor-id`)
to assemble the injected contract block. It uses the `contract:` field, not `harness:`.
The assembled block does not include harness knobs and does not need to — the contract
block governs invariant behavior; the harness knobs govern tunable execution parameters.
The two concerns remain separate.

**How `phase.harness` is accessed in the skill prose:** each harness skill references
`phase.harness` — "the harness block on the resolved descriptor for this phase"
(i.e. the descriptor object from `Resolution.effective[]` that the orchestrator holds
in-session). No new bin, no new assembly step, no new injected field. The descriptor
is the single source of truth for harness knobs, and the orchestrator holds it already.

#### `skills/review/SKILL.md` changes (R6)

**Current step 2 probe (hardcoded):**
> Probe: dimensions = code, security, tests, perf …; steps 4 hardcodes "≤3 cycles",
> "LOW-only convergence".

**P8 replacement — read from `phase.harness`:**

Step 2 becomes:

> **Probe: read harness knobs from `phase.harness` (the resolved descriptor for this
> phase).** Strong fallback defaults apply when a knob is absent:
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

Step 4's convergence rule changes from "≤3 cycles … LOW-only" to:

> **Converge per dimension, up to `phase.harness.max_cycles` cycles** (default 3):
> - `convergence: low-only` → converged once only LOW findings remain; no relaunch.
> - `convergence: none` → no convergence loop; one pass only.
> - `convergence: <n>` (numeric ≥ 0) → stop when remaining finding count ≤ n.
> MEDIUM+ surviving findings → fresh reviewer scoped to the FIX DELTA only.

**`passes > 1` fan-out — parked.** The `passes` knob is accepted by the validator and
deep-merged correctly onto the descriptor. The walk prose reads it and can describe the
intent (N reviewers per dimension), but the multi-reviewer fan-out is not engine-enforced
in P8 — the session honors it as a self-directed constraint. This is a walk fidelity
matter, not an engine gap, and rides to a later cleanup pass. It is documented as a
parked item, not silent.

#### `skills/validation/SKILL.md` changes (R7)

**Current step 1 (implicit tool/scope):**
> scope the run to exactly the change's touched code — never the full tree … one range
> per contiguous changed hunk …

**P8 addition — read from `phase.harness`:**

Step 1 preamble gains:

> **Read harness knobs from `phase.harness` (the resolved descriptor for this phase).**
> Strong fallback defaults apply when a knob is absent:
>
> | Knob | Field | Fallback |
> |---|---|---|
> | Mutation tool | `phase.harness.tool` | probe at preamble step 2 (absent = no-op) |
> | Hunk scope | `phase.harness.scope` | `per-hunk` |
> | Incremental run | `phase.harness.incremental` | `false` |
>
> The preamble step 2 probe ("mutation tooling configured?") runs regardless of whether
> `phase.harness.tool` is set — the probe checks the actual tool config in the repo.
> `phase.harness.tool` tells the phase WHICH tool to invoke when the probe passes; its
> absence means "probe determines the tool".

#### `skills/run/SKILL.md` change (R8)

In step 4's session-owned responsibilities table, the harness-exec and harness-read rows
gain one sentence each:

> `harness` (`harness-read ∈ contract`): apply ALL findings; convergence per
> `phase.harness` knobs (dimensions, passes, max_cycles, convergence — see
> `forge:review` SKILL.md for the read protocol).
>
> `harness` (`harness-exec ∈ contract`): start background run using the tool and scope
> from `phase.harness` (tool, scope, incremental — see `forge:validation` SKILL.md for
> the read protocol); gate `propose` on triage completion.

This is a single-sentence addition per row — no structural change to step 4.

### Wiring in `resolve.js` — no new steps needed

`applyEnableEdits` already calls `applyAllowedOverrides`, which will now deep-merge
harness. The merged harness flows onto every descriptor in `enableResult.descriptors`
before any downstream step. `resolveExecution` and the graph check are unaffected. No
new resolver steps, no new imports, no signature changes.

### Surface-gate invariants (hard constraints)

| Surface | Must stay |
|---|---|
| `resolvePipeline(defaults, manifest)` signature | unchanged |
| `engine/src/index.js` 7-export surface | unchanged |
| `pipeline/default.yml` 13 descriptors, enabled/disabled state | unchanged |
| `graph.js` `validatePipeline(descriptors)` signature | unchanged |
| `contract.js` `assembleContract` | unchanged |
| CI (`scripts/ci.sh`) | green at every commit |

---

## Test strategy

### Already green (must stay green — the surface gate)

- `engine/test/scenarios.test.js` — SC1, S1, S2, S3, S4, S5, S6, S7, S8, S9, S-lean,
  S-full, S-reorder, SC3.
- `engine/test/contract-equivalence.test.js` — agent vs. inline block equivalence per
  descriptor.
- All existing negative tests (skip strands, bad profile, unknown pipeline key, gate
  floor, reorder-refused, checkReorderApplicability).

### P8 additions

#### Unit: `validateHarness` shape checks

Inline unit tests in a manifest.test.js block (or as focused cases in the existing
manifest-lint suite), one per typed sub-key and one for unknown sub-keys:

```
Given phases.review.harness: { max_cycles: 'three' }, when validateManifest runs, then ok:false with max_cycles type error
Given phases.review.harness: { passes: 0 }, when validateManifest runs, then ok:false (passes must be positive)
Given phases.review.harness: { convergence: 'bad-value' }, when validateManifest runs, then ok:false
Given phases.review.harness: { convergence: 0 }, when validateManifest runs, then ok:true (numeric 0 is valid)
Given phases.review.harness: { convergence: 'low-only' }, when validateManifest runs, then ok:true
Given phases.review.harness: { convergence: 'none' }, when validateManifest runs, then ok:true
Given phases.review.harness: { dimensions: 'not-a-list' }, when validateManifest runs, then ok:false
Given phases.review.harness: { dimensions: ['code', 'tests'] }, when validateManifest runs, then ok:true
Given phases.review.harness: { tool: 42 }, when validateManifest runs, then ok:false
Given phases.review.harness: { incremental: 'yes' }, when validateManifest runs, then ok:false
Given phases.review.harness: { rules: '.dependency-cruiser.json' } (unknown sub-key), when validateManifest runs, then ok:true (forward-compat)
Given phases.review.harness: 'not-an-object', when validateManifest runs, then ok:false
```

#### Unit: `validatePhaseBlock` — newly accepted fields (ADR-028 lint-gap closure)

```
Given phases.documentation.execution: inline, when validateManifest runs, then ok:true (no longer rejected)
Given phases.planning.role: 'my:domain-planner', when validateManifest runs, then ok:true
Given phases.review.harness: { max_cycles: 2 }, when validateManifest runs, then ok:true
Given phases.requirements.enabled: true, when validateManifest runs, then ok:true
Given phases.review.role: 42 (non-string), when validateManifest runs, then ok:false with role-type error
Given phases.review.model: true (non-string), when validateManifest runs, then ok:false with model-type error
Given phases.review.enabled: 'yes' (non-boolean), when validateManifest runs, then ok:false with enabled-type error
```

#### Unit: `applyAllowedOverrides` deep-merge

Inline unit tests or targeted edits tests:

```
Given descriptor.harness: { tool: 'stryker', scope: 'per-hunk' } and override.harness: { scope: 'per-file' }, when applyAllowedOverrides runs, then result.harness is { tool: 'stryker', scope: 'per-file' } (tool preserved, scope overridden)
Given descriptor.harness: { tool: 'stryker', scope: 'per-hunk' } and override.harness: { max_cycles: 2 }, when applyAllowedOverrides runs, then result.harness contains tool, scope, and max_cycles
Given descriptor has no harness and override.harness: { scope: 'per-file' }, when applyAllowedOverrides runs, then result.harness is { scope: 'per-file' } (scalar-replace fallback)
Given override.harness is null, when applyAllowedOverrides runs, then result.harness is null (scalar-replace for non-object)
Given descriptor.harness: { dimensions: ['code','tests'] } and override.harness: { dimensions: ['code'] }, when applyAllowedOverrides runs, then result.harness.dimensions is ['code'] (array replace, not union)
Given descriptor has harness and override.role: 'my:role', when applyAllowedOverrides runs, then role is scalar-replaced (scalar semantics unchanged)
Given any call to applyAllowedOverrides, when it runs, then the input descriptor object is not mutated (immutability)
```

#### Scenarios: `scenarios.test.js` — S-harness suite

**S-harness-review** — partial harness override on the `review` phase preserves
unset default knobs:

Fixture manifest (`engine/test/fixtures/scenarios/S-harness-review/manifest.yml`):
```yaml
phases:
  review:
    harness:
      max_cycles: 2
```

Assertions:
- `result.ok === true`
- The `review` descriptor in `result.effective` has
  `harness.max_cycles === 2` (override wins)
- The `review` descriptor in `result.effective` has
  `harness.dimensions` deeply equal to `['code', 'security', 'tests', 'perf']`
  (default survives — this is the merge guarantee)
- `result.effective.map(d => d.id)` equals SC1_IDS (no phase-count or order change)
- `result.effective.find(d => d.id === 'validation').harness.tool === 'stryker'`
  (unrelated descriptor's harness is unchanged)

**S-harness-validation** — partial harness override on the `validation` phase:

Fixture manifest (`engine/test/fixtures/scenarios/S-harness-validation/manifest.yml`):
```yaml
phases:
  validation:
    harness:
      scope: per-file
```

Assertions:
- `result.ok === true`
- `result.effective.find(d => d.id === 'validation').harness.tool === 'stryker'`
  (default tool preserved)
- `result.effective.find(d => d.id === 'validation').harness.scope === 'per-file'`
  (override wins)
- `result.effective.map(d => d.id)` equals SC1_IDS

**Bad-harness-shape negative** — inline test (no fixture dir):

```js
test('Given phases.review.harness.max_cycles is a string, when validateManifest runs, then ok:false', () => {
  const manifest = { phases: { review: { harness: { max_cycles: 'three' } } } };
  const result = validateManifest(manifest);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => e.includes('max_cycles')),
    `errors must mention max_cycles; got: ${JSON.stringify(result.errors)}`,
  );
});
```

---

## Parked items

| Item | Rationale |
|---|---|
| `passes > 1` multi-reviewer fan-out enforcement | Accepted by the validator and deep-merged correctly; the walk prose can describe the intent (N reviewers per dimension) but engine-enforcement requires session-level parallelism coordination. Deferred to a walk-prose cleanup pass; not a silent cap — stated explicitly in `review/SKILL.md`. |
| `convergence: <n>` numeric walk enforcement | The validator accepts numeric ≥ 0 and the descriptor carries the value. The walk prose reads it. Exact stopping behavior for arbitrary numeric thresholds (e.g. finding-count vs. severity-weighted) is walk-judgment; not engine-enforced in P8. |
| Per-invocation harness override via `--harness` CLI flag | Not in the P8 PRD row. Would follow the `--profile`/`--skip` pattern (ADR-022) in a later phase. |

---

## Out of scope

| Item | Why excluded |
|---|---|
| `contract-assemble` changes | The assembler reads `contract:` fields from the default descriptor; `harness:` is a separate tunable-execution concern. The assembler emits the contract block; the orchestrator reads harness knobs directly from the resolved descriptor in-session. No assembler change needed. |
| `engine/src/resolve.js` wiring changes | `applyEnableEdits` → `applyAllowedOverrides` already in the chain; fixing merge semantics in `edits.js` is sufficient. No new resolver steps. |
| `graph.js` / `contract.js` | Frozen surfaces; P8 does not touch them. |
| `pipeline-resolve.js` bin API | No signature change; the bin already passes the manifest through to `resolvePipeline`. |
| P10 `architecture` harness knobs | `architecture.harness: { tool: dependency-cruiser }` already in `pipeline/default.yml`; its walk prose (the `architecture-triager` agent body) is a P10 concern. |
| P9 agent/skill swap wiring | P8 closes the lint gap for `role:` and `model:` keys; P9 wires the swap UX end-to-end. |
| Backlog/tracker harness customization | Not a harness concern; P11 domain. |
