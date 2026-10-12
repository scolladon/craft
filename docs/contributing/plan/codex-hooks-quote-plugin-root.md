# Plan — codex-hooks-quote-plugin-root

> Source: design doc `docs/contributing/design/codex-hooks-quote-plugin-root.md` · ADRs `512, 513, 514, 515, 516`
> (512: both registrations spell the command `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js"`;
> 513: the template writes it as a TOML literal string; 514: the matcher accepts one double-quoted
> operand free of `"`, `\`, backtick and `$(`, and supersedes the two-token rule; 515: the
> interpreter and a bare operand must be literal words from `[\p{L}\p{N}._/+@%,:=-]`, except the
> exact raw shim operand; 516: the runtime test runs under `sh` and `bash`, from both root sources)
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

## Plan shape (2 parts)

| # | Part | Size class | Files edited | RED→GREEN cycles |
|---|---|---|---|---|
| 1 | The matcher trusts one inert double-quoted operand and refuses shell syntax outside quotes | src + suite | hook-trust.js, hook-trust.test.js (2) | 2 |
| 2 | Quote the plugin-root path in both registrations, pin it, and rewrite the prose | config + suites + prose | hooks.json, config.template.toml, config.test.js, hook-trust.test.js, adapters/codex/README.md (5) | 1 |

Order is load-bearing: Part 1 lands the matcher first, so no commit ever registers a command the
matcher refuses (`trust-hook` refusing the shipped command is the silent no-op this whole binding
guards against). Both parts edit `adapters/codex/test/hook-trust.test.js`; plan-lint reports that
as a cognitive-locality warning. They stay separate on purpose: Part 2's edits to that file (the
suffix test and the template pattern) are RED until the registration flip, and the flip may only
land after Part 1's matcher. Merging them would put both cycles and five files in one lifecycle
for no gain in locality.

Every edit below was applied to a throwaway `git clone` of the branch tip (`f69fc34`, engine
node_modules symlinked in) and checked there:

| Check | Before | Part 1 GUARDs | Part 1 RED 1 | Part 1 GREEN 1 | Part 1 RED 2 | Part 1 GREEN 2 | Part 2 RED | Part 2 GREEN + prose |
|---|---|---|---|---|---|---|---|---|
| `npm --prefix adapters/codex test` | 518 pass | 535 pass | 535 / 11 fail | 546 pass | 549 / 9 fail | 558 pass | 555 / 12 fail | 567 pass |
| `node --test test/craft-root-shim.test.js test/source-hygiene.test.js` | — | — | — | — | — | — | — | 180 pass |
| Stryker, narrowed (mutate hook-trust.js; tests hook-trust + trust-hook-main) | — | — | — | — | — | — | — | 289 mutants, 289 killed, score 100.00 |
| `node engine/bin/prose-lint.js --gate blocking -- adapters/codex/README.md adapters/codex/config.template.toml` | — | — | — | — | — | — | — | rc 0 |
| `bash scripts/ci.sh` | red (see below) | — | — | — | — | — | — | green once the root README counts were refreshed |

The counts are from the final throwaway state, replayed step by step against the branch-tip
matcher and registrations. They include the separator rule (below) and the array-command GUARD, and
they exclude the template-equality test the design does not ask for (see Part 2 Context).

**Known phase-gate red, not owned by either part.** `bash scripts/ci.sh` is red at the branch tip
before any part runs: `engine/test/readme-drift-main.test.js` ("Given no root argument, when main
runs, then it resolves DEFAULT_ROOT against the real repo root…") fails because the root
`README.md` L199-200 receipts lag the tree. Today `node engine/bin/readme-drift.js` prints
`docs/contributing/design/ claims 56, tree holds 57` and `docs/contributing/adr/ claims 511, tree
holds 516`. This plan's own commit adds a 56th plan against the claimed 55. Refreshing the three
counts (57 design docs, 56 parted plans, 516 ADRs) made `ci.sh` exit 0 in the throwaway. Who
refreshes them is decision candidate DC-P2. The part gates below are scoped so that neither part
is blocked by it.

## Public-surface decision

No new exported symbol. Everything the parts add to `adapters/codex/src/hook-trust.js`
(`GUARD_COMMAND_SHAPE`, `CONTROL_CHARACTER_PATTERN`, `DOUBLE_QUOTE_ACTIVE_FORMS`, `LITERAL_WORD_PATTERN`, `PLUGIN_ROOT_SHIM`,
`RAW_GUARD_OPERAND`, `parseGuardCommand`, `isInertQuotedOperand`, `isInertBareOperand`,
`isLiteralWord`, `isGuardInterpreter`) is module-local. The exported surface (`selectCraftHook`,
`planTrust`, `GUARD_SCRIPT_SEGMENTS`, `buildRequests`, `parseHooksList`, `describeListingEntry`,
`ACTION_WRITE`, `ACTION_NOOP`) keeps its signatures and its error messages. The test-file helpers
and constants are module-local to their suites. The registered command string is the binding's
operator-facing surface; ADR 512 fixes its shape and Part 2 pins it. No barrel, registry, README
count or generated report changes in either part.

## Decision candidates

The behaviour is settled by ADRs 512-516. Two plan-level choices remain open:

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-P1 | How the parse result tells the two operand rules apart | (a) the parse result carries the rule itself: `{ interpreter, operand, isInert }`, where `isInert` is `isInertQuotedOperand` or `isInertBareOperand`; (b) the design sketch: a `kind` string (`OPERAND_QUOTED = 'quoted'`, `OPERAND_BARE = 'bare'`) dispatched through a frozen map; (c) a boolean `isQuoted` property and a ternary at the call site | (a) | The narrowed Stryker run on (b) leaves two survivors: StringLiteral mutants on `'quoted'` (hook-trust.js:40:24) and `'bare'` (41:22). They are equivalent, because the strings are only ever compared with themselves, so no test can kill them, and design R10 asks for "no new survivor". (a) has no discriminant to mutate: 289/289 killed. (c) also kills, but it brings back a boolean flag the user's style rules refuse. (a) changes no name the design calls final except `OPERAND_QUOTED`, `OPERAND_BARE` and the map, which disappear. |
| DC-P2 | Who refreshes the root `README.md` L199-200 corpus counts that keep `ci.sh` red | (a) the documentation phase, in the same pass that already owns `docs/contributing/specs/codex-poc-record.md` and the BACKLOG tick; (b) a third, docs-only part in this plan; (c) the integrate phase, just before the PR | (a) | The counts drift with every design, ADR or plan commit, including documentation-phase commits. Fixing them before the last doc commit lands goes stale again. A part here would also step outside the code/test scope this plan was given. |

Plan-local corrections to the design's test strategy, each backed by the throwaway run:

- **Separators are a plain ASCII space; no control character anywhere.** The design sketch's
  `/^\s*(\S+)\s+(?:"([^"]*)"|(\S+))\s*$/` uses the JavaScript whitespace class, and that class
  disagrees with the shell. Proof at the branch tip: `selectCraftHook` trusts
  `"node\n<dir>/evil/adapters/codex/hooks/craft-guard.js"` and `"node\t/x/…"`. Under `sh -c`, the
  newline is a command separator: sh runs `node`, then runs the second line as its own command.
  Reproduced in a `mktemp` dir: `sh -c` on `node -e 0`, LF, `<dir>/evil/adapters/codex/hooks/craft-guard.js`
  (an executable that touches `MARK`) creates `MARK`. The separator rows fail against the
  branch-tip matcher (accepted). `[^"]*` would also let a newline through inside the quotes. The rule this
  plan implements is that only U+0020 separates and pads the words. Any `\p{Cc}` character (CR,
  LF, tab, the other C0 controls, DEL, C1) anywhere in the command, inside quotes included, refuses
  the hook. Unicode spaces such as U+00A0 are not separators. Tab is refused rather than allowed:
  it is a control character, no registration ever used it, and allowing it would need a carve-out
  in the control rule. The refusal is loud (`no craft hook found`). Pinned refusals: LF between
  the interpreter and the operand, CR in the same place, tab, NBSP, a trailing LF, and LF inside
  the quoted operand. The narrowed Stryker run then scores 289/289.

- The design's RED 1 lists the unbalanced `node "/x…tail` as a quoted decoy that is green at HEAD.
  It is not: HEAD splits it into two tokens whose second ends with the tail, so HEAD accepts it, and
  so does Part 1's GREEN 1 (the bare branch takes `"/opt/…`). It is a RED in Part 1's cycle 2.
- Only DC-P1 (a) leaves no survivor, and it also needs one extra GUARD: a hook whose `command` is an
  array holding the guard command string. With the `typeof command !== 'string'` guard mutated
  away, `RegExp#exec` coerces `['node …tail']` to `node …tail` and accepts it. At HEAD the old
  `.trim()` threw instead, so the mutant was killed for free.

## Part 1 — The matcher trusts one inert double-quoted operand and refuses shell syntax outside quotes

### Context

Files this part edits:

- `adapters/codex/src/hook-trust.js` (298 lines, pure, no I/O, ESM). What to touch:
  - L24-28: the comment above `GUARD_COMMAND_TAIL` (raw vs expanded echo). Keep it.
  - L30-35: the comment "The tail must be the OPERAND …". It ends "The command is therefore required
    to be exactly an interpreter plus the guard operand — anything chained, wrapped or flagged is
    refused rather than trusted." Rewrite it in REFACTOR (text below).
  - L36-39 constants: `GUARD_INTERPRETER = 'node'` (keep), `GUARD_COMMAND_TOKEN_COUNT = 2`
    (delete), `PATH_SEPARATOR = '/'` (keep), `WHITESPACE_PATTERN = /\s+/` (delete). Both deletions
    are dead once `isGuardHook` stops splitting, and the repo bans dead code.
  - L226-228 `toBasename(token)`: keep as is.
  - L230-241 `isGuardHook(hook)`: today it trims, splits on `WHITESPACE_PATTERN`, requires 2
    tokens, `toBasename(interpreter) === GUARD_INTERPRETER` and `operand.endsWith(GUARD_COMMAND_TAIL)`.
    It is replaced, see GREEN steps.
  - L251-259: the `selectCraftHook` JSDoc. Add one sentence in REFACTOR.
  - Unchanged: `selectCraftHook(hooks, { errors = [] } = {})` and its three throws (`no craft
    hook found — no registered command runs the craft guard as its operand`, the config-errors
    variant, `multiple craft hooks matched`), `assertNotRepositorySourced`, `planTrust`, and every
    export. `isPlainObject` (L117) is reused.
- `adapters/codex/test/hook-trust.test.js` (688 lines; `node:test` + `node:assert/strict`, ESM).
  Landmarks:
  - L21-23: `HOOKS_MANIFEST`, `REGISTERED_COMMAND` (read from hooks.json, still unquoted in this
    part), `GUARD_TAIL = '/adapters/codex/hooks/craft-guard.js'`.
  - L50-60 fixtures: `RAW_COMMAND = REGISTERED_COMMAND` (L53), `EXPANDED_COMMAND` (L54),
    `EXPANDED_INTERPRETER_COMMAND` (L57), `FOREIGN_INTERPRETER_COMMAND` (L58), `FOREIGN_COMMAND`
    (L59). Insert the new fixtures just before L58.
  - `craftHook(overrides)` (L61) builds a full `hooks/list` entry with `source: 'user'` and
    `command: RAW_COMMAND`.
  - L448-474: `describe('selectCraftHook() — decoy commands must not match')`. The `DECOYS` array
    of `[label, command]` sits at L454-459; the loop at L461-467 asserts
    `assert.throws(() => sut([craftHook({ command })]), /no craft hook/i)`; the project-source
    test is at L469.
  - L476: `describe('selectCraftHook()', …)`. Insert the two new describes just before it.
  - L503-506: the comment "Every other refusal here is already settled by the token count or by
    the operand's tail …". Reword it in REFACTOR.
  - L580-600: `describe('selectCraftHook() — the same command, differently spaced')`, with its
    `SPACINGS` array at L585-588.

Read-only references (do not edit):

- adapters/codex/src/trust-hook-main.js:93 `selectAndAnnounceHook` is the only consumer. It echoes
  `hook.command` and builds its on-disk check from `GUARD_SCRIPT_SEGMENTS`, not from the command.
- adapters/codex/test/trust-hook-main.test.js uses `GUARD_COMMAND = node /fixture/repo/adapters/codex/hooks/craft-guard.js`
  plus a `--dangerously-bypass-hook-trust` tampered variant. Both keep their verdicts (literal
  word accepted, trailing flag refused). That suite needs no edit.
- docs/contributing/design/codex-hooks-quote-plugin-root.md §Design "Part 1" and table P6 (the
  six reproduced refusals).

Pinned bytes and JS-source traps:

- Shim: `'${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}'`. Write it in a SINGLE-quoted string, never a
  template literal, which would try to interpolate it. Inside template literals, write a literal
  `${IFS}` as `\${IFS}`, a backtick as `` \` ``, and one backslash as `\\`.
- Allow-list regex (needs the `u` flag): `/^[\p{L}\p{N}._/+@%,:=-]+$/u`. Checked under node 22:
  `"/a/é9@+%,:=-_.x"` matches; `"a b"` and `"$x"` do not.
- Shape regex: `/^ *([^ ]+) +(?:"([^"]*)"|([^ ]+)) *$/` (literal U+0020, never `\s`), with
  `CONTROL_CHARACTER_PATTERN = /\p{Cc}/u` checked first over the whole command. JS `\s` also
  matches LF, CR, tab and NBSP. The shell ends a command at LF and does not split on NBSP, so a
  `\s`-based parse trusts commands the shell runs differently. The quoted alternative is tried first.
  When a quoted span is not the whole operand (`node "${SHIM}"/…`), the regex backtracks and the
  whole word is captured as bare. Do not retry a refused quoted capture through the bare rule.
