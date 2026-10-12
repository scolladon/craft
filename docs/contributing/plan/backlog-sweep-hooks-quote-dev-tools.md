# Plan — backlog-sweep-hooks-quote-dev-tools

> Source: design doc `docs/contributing/design/backlog-sweep-hooks-quote-dev-tools.md` · ADRs `508, 509, 510, 511`
> (all four take the design's recommended options: the hook commands quote the whole
> plugin-root path, form A (508); the shared dev-tool set drops bats and yq and the three
> bats helpers are deleted (509); `INLINE_INSTALL` shrinks to `[/apt-get install/]` (510);
> the devcontainer smoke drops the yq clause with no replacement (511))
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
| 1 | Quote the hook commands | config + suite | hooks.json, the hooks suite, CHANGELOG (3) | 1 (three RED groups, one GREEN) |
| 2 | Drop bats and yq from the dev-tool install; delete the bats helpers | script + suite + deletions + prose | install script, its suite, 3 deleted helpers, maintainer-smokes (6) | 1 |

The two parts touch disjoint files and do not depend on each other; they run in order in
one working tree. Each part's tests fold into the part whose code they exercise. BACKLOG
ticking (R9) belongs to the documentation phase and is in no part.

Every edit below was applied to a throwaway `git clone` of the branch tip (`3589c87`,
engine node_modules symlinked in) and checked there:

| Check | Before | After Part 1 RED steps | After Part 1 GREEN | After Part 2 RED step | After Part 2 GREEN / REFACTOR |
|---|---|---|---|---|---|
| `node --test test/hooks.test.js` | 55 pass | 54 pass / 7 fail (the 7 REDs) | 61 pass | — | — |
| `node --test test/hooks.test.js test/craft-root-shim.test.js` | — | — | 100 pass / 0 fail | — | — |
| `node --test test/install-dev-tools.test.js` | 6 pass | — | — | 1 pass / 2 fail (the 2 REDs) | 3 pass / 3 pass |
| `shellcheck scripts/install-dev-tools.sh` | — | — | — | — | clean |
| `bash scripts/ci.sh` (after committing in the clone) | — | — | — | — | exit 0 |
| `claude plugin validate .` (Claude Code 2.1.296) | 3 `hooks.*` warnings + marketplace warning | — | — | — | marketplace `description` warning only |

The RED failure texts quoted in the TDD steps are copied from that run. After the run the
repo's `hooks/` directory was intact: `fs.rmSync(tmp, { recursive: true })` removes the two
symlinks inside the throwaway, never their target.

## Public-surface decision

No new exported symbol. Every helper and constant this plan adds lives inside a test file
and is module-local (`readHooksConfig`, `registeredCommand`, `expandHookCommand`,
`withSpacedRoots`, `assertExecutableFile`, `REGISTERED_HOOKS`, `SH_ARGV_DUMP`,
`SPACED_ROOT_PREFIX`). The hook command strings are the plugin's registered surface, but
their shape is decided by ADR 508 and pinned by the hooks suite in Part 1. No barrel,
registry, README count or generated report changes in either part.

## Decision candidates

None open. Every load-bearing choice is settled by an accepted ADR:

| Choice | Settled by |
|---|---|
| Hook command form (whole-path quotes vs placeholder-only vs exec form) | ADR 508: whole-path double quotes |
| Which dev tools stay; fate of the three bats helpers | ADR 509: shellcheck + jq only; delete the helpers |
| What `INLINE_INSTALL` guards | ADR 510: `[/apt-get install/]` |
| What replaces the `yq --version` smoke clause | ADR 511: nothing; the clause is dropped |

Plan-local choices that are not load-bearing (no behaviour or surface depends on them): helper
names, and deleting Part 2's three removed-behaviour tests in the RED step rather than after
GREEN (see Part 2, TDD step 1: it keeps the GREEN step all-green without changing what is
tested).

## Part 1 — Quote the hook commands

### Context

Files this part edits:

- `hooks/hooks.json` — three `command` string values, lines 7, 15, 23. Today each is
  `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/<script>.sh` (unquoted). Event / matcher /
  script table: PreToolUse / `Bash` / git-no-ext-diff.sh; SessionStart / `compact` /
  reorient-after-compact.sh; PreCompact / empty string / steer-compact-summary.sh. Change only
  the command values; events, matchers, `type`, order and the one-line object layout stay.
