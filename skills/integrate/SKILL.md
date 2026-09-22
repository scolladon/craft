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
2. **Consult `integrate` action** (see `docs/contributing/specs/policy.md` for surface semantics).
   Obey the returned surface:
   - `ask` (default, ADR-127) — ask the user to confirm the merge, exactly as today;
     on approval proceed, on decline record `POLICY(ask:integrate→declined)` and block.
   - `never` — refuse; record `POLICY(never:integrate)`; phase no-ops.
   - `always` — proceed with no confirmation; record `POLICY(always:integrate)`;
     supersedes the former hardcoded merge confirmation (ADR-128 — Supersede).

   Then invoke the VCS port `integrate(prUrl)` (see `docs/contributing/specs/vcs.md`); the adapter
   owns the host CLI. `--squash` / `--delete-branch` / `merge-flags` semantics live in
   the adapter binding. Always delete-branch: no merged branch lingers on the remote.
3. **Derive the `Done`-bound memory delta, then consult `teardown`.** First, read this
   run's run-id lines from the on-disk ledger
   (`docs/contributing/specs/run-record.md`) and derive the `delta`; write it, in the
   same Bash call, straight to `<run-id>.delta.json` — spelled in full as
   `"$("${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/run-ledger.sh" dir)/<run-id>.delta.json"` —
   the teardown below removes the worktree and the ledger inside it, so this is the last
   point at which it can be read. A `MEMORY-RETRACT(<concern>): <merge-key>` line derives
   to `{ concern, payload, retract: true }` rather than to a plain observation; for the
   `findings` concern the `<merge-key>` is the payload split on the first run of
   whitespace, first field `file`, remainder `pattern` (see
   `docs/contributing/specs/run-record.md` Token vocabulary). The single-writer rule (R4)
   is untouched — the phase emits the ledger line, the orchestrator appends it and
   derives the delta from it here. `save` itself still runs once, atomically, at `Done`.
   Still before teardown, append `PHASE-DONE(integrate): <outcome>`, then run
   `run-ledger.sh snapshot <run-id>`: it keeps this run's own lines — the `PHASE-START`
   isos `Done` passes to `--since` included — in `<run-id>.final.md` beside the pointer.
   After teardown no ledger line can land.
   Then **consult the `teardown` action** separately before worktree teardown (per-verb
   granularity, ADR-126; see `docs/contributing/specs/policy.md`) and:
   ```bash
   "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/worktree-teardown.sh" <main-repo-dir> <worktree-path> \
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
   `docs/contributing/metrics-baseline.report.json` would flag the intended shift as drift forever.
   Declining is fine (the offer is advisory, like the signal itself); never refresh
   silently.
5. Stop appending — the ledger went with the worktree — and deliver the final summary
   (PR URL, what shipped, record read from `<run-id>.final.md`). `run-ledger.sh close`
   does not run here: it is the last action of the run skill's `Done`, after `save` and
   metrics have read the delta and snapshot files.
