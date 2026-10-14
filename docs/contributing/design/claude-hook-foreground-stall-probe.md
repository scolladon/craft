# Design — Claude Code binding: a git guard hook stalled in a foreground command at its timeout fails open

> Brief: probe a Claude Code hook timeout while the hook is stalled in a foreground command, and
> answer the "a stall in a foreground command was not probed" qualifier in the hook header and the
> gate spec's "On a timeout:" paragraph. Result (probed, matrix below): the call runs and Claude
> Code does not hang. At the deadline Claude Code 2.1.299 sends SIGTERM to the hook's whole process
> tree. A foreground child that dies on TERM dies at once, the hook's deferred TERM trap runs, and
> the hook hands 143 to the crash deny, which is ignored. A tree that survives TERM is SIGKILLed
> about 1.2–1.7 s later. The model sees a clean result. Nothing here is a fail-open the hook can act
> on, so this change is document-only: it replaces the qualifier with the measured behaviour and
> closes the BACKLOG entry "Probe a Claude Code hook timeout while the hook is stalled in a
> foreground command".
> Status: draft → self-reviewed ×3

## Context

### What Claude Code does when a hook stalled in a foreground command times out (pinned, Claude Code 2.1.299)

Method: the harness of [claude-hook-timeout-probe](claude-hook-timeout-probe.md), deltas only.
`claude -p --model haiku --setting-sources project --strict-mcp-config --no-session-persistence
--allowedTools "Bash(touch:*)" --output-format stream-json --verbose`, run with
`ANTHROPIC_API_KEY` and `CLAUDECODE` unset, from a mktemp project `<proj>` under `$TMPDIR`. The
project's `.claude/settings.json` registers ONE PreToolUse/Bash command hook with `"timeout": 3`
(seconds). The prompt asks for exactly one Bash call, `touch <proj>/MARKER`, with no retry. If
MARKER exists, the call ran. A 120 s watchdog would have killed a hung `claude`; it never fired.

The hook is a copy of `hooks/git-no-ext-diff.sh` with this block inserted right after its
`trap 'exit "$SIGHUP_EXIT_STATUS"' HUP` line:

- `touch <proj>/HOOK-RAN`, and a `START <pid> <pgid> <ppid> <parent> <epoch.ms>` line appended to
  `<proj>/SIGNAL-LOG`;
- the EXIT trap re-installed to log `EXIT rc=<status> <epoch>`, then call `deny_on_crash`; the TERM
  and HUP traps log `<signal> <epoch>`, then do what the shipped trap does; an INT trap logs, then
  re-raises;
- a watcher, detached (perl `setpgrp` plus fork, so ppid 1, its own group, stdio to `/dev/null`),
  taking `ps` snapshots of every probe process (row fg1: +3.5/6/10/22/30 s; rows fgi2-3: every
  0.25 s from +2.5 to +6 s, then +6.5/7/8/10/22/32 s);
- rows fg2 and fgi*: a sentinel `S2`, a perl child of the hook in its OWN process group
  (`setpgrp`), stdio to `/dev/null`, that logs every catchable signal it gets, survives it, and
  logs `S2-DONE` at +30 s;
- the stall, in the FOREGROUND, 20 s: `sleep 20` in the `fg` rows; in the `fgimmune` rows a perl
  child in the hook's group (`FG`) that logs every catchable signal, survives it, and logs
  `FG-DONE` at +20 s (it stands for a foreground command that does not die on TERM);
- then `STALL-DONE`, then the hook's own body.

Calibration (direct runs, no Claude Code, hook in its own group, TERM sent at +3 s):

| TERM sent to | plain `sleep` in the foreground: TERM trap logged | `FG-TERM` | `S2-TERM` |
|---|---|---|---|
| hook pid only | +20 s (bash defers the trap until the child exits) | no | no |
| hook's process group | at once (`sleep` dies) | yes | no |
| hook pid and every descendant by ppid (a `pgrep -P` walk) | — | yes | yes |

Live matrix (Claude Code 2.1.299):

