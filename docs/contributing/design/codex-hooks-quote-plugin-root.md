# Design — codex binding: quote the guard hook's plugin-root path

> Brief: quote the whole plugin-root path in the codex guard registration
> (`adapters/codex/hooks.json`, `adapters/codex/config.template.toml`), the same form ADR-508 gave
> `hooks/hooks.json`. Widen `hook-trust.js`'s matcher so it also trusts exactly
> `node "<operand ending with /adapters/codex/hooks/craft-guard.js>"`, and still refuses flags,
> chains, wrappers, extra tokens and decoys. Existing installs re-run `trust-hook` once.
> Status: draft → self-reviewed ×3 → accepted

## Context

### What registers the guard today

| Surface | Line | Content today |
|---|---|---|
| `adapters/codex/hooks.json` | 8 | `node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js` |
| `adapters/codex/config.template.toml` | 34 | `command = "<same string>"` (TOML basic string) |
| `adapters/codex/config.template.toml` | 20-28 | comment: "exactly two whitespace-separated tokens … Quoting the operand … make the trust helper refuse"; "substitute that absolute path here — unquoted, so the two-token form survives" |
| `adapters/codex/README.md` | 68-72 | the same two-token/unquoted rule in prose |

`codex plugin add` drops the plugin manifest's `hooks` field (`codex-poc-record.md`, marketplace
section). The registration operators actually run is therefore the hand-merged template block in
`$CODEX_HOME/config.toml`. `hooks.json` is the canonical string that both tests and the template
are pinned to.

### The trust matcher

`adapters/codex/src/hook-trust.js`:

- L19-39 holds the constants `GUARD_SCRIPT_SEGMENTS` (exported), `GUARD_COMMAND_TAIL`,
  `GUARD_INTERPRETER = 'node'`, `GUARD_COMMAND_TOKEN_COUNT = 2`, `PATH_SEPARATOR` and
  `WHITESPACE_PATTERN = /\s+/`. The L30-35 comment says why containment is refused: the tail must
  be the operand the interpreter executes.
- `isGuardHook(hook)` (L230-241) trims the command, splits it on whitespace, requires exactly 2
  tokens and `toBasename(token0) === 'node'`, and requires `token1.endsWith(GUARD_COMMAND_TAIL)`.
- `selectCraftHook(hooks, { errors })` (L260, exported) filters with `isGuardHook`. It throws
  `no craft hook found — no registered command runs the craft guard as its operand` on zero
  matches, and also throws on several matches or a `project` source.
- The consumer is `adapters/codex/src/trust-hook-main.js:93` (`selectAndAnnounceHook`), which
  echoes `hook.command` through `toDisplayText`. The on-disk existence check is built from
  `GUARD_SCRIPT_SEGMENTS`, not from the command. No other code parses the command (grep over
  `adapters/codex/{src,bin}`).
- `planTrust` maps `modified → write`. ADR-317 decided that a `modified` hook re-trusts
  automatically, gated on the command still running the guard as its operand.

### Prior decisions this design follows

- **ADR-508**: hook commands double-quote the whole plugin-root path,
  `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/<path>"`. One shim spelling. Its consequence: "a runtime
  test executes each registered command from a plugin root containing a space"
  (`test/hooks.test.js:288-308`).
- **ADR-217**: the `CRAFT_ROOT` override must keep working.
- **ADR-317**: re-trust of a `modified` hook is gated on the command's identity.

### Settled before this design (proof + user decision; not re-opened)

On codex-cli 0.161.0, codex runs a PreToolUse hook `command` as `<login shell> -c <command>`. The
shell comes from `getpwuid_r` (`pw_shell`), and `$SHELL` is ignored. Under `bash`/`sh` the
unquoted template splits on a spaced root. `hooks/list` echoes a `config.toml` command raw, with
source `user`, and answers without `auth.json`. The current matcher refuses the quoted command.
**User decision:** quote the path, and widen the matcher to accept the quoted operand.

## Requirements

