# Design — cursor binding: a crashing guard hook is blocked by `failClosed`

> Brief: probe whether `adapters/cursor/hooks/craft-guard.js` fails open on a crash. Run the codex
> static-import fixture against it, pin Cursor's hook exit-status matrix live, and harden only on a
> proven fail-open. Result: the guard has the same static-import gap as the codex guard (exit 1, no
> stdout), but with `failClosed: true` Cursor blocks every crash class it can see. No fail-open is
> proven, so the guard is not hardened. This change records the matrix in the POC record and closes
> the BACKLOG entry "Probe whether the cursor guard fails open on a crash".
> Status: draft → self-reviewed ×3

## Context

### What Cursor does with a hook's exit (SOURCE, cursor-agent 2026.07.20-8cc9c0b)

Read from the shipped bundle `~/.local/share/cursor-agent/versions/2026.07.20-8cc9c0b/3143.index.js`,
`executeCommandHook`. The hook runs through a shell executor as
`<command> <<'CURSOR_HOOK_EOF'\n<payload json>\nCURSOR_HOOK_EOF`. Branches, in order:

| # | Condition | `failClosed: true` | no `failClosed` | `errorClass` / message |
|---|---|---|---|---|
| 1 | executor throws (spawn error, timeout) | block | allow | `spawn_error` / `timeout` |
| 2 | `exitCode === 2` (constant `2` in `../hooks/dist/index.js`, Claude-compat) | deny | deny | message: stdout if non-empty, else stderr, else a fixed no-reason text |
| 3 | `exitCode !== 0 && exitCode !== null` | block | allow | `exit_nonzero`, `Hook "<cmd>" failed with exit code N: <stderr>` |
| 4 | `stdout.trim()` empty | block | allow | `empty_stdout`, `Hook "<cmd>" returned no output.` |
| 5 | stdout does not parse as a hook response (the parser retries on the last `{…}` suffix) | block | block (`beforeShellExecution` is a permission step) | `invalid_json` / `invalid_response` |
| 6 | parsed `permission` is `deny` (or `ask`, which is handed back to the caller and prompts) | deny | deny | — |
| 7 | anything else | allow | allow | — |

A signal death reports `exitCode === null`, so it skips branch 3 and lands on branch 4. Exit 2 denies
whatever `failClosed` says (branch 2 sits before the `failClosed` checks).

### Live matrix (CONFIRMED, cursor-agent 2026.07.20-8cc9c0b)

