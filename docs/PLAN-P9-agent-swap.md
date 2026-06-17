# Plan — P9: agent/skill swap via manifest

> Source: design doc `docs/DESIGN-P9-agent-swap.md` · ADRs 037, 038, 039, 040
> The plan is the implementation script AND the knowledge handoff. Slice agents start
> with zero context: whatever a slice block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Constraints and risks

### Public-surface decision (binding)

`engine/src/index.js` exports SEVEN symbols and they are FROZEN for P9:
```
parsePipeline, validatePipeline, ALIAS_MAP, resolveAlias,
resolvePipeline, assembleContract, normalizeFindings, validateManifest
```

P9 introduces NO new exported symbol. Every new identifier is **internal**:
- `procedure` is a new *string entry* in `ALLOWED_PHASE_OVERRIDE_FIELDS` (`edits.js`) and
  `PHASE_FIELDS` (`manifest.js`) — not a function, not an export.
- The `roleExists` guard in `resolvePipeline` is a guard *inside* the existing exported
  function over the effective descriptors — NOT a new exported function. The probe is read
  from an OPTIONAL trailing `opts` param.

`resolvePipeline`'s return shape `{ ok, errors, effective, record, gateDecisions, waivers }`
stays unchanged. Its call shape stays unchanged for existing callers: the `roleExists` probe
is added as an OPTIONAL third `opts` parameter (defaults to "role resolves"), mirroring
`validateManifest(manifest, opts)`'s `fileExists` precedent (`manifest.js:301,304`). Every
current 2-arg call keeps working; the guard no-ops to "present".

`pipeline/default.yml` (13 descriptors, default `role`/`procedure` values, enabled/disabled
state), `graph.js`'s `validatePipeline(descriptors)`, `contract.js`'s `assembleContract`, and
`engine/bin/contract-assemble.js` are untouched by every slice. SC1 (no-manifest resolution)
stays byte-identical: it carries no swapped role/procedure, so `roleExists` is never consulted
and `applyAllowedOverrides` copies no `procedure`.

### Surface-gate tests that must stay green at every commit

SC1, S1, S2, S3, S4, S5, S6, S7, S8, S9, S-lean, S-full, S-reorder, SC3, S-harness-review,
S-harness-validation, contract-equivalence. CI: `bash scripts/ci.sh` (405 node + 42 bats today).

### Risk: not every descriptor carries a `role` (binding for Slice 2)

Verified against `pipeline/default.yml`: `workspace`, `decisions`, `propose`, `integrate` are
**role-less** (no `role:` field). The Slice-2 guard MUST therefore consult `roleExists` ONLY for
descriptors that carry a truthy `role` (`if (d.role && !roleExists(d.role))`). Probing a role-less
descriptor would call the stub on `undefined` and a strict stub (`ref => ref.startsWith('craft:')`)
would wrongly reject the role-less phases — breaking SC1's default-true no-op and every swap
scenario. The guard is "for every effective descriptor that *carries* a `role`" (design §037).

### Risk: the S2 contract test assembles against FIXTURE bundles, not the real `contracts/` (binding for Slice 3)

`engine/test/scenarios.test.js` builds a module-level `FRAGMENTS` const (lines 40–52) from the
**fixture** bundle dir `engine/test/fixtures/contracts/` — deliberately minimal bundles that test
the assembly *machinery*. That fixture `core.md` OMITS the "No swallowed errors" line that the real
`contracts/core.md` carries. `contract-equivalence.test.js`'s 8-entry `CORE_MARKERS` (lines 34–44)
includes `'swallowed'` because it assembles against the REAL `contracts/`. The shared `FRAGMENTS`
const is ALSO consumed by the S9 tests (lines 465, 482, 489) — it must NOT be mutated, and the
fixture `core.md` must NOT be edited (it would break the byte-identical fixture surface and the S9
assertions). Slice 3 resolves this by assembling the hardened S2 contract assertion against a
SEPARATE local fragments map sourced from the REAL `contracts/` dir (the contract-equivalence
source), so the full 8-marker `CORE_MARKERS` survives honestly without re-listing markers and
without touching the shared `FRAGMENTS` or any fixture. Detail is pre-chewed in Slice 3's Context.

### Sizing rules

- Every slice costs a full agent lifecycle — it must earn it. No standalone test-only slices,
  except the ratified ADR-038 hardening (Slice 3), which is the phase deliverable, not a pass over
  incidentally-already-green code: it converts a two-marker spot-check into a full-core regression
  guard and adds an id-unchanged pin.
- Sequential slices share one working tree; each builds on the prior. Engine slices (1, 2) land
  before the prose/example that document them (4, 5). Slice 3 is independent.

### Dependency order

s1 → s2 → s3 → s4 → s5 (strictly sequential; one shared working tree). s1/s2/s3 touch disjoint
engine/test surfaces; s4/s5 are prose/example and reference the behaviour s1/s2 shipped.

### Decision candidates

