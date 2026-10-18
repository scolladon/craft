# Design — driver-rebuild-bg-lock-gaps

> Brief: close four gaps left by the driver contract. (1) A driven session whose context is
> rebuilt after `run-ledger.sh close` has no rebuild path to its status write. (2) The driver
> spec's claim that `CRAFT_DRIVER_STATE` reaches a `claude --bg --resume` session is unprobed, and
> the probe shows it is wrong. (3) `strategy: in-place` cannot work in a `claude --bg` session, and
> the workspace skill does not say so. (4) `.craft-validation.lock` sits untracked in the
> consumer's worktree root, so a broad `git add` can commit it. All four are folded into this one
> change. The four BACKLOG entries are ticked in the post-merge bookkeeping commit, not on this branch.
> Status: draft → self-reviewed ×3 → revised against ADR-631–634

## Context

**What exists today.**

| Concern | Where | Today |
|---|---|---|
| Status write after `close` | `skills/run/SKILL.md` §Done, "Driver hand-off" | `run-ledger.sh close` removes pointer + ledger, then `driver-state.sh finished/blocked` is the last tool call (ADR-624). An existing `status` is never overwritten: exit 4 (ADR-629). |
| Rebuild after compaction | `skills/run/SKILL.md` "Rebuild after compaction" steps 1–6 | Step 1 locates the ledger (`run-ledger.sh locate --run <run-id>`), then step 3 pipes it into `run-state.js`. There is no branch for "no ledger". `locate_by_run` (`scripts/run-ledger.sh`) prints nothing and exits 0 when the ledger is gone. |
| `close` re-run | `scripts/run-ledger.sh` `cmd_close` | `rm -f` pointer + ledger: closing a closed run exits 0 with no output. No test pins this. |
| Env channel | `docs/contributing/specs/driver.md` §Activation; ADR-620 (env only, no flag) | "Set `CRAFT_DRIVER_STATE` again on `claude --bg --resume` … the variable set on the `claude --bg` launcher reaches the session." |
| Background sessions | `docs/contributing/specs/driver.md` §Background sessions; ADR-627 | Worktree reached by absolute path, never `EnterWorktree`. |
| In-place strategy | `skills/workspace/SKILL.md` step 2 | `git switch -c <type>/<slug>` in the current checkout. Silent about `--bg`. |
| Run-lock | `skills/validation/SKILL.md:132`, `scripts/worktree-teardown.sh:4,25`, `docs/contributing/specs/vcs.md:46,55`, `test/worktree.test.js:194,220,254,307`; ADR-036 / ADR-049 / ADR-153 (name) | `<root>/.craft-validation.lock` ← `<pid> <iso-timestamp>`, written by the orchestrator's background Bash call. Teardown reads `$WT/.craft-validation.lock`. A dead PID auto-clears, a live PID refuses with exit 3, and `--force` goes past it. |
| Run files outside the tree | `scripts/run-ledger.sh` `resolve_git_common` (ADR-383/384) | Precedent: `git -c safe.bareRepository=explicit rev-parse --path-format=absolute --git-common-dir`. |

**Pinned evidence.** From live probes, CLI 2.1.302, haiku toy sessions, 2026-10-18. No session
probe was re-run for this doc. E4' was re-run here in a throwaway repo.

*E1: kill between `close` and the status write.* A driven `--bg` toy session was SIGKILLed by a
PostToolUse hook right after `run-ledger.sh close` (07:01:09Z). The transcript keeps the `close`
tool_use but has no tool_result. The bg supervisor restarted the **same session id** about 15 s later
and injected "Continue from where you left off … this session was automatically restarted after
its process exited unexpectedly … Re-verify anything time-sensitive". The session re-ran `close`
(exit 0, no output), then `driver-state.sh active`, then `finished <url>`, which wrote
`status` = `FINISHED <url>`. With an intact transcript the window heals itself. The uncovered case
is a session whose context is rebuilt from a summary (a compaction, or an attended `--resume` after
one). Its ledger is gone, so step 1 finds nothing and step 3 has no input.

*E2: env through resume.* A bg session's env is the env of the **background service** process,
fixed when that service starts. While the service runs, the launcher's shell env is ignored.

