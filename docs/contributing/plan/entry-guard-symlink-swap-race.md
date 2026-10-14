# Plan — entry-guard-symlink-swap-race

> Source: design doc `docs/contributing/design/entry-guard-symlink-swap-race.md` · ADRs `563, 564, 565, 566, 567, 568, 569`
> (563: `isEntryPoint(meta)` takes the caller's `import.meta`, every entry calls
> `if (isEntryPoint(import.meta)) {`; 564: `engines.node` is `^22.18.0 || >=24.2.0`, the helper
> returns `meta.main` and throws when it is not a boolean, the real-path comparison is deleted;
> 565: the race tests run with no `skip`; 566: race RED tests are `trust-hook --check` in the codex
> suite and `adr-lint` in a new engine/test/bin-entry-swap-race.bin.test.js; 567: one preload
> engine/test-helpers/swap-link-on-load.js built on `module.registerHooks`; 568: the error message is
> `craft needs Node ^22.18.0 || >=24.2.0 (import.meta.main); running vX`, the range is a private
> constant and the unit test reads it from engine/package.json; 569: CHANGELOG `### Removed` and
> `### Fixed` lines under `[Unreleased]`, and the floor-raising code commit carries `!`).
> Standing context, not re-opened: ADR-556 (one `isEntryPoint` export in the shared CLI module),
> ADR-561 (adapter entries import it directly), ADR-560 / ADR-562 (behavioural link pins),
> ADR-345 (hermetic subprocess env: built from scratch, never spread from `process.env`),
> ADR-066 / ADR-315 (thin shims: entries keep `process.exit`, stay outside Stryker `mutate`).
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

## Plan shape (4 parts)

| # | Part | Size class | src delta | Files |
|---|---|---|---|---|
| 1 | README corpus counts match the tree | docs-only | none | README.md (two lines) |
| 2 | `isEntryPoint` takes the caller's `import.meta` (behaviour-preserving) | src-suite | engine/src/cli-io.js helper signature; 26 entry call lines | cli-io.js, cli-io.test.js, 24 engine bins, two adapter entries |
| 3 | The guard answers with `import.meta.main`; Node floor raised (breaking, `!`) | src-suite | engine/src/cli-io.js helper body; engine/package.json `engines` | helper, unit suite, preload, two race suites, package.json |
| 4 | Floor echoes and changelog | docs + lockfile | none | CHANGELOG.md, CONTRIBUTING.md, engine/package-lock.json |

Order: strictly 1 → 2 → 3 → 4 (shared working tree; each builds on the previous).

**Why the code is two parts, not one.** The design sketched one code part. Its atomic set is
the helper, its unit suite, the 24 engine bins, two adapter entries, engine/package.json and two
race suites: eight declared files, over the plan-lint ceiling of six (a hard block). Part 2
therefore lands ADR-563's call shape first, with no behaviour change: the helper takes
`(meta, argv = process.argv)` and keeps today's real-path comparison, so every entry behaves
byte-identically and the race is still open. Part 3 then deletes the comparison and the `argv`
parameter, and its race tests are RED against Part 2's helper (the race reproduces on it, pinned
below). Every commit is green, and every RED lands in the same commit as the code that greens it.
This cut is decision candidate 1.

**Why each part is green alone.**
- The helper signature and the 26 call lines cannot land apart: after Part 2's helper change an
  old call `isEntryPoint(import.meta.url, process.argv[1])` passes a string, whose `.url` is
  undefined, so `fileURLToPath` throws; after Part 3's a string argument throws the floor error. Part 2 changes both in one commit.
- The race tests cannot land before Part 3's helper (red), so they land in Part 3.
- M3 reads `engines.node` from engine/package.json, so the `engines` edit lands in Part 3. It is
  also the floor raise, which ADR-569 marks with `!`: Part 3's commit carries it.
- The lockfile echo of `engines` (root `packages[""]`) is consistency, not a gate: `npm ci`
  accepts the stale echo (design § Moves with the floor, pinned). It rides in Part 4 to keep Part 3
  at six files.

Every edit below was applied, in order, to a throwaway `git clone` of the branch tip (`2b3dd86`,
before this plan existed, with a placeholder plan file so the plan count matches) with
engine/node_modules copied in, and checked there (Node 22.22.3, npm 12.2.0, macOS):

| Check | Result |
|---|---|
| Baseline, `bash scripts/ci.sh` | exit 1: engine 2894 pass / 1 fail, "Given no root argument, when main runs, then it resolves DEFAULT_ROOT against the real repo root and finds no unusable-input errors" |
| Baseline, `bash scripts/readme-drift.sh .` | exit 1: `design/ claims 65, tree holds 66`, `adr/ claims 562, tree holds 569` (plans: 64 before this plan, 65 with it) |
| Part 1 after GREEN | readme-drift exit 0, no output |
| Part 2 RED | cli-io.test.js 16 pass / 5 fail (U1-U4 `actual: false`, U7 `Missing expected exception.`) |
| Part 2 after GREEN | cli-io + bin-entry-symlink 47 / 0; codex trust-hook.bin 3 / 0; pi cli 10 / 0; full `ci.sh` exit 0, engine 2895 pass |
| Part 3 RED, engine race suite | 0 pass / 2 fail, both `expected: 2`, `actual: 0`, empty stdout and stderr |
| Part 3 RED, codex suite | 4 pass / 2 fail (repoint, unlink: `expected: 2`, `actual: 0`); the no-swap preload control passes |
| Part 3 RED, cli-io.test.js | 12 pass / 3 fail: M1 and M2 `ENOENT: no such file or directory, lstat '/x'`; M3 `The validation function is expected to return "true". Received false` |
| Part 3 helper GREEN, `engines` not yet edited | cli-io.test.js 14 / 1 (M3 still red: the message does not include `>=18`) |
| Part 3 after GREEN | cli-io + swap-race + bin-entry-symlink 43 / 0; codex trust-hook.bin 6 / 0; pi cli 10 / 0 |
| Part 3 Stryker, `mutate` narrowed to the constant line and `isEntryPoint`, `tap.testFiles` to cli-io.test.js | 8 mutants, 8 killed, 0 survived, 0 no coverage |
| Physical paths, before vs after (sealed env: node-only PATH, HOME and CODEX_HOME in a mkdtemp) | `trust-hook --check` 2, `trust-hook --bogus` 2, `adr-lint /nonexistent` 2, `craft-pi --help` 2; stdout and stderr byte-identical (`cmp`); CODEX_HOME never created |
| Part 4 | prose-lint over CHANGELOG.md and CONTRIBUTING.md exit 0; lockfile diff is one line |
| All four parts landed | `bash scripts/ci.sh` exit 0, engine 2891 pass (2895 − 9 deleted + 3 unit + 2 race) |

