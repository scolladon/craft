---
name: integrate
description: Forge phase 11 - monitor CI to green, merge on user confirmation, clean up worktree/branch and repo tooling.
---

# forge:integrate

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Policy: `merge-flags`, `non-blocking-jobs`,
   `scripts.pre-teardown` from the manifest.

## Procedure (default body — a manifest `override:` replaces everything below)

1. **Monitor CI → fix to green**, ignoring jobs listed in `non-blocking-jobs`. Fixes
   land as conventional commits through the same gates as review fixes.
2. **The user confirms the merge** — never merge unprompted. Then:
   ```bash
   gh pr merge <#> --squash --delete-branch <merge-flags>
   ```
   Always `--delete-branch`: no merged branch lingers on the remote.
3. **Cleanup:**
   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-teardown.sh" <main-repo-dir> <worktree-path> \
     [--pre-teardown <manifest scripts.pre-teardown>]
   ```
   The script refuses while the mutation run-lock is alive (dead-PID locks
   auto-clear; a live lock needs `--force`, which is recorded in the run record).
   The pre-teardown script is the matched pair of workspace-phase tooling activation —
   every activation gets its prune.
4. Close the run record; deliver the final summary (PR URL, what shipped, record).
