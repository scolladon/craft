# Design — Auto-skip phases craft evaluates as unnecessary

> Brief: P26 — before entering a phase, craft decides from the actual change whether the phase has any work; if it provably does not, **auto-skip** it and record why — **unless** the phase is pinned `required:` in config. This generalizes the P19 runtime no-op (phase *ran*, found nothing) into a cheaper *didn't-need-to-run* decision, and is the inverse of `pipeline.skip` (operator skips a phase craft would run; here craft skips a phase the operator didn't pin). `required:` is the operator's escape hatch against a wrong evaluation.
> Status: draft → self-reviewed ×3 → accepted

## Context

### What "skip a phase" means today — four existing mechanisms

craft has four ways a phase does not run, all of which the orchestrator already surfaces in the run record. P26 adds a fifth, distinct from all of them:

1. **Operator waiver** — `pipeline.skip: [<id>]` (or per-invocation `--skip`). The resolver removes the phase via `applyEnableEdits` (`engine/src/resolve.js:252`), the strand guard (`engine/src/strand.js`) refuses a skip that strands a live consumer, and `engine/src/gates.js` `emitWaivers` emits a `WAIVER:` record line for the four waivable phases (`review`, `refactoring`, `validation`, `architecture`) — releasing the `propose`-gate when an executing-harness is waived (`gates.js:162-196`).
2. **Default-off descriptor** — `enabled: false` in `pipeline/default.yml` (today: `requirements`, `architecture`). A default-off descriptor left disabled is **not** a strand (`strand.js:27` comment). A `phases.<id>.enabled: false` manifest override produces the same waiver path as a skip (`gates.js:171`).
3. **Runtime no-op (P19, ADR-100-103)** — the phase *ran* and found nothing: `decisions`/`refactoring` record `NO-OP(<phase>):`; `validation`'s mutation sub-concern and DoD sub-concern (`NO-OP(verify):`) record the same shape. ADR-103 fixed the greppable token `NO-OP(<phase>):` and **explicitly defined it extensible** to `architecture`/`validation`. ADR-082 made a recorded executing-harness no-op *release* its `propose`-gate entry — the orchestrator treats a recorded no-op as a release at gate-check time (`skills/run/SKILL.md` Cross-phase invariants).
4. **Policy refusal (P23)** — orthogonal: policy governs *outward actions* a phase performs, not whether the phase has work. Not relevant to P26 (the brief calls this out).

**What none of these do** is *evaluate, up front, whether a phase is even needed for this change* and skip it when it provably has nothing to do. That is P26.

### The two homes for the decision — pinned empirically

The brief says evaluation uses "the actual change (diff shape…)" — which only exists **after** implementation, at runtime, inside the walk. But `required:` and stranded-consumer safety are **static config logic** the resolver already owns. The responsibility therefore splits across the resolver (pure, config-derived) and the walk (dynamic, diff-derived). The pins below establish exactly what each side already does.

**The resolver (`engine/src/resolve.js` `resolvePipeline(defaults, manifest, opts)` → `Resolution`).** Pure, immutable, no I/O. It already:
- folds `phases.<id>` manifest overrides into a `phaseOverrides` Map (`resolve.js:250`) — **this is the channel a `phases.<id>.required` knob rides**, identical to how `enabled`/`harness`/`role` arrive;
- runs `checkStrandedConsumers(defaults, skipSet, effective)` (`strand.js`) — the exact "never remove an artifact a later enabled phase consumes without an alternative producer" guard;
- builds `record[]`, `gateDecisions[]` (each `{ phaseId, gate, codeProducing }`; the `propose` entry adds `awaitingHarnesses[]`), and `waivers[]`;
- emits `effective[]` as enabled descriptors. **Empirically pinned**: an `effective[]` descriptor carries `{ id, archetype, enabled, contract, procedure, consumes, self_supply, produces, execution, role?, gate?, harness?, model? }` — **no auto-skip field today**, so a new per-descriptor signal is purely additive.

**Empirical strand-guard matrix** (ran `checkStrandedConsumers` against `pipeline/default.yml`, removing each candidate from `effective[]`):

| Auto-skip candidate | Produces | Strand result | Why |
|---|---|---|---|
| `review` | `review-report` | `[]` no strand | nothing consumes `review-report` |
| `refactoring` | `change` | `[]` no strand | `implementation` (`pipeline/default.yml:75`) is the alternative `change` producer earlier in the pipeline (`strand.js:41` `hasAlternative`) |
| `documentation` | `docs` | `[]` no strand | nothing consumes `docs` |
| `design` | `design` | **strand refused** | `documentation`/`planning` consume `design` with no alternative producer |

This is the decisive pin: the *same* strand logic that gates `pipeline.skip` already encodes "which phases are safe to remove" — auto-skip eligibility reuses it verbatim.

