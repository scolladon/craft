# Plan — fixture-commits-skip-gpg-signing

> Source: design doc `docs/contributing/design/fixture-commits-skip-gpg-signing.md` · ADRs `597, 598`
> (597: both fixture `git` wrappers prepend `-c commit.gpgsign=false`, the flag pair shared as
> `UNSIGNED_COMMIT_CONFIG` from a new test helper; 598: the regression proof is one test per
> fixture family under `withFailingCommitSigner`, plus an anti-vacuity test of that helper.)
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

**How this plan applies them.** One part, three RED→GREEN cycles, five files (three created,
two edited). The whole change is test infrastructure: no file under `scripts/`, `engine/`,
`hooks/` or `adapters/` moves. Each regression test is paired with the wrapper edit that turns
it green, inside the same part, so no commit ever carries a red test or an unproven fix.
Splitting it would give a second part of one test plus one spread, which does not earn an agent
lifecycle.

- **README corpus count.** The plan commit bumps README.md l. 200 from "[68 parted plans]" to
  "[69 parted plans]" (test/readme-drift.test.js and `bash scripts/readme-drift.sh` check it
  against the live tree). The part adds no design doc, plan or ADR, so it does not touch
  README.md. "[70 design docs]" and "[598 ADRs]" already match and stay.
- **No test-count constant.** scripts/ci.sh has no `EXPECTED_TESTS` (or any fixed count) gate;
  adding three tests moves no constant anywhere.
- **Pre-probed.** Before this plan was written, a `git archive HEAD` copy of this branch (HEAD
  f3cf4b6) in a `mktemp` dir took every step below, with the exact code this plan pins:
  - RED 1: `node --test test/commit-signing.test.js` → `# Error: Cannot find module
    './helpers/commit-signing'`, `# pass 0`, `# fail 1`;
  - GREEN 1: same command → `# pass 1`, `# fail 0`;
  - RED 2: `node --test test/craft-run.test.js` → `error: gpg failed to sign the data:`,
    `# pass 0`, `# fail 1`;
  - GREEN 2: `node --test test/craft-run.test.js test/commit-signing.test.js` → `# pass 2`;
  - RED 3: `node --test test/worktree.test.js` → `not ok 1 - Given a global git config whose
    signer always fails, when mkWorktreeNoRemote …`, `error: gpg failed to sign the data:`,
    `# pass 9`, `# fail 1`;
  - GREEN 3: same command → `# pass 10`, `# fail 0`;
  - hostile-config proof: `GIT_CONFIG_GLOBAL=<tmp>/gitconfig node --test test/run-ledger.test.js
    test/worktree.test.js test/hooks.test.js test/craft-run.test.js test/commit-signing.test.js`
    → `# pass 163`, `# fail 0` (73 + 10 + 78 + 1 + 1);
  - `bash scripts/ci.sh` in the copy (re-initialised as a one-commit git repo): every suite green
    except the eight test/docs-history.test.js `git log --follow` tests, which need the real
    history the one-commit copy lacks. In the worktree they pass.

**Public surface.** Two new exported symbols, both **internal** (test infrastructure, never
part of the plugin): `UNSIGNED_COMMIT_CONFIG` and `withFailingCommitSigner`, both from the new
test/helpers/commit-signing.js. No downstream surface gate applies: test/helpers/ has no barrel,
no README or guide lists its modules, no registry enumerates it (a repo-wide grep finds
test/helpers/ named only in a comment in test/helpers/craft-run.js). The repo-wide gates that DO
read the new files, and that the code below already satisfies:

- test/every-test-file-registers.test.js — every `*.test.js` under `test/` must call `test(`
  at least once. Both new test files do.
- test/source-hygiene.test.js — test comments and test titles are scanned for provenance tokens
  (`ADR-?\d+`, `P\d+`, `Part\s+\d+`, `backlog #\d+`, `DC-\d+`), and the whole tracked tree for
  home-rooted paths. No ADR number, requirement id (R1…), part number or absolute path goes in
  any comment, title or string.

