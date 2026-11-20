---
subjects:
  - skills/decisions/SKILL.md
  - docs/contributing/specs/run-record.md
  - engine/src/rulings.js
supersedes:
  - adr: "353"
    scope: "where supersession is declared: a superseded-by segment on the superseded register line replaces the supersedes frontmatter"
  - adr: "354"
    scope: "the two required body anchors: a register line has no body; the scope travels on the superseded line"
---
# 734 — A reversed ruling keeps its line, marked `Superseded by R-M: <scope>.`

- **Status:** accepted
- **Date:** 2026-11-20
- **Design:** docs/contributing/design/doctrine-register.md · **Supersedes/Refines:** supersedes ADR-353 (declaration), ADR-354 (anchors)

## Context

A register line is cited by id from doctrine and from other docs. A reversal has to keep those citations meaningful and keep the id order append-only.

## Options considered

1. **Keep the old line and append `Superseded by R-M: <scope>.`; the hint shows it with the pointer; `DECISION-REVERSAL(R-N): <scope> -> R-M` stays** *(recommended)* — pros: a citation keeps its meaning, `doctrine-lint` flags a citation of a superseded id / cons: superseded lines stay in the file.
2. **Edit the line in place, the old statement moved into its refused list** — cons: the same id silently changes meaning under every citation.
3. **Delete the old line** — cons: breaks citations and the id order.

## Decision

Ratified by the user: option 1. A reversal, in one commit: append R-M; append ` Superseded by R-M: <scope>.` to R-N; re-point every `Superseded by R-N` pointer and every doctrine citation of R-N to R-M; emit `DECISION-REVERSAL(R-N): <scope> -> R-M` with `<scope>` verbatim from the line.

Superseded from ADR-353: the `supersedes:` frontmatter as the declaration of a supersession.

Carried forward from ADR-353: the superseding decision names what it supersedes and the scope, in one machine-read place.

Superseded from ADR-354: the two required body anchors.

Carried forward from ADR-354: a partial supersession states its scope explicitly; the superseded line still says what stands.

## Consequences

- `rulings-lint` checks the pointer: R-M exists, M > N, R-M is not itself superseded.
