# Design — orchestrator-tax hardening

> Brief: six related changes, one PR — protect the orchestrator's own working memory the
> way craft already protects every role agent's: an on-disk run record, a digest at the
> validation boundary, a cognitive-locality plan warning, a rule-vs-fact prune lens, a
> concurrent-writer git-safety floor, and a fan-out cost advisory.
> Status: draft → self-reviewed ×3 → accepted → revised against ADRs 300-314
> (fourteen candidates adopted as recommended; DC-2 ratified *against* the recommendation —
> the ledger is run-local, not committed, and this revision folds that ruling through).

## Context

### The frame and what craft already does with it

The source frame (Fowler, *The Orchestrator Tax*) makes three claims: subagents exist to
protect the orchestrator's working memory; context pollution taxes every later turn even
with window to spare; and stating one missing fact usually beats encoding a decision
procedure.

craft already implements most of that frame, and the mechanisms are real, not aspirational:

| Frame claim | Existing craft mechanism |
|---|---|
| Subagents protect the orchestrator's memory | fresh-context role agents per phase — `pipeline/default.yml` `role:` per descriptor; `agents/*.md` |
| The artifact, not the transcript, is the handoff | `contracts/core.md:2` (`Artifact handoff: @@ARTIFACT_HANDOFF@@`), expanded per execution mode by `engine/src/contract.js` |
| Pre-chew so the callee never re-explores | `contracts/producer.md:3`; enforced mechanically by `scripts/plan-lint.sh` |
| Thread bounded state, not a transcript | `contracts/harness-read.md:4`; `skills/review/SKILL.md` step 4 |
| Digest at the boundary | `engine/bin/normalize-findings.js` → `engine/src/findings.js`, called from `skills/review/SKILL.md` step 2 |

The six items below are the gaps that frame exposes. They are independent in mechanism but
share three surfaces (contracts, lints, the run record), which is why they ship as one PR.

### The subsystems each item touches (verified against the tree, not the brief)

**(1) Run record.** `skills/run/SKILL.md` §0 step 4 opens the run record as an
**in-session ledger**, seeded at step 1c from `Resolution.record[]`. Every later phase
outcome (`GATE(<phase.id>): green|red`, `NO-OP(<phase>):`, `auto-skip:`, `WAIVER:`,
`POLICY(...)`, `INTENTION-DRIFT(...)`, `STUB-FOUND(...)`, …) is appended in-session. It
ships in the final summary and in the PR body (`skills/documentation/SKILL.md` step 3
"Provenance & verification" trailer). Nothing writes it to disk.

The on-disk shape to mirror is `.claude/craft-metrics.md` (ADR-119): a single append-only
markdown file, header line `# craft per-phase metrics (append-only)`, then one
space-delimited record per line keyed by run-id:
`<run-id> <phase-id> tokens=<n> duration_ms=<n> cache=na`. It currently holds 308 records
across 27 run-ids. It is committed because `.gitignore:11-16` re-includes it under the
global `.claude/` exclusion (ADR-118):

```
!.claude/
.claude/*
!.claude/craft-memory.md
!.claude/craft-metrics.md
!.claude/workflow.md
```

Exactly three names are re-included; everything else under `.claude/` stays ignored by
line 13. ADR-301 rules that the ledger does **not** join them: the metrics file's *shape* is
mirrored, its *committability* is not, and no `.gitignore` line ships. The block above is
therefore quoted here as the reason no edit is needed, not as a template to extend.

The memory store's flush discipline is the constraint to design against.
`skills/run/SKILL.md` §Done: `save(repoRoot, view, delta, deps)` is called **once**,
atomically, with `delta` derived from "the run-record-buffered observations". ADR-120
makes a failed save a warning, never a blocker, with no locking (last-flush-wins). The
atomicity property being protected: a phase that blocks mid-run leaves the store
unchanged.

**When `Done` runs, relative to teardown — checked, because the run-local ruling makes it
load-bearing.** `## Done` follows the phase walk, and the walk's last descriptor is
`integrate` (`pipeline/default.yml:165`), whose step 3 runs
`scripts/worktree-teardown.sh` (`skills/integrate/SKILL.md:28-33`). So the worktree is gone
before `Done` executes. The repo's own history confirms it rather than inferring it: the
last six runs each landed their store write as a separate `chore(craft): append <slug> run
memory + metrics` commit on `main`, *after* the feature's squash-merge — a commit only
authorable from the main checkout. With a committed ledger this was invisible, because the
main checkout carried the file too. Run-local, it is not, and item 1's design says exactly
what that forces.

**(2) Digest at the validation boundary.** `skills/validation/SKILL.md` Procedure step 1,
`mode: triage` branch: *"when the run lands, filter findings to the change's lines only
(pre-existing-line findings are out of scope), then spawn **craft:harness-triager**"*. The
filtering is in-thread, so raw technique output reaches the orchestrator's context before
anything narrows it. `review` has the symmetric bin and `validation` does not.

`engine/bin/normalize-findings.js` is a 7-line shim over `engine/src/normalize-findings-main.js`
exporting `main(argv, io)`; the logic lives in `engine/src/findings.js` as
`normalizeFindings(raw) → Finding[]` where
`Finding = { file, line, severity, finding, fix?, status? }`. Tests split
`engine/test/normalize-findings-main.test.js` (unit) + `engine/test/normalize-findings-bin.test.js`
(spawn smoke). Mutation scope is `engine/src/**/*.js` only (`engine/stryker.conf.json`) —
bin shims are never mutated, which is why logic must not live in `engine/bin`.

Hard constraint on any new engine module: `test/source-hygiene.test.js` Class A bans the
tokens `stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise`
anywhere under `engine/src`, `contracts`, `skills`, `agents`, `templates`, `pipeline`. The
filter bin therefore **cannot** contain technique-specific parsing.

`contracts/harness-exec.md` is three lines and is injected into the executing-harness phase
agent (`craft:harness-triager`) — not into the orchestrator. `engine/bin/contracts-lint.js`
rejects any bundle file containing the case-insensitive substring `retrieval`
(`engine/src/contracts-lint-main.js:38`).

