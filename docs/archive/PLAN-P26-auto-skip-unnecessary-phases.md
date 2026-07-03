# Plan — Auto-skip phases craft evaluates as unnecessary

> Source: design doc `docs/DESIGN-P26-auto-skip-unnecessary-phases.md` · ADRs `143, 144, 145, 146, 147`
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
- A part that would be a pure test pass over already-landed code merges into its neighbour.

### Frozen invariants (every commit honours them)

- **Public surface — `computeAutoSkipEligibility` / `FLOOR_PHASES` stay INTERNAL.** They are
  consumed only by `resolve.js`, exactly like `strand.js`'s `checkStrandedConsumers` (verified:
  `checkStrandedConsumers` is NOT exported from `engine/src/index.js`). No part adds them to the
  7+1 engine barrel (`engine/src/index.js`). The eligibility surfaces to the orchestrator via the
  additive `Resolution.effective[].autoSkipEligible` field — never via a direct barrel/bin call.
  No new port, no engine bin change (design D1, R8). The pipeline-resolve bin
  (`engine/bin/pipeline-resolve.js` → `engine/src/pipeline-resolve-main.js`) serializes the whole
  Resolution, so the additive field surfaces automatically with zero bin edit.
- **Additive only — back-compat.** `effective[].autoSkipEligible` defaults `false`; `record[]`,
  `gateDecisions[]`, `waivers[]` stay byte-for-byte unchanged for any auto-skip-free manifest
  (mirrors ADR-125's additive `Resolution.policy`). No part changes which phases are `enabled`.
- **No provenance leakage (R9).** No `P26`/ADR/backlog ids in any emitted token, source, or test.
  Provenance lives in the design doc, the ADRs, and the PR body only.
- **CI = `bash scripts/ci.sh`** from the worktree root; never `--no-verify`; never commit on a red
  gate.
- **Count-assert maintenance (CRITICAL).** `scripts/ci.sh:10` holds `EXPECTED_TESTS=1027` and the
  engine `node --test` step asserts the runner's `# tests <N>` line equals it (drift → red, even
  when every test passes). Every part that adds engine `node --test` cases **bumps `EXPECTED_TESTS`
  by exactly the number it adds, IN THE SAME COMMIT**. The exact-count instruction per part: after
  writing the tests, run `cd engine && node --test 'test/**/*.test.js'` and read the `# tests` line;
  set `EXPECTED_TESTS` to that number. `scripts/ci.sh` also asserts `EXPECTED_PI_TESTS=202` (pi
  adapter, untouched by this change — no pi edits in any part). bats tests do NOT count toward
  `EXPECTED_TESTS` (separate runner). Running tally below is the **expected** count assuming the
  test lists are implemented verbatim; the implementer pins the real number from the runner.

### Dependency order (honoured by the part numbering)

1. **Part 1 (autoskip.js)** lands the pure helper + `FLOOR_PHASES`. Nothing references it yet, so it
   is self-contained and green on its own.
2. **Part 2 (required knob)** lands the `required` schema field + the `skip`+`required` collision
   lint in `manifest.js`. Independent of Part 1 (pure validation), but ordered second because Part 3
   reads `required` off the resolved phase block — the knob must be lint-accepted before Part 3's
   fixtures use it.
3. **Part 3 (resolve wiring)** imports `computeAutoSkipEligibility` from Part 1 and maps it onto
   `effective[]`, reading `required` (Part 2) off the phase-override block. Must land after 1 and 2
   so it never references a not-yet-built symbol.
4. **Part 4 (walk prose)** documents the dynamic necessity probe, the `auto-skip:` token, and the
   propose-gate release. Pure prose; lands last; references the `autoSkipEligible` field Part 3
   surfaces.

### Running EXPECTED_TESTS tally (baseline 1027)

Part 1 +N1 → Part 2 +N2 → Part 3 +N3 → Part 4 +0. Each code part pins N from the runner and bumps
in the same commit. Expected N1≈9, N2≈4, N3≈3 (≈1043 at the end) — the implementer pins exact.

---

## Part 1 — autoskip: pure eligibility helper + FLOOR_PHASES

### Context

**Shape:** TDD / part-implementer. New pure module + a new dedicated test file. Self-contained:
nothing imports it yet (Part 3 wires it), so it lands green standalone.

**ADR anchors:** ADR-143 (resolver owns static eligibility), ADR-144 (eligibility = non-floor ∧
strand-clean ∧ ¬required; no code-producing rule, no archetype allowlist).

**NEW file — `engine/src/autoskip.js`** (create). Single-purpose pure module, mirroring the shape of
`engine/src/strand.js` (no I/O, no throw, frozen vocab beside the logic). It exports two symbols and
imports `checkStrandedConsumers` from `./strand.js`:

