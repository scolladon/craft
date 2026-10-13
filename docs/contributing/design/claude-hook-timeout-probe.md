# Design — Claude Code binding: a git guard hook that outlives its timeout fails open

> Brief: probe what Claude Code does when a PreToolUse hook runs past its `timeout`, and write it
> into the hook header and the gate spec's residual list. Result (probed, matrix below): Claude
> Code 2.1.296 sends SIGTERM at the deadline, then runs the Bash call whatever the hook exits with
> or prints, and the model sees a clean result. Neither deny channel (exit 2 with a stderr reason,
> a JSON `permissionDecision: "deny"` on stdout) is read after the timeout, so nothing the hook
> does once the deadline passes closes it. This change is document-only: it corrects the
> "unprobed" residual line in `hooks/git-no-ext-diff.sh` and `docs/contributing/specs/gate.md`,
> and closes the BACKLOG entry
> "Probe what Claude Code does when a PreToolUse hook times out".
> Status: draft → self-reviewed ×3

## Context

### What Claude Code does when a PreToolUse hook times out (pinned, Claude Code 2.1.296)

Method: `claude -p --model haiku --setting-sources project --strict-mcp-config
--no-session-persistence --allowedTools "Bash(touch:*)" --output-format stream-json --verbose`,
run with `ANTHROPIC_API_KEY` and `CLAUDECODE` unset, from a mktemp project `<proj>` under
`$TMPDIR`. The project's `.claude/settings.json` registers ONE PreToolUse/Bash command hook with
`"timeout": 3` (seconds). The hook is a copy of `hooks/git-no-ext-diff.sh` with these lines
inserted right after its `trap 'exit "$SIGHUP_EXIT_STATUS"' HUP` line:

- `touch <proj>/HOOK-RAN`, and a start line (epoch, pid, ppid, `ps` of the parent) appended to
  `<proj>/SIGNAL-LOG`;
- TERM and HUP traps re-installed so each first appends `TERM <epoch>` / `HUP <epoch>` to the log,
  then does what the shipped trap does (`exit "$SIGTERM_EXIT_STATUS"` / `exit "$SIGHUP_EXIT_STATUS"`);
- an INT trap that logs, then re-raises INT with the default action;
- `sleep <n> & wait $!`, so a trapped signal interrupts the wait at once instead of waiting for a
  foreground child (B13 in [claude-hook-nonzero-exit-probe](claude-hook-nonzero-exit-probe.md));
- the row's tail line.

The EXIT trap was wrapped to log `EXIT rc=<status> <epoch>` before calling `deny_on_crash`. A
SIGKILL would leave a start line and no TERM or EXIT line. The prompt asks for exactly one Bash
call, `touch <proj>/MARKER`, with no retry. If MARKER exists, the call ran.

Each copy was first run directly, fed `{"tool_input":{"command":"touch x"}}`. The overrun copy,
sent TERM by `pkill` at 1 s, logged `TERM` and `EXIT rc=143`, wrote `craft git-no-ext-diff: failed
(exit 143), call denied` on stderr and exited 2. The allow copy logged `EXIT rc=0` and exited 0.
The deny copy wrote `probe-deny` and the craft reason on stderr and exited 2.

| Row | Wait | HOOK-RAN | Signal log | Hook exit | MARKER | What the model sees (stream-json `tool_result`) | Verdict |
|---|---|---|---|---|---|---|---|
| allow (control) | 0 s | yes | `EXIT rc=0` | 0 | present | `(Bash completed with no output)`, `is_error` false | runs |
| exit 2 (control): `echo probe-deny >&2; exit 2` | 0 s | yes | `EXIT rc=2` | 2 | absent | `PreToolUse:Bash hook error: [<hook path>]: probe-deny` + newline + `craft git-no-ext-diff: failed (exit 2), call denied`, `is_error` true | **denied** |
| overrun (3/3 repeats) | 10 s | yes | `TERM` exactly 3 s after the start line, then `EXIT rc=143` in the same second; no HUP, no INT, no later line | 2 (TERM trap → crash deny, stderr reason written) | present, about 2 s after `TERM` | `(Bash completed with no output)`, `is_error` false; no hook event in the stream (event types: `system:init`, `assistant` ×2, `user`, `rate_limit_event`, `result`) | **fail-open** |
| overrun, TERM trap prints `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"probe-json-deny-on-term"}}` on stdout, sets `verdict_reached=1`, exits 0 (1/1) | 10 s | yes | `TERM` at +3 s, `EXIT rc=0` | 0, JSON deny on stdout | present | clean result, `is_error` false | **fail-open** |

