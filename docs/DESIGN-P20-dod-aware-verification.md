# Design — Definition-of-Done artifact + DoD-aware verification (P20)

> Brief: P20. Introduce an optional **Definition-of-Done (DoD) artifact** a repo may supply alongside
> PRD/design, and make verification **DoD-aware** — asserting (1) architecture alignment, (2) engineering
> checks green, (3) the DoD is met — where the DoD may *subsume* (1) and (2). **Absence of a DoD raises a
> warning, never a hard block.** The warning must surface through craft's existing run-record→PR-body
> channel (ADR-102) under the greppable `NO-OP(<phase>):`-family vocabulary (ADR-103), not a new ad-hoc
> surface. The CRITICAL tension to resolve head-on: the `architecture` phase is **default-OFF**, so
> "architecture alignment" cannot assume that phase ran.
> Status: **accepted** — decisions phase ratified ADRs 104–110; this doc is revised to the ratified
> direction. **Two ADRs deviate from the original recommendation:** ADR-104 folds DoD-aware verification
> into the **`validation` phase** (not a new `verify` phase — DC-1a was *not* adopted), and ADR-105 makes
> it **default-ON** (not default-OFF). The doc below reads as the accepted record of that direction.

## Context

This is the craft engine dogfooding itself: hexagonal, ports/adapters, descriptor-driven pipeline.
P20 adds *DoD-awareness* to a pipeline that already verifies along three independent seams. Per the
ratified ADRs the DoD-met assertion folds **into the existing `validation` phase** — it does not invent a
parallel phase. The seams, pinned to real code:

**The three existing verification assertions already live in distinct places:**

1. **Architecture alignment** — `skills/architecture/SKILL.md`: a dependency-cruiser boundary check.
   In `pipeline/default.yml` the `architecture` descriptor is **`enabled: false`** (line 127) and its gate
   is the unresolved placeholder `gate: <arch gate>` (line 137). Its preamble already **no-ops with a
   note** when no dependency-cruiser config is present ("*A manifest may never pre-empt this probe.*"). So
   in the default pipeline this assertion **does not run at all** — neither enabled nor configured.
2. **Engineering checks green** — gates. `engine/src/gates.js` resolves a gate per phase
   (`resolveGate`, precedence descriptor.gate → `manifest.gates[phaseId]` → none) and enforces a
   **code-producing floor** (`resolveGateDecisions`: a phase producing `change` with no gate is a
   `floorErrors` refusal). `validation` (`skills/validation/SKILL.md`) mutation-tests the change and **gates
   the PR** via the executing-harness invariant. Its descriptor (`pipeline/default.yml` lines 109–123) is
   `archetype: harness`, `contract: [harness-exec]`, **enabled by default** (no `enabled: false`),
   `gate: <validation gate>`, `harness.tool: stryker`. **This is the phase the DoD-met assertion folds into.**
3. **The DoD is met** — **does not exist today.** No `DoD`, `definition-of-done`, or `acceptance-criteria`
   surface exists in `skills/`, `contracts/`, or `pipeline/default.yml` (grep: only `BACKLOG.md` P20 itself
   and an unrelated mention in ADR-048 / `PLAN-P10`).

**Where the mutation-tooling no-op short-circuits today (the load-bearing pin for the fold).**
`skills/validation/SKILL.md` **Preamble step 2** reads the harness knobs and then **probes: mutation tooling
configured?** "Absent → **no-op with a note** in the run record; **the phase ends here.** A manifest may
never pre-empt this probe." This is the short-circuit ADR-104 forbids the DoD assertion from being trapped
behind: today, no mutation tool ⇒ the whole phase ends before any procedure runs. Under the fold the DoD
assertion must run **whenever the validation phase runs, mutation tool present or not** — so it must be
**hoisted above** this probe's "the phase ends here" exit (see Design §"Restructuring the validation
preamble").