**The walk (`skills/run/SKILL.md`).** Walks `Resolution.effective[]`; per phase resolves the skill, assembles the injected contract, executes, gates, and records the outcome (step 6). The live diff exists only here. Existing surfacing tokens: `WAIVER:` (operator/disable skip, pre-formatted into `record[]`), `NO-OP(<phase>):` (P19 runtime no-op), `POLICY(...)` (P23 consult). The propose-gate release on a recorded no-op is already orchestrator-owned (treat a recorded no-op as a release at gate-check time).

**The lint (`engine/src/manifest.js` `validateManifest`).** Separate from the resolver. `PHASE_FIELDS` (`manifest.js:31`) is the frozen whitelist of accepted `phases.<id>` keys: `context, override, strategy, merge-flags, non-blocking-jobs, harness, execution, enabled, role, model, procedure`. **Empirically pinned**: `phases.review.required: true` is **rejected today** — `unknown field on phase review: required` — while `phases.review.enabled: false` passes. So the `required:` knob requires adding `required` to `PHASE_FIELDS` plus a boolean-type validation arm, mirroring the existing `enabled` arm exactly (`manifest.js`: `else if (field === 'enabled' && typeof value !== 'boolean')`). Note `skip:` on a phase is inert by design (ADR-011) and stays rejected.

### Constraining ADRs / docs

- **ADR-005** — every skip/waiver is loudly visible in the run record; craft's accountability ledger. An auto-skip is a non-run and MUST be recorded with the same loudness.
- **ADR-011** — per-phase `skip:` is inert; skips live at `pipeline.skip`. The `required:` knob is the *inverse* of a skip and is a legitimate phase field; it does not reintroduce per-phase skip.
- **ADR-082** — a recorded executing-harness runtime no-op releases its `propose`-gate. An auto-skipped executing-harness must release identically (it is even more clearly "no run landed").
- **ADR-100-103 (P19)** — runtime no-op is first-class and recorded. **ADR-103 defined `NO-OP(<phase>):` as extensible to `architecture`/`validation`.** P26 must decide whether auto-skip reuses this token or needs its own — the brief asks for a *distinct* signal because auto-skip is "didn't-need-to-run", not "ran-found-nothing" (decision candidate 4).
- **ADR-124-130 (P23)** — the precedent for *adding a resolution signal cleanly*: a pure `engine/src/` helper, an additive `Resolution` field, one orchestrator seam, a small frozen vocabulary map beside the logic. P26 mirrors this shape.
- **`docs/adapters/gate.md`** — gate-string resolution `descriptor.gate → manifest.gates[phaseId] → none`; code-producing phases with no gate are a floor error. Auto-skip must never touch a floor phase like `implementation` (categorically ineligible — see D2); the strand-clean re-producer `refactoring` is the one code-producing phase that *is* eligible (ADR-144).

This design is **a pure resolver-side eligibility helper + an additive `Resolution` signal + a `required:` manifest knob (schema + validation) + thin walk prose for the dynamic necessity probe and surfacing**. It adds **no new port and no engine bin change**; it does not lower any of the three engine floors (`never-commit-on-red`, `validation-triage-gates-propose`, `artifact-handoff`).

## Requirements

When this ships, all of the following are verifiable:

1. **R1 — Up-front necessity evaluation.** Before entering an *eligible* phase, craft evaluates whether the phase has any work against the actual change, and **auto-skips** it (does not run it) when it provably has none. This is a *didn't-run* decision, distinct from a *ran-found-nothing* P19 no-op.

2. **R2 — Static eligibility, pure and resolver-owned.** The resolver computes, per phase, whether it is *eligible* for auto-skip. A phase is **ineligible** if it is one of the four floor phases (`workspace`/`implementation`/`propose`/`integrate`), if it is `required: true` in config, or if auto-skipping it would strand a live consumer (reusing `checkStrandedConsumers`). There is **no separate code-producing rule and no archetype allowlist** — producer/spec phases self-exclude via the strand guard (ADR-144, user choice). Eligibility is an additive per-descriptor field on `Resolution`; it never throws and never changes which phases are `enabled`.

3. **R3 — `required:` config override.** A per-phase manifest knob `phases.<id>.required: true` forces an eligible phase to run regardless of the necessity evaluation. It is validated by `validateManifest` (lint exit 0 for the knob; the field is rejected today). Its default is **opt-out per phase** (absent = not required = eligibility decided by the rules in R2). Its precedence vs `pipeline.skip`/`enabled: false` is settled by decision candidate 3.

4. **R4 — Consumer-strand safety honoured.** An auto-skip never removes a phase whose `produces` a later enabled phase `consumes` without an alternative producer. The same `checkStrandedConsumers` logic that guards `pipeline.skip` guards auto-skip eligibility — no second strand implementation.