At the hook's timeout Claude Code 2.1.296 sends SIGTERM, then runs the Bash call whatever the hook
exits with or prints, and the model sees a clean result. Both deny channels the hook has were
tried: exit 2 with a stderr reason (3/3) and the JSON deny on stdout (1/1). Both were ignored.

Also observed, on every row:
- The hook's parent is the `claude` process itself (`ppid` = claude, no `sh -c` in between), and
  the hook leads its own process group (`pgid` = hook pid). This is consistent with a direct spawn
  and with a `/bin/sh -c` that execs its only command. It does not contradict the comment on
  `expandHookCommand` in `test/hooks.test.js`, which expands a plugin command through `sh -c`.
- No probe process was alive after the wait. The background `sleep` would have ended by then on
  its own, so this does not show whether Claude Code signals the process group or only the hook
  pid.

Not observed: whether Claude Code escalates to SIGKILL when a hook ignores TERM. The hook exited
on TERM in the same second, so an escalation would not show. Not probed: TERM delivered while the
hook waits on a FOREGROUND child, where the TERM trap waits until that child exits (B13). Inferred,
not measured: the verdict is the same, because the timeout rows show the exit status and stdout
are both ignored after the deadline. It could differ only if Claude Code never ran the call while
the hook lived on, which nothing here shows.

Environment: Claude Code 2.1.296, macOS 27.0.1, `/bin/bash` 3.2.57. User settings, plugins and
MCP servers were not loaded. Residue: one empty `<claude-config-dir>/projects/<probe-slug>/memory`
directory per run, removed after each run; the mktemp projects were removed. Cost: 6 haiku turns,
about $0.0105 in total.

### What the vendor docs say (DOC, fetched 2026-10-13, version not stated)

- Claude Code cancels a `command` hook after 600 seconds unless the hook entry sets `timeout`, in
  seconds. The fetched text says this about SessionStart hooks in a hosted environment, and the
  Agent SDK page gives 600 s as the default "for most events". This design takes 600 s as the
  PreToolUse default. It is documented, not measured: the probe set its own 3 s `timeout`.
- The Agent SDK hooks page says a PreToolUse **callback** that times out does not run the tool
  call, and Claude receives a tool result saying the hook did not respond. That page covers SDK
  callbacks (`HookMatcher`), not settings `command` hooks. For a command hook the matrix above
  shows the opposite: the call runs. The fetched docs say nothing about a command hook's timeout
  beyond the 600 s default.
- The plugin "mods" event API documents a `.catch` handler on a `tool.call` hook that answers
  `{ deny }` when the guard throws or times out. That is a different hook surface from the
  `command` hook craft registers, and it was not probed (Out of scope).

### What the repo records today

- `hooks/git-no-ext-diff.sh:15-17`, the end of the crash-path header paragraph:
  `Still fails open, because no code here runs to catch it: /bin/bash missing, this file missing or
  not executable, SIGKILL or any other untrapped signal (which one Claude Code's hook timeout sends
  is unprobed).` The parenthetical is now answered: the timeout sends TERM, which the hook traps.
  Yet the call still runs, for a reason the sentence does not name. The hook's code does run; its
  verdict is simply not read.
- `docs/contributing/specs/gate.md:67-71`, the end of the Claude binding's "On a crash:"
  paragraph: `…and SIGKILL or any other untrapped signal (which one Claude Code's hook timeout
  sends is not probed). The probe matrix is in [the design doc](../design/claude-hook-nonzero-exit-probe.md).`
  Same correction.
- `hooks/hooks.json:7` registers the hook with no `timeout` field, so the documented 600 s default
  applies. `test/hooks.test.js:546-557` pins the whole PreToolUse array with `deepStrictEqual`,
  so adding a `timeout` there turns that test red until it is updated.