NONE open. ADRs 037–040 settle the four originally-open forks; DC-E (per-call inline stub for the
role-not-found negative) is settled to option (a). The two risks above (role-less descriptors,
fixture-bundle marker gap) are construction details the ADRs' spirit determines, pre-chewed into the
relevant slices — not new design forks.

---

## Slice 1 — Engine: default-phase `procedure:` override field (ADR-040)

### Context

**Shape:** TDD / slice-implementer.

**Goal:** make `phases.<id>.procedure` a first-class per-phase override on a *default* phase —
lint accepts a string-shaped value, and `applyAllowedOverrides` copies it onto the effective
descriptor (exactly the path `role` already takes). The walk dispatches it verbatim (ADR-025,
unchanged — no walk touch in this slice).

**File to edit 1:** `engine/src/manifest.js`

Current `PHASE_FIELDS` (lines 27–30) — `procedure` is ABSENT:
```js
const PHASE_FIELDS = Object.freeze(new Set([
  'context', 'override', 'strategy', 'merge-flags', 'non-blocking-jobs',
  'harness', 'execution', 'enabled', 'role', 'model',
]));
```
Add `'procedure'` to this Set.

Current shape-check chain in `validatePhaseBlock` (lines 259–271) — an `else if` ladder inside the
`for (const [field, value] of Object.entries(block))` loop:
```js
    if (field === 'context') {
      checkFileRef(`phases.${phaseName}.context`, value, fileExists, errors);
    } else if (field === 'override') {
      checkFileRef(`phases.${phaseName}.override`, value, fileExists, errors);
    } else if (field === 'role' && typeof value !== 'string') {
      errors.push(`phases.${phaseName}.role must be a string`);
    } else if (field === 'model' && typeof value !== 'string') {
      errors.push(`phases.${phaseName}.model must be a string`);
    } else if (field === 'enabled' && typeof value !== 'boolean') {
      errors.push(`phases.${phaseName}.enabled must be a boolean`);
    } else if (field === 'harness') {
      validateHarness(value, phaseName, errors);
    }
```
Add a `procedure` branch mirroring the `role`/`model` string-shape branch. Insert it adjacent to
the `model` branch (order within the ladder is immaterial — each `field ===` is mutually exclusive):
```js
    } else if (field === 'procedure' && typeof value !== 'string') {
      errors.push(`phases.${phaseName}.procedure must be a string`);
    }
```

**File to edit 2:** `engine/src/edits.js`

Current `ALLOWED_PHASE_OVERRIDE_FIELDS` (line 12) — `procedure` is ABSENT:
```js
const ALLOWED_PHASE_OVERRIDE_FIELDS = new Set(['role', 'model', 'harness']);
```
Add `'procedure'`. The existing `applyAllowedOverrides` (lines 29–40) generic loop then copies it:
`procedure` is a scalar, so the `field === 'harness'` deep-merge branch does NOT apply — it lands
via the `else` scalar-copy branch as-is. NO other `edits.js` change. The `applyEnableEdits` →
`applyAllowedOverrides` wiring already runs for every descriptor (`edits.js:75`,
`resolve.js:171`), so the copied `procedure` flows onto `enableResult.descriptors` automatically —
NO resolver wiring needed.

**Test file to extend 1:** `engine/test/manifest.test.js`

`import { validateManifest } from '../src/manifest.js'` is present; consts `ALWAYS_EXISTS = () => true`
and `NEVER_EXISTS = () => false` at lines 10–11. Mirror the existing `role`/`model` shape-check tests
at lines 720–775 (positive `role` accepted at :720; negative `role: 42` at :753). Add the two new
`procedure` tests into the `// ─── phases: newly accepted fields (ADR-028 lint-gap closure) ───`
section (header at line 707), right after the existing `role` tests, keeping the AAA / `sut` shape.

**Test file to extend 2 (new fixture):** `engine/test/fixtures/scenarios/S2-procedure/manifest.yml`
```yaml
phases:
  planning:
    procedure: acme:my-planner
```

**Test file to extend 3:** `engine/test/scenarios.test.js`

Helpers `loadDefault()` (lines 31–33) and `loadScenarioManifest(scenario)` (lines 35–38) and the
import of `resolvePipeline` (line 20) are present. Add the S2-proc positive after the two existing
S2 tests (which end at line 269), before the `// ─── S3` header at line 271 — keep it inside the
S2 neighbourhood since it shares the planning-descriptor swap subject. Title prefix `S2-proc`.

**No `index.js` / `pipeline/default.yml` touch.** No new export.

### TDD steps

**RED — write these 3 tests before touching `manifest.js`/`edits.js`:**

In `engine/test/manifest.test.js` (after line 729, the existing `role`-accepted test):
```js
// Given/When/Then — procedure accepted as a string (mirrors role/model)
test('Given phases.planning.procedure: "acme:my-planner", when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { planning: { procedure: 'acme:my-planner' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.planning.procedure: 42 (non-string), when validateManifest runs, then ok:false with procedure-type error', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { planning: { procedure: 42 } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('phases.planning.procedure') && e.includes('string')));
});
```
Expected failure: the positive fails with `ok:false` + `"unknown field on phase planning: procedure"`
(PHASE_FIELDS rejects the key before the value check); the negative fails because the error message
is the unknown-field string, not the expected `procedure ... string` type error.

