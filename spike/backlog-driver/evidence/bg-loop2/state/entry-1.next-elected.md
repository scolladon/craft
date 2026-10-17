# Next elected item

**ADR-253 still records that codex loads the shared skills by reference** — the top open entry in
`BACKLOG.md` (section "Open (scoped 2026-10-16 — follow-ups surfaced by the native-surface-skills-title-fix
run, not yet scheduled)"). Unblocked, no dependency on other open entries, small (one superseding ADR plus
citation sweep).

Why this one: it is first in top-down order. The codex adapter README and POC record already state the
symlink route (0/19 by reference vs 19/19 through `$CODEX_HOME/skills` symlinks, on 0.145.0 and 0.162.1),
so the decision record is the one stale surface. The run just finished (codex-rules-deploy-step, PR #70)
touched adjacent codex docs but not ADR-253.

## Ready-to-paste prompt

```
/craft:run Supersede ADR-253 ("Codex loads shared craft skills by reference") with the symlink route.

Backlog entry (BACKLOG.md, top of "Candidate phases"): ADR-253 is titled "Codex loads shared craft skills
by reference", status accepted, and its Decision chose the by-reference marketplace entry.
docs/contributing/specs/codex-poc-record.md:332 marks that claim DISPROVEN on 0.145.0 and 0.162.1
(0 of 19 by reference; 19 of 19 through the $CODEX_HOME/skills symlinks), and adapters/codex/README.md
says the same. `git grep 'ADR-253'` finds no superseding ADR. Fix: a user-ratified ADR that supersedes 253
with the symlink route (its option 3), keeping the adapters/codex/skills/ must-not-exist consequence.

Context for a cold session:
- Proof first: re-run `git grep -n 'ADR-253'` and cite the POC record row (file:line) and the README line.
- This is a decisions-phase fork: the supersession must be user-ratified (AskUserQuestion), not adopted.
- Supersession obligations (skills/decisions/SKILL.md step 5): new ADR frontmatter
  `supersedes: [{ adr: "253", scope: "..." }]`; flip ADR-253 Status to "superseded by ADR-NNN"; prepend its
  blockquote note; write both "Superseded from ADR-253:" and "Carried forward from ADR-253:" anchors;
  sweep live-tier ADR-253 citations; emit DECISION-REVERSAL(ADR-253) in the ledger.
  `bash scripts/adr-lint.sh docs/contributing/adr --manifest .claude/workflow.md` must pass.
- Keep the `adapters/codex/skills/` must-not-exist pin in adapters/codex/test/native-surface.test.js intact.
- README counts (README.md ~L200: design docs / plans / ADRs) move in the same commit as each new doc.
- Likely docs-only: validation/architecture should auto-skip; review may auto-skip if no source diff.
- Gate: `bash scripts/ci.sh`.
- Traps: in a background worktree session use /usr/bin/git for add/commit/status (rtk rewrite vs guard);
  the worktree guard refuses redirects/variables in compound commands — put multi-step shell in a script
  file under $CLAUDE_JOB_DIR/tmp. Bookkeeping (memory save + emit-metrics + memory-store floors) cannot be
  edited in the shared main checkout: do it in a throwaway worktree off origin/main and push HEAD:main.
- Etiquette: no session links or AI traces in commits, PR title/body; scripted git diff/show pass --no-ext-diff.
```