## Public-surface decision

No new exported symbol. `isEntryPoint` stays the one internal export of engine/src/cli-io.js
(ADR-556): not in engine/src/index.js, not in any README, guide, registry or generated report.
Its signature changes (Part 2: `(meta, argv = process.argv)`; Part 3: `(meta)`); its only callers
are the 26 entries edited in Part 2 and engine/test/cli-io.test.js. `SUPPORTED_NODE_RANGE` is
module-private (ADR-568). The preload engine/test-helpers/swap-link-on-load.js exports nothing;
it lives under `test-helpers/`, which `scripts/ci.sh` keeps out of stub-lint and Stryker never
mutates. engine/stryker.conf.json is unchanged: engine/test/bin-entry-swap-race.bin.test.js joins
the dry run automatically through the `engine/test/**/*.test.js` glob (two spawns, about 50 ms
each); the codex suite is not in `tap.testFiles` and stays out.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | How the atomic code change fits the plan-lint ceiling (6 declared files per part) | (a) Part 2 lands ADR-563's call shape behaviour-preservingly (`isEntryPoint(meta, argv = process.argv)`, today's comparison kept), Part 3 lands ADR-564 with the RED race tests; (b) one code part declaring 8 files, which needs plan-lint's `--file-ceiling` lifted for this plan; (c) the fix part without the race tests, then a part landing them as GUARD entries, their RED proven only in a throwaway | (a) | (a) keeps every commit green, every RED in the commit that greens it, and plan-lint's default gate. Its cost: an interim `argv` parameter that lives one commit, and nine unit tests edited in Part 2 then deleted in Part 3 (27 changed lines, pinned). (b) fails the plan gate as configured. (c) commits the race tests after the fix, so no committed history shows them red |

Details the design left implicit, fixed here without a decision:

- Part 2's interim helper reads argv through an injectable `argv` array, not an `argv1` string
  with a default: with `argv1 = process.argv[1]`, a test passing `undefined` would get the default,
  and U8 ("argv1 undefined") would pass without exercising the guard. An array lets U8 pass
  `[process.execPath]`, whose index 1 really is undefined.
- At Part 3's RED step M2 is RED, not the GUARD the design expected. The design assumed today's
  two-argument helper, where `sut({ main: false })` sees an undefined argv1 and returns false.
  Against Part 2's helper the `argv` default is the test process's argv, whose index 1 is the test
  file, so the module side real-paths `/x/m.js` and throws ENOENT (pinned).
- W3 (the preload loaded, its trigger never loading) is a GUARD in the codex suite. It shows the
  preload does not perturb a run by itself, so the RED in W1 and W2 is the swap's doing.
- The repoint target's decoy file (an empty bin of the same name) is created inside each test's
  own temp dir, so after the swap argv[1] real-paths to a different existing file, the upgrade
  shape the design pinned.
- The CHANGELOG `### Removed` group goes above `### Fixed` (Keep a Changelog order: Added,
  Changed, Deprecated, Removed, Fixed, Security). test/release-discipline.test.js checks only the
  `## [...]` headings, so neither group is pinned by a test.
- No part edits BACKLOG.md. The orchestrator flips the open entry "`isEntryPoint` fails open when
  argv[1]'s symlink is swapped after the module loads." (BACKLOG.md :180) to delivered in the
  documentation phase.
- Plan-lint warns (advisory) that Parts 2 and 3 both declare engine/src/cli-io.js (both also edit
  engine/test/cli-io.test.js). That overlap is intended: it is decision candidate 1.

## Validation-phase notes

- Mutation: engine/src/cli-io.js is in `mutate`. After Part 3 the helper and its constant produce
  8 mutants, all killed by M1-M3 (design § Test strategy kill map, re-pinned on this plan's exact
  code). Use per-hunk scope as `.claude/workflow.md` documents (one comma-joined `--mutate`). The
  M3 assertion against engine/package.json is what kills `SUPPORTED_NODE_RANGE` → `""`; asserting
  against an exported constant would leave that mutant alive (design, pinned).
- The race tests need `module.registerHooks` and `import.meta.main`. Both exist on every Node
  ADR-564 supports; on Node 20 the suites fail, which ADR-565 accepts.
- Expected, not a finding: `node engine/bin/adr-lint` (extensionless) now runs `main`; on an
  unsupported Node every entry exits 1 with the named error (design § Unsupported Node, pinned on
  20.20.2); on Node 18 the bins that import engine/src/glob.js die earlier with a `SyntaxError`.
- ADR-047's reason for pinning Stryker 8.7.1 (the `>=18` floor) is void after Part 3; moving
  Stryker is out of scope.

## Part 1 — README corpus counts match the tree

### Context

File edited: `README.md` (repo root). Only bracketed numbers on two lines change.

Lines 200-201, section `## craft builds craft`, the receipts sentence. Today:

```
receipts: [65 design docs](docs/contributing/design/), [64 parted plans](docs/contributing/plan/),
[562 ADRs](docs/contributing/adr/), and [raw telemetry for 25 runs](docs/contributing/metrics-baseline.report.json)
```

After (expected, with this plan committed):

