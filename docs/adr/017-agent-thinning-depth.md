# 017 — Agent thinning depth: fully thin (identity + craft)

- **Status:** accepted
- **Date:** 2026-06-16
- **Design:** docs/DESIGN-customizable-engine.md · docs/DESIGN-P5-contract-injection.md · **Supersedes/Refines:** none

## Context

With the invariants relocated to the engine store (ADR-003/015) and injected on every run
(ADR-016), the agent bodies' `Contract:` sections are redundant. How thin do the agents go?

## Options considered

1. **Fully thin** — delete the `Contract:` section; keep role identity + role-specific craft +
   the role's own final-message format only. *(chosen)* A swapped or edited agent **cannot** carry
   a stale or divergent contract — discoverability is the engine store, not agent prose.
2. **Thin + a one-line pointer stub** referencing `contracts/` — marginally more discoverable to a
   human reading the file / one line of prose that drifts from the store.
3. **Keep a partial contract** — defeats the relocation; re-opens the swap-drop risk.

## Decision

Agents are **fully thinned** to role identity + role-specific craft + the role's final-message
format. No invariant text, no pointer stub. The generic blocker protocol (`{ unit, reason, ≤3
options }`), "never commit on red", artifact-handoff, no-provenance, no-suppression, bounded-scope,
and model-resolution all live in `core`/bundles; the thinned agent states only **what *this* role
produces and how** (designer → "pin external behaviour empirically, return decision candidates";
reviewer → "read-only, one dimension, structured findings"; refactor-executor → "execute HOW, never
decide WHAT"). The R8 equivalence test (ADR-018) guards that the *union* (injected block + thinned
agent) still carries every invariant.

## Consequences

Agent defs shrink to role essence; the engine block is the single contract home; G5 swap-safety is
structural. A human discovers the binding contract in `contracts/` + the assembled block, not in
eight drifting copies.
