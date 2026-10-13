# Plan — Claude Code binding: a crashing git guard hook still denies

> Source: design doc `docs/contributing/design/claude-hook-nonzero-exit-probe.md` · ADRs 533, 534, 535, 536, 537, 538, 539, 540
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.
- A part should land in ~100 tool calls. More than ~5 RED→GREEN cycles, or more than 6
  files in its `### Context` block, is two parts. What counts is a backticked path:
  backtick the files the part CREATES or EDITS, and write read-only reference paths in
  plain text.

Shape of this plan: Part 1 is the code change: the hook, its why-comments and header, and the
ten new tests that pin it. It is one atomic commit with five RED→GREEN cycles. Part 2 is
docs-only, with no code delta: the gate-spec paragraph, the README `jq` requirement, and the
README corpus counts that the phase gate checks against the tree. BACKLOG.md is closed by the
orchestrator in the docs phase and is not part of either part.

Baseline measured before planning (this worktree at commit 1290ccb, macOS 27.0.1, `/bin/bash`
3.2.57, BSD grep, jq-1.8.2 first on PATH and jq-1.7.1-apple at /usr/bin/jq):

- `node --test test/hooks.test.js` → tests 61, pass 61, fail 0.
- `shellcheck hooks/git-no-ext-diff.sh` → exit 0.
- `bash scripts/readme-drift.sh .` → exit 1: `docs/contributing/design/ claims 59, tree holds 60`
  and `docs/contributing/adr/ claims 532, tree holds 540`. This plan file adds a 59th plan, so
  the plan count (README claims 58) drifts as well once it is committed.
- `bash scripts/ci.sh` → exit 1. The engine suite fails on its only red test, readme-drift-main
  "Given no root argument, when main runs, then it resolves DEFAULT_ROOT against the real repo
  root and finds no unusable-input errors". `ci.sh` stops there (`ci: engine node --test failed`),
  so the process suite's live-tree readme-drift test never runs. Part 2 clears the drift.
  Part 1's gate therefore does not run the full `ci.sh`.

Prototype run during planning (throwaway mktemp copy of hooks/ and test/, never the worktree).
Every intermediate hook stage of Part 1 below was built and the ten new tests were run against
it. The red/green pattern listed in each TDD step is that measured pattern, not a prediction.
All five stages pass `shellcheck`. The 14 existing git-hook tests stayed green at every stage.

## Decision candidates

Not settled by ADRs 533-540. Each one has a recommendation, and this plan follows it. The
orchestrator may flip one before Part 1 starts.

| # | Choice | Options | Recommendation |
|---|---|---|---|
| PC-1 | Size of the pipe-buffer test payload | (a) `'echo pad\n'` × 8192 = 72 KiB. (b) The design's × 16384 = 144 KiB. (c) × 16384 with a weaker assertion: denied on either channel (exit 2, or exit 0 with a JSON deny). | **(a).** The hook passes the corrected command to `jq -cn --arg fixed "$FIXED"`. On Linux, one exec argument is capped at 128 KiB (MAX_ARG_STRLEN, 32 pages). This is a documented kernel limit; it was not run here. At 144 KiB, CI's ubuntu would fail the exec of the final `jq`, and the new trap would turn that into exit 2. That is still a deny, but it is not the JSON deny the test asserts. So (b) would be red on CI after GREEN. 72 KiB is past the 64 KiB pipe buffer: it was measured red on today's hook here (3/3) and green on the final shape (3/3). Cost of (a): redness on CI's GNU grep is a race, because the writer's 9 KiB remainder can fit in the pipe. The design already accepts that this test may only be a regression pin on CI. |
| PC-2 | Where the hook header paragraph lands | (a) Part 1, REFACTOR step. (b) Part 2, with the prose. | **(a).** The why-comment ships with the code it explains. This keeps Part 2 docs-only (no `hooks/` delta), and a reviewer reads the header and the code in one commit. |
| PC-3 | Where the gate.md crash paragraph sits | (a) An indented continuation paragraph inside the `hooks/git-no-ext-diff.sh` bullet. (b) A new top-level `**crash-deny**:` paragraph next to `**tool-guard**:` and `**gate-command**:`. | **(a).** The contract belongs to this one hook. A top-level label would read as if it applied to every Claude hook, but the two compaction hooks never block by design. |