1. **R1**: `adapters/codex/hooks.json` registers exactly
   `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js"`. Description,
   event, matcher `*` and `type` stay as they are.
2. **R2**: `adapters/codex/config.template.toml` registers exactly one hook command, and its
   TOML-decoded value is byte-equal to R1's string (spelling per DC-1). The registration-table
   lines (`[[hooks.PreToolUse]]`, `matcher = "*"`, `[[hooks.PreToolUse.hooks]]`,
   `type = "command"`) stay as they are. The comment block no longer claims a two-token or
   unquoted rule. It says the operand is one double-quoted path, and that a hand-substituted
   absolute path goes inside the quotes.
3. **R3**: Under `sh -c` and `bash -c`, the registered command runs the craft guard from a root
   containing a space. This holds both when `CLAUDE_PLUGIN_ROOT` names that root and
   `CRAFT_ROOT` is unset, and when `CRAFT_ROOT` names it (CRAFT_ROOT wins). Given a blocking
   payload, the guard exits 2 with `--no-ext-diff` on stderr.
4. **R4**: `selectCraftHook` accepts the quoted shape:
   `<interpreter> "<contents>"`, where the basename of `<interpreter>` is `node` and `<contents>`
   ends with `/adapters/codex/hooks/craft-guard.js`. `<contents>` may contain spaces. Leading,
   trailing and repeated whitespace between the two tokens are tolerated, as they are today.
5. **R5**: `selectCraftHook` still accepts every shape it accepts today that DC-3 does not
   explicitly retire. At minimum it accepts the unquoted raw shim command (existing installs) and
   the unquoted expanded absolute-path command, including with an absolute interpreter (the
   0.145.0 observation).
6. **R6**: For the quoted shape, `selectCraftHook` refuses all of the following with the unchanged
   `no craft hook` error: any token after the closing quote (flag, `;`/`&&` chain, a second
   argument, a comment); a second quoted argument; a single-quoted operand; contents whose tail
   is a prefix of a longer name; and contents carrying the characters DC-2 forbids. Shapes that
   reach the bare branch (including unbalanced quotes) follow DC-3.
7. **R7**: The `hook-trust.js` comment that explains why containment is refused stays true: it
   names the two accepted operand spellings and the reason each refused one is refused.
8. **R8**: `adapters/codex/README.md:68-72` describes the quoted form. It carries a one-paragraph
   migration note: an existing install keeps its trusted unquoted entry until the operator
   re-copies the template block. After that, codex reports the hook `modified`, and one
   `node adapters/codex/bin/trust-hook.js` run re-trusts it. README and template prose carry no
   ADR or probe numbers (the `PROVENANCE_REF` hygiene test in `native-surface.test.js`), and no
   lowercase `github` (source hygiene).
9. **R9** (docs phase): `docs/contributing/specs/codex-poc-record.md` gains 0.161.0 rows for
   P1-P6 below. The 0.145.0 rows near L478-479 stay as written, as version-pinned observations.
   The "two version pins at once" scope paragraph (L51-53) is updated to name the third pin.
   `CHANGELOG.md` `[Unreleased] ### Fixed` gets one line saying the codex binding's guard hook
   runs from a checkout path containing a space. The BACKLOG entry at L180-185 is ticked.
10. **R10**: `bash scripts/ci.sh` is green, and so is `npm --prefix adapters/codex test`.
    Mutation testing on `adapters/codex/src/hook-trust.js` leaves no new survivor. `design-lint`
    passes on this doc.

## Design

### Pinned external behaviour

All probes ran in `mktemp` throwaways, never the worktree. Every codex probe used a fresh
`CODEX_HOME` with no `auth.json`. Afterwards, `find ~/.codex -newer <marker>` returned **0**.
Shells used: `/bin/sh` (bash 3.2 in sh mode), `/bin/bash` 3.2.57, `/bin/dash`, `/bin/zsh`
(macOS), and node v22.22.3.

