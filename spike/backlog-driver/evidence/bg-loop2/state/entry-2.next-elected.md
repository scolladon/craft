# Next elected item

**ADR-253 still records that codex loads the shared skills by reference** — still the top open entry in
`BACKLOG.md` (section "Open (scoped 2026-10-16 — follow-ups surfaced by the native-surface-skills-title-fix
run, not yet scheduled)", ~L180). Unblocked, no dependency on other open entries, small (one superseding
ADR plus citation sweep, likely docs-only).

Why this one: first in top-down order and still open (entry 1 elected it; this run took the heredoc
item instead). The run just finished (bash32-heredoc-commit-idiom, PR #71) touched the copilot gate and
the core contract, nothing codex-side.

## Ready-to-paste prompt

```
/craft:run Supersede ADR-253 ("Codex loads shared craft skills by reference") with the symlink route.

Backlog entry (BACKLOG.md ~L180): ADR-253 is titled "Codex loads shared craft skills by reference",
status accepted, and its Decision chose the by-reference marketplace entry.
docs/contributing/specs/codex-poc-record.md:332 marks that claim DISPROVEN on 0.145.0 and 0.162.1
(0 of 19 by reference; 19 of 19 through the $CODEX_HOME/skills symlinks), and adapters/codex/README.md:48
says the same. `git grep 'ADR-253'` finds no superseding ADR. Fix: a user-ratified ADR that supersedes 253
with the symlink route (its option 3), keeping the adapters/codex/skills/ must-not-exist consequence.

Context for a cold session:
- Proof first: re-run `git grep -n 'ADR-253'` and cite the POC record row (file:line) and the README line.
- This is a decisions-phase fork: the supersession must be user-ratified (AskUserQuestion), not adopted.
- Supersession obligations (skills/decisions/SKILL.md step 5): new ADR frontmatter
  `supersedes: [{ adr: "253", scope: "..." }]`; flip ADR-253 Status to "superseded by ADR-NNN"; prepend its
  blockquote note; write both "Superseded from ADR-253:" and "Carried forward from ADR-253:" anchors;
  emit DECISION-REVERSAL(ADR-253) in the ledger. adr-lint's citation sweep flags ANY live-tier
  `ADR-253` mention (BACKLOG.md included, even "as refined by"): replace it with the new ADR number.
  Check with `bash scripts/adr-lint.sh docs/contributing/adr --manifest .claude/workflow.md`.
- Keep the `adapters/codex/skills/` must-not-exist pin in adapters/codex/test/native-surface.test.js intact.
- README counts (README.md ~L201: design docs / plans / ADRs — ADRs now 607) move in the same commit as
  each new doc.
- Likely docs-only: validation/architecture should auto-skip; review may auto-skip if no source diff.
- Gate: `bash scripts/ci.sh`.
- Commit form (now in contracts/core.md): `git commit -m "<message>"`, never `-m "$(cat <<'EOF' …)"`.
- Traps in a background worktree session: use `/usr/bin/git` for every git verb (rtk rewrite vs guard);
  the worktree guard refuses heredocs fed to scripts (`run-ledger.sh append … <<EOF`), `$(…)` inside
  heredocs, and printf lines whose text mentions git — write ledger lines to a NEW file with the Write
  tool (re-Writing the same scratch file can fail on stale read-state and then the append re-sends the
  old lines), then `run-ledger.sh append <id> <phase> < <file>`. `bash scripts/ci.sh > log 2>&1; echo "ci=$?"`
  works; `echo ci=$?` unquoted was refused. Files under the main checkout's .claude/driver-state-*/ can't
  be written with Write after leaving the worktree: write to $CLAUDE_JOB_DIR/tmp and `cp`.
- Done: memory save via engine/src/observability/memory.js load()/save() from main, run
  test/memory-store.test.js after, emit-metrics with --session (dry-run to .claude/metrics-dryrun.md first),
  one `chore(metrics): record the <slug> run` commit pushed to main (admin bypass is expected).
```