In `engine/test/scenarios.test.js` (after line 269, before the S3 header at line 271):
```js
// ─── S2-proc: default-phase procedure override lands on the descriptor ────────

test('S2-proc Given phases.planning.procedure:acme:my-planner, when resolvePipeline runs, then effective planning carries that procedure with id unchanged', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S2-procedure');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
  const planning = result.effective.find(d => d.id === 'planning');
  assert.ok(planning, 'planning must be in effective pipeline');
  assert.equal(planning.procedure, 'acme:my-planner', 'planning procedure must be overridden');
  assert.equal(planning.id, 'planning', 'the override changes procedure, never id');
});
```
Expected failure: `planning.procedure` is still the default `craft:planning` (the override is not
copied because `procedure ∉ ALLOWED_PHASE_OVERRIDE_FIELDS`), so the `acme:my-planner` assertion fails.

Create the fixture `engine/test/fixtures/scenarios/S2-procedure/manifest.yml` (content above) as part
of RED so the scenario test reaches the resolver rather than throwing `ENOENT`.

Run `cd engine && node --test` → confirm the 3 new tests fail for the reasons above.

**GREEN:**
1. `manifest.js`: add `'procedure'` to `PHASE_FIELDS`; add the `procedure` string-shape `else if`
   branch in `validatePhaseBlock`.
2. `edits.js`: add `'procedure'` to `ALLOWED_PHASE_OVERRIDE_FIELDS`.

Run `cd engine && node --test` → all 3 new tests pass; full suite stays green (405 + 3).

**REFACTOR:** None warranted — both changes ride established patterns (the `role`/`model` shape
branch; the allowed-set string entry). Confirm `validatePhaseBlock` stays a flat `else if` ladder
(no nesting added) and `applyAllowedOverrides` is untouched (the generic loop already copies it).

### Gate

```
cd engine && node --test
```

Spot-check before commit: `result.effective.find(d => d.id === 'planning').procedure` for SC1
(null manifest) is still the default `craft:planning` (no override copied on the default path).

### Commit

```
feat(manifest): accept and copy default-phase procedure override field
```

---

## Slice 2 — Engine: `roleExists` resolution guard (ADR-037)

### Context

**Shape:** TDD / slice-implementer.

**Goal:** a swap to a non-existent / uninstalled role surfaces LOUDLY at the engine resolution
layer — `resolvePipeline` returns `ok:false` with a role-not-found error naming the phase and the
ref — uniformly for agent and inline, via an INJECTED `roleExists` predicate. No walk-level STOP row
for the role case; the disambiguation is by construction (the probe accepts a real external ref,
rejects a typo).

**File to edit:** `engine/src/resolve.js`

Current signature (line 152) is 2-arg:
```js
export function resolvePipeline(defaults, manifest) {
```
Change to add an OPTIONAL trailing `opts` param and read the probe with a default-true fallback —
mirror the `validateManifest` precedent verbatim (`manifest.js:301,304`:
`const fileExists = typeof opts?.fileExists === 'function' ? opts.fileExists : () => true;`):
```js
export function resolvePipeline(defaults, manifest, opts) {
```
Read the probe near the top of the body (e.g. immediately after `const resolved = aliasResolve(manifest);`
at line 153):
```js
  const roleExists = typeof opts?.roleExists === 'function' ? opts.roleExists : () => true;
```

The `effective` filter is computed at line 213:
```js
  const effective = execResult.descriptors.filter(d => d.enabled);
```
Insert the guard AFTER the `effective` filter (line 213) and BEFORE the `resolveGatesAndWaivers`
call (line 215) — so the guard runs on enabled descriptors only (disabled `requirements`/`architecture`
excluded by construction) and short-circuits before gate resolution / the `ok:true` return:
```js
  const roleErrors = effective
    .filter(d => d.role && !roleExists(d.role))
    .map(d => `phases.${d.id}.role: "${d.role}" does not resolve to an installed agent`);
  if (roleErrors.length > 0) {
    return { ok: false, errors: roleErrors, effective: [], record, gateDecisions: [], waivers: [] };
  }
```
- The `d.role &&` guard is BINDING — `workspace`/`decisions`/`propose`/`integrate` are role-less
  (verified in `pipeline/default.yml`); probing them would call the stub on `undefined`. Only
  role-carrying descriptors are checked.
- The error string MUST contain BOTH the phase id (`d.id`) and the unresolved ref (`d.role`) — the
  negative test asserts both substrings.
- `record` here is the already-built record array (line 195) — surfacing it on the `ok:false` return
  matches the strand/graph early-returns at lines 204–211 (which also return the computed `record`).