| Probe | Launcher env | Service state | Session saw |
|---|---|---|---|
| resume A | `CRAFT_DRIVER_STATE=state-resume` | started by this call | `state-resume` |
| resume B | unset | already up | `state-resume` |
| 2c: fresh `claude --bg` | `=state-z` | already up | `state-resume` |
| unrelated fresh `--bg` session | unset | already up | `state-resume` (contamination) |
| 2d: `claude --bg --settings <f>`, `f` = `{"env":{"CRAFT_DRIVER_STATE":"<dir-w>"}}` | any | up | `<dir-w>`, in hooks and in the Bash tool (wins over the service env) |
| 2e: `claude stop <short-id>`, then `claude --bg --resume <full-id> "<prompt>"` | unset | restarted by the resume | `<dir-w>`: the session woke "with its saved options (`--settings`, …)" |
| E1's supervisor restart | — | up | the var kept |

Side facts: `claude stop` / `attach` take the 8-char short id, and `stop <full-id>` fails with "No job
matching". `--resume <full-id>` on a **live** session forks a copy.

*E3: bg detection.* In a bg session (hook env and Bash tool env), `CLAUDE_JOB_DIR=<home>/.claude/jobs/<short-id>`
and `CLAUDE_CODE_SESSION_ATTENDED=0`. `CLAUDE_CODE_SESSION_KIND` is **not** set (`printenv` exit 1).
In a foreground interactive session `CLAUDE_JOB_DIR` is absent and
`CLAUDE_CODE_SESSION_ATTENDED=1`. A bg session's Write in the shared checkout is refused, with a
message that names `worktree.bgIsolation`. The prior design's E4 line "`CLAUDE_CODE_SESSION_KIND=bg`
marks a background session" (a static read of the bundle) is wrong. It appears only in that dated
design doc, which is a record and is not edited. No living doc, skill, script or test cites it
(grep: zero hits outside `docs/contributing/design/`).

*E4: the lock is not ignored.* `git check-ignore .craft-validation.lock` prints nothing (exit 1). The
lock is written into the **consumer** repo's worktree root, so a `.gitignore` line in craft's own
repo would protect only craft.

*E4': git-path resolution* (re-probed for this doc in a mktemp repo, git 2.56.0):

| Command (`L=craft-validation.lock`) | Output |
|---|---|
| main checkout: `git rev-parse --git-path $L` | `.git/craft-validation.lock`: **relative to the cwd** |
| main checkout: `git rev-parse --path-format=absolute --git-path $L` | `<repo>/.git/craft-validation.lock` |
| linked worktree root or any subdir: same, `-C <wt>` | `<repo>/.git/worktrees/<wt-name>/craft-validation.lock` |
| lock written there | `git status --porcelain` empty in both checkouts; `git add -A` stages nothing |
| `git worktree remove --force <wt>` | the lock is gone with `.git/worktrees/<wt-name>/` |

**Self-hosting.** The running plugin is the main checkout, so this run's skill edits do not reach
the run itself.

## Requirements

- **R1, closed-run rebuild.** A session that rebuilds after `close` (the ledger is gone) never
  guesses. When driven, it writes exactly one status that matches the PR's real state at the VCS
  host: `FINISHED <url>` when merged, `BLOCKED integrate: not merged <pr-or-branch>` otherwise.
  When merged, it re-elects exactly as §Done "Driver hand-off" does, so the status carries
  `next.md`/`next.prompt` whenever a normal run's would.
  It goes through `driver-state.sh`, so an existing `status` is never replaced (exit 4 is surfaced).
  When undriven, it writes nothing and tells the user the run is already closed.
- **R2, `close` idempotence is pinned.** `run-ledger.sh close <id>` on a closed run exits 0 with
  empty stdout and stderr. E1's self-heal depends on this, so a test holds it.
- **R3, the env channel is honest.** `docs/contributing/specs/driver.md` names `--settings` env as the
  channel that reaches a bg session and survives `--resume`. It states that a launcher-shell export
  reaches the session only when that launch starts the background service, and that an export in
  a shell which may start the service leaks into every bg session, driven or not.
- **R4, in-place under `--bg`.** The workspace phase resolves strategy `in-place` with
  `CLAUDE_JOB_DIR` set according to D-3. The text names `worktree.bgIsolation` and says why craft
  cannot read it.
- **R5, the lock is never committable.** No craft step writes the run-lock inside any working tree.
  Writer and teardown resolve the same per-worktree path from the worktree, according to D-4.
  Teardown's dead/live/`--force` semantics and messages are unchanged.
