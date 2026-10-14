# Plan — adapter-entry-symlink-guard

> Source: design doc `docs/contributing/design/adapter-entry-symlink-guard.md` · ADRs `561, 562`
> (561: both adapter entries import `isEntryPoint` statically from `../../../engine/src/cli-io.js`;
> 562: per-entry behavioural link tests, the pi literal-string test is removed, no sweep, no text
> pin). Standing context, not re-opened: ADR-556 (`isEntryPoint(moduleUrl, argv1)` lives in the
> shared CLI module), ADR-557 (both sides real-pathed), ADR-558 (only `ENOENT` on argv[1] means
> "not the entry"), ADR-560 (behaviour over text pins), ADR-345 (hermetic subprocess env: env
> built from scratch, never spread from `process.env`), ADR-066 / ADR-315 (thin shim: the entry
> keeps `process.exit` and its `.catch` net, and stays outside Stryker `mutate`).
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.
> Template: `templates/plan.md`.

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

| # | Part | Size class | src delta | Files |
|---|---|---|---|---|
| 1 | README corpus counts match the tree | docs-only | none | README.md (three numbers on lines 200-201) |
| 2 | codex: trust-hook runs main through a symlinked path | src-suite | adapters/codex/bin/trust-hook.js (+1 / −1 import, +1 / −1 guard) | one new suite, the bin |
| 3 | pi: craft-pi runs main through a symlinked path and npm's bin link | src-suite | adapters/pi/src/cli.js (+1 / −1 import, +1 / −1 guard) | its existing suite, the entry |

Order: Part 1 first. `bash scripts/ci.sh` is red on this branch before any part lands, because
the design and ADR commits moved the corpus counts the README claims (see Part 1). Every later
part's phase-gate run of `ci.sh` needs Part 1. Parts 2 and 3 are independent of each other; run
them in order 2 → 3 (shared working tree).

Every edit below was applied, in order, to a throwaway `git clone` of the branch tip
(`3457084`, before this plan existed) with engine/node_modules copied in, and checked there
(Node 22.22.3, macOS):

| Check | Result |
|---|---|
| Baseline, `bash scripts/readme-drift.sh .` | exit 1: `design/ claims 64, tree holds 65`, `adr/ claims 560, tree holds 562` |
| Baseline, `node --test test/readme-drift.test.js` | 3 pass / 1 fail: "Given the live repo tree, when readme-drift runs, then it exits 0 with no findings" |
| Part 2 step 1 (RED) | new suite 2 pass / 1 fail: link test `actual: 0`, `expected: 2` |
| Part 2 after GREEN | `node --test test/trust-hook.bin.test.js test/trust-hook-main.test.js` (cwd adapters/codex): 54 pass / 0 fail |
| Part 2 hermeticity (guard forced to `true`, throwaway only) | import test red with stderr `trust-hook: app-server process error: spawn codex ENOENT`; nothing outside the sandbox touched |
| Part 3 step 2 (RED) | adapters/pi/test/cli.test.js 8 pass / 2 fail: both link tests `actual: 0` |
| Part 3 after GREEN | adapters/pi/test/cli.test.js 10 pass / 0 fail |
| Part 3 hermeticity (guard forced to `true`, throwaway only) | import test red with stderr `{ unit: pi-run, reason: spawn pi ENOENT }` |
| All three parts landed | `bash scripts/ci.sh` exit 0 (process suite, static lints and hygiene block included) |

## Public-surface decision

No new exported symbol. `trust-hook.js` and `cli.js` export nothing before or after; each gains
one import of the existing internal export `isEntryPoint` (ADR-556 made it internal to the
engine; it is not in engine/src/index.js and no README, guide, registry or generated report lists
it). The new test constants and helpers are module-private. No barrel, facade, exhaustiveness
switch, registry or doc surface applies. engine/stryker.conf.json is unchanged (design R4):
neither entry joins `mutate`, and the new codex suite is deliberately NOT added to
`tap.testFiles` (spawns would slow every mutation dry run for no mutant).

## Decision candidates

None open. ADR-561 and ADR-562 settle the two load-bearing choices, and the design's Test
strategy pins the tests, their placement and their expected bytes. Details the design left
implicit, fixed here without a decision:

- README corpus counts ride in their own docs-only Part 1, not in the orchestrator's
  documentation phase: `ci.sh` (the phase gate every part runs) is red until they match. This
  follows the precedent of docs/contributing/plan/claude-hook-foreground-stall-probe.md Part 1.
- Pi: the design offered "generalise `runCli`" or "add `spawnEntry`". This plan adds
  `spawnNode(argv)` (full node argv, so the import test can pass `--input-type=module -e …`
  through the same pinned env and cwd) and rewrites `runCli(...args)` as
  `spawnNode([CLI_PATH, ...args])`. The three existing `runCli()` call sites stay byte-identical.
- The codex suite asserts `sut.error === undefined` before the status: a spawn that fails to
  start has `status: null` and must not pass vacuously (same rule as
  engine/test/bin-entry-symlink.bin.test.js).
- The new `isEntryPoint` import replaces the `node:url` import on the same line in each entry, so
  the import block keeps its position and the pi header test (`from './run.js'` present) still
  holds.
- No part edits BACKLOG.md. The orchestrator flips the open entry "Adapter entry points exit 0
  silently when invoked through a symlinked path." (BACKLOG.md :180-187) to delivered in the
  documentation phase.

## Validation-phase notes

- Mutation: nothing to run. The only decision under test, `isEntryPoint`, is already mutated
  in engine/src/cli-io.js and killed by engine/test/cli-io.test.js. The entries are outside
  `mutate` by the thin-shim rule; the new tests prove wiring, not the predicate.
- The RED tests use links the test makes itself, so they are red on Linux too (where `tmpdir()`
  is not a symlink), not only on macOS (`/var` → `/private/var`).
- Accepted regressions (design § Failure-mode shifts, ADR-561): an adapter-only copy, or
  `--preserve-symlinks-main` through a link to the adapter dir alone, now exits 1 with
  `ERR_MODULE_NOT_FOUND …/engine/src/cli-io.js` instead of today's exit 2. Not a finding: no
  supported install produces either layout. Do not add indirection to "fix" it.
- Node 18: the pi path exits 1 at engine/src/glob.js on the physical path too. Pre-existing and
  out of scope.

## Part 1 — README corpus counts match the tree

### Context

File edited: `README.md` (repo root). Only the bracketed numbers on two lines change.

Lines 200-201, section `## craft builds craft`, the receipts sentence. Today:

```
receipts: [64 design docs](docs/contributing/design/), [63 parted plans](docs/contributing/plan/),
[560 ADRs](docs/contributing/adr/), and [raw telemetry for 25 runs](docs/contributing/metrics-baseline.report.json)
```

After (expected, with this plan committed):

```
receipts: [65 design docs](docs/contributing/design/), [64 parted plans](docs/contributing/plan/),
[562 ADRs](docs/contributing/adr/), and [raw telemetry for 25 runs](docs/contributing/metrics-baseline.report.json)
```

readme-drift (scripts/readme-drift.sh → engine/bin/readme-drift.js, corpus-counts sub-guard)
compares each bracketed number with the file count of the linked directory. Set each number to
the "tree holds" count `bash scripts/readme-drift.sh .` reports at commit time. When this plan was
committed the tree held 65 design docs, 64 plans (this plan included) and 562 ADRs. Take the
numbers from the tool, not from this text: a later commit may add a file. The tool prints one line
per drifting directory (`readme-drift: corpus-counts: <dir> claims <n>, tree holds <m>`); a
directory it does not name already matches. Leave the telemetry count (25 runs) and every other
byte of the two lines alone: it counts runs in docs/contributing/metrics-baseline.report.json,
which this change does not refresh.