```js
import { checkStrandedConsumers } from './strand.js';

/** The four floor phases — categorically never auto-skippable (in code, never config). */
export const FLOOR_PHASES = Object.freeze(new Set([
  'workspace', 'implementation', 'propose', 'integrate',
]));

/**
 * Pure static eligibility: may this effective descriptor be auto-skipped?
 * eligible ⇔ NOT a floor phase ∧ NOT required:true ∧ checkStrandedConsumers(...{id}...) === [].
 * No code-producing rule, no archetype allowlist (ADR-144). Never throws, never mutates.
 *
 * @param {object} descriptor          one effective descriptor (carries .id)
 * @param {object|null|undefined} manifest   the (alias-resolved) manifest, for required: lookup
 * @param {readonly object[]} effective the full effective descriptor list
 * @param {readonly object[]} defaults   original defaults BEFORE edits (strand's first arg)
 * @returns {boolean}
 */
export function computeAutoSkipEligibility(descriptor, manifest, effective, defaults) {
  if (FLOOR_PHASES.has(descriptor.id)) return false;
  if (isRequired(descriptor.id, manifest)) return false;
  return checkStrandedConsumers(defaults, new Set([descriptor.id]), effective).length === 0;
}
```

**`required` lookup (decide its source in this part).** The resolved `required` flag rides the
`phases.<id>` override block (ADR-145; same channel as `enabled`/`harness`/`role`). The helper reads
it from `manifest.phases[id].required === true`. Pre-chew the exact shape: in `resolve.js` the
manifest passed downstream is **alias-resolved** (`aliasResolve` at `resolve.js:21-39` rewrites
`manifest.phases` keys through `resolveAlias`), so by the time Part 3 calls the helper the canonical
id is the key. Implement a small private `isRequired(id, manifest)` that guards
`manifest?.phases?.[id]?.required === true` (strict `=== true`, so absent / non-boolean ⇒ not
required — type-soundness is the lint's job in Part 2, not the helper's). Keep it a one-line early
return, no nesting.

**Why pass `defaults` AND `effective`:** `checkStrandedConsumers(defaults, skipSet, effective)`
(`strand.js:26`) looks up the skipped phase's `produces` in `defaults` (`strand.js:31`) and checks
consumers/alternatives within `effective` (`strand.js:35-45`). `hasAlternative` already excludes the
candidate id itself (`strand.js:42` `d.id === skippedId`), so the **full `effective` list is passed
unchanged** — no "effective-without-id" pre-filter (design D2). Same call shape as `resolve.js:286`.

**Empirical eligibility truth-table over the default pipeline** (verified against
`pipeline/default.yml` + the strand matrix in the design):

| Phase | enabled in default? | autoSkipEligible | Why |
|---|---|---|---|
| `workspace` | yes | `false` | floor |
| `implementation` | yes | `false` | floor (also strands every `change` consumer) |
| `propose` | yes | `false` | floor |
| `integrate` | yes | `false` | floor |
| `design` | yes | `false` | strand — `documentation`/`planning` consume `design`, no alt producer |
| `decisions` | yes | `true` | strand-clean — `planning` is the only `decisions` consumer and self-supplies it (`self_supply:[design,decisions]`), so `strand.js` skips it; corrected from original design truth table (impl finding) |
| `planning` | yes | `false` | strand — `implementation` consumes `plan`, no alt producer |
| `review` | yes | `true` | non-floor, strand-clean (nothing consumes `review-report`) |
| `refactoring` | yes | `true` | non-floor, strand-clean (`implementation` is an earlier alt `change` producer — `strand.js:41-44`) |
| `validation` | yes | `true` | non-floor, strand-clean (nothing consumes `validation-report`) |
| `documentation` | yes | `true` | non-floor, strand-clean (nothing consumes `docs`) |
| `architecture` | **default-off** | n/a in default `effective[]` | when enabled: `true` (non-floor, nothing consumes `architecture-report`) |
| `requirements` | **default-off** | n/a in default `effective[]` | when enabled: `false` (strand — `design` consumes `requirements`… but see note) |

Note: `requirements`/`architecture` are absent from the default `effective[]` (filtered out by
`enabled`), so the helper is never called for them in the default pipeline — eligibility is computed
**only over `effective[]`** (design D1). The truth-table rows for them are reachable only via a
fixture that enables them; cover `architecture: true when enabled` (it is in the ratified eligible
set) with an `effective`-style fixture (see TDD steps).