- **R6, BACKLOG follows the house convention.** This branch does not edit `BACKLOG.md`. The four
  entries at `BACKLOG.md:178-201` are ticked `— delivered <date>` with the PR link and the ADR range
  (ADR-631–634) in the orchestrator's post-merge bookkeeping commit, as the entries delivered on
  2026-10-17 are. No new entry is filed.

## Design

### 1. Closed-run rebuild (ADR-631)

**`skills/run/SKILL.md` "Rebuild after compaction", step 1** gains a branch:

> `locate` prints nothing → the run is **closed** (or was discarded with `close`): skip steps 2–6
> and follow **Closed run** below. Never re-`open`.

**New paragraph "Closed run"**, placed after step 6 and before `## Done`:

```
driver="${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/driver-state.sh"
"$driver" active            # exit 1 → undriven: tell the user the run is closed; stop here
# driven: query the PR whose head is <type>/<run-id>, type ∈ {feat, fix, chore} (VCS port)
# merged: run the §Done election from <main-repo-dir>, writing <tmp>/next.{md,prompt}
"$driver" finished <pr-url> --election <tmp>/next.md --prompt <tmp>/next.prompt
"$driver" finished <pr-url>                         # merged, no election, or exit 3 above
"$driver" blocked integrate - <<'REASON'            # open, closed unmerged, or no PR
not merged <pr-or-branch>
REASON
```

- The PR state comes from the VCS host (`gh pr list --head <type>/<run-id> --state all --json url,state`
  under the Claude binding). That is the same "query the PR's state (VCS port)" wording the resume table
  already uses for `propose`/`integrate`. No new port operation, no new state file. The VCS host
  outranks the summary, the same way the ledger outranks it on the normal path.
- Merged → the normal §Done "Driver hand-off" election, unchanged. It reads the backlog from the
  merged default branch, i.e. the main checkout `<main-repo-dir>`, because the worktree was removed
  at `integrate`. `<tmp>` is a fresh `mktemp -d` outside every working tree. Then
  `finished <pr-url> --election <tmp>/next.md --prompt <tmp>/next.prompt`. No election (`source:
  custom`, no `backlog:` key, or no eligible entry) → `finished <pr-url>` alone. Exit 3 (the prompt
  still reads as `--policy`) → `finished <pr-url>` alone, and the final message says the election
  was withheld and why, as §Done. The paragraph points at §Done's Election rules; it does not
  restate them.