**P1 — codex runs the hook through the login shell (settled, 0.161.0).** A probe command gave
argv `["a b", "<root>", "2"]`, ran a `;`-chained second command, and had parent `/bin/zsh -c …`.
The source is rust-v0.161.0 `codex-rs/core/src/session/mod.rs` `hook_shell_program` and
`codex-rs/shell-command/src/shell_detect.rs` `get_user_shell_path`. Live, setting `SHELL=/bin/bash`
or `/bin/sh` still ran `/bin/zsh`.

**P2 — the registered command under each shell, from a root containing a space.** The root is
`<tmp>/root parent/craft root`, a symlink to the worktree. The blocking payload is
`{"cwd":"/repo","tool_name":"exec_command","tool_input":{"cmd":"git diff"}}`, sent on stdin.

| Form | sh | bash | dash | zsh |
|---|---|---|---|---|
| unquoted `node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/…/craft-guard.js` | rc 1, `Cannot find module` | rc 1 | rc 1 | rc 2, guard denies |
| quoted `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/…/craft-guard.js"` | rc 2, guard denies | rc 2 | rc 2 | rc 2 |

Each cell is identical whether the root arrives via `CRAFT_ROOT` or via `CLAUDE_PLUGIN_ROOT`
alone. zsh does not word-split unquoted expansions, so macOS users on the default login shell were
never affected. bash/sh/dash login shells were. The rc 1 comes from node failing to load
`<root-head>`. What codex does with a hook that exits 1 was **not probed**.

**P3 — `hooks/list` echo and hash for the quoted command (0.161.0).**

| `config.toml` spelling | `command` echoed | `currentHash` |
|---|---|---|
| unquoted basic string `"node ${…}/…/craft-guard.js"` | raw, unquoted | `sha256:ecde982c…` |
| literal string `'node "${…}/…/craft-guard.js"'` | `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js"` | `sha256:38713365…` |
| basic string `"node \"${…}/…/craft-guard.js\""` | same as the literal row | `sha256:38713365…` (identical) |
| literal `'node "/opt/craft root/adapters/codex/hooks/craft-guard.js"'` | echoed raw, quotes and space kept | `sha256:7c201601…` |

Python `tomllib` decodes both quoted spellings to the same string. Every row reports source
`user`. No row needed `auth.json`.

**P4 — migration (0.161.0).** The steps: register the unquoted command, write
`[hooks.state."<key>"] trusted_hash = "<its hash>"`, and see `trustStatus: "trusted"`. Then
replace only the command with the quoted spelling and keep the old `trusted_hash`. The result is
`trustStatus: "modified"`, with the same `key` (`<CODEX_HOME>/config.toml:pre_tool_use:0:0`) and
the new hash. `planTrust` maps `modified → write`, so one `trust-hook` run re-trusts the hook.

**P5 — `hooks/list` without auth (0.161.0).** Every P3/P4 run answered `hooks/list` from a
`CODEX_HOME` holding no `auth.json`. This contradicts the 0.145.0 row "requires an authenticated
`CODEX_HOME`". Both rows stay, each pinned to its own version.

**P6 — today's matcher against candidate shapes.** This is `selectCraftHook` from the worktree
HEAD (`7aadd17`), called with `[{ command, source: 'user' }]`. The "sh runs" column comes from
running the command under `sh -c` in a throwaway cwd.

