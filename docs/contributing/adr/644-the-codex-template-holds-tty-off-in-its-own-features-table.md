---
subjects:
  - adapters/codex/config.template.toml
supersedes: []
---
# 644 — The codex template holds tty-off in its own features table

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/codex-write-stdin-tty-close.md · **Supersedes/Refines:** refines ADR-642

## Context

A TOML key written after a table header belongs to that table: appended after `[[hooks.PreToolUse]]`
or `[agents.*]`, a bare key silently lands inside the last table.

## Options considered

1. **A `[features]` table between the top-level posture keys and `[[hooks.PreToolUse]]`**
   *(recommended)* / pros: posture keys stay together; its own header keeps later edits from pulling
   it into another table / cons: none.
2. **A `[features]` table at the end of the file** / pros: valid TOML / cons: far from the sandbox
   posture it belongs with.
3. **A dotted top-level `features.unified_exec_tty = false`** / pros: one line / cons: valid only
   above every header, and it conflicts with an operator config that already has `[features]`.

## Decision

**Adopted-as-recommended (no user judgment).** Option 1.

## Consequences

The README tells an operator who already has a `[features]` table to merge the key into it rather
than add a second header, which makes the config invalid.
