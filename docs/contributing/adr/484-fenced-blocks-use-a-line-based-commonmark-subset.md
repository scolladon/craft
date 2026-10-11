---
subjects:
  - engine/src/hygiene-lint-core.js
---
# 484 — Fenced blocks are recognized by a line-based CommonMark subset

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/waiver-mention-not-waiver.md · **Supersedes/Refines:** refines ADR-479

## Context

"Outside a fenced code block" needs a recognizer; the engine has a single runtime dependency
and no markdown parser.

## Options considered

1. **Line-based CommonMark subset** *(recommended)* — opener of 3+ backticks or tildes at any indent (no backtick in a backtick info string); closer of the same character, at least as long, whitespace only after it; an unclosed fence runs to end of file — pros: agrees with markdown-it on every fenced line of the tracked docs; its one known gap over-fences, which fails closed / cons: not a full parser
2. Column-0 toggles only — cons: fails open on list-indented and four-backtick fences
3. markdown-it dependency — cons: a second runtime dependency for the engine

## Decision

Option 1 — ratified by the user.

## Consequences

An over-indented top-level fence line is treated as an opener; a waiver below it is dropped
and its finding stays visible.