**How a "wait until verified" gate is modelled today (the model the fold inherits for free).** `propose` is
the ship gate. Its preamble (`skills/propose/SKILL.md` step 2) is the **cross-phase invariant**: *"the
validation phase's run has landed or recorded a no-op, survivors are triaged, `gates.phase` is green. Not
yet → wait; never create the PR early."* The orchestrator carries this as `awaitingHarnesses[]` on the
`propose` entry of `Resolution.gateDecisions` (`engine/src/gates.js` `buildProposeDecision` line 100;
`skills/run/SKILL.md` §0 step 1d). Because the DoD check **is part of `validation`** (ADR-104) and
`validation` is the executing-harness already in `awaitingHarnesses`, the DoD check is **gated for free —
no new gate entry, no descriptor change** (`pipeline/default.yml` is unchanged for the phase set). An
executing-harness that **records a runtime no-op releases its propose-gate entry**, symmetric to a
skip-waiver — **ADR-082**, orchestrator/skill prose, *no engine code* (the `emitWaivers` path covers
skip/disable only via `proposeGateReleased`; the runtime-no-op release is the orchestrator clause at
`skills/run/SKILL.md` lines 229–237).

**How a no-op surfaces (the channel P20's warning fits).** Three constraining ADRs, all from P19:

- **ADR-082** — a *recorded* runtime no-op is first-class and releases the propose-gate; mechanism over
  memory; prose not engine.
- **ADR-102** — a phase no-op's PR-body note **IS the run-record line carried into the body**
  (`skills/documentation/SKILL.md` step 3 drafts "the run record" into the body; `skills/propose/SKILL.md`
  step 3 ships it). **No dedicated PR-body bullet, no documentation/propose edit.**
- **ADR-103** — judgment-phase no-ops use a fixed greppable **`NO-OP(<phase>):`** token prefix; the token is
  *defined as extensible* and concern-named. A single `grep -F 'NO-OP('` finds every no-op. The DoD-absence
  outcome uses the **concern-named** token `NO-OP(verify):` (ADR-107) — distinct from `validation`'s
  mutation-absent note, so a *folded* phase still emits two greppable, non-colliding outcomes (ADR-104).
- **ADR-005** — every skip/waiver is loudly visible in the run record; the run record is craft's
  accountability ledger. A warning that isn't recorded is a silent skip — forbidden.

**The manifest surface the DoD artifact extends.** `engine/src/manifest.js`:
- `paths` is a **recognized top-level key** (`TOP_KEYS`, line 13) but has **NO sub-validation** —
  `validateManifest`'s switch falls through with the literal comment *"paths, retrieval, execution:
  recognized; no sub-validation"* (line 631; the switch has no `case 'paths':`). It is
  **reserved-but-inert**.
- The **established `paths.<artifact>` convention** is a per-phase *probe* with a default-dir fallback:
  `skills/decisions/SKILL.md` (`paths.adr`, else `docs/adr/`, create if absent),
  `skills/design/SKILL.md` (`paths.design`, else `docs/design/`),
  `skills/requirements/SKILL.md` (`paths.requirements`, else `docs/requirements/`),
  `skills/planning/SKILL.md` (`paths.plan`, else `docs/plan/`). Each **creates the dir if absent**.
  A DoD inverts that default: a missing DoD must *warn*, not be silently created (ADR-106).
- `checkFileRef` (manifest.js:91 — file-must-exist) is the existing file-ref validator used for
  `context:`/`scripts:`. ADR-110 reuses it for `paths.dod` (the only `paths.*` key that gains validation).

Prior peer docs set the house style: `docs/DESIGN-P19-noop-first-class-phase-outcome.md` (the no-op
vocabulary this builds on) and `docs/DESIGN-P13-nfr-hardening.md`. Design docs live FLAT at
`docs/DESIGN-P<n>-<slug>.md`.

## Requirements

When P20 ships, all of the following are verifiable:

1. **A repo may declare a DoD artifact** via the manifest `paths.dod` key (path to a file); when unset, the
   `validation` phase probes the well-known default **`docs/DOD.md`** (ADR-106). The DoD lists the change's
   acceptance criteria as a free-text markdown checklist (ADR-109).
2. **DoD absence raises a warning, not a block.** When no DoD is declared and none exists at `docs/DOD.md`,
   the `validation` phase records a **first-class no-op** — a `NO-OP(verify): no DoD declared — …` line
   (ADR-103/107 concern-named token) carried into the PR body (ADR-102) — and **proceeds**. It never
   deadlocks `propose` and never fails a gate. The `validation` propose-gate entry is **satisfied** when the
   mutation run landed and triaged green, and **released** (ADR-082) when the phase lands no run at all; the
   verify no-op never blocks the gate either way (see the recorded-vocabulary matrix for the precise
   satisfaction-vs-release split).
3. **Verification is DoD-aware**: when a DoD *is* present, the `validation` phase asserts the change
   satisfies the DoD's criteria. The DoD **may subsume** assertions (1)/(2): a repo's DoD lists "architecture
   clean + checks green + mutation testing clean" plus feature-specific criteria, and the phase reads those
   as DoD criteria rather than re-deriving them (ADR-108/109).
4. **The DoD assertion is independent of validation's mutation-tooling no-op (non-negotiable, ADR-104).**
   When `skills/validation/SKILL.md`'s mutation-tooling probe finds no tool and would end the phase, the DoD
   assertion **still runs** — it is hoisted above that short-circuit. Default-ON (ADR-105) is therefore
   meaningful even where mutation testing is unavailable: the phase no-ops the *mutation* sub-concern with
   its existing note **and** records the DoD outcome.
5. **Architecture-alignment is asserted coherently whether or not the `architecture` phase ran (ADR-108).**
   The DoD **subsumes** (1): a repo that cares about boundaries writes an architecture criterion into its
   DoD. When `architecture` ran and gated green, that gate is the mechanical evidence; when it is OFF/no-op'd
   **and a DoD exists**, the criterion is asserted on the repo's terms; when **no DoD exists at all**, the
   phase records an **honest gap-note** — *the boundary check did not run* — and **never fabricates
   alignment**.
6. **Engineering-checks-green is asserted by reference, not re-run (ADR-108).** The DoD criteria for (2) —
   gates green, mutation testing clean — are **read** from the existing `gates.phase` + `validation`
   mutation results, **never re-run** (Out of scope). This reuses, in-phase, the evidence `validation` itself
   produces.
7. **Every verify outcome is recorded** in the run record and carried into the PR body — DoD-met, DoD-absent
   (`NO-OP(verify):`), DoD-criteria-unmet (blocker), and the arch gap-note are all loud, greppable outcomes
   (ADR-005 — the run record is craft's accountability ledger). `grep -F 'NO-OP('` finds the absence/gap
   lines; `grep 'verify:'` finds the DoD-met line.
8. **Met-ness is recorded per criterion (ADR-109).** Each DoD line gets a recorded outcome (met / unmet /
   not-auto-checkable-asserted), the way `validation` records per-survivor and `architecture` records
   per-violation outcomes. An **unmet** criterion is a **blocker** `{ unit, reason, ≤3 options }` to the
   user — never a silent pass and never a silent gate fail. Headless (Pi adapter, no user): **records the
   blocker and halts** (ADR-095), never degrades to a silent pass.
9. **Manifest `paths.dod` is validated as a file-ref-must-exist-if-declared (ADR-110).** A *declared*
   `paths.dod` pointing at a missing file fails manifest-lint with `paths.dod references missing file:
   <path>`; an **absent** `paths.dod` lints clean (absence is the runtime warning, not a lint error). The
   rest of `paths.*` stays reserved-but-inert.
10. **This repo ships its own `docs/DOD.md`** (ADR-105) — a free-text checklist whose lines include mutation
    testing, gates-green, architecture boundaries, and the P20 feature-acceptance criteria — so its own
    default-ON craft runs stay clean and the dogfooding is real.
11. **The change is bounded** to the `validation`-phase fold, the DoD artifact convention + manifest key
    validation, this repo's `docs/DOD.md`, and the run-skill no-op vocabulary — **no new descriptor, no
    re-running of gates/mutation, no structured DoD schema** (Out of scope).

## Design

The original design surfaced six load-bearing forks (DC-1…DC-6). The decisions phase ratified all six as
ADRs 104–110; **two outcomes deviate from the designer's recommendation** (DC-1 plug-in point → fold into
`validation`, ADR-104; DC-1 sub-axis enablement → default-ON, ADR-105). The Decision-candidates table below
records every resolved outcome with its ADR. The narrative here describes the **folded** mechanics.

### The verification model the fold reconciles

P20's three assertions map onto seams that **already exist and already gate `propose`** — the fold makes the
`validation` phase the single place they are reconciled into one recorded, PR-body-carried verdict:

| Assertion | Existing seam | Runs in default pipeline? | Gates propose? |
|---|---|---|---|
| (1) architecture alignment | `architecture` phase (dependency-cruiser) | **No** — `enabled: false`, `gate: <arch gate>` unresolved | only when enabled (`awaitingHarnesses`) |
| (2) engineering checks green | `gates.phase` + `validation` mutation results | Yes | yes (`propose` preamble: validation landed-or-no-op'd + triaged + `gates.phase` green) |
| (3) DoD met | **folded into `validation`** (ADR-104) | **Yes — default-ON (ADR-105)** | yes, via validation's existing `awaitingHarnesses` entry — **no new gate** |

So P20 is **not** "build a verifier" and **not** "add a phase." It is: **add the DoD-met assertion to the
`validation` phase** and have that phase reconcile (1)(2)(3) — reading (1) from the arch gate when present
(else the DoD criterion, else the gap-note), reading (2) from the gates + mutation results it already
produces, and judging (3) against the DoD checklist. The DoD is the optional artifact that *subsumes* (1)(2)
by listing them as its own criteria (ADR-108).

### Where DoD-awareness plugs in — RESOLVED: fold into `validation` (ADR-104)

The DoD-met assertion + the (1)(2)(3) reconciliation become **part of the `validation` phase**, not a new
`verify` phase (DC-1a, the designer's recommendation, was **not** adopted) and not the `propose` pre-gate
(DC-1b). Consequences pinned to code:

- **No new descriptor / contract bundle / gate.** `pipeline/default.yml` is unchanged for the phase set; the
  `validation` descriptor (lines 109–123) keeps `archetype: harness`, `contract: [harness-exec]`,
  `gate: <validation gate>`. No `consumes`/`produces` edit — the DoD is **not** a pipeline artifact (it is
  repo-authored external input read by the preamble probe, like the PRD/spec paths `requirements`/`design`
  read via `paths.*`); adding `consumes: [dod]` would strand graph validation, which is why the fold reads
  the DoD by probe, never by `consumes`.
- **Gated for free.** `validation` is already the executing-harness in `propose`'s `awaitingHarnesses[]`
  (`engine/src/gates.js` `buildProposeDecision`; `runningExecutingHarnessIds` collects enabled
  `harness-exec` phases, lines 85–89). The DoD check inherits that gate with **no new gate entry** — the
  cross-phase invariant in `skills/propose/SKILL.md` step 2 already covers it verbatim.

### Restructuring the validation preamble — the non-negotiable decoupling (ADR-104)

The structural rule: **the DoD assertion runs independently of validation's mutation-tooling no-op probe.**
Today the mutation probe is `skills/validation/SKILL.md` **Preamble step 2** and ends with "Absent → no-op
with a note in the run record; **the phase ends here.**" That "the phase ends here" exit is the
short-circuit the DoD assertion must not be trapped behind.

The fold restructures the preamble so the mutation probe and the DoD assertion are **two independent
sub-concerns of one phase**, neither gating the other:

- **Hoist the DoD assertion to its own preamble step that runs unconditionally** when the validation phase
  runs — *before* (or beside, but never *inside*) the mutation-tooling probe's terminal "the phase ends
  here" branch. The mutation probe may still no-op the **mutation** sub-concern (its existing note,
  unchanged); it no longer ends the *phase* before the DoD sub-concern runs.
- **Two distinct greppable outcomes from one phase:** the mutation-absent note keeps its existing wording
  (the `validation` mutation no-op), and the DoD outcome uses the **concern-named** `NO-OP(verify):` /
  `verify:` token (ADR-107). They are non-colliding: `grep -F 'NO-OP('` finds both; `grep 'verify'` isolates
  the DoD concern. A repo with **neither** mutation tooling **nor** a DoD records **both** no-ops and still
  releases the single `validation` propose-gate entry (one phase, one gate entry, two recorded sub-outcomes).
- **The DoD assertion reads, never re-runs** the mutation/gate results (ADR-108): when the mutation run
  *did* land, its outcome is the evidence for any "mutation testing clean" DoD criterion; when it no-op'd,
  that DoD criterion is recorded against the no-op (a stated limitation, not a fabricated pass).

This is the only behavioural decoupling the fold demands of the skill prose. It is a `validation`-skill
restructuring, not a new file: the phase's *responsibility widens* (ADR-104 consequence), the gate set does
not.

### How the DoD artifact is declared and located — RESOLVED (ADR-106)

A repo declares its DoD via the manifest key **`paths.dod`** (path to a single file); when unset, the
validation phase probes the well-known default **`docs/DOD.md`**. This mirrors the key-else-default shape of
every existing `paths.<artifact>` probe. **The one deliberate inversion vs precedent:** existing `paths.*`
probes *create the dir/artifact if absent*; a DoD is repo-authored and optional, so its probe **warns on
absence and never creates** (ADR-107). The phase reads the DoD file **verbatim as trusted operator input**
(same trust model as `context:` — manifest-lint is the only gate), never interpreting it as instructions to
the engine.

### How absence becomes a warning — RESOLVED (ADR-107), default-ON (ADR-105)

The brief's "absence raises a warning, never a block" is satisfied **exactly** by craft's recorded-no-op
semantics — no new severity channel. When the validation phase runs and finds no DoD (no `paths.dod`, no
`docs/DOD.md`), it records:

```
NO-OP(verify): no DoD declared — <what was asserted instead: gates green, mutation triaged-or-no-op'd>
```

the ADR-103 token family, here **concern-named `verify`** so it never collides with the mutation-absent
note. The line is carried into the PR body by the existing run-record→body flow (ADR-102) — **no
documentation/propose edit**. Because the DoD check is gated (it folds into `validation`, ADR-104), absence
never deadlocks `propose`: the single `validation` propose-gate entry is **satisfied** by a landed+triaged
mutation run or **released** (ADR-082) when no run lands — the `NO-OP(verify):` outcome never blocks it (see
the recorded-vocabulary matrix for the satisfaction-vs-release split).

**Default-ON interaction (ADR-105).** Because the check folds into the already-enabled `validation` phase,
no descriptor flag changes: the DoD check runs for **every** repo whose `validation` phase runs, and the
absence warning fires for every such repo with no DoD. Combined with the decoupling (Requirement 4),
default-ON is meaningful **even where mutation testing is unavailable** — a repo with neither mutation
tooling nor a DoD gets a loud ledger line, never a default-run block.

### Architecture-alignment when the arch phase is OFF — RESOLVED: DoD subsumes (1), gap-note fallback (ADR-108)

`pipeline/default.yml` ships `architecture` as `enabled: false` with an unresolved `<arch gate>`, so the
fold **cannot assume a boundary check ran**. The ratified resolution:

- **DoD subsumes (1).** Architecture-alignment is a DoD criterion the repo writes (e.g. "module boundaries
  clean"). When `architecture` **is enabled and green**, that gate is the mechanical evidence for the
  criterion (the orchestrator knows `architecture` is in `Resolution.effective[]` iff enabled, and its gate
  result/no-op is in the run record). When it is **OFF/no-op'd**, the criterion is asserted by the DoD on the
  repo's own terms.
- **Honest gap-note fallback.** When **no DoD exists at all**, the validation phase records an honest
  gap-note — *the boundary check did not run* — and **never fabricates alignment**. This pairs with the
  `NO-OP(verify): no DoD declared` line (the gap is recorded, not claimed).

The same subsumption covers (2): engineering checks (gates green, mutation testing clean) are DoD criteria,
evidenced by the existing `gates.phase` + `validation` mutation results and **read, never re-run**. P20 does
**not** flip `architecture`'s `enabled: false` — making verification *aware* of alignment is separate from
enabling the boundary phase (Out of scope).

### What shape the DoD takes — RESOLVED: free-text checklist (ADR-109)

The DoD is a **free-text markdown checklist** (default `docs/DOD.md`) of acceptance-criteria lines, read
**verbatim as trusted operator input**. Met-ness is a **recorded session judgment** per criterion
(met / unmet / not-auto-checkable-asserted) — the way `validation` records per-survivor and `architecture`
records per-violation outcomes. **No schema, no parser.** Criteria that *can* be evidenced mechanically —
mutation testing clean, gates green, architecture boundaries clean — appear as ordinary checklist lines and
are evidenced by the corresponding phase results (ADR-104/108); they are still **recorded** as criterion
outcomes, not silently passed. A structured/checkable schema is explicitly a possible **v2**, out of P20
scope.

### Met-ness, blockers, and the headless path (ADR-109/095)

An **unmet** criterion is a **blocker** `{ unit, reason, ≤3 options }` escalated to the user — never a
silent gate failure and never a silent pass (consistent with `decisions` adopt-without-escalation,
ADR-100). Under the headless Pi adapter there is **no user to escalate a blocker to** (ADR-095: role-less
phases get a defined, recorded, never-silent headless step). An unmet DoD criterion in headless mode
therefore **records the blocker and halts** — it must never degrade to a silent pass. The Pi adapter is a
portability *example*, not a production unattended runner, so this is exemplary-safe behaviour, not a
feature gap.

### The concrete deliverable — this repo's own `docs/DOD.md` (ADR-105/108/109)

Because the check is default-ON and folds into the always-enabled `validation` phase, **this repo's own
craft runs would record `NO-OP(verify): no DoD declared` on every run** until it authors a DoD (this repo
ships stryker, so the mutation sub-concern does *not* no-op — but the DoD sub-concern would). Shipping
`docs/DOD.md` is therefore part of P20: it keeps this repo's default-ON runs clean **and** is the canonical
dogfooding instance of a DoD subsuming engineering-check (2). Its shape is a free-text checklist (the
planning phase parts its authoring); content outline:

- **Mutation testing** — survivors triaged (killed or proven equivalent); a mutation score line, or a
  "per-hunk survivors all triaged" line — the criterion evidenced by the very `validation` phase that hosts
  the DoD check (ADR-108).
- **Gates green** — `gates.phase` passes; nothing committed on red.
- **Architecture boundaries** — either a real criterion ("module boundaries clean") or an explicit
  **N/A** line (the `architecture` phase is OFF in this repo's default), so the gap is *stated*, not
  silently claimed.
- **P20 feature-acceptance criteria** — e.g. "DoD assertion runs independent of the mutation no-op",
  "`NO-OP(verify):` distinct from the mutation note", "`paths.dod` file-ref validated", "per-criterion
  outcomes recorded", "unmet ⇒ blocker" — the verifiable acceptance surface of this very change.

The DoD carries **no provenance refs in a way that would leak into source/test** — it is a docs artifact, so
P20/ADR references are fine in it, the same as any design doc. It lives at the **default** probe path
(`docs/DOD.md`), so this repo needs **no** `.craft/workflow.md` manifest (it has none today) — the default
probe finds it.

### Pinned: the recorded-vocabulary matrix (verify outcomes recorded by the `validation` phase)

The `validation` phase now records two families of outcome — the existing mutation outcomes **and** the
folded verify outcomes below. One `grep -F 'NO-OP('` plus `grep 'verify'` finds every verify outcome,
distinct from the mutation note:

| Situation | Recorded run-record line (by `validation`) | Blocks propose? | In PR body? |
|---|---|---|---|
| No DoD, mutation **landed** | `NO-OP(verify): no DoD declared — <gates green, mutation triaged>` | no (the `validation` gate is **satisfied** by the landed+triaged run; the verify no-op is a recorded sub-outcome) | yes (run record carried, ADR-102) |
| No DoD, mutation **also no-op'd** | mutation no-op note **+** `NO-OP(verify): no DoD declared` | no (the `validation` gate entry is **released** per ADR-082, since no run landed) | yes |
| DoD present, all criteria met | `verify: DoD met — <N criteria, K evidenced by phase results, J session-asserted>` | no | yes |
| DoD present, criterion unmet | blocker `{ verify, "<criterion> unmet", ≤3 options }` → user (headless: record + halt) | yes until resolved | yes (outcome recorded) |
| No DoD **and** arch phase OFF | `NO-OP(verify): no DoD declared` **+** honest gap-note "architecture boundary check did not run" (ADR-108 fallback) | no (gate satisfied/released per the mutation rows above) | yes |
| Mutation tooling absent **and** DoD present | mutation no-op note (unchanged) **+** `verify: DoD met — …` (the decoupling, ADR-104) | no (gate **released** — no mutation run landed; the DoD met-judgment is recorded, not a gate) | yes |

**Gate satisfaction vs release — the subtlety the fold introduces.** The `validation` propose-gate entry is a
*single* entry (one phase, ADR-104). It is **satisfied** when the mutation run lands and triages green
(`gates.phase` green), and **released** (ADR-082) when the phase records a runtime no-op and lands no run. A
`NO-OP(verify): no DoD declared` line is the *DoD* sub-concern's recorded outcome; it never *blocks* `propose`,
but it only *drives* the gate-release in the case where the mutation sub-concern **also** no-op'd. When the
mutation run landed, the gate is already satisfied by that run and the verify no-op rides along as a recorded
note. A DoD-criterion **unmet** is the one verify outcome that *blocks* — as a blocker to the user, not a
silent gate fail (ADR-109).

The `verify:` (met) line is a *positive* recorded outcome distinct from `NO-OP(verify):` (absent input) — the
no-op token is reserved for "input absent / nothing to assert," matching how `validation`/`architecture`
reserve their no-op for absent tool/config. The mutation-absent note keeps its **own** wording and is never
the `verify` token, so the two sub-concerns stay greppable apart within one phase's records.

## Decision candidates

All six forks the original design surfaced are now **RESOLVED** as ADRs 104–110. The table is the accepted
record; every row carries its ratified outcome and ADR. **Two outcomes deviate from the original
recommendation** (DC-1 and its enablement sub-axis), marked **DEVIATION**.

| # | Fork | Original recommendation | **Ratified outcome (ADR)** |
|---|---|---|---|
| DC-1 | **Where DoD-awareness plugs in.** | (a) new `verify` phase, default-OFF | **DEVIATION → fold into the `validation` phase (ADR-104).** Not a new phase, not the `propose` pre-gate. No new descriptor/gate; gated for free via validation's `awaitingHarnesses`. Non-negotiable: the DoD assertion runs independently of validation's mutation-tooling no-op probe. |
| DC-1 sub-axis | **Default enablement.** | default-OFF (zero-config byte-identical) | **DEVIATION → default-ON (ADR-105).** Folds into the already-enabled `validation` phase, so no flag changes; the absence warning fires for every repo with no DoD. Consequence: **this repo ships its own `docs/DOD.md`**, whose checklist includes mutation testing. |
| DC-2 | **DoD artifact location / declaration.** | (c) both — `paths.dod` overrides, `docs/DOD.md` default | **Adopted as recommended (ADR-106).** `paths.dod` key, default `docs/DOD.md`; the one inversion vs precedent: **warn-on-absence, never create-if-absent**. Read verbatim as trusted operator input. |
| DC-3 | **Absence wiring — warning surface.** | (a) recorded `NO-OP(verify):` no-op, reusing ADR-082/102/103 | **Adopted as recommended (ADR-107).** Concern-named `NO-OP(verify): no DoD declared — …`, carried into the PR body (ADR-102); never blocks `propose` (validation's single gate entry is satisfied by a landed run or released per ADR-082 when none lands). No new severity channel. |
| DC-4 | **Architecture-alignment when arch phase OFF (CRITICAL).** | (b) DoD subsumes (1), with the gap-note fallback | **Adopted as recommended (ADR-108).** DoD subsumes (1) and (2); arch gate is mechanical evidence when ON; honest gap-note when no DoD; checks (incl. mutation) **read, never re-run**. Never fabricates alignment. |
| DC-5 | **DoD authoring/consuming shape.** | (a) free-text checklist | **Adopted as recommended (ADR-109).** Free-text markdown checklist; met-ness recorded per criterion as session judgment; unmet ⇒ blocker (headless ⇒ record + halt). Structured schema is v2. |
| DC-6 | **Does `paths.dod` gain lint validation?** | (c) validate `paths.dod` only | **Adopted as recommended (ADR-110).** manifest-lint validates the `paths.dod` file-ref only (via `checkFileRef`); the rest of `paths.*` stays reserved-but-inert; absent `paths.dod` lints clean. |

## Test strategy

The change spans the `validation`-phase fold (skill prose), the `manifest.js` `paths.dod` validation, this
repo's `docs/DOD.md`, and the `run`-skill no-op vocabulary. **No new-phase resolver/descriptor tests** —
there is no new descriptor (ADR-104). Surfaces to prove, with mechanical (P19-style textual) vs prose checks
noted:

- **Manifest lint — `paths.dod` validation (ADR-110), MECHANICAL.** `engine/test/` manifest-lint cases: a
  `paths.dod` pointing at an existing file passes; pointing at a missing file fails with `paths.dod
  references missing file: <path>`; **`paths.dod` absent passes** (absence is the runtime warning, not a
  lint error); a non-`dod` `paths.*` key stays **inert** (regression guard on the reserved-but-inert
  contract — assert no error is raised for `paths.foo`). This is the one new `engine/src/manifest.js`
  code path (a `case 'paths':` calling `checkFileRef('paths.dod', value.dod, …)`), so it carries real unit
  tests, not just prose checks.
- **Validation-skill prose verification (ADR-104/107/108/109), MECHANICAL (P19-style grep over prose).**
  `skills/validation/SKILL.md` must contain: the DoD probe-and-warn preamble step; the DoD assertion
  **hoisted above** the mutation-tooling "the phase ends here" exit (assert the textual order — DoD step
  precedes / is not nested inside the mutation terminal branch); the `verify: DoD met` recorded outcome; the
  `NO-OP(verify):` absent-DoD line **distinct** from the mutation-absent note (assert both tokens present
  and non-identical); per-criterion-outcome recording; the unmet⇒blocker escalation; the
  read-never-re-run clause for (2). These are textual assertions over the skill markdown, matching P19's
  "no `node --test` surface — these are skill-prose edits" precedent.
- **Run-skill vocabulary (ADR-107), MECHANICAL.** `skills/run/SKILL.md` step 6 must name a `verify` no-op as
  a non-gap terminal outcome (extend the existing judgment-no-op clause's vocabulary to `verify`); the
  recorded-no-op release clause (lines 229–237) already releases an awaited harness's gate entry on a
  recorded no-op — assert the prose still covers `validation` recording a `NO-OP(verify):` as such a
  release **only when the phase records no landed run** (the release path), not when the mutation run
  landed and the gate is satisfied directly (no new clause needed; this is a coverage check, not an edit,
  unless the prose names tokens explicitly).
- **`docs/DOD.md` exists for this repo (ADR-105), MECHANICAL.** A test/CI guard asserts `docs/DOD.md` is
  present and is a non-empty markdown checklist that includes a mutation-testing line — so this repo's own
  default-ON runs never record `NO-OP(verify): no DoD declared`.
- **Cross-phase invariant unchanged, PROSE.** The `propose` cross-phase invariant
  (`skills/propose/SKILL.md` step 2) still holds verbatim — `propose` never starts before `validation`
  landed-or-no-op'd + triaged + `gates.phase` green. Because the fold adds **no** gate entry, the existing
  `gates.js` executing-harness gate-decision tests already cover the gating; assert no regression (the
  `validation` entry still appears in `propose`'s `awaitingHarnesses[]`), but **do not** add a new
  descriptor/`awaitingHarnesses` entry expectation.
- **Edge matrix to exercise (PROSE walkthrough / fixture-level where a fixture exists):** (i) no DoD, arch
  OFF → `NO-OP(verify)` + honest arch gap-note, propose proceeds; (ii) DoD present, arch ON green → DoD met,
  (1) evidenced by arch gate; (iii) DoD present, arch OFF, DoD lists an arch criterion → DoD subsumes (1);
  (iv) DoD criterion unmet → blocker to user; (v) **mutation tooling absent + DoD present** → mutation
  no-op note **and** `verify: DoD met` (the decoupling, ADR-104 — the key new edge the fold introduces);
  (vi) headless Pi path (role-less, no user) — unmet criterion records the blocker and halts, never silently
  passes (ADR-095); (vii) neither mutation tooling nor DoD → both no-ops recorded, single validation gate
  entry released.
- **Grep symmetry, MECHANICAL.** A single `grep -F 'NO-OP('` finds the `NO-OP(verify):` absent-DoD line
  alongside the decisions/refactoring/mutation lines; `grep 'verify:'` finds the DoD-met positive outcome,
  not the mutation note.
- **No provenance leakage.** `P20`/ADR-104…110 refs live only in this doc, the ADRs, and `docs/DOD.md` —
  never in skill prose, `manifest.js`, or test code (core contract).

## Out of scope

- **Re-running gates or mutation inside the DoD check.** Assertion (2) is asserted *by reference* to the
  existing `gates.phase` + `validation` mutation results (Requirement 6, ADR-108); duplicating the run would
  be waste and could diverge from the authoritative gate.
- **A new phase / descriptor / gate.** ADR-104 folds into `validation`; `pipeline/default.yml` is unchanged
  for the phase set and there is no new `awaitingHarnesses` entry.
- **A structured DoD schema/parser** — ADR-109 lands on free-text read verbatim; a structured/checkable
  schema is explicitly a possible **v2**.
- **Widening `paths.*` validation beyond `dod`** — ADR-110 bounds the lint change to `paths.dod`; the rest
  of `paths` stays reserved-but-inert. A general `paths` validator is a separate item.
- **A new PR-body "warning" surface** — ADR-102/107 forbid a dedicated bullet; the verify outcome rides the
  run-record→body carry. Untouched: `skills/documentation/SKILL.md`, `skills/propose/SKILL.md`
  body-drafting.
- **Enabling the `architecture` phase by default** — ADR-108: P20 makes verification *aware* of
  architecture-alignment (via subsumption / gap-note), it does **not** flip `architecture`'s
  `enabled: false`.
- **Retrofitting other phases' no-op tokens** — P20 only *adds* the `verify` concern token to the family; it
  does not change `validation`'s mutation-absent note wording or any other phase's tokens.
- **Reopening ADR-082/102/103** — P20 *reuses* the recorded-no-op + token + PR-body-carry model; it does not
  revise it.