Tests that read these numbers (all run by `ci.sh`; none is edited):
engine/test/readme-drift-main.test.js (line 304, "Given no root argument, when main runs, then it
resolves DEFAULT_ROOT against the real repo root and finds no unusable-input errors") and
test/readme-drift.test.js (line 97, "Given the live repo tree, when readme-drift runs, then it
exits 0 with no findings"). .github/workflows/ci.yml also runs `bash scripts/readme-drift.sh`.

Public surface: none (prose only).

### TDD steps

No code delta and no new test.

1. RED (existing tests, already failing) — test/readme-drift.test.js "Given the live repo tree,
   when readme-drift runs, then it exits 0 with no findings", engine/test/readme-drift-main.test.js
   "Given no root argument, when main runs, then it resolves DEFAULT_ROOT against the real repo root
   and finds no unusable-input errors", and `bash scripts/readme-drift.sh .` exiting 1. `ci.sh`
   stops at the engine suite on the second one. They fail because the README claims 64 design docs, 63 plans and 560 ADRs while the tree holds
   65, 64 and 562.
2. GREEN — run `bash scripts/readme-drift.sh .`, set the README numbers to the "tree holds"
   values it prints, re-run it: exit 0, no output.
3. GUARD — test/source-hygiene.test.js and prose-lint over README.md pass: the edit changes
   digits only. `git diff --no-ext-diff README.md` shows exactly two `-` lines (200 and 201).

REFACTOR: none.

### Gate

Run from the worktree root. Output goes to a file; read back only the summary and failures:

```bash
LOG="$(mktemp -d)"
bash scripts/readme-drift.sh .; echo "exit=$?"
git diff --no-ext-diff README.md | grep -cE '^-[^-]'
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: readme-drift exits 0 with no output, the diff count prints `2`, `ci.sh` exits 0 and the
grep prints nothing. Never commit on a red gate.

### Commit

`docs(readme): refresh the design, plan and adr corpus counts`

## Part 2 — codex: trust-hook runs main through a symlinked path

### Context

**What changes.** `trust-hook.js` replaces its `process.argv[1] === fileURLToPath(import.meta.url)`
guard with `isEntryPoint(import.meta.url, process.argv[1])`, imported from the shared CLI module,
and drops its `node:url` import. A new suite spawns the bin through a link it makes itself, by its
physical path, and as an imported module.

**Files.**

- `adapters/codex/bin/trust-hook.js` (64 lines, ESM, exports nothing).
  - :13 `import { fileURLToPath } from 'node:url';` → replace in place with
    `import { isEntryPoint } from '../../../engine/src/cli-io.js';`. `fileURLToPath` has no
    other use in the file.
  - :54 `if (process.argv[1] === fileURLToPath(import.meta.url)) {` → replace with
    `if (isEntryPoint(import.meta.url, process.argv[1])) {`.
  - Every other line stays byte-identical: imports :1-12 and :14-17, `MISSING_FILE_ERROR_CODE`,
    `readConfig`, `buildDependencies`, the guard body :55-63 (comment, `main(...).then(process.exit)`,
    `.catch` → `process.stderr.write('trust-hook: …')` + `process.exit(EXIT_REFUSED)`).
- `adapters/codex/test/trust-hook.bin.test.js` (NEW). Full content in TDD step 1. The name
  mirrors engine/test/<bin>.bin.test.js; scripts/ci.sh `run_suite adapters/codex` finds it
  via `find … -name '*.test.js'`, and the package script `node --test 'test/**/*.test.js'` does
  too. test/every-test-file-registers.test.js only needs a `describe(`/`it(` call in it.

**Read-only references.**

- engine/src/cli-io.js `isEntryPoint(moduleUrl, argv1)`: real-paths both sides, returns false for
  a missing/empty argv1 or `ENOENT`, rethrows other errors. Not edited.
- adapters/codex/src/trust-hook-main.js: exit contract 0 trusted / 1 untrusted / 2 refusal
  (`EXIT_REFUSED`). `parseCheckMode` runs first and refuses any argv other than `[]` or
  `['--check']`, so `--bogus` writes exactly `trust-hook: unrecognised argument(s): --bogus\n`
  to stderr, nothing to stdout, exit 2, before any spawn, read or write.
- adapters/codex/test/trust-hook-main.test.js :682-702, "negative pin: source scan over every
  authored file": reads bin/trust-hook.js as text and forbids the bypass flag/key. Still passes.
  It is in engine/stryker.conf.json `tap.testFiles`; that is why the spawn tests go in a new file.
- engine/test/bin-entry-symlink.bin.test.js: the model for the link spawn shape.

**Pinned behaviour (design table, re-probed).** Physical `--bogus`: exit 2, 45 bytes stderr.
Through `<tmp>/codex-link/bin/trust-hook.js --bogus` today: exit 0, no output; after GREEN: exit
2, same 45 bytes. `node --input-type=module -e "await import(<file URL of the bin>)"`: exit 0, no
output, before and after. With no args, no `codex` on PATH and an empty throwaway `CODEX_HOME`,
main exits 2 `trust-hook: app-server process error: spawn codex ENOENT` and writes nothing, which
is what keeps a wrongly-true guard hermetic in the import test.

**Style.** node:test `describe`/`it`, Given/When/Then titles, AAA comments with blank lines
between phases, `sut` for the spawn result, named constants (no magic `2`), no provenance numbers
(ADR/phase/backlog) in titles or comments.

### TDD steps

1. **RED — link spawn.** Create `adapters/codex/test/trust-hook.bin.test.js` with the header,
   imports, constants, `withSandbox`, `spawnNode`, and the FIRST `it` below (link test);
   `pathToFileURL` is unused until step 2. Fails:
   `actual: 0`, `expected: 2` (the guard compares the typed link path with the real module path,
   so main never runs and the process exits 0 with empty stdout/stderr).

   ```js
   /**
    * The trust-hook bin, spawned as a real process, runs its main when reached through a symlinked
    * adapter dir and stays inert when imported as a module. The environment is built from scratch:
    * no codex on PATH and throwaway HOME / CODEX_HOME, so even a guard that wrongly runs main ends in
    * a spawn ENOENT and never touches a real config. Given/When/Then titles, Arrange-Act-Assert bodies,
    * sut variable.
    */

   import { describe, it } from 'node:test';
   import assert from 'node:assert/strict';
   import { spawnSync } from 'node:child_process';
   import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { dirname, join } from 'node:path';
   import { fileURLToPath, pathToFileURL } from 'node:url';

   const ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
   const BIN = join(ADAPTER_DIR, 'bin', 'trust-hook.js');
   const LINK_NAME = 'codex-link';
   const LOUD_ARGV = ['--bogus'];
   const EXIT_REFUSED = 2;
   const EXPECTED_STDERR = 'trust-hook: unrecognised argument(s): --bogus\n';

   // A fresh throwaway per call: bin/ holds only node, codex-link points at the real adapter dir.
   function withSandbox(fn) {
     const tmp = mkdtempSync(join(tmpdir(), 'craft-trust-hook-'));
     try {
       mkdirSync(join(tmp, 'bin'));
       symlinkSync(process.execPath, join(tmp, 'bin', 'node'));
       symlinkSync(ADAPTER_DIR, join(tmp, LINK_NAME));
       const env = Object.freeze({ PATH: join(tmp, 'bin'), HOME: tmp, CODEX_HOME: join(tmp, 'codex-home') });
       return fn({ tmp, env });
     } finally {
       rmSync(tmp, { recursive: true, force: true });
     }
   }

   function spawnNode(argv, { tmp, env }) {
     return spawnSync(process.execPath, argv, { cwd: tmp, env, input: '', encoding: 'utf8' });
   }

   describe('trust-hook bin — entry-point guard', () => {
     it('Given trust-hook reached through a symlinked adapter dir, when spawned with an unknown flag, then it refuses with exit 2', () => {
       // Arrange / Act
       const sut = withSandbox((sandbox) =>
         spawnNode([join(sandbox.tmp, LINK_NAME, 'bin', 'trust-hook.js'), ...LOUD_ARGV], sandbox),
       );

       // Assert
       assert.equal(sut.error, undefined);
       assert.equal(sut.status, EXIT_REFUSED, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
       assert.equal(sut.stderr, EXPECTED_STDERR);
       assert.equal(sut.stdout, '');
     });
   });
   ```

   Do not import `EXIT_REFUSED` from ../src/trust-hook-main.js: the test pins the process exit
   code as an external contract, independent of the module's constant.

2. **GUARD — physical path and import.** Add these two `it`s inside the same `describe`, after
   the link test. Both pass before GREEN: by the physical path argv[1] equals the module path, so
   today's guard already runs main (exit 2); on import argv[1] is undefined under `-e`, so today's
   guard is false (exit 0, no output). They pin R3 (physical path byte-identical) and R2 (import
   never runs main) across the swap.

   ```js
     it('Given trust-hook reached by its physical path, when spawned with an unknown flag, then it refuses with exit 2', () => {
       // Arrange / Act
       const sut = withSandbox((sandbox) => spawnNode([BIN, ...LOUD_ARGV], sandbox));

       // Assert
       assert.equal(sut.error, undefined);
       assert.equal(sut.status, EXIT_REFUSED, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
       assert.equal(sut.stderr, EXPECTED_STDERR);
       assert.equal(sut.stdout, '');
     });

     it('Given trust-hook imported as a module, when the import settles, then main does not run', () => {
       // Arrange
       const importScript = `await import(${JSON.stringify(pathToFileURL(BIN).href)});`;

       // Act
       const sut = withSandbox((sandbox) => spawnNode(['--input-type=module', '-e', importScript], sandbox));

       // Assert
       assert.equal(sut.error, undefined);
       assert.equal(sut.status, 0, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
       assert.equal(sut.stdout, '');
       assert.equal(sut.stderr, '');
     });
   ```

   Suite now: 2 pass / 1 fail (the link test).

3. **GREEN — swap the guard.** In adapters/codex/bin/trust-hook.js replace line 13 and line 54 as
   given in Context. Suite: 3 / 0 fail. `node --test test/trust-hook.bin.test.js
   test/trust-hook-main.test.js` from adapters/codex: 54 pass / 0 fail.

4. **GUARD — no residue.** `grep -n "fileURLToPath\|process.argv\[1\] ===" adapters/codex/bin/trust-hook.js`
   prints nothing; `git diff --no-ext-diff adapters/codex/bin/trust-hook.js` shows exactly two `-`
   and two `+` lines.

REFACTOR: none (the GREEN is two lines; the new suite is already in final form).

Do NOT break the bin in the worktree to watch the import test fail. That check (guard forced to
`true` → import test red on `spawn codex ENOENT`) was run in a throwaway clone at plan time.

### Gate

Run from the worktree root:

```bash
LOG="$(mktemp -d)"
(cd adapters/codex && node --test test/trust-hook.bin.test.js test/trust-hook-main.test.js > "$LOG/part.log" 2>&1); echo "exit=$?"; grep -nE '^ *not ok|^# (pass|fail)' "$LOG/part.log"
(cd adapters/codex && node --test 'test/**/*.test.js' > "$LOG/pkg.log" 2>&1); echo "exit=$?"; grep -nE '^ *not ok|^# (pass|fail)' "$LOG/pkg.log"
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: every exit 0; part log `# pass 54`, `# fail 0`; package log `# fail 0`; the `ci.sh` grep
prints nothing. Never commit on a red gate.

Bin-level proof (optional, throwaway only; macOS `$TMPDIR` is under a symlink, and the link is
made explicitly anyway):

```bash
T="$(mktemp -d)"; ln -s "$PWD/adapters/codex" "$T/codex-link"
node "$T/codex-link/bin/trust-hook.js" --bogus; echo "exit=$?"   # expect stderr "trust-hook: unrecognised argument(s): --bogus", exit=2 (was 0)
rm -rf "$T"
```

### Commit

`fix(codex): run trust-hook main when the bin is reached through a symlinked path`

## Part 3 — pi: craft-pi runs main through a symlinked path and npm's bin link

### Context

**What changes.** `cli.js` replaces its `process.argv[1] === fileURLToPath(import.meta.url)` guard
with `isEntryPoint(import.meta.url, process.argv[1])` and drops its `node:url` import. The pi suite
loses the test that pins the guard's source text and gains three behavioural tests: run through a
linked adapter dir, run through npm's bin shape, and import without running.

**Files.**

- `adapters/pi/src/cli.js` (9 lines). Today:

  ```js
  #!/usr/bin/env node
  import { fileURLToPath } from 'node:url';
  import { main } from './run.js';
  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    // EQUIVALENT-MUTANT: … (lines 5-6, unchanged)
    const result = await main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr });
    process.exit(result.code);
  }
  ```

  - :2 → `import { isEntryPoint } from '../../../engine/src/cli-io.js';` (same line, so
    `import { main } from './run.js';` stays on :3).
  - :4 → `if (isEntryPoint(import.meta.url, process.argv[1])) {`.
  - :1 and :5-9 byte-identical (shebang, the EQUIVALENT-MUTANT comment, dispatch, `process.exit`).
- `adapters/pi/test/cli.test.js` (193 lines, node:test ESM, two describes).
  - :3 `import { readFileSync, mkdtempSync, mkdirSync, symlinkSync, rmSync, statSync } from 'node:fs';`
    already has everything; `readFileSync` stays used by the two header tests.
  - :6 `import { fileURLToPath } from 'node:url';` → `import { fileURLToPath, pathToFileURL } from 'node:url';`.
  - :9-11 `__dir`, `PKG_PATH`, `CLI_PATH = join(__dir, '..', 'src', 'cli.js')`. Replace :11 with:

    ```js
    const ADAPTER_DIR = join(__dir, '..');
    const CLI_PATH = join(ADAPTER_DIR, 'src', 'cli.js');
    const PI_RUN_ENOENT_BLOCKER = '{ unit: pi-run, reason: spawn pi ENOENT }';
    const EXIT_BLOCKED = 2;
    ```

  - :26-53 describe `cli.js — thin bin entrypoint`: :27-34 bin-field test and :36-42 shebang +
    `from './run.js'` test stay. :43-52 (the blank line and the test
    `Given cli entry, source read, then guards on import.meta.url before calling process.exit`)
    are DELETED, so :42 `  });` is followed directly by :53 `});`.
  - :63-193 describe `cli.js — subprocess execution guard`. State: `let root, binDir, repoDir,
    gitPath, PINNED_ENV` (:64-68). `initRepo(dir)` (:73-76). `before()` (:78-99) builds
    `root = mkdtempSync(join(tmpdir(), 'craft-pi-cli-'))`, `binDir` with `node` and `git`
    symlinks, frozen `PINNED_ENV = { PATH: binDir, HOME: root, GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }`, and a `git init`-ed
    `repoDir = join(root, 'repo')`. `after()` (:101-103) `rmSync(root, { recursive: true,
    force: true })` also removes the new links. `runCli(...args)` (:105-111) spawns
    `process.execPath` with `[CLI_PATH, ...args]`, `cwd: repoDir`, `env: PINNED_ENV`,
    `encoding: 'utf8'`. Tests :113-192: pi-absent ENOENT check, decoy GIT_DIR check, and three
    physical-path `runCli()` tests (integer exit; exit 2 + exact blocker; argv slice). All stay
    byte-identical; they carry R3.

**Read-only references.** adapters/pi/src/run.js: `main` with `pi` absent writes
`{ unit: pi-run, reason: spawn pi ENOENT }\n` to stderr and returns `{ code: 2 }`; it already
imports ../../../engine/src/frontmatter.js, so the new engine edge adds no dependency.
adapters/pi/package.json: `bin: { craft-pi: src/cli.js }` (pinned by the header test and by
adapters/pi/test/native-surface.test.js :134-139; neither is edited). engine/src/cli-io.js
`isEntryPoint`: not edited.

**Pinned behaviour (design table, re-probed).** Physical `node src/cli.js` with `pi` absent: exit
2, stderr `{ unit: pi-run, reason: spawn pi ENOENT }`. Through `<root>/pi-link/src/cli.js` and
through an extensionless file symlink `<root>/npm-bin/craft-pi → <CLI_PATH>` (the shape
`npm install -g` creates in `prefix/bin`): exit 0 and no output today, exit 2 with the blocker
after GREEN. Import with `--input-type=module -e`: exit 0, no output, before and after.

**Style.** As the file already does: Given/When/Then titles, AAA comments in new tests, `sut` for
the spawn result, named constants, no provenance numbers.

### TDD steps

1. **Remove the text pin.** Delete :43-52 of adapters/pi/test/cli.test.js (the blank line and the
   `guards on import.meta.url` test). It passes today and would turn red on the correct fix; its
   intent ("importing the module does not run it") returns as a behaviour in step 3. Suite: 7 pass.

2. **RED — link and npm bin.** Apply the :6 and :11 import/constant edits from Context. In the
   subprocess describe add `let linkedCliPath;` and `let npmBinPath;` after `let PINNED_ENV;`,
   append to `before()` after `initRepo(repoDir);`:

   ```js

       symlinkSync(ADAPTER_DIR, join(root, 'pi-link'));
       linkedCliPath = join(root, 'pi-link', 'src', 'cli.js');
       // npm's bin shape: an extensionless file symlink named after the bin, pointing at cli.js.
       mkdirSync(join(root, 'npm-bin'));
       npmBinPath = join(root, 'npm-bin', 'craft-pi');
       symlinkSync(CLI_PATH, npmBinPath);
   ```

   replace `runCli` with:

   ```js
     function spawnNode(argv) {
       return spawnSync(process.execPath, argv, {
         cwd: repoDir,
         env: PINNED_ENV,
         encoding: 'utf8',
       });
     }

     function runCli(...args) {
       return spawnNode([CLI_PATH, ...args]);
     }
   ```

   and append at the end of the describe (after the argv-slice test):

   ```js
     it('Given cli.js reached through a symlinked adapter dir and pi absent, when it runs, then it exits 2 with the pi-run blocker', () => {
       // Arrange / Act
       const sut = spawnNode([linkedCliPath]);

       // Assert
       assert.equal(sut.error, undefined);
       assert.equal(sut.status, EXIT_BLOCKED, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
       assert.equal(sut.stderr.trim(), PI_RUN_ENOENT_BLOCKER);
     });

     it('Given cli.js reached through an npm-style extensionless bin symlink and pi absent, when it runs, then it exits 2 with the pi-run blocker', () => {
       // Arrange / Act
       const sut = spawnNode([npmBinPath]);

       // Assert
       assert.equal(sut.error, undefined);
       assert.equal(sut.status, EXIT_BLOCKED, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
       assert.equal(sut.stderr.trim(), PI_RUN_ENOENT_BLOCKER);
     });
   ```

   Both fail: `actual: 0`, `expected: 2`. Today's guard compares the typed argv[1] (the link path,
   or the extensionless `craft-pi` path) with the real `cli.js` path, so main never runs and the
   process exits 0 in silence. Suite: 7 pass / 2 fail.

3. **GUARD — import does not run main.** Append after the two link tests:

   ```js
     it('Given cli.js imported as a module, when the import settles, then main does not run', () => {
       // Arrange
       const importScript = `await import(${JSON.stringify(pathToFileURL(CLI_PATH).href)});`;

       // Act
       const sut = spawnNode(['--input-type=module', '-e', importScript]);

       // Assert
       assert.equal(sut.error, undefined);
       assert.equal(sut.status, 0, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
       assert.equal(sut.stdout, '');
       assert.equal(sut.stderr, '');
     });
   ```

   Passes before GREEN: under `-e`, argv[1] is undefined, so today's guard is false. It pins R2
   across the swap (a wrongly-true guard would exit 2 on `spawn pi ENOENT`; checked in a
   throwaway, not to be repeated in the worktree). Suite: 8 pass / 2 fail.

4. **GREEN — swap the guard.** In adapters/pi/src/cli.js replace :2 and :4 as given in Context.
   Suite: 10 pass / 0 fail.

5. **GUARD — no residue.** `grep -n "fileURLToPath\|process.argv\[1\] ===" adapters/pi/src/cli.js`
   prints nothing; `grep -rn "process.argv\[1\] ===" adapters/pi/test` prints nothing (R6: no test
   pins guard text).

REFACTOR: none.

### Gate

Run from the worktree root:

```bash
LOG="$(mktemp -d)"
(cd adapters/pi && node --test test/cli.test.js > "$LOG/part.log" 2>&1); echo "exit=$?"; grep -nE '^ *not ok|^# (pass|fail)' "$LOG/part.log"
(cd adapters/pi && node --test 'test/**/*.test.js' > "$LOG/pkg.log" 2>&1); echo "exit=$?"; grep -nE '^ *not ok|^# (pass|fail)' "$LOG/pkg.log"
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: every exit 0; part log `# pass 10`, `# fail 0`; package log `# fail 0`; the `ci.sh` grep
prints nothing. Never commit on a red gate.

Bin-level proof (optional, throwaway only):

```bash
T="$(mktemp -d)"; mkdir "$T/bin" "$T/repo"; ln -s "$(command -v node)" "$T/bin/node"; ln -s "$(command -v git)" "$T/bin/git"
ln -s "$PWD/adapters/pi/src/cli.js" "$T/bin/craft-pi"
(cd "$T/repo" && env -i PATH="$T/bin" HOME="$T" GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 git init -q . && env -i PATH="$T/bin" HOME="$T" GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 node "$T/bin/craft-pi"); echo "exit=$?"   # expect "{ unit: pi-run, reason: spawn pi ENOENT }", exit=2 (was 0)
rm -rf "$T"
```

### Commit

`fix(pi): run craft-pi main when cli.js is reached through a symlinked path`
