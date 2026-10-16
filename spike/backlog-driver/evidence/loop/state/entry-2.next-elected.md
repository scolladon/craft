# Next elected item

**ADR-253 still records that codex loads the shared skills by reference.** This is the top entry of
BACKLOG.md, under "Open (scoped 2026-10-16 — follow-ups surfaced by the native-surface-skills-title-fix
run)". This run (PR #68) surfaced it.

Why this one:
- It is the top of the newest Open section, so it is next in top-down order.
- It is unblocked: no paid eval, no live codex session, no dependency on the driver spike.
- The contradiction is proven. `docs/contributing/adr/253-codex-shared-skills-by-reference.md:1` is
  titled "Codex loads shared craft skills by reference", with status `accepted` and the by-reference
  marketplace entry chosen. `docs/contributing/specs/codex-poc-record.md:332` marks that claim
  DISPROVEN on 0.145.0 and 0.162.1. `git grep 'ADR-253'` finds no superseding ADR.
- It is small: one supersession ADR plus a citation sweep, with no code change.

Runner-up: **Compose the destructive-git predicate into the codex hook** (the top of the
copilot-git-argv-normalising-guard section, elected at entry-1 but not yet run). It is a real guard
gap, but it needs a live codex proof run and a decisions fork, so it is a larger run.

## Ready-to-paste prompt

```
/craft:run --policy push=always --policy propose=always --policy integrate=always --policy teardown=always Supersede ADR-253: codex loads the shared skills through the $CODEX_HOME/skills symlinks, not by reference.

Backlog entry (BACKLOG.md, "Open (scoped 2026-10-16 — follow-ups surfaced by the native-surface-skills-title-fix run)"):
> `docs/contributing/adr/253-codex-shared-skills-by-reference.md:1` is titled "Codex loads shared craft
> skills by reference" with status `accepted`, and its Decision chose the by-reference marketplace entry.
> `docs/contributing/specs/codex-poc-record.md:332` marks that claim DISPROVEN on 0.145.0 and 0.162.1
> (0 of 19 by reference; 19 of 19 through the `$CODEX_HOME/skills` symlinks), and
> `adapters/codex/README.md:48` says the same. `git grep 'ADR-253'` finds no superseding ADR. Fix: a
> user-ratified ADR that supersedes 253 with the symlink route (its option 3), keeping the
> `adapters/codex/skills/` must-not-exist consequence.

Context for a cold session:
- Sources of truth, quote them and claim nothing new: codex-poc-record.md:115, :332, :439-454, :555-556
  and adapters/codex/README.md:48-56, :189-191. The symlink route is required on every install, not a
  fallback.
- Find out first whether the `craft-codex` marketplace entry (adapter agents/hooks/entrypoint) still
  holds. ADR-253 chose two marketplace entries, and only the `craft` entry's by-reference `skills` load is
  disproven. The new ADR may supersede only the skills-loading half. That is a genuine decisions-phase
  fork for the user (full supersede vs. refine): ask with AskUserQuestion.
- Supersession mechanics: `supersedes:` frontmatter, both body anchors, a
  `DECISION-REVERSAL(ADR-253): … -> ADR-MMM` ledger line, and a citation sweep over every live page that
  cites 253 (dated design/plan docs stay as written). adr-lint C3 applies. README ADR count moves in the
  same commit as the new ADR.
- ADR-253 L23 ("`adapters/codex/skills/` must not exist") is still pinned by
  adapters/codex/test/native-surface.test.js:84 (retitled in PR #68). Keep that consequence.
- Gate: `bash scripts/ci.sh`. One timing test (`validatePhases … does not grow quadratically`) failed
  1 of 4 unchanged runs during PR #68. Re-run before you treat a red as yours.
- Expected shape: docs/ADR-only, so review/refactoring/validation/architecture will likely auto-skip.
```