- `test/hooks.test.js` (745 lines). Already imports `spawnSync`, `fs`, `os`, `path`
  (lines 4-7). `ROOT` (line 10) is the repo root, `HOOKS_DIR` (line 11) is ROOT/hooks.
  The three hooks-config tests to replace sit at lines 207-248:
  - 207-220 SessionStart test: resolves the path with
    `sut.hooks[0].command.replace('${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}', ROOT)`, then
    `fs.statSync` + `S_IXUSR`. After quoting, this `.replace` would leave the literal double
    quotes in the path and `statSync` would throw, so it must be rewritten before GREEN.
  - 222-235 PreCompact test: same resolution.
  - 237-248 "then PreToolUse is unchanged": `deepStrictEqual` on the exact command string.
  Line 250 starts `for (const hookName of COMPACTION_HOOKS) {` (the non-git-cwd loop); the
  new block ends right before it. Nothing else in the suite reads the hooks config.
- `CHANGELOG.md` — line 8 is `## [Unreleased]` with an empty section, followed by
  `## [1.1.0] - 2026-10-12` at line 10. Existing `### Fixed` style (under 1.1.0, line 32): one
  plain sentence per bullet, user-facing, no code spans.

Read-only references (do not edit):

- test/craft-root-shim.test.js: `SHIM = '${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/'` and the
  pinned count `{ file: 'hooks/hooks.json', count: 3 }`, plus a check that no bare
  `${CLAUDE_PLUGIN_ROOT}/` remains outside the shim. Whole-path quoting keeps the shim
  substring intact (the opening `"` precedes it), so this suite stays green unedited.
- docs/contributing/design/backlog-sweep-hooks-quote-dev-tools.md, Design P2/P3: Claude's
  runner executes shell-form commands under `/bin/sh -c` with `CLAUDE_PLUGIN_ROOT` passed
  as an environment variable (no textual substitution). That is why the test helper
  expands commands with `sh -c` and a hand-built env.
- Shell facts (probed under macOS sh and the design's dash run): with a root
  `<tmp>/plug in root`, the unquoted command splits into 3 words
  (`<tmp>/plug`, `in`, `root/hooks/<script>`); with `CRAFT_ROOT=<tmp>/alt root` it splits
  into 2 (`<tmp>/alt`, `root/hooks/<script>`). The quoted form yields exactly 1 word in both.

Env rule for every new test: build the env explicitly as
`{ PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: <root> }` (plus `CRAFT_ROOT` where the test
wants it). Never spread `process.env`: an ambient `CRAFT_ROOT` would leak in and flip the
result.

Coding rules: Given/When/Then titles, AAA bodies, subject named `sut`; no comments naming
ADRs, phases or backlog items; no lint-suppression directives.

### TDD steps

1. **GUARD — scaffolding + the two rewritten resolution tests.** Replace lines 207-235
   (the SessionStart and PreCompact tests) with the block below. Leave the old PreToolUse
   test (237-248) where it is; step 4 replaces it. Final order in the file: scaffolding,
   SessionStart test, PreCompact test, PreToolUse test, the per-event `for` loop (steps 2-3),
   then the existing COMPACTION_HOOKS loop.
   ~~~js
   const SPACED_ROOT_PREFIX = 'craft-hook-root-';
   const SH_ARGV_DUMP = '; printf "%s\\0" "$@"';
   const REGISTERED_HOOKS = [
     { event: 'PreToolUse', script: 'git-no-ext-diff.sh' },
     { event: 'SessionStart', script: 'reorient-after-compact.sh' },
     { event: 'PreCompact', script: 'steer-compact-summary.sh' },
   ];

   function readHooksConfig() {
     return JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'hooks.json'), 'utf8'));
   }

   function registeredCommand(event) {
     const [binding] = readHooksConfig().hooks[event];
     return binding.hooks[0].command;
   }

   // Expands a registered command the way Claude's runner does: /bin/sh -c with the plugin root in the environment.
   function expandHookCommand(command, env) {
     const result = spawnSync('sh', ['-c', `set -- ${command}${SH_ARGV_DUMP}`], { env, encoding: 'utf8' });
     if (result.status !== 0) throw new Error(`sh exited ${result.status}: ${result.stderr}`);
     return result.stdout.split('\0').filter(Boolean);
   }

   function withSpacedRoots(act) {
     const tmp = fs.mkdtempSync(path.join(os.tmpdir(), SPACED_ROOT_PREFIX));
     try {
       const roots = { plugin: path.join(tmp, 'plug in root'), override: path.join(tmp, 'alt root') };
       fs.symlinkSync(ROOT, roots.plugin);
       fs.symlinkSync(ROOT, roots.override);
       return act(roots);
     } finally {
       fs.rmSync(tmp, { recursive: true, force: true });
     }
   }

   function assertExecutableFile(filePath) {
     const stats = fs.statSync(filePath);
     assert.ok(stats.isFile(), `expected ${filePath} to be a regular file`);
     assert.notStrictEqual(stats.mode & fs.constants.S_IXUSR, 0, `expected ${filePath} to be executable`);
   }

   test(
     'Given hooks/hooks.json, when parsed, then SessionStart binds "compact" to an existing, executable reorient hook',
     () => {
       const sut = readHooksConfig().hooks.SessionStart[0];

       const result = expandHookCommand(sut.hooks[0].command, { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: ROOT });

       assert.strictEqual(sut.matcher, 'compact');
       assert.strictEqual(result.length, 1, result.join('|'));
       assertExecutableFile(result[0]);
     },
   );

   test(
     'Given hooks/hooks.json, when parsed, then PreCompact binds an empty matcher to an existing, executable steer hook',
     () => {
       const sut = readHooksConfig().hooks.PreCompact[0];

       const result = expandHookCommand(sut.hooks[0].command, { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: ROOT });

       assert.strictEqual(sut.matcher, '');
       assert.strictEqual(result.length, 1, result.join('|'));
       assertExecutableFile(result[0]);
     },
   );
   ~~~
   In the JS source, `SH_ARGV_DUMP` is written with a double backslash (`"%s\\0"`) so sh
   receives `printf "%s\0"` and emits NUL-separated argv. Why these pass now: the checkout
   path contains no space, so the unquoted command expands to the single word
   ROOT/hooks/<script> under sh, which is the executable hook. They also pass after GREEN
   (the quoted form expands to the same single word), which is the point of the rewrite:
   the old `.replace` would break on the quotes. If the checkout path ever contains a space,
   these two are RED until GREEN; that is expected, not a regression.

