# Design — refuse `open` on a live run-id

> Brief: `run-ledger.sh open` on a run-id that is still open discards that run's ledger.
> The run-id is the topic slug. A second `/craft:run` of the same topic runs `open` at
> `skills/run/SKILL.md` §0 step 4, before `craft:workspace`'s collision STOP, and replaces
> the live ledger with a fresh one. One stderr line is the only warning. Goal: `open` must
> not silently destroy a live run's ledger.
> Status: draft → self-reviewed ×3

## Context

### The defect (proof produced by the orchestrator, re-pinned below)

A throwaway red test runs `open demo`, then `append demo resolve` (`RESOLVE: none`), then
`open demo` again. The second `open` exits 0, the ledger is reset to the header alone, and
stderr says `run-ledger: open: replacing existing pointer for run-id demo`.

Faulty site: `scripts/run-ledger.sh:170`. `cmd_open` calls
`write_atomically "$target" "$LEDGER_HEADER"` unconditionally. `warn_if_replacing`
(L156-160) only warns, and it runs after the overwrite.
`test/run-ledger.test.js:84` ("Given demo already open with records, when open demo runs
again, then stderr names the replacement and the ledger starts fresh") pins this defect
as intended behaviour.

### Current `open` behaviour (pinned in a `mktemp -d` repo against this tree's script)

| # | State before `open demo` | exit | stderr | ledger after | pointer after |
|---|---|---|---|---|---|
| S1 | no pointer, no ledger | 0 | — | header only | new key |
| S2 | trusted pointer + ledger holding `RESOLVE: none` (**live run**) | 0 | `replacing existing pointer for run-id demo` | **header only (records lost)** | new key |
| S3 | pointer, ledger deleted | 0 | — (the sweep removed the pointer first) | header only | new key |
| S4 | ledger, no pointer (crash between the two writes of `open`) | 0 | — | header only (leftover overwritten) | new key |
| S5 | untrusted pointer (future stamp `demo@2099-…`) + ledger | 0 | `replacing existing pointer…` | header only | new key |
| S6 | after `close demo` | 0 | — | header only | new key |

### Why the defect matters beyond the lost ledger

- **Interleaving after a refused or failed `open`.** `cmd_append` (L177-192) routes only
  through the run-id's trusted pointer. If the second run ever got past §0 step 4 without
  its own pointer, every `append <run-id> …` it made would land in the *first* run's ledger.
  Both runs use the same run-id prefix, so the lines could not be told apart. A refusal is
  therefore a STOP, never a surfaced-and-continue failure.
- **Hook binding.** `hooks/bound-run.sh:66` runs `locate --transcript`, which binds a
  session to the newest trusted pointer whose run-key (`<run-id>@<iso>`) appears in that
  session's transcript (ADR-377). Bash stderr lands in the tool result too (observed in
  this design session's own tool output). So a refusal
  message that printed the run-key would bind the second session's compaction hooks to
  the first run's ledger.

### Liveness signals (pinned on this box, Claude Code harness)

The ancestor chain of the Bash tool, from three consecutive tool calls:

```
call 1: 30732 /bin/zsh            ← tool shell, ppid 56460
call 2: 30899 bash ← 30896 /bin/zsh ← 56460 "claude bg-spare" ← 56448 "claude bg-pty-host"
call 3: 30732, 30896, 30899 → dead (kill -0); 56460 → alive
```

The script's parent (the tool shell) dies with every call. The only stable ancestor is
the harness process, and its depth depends on the wrapping: each wrapper adds a level
(`bash -c` measured). Its identity depends on the harness, since craft also runs under the
codex, pi, opencode and copilot bindings. A session that exits and is resumed later
(`claude --resume`) would also show as a dead pid while the run can still continue.
This is not pinned here. The rejection of a pid signal rests on the measured rows above.
The repo's existing `kill -0` checks (`scripts/worktree-teardown.sh:30`, and the
validation/architecture row of `skills/run/SKILL.md` "Rebuild after compaction") track a
long-lived background harness pid. This case has no such pid.

