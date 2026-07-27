# Design — Simpler phase authoring

> Brief: Make craft cheaper to author new phases in. Four coupled changes — archetype
> inference (engine keystone), pedagogical graph/strand lint errors (engine), a finished
> init insert sub-interview (skill), and a 3-axis customizing card (docs) — none of which
> weakens the invariant-contract governance floor.
> Status: draft → self-reviewed ×3 (empirically pinned) → awaiting decisions

## Context

craft is a phase-pipeline engine. The effective pipeline is `(defaults, manifest) → Resolution`,
computed purely in `engine/src/resolve.js`. A phase is a **descriptor**: `{ id, archetype,
contract, procedure, consumes, produces, self_supply, execution, enabled, role?, model?, gate?,
harness? }`. Two parsing paths produce descriptors:

- **Base pipeline** (`pipeline/default.yml`) → `parsePipeline` in `engine/src/descriptor.js`.
  `REQUIRED_FIELDS = ['id','archetype','contract','procedure']` (line 9) makes `archetype`
  mandatory here, and `normalizeEntry` defaults `contract/consumes/produces/self_supply/execution`.
- **Manifest edits** (`pipeline.insert`, `extends.phases`) → validated in `engine/src/manifest.js`,
  applied in `engine/src/edits.js` (`applyInserts`, line 101) and `engine/src/resolve.js`
  (`foldRegisteredPhases`, line 229). These default `contract/consumes/produces/self_supply/execution`
  but **not** `archetype`.

So `archetype` is the last required vocabulary word a new-phase author must learn on the
insert/extends path, even though `contract`, `consumes`, and `produces` already default. Three
adjacent rough edges compound the cost: graph/strand errors name the missing wire but not the fix;
the `/craft:init` insert question punts ("provide a descriptor object"); and the customizing guide
indexes its "injection points" as a flat cheapest-first catalog with no per-phase mental model.

### What `archetype` does — and does NOT do (the de-risking correction)

`archetype` drives **execution topology only** — never the governance floor. Verified in place:

- `engine/src/profile.js` `applyProfileToArchetype` (line 68) maps archetype → `inline|agent`;
  `HARNESS_ARCHETYPE` is unconditionally forced to `'agent'` (line 69) — the parallelism caveat.
- `engine/src/resolve.js` `resolvePhaseExecution` (line 84): under a top-level execution default,
  a harness-archetype phase still resolves to `DEFAULT_EXECUTION` (`'agent'`) (line 88).
- `engine/src/exec-harness.js` `isExecutingHarness` (line 21): an executing harness is
  `archetype === 'harness'` **AND** `contract.includes('harness-exec')` — the `techniquePlan`
  emission and the triage-gates-propose floor key on the **contract bundle**, not on archetype alone.
- `engine/src/contract.js` `assembleContract` (line 90): `expandCore` injects the **core** bundle
  for **every** phase unconditionally (line 94), regardless of archetype. The named `contract[]`
  bundles are a separate descriptor field that already defaults to `[]`.

Therefore a phase with an *inferred* archetype still receives the full contract floor, and an
inferred-`harness` phase **cannot** become an executing harness (with its propose-gate) unless its
`contract` separately carries `harness-exec` — which inference never touches. Inference can only move
a phase toward *more* isolation (the `harness` fallback forces agent), never less. This is the
load-bearing invariant the design must prove, not merely assert.

### Constraining ADRs / invariants (frozen — not rewritten here)

- Executing-harness floor "triage-gates-propose" keyed on the `harness-exec` contract, technique-neutral
  (`engine/src/exec-harness.js`, ADRs 148-155).
- Execution-topology archetype seam (DESIGN-P6-execution-topology; the harness-agent caveat).
- Engine-emitted-plan precedent: `deriveReviewPlan`/`deriveTechniquePlan` project raw knobs into an
  engine-owned plan; skills read the plan, not the raw knob (`engine/src/resolve.js` lines 129, 145).
- Resolution `record[]` stream is the single audit channel for every non-default resolution decision
  (`engine/src/resolve.js` lines 308-314; `engine/src/edits.js` record strings).
- Manifest fail-closed posture: a misconfigured declination aborts loudly, never silently
  (`manifest-lint` exit 2).

### Empirically pinned facts (run against the live engine in this worktree)

