# Plan — codex-trust-matcher-differential-fuzz

> Source: design doc `docs/contributing/design/codex-trust-matcher-differential-fuzz.md` · ADRs `523, 524, 525, 526, 527, 528, 529, 530`
> (every decision takes the design's recommendation: DC-1 (a) `CAP = 2000`, `SEED = 1` (523);
> DC-2 (a) async spawn pool of 8 (524); DC-3 (b), ratified by the user: per-leg skip with a
> reason AND `zsh` in the shared dev-tool set (525); DC-4 (a) grammar plus seed mutation, 50/50
> (526); DC-5 (c) the full oracle: argv, exit, stdout, stderr, marker, no `NODE_*` (527); DC-6 (a)
> a real differential stops the part with no commit (528); DC-7 (a) unspaced plugin root, spaced
> `HOME` (529); DC-8 (a) seed and cap are constants only (530))
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

| # | Part | Size class | src delta | Files | Gate |
|---|---|---|---|---|---|
| 1 | Commit the seeded differential fuzz for the codex trust matcher | test-infra | none | 1 new test file | `npm --prefix adapters/codex test` |
| 2 | Install zsh with the shared dev tools | src-suite | `scripts/install-dev-tools.sh` (+1 word) | the script, its suite | `node --test test/install-dev-tools.test.js` + `shellcheck scripts/install-dev-tools.sh` |

Part 1's deliverable IS a test file (a property/differential harness, no `src/` delta), so it
is a legitimate standalone test-infra part, not test padding. Its capability proof is the
teeth matrix (11 one-rule reverts of the matcher, run in a `mktemp` scratch copy) plus the
three in-file self-checks. Part 2 is independent of Part 1 (either order works); it is
sequenced second so Part 1's fuzz is green before CI is asked to run its zsh leg.

The BACKLOG tick (design R12, §Design Part 3) is NOT a part here: the documentation phase's
backlog-ticker owns it. Hand it the numbers Part 1 records (trusted count, shell runs, teeth
table, wall time).

## Public-surface decision

No new exported symbol. Every helper and constant in
`adapters/codex/test/hook-trust-differential.test.js` (`mulberry32`, `buildCorpus`,
`renderCommand`, `isTrusted`, `withStubTree`, `findOnPath`, `skipReasonFor`, `runPool`,
`runLeg`, `judge`, `parseInvocations`, the fragment tables) is module-private to the test file.
`adapters/codex/src/hook-trust.js` is imported read-only (`selectCraftHook`,
`GUARD_SCRIPT_SEGMENTS`, both already exported) and is not edited. Part 2 adds a package to an
existing array. No barrel, facade, registry, generated API report or README surface is touched,
so no surface gate applies.

## Decision candidates

One residual choice the design did not cover:

| # | Choice | Alternatives | Recommendation | Why |
|---|---|---|---|---|
| DC-P1 | CONTRIBUTING.md:13 lists the local prerequisites as "Node 22, `jq` and `shellcheck`". Part 2 adds `zsh` to the shared install script. Should the prose name zsh? | (a) leave it: zsh stays optional locally; a missing zsh shows up as a named `# SKIP` line, and CI and the devcontainer install it; (b) the documentation phase adds "zsh (optional: without it the trust-matcher fuzz skips its zsh leg)"; (c) list zsh as required | (a) | ADR-525 makes the skip the local fallback, so (c) contradicts it. The skip reason already explains itself in the TAP output. (b) is cheap if the documentation phase wants it, but no gate needs it. |

Details the design left open are fixed here, not by a decision:

- `SPAWN_TIMEOUT_MS = 5_000`. A stub run measures 1.5-14 ms. 5 s ends a hang without
  flaking a loaded CI runner.
- Each corpus entry is `{ segments, rootEnvKind }`. The root-env kind is drawn at generation
  time, not at run time, so all four legs judge the same `(command, env)` pairs and R2's
  determinism covers the env draw too.
- The failure record's `index` is the CORPUS index: fixed cases are 0-12, generated commands
  start at 13. The design's K table used the generated index. The teeth table in the PR uses
  the corpus index and says so.