2. **RED — spaced plugin root, one test per event.** Append after the PreToolUse test:
   ~~~js
   for (const { event, script } of REGISTERED_HOOKS) {
     test(`Given a plugin root containing a space, when the ${event} command is expanded by sh, then it is one word naming the executable hook under that root`, () => {
       withSpacedRoots(({ plugin }) => {
         const sut = expandHookCommand;

         const result = sut(registeredCommand(event), { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: plugin });

         assert.deepStrictEqual(result, [path.join(plugin, 'hooks', script)]);
         assertExecutableFile(result[0]);
       });
     });
   }
   ~~~
   Expected failure (all three events): `deepStrictEqual` sees 3 words,
   `['<tmp>/craft-hook-root-XXXXXX/plug', 'in', 'root/hooks/<script>']`, because the unquoted
   command is field-split on the space.

3. **RED — `CRAFT_ROOT` override wins, one test per event.** Inside the same `for` loop,
   after the step-2 test:
   ~~~js
     test(`Given CRAFT_ROOT set to a root containing a space, when the ${event} command is expanded by sh, then CRAFT_ROOT wins`, () => {
       withSpacedRoots(({ plugin, override }) => {
         const sut = expandHookCommand;

         const result = sut(registeredCommand(event), { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: plugin, CRAFT_ROOT: override });

         assert.deepStrictEqual(result, [path.join(override, 'hooks', script)]);
         assertExecutableFile(result[0]);
       });
     });
   ~~~
   Expected failure (all three events): 2 words,
   `['<tmp>/craft-hook-root-XXXXXX/alt', 'root/hooks/<script>']`.

4. **RED — PreToolUse pins the quoted command.** Replace the old PreToolUse test (old lines
   237-248) with:
   ~~~js
   test('Given hooks/hooks.json, when parsed, then PreToolUse binds Bash to the quoted git-no-ext-diff command', () => {
     const sut = readHooksConfig();

     const result = sut.hooks.PreToolUse;

     assert.deepStrictEqual(result, [
       {
         matcher: 'Bash',
         hooks: [{ type: 'command', command: '"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/git-no-ext-diff.sh"' }],
       },
     ]);
   });
   ~~~
   Expected failure: actual `command` is the unquoted
   `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/git-no-ext-diff.sh`. Run the suite now:
   7 fail (steps 2-4), 54 pass.

