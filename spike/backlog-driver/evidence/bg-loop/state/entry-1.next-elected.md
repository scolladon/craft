# Next elected item

**Elected:** BACKLOG.md top open entry (section "Open (scoped 2026-10-16 — follow-ups surfaced by the
native-surface-skills-title-fix run)"): **ADR-253 still records that codex loads the shared skills by
reference.** Top-down first open entry, unblocked, no live probe needed, small (one superseding ADR plus
citation sweep).

Not elected, with reasons:
- The README vhs demo is item 4 in the agreed 2026-10-14 order. It needs a live recorded run rather
  than a backlog fix, so a person has to schedule it.
- The deploy-step entry ("No install step deploys `craft.rules`") is next in the codex family. As of
  this run it carries a decided verification angle (ADR-599: the copy step owns verifying what it
  writes), so it is a good follow-on after ADR-253.

## Ready-to-paste prompt

```
/craft:run "Supersede ADR-253 (codex loads the shared skills by reference). BACKLOG.md, section 'Open (scoped 2026-10-16 — follow-ups surfaced by the native-surface-skills-title-fix run)', entry 'ADR-253 still records that codex loads the shared skills by reference.' Proof first: docs/contributing/adr/253-codex-shared-skills-by-reference.md is status accepted and its Decision chose the by-reference marketplace entry; docs/contributing/specs/codex-poc-record.md:332 marks that DISPROVEN on 0.145.0 and 0.162.1 (0/19 by reference, 19/19 via $CODEX_HOME/skills symlinks); adapters/codex/README.md:48 agrees; git grep 'ADR-253' finds no superseding ADR. Decision point (decisions phase, AskUserQuestion with a recommendation): supersede with the symlink route (ADR-253's option 3), keeping the adapters/codex/skills/ must-not-exist consequence; scope of the supersession (whole ADR vs Decision only). The supersession must satisfy adr-lint in the same commit: new ADR supersedes: frontmatter (zero-padded adr id + scope), flip ADR-253's Status line to 'superseded by ADR-NNN', prepend its blockquote note, both 'Superseded from' / 'Carried forward from' anchors, sweep live-tier ADR-253 citations, emit DECISION-REVERSAL. Check whether ADR-251 (copilot, mirrored by 253) is affected and say so with proof, but do not change it unless proven wrong. Tick the backlog entry. Gate: bash scripts/ci.sh. README counts move with new design/plan/ADR docs in the same commit. Etiquette: never publish session links or AI traces; scripted git diff/show pass --no-ext-diff; verify every part-implementer commit (git status --porcelain + git ls-files) and run the gate yourself. Known trap: in a worktree-isolated session the rtk git rewrite + worktree guard refuse sub-agent git add/commit/status/log/diff — tell agents to hand back uncommitted and commit as orchestrator with /usr/bin/git, and keep the word 'git' out of ledger heredocs."
```
