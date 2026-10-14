# Plan — bin-entry-symlink-guard

> Source: design doc `docs/contributing/design/bin-entry-symlink-guard.md` · ADRs `556, 557, 558, 559, 560`
> (all five take the design's recommended options: one `isEntryPoint(moduleUrl, argv1)` export
> in the shared CLI module (556); real-path both argv[1] and the module path (557); only
> `ENOENT` means "not the entry point", every other error is rethrown (558); `engine/bin` only,
> the two adapter entry points are a follow-up (559); a behavioural sweep spawns every bin
> through a test-made symlink (560)). Standing context: ADR-066 (a bin is `import { main }` +
> the entry-point guard + the `process.exit` dispatch, outside `mutate`) and ADR-487 (the
> shared CLI module is the home of shared CLI predicates).
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

## Plan shape (2 parts)

| # | Part | Size class | src delta | Files |
|---|---|---|---|---|
| 1 | Add the real-path `isEntryPoint` predicate | pure-module | engine/src/cli-io.js (+27 / −2) | the module, its suite |
| 2 | Route all 24 bins through `isEntryPoint`, pinned by a symlink sweep | src-suite | engine/bin, 24 files (+48 / −48, two lines swapped per bin) | one new suite, the 24 bins (one glob) |

Part 2 cannot split. The sweep stays red until every bin uses the helper, and every commit
must keep the gate green, so the sweep and the 24-bin swap land in one commit (design § Part
sketch; no partial-allow list). The 24 edits are the same two-line swap (import line, guard line), applied
with one script. That keeps Part 2 at one RED and two GREEN steps even though it touches
25 files.
Part 2's Context block declares the bins as one glob span, so the 6-file ceiling counts it
once.

Every edit below was applied, in order, to a throwaway `git clone` of the branch tip
(`50b683d`) and checked there (Node 22.22.3, macOS):

| Check | Result |
|---|---|
| Part 1 step 1 (RED 1) | suite fails to load: `SyntaxError: The requested module '../src/cli-io.js' does not provide an export named 'isEntryPoint'` |
| Part 1 step 4 (RED 2) | 17 pass / 1 fail: the missing-path test throws `code: 'ENOENT'` |
| Part 1 step 7 (RED 3) | 19 pass / 1 fail: the `undefined`-in-cwd test gets `actual: true`, `expected: false` |
| Part 1 after step 10 | engine/test/cli-io.test.js 21 / 0 fail; `bash scripts/ci.sh` (Part 1 only) exit 0 |
| Part 1 Stryker, narrowed (see Part 1 Gate) | cli-io.js lines 82-95: 15 mutants, 15 killed, 0 survived, 0 no-coverage |
| Part 2 step 1 (RED 1) | sweep 1 pass / 25 fail (S2 plus all 24 per-bin rows) |
| Part 2 step 2 (adr-lint swapped) | sweep 3 pass / 23 fail |
| Part 2 step 3 (all 24 swapped) | sweep 26 / 0 fail, 0.97 s; `bash scripts/ci.sh` exit 0 |
| Part 2 bin-level proof | through a symlinked checkout: `readme-drift.sh /nonexistent` exit 1, `adr-lint.js /nonexistent` exit 2, same under `--preserve-symlinks-main` exit 2, `await import(<bin>)` exit 0 with no output |

## Public-surface decision

One new exported symbol: `isEntryPoint(moduleUrl, argv1)` in engine/src/cli-io.js.
**Internal** to the engine, the same status as its siblings (`isRegularFile`,
`isDirectoryPath`, `isNonEmptyString`, `fail`, `findRepoRoot`). It is a module export
consumed by sibling files (here the 24 bins), not part of the engine barrel
engine/src/index.js, which does not re-export the shared CLI module at all. No README,
guide, registry, generated API report or exhaustiveness switch lists the shared CLI
module's exports (repo-wide grep for `isNonEmptyString` / `findRepoRoot` in living docs:
zero hits), so no surface gate applies beyond the module's own header comment, which
Part 1 updates. `realPathOrNull` is module-private.

## Decision candidates

None. Every load-bearing choice is ratified by ADR 556 to ADR 560, and the plan follows
them. Details the design left implicit are fixed here, not by a decision:

- The sweep spawns with `env: { ...process.env, HOME: tmp }`. That matches the design's
  pinned conditions (`HOME` = an empty mktemp) and keeps a bin from reading the
  developer's `~/.claude` while it handles bad input.
- The sweep asserts `sut.error === undefined` before the loud check. Without it, a spawn
  that fails to start (`status` null) would satisfy `status !== 0` and pass vacuously.
- Design row U7 also takes a non-string argv1 (`42`), so the caller's edge list
  (`undefined` / `''` / non-string) is pinned in full. `realpathSync(42)` stringifies to
  `<cwd>/42` and returns `ENOENT` (probed), so this is a GUARD, not a RED.
- No part edits BACKLOG.md. The orchestrator flips the entry "Engine bins exit 0 silently
  when invoked through a symlinked path." (BACKLOG.md :180) to delivered and files the
  adapter follow-up (ADR-559: adapters/codex/bin/trust-hook.js :54, adapters/pi/src/cli.js
  :4, adapters/pi/test/cli.test.js :49 pins the literal guard string) in the documentation
  phase.

## Validation-phase notes

- Stryker: `engine/src/**/*.js` is in `mutate` (engine/stryker.conf.json, runner `tap`).
  Narrow the corpus to engine/test/cli-io.test.js with an override config written to a
  mktemp dir, passed POSITIONALLY, and mutate only the new lines as ONE `--mutate` value
  (exact command in the Part 1 Gate). A full-suite dry run is not needed and costs minutes.
- Equivalent mutants: none expected, and none observed (15 / 15 killed). Do NOT add an
  `entry !== null` check or any other redundant guard to `isEntryPoint`: `null` never
  equals the module's real path, so such a check would be an equivalent mutant that the
  suite cannot kill. No `// equivalent mutant (...)` comment is needed in Part 1.
- Kill map (Part 1 tests): string guard removed or forced false → the `undefined`-in-cwd
  test; guard forced true or negation dropped → the own-path test; `=== 'ENOENT'` forced
  false or `'ENOENT'` → `""` → the missing-path test; `=== 'ENOENT'` forced true or catch
  body emptied → the ENOTDIR test; `===` → `!==` in the return or try body emptied → the
  own-path test.
- The bins stay outside `mutate` (ADR-066). The Part 2 sweep is their proof.
- Before this branch, a bin reached through a symlink exited 0 with no output, and the
  macOS `$TMPDIR` is a symlink (`/var` → `/private/var`). Earlier plans told agents to
  call bins by `pwd -P` paths for that reason. After Part 2 that workaround is no longer
  needed. Bin-level proofs in this plan use a test-made link on purpose.
