---
name: integrate
description: Craft phase 11 - monitor CI to green, merge on user confirmation, clean up worktree/branch and repo tooling.
---

# craft:integrate

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Policy: `merge-flags`, `non-blocking-jobs`,
   `scripts.pre-teardown` from the manifest.

## Procedure (default body — a manifest `override:` replaces everything below)

1. **Monitor CI → fix to green**, ignoring jobs listed in `non-blocking-jobs`. Fixes
   land as conventional commits through the same gates as review fixes.
2. **Consult `integrate` action** (see `docs/adapters/policy.md` for surface semantics).
   Obey the returned surface:
   - `ask` (default, ADR-127) — ask the user to confirm the merge, exactly as today;
     on approval proceed, on decline record `POLICY(ask:integrate→declined)` and block.
   - `never` — refuse; record `POLICY(never:integrate)`; phase no-ops.
   - `always` — proceed with no confirmation; record `POLICY(always:integrate)`;
     supersedes the former hardcoded merge confirmation (ADR-128 — Supersede).

   Then invoke the VCS port `integrate(prUrl)` (see `docs/adapters/vcs.md`); the adapter
   owns the host CLI. `--squash` / `--delete-branch` / `merge-flags` semantics live in
   the adapter binding. Always delete-branch: no merged branch lingers on the remote.
3. **Consult `teardown` action** separately before worktree teardown (per-verb
   granularity, ADR-126; see `docs/adapters/policy.md`). Then:
   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-teardown.sh" <main-repo-dir> <worktree-path> \
     [--pre-teardown <manifest scripts.pre-teardown>]
   ```
   The script refuses while the validation run-lock is alive (dead-PID locks
   auto-clear; a live lock needs `--force`, which is recorded in the run record).
   The pre-teardown script is the matched pair of workspace-phase tooling activation —
   every activation gets its prune.
4. **Drift-baseline refresh offer:** when the merged change touched `skills/` or
   `agents/` (the prompt surface whose economics the drift signal watches), offer the
   user a baseline refresh per `skills/metrics/SKILL.md` § Refreshing the committed
   baseline — the per-phase economics shifted on purpose, so the pre-change
   `docs/metrics-baseline.report.json` would flag the intended shift as drift forever.
   Declining is fine (the offer is advisory, like the signal itself); never refresh
   silently.
5. Close the run record; deliver the final summary (PR URL, what shipped, record).