- This follows the early-return shape used at `resolve.js:204–211` (strand) and `:209–211` (graph):
  `{ ok: false, errors, effective: [], record, gateDecisions: [], waivers: [] }`.

The predicate is injected and never called from the pure core path (only via the caller-supplied
`opts.roleExists`), so `resolvePipeline` stays I/O-free. NO signature reshuffle (trailing optional),
NO new export, NO `index.js` touch.

**Test file to extend 1 (new fixture):** `engine/test/fixtures/scenarios/S2-bad-role/manifest.yml`
```yaml
phases:
  planning:
    role: my:does-not-exist
```

**Test file to extend 2:** `engine/test/scenarios.test.js`

Add the S2-neg negative in the S2 neighbourhood (after the S2-proc positive from Slice 1). Helpers
`loadDefault()` / `loadScenarioManifest()` as in Slice 1. DC-E(a) — the negative supplies `roleExists`
as a PER-CALL inline stub (the third arg); the two existing S2 positive tests (lines 238–269) and the
S2-proc positive keep their 2-arg calls (probe defaults true — the no-op path stays exercised).

Stub form: `{ roleExists: ref => ref !== 'my:does-not-exist' }` (rejects only the bad ref; the
default `craft:<role>` refs on every other effective descriptor pass). Equivalent
`ref => ref.startsWith('craft:')` would also work — but it would reject `my:does-not-exist` for the
wrong reason and reject any legitimate external swap; the `!==` form is the minimal, intention-clear
stub. Use the `!==` form.

**Surface check (assert in this slice, no separate test):** `index.js` 7-export surface unchanged;
SC1 still byte-identical (the existing SC1 golden tests already pin `effective` ids + `record[]`; they
stay green because the default path carries no swapped role and the probe defaults true — nothing to
reject). The two existing S2 positive tests stay green (2-arg calls, default-true probe accepts
`my:domain-planner`).

### TDD steps

**RED — create the fixture, then write the S2-neg test before editing `resolve.js`:**

Create `engine/test/fixtures/scenarios/S2-bad-role/manifest.yml` (content above).

In `engine/test/scenarios.test.js` (after the S2-proc test):
```js
// ─── S2-neg: swap to a non-existent role fails closed at resolution ───────────

test('S2-neg Given phases.planning.role:my:does-not-exist and a roleExists probe that rejects it, when resolvePipeline runs, then ok:false naming the phase and the ref', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S2-bad-role');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest, { roleExists: ref => ref !== 'my:does-not-exist' });

  assert.equal(result.ok, false, 'a swap to an unresolved role must fail closed');
  assert.ok(
    result.errors.some(e => e.includes('planning') && e.includes('my:does-not-exist')),
    `errors must name the phase and the unresolved ref; got: ${JSON.stringify(result.errors)}`,
  );
});
```
Expected failure: today `resolvePipeline` is 2-arg and ignores `opts`; the bad-role manifest resolves
`ok:true` (the role string is copied but never probed), so the `ok === false` assertion fails.

Run `cd engine && node --test` → confirm S2-neg fails as above; the 2 existing S2 positive tests and
the SC1 golden tests stay green (RED is isolated to the new negative).

**GREEN — edit `engine/src/resolve.js`:**
1. Add the optional `opts` param to `resolvePipeline` and read `roleExists` with the default-true
   fallback near line 153.
2. Insert the role-existence guard after the `effective` filter (line 213), before
   `resolveGatesAndWaivers` (line 215), as shown in Context.

Run `cd engine && node --test` → S2-neg passes; full suite stays green (S2 positives, SC1, S2-proc).

**REFACTOR:** Verify the guard is a flat `.filter(...).map(...)` (no nested loop, no mutation) and
`resolvePipeline` stays within its existing size band. Confirm the `d.role &&` guard is present so
role-less phases are skipped. No further extraction warranted — the guard mirrors the existing
strand/graph early-return idiom.

### Gate

```
cd engine && node --test
```

Surface-gate spot-checks before commit:
- `grep -c "^export" engine/src/index.js` style check — the 7-export surface is unchanged
  (`resolvePipeline` is still the same export; no new export added).
- SC1 effective ids + `record[]` golden assertions still green (byte-identical default path).

### Commit

```
feat(resolve): guard swapped roles against an injected roleExists probe
```

---

## Slice 3 — S2 hardening: id-unchanged + full CORE_MARKERS survival (ADR-038)

### Context

**Shape:** TDD / slice-implementer. This is the ADR-038 deliverable — it converts the two-marker
spot-check into a full-core regression guard and pins id-unchanged. It is NOT a pass over
incidentally-already-green code: the new assertions are not asserted anywhere today.