## Validation-phase notes

- Stryker: the new file is NOT added to `engine/stryker.conf.json` (design Out of scope). The
  K-matrix in Part 1 is this test's mutation proof.
- CI proof of the zsh leg exists only after push. In the PR's CI log, the codex suite's TAP
  must show `# skipped 0` (run_suite echoes the captured output). A `# SKIP zsh is not on
  PATH` line there means Part 2 did not take effect. If the CI zsh leg instead fails with zero
  invocations on every case, read the runner's system zshenv first (Context trap 3); it is
  environment, not a matcher differential.
- Expected codex suite on this box after Part 1: 616 tests (609 + 7), 0 fail, 0 skipped,
  wall ≤ 1.5 s.

## Part 1 — Commit the seeded differential fuzz for the codex trust matcher

### Context

Create exactly one file: `adapters/codex/test/hook-trust-differential.test.js`. No edit to
anything under adapters/codex/src or adapters/codex/hooks (R1, brief's hard line).

**Read first, in place (read-only):** the design doc docs/contributing/design/codex-trust-matcher-differential-fuzz.md,
§Design "Part 1 — the differential test". It holds, ready to copy: the throwaway tree layout,
the stub bodies, the spawn env, the three root envs, the oracle order, the 13-row fixed-case
table, the generator rules, the interpreter table and the fragment tables (`SAFE`,
`UNSAFE_CLASSES`, `PREFIX`, `LEAD`, `SEP`, `TRAIL` — copy them verbatim; you may extend them,
never shrink them), the test layout and the edge-behaviour table. Do not re-derive any of it.

**Subject under test (read-only), adapters/codex/src/hook-trust.js, no imports of its own:**

- `export function selectCraftHook(hooks, { errors = [] } = {})` at L332. Returns the single
  matching hook or throws. Refusal message matches `/no craft hook found/` (`assertSingleMatch`,
  L247). A `source: 'project'` hook throws a DIFFERENT error after matching, so the fixture hook
  is `{ command, source: 'user', sourcePath: FIXTURE_SOURCE_PATH }` with
  `FIXTURE_SOURCE_PATH = '/fixture/codex-home/config.toml'` (the same value hook-trust.test.js
  uses at L75).
- `export const GUARD_SCRIPT_SEGMENTS` (L22) → `TAIL = '/' + GUARD_SCRIPT_SEGMENTS.join('/')`.
- The rules the teeth matrix reverts (exact current text):
  - L65 `const GUARD_COMMAND_SHAPE = /^ *([^ ]+) +(?:"([^"]*)"|([^ ]+)) *$/;`
  - L66 `const LITERAL_WORD_PATTERN = /^[\p{L}\p{N}._/+@%,:=-]+$/u;`
  - L67 `const QUOTED_LITERAL_PATTERN = /^[\p{L}\p{N}._/+@%,:= -]*$/u;`
  - L276 `isInertQuotedOperand`: `return contents.split(PLUGIN_ROOT_SHIM).every((segment) => QUOTED_LITERAL_PATTERN.test(segment));`
  - L280 `isInertBareOperand`: `return operand === RAW_GUARD_OPERAND || isLiteralWord(operand);`
  - L284 `isRootedPath`: `return ROOTED_PATH_PREFIXES.some((prefix) => operand.startsWith(prefix));`
  - L292 `isGuardInterpreter`: opens with `if (!isLiteralWord(interpreter)) { return false; }`,
    then `interpreter === GUARD_INTERPRETER || (interpreter.startsWith(PATH_SEPARATOR) && toBasename(interpreter) === GUARD_INTERPRETER)`.
- `PLUGIN_ROOT_SHIM` is NOT exported. Define `SHIM = '${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}'`
  in the test, as hook-trust.test.js does at L58 (`PLUGIN_ROOT_SHIM`).

**Style and helpers to mirror (read-only):**

- adapters/codex/test/hook-trust.test.js L1-23: ESM imports, `ADAPTER_DIR` from
  `fileURLToPath(import.meta.url)`, and the registered command read from adapters/codex/hooks.json
  as `HOOKS_MANIFEST.hooks.PreToolUse[0].hooks[0].command` — never retype it. Given/When/Then
  titles, AAA bodies, `sut`, named constants. Its `DECOYS` (L461-503) and `NON_WORD_COMMANDS`
  (L709-719) tables are where a DC-6 counterexample row would go.
- adapters/codex/test/config.test.js L95-111: `withSpacedRoot(act)` (`mkdtempSync` +
  try-finally + `rmSync(tmp, { recursive: true, force: true })`) and an env built from scratch.
  Model `withStubTree(act)` on it.
- Imports: `describe`, `it` from `node:test`; `assert` from `node:assert/strict`; `spawn` from
  `node:child_process`; `accessSync`, `constants`, `existsSync`, `mkdirSync`, `mkdtempSync`,
  `readFileSync`, `rmSync`, `writeFileSync` from `node:fs`; `tmpdir` from `node:os`; `join`,
  `delimiter`, `dirname` from `node:path`; `fileURLToPath` from `node:url`. No new dependency.
- No existing test uses `{ skip }`; this file introduces it (`it(title, { skip: reason }, fn)`).
  Node v22.22.3 renders it in TAP as `ok N - <title> # SKIP <reason>` plus `# skipped 1`, exit 0.

**Constants (named, frozen tables, no magic values):** `SEED = 1`, `CAP = 2000`,
`POOL_SIZE = 8`, `SPAWN_TIMEOUT_MS = 5_000`, `SHELLS = ['sh', 'bash', 'dash', 'zsh']`,
`ACCEPTED_FLOOR` (set in step 2c from the measured count, with a one-line why comment),
`FIXTURE_SOURCE_PATH`, `TREE_PREFIX = 'craft-trust-fuzz-'`, the stub file names, the
NUL field separator, the `NODE_*` pattern `/\bNODE_\w*=/`, the refusal pattern
`/no craft hook found/`, the skip-reason template `<shell> is not on PATH, so its leg did not run`.

**Placeholders:** `BIN` and `ROOT` are frozen marker objects (for example
`Object.freeze({ placeholder: 'BIN' })`), so `JSON.stringify` of a corpus is stable and
machine-free (R2). `renderCommand(segments, tree)` maps `BIN` to `<tree>/bin` and `ROOT` to
`<tree>/craft-root`, concatenating strings as-is.

**Stub tree (`withStubTree(act)`, one per leg and one per path-rendering self-check):**
`mkdtempSync(join(tmpdir(), TREE_PREFIX))`, then the stubs bin/node and bin/mark written with
mode 0o755, and the dirs "home dir" (spaced HOME), craft-root (the unspaced «ROOT»), other
(the CLAUDE_PLUGIN_ROOT that CRAFT_ROOT must win over) and runs. Exact stub bodies:

```sh
#!/bin/sh
printf '%s\0' "$#" "$@" >> argv.log
export -p >> env.log
```

```sh
#!/bin/sh
: > marker
```

Each run gets a fresh cwd runs/<n> (mkdirSync per run); the stubs write relative to it, so a
command that changed directory leaves no argv.log there and fails (fail-closed). Env per spawn, nothing inherited:
`{ PATH: <tree>/bin, HOME: <tree>/home dir, ...rootEnv }`, with `rootEnv` one of
`{}`, `{ CLAUDE_PLUGIN_ROOT: <root> }`, `{ CRAFT_ROOT: <root>, CLAUDE_PLUGIN_ROOT: <other> }`.

**Oracle (`judge(run)` → `null` or a failure record), in this order:** status 0 and no signal;
stdout `''` and stderr `''`; `argv.log` parses (NUL-split, `count, arg1…argN` repeated) to
exactly one invocation with exactly one argument that starts with `/` and ends with `TAIL`
(missing file = zero invocations = fail); no `marker` file in the run cwd; `env.log` absent or
has no match for `/\bNODE_\w*=/`. Failure record (R10): `{ index, shell, command:
JSON.stringify(command), rootEnvKeys, status, signal, stdout, stderr, invocations, marker,
nodeEnv }`. The leg asserts `assert.deepEqual(failures, [])` so every record shows in the diff.

**Traps the prototype hit (each yields a FALSE differential, not a matcher bug):**

1. Never mutate the interpreter: it is drawn from the fixed interpreter table only. A mutated
   absolute path such as `/va/folders/…/node` is trusted (correctly) but exits 127.
2. The composed `«BIN»/<f>/node` interpreters use every `UNSAFE` member EXCEPT `=mark`:
   `<bin>/=mark/node` is a literal, non-existent path (48 false failures over 100 000 at HEAD).
   R6 is the in-file guard for this.
3. A system zshenv rewriting `PATH` shows as zero invocations on every zsh case, including the
   registered command. That is environment, not matcher.

**DC-6 stop condition (ADR-528).** At HEAD the prototype measured 0 differentials over
100 000 commands, so this is contingency. If a leg is red at HEAD:

1. Triage first. It is a TEST bug (fix the test, carry on) when: R6 is red; the failing
   interpreter renders to a path that does not exist (exit 127, `not found`); the registered
   command (index 0) or another trusted fixed case fails too; or every case on one shell fails
   (environment).
2. Reproduce by hand in a `mktemp` stub tree: `<shell> -c '<command>'` with the record's env.
   If the shell runs anything other than the stub once on one rooted guard path, it is a REAL
   differential.
3. Real differential → STOP. No commit (red gate). Do not edit adapters/codex/src/hook-trust.js,
   do not exclude the case. Hand back a blocker `{ unit: Part 1, reason: <counterexample>,
   options: (a) matcher fix under its own ADR, (b) ratified residual + named exclusion }`
   carrying seed, corpus index, shell, JSON-escaped command, root-env keys and the observed
   record, plus a proposed red row for hook-trust.test.js `DECOYS` or `NON_WORD_COMMANDS` as a
   diff in the handback text. Leave the new test file uncommitted in the worktree for the
   respawn.

### TDD steps

The deliverable is a test, so RED means "the new test fails against the test-infra as it stands
at that step", and the capability proof is the scratch teeth matrix after GREEN. No step edits
adapters/codex/src. Write every helper ≤20 lines, nesting ≤2, no comment that says what.

1. **RED — determinism (R2).** Add the `describe('selectCraftHook() — every command it trusts
   runs only the guard, under each shell', …)` block and its first test, `Given the fixed seed,
   when the corpus is generated twice, then both corpora are identical`: `sut = buildCorpus(SEED,
   CAP)` twice, `assert.equal(JSON.stringify(first), JSON.stringify(second))`. Expected failure:
   `ReferenceError: buildCorpus is not defined` (keep all corpus calls inside test bodies, so the
   file still loads).
   Run: `node --test adapters/codex/test/hook-trust-differential.test.js > <tmp>/p1.tap 2>&1; grep -n 'not ok\|Error' <tmp>/p1.tap`.

2. **GREEN — PRNG, segments, fixed cases, minimal corpus.** Add `mulberry32(seed)` (about 6
   lines), the `BIN`/`ROOT` placeholders, `SHIM`, `TAIL`, `REGISTERED_COMMAND` (from hooks.json, one
   literal segment), the 13 `FIXED_CASES` from the design table (with the `mark` payloads as
   written there), and `buildCorpus(seed, cap)` returning the fixed cases only, each with a
   PRNG-drawn `rootEnvKind` (`cap` is not used yet). Each entry is frozen
   `{ segments, rootEnvKind }`. The determinism test is green.

   2a. **RED — floor (R5).** Add `Given the seeded corpus, when the matcher filters it, then at
   least ACCEPTED_FLOOR commands are trusted` with provisional `ACCEPTED_FLOOR = 60`: inside
   `withStubTree`, render every entry, count `isTrusted`. Expected failure, first:
   `ReferenceError: withStubTree is not defined`. Add `async withStubTree(act)` (tree + stubs as in
   Context; `try { return await act(tree); } finally { rmSync(…) }`, async from the start because
   step 4's legs pass an async act, so the floor test body is async too), `renderCommand(segments, tree)` and `isTrusted(command)` (returns `true` on a
   return, `false` on an error matching `/no craft hook found/`, rethrows anything else). The
   test now still fails with an assertion naming the count, `4 trusted, floor 60` (only the
   four trusted fixed cases exist). That second failure is the real RED: the corpus has no
   generator yet.

   2b. **GREEN — generator (DC-4).** Append `cap` generated draws, each a 50/50 pick between a
   grammar build and a seed mutation, exactly per design §Design "Corpus": grammar = `LEAD + interpreter + SEP +
   operand + TRAIL`, operand = `PREFIX + body + TAIL + optional ".bak"`, quoted half the time,
   body = 0-4 fragments (`SAFE` at 0.7, else a uniformly drawn class from `UNSAFE_CLASSES`, then
   a member); interpreter drawn 0.7 good / 0.3 bad from the interpreter table, composed
   `«BIN»/<f>/node` entries built from every `UNSAFE` member except `=mark`; mutation = pick a
   fixed case, apply 1-3 char edits (insert / delete / replace from
   `SAFE ∪ UNSAFE ∪ {n,o,d,e,", ' '}`) inside the literal segments of `rest` only (never the
   interpreter, never a placeholder). `buildCorpus` now returns `FIXED_CASES.length + cap` entries. Floor and
   determinism green.

   2c. **REFACTOR — pin the floor.** Log the trusted count once (temporary), set
   `ACCEPTED_FLOOR = Math.floor(0.8 × measured)` as a literal (prototype: 74 → 59), remove the
   log, add the one-line why comment (a narrowed matcher or a `TMPDIR` with non-path characters
   collapses the count and must fail loudly). Re-run: green.

3. **GUARD — interpreter existence (R6).** Add `Given every interpreter the corpus can draw,
   when the matcher trusts it, then a stub exists at that path`: inside `withStubTree`, render
   each interpreter-table entry, form `<entry> /x<TAIL>`, and when `isTrusted` holds and the
   entry is not `node`, `assert.ok(existsSync(rendered), rendered)`. It passes at this step
   because step 2b already excludes `=mark` from the composed entries and the good entries
   (`«BIN»/node`, `«BIN»//node`, `«BIN»/./node`) all resolve to the stub. Teeth check (scratch
   only, not the worktree): in a step-5-layout scratch copy, add `=mark` back to the composed
   set and run the scratch file: R6 fails naming `<tmp>/bin/=mark/node`. Record one line for the PR.

4. **RED — shell legs (R3, R4, R9, R10).** Add the loop
   `for (const shell of SHELLS) it(\`Given every trusted command, when ${shell} -c runs it with a
   stub node, then each runs the stub once on one rooted guard path and nothing else\`,
   { skip: skipReasonFor(shell) }, async () => { … assert.deepEqual(failures, []); })`, calling
   `runLeg(shellPath)`. Expected failure on all four present shells:
   `ReferenceError: findOnPath is not defined` (from `skipReasonFor`, evaluated at load: the whole
   file fails to load, which is the RED).

   4a. **GREEN — harness.** Add `findOnPath(name)` (scan `process.env.PATH.split(delimiter)` with
   `accessSync(join(dir, name), constants.X_OK)`, return the absolute path or `null`),
   `skipReasonFor(shell)` (`false` when found, else the R4 string), `runPool(items, worker)`
   (`POOL_SIZE` async workers sharing a local cursor, no module-level mutable state),
   `spawnRun(shellPath, command, env, runDir)` (a Promise around `spawn(shellPath, ['-c',
   command], { cwd, env, timeout: SPAWN_TIMEOUT_MS })` collecting stdout and stderr, resolving on
   `close` with `{ status, signal, stdout, stderr }`; reject on `error` with the command in the
   message, never swallowed), `parseInvocations(buffer)`, `judge(run)`, and `runLeg(shellPath)`
   (one `withStubTree` call: render, filter by `isTrusted`, run through the
   pool, collect failure records). Run the file: all 7 tests green at HEAD, no `# SKIP` on this
   box. If any leg is red → Context "DC-6 stop condition"; do not proceed past triage.

   4b. **REFACTOR.** Functions ≤20 lines, nesting ≤2, early returns; tables `Object.freeze`d;
   no ADR, DC, K or backlog identifier anywhere in the file (R11); comments only for a why
   (floor, interpreter exclusion of `=mark`, the stub writing relative to its cwd). Re-run green.

5. **RED (scratch) — teeth matrix (R8; recorded evidence for the PR).** For each mutant, make a
   fresh scratch, revert one rule there, run the committed-to-be test file there:

   ```sh
   S="$(mktemp -d)"; mkdir -p "$S/adapters/codex"
   cp -R adapters/codex/src adapters/codex/test adapters/codex/hooks.json adapters/codex/package.json "$S/adapters/codex/"
   node -e '<one-string replace on $S/adapters/codex/src/hook-trust.js>'   # the edit below
   node --test "$S/adapters/codex/test/hook-trust-differential.test.js" > "$S/out.tap" 2>&1; echo "exit $?"
   grep -n '^not ok\|"index"\|index:' "$S/out.tap" | head -20
   ```

   | Mutant | Edit in the scratch hook-trust.js |
   |---|---|
   | K1 | L67 class gains `$(){}` and backtick: `` /^[\p{L}\p{N}._/+@%,:= $(){}`-]*$/u `` |
   | K2 | L66 class gains `*?~[]`: `/^[\p{L}\p{N}._/+@%,:=*?~[\]-]+$/u` |
   | K3 | `isRootedPath` body → `return true;` |
   | K4 | `isGuardInterpreter` return → `interpreter === GUARD_INTERPRETER \|\| toBasename(interpreter) === GUARD_INTERPRETER` |
   | K5 | L65 → `/^\s*(\S+)\s+(?:"([^"]*)"\|(\S+))\s*$/` |
   | K6 | `isInertBareOperand` body → `return true;` |
   | K7 | L65 trailing ` *$` → `[\s\S]*$` |
   | K8 | `isInertQuotedOperand` body → `return true;` |
   | K9 | delete the `if (!isLiteralWord(interpreter)) { return false; }` guard in `isGuardInterpreter` |
   | K10 | L66 class gains `$`: `/^[\p{L}\p{N}._/+@%,:=$-]+$/u` |
   | K11 | L65 → `/^ *(?:[A-Za-z_][A-Za-z0-9_]*=[^ ]* +)?([^ ]+) +(?:"([^"]*)"\|([^ ]+)) *$/` |

   Expected: every mutant turns at least one leg `not ok` (the prototype killed all 11 at seed 1,
   cap 2000; last first kill K10). K11 must be killed through the `NODE_*` clause and K9 partly
   through the marker; note which clause in the table. Record per mutant: first failing corpus
   index, failing legs, failure count. Also run the unmutated scratch once: exit 0.
   If a mutant survives at `SEED = 1`: per ADR-523 keep `CAP = 2000`, edit `SEED` in the scratch
   copies to 2, 3, … until one seed kills all 11 with HEAD still green, then set that `SEED` in
   the worktree file, redo step 2c's floor at the new seed, and re-run step 5 in full.

6. **Robustness spot-check (scratch, recorded).** In one scratch with HEAD's hook-trust.js, set
   `CAP = 4000` and loop `SEED` over 1..25 (sed the two constants in the scratch file per run;
   output to `$S/seed-<n>.tap`; add a temporary count log in the scratch file only, never in
   the worktree). Expected: exit 0 for all 25. Record totals: generated, trusted,
   shell runs, failures (expect 0).

7. **Skip-path proof (scratch PATH, recorded).**

   ```sh
   P="$(mktemp -d)"; for t in node sh bash dash; do ln -s "$(command -v "$t")" "$P/$t"; done
   PATH="$P" "$P/node" --test adapters/codex/test/hook-trust-differential.test.js > "$P/skip.tap" 2>&1; echo "exit $?"
   grep -n 'SKIP\|# skipped\|# fail\|# pass' "$P/skip.tap"
   ```

   Expected: `# SKIP zsh is not on PATH, so its leg did not run`, `# skipped 1`, `# fail 0`,
   exit 0. The other three legs ran (`ok`). Record the lines.

### Gate

```sh
npm --prefix adapters/codex test > <tmp>/codex.tap 2>&1; echo "exit $?"
grep -n '^# \(tests\|pass\|fail\|skipped\|duration_ms\)' <tmp>/codex.tap
```

Expect exit 0, `# tests 616`, `# fail 0`, `# skipped 0` on this box (all four shells present),
and a wall time ≤ 1.5 s (`time npm --prefix adapters/codex test > /dev/null`). Commit only on
green. Put in the handback, for the PR body: the teeth table (step 5), the R6 teeth line
(step 3), the robustness totals (step 6), the skip-path lines (step 7), the trusted count and
`ACCEPTED_FLOOR`, the committed `SEED`/`CAP`, and the gate numbers.

### Commit

`git add adapters/codex/test/hook-trust-differential.test.js` only, then:

`test(codex): add a seeded differential fuzz for the hook trust matcher`

## Part 2 — Install zsh with the shared dev tools

### Context

Edit two files, nothing else:

- `scripts/install-dev-tools.sh` L4: `readonly APT_PACKAGES=(shellcheck jq)` → append `zsh`.
  `main` runs `as_root apt-get install -y "${APT_PACKAGES[@]}"`, so order in the array is the
  order in the logged command.
- `test/install-dev-tools.test.js` L21: `const APT_INSTALL = 'apt-get install -y shellcheck jq';`
  → append ` zsh`. It feeds `expectedNonRootLog()` (L60-62), asserted by two tests: `Given a
  non-root user, when the install script runs, then every apt-get call goes through sudo` and
  `Given root, when the install script runs, then it calls apt-get without sudo`. The third test
  (`Given the CI workflow, …`) reads .github/workflows/ci.yml and is unaffected.

Why (ADR-525, ratified): CI (`ubuntu-latest`) ships no zsh, so without this the fuzz's zsh leg
would skip on every push. zsh alone observes the operand-glob class. CI runs this script at
.github/workflows/ci.yml:28 and the devcontainer runs it in .devcontainer/devcontainer.json
`postCreateCommand` (ADR-505, ADR-509); neither file changes. scripts/static-lints.sh runs
`shellcheck scripts/*.sh hooks/*.sh` inside `bash scripts/ci.sh`.

CONTRIBUTING.md:13 is NOT edited here (see DC-P1).

### TDD steps

1. **RED.** `test/install-dev-tools.test.js` L21 → `'apt-get install -y shellcheck jq zsh'`.
   Run `node --test test/install-dev-tools.test.js > <tmp>/idt.tap 2>&1; grep -n 'not ok\|# fail' <tmp>/idt.tap`.
   Expected: the non-root and root tests fail; the deepStrictEqual diff shows the logged
   `apt-get install -y shellcheck jq` against the expected `… shellcheck jq zsh`, because the
   script still installs only shellcheck and jq. The CI-workflow test stays green (GUARD: it
   inspects ci.yml steps, not the package list).
2. **GREEN.** `scripts/install-dev-tools.sh` L4 → `readonly APT_PACKAGES=(shellcheck jq zsh)`.
   Re-run: 3/3 green.
3. **REFACTOR.** None needed.

### Gate

```sh
node --test test/install-dev-tools.test.js > <tmp>/idt.tap 2>&1; echo "exit $?"; grep -n '^# \(pass\|fail\)' <tmp>/idt.tap
shellcheck scripts/install-dev-tools.sh
```

Expect exit 0, `# fail 0`, shellcheck silent. The phase gate `bash scripts/ci.sh` runs after
this part (it covers this suite via `run_suite process test` and shellcheck via
scripts/static-lints.sh).

### Commit

`git add scripts/install-dev-tools.sh test/install-dev-tools.test.js` only, then:

`ci: install zsh with the shared dev tools so the trust-matcher fuzz runs its zsh leg`