| Row | Stall | Signal log (relative to START) | Processes | MARKER | What the model sees (stream-json `tool_result`) | Verdict |
|---|---|---|---|---|---|---|
| fg1 | `sleep 20` | `TERM` +2.76 s, `EXIT rc=143` 12 ms later | the first watcher (a child of the hook in its own group, NOT detached) never wrote a snapshot: it was killed too | present, 2.36 s after `TERM` | `(Bash completed with no output)`, `is_error` false, no hook event | **fail-open** |
| fg2 | `sleep 20` + S2 | `TERM` +2.79 s, `EXIT rc=143` 9 ms later, `S2-TERM` (first sentinel, about 1 s logging lag) | +3.5 s: hook and `sleep` gone, S2 alive and re-parented (ppid 1); +6 s: S2 gone with no `S2-DONE`. This first sentinel trapped only TERM, HUP and INT, so the killing signal was uncaught; SIGKILL is likely | present, 2.11 s after `TERM` | same clean result | **fail-open** |
| fgi1 | TERM-immune `FG` + S2 | `FG-TERM` and `S2-TERM` (first sentinel, about 1 s lag: TERM at about +2.84 s); no hook `TERM` or `EXIT` line, no `FG-DONE`, no `S2-DONE` | +3.5 s: all 3 alive; +6 s: all gone | present, after the tree was gone | same clean result | **fail-open** |
| fgi2 | same, sharpened sentinel (traps every catchable signal, 50 ms poll) | `S2-TERM` and `FG-TERM` +2.80 s; nothing else, ever | all 3 alive at +4.0 s, all gone at +4.25 s: killed 1.23–1.48 s after TERM with no catchable signal logged, so SIGKILL | present, 3.14 s after `TERM` | same clean result | **fail-open** |
| fgi3 | same | `FG-TERM` and `S2-TERM` +2.85 s; nothing else | alive at +4.25 s, gone at +4.5 s: killed 1.43–1.69 s after TERM, SIGKILL | present, 3.12 s after `TERM` | same clean result | **fail-open** |

On every row: the hook's parent is `claude`, the hook's pgid is its own pid, and `ps` shows STAT
`SNs` (it leads its own session too). `claude -p` exited 0 in 9–10 s wall time; no hang. The
stream-json event types were `system:init`, `assistant` ×2, `user`, `rate_limit_event` and
`result:success`.

Measured:

- At the deadline Claude Code 2.1.299 sends SIGTERM to the hook AND to its descendants, including
  one in another process group (S2). A process re-parented away before the deadline (the detached
  watcher) is not signalled. The calibration rows show that a process-group signal would have
  missed S2, and a pid-only signal would have left the foreground `sleep` running for 20 s. So the
  signal goes to the process tree, walked by parent pid: not to the group, not to the pid alone.
- A foreground child that dies on TERM dies at the deadline, so the hook's deferred TERM trap runs
  at once and the hook hands 143 to the crash deny (the live exit status was not captured, as in
  the precedent). The call runs anyway, as in the precedent's background-wait rows.
- When the tree survives TERM, Claude Code SIGKILLs it about 1.2–1.7 s later (2/2 sharpened rows;
  fgi1 agrees within its coarser snapshots). The hook's TERM trap, deferred behind its foreground
  child, never runs.
- The call runs on every row, and the model sees a clean result with no hook event.

Inferred, not measured:

- Claude Code waits for the hook to end (perhaps for its whole tree) before it runs the call.
  MARKER always landed after the end: 2.1–2.4 s after TERM when the hook exited on TERM (fg1,
  fg2), and 3.1 s after TERM when the tree had to be SIGKILLed (fgi2, fgi3), so about 1.4–1.9 s
  after the kill window. The later MARKER tracks the later end; that is consistent with waiting,
  not a proof of it (n=2 against n=2).
- fg2: a descendant that survived TERM was killed even though the hook had already exited on TERM
  and the descendant had been re-parented. So the escalation targets the tree as found at TERM
  time, not only a hook still running (n=1, first sentinel).

Not shown: the exact escalation delay (only bracketed, 1.23–1.69 s), and whether the SIGKILL walks
the tree the same way (all 3 vanished in the same 0.25 s window, so it reached the in-group `FG`
and the out-of-group `S2` alike).

Environment: Claude Code 2.1.299, macOS 27.0.1, `/bin/bash` 3.2.57, haiku. User settings, plugins
and MCP servers were not loaded. Residue: one empty
`<claude-config-dir>/projects/<probe-slug>/memory` directory per run, removed after each run; the
mktemp projects were removed. Cost: 5 haiku turns, $0.0087 in total.

### The hook's own foreground children die on TERM (measured, this design)

The shipped hook's external commands are `cat` (line 59), `jq` (lines 62, 90), `grep` (line 81)
and `sed` (line 88), each inside a command substitution or a pipeline, so each runs under a
subshell bash that is itself a child of the hook. Two direct runs, no Claude Code:

