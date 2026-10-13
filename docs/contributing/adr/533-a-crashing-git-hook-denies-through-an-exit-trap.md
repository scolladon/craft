---
subjects:
  - hooks/git-no-ext-diff.sh
  - test/hooks.test.js
supersedes: []
---
# 533 — A crashing git hook denies through an EXIT trap

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/claude-hook-nonzero-exit-probe.md

## Context

Claude Code 2.1.296 runs a PreToolUse(Bash) call on every hook exit status except 2: exit 1 (3/3), exit 127 and a SIGKILL death all ran the call and showed the model a clean result (live `claude -p` probe, see the design's Context). `hooks/git-no-ext-diff.sh` runs under `set -euo pipefail`, so any failing command exits with that command's status and fails open.

## Options considered

1. **EXIT trap installed before the first command, mapping any non-zero status to exit 2 plus a reason** *(recommended)*
2. **ERR trap** — cons: misses an explicit non-zero `exit`, which ADR-536 introduces
3. **Up-front `command -v jq` check only** — cons: cat, sed, non-JSON stdin and the final jq still exit non-zero

## Decision

Adopted-as-recommended (no user judgment): option 1. The trap is set before `IN=$(cat)`; any non-zero status ends in exit 2 with `craft git-no-ext-diff: failed (exit <n>), call denied` as the last stderr line, below the failing tool's own diagnostic. The reason write carries `|| true` so a closed stderr cannot abort the trap before the deny. Aligns with the house `never_block` trap in `hooks/bound-run.sh` (opposite polarity) and the codex guard's crash-deny (ADR-518).

## Consequences

Every crash bash can see denies. A test that moves the trap below `IN=$(cat)` goes red (cat-missing fixture). Signals, `/bin/bash` missing and an unprobed hook timeout stay residual (ADR-537).
