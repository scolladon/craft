# 020 — Inline role-craft sourcing: load the agent body in-thread

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P6-execution-topology.md · docs/DESIGN-customizable-engine.md · **Supersedes/Refines:** refines ADR-015/017

## Context

P5 thinned every agent to identity + role craft (ADR-017) and relocated the binding invariants
into the engine-owned contract store (ADR-003/015). A **spawn** therefore carries two artifacts:
the engine-injected contract block (prepended to the Task prompt) *and* the thin agent-def body
(the craft ADR-015 deliberately KEPT in the agent — designer's empirical-pinning + "design within
the house style"; reviewer's `--no-ext-diff` git hygiene + the no-mutation-in-tests boundary;
planner's sizing rules; slice-implementer's "the slice, the whole slice"). That craft lives in no
contract bundle. P6's `execution: inline` runs the phase body in-thread with **no Task spawn**, so
the session receives the injected block (assembled with `--inline`) but, unlike a spawn, nothing
automatically hands it the agent craft. Where does an inline phase get it?

## Options considered

1. **Load `agents/<role>.md` body (sans frontmatter) into the session at inline phase entry**,
   right after the injected block — symmetric with the spawn, which carries both. Inline ≡ agent
   modulo the two carve-out lines. *(recommended)*
2. **Trust the phase skill Procedure + contract block; skip the craft inline** — accepts a fidelity
   gap (inline reviewer omits `--no-ext-diff` → corrupts machine-parsed git; inline designer skips
   the house-style probe). Implicitly re-opens the ADR-015 invariant/craft boundary.
3. **Restrict inline to role-less phases** — breaks S1 as tested; narrows `solo` to the four
   already-session-owned phases.

## Decision

An inline phase whose descriptor carries a `role:` that resolves to a **local forge agent file**
loads that agent's body (sans frontmatter) into the session at phase entry, **immediately after the
engine-injected contract block** — the same two artifacts a spawn carries, in the same order. The
session reads the second-person craft as self-directed; the spawn-only "final message to the parent"
line is moot (there is no parent — the session continues). A `role:` that resolves to a **custom or
external** agent with no local file (e.g. `acme:planner`) runs on the contract block alone.
Role-less phases (`workspace`, `decisions`, `propose`, `integrate`) are unaffected — already
session-owned. **Inline fidelity therefore equals agent fidelity modulo exactly the two carve-out
lines** (artifact-handoff, model) the assembler already swaps; the existing
`contract-equivalence.test.js` proves that bound per descriptor.

## Consequences

Inline and agent runs are identical in craft + contract; the only behavioural delta is isolation (a
separate context) plus the two carve-outs. ADR-015's boundary is preserved — craft stays in the
agent file; the walk merely surfaces it to the session on the inline path. The change is
**orchestrator prose** in `run/SKILL.md` step 4 (an inline-dispatch branch) — no engine code, no
new public surface. A swapped agent (G5) carries its replacement craft into both modes identically.