The worktree and branch are no better signal. A live run has neither between `open` and
`workspace`, nor between `integrate`'s teardown (`--delete-branch`) and `close`. Under
strategy `in-place` it has a branch but no worktree. At §0 the branch type
(`feat`/`fix`/`chore`, `skills/workspace/SKILL.md` step 1) is not yet known.

The pointer is the only artefact that spans a run's whole life: `open` writes it at §0
step 4 and `close` removes it as the last action of `Done`.

### Constraints this design inherits

- ADR-380: `scripts/run-ledger.sh` is the single write and locate surface. Only the
  orchestrator calls `open`/`append`/`close`.
- ADR-384: the ledger and pointer live in `<git-common-dir>/craft-runs/`, from `open` to
  `close`.
- ADR-377: hooks bind by the run-key in the transcript. A crashed run's key never appears
  in another session's transcript.
- `scripts/worktree-teardown.sh:35-36`: house precedent for refusing to destroy a live
  run's state. It prints `REFUSED …` to stderr and exits 3.
- Resume after compaction uses `locate --run` and never calls `open`
  (`skills/run/SKILL.md` "Rebuild after compaction" step 1). The refusal cannot break it.

## Requirements

- **R1 — refuse.** `open <run-id>` exits 3 when, after the sweep, a trusted pointer for
  `<run-id>` exists (`load_trusted_pointer` succeeds) and its ledger exists. In that case:
  stdout is empty, the ledger and the pointer are byte-identical before and after, and
  stderr is one line naming the run-id, the open-since ISO stamp and the ledger path.
- **R2 — never print the key.** The refusal output never contains the run-key
  `<run-id>@<iso>`. A transcript that holds only the refusal output binds no run through
  `locate --transcript`.
- **R3 — other cases unchanged.** Rows S1, S3, S4, S5 and S6 keep their current outcome.
  The `open` argument grammar is unchanged: `open demo --in-place` still exits 2 and
  creates no run directory.
- **R4 — the orchestrator STOPs.** In `skills/run/SKILL.md` §0 step 4, exit 3 from `open`
  is a STOP with a blocker `{ resolve, reason, ≤3 options }`. The same call's `append`
  does not run, because the existing `&&` chain stops it. The orchestrator appends
  nothing for this run, never continues the walk, and never runs `close` without the
  user's explicit discard answer.
- **R5 — the discard path exists without a new surface.** `close <run-id>` followed by the
  unchanged §0 step-4 call opens a fresh ledger (S6).
- **R6 — the spec tells the truth.** `docs/contributing/specs/run-record.md` no longer says
  that `open` discards a live run. That covers the absent-file case, Write cadence item 1, Failure posture
  and Inherited edges ("Run-id collision", "Pointer replacement").
- **R7 — the defect pin is replaced.** `test/run-ledger.test.js:84` becomes the R1 test.
  No test asserts the discard behaviour.

## Design

### Principle: the pointer is the liveness signal, and the user decides crashes

No mechanical check can tell a live run from a crashed one (see Context). The design
therefore does not try. A run is open from `open` until `close`. While it is open, `open`
refuses that run-id, and the user, asked once, tells a live run from a dead one. A false
refusal of a crashed run costs one STOP. A false accept of a live run costs that run's
ledger. Only the first error can be recovered from, so the design accepts it.

### `scripts/run-ledger.sh` (the only code change)

```bash
readonly OPEN_RUN_EXIT=3

# A run stays open from `open` to `close`: no process outlives a tool call, so
# whether an open run is dead is the user's call, never this script's.
refuse_if_open() {
  local run_id="$1"
  load_trusted_pointer "$run_id" && [ -f "$ledger" ] || return 0
  die "open: run-id $run_id is already open since ${key#*@} (ledger $ledger); refusing to discard it" "$OPEN_RUN_EXIT"
}

cmd_open() {
  [ $# -le 1 ] || usage_exit
  local run_id="${1:-}" target run_key
  require_run_id "$run_id"
  resolve_git_common || die "not inside a git repository's work tree"
  prepare_runs_dir
  sweep_stale_pointers
  refuse_if_open "$run_id"          # new — before any write
  target="$(ledger_path "$run_id")"
  write_atomically "$target" "$LEDGER_HEADER"
  warn_if_replacing "$run_id"       # now reached only for an untrusted leftover (S5)
  run_key="$run_id@$(utc_now)"
  write_atomically "$(pointer_path "$run_id")" "$run_key $target"
  printf '%s %s\n' "$run_key" "$target"
}
```

