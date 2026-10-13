# Design — Claude Code binding: a crashing git guard hook still denies

> Brief: Claude Code 2.1.296 runs the Bash call when a PreToolUse hook exits 1 or 127, or dies by
> a signal, and the model never sees the crash (probed, matrix below). Make
> `hooks/git-no-ext-diff.sh` turn every crash bash can see into exit 2 with a `craft` reason on
> stderr, pin that with tests that make the hook crash, record the exit-status contract in the gate
> spec, and close the BACKLOG entry "Probe whether the Claude Code guard hook fails open on a crash".
> Status: draft → self-reviewed ×3

## Context

### What Claude Code does with a hook exit status (pinned, Claude Code 2.1.296)

Method: `claude -p --model haiku --setting-sources project --strict-mcp-config
--no-session-persistence --allowedTools "Bash(touch:*)" --output-format stream-json --verbose`,
run from a mktemp project `<proj>` under `$TMPDIR`. A project under the Claude config directory (`<claude-config-dir>`) was refused as a
"sensitive file" path. The project's own `.claude/settings.json` registers a copy of
`hooks/git-no-ext-diff.sh` for PreToolUse/Bash. Each copy gets two lines right after
`set -euo pipefail`: `touch <proj>/HOOK-RAN`, which proves the hook fired, then the crash line. The
prompt asks for exactly one Bash call, `touch <proj>/MARKER`. If the marker exists, the call ran.
User settings, plugins and MCP servers were not loaded. The only residue was empty
`<claude-config-dir>/projects/<probe-slug>/memory` directories, removed after each run. The direct exit status
of each copy, fed `{"tool_input":{"command":"git diff"}}`, was measured separately.

| Injected crash line | Direct exit | HOOK-RAN | MARKER | What the model sees (stream-json `tool_result`) | Verdict |
|---|---|---|---|---|---|
| `exit 0` (control) | 0 | yes | present | `(Bash completed with no output)`, `is_error` false | runs |
| `echo probe-deny >&2; exit 2` (control) | 2 | yes | absent | `PreToolUse:Bash hook error: [<hook path>]: probe-deny`, `is_error` true | **denied** |
| `exit 1` (3/3 repeats) | 1 | yes | present | `(Bash completed with no output)`, `is_error` false; no hook event in the stream | fail-open |
| `PATH=/nonexistent-craft-probe` (the next line, `IN=$(cat)`, is then command-not-found under `set -e`) | 127 | yes | present | same clean result | fail-open |
| `kill -KILL $$` | 137 (signal) | yes | present | same clean result | fail-open |

On 2.1.296 only exit 2 denies. Exit 1, exit 127 and a signal death run the Bash call, and the model
sees a clean result with no trace of the crash. Not probed: what Claude Code does when it kills a
hook that runs past its own timeout.

### Why today's hook can exit neither 0 nor 2

`hooks/git-no-ext-diff.sh` (34 lines, `set -euo pipefail`) reaches its verdict through four external
commands. Each one is a crash point:

| Line | Code | Crash | Status today |
|---|---|---|---|
| 11 | `IN=$(cat)` | `cat` not on `PATH` | 127 (errexit) |
| 12 | `CMD=$(printf … \| jq -r …)` | `jq` not on `PATH`; stdin not JSON | 127; 5 (errexit) |
| 25 | `if ! printf … \| grep -qE "$GIT_RE"; then exit 0` | `grep` not on `PATH`; `printf` killed by SIGPIPE | **0, allow**: `!` turns any non-zero status into the no-match branch |
| 30 | `FIXED=$(printf … \| sed -E …)` | `sed` not on `PATH` | 127 (errexit) |
| 32 | `jq -cn …` (the JSON deny) | `jq` fails | its status (last command) |

Line 25 is a different failure from the others. It does not reach a bad exit status: it turns the
crash into the hook's own allow branch, so no exit-status mapping can see it. Two triggers are
pinned below. `grep` missing from `PATH` is the first. The second is a command whose first line
matches and whose remaining lines run past the pipe buffer: `grep -q` exits on the first matching
line, the `printf` writer then dies of SIGPIPE, `pipefail` reports 141, and `!` turns that into
"no match".

### Bash mechanism matrix (pinned, GNU bash 3.2.57 `/bin/bash`, macOS 27.0.1)

The hook's shebang is `#!/bin/bash`, so this is the bash that runs it on macOS. CI runs ubuntu-latest
(bash 5), and that version was not pinned locally. Each row is a throwaway script in a mktemp
directory, `set -euo pipefail` first, fed `{}` on stdin.

