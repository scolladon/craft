## Driver protocol (this run is driven by an outer loop — read before anything else)

- **Pre-approved outward actions.** The user pre-approved push, PR creation and merge for this run.
  The `--policy` flags on the `/craft:run` line and the line above say so; do not ask for them.
  The standing `gh pr merge <n> --squash --delete-branch --admin` OK applies, and so does the
  `chore(metrics)` bookkeeping push to main. A PreToolUse guard denies push, `gh pr create` and
  `gh pr merge` when this file lacks the PREAPPROVED line. If the guard denies one, record it as a
  blocker and do not work around it.
- **Asking.** A person is watching; on an ask the driver notifies them and they answer through `claude attach`. Ask through
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