| Shape | Verdict today | What `sh -c` actually runs |
|---|---|---|
| `node ${SHIM}/…/craft-guard.js` (shipped today) | ACCEPT | guard (unspaced root) |
| `node "${SHIM}/…/craft-guard.js"` (target) | **REFUSE** | guard |
| `node "/opt/craft/…/craft-guard.js"` | REFUSE | guard |
| `node "/opt/craft root/…/craft-guard.js"` | REFUSE | guard |
| `node /opt/craft root/…/craft-guard.js` | REFUSE | node on `/opt/craft` |
| `node "${SHIM}"/…/craft-guard.js` (placeholder-only quotes) | ACCEPT | guard |
| `node $(touch${IFS}MARK1)/…/craft-guard.js` | **ACCEPT** | `touch MARK1` first (marker created) |
| ``node `touch${IFS}MARK2`/…/craft-guard.js`` | **ACCEPT** | `touch MARK2` first (marker created) |
| `node ./evil.js${IFS}/…/craft-guard.js` | **ACCEPT** | `node ./evil.js` with argv `[/…/craft-guard.js]` (sh and bash) |
| `node ./e*.js${IFS}/…/craft-guard.js` | **ACCEPT** | same, via glob |
| `node /nowhere;./evil/…/craft-guard.js` | **ACCEPT** | executes `./evil/…/craft-guard.js` (marker created) |
| `$(touch${IFS}SUBST_RAN)/node /opt/craft/…/craft-guard.js` | **ACCEPT** | `touch SUBST_RAN` first (marker created) |

The last six rows show that whitespace-free shell syntax gets past the two-token rule today. The
L30-35 claim "anything chained, wrapped or flagged is refused" is therefore false at HEAD for
chains and substitutions without whitespace. DC-2 keeps the new quoted path from inheriting this
gap. DC-3 decides whether this change closes it on the existing paths.

### Part 1 — the matcher (`adapters/codex/src/hook-trust.js`)

Replace token counting with an anchored shape parse. The command is one interpreter word, then
whitespace, then exactly one operand: either bare or wrapped in one pair of double quotes.

```
command      := ws* interpreter ws+ operand ws*
interpreter  := non-ws word                     basename === 'node'   (DC-3 may add: literal word)
operand      := '"' quoted '"' | bare
quoted       := chars except '"'                + DC-2 content rule
bare         := non-ws word                     (DC-3 may restrict)
accept iff   operandValue.endsWith(GUARD_COMMAND_TAIL)
```

Sketch (names are final; bodies are indicative):

```js
// The interpreter, whitespace, then one operand: a single double-quoted span
// (which may hold spaces) or a single bare word. Anything after it, a flag, a
// chain, a second argument, fails the anchor.
const GUARD_COMMAND_SHAPE = /^\s*(\S+)\s+(?:"([^"]*)"|(\S+))\s*$/;
const DOUBLE_QUOTE_ACTIVE_FORMS = Object.freeze(['\\', '`', '$(']);
const OPERAND_QUOTED = 'quoted';
const OPERAND_BARE = 'bare';

function parseGuardCommand(command) {
  const match = GUARD_COMMAND_SHAPE.exec(command);
  if (match === null) {
    return null;
  }
  const [, interpreter, quoted, bare] = match;
  return quoted === undefined
    ? { interpreter, operand: bare, kind: OPERAND_BARE }
    : { interpreter, operand: quoted, kind: OPERAND_QUOTED };
}

function isInertQuotedOperand(contents) {
  return !DOUBLE_QUOTE_ACTIVE_FORMS.some((form) => contents.includes(form));
}

function isGuardHook(hook) {
  const command = isPlainObject(hook) ? hook.command : undefined;
  if (typeof command !== 'string') {
    return false;
  }
  const parsed = parseGuardCommand(command);
  if (parsed === null || !isAcceptedOperand(parsed)) {
    return false;
  }
  return toBasename(parsed.interpreter) === GUARD_INTERPRETER && parsed.operand.endsWith(GUARD_COMMAND_TAIL);
}
```

- `isAcceptedOperand({ operand, kind })` dispatches on `kind` through a frozen
  `{ [OPERAND_QUOTED]: isInertQuotedOperand, [OPERAND_BARE]: <DC-3 rule> }` map. Under DC-3 (a),
  the bare rule is today's "any non-ws word". The discriminant is a string, not a boolean flag
  parameter.
- The alternation tries the quoted span first. When the quoted span is the whole operand and its
  contents fail the DC-2 rule, the hook is refused. `exec` returns the quoted capture, and the
  implementation must not retry the same text through the bare branch. When the quoted span does
  not end the command (`node "<x>"/…/craft-guard.js`), the regex itself backtracks: the whole
  token is read as a bare word, and DC-3 governs it. Under DC-3 (a),
  `node "$(touch${IFS}m)"/…/craft-guard.js` therefore stays accepted, as it is today (the P6
  rows 7-8 class). DC-2 alone does not close it.
- The bare alternative stays `\S+`, so it gives today's verdict on every whitespace-free operand.
  That includes two spellings today's matcher accepts. The first is placeholder-only quotes,
  `node "${SHIM}"/…/craft-guard.js`, which runs the guard (P6). The second is an unbalanced
  `node "/x/…/craft-guard.js`, which runs nothing: the shell rejects the syntax (probed: sh, bash
  and dash rc 2, zsh rc 1). Only DC-3 (b) retires them, because its allow-list excludes `"`.