| # | Construct | Exit | Note |
|---|---|---|---|
| B1 | `trap '… $? …' EXIT`, then `exit 0` / `exit 1` / `exit 2` | 0 / 1 / 2 | the trap sees the exact status |
| B2 | same trap, script ends after a succeeding command | 0 | trap sees 0 |
| B3 | same trap, `PATH=/nonexistent; IN=$(cat)` | 127 | trap sees 127 after `cat: command not found` |
| B4 | same trap, `C=$(printf 'not json' \| jq -r .a)` | 5 | trap sees jq's 5 |
| B5 | same trap, last command fails | 1 | trap sees 1 |
| B6 | same trap, `PATH=/nonexistent; if ! printf x \| grep -q x; then exit 0; fi` | **0** | trap sees 0: the crash already became an allow |
| B7 | a trap that runs `exit 2` when `$? ≠ 0`, applied to B3, B4, B5 | 2 | the trap's `exit` overrides the status |
| B8 | `trap … ERR` instead of EXIT: B3, B4, B5 | 2 / 2 / 2 | ERR fires on the same errexit failures |
| B9 | `trap … ERR`, explicit `exit 3` | 3 | ERR does not fire on an explicit exit |
| B10 | `trap … ERR`, B6's `if !` | 0 | ERR does not fire inside `!` either |
| B11 | `source ./missing-helper.sh` on the line before the EXIT trap | 1 | the sourced-helper failure happens before any trap exists |
| B12 | EXIT trap, `sleep 2`, process sent SIGTERM / SIGHUP / SIGKILL | 143 / 129 / 137, no trap output | an EXIT trap does not run on signal death |
| B13 | B12 plus `trap 'exit 143' TERM`, sent SIGTERM | 2 after 2 s | the TERM trap runs once the foreground child exits, then the EXIT trap maps it |
| B14 | `grep -qE "$GIT_RE" <<<"$CMD"`, with `TMPDIR` set to a missing directory, then to a read-only one | 0 (match) both times | the here-string falls back to `/tmp`; no writer process exists to take a SIGPIPE |
| B15 | `[[ $CMD =~ $GIT_RE ]]` with the hook's `\s`/`\S` regex | no match on `git diff HEAD` | macOS `regcomp` has no `\s`; the `[[:space:]]` form of the same regex matches and still rejects `git stash show` |
| B16 | `printf '%s' "$CMD" \| /usr/bin/grep -qE "$GIT_RE"`, first line `git diff HEAD`, 3 tries each | 60,013 bytes: `0 0`; 65,014 / 70,014 / 1,000,014 bytes: `141 0` (3/3) | `PIPESTATUS`: the writer is killed once the input passes the 64 KiB pipe buffer |
| B17 | B7's trap, hook run with stderr closed (`2>&-`), cat missing, 3/3 | **1** | errexit still applies inside the trap: the reason `printf` fails and aborts the trap before its `exit 2`, so the trap itself fails open |
| B18 | B17 with `printf … >&2 \|\| true` in the trap, 3/3 | 2 | the deny no longer depends on the reason being written |
| B19 | `if then fi` (a syntax error) on a line after `echo before`: with no trap / with an EXIT trap that returns on `$? = 0`, 3/3 | 2 / **0** | bash's own syntax-error status denies today; under an EXIT trap the trap sees 0, so the trap would turn a deny into an allow. `shellcheck` exits 1 on the file |
| B20 | B19 with a `verdict_reached` flag that only the allow and deny paths set, and the trap denying on 0 unless it is set, 3/3 | 2 | stderr `craft git-no-ext-diff: no verdict reached, call denied` |

`grep` is `/usr/bin/grep` (BSD grep 2.6.0-FreeBSD) in every hook run here. GNU grep was not pinned
locally. Its `-q` also exits on the first match, so B16 is expected there too. The red test on CI
confirms it either way (Test strategy).

### Hook-level matrix (pinned, `/bin/bash` 3.2.57)