- `hooks/git-no-ext-diff.sh:47-50`: the TERM and HUP traps (`exit "$SIGTERM_EXIT_STATUS"`,
  `exit "$SIGHUP_EXIT_STATUS"`), pinned by the two
  `Given a ${signal} while the hook reads stdin…` tests (`test/hooks.test.js:366`). They still deny
  a TERM or HUP from any sender other than the timeout: the hook exits 2, the contract the
  precedent matrix pins as a deny.
- `BACKLOG.md:180-186`: the open entry this change closes.
- `README.md:200-201`: `[61 design docs]`, `[60 parted plans]`, `[545 ADRs]`. `bash
  scripts/readme-drift.sh .` checks these counts against the tree. Two live-tree tests run the
  same guard under `scripts/ci.sh`: `engine/test/readme-drift-main.test.js:304` (the engine
  suite, which `ci.sh` runs first) and `test/readme-drift.test.js`. It exits 0 on `main`. This
  doc alone makes it report `docs/contributing/design/ claims 61, tree holds 62`, and
  `scripts/ci.sh` then stops at the engine suite (measured on this branch with the doc in place:
  1 failing test, `readme-drift-main.test.js:304`, `1 !== 0`).
- No test or script reads the header prose or the gate.md residual text. A grep of `test/` and
  `scripts/` for `untrapped`, `unprobed`, `not probed` and `timeout sends` finds nothing. The only
  `test/hooks.test.js` anchors on the hook's lines are `trap ` (line 358) and `IN=${IN%`
  (line 391), and both match code lines, never `#` comment lines.

### Prior decisions this design follows

- ADR-538: the hook's crash contract and its residual are written in the hook header and the
  `gate.md` Claude binding, with the matrix linked from `gate.md`. The README carries only the
  `jq` requirement. The timeout residual goes to the same two places.
- ADR-541: the TERM and HUP traps hand their status to the crash deny. Its "Carried forward" line
  says which signal the timeout sends "stays unprobed". This probe answers that line. The traps
  stay as they are.
- ADR-537 (superseded by ADR-541) and ADR-518: a residual the hook cannot close is documented
  for an operator, not hidden.
- ADR-544: a probe that ends in no behaviour change adds no test that pins prose or host behaviour.
- Dated design docs are a ledger. `claude-hook-nonzero-exit-probe.md` keeps its "Not probed: …
  timeout" sentence and its Out of scope line as written. This doc supersedes them as the record.

### Settled before this design (user decisions, not re-opened)

- Change code only on a proven fail-open the hook can act on. The user approved one extra turn to
  test the only hook-side fix candidate: a JSON deny printed from the TERM trap. It missed (row 4),
  so the outcome is document-only. The timeout behaviour goes into the hook header and the gate
  spec's residual list.
- The TERM and HUP traps stay as they are. They still deny those signals from any other sender.
- Dated design docs stay as written.

## Requirements

- **R1** No behaviour change. In `hooks/git-no-ext-diff.sh`, only header comment lines change:
  the lines from `set -euo pipefail` (line 18) to the end are byte-identical. Under DC-2 (a),
  `hooks/hooks.json` is byte-identical too. Under DC-3 (a), no test file is edited.
- **R2** The hook header states that a run past Claude Code's hook timeout fails open, and why:
  Claude Code 2.1.296 sends SIGTERM at the deadline and runs the call whatever the hook then exits
  with or prints. It states that the TERM and HUP traps still deny either signal from any other
  sender. The words `unprobed` and `not probed` no longer appear in the header. It carries no ADR,
  backlog or phase reference.
- **R3** `docs/contributing/specs/gate.md`, Claude binding: the "which one … is not probed"
  parenthetical is removed. The timeout behaviour is recorded: TERM at the deadline, exit status
  and stdout both ignored, a clean result for the model, and (under DC-2 (a)) the 600 s
  documented default with `hooks/hooks.json` setting no `timeout`. The paragraph links this doc
  for the timeout matrix and keeps its existing link to `claude-hook-nonzero-exit-probe.md`.
- **R4** `BACKLOG.md`: the entry "Probe what Claude Code does when a PreToolUse hook times out" is
  marked delivered in the house format and stays in its section, as its delivered neighbours did.
- **R5** The `README.md:200-201` corpus counts match the tree at commit time, so `bash
  scripts/readme-drift.sh .` exits 0.
- **R6** `bash scripts/ci.sh` is green. The tests in `test/hooks.test.js` pass with no edit.
- **R7** Dated docs are byte-identical: `docs/contributing/design/claude-hook-nonzero-exit-probe.md`,
  and ADRs 537 and 541 under DC-4 (a).