Method: `cursor-agent -p --output-format json --model auto --force --trust`, throwaway `HOME` with a
`Library/Keychains` symlink (the record's isolation protocol), a fresh `git init` workspace per case.
The project `.cursor/hooks.json` registers ONE `beforeShellExecution` hook with `failClosed: true`.
The hook command first `touch`es a `HOOK_RAN` marker. The agent is asked to run one
`touch <ws>/PROBE_RAN`. One turn per row (n=1 each); every row matches the source read above.

| Hook behaviour | HOOK_RAN | PROBE_RAN | What the agent saw |
|---|---|---|---|
| exit 0 + stdout `{"permission":"allow"}` (control) | yes | yes | `Exit code: 0`, the command ran |
| exit 2 + stderr `probe-deny-exit2` (control) | yes | no | `Command execution was blocked by a hook: Hook blocked with message: probe-deny-exit2` |
| exit 1: the real guard from fixture A (`ERR_MODULE_NOT_FOUND`) | yes | no | `Tool blocked because this hook is configured to fail closed (block when it fails). Hook "…craft-guard.js" failed with exit code 1: <node stack>` |
| exit 127 (`craft-no-such-binary-probe`) | yes | no | `… configured to fail closed … failed with exit code 127: (eval):1: command not found …` |
| the hook's shell SIGKILLs itself (`kill -9 $$`) | yes | no | `… configured to fail closed … Hook "…" returned no output.` |

Side facts. The hook shell is zsh (the `(eval):1:` prefix). `node` inside Cursor's hook shell
resolved to Node.js v24.5.0 (the stack-trace footer), not the v22.22.3 on the operator's `PATH` and
on CI. Isolation: `find ~/.cursor -type f -newer <marker>` returned 0 files after all five turns
(the marker was reset after a re-login). Cost: 5 turns, about 32k input and 1.6k output tokens. Auth
was stale before the turns (`Authentication required`) and needed a re-login, as the record's
*Isolation-method caveat* predicts.

### Does today's guard have the static-import gap (pinned, node v22.22.3)

`adapters/cursor/hooks/craft-guard.js:25` statically imports `decideGuard` from
`../src/cursor-guard-adapter.js`, which statically imports `toolCallGuard` from
`../../../engine/src/guards/tool-call-guard.js` (`adapters/cursor/src/cursor-guard-adapter.js:20`).
ESM links static imports before `main()`'s `try/catch` (lines 48-59) runs, so a link failure never
reaches the guard's own deny.

| Fixture | Tree | Payload | Exit | stdout | stderr |
|---|---|---|---|---|---|
| A (codex recipe) | mktemp copy of `adapters/cursor/{hooks,src}` and `engine/bin/`; `engine/src/` absent | `{"hook_event_name":"beforeShellExecution","command":"echo hi","cwd":"","workspace_roots":["/tmp/p"]}` | 1 | 0 bytes | `ERR_MODULE_NOT_FOUND` |
| control | unmodified tree | same | 0 | `{"permission":"allow"}` | empty |

The gap exists exactly as in the codex guard. Whether it fails open depends only on what Cursor does
with exit 1 and empty stdout: branches 3 and 4 above, both block under `failClosed: true` (live row
3).

### What the repo already records

- `docs/contributing/specs/cursor-poc-record.md:85`, row **Fail-open behavior** (CONFIRMED, live):
  a crashing or invalid-JSON hook with no `failClosed` ran the command; with `failClosed: true` it
  was blocked ("exited with code 3"). It pins neither exit 1, exit 127 nor a signal, nor that exit 2
  denies whatever `failClosed` says.
- Same file, line 121, Phase B row **Fail-open vs failClosed** (CLOSED, live): the same result, one
  line.
- Same file, line 84, row **Deny wire**: "Hook writes **stdout JSON** … **Not an exit-code wire.**"
  The live exit-2 row contradicts the last sentence: exit 2 with a stderr message is also a deny.
- `adapters/cursor/README.md:59-61`: "The guard MUST stay `failClosed: true`. Measured: a
  crashing/malformed guard with no `failClosed` **fails OPEN** … with `failClosed: true` it blocks."
  True; it does not name the classes.
- `adapters/cursor/hooks/craft-guard.js:7-10`: "The deny wire is stdout JSON, NOT an exit code …
  Cursor reads stdout, and a stray exit code is ignored." The last clause is falsified: exit 2 denies
  (live row 2), any other non-zero exit blocks under `failClosed: true` (live rows 3-4) and allows
  without it (record line 85). Lines 12-17 (layer 2: `failClosed: true` blocks a process-level crash)
  are confirmed by this matrix.
- `failClosed: true` is already pinned by tests: `adapters/cursor/test/native-surface.test.js:129`
  (`hooks.json`) and `:232` (`config.template.json`). The README pins at `:196-215` require
  `/failClosed/`, `/fails? OPEN/i`, `/malformed `?hooks\.json`? fails OPEN/i` and
  `/not a containment guarantee/i`.

### Prior decisions this design follows

- ADR-522: "Sibling guards keep today's behaviour until a host probe shows they fail open on a
  crash." This matrix is that probe for the cursor guard, and it shows no fail-open under the
  shipped `failClosed: true`. The guard keeps today's behaviour.
- ADR-320: the POC record appends a version-pinned re-probe section and corrects in place only the
  rows the re-probe falsified. Here the version is unchanged (2026.07.20-8cc9c0b), so the section is
  dated as well as version-pinned. The one falsified row is **Deny wire** (line 84); the two
  fail-open rows (85, 121) stay untouched. Row 85 reads as consistent only because its crashing hook
  exited non-zero ("exited with code 3"): a non-JSON stdout on exit 0 blocks even without `failClosed`.
- ADR-521 (only if DC-2 (b)): crash paths are pinned by throwaway-tree fixtures, following
  `withGuardCopy` / `withoutEngineSources` in `adapters/codex/test/craft-guard-hook.test.js:28-48`.

### Settled before this design (user decision, not re-opened)

Harden only on a proven fail-open. With `failClosed: true`, every crash class Cursor can see blocks:
a non-zero exit, a signal death, empty stdout, invalid JSON (live or SOURCE), a spawn error or a
timeout (SOURCE). No fail-open is proven, so the guard is not hardened. The load-bearing property is
`failClosed: true`, already pinned by tests.

## Requirements

- **R1** No behaviour change. `adapters/cursor/src/cursor-guard-adapter.js`,
  `adapters/cursor/hooks.json` and `adapters/cursor/config.template.json` are byte-identical.
  `adapters/cursor/hooks/craft-guard.js` changes only inside its header comment, and only under
  DC-1 (b) or (c); every line after the header comment (from the first `import` down) is byte-identical.
- **R2** `docs/contributing/specs/cursor-poc-record.md` gains an appended section
  `## Re-probe — cursor-agent 2026.07.20-8cc9c0b (2026-10-13)` carrying the branch order (SOURCE),
  the live matrix (CONFIRMED), the static-import fixture (CONFIRMED, node v22.22.3), the isolation
  proof, the cost and the re-login, each row with a status.
- **R3** The **Deny wire** row (line 84) is corrected in place: exit 2 is also a deny. Rows 85 and
  121 are unchanged; the re-probe section names them as the rows it extends.
- **R4** `BACKLOG.md`: the entry "Probe whether the cursor guard fails open on a crash" is marked
  delivered in the house format and stays in its section, as the two delivered neighbours did.
- **R5** `README.md:200-201` corpus counts match the tree at commit time, so
  `bash scripts/readme-drift.sh .` exits 0 (this doc and its plan each add one file).
- **R6** `bash scripts/ci.sh` is green; the 5 tests in `adapters/cursor/test/craft-guard-hook.test.js`
  and the README pins in `native-surface.test.js` pass unedited.
- **R7** No absolute or home-rooted path in any committed file: the probe paths are written as
  `<ws>`, `<marker>` and `~/.local/share/cursor-agent/versions/<ver>/` (the record's own spelling).

## Design

Docs-only. Up to four parts, each a separate commit, in this order; none touches executable code.
Part 1 goes first because this doc already moved the design-doc count, so `readme-drift` is red
until the counts are reset, and every later part gate needs `scripts/ci.sh` green.

### Part 1 — README corpus counts (`README.md:200-201`)

Set `[N design docs]`, `[N parted plans]` and `[N ADRs]` to the tree counts at commit time, as each
delivered PR does (house commit: `docs(readme): refresh the design, plan and adr corpus counts`). Today, with this doc committed, `bash scripts/readme-drift.sh .` reports
`docs/contributing/design/ claims 60, tree holds 61`; the plan and any ADRs this design's decisions
produce move the other two counts.

### Part 2 — POC record (`docs/contributing/specs/cursor-poc-record.md`)

**2a. Append after line 145** (end of file, after *Isolation-method caveat*, as the codex record
appends its re-probes at the end). Heading: `## Re-probe — cursor-agent 2026.07.20-8cc9c0b
(2026-10-13)`, on one line. Body:

```markdown
Scope: what Cursor does with a `beforeShellExecution` hook that exits non-zero, dies by a signal,
or writes nothing, and whether craft's guard can crash that way. Same binary as the rows above, so
nothing above is re-pinned; this section extends **Fail-open behavior** (Guard / hook mechanism)
and **Fail-open vs failClosed** (Phase B), which pinned the `failClosed` switch but not the exit
classes. Method: `-p --output-format json --model auto --force --trust`, throwaway `HOME` with the
`Library/Keychains` symlink, a fresh `git init` workspace per case, a project `.cursor/hooks.json`
with ONE `beforeShellExecution` hook and `failClosed: true`. The hook first touches a `HOOK_RAN`
marker; the agent is asked to run one `touch <ws>/PROBE_RAN`. One turn per row.

| Probe | Result | Status |
|---|---|---|
| How a command hook's exit is read | Runs as `<command> <<'CURSOR_HOOK_EOF'` + payload. In order: executor throws (spawn error, timeout) → block if `failClosed`, else allow; exit 2 → deny, **whatever `failClosed` says** (the message is stdout if non-empty, else stderr, else a fixed no-reason text); other non-zero exit → block if `failClosed` (`exit_nonzero`), else allow; empty stdout → block if `failClosed` (`empty_stdout`), else allow; stdout that does not parse as a hook response (the parser retries on the last `{…}` suffix) → block **whatever `failClosed` says**, because `beforeShellExecution` is a permission step; `permission` `deny` → deny, `ask` → handed back to the caller (it prompts, see **Deny wire**); anything else → allow. A signal death has exit code `null`, so it lands on the empty-stdout branch. Bundle `3143.index.js`, `executeCommandHook`. | SOURCE |
| Exit 0 + `{"permission":"allow"}` (control) | HOOK_RAN yes, PROBE_RAN yes; the agent saw `Exit code: 0`. | CONFIRMED (live) |
| Exit 2 + stderr (control) | HOOK_RAN yes, PROBE_RAN no; `Command execution was blocked by a hook: Hook blocked with message: probe-deny-exit2`. Observed with `failClosed: true`; that exit 2 also denies without it is SOURCE. | CONFIRMED (live) + SOURCE |
| Exit 1: craft's guard with `engine/src/` absent | HOOK_RAN yes, PROBE_RAN no; `Tool blocked because this hook is configured to fail closed (block when it fails). Hook "…craft-guard.js" failed with exit code 1: <node stack>`. | CONFIRMED (live) |
| Exit 127 (command not found) | HOOK_RAN yes, PROBE_RAN no; `… configured to fail closed … failed with exit code 127: (eval):1: command not found …`. | CONFIRMED (live) |
| Signal death (the hook shell runs `kill -9 $$`) | HOOK_RAN yes, PROBE_RAN no; `… configured to fail closed … Hook "…" returned no output.` | CONFIRMED (live) |
| craft's guard crashes before its own `try` | `craft-guard.js` imports `cursor-guard-adapter.js`, which imports `engine/src/guards/tool-call-guard.js`, both statically. With `engine/src/` absent the guard exits 1 with empty stdout and `ERR_MODULE_NOT_FOUND` on stderr; the unmodified tree exits 0 with `{"permission":"allow"}`. Under `failClosed: true` that crash is blocked (row above). Direct run, node v22.22.3. | CONFIRMED |
| Hook shell | zsh (`(eval):1:` prefix on stderr). `node` resolved by that shell was v24.5.0 on the probe host, while the operator shell had v22.22.3. | CONFIRMED (live, host-specific) |
| Isolation and auth | `find ~/.cursor -type f -newer <marker>` returned 0 files after the five turns. Auth was stale before the turns (`Authentication required`) and needed a re-login, as the caveat above predicts. Cost: 5 turns, about 32k input and 1.6k output tokens. | CONFIRMED (live) |

Verdict: with `failClosed: true`, every crash class reached here blocks the call; exit 2 denies on
its own. No fail-open was observed, so the guard keeps today's code. `failClosed: true` stays the
load-bearing property (see **Fail-open behavior** above).
```

The **Hook shell** row's second sentence (the `node` version) is included only under DC-3 (b) or
(c); under DC-3 (a) the row keeps its first sentence only.

**2b. Correct line 84 in place** (ADR-320). In the **Deny wire** row, replace
`**Not an exit-code wire.**` with
`craft's guard uses this stdout wire, not an exit code; exit 2 with a stderr message is also a deny
(Claude-compat; see *Re-probe — cursor-agent 2026.07.20-8cc9c0b (2026-10-13)*).`
The rest of the row, its `CONFIRMED (live)` status and rows 85 and 121 stay as they are.

### Part 3 — BACKLOG (`BACKLOG.md:190-196`)

Replace the entry in place, in its section "Open (scoped 2026-10-13 — follow-ups surfaced by the
codex-hook-nonzero-exit-probe run …)", the way the Claude Code entry below it was closed:

```markdown
**Probe whether the cursor guard fails open on a crash — delivered <date>**
(fix/cursor-hook-nonzero-exit-probe). The cursor guard has the codex static-import gap: with its
engine predicate unresolvable it exits 1 with no stdout. cursor-agent 2026.07.20-8cc9c0b blocks
that call under the shipped `failClosed: true`, as it does exit 127 and a SIGKILL death; exit 2
denies whatever `failClosed` says (live `cursor-agent -p` probe, 5 turns; the matrix and the hook
branch order are in the POC record). No fail-open is proven, so the guard is not hardened;
`failClosed: true` stays load-bearing and test-pinned. Still fail-open, as already recorded: an
install without `failClosed`, and a malformed `hooks.json`. Design context:
[cursor-hook-nonzero-exit-probe](docs/contributing/design/cursor-hook-nonzero-exit-probe.md).
```

`<date>` is the delivery date at commit time. If ADRs are written for this design's decisions,
the house format appends their range in parentheses before `Design context:`.

### Part 4 — guard header and README (only under DC-1 (b) or (c))

`adapters/cursor/hooks/craft-guard.js:9-10`, comment only. Today:

```
 * with exit-2; Cursor denies with a stdout permission object). A future reader must not
 * "port" the exit-2 form here: Cursor reads stdout, and a stray exit code is ignored.
```

After:

```
 * with exit-2; Cursor denies with a stdout permission object). A future reader must not
 * "port" the exit-2 form here: the stdout object carries the user and agent messages.
 * Exit codes are not ignored: Cursor treats exit 2 as a deny, and any other non-zero
 * exit as a hook failure that layer 2 below turns into a block.
```

`adapters/cursor/hooks/craft-guard.js:15-17`, comment only. Today:

```
 *   2. hooks.json registers this hook with `failClosed: true`, so a process-level
 *      crash BEFORE this handler writes anything is also blocked by Cursor. Measured:
 *      without failClosed, a crashing hook fails OPEN (the command runs).
```

After:

```
 *   2. hooks.json registers this hook with `failClosed: true`, so a process-level
 *      crash BEFORE this handler writes anything is also blocked by Cursor. Measured:
 *      an import that fails to load (exit 1), a missing binary (exit 127) and a
 *      SIGKILL (no output) are all blocked; without failClosed, a crashing hook fails
 *      OPEN (the command runs).
```

Under DC-1 (c) only, `adapters/cursor/README.md:59-61` gains one sentence after "with
`failClosed: true` it blocks.": "Measured on 2026.07.20: exit 1 (a guard import that fails to
load), exit 127 and a SIGKILL death are all blocked; exit 2 denies whether or not `failClosed` is
set." The bullet keeps `failClosed` and `fails OPEN`, so the pins at `native-surface.test.js:196-215`
stay green.

### Edge behaviour

All rows under the shipped `failClosed: true`.

| Case | Hook result | Cursor | Evidence |
|---|---|---|---|
| Compliant command | exit 0, `{"permission":"allow"}` | runs | live control; existing hook test |
| `git diff` without `--no-ext-diff` | exit 0, `{"permission":"deny",…}` | blocked | record, Phase B; existing hook test |
| Bad JSON, missing command, throwing predicate | exit 0, deny object from the guard's catch | blocked | existing hook tests |
| Engine or adapter module fails to load | exit 1, empty stdout | blocked (`exit_nonzero`) | live row 3 |
| Guard file missing or unparseable | node exits 1 (not measured here) | blocked (`exit_nonzero`) | SOURCE; same branch as live row 3 |
| `node` missing from the hook shell's `PATH` | exit 127 | blocked (`exit_nonzero`) | live row 4 (missing binary) |
| Signal death | exit code `null`, empty stdout | blocked (`empty_stdout`) | live row 5 |
| Hook outlives Cursor's timeout; spawn error | executor throws | blocked | SOURCE only |
| Guard writes the allow object, then exits non-zero | exit ≠ 0 | blocked: branch 3 runs before stdout is parsed | SOURCE; unreachable today, `allow()` is the last statement |
| Exit 0 with a JSON object lacking `permission` | — | not probed: SOURCE allows a valid response whose `permission` is not `deny`/`ask`; whether such an object counts as valid was not read | unreachable: `respond` is called only by `allow` and `deny` |
| Exit 2 for any reason | — | denied, with or without `failClosed` | live row 2 + SOURCE |

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Prose outside the POC record | (a) none: the POC record and BACKLOG only; (b) correct the guard header: replace the falsified "a stray exit code is ignored" (lines 9-10) and name the measured classes in layer 2 (lines 15-17), comments only; (c) (b) plus one README sentence naming the classes | (b) | The header sentence is the one statement in source this probe falsifies (exit 2 denies; exit 1 and 127 block), and it sits in the comment that tells a future reader what not to change. (a) leaves a proven-false claim beside the code. The README bullet is true as written, so (c) adds precision nobody asked for; the record and the header carry the detail. |
| DC-2 | A regression test that a dependency-load crash writes no stdout | (a) no new test; (b) a throwaway-tree test (ADR-521 pattern: copy `hooks/` and `src/`, drop `engine/src/`, spawn under `process.execPath`) asserting `status !== 0` and `stdout === ''`; it is green on arrival | (a) | Nothing failed, so the user's rules (no scope expansion; harden only on proof) point to no new code. The load-bearing property is `failClosed: true`, already pinned at `native-surface.test.js:129` and `:232`. Test (b) would pin node's ESM link behaviour (exit 1, no output), not craft code: no plausible edit to `craft-guard.js` turns it red that the existing allow/deny tests miss, and even a crash after an allow is blocked by branch 3. It would also go red on a legitimate future hardening (imports moved inside the `try` write a deny object, so stdout is no longer empty). |
| DC-3 | The Node v24.5.0-in-hook-shell observation | (a) out of scope, not recorded; (b) recorded as a host-specific fact in the re-probe **Hook shell** row, no action; (c) (b) plus a BACKLOG entry to pin which `node` Cursor's hook shell resolves | (b) | It was measured, and the record exists to hold measured facts, so (a) drops evidence. It names the probe host's PATH, not a Cursor contract, and no defect is shown: the guard ran and was blocked as designed. So (c) would open work on an unproven problem. |

Settled already, so not candidates: whether to harden (the user's rule; no fail-open proven), the
deny wire (stdout JSON, record line 84), the record convention (ADR-320: append a pinned section,
correct only the falsified **Deny wire** row), and sibling-guard scope (ADR-522).

## Test strategy

No new tests under DC-2 (a). Every change is prose, so the gates are the existing suites and lints.

- Part gate, after each part: `bash scripts/ci.sh > <tmp>/ci.log 2>&1; echo $?`, then read only the
  summary lines and any failure. It runs the cursor suite (`run_suite adapters/cursor
  adapters/cursor/test`), intention-lint over the living corpus (it includes
  `docs/contributing/specs/*.md` and `BACKLOG.md`), the static lints, the source-hygiene scan
  (home-rooted paths) and the README drift test.
- Part 1: `bash scripts/readme-drift.sh .` exits 0.
- Part 2: a grep confirms the record's new heading appears once; `git diff --no-ext-diff` on the
  record shows only the appended section and the line-84 edit, so the **Fail-open behavior** and
  **Fail-open vs failClosed** rows are byte-identical.
- Part 3: `bash scripts/backlog-lint.sh BACKLOG.md`.
- Part 4: `git diff --no-ext-diff adapters/cursor/hooks/craft-guard.js` shows changed lines only
  inside the `/** … */` header; `node --test adapters/cursor/test/craft-guard-hook.test.js` passes
  its 5 tests unedited. Under DC-1 (c), `node --test adapters/cursor/test/native-surface.test.js`
  passes the README pins unedited.
- This doc: `bash scripts/design-lint.sh docs/contributing/design/cursor-hook-nonzero-exit-probe.md`.

Under DC-2 (b) only, one test joins `adapters/cursor/test/craft-guard-hook.test.js`:

| Title | Fixture | Assertions | Today |
|---|---|---|---|
| Given a guard copy whose engine predicate cannot be resolved, when the hook process runs, then it exits non-zero with empty stdout so failClosed blocks it | mktemp copy of `adapters/cursor/{hooks,src}`, `engine/src/` absent, spawned under `process.execPath` | `status !== 0`; `stdout === ''`; stderr matches `/ERR_MODULE_NOT_FOUND/` | green (regression pin) |

Not run, and why: no further live Cursor turn (paid; every row matched the source read, and this
change adds no new hook behaviour); no repeats of the n=1 rows (each row agrees with a deterministic
branch in the source).

## Out of scope

- Hardening the guard (moving the imports inside the `try`, process-level handlers, an exit-2
  route). No fail-open is proven under `failClosed: true` (ADR-522 holds).
- An install without `failClosed`: already recorded fail-open (record line 85, README line 59).
- A malformed `hooks.json`: already recorded fail-open (record, Phase B; README line 62).
- Repeat runs of the live rows: n=1 each, consistent with the source read.
- A live timeout or spawn-error row: SOURCE only. To prove it: register a hook that sleeps past a
  short `timeout` in the throwaway `hooks.json` and check `PROBE_RAN`, as in the matrix.
- An exit-0 response without a `permission` field: not probed, and the guard cannot emit it.
- Which `node` the hook shell resolves, beyond recording it (DC-3).
- `adapters/cursor/hooks.json`, `config.template.json`, `cursor-guard-adapter.js`: unchanged (R1).
- Anything else not proven by the matrix above.
