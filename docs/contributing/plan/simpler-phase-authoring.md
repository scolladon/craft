# Plan — Simpler phase authoring

> Source: design doc `docs/design/simpler-phase-authoring.md` · ADRs `161`–`168`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.

## Conventions binding every part

- **Working tree:** `/Users/scolladon/workspace/perso/craft-simpler-phase-authoring`
  (branch `feat/simpler-phase-authoring`). Work ONLY here. Parts are sequential and share
  this one tree; each builds on the prior commit.
- **Public-surface decision (made once, here):** every new exported symbol this plan
  introduces — `inferArchetype`, `inferMissingArchetypes` (`engine/src/archetype.js`),
  `producersOf` (`engine/src/producers.js`) — is **INTERNAL**. The engine barrel
  `engine/src/index.js` re-exports only the top-level API (`parsePipeline`,
  `validatePipeline`, `resolvePipeline`, `assembleContract`, `normalizeFindings`,
  `validateManifest`, policy). These three helpers are consumed only by `resolve.js`,
  `strand.js`, `graph.js` via direct relative import. **Do NOT add them to the barrel.**
  There is no API-report / exhaustiveness gate to satisfy; internal-by-path is the
  established engine convention (see how `edits.js`, `strand.js`, `exec-harness.js` are
  imported). This decision is deliberate, not deferred.
- **No provenance** (phase/ADR/backlog numbers) in any source or test code. The record
  token, error strings, reasons — none carry a number.
- **No suppression directives** (`@ts-ignore`, `eslint-disable`, coverage-ignore, etc.).
  No swallowed errors.
- **Source hygiene (`test/source-hygiene.bats`):** never introduce a technique/vendor
  token (the class-A ban) into a scanned source. The class-B `\bgh\b|\bgithub\b` pattern
  is allow-listed on exactly one line — `docs/GUIDE-customizing.md` line 58, the
  `file / gh /` hexagon label (in §1, untouched by this work). No part may write a new
  `gh`/`github` token anywhere. (`harness`, `construction`, `archetype`, `inferred` are
  generic vocabulary, not banned tokens.)
- **Test count:** the per-part gate `cd engine && node --test 'test/**/*.test.js'` runs the
  suite but does NOT check the count. Only `scripts/ci.sh` pins `EXPECTED_TESTS=1103`
  (checked twice — engine-dir glob + repo-root glob, one shared var). Therefore Part 7
  (count bump) is LAST and is the only part whose gate is the full `bash scripts/ci.sh`.
  Intermediate parts stay green on the node gate with the stale count.

---

## Part 1 — Pure archetype inference module

### Context

**New file `engine/src/archetype.js`** (pure, no I/O, immutable). It exports two functions.

`inferArchetype(descriptor) → { archetype, reason }` — the rule table (ADR-164, design §1).
The function is **total** over any descriptor; codomain is exactly `{ harness, construction }`.
It does NOT consult an existing `descriptor.archetype` (the explicit-wins gate lives in the
caller `inferMissingArchetypes`). Predicate semantics (verified against current descriptor
shape — `produces` is an array defaulting to `[]`, `gate`/`harness` are optional):

```
1. descriptor.harness !== undefined                         → { archetype:'harness',      reason:'has harness block' }
2. descriptor.gate !== undefined && produces.length === 0    → { archetype:'harness',      reason:'gate with no produces' }
3. produces.length > 0                                       → { archetype:'construction', reason:`produces [${produces.join(', ')}]` }
4. otherwise                                                 → { archetype:'harness',      reason:'fallback — most isolated' }
```
First match wins (use early returns; nesting ≤2). Treat `produces` as
`Array.isArray(descriptor.produces) ? descriptor.produces : []` so the function is total even
on a raw pre-default descriptor. Reason strings are the exact, frozen bytes consumed by the
record line in Part 2 and asserted by tests — do not paraphrase them.

`inferMissingArchetypes(descriptors) → { descriptors, records }` — the thin list pass
(design §1). Pure; input never mutated. For each descriptor:
- if `d.archetype === undefined` → `const { archetype, reason } = inferArchetype(d)`; produce
  `{ ...d, archetype }` and push the record string
  `` `archetype: ${d.id} → ${archetype} (inferred: ${reason})` `` (ADR-163 — mirrors the
  existing `execution: <id> → <mode> (<reason>)` line in `resolve.js:110`; fixed greppable
  token `archetype:`).