- **R8** No absolute or home-rooted path in any committed file. Probe paths are written as
  `<proj>`, `<hook path>`, `<claude-config-dir>` and `<probe-slug>`.

## Design

Docs-only. Four parts, each a separate commit, in this order. None touches executable code. The
brief listed the README counts last, but Part 1 is the README counts. This doc already moved the
design-doc count, so the two live-tree drift tests are red until the counts are reset, and every
later part gate needs `scripts/ci.sh` green. The cursor precedent did the same.

### Part 1 — README corpus counts (`README.md:200-201`)

Context block:
- `README.md:200`: `receipts: [61 design docs](docs/contributing/design/), [60 parted plans](docs/contributing/plan/),`
- `README.md:201`: `[545 ADRs](docs/contributing/adr/), and [raw telemetry for 25 runs](…)`
- Guard: `scripts/readme-drift.sh` → `engine/bin/readme-drift.js`, the corpus-count sub-guard,
  run by the live-tree tests `engine/test/readme-drift-main.test.js:304` and
  `test/readme-drift.test.js`. It reads the counted directory links, not line numbers.
- House commit: `docs(readme): refresh the design, plan and adr corpus counts`.

Change: set `[N design docs]`, `[N parted plans]` and `[N ADRs]` to the tree counts at commit
time. Expected: design docs 61 → 62 (this doc); plans 60 → 61 (this design's plan); ADRs 545 →
545 + the number of ADRs the decisions phase writes. The telemetry run count is not touched: it
counts the runs in `docs/contributing/metrics-baseline.report.json`, which this change does not
refresh.

### Part 2 — hook header (`hooks/git-no-ext-diff.sh:15-17`)

Context block:
- Header comment lines 2-17; `set -euo pipefail` on line 18. Lines 10-17 are the crash-path
  paragraph. Comments only; `shellcheck` (via `scripts/static-lints.sh`) reads them as comments.
- Lines 47-50 hold the trap comment and the TERM/HUP traps. They are not touched.
- Test anchors `trap ` and `IN=${IN%` (`test/hooks.test.js:358`, `:391`) match code lines. Every
  new line starts with `# `, so no anchor can land on it.

Today (lines 15-17):

```bash
# TERM and HUP deny the same way. Still fails open, because no code here runs to catch it:
# /bin/bash missing, this file missing or not executable, SIGKILL or any other untrapped
# signal (which one Claude Code's hook timeout sends is unprobed).
```

After (DC-1 (a), DC-2 (a)):

```bash
# TERM and HUP deny the same way. Still fails open, because no code here runs to catch it:
# /bin/bash missing, this file missing or not executable, SIGKILL or any other untrapped
# signal. A run past Claude Code's hook timeout (600 s; hooks.json sets none) fails open
# too, though code here does run: Claude Code (2.1.296) sends SIGTERM at the deadline, then
# runs the call whatever this hook exits with or prints. The TERM and HUP traps still deny
# either signal from any other sender.
```

Under DC-2 (b) or (c), `600 s; hooks.json sets none` becomes `the hooks.json timeout`. The
seconds value is kept in one place, `hooks.json`, so the comment cannot drift from it.

### Part 3 — gate spec (`docs/contributing/specs/gate.md:67-71`)

Context block:
- Claude binding, `On a crash:` paragraph, lines 58-71, indented two spaces under the
  `git-no-ext-diff.sh` bullet (line 47). The next block is the `**gate-command**` paragraph on
  line 73.
- `gate.md` is in the living corpus (`scripts/living-corpus.sh`, `test/living-corpus.test.js:30`),
  so intention-lint parses its frontmatter (`subjects: engine/src/gates.js`,
  `engine/src/guards/**`, both unchanged). `test/source-hygiene.test.js` scans it for the
  technique, VCS-host and home-path token classes; the new prose carries none.

Today (lines 67-71):

```markdown
  path. With `jq` missing from `PATH`, every Bash call is denied. Still fail-open, because no
  code in the hook can catch them: `/bin/bash` missing, the hook file missing or not
  executable, and SIGKILL or any other untrapped signal (which one Claude Code's hook timeout
  sends is not probed). The probe matrix is in
  [the design doc](../design/claude-hook-nonzero-exit-probe.md).
```

After (DC-1 (a), DC-2 (a)): the parenthetical is removed, and a new paragraph follows at the same
indent.

```markdown
  path. With `jq` missing from `PATH`, every Bash call is denied. Still fail-open, because no
  code in the hook can catch them: `/bin/bash` missing, the hook file missing or not
  executable, and SIGKILL or any other untrapped signal. The probe matrix is in
  [the design doc](../design/claude-hook-nonzero-exit-probe.md).

  On a timeout: Claude Code sends SIGTERM to a hook that runs past its `timeout` (documented
  default 600 s; `hooks/hooks.json` sets none). Claude Code 2.1.296 then runs the Bash call
  whatever the hook exits with or prints, and the model sees a clean result with no hook event.
  The probe tried both deny channels after the TERM: exit 2 with a stderr reason, and a JSON
  `permissionDecision: "deny"` on stdout. Both were ignored. So a timeout fails open, and
  nothing the hook does after the deadline is read. The TERM and HUP traps stay: they deny
  either signal from any other sender. The timeout matrix is in
  [the design doc](../design/claude-hook-timeout-probe.md).
```

Under DC-2 (b) or (c), `(documented default 600 s; hooks/hooks.json sets none)` becomes
`(hooks/hooks.json sets <n> s)`.

### Part 4 — BACKLOG (`BACKLOG.md:180-186`)

Context block:
- Section `### Open (scoped 2026-10-13 — follow-ups surfaced by the claude-hook-nonzero-exit-probe
  run, not yet scheduled)`, line 178. The entry is lines 180-186.
- Format precedent: the two `— delivered 2026-10-13**` entries at lines 190-198 and 200-210:
  bold title with the delivery mark, `(fix/<slug>).`, one result paragraph, the ADR range in
  parentheses, then `Design context:` and a link.
- Gate: `bash scripts/backlog-lint.sh BACKLOG.md` (section headings only) and intention-lint
  (BACKLOG is in the living corpus).

Replace the entry in place:

```markdown
**Probe what Claude Code does when a PreToolUse hook times out — delivered <date>**
(fix/claude-hook-timeout-probe). At a hook's `timeout`, Claude Code 2.1.296 sends SIGTERM, then
runs the Bash call whatever the hook exits with or prints, and the model sees a clean result: the
TERM trap's exit 2 with its stderr reason (3/3) and a JSON deny printed from the TERM trap (1/1)
were both ignored (live `claude -p` probe, 6 haiku turns, a 3 s `timeout`). Nothing the hook does
after the deadline is read, so the change is document-only: the hook header and the gate spec now
list the timeout as fail-open, and the TERM and HUP traps stay, denying either signal from any
other sender.
`hooks/hooks.json` sets no `timeout`, so the documented 600 s default applies (ADRs <range>).
Design context: [claude-hook-timeout-probe](docs/contributing/design/claude-hook-timeout-probe.md).
```

`<date>` is the delivery date at commit time. `<range>` is the range of ADRs the decisions phase
writes; with none, the parenthetical is dropped. Under DC-2 (b) or (c), the `hooks/hooks.json`
sentence names the value set instead.

### Edge behaviour

| Case | Hook result | Claude Code 2.1.296 | Evidence |
|---|---|---|---|
| Allow or JSON deny reached inside the timeout | exit 0, as today | runs / denied, as today | precedent matrix; existing hook tests |
| A crash bash sees, inside the timeout | exit 2 with a `craft git-no-ext-diff:` reason | denied | precedent matrix (exit-2 row); this probe's exit-2 control |
| TERM or HUP from another sender, inside the timeout | exit 2, `failed (exit 143\|129)` | denied: the exit-2 contract | `test/hooks.test.js:366`; precedent matrix |
| Run past the timeout, hook waiting on a background child | TERM trap at the deadline → exit 2, reason on stderr | **runs**; clean result, no hook event | overrun row, 3/3 |
| Same, TERM trap prints the JSON deny and exits 0 | exit 0, JSON deny on stdout | **runs** | JSON-deny row, 1/1 |
| Run past the timeout, hook waiting on a foreground child (`cat`, `jq`, `grep`, `sed`) | TERM trap waits until that child exits (B13) | runs: inferred, because both channels are ignored after the deadline (whether Claude Code waits for the hook to exit first is not shown) | not probed |
| Hook ignores TERM | n/a: the shipped hook traps TERM and exits | SIGKILL escalation not observed | not observed |
| The `failed (exit 143), call denied` line written at the deadline | on stderr | not in the stream-json output, so the model never reads it; whether it reaches `--debug` output was not probed | overrun row |

What makes the hook reach the timeout is unknown. It finishes in milliseconds on every fixture.
The 600 s window needs a stalled host or a read that never ends. Nothing here shows either one
happens.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | How the timeout residual is worded and placed in the header and `gate.md` (placement is fixed by ADR-538) | (a) its own sentence in the header and its own `On a timeout:` paragraph in `gate.md`, separate from the "no code here runs to catch it" list (Parts 2-3 as written); (b) one more item in the existing residual list in both places, e.g. "…any other untrapped signal, or a run past the hook timeout (SIGTERM, then the call runs whatever the hook returns)"; (c) delete the parenthetical in both places and let the BACKLOG entry and this doc carry the behaviour | (a) | The existing list is "no code here runs to catch it", and the timeout is the opposite case: the TERM trap runs and denies, and Claude Code ignores the deny. (b) puts it under a sentence that misstates the mechanism, which invites a future "fix" through the TERM trap, the one route this probe ruled out. (c) leaves the operator docs silent on a proven fail-open, against ADR-538. |
| DC-2 | An explicit `timeout` on the hook's `hooks/hooks.json` entry | (a) none: keep the documented 600 s default; (b) `"timeout": 600`, the default made explicit; (c) a short value (for example 30) to bound how long a hung hook stalls a Bash call | (a) | No value closes the fail-open; a value only sets when it happens. (c) turns a slow but correct deny (a loaded host) into a fail-open sooner, and no stall is shown. (b) pins against a change to the default that nobody has observed, and it costs an edit to the `deepStrictEqual` pin at `test/hooks.test.js:546-557`. (a) keeps R1 (hooks.json byte-identical) and the same widest window as (b), with no edit. |
| DC-3 | A test that pins the new prose or the timeout behaviour | (a) none; (b) a `test/hooks.test.js` test that asserts the header and `gate.md` name the timeout as fail-open; (c) a hook test that sends TERM to a hook waiting on a background child and asserts exit 2 | (a) | No behaviour changes, and ADR-544 set the precedent: no pin for a probe that ends document-only. (b) pins wording, which breaks on any rephrase and proves nothing about Claude Code. (c) re-pins what the existing TERM test (`test/hooks.test.js:366`) already covers, and it cannot reach the part that matters, which is Claude Code ignoring the exit after the deadline (paid, live only). |
| DC-4 | How this design's ADR relates to ADR-541's "Carried forward" line ("which signal Claude Code's hook timeout sends stays unprobed") | (a) the new ADR refines ADR-541 (`**Supersedes/Refines:** refines ADR-541` on its Design line, no `supersedes` frontmatter), and ADR-541 is not edited; (b) frontmatter `supersedes: [{adr: "541", scope: "timeout signal unprobed"}]`; (c) no link between them | (a) | (b) triggers adr-lint C1, which requires ADR-541's Status to read `superseded by ADR-<M>`. That mislabels a decision whose TERM and HUP traps all stand, and C2 then requires `Superseded from` / `Carried forward` lines in the new ADR. (The C3 citation sweep would pass: no live-tier file cites ADR-541 today.) (c) leaves a reader of ADR-541 at "unprobed" with no pointer. (a) matches the house "refines" form (for example "refines ADR-485") and keeps ADRs as a dated ledger, like the design docs. |

Settled already, so not candidates: whether to change code (the user's rule; the only hook-side
candidate, a JSON deny from the TERM trap, missed live), keeping the TERM and HUP traps (user
decision; ADR-541), where the contract is written (ADR-538: header plus `gate.md`, README only for
`jq`), and leaving dated design docs as written.

## Test strategy

No new tests under DC-3 (a). Every change is prose, so the gates are the existing suites and
lints.

- Part gate, after each part: `bash scripts/ci.sh > <tmp>/ci.log 2>&1; echo $?`, then read only
  the summary lines and any failure. It runs the engine suite (including
  `engine/test/readme-drift-main.test.js`), then `test/hooks.test.js`, `test/readme-drift.test.js`,
  `test/source-hygiene.test.js` and `test/living-corpus.test.js` (the `process` suite),
  intention-lint over `gate.md` and `BACKLOG.md`, `scripts/static-lints.sh` (`shellcheck` over
  `hooks/*.sh`, `backlog-lint`, `design-lint` over every design doc), and adr-lint over the
  whole ADR corpus.
- Part 1: `bash scripts/readme-drift.sh .` exits 0. Today, with this doc committed, it reports
  `docs/contributing/design/ claims 61, tree holds 62`.
- Part 2: `diff <(git show main:hooks/git-no-ext-diff.sh | sed -n '/^set -euo pipefail$/,$p')
  <(sed -n '/^set -euo pipefail$/,$p' hooks/git-no-ext-diff.sh)` prints nothing (R1). `git diff
  --no-ext-diff main -- hooks/git-no-ext-diff.sh` shows `#` lines only. `grep -c 'unprobed'
  hooks/git-no-ext-diff.sh` prints 0. `node --test test/hooks.test.js` passes unedited.
- Part 3: `grep -c 'not probed' docs/contributing/specs/gate.md` prints 0 (today the only hit
  in the file is line 70).
  Both design-doc links resolve: `test -f docs/contributing/design/claude-hook-timeout-probe.md`
  and `test -f docs/contributing/design/claude-hook-nonzero-exit-probe.md`.
- Part 4: `bash scripts/backlog-lint.sh BACKLOG.md` exits 0.
- R7: `git diff --no-ext-diff main --stat -- docs/contributing/design/claude-hook-nonzero-exit-probe.md
  docs/contributing/adr/537-*.md docs/contributing/adr/541-*.md` is empty.
- This doc: `bash scripts/design-lint.sh docs/contributing/design/claude-hook-timeout-probe.md`.

What turns red, and on which change:
- `engine/test/readme-drift-main.test.js:304` and `test/readme-drift.test.js`: a count left
  stale (red from this doc's commit until Part 1).
- `test/hooks.test.js:546-557`: any edit to the PreToolUse entry in `hooks/hooks.json` (only under
  DC-2 (b) or (c), which then edits the pin in the same part).
- `test/hooks.test.js` `withHookCopy` tests: a header line that starts with `trap ` or `IN=${IN%`
  (impossible for a `# ` comment line).
- `test/source-hygiene.test.js`: a home-rooted path or a banned token in `gate.md`.
- adr-lint: a `supersedes` on ADR-541 without its Status flip (DC-4 (b) only).

Not run, and why: no further live `claude -p` turn (paid; the matrix is pinned and this change
adds no hook behaviour); no repeat of the 1/1 JSON-deny row (it agrees with the 3/3 overrun rows:
after the deadline, nothing the hook returns is read).

## Out of scope

- Any hook code change, including the TERM and HUP traps (user decision; R1).
- `hooks/hooks.json` under DC-2 (a).
- Editing dated docs: `claude-hook-nonzero-exit-probe.md` and ADRs 537 and 541 (R7).
- Whether Claude Code escalates to SIGKILL, and whether it signals the process group or only the
  hook pid. Neither changes the verdict. To prove: a hook copy that ignores TERM and logs every
  second, plus a `ps -g <pgid>` snapshot at the deadline.
- TERM at the deadline while the hook waits on a foreground child. To prove: the overrun row with
  `sleep <n>` in the foreground, then check MARKER.
- A self-deadline in the hook, which would deny with exit 2 before Claude Code's timeout fires.
  It is outside the user's document-only outcome, and it would have to kill a foreground child
  first (B13). To prove it is worth having: show a real hook run that gets near 600 s.
- The plugin "mods" `tool.call` `.catch` fail-closed handler (DOC only). To prove: check it exists
  in the installed Claude Code version, then run the overrun row through a mod guard and check
  MARKER.
- Where the `call denied` stderr line goes after a timeout (`--debug`, transcript). To prove: the
  overrun row with `--debug` and a grep for `git-no-ext-diff`.
- The Agent SDK callback timeout (DOC: the tool call does not run). craft registers no SDK
  callbacks.
- `hooks/reorient-after-compact.sh` and `hooks/steer-compact-summary.sh`: by design they never
  block.