**(3) Plan-lint cognitive locality.** `scripts/plan-lint.sh` is a 31-line awk program that
checks part structure only: `REQUIRED="### Context|### TDD steps|### Gate|### Commit"`,
scanning `^## Part` boundaries, exit 2 on any part missing a section. It is the resolved
`planning` gate string — pinned **by value** as the literal `plan-lint` at
`engine/test/scenarios.test.js:210` and `:231`. `templates/plan.md` describes `### Context`
as free prose ("exact file paths and symbol name-paths to touch; current signatures being
changed; helpers/fixtures/describe blocks to extend"). Real plans in
`docs/contributing/plan/` quote paths as backticked tokens, and legitimately repeat a
shared path across parts (e.g. `scripts/ci.sh` counter lines in
`docs/contributing/plan/activate-dod-and-live-doc-lints.md`).

**(4) Prune lens.** `skills/prune/SKILL.md` is a standalone, read-only, advisory skill with
one candidate question: *"drag the resolved model no longer needs"*. Its output shape is
three fields (`unit`, `rationale`, `what-would-replace-the-safety-it-provided`) emitted as
`PRUNE-CANDIDATE(<unit>): <rationale>`; the skill states the token *"is defined **here
only**"*. Its preamble reads `contracts/core.md` as a fail-closed denylist.
`docs/contributing/DOD.md` carries a structured `criteria:` frontmatter (2 `kind: auto`,
9 `kind: judgment`), each checklist line naming its criterion id, plus a non-asserted
`_Reference (…)_` block below the checklist. DOD.md is in the intention living corpus
(`scripts/living-corpus.sh`) and in `test/source-hygiene.test.js`'s scanned set.

**(5) Concurrent-writer git safety.** `contracts/core.md:7` — *"Bounded scope; work only in
the given working directory"* — bounds *where* an agent works, not *what repo-wide git
state it may mutate*. The overlap is real today: `skills/validation/SKILL.md` step 1 backs
a `run-style: background` technique and writes `<root>/.craft-validation.lock`;
`skills/documentation/SKILL.md` states *"Runs in parallel with the validation phase's
background run"* and spawns `craft:docs-writer` and `craft:backlog-ticker`, both of which
commit, while `craft:harness-triager` commits its resolutions in the same worktree.

The existing destructive-git surface is **binding-level, not contract-level**:
`adapters/copilot/src/deny-tool-args.js` denies `shell(git reset --hard)`,
`shell(git push)`, `shell(git clean -fd)`, `shell(git branch -D)` at launch time, and
`docs/contributing/specs/gate.md:105` records that this layer is prefix-matched
defence-in-depth, bypassable by an interposed global option. There is no contract-level
line at all. Counter-fact the design must respect: `git reset --hard` is also the
**reset-on-red mechanism** — `adapters/aider/src/vcs-posture.js` `reconcileGateOutcome`
returns `{ action: 'reset', target: preTurnHead }` and the *runner/orchestrator* performs
the reset (the module header says so explicitly).

What a new `contracts/core.md` line breaks, checked: `engine/bin/contracts-lint.js` only
requires the file to be a non-empty regular file with no `retrieval` substring — a new line
passes. `engine/test/contract-equivalence.test.js` asserts `CORE_MARKERS` presence and that
**exactly two** lines differ between agent and inline assembly (the two `@@…@@` carve-outs)
— a plain new line adds no marker and no carve-out, so it passes.
`engine/test/fixtures/contracts/core.md` is a deliberately simplified 7-line fixture that
already diverges in wording from the real file; it needs no sync. `test/source-hygiene.test.js`
**does** scan `contracts/` for Class A tokens — so the line may not contain the word
`mutation` (or `mutant`). Cost side: the line is injected into every spawn of all 9 role
agents across all 7 adapters, and it becomes an undroppable denylist entry for
`craft:prune` by construction.

**(6) Fan-out consolidation.** `pipeline/default.yml:91-92` ships
`dimensions: [code, security, tests, perf]` and `passes: 1`. `skills/review/SKILL.md`
step 1 fans out `dimensions.length × reviewPlan.passes` reviewers and states the count is
"engine-emitted and binding — the walk MUST spawn exactly that many reviewers per
dimension, no more, no fewer". `engine/src/manifest-harness.js:90-95` validates `passes`
as any positive integer — no ceiling.

The brief's placement is where the code disagrees. `engine/src/manifest-lint-main.js` →
`validateManifest(parsed, { fileExists, readFile })` returns `{ ok, errors }` — there is
**no warnings channel**, and manifest-lint never reads `pipeline/default.yml`, so it cannot
see the resolved product. A manifest that sets only `passes: 3` resolves to 12 reviewers,
but manifest-lint sees `passes: 3` and no dimensions at all. The resolved product is
computed in `engine/src/resolve.js` `deriveReviewPlan(harness)`, which already emits
advisory `records[]` lines that the orchestrator seeds the run record with
(`skills/run/SKILL.md` §1c). Placement is settled there by ADR-312.

### Where the brief and the code disagree — the code wins

1. **Item 2 (a).** A `contracts/harness-exec.md` line binds the *triager agent* and any
   inline execution of the phase — it does **not** bind the orchestrator, which is the
   session. The in-thread filtering the brief objects to lives in
   `skills/validation/SKILL.md` Procedure step 1. Both surfaces need the change: the
   contract line states the invariant for the agent side; the skill step is what actually
   stops the orchestrator reading raw output.
2. **Item 6.** "An advisory manifest-lint warning on the *resolved* product" is not
   implementable at manifest-lint as it stands (no warnings channel, no access to the
   pipeline defaults). Settled at pipeline resolution instead (ADR-312).
3. **Item 5 wording.** The brief's phrase "repo-wide git state mutation" cannot be used
   verbatim: `mutation` is a Class-A banned token and `contracts/` is scanned.
4. **Item 5 verb set.** `reset` cannot be banned without acknowledging that reset-on-red
   *is* a `git reset --hard` — performed by the runner, not by an agent. Settled by
   ADR-311: the ban is unconditional and carries no exemption clause, because the contract
   binds agents and the runner is not one.

### Sizing corrections

- **Item 5 is smaller than framed** — one contract line plus its wording constraints and a
  presence test. No engine code.
- **Item 1 is larger than framed** — the ledger needs a file shape, a lifetime, a
  single-writer rule, a resume path, and an explicit restatement of the memory-save
  atomicity boundary. ADR-301 settles the lifetime as run-local, which *removes* the
  `.gitignore` work the draft budgeted for and *adds* one ordering constraint against
  `worktree-teardown.sh` (item 1, **Derivation vs. save**).
- **Item 6 is larger than framed at manifest-lint** (a new warnings channel through
  `validateManifest` and every one of its ~12 sub-validators' call sites) and **small at
  pipeline-resolve** (one `records.push` in an existing function) — ADR-312 takes the
  latter.
- **Item 3's hard part is not the lint, it is the detector** — "declares a file path" in a
  prose block is a heuristic, and this repo's own plans contain legitimate cross-part path
  repetition.
- **Item 4 is roughly as framed**, with one addition: the DOD question needed a home,
  because DOD.md is asserted on *every* change while this question only applies to changes
  that propose a contract line. ADR-310 puts it in the asserted checklist with an explicit
  N/A convention.

## Requirements

- **R1 — the run record survives a context reset inside a live worktree.** After each phase
  boundary, the run record's content for the current run is readable from disk without any
  session state. A new orchestrator instance, given the same brief, resolves the same run-id
  and reads back every line the run has written so far. Each record is one line,
  run-id-prefixed, so the ledger stays appendable and greppable; the final summary and the PR
  body take only the lines carrying this run's run-id.
  **Bound on the claim (ADR-301):** the ledger is run-local. `.claude/*` already ignores it,
  no `.gitignore` change ships, and `scripts/worktree-teardown.sh` destroys it with the tree.
  R1 is durability against *context* loss, never against *worktree* loss.
  *What the ruling costs, plainly:* no requirement here rested on the teardown case alone, so
  none is dropped — but R1's reach is genuinely smaller than the draft claimed. The draft
  called surviving teardown R1's strongest case; that case is now not served at all, and a run
  whose tree has been torn down is back to the pre-change posture of having nothing to read.
  What remains is the case the frame actually names: a reset mid-run, in a tree that still
  exists.
- **R2 — the ledger is separate from the memory store.** No run-record content is written
  to `.claude/craft-memory.md`, and no memory entry is written to the ledger. The two files
  are independently readable and independently deletable, and they now differ in lifetime as
  well as in cadence: the store is committed (ADR-118), the ledger is not (ADR-301).
- **R3 — memory-save atomicity is unchanged.** `save(...)` is still called exactly once,
  at `Done`. A run that blocks mid-phase leaves `.claude/craft-memory.md` byte-identical to
  its pre-run content, while the ledger holds that run's partial lines. The `delta` that
  `save` consumes is derived from the ledger (ADR-303); because the ledger is run-local, the
  *derivation* reads it at the last point the worktree is alive, while the *write* stays one
  atomic call at `Done` — see item 1, **Derivation vs. save**.
- **R4 — one writer.** Only the orchestrator appends to the ledger. No role agent writes
  it, in any phase, including the phases that run in parallel.
- **R5 — validation technique output does not enter the orchestrator's context.** The
  `mode: triage` branch writes the technique's output to a file and reads back only the
  structured, change-scoped slice. Verifiable: `skills/validation/SKILL.md` Procedure
  step 1 names a file redirect and a bin invocation in place of the in-thread filter
  sentence, and `contracts/harness-exec.md` carries the matching invariant line.
- **R6 — the filter bin is technique-agnostic.** The new module under `engine/src`
  contains no technique name, no tool-specific parser, and passes
  `test/source-hygiene.test.js` Class A unchanged.
- **R7 — the filter bin is byte-deterministic and testable without a repo.** Given a
  findings input and a scope spec, output is a pure function of the two; no `git`
  invocation inside the bin.
- **R8 — `normalize-findings` is unchanged.** Its existing stdout bytes stay
  byte-identical (`engine/test/normalize-findings-bin.test.js` pins exact output).
- **R9 — plan-lint warns on cross-part context overlap, and only warns** (ADR-306). Given a
  plan where two or more parts' `### Context` blocks declare a common file path — a
  backticked span resolving to a repo file (ADR-307) — plan-lint emits one warning line
  naming the path and the parts. Its exit code for an otherwise schema-valid plan is
  unchanged from today, with no strict mode and no justification-line requirement.
- **R10 — the `planning` gate string is unchanged.** `resolvePipeline` still yields the
  literal `plan-lint` for `phaseId === 'planning'` (`engine/test/scenarios.test.js`).
- **R11 — the prune skill carries the rule-vs-fact class.** `skills/prune/SKILL.md`
  documents the second candidate class ("a decision procedure where stating one missing
  fact would suffice"), emitted through the existing `PRUNE-CANDIDATE(<unit>)` token. No
  new token is defined anywhere in the repo.
- **R12 — the DoD carries the matching authoring question as an asserted criterion**
  (ADR-310): a `kind: judgment` entry in DOD.md's `criteria:` frontmatter plus its checklist
  line naming that id, with an explicit N/A convention for changes that propose no standing
  rule. A non-asserted reference paragraph does not satisfy R12.
- **R13 — one new `contracts/core.md` line bans repo-wide git state mutation from any
  agent**, unconditionally and with no exemption clause (ADR-311), containing neither the
  substring `retrieval` (contracts-lint) nor the tokens `mutation`/`mutant` (source-hygiene
  Class A), and adding no new carve-out marker (contract-equivalence's
  exactly-two-differing-lines assertion holds).
- **R14 — the fan-out advisory is advisory.** It never changes a resolved value, never
  fails a lint, never caps `passes` or `dimensions`, and the phase still spawns exactly
  `dimensions.length × passes` reviewers. It lands as one record in pipeline resolution's
  existing advisory `records[]` (ADR-312) and fires only above a product of eight (ADR-313),
  so the shipped default never warns.
- **R15 — the advisory carries its own cost basis.** The warning text or its owning doc
  cites this repo's measured per-reviewer token cost, not an external agent-count
  heuristic.
- **R16 — the gates stay green.** `bash scripts/ci.sh` passes: every enumerated suite,
  shellcheck, pipeline-lint, contracts-lint, backlog-lint, design-lint, docs-structure-lint,
  intention-lint over the living corpus, and the hygiene stub/prose lints over the touched
  diff.

## Design

### Item 1 — the run record becomes an append-only on-disk ledger

**Shape (ADR-300).** Mirror `.claude/craft-metrics.md`'s *shape* exactly — its
committability is deliberately not mirrored (ADR-301, below). One append-only markdown file
at `.claude/craft-run-record.md` under the repo ROOT (the worktree root — never
`${CLAUDE_PLUGIN_ROOT}`, same rooting rule as `memory.ref` in `skills/run/SKILL.md`
§1c-mem), with a header line and one record per line prefixed by the run-id:

```
# craft run record (append-only)

orchestrator-tax-hardening resolve auto-skip: requirements — evaluated unnecessary (brief is a spec)
orchestrator-tax-hardening design GATE(design): green
orchestrator-tax-hardening decisions NO-OP(decisions): every choice pre-decided — …
orchestrator-tax-hardening validation INTENTION-DRIFT(intention): engine/src/glob.js
```

The run-id is the kebab-case topic slug already derived at `skills/run/SKILL.md` §0 step 3
and already used as the metrics key — so it is re-derivable from the same brief with no
extra state, which is what makes R1 work. The second field is the emitting phase: some
tokens carry their own phase (`GATE(<phase>)`, `NO-OP(<phase>)`) and some do not
(`auto-skip:`, `WAIVER:`, `INTENTION-DRIFT(<page>)`), so the column is what makes every
line uniformly attributable.

**One record is one line.** Line-oriented storage is what makes the ledger appendable and
greppable, so a multi-line no-op justification folds to one line — the same discipline
`.claude/craft-metrics.md` already lives under. This is a real constraint on the phases
that today write prose paragraphs into the in-session record, and it is a *narrowing* of
what may be written, not a change to the token vocabulary.

**Lifetime — run-local (ADR-301).** `.gitignore:13` (`.claude/*`) already ignores anything
new under `.claude/`, and the ledger is not added to the three re-includes on lines 14-16.
**No `.gitignore` change ships anywhere in this PR.** Stated at their real size, the
consequences are:

- The ledger survives a context reset for exactly as long as the worktree does. It does not
  survive `scripts/worktree-teardown.sh` (`integrate` step 3), which removes the tree and the
  ledger inside it.
- `worktree-teardown.sh` is untouched and gains **no** ledger-preservation step. Preserving
  the ledger past teardown is out of scope, not an omission.
- The ledger never appears in a diff, so no craft PR carries ledger noise — the recurring
  cost the committed option would have imposed on every run, including runs whose subject has
  nothing to do with it. That is the trade the user ratified.
- A fresh worktree starts with no ledger at all, which narrows the run-id-collision case
  below to a single worktree hosting two runs of the same topic.

**Write points (ADR-302).** Three, all orchestrator-owned; role agents never write the file,
so the concurrent-writer hazard item 5 closes is not re-created in the file that records it:

1. **§0 step 4 (open).** Append the header if the file is absent, then flush every seeded
   `Resolution.record[]` line from §1c.
2. **Phase walk step 7 (record outcome).** The existing step already says "Record outcome
   in the run record". It gains one clause: *append this phase's lines to the ledger before
   moving to the next descriptor*. This is the phase-boundary flush.
3. **§Done.** Flush any residual lines *if the worktree still exists*, then run the memory
   save and the metrics append unchanged. The run-local ruling splits this into two live
   cases, and both are behaviour a reader must be able to predict:
   - **Teardown did not run** — the run stopped at `propose`, or the `teardown` action was
     declined (`ask` is its default, `docs/contributing/specs/policy.md`). The tree is alive,
     the flush lands, and the ledger holds the whole run.
   - **Teardown ran** — the ledger's on-disk tail is the last phase boundary before it. The
     `integrate` outcome line, and anything `Done` would append, exist in-session only —
     where they already ship, in the final summary and the PR body. A ledger that ends one
     phase short is the honest consequence of the ruling, not a defect to engineer around:
     by the time those lines exist, the tree whose loss they would insure against is gone.

**Interaction with the memory store — the part that must be explicit.**

| Property | Ledger (`craft-run-record`) | Store (`.claude/craft-memory.md`) |
|---|---|---|
| Lifetime | run-local — gitignored, dies with the worktree (ADR-301) | committed, travels with the repo (ADR-118) |
| Write cadence | incremental, once per phase boundary | buffered all run, flushed once at `Done` |
| Write mode | append-only (`>>` semantics), never rewritten | whole-file temp-write + rename (ADR-117) |
| Decay / eviction | none — history is the point | decay-merged, size-capped (ADR-122) |
| Failure posture | warning surfaced in-session, run continues (never recorded *into* the failing file) | recorded warning, never a blocker (ADR-120) |
| Concurrency | single writer (R4); one run per worktree | no locking, last-flush-wins (ADR-120) |

The two never touch. Concretely:

- The ledger flush **never** calls `save`, and `save` **never writes** the ledger file. One
  direction does exist and is deliberate: the delta derivation *reads* ledger lines and hands
  `save` a value (ADR-303, two bullets down). No write ever crosses between the two files. A
  mid-run block therefore leaves the store byte-identical (R3) while the ledger holds the
  partial run — which is precisely the respawn material R1 asks for.
- **A failed ledger append is not recorded in the ledger** (that would be circular): it is
  surfaced to the user in-session and kept in the in-session record, and the run continues.
  Same posture as a failed `save` (ADR-120), for the same reason — the ledger is a cost
  mechanism, and a write failure must not fail delivery work.
- **Derivation vs. save — the ordering ADR-301 forces.** `delta` derivation at `Done`
  currently reads "the run-record-buffered observations"; ADR-303 makes the single source the
  ledger's lines for this run-id, so a resumed run derives the same delta from the same
  bytes. That is *source-of-truth only* — it does not move the save point, does not add a
  second save, and does not make the store incremental.
  The run-local ruling adds one constraint the committed option hid. `Done` runs after the
  walk, and the walk's last phase tears the worktree down (Context, *When `Done` runs*), so at
  `Done` the ledger file no longer exists. Only one reading keeps all three ratified decisions
  true at once — ADR-300's `.claude/` rooting, ADR-301's run-local lifetime with an untouched
  teardown script, and ADR-303's ledger-derived delta: the **derivation** (a read) happens at
  the last point the worktree is alive, before `integrate` runs teardown, and the **save** (the
  write) stays exactly one atomic call at `Done`. Query and command separate; no ADR moves.
  Every alternative breaks a ratified decision — moving `save` earlier breaks ADR-303/R3 and
  ADR-120, preserving the file past teardown breaks ADR-301, rooting the ledger outside the
  worktree breaks ADR-300.
  Stated so the planning phase cannot miss it: **ADR-301's consequence sentence says "`save`
  runs before teardown". Against the shipped walk that is not true as written** — `save` runs
  after it. The accurate restatement, which changes no decision, is *the derivation runs
  before teardown*. (The same sentence cites the delta decision as 302; it is 303.) This is
  called out rather than quietly patched because it is the one place the deviation reaches
  past wording into behaviour.
- **Resume edge:** a run that reaches `Done` twice (once before a reset, once after)
  would call `save` twice. Because `save` decay-merges against the run-start `MemoryView`
  and entries are advisory (ADR-116), the second save is convergent, not corrupting. It is
  still an edge the test matrix pins.
- **Cross-worktree:** each craft run works in its own git worktree, and an untracked ledger
  exists only in the tree that wrote it — so a second run in a second worktree cannot see, or
  interleave with, the first one's file. Under the run-local ruling this is closed by
  construction rather than merely improbable; the run-id prefix remains as belt-and-braces.
- **Run-id collision:** the run-id is the topic slug, so a genuine *re-run* of the same
  feature reuses it. A resume then reads the earlier run's lines as its own. This is
  inherited, not introduced — `.claude/craft-metrics.md` already keys on the same slug and
  already carries repeat records for one id. Run-local narrows it further: it can only bite
  when one worktree hosts two runs of the same topic, since a fresh tree starts empty. It is
  correct for the case R1 exists to serve (resume) and over-broad for a deliberate re-run in
  place; the honest handling is to state it in the ledger's own doc rather than invent a
  second id nothing else uses.

**Downstream consumers narrow, they do not change.** The run record already ships in the
final summary and in the PR body's "Provenance & verification" trailer
(`skills/documentation/SKILL.md` step 3). Both consumers take **only the lines whose run-id
prefix is this run's**. The draft justified that filter by "otherwise the first PR after the
ledger lands carries every prior run's outcomes" — under ADR-301 that scenario is no longer
the driving one, because a fresh worktree starts empty. The filter is still required, on two
grounds that survive: ADR-303 derives the memory delta by run-id from the same lines, and the
same-worktree resume/re-run case above puts more than one run's lines in one file. It is a
filter, not a reshaping: the token vocabulary of the lines is untouched.

### Item 2 — digest at the validation boundary

**Two surfaces, one mechanism.**

*Contract line* — `contracts/harness-exec.md` gains a fourth line, in the existing
imperative register of the other three:

> Technique output goes to a file; only the change-scoped, structured slice is read into
> context — never the raw run output.

(Contains no `retrieval`, no Class-A token.)

*Skill step* — `skills/validation/SKILL.md` Procedure step 1, `mode: triage` branch,
becomes: redirect the technique's `run` output to a file; invoke the filter bin with that
file plus the scope spec derived from the same `git diff -U0` walk that already produces
the per-hunk ranges in the `Scope` bullet; read only the bin's stdout into context; pass
that to `craft:harness-triager` as it does today.

The output file is a `mktemp` path **outside the worktree**, not an in-tree
`.craft-*` sibling of the run-lock. Two reasons, both concrete: an in-tree file can be
swept into a commit by one of the agents running in parallel during `documentation`
(the very hazard item 5 addresses), and an out-of-tree temp needs no `.gitignore` line and
no cleanup contract. This follows `contracts/producer.md:5`'s throwaway discipline.

**The bin.** Follows the `normalize-findings` archetype exactly:

- `engine/bin/filter-findings.js` — a shim of the same 7-line shape (`readStdin` via
  `readFileSync(0,'utf8')`, `process.exit(main(argv, io))` guarded by the
  `process.argv[1] === fileURLToPath(import.meta.url)` check).
- `engine/src/filter-findings-main.js` — `export function main(argv, io) → number`, exit 0
  on success, exit 2 with a `filter-findings: <message>` stderr line on any input error
  (same `fail()` shape as `normalize-findings-main.js`).
- `engine/src/findings.js` — gains the pure predicate. It already owns the canonical
  `Finding` type and `normalizeFindings`; the filter is the same concern
  (`inScope(finding, ranges) → boolean` plus the array filter), so it belongs here rather
  than in a new module. This keeps the mutation-covered surface in one file.

**Input contract (ADR-304).** The bin consumes a canonical `Finding[]` — i.e. it composes *after*
`normalize-findings`, never instead of it. That is what keeps R6 satisfiable: shaping a
specific technique's output into `Finding[]` is the technique's own business (its `run`
command or its declared `triage-procedure`), not the engine's. `engine/src` stays free of
technique names, and `skills/validation` is free to pipe
`run > out.txt && normalize-findings out.txt | filter-findings --scope "<spec>"`.

**Scope spec (ADR-305).** A single comma-joined string of `<file>:<start>-<end>` entries, mirroring
the per-hunk `--mutate "fileA:r1,fileB:r2"` form this repo already documents in
`.claude/workflow.md` — one string argument, never repeated flags (the repeated-flag
foot-gun is already recorded there). A finding is in scope when its `file` matches an entry
and its `line` falls inside that entry's inclusive range. No `git` call inside the bin
(R7).

**Edge behaviour.** Empty findings input → `[]` and exit 0 (symmetric with
`normalizeFindings('')`). Empty scope spec → the honest reading is "nothing changed, so
nothing is in scope" → `[]`, exit 0. A finding whose `file` matches no entry → dropped. A
malformed range entry → exit 2 with a clean message, never a silent drop (a silently
dropped finding is a swallowed error).

**What item 2 does not cover.** The other payload the triager receives — the
reviewer-predicted suspected-benign harness findings, passed verbatim from the review
phase's advisory notes — is already bounded, already structured, and already normalized
through `normalize-findings` upstream. It is untouched here.

### Item 3 — cognitive-locality plan-lint

**What it detects.** For each `## Part`, collect the set of *declared paths* from its
`### Context` block. Warn once per path that appears in two or more parts' sets, naming the
path and the parts:

```
plan-lint: cognitive-locality warning — `engine/src/findings.js` declared in Part 1, Part 2.
Merge the parts or state why they are separate.
```

**Why a warning and not a failure (ADR-306).** Two implementer agents rebuilding the same mental
model is a *cost*, not a defect, and the later part's pre-chewed block going stale is a
*risk*, not a certainty. This repo's own plans contain a legitimate instance: two parts
both editing `scripts/ci.sh` counter lines, deliberately split because they land as
separate atomic commits. A blocking check would have failed that plan. The posture is
settled advisory: a warning on stdout, exit code unchanged, no strict flag.

**Why the detector is the hard part.** `### Context` is prose by construction
(`templates/plan.md`), and prose quotes paths for three different reasons: paths the part
*edits*, paths the part *reads for reference*, and paths named inside a quoted code
snippet. Only the first class implies overlap. The house precedent for extracting
structure from prose is `engine/src/intention-lint-main.js`, which reads backticked spans
out of the `> SoT` blockquote via `BACKTICK_PATTERN = /`([^`]+)`/g` and treats only those
as pointers. The same discipline applies here: a *declared path* is a backticked span that
resolves to a repo path (ADR-307). An unbackticked path is invisible to the check, on
purpose — the detector under-reports rather than over-reports, which is the right bias for an
advisory warning, and `templates/plan.md`'s `### Context` schema is left alone so every
existing plan stays conforming.

**Where it lives (ADR-308).** Cross-part set intersection is awkward in awk and, more
importantly, `scripts/*.sh` is outside the mutation scope (`engine/stryker.conf.json` mutates
`engine/src/**/*.js`, among others). The lint moves to the house archetype shared by
`intention-lint`, `stub-lint`, `prose-lint`, and `manifest-lint`: `engine/bin/plan-lint.js`
as a thin shim over `engine/src/plan-lint-main.js` exporting `main(argv, io)`. The whole
lint moves, schema check included — not the schema in awk and overlap in a new bin, which
would double the invocation surface for one plan file.

`scripts/plan-lint.sh` becomes a shim of the shape `scripts/manifest-lint.sh` already uses
(`exec node "$ROOT/engine/bin/plan-lint.js" "$@"`), so both existing callers keep working
untouched: `skills/planning/SKILL.md:33` and `skills/implementation/SKILL.md:15`, which both
invoke the script by path. The new `engine/src` module falls inside the existing mutation
glob with no `engine/stryker.conf.json` edit.

**Hard constraint on the move:** the resolved `planning` gate string stays the literal
`plan-lint` (pinned by value at `engine/test/scenarios.test.js:210` and `:231`), so no
scenario fixture re-tunes and `pipeline/default.yml:62` is unchanged.

**Directory spans are not paths.** A `### Context` block that names `engine/src/` or
`skills/` is not declaring the same *unit of work* as another part that names the same
directory — in this repo nearly every part touches `engine/src/`. The detector counts only
spans that resolve to a file, so a shared directory prefix never raises a warning. This is
the single largest false-positive source and is closed by construction, not by a waiver.

### Item 4 — the rule-vs-fact prune lens

**The second candidate class.** `skills/prune/SKILL.md` §Inspection scope currently asks
one question. It gains a second, orthogonal one:

> **Rule-vs-fact.** A unit that encodes a *decision procedure* the model can already run,
> where stating one missing *fact* would suffice. The candidate's replacement is the fact
> itself, stated once, at the place the procedure lived.

This is orthogonal to the existing lens: the existing question asks whether the model still
needs the guidance at all; this one asks whether guidance is the right *shape* for what it
carries. A unit can fail the second and pass the first.

**Token (ADR-309).** The existing `PRUNE-CANDIDATE(<unit>): <rationale>` line is reused with
no change to its grammar (the brief's hard constraint, and the skill's own "defined here
only" claim stays true). The two classes are told apart by a **fixed rationale prefix** on
the new one — `PRUNE-CANDIDATE(<unit>): rule-vs-fact — <rationale>` — so auditing whether the
lens ever fired is one grep, with no new token and no change to the three-field shape.

**Shape of the candidate.** The existing third field
(`what-would-replace-the-safety-it-provided`) already accommodates this class: for a
rule-vs-fact candidate its value is *the missing fact* — which is also the review question
a human needs to answer. No new field is required.

**Denylist interaction.** The preamble's fail-closed `contracts/core.md` read is unchanged,
and the refusal step (Procedure step 4) applies to both classes identically: a rule-vs-fact
candidate that maps to a core invariant is dropped before emission, exactly as a drag
candidate is. Note the ordering coupling with item 5 — item 5 adds a core line, which
becomes a denylist entry the prune skill will refuse candidates against.

**DoD authoring question.** The matching question, in DOD.md's voice:

> Any new contract/skill line that encodes a decision procedure states why one missing fact
> would not have sufficed.

**Its home is asserted, not advisory (ADR-310):** a new `kind: judgment` criterion in
DOD.md's `criteria:` frontmatter plus its checklist line naming that id — the same shape the
other nine judgment criteria use. Only an asserted criterion makes a proposed contract line
answer the question *before* the validation phase can assert the DoD; a paragraph under the
checklist would not bind. DOD.md is asserted on *every* craft change while this question
binds only changes that propose such a line, so the criterion carries an explicit N/A
convention, and an N/A outcome is recorded honestly rather than skipped. The precedent for a
criterion that is honestly N/A on most changes already exists in the file
(`architecture-gap-honest`).

### Item 5 — the concurrent-writer git-safety floor

**The concrete overlap, restated as a failure.** During the `documentation` phase, three
agents are live in one worktree: `craft:docs-writer` (commits page refreshes),
`craft:backlog-ticker` (commits the backlog flip), and `craft:harness-triager` (commits
triage resolutions as the background `validation` run lands). If any of them runs
`git stash` to clear a dirty tree before its own commit, it pockets another agent's
in-flight edits; a `git checkout`/`git reset` discards them. Nothing in
`contracts/core.md` forbids it — line 7 bounds the *directory*, not the *ref state* — and
the only existing protection is binding-level (`adapters/copilot/src/deny-tool-args.js`),
absent from most bindings and documented as prefix-matched, bypassable defence-in-depth
(`docs/contributing/specs/gate.md`).

**The line (ADR-311).** One new `contracts/core.md` line, in the same terse imperative
register as the other seven, naming the four verbs explicitly so it is greppable and
unambiguous, with the reason stated so the rule is self-explaining — e.g. *"Never change
repo-wide git state (stash, pop, checkout, reset); another agent may be working the same
tree."* The ban is **unconditional: no exemption clause for reset-on-red**, because the
contract binds agents and the reset-on-red reset is performed by the runner, which the
contract does not govern. Spending a clause of every spawn's context on a case the contract
never bound is the cost that buys nothing. Wording constraints hold as listed below: no
`retrieval` substring, no Class-A token, no prose-lint ban-list word, plain prose with no
backticks.

**What it does and does not cost.** It joins every assembled contract block for all 9 role
agents in all 7 adapters — roughly 90 characters per spawn, which against a measured mean
of 123,213 tokens per spawn is noise. It becomes an undroppable `craft:prune` denylist
entry by construction. It does *not* change `engine/src/contract.js`, does *not* add a
carve-out marker, and does *not* require touching
`engine/test/fixtures/contracts/core.md` (already a divergent simplified fixture).

**Who it does not bind.** The contract block is assembled for and injected into *agents*
(`engine/src/contract.js` `assembleContract`, per descriptor). Two existing craft
behaviours change repo-wide git state and are unaffected because neither is an agent:
reset-on-red (`adapters/aider/src/vcs-posture.js` returns the decision; the runner performs
the `git reset --hard`) and `scripts/worktree-teardown.sh` (`fetch --prune`,
`worktree remove`, `branch -D`), which is a script run by the orchestrator at `integrate`.
A reviewer should expect both to keep working; neither gets an exemption clause in the line
itself (ADR-311). `worktree-teardown.sh` is unchanged by this PR in every respect — it needs
no exemption here and no ledger-preservation step from item 1.

**What it deliberately is not.** It is not a mechanical guard. Extending
`engine/src/guards/tool-call-guard.js` to block these verbs would be a second, larger
change with its own seven-binding mirror surface, and is out of scope here (see Out of
scope).

### Item 6 — fan-out consolidation advisory

**The claim, on token cost.** From this repo's own committed telemetry
(`.claude/craft-metrics.md`, 308 spawn records across 27 run-ids — measured now, not
recalled):

| Reviewer spawn | n | min | median | max | mean |
|---|---|---|---|---|---|
| `review-code` | 18 | 54,097 | 100,026 | 194,344 | 112,355 |
| `review-security` | 18 | 45,263 | 82,977 | 143,416 | 88,052 |
| `review-tests` | 18 | 64,470 | 105,159 | 158,389 | 108,049 |
| `review-perf` | 18 | 38,334 | 58,557 | 100,036 | 65,451 |
| **all four pooled** | **72** | **38,334** | **92,509** | **194,344** | **93,477** |
| `review-fix-delta` (convergence round) | 4 | 55,530 | 58,052 | 69,312 | 60,236 |

Whole-corpus baseline: 308 records, 37,949,732 tokens, mean 123,213. The four review
dimensions alone account for 6,730,351 of those tokens (17.7%); adding the pre-split
aggregate `review` records (n=11, 2,837,513) puts the review phase at 25.2% of every token
craft has ever spent on a spawned phase in this repo.

So: the shipped default of 4 reviewers costs ≈ 370k tokens for round 1 at the pooled
median (4 × 92,509). `passes: 3` over 4 dimensions is 12 reviewers ≈ 1.11M tokens for
round 1 alone (12 × 92,509) — before the default `max_cycles: 3` adds up to two fix-delta
rounds at a measured median of 58,052 per fix-delta reviewer. That is the entire
justification the advisory needs: the product is a linear multiplier on the single most
expensive phase craft runs.

**Why craft's case is not the article's case, stated in the advisory's own doc.** The
article's "2–4 agents" number is about *writers sharing one mental model*, where each extra
agent multiplies coordination and divergence. craft's reviewers are **read-only, diverse
lenses over the same diff** (`contracts/harness-read.md:1`, "Read-only: never edit, never
commit") whose independent orientation is deliberate: `skills/review/SKILL.md` step 1
spawns each with its own dimension definition and no shared state, and step 4 spawns a
*fresh* reviewer each cycle rather than continuing one. Independence is the feature. The
only thing that scales badly is cost — so cost is the only thing the advisory says.

**Never a cap.** The advisory changes no resolved value. `deriveReviewPlan` still returns
`{ passes, stop_rule }` unchanged; `skills/review/SKILL.md` still spawns exactly
`dimensions.length × passes`. The engine-emitted-and-binding property is untouched. The
advisory is one line of output, and the operator is free to ignore it forever.

**Placement (ADR-312) and threshold (ADR-313).** The advisory fires at **pipeline
resolution**, not at manifest lint: one `records.push` into the advisory `records[]` that
`deriveReviewPlan` already emits and the orchestrator already seeds the run record with
(`skills/run/SKILL.md` §1c). `validateManifest`'s `{ ok, errors }` return shape is unchanged,
so no sub-validator signature moves. It **fires when the resolved product of dimensions and
passes exceeds eight** — double the shipped default of four, the only anchored number
available: the default configuration never warns, a legitimate fifth or sixth dimension never
warns, and eight reviewers is ≈740k tokens for round one at the measured pooled median.
The acknowledged cost of this placement: the warning appears in the run record of a run, not
at the moment an operator edits the manifest. Adding a manifest-edit-time surface later is
additive and undoes nothing here.

### Item 7 — Frame 5 in `docs/guides/concepts.md` (ADR-314)

`docs/guides/concepts.md` sets its own bar in Frame 1's closing paragraph: *"That is the
test for whether a frame earns a place in this guide — it has to change what you'd build
next, not only what you'd call what already exists."* Items 1–3 are three mechanisms this
frame produced that did not exist before it. ADR-314 rules that this clears the bar: the
guide gains the fifth frame, and its mapping-table rows name **only** mechanisms this change
ships — the on-disk ledger, the boundary digest, the cognitive-locality warning. That
constraint is what orders the seam last: the rows cannot be written truthfully until the
mechanisms they map have landed.

The change is: one new `## Frame 5` section (narrative + mapping table in the
established shape), one Rosetta-stone row, one Sources URL, and the count edits — "four
frames" → "five frames" at `README.md:52-53`, `README.md:201`,
`docs/guides/concepts.md:1`, `:10`, `:22`, `:188`, and "these six URLs" → "seven" at
`:206`. `concepts.md` is already enrolled in the living corpus
(`scripts/living-corpus.sh`, pinned at `test/living-corpus.test.js:38`) and carries no
`subjects:` frontmatter by decision (so intention-lint is unaffected either way), and the
guide's own rule — mapping-table rows name "a real, current mechanism … never an
aspiration" — is why seam G must land after A/B/C.

### Part-partition seams (input to the planning phase)

The six items are independent in mechanism. The seams below are written against the settled
decisions — no seam is conditional on a choice any more, and none of them edits `.gitignore`:

| Seam | Surfaces | Coupled to |
|---|---|---|
| A — on-disk run record | `skills/run/SKILL.md` §0.4 / walk step 7 / §Done (incl. the derivation-before-teardown clause, with a matching pointer at `skills/integrate/SKILL.md` step 3); a run-record doc or spec page; `test/` presence tests + the `.gitignore` negative pin in `test/p22-memory.test.js` | none of the others |
| B — validation boundary digest | `contracts/harness-exec.md`; `engine/bin/filter-findings.js`; `engine/src/{findings,filter-findings-main}.js`; `skills/validation/SKILL.md`; `engine/test/*` | shares the *lint-family* shape with C, shares `contracts/` with E |
| C — plan-lint locality | `engine/bin/plan-lint.js` + `engine/src/plan-lint-main.js` (new); `scripts/plan-lint.sh` (awk → shim); `engine/test/*` | shares the lint-bin archetype with B — do **not** share a part; different gates, different failure modes |
| D — prune rule-vs-fact lens | `skills/prune/SKILL.md`; `docs/contributing/DOD.md` | **ordering**: D's denylist read includes E's new line — land E first or D's tests pin a stale core |
| E — core git-safety line | `contracts/core.md`; contract/hygiene test pins | see D |
| F — fan-out advisory | `engine/src/resolve.js`; `skills/review/SKILL.md`; `docs/guides/customizing.md`; `engine/test` | none |
| G — Frame 5 | `docs/guides/concepts.md`; `README.md`; `docs/README.md` | consumes A/B/C as its mapping-table rows — land last |

D and E both touch the contracts/prune surface and are the one hard ordering constraint
(E → D). B and C both add lints but touch disjoint files and disjoint gates; merging them
into one part would put two unrelated failure modes behind one commit. A is the largest
single seam and is self-contained. G lands after A/B/C so its table rows name shipped
mechanisms rather than intentions — the guide's stated rule, made binding by ADR-314.

Two seams shrank against the draft: A no longer carries a `.gitignore` edit (ADR-301), and C
no longer touches `templates/plan.md` (ADR-307 leaves the `### Context` schema alone). F no
longer carries an either/or (ADR-312 fixes it at `engine/src/resolve.js`).

## Decision candidates

**All fifteen are settled** — decisions phase, 2026-07-30, ADRs 300-314. Fourteen were
adopted as recommended. **DC-2 was ratified against the recommendation** (ADR-301: the ledger
is run-local, not committed), and this document is the revision that folds that ruling
through every section above. Nothing here is open, and no new candidate was raised by the
revision.

The table is kept as the trail. The **Settled** column is binding; the **Recommendation** and
**Why** columns are the designer's position at the time of writing, preserved for the record.
Where the two disagree — DC-2 only — the ADR wins and the design sections above are written
to it. DC-1's and DC-2's *Why* cells carry an annotation where the ruling voided part of the
original reasoning; the other thirteen stand as written.

| # | Choice | Alternatives (≤3) | Recommendation | Settled | Why |
|---|---|---|---|---|---|
| DC-1 | On-disk run-record file shape | (a) single append-only `.claude/craft-run-record.md`, one run-id-prefixed line per record, mirroring `.claude/craft-metrics.md`; (b) one file per run under `.claude/craft-runs/<run-id>.md`; (c) reuse `.claude/craft-metrics.md` with a distinguishing prefix per line | **(a)** | **ADR-300 → (a)**, as recommended | Matches the shape the brief names and the ADR-119 precedent, and keeps the read-back a one-liner grep on the run-id. *Annotated after ADR-301:* the "one file keeps the `.gitignore` re-include cheap" ground is void, and so is (b)'s matching cost (a directory re-include) — with nothing committed, neither option pays a gitignore price at all. (a) stands on what is left: one file, one grep, and no splitting of "the ledger" into a set that a reader has to assemble. (c) mixes a decaying-free metrics baseline with prose outcomes — exactly the mixing ADR-119 was created to prevent. |
| DC-2 | Is the ledger committed? | (a) committed via a new `.gitignore` re-include beside memory + metrics; (b) gitignored — run-local, dies with the worktree; (c) committed, but written only from the `documentation` phase onward | **(a)** | **ADR-301 → (b), AGAINST the recommendation** — the ledger is run-local | *The recommendation, overruled.* The designer argued (a) from the ADR-118/119 precedent (state travels with the repo), treating (b) as defeating R1's strongest case — `worktree-teardown.sh` destroys the tree, taking the ledger with it — and weighing ledger diff-noise on every craft PR as the acceptable cost. **The user ruled (b):** that noise is not worth paying on PRs whose subject has nothing to do with the ledger, and `.claude/*` already ignores the file, so nothing ships to make it so. What the design above is written to, in consequence: no `.gitignore` change; durability bounded to a live worktree (R1); the teardown case the recommendation leaned on is not served; and the delta derivation must read the ledger before teardown, not after (item 1, **Derivation vs. save**). (c) is moot under the ruling and was rejected on its own terms anyway — it leaves the early phases, where a reset is most expensive, unprotected. |
| DC-3 | Flush granularity and writer | (a) orchestrator only, one append at each phase boundary (walk step 7) plus open and `Done`; (b) orchestrator, additionally on every blocker and every gate result within a phase; (c) each role agent appends its own outcome lines | **(a)** | **ADR-302 → (a)**, as recommended | Single writer is what makes R4 and item 5 coherent. (b) buys finer resume granularity at the cost of many small writes and an unclear "what is a boundary" rule. (c) is refused outright: it re-creates the concurrent-writer hazard this PR is closing, in the very file that records it. |
| DC-4 | Source of the memory `delta` at `Done` | (a) derive from the on-disk ledger's lines for this run-id; (b) keep the in-session buffer as the source, ledger is a write-only mirror; (c) in-session buffer normally, ledger as fallback on a detected resume | **(a)** | **ADR-303 → (a)**, as recommended | One source of truth, and it makes the delta reproducible after a reset — the same property R1 buys for the ledger. (b) leaves the resumed run deriving a delta from a buffer it no longer has. (c) works but carries two code paths and a "detected resume" predicate nothing else needs. Under all three, `save` stays a single atomic call at `Done` (R3). *Knock-on from ADR-301:* (a) still holds, and the ledger is still present when the delta is derived — provided the derivation happens while the worktree is alive, i.e. before `integrate`'s teardown, which the `Done` write then consumes (item 1, **Derivation vs. save**). |
| DC-5 | Filter-bin input contract | (a) canonical `Finding[]` — composes after `normalize-findings`; technique shaping stays in the technique's `run`/`triage-procedure`; (b) raw technique output, with per-technique parsers in `engine/src`; (c) raw output plus a manifest-declared per-technique regex | **(a)** | **ADR-304 → (a)**, as recommended | (b) is directly forbidden: `test/source-hygiene.test.js` Class A bans technique names under `engine/src`, and it would re-specialize the engine the repo deliberately de-specialized. (c) puts a parser in YAML — an untestable surface with no gate. (a) reuses `engine/src/findings.js` and keeps the boundary one composable pipe. |
| DC-6 | Scope-spec format | (a) one comma-joined `<file>:<start>-<end>` string argument, mirroring the documented `--mutate "fileA:r1,fileB:r2"` form; (b) a JSON ranges file passed by path; (c) the bin runs `git diff -U0` itself | **(a)** | **ADR-305 → (a)**, as recommended | Symmetric with the per-hunk convention already recorded in `.claude/workflow.md`, including its documented repeated-flag foot-gun. (b) survives very large scopes better but adds a temp-file protocol for no current need. (c) breaks R7 — an impure bin cannot be tested without a repo, and it duplicates scoping the skill already does. |
| DC-7 | plan-lint overlap posture | (a) advisory: warning to stdout, exit code unchanged; (b) blocking: exit 2 unless each overlapping part carries a justification line; (c) advisory by default with an opt-in `--strict` | **(a)** | **ADR-306 → (a)**, as recommended | Overlap is a cost and a risk, not a defect; this repo's own plans contain a deliberate, correct instance (two parts both editing `scripts/ci.sh` counters). (b) would have failed that plan and pressures authors toward under-partitioning. (c) adds a flag with no current consumer — the manifest already has no knob to set it from. |
| DC-8 | How "declares a file path" is detected | (a) backticked spans that look like a repo path (contain `/` and a file extension, or match a known top-level dir), following `intention-lint`'s backtick-span precedent; (b) any whitespace-delimited token anywhere in the block matching a path regex; (c) require an explicit machine-readable list line in `### Context` and lint only that | **(a)** | **ADR-307 → (a)**, as recommended | Matches the house precedent for extracting structure from prose and matches how plans actually cite paths. (b) is noisy — prose names paths mid-sentence and inside quoted snippets. (c) is the most precise and the most invasive: it changes the `templates/plan.md` schema and makes every existing plan non-conforming, for a check that is advisory anyway. |
| DC-9 | plan-lint implementation home | (a) stay in `scripts/plan-lint.sh` awk, extended; (b) move the whole lint to `engine/bin/plan-lint.js` + `engine/src/plan-lint-main.js`, script becomes a shim; (c) keep the schema check in awk and add the overlap check as a separate bin | **(b)** | **ADR-308 → (b)**, as recommended | Cross-part set intersection is awk-hostile, and `engine/src/**` is the only mutation-covered home (`engine/stryker.conf.json`) — a new lint in `scripts/` ships with no mutation coverage. The house archetype (`intention-lint`, `stub-lint`, `prose-lint`) is exactly this. (c) doubles the invocation surface for one plan file. **Under all three, the resolved gate string stays the literal `plan-lint`** (pinned by value in `engine/test/scenarios.test.js`). |
| DC-10 | Making the two prune classes greppable apart without a new token | (a) same token, fixed rationale prefix — `PRUNE-CANDIDATE(<unit>): rule-vs-fact — <rationale>`; (b) same token, class carried only in free prose; (c) same token, plus a fourth candidate field naming the missing fact | **(a)** | **ADR-309 → (a)**, as recommended | Honours the "no new token" constraint while keeping the repo's stated preference for fixed greppable markers over per-context idiom. (b) makes the class invisible to grep, so nobody can audit whether the lens ever fired. (c) changes the documented three-field candidate shape for information the existing third field already carries. |
| DC-11 | DoD home for the authoring question | (a) a new `kind: judgment` criterion id + checklist line, with an explicit N/A-when-inapplicable convention (precedent: `architecture-gap-honest`); (b) a non-asserted paragraph below the checklist, in the existing `_Reference (…)_` block; (c) only in `skills/prune/SKILL.md`, not in DOD.md | **(a)** | **ADR-310 → (a)**, as recommended | The brief's requirement is that a proposed contract line *must answer it first* — only an asserted criterion binds that. The precedent for a criterion that is honestly N/A on most changes already exists in this file. Cost to ratify: every craft change now records an outcome for a question most changes answer "N/A". (b) is cheaper but non-binding. (c) fails R12. |
| DC-12 | The core git-safety line: verbs, and the reset-on-red question | (a) ban the verbs unconditionally, no carve-out text — e.g. *"Never change repo-wide git state (stash, pop, checkout, reset); another agent may be working the same tree."*; (b) same ban with an explicit exemption clause for the orchestrator's reset-on-red; (c) ban stash/pop/checkout only, leaving reset to the binding-level deny sets | **(a)** | **ADR-311 → (a)**, as recommended | The contract is injected into *agents*; the reset-on-red reset is performed by the runner/orchestrator (`adapters/aider/src/vcs-posture.js` header states this), so no exemption is needed and (b) would spend a clause of every spawn's context on a case the contract does not govern. (c) leaves the most destructive verb uncovered at the contract level. Wording constraints binding on all three: no `retrieval` substring (contracts-lint), no `mutation`/`mutant` token (source-hygiene Class A scans `contracts/`), no prose-lint ban-list word, and plain prose with no backticks — `contracts/core.md`'s existing eight lines use none. |
| DC-13 | Where the fan-out advisory lives | (a) `manifest-lint` — requires adding a warnings channel to `validateManifest`'s `{ ok, errors }` return and folding in `pipeline/default.yml` defaults it does not read today; (b) `pipeline-resolve` — push one advisory string into the existing `records[]`, which the orchestrator already seeds the run record with; (c) both — resolve computes it, manifest-lint surfaces it for the standalone script path | **(b)** | **ADR-312 → (b)**, as recommended | This is where the code disagrees with the brief. The *resolved* product only exists in `engine/src/resolve.js`; `manifest-lint` sees `passes: 3` with no dimensions and cannot compute 12. (b) is one `records.push` in a function that already emits advisory records, and it lands in the run record where every other advisory lands. (a) is a cross-cutting signature change through ~12 sub-validators and still needs the defaults. (c) is (a) plus (b). Counter-argument to weigh: (a) is where an operator editing the manifest actually looks. |
| DC-14 | Advisory threshold on `dimensions × passes` | (a) warn above 8 — double the shipped default of 4; (b) warn above 6; (c) warn above 4 — any tuning above the shipped default | **(a)** | **ADR-313 → (a)**, as recommended — warn above 8 | Grounded in the measured pooled median of 92,509 tokens per reviewer spawn: 8 reviewers ≈ 740k for round 1, and at the default `max_cycles: 3` the phase lands around 1.2M tokens once two fix-delta rounds (median 58,052 each) are added — ~3% of this repo's entire 37.9M-token spawn history, in one phase of one run. (c) fires on every legitimate small tune (e.g. adding a fifth dimension) and would train operators to ignore it. (b) is defensible but has no anchor; (a) has one — the shipped default, doubled. |
| DC-15 | Frame 5 ("the orchestrator's tax") in `docs/guides/concepts.md` | (a) add it — new section, narrative + mapping table, Rosetta row, Sources URL, and the "four"→"five" edits in `README.md` and `concepts.md`; (b) no new frame — add the new rows to Frame 1's *state on disk* / *bounded state* rows, since the tax is a refinement of the same write-the-loop lens; (c) defer to a follow-up once items 1–3 have run in anger | **(a)**, conditionally | **ADR-314 → (a)**, as recommended — the condition is met, and the frame ships | The guide's own bar is "it has to change what you'd build next" — this frame produced three mechanisms (on-disk ledger, boundary digest, cognitive-locality warning) that did not exist before it, which is the same evidence Frame 1 cites for itself. But the bar is deliberately a judgment call the guide reserves, so the designer states the case and the user rules. (b) understates it — the tax claim is about *pollution taxing later turns*, which Frame 1's rows do not say. (c) is safe and costs a second docs pass. |

## Test strategy

### Acceptance notes — locality-detector calibration (recorded, as this strategy requires)

Measured over the repo's own 23 committed plans, before and after the self-path exclusion:

| | before | after |
|---|---|---|
| plans emitting at least one warning | 14 of 23 | 14 of 23 |
| total warnings | 50 | 49 |
| overlap widths (parts per shared path) | 2:38 · 3:8 · 4:1 · 6:1 · 7:2 | 2:37 · 3:8 · 4:1 · 6:1 · 7:2 |

**State the uncomfortable number plainly: the fire rate did not move.** 14 of 23 is 61%,
which is *over* the bar this strategy set ("a detector that warns on most historical plans
is mis-tuned"), not near it. The self-path exclusion removed exactly one warning. An
earlier revision of this section reported only the after-figures and described the rate as
sitting "near" the bar; both were flattering, and the review round caught it.

An intermediate revision also *suppressed* every overlap wider than three parts, which cut
the total to 45 and looked like tuning. That was rejected on two grounds: the cut point was
post-hoc on a single 4-part observation (limits of 4 and 5 give identical results), and
suppressing the widest overlaps discards the most severe locality violations to improve a
statistic. Wide overlaps are now still reported — only the suggested remedy changes, since
"merge the parts" is not an available action at seven.

What the composition does show:

- The distribution is dominated by two-part overlaps (37 of 49). This change's own plan is
  one: `contracts/core.md` in Part 1 and Part 2, a true positive — Part 1 adds the line and
  Part 2 reads it as a denylist, so the two parts share one mental model and a hard
  ordering constraint.
- The wide tail is real but small: two paths at 7 parts, one at 6, one at 4 — repo
  infrastructure (a CI script, two indexes, a config) rather than shared units of work.

So the honest reading is that this repo's plans genuinely share files across parts at a
high rate — the cost the frame names — and the detector reports it accurately. Whether 61%
is *useful* is a separate question this data cannot settle, and it is deliberately left
open: the advisory ships, the number is on the record, and if operators learn to ignore it
the thing to revisit is the detector's specificity, not its advisory status.

**Item 1 — on-disk run record.** The mechanism is orchestrator prose plus a file
convention, so the tests are presence-and-shape tests in the `test/` process suite,
matching `test/hygiene-gates-ci.test.js`'s style of pinning skill prose and script content:
`skills/run/SKILL.md` names the ledger path at §0 step 4, at walk step 7, and at `Done`;
`skills/run/SKILL.md` §Done still states `save` is called **once** and still states writes
are buffered-and-flushed-once (an anti-regression pin on R3 — the sentence must survive the
edit); and the ledger path is not `memory.ref`'s default (R2, a byte-level distinctness
assertion). Edge matrix: absent file (header written); present file (appended, header not
duplicated); a run reaching `Done` twice (documented as convergent under decay-merge, pinned
as a prose invariant); and a run whose worktree was torn down before `Done` — the ledger's
tail is the pre-teardown boundary, the `integrate` line is in-session only, and `save` still
runs from the delta derived before teardown (pinned as a prose invariant, since the tree the
assertion would inspect is gone by then).

Two pins exist specifically because the ledger is run-local (ADR-301):

- **`.gitignore` stays unchanged — pinned negatively.** `test/p22-memory.test.js` already
  asserts the three `!.claude/…` re-include lines are present; extend it with the assertion
  that **no** re-include names the run record. A positive pin would have been the committed
  option's test; this is its inverse, and it is what stops the ruling being reversed by a
  one-line drive-by later.
- **Derivation order.** `skills/run/SKILL.md` §Done states both that the delta is derived
  from the ledger's run-id lines *and* that the derivation happens while the worktree is
  alive — before `integrate` runs `worktree-teardown.sh`. Pin that sentence: it is the one
  invariant the run-local ruling makes fragile, and nothing else in the suite would catch its
  loss. Pin the negative too — `scripts/worktree-teardown.sh` is byte-unchanged by this PR,
  so no ledger-preservation step creeps in.

**Item 2 — filter bin.** Two files mirroring the sibling exactly:
`engine/test/filter-findings-main.test.js` (unit, injected `io`, `sut = main`) and
`engine/test/filter-findings-bin.test.js` (spawn smoke via `spawnSync`, stdin and
file-path modes, exact stdout bytes). Edge matrix: empty findings → `[]` exit 0; empty
scope → `[]` exit 0; finding inside range / on each boundary (`start`, `end` — inclusive) /
one line outside each boundary; finding in an unlisted file → dropped; multi-range single
file; malformed range entry → exit 2 + `filter-findings:` stderr + empty stdout;
nonexistent input path → exit 2 clean, no stack trace. **Property lens** (a
parser/matcher pair is touched): for any `Finding[]` and any range set, the output is a
subset of the input, order-preserving, and `filter(filter(x, r), r) === filter(x, r)`
(idempotence). **Regression pin:** `engine/test/normalize-findings-bin.test.js` must pass
unchanged (R8). Plus a `test/source-hygiene.test.js` run proving the new `engine/src`
module introduces no Class-A token (R6), and a `contracts-lint` run over the amended
`contracts/harness-exec.md`.

**Item 3 — plan-lint locality.** Fixture-driven `execFileSync` tests in the style of
`test/design-lint.test.js` / `test/backlog-lint.test.js`: a two-part plan with a shared
backticked path → warning naming the path and both parts, exit code unchanged; a two-part
plan with disjoint paths → no warning; a schema-invalid plan → still exit 2 with the
existing message (no regression on the gate); a single-part plan → no warning (non-vacuous
guard: also assert the detector found ≥1 path, so a broken detector cannot pass by finding
nothing); a Context block quoting a path in prose without backticks → no warning (ADR-307's
boundary — the deliberate under-report); two parts both naming the same *directory* span (`engine/src/`) → no warning;
three parts sharing one file path → one warning naming all three. Run the lint over the
repo's real `docs/contributing/plan/*.md` corpus once as a calibration check and record the
hit count in the design's acceptance notes — a detector that warns on most historical
plans is mis-tuned regardless of what the fixtures say. **Gate-string
pin:** `engine/test/scenarios.test.js` SC1/SC5 assertions on `gateOf('planning') ===
'plan-lint'` must pass unchanged (R10).

Per ADR-308 the lint now has a bin and a pure module, so the fixture tests above sit beside
two suites named for the archetype it joins: `engine/test/plan-lint-main.test.js` (unit,
injected `io`, `sut = main`) and `engine/test/plan-lint.bin.test.js` (spawn smoke) — the
`<name>-main` / `<name>.bin` pair that `intention-lint`, `stub-lint`, `prose-lint`, and
`manifest-lint` already use. Bin-level tests belong there, not in the repo-root suite: bins
are never mutated, so relocating them on a coverage rationale would be void. No
`engine/stryker.conf.json` edit — the `engine/src/**/*.js` glob picks the new module up. Add
one shim pin: `scripts/plan-lint.sh` still exits 2 on a schema-invalid plan and still prints
the `plan-lint:` message, proving the two callers that invoke it by path
(`skills/planning/SKILL.md`, `skills/implementation/SKILL.md`) are unaffected by the move.

**Item 4 — prune lens + DoD.** Prose pins in the `test/` suite: `skills/prune/SKILL.md`
contains the rule-vs-fact class text and still contains exactly one token definition (a
grep proving `PRUNE-CANDIDATE` is the only `*-CANDIDATE(` form and that no new token
appears in `skills/`); the fixed `rule-vs-fact —` rationale prefix (ADR-309) is pinned as a
literal string, since the whole audit story is a grep for it.
DoD: extend `test/p20-dod.test.js`'s existing pattern — the new criterion id appears in
both the frontmatter `criteria` list and on its checklist line, and
`engine/src/dod.js`'s `validateDodCriteria` accepts the amended list
(`engine/test/dod.test.js`). Run `intention-lint` over the amended DOD.md via
`scripts/living-corpus.sh` (already wired in `scripts/ci.sh`).

**Item 5 — core line.** Extend the contract test surface rather than adding a parallel one:
a presence assertion for the new line's fixed substring alongside `CORE_MARKERS`.
`engine/test-helpers/contract-markers.js` is the shared home, imported by exactly two
suites — `engine/test/contract-equivalence.test.js` and `engine/test/scenarios.test.js` —
so adding the marker there covers every descriptor in both, in one edit; the existing
"exactly two lines differ agent vs inline" assertion must pass unchanged (R13);
`engine/bin/contracts-lint.js` over `contracts/` must stay green (no `retrieval`
substring); `test/source-hygiene.test.js` Class A must stay green (no `mutation`/`mutant`).
Add one behavioural pin that the line reaches an actual spawn payload — assert the marker
appears in `assembleContract(...)` output for at least one descriptor in **both** execution
modes, so a future carve-out cannot silently drop it from inline runs.

**Item 6 — fan-out advisory.** At `engine/test/scenarios.test.js` /
`engine/test/resolve*.test.js` (ADR-312 puts the advisory in resolution): a manifest with
`passes: 1` and default dimensions emits no advisory record; `passes: 3` with default
dimensions emits exactly one advisory record whose text names the product `12`; `passes: 3`
with `dimensions: [code]` (product 3) emits none; and — the R14 inertness proof —
`effective[]`, `gateDecisions`, and every phase's resolved `harness`/`reviewPlan` are
deep-equal between a resolution that emits the advisory and one that does not (the advisory
may appear only in `record[]`). Boundary pair at the ADR-313 threshold, pinned by value:
product == 8 → silent, product == 9 → warns. Two negatives worth pinning because the
placement decision rests on them: `test/manifest-lint.test.js` passes unchanged
(`validateManifest`'s `{ ok, errors }` shape is untouched), and `test/examples-lint.test.js`
still sees exit 0 and `valid.` on every `examples/*/workflow.md` —
`examples/review-harness/workflow.md` resolves to 3, well under 8, so it stays silent either
way.

**Item 7 — Frame 5.** `test/living-corpus.test.js` unchanged (`docs/guides/concepts.md`
already enrolled); `intention-lint` green over the amended page; a README-consistency pin
that the frame count stated in `README.md` matches the number of `## Frame ` headings in
`concepts.md` — the drift this edit would otherwise introduce, in the spirit of
`test/readme-drift.test.js`.

**Whole-PR gate.** `bash scripts/ci.sh` green (R16), including `design-lint` over this
document, `docs-structure-lint` over `docs/contributing` and `docs/guides`, and the hygiene
stub/prose lints over the touched diff — note `contracts/core.md`,
`contracts/harness-exec.md`, and every touched `skills/**/SKILL.md` **are** prose-linted
(only `docs/contributing/{adr,design,archive,specs,prd}` are skipped), so the new lines must
avoid the ban list (`delve`, `leverage`, `seamless`, `robust`, "it's important to note",
"in conclusion").

**No `scripts/ci.sh` edit is expected by any seam.** `run_suite` enumerates
`*.test.js` under each suite dir with `find`, so new `engine/test/*` and `test/*` files are
picked up with no script change; `every-test-file-registers.test.js` then proves each
registers at least one test. This matters because `test/hygiene-gates-ci.test.js` pins
`ci.sh`'s excuse-glob case-arm byte-wise — a seam that *did* edit a glob would have to
extend that pinned regex in the same commit. None should.

## Out of scope

- **A mechanical guard for the item-5 verbs.** Extending
  `engine/src/guards/tool-call-guard.js` (and its seven adapter mirrors, plus each binding's
  deny-set) to block `stash`/`pop`/`checkout`/`reset` is a second, larger change with its
  own live-probe proof burden per binding. The contract line is the floor; the guard is a
  follow-up.
- **Locking the memory store or the ledger.** ADR-120 decided no locking, last-flush-wins,
  on the grounds that a lost advisory write costs one re-derivation. Nothing here changes
  that calculus, and the ledger's single-writer rule (R4) removes the only new race.
- **A cap on `dimensions × passes`.** Explicitly excluded by the brief and by R14: craft's
  reviewers are independent read-only lenses, and capping them would trade a real quality
  property for a cost number.
- **Reshaping the run record's line vocabulary.** The existing token family
  (`GATE(...)`, `NO-OP(...)`, `auto-skip:`, `WAIVER:`, `POLICY(...)`, `INTENTION-*`,
  `STUB-*`, `SLOP-*`) is unchanged; this change moves where the lines are stored, not what
  they say.
- **A `custom` memory or run-record adapter.** ADR-121 reserves `memory.source: custom` as
  documented-and-unbuilt; the ledger inherits the same posture — file only.
- **Per-technique output parsers.** Deliberately excluded by ADR-304 and R6: shaping a
  technique's raw output into `Finding[]` belongs to the technique's declared
  `run`/`triage-procedure`, not to `engine/src`.
- **Changing `templates/plan.md`'s `### Context` schema.** ADR-307 keeps the template as it
  is: requiring a machine-readable path list would make every existing plan non-conforming
  for a check that is advisory anyway. If it is ever wanted, it is its own change with its
  own migration.
- **Any `.gitignore` change.** ADR-301 makes the ledger run-local, and `.claude/*` already
  covers it — no re-include is added, so the file is not touched by any seam. Promoting the
  ledger to a committed artifact later would be its own change with its own ADR superseding
  301; nothing here is built to make that promotion easier or harder.
- **Preserving the ledger across `worktree-teardown.sh`.** The script is unchanged and gains
  no copy-out, no archive, no pre-teardown hook for the ledger. A torn-down tree takes its
  ledger with it, by decision (ADR-301), and the only thing that must happen first is the
  delta derivation (item 1).
- **Backfilling historical run records.** The ledger starts empty; the 27 run-ids already in
  `.claude/craft-metrics.md` are not reconstructed.
- **A run-id distinct from the topic slug.** Introducing a second identifier (timestamped
  or hashed) to separate a re-run from a resume would desynchronize the ledger from
  `.claude/craft-metrics.md`, which keys on the slug today. The collision is documented, not
  engineered around.
- **A `resume` command or an auto-detected resume path.** Item 1 makes the ledger
  *readable* after a reset; deciding when a run is resuming rather than starting is a
  separate concern with its own user-facing surface.
