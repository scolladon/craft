# Design — portable named configs (user-scope resolution)

> Brief: make `craft:init`-authored NAMED configs portable across repos — `--config <name>`
> resolves `./.claude/craft-<name>.md` (local, wins) → `~/.claude/craft-<name>.md` (user) → STOP;
> `craft:init` gains a local|user land-scope choice; a new `craft:promote-config` skill
> relocates a named config between scopes, lint-gated.
> Status: draft → self-reviewed ×3 → accepted

## Context

A named config today lives **only** repo-local at `.claude/craft-<name>.md`, a lint-clean
sibling of `.claude/workflow.md` (`docs/GUIDE-customizing.md` §"Named manifests"). It is
authored by `craft:init` (interview → emit → lint → land) and consumed by `craft:run` via
`--config <name>`, which resolves the path repo-local only. There is no way to carry a
named config across repos: a `ci` or `strict-review` config must be re-authored per clone.

The subsystems and seams this feature touches (all verified in the worktree):

- **Pure resolver** — `engine/src/init-config.js` `resolveConfigPath(repoRoot, name)`. Pure,
  no I/O, no existence check. Validates `name` against `^[a-z0-9]+(-[a-z0-9]+)*$` (kebab; no
  separators/dots ⇒ traversal-safe by construction), then returns
  `{ ok, path: join(root, '.claude', 'craft-<name>.md') }`. The function is **already
  scope-general**: the `.claude/craft-<name>.md` tail is appended to whatever root it is
  given, so `resolveConfigPath(repoRoot, name)` yields the local path and
  `resolveConfigPath(homedir(), name)` yields the user path — no signature change needed to
  address user scope.
- **Write-target consumer** — `engine/src/init-config-main.js` `main(argv, io)`. Resolves
  against `process.cwd()`, prints `relative(repoRoot, path)` to stdout on ok, error + exit 1
  on `!ok`. **No existence check** — it is used by `craft:init` to name a file that does
  **not yet exist**. This is load-bearing: any existence-based STOP added here would break
  init's write-target use.
- **`craft:run` step 0b** — `skills/run/SKILL.md`: runs `init-config.js <name>`, then bash
  `[ -f <path> ]`, STOPs `"--config <name>: no manifest at .claude/craft-<name>.md"` if
  missing. This prose + STOP message is the two-scope update surface.
- **User-scope precedent (already shipped)** — `engine/src/pipeline-resolve-main.js`:
  `USER_POLICY_ROOT = join(homedir(),'.claude')`, `USER_POLICY_PATH`, a `defaultReadUserPolicy`
  guarded by `containUserPolicyPath` returning `null` on ENOENT (absent user scope is **never**
  an error), an **injected** `deps.readUserPolicy` seam so tests never touch a real `$HOME`, and
  `mergePolicyScopes(user, project, perInvocation)` folding **`per-invocation > project > user`**
  (`engine/src/policy.js`, `docs/adapters/policy.md`). This feature mirrors that precedence
  exactly for named-config *file selection* — the same one-directional fold, one scope shallower
  (local + user; no per-invocation file layer).
- **emit → lint → land** — `engine/src/init-emit*.js`, `engine/src/init-land.js`
  (`land({tmpPath, finalPath}, {lint, rename})`: pure lint-then-rename, atomic, never a
  half-move), `engine/src/init-land-main.js` (wires `lint = manifest-lint.sh` via
  `execFileSync`, `rename = renameSync`). `skills/init/SKILL.md` drives interview → emit to a
  `mktemp` inside `.claude/` → lint → atomic move to `.claude/craft-<name>.md`.
- **Manifest-lint ROOT** — `engine/src/manifest-lint-main.js` `buildFileExists`/`buildReadFile`:
  every file-ref-bearing manifest key (`context`, `phases.<id>.context`,
  `phases.<id>.override`, `scripts.<k>`, `backlog.ref`, `memory.ref`, `intention.ref`,
  `paths.dod`, `extends.*`) is existence-checked against `ROOT = dirname(dirname(manifestPath))`,
  contained via `containByRealpath`. For a local manifest ROOT = the repo; **for a user-scope
  manifest ROOT = `$HOME`**. This is the pivot of the whole design and is pinned empirically
  below.
- **Containment** — `engine/src/contain.js` `containByRealpath(root, target)`: lexical +
  realpath fail-closed layers; returns the **lexical** target, so a TOCTOU/hardlink window
  remains (its own docstring says so — do not over-claim atomic containment). The proven
  two-root pattern for a bin that legitimately spans repo + an external dir is
  `engine/src/observability/usage-mine-main.js`.