- The predicate is the one `locate --run` (`locate_by_run`, L220-227) already uses to say
  "this run is open". The script then has one definition of an open run.
- The refusal runs after `sweep_stale_pointers`, so S3 (pointer whose ledger is gone)
  still opens silently.
- The stderr line deliberately contains no `close` hint. A model reads stderr as an
  instruction, and discarding is the user's call (R4). The line says `since <iso>`, never
  `<run-id>@<iso>` (R2).
- `key` and `ledger` are script-scoped globals set by `load_trusted_pointer`. `cmd_append`
  already relies on the same convention.
- Function: 4 lines. No boolean parameter, no new verb, no new flag.

### Post-change matrix

| # | State before `open demo` | exit | stdout | ledger / pointer |
|---|---|---|---|---|
| S1 | none | 0 | `<key> <ledger>` | fresh |
| **S2** | **trusted pointer + ledger** | **3** | **empty** | **unchanged** |
| S3 | pointer, ledger gone | 0 | key line | fresh (swept first) |
| S4 | ledger, no pointer | 0 | key line | fresh (no run can append to a pointerless ledger) |
| S5 | untrusted pointer + ledger | 0 + warn | key line | fresh (no run can append through an untrusted pointer) |
| S6 | after `close` | 0 | key line | fresh |

### `skills/run/SKILL.md` §0 step 4 (prose, after the "Never silence `open`'s stdout" paragraph, ~L152)

The step-4 call stays `"$ledger" open <run-id> && "$ledger" append <run-id> resolve <<'EOF' …`.
On refusal the `&&` already stops the seeded lines from reaching the live ledger.

Add one paragraph, **A refused `open` is a STOP**, with this content:

- Exit 3 means the run-id is already open: another run of this topic is live or crashed
  without `close`.
- This is not a failed append. Continuing would append this run's lines to that run's
  ledger under the same run-id, so the orchestrator STOPs.
- Blocker `{ resolve, reason: "run-id <slug> already open since <iso>", options }`, with
  these options:
  1. **Stop here.** The run is live: continue it in its own session.
  2. **Discard it.** The run is dead: run `close <run-id>`, then re-run this step's call
     unchanged. A leftover `../<repo>-<slug>` worktree or `*/<slug>` branch still hits
     `craft:workspace`'s collision STOP.
  3. **Re-slug.** Re-run §0 step 3 with a different topic slug.
- Never run `close` without the user choosing option 2.

Prose trap: `test/run-record.test.js:397` parses every `run-ledger.sh"?)?"? <word>` in
skills, the spec and the hooks as a verb, and fails on an unknown one. Write
`run-ledger.sh close`, `run-ledger.sh open`, or `` `open` ``. Never write
`run-ledger.sh refuses`.

### `docs/contributing/specs/run-record.md`

| Section (line) | Change |
|---|---|
| The absent-file case (L144-148) | Keep the temp-file-and-rename wording. Narrow "a leftover from a crashed attempt" to "a leftover ledger with no open pointer". A crashed attempt that still holds its pointer is now refused, not overwritten. |
| Write cadence item 1 (L162) | Append: "refuses — exit 3, nothing written — a run-id whose trusted pointer and ledger exist; see Inherited edges". |
| Failure posture (L194-198) | Add one sentence: a refused `open` (exit 3) is not a write failure. It STOPs, because a run that continued would append into the other run's ledger. |
| Inherited edges → Run-id collision (L202-207) | Rewrite. A re-run of the same topic still reuses the run-id. While the first run is open (trusted pointer + ledger), `open` refuses with exit 3 and touches nothing. The orchestrator STOPs and the user chooses stop / discard (`close`, then `open`) / re-slug. Keep the word "collision" (pinned by `test/run-record.test.js:247`) and keep the Resume double-`Done` edge untouched (same test). |
| Inherited edges → Pointer replacement (L214-217) | Narrow it to the untrusted leftover (S5). Such a pointer can bind no run, so it is replaced and the one stderr line names the replacement. |

