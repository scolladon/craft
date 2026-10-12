# Plan — backlog-sweep-six-entries

> Source: design doc `docs/contributing/design/backlog-sweep-six-entries.md` · ADRs `485, 486, 487, 488`
> (all four take the design's recommended option: a whole-tree provenance test over shipped
> code in the source-hygiene suite, with all four current hits stripped (485); `adr.frozen` is
> rejected when its entries together cover every whole-tree probe or every markdown probe, at
> both guard sites (486); `cli-io.js` is the one home of the three shared predicates (487);
> `withAmbientEnv` moves to a shared test helper with its own suite (488). The options that
> were not chosen are not planned.)
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

## Plan shape (8 parts)

| # | Entry | Part | Size class | src delta | Files |
|---|---|---|---|---|---|
| 1 | E1 | Run the audience lint under the throwaway repo's git env | test-infra | none | 5 (2 new) |
| 2 | E2 | Strip provenance refs from shipped code and pin their absence | test + comment-only | comments in 3 shipped files | 4 |
| 3 | E3 | Declare code subjects for four adapter specs | docs-prose | none | 4 |
| 4 | E6 | Record the credential-rotation caveat | docs-prose | none | 2 |
| 5 | E4 (1/2) | Export `isDirectoryPath` and `isNonEmptyString` from cli-io | pure-module | engine/src (~+25 / −25) | 4 |
| 6 | E4 (2/2) | Import the stat predicates from cli-io in the remaining lint mains | pure-module (refactor) | engine/src (~+3 / −40) | 3 |
| 7 | E5 (1/2) | Set-level coverage in glob.js; flag it in the adr-lint sweep | pure-module | engine/src (~+30) | 4 |
| 8 | E5 (2/2) | Reject the same sets at manifest validation; document the rule | pure-module + doc | engine/src (~+15 / −5) | 3 |

Order is the design's: E1 → E2 → E3 → E6 → E4 → E5, docs and tests first, so each engine
part's Stryker run starts from a green base. The parts share one working tree and build on
each other in that order.

**Why E4 and E5 are two parts each.** The brief asked for one part per entry. Each of these
entries touches 7 files (E4: `cli-io` + its suite + 4 lint mains + `intention.js`; E5:
`glob` + `adr-lint-main` + `manifest` + their 3 suites + `customizing.md`). `plan-lint`
blocks any part whose Context declares more than 6 files (`PART_FILE_CEILING = 6` in
engine/src/plan-lint-main.js). Each split follows a seam that keeps every intermediate commit
green:

- E4: Part 5 adds the two new exports with their RED tests and switches the two modules
  that use only them (adr-lint-main, intention). Part 6 removes the remaining copies in the
  three lint mains, which already have a shared `isRegularFile` to import. Part 6 has no RED:
  it changes no behaviour, and the unedited suites of the three mains are its GUARD proof.
- E5: Part 7 adds the glob helpers and the adr-lint site (the pinned `exit 0` hole). Part 8
  adds the manifest site and the doc, which lands last because it describes both sites.

`plan-lint` warns that engine/src/adr-lint-main.js is declared in Parts 5 and 7. They stay
separate on purpose. Part 5 deletes two predicate copies and changes an import, with no
behaviour change. Part 7 adds a new finding. Merging them would put 8 files in one Context
and two unrelated changes in one commit.

**Handled elsewhere, not planned here:**

- The `README.md` receipt bump (designs, plans, ADRs): the orchestrator commits it as a
  separate docs commit right after this plan lands. `readme-drift` in `bash scripts/ci.sh` is
  red until then.
- The six BACKLOG.md flips (E3's memory half carries the `cae7206` evidence; record there why
  `backlog.md`, `execution.md`, the 7 poc records, the 5 PRD pages and the 2 guides stay
  subject-less): documentation phase. No part edits BACKLOG.md.
- The `CONCERN_FLOORS` re-derive in test/p22-memory.test.js: Done bookkeeping.

## Requirement coverage

| Req | Part | Proof |
|---|---|---|
| R1 | 1 | T1.1 (RED: `env` is `undefined`) |
| R2 | 1 | T1.2 (RED: exit 0 under the decoy) |
| R3, R4 | 2 | T2.1-T2.3 seam tests, T2.4 live test (RED: the 4 hits) |
| R5 | 3 | glob-match evidence command + intention-lint |
| R6 | 5, 6 | T5.1 (RED: missing exports) + the definition grep in Part 6 Gate |
| R7 | 7, 8 | T7.1-T7.3, T8.1-T8.2 + the doc diff |
| R8 | 4 | the two evidence greps |
| R9, R10 | — | handled elsewhere (see above) |

## Public-surface decision

`@craft/engine` is `"private": true` with no exports map, barrel, generated API report or
registry. Every new export below is **internal**: a cross-module export inside `engine/src`,
or a test helper under `test/helpers`. No surface gate applies beyond the suites each part
already runs.

| Symbol | Module | Decision |
|---|---|---|
| `isDirectoryPath(p)`, `isNonEmptyString(value)` | engine/src/cli-io.js | internal (consumers: adr-lint-main, intention, intention-lint-main) |
| `MARKDOWN_PROBE_PATHS`, `coversEveryPath(globs, probePaths)` | engine/src/glob.js | internal (consumers: adr-lint-main, manifest) |
| `withAmbientEnv(overrides, act)` | test/helpers/ambient-env.js | internal test helper (consumers: two root suites) |
| `createTmpGitRepo` return gains `env` | test/helpers/tmp-git-repo.js | internal test helper (consumer: docs-structure-lint suite) |
| `listProvenanceRefLines(cwd, env)` | test/source-hygiene.test.js | file-local, not exported |

## Decision candidates

None open. ADRs 485-488 ratify every load-bearing choice and the plan follows them. Details
the design left implicit are fixed here, not by a decision:

- Part 1 builds the decoy repo with `createTmpGitRepo([])`. It runs git under its own
  allowlisted env, so the suite needs no extra env function. Probed: RED exit 0, GREEN exit 2.
- Part 1 computes `pinnedGitEnv()` once inside `createTmpGitRepo` and returns that object.
  Each call builds a fresh object, so callers share no mutable state. It is not frozen
  (YAGNI).
- Part 2 returns raw `file:line:text` rows from `listProvenanceRefLines`. Unlike class D,
  echoing the text is safe, and the live assertion message lists the rows.
- Parts 7 and 8 pass `adr.frozen` to `coversEveryPath` unfiltered. `matchGlob` already
  returns `false` for a non-string pattern (probed: `['*', 1, '*/**']` still covers every
  probe), so the design's `typeof` filter would only add an equivalent mutant.
- Parts 7 and 8 report at most one set-level finding: none when any single entry is
  already whole-tree, else whole-tree before markdown. Each module keeps its own two
  message constants, the same way the per-entry message is held per module today.
- Part 8 extracts the `adr.frozen` coverage checks of `validateAdr` into a private
  `frozenCoverageErrors(frozen)`. `validateAdr` is 21 lines today, and the inline addition
  would push it further over the 20-line limit.

