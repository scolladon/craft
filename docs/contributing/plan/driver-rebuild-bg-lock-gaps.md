# Plan — driver-rebuild-bg-lock-gaps

> Source: design doc `docs/contributing/design/driver-rebuild-bg-lock-gaps.md` · ADRs `631, 632, 633, 634`
> (all four take the design's recommended option: a closed run is rebuilt from the PR state at
> the VCS host, then re-elects and writes one status (631); strategy `in-place` STOPs at
> workspace step 2 before `git switch` when `CLAUDE_JOB_DIR` is set (632); the validation
> run-lock lives at `git -C <root> rev-parse --path-format=absolute --git-path
> craft-validation.lock`, resolved the same way by writer and teardown (633); the driver passes
> `CRAFT_DRIVER_STATE` through `claude --bg --settings <file>` env, never a launcher export (634))
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: tests fold into the part
  whose code they exercise. EXCEPTION: test-infra-only and docs-only parts with no `src/`
  delta ARE standalone.
- A part should land in ~100 tool calls. More than ~5 RED→GREEN cycles, or more than 6
  files in its `### Context` block, is two parts. What counts is a backticked path:
  backtick the files the part CREATES or EDITS, and write read-only reference paths in
  plain text.

## Plan shape (3 parts)

| # | Part | Size class | src delta | Files |
|---|---|---|---|---|
| 1 | Run-lock moves to the per-worktree git dir | io-shell + docs-prose | scripts/worktree-teardown.sh | 1 script + 1 suite + 2 prose |
| 2 | Closed-run rebuild + `close` idempotence pin | docs-prose | none | 2 prose + 3 suites |
| 3 | In-place refused under `--bg` + driver spec env channel | docs-prose | none | 3 prose + 1 suite |

The design's "Parts (pre-chewed)" partition is kept with one move: the workspace step 2
run-lock parenthesis goes from Part 1 to Part 3, because Part 3 rewrites that same sentence
for the in-place STOP. Two parts editing one sentence would conflict for no gain.
Part 1 keeps the only behavioural change (the shell script) small and test-first.

Parts run in order on one working tree. Parts 2 and 3 both append to
test/driver-contract.test.js, and both edit skills/run/SKILL.md (Part 2: the Rebuild and Done
sections, Part 3: the Driven stop bullet). Their regions do not overlap.

### Cross-part traps (pre-paid; every part agent reads this)

- **Source hygiene** (test/source-hygiene.test.js). It scans skills/, docs/contributing/specs/
  and README for `\bgh\b` and `\bgithub\b`. The design's Closed-run sketch says
  `gh pr list --head …`: do NOT copy it. Write "through the VCS port" / "the VCS host" only.
  It also scans scripts/ (whole line), test titles and test comments for provenance tokens:
  `ADR-?\d+`, `P\d+`, `Part \d+`, `DC-\d+`, `backlog #\d+`, and case-sensitive `R\d+`/`T\d+`/`F\d+`
  in shipped code. Never write "ADR-633", "E4", "D-4", "R5" or "§4" in the script, its comments,
  test titles or test comments. Skill and spec prose must not add design or ADR references either.
- **Test titles are printable ASCII.** The existing suite has `§` in some titles, but new titles
  must not: no `§`, `≤`, `→`, `—`, curly quotes. Write "section 0", "at most 3", "->" if needed.
  Assertion *phrases* (string literals in the body) may hold non-ASCII text copied from the prose.
- **Test shape.** Given/When/Then titles, AAA bodies with a blank line between the phases,
  `const sut = …` for the spawned script call or the sliced prose region. CommonJS
  (`'use strict'; const { test } = require('node:test'); …`), like every test/ suite.