### `BACKLOG.md`

The entry "**`open` on a live run-id discards that run's ledger.**" (L384-388) is removed
in the same change, following the close convention of earlier runs.

### Implementation context (parts)

| Part | Files | Anchors |
|---|---|---|
| 1 — script + behaviour tests | `scripts/run-ledger.sh`, `test/run-ledger.test.js` | Insert `OPEN_RUN_EXIT` beside the other `readonly`s (L17-24). Put `refuse_if_open` after `warn_if_replacing` (L156-160). In `cmd_open` (L162-175), call it after `sweep_stale_pointers` (L168). Test helpers: `runLedger(cwd,args,input)` → `{status,stdout,stderr}`, `createRunRepo`, `runsDirOf`, `writeTranscript(dir,texts)`, `bindRun`, `LEDGER_HEADER`, all from `test/helpers/craft-run.js`. Local helpers: `withRepo`, `withRun`, `ledgerOf`, `pointerOf`, `PAST_STAMP` (L19-50). Replace the test at L84-95. Put the new tests in the `// open` block (before the L97 `for` loop). |
| 2 — prose + prose pins | `skills/run/SKILL.md`, `docs/contributing/specs/run-record.md`, `BACKLOG.md`, `test/run-record.test.js` | Step-4 region test anchors: `sliceRegion(runSkill, /^4\. Open the \*\*run record\*\*/, /^## Phase walk/)` (L75-83). Inherited-edges region: `sliceRegion(spec, /^## Inherited edges/u, /^## /u)` (L247-254). Verb-set test at L397. Run with `node --test test/run-ledger.test.js test/run-record.test.js 2>&1 \| tail -15`, then `bash scripts/ci.sh > /tmp/ci.out 2>&1; tail -20 /tmp/ci.out`. |

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D1 | Liveness source for refusing `open` | (a) pid in the pointer + `kill -0`; (b) worktree/branch existence; (c) refuse-unless-closed: a trusted pointer with an existing ledger means open, and the user judges a crash | (c) | Pinned: the script's parent dies every call, and the stable ancestor is a harness process at a depth that depends on wrapping and on the harness. (b) treats a live run as dead before `workspace` and between teardown and `close`. A worktree-only probe also misses `in-place`, and a branch probe needs the type, which is unknown at §0. (c) needs no new state, and its only error (refusing a crashed run) costs one STOP. |
| D2 | Probe the branch/worktree collision at §0 before `open` | (a) leave the order as is: `open` refuses, and `workspace` step 3 still STOPs on a leftover tree; (b) add a type-free §0 probe of `../<repo>-<slug>` + `refs/heads/*/<slug>` before `open`; (c) move the collision check from `workspace` to §0 | (a) | Every live run has a pointer from §0 step 4 until `close`, so a §0 tree probe catches no live run that the refusal misses. (b) duplicates a rule and still misses runs before `workspace` and after teardown. (c) needs the type before classification. |
| D3 | How the user discards a crashed run | (a) the existing `close <run-id>`, then the unchanged step-4 call; (b) a new `open <run-id> --force` flag (teardown precedent); (c) both | (a) | No new grammar: `open` keeps rejecting extra arguments (`open demo --in-place` → 2 stays pinned). `close` already means "end this run, remove pointer + ledger". A flag on `open` is one keystroke away from an orchestrator auto-retry. |
| D4 | Refusal exit code | (a) 3, a dedicated code (the `worktree-teardown.sh` REFUSED precedent); (b) 1, the generic `die` default | (a) | Exit 1 already means "not in a work tree" and similar runtime failures, and the skill must branch on refusal alone (R4). 3 is the repo's existing "refused, live state" code. |
| D5 | What counts as "open" for the refusal | (a) a trusted pointer + an existing ledger, the same test as `locate --run`; (b) any pointer file left after the sweep (`warn_if_replacing` becomes dead and is deleted) | (a) | One definition of an open run, shared with `locate`/`append`. An untrusted pointer (S5) can bind no run, so replacing it destroys nothing live. (b) is 3 lines smaller but refuses leftovers no run could use. The case where (a) fails (a live pointer turned untrusted by a backwards clock step) is accepted as an edge. |

