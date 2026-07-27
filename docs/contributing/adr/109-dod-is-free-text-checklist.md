# 109 — The DoD is a free-text checklist, judged and recorded per criterion

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P20-dod-aware-verification.md · **Supersedes/Refines:** none

## Context

The DoD is authored by the repo and read by the verification. Its shape (DC-5) sets the authoring surface and
how met-ness is established: a free-text checklist judged by the session, versus a structured schema enabling
mechanical met-ness for an auto-checkable subset.

## Options considered

1. **Free-text checklist** (`docs/DOD.md` markdown, criteria read verbatim) — met-ness is a recorded session
   judgment. *(designer's recommendation; chosen)* — pros: zero parser/schema; matches craft's
   session-owns-judgment model and the trusted-verbatim-input trust model; many criteria are inherently
   judgment / cons: no mechanical met-ness even for criteria that could be auto-checked.
2. **Structured / checkable criteria** (schema tags each criterion auto-checkable vs judgment) — cons: a
   schema + parser the repo must learn, for small gain (most acceptance criteria are judgment).
3. **Hybrid** (free-text by default, optional structured fences) — a reasonable v2 once free-text proves the
   surface.

## Decision

The DoD is a **free-text checklist** — a markdown file (default `docs/DOD.md`) of acceptance-criteria lines,
read **verbatim as trusted operator input**. Met-ness is a **recorded session judgment** (per criterion:
met / unmet / not-auto-checkable-asserted), the way `validation` records per-survivor and `architecture`
records per-violation outcomes. No schema, no parser.

Criteria that *can* be evidenced mechanically — **mutation testing** clean, gates green, architecture
boundaries clean — appear as ordinary checklist lines and are evidenced by the corresponding phase results
(ADR-104/108); they are still **recorded** as criterion outcomes, not silently passed. Per the ratifying
conversation, this repo's own default `docs/DOD.md` lists mutation testing as one such line.

## Consequences

- Zero authoring friction: a repo writes a markdown checklist, no craft-specific schema to learn.
- Met-ness is judgment, consistent with `decisions` adopt-without-escalation (ADR-100); an **unmet** criterion
  is a blocker `{ unit, reason, ≤3 options }` to the user, never a silent pass and never a silent gate fail.
- Under the headless Pi adapter (no user to escalate to) an unmet criterion **records the blocker and halts**
  — never degrades to a silent pass (ADR-095 headless role-less semantics).
- A structured/checkable DoD schema is explicitly a possible **v2**, out of P20 scope.
