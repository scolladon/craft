# Plan — claude-ext-diff-hook-gaps

> Source: design doc `docs/contributing/design/claude-ext-diff-hook-gaps.md` · ADRs `646, 647, 648`
> (646 ratified by the user: DC-1 (b2), a bash crash shell around a node verdict, superseding ADR-542;
> 647 adopted as recommended: the ext-diff rule only, `gitExtDiffPredicate`; 648 adopted as
> recommended: the deny reason is the engine reason with one `craft: ` prefix)
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

## Plan shape (4 parts)

| # | Part | src delta | Files | Design section |
|---|---|---|---|---|
| 1 | Engine verdict CLI: `main(argv, io)` + thin bin | new engine module (+~50), new bin (+6) | 3 | Design Part 1, Test strategy Part 1 |
| 2 | The hook becomes the crash shell; hook-process tests | hook rewrite (−~40 net) | 2 | Design Part 2, Edge behaviour, Test strategy Part 2 |
| 3 | Living docs: gate.md "Claude binding", README requirement | none (docs-only) | 2 | Design Part 3 |
| 4 | Differential arm: real hook vs in-process verdict | none (test-infra-only) | 1 | Test strategy, Differential arm |

How the design lands here:

- Part 2 folds every `test/hooks.test.js` change into the part whose code turns it green (the hook
  rewrite). Part 4 is a property/differential suite with no `src/` delta: the sizing exception for
  harness suites applies, and the design's "review cycle 1" arm is folded in now as its own part.
