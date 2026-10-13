---
subjects:
  - hooks/git-no-ext-diff.sh
  - test/hooks.test.js
  - docs/contributing/specs/gate.md
supersedes:
  - adr: "537"
    scope: "signal deaths stay documented residual"
---
# 541 — Git hook TERM and HUP deny like a crash

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/claude-hook-nonzero-exit-probe.md · **Supersedes/Refines:** supersedes ADR-537

## Context

ADR-537 kept signal deaths residual on the premise that the EXIT trap does not run when a signal kills the hook. Review disproved it on `/bin/bash` 3.2.57: with the hook blocked reading stdin, `kill -TERM` and `kill -HUP` run the EXIT trap, which writes `craft git-no-ext-diff: no verdict reached, call denied`, yet the process still ends with 143 and 129. Claude Code runs the call on those statuses, so stderr claims a deny that did not happen.

## Options considered

1. **Trap TERM and HUP with an `exit` of their own status, so the EXIT trap sees that status and denies** *(recommended)* — prototyped: exit 2 with `failed (exit 143)` and `failed (exit 129)`
2. **Keep signals residual; fix the docs and suppress the deny line during signal teardown** — cons: keeps a fail-open the hook can close in two lines

## Decision

Ratified by the user: option 1. `trap 'exit "$SIGTERM_EXIT_STATUS"' TERM` and `trap 'exit "$SIGHUP_EXIT_STATUS"' HUP` sit right below the EXIT trap; each hands the EXIT trap a non-zero status, which ends in exit 2 with `craft git-no-ext-diff: failed (exit 143|129), call denied`.

Superseded from ADR-537: keeping every signal death as documented residual.

Carried forward from ADR-537: SIGKILL, and any signal the hook does not trap, stay residual and documented; which signal Claude Code's hook timeout sends stays unprobed.

## Consequences

TERM and HUP deny. Tests pin both by signalling the hook once it has forked its first child, which happens only after the traps are set. Bash runs a trapped signal's handler only after the running foreground child returns, so the deny lands once that child ends.