Probe A — current resolution of no-`archetype` inserts (direct `resolvePipeline` calls, the
`engine/src/resolve.js` API; see the per-insert results below). Probe B — `manifest-lint`
on no-`archetype` `extends.phases` vs `pipeline.insert`.

| Probe | Result today | Consequence for this design |
|---|---|---|
| insert `{gate, no produces}`, no profile | `archetype: undefined`, `execution: agent`, **no archetype record**, `ok: true` | archetype flows through as literal `undefined`, silent. Inference must fill it AND record it. |
| insert `{gate, no produces}`, top-level `execution: inline` | `archetype: undefined`, `execution: **inline**` | After inference → `harness`; the harness-agent caveat flips this to `agent`. The **one** intended behaviour change — now recorded, not silent. |
| insert `{produces:[x]}`, no profile | `archetype: undefined`, `execution: agent` | After inference → `construction`; follows `profile.construction` under a profile. |
| insert `{no gate, no produces, no harness}` | `archetype: undefined`, `execution: agent` | After inference → `harness` (conservative fallback = most isolated). |
| `manifest-lint` on `extends.phases[0]` with no `archetype` | **INVALID, exit 2** — "extends.phases[0].archetype must be one of …" (`engine/src/manifest.js:605`) | This reject must relax to "absent ⇒ infer; present-but-invalid ⇒ still reject". |
| `manifest-lint` on `pipeline.insert[0]` with no `archetype` | **valid, exit 0** — inserts carry no per-entry archetype validation | No insert-lint change needed; the init sub-interview's no-archetype insert already lints clean. |
| insert FLAT shape `{after, id, procedure, gate}` vs NESTED `{after, phase:{…}}` | FLAT → real descriptor (`ok:true`, phase present); NESTED → phase **silently vanishes** (`ok:true`, phase absent) | `applyInserts` destructures `{after, before, ...phaseData}` and spreads `phaseData` directly — the init sub-interview MUST emit the **flat** shape. The `everything-claude-toolkit` example's nested `phase:` form (tagged `(PRD)`) is non-functional; fixing it is out of scope. |

The first four rows establish the **before** column for the inference matrix in §1; the inference
rule table supplies the **after** column. The one cell that changes value (row 2) is the intended,
now-audited consequence of the harness-agent caveat.

## Requirements

When this ships, all are true:

1. `archetype` is **optional** on `pipeline.insert` and `extends.phases`, and remains **required**
   on `pipeline/default.yml` (enforced unchanged by `descriptor.js` `REQUIRED_FIELDS`).
2. A pure `inferArchetype(descriptor)` exists, total over any descriptor, returning
   `{ archetype, reason }` with `archetype ∈ { harness, construction }` and a human reason string.
   Rule order: explicit `archetype` always wins (inference is not consulted); else `harness` if a
   `harness` block is present OR a `gate` is present with empty `produces`; else `construction` if
   `produces` is non-empty; else `harness` (conservative fallback).
3. Every inferred archetype emits exactly one resolution record line —
   `archetype: <id> → <archetype> (inferred: <reason>)` — into the existing `record[]` stream.
   No inference is silent.
4. Inference **cannot weaken governance**, proven by test: an inferred-archetype phase still receives
   the unconditional core contract; an inferred-`harness` phase without `harness-exec` in its
   `contract` is **not** an executing harness (no `techniquePlan`, no propose-gate); inference never
   reads or writes `contract`.
5. The minimum new-phase descriptor on the insert path is `{ id, procedure, after }`
   (plus optional `gate`); no other field is required for a runnable phase.
6. The stranded-consumer error (`engine/src/strand.js`) and the dangling-consume error
   (`engine/src/graph.js` `checkEdgesSatisfied`) each **name** the artifact, **list** which phases
   produce it (with position/enabled state), and **suggest** the nearest fix — deterministically,
   table-tested, no prompt involvement.
7. `/craft:init`'s insert question is a guided sub-interview (command / position / does-it-block) that
   emits a `{ id, procedure|gate, after }` insert with no `archetype`, relying on inference.
8. `docs/GUIDE-customizing.md` carries a 3-axis customization card (WHO / WHAT / HOW per phase, plus
   spine-reshaping and the untouchable floor); every existing catalog point maps to a card cell.
9. `scripts/ci.sh` `EXPECTED_TESTS` is updated to the new count; the bats + `node:test` + lint + source-
   hygiene suites stay green; no technique/vendor token enters a scanned source (`source-hygiene.bats`).