- Untouched (R4/R5): `hooks/hooks.json` (byte-identical; its registration test stays green),
  engine/src/guards/* (the verdict is the existing `gitExtDiffPredicate`), the codex/copilot
  adapters, engine/src/guards/tool-call-guard.js (its "Mirrors hooks/git-no-ext-diff.sh" line stays true).
- Not in this plan: the BACKLOG.md:310 entry leaving the Open list (documentation phase, at merge).
  The root README design-doc count (84) and ADR count (648) already landed with the design and ADR
  commits; this plan commit bumps the parted-plan count 81 → 82. Part 3 edits a different README
  line (the Quickstart requirement sentence, README.md:99-101).
- Mutation (R7): the validation phase runs Stryker over engine/src/claude-ext-diff-hook-main.js.
  engine/stryker.conf.json needs no edit: `engine/src/**/*.js` already mutates the new module and
  `engine/test/**/!(*.differential).test.js` already collects its suite. The bash hook and the
  root `test/` suites are outside Stryker by design.

Pre-validated in a mktemp throwaway copy of this branch (`833ccf0`), with the exact GREEN code of
Parts 1 and 2 and the exact tests of Parts 1, 2 and 4 below applied:

| Check | Result |
|---|---|
| Part 1 suite `engine/test/claude-ext-diff-hook-main.test.js` vs the Part 1 GREEN module | 48 pass / 0 fail |
| Part 2 patched `test/hooks.test.js`, git-no-ext-diff + hook-copy tests, vs the Part 2 hook | 56 pass / 0 fail |
| same tests vs today's hook | 38 fail (every RED below) / 18 pass (every GUARD below) |
| Part 4 differential (seed 20260, 400 generated + 7 decode edge commands) vs the Part 2 hook | pass, 407 judged, 110 blocked, ~2.8 s wall |
| same differential vs today's hook | fail, 112 problem lines |
| the Part 2 diff of `test/hooks.test.js` | `git apply --check` clean on `833ccf0` |

Engine verdicts the tests pin (in-process `gitExtDiffPredicate`, main `0d44e0e` engine, unchanged):

| Command (JS string) | Verdict |
|---|---|
| `'git diff'`, `'(git diff)'`, `'{ git diff; }'`, `'true && (git diff)'`, `'FOO=1 git diff'`, `'env git diff'`, `'command git diff'`, `'! git diff'`, `'time git diff'`, `'git --no-pager diff'`, `'git -p diff'`, `'git --git-dir .git diff'`, `'git -c x=y --no-pager diff'`, `'"git" diff'`, `"sh -c 'git diff'"`, `'git diff; echo --no-ext-diff'`, `'echo "rtk proxy"; git diff'`, `'git diff --no-ext-diff --ext-diff'`, `'G=gi; ${G}t diff'` | block, `git diff/show must carry --no-ext-diff (external diff mangles parsed output)` (NO `craft: ` prefix) |
| `'GIT_CONFIG_COUNT=1 git status'` | block, `craft: git config injected outside -c is denied in this binding` |
| `'git -c alias.d=diff d'` | block, `craft: an inline git alias (-c alias.*) is denied — it can run any git verb` |
| `'echo "$('` | block, `craft: command not parseable (unterminated substitution) — denied fail-closed` |
| a command over 131,072 characters | block, `craft: command not parseable (longer than the guard's limit) — denied fail-closed` |
| `'echo "a; git diff x"'`, `'git commit -m "wip; git diff fix"'`, `'git log --grep "x; git show y"'`, quoted heredoc body, heredoc commit idiom, `'git status'`, `'git stash show'`, `'git show-ref'`, `'git difftool'`, `'rtk proxy git diff'`, `'git diff --no-ext-diff HEAD'`, `''` | allow, `{ block: false }` |
| `undefined`, `null` | throws `TypeError` (reading 'length') — so main must never pass them |
| `5`, `false` | `{ block: false }` — so main must refuse non-strings itself |

(The em dash in three reasons is U+2014; write it as `—` in test constants. `\|` in tables is the
markdown escape of a pipe.)

Standing rules for every part:

- TDD London School; `describe`/`it`/`test` titles in Given/When/Then; AAA bodies with a `sut`
  variable. **Titles are printable ASCII only** (` - ` not an em dash; no `⏎`, NEL, U+2028; never a
  multi-line or generated command in a title). Table rows carry an ASCII `label`; the command stays
  in the row body.
- No provenance in source, tests, or the hook: no ADR/phase/part/backlog/design-candidate numbers.
  test/source-hygiene.test.js scans engine/src, engine/bin and hooks whole-line for
  `ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+|DC-\d+` and case-sensitive `[RTF]\d+`, and test titles and
  comments for the first set. engine/src, docs/contributing/specs and README.md must not contain the
  words `stryker`, `mutation`, `mutant` (outside the repo's `// equivalent mutant (<Mutator>): <why>`
  annotation), `gh` or `github`. Stub-lint (touched `.js`/`.sh` outside tests) bans `TODO`, `FIXME`,
  `HACK`, `XXX`, `PLACEHOLDER`, `STUB` as words — none in the hook or engine/src.
- Git: use `/usr/bin/git` for every verb (an `rtk` rewrite trips the worktree guard); scripted
  `git diff`/`git show` pass `--no-ext-diff`. Commit only your own files. Commit with
  `/usr/bin/git commit -m "<message>"`.
- Run `bash scripts/ci.sh > <scratch>/ci.log 2>&1; echo "exit $?"`, then grep the log for
  `not ok`/`^ci:` lines; never read the whole log. If a bounded-time test or a fuzz test dies by
  SIGTERM under machine load, re-run it unchanged once before calling it red.
- Committed text carries repo-relative paths only (test/source-hygiene.test.js Class D rejects any
  home-rooted path anywhere in the tracked tree).

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-P1 | How main reads `tool_input.command` from a payload whose shape is wrong (string/array/number payload, or a string/array `tool_input`) | (a) **Mirror jq exactly**: an absent or `null` step reads as no command (allow); stepping into anything that is not a non-array object is unreadable → exit 1 (crash deny); a non-string command is unreadable. (b) As the design text reads: optional chaining, so any non-object payload or `tool_input` reads as no command (allow); only a present non-string command is refused | (a) | Measured: today `jq -r '.tool_input.command // empty'` exits 5 on `"str"`, `[1]`, `5`, `true`, `{"tool_input":"x"}`, `{"tool_input":[1]}` (crash deny) and 0 on `null`, `{"tool_input":null}`. The design's "to match today's `// empty`" holds for null/absent only; (b) would turn six crash-deny shapes into allows. (a) keeps today's fail-closed shapes, costs one 9-line reader, and leaves the design's numeric-command crash deny as is. Claude Code always sends an object `tool_input` for Bash, so neither choice changes a real call. Parts 1 and 2 are written for (a); for (b), replace `commandOf` with `payload?.tool_input?.command` + the non-string check and drop the four string/array unreadable rows from the Part 1 table |
| DC-P2 | Differential oracle strictness | (a) **Strict**: every generated command exits 0, and stdout is byte-for-byte the in-process verdict (`''` on allow, the deny JSON + `\n` with the prefixed engine reason on block). (b) The design's literal oracle: deny ⇔ exit 0 with JSON, equal to `.block`, and the exit is 0 or 2 | (a) | Any exit 2 on a `JSON.stringify` payload is a crash the hook should never hit; under (b) an exit 2 on an allowed command reads as "not a JSON deny" = allow-parity and hides the crash. (a) also pins the reason bytes, which is where a decode divergence (U+2028, NUL, lone surrogates) would show. Pre-validated: (a) passes on the Part 2 hook (407/407) and fails on today's hook (112 problems) |

## Part 1 — Engine verdict CLI: main(argv, io) and its bin

### Context

Files this part creates:

- `engine/src/claude-ext-diff-hook-main.js` — CREATE. `main(argv, io)` + `ALLOW_VERDICT`.
- `engine/bin/claude-ext-diff-verdict.js` — CREATE. Thin bin, mode 100644 like most of engine/bin.
- `engine/test/claude-ext-diff-hook-main.test.js` — CREATE. In-process suite, Stryker-visible.

Public-surface decision: **internal**. `main` and `ALLOW_VERDICT` are exported only for the bin and
the suite. Nothing is added to the engine barrel engine/src/index.js, no skill or doc invokes the bin
(only the hook will, in Part 2), and no registry lists engine bins. The two tests that enumerate
engine/bin pick the new bin up with no edit: engine/test/bin-entry-symlink.bin.test.js spawns every
engine/bin/*.js through a symlinked engine dir with stdin `''` and argv `['/nonexistent']` and needs
"non-zero or some output" — `JSON.parse('')` throws, so node exits 1 (GUARD). The file name passes
test/source-hygiene.test.js Class C (it bans only a -claude.js suffix).

Pattern to copy (read-only): engine/bin/filter-findings.js —

```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { isEntryPoint } from '../src/cli-io.js';
import { main } from '../src/filter-findings-main.js';
if (isEntryPoint(import.meta)) {
  process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr, readStdin: () => readFileSync(0, 'utf8') }));
}
```

`isEntryPoint(meta)` (engine/src/cli-io.js:82) throws `craft needs Node ^22.18.0 || >=24.2.0 (import.meta.main); running <v>`
on a node without `import.meta.main`; that uncaught throw exits 1, which the Part 2 hook denies.

Collaborator (read-only, used for real — it is pure): `gitExtDiffPredicate(command)` from
engine/src/guards/git-ext-diff-predicate.js, returning `{ block: boolean, reason?: string }`. See the
pinned verdict table above: the ext-diff reason has no `craft: ` prefix; config-channel, alias and
parse-failure reasons already start with `craft: `. It throws on `undefined`/`null` and allows `5`/`false`.

Test double (read-only): `makeCaptureIo()` from engine/test-helpers/capture-io.js returns
`{ stdout: { writes, write, joined() }, stderr: { writes, write, joined() } }`; the suite adds
`io.readStdin = () => stdinText`.

Output contract the Part 2 hook relies on: stdout gets exactly one write, with **no trailing
newline** — `allow`, or the deny JSON
`{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"craft: <reason>"}}`
(key order as written; the hook matches the prefix `{"hookSpecificOutput":`). A trailing newline on
`allow` makes the hook deny (the feed sentinel keeps it), pinned in Part 2.

### TDD steps

1. RED — create `engine/test/claude-ext-diff-hook-main.test.js` with the header, helpers, the two
   tables and the first two describes below ("denied shell forms", "allowed commands").
   Expected failure: the whole file errors with `ERR_MODULE_NOT_FOUND` for
   `../src/claude-ext-diff-hook-main.js` — the module does not exist.

   ```js
   import { describe, it } from 'node:test';
   import assert from 'node:assert/strict';
   import { ALLOW_VERDICT, main } from '../src/claude-ext-diff-hook-main.js';
   import { makeCaptureIo } from '../test-helpers/capture-io.js';

   const EXT_DIFF_REASON = 'craft: git diff/show must carry --no-ext-diff (external diff mangles parsed output)';
   const CONFIG_CHANNEL_REASON = 'craft: git config injected outside -c is denied in this binding';
   const UNTERMINATED_SUBSTITUTION_REASON = 'craft: command not parseable (unterminated substitution) — denied fail-closed';
   const UNREADABLE_EXIT = 1;

   function ioReading(stdinText) {
     const io = makeCaptureIo();
     io.readStdin = () => stdinText;
     return io;
   }

   const ioFor = command => ioReading(JSON.stringify({ tool_input: { command } }));

   function denyOf(io) {
     return JSON.parse(io.stdout.joined()).hookSpecificOutput;
   }

   const DENIED_FORMS = [
     { label: 'a subshell', command: '(git diff)' },
     { label: 'a brace group', command: '{ git diff; }' },
     { label: 'a subshell after an and-list', command: 'true && (git diff)' },
     { label: 'an assignment prefix', command: 'FOO=1 git diff' },
     { label: 'the env wrapper', command: 'env git diff' },
     { label: 'the command builtin', command: 'command git diff' },
     { label: 'a negation', command: '! git diff' },
     { label: 'the time keyword', command: 'time git diff' },
     { label: 'the --no-pager global', command: 'git --no-pager diff' },
     { label: 'the -p global', command: 'git -p diff' },
     { label: 'a spaced --git-dir global', command: 'git --git-dir .git diff' },
     { label: 'mixed -c and --no-pager globals', command: 'git -c x=y --no-pager diff' },
     { label: 'a quoted git word', command: '"git" diff' },
     { label: 'a string run by sh -c', command: "sh -c 'git diff'" },
     { label: 'the marker in a later command', command: 'git diff; echo --no-ext-diff' },
     { label: 'the proxy text in an earlier command', command: 'echo "rtk proxy"; git diff' },
     { label: 'a later --ext-diff overriding the marker', command: 'git diff --no-ext-diff --ext-diff' },
   ];

   const ALLOWED_FORMS = [
     { label: 'a compliant diff', command: 'git diff --no-ext-diff HEAD' },
     { label: 'a proxied raw diff', command: 'rtk proxy git diff' },
     { label: 'git stash show', command: 'git stash show' },
     { label: 'git show-ref', command: 'git show-ref' },
     { label: 'git difftool', command: 'git difftool' },
     { label: 'git status', command: 'git status' },
     { label: 'diff text inside an echo string', command: 'echo "a; git diff x"' },
     { label: 'diff text inside a commit message', command: 'git commit -m "wip; git diff fix"' },
     { label: 'show text inside a log grep pattern', command: 'git log --grep "x; git show y"' },
     { label: 'show text inside a quoted heredoc body', command: "cat > notes.md <<'EOF'\nrun it; git show HEAD\nEOF" },
     { label: 'the heredoc commit idiom', command: "git commit -m \"$(cat <<'EOF'\nfix: x\n\ngit diff here\nEOF\n)\"" },
     { label: 'a for loop without git', command: 'for f in *.js; do echo $f; done' },
     { label: 'a piped test run', command: 'npm test 2>&1 | tail -5' },
   ];

   describe('claude ext-diff hook main - denied shell forms', () => {
     for (const { label, command } of DENIED_FORMS) {
       it(`Given ${label} running git diff, when main judges the payload, then it exits 0 and writes the ext-diff deny`, () => {
         const io = ioFor(command);
         const sut = main;

         const result = sut([], io);

         assert.equal(result, 0);
         assert.deepEqual(denyOf(io), { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: EXT_DIFF_REASON });
         assert.equal(io.stderr.joined(), '');
       });
     }
   });

   describe('claude ext-diff hook main - allowed commands', () => {
     for (const { label, command } of ALLOWED_FORMS) {
       it(`Given ${label}, when main judges the payload, then it exits 0 and writes exactly the allow token`, () => {
         const io = ioFor(command);
         const sut = main;

         const result = sut([], io);

         assert.equal(result, 0);
         assert.equal(io.stdout.joined(), 'allow');
         assert.equal(io.stderr.joined(), '');
       });
     }

     it('Given the exported allow token, when read, then it is the bare word the hook matches', () => {
       const sut = ALLOW_VERDICT;

       assert.equal(sut, 'allow');
     });
   });
   ```

2. GREEN — create the module with the minimal reader (no shape handling yet, prefix always added)
   and create the bin:

   ```js
   // engine/src/claude-ext-diff-hook-main.js (first GREEN)
   import { gitExtDiffPredicate } from './guards/git-ext-diff-predicate.js';

   export const ALLOW_VERDICT = 'allow';

   const REASON_PREFIX = 'craft: ';

   const denyJson = reason =>
     JSON.stringify({
       hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `${REASON_PREFIX}${reason}` },
     });

   export function main(_argv, io) {
     const command = JSON.parse(io.readStdin()).tool_input.command;
     const verdict = gitExtDiffPredicate(command);
     io.stdout.write(verdict.block ? denyJson(verdict.reason) : ALLOW_VERDICT);
     return 0;
   }
   ```

   ```js
   // engine/bin/claude-ext-diff-verdict.js (final)
   #!/usr/bin/env node
   import { readFileSync } from 'node:fs';
   import { isEntryPoint } from '../src/cli-io.js';
   import { main } from '../src/claude-ext-diff-hook-main.js';
   if (isEntryPoint(import.meta)) {
     process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr, readStdin: () => readFileSync(0, 'utf8') }));
   }
   ```

   (The shebang is the bin's first line; the `// engine/bin/...` label above is not part of the file.)
   `cd engine && node --test test/claude-ext-diff-hook-main.test.js` passes both describes.
   GUARD — `cd engine && node --test test/bin-entry-symlink.bin.test.js`: the new
   `claude-ext-diff-verdict.js` row passes (stdin `''` → `JSON.parse` throws → exit 1).

3. RED — append the "reason prefix" describe:

   ```js
   describe('claude ext-diff hook main - reason prefix', () => {
     for (const { label, command, reason } of [
       { label: 'a config channel assignment', command: 'GIT_CONFIG_COUNT=1 git status', reason: CONFIG_CHANNEL_REASON },
       { label: 'an unterminated substitution', command: 'echo "$(', reason: UNTERMINATED_SUBSTITUTION_REASON },
     ]) {
       it(`Given ${label}, when main judges the payload, then the engine reason keeps its single craft prefix`, () => {
         const io = ioFor(command);
         const sut = main;

         sut([], io);

         assert.equal(denyOf(io).permissionDecisionReason, reason);
       });
     }
   });
   ```

   Expected failure: both rows get `craft: craft: git config injected …` / `craft: craft: command not
   parseable …` — the first GREEN prefixes unconditionally.

4. GREEN — add `const prefixed = reason => (reason.startsWith(REASON_PREFIX) ? reason : `${REASON_PREFIX}${reason}`);`
   and use `permissionDecisionReason: prefixed(reason)` in `denyJson`.

5. RED — append the "payload shapes" describe (DC-P1 (a)):

   ```js
   describe('claude ext-diff hook main - payload shapes', () => {
     for (const { label, stdinText } of [
       { label: 'a payload without tool_input', stdinText: '{}' },
       { label: 'a null tool_input', stdinText: '{"tool_input":null}' },
       { label: 'a payload without command', stdinText: '{"tool_input":{}}' },
       { label: 'a null command', stdinText: '{"tool_input":{"command":null}}' },
       { label: 'an empty command', stdinText: '{"tool_input":{"command":""}}' },
       { label: 'a null payload', stdinText: 'null' },
     ]) {
       it(`Given ${label}, when main judges it, then it exits 0 and writes the allow token`, () => {
         const io = ioReading(stdinText);
         const sut = main;

         const result = sut([], io);

         assert.equal(result, 0);
         assert.equal(io.stdout.joined(), 'allow');
       });
     }

     for (const { label, stdinText } of [
       { label: 'a numeric command', stdinText: '{"tool_input":{"command":5}}' },
       { label: 'a false command', stdinText: '{"tool_input":{"command":false}}' },
       { label: 'a string tool_input', stdinText: '{"tool_input":"git diff"}' },
       { label: 'an array tool_input', stdinText: '{"tool_input":["git diff"]}' },
       { label: 'a string payload', stdinText: '"git diff"' },
       { label: 'an array payload', stdinText: '[{"tool_input":{"command":"git diff"}}]' },
     ]) {
       it(`Given ${label}, when main judges it, then it exits 1, names the shape on stderr and writes no verdict`, () => {
         const io = ioReading(stdinText);
         const sut = main;

         const result = sut([], io);

         assert.equal(result, UNREADABLE_EXIT);
         assert.equal(io.stdout.joined(), '');
         assert.match(io.stderr.joined(), /^claude-ext-diff-verdict: tool_input\.command is not a string/);
       });
     }

     for (const { label, stdinText } of [
       { label: 'stdin that is not JSON', stdinText: 'not json' },
       { label: 'two JSON documents', stdinText: '{"tool_input":{"command":"git diff"}} {"tool_input":{"command":"ls"}}' },
       { label: 'empty stdin', stdinText: '' },
     ]) {
       it(`Given ${label}, when main judges it, then it throws a SyntaxError and writes no verdict`, () => {
         const io = ioReading(stdinText);
         const sut = () => main([], io);

         assert.throws(sut, SyntaxError);
         assert.equal(io.stdout.joined(), '');
       });
     }
   });
   ```

   Expected failures against the step-4 code: `{}`, `{"tool_input":null}`, `null` and the four
   string/array rows throw `TypeError` (reading `command`/`tool_input` of undefined or null, or
   `gitExtDiffPredicate(undefined)` reading `length`); `{"tool_input":{}}` and the null command throw
   `TypeError` inside the predicate; the numeric and false rows return 0 and write `allow` instead of
   exit 1.
   GUARD — `an empty command` passes already (`gitExtDiffPredicate('')` is `{ block: false }`), and the
   three SyntaxError rows pass already (`JSON.parse` throws before anything is written).

6. GREEN — the final module (replaces the file):

   ```js
   import { gitExtDiffPredicate } from './guards/git-ext-diff-predicate.js';

   export const ALLOW_VERDICT = 'allow';

   const UNREADABLE_COMMAND_EXIT = 1;
   const UNREADABLE_COMMAND_MESSAGE = 'claude-ext-diff-verdict: tool_input.command is not a string inside JSON objects\n';
   const REASON_PREFIX = 'craft: ';
   const NO_COMMAND = '';
   const UNREADABLE = null;
   const COMMAND_PATH = Object.freeze(['tool_input', 'command']);

   const isAbsent = value => value === undefined || value === null;
   // Asked only of a value already known not to be absent, so null never reaches it.
   const isIndexable = value => typeof value === 'object' && !Array.isArray(value);

   // Reads the command the way `jq '.tool_input.command // empty'` does: an absent or null step
   // is no command, and stepping into anything but an object is unreadable.
   function commandOf(payload) {
     let value = payload;
     for (const key of COMMAND_PATH) {
       if (isAbsent(value)) return NO_COMMAND;
       if (!isIndexable(value)) return UNREADABLE;
       value = value[key];
     }
     if (isAbsent(value)) return NO_COMMAND;
     return typeof value === 'string' ? value : UNREADABLE;
   }

   const prefixed = reason => (reason.startsWith(REASON_PREFIX) ? reason : `${REASON_PREFIX}${reason}`);

   const denyJson = reason =>
     JSON.stringify({
       hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: prefixed(reason) },
     });

   /**
    * Judges a Claude Code PreToolUse(Bash) payload with the engine's ext-diff rule and writes
    * exactly one verdict token on stdout, with no trailing newline: the allow token or the deny JSON.
    * @param {string[]} _argv
    * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void }, readStdin: () => string }} io
    * @returns {number} exit code
    */
   export function main(_argv, io) {
     const command = commandOf(JSON.parse(io.readStdin()));
     if (command === UNREADABLE) {
       io.stderr.write(UNREADABLE_COMMAND_MESSAGE);
       return UNREADABLE_COMMAND_EXIT;
     }
     const verdict = gitExtDiffPredicate(command);
     io.stdout.write(verdict.block ? denyJson(verdict.reason) : ALLOW_VERDICT);
     return 0;
   }
   ```

   No empty-command branch before the predicate: `gitExtDiffPredicate('')` already returns
   `{ block: false }`, so such a branch would only be an equivalent mutant. No crash handlers in node:
   the hook catches every non-zero exit. The suite passes 48/48.

7. REFACTOR — none expected. Smoke the bin by hand:
   `printf '%s' '{"tool_input":{"command":"git -p diff"}}' | node engine/bin/claude-ext-diff-verdict.js; echo " rc=$?"`
   prints the deny JSON and ` rc=0`; `printf 'x' | node engine/bin/claude-ext-diff-verdict.js` exits 1
   with a SyntaxError on stderr.

### Gate

- `cd engine && node --test test/claude-ext-diff-hook-main.test.js test/bin-entry-symlink.bin.test.js`
- `bash scripts/ci.sh > <scratch>/ci.log 2>&1; echo "exit $?"` — exit 0; grep the log for `not ok`.

### Commit

`feat(engine): add the Claude ext-diff verdict CLI over the shared ext-diff rule`

## Part 2 — The hook becomes the crash shell around the node verdict

### Context

Files this part edits:

- `hooks/git-no-ext-diff.sh` — EDIT (rewrite below; keep mode 100755). Today 92 lines: header
  L1-22, `set -euo pipefail` L23, constants L25-31, `verdict_reached`/`allow`/`deny_on_crash`/traps
  L33-55 (kept verbatim), then the `cat` feed L57-62, `jq` extraction L63-66, the substring `case`
  L68-72, `GIT_RE` + grep L74-86, `sed` rewrite L88-89 and `jq -cn` deny L91-92 (all removed).
- `test/hooks.test.js` — EDIT (diff below). Today: helpers `runHook`, `decision(hookName, fixture)`,
  `reason(hookName, fixture)` L14-50; deny matrix L56-110; allow matrix L116-151; crash section
  L157-422 with `GIT_HOOK`, `DENY_DIFF_PAYLOAD`, `ALLOW_COMPLIANT_PAYLOAD`, `crashReason(status)`,
  `resolveTool`, `withToolsOnly(tools, act)`, `runGitHook(input, env)`, `withHookCopy({ anchor,
  inserted }, act)`, `waitForFirstChild`, `runGitHookSignalledWhileReading(signal)`,
  `assertCrashDeny(result, status)`; compaction section from L424 (`runHookWithPayload`, untouched);
  the hooks/hooks.json PreToolUse registration test (~L546, untouched, stays green — R4).

Depends on Part 1: the hook runs `node "$hook_dir/../engine/bin/claude-ext-diff-verdict.js"`. The
bin path is resolved from `${BASH_SOURCE[0]}`, so it works for an absolute path, a relative path, a
bare git-no-ext-diff.sh run from hooks/, and the symlinked plugin roots the registration tests
build. That is why `withHookCopy` must now lay the copy out as `<tmp>/hooks/git-no-ext-diff.sh`
beside a `<tmp>/engine` symlink to the real engine: a bare copy cannot find the bin, node exits 1,
and the descriptor test (whose expected status is also 1) would pass for the wrong reason. A new
"unmodified hook copy" test proves the copy reaches its verdict.

Behaviour of the rewritten hook (pre-validated on macOS /bin/bash 3.2):

| Input / fault | rc | stdout | stderr |
|---|---|---|---|
| deny form | 0 | deny JSON + `\n` | empty |
| allow form | 0 | empty | empty |
| `node` not on PATH | 2 | empty | `…: node: command not found` then `craft git-no-ext-diff: failed (exit 127), call denied` |
| node exits 0 silent / prints `maybe` / prints `allow\n` | 2 | empty | `craft git-no-ext-diff: no verdict reached, call denied` |
| node SIGKILLed | 2 | empty | `failed (exit 137)` |
| stdin not JSON, two JSON documents, `NODE_OPTIONS` preload that throws | 2 | empty | node's error, then `failed (exit 1)` |
| numeric command | 2 | empty | `claude-ext-diff-verdict: tool_input.command is not a string inside JSON objects`, then `failed (exit 1)` |
| `ulimit -n 5` before start, or `ulimit -n 4` right before the substitution | 2 | empty | `cannot make pipe for command substitution`, then `failed (exit 1)` |
| TERM / HUP after the first child forks | 2 | empty | `failed (exit 143)` / `failed (exit 129)` |
| no writable temp dir (sandbox-exec) | 0 | deny JSON | empty |
| 126,000-byte command starting with `git diff HEAD` | 0 | deny JSON, engine reason | empty |

The header must say the same crash contract as docs/contributing/specs/gate.md and the README after
Part 3: node missing, too old, crashed, signalled or silent → exit 2 deny; TERM/HUP trapped; the
residual fail-opens (/bin/bash missing, hook file missing or not executable, SIGKILL or any other
untrapped signal, the 600 s timeout) unchanged.

### TDD steps

1. RED — apply the test diff below to `test/hooks.test.js` (save it to a scratch file, then
   `/usr/bin/git apply <scratch>/hooks-test.diff`; it applies clean on the Part 1 tree). Then run
   `node --test --test-name-pattern="git-no-ext-diff|hook copy" test/hooks.test.js > <scratch>/hooks.log 2>&1`.
   Expected: 38 fail, 18 pass. The failures, with what today's hook does instead:
   - the three `then the reason is the engine ext-diff reason` fixture tests, the pipe-buffer test,
     the no-writable-temp-dir test, the 16 `Given <form> running git diff … denies with the engine
     reason` rows, the config-channel row and the `unmodified hook copy` test: today's reason is
     `craft: scripted git diff/show must pass --no-ext-diff … Re-issue exactly: <fixed>`, or no
     stdout at all (today's regex allows all 16 forms and `GIT_CONFIG_COUNT=1 git status`);
   - the five `… allows with empty output` rows: today's regex denies the quoted text and heredoc bodies;
   - `PATH holding every tool but node`: today runs fine on cat/jq/grep/sed and exits 0 with the deny;
   - the three `no verdict reached` stub-node tests and the SIGKILL stub test: with `PATH` = the stub
     dir only, today dies on `cat` → `failed (exit 127)`;
   - `NODE_OPTIONS preload`: today never runs node → exit 0 deny;
   - `stdin that is not JSON`: today's status is jq's 5, the test wants 1;
   - `numeric command`: today jq prints `5`, which allows (exit 0);
   - `two JSON documents`: today jq judges the first document → exit 0 deny;
   - `a verdict feed that cannot start once the traps are set`: `withHookCopy` throws
     `no line starts with readonly VERDICT_BIN=`.
   GUARD (pass today and after): the five fixture `then it denies` tests, the five allow-matrix fixture
   tests, `a compliant command … empty stdout and stderr`, `stderr stays empty beside the JSON deny`,
   `PATH without node and stderr closed` (renamed; an empty PATH crashes either way), `syntax error
   right below its trap`, the SIGTERM and SIGHUP tests, `too few file descriptors`, and the
   `hooks/hooks.json` PreToolUse registration test.

   ```diff
   --- a/test/hooks.test.js
   +++ b/test/hooks.test.js
   @@ -10,6 +10,7 @@
    const ROOT = path.join(__dirname, '..');
    const HOOKS_DIR = path.join(ROOT, 'hooks');
    const HOOK_FIXTURES = path.join(__dirname, 'fixtures', 'hooks');
   +const EXT_DIFF_DENY_REASON = 'craft: git diff/show must carry --no-ext-diff (external diff mangles parsed output)';
    
    function runHook(hookName, fixtureName) {
      const hookPath = path.join(HOOKS_DIR, hookName);
   @@ -61,10 +62,13 @@
    );
    
    test(
   -  'Given git diff HEAD~1 without --no-ext-diff, when git-no-ext-diff runs, then reason contains corrected command',
   +  'Given git diff HEAD~1 without --no-ext-diff, when git-no-ext-diff runs, then the reason is the engine ext-diff reason',
      () => {
   -    const r = reason('git-no-ext-diff.sh', 'no-ext-diff-deny-diff.json');
   -    assert.ok(r.includes('git diff --no-ext-diff HEAD~1'), `Expected corrected command in reason:\n${r}`);
   +    const sut = reason;
   +
   +    const result = sut('git-no-ext-diff.sh', 'no-ext-diff-deny-diff.json');
   +
   +    assert.strictEqual(result, EXT_DIFF_DENY_REASON);
      },
    );
    
   @@ -76,10 +80,13 @@
    );
    
    test(
   -  'Given git -C /x show abc without --no-ext-diff, when git-no-ext-diff runs, then reason contains corrected command',
   +  'Given git -C /x show abc without --no-ext-diff, when git-no-ext-diff runs, then the reason is the engine ext-diff reason',
      () => {
   -    const r = reason('git-no-ext-diff.sh', 'no-ext-diff-deny-global-opts.json');
   -    assert.ok(r.includes('git -C /x show --no-ext-diff abc'), `Expected corrected command in reason:\n${r}`);
   +    const sut = reason;
   +
   +    const result = sut('git-no-ext-diff.sh', 'no-ext-diff-deny-global-opts.json');
   +
   +    assert.strictEqual(result, EXT_DIFF_DENY_REASON);
      },
    );
    
   @@ -91,10 +98,13 @@
    );
    
    test(
   -  'Given git -c <k=v> diff without --no-ext-diff, when git-no-ext-diff runs, then reason contains corrected command',
   +  'Given git -c <k=v> diff without --no-ext-diff, when git-no-ext-diff runs, then the reason is the engine ext-diff reason',
      () => {
   -    const r = reason('git-no-ext-diff.sh', 'no-ext-diff-deny-c-opt.json');
   -    assert.ok(r.includes('git -c core.pager=cat diff --no-ext-diff HEAD'), `Expected corrected command in reason:\n${r}`);
   +    const sut = reason;
   +
   +    const result = sut('git-no-ext-diff.sh', 'no-ext-diff-deny-c-opt.json');
   +
   +    assert.strictEqual(result, EXT_DIFF_DENY_REASON);
      },
    );
    
   @@ -160,15 +170,17 @@
    const ALLOW_COMPLIANT_PAYLOAD = fs.readFileSync(path.join(HOOK_FIXTURES, 'no-ext-diff-allow-compliant.json'));
    const CRASH_DENY_EXIT_CODE = 2;
    const COMMAND_NOT_FOUND_STATUS = 127;
   -const JQ_PARSE_ERROR_STATUS = 5;
   -const GREP_NO_MATCH_STATUS = 1;
   +const NODE_UNCAUGHT_ERROR_STATUS = 1;
   +const SIGKILL_EXIT_STATUS = 137;
    const FEED_NEVER_RAN_STATUS = 1;
    // enough descriptors for bash to start the hook, too few to open a command-substitution pipe
    const TOO_FEW_FILE_DESCRIPTORS = 5;
    // 'echo pad\n' × 14000 = 126,000 bytes: about 60 KiB past the 64 KiB pipe buffer, still under
   -// the 128 KiB one exec argument may hold (the corrected command goes to jq as one)
   +// the 131,072-character limit past which the engine refuses to parse a command
    const PIPE_BUFFER_OVERFLOW_LINES = 14000;
    const ANY_CRAFT_DENY_REASON = /^craft git-no-ext-diff: .*, call denied$/m;
   +const NO_VERDICT_REASON = /^craft git-no-ext-diff: no verdict reached, call denied$/m;
   +const STUB_MODE = 0o755;
    const SYNTAX_ERROR_LINE = 'if then fi';
    const SIGNAL_EXIT_STATUS = { SIGTERM: 143, SIGHUP: 129 };
    const CHILD_POLL_TIMEOUT_MS = 5000;
   @@ -206,7 +218,20 @@
      return spawnSync('/bin/bash', [GIT_HOOK], { input, encoding: 'utf8', env });
    }
    
   -// copy of the hook with one line inserted after the first line starting with `anchor`
   +function runGitHookOnCommand(command) {
   +  return runGitHook(JSON.stringify({ tool_input: { command } }));
   +}
   +
   +// PATH holding only a `node` stub with the given sh body, so the hook meets that node instead of the real one
   +function withStubNode(body, act) {
   +  return withToolsOnly([], (toolsDir) => {
   +    fs.writeFileSync(path.join(toolsDir, 'node'), `#!/bin/sh\n${body}\n`, { mode: STUB_MODE });
   +    return act(toolsDir);
   +  });
   +}
   +
   +// copy of the hook with one line inserted after the first line starting with `anchor`, laid out
   +// beside a link to the real engine so the copy still reaches its verdict
    function withHookCopy({ anchor, inserted }, act) {
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'craft-hook-copy-')));
      try {
   @@ -214,7 +239,9 @@
        const at = lines.findIndex((line) => line.startsWith(anchor));
        if (at === -1) throw new Error(`no line starts with ${anchor}`);
        lines.splice(at + 1, 0, inserted);
   -    const copy = path.join(dir, 'git-no-ext-diff.sh');
   +    fs.mkdirSync(path.join(dir, 'hooks'));
   +    fs.symlinkSync(path.join(ROOT, 'engine'), path.join(dir, 'engine'));
   +    const copy = path.join(dir, 'hooks', 'git-no-ext-diff.sh');
        fs.writeFileSync(copy, lines.join('\n'));
        return act(spawnSync('/bin/bash', [copy], { input: DENY_DIFF_PAYLOAD, encoding: 'utf8' }));
      } finally {
   @@ -281,37 +308,77 @@
      assert.strictEqual(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    });
    
   -test('Given PATH without cat, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr', () => {
   -  withToolsOnly([], (toolsDir) => {
   +test('Given PATH holding every tool but node, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr', () => {
   +  withToolsOnly(['cat', 'jq', 'grep', 'sed'], (toolsDir) => {
        const sut = runGitHook;
        const result = sut(DENY_DIFF_PAYLOAD, { PATH: toolsDir });
        assertCrashDeny(result, COMMAND_NOT_FOUND_STATUS);
      });
    });
    
   -test('Given PATH without jq, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr', () => {
   -  withToolsOnly(['cat'], (toolsDir) => {
   +test('Given a node that exits 0 without printing, when git-no-ext-diff runs, then it exits 2 with no verdict reached', () => {
   +  withStubNode('exit 0', (toolsDir) => {
        const sut = runGitHook;
        const result = sut(DENY_DIFF_PAYLOAD, { PATH: toolsDir });
   -    assertCrashDeny(result, COMMAND_NOT_FOUND_STATUS);
   +    assert.strictEqual(result.status, CRASH_DENY_EXIT_CODE, result.stderr);
   +    assert.match(result.stderr, NO_VERDICT_REASON);
   +    assert.strictEqual(result.stdout, '');
      });
    });
    
   -test('Given PATH without sed, when git-no-ext-diff runs on a matching command, then it exits 2 with the crash reason on stderr', () => {
   -  withToolsOnly(['cat', 'jq', 'grep'], (toolsDir) => {
   +test('Given a node that prints an unknown token, when git-no-ext-diff runs, then it exits 2 with no verdict reached', () => {
   +  withStubNode("printf 'maybe'", (toolsDir) => {
        const sut = runGitHook;
        const result = sut(DENY_DIFF_PAYLOAD, { PATH: toolsDir });
   -    assertCrashDeny(result, COMMAND_NOT_FOUND_STATUS);
   +    assert.strictEqual(result.status, CRASH_DENY_EXIT_CODE, result.stderr);
   +    assert.match(result.stderr, NO_VERDICT_REASON);
   +    assert.strictEqual(result.stdout, '');
      });
    });
    
   +test('Given a node that prints the allow token with a trailing newline, when git-no-ext-diff runs, then it exits 2 with no verdict reached', () => {
   +  withStubNode("printf 'allow\\n'", (toolsDir) => {
   +    const sut = runGitHook;
   +    const result = sut(ALLOW_COMPLIANT_PAYLOAD, { PATH: toolsDir });
   +    assert.strictEqual(result.status, CRASH_DENY_EXIT_CODE, result.stderr);
   +    assert.match(result.stderr, NO_VERDICT_REASON);
   +  });
   +});
   +
   +test('Given a node killed by SIGKILL, when git-no-ext-diff runs, then it exits 2 with the signal status as the crash reason', () => {
   +  withStubNode('kill -9 $$', (toolsDir) => {
   +    const sut = runGitHook;
   +    const result = sut(DENY_DIFF_PAYLOAD, { PATH: toolsDir });
   +    assertCrashDeny(result, SIGKILL_EXIT_STATUS);
   +  });
   +});
   +
   +test('Given a NODE_OPTIONS preload that throws, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr', () => {
   +  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'craft-hook-preload-')));
   +  try {
   +    const preload = path.join(dir, 'throws.cjs');
   +    fs.writeFileSync(preload, "throw new Error('preload refused');\n");
   +    const sut = runGitHook;
   +    const result = sut(DENY_DIFF_PAYLOAD, { ...process.env, NODE_OPTIONS: `--require ${preload}` });
   +    assertCrashDeny(result, NODE_UNCAUGHT_ERROR_STATUS);
   +  } finally {
   +    fs.rmSync(dir, { recursive: true, force: true });
   +  }
   +});
   +
    test('Given stdin that is not JSON, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr', () => {
      const sut = runGitHook;
      const result = sut('not json');
   -  assertCrashDeny(result, JQ_PARSE_ERROR_STATUS);
   +  assertCrashDeny(result, NODE_UNCAUGHT_ERROR_STATUS);
    });
    
   -test('Given PATH without cat and stderr closed, when git-no-ext-diff runs, then it still exits 2', () => {
   +test('Given a numeric command, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr', () => {
   +  const sut = runGitHook;
   +  const result = sut('{"tool_input":{"command":5}}');
   +  assertCrashDeny(result, NODE_UNCAUGHT_ERROR_STATUS);
   +});
   +
   +test('Given PATH without node and stderr closed, when git-no-ext-diff runs, then it still exits 2', () => {
      withToolsOnly([], (toolsDir) => {
        const sut = () => spawnSync('/bin/bash', ['-c', '/bin/bash "$0" 2>&-', GIT_HOOK], {
          input: DENY_DIFF_PAYLOAD,
   @@ -324,24 +391,7 @@
      });
    });
    
   -test('Given PATH without grep, when git-no-ext-diff runs, then it exits 2 instead of allowing', () => {
   -  withToolsOnly(['cat', 'jq'], (toolsDir) => {
   -    const sut = runGitHook;
   -    const result = sut(DENY_DIFF_PAYLOAD, { PATH: toolsDir });
   -    assertCrashDeny(result, COMMAND_NOT_FOUND_STATUS);
   -  });
   -});
   -
   -test('Given a grep that exits 1 without printing a count, when git-no-ext-diff runs on a matching command, then it exits 2 with the crash reason', () => {
   -  withToolsOnly(['cat', 'jq', 'sed'], (toolsDir) => {
   -    fs.symlinkSync(resolveTool('false'), path.join(toolsDir, 'grep'));
   -    const sut = runGitHook;
   -    const result = sut(DENY_DIFF_PAYLOAD, { PATH: toolsDir });
   -    assertCrashDeny(result, GREP_NO_MATCH_STATUS);
   -  });
   -});
   -
   -test('Given a matching git diff followed by more than a pipe buffer of lines, when git-no-ext-diff runs, then it denies with the corrected command', () => {
   +test('Given a matching git diff followed by more than a pipe buffer of lines, when git-no-ext-diff runs, then it denies with the engine reason', () => {
      const command = `git diff HEAD\n${'echo pad\n'.repeat(PIPE_BUFFER_OVERFLOW_LINES)}`;
      const sut = runGitHook;
      const result = sut(JSON.stringify({ tool_input: { command } }));
   @@ -350,9 +400,17 @@
      assert.notStrictEqual(result.stdout, '', 'expected a JSON deny on stdout, got an allow');
      const output = JSON.parse(result.stdout).hookSpecificOutput;
      assert.strictEqual(output.permissionDecision, 'deny');
   -  assert.ok(output.permissionDecisionReason.includes('git diff --no-ext-diff HEAD'));
   +  assert.strictEqual(output.permissionDecisionReason, EXT_DIFF_DENY_REASON);
    });
    
   +test('Given an unmodified hook copy beside the engine, when it runs, then it denies with the engine reason', () => {
   +  const sut = withHookCopy;
   +  sut({ anchor: 'set -euo pipefail', inserted: ':' }, (result) => {
   +    assert.strictEqual(result.status, 0, result.stderr);
   +    assert.strictEqual(JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason, EXT_DIFF_DENY_REASON);
   +  });
   +});
   +
    test('Given a hook copy with a syntax error right below its trap, when it runs, then it exits 2 with a craft reason', () => {
      const sut = withHookCopy;
      sut({ anchor: 'trap ', inserted: SYNTAX_ERROR_LINE }, (result) => {
   @@ -384,28 +442,27 @@
    );
    
    test(
   -  'Given a command feed that cannot start after stdin was read, when git-no-ext-diff runs, then it exits 2 with the crash reason',
   +  'Given a verdict feed that cannot start once the traps are set, when git-no-ext-diff runs, then it exits 2 with the crash reason',
      { skip: process.platform !== 'darwin' && 'the descriptor floor is only probed on macOS /bin/bash' },
      () => {
        const sut = withHookCopy;
   -    sut({ anchor: 'IN=${IN%', inserted: `ulimit -n ${TOO_FEW_FILE_DESCRIPTORS - 1}` }, (result) => {
   +    sut({ anchor: 'readonly VERDICT_BIN=', inserted: `ulimit -n ${TOO_FEW_FILE_DESCRIPTORS - 1}` }, (result) => {
          assertCrashDeny(result, FEED_NEVER_RAN_STATUS);
        });
      },
    );
    
    test(
   -  'Given two JSON documents on stdin with a git diff first, when git-no-ext-diff runs, then it denies with the corrected command',
   +  'Given two JSON documents on stdin with a git diff first, when git-no-ext-diff runs, then it exits 2 with the crash reason',
      () => {
        const sut = runGitHook;
        const result = sut('{"tool_input":{"command":"git diff"}} {"tool_input":{"command":"ls"}}');
   -    assert.strictEqual(result.status, 0, result.stderr);
   -    assert.strictEqual(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
   +    assertCrashDeny(result, NODE_UNCAUGHT_ERROR_STATUS);
      },
    );
    
    test(
   -  'Given no writable temp directory, when git-no-ext-diff runs on a matching command, then it still denies with the corrected command',
   +  'Given no writable temp directory, when git-no-ext-diff runs on a matching command, then it still denies with the engine reason',
      { skip: process.platform !== 'darwin' && 'sandbox-exec is macOS-only' },
      () => {
        const sut = () => spawnSync('sandbox-exec', ['-p', NO_TEMP_WRITE_PROFILE, '/bin/bash', GIT_HOOK], {
   @@ -418,11 +475,78 @@
        assert.strictEqual(result.stderr, '');
        const output = JSON.parse(result.stdout).hookSpecificOutput;
        assert.strictEqual(output.permissionDecision, 'deny');
   -    assert.ok(output.permissionDecisionReason.includes('git diff --no-ext-diff HEAD~1'));
   +    assert.strictEqual(output.permissionDecisionReason, EXT_DIFF_DENY_REASON);
      },
    );
    
    // ---------------------------------------------------------------------------
   +// git-no-ext-diff.sh — shell forms the engine parses
   +// ---------------------------------------------------------------------------
   +
   +const ENGINE_DENIED_FORMS = [
   +  { label: 'a subshell', command: '(git diff)' },
   +  { label: 'a brace group', command: '{ git diff; }' },
   +  { label: 'a subshell after an and-list', command: 'true && (git diff)' },
   +  { label: 'an assignment prefix', command: 'FOO=1 git diff' },
   +  { label: 'the env wrapper', command: 'env git diff' },
   +  { label: 'the command builtin', command: 'command git diff' },
   +  { label: 'a negation', command: '! git diff' },
   +  { label: 'the time keyword', command: 'time git diff' },
   +  { label: 'the --no-pager global', command: 'git --no-pager diff' },
   +  { label: 'the -p global', command: 'git -p diff' },
   +  { label: 'a spaced --git-dir global', command: 'git --git-dir .git diff' },
   +  { label: 'mixed -c and --no-pager globals', command: 'git -c x=y --no-pager diff' },
   +  { label: 'a quoted git word', command: '"git" diff' },
   +  { label: 'a string run by sh -c', command: "sh -c 'git diff'" },
   +  { label: 'the marker in a later command', command: 'git diff; echo --no-ext-diff' },
   +  { label: 'the proxy text in an earlier command', command: 'echo "rtk proxy"; git diff' },
   +];
   +
   +const ENGINE_ALLOWED_FORMS = [
   +  { label: 'diff text inside an echo string', command: 'echo "a; git diff x"' },
   +  { label: 'diff text inside a commit message', command: 'git commit -m "wip; git diff fix"' },
   +  { label: 'show text inside a log grep pattern', command: 'git log --grep "x; git show y"' },
   +  { label: 'show text inside a quoted heredoc body', command: "cat > notes.md <<'EOF'\nrun it; git show HEAD\nEOF" },
   +  { label: 'the heredoc commit idiom', command: "git commit -m \"$(cat <<'EOF'\nfix: x\n\ngit diff here\nEOF\n)\"" },
   +];
   +
   +for (const { label, command } of ENGINE_DENIED_FORMS) {
   +  test(`Given ${label} running git diff, when git-no-ext-diff runs, then it denies with the engine reason`, () => {
   +    const sut = runGitHookOnCommand;
   +
   +    const result = sut(command);
   +
   +    assert.strictEqual(result.status, 0, result.stderr);
   +    assert.strictEqual(result.stderr, '');
   +    assert.strictEqual(JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason, EXT_DIFF_DENY_REASON);
   +  });
   +}
   +
   +for (const { label, command } of ENGINE_ALLOWED_FORMS) {
   +  test(`Given ${label}, when git-no-ext-diff runs, then it allows with empty output`, () => {
   +    const sut = runGitHookOnCommand;
   +
   +    const result = sut(command);
   +
   +    assert.strictEqual(result.status, 0, result.stderr);
   +    assert.strictEqual(result.stdout, '');
   +    assert.strictEqual(result.stderr, '');
   +  });
   +}
   +
   +test('Given a git config channel assignment, when git-no-ext-diff runs, then it denies with the engine reason under a single craft prefix', () => {
   +  const sut = runGitHookOnCommand;
   +
   +  const result = sut('GIT_CONFIG_COUNT=1 git status');
   +
   +  assert.strictEqual(result.status, 0, result.stderr);
   +  assert.strictEqual(
   +    JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason,
   +    'craft: git config injected outside -c is denied in this binding',
   +  );
   +});
   +
   +// ---------------------------------------------------------------------------
    // compaction hooks — SessionStart(compact) registration and bound-run lookup
    // ---------------------------------------------------------------------------
    
   ```

   (The fence above is indented three spaces for the list; when saving the diff, strip that
   indentation. `resolveTool` stays: `withToolsOnly` still uses it. `PATH holding every tool but node`
   needs jq on the dev PATH, as the tests it replaces did.)

2. GREEN — replace `hooks/git-no-ext-diff.sh` with this file (lines from `# bash 3.2 ends a syntax
   error` through `trap 'exit "$SIGHUP_EXIT_STATUS"' HUP` are today's L33-55, unchanged):

   ```bash
   #!/bin/bash
   # craft — PreToolUse(Bash): scripted `git diff` / `git show` must carry --no-ext-diff.
   # External-diff tools (difftastic, …) mangle machine-parsed output; agents always parse.
   #
   # Strategy: DENY with a reason, never rewrite. Spike-pinned (2026-06-12): two `updatedInput`
   # hooks on one event do NOT compose (same snapshot, last writer wins), so a rewrite here could
   # be silently clobbered by another rewriting hook (e.g. rtk). A deny beats a concurrent rewrite
   # deterministically — one corrected retry, no clobber.
   #
   # Verdict: the engine's ext-diff rule, computed by node (engine/bin/claude-ext-diff-verdict.js),
   # which parses the shell text: wrappers, assignments, subshells, quotes, `sh -c`, git globals.
   # Node reads the payload on the inherited stdin and prints exactly one token: `allow`, or the
   # JSON deny carrying the engine reason, which this file prints as given.
   #
   # Crash path: Claude Code (2.1.296) runs the Bash call on every hook exit status except 2,
   # and the model never sees the crash. So every failure below (node missing from PATH, older
   # than the engine's supported range, crashed, signalled, or exiting 0 without a verdict token;
   # stdin that is not JSON; a feed that cannot start) ends in exit 2 with a
   # `craft git-no-ext-diff:` reason on stderr, never in the status that crashed.
   # TERM and HUP deny the same way. Still fails open, because no code here runs to catch it:
   # /bin/bash missing, this file missing or not executable, SIGKILL or any other untrapped
   # signal. A run past Claude Code's hook timeout (600 s; hooks.json sets none) fails open
   # too, though code here does run: at the deadline Claude Code (2.1.299) sends SIGTERM to
   # this hook's whole process tree, so a stalled node dies with it (whatever survives is
   # SIGKILLed), then runs the call whatever this hook exits with or prints (2.1.296 in a
   # background wait, 2.1.299 in a foreground stall). The TERM and HUP traps still deny either
   # signal from any other sender.
   set -euo pipefail

   readonly CRASH_DENY_EXIT_CODE=2
   readonly FEED_SENTINEL='.'
   readonly FEED_NEVER_RAN_STATUS=1
   readonly SIGTERM_EXIT_STATUS=143
   readonly SIGHUP_EXIT_STATUS=129
   # deny_on_crash reports an exit 0 before a verdict as "no verdict reached"
   readonly NO_VERDICT_STATUS=0
   readonly ALLOW_VERDICT='allow'
   readonly DENY_VERDICT_PREFIX='{"hookSpecificOutput":'

   # bash 3.2 ends a syntax error below the trap with status 0, so only a reached verdict
   # may exit clean.
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
   # A signal's default action ends bash with the signal's status even after the EXIT trap ran;
   # exiting from the signal's own trap hands the EXIT trap that status to deny instead.
   trap 'exit "$SIGTERM_EXIT_STATUS"' TERM
   trap 'exit "$SIGHUP_EXIT_STATUS"' HUP

   hook_dir=${BASH_SOURCE[0]%/*}
   [ "$hook_dir" = "${BASH_SOURCE[0]}" ] && hook_dir=.
   readonly VERDICT_BIN="$hook_dir/../engine/bin/claude-ext-diff-verdict.js"

   # A command substitution that cannot start (no pipe or fork left) expands to nothing with
   # status 0, which reads as a silent verdict. Only a node run that exited 0 appends the
   # sentinel, so a missing one is a crash; a node that failed ends the hook through errexit
   # with its own status, which the EXIT trap denies.
   VERDICT=$(node "$VERDICT_BIN" && printf '%s' "$FEED_SENTINEL")
   [ "${VERDICT%"$FEED_SENTINEL"}" != "$VERDICT" ] || exit "$FEED_NEVER_RAN_STATUS"
   VERDICT=${VERDICT%"$FEED_SENTINEL"}
   case "$VERDICT" in
     "$ALLOW_VERDICT")        allow ;;
     "$DENY_VERDICT_PREFIX"*) printf '%s\n' "$VERDICT" ;;
     *)                       exit "$NO_VERDICT_STATUS" ;;
   esac
   verdict_reached=1
   ```

   (Strip the three-space list indentation when writing the file. Keep the executable bit:
   `/usr/bin/git ls-files -s hooks/git-no-ext-diff.sh` must still show `100755`.)
   `node --test test/hooks.test.js > <scratch>/hooks.log 2>&1` — 0 fail.

3. REFACTOR — none expected. Check `grep -nE 'jq|grep|sed|cat ' hooks/git-no-ext-diff.sh` finds only
   prose, and `/usr/bin/git diff --no-ext-diff --quiet -- hooks/hooks.json` exits 0 (R4).

### Gate

- `node --test test/hooks.test.js > <scratch>/hooks.log 2>&1; echo "exit $?"` — exit 0.
- `bash scripts/ci.sh > <scratch>/ci.log 2>&1; echo "exit $?"` — exit 0; grep the log for `not ok`.

### Commit

`fix(hooks): judge Bash calls with the engine ext-diff verdict in the Claude hook`

## Part 3 — Living docs: the Claude binding and the node prerequisite

### Context

Files this part edits (docs-only, no src/ delta):

- `docs/contributing/specs/gate.md` — EDIT: the "Claude binding" bullet L47-56, two sentences of the
  crash paragraph L58-71, and the Pi paragraph L97.
- `README.md` — EDIT: the Quickstart requirement sentence L99-101 only. (The L200 corpus counts are
  not this part's: the plan commit already set them.)

No test pins the text of either paragraph (grep of test/, engine/test and adapters/*/test for
`git-no-ext-diff`, `Re-issue`, and the README requirement sentence finds only test/hooks.test.js).
The gates that read these files: test/living-corpus.test.js and the ci.sh intention-lint (gate.md is
in the living corpus; its `subjects` frontmatter is untouched); test/source-hygiene.test.js Class A/B
over docs/contributing/specs and README.md (no `stryker`/`mutation`/`mutant`/`gh`/`github` words) and
Class D (no home-rooted paths); prose-lint on touched README.md (ban list: `delve`, `leverage`,
`seamless`, `robust`, `it's important to note`, `in conclusion`, …); the readme-drift guard (example
config, pipeline diagram, cost numbers, counts — not this sentence).

The three places must state one crash contract (the hook header landed in Part 2): node missing,
older than the engine's range, crashed, signalled, or silent → exit 2 deny; TERM/HUP trapped; the
residual fail-opens (/bin/bash missing, hook file missing or not executable, SIGKILL or any other
untrapped signal, the 600 s timeout) unchanged. The timeout paragraph (L73-90) stays as written: it
records what the 2.1.299 probe saw (`cat`, `jq`, `grep` and `sed` dying on TERM).

### TDD steps

1. GUARD — before editing, `node --test test/living-corpus.test.js test/source-hygiene.test.js` passes
   (baseline).
2. GREEN (docs) — in `docs/contributing/specs/gate.md`, replace the first six lines of the bullet
   (L47-52, from the line starting `- ` + the hook path through the line ending with the `rtk proxy`
   pass-through sentence) with the block below. Keep L53-56 (the deny-over-rewrite rationale) as they are.

   ```markdown
   - `hooks/git-no-ext-diff.sh` — matched to `Bash` tool calls. A bash crash shell around a node
     verdict: it runs `node engine/bin/claude-ext-diff-verdict.js` (`engine/src/claude-ext-diff-hook-main.js`),
     which reads the payload on the inherited stdin and judges `tool_input.command` with
     `gitExtDiffPredicate`, the engine's ext-diff rule and the module codex's and copilot's Bash
     paths use for that rule. The parse sees through wrappers, assignments, subshells, groups,
     reserved words, quote removal, `sh -c`/`eval` and git global options, judges `--no-ext-diff`
     and `rtk proxy` per invocation, and reads quoted text and heredoc bodies as data. Node prints
     exactly one token: `allow`, on which the hook exits 0 with no output, or
     `{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
     permissionDecisionReason: "craft: <engine reason>" } }`, which the hook prints as given. The
     reason is the engine's with one `craft: ` prefix:
     `craft: git diff/show must carry --no-ext-diff (external diff mangles parsed output)`, or the
     config-channel, inline-alias or parse-failure reason (an over-long command included). A
     `tool_input.command` that is absent, `null` or empty is allowed; one that is not a string
     inside JSON objects makes node exit 1, a crash.
   ```

3. GREEN (docs) — in the crash paragraph (wrapped over L64-67), replace this text:

   ```text
   The JSON deny stays the matcher's verdict, and a grep failure is a crash, never a no-match: only grep's exit 1 with a printed zero count allows.
   ```

   with:

   ```text
   The JSON deny stays the verdict, and only node's exact `allow` token allows: a node that is missing, older than the engine's range, crashes, is killed by a signal, or exits 0 without a token is a crash, as is a missing feed sentinel. Node's own stderr precedes the craft line.
   ```

   and replace:

   ```text
   With `jq` missing from `PATH`, every Bash call is denied.
   ```

   with:

   ```text
   With `node` missing from `PATH`, or older than the engine's supported range (`^22.18.0 || >=24.2.0`), every Bash call is denied.
   ```

   Re-wrap the paragraph to the file's ~100-column width, two-space indented as today; change no
   other sentence.

4. GREEN (docs) — L97, inside the Pi paragraph, replace `regex logic)` with `ext-diff verdict)`, so
   the parenthesis reads: the Pi-side equivalent of the hook's ext-diff verdict.

5. GREEN (docs) — `README.md` L99-101 becomes:

   ```markdown
   Requirement: **a discoverable test command** (`pytest`, `go test`, `cargo test`,
   `make test`, …) and `node` (^22.18 or ≥24.2) on `PATH` (the Claude Code guard hook denies
   every Bash call without it, or with an older one). No test command → craft refuses to run, by design.
   ```

6. GUARD — `node --test test/living-corpus.test.js test/source-hygiene.test.js test/hooks.test.js`
   passes; `grep -n "jq" README.md` no longer names jq as a requirement;
   `grep -n "Re-issue\|regex logic\|grep's exit" docs/contributing/specs/gate.md` finds nothing.

### Gate

- `node --test test/living-corpus.test.js test/source-hygiene.test.js`
- `bash scripts/ci.sh > <scratch>/ci.log 2>&1; echo "exit $?"` — exit 0; grep the log for `not ok`/`^ci:`.

### Commit

`docs(gate): describe the Claude hook engine verdict and its node prerequisite`

## Part 4 — Differential arm: the real hook against the in-process verdict

### Context

File this part creates (test-infra-only, no src/ delta):

- `test/git-no-ext-diff.differential.test.js` — CREATE. CommonJS like every root test/ suite.

It runs in the ci.sh `process` suite (`run_suite process test` enumerates every test/**/*.test.js,
this one included) and never under Stryker (root test/ is not in engine/stryker.conf.json
`tap.testFiles`; engine/test/mutation-config.test.js needs no row). test/every-test-file-registers.test.js
needs only one `describe`/`it` call in the file.

Reused, read-only: engine/test-helpers/git-differential-harness.js (ESM; `require()` of it from CJS
works on the supported node range — checked on node 22.22.3, no warning). Exports used:
`generateCommands(seed, cap)` → frozen array of `{ text, … }` entries (fixed specials + random
compositions), `mapPool(items, worker)` (8 concurrent lanes), `ORIGINAL_PATH`, `SPAWN_TIMEOUT_MS`
(5000). The seed/cap env convention is the codex arm's (adapters/codex/test/git-guard.differential.test.js):
`GUARD_FUZZ_SEEDS` (comma list, default `[20260]`) and `GUARD_FUZZ_COUNT` (default 400).
`gitExtDiffPredicate` comes from engine/src/guards/git-ext-diff-predicate.js.

Oracle (DC-P2 (a)): for every command, the real hook (`/bin/bash hooks/git-no-ext-diff.sh`, payload
`JSON.stringify({ tool_input: { command } })`, env `{ PATH: ORIGINAL_PATH }`) exits 0, is not killed,
and prints exactly the in-process verdict: `''` when `gitExtDiffPredicate(command).block` is false,
otherwise the deny JSON + `\n` with the reason `craft: `-prefixed once. Seven fixed decode-edge
commands are appended (U+2028, U+2029, NUL, both lone surrogates, a 126,000-byte command, non-ASCII):
they are where a `JSON.stringify` → node `JSON.parse` divergence would show. Generated commands never
appear in titles.

### TDD steps

1. GUARD — create the file below and run
   `node --test test/git-no-ext-diff.differential.test.js > <scratch>/diff.log 2>&1`. It passes
   (pre-validated: 407 judged, 110 blocked, ~2.8 s) because Parts 1-2 landed the hook this suite
   checks; against the pre-Part-2 hook it fails with 112 problem lines, so it is not vacuous.

   ```js
   'use strict';
   const { describe, it } = require('node:test');
   const assert = require('node:assert');
   const { spawn } = require('node:child_process');
   const path = require('node:path');
   const { ORIGINAL_PATH, SPAWN_TIMEOUT_MS, generateCommands, mapPool } = require('../engine/test-helpers/git-differential-harness.js');
   const { gitExtDiffPredicate } = require('../engine/src/guards/git-ext-diff-predicate.js');

   // Maintainers can scale the fuzz on demand: GUARD_FUZZ_SEEDS=1,2,3 (comma list) and GUARD_FUZZ_COUNT=2000 override these defaults.
   const parseSeeds = (text) => text.split(',').map(Number);
   const SEEDS = Object.freeze(process.env.GUARD_FUZZ_SEEDS ? parseSeeds(process.env.GUARD_FUZZ_SEEDS) : [20260]);
   const CAP = Number(process.env.GUARD_FUZZ_COUNT ?? 400);
   const FUZZ_TIMEOUT_MS = 120_000;
   const VERDICT_EXIT_CODE = 0;
   const REASON_PREFIX = 'craft: ';
   const MAX_REPORTED_CHARS = 200;
   const PIPE_BUFFER_OVERFLOW_LINES = 14000;
   const HOOK = path.join(__dirname, '..', 'hooks', 'git-no-ext-diff.sh');
   // Strings whose JSON round trip differs from a plain one: escapes the payload encoder must emit and node must decode.
   const DECODE_EDGE_COMMANDS = Object.freeze([
     'git diff ',
     'echo a ; git diff',
     'git diff \u0000x',
     'git diff \ud800',
     'echo "\udfff"; git show',
     `git diff HEAD\n${'echo pad\n'.repeat(PIPE_BUFFER_OVERFLOW_LINES)}`,
     'echo été; git diff --no-ext-diff',
   ]);

   function runHook(command) {
     return new Promise((resolve, reject) => {
       const child = spawn('/bin/bash', [HOOK], { env: { PATH: ORIGINAL_PATH }, stdio: ['pipe', 'pipe', 'pipe'], timeout: SPAWN_TIMEOUT_MS });
       const stdout = [];
       const stderr = [];
       child.stdout.on('data', (chunk) => stdout.push(chunk));
       child.stderr.on('data', (chunk) => stderr.push(chunk));
       child.on('error', reject);
       child.on('close', (code, signal) => resolve({ code, signal, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() }));
       child.stdin.on('error', () => {});
       child.stdin.end(JSON.stringify({ tool_input: { command } }));
     });
   }

   function expectedStdout(command) {
     const verdict = gitExtDiffPredicate(command);
     if (!verdict.block) return '';
     const reason = verdict.reason.startsWith(REASON_PREFIX) ? verdict.reason : `${REASON_PREFIX}${verdict.reason}`;
     return `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`;
   }

   function problemsOf(command, run) {
     if (run.signal !== null) return [`hook was killed (${run.signal})`];
     const problems = [];
     if (run.code !== VERDICT_EXIT_CODE) problems.push(`exit ${run.code}: ${run.stderr.trim()}`);
     if (run.stdout !== expectedStdout(command)) problems.push(`stdout ${JSON.stringify(run.stdout.slice(0, MAX_REPORTED_CHARS))} differs from the in-process verdict`);
     return problems;
   }

   const describeCommand = (command) => JSON.stringify(command.length > MAX_REPORTED_CHARS ? `${command.slice(0, MAX_REPORTED_CHARS)}...` : command);

   describe('claude ext-diff hook - differential against the in-process engine verdict', { concurrency: true }, () => {
     for (const seed of SEEDS) {
       it(`Given every command of seed ${seed} plus the decode edge commands, when the real hook judges each, then it exits 0 with exactly the in-process verdict`, { timeout: FUZZ_TIMEOUT_MS }, async (t) => {
         const commands = [...generateCommands(seed, CAP).map((entry) => entry.text), ...DECODE_EDGE_COMMANDS];
         const sut = runHook;
         const started = Date.now();

         const runs = await mapPool(commands, (command) => sut(command));

         t.diagnostic(`judged ${commands.length}, blocked ${commands.filter((command) => gitExtDiffPredicate(command).block).length}, wall ${Date.now() - started} ms`);
         const problems = commands.flatMap((command, index) => problemsOf(command, runs[index]).map((problem) => `${problem} :: ${describeCommand(command)}`));
         assert.ok(problems.length === 0, `\n${problems.join('\n')}`);
       });
     }
   });
   ```

   (Strip the three-space list indentation. The `child.stdin.on('error', () => {})` listener mirrors
   the codex arm: a hook that exits before reading all of stdin must not crash the test process with
   EPIPE; the run's exit code still carries the verdict.)

2. GUARD — `GUARD_FUZZ_SEEDS=1,2,3 node --test test/git-no-ext-diff.differential.test.js` passes
   (wider seed sweep, not committed as a default). If a seed fails, the problem line names the command;
   that is a real divergence — report it with the blocker protocol, do not weaken the oracle.

### Gate

- `node --test test/git-no-ext-diff.differential.test.js test/every-test-file-registers.test.js test/source-hygiene.test.js`
- `bash scripts/ci.sh > <scratch>/ci.log 2>&1; echo "exit $?"` — exit 0; grep the log for `not ok`.

### Commit

`test(hooks): add a differential arm between the Claude hook and the engine verdict`