5. **R5 — Distinct, greppable surfacing.** An auto-skip records its own fixed token in the run record — `auto-skip: <phase> — evaluated unnecessary (<signal>)` — distinct from `WAIVER:` (operator/disable) and `NO-OP(<phase>):` (ran-found-nothing). A single grep finds every auto-skip across run records and PR bodies (per repo memory `prefer-fixed-greppable-tokens`).

6. **R6 — Floors are categorical; producers self-exclude via strand.** The four floor phases (`workspace`, `implementation`, `propose`, `integrate`) are categorically ineligible **in code** — an eligibility bug can never silently drop them. The producer/spec phases `design` and `planning` (and `requirements` when enabled) are ineligible because auto-skipping them strands a consumer — the strand guard, not a separate code-producing rule, excludes them. (`decisions` is the exception: `planning` self-supplies `decisions`, so it is strand-clean and **is** eligible — an implementation finding that corrected the original truth table.) `refactoring` (a code-producing *re-producer*, strand-clean because `implementation` is an earlier alternative `change` producer) **is** eligible (ADR-144, user choice).

7. **R7 — Auto-skipped harness releases its propose-gate.** An auto-skipped executing-harness (`validation`, `architecture` when eligible) releases its `awaitingHarnesses` entry **via the same orchestrator-owned recorded-no-op release path as a runtime no-op** (ADR-082) — *not* the engine skip-waiver path (which is for phases absent from `effective[]`; an auto-skipped phase is still in `effective[]`). `propose` is never left waiting on a phase that did not run.

8. **R8 — No silent state, no lowered floor.** Every auto-skip is recorded (R5); every refusal-to-skip (required pin, strand, floor) is the phase simply running as today. The three engine floors are untouched. The change adds no new runtime port and no engine bin change.

9. **R9 — No provenance leakage.** No `P26`/ADR/backlog references appear in any emitted token, source, or test. Provenance lives in this design doc, the ADRs, and the PR body only.

## Design

The decision splits across two homes, mirroring how P19/P23 split a pure core from orchestrator judgment:

- **Resolver (pure, static, config-derived):** computes per-phase auto-skip **eligibility** — a phase that *may* be auto-skipped because doing so is structurally safe and not vetoed by config. Emitted as an additive per-descriptor signal in `Resolution`. Unit- and mutation-testable.
- **Walk (dynamic, diff-derived):** for each *eligible* phase only, runs the **necessity probe** against the live change and, when the phase provably has no work, auto-skips it — recording the `auto-skip:` token and (for harnesses) releasing the propose-gate. Prose, covered by scenario fidelity.

```
  resolvePipeline(defaults, manifest, opts)         ── PURE / STATIC ──
        │
        ▼
  for each effective descriptor:
     autoSkipEligible = computeAutoSkipEligibility(descriptor, manifest, effective, defaults)
        │   eligible ⇔  NOT a floor phase {workspace,implementation,propose,integrate}  (D2 categorical)
        │          AND  NOT required:true                    (D3 config veto)
        │          AND  checkStrandedConsumers(... skip it) == []   (R4 reuse; producers self-exclude)
        │   ── no code-producing rule, no archetype allowlist (ADR-144, user choice) ──
        ▼
  Resolution.effective[i].autoSkipEligible : boolean   (additive; default false)


  walk over Resolution.effective[]                  ── DYNAMIC / DIFF ──
     per phase, at entry, BEFORE assembling the contract:
        if phase.autoSkipEligible AND necessityProbe(phase, liveChange) == EMPTY:
            record  `auto-skip: <phase> — evaluated unnecessary (<signal>)`   (D4)
            if phase is an executing-harness: release its awaitingHarnesses entry   (D5 / R7)
            continue            ← phase does NOT run, no contract assembled, no commit
        else:
            run the phase exactly as today
```

### D1 — Where the pure boundary sits

The resolver gains a single pure helper — `computeAutoSkipEligibility(descriptor, manifest, effective, defaults)` → `boolean` — called once per effective descriptor during `resolvePipeline`, and an additive `autoSkipEligible` field on each `effective[]` descriptor (default `false`). This is the entire engine-side change to the resolution data, mirroring how P23 attached an additive `Resolution.policy` field (ADR-125) without disturbing `effective[]`/`gateDecisions[]`/`waivers[]`.

The helper is pure (no I/O), composes the existing `checkStrandedConsumers` rather than reimplementing strand logic, and never mutates inputs. The eligible-archetype membership and floor membership live in small frozen sets beside the helper (the P23 `POLICY_ACTIONS`/`DEFAULT_VERDICT` precedent — a frozen map beside the logic). It does **not** decide necessity — only eligibility. Necessity is the walk's, because only the walk has the live diff.

