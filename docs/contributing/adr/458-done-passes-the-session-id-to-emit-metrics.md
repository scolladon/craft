---
subjects:
  - skills/run/SKILL.md
---
# 458 — Done passes the session id to emit-metrics

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/compaction-estimate-at-done.md · **Supersedes/Refines:** none

## Context

The line needs `--session`, and `Done` calls emit-metrics with `--run` only. `CLAUDE_CODE_SESSION_ID` holds the session id in top-level and sub-agent Bash.

## Options considered

1. **The prose passes `--session "$CLAUDE_CODE_SESSION_ID"`** *(recommended)* — pros: explicit, no engine coupling / cons: Claude-specific prose
2. **The bin defaults `--session` from the env var** — cons: changes row scoping for every caller, hand runs included
3. **The bin finds the session from the run-key** — cons: couples the bin to the ledger pointer format

## Decision

Option 1 — adopted-as-recommended (no user judgment): explicit over implicit; the prose already binds Claude via `CLAUDE_PLUGIN_ROOT`.

## Consequences

- Rows are scoped to this session, as the prose already claims.
