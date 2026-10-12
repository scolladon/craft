---
subjects:
  - hooks/hooks.json
  - test/hooks.test.js
---
# 508 — Hook commands quote the whole plugin-root path

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/backlog-sweep-hooks-quote-dev-tools.md · **Supersedes/Refines:** none

## Context

`claude plugin validate .` warns that the three `hooks/hooks.json` commands expand `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` unquoted. Claude Code runs hook commands under `/bin/sh -c`, so a plugin root containing a space splits into several words and the hook never runs.

## Options considered

1. **Quote the whole path** `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/<script>.sh"` *(recommended)* — pros: matches every skill invocation; keeps the shim-count test; keeps the `CRAFT_ROOT` override
2. **Quote only the placeholder** `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}"/hooks/<script>.sh` — pros: runs too / cons: a second shim spelling; the shim-count test drops to 0
3. **Exec form** `{command, args}` — cons: no shell, so `${CRAFT_ROOT:-…}` never expands; the bare `${CLAUDE_PLUGIN_ROOT}` variant drops the ADR-217 override

## Decision

Option 1 — **adopted-as-recommended (no user judgment).** Each hook command is a shell-form string whose whole path is double-quoted. Aligns with ADR-217 (the `CRAFT_ROOT` override must keep working) and with the existing single shim spelling.

## Consequences

A clean validator run is not proof on its own — it also accepts forms that fail at run time — so a runtime test executes each registered command from a plugin root containing a space.