- **Standalone-skill shape** — `skills/prune/SKILL.md` and `skills/metrics/SKILL.md` are the
  prose-only, session-owned, advisory-table shape; `skills/init/SKILL.md` is the state-mutating
  emit→lint→land shape. `craft:promote-config` is the latter dressed as the former.

Constraining prior art: `docs/GUIDE-customizing.md` (config authoring + the shipped
`craft-policy.md` `per-invocation > project > user` precedence table) and
`docs/DESIGN-customizable-engine.md` (config/manifest model). This design **extends** the
named-config surface with a user scope; it does not contradict either. The GUIDE line
"Named configs coexist as siblings of `.claude/workflow.md`" becomes scope-qualified (a
downstream documentation delta, noted in Out of scope).

## Requirements

When this ships, all of the following are verifiable:

1. `--config <name>` with a **local** `./.claude/craft-<name>.md` present resolves to it,
   regardless of any user-scope file of the same name (local always wins).
2. `--config <name>` with **no local** file but a `~/.claude/craft-<name>.md` present
   resolves to the user-scope file.
3. `--config <name>` with **neither** present STOPs loudly with a message naming **both**
   scopes; `craft:run` never silently falls back to `.claude/workflow.md`.
4. An **absent** user scope is never an error — it is simply "no user layer" (parity with
   `readUserPolicy` returning `null` on ENOENT).
5. `craft:init` can land the emitted manifest at the **user** root (`~/.claude/craft-<name>.md`)
   via the SAME emit → lint → land path; lint runs BEFORE the move regardless of scope;
   authoring (interview/emit) is byte-for-byte unchanged.
6. A named config that is **not self-contained** (carries a repo-relative file-ref) is
   **rejected** by lint when placed at user scope — fail-closed, before any move.
7. `craft:promote-config <name>` copies/moves a local `craft-<name>.md` up to user scope
   (and demotes user → local), **lint-gated at the destination root**, atomic, refusing to
   clobber an existing target unless explicitly forced.
8. Every resolution/selection arm is unit-testable with **injected** `fileExists` and
   `homeDir` seams — no test reads or writes a real `$HOME`.
9. No new suppression directives, no swallowed errors, no provenance refs in source/test;
   all new logic lives in `engine/src/**` (Stryker-covered), bins stay 5-line shims.

## Design

### 1. Resolution precedence (mirrors `craft-policy.md`, one scope shallower)

`--config <name>` selects the manifest **file** by this fold:

| Order | Candidate path | Wins when |
|---|---|---|
| 1 (local) | `./.claude/craft-<name>.md` | present — **always wins** |
| 2 (user) | `~/.claude/craft-<name>.md` | local absent AND user present |
| — (none) | — | neither present ⇒ **STOP loud, naming BOTH scopes** |

This is the file-selection analogue of policy's `project > user` (there is no per-invocation
*file* layer — `--config <name>` is itself the per-invocation selector of *which* file).
Absent user scope is a non-event (Req 4), exactly like `defaultReadUserPolicy` → `null` on ENOENT.

### 2. Where the two-scope existence selection lives (pure core + injected I/O)

`resolveConfigPath(root, name)` stays **pure and scope-general** (no change). A new **pure**
candidate-builder composes the two scopes:

```
resolveConfigCandidates(repoRoot, homeDir, name)
  → { ok: true, candidates: [ {scope:'local', path}, {scope:'user', path} ] }
  | { ok: false, error }          // single kebab validation, once, up front
```

It appends `.claude/craft-<name>.md` to each root (via the existing `resolveConfigPath`), so
`local = resolveConfigPath(repoRoot, name)` and `user = resolveConfigPath(homeDir, name)` —
`homeDir` is the OS home (`homedir()`), NOT `~/.claude`, because the resolver adds the
`.claude` segment itself (passing `~/.claude` would double it).

The **existence-based selection** is impure and lives in a consumer with two injected seams,
mirroring `deps.readUserPolicy`:

- `fileExists(absPath) → boolean` (default = `statSync(p).isFile()` in a never-throw guard,
  identical to `isRegularFile` in `manifest-lint-main.js`).
- `homeDir() → string` (default = `homedir()`); injected so tests fake `$HOME`. The user
  containment root is derived as `join(homeDir(), '.claude')`, mirroring the policy
  precedent's `USER_POLICY_ROOT`.