**Test harness — NEW file `engine/test/autoskip.test.js`** (model on `engine/test/resolve.test.js`
head: `import { test } from 'node:test'; import assert from 'node:assert/strict';` plus the
`loadDefault()` pattern — `parsePipeline(readFileSync(defaultYml,'utf8'))` to get descriptors). For
the eligibility helper you need an `effective`-shaped list: derive it as
`loadDefault().filter(d => d.enabled !== false)` for the default-enabled set, or hand-build minimal
descriptor objects (each needs at least `{ id, enabled, consumes, produces, self_supply }` — the
fields `checkStrandedConsumers` touches). `defaults` = `loadDefault()` (the pre-edit list). Import:
`import { computeAutoSkipEligibility, FLOOR_PHASES } from '../src/autoskip.js';`.

`parsePipeline` and the default-yml path helpers are already used verbatim in `resolve.test.js:6-15`
— copy that header (`__dir`, `defaultYml = join(__dir,'..','..','pipeline','default.yml')`,
`loadDefault()`). For the `required:` and enable-architecture fixtures, build the manifest object
inline (`{ phases: { review: { required: true } } }`) — no fixture file needed; the helper takes the
manifest object directly.

### TDD steps

**RED** (write `engine/test/autoskip.test.js` first; the module does not exist → all fail to import):

1. `Given every floor phase, when computeAutoSkipEligibility runs, then each is false` — assert
   `false` for `workspace`, `implementation`, `propose`, `integrate` (drive from `FLOOR_PHASES` or
   four explicit descriptors). Also assert `FLOOR_PHASES` contains exactly those four ids and is
   frozen (`Object.isFrozen`). *(Kills a mutant that drops the floor check or widens the set.)*
2. `Given the producer/spec phase design, when it runs, then false via strand` — `design`
   descriptor against the default-enabled `effective`+`defaults` → `false`.
3. `Given the strand-clean producer phase decisions, when it runs, then true` → `true` (corrected from original truth table: `planning` is the only `decisions` consumer and self-supplies it, so no strand; assert within the eligible-set group).
4. `Given the producer/spec phase planning, when it runs, then false via strand` → `false`.
5. `Given refactoring (strand-clean re-producer), when it runs, then true` → `true` (this is the
   ADR-144 widening — `refactoring` is NOT excluded by any code-producing rule; `implementation` is
   the earlier alt `change` producer).
6. `Given the strand-clean eligible set review/documentation/validation, when each runs over the
   default effective, then true` → assert `true` for `review`, `documentation`, `validation`.