"Current" is today's `hooks/git-no-ext-diff.sh`. "Prototype" is the Part 1 shape under DC-1 (a),
DC-2 (a), DC-3 (a), DC-4 (a), DC-5 (a) and DC-8 (b), copied into a mktemp directory. Every row
except the syntax-error row was also pinned on the variant without DC-8's flag, with the same
results (only the line numbers in bash's own diagnostics differ). Each run uses
`env -i PATH=<dir>`. `<dir>` is either the full system path, or a mktemp directory symlinking only
the tools named. The payload is `{"tool_input":{"command":"git diff HEAD~1"}}` unless the row says
otherwise.

| Fixture | Current | Prototype |
|---|---|---|
| control, full `PATH` | exit 0, JSON deny | exit 0, JSON deny |
| no tool on `PATH` (cat missing) | exit 127, `cat: command not found` | exit 2, `craft git-no-ext-diff: failed (exit 127), call denied` |
| `cat` only (jq missing) | exit 127 | exit 2, `… failed (exit 127) …` |
| `cat jq` (grep missing) | **exit 0, empty stdout: allow** | exit 2, `… failed (exit 127) …` |
| `cat jq grep` (sed missing) | exit 127 | exit 2, `… failed (exit 127) …` |
| stdin `not json` | exit 5, `jq: parse error …` | exit 2, `… failed (exit 5) …` (jq's line kept above it) |
| `git diff HEAD` + newline + 70,000 bytes of `echo …` lines (3/3) | **exit 0, empty stdout: allow** | exit 0, JSON deny |
| the Part 2 test payload: `git diff HEAD\n` + `'echo pad\n'` × 16384 (3/3) | **exit 0, empty stdout: allow** | exit 0, JSON deny whose reason contains `git diff --no-ext-diff HEAD`, empty stderr |
| cat missing, stderr closed (`2>&-`, 3/3) | exit 127 | exit 2 (exit 1 without B18's `\|\| true`) |
| `if then fi` inserted right after the line where the guard is installed (`set` today, `trap` in the prototype), 3/3 | exit 2 (bash's syntax-error status) | exit 2, `craft git-no-ext-diff: no verdict reached, call denied`; **exit 0** on the variant without DC-8's flag |
| the 10 `test/fixtures/hooks/no-ext-diff-*.json` + 16 extra payloads (15 allow, 11 deny; empty stdin, `{}`, multi-line, piped, `cd … &&`, compliant, `rtk proxy`, `stash show`, `show-ref`, `difftool`) | — | exit status, stdout bytes and stderr bytes identical to Current: 26/26 |

The prototype passes `shellcheck`. Not proven: whether Claude Code ever sends a Bash command over
64 KiB, or runs a hook with `grep` off `PATH`. Both triggers above were built in fixtures. The
realistic crash trigger is `jq` missing: `jq` is a hook-only dependency that no operator doc names
(a grep of `README.md`, `docs/guides` and `docs/contributing/specs` finds none). This macOS 27.0.1
box has a system `/usr/bin/jq` (`jq-1.7.1-apple`). Not proven: how many Claude Code hosts run
without `jq` on `PATH`.

### Prior decisions and patterns this design follows

- ADR-522 scoped the codex crash hardening to the codex guard: "Sibling guards keep today's
  behaviour until a host probe shows they fail open on a crash." The Claude Code matrix above is
  that probe for the root hook.
- ADR-518 is the precedent shape: every crash the guard can see ends in the same deny call, a
  stderr reason plus exit 2. The residual it cannot see is written down for an operator.
- `hooks/bound-run.sh` `never_block` / `craft_never_block_finish` is the house bash pattern: an EXIT
  trap that catches any non-zero status, prints `craft <hook>: failed (exit N)` on stderr, and
  exits 0, because the compaction hooks must never block. This design is the same trap with the
  opposite polarity. The guard must never let a crash allow.
- `docs/contributing/specs/gate.md:41-56` and the hook header: the matcher's verdict is a JSON
  `permissionDecision: "deny"` with the corrected command (deny-over-rewrite, spike-pinned
  2026-06-12). That channel and its wording are unchanged.
- `test/hooks.test.js:275` pins the exact registered command in `hooks/hooks.json`. Both stay
  unchanged.

### Settled before this design (user decision, not re-opened)

Harden only on a proven fail-open. The matrix proves one: exit 1, exit 127 and a signal death all
run the call. So the hook is hardened, the matrix is recorded, and the BACKLOG entry closes.

## Requirements

- **R1** Any non-zero status the hook process reaches ends in exit 2. Covered: an errexit failure,
  a command not found, a non-JSON stdin, a failing final `jq`, or an explicit non-zero `exit`. The
  last stderr line is `craft git-no-ext-diff: failed (exit <n>), call denied`, where `<n>` is the
  status the hook would have exited with. Any diagnostic the failing command printed stays above
  that line. The exit 2 holds even when stderr cannot be written (B18).
- **R1b** (only under DC-8 (b)) A hook process that ends with status 0 before any allow or deny
  verdict ends in exit 2 with `craft git-no-ext-diff: no verdict reached, call denied` (B19, B20).
- **R2** Every payload that runs cleanly today is unchanged byte for byte: same exit status, same
  stdout, same stderr. That covers the allow path (exit 0, empty stdout, empty stderr) and the
  matcher's JSON deny (exit 0, one JSON line on stdout, empty stderr).
- **R3** (only under DC-4 (a)) A failure of the git matcher is not read as "no match". Only grep's
  status 1 allows. Any other status goes to R1. A matching command larger than the pipe buffer is
  denied with its corrected command, as a short one is.
- **R4** `hooks/hooks.json`, the registered command, the hook's file path and shebang are
  unchanged. The existing tests in `test/hooks.test.js` stay green with no edits.
- **R5** The residual is written down where an operator reads it (DC-6). No in-hook code can
  catch it. It covers: `/bin/bash` missing; the hook file missing or not executable; death by any
  signal (B12); the hook killed by Claude Code's own timeout (unprobed). Under DC-8 (a), a syntax
  error below the trap is on this list too (B19).
- **R6** `docs/contributing/specs/gate.md`, Claude binding section: the exit-status contract
  pinned on 2.1.296 and the crash-deny behaviour are recorded.
- **R7** `BACKLOG.md`: the entry "Probe whether the Claude Code guard hook fails open on a crash"
  is marked delivered, in the house format.
- **R8** No new dependency, and it still runs under bash 3.2 (macOS `/bin/bash`). `shellcheck
  scripts/*.sh hooks/*.sh` (run by `scripts/static-lints.sh`) passes.

## Design

### Part 1 — the hook (`hooks/git-no-ext-diff.sh`)

Context block:
- Today: 34 lines, header comment lines 1-8, `set -euo pipefail` line 9. Crash points are at lines
  11, 12, 25, 30 and 32 (table above). `GIT_RE` is on line 24. The allow exits are lines 13, 17,
  18 and 26 (`exit 0`); under DC-8 (b) they become `allow` calls. The JSON deny is the last command
  (line 32), so a clean deny ends the script with status 0.
- No functions today. `shellcheck` runs over `hooks/*.sh` in `scripts/static-lints.sh:7`.
- House precedent: `hooks/bound-run.sh` `never_block` (EXIT trap, `"$?"` passed to a named
  function, `printf 'craft %s: failed (exit %d)\n'` on stderr). Mirror its naming and message
  format. Under DC-5 (a), do not source the helper.

Shape (DC-1 (a), DC-2 (a), DC-3 (a), DC-4 (a), DC-5 (a), DC-8 (b)):

```bash
set -euo pipefail

readonly CRASH_DENY_EXIT_CODE=2
readonly GREP_NO_MATCH=1

verdict_reached=0

allow() {
  verdict_reached=1
  exit 0
}

deny_on_crash() {
  local rc="$1"
  [ "$rc" -eq 0 ] && [ "$verdict_reached" -eq 1 ] && return 0
  local cause="failed (exit $rc)"
  [ "$rc" -eq 0 ] && cause="no verdict reached"
  # errexit still applies here: a failed write must not abort the trap before the deny
  printf 'craft git-no-ext-diff: %s, call denied\n' "$cause" >&2 || true
  exit "$CRASH_DENY_EXIT_CODE"
}
trap 'deny_on_crash "$?"' EXIT

IN=$(cat)
CMD=$(printf '%s' "$IN" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && allow

case "$CMD" in
  *--no-ext-diff*) allow ;;
  *"rtk proxy"*)   allow ;;
esac

# … GIT_RE comment and assignment unchanged …
match_status=0
grep -qE "$GIT_RE" <<<"$CMD" || match_status=$?
case "$match_status" in
  0) ;;
  "$GREP_NO_MATCH") allow ;;
  *) exit "$match_status" ;;
esac

# … FIXED=… unchanged …
jq -cn … # the JSON deny, unchanged
verdict_reached=1
```

Why each piece is there:
- **The EXIT trap is installed before the first external command** (B1-B5, B7), so each command
  in the crash table runs under it. The cat-missing test pins that order: move the trap below
  `IN=$(cat)` and that test goes red.
- **Clean exits pass through only with a verdict** (DC-8 (b); B19, B20). `allow` and the line after
  the JSON deny set `verdict_reached`, and the trap returns on status 0 only when it is set. That
  keeps every clean path as it is (R2, pinned 26/26). It also stops a bash 3.2 syntax error below
  the trap from ending in exit 0: today bash's own status 2 denies that case. Under DC-8 (a) the
  flag, `allow` and `cause` go away, and the first trap line becomes `[ "$rc" -eq 0 ] && return 0`.
- **`exit 2` inside the trap** overrides the crash status (B7). The reason line comes after any
  diagnostic bash or the failing tool printed, so the model gets the cause (`jq: command not
  found`) and then craft's verdict. The probe shows exit-2 stderr reaches the model as
  `PreToolUse:Bash hook error: [<hook path>]: …`.
- **`|| true` on the reason line** (B17, B18). Without it, a closed or broken stderr makes the
  `printf` fail, errexit aborts the trap, and the hook exits 1, which fails open. The write error
  has nowhere to be reported, because stderr is the channel that failed. The deny is what matters,
  so this is not a swallowed error that hides a verdict. The comment states why. Only the reason
  line gets this treatment.
- **The matcher's status is split** (DC-4 (a)). `|| match_status=$?` keeps errexit from firing.
  Status 1 is the only "no match". Any other status is passed to `exit`, and the trap turns it into
  a deny. This closes the grep-missing allow (B6).
- **A here-string replaces the `printf |` pipe** (B14, B16). With no writer process there is
  nothing for SIGPIPE to kill, so a large matching command is matched and denied the same way a
  short one is. The regex text stays byte-identical (B15 rules out a bash `[[ =~ ]]` without
  rewriting it). The here-string adds a trailing newline, which a line-based `grep` ignores. R2 is
  pinned on multi-line payloads.
- Named constants replace the literal `2` and `1`, following the house rule against magic values.
  The JSON deny stays on stdout with status 0: it is the verdict channel, not a crash.
- The prototype passes `shellcheck` as written, including `allow` and `deny_on_crash`, which are
  reached only through calls and the trap.

Header comment: keep lines 1-8. Add one paragraph explaining why: Claude Code runs the Bash call
on every hook exit status except 2, so any crash below has to end in exit 2, never in the status
that crashed. Add one sentence on the residual (R5). No ADR, backlog or phase reference.

### Part 2 — tests (`test/hooks.test.js`)

Context block:
- Existing: `HOOKS_DIR`, `HOOK_FIXTURES`, `runHook(hookName, fixtureName)` (runs `execFileSync('bash',
  …)` and collapses errors to `{status, stdout, stderr}`), `decision(...)` and `reason(...)`.
  Both throw on a non-zero status and trim stdout. The git-hook section is lines 52-152:
  `test(...)` blocks with Given/When/Then titles.
- Precedent for a restricted `PATH`: line 402, the compaction hooks with `PATH` set to an empty
  mktemp directory. It runs through `runHookWithPayload` → `spawnSync('/bin/bash', …, { env })`.
  Precedent for a mktemp tree with `finally` cleanup: `withSpacedRoots` (line 231).
- `runHook` cannot be reused for crash cases: `execFileSync('bash')` inherits the full `PATH`.

New helpers (in the git-hook section, not shared):

```js
const GIT_HOOK = path.join(HOOKS_DIR, 'git-no-ext-diff.sh');
const DENY_DIFF_PAYLOAD = fs.readFileSync(path.join(HOOK_FIXTURES, 'no-ext-diff-deny-diff.json'));
const CRASH_DENY_EXIT_CODE = 2;
const PIPE_BUFFER_OVERFLOW_LINES = 16384; // 'echo pad\n' × 16384 = 144 KiB, past the 64 KiB pipe buffer

function crashReason(status) {
  return new RegExp(`^craft git-no-ext-diff: failed \\(exit ${status}\\), call denied$`, 'm');
}

function resolveTool(name) {
  const hit = process.env.PATH.split(path.delimiter)
    .map((dir) => path.join(dir, name))
    .find((candidate) => fs.existsSync(candidate));
  if (!hit) throw new Error(`${name} is not on PATH`);
  return hit;
}

// PATH holding only the named tools, so the hook crashes on the first one it lacks
function withToolsOnly(tools, act) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'craft-hook-tools-')));
  try {
    for (const tool of tools) fs.symlinkSync(resolveTool(tool), path.join(dir, tool));
    return act(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runGitHook(input, env = process.env) {
  return spawnSync('/bin/bash', [GIT_HOOK], { input, encoding: 'utf8', env });
}

// copy of the hook with one line inserted after the first line starting with `anchor`
function withHookCopy({ anchor, inserted }, act) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'craft-hook-copy-')));
  try {
    const lines = fs.readFileSync(GIT_HOOK, 'utf8').split('\n');
    const at = lines.findIndex((line) => line.startsWith(anchor));
    if (at === -1) throw new Error(`no line starts with ${anchor}`);
    lines.splice(at + 1, 0, inserted);
    const copy = path.join(dir, 'git-no-ext-diff.sh');
    fs.writeFileSync(copy, lines.join('\n'));
    return act(spawnSync('/bin/bash', [copy], { input: DENY_DIFF_PAYLOAD, encoding: 'utf8' }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
```

Fixtures (all on `DENY_DIFF_PAYLOAD` unless stated):
- **cat missing**: `withToolsOnly([], …)`, so `IN=$(cat)` is command-not-found.
- **jq missing**: `withToolsOnly(['cat'], …)`.
- **sed missing**: `withToolsOnly(['cat', 'jq', 'grep'], …)`. The matcher must pass first, so this
  also proves the crash is caught after the match.
- **grep missing** (DC-4 (a)): `withToolsOnly(['cat', 'jq'], …)`.
- **stdin not JSON**: input `'not json'`, full environment.
- **matching command past the pipe buffer** (DC-4 (a)): the input is `JSON.stringify({ tool_input:
  { command: 'git diff HEAD\n' + 'echo pad\n'.repeat(PIPE_BUFFER_OVERFLOW_LINES) } })`, run with
  the full environment through `runGitHook`. Not run through `runHook`, because that helper takes
  a fixture file name and the payload is generated.

### Part 3 — prose

- `hooks/git-no-ext-diff.sh` header: see Part 1.
- `docs/contributing/specs/gate.md`, Claude binding, after the `git-no-ext-diff.sh` bullet
  (line 56). New paragraph: Claude Code 2.1.296 treats only exit 2 as a deny. Exit 1, exit 127
  and a signal death run the Bash call and show the model a clean result. Exit 2's stderr reaches
  the model as `PreToolUse:Bash hook error: [<hook path>]: <stderr>`. So the hook turns any crash
  bash can see into exit 2 with `craft git-no-ext-diff: failed (exit <n>), call denied` (or `no
  verdict reached` under DC-8 (b)), and the JSON deny stays the matcher's verdict. Then the residual (R5) in one sentence, and the matrix by
  link to this design doc (DC-6 (a)).
- Under DC-6 (b) only: `README.md` line 99, the "Requirement:" sentence under Quickstart, gains
  "and `jq` on `PATH` (the Claude Code guard hook denies every Bash call without it)".
- `BACKLOG.md:188-191`: retitle to `**Probe whether the Claude Code guard hook fails open on a
  crash — delivered <date>**`, add `(fix/claude-hook-nonzero-exit-probe)` the way the delivered
  codex entry at line 195 does, and replace the body with three sentences. First, the verdict:
  2.1.296 runs the call on exit 1, exit 127 and a signal, and the model sees no trace. Second, the
  change: any crash bash can see now denies with exit 2, and the matcher no longer reads its own
  failure as "no match". Third, the residual. Then the design-context link.

### Edge behaviour

| Case | Result |
|---|---|
| Compliant, proxied, non-git or empty command | exit 0, no output (R2, 26/26) |
| A git diff/show with no `--no-ext-diff` | exit 0, JSON deny with the corrected command (unchanged) |
| `cat`, `jq` or `sed` missing; stdin not JSON; the final `jq` fails | exit 2, `craft git-no-ext-diff: failed (exit <n>), call denied`, below the tool's own diagnostic |
| `grep` missing, or grep exits with a status of 2 or more | exit 2 under DC-4 (a). Today: exit 0, allow |
| Matching command past the 64 KiB pipe buffer | JSON deny under DC-4 (a). Today: exit 0, allow |
| Non-git command while `jq` is missing | exit 2: every Bash call is denied under DC-3 (a) |
| A crash while stderr is closed or broken | exit 2 with no reason line (B18) |
| A syntax error below the trap (an edit, or a corrupted install) | exit 2, `no verdict reached` under DC-8 (b); exit 0, allow, under DC-8 (a) (B19). Today: exit 2. `shellcheck` and the hook tests catch it before merge either way |
| SIGKILL / SIGTERM / SIGHUP | residual: 137 / 143 / 129 (B12), so the call runs (R5; DC-7) |
| `/bin/bash` missing, the hook file missing or not executable | residual: the hook never starts (R5) |
| Hook killed by Claude Code's timeout | unprobed; residual until proven (R5) |

The deny reason can carry the hook's absolute path, because bash prefixes its own diagnostic with
the script path, and Claude Code already shows `[<hook path>]` in its hook-error line. That is no
new exposure.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | How a crash becomes a deny | (a) an EXIT trap, set first, that maps any non-zero status to exit 2 plus a reason line; (b) an ERR trap that does the same; (c) an up-front `command -v jq` check only | (a) | (b) catches the same errexit failures today (B8) but misses an explicit non-zero `exit` (B9). The hook has none today, but under DC-4 (a) it gains `exit "$match_status"`, which only an EXIT trap maps. (c) covers jq missing and nothing else: cat, sed, non-JSON stdin and the final `jq` still exit non-zero. (a) is the house `never_block` pattern with the opposite polarity, and it is prototyped 26/26 identical on the clean paths. |
| DC-2 | Which channel denies on a crash | (a) exit 2 with the reason on stderr; (b) `printf` a fixed JSON `permissionDecision: "deny"` on stdout and exit 0 | (a) | The probe pins exit 2 as a deny on 2.1.296, with stderr shown to the model. (b) depends on stdout still being clean: a crash in the final `jq -cn` can leave partial output, and the fixed JSON would be appended to it. The JSON channel was also not re-probed on 2.1.296 in this run. ADR-518 also chose exit 2 for the codex guard's crash path. |
| DC-3 | What a crash denies | (a) every Bash call (the crashing call, whatever it is); (b) only calls whose raw stdin loosely contains `git` and `diff`/`show` and no `--no-ext-diff`, matched with a bash `case`; other calls exit 0 with a stderr note | (a), flagged: with `jq` missing, Bash is unusable under the plugin until `jq` is installed | (a) is the codex precedent (ADR-518) and a single predicate: the trap knows nothing about git. Its cost is real. The realistic trigger is `jq` missing. Every Bash call is then denied in every session where the plugin is enabled, and the agent cannot install `jq` itself, so the user has to act. Today the same host silently runs unguarded. (b) keeps Bash usable, but the raw stdin also carries `description`, `cwd` and `transcript_path`, so a lowercase "show" in a description plus "git" in a path over-denies unrelated calls. If `cat` failed, `IN` is empty and (b) has to deny all anyway. It also duplicates the predicate in a looser second form. On exit 0 the stderr note never reaches the model (probe control row). |
| DC-4 | Whether the matcher's crash-as-allow paths are in scope | (a) yes: split grep's status (only 1 allows) and feed it a here-string; (b) no: exit-status crashes only, and the two allow paths get Out-of-scope lines; (c) yes, but via a builtin `[[ =~ ]]` with the regex rewritten to `[[:space:]]` classes | (a) | Both paths are proven fail-opens of this guard on a crash (`grep` missing: allow; SIGPIPE at 65,014 bytes or more: allow, 3/3), which answers the backlog question directly. Neither can be seen by DC-1, because the hook exits 0 (B6). (a) is a 7-line change that keeps the regex text byte-identical (R2 26/26). (c) also removes the grep dependency, but rewrites the regex: bash `=~` has no `\s` on macOS (B15), so the `\s`→`[[:space:]]` equivalence must be re-proven across the whole fixture matrix. (b) leaves two proven fail-opens open. Not proven for either: a real Claude Code trigger (Context). |
| DC-5 | Where the crash trap lives | (a) inline in `git-no-ext-diff.sh`; (b) a `fail_closed` sibling of `never_block` in `hooks/bound-run.sh`, sourced by the hook | (a) | Sourcing is itself a crash point that runs before any trap exists: a missing helper exits 1 (B11), and that is fail-open. (b) also needs the hook to resolve its own directory before sourcing, without `dirname` (`craft_hooks_dir`'s constraint), which is more code ahead of the trap. The only shared part is about 6 lines, and bound-run's header scopes the file to "fail-open wrapping and the run-ledger lookup". |
| DC-6 | Where the contract and the residual are written down | (a) the hook header plus a `gate.md` Claude-binding paragraph that links this doc's matrix; (b) (a) plus a `jq` requirement in `README.md`'s Quickstart; (c) the hook header only | (a) | `gate.md:41-56` is the spec that already describes this hook, and the codex precedent recorded its matrix in the binding's spec surface (its POC record). (c) leaves the gate spec stating a behaviour (JSON deny) without its crash half. (b) matters only because DC-3 (a) makes `jq` a hard prerequisite for Bash under the plugin. Today no operator doc names `jq`. Pick (b) if DC-3 (a) is taken and operators should learn this before they install. Touching the README also runs the README drift guards (`test/readme-drift.test.js`). |
| DC-7 | Signal deaths | (a) leave them as documented residual; (b) add `trap 'exit 143' TERM` so a TERM becomes exit 2 once the running child exits (B13); HUP would need its own trap, not pinned | (a) | SIGKILL cannot be caught (B12), so a residual remains either way. Nobody has proven which signal Claude Code sends a hook, if any, or what it then does with the call. (b) would harden a trigger no one has observed, against the user's harden-only-on-proof rule. B13 is recorded so that a later probe can adopt (b) cheaply. |
| DC-8 | A clean exit that reached no verdict (B19: a syntax error below the trap ends with status 0 on bash 3.2) | (a) accept it: the trap returns on any status 0, and the case is left to `shellcheck` and the hook tests before merge; (b) a `verdict_reached` flag set only by `allow` and after the JSON deny, with the trap denying status 0 without it | (b) | Under (a) the trap itself introduces a fail-open: today bash's syntax-error status 2 denies, and with the trap that case allows (B19, 3/3). It cannot ship through CI, because `shellcheck` exits 1 on the file and every deny test would fail, but a hand-edited or corrupted install would reach it. (b) restores today's deny with its own reason (B20). It costs an `allow` function, one flag and the four `exit 0` lines turned into `allow`, and stays 26/26 identical on the clean paths. It is the bash counterpart of ADR-519 (deny when no verdict is reached), which the user ratified for the codex guard on a fixture-only trigger. |

Settled already, so not candidates: whether to harden (the user's rule, met by the probe), the
registered command and file path (R4, pinned by `test/hooks.test.js:275`), and the JSON deny as the
matcher's verdict channel (gate spec, deny-over-rewrite).

## Test strategy

Part gate: `node --test test/hooks.test.js`. Phase gate: `bash scripts/ci.sh`. Pipe both to a file
and read back only the summary and any failure.

New tests in `test/hooks.test.js`, git-hook section. Each one except the two R2 pins is red on
today's code, with the exit observed in the hook-level matrix:

| Title | Fixture | Assertions | Today |
|---|---|---|---|
| Given PATH without cat, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr | cat missing | `status === 2`; stderr matches `crashReason(127)`; stdout `''` | exit 127 |
| Given PATH without jq, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr | jq missing | same, `crashReason(127)` | exit 127 |
| Given PATH without sed, when git-no-ext-diff runs on a matching command, then it exits 2 with the crash reason on stderr | sed missing | same, `crashReason(127)` | exit 127 |
| Given stdin that is not JSON, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr | stdin not JSON | `status === 2`; stderr matches `crashReason(5)`; stdout `''` | exit 5 |
| Given PATH without grep, when git-no-ext-diff runs, then it exits 2 instead of allowing (DC-4 (a)) | grep missing | `status === 2`; `crashReason(127)`; stdout `''` | **exit 0** |
| Given a matching git diff followed by more than a pipe buffer of lines, when git-no-ext-diff runs, then it denies with the corrected command (DC-4 (a)) | matching command past the pipe buffer | `status === 0`; parsed `permissionDecision === 'deny'`; reason includes `git diff --no-ext-diff HEAD` | **exit 0, empty stdout** |
| Given PATH without cat and stderr closed, when git-no-ext-diff runs, then it still exits 2 | cat missing: inside `withToolsOnly([], …)`, spawned as `spawnSync('/bin/bash', ['-c', '/bin/bash "$0" 2>&-', GIT_HOOK], { input: DENY_DIFF_PAYLOAD, env: { PATH: dir } })` | `status === 2` | exit 127 (and exit 1 with a trap that lacks `\|\| true`, B17) |
| Given a hook copy with a syntax error right below its trap, when it runs, then it exits 2 with a craft reason (DC-8 (b)) | `withHookCopy` (Part 2 helpers): copy `hooks/git-no-ext-diff.sh` into a mktemp dir, insert `if then fi` after the first line starting `trap `, run with `DENY_DIFF_PAYLOAD` | `status === 2`; stderr matches `/^craft git-no-ext-diff: .*, call denied$/m` (bash 5's status on CI was not pinned: the cause may read `no verdict reached` or `failed (exit 2)`) | red: today there is no `trap ` line, so the helper throws on the missing anchor; exit 0 under DC-8 (a) |
| Given a compliant command, when git-no-ext-diff runs, then it exits 0 with empty stdout and stderr (R2 pin, not red) | `no-ext-diff-allow-compliant.json` via `runGitHook` | `status === 0`; `stdout === ''`; `stderr === ''` | green: pins that the trap prints nothing on the allow path |
| Given a git diff without --no-ext-diff, when git-no-ext-diff runs, then stderr stays empty beside the JSON deny (R2 pin, not red) | `no-ext-diff-deny-diff.json` via `runGitHook` | `status === 0`; `stderr === ''` | green: same, on the deny path |

`status === 2` in the table is written against `CRASH_DENY_EXIT_CODE`. `crashReason(127)` asserts
the exact status, which pins that the trap passes the original status through. A trap that always
printed `exit 2` would fail it. The cat-missing test also pins the
trap's position. The existing allow tests (`decision(...) === ''`, which throws on a non-zero
status) stay as they are and keep pinning that every allow exits 0 under the trap.

The pipe-buffer test's redness today is pinned on BSD grep (B16, 3/3). The implementer confirms it
is red on CI's GNU grep by running it against today's hook before the Part 1 change (RED step). If
GNU grep does not take the SIGPIPE, the test stays as a regression pin, and the PR records that
it was green there.

Not tested in the suite, and why: signal deaths and a missing `/bin/bash` (residual, not reachable
from in-hook code), and a live Claude Code run (paid; the exit-2 → deny contract is pinned in the
probe matrix above, and this change adds no new exit status). Mutation testing is configured for
`engine/` only, so the hook's coverage comes from the red tests above, one per branch of
`deny_on_crash` and of the matcher `case`. The `no verdict reached` branch is reached only where
bash ends a syntax error with status 0. That is pinned on bash 3.2 (B19), and the test asserts
locally on macOS. On CI's bash 5 it may take the `failed (exit 2)` branch instead.

Prose checks: `bash scripts/design-lint.sh` on this doc. `scripts/ci.sh` runs intention-lint over
`gate.md` and `BACKLOG.md`, `backlog-lint`, and `shellcheck` over `hooks/*.sh`.

## Out of scope

- `hooks/hooks.json`, the registered command, the shebang: unchanged (R4).
- The residual itself: `/bin/bash` missing, the hook file unrunnable, signal deaths (DC-7).
  Documented, not fixed.
- What Claude Code does when a hook outlives its timeout. To prove it: register a copy that runs
  `sleep` past the configured `timeout`, and read whether MARKER appears, as in the probe.
- `hooks/reorient-after-compact.sh` and `hooks/steer-compact-summary.sh`: by design they never
  block (`never_block`), so a crash there allowing the event is intended.
- Capping the Bash command size. Large matching commands now deny correctly, and a size limit is
  separate behaviour nobody asked for.
- `adapters/cursor/hooks/craft-guard.js`: tracked by its own open BACKLOG entry (line 180).
- Replacing `jq` with builtins so the hook has no `jq` dependency at all. That changes the parser,
  not the crash path. To decide it, measure how often `jq` is missing on Claude Code hosts first.