The consumer walks `candidates` in order, returns the first whose `fileExists` is true, else
signals "neither found". Pure logic is Stryker-covered; the impure selector is thin and
fully unit-testable via the two seams (Req 8).

**Read vs write are distinct concerns (the init-breakage constraint).** `init-config-main.js`
is a *write-target* resolver (existence irrelevant; init writes a not-yet-existing file). The
two-scope *read* selection above must NOT be bolted onto it or it breaks `craft:init`.
Therefore the read selection is a **separate bin** `config-resolve.js` (5-line shim) over
`engine/src/config-resolve-main.js`, importing the pure `resolveConfigPath`/candidate-builder.
`init-config.js` is untouched for init's use; it gains only an optional scope for init's
user-land target (§4). (Whether to instead overload `init-config` with a `--resolve` flag is
DC-a.)

`config-resolve.js` emits the **absolute** winning path on stdout (a `relative()` path to a
user-scope file under `$HOME` would be a fragile `../../..` chain; manifest-lint and
pipeline-resolve both accept an absolute path, so nothing downstream needs the relative form).
The scope label and any shadow note (§7) go to **stderr** (advisory), keeping the skill's
`stdout`-capture trivial.

### 3. `craft:run` step 0b rewrite (behaviour, not just prose)

Step 0b calls `config-resolve.js <name>` instead of `init-config.js <name>` + bash `[ -f ]`:

- **exit 0** → stdout is the absolute winning path; hold it as `<manifest-path>`. Steps 1
  (`manifest-lint.sh <manifest-path>`) and 1b (`pipeline-resolve … [manifest-path]`) pass it
  through **unchanged** — both already accept an arbitrary path.
- **non-zero** (bad name / traversal OR neither-scope-found) → STOP; surface stderr. The
  neither-found message names BOTH scopes, e.g.
  `--config <name>: no manifest at ./.claude/craft-<name>.md or ~/.claude/craft-<name>.md`.

**Downstream scope-transparency (design invariant, no code change below step 0b).** User scope
changes only *which file* is read, never the pipeline. In particular `memory.ref`
(default `.claude/craft-memory.md`) and the intention corpus stay rooted at the **repo root**
in `craft:run` steps 1c-mem/1c-int — they are resolved against `repoRoot`, not against the
manifest's directory — so a user-scope config never drags memory/intention out of the repo.

### 4. `craft:init` land-scope choice (authoring untouched)

`craft:init` gains a `local | user` scope choice at land time (default `local` — today's
behaviour). Only the FINAL move target changes; interview/emit are byte-for-byte identical:

- The write-target for the chosen scope is `resolveConfigPath(<root>, name)` with
  `<root>` = `repoRoot` (local) or `homeDir()` (user, = `homedir()`) — the same pure resolver,
  different root.
- The destination `.claude/` dir is ensured to exist (create if absent) before the temp
  write — a fresh `~/.claude` is the normal Claude config dir, but user scope must not assume it.
- The emit temp is created via `mktemp` inside the **chosen destination's** `.claude/`
  (`.claude/.craft-<name>.tmp.XXXX` locally; `~/.claude/.craft-<name>.tmp.XXXX` for user), so
  `init-land`'s lint runs with `ROOT = dirname(dirname(tmp))` = the destination root — the ref
  checks resolve exactly where the landed file will live (§6). Lint runs BEFORE the move
  regardless of scope (Req 5); a non-portable config is rejected before it ever reaches
  `~/.claude` (Req 6).
- How the choice is surfaced (interview question vs `--scope` flag) and whether user-land
  warns/refuses when a local same-name config would shadow it are DC-c.

### 5. `craft:promote-config` skill (relocate between scopes, lint-gated)

A new standalone, session-owned skill mirroring `skills/init/SKILL.md`'s emit→lint→land
discipline and `skills/prune/SKILL.md`'s advisory-table prose shape. It relocates an existing
named config between scopes with **no new relocation engine** — it composes existing bins:

1. Resolve source path (`config-resolve.js` or the scope-specific write-target resolver) and
   destination path (`resolveConfigPath(<dest-root>, name)`); ensure the destination `.claude/`
   dir exists (create if absent) before the temp write.
2. Copy source bytes to a `mktemp` inside the **destination** `.claude/`.
3. `init-land.js <tmp> <dest-path>` — lints the temp **at the destination root** (so a
   repo-relative-ref config is rejected on promote, §6), then atomic-renames only on clean lint.
