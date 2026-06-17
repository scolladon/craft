# DESIGN — P7: pipeline editing

> Brief: land `pipeline.reorder` end-to-end — `applyReorder` in `edits.js`, alias-resolve
> support in `resolve.js`, shape validation in `manifest.js`, the walk's inserted-phase
> dispatch fix, SC3 composed golden, and dependency-check hardening — resolving G1/G2 and
> closing OQ1; gate = S3 + SC3 green.
> Status: draft → self-reviewed ×3 → accepted (decisions ADR-024…027; DC-A resolved to a
> separate CQS guard `checkReorderApplicability`, folded back below)

## Context

### What the engine already provides (do not redesign)

P1–P6 are complete and green. The resolver pipeline in `engine/src/resolve.js` is:

```
aliasResolve → validateExecutionValues → expandProfile →
applyEnableEdits → applyInserts → resolveExecution →
checkStrandedConsumers → validatePipeline → resolveGatesAndWaivers
```

**skip** (`applyEnableEdits` in `edits.js`) and **insert** (`applyInserts` in `edits.js`) are
built and green. Their return shape is `{ descriptors, records }` — pure, immutable. S3
(insert bench after validation) is GREEN and is one of the P7 gate tests.

**`validatePipeline`** (`engine/src/graph.js`) already refuses a consumer placed before its
producer via `checkEdgesSatisfied` + `nearestEarlierProducer`. Any reordering that violates
the dependency graph is automatically caught when the post-reorder descriptor list is passed
through `validatePipeline`. This is the existing machinery reorder reuses (ADR-005: "reorder
validation uses the same machinery as a bad skip").

**`checkStrandedConsumers`** (`engine/src/strand.js`) is the pre-graph guardian for skip
stranding. It is NOT involved in reorder validation — reorder operates only on enabled phases
that remain in the post-insert list; stranding is a skip concern.

**`manifest.js`** has `PIPELINE_KEYS = { profile, skip, insert }`. A `reorder` key in the
manifest is currently rejected as unknown. The `validatePipelineKeys` function checks keys
against that set; P7 adds `reorder` to it.

**`aliasResolve`** in `resolve.js` already resolves skip ids and insert `after`/`before`
anchors. Reorder ids must receive the same treatment.

**The 7-export surface** (`engine/src/index.js`) and `resolvePipeline`'s signature are
stable; P7 does not change them.

**`pipeline/default.yml`** (the 13-descriptor SoT) is untouched by P7.

**`skills/run/SKILL.md`** step 1 dispatches `forge:<phase.id>`. P7 relaxes this for
inserted phases: the dispatch target is `phase.procedure` verbatim, namespace-agnostic
(whether `forge:bench` or `acme:bench`). Step 4's execution-mode branching is unchanged;
the `effective[]` order already reflects any reorder, so the walk needs no reorder awareness
beyond consuming `Resolution.effective[]` in order.

### What ADR-005 settled (do not re-open)

Arbitrary reorder (OQ1 in the PRD) was deferred until insert+skip were green. P7 ends the
deferral. ADR-005 established that reorder's dependency validity is checked by the graph,
not a separate pre-check — the engine refuses a consumer-before-producer ordering through
the existing `validatePipeline` path. P7 makes this live.

### SP2 and namespaced procedures (load-bearing for the walk change)

SP2 confirmed cross-plugin dispatch works via native `dependencies` + namespacing. A phase
inserted from a manifest may carry `procedure: acme:bench`; the walk's current "dispatch
`forge:<phase.id>`" assumption breaks for such phases. P7 corrects the dispatch to use
`phase.procedure` verbatim. The inserted-phase registration surface (`forge.extends:`) is
P14; P7 only fixes the dispatch-target computation and documents that namespaced procedures
dispatch via cross-plugin (SP2-proven).

---

## Requirements

| # | Requirement | Mechanism |
|---|---|---|
| R1 | `pipeline.reorder: [id, id, …]` permutes slots of the post-insert enabled-descriptor list; unlisted phases keep their exact positions | `applyReorder` in `edits.js` |
| R2 | Reorder ids are alias-resolved in `aliasResolve` before any downstream step sees them | `aliasResolve` in `resolve.js` extended |
| R3 | `applyReorder` slots in after `applyInserts`, before `resolveExecution`, matching the existing pipeline step ordering | `resolve.js` wiring |
| R4 | `applyReorder` records each reorder in `record[]` for traceability; the format is consistent with skip and insert record lines | record string spec (§Design) |
| R5 | `checkReorderApplicability` (a separate CQS query, ADR-026) refuses: unknown reorder id, id referencing a non-enabled phase, duplicate id in the list; each refusal has a clear message; `applyReorder` stays a pure transform | applicability guard spec (§Design) |
| R6 | A reorder that puts a consumer before its producer produces `ok: false` via the existing `validatePipeline` graph check; no duplicate ordering pre-check is added | ADR-005 compliance; the graph check fires on the post-reorder descriptor list |
| R7 | `manifest.js` accepts `reorder` as a valid `pipeline` sub-key and validates its shape (list of strings) | `PIPELINE_KEYS` + shape check |
| R8 | The walk dispatches `phase.procedure` verbatim for all phases (not `forge:<phase.id>`); a missing procedure → STOP with a clear message | `run/SKILL.md` step 1 edit |
| R9 | SC3 composed scenario (skip + insert + reorder together) is authored and its golden pins effective ids, record lines, and gateDecisions | new fixture + test |
| R10 | S-reorder positive scenario (valid reorder alone) and reorder-refused negative (consumer before producer, `ok:false`) are tested | new tests |
| R11 | S1/SC1/S3/S-lean/S-full/contract-equivalence all stay green; `pipeline/default.yml`, 7-export surface, and `resolvePipeline` signature untouched | surface-gate invariant |

---

## Design

### Files that change

- `engine/src/edits.js` — add `applyReorder` (a **pure positional transform**, sibling of `applyEnableEdits`/`applyInserts`) AND `checkReorderApplicability` (a **query** returning an `error[]`, symmetric with `checkStrandedConsumers`). Per ADR-026/CQS the command and the query are separate functions — `applyReorder` never returns errors.
- `engine/src/resolve.js` — (a) extend `aliasResolve` to resolve reorder ids; (b) run `checkReorderApplicability` after `applyInserts` and fail fast on errors; (c) wire `applyReorder` after the guard, before `resolveExecution`; (d) import both.
- `engine/src/manifest.js` — add `'reorder'` to `PIPELINE_KEYS`; add `validateReorder` shape check called from `validatePipelineKeys`.
- `skills/run/SKILL.md` — relax step 1 dispatch to use `phase.procedure` verbatim; update walk error-paths table.
- `engine/test/scenarios.test.js` — add SC3 composed golden, S-reorder positive, reorder-refused negative.
- `engine/test/fixtures/scenarios/SC3/manifest.yml` — new fixture.

### `applyReorder(descriptors, reorderList)` — algorithm

**Inputs:**
- `descriptors` — the descriptor list after `applyInserts` (includes inserted phases; all enabled/disabled flags already applied).
- `reorderList` — the alias-resolved list of ids from `pipeline.reorder`.

**Precondition (CQS, ADR-026).** Applicability is validated by a *separate* query —
`checkReorderApplicability` (below) — which `resolve.js` runs **before** `applyReorder` and
fails fast on. `applyReorder` therefore assumes a valid list: every id is present, enabled, and
unique. It is a **pure command** — it returns `{ descriptors, records }` only, never errors.

**Algorithm:**

1. **Slot collection** — scan `descriptors` left-to-right; collect the index of each descriptor whose id appears in `reorderList`, in left-to-right encounter order (not in the order of `reorderList`):
   ```
   const reorderSet = new Set(reorderList);
   const slots = descriptors.reduce((acc, d, i) => {
     if (reorderSet.has(d.id)) acc.push(i);
     return acc;
   }, []);
   // slots is sorted ascending: [earliest matching index, ..., latest matching index]
   ```

2. **Slot refill** — produce a new descriptor list where the collected slots are refilled with the descriptors in the order specified by `reorderList`. The k-th slot (in left-to-right position order) receives the descriptor whose id is `reorderList[k]`:
   ```
   const byId = Object.fromEntries(descriptors.map(d => [d.id, d]));
   const reordered = [...descriptors];
   for (let k = 0; k < slots.length; k++) {
     reordered[slots[k]] = byId[reorderList[k]];
   }
   ```
   Every position NOT in `slots` is unchanged. This is a pure positional permutation — no descriptor is removed or duplicated.

3. **Record lines** — one record line per id in `reorderList`:
   ```
   reorder: <id> (pipeline.reorder)
   ```
   Example: `reorder: validation (pipeline.reorder)`.

4. **Return** `{ descriptors: reordered, records }` — matching the shape of `applyEnableEdits` and `applyInserts`. No `errors` field exists on this command (see `checkReorderApplicability`).

**Immutability.** `applyReorder` never mutates its input. The slot-refill produces a new array via spread; each cell is the same frozen descriptor object reference.

**Empty reorder list.** If `reorderList` is empty or absent, return `{ descriptors, records: [] }` immediately — a no-op identical to `applyInserts` with no inserts.

**Example** (from the brief):
- Current post-insert ids: `[…, review, refactoring, validation, …]`
- `reorder: [validation, review, refactoring]`
- Slots collected: indices of `review`, `refactoring`, `validation` in that order.
- Slots refilled: position formerly holding `review` now holds `validation`; position formerly holding `refactoring` now holds `review`; position formerly holding `validation` now holds `refactoring`.
- Result ids: `[…, validation, review, refactoring, …]`
- Record lines: `reorder: validation (pipeline.reorder)`, `reorder: review (pipeline.reorder)`, `reorder: refactoring (pipeline.reorder)`.

### Record string format

Consistent with existing record lines:
- Skip: `skip: <id> (manifest pipeline.skip)`
- Insert: `insert: <id> (after:<x>)` / `insert: <id> (before:<x>)` / `insert: <id> (append)`
- Reorder: `reorder: <id> (pipeline.reorder)`

One record line is emitted per id in the reorder list, in reorder-list order.

### Wiring in `resolve.js`

The reorder step slots between `applyInserts` and `resolveExecution`, with the applicability
guard fail-fast just ahead of the transform:

```
applyEnableEdits → applyInserts → checkReorderApplicability → applyReorder → resolveExecution
```

`aliasResolve` is extended to resolve reorder ids alongside skip ids and insert anchors. The
function returns a new manifest object with `pipeline.reorder` already alias-resolved,
parallel to how `pipeline.skip` and `pipeline.insert` are handled:

```js
const resolvedReorder = (pipeline.reorder ?? []).map(resolveAlias);
return {
  ...manifest,
  pipeline: { ...pipeline, skip: resolvedSkip, insert: resolvedInsert, reorder: resolvedReorder },
  phases: resolvedPhases,
};
```

`applyReorder` then receives the already-alias-resolved list from `resolved.pipeline.reorder`.

The `resolve.js` body after the `insertResult` line becomes (the guard returns an `error[]`,
symmetric with `checkStrandedConsumers`):

```js
const reorderErrors = checkReorderApplicability(insertResult.descriptors, resolved.pipeline?.reorder ?? []);
if (reorderErrors.length > 0) {
  return { ok: false, errors: reorderErrors, effective: [], record: [], gateDecisions: [], waivers: [] };
}
const reorderResult = applyReorder(insertResult.descriptors, resolved.pipeline?.reorder ?? []);
const execResult = resolveExecution(
  reorderResult.descriptors, phaseOverrides, profile, resolved.execution, profileName,
);
const record = [
  ...enableResult.records,
  ...insertResult.records,
  ...reorderResult.records,
  ...execResult.records,
  ...manifestRecords,
];
```

The `resolvePipeline` signature (`(defaults, manifest)`) and its return shape are unchanged.

### `checkReorderApplicability(descriptors, reorderList)` — the query (ADR-026, CQS)

A pure **query** returning `string[]` (empty = applicable), a sibling of
`checkStrandedConsumers`. It accumulates ALL errors (no short-circuit) so a bad manifest surfaces
every problem at once. `applyReorder` is never reached unless this returns empty.

| Condition | Message |
|---|---|
| Unknown id | `reorder: unknown id "${id}" — not present in the post-insert descriptor list` |
| Non-enabled id | `reorder: "${id}" is not enabled — only enabled phases may be reordered` |
| Duplicate id | `reorder: duplicate id "${id}" in pipeline.reorder list` |

The unknown-id check runs before the enabled check for a given id so the enabled check never
dereferences a missing descriptor. Duplicate detection is independent (a duplicate may also be
unknown/non-enabled; reporting the structural error separately avoids confusion). Implementation:
one pass over `reorderList` with a `seen` Set — per id, push unknown XOR non-enabled, and push a
duplicate error when the id is already in `seen`.

### Dependency-check path (reorder-refused)

`checkReorderApplicability` covers structural errors (unknown id, non-enabled id, duplicate).
Graph validity — specifically consumer-before-producer — is NOT checked there. It fires naturally
when the post-reorder descriptor list flows through the existing `validatePipeline →
checkEdgesSatisfied` pass in `resolve.js`. This is the ADR-005/ADR-026 "same machinery" decision:
DRY, no duplicate ordering pre-check.

The `record[]` lines emitted by `applyReorder` give traceability: when `validatePipeline`
produces an error like `Descriptor "validation": consumes artifact "change" but no earlier
enabled descriptor produces it`, the run record already shows `reorder: validation
(pipeline.reorder)` — connecting the edit to the refusal.

The generic graph message from `checkEdgesSatisfied` is sufficient; no reorder-specific
wrapping is added (ADR-005 confirmed this is adequate).

### `manifest.js` changes

**`PIPELINE_KEYS`** gains `'reorder'`:
```js
const PIPELINE_KEYS = Object.freeze(new Set(['profile', 'skip', 'insert', 'reorder']));
```

**`validateReorder`** — a new private function called from `validatePipelineKeys` when a
`reorder` key is present:

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

`validatePipelineKeys` becomes:

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

Shape validation: `reorder` must be a list of strings. No semantic validation in
`manifest.js` (that is the resolver's domain). An empty list is valid shape.

### Walk change — `skills/run/SKILL.md` step 1

**Current step 1:**
> Resolve the skill — invoke `forge:<phase.id>` directly: the skill dir name equals
> `phase.id`. … an enabled phase id with no `skills/<id>/` dir is the loud STOP "unknown
> phase id <id>".

**P7 change to step 1:**
> Resolve the skill — invoke `phase.procedure` verbatim (e.g. `forge:bench`,
> `acme:bench`). For forge-native phases the procedure is always `forge:<phase.id>`, so
> existing phases are unaffected. For inserted phases with a non-forge procedure, the
> verbatim procedure is used directly — cross-plugin dispatch (SP2, proven). If the skill or
> plugin the procedure names is not installed → STOP: "procedure `<phase.procedure>` resolves
> to no installed skill".

**Why step 4 (execution dispatch) is unchanged.** The walk's step 4 branches on
`phase.execution` (`agent` | `inline`) and uses `phase.role` for the agent spawn or inline
role-craft load. Reordering affects only the order of phases in `Resolution.effective[]`,
which the walk already consumes in sequence. No walk logic specific to reorder is needed.

**Walk error-paths table update:**

| Condition | Behavior |
|---|---|
| `ok: false` from `pipeline-resolve` | Stop; surface all `errors[]`; refuse to proceed |
| Non-zero exit from `pipeline-resolve` | Stop; surface stderr; refuse to proceed |
| `effective[]` is empty | Stop; surface "no enabled phases in resolution" |
| A phase's `procedure` resolves to no installed skill (no `skills/<id>/` dir for forge-native, no installed plugin for namespaced) | Stop; surface "procedure `<phase.procedure>` resolves to no installed skill" |
| `awaitingHarnesses` on `propose` is empty | Propose is not gated on any harness; proceed normally |
| `waivers[]` is non-empty | Executing-harness waivers are pre-formatted in `record[]`; surface every other waiver to the run record per §1e; continue |
| A skip strands a consumer | `ok: false` already; covered by the stop-on-error path |
| manifest-lint exits 2 (invalid) | Stop; surface errors (existing behavior; unchanged) |

**Namespaced procedures → P14 boundary.** P7 documents that the dispatch-target computation
uses `phase.procedure` verbatim and that SP2 proves cross-plugin dispatch works. P7 does NOT
build the derived-plugin registration surface (`forge.extends:`) or an installed-plugin
end-to-end run — those stay P14. A namespaced `procedure` that refers to an uninstalled
plugin stops at the "procedure resolves to no installed skill" guard.

### SC3 fixture — the composed golden

SC3 is the composed scenario: skip + insert + reorder together on the default pipeline.

**Chosen composition:**
- Skip `refactoring` (a safe skip — its produces `change` is also produced by `implementation`; `validation` self-supplies nothing but `review-report` is consumed by nothing downstream, so the strand check clears).
- Insert `bench` after `validation` (reusing the S3 fixture structure: `archetype: harness`, `contract: [harness-exec]`, `procedure: forge:bench`, `role: forge:bench-runner`, `consumes: [change]`, `produces: [bench-report]`, `gate: node --test engine/test/bench.test.js`).
- Reorder `[validation, review]` — swap review and validation in their post-insert slots. After the skip and insert steps, the descriptor list (with `refactoring` disabled) is:
  `[workspace(0), design(1), decisions(2), planning(3), implementation(4), review(5), refactoring(6,disabled), validation(7), bench(8), documentation(9), propose(10), integrate(11)]`.
  Slot collection scans all descriptors left-to-right for ids in `{validation, review}`: slots = [5, 7] (review at 5, validation at 7). Refill: slot 5 gets `reorderList[0]` = `validation`; slot 7 gets `reorderList[1]` = `review`. After refill:
  `[workspace(0), design(1), decisions(2), planning(3), implementation(4), validation(5), refactoring(6,disabled), review(7), bench(8), documentation(9), propose(10), integrate(11)]`.
  `review` (now at index 7) and `validation` (now at index 5) both still come after `implementation` (index 4, which produces `change`) — the graph check passes.

**Fixture manifest** (`engine/test/fixtures/scenarios/SC3/manifest.yml`):
```yaml
pipeline:
  skip:
    - refactoring
  insert:
    - id: bench
      archetype: harness
      contract:
        - harness-exec
      procedure: forge:bench
      role: forge:bench-runner
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

**Effective id order** (golden — enabled-only, refactoring excluded):
```
[workspace, design, decisions, planning, implementation, validation, review, bench, documentation, propose, integrate]
```
11 enabled phases (refactoring removed, bench added, review and validation swapped).

**Record lines the test pins** (in order, as a subset assertion):
- `skip: refactoring (manifest pipeline.skip)` — from `applyEnableEdits`
- `insert: bench (after:validation)` — from `applyInserts`
- `reorder: validation (pipeline.reorder)` — from `applyReorder`
- `reorder: review (pipeline.reorder)` — from `applyReorder`

**gateDecisions assertions:**
- `bench` has a non-empty gate (`node --test engine/test/bench.test.js`)
- `propose.awaitingHarnesses` includes `validation` and `bench` (both are `harness-exec` phases, both enabled)
- `propose.awaitingHarnesses` does NOT include `review` (read-harness, not exec-harness)
- `refactoring` has no entry in `gateDecisions` (skipped, not in `effective[]`)

### Edge interactions

**Composition order invariant.** The three edit steps execute in a fixed order regardless of
the manifest:
1. `applyEnableEdits` — skip/enable/disable is applied to the defaults.
2. `applyInserts` — new descriptors are added to the post-skip list.
3. `checkReorderApplicability` then `applyReorder` — the post-insert enabled set is permuted.

Consequences:
- A reorder id that references an inserted phase's id is valid — inserted phases are present and enabled in the post-insert list.
- A reorder id that references a skipped phase's id fails the non-enabled check in `checkReorderApplicability` (`enabled: false` after `applyEnableEdits`), with the non-enabled error message — before `applyReorder` runs.
- A skip and a reorder of the same id in one manifest is therefore an applicability error — not a graph error.

**Reorder of default-off phases.** If `requirements` or `architecture` are NOT enabled in the
manifest, they are `enabled: false` in the descriptor list. A reorder referencing either id
fails the non-enabled check. To reorder a default-off phase, the manifest must first enable it
via `phases.<id>.enabled: true`.

**`aliasResolve` and reorder ids.** `resolveAlias` is applied to each id in
`pipeline.reorder` in `aliasResolve` (the first resolver step), exactly as it is applied to
`pipeline.skip` ids. Old names (e.g. `mutation`) resolve to their canonical id (`validation`)
before `applyReorder` runs.

### Surface-gate invariants (hard constraints)

P7 is engine-invasive: `resolve.js`, `edits.js`, and `manifest.js` change. The following
must stay stable across every P7 commit:

| Surface | Must stay |
|---|---|
| `resolvePipeline(defaults, manifest)` signature | unchanged |
| `engine/src/index.js` 7-export surface | unchanged |
| `pipeline/default.yml` 13 descriptors | unchanged |
| `graph.js` `validatePipeline(descriptors)` signature | unchanged |
| `contract.js` `assembleContract` | unchanged |
| CI (`scripts/ci.sh`) | green at every commit |

---

## Decision candidates

**All resolved in the ADR conversation (2026-06-17).** DC-A took an option that emerged in the
conversation (a separate CQS guard) over the three the designer listed; DC-B/DC-C took the
recommended option. Recorded as ADR-026 (DC-A, DC-B) and ADR-024 (DC-C).

| # | Choice | Resolution | Where |
|---|---|---|---|
| DC-A | **Applicability-error surface** — the designer proposed `applyReorder` returning an `errors` field (a), throwing (b), or always returning `errors` (c). | **Separate `checkReorderApplicability` query** returning `string[]` (symmetric with `checkStrandedConsumers`), run before `applyReorder`; `applyReorder` stays a pure `{descriptors, records}` command. Chosen over all three listed options to honor **CQS** (a repo guardrail) — no command/query mixing in one return. | ADR-026 |
| DC-B | **Record-line granularity** — per-id vs aggregate vs none. | **(a)** one line per reordered id `reorder: <id> (pipeline.reorder)` — symmetric with skip, traceable when the graph refuses. | ADR-026 |
| DC-C | **`validateReorder` location** — named fn vs inline vs exported. | **(a)** named private `validateReorder` called from `validatePipelineKeys`, mirroring `validateModels`/`validateGates`/`validatePr`/`validateScripts`. | ADR-024 |

---

## Test strategy

### Already green (must stay green — the surface gate)

- `engine/test/scenarios.test.js` — SC1, S1, S2, S3, S4, S5, S6, S7, S8, S9, S-lean, S-full.
- `engine/test/contract-equivalence.test.js` — agent vs inline block equivalence per descriptor.
- All existing negative tests (skip strands, bad profile, unknown pipeline key, gate floor).

### P7 additions

#### Unit: `applyReorder` (the pure transform) edge cases

```
Given a valid reorder list, when applyReorder runs, then slots are permuted correctly and record lines emitted
Given an empty reorder list, when applyReorder runs, then descriptors unchanged and records empty
Given alias ids in the reorder list (resolved upstream), when applyReorder runs, then canonical ids are matched correctly
Given a reorder list referencing an inserted phase's id, when applyReorder runs, then it succeeds (inserted phase is enabled and present)
Given any input, when applyReorder runs, then the input descriptor list is not mutated (immutability)
```

#### Unit: `checkReorderApplicability` (the CQS query) edge cases

```
Given an applicable reorder list, when checkReorderApplicability runs, then it returns []
Given a reorder list with an unknown id, when checkReorderApplicability runs, then it returns the unknown-id message
Given a reorder list with a skipped (non-enabled) id, when checkReorderApplicability runs, then it returns the non-enabled message
Given a reorder list with a duplicate id, when checkReorderApplicability runs, then it returns the duplicate message
Given a list with multiple distinct problems, when checkReorderApplicability runs, then it accumulates ALL errors (no short-circuit)
```

#### Unit: `manifest.js` shape validation

```
Given pipeline.reorder: [validation, review] in manifest, when validateManifest runs, then ok:true
Given pipeline.reorder: "not-a-list" in manifest, when validateManifest runs, then ok:false with shape error
Given pipeline.reorder: [1, 2] in manifest (non-string items), when validateManifest runs, then ok:false with item-type error
Given pipeline.reorder: [] in manifest (empty list), when validateManifest runs, then ok:true (empty is valid shape)
```

#### Scenarios: `scenarios.test.js`

**S-reorder positive** — a valid reorder alone:

Fixture manifest (`engine/test/fixtures/scenarios/S-reorder/manifest.yml`):
```yaml
pipeline:
  reorder:
    - validation
    - review
```
Assertions:
- `result.ok === true`
- `result.effective` ids have `validation` before `review` (swapped from SC1 order)
- `result.record` includes `reorder: validation (pipeline.reorder)` and `reorder: review (pipeline.reorder)`
- `result.effective.length === 11` (same phase count as SC1)

**SC3 composed golden** — skip + insert + reorder together:

As specified in the SC3 fixture section above. Tests assert:
- `result.ok === true`
- `result.effective.map(d => d.id)` deep-equals the pinned effective id order
- `result.record` includes all four pinned record lines (as a subset — order-sensitive for the reorder lines, since they follow the insert line)
- `result.gateDecisions.find(g => g.phaseId === 'bench').gate` is non-empty
- `result.gateDecisions.find(g => g.phaseId === 'propose').awaitingHarnesses` includes `'validation'` and `'bench'`

**Reorder-refused negative** — consumer before producer:

Inline test (no fixture dir), matching the style of existing negative tests:

```js
test('Given reorder puts validation before implementation (consumer before producer), when resolvePipeline runs, then ok:false with a graph error', () => {
  const defaults = loadDefault();
  // validation (index 8 in full list) consumes 'change' produced by implementation (index 5).
  // reorder: [validation, implementation] collects slots [5, 8] left-to-right,
  // then places validation at slot 5 and implementation at slot 8 —
  // validation now precedes its producer → graph refuses.
  const manifest = { pipeline: { reorder: ['validation', 'implementation'] } };
  const result = resolvePipeline(defaults, manifest);
  assert.equal(result.ok, false);
  const hasGraphError = result.errors.some(e => e.includes('validation') && e.includes('change'));
  assert.ok(hasGraphError, `errors must mention the consumer-before-producer violation; got: ${JSON.stringify(result.errors)}`);
});
```

#### `aliasResolve` coverage for reorder ids

One test asserting that an alias in `pipeline.reorder` (e.g. `mutation`) is resolved to the
canonical id (`validation`) before `applyReorder` runs — either as a unit test of the
extended `aliasResolve` or as a scenario test:

```
Given pipeline.reorder: [mutation, review] (using old alias), when resolvePipeline runs, then ok:true and effective order reflects the reorder
```

---

## Out of scope

| Item | Why excluded |
|---|---|
| `forge.extends:` derived-plugin registration surface | P14; SP2 proves dispatch works; P7 only fixes the dispatch-target computation |
| An installed-plugin end-to-end run for namespaced procedures | P14; P7 documents the boundary and the SP2 proof |
| Per-invocation `--reorder` CLI flag | Not in the P7 PRD row; the manifest `pipeline.reorder` is the surface; a CLI overlay would follow the `--skip`/`--profile` pattern (ADR-022) in a later phase |
| Reorder of default-off descriptors without enabling them | A configuration error caught by the non-enabled applicability guard; no special handling needed |
| `applyReorder` changing enabled state of any descriptor | Out of contract; reorder is a positional permutation only; enable/disable stays with `applyEnableEdits` |
| `pipeline/default.yml` changes | SoT is frozen for the customizable-engine program; P7 does not touch it |
| `pipeline-resolve.js` bin API changes | The bin already accepts `--skip` and `--profile`; a `--reorder` flag is not in scope; manifest-based reorder reaches the bin through the manifest path |