10. Every change is behaviour-preserving for all existing example manifests except the single audited
    cell (pinned row 2); the example index in `examples/` continues to lint clean.

## Design

### 1. Archetype inference (engine keystone)

**New pure module `engine/src/archetype.js`.** A single total function, no I/O, deeply table-driven:

```
inferArchetype(descriptor) → { archetype, reason }
  // precedence (first match wins); explicit archetype is handled by the CALLER, not here
  1. descriptor.harness present                         → { harness,      'has harness block' }
  2. descriptor.gate present AND produces is empty       → { harness,      'gate with no produces' }
  3. produces is non-empty                               → { construction, 'produces [<artifacts>]' }
  4. otherwise                                           → { harness,      'fallback — most isolated' }
```

The function is total and its codomain is deliberately `{ harness, construction }` — the two
archetypes a check-or-build phase falls into. The other four archetypes (`setup`, `specification`,
`refinement`, `delivery`) are **not** inferrable; a phase that is genuinely one of those must declare
`archetype:` explicitly. The fallback is `harness` because `harness` is the most isolated topology
(forced agent), so an uncertain inference fails *safe*.

**Wiring — one chokepoint in the resolver.** Inference runs as a single pass after `applyReorder`
and **before** `resolveExecution` (which reads `descriptor.archetype` via `applyProfileToArchetype`).
Because the base defaults arrive pre-validated by `parsePipeline` (archetype already present), the
only descriptors that can reach this pass missing an archetype are insert/extends ones — so the single
seam satisfies "insert/extends only" structurally, with no engine-wide flag and no change to
`descriptor.js`:

```
const reorderResult = applyReorder(insertResult.descriptors, reorderList);
const inferResult   = inferMissingArchetypes(reorderResult.descriptors);   // NEW
const execResult    = resolveExecution(inferResult.descriptors, …);

const record = [
  ...enableResult.records,
  ...insertResult.records,
  ...reorderResult.records,
  ...inferResult.records,                                                   // NEW
  ...execResult.records,
  ...manifestRecords,
];
```

`inferMissingArchetypes(descriptors) → { descriptors, records }` is a thin pure wrapper: it maps the
list, calls `inferArchetype` only where `d.archetype === undefined`, sets the resolved archetype, and
pushes `archetype: ${d.id} → ${archetype} (inferred: ${reason})`. Explicit archetypes pass through
untouched and emit no record — explicit always wins.

**`extends.phases` replace branch keeps its slot.** `foldRegisteredPhases` (`engine/src/resolve.js:229`)
has two branches. A registered phase that *replaces* an existing descriptor (id match) is a full swap;
today the spread `{ enabled, contract:[], …, ...regData }` would drop the slot's archetype if `regData`
omits it. To keep replacement correct for delivery/specification slots that inference cannot recover,
the replace branch defaults `archetype` to the **existing descriptor's** archetype before `...regData`:

```
const replaced = { enabled: true, contract: [], consumes: [], produces: [], self_supply: [],
                   execution: DEFAULT_EXECUTION, archetype: existing.archetype, ...regData };
```

So an omitted archetype on a *replace* inherits the slot (no inference, no record); an omitted
archetype on an *append* or `pipeline.insert` has no slot and is filled by the inference pass (records).
Clean separation; the inference pass only ever sees genuine new phases.

**Manifest relaxation.** `engine/src/manifest.js:605` changes from "archetype required" to
"archetype optional, validated when present":

```js
if (archetype !== undefined && (typeof archetype !== 'string' || !VALID_ARCHETYPES.has(archetype))) {
  errors.push(`extends.phases[${i}].archetype, when present, must be one of ${[...VALID_ARCHETYPES].join(', ')}`);
}
```

`pipeline.insert` entries need no manifest change (pinned row 6: they already lint clean without
archetype).

**Inference matrix (after).** Mirrors the pinned before-table:

| Insert / append | inferred archetype | reason string | execution (no profile / under profile) |
|---|---|---|---|
| `{gate}`, no produces | harness | `gate with no produces` | agent / agent (harness-caveat) |
| `{gate}`, no produces, top-level `inline` | harness | `gate with no produces` | **agent** (changed from `inline` — audited) |
| `{produces:[x]}` | construction | `produces [x]` | agent / `profile.construction` |
| `{harness:{…}}` (+ any produces) | harness | `has harness block` | agent |
| `{}` (no gate/produces/harness) | harness | `fallback — most isolated` | agent |