- Removed: `GUARD_COMMAND_TOKEN_COUNT`, `WHITESPACE_PATTERN` (no longer used, no dead code).
  Kept: `GUARD_SCRIPT_SEGMENTS`, `GUARD_COMMAND_TAIL`, `GUARD_INTERPRETER`, `PATH_SEPARATOR`,
  `toBasename`.
- The `selectCraftHook` JSDoc and the L24-35 comments are rewritten to say: the operand is bare or
  in one pair of double quotes; inside double quotes the shell still expands `$(…)`, backticks and
  backslash escapes, so those are refused; outside them, see DC-3. The "raw or expanded"
  paragraph stays.
- Error messages and the `selectCraftHook` / `planTrust` contracts do not change. No signature
  changes.

### Part 2 — the registrations and their prose

- `adapters/codex/hooks.json:8` gets the R1 string. JSON escaping:
  `"command": "node \"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js\""`.
- `adapters/codex/config.template.toml:34` gets the R1 string, spelled per DC-1. Recommended:
  `command = 'node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js"'`.
  The L20-28 comment is rewritten. The command is the interpreter, then the guard path as one
  double-quoted operand: the only form `bin/trust-hook.js` will trust. A flag, a chained command,
  a wrapper shell, or command substitution inside the quotes makes it refuse. A hand-wired entry
  either exports `CRAFT_ROOT` or substitutes the absolute path **inside** the quotes.
- `adapters/codex/README.md:68-72` gets the same rule, plus the R8 migration paragraph. That
  paragraph goes in the "Wiring the guard hook by hand" block, next to the copy instruction.

### Part 3 — the runtime regression test (the ADR-508 consequence, for this binding)

A new `describe` block goes in `adapters/codex/test/config.test.js`, which already owns the
`hooks.json` and template content checks. It is built the same way as
`test/hooks.test.js:224-308`:

- `withSpacedRoot(act)` makes a `mkdtempSync(join(tmpdir(), 'craft-codex-hook-root-'))`, adds
  `'craft root'` as a symlink to the repo root (`join(ADAPTER_DIR, '..', '..')`), and calls
  `rmSync` in `finally`.
- `runRegisteredCommand(shell, command, rootEnv)` calls
  `spawnSync(shell, ['-c', command], { input: BLOCKING_PAYLOAD, env: { PATH: <dirname(process.execPath)>:<process.env.PATH>, ...rootEnv }, encoding: 'utf8' })`.
  The env is minimal on purpose, so an ambient `CRAFT_ROOT` cannot leak into the
  `CLAUDE_PLUGIN_ROOT` case.
- The matrix is shells × root source. The shells are DC-4. The root source is
  `{ CLAUDE_PLUGIN_ROOT: spaced }` or `{ CLAUDE_PLUGIN_ROOT: <unrelated tmp>, CRAFT_ROOT: spaced }`.
- Assertion: `status === 2` and `stderr` matches `/--no-ext-diff/`. Node failing to load the
  split path exits 1 (P2), so this pair can only pass if the guard itself ran.
- Commands under test: the `hooks.json` command and the decoded template command. The second is
  redundant while R2's equality test holds. It is listed so that if the equality pin ever breaks,
  the runtime test still names the file that broke.