## Validation-phase notes

- **Mutation (Parts 5, 7, 8).** `engine/stryker.conf.json` mutates `engine/src/**/*.js` with
  the `tap` runner. Pass ONE comma-separated `--mutate` value; repeated flags silently drop
  all but the last. Take each range from the part's own commit:
  `git diff --no-ext-diff -U0 <part>~1 <part> -- <file>` (`+` hunks only; deletions and
  import lines carry no mutants). Shape, from the worktree root:

  ```
  npm --prefix engine run mutation -- --mutate "engine/src/cli-io.js:<a>-<b>,engine/src/cli-io.js:<c>-<d>"
  ```

  The dry run executes the whole `tap.testFiles` corpus. Narrow it with a throwaway copy of
  engine/stryker.conf.json whose `tap.testFiles` lists only the suites below (passed
  positionally: `npx --no-install --prefix engine stryker run <narrow.json> --mutate "…"`).
  Then hand-check every survivor against the full engine suite before writing a test.

  | Part | Files in `--mutate` | Narrowed `tap.testFiles` | Minimum instrumented mutants |
  |---|---|---|---|
  | 5 | engine/src/cli-io.js (the two new functions) | cli-io, adr-lint-main, intention, intention-lint-main suites | ≥ 10 (≥ 3 in `isDirectoryPath`: body block, catch block, `false` literal; ≥ 7 in `isNonEmptyString`: body block, `&&`, `===`, `!==`, `'string'`, `''`, `.trim()`) |
  | 6 | none: deletion and import hunks only | — | 0; skip the run, and say so in the report |
  | 7 | engine/src/glob.js (`MARKDOWN_PROBE_PATHS`, `coversEveryPath`) + engine/src/adr-lint-main.js (`frozenSetFindings`, the `resolveExemptSet` return, the `sweepHits` push) | glob, adr-lint-main, adr-lint.bin suites | ≥ 14 (glob ≥ 6: array, 3 strings, `every`, `some`; adr-lint ≥ 8: 3 conditions, `> 0`, 2 strings, `?? []`, body block) |
  | 8 | engine/src/manifest.js (`frozenCoverageErrors` and the `validateAdr` call line) | manifest, manifest-lint-main suites | ≥ 8 (3 conditions, `> 0`, 2 strings, 2 array literals) |

  A count below the minimum means the range is wrong, not that the code is clean. The one
  expected equivalent is the empty-catch mutant in `isDirectoryPath`. Part 5 annotates it
  in the house form, as `isRegularFile` already is.
- **Intention.** Parts 5 and 6 touch `intention.js` and `intention-lint-main.js`, and Part 7
  touches `glob.js`. All three are subjects of docs/contributing/specs/intention.md. The
  design doc carries the column-0 `INTENTION-WAIVE(docs/contributing/specs/intention.md)`
  line for them. The E3 evidence command (design, E3 section) should show only that waived
  row in `stale`, and `skipped` 4 shorter than on `main`.
- **Hygiene.** `node engine/bin/stub-lint.js --gate blocking -- <touched non-test source>` must
  be silent for each part (baseline: silent today on every file the plan touches). Markers
  are case-insensitive: TODO, FIXME, HACK, XXX, PLACEHOLDER, STUB. Keep them out of new
  comments. New prose in docs/contributing/specs and docs/guides/customizing.md is also
  scanned by source-hygiene classes A and B (no mutation-tool words, no `gh`/`github`).