5. **GREEN — quote the three commands** in `hooks/hooks.json`. Each line becomes, e.g.:
   ~~~json
   { "type": "command", "command": "\"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/git-no-ext-diff.sh\"" }
   ~~~
   Same for reorient-after-compact.sh (line 15) and steer-compact-summary.sh (line 23).
   Result: the hooks suite has 61 tests, all passing.

6. **GUARD — the shim count.** Run test/craft-root-shim.test.js unedited. It passes because
   `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/...` still contains the substring
   `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/` once per command (count 3) and no bare
   `${CLAUDE_PLUGIN_ROOT}/`.

7. **CHANGELOG.** Under `## [Unreleased]` in `CHANGELOG.md` add (blank line before
   `## [1.1.0]` kept):
   ~~~md
   ### Fixed
   - The plugin's hooks run when the plugin is installed under a path containing a space.
   ~~~

8. **REFACTOR.** None needed beyond step 1: `readHooksConfig` already replaces the three
   duplicated `JSON.parse(fs.readFileSync(...))` calls, and `assertExecutableFile` the
   duplicated stat assertions. Confirm no leftover `.replace('${CRAFT_ROOT:-` remains in the
   suite.

Manual proof (record in the part handback, not committed): `claude plugin validate .` from
the worktree prints no `Validating hooks:` section and no `hooks.` lines; the marketplace
`description` warning still appears. If the `claude` binary is unavailable, say so in the
handback; the unit tests are the gate.

### Gate

```
node --test test/hooks.test.js test/craft-root-shim.test.js
grep -c '"command": "\\"\${CRAFT_ROOT:-\${CLAUDE_PLUGIN_ROOT}}/hooks/' hooks/hooks.json   # expect 3
```

### Commit

`fix(hooks): quote the plugin-root path in hook commands`

## Part 2 — Drop bats and yq from the dev-tool install; delete the bats helpers

### Context

Files this part edits or deletes:

- `scripts/install-dev-tools.sh` (37 lines). Today: `APT_PACKAGES=(bats shellcheck jq)`,
  `YQ_VERSION`, `YQ_SHA256_AMD64`, `YQ_SHA256_ARM64`, `YQ_BIN_DIR`, `as_root()`,
  `yq_sha256()`, `install_yq()`, and `main()` which probes `dpkg --print-architecture`,
  looks up the checksum, runs `as_root apt-get update`, `as_root apt-get install -y
  "${APT_PACKAGES[@]}"`, then `install_yq`. Target: only `as_root` and the two apt calls
  remain (exact text in TDD step 2).
- `test/install-dev-tools.test.js` (141 lines). Layout:
  - lines 15-18 kept constants: `THROWAWAY_PREFIX`, `EXECUTABLE_MODE`, `NON_ROOT_UID`,
    `ROOT_UID`.
  - lines 19-26 constants to delete: `UNSUPPORTED_ARCH`, `CHECKSUM_MISMATCH`,
    `YQ_RELEASE_URL`, `YQ_SHA256` (object, 22-25), `DOWNLOAD`.
  - lines 27-31: `SUDO`, `APT_UPDATE`, `APT_INSTALL` (`'apt-get install -y bats shellcheck
    jq'`), `SHARED_SCRIPT_STEP`, `INLINE_INSTALL` (`[/apt-get install/, /mikefarah\/yq/]`).
  - lines 33-41 `STUBS` with keys `dpkg`, `id`, `sudo`, `apt-get`, `curl`, `sha256sum`,
    `install`. The `sudo` stub logs then `exec "$@"`, so it runs its arguments for real.
  - lines 43-48 `writeStubs(stubDir)` — unchanged.
  - lines 50-79 `runInstall({ arch, uid, shaStatus = '0' })`: makes tmp, `bin` stub dir,
    `scratch` dir, `tools.log`, `download.log`; env spreads `process.env` and sets `PATH`,
    `TMPDIR`, `TOOL_LOG`, `DOWNLOAD_LOG`, `FAKE_ARCH`, `FAKE_UID`, `FAKE_SHA_STATUS`,
    `YQ_BIN_DIR`; returns `{ status, stderr, log, target, leftovers }`.
  - lines 81-89 `expectedNonRootLog(target, arch)` — eight-line log incl. curl/sha256sum/
    install.
  - line 91 `withoutSudo` — unchanged.
  - tests: 93 amd64 non-root (kept, retitled), 101 arm64 (deleted), 108 unsupported arch
    (deleted), 116 root (kept, retitled), 123 checksum mismatch (deleted), 131 CI uses the
    shared script (kept unchanged; it iterates `INLINE_INSTALL`).
