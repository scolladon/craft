# Design — fixture-commits-skip-gpg-signing

> Brief: the fixture commits in `test/helpers/craft-run.js` and `test/worktree.test.js` pick up
> the user's global `commit.gpgsign=true`. Under load the signer fails
> (`gpg failed to sign the data: Cannot allocate memory`) and the suites go red. Make those
> fixture commits never sign. Test-only change.
> Status: draft → self-reviewed ×2

## Context

Two fixture families run `git commit` with the ambient git config:

| Site | Shape today | Commits |
|---|---|---|
| `test/helpers/craft-run.js` `git(cwd, args)` L14–20 | `execFileSync('git', ['-C', cwd, '-c', 'user.email=craft-run@example.com', '-c', 'user.name=craft-run', ...args], { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] })`, no `env` | `createRunRepo()` L25–33 (`commit --allow-empty -q -m init`); exported `git`, used by `test/run-ledger.test.js` L490 (`commit -q -m planted`) |
| `test/worktree.test.js` `git(args, opts = {})` L27–29 | `execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'], ...opts })`, no caller passes `opts` | `mkWorktreeNoRemote` L31–38 (two `commit --allow-empty`); the realpath-guard test L282–306 open-codes init + config + `commit --allow-empty` + `branch -M main` |

Consumers: `createRunRepo` / `bindRun` are imported by `test/run-ledger.test.js` (L17) and
`test/hooks.test.js` (L8). The scripts under test (`scripts/run-ledger.sh`,
`scripts/worktree-setup.sh`, `scripts/worktree-teardown.sh`) never commit. `addWorktree`
(`worktree add`) does not sign.

Precedent for hermetic git in tests:

- `test/helpers/tmp-git-repo.js` `pinnedGitEnv()`: an allowlisted env
  `{ PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }`.
  It never spreads `process.env`. Not exported.
- `test/tmp-git-repo.test.js`: per-helper regression tests that put a hostile ambient in place
  with `withAmbientEnv` (`test/helpers/ambient-env.js`). Their checks use a separate
  `hermeticGitEnv()`, never the helper's own env, so a bug in the helper cannot also hide the
  check.
- `test/hermetic-suite.test.js`: runs whole suites nested under a hostile `HOME`/cwd, with an
  anti-vacuity `# pass \d+` assertion.
- `docs/contributing/design/hermetic-test-suites.md`: the cwd/`$HOME` hermeticity design these
  follow.

`scripts/ci.sh` has no test-count gate (`EXPECTED_TESTS` is gone), so adding tests needs no
constant bump.

### Pinned facts

All probes ran in a `mktemp` copy of HEAD (`git archive`), never in the worktree. git 2.56.0,
macOS. The hostile config is `[commit] gpgsign = true` + `[gpg] program = false`, selected with
`GIT_CONFIG_GLOBAL=<file>`. `false` exits 1, which gives the same `gpg failed to sign the data`
path every time, with no load needed.

**Suites.** Variant A is the helper-level `-c commit.gpgsign=false`. Variant B is
`pinnedGitEnv`-style `env` on both `git` wrappers.

| Suite | HEAD ambient | HEAD hostile | A ambient | A hostile | B ambient | B hostile |
|---|---|---|---|---|---|---|
| `test/run-ledger.test.js` (73) | 73 pass | **71 fail** (71 `gpg failed`) | 73 | 73 | 73 | 73 |
| `test/worktree.test.js` (9) | 9 pass | **9 fail** | 9 | 9 | 9 | 9 |
| `test/hooks.test.js` (78) | 78 pass | **35 fail** | 78 | 78 | 78 | 78 |

The orchestrator swept every other `*.test.js` under `test/` and `engine/test/` with the
hostile config: no signing failure. This design adds a sweep of the seven `adapters/*/test`
suites: 0 `gpg failed` lines in any of them. The pi (19) and opencode (1) failures appear with
the same counts under ambient config too. Their cause is `ERR_MODULE_NOT_FOUND 'js-yaml'`,
because the probe copy has no `node_modules`; signing plays no part. The one engine commit
site, `engine/test/guards/shell-git-invocations.differential.test.js` `makeRepo` L557–563,
passes its own `env` with no `GIT_CONFIG_GLOBAL` and a throwaway `HOME`, so it is already
immune.

**Mechanism precedence** (one `git commit --allow-empty` in a fresh repo):

| Mechanism | Hostile signing global | + `GIT_CONFIG_COUNT` forcing `commit.gpgsign=true` | Global `core.hooksPath` with a failing `pre-commit` |
|---|---|---|---|
| none (today) | FAIL `gpg failed to sign` | — | — |
| `-c commit.gpgsign=false` | lands | lands | FAIL |
| `commit --no-gpg-sign` | lands | lands | — |
| pinned env (`env -i PATH GIT_CONFIG_GLOBAL=/dev/null …`) | lands | n/a (env dropped) | lands |