- else (explicit archetype, including any of the six valid values) → pass through unchanged,
  **emit no record** (explicit always wins).
Return the mapped list and the accumulated records (records array empty when nothing inferred).

**Test idiom to mirror** (`engine/test/profile.test.js`, `engine/test/graph.test.js`):
`import { test } from 'node:test'; import assert from 'node:assert/strict';` — Given/When/Then
titles, AAA body, `sut` variable. Place the new test file at `engine/test/archetype.test.js`.

This module is exercised only by its own unit tests in Part 1; Part 2 wires
`inferMissingArchetypes` into the resolver. (A tested-but-not-yet-wired pure module between two
sequential commits is the known-good pure-module/resolver-wiring seam.)

### TDD steps

- RED `engine/test/archetype.test.js` — one Given/When/Then per rule row, all failing with
  "Cannot find module './archetype.js'" / `inferArchetype is not a function`:
  - harness block present (and a non-empty `produces`) → `{ archetype:'harness', reason:'has harness block' }` (proves rule 1 outranks rule 3).
  - `gate` present, `produces:[]` → `{ archetype:'harness', reason:'gate with no produces' }`.
  - `gate` present, `produces:['x']` → `{ archetype:'construction', reason:'produces [x]' }` (gate does NOT force harness when something is produced).
  - `produces:['a','b']`, no gate → `{ archetype:'construction', reason:'produces [a, b]' }`.
  - empty descriptor `{ id:'p' }` (no gate/produces/harness) → `{ archetype:'harness', reason:'fallback — most isolated' }`.
  - totality property: over a small matrix of shapes, `archetype ∈ {harness, construction}` and `reason` is a non-empty string.
  - `inferMissingArchetypes`: a list mixing one `archetype:undefined` insert and one explicit-`construction` descriptor → only the undefined one is filled, exactly one record emitted, its text equals `archetype: <id> → harness (inferred: ...)`; the explicit one is byte-identical in/out and emits no record.
- GREEN: create `engine/src/archetype.js` with both functions per Context. Minimal, early-return, no mutation.
- REFACTOR: extract the `produces` normalisation once; confirm reason strings are single-sourced (no duplication between the two functions).

### Gate
`cd engine && node --test 'test/**/*.test.js'`

### Commit
`feat(engine): infer phase archetype via pure inferArchetype rule table`

---

## Part 2 — Wire inference into the resolver chokepoint

### Context

Depends on Part 1 (`engine/src/archetype.js` exists). Four coupled edits + tests, all in the
resolver/manifest seam. Keystone behaviour (ADR-161/162/163/164, design §1 + governance proof).

**Edit A — `engine/src/resolve.js` (the chokepoint).** Import the wrapper and run it as one
pass between `applyReorder` and `resolveExecution`:
- Add to the import block (near line 14): `import { inferMissingArchetypes } from './archetype.js';`
- After the existing `const reorderResult = applyReorder(insertResult.descriptors, reorderList);`
  (line 301) insert: `const inferResult = inferMissingArchetypes(reorderResult.descriptors);`
- Change the `resolveExecution(...)` call (line 303-305) to consume `inferResult.descriptors`
  instead of `reorderResult.descriptors`.
- In the `record` assembly (lines 308-314) add `...inferResult.records,` immediately after
  `...reorderResult.records,` and before `...execResult.records,`.
Rationale (verified): only insert/extends descriptors can reach this pass without an archetype —
the base `pipeline/default.yml` is pre-validated by `parsePipeline` (`REQUIRED_FIELDS` keeps
archetype mandatory there, `descriptor.js:9`), so the single seam is structurally
"insert/extends only" with no engine-wide flag. Nothing between reorder and exec reads
`archetype` except `resolveExecution` (via `applyProfileToArchetype`/`HARNESS_ARCHETYPE`,
`profile.js:68-69`).

