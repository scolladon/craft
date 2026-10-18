# Design — planning-no-op-outcome

> Brief: give planning a documented `NO-OP(planning):` outcome, and implementation its
> counterpart, for a run whose earlier phases already landed every deliverable.
> Status: draft → self-reviewed ×3 → accepted

## Context

### What exists

- `skills/planning/SKILL.md` Procedure 1 spawns `craft:planner`. Procedure 2 runs
  `scripts/plan-lint.sh <plan-path>`: "the phase cannot close red", with at most 2 respawns
  before escalation. Procedure 3 checks part sizing. The skill has no no-op path.
- `agents/planner.md` "Final message: the plan path + part count, nothing else." It has no
  no-op return. Six byte-synced mirrors exist at `adapters/{aider,antigravity,codex,copilot,cursor,opencode}/agents/craft-planner.md`.
  `scripts/static-lints.sh:16` runs `sync-adapter-agents.sh --check` (today: "54 mirrors in sync
  across 6 adapters").
- `skills/implementation/SKILL.md` Preamble 1 refuses to run when no `gates.phase` exists.
  Preamble 2 (L15) reads "The plan must exist and pass `plan-lint.sh` (re-run it; cheap)." The
  skill has no no-op path. Procedure 2 appends one `PART(<n>):` line per part, and Procedure 3
  runs `gates.phase` once after the last part.
- `engine/src/plan-lint-main.js` `main(argv, io)` L331: `parts.length === 0` writes
  `plan-lint: no "## Part" sections found — not a craft plan.` and returns `EXIT_INVALID` (2).
  It is pinned by `engine/test/plan-lint-main.test.js` L161.
- `skills/run/SKILL.md` walk step 1 (L216) holds the auto-skip table. Its signals for
  `review`/`architecture` read "since `implementation`", and `refactoring`/`validation` reuse
  the same scope. Walk step 7 (L359) treats a `NO-OP(<phase>):` line as a produced outcome
  ("NOT a missing artifact and never re-runs or escalates as a gap") for `decisions`,
  `refactoring` and `verify` only. The resume table (L575) gives `implementation` this
  resume rule: "`parts[]` + `git log` against the plan".
- `docs/contributing/specs/run-record.md` Token vocabulary (L75) lists `NO-OP(<phase>):` as a
  family member, generic over `<phase>`. Per-phase reason idioms live in the skills. The
  greppable-only token list starts at L94.
- `pipeline/default.yml`: `planning` produces `plan` and has gate `plan-lint`.
  `implementation` consumes `plan` with no `self_supply`, and its gate is `<gates.phase>`.
- `engine/src/autoskip.js` `computeAutoSkipEligibility` excludes floor phases (`FLOOR_PHASES`
  includes `implementation`) and any phase whose removal strands a consumer
  (`checkStrandedConsumers`). Planning self-excludes, because implementation consumes `plan`.

### Decisions that constrain this one

- ADR-103: judgment-phase no-ops are recorded as `NO-OP(<phase>): <idiom> — <justification>`.
  The token was explicitly left open for other phases to adopt the same shape.
- ADR-102: the PR-body note for a no-op IS the run-record line, carried verbatim by
  documentation. No new plumbing.
- ADR-143/144: auto-skip eligibility is resolver-side. Floor phases never auto-skip, and
  planning self-excludes through the strand guard.
- ADR-146: `auto-skip:` is a token distinct from `NO-OP(<phase>):`.
- ADR-379: phase state derives from `PHASE-START`/`PHASE-DONE`.
- ADR-308/367/370: plan-lint is a bin shim over a pure src module. The file ceiling blocks.

### Precedent

In the supersede-adr-253-symlink-route run, adr-lint C1/C3 forced the whole change into the
decisions phase's single commit. That design's own `### Commit plan` (L210) names two commits:
the design doc and the ADR bundle. Both had landed before planning started. The orchestrator
recorded `NO-OP(planning)` and `NO-OP(implementation)` by improvisation. `docs/contributing/plan/`
holds no plan for that run. Only 2 of the 80 design docs carry a `Commit plan` heading.

### Pinned behaviour (probed 2026-10-18 against this tree)

`deriveRunState` was run in-process over synthetic ledgers (default 11-phase resolution,
`awaitingHarnesses: ['validation']`):

| Ledger tail after `decisions` is done | completed adds | inFlight | next | awaitingHarnesses | warnings |
|---|---|---|---|---|---|
| `PHASE-START(planning)`, `NO-OP(planning): …`, `PHASE-DONE(planning): …` | planning | none | implementation | `[validation]` | none |
| the above, then `PHASE-START(implementation)` | planning | implementation | review | `[validation]` | none |
| the above, then `NO-OP(implementation): …`, `GATE(implementation): green`, `PHASE-DONE(implementation): …` | planning, implementation | none | review | `[validation]` | none |
| `PHASE-START(planning)`, `NO-OP(planning): …` (no DONE) | nothing | planning | implementation | `[validation]` | none |

`NO_OP_RELEASE_RE` adds `planning`/`implementation` to `released`. That set only filters
`awaitingHarnesses`, and neither phase is ever in it, so the effect is nil. **The engine needs
no change for rebuild.**

plan-lint was run on a temp file with a title and no `## Part` heading: it printed the
"not a craft plan" line and exited 2. A backticked glob `adapters/*/agents/craft-planner.md`
counts as **one** file against the ceiling (`--file-ceiling 1` reported 2 for the glob plus
`agents/planner.md`).

## Requirements

- R1. Planning has a documented outcome for "no part remains". It is recorded as
  `NO-OP(planning): no part remains — <justification>`, where the justification maps each
  design requirement to the commit sha on the branch that delivered it.
- R2. The no-op is auditable, not asserted: the orchestrator mechanically checks every cited
  sha before it records the line.
- R3. Implementation has a counterpart. When the run record holds `NO-OP(planning):` and no
  plan exists, implementation records
  `NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)`, spawns nothing,
  appends no `PART` line, and still runs `gates.phase` once, re-run after a red fix
  (`GATE(implementation): <green|red>`).
- R4. Standalone implementation (no run record) with no plan still refuses, as it does today.
- R5. Planning records `PHASE-DONE(planning):` in the same `run-ledger.sh append` call as its
  `NO-OP` line; implementation joins `PHASE-DONE(implementation):` to its `NO-OP` line only with
  a green gate (on red, `PHASE-DONE` follows the green re-run). Walk step 7 lists both as produced outcomes, never as gaps.
- R6. A rebuild after compaction resumes correctly from any ledger cut. The engine is unchanged,
  as the pinned matrix shows.
- R7. The review/refactoring/validation/architecture necessity probes do not auto-skip a source
  change that an earlier phase landed when implementation landed nothing.
- R8. Both reason idioms are fixed, greppable strings documented in
  `docs/contributing/specs/run-record.md`.
- R9. Under the recommended candidates, `pipeline/default.yml`, `engine/src/`, and the plan-lint
  verdict on a zero-part file do not change.

## Design

The flow below assumes candidates 1 (b) and 2 (b). Their alternatives are costed in Decision
candidates.

```
planning ── spawn planner ──► planner returns either:
   │                            (i)  plan path + part count  → today's path, plan-lint gates
   │                            (ii) "NO-OP: no part remains — <req → sha, …>"
   │                                      │
   │                     orchestrator resolves <base> (rev-parse --verify; fail → escalate)
   │                     and verifies the mapping:
   │                       every requirement id mapped           (coverage)
   │                       each sha ^[0-9a-f]{7,40}$, resolves    (shape)
   │                       --is-ancestor <sha> HEAD   exit 0      (on the branch)
   │                       --is-ancestor <sha> <base> exit 1      (landed this run;
   │                                                  other exit → escalate)
   │                       not design dir/plan dir/README only    (not paperwork)
   │                       git show --stat delivers the mapped R  (spot-check)
   │                     fail → respawn with the failure (counts toward ≤2) → escalate
   │                     pass → one append: NO-OP(planning) + PHASE-DONE(planning)
   ▼
implementation preamble 1: gate probe (unchanged, refuses with no gates.phase)
implementation preamble 2: plan at <plan-dir>/<slug>.md?
   yes                         → plan-lint, procedure as today
   no + ledger NO-OP(planning) → skip procedure 1–2, run procedure 3 (gates.phase once)
                                 green: one append NO-OP(implementation)
                                        + GATE(implementation): green + PHASE-DONE
                                 red:   NO-OP + GATE red, fix, re-gate;
                                        PHASE-DONE only with a green GATE
   no + no NO-OP(planning)     → refuse (today's behaviour; standalone included)
```

### Planning (`skills/planning/SKILL.md` Procedure, `agents/planner.md`)

- **Planner contract.** Add one bullet and widen the final-message line. When every design
  requirement (and every ADR consequence the design commits to) is already delivered by a
  commit this run landed after its base, the planner writes no plan and commits nothing. A
  requirement already true before the run is planned, never mapped. Its final message is
  then exactly `NO-OP: no part remains — <R1 → <sha>, R2 → <sha>, …>`. Any doubt produces a plan,
  in the same way that doubt runs a phase. A requirement that is only partly landed still gets
  a part.
- **Planning Procedure 2** gains a branch ahead of plan-lint. A `NO-OP:` return skips plan-lint,
  because no plan file exists. The mapping passes every check in the diagram above: coverage,
  shape, both `merge-base --is-ancestor` exits, the paperwork rejection and the spot-check. An
  ADR commit is not rejected mechanically, because a decision can be the deliverable. On a pass, append `NO-OP(planning): no part remains — <justification>` in one call
  (walk step 7 adds `PHASE-DONE(planning): no-op — no part remains` to it). On a fail, respawn
  fresh with the failing shas, using the existing ≤2-respawn budget, then escalate
  `{ planning, reason, ≤3 options }`.
- **Procedure 3** (sizing check) is skipped on the no-op path: there are no parts.
- **Standalone `/craft:planning`** (no open run): the skill reports the planner's `NO-OP:` line
  and stops. No ledger exists to receive it, and no commit is made.
- **Manifest `override:`** replaces the Procedure, so the no-op path goes with it. An override
  owns its outcome, and implementation's guard below lives in the non-overridable Preamble.

### Implementation (`skills/implementation/SKILL.md` Preamble 2)

Preamble 2 becomes: the plan must exist and pass `plan-lint.sh`, **unless** no plan exists at
`<plan-dir>/<slug>.md` and the run record holds a `NO-OP(planning):` line. In that case,
append `NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)`, skip
Procedure 1–2, and run Procedure 3 (`gates.phase` once). The guard lives in the Preamble
because a Procedure override cannot see a missing plan. The orchestrator learns of the ledger
line by `grep -F 'NO-OP(planning):'` on the ledger path, the same path that `run-ledger.sh locate`
or the reorient block yields. A plan file that exists alongside a `NO-OP(planning):` line is a
contradiction and raises the blocker `{ implementation, reason, ≤3 options }`. No precedence is
guessed.

The phase gate still runs. Implementation is a floor phase (ADR-144), so "never gateless"
holds. The gate also proves that the decisions-phase commit left the branch green before
review. On a red gate the `NO-OP` and `GATE(implementation): red` lines land without
`PHASE-DONE`; the fix is committed, the gate re-runs, and `PHASE-DONE` lands only with a green
gate, so a rebuild never reads a red phase as closed. Because the walk-step-1 rule
below uses `<base>...HEAD`, review sees that fix.

### Run record lines

One no-op run's planning and implementation tail (`<ledger-prefix>` is `<run-id> <phase>`):

```
PHASE-START(planning): 2026-10-18T10:10:00Z
NO-OP(planning): no part remains — R1 → 1a2b3c4, R2 → 1a2b3c4, R3 → 5d6e7f8
PHASE-DONE(planning): no-op — no part remains
PHASE-START(implementation): 2026-10-18T10:12:00Z
NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)
GATE(implementation): green
PHASE-DONE(implementation): no-op — no plan parts
```

`skills/run/SKILL.md` walk step 7 adds both phases to its produced-outcome sentence, with the
two idioms as examples. `docs/contributing/specs/run-record.md` gains one greppable-only bullet
naming both fixed idioms and their emitters. No regex row is added, because `run-state` keeps
consuming only the generic `NO-OP(<phase>):` prefix (R8, R9).

### Downstream necessity probes (walk step 1)

The table's "since `implementation`" scope is empty when implementation landed nothing, and
that would auto-skip review over a source change an earlier phase committed. Add one sentence
under the table: when the run record holds `NO-OP(implementation):`, the
`review`/`refactoring`/`validation`/`architecture` signals are evaluated over `<base>...HEAD`.
In the precedent run, and in any run where only the design doc, the ADRs and the adr-lint-forced
citation sweeps landed, that diff has no source, so all four auto-skip
(`auto-skip: review — evaluated unnecessary (no source diff in scope)`). Documentation runs as
today and carries the `NO-OP` lines into the PR body (ADR-102).

### Rebuild after compaction (`skills/run/SKILL.md` resume table)

The engine reads every cut correctly (pinned matrix). Two cuts need prose:

| Cut | State | Resume |
|---|---|---|
| planning in flight, no `NO-OP(planning)`, no plan | `inFlight: planning` | existing row: fresh planner respawn from the design. It returns the same no-op. |
| `NO-OP(planning)` without `PHASE-DONE` | cannot happen | walk step 7 puts both in one append call |
| implementation in flight, no plan, ledger holds `NO-OP(planning):` | `inFlight: implementation` | **new clause in the `implementation` row**: append `NO-OP(implementation)` if absent, run the phase gate (fixing a red one first), close the phase only on a green gate |

### ADR, README and corpus counts

- ADR-103 is extended, not reversed: it anticipated other phases adopting the token, so there
  is no `supersedes` and no `DECISION-REVERSAL`. Under the recommended candidates, ADR-144,
  ADR-308 and ADR-367 are untouched.
- The decisions phase authors one ADR per candidate below, plus the ADRs it adopts as
  recommended. Each bumps the README ADR count (635 → …) in the commit that adds it.
- This doc's commit bumps the README design count 80 → 81. This run's plan commit bumps the
  plan count 78 → 79. Under 2 (b), a future no-op run adds no plan file, and "parted plans"
  stays true.

### Edge behaviour

- **Partial landing.** If some requirements are landed and others are not, a normal plan covers
  the remainder, which is today's behaviour. The no-op needs **every** requirement mapped to a sha.
- **Cited sha predates the run.** It fails the `<base>` check. Work that predates the run is not
  something this run delivered, so planning respawns or escalates.
- **Requirement delivered by no commit** (already true on `<base>`): the design should not have
  listed it. The planner cannot map it, so it plans, or the orchestrator escalates. No silent
  no-op.
- **`pipeline.skip: [planning]`** is refused by the strand guard today and is unaffected.
- **Telemetry.** `phaseSkipRecs` ignores `NO-OP(<phase>):` lines (`docs/contributing/specs/telemetry.md`
  L626), so it is unchanged. No `PART` line means no `part-sizing` memory write, which is
  correct because no part was sized.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | The no-op signal | (a) **Commit plan landed**: the orchestrator checks that the design's `### Commit plan` is fully on the branch. (b) **Planner declares an empty Part list** with a requirement → sha justification, and the orchestrator verifies each sha is on the branch and after `<base>`. (c) **Auto-skip probe**: make planning `autoSkipEligible` with a provably-empty signal. | (b) | (a) keys on a section only 2 of 80 designs carry, and a commit plan names commits, not deliverables, so it can drift from Requirements. (c) contradicts ADR-144: planning is strand-excluded because `implementation` consumes `plan` with no `self_supply`. It needs an engine and descriptor change plus a superseding ADR, and implementation is a floor phase that still needs `NO-OP(implementation)`. (b) reuses the existing respawn and escalation budget and ADR-103's justified-no-op shape, needs no engine change, and the sha check makes it auditable rather than asserted. |
| 2 | Plan artifact on a no-op | (a) **Zero-part plan file**: plan-lint accepts a declared marker (e.g. a `<!-- no-parts: … -->` line), and planning commits that file. (b) **No plan file**: planning commits nothing, the `NO-OP(planning):` ledger line is the outcome, and plan-lint is not run. | (b) | (a) changes `plan-lint-main.js` `main()` (the L331 branch and its pinned test), opens a bypass where a planner that forgot its parts can pass by emitting the marker, and adds files to `docs/contributing/plan/` that make the README's "parted plans" count false. (b) leaves plan-lint's verdict untouched (a zero-part file stays red), matches the precedent run, and costs only a Preamble branch in implementation. |

## Test strategy

London-School TDD, `node --test`, Given/When/Then titles, AAA bodies, `sut`, and one behaviour
per test. **Test titles stay printable ASCII** (Stryker tap): no em dash in a title. The em dash
is allowed inside an asserted string.

Prose pins go in `test/no-op-token.test.js` (CJS, `fs.readFileSync` over `ROOT`). Region slices
use `sliceProse` from `test/helpers/region-slice.js`, as `test/run-record.test.js` does.

| Surface | RED test (title gist) | Fails today because |
|---|---|---|
| `skills/planning/SKILL.md` | Given the planning skill, when read, then it names `NO-OP(planning): no part remains` | the literal is absent |
| `skills/planning/SKILL.md` | Given the planning skill Procedure, when read, then the no-op branch checks each cited sha with `merge-base --is-ancestor` against HEAD and base | absent |
| `agents/planner.md` | Given the planner agent, when its final-message contract is read, then it allows `NO-OP: no part remains` | absent |
| `skills/implementation/SKILL.md` | Given the implementation Preamble (slice from `## Preamble` to `## Procedure`), when read, then it names `NO-OP(implementation): no plan parts` and keys on `NO-OP(planning):` | absent |
| `skills/implementation/SKILL.md` | Given the implementation Preamble, when the no-op branch is read, then it still runs the phase gate | absent |
| `skills/run/SKILL.md` walk step 7 (slice `/^7\. \*\*Record outcome/` to `/^8\. \*\*On blocker/`) | Given walk step 7, when read, then both `NO-OP(planning):` and `NO-OP(implementation):` are produced outcomes | the step lists decisions, refactoring and verify only |
| `skills/run/SKILL.md` walk step 1 | Given the necessity-probe region, when read, then a `NO-OP(implementation):` run evaluates over `<base>...HEAD` | absent |
| `skills/run/SKILL.md` resume table | Given the `implementation` resume row, when read, then it covers a missing plan with `NO-OP(planning):` | absent |
| `docs/contributing/specs/run-record.md` | Given the run-record spec, when read, then both fixed idioms appear in the greppable-only list | absent |

Engine GUARDs go in `engine/test/run-state.test.js` (ESM, `deriveRunState`). They are
characterisation tests that pass on their first run, because the engine already behaves this
way:

- New fixture `engine/test/fixtures/run-ledger/planning-no-op.md` (ledger through
  `PHASE-DONE(implementation)`, per the matrix above). Given it, when `deriveRunState` runs,
  then `completed` ends `planning, implementation`, `next` is `review`, `awaitingHarnesses` is
  `['validation']`, `parts` is `[]`, and `warnings` is `[]`.
- An inline-records variant cut after `PHASE-START(implementation)` shows `inFlight` is
  implementation and `next` is review.

plan-lint: no change. The existing `engine/test/plan-lint-main.test.js` L161 test (zero parts
gives exit 2) is the regression pin for candidate 2 (b).

Mirrors: the `agents/planner.md` edit must be followed by `bash scripts/sync-adapter-agents.sh --write`
in the same part. `static-lints.sh` `--check` then gates it. In the part's `### Context`,
backtick the mirrors as one glob `adapters/*/agents/craft-planner.md`. The glob counts as one
file (pinned above), so the part stays within the 6-file ceiling.

Gate: `bash scripts/ci.sh`.

## Out of scope

- A plan-lint marker or zero-part acceptance: candidate 2 (a), which is not recommended.
- Making planning auto-skip eligible, or adding `self_supply: [plan]` to implementation:
  candidate 1 (c), which conflicts with ADR-144.
- A regex row or a `run-state` field for `NO-OP(planning|implementation)`: the pinned matrix
  shows the engine already derives the right state.
- Backfilling a ledger or plan for the supersede-adr-253-symlink-route run: its ledger is closed,
  and dated records stay as they are.
- Defining review's diff scope for normal runs: only the empty-implementation case is clarified.