- ci.sh and scripts/static-lints.sh call bins by cwd-relative paths, and scripts/*.sh
  call them via a logical `pwd` root. In the worktree (no symlinked component) these
  already ran before Part 2, so Part 2 cannot newly expose a latent red there (the clone
  run under `/private/var` was green). If ci.sh does go red in Part 2 on a lint that
  shells out to a bin, that is a pre-existing defect the dead guard was hiding. Raise it
  through the blocker protocol and do not silence it.

## Part 1 — Add the real-path `isEntryPoint` predicate

### Context

**What changes.** The shared CLI module gains `isEntryPoint(moduleUrl, argv1)`: true when
the module at `moduleUrl` is the process entry script named by `argv1`. Both sides are
real-pathed (ADR-557). A missing, empty or non-string `argv1` returns false before any
`realpathSync` call. An `ENOENT` on argv1 returns false; every other error is rethrown
(ADR-558). No caller yet; Part 2 wires the bins.

**Files edited.**

- `engine/src/cli-io.js` (shipped 70 lines, ESM, no default export).
  - :1-6 module header. The list on :3-5 reads "never-throw regular-file and directory
    predicates, a stderr-and-fail-exit helper, a repo-root walk, and the two exit-code
    constants." Insert "an entry-point predicate for the bins," before "and the two
    exit-code constants" (REFACTOR step).
  - :8 `import { statSync, existsSync } from 'node:fs';` → add `realpathSync`.
  - :9 `import { join, dirname } from 'node:path';` → add a new line after it:
    `import { fileURLToPath } from 'node:url';`.
  - :42-48 `export function isNonEmptyString(value)` — `typeof value === 'string' &&
    value.trim() !== ''`. Reuse it as the argv1 guard; do not edit it.
  - :62-70 `findRepoRoot` is the last function. Append `isEntryPoint` and the private
    `realPathOrNull` after it (end of file).
  - House style already in this file: JSDoc on exports, early return, no
    swallowed error. The bare `catch {}` in `isRegularFile` (:23) is NOT the model here;
    the model is engine/src/contain.js `realExistingPrefix` (ENOENT-only catch, rethrow
    the rest).
- `engine/test/cli-io.test.js` (shipped 147 lines, node:test ESM, 12 tests).
  - :1-5 file header listing the helpers under test. Add `isEntryPoint` to the list on
    :3-4 (REFACTOR step).
  - :9 `import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from
    'node:fs';` already has everything the new tests need.
  - :10 `import { join } from 'node:path';` → add after it
    `import { pathToFileURL } from 'node:url';`.
  - :12 `import { isRegularFile, isDirectoryPath, isNonEmptyString, fail, EXIT_OK,
    EXIT_ERR } from '../src/cli-io.js';` → add `isEntryPoint` after `fail`.
  - :13 `import { makeCaptureIo } ...` → add after it
    `import { withTempCwd } from '../test-helpers/with-cwd.js';`.
  - :15-22 `withTmp(fn)`: mkdtemp under `tmpdir()` with prefix `craft-cli-io-`, `fn(tmp)`
    then `rmSync` in `finally`. Returns `fn`'s value.
  - :116-140 `isNonEmptyString` block; :142 `// ─── constants ───…` banner. Insert the
    new `// ─── isEntryPoint ───…` block (banner, two helpers, nine tests) between
    :140 and :142.

**Read-only references.** engine/test-helpers/with-cwd.js: `withTempCwd(seed, fn)` is
`async`. It creates a `craft-cwd-` mkdtemp, calls `seed(dir)`, `process.chdir`s in, awaits
`fn()` (no argument: read the dir with `process.cwd()`), then restores cwd and removes the
dir in `finally`. A test using it must be `async` and `await` it.
engine/src/contain.js `realExistingPrefix` is the ENOENT-only precedent (ADR-175).

**Pinned facts the tests rely on (design § Pinned behaviour, re-probed on Node 22.22.3).**
`realpathSync(undefined)` does not throw a `TypeError`. It stringifies to
`<cwd>/undefined`, so with a file named `undefined` in cwd it returns that file's real
path. `realpathSync('')` returns cwd. `realpathSync(42)` throws `ENOENT` (`<cwd>/42`). On
macOS `tmpdir()` is itself under a symlink (/var → /private/var), so no assertion
compares against a hand-built path; every check goes through `isEntryPoint`.

**Style.** node:test, Given/When/Then titles, AAA bodies with blank lines between phases,
`const sut = isEntryPoint;` in every test, no provenance numbers in titles or comments.

### TDD steps

Fixture helpers, added with the first RED and reused by every later test:

```js
// real/m.js plus link -> real, so one tree offers a physical and a symlinked route to the same module.
function withEntryFixture(fn) {
  return withTmp((tmp) => {
    mkdirSync(join(tmp, 'real'));
    writeFileSync(join(tmp, 'real', 'm.js'), '');
    symlinkSync(join(tmp, 'real'), join(tmp, 'link'));
    return fn(tmp);
  });
}

function urlOf(path) {
  return pathToFileURL(path).href;
}
```

1. **RED 1 — the three entry shapes plus the plain one.** Add the three import edits
   listed in Context, the helpers, and four tests. In each, `withEntryFixture((tmp) => …)` and
   `assert.equal(sut(<moduleUrl>, <argv1>), true)`:
   - U1 `Given argv1 naming the module by its own path, when isEntryPoint runs, then it
     returns true`: moduleUrl `urlOf(join(tmp, 'real', 'm.js'))`, argv1
     `join(tmp, 'real', 'm.js')`.
   - U2 `Given argv1 reaching the module through a symlinked directory, when isEntryPoint
     runs, then it returns true`: moduleUrl the real path's URL, argv1
     `join(tmp, 'link', 'm.js')`.
   - U3 `Given a module URL kept symlinked as under --preserve-symlinks-main, when
     isEntryPoint runs, then it returns true`: moduleUrl `urlOf(join(tmp, 'link',
     'm.js'))`, argv1 the same link path.
   - U4 `Given argv1 a symlink to the module file itself, when isEntryPoint runs, then it
     returns true`: `symlinkSync(join(tmp, 'real', 'm.js'), join(tmp, 'alias.js'))`;
     moduleUrl the real path's URL, argv1 `join(tmp, 'alias.js')`.

   Expected failure: the suite does not load. `SyntaxError: The requested module
   '../src/cli-io.js' does not provide an export named 'isEntryPoint'`, so node:test
   reports 1 test, 0 pass, 1 fail.
2. **GREEN 1.** Add `realpathSync` to the node:fs import and the node:url
   `fileURLToPath` import, then append:
   ```js
   export function isEntryPoint(moduleUrl, argv1) {
     return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
   }
   ```
   U1-U4 pass (16 / 16).
3. **GUARD — U5 different existing file.** `Given argv1 naming a different existing file,
   when isEntryPoint runs, then it returns false`: `writeFileSync(join(tmp, 'real',
   'other.js'), '')`; moduleUrl the URL of `real/m.js`, argv1 `real/other.js` →
   `false`. Passes after GREEN 1 because the two real paths differ. It pins the
   import-not-execute case (a test runner's argv[1] is its own file).
4. **RED 2 — U8 missing argv1 path.** `Given argv1 naming a path that does not exist, when
   isEntryPoint runs, then it returns false`: argv1 `join(tmp, 'real', 'missing.js')` →
   `false`. Expected failure: GREEN 1 calls `realpathSync` unguarded, so the test throws
   an `Error` with `code: 'ENOENT'` instead of returning false (17 pass / 1 fail).
5. **GREEN 2.** Route argv1 through a private ENOENT-only helper:
   ```js
   export function isEntryPoint(moduleUrl, argv1) {
     return realPathOrNull(argv1) === realpathSync(fileURLToPath(moduleUrl));
   }

   function realPathOrNull(path) {
     try {
       return realpathSync(path);
     } catch (error) {
       if (error.code === 'ENOENT') return null;
       throw error;
     }
   }
   ```
   The module side stays uncaught (ADR-558: the module is running, so its file exists).
6. **GUARD — U9 ENOTDIR rethrown.** `Given argv1 crossing a regular file as if it were a
   directory, when isEntryPoint runs, then it rethrows the ENOTDIR error`:
   `assert.throws(() => sut(urlOf(modulePath), join(modulePath, 'x')), { code:
   'ENOTDIR' })` with `modulePath = join(tmp, 'real', 'm.js')`. Passes after GREEN 2
   because only `ENOENT` is caught. It is the kill for the catch-all mutants (empty catch,
   condition forced true), so it must exist even though it is green on arrival.
7. **RED 3 — U6 absent argv1 with a decoy in cwd.** `Given argv1 undefined and a file named
   undefined in cwd, when isEntryPoint runs, then it returns false` (an `async` test):
   ```js
   const sut = isEntryPoint;
   const seedUndefinedFile = (dir) => writeFileSync(join(dir, 'undefined'), '');

   const result = await withTempCwd(seedUndefinedFile, () => sut(urlOf(join(process.cwd(), 'undefined')), undefined));

   assert.equal(result, false);
   ```
   Expected failure: `realpathSync(undefined)` resolves `<cwd>/undefined`, which is the
   module file itself, so GREEN 2 returns `true` (`actual: true`, `expected: false`; 19
   pass / 1 fail).
8. **GREEN 3.** First line of `isEntryPoint`:
   ```js
   // realpathSync(undefined) resolves <cwd>/undefined, so an absent argv[1] must never reach it.
   if (!isNonEmptyString(argv1)) return false;
   ```
9. **GUARD — U7 empty and non-string argv1.** `Given argv1 empty or not a string, when
   isEntryPoint runs, then it returns false without throwing`: inside `withEntryFixture`,
   `assert.deepEqual([sut(moduleUrl, ''), sut(moduleUrl, 42)], [false, false])`. Passes
   after GREEN 3 (the guard short-circuits). Without the guard it would also pass:
   `realpathSync('')` returns cwd, not the module, and `realpathSync(42)` is `ENOENT`. It
   pins the no-throw contract (R3), not a mutant.
10. **REFACTOR.** Add the JSDoc above `isEntryPoint`:
    ```js
    /**
     * True when the module at moduleUrl is the process entry script named by argv1.
     * Both sides are real-pathed: Node real-paths the main module's URL but keeps argv[1]
     * as typed, and --preserve-symlinks-main keeps the URL symlinked instead.
     * @param {string} moduleUrl - the caller's import.meta.url
     * @param {string | undefined} argv1 - process.argv[1]
     * @returns {boolean}
     */
    ```
    Update the module header (:3-5) and the test file header (:3-4) as described in
    Context. Final suite: 21 / 0 fail. Final new lines: `isEntryPoint` JSDoc starts at
    :73, the function at :82, `realPathOrNull` ends at :95 (95 lines total).

### Gate

```
node --test engine/test/cli-io.test.js
L="$(mktemp)"; bash scripts/ci.sh > "$L" 2>&1; echo $?; tail -20 "$L"   # expect 0; on failure grep "$L" for the failing step only
```

Mutation check (advisory, run once after REFACTOR; expect 15 killed, 0 survived). The
override config goes in a mktemp dir, never in the worktree:

```
N="$(mktemp -d)"
node -e "const c=require('./engine/stryker.conf.json');c.tap.testFiles=['engine/test/cli-io.test.js'];c.mutate=['engine/src/cli-io.js'];require('fs').writeFileSync(process.argv[1],JSON.stringify(c))" "$N/stryker.narrow.json"
engine/node_modules/.bin/stryker run "$N/stryker.narrow.json" --mutate engine/src/cli-io.js:82-95
```

Adjust `82-95` if the final line numbers differ (the range is `isEntryPoint` through the
end of `realPathOrNull`). Any survivor: add the killing test. Do not add an
equivalent-mutant comment, because none is expected.

### Commit

`feat(engine): add a real-path isEntryPoint predicate to the shared cli module`

## Part 2 — Route all 24 bins through `isEntryPoint`, pinned by a symlink sweep

### Context

**What changes.** Every `engine/bin/*.js` replaces its
`process.argv[1] === fileURLToPath(import.meta.url)` guard with
`isEntryPoint(import.meta.url, process.argv[1])` (Part 1's export from the shared CLI
module, engine/src/cli-io.js, not edited here) and drops its now-unused node:url import.
The dispatch line is unchanged (ADR-066: `process.exit` stays in the bin). A new suite
spawns every bin through a symlink it creates and asserts the bin is loud on bad input.

**Files created / edited.**

- `engine/test/bin-entry-symlink.bin.test.js` (new, node:test ESM, ~65 lines; full text
  in TDD step 1).
- `engine/bin/*.js`: all 24 bins (no other file in the dir). Shipped shapes, all with
  the guard on line 4 (or line 5 after a node:fs import):

  | Shape | Bins | Lines |
  |---|---|---|
  | sync | adr-lint, config-resolve, contract-assemble, contracts-lint, dod-assert, hygiene-gate, init-config, init-land, intention-lint, manifest-lint, pipeline-lint, pipeline-resolve, plan-lint, promote-plan, prose-lint, readme-drift, stub-lint, tune-plan | 6 |
  | sync + stdin (keeps `import { readFileSync } from 'node:fs';` on :2) | filter-findings, init-emit, normalize-findings, run-state | 7 |
  | async (`process.exit(await main(...))`, main under ../src/observability/) | metrics-emit, usage-mine | 6 |

  Shipped adr-lint.js, the template every bin follows:
  ```
  #!/usr/bin/env node
  import { fileURLToPath } from 'node:url';
  import { main } from '../src/adr-lint-main.js';
  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
  }
  ```
  After the swap:
  ```
  #!/usr/bin/env node
  import { isEntryPoint } from '../src/cli-io.js';
  import { main } from '../src/adr-lint-main.js';
  if (isEntryPoint(import.meta.url, process.argv[1])) {
    process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
  }
  ```
  The `isEntryPoint` import path is `'../src/cli-io.js'` in every bin, including the two
  whose main lives under `../src/observability/`. Each bin uses `fileURLToPath` only in
  the guard (grep-verified), so its node:url import line is deleted outright. File modes
  (some bins are 755, some 644) must not change; the perl in-place edit in TDD step 2
  preserves them (verified: the clone's diff carried no mode lines).

**Read-only references.** engine/test/adr-lint.bin.test.js (spawn pattern:
`spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' })`, `mkdtempSync` +
`try/finally rmSync`). engine/test/source-hygiene.test.js (positive-pin pattern so an
enumeration cannot pass vacuously). No engine test pins the old guard text (grep over
engine/test: zero hits); the 22 existing per-bin suites (engine/test/<bin>.bin.test.js) reach the bins by
real path and stay green unchanged (R6).

**Pinned per-bin loud inputs (design § Pinned behaviour, physical path, argv
`['/nonexistent']`).** Every bin exits non-zero or writes output, except usage-mine (exit 0,
0 bytes, and it writes report.json + report.md into cwd). `usage-mine --source bogus` exits
1 with `usage-mine: unknown --source 'bogus' (…)` and writes nothing. Hence the one
override. adr-lint on `/nonexistent` exits 2 (usage line on stderr). Through a link today,
all 24 exit 0 with 0 bytes.

**Safety.** `rmSync(tmp, { recursive: true, force: true })` unlinks the `engine-link`
symlink and does not descend into the engine dir (verified: the clone's engine dir
survived every sweep run). Keep the link inside the per-test mkdtemp and never point
`rmSync` at the link target.

### TDD steps

1. **RED 1 — the sweep.** Create `engine/test/bin-entry-symlink.bin.test.js` with this
   exact text (validated in the clone):
   ```js
   /**
    * Every engine/bin bin, reached through a symlink this suite makes itself, runs its main on
    * bad input instead of exiting 0 in silence. The link is test-made so the check holds on a
    * host whose temp dir is not itself a symlink. Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
    */

   import { test } from 'node:test';
   import assert from 'node:assert/strict';
   import { spawnSync } from 'node:child_process';
   import { mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { dirname, join } from 'node:path';
   import { fileURLToPath } from 'node:url';

   const ENGINE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
   const BIN_DIR = join(ENGINE_DIR, 'bin');
   const LINK_NAME = 'engine-link';
   const DEFAULT_LOUD_ARGV = ['/nonexistent'];
   // usage-mine accepts a nonexistent path silently (exit 0, reports written into cwd); an unknown source is its loud input.
   const LOUD_ARGV_OVERRIDES = { 'usage-mine.js': ['--source', 'bogus'] };

   function binFileNames() {
     return readdirSync(BIN_DIR)
       .filter((name) => name.endsWith('.js'))
       .sort();
   }

   function spawnThroughLink(binName, argv) {
     const tmp = mkdtempSync(join(tmpdir(), 'craft-bin-link-'));
     try {
       symlinkSync(ENGINE_DIR, join(tmp, LINK_NAME));
       const binPath = join(tmp, LINK_NAME, 'bin', binName);
       return spawnSync(process.execPath, [binPath, ...argv], {
         cwd: tmp,
         input: '',
         encoding: 'utf8',
         env: { ...process.env, HOME: tmp },
       });
     } finally {
       rmSync(tmp, { recursive: true, force: true });
     }
   }

   test('Given engine/bin, when its *.js files are enumerated, then the set is non-empty and includes adr-lint.js', () => {
     const sut = binFileNames();

     assert.ok(sut.includes('adr-lint.js'), `enumerated: ${sut.join(', ')}`);
   });

   test('Given the adr-lint bin reached through a symlinked engine dir, when spawned with a nonexistent ADR dir, then it exits 2', () => {
     const sut = spawnThroughLink('adr-lint.js', DEFAULT_LOUD_ARGV);

     assert.equal(sut.error, undefined);
     assert.equal(sut.status, 2, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
   });

   for (const binName of binFileNames()) {
     test(`Given the ${binName} bin reached through a symlinked engine dir, when spawned with bad input, then it exits non-zero or writes output`, () => {
       const argv = LOUD_ARGV_OVERRIDES[binName] ?? DEFAULT_LOUD_ARGV;

       const sut = spawnThroughLink(binName, argv);

       assert.equal(sut.error, undefined);
       assert.ok(sut.status !== 0 || sut.stdout + sut.stderr !== '', `${binName} exited 0 with no output through the link`);
     });
   }
   ```
   Test roles:
   - S0 (`Given engine/bin, when its *.js files are enumerated, …`) is a GUARD. It passes
     on arrival because the enumeration reads a dir that exists. It is the positive pin
     that stops the per-bin loop from passing vacuously over an empty set.
   - S2 (`Given the adr-lint bin … then it exits 2`) is RED. Every bin still compares the
     logical argv[1] (`<tmp>/engine-link/bin/adr-lint.js`) with its real
     `import.meta.url`, so the guard is false and the spawn exits 0 with no output
     (`actual: 0`, `expected: 2`).
   - S1, one generated row per bin, is RED for all 24 for the same reason: each exits 0
     with 0 bytes, so the assertion message `<bin>.js exited 0 with no output through the
     link` fires.

   Expected: 1 pass / 25 fail. This is red on Linux too, because the suite builds its own
   link instead of relying on a symlinked temp dir.
2. **GREEN 1 — adr-lint.js.** Apply the substitution (template in Context) to
   engine/bin/adr-lint.js. One perl in-place edit does it and keeps the file mode:
   ```
   perl -0pi -e "s/import \{ fileURLToPath \} from 'node:url';\n//; s/(import \{ main \} from )/import { isEntryPoint } from '..\/src\/cli-io.js';\n\$1/; s/if \(process\.argv\[1\] === fileURLToPath\(import\.meta\.url\)\) \{/if (isEntryPoint(import.meta.url, process.argv[1])) {/" engine/bin/adr-lint.js
   ```
   Sweep: 3 pass / 23 fail. S0, S2 and adr-lint's S1 row pass; the other 23 S1 rows stay
   red, and GREEN 2 is what turns them green.
3. **GREEN 2 — the remaining 23 bins.** Run the same perl command over
   `$(ls engine/bin/*.js | grep -v adr-lint)`. Verify the edit:
   `grep -c isEntryPoint engine/bin/*.js` prints 2 for every file, and
   `grep -l 'fileURLToPath\|argv\[1\] ===' engine/bin/*.js` prints nothing. Spot-check
   one stdin bin (run-state.js keeps its `readFileSync` import on :2 and its `readStdin`
   dispatch) and one async bin (usage-mine.js keeps `await main`). Sweep: 26 / 0 fail,
   about 1 s.
4. **REFACTOR.** None expected. The bins are one-statement shims, and the sweep's two
   helpers are each under 20 lines. Confirm that
   `git diff --no-ext-diff --shortstat engine/bin` reads `24 files changed, 48
   insertions(+), 48 deletions(-)` and that no mode change appears in
   `git diff --no-ext-diff --summary engine/bin`.

### Gate

```
node --test engine/test/bin-entry-symlink.bin.test.js engine/test/cli-io.test.js engine/test/adr-lint.bin.test.js engine/test/run-state.bin.test.js engine/test/usage-mine.bin.test.js
L="$(mktemp)"; bash scripts/ci.sh > "$L" 2>&1; echo $?; tail -20 "$L"   # expect 0; on failure grep "$L" for the failing step only
```

Bin-level proof in a mktemp throwaway (`<worktree>` is the repo checkout). Every line must
now be loud through the link:

```
P="$(mktemp -d)" && ln -s "$(cd <worktree> && pwd -P)" "$P/link" && cd "$P"
bash link/scripts/readme-drift.sh /nonexistent; echo $?                        # expect 1 (was 0)
node link/engine/bin/adr-lint.js /nonexistent; echo $?                         # expect 2 (was 0)
node --preserve-symlinks-main link/engine/bin/adr-lint.js /nonexistent; echo $? # expect 2
node --input-type=module -e "await import('$P/link/engine/bin/adr-lint.js')"; echo $?  # expect 0, no output (import never runs main)
cd / && rm -rf "$P"
```

### Commit

`fix(bin): run main when an engine bin is reached through a symlinked path`