- Test hygiene: titles and comments describe behaviour. Never cite probe ids, ADR, DC, phase or
  backlog numbers; a repo test scans test titles and comments for them.

### TDD steps

1. **GUARD — quoted and anchor decoys (all pass at HEAD).** Append these rows to `DECOYS` (L454-459),
   and add one test after the loop, before the project-source test:

   ```js
   ['a command is chained ahead of the guard', `/tmp/evil.sh && node /opt/craft${GUARD_TAIL}`],
   ['a flag follows the guard operand', `node /opt/craft${GUARD_TAIL} --flag`],
   ['a flag follows the quoted guard operand', `node "/opt/craft root${GUARD_TAIL}" --flag`],
   ['a command is chained after the quoted operand with no whitespace', `node "/opt/craft${GUARD_TAIL}";/tmp/evil.sh`],
   ['a command is chained after the quoted operand', `node "/opt/craft${GUARD_TAIL}" && /tmp/evil.sh`],
   ['a command is chained ahead of the quoted guard', `/tmp/evil.sh && node "/opt/craft${GUARD_TAIL}"`],
   ['a comment follows the quoted operand', `node "/opt/craft${GUARD_TAIL}" # comment`],
   ['a second quoted argument carries the tail', `node "/tmp/evil.js" "/opt/craft${GUARD_TAIL}"`],
   ['the quoted operand merely has the tail as a prefix of a longer name', `node "/opt/craft${GUARD_TAIL}.bak"`],
   ['the operand is single-quoted', `node '/opt/craft${GUARD_TAIL}'`],
   ['the quoted operand runs a command substitution', `node "$(/tmp/evil.sh)/opt/craft${GUARD_TAIL}"`],
   ['the quoted operand runs a backtick substitution', `node "\`/tmp/evil.sh\`/opt/craft${GUARD_TAIL}"`],
   ['the quoted operand carries a backslash escape', `node "/opt/cr\\aft${GUARD_TAIL}"`],
   ['the quoted operand carries an escaped double quote', `node "/opt/x\\"${GUARD_TAIL}"`],
   ['the quoted operand runs an arithmetic expansion', `node "$((1))/opt/craft${GUARD_TAIL}"`],
   ['the quoted operand carries a line break', `node "/opt/craft\n/tmp/evil${GUARD_TAIL}"`],
   ```

   ```js
   it('Given a hook whose command is an array holding the guard command, when selectCraftHook runs, then it does not match and it throws', () => {
     const sut = selectCraftHook;

     assert.throws(() => sut([craftHook({ command: [UNQUOTED_RAW_COMMAND] })]), /no craft hook/i);
   });
   ```

   Also add the fixtures (before L58), which this step and later steps use:

   ```js
   const PLUGIN_ROOT_SHIM = '${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}';
   const UNQUOTED_RAW_COMMAND = `node ${PLUGIN_ROOT_SHIM}${GUARD_TAIL}`;
   const QUOTED_RAW_COMMAND = `node "${PLUGIN_ROOT_SHIM}${GUARD_TAIL}"`;
   const SPACED_ROOT = '/fixture/craft root';
   const QUOTED_EXPANDED_COMMAND = `node "${SPACED_ROOT}${GUARD_TAIL}"`;
   const QUOTED_EXPANDED_INTERPRETER_COMMAND = `/fixture/home/.n/bin/node "${SPACED_ROOT}${GUARD_TAIL}"`;
   const QUOTED_HOME_COMMAND = `node "$HOME/craft${GUARD_TAIL}"`;
   ```

   Why they pass at HEAD: each command either splits into a token count other than 2, or its
   second token ends with `"`, `'`, `.sh` or `.bak` instead of the tail. The line-break row splits
   into 3 tokens. The array is not a string. Measured: 535 pass, 0 fail. These rows pin the refusals while the parse is rewritten.
   Each of the three active forms gets its own row (`$(`, backtick, backslash not next to a
   quote), so each element of `DOUBLE_QUOTE_ACTIVE_FORMS` is load-bearing. The two "chained
   ahead" rows are what make the `^` anchor load-bearing, and the two trailing-flag rows do the
   same for `$`. The line-break row is the only one that kills a mutant removing the
   control-character check, because every other control row is also refused by the shape or the
   allow-list.