- Exactly one merged PR across the three heads → `finished`. None merged (open, closed unmerged,
  or no PR) → `blocked integrate`. More than one merged → blocker `{ rebuild, reason, ≤3 options }`,
  never a guess. Exit 4 (E1's transcript-intact path already wrote the status) or any other
  non-zero exit is surfaced, never a blocker. This mirrors §Done.
- The status write is still the last tool call (ADR-624 unchanged).

**`skills/run/SKILL.md` §Done**, in the `close` paragraph, gets one added sentence: `close` on an
already-closed run is a silent exit 0, so a supervisor-restarted session that re-runs it (E1) loses
nothing. **`docs/contributing/specs/run-record.md`** ("Write cadence and the single-writer rule", item 3 "`close`, at `Done`") gets the same sentence.

### 2. Env channel: `docs/contributing/specs/driver.md` (decided)

§Activation is rewritten as follows. ADR-620 ("env only, no craft flag") still holds, because the
channel is still env. ADR-634 refines its consequence line "re-set it on `--resume`":

- Pass the variable as **`claude --bg --settings <file>`**, with `<file>` =
  `{"env":{"CRAFT_DRIVER_STATE":"<abs-dir>"}}`. It reaches hooks and the Bash tool, wins over the
  service env, and is restored on `--resume` from the session's saved options (E2 2d/2e). Keep the
  file in place until the entry ends. Whether a resume re-reads the file or uses a saved copy is not
  pinned.
- **Never export `CRAFT_DRIVER_STATE` in a shell that may start the background service.** A bg
  session's env is the service's env, fixed at service start. An export there leaks into every
  later bg session, driven or not, until the service restarts (E2 rows 2–4). A plain launcher
  export reaches the session only when that launch starts the service.
- Drop the old sentence "Only the launch path was probed …".

§Background sessions gains:

- Driver-side session handling: `claude stop`/`attach` take the 8-char short id
  (`basename "$CLAUDE_JOB_DIR"`). Resume only a stopped session, because `--resume <full-id>` on a
  live one forks a copy.
- A bg session is recognised by `CLAUDE_JOB_DIR` being set. `CLAUDE_CODE_SESSION_KIND` is not set
  (E3).
- One line on the in-place outcome from §3 below.

### 3. In-place under `--bg`: `skills/workspace/SKILL.md` step 2 (ADR-632)

The "Strategy `in-place`" sentence becomes:

> Strategy `in-place` … **In a Claude Code background session (`CLAUDE_JOB_DIR` set) → STOP before
> `git switch`**: the session's edit guard refuses Write/Edit in the shared checkout until the
> session isolates, so an in-place run cannot edit. Reason: `in-place strategy cannot run in a
> background session; use strategy worktree, run attended, or set worktree.bgIsolation: none in
> the repo's Claude settings`. Craft does not read that setting: it merges across the user, project,
> local, managed and `--settings` layers, so the session's effective value is not observable from
> the run.

- The STOP happens before any repo mutation (`git switch -c`), so nothing needs undoing.
- When driven, the **Driven stop** invariant writes `BLOCKED workspace: <reason>` as the last tool
  call. Its list of stops names "the workspace collision STOP" explicitly, so it gains "the
  workspace in-place background STOP". The edit is prose only; the mechanism is unchanged.
- The check is `[ -n "${CLAUDE_JOB_DIR:-}" ]` in the Bash call that would run `git switch`. Other
  bindings never set the variable, so they are unaffected.
- The trailing "later phases use the checkout root … (run-lock location included)" becomes
  "(the run-lock resolves from it, §4)".

### 4. Run-lock location (ADR-633)

The lock moves from `<root>/.craft-validation.lock` to the **per-worktree git dir**, resolved from the
worktree root:

```bash
lock="$(git -c safe.bareRepository=explicit -C <abs-root> rev-parse --path-format=absolute --git-path craft-validation.lock)"
```

`--path-format=absolute` is mandatory: without it, the main-checkout answer is cwd-relative (E4').
`safe.bareRepository=explicit` copies `run-ledger.sh`'s resolver hardening. The file name drops the
leading dot, because it no longer lives in a working tree. The content (`<pid> <iso-timestamp>`) is
unchanged.

| Site | Change |
|---|---|
| `skills/validation/SKILL.md:132` | "write the run-lock at the path `git … --git-path craft-validation.lock` prints from `<root>`, in the same background Bash call (a shell variable does not survive between calls); clear it at that path when the run lands" |
| `scripts/worktree-teardown.sh:4,25` | header comment updated. `LOCK=` resolves as above from `$WT` **before** any removal. A resolution failure → `craft-teardown: cannot resolve the run-lock path from <wt>` on stderr, exit 2, nothing removed. The rest is untouched. |
| `docs/contributing/specs/vcs.md:46,55` | `teardown` bullet and "Teardown lock protocol" name the git-path lock and say why: never committable, removed with the worktree |
| `skills/workspace/SKILL.md` step 2 | the in-place parenthesis, see §3 |
| `skills/integrate/SKILL.md:35` | none: it says "validation run-lock", with no path |

Edge behaviour:

| Case | Behaviour |
|---|---|
| linked worktree, live lock | refused, exit 3, lock intact (unchanged) |
| linked worktree, dead lock / `--force` | lock removed, then `git worktree remove --force` deletes `.git/worktrees/<name>/` anyway |
| in-place (`WT` = `MAIN`), dead lock | auto-cleared from `<repo>/.git/craft-validation.lock`; the checkout is never removed (realpath guard unchanged) |
| `WT` not a git worktree | exit 2 before any removal. Today the script dies later at `rev-parse --abbrev-ref` under `set -e` |
| a pre-change `<root>/.craft-validation.lock` left from an older run | not read (clean move, the ADR-153 posture). A linked worktree's copy goes with `worktree remove`. An in-place copy stays untracked, as it already does today |
| teardown invoked from any cwd | resolution uses `-C "$WT"`, never the cwd |

### 5. BACKLOG

This branch does not edit `BACKLOG.md`. The four entries under "Open (scoped 2026-10-17 —
follow-ups surfaced by the driver-contract-in-craft-run run …)" stay in place. After the merge, the
orchestrator's bookkeeping commit on the default branch ticks each one in the house form:
`**<title> — delivered <date>**` followed by `([PR #<n>](<url>), ADR-631–634: <one-line outcome>)`,
as the entries delivered on 2026-10-17 are.

### 6. Review amendments (supersede §1, §3 and the D-3 row where they differ)

- **§1, PR match.** The head name alone can match another run's PR. A reused slug leaves an earlier
  merged PR on `<type>/<run-id>`, and the VCS host's head filter also matches forks. The rebuild
  therefore lists every same-repository PR, in any state, on the three heads. Exactly one PR, merged,
  means `finished`. No PR, or exactly one that is not merged, means `blocked integrate` with
  `not merged <pr-or-branch>`. More than one PR means `blocked integrate` with
  `ambiguous PR history <branch>`, never `finished`. This replaces the "more than one merged →
  blocker" rule. An empty `locate` also covers a run that was never opened.
- **§3, ways out.** The STOP reason names only the ways out that clear it: strategy `worktree`, or
  running attended. `worktree.bgIsolation: none` does not clear it, because the check reads
  `CLAUDE_JOB_DIR` and never the setting.

### Files touched

| File | Change |
|---|---|
| `skills/run/SKILL.md` | Rebuild step 1 branch + "Closed run" paragraph; §Done `close` idempotence sentence; Driven stop bullet names the in-place background STOP |
| `skills/workspace/SKILL.md` | step 2 in-place bg STOP + run-lock parenthesis |
| `skills/validation/SKILL.md` | run-lock bullet (`:132`) |
| `scripts/worktree-teardown.sh` | lock resolution + exit 2 on failure + header comment |
| `docs/contributing/specs/driver.md` | §Activation rewrite; §Background sessions additions |
| `docs/contributing/specs/vcs.md` | `teardown` bullet + Teardown lock protocol |
| `docs/contributing/specs/run-record.md` | `close` idempotence sentence |
| `test/worktree.test.js` | lock fixtures move to the git path; new cases (Test strategy) |
| `test/run-ledger.test.js` | `close` idempotence |
| `test/driver-contract.test.js` | prose pins for closed-run rebuild, in-place STOP, driver spec channel |
| `BACKLOG.md` | none on this branch: the four entries are ticked in the post-merge bookkeeping commit (§5) |
| `docs/guides/*` | none: grep finds no mention of the lock, `in-place`, `--bg` or the driver var |
| `skills/integrate/SKILL.md` | none (no path named) |

**ADR impact (decisions phase).** ADR-631 (D-1, closed-run rebuild keyed on the PR state, with
re-election) refines ADR-624. ADR-632 (D-3, in-place refused in a background session) is new.
ADR-633 (D-4, validation lock in the per-worktree git dir) refines ADR-153 (lock name and location)
and, through it, ADR-036. ADR-634 (the driver env travels through `--settings`, adopted with no user
judgment) refines ADR-620. No ADR is superseded. ADR-624 and ADR-629 hold unchanged.

### Parts (pre-chewed)

**Part 1, run-lock move** (script + tests first, the only behavioural part).
- `scripts/worktree-teardown.sh`: replace `LOCK="$WT/.craft-validation.lock"` (line 25) with a
  `resolve_lock` function (≤10 lines, named constant `readonly LOCK_NAME='craft-validation.lock'`).
  Its failure → `echo … >&2; exit 2`. Update header lines 4–5.
- `test/worktree.test.js`: add helper `lockPathOf(wt)` = `execFileSync('git', ['-C', wt, 'rev-parse',
  '--path-format=absolute', '--git-path', 'craft-validation.lock'])`, trimmed. The four existing
  fixtures (`:194,220,254,307`) write through it. Existing helpers to reuse: `setup()`, `teardown()`,
  `runCmd`, `branchExists`, `mkWorktreeNoRemote`; the realpath test's in-place repo shape (`:325-`).
- Prose: `skills/validation/SKILL.md:132`, `docs/contributing/specs/vcs.md:46,55`,
  `skills/workspace/SKILL.md` step 2 parenthesis.

**Part 2, closed-run rebuild + `close` pin.**
- `skills/run/SKILL.md`: step 1 of "Rebuild after compaction", new "Closed run" paragraph before
  `## Done` (its merged branch points at "Driver hand-off" and "Election (driven runs only)" in
  §Done), and the `close` paragraph in §Done.
- `docs/contributing/specs/run-record.md` "Write cadence and the single-writer rule" item 3.
- `test/run-ledger.test.js`: reuse `withRun`, `runLedger`, `pointerOf`; place it beside the existing
  "Given an open run, when close demo runs" test.
- `test/driver-contract.test.js`: reuse `REBUILD_START`, `DONE_HEADING`, `sliceProse`, `TO_END`, and add
  `CLOSED_RUN_START = /^\*\*Closed run\.\*\*/`.

**Part 3, in-place bg STOP + driver spec.**
- `skills/workspace/SKILL.md` step 2; `skills/run/SKILL.md` Driven stop bullet (cross-phase invariants);
  `docs/contributing/specs/driver.md` §Activation and §Background sessions.
- `test/driver-contract.test.js`: new `WORKSPACE_STEP_2 = /^2\. \*\*Consult `isolate` action\*\*/`
  sliced to `/^3\. /`. The existing spec test's phrase list keeps `--resume`, which still appears.

## Decision candidates

All three rows are resolved. The env channel, decided without a user choice, is ADR-634 (adopted).

| # | Choice | Alternatives (≤3) | Recommendation | Why | Resolution |
|---|---|---|---|---|---|
| D-1 | How a rebuilt session detects "ledger closed, no status" | (a) **Rebuild branch keyed on the PR state through the VCS port**: `locate` prints nothing → query the PR for `<type>/<run-id>`; merged → `finished <url>`, else `blocked integrate`; no new state. (b) A closed-run marker in the git common dir (`craft-runs/<run-id>.closed` holding the PR url + outcome), written by `close` and read by the rebuild. (c) Reorder §Done: write the status (an intent) **before** `close`. | (a) | `close` is already idempotent (E1) and a status is never overwritten (ADR-629), so (a) is safe to repeat. The VCS host is the authority on "merged", the same source the driver checks. (b) adds a file that only the status write could remove. But the status write is the last tool call, so the marker would outlive every run, and ADR-450's "open until close" semantics would need a third state. (c) supersedes ADR-624 and opens the reverse window: the driver sees `FINISHED` and starts the next entry while this one still holds an open ledger. | Resolved: ADR-631 (a), re-elect |
| D-3 | `strategy: in-place` in a `claude --bg` session | (a) **Refuse: STOP at workspace step 2 before `git switch` when `CLAUDE_JOB_DIR` is set**. The reason names strategy `worktree`, attended runs and `worktree.bgIsolation`; driven runs get `BLOCKED workspace: …`. (b) Document the limit only and let the guard refuse the first Write. (c) Fall back to strategy `worktree` in a bg session, with a recorded note. | (a) | E3 gives a reliable signal. Failing before any mutation beats failing mid-implementation with a switched branch and a half-run pipeline, which is what (b) gives. Cost: a repo that set `bgIsolation: none` is refused too, because craft cannot observe the merged setting. The reason names the way out (run attended or use `worktree`). (c) silently overrides a manifest choice and produces a worktree the user did not ask for. | Resolved: ADR-632 (a), refuse |
| D-4 | Where the run-lock lives | (a) **The per-worktree git dir**: `git -C <root> rev-parse --path-format=absolute --git-path craft-validation.lock`, resolved the same way by writer and teardown. (b) Keep `<root>/.craft-validation.lock` and add a `.gitignore` entry (craft's repo only, or written into the consumer's `.gitignore` at workspace). (c) The git common dir beside the ledger (`craft-runs/<run-id>.validation.lock`). | (a) | Never committable in any consumer repo, invisible to `git status` (E4'), and removed with the worktree, with no cleanup code. (b) protects only craft itself, or makes craft edit the consumer's `.gitignore`, a committed file and a diff in every PR. (c) is shared by all worktrees, so the lock would need the run-id threaded into teardown's argv, a signature change at `skills/integrate/SKILL.md:32`. | Resolved: ADR-633 (a), per-worktree git dir |

## Test strategy

London School where there is a seam. The surfaces here are a bash script and prose, so the suites
spawn the script in mktemp repos (`test/worktree.test.js` `setup()`) and slice prose regions
(`test/helpers/region-slice.js`). Given/When/Then titles, AAA bodies, and a `sut` variable for the
spawned script or the sliced region.

| Behaviour | Suite | Test (Given / When / Then) |
|---|---|---|
| live lock refuses (moved) | `test/worktree.test.js` | Given a live-PID lock at the worktree's git-path lock, when teardown runs without --force, then exit 3, REFUSED, lock intact |
| `--force` (moved) | same | Given a live-PID git-path lock, when teardown runs with --force, then exit 0, FORCED, the lock and worktree are gone |
| stale (moved) | same | Given a dead-PID git-path lock, when teardown runs, then stale lock auto-cleared, worktree and branch removed |
| `-1` PID guard (moved) | same | Given a git-path lock holding PID -1, when teardown runs, then it is stale, not live |
| old location ignored | same | Given a live-PID `.craft-validation.lock` at the worktree root only, when teardown runs, then exit 0 and the worktree is removed (the old path is not a lock) |
| in-place lock | same | Given WT = MAIN and a live-PID lock at `<repo>/.git/craft-validation.lock`, when teardown runs, then exit 3 and the main checkout is intact |
| resolution failure | same | Given a WT path that is not a git worktree, when teardown runs, then exit 2, "cannot resolve the run-lock path", nothing removed |
| cwd independence | same | (implicit in every case above: the suite spawns from the craft repo, whose own `.git` differs from the fixture's) |
| lock never staged | same | Given a lock at the git-path in a linked worktree, when `git add -A` runs there, then `git status --porcelain` is empty |
| lock prose | `test/worktree.test.js` (prose block) | Given the validation skill's run-lock bullet and the vcs spec's lock protocol, when read, then both name `--git-path craft-validation.lock` and neither names `<root>/.craft-validation.lock` |
| `close` idempotent | `test/run-ledger.test.js` | Given a closed run, when close runs again, then exit 0 with empty stdout and stderr |
| closed-run branch | `test/driver-contract.test.js` | Given the Rebuild section, when step 1 is read, then a `locate` that prints nothing routes to Closed run and never re-opens |
| closed-run writes | same | Given the Closed run paragraph, when read, then it names `driver-state.sh` `active`, `finished <pr-url>`, `blocked integrate`, `not merged <pr-or-branch>`, the VCS port, a pointer to §Done's election, `--election`/`--prompt`, and `finished <pr-url>` alone on no election or exit 3 |
| `close` sentence | same (Done region) | Given §Done, when read, then `close` on an already-closed run is named a silent exit 0. The existing order pins (`close` < hand-off < `finished`) stay green |
| in-place STOP | same | Given workspace step 2, when read, then it names `CLAUDE_JOB_DIR`, STOP before `git switch`, `worktree.bgIsolation`, and why craft cannot read it |
| driven in-place STOP | same (reuses `DRIVEN_STOP_START`/`POLICY_CONSULT`) | Given the Driven stop bullet, when read, then it lists the workspace in-place background STOP |
| env channel | same (driver spec) | Given the driver spec §Activation, when read, then it names `--settings`, `"env"`, the never-export warning, and no longer claims the launcher var reaches a resumed session |
| bg facts | same | Given §Background sessions, when read, then it names the short id for `stop`/`attach`, the live-resume fork, and `CLAUDE_JOB_DIR` |

- **Unchanged pins that must stay green:** `test/run-record.test.js` §Done and Rebuild pins
  (`:117-204`); `test/driver-contract.test.js` existing tests (hand-off order, spec grammar, the
  `--resume` phrase).
- **Gate:** `bash scripts/ci.sh`; `bash scripts/design-lint.sh` on this doc.
- **Live evidence:** E1–E3 are already pinned (2026-10-18). No new session probe is required for
  this change. A re-probe after a CLI upgrade is the maintainer's call and is not CI-gated.

## Out of scope

- **Craft-side defence against a contaminated service env** (an undriven bg session that sees a
  leaked `CRAFT_DRIVER_STATE`): craft cannot tell a leaked value from a real one. The spec warning
  and `--settings` are the fix, and the status never-overwrite rule limits the damage.
- **Reading `worktree.bgIsolation` or `CLAUDE_BG_ISOLATION`:** the merged settings are not
  observable, and the env knob is a static, unproven read.
- **Editing the prior design doc's `CLAUDE_CODE_SESSION_KIND` line:** design docs are dated
  records, and the correction is recorded here (E3).
- **A `.gitignore` entry for the old lock name:** after the move no craft step writes it.
