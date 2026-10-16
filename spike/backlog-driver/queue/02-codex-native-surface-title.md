PREAPPROVED: push, propose, integrate

# Fix: native-surface.test.js describe title claims the shared skills load by reference

Backlog entry (BACKLOG.md, section "Open (scoped 2026-10-15 — follow-ups surfaced by the
codex-0162-reprobe run, not yet scheduled)"):

> **`native-surface.test.js` describe title claims the shared skills load by reference.**
> `adapters/codex/test/native-surface.test.js:84` reads `adapters/codex/skills/ — must not exist:
> shared craft skills load by reference`, while the record and README pin 0 of 19 by reference on
> 0.145.0 and 0.162.1 (the symlink route is required). The assertion itself (no
> `adapters/codex/skills/` dir) is right; only the title states a disproven reason. Fix: retitle
> to the real reason (the shared skills live at the repository root and reach codex through the
> symlinks).

Context for a cold session:
- Source of truth for the real reason: `docs/contributing/specs/codex-poc-record.md` and
  `adapters/codex/README.md` (the symlink route). Quote their wording; do not invent a new claim.
- Title-only change: the assertion stays. The "proof" is the record/README lines that contradict the
  current title (cite file:line).
- Gate: `bash scripts/ci.sh`.
- Expected shape: no genuine decisions, one-part plan, docs likely no-op.

## Driver protocol (this run is driven by an outer loop — read before anything else)

- **Pre-approved outward actions.** The user pre-approved push, PR creation and merge for this run.
  The `--policy` flags on the `/craft:run` line and the line above say so; do not ask for them.
  The standing `gh pr merge <n> --squash --delete-branch --admin` OK applies, and so does the
  `chore(metrics)` bookkeeping push to main. A PreToolUse guard denies push, `gh pr create` and
  `gh pr merge` when this file lacks the PREAPPROVED line. If the guard denies one, record it as a
  blocker and do not work around it.
- **Asking.** A person is attached to this tmux session and will answer. Ask through
  AskUserQuestion only for a genuine decisions-phase fork or a paid eval. Never end a turn
  with a question in prose while the run is unfinished.
- **Stop conditions.** If CI is still red after one fix round, stop: write the status file
  (below) with `BLOCKED ci-red-after-one-fix-round <PR url>`. Any other blocker: `BLOCKED <reason>`.
- **Next item.** At the end of the run, write the elected next item and its ready-to-paste prompt
  to `{{STATE}}/entry-{{N}}.next-elected.md` instead of handing it over in chat.
- **Status file — the very last action of the run**, after the ledger `close` and the final
  bookkeeping push: write `{{STATE}}/entry-{{N}}.status` with exactly one line,
  `FINISHED <merged PR url>` or `BLOCKED <reason>`. Write nothing after it.
- Etiquette: never publish session links or AI traces (commits, trailers, PR title/body).
  Scripted `git diff`/`git show` pass `--no-ext-diff`. Verify every part-implementer commit
  (`git status --porcelain` + `git ls-files` for any test file it claims) and run the gate yourself.
  README counts move with new design/plan/ADR docs (same commit).