2. **RED 1 — the quoted operand is trusted.** Add a new describe just before
   `describe('selectCraftHook() — the same command, differently spaced')`:

   ```js
   describe('selectCraftHook() — the guard operand wrapped in one pair of double quotes', () => {
     // Quoting the whole operand is what keeps a plugin root containing a space one
     // word under every shell, so each of these is a registration that runs the guard.
     const QUOTED_OPERANDS = [
       ['the raw unexpanded guard path in double quotes', QUOTED_RAW_COMMAND],
       ['the shell-expanded guard path under a root containing a space, in double quotes', QUOTED_EXPANDED_COMMAND],
       ['an absolute interpreter and the quoted guard path under a root containing a space', QUOTED_EXPANDED_INTERPRETER_COMMAND],
       ['a quoted guard path built on a variable the shell expands without splitting', QUOTED_HOME_COMMAND],
     ];

     for (const [label, command] of QUOTED_OPERANDS) {
       it(`Given a hook command carrying ${label}, when selectCraftHook runs, then it is the craft guard`, () => {
         const sut = selectCraftHook;
         const hook = craftHook({ command });

         const result = sut([hook]);

         assert.equal(result, hook);
       });
     }
   });
   ```

   Then append two rows to `SPACINGS` (spaces only, see the separator rule):

   ```js
   ['separated from its quoted operand by more than one space', `node  "${SPACED_ROOT}${GUARD_TAIL}"`],
   ['with a quoted operand, surrounded by leading and trailing whitespace', ` node "${SPACED_ROOT}${GUARD_TAIL}" `],
   ```

   In the same step, add the separator describe just before the quoted-operand describe:

   ```js
   describe('selectCraftHook() — only a plain space separates the words', () => {
     // The shell ends a command at a line break and does not split on Unicode spaces,
     // while a JavaScript whitespace class does both, so any separator but a plain
     // space would let the matcher read a command the shell runs differently.
     const SEPARATOR_REFUSALS = [
       ['a line feed separates the interpreter from the operand', `node\n/tmp/evil${GUARD_TAIL}`],
       ['a carriage return separates the interpreter from the operand', `node\r/tmp/evil${GUARD_TAIL}`],
       ['a tab separates the interpreter from the operand', `node\t/opt/craft${GUARD_TAIL}`],
       ['a no-break space separates the interpreter from the operand', `node\u00a0/opt/craft${GUARD_TAIL}`],
       ['a line feed follows the operand', `node /opt/craft${GUARD_TAIL}\n`],
     ];
     // refusal loop, same shape as DECOYS: assert.throws(() => sut([craftHook({ command })]), /no craft hook/i)
   });
   ```

   Expected failures (11 tests):
   - the 6 accept rows (4 quoted operands + 2 quoted spacings): `selectCraftHook: no craft hook
     found — no registered command runs the craft guard as its operand`. HEAD's operand token ends
     with `"`, or the space inside the quotes splits the command into 3 tokens.
   - the 5 separator refusals: `Missing expected exception.` HEAD trims and splits on `/\s+/`,
     which covers LF, CR, tab and NBSP, so each one reads as two tokens ending with the tail.

