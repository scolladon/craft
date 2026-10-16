PREAPPROVED: push, propose, integrate

# Fix: test fixtures fail under machine load when the user signs commits

Backlog entry (BACKLOG.md, section "Open (scoped 2026-10-16 — follow-ups surfaced by the
copilot-git-argv-normalising-guard run, not yet scheduled)"):

> **Pre-existing test fixtures fail under machine load when the user signs commits.** Under two
> concurrent `scripts/ci.sh` runs, `test/run-ledger.test.js:136` and `test/worktree.test.js:146` fail
> with `gpg failed to sign the data: Cannot allocate memory`: their fixture commits inherit the user's
> global `commit.gpgsign=true`. Pass `-c commit.gpgsign=false` (or an empty `HOME`) in the fixtures.

Context for a cold session:
- Line numbers may have drifted; the failing tests are the fixture-building ones in those two files
  (`withRepo`/`setup` helpers that run `git commit`).
- Proof first: a deterministic red reproduction beats load. For example, run the fixture with a git
  config whose `commit.gpgsign=true` and `gpg.program=false` (via `GIT_CONFIG_GLOBAL` pointing at a temp
  file) so every signed commit fails. Then make the fixtures immune.
- Scope: those fixtures only (other fixtures with the same shape count if the same proof covers them;
  list any others as one-line follow-ups, not fixes). Test-only change preferred over a production tweak.
- Gate: `bash scripts/ci.sh`.
- Expected shape: no genuine decisions (likely `NO-OP(decisions)`), small plan, docs may no-op.

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
