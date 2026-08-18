---
subjects:
  - engine/src/adr-lint-main.js
  - skills/decisions/SKILL.md
---
# 354 — Supersession scope is two required body anchors

- **Status:** accepted
- **Date:** 2026-08-18
- **Design:** docs/contributing/design/decision-drift-propagation.md · **Supersedes/Refines:** none

## Context

Supersession is partial in practice. The corpus's only worked example,
`348-arch-gate-resolves-to-the-declared-technique.md`, says outright "Not all of ADR-050 is
stale" and then carries part of it forward. A boolean supersession is therefore the wrong
model, and the lint needs a form to check.

## Options considered

1. **Two required prose anchors** in the superseding ADR — `Superseded from ADR-N` and
   `Carried forward from ADR-N`, each naming N — lint checks the anchors, never the prose —
   pros: mechanises the one file that got this right / cons: an anchor can exist and say
   little. *(designer's recommendation)*
2. **Structured `superseded[]` / `carried[]` lists in frontmatter** — pros: machine-precise /
   cons: pushes the *why* into a quoted YAML string nobody reads.
3. **The one-line `scope:` alone**, body prose optional — pros: cheapest to author / cons: lets
   "not all of it is stale" be asserted with no statement of what survived.

## Decision

Option 1, **ratified by the user**. Both anchors are required. The match is a line-anchored
prefix — `^Superseded from ADR-N\b` and `^Carried forward from ADR-N\b` — so everything after
the id is free prose; a stricter colon match would fail ADR-348's real comma form
(`Carried forward from ADR-050, unchanged and now stated tool-independently:`). "Nothing
survives" is stated explicitly as `Carried forward from ADR-N: nothing — <why>`, never by
omitting the anchor.

## Consequences

The author must *answer* the partial-supersession question rather than assert a boolean.
Requiring each anchor to name N keeps the two halves attributable when one ADR supersedes two.
The lint's guarantee is bounded and honest: it enforces that both questions were addressed, not
that the answers are good — that remains a review judgment.