4. For `move` (vs `copy`), unlink the source only after a successful land.

Move-vs-copy default, demote (user→local) in scope, overwrite policy, and lint-before-place
are DC-d. The skill emits a fixed greppable token defined **only there** (e.g.
`PROMOTE-CONFIG(<name>): <from>→<to>`), not joining the `skills/run/SKILL.md` token family
(same discipline as `PRUNE-CANDIDATE`).

### 6. The portability constraint — empirically pinned

The whole notion of "portable" is enforced *for free* by the existing manifest-lint ROOT
computation, because ROOT = `dirname(dirname(manifestPath))` and that is `$HOME` for a
user-scope file. Pinned empirically on 2026-07-04 in a `mktemp` throwaway against
`engine/bin/manifest-lint.js` (never the worktree):

| Config placed at | fileExists ROOT | ref-free config | config with `context: docs/house-rules.md` |
|---|---|---|---|
| `<repo>/.claude/craft-x.md` (local) | `<repo>` | valid (exit 0) | valid — ref exists under repo |
| `<home>/.claude/craft-x.md` (user) | `<home>` | **valid (exit 0)** | **INVALID (exit 2)** — `context references missing file: docs/house-rules.md` |

Consequence, load-bearing: **a user-scope config must be self-contained** (repo-agnostic
knobs only — `pipeline.skip/profile`, `models.*`, `policy` verdict lists,
`phases.<id>.execution`, `phases.<id>.role`, `phases.<id>.harness` technique lists). Any
file-ref-bearing key is inherently repo-local and is auto-rejected at user scope by the
existing lint — fail-closed, no new lint code required (Req 6). Whether to add a *clearer*
"user-scope configs must be ref-free" message on top of the existing "references missing
file" diagnostic is DC-g.

### 7. Path safety & shadowing

- **Name safety.** The kebab form (`^[a-z0-9]+(-[a-z0-9]+)*$`) admits no separators or dots,
  so `~/.claude/craft-<name>.md` is a single segment that cannot escape `~/.claude` by
  construction — the same guarantee the shipped local resolver already relies on. No second
  *lexical* containment layer is added on the already-safe name (that would be the
  equivalent-mutant duplication `contain.js` warns against).
- **External-root boundary.** Because the feature now reads/writes under `$HOME`, one
  realpath containment at the external-root I/O boundary
  (`containByRealpath(join(homeDir(),'.claude'), target)`, exactly as `containUserPolicyPath`
  does for `craft-policy.md`) catches a symlinked `~/.claude`. This closes the symlink-escape gap
  only; the returned value is lexical, so a TOCTOU/hardlink window remains — documented, not
  over-claimed (per `contain.js`). Whether this single external-root layer is warranted vs
  kebab-form alone is DC-e.
- **Shadowing UX.** When both scopes hold `<name>`, local wins; `config-resolve.js` emits an
  advisory stderr note (`user-scope config <name> is shadowed by local`) and the orchestrator
  records it — cheap insurance against "why isn't my user config taking effect". Silent vs
  surfaced is DC-f.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-a | Where two-scope existence selection lives | (i) new `config-resolve.js` bin over `config-resolve-main.js`, importing pure `resolveConfigPath`; (ii) overload `init-config.js` with a `--resolve` read-mode flag; (iii) inline the `[ -f ]` precedence in the run-skill bash | **(i) new bin** | SRP; keeps `init-config`'s write-target contract (which `craft:init` depends on, existence-irrelevant) intact; mutation-covered in `engine/src`; avoids a CQS-smell query that sometimes checks existence |