- **shellcheck** runs over scripts/*.sh inside ci.sh (scripts/static-lints.sh). Quote every
  expansion; `local` inside functions.
- **stub-lint and prose-lint** run over files touched on the branch. Prose-lint covers touched
  skills/ (not specs, plans, ADRs): avoid `delve`, `leverage`, `seamless`, `robust`.
- **Shim count.** test/craft-root-shim.test.js `TARGET_FILES` pins the number of
  `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/` occurrences per skill. Today: run 12, workspace 2,
  validation 4. Part 2 adds exactly one in the run skill (12 → 13). Parts 1 and 3 add none.
- **Existing pins that must stay green** (read-only):
  test/run-record.test.js — Rebuild pins (`locate --run`, `RESOLVE:`, `run-state.js`, section
  order Review cadence < Rebuild < Done) and the workspace step 2 test at :359-374, which takes
  the FIRST fenced block in step 2 as the worktree block (never add a fenced block to step 2;
  inline code only). test/driver-contract.test.js — Rebuild contains `` `driver-state.sh active` ``;
  Driven stop names `workspace collision`; the §Done order `run-ledger.sh close` < `Driver
  hand-off` < `"$driver" finished`; the whole driver spec contains `--resume`,
  `CRAFT_DRIVER_STATE`, `PermissionRequest`, `blocked <phase-id> -`.
  test/plugin-structure.test.js:166-177 — the architecture skill names no run-lock.
- **No public surface.** No new exported symbol, barrel entry, bin or CLI verb. The only
  interface change is worktree-teardown.sh's new exit 2 on an unresolvable lock path (same code
  it already uses for a bad argument), documented in docs/contributing/specs/vcs.md in Part 1.
- **README count.** The planning commit bumps README.md:200 to 77 parted plans. No part adds a
  design, plan or ADR.
- **BACKLOG.md is not edited on this branch.** The four entries are ticked in the post-merge
  bookkeeping commit.
- **Self-hosting.** The running plugin is the main checkout: skill edits here do not change this
  run's own behaviour. Nothing to probe live.
- **Git verbs.** Use `/usr/bin/git` (an rtk rewrite of `git add/commit` is refused by the
  worktree guard). Scripted diffs pass `--no-ext-diff`.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| PDC-1 | What teardown prints when the lock path cannot be resolved (design fixes the craft line and exit 2, not git's own stderr) | (a) **Let git's `fatal: …` line through on stderr, then print `craft-teardown: cannot resolve the run-lock path from <wt>`**, exit 2. (b) Silence git (`2>/dev/null`) and print only the craft line. | (a) | The house rule is no swallowed errors: git's line says *why* (no such directory, not a repository), the craft line says *what* failed. Tests assert only the craft line and the exit code, so flipping to (b) is a one-token change in Part 1. |

## Part 1 — Run-lock moves to the per-worktree git dir

### Context

Edits `scripts/worktree-teardown.sh`, `test/worktree.test.js`, `skills/validation/SKILL.md`,
`docs/contributing/specs/vcs.md`.

**Script today** (68 lines, `set -euo pipefail`):
- :2-9 header comment. :4-5 say "the validation phase writes <root>/.craft-validation.lock
  containing "<pid> <iso-timestamp>" …". Rewrite :4-5 to: the validation phase writes the
  run-lock in the worktree's own git dir, at the path
  `git -C <root> rev-parse --path-format=absolute --git-path craft-validation.lock` prints, so
  no commit can carry it and `git worktree remove` deletes it with the worktree. Keep :6-7
  (dead PID auto-clears, live PID needs --force). Add one line: an unresolvable path exits 2,
  nothing removed.
- :12-23 argument parsing (`MAIN`, `WT`, `PRE`, `FORCE`; unknown arg → exit 2).
- :25 `LOCK="$WT/.craft-validation.lock"` — the one line that changes.
- :26-42 dead/live/--force branch on `$LOCK`: unchanged, messages unchanged.
- :44 `BRANCH=$(git -C "$WT" rev-parse --abbrev-ref HEAD)` — today this is where a non-git WT
  dies (exit 128 under `set -e`).
- :57-64 realpath guard (never removes MAIN when WT is the same checkout); :65-68 branch delete.

**Target shape** (≤10 new lines; named constant, no magic string):
```bash
readonly LOCK_NAME='craft-validation.lock'

# Absolute even from the main checkout, where a bare --git-path answer is cwd-relative.
resolve_lock() {
  git -c safe.bareRepository=explicit -C "$1" rev-parse --path-format=absolute --git-path "$LOCK_NAME"
}

LOCK="$(resolve_lock "$WT")" || { echo "craft-teardown: cannot resolve the run-lock path from $WT" >&2; exit 2; }
```
Place `readonly LOCK_NAME` and `resolve_lock` after the arg loop (:23) and before the lock
block. `-C "$WT"` makes the result independent of the caller's cwd. git's own `fatal:` line is
left on stderr (PDC-1 (a)).

Probed in a throwaway repo (git 2.56.0, macOS): main checkout →
`<repo>/.git/craft-validation.lock`; linked worktree → `<repo>/.git/worktrees/<wt-name>/craft-validation.lock`;
a missing dir or a non-git dir → exit 128 with `fatal: …` on stderr. On macOS the printed path
is the realpath (`/private/var/…`); `fs` calls accept either spelling, so compare by
`fs.existsSync`, never by string equality with a `/var/…` path.

**Suite today** (test/worktree.test.js, 349 lines). Helpers to reuse, all in-file:
`runCmd(cmd, args, opts)` → `{ status, output }` (stdout+stderr merged on failure, stdout only
on success); `git(args, opts)` (adds unsigned-commit config; returns NOTHING — use
`execFileSync('git', [...], { encoding: 'utf8' })` when you need output); `mkWorktreeNoRemote`,
`branchExists(repoDir, ref)`, `setup()` → `{ repo, wt }` (repo with origin remote + linked
worktree on `craft-test-branch`), `teardown({ repo, wt })`, `SCRIPTS_DIR`. Lock tests:
- :188-208 live lock, no --force (lockPath at :194)
- :214-238 live lock, --force (:220)
- :244-268 stale lock (:254)
- :302-318 PID `-1` (:307)
- :324-349 realpath guard: the in-place repo shape (`git init`, two config lines, empty
  commit, `branch -M main`) to copy for the in-place case.

Add next to `branchExists`:
```js
const LOCK_NAME = 'craft-validation.lock';

function lockPathOf(worktree) {
  return execFileSync('git', ['-C', worktree, 'rev-parse', '--path-format=absolute', '--git-path', LOCK_NAME], { encoding: 'utf8' }).trim();
}
```
and a `liveLockLine()` helper (`${process.pid} ${iso-without-millis}\n`) if it removes the
duplicated timestamp line; keep it in-file.

**Prose sites.**
- skills/validation/SKILL.md :128-134, the `run-style: background` bullet. Replace
  "write the run-lock (`<root>/.craft-validation.lock` ← `<pid> <iso-timestamp>`); clear the
  lock when the run lands." with: write the run-lock (`<pid> <iso-timestamp>`) at the path
  `git -c safe.bareRepository=explicit -C <root> rev-parse --path-format=absolute --git-path craft-validation.lock`
  prints, in the same background Bash call (a shell variable does not survive between calls);
  it sits in the worktree's own git dir, so no commit can carry it; clear it at that path when
  the run lands. Keep the rest of the bullet (the `HARNESS-BG` paragraph at :136 says `<pid>` is
  "the same pid written to the run-lock": unchanged).
- docs/contributing/specs/vcs.md :45-47, `teardown` bullet: "refuses while
  `.craft-validation.lock` holds a live PID" → "refuses while the run-lock (see Teardown lock
  protocol) holds a live PID; exits 2, removing nothing, when the lock path cannot be resolved".
- docs/contributing/specs/vcs.md :53-63, `## Teardown lock protocol`: first paragraph names the
  path command above (`--git-path craft-validation.lock`, `--path-format=absolute` mandatory
  because the main checkout's answer is otherwise cwd-relative), says the file lives in the
  per-worktree git dir — so it is never committable and `git worktree remove` deletes it — and
  that `worktree-teardown.sh` resolves the same path from the worktree before removing anything.
  The three Dead/Live/--force bullets stay. Add a fourth: **Unresolvable path** → exit 2, nothing
  removed. A pre-change in-tree lock file is not read (one sentence).
- Neither prose site may keep the string `.craft-validation.lock`.
- skills/integrate/SKILL.md:35 says "validation run-lock" with no path: untouched.
  skills/workspace/SKILL.md step 2's parenthesis is Part 3's edit, not this part's.

### TDD steps

1. RED — test/worktree.test.js: add `LOCK_NAME` + `lockPathOf`, and retarget the four existing
   lock fixtures (:194, :220, :254, :307) to `lockPathOf(dirs.wt)`. Retitle them:
   - "Given a live-PID lock at the worktree git-path lock, when teardown runs without --force, then it exits 3, reports REFUSED and leaves the lock intact"
   - "Given a live-PID lock at the worktree git-path lock, when teardown runs with --force, then it exits 0, reports FORCED, and removes the lock and the worktree"
   - "Given a dead-PID lock at the worktree git-path lock, when teardown runs, then it reports stale lock auto-cleared and removes the worktree and branch"
   - "Given a git-path lock whose PID is -1 (kill -0 -1 signals a process group), when teardown runs, then the numeric guard treats it as stale, not live"

   Add two new tests in the same step:
   - "Given a live-PID lock only at the old in-tree path, when teardown runs, then it exits 0 and removes the worktree" — `setup()`, write the live line to `path.join(dirs.wt, '.craft-validation.lock')`; assert status 0, no `REFUSED`, `!fs.existsSync(dirs.wt)`.
   - "Given an in-place checkout with a live-PID lock in its git dir, when teardown runs with WT equal to MAIN, then it exits 3, reports REFUSED and keeps the checkout and the lock" — repo shape from :324-339, lock at `lockPathOf(repo)`; run `worktree-teardown.sh repo repo`; assert status 3, `REFUSED`, repo and lock exist.

   Fails today: the script reads `$WT/.craft-validation.lock`, so the four retargeted tests see
   no lock (live → exit 0 not 3; --force → no `FORCED` line; stale and -1 → no `stale lock`
   line); the old-path test gets exit 3 (`REFUSED`) instead of 0; the in-place test gets exit 0
   instead of 3.
2. GREEN — add `LOCK_NAME` and `resolve_lock`; line :25 becomes
   `LOCK="$(resolve_lock "$WT")"` (no failure branch yet); update header :4-5.
3. RED — "Given a worktree path that is not a git worktree, when teardown runs, then it exits 2, reports it cannot resolve the run-lock path, and removes nothing" — `setup()` for a valid MAIN, plus a non-git `fs.mkdtempSync(path.join(os.tmpdir(), 'craft-not-git-'))` as WT (clean it in `finally`); assert status 2, output includes `cannot resolve the run-lock path`, the non-git dir and `dirs.wt` both still exist, `branchExists(dirs.repo, 'refs/heads/craft-test-branch')`. Fails after step 2: `set -e` aborts on the failed command substitution with git's exit 128, and no craft line is printed.
4. GREEN — append `|| { echo "craft-teardown: cannot resolve the run-lock path from $WT" >&2; exit 2; }` to the `LOCK=` line.
5. GUARD — "Given a lock at the git-path in a linked worktree, when git add -A runs there, then git status --porcelain is empty" — `setup()`, write the lock via `lockPathOf(dirs.wt)`, run `git add -A` then `git status --porcelain` in `dirs.wt` with `execFileSync`; assert `''`. Passes already: it pins git's own behaviour (the git dir is never in the index), the property the move relies on.
6. RED — prose block at the end of the suite (add `const { sliceProse } = require('./helpers/region-slice');` and read both files with `fs.readFileSync(path.join(__dirname, '..', …), 'utf8')`):
   - "Given the validation skill background run bullet, when read, then the run-lock is written at the git-path lock and never in the working tree" — region `/^\s+- \*\*`run-style: background`\*\*/` → `/^\s+The backgrounded command's first statement/`; includes `--git-path craft-validation.lock` and `--path-format=absolute`; `!includes('.craft-validation.lock')`.
   - "Given the vcs spec teardown bullet and lock protocol, when read, then the protocol names the git-path lock and the exit 2 case and neither names the in-tree lock" — regions `/^- `teardown\(workspacePath\)/` → `/^## Teardown lock protocol/` and `/^## Teardown lock protocol/` → `/^## /`; the protocol region includes `--git-path craft-validation.lock`, `--path-format=absolute`, `exit 2` (case as you write it — match it) and `git worktree remove`; neither region includes `.craft-validation.lock`.
   Fails: both prose sites still name `.craft-validation.lock` and lack `--git-path`.
