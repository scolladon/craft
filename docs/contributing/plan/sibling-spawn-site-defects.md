# Plan — sibling-spawn-site-defects

> Source: design doc `docs/contributing/design/sibling-spawn-site-defects.md` · ADRs none
> (the decisions phase was a no-op and the design's recommendations stand: DC-1 (a) a required
> leading `cwd` on `listTrackedFiles`, both callers pass `ROOT`, T1 lives in
> `test/source-hygiene.test.js`; DC-2 (a) the pinned env omits `HOME`, T3 included; DC-3 (a)
> the consumer's `sut` spawn stays out of scope)
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

| # | Part | Delta | Files |
|---|---|---|---|
| 1 | `listTrackedFiles` lets a git failure throw | one function (−5 lines), two call sites, one constant, one test | `test/source-hygiene.test.js` |
| 2 | `createTmpGitRepo` runs git under a pinned env | one function + one `env` key, a new eponymous suite (2 tests) | `test/helpers/tmp-git-repo.js`, `test/tmp-git-repo.test.js` |

Two parts: two unrelated spawn sites in different files, each with its own RED and its own
fix. Each part is a test-infra fix that carries the red test proving it, so neither is a
test-only part. Part 2 does not depend on Part 1, but they share one working tree and run in
order.

Every edit below was applied to a throwaway `git clone` of the branch tip (`b863a74`) and
checked there:

| Check | Before the GREEN | After the GREEN |
|---|---|---|
| `node --test test/source-hygiene.test.js` | T1 `not ok`: `Missing expected exception.` (99 others pass) | 100 / 0 fail |
| `node --test test/tmp-git-repo.test.js` (shipped helper) | T2 `not ok`: `.git` absent (`expected: true, actual: false`); T3 `not ok`: `actual: ''` | 2 / 0 fail |
| `node --test test/source-hygiene.test.js test/tmp-git-repo.test.js test/docs-structure-lint.test.js` | — | 112 / 0 fail |
| `bash scripts/ci.sh` (both parts committed, README count bumped, see the README trap below) | — | exit 0 |

Hand mutants, each run against the final suites (one edit at a time):

| Mutant | Killed by |
|---|---|
| `listTrackedFiles` keeps `cwd: ROOT` and ignores its `cwd` parameter | T1 |
| `pinnedGitEnv()` spreads `...process.env` first | T2 and T3 |
| `pinnedGitEnv()` adds `HOME: process.env.HOME` | T3 |

## Public-surface decision

No new exported symbol. Each name below is internal:

- `GIT_NOT_A_REPOSITORY` is a file-local constant in `test/source-hygiene.test.js`.
- `listTrackedFiles` stays non-exported. Only its signature changes, to `(cwd, paths)`.
- `pinnedGitEnv` is module-private in `test/helpers/tmp-git-repo.js`, and
  `module.exports = { createTmpGitRepo }` does not change. The return shape stays
  `{ root, cleanup }`.
- The new suite's `hermeticGitEnv`, `runHermeticGit` and `withAmbientEnv` are local to
  `test/tmp-git-repo.test.js`.

There is no barrel, registry, README surface or API report for root `test/` files, so no
surface gate applies. The new suite is picked up by `scripts/ci.sh` `run_suite process test`
(`find test -name '*.test.js'`), and it registers tests, so
test/every-test-file-registers.test.js stays green.

## Decision candidates

None. DC-1 to DC-3 are settled by the design's recommendations, and no ADR was written. The
plan settles three details the design left implicit. None of them is a load-bearing choice:

- The status `128` asserted by T1 becomes the named constant `GIT_NOT_A_REPOSITORY` (no
  magic values). It sits next to the existing `GIT_GREP_NO_MATCH`.
- T3 sets `XDG_CONFIG_HOME` to the fake home's `.config` alongside `HOME`. When
  `XDG_CONFIG_HOME` is set, git reads `$XDG_CONFIG_HOME/git/ignore` instead of
  `$HOME/.config/git/ignore`. A machine whose ambient environment already sets it would
  otherwise point the shipped helper at a different excludes file, and T3 would pass vacuously
  on the shipped code.
- T2 asserts the throwaway's `.git` exists before it runs `ls-files`. On the shipped helper
  the `.git` is missing, so this assertion fails with a readable message. Without it, a git
  `fatal` thrown from inside the test would be the failure.

## Validation-phase notes

- No Stryker run, because `test/` is outside the mutation scope. The hand mutants above stand
  in for one.
- **README trap (phase gate).** `bash scripts/ci.sh` is red on the branch before either part
  lands. engine/test/readme-drift-main.test.js
  ("Given no root argument, when main runs, then it resolves DEFAULT_ROOT …") fails with
  `readme-drift: corpus-counts: docs/contributing/design/ claims 50, tree holds 51`. The
  design doc commit `b863a74` caused this, and once this plan lands the plans count is
  stale as well (49 claimed, 50 on disk). README.md:180 needs
  `[51 design docs]` and `[50 parted plans]`. That is orchestrator bookkeeping, in the same
  shape as the earlier run's `docs: bump readme design and adr counts`, and no part edits
  README.md. With only the design count bumped (in the throwaway, before this plan existed),
  `bash scripts/ci.sh` exited 0.
- **stub-lint is not silent on `test/source-hygiene.test.js`, and it was not silent before
  either.** On the shipped tree,
  `node engine/bin/stub-lint.js -- test/source-hygiene.test.js` prints one advisory finding,
  `PLACEHOLDER@L386`, and exits 0. It comes from the existing test title "Given git grep rows
  holding a leak, a placeholder and a CRLF leak, …". After Part 1 the same finding moves to
  L395. Any other finding is new and blocks the gate. `test/helpers/tmp-git-repo.js` and
  `test/tmp-git-repo.test.js` are silent.
- Environment: `scripts/ci.sh` needs `engine/node_modules`. A fresh clone without it fails 89
  engine tests with `ERR_MODULE_NOT_FOUND`, and that failure has nothing to do with this plan.

## Part 1 — listTrackedFiles lets a git failure throw

### Context

**What changes.** `listTrackedFiles` swallows every `git ls-files` failure into `[]`. Its
class-C caller then passes vacuously with zero offenders, and its scanned-path caller fails
with a misleading "stale entry?" message. The fix removes the `try`/`catch`, takes a required
leading `cwd` and passes it to `execFileSync`, and makes both callers pass `ROOT`.
`runGrep` is not touched.

**File edited: `test/source-hygiene.test.js`** (CommonJS, `node:test` `test`, `node:assert`;
`execFileSync`, `fs`, `os` and `path` are already required at :1-7. `ROOT = path.join(__dirname, '..')`
is at :9).

- :75 `const GIT_GREP_NO_MATCH = 1;`. Add a new line directly after it:
  ```js
  const GIT_NOT_A_REPOSITORY = 128;
  ```
- :142-153, current shape:
  ```js
  function listTrackedFiles(paths) {
    let result;
    try {
      result = execFileSync('git', ['ls-files', '--', ...paths], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      result = err.stdout ?? '';
    }
    return result.split('\n').filter(Boolean);
  }
  ```
  Final shape (it mirrors test/architecture-boundaries.test.js:34-40 and the in-file
  `listHomePathCandidateLines(cwd, env)` at :93):
  ```js
  function listTrackedFiles(cwd, paths) {
    const result = execFileSync('git', ['ls-files', '--', ...paths], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.split('\n').filter(Boolean);
  }
  ```
- Callers. In the scanned-path test (title "Given the scanned-path list, …", :167), change
  :175 `listTrackedFiles([relative])` to `listTrackedFiles(ROOT, [relative])`. In the class-C
  test (title "Given a vendor-suffixed source file outside adapters/<vendor>/, …", :257-296),
  change :273 `listTrackedFiles(SCANNED_PATHS)` to `listTrackedFiles(ROOT, SCANNED_PATHS)`.
  These are the only two call sites (`grep -n listTrackedFiles`).
- T1 goes right after the class-C test's closing `);` (:296) and before
  `const SYNTHETIC_HOME = 'synthetic';` (:298).

**Pinned behaviour.**

- `git ls-files -- .` run from a mkdtemp dir outside any repo exits `128` with
  `fatal: not a git repository …` on stderr. git localises that text, so assert on
  `status`, never on the message.
- On the shipped code, the two-argument call binds the dir string to `paths`. Spreading that
  string gives one-character pathspecs, and the first one, `/`, is outside the repository, so
  git exits 128 from `ROOT`. The `catch` swallows the failure and the function returns `[]`.

**Read-only references.** test/architecture-boundaries.test.js:34-40 (the sibling with no
`try`). The in-file `listHomePathCandidateLines` and `withThrowawayRepo` (:408-422) show the
cwd-seam test style. Do NOT touch `runGrep` (:124-140), `hermeticGitEnv` (:408) or the class
D block. The design's Out of scope note covers why `listTrackedFiles` still inherits an
ambient `GIT_DIR`: that is accepted, and T1 assumes no ambient `GIT_DIR`.

**Test style.** Use a Given/When/Then title, an AAA body with a blank line between phases,
and `const sut = listTrackedFiles;`. Remove the mkdtemp dir in `finally`. Do not put a
home-rooted path in any literal, because the file's own class-D scan checks this file.

### TDD steps

1. **RED — T1, a git failure propagates (R1).** Add the constant and this test, without
   touching `listTrackedFiles` yet:
   ```js
   test('Given a directory outside any git repository, when listTrackedFiles lists it, then the git failure propagates', () => {
     const nonRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracked-files-non-repo-'));
     try {
       const sut = listTrackedFiles;

       const result = () => sut(nonRepoDir, ['.']);

       assert.throws(result, { status: GIT_NOT_A_REPOSITORY });
     } finally {
       fs.rmSync(nonRepoDir, { recursive: true, force: true });
     }
   });
   ```
   It fails today with `Missing expected exception.`: the shipped function catches the
   128 exit and returns `[]`.

2. **GREEN.** Replace `listTrackedFiles` with the final shape above, and give both callers
   `ROOT` as the first argument. T1 passes, and the other 99 tests in the file stay green.
   That includes the scanned-path pin and the class-C scan, which now list the real tree
   through the explicit `ROOT`.

3. **REFACTOR.** None expected. Check that no `let result` or `catch` is left in
   `listTrackedFiles`, and that the file still has exactly two call sites.

### Gate

```
out="$(mktemp)"; node --test test/source-hygiene.test.js test/docs-structure-lint.test.js > "$out" 2>&1; grep -n '^not ok\|^# pass\|^# fail' "$out"
node engine/bin/stub-lint.js -- test/source-hygiene.test.js; echo "exit=$?"
```

test/tmp-git-repo.test.js is created in Part 2, so this part's run leaves it out. Expect
`# pass 110` and `# fail 0`. For stub-lint, expect exactly
`STUB-FOUND(test/source-hygiene.test.js): PLACEHOLDER@L395` (the existing advisory finding,
see Validation-phase notes) and `exit=0`, with no other finding. Phase gate:
`bash scripts/ci.sh`.

### Commit

`fix(test): let listTrackedFiles propagate git failures`

## Part 2 — createTmpGitRepo runs git under a pinned env

### Context

**What changes.** `createTmpGitRepo` runs `git init` and `git add -A` with no `env`, so they
inherit `process.env`. An ambient `GIT_DIR` + `GIT_WORK_TREE` sends both commands into
another repo: the throwaway gets no `.git`, and the decoy is re-initialised and staged into.
An inherited `HOME` applies `$HOME/.config/git/ignore` (git's default `core.excludesFile`),
even with `GIT_CONFIG_GLOBAL=/dev/null`, so fixtures can drop out of the index. The fix
builds an allowlisted env on every call (`PATH` ambient, three `GIT_CONFIG_*` pins, no
`HOME`) and passes it to `runGit`.

**File edited: `test/helpers/tmp-git-repo.js`** (41 lines, CommonJS). Current shape:

- :1-5 `'use strict'` and the requires (`fs`, `os`, `path`, `execFileSync`).
- :7-16 the why-comment on the realpath caveat, then :17 `function createTmpGitRepo(relativeFilePaths)`.
- :28-32, the change site:
  ```js
  const runGit = (...args) =>
    execFileSync(
      'git',
      ['-C', root, '-c', 'user.email=tmp-git-repo@example.com', '-c', 'user.name=tmp-git-repo', ...args],
      { encoding: 'utf8' }
    );
  ```
- :34-35 `runGit('init', '-q'); runGit('add', '-A');`, :37 `cleanup`, :39 `return { root, cleanup };`,
  :41 `module.exports = { createTmpGitRepo };`.

Edits:

- Insert this block between the requires (:5) and the existing `// Builds a throwaway git
  repository …` comment (:7):
  ```js
  // Allowlisted, never spread from process.env: an ambient GIT_DIR/GIT_WORK_TREE would
  // redirect init/add into another repo, and an inherited HOME applies the user's global
  // excludes file even with GIT_CONFIG_GLOBAL pointed at /dev/null.
  function pinnedGitEnv() {
    return {
      PATH: process.env.PATH,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    };
  }
  ```
- Change the `runGit` options to `{ encoding: 'utf8', env: pinnedGitEnv() }`. The `-C root`,
  the `-c user.*` flags, the realpath, the return shape and the exports stay as they are.

**File created: `test/tmp-git-repo.test.js`**, the eponymous suite. It follows the house
pattern of test/helpers/region-slice.js and test/region-slice.test.js. CommonJS, header:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTmpGitRepo } = require('./helpers/tmp-git-repo');

const TRACKED_FIXTURE = 'docs/a.md';
const EXCLUDE_EVERY_MARKDOWN = '*.md\n';

// The suite's own git calls must not depend on the ambient environment the tests vary.
function hermeticGitEnv() {
  return {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
}

function runHermeticGit(repoDir, ...args) {
  return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8', env: hermeticGitEnv() });
}

// Restores from saved values: assigning `undefined` to a process.env key stores the string "undefined".
function withAmbientEnv(overrides, act) {
  const saved = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  try {
    return act();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
```

`withAmbientEnv` restores each key in `finally` from its saved value and deletes only keys
that were absent before (R5). The suite keeps its own env and does not import
`pinnedGitEnv`, because the helper's internals stay private.

**Consumer (read-only).** test/docs-structure-lint.test.js calls `createTmpGitRepo` at :109,
:132 and :150 and must stay green unedited (R4). Its `sut` (:91-98) still inherits
`process.env`, which is out of scope under DC-3. Reference shapes: the pi decoy guard in
adapters/pi/test/cli.test.js:71-140, and `hermeticGitEnv` in test/source-hygiene.test.js.

**Test style.** Use Given/When/Then titles, AAA bodies, and `const sut = createTmpGitRepo;`.
Clean up in `finally`: `repo?.cleanup()` first, then `fs.rmSync(<tmp dir>, { recursive: true, force: true })`.
Seed the decoy under `hermeticGitEnv()` before `process.env` is touched.

### TDD steps

1. **RED — T2, an ambient GIT_DIR cannot redirect the helper (R2).**
   ```js
   test('Given a decoy GIT_DIR and GIT_WORK_TREE on the parent process, when createTmpGitRepo builds a repo, then the throwaway tracks its own files and the decoy gains no index', () => {
     const decoyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp-git-repo-decoy-'));
     let repo;
     try {
       runHermeticGit(decoyDir, 'init', '-q');
       const ambientGitLocation = { GIT_DIR: path.join(decoyDir, '.git'), GIT_WORK_TREE: decoyDir };
       const sut = createTmpGitRepo;

       repo = withAmbientEnv(ambientGitLocation, () => sut([TRACKED_FIXTURE]));

       assert.ok(fs.existsSync(path.join(repo.root, '.git')), 'the throwaway must receive its own .git despite the ambient GIT_DIR');
       assert.strictEqual(runHermeticGit(repo.root, 'ls-files'), `${TRACKED_FIXTURE}\n`);
       assert.strictEqual(fs.existsSync(path.join(decoyDir, '.git', 'index')), false, 'the decoy must not be staged into');
     } finally {
       repo?.cleanup();
       fs.rmSync(decoyDir, { recursive: true, force: true });
     }
   });
   ```
   It fails today on the first assertion (`expected: true, actual: false`): the shipped
   `git -C root init` re-initialises the decoy named by `GIT_DIR`, and `git add -A` stages the
   decoy's work tree, so `root/.git` never exists. The test checks that the decoy has no
   index instead of comparing config mtimes, so it does not depend on timestamp resolution.

2. **RED — T3, an ambient HOME cannot drop fixtures (R3, DC-2 (a)).**
   ```js
   test('Given an ambient HOME whose global excludes file ignores every markdown file, when createTmpGitRepo builds a repo, then the markdown fixture is still tracked', () => {
     const ambientHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp-git-repo-home-'));
     let repo;
     try {
       const configHome = path.join(ambientHome, '.config');
       fs.mkdirSync(path.join(configHome, 'git'), { recursive: true });
       fs.writeFileSync(path.join(configHome, 'git', 'ignore'), EXCLUDE_EVERY_MARKDOWN);
       const sut = createTmpGitRepo;

       repo = withAmbientEnv({ HOME: ambientHome, XDG_CONFIG_HOME: configHome }, () => sut([TRACKED_FIXTURE]));

       assert.strictEqual(runHermeticGit(repo.root, 'ls-files'), `${TRACKED_FIXTURE}\n`);
     } finally {
       repo?.cleanup();
       fs.rmSync(ambientHome, { recursive: true, force: true });
     }
   });
   ```
   It fails today with `actual: ''`: the inherited `HOME`/`XDG_CONFIG_HOME` makes
   `git add -A` honour `*.md` from the fake global excludes file. `XDG_CONFIG_HOME` is set
   explicitly so the RED does not depend on the machine's own value (see Decision
   candidates).

3. **GREEN.** Add `pinnedGitEnv` and pass `env: pinnedGitEnv()` to `runGit`, exactly as in
   Context. T2 and T3 pass. The three `createTmpGitRepo` tests in
   test/docs-structure-lint.test.js stay green unedited.

4. **REFACTOR.** None expected. Check that `module.exports` is still `{ createTmpGitRepo }`
   and that the helper's realpath comment is unchanged.

### Gate

```
out="$(mktemp)"; node --test test/source-hygiene.test.js test/tmp-git-repo.test.js test/docs-structure-lint.test.js > "$out" 2>&1; grep -n '^not ok\|^# pass\|^# fail' "$out"
node engine/bin/stub-lint.js -- test/helpers/tmp-git-repo.js test/tmp-git-repo.test.js; echo "exit=$?"
```

Expect `# pass 112` and `# fail 0` at plan time, and stub-lint printing nothing with
`exit=0`. Phase gate: `bash scripts/ci.sh`. It stays red until README.md:180's corpus counts
are bumped, which is orchestrator bookkeeping (see Validation-phase notes).

### Commit

`fix(test): pin tmp-git-repo git environment`