3. **GREEN 1 — shape parse plus the inert-quoted rule.** In `hook-trust.js`, replace L37 and L39
   and add the new constants:

   ```js
   const GUARD_INTERPRETER = 'node';
   const PATH_SEPARATOR = '/';
   const GUARD_COMMAND_SHAPE = /^ *([^ ]+) +(?:"([^"]*)"|([^ ]+)) *$/;
   const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;
   const DOUBLE_QUOTE_ACTIVE_FORMS = Object.freeze(['\\', '`', '$(']);
   ```

   Replace `isGuardHook` with these helpers (placed after `toBasename`):

   ```js
   function parseGuardCommand(command) {
     if (CONTROL_CHARACTER_PATTERN.test(command)) {
       return null;
     }
     const match = GUARD_COMMAND_SHAPE.exec(command);
     if (match === null) {
       return null;
     }
     const [, interpreter, quoted, bare] = match;
     return quoted === undefined
       ? { interpreter, operand: bare, isInert: isInertBareOperand }
       : { interpreter, operand: quoted, isInert: isInertQuotedOperand };
   }

   function isInertQuotedOperand(contents) {
     return !DOUBLE_QUOTE_ACTIVE_FORMS.some((form) => contents.includes(form));
   }

   function isInertBareOperand() {
     return true;
   }

   function isGuardHook(hook) {
     const command = isPlainObject(hook) ? hook.command : undefined;
     if (typeof command !== 'string') {
       return false;
     }
     const parsed = parseGuardCommand(command);
     if (parsed === null || !parsed.isInert(parsed.operand)) {
       return false;
     }
     return toBasename(parsed.interpreter) === GUARD_INTERPRETER && parsed.operand.endsWith(GUARD_COMMAND_TAIL);
   }
   ```

   This is DC-P1 (a). If the user picks (b), use the design sketch's `kind` plus the frozen map
   instead, and record the two equivalent survivors. In this step `isInertBareOperand` still
   accepts any bare word, which is today's verdict; step 5 narrows it. Measured: 546 pass, 0 fail.
   Every step 1 GUARD still holds. The line-break-in-quotes GUARD is the one that fails if the
   control check is left out.

4. **RED 2 — shell syntax outside quotes is refused.** Add a describe just before
   `describe('selectCraftHook()', …)`:

   ```js
   describe('selectCraftHook() — shell syntax outside quotes must not match', () => {
     // None of these needs whitespace, so a two-word shape alone lets each through,
     // and each makes the shell run something other than the guard: a substitution,
     // a second word split out of a variable or a glob, a chained command. Only a
     // literal interpreter and a literal (or the exact raw-shim) operand rule them out.
     const SHELL_SYNTAX_COMMANDS = [
       ['the operand runs a command substitution', `node $(touch\${IFS}MARK)${GUARD_TAIL}`],
       ['the operand runs a backtick substitution', `node \`touch\${IFS}MARK\`${GUARD_TAIL}`],
       ['the operand splits into a second script on a field separator', `node ./evil.js\${IFS}${GUARD_TAIL}`],
       ['the operand splits into a globbed script on a field separator', `node ./e*.js\${IFS}${GUARD_TAIL}`],
       ['the operand chains a second command with no whitespace', `node /nowhere;./evil${GUARD_TAIL}`],
       ['the interpreter runs a command substitution', `$(touch\${IFS}MARK)/node /opt/craft${GUARD_TAIL}`],
       ['the bare operand expands a variable other than the plugin-root shim', `node $HOME/craft${GUARD_TAIL}`],
       ['only the plugin-root shim is quoted', `node "${PLUGIN_ROOT_SHIM}"${GUARD_TAIL}`],
       ['the operand opens a double quote it never closes', `node "/opt/craft${GUARD_TAIL}`],
     ];

     for (const [label, command] of SHELL_SYNTAX_COMMANDS) {
       it(`Given a hook command where ${label}, when selectCraftHook runs, then it does not match and it throws`, () => {
         const sut = selectCraftHook;

         assert.throws(() => sut([craftHook({ command })]), /no craft hook/i);
       });
     }
   });
   ```

   Expected failure (9 tests): `Missing expected exception.` After GREEN 1 each command still
   parses as interpreter `node` (or a word whose basename is `node`) plus one bare word ending with
   the tail, and the bare rule accepts any word. The same 9 are also accepted at HEAD.

   In the same step add the GUARD describe right after it (all 3 rows pass at HEAD and after
   GREEN 1, since each is two tokens ending with the tail):

   ```js
   describe('selectCraftHook() — a literal path may carry any path character', () => {
     const LITERAL_PATH_COMMANDS = [
       ['the unquoted raw plugin-root shim', UNQUOTED_RAW_COMMAND],
       ['an operand using every literal path character', `node /opt/n@v+1%2,x:y=z-é_9.d${GUARD_TAIL}`],
       ['an interpreter using every literal path character', `/opt/n@v+1%2,x:y=z-é_9.d/node /opt/craft${GUARD_TAIL}`],
     ];
     // same accept loop shape as QUOTED_OPERANDS: sut = selectCraftHook; assert.equal(result, hook)
   });
   ```

   `UNQUOTED_RAW_COMMAND` is the shape every existing install registered. It is what makes the
   exact-shim branch of step 5 load-bearing, and Part 2 will stop `RAW_COMMAND` from covering it.
   The two all-characters rows keep every allow-list member load-bearing (`é` exercises `\p{L}`).
   Measured after this step: 549 pass, 9 fail.

5. **GREEN 2 — the literal-word rule.** Add the constants (after `DOUBLE_QUOTE_ACTIVE_FORMS`) and
   the helpers. Replace the any-word `isInertBareOperand`, and make `isGuardHook`'s last line
   delegate to the interpreter rule:

   ```js
   const LITERAL_WORD_PATTERN = /^[\p{L}\p{N}._/+@%,:=-]+$/u;
   const PLUGIN_ROOT_SHIM = '${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}';
   const RAW_GUARD_OPERAND = `${PLUGIN_ROOT_SHIM}${GUARD_COMMAND_TAIL}`;

   function isLiteralWord(word) {
     return LITERAL_WORD_PATTERN.test(word);
   }

   function isInertBareOperand(operand) {
     return operand === RAW_GUARD_OPERAND || isLiteralWord(operand);
   }

   function isGuardInterpreter(interpreter) {
     return isLiteralWord(interpreter) && toBasename(interpreter) === GUARD_INTERPRETER;
   }

   // isGuardHook, last line:
   return isGuardInterpreter(parsed.interpreter) && parsed.operand.endsWith(GUARD_COMMAND_TAIL);
   ```

   Measured: 558 pass, 0 fail.

6. **REFACTOR — comments only, no behaviour change.**
   - `hook-trust.js` L30-35: replace with a comment that keeps the containment rationale (the first
     four lines as they are) and then states the two spellings. Suggested text:

     ```js
     // The tail must be the OPERAND the interpreter executes, never merely a
     // substring of the command: a shell string can carry it in a comment, a
     // quoted argument or a flag value while executing something else entirely,
     // and every one of those passes a containment test. The command is therefore
     // required to be exactly an interpreter plus one guard operand — anything
     // chained, wrapped or flagged is refused rather than trusted.
     //
     // The operand has two spellings. In one pair of double quotes it may hold
     // spaces, and `$VAR`/`${…}` expand there without splitting, but the shell
     // still runs `$(…)` and backticks and re-reads backslash escapes inside
     // double quotes, so contents carrying any of them are refused. Bare, it is
     // the raw plugin-root shim plus the tail exactly, or a literal word: outside
     // quotes a substitution, a split variable, a glob or a `;` runs something
     // other than the guard with no whitespace needed, so only path characters
     // pass. The interpreter is held to the same literal-word rule.
     //
     // Only a plain space separates or pads the words, and a control character
     // anywhere refuses the command: the shell ends a command at a line break and
     // does not split on Unicode spaces, so a broader whitespace class would read
     // a command the shell runs differently.
     ```

   - `selectCraftHook` JSDoc (L251-254): append "The operand is bare or in one pair of double
     quotes; the shape rules above say which spellings of each are trusted."
   - `hook-trust.test.js` L503-506: "Every other refusal here is already settled by the token
     count or by the operand's tail" becomes "Every other refusal here is already settled by the
     command's shape or by the operand's tail". The rest of that comment stays.
   - Check: `grep -n "GUARD_COMMAND_TOKEN_COUNT\|WHITESPACE_PATTERN" adapters/codex/src/hook-trust.js`
     returns nothing. Every function stays ≤20 lines with nesting ≤2.

### Gate

```
npm --prefix adapters/codex test
```

Expected: 558 pass, 0 fail. Optional local check before committing (not a gate; validation runs
it): a narrowed Stryker run that mutates only adapters/codex/src/hook-trust.js, with tap testFiles
limited to adapters/codex/test/hook-trust.test.js and adapters/codex/test/trust-hook-main.test.js,
using a throwaway config file at the repo root (not committed) and run as
`engine/node_modules/.bin/stryker run <that-config>.json`. It should report no survivor.

### Commit

`fix(codex): trust a double-quoted guard operand and refuse shell syntax outside quotes`

## Part 2 — Quote the plugin-root path in both registrations, pin it, and rewrite the prose

### Context

Precondition: Part 1 is committed. The matcher accepts `node "<…>/adapters/codex/hooks/craft-guard.js"`,
and `hook-trust.test.js` already defines `UNQUOTED_RAW_COMMAND`, so the unquoted shape stays
covered once `RAW_COMMAND` turns quoted.

Files this part edits:

- `adapters/codex/hooks.json` L8. Today:
  `{ "type": "command", "command": "node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js" }`.
  Target (JSON-escaped):
  `{ "type": "command", "command": "node \"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js\"" }`.
  The description, event, `matcher: "*"`, `type`, layout and one-line object stay as they are.
- `adapters/codex/config.template.toml`:
  - L34 today: `command = "node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js"`.
    Target (TOML literal string):
    `command = 'node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js"'`.
  - L20-28: the comment block ("exactly two whitespace-separated tokens … Quoting the operand …
    make the trust helper refuse"; "substitute that absolute path here — unquoted, so the two-token
    form survives"). Rewrite it in step 3. L15-19 (why this block is mandatory) and the
    registration-table lines L29-33 stay byte-identical: `hook-trust.test.js` pins
    `[[hooks.PreToolUse]]`, `matcher = "*"`, `[[hooks.PreToolUse.hooks]]` and `type = "command"`,
    and that only the `type` line sits between the entry header and `command`.
- `adapters/codex/test/config.test.js` (71 lines, ESM). Imports today: `describe, it`, `assert`,
  `readFileSync`, `fileURLToPath`, `dirname, join`. It has `ADAPTER_DIR` (L7), `SHIM` (L10, the
  shim in single quotes), `readHooksJson()` and `readConfigTemplate()`. The L36 regex assertion
  stays. New code: see TDD step 1.
- `adapters/codex/test/hook-trust.test.js`:
  - L33 `TEMPLATE_COMMAND_PATTERN = /^\s*command\s*=\s*"(.*)"\s*$/gm` becomes
    `/^\s*command\s*=\s*'(.*)'\s*$/gm` (reads the literal string verbatim, no unescaping).
  - L393-398, the test "…when the guard segments are joined, then they are a suffix of it", is
    rewritten (step 1).
  - `RAW_COMMAND` (L53) keeps aliasing `REGISTERED_COMMAND`, so every `craftHook()` default turns
    quoted after GREEN. No other edit.
- `adapters/codex/README.md` L68-72: the paragraph "The registered `command` must stay exactly two
  whitespace-separated tokens … substitute that absolute path into the command unquoted." It sits
  inside the "Wiring the guard hook by hand" block (L61-66 above it, `## Configure` right after
  it). Rewrite it and add the migration paragraph in step 3.

