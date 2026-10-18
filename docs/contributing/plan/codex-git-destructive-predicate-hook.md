# Plan — codex-git-destructive-predicate-hook

> Source: design doc `docs/contributing/design/codex-git-destructive-predicate-hook.md` · ADRs `640, 641`
> (both ratified by the user: DC-1 (a) one shared engine export,
> `engine/src/guards/git-bash-verdict.js`, exporting only `plainGitCommandVerdict` (640);
> DC-2 (b) codex takes the plain-command gate in-process, with no deadline and no worker; the hook
> process is unchanged (641))
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

## Plan shape (3 parts)

| # | Part | src delta | Files | Design section |
|---|---|---|---|---|
| 1 | Shared Bash verdict in the engine; copilot calls it | new engine module (+~20), copilot adapter (−~15) | 3 | Design Part 1 |
| 2 | Codex composes the shared verdict | codex adapter (+~10) | 5 | Design Parts 2 and 3 |
| 3 | Disclosure, regenerated rules, codex docs | rules generator (string constant) | 6 | Design Part 4 |

How the design's choices land here:

- The design's Part 3 (the hook process) resolves to DC-2 (b): `adapters/codex/hooks/craft-guard.js`
  is **not edited**. Its hook-process tests exercise Part 2's code (they are RED until Part 2's
  GREEN), so they fold into plan Part 2. A standalone hook-test part would be a pure test pass.
- Dropped as DC-2 (a)/(c)-only: no `gitCommandVerdict` export, no move of `verdict-race.js` /
  `verdict-deadline.js`, no `craft-guard-worker.js` for codex, no deadline tests, no
  `CRAFT_GUARD_DEADLINE_MS` on codex.
- Not in this plan, by instruction: the BACKLOG tick (documentation phase, at merge); the
  differential-fuzz arm and its harness extraction (`engine/test-helpers/git-differential-harness.js`,
  the `mutation-config.test.js` row) run at review cycle 1, session-owned. The design places the fuzz
  under "run at review cycle 1", not in a part. The root README design-doc count (82) already
  landed with the design commit; this plan commit bumps the parted-plan count 79 → 80. No part
  touches the root README.
- Untouched (R6): `adapters/codex/hooks.json`, the `config.template.toml` hook block,
  `toolCallGuard`, and the pi / cursor / opencode / antigravity adapters.

Pre-validated in a mktemp throwaway copy of this branch (`f2fbc41`), with the exact GREEN code
of Parts 1 and 2 below applied:

| Check | Result |
|---|---|
| codex `git-guard-adapter.test.js` + `git-guard-predicate.test.js` + `craft-guard-hook.test.js`, unchanged | 71 pass / 0 fail |
| copilot `git-guard-adapter.test.js` and the other copilot suites, unchanged | all git-guard rows pass (the only failures were the throwaway's missing `agents/` dir) |
| real hook, 0.162.1 fixture payload, `git -C . push origin main` | exit 2, stderr `craft-guard: craft: destructive git (push) is denied in this binding — run it outside the agent`, stdout empty |
| same, `git --git-dir=.git push origin main` | exit 2, push reason, stdout empty |
| same, `bash -lc "git push"` | exit 2, `craft-guard: craft: command too complex to verify near git — spell it plainly` |
| same, `git status` | exit 0, stdout and stderr empty |

Pinned verdicts of the composition (`copilotGuard` today = `plainGitCommandVerdict` after Part 1),
used as the expected values in Parts 1 and 2. `PUSH` / `RESET` / `CLEAN` / `BRANCH` stand for
`craft: destructive git (<what>) is denied in this binding — run it outside the agent` with
`<what>` = `push`, `reset --hard`, `clean without --dry-run`, `forced branch delete`. `GATE` is
`COMPLEX_NEAR_GIT_REASON` (exported by engine/src/guards/git-plain-command-gate.js).

| Command (JS string) | Verdict |
|---|---|
| `'git push origin main'`, `'git -C . push origin main'`, `'git --git-dir=.git push origin main'`, `'GIT push'`, `'rtk git push'`, `'git push; git diff'` | block, PUSH |
| `'git reset --hard'` / `'git clean -fd'` / `'git branch -D x'` | block, RESET / CLEAN / BRANCH |
| `"bash -lc 'git push'"`, `'command git push'`, `'env git push'`, `'G=git; $G push'`, `'export GIT_CONFIG_COUNT=1; git push'`, `'@(git) push'`, `'shopt -s extglob\n@(git) push'`, `"C=-c; bash $C 'git push'"`, `'{$(:),git,push}'`, `'echo $[1<<2]\ngit push'`, `"echo 'git push' \| sh"`, `'echo push \| xargs git'`, `"printf 'git reset --hard\\n' \| bash"`, `'git -c alias.p=push p'` | block, GATE |
| heredoc idiom `'git commit -m "$(cat <<\'EOF\'\nx)"; git branch -D victim; echo "\nEOF\n)"'` | block, GATE |
| `'echo $HOME; git status'`, `'git commit -m "fix: \\"q\\""'` (intended false blocks) | block, GATE |
| `'git diff'` | block, `git diff/show must carry --no-ext-diff (external diff mangles parsed output)` |
| `'echo "$('` | block, `craft: command not parseable (unterminated substitution) — denied fail-closed` |
| `'git status'`, `'git commit -m "feat: add x"'`, `'git log --oneline -3 \| head -5'`, `'/usr/bin/git -C /w status'`, `'git commit -F /tmp/msg'`, `'git -c core.quotepath=false status'`, `'git diff --no-ext-diff \| grep x'`, `'rtk proxy git diff'`, `'echo hello'`, `'ls'` | allow, `{ block: false }` |

(`\|` above is the markdown escape of a pipe; the JS string holds a bare `|`.)

Standing rules for every part:

- TDD London School; `describe`/`it` titles in Given/When/Then; AAA bodies with a `sut` variable.
  **New titles are printable ASCII only**: use ` - ` not an em dash, and never put a generated or
  multi-line command in a title (Stryker's tap dry run rejects NEL/U+2028/invisible characters).
  Table-driven rows carry an ASCII `label`; the command stays in the row body.
- No ADR/phase/backlog/probe numbers in source, tests, or `adapters/codex/` authored surfaces.
  `adapters/codex/test/native-surface.test.js` scans `adapters/codex/README.md` and
  `adapters/codex/craft.rules` with `PROVENANCE_REF = /\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i`
  (so "P4", "P1–P7", "Part 4" are banned there) and with `SHELL_INJECTION_PATTERN`, which bans an
  exclamation mark immediately followed by a backtick-delimited span.
- Git: use `/usr/bin/git` for every verb (an `rtk` rewrite trips the worktree guard); scripted
  `git diff`/`git show` pass `--no-ext-diff`. Commit only your own files.
- Pipe `bash scripts/ci.sh` to a file and grep the summary. If a bounded-time shell-tokeniser test
  or a fuzz test dies by SIGTERM under machine load, re-run it unchanged once before calling it red.
- Mutation: one comma-separated `--mutate` per run (repeated flags silently drop all but the last).
  `engine/stryker.conf.json` needs no edit: `engine/src/**/*.js` already mutates the new module,
  `engine/test/**/!(*.differential).test.js` already collects its suite, and the codex/copilot
  adapter files and their `git-guard-adapter.test.js` suites are already listed. If the dry run dies
  with `Worker exited unexpectedly`, narrow `tap.testFiles` to the mutated file's own suites in an
  override config passed positionally, then hand-check every survivor against its full covering
  set before writing a test. Survivors are killed or annotated with the repo's
  `// equivalent mutant (<Mutator>): <why>` convention.

## Part 1 — Shared Bash verdict in the engine; copilot calls it

### Context

Files this part creates or edits:

- `engine/src/guards/git-bash-verdict.js` — CREATE. The move of copilot's `bashBlock`.
- `engine/test/guards/git-bash-verdict.test.js` — CREATE.
- `adapters/copilot/src/git-guard-adapter.js` — EDIT: delete `bashBlock` and its four imports;
  `copilotGuard` calls `plainGitCommandVerdict`.

Public-surface decision: `plainGitCommandVerdict` is **internal** to the repo. It is imported by
relative path from the two adapters (as every engine guard is), and it is NOT added to the
engine barrel engine/src/index.js (which exports no guard). No API report, registry or
exhaustiveness switch lists engine guards. The one doc inventory that lists guard modules
(docs/contributing/specs/gate.md, "Guard modules" paragraph) is updated in Part 3 with the other
gate.md edits. `parsedGitVerdict` stays module-private (DC-2 (b): no `gitCommandVerdict` export).

Current code being moved — adapters/copilot/src/git-guard-adapter.js, lines 7-10 and 108-118:

```js
import { gitPlainCommandGate } from '../../../engine/src/guards/git-plain-command-gate.js';
import { destructiveVerdictFor } from '../../../engine/src/guards/git-destructive-predicate.js';
import { extDiffVerdictFor } from '../../../engine/src/guards/git-ext-diff-predicate.js';
import { gitInvocations, judgeParsed } from '../../../engine/src/guards/shell-git-invocations.js';
// ... line 11 keeps: import { toolCallGuard, WRITE_TOOLS } from '../../../engine/src/guards/tool-call-guard.js';

// The plain-command gate, then the destructive-git and ext-diff verdicts over a
// single parse of the command.
function bashBlock(command) {
  const gate = gitPlainCommandGate(command);
  if (gate.block) {
    return gate;
  }
  const parsed = gitInvocations(command);
  const destructive = judgeParsed(parsed, destructiveVerdictFor);
  return destructive.block ? destructive : judgeParsed(parsed, extDiffVerdictFor);
}
```

`copilotGuard(event)` (line ~126) does `return bashBlock(commandOf(event.tool_input));` on
`event.tool === BASH_TOOL`; it becomes `return plainGitCommandVerdict(commandOf(event.tool_input));`.
The four imports are used by `bashBlock` only (checked); the new import line is
`import { plainGitCommandVerdict } from '../../../engine/src/guards/git-bash-verdict.js';`.
Leave `commandOf`, `withContainmentReason`, `decideGuard`, `buildAuditEntry` and the module
docblock untouched.

Target module (GREEN), engine/src/guards/git-bash-verdict.js:

```js
/**
 * The git verdict for a Bash command, shared by the bindings whose hook judges
 * shell text: the plain-command gate first, then destructive git, then the
 * ext-diff rule, the last two over one parse of the command.
 */
import { gitPlainCommandGate } from './git-plain-command-gate.js';
import { destructiveVerdictFor } from './git-destructive-predicate.js';
import { extDiffVerdictFor } from './git-ext-diff-predicate.js';
import { gitInvocations, judgeParsed } from './shell-git-invocations.js';

function parsedGitVerdict(command) {
  const parsed = gitInvocations(command);
  const destructive = judgeParsed(parsed, destructiveVerdictFor);
  return destructive.block ? destructive : judgeParsed(parsed, extDiffVerdictFor);
}

/**
 * @param {string} command
 * @returns {{ block: boolean, reason?: string }}
 */
export function plainGitCommandVerdict(command) {
  const gate = gitPlainCommandGate(command);
  return gate.block ? gate : parsedGitVerdict(command);
}
```

Reference (read-only): engine/test/guards/git-plain-command-gate.test.js for import style
(`import { COMPLEX_NEAR_GIT_REASON } from '../../src/guards/git-plain-command-gate.js';`);
`judgeParsed(result, verdictFor)` in engine/src/guards/shell-git-invocations.js returns
`{ block: true, reason: result.reason }` for an unparsed command, else the first non-null
`verdictFor` reason, else `{ block: false }`. The gate never throws and returns the frozen
`{ block: false }` / `{ block: true, reason: COMPLEX_NEAR_GIT_REASON }` objects.

Behaviour lock for copilot (R4): adapters/copilot/test/git-guard-adapter.test.js (block
`copilotGuard() — destructive git first, then the tool-call guard`, line ~287) and the copilot
hook tests stay **unedited** and green.

### TDD steps

1. RED — create `engine/test/guards/git-bash-verdict.test.js`, one
   `describe('plainGitCommandVerdict() - gate, then destructive git, then ext-diff over one parse')`
   with `sut = plainGitCommandVerdict`, importing it from `../../src/guards/git-bash-verdict.js` and
   `COMPLEX_NEAR_GIT_REASON` from `../../src/guards/git-plain-command-gate.js`. Rows (verdicts
   from the pinned table above):
   - Given a shell-wrapped push (`"bash -lc 'git push'"`) → `assert.deepEqual` to
     `{ block: true, reason: COMPLEX_NEAR_GIT_REASON }` (the parse alone would give the push
     reason, so this kills a gate-skipped mutant).
   - Given a push chained before a git diff (`'git push; git diff'`) → `deepEqual` the PUSH verdict
     (destructive wins over ext-diff).
   - Given a bare `'git diff'` → `block: true`, reason matches `/--no-ext-diff/`.
   - Given `'git -C . push origin main'` and `'git --git-dir=.git push origin main'` → PUSH.
   - Given an unparseable command with no git word (`'echo "$('`) → `block: true`, reason matches
     `/not parseable/`.
   - Given `'git status'` → `deepEqual({ block: false })`.
   Expected failure: every row fails with `ERR_MODULE_NOT_FOUND` — engine/src/guards/git-bash-verdict.js
   does not exist yet.
2. GREEN — create `engine/src/guards/git-bash-verdict.js` with the target module above.
   `node --test engine/test/guards/git-bash-verdict.test.js` passes.
3. REFACTOR — in `adapters/copilot/src/git-guard-adapter.js` delete the four imports and
   `bashBlock` (with its two-line comment), add the `plainGitCommandVerdict` import, and make
   `copilotGuard` call it.
   GUARD — `node --test adapters/copilot/test/*.test.js`: every row passes before and after (the
   moved function is byte-for-byte the same sequence; pre-validated in the throwaway).
4. Mutation — run
   `npm --prefix engine run mutation -- --mutate "engine/src/guards/git-bash-verdict.js,adapters/copilot/src/git-guard-adapter.js"`
   in the background. Expected for the new module: every `ConditionalExpression` /
   `BlockStatement` mutant killed by step 1's rows (gate-forced-false → the shell-wrapped row;
   gate-forced-true → the `git status`/push rows; destructive-forced-true → the `git diff` row;
   destructive-forced-false → the push rows). Kill or annotate any survivor.

### Gate

- `node --test engine/test/guards/git-bash-verdict.test.js adapters/copilot/test/git-guard-adapter.test.js`
- `npm --prefix engine run mutation -- --mutate "engine/src/guards/git-bash-verdict.js,adapters/copilot/src/git-guard-adapter.js"` (no unannotated survivor)
- `bash scripts/ci.sh > <scratch>/ci.log 2>&1; echo "exit $?"` then grep the log for `fail`/`ci:` lines — exit 0.

### Commit

`refactor(guards): share the plain git Bash verdict as an engine export`

## Part 2 — Codex composes the shared verdict

### Context

Files this part creates or edits:

- `adapters/codex/src/git-guard-adapter.js` — EDIT: new exported `codexGuard(event)`;
  `decideGuard` defaults to it; comments updated.
- `adapters/codex/test/fixtures/pre-tool-use-bash.json` — CREATE: the sanitised 0.162.1 payload.
- `adapters/codex/test/fixtures/pre-tool-use-payload.js` — CREATE: helper `preToolUseBash(command)`.
- `adapters/codex/test/git-guard-adapter.test.js` — EDIT: new describes.
- `adapters/codex/test/craft-guard-hook.test.js` — EDIT: new hook-process rows.

Public-surface decision: `codexGuard` is exported from the codex adapter module (the test seam
and `decideGuard`'s default, mirroring copilot's exported `copilotGuard`). It is adapter-internal:
no barrel, no registry, nothing else imports it. `preToolUseBash` is a test helper. The `fixtures`
directory is excluded from test enumeration by test/every-test-file-registers.test.js
(`EXCLUDED_DIR_NAMES`), and scripts/ci.sh runs only *.test.js files, so neither fixture file is run
as a suite. Stryker copies the fixture into its sandbox with the rest of the tree.

Current code (adapters/codex/src/git-guard-adapter.js):

- Imports, line 14-15: `toolCallGuard, WRITE_TOOLS` from `'../../../engine/src/guards/tool-call-guard.js'`,
  then `extractPatchPaths` from `'./apply-patch-paths.js'`. **Add the new import after these two
  lines**:
  `import { plainGitCommandVerdict } from '../../../engine/src/guards/git-bash-verdict.js';`.
  The crash test `a guard copy whose engine predicate cannot be resolved` in
  adapters/codex/test/craft-guard-hook.test.js asserts stderr matches the regex /tool-call-guard/. The
  module that fails to load first is the one named, so the tool-call-guard import must stay first
  (the throwaway passed with this order).
- `BASH_TOOL_NAME = 'Bash'` (line 17); `CODEX_TOOL_NAMES` maps `exec_command → 'Bash'`,
  `apply_patch → 'Write'`. `adaptCodexEvent(payload)` returns
  `{ tool, tool_input, working_dir }`, and for Bash `tool_input.command` is already a non-empty
  string (`bridgeExecutedCommand` throws otherwise, bridging `command ?? cmd`). For a write tool it
  returns `tool_input: { patchText }`.
- `decideWriteContainment({ tool, tool_input, working_dir }, guard)` loops the patch paths through
  `guard`. Keep its signature; `codexGuard` passes `toolCallGuard`.
- Today:

```js
export function decideGuard(payload, guard = toolCallGuard) {
  try {
    const event = adaptCodexEvent(payload);
    return WRITE_TOOLS.has(event.tool) ? decideWriteContainment(event, guard) : guard(event);
  } catch {
    // (keep this comment block)
    return { block: true };
  }
}
```

Target (GREEN):

```js
/**
 * Bash: the shared git verdict; apply_patch: per-path containment; any other
 * tool: toolCallGuard.
 * @param {{ tool: string, tool_input: object, working_dir: string }} event
 * @returns {{ block: boolean, reason?: string }}
 */
export function codexGuard(event) {
  if (event.tool === BASH_TOOL_NAME) return plainGitCommandVerdict(event.tool_input.command);
  return WRITE_TOOLS.has(event.tool) ? decideWriteContainment(event, toolCallGuard) : toolCallGuard(event);
}

export function decideGuard(payload, guard = codexGuard) {
  try {
    return guard(adaptCodexEvent(payload));
  } catch {
    // (existing comment block unchanged)
    return { block: true };
  }
}
```

Keep `decideGuard`'s reasonless `{ block: true }`: the composition adds no path into the catch
(the gate, `gitInvocations` and `judgeParsed` return verdicts on any string), and the hook already
writes `denied (fail-closed)` for a reasonless block. The existing `throwingGuard` test (line ~306)
injects a whole-event judge and keeps working.

Comment edits (REFACTOR, no behaviour):

- Module docblock (lines 1-13): "reshapes … into the event shape toolCallGuard expects, then applies
  that predicate unmodified" becomes: reshapes the payload into the shared event shape, then judges
  a Bash call with the shared git verdict (plain-command gate, destructive git, ext-diff), an
  apply_patch call with per-path containment, and passes any other tool to toolCallGuard.
- `CODEX_TOOL_NAMES` comment: "Only the tool names the shared predicate branches on" →
  the names `codexGuard` branches on.
- `bridgeExecutedCommand` comment: note the payload was re-pinned on codex 0.162.1, still
  Claude-shaped, and `session_id`, `transcript_path` and `hook_event_name` are ignored like the
  other additive fields. A version number in a comment is allowed (the existing comment names
  0.145.0); no probe or ADR ids.
- `decideGuard` JSDoc `@param` guard: "the whole event judge (defaults to codexGuard)".

Fixture (CREATE `adapters/codex/test/fixtures/pre-tool-use-bash.json`, one line plus newline):

```json
{"session_id":"<session-id>","turn_id":"<turn-id>","transcript_path":"<codex-home>/sessions/rollout.jsonl","cwd":"/repo","hook_event_name":"PreToolUse","model":"gpt-5.4","permission_mode":"bypassPermissions","tool_name":"Bash","tool_input":{"command":"<command>"},"tool_use_id":"call_0"}
```

Helper (CREATE `adapters/codex/test/fixtures/pre-tool-use-payload.js`):

```js
import { readFileSync } from 'node:fs';

const TEMPLATE = Object.freeze(JSON.parse(readFileSync(new URL('./pre-tool-use-bash.json', import.meta.url), 'utf8')));

// The live codex 0.162.1 PreToolUse Bash payload, with its command replaced.
export function preToolUseBash(command) {
  return { ...TEMPLATE, tool_input: { ...TEMPLATE.tool_input, command } };
}
```

Test files (existing helpers to reuse):

- adapters/codex/test/git-guard-adapter.test.js: `WORKING_DIR = '/repo'`, `execPayload(cmd)`,
  `patchPayload(text)`, `patch(...lines)`, `IN_TREE_ADD`, `DECOY_MULTI_HUNK` (lines 1-37). Import
  line 3 becomes `import { codexGuard, decideGuard } from '../src/git-guard-adapter.js';`, plus
  `import { preToolUseBash } from './fixtures/pre-tool-use-payload.js';` and
  `import { COMPLEX_NEAR_GIT_REASON } from '../../../engine/src/guards/git-plain-command-gate.js';`.
  Model the new block on copilot's `copilotGuard() — destructive git first` block
  (adapters/copilot/test/git-guard-adapter.test.js:287).
- adapters/codex/test/craft-guard-hook.test.js: `run(payloadString)` spawns the real hook with
  `process.execPath` (line ~59); describe `craft-guard hook — enforcing exit-code contract`
  (line 82). Add `import { preToolUseBash } from './fixtures/pre-tool-use-payload.js';` and feed
  `run(JSON.stringify(preToolUseBash(command)))`. Do not touch `withGuardCopy`, `ALLOWED_PAYLOAD`
  (`git diff --no-ext-diff`, still allowed under the gate) or the crash-contract describe.
- adapters/codex/test/git-guard-predicate.test.js — NOT edited: its 9 BLOCK and 7 PASS rows give
  the same verdict under the composition (16/16, pinned in the design and in the throwaway).

### TDD steps

1. RED — in `adapters/codex/test/git-guard-adapter.test.js` add
   `describe('decideGuard() - default guard composes the git verdict on the live 0.162.1 payload')`
   (`sut = decideGuard`), rows over `preToolUseBash(command)`. Spell the expected reasons with a
   test-local helper, ``const destructiveReason = (what) => `craft: destructive git (${what}) is denied in this binding — run it outside the agent`;``,
   shared by steps 1 and 2:
   `'git -C . push origin main'` and `'git --git-dir=.git push origin main'` → `deepEqual` PUSH
   verdict; `"bash -lc 'git push'"` → `{ block: true, reason: COMPLEX_NEAR_GIT_REASON }`;
   `'git reset --hard'` → RESET; `'git status'` → `{ block: false }`.
   Expected failure: the push/gate/reset rows get `{ block: false }` — today's default guard is
   `toolCallGuard`, which judges only the ext-diff rule (the `git status` row passes; list it as a
   GUARD row in the same describe).
2. RED — same file, change the import to pull `codexGuard`, and add
   `describe('codexGuard() - git verdict on Bash, containment on apply_patch')` (`sut = codexGuard`):
   - table-driven Bash rows `{ label, command, expected }` over an adapted event
     `{ tool: 'Bash', tool_input: { command }, working_dir: WORKING_DIR }`: every non-allow row of
     the pinned table (every PUSH, RESET, CLEAN, BRANCH and GATE row, the heredoc idiom and the two
     intended false blocks included, plus the ext-diff and unparseable rows) with `assert.deepEqual(result, expected)`
     (ext-diff and unparseable rows may use `block` + `assert.match`), and the allow rows →
     `{ block: false }`. Titles are `Given ${label}, when codexGuard runs, then ...` with ASCII
     labels such as `a forced branch delete`, `the heredoc commit idiom smuggling a branch delete`,
     `an arithmetic expansion swallowing the next line`.
   - Given an apply_patch event escaping the working dir
     (`{ tool: 'Write', tool_input: { patchText: DECOY_MULTI_HUNK }, working_dir: WORKING_DIR }`)
     → `block: true`.
   - Given an in-tree apply_patch event (`patchText: IN_TREE_ADD`) → `{ block: false }`. With the
     escaping row it kills the Bash-branch-forced-true mutant (that mutant judges an undefined
     command instead of the patch paths).
   - Given an unmapped tool (`{ tool: 'update_plan', tool_input: {}, working_dir: WORKING_DIR }`)
     → `{ block: false }` (kills the WRITE_TOOLS-forced-true mutant).
   Expected failure: the file fails to link — `SyntaxError: The requested module
   '../src/git-guard-adapter.js' does not provide an export named 'codexGuard'`.
3. RED — in `adapters/codex/test/craft-guard-hook.test.js` add
   `describe('craft-guard hook - destructive git and the plain-command gate on the live payload')`:
   `'git -C . push origin main'`, `'git --git-dir=.git push origin main'` → `status` 2, stderr
   matches `/^craft-guard: craft: destructive git \(push\)/m`, stdout `''`;
   `'bash -lc "git push"'` → status 2, stderr includes `COMPLEX_NEAR_GIT_REASON` (import it from
   `../../../engine/src/guards/git-plain-command-gate.js`), stdout `''`;
   `'git status'` → status 0, stdout `''`.
   Expected failure: the three deny rows exit 0 with empty stderr (the hook's adapter judges only
   ext-diff); the `git status` row is a GUARD (exits 0 today).
4. GREEN — in `adapters/codex/src/git-guard-adapter.js` add the import (after the two existing
   imports) and `codexGuard`, and switch `decideGuard`'s default, per the target above. Steps 1-3
   pass; every pre-existing row in the three codex suites stays green.
5. REFACTOR — the comment/docblock edits listed in Context. No logic change.
6. Mutation — `npm --prefix engine run mutation -- --mutate "adapters/codex/src/git-guard-adapter.js"`
   (background). The existing `// equivalent mutant` annotations on the throw-site messages stay
   valid (the catch is unchanged). Kill or annotate any new survivor.

### Gate

- `node --test adapters/codex/test/git-guard-adapter.test.js adapters/codex/test/git-guard-predicate.test.js adapters/codex/test/craft-guard-hook.test.js`
- `npm --prefix engine run mutation -- --mutate "adapters/codex/src/git-guard-adapter.js"` (no unannotated survivor)
- `bash scripts/ci.sh > <scratch>/ci.log 2>&1; echo "exit $?"` — exit 0.

### Commit

`fix(codex): judge Bash calls with the shared git verdict in the PreToolUse hook`

## Part 3 — Disclosure, regenerated rules, codex docs

### Context

Files this part creates or edits:

- `adapters/codex/src/execpolicy-rules.js` — EDIT: `DISCLOSURE_COMMENT` (line 17).
- `adapters/codex/craft.rules` — REGENERATE from `buildExecpolicyRules()`.
- `adapters/codex/test/execpolicy-rules.test.js` — EDIT: one new row.
- `adapters/codex/README.md` — EDIT: "Guard — honest enforcement profile" (line 163).
- `docs/contributing/specs/gate.md` — EDIT: "Guard modules" paragraph (line ~196) and
  "Codex binding" (line 248).
- `docs/contributing/specs/codex-poc-record.md` — EDIT: the `.rules` table (lines 168-175) and the
  "Re-probe — codex-cli 0.162.1" table (line 541).

New `DISCLOSURE_COMMENT` text (the JS template literal escapes each backtick as a backslash-backtick,
as today; only the second paragraph changes):

```
# Defence-in-depth only -- not a security boundary.
#
# Known bypasses of this layer (verified, not hypothetical): interposed global
# options defeat the prefix match entirely. `git -C . push`, `git --git-dir=.git
# push`, and `bash -lc 'git push'` all NO MATCH here -- matching is
# token-prefix over argv, not an adversarial parser. The PreToolUse guard
# hook denies all three; this file does not.
#
# A malformed .rules file is not a reliable denial: depending on the codex
# entry point it either refuses to start or skips the rules and runs
# commands. Treat it as fail open.
```

Existing pins it must keep (adapters/codex/test/execpolicy-rules.test.js): `/git -c/i` and
`/fail open/i` (line ~55), `/refuses?\s+to\s+start/i`, no `/does not fail closed/i`, no codex
version string, the `committed craft.rules — drift guard` byte-identity row (line 73), and
`assertRulesIntegrity` on the committed file (line ~92). adapters/codex/test/native-surface.test.js
scans craft.rules and the codex README with `PROVENANCE_REF` and `SHELL_INJECTION_PATTERN` (see
the standing rules), and pins the README to keep `/git -C/`, `/fail open/i`,
`/refuses?\s+to\s+start/i`, `/not measured/i`, /--dangerously-bypass-hook-trust/,
`/silently no-ops|silent no-op/i`, /--ephemeral/.

Regenerate command (run from the worktree root):

```
node --input-type=module -e "import { buildExecpolicyRules } from './adapters/codex/src/execpolicy-rules.js'; process.stdout.write(buildExecpolicyRules());" > adapters/codex/craft.rules
```

README edits (adapters/codex/README.md, section at line 163; copy the wording style of
adapters/copilot/README.md lines 61-80). No probe ids, ADR numbers or "Part N" anywhere:

- Layer table, PreToolUse hook row, Mechanism cell: lead with the three stages, in order:
  for a Bash call the **plain-command gate**, then the destructive-git predicate (push,
  `reset --hard`, forced branch delete, `clean` without `--dry-run`, config and alias injection),
  then the `--no-ext-diff` rule, over one parse; for `apply_patch`, per-path containment. Keep the
  existing exit-2 / crash / fail-open sentence after it.
- Bypass bullet (line 176): scope it to the execpolicy layer and add that the PreToolUse hook
  denies all three (the first two with the destructive-git reason, `bash -lc` with the gate's).
- New bullet, the gate's cost: a command that mentions git must be plain (no `$`, backslash,
  wrapper or evaluator near git), or it is denied with
  `craft: command too complex to verify near git — spell it plainly`. Remedy: re-issue the git
  part plainly; commit with `git commit -m "<message>"`, or `git commit -F <file>` when the
  message holds `` " $ ` \ ! `` (keep the space before the closing double backtick, or the
  `!`-then-backtick hygiene pattern fires). Name the two intended false blocks
  (`echo $HOME; git status`, `git commit -m "fix: \"q\""`).
- New sentence: the model picks the tool shell per call (`exec_command`'s `shell` argument,
  the bash 3.2 at /bin/bash included), and the hook payload does not carry it, so the gate denies the
  constructs whose meaning depends on the shell.
- New bullet, what stays open: git reached through channels no string guard follows (scripts,
  `make`, `npm run`, an interpreter given a literal string, gitconfig-file aliases, a renamed or
  copied git binary); and a hook that runs past its `timeout` fails open. craft sets no `timeout`,
  codex's default exceeded 90 s when measured on 0.162.1, and the slowest sampled verdict took
  50 ms, so no verdict deadline is added. An operator who sets a low `timeout` reopens that path.

gate.md edits (docs/contributing/specs/gate.md):

- "Guard modules" (line ~196): add git-bash-verdict.js (the shared Bash verdict copilot and codex
  call: gate, then destructive git, then ext-diff over one parse); git-plain-command-gate.js
  "(the copilot gate)" becomes "(the plain-command gate)".
- "Codex binding" table, PreToolUse row (line 256): "→ the shared engine guard" becomes "→ the
  shared Bash verdict (`plainGitCommandVerdict`) for Bash, `toolCallGuard` containment per path for
  `apply_patch`".
- tool-guard paragraph (lines 260-269): "and applies the shared engine guard
  (engine/src/guards/tool-call-guard.js) unmodified — the same predicate the Claude, Pi, and
  Copilot bindings enforce" becomes the composition: a Bash call is judged by
  `plainGitCommandVerdict` (engine/src/guards/git-bash-verdict.js), the same verdict the Copilot
  binding enforces; an `apply_patch` call by `toolCallGuard`, once per extracted path.
- "Because this hook genuinely denies, the git-ext-diff rule ships ENFORCED here" (line 271): say
  destructive git and the plain-command gate ship enforced too.
- "Four statements" first bullet (line 283): scope it to the execpolicy layer and add that the
  PreToolUse hook denies both forms with the destructive-git push reason.
- Add one sentence that codex takes the gate without copilot's verdict deadline, and why (codex's
  default hook timeout exceeded 90 s; the slowest sampled verdict took 50 ms), citing ADR-641
  (specs are docs, not authored adapter surfaces, so ADR numbers are allowed there).