**File to edit:** `engine/test/scenarios.test.js` — the TWO existing S2 tests. Identify them by
title (line numbers have drifted: Slices 1–2 inserted S2-proc + S2-neg in the same neighbourhood):
- **Test 1 (resolution):** `'S2 Given phases.planning.role:my:domain-planner, when resolvePipeline runs, then Resolution shows swapped role'` (originally lines 238–250).
- **Test 2 (contract):** `'S2 Given phases.planning.role swapped, when assembleContract runs on planning descriptor, then U core and producer bundle still inject'` (originally lines 252–269).
No engine src change. No fixture change: `engine/test/fixtures/scenarios/S2/manifest.yml`
(`planning.role: my:domain-planner`) stays as-is.

**Test 1 (resolution test, lines 238–250)** — currently asserts only the swapped role. ADD an
id-unchanged pin:
```js
  assert.equal(planning.id, 'planning', 'the swap changes role, never id');
```
Keep the existing `planning.role === 'my:domain-planner'` assertion.

**Test 2 (contract test, lines 252–269)** — currently asserts ONLY two markers
(`'Never commit on a red gate'`, `'Decision-candidates'`). Harden it to assert the FULL `CORE_MARKERS`
set + the producer-bundle marker, reusing the `CORE_MARKERS`/`hasCI` SHAPE from
`contract-equivalence.test.js:34–49` (do NOT re-list markers ad hoc).

**BINDING construction detail — assemble against the REAL `contracts/` bundles, not the shared
module-level `FRAGMENTS`:** the module-level `FRAGMENTS` const (lines 40–52) is built from the
FIXTURE bundle dir `engine/test/fixtures/contracts/`, whose `core.md` OMITS the "No swallowed errors"
line. Asserting the full 8-marker `CORE_MARKERS` (which includes `'swallowed'`) against that fixture
bundle would FAIL on `'swallowed'` — and the fixture must NOT be edited (it would break the S9 tests
at lines 465/482/489 that share `FRAGMENTS`, and the byte-identical fixture surface). Therefore:
build a SEPARATE local fragments map in Test 2 sourced from the REAL `contracts/` dir (the same source
`contract-equivalence.test.js` uses), and assemble the hardened assertion against THAT map. The
imports needed are already present (`readFileSync`, `join`, `__dir`). The real contracts dir is
`join(__dir, '..', '..', 'contracts')` (sibling of `pipeline/`; `__dir` is `engine/test`).

Reproduce the `CORE_MARKERS`/`hasCI` shape near the top of the file (after the existing `FRAGMENTS`
block, ~line 52) — copy the const + helper verbatim from `contract-equivalence.test.js:34–49` so they
are not re-listed inline per-test:
```js
// Markers that must appear in every assembled block (from the core fragment).
// Matched case-insensitively — the assertion proves invariant PRESENCE, never casing.
const CORE_MARKERS = [
  'never commit on a red gate',
  'Blocker protocol',
  'provenance',
  'suppression',
  'swallowed',
  'Bounded scope',
  'the agent commit is the handoff',   // expanded carve-out in agent mode
  'the role model resolved',
];

function hasCI(haystack, marker) {
  return haystack.toLowerCase().includes(marker.toLowerCase());
}

// Real (shipping) contract bundles — the source contract-equivalence.test.js assembles
// against; carries the full core (incl. the swallowed-errors line the minimal fixture omits).
const REAL_FRAGMENTS = {
  core:           readFileSync(join(__dir, '..', '..', 'contracts', 'core.md'), 'utf8'),
  producer:       readFileSync(join(__dir, '..', '..', 'contracts', 'producer.md'), 'utf8'),
  construction:   readFileSync(join(__dir, '..', '..', 'contracts', 'construction.md'), 'utf8'),
  'harness-read': readFileSync(join(__dir, '..', '..', 'contracts', 'harness-read.md'), 'utf8'),
  'harness-exec': readFileSync(join(__dir, '..', '..', 'contracts', 'harness-exec.md'), 'utf8'),
  delivery:       readFileSync(join(__dir, '..', '..', 'contracts', 'delivery.md'), 'utf8'),
  refinement:     readFileSync(join(__dir, '..', '..', 'contracts', 'refinement.md'), 'utf8'),
};
```
Assembling with `opts={}` (no `execution`) selects AGENT carve-outs, so the two expanded markers
(`'the agent commit is the handoff'`, `'the role model resolved'`) are present after substitution —
matching the agent-mode `CORE_MARKERS` set. The producer-bundle marker is `'Decision-candidates'`
(real `producer.md` contains it — verified).

### TDD steps

**RED — harden the two existing S2 tests; add the `CORE_MARKERS`/`hasCI`/`REAL_FRAGMENTS` consts:**

Add the consts shown in Context after the existing `FRAGMENTS` block (~line 52).

Test 1 (resolution) — append to the existing test body:
```js
  assert.equal(planning.id, 'planning', 'the swap changes role, never id');
```