Read-only references and constraints:

- adapters/codex/hooks/craft-guard.js reads the payload on stdin. On a blocking `exec_command`
  `git diff` it writes `craft-guard: …--no-ext-diff…` to stderr and exits 2. It resolves its root
  from `import.meta.url`, which node realpaths through the symlink, and it imports engine code from
  that real root. When the operand splits, node fails to load `<tmp>/craft` (exit 1,
  `Error: Cannot find module '<tmp>/craft'`). So exit 2 together with `--no-ext-diff` can only
  come from the guard itself. adapters/codex/test/craft-guard-hook.test.js shows the payload shape.
- test/hooks.test.js:224-308 is the model for the spaced-root helper (`mkdtemp`, `symlinkSync`
  to the repo root, `rmSync` in `finally`, a hand-built env).
- adapters/codex/test/native-surface.test.js scans README.md, config.template.toml and hooks.json
  for: `PROVENANCE_REF = /\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i` (so no "P2", "part 1",
  "ADR" in the prose); a bare `${CLAUDE_PLUGIN_ROOT}` outside the full shim; and
  ``SHELL_INJECTION_PATTERN = /!`[^`]*`/``. Keep the shim whole wherever it appears.
- test/craft-root-shim.test.js does not list `adapters/codex/*`. test/source-hygiene.test.js scans
  only the root README among READMEs, but keep the lowercase host name `github` out of the codex
  README anyway (repo convention).
- The design does not ask for a template-equality test in config.test.js:
  `hook-trust.test.js` L409 already pins `TEMPLATE_COMMANDS` deep-equal to `[REGISTERED_COMMAND]`.
  The runtime matrix reads the template command through a helper that throws unless exactly one
  literal-string command exists.

### TDD steps

1. **RED — pin the quoted spelling and run it from a spaced root.**
   - `config.test.js`: extend the imports to
     `import { spawnSync } from 'node:child_process';`,
     `import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';`,
     `import { tmpdir } from 'node:os';`, and
     `import { delimiter, dirname, join } from 'node:path';`. Add the constants and helpers:

     ```js
     const GUARD_COMMAND = `node "${SHIM}/adapters/codex/hooks/craft-guard.js"`;
     const TEMPLATE_COMMAND_PATTERN = /^\s*command\s*=\s*'(.*)'\s*$/gm;
     const REPO_ROOT = join(ADAPTER_DIR, '..', '..');
     const SPACED_ROOT_PREFIX = 'craft-codex-hook-root-';
     const SPACED_ROOT_NAME = 'craft root';
     const SHELLS = ['sh', 'bash'];
     const GUARD_DENIED_EXIT = 2;
     const BLOCKING_PAYLOAD = JSON.stringify({ cwd: '/repo', tool_name: 'exec_command', tool_input: { cmd: 'git diff' } });

     function registeredHooksJsonCommand() {
       return JSON.parse(readHooksJson()).hooks.PreToolUse[0].hooks[0].command;
     }

     function singleTemplateCommand() {
       const commands = [...readConfigTemplate().matchAll(TEMPLATE_COMMAND_PATTERN)].map(([, value]) => value);
       if (commands.length !== 1) {
         throw new Error(`config.template.toml registers ${commands.length} literal-string commands, expected exactly 1`);
       }
       return commands[0];
     }

     function withSpacedRoot(act) {
       const tmp = mkdtempSync(join(tmpdir(), SPACED_ROOT_PREFIX));
       try {
         const root = join(tmp, SPACED_ROOT_NAME);
         symlinkSync(REPO_ROOT, root);
         return act({ root, unrelated: tmp });
       } finally {
         rmSync(tmp, { recursive: true, force: true });
       }
     }

     // Built from scratch rather than inherited, so an ambient CRAFT_ROOT cannot stand
     // in for the root the case under test is meant to supply.
     function runRegisteredCommand(shell, command, rootEnv) {
       const path = [dirname(process.execPath), process.env.PATH].join(delimiter);
       return spawnSync(shell, ['-c', command], { input: BLOCKING_PAYLOAD, env: { PATH: path, ...rootEnv }, encoding: 'utf8' });
     }
     ```

     Then two describes at the end of the file:

     ```js
     describe('the registered guard command — exact spelling', () => {
       it('Given hooks.json, when its PreToolUse command is read, then it is node and the whole guard path in one pair of double quotes', () => {
         const sut = registeredHooksJsonCommand();

         assert.equal(sut, GUARD_COMMAND);
       });
     });

     describe('the registered guard command — run by a shell from a plugin root containing a space', () => {
       const ROOT_SOURCES = [
         ['CLAUDE_PLUGIN_ROOT names that root and CRAFT_ROOT is unset', ({ root }) => ({ CLAUDE_PLUGIN_ROOT: root })],
         ['CRAFT_ROOT names that root and CLAUDE_PLUGIN_ROOT names another', ({ root, unrelated }) => ({ CLAUDE_PLUGIN_ROOT: unrelated, CRAFT_ROOT: root })],
       ];
       const REGISTRATIONS = [
         ['hooks.json', registeredHooksJsonCommand],
         ['config.template.toml', singleTemplateCommand],
       ];

       for (const shell of SHELLS) {
         for (const [registration, readCommand] of REGISTRATIONS) {
           for (const [rootLabel, rootEnv] of ROOT_SOURCES) {
             it(`Given ${rootLabel}, when ${shell} -c runs the ${registration} command on a blocking payload, then the guard itself denies it`, () => {
               withSpacedRoot((roots) => {
                 const sut = runRegisteredCommand(shell, readCommand(), rootEnv(roots));

                 assert.equal(sut.status, GUARD_DENIED_EXIT, sut.stderr);
                 assert.match(sut.stderr, /--no-ext-diff/);
               });
             });
           }
         }
       }
     });
     ```

     The triple loop nests 3 deep inside the describe. If the nesting rule (≤2) is read strictly
     for test tables, build the matrix once with `SHELLS.flatMap(…)` into
     `[shell, registration, readCommand, rootLabel, rootEnv]` rows and loop once. The matrix stays
     8 cases.
   - `hook-trust.test.js`: switch `TEMPLATE_COMMAND_PATTERN` (L33) to the literal-string pattern,
     and rewrite L394-397:

     ```js
     it('Given the command hooks.json registers, when the guard segments are joined, then they close its quoted operand', () => {
       const sut = REGISTERED_COMMAND;

       assert.ok(sut.endsWith(`${GUARD_TAIL}"`), `hooks.json registers ${sut}, whose quoted operand does not end with ${GUARD_TAIL}`);
     });
     ```

   Expected failures (12), as measured (555 pass / 12 fail):
   - exact spelling (1): `assert.equal` actual `node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js`
     vs the quoted expected.
   - runtime, hooks.json × sh/bash × 2 root sources (4): status 1 instead of 2, stderr
     `Error: Cannot find module '<tmp>/craft-codex-hook-root-XXXX/craft'`. The unquoted operand
     splits at the space under both shells.
   - runtime, config.template.toml (4): `config.template.toml registers 0 literal-string commands,
     expected exactly 1`. Today's line is a basic string.
   - hook-trust suffix test (1): `hooks.json registers node ${CRAFT_ROOT:-…}/adapters/codex/hooks/craft-guard.js,
     whose quoted operand does not end with /adapters/codex/hooks/craft-guard.js`.
   - hook-trust L409 (1): `deepEqual` of `[]` vs `[REGISTERED_COMMAND]`; the new pattern finds no
     literal string.
   - hook-trust L415 (1): `TEMPLATE_COMMANDS[0]` is `undefined`, so `selectCraftHook` throws
     `no craft hook found`.

   GUARD in the same run: config.test.js L36 (`/adapters\/codex\/hooks\/craft-guard\.js/`) and the
   L39 shim test keep passing on both spellings.

2. **GREEN — flip both registrations.** Edit hooks.json L8 and config.template.toml L34 to the
   target bytes in Context. Measured: 567 pass, 0 fail (codex suite).

3. **REFACTOR — the prose that described the old rule.** No test drives this; the native-surface
   hygiene describes are the GUARDs (no provenance token, shim intact, no shell-injection form).
   - config.template.toml L20-28 becomes (suggested; keep the `# ` prefix and the ~88-column wrap):

     ```
     # The command is the interpreter, then the guard path as one double-quoted operand,
     # because that is the only form `bin/trust-hook.js` will trust. The quotes keep a
     # checkout path containing a space one word under every shell. Adding a flag, chaining a
     # second command, wrapping it in a shell, or putting a command substitution inside the
     # quotes all make the trust helper refuse the registration rather than trust it. The
     # value is a TOML literal string (single quotes), so the double quotes need no escaping.
     #
     # `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` is expanded by the shell codex runs hook commands
     # through. A hand-wired entry gets no `CLAUDE_PLUGIN_ROOT`, so either export
     # `CRAFT_ROOT=<repo checkout>` or substitute that absolute path here, inside the double
     # quotes.
     ```

   - README.md L68-72 is replaced by two paragraphs:

     ```
     The registered `command` is the interpreter, then the guard script as one double-quoted
     operand: `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js"`.
     The quotes keep a checkout path containing a space one word under every shell codex may
     run the hook through. `bin/trust-hook.js` refuses anything else, so an added flag, a
     chained command, a shell wrapper or a command substitution inside the quotes leaves the
     hook untrusted and therefore silent. A hand-wired entry gets no `CLAUDE_PLUGIN_ROOT`, so
     export `CRAFT_ROOT=<repo checkout>` or substitute that absolute path into the command,
     inside the double quotes.

     An install wired before the operand was quoted keeps its trusted, unquoted entry until you
     re-copy the template block; under a bash or sh login shell that entry loses the guard
     whenever the checkout path contains a space. After re-copying, codex reports the hook
     `modified`, and one `node adapters/codex/bin/trust-hook.js` run trusts it again.
     ```

   - Do not touch README L93-97 (`hooks/list` "needs an authenticated `CODEX_HOME`"). Rewording it
     is out of scope; the documentation phase records the newer-version row in the spec only.
   - Measured after this step: codex suite 567 pass; root shim + hygiene suites 180 pass; prose-lint
     (blocking posture) rc 0 on both prose files.

### Gate

```
npm --prefix adapters/codex test
node --test test/craft-root-shim.test.js test/source-hygiene.test.js
```

Expected: 567 pass / 0 fail, then 180 pass / 0 fail. `bash scripts/ci.sh` is the phase gate. It
stays red on the README corpus counts until DC-P2 is resolved, and nothing in this part changes
that.

### Commit

`fix(codex): quote the plugin-root path in the guard hook registration`