### Part 4 — tests that pin the strings

- `hook-trust.test.js:393-398` (`…the guard segments are joined, then they are a suffix of it`)
  fails once the command is quoted. It becomes
  `assert.ok(sut.endsWith(`${GUARD_TAIL}"`))`. The same intent holds: a guard rename cannot leave
  the matcher green against an unregistered path.
- `hook-trust.test.js:33` `TEMPLATE_COMMAND_PATTERN` reads the DC-1 spelling (for DC-1 (a):
  `/^\s*command\s*=\s*'(.*)'\s*$/gm`). Without that change, `TEMPLATE_COMMANDS` is `[]` and the
  L409 equality test goes red. That is the right red.
- `config.test.js:36` keeps its regex and gains an exact-equality test against R1's string.
- `RAW_COMMAND` (L52) still aliases `REGISTERED_COMMAND`, so every `craftHook()` default fixture
  switches to the quoted shape. The unquoted raw shape becomes its own fixture
  (`UNQUOTED_RAW_COMMAND`), so R5 stays covered.
- `test/craft-root-shim.test.js` does not list `adapters/codex/*`, and the
  `native-surface.test.js` shim-confinement check strips the unchanged shim token. Both stay green
  untouched.

### Edge behaviour

- **Older codex that echoes the command expanded, with a spaced root.** If a codex version
  shell-expands the command and strips the quotes, the echo `node /a b/…/craft-guard.js` is
  refused, so `trust-hook` throws `no craft hook found`: loud, not silent. If the echo keeps the
  quotes, it is accepted. Neither variant was observed on a quoted command. 0.161.0 echoes raw
  (P3).
- **Contents with leading or trailing spaces inside the quotes** (`node " /x/…/craft-guard.js"`).
  These are accepted by the R4 rule: the value ends with the tail and contains no active form. At
  run time node resolves `" /x/…"` relative to the session cwd. This is the same class as the
  relative-operand line in Out of scope. It is not a new acceptance class.
- **`CRAFT_ROOT` empty.** Under POSIX `:-`, empty counts as unset. Quoting does not change this.
- **A root containing `"`, `$` or a backtick.** The root reaches the shell as an environment
  value, and inside double quotes an expanded value is not re-parsed. The sibling design pinned
  this for sh/dash (`backlog-sweep-hooks-quote-dev-tools.md`, Edge behaviour). This design adds
  no test for it.
- **Existing installs.** The unquoted entry stays trusted and keeps running until the operator
  re-copies the template block. The unquoted entry is still accepted by the matcher (R5), so a
  `trust-hook --check` on an untouched install still reports `trusted`, with exit 0.
- **A codex hook exiting 1** (the pre-fix failure on bash/sh): unprobed. This design asserts
  nothing about codex's fail-open or fail-closed handling of it.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | TOML spelling of the template's command | (a) literal string `command = 'node "${…}/…/craft-guard.js"'`; (b) basic string with escapes `command = "node \"${…}/…/craft-guard.js\""`; (c) multi-line literal `'''…'''` | (a) | P3: (a) and (b) decode to the same command and hash in codex 0.161.0 and in `tomllib`. With (a) the line reads exactly like `hooks.json`'s value with no escapes, so an operator copying it by hand cannot drop a backslash. The test regex reads the value verbatim. (b) forces the test to decode TOML escapes, which is a hand-rolled unescaper with no TOML parser in the dependency-free adapter. (c) adds a form no other line uses. |
