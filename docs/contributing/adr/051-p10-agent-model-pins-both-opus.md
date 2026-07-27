# 051 — P10 agent model pins: both `opus`

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P10-default-phases.md · **Supersedes/Refines:** none

## Context

P10 adds two agents that need a `model:` pin: `requirements-writer` (a specification
**producer**) and `architecture-triager` (a harness **triager**). The existing convention
pins producers (designer, planner) to `opus` and the one existing triager
(validation-triager) to `sonnet`.

## Options considered

1. **requirements-writer = opus, architecture-triager = sonnet** — pros: follows the
   producer/triager role-class convention exactly / cons: a violation-triage that has to
   reason about layering structure may be under-powered on sonnet.
   *(designer's recommendation)*
2. **Both opus** — pros: architecture triage reasons about dependency/layering structure
   — a producer-grade judgment task, not mechanical mutant-killing; uniform pin is simple /
   cons: higher cost on a default-off phase; diverges from the triager=sonnet precedent.
3. **Both sonnet** — pros: cheapest / cons: under-powers the requirements producer.

## Decision

⚑ **User overrode the recommendation:** both new agents pin **`model: opus`**. Rationale
accepted from the user — architecture-triage is a structural-reasoning task closer to a
producer than to mutant-killing, so it warrants opus; uniformity with requirements-writer
is a bonus. Model resolution is still manifest `models.<agent>` → this pin → `models.fallback`
→ engine default `sonnet` (ADR-041), so a cost-sensitive repo can route either down in one
manifest line.

## Consequences

- `agents/requirements-writer.md` and `agents/architecture-triager.md` both carry
  `model: opus` in frontmatter.
- Diverges from the validation-triager=sonnet precedent; this is a deliberate per-agent
  call, not a new blanket rule for triagers.
- Both phases are default-off, so the opus pin is paid only when a repo opts in.