- **Flake.** engine/test/findings.test.js:611 is a known sub-ms flake; rerun once.
- **Phase gate.** `bash scripts/ci.sh` exits 0 (after the orchestrator's receipt bump).

## Part 1 — Run the audience lint under the throwaway repo's git env

### Context

Files this part edits or creates:

- `test/helpers/ambient-env.js` (new, CommonJS, `'use strict'`): `withAmbientEnv(overrides,
  act)` moved byte-for-byte from test/tmp-git-repo.test.js:28-40, with its comment, and
  `module.exports = { withAmbientEnv };`.
- `test/ambient-env.test.js` (new): the eponymous suite. House convention: helper ↔ suite,
  as region-slice.js ↔ region-slice.test.js and tmp-git-repo.js ↔ tmp-git-repo.test.js.
  ci.sh's `run_suite process test` finds it with `find test -name '*.test.js'`, and no
  registry needs it.
- `test/tmp-git-repo.test.js`: delete the local `withAmbientEnv` (:28-40), add
  `const { withAmbientEnv } = require('./helpers/ambient-env');` next to the :8 require, and
  add T1.1. Keep `hermeticGitEnv`/`runHermeticGit` (:13-26): the suite deliberately does not
  use the helper's env for its own checks.
- `test/helpers/tmp-git-repo.js`: `createTmpGitRepo(relativeFilePaths)` (:29-52) returns
  `{ root, cleanup }` at :51. It becomes `{ root, env, cleanup }`, where
  `const env = pinnedGitEnv();` is computed once and also used by `runGit` (:39-44). Its
  value is `{ PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1' }`, with no `HOME` and no `GIT_DIR`/`GIT_WORK_TREE`/
  `GIT_INDEX_FILE`. `pinnedGitEnv` (:10-17) stays private. Extend the :19-28 header comment
  with one sentence: the returned `env` is for spawning a tool that must judge this repo
  rather than an ambient one.
- `test/docs-structure-lint.test.js`: `sut(dir, cwd)` at :92-99 runs
  `execFileSync('bash', [SCRIPT, '--audience', dir], { encoding: 'utf8', cwd })` with no
  `env`. It becomes `sut(dir, cwd, env)`, passing `{ encoding: 'utf8', cwd, env }`. Its three
  callers destructure `{ root, env, cleanup }` and pass `env`: :109 and :132
  (`sut(path.join(root, 'docs'), root, env)`) and :150 (`sut(path.join(linkedRoot, 'docs'),
  linkedRoot, env)`). Add T1.2 after the :148 test, and require the new helper next to the :8
  require. Append one sentence to the :88-91 comment above `sut`: the spawn runs under the
  repo helper's allowlisted env, so an ambient git location cannot redirect that toplevel.

Read-only background: scripts/docs-structure-lint.sh:20 resolves its root with
`git rev-parse --show-toplevel`, which follows an ambient `GIT_DIR`/`GIT_WORK_TREE`. The
`git -C "$root" ls-files` at :43 then fails inside a process substitution, `set -e` misses
it, and the loop sees zero entries, so the script exits 0. The fixture-dir `--audience` tests
(:41-71) are not built by `createTmpGitRepo` and stay as they are (design, Out of scope).

Probed in a throwaway (helper and script read from the worktree): three stray dirs under a
decoy built by `createTmpGitRepo([])` exit 0 with the inherited env (stderr: `fatal: … is
outside repository at '<tmp>/docs-structure-lint-…'`) and exit 2 under `pinnedGitEnv()`,
listing `a`, `b` and `c`.

### TDD steps

1. **RED T1.0** — create test/ambient-env.test.js (`require('./helpers/ambient-env')`), with
   probe key `const PROBE_KEY = 'CRAFT_AMBIENT_ENV_PROBE';`. Each test's Arrange asserts
   `!(PROBE_KEY in process.env)`, and a test that plants the key removes it in `finally`.
   - `Given a key absent from process.env, when withAmbientEnv sets it around act, then act sees the value and the key is absent afterwards`.
     Assert that `act` observed `'during'`, then `assert.strictEqual(PROBE_KEY in process.env, false)`.
     This pins deletion: the string `"undefined"` must not be left behind.
   - `Given a key present in process.env, when withAmbientEnv overrides it around act, then the original value is restored afterwards`
     → `process.env[PROBE_KEY] === 'original'`.
   - `Given an act that throws, when withAmbientEnv runs it, then the error propagates and the key is restored`
     → `assert.throws(() => sut({ [PROBE_KEY]: 'during' }, () => { throw new Error('boom'); }), /boom/)`,
     then `PROBE_KEY in process.env` is `false`.
   - `Given an act returning a value, when withAmbientEnv runs it, then it returns that value`
     → `assert.strictEqual(result, 'returned')`.
   - Expected RED: the suite fails to load with `Cannot find module './helpers/ambient-env'`.
2. **GREEN** — create test/helpers/ambient-env.js (the moved function). In
   test/tmp-git-repo.test.js, delete the local copy and require the helper.
3. **GUARD** — the two existing test/tmp-git-repo.test.js tests (:42, :65) pass unchanged
   through the shared helper. That proves a pure move.
4. **RED T1.1** (test/tmp-git-repo.test.js) —
   `Given a decoy GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE and an ambient HOME on the parent process, when createTmpGitRepo builds a repo, then the returned env carries only PATH and the pinned git config keys`.
   Arrange a decoy as the :42 test does (`fs.mkdtempSync(…'tmp-git-repo-decoy-')` +
   `runHermeticGit(decoyDir, 'init', '-q')`). The ambient is the three git-location keys plus
   `HOME: decoyDir`. Act: `repo = withAmbientEnv(ambient, () => sut([TRACKED_FIXTURE]))`.
   Assert:
   `assert.deepStrictEqual(repo.env, { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' })`.
   `finally`: `repo?.cleanup()` and remove the decoy.
   Expected RED: `deepStrictEqual` fails with actual `undefined`, because the helper returns
   no `env`.
5. **GREEN** — test/helpers/tmp-git-repo.js returns `{ root, env, cleanup }` as in Context.
6. **RED T1.2** (test/docs-structure-lint.test.js) —
   `Given a decoy GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE on the parent process, when --audience lints a repo with three stray top-level dirs, then it exits 2 and names each one`.
   Arrange: `const decoy = createTmpGitRepo([]);`,
   `const { root, env, cleanup } = createTmpGitRepo(['docs/a/note.md', 'docs/b/note.md', 'docs/c/note.md']);`.
   The ambient is `GIT_DIR: path.join(decoy.root, '.git')`, `GIT_WORK_TREE: decoy.root`,
   `GIT_INDEX_FILE: path.join(decoy.root, '.git', 'index')`. Act:
   `withAmbientEnv(ambient, () => sut(path.join(root, 'docs'), root, env))`. Assert:
   `result.status === 2` (message includes `result.stderr`), and for each of `a`, `b`, `c`,
   `assert.match(result.stderr, new RegExp('(^|\\n) {2}' + name + '($|\\n)'))`, the same
   anchor the :123-124 and :140-142 assertions use. `finally`: `cleanup()` and `decoy.cleanup()`.
   Expected RED: status 0. `sut` does not pass `env` yet, so the spawn inherits the decoy.
   The script's toplevel resolves to the decoy, `ls-files` fails silently, and no offender
   is reported.
7. **GREEN** — `sut(dir, cwd, env)` passes `env`, and the three existing callers pass
   theirs.
8. **GUARD** — the three existing `createTmpGitRepo` tests (:107, :130, :148) keep their
   verdicts (2, 2, 0) under the pinned env. Probed: the script needs only `PATH` and git, and
   no `HOME`.
9. **REFACTOR** — no provenance tokens in titles or comments, and no `process.env.X =
   undefined` anywhere (the helper owns that trap).

### Gate

```
node --test test/ambient-env.test.js test/tmp-git-repo.test.js test/docs-structure-lint.test.js
```

No Stryker run: `test/` is outside mutation scope.

### Commit

`fix(test): run the audience lint under the throwaway repo's git env`

## Part 2 — Strip provenance refs from shipped code and pin their absence

### Context

Files this part edits:

- `test/source-hygiene.test.js`: classes A-D today (489 lines).
  - Add the class E constants and `listProvenanceRefLines` after `listHomePathLeakLocations`
    (:115-120), before `runGrep` (:122). Mirror `listHomePathCandidateLines(cwd, env =
    process.env)` (:93-108): the same `withoutGitLocation(env)` (:89-91), the same
    `stdio: ['pipe', 'pipe', 'pipe']`, and the same `GIT_GREP_NO_MATCH` (:73) handling, where
    status 1 → `[]` and anything else is rethrown. Do NOT reuse `runGrep` (:122-141): its catch
    swallows grep errors.
  - `withThrowawayRepo(files, assertOnRepo)` (:439-449) writes flat files only (:443). Teach it
    to create parent dirs (`fs.mkdirSync(path.dirname(filePath), { recursive: true })` before
    each write) so the class E seam tests can plant engine/src/a.js. Class D callers pass
    flat names, so their behaviour is unchanged. `hermeticGitEnv()` (:435-437) is reused as is.
  - Add the class E tests at the end of the file, after the class D live test (:477-489).
    `GIT_NOT_A_REPOSITORY` (:74) is already declared.
- `adapters/pi/src/run.js`, line 96: ` * - DC-3: does NOT add --model/--provider to argv`
  → ` * - does NOT add --model/--provider to argv`.
- `adapters/pi/src/tool-call-hook.js`: :51 ` * DC-5: a not-yet-existing dir cannot be a
  symlink, so the nearest existing` → ` * A not-yet-existing dir cannot be a symlink, so the
  nearest existing`; :79 ` * Runtime symlink re-check for write tools (DC-5).` → ` * Runtime
  symlink re-check for write tools.`
- `scripts/worktree-teardown.sh`, line 52: the comment ends with "(P11 dogfood)." Replace
  that parenthesis with "(seen in a live teardown dogfood)." and leave the rest of the line
  unchanged.

These four lines are the complete hit list of the class E grep over shipped code today
(re-run at plan time with git 2.56.0, `git grep -n -i -P`). The three source edits are
comment-only, so there are no mutants and no Stryker run. No test pins the stripped
wording.

Read-only background: contracts/core.md:4 is the contract ("No provenance refs
(phase/ADR/backlog numbers) in source or test."). The house regex literal
`PROVENANCE_REF` appears in 10 adapter test files (e.g. adapters/pi/test/native-surface.test.js:15),
without the `DC-\d+` alternative. Over tests the same pattern hits 165 engine/test lines,
mostly fixture data, which is why the scope is shipped code only (ADR 485).

### TDD steps

1. **GUARD (prep)** — teach `withThrowawayRepo` to create parent dirs first. Without that,
   the T2.1/T2.2 fixtures fail with `ENOENT` before the function under test runs, and the
   RED would show the wrong reason. The class D seam tests (:451, :465) still pass: they use
   flat names, so `mkdirSync` on the repo root is a no-op.
2. **RED T2.1-T2.3** — add the three seam tests. Each uses `withThrowawayRepo`, binds
   `const sut = listProvenanceRefLines;`, and calls `sut(repo, hermeticGitEnv())`.
   - T2.1 `Given a git repo tracking a decision-candidate ref in engine source and a phase ref in an engine test, when listProvenanceRefLines scans it, then only the shipped-code line is reported`:
     files `{ 'engine/src/a.js': '// DC-3: x\n', 'engine/test/a.test.js': '// P29-1\n' }` →
     `assert.deepStrictEqual(result, ['engine/src/a.js:1:// DC-3: x'])`. The tokens are
     fixture data and must stay literal.
   - T2.2 `Given a shipped script naming the backlog file and a file-name pattern, when listProvenanceRefLines scans it, then nothing is reported`:
     files `{ 'scripts/x.sh': '# see BACKLOG.md\n# matches SC5-* files\n' }` →
     `assert.deepStrictEqual(result, [])`. This pins the two false-positive forms from the
     design's dry grep.
   - T2.3 `Given a directory outside any git repository, when listProvenanceRefLines scans it, then the git failure propagates`:
     a mkdtemp non-repo dir (shaped like the :295 test) →
     `assert.throws(() => sut(nonRepoDir, hermeticGitEnv()), { status: GIT_NOT_A_REPOSITORY })`.
   - Expected RED: T2.1 and T2.2 throw `ReferenceError: listProvenanceRefLines is not defined`.
     T2.3 fails its `{ status: 128 }` validation, because a `ReferenceError` has no `status`
     (probed: `git grep` outside a repository exits 128).
3. **GREEN** — add the class E block after `listHomePathLeakLocations`:

   ```js
   // Class E: phase, decision-record, part and backlog numbering in shipped code (contracts/core.md).
   // Shipped code only: tests, skills and templates carry such tokens as fixture data or as
   // deliberate decision citations that adr-lint checks.
   const PROVENANCE_REF_PATTERN = '\\b(ADR-?\\d+|P\\d+|Part\\s+\\d+|backlog\\s*#\\d+|DC-\\d+)\\b';
   const SHIPPED_CODE_PATHSPECS = [
     'engine/src', 'engine/bin', 'hooks', 'scripts',
     ':(glob)adapters/*/src/**', ':(glob)adapters/*/bin/**', ':(glob)adapters/*/extensions/**',
     ':(glob)adapters/*/hooks/**', ':(glob)adapters/*/plugins/**',
   ];

   function listProvenanceRefLines(cwd, env = process.env) {
     try {
       return execFileSync('git', ['grep', '-n', '-i', '-P', PROVENANCE_REF_PATTERN, '--', ...SHIPPED_CODE_PATHSPECS], {
         cwd,
         env: withoutGitLocation(env),
         encoding: 'utf8',
         stdio: ['pipe', 'pipe', 'pipe'],
       })
         .split('\n')
         .filter(Boolean);
     } catch (err) {
       if (err.status === GIT_GREP_NO_MATCH) return [];
       throw err;
     }
   }
   ```

   Probed in a throwaway: T2.1's repo yields exactly `engine/src/a.js:1:// DC-3: x`, a
   pathspec matching nothing is not an error, and a no-match exits 1. Every pathspec tracks
   files in the real tree (engine/src 83, engine/bin 24, hooks 5, scripts 18, adapter src 42,
   bin 1, extensions 1, hooks 4, plugins 5).
4. **RED T2.4** (live) — `Given the tracked tree, when shipped code is scanned for provenance refs, then none remain`:
   `const sut = listProvenanceRefLines; const result = sut(ROOT);` then
   `assert.deepStrictEqual(result, [], message)`, where `message` is the template literal
   "Source-hygiene FAIL — provenance refs in shipped code (class E) at:" followed by a
   newline and `result.join('\n')`, shaped like the class D live test's message (:485-488).
   Expected RED: `result` holds the 4 rows `adapters/pi/src/run.js:96:…`,
   `adapters/pi/src/tool-call-hook.js:51:…`, `adapters/pi/src/tool-call-hook.js:79:…` and
   `scripts/worktree-teardown.sh:52:…`.
5. **GREEN** — apply the four comment edits from Context.

### Gate

```
node --test test/source-hygiene.test.js test/worktree.test.js
(cd adapters/pi && node --test test/run.test.js test/tool-call-hook.test.js)
node engine/bin/stub-lint.js --gate blocking -- adapters/pi/src/run.js adapters/pi/src/tool-call-hook.js scripts/worktree-teardown.sh
! git grep -n -P '\bDC-\d+\b' -- ':(glob)adapters/*/src/**'   # passes when no DC ref remains
```

### Commit

`fix: strip provenance refs from shipped code and pin their absence`

## Part 3 — Declare code subjects for four adapter specs

### Context

Files this part edits. Each gains a line-1 frontmatter block prepended above its unchanged
`# … adapter spec` title (line 1 today), in the block-list form memory.md uses:

- `docs/contributing/specs/policy.md`: subjects engine/src/policy.js.
- `docs/contributing/specs/gate.md`: subjects engine/src/gates.js and engine/src/guards/**.
- `docs/contributing/specs/vcs.md`: subjects scripts/worktree-setup.sh and
  scripts/worktree-teardown.sh.
- `docs/contributing/specs/model.md`: subjects adapters/*/src/model-tier-map.js.

The subject paths stay plain text in this block on purpose: they are read-only, and
`plan-lint` would count a backticked glob as a file this part edits.

The glob is deliberate. Every tier map, including aider's and cursor's, implements the Model
port's `select`, so a change to one of them flagging model.md is a true signal. The flag is
advisory.

Read-only background: engine/src/intention-lint-main.js (the ci.sh gate) checks the subjects
**form** only, not that globs match files, so the glob-match evidence command below is this
part's proof. docs/contributing/specs/memory.md:1-4 is the house example of the shape
(already done in `cae7206`). backlog.md, execution.md, the 7 poc-record pages, the 5
PRD DESIGN pages and the 2 guides stay subject-less (reasons: design, E3 section). No
test pins the corpus's `skipped[]`. test/living-corpus.test.js:30-39 pins enumeration only,
which frontmatter does not change. test/model-retry-token.test.js slices model.md by bullet
anchors and scans its whole text for retired phrases; the prepended block holds neither, and
the gate runs that suite.

No false drift on this branch: every page that gains subjects is touched by the branch.

### TDD steps

Docs only, no RED (intention-lint validates form, and the change is frontmatter).

1. **GREEN** — prepend each block, for example:

   ```yaml
   ---
   subjects:
     - engine/src/gates.js
     - engine/src/guards/**
   ---
   ```

2. **GUARD (evidence)** — the glob-match command (read-only, from the worktree root) prints
   each page, glob and tracked-match count:

   ```bash
   node --input-type=module -e "
   import { parseSubjects } from './engine/src/intention-subjects.js';
   import { matchGlob } from './engine/src/glob.js';
   import { readFileSync } from 'node:fs';
   import { execFileSync } from 'node:child_process';
   const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
   for (const page of ['policy', 'gate', 'vcs', 'model']) {
     const p = 'docs/contributing/specs/' + page + '.md';
     for (const g of parseSubjects(readFileSync(p, 'utf8')) ?? []) console.log(p, g, tracked.filter((f) => matchGlob(f, g)).length);
   }"
   ```

   Expected counts: policy.js 1; gates.js 1, guards/** 2; worktree-setup.sh 1,
   worktree-teardown.sh 1; model-tier-map.js 6. Every count must be ≥ 1, and a page that
   prints no row has a malformed block. The command was checked at plan time against
   memory.md and intention.md.
3. **GUARD** — `node engine/bin/intention-lint.js $(bash scripts/living-corpus.sh)` prints
   `craft-intention: OK` (27 paths valid today).

### Gate

```
node engine/bin/intention-lint.js $(bash scripts/living-corpus.sh)
node --test test/living-corpus.test.js test/intention-lint-ci.test.js test/model-retry-token.test.js test/source-hygiene.test.js
```

plus the glob-match command from step 2 (every count ≥ 1).

### Commit

`docs(specs): declare code subjects for the policy, gate, vcs and model specs`

## Part 4 — Record the credential-rotation caveat

### Context

Files this part edits:

- `docs/contributing/specs/cursor-poc-record.md` (128 lines; its last section is `## Phase B
  — live-evidence rows` at :113).
  - Append a new `## Isolation-method caveat — the mtime proof has a blind spot` after the
    last section, using the record's own `##` level.
  - Append ` See *Isolation-method caveat* below.` to the end of the auth-seed bullet. The
    bullet's last line, :45, ends "…the auth is not a copyable file." This mirrors the
    codex pointer at codex-poc-record.md:307-308.
  - No row is falsified, so nothing is corrected in place (the ADR-320 dated-append rule).
- `adapters/README.md` (27 lines): insert a `## Probe records` section between :10 (end of
  the intro paragraph that sets the `<tool>-poc-record.md` convention) and :12
  (`## Bindings and guard postures`).

Read-only background: docs/contributing/specs/codex-poc-record.md:497-508 is the model
caveat, and :506-508 is its rule paragraph. The facts the cursor caveat may state are in
cursor-poc-record.md:40-45: the auth seed is a symlink
`ln -s ~/Library/Keychains $HOME_throwaway/Library/Keychains`, described as "read-only
login keychain; a token refresh writes back the operator's own token". At :48-50 the
isolation proof is `find ~/.cursor -type f -newer <marker>`. That window does not cover
`~/Library/Keychains`. Whether Cursor's refresh token rotates server-side was NOT probed,
so say so.

Constraints: cursor-poc-record.md sits in docs/contributing/specs, which source-hygiene
classes A and B scan, so no mutation-tool words and no `gh`/`github`. adapters/README.md is
prose-linted by ci.sh as a touched markdown file. Neither may carry ADR, phase or part numbers.
Name the codex record by file and section title only.

### TDD steps

Docs only, no RED.

1. **GREEN** — cursor caveat, appended (substance fixed; wording may be tightened, claims
   may not be added):

   ```markdown
   ## Isolation-method caveat — the mtime proof has a blind spot

   This record's isolation proof is an mtime-find over the real `~/.cursor`, and it reported
   zero filesystem writes there. The auth seed is outside that window: it is a symlink from the
   throwaway HOME to the operator's real `~/Library/Keychains`, so the probe reads and writes
   the operator's own login keychain. Any token refresh during a probe writes the operator's
   real keychain entry, and no filesystem check over `~/.cursor` can see it.

   Whether Cursor's refresh token rotates server-side on use was not probed. Assume it does.
   If it does, any copy of the pre-refresh token held elsewhere stops working once a probe
   refreshes it.

   Rule for any refresh of this record: mtime-find proves *filesystem* isolation only. Treat
   seeded credentials as consumed, keep probe windows short enough to stay inside the access
   token's lifetime, and expect a re-login may be needed afterwards.
   ```

2. **GREEN** — the standing rule in adapters/README.md:

   ```markdown
   ## Probe records

   A binding's live probe proves isolation with an mtime-find over the tool's real home. That
   proves *filesystem* isolation only. A probe that seeds a credential carrying a rotating
   refresh token, whether by copying it into a throwaway home or by sharing the store it lives
   in, records the credential-rotation caveat in its poc record, with the three mitigations:
   treat seeded credentials as consumed, keep probe windows inside the access token's
   lifetime, and expect a re-login afterwards. The worked example is the *Isolation-method
   caveat* section of [`codex-poc-record.md`](../docs/contributing/specs/codex-poc-record.md).
   ```

3. **GUARD (evidence)** — `grep -n "Isolation-method caveat" docs/contributing/specs/cursor-poc-record.md`
   shows the heading and the bullet pointer (2 lines). Keep the phrase
   "*Isolation-method caveat*" on one line when re-wrapping the bullet, or the count drops. `grep -n "^## Probe records" adapters/README.md`
   shows 1 line.

### Gate

```
grep -c "Isolation-method caveat" docs/contributing/specs/cursor-poc-record.md   # expect 2
grep -c "^## Probe records" adapters/README.md                                    # expect 1
node engine/bin/prose-lint.js --gate blocking -- adapters/README.md                # expect exit 0, no finding
node --test test/source-hygiene.test.js test/living-corpus.test.js
node engine/bin/intention-lint.js $(bash scripts/living-corpus.sh)
```

### Commit

`docs: record the credential-rotation caveat for cursor and every binding probe`

## Part 5 — Export isDirectoryPath and isNonEmptyString from cli-io

### Context

Files this part edits:

- `engine/src/cli-io.js` (47 lines). It exports `EXIT_OK`, `EXIT_ERR`, `isRegularFile(p)`
  (:19-25, with the :23 equivalent-mutant note), `fail(io, message)` and
  `findRepoRoot(startDir)`, and imports `statSync, existsSync` from `node:fs`.
  - Add `isDirectoryPath(p)` after `isRegularFile`, with body
    `try { return statSync(p).isDirectory(); } catch { return false; // equivalent mutant (empty catch): undefined is falsy — every caller reads the result as a boolean, same observable effect }`
    and a JSDoc saying it mirrors the bash `[ -d <path> ]` test.
  - Add `isNonEmptyString(value)` with body
    `return typeof value === 'string' && value.trim() !== '';` and JSDoc
    `@param {unknown} value` / `@returns {boolean}`.
  - Rewrite the :1-5 header, which names only the config-resolve/init-land/promote-plan
    mains. It should cover every engine main that imports the module and list what it holds:
    never-throw regular-file and directory predicates, a non-empty-string predicate, the
    stderr-and-fail helper, the repo-root walk and the two exit codes.
- `engine/test/cli-io.test.js` (ESM, `withTmp(fn)` helper at :15-22, section banners in the
  `// ─── isRegularFile ───` form). Add the new names to the :12 import and update the :1-5
  header's list of helpers.
- `engine/src/adr-lint-main.js`:
  - delete `isDirectoryPath` with its JSDoc (:73-88);
  - delete `isNonEmptyString` with its JSDoc (:462-468);
  - change :29 to `import { findRepoRoot, isDirectoryPath, isNonEmptyString } from './cli-io.js';`;
  - drop `statSync` from the :23 `node:fs` import, since its only use was the deleted
    `isDirectoryPath`.
  - Leave `isNonSymlinkFile` (:90-110, `lstatSync` on purpose; its comment forbids the merge)
    and `isNonEmptyStringListForm` (:229) byte-identical.
  - Callers that stay as they are: :531-533 and :542 (`isNonEmptyString`), :707
    (`!isDirectoryPath(adrDir)`).
- `engine/src/intention.js`: delete `isNonEmptyString` with its JSDoc (:108-114), and add
  `import { isNonEmptyString } from './cli-io.js';` after the :9-10 imports. The caller at
  :102 (`subjects.every(isNonEmptyString)`) and the :94-101 equivalent-mutant note stay. The
  :1-7 header's "Pure — no I/O" stays true: ADR 487 accepts the import edge to an
  fs-importing module, and no I/O is called.

The bodies are verbatim identical across all copies (design, E4 table). The trim-based
`isNonEmptyString` is the one being shared. Do not touch `isNonEmptyStringList`
(intention-lint-main.js:154), `isListOfNonEmptyStrings` (manifest.js:226) or the five
adapter copies under adapters/*/src (all out of scope).

### TDD steps

1. **RED T5.1** — in engine/test/cli-io.test.js, extend the :12 import with
   `isDirectoryPath, isNonEmptyString` and add two banner sections:
   - `Given a directory, when isDirectoryPath runs, then it returns true`
     (`withTmp((tmp) => { const dir = join(tmp, 'd'); mkdirSync(dir); assert.equal(sut(dir), true); })`);
   - `Given a regular file, when isDirectoryPath runs, then it returns false`;
   - `Given a missing path, when isDirectoryPath runs, then it returns false`;
   - `Given a non-blank string, when isNonEmptyString runs, then it returns true` (`'x'`);
   - `Given a whitespace-only or empty string, when isNonEmptyString runs, then it returns false`
     (`'  '` and `''`);
   - `Given a non-string value, when isNonEmptyString runs, then it returns false`
     (`1` and `undefined`; `1` also kills a dropped `typeof` clause, because `(1).trim` throws).
   - Expected RED: the whole suite fails to load with `SyntaxError: The requested module
     '../src/cli-io.js' does not provide an export named 'isDirectoryPath'`.
2. **GREEN** — add the two exports and rewrite the header in engine/src/cli-io.js.
3. **GREEN (dedupe)** — remove the copies in adr-lint-main.js and intention.js and import
   them as in Context.
4. **GUARD** — engine/test/adr-lint-main.test.js, engine/test/adr-lint.bin.test.js,
   engine/test/intention.test.js and engine/test/intention-self-governance.test.js stay
   green **unedited**. That is the behaviour-preservation proof.
5. **REFACTOR** — confirm with `grep -n "statSync" engine/src/adr-lint-main.js` that only
   `lstatSync` remains.

### Gate

```
(cd engine && node --test test/cli-io.test.js test/adr-lint-main.test.js test/adr-lint.bin.test.js test/intention.test.js test/intention-self-governance.test.js)
npm --prefix engine test
node engine/bin/stub-lint.js --gate blocking -- engine/src/cli-io.js engine/src/adr-lint-main.js engine/src/intention.js
git grep -n 'function isDirectoryPath\|function isNonEmptyString(' -- engine/src   # expect 3 rows: cli-io.js ×2, intention-lint-main.js isDirectoryPath (Part 6 removes it)
```

Stryker: see Validation-phase notes, row 5 (≥ 10 mutants in engine/src/cli-io.js).

### Commit

`refactor(engine): share isDirectoryPath and isNonEmptyString from cli-io`

## Part 6 — Import the stat predicates from cli-io in the remaining lint mains

### Context

Files this part edits. Each deletes its local predicate copies, JSDoc and
equivalent-mutant notes included, plus one following blank line:

- `engine/src/intention-lint-main.js`: delete :20-39 (the shared JSDoc at :20-24,
  `isRegularFile` :25-31, `isDirectoryPath` :33-39). Drop `statSync` from the :8 import
  (`readFileSync, readdirSync, statSync` → `readFileSync, readdirSync`); no other `statSync`
  call remains, and :130 mentions it only in a comment. Add
  `import { isRegularFile, isDirectoryPath } from './cli-io.js';` after :12. Callers stay at
  :107 and :131, and the :130 equivalent-mutant note stays true (`statSync(null)` throws
  inside the shared predicate too). Leave `isNonEmptyStringList` (:154) alone.
- `engine/src/manifest-lint-main.js`: delete :21-33 (`isRegularFile` and its JSDoc). Change
  the :1 import from `readFileSync, statSync` to `readFileSync`, and add
  `import { isRegularFile } from './cli-io.js';` after :6. Callers stay at :61, :78 and :92,
  and the :61 equivalent-mutant note stays true.
- `engine/src/plan-lint-main.js`: delete :58-69 (`isRegularFile` and its JSDoc). Change :32
  to `import { findRepoRoot, isRegularFile } from './cli-io.js';`. **Keep** `statSync` in
  the :29 import: `resolveDeclaredFile` still calls it at :173. The caller stays at :335.

Read-only background: every caller reads these predicates as booleans only (`!x`, `&&`,
ternary), so the shared `isRegularFile` (engine/src/cli-io.js:19-25) and the Part 5
`isDirectoryPath` are drop-in. Line numbers are as of plan time, and Part 5 does not touch
these three files.

### TDD steps

No RED: a pure dedupe with no behaviour change. The proof is the unedited suites.

1. **GREEN** — the three deletions and imports above.
2. **GUARD** — engine/test/intention-lint-main.test.js, intention-lint.bin.test.js,
   manifest-lint-main.test.js, manifest-lint.bin.test.js, plan-lint-main.test.js and
   plan-lint.bin.test.js stay green **unedited**.
3. **GUARD** — `bash scripts/plan-lint.sh docs/contributing/plan/backlog-sweep-six-entries.md`
   still exits 0. This is a live run of the touched plan-lint bin over this plan.

### Gate

```
(cd engine && node --test test/intention-lint-main.test.js test/intention-lint.bin.test.js test/manifest-lint-main.test.js test/manifest-lint.bin.test.js test/plan-lint-main.test.js test/plan-lint.bin.test.js)
npm --prefix engine test
node engine/bin/stub-lint.js --gate blocking -- engine/src/intention-lint-main.js engine/src/manifest-lint-main.js engine/src/plan-lint-main.js
git grep -n 'function isRegularFile\|function isDirectoryPath\|function isNonEmptyString(' -- engine/src   # expect only engine/src/cli-io.js (3 rows)
```

No Stryker run: only deletion and import hunks.

### Commit

`refactor(engine): import the stat predicates from cli-io in the lint mains`

## Part 7 — Set-level coverage in glob.js; flag it in the adr-lint sweep

### Context

Files this part edits:

- `engine/src/glob.js` (72 lines). It exports `matchGlob(path, pattern)` (never throws,
  `false` for a non-string pattern), `globsOverlap`, `PROBE_PATHS` (:54-60: README.md,
  Makefile, engine/src/adr-lint-main.js, docs/contributing/adr/001-example.md, a/b/c/d/e.txt)
  and `matchesEveryPath(glob)` (:70-72, per entry, which stays as it is). Append
  `MARKDOWN_PROBE_PATHS` and `coversEveryPath(globs, probePaths)` (code in TDD step 2).
- `engine/test/glob.test.js` (92 lines, ESM, `const sut = …` / AAA). Extend the :4 import.
- `engine/src/adr-lint-main.js` (Part 5 deletes about 25 lines above these sites, so locate
  by symbol):
  - the glob.js import (`matchGlob, matchesEveryPath`) gains `coversEveryPath`,
    `PROBE_PATHS` and `MARKDOWN_PROBE_PATHS`;
  - `resolveExemptSet(adrDirRel, manifest)`, frozen branch (plan-time :514-528), computes
    `universal` as today and returns
    `{ mode: 'frozen', globs: frozen, adrDirRel, universal, setLevel: frozenSetFindings(frozen, universal) }`;
  - a new private `frozenSetFindings(frozen, universal)` → `string[]`: `[]` when
    `universal.length > 0`; else `[FROZEN_SET_WHOLE_TREE_FINDING]` when
    `coversEveryPath(frozen, PROBE_PATHS)`; else `[FROZEN_EVERY_MARKDOWN_FINDING]` when
    `coversEveryPath(frozen, MARKDOWN_PROBE_PATHS)`; else `[]`. `frozen` is passed
    unfiltered, because adr-lint reads the manifest unvalidated and `matchGlob` already
    answers `false` for non-strings;
  - module constants
    `FROZEN_SET_WHOLE_TREE_FINDING = 'adr.frozen entries together exempt the whole tree, which disables the citation sweep'`
    and
    `FROZEN_EVERY_MARKDOWN_FINDING = 'adr.frozen exempts every markdown file, which disables the citation sweep where ADR citations live'`;
  - `sweepHits(output, exempt, escaped, ctx)` (plan-time :643-660): right after the
    `exempt.universal` loop, `findings.push(...(exempt.setLevel ?? []));`. The derived-set
    branch of `resolveExemptSet` returns no `setLevel`. The per-entry message is unchanged.
- `engine/test/adr-lint-main.test.js`: the file contains a non-UTF-8 byte, so use
  `grep -a`. Fixtures: `writeFixture(root, relPath, content)` :34, `gitTmpRoot()` :45,
  `stageAll(root)` :59 (git init + add), `writeCleanSupersession(root, targetId, superId)`
  :377, and `makeCaptureIo` from engine/test-helpers/capture-io.js. Add the new tests right
  after the per-entry test at :1607-1621, which stays unedited and pins that the per-entry
  message is unchanged.

Pinned at plan time with the shipped `matchGlob`: `['*', '*/**']` covers both probe sets;
`['**/*.md']` and `['*.md', '*/**/*.md']` cover only the markdown set; `['*']`,
`['docs/**']` and `[]` cover neither; `['*', 1, '*/**']` covers both. End to end, the real
adr-lint bin exits 0 with `craft-adr: OK` for `['*', '*/**']` (design, E5 table).

### TDD steps

1. **RED T7.1** (engine/test/glob.test.js) — import `coversEveryPath, PROBE_PATHS,
   MARKDOWN_PROBE_PATHS` and add:
   - `Given two entries that only together match every path, when coversEveryPath checks the whole-tree probes, then it returns true`
     → `sut(['*', '*/**'], PROBE_PATHS) === true`;
   - `Given a markdown-only glob, when coversEveryPath checks the markdown probes, then it returns true`
     → `sut(['**/*.md'], MARKDOWN_PROBE_PATHS) === true`;
   - `Given root and nested markdown globs, when coversEveryPath checks the markdown probes, then it returns true`
     → `sut(['*.md', '*/**/*.md'], MARKDOWN_PROBE_PATHS) === true`;
   - `Given a root-only glob, when coversEveryPath checks the markdown probes, then it returns false`
     → `sut(['*'], MARKDOWN_PROBE_PATHS) === false`;
   - `Given a scoped directory glob, when coversEveryPath checks the markdown probes, then it returns false`
     → `sut(['docs/**'], MARKDOWN_PROBE_PATHS) === false`;
   - `Given no globs, when coversEveryPath checks the whole-tree probes, then it returns false`
     → `sut([], PROBE_PATHS) === false`;
   - `Given a markdown-only glob, when coversEveryPath checks the whole-tree probes, then it returns false`
     → `sut(['**/*.md'], PROBE_PATHS) === false` (Makefile is unmatched).
   - Expected RED: the suite fails to load with `SyntaxError: … does not provide an export
     named 'coversEveryPath'`.
2. **GREEN** — append the two exports to engine/src/glob.js:

   ```js
   /** Representative markdown paths: a root page, a nested record, a deep page. */
   export const MARKDOWN_PROBE_PATHS = Object.freeze(['README.md', 'docs/contributing/adr/001-example.md', 'a/b/c/d/e.md']);

   /**
    * True when the globs together match every given probe — union semantics, not per entry.
    * @param {unknown[]} globs
    * @param {readonly string[]} probePaths
    * @returns {boolean}
    */
   export function coversEveryPath(globs, probePaths) {
     return probePaths.every((candidate) => globs.some((glob) => matchGlob(candidate, glob)));
   }
   ```
3. **RED T7.2** (engine/test/adr-lint-main.test.js) — two tests shaped like :1607:
   `const root = gitTmpRoot(); writeCleanSupersession(root, '001', '002');`, a
   `workflow.yml` manifest, `stageAll(root)`, then
   `sut([join(root, 'adr'), '--manifest', manifest], io)`.
   - `Given adr.frozen entries that only together match every path, when main runs, then the set is flagged as disabling the sweep`:
     manifest `'adr:\n  frozen:\n    - "*"\n    - "*/**"\n'` → `assert.equal(result, 2)` and
     stdout includes `'adr.frozen entries together exempt the whole tree, which disables the citation sweep'`.
   - `Given adr.frozen exempting every markdown file, when main runs, then it is flagged as disabling the sweep where citations live`:
     manifest `'adr:\n  frozen:\n    - "**/*.md"\n'` → `assert.equal(result, 2)` and stdout
     includes `'adr.frozen exempts every markdown file, which disables the citation sweep where ADR citations live'`.
   - Expected RED: `result` is 0 for both. No entry is whole-tree on its own, every citation
     sits in an exempt path, and the sweep reports OK.
4. **GUARD T7.3** — `Given adr.frozen with one whole-tree entry, when main runs, then only the per-entry finding is reported`:
   manifest `'adr:\n  frozen:\n    - "**"\n'` → `result === 2`, stdout includes
   `"adr.frozen entry '**' exempts the whole tree"`, and stdout includes neither
   `'together exempt'` nor `'every markdown file'`. It passes before the GREEN (no set-level
   finding exists yet). After the GREEN it kills a dropped `universal.length > 0` early
   return.
5. **GREEN** — `frozenSetFindings`, the constants, the `setLevel` field and the `sweepHits`
   push.
6. **GUARD** — the existing frozen tests (:483 `frozen/**`, :508 `frozen: []`, :1607) and
   engine/test/adr-lint.bin.test.js stay green unedited.

### Gate

```
(cd engine && node --test test/glob.test.js test/adr-lint-main.test.js test/adr-lint.bin.test.js)
npm --prefix engine test
node engine/bin/stub-lint.js --gate blocking -- engine/src/glob.js engine/src/adr-lint-main.js
```

Stryker: see Validation-phase notes, row 7 (one `--mutate` across the glob.js and
adr-lint-main.js `+` hunks, ≥ 14 mutants).

### Commit

`fix(engine): flag adr.frozen sets that together disable the citation sweep`

## Part 8 — Reject the same sets at manifest validation; document the rule

### Context

Files this part edits:

- `engine/src/manifest.js`: `validateAdr(adr, errors)` (:354-374, 21 lines). After
  `isListOfNonEmptyStrings(frozen)` (:365-368) it loops `matchesEveryPath(glob)` and pushes
  the per-entry template "adr.frozen entry '<glob>' exempts the whole tree, which disables
  the citation sweep" (:369-373). Replace that loop with `errors.push(...frozenCoverageErrors(frozen));` and add
  a private `frozenCoverageErrors(frozen)` → `string[]`:
  - per-entry errors first, with the existing message byte-identical;
  - if there are any, return them;
  - else `[FROZEN_SET_WHOLE_TREE_ERROR]` when `coversEveryPath(frozen, PROBE_PATHS)`;
  - else `[FROZEN_EVERY_MARKDOWN_ERROR]` when `coversEveryPath(frozen, MARKDOWN_PROBE_PATHS)`;
  - else `[]`.

  The two constants carry the same text as Part 7's adr-lint findings (`'adr.frozen entries
  together exempt the whole tree, which disables the citation sweep'`, `'adr.frozen exempts
  every markdown file, which disables the citation sweep where ADR citations live'`). The :12
  import (`matchesEveryPath`) gains `coversEveryPath, PROBE_PATHS, MARKDOWN_PROBE_PATHS`.
  `frozen` is already validated as a list of non-empty strings at :365.
- `engine/test/manifest.test.js`: the `adr.frozen` tests sit at :2552-2649 (docs/history/**
  accepted :2552, empty list :2563, non-list :2585/:2597, double-star :2609, the
  brace and question-mark forms :2621, root-only star accepted :2634, **/archive accepted
  :2642). Add the new tests after :2649, in
  the house shape `const sut = validateManifest; const result = sut({ adr: { frozen: [...] } });`.
  The existing tests match `'exempts the whole tree'`, which the new set-level text
  ("together exempt the whole tree") does not contain, so they stay valid unedited.
- `docs/guides/customizing.md`, the adr.frozen subsection (:187-199). The sentence at
  :195-198 that begins "A glob whose every segment is a wildcard" and ends "no advisory
  posture to fall back to." is wrong today: the root-only star is accepted, pinned at
  manifest.test.js:2634. Replace it with the semantic rule (text in TDD step 5). Keep the
  surrounding sentences, including the stderr exempt-set sentence. The page is in
  the class A/B scan (test/source-hygiene.test.js `SCANNED_PATHS`) and is prose-linted as a
  touched markdown file.

### TDD steps

1. **RED T8.1** (engine/test/manifest.test.js):
   - `Given adr.frozen entries that only together match every path, when validateManifest runs, then the set is rejected as a whole-tree exemption`:
     `frozen: ['*', '*/**']` → `result.ok === false` and an error includes `'together exempt the whole tree'`.
   - `Given adr.frozen exempting every markdown file, when validateManifest runs, then it is rejected`:
     `frozen: ['**/*.md']` → `result.ok === false` and an error includes `'exempts every markdown file'`.
   - `Given adr.frozen root and nested markdown globs, when validateManifest runs, then together they are rejected`:
     `frozen: ['*.md', '*/**/*.md']` → `ok === false` with the markdown error.
   - Expected RED: `result.ok` is `true` for all three (only per-entry checks exist).
2. **GUARD T8.2** —
   - `Given a single whole-tree adr.frozen entry, when validateManifest runs, then exactly one adr.frozen error is reported`:
     `frozen: ['**']` →
     `result.errors.filter((e) => e.startsWith('adr.frozen')).length === 1`. It passes
     today, and after the GREEN it kills a dropped early return.
   - `Given every pair of scoped adr.frozen globs, when validateManifest runs, then each pair is accepted`:
     `const SCOPED_FROZEN_GLOBS = ['docs/**', '**/archive', 'docs/contributing/design/**', '*', 'frozen/**'];`,
     two nested `for…of` loops over it (pairs include singletons), `sut({ adr: { frozen: [first, second] } }).ok === true`,
     with the pair in the message. This is the design's property lens. Probed: 0 of the 25
     pairs cover either probe set.
   - It passes before the GREEN (nothing is rejected at set level yet) and must still pass after.
3. **GREEN** — `frozenCoverageErrors` and the constants in engine/src/manifest.js.
4. **GUARD** — the existing :2552-2649 tests stay green unedited.
5. **GREEN (doc)** — replace the customizing.md sentence with:

   > A frozen list that would switch the sweep off is rejected, both at manifest validation
   > and by the sweep itself: one entry that matches every path of a representative probe set
   > (`**`, `**/*`, `{**,}`), entries that only together match every probe path
   > (`['*', '*/**']`), or entries that together match every markdown probe path, where ADR
   > citations live (`**/*.md`). A root-only `*` stays accepted. The gate deliberately has no
   > advisory posture to fall back to.

### Gate

```
(cd engine && node --test test/manifest.test.js test/manifest-lint-main.test.js test/manifest-lint.bin.test.js)
npm --prefix engine test
node engine/bin/stub-lint.js --gate blocking -- engine/src/manifest.js
node engine/bin/prose-lint.js --gate blocking -- docs/guides/customizing.md
node --test test/source-hygiene.test.js test/living-corpus.test.js
! grep -q "every segment is a wildcard" docs/guides/customizing.md   # passes once the old sentence is gone
```

Stryker: see Validation-phase notes, row 8 (≥ 8 mutants in engine/src/manifest.js).
Phase gate after this part: `bash scripts/ci.sh` exits 0.

### Commit

`fix(engine): reject adr.frozen sets that together exempt the tree or all markdown`
