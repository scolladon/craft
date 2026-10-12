---
subjects:
  - engine/src/hygiene-lint-core.js
---
# 479 — A waiver is a column-0 token line outside a fenced block

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/waiver-mention-not-waiver.md · **Supersedes/Refines:** refines ADR-212 (C8 waiver tokens)

## Context

`collectWaived` took every waiver-token match anywhere in a `--waiver-source` file. `ci.sh`
passes every touched `.md` as a waiver source, so a design doc or ADR that merely discusses a
`STUB-WAIVE(<path>)` or `SLOP-WAIVE(<path>)` token waived that path for the whole branch — a
fail-open under `hygiene.gate: blocking`. A waiver needs a shape a mention does not have.

## Options considered

1. **Line-anchored token outside fenced code blocks** *(recommended)* — pros: matches the documented `TOKEN(<file>): <reason>` shape and every existing intended waiver; mid-sentence prose, inline code, tables and fenced examples all become inert / cons: needs a fence recognizer
2. Line-anchored only — pros: less code / cons: a fenced placeholder example (one exists in the plan corpus) stays live
3. Exclude code spans only — cons: a bare mid-sentence mention still waives
4. Dedicated `## Waivers` section — cons: the PR-body template, the propose self-waiver and every adr-lint waiver source must carry the section

## Decision

Option 1 — ratified by the user. A waiver is a line that starts with `TOKEN(<path>): <reason>`
and lies outside a fenced code block; anything else that contains the token is a mention and
waives nothing.

## Consequences

Narrows ADR-212's C8 waiver-token clause without reversing it: the tokens, the knob and the
waiver sources are unchanged. The tree held no intended waiver in any other shape, so no
waiver is dropped. The PR-body self-waiver keeps working when its token starts a line.