```
receipts: [66 design docs](docs/contributing/design/), [65 parted plans](docs/contributing/plan/),
[569 ADRs](docs/contributing/adr/), and [raw telemetry for 25 runs](docs/contributing/metrics-baseline.report.json)
```

readme-drift (scripts/readme-drift.sh → engine/bin/readme-drift.js, corpus-counts sub-guard)
compares each bracketed number with the file count of the linked directory. Set each number to the
"tree holds" count `bash scripts/readme-drift.sh .` reports at edit time. With this plan committed
the tree holds 66 design docs, 65 plans and 569 ADRs. Take the numbers from the tool, not from this
text: a later commit may add a file. The tool prints one line per drifting directory
(`readme-drift: corpus-counts: <dir> claims <n>, tree holds <m>`); a directory it does not name
already matches. Leave the telemetry count (25 runs) and every other byte of the two lines alone:
it counts runs in docs/contributing/metrics-baseline.report.json, which this change does not
refresh.

Tests that read these numbers (all run by ci.sh; none is edited):
engine/test/readme-drift-main.test.js:304 "Given no root argument, when main runs, then it
resolves DEFAULT_ROOT against the real repo root and finds no unusable-input errors", and
test/readme-drift.test.js:98 "Given the live repo tree, when readme-drift runs, then it exits 0
with no findings". .github/workflows/ci.yml also runs `bash scripts/readme-drift.sh`.

Public surface: none (prose only).

### TDD steps

No code delta and no new test.

1. RED (existing tests, already failing) — the two tests named in Context and
   `bash scripts/readme-drift.sh .` exiting 1. `ci.sh` stops at the engine suite (2894 pass /
   1 fail) on the first one. They fail because the README claims 65 design docs, 64 plans and
   562 ADRs while the tree holds 66, 65 and 569.
2. GREEN — run `bash scripts/readme-drift.sh .`, set the README numbers to the "tree holds"
   values it prints, re-run it: exit 0, no output.
3. GUARD — prose-lint and test/source-hygiene.test.js pass: the edit changes digits only.
   `git diff --no-ext-diff README.md` shows exactly two `-` lines (200 and 201).

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

## Part 2 — `isEntryPoint` takes the caller's `import.meta`

### Context

**What changes.** ADR-563's call shape lands with no behaviour change. The helper takes the
caller's `import.meta` (it reads `meta.url`) and an injectable argv array that defaults to
`process.argv`; the real-path comparison stays exactly as it is. All 26 entries call
`isEntryPoint(import.meta)`. The nine existing unit tests switch to the new argument shape and keep
their meaning. Part 3 later deletes the comparison, the `argv` parameter and these nine tests.

**Files.**

- `engine/src/cli-io.js` (94 lines). Today, lines 73-85:

  ```js
  /**
   * True when the module at moduleUrl is the process entry script named by argv1.
   * Both sides are real-pathed: Node real-paths the main module's URL but keeps argv[1]
   * as typed, and --preserve-symlinks-main keeps the URL symlinked instead.
   * @param {string} moduleUrl - the caller's import.meta.url
   * @param {string | undefined} argv1 - process.argv[1]
   * @returns {boolean}
   */
  export function isEntryPoint(moduleUrl, argv1) {
    // realpathSync(undefined) resolves <cwd>/undefined, so an absent argv[1] must never reach it.
    if (!isNonEmptyString(argv1)) return false;
    return realPathOrNull(argv1) === realpathSync(fileURLToPath(moduleUrl));
  }
  ```

  Replace lines 73-85 with the code in TDD step 2. Lines 1-72 (header, imports at :8-10,
  `EXIT_OK`, `EXIT_ERR`, `isRegularFile`, `isDirectoryPath`, `isNonEmptyString`, `fail`,
  `findRepoRoot`) and `realPathOrNull` at :87-94 stay byte-identical.
- `engine/test/cli-io.test.js` (260 lines, node:test `test()` style, `const sut = isEntryPoint;`
  in each test). The `isEntryPoint` section is :144-253: fixture `withEntryFixture(fn)` :147-154
  (real/m.js plus `link → real` in a `withTmp` dir), `urlOf(path)` :156-158, then nine tests
  U1-U9 at :160, :170, :180, :190, :202, :214, :224, :234, :243. Imports :9
  (`mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync`), :11 `pathToFileURL`, :15
  `withTempCwd` all stay in this part.
- `engine/bin/*.js` (24 files). Each has exactly one line
  `if (isEntryPoint(import.meta.url, process.argv[1])) {`: line 4, except line 5 in
  filter-findings.js, init-emit.js, normalize-findings.js and run-state.js. Nothing else in a bin
  changes.
- `adapters/codex/bin/trust-hook.js`: the same literal at :54. The import at :13
  (`'../../../engine/src/cli-io.js'`, ADR-561) and the guard body :55-63 stay.
- `adapters/pi/src/cli.js` (9 lines): the same literal at :4. :1-3 and :5-9 stay (shebang, import,
  the EQUIVALENT-MUTANT comment, dispatch, `process.exit`).

**Pinned behaviour.** No observable change: production calls pass no `argv`, so the helper reads
`process.argv[1]` exactly as the call sites did. Through a link, by physical path and when
imported, every entry's exit code and bytes are unchanged (pinned by the three entry suites below
and the physical-path `cmp` in the plan header). A leftover old-shape call crashes loudly:
`meta.url` is undefined on a string, so `fileURLToPath(undefined)` throws `ERR_INVALID_ARG_TYPE`.

**Read-only references.** engine/test/bin-entry-symlink.bin.test.js (26 tests: every bin through
a test-made link), adapters/codex/test/trust-hook.bin.test.js (3 tests),
adapters/pi/test/cli.test.js (10 tests). All three stay green unchanged and are this part's
behaviour guard. engine/src/intention.js imports `isNonEmptyString` (unchanged).

**Style.** Given/When/Then titles, AAA bodies, `sut` variable, named constants, no provenance
numbers (ADR/phase/backlog) in code, titles or comments.

### TDD steps