**Binding for the part.**

- Only test code changes. No file under `scripts/`, `engine/src/`, `hooks/` or `adapters/` is
  touched. No assertion in test/run-ledger.test.js, test/hooks.test.js or test/worktree.test.js
  is weakened; fixture identity (`user.email` / `user.name` in both wrappers) stays as it is.
- Test style: node:test `test(...)`, Given/When/Then titles, AAA body separated by blank lines,
  `const sut = …`. Checks read git state with a local `hermeticGitEnv()`, never through the
  fixture wrapper under test.
- No provenance references in source or test, no suppression directives, no swallowed errors.
- Commit only the five files (`git add <each path>` then `git commit -m "<message>"`); never
  touch the branch, the index beyond those paths, the stash, or other files; never
  checkout/restore/reset to undo.
- `bash scripts/ci.sh` prints about 32 000 lines: redirect it to a `mktemp` file, then read back
  `tail -5` and `grep -E '^not ok|^ci:'`.

## Decision candidates

The design's two choices are ratified (ADR-597 per-command `-c commit.gpgsign=false` in both
wrappers; ADR-598 per-fixture regression proof plus an anti-vacuity test). The plan adds two
execution-level choices.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| P-1 | Where the checks' `hermeticGitEnv()` lives | (a) a local copy in each of the three test files, the test/tmp-git-repo.test.js L16–23 shape, as the design's test strategy says; (b) export it from the new test/helpers/commit-signing.js; (c) a new shared helper module, with test/tmp-git-repo.test.js migrated onto it | **(a)** | The design pins the copy. (b) puts the check env in the module under test, the coupling test/tmp-git-repo.test.js L15 calls out ("a regression there must not also blind the checks"). (c) is a refactor of an untouched suite, outside the brief. Six lines per file is the accepted cost. |
| P-2 | What the fixture tests assert | (a) `rev-parse --verify HEAD` resolves to a hex object id in each repo the fixture builds; (b) also assert `git cat-file commit HEAD` carries no `gpgsig` header | **(a)** | Under the hostile config the signer is `false`, so any commit that lands cannot carry a signature: (b) guards nothing (a) misses. The `^[0-9a-f]+\n$` pattern stays length-agnostic, so a sha256 object format still passes. |

## Part 1 — fixture commits skip the ambient commit signer

### Context

Line numbers below are as of HEAD before any edit; an added `require` line shifts what follows
it by one, so anchor each edit on the quoted code, not the number.

Files this part creates or edits (five):

- `test/helpers/commit-signing.js` — NEW. CommonJS (`'use strict';`), like every helper in
  test/helpers/. Imports `withAmbientEnv` from ./ambient-env (relative require). Final shape (built over GREEN 1
  and GREEN 2):

  ```js
  'use strict';
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { withAmbientEnv } = require('./ambient-env');

  // Command-scope `-c` outranks every config file and GIT_CONFIG_COUNT, so an ambient signer can never reach a fixture commit.
  const UNSIGNED_COMMIT_CONFIG = Object.freeze(['-c', 'commit.gpgsign=false']);

  // `false` as the signer fails every signature at once, the same failure a starved gpg-agent produces under load.
  const FAILING_SIGNER_CONFIG = '[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = false\n';

  function withFailingCommitSigner(act) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failing-signer-'));
    const configPath = path.join(dir, 'gitconfig');
    fs.writeFileSync(configPath, FAILING_SIGNER_CONFIG);
    try {
      return withAmbientEnv({ GIT_CONFIG_GLOBAL: configPath }, act);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  module.exports = { UNSIGNED_COMMIT_CONFIG, withFailingCommitSigner };
  ```

  `withFailingCommitSigner` is synchronous on purpose: `withAmbientEnv` restores `process.env`
  in a `finally` after `act` returns, and every fixture under test runs `execFileSync`. A child
  spawned inside `act` without an explicit `env` inherits the swapped `process.env`; both
  fixture wrappers spawn that way.