- Each command was started under `/bin/bash` 3.2.57 reading a FIFO that never ends, then sent
  TERM: all four exited 143 (`cat`, `jq-1.8.2`, BSD `grep` 2.6.0-FreeBSD and BSD `sed` from
  `/usr/bin`, macOS 27.0.1).
- The shipped hook itself was started with its stdin on a FIFO held open, so it blocks in
  `IN=$(cat …)`. Its tree at +0.5 s was hook bash → subshell bash → `cat`, all in one process
  group. TERM sent to the three pids (the parent-pid walk Claude Code does): the hook exited 2
  with `craft git-no-ext-diff: failed (exit 143), call denied` on stderr about 0.07 s after the
  TERM.

So on a real stall in any of them, the tree TERM kills the child, the hook's TERM trap runs, and
the hook exits through the crash deny: the fg1 row, not the fgimmune rows. The fgimmune rows cover
a child the shipped hook does not run. They show that even then Claude Code does not hang.

### What the repo records today

- `hooks/git-no-ext-diff.sh:15-21`, the end of the crash-path header paragraph; `set -euo
  pipefail` is line 22. Lines 17-21 carry the timeout sentence, measured on 2.1.296, with the
  qualifier this probe answers:

  ```bash
  # signal. A run past Claude Code's hook timeout (600 s; hooks.json sets none) fails open
  # too, though code here does run: Claude Code (2.1.296) sends SIGTERM at the deadline, then
  # runs the call whatever this hook exits with or prints (probed with the hook interrupted in
  # a background wait; a stall in a foreground command was not probed). The TERM and HUP traps
  # still deny either signal from any other sender.
  ```

  Line 10 (`Crash path: Claude Code (2.1.296) runs the Bash call on every hook exit status
  except 2`) is the non-timeout contract, measured by the nonzero-exit probe on 2.1.296. This
  probe did not re-run its rows.
- `docs/contributing/specs/gate.md:72-80`, the Claude binding's `On a timeout:` paragraph,
  indented two spaces under the `git-no-ext-diff.sh` bullet (line 47). Lines 76-77 carry the same
  qualifier: `The probe hook was interrupted in a background wait; a hook stalled in a foreground
  command was not probed.` Line 72 labels the whole paragraph `Claude Code 2.1.296`. The next
  block is the `**gate-command**` paragraph on line 82. The `On a crash:` paragraph (lines 58-70)
  is not touched.
- `hooks/git-no-ext-diff.sh:51-54`: the trap comment and the TERM and HUP traps, pinned by the two
  `Given a ${signal} while the hook reads stdin…` tests (`test/hooks.test.js:366`), which signal
  the hook pid alone while `cat` reads stdin, then end stdin so `cat` returns. They still deny a
  TERM or HUP from any other sender.
- `hooks/hooks.json` registers the hook with no `timeout`, so the documented 600 s default
  applies (ADR-548). `test/hooks.test.js:546` pins the PreToolUse array.
- `BACKLOG.md:178`: section `### Open (scoped 2026-10-13 — follow-ups surfaced by the
  claude-hook-timeout-probe run, not yet scheduled)`; the open entry this change closes is lines
  180-188.
- `README.md:200-201`: `[62 design docs]`, `[61 parted plans]`, `[550 ADRs]`, all matching the
  tree on `main`. This doc alone makes `bash scripts/readme-drift.sh .` report the design count
  stale, and `scripts/ci.sh` then stops at the engine suite's live-tree drift test
  (`engine/test/readme-drift-main.test.js`), as in the precedent.
- No test or script reads the header prose or the gate.md paragraph. `git grep` of `test/` and
  `scripts/` for `not probed`, `foreground command` and `2.1.296` finds nothing. The only
  `test/hooks.test.js` anchors on hook lines, `trap ` (line 358) and `IN=${IN%` (line 391), match
  code lines, never `#` comment lines.

### Prior decisions this design follows

- ADR-546: the hook-timeout fail-open is documented, not fixed; the TERM and HUP traps stay. Its
  Consequences say a Claude Code release that honours a post-deadline deny needs a new live probe
  before any doc says so. This probe found no such change on 2.1.299.
- ADR-547: the timeout residual has its own sentence in the header and its own `On a timeout:`
  paragraph in `gate.md`, apart from the "no code here runs to catch it" list. The new text stays
  in that sentence and that paragraph.