7. `Given architecture enabled in the effective list, when it runs, then true` — build an
   `effective` list that includes an enabled `architecture` descriptor (toggle the default-off
   descriptor's `enabled` to `true` in the derived list) → `true`. Pins the ratified eligible set
   includes `architecture` when enabled.
8. `Given an otherwise-eligible phase pinned required:true, when it runs, then false` — pass
   `manifest = { phases: { review: { required: true } } }` for the `review` descriptor → `false`.
   *(Kills a mutant that drops the required check.)*
9. `Given a phase whose auto-skip would strand a consumer, when it runs, then false` — construct a
   minimal fixture where the candidate is the ONLY producer of an artifact a later enabled phase
   consumes without `self_supply` (e.g. two hand-built descriptors: producer `{id:'p', produces:['x']}`
   and consumer `{id:'c', consumes:['x'], self_supply:[]}` enabled, no alternative) → `false`.
   *(Pins R4 — the strand backstop; kills a mutant that drops the strand composition.)* Strengthen
   with the **strand-reuse property**: for every phase the helper marks eligible over the default
   `effective`, assert `checkStrandedConsumers(defaults, new Set([id]), effective).length === 0`
   (same call shape as `resolve.js:286`) — proving the helper composes the guard, not reimplements
   it (design Test strategy §2).

**GREEN:** create `engine/src/autoskip.js` exactly as pre-chewed above. All nine pass.

**REFACTOR:** confirm the helper is three early-return lines (floor → required → strand), no nesting
> 2, no magic strings beyond `FLOOR_PHASES` and the frozen set; `isRequired` is a single guarded
expression. Confirm no `js-yaml`/I/O import crept in. Bump `EXPECTED_TESTS` to the runner's reported
`# tests` (expected 1027 + 9 = 1036; pin the real number).

### Gate

```
cd engine && node --test 'test/autoskip.test.js'
```

then the full phase-aware gate to pin the count:

```
bash scripts/ci.sh
```

Confirms: the new file's tests pass; `# tests` matches the bumped `EXPECTED_TESTS`; every existing
engine/pi/bats/shellcheck/lint step stays green (the new module is imported by nothing yet, so it
cannot regress any existing test). `engine/src/index.js` barrel is untouched (helper stays internal).

### Commit

```
feat(autoskip): pure auto-skip eligibility helper and FLOOR_PHASES
```

---

## Part 2 — required knob: schema field + skip-collision lint

### Context

**Shape:** TDD / part-implementer. Pure `manifest.js` validation change + manifest tests. No engine
data/resolution change (the resolver already passes unknown phase fields through untouched — see the
note below); this part only makes lint **accept** `required` and **reject** the `skip`+`required`
collision.

**ADR anchors:** ADR-145 (`required` boolean field, opt-out default, narrow precedence, hard lint
error on same-phase `skip`+`required`).

**File — `engine/src/manifest.js`. Three edits:**

1. **`PHASE_FIELDS` (`manifest.js:31-34`)** — the frozen whitelist of accepted `phases.<id>` keys.
   Add `'required'`:
   ```js
   const PHASE_FIELDS = Object.freeze(new Set([
     'context', 'override', 'strategy', 'merge-flags', 'non-blocking-jobs',
     'harness', 'execution', 'enabled', 'role', 'model', 'procedure', 'required',
   ]));
   ```
   (Empirically pinned: today `phases.review.required: true` is rejected with
   `unknown field on phase review: required` — `validatePhaseBlock:432`. Adding it to the set lets
   the field reach the type arm below.)

2. **Boolean-type arm in `validatePhaseBlock` (`manifest.js:421-452`)** — the arm ladder at
   `:436-450` has the `enabled` twin at `:446-447`:
   ```js
   } else if (field === 'enabled' && typeof value !== 'boolean') {
     errors.push(`phases.${phaseName}.enabled must be a boolean`);
   }
   ```
   Add a `required` twin **mirroring it verbatim** (place it adjacent to the `enabled` arm; keep the
   ladder's mutual exclusivity — `required` gets only the boolean-shape guard, nothing else):
   ```js
   } else if (field === 'required' && typeof value !== 'boolean') {
     errors.push(`phases.${phaseName}.required must be a boolean`);
   }
   ```

3. **`skip`+`required` collision cross-check.** `pipeline.skip` is a top-level array
   (`manifest.pipeline.skip`, validated for key-shape by `validatePipelineKeys:402-412`), while
   `required` is per-phase (`manifest.phases.<id>.required`). They are validated independently today,
   so the collision needs a NEW cross-check in `validateManifest` (`:695-750`). Add a small private
   helper and call it from the top-level loop / after it. Pre-chewed shape (place the helper near
   `validatePhases`, and invoke it once with the whole manifest so it sees both `pipeline.skip` and
   `phases`):
   ```js
   /**
    * Cross-check: a phase cannot be both pipeline.skip'd and phases.<id>.required (ADR-145).
    * Compares canonical ids — pipeline.skip entries and phases keys both resolve via resolveAlias.
    * @param {Record<string, unknown>} manifest
    * @param {string[]} errors
    */
   function validateSkipRequiredCollision(manifest, errors) {
     const skip = manifest?.pipeline?.skip;
     const phases = manifest?.phases;
     if (!Array.isArray(skip) || !phases || typeof phases !== 'object' || Array.isArray(phases)) return;
     const skipSet = new Set(skip.filter(s => typeof s === 'string').map(resolveAlias));
     for (const [name, block] of Object.entries(phases)) {
       if (block && typeof block === 'object' && block.required === true && skipSet.has(resolveAlias(name))) {
         errors.push(
           `phases.${name}.required: true conflicts with pipeline.skip: [${name}] — a phase cannot be both skipped and required`,
         );
       }
     }
   }
   ```
   Invoke it from `validateManifest` AFTER the top-level `for…switch` loop (so both `pipeline` and
   `phases` have been seen), e.g. just before `return { ok: errors.length === 0, errors };` at `:749`:
   ```js
   validateSkipRequiredCollision(manifest, errors);
   ```
   `resolveAlias` is already imported (`manifest.js:8`). The collision is `ok: false`; the bin
   (`manifest-lint`) returns exit 2 for any `ok:false` (existing behaviour — confirmed by the
   surrounding lint test conventions), so the design's "exit 2" claim holds with no bin change.

**Why no resolver change here:** the `required` flag rides the existing `phases.<id>` →
`phaseOverrides` Map (`resolve.js:250`) untouched. The resolver ignores fields it does not read
today; Part 3 is what reads `required` (via the Part 1 helper's `isRequired`). This part is
validation-surface only.

**Tests — extend `engine/test/manifest.test.js`** (`import { validateManifest } from '../src/manifest.js'`
at `:8`; `const ALWAYS_EXISTS = () => true` at `:10`; every test is `const sut = validateManifest;`
then `sut(obj, { fileExists: ALWAYS_EXISTS })`). Model the new cases on the `enabled` cases at
`:854-863` (positive ok:true) and `:912-922` (non-boolean → ok:false naming the field + `boolean`),
and the `pipeline.skip` array case at `:73-83`. Add **four** `test()` cases (place them adjacent to
the `enabled` tests, ~`:922`):

- **T1 (positive — RED today):** `Given phases.review.required: true, when validateManifest runs,
  then ok:true` — `sut({ phases: { review: { required: true } } }, { fileExists: ALWAYS_EXISTS })`
  → `result.ok === true`. (RED: today `required` is an unknown field → `ok:false`.)
- **T2 (type guard):** `Given phases.review.required: "yes" (non-boolean), when validateManifest
  runs, then ok:false with required-type error` —
  `sut({ phases: { review: { required: 'yes' } } }, …)` → `result.ok === false` and
  `result.errors.some(e => e.includes('phases.review.required') && e.includes('boolean'))`.
- **T3 (collision — RED today):** `Given pipeline.skip:[review] and phases.review.required:true,
  when validateManifest runs, then ok:false naming the collision` —
  `sut({ pipeline: { skip: ['review'] }, phases: { review: { required: true } } }, …)` →
  `result.ok === false` and `result.errors.some(e => e.includes('review') && /skip/i.test(e) && /requir/i.test(e))`.
  (RED: today skip + required are validated independently → `ok:true`.)
- **T4 (narrow precedence — skip WITHOUT required still ok):** `Given pipeline.skip:[review] and no
  required pin, when validateManifest runs, then ok:true` —
  `sut({ pipeline: { skip: ['review'] } }, …)` → `result.ok === true` (operator skip alone is
  legitimate; the collision fires only when BOTH are present — guards against an over-broad
  cross-check that flags every skip).

**Count:** +4 node tests. Bump `EXPECTED_TESTS` by 4 (expected → 1040; pin from the runner).

### TDD steps

- **RED:** add T1–T4. Run `cd engine && node --test 'test/manifest.test.js'` → T1 FAILS (`required`
  unknown field → ok:false), T3 FAILS (no collision check → ok:true). T2 currently emits
  `unknown field on phase review: required` (not the boolean message) — it may pass the `ok:false`
  half but the message assertion keys on `phases.review.required` + `boolean`, which the unknown-field
  message lacks → FAILS until the arm lands. T4 passes already (skip-only is valid today) — kept as
  the precedence guard.
- **GREEN:** apply the three `manifest.js` edits. T1 (field accepted), T2 (boolean message), T3
  (collision error), T4 (still ok) all pass.
- **REFACTOR:** confirm the `required` arm sits beside `enabled` with identical shape; the collision
  helper is a single guarded loop (no nesting > 2), compares canonical ids via `resolveAlias`, and
  the existing `enabled`/`pipeline.skip` tests (`:854`, `:73`) stay green. Bump `EXPECTED_TESTS` to
  the runner's reported `# tests`.

### Gate

```
cd engine && node --test 'test/manifest.test.js'
```

then:

```
bash scripts/ci.sh
```

Confirms: T1–T4 green; existing manifest tests (incl. the `enabled` and `pipeline.skip` cases) green;
`# tests` matches the bumped `EXPECTED_TESTS`; manifest-lint bin + all lint steps green;
`node engine/bin/pipeline-resolve.js pipeline/default.yml` still exits 0 (default pipeline carries no
`required` pin, no collision).

### Commit

```
feat(manifest): accept phases.<id>.required and reject skip+required collision
```

---

## Part 3 — resolve: wire autoSkipEligible onto effective[]

### Context

**Shape:** TDD / part-implementer. Wires the Part 1 helper into the resolver and surfaces the
additive `effective[].autoSkipEligible` field. Reads `required` (Part 2) off the resolved phase
block. Must land AFTER Parts 1 and 2 (it imports `computeAutoSkipEligibility` and relies on
`required` being lint-legal).

**ADR anchors:** ADR-143 (additive `effective[].autoSkipEligible`, default `false`), ADR-144
(eligibility rule the helper encodes), ADR-145 (`required` flows via `phaseOverrides`/resolved
phases).

**File — `engine/src/resolve.js`. Two edits:**

1. **Import (top, with the other `./` imports `:10-17`):**
   ```js
   import { computeAutoSkipEligibility } from './autoskip.js';
   ```

2. **Map `autoSkipEligible` onto each effective descriptor.** The `effective` list is built at
   `:296-302`:
   ```js
   const effective = execResult.descriptors
     .filter(d => d.enabled)
     .map(d =>
       d.id === REVIEW_PHASE_ID && d.harness
         ? { ...d, harness: { ...d.harness, reviewPlan: deriveReviewPlan(d.harness) } }
         : d,
     );
   ```
   The helper needs the **complete** `effective` list (for the strand check) and the **defaults**
   (strand's first arg). So compute the base `effective` first (as above), then map the additive
   field over it in a SECOND pass (the helper must see the full list, so it cannot be folded into the
   first `.map`). Pre-chewed — replace the single `const effective = …` assignment with:
   ```js
   const baseEffective = execResult.descriptors
     .filter(d => d.enabled)
     .map(d =>
       d.id === REVIEW_PHASE_ID && d.harness
         ? { ...d, harness: { ...d.harness, reviewPlan: deriveReviewPlan(d.harness) } }
         : d,
     );
   const effective = baseEffective.map(d => ({
     ...d,
     autoSkipEligible: computeAutoSkipEligibility(d, resolved, baseEffective, defaults),
   }));
   ```
   - `resolved` is the alias-resolved manifest (`resolve.js:231`) — its `phases.<id>.required` is the
     `required` source the helper's `isRequired` reads (canonical keys, since `aliasResolve` rewrote
     them). Pass `resolved`, NOT the raw `manifest`.
   - `baseEffective` is passed as the strand `effective` arg so the helper sees every enabled
     descriptor (the candidate included — `checkStrandedConsumers` excludes the candidate itself via
     `hasAlternative`, `strand.js:42`).
   - `defaults` is the resolver's first param (pre-edit list) — strand's first arg, same as `:286`.
   - Immutability preserved: a fresh object per descriptor (`{ ...d, autoSkipEligible }`); inputs
     never mutated. `autoSkipEligible` is always a boolean (helper never throws), default-falsey for
     floors/strand/required.
   - The downstream consumers — `roleErrors` filter (`:304-306`), `resolveGatesAndWaivers(... effective …)`
     (`:311-317`), and the returned `effective` (`:325`) — all see the enriched list. The added field
     is additive: `gateDecisions`/`waivers` are derived from `id`/`role`/`harness`/`gate`/`contract`,
     none of which change, so they stay byte-for-byte identical (back-compat).

**Reference — how the field surfaces with no bin edit:** `engine/bin/pipeline-resolve.js` delegates to
`engine/src/pipeline-resolve-main.js` (`main`), which serializes the whole Resolution; the additive
`autoSkipEligible` rides along automatically. No bin change (Frozen invariant). Do NOT touch the bin.

**Tests — extend `engine/test/resolve.test.js`** (header `:1-21`: `loadDefault()` =
`parsePipeline(readFileSync(defaultYml,'utf8'))`; `loadManifest(name)` reads a fixture YAML;
`resolvePipeline(sut, manifest)` is the call). The SC1 golden order is at `:23-35` (the 11 enabled
phases). Add **three** `test()` cases:

- **A1 (truth table — RED today):** `Given the default pipeline, when resolvePipeline runs, then each
  effective descriptor carries the correct autoSkipEligible` —
  `const result = resolvePipeline(loadDefault(), null)` (or `{}`); `result.ok === true`; build the
  expected map and assert each `result.effective.find(d => d.id === id).autoSkipEligible` equals it:
  `{ workspace:false, design:false, decisions:true, planning:false, implementation:false,
  review:true, refactoring:true, validation:true, documentation:true, propose:false, integrate:false }`.
  **Pin `decisions:true` carefully (corrected from the original design truth table — impl finding):**
  `decisions` produces `decisions`, whose only consumer `planning` carries `decisions` in its
  `self_supply` (`pipeline/default.yml`), so `checkStrandedConsumers` skips it (`strand.js` filters
  self-supplying consumers) → `decisions` is **strand-clean → true**. It is NOT excluded; it is in the
  eligible set under the ratified `non-floor ∧ strand-clean` rule (ADR-144).
  **Pin documentation carefully:** per the design strand matrix, nothing consumes `docs`, so
  `documentation` is strand-clean → `true` (it *consumes* `design`/`change` but that is not a
  producer-strand). Assert `documentation:true`. (RED: today no descriptor
  carries the field → `undefined !== true/false`.) Assert the full set so a mutant flipping any single
  phase is caught.
- **A2 (required flips it):** `Given phases.review.required:true, when resolvePipeline runs, then
  review.autoSkipEligible is false` — pass an inline manifest
  `resolvePipeline(loadDefault(), { phases: { review: { required: true } } })`;
  `result.effective.find(d => d.id==='review').autoSkipEligible === false`, while
  `refactoring`/`validation` stay `true` (pins the `required` veto flows through `resolved`).
- **A3 (additive back-compat):** `Given the default pipeline, when resolvePipeline runs, then
  record/gateDecisions/waivers are unchanged by the additive field` — assert the field's presence
  does not disturb the existing shape: `result.gateDecisions` and `result.waivers` are arrays as
  before, the `propose` gateDecision still carries its `awaitingHarnesses`, and every effective
  descriptor has `typeof d.autoSkipEligible === 'boolean'` (no `undefined`, default-false honoured for
  floors). This pins the additive contract (ADR-125 parallel). *(If a tighter byte-for-byte
  `record[]` snapshot helper already exists in `resolve.test.js`, reuse it; otherwise the
  array-shape + boolean-presence assertions suffice — do NOT add a new snapshot framework.)*

**Count:** +3 node tests. Bump `EXPECTED_TESTS` by 3 (expected → 1043; pin from the runner).

### TDD steps

- **RED:** add A1–A3. Run `cd engine && node --test 'test/resolve.test.js'` → A1 FAILS (no
  `autoSkipEligible` field; `undefined`), A2 FAILS (field absent), A3 FAILS (the
  `typeof === 'boolean'` assertion fails — field absent).
- **GREEN:** add the import + the two-pass `effective` build to `resolve.js`. A1 (correct truth
  table), A2 (`required` veto), A3 (boolean everywhere, shape intact) all pass.
- **REFACTOR:** confirm the second map is a clean `{ ...d, autoSkipEligible: … }` (immutable, no
  mutation of `baseEffective`); confirm `resolved` (not raw `manifest`) is passed for the `required`
  lookup; confirm `engine/src/index.js` is untouched (helper stays internal). Bump `EXPECTED_TESTS`
  to the runner's reported `# tests`.

### Gate

```
cd engine && node --test 'test/resolve.test.js'
```

then:

```
bash scripts/ci.sh
```

Confirms: A1–A3 green; all existing resolve tests + SC1 goldens + scenario goldens green (additive
field disturbs nothing); `# tests` matches the bumped `EXPECTED_TESTS`;
`node engine/bin/pipeline-resolve.js pipeline/default.yml` exits 0 and its serialized JSON now carries
`autoSkipEligible` on every effective descriptor (surfaced automatically, no bin edit).

### Commit

```
feat(resolve): surface additive effective[].autoSkipEligible on the Resolution
```

---

## Part 4 — run: walk necessity probe, auto-skip token, gate release (prose)

### Context

**Shape:** prose-only (Sizing-rules exception — orchestrator skill prose, no `src/` delta, no
implementation part to fold into). No RED/GREEN; the gate is `bash scripts/ci.sh` staying green +
scenario fidelity. No `EXPECTED_TESTS` change (no node test added).

**ADR anchors:** ADR-143 (walk owns the dynamic necessity probe over `effective[].autoSkipEligible`),
ADR-146 (the fixed `auto-skip:` token), ADR-147 (auto-skipped harness releases its propose-gate via
the recorded-no-op path). Design D4 (per-phase signal table), D5 (gate release), D6 (ambiguous ⇒
run).

**File — `skills/run/SKILL.md`. Two prose insertions, no behaviour table broken:**

1. **Necessity probe at phase entry — in the Phase walk (`skills/run/SKILL.md:114-244`).** The walk's
   per-phase numbered steps start at `:116` ("For each phase:") with step 1 "Resolve the skill"
   (`:118`), running 1–8 through `:235`. Insert the probe as the **new step 1** ("Necessity probe
   (auto-skip)") and **renumber the existing 1–8 → 2–9**, keeping each existing step's content
   verbatim under its shifted number — the probe MUST run **at phase entry, before assembling the
   contract** (design D4 is explicit: before the contract; the existing step 1 "Resolve the skill"
   and step 3 "assemble contract" therefore become steps 2 and 4). **Do NOT use "step 0":** the
   document already has a top-level section `## 0 — Resolve` (`:17`), and the Cross-phase invariant at
   `:264` references "§0 step 1d" meaning that section — a walk "step 0" would collide. Leave every
   `§0` reference untouched. Content (terse, imperative, house voice — NO provenance refs):

   > **1. Necessity probe (auto-skip).** If `phase.autoSkipEligible` is `true`, evaluate against the
   > live change whether the phase has any work *before assembling the contract*. The per-phase
   > signal (auto-skip only when **provably empty**; any doubt runs the phase):
   >
   > | Eligible phase | Provably-empty signal ⇒ auto-skip |
   > |---|---|
   > | `review` | no reviewable source diff in scope since `implementation` (e.g. a docs/config-only change) |
   > | `refactoring` | no source change in scope to motivate a structural pass (same signal as `review`); when source *was* touched, it runs and may record `NO-OP(refactoring):` |
   > | `documentation` | no `design`/`change` content maps to any documentation surface |
   > | `validation` | no mutable code changed in scope — the mutation no-op signal, evaluated *before* spawning the run |
   > | `architecture` | no dependency-graph-affecting change (no import/module-boundary edits) since `implementation` |
   >
   > When provably empty: (a) append the fixed token
   > `auto-skip: <phase> — evaluated unnecessary (<signal>)` to the run record (e.g.
   > `auto-skip: review — evaluated unnecessary (no source diff in scope)`) — distinct from `WAIVER:`
   > and `NO-OP(<phase>):`; (b) if the phase is an executing-harness, release its `awaitingHarnesses`
   > entry (see Cross-phase invariants); (c) continue WITHOUT running the phase — no contract
   > assembled, no agent spawned, no commit. When the probe is non-empty, or the phase is not
   > `autoSkipEligible`, the phase runs exactly as today. When emptiness cannot be proven, RUN the
   > phase (doubt runs; never auto-skip on an unprovable judgment).

   Keep the `auto-skip:` spelling EXACTLY (fixed greppable token, repo memory
   `prefer-fixed-greppable-tokens`): `auto-skip: <phase> — evaluated unnecessary (<signal>)` with the
   em-dash `—` and the parenthetical signal.

2. **Propose-gate release clause — in Cross-phase invariants (`:258-282`).** The first invariant
   (executing-harness triage gates `propose`, `:260-282`) already documents the **recorded runtime
   no-op release** at `:270-278` ("if an awaited executing-harness records a runtime no-op … its
   `awaitingHarnesses` entry is released … the orchestrator treating a recorded no-op as a release at
   gate-check time"). Append ONE sentence (after the no-op release sentence, before the `validation`
   clarification at `:278`) extending the same release to a recorded `auto-skip:` (ADR-147 — an
   auto-skipped harness is in `effective[]`, carries no engine waiver, exactly like a no-op'd one):

   > Likewise, a recorded `auto-skip:` of an awaited executing-harness (it never lands a run, by the
   > same up-front necessity probe) releases its `awaitingHarnesses` entry the same way — the
   > orchestrator treats a recorded `auto-skip:` as a release at gate-check time, exactly as it treats
   > a recorded no-op; this is NOT an engine waiver (the phase is in `effective[]`). So `propose` is
   > never left waiting on a harness that auto-skipped.

   Do NOT alter the `validation` two-sub-outcome clarification (`:278-282`) or the `gates.js`/engine
   path — the release is orchestrator-owned (ADR-147, no engine change).

**Scope-expansion invariant (no edit, just honour it).** The existing
"Scope expansion re-enters the harness-read phase" invariant (`:284-290`) already binds: an
auto-skipped `review` is sound only because the diff was provably empty *at review's scope point*; any
later non-empty `change` (e.g. a non-no-op `refactoring`) re-triggers the scoped re-review. The
`review` signal is scoped to "no reviewable diff *in scope*", not "no diff ever" (design D6) — the
prose in insertion 1 already says "in scope", so no separate edit; verify the wording does not weaken
the existing invariant.

**Surface:** pure prose; no engine/data/lint/bats touch; no `EXPECTED_TESTS` change. No provenance
numbers (`P26`/ADR/DC) in the shipped SKILL text — the signal table and token are phrased
behaviourally.

### TDD steps

Prose — no RED/GREEN. Verification is `bash scripts/ci.sh` staying green (the prose edit touches no
shell/manifest/engine behaviour — CI confirms no collateral breakage, no markdown/skill lint
regression) PLUS a consistency read:
- the necessity-probe step is the new walk step 1 (so it runs BEFORE contract assembly — the old
  steps 1–8 are now 2–9), eligible only when `phase.autoSkipEligible`, and defaults to RUNNING when
  emptiness is unprovable;
- the token is spelled `auto-skip: <phase> — evaluated unnecessary (<signal>)` verbatim and is
  distinct from `WAIVER:`/`NO-OP(<phase>):`;
- the propose-gate release clause sits in the first Cross-phase invariant beside the no-op release and
  does not alter the engine/`gates.js` path or the `validation` clarification;
- any renumbered walk steps preserve their original content verbatim under the shifted number;
- no `P26`/ADR/DC/backlog numbers leaked into the shipped prose;
- scenario fidelity (manual, mirrors how P19's `NO-OP` and ADR-082's gate release are checked — NOT
  CI-unit): a docs-only change drives the pipeline, `review`/`validation` auto-skip with the recorded
  token, `propose` proceeds without waiting on the auto-skipped harness, `grep -F 'auto-skip:'` finds
  the line (distinct from `grep -F 'NO-OP('` and `grep WAIVER:`), and a `required: true` pin forces
  the phase to run (no `auto-skip:` line).

### Gate

```
bash scripts/ci.sh
```

Must stay green (prose-only; engine `# tests` unchanged at the Part 3 count; pi/bats/shellcheck/
pipeline+contracts lints all green — the SKILL.md edit breaks no lint).

### Commit

```
docs(run): auto-skip necessity probe, token, and propose-gate release
```
