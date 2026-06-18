# 053 — design-skill note for consuming a produced `requirements` artifact

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P10-default-phases.md · **Supersedes/Refines:** Relates ADR-048

## Context

When `requirements` is ON, the phase produces a `requirements` artifact and `design`
consumes it (descriptor `consumes: [workspace, requirements]`); when OFF (default),
`design`'s `self_supply: [requirements]` makes design capture requirements in its own
section. The descriptor already encodes both paths, so the question is whether
`skills/design/SKILL.md` needs prose making the ON-consumption explicit.

## Options considered

1. **No change** — pros: the descriptor `consumes`/`self_supply` already encodes both
   paths; the orchestrator passes consumed artifacts by path / cons: a reader of the design
   skill alone doesn't see that an upstream requirements doc may be a hard input.
   *(designer's recommendation)*
2. **Add a one-line note** to design's preamble — pros: the consumption path is explicit
   at the point of use; reinforces ADR-048 / cons: a touch of redundancy with the descriptor.

## Decision

⚑ **User chose to add the note.** `skills/design/SKILL.md` gains one line in its preamble:
*if a `requirements` artifact was produced this run, treat it as a hard input (read it,
design against it); otherwise self-supply requirements in the design doc's own section.*
This is the single behavioural edit to an existing default-phase skill in P10; it documents
the DC-1 (ADR-048) consumption path at its point of use without changing the descriptor.

## Consequences

- One-line edit to `skills/design/SKILL.md` preamble (probe step); no logic change, no
  descriptor change.
- The note is documentation of an already-encoded data flow — it cannot drift from the
  descriptor because the descriptor remains the SoT (the note defers to "if produced").
- Reinforces ADR-048: requirements is a first-class artifact, not a design-internal section
  when the phase is ON.
