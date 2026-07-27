# Plan — portable named configs (user-scope resolution)

> Source: design doc `docs/DESIGN-portable-named-configs.md` · ADRs none (decisions inline, resolved 2026-07-04)
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

Three parts, each one atomic conventional commit, sequential in one working tree,
each building on committed predecessors (P1 → P2 → P3, no forward references):

- **P1** config-resolve two-scope READ path (new engine bin + `craft:run` step 0b wiring).
- **P2** `craft:init` user-scope LAND routing (init-land-main `--scope` + shadow-warn +
  `skills/init` prose — coupled contract, land together).
- **P3** `craft:promote-config` skill (pure `promote-plan` helper + shim + new standalone skill).

No standalone test-only parts: every new test file folds into the part whose code it
exercises. The §6 manifest-lint-ROOT portability pin is exercised in P2's real-lint bin
test (init user-scope rejects a ref-bearing config before the move) — it is the feature's
own Req 6 assertion, not a separate suite. Skill `.md` files are implementation and travel
in the part that owns their driving bin.

**Repo conventions every part inherits (verified in the worktree):**

- **Bin shim convention (0.7):** `engine/bin/<name>.js` is a 5-line shim; ALL logic lives
  in `engine/src/<name>-main.js`. Bins are NEVER mutation-scoped (Stryker mutates
  `engine/src/**` only) — so every branch must have in-process `engine/test/<name>-main.test.js`
  coverage; `engine/test/<name>.bin.test.js` is spawn-smoke only. Shim shape (copy from
  `engine/bin/init-config.js`):
  ```js
  #!/usr/bin/env node
  import { fileURLToPath } from 'node:url';
  import { main } from '../src/<name>-main.js';
  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
  }
  ```
- **In-process io double:** `engine/test-helpers/capture-io.js` `makeCaptureIo()` →
  `{ stdout, stderr }` each with `.write(s)` and `.joined()`. Use it in every `-main` test.
- **$HOME isolation:** tests inject `homeDir`/`fileExists`/`containByRealpath` seams and NEVER
  read a real `$HOME`. `engine/test-helpers/empty-home.js` (import-time `$HOME` redirect +
  `restoreEmptyHome()`) is the belt-and-braces helper if a real spawn needs a scratch home.
- **`fileExists` default binding:** `statSync(p).isFile()` inside a never-throw try/catch —
  identical to `isRegularFile` at `engine/src/manifest-lint-main.js:27-31`.
- **Injected-dep precedent:** `engine/src/pipeline-resolve-main.js` `main(argv, io, deps = {})`
  with `deps.readUserPolicy ?? defaultReadUserPolicy` (L246, L287) and the two-root
  `containByRealpath` shape in `engine/src/observability/usage-mine-main.js` (deps default to
  `nodeContainByRealpath`, roots from `join(homedir(), '.claude', …)`, L176-188).
- **Surface gates (pre-pay in-part):** `test/source-hygiene.test.js` grep-scans `skills/`,
  `engine/src`, `templates/`, `contracts/` etc. — new source/prose must NOT contain Class-A
  tokens (`mutation`/`mutant`/`stryker`/`dependency-cruiser`…), Class-B VCS tokens (`\bgh\b`,
  `\bgithub\b`), and a vendor-suffixed basename (`-claude.js`, `-openai.js`…) may live ONLY
  under `adapters/<vendor>/` — so name new files plainly (`config-resolve-main.js`,
  `promote-plan.js`). `test/every-test-file-registers.test.js` requires every new
  `*.test.js` under `engine/test/` to register ≥1 `test(`. `scripts/ci.sh` `run_suite`
  auto-discovers new `engine/test/**/*.test.js` via `find` (zero-file = hard error) — no ci.sh
  edit needed for new tests. NEW bins are NOT enumerated by any gate and are NOT in ci.sh's
  lint chain, so no ci.sh edit is needed for `config-resolve.js`/`promote-plan.js`.
