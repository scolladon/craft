---
subjects:
  - skills/workspace/SKILL.md
  - skills/run/SKILL.md
---
# 632 — Strategy `in-place` stops at workspace in a Claude Code background session

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/driver-rebuild-bg-lock-gaps.md · **Supersedes/Refines:** none

## Context

A `claude --bg` session refuses Write/Edit in the shared checkout until it isolates. The guard message
names `worktree.bgIsolation`. Strategy `in-place` keeps every edit in that checkout, so the run would
fail at its first edit, after the branch switch. A live probe (E3) found that `CLAUDE_JOB_DIR` is set in
a background session's Bash env and absent in a foreground one. `CLAUDE_CODE_SESSION_KIND` is not set.

## Options considered

1. **Refuse: STOP before `git switch` when `CLAUDE_JOB_DIR` is set** *(recommended)*. Pros: fails before
   any mutation; a driven run reports `BLOCKED workspace`. Cons: a repo that turned `bgIsolation` off is
   refused too, because craft cannot read the merged settings.
2. **Document the limit only.** Cons: the run fails mid-pipeline, on a switched branch.
3. **Fall back to strategy `worktree` in a background session.** Cons: silently overrides the manifest.

## Decision

The user ratified option 1. Under strategy `in-place`, when `CLAUDE_JOB_DIR` is non-empty, the workspace
phase STOPs before `git switch`. The reason names the ways out: strategy `worktree`, running attended,
or `worktree.bgIsolation: none` in the repo's Claude settings. The Driven stop invariant lists this STOP
beside the workspace collision STOP.

## Consequences

- Bindings that never set `CLAUDE_JOB_DIR` are unaffected.
- The variable is undocumented CLI behaviour (2.1.302). If a later CLI drops it, the guard's own
  refusal at the first edit takes over, which is today's behaviour.