## Part 1 — the git hook denies every crash bash can see

### Context

Files this part edits (nothing else):

- `hooks/git-no-ext-diff.sh` — the Claude Code PreToolUse(Bash) guard. It is 32 lines today,
  `#!/bin/bash`, and has no functions.
  - Lines 1-8: header comment (purpose, deny-over-rewrite rationale). Keep every line.
  - Line 9: `set -euo pipefail`.
  - Line 11: `IN=$(cat)`.
  - Line 12: `CMD=$(printf '%s' "$IN" | jq -r '.tool_input.command // empty')`.
  - Line 13: `[ -z "$CMD" ] && exit 0` (allow).
  - Lines 15-19: comment plus `case "$CMD" in *--no-ext-diff*) exit 0 ;; *"rtk proxy"*)   exit 0 ;; esac`
    (two allows; the rtk line is aligned with three spaces before `exit`).
  - Lines 21-23: the regex comment. Line 24: `GIT_RE='…'`. Leave both byte-identical.
  - Lines 25-27: `if ! printf '%s' "$CMD" | grep -qE "$GIT_RE"; then exit 0; fi`. This is the
    matcher; `!` reads any grep failure as no-match.
  - Lines 29-30: comment plus `FIXED=$(printf '%s' "$CMD" | sed -E "…")`. Unchanged.
  - Line 32: `jq -cn --arg fixed "$FIXED" '{hookSpecificOutput:{…permissionDecision:"deny"…}}'`
    is the JSON deny and the last command. Unchanged.
- `test/hooks.test.js` — 807 lines, CommonJS, node:test `test(...)` (no describe), `assert`
  from node:assert. Already imported: `execFileSync, spawnSync`, `fs`, `os`, `path`. Consts:
  `ROOT`, `HOOKS_DIR` (line 11) and `HOOK_FIXTURES` (line 12, test/fixtures/hooks).
  - `runHook(hookName, fixtureName)` (lines 14-32) runs `execFileSync('bash', …)` with the
    inherited env. It cannot restrict PATH, and it returns trimmed stdout without stderr on
    success. Do not reuse it for the new tests. `decision(...)` and `reason(...)` (34-50) throw
    on a non-zero status.
  - Sections: deny matrix (52-114), allow matrix (115-152, the last test ends with `);` on line
    152), blank line 153, then the `// compaction hooks …` banner at 154-156. Insert the new
    section between line 152 and the compaction banner, with its own banner
    `// git-no-ext-diff.sh — a crash still denies` in the same three-line `// ---…` style.
  - Precedents to mirror, not reuse: `runHookWithPayload` (line 160:
    `spawnSync('/bin/bash', [hookPath], { input, encoding: 'utf8', env })`); the empty-PATH
    compaction test (around line 402: `fs.realpathSync(fs.mkdtempSync(...))`, then
    `try … finally fs.rmSync`); `withSpacedRoots` (around line 231). House test style: a
    Given/When/Then title; the body as Arrange, `const sut = <function>;`, Act
    `const result = sut(...)`, Assert.
  - Must stay green with no edit: all 61 existing tests. That includes line ~275, "Given
    hooks/hooks.json, when parsed, then PreToolUse binds Bash to the quoted git-no-ext-diff
    command". The registered command, file path and shebang do not change.

