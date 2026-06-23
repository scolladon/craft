# 096 — Engine emits a review-plan field on the resolved review descriptor

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P18-walk-parallelism-enforcement.md · **Supersedes/Refines:** refines ADR-030 (harness knob shape)

## Context

P18 makes `passes > 1` and numeric `convergence: <n>` engine-enforced. The Node engine
parses/validates/resolves but runs no review loop — reviewer fan-out and finding-counting
are the orchestrator walk's work. So "engine-enforced" cannot mean "the engine runs the
loop." The question is what concrete artifact the engine owns so the knobs stop being
walk-judgment. The descriptor already carries `passes`/`convergence` verbatim, but they are
read as advisory and the numeric stop rule is left undefined to the walk.

## Options considered

1. **Un-park as binding prose only** (designer recommendation) — rewrite `skills/review/SKILL.md`
   to MUST-honor the knobs; engine's guarantee = knobs well-formed + present on the descriptor
   (already true). Pros: lightest, no duplicated state, no new engine path. Cons: enforcement
   stays prose, not data; the numbers remain implicit on the harness block; the numeric stop
   rule has no engine-owned representation.
2. **Engine emits an explicit review-plan** *(chosen)* — the resolver computes and attaches a
   `reviewPlan { passes, stop_rule }` to the resolved review descriptor; the walk reads it
   mechanically instead of re-deriving. Pros: the numbers become engine-owned data; the
   `stop_rule` is a named, unambiguous value; enforcement is a resolved fact, not prose. Cons:
   small duplication of `passes` (already on the harness block); adds one engine field + a
   resolution test.
3. **Hybrid** — binding prose + a `stop_rule` name only (no `passes` echo). Pros: less
   duplication. Cons: splits ownership (one knob as data, one as prose) for little gain.

## Decision

The resolver emits a **`reviewPlan`** on the resolved review descriptor, carrying a concrete
`passes` integer and a named `stop_rule` string derived from the harness knobs. The walk reads
`reviewPlan` mechanically — it does not re-derive `passes` or invent a stop rule. The
indicated placement is nested on the resolved descriptor's `harness`
(`effective[review].harness.reviewPlan`); the exact field placement is pinned by the design
revision and plan. The `stop_rule` value encodes the rule decided in ADR-097 for the numeric
case (and the existing `low-only` / `none` cases for those).

## Consequences

- The resolve path gains a pure `reviewPlan` derivation from the harness block; a resolution
  test pins its shape and values. Layer A is therefore **not** SKILL-only — it carries engine
  code (this reconciles the part-1 description in ADR-099).
- `skills/review/SKILL.md` reads `phase.harness.reviewPlan` rather than re-deriving the
  fan-out count or stop threshold; the parked-note block is removed.
- Commits us to the resolved-descriptor shape carrying `reviewPlan`; a future review-plan knob
  rides this field rather than new top-level descriptor state.
- The `--harness` overlay (ADR-098) tunes the *input* knobs; `reviewPlan` is recomputed from
  the overlaid knobs, so CLI overrides flow through to the plan with no extra wiring.
