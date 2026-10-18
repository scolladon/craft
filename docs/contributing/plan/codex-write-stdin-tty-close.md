# Plan — codex-write-stdin-tty-close

> Source: design doc `docs/contributing/design/codex-write-stdin-tty-close.md` · ADRs `642, 643, 644, 645`
> (642 ratified by the user: the binding disables tty sessions; 643 the launch path forces tty off
> with an unconditional `-c features.unified_exec_tty=false`; 644 the key sits in its own
> `[features]` table between the posture keys and `[[hooks.PreToolUse]]`; 645 the key is pinned by
> a line-scoped section scan)
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

| # | Part | src delta | Files | Size | Design section |
|---|---|---|---|---|---|
| 1 | The template key | config template (+~10 lines, no JS) | 2 | small | Design Part 1 |
| 2 | The launch flag, under mutation | codex adapter launch-args (+~5) | 3 | small | Design Part 2 |
| 3 | Disclosure: README, gate.md, PoC record | none (docs + README pins) | 4 | medium | Design Part 3 |

How the design's choices land here:

- The design's DC-1/DC-2/DC-3 are settled by ADRs 643/644/645, and the binding-level choice by
  ADR 642 (user-ratified). One planning-time finding is open: DC-P1 below. Part 2 is written to
  its recommendation (a); if (b) or (c) is chosen, only Part 2 step 3 changes.
- Part 2 also registers adapters/codex/src/launch-args.js in engine/stryker.conf.json. Without
  that, validation's `--mutate adapters/codex/src/launch-args.js` runs no covering suite (the
  conf's `tap.testFiles` does not list launch-args.test.js today) and reports every mutant
  `NoCoverage`. engine/test/mutation-config.test.js requires the mutate entry and its own test
  file to be added as a pair.
- Untouched (R7): `CODEX_TOOL_NAMES` and its comment in adapters/codex/src/git-guard-adapter.js,
  adapters/codex/hooks/craft-guard.js, adapters/codex/hooks.json, adapters/codex/craft.rules,
  adapters/codex/test/fixtures/pre-tool-use-bash.json (probe 9: payload identical), and
  adapters/codex/src/probe.js (it picks the flag up through its existing
  `buildLaunchArgs({ workingDir: targetPath })` call). No part edits any of them.
- Not in this plan, by instruction: the BACKLOG tick (documentation phase). The root README
  parted-plan count (80 → 81) lands with this plan commit; no part touches the root README.

Pre-validated in a mktemp throwaway (`git archive HEAD` of this branch at `089984c`), with the
exact RED tests and GREEN edits below applied:

| Check | Result |
|---|---|
| Part 1 + Part 2 RED tests against unchanged code | 5 fail (2 config, 3 launch-args), every other row passes |
| Part 1 + Part 2 GREEN, `node --test adapters/codex/test/*.test.js engine/test/mutation-config.test.js` | 715 pass / 0 fail (hook-trust template pins and native-surface hygiene scans included) |
| Stryker, launch-args.js, narrowed to launch-args.test.js + probe.test.js, before the clause removal | 27 killed, 2 survived, both on `workingDir === ''` (ConditionalExpression, StringLiteral) |
| Same, after removing `workingDir === ''` | 24 killed, 0 survived, 100.00 |
| Part 3 README pins against the current README | 5 fail, 149 pass |
| Part 3 README edits applied | 154 pass / 0 fail |

Standing rules for every part:

- TDD London School; `describe`/`it` titles in Given/When/Then; AAA bodies with a `sut` variable.
  **New titles are printable ASCII only**: write ` - ` not an em dash in new `describe` titles
  (launch-args.test.js enters Stryker's tap run in Part 2, and Stryker's tap dry run rejects
  NEL/U+2028/invisible characters). Constants in code may hold any text.