Test 2 (contract) — replace the two-marker spot-check with the full-set assertion, assembling
against `REAL_FRAGMENTS`:
```js
test('S2 Given phases.planning.role swapped, when assembleContract runs on planning descriptor, then EVERY core marker and the producer bundle survive', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S2');
  const resolveResult = resolvePipeline(defaults, manifest);
  assert.equal(resolveResult.ok, true);

  const planningDescriptor = resolveResult.effective.find(d => d.id === 'planning');
  assert.ok(planningDescriptor, 'planning must be in effective pipeline');
  const sut = assembleContract;

  const result = sut(planningDescriptor, manifest, REAL_FRAGMENTS, {});

  for (const marker of CORE_MARKERS) {
    assert.ok(hasCI(result, marker), `swap dropped core marker: "${marker}"`);
  }
  assert.ok(result.includes('Decision-candidates'), 'producer bundle must survive the swap');
});
```
This REPLACES the old two-marker contract test wholesale (the old title is the locator named in
Context; the new test above is its replacement — do NOT add a third test). The id-unchanged pin
(Test 1) is likewise an addition to the existing resolution test, not a new test.

**RED-with-teeth (the structural-hardening signal).** The engine already keys the contract on `id`,
so the full-marker assertion is green-by-construction against the right bundle — a structural
hardening per ADR-038. To PROVE the assertion has teeth before landing (and that `REAL_FRAGMENTS` is
load-bearing, not decorative): temporarily point the new Test 2 at the module-level fixture
`FRAGMENTS` instead of `REAL_FRAGMENTS` and run `cd engine && node --test` → the `'swallowed'` marker
assertion FAILS (the fixture `core.md` omits that line). That failing run is the RED signal: it
demonstrates the full-marker set genuinely exercises the contract. Then switch Test 2 back to
`REAL_FRAGMENTS` for GREEN. The temporary fixture-source swap is a scratch probe — it MUST NOT be
committed (the committed Test 2 assembles against `REAL_FRAGMENTS`; `git status` for this slice shows
only `engine/test/scenarios.test.js`, and the fixture `core.md` is untouched).

**GREEN:** with Test 2 assembling against `REAL_FRAGMENTS` and Test 1 carrying the id-unchanged pin,
run `cd engine && node --test` → both hardened S2 tests pass; the S9 tests (sharing the untouched
module-level `FRAGMENTS`) and all else stay green.

**REFACTOR:** Confirm `CORE_MARKERS`/`hasCI` are declared once at file scope (not per-test);
confirm the fixture `core.md` and the module-level `FRAGMENTS` are UNCHANGED; confirm no marker is
re-listed inline. Confirm Test 2's title reflects the full-core assertion.

### Gate

```
cd engine && node --test
```

Spot-check: `engine/test/fixtures/scenarios/S2/manifest.yml` and
`engine/test/fixtures/contracts/core.md` are unchanged (`git status` shows only
`engine/test/scenarios.test.js` modified for this slice).

### Commit

```
test(scenarios): harden S2 to id-unchanged + full core-marker survival
```

---

## Slice 4 — Walk/UX prose: named swap-fidelity (G5) + procedure axis + engine-loud role-not-found (no engine touch)

### Context

**Shape:** session-direct prose edit (no RED/GREEN TDD cycle). No `node --test` gate — the slice
gate is `bash scripts/ci.sh` (the file is shell/skill, covered by bats + shellcheck adjacency, and
the prose must not break pipeline-lint/resolve). Gets a focused consistency review, not 4-dimension
code review.

**File to edit:** `skills/run/SKILL.md` only. NO engine touch. NO new error-paths row.

**Current state (verified line anchors):**
- Lines 89–92: existing G5 prose for a role-swapped craft-native phase — "the injected contract
  (step 3) is assembled from that descriptor regardless of who supplies the procedure, so a
  role-swapped procedure can never drop it (G5)." TIGHTEN and NAME this; extend it to cover the
  `procedure:` axis too.
- Line 117: agent-mode dispatch — "spawn `craft:<role>` (or the manifest-swapped role)".
- Lines 122–133: inline-mode local/non-local role branch (ADR-020) — "A role that resolves to no
  local def (e.g. `acme:planner`) runs on the block alone."
- Lines 78–96: step 1 procedure verbatim-dispatch (ADR-025). The default-phase `procedure:`
  override rides this — a swapped default-phase procedure is dispatched the same verbatim way.
- Walk error-paths table, lines 173–184:
  - Role-not-found routes through the EXISTING `ok: false from pipeline-resolve` row (line 177) —
    ADR-037 made it an engine return. NAME the role case as one cause; do NOT add a new row.
  - Procedure-not-installed routes through the EXISTING "procedure resolves to no installed skill"
    row (line 180) — ADR-040 reuses it for default-phase procedure overrides. Do NOT add a new row.

**Three prose edits (content fixed by the design §"swap-fidelity note"; final wording is this slice's
craft):**

1. **Named swap-fidelity guarantee (G5)** — near the step-4 agent/inline branches (or tightening the
   existing 89–92 prose). State: the injected block (step 3) is assembled from the descriptor `id`,
   which neither a `role:` nor a `procedure:` override ever changes — so the swapped worker, agent or
   inline, always runs inside the same engine-owned contract. The swap changes *who* runs the phase
   (`role:`) or *which skill* orchestrates it (`procedure:`), never *what invariants bind it*.

