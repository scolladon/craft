---
subjects:
  - hooks/git-no-ext-diff.sh
  - test/hooks.test.js
supersedes: []
---
# 540 — The git hook denies when no verdict is reached

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/claude-hook-nonzero-exit-probe.md

## Context

On bash 3.2 a syntax error below an EXIT trap ends with status 0, so a trap that passes every status 0 through turns today's deny (bash's own status 2) into an allow (3/3).

## Options considered

1. **Accept it; rely on shellcheck and the hook tests before merge** — cons: a hand-edited or corrupted install reaches it
2. **A `verdict_reached` flag set only by `allow` and after the JSON deny; the trap denies status 0 without it** *(recommended)*

## Decision

Adopted-as-recommended (no user judgment): option 2. The four `exit 0` lines become `allow` calls; a status 0 without the flag denies with `craft git-no-ext-diff: no verdict reached, call denied`. Bash counterpart of ADR-519 (the codex guard denies when no verdict is reached).

## Consequences

Every clean path stays byte-identical. A trap-introduced fail-open is closed.
