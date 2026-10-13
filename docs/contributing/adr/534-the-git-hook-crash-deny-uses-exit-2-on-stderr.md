---
subjects:
  - hooks/git-no-ext-diff.sh
supersedes: []
---
# 534 — The git hook's crash deny uses exit 2 on stderr

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/claude-hook-nonzero-exit-probe.md

## Context

Claude Code 2.1.296 runs a PreToolUse(Bash) call on every hook exit status except 2: exit 1 (3/3), exit 127 and a SIGKILL death all ran the call and showed the model a clean result (live `claude -p` probe, see the design's Context). `hooks/git-no-ext-diff.sh` runs under `set -euo pipefail`, so any failing command exits with that command's status and fails open. The matcher's own verdict is a JSON `permissionDecision: deny` on stdout with exit 0.

## Options considered

1. **Exit 2 with the reason on stderr** *(recommended)*
2. **A fixed JSON deny on stdout with exit 0** — cons: a crash in the final `jq -cn` can leave partial stdout the fixed JSON would be appended to; the JSON channel was not re-probed on 2.1.296

## Decision

Adopted-as-recommended (no user judgment): option 1. Exit 2 is the probe-pinned deny on 2.1.296, and its stderr reaches the model as `PreToolUse:Bash hook error: [<hook path>]: <stderr>`. The JSON deny stays the matcher's verdict channel. Aligns with ADR-518 (codex crash path: exit 2 + stderr).

## Consequences

Two deny channels coexist: JSON for a matched command, exit 2 for a crash. The hook path appears in the model-visible reason, which Claude Code already shows.