7. GREEN — rewrite the validation bullet and the two vcs.md sites.
8. REFACTOR — fold the repeated `new Date().toISOString().replace(/\.\d+Z$/, 'Z')` lines into `liveLockLine()` if three or more tests now carry it; keep the script at one function + one constant.

### Gate

`bash scripts/ci.sh > <tmp>/ci.log 2>&1; echo $?` then grep the log for `# fail`, `not ok`,
`ci:`, `SC[0-9]`. Inner loop: `node --test test/worktree.test.js test/plugin-structure.test.js`
and `shellcheck scripts/worktree-teardown.sh`.

### Commit

`fix(teardown): resolve the validation run-lock in the per-worktree git dir`

## Part 2 — Closed-run rebuild and close idempotence pin

### Context

Edits `skills/run/SKILL.md`, `docs/contributing/specs/run-record.md`,
`test/run-ledger.test.js`, `test/driver-contract.test.js`, `test/craft-root-shim.test.js`.

**Ledger facts (read-only, scripts/run-ledger.sh).** `cmd_close` (:265-270) is
`rm -f <pointer> <ledger>` after resolving the git common dir: closing a closed run is a silent
exit 0 today. `locate --run <run-id>` prints nothing, exit 0, when the pointer or ledger is
gone. Both behaviours already hold: the tests below are GUARDs that pin them, not REDs.