2. **Role-not-found is engine-loud** — a swap to a role the resolver's `roleExists` probe rejects
   makes `pipeline-resolve` return `ok: false`, caught at §0 before the walk starts, surfaced via the
   existing "`ok: false` from `pipeline-resolve`" row (line 177). Name the role case as one cause of
   that row. NO new walk row (symmetric with how a stranded consumer is "`ok: false` already, covered
   by the stop-on-error path" at line 183).

3. **Default-phase `procedure:` override** — document that `phases.<id>.procedure` on a default phase
   redirects that phase's orchestration; the walk dispatches the string verbatim (step 1, ADR-025,
   unchanged) and a procedure resolving to no installed skill STOPs via the EXISTING "procedure
   resolves to no installed skill" row (line 180). The negative path is the shipped idiom, not new
   machinery.

**Consistency constraints (binding):** match the existing "resolves to no installed skill" idiom
verbatim; do NOT invent an inline "ask"; do NOT add an error-paths row for either negative; preserve
the existing inline-mode local/non-local role branch wording (ADR-020) and the "spawn `craft:<role>`
(or the manifest-swapped role)" line.

**Scope honesty (binding) — do NOT overclaim the bin wiring.** P9 ships the ENGINE seam (the
`roleExists` guard, Slice 2) + its test coverage. The shipped `engine/bin/pipeline-resolve.js` still
calls `resolvePipeline(defaults, manifest)` 2-arg (verified at `pipeline-resolve.js:81`), so the
probe defaults to true and the bin does NOT itself reject a bad role in P9 — wiring the walk's real
probe into the bin is a later phase (design §"the roleExists seam": "the `pipeline-resolve` bin until
the walk wires the probe keep working, the guard no-ops to present"). The prose therefore describes
the engine-loud guarantee at the SPEC level — when the walk's resolver consults `roleExists`, a bad
role is `ok: false` at §0, surfaced via the existing row — WITHOUT asserting the current bin already
passes a real probe. Frame it as the guard's mechanism + the existing `ok: false` row, not as a
shipped bin behaviour change.

### TDD steps

**No RED/GREEN cycle (prose).** Read the current `skills/run/SKILL.md` state at the anchors above,
apply the three targeted diff-minded edits, then verify consistency.

REFACTOR (consistency check):
- The G5 prose now names BOTH axes (`role:` and `procedure:`) and states the id-keyed invariant
  explicitly.
- No new row was added to the Walk error-paths table (lines 173–184 still 8 rows); the role case is
  named as a cause of the existing `ok: false` row.
- The "procedure resolves to no installed skill" idiom is matched verbatim where the default-phase
  procedure override's negative is documented.
- No inline "ask" was introduced; the ADR-020 local/non-local inline-role branch wording survives.

### Gate

```
bash scripts/ci.sh
```

Must stay green (node tests + bats + shellcheck + pipeline-lint + pipeline-resolve + contracts-lint).
The prose edit touches no shell/manifest behaviour — CI confirms no collateral breakage.

### Commit

```
docs(run): name swap-fidelity G5, document procedure axis and engine-loud role-not-found
```

---

## Slice 5 — Example + README: `examples/role-swap/workflow.md` (ADR-039) + README row

### Context

**Shape:** session-direct prose/example (no RED/GREEN TDD cycle). Slice gate `bash scripts/ci.sh`.
Focused consistency review. NO engine touch. No automated test asserts example content (consistent
with `lean-profile`).

**File to create:** `examples/role-swap/workflow.md` — a SINGLE file mirroring
`examples/lean-profile/workflow.md` EXACTLY in structure (verified: `examples/lean-profile/` contains
ONLY `workflow.md`):
- a YAML frontmatter manifest block (`---` … `---`) with a leading comment naming the injection point;
- a prose body with `#`/`##` headings;
- the closing line: `> In your real repo this file lives at the project root as \`.claude/workflow.md\`.`

**Swap subject (SETTLED by ADR-039):** `implementation.role: acme:tdd-specialist` — the highest-stakes
swap (the code producer) to an EXTERNAL agent the local repo does not define. Frontmatter manifest:
```yaml
---
# Injection point #10 (PRD §7): phases.<id>.role — swap WHICH agent runs a phase.
# The engine injects the P5 contract around your agent (G5) — your worker can't drop it.
# acme:tdd-specialist is EXTERNAL: it presumes the acme plugin is installed (the engine's
# roleExists guard fails closed otherwise) and, under inline execution, runs on the contract
# block alone (ADR-020 — the repo can't read an external agent's body).
phases:
  implementation:
    role: acme:tdd-specialist
---
```

**Prose body MUST LEAD with the external / contract-only-inline + fail-closed story** (ADR-039's
deliberate choice — demonstrate the strongest claim: a swap can't drop the contract even when the
worker is external):
- `role:` points a phase at YOUR agent instead of the craft default; here the HIGHEST-stakes phase
  (the code producer) goes to an external `acme:tdd-specialist`.
- Contract-survives-swap (G5) even for an external worker — the engine assembles and injects the
  invariant contract around it; a swap changes *who* writes the code, never the guarantees binding it.
- Agent mode prepends the contract to the spawn; inline mode runs on the contract block alone for an
  external role (ADR-020 — the repo can't read an external agent's body — flag this so a reader does
  NOT mistake the contract-only inline path for a defect).
- `acme:tdd-specialist` is valid ONLY when that plugin is installed — a typo / uninstalled ref fails
  CLOSED at resolution (`roleExists` guard, ADR-037), `ok: false` before the walk starts.
- Close with the `.claude/workflow.md` real-repo line.

Mirror lean-profile's optional "Per-invocation" section style only if it adds value; the binding
requirement is the single-file structure + the lead narrative above. Do NOT invent a `--role` CLI
flag (out of scope — `examples/lean-profile` uses `--profile` because that flag SHIPPED; no `--role`
flag exists, so omit any per-invocation flag block or state plainly the swap is manifest-only today).

**File to edit:** `examples/README.md` — add ONE row + ONE bullet, following the existing patterns:
- The bulleted "## Examples" list (the `karpathy-as-context` / `everything-claude-toolkit` /
  `lean-profile` entries) — add a `role-swap/` bullet describing the external implementation-agent
  swap, labelled *All-current* (resolution + the `roleExists` guard + the walk all ship in P9).
- Keep the prose LEADING with the external / contract-only-inline + fail-closed framing so the README
  entry matches the example's mental model.
- Do NOT alter the top three-column "Collection kind" table (that table is about external collection
  kinds, not per-example rows); the per-example surface is the "## Examples" bullet list.

### TDD steps

**No RED/GREEN cycle (prose/example).** Create `examples/role-swap/workflow.md` per the structure and
lead-narrative above; add the README bullet. Then verify consistency.

REFACTOR (consistency check):
- `examples/role-swap/` contains EXACTLY one file (`workflow.md`) — mirrors `lean-profile/`.
- The frontmatter manifest is lint-clean: `implementation.role: acme:tdd-specialist` is a string —
  `validateManifest` accepts it (the Slice-1/prior `role` shape-check passes a string).
- The prose LEADS with external/contract-only-inline (ADR-020) + fail-closed (ADR-037), not the
  gentle local-swap path.
- The closing `.claude/workflow.md` line is present and matches lean-profile's wording.
- The README bullet is labelled *All-current* and does not invent a `--role` flag.

### Gate

```
bash scripts/ci.sh
```

Must stay green. Although no test references the example, `pipeline-lint`/`pipeline-resolve` run in CI
against `pipeline/default.yml` (unaffected); the example's frontmatter is implicitly lint-clean by the
string-shape rule. CI confirms no collateral breakage.

### Commit

```
docs(examples): add role-swap example and README entry
```

---

## Surface-gate checklist

The following must hold at every commit in this phase:

| Surface | Must stay |
|---|---|
| `engine/src/index.js` 7-export surface | unchanged (parsePipeline, validatePipeline, ALIAS_MAP, resolveAlias, resolvePipeline, assembleContract, normalizeFindings, validateManifest) |
| `resolvePipeline` exported call shape | unchanged for existing callers — `roleExists` added as an OPTIONAL trailing `opts` param (defaults to "role resolves"), mirroring `validateManifest`'s `fileExists`; pure core stays I/O-free |
| `resolvePipeline` return shape | `{ ok, errors, effective, record, gateDecisions, waivers }` unchanged |
| `pipeline/default.yml` (13 descriptors, default role/procedure values, enabled/disabled state) | unchanged |
| `graph.js` `validatePipeline(descriptors)` | unchanged |
| `contract.js` `assembleContract` | unchanged |
| `engine/bin/contract-assemble.js` | unchanged |
| `engine/test/fixtures/contracts/*` and the module-level `FRAGMENTS` in scenarios.test.js | unchanged (Slice 3 uses a separate REAL_FRAGMENTS map; the shared FRAGMENTS and S9 tests are untouched) |
| `engine/test/fixtures/scenarios/S2/manifest.yml` | unchanged (Slice 3 asserts, never edits the fixture) |
| SC1 run-record byte-identical | unchanged (no-manifest resolution carries no swapped role/procedure → `roleExists` never consulted, no override copied) |
| `engine/src` delta | MINIMUM: (i) `procedure` in `PHASE_FIELDS` + a shape-check branch (`manifest.js`) and in `ALLOWED_PHASE_OVERRIDE_FIELDS` (`edits.js`); (ii) the `roleExists` guard + optional `opts` (`resolve.js`) — nothing else |
| `procedure` / `roleExists` | internal — no new export from `index.js`; `roleExists` is a guard inside `resolvePipeline`, not an exported function |
| CI (`scripts/ci.sh`) | green at every commit; full scenario suite + 42 bats |
