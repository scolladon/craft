---
subjects:
  - skills/validation/SKILL.md
  - scripts/worktree-teardown.sh
  - docs/contributing/specs/vcs.md
---
# 633 — The validation run-lock lives in the per-worktree git dir

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/driver-rebuild-bg-lock-gaps.md · **Supersedes/Refines:** Refines ADR-153 (lock name and location) and, through it, ADR-036

## Context

The validation phase wrote `<root>/.craft-validation.lock` into the worktree of every consumer repo,
while `documentation` agents committed in parallel. Nothing ignored it (E4), so a broad `git add` could
commit it. A `.gitignore` line in craft's own repo would protect only craft.

## Options considered

1. **The per-worktree git dir**, at the path `git -C <root> rev-parse --path-format=absolute --git-path
   craft-validation.lock` prints *(recommended)*. Pros: no repo can commit it, and it is removed with
   the worktree. Cons: writer and teardown must both resolve the path.
2. **Keep the in-tree file and add a `.gitignore` entry**, in craft's repo or written into the consumer's.
   Cons: protects only craft, or adds a diff to every consumer PR.
3. **The git common dir, beside the ledger.** Cons: all worktrees share it, so teardown would need the
   run-id in its argv.

## Decision

The user ratified option 1. The lock path is `git -c safe.bareRepository=explicit -C <root> rev-parse
--path-format=absolute --git-path craft-validation.lock`. `--path-format=absolute` is mandatory, because
without it the main checkout's answer is relative to the cwd. The content is still
`<pid> <iso-timestamp>`. `worktree-teardown.sh` resolves the same path from the worktree before it
removes anything. If the path cannot be resolved, teardown exits 2 and removes nothing. A pre-change
`<root>/.craft-validation.lock` is not read.

## Consequences

- No ignore entry is needed in any repo.
- Teardown's live-lock refusal (exit 3) and `--force` behaviour are unchanged.
