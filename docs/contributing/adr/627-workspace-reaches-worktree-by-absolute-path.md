---
subjects:
  - skills/workspace/SKILL.md
---
# 627 — The workspace phase reaches its worktree by absolute path and never relocates the session

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/driver-contract-in-craft-run.md · **Supersedes/Refines:** none

## Context

In a `claude --bg` session, `EnterWorktree` on `../<repo>-<slug>` raises a permission-root prompt auto mode cannot approve (spike run #69). Probe P2 (2026-10-17, CLI 2.1.302): a `--bg` session wrote into a sibling git worktree with the Write tool, no `EnterWorktree`, no prompt; the control Write into the shared checkout was refused by the isolation guard.

## Options considered

1. **Craft-side: reach the worktree by absolute path; never call `EnterWorktree`** *(recommended)*
2. **Craft-side: a bg session creates the worktree under `.claude/worktrees/` and enters it** — cons: layout forks by session kind; untracked noise in consumer repos
3. **Driver hook only** — cons: unanswerable prompt without a hook

## Decision

The user ratified option 1. All work after the workspace phase addresses the worktree by its absolute path (Bash `cd <abs> && …`, file tools at `<abs>/…`, agents with it as working directory). The session is never moved with a working-directory relocation tool.

## Consequences

- The driver spec documents a `PermissionRequest` hook as the fallback for CLI versions where P2 does not hold.
