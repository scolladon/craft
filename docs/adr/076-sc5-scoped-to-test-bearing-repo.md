# 076 — SC5 scoped to a test-bearing non-tsgit repo

- **Status:** accepted
- **Date:** 2026-06-19
- **Design:** docs/DESIGN-P15-second-instantiation.md · **Supersedes/Refines:** none (DC-1 as recommended)

## Context

SC5 — "a second, non-tsgit repo runs the default pipeline with no manifest" — meets craft's deepest
invariant: a code-producing phase must resolve a gate, and `implementation`'s gate probe REFUSEs when no
test/validate/check command is discoverable (`skills/implementation/SKILL.md`; engine floor
`engine/src/gates.js`; PRD §11 / G9). A repo with no test infrastructure therefore cannot run the full
pipeline — by design. What "runs the default pipeline" means in SC5 must be pinned so the REFUSE is read as
the floor working, not as an SC5 failure.

## Options considered

1. **Scope SC5 to a non-tsgit repo that has a discoverable test/validate/check command** — pro: the same
   precondition tsgit itself satisfies (`scripts/ci.sh`); keeps PRD §11 / G9 floor intact; honest about
   what SC5 proves (a *different toolchain* works) / con: SC5 says nothing about no-test repos.
   *(designer's recommendation)*
2. **SC5 must run end-to-end even on a no-test repo** — con: requires relaxing the gate floor; guts PRD
   §11 and G9.
3. **Core (design→plan→implement→review) must run; the REFUSE counts as PARTIAL** — con: muddies the
   pass criterion; a floor REFUSE is not a partial success, it is correct refusal.

## Decision

SC5 is scoped to a second, non-tsgit repo **that has a test/validate/check command discoverable without a
manifest**. On such a repo the full default pipeline runs zero-config. A repo with no test infrastructure
hitting `implementation`'s gate-floor REFUSE is **correct floor behaviour**, not an SC5 miss — the gate
floor (PRD §11 / G9) is non-negotiable and is never relaxed for SC5.

## Consequences

- The SC5 smoke (ADR-077) targets a test-bearing repo; the smoke record states the discovered gate command.
- The zero-config-defaults docs must state this precondition explicitly (ADR-079): zero-config delivery
  needs a discoverable test command.
- Relaxing the gate floor for no-test repos is explicitly out of scope for P15.
