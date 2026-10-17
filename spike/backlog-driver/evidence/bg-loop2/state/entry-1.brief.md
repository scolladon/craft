PREAPPROVED: push, propose, integrate

# Fix: no install step deploys `craft.rules` to `$CODEX_HOME/rules/`

Backlog entry (BACKLOG.md, section "Open (scoped 2026-10-15 — follow-ups surfaced by the
codex-0162-reprobe run, not yet scheduled)"):

> **No install step deploys `craft.rules` to `$CODEX_HOME/rules/`.** `adapters/codex/README.md`
> lists the execpolicy `.rules` file as a guard layer (*Guard — honest enforcement profile* table),
> but neither *Load* nor *Configure* tells an operator to copy `adapters/codex/craft.rules` into
> `$CODEX_HOME/rules/`, the directory codex loads it from; `git grep 'CODEX_HOME/rules'` finds the
> path only in the POC record and this file. Unless someone copies it by hand, the layer is absent.
> Fix: one *Configure* step naming the copy, pinned like the other README instructions in
> `adapters/codex/test/native-surface.test.js`. Measured 2026-10-16 (`codex execpolicy check`,
> 0.162.1): an empty or comments-only `craft.rules` parses cleanly and forbids nothing, so no
> codex parse error flags a void copy, and the step that copies the file owns verifying what it
> wrote. The same holds for a stale copy once the rule body changes: it parses and forbids less.
> 

Context for a cold session:
- Proof first: re-run `git grep 'CODEX_HOME/rules'` and cite the README *Configure* section (file:line).
- Scope: one *Configure* step naming the copy (and, per the measured empty-file fact, how the operator
  verifies what was copied), pinned in `adapters/codex/test/native-surface.test.js` like the other README
  instructions. Docs + pin only; no installer code.
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
  to `/Users/scolladon/workspace/perso/craft/.claude/driver-state-bg2/entry-1.next-elected.md` instead of handing it over in chat.
- **Status file — the very last action of the run**, after the ledger `close` and the final
  bookkeeping push: write `/Users/scolladon/workspace/perso/craft/.claude/driver-state-bg2/entry-1.status` with exactly one line,
  `FINISHED <merged PR url>` or `BLOCKED <reason>`. Write nothing after it.
- Etiquette: never publish session links or AI traces (commits, trailers, PR title/body).
  Scripted `git diff`/`git show` pass `--no-ext-diff`. Verify every part-implementer commit
  (`git status --porcelain` + `git ls-files` for any test file it claims) and run the gate yourself.
  README counts move with new design/plan/ADR docs (same commit).