### 2. Pedagogical graph/strand errors (engine)

Both targets currently name the wire but not the fix. The enrichment is a deterministic, pure resolver
change — table-tested, no prompt.

**Shared producer-listing helper.** Both `strand.js` and `graph.js` need "which phases produce
artifact A, and where." Extract one pure helper (new `engine/src/producers.js`):

```
producersOf(descriptors, artifact) → [{ id, index, enabled }]   // every descriptor producing artifact
```

Both modules import it; neither owns a second copy. `graph.js`'s existing `nearestEarlierProducer`
stays for the satisfied-edge fast path.

**`graph.js` `checkEdgesSatisfied` — dangling consume.** When no earlier enabled producer exists,
build the message from `producersOf`:

```
Descriptor "<consumer>": consumes "<artifact>" but no enabled phase before it produces "<artifact>".
  "<artifact>" is produced by: <id> (position N, after "<consumer>"), <id> (disabled).   // or: nothing in this pipeline.
  Did you mean after: <nearest-producer>, or produces: ["<artifact>"] on an earlier phase?
```

The three fact-cases the producer list distinguishes: a producer that exists but is **later**
(→ reorder / `after:`), a producer that is **disabled** (→ enable it), and **no producer anywhere**
(→ a typo, or add `produces:`). The `<nearest-producer>` in the suggestion is the closest existing
producer by index when one exists; the clause is omitted when none exists (only the `produces:` arm shows).

**`strand.js` `checkStrandedConsumers` — skip strands a consumer.** The strand check has already
proven no enabled earlier alternative exists; enrich with the other producers and the three fixes:

```
Strand: skipping "<skipped>" removes "<artifact>", consumed by "<consumer>" without self_supply.
  "<artifact>" is otherwise produced by: <list>.   // or: nothing else in this pipeline.
  Did you mean keep "<skipped>", produces: ["<artifact>"] on an enabled phase before "<consumer>",
  or self_supply: ["<artifact>"] on "<consumer>"?
```

Both remain `string[]`-returning pure functions; only the message bodies grow.

### 3. Finish the init insert sub-interview (skill)

`skills/init/SKILL.md` Tier-1 catalog row `insert` (line 135) currently punts with "provide a
descriptor object." Replace it with a guided three-question sub-interview, driven by `AskUserQuestion`,
defaults from the `CapabilityReport`:

| # | Question | Emits |
|---|---|---|
| command | "What does the phase run — a skill/command (worker step), or a shell check?" | worker → `procedure: <skill>`; check → `gate: <command>` |
| position | "After which existing phase should it run?" (offer the resolved phase id list) | `after: <id>` |
| does-it-block | "Should a failure block the pipeline (hard gate) or be advisory?" | a blocking shell check → `gate`; advisory → no gate |

Emitted insert — the **flat** shape (pinned: `applyInserts` spreads sibling fields; the nested
`phase:` form silently no-ops), no `archetype` (inference fills it at resolve; pinned to lint clean):

```yaml
pipeline:
  insert:
    - after: <position>           # after/before are siblings of the phase fields, not a wrapper
      id: <id>
      procedure: <command>        # present when it is a worker step
      gate: <command>             # present when it is a blocking shell check
```

