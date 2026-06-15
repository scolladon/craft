# 008 — Execution mode: per-phase field + profile + top-level default

- **Status:** accepted
- **Date:** 2026-06-15
- **Design:** docs/DESIGN-customizable-engine.md · **Supersedes/Refines:** none

## Context

`execution: inline|agent` (G4, SP1) governs whether a phase delegates to a subagent or runs
in-thread. The question is how many ways a manifest may express it.

## Options considered

1. **Per-phase + profiles only** — `execution` is a phase field; `profile: solo` sets it en
   masse. One way to express each intent. *(designer recommended)*
2. **Also a top-level default** — adds a global `execution: <mode>` on top of per-phase +
   profiles. Convenient for "all inline"; two ways to say it. *(user choice)*

## Decision

`execution:` is configurable at **three precedence levels**:
**explicit per-phase field > profile > top-level `execution:` default.** The top-level key sets
the global default for every phase; a profile (e.g. `solo`) sets it en masse; an explicit
`phases.<id>.execution` wins.

## Consequences

The manifest gains an optional top-level `execution:` key (additive). The Node resolver applies
the three-level precedence when computing each phase's effective execution mode. Slightly more
surface; the documented precedence removes ambiguity. The SP1 parallelism caveat still binds —
a multi-dimension harness stays `agent` even under an inline default unless the repo accepts
sequential dimensions.