**Edit B — `engine/src/resolve.js` `foldRegisteredPhases` (lines 229-249), replace branch.**
A registered phase whose id matches an existing slot must inherit that slot's archetype when it
omits one (ADR-162) — inference codomain is `{harness, construction}` only and would mis-type a
`delivery`/`specification` slot. In the `if (idx !== -1)` branch, capture the existing
descriptor and default `archetype` from it BEFORE `...regData`:
```js
const existing = result[idx];
const { after, before, ...regData } = reg;
const replaced = {
  enabled: true, contract: [], consumes: [], produces: [], self_supply: [],
  execution: DEFAULT_EXECUTION, archetype: existing.archetype, ...regData,
};
```
So an omitted archetype on a *replace* inherits the slot (no inference, no record); an omitted
archetype on an *append* (no id match → pushed to `inserts`) or a `pipeline.insert` has no slot
and is filled by Edit A's pass. Existing replace tests (`resolve.test.js:674`, `:1012`, `:1039`)
all carry an explicit `archetype:` in `regData`, so `...regData` overrides the inherited default
and they stay green.

**Edit C — `engine/src/manifest.js:605` relax.** Today
`validateExtendsPhaseEntry` hard-rejects a missing archetype:
```js
if (typeof archetype !== 'string' || !VALID_ARCHETYPES.has(archetype)) {
  errors.push(`extends.phases[${i}].archetype must be one of ${[...VALID_ARCHETYPES].join(', ')}`);
}
```
Change to "optional, validated when present":
```js
if (archetype !== undefined && (typeof archetype !== 'string' || !VALID_ARCHETYPES.has(archetype))) {
  errors.push(`extends.phases[${i}].archetype, when present, must be one of ${[...VALID_ARCHETYPES].join(', ')}`);
}
```
`pipeline.insert` needs no manifest change (inserts already lint clean with no archetype —
pinned). `VALID_ARCHETYPES` is imported from `descriptor.js` (manifest.js:9).

**Edit D — flip the now-stale manifest test (exact, single test).** `engine/test/manifest.test.js`
lines 2227-2243 is the ONLY test that pins missing-archetype rejection; its fixture (line 2234) is
`{ id: 'bench', procedure: 'pluginB:bench', contract: [] }` (no archetype) and it asserts
`result.ok === false` + an archetype error. Flip it: assert `result.ok === true` and that NO error
mentions archetype (missing archetype is now valid — inference fills it at resolve). Retitle to
"...with a phase omitting archetype ... then ok:true (archetype optional, inferred at resolve)".
The EQUIVALENT-mutant comment block immediately above (lines 2221-2226) describes the OLD logic
("the typeof guard is defensive redundancy" / "a missing archetype is rejected") and is now
FALSE — under the relaxed condition `archetype !== undefined && (...)` the `!== undefined` guard is
load-bearing (absent ⇒ accept vs invalid ⇒ reject), killed by the pair {this missing→accept test +
the existing invalid→reject tests}. Rewrite that comment to that effect, or delete it; either way
it must carry NO line-number/provenance reference (the existing one cites a stale `manifest.js:397`
— do not reproduce it).
Present-but-invalid coverage ALREADY EXISTS and stays green after the relaxation (invalid archetype
is still rejected): the focused `archetype:'bogus'`/`'invalid-type'` rejection tests at lines ~2070
and ~2466, plus the "two distinct faults" test at ~2034. Do NOT add a new present-but-invalid
test — just confirm those stay green.
Unrelated (do NOT touch): the `extends.profiles.audit` "missing harness KEY" test at ~line 2544
asserts a profile-map completeness error, not a phase archetype — leave it.

**Edit E — resolver wiring tests** in `engine/test/resolve.test.js` (mirror existing fixtures:
`loadDefault()` helper, `SC1_IDS`, the `extends.phases` tests at 644/674/1012, the
`pipeline.insert` tests near 262/995). Add Given/When/Then tests:
- no-archetype FLAT insert `{ after:'validation', id:'smoke', procedure:'echo smoke', gate:'echo ok' }`
  → `ok:true`, the inserted descriptor has `archetype:'harness'`, and `result.record` contains
  exactly one line `archetype: smoke → harness (inferred: gate with no produces)`.
- no-archetype insert with `produces:['smoke-out']` (and a consumer or none) →
  `archetype:'construction'`, record reason `produces [smoke-out]`.
- `extends.phases` new-id entry WITHOUT archetype (otherwise valid: `procedure`, `after`,
  `produces`) → infers + emits one `archetype:` record.
- `extends.phases` REPLACE of an existing slot WITHOUT archetype (e.g. replace `documentation`
  giving only `procedure`/`produces`) → the replaced descriptor's `archetype` equals the default
  slot's archetype (inherited) and NO `archetype: ...` inference record is emitted.