The sub-interview narrates the inference outcome to the user ("no archetype needed — craft will infer
`<harness|construction>` from your gate/produces") so the collapsed descriptor is legible, not magical.

**Two known init gotchas, handled in this design:**
- **mktemp templates** keep the existing trailing-`X` form and reuse the already-validated
  `$manifest_final` / `$manifest_tmp` paths — the sub-interview adds no new temp-file handling, so the
  Step-2/3/4 atomic-move discipline is untouched.
- **Stale step-N cross-refs:** the sub-interview is a *lettered* sub-list under the existing Tier-1
  `insert` row, not a renumber of the Step 1-4 procedure. No `Step N` reference is renumbered; a
  post-edit sweep for `Step ` / `step ` / `#insert` references confirms zero stale pointers.

This change is skill prose only — zero engine change beyond what §1 already lands.

### 4. The 3-axis customizing card (docs)

`docs/GUIDE-customizing.md` §3 currently frames customization as a flat cheapest-first catalog: the
twelve Tier-0/1 injection points (#1-#12) plus the Tier-2 `extends:` derived-plugin point (#13).
Reframe §3 around a card that answers, for a single phase, three questions — plus how to reshape the
whole spine, plus the floor nothing may touch. Every existing catalog point (all of #1-#13) maps to a
card cell; the per-point detail (knob, example link) is preserved beneath each cell as the reference,
re-indexed by axis rather than by cost tier (the Tier label survives as a "cost" annotation).

| Axis | Cell | Catalog points that land here |
|---|---|---|
| **WHO runs it** | role · model · execution (profile = bulk execution) | #2 model, #4 execution, #5 profile, #10 role swap |
| **WHAT it does** | procedure · override | #9 override, #10 procedure swap |
| **HOW it's checked** | gate · harness | #3 gate, #6 harness config |
| **Reshape the spine** | skip · insert · reorder · extends · context | #1 skip, #11 insert, reorder, #13 extends, #8 context |
| **The floor (untouchable)** | invariant Preamble · core contract · gate cadence | §2 floor — not an injection point |
| **Ports (cross-cutting)** | backlog · memory · policy · DoD | #7 backlog, memory, policy, #12 DoD |

The cross-cutting ports (backlog/memory/policy/DoD) are not per-phase axes; they get their own row so
every numbered point still lands somewhere. The card replaces the Tier *framing* (the organizing spine
of §3) while keeping all catalog content and the §4 examples index. The existing
`docs/GUIDE-customizing.md` hexagon `file / gh /` Backlog-axis label (the one `source-hygiene.bats`
class-B allowlist entry) is preserved verbatim — the card must not introduce a new un-allowlisted
`gh`/`github` token.

### Governance-invariance proof (requirement 4)

A dedicated test fixture (in `engine/test/`) asserts, against `resolvePipeline` + `assembleContract`:

- An insert `{id, procedure, produces:[x]}` (no archetype, no contract) resolves to `construction`,
  `contract` stays `[]`, and `assembleContract` still emits the core preamble lines — floor preserved.
- An insert `{id, procedure, gate}` (no archetype) resolves to `harness`, but `isExecutingHarness`
  returns `false` (contract lacks `harness-exec`) → no `techniquePlan`, no propose-gate claimed —
  inference cannot fabricate executing-harness governance.
- `inferArchetype` never reads or writes `contract` (asserted by input/output shape: the function
  signature takes the descriptor and returns only `{ archetype, reason }`).

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | Where `inferArchetype` is wired | (a) single post-reorder pass in `resolve.js`; (b) inline in `applyInserts` + `foldRegisteredPhases`; (c) default in `descriptor.js` normalization (engine-wide) | **(a)** | One chokepoint, one record source, naturally "insert/extends only" since base arrives pre-validated; (b) duplicates the call in two paths; (c) violates "keep archetype required for base default.yml". |
| 2 | `extends.phases` replace branch when archetype omitted | (a) inherit the existing slot's archetype; (b) always infer (uniform with inserts); (c) keep replace requiring archetype | **(a)** | Inference codomain is `{harness, construction}` only — a replace of a `delivery`/`specification` slot would be mis-inferred; inheriting preserves slot identity with zero surprise and no record noise. |
| 3 | Resolution record line token | (a) `archetype: <id> → <archetype> (inferred: <reason>)`; (b) `infer: archetype <id>=<archetype> (<reason>)`; (c) fold the reason into the existing `insert:` record | **(a)** | Mirrors the existing `execution: <id> → <mode> (<reason>)` line verbatim; greppable fixed token `archetype:`; (c) couples two orthogonal decisions in one line. |
| 4 | Inference rule table & codomain | (a) `{harness, construction}`, fallback `harness` (brief-pinned); (b) add heuristics for `delivery`/`specification`; (c) a neutral non-archetype default | **(a)** | Brief-pinned; the two reachable archetypes cover check-or-build phases; (b) guesses intent for ports/specs and risks wrong topology; (c) leaves `archetype: undefined` flowing through, the status quo this change removes. |
| 5 | Pedagogical-error producer helper location | (a) new pure `engine/src/producers.js` imported by both; (b) export from `graph.js`, `strand.js` imports it; (c) duplicate the listing logic in each | **(a)** | One owner, no cross-module coupling (strand→graph), DRY; (c) drifts two copies. |
| 6 | Pedagogical-error facts & phrasing | (a) name + producer-list-with-position/enabled + "Did you mean after:/produces:/self_supply:?"; (b) minimal (artifact + producer ids only); (c) verbose multi-paragraph block | **(a)** | Enough to act without re-reading the YAML, one suggestion line; (b) omits the position/enabled fact that picks the fix; (c) buries the fix in prose. |
| 7 | Docs card: replace vs augment, and ports placement | (a) card reframes §3, catalog rows re-tagged by cell, ports as a 4th row; (b) card added above an unchanged catalog (augment); (c) card fully replaces the catalog, dropping per-point detail | **(a)** | Satisfies "replace the twelve-point Tier-0/1 framing" while keeping every example link (#1-#13) and the §4 index; (b) leaves two competing mental models; (c) loses the runnable per-point reference. |
| 8 | `EXPECTED_TESTS` bump + bats guard scope | (a) bump `EXPECTED_TESTS` to the new count AND add an inference/pedagogy bats guard; (b) bump the count only; (c) defer both to implementation | **(a)** | The count *will* rise (new node:test cases); the brief names it in scope; a bats guard locks the "no-archetype insert resolves + records" invariant end-to-end past the unit layer. |

## Test strategy

Mirror the known-good part sizings: pure-module, validator, resolver-wiring, docs-prose, bash-helper.

- **`inferArchetype` (pure-module).** New `engine/test/archetype.test.js`: one Given/When/Then per rule
  row + tie-breaks — harness-block-wins-over-produces, gate+no-produces, gate+produces→construction,
  produces-only, empty fallback, explicit-archetype-not-consulted. Total-function property: any
  descriptor yields an archetype in `{harness, construction}` and a non-empty reason.
- **Resolver wiring (`resolve.test.js`, `pipeline-resolve-main.test.js`).** Insert/append with no
  archetype resolves + emits exactly one `archetype: …` record; explicit archetype emits none; the
  `extends.phases` replace branch inherits the slot (no record); the pinned before→after matrix
  including the audited inline→agent flip (row 2).
- **Manifest validator (`manifest.test.js`).** `extends.phases` with no archetype lints clean;
  present-but-invalid archetype still rejected; `pipeline.insert` unchanged.
- **Governance invariance (`contract-assemble*.test.js` + a resolve fixture).** The three assertions in
  the proof section above.
- **Pedagogical errors (`graph.test.js`, `strand.test.js`, new `producers.test.js`).** Edge matrix:
  producer-later, producer-disabled, no-producer-anywhere, multiple producers; exact message substrings
  (artifact name, producer list with position/enabled, the suggestion arms). `producersOf` unit table.
- **Init skill (bats / `init-emit*.test.js`).** The emitted insert shape `{id, procedure|gate, after}`
  round-trips through `init-emit` and lints clean with no archetype; a `Step ` / `#insert` cross-ref
  sweep shows no stale pointer.
- **Hygiene + count.** `source-hygiene.bats` stays green (no new technique/vendor token; the
  `file / gh /` allowlist entry preserved); `examples-lint.bats` green; `scripts/ci.sh`
  `EXPECTED_TESTS` updated to match the new total in both the engine and repo-root `node --test` gates.

## Out of scope

- **Inferring `setup`/`specification`/`refinement`/`delivery`.** The codomain is `{harness,
  construction}`; other archetypes must be declared. Widening the heuristic is a separate change.
- **Making `archetype` optional in `pipeline/default.yml`.** Requirement 1 keeps it required for the
  base via `descriptor.js` `REQUIRED_FIELDS` — unchanged.
- **New manifest validation of `pipeline.insert` entries.** Inserts already lint without archetype
  (pinned); adding structured insert validation is a separate hardening.
- **Reworking the `examples/` presets or the `--harness`/`--policy` override surfaces.** The docs card
  re-indexes existing content; it does not add or change knobs.
- **Backlog/memory/policy port redesign.** The card merely gives these cross-cutting ports a row; their
  semantics are untouched.
- **Fixing the `everything-claude-toolkit` example's nested `phase:` insert.** It silently no-ops today
  (pinned); the flat shape is canonical. Repairing the example (or adding nested-shape support) is a
  separate change — flagged here so a follow-up can pick it up.