Read-only references (do not edit): hooks/bound-run.sh `never_block` (the house EXIT trap with
the opposite polarity; mirror its `craft <hook>: failed (exit N)` wording, but do not source it);
hooks/hooks.json; test/fixtures/hooks/no-ext-diff-deny-diff.json
(`{"tool_input":{"command":"git diff HEAD~1"}}`) and no-ext-diff-allow-compliant.json
(`{"tool_input":{"command":"git diff --no-ext-diff x"}}`); engine/src/guards/tool-call-guard.js
(its line 13 comment says it mirrors this hook's regex, and the regex is unchanged); the design
doc's hook-level and mechanism matrices.

Measured facts the steps rely on:

- When the EXIT trap is installed, the `printf | grep -q` writer on a 72 KiB matching command
  does not die with status 141 (the design's B16 was measured without a trap). It gets EPIPE,
  prints `<hook>: line N: printf: write error: Broken pipe` and returns 1 (3/3). Under pipefail
  that 1 equals grep's no-match status. So splitting the status alone (cycle 3) still allows,
  and only the here-string (cycle 4) closes this case.
- With stderr closed and a trap whose reason `printf` lacks `|| true`, the hook exits 1 (fail-open).
- On bash 3.2, a syntax error inserted after the `trap` line ends with status 0 under a trap that
  passes status 0 through. Without any trap it ends with 2.
- jq exits 5 on stdin `not json` (jq 1.7.1 and 1.8.2 locally; ubuntu-latest ships 1.7.1).

Hard lines: no edit to hooks/hooks.json, the shebang, `GIT_RE`, the `sed` line or the final `jq`
line. No new dependency. Must still run on bash 3.2. No provenance token anywhere in the hook:
test/source-hygiene.test.js scans `hooks` as shipped code, whole-line and case-insensitive, for
`ADR-n`, `Pn`, `Part n`, `backlog #n`, `DC-n`, and case-sensitive single-letter review ids `R1`,
`T1`, `F1`. No provenance token in test titles or test comments either (same list minus the
review ids). Do not cite the design's matrix row ids (B16, R2, …) in code or tests. No
`mutation`/`gh`/`github` words. No suppression directive (no `# shellcheck disable`). Every
function stays under 20 lines, with nesting at most 2.

Public surface: none. The hook is an entry script with no export, and the new test helpers stay
file-local to test/hooks.test.js.

### TDD steps

Write the new section first: constants and helpers, then the tests in the order of the cycles
below. Each test is added at its RED step, so the file always holds only tests whose cycle has
started.

```js
// ---------------------------------------------------------------------------
// git-no-ext-diff.sh — a crash still denies
// ---------------------------------------------------------------------------

const GIT_HOOK = path.join(HOOKS_DIR, 'git-no-ext-diff.sh');
const DENY_DIFF_PAYLOAD = fs.readFileSync(path.join(HOOK_FIXTURES, 'no-ext-diff-deny-diff.json'));
const ALLOW_COMPLIANT_PAYLOAD = fs.readFileSync(path.join(HOOK_FIXTURES, 'no-ext-diff-allow-compliant.json'));
const CRASH_DENY_EXIT_CODE = 2;
const COMMAND_NOT_FOUND_STATUS = 127;
const JQ_PARSE_ERROR_STATUS = 5;
// 'echo pad\n' × 8192 = 72 KiB: past the 64 KiB pipe buffer, under the 128 KiB one exec argument may hold
const PIPE_BUFFER_OVERFLOW_LINES = 8192;
const ANY_CRAFT_DENY_REASON = /^craft git-no-ext-diff: .*, call denied$/m;
const SYNTAX_ERROR_LINE = 'if then fi';

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

function assertCrashDeny(result, status) {
  assert.strictEqual(result.status, CRASH_DENY_EXIT_CODE, result.stderr);
  assert.match(result.stderr, crashReason(status));
  assert.strictEqual(result.stdout, '');
}
```

Test bodies for the four PATH-restricted crash tests:

```js
withToolsOnly(<tools>, (toolsDir) => {
  const sut = runGitHook;
  const result = sut(DENY_DIFF_PAYLOAD, { PATH: toolsDir });
  assertCrashDeny(result, COMMAND_NOT_FOUND_STATUS);
});
```

Both GUARD pins (G1, G2) go in first. They are green on today's hook and must stay green
after every GREEN below. They are the proof that the trap prints nothing and changes no status
on a clean path:

- G1 — `Given a compliant command, when git-no-ext-diff runs, then it exits 0 with empty stdout and stderr`:
  `sut(ALLOW_COMPLIANT_PAYLOAD)`; `status === 0`, `stdout === ''`, `stderr === ''`. Passes today:
  the `*--no-ext-diff*` case exits 0 silently.
- G2 — `Given a git diff without --no-ext-diff, when git-no-ext-diff runs, then stderr stays empty beside the JSON deny`:
  `sut(DENY_DIFF_PAYLOAD)`; `status === 0`, `stderr === ''`,
  `JSON.parse(result.stdout).hookSpecificOutput.permissionDecision === 'deny'`. Passes today:
  the final `jq` is the last command and succeeds.
- Also GUARD: all 61 existing tests. Re-run the whole file at each GREEN.

Cycle 1 — an EXIT trap maps every non-zero status to exit 2

1. RED — `Given PATH without cat, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr`
   (`withToolsOnly([], …)`). Fails today: status 127, from `cat: command not found` under errexit.
   This test also pins the trap's position. With the trap installed below `IN=$(cat)`, it stays
   red.
2. RED — `Given PATH without jq, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr`
   (`withToolsOnly(['cat'], …)`). Fails today: status 127.
3. RED — `Given PATH without sed, when git-no-ext-diff runs on a matching command, then it exits 2 with the crash reason on stderr`
   (`withToolsOnly(['cat', 'jq', 'grep'], …)`). Fails today: status 127, after the matcher has
   matched.
4. RED — `Given stdin that is not JSON, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr`:
   `sut('not json')` with the full env; `assertCrashDeny(result, JQ_PARSE_ERROR_STATUS)`. Fails
   today: status 5 with `jq: parse error …` on stderr.
5. GREEN — right after `set -euo pipefail`, add:

   ```bash
   readonly CRASH_DENY_EXIT_CODE=2

   deny_on_crash() {
     local rc="$1"
     [ "$rc" -eq 0 ] && return 0
     local cause="failed (exit $rc)"
     printf 'craft git-no-ext-diff: %s, call denied\n' "$cause" >&2
     exit "$CRASH_DENY_EXIT_CODE"
   }
   trap 'deny_on_crash "$?"' EXIT
   ```

   Nothing but constant assignments and the function may sit between `set` and `trap`. Result:
   tests 1-4 pass, and G1, G2 and the 61 existing tests stay green.

Cycle 2 — the deny survives a closed stderr

6. RED — `Given PATH without cat and stderr closed, when git-no-ext-diff runs, then it still exits 2`:
   inside `withToolsOnly([], (toolsDir) => …)`, use `const sut = spawnSync;` and
   `sut('/bin/bash', ['-c', '/bin/bash "$0" 2>&-', GIT_HOOK], { input: DENY_DIFF_PAYLOAD, env: { PATH: toolsDir } })`;
   assert `status === CRASH_DENY_EXIT_CODE`. Fails after cycle 1 with status 1: the reason
   `printf` fails on the closed fd, errexit aborts the trap before its `exit 2`, and the hook
   fails open.
7. GREEN — end the reason line with `>&2 || true`. Put this why-comment directly above it:
   `# errexit still applies here: a failed write must not abort the trap before the deny`.
   Only this line gets `|| true`.

Cycle 3 — only grep's no-match status allows

8. RED — `Given PATH without grep, when git-no-ext-diff runs, then it exits 2 instead of allowing`
   (`withToolsOnly(['cat', 'jq'], …)`, `assertCrashDeny(result, COMMAND_NOT_FOUND_STATUS)`).
   Fails after cycle 2 with status 0 and empty stdout, which is an allow: `!` reads grep's 127
   as no-match, so the trap sees 0.
9. GREEN — add `readonly GREP_NO_MATCH=1` next to the other constant, and replace lines 25-27
   with:

   ```bash
   match_status=0
   printf '%s' "$CMD" | grep -qE "$GIT_RE" || match_status=$?
   case "$match_status" in
     0) ;;
     "$GREP_NO_MATCH") exit 0 ;;
     *) exit "$match_status" ;;
   esac
   ```

   The pipe stays for now: the next cycle replaces it, driven by its own red test.

Cycle 4 — a here-string, so a large matching command cannot read as no-match

10. RED — `Given a matching git diff followed by more than a pipe buffer of lines, when git-no-ext-diff runs, then it denies with the corrected command`:
    ```js
    const command = `git diff HEAD\n${'echo pad\n'.repeat(PIPE_BUFFER_OVERFLOW_LINES)}`;
    const sut = runGitHook;
    const result = sut(JSON.stringify({ tool_input: { command } }));
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stderr, '');
    assert.notStrictEqual(result.stdout, '', 'expected a JSON deny on stdout, got an allow');
    const output = JSON.parse(result.stdout).hookSpecificOutput;
    assert.strictEqual(output.permissionDecision, 'deny');
    assert.ok(output.permissionDecisionReason.includes('git diff --no-ext-diff HEAD'));
    ```
    Fails after cycle 3 with an allow: status 0, empty stdout, and stderr
    `…: printf: write error: Broken pipe`. `grep -q` stops reading at the first line, the writer
    gets EPIPE and returns 1, pipefail reports that 1, and the split reads it as no-match. On
    today's hook (no trap) the same payload is a silent allow (status 0, empty stdout and
    stderr; measured during planning, 3/3). This redness is pinned on macOS BSD grep only. CI
    runs the test after GREEN, so CI cannot show whether GNU grep also loses the race. The PR
    body records that the test's redness on GNU grep is unconfirmed, and that on GNU grep it may
    be only a regression pin (the design accepts this).
11. GREEN — replace `printf '%s' "$CMD" | grep -qE "$GIT_RE" || match_status=$?` with
    `grep -qE "$GIT_RE" <<<"$CMD" || match_status=$?`. Add a why-comment above the matcher
    block: the input is a here-string so no writer process exists for an early-exiting
    `grep -q` to break, and only grep's no-match status allows, so any other status is a crash
    and denies. The trailing newline the here-string adds is ignored by line-based grep. G1, G2
    and the 61 existing tests prove the clean paths are unchanged on the committed fixtures,
    which are all single-line. The design's prototype pinned multi-line and piped payloads
    byte-identical (26/26); no suite test covers a multi-line allow.

Cycle 5 — a clean exit with no verdict denies

12. RED — `Given a hook copy with a syntax error right below its trap, when it runs, then it exits 2 with a craft reason`:
    ```js
    withHookCopy({ anchor: 'trap ', inserted: SYNTAX_ERROR_LINE }, (result) => {
      assert.strictEqual(result.status, CRASH_DENY_EXIT_CODE, result.stderr);
      assert.match(result.stderr, ANY_CRAFT_DENY_REASON);
    });
    ```
    Fails after cycle 4 on bash 3.2 with status 0: bash ends the syntax error with status 0
    under the trap, and `deny_on_crash` passes 0 through. On today's hook the helper throws
    `no line starts with trap `. The regex accepts either reason because CI's bash 5 status was
    not pinned. There the test may already be green at this step, which makes it a GUARD on
    CI. The local run on macOS `/bin/bash` is the RED.
13. GREEN — add `verdict_reached=0` after the constants, and an `allow` function:

    ```bash
    allow() {
      verdict_reached=1
      exit 0
    }
    ```

    In `deny_on_crash`, change the first test to
    `[ "$rc" -eq 0 ] && [ "$verdict_reached" -eq 1 ] && return 0` and add
    `[ "$rc" -eq 0 ] && cause="no verdict reached"` after the `cause=` line. Replace each of the
    four allow `exit 0` lines (empty command, `*--no-ext-diff*`, `*"rtk proxy"*`, and the
    `"$GREP_NO_MATCH"` case arm) with `allow`, keeping the rtk line's three-space alignment.
    Add `verdict_reached=1` as the last line, after the final `jq`. Add a why-comment on the
    flag: bash 3.2 ends a syntax error below the trap with status 0, so only a reached verdict
    may exit clean. Result: all 10 new tests and the 61 existing ones pass, 71 in total.

REFACTOR (all tests green before and after):

- Final shape, top to bottom: header; `set -euo pipefail`; `readonly CRASH_DENY_EXIT_CODE=2`
  and `readonly GREP_NO_MATCH=1`; `verdict_reached=0`; `allow`; `deny_on_crash`; `trap`;
  `IN=$(cat)` and the rest. It must match the design's "Shape" block, with the comments above
  added. Nothing that can fail runs before the `trap` line.
- Header: keep lines 1-8 verbatim. After line 8 add a `#` spacer line and this paragraph
  (wording may be tightened, the facts may not change):

  ```bash
  # Crash path: Claude Code (2.1.296) runs the Bash call on every hook exit status except 2,
  # and the model never sees the crash. So every failure below (a missing tool, stdin that
  # is not JSON, a grep that neither matches nor cleanly misses, a clean exit with no
  # verdict) ends in exit 2 with a `craft git-no-ext-diff:` reason on stderr, never in the
  # status that crashed. The matcher's own verdict stays the JSON deny on stdout.
  # Still fails open, because no code here runs to catch it: /bin/bash missing, this file
  # missing or not executable, death by a signal, a kill by Claude Code's hook timeout.
  ```

- Run `shellcheck hooks/git-no-ext-diff.sh` and fix findings in code, never with a directive.
  The prototype of this exact shape passes. `allow` and `deny_on_crash` are reached only through
  calls and the trap; shellcheck does not flag that.
- Re-read the diff for provenance tokens and matrix row ids in the hook and in the new test
  section.

### Gate

Run from the worktree root. Write output to files and read back only the summary and failures:

```bash
LOG="$(mktemp -d)"
node --test test/hooks.test.js > "$LOG/hooks.log" 2>&1; echo "exit=$?"; grep -nE '^# (tests|pass|fail)|^not ok' "$LOG/hooks.log"
shellcheck scripts/*.sh hooks/*.sh; echo "shellcheck=$?"
node --test test/source-hygiene.test.js > "$LOG/hygiene.log" 2>&1; echo "exit=$?"; grep -nE '^# (pass|fail)|^not ok' "$LOG/hygiene.log"
```

Expected: hooks suite has tests 71, pass 71, fail 0. shellcheck exits 0; this is the exact
invocation from scripts/static-lints.sh line 7. source-hygiene has fail 0. Do not run the full
`bash scripts/ci.sh` as this part's gate: it stays red on the readme-drift corpus counts until
Part 2 lands (baseline above). Never commit on a red gate.

### Commit

`fix(hooks): deny every crash of the git guard hook`

## Part 2 — operator docs: the gate-spec crash contract, the README jq requirement, the corpus counts

### Context

Docs only, no code delta. Files this part edits (nothing else):

- `docs/contributing/specs/gate.md` — section `## Claude binding` (line 41). The
  bullet for hooks/git-no-ext-diff.sh runs over lines 47-56, with continuation lines indented by
  two spaces. It ends `retry, no clobber.` on line 56. Line 57 is blank, and line 58 opens
  `**gate-command**:`. Insert a blank line, then a continuation paragraph indented by two spaces,
  right after line 56 (inside the bullet). It must sit before the blank line that precedes
  `**gate-command**:`. Text (wrapped at ~100 columns like its neighbours; the wording may be
  tightened, the facts may not change):

  ```
    On a crash: Claude Code 2.1.296 treats only exit 2 from a PreToolUse hook as a deny. Exit 1,
    exit 127 and a signal death run the Bash call and show the model a clean result, while exit
    2's stderr reaches the model as `PreToolUse:Bash hook error: [<hook path>]: <stderr>`. So the
    hook turns any failure bash can see into exit 2 with
    `craft git-no-ext-diff: failed (exit <n>), call denied` on stderr, where `<n>` is the status
    it would have exited with, or `craft git-no-ext-diff: no verdict reached, call denied` when
    it would have exited 0 before reaching a verdict. The JSON deny stays the matcher's verdict,
    and a grep failure is a crash, never a no-match. With `jq` missing from `PATH`, every Bash
    call is denied. Still fail-open, because no code in the hook can catch them: `/bin/bash`
    missing, the hook file missing or not executable, death by a signal, and a kill by Claude
    Code's own hook timeout (not probed). The probe matrix is in
    [the design doc](../design/claude-hook-nonzero-exit-probe.md).
  ```

  This file is in the source-hygiene scan (no `mutation`/`mutant`/`gh`/`github` word, no
  home-rooted path) and in the intention-lint living corpus (SoT pointers only; this edit adds
  none). The relative link resolves to the design doc from docs/contributing/specs/.
- `README.md` (root) has two edits:
  - Lines 99-100, the Quickstart `Requirement:` sentence. Today:

    ```
    Requirement: **a discoverable test command** (`pytest`, `go test`, `cargo test`,
    `make test`, …). No test command → craft refuses to run, by design.
    ```

    After (exactly; three lines):

    ```
    Requirement: **a discoverable test command** (`pytest`, `go test`, `cargo test`,
    `make test`, …) and `jq` on `PATH` (the Claude Code guard hook denies every Bash call
    without it). No test command → craft refuses to run, by design.
    ```

  - Lines 199-200, section `## craft builds craft`, the receipts sentence:
    `[59 design docs](docs/contributing/design/)`, `[58 parted plans](docs/contributing/plan/)`,
    `[532 ADRs](docs/contributing/adr/)`. readme-drift checks these against the tree
    (scripts/readme-drift.sh → engine/bin/readme-drift.js, sub-guard corpus counts). Set each one
    to the count `bash scripts/readme-drift.sh .` reports at implementation time. When this plan
    was written, that was 60 design docs, 59 parted plans (this plan included) and 540 ADRs.
    Take the numbers from the tool, not from this text: a later commit may add a file. Touch
    only the three numbers.

Read-only references: docs/contributing/design/claude-hook-nonzero-exit-probe.md (Context
matrices, Part 3 prose, Edge behaviour), and the Part 1 hook as committed
(hooks/git-no-ext-diff.sh). The gate.md and README claims must match what the hook does and
what its header says.

README guards this part must keep green (all run by `bash scripts/ci.sh`):
test/readme-drift.test.js (the live-tree test plus three mutated-copy tests, anchored on the
`yaml` block opening `pipeline:`, the FAQ heading and the counted directory links, never on line
numbers); engine/test/readme-drift-main.test.js (the DEFAULT_ROOT live test);
test/readme-comparison.test.js (the Quickstart must stay after the comparison section; the edit
stays inside it); test/source-hygiene.test.js (README.md is scanned for the technique and
VCS-host words, and the new sentence has none). prose-lint (advisory) runs over touched
README.md. It flags filler words such as delve, leverage, seamless, robust, "it's important to
note" and "in conclusion"; use none of them.

Public surface: none (prose only).

### TDD steps

No code delta and no new test. Each edit is checked by an existing test or lint:

1. GUARD — test/source-hygiene.test.js over gate.md and README.md. It passes today, and the new
   paragraph and sentence carry no banned word and no home-rooted path.
2. GUARD — intention-lint over the living corpus (`bash scripts/living-corpus.sh` feeds
   `node engine/bin/intention-lint.js`), `bash scripts/docs-structure-lint.sh docs/contributing`,
   and test/readme-comparison.test.js. They pass today; the edits add no SoT pointer, no dated
   doc and no heading move.
3. RED (existing tests, already failing) — engine/test/readme-drift-main.test.js "Given no root
   argument, when main runs, then it resolves DEFAULT_ROOT against the real repo root and finds
   no unusable-input errors", and test/readme-drift.test.js "Given the live repo tree, when
   readme-drift runs, then it exits 0 with no findings". Both fail at the start of this part
   because the README claims 59 design docs, 58 plans and 532 ADRs while the tree holds more
   (baseline above).
4. GREEN — set the three README numbers to the counts `bash scripts/readme-drift.sh .`
   reports. Both tests pass.

Order: edit gate.md, then the README requirement sentence. Then run
`bash scripts/readme-drift.sh .` and set the README counts from its output.

REFACTOR: re-read the gate.md paragraph and the README sentence against the committed hook.
Every claim must match its code and its header comment: what exits 2, the two reason strings,
and what still fails open.

### Gate

Run from the worktree root. Write output to files and read back only the summary and failures:

```bash
LOG="$(mktemp -d)"
bash scripts/readme-drift.sh .; echo "exit=$?"
node --test test/readme-drift.test.js test/readme-comparison.test.js test/source-hygiene.test.js test/docs-structure-lint.test.js > "$LOG/docs.log" 2>&1; echo "exit=$?"; grep -nE '^# (pass|fail)|^not ok' "$LOG/docs.log"
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail|^ci:|SLOP-FOUND|STUB-FOUND|-lint: ' "$LOG/ci.log" | head -40
```

Expected: readme-drift exits 0 with no findings, the four docs suites report fail 0, and
`ci.sh` exits 0. `ci.sh` runs every suite including the 71 hook tests, intention-lint, the
static lints (shellcheck, backlog-lint, design-lint, docs-structure-lint) and the stub, prose
and adr lints. Never commit on a red gate.

### Commit

`docs(gate): record the Claude hook exit-status contract and the jq requirement`