- No ADR/phase/backlog/probe numbers (`ADR-642`, `P1`, `Part 2`, `backlog #n`) in source, tests,
  the config template, or adapters/codex/README.md. adapters/codex/test/native-surface.test.js
  scans README.md, config.template.toml and craft.rules with
  `PROVENANCE_REF = /\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i` and with
  `SHELL_INJECTION_PATTERN = /!`[^`]*`/` (an exclamation mark immediately before a backticked
  span is banned).
- Git: use `/usr/bin/git` for every verb (an `rtk` rewrite trips the worktree guard); scripted
  `git diff`/`git show` pass `--no-ext-diff`. Commit only your own files.
- Pipe `bash scripts/ci.sh` to a file and grep the summary. If a bounded-time shell-tokeniser test
  or a fuzz test dies by SIGTERM under machine load, re-run it unchanged once before calling it red.
- Mutation: one comma-separated `--mutate` per run (repeated flags silently drop all but the last).
  If the dry run dies with `Worker exited unexpectedly`, narrow `tap.testFiles` to the mutated
  file's own suites (adapters/codex/test/launch-args.test.js, adapters/codex/test/probe.test.js)
  in an override config passed positionally, then hand-check every survivor against that full
  covering set before writing a test.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-P1 | The two pre-existing equivalent mutants on `workingDir === ''` in `assertAbsoluteWorkingDir` (they surface because Part 2 brings launch-args.js under Stryker for the first time) | (a) **Drop the clause** in Part 2's REFACTOR: `isAbsolute('')` is false, so `''` still throws the same error; the failure-contract `''` row guards it. (b) Keep the clause, annotate both mutants with the repo's `// equivalent mutant (<Mutator>): <why>` convention. (c) Keep the clause, leave the survivors to validation's triage | (a) | The clause is dead code (pre-validated: 24/24 killed after removal, failure contract unchanged). (b) keeps dead code and adds a comment that exists only to explain it. (c) hands validation a known, already-proven-equivalent pair to re-triage |

## Part 1 — The template key

### Context

Files this part edits:

- `adapters/codex/config.template.toml` — EDIT: insert one commented `[features]` table.
- `adapters/codex/test/config.test.js` — EDIT: new constants, two helpers, one new describe.

Public-surface decision: nothing exported. The two helpers and three constants are module-private
to config.test.js.

Current template (lines 12-15): `sandbox_mode = "workspace-write"`, `approval_policy = "on-request"`,
a blank line, then the guard-registration comment that opens `# The guard registration.` and runs
to `[[hooks.PreToolUse]]` at line 34. The file ends in nine `[agents.craft-*]` tables. Insert the
block below between the blank line after `approval_policy` and `# The guard registration.`, so a
blank line separates it from both (DC-2 (a), ADR 644). Target text, exact:

```toml
approval_policy = "on-request"

# Interactive tty sessions are off. codex fires no PreToolUse hook for `write_stdin`, and
# only a tty session keeps stdin open for it to type into, so with tty sessions off the
# text it would type reaches no shell. Removing this line reopens that channel. Cost: the
# model gets no interactive shell, REPL or prompt-answering session. If your config.toml
# already has a [features] table, add the key there: a second [features] header is
# invalid TOML.
[features]
unified_exec_tty = false

# The guard registration. ...
```

TOML traps the test must catch (and the reason a whole-file regex is rejected, ADR 645): the key
commented out, or appended at the end where it lands inside `[agents.craft-backlog-ticker]`.

Existing pins that must stay green unedited (R2), all pre-validated with the block above:
adapters/codex/test/hook-trust.test.js lines 416-460 (one `command = '...'` assignment identical
to hooks.json's; `REGISTRATION_LINES` present; only `type = "command"` between
`[[hooks.PreToolUse.hooks]]` and the command); config.test.js `config.template.toml — sandbox
posture` and `— provider-neutral model vocabulary` (no `gpt-` literal is added); native-surface
hygiene scans over config.template.toml (the comment carries no provenance token and no
exclamation mark).

config.test.js today: imports `describe, it` from node:test and `assert` from
node:assert/strict; `readConfigTemplate()` (line 27) returns the template text. Append at the end
of the file (after the last describe, line ~144):

```js
const FEATURES_HEADER = '[features]';
const TABLE_HEADER_PATTERN = /^\s*\[/;
const TTY_OFF_LINE_PATTERN = /^\s*unified_exec_tty\s*=\s*false\s*$/;

function templateLines() {
  return readConfigTemplate().split('\n');
}

// Line-scoped on purpose: a whole-file match would also accept the key commented out
// or sitting under another table, where codex ignores it.
function featuresTableLines(lines) {
  const start = lines.findIndex((line) => line.trim() === FEATURES_HEADER);
  assert.notEqual(start, -1, `config.template.toml has no ${FEATURES_HEADER} table header`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => TABLE_HEADER_PATTERN.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}
```

`TABLE_HEADER_PATTERN` matches both `[table]` and `[[array.table]]` headers; a comment line
(`# [features]`) does not match it, and a commented `# unified_exec_tty = false` does not match
`TTY_OFF_LINE_PATTERN`.

### TDD steps

1. RED — append `describe('config.template.toml - tty sessions off', ...)` with:
   - `it('Given config.template.toml, when the [features] table is read up to the next table header, then it holds unified_exec_tty = false')`:
     `const sut = featuresTableLines(templateLines());`
     `const result = sut.some((line) => TTY_OFF_LINE_PATTERN.test(line));`
     `assert.ok(result, \`the ${FEATURES_HEADER} table carries no unified_exec_tty = false line\`);`
     Expected failure: `featuresTableLines` throws on `assert.notEqual(start, -1, ...)` — the
     template has no `[features]` header line.
   - `it('Given config.template.toml, when every table header is collected, then [features] appears exactly once')`:
     `const sut = templateLines();`
     `const result = sut.filter((line) => line.trim() === FEATURES_HEADER);`
     `assert.equal(result.length, 1);`
     Expected failure: `0 !== 1` — no `[features]` header today.
2. GREEN — insert the commented `[features]` block into `adapters/codex/config.template.toml`
   as shown in Context. `node --test adapters/codex/test/config.test.js` passes.
   GUARD — `node --test adapters/codex/test/hook-trust.test.js adapters/codex/test/native-surface.test.js`:
   every row passes (pre-validated: the block adds no `command =` line, no registration line, no
   model id, no provenance token).
3. REFACTOR — none expected; keep the helpers next to the new describe.

### Gate

- `node --test adapters/codex/test/config.test.js adapters/codex/test/hook-trust.test.js adapters/codex/test/native-surface.test.js`
- `bash scripts/ci.sh > <scratch>/ci.log 2>&1; echo "exit $?"` then grep the log for `not ok`/`ci:` lines — exit 0.

### Commit

`fix(codex): switch interactive tty sessions off in the config template`

## Part 2 — The launch flag, under mutation

### Context

Files this part edits:

- `adapters/codex/src/launch-args.js` — EDIT: two constants, two array entries, one header
  bullet; drop the redundant `workingDir === ''` clause.
- `adapters/codex/test/launch-args.test.js` — EDIT: one new describe, two constants.
- `engine/stryker.conf.json` — EDIT: register the source and its suite.

Public-surface decision: no new export. `FLAG_CONFIG_OVERRIDE` and `DISABLE_TTY_SESSIONS` are
module-private constants. Signature unchanged:
`export function buildLaunchArgs({ workingDir, bypassHookTrust = false })` → `string[]`. No new
parameter (DC-1 (a), ADR 643: no opt-out).

Current code (adapters/codex/src/launch-args.js):

- Header docblock lines 1-14; the last bullet ends with the adapters/pi/src/execution.js
  reference, then the closing ` */`. Add one bullet after it:
  ```
   *   - Interactive tty sessions are always switched off. Text typed into one
   *     through `write_stdin` fires no guard hook, and this override also wins
   *     over a config.toml that turns tty sessions back on.
  ```
- Constants lines 18-21: `FLAG_SANDBOX = '-s'`, `SANDBOX_WORKSPACE_WRITE = 'workspace-write'`,
  `FLAG_WORKING_DIR = '-C'`, `FLAG_BYPASS_HOOK_TRUST = '--dangerously-bypass-hook-trust'`. Add
  after them:
  ```js
  const FLAG_CONFIG_OVERRIDE = '-c';
  const DISABLE_TTY_SESSIONS = 'features.unified_exec_tty=false';
  ```
- `assertAbsoluteWorkingDir(workingDir)` line 32:
  `if (typeof workingDir !== 'string' || workingDir === '' || !isAbsolute(workingDir)) {` →
  `if (typeof workingDir !== 'string' || !isAbsolute(workingDir)) {`. `isAbsolute('')` is false,
  so `''` still throws the same error; `typeof` stays because `isAbsolute(undefined)` throws a
  TypeError instead of the contract error. Leave the error message text unchanged.
- `const args = [...]` lines 48-56: `FLAG_SANDBOX, SANDBOX_WORKSPACE_WRITE, FLAG_WORKING_DIR,
  workingDir,` then the `--ephemeral` comment block. Insert `FLAG_CONFIG_OVERRIDE,` and
  `DISABLE_TTY_SESSIONS,` (two elements, one per line) after `workingDir,` and before the
  `--ephemeral` comment. The bypass `args.push(...)` stays last. Result:
  `['-s', 'workspace-write', '-C', <dir>, '-c', 'features.unified_exec_tty=false']` (+ the bypass
  flag on opt-in). The consumer contract `execFile('codex', ['exec', ...args, prompt])` puts the
  flag after `exec`, the form probe 8 ran.

Other argv assertions checked (grep `buildLaunchArgs`, `launchArgs`): adapters/codex/test/probe.test.js
`runAcceptanceProbe() — launch-args wiring` (line 128) asserts only `--ephemeral` absent,
`danger-full-access` absent, and `-C` followed by the throwaway path — no full-argv equality, so it
needs no edit (pre-validated green). No other codex test or source reads the argv. The other
adapters' `buildLaunchArgs` (aider, cursor, copilot) are different modules; do not touch them.

launch-args.test.js today: `WORKING_DIR` (line 5, a fixed absolute fixture path) and describes for
forbidden flags, sandbox posture, working dir posture, hook-trust posture, failure contract
(rows `undefined`, `''`, `'./x'` → `/must be a non-empty absolute path/`). Append the new describe
at the end of the file.

engine/stryker.conf.json today has no launch-args entry. Add
`"adapters/codex/test/launch-args.test.js"` to `tap.testFiles` right after
`"adapters/codex/test/atomic-write.test.js"`, and `"adapters/codex/src/launch-args.js"` to `mutate`
right after `"adapters/codex/src/atomic-write.js"`. engine/test/mutation-config.test.js maps each
`adapters/**/src/*.js` mutate entry to `adapters/**/test/*.test.js` and fails if either half of
the pair is missing; do not add probe.test.js (it has no matching mutate entry, and adding probe.js
is out of scope).

Mutation target: adapters/codex/src/launch-args.js. Pre-validated: with the clause still present
two mutants on `workingDir === ''` survive (equivalent: `''` is rejected by `!isAbsolute`); with
the clause removed, 24/24 killed. The new string literals and array entries are killed by step 1's
rows (`'-c'` → `""`: the index lookup fails; the flag value → `""`: the adjacency and exactly-once
rows fail; an element dropped: the adjacency row fails).

### TDD steps

1. RED — append to `adapters/codex/test/launch-args.test.js`:
   ```js
   const FLAG_CONFIG_OVERRIDE = '-c';
   const TTY_SESSIONS_OFF = 'features.unified_exec_tty=false';
   ```
   and `describe('buildLaunchArgs() - tty-session posture', ...)` with:
   - `it('Given a working dir, when buildLaunchArgs runs, then -c is emitted as its own element immediately followed by features.unified_exec_tty=false')`:
     `const sut = buildLaunchArgs;` `const result = sut({ workingDir: WORKING_DIR });`
     `const flagIndex = result.indexOf(FLAG_CONFIG_OVERRIDE);`
     `assert.notEqual(flagIndex, -1, ...)`; `assert.equal(result[flagIndex + 1], TTY_SESSIONS_OFF);`
     Expected failure: `flagIndex` is -1 — the argv today is `['-s', 'workspace-write', '-C', dir]`.
   - `it('Given bypassHookTrust true, when buildLaunchArgs runs, then -c is still immediately followed by features.unified_exec_tty=false')`:
     same body with `sut({ workingDir: WORKING_DIR, bypassHookTrust: true })`.
     Expected failure: `flagIndex` is -1 — the argv carries only the four posture elements plus
     `--dangerously-bypass-hook-trust`.
   - `it('Given a working dir, when buildLaunchArgs runs, then features.unified_exec_tty=false appears exactly once')`:
     `assert.equal(result.filter((element) => element === TTY_SESSIONS_OFF).length, 1);`
     Expected failure: `0 !== 1`.
2. GREEN — add the two constants and the two array entries in `adapters/codex/src/launch-args.js`
   as shown in Context. `node --test adapters/codex/test/launch-args.test.js adapters/codex/test/probe.test.js`
   passes.
3. REFACTOR — add the header bullet; drop `workingDir === ''` from `assertAbsoluteWorkingDir`.
   GUARD — the failure-contract row `Given working dir "", ...` still throws
   `/must be a non-empty absolute path/` (`isAbsolute('')` is false); every other launch-args and
   probe row passes unchanged.
4. Register in `engine/stryker.conf.json` (both entries above).
   GUARD — `node --test engine/test/mutation-config.test.js`: the pair rule and the
   paths-exist rule pass.
5. Mutation — run in the background:
   `npm --prefix engine run mutation -- --mutate "adapters/codex/src/launch-args.js"`.
   Expected: 0 survivors (pre-validated 24/24 on the narrowed corpus). Kill any survivor with a
   test after hand-checking it against launch-args.test.js + probe.test.js.

### Gate

- `node --test adapters/codex/test/launch-args.test.js adapters/codex/test/probe.test.js engine/test/mutation-config.test.js`
- `npm --prefix engine run mutation -- --mutate "adapters/codex/src/launch-args.js"` (no survivor)
- `bash scripts/ci.sh > <scratch>/ci.log 2>&1; echo "exit $?"` then grep the log for `not ok`/`ci:` lines — exit 0.

### Commit

`fix(codex): force tty sessions off on every codex exec launch`

## Part 3 — Disclosure: README, gate.md, PoC record

### Context

Files this part edits (no `src/` delta; the README pins are the tests):

- `adapters/codex/README.md` — EDIT: §Configure paragraph; §Guard new bullet; "Still open" bullet
  loses its `write_stdin` sentences.
- `adapters/codex/test/native-surface.test.js` — EDIT: constants, three helpers, one new describe.
- `docs/contributing/specs/gate.md` — EDIT: residual bullet removed, closed family extended.
- `docs/contributing/specs/codex-poc-record.md` — EDIT: nine rows appended after the existing
  `write_stdin` row.

Public-surface decision: nothing exported; the helpers are module-private to the test file.

**README, §Configure** (`## Configure`, line 85). The first paragraph ends
`` from this binding's own tier map (`src/model-tier-map.js`). `` (line 92), followed by a blank
line and the `Deploy the execpolicy rules file` paragraph. Insert this paragraph between them, exact:

```
The template also switches interactive tty sessions off: a `[features]` table holding
`unified_exec_tty = false`. `buildLaunchArgs` passes `-c features.unified_exec_tty=false` on
every launch too, which wins over a `config.toml` that drops the key or sets it to `true`.
Codex fires no PreToolUse hook for `write_stdin`, and only a tty session keeps stdin open for
it to type into. The cost: the model gets no interactive shell, REPL or prompt-answering
session. If your `config.toml` already has a `[features]` table, add the key to that table: a
second `[features]` header is a duplicate table, which is invalid TOML.
```

**README, §Guard** (`## Guard — honest enforcement profile`, line 163). The "Still open" bullet
(line 191) reads, lines 191-198: `- Still open: git reached through channels no string guard
follows (scripts, `make`, ... a renamed or` / `copied git binary). Text typed into a tty session
through `write_stdin` is one of them:` / `codex fires no PreToolUse hook for `write_stdin`, so a
shell opened without mentioning` / `git runs whatever is typed into it. A hook that runs past its
`timeout` also fails open. craft sets no` / ... timeout sentences. Delete the three `write_stdin`
sentences so line 193 becomes `` copied git binary). A hook that runs past its `timeout` also fails open. craft sets no ``
and the timeout sentences follow unchanged. Insert this bullet immediately before `- Still open:`, exact:

```
- `write_stdin` is closed on 0.162.1 by the template's `unified_exec_tty = false` and the
  launch flag `-c features.unified_exec_tty=false`. Codex refuses `tty: true` with
  `TTY execution is disabled by config`, and a non-tty session's stdin is closed, so
  `write_stdin` fails with `stdin is closed for this session`. `write_stdin` stays in the
  tool list. Dropping the key, or running codex outside the binding's launch path without
  it, reopens the `write_stdin` channel.
```

README lines 146-151 (bypass flag) and 218 (`--ephemeral`): no change.

**native-surface.test.js** today: `README_PATH` (line 13), `CONFIGURE_HEADING = '## Configure'`
(line 43), `sectionAfter(text, heading)` (line ~95: lines under the heading line up to the next
`## ` line, `null` when absent), `readConfigureSection()` (line ~104), and
`describe('README.md — honesty pins', ...)` at line 356. Append after the last describe in the
file (line ~513):

```js
const GUARD_HEADING = '## Guard — honest enforcement profile';
const STILL_OPEN_BULLET = '- Still open:';
const BULLET_START = '- ';
const SENTENCE_END = /(?<=\.)\s+/;

function readGuardSection() {
  const section = sectionAfter(readFileSync(README_PATH, 'utf8'), GUARD_HEADING);
  assert.notEqual(section, null, `README.md has no "${GUARD_HEADING}" line`);
  return section;
}

/** The lines of the bullet opening with `opening`, up to the next bullet or blank line. */
function bulletOpening(text, opening) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith(opening));
  assert.notEqual(start, -1, `README.md has no bullet opening with "${opening}"`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith(BULLET_START) || line.trim() === '');
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join('\n');
}

function sentencesOf(text) {
  return text.replace(/\s+/g, ' ').split(SENTENCE_END);
}
```