- ADR-548: `hooks/hooks.json` sets no `timeout`. Not re-opened: no value closes the fail-open.
- ADR-549: no test pins the timeout residual.
- ADR-550: the timeout ADR refines ADR-541; ADRs are a dated ledger.
- ADR-541: the TERM and HUP traps. Its Consequences line ("Bash runs a trapped signal's handler
  only after the running foreground child returns") still holds for any sender that signals the
  pid alone. Against Claude Code's timeout it no longer delays the deny, because the child is
  signalled too.
- ADR-538: the contract is written in the hook header and the `gate.md` Claude binding, with the
  matrix linked from `gate.md`.
- Dated design docs are a ledger. `claude-hook-timeout-probe.md` keeps its "Not probed" sentence,
  its edge table and its Out of scope lines as written. This doc supersedes them as the record.

### Settled before this design (user decisions, not re-opened)

- If the call runs, drop the qualifier from the hook header and `gate.md`; if the session hangs,
  document that instead. The call ran on 5/5 rows and `claude -p` never hung.
- Change code only on a proven fail-open the hook can act on (ADRs 546-550). Nothing here
  qualifies: the hook's foreground child is killed by Claude Code, or the whole tree is SIGKILLed,
  and nothing the hook returns after the deadline is read (precedent matrix). The outcome is
  document-only.
- The TERM and HUP traps stay. Dated design docs and ADRs stay as written. Placement is ADR-538's.

## Requirements

- **R1** No behaviour change. In `hooks/git-no-ext-diff.sh` only header comment lines change: the
  lines from `set -euo pipefail` to the end are byte-identical. `hooks/hooks.json` is
  byte-identical. Under DC-4 (a), no test file is edited.
- **R2** The hook header's timeout sentence states that a hook stalled in a foreground command
  fails open too, with the mechanism DC-1 picks and the versions DC-2 picks. The words `not
  probed` and `unprobed` no longer appear in the header. Line 10 is unchanged. No ADR, backlog or
  phase reference is added.
- **R3** `docs/contributing/specs/gate.md`, `On a timeout:` paragraph: the "a hook stalled in a
  foreground command was not probed" sentence is gone, and the measured behaviour is recorded per
  DC-1 and DC-2. The paragraph keeps its link to `claude-hook-timeout-probe.md` and adds one to
  this doc. `grep -c 'not probed' docs/contributing/specs/gate.md` prints 0. The `On a crash:`
  paragraph is byte-identical.
- **R4** `BACKLOG.md`: the entry "Probe a Claude Code hook timeout while the hook is stalled in a
  foreground command" is marked delivered in the house format and stays in its section. The
  delivered timeout-probe entry below it (lines 192-201) is unchanged.
- **R5** The `README.md:200-201` corpus counts match the tree at commit time, so `bash
  scripts/readme-drift.sh .` exits 0.
- **R6** `bash scripts/ci.sh` is green after every part. `test/hooks.test.js` passes with no edit.
- **R7** Dated docs are byte-identical: `docs/contributing/design/claude-hook-timeout-probe.md`,
  `docs/contributing/plan/claude-hook-timeout-probe.md`,
  `docs/contributing/design/claude-hook-nonzero-exit-probe.md`, and ADRs 541 and 546-550.
- **R8** No absolute or home-rooted path in any committed file. Probe paths are written as
  `<proj>`, `<hook path>`, `<claude-config-dir>` and `<probe-slug>`.

## Design

Docs-only. Four parts, each a separate commit, in this order. None touches executable code. Part 1
is the README counts: this doc already moved the design-doc count, so the live-tree drift tests
are red until the counts are reset, and every later part gate needs `scripts/ci.sh` green. The
precedent did the same.

### Part 1 — README corpus counts (`README.md:200-201`)

Context block:
- `README.md:200`: `receipts: [62 design docs](docs/contributing/design/), [61 parted plans](docs/contributing/plan/),`
- `README.md:201`: `[550 ADRs](docs/contributing/adr/), and [raw telemetry for 25 runs](…)`
- Guard: `scripts/readme-drift.sh` → `engine/bin/readme-drift.js`, the corpus-count sub-guard,
  run by the live-tree tests `engine/test/readme-drift-main.test.js` and
  `test/readme-drift.test.js`. It reads the counted directory links, not line numbers.
- House commit: `docs(readme): refresh the design, plan and adr corpus counts`.

Change: set `[N design docs]`, `[N parted plans]` and `[N ADRs]` to the tree counts at commit
time. Expected: design docs 62 → 63 (this doc); plans 61 → 62 (this design's plan); ADRs 550 →
550 + the number of ADRs the decisions phase writes. The telemetry run count is not touched: it
counts the runs in `docs/contributing/metrics-baseline.report.json`, which this change does not
refresh.

### Part 2 — hook header (`hooks/git-no-ext-diff.sh:17-21`)

Context block:
- Header comment lines 2-21; `set -euo pipefail` on line 22. Lines 10-21 are the crash-path
  paragraph; lines 17-21 the timeout sentence (ADR-547). Comments only; `shellcheck` (via
  `scripts/static-lints.sh`) reads them as comments.
- Lines 51-54 hold the trap comment and the TERM/HUP traps. They are not touched.
- Test anchors `trap ` and `IN=${IN%` (`test/hooks.test.js:358`, `:391`) match code lines. Every
  new line starts with `# `, so no anchor can land on it.

Today (lines 17-21): quoted under "What the repo records today".

After (DC-1 (b), DC-2 (a)):

```bash
# signal. A run past Claude Code's hook timeout (600 s; hooks.json sets none) fails open
# too, though code here does run: at the deadline Claude Code sends SIGTERM to this hook's
# whole process tree, so a stalled cat, jq, grep or sed dies with it (whatever survives is
# SIGKILLed), then runs the call whatever this hook exits with or prints (2.1.296 with the
# hook in a background wait, 2.1.299 stalled in a foreground command). The TERM and HUP
# traps still deny either signal from any other sender.
```

"Though code here does run" stays true: every child the hook runs dies on TERM, and the hook
blocked in `cat` exits through its crash deny at once under a tree TERM (both measured above), so
its TERM trap runs before any SIGKILL. Under DC-1 (a) the lines read as today with the
parenthetical `(probed … not probed)` deleted and the version written per DC-2. Under DC-2 (b)
the closing parenthetical becomes `(2.1.299)`; under DC-2 (c), `(2.1.296 to 2.1.299)`.

### Part 3 — gate spec (`docs/contributing/specs/gate.md:72-80`)

Context block:
- Claude binding, `On a timeout:` paragraph, lines 72-80, indented two spaces under the
  `git-no-ext-diff.sh` bullet (line 47); blank line 81; `**gate-command**` on line 82.
- `gate.md` is in the living corpus (`scripts/living-corpus.sh`, `test/living-corpus.test.js`),
  so intention-lint parses its frontmatter (`subjects: engine/src/gates.js`,
  `engine/src/guards/**`, both unchanged). `test/source-hygiene.test.js` scans it for the
  technique, VCS-host and home-path token classes; the new prose carries none.

Today (lines 72-80):

```markdown
  On a timeout: Claude Code 2.1.296 sends SIGTERM to a hook that runs past its `timeout`
  (documented default 600 s; `hooks/hooks.json` sets none), then runs the Bash call whatever
  the hook exits with or prints, and the model sees a clean result with no hook event. The
  probe tried both deny channels after the TERM: exit 2 with a stderr reason, and a JSON
  `permissionDecision: "deny"` on stdout. Both were ignored. The probe hook was interrupted in
  a background wait; a hook stalled in a foreground command was not probed. So a timeout fails
  open, and nothing the hook does after the deadline is read. The TERM and HUP traps stay: they
  deny either signal from any other sender. The timeout matrix is in
  [the design doc](../design/claude-hook-timeout-probe.md).
```

After (DC-1 (b), DC-2 (a)):

```markdown
  On a timeout: Claude Code sends SIGTERM to a hook that runs past its `timeout` (documented
  default 600 s; `hooks/hooks.json` sets none), then runs the Bash call whatever the hook exits
  with or prints, and the model sees a clean result with no hook event. On 2.1.296, with the
  hook interrupted in a background wait, the probe tried both deny channels after the TERM:
  exit 2 with a stderr reason, and a JSON `permissionDecision: "deny"` on stdout. Both were
  ignored. On 2.1.299, with the hook stalled in a foreground command, the SIGTERM reached the
  hook's whole process tree, found by parent pid, so a foreground child that dies on TERM
  (`cat`, `jq`, `grep` and `sed` all do) died at the deadline, the TERM trap ran at once, and
  its crash deny was ignored the same way. A tree that survived the TERM was SIGKILLed about
  1.2–1.7 s later. Claude Code did not hang. So a timeout fails open, and nothing the hook does
  after the deadline is read. The TERM and HUP traps stay: they deny either signal from any
  other sender. The timeout matrices are in
  [the background-wait design doc](../design/claude-hook-timeout-probe.md) and
  [the foreground-stall design doc](../design/claude-hook-foreground-stall-probe.md).
```

Under DC-1 (a): today's text with the sentence `The probe hook was interrupted in a background
wait; a hook stalled in a foreground command was not probed.` replaced by `A hook stalled in a
foreground command fails open the same way (2.1.299).`, plus the second link. Under DC-2 (b) or
(c), the two version-scoped sentences merge under one label, `2.1.299` or `2.1.296 to 2.1.299`.

### Part 4 — BACKLOG (`BACKLOG.md:180-188`)

Context block:
- Section `### Open (scoped 2026-10-13 — follow-ups surfaced by the claude-hook-timeout-probe
  run, not yet scheduled)`, line 178. The entry is lines 180-188.
- Format precedent: the delivered entry at lines 192-201: bold title with `— delivered <date>**`,
  `(fix/<slug>).`, one result paragraph, the ADR range in parentheses, then `Design context:` and
  a link.
- Gate: `bash scripts/backlog-lint.sh BACKLOG.md` (section headings only) and intention-lint
  (BACKLOG is in the living corpus).

Replace the entry in place:

```markdown
**Probe a Claude Code hook timeout while the hook is stalled in a foreground command — delivered <date>**
(fix/claude-hook-foreground-stall-probe). The call runs and Claude Code does not hang: at the
deadline Claude Code 2.1.299 sends SIGTERM to the hook's whole process tree (by parent pid, not
by process group), so a foreground `sleep` died, the deferred TERM trap ran and its crash deny was
ignored (2/2), and a tree that survived TERM was SIGKILLed about 1.2–1.7 s later (3/3, timed on
2); the model saw a clean result every time (live `claude -p` probe, 5 haiku turns, a 3 s
`timeout`). Nothing the hook can act on, so the change is document-only: the hook header and the
gate spec drop the "not probed" qualifier and state the tree TERM and the SIGKILL escalation
(ADRs <range>).
Design context: [claude-hook-foreground-stall-probe](docs/contributing/design/claude-hook-foreground-stall-probe.md).
```

`<date>` is the delivery date at commit time. `<range>` is the range of ADRs the decisions phase
writes; with none, the parenthetical is dropped. Under DC-1 (a), the last clause reads `drop the
"not probed" qualifier`.

### Edge behaviour

| Case | Hook result | Claude Code | Evidence |
|---|---|---|---|
| Allow or JSON deny reached inside the timeout | exit 0, as today | runs / denied, as today | nonzero-exit precedent matrix; existing hook tests |
| A crash bash sees, inside the timeout | exit 2 with a `craft git-no-ext-diff:` reason | denied (2.1.296) | nonzero-exit precedent matrix; timeout precedent's exit-2 control |
| TERM or HUP from another sender, inside the timeout | exit 2, `failed (exit 143\|129)`, once a foreground child returns (ADR-541) | denied: the exit-2 contract | `test/hooks.test.js:366` |
| Run past the timeout, hook waiting on a background child | TERM trap at the deadline → crash deny | **runs** (2.1.296); clean result, no hook event | timeout precedent, overrun rows 3/3 and JSON-deny row 1/1 |
| Run past the timeout, hook stalled in a foreground child that dies on TERM (`sleep` live; `cat`, `jq`, `grep`, `sed` exit 143 on TERM) | the child dies with the tree TERM, the TERM trap runs at once → crash deny | **runs** (2.1.299); clean result, no hook event | fg1, fg2 (2/2); the shipped hook blocked in `cat` exits 2 at once under a tree TERM (direct run) |
| Run past the timeout, foreground child that survives TERM | the TERM trap never runs; the tree is SIGKILLed about 1.2–1.7 s after TERM | **runs** (2.1.299); clean result, no hook event | fgi1-3 (3/3); the shipped hook runs no such child |
| A descendant in another process group, or re-parented after the hook exits | TERMed with the tree, then SIGKILLed if it survives | n/a: the shipped hook starts no such process | fgi2-3 (S2 TERMed, then SIGKILLed); fg2 for the after-exit case (n=1, inferred) |
| A process re-parented away before the deadline | not signalled | n/a | detached watcher, every row |
| The `failed (exit 143), call denied` line written at the deadline | on stderr | not in the stream-json output; `--debug` routing not probed | fg1, fg2; timeout precedent |
| Claude Code hang | none observed | `claude -p` exited 0 in 9–10 s on every row | all 5 rows; the 120 s watchdog never fired |

What makes the hook reach the timeout is still unknown. It finishes in milliseconds on every
fixture, and the 600 s window needs a stalled host or a read that never ends.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | How much of the measured mechanism goes into the header's timeout sentence and `gate.md`'s `On a timeout:` paragraph (placement fixed by ADR-538/547) | (a) drop the qualifier only, replacing it with "a stall in a foreground command fails open the same way"; (b) drop it and state the mechanism in both places: SIGTERM to the whole process tree (so the foreground child dies) and SIGKILL for what survives, with `gate.md` adding the by-parent-pid walk and the 1.2–1.7 s bracket (Parts 2-3 as written); (c) as (b) in `gate.md`, but the header gets only (a) | (b) | Today's header says "sends SIGTERM at the deadline" and ADR-541 says the TERM trap waits for the foreground child. Read together, (a) leaves a maintainer inferring the deny lands only when `jq` returns, or that a slow child could hang the session. The tree TERM is what makes the foreground case behave like the background one, and the SIGKILL is what rules out a hang. Both are one clause each. (c) keeps the header shortest, but the header is where a maintainer weighing a self-deadline or a trap change reads first, and the SIGKILL fact bounds that fix (a trap that ignored TERM still dies). The pgid detail and the delay bracket stay out of the header: no hook code depends on them. |
| DC-2 | How the version is labelled now that two versions were probed (background rows on 2.1.296, foreground rows on 2.1.299) | (a) per claim: 2.1.296 on the background-wait claims (both deny channels), 2.1.299 on the foreground and tree-signal claims; (b) one label, the latest: 2.1.299; (c) one range label: 2.1.296 to 2.1.299 | (a) | The JSON-deny row ran on 2.1.296 only; (b) would put a version on it that never ran it. (c) reads as "measured on every release in between", and neither probe re-ran the other's rows on its own version. (a) costs a few words and keeps each claim on the version that measured it, which is what ADR-546's "a new live probe before any doc says so" asks of a vendor-behaviour claim. Line 10 (crash path, 2.1.296) is not re-labelled under any option: its rows were not re-run. |
| DC-3 | How this design's ADR relates to ADR-546 (and ADR-541) | (a) the new ADR refines ADR-546 (`**Supersedes/Refines:** refines ADR-546` on its Design line, no `supersedes` frontmatter); ADRs 541 and 546 not edited; (b) frontmatter `supersedes: [{adr: "546", scope: "foreground stall unprobed"}]`; (c) no link | (a) | ADR-546 stands whole: document-only, traps stay. (b) triggers adr-lint C1, which requires ADR-546's Status to read `superseded by ADR-<M>` (an edit to a dated ADR, against R7, and a wrong label), and C2 then requires `Superseded from ADR-546` and `Carried forward from ADR-546` lines. (c) leaves a reader of ADR-546 with no pointer to the foreground answer. (a) is the form ADR-550 chose for ADR-546 → ADR-541. ADR-541 needs no link: its foreground-deferral consequence still holds for a pid-only sender. |
| DC-4 | A test that pins anything new | (a) none; (b) a `test/hooks.test.js` test that sends TERM to the hook's process tree (pid plus `pgrep -P` descendants) while `cat` blocks on stdin, and asserts exit 2 with `failed (exit 143)` before stdin is ended; (c) a wording test on the header and `gate.md` | (a) | Same shape and reason as ADR-549: what matters, Claude Code ignoring the hook after the deadline, only a paid live run shows. (b) does pin a hook-side fact the existing pid-only test does not (the trap fires at once when the child dies), but its outcome is the deny Claude Code ignores, so it guards nothing an operator relies on, and it adds a process-tree walk to the suite. (c) pins wording and breaks on any rephrase. |

Settled already, so not candidates: the document-only outcome (no proven fail-open the hook can act
on; user rule, ADR-546), keeping the TERM and HUP traps (ADR-541, ADR-546), no `timeout` in
`hooks/hooks.json` (ADR-548), placement in the header plus `gate.md` (ADR-538, ADR-547), and
leaving dated design docs and ADRs as written.

## Test strategy

No new tests under DC-4 (a). Every change is prose, so the gates are the existing suites and lints.

- Part gate, after each part: `bash scripts/ci.sh > <tmp>/ci.log 2>&1; echo $?`, then read only
  the summary lines and any failure. It runs the engine suite (including
  `engine/test/readme-drift-main.test.js`), then `test/hooks.test.js`, `test/readme-drift.test.js`,
  `test/source-hygiene.test.js` and `test/living-corpus.test.js`, intention-lint over `gate.md`
  and `BACKLOG.md`, `scripts/static-lints.sh` (`shellcheck` over `hooks/*.sh`, `backlog-lint`,
  `design-lint` over every design doc), and adr-lint over the whole ADR corpus.
- Part 1: `bash scripts/readme-drift.sh .` exits 0.
- Part 2: `diff <(git show main:hooks/git-no-ext-diff.sh | sed -n '/^set -euo pipefail$/,$p')
  <(sed -n '/^set -euo pipefail$/,$p' hooks/git-no-ext-diff.sh)` prints nothing (R1). `git diff
  --no-ext-diff main -- hooks/git-no-ext-diff.sh` shows `#` lines only, all in the timeout
  sentence that starts on line 17.
  `grep -c 'not probed' hooks/git-no-ext-diff.sh` prints 0. `node --test test/hooks.test.js`
  passes unedited.
- Part 3: `grep -c 'not probed' docs/contributing/specs/gate.md` prints 0 (today the only hit is
  line 77). Both design-doc links resolve: `test -f
  docs/contributing/design/claude-hook-timeout-probe.md` and `test -f
  docs/contributing/design/claude-hook-foreground-stall-probe.md`. `git diff --no-ext-diff main
  -- docs/contributing/specs/gate.md` touches only the `On a timeout:` paragraph.
- Part 4: `bash scripts/backlog-lint.sh BACKLOG.md` exits 0; `git diff --no-ext-diff main --
  BACKLOG.md` touches only lines 180-188.
- R7: `git diff --no-ext-diff main --stat -- docs/contributing/design/claude-hook-timeout-probe.md
  docs/contributing/plan/claude-hook-timeout-probe.md
  docs/contributing/design/claude-hook-nonzero-exit-probe.md docs/contributing/adr/541-*.md
  docs/contributing/adr/54[6-9]-*.md docs/contributing/adr/550-*.md` is empty.
- R8: `git grep -n -e '/Users/' -e '/home/'` over the changed files finds nothing.
- This doc: `bash scripts/design-lint.sh docs/contributing/design/claude-hook-foreground-stall-probe.md`.

What turns red, and on which change:
- `engine/test/readme-drift-main.test.js` and `test/readme-drift.test.js`: a count left stale
  (red from this doc's commit until Part 1).
- `test/hooks.test.js` `withHookCopy` tests: a header line that starts with `trap ` or `IN=${IN%`
  (impossible for a `# ` comment line).
- `test/source-hygiene.test.js`: a home-rooted path or a banned token in `gate.md`.
- adr-lint: a `supersedes` on ADR-546 without its Status flip (DC-3 (b) only).

Not run, and why: no further live `claude -p` turn (paid; the matrix is pinned and this change
adds no hook behaviour); no re-run of the 2.1.296 rows on 2.1.299 (DC-2 (a) labels each claim with
the version that measured it instead).

## Out of scope

- Any hook code change, including the TERM and HUP traps (R1; ADR-546).
- `hooks/hooks.json` and its `timeout` (ADR-548).
- Editing dated docs: the timeout-probe design and plan, the nonzero-exit-probe design, ADRs 541
  and 546-550 (R7), and the delivered timeout-probe BACKLOG entry.
- The exact SIGKILL escalation delay (bracketed only, 1.23–1.69 s) and whether the SIGKILL walks
  the tree the same way as the TERM. Neither changes the verdict. To prove: the fgimmune row with
  a 10 ms `ps` poll from +2.5 s to +5 s.
- Whether Claude Code waits for the whole hook tree to end before running the call, or only for
  the hook (inferred from MARKER timing, n=2 against n=2). To prove: the fg2 row with the
  sharpened sentinel and a 0.25 s `ps` poll, comparing MARKER's mtime with the moment S2 dies.
- Re-running the 2.1.296 rows (both deny channels, the nonzero-exit matrix) on 2.1.299. To prove:
  the precedent harness unchanged on the current version.
- A self-deadline in the hook, denying with exit 2 before Claude Code's timeout fires. Outside the
  document-only outcome; to prove it is worth having: show a real hook run that gets near 600 s.
- The plugin "mods" `tool.call` `.catch` fail-closed handler (DOC only). To prove: check it exists
  in the installed Claude Code version, then run an overrun row through a mod guard and check
  MARKER.
- Where the `call denied` stderr line goes after a timeout (`--debug`, transcript). To prove: the
  fg1 row with `--debug` and a grep for `git-no-ext-diff`.
- `hooks/reorient-after-compact.sh` and `hooks/steer-compact-summary.sh`: by design they never
  block.