**test/run-ledger.test.js helpers** (from test/helpers/craft-run.js and in-file):
`withRun(options, act)` → `run` with `run.main`, `run.ledgerPath`, `run.cleanup`;
`runLedger(cwd, args, input)` → `{ status, stdout, stderr }`; `pointerOf(main, runId)`,
`ledgerOf(main, runId)`. Place the new tests right after
"Given an open run, when close demo runs, then the pointer and the ledger are removed and other runs are kept" (:855-867).

**skills/run/SKILL.md anchors** (line numbers at branch tip):
1. `## Rebuild after compaction` (:545). Step 1 (:550-553) ends "…the summary keeps verbatim."
   Append to step 1:
   ```
      When `locate` prints nothing, the run is **closed**: `close` already ran and removed the
      ledger. Skip steps 2–6 and follow **Closed run** below. Never re-`open` the run.
   ```
2. After step 6 (:581 "6. **Walk from `next`.**") and before `## Done` (:584), insert a new
   paragraph starting at column 0 with `**Closed run.**`:
   ````
   **Closed run.** The ledger is gone, so the summary is all that is left; never guess the
   outcome from it. Run `driver-state.sh active`. Exit 1 (undriven): tell the user the run is
   already closed and stop, writing nothing. Driven (exit 0): query the state of the PR whose
   head is `<type>/<run-id>`, for `<type>` in `feat`, `fix`, `chore`, through the VCS port, as
   the resume table does for `propose`/`integrate`. The VCS host outranks the summary, as the
   ledger does on the normal path.
   - **Exactly one merged PR** — run the election of §Done's **Driver hand-off** (rules in
     **Election (driven runs only)**) from `<main-repo-dir>`, since the worktree went at
     `integrate`: write `next.md` and `next.prompt` in a fresh `mktemp -d` dir outside every
     working tree, then call `finished <pr-url>` with both. No election, or exit 3 → `finished
     <pr-url>` alone; on exit 3 the final message says the election was withheld and why.
   - **None merged** (open, closed unmerged, or no PR) → `blocked integrate -` with
     `not merged <pr-or-branch>` on stdin.
   - **More than one merged** → blocker `{ rebuild, reason, ≤3 options }`, never a guess.

   ```
   driver="${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/driver-state.sh"
   "$driver" active
   "$driver" finished <pr-url> --election <tmp-dir>/next.md --prompt <tmp-dir>/next.prompt
   "$driver" finished <pr-url>
   "$driver" blocked integrate - <<'REASON'
   not merged <pr-or-branch>
   REASON
   ```
   Each Bash call starts with the `driver=` line. The status write is the last tool call. Exit 4
   (a status already exists: a restarted session with its transcript intact already wrote it)
   or any other non-zero exit is surfaced to the user, never a blocker.
   ````
   This adds exactly ONE `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/` occurrence → the shim count
   for the run skill goes 12 → 13 (test/craft-root-shim.test.js:29).