| DC-2 | What the double-quoted operand may contain | (a) anything except `"`, `\`, backtick and `$(` (`$(` also covers `$((`); (b) anything except `"`; (c) only the exact shim followed by the tail, or a literal path with no `$` | (a) | Inside double quotes, the shell's only executing or re-parsing forms are command substitution (`$(…)`, backticks) and backslash escapes. `$VAR` and `${…}` expand without splitting or globbing (P2, quoted row). (a) therefore enforces "runs node on one path and nothing else", and still accepts the shim, absolute paths, spaced paths and `$HOME/…`. (b) trusts `node "$(evil)/…/craft-guard.js"`, which runs `evil` (same mechanism as P6 rows 7-8). (c) refuses `"$HOME/craft/…"`, a hand-wiring the README invites, for no safety gain over (a). |
| DC-3 | Close the P6 gaps on the paths that already exist (interpreter token and bare operand) | (a) leave them as they are, and file a backlog item carrying the P6 proof; (b) close them in this change: the interpreter must be a literal word (allow-list `[\p{L}\p{N}._/+@%,:=-]`), and the bare operand must be exactly `${SHIM}${TAIL}` or a literal word under the same allow-list; (c) close only the interpreter token | (b), flagged as scope you have to approve | The barrier is the same function this change rewrites, and the six red cases already exist as P6 rows. Doing it later means a second rewrite of `isGuardHook` and a second round of fixtures. Both shapes ever shipped or observed (raw shim, `/abs/.n/bin/node /abs/…`) pass (b). (b) refuses `node $HOME/…` (bare), the never-shipped placeholder-only spelling, and the unbalanced `node "/x…tail` (which runs nothing). Each refusal is loud (`no craft hook found`), never silent, and the fix is the quoted spelling. Honest bound: anyone who can write user `config.toml` can also write `trusted_hash` directly, so (b) makes the matcher's stated contract true. It does not add a new security boundary. (a) is the scoped default if you want this change limited to quoting. |
| DC-4 | Shells in the runtime regression test | (a) `sh` and `bash`; (b) `sh`, `bash`, plus `zsh` when installed (skipped when absent); (c) `sh` only | (a) | `sh` and `bash` exist on every CI image and dev box, and both split the unquoted form (P2), so each is a red test on its own. That makes bash a real case, not a duplicate: bash is the Linux codex login shell that broke. zsh never splits, so it passes both forms and catches nothing (P2), and a conditional skip is a test that sometimes says nothing. (c) misses bash on macOS, where `/bin/sh` is bash in sh mode. On Ubuntu CI it is dash, so the two shells differ there. |

Settled already, so not candidates: whether to quote (user decision), the quoted spelling
(ADR-508's whole-path form), and widening rather than replacing the matcher (user decision, R5).
Whether to retire the whitespace-free placeholder-only and unbalanced-quote spellings is part of
DC-3: (a) keeps both accepted, as they are today, and (b) refuses both.

## Test strategy

TDD (London school), RED → GREEN → refactor. Titles use Given/When/Then, bodies use AAA, and the
subject is named `sut`. The adapter is dependency-free: `node:test` and `node:assert/strict`.

- **RED 1 (matcher).** In `hook-trust.test.js`, add accept cases for the target shapes:
  `QUOTED_EXPANDED_COMMAND = node "/fixture/craft root${GUARD_TAIL}"`,
  `QUOTED_EXPANDED_INTERPRETER_COMMAND = /fixture/home/.n/bin/node "/fixture/craft root${GUARD_TAIL}"`,
  and the quoted shim. Extend the `SPACINGS` table (L578-596) with quoted rows. Extend the `DECOYS`
  table (L450-460) with quoted rows: `"…tail" --flag`, `"…tail";evil`, `"…tail" && evil`,
  `"…tail" # c`, `"/tmp/evil.js" "/x…tail"`, `"/x…tail.bak"`, unbalanced `"/x…tail`, single-quoted
  `'/x…tail'`, and the DC-2 rows `"$(evil)…tail"`, `` "`evil`…tail" ``, `"/x\"…tail"`,
  `"$((1))…tail"`. The accept cases are red against HEAD. Every quoted refusal row is green at
  HEAD (today its operand ends with `"`), and it pins behaviour while the parse is rewritten.
  GREEN: Part 1.
- **RED 2 (DC-3 (b) only).** P6 rows 7-12 become decoy rows (`$(…)`/backtick/`${IFS}`/glob/`;`
  in the bare operand, and substitution in the interpreter). Add refusal rows for
  `node $HOME/…tail`, the placeholder-only `node "${SHIM}"/…tail`, and the unbalanced
  `node "/x…tail`. All of them are red against HEAD. GREEN: the allow-list predicates. Under
  DC-3 (a), the placeholder-only row is instead added as an **accept** row that pins today's
  verdict.
- **RED 3 (strings).** The R1 exact-equality test in `config.test.js`, and the
  `hook-trust.test.js` L393 suffix test rewritten to `${GUARD_TAIL}"`, go red against HEAD.
  `TEMPLATE_COMMAND_PATTERN` is switched to DC-1's spelling. GREEN: edit `hooks.json` and the
  template.
- **RED 4 (runtime, R3).** The Part 3 matrix (DC-4 shells × 2 root sources) is red against
  today's `hooks.json` (rc 1, P2) and green after RED 3's edit. Write it before RED 3's GREEN so
  that it is observed red.
- **Property lens (matcher touched).** Every row in the in-suite table is a deterministic
  `selectCraftHook` case. No shell is spawned per case, so the suite stays fast. At review cycle 1,
  run a **throwaway differential fuzz** in a `mktemp` dir (not committed). Generate commands from
  the alphabet `node`, the tail, a space, `" ' \ $ ( ) { } ; & | < > * ? [ ] # ~ \``, `${IFS}` and
  the shim, up to length N. The oracle is `sh -c` and `bash -c` with a PATH-injected fake `node`
  that records argv, plus a cwd marker for side effects. The property: every command the matcher
  ACCEPTS runs only the fake node, with exactly one argument that ends with the tail, and creates
  no marker. A counterexample becomes a decoy row.
- **Mutation.** `adapters/codex/src/hook-trust.js` is in `engine/stryker.conf.json` scope. Run it
  per file, with the narrowed corpus (its own suites: `hook-trust.test.js`,
  `trust-hook-main.test.js`). Hand-verify any survivor against the full covering set before
  writing a test.
- **No provenance in code.** Test titles, fixture names and comments describe the behaviour, for
  example "a bare operand that chains a second command with no whitespace". They never cite this
  doc's probe IDs (P1-P6), ADR numbers or DC numbers.
- **Gate.** `npm --prefix adapters/codex test`, then `bash scripts/ci.sh`. Coverage stays at or
  above 80%.
- **Manual proof of done, recorded in the PR.** Re-run P3 and P4 against the shipped template
  block in a throwaway `CODEX_HOME`: `hooks/list` echoes R1's string, and `trust-hook` against
  that home matches it and writes the hash (`untrusted → trusted`, and `modified → trusted` from
  an unquoted trusted start).

## Out of scope

- `adapters/cursor/hooks.json:6`, `adapters/cursor/config.template.json:8` and
  `adapters/antigravity/plugins/craft/hooks.json:6` carry an unquoted `node ${CRAFT_ROOT}/…`.
  Each tool's runner shell is unpinned. To prove it: a P1-style argv probe per tool from a spaced
  `CRAFT_ROOT`.
- The relative-operand acceptance (`node ./adapters/codex/hooks/craft-guard.js` ends with the tail
  at `hook-trust.js:240`, so it is accepted and resolves against the session cwd). Not probed
  here. To prove it: register it in a throwaway `CODEX_HOME` and show that `hooks/list` plus
  `selectCraftHook` accept it, and that codex runs the cwd copy.
- `adapters/codex/README.md:93-97` says `hooks/list` "needs an authenticated `CODEX_HOME`". That is
  true on 0.145.0 and false on 0.161.0 (P5). Rewording the operator instruction is a separate
  docs change; this design only records the 0.161.0 row (R9).
- What codex does when a PreToolUse hook exits 1 (fail-open or fail-closed). Not needed for the
  fix; proving it needs a live model turn.
- Re-probing the 0.145.0 "expanded" `hooks/list` observation. That version is not installed here,
  and the matcher keeps accepting the shape anyway (R5).