- `test/helpers/hooks.bash`, `test/helpers/worktree.bash`, `test/helpers/manifest-lint.bash`
  — deleted with `git rm`. Nothing sources them; `git ls-files '*.bats'` is empty; ci.sh runs
  only node test files. The other files in test/helpers (ambient-env.js, craft-run.js,
  region-slice.js, tmp-git-repo.js) are live and stay.
- `docs/contributing/maintainer-smokes.md` line 473 (devcontainer cold-start smoke). Today:
  `` `yq --version` reports v4.44.3, `claude --version` runs, `bash scripts/ci.sh` passes, and ``.
  Drop the yq clause only; the trailing "Optionally repeat in a local arm64 devcontainer"
  stays.

Read-only references (must stay byte-identical; do not edit):

- .github/workflows/ci.yml (line 28 runs `bash scripts/install-dev-tools.sh`) and
  .devcontainer/devcontainer.json (`postCreateCommand`).
- test/devcontainer.test.js pins only the smoke heading and the `postCreateCommand` string;
  the smoke-line edit does not touch either.
- CONTRIBUTING.md line 13 already lists "Node 22, `jq` and `shellcheck`".
- Remaining mentions of bats/yq that stay as written: the dated docs under
  docs/contributing/{archive,design,plan,adr,prd}, BACKLOG.md delivered entries,
  test/fixtures/manifest/invalid-unknown-gates-field.workflow.md line 7 (fixture prose),
  engine/test/scenarios.test.js line 251 (`TOOLCHAIN_TOKENS`, consumer-toolchain vocabulary),
  engine/test/manifest.test.js line 801 (historic comment). The archive mentions of the helper
  files are inline code, not links, so the offline lychee check is unaffected.

Ordering constraint: keep every stub (`dpkg`, `curl`, `sha256sum`, `install`) in place
until the script is shrunk. The `sudo` stub `exec`s its arguments, so on a Linux box with a
real `dpkg`, an unshrunk script run without those stubs would download a real binary and run
a real `install`.

Coding rules: Given/When/Then titles, AAA bodies, subject named `sut`; no comments naming
ADRs, phases or backlog items; no lint-suppression directives.

### TDD steps

1. **RED — the kept tests expect the apt-only log; the removed behaviour's tests go.**
   Stubs, `runInstall` and its env stay exactly as they are in this step.
   - `APT_INSTALL` → `'apt-get install -y shellcheck jq'`.
   - `expectedNonRootLog` becomes argument-free:
     ~~~js
     function expectedNonRootLog() {
       return [`${SUDO} apt-get`, APT_UPDATE, `${SUDO} apt-get`, APT_INSTALL];
     }
     ~~~
   - Test at line 93: retitle to
     `'Given a non-root user, when the install script runs, then every apt-get call goes through sudo'`;
     assert `deepStrictEqual(sut.log, expectedNonRootLog())` (keep the `leftovers` assertion
     for now; it goes in REFACTOR).
   - Test at line 116: retitle to
     `'Given root, when the install script runs, then it calls apt-get without sudo'`;
     assert `deepStrictEqual(sut.log, withoutSudo(expectedNonRootLog()))`.
   - Delete the tests at lines 101 (arm64), 108 (unsupported arch) and 123 (checksum
     mismatch): they specify the behaviour step 2 removes. Deleting them here, not after
     GREEN, keeps step 2 all-green (after the shrink the script exits 0 on any arch, so the
     unsupported-arch and checksum tests could only fail).
   Expected failure (both kept tests): the actual log still holds
   `'apt-get install -y bats shellcheck jq'` and the four yq lines
   (`curl -fsSL -o <download> https://…/v4.44.3/yq_linux_amd64`,
   `sha256sum -c --quiet - a2c0…`, `sudo install`, `install -m 0755 <download> <tmp>/yq`),
   where the expectation ends at `'apt-get install -y shellcheck jq'`. Suite: 1 pass (the CI
   test), 2 fail.