- `test/commit-signing.test.js` — NEW, the anti-vacuity proof that the hostile helper really
  fails a plain commit (so the two fixture tests cannot pass vacuously). No restore test:
  test/ambient-env.test.js L21–60 already pins restore-after-throw for `withAmbientEnv`.

- `test/craft-run.test.js` — NEW, eponymous suite for test/helpers/craft-run.js (none exists
  today). Imports `createRunRepo` from ./helpers/craft-run (relative require).

- `test/helpers/craft-run.js` — EDIT. Current wrapper, L14–20:

  ```js
  function git(cwd, args) {
    return execFileSync(
      'git',
      ['-C', cwd, '-c', 'user.email=craft-run@example.com', '-c', 'user.name=craft-run', ...args],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
  }
  ```

  Imports at L6–9 (`fs`, `os`, `path`, `{ execFileSync, spawnSync }`). `createRunRepo()` L25–33
  runs `git(main, ['init', '-q'])` then `git(main, ['commit', '--allow-empty', '-q', '-m',
  'init'])` (L30 is the commit that fails under the hostile signer) and returns
  `{ parent, main, cleanup }`. `git` is also exported and used by test/run-ledger.test.js L490
  (`commit -q -m planted`); `createRunRepo` / `bindRun` are imported by test/run-ledger.test.js
  L17 and test/hooks.test.js L8. None of those consumers change.

- `test/worktree.test.js` — EDIT. Imports L1–7 (`test`, `assert`, `{ execFileSync, spawnSync }`,
  `fs`, `os`, `path`). Current wrapper L27–29 (no caller passes `opts`):

  ```js
  function git(args, opts = {}) {
    execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
  }
  ```

  `mkWorktreeNoRemote(repoDir, wtDir, branch)` L31–38: `init -q repoDir`, repo-local
  `user.email` / `user.name`, `commit --allow-empty` (L35), `worktree add -q --orphan wtDir -b
  branch`, `commit --allow-empty` in `wtDir` (L37). `setup()` L56–62 shows the dir arrangement:
  mkdtemp `craft-repo-`, mkdtemp `craft-wt-` then `fs.rmSync` it, because `worktree add` needs
  a path that does not exist. `teardown` ends at L67; L69–71 is the
  `// worktree-setup.sh — no lockfile branch` section banner (three lines, dashed rules above
  and below). `branchExists` L45–54 calls `execFileSync('git', …)` directly for `rev-parse`
  only, which never signs: leave it untouched. The realpath-guard test L287–306 open-codes
  init + config + `commit --allow-empty` + `branch -M main` through the same `git` wrapper, so
  the wrapper edit covers it with no per-site change.

Read-only references (do not edit): test/helpers/ambient-env.js (`withAmbientEnv(overrides,
act)`, restores saved values in a `finally`, deletes keys that were unset);
test/tmp-git-repo.test.js L14–23 (the `hermeticGitEnv()` shape and its "deliberately not the
helper's own env" comment); test/run-ledger.test.js, test/hooks.test.js (consumers, must stay
green unchanged).

Environment facts the steps rely on: git 2.56.0, node v22.22.3. A command-scope `-c` placed
before the subcommand is valid for every verb the wrappers run (`init`, `config`, `commit`,
`worktree`, `branch`, `remote`, `status`, `clone`, `add`). With `gpg.program=false` git prints
`error: gpg failed to sign the data:` and `execFileSync` throws an Error whose message carries
that stderr, so `assert.throws(fn, /gpg failed to sign/)` matches it.

### TDD steps