## Test strategy

Every new test is a `node:test` with a GWT title, AAA layout and a `sut` variable, run in
`withRepo`/`withRun` throwaways. RED first: the R1, R2 and R4 tests fail on today's script
(S2 row). The R5 and S3/S4/S5 rows are characterization tests and pass from the start.

`test/run-ledger.test.js`:

| Given | When | Then | Proves |
|---|---|---|---|
| demo open with `RESOLVE: none` appended (replaces L84) | `open demo` | exit 3; stdout `''`; ledger and pointer bytes equal the pre-call snapshot; stderr matches `/already open since \d{4}-.*Z/` and contains the ledger path | R1, R7 |
| a bound run (`bindRun`) | `open demo` | `result.stderr` and `result.stdout` do not include `run.runKey` | R2 |
| a transcript holding only a refusal's stdout+stderr (`writeTranscript`) and a bound run | `locate --transcript <that transcript>` | stdout `''` | R2 (binding) |
| demo open with records | the §0 chain `bash -c '"$S" open demo && printf "RESOLVE: x\n" \| "$S" append demo resolve'` | exit 3; the ledger still ends with the original record and holds no `RESOLVE: x` | R4 (the `&&` guard) |
| demo open with records | `close demo` then `open demo` | exit 0; ledger is `LEDGER_HEADER\n` only | R5 |
| demo's pointer present, its ledger deleted | `open demo` | exit 0; fresh ledger; stderr `''` | R3 (S3) |
| demo ledger present, no pointer | `open demo` | exit 0; ledger is the header only | R3 (S4) |
| demo pointer with stamp `2099-01-01T00:00:00Z` + ledger | `open demo` | exit 0; stderr matches `/replacing existing pointer/`; fresh ledger | R3 (S5), D5(a) |

Kept unchanged: the `open demo --in-place` → 2 row (L97-112, R3 grammar) and the sweep
tests (L608-632).

`test/run-record.test.js` (prose pins, house style `sliceRegion`):

- The §0 step-4 region includes `exit 3` and `close <run-id>`, and names the STOP. It also
  states that continuing would append to the other run's ledger, so the reason survives
  edits.
- The Inherited-edges region no longer includes `a live run of that topic loses its
  ledger` and still matches `/collision/iu` and the double-`Done` sentence (existing
  test, kept).
- The verb-set test (L397) is unchanged and must stay green. It guards the prose trap.

Gates: `node --test test/run-ledger.test.js test/run-record.test.js`, then `bash scripts/ci.sh`
(readme-drift, design-lint). No property-test lens: no parser or matcher changes. The
predicate reuses `load_trusted_pointer`, whose input matrix is already covered by the
planted-pointer tests (L509-583).

## Out of scope

- Resuming the open run from a new session (a fourth STOP option). The new session's
  transcript would need the run-key for the hooks to bind, and `locate --run` does not
  print it. That is a separate cross-session resume feature.
- A TOCTOU guard for two `open`s racing within the same instant. Not reproduced. Proving
  it would take two `open demo` in a tight parallel loop, then checking that both exited 0.
- A ledger token recording a discard. The discarded ledger is gone, and the user's answer
  stays in the transcript as a verbatim message.
- Detecting a dead run automatically (pid, heartbeat, mtime). Measured unsound above, and
  every heuristic re-opens the false-accept case this change closes.