1. **RED — the unit tests take the new argument shape.** In engine/test/cli-io.test.js replace
   `urlOf` (:156-158) with:

   ```js
   function metaOf(path) {
     return { url: pathToFileURL(path).href };
   }

   function argvNaming(argv1) {
     return [process.execPath, argv1];
   }
   ```

   Then rewrite each call (titles, fixture and assertions unchanged):

   | Test | Call today | Call after |
   |---|---|---|
   | U1-U6 (:164, :174, :184, :196, :208, :218) | `sut(urlOf(<module>), <argv1>)` | `sut(metaOf(<module>), argvNaming(<argv1>))` |
   | U7 (:230) | `sut(urlOf(modulePath), join(modulePath, 'x'))` | `sut(metaOf(modulePath), argvNaming(join(modulePath, 'x')))` |
   | U8 (:238) | `sut(urlOf(join(process.cwd(), 'undefined')), undefined)` | `sut(metaOf(join(process.cwd(), 'undefined')), [process.execPath])` |
   | U9 (:247-249) | `const moduleUrl = urlOf(…)`; `[sut(moduleUrl, ''), sut(moduleUrl, 42)]` | `const meta = metaOf(…)`; `[sut(meta, argvNaming('')), sut(meta, argvNaming(42))]` |

   Targeted run: `(cd engine && node --test test/cli-io.test.js)`. Expected 16 pass / 5 fail:
   U1-U4 fail `expected: true`, `actual: false`; U7 fails `Missing expected exception.`. Today's
   helper receives an array as `argv1`, `isNonEmptyString` rejects it, and it returns false.
   GUARD at this step: U5, U6, U8 and U9 pass, for the same reason (false is their expected
   answer). They regain their real meaning at GREEN.

2. **GREEN — helper and the 26 call lines, one step.** Replace engine/src/cli-io.js :73-85 with:

   ```js
   /**
    * True when the module described by meta is the process entry script named by argv[1].
    * Both sides are real-pathed: Node real-paths the main module's URL but keeps argv[1]
    * as typed, and --preserve-symlinks-main keeps the URL symlinked instead.
    * @param {{ url: string }} meta - the caller's import.meta
    * @param {readonly unknown[]} [argv] - the process argv; argv[1] names the entry script
    * @returns {boolean}
    */
   export function isEntryPoint(meta, argv = process.argv) {
     const argv1 = argv[1];
     // realpathSync(undefined) resolves <cwd>/undefined, so an absent argv[1] must never reach it.
     if (!isNonEmptyString(argv1)) return false;
     return realPathOrNull(argv1) === realpathSync(fileURLToPath(meta.url));
   }
   ```

   Then edit the 26 call lines in one mechanical pass, from the worktree root:

   ```bash
   git grep -l 'isEntryPoint(import.meta.url, process.argv\[1\])' -- engine/bin adapters \
     | xargs sed -i.bak 's/isEntryPoint(import\.meta\.url, process\.argv\[1\])/isEntryPoint(import.meta)/'
   find engine/bin adapters -name '*.bak' -delete
   ```

   (`sed -i.bak` works with both BSD and GNU sed.) Targeted runs:
   `(cd engine && node --test test/cli-io.test.js test/bin-entry-symlink.bin.test.js)` → 47 pass /
   0 fail; `(cd adapters/codex && node --test test/trust-hook.bin.test.js)` → 3 / 0;
   `(cd adapters/pi && node --test test/cli.test.js)` → 10 / 0.

3. **GUARD — no residue, no extra edit.**
   `git grep -n 'isEntryPoint(import.meta.url' -- engine adapters` prints nothing;
   `git grep -c 'isEntryPoint(import.meta)' -- engine/bin adapters | wc -l` prints `26`;
   `git diff --no-ext-diff --stat` lists 28 files (26 entries, the helper, its test).

REFACTOR: none.

Do NOT break an entry in the worktree to watch a guard test fail.

### Gate

Run from the worktree root:

```bash
LOG="$(mktemp -d)"
(cd engine && node --test test/cli-io.test.js test/bin-entry-symlink.bin.test.js > "$LOG/engine.log" 2>&1); echo "exit=$?"; grep -nE '^not ok|^# (pass|fail)' "$LOG/engine.log"
(cd adapters/codex && node --test test/trust-hook.bin.test.js > "$LOG/codex.log" 2>&1); echo "exit=$?"; grep -nE '^ *not ok|^# (pass|fail)' "$LOG/codex.log"
(cd adapters/pi && node --test test/cli.test.js > "$LOG/pi.log" 2>&1); echo "exit=$?"; grep -nE '^ *not ok|^# (pass|fail)' "$LOG/pi.log"
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: every exit 0; engine `# pass 47`, codex `# pass 3`, pi `# pass 10`, each `# fail 0`;
`ci.sh` grep prints nothing (engine suite 2895 pass). Never commit on a red gate.

### Commit

`refactor: pass the caller's import.meta to isEntryPoint at every entry`

## Part 3 — The guard answers with `import.meta.main`; the Node floor rises

### Context

**What changes.** `isEntryPoint(meta)` returns `meta.main` when it is a boolean and throws the
floor error otherwise; argv[1] is never read, so a link repointed or removed after Node loaded the
entry cannot change the answer. engine/package.json declares `^22.18.0 || >=24.2.0`. A committed
preload swaps a test-made link while the entry's dependencies load; five tests use it: four race
tests, RED against Part 2's helper, and one no-swap control. Three unit tests replace the nine real-path tests.

**Files.**

- `engine/src/cli-io.js` (after Part 2). Imports :8 `import { statSync, existsSync, realpathSync } from 'node:fs';`
  and :10 `import { fileURLToPath } from 'node:url';`. After this part: :8 drops `realpathSync`,
  :10 is deleted (no other use of either in the file). Add the private constant
  `const SUPPORTED_NODE_RANGE = '^22.18.0 || >=24.2.0';` at module scope after
  `export const EXIT_ERR = 1;`, separated by one blank line. Replace the whole Part 2
  `isEntryPoint` (doc comment + function) with the code in TDD step 3, and delete
  `realPathOrNull` (its only caller goes). The header :1-6 and every other export stay
  byte-identical; `isNonEmptyString` stays (exported, engine/src/intention.js uses it).