(Bullet continuation lines in the README are indented two spaces, so they never start with `- `.)
The README's existing sentence `An operator who sets a low `timeout` reopens that path.` names
no `write_stdin`, so the sentence pin is RED today.

**gate.md**, codex residuals list: delete the bullet at lines 226-229 (`- Codex `write_stdin` into
a tty session is unguarded: ...` through `... takes any git typed into it.`). Leave the Copilot
`write_bash` bullet (lines 224-225) untouched (R5). Append to the end of the
`- Closed, no longer residuals: ...` bullet (it ends at line ~237,
`` ... `craft: write outside the working directory is denied in this binding`. ``), as further
lines of the same bullet, two-space indented, wrapped near 100 columns:

```
  Codex `write_stdin` into a tty session is closed too: `[features] unified_exec_tty = false` in
  the template and `-c features.unified_exec_tty=false` on the launch path make codex refuse
  `tty: true`, and a non-tty session's stdin is closed, so `write_stdin` fails (offline probe
  2026-10-18, 0.162.1). Closed only while that config holds: codex run outside the binding's
  launch path without the key is exposed again.
```

**codex-poc-record.md**, section `## Re-probe — codex-cli 0.162.1` (line 541): the table row
`| `write_stdin` and the hook (0.162.1) | **CONFIRMED (0.162.1), unguarded.** ...` (line 567) stays.
Insert these nine rows directly after it, before the `zsh equals expansion` row (cells escape `|`
as `\|`), exact:

```
| Feature flags (0.162.1) | **CONFIRMED (0.162.1).** Offline: fake Responses provider, one throwaway `HOME`/`CODEX_HOME` per case, dumping PreToolUse hook that allows, `mktemp` repos with no remote, benign `echo WS_MARKER > ws_marker.txt`; real `~/.codex` untouched (`find -newer` = 0). `codex features list`: `unified_exec`, `unified_exec_tty`, `shell_tool`, `write_stdin_approval` all `stable`, default `true`. Every bundled catalog slug (`gpt-5.5`, `gpt-5.6-sol/terra/luna`, `gpt-6-*`) has `shell_type: "shell_command"`; `gpt-5.4` / `gpt-5.4-mini` are not in it (fallback metadata). |
| `unified_exec` switch (0.162.1) | **CONFIRMED (0.162.1): not switchable.** `[features] unified_exec = false`, `codex features disable unified_exec` and `-c features.unified_exec=false` each write the key; `features list` still reports `true` and the tool list is unchanged. |
| `shell_tool` switch (0.162.1) | **CONFIRMED (0.162.1).** `[features] shell_tool = false` takes effect and removes the shell entirely. |
| Tool list with tty off (0.162.1) | **CONFIRMED (0.162.1).** Read off the request body. Default (`gpt-5.5`): `exec_command(cmd\|justification\|login\|max_output_tokens\|prefix_rule\|sandbox_permissions\|shell\|tty\|workdir\|yield_time_ms)`, `write_stdin(chars\|max_output_tokens\|session_id\|yield_time_ms)`, `request_user_input`, `apply_patch`, `view_image`, `get_goal`, `create_goal`, `update_goal`, `tool_search`, `web_search`. With `[features] unified_exec_tty = false`: identical minus `tty`; `write_stdin` stays listed. Same on `gpt-5.4` / `gpt-5.4-mini`. `gpt-5.6-sol` / `gpt-5.6-terra` send no `tools` key. |
| `write_stdin` into a tty shell, default config (0.162.1) | **CONFIRMED (0.162.1), unguarded.** `exec_command {cmd:"sh", tty:true}` then `write_stdin {session_id, chars:"echo WS_MARKER > ws_marker.txt\nexit\n"}`: marker written, no hook fired for `write_stdin` (`gpt-5.5`, `gpt-5.6-terra`, `gpt-5.6-sol`). |
| `write_stdin` into a non-tty session (0.162.1) | **CONFIRMED (0.162.1).** A live non-tty session (`exec_command {cmd:"sleep 2; sh"}`) then `write_stdin`: `write_stdin failed: stdin is closed for this session; rerun exec_command with tty=true to keep stdin open`; marker absent. Default config and tty off alike. |
| Forced `tty: true` with tty off (0.162.1) | **CONFIRMED (0.162.1).** `[features] unified_exec_tty = false` and a forced `exec_command {cmd:"sh", tty:true}`: output `TTY execution is disabled by config; omit tty or set it to false.` (codex quotes `tty` in backticks inside that message); marker absent (`gpt-5.5`, `gpt-5.6-terra`, `gpt-5.6-sol`). The hook still fired first (`Bash {"command":"sh"}`). |
| Launch flag `-c features.unified_exec_tty=false` (0.162.1) | **CONFIRMED (0.162.1).** `codex exec -c features.unified_exec_tty=false` with no config key: same refusal, `tty` absent from the schema. The flag also overrides a config `[features] unified_exec_tty = true`. |
| Hook payload with tty off (0.162.1) | **CONFIRMED (0.162.1).** Keys `session_id, turn_id, transcript_path, cwd, hook_event_name, model, permission_mode, tool_name, tool_input, tool_use_id`; `tool_name: "Bash"`, `tool_input: {"command": …}`. Identical to the committed codex hook fixture. |
```

