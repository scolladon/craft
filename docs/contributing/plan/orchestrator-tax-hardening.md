# Plan — orchestrator-tax hardening

> Source: design doc `docs/contributing/design/orchestrator-tax-hardening.md` · ADRs `300-314`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.

## Seams kept, order changed

The design proposes seams A–G. This plan **keeps all seven seams as seven parts** and
**re-orders them**. Two judgments, stated so a reviewer can disagree with the reasoning
rather than guess it:

- **B and C stay separate parts, as the design argues.** They share the lint-bin
  archetype and nothing else: disjoint files (`engine/src/findings.js` +
  `contracts/harness-exec.md` + `skills/validation` vs `engine/src/plan-lint-main.js` +
  `scripts/plan-lint.sh`), disjoint failure modes (a bad range predicate silently drops a
  finding; a bad detector emits a noisy advisory), and disjoint revert stories. One commit
  carrying both would be un-revertible in halves.
- **E and D stay separate parts, in that order.** The design's one hard ordering
  constraint. Part 2's test asserts the Part 1 line is present in `contracts/core.md`
  (the prune skill's fail-closed denylist source), so reversing the order fails loud
  instead of pinning a stale core.

Execution order and dependencies (each part builds on the same working tree):

| Part | Seam | Depends on | Why here |
|---|---|---|---|
| 1 | E — core git-safety line | none | smallest; unblocks Part 2; the added line is inert for everything else |
| 2 | D — prune lens + DoD criterion | **Part 1** | its denylist assertion reads Part 1's line |
| 3 | A — on-disk run-record ledger | none | largest self-contained seam; no code, all orchestrator prose + pins |
| 4 | B — validation boundary digest | none | first of the two lint-family seams |
| 5 | C — plan-lint move + overlap advisory | none | second lint-family seam; after Part 4 so only one engine-bin archetype is in flight at a time |
| 6 | F — fan-out advisory | none | isolated `engine/src/resolve.js` change |
| 7 | G — Frame 5 + count edits | **Parts 3, 4, 5** | its mapping rows must name mechanisms that have already landed (ADR-314) |

**After Part 5 lands, `scripts/plan-lint.sh` on THIS plan may print cognitive-locality
warnings** (several parts legitimately quote `docs/contributing/design/orchestrator-tax-hardening.md`,
`skills/run/SKILL.md`, and `test/craft-root-shim.test.js`). They are advisory, the exit
code is unchanged, and `skills/implementation/SKILL.md` step 2's re-run stays green. Do
not "fix" the plan in response to them.

## Facts every part needs (verified against this tree, do not re-verify)

- **Two test suites, two module systems.** `engine/test/*.test.js` is ESM
  (`import { test } from 'node:test'`), run by `npm --prefix engine test`.
  `test/*.test.js` is CJS (`'use strict'; const { test } = require('node:test')`), run by
  `node --test 'test/**/*.test.js'`. Engine test helpers live in `engine/test-helpers/`.
- **No `scripts/ci.sh` edit is expected by any part.** `run_suite` enumerates `*.test.js`
  with `find`, so new test files are picked up with no script change.
  `test/hygiene-gates-ci.test.js` pins `ci.sh`'s excuse-glob case-arm byte-wise — if a
  part ever does edit a glob, that pinned regex must move in the same commit. None should.
- **`test/craft-root-shim.test.js` pins EXACT per-file counts** of the literal
  `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/` in `TARGET_FILES` (skills/run = 6,
  skills/validation = 1, skills/review = 1, skills/integrate = 1, skills/planning = 2).
  Any part that adds or removes a shimmed invocation in one of those files updates its
  count in the same commit.
- **`test/source-hygiene.test.js` Class A** bans `stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise`
  under `pipeline`, `skills`, `agents`, `contracts`, `templates`, `engine/src`,
  `docs/contributing/specs`, `docs/contributing/DOD.md`, `docs/guides/customizing.md`,
  `README.md`. **Class B** bans `\bgh\b|\bgithub\b` over the same set.
- **`prose-lint` runs over every touched `*.md` except** `docs/contributing/{adr,design,archive,specs,prd}`.
  Ban list: `delve`, `leverage`, `seamless`, `robust`, `it's important to note`,
  `in conclusion`. It is advisory here (`.claude/workflow.md` declares no `hygiene:` key →
  `hygiene-gate` resolves `advisory`), but keep the new prose clean anyway.
- **Intention corpus ownership is not triggered by this change.** `docs/contributing/specs/intention.md`
  claims `engine/src/intention*.js` + `engine/src/glob.js`; `docs/contributing/specs/telemetry.md`
  claims `engine/src/observability/**`. No part touches either set, so no spec page owes a
  refresh on those grounds.
- **`.gitignore` is not edited by any part** (ADR-301). `.claude/*` already ignores the
  ledger; Part 3 pins that negatively.
- **Files no part touches, by decision** — a drive-by edit to any of these is out of scope:
  `.gitignore` (ADR-301), `scripts/ci.sh`, `scripts/worktree-teardown.sh` (ADR-301 — no
  ledger-preservation step), `templates/plan.md` (ADR-307 — the `### Context` schema stays
  free prose), `pipeline/default.yml` (ADR-308 — the gate string is unchanged),
  `engine/stryker.conf.json` (its `engine/src/**/*.js` glob already covers both new
  modules), and `engine/test/fixtures/contracts/core.md` (a deliberately divergent
  simplified fixture).
- **This plan trips `prose-lint` advisorily, on purpose.** `docs/contributing/plan/` is not
  in `ci.sh`'s prose-lint skip set, and the part blocks below quote the ban list verbatim so
  an implementer writing contract prose does not have to go and look it up. The six
  resulting `SLOP-FOUND` lines are self-reference, the gate is advisory, and two shipped
  plans in this directory already carry exactly the same six. Do not triage them.

## Part 1 — core contract line: no repo-wide git state changes

### Context

**What ships:** one new line in `contracts/core.md`, one marker in the shared test helper,
one behavioural pin.

**File to edit — `contracts/core.md`** (8 lines today, byte-exact):

```
1 Never commit on a red gate.
2 Artifact handoff: @@ARTIFACT_HANDOFF@@
3 Blocker protocol: { unit, reason, ≤3 options } — never spin or guess.
4 No provenance refs (phase/ADR/backlog numbers) in source or test.
5 No suppression directives (@ts-ignore, eslint-disable, coverage ignores, lint-silencing comments of any flavour).
6 No swallowed errors.
7 Bounded scope; work only in the given working directory.
8 Model: @@MODEL_RESOLUTION@@
```

Insert the new line **between line 7 and line 8** (it extends the scope bound; `Model:`
stays last):

```
Never change repo-wide git state (stash, pop, checkout, reset); another agent may be working the same tree.
```

Wording is constrained (ADR-311, all four verified against this exact string):
no `retrieval` substring (`engine/src/contracts-lint-main.js` rejects it case-insensitively);
no `mutation`/`mutant` (source-hygiene Class A scans `contracts/`); no `\bgh\b|\bgithub\b`
(Class B); no prose-lint ban-list word; plain prose, no backticks, no `@@…@@` marker.
**No exemption clause for reset-on-red** — the contract binds agents, and the reset-on-red
`git reset --hard` is performed by the runner (`adapters/aider/src/vcs-posture.js`
`reconcileGateOutcome` returns `{ action: 'reset', target: preTurnHead }`; the runner
performs it), which the contract does not govern.

**Test helper to extend — `engine/test-helpers/contract-markers.js`:**

```js
export const CORE_MARKERS = [
  'never commit on a red gate', 'Blocker protocol', 'provenance', 'suppression',
  'swallowed', 'Bounded scope', 'the agent commit is the handoff', 'the role model resolved',
];
export function hasCI(haystack, marker) { return haystack.toLowerCase().includes(marker.toLowerCase()); }
```

Append `'repo-wide git state'`. This array is imported by **exactly two** suites —
`engine/test/contract-equivalence.test.js:8` and `engine/test/scenarios.test.js:24` — and
both assemble against the **real** `contracts/` directory (`contract-equivalence.js`
`readFragment()` reads `<repoRoot>/contracts/<name>.md`; `scenarios.test.js:330` uses
`REAL_FRAGMENTS`). So one helper edit covers every descriptor in both suites, and
`engine/test/fixtures/contracts/core.md` (a deliberately simplified 7-line fixture that
already diverges in wording) needs **no** sync.

**What must keep passing, and why it will:**

- `engine/test/contract-equivalence.test.js:108` and `:188` assert **exactly two** lines
  differ between agent and inline assembly (`diffLines` compares non-blank lines
  positionally). A plain new line adds no carve-out marker, so the diff set stays at two.
- `engine/src/contract.js` `assembleContract(descriptor, manifest, fragments, opts)` is
  untouched — it splits `fragments.core` on `\n` and maps `applyCarveOuts` per line.
- `engine/bin/contracts-lint.js` → `engine/src/contracts-lint-main.js:38` requires only a
  non-empty regular file with no `retrieval` substring.
- `engine/test/governance-invariance.test.js` uses a sentinel core fragment — unaffected.
- No test pins the core file's line count.

**Behavioural pin to add** — `engine/test/contract-equivalence.test.js`. The existing
per-descriptor `CORE_MARKERS` loop (line 73) runs **agent mode only**; add one test that
asserts the new marker survives in **both** modes for one descriptor, so a future
carve-out cannot silently drop it from inline runs. Reuse the file's existing
`DESCRIPTORS`, `FRAGMENTS`, and `hasCI` bindings.

**Cost, for the record:** the line joins every assembled block for all 9 role agents in
all 7 adapters, and becomes an undroppable `craft:prune` denylist entry by construction.

### TDD steps

1. **RED** — in `engine/test/contract-equivalence.test.js`, add:
   `'Given the core git-safety invariant, when a descriptor is assembled in agent and inline mode, then the repo-wide git-state line is present in both'`.
   Pick `DESCRIPTORS.find(d => d.id === 'planning')`, assemble twice
   (`{ execution: 'agent' }`, `{ execution: 'inline' }`), assert `hasCI(block, 'repo-wide git state')`
   on each. Expected failure: both assertions fail — `contracts/core.md` carries no such
   line yet.
2. **RED** — append `'repo-wide git state'` to `CORE_MARKERS` in
   `engine/test-helpers/contract-markers.js`. Expected failure: the per-descriptor
   `CORE_MARKERS` loops in `contract-equivalence.test.js` and `scenarios.test.js` now fail
   for every descriptor with `core marker "repo-wide git state" missing`.
3. **GREEN** — insert the line into `contracts/core.md` between the `Bounded scope` line
   and the `Model:` line. Both suites go green.
4. **REFACTOR / verify the pins that must NOT move** — run
   `node engine/bin/contracts-lint.js contracts` (exit 0), the process suite
   (`test/source-hygiene.test.js` Class A + Class B stay at zero un-allowlisted hits), and
   confirm `contract-equivalence.test.js`'s two exactly-two-lines-differ assertions still
   pass unmodified. Change nothing else.

### Gate

```
npm --prefix engine test
node --test 'test/**/*.test.js'
node engine/bin/contracts-lint.js contracts
```

### Commit

`feat(contracts): ban repo-wide git state changes by agents`

## Part 2 — the rule-vs-fact prune lens and its DoD criterion

### Context

**Depends on Part 1** — `skills/prune/SKILL.md`'s preamble reads `contracts/core.md` as a
fail-closed denylist, and this part's test asserts Part 1's line is present there.

**File to edit — `skills/prune/SKILL.md`** (104 lines). Three edit points, no others:

- **`## Inspection scope`** (lines 34-48) currently ends with one candidate question
  ("Flag drag the resolved model no longer needs: belt-and-braces guidance that duplicates
  behaviour the model already carries natively, a lint superseded by a newer mechanism, or
  prose restating what the model now does without being told."). Add the **second,
  orthogonal** question after it, in the skill's own register:

  > **Rule-vs-fact.** A unit that encodes a *decision procedure* the model can already run,
  > where stating one missing *fact* would suffice. The candidate's replacement is the fact
  > itself, stated once, at the place the procedure lived.

  State the orthogonality explicitly: the first question asks whether the guidance is
  needed at all; this one asks whether guidance is the right *shape* for what it carries.
  A unit can fail the second and pass the first.
- **`## Output — a proposal, never an action`** (lines 50-65). The fenced token block is:

  ```
  PRUNE-CANDIDATE(<unit>): <rationale>
  ```

  Keep it. Add, below it, the fixed rationale prefix for the second class (ADR-309):
  `PRUNE-CANDIDATE(<unit>): rule-vs-fact — <rationale>`. **No new token** — the sentence
  *"This token is defined **here only**"* (line 64) must stay true and stay in the file.
  The three-field candidate shape is unchanged; for a rule-vs-fact candidate the existing
  third field (`what-would-replace-the-safety-it-provided`) carries **the missing fact**.
- **`## Procedure`** steps 3 and 5 (lines 72-77) — step 3 drafts candidates, step 5 emits
  them. Extend both to cover both classes, and state that Procedure step 4 (the denylist
  refusal) applies to both **identically**: a rule-vs-fact candidate mapping to a core
  invariant is dropped before emission, exactly as a drag candidate is.

**File to edit — `docs/contributing/DOD.md`** (95 lines). Structured frontmatter today
holds 11 criteria: 2 `kind: auto` (`implementation-gate-green`, `review-gate-green`, each
with an `assert.gate`) and 9 `kind: judgment` (`tdd-followed`, `coverage-80`,
`design-adrs-authored`, `conventional-commits`, `code-quality`, `error-handling`,
`no-red-commits`, `techniques-triaged`, `architecture-gap-honest`). Every checklist line
ends with its criterion id in backticks.

- **Frontmatter:** append as the **last** entry (frontmatter order and checklist order
  already differ in this file, so appending disturbs nothing):

  ```yaml
    - id: rule-vs-fact-stated
      kind: judgment
  ```

  `engine/src/dod.js` `validateDodCriteria(criteria)` requires a non-empty string `id` and
  `kind ∈ {auto, judgment}`; only `auto` needs an `assert` object. A judgment entry with
  just `id` + `kind` validates.
- **Checklist:** add as the last bullet of `## General (every craft change)` (after the
  `error-handling` line), with the explicit N/A convention (ADR-310; the precedent for an
  honestly-N/A criterion is `architecture-gap-honest` at lines 69-71):

  > - [ ] Any new standing rule (a contract or skill line) that encodes a decision procedure
  >   states why stating one missing fact would not have sufficed; N/A when the change
  >   proposes no standing rule. `rule-vs-fact-stated`

**Pins that already exist and must keep passing:**

- `test/p20-dod.test.js` (4 tests) greps DOD.md for existence, non-emptiness, ≥1 checklist
  line, and the triaged-or-documented bar line. All survive.
- `docs/contributing/DOD.md` is in the living corpus (`scripts/living-corpus.sh` →
  `find docs/contributing -maxdepth 1 -name 'DOD.md'`) and in `test/source-hygiene.test.js`'s
  scanned set — the new criterion text carries no Class-A/Class-B token.
- `docs/contributing/DOD.md` is **prose-linted** (it is not under the skipped
  `docs/contributing/{adr,design,archive,specs,prd}` dirs). So is `skills/prune/SKILL.md`.

**New behavioural pin available for free:** `engine/bin/dod-assert.js <dod-path> <repo-root> <green-ids-csv>`
prints `{"outcomes":[{id,kind,outcome},…]}` and **exits 0 whenever the DoD is assessable**
(a non-zero exit is an operational error only — see `engine/src/dod-assert-main.js`
header). A judgment criterion's outcome is the literal string `'judgment'`.

**No prune-skill test exists today** — `PRUNE-CANDIDATE` appears nowhere under `test/` or
`engine/test/`. This part creates the first one.

### TDD steps

1. **RED** — new `test/prune-lens.test.js` (CJS, mirroring `test/no-op-token.test.js`'s
   read-and-assert shape). Four tests:
   - `'Given skills/prune/SKILL.md, when its inspection scope is read, then it carries the rule-vs-fact class'`
     — assert the file includes `Rule-vs-fact` and the phrase `decision procedure`.
   - `'Given the two prune classes must be greppable apart, when the output section is read, then the fixed rule-vs-fact rationale prefix is pinned literally'`
     — assert the file includes the literal `PRUNE-CANDIDATE(<unit>): rule-vs-fact — `
     (the whole audit story is a grep for this string).
   - `'Given no new token may be defined, when skills/ is scanned for candidate tokens, then PRUNE-CANDIDATE is the only *-CANDIDATE( form'`
     — grep `skills/` for `[A-Z-]+-CANDIDATE\(` and assert every hit's token is
     `PRUNE-CANDIDATE`; also assert `skills/prune/SKILL.md` still contains
     `is defined **here only**`.
   - `'Given the prune skill reads contracts/core.md as its fail-closed denylist, when core.md is read, then the repo-wide git-state line is present'`
     — the Part 1 → Part 2 ordering pin.
   Expected failure: the first two fail (the class and the prefix do not exist yet); the
   third and fourth pass already (they are anti-regression guards, and the fourth proves
   Part 1 landed first).
2. **RED** — in `test/p20-dod.test.js`, add two tests:
   - `'Given the rule-vs-fact criterion is asserted, when DOD.md is read, then the id appears in the frontmatter and on a checklist line'`
     — assert `- id: rule-vs-fact-stated` and a `- [ ] …` line ending in
     `` `rule-vs-fact-stated` ``.
   - `'Given the amended criteria list, when dod-assert runs over the real DOD.md, then it exits 0 and reports the new criterion as judgment'`
     — `execFileSync('node', ['engine/bin/dod-assert.js', 'docs/contributing/DOD.md', ROOT, ''])`,
     parse stdout, assert `outcomes` contains `{ id: 'rule-vs-fact-stated', kind: 'judgment', outcome: 'judgment' }`.
   Expected failure: both fail — the criterion does not exist.
3. **GREEN** — apply the three `skills/prune/SKILL.md` edits and the two
   `docs/contributing/DOD.md` edits exactly as described in Context.
4. **REFACTOR / verify** — run the process suite; run
   `bash scripts/living-corpus.sh | xargs node engine/bin/intention-lint.js` (DOD.md is in
   the corpus; it carries a `criteria:` frontmatter and no `subjects:` key, which
   `parseSubjects` returns `null` for — never an error). Confirm
   `test/source-hygiene.test.js` still reports zero hits.

### Gate

```
node --test 'test/**/*.test.js'
bash scripts/living-corpus.sh | xargs node engine/bin/intention-lint.js
```

### Commit

`feat(prune): add the rule-vs-fact lens and its DoD criterion`

## Part 3 — the run record becomes an append-only on-disk ledger

### Context

Orchestrator prose plus a file convention plus a spec page. **No `engine/src` change, no
`.gitignore` change, no `scripts/worktree-teardown.sh` change.**

**The artifact:** `.claude/craft-run-record.md`, at the repo ROOT (the worktree root —
never `${CLAUDE_PLUGIN_ROOT}`, the same rooting rule `skills/run/SKILL.md` §1c-mem already
states for `memory.ref`). Header line `# craft run record (append-only)`, then one
space-delimited record per line, prefixed by the run-id:

```
# craft run record (append-only)

orchestrator-tax-hardening resolve auto-skip: requirements — evaluated unnecessary (brief is a spec)
orchestrator-tax-hardening design GATE(design): green
orchestrator-tax-hardening validation INTENTION-DRIFT(intention): engine/src/glob.js
```

Field 1 is the run-id (the kebab-case topic slug already derived at §0 step 3 and already
the `.claude/craft-metrics.md` key — re-derivable from the same brief with no extra state,
which is what makes R1 work). Field 2 is the emitting phase (some tokens carry their own
phase, `GATE(<phase>)`/`NO-OP(<phase>)`, and some do not, `auto-skip:`/`WAIVER:`/`INTENTION-DRIFT(<page>)`,
so the column is what makes every line uniformly attributable). **One record is one line** —
a multi-line no-op justification folds to one line. The token vocabulary is unchanged.

**File to edit — `skills/run/SKILL.md`** (493 lines). Exactly three write points
(ADR-302) plus one derivation clause:

- **§0 step 4** (lines 132-134, currently: *"Open the **run record** (in-session ledger):
  seeded from `Resolution.record[]` (step 1c); every subsequent phase outcome, skip reason,
  no-op justification, probe result, and forced action is appended. It ships in the final
  summary and the PR body."*). Rewrite so the record is opened **on disk**: append the
  header when the file is absent, then flush every seeded `Resolution.record[]` line.
  State the single-writer rule here (R4): **only the orchestrator appends; no role agent
  writes this file, in any phase, including the phases that run in parallel.**
- **Phase walk step 7** (lines 275-287, `**Record outcome** in the run record …`). Add one
  clause: *append this phase's lines to the ledger before moving to the next descriptor* —
  the phase-boundary flush. Do not touch the `GATE(<phase.id>): green|red` token sentence
  or the `NO-OP(...)` paragraph; `test/gate-token.test.js` and `test/no-op-token.test.js`
  pin those strings.
- **§Done** (lines 471-492). Two things change and one must survive verbatim:
  - **Survives (R3 anti-regression):** `save(repoRoot, view, delta, deps)` is still called
    **once**, atomically, and the sentence *"Writes are buffered all run and flushed once
    here, so a phase that blocked mid-run leaves the store unchanged"* must remain.
  - **Changes (ADR-303):** the delta's source is now the ledger's lines carrying this run's
    run-id, not "the run-record-buffered observations".
  - **Adds (the ordering ADR-301 forces):** the **derivation** (a read) happens at the last
    point the worktree is alive — *before* `integrate` runs `scripts/worktree-teardown.sh`
    — and the **save** (the write) stays exactly one atomic call at `Done`. Query and
    command separate; no ADR moves. Also state the two live `Done` cases: teardown did not
    run (the tree is alive, the residual flush lands, the ledger holds the whole run) and
    teardown ran (the ledger's on-disk tail is the last pre-teardown boundary; the
    `integrate` line and anything `Done` appends exist in-session only, where they already
    ship — in the final summary and the PR body).
  - **Failure posture:** a failed ledger append is surfaced in-session and the run
    continues; it is **not** recorded into the ledger (that would be circular). Same
    posture as a failed `save` (ADR-120).
- **Downstream consumers narrow, they do not change.** The final summary and the PR body's
  "Provenance & verification" trailer (`skills/documentation/SKILL.md` step 3, lines 45-54)
  take **only the lines whose run-id prefix is this run's**.

**`skills/run/SKILL.md` has a hard pin:** `test/craft-root-shim.test.js` asserts **exactly
6** occurrences of `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/` in it. The ledger append is a
plain shell append (`>>`) to a repo-root path — it introduces **no** plugin-root
invocation, so the count stays 6. It also asserts the prose mention
``at the repo ROOT (the worktree/checkout root — NEVER `${CLAUDE_PLUGIN_ROOT}`, hard``
survives verbatim (`PRESERVED_PROSE`) — do not reflow that sentence.

**File to edit — `skills/integrate/SKILL.md`** step 3 (lines 28-40, the
`worktree-teardown.sh` invocation). Add a prose pointer only: the memory delta must
already have been derived from the ledger before this step runs, because teardown removes
the tree and the ledger inside it. **Prose only** — this file is pinned at exactly 1
shimmed invocation.

**New file — `docs/contributing/specs/run-record.md`.** The ledger's own doc. It must
carry: the file shape and header; the run-id = topic slug rule; the three write points and
the single-writer rule; the lifetime (run-local, gitignored by the existing `.claude/*`
rule, dies with the worktree — R1 is durability against *context* loss, never against
*worktree* loss); the derivation-before-teardown ordering; the failure posture; and the
two inherited edges — **run-id collision** (a genuine re-run in the same worktree reuses
the slug and a resume then reads the earlier run's lines as its own; inherited from
`.claude/craft-metrics.md`, which already keys on the same slug) and **resume double-`Done`**
(a second `save` is convergent, not corrupting, because `save` decay-merges against the
run-start `MemoryView` and entries are advisory). Include the ledger-vs-store table:

| Property | Ledger (`.claude/craft-run-record.md`) | Store (`.claude/craft-memory.md`) |
|---|---|---|
| Lifetime | run-local, gitignored, dies with the worktree | committed, travels with the repo |
| Write cadence | incremental, once per phase boundary | buffered all run, flushed once at `Done` |
| Write mode | append-only, never rewritten | whole-file temp-write + rename |
| Decay / eviction | none — history is the point | decay-merged, size-capped |
| Failure posture | warning in-session, run continues | recorded warning, never a blocker |
| Concurrency | single writer; one run per worktree | no locking, last-flush-wins |

Give the page **no `subjects:` frontmatter** (deliberate — the same choice
`docs/contributing/specs/memory.md` and `policy.md` make), so it claims no source paths and
`assert-fresh` raises no drift for it. The page may cite ADR numbers — the core contract's
provenance ban covers source and test only — but the **tests** this part adds must carry
none.

**Coupled pin — `test/living-corpus.test.js`.** `scripts/living-corpus.sh` enumerates
`docs/contributing/specs/*.md`, and the test pins the corpus as an **exact set** of 25
entries plus a `sort -c` ordering check. Adding the spec page **requires** adding
`'docs/contributing/specs/run-record.md'` to `EXPECTED` **in this same commit**, placed so
the set stays LC_ALL=C-sorted in the file's own reading order (between `policy.md` and
`telemetry.md`).

**Coupled pin — `test/p22-memory.test.js`.** It already asserts the three `!.claude/…`
re-include lines (`!.claude/craft-memory.md`, `!.claude/craft-metrics.md`, `!.claude/`)
via `grepQX` (`grep -qx`). Add the **negative**: no `.gitignore` line re-includes the run
record. A positive pin would have been the committed option's test; this is its inverse,
and it is what stops the ruling being reversed by a one-line drive-by later.

**`.gitignore` for reference (do not edit):**

```
11 !.claude/
12 .claude/*
13 !.claude/craft-memory.md
14 !.claude/craft-metrics.md
15 !.claude/workflow.md
```

Exactly three names are re-included; `.claude/*` covers everything else.

**Prose-lint applies** to `skills/run/SKILL.md` and `skills/integrate/SKILL.md`;
`docs/contributing/specs/run-record.md` is exempt (under `docs/contributing/specs/`) but
**is** scanned by source-hygiene Class A/B — no `mutation`, no `gh`.

### TDD steps

1. **RED** — new `test/run-record.test.js` (CJS). Read
   `skills/run/SKILL.md` once and assert, as separate tests:
   - the ledger path `.claude/craft-run-record.md` appears in **all three** write regions,
     so one mention cannot satisfy all of them. Slice the file on its own `^## ` headings:
     region 1 = start → `## Phase walk`; region 2 = `## Phase walk` → `## Cross-phase invariants`;
     region 3 = `## Done` → EOF. (`## Done` occurs exactly once, at line 471.)
   - §Done still states `save(repoRoot, view, delta, deps)` is called **once** and still
     carries the buffered-and-flushed-once sentence (R3 anti-regression);
   - §Done states the delta is derived from the ledger's run-id lines **and** that the
     derivation happens before `integrate` runs the teardown script (the one invariant the
     run-local ruling makes fragile);
   - the ledger path is not the memory store path — assert `.claude/craft-run-record.md`
     and `.claude/craft-memory.md` are distinct literals and both appear (R2);
   - `scripts/worktree-teardown.sh` contains **no** reference to the run record (the
     negative pin: no ledger-preservation step creeps in);
   - `skills/integrate/SKILL.md` states the delta derivation precedes teardown;
   - `docs/contributing/specs/run-record.md` exists, is non-empty, documents the
     absent-file/header case, the present-file/append case, the run-id-collision edge and
     the double-`Done` resume edge.
   Expected failure: every assertion fails except the `worktree-teardown.sh` negative —
   the prose and the spec page do not exist yet.
2. **GUARD (green on arrival, by design)** — extend `test/p22-memory.test.js` with
   `'Given the ledger is run-local, when .gitignore is checked, then no re-include names the run record'`
   — assert `grepQX('!.claude/craft-run-record.md', GITIGNORE) === false`. It passes
   immediately: it is the inverse of the test the committed option would have needed, and
   its job is to stop the ruling being reversed by a one-line drive-by later. Land it
   anyway; a guard that is never written is a guard that never fires.
3. **RED** — extend `test/living-corpus.test.js`'s `EXPECTED` set with
   `'docs/contributing/specs/run-record.md'`. Expected failure: the set-equality assertion
   fails (`living-corpus.sh` does not yet emit it).
4. **GREEN** — write `docs/contributing/specs/run-record.md`; apply the three
   `skills/run/SKILL.md` edits and the `skills/integrate/SKILL.md` pointer.
5. **REFACTOR / verify the pins that must NOT move** — `test/craft-root-shim.test.js`
   still counts 6 for `skills/run/SKILL.md`, 1 for `skills/integrate/SKILL.md`, and the
   `PRESERVED_PROSE` sentence is verbatim; `test/gate-token.test.js` and
   `test/no-op-token.test.js` still pass; `bash scripts/docs-structure-lint.sh docs/contributing`
   and `--audience docs` pass; `.gitignore` and `scripts/worktree-teardown.sh` are
   byte-unchanged (`git diff --no-ext-diff --stat` names neither).

### Gate

```
node --test 'test/**/*.test.js'
bash scripts/living-corpus.sh | xargs node engine/bin/intention-lint.js
bash scripts/docs-structure-lint.sh docs/contributing
```

### Commit

`feat(run): persist the run record as an append-only on-disk ledger`

## Part 4 — digest the validation boundary with a findings filter bin

### Context

Two surfaces, one mechanism: a contract line that binds the triager agent, and a skill step
that stops the orchestrator reading raw technique output.

**Contract — `contracts/harness-exec.md`** (3 lines today):

```
1 A tool runs; the AI triages findings: resolve each (the resolution the technique names) or prove it benign and document it inline — never simply accept a finding.
2 Never weaken a test or rule to clear a finding.
3 Gate-green before commit.
```

Add a fourth line, same imperative register:

```
Technique output goes to a file; only the change-scoped, structured slice is read into context — never the raw run output.
```

No `retrieval` substring, no Class-A/B token, no prose-lint ban word. Pin it by adding a
marker to `PHASE_EXPECTATIONS['harness-exec']` in `engine/test/contract-equivalence.test.js`
(currently `['triages', 'Never weaken']`) → add `'change-scoped'`. That test loops every
descriptor whose `contract` names the bundle, so the pin covers `validation` and
`architecture` in one edit.

**The bin — mirror the `normalize-findings` archetype exactly.**

`engine/bin/normalize-findings.js` (the shim to copy, 7 lines):

```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { main } from '../src/normalize-findings-main.js';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr, readStdin: () => readFileSync(0, 'utf8') }));
}
```

`engine/src/normalize-findings-main.js` (the `main` + `fail` shape to mirror):

```js
function fail(message, io) { io.stderr.write(`normalize-findings: ${message}\n`); return 2; }
export function main(argv, io) {
  const filePath = argv[0] || null;              // empty string falls through to stdin
  let raw; try { raw = filePath ? readFileSync(filePath, 'utf8') : io.readStdin(); } catch (err) { return fail(err.message, io); }
  let findings; try { findings = normalizeFindings(raw); } catch (err) { return fail(err.message, io); }
  io.stdout.write(JSON.stringify(findings, null, 2) + '\n');
  return 0;
}
```

New files:

- `engine/bin/filter-findings.js` — the same 7-line shim over `../src/filter-findings-main.js`.
- `engine/src/filter-findings-main.js` — `export function main(argv, io) → number`; exit 0
  on success, exit 2 with a `filter-findings: <message>` stderr line on any input error
  (same `fail()` shape). Argv contract: `filter-findings [<findings-path>] --scope "<spec>"`.
  Parse `--scope <value>` out of argv (exactly one occurrence; **absent → exit 2**
  `missing --scope`); the remaining positional, if any, is the input path, else read stdin
  via `io.readStdin()`. Output bytes: `JSON.stringify(findings, null, 2) + '\n'` — byte-
  identical framing to `normalize-findings`, so `normalize-findings … | filter-findings …`
  composes.
- **Predicate lives in `engine/src/findings.js`**, not a new module — it already owns the
  canonical `Finding` type and `normalizeFindings`, and keeping the mutation-covered
  surface in one file is the point.

`engine/src/findings.js` today exports exactly one symbol, `normalizeFindings(raw) → Finding[]`,
over `@typedef {{ file: string, line: number, severity: string, finding: string, fix?: string, status?: string }} Finding`.
Add (and export) three things beside it, in the file's existing JSDoc-first style:

```
@typedef {{ file: string, start: number, end: number }} ScopeRange     // JSDoc, beside the Finding typedef
const SCOPE_ENTRY_PATTERN = /^(.+):(\d+)-(\d+)$/u;   // greedy head: the LAST colon separates path from range
export function parseScopeSpec(spec) → ScopeRange[]  // '' → []; throws on a malformed entry
export function filterFindings(findings, ranges) → Finding[]
```

(Shapes, not literal source — `→` denotes the return type.)

Rules, all of them load-bearing:

- `parseScopeSpec('')` → `[]` (an empty scope is the honest "nothing changed").
- Split on `,`; each entry must match `SCOPE_ENTRY_PATTERN`; `start >= 1` and `end >= start`.
  Anything else **throws** `malformed scope entry: "<entry>"` — never a silent drop (a
  silently dropped finding is a swallowed error).
- `filterFindings` keeps a finding when some range has `range.file === finding.file` and
  `range.start <= finding.line <= range.end` (inclusive on both ends). Order-preserving.
  A finding whose `file` matches no entry is dropped.
- **No `git` invocation inside the bin** (R7) — the caller supplies the ranges.
- **No technique name anywhere** (R6) — `test/source-hygiene.test.js` Class A bans them
  under `engine/src`.

**Skill — `skills/validation/SKILL.md`**, Procedure step 1, `mode: triage` branch
(lines 132-139). Today: *"when the run lands, filter findings to the change's lines only
(pre-existing-line findings are out of scope), then spawn **craft:harness-triager** with:
the filtered findings; …"*. Replace the in-thread filter sentence with: redirect the
technique's `run` output to a `mktemp` file **outside the worktree** (an in-tree
`.craft-*` sibling can be swept into a commit by one of the agents running in parallel
during `documentation` — the very hazard Part 1 closes — and an out-of-tree temp needs no
ignore rule and no cleanup contract; `contracts/producer.md:5` throwaway discipline), then
digest at the boundary with exactly this two-invocation pipe:

```bash
node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/normalize-findings.js" "$out" \
  | node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/filter-findings.js" --scope "<spec>"
```

where `<spec>` is the comma-joined `<file>:<start>-<end>` list built from the **same**
`git diff -U0` walk the `Scope` bullet (lines 119-125) already runs for `per-hunk`. Read
**only** that stdout into context; pass it to `craft:harness-triager` exactly as today.
The other payload the triager receives — reviewer-predicted suspected-benign harness
findings, passed verbatim from the review phase — is already bounded, already structured,
and already normalized upstream: untouched.

**Coupled pin — `test/craft-root-shim.test.js`.** `{ file: 'skills/validation/SKILL.md', count: 1 }`
(today's single occurrence is the `dod-assert.js` invocation at line 48). The pipe above
adds **two** → set the count to **3** in the same commit. The pin is exact
(`countOccurrences` via split-join), so whatever the authored step actually lands, the
number must match it.

**Pins that must keep passing:** `test/no-op-token.test.js` pins four `NO-OP(validation…)`
literals in this skill (all in the Preamble, untouched); `engine/test/normalize-findings-bin.test.js`
pins `normalize-findings`' exact stdout bytes (R8 — `normalizeFindings` is not modified);
`engine/bin/contracts-lint.js contracts` must stay green.

**Test files to create** (ESM, mirroring the siblings byte-for-byte in shape):

- `engine/test/filter-findings-main.test.js` — unit, `sut = main`, injected io from
  `engine/test-helpers/capture-io.js` (`makeCaptureIo()` gives `stdout.joined()` /
  `stderr.joined()`; add `io.readStdin = () => { throw … }` for file-path mode, exactly as
  `normalize-findings-main.test.js` does). Tmp files via `mkdtempSync` + an `after()` sweep.
- `engine/test/filter-findings-bin.test.js` — spawn smoke via `spawnSync(process.execPath, [bin, …], { input, encoding: 'utf8' })`,
  stdin and file-path modes, exact stdout bytes.

### TDD steps

1. **RED (contract)** — add `'change-scoped'` to `PHASE_EXPECTATIONS['harness-exec']` in
   `engine/test/contract-equivalence.test.js`. Expected failure: every descriptor carrying
   the `harness-exec` bundle fails with `marker "change-scoped" missing`.
2. **GREEN (contract)** — add the fourth line to `contracts/harness-exec.md`.
3. **RED (predicate)** — new tests in `engine/test/findings.test.js` (it already exists and
   owns `normalizeFindings`'s unit tests) for `parseScopeSpec` + `filterFindings`:
   empty spec → `[]`; single range; multi-range single file; multiple files; a finding on
   `start`, on `end`, one line below `start`, one line above `end`; a finding in an unlisted
   file → dropped; malformed entries (`a.js:3`, `a.js:x-9`, `a.js:9-3`, `a.js:0-3`) → throws
   naming the entry. **Property lens** (a parser/matcher pair): for any `Finding[]` and any
   range set the output is a subset of the input, order-preserving, and
   `filterFindings(filterFindings(x, r), r)` deep-equals `filterFindings(x, r)`
   (idempotence). Expected failure: `parseScopeSpec`/`filterFindings` are not exported.
4. **GREEN (predicate)** — implement both in `engine/src/findings.js`.
5. **RED (main + bin)** — `engine/test/filter-findings-main.test.js`: stdin mode is excluded
   in-process (opening fd 0 conflicts with the runner — the sibling documents this), so
   drive the file-path branch, the `--scope` parsing branches, and the error branches:
   valid input+scope → exit 0 and exact canonical bytes; empty findings input → `[]` and
   exit 0; empty `--scope ""` → `[]` and exit 0; missing `--scope` → exit 2 +
   `filter-findings: ` stderr + empty stdout; malformed range → exit 2 + clean message;
   nonexistent input path → exit 2, clean, no stack trace.
   `engine/test/filter-findings-bin.test.js`: stdin mode and file-path mode, exact stdout
   bytes, plus one end-to-end `normalize-findings | filter-findings` pipe proving the
   framing composes. Expected failure: the bin and the main module do not exist.
6. **GREEN (main + bin)** — write `engine/src/filter-findings-main.js` and
   `engine/bin/filter-findings.js`.
7. **RED (skill)** — extend `test/craft-root-shim.test.js`'s `TARGET_FILES` entry for
   `skills/validation/SKILL.md` from 1 to 3. Expected failure: the count assertion fails
   (the skill still has one).
8. **GREEN (skill)** — rewrite the `mode: triage` branch as described in Context.
9. **REFACTOR / verify** — `engine/test/normalize-findings-bin.test.js` and
   `engine/test/normalize-findings-main.test.js` pass **unchanged** (R8);
   `node engine/bin/contracts-lint.js contracts` exit 0;
   `test/source-hygiene.test.js` Class A still zero (R6);
   `test/no-op-token.test.js` still green. No `engine/stryker.conf.json` edit — the
   `engine/src/**/*.js` glob already covers the new module, and `engine/bin` is never
   mutated, which is why the logic must not live there.

### Gate

```
npm --prefix engine test
node --test 'test/**/*.test.js'
node engine/bin/contracts-lint.js contracts
```

### Commit

`feat(validation): filter harness findings to the change scope at the boundary`

## Part 5 — plan-lint moves to an engine bin and warns on cross-part overlap

### Context

**The whole lint moves** (ADR-308) — schema check included, not the schema in awk and the
overlap in a second bin.

**Current implementation — `scripts/plan-lint.sh`** (31 lines, awk). Its observable
contract, which the move must reproduce **byte-for-byte** on every non-new path:

| Condition | Stream | Exact text | Exit |
|---|---|---|---|
| file missing | stderr | `plan-lint: no such file: <path>` | 2 |
| part missing sections | stdout | `plan-lint: part "<full ## Part heading line>" missing: <names, comma-space-joined, in REQUIRED order>` | (accumulates) |
| no `## Part` found | stdout | `plan-lint: no "## Part" sections found — not a craft plan.` | 2 |
| ≥1 bad part | stdout | `plan-lint: <n> part(s) violate the schema. The plan phase cannot close.` | 2 |
| all parts OK | stdout | `plan-lint: <n> part(s) OK — every part carries its context block.` | 0 |

`REQUIRED = "### Context|### TDD steps|### Gate|### Commit"`. A part starts at a line
matching `^## Part`; a section counts when a line matching `^### ` **starts with** the
required string (`index($0, R[i]) == 1`).

**Preserve the prefix-match quirk.** `^## Part` matches by prefix, so a heading such as
`## Partition …` is treated as a part and fails the schema — observed while linting this
very plan, which is why its second heading reads `## Seams kept, order changed`. Reproduce
that behaviour exactly; narrowing it to `^## Part\b` is a behaviour change, not a cleanup,
and belongs to a different decision.

**One deliberate behaviour change:** today a missing argument dies in bash
(`${1:?usage: …}`, exit 1). After the move, argv[0] absent → stderr
`plan-lint: usage: plan-lint <plan-file>` and **exit 2**. State it in the test name; no
caller passes zero arguments.

**New files:**

- `engine/bin/plan-lint.js` — the 5-line shim shape used by `intention-lint`/`manifest-lint`:

  ```js
  #!/usr/bin/env node
  import { fileURLToPath } from 'node:url';
  import { main } from '../src/plan-lint-main.js';
  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
  }
  ```

- `engine/src/plan-lint-main.js` — `export function main(argv, io) → number`, pure over
  argv + the filesystem, module-level `const EXIT_OK = 0; const EXIT_INVALID = 2;` like
  `intention-lint-main.js`.

**`scripts/plan-lint.sh` becomes the `scripts/manifest-lint.sh` shim, verbatim shape:**

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT/engine/bin/plan-lint.js" "$@"
```

Both existing callers invoke the script **by path** and are untouched:
`skills/planning/SKILL.md:33` (`"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/plan-lint.sh" <plan-path>`)
and `skills/implementation/SKILL.md:15`. `test/craft-root-shim.test.js` keeps
`skills/planning/SKILL.md` at 2 — no skill edit in this part. `shellcheck scripts/*.sh`
runs in `ci.sh`; the manifest-lint shape is already clean.

**Hard constraint — the resolved gate string does not move.** `pipeline/default.yml:62`
(`gate: plan-lint`) is unchanged, and `engine/test/scenarios.test.js:210` (SC1) and `:231`
(SC5) pin `gateOf('planning') === 'plan-lint'` **by value**.
`adapters/pi/test/run.test.js:399-405` passes `plan-lint` through unchanged. No fixture
re-tunes.

**The new advisory (ADR-306/307), and why the detector is the hard part.**

- **Declared path = a backticked span inside a part's `### Context` block that resolves to
  a repo FILE.** The house precedent is `engine/src/intention-lint-main.js:18`, whose
  `BACKTICK_PATTERN` is a global regex matching an opening backtick, a captured run of
  non-backtick characters, and a closing backtick — consumed via `matchAll` over the SoT
  blockquote. Reuse that pattern shape locally — do **not** import from `intention-lint-main.js`
  (that module owns the intention corpus concern and is claimed by
  `docs/contributing/specs/intention.md`; importing it would drag that page into this
  change's drift set).
- **Block boundaries:** a part's `### Context` block runs from its `### Context` heading to
  the next line matching `^### ` or `^## `. Only that block is scanned — not `### TDD steps`,
  not prose above the first part.
- **Directory spans are not paths.** A span ending in `/`, or resolving to a directory, is
  ignored. This closes the single largest false-positive source by construction (nearly
  every part in this repo names `engine/src/`), not by a waiver.
- **Rooting (an implementation choice this plan makes, stated so it is reviewable):**
  resolve spans against the **plan file's repo root**, computed by walking up from
  `dirname(resolve(planPath))` to the first ancestor containing a `.git` entry (file **or**
  directory — a worktree's `.git` is a file), falling back to the plan file's own directory
  when none is found. This keeps `main` pure over its argument (no `process.cwd()`
  dependency, so the new tests are hermetic and tmp-fixture-friendly) and works unchanged
  inside a craft worktree.
- **Output — one warning line per overlapping path**, sorted lexicographically by path for
  determinism, on **stdout**, with the exit code unchanged:

  ```
  plan-lint: cognitive-locality warning — `engine/src/findings.js` declared in Part 1, Part 4. Merge the parts or state why they are separate.
  ```

  The design renders this example across two lines; R9 says *one warning line*, so it lands
  as one line. Part labels: `^## Part\s+(\S+)` → `Part <token>`; when the heading does not
  match, use the heading text with the leading `## ` stripped.
- **Advisory means advisory:** warnings never change the exit code, there is no strict
  flag, and `templates/plan.md`'s `### Context` schema is untouched (ADR-307) so every
  existing plan stays conforming.

**Test files to create:**

- `engine/test/plan-lint-main.test.js` — unit, `sut = main`, injected io from
  `engine/test-helpers/capture-io.js`, fixtures written into `mkdtempSync` dirs (create a
  `.git` marker file in the tmp root when a test needs span resolution, and real files for
  the spans to resolve against).
- `engine/test/plan-lint.bin.test.js` — spawn smoke, the `<name>.bin.test.js` half of the
  archetype pair (`intention-lint.bin.test.js` is the model: `spawnSync(process.execPath, [BIN, …], { encoding: 'utf8' })`).
  Bin tests belong here, not in the repo-root suite — bins are never mutated, so relocating
  them on a coverage rationale is void.
- `test/plan-lint.test.js` — the **shim** pin (CJS, `test/design-lint.test.js` is the model:
  `execFileSync('bash', [SCRIPT, FIXTURE])`), proving the two path-invoking callers are
  unaffected by the move. Fixtures `test/fixtures/plan-good.md` and
  `test/fixtures/plan-missing-section.md` (siblings of the existing `design-good.md` /
  `design-missing.md`). Keep fixture prose free of prose-lint ban words.

**No `engine/stryker.conf.json` edit** — `engine/src/**/*.js` already covers the new module.

### TDD steps

1. **RED (schema parity)** — `engine/test/plan-lint-main.test.js`, one test per row of the
   observable-contract table above, asserting the **exact** strings and exit codes against
   tmp fixtures, plus the new missing-argv case. Expected failure: `../src/plan-lint-main.js`
   does not exist (module resolution error).
2. **RED (bin smoke)** — `engine/test/plan-lint.bin.test.js`: a schema-valid fixture exits 0
   with the `part(s) OK` line on stdout; a schema-invalid fixture exits 2 with the
   `violate the schema` line. Expected failure: `engine/bin/plan-lint.js` does not exist,
   so the spawn fails. Written now, with step 1, so the module and its bin go green together.
3. **GREEN (schema parity)** — write `engine/src/plan-lint-main.js` reproducing the awk
   contract exactly, and `engine/bin/plan-lint.js` as the shim. Steps 1 and 2 go green.
4. **RED (overlap advisory)** — extend `engine/test/plan-lint-main.test.js`:
   - two parts whose `### Context` blocks both backtick the same existing file → **one**
     warning line naming the path and both part labels; exit code **unchanged** (0 for an
     otherwise-valid plan);
   - two parts with disjoint paths → no warning;
   - three parts sharing one path → one warning naming all three;
   - a single-part plan → no warning, **and** assert the detector found ≥1 declared path
     (a non-vacuous guard: a broken detector must not pass by finding nothing);
   - a `### Context` naming a path in prose **without** backticks → no warning (ADR-307's
     deliberate under-report);
   - two parts both backticking the same **directory** span (`engine/src/`) → no warning;
   - a backticked span that resolves to nothing → no warning;
   - a schema-invalid plan that also overlaps → still exit 2 with the existing message (no
     regression on the gate).
   Expected failure: no warning is emitted at all.
5. **GREEN (overlap advisory)** — implement the block slicer, the backtick extractor, the
   file-resolution predicate, the cross-part intersection, and the sorted warning emission.
6. **RED (shim)** — `test/plan-lint.test.js`, three tests through
   `bash scripts/plan-lint.sh`: the good fixture exits 0 printing `part(s) OK`; the
   missing-section fixture exits 2 printing `plan-lint:`; **and** a zero-argument
   invocation exits **2** with `plan-lint: usage:` on stderr. The first two are
   characterization tests that must stay green across the swap (they are what prove the
   two path-invoking callers are unaffected). The third is the genuine RED: today's
   `${1:?usage: …}` exits **1** with a bash-authored message, so it fails until the shim
   lands.
7. **GREEN (shim)** — replace `scripts/plan-lint.sh` with the four-line exec shim; all
   three go green.
8. **REFACTOR / verify** — `engine/test/scenarios.test.js` SC1/SC5 gate-string assertions
   pass unchanged (R10); `shellcheck scripts/*.sh` clean;
   `bash scripts/plan-lint.sh docs/contributing/plan/orchestrator-tax-hardening.md` exits 0.
   **Calibration check (ADR-307 tuning evidence):** run the lint over every
   `docs/contributing/plan/*.md` and report the warning count in the run record — a detector
   that warns on most historical plans is mis-tuned regardless of what the fixtures say.
   Report it there rather than editing the accepted design doc: an implementation part does
   not amend a ratified artifact.

### Gate

```
npm --prefix engine test
node --test 'test/**/*.test.js'
shellcheck scripts/*.sh
```

### Commit

`feat(plan-lint): warn on cross-part context overlap from an engine bin`

## Part 6 — fan-out advisory at pipeline resolution

### Context

One `records.push` in a function that already emits advisory records (ADR-312), plus the
cost basis in its owning doc (R15) and one coherence sentence in the review skill.

**File to edit — `engine/src/resolve.js`** (383 lines). The relevant shape:

- `const REVIEW_PHASE_ID = 'review';` (line 121).
- `function deriveReviewPlan(harness)` (line 130) — pure projection returning
  `{ passes, stop_rule }`; `passes` defaults to 1 when not an integer. **Do not change its
  return shape** (R14: `deriveReviewPlan` still returns `{ passes, stop_rule }` unchanged).
- `resolvePipeline(defaults, manifest, opts)` builds `record` at lines 322-329 from five
  edit-record sources, then computes `baseEffective` (lines 341-349, where the review
  descriptor gains `harness.reviewPlan`) and `effective` (lines 350-353), then
  `resolveGatesAndWaivers(...)` → `gateRecords`, and returns
  `record: [...record, ...gateRecords]` on the success path (line 378) and on the
  `floorErrors` early return (line 371).

Add, beside `deriveReviewPlan`:

```js
/** Advisory ceiling on the resolved reviewer fan-out; above it, resolution records one line. */
const FAN_OUT_ADVISORY_THRESHOLD = 8;

/**
 * Zero or one advisory line about the resolved reviewer fan-out. Never changes a value.
 * @param {object[]} effective
 * @returns {string[]}
 */
function buildFanOutRecords(effective) { … }
```

It reads the `review` descriptor out of `effective`, takes `harness.dimensions` (an array)
and `harness.reviewPlan.passes` (an integer), returns `[]` unless both are present and the
product **exceeds** `FAN_OUT_ADVISORY_THRESHOLD`, and otherwise returns one line naming the
product and its two factors, e.g.:

```
fan-out: review resolves to 12 reviewers (4 dimensions × 3 passes) — advisory only; nothing is capped. Cost basis: docs/guides/customizing.md.
```

Call it once, after `effective` is computed, and fold it into the `record` of **both**
returns that already carry `gateRecords` (the `floorErrors` early return and the success
return), appended after `gateRecords` so the ordering is deterministic. The measured token
number lives in the guide, not in `engine/src` — a metrics figure embedded in engine source
decays silently; the line names the product, which is what the tests pin.

**Resolution facts that make the threshold behave:** `pipeline/default.yml` ships
`dimensions: [code, security, tests, perf]` and `passes: 1` (product 4 — the shipped default
never warns). `engine/src/edits.js` deep-merges `harness` one level
(`ALLOWED_PHASE_OVERRIDE_FIELDS` includes `harness`), so a manifest setting only
`passes: 3` keeps the default four dimensions and resolves to 12.
`engine/src/manifest-harness.js:90-95` validates `passes` as any positive integer — no
ceiling, which is why the advisory exists.

**What must NOT change (R14, and the negatives the placement decision rests on):**

- `engine/src/manifest-lint-main.js` → `validateManifest(parsed, { fileExists, readFile })`
  keeps its `{ ok, errors }` return; **no sub-validator signature moves**.
  `test/manifest-lint.test.js` passes unchanged.
- `test/examples-lint.test.js` still sees exit 0 and `valid.` on every
  `examples/*/workflow.md`; `examples/review-harness/workflow.md` resolves to
  3 dimensions × 1 pass = 3, well under 8, so it stays silent either way.
- The advisory changes no resolved value: `effective[]`, `gateDecisions`, and every phase's
  resolved `harness`/`reviewPlan` are deep-equal between a resolution that emits it and one
  that does not — the advisory may appear **only** in `record[]`.

**Docs — `docs/guides/customizing.md`.** The `--harness <phase>.<knob>=<value>` section runs
from line 299 (`#### --harness …`) to line 336; the knob table is at lines 309-317. Add the
cost note there (R15): this repo's own committed telemetry puts a reviewer spawn at a pooled
median near 92,500 tokens across 72 records, so eight reviewers is roughly 740,000 tokens
for round one, and the phase passes a million once the default `max_cycles: 3` adds its
fix-delta rounds (measured median 58,052 each); the advisory fires above eight — double the
shipped default of four — and caps nothing. Say plainly why craft's case is not the "2-4
agents" case: craft's reviewers are read-only, independently-oriented lenses over the same
diff (`contracts/harness-read.md:1`), so independence is the feature and cost is the only
thing the advisory speaks to. **This file is scanned by source-hygiene Class A and B** —
no `mutation`, no bare `gh`/`github` (its one `file / gh /` hexagon label is allowlisted
line-agnostically; leave it alone).

**Docs — `skills/review/SKILL.md`** Procedure step 1 (lines 29-36) states the
`dimensions.length × reviewPlan.passes` count is "engine-emitted and binding". Add one
sentence: a resolved product above eight also lands an advisory record in the run record;
it never changes this count. **Prose only** — `test/craft-root-shim.test.js` pins this file
at exactly 1 shimmed invocation.

**Test home:** `engine/test/resolve.test.js` (ESM), `// ─── record contents ───` section at
line 458. It builds manifests inline as plain objects (see the backlog-record tests at
lines 484-531) — no new fixture file is needed.

### TDD steps

1. **RED** — in `engine/test/resolve.test.js`, add under the record-contents section:
   - `passes: 1` with default dimensions (product 4) → no record line matching `/^fan-out:/`;
   - `{ phases: { review: { harness: { passes: 3 } } } }` (product 12) → **exactly one**
     `/^fan-out:/` line, and it names `12 reviewers`;
   - `{ phases: { review: { harness: { passes: 3, dimensions: ['code'] } } } }` (product 3)
     → none;
   - **threshold boundary pinned by value:** `{ passes: 2 }` over the four default
     dimensions (product 8) → silent; `{ passes: 3, dimensions: ['code','security','tests'] }`
     (product 9) → warns;
   - **R14 inertness proof** — resolve the product-12 manifest once and assert the advisory
     changed nothing else: `result.effective.map(d => d.id)` equals the SC1 golden id list
     already defined at the top of the file; the review descriptor's
     `harness.reviewPlan` deep-equals `{ passes: 3, stop_rule: 'low-only' }` (unchanged
     projection — `deriveReviewPlan` is module-private, so read it off the resolved
     descriptor, never by import); `gateDecisions` for `review` is still `<gates.phase>`;
     and the string `fan-out:` appears in **no** returned field other than `record` —
     assert it against `JSON.stringify({ effective, gateDecisions, waivers, errors })`.
   Expected failure: every advisory assertion fails — no `fan-out:` line is ever produced.
2. **GREEN** — add `FAN_OUT_ADVISORY_THRESHOLD`, `buildFanOutRecords`, the single call
   site, and the two return-site folds in `engine/src/resolve.js`.
3. **GREEN (docs)** — add the cost-basis paragraph to `docs/guides/customizing.md` (R15's
   owning doc) and the one coherence sentence to `skills/review/SKILL.md`. No test pins
   guide prose; what pins this part is the pair of negatives in step 4.
4. **REFACTOR / verify** — the two negatives the placement decision rests on:
   `test/manifest-lint.test.js` passes unchanged (`validateManifest`'s `{ ok, errors }`
   shape is untouched) and `test/examples-lint.test.js` still sees exit 0 and `valid.` on
   every `examples/*/workflow.md`. Then `engine/test/scenarios.test.js` SC1's
   `assert.deepEqual(result.record, ['default-skip: requirements …', 'default-skip: architecture …'])`
   (line ~194) must still pass: the shipped default resolves to 4, so no advisory line is
   appended. `test/craft-root-shim.test.js` counts unchanged for `skills/review/SKILL.md`.
   `test/source-hygiene.test.js` still zero.

### Gate

```
npm --prefix engine test
node --test 'test/**/*.test.js'
bash scripts/living-corpus.sh | xargs node engine/bin/intention-lint.js
```

### Commit

`feat(resolve): record a fan-out advisory above eight reviewers`

## Part 7 — Frame 5 in the concepts guide, and the four-to-five count edits

### Context

**Depends on Parts 3, 4 and 5.** ADR-314 binds the frame's mapping rows to mechanisms this
change **ships**; the guide's own rule (line 20) is that every row names *"a real, current
mechanism and the doc that owns it, never an aspiration"*. The three rows are exactly:
the on-disk run-record ledger (Part 3), the validation boundary digest (Part 4), and the
cognitive-locality plan warning (Part 5). Do not write this part before they have landed.

**File — `docs/guides/concepts.md`** (211 lines). Structure: title (line 1), intro
(lines 3-13), `## How to read this guide` (line 15), `## Frame 1 — Karpathy: write the loop,
not the prompt` (line 25), `## Frame 2 — Böckeler: the harness taxonomy` (line 67),
`## Frame 3 — configuration layers` (line 96), `## Frame 4 — Osmani: inner loop, outer loop,
the Verdict` (line 141), `## Rosetta stone` (line 186), `## Sources` (line 204).

- **New `## Frame 5`** between the end of Frame 4 and `## Rosetta stone`: narrative plus a
  mapping table. **Reuse the header row all four existing frame tables already use,
  verbatim** (lines 52, 80, 123, 170): `| External concept | craft mechanism (real) | Owning doc / key |`
  — do not invent new column names. Each row's third cell links the owning doc with a
  relative path from `docs/guides/` (e.g. `[../../skills/validation](../../skills/validation)`),
  matching the neighbouring rows' link style.
  The frame's three claims: subagents exist to protect the orchestrator's working memory;
  context pollution taxes every later turn even with window to spare; stating one missing
  fact usually beats encoding a decision procedure. Rows name only the three shipped
  mechanisms above. Meet the guide's admission bar explicitly — Frame 1's closing paragraph
  at **line 64**: *"it has to change what you'd build next, not only what you'd call what
  already exists"* — this frame produced three mechanisms that did not exist before it.
- **New Rosetta row** in the table at lines 190-202, whose header (line 191) is a
  *different* one: `| External term | craft mechanism | Where configured |`. Match it.
- **Sources** (lines 204-211) — see the blocker below.

**The four→five count edits — the exact occurrence list, verified by grep:**

| File:line | Current text | Action |
|---|---|---|
| `docs/guides/concepts.md:1` | `# craft concepts — four frames on why it's shaped this way` | → five |
| `:3` | `four external ways of talking about agentic delivery` | → five |
| `:10` | `four external frames below are lenses` | → five |
| `:21` | `Read the four` (frames in order, wraps to line 22) | → five |
| `:188` | `already fluent in one of the four frames` | → five |
| `:206` | `The four frames above are grounded in these six URLs` | → five frames; the URL count depends on the blocker below |
| `README.md:53` | `craft onto four frames you may already know` | → five |
| `README.md:201` | `why craft is shaped this way, in four familiar frames` | → five |

**Do NOT touch `docs/guides/concepts.md:101`** — *"Beneath all four sits the invariant
floor"* counts **configuration layers**, not frames. A blanket four→five sweep corrupts it;
the test in step 1 guards it.

`docs/README.md` carries **no** frame count (its rows read "concepts, customization guide,
model-class matrix") — verified, so it needs no edit despite appearing in the design's seam
row.

**BLOCKER (raise it, do not invent around it).** The frame's source URL — Fowler,
*The Orchestrator Tax* — appears **nowhere** in this repo: not in the design doc, not in
`BACKLOG.md`, not in any ADR. `## Sources` states its URLs are *"cited verbatim rather than
paraphrased"*, so a fabricated link is a fabricated citation. Before writing the Sources
entry, escalate `{ Part 7, "Frame 5's Sources entry needs the verbatim source URL, which no
committed artifact carries", options }` with these three:
(1) the orchestrator supplies the URL from the run's original brief and the list becomes
seven URLs; (2) the Sources list gains a non-URL citation (author + title) and the URL count
sentence stays at six; (3) the Sources entry is deferred to a follow-up and Frame 5 ships
citing the frame by name in its narrative. The step-1 test is written to stay green under
any of the three — it pins **consistency** between the stated count word and the actual
bullet count, never a specific number.

**Corpus facts:** `docs/guides/concepts.md` is already enrolled in the living corpus
(`scripts/living-corpus.sh` line 20; pinned in `test/living-corpus.test.js`'s `EXPECTED`)
and carries **no** `subjects:` frontmatter by decision, so `intention-lint` is unaffected
either way and no new corpus entry appears. `README.md` **is** in
`test/source-hygiene.test.js`'s scanned set, with a URL-only allowlist filter for the
canonical repo address — keep any new prose free of bare `gh`/`github` tokens.
`docs/guides/concepts.md` and `README.md` are both prose-linted.
`scripts/readme-drift.sh` → `engine/bin/readme-drift.js` guards phase names, the README
manifest snippet, and telemetry claims — **not** frame counts; it needs no change, and
`test/readme-drift.test.js`'s live-tree pass must stay green.

### TDD steps

1. **RED** — new `test/concepts-frames.test.js` (CJS), in the spirit of
   `test/readme-drift.test.js` but self-contained:
   - `'Given the concepts guide, when its frame headings are counted, then there are five'`
     — count lines matching `/^## Frame /m` in `docs/guides/concepts.md`, assert `5`.
   - `'Given the frame count, when README.md states it in prose, then the stated word matches the heading count'`
     — map `{4:'four',5:'five',6:'six'}`, assert `README.md` contains
     `` `${word} frames` `` and `` `${word} familiar frames` `` and contains neither
     `four frames` nor `four familiar frames`.
   - `'Given the concepts guide states its own frame count, then every stated count matches the heading count'`
     — assert `concepts.md` contains no remaining `four frames` / `four external frames` /
     `four external ways` / `one of the four frames`.
   - `'Given the configuration-layer sentence counts layers and not frames, then it is preserved verbatim'`
     — assert `concepts.md` still contains `Beneath all four sits the invariant floor`
     (the guard against an over-broad sweep).
   - `'Given the Sources section, when its stated URL count is compared with its bullets, then they agree'`
     — slice from `## Sources` to EOF, count lines matching `/^- <https?:/`, extract the
     number word preceding `URLs` in the section's prose, assert they agree.
   - `'Given Frame 5 ships, then its mapping rows name only mechanisms that exist'`
     — assert the Frame 5 section (sliced from `## Frame 5` to the next `## `) mentions
     `.claude/craft-run-record.md`, `engine/bin/filter-findings.js`, and
     `engine/bin/plan-lint.js`, and assert each of those three paths exists on disk (the
     non-aspirational-row guard, and the mechanical proof that Parts 3-5 landed first).
   Expected failure: the heading count is 4; the README word assertions fail; the Frame 5
   slice does not exist. The layer-sentence and Sources-consistency assertions pass already
   (they are anti-regression guards).
2. **BLOCKER GATE** — raise the Sources-URL blocker above before writing `## Sources`.
   Do not proceed past this point with an invented URL.
3. **GREEN** — write `## Frame 5`, add the Rosetta row, apply the eight count edits from
   the table (and only those), and resolve `## Sources` per the blocker's answer.
4. **REFACTOR / verify** — `test/living-corpus.test.js` unchanged;
   `bash scripts/living-corpus.sh | xargs node engine/bin/intention-lint.js` green over the
   amended page; `test/readme-drift.test.js` live-tree pass green;
   `test/source-hygiene.test.js` zero hits; `bash scripts/docs-structure-lint.sh docs/guides`
   and `--audience docs` green.

### Gate

```
node --test 'test/**/*.test.js'
bash scripts/living-corpus.sh | xargs node engine/bin/intention-lint.js
bash scripts/docs-structure-lint.sh docs/guides
```

### Commit

`docs(concepts): add the orchestrator-tax frame`

## Phase-boundary gate

After the last part, once for the whole change:

```
bash scripts/ci.sh
```

R16: every enumerated suite, shellcheck, pipeline-lint, contracts-lint, backlog-lint,
design-lint, docs-structure-lint (×3), intention-lint over the living corpus, and the
hygiene stub/prose lints over the touched diff.