| DC-b | Neither-scope-found behaviour | (i) resolver bin exits non-zero with a STOP naming BOTH scopes; (ii) bin emits the local path and the skill's existing `[ -f ]`+STOP fires | **(i) bin owns the STOP** | The bin now knows both candidates; centralising the two-scope message avoids a bash-side message that can only name one scope; matches Req 3. Either way the message names both scopes |
| DC-c | How `craft:init` reaches user scope; shadow handling | (i) interview scope question, default local; (ii) `--scope user\|local` flag; (iii) both. Sub-choice: writing user scope while a local same-name exists → warn vs refuse | **interview question (default local) + WARN on shadow** | Init is interview-driven — a question matches its house style; default local preserves today's behaviour; local-wins is the precedence, so a warn (not refuse) surfaces the shadow without removing author freedom |
| DC-d | `promote-config` mechanics | (i) skill orchestrates existing bins (`resolveConfigPath` + `init-land` lint-then-move); (ii) new dedicated engine bin. Plus: move-vs-copy default; demote in scope?; overwrite = refuse-by-default + `--force`; lint at destination root | **(i) compose existing bins; default COPY; demote in scope; refuse-then-`--force`; lint at destination root** | `init-land` already gives atomic lint-gated placement — no new relocation logic needed; COPY is non-destructive (local stays authoritative via precedence); refuse-by-default prevents silent clobber; linting at the destination root is what enforces portability (§6) |
| DC-e | User-scope path safety depth | (i) kebab-form alone (single safe segment, cannot escape); (ii) add ONE external-root `containByRealpath(join(homeDir(),'.claude'), …)` at the I/O boundary; (iii) add a second lexical layer on the name too | **(ii) kebab-form + one external-root realpath layer** | Kebab-form already blocks name traversal; one realpath layer at the `$HOME` boundary catches a symlinked `~/.claude` (mirrors `containUserPolicyPath`); a second *lexical* layer on the already-safe name is the equivalent-mutant duplication `contain.js` warns against — omit it. TOCTOU/hardlink limit documented, not over-claimed |
| DC-f | Shadowing UX (both scopes hold the name) | (i) silent local-win; (ii) surfaced "user-scope config shadowed by local" note (stderr + run record) | **(ii) surfaced note** | Cheap; prevents the "user config silently ignored" confusion; matches policy-layer transparency. Advisory only — never gates |
| DC-g | Portability enforcement message | (i) rely on existing lint (repo-relative ref → "references missing file" at user root, empirically pinned); (ii) add an explicit "user-scope configs must be ref-free/self-contained" targeted lint message; (iii) allow refs, document they resolve against `$HOME` | **(i) rely on existing lint; (ii) optional friendlier message** | The existing ROOT computation already fail-closed rejects non-portable configs at user scope (pinned §6) — zero new code for the safety; a clearer message is polish, not correctness. (iii) is rejected: `$HOME`-rooted refs are meaningless cross-repo and an existence oracle over `$HOME` |
| DC-h | `config-resolve.js` stdout contract | (i) absolute winning path on stdout + scope/shadow note on stderr; (ii) relative path (today's `init-config` form); (iii) structured `<scope>\t<path>` line | **(i) absolute path + stderr note** | A `relative()` path to a `$HOME` file is a fragile `../../..` chain; manifest-lint and pipeline-resolve both accept absolute paths; keeping the machine value on stdout and advisory scope info on stderr keeps the run-skill capture trivial |

### Decisions (resolved 2026-07-04)

Every candidate above was put to the user. Resolutions — **two deviate** from the designer's recommendation and those deviations are load-bearing for the plan:

- **DC-a → (i)** new `config-resolve.js` bin over `config-resolve-main.js` importing the pure `resolveConfigPath`. *As recommended.*
- **DC-b → (i)** the resolver bin owns the neither-found STOP and exits non-zero; the message names **both** scopes (`./.claude/craft-<name>.md` and `~/.claude/craft-<name>.md`). *As recommended.*
- **DC-c → interview question (default local) PLUS a `--scope user|local` flag.** ⚠️ **DEVIATION** — designer recommended interview-only; the user chose *both* surfaces so `craft:init` is fully driveable interactively **and** headless. Writing user scope over an existing local same-name **warns** (shadow note), never silently overwrites.
- **DC-d → (i) skill composes existing bins; default is MOVE (source removed).** ⚠️ **DEVIATION** — designer recommended COPY; the user chose **MOVE** so a promoted config lives at exactly one scope (no shadow can arise from promotion). `--demote` (user→local) is in scope; destination-exists is **refuse-then-`--force`**; `manifest-lint` runs at the **destination** root before the move commits.
- **DC-e → (ii)** kebab name-form + one `$HOME`-root `containByRealpath(join(homeDir(),'.claude'), …)`. No second lexical layer (equivalent-mutant duplication `contain.js` warns against). *As recommended.*
- **DC-f → (ii)** resolve surfaces a "user-scope config shadowed by local" note on stderr when both scopes hold the name. *As recommended — still reachable via `init --scope user` over an existing local name even though promote now moves.*
- **DC-g → (i)** rely on the existing `manifest-lint` ROOT = `dirname(dirname(manifestPath))` computation (a ref-free config lints clean at `$HOME`; a config carrying `context:` refs fails closed). Clearer "user-scope configs must be ref-free" message is optional polish. *As recommended.*
- **DC-h → (i)** `config-resolve.js` writes the **absolute** winning path to stdout; scope + any shadow note go to stderr. *As recommended — absolute avoids a fragile `../../..` relative chain to a `$HOME` file; `manifest-lint`/`pipeline-resolve` both accept absolute.*


## Test strategy

London-school TDD downstream; every arm is behaviour-first and unit-testable via injected
seams — no test touches a real `$HOME` or the worktree.

**Injected-dependency seams (enumerated for the plan):**

| Seam | Signature | Pure? | Default binding | Test substitute |
|---|---|---|---|---|
| `resolveConfigPath` | `(root, name) → {ok,path}\|{ok:false,error}` | pure | — (existing) | none (direct) |
| `resolveConfigCandidates` | `(repoRoot, homeDir, name) → {ok, candidates[]}\|{ok:false,error}` | pure | — | none (direct) |
| `fileExists` | `(absPath) → boolean` | I/O | `statSync(p).isFile()` never-throw | fake presence map |
| `homeDir` | `() → string` | I/O | `homedir()` | fixed fake home dir |
| `lint` | `(path) → {exitCode, errors}` | I/O | `manifest-lint.sh` via `execFileSync` | stub returning red/green |
| `copyBytes` / `rename` | injected fs ops | I/O | `copyFileSync`/`renameSync` | `mktemp` or in-memory |
| `containByRealpath` | `(root, target) → string\|null` | I/O (realpath) | existing (`contain.js`) | `mktemp` symlink fixture |

**Pure surfaces (no I/O):** `resolveConfigPath` (name validation incl. traversal/uppercase/
empty/dotted-name reject; scope-generality — same fn, two roots), `resolveConfigCandidates`
(ordered [local, user]; single validation; error propagation).

**Existence-selection edge matrix** (via fake `fileExists` + `homeDir`):

| local present | user present | expected |
|---|---|---|
| yes | yes | local path; shadow note emitted (DC-f) |
| yes | no | local path; no note |
| no | yes | user path |
| no | no | non-zero exit; STOP names both scopes |

**Bin spawn-smoke** (`engine/test/config-resolve.bin.test.js`): the shim exits 0/non-zero and
writes stdout/stderr as the `-main` contract dictates (mirrors `init-config.bin.test.js`).

**`craft:init` land-scope:** local default lands at `.claude/craft-<name>.md` (unchanged);
user scope lands at `~/.claude/…` via a faked home root; a ref-bearing config is REJECTED at
user scope BEFORE the move (the §6 pinned behaviour), prior same-name file untouched byte-for-byte.

**`craft:promote-config`:** copy leaves source in place + lands dest on clean lint; move
unlinks source only after successful land; non-portable (ref-bearing) source REFUSED at
destination lint, source untouched; existing-target REFUSED unless forced; demote symmetric.

**Containment:** `containByRealpath(join(homeDir(),'.claude'), target)` unit test with a `mktemp` symlinked
`.claude` proving external-root escape → `null` (fail-closed); the lexical-return TOCTOU
limitation is asserted as documented behaviour, not as atomic containment.

**Manifest-lint ROOT (regression pin):** a table test asserting a ref-free config lints clean
at a fake-home root and a repo-relative-ref config lints INVALID there — locking the §6 matrix.

## Out of scope

- **"Merge-into-existing" generator (frontmatter reconciliation).** Parked follow-up;
  distinct concern (reconciling two manifests' keys) from this feature's scope/placement.
- **Authoring changes.** `craft:init`'s interview and emitter are byte-for-byte unchanged;
  only the land target moves.
- **A per-invocation config *file* layer.** `--config <name>` is itself the per-invocation
  selector; there is no third file scope above local (unlike policy's per-invocation `--policy`).
- **Making `memory`/`intention` portable.** Both stay repo-rooted in `craft:run`; a user-scope
  config never relocates them.
- **`docs/GUIDE-customizing.md` / `docs/DESIGN-customizable-engine.md` prose refresh.** The
  GUIDE's "coexist as siblings of `.claude/workflow.md`" line becomes scope-qualified and a
  two-scope precedence note is added — a documentation-phase delta, not part of this design's code.
- **`pipeline-resolve` / `manifest-lint` internals.** Both consume the resolved path as-is;
  user scope changes only *which* path step 0b hands them, never their logic.