- **Skill discovery:** skills are auto-discovered from `skills/*/SKILL.md`; `metrics`/`prune`
  (non-phase standalone skills) are registered NOWHERE else (`.claude-plugin/marketplace.json`
  lists only the plugin, not skills; `test/p10-structure.test.js` gates only *phase* skills).
  So `skills/promote-config/SKILL.md` needs NO registry edit — a `name:`/`description:`/
  `argument-hint:` frontmatter (mirror `skills/prune/SKILL.md`) is the whole registration.
- **Engine-contract floors (non-negotiable):** no provenance refs (phase/ADR/backlog #) in
  source or test; no suppression directives; no swallowed errors (handle/rethrow/log with
  context); CQS; immutable-by-default; small functions/early returns; named constants (no
  magic values). `contain.js` returns a LEXICAL path — document the residual TOCTOU/hardlink
  window, never claim atomic containment.

## Part 1 — config-resolve two-scope read path

### Context

**Goal (design §2, §3; Req 1-4, 8; DC-a, DC-b, DC-f, DC-h, DC-e read-side).** A NEW read
selector picks the `--config <name>` manifest FILE across two scopes — local
`./.claude/craft-<name>.md` (always wins) → user `~/.claude/craft-<name>.md` → neither ⇒ loud
STOP naming BOTH scopes. `craft:run` step 0b is repointed onto it. `init-config.js` is
UNTOUCHED (DC-a: it keeps its existence-irrelevant write-target contract that `craft:init`
depends on).

**Reuse — the pure resolver (DO NOT modify) `engine/src/init-config.js`:**
```js
const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export function resolveConfigPath(repoRoot, name) {
  if (!name || !KEBAB_RE.test(name))
    return { ok: false, error: `invalid config name "${name}": must match ^[a-z0-9]+(-[a-z0-9]+)*$` };
  const target = resolvePath(join(resolvePath(repoRoot), '.claude', `craft-${name}.md`));
  return { ok: true, path: target };
}
```
It is scope-general: `resolveConfigPath(repoRoot, name)` → local path; `resolveConfigPath(homeDir, name)`
→ user path (it appends `.claude/craft-<name>.md` to whatever root — pass the OS home
`homedir()`, NEVER `~/.claude`, or the `.claude` segment doubles).

**Reuse — containment `engine/src/contain.js`:** `containByRealpath(root, target) → string|null`
(L63). Fail-closed lexical+realpath layers; returns the lexical target (TOCTOU caveat).

**Files to CREATE:**

1. `engine/src/config-resolve-main.js`:
   - Pure `export function resolveConfigCandidates(repoRoot, homeDir, name)` →
     `{ ok: true, candidates: [ { scope: 'local', path }, { scope: 'user', path } ] }` |
     `{ ok: false, error }`. Validate the name ONCE up front (call `resolveConfigPath(repoRoot, name)`;
     if `!ok` return its `{ ok:false, error }`); else build `local` from that result and `user`
     from `resolveConfigPath(homeDir, name)`.
   - `export function main(argv, io, deps = {})` mirroring `pipeline-resolve-main.js`'s
     `deps`-destructure. Defaults: `fileExists = <statSync(p).isFile() never-throw guard>`,
     `homeDir = homedir` (from `node:os`), `containByRealpath = nodeContainByRealpath` (from `./contain.js`).
     Logic:
     - `name = argv[0]`; if `!name` → `io.stderr.write('config-resolve: name argument required\n')`; return non-zero.
     - `repoRoot = resolve(process.cwd())`; `home = deps.homeDir()`.
     - `cand = resolveConfigCandidates(repoRoot, home, name)`; if `!cand.ok` →
       `io.stderr.write(`config-resolve: ${cand.error}\n`)`; return non-zero.
     - USER-candidate external-root safety (DC-e read side): `safeUser = deps.containByRealpath(join(home, '.claude'), userPath)`;
       a `null` (symlinked `~/.claude`) means "no user layer" — NEVER an error (mirrors
       `defaultReadUserPolicy` → null). Treat user candidate as ABSENT when `safeUser === null`.
     - Selection walk `[local, user]`, first `deps.fileExists(path)` truthy wins; local first ⇒ local wins.
       - winner === local AND user present ⇒ shadow note to STDERR:
         `config-resolve: user-scope config <name> is shadowed by local\n` (DC-f).
       - winner === user ⇒ scope note to STDERR: `config-resolve: <name> resolved at user scope (~/.claude/craft-<name>.md)\n`.
       - stdout = the ABSOLUTE winning path + `\n` (DC-h — machine value, stdout only).
       - return 0.
     - neither present ⇒ STDERR (DC-b, Req 3):
       `config-resolve: no manifest at ./.claude/craft-<name>.md or ~/.claude/craft-<name>.md\n`
       (display forms in the message; both scopes named); return non-zero.
   - Named constants for `EXIT_OK = 0` / `EXIT_ERR = 1` and the message templates (no magic values).

2. `engine/bin/config-resolve.js`: the 5-line shim (copy `engine/bin/init-config.js`, swap the
   `-main` import path).

**Files to CREATE (tests):**

3. `engine/test/config-resolve-main.test.js` — in-process, `makeCaptureIo()`, injected `deps`
   (never a real `$HOME`). Cover EVERY branch (Stryker in-process): pure `resolveConfigCandidates`
   (ordered `[local, user]`; single validation; bad-name/uppercase/traversal/empty error
   propagation; scope-generality — same name, two roots yields the two `.claude/craft-<name>.md`
   tails); and `main` via the design §"Existence-selection edge matrix":

   | local present | user present | expected |
   |---|---|---|
   | yes | yes | absolute LOCAL path on stdout; shadow note on stderr; exit 0 |
   | yes | no  | absolute LOCAL path on stdout; NO note; exit 0 |
   | no  | yes | absolute USER path on stdout; user-scope note on stderr; exit 0 |
   | no  | no  | non-zero; stderr names BOTH `./.claude/craft-<name>.md` and `~/.claude/craft-<name>.md`; stdout empty |

   Plus: missing name → non-zero + stderr; bad name → non-zero + stderr echoes the rejected name;
   containment-null user candidate (fake `containByRealpath` → null) is treated as ABSENT (no
   error) so a present-local still wins and an absent-local falls through to the neither-found STOP.
   Fake `deps.fileExists` = presence-map over the candidate paths; fake `deps.homeDir` = a fixed
   fake home string; fake `deps.containByRealpath` = identity-or-null stub.

4. `engine/test/config-resolve.bin.test.js` — spawn-smoke mirroring `engine/test/init-config.bin.test.js`
   (`spawnSync(process.execPath, [bin, name], { env, cwd })`). Drive real `homedir()` by setting
   `env.HOME`/`env.USERPROFILE` to a `mkdtempSync` scratch home and `cwd` to a scratch repo:
   (a) create `<cwd>/.claude/craft-x.md` → exit 0, stdout is the absolute local path;
   (b) neither file → non-zero, stderr names both scopes. Clean up temp dirs on exit.

**Files to EDIT (prose consumer — travels in this commit):**

5. `skills/run/SKILL.md` step **0b** (currently L35-44): replace the
   `init-config.js <name>` + bash `[ -f <path> ]` + one-scope STOP with:
   - When `--config <name>` parsed: run `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/config-resolve.js" <name>`.
     - exit 0 ⇒ stdout is the ABSOLUTE winning path — hold it as `<manifest-path>`; surface any
       stderr scope/shadow note into the run record (advisory). Steps 1 (`manifest-lint.sh <manifest-path>`)
       and 1b (`pipeline-resolve … [manifest-path]`) pass it through UNCHANGED (both accept an absolute path).
     - non-zero ⇒ STOP; surface stderr verbatim (the two-scope neither-found message or the
       bad-name/traversal diagnostic); never fall back to `.claude/workflow.md`.
   - `--config` absent ⇒ `.claude/workflow.md` (today's behaviour, unchanged).
   - Sweep the "Walk error paths" table / any `[ -f ]` / "no manifest at `.claude/craft-<name>.md`"
     mention so no stale one-scope wording survives (finding: editing an ordered surface leaves
     stale cross-refs). No step renumber (0b stays 0b).

**Surface decision:** `resolveConfigCandidates` + `main` are INTERNAL engine symbols (consumed by
the shim + tests; no barrel/index in `engine/src` — bins import `-main` directly). New bin
`config-resolve.js` needs no registry entry (see Surface gates above). Pre-pay: plain filenames
(no vendor suffix), no Class-A/B tokens in source or the run-skill prose, new test files register
tests.

### TDD steps

- RED: write `config-resolve-main.test.js` (pure candidates + the 4-row selection matrix +
  missing/bad name + containment-null). Run `(cd engine && node --test test/config-resolve-main.test.js)`
  → FAILS: `Cannot find module '../src/config-resolve-main.js'`.
- GREEN: create `engine/src/config-resolve-main.js` (`resolveConfigCandidates` + `main` with injected
  `deps`) until every arm passes.
- RED: write `config-resolve.bin.test.js` (scratch-home + scratch-repo spawns). Run it → FAILS
  (no `engine/bin/config-resolve.js`).
- GREEN: add the 5-line shim; smoke passes.
- REFACTOR: extract message templates + exit codes to named constants; confirm the `fileExists`
  default matches `isRegularFile`; wire `skills/run/SKILL.md` step 0b onto `config-resolve.js` and
  sweep stale one-scope wording. Re-run the part gate.

### Gate

Part gate (engine part): `(cd engine && node --test test/config-resolve-main.test.js test/config-resolve.bin.test.js)` — green before commit; never commit on red.
Phase-boundary gate (once per round): `bash scripts/ci.sh`.

### Commit

`feat: config-resolve two-scope named-config read path`

## Part 2 — craft:init user-scope land routing

### Context

**Goal (design §4, §6, §7; Req 5, 6; DC-c, DC-e write-side, DC-f).** `craft:init` can land the
emitted manifest at the USER root (`~/.claude/craft-<name>.md`) via the SAME emit→lint→land path.
Authoring (interview/emit) is byte-for-byte unchanged (Out of scope); ONLY the final move target
moves. Scope reachable via BOTH an interview question (default `local`) AND a `--scope user|local`
flag (DC-c DEVIATION — both surfaces). Writing user scope while a local same-name exists WARNS
(shadow note), never silently overwrites. Lint runs BEFORE the move regardless of scope; a
ref-bearing (non-portable) config is REJECTED at the user root before it ever reaches `~/.claude`
(Req 6, the §6 empirically-pinned behaviour).

**Where scope routing lives (pre-chewed): `engine/src/init-land-main.js`.** Today (L39-62)
`main(argv, io)` reads `argv[0]=tmpPath`, `argv[1]=finalPath` and hardcodes
`deps = { lint: buildLintDep(), rename: renameSync }`. `buildLintDep()` (L19-32) shells
`scripts/manifest-lint.sh` via `execFileSync` and maps exit/stderr to `{ exitCode, errors }`.
The pure core `engine/src/init-land.js` `land({ tmpPath, finalPath }, { lint, rename })` (atomic
lint-then-rename, never a half-move) is UNCHANGED — do not touch it or `engine/test/init-land.test.js`.

**New `init-land-main.js` contract** (`init-land.js <tmpPath> <name> [--scope user|local]`):
- `main(argv, io, deps = {})` — deps-destructure like `pipeline-resolve-main.js`. Defaults:
  `homeDir = homedir`, `fileExists = <statSync isFile never-throw>`,
  `containByRealpath = nodeContainByRealpath` (from `./contain.js`), `lint = buildLintDep()`,
  `rename = renameSync`.
- Parse: `tmpPath = argv[0]`; `name = argv[1]`; scan remaining argv for `--scope` with value in
  `{ user, local }` (default `local`); a missing tmpPath/name OR an unknown `--scope` value →
  usage error on stderr, non-zero. Reuse a `SCOPES` named set (no magic strings).
- Compute `root = scope === 'user' ? deps.homeDir() : resolve(process.cwd())`.
- `res = resolveConfigPath(root, name)` (import from `./init-config.js`); `!res.ok` →
  stderr error, non-zero (defensive re-validation of the name).
- `finalPath`: for `local`, `res.path` as-is (kebab-safe, repo-local — NO second lexical layer,
  design §7). For `user`, `contained = deps.containByRealpath(join(deps.homeDir(), '.claude'), res.path)`;
  `contained === null` (symlinked `~/.claude`) ⇒ STOP: cannot safely write to user scope, non-zero;
  else `finalPath = contained`.
- Shadow-warn (DC-c/DC-f): when `scope === 'user'` AND
  `deps.fileExists(resolveConfigPath(resolve(process.cwd()), name).path)` ⇒ stderr
  `init-land: warning: local .claude/craft-<name>.md exists and will shadow this user-scope config at read time\n`
  (advisory; the move still proceeds — different path, no overwrite of the local).
- `result = land({ tmpPath, finalPath }, { lint: deps.lint, rename: deps.rename })`; on `!ok`
  write each error, non-zero; on ok `io.stdout.write(result.path + '\n')`, 0. (Lint runs on
  `tmpPath`, whose location — under the destination `.claude/` — sets ROOT = `dirname(dirname(tmpPath))`;
  UNCHANGED, this is what enforces Req 6 at the user root.)

**Files to EDIT:**

1. `engine/src/init-land-main.js` — new contract above (imports add `resolveConfigPath` from
   `./init-config.js`, `containByRealpath` from `./contain.js`, `homedir` from `node:os`,
   `join`/`resolve` already present).

2. `engine/test/init-land.bin.test.js` — REWRITE to the new argv shape. Existing tests pass
   `[tmpPath, finalPath]`; new form is `[tmpPath, name, '--scope', 'local'|'user']`. Spawn with a
   scratch `cwd` (repo) and scratch `env.HOME`, `.claude/` pre-created, tmp file inside it:
   - local scope, lint-clean tmp → exit 0, file landed at `<cwd>/.claude/craft-<name>.md`, tmp gone.
   - **user scope, ref-bearing tmp** (frontmatter `context: docs/missing.md`) at `$HOME/.claude/.craft-x.tmp` →
     REAL `manifest-lint` runs with ROOT=`$HOME`, rejects the missing ref, exit non-zero, no user
     file created, any prior user file untouched byte-for-byte. **This IS the §6 / Req 6 portability
     pin** (ref-free lints clean at `$HOME`; ref-bearing fails closed — locking the design §6 matrix).
   - user scope, ref-free tmp → exit 0, landed at `$HOME/.claude/craft-<name>.md`.
   - missing args / bad `--scope` → non-zero + stderr.

3. `engine/test/init-land-main.test.js` — CREATE (in-process, `makeCaptureIo()`, injected deps —
   the branch coverage bins don't get). Stub `lint` (`() => ({ exitCode: 0, errors: [] })` and a
   failing variant), `rename` spy, fake `homeDir`, fake `fileExists`, fake `containByRealpath`
   (identity + a null variant). Cover: local scope → finalPath = `<cwd>/.claude/craft-<name>.md`;
   user scope → finalPath = `<fakeHome>/.claude/craft-<name>.md`; shadow-warn emitted only when
   `scope=user` AND fake `fileExists` reports the local sibling present; containment-null user →
   STOP non-zero, `rename` never called; unknown `--scope` → non-zero; lint-fail → `rename` never
   called, non-zero (delegates to `land`).

**Files to EDIT (prose — travels in this commit; coupled to the bin contract):**

4. `skills/init/SKILL.md`:
   - **Preamble** (after L21 name resolution): parse `--scope user|local` from `$ARGUMENTS`
     (default `local`); strip it; bind `scope`. Keep the existing `init-config.js "$name"` call as
     the up-front kebab NAME validator (exit 0 = valid) — it still yields the local path for the
     Done report; it NO LONGER supplies the land target.
   - **Step 1 interview** (Tier-0 catalog table ~L116): add a scope question, default from `scope`:
     "Where should this config live — this repo (`local`) or your user config (`~/.claude`,
     portable across repos)? [local]". A `--scope` value pre-fills/overrides the default.
   - **Step 2 emit** (L181-190): ensure the CHOSEN destination `.claude/` exists (`mkdir -p` the
     local `.claude/` or `~/.claude/`) BEFORE `mktemp`; create the temp with `mktemp` INSIDE that
     destination `.claude/` (`.claude/.craft-<name>.tmp.XXXXXX` local; `~/.claude/.craft-<name>.tmp.XXXXXX`
     user) so `init-land`'s lint ROOT = the destination root. Heed the mktemp finding: trailing-`X`
     template built ONLY from the already-validated `$name`, then REUSE the returned `$manifest_tmp`
     verbatim — never re-splice the raw name into a later path.
   - **Step 3 land** (L204-208): call `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-land.js" "$manifest_tmp" "$name" --scope "$scope"`
     (NEW contract — pass NAME + `--scope`, NOT `$manifest_final`). Surface any init-land shadow
     warning to the user; a non-zero exit STOPs (surface stderr; remove `$manifest_tmp`; prior
     same-name file untouched).
   - **Done + Error semantics** (L218-240): note the landed scope; add rows for "user scope +
     ref-bearing config → lint REJECT before move (must be self-contained)" and "user scope +
     local same-name present → shadow warning, landed anyway". Sweep the file for any now-stale
     `$manifest_final`-as-land-target wording (finding: sweep after editing an ordered surface).

**Surface decision:** no NEW exported engine symbol (init-land-main's signature gains an optional
`deps` param + `--scope` parsing — INTERNAL). The `init-land.js` bin contract changes but the bin
is private (only `skills/init` and, later, `skills/promote-config` call it). Pre-pay: no Class-A/B
tokens in the edited prose; `init-land-main.test.js` registers tests.

### TDD steps

- RED: write `init-land-main.test.js` (local/user finalPath, shadow-warn, containment-null STOP,
  bad-scope, lint-fail delegation) with injected deps. Run
  `(cd engine && node --test test/init-land-main.test.js)` → FAILS (main ignores `--scope`, treats
  `argv[1]` as a literal finalPath).
- GREEN: rewrite `engine/src/init-land-main.js` to the new contract until every arm passes.
- RED: rewrite `init-land.bin.test.js` to the new argv shape incl. the user-scope ref-bearing §6
  pin. Run → FAILS until the bin contract matches (and confirms real manifest-lint rejects the ref
  at `$HOME`).
- GREEN: bin smoke passes end-to-end.
- REFACTOR: extract `SCOPES` set + message templates to named constants; wire `skills/init/SKILL.md`
  (scope question + `--scope` parse + dest-`.claude/` mkdir + new init-land call) and sweep stale
  land-target wording. Re-run the part gate.

### Gate

Part gate (engine part): `(cd engine && node --test test/init-land-main.test.js test/init-land.bin.test.js test/init-land.test.js)` — green before commit.
Phase-boundary gate: `bash scripts/ci.sh`.

### Commit

`feat: craft:init user-scope land routing`

## Part 3 — craft:promote-config skill

### Context

**Goal (design §5, §6, §7; Req 7; DC-d, DC-e).** A NEW standalone, session-owned skill relocates a
named config between scopes — default MOVE (source removed after a verified place; DC-d DEVIATION,
so a promoted config lives at exactly one scope), `--demote` (user→local) in scope,
destination-exists ⇒ REFUSE then `--force` overrides, `manifest-lint` runs at the DESTINATION root
before the move commits. It COMPOSES EXISTING BINS (DC-d(i)) — the atomic lint+move is delegated to
`engine/bin/init-land.js` (P2's `--scope` contract); the only new bin is a TINY pure
path/decision computer (the judgment's authorized carve-out — keep branch logic OUT of untested
bash).

**P5-testability resolution.** All non-trivial branching (direction, source-existence, dest-exists
refuse/force, `$HOME` containment) is factored into a PURE, Stryker-mutated `engine/src/promote-plan.js`
surfaced by a 5-line `engine/bin/promote-plan.js` shim. The skill-prose does ONLY literal
`cp → mktemp → init-land.js(--scope) → rm` plus the `PROMOTE-CONFIG` token — no branching in bash.
This composes existing bins per DC-d(i); `promote-plan` is a decision/path computer, NOT a
relocation engine.

**Reuse:** `resolveConfigPath` (`engine/src/init-config.js`), `containByRealpath` (`engine/src/contain.js`),
`engine/bin/init-land.js` (P2 — `init-land.js <tmp> <name> --scope <user|local>`: lint-at-dest-root +
atomic rename, rename OVERWRITES an existing dest so `--force` needs no extra bin logic),
`scripts/manifest-lint.sh` (invoked inside init-land). Skill templates: `skills/prune/SKILL.md`
(prose-only standalone shape, `PRUNE-CANDIDATE(<unit>)` token defined only there, advisory error
table) and `skills/metrics/SKILL.md` (plugin-root preamble probe `test -f "${CLAUDE_PLUGIN_ROOT}/engine/bin/…"`).
`skills/init/SKILL.md` is the mktemp/land discipline template.

**Files to CREATE:**

1. `engine/src/promote-plan.js` — pure `export function planPromote({ name, demote = false, force = false }, deps)`
   where `deps = { repoRoot, homeDir, fileExists, containByRealpath }`. Returns
   `{ ok: true, sourcePath, destPath, fromScope, toScope, destScope, overwrote } | { ok: false, error }`:
   - direction: `demote` ⇒ user→local; else local→user. `fromScope`/`toScope`/`destScope` set accordingly
     (a `SCOPES` named constant, no magic strings).
   - `sourceRoot = demote ? homeDir : repoRoot`; `destRoot = demote ? repoRoot : homeDir`.
   - `srcRes = resolveConfigPath(sourceRoot, name)`; `!ok` ⇒ propagate `{ ok:false, error }`.
   - For whichever side is USER, apply `containByRealpath(join(homeDir, '.claude'), path)`; `null` ⇒
     `{ ok:false, error: 'user-scope path failed containment' }` (fail-closed; write side, so an
     escape is an ERROR here — unlike the read side which treats null as absent).
   - Source MUST exist: `!fileExists(sourcePath)` ⇒
     `{ ok:false, error: `no <fromScope>-scope config <name> to <verb>` }` (`promote`/`demote` verb).
   - `destRes = resolveConfigPath(destRoot, name)` (contained if user); `destExists = fileExists(destPath)`.
   - `destExists && !force` ⇒ `{ ok:false, error: `destination craft-<name>.md exists at <toScope> scope — pass --force to overwrite` }`.
   - else `{ ok:true, sourcePath, destPath, …, overwrote: destExists }`.

2. `engine/bin/promote-plan.js` — 5-line shim. `main(argv, io, deps = {})` (in
   `promote-plan-main.js`? — keep the repo's `-main` convention: put `main` in a NEW
   `engine/src/promote-plan-main.js` that imports `planPromote`, OR export `main` from
   `promote-plan.js`. Follow the established split: pure `planPromote` in `promote-plan.js`,
   `main(argv, io, deps)` in `engine/src/promote-plan-main.js`; the bin shims `promote-plan-main.js`).
   `main` parses `argv[0]=name`, flags `--demote`/`--force`; builds default deps
   (`repoRoot = resolve(process.cwd())`, `homeDir = homedir`, `fileExists`, `containByRealpath =
   nodeContainByRealpath`); calls `planPromote`; on `!ok` writes error to stderr, non-zero; on ok
   writes a stable machine contract to stdout — three `key=value` lines:
   `source=<abs>\n`, `dest=<abs>\n`, `scope=<user|local destScope>\n`; return 0.

**Files to CREATE (tests):**

3. `engine/test/promote-plan.test.js` — pure `planPromote` matrix via injected deps (fake
   `fileExists` presence-map, fixed fake `homeDir`/`repoRoot`, identity/null `containByRealpath`):
   promote source-present/dest-absent → ok (source=local, dest=user, scope=user); promote
   dest-present no-force → refuse; promote dest-present +force → ok, `overwrote:true`; promote
   source-absent → refuse "no local-scope config"; demote symmetric (source=user, dest=local); user
   path containment-null → refuse; bad/empty name → refuse.

4. `engine/test/promote-plan-main.test.js` — in-process `main` (`makeCaptureIo()`, injected deps):
   ok path prints the three `key=value` lines + exit 0; refusal → stderr + non-zero; missing name →
   non-zero. (Branch coverage the shim can't get.)

5. `engine/test/promote-plan.bin.test.js` — spawn-smoke: scratch `env.HOME` + scratch `cwd`, create
   `<cwd>/.claude/craft-x.md`, run `[bin, 'x']` → exit 0, stdout has `source=`/`dest=`/`scope=user`;
   missing source → non-zero.

**Files to CREATE (skill prose):**

6. `skills/promote-config/SKILL.md` — frontmatter `name: promote-config`, a `description:` with
   triggers ("craft:promote-config", "promote a named config", "move a craft config to user scope"),
   `argument-hint: <name> [--demote] [--force]`. Body mirrors `skills/prune`/`skills/init`:
   - **Preamble** (plugin-root probe): `test -f "${CLAUDE_PLUGIN_ROOT}/engine/bin/promote-plan.js"`
     and `…/init-land.js`; missing ⇒ STOP.
   - Parse `$ARGUMENTS`: `<name>` (required; STOP if absent), `--demote`, `--force`.
   - **Step 1 plan:** `plan_out="$(node "${CLAUDE_PLUGIN_ROOT}/engine/bin/promote-plan.js" "$name" [--demote] [--force]")"`;
     non-zero ⇒ STOP surface stderr (no source / refuse-without-force / containment escape / bad
     name). Parse `source`/`dest`/`scope` from the `key=value` lines.
   - **Step 2 stage:** ensure the destination `.claude/` exists (`mkdir -p`); copy source bytes into
     a `mktemp` INSIDE the destination `.claude/` — trailing-`X` template built only from the
     validated `$name`, REUSE the returned tmp path verbatim (mktemp finding).
   - **Step 3 land:** `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-land.js" "$manifest_tmp" "$name" --scope "$scope"`
     — lint at the destination root then atomic move (overwrites when `--force` allowed it).
     Non-zero ⇒ STOP surface stderr; remove `$manifest_tmp`; SOURCE untouched (Req 7 — a ref-bearing
     config is REFUSED at the destination lint before any place; §6).
   - **Step 4 finalize (MOVE):** on init-land exit 0, `rm "$source"` — the config now lives at exactly
     one scope. Emit the greppable token `PROMOTE-CONFIG(<name>): <fromScope>→<toScope>` (defined ONLY
     here; does not join the `skills/run` token family — same discipline as `PRUNE-CANDIDATE`).
   - Advisory **Error semantics** table: missing name; no source at from-scope; destination exists
     (refuse → `--force`); non-portable/ref-bearing source (lint REJECT at dest, source untouched);
     containment escape; plugin-root missing.

**Surface decision:** `planPromote` + `main` are INTERNAL engine symbols. New bin `promote-plan.js`
and new skill `promote-config` need NO registry edit (skills auto-discovered; bins not enumerated —
see Surface gates). Pre-pay: plain filenames (no vendor suffix); no Class-A (`mutation`…) / Class-B
(`gh`/`github`) tokens in `promote-plan*.js` or the skill prose (source-hygiene scans `skills/` +
`engine/src`); all new test files register tests.

### TDD steps

- RED: write `promote-plan.test.js` (full decision matrix, injected deps). Run
  `(cd engine && node --test test/promote-plan.test.js)` → FAILS (no module).
- GREEN: create `engine/src/promote-plan.js` (`planPromote`) until every arm passes.
- RED: write `promote-plan-main.test.js` (three-line stdout contract, refusal, missing name). Run →
  FAILS (no `-main`).
- GREEN: create `engine/src/promote-plan-main.js` (`main`) + `engine/bin/promote-plan.js` shim.
- RED: write `promote-plan.bin.test.js` (scratch home/repo spawn). Run → FAILS until the shim is wired.
- GREEN: smoke passes.
- REFACTOR: extract `SCOPES` + verb/message constants; author `skills/promote-config/SKILL.md`
  (compose promote-plan + init-land --scope + cp/mktemp/rm + `PROMOTE-CONFIG` token), mirroring
  `skills/prune` shape and the mktemp discipline. Re-run the part gate.

### Gate

Part gate (engine part): `(cd engine && node --test test/promote-plan.test.js test/promote-plan-main.test.js test/promote-plan.bin.test.js)` — green before commit.
Phase-boundary gate: `bash scripts/ci.sh`.

### Commit

`feat: craft:promote-config skill`
