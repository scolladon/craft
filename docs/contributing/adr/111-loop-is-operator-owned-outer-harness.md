# 111 — Running craft in a loop is an operator-owned outer harness, not an engine-native loop

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P21-loop-recipe.md · **Supersedes/Refines:** none

## Context

The brief asks to drive craft iteratively — re-run against PRD + DoD + config until the DoD is
met. The load-bearing fork is *where the iteration lives*: a new engine-native loop (a `loop:`
manifest key, a resolver/lint/test surface, a new "loop blocker vs pass blocker" protocol) versus
an iteration the operator composes *outside* craft, with craft running exactly one gated pass per
invocation. The engine's whole framing (GUIDE §2, README "craft owns only the orchestration
guarantees") is that craft is opinion-free about *what* you inject and owns only the per-pass
orchestration; *when to stop iterating* is a policy.

## Options considered

1. **Operator-owned outer harness (example/recipe)** — the loop wraps craft from outside; craft
   stays one pass per invocation. *(designer's recommendation; chosen)* — pros: zero engine surface;
   the one-pass contract stays provable and testable in isolation; the operator composes any cadence
   (Claude Code `/loop`, cron, CI re-trigger, human-paced) / cons: the loop is not a craft feature,
   so its quality lives in docs + an example, not the engine's gates.
2. **Engine-native `loop:` phase/flag** — craft iterates internally until the DoD is met. cons: a
   new top-level manifest key + resolver + lint + tests; widens the invariant core; turns "one
   gated pass" into "one-or-N passes," complicating every gate/handoff proof; bakes one stop policy
   into the engine.

## Decision

Running craft in a loop is delivered as an **operator-owned outer harness** — a documented recipe
and a runnable example — **never** an engine-native loop. craft continues to run **exactly one
gated pass per invocation**; the iteration, the stop policy, and the failure semantics belong to
the operator's harness. No engine change: nothing under `engine/`, `pipeline/`, `contracts/`,
`skills/`, `agents/`, `scripts/` changes craft behavior, and no new manifest key is introduced.

## Consequences

- The one-pass contract is preserved — every gate, handoff, and verdict proof stays scoped to a
  single pass.
- Iteration policy (cadence, bound, stop signal) is the operator's, expressed in surfaces they can
  read and tune, not the engine's to define.
- "Add a loop flag" requests now hit a standing decision: the loop composes *on top of* craft using
  the verdict craft already produces (the P20 DoD outcome), it is not absorbed into it.
- The cost moves to docs/example quality: the recipe must be honest about each entry point's signal
  (ADR-112, ADR-113) and the example must be catalog-gated against rot (ADR-115).
