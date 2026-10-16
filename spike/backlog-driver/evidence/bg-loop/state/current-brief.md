PREAPPROVED: push, propose, integrate

# Decide and land: should a launch or install path call `assertRulesIntegrity`?

Backlog entry (BACKLOG.md, section "Open (scoped 2026-10-15 — follow-ups surfaced by the
codex-0162-reprobe run, not yet scheduled)"):

> **Should a launch or install path call `assertRulesIntegrity`?**
> `adapters/codex/src/execpolicy-rules.js` exports it and
> `adapters/codex/test/execpolicy-rules.test.js` tests it, but `grep -rn assertRulesIntegrity`
> matches nothing else: no bin, launch path or install step runs it, so a drifted or malformed
> deployed rules file is caught only when someone invokes the check. The design that introduced
> it (`docs/contributing/design/harden-prove-codex-binding.md`) asked for a launch precondition,
> and none was wired. Open question: wire it into a launch or install path, or keep it on
> demand. Question only; no fix is scoped.

Context for a cold session:
- Proof first: re-run the grep and cite the design doc's launch-precondition line (file:line).
- **This entry carries a genuine fork for the user**: wire the check into a launch or install path
  (which one — name the real candidates you find) vs keep it on demand (and record why). Put it to
  the user in the decisions phase through AskUserQuestion with your recommendation; do not adopt
  it silently. Whatever is chosen, land it: code + tests if wired, or the BACKLOG/README/design
  wording that records the on-demand choice if not, and tick the backlog entry.
- Gate: `bash scripts/ci.sh`.

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
  to `/Users/scolladon/workspace/perso/craft/.claude/driver-state-bg/entry-1.next-elected.md` instead of handing it over in chat.
- **Status file — the very last action of the run**, after the ledger `close` and the final
  bookkeeping push: write `/Users/scolladon/workspace/perso/craft/.claude/driver-state-bg/entry-1.status` with exactly one line,
  `FINISHED <merged PR url>` or `BLOCKED <reason>`. Write nothing after it.
- Etiquette: never publish session links or AI traces (commits, trailers, PR title/body).
  Scripted `git diff`/`git show` pass `--no-ext-diff`. Verify every part-implementer commit
  (`git status --porcelain` + `git ls-files` for any test file it claims) and run the gate yourself.
  README counts move with new design/plan/ADR docs (same commit).