ci.sh notes: `run_prose_lint` lints the touched adapters/codex/README.md (specs are exempt); fix
any finding in the new text, keeping the pinned phrases. test/living-corpus.test.js lists gate.md
and codex-poc-record.md as living-corpus files (existence and enumeration only).

### TDD steps

1. RED — append `describe('README.md - tty sessions off', ...)` to
   `adapters/codex/test/native-surface.test.js` with five rows:
   - `it('Given the Configure section of README.md, when scanned, then it states the template switches tty sessions off in a [features] table')`:
     `const sut = readConfigureSection();` `assert.match(sut, /`\[features\]`/);`
     `assert.match(sut, /unified_exec_tty = false/);`
     Expected failure: no `[features]` in §Configure today.
   - `it('Given the Configure section of README.md, when scanned, then it names the launch flag that forces tty sessions off')`:
     `assert.match(sut, /-c features\.unified_exec_tty=false/);`
     Expected failure: §Configure never names the flag.
   - `it('Given the Configure section of README.md, when scanned, then it says a second [features] header is invalid TOML')`:
     `assert.match(sut, /second `\[features\]` header/);` `assert.match(sut, /invalid TOML/);`
     Expected failure: no merge note today.
   - `it('Given the Guard section of README.md, when its sentences are read, then one says dropping the setting reopens the write_stdin channel')`:
     `const sut = sentencesOf(readGuardSection());`
     `const result = sut.some((sentence) => sentence.includes('write_stdin') && /reopens/.test(sentence));`
     `assert.ok(result, 'no Guard sentence names write_stdin and what reopens it');`
     Expected failure: `result` is false — the `write_stdin` sentences say it is unguarded, and the
     only `reopens` sentence is about `timeout`.
   - `it('Given the Still open bullet of README.md, when scanned, then it no longer lists write_stdin as open')`:
     `const sut = bulletOpening(readGuardSection(), STILL_OPEN_BULLET);`
     `assert.doesNotMatch(sut, /write_stdin/);`
     Expected failure: the bullet holds `through `write_stdin` is one of them`.
2. GREEN — apply both README edits from Context. `node --test adapters/codex/test/native-surface.test.js`
   passes (pre-validated 154/0).
   GUARD — the hygiene describes (`PROVENANCE_REF`, `SHELL_INJECTION_PATTERN`, the
   `${CLAUDE_PLUGIN_ROOT}` scan) and the existing honesty pins (`/fail open/i`, `/not measured/i`,
   `/--ephemeral/`, `/--dangerously-bypass-hook-trust/`) still pass: the edit keeps those phrases.
3. Docs — apply the gate.md and codex-poc-record.md edits from Context. No test (specs carry no
   pin); `bash scripts/ci.sh` covers doc lint and the living corpus.

### Gate

- `node --test adapters/codex/test/native-surface.test.js test/living-corpus.test.js`
- `bash scripts/ci.sh > <scratch>/ci.log 2>&1; echo "exit $?"` then grep the log for `not ok`/`ci:` lines — exit 0.

### Commit

`docs(codex): disclose the write_stdin channel as closed by tty-off`