The mark is computed **only over `effective[]`** (enabled descriptors). A default-off descriptor (`requirements`, `architecture` until enabled) or a manifest-disabled phase (`enabled: false`) is absent from `effective[]` entirely — it is already gone via the disable/waiver path (`gates.js:171`) and never receives an `autoSkipEligible` mark. Auto-skip and disable are therefore mutually exclusive: a disabled phase is not auto-skipped, it is simply not present.

### D2 — Eligibility: which phases the resolver marks `autoSkipEligible`

A phase is eligible **only if all** hold (any failure ⇒ ineligible ⇒ `autoSkipEligible: false` ⇒ the walk never even probes it):

- **Not a floor phase.** The four floor phases are never auto-skippable: `implementation` (gates the change, `never-commit-on-red`), `propose` (the `validation-triage-gates-propose` floor), `workspace` (setup, produces the worktree everything consumes), and `integrate` (merge/cleanup, irreversible delivery). Categorical, **in code** (R6) — never an overridable config default.
- **Not `required: true`** in resolved config (D3).
- **Strand-clean** — `checkStrandedConsumers(defaults, new Set([id]), effective) === []`, the same call shape as the existing skip-strand guard (`resolve.js:286`). The guard simulates removing `id`: it checks whether any *other* enabled consumer of `id`'s `produces` lacks an alternative producer (`hasAlternative` excludes `id` itself at `strand.js:42`), so the full `effective` list is passed unchanged — no "effective-without-id" pre-filter. This is the R4 reuse and, with the floor check, the **whole** eligibility rule — there is **no separate code-producing rule and no archetype allowlist** (ADR-144, user choice). The eligible set falls out *naturally* as the consequence of "non-floor ∧ strand-clean": over the default pipeline it is exactly `{decisions, review, refactoring, validation, documentation}` (+ `architecture` when enabled). `design` and `planning` self-exclude because auto-skipping them strands a consumer (`documentation` consumes `design`; `implementation` consumes `plan` — neither self-supplies). `decisions` is eligible: its only consumer `planning` carries `decisions` in `self_supply`, so the strand guard skips it (this corrects an earlier draft that listed `decisions` as stranded — an implementation finding folded back). `refactoring` (a code-producing *re-producer*) is eligible because `implementation` is an earlier alternative `change` producer, so removing it strands nothing.

Eligibility is necessary but not sufficient: an eligible phase still **runs** unless the walk's dynamic necessity probe (D4) finds it empty.

### D3 — The `required:` knob (schema, validation, precedence)

**Shape.** A boolean field `phases.<id>.required` on a phase block, e.g.:

```yaml
phases:
  review:
    required: true        # never auto-skip review in this repo, whatever the evaluation says
```

**Schema + validation.** Add `required` to `PHASE_FIELDS` (`manifest.js:31`) and a boolean-type arm in `validatePhaseBlock` mirroring the existing `enabled` arm verbatim: `else if (field === 'required' && typeof value !== 'boolean') errors.push('phases.<id>.required must be a boolean')`. No new top-level key, no `switch` arm — it rides the existing `phases.<id>` validation path. The knob arrives at the resolver through the existing `phaseOverrides` Map untouched (empirically pinned: the resolver already ignores-or-reads unknown phase fields without error; adding it to the schema makes lint accept it).

**Default — opt-out per phase.** Absent `required` ⇒ `required: false` ⇒ eligibility decided by D2. This is the least-surprising default: auto-skip is the new behaviour P26 introduces, and `required:` is the escape hatch *against* it, so the hatch defaults closed (phases participate in evaluation) and an operator opts a specific phase out of evaluation by pinning it.

**Semantics — narrow (recommendation; decision candidate 3).** `required: true` defends a phase **only against auto-skip** (and, symmetrically, against a runtime no-op silently dropping it from the record — it forces the phase to run and record). It does **not** override an explicit operator `pipeline.skip`/`--skip` or `enabled: false`: the operator's own waiver is a deliberate, loud, ADR-005-recorded act and outranks a "never auto-skip" pin. The two never collide in practice (an operator who both skips and requires a phase has a config error worth surfacing — see decision candidate 3 for whether that is a lint error or a precedence rule).

### D4 — The dynamic necessity probe + the `auto-skip:` token (walk prose)

For each `effective[]` phase with `autoSkipEligible: true`, **at phase entry, before assembling the injected contract**, the walk runs a per-phase **necessity probe** against the live change. The probe is tool-agnostic prose judgment (like the existing `validation` mutation-tooling probe and the gate probe), per-phase:

