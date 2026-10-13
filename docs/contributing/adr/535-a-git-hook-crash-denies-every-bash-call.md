---
subjects:
  - hooks/git-no-ext-diff.sh
  - README.md
supersedes: []
---
# 535 — A git hook crash denies every Bash call

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/claude-hook-nonzero-exit-probe.md

## Context

Claude Code 2.1.296 runs a PreToolUse(Bash) call on every hook exit status except 2: exit 1 (3/3), exit 127 and a SIGKILL death all ran the call and showed the model a clean result (live `claude -p` probe, see the design's Context). `hooks/git-no-ext-diff.sh` runs under `set -euo pipefail`, so any failing command exits with that command's status and fails open. The realistic trigger is `jq` missing from `PATH`; then every Bash call crashes the hook.

## Options considered

1. **Deny every Bash call that crashes the hook** *(recommended)* — cons: no jq ⇒ Bash unusable under the plugin until the user installs it
2. **Deny only calls whose raw stdin loosely contains git + diff/show** — cons: over-denies (description, cwd, transcript_path are in stdin), duplicates the predicate, must deny all anyway when cat fails

## Decision

Ratified by the user: option 1. The trap knows nothing about git: one predicate, as the codex guard does (ADR-518). The cost is accepted and made visible to operators (ADR-538).

## Consequences

On a host without `jq`, every Bash call is denied with a readable reason naming the missing tool; the agent cannot fix it, the user installs `jq`. Today the same host runs unguarded.