2. **GREEN — shrink the script.** `scripts/install-dev-tools.sh` becomes exactly:
   ~~~bash
   #!/usr/bin/env bash
   # Installs the dev-tool set CI and the devcontainer share, beyond Node.
   set -euo pipefail
   readonly APT_PACKAGES=(shellcheck jq)
   as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
   main() {
     as_root apt-get update
     as_root apt-get install -y "${APT_PACKAGES[@]}"
   }
   main "$@"
   ~~~
   Keep the file mode as it is. Suite: 3 pass. `shellcheck scripts/install-dev-tools.sh`
   clean.

3. **REFACTOR — remove the now-dead harness.**
   - Delete constants `UNSUPPORTED_ARCH`, `CHECKSUM_MISMATCH`, `YQ_RELEASE_URL`,
     `YQ_SHA256`, `DOWNLOAD`.
   - `INLINE_INSTALL` → `[/apt-get install/]`.
   - `STUBS` keeps only `id`, `sudo`, `apt-get` (bodies unchanged).
   - `runInstall`:
     ~~~js
     function runInstall({ uid }) {
       const tmp = fs.mkdtempSync(path.join(os.tmpdir(), THROWAWAY_PREFIX));
       try {
         const stubDir = path.join(tmp, 'bin');
         const toolLog = path.join(tmp, 'tools.log');
         writeStubs(stubDir);
         fs.writeFileSync(toolLog, '');
         const result = spawnSync('bash', [SCRIPT], {
           encoding: 'utf8',
           env: {
             ...process.env,
             PATH: stubDir + path.delimiter + process.env.PATH,
             TOOL_LOG: toolLog,
             FAKE_UID: uid,
           },
         });
         const log = fs.readFileSync(toolLog, 'utf8').split('\n').filter(Boolean);
         return { status: result.status, stderr: result.stderr, log };
       } finally {
         fs.rmSync(tmp, { recursive: true, force: true });
       }
     }
     ~~~
   - Callers: `runInstall({ uid: NON_ROOT_UID })` and `runInstall({ uid: ROOT_UID })`;
     drop the `assert.deepStrictEqual(sut.leftovers, [])` line from the non-root test.
   - Check: `grep -n -E 'arch|yq|leftovers|target|DOWNLOAD|dpkg|curl|sha256' test/install-dev-tools.test.js`
     prints nothing. Suite: 3 pass.

4. **GUARD — the CI-uses-the-shared-script test (line 131, unchanged body).** Passes before
   and after the `INLINE_INSTALL` change: no ci.yml step runs `apt-get install` inline, and
   the ci job still runs `bash scripts/install-dev-tools.sh`.

5. **Delete the bats helpers.**
   `git rm test/helpers/hooks.bash test/helpers/worktree.bash test/helpers/manifest-lint.bash`.
   GUARD: no suite sources them, so every suite stays green.

6. **Drop the yq smoke clause.** In `docs/contributing/maintainer-smokes.md` line 473,
   replace `` `yq --version` reports v4.44.3, `claude --version` runs `` with
   `` `claude --version` runs `` (one-line edit, no reflow). GUARD: test/devcontainer.test.js
   pins only the heading and `postCreateCommand`, so it stays green.

### Gate

```
node --test test/install-dev-tools.test.js test/devcontainer.test.js
shellcheck scripts/install-dev-tools.sh
grep -n -E 'yq|YQ_|dpkg|curl|sha256sum|install -m|bats' scripts/install-dev-tools.sh   # expect no output
git ls-files 'test/helpers/*.bash'   # expect no output
git grep -n -E 'helpers/(hooks|worktree|manifest-lint)\.bash' -- ':!docs/contributing/archive' ':!docs/contributing/design' ':!docs/contributing/plan' ':!docs/contributing/adr' ':!docs/contributing/prd'   # expect no output
grep -c 'yq' docs/contributing/maintainer-smokes.md   # expect 0
git diff --no-ext-diff --exit-code HEAD -- .github/workflows/ci.yml .devcontainer/devcontainer.json
```

Phase gate after both parts: `bash scripts/ci.sh` (exit 0 in the dry-run clone).

### Commit

`chore(dev-tools): drop bats and yq from the shared install and delete the bats helpers`