codex-poc-record.md edits (docs/contributing/specs/codex-poc-record.md):

- `.rules` table (lines 172-175), Note column of the `git -C . push`, `git --git-dir=.git push`
  and `bash -lc 'git push'` rows: append that the PreToolUse hook denies it (push reason for the
  first two, plain-command gate reason for the third), keeping the NO MATCH result.
- "Re-probe — codex-cli 0.162.1" table: append seven rows, each `**CONFIRMED (0.162.1).**`, from
  the design's "Pinned in this design" table (method: the offline harness, fake SSE provider on
  127.0.0.1, throwaway `CODEX_HOME` and `HOME`, `--dangerously-bypass-hook-trust`, echo markers): tool
  shell (zsh 5.9, the user's default shell); `exec_command` schema `shell` argument; `shell`
  argument absent from the hook payload (tool ran under bash 3.2.57); hook `timeout = 2` + 6 s
  sleep → `PreToolUse Failed` and the command ran (a timeout fails open); no `timeout` key + 90 s
  sleep → blocked after 91 s (default above 90 s, upper bound not probed); the heredoc idiom ran
  `git branch -D victim` past the old hook, stopped only by the sandbox's `.git` lock, now denied
  by the gate; handler key is `timeout`. Do not edit the version-pinned 0.144.6 row naming
  `timeoutSec` (line 138): each row stays pinned to its version.
- Add one more row recording the payload re-dump: Claude-shaped (`tool_name: "Bash"`,
  `tool_input.command`), and a live exit-2 denial `Command blocked by PreToolUse hook: … Command:
  git -C . push origin main` with the command never run. The 0.162.1 table has no payload row yet
  (the payload section above it is pinned to 0.145.0).

### TDD steps

1. RED — in `adapters/codex/test/execpolicy-rules.test.js`, describe
   `buildExecpolicyRules() — honesty disclosure`, add
   `it('Given the generated rules text, when its comment lines are joined, then it names the PreToolUse guard hook as the layer that denies the listed bypasses')`:
   `const sut = buildExecpolicyRules().replace(/\n#\s?/g, ' ');`
   `assert.match(sut, /The PreToolUse guard hook denies all three; this file does not\./);`.
   Expected failure: no match — today's disclosure never names the PreToolUse hook.
2. GREEN — edit `DISCLOSURE_COMMENT` in `adapters/codex/src/execpolicy-rules.js` to the text above
   and, in the same step, regenerate `adapters/codex/craft.rules` with the command above (never
   commit or run the suite with the two out of step). `node --test adapters/codex/test/execpolicy-rules.test.js`
   passes.
   GUARD — the drift-guard and `assertRulesIntegrity` committed-file rows pass (file regenerated);
   `/git -c/i` and `/fail open/i` still match (the `git -C . push` and "Treat it as fail open" lines
   are kept).
3. Docs — apply the README, gate.md and codex-poc-record.md edits above.
   GUARD — `node --test adapters/codex/test/native-surface.test.js`: the README honesty pins and the
   hygiene scans (`PROVENANCE_REF`, `SHELL_INJECTION_PATTERN`) over README.md and craft.rules still
   pass. ci.sh prose-lints the touched adapters/codex/README.md (specs are exempt); fix any finding.
4. Mutation — `npm --prefix engine run mutation -- --mutate "adapters/codex/src/execpolicy-rules.js"`
   (background): the `DISCLOSURE_COMMENT` StringLiteral mutant is killed by the drift-guard row.

### Gate

- `node --test adapters/codex/test/execpolicy-rules.test.js adapters/codex/test/native-surface.test.js`
- `npm --prefix engine run mutation -- --mutate "adapters/codex/src/execpolicy-rules.js"` (no unannotated survivor)
- `bash scripts/ci.sh > <scratch>/ci.log 2>&1; echo "exit $?"` — exit 0.

### Commit

`docs(codex): name the PreToolUse hook as the layer that denies interposed-option git`