| Eligible phase | Necessity signal (provably empty ⇒ auto-skip) |
|---|---|
| `decisions` | the design doc's Decision-candidates section is empty — no load-bearing choice to put to the user (the up-front form of the P19 `decisions` no-op). Session-owned: auto-skip avoids an empty user conversation rather than an agent spawn. An operator who always wants the control point pins `phases.decisions.required: true`. |
| `review` | the change the phase `consumes` (`change`) is empty in the phase's scope — no reviewable diff since `implementation` (e.g. a docs-only or config-only change with no source touched, where the review dimensions have nothing to inspect) |
| `documentation` | no `design`/`change` content maps to any documentation surface (decision candidate 2 pins the exact signal — e.g. an empty doc-affecting diff) |
| `validation` (when enabled) | no mutable code changed in the validation scope — equivalent to the P19 mutation no-op, but evaluated *before* spawning the run |
| `architecture` (when enabled) | no dependency-graph-affecting change — no import/module-boundary edits since `implementation` |
| `refactoring` | no source change in scope to motivate a whole-codebase structural pass — same signal as `review` (a docs/config-only change leaves nothing for a structural pass to act on); when source *was* touched, `refactoring` runs and may itself record `NO-OP(refactoring):` (P19) |

When the probe finds the phase **provably empty**, the walk:
1. records the fixed token `auto-skip: <phase> — evaluated unnecessary (<signal>)` in the run record (e.g. `auto-skip: review — evaluated unnecessary (no source diff in scope)`);
2. for an executing-harness, releases its `awaitingHarnesses` entry (D5);
3. **continues without running the phase** — no contract assembled, no agent spawned, no commit.

When the probe is non-empty (or the phase is ineligible), the phase runs exactly as today.

