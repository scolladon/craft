# Design — backlog sweep: quote the hook commands, drop unused dev tools

> Brief: close the two open follow-ups from the public-front-door-completion run.
> (1) Quote the plugin-root placeholder in `hooks/hooks.json` so `claude plugin validate .`
> reports no hooks warnings and a plugin root containing a space still runs the hooks.
> (2) Drop `bats` and `yq` from `scripts/install-dev-tools.sh` and delete the orphaned
> `test/helpers/*.bash` bats helpers (the user already chose this option).
> Status: draft → self-reviewed ×3 → accepted

## Context

### Item 1: hook commands

`hooks/hooks.json` registers three shell-form `type: "command"` hooks. Each one uses the
binding-neutral root shim from ADR-217 without quotes:

| Line | Event (matcher) | Command today |
|---|---|---|
| 7 | `PreToolUse` (`Bash`) | `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/git-no-ext-diff.sh` |
| 15 | `SessionStart` (`compact`) | `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/reorient-after-compact.sh` |
| 23 | `PreCompact` (`""`) | `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/steer-compact-summary.sh` |

`claude plugin validate .` (Claude Code 2.1.296) passes, but prints one warning per command
(`hooks.PreToolUse`, `hooks.SessionStart`, `hooks.PreCompact`): "Shell command uses
${CLAUDE_PLUGIN_ROOT} without quotes … Wrap the placeholder in double quotes, or use exec
form". It also prints a separate marketplace warning, `description: No marketplace description
provided`, which belongs to `.claude-plugin/marketplace.json` and is not part of this change.

Every other operational use of the shim already quotes the whole path. All 43 occurrences in
`skills/*/SKILL.md` have the form `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/<path>"`. Counted per
file, quoted occurrences equal total occurrences, and both match the `TARGET_FILES` counts in
`test/craft-root-shim.test.js`. So `hooks/hooks.json` is the only file on the Claude binding
that does not follow this style.

These tests pin the command strings:

- `test/hooks.test.js:207-220`: SessionStart test. It resolves the hook path with
  `sut.hooks[0].command.replace('${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}', ROOT)`, then
  `fs.statSync` + `S_IXUSR`.
- `test/hooks.test.js:222-235`: the same resolution for PreCompact.
- `test/hooks.test.js:237-248`: "PreToolUse is unchanged". A `deepStrictEqual` pins the exact
  command string.
- `test/craft-root-shim.test.js:10,16,54-79`: `SHIM = '${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/'`.
  It pins `hooks/hooks.json` to exactly 3 occurrences and checks that no bare
  `${CLAUDE_PLUGIN_ROOT}/` remains outside the shim.
- `test/craft-root-shim.test.js:92-114`: proves the shim's bash fallback semantics, with
  `CRAFT_ROOT` unset and with it set.

The adapter `hooks.json` files (`adapters/codex/hooks.json`, `adapters/cursor/hooks.json`,
`adapters/antigravity/plugins/craft/hooks.json`) are other bindings' surfaces with their own
suites. `claude plugin validate .` reads only `hooks/hooks.json`.

### Item 2: dev-tool install set

ADR-505 made `scripts/install-dev-tools.sh` the single dev-tool install script. Both the CI
`ci` job (`.github/workflows/ci.yml:28`) and the devcontainer `postCreateCommand` run it. Today
it installs `APT_PACKAGES=(bats shellcheck jq)` and downloads mikefarah `yq` v4.44.3 per
architecture against pinned SHA-256 checksums.

Which tools have consumers (`git grep -w`, excluding the dated `archive/design/plan/adr/prd`
docs and `metrics/`):

| Tool | Consumer | Verdict |
|---|---|---|
| `shellcheck` | `scripts/static-lints.sh:7` (`shellcheck scripts/*.sh hooks/*.sh`), which `scripts/ci.sh:80` calls | keep |
| `jq` | `hooks/{bound-run,git-no-ext-diff,reorient-after-compact,steer-compact-summary}.sh`, run by `test/hooks.test.js` | keep |
| `bats` | none. `git ls-files '*.bats'` is empty, and `ci.sh` runs only `*.test.js` | drop |
| `yq` | none. Only `scripts/install-dev-tools.sh` itself mentions it | drop |

`test/helpers/hooks.bash`, `test/helpers/worktree.bash` and `test/helpers/manifest-lint.bash`
(86 lines in total) are the bats helpers left over from the port to `node:test`. Nothing
sources them. The only mentions are in five `docs/contributing/archive/*` files, as inline
code, not markdown links, so the offline lychee link check is unaffected. The other files in
`test/helpers/` (`ambient-env.js`, `craft-run.js`, `region-slice.js`, `tmp-git-repo.js`) are
live and stay.

`CONTRIBUTING.md:13` already tells contributors to install only "Node 22, `jq` and
`shellcheck`", so after the change the install set matches the documented set.

`test/install-dev-tools.test.js` pins the script's exact tool log through PATH stubs
(`STUBS`: `dpkg`, `id`, `sudo`, `apt-get`, `curl`, `sha256sum`, `install`). It has six
tests:

| Line | Test | After this change |
|---|---|---|
| 93 | amd64 non-root: sudo on every privileged call, yq verified | rewritten as the non-root sudo test, apt only |
| 101 | arm64 fetches arm64 yq | removed (behaviour removed) |
| 108 | unsupported arch exits non-zero | removed (no arch probe left) |
| 116 | root: no sudo | kept, apt only |
| 123 | checksum mismatch | removed (behaviour removed) |
| 131 | CI uses the shared script, no inline install | kept, `INLINE_INSTALL` per DC-2 |

`docs/contributing/maintainer-smokes.md:473` (the devcontainer cold-start smoke) asks the
maintainer to confirm "`yq --version` reports v4.44.3". `test/devcontainer.test.js` pins only
the smoke heading and the `postCreateCommand` string. Neither changes.

ADR-505's Context lists "bats, shellcheck, jq, mikefarah yq v4" and its Decision describes the
yq architecture selection. The decisions phase records the user's choice as a new ADR that
refines ADR-505. ADRs are dated records, so ADR-505 is not edited.

## Requirements

1. **R1**: Each of the three commands in `hooks/hooks.json` is a shell-form string with the
   whole path in double quotes:
   `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/<script>.sh"`. Events, matchers, `type` and
   order stay the same.
2. **R2**: `claude plugin validate .` prints no `hooks.*` warning lines. The marketplace
   `description` warning still appears.
3. **R3**: Under `sh -c` with a plugin root that contains a space, each registered command
   expands to exactly one word, and that word is the existing, executable hook script.
   This holds whether `CRAFT_ROOT` is unset (the path comes from `CLAUDE_PLUGIN_ROOT`) or set
   (`CRAFT_ROOT` wins). The ADR-217 override behaviour is preserved.
4. **R4**: `scripts/install-dev-tools.sh` runs only `apt-get update` and
   `apt-get install -y shellcheck jq`, prefixed with `sudo` when not root. No `yq`, `dpkg`,
   `curl`, `sha256sum`, `install` or `YQ_*` code remains.
5. **R5**: `test/helpers/{hooks,worktree,manifest-lint}.bash` are deleted. No tracked file
   outside the dated docs refers to them.
6. **R6**: The devcontainer cold-start smoke in `docs/contributing/maintainer-smokes.md` no
   longer mentions `yq`.
7. **R7**: `.github/workflows/ci.yml` and `.devcontainer/devcontainer.json` are byte-identical
   to before. The test that checks CI uses the shared script stays green.
8. **R8**: `CHANGELOG.md` `[Unreleased]` gets a `### Fixed` line for R1, because hooks now run
   from a plugin root that contains a space. Item 2 gets no line, because it is CI plumbing,
   which `docs/contributing/releasing.md` "Curating the changelog" excludes.
9. **R9**: Both BACKLOG entries in the "follow-ups surfaced by the
   public-front-door-completion run" block are marked delivered, in the house format
   (`— delivered YYYY-MM-DD (<slug>)` plus a short delivered note).
10. **R10**: `bash scripts/ci.sh` is green, and so are `shellcheck` on the edited script and
    `design-lint` on this doc.

## Design

### Pinned external behaviour: the Claude Code hook runner

All probes below ran against Claude Code 2.1.296 in `mktemp` throwaways, never the worktree.
`<tmp>` stands for the throwaway directory.

**P1: validator verdicts.** One `PreToolUse` command per throwaway plugin, checked with
`claude plugin validate .`:

| Form | Command | Validator |
|---|---|---|
| F (today) | `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/x.sh` | warning |
| A whole-path quoted | `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/x.sh"` | clean |
| B placeholder quoted | `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}"/hooks/x.sh` | clean |
| C inner only | `${CRAFT_ROOT:-"${CLAUDE_PLUGIN_ROOT}"}/hooks/x.sh` | clean |
| E single quotes | `'${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/x.sh'` | clean |
| D exec, bare | `command: bash`, `args: ["${CLAUDE_PLUGIN_ROOT}/hooks/x.sh"]` | clean |
| G exec, shim | `command: bash`, `args: ["${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/x.sh"]` | clean |

The validator only checks whether quotes are present. It accepts C, E and G, which P2 shows
do not work. A clean validator run therefore does not prove correctness, and R3 needs its own
test.

When the hooks are clean, the validator prints no `Validating hooks:` section at all. A control
run on an unmodified copy prints the section with the three warnings. A throwaway copy with all
three commands in form A prints only the marketplace warning, which proves R2 is reachable.

**P2: runtime behaviour.** A throwaway plugin rooted at `<tmp>/plug in root` registered nine
`SessionStart` hooks, each logging to a file. It ran through
`claude -p --model haiku --plugin-dir "<tmp>/plug in root"` twice: once with `CRAFT_ROOT`
unset, and once with `CRAFT_ROOT=<tmp>/alt root`, which holds its own probe script.

| Probe | `CRAFT_ROOT` unset | `CRAFT_ROOT=<tmp>/alt root` |
|---|---|---|
| `echo '${CLAUDE_PLUGIN_ROOT}'` | logs the literal `${CLAUDE_PLUGIN_ROOT}` | same |
| `$0` / `$BASH_VERSION` / `$CLAUDE_PLUGIN_ROOT` | `/bin/sh` / `3.2.57` / `<tmp>/plug in root` | same |
| F (today) | **did not run** | **did not run** |
| A whole-path quoted | ran main | ran **alt** |
| B placeholder quoted | ran main | ran **alt** |
| C inner only | ran main | **did not run** |
| E single quotes | did not run | did not run |
| G exec, shim | did not run | did not run |
| D exec, bare | ran main | ran main (**ignores `CRAFT_ROOT`**) |

Both sessions exited 0 and replied `ok`. A hook whose command fails to resolve was skipped
without stopping the session. This was observed for `SessionStart`; `PreToolUse` was not
probed separately.

What the probes establish:

- Shell-form commands run under `/bin/sh -c`, and `CLAUDE_PLUGIN_ROOT` reaches the shell as an
  **environment variable**. Claude does not substitute the text first: the single-quoted
  literal survives unexpanded. So shell quoting is what protects the path, and a quoted shim
  keeps the `CRAFT_ROOT` fallback.
- Exec form passes `args` without a shell, so `${CRAFT_ROOT:-…}` is never expanded (G).
  Exec form with only `${CLAUDE_PLUGIN_ROOT}` runs (D), but drops the ADR-217 `CRAFT_ROOT`
  override.
- Only A and B satisfy R3 in both columns.

**P3: shell semantics without Claude.** The same matrix under `sh` (macOS: bash 3.2 in POSIX
mode) and `dash` (what `/bin/sh` is on the Ubuntu CI runner). For each form it records
`set -- <command>; echo $#` (the word count) and the result of actually running it:

| Form | Shell | `CRAFT_ROOT` | Words | Run |
|---|---|---|---|---|
| F | sh, dash | unset | 3 | `<tmp>/plug: not found` |
| F | sh, dash | alt | 2 | `<tmp>/alt: not found` |
| A | sh, dash | unset | 1 | ran `plug in root` |
| A | sh, dash | alt | 1 | ran `alt root` |
| B | sh, dash | unset / alt | 1 / 1 | ran main / alt |

**P4: effect on `test/craft-root-shim.test.js`.** With `SHIM = '${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/'`:

| Form | Shim occurrences per command | Bare `${CLAUDE_PLUGIN_ROOT}/` left |
|---|---|---|
| A | 1 | no |
| B | 0 (the `"` sits between `}}` and `/`) | no |

Form A leaves the `hooks/hooks.json` count at 3, so that suite needs no edit. Form B makes it
fail with count 0.

### Part 1: quote the hook commands (form A, pending DC-1)

**Context for the implementer:**

- `hooks/hooks.json` lines 7, 15, 23. Change only the `command` string value, e.g.
  `"command": "\"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/git-no-ext-diff.sh\""`.
- `test/hooks.test.js`. Symbols: `ROOT` (line 10), `HOOKS_DIR` (line 11), the tests at
  207-220, 222-235 and 237-248. `spawnSync`, `fs`, `os` and `path` are already imported.
- `test/craft-root-shim.test.js`: no edit (P4).

**Test helper.** Add a local helper to `test/hooks.test.js` that replaces the brittle
`.replace(SHIM, ROOT)` with how the runner really expands a command (P2: `/bin/sh -c`, root
supplied through the environment):

```js
const SH_ARGV_DUMP = '; printf "%s\\0" "$@"';

// Expands a registered command the way Claude's runner does: /bin/sh -c with the plugin root in the environment.
function expandHookCommand(command, env) {
  const result = spawnSync('sh', ['-c', `set -- ${command}${SH_ARGV_DUMP}`], { env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`sh exited ${result.status}: ${result.stderr}`);
  return result.stdout.split('\0').filter(Boolean);
}
```

`env` is built explicitly as `{ PATH, CLAUDE_PLUGIN_ROOT[, CRAFT_ROOT] }`, never spread from
`process.env`. That way an ambient `CRAFT_ROOT` cannot leak in.

**Spaced-root fixture.** Use `fs.mkdtempSync(os.tmpdir())`, then
`fs.symlinkSync(ROOT, path.join(tmp, 'plug in root'))` and
`fs.symlinkSync(ROOT, path.join(tmp, 'alt root'))`, and `fs.rmSync` in `finally`. Symlinks
avoid copying the repo while still giving a real executable target behind a path with a space.

**Test changes:**

1. Rewrite the SessionStart and PreCompact tests (207-235) to resolve through
   `expandHookCommand(command, { PATH, CLAUDE_PLUGIN_ROOT: ROOT })`. Assert a single word, a
   regular file, and `S_IXUSR`. The matcher assertions stay.
2. Update the PreToolUse `deepStrictEqual` (237-248) to the quoted string. The title "is
   unchanged" no longer fits; rename it to state the pinned binding, for example "then
   PreToolUse binds Bash to the quoted git-no-ext-diff command".
3. Add a test generated per event over `['PreToolUse', 'SessionStart', 'PreCompact']`:
   "Given a plugin root containing a space, when the `<event>` command is expanded by sh, then
   it is one word naming the executable hook under that root". Expected argv:
   `[path.join(spacedRoot, 'hooks', <script>)]`.
4. Add a matching per-event test with `CRAFT_ROOT` set to the `alt root` symlink: "…then
   `CRAFT_ROOT` wins". Expected argv: `[path.join(altRoot, 'hooks', <script>)]`.

Tests 3 and 4 are the RED tests. Against today's file, F expands to 3 words or 2 words (P3),
so `deepStrictEqual` on argv fails.

**CHANGELOG.** Under `## [Unreleased]` add `### Fixed` with one line, e.g. "The plugin's hooks
run when the plugin is installed under a path containing a space."

### Part 2: drop bats and yq; delete the bats helpers

**Context for the implementer:**

- `scripts/install-dev-tools.sh` (36 lines). Remove `YQ_VERSION`, `YQ_SHA256_AMD64`,
  `YQ_SHA256_ARM64`, `YQ_BIN_DIR`, `yq_sha256()`, `install_yq()`, and from `main()` the
  `dpkg --print-architecture` probe, the `sha256` lookup and the `install_yq` call.
- Target shape:

```bash
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
```

- `test/install-dev-tools.test.js`:
  - Constants to remove: `UNSUPPORTED_ARCH`, `CHECKSUM_MISMATCH`, `YQ_RELEASE_URL`,
    `YQ_SHA256`, `DOWNLOAD`.
  - `APT_INSTALL` becomes `'apt-get install -y shellcheck jq'`.
  - `STUBS` shrinks to `id`, `sudo`, `apt-get`. This happens only in the refactor step after
    GREEN (see Test strategy), so no RED run reaches a real `curl`, `install` or `dpkg`.
  - `runInstall({ uid })` drops the `scratch`/`TMPDIR`, `DOWNLOAD_LOG`, `FAKE_ARCH`,
    `FAKE_SHA_STATUS` and `YQ_BIN_DIR` env, the `leftovers` result and the `target` result.
  - `expectedNonRootLog()` takes no arguments and returns
    `[sudo apt-get, APT_UPDATE, sudo apt-get, APT_INSTALL]`.
  - `withoutSudo` stays.
  - Tests 93, 116 and 131 stay, with titles reworded so yq is no longer mentioned.
    Tests 101, 108 and 123 are removed.
  - `INLINE_INSTALL` follows DC-2.
- `git rm test/helpers/hooks.bash test/helpers/worktree.bash test/helpers/manifest-lint.bash`.
- `docs/contributing/maintainer-smokes.md:473` follows DC-3.
- Unchanged: `.github/workflows/ci.yml`, `.devcontainer/devcontainer.json`, `CONTRIBUTING.md`
  (it already lists jq and shellcheck), `test/devcontainer.test.js`, ADR-505.

### Part 3: bookkeeping (documentation phase)

- `BACKLOG.md`: mark both entries in the 2026-10-12 public-front-door follow-up block as
  delivered (R9).
- The new ADR that refines ADR-505 comes from the decisions phase, not from this doc.

### Edge behaviour

- **A plugin root containing `"`, `$` or a backtick.** The root reaches the shell as an
  environment variable (P2), so the contents of a quoted expansion are not re-parsed.
  Probe P5: a root whose name contains a double quote, a literal `$HOME`, a backtick-wrapped
  `id` and a space ran its form-A hook under both `sh` and `dash`. No test is added, because such roots do not occur on supported installs.
- **`CRAFT_ROOT` set to an empty string.** Under POSIX `:-`, an empty value counts as unset, so
  `CLAUDE_PLUGIN_ROOT` is used. Quoting does not change this behaviour, and it is not tested
  today (`craft-root-shim.test.js:92-114` covers only unset and set).
- **The failure mode before the fix.** The hook did not run and the session continued (P2,
  for `SessionStart`). This design asserts nothing about `PreToolUse` fail-open behaviour,
  because it was not probed.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | How the hook commands carry the plugin root | (a) whole-path double quotes `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/x.sh"`; (b) placeholder-only quotes `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}"/hooks/x.sh`; (c) exec form `{command: bash, args: ["${CLAUDE_PLUGIN_ROOT}/hooks/x.sh"]}` | (a) | (a) and (b) both pass the validator and run from spaced roots with and without the `CRAFT_ROOT` override (P2, P3). (a) is already the style of all 43 skill invocations, and it keeps the `craft-root-shim` count test unchanged (P4). (b) gives a shim count of 0 and needs a new shim constant. (c) cannot expand `${CRAFT_ROOT:-…}` (G did not run), and its bare variant ignores `CRAFT_ROOT` (D), which breaks ADR-217. |
| DC-2 | What `INLINE_INSTALL` in `test/install-dev-tools.test.js` guards once yq is gone | (a) reduce to `[/apt-get install/]`; (b) keep `/mikefarah\/yq/` as a guard against re-adding an inline yq install; (c) replace it with a generic download guard (`/curl\|wget/`) | (a) | The guard exists to keep the shared tool set from being installed inline. yq is no longer in that set, so keeping (b) would guard against a tool nobody uses (YAGNI). (c) widens the rule to new territory without evidence it is needed. |
| DC-3 | What replaces "`yq --version` reports v4.44.3" in the devcontainer smoke | (a) drop the clause; (b) replace it with "`shellcheck --version` and `jq --version` run" | (a) | The same sentence already requires `bash scripts/ci.sh` to pass. `ci.sh` runs `shellcheck` (`static-lints.sh:7`) and the hooks suite, which needs `jq`, so (b) repeats an existing check. The trailing "Optionally repeat in a local arm64 devcontainer" stays, because it still covers apt and the Claude feature on arm64. |

The user already decided Item 2's scope (drop both tools and delete the helpers), so it is not
a candidate.

## Test strategy

TDD (London school), RED → GREEN → refactor. Titles use Given/When/Then, bodies use AAA, and
the subject is named `sut`.

- **Part 1 RED.** The new per-event spaced-root tests (both `CRAFT_ROOT` columns) fail against
  today's `hooks/hooks.json`, because argv has 3 or 2 words (P3). The updated PreToolUse
  `deepStrictEqual` also fails until the string is quoted. GREEN: quote the three commands.
  The rewritten SessionStart/PreCompact resolution tests go green through `expandHookCommand`.
  `test/craft-root-shim.test.js` stays green untouched, which proves P4.
- **Part 2 RED.** Update `APT_INSTALL` and `expectedNonRootLog()` first, and keep every stub
  in place. The non-root and root tests then fail, because the stubbed log still contains the
  `curl`/`sha256sum`/`install` lines. GREEN: shrink the script. REFACTOR: delete the
  yq/arch/checksum tests together with the behaviour they covered, then remove the stubs, env
  and constants that are now unused. Stubs stay until the script is shrunk because the `sudo`
  stub `exec`s its arguments: on a Linux box with real `dpkg`, an unshrunk script with missing
  stubs would download a real binary and run a real `install`. Each remaining assertion pins
  the exact log.
- **Edge matrix.** For each of the three commands, the root takes 2 values (spaced
  `CLAUDE_PLUGIN_ROOT`, and the `CRAFT_ROOT` override) under `sh`. CI covers `dash` through
  Ubuntu's `/bin/sh`, and macOS covers bash-as-sh.
- **Manual proof of done, recorded in the PR.** Run `claude plugin validate .` and confirm it
  has no `hooks.` lines (R2). Run a `sh -c` check of a quoted command from a `mktemp` root
  containing a space (R3, as in P3). Run `shellcheck scripts/install-dev-tools.sh`.
- **Gate.** `bash scripts/ci.sh` green. Coverage stays ≥80%. Mutation testing is not
  applicable: no engine source is touched, only JSON, a bash script and tests.
- **Property lenses.** Not applicable: no parser, matcher or round-trip pair is touched.

## Out of scope

- The `.claude-plugin/marketplace.json` `description` warning: a different surface, and not a
  hooks warning.
- `adapters/codex/hooks.json` (`node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/…`, also
  unquoted), `adapters/cursor/hooks.json` and `adapters/antigravity/plugins/craft/hooks.json`
  (`node ${CRAFT_ROOT}/…`): other bindings' runners, with their own suites and live proofs.
  `claude plugin validate` does not read them. Each is a separate backlog candidate.
- Historic mentions of bats, yq and the helper files in the dated docs (`docs/contributing/`
  `archive`, `design`, `plan`, `adr`, `prd`) and in `BACKLOG.md` delivered entries: these are
  dated records and are kept as written.
- The fixture prose in `test/fixtures/manifest/invalid-unknown-gates-field.workflow.md:7`
  ("yq-backed parser"): fixture text, not a consumer of yq.
- `engine/test/scenarios.test.js:251` `TOOLCHAIN_TOKENS` contains `bats`: a vocabulary of
  consumer-repo toolchains, unrelated to craft's own dev tools.
- Proving `PreToolUse` fail-open behaviour on an unresolved command: not needed for the fix.
  It would take a live run in which the model issues a Bash call.
- Bumping the version or tagging a release: the `docs/contributing/releasing.md` procedure
  handles that separately. Never push tags.
