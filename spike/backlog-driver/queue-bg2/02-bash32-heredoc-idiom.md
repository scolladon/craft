PREAPPROVED: push, propose, integrate

# Decide and land: the heredoc commit idiom fails under macOS `/bin/bash` 3.2

Backlog entry (BACKLOG.md, section "Open (scoped 2026-10-16 — follow-ups surfaced by the
copilot-git-argv-normalising-guard run, not yet scheduled)"):

> **Craft's heredoc commit idiom fails under macOS `/bin/bash` 3.2 when the message holds an apostrophe.**
> `git commit -m "$(cat <<'EOF' … don't … EOF)"` is a syntax error in bash 3.2 (reproduced locally and live
> on copilot, which runs `/bin/bash`); bash 5 accepts it. The copilot guard allows the idiom; bash rejects
> it. Document the workaround for bindings that shell out to bash 3.2 (multiple `-m "…"` with double
> quotes), or pick a commit form both shells parse.

Context for a cold session:
- Proof first: reproduce with `/bin/bash -c` (bash 3.2.57 on this box) vs a bash 5 if present; quote the
  exact error.
- **This entry carries a genuine fork for the user**: document the bash-3.2 workaround for the bindings
  that shell out to it, vs change the commit form craft's prompts/skills use so both shells parse it
  (name where the idiom is taught). Put it to the user in the decisions phase through AskUserQuestion
  with your recommendation; do not adopt it silently. Land whichever is chosen and tick the entry.
- Gate: `bash scripts/ci.sh`.
- **Fold follow-ups, don't grow the backlog.** A finding with the same root cause or the same claim as this
  entry (another surface, file or doc stating it) is fixed in this run. Only a proven, out-of-scope issue
  gets a backlog entry, and it must name why it can't be folded. Amending an existing entry beats a new one.

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