- `engine/test/cli-io.test.js` (after Part 2). Delete the whole `isEntryPoint` section body
  (fixture `withEntryFixture`, `metaOf`, `argvNaming`, U1-U9) between the
  `// ─── isEntryPoint ───…` banner and the `// ─── constants ───…` banner, and put M1-M3 there
  (TDD step 2). Imports: :9 gains `readFileSync`; :11 (`pathToFileURL`, used only by `metaOf`)
  and :15 (`withTempCwd`, used only by U8) are deleted. `mkdirSync`, `symlinkSync`,
  `writeFileSync`, `withTmp`, `makeCaptureIo` stay (the `isRegularFile` / `isDirectoryPath` /
  `fail` tests use them). Expected after: 15 tests.
- `engine/package.json` :5-7 `"engines": { "node": ">=18" }` → `"node": "^22.18.0 || >=24.2.0"`.
- `engine/test-helpers/swap-link-on-load.js` (NEW, ADR-567). Full content in TDD step 1.
- `adapters/codex/test/trust-hook.bin.test.js` (85 lines, `describe`/`it`). Constants :17-23,
  `withSandbox(fn)` :25-37 (sealed env frozen at :32: `{ PATH: <tmp>/bin, HOME: tmp, CODEX_HOME: <tmp>/codex-home }`),
  `spawnNode(argv, { tmp, env })` :39-41, describe :43-85 with three `it`s (link `--bogus`,
  physical `--bogus`, importer script). Extended in TDD step 1; the three existing `it`s stay
  byte-identical.
- `engine/test/bin-entry-swap-race.bin.test.js` (NEW, ADR-566). Full content in TDD step 1.
  scripts/ci.sh `run_suite engine` finds it by `find -name '*.test.js'`; it joins the Stryker dry
  run through the engine/stryker.conf.json `tap.testFiles` glob.

**Read-only references.** adapters/codex/src/trust-hook-main.js: with `--check`, no `codex` on
PATH and an empty CODEX_HOME, main writes exactly
`trust-hook: app-server process error: spawn codex ENOENT\n` to stderr, nothing to stdout, and the
bin exits 2 (`EXIT_REFUSED`). engine/src/adr-lint-main.js: /nonexistent → exit 2 with its usage
line on stderr. engine/test/bin-entry-symlink.bin.test.js: house style for the engine race file
(`ENGINE_DIR`, one mkdtemp per spawn, `try/finally rmSync`); it is NOT edited and its unsealed env
stays as is.

