---
subjects:
  - hooks/hooks.json
---
# 548 — The git hook registration sets no timeout

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/claude-hook-timeout-probe.md · **Supersedes/Refines:** none

## Context

`hooks/hooks.json` registers the guard with no `timeout` field, so Claude Code's documented 600 s PreToolUse default applies. A value only sets when the timeout fail-open happens. No value closes it.

## Options considered

1. **No `timeout` field** *(recommended)* — pros: `hooks.json` and its `deepStrictEqual` pin stay unchanged / cons: depends on the vendor default.
2. **`"timeout": 600`** — cons: guards against a default change nobody has seen, costs an edit to the pin.
3. **A short value (e.g. 30)** — cons: a slow but correct deny on a loaded host fails open sooner; no stall has been shown.

## Decision

Adopted-as-recommended (no user judgment): option 1. `hooks/hooks.json` is unchanged.

## Consequences

The window stays the widest the vendor default allows. If the default changes, the 600 s in the hook header and in `gate.md`'s "documented default 600 s" need a refresh.