3. `## Done`, the `close` paragraph (:630-631, "`run-ledger.sh close <run-id>` — the last ledger
   action, … it removes the pointer and the ledger."). Append: "On an already-closed run it is a
   silent exit 0, so a session restarted after its process died re-runs it and loses nothing."
   Keep "the last ledger action" (pinned).

**docs/contributing/specs/run-record.md** `## Write cadence and the single-writer rule` (:176),
item 3 (:191-192, "**`close`, at `Done`.** Removes the pointer and the ledger, once the run
record has been read for the final message."). Append the same sentence: "On an already-closed
run it is a silent exit 0, so a restarted session that re-runs it loses nothing."

**test/driver-contract.test.js** (115 lines; CommonJS; imports `TO_END, sliceProse,
sliceRegion` from ./helpers/region-slice; reads `run` and `workspace` skills at :9-10; region
constants at :12-24; `ANY_H2 = /^## /` at :93; `DRIVER_SPEC`/`policySpec` at :91-92). Add
constants near :21: `REBUILD_STEP_1 = /^1\. \*\*The ledger outranks the summary\.\*\*/`,
`REBUILD_STEP_2 = /^2\. \*\*Re-derive the Resolution\.\*\*/`,
`CLOSED_RUN_START = /^\*\*Closed run\.\*\*/`, `CLOSE_LINE = /^`run-ledger\.sh close <run-id>`/`,
`WRITE_CADENCE = /^## Write cadence and the single-writer rule/`; read
docs/contributing/specs/run-record.md beside `DRIVER_SPEC`. `ANY_H2` is declared at :93,
after the run-skill tests: declare new constants before first use.

### TDD steps

1. GUARD — test/run-ledger.test.js: "Given a closed run, when close runs again, then it exits 0 with empty stdout and stderr" — `withRun({}, …)`, `runLedger(run.main, ['close', 'demo'])` in Arrange, then `const sut = runLedger;` and `sut(run.main, ['close', 'demo'])`; assert status 0, stdout `''`, stderr `''`. Passes already: `cmd_close` is `rm -f`.
2. GUARD — "Given a closed run, when locate --run runs, then stdout is empty and exit is 0" — same arrange, `sut(run.main, ['locate', '--run', 'demo'])`. Passes already; it pins the signal the Closed-run branch keys on.
3. RED — test/driver-contract.test.js: "Given the Rebuild section, when step 1 is read, then a locate that prints nothing routes to Closed run and never re-opens" — `sut = sliceProse(run, REBUILD_STEP_1, REBUILD_STEP_2)`; includes `prints nothing`, `**Closed run**`, ``Never re-`open` ``. Fails: today's step 1 has no `prints nothing` branch.
4. GREEN — append the step 1 sentence.
5. RED — two changes:
   (a) "Given the Closed run paragraph, when read, then a driven session writes one status from the PR state through driver-state.sh and re-elects only when merged" — `sut = sliceProse(run, CLOSED_RUN_START, DONE_HEADING)`; includes `driver-state.sh active`, `VCS port`, `<type>/<run-id>`, `Driver hand-off`, `Election (driven runs only)`, `<main-repo-dir>`, `"$driver" finished <pr-url> --election <tmp-dir>/next.md --prompt <tmp-dir>/next.prompt`, `"$driver" finished <pr-url>`, `blocked integrate - <<'REASON'`, `not merged <pr-or-branch>`, `{ rebuild, reason, ≤3 options }`, `Exit 4`, `exit 3`, `last tool call`; `!sut.includes(PRE_APPROVAL_FLAG_VALUE)`. Also `sliceProse(run, REBUILD_START, DONE_HEADING).includes('**Closed run.**')`, so the paragraph sits inside the Rebuild section.
   (b) test/craft-root-shim.test.js:29: `count: 12` → `count: 13`.
   Fails: (a) `region start /^\*\*Closed run\.\*\*/ not found`; (b) `13 !== 12`.
6. GREEN — insert the Closed run paragraph and fenced block.
7. RED — "Given the Done close paragraph and the run-record write cadence, when read, then close on an already-closed run is a silent exit 0" — `sut = sliceProse(run, CLOSE_LINE, HANDOFF_START)` includes `already-closed run` and `silent exit 0`; `sliceProse(runRecordSpec, WRITE_CADENCE, ANY_H2)` includes the same two phrases. Fails: neither sentence exists.
8. GREEN — add the sentence to both files.
9. GUARD — the existing §Done order test (close < hand-off < finished) and test/run-record.test.js Rebuild/Done pins stay green (text is only added).

### Gate

`bash scripts/ci.sh > <tmp>/ci.log 2>&1; echo $?` then grep the log for `# fail`, `not ok`,
`ci:`, `SLOP-FOUND`. Inner loop: `node --test test/driver-contract.test.js test/run-ledger.test.js test/craft-root-shim.test.js test/run-record.test.js test/source-hygiene.test.js`.

### Commit

`fix(run): rebuild a closed run from the PR state`

## Part 3 — In-place refused under background sessions and driver spec env channel

### Context

Edits `skills/workspace/SKILL.md`, `skills/run/SKILL.md`, `docs/contributing/specs/driver.md`,
`test/driver-contract.test.js`.

**skills/workspace/SKILL.md step 2** (:24-36). The fenced worktree block (:28-31) stays the
first and only fenced block in step 2 (test/run-record.test.js:359-374 takes the first fence).
Replace the in-place sentence (:33-36) with:
```
   Strategy `in-place` (manifest `workspace: { strategy: in-place }`): create the branch
   in the current checkout (`git switch -c <type>/<slug>`); deps assumed present or
   installed in place; later phases use the checkout root wherever they'd use the
   worktree (the run-lock path resolves from it too). **In a Claude Code background
   session (`CLAUDE_JOB_DIR` set) → STOP before `git switch`**: the Bash call that would run
   it tests `[ -n "${CLAUDE_JOB_DIR:-}" ]` first. The session's edit guard refuses
   Write/Edit in the shared checkout until the session isolates, so an in-place run could
   not edit. Reason: `in-place strategy cannot run in a background session; use strategy
   worktree, run attended, or set worktree.bgIsolation: none in the repo's Claude
   settings`. Craft does not read that setting: it merges across the user, project, local,
   managed and `--settings` layers, so the session's effective value is not observable from
   the run. Nothing was switched, so nothing needs undoing.
```
(Other bindings never set `CLAUDE_JOB_DIR`; no sentence needed.) Step 3 (:37, "Branch or
worktree path collision → STOP") is the region end for the test.

**skills/run/SKILL.md, Driven stop bullet** (:498-514). In :499 "any STOP in §0 or in the walk
error paths, the workspace collision STOP, an escalation …" insert "the workspace in-place
background STOP," right after "the workspace collision STOP,". Nothing else in the bullet moves
(its existing pins: `"$driver" blocked <phase-id> - <<'REASON'`, `active >/dev/null &&`,
`never expanded by the shell`, `starts at column 0`, ``phase id `resolve` ``,
`degrade-to-blocker`, `workspace collision`). Its phase id is `workspace`, so the driven status
reads `BLOCKED workspace: <reason>` (the bullet's `<phase-id>` is the stopping phase; only §0
stops are named `resolve`).

**docs/contributing/specs/driver.md** (frontmatter `subjects` unchanged; scanned by source
hygiene — no host-CLI names).
- `## Activation` (:12-24). Keep the first two paragraphs (what the variable is; `active` exit
  codes). Replace the third paragraph (:21-23, "Set `CRAFT_DRIVER_STATE` again on `claude --bg
  --resume`. Only the launch path was probed: …") with:
  ```
  Pass the variable as `claude --bg --settings <file>`, with `<file>` holding
  `{"env":{"CRAFT_DRIVER_STATE":"<abs-dir>"}}`. The settings env reaches hooks and the Bash
  tool, wins over the background service's env, and is restored on `claude --bg --resume`
  from the session's saved options. Keep the file in place until the entry ends: whether a
  resume re-reads it or uses a saved copy is not pinned.

  Never export `CRAFT_DRIVER_STATE` in a shell that may start the background service. A
  background session's env is the service's env, fixed when the service starts: an export
  there leaks into every later background session, driven or not, until the service
  restarts. A plain launcher export reaches the session only when that launch starts the
  service.
  ```
- `## Background sessions` (:92-100, last section). Keep both paragraphs. Append:
  ```
  A background session is recognised by `CLAUDE_JOB_DIR` being set; `CLAUDE_CODE_SESSION_KIND`
  is not set. `claude stop` and `claude attach` take the 8-character short id
  (`basename "$CLAUDE_JOB_DIR"`); `stop` with the full id finds no job. Resume only a stopped
  session: `--resume <full-id>` on a live one forks a copy.

  Strategy `in-place` cannot run in a background session: the workspace phase stops before
  `git switch`, and a driven run reports `BLOCKED workspace: …`. Use strategy `worktree`.
  ```

**test/driver-contract.test.js** (after Part 2). Add constants
`WORKSPACE_STEP_2 = /^2\. \*\*Consult `isolate` action\*\*/`, `WORKSPACE_STEP_3 = /^3\. /`,
`ACTIVATION = /^## Activation/`, `BACKGROUND_SESSIONS = /^## Background sessions/`. Reuse
`DRIVEN_STOP_START`/`POLICY_CONSULT`, `ANY_H2`, `TO_END`, `DRIVER_SPEC`, `workspace`.

### TDD steps

1. RED — "Given the workspace skill step 2, when the in-place strategy is read, then a background session stops before git switch and the reason names worktree.bgIsolation" — `sut = sliceProse(workspace, WORKSPACE_STEP_2, WORKSPACE_STEP_3)`; includes `CLAUDE_JOB_DIR`, ``STOP before `git switch` ``, `[ -n "${CLAUDE_JOB_DIR:-}" ]`, `in-place strategy cannot run in a background session`, `worktree.bgIsolation`, `Craft does not read that setting`, `not observable`; `!sut.includes('run-lock location included')`. Fails: today's step 2 has no `CLAUDE_JOB_DIR`.
2. GREEN — rewrite the in-place sentence.
3. RED — "Given the cross-phase invariants, when the Driven stop bullet is read, then it lists the workspace in-place background STOP" — `sut = sliceProse(run, DRIVEN_STOP_START, POLICY_CONSULT)`; includes `workspace in-place background STOP` and still `workspace collision`. Fails: the phrase is absent.
4. GREEN — insert the phrase in the Driven stop bullet.
5. RED — two tests:
   - "Given the driver spec Activation section, when read, then the variable travels through --settings env and is never exported where the service may start" — `sut = sliceProse(DRIVER_SPEC, ACTIVATION, ANY_H2)`; includes `--settings`, `{"env":{"CRAFT_DRIVER_STATE":"<abs-dir>"}}`, `--resume`, `Never export`, `leaks into every later background session`; `!sut.includes('Only the launch path was probed')` and `!sut.includes('again on')`.
   - "Given the driver spec Background sessions section, when read, then it names CLAUDE_JOB_DIR, the short id for stop and attach, the live-resume fork, and the in-place stop" — `sut = sliceProse(DRIVER_SPEC, BACKGROUND_SESSIONS, TO_END)`; includes `CLAUDE_JOB_DIR`, `CLAUDE_CODE_SESSION_KIND`, `short id`, `basename "$CLAUDE_JOB_DIR"`, `forks a copy`, `in-place`, `BLOCKED workspace`.
   Fails: Activation still holds "Only the launch path was probed" and lacks `--settings`; Background sessions lacks `CLAUDE_JOB_DIR`.
6. GREEN — rewrite the Activation paragraph; append the two Background sessions paragraphs.
7. GUARD — the existing whole-spec test ("Given the driver spec, when read, then it carries the status grammar lines and every exit-code row") stays green: `--resume`, `CRAFT_DRIVER_STATE`, `PermissionRequest` are all still present; test/run-record.test.js's step 2 fence test stays green (no fence added).

### Gate

`bash scripts/ci.sh > <tmp>/ci.log 2>&1; echo $?` then grep the log for `# fail`, `not ok`,
`ci:`, `SLOP-FOUND`. Inner loop: `node --test test/driver-contract.test.js test/run-record.test.js test/craft-root-shim.test.js test/source-hygiene.test.js test/living-corpus.test.js`.

### Commit

`fix(workspace): refuse in-place strategy in a background session`