**Token distinctness (decision candidate 4).** The recommended token is a new fixed prefix `auto-skip:` — distinct from `WAIVER:` (operator/disable, an operator's choice) and `NO-OP(<phase>):` (the phase *ran* and found nothing). The brief explicitly wants this distinction visible: an auto-skip is craft's *own* up-front judgment that the phase had no work, which is auditable separately from both an operator waiver and a ran-then-empty no-op. The token flows into the PR body via the existing run-record→PR-body carry (the P19 precedent — `documentation/SKILL.md` step 3 includes the run record; no new plumbing). It is **walk-appended** (dynamic), not a `Resolution.record[]` line (the eligibility is static and rides `effective[].autoSkipEligible`; the *decision to skip* is dynamic and only the walk can record it).

### D5 — Interaction with the propose-gate and with P19 no-op (R7)

**Propose-gate release.** The walk already treats a recorded executing-harness runtime no-op as a release of its `awaitingHarnesses` entry at gate-check time (ADR-082; `skills/run/SKILL.md` Cross-phase invariants). An auto-skipped executing-harness is *even more clearly* a non-run: the walk releases its `awaitingHarnesses` entry the same way. This is orchestrator-owned (the engine emits `waivers[]` only for skip/disable phases absent from `effective[]`; an auto-skipped phase is still in `effective[]`, exactly like a runtime-no-op'd one). No `gates.js` change.

**Auto-skip vs. P19 no-op — when does each fire.** They are two points on a timeline:
- **Auto-skip (P26):** decided *before* the phase runs, from the change shape. The phase never runs. Token `auto-skip:`.
- **No-op (P19):** decided *during/after* the phase ran, having found nothing actionable. Token `NO-OP(<phase>):`.

For `decisions` (a P19 judgment phase): it **is** in the P26 eligible set (corrected from the original draft). Although it produces `decisions`, its only consumer `planning` self-supplies that artifact, so auto-skipping it strands nobody — strand-clean ⇒ eligible (ADR-144). Its necessity signal is provable: the design doc's Decision-candidates section is empty. Auto-skipping is the up-front form of its existing P19 no-op (`NO-OP(decisions):`); when there *are* candidates it runs as today. Being the user's control point, an operator who never wants it dropped pins `phases.decisions.required: true`.

For `refactoring` (the other P19 judgment phase): the decisions phase **widened the eligible set to include it** (ADR-144, user choice). It is strand-clean (`implementation` is an earlier alternative `change` producer), so it is eligible; its necessity signal is the same as `review`'s — auto-skip when no source changed in scope (a docs/config-only change leaves nothing for a structural pass to act on). When source *was* touched, `refactoring` runs exactly as today and may record `NO-OP(refactoring):` (P19). So `refactoring` now has *both* outcomes available: an up-front `auto-skip:` on a provably-empty change, and a ran-then-empty `NO-OP(refactoring):` otherwise.

For `validation`/`architecture`/`refactoring`: P26 lets them auto-skip *before* spawning the agent/run when the diff shows no in-scope mutable/graph/source change — strictly cheaper than the P19 path (which spawns, probes, finds nothing, records `NO-OP`). For `validation` both outcomes also release the propose-gate; the auto-skip path simply avoids the spawn. The recorded token differs (`auto-skip:` vs `NO-OP(<phase>):`) so a reader can tell "we judged it unnecessary and never ran it" from "we ran it and it found nothing."

### D6 — Error / edge semantics

| Condition | Behaviour |
|---|---|
| Phase is a floor / producer-spec (auto-skip strands a consumer) | Ineligible at resolver (`autoSkipEligible: false`); the walk never probes; phase runs as today (R6). No separate code-producing rule — `refactoring` (strand-clean re-producer) is eligible. |
| `phases.<id>.required: true` on an eligible phase | Ineligible (config veto); phase runs as today and records normally (R3). |
| Auto-skip would strand a live consumer | Ineligible (strand backstop, `checkStrandedConsumers`); phase runs as today (R4). |
| Eligible phase, necessity probe non-empty | Phase runs exactly as today; no token. |
| Eligible phase, necessity probe provably empty | `auto-skip:` recorded; phase does not run; harness releases its propose-gate (R5/R7). |
| Necessity probe ambiguous (cannot prove empty) | **Default to running the phase.** "Provably empty" is the bar; doubt runs the phase. Mirrors P19's "when in doubt, escalate" — here, when in doubt, run. Never auto-skip on an unprovable judgment. |
| `required: true` AND `pipeline.skip: [<id>]` for the same phase | Settled by decision candidate 3 (recommended: operator skip wins; the contradiction is surfaced — lint error or loud record line). |
| `review` auto-skips, then a later `construction`/`refinement` phase adds behaviour | The **scope-expansion-re-enters-harness-read invariant** (`skills/run/SKILL.md` Cross-phase invariants) still binds: an auto-skipped `review` is not a licence to ship later-added behaviour unreviewed. Auto-skipping `review` is sound only because the diff was provably empty *at review's scope point*; any subsequent non-empty `change` (e.g. a non-no-op `refactoring`) re-triggers the scoped re-review just as it would have if `review` had run-and-been-clean. The auto-skip records the empty-scope state; it does not suppress the invariant. This is why `review`'s necessity signal is scoped to "no reviewable diff *in scope*", not "no diff ever". |

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | **Static/dynamic responsibility split** — where the auto-skip decision lives | (a) **Resolver computes static eligibility** (pure, TDD-able: floor/required/code-producing/strand) → additive `effective[].autoSkipEligible`; **walk runs the dynamic necessity probe** against the live diff for eligible phases only, emitting `auto-skip:`. (b) **Fully-static resolver heuristic** — resolver decides skip from config + descriptor shape alone, no diff. (c) **Fully-dynamic walk decision** — no resolver support; the walk decides eligibility *and* necessity. | **(a)** | The brief's signal ("the actual change, diff shape") only exists at runtime, so necessity is inherently dynamic — (b) cannot see the diff and would skip phases that *do* have work. But eligibility (floor/required/strand) is pure config logic the resolver already owns and the strand guard already implements — (c) would duplicate `checkStrandedConsumers` in prose and leave floor-exclusion untested. (a) puts the testable invariant (you can never skip a floor/producer/stranding phase) in a pure mutation-tested helper, and the unprovable judgment (is there work?) in walk prose — the exact P19/P23 split. |
| 2 | **Eligible set + per-phase necessity signal** — which phases may auto-skip and what makes each provably empty | (a) **Minimal**: `review` + `documentation` only (read-harness + delivery, both strand-clean, neither spawns an irreversible/expensive run); signal = empty consumed-`change` in scope. (b) **Minimal + executing harnesses**: (a) plus `validation`/`architecture` when enabled (auto-skip before the spawn when no in-scope mutable/graph change); reuses the P19 emptiness signal pre-spawn. (c) **Broad**: (b) plus the judgment phases `decisions`/`refactoring`. | **(b)** | (a) is the safest but leaves the biggest win on the table — auto-skipping `validation`/`architecture` *before* the spawn is strictly cheaper than the P19 ran-then-no-op path and is the clearest case of "the diff proves no work." (c) is rejected: `decisions`/`refactoring` are producer/code-producing (empirically: `refactoring` has `change ∈ produces`), their value is not provable-empty from the diff (a whole-codebase refactor scan; a fork check), and moving them off the P19 path risks dropping real work. (b) covers exactly the phases where emptiness is diff-provable and strand-clean. |
| 3 | **`required:` precedence vs operator skip / disable** — does `required: true` only defend against auto-skip, or also override an explicit `pipeline.skip`/`enabled:false`? | (a) **Narrow**: `required` defends only against auto-skip (and silent no-op); an explicit operator `pipeline.skip`/`--skip`/`enabled:false` still wins (the operator's loud, ADR-005-recorded waiver outranks a "don't auto-skip" pin). A same-phase `skip`+`required` is a **lint error** (surfaced, never silently resolved). (b) **Strong**: `required` overrides even an operator skip (the phase always runs). (c) **Narrow, precedence-not-error**: like (a) but `skip` silently wins over `required` with a record line, no lint error. | **(a)** | Least surprising and preserves operator authority (ADR-005/ADR-022: per-invocation operator intent is highest-precedence and loud). `required:` is scoped to its job — defeating *craft's* automatic evaluation — not to overriding the *operator's* explicit choice. (b) would let a repo-committed manifest silently veto a deliberate `--skip` at the CLI, inverting the precedence ladder. Making the contradiction a lint error (vs (c)'s silent precedence) matches craft's "surface, never silently resolve" ethos — but whether it's a hard lint error or a loud-record precedence rule is the residual sub-choice for the ADR conversation. |
| 4 | **Surfacing token** — exact `auto-skip:` spelling and whether it reuses the P19 `NO-OP(<phase>):` token | (a) **New fixed token** `auto-skip: <phase> — evaluated unnecessary (<signal>)`, walk-appended, distinct from `WAIVER:`/`NO-OP(<phase>):`. (b) **Reuse `NO-OP(<phase>):`** (ADR-103 defined it extensible) with an `(evaluated)` qualifier. (c) **Ride `Resolution.record[]`** as a static line from the resolver. | **(a)** | The brief explicitly wants a *distinct* signal — auto-skip ("didn't need to run") is auditably different from a no-op ("ran, found nothing") and from a waiver ("operator chose to skip"). (b) collapses two genuinely different outcomes under one grep, losing the distinction the brief asks for. (c) is wrong: the *eligibility* is static (and does ride `effective[]`), but the *decision to skip* is dynamic — only the walk sees the diff — so the record line must be walk-appended, exactly like `NO-OP`. Fixed greppable token per repo memory `prefer-fixed-greppable-tokens`. |
| 5 | **`required:` default** — opt-in or opt-out per phase | (a) **Opt-out per phase** (absent = not required = participates in evaluation; operator pins specific phases out). (b) **Opt-in by floor only** (engine pins floors `required`; everything else auto-skippable unless the operator opts out) — i.e. same runtime behaviour as (a) but floors expressed as `required` rather than categorical exclusion. (c) **Opt-in globally** (nothing auto-skips unless the operator marks it auto-skippable). | **(a)** | (c) inverts the feature into a no-op-by-default and defeats the brief (craft should evaluate by default). (b) muddies the floor invariant — floors must be *categorically* non-skippable in code (R6: an eligibility bug can never drop them), not expressed as an overridable config default. (a) keeps floors categorical (D2) and makes `required:` purely the operator's narrow escape hatch with the safest default (closed: phases participate, operator opts a phase out). |

### Ratified (decisions phase, 2026-06-23 — ADRs 143–147)

The table above is the candidates *as proposed*. The decisions conversation ratified:

- **DC1 → (a)** — resolver static eligibility + walk dynamic necessity (ADR-143).
- **DC2 → widened beyond the (b) recommendation by user choice.** Eligibility is **`non-floor ∧ strand-clean ∧ ¬required`** with the code-producing rule **and** the archetype allowlist *dropped*; the eligible set falls out naturally as `{decisions, review, refactoring, validation, documentation}` (+ `architecture` when enabled). `refactoring` is **in** (strand-clean re-producer); `decisions` is **in** (strand-clean — `planning` self-supplies `decisions`; corrected from the original truth table during implementation); `planning` was rejected (auto-skipping it strands `implementation`) (ADR-144).
- **DC3 → (a) narrow + hard lint error** on a same-phase `skip`+`required` (ADR-145).
- **DC4 → (a)** new fixed `auto-skip:` token (ADR-146).
- **DC5 → (a)** opt-out per phase; floors categorical in code (ADR-145).
- **Propose-gate release** for an auto-skipped executing-harness rides the orchestrator recorded-no-op release path, not an engine waiver (ADR-147).

## Test strategy

The repo tests with `node --test` (Given/When/Then titles, AAA bodies, `sut` variable; `engine/test/resolve.test.js` and `engine/test/strand.test.js` are the models). The change decomposes into a **pure resolver-side core (`computeAutoSkipEligibility` + the additive `effective[].autoSkipEligible` field) + a schema/validation arm (`required:`) + thin walk prose (necessity probe, token, gate release)**, so the load-bearing invariants are unit- and mutation-testable.

1. **Eligibility helper — unit + mutation (the load-bearing lens).** `computeAutoSkipEligibility(descriptor, manifest, effective, defaults)` over the default pipeline:
   - every floor (`workspace`, `implementation`, `propose`, `integrate`) → `false`;
   - the producer/spec phases `design` and `planning` (and `requirements` when enabled) → `false` **via the strand check** (not a producer rule — auto-skipping them strands a consumer);
   - `decisions` → `true` (strand-clean — `planning` self-supplies `decisions`, so the strand guard skips its only consumer); assert this explicitly, since it corrects the original draft;
   - `refactoring` (code-producing re-producer, strand-clean) → `true` — it is **not** excluded by any code-producing rule (ADR-144); `implementation` (code-producing floor) → `false` via the floor check;
   - the eligible set (`decisions`, `review`, `documentation`, `refactoring`, and `validation`/`architecture` when enabled) → `true` **only when** the strand backstop is clean;
   - `phases.<id>.required: true` flips an otherwise-eligible phase to `false`;
   - a phase whose auto-skip *would* strand a consumer → `false` (construct a fixture where the only `change` producer is removed — assert it stays ineligible). This is the mutation-test surface: a mutant that drops the floor check, the required check, or the strand composition must be killed by a failing assertion.

2. **Strand-reuse property.** Assert `computeAutoSkipEligibility` composes `checkStrandedConsumers` rather than reimplementing it: for every phase the helper marks eligible, `checkStrandedConsumers(defaults, new Set([id]), effective)` is `[]` (same call shape as `resolve.js:286`); for `design` (empirically a strand) the helper is `false`. Pins R4.

3. **`required:` schema validation.** `validateManifest({ phases: { review: { required: true } } }, …).ok === true`; a non-boolean (`required: "yes"`) → `ok: false` with `phases.review.required must be a boolean`; `required` does not leak into any other `PHASE_FIELDS` check. Mirrors `engine/test/manifest.test.js` `enabled` cases. (Empirically pinned that this is rejected pre-change — the test guards the addition.)

4. **`Resolution` additive-field integration.** `resolvePipeline(defaults, manifest, opts)` emits `effective[].autoSkipEligible` on every descriptor (default `false`), and `record[]`/`gateDecisions[]`/`waivers[]` are byte-for-byte unchanged for an empty/auto-skip-free manifest (the back-compat property — the additive field disturbs nothing, mirroring ADR-125's additive `Resolution.policy`).

5. **Precedence (ADR-145).** `required: true` + `pipeline.skip: [<id>]` on the same phase is a **lint error**: `validateManifest` returns `ok: false` (exit 2) naming the collision. An explicit `pipeline.skip`/`enabled:false` *without* `required` still wins normally (operator authority outranks a "don't auto-skip" pin); `required` alone only blocks auto-skip, never an explicit operator skip.

6. **Walk prose — scenario fidelity (not CI-unit, mirrors P19).** The dynamic necessity probe, the `auto-skip:` token spelling, and the propose-gate release are walk prose covered by an on-demand scenario smoke: a docs-only change drives the pipeline, `review`/`validation` auto-skip with the recorded token, `propose` proceeds without waiting on the auto-skipped harness, and a `grep -F 'auto-skip:'` finds the line in the run record and PR body — distinct from `grep -F 'NO-OP('` and `grep WAIVER:`. A `required: true` pin on the same change forces the phase to run (no `auto-skip:` line). This mirrors how P19's `NO-OP` vocabulary and ADR-082's gate release are verified by scenario fidelity rather than `node --test`.

7. **No-provenance grep.** No `P26`/`ADR`/backlog id in the emitted token, the helper, or any test (regex over touched source + the token string). Pins R9.

## Out of scope

- *(none specific to the judgment phases — both `decisions` and `refactoring` are in scope and eligible per ADR-144; `decisions` is strand-clean because `planning` self-supplies it.)*
- **Auto-skipping floors or producer/spec phases.** Categorically ineligible by design (R6); not a tunable.
- **A new runtime port or engine bin change.** The change is a pure resolver helper + an additive `Resolution` field + a schema arm + walk prose — no port, no bin, no lowered floor (R8).
- **Diff-shape *tooling* (a structured diff parser the probe consumes).** The necessity probe is tool-agnostic prose judgment, like the existing gate and mutation-tooling probes; a structured diff-classifier is a possible future sharpening, not P26.
- **Changing `WAIVER:`/`NO-OP(<phase>):` semantics.** P26 adds a *third*, distinct token; it does not revise the existing two (ADR-005/ADR-103 untouched).
- **Auto-skip for inserted/registered (`extends`) phases.** Eligibility is computed over the descriptor's archetype/contract/strand shape, so a registered phase is handled by the same helper — but defining bespoke necessity signals for arbitrary third-party phases is out; an inserted phase is eligible only if it is non-floor and strand-clean (the same rule, no archetype allowlist), and its necessity probe defaults to "run" (provably-empty is unprovable for an unknown phase).