Default branch: pinned `git init` gives `master`, ambient gives `main` (this box). Variant B
is green under both, so no test in the three suites depends on the ambient default branch.
The realpath-guard test sets `main` itself with `branch -M main`.

**Regression shape.** A probe test wrapped `createRunRepo()` in a `GIT_CONFIG_GLOBAL` swap
done with `withAmbientEnv`. It went red on HEAD (`gpg failed to sign the data`) and green on
A and B. A companion check ("a bare commit under the hostile config throws `/gpg failed to
sign/`") passed on all three trees, so the hostile ambient really is hostile.

## Requirements

- R1. With any ambient global config that sets `commit.gpgsign=true`, every commit made by
  `test/helpers/craft-run.js` `git` and by `test/worktree.test.js` `git` lands unsigned. This
  covers `createRunRepo`, `run-ledger.test.js` L490, `mkWorktreeNoRemote` and the
  realpath-guard test.
- R2. `node --test test/run-ledger.test.js test/worktree.test.js test/hooks.test.js` passes
  under `GIT_CONFIG_GLOBAL=<hostile config>` and under the ambient config.
- R3. Only test code changes. No file under `scripts/`, `engine/src/`, `hooks/` or `adapters/`
  is touched.
- R4. A durable regression test is red on today's tree for `createRunRepo` and for
  `mkWorktreeNoRemote`, and green after the fix. A separate check proves the hostile config
  fails a plain commit, so the regression tests cannot pass vacuously.
- R5. No assertion in the three suites is weakened. Fixture identity (`user.email` /
  `user.name`) stays as it is.
- R6. `bash scripts/ci.sh` is green.

## Design

The design follows the recommendations in D1(a) and D2(a). Each alternative is spelled out
under Decision candidates.

### New helper `test/helpers/commit-signing.js`

This module gathers commit-signing concerns for test fixtures: the cure and the hostile
ambient.

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

`withFailingCommitSigner` is synchronous, because `withAmbientEnv` restores in a `finally`
after `act` returns. Every fixture under test is synchronous (`execFileSync`), so it fits. A
child spawned inside `act` without an explicit `env` inherits the swapped `process.env`. That
is the case for both fixture wrappers.

### Fixture wrappers (two one-line edits)

`test/helpers/craft-run.js` `git`:

```js
['-C', cwd, ...UNSIGNED_COMMIT_CONFIG, '-c', 'user.email=craft-run@example.com', '-c', 'user.name=craft-run', ...args],
```

`test/worktree.test.js` `git`:

```js
execFileSync('git', [...UNSIGNED_COMMIT_CONFIG, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
```

Every git call in both files goes through these wrappers. The `-c` covers every current commit
site (five) and any future one, including the open-coded realpath-guard test, with no per-site
edit. A command-scope `-c` placed before the subcommand is valid for every verb the wrappers
run (`init`, `config`, `commit`, `worktree`, `branch`, `remote`, `status`, `clone`, `add`).
`branchExists` (worktree.test.js L44–53) calls `execFileSync('git', …)` directly, but only for
`rev-parse`, which never signs, so it stays untouched.

### Edge behaviour

- `gpg.format=ssh` / `x509`: `commit.gpgsign` is the single switch for every format, so `-c`
  covers them.
- A user who exports `GIT_CONFIG_COUNT` with `commit.gpgsign=true`: pinned. `-c` wins.
- A global `core.hooksPath` with a failing `pre-commit`: pinned as **not** covered by `-c`. No
  run has failed this way, so it is left out (see Out of scope). Under D1(b) it would be
  covered.
- `tag.gpgSign`, `push.gpgSign`, `rebase.gpgSign`: no fixture tags, pushes or rebases.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D1 | How fixture commits avoid the ambient signer | (a) Prepend `-c commit.gpgsign=false` in both fixture `git` wrappers. The flag pair is exported once as `UNSIGNED_COMMIT_CONFIG` from `test/helpers/commit-signing.js`. (b) Pinned hermetic env: export `pinnedGitEnv` from `test/helpers/tmp-git-repo.js` and pass `env: pinnedGitEnv()` in both wrappers, so the fixture ignores all user and system config. (c) Add `--no-gpg-sign` to each of the five commit argvs. | **(a)** | It targets exactly the proven cause, with one site per wrapper, and covers future commits made through the wrappers. (b) is green too (pinned), and it also shuts out hooksPath and `GIT_DIR` hazards. But it is broader than the proof. It changes the fixture's defaults (`init.defaultBranch` becomes `master`). It also leaves the fixture repo built under a different config from the ambient-env scripts that then run in it. The brief asks for the minimal change. (c) needs a per-site edit and does not cover the next commit someone adds. |
| D2 | Shape and placement of the regression proof | (a) One per-fixture test per family, under `withFailingCommitSigner`: a new eponymous `test/craft-run.test.js` for `createRunRepo`, plus one test in `test/worktree.test.js` for `mkWorktreeNoRemote`. Add a new `test/commit-signing.test.js` that proves the hostile helper fails a plain commit (anti-vacuity). (b) A suite-level lane in `test/hermetic-suite.test.js` that runs the three suites nested under the hostile `GIT_CONFIG_GLOBAL`, following the existing hostile-HOME lane. (c) Both. | **(a)** | It gives a precise red per fixture and follows `test/tmp-git-repo.test.js` (per-helper, `withAmbientEnv`, checks run with an independent hermetic env). (b) would catch commit sites added later in any of the three suites. But it re-runs about 160 tests nested (the three suites took about 1–7 s each when run alone) on every `ci.sh`, which adds the very load that triggers the original failure. (c) costs (b)'s price on top of (a). |

## Test strategy

Order: write the tests red first, then add the wrapper edits (TDD). Use node:test,
Given/When/Then titles, AAA bodies and `const sut = …`. Checks run git with a local
`hermeticGitEnv()` (copy the `test/tmp-git-repo.test.js` L16–23 shape), never with the
fixture's own wrapper.

1. **`test/commit-signing.test.js`** (new, anti-vacuity):
   `Given a global git config whose signer always fails, when a plain commit runs inside withFailingCommitSigner, then git refuses with gpg failed to sign`.
   Arrange: run `git init -q` in a mkdtemp dir with `hermeticGitEnv()`. Act: `sut = withFailingCommitSigner`,
   whose `act` runs `git -C dir -c user.email=… -c user.name=… commit --allow-empty -q -m x`
   with the inherited env. Assert: `assert.throws(…, /gpg failed to sign/)`. There is no
   restore test here: `test/ambient-env.test.js` L21–60 already pins restore-after-throw for
   `withAmbientEnv`.
2. **`test/craft-run.test.js`** (new, eponymous for `test/helpers/craft-run.js`):
   `Given a global git config whose signer always fails, when createRunRepo builds a repo, then its init commit lands`.
   `const sut = createRunRepo; const repo = withFailingCommitSigner(() => sut());` Assert
   `git -C repo.main rev-parse --verify HEAD` (hermetic env) matches `/^[0-9a-f]+\n$/`. The
   pattern is length-agnostic so a sha256 object format still passes.
   Clean up with `repo.cleanup()` in a `finally`. Pinned red on HEAD and green after the fix.
3. **`test/worktree.test.js`**, in a new section after the helper block (before L69):
   `Given a global git config whose signer always fails, when mkWorktreeNoRemote builds a repo and worktree, then both init commits land`.
   Arrange the dirs the way `setup()` L55–61 does: a mkdtemp repo, plus a mkdtemp worktree
   path that is removed before use, because `worktree add` needs a path that does not exist.
   `const sut = mkWorktreeNoRemote;` under `withFailingCommitSigner`. Assert
   `rev-parse --verify HEAD` succeeds in both `repoDir` and `wtDir` with a hermetic env. Clean
   up both dirs in a `finally`. The realpath-guard test and run-ledger L490 share the same
   wrapper, so this test covers them too. They get no separate test.
4. **Suite proof (R2), by hand at validation time, not committed:**
   `GIT_CONFIG_GLOBAL=<hostile file> node --test test/run-ledger.test.js test/worktree.test.js test/hooks.test.js`
   gives 160/160 pass. Put the hostile file in a `mktemp` dir.
5. **Gates**: `bash scripts/ci.sh` for the part and the phase. Mutation: the touched code
   lives in `test/`, outside the `engine/stryker.conf.json` `mutate` globs (`engine/src/**`
   plus named adapter sources), so there is no Stryker run. The
   regression tests are the kill proof: removing `...UNSIGNED_COMMIT_CONFIG` from a wrapper
   turns test 2 or 3 red. Re-run that hand check once.

## Out of scope

- A global `core.hooksPath` or other non-signing user config reaching fixture commits.
  Pinned as uncovered by D1(a), but no suite has failed this way.
- Production scripts (`scripts/run-ledger.sh`, `scripts/worktree-*.sh`). They never commit,
  and the brief rules out production changes.
- Turning the fixture wrappers into one shared git helper. Their signatures differ
  (`git(cwd, args)` vs `git(args, opts)`), and unifying them is a refactor nobody asked for.
- The pi/opencode `ERR_MODULE_NOT_FOUND` failures seen in the probe copy. They come from the
  probe copy having no `node_modules`; they are not repo defects.