1. **RED** — create `test/commit-signing.test.js`:

   ```js
   'use strict';
   const { test } = require('node:test');
   const assert = require('node:assert');
   const { execFileSync } = require('node:child_process');
   const fs = require('node:fs');
   const os = require('node:os');
   const path = require('node:path');
   const { withFailingCommitSigner } = require('./helpers/commit-signing');

   // The suite's own git calls must not depend on the ambient config the helper swaps in.
   function hermeticGitEnv() {
     return {
       PATH: process.env.PATH,
       GIT_CONFIG_GLOBAL: '/dev/null',
       GIT_CONFIG_SYSTEM: '/dev/null',
       GIT_CONFIG_NOSYSTEM: '1',
     };
   }

   test('Given a global git config whose signer always fails, when a plain commit runs inside withFailingCommitSigner, then git refuses with gpg failed to sign', () => {
     const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-signing-'));
     try {
       execFileSync('git', ['init', '-q', repoDir], { env: hermeticGitEnv() });
       const sut = withFailingCommitSigner;

       const commit = () => sut(() =>
         execFileSync(
           'git',
           ['-C', repoDir, '-c', 'user.email=commit-signing@example.com', '-c', 'user.name=commit-signing', 'commit', '--allow-empty', '-q', '-m', 'plain'],
           { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
         ),
       );

       assert.throws(commit, /gpg failed to sign/);
     } finally {
       fs.rmSync(repoDir, { recursive: true, force: true });
     }
   });
   ```

   Run `node --test test/commit-signing.test.js`. Expected failure: the file cannot load —
   `Cannot find module './helpers/commit-signing'` (`MODULE_NOT_FOUND`), `# fail 1`, because
   the helper module does not exist yet.

2. **GREEN** — create `test/helpers/commit-signing.js` with `FAILING_SIGNER_CONFIG` and
   `withFailingCommitSigner` exactly as pinned in Context, minus `UNSIGNED_COMMIT_CONFIG` (it
   has no consumer until step 4): `module.exports = { withFailingCommitSigner };`. Re-run →
   `# pass 1`, `# fail 0`.

3. **RED** — create `test/craft-run.test.js`:

   ```js
   'use strict';
   const { test } = require('node:test');
   const assert = require('node:assert');
   const { execFileSync } = require('node:child_process');
   const { createRunRepo } = require('./helpers/craft-run');
   const { withFailingCommitSigner } = require('./helpers/commit-signing');

   // The suite's own git calls must not depend on the ambient config the test swaps in.
   function hermeticGitEnv() {
     return {
       PATH: process.env.PATH,
       GIT_CONFIG_GLOBAL: '/dev/null',
       GIT_CONFIG_SYSTEM: '/dev/null',
       GIT_CONFIG_NOSYSTEM: '1',
     };
   }

   test('Given a global git config whose signer always fails, when createRunRepo builds a repo, then its init commit lands', () => {
     let repo;
     try {
       const sut = createRunRepo;

       repo = withFailingCommitSigner(() => sut());

       const head = execFileSync('git', ['-C', repo.main, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8', env: hermeticGitEnv() });
       assert.match(head, /^[0-9a-f]+\n$/);
     } finally {
       repo?.cleanup();
     }
   });
   ```

   Run `node --test test/craft-run.test.js`. Expected failure: `createRunRepo` throws from the
   `commit --allow-empty -q -m init` call (test/helpers/craft-run.js L30) with
   `error: gpg failed to sign the data:`, because the wrapper still inherits the hostile
   `commit.gpgsign=true`. `# fail 1`.

4. **GREEN** — in `test/helpers/commit-signing.js` add `UNSIGNED_COMMIT_CONFIG` (with its
   comment) above `FAILING_SIGNER_CONFIG` and export it:
   `module.exports = { UNSIGNED_COMMIT_CONFIG, withFailingCommitSigner };`. In
   `test/helpers/craft-run.js`, after the `node:child_process` require (L9) add
   `const { UNSIGNED_COMMIT_CONFIG } = require('./commit-signing');`, and change the L17 argv to

   ```js
   ['-C', cwd, ...UNSIGNED_COMMIT_CONFIG, '-c', 'user.email=craft-run@example.com', '-c', 'user.name=craft-run', ...args],
   ```

   Re-run `node --test test/craft-run.test.js test/commit-signing.test.js` → `# pass 2`.

