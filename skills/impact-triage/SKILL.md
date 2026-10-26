---
name: impact-triage
description: Craft impact-triage phase - re-verify every impact the run deferred through a read-only triager, show the verdicts, file the backlog-worthy ones under the backlog-write policy, and list them in the PR body.
---

# craft:impact-triage

## Preamble (always runs — non-overridable)

1. Manifest read (run `manifest-lint.sh` if standalone). Resolve the filing target per
   `docs/contributing/specs/backlog.md` Filing: `source: file` → its `ref`; no `source` key
   → the root `BACKLOG.md` when it exists, else none; `source: custom` → none.
2. **Cross-phase wait:** start only once the in-session `awaitingHarnesses` set is empty —
   every awaited executing-harness has landed, its triage is done (the documentation
   late-EXCEPTION synthesis included) and its gate is green, or it was released by
   `auto-skip`, `NO-OP` or a waiver. Not yet → wait. This phase is never itself awaited.
3. **Standalone:** no open run means no store. Say `no open run: no discovered-impacts store`
   in the final output and stop, writing nothing.
4. Resolve the store:

   ```bash
   ledger="${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/run-ledger.sh"
   store="$("$ledger" dir)/<run-id>.impacts.md"
   ```

## Procedure (default body — a manifest `override:` replaces everything below)

Session-owned, never delegated, except the spawn in step 2: the ledger, the store writes and
the BACKLOG write live in the session.

1. **Untriaged ids.** The `I<n>` of every `DEFERRED(` line of this run with no
   `TRIAGED(I<n>):` line. None → go to step 5.
2. **Spawn `craft:impact-triager`** with the store path, the untriaged ids, the worktree
   path, the filing target path (or `none`), the base revision `<base>`, and the global +
   impact-triage-phase `context:` files verbatim.
3. **Record each verdict.** Pipe its one-line rationale into
   `"$ledger" verdict <run-id> I<n> <verdict>`; the script appends the verdict to the store
   and `TRIAGED(I<n>): <verdict> — <rationale>` to the ledger. A returned id with no
   verdict, or a verdict the script refuses (exit 2), → re-spawn once for those ids only,
   then blocker `{ impact-triage, reason, ≤3 options }`.
4. **Show, then file.** Print the verdict table (id, verdict, title, rationale) before
   anything is written.
   - No filing target → append
     `NO-OP(impact-triage): no file-backed backlog — verdicts in the PR body only`, go to
     step 5.
   - Else consult the `backlog-write` action (default `always`; see
     `docs/contributing/specs/policy.md`). A refusal records its `POLICY(...)` line, writes
     nothing, and goes to step 5.
   - On proceed, write every drafted `backlog:*` entry under one section
     `### Open (scoped <date> — follow-ups surfaced by the <slug> run, triaged)`, following
     the repo's ordering convention. Each entry keeps its `Not folded: <reason>` sentence. A
     spike entry opens with `Spike — ` and carries `Question: <what the probe must answer>`.
   - Commit `docs(<slug>): file triaged impacts`, then append one
     `FILED(<file>): I<n> <title> — not folded: <reason>` line per filed entry.
   - No `backlog:*` verdict → no section, no commit.
5. **PR trailer.** Rewrite the drafted PR body's `- **Discovered impacts:**` line as
   `<n> deferred: <x> ready, <y> spike, <z> reject`, then one line per entry
   (`I<n> <verdict> — <title>`), or `none`.

The phase never gates `propose` beyond its own steps; a verdict never folds.