**Pinned behaviour (design § Pinned, re-probed on Part 2's helper).** Swap triggers are URL
suffixes: /adapters/codex/src/trust-hook-main.js for trust-hook, /engine/src/adr-lint-main.js
for adr-lint. Before GREEN, a repoint or an unlink at that point gives exit 0 with 0 bytes on both
streams, for both entries. After GREEN: trust-hook `--check` exits 2 with the ENOENT line above,
adr-lint exits 2. With the trigger set to a suffix that never loads, the preload changes nothing
(exit 2, same bytes). CODEX_HOME is never created and nothing new appears under HOME.
`module.registerHooks` prints no deprecation warning (unlike `module.register` on Node 26).

**Hermeticity (user-mandated).** Each race spawn gets a fresh mkdtemp holding: bin/ with only a
`node` symlink (the PATH), HOME = the temp dir, CODEX_HOME = a not-yet-existing path inside it, the
link, and the decoy. The env object is built from scratch, never spread from `process.env`. The
preload is passed as `--import <absolute path>` (accepted on 22.22.3, pinned). Race tests spawn the
entry by path; importer tests elsewhere stay importer scripts, never `node -e` (it leaves argv[1]
undefined, so it would pass vacuously).

**Style.** Given/When/Then titles, AAA comments, `sut` for the spawn result or the function under
test, named constants, no provenance numbers in code, titles or comments.

### TDD steps

1. **RED — race tests (ADR-566) on the preload (ADR-567).**

   Create engine/test-helpers/swap-link-on-load.js:

   ```js
   /**
    * Test-only preload, loaded with `node --import <this file>`. When a module whose URL ends with
    * CRAFT_SWAP_ON loads, it swaps the symlink at CRAFT_SWAP_LINK: CRAFT_SWAP_MODE `repoint` points
    * it at CRAFT_SWAP_TO, `unlink` removes it. Node has resolved and loaded the entry script by then
    * but has not evaluated it, which reproduces an install dir swapped while an entry starts.
    */

   import { registerHooks } from 'node:module';
   import { renameSync, symlinkSync, unlinkSync } from 'node:fs';

   const { CRAFT_SWAP_LINK: link, CRAFT_SWAP_ON: trigger, CRAFT_SWAP_MODE: mode, CRAFT_SWAP_TO: target } = process.env;

   // A rename over the old link is atomic, so the link is never observed missing mid-repoint.
   function repoint() {
     const staged = `${link}.next`;
     symlinkSync(target, staged);
     renameSync(staged, link);
   }

   function unlink() {
     unlinkSync(link);
   }

   const SWAPS = Object.freeze({ repoint, unlink });

   // Each module URL loads once, so the trigger fires at most once per process.
   registerHooks({
     load(url, context, nextLoad) {
       if (url.endsWith(trigger)) SWAPS[mode]();
       return nextLoad(url, context);
     },
   });
   ```

   An unknown mode throws `SWAPS[mode] is not a function` inside the hook, so the spawn fails
   loudly; nothing is caught.

   Create engine/test/bin-entry-swap-race.bin.test.js:

   ```js
   /**
    * The adr-lint bin, reached through a symlinked engine dir that is repointed or removed while its
    * main module loads, still runs its main instead of exiting 0 in silence. A preload swaps the link
    * at that moment. The environment is built from scratch: only node on PATH, throwaway HOME and
    * CODEX_HOME, and the link inside the test's own temp dir. Given/When/Then titles,
    * Arrange-Act-Assert bodies, sut variable.
    */

   import { test } from 'node:test';
   import assert from 'node:assert/strict';
   import { spawnSync } from 'node:child_process';
   import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { dirname, join } from 'node:path';
   import { fileURLToPath } from 'node:url';

   const ENGINE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
   const SWAP_PRELOAD = join(ENGINE_DIR, 'test-helpers', 'swap-link-on-load.js');
   const LINK_NAME = 'engine-link';
   const ELSEWHERE_NAME = 'elsewhere';
   const BIN_NAME = 'adr-lint.js';
   const LOUD_ARGV = ['/nonexistent'];
   const SWAP_TRIGGER = '/engine/src/adr-lint-main.js';
   const EXIT_USAGE = 2;

   // bin/ holds only node; elsewhere/bin/adr-lint.js is an empty decoy, so a repointed link names a real, different file.
   function sealedSandbox(tmp, mode) {
     mkdirSync(join(tmp, 'bin'));
     symlinkSync(process.execPath, join(tmp, 'bin', 'node'));
     mkdirSync(join(tmp, ELSEWHERE_NAME, 'bin'), { recursive: true });
     writeFileSync(join(tmp, ELSEWHERE_NAME, 'bin', BIN_NAME), '');
     symlinkSync(ENGINE_DIR, join(tmp, LINK_NAME));
     return Object.freeze({
       PATH: join(tmp, 'bin'),
       HOME: tmp,
       CODEX_HOME: join(tmp, 'codex-home'),
       CRAFT_SWAP_LINK: join(tmp, LINK_NAME),
       CRAFT_SWAP_ON: SWAP_TRIGGER,
       CRAFT_SWAP_MODE: mode,
       CRAFT_SWAP_TO: join(tmp, ELSEWHERE_NAME),
     });
   }

   function spawnThroughSwappedLink(mode) {
     const tmp = mkdtempSync(join(tmpdir(), 'craft-bin-swap-'));
     try {
       const env = sealedSandbox(tmp, mode);
       const binPath = join(tmp, LINK_NAME, 'bin', BIN_NAME);
       return spawnSync(process.execPath, ['--import', SWAP_PRELOAD, binPath, ...LOUD_ARGV], {
         cwd: tmp,
         env,
         input: '',
         encoding: 'utf8',
       });
     } finally {
       rmSync(tmp, { recursive: true, force: true });
     }
   }

   test('Given adr-lint reached through a symlinked engine dir repointed while its main module loads, when spawned with a nonexistent ADR dir, then it exits 2', () => {
     // Arrange / Act
     const sut = spawnThroughSwappedLink('repoint');

     // Assert
     assert.equal(sut.error, undefined);
     assert.equal(sut.status, EXIT_USAGE, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
   });

   test('Given adr-lint reached through a symlinked engine dir removed while its main module loads, when spawned with a nonexistent ADR dir, then it exits 2', () => {
     // Arrange / Act
     const sut = spawnThroughSwappedLink('unlink');

     // Assert
     assert.equal(sut.error, undefined);
     assert.equal(sut.status, EXIT_USAGE, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
   });
   ```

   Extend adapters/codex/test/trust-hook.bin.test.js:
   - Header :2-3: "runs its main when reached through a symlinked adapter dir and stays inert when
     imported as a module" → "runs its main when reached through a symlinked adapter dir, even one
     repointed or removed while it starts, and stays inert when imported as a module". Rewrap the
     doc comment to the file's ~100-column width; its other sentences stay.
   - After `const IMPORTER_NAME = 'importer.mjs';` (:23) add:

     ```js
     const SWAP_PRELOAD = join(ADAPTER_DIR, '..', '..', 'engine', 'test-helpers', 'swap-link-on-load.js');
     const ELSEWHERE_NAME = 'elsewhere';
     const CHECK_ARGV = ['--check'];
     const SWAP_TRIGGER = '/adapters/codex/src/trust-hook-main.js';
     const NEVER_LOADED_TRIGGER = '/never-loaded.js';
     const EXPECTED_CHECK_STDERR = 'trust-hook: app-server process error: spawn codex ENOENT\n';
     ```

   - Comment :25 → two lines: `// A fresh throwaway per call: bin/ holds only node, codex-link points at the real adapter dir,`
     and `// and elsewhere/bin/trust-hook.js is an empty decoy a repointed link can name.`
   - In `withSandbox`, after `symlinkSync(ADAPTER_DIR, join(tmp, LINK_NAME));` (:31) add:

     ```js
         mkdirSync(join(tmp, ELSEWHERE_NAME, 'bin'), { recursive: true });
         writeFileSync(join(tmp, ELSEWHERE_NAME, 'bin', 'trust-hook.js'), '');
     ```

   - Between `spawnNode` (:39-41) and the `describe` (:43) add:

     ```js
     // --check through the link, with the preload swapping the link when a module ending in trigger loads.
     function spawnCheckWithSwap({ mode, trigger }, { tmp, env }) {
       const swapEnv = Object.freeze({
         ...env,
         CRAFT_SWAP_LINK: join(tmp, LINK_NAME),
         CRAFT_SWAP_ON: trigger,
         CRAFT_SWAP_MODE: mode,
         CRAFT_SWAP_TO: join(tmp, ELSEWHERE_NAME),
       });
       const argv = ['--import', SWAP_PRELOAD, join(tmp, LINK_NAME, 'bin', 'trust-hook.js'), ...CHECK_ARGV];
       return spawnNode(argv, { tmp, env: swapEnv });
     }
     ```

     (`...env` spreads the sandbox's own from-scratch env, not `process.env`.)
   - Inside the describe, after the importer `it` (ends :84), append W3, W1, W2:

     ```js
       it('Given the swap preload with a trigger that never loads, when trust-hook is spawned with --check through the link, then it reports the codex spawn failure with exit 2', () => {
         // Arrange / Act
         const sut = withSandbox((sandbox) => spawnCheckWithSwap({ mode: 'unlink', trigger: NEVER_LOADED_TRIGGER }, sandbox));

         // Assert
         assert.equal(sut.error, undefined);
         assert.equal(sut.status, EXIT_REFUSED, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
         assert.equal(sut.stderr, EXPECTED_CHECK_STDERR);
         assert.equal(sut.stdout, '');
       });

       it('Given the adapter-dir link repointed while trust-hook loads its main module, when spawned with --check, then it still runs main and exits 2, never 0', () => {
         // Arrange / Act
         const sut = withSandbox((sandbox) => spawnCheckWithSwap({ mode: 'repoint', trigger: SWAP_TRIGGER }, sandbox));

         // Assert
         assert.equal(sut.error, undefined);
         assert.equal(sut.status, EXIT_REFUSED, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
         assert.equal(sut.stderr, EXPECTED_CHECK_STDERR);
         assert.equal(sut.stdout, '');
       });

       it('Given the adapter-dir link removed while trust-hook loads its main module, when spawned with --check, then it still runs main and exits 2, never 0', () => {
         // Arrange / Act
         const sut = withSandbox((sandbox) => spawnCheckWithSwap({ mode: 'unlink', trigger: SWAP_TRIGGER }, sandbox));

         // Assert
         assert.equal(sut.error, undefined);
         assert.equal(sut.status, EXIT_REFUSED, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
         assert.equal(sut.stderr, EXPECTED_CHECK_STDERR);
         assert.equal(sut.stdout, '');
       });
     ```

   Targeted RED runs and expected failures:
   - `(cd engine && node --test test/bin-entry-swap-race.bin.test.js)` → 0 pass / 2 fail, each
     `expected: 2`, `actual: 0`, message `stdout:  stderr: ` (both empty). Part 2's helper
     real-paths argv[1] after the swap: the repointed link names the empty decoy, the unlinked one
     is ENOENT, both compare unequal to the real module path, so main never runs and the bin exits 0.
   - `(cd adapters/codex && node --test test/trust-hook.bin.test.js)` → 4 pass / 2 fail: the
     repoint and unlink `it`s fail `expected: 2`, `actual: 0` for the same reason. For `--check`,
     that 0 reads as "trusted".
   - GUARD at this step: W3 passes (no swap happens, so today's guard runs main through the
     link), and the three existing `it`s pass.

2. **RED — unit tests (ADR-563, 564, 568).** In engine/test/cli-io.test.js delete the section
   body as described in Context, fix the imports, and put this under the
   `// ─── isEntryPoint ───…` banner:

   ```js
   const ENGINE_PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
   const MODULE_URL = 'file:///x/m.js';

   test('Given an import.meta whose main is true, when isEntryPoint runs, then it returns true', () => {
     const sut = isEntryPoint;

     const result = sut({ main: true, url: MODULE_URL });

     assert.equal(result, true);
   });

   test('Given an import.meta whose main is false, when isEntryPoint runs, then it returns false', () => {
     const sut = isEntryPoint;

     const result = sut({ main: false, url: MODULE_URL });

     assert.equal(result, false);
   });

   test('Given an import.meta without a boolean main, when isEntryPoint runs, then it throws an error naming the supported Node range', () => {
     const sut = isEntryPoint;

     const act = () => sut({ url: MODULE_URL });

     assert.throws(act, (error) => error.message.includes(ENGINE_PACKAGE.engines.node));
   });
   ```

   Keep one blank line between the last test and the `// ─── constants ───…` banner. Targeted run
   `(cd engine && node --test test/cli-io.test.js)` → 12 pass / 3 fail. M1 and M2 fail with
   `ENOENT: no such file or directory, lstat '/x'`: Part 2's helper defaults `argv` to the test
   process's argv (index 1 is the test file, a non-empty string) and then real-paths the module
   side `/x/m.js`, which does not exist. M3 fails with
   `The validation function is expected to return "true". Received false` (caught error: the same
   ENOENT, whose message does not contain the range).

3. **GREEN — the helper.** In engine/src/cli-io.js apply the import edits from Context, add
   `SUPPORTED_NODE_RANGE`, delete `realPathOrNull`, and replace `isEntryPoint` with:

   ```js
   /**
    * True when the module described by meta is the process entry script. Node fixes
    * import.meta.main when it loads the entry, so a symlink in argv[1] repointed or removed
    * afterwards cannot change the answer. Node versions without it are refused, never guessed.
    * @param {{ main?: boolean }} meta - the caller's import.meta
    * @returns {boolean}
    * @throws {Error} when meta.main is not a boolean (Node outside SUPPORTED_NODE_RANGE)
    */
   export function isEntryPoint(meta) {
     if (typeof meta.main !== 'boolean') {
       throw new Error(`craft needs Node ${SUPPORTED_NODE_RANGE} (import.meta.main); running ${process.version}`);
     }
     return meta.main;
   }
   ```

   `(cd engine && node --test test/cli-io.test.js)` → 14 pass / 1 fail: M3 still fails
   (`Received false`) because engine/package.json still says `>=18`, which the message does not
   contain. The race suites are green from here.

4. **GREEN — the floor.** engine/package.json `"node": ">=18"` → `"node": "^22.18.0 || >=24.2.0"`.
   Do not touch engine/package-lock.json here (Part 4). Targeted runs:
   `(cd engine && node --test test/cli-io.test.js test/bin-entry-swap-race.bin.test.js test/bin-entry-symlink.bin.test.js)`
   → 43 pass / 0 fail; `(cd adapters/codex && node --test test/trust-hook.bin.test.js)` → 6 / 0;
   `(cd adapters/pi && node --test test/cli.test.js)` → 10 / 0.

5. **GUARD — no residue.** `grep -nE 'realpathSync|fileURLToPath|realPathOrNull|process\.argv' engine/src/cli-io.js`
   prints nothing (the doc comment's `argv[1]` is prose, hence `process\.argv`); `grep -n 'SUPPORTED_NODE_RANGE' engine/src/cli-io.js` shows the declaration and
   one use, and no `export` on it; `grep -nE 'urlOf|metaOf|argvNaming|withEntryFixture|withTempCwd|pathToFileURL' engine/test/cli-io.test.js`
   prints nothing.

REFACTOR: none.

Do NOT break the helper in the worktree to watch a test fail; the RED steps above are the proof,
and the orchestrator re-proves them in a throwaway.

### Gate

Run from the worktree root:

```bash
LOG="$(mktemp -d)"
(cd engine && node --test test/cli-io.test.js test/bin-entry-swap-race.bin.test.js test/bin-entry-symlink.bin.test.js > "$LOG/engine.log" 2>&1); echo "exit=$?"; grep -nE '^not ok|^# (pass|fail)' "$LOG/engine.log"
(cd adapters/codex && node --test test/trust-hook.bin.test.js > "$LOG/codex.log" 2>&1); echo "exit=$?"; grep -nE '^ *not ok|^# (pass|fail)' "$LOG/codex.log"
(cd adapters/pi && node --test test/cli.test.js > "$LOG/pi.log" 2>&1); echo "exit=$?"; grep -nE '^ *not ok|^# (pass|fail)' "$LOG/pi.log"
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: every exit 0; engine `# pass 43`, codex `# pass 6`, pi `# pass 10`, each `# fail 0`;
`ci.sh` grep prints nothing (engine suite 2891 pass). Never commit on a red gate.

Mutation spot-check (optional, throwaway copy of the config only, never committed): a Stryker
config whose `mutate` is the `SUPPORTED_NODE_RANGE` line and the `isEntryPoint` lines of
engine/src/cli-io.js and whose `tap.testFiles` is `["engine/test/cli-io.test.js"]`, run from the
repo root with `engine/node_modules/.bin/stryker run <config>`, reports 8 killed, 0 survived.

### Commit

`fix(engine)!: decide entry points by import.meta.main and require node ^22.18.0 || >=24.2.0`

## Part 4 — Floor echoes and changelog

### Context

**What changes.** The other declarations of the contributor Node floor agree with
engine/package.json (design R7, § Moves with the floor), and the changelog records the breaking
floor raise and the fix (ADR-569).

**Files.**

- `engine/package-lock.json`: :15-17, root `packages[""]`, echoes `"engines": { "node": ">=18" }`.
  Regenerate, do not hand-edit: `(cd engine && npm install --package-lock-only)` (npm 12.2.0,
  pinned). Expected diff: exactly one line, :16 `"node": ">=18"` → `"node": "^22.18.0 || >=24.2.0"`.
  It does not touch engine/node_modules. Its audit summary output is noise; ignore it. It needs
  the npm registry or cache; if neither is reachable, hand-edit :16 to the same bytes (the pinned
  diff above) and say so in the handback.
- `CONTRIBUTING.md` :13. Today: "Put Node 22, `jq` and `shellcheck` on your PATH. `zsh` is
  optional: CI and the devcontainer install it,". Replace only the first sentence with "Put Node
  22.18 or later on the 22 line (or 24.2 or later), `jq` and `shellcheck` on your PATH." No test
  reads this line.
- `CHANGELOG.md` :8-12 today:

  ```
  ## [Unreleased]

  ### Fixed
  - The plugin's hooks run when the plugin is installed under a path containing a space.
  - The `craft-pi` bin and the codex trust-hook run when reached through a symlink, such as npm's global bin link, instead of exiting 0 with no output.
  ```

  Insert a `### Removed` group between `## [Unreleased]` and `### Fixed`, and append one line to
  `### Fixed` (exact text in TDD step 2).

**Not edited (design table, deliberately).** .github/workflows/ci.yml `node-version: '22'` and
.devcontainer/devcontainer.json `javascript-node:22` both resolve to 22.23.3, inside the range;
test/devcontainer.test.js reads the CI value with `Number(…)`, so a `'22.18'` spelling would break
it. Adapter package.json files declare no `engines`. Dated records under docs/contributing quote
`>=18` and stay. BACKLOG.md is the orchestrator's.

**Read-only references.** test/release-discipline.test.js checks only the `## [...]` headings and
link references, not the `###` groups. prose-lint runs over touched *.md outside the provenance
directories, so it covers both edited docs.

### TDD steps

No code delta and no new test.

1. **Lockfile.** Run the regeneration command from Context. GUARD:
   `git diff --no-ext-diff engine/package-lock.json | grep -cE '^[-+][^-+]'` prints `2` (one `-`,
   one `+`).
2. **Docs.** Apply the CONTRIBUTING.md edit. In CHANGELOG.md, after `## [Unreleased]` and its
   blank line, insert:

   ```
   ### Removed
   - Support for Node 18, 20, 22.0-22.17, 23 and 24.0-24.1, which lack `import.meta.main`. Every craft entry now exits 1 on them with an error naming the supported range `^22.18.0 || >=24.2.0`.

   ```

   and append to `### Fixed`, after the `craft-pi` line:

   ```
   - Every engine bin, the codex trust-hook and the `craft-pi` bin run when the symlink they were reached through is repointed or removed while they start, instead of exiting 0 with no output, which `trust-hook --check` reported as trusted.
   ```

   GUARD: `node engine/bin/prose-lint.js CHANGELOG.md CONTRIBUTING.md` exits 0;
   `(node --test test/release-discipline.test.js)` from the repo root passes.

REFACTOR: none.

### Gate

Run from the worktree root:

```bash
LOG="$(mktemp -d)"
git diff --no-ext-diff engine/package-lock.json | grep -cE '^[-+][^-+]'
node engine/bin/prose-lint.js CHANGELOG.md CONTRIBUTING.md; echo "exit=$?"
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: `2`, prose-lint exit 0, `ci.sh` exit 0 and the grep prints nothing. Never commit on a
red gate.

### Commit

`chore: record the raised node floor in the changelog, contributing guide and lockfile`