- explicit-archetype insert → resolves, emits NO inference record (explicit wins).
- the audited flip (pinned design row 2): manifest `{ execution:'inline', pipeline:{ insert:[{ after:'validation', id:'smoke', procedure:'echo smoke', gate:'echo ok' }] }}`
  → the inserted phase resolves `execution:'agent'` (harness-caveat overrides the top-level
  `inline`), and an `archetype: smoke → harness (inferred: ...)` record is present.

**Edit F — governance-invariance proof** (requirement 4 / ADR-164 / design "Governance-invariance
proof"). New file `engine/test/governance-invariance.test.js`. Import `resolvePipeline` from
`../src/resolve.js`, `assembleContract` from `../src/contract.js` (mirror the call shape used in
`engine/test/contract-equivalence.test.js`), `isExecutingHarness` from `../src/exec-harness.js`,
and load defaults the way `resolve.test.js` does. Three assertions:
1. insert `{ id:'mk', procedure:'echo', produces:['mk-out'] }` (no archetype, no contract,
   `after` an existing id) → resolves `archetype:'construction'`, `contract` stays `[]`, and
   `assembleContract` for that resolved descriptor still emits the core preamble lines (floor
   preserved for an inferred archetype).
2. insert `{ id:'mk', procedure:'echo', gate:'echo ok', after:'validation' }` → resolves
   `archetype:'harness'`, but `isExecutingHarness(resolved)` returns `false` (its `contract`
   lacks `harness-exec`) → no `techniquePlan` is attached and no propose-gate is claimed —
   inference cannot fabricate executing-harness governance.
3. `inferArchetype` never reads or writes `contract`: assert by signature/shape — calling it
   with and without a `contract` field yields the same `{archetype, reason}`, and the returned
   object has exactly the keys `archetype` and `reason`.

No new exported symbol leaves this part beyond Part 1's (all INTERNAL; no barrel change).

### TDD steps

- RED: write Edits E + F tests first. Expected failures before Edits A–D: the no-archetype insert
  resolves with `archetype: undefined` and NO `archetype:` record (silent today — pinned probe A);
  the replace-inherit test sees `archetype: undefined`; the manifest flip test still sees
  `ok:false`; the governance tests fail because the inferred archetype is `undefined`
  (`isExecutingHarness` reads `descriptor.archetype === 'harness'`).
- GREEN: apply Edit A (wire pass + record), Edit B (replace inherits slot), Edit C (manifest
  relax), Edit D (flip the stale test + rewrite its comment).
- REFACTOR: confirm the record ordering in `resolve.js` is enable→insert→reorder→**infer**→exec→
  manifest (audit-stream order); confirm no existing `extends.phases`/`insert` test regressed
  (run the full suite — many fixtures carry explicit archetype and must emit no inference record).

### Gate
`cd engine && node --test 'test/**/*.test.js'`

### Commit
`feat(engine): wire archetype inference into the resolver chokepoint`

---

## Part 3 — `producersOf` artifact-producer helper

### Context

**New file `engine/src/producers.js`** (pure, no I/O — ADR-165). One exported function:
```
producersOf(descriptors, artifact) → [{ id, index, enabled }]
```
For each descriptor in `descriptors` (in order) whose `produces` array includes `artifact`,
emit `{ id: d.id, index: <its position in descriptors>, enabled: !!d.enabled }`. Return `[]` when
none. Pure; immutable; total (treat a missing `produces` as `[]`). This is the single owner of
"which phases produce artifact A, and where" — both `strand.js` and `graph.js` import it in
Part 4; neither keeps a second copy. `graph.js`'s existing private `nearestEarlierProducer`
(graph.js:15) stays for the satisfied-edge fast path and is unrelated to this helper.

**INTERNAL** export — not added to `engine/src/index.js`. Test file `engine/test/producers.test.js`
(mirror `graph.test.js` idiom: node:test, Given/When/Then, AAA, `sut`).

### TDD steps

- RED `engine/test/producers.test.js` (fails "Cannot find module './producers.js'"):
  - artifact produced by one enabled phase → single `{id, index, enabled:true}` with the correct index.
  - artifact produced by two phases, one disabled → both entries, correct indices, `enabled` flags distinguishing them.
  - artifact produced by nobody → `[]`.
  - a descriptor with no `produces` field in the list is skipped without throwing (totality).
  - index reflects position in the passed `descriptors` array (not insertion order of producers).
- GREEN: create `engine/src/producers.js` with `producersOf` per Context.
- REFACTOR: ensure single pass (reduce/filter+map), no mutation, early `[]` not needed (empty map yields `[]`).

### Gate
`cd engine && node --test 'test/**/*.test.js'`

### Commit
`feat(engine): producersOf helper listing artifact producers with position`

---

## Part 4 — Pedagogical strand and dangling-consume errors

### Context

Depends on Part 3 (`producersOf`). Deterministic, pure resolver enrichment — table-tested, no
prompt (ADR-166, design §2). Both functions stay `string[]`-returning pure functions; only the
message bodies grow.

**Edit A — `engine/src/graph.js` `checkEdgesSatisfied` (lines 67-84).** When no
`nearestEarlierProducer` exists, build the message from `producersOf(descriptors, artifact)`
(import it: `import { producersOf } from './producers.js';`). Target message (design §2):
```
Descriptor "<consumer>": consumes "<artifact>" but no enabled phase before it produces "<artifact>".
  "<artifact>" is produced by: <id> (position N, after "<consumer>"), <id> (disabled).   // or: nothing in this pipeline.
  Did you mean after: <nearest-producer>, or produces: ["<artifact>"] on an earlier phase?
```
Distinguish the three producer fact-cases the list encodes: a producer that exists but is LATER
(annotate `position N, after "<consumer>"`), a producer that is DISABLED (annotate `disabled`),
and NO producer anywhere (the producer-list clause reads `nothing in this pipeline.` and the
suggestion shows only the `produces:` arm — omit the `after:` arm). The `<nearest-producer>` in
the suggestion is the closest existing producer by index (compute from the `producersOf` list);
include the `after:` arm only when at least one producer exists.

**Edit B — `engine/src/strand.js` `checkStrandedConsumers` (lines 26-58).** The strand check has
already proven no enabled earlier alternative exists. Enrich the message with the other producers
(import `producersOf`). Target message (design §2):
```
Strand: skipping "<skipped>" removes "<artifact>", consumed by "<consumer>" without self_supply.
  "<artifact>" is otherwise produced by: <list>.   // or: nothing else in this pipeline.
  Did you mean keep "<skipped>", produces: ["<artifact>"] on an enabled phase before "<consumer>",
  or self_supply: ["<artifact>"] on "<consumer>"?
```
Build `<list>` from `producersOf(effective, artifact)` EXCLUDING the `<skipped>` id (it is the one
being removed — "otherwise produced by"); when that filtered list is empty the clause reads
`nothing else in this pipeline.`. **Token-preservation constraint:** existing assertions depend on
the message still containing the word `Strand` and naming the skipped id, the consumer id, and the
artifact — `engine/test/resolve.test.js:120-157` matches `/strand/i` together with
`/documentation/i`, `/design/i`, `/planning/i`, `/workspace/i`; `engine/test/pipeline-lint-main.test.js:67`
matches the consumer id substring (`beta`). The new message keeps all of these, so those tests
stay green — verify, do not rewrite them.

**Existing graph assertions to UPDATE** (they pin the OLD wording): `engine/test/graph.test.js`
lines ~49 and ~59 assert the substring `no earlier enabled descriptor produces it`. The new
message replaces that phrase with `no enabled phase before it produces`. Update both assertions to
the new stable substring (keep the artifact-name check, e.g. `/beta/`, `/widget/`).

**New `engine/test/strand.test.js`** (there is no strand test file today — strand is currently
exercised only indirectly via `resolve.test.js`). Unit-test `checkStrandedConsumers` directly
(import from `../src/strand.js`) with hand-built `defaults`/`skipSet`/`effective` fixtures.

### TDD steps

- RED:
  - extend `engine/test/graph.test.js` with cases asserting the NEW substrings for: producer-later
    (`position`, `after`), producer-disabled (`disabled`), no-producer-anywhere (`nothing in this
    pipeline`, only the `produces:` suggestion arm), and the `Did you mean after: <nearest>` arm
    when a producer exists. Update the two old-wording assertions (~49, ~59) — they go RED against
    the old code only after rewording, so reword them to the target message and let them drive it.
  - new `engine/test/strand.test.js`: a skip that strands a consumer whose artifact is otherwise
    produced LATER/DISABLED → message contains the producer list, position/enabled annotation, and
    all three suggestion arms (`keep`, `produces:`, `self_supply:`); a strand where nothing else
    produces the artifact → `nothing else in this pipeline.`.
- GREEN: apply Edits A + B (import `producersOf`, rebuild the two message bodies).
- REFACTOR: extract a shared producer-line formatter if the two call sites duplicate the
  `<id> (position N…)` rendering (keep it local to each module OR, if identical, fold into a tiny
  helper — but do NOT widen `producers.js` beyond listing; rendering is the message's concern).
  Re-run the full suite to confirm the strand token-preservation held (resolve/pipeline-lint).

### Gate
`cd engine && node --test 'test/**/*.test.js'`

### Commit
`feat(engine): pedagogical strand and dangling-consume errors`

---

## Part 5 — Guided init insert sub-interview

### Context

Skill-prose part (no `engine/src/` delta) + one regression test. The init emitter already forwards
inserts verbatim: `engine/src/init-emit.js` `buildPipeline` line 82 is
`if (answers.insert && answers.insert.length > 0) result.insert = answers.insert;` — so the FLAT
shape is entirely the responsibility of the SKILL prose that builds `answers.insert`. No emitter
code change is needed or wanted.

**Edit A — `skills/init/SKILL.md` line 135** (the Tier-1 catalog `insert` row) currently punts:
`| insert | "Insert a new phase? (provide a descriptor object or leave empty)" | ... |`. Replace
the punt with a guided three-question sub-interview as a LETTERED sub-list under the row (driven by
`AskUserQuestion`, defaults from the `CapabilityReport`), design §3:
- command — "What does the phase run — a skill/command (worker step), or a shell check?" →
  worker emits `procedure: <skill>`; check emits `gate: <command>`.
- position — "After which existing phase should it run?" (offer the resolved phase id list) →
  emits `after: <id>`.
- does-it-block — "Should a failure block the pipeline (hard gate) or be advisory?" → a blocking
  shell check emits `gate`; advisory emits no gate.
The emitted insert is the **FLAT** shape (pinned: `applyInserts` spreads sibling fields; the nested
`phase:` form silently no-ops), with **no `archetype`** (inference fills it at resolve; an insert
with no archetype lints clean — pinned probe row 6):
```yaml
pipeline:
  insert:
    - after: <position>     # after/before are SIBLINGS of the phase fields, not a wrapper
      id: <id>
      procedure: <command>  # present when a worker step
      gate: <command>       # present when a blocking shell check
```
Have the sub-interview narrate the inference outcome ("no archetype needed — craft will infer
`<harness|construction>` from your gate/produces") so the collapsed descriptor stays legible.

**Two init gotchas (handled, design §3):**
- **mktemp:** the sub-interview adds NO new temp-file handling. The existing Step-2/3/4 atomic-move
  discipline (trailing-`X` template, reuse of the validated `$manifest_final`/`$manifest_tmp`
  paths around line 167-169) is untouched. Do not introduce a new mktemp.
- **Stale step-N cross-refs:** the sub-interview is a LETTERED sub-list under the existing Tier-1
  `insert` row, NOT a renumber of the Step 1-4 procedure — no `Step N` reference moves. After
  editing, sweep the whole file for `Step `, `step `, and `#insert` references and confirm zero
  stale pointers (the sweep is part of REFACTOR below).

**Edit B — regression test in `engine/test/init-emit.test.js`** (the unit home for
`emitManifest`/`buildPipeline`; mirror its existing insert tests). Lock the emit contract the prose
relies on: given `answers = { insert: [{ after:'validation', id:'smoke', procedure:'echo smoke', gate:'echo ok' }] }`,
`emitManifest(answers)` then `joinManifest(...)` then re-parse the frontmatter → `pipeline.insert[0]`
is FLAT (`after`/`id`/`procedure`/`gate` at top level, NO `phase:` wrapper) and carries NO
`archetype` key. This is a characterization/contract lock: because the emitter already forwards
verbatim, it passes on arrival — its RED counterpart is the SKILL prose gap (the line-135 punt),
proven by the cross-ref/content sweep below. (The full resolve+record end-to-end guard for this
shape is Part 7's bats scenario.)

### TDD steps

- RED: add the `engine/test/init-emit.test.js` flat-shape contract test (Edit B). Before any SKILL
  edit, also establish the prose RED by grepping `skills/init/SKILL.md` for the punt string
  `provide a descriptor object` (present today) and for the three sub-question labels (absent today).
- GREEN: rewrite the line-135 `insert` row as the lettered sub-interview (Edit A); confirm Edit B's
  test passes (emitter forwards the flat shape unchanged).
- REFACTOR: sweep `skills/init/SKILL.md` for `Step `/`step `/`#insert` references → zero stale
  pointers; confirm no new `gh`/`github` token entered the file; confirm the punt string is gone
  and the three sub-questions plus the no-archetype narration are present.

### Gate
`cd engine && node --test 'test/**/*.test.js'`

### Commit
`feat(init): guided insert sub-interview emitting a flat no-archetype descriptor`

---

## Part 6 — Three-axis customizing card (GUIDE §3)

### Context

Docs-prose part (no `src/` delta). Reframe `docs/GUIDE-customizing.md` §3 (starts at line 121,
`### Tier 0` / `### Tier 1` / `### Tier 2` tables; the §4 examples index follows) from a flat
cost-tier catalog into a 3-axis card whose cells re-index every existing catalog point (ADR-167,
design §4). Keep ALL example links and the §4 index; the Tier label survives as a per-cell "cost"
annotation, not the organizing spine.

**Full current catalog inventory (every row must land in a card cell — do not orphan any):**
- Tier 0 (lines 129-138): `#1 skip`, `#2 model`, `#3 gate`, `#4 execution`, `#5 profile`,
  `#6 harness`, `#7 backlog source`, `#8 memory`, `#9 policy`, `#10 required`.
- Tier 1 (lines 147-151): `#8 context file`, `#9 override file`, `#10 agent/skill swap
  (role:/procedure:)`, `#11 insert`, `#12 DoD artifact`. (Note: the doc's numbering is
  tier-scoped and COLLIDES across tiers — Tier 0 and Tier 1 both use 8/9/10. Map by the row's
  meaning, not its number.)
- Tier 2 (line 161): `#13 extension surface (extends:)`.

**Card cells (ADR-167) and where each row lands (design §4 mapping):**
- **WHO runs it** — role · model · execution (profile = bulk execution): Tier0 #2 model,
  #4 execution, #5 profile; Tier1 #10 role swap (`role:`).
- **WHAT it does** — procedure · override: Tier1 #9 override, Tier1 #10 procedure swap (`procedure:`).
- **HOW it's checked** — gate · harness: Tier0 #3 gate, #6 harness.
- **Reshape the spine** — skip · insert · reorder · extends · context: Tier0 #1 skip, Tier1 #11
  insert, `reorder` (a pipeline op, not a numbered point), Tier2 #13 extends, Tier1 #8 context.
  **Also place Tier0 #10 `required` here** (the necessity/auto-skip pin — skip's inverse); the
  design's §4 table does not pre-assign `required`, and the spine row is its natural home so no row
  is orphaned.
- **The floor (untouchable)** — invariant Preamble · core contract · gate cadence: §2 content,
  not an injection point.
- **Ports (cross-cutting)** — backlog · memory · policy · DoD (the 4th row): Tier0 #7 backlog,
  #8 memory, #9 policy; Tier1 #12 DoD.

**Hard constraints:**
- Preserve every `[...](../examples/...)` link beneath its cell as the runnable per-point
  reference (re-indexed by axis, not deleted). Keep the `†` insert footnote (lines 153-155) and the
  §4 examples index intact.
- Do NOT introduce any `gh`/`github` token. The only allow-listed occurrence is the §1 hexagon
  `file / gh /` label at line 58 (outside §3, untouched). `source-hygiene.bats` will fail on any new
  one.
- This is the ONLY file Part 6 touches; no test changes (it is covered by `source-hygiene.bats`,
  which runs in `scripts/ci.sh` at the phase boundary).

### TDD steps

- RED: read the FULL current §3 (lines 121-162) and the §4 index; enumerate all 16 catalog rows;
  draft the card so every row maps to exactly one cell (a checklist, not an automated test — this
  is a docs-prose part). Confirm the pre-edit `source-hygiene.bats` is green (baseline).
- GREEN: rewrite §3 as the 6-row card (WHO / WHAT / HOW / reshape-spine / floor / ports) with each
  catalog point and its example link re-indexed beneath the matching cell; keep the Tier label as a
  cost annotation.
- REFACTOR: verify no catalog point or example link was dropped (diff old §3 row set against new
  cell coverage); verify no new `gh`/`github` token; run `bats test/source-hygiene.bats` to confirm
  the allowlist still holds.

### Gate
`cd engine && node --test 'test/**/*.test.js'` and `bats test/source-hygiene.bats`

### Commit
`docs(guide): reframe customizing §3 around a three-axis card`

---

## Part 7 — End-to-end bats guard + EXPECTED_TESTS bump

### Context

LAST part — depends on every prior part (needs inference wired AND the final node test count).
Test-infra-only (no `src/` delta): a bats scenario + the `scripts/ci.sh` count bump (ADR-168).

**Edit A — bats guard.** Add a scenario asserting a `{ id, procedure, gate, after }` FLAT insert
with NO archetype resolves `ok:true` and emits the inferred-archetype record line end-to-end (past
the unit layer). The resolver CLI `engine/bin/pipeline-resolve.js <default.yml> <manifest>` writes
`JSON.stringify({ ...resolution, policy })` to stdout (`pipeline-resolve-main.js:333`), so the
`record[]` array is in the JSON. Pattern (mirror `test/manifest-lint.bats`: a fixture
`*.workflow.md` with YAML frontmatter under `test/fixtures/manifest/`, run via the bin against
`pipeline/default.yml`):
- Fixture frontmatter declares `pipeline: { insert: [{ after: validation, id: smoke, procedure: "echo smoke", gate: "echo ok" }] }` (flat, no archetype, no produces → infers `harness`).
- Invocation: `node engine/bin/pipeline-resolve.js pipeline/default.yml <fixture>` (positional
  args: pipeline first, manifest second; the manifest is loaded via
  `parseManifestContent(readFileSync(...))` so the frontmatter `.workflow.md` form is correct). It
  writes `JSON.stringify({ ...resolution, policy })` to stdout, so `resolution.record` is in the
  JSON.
- Assert `status -eq 0`, stdout contains `"ok":true`, and stdout contains the ASCII tail of the
  record line `(inferred: gate with no produces)` together with `smoke` and `harness` (grep the
  ASCII tail rather than the `→` arrow, which JSON-encodes to a literal U+2192 and is fragile to
  match in bats).
Place it in a new `test/archetype-inference.bats` (or append to an existing resolve-oriented bats
file if one fits) and a fixture file. Keep the bats `load`/`ROOT` idiom of the neighbouring files.

**Edit B — `scripts/ci.sh` `EXPECTED_TESTS` (line 10).** Bump from `1103` to the new total. The
value is read TWICE in `ci.sh` (engine-dir glob, line 19; repo-root glob, line 31) but is ONE
variable — change it once. Determine the new number empirically: after Parts 1-6 are committed, run
`cd engine && node --test 'test/**/*.test.js'` and read the `# tests <N>` summary line; set
`EXPECTED_TESTS=<N>`. (Do NOT guess the delta — count it from the live suite in this part.)

**Sequencing note:** the bats guard adds no node:test cases (it is a bats scenario), so it does not
change `<N>`; compute `<N>` from the node suite as it stands at the start of this part, then add the
bats scenario, then run the full `bash scripts/ci.sh` as the gate.

### TDD steps

- RED: add the `test/archetype-inference.bats` scenario + fixture; run `bats test/archetype-inference.bats`
  — it passes (inference is wired from Part 2), but `bash scripts/ci.sh` FAILS with "test count
  drift — expected 1103, got <N>" because the suite grew across Parts 1-6.
- GREEN: read `<N>` from the node `# tests` line and set `EXPECTED_TESTS=<N>` in `scripts/ci.sh`.
- REFACTOR: run `bash scripts/ci.sh` (the full phase gate) to confirm both count checks pass, bats
  green, shellcheck green, source-hygiene green, pi suite untouched. Confirm `EXPECTED_PI_TESTS`
  (line 36) was not touched.

### Gate
`bash scripts/ci.sh`

### Commit
`test(engine): guard inferred-archetype insert end-to-end and bump EXPECTED_TESTS`
