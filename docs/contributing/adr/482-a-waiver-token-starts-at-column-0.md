---
subjects:
  - engine/src/hygiene-lint-core.js
---
# 482 — A waiver token starts at column 0

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/waiver-mention-not-waiver.md · **Supersedes/Refines:** refines ADR-479

## Context

A token preceded by whitespace, a list marker or `>` could be a waiver or an explanation.

## Options considered

1. **Column 0 only** *(recommended)* — pros: matches every fixture and the documented shape; indented code, bullets, blockquotes and table cells are inert without extra rules / cons: a waiver cannot sit in a bullet list
2. 0–3 spaces — cons: a paragraph's lazy continuation line can become live
3. Spaces plus `- `, `* `, `> ` markers — cons: reopens the defect for bullets that explain a token

## Decision

Option 1 — ratified by the user.

## Consequences

A misplaced waiver fails closed: its finding stays visible.