5. **RED** — in `test/worktree.test.js`, after the `path` require (L7) add
   `const { withFailingCommitSigner } = require('./helpers/commit-signing');`. Then insert this
   block between `teardown` (ends L67) and the `worktree-setup.sh — no lockfile branch` banner
   (L69), keeping one blank line on each side:

   ```js
   // The suite's own checks must not depend on the ambient config a test swaps in.
   function hermeticGitEnv() {
     return {
       PATH: process.env.PATH,
       GIT_CONFIG_GLOBAL: '/dev/null',
       GIT_CONFIG_SYSTEM: '/dev/null',
       GIT_CONFIG_NOSYSTEM: '1',
     };
   }

   function headOf(dir) {
     return execFileSync('git', ['-C', dir, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8', env: hermeticGitEnv() });
   }

   // ---------------------------------------------------------------------------
   // fixture commits — independent of the ambient signer
   // ---------------------------------------------------------------------------

   test(
     'Given a global git config whose signer always fails, when mkWorktreeNoRemote builds a repo and worktree, then both init commits land',
     () => {
       const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-repo-'));
       const wtDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-wt-'));
       fs.rmSync(wtDir, { recursive: true, force: true });
       try {
         const sut = mkWorktreeNoRemote;

         withFailingCommitSigner(() => sut(repoDir, wtDir, 'craft-test-branch'));

         assert.match(headOf(repoDir), /^[0-9a-f]+\n$/);
         assert.match(headOf(wtDir), /^[0-9a-f]+\n$/);
       } finally {
         fs.rmSync(repoDir, { recursive: true, force: true });
         fs.rmSync(wtDir, { recursive: true, force: true });
       }
     },
   );
   ```

   Run `node --test test/worktree.test.js`. Expected failure: the new test (`not ok 1`) —
   `mkWorktreeNoRemote` throws from its first `commit --allow-empty` (L35 before this step,
   L36 once the import line is in) with `error: gpg failed to sign the data:`, because the wrapper still inherits
   the hostile signer. `# pass 9`, `# fail 1`.

6. **GREEN** — in `test/worktree.test.js` widen the import to
   `const { UNSIGNED_COMMIT_CONFIG, withFailingCommitSigner } = require('./helpers/commit-signing');`
   and change the `git` wrapper body to

   ```js
   execFileSync('git', [...UNSIGNED_COMMIT_CONFIG, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
   ```

   Re-run → `# pass 10`, `# fail 0`.

7. **GUARD** — hostile-config suite proof, by hand, not committed. Write the hostile config in a
   `mktemp -d` dir (`printf '[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = false\n' >
   <tmp>/gitconfig`), then run `GIT_CONFIG_GLOBAL=<tmp>/gitconfig node --test
   test/run-ledger.test.js test/worktree.test.js test/hooks.test.js test/craft-run.test.js
   test/commit-signing.test.js` → `# pass 163`, `# fail 0`. Passes because both wrappers now
   carry the command-scope `-c commit.gpgsign=false`, which outranks the global file. Then run
   the same five files without `GIT_CONFIG_GLOBAL` (ambient config) → `# pass 163`. Remove the
   tmp dir. The kill proof for the spread in each wrapper is RED 3 and RED 5 themselves: each
   fixture test was red until its wrapper gained the spread. No step removes the spread again.

8. **REFACTOR** — none expected. Check only: the two wrapper edits are one-line diffs, the
   three `hermeticGitEnv()` copies are byte-identical in body (decision P-1), and no comment or
   title carries an ADR number, requirement id or part number.

### Gate

Run from the worktree root, output to a tmp file (about 32 000 lines):

```bash
out="$(mktemp)"; bash scripts/ci.sh > "$out" 2>&1; echo "exit $?"; tail -5 "$out"; grep -E '^not ok|^ci:' "$out"
```

Pass = `exit 0` and no `grep` match.

### Commit

`fix(test): make fixture commits skip the ambient gpg signer`
