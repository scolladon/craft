# Plan — native GitHub Copilot CLI binding (fourth Execution-port binding)

> Source: design doc `docs/design/native-copilot-binding.md` · ADRs `240–250`
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

## Repo-wide preconditions every part inherits

Read this once; no part restates it.

- **Working directory**: `/Users/scolladon/workspace/perso/craft-native-copilot-binding`
  (git worktree, branch `feat/native-copilot-binding`). Work ONLY there. Absolute paths
  in every command.
- **Toolchain**: npm, nested package at `engine/`. Node's built-in runner only —
  `node:test` + `node:assert/strict`. No test framework dependency exists; do not add one.
- **House test style**: Given/When/Then titles, AAA body, a `sut` variable naming the
  unit under test. Every existing suite in this repo follows it; match it exactly.
- **Module style**: ESM (`"type": "module"`) everywhere under `adapters/` and `engine/src`.
  The four files in `test/` at repo root are CommonJS (`'use strict'; require(...)`) —
  when a part edits one of those, keep CommonJS.
- **No provenance refs in source or test**: no `ADR-<n>`, `P<n>`, `Part <n>`, `backlog #<n>`
  in any `.js`/`.json`/`SKILL.md`/agent-md file this plan creates. Three existing suites
  grep for exactly `/\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i`
  (`adapters/pi/test/native-surface.test.js`, `adapters/opencode/test/agents.test.js`).
  Provenance belongs in `docs/` only.
- **No suppression directives** (`@ts-ignore`, `eslint-disable`, coverage-ignore, lint
  silencers). **No swallowed errors** — the two deliberate fail-closed `catch {}` blocks
  this plan introduces (guard adapter, telemetry parser) each RETURN a defined verdict or
  skip-count; they never discard a failure silently.
- **`test/source-hygiene.test.js` is a live tripwire this change WILL hit.** It greps
  `pipeline skills agents contracts templates engine/src docs/adapters docs/DOD.md
  docs/GUIDE-customizing.md README.md` for:
  - class-A `stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise`
  - class-B `\bgh\b|\bgithub\b` (**case-sensitive** — `GitHub` does NOT match, `github`
    and `.github` and `github.copilot` DO match)

  Verified against this tree: the literal `'github.copilot'` (the OTel
  `instrumentationScope.name`, load-bearing and unavoidable) and any `.github/…` path
  written in `docs/adapters/**` trip class-B. Parts 6 and 8 each pre-pay their own
  allowlist filter; the existing `vcs.md` / `backlog.md` / `pi-poc-record.md` filters are
  the precedent shape (a content-scoped regex over the grep output line, with a comment
  explaining the reviewed boundary).
- **No test in this plan spawns the real `copilot` binary.** Every seam is exercised through
  injected dependencies (`fsOps`, `copilotRunner`, an injected guard). This is deliberate:
  `copilot` IS installed on the development machine, so a test that shelled out would do
  real provider work and hang the suite, while CI has no binary at all. If a part is ever
  tempted to spawn it, the test must first prepend a fast-failing `copilot` stub to `PATH`
  to reproduce CI's absence — but no part in this plan needs to.
- **Never commit on a red gate.** Each part lands as ONE atomic conventional commit after
  its gate is green.
- **Public-surface decision — settled once, here.** Every symbol this plan exports from
  `adapters/copilot/src/**` and `adapters/copilot/hooks/**` is **internal to the binding**:
  no barrel, no re-export, no package `exports` map, no engine import of adapter code
  (the dependency runs one way only — adapter → engine, never engine → adapter).
  `engine/src/observability/adapters/copilot/telemetry.js` exports `parseLines` as the
  **public** port surface, consumed by exactly one caller
  (`engine/src/observability/usage-mine-main.js`); its downstream surface gates are
  enumerated in Part 7. There is no generated API report, no barrel file, and no
  exhaustiveness switch in this repo — the registries that DO exist and must be
  pre-paid are: `scripts/ci.sh` (Part 1), `test/every-test-file-registers.test.js`
  (Part 1), `SOURCES` + `DEFAULT_READ_ROOTS` (Part 7), `test/living-corpus.test.js`
  (Part 8), `test/source-hygiene.test.js` (Parts 6 and 8), `README.md`'s adapter
  listing (Part 8).

### Pinned external contract the parts reproduce (do not re-derive)

Every row below was pinned against the live `copilot` binary and is authoritative.

| Fact | Value |
|---|---|
| Tool names | all lowercase: `bash`, `create`, `edit`, `view`, `glob`, `grep`, `task`, `skill`, … |
| Executed fields | `bash`→`command`; `create`→`path`+`file_text`; `edit`→`path`+`old_str`/`new_str`; `view`→`path` |
| `file_path` | **does not exist anywhere in Copilot's tool schemas** |
| `preToolUse` payload | stdin JSON `{ sessionId, timestamp, cwd, toolName, toolArgs }`; **`toolArgs` is a JSON-encoded STRING** |
| `preToolUse` enforcement | fires but **cannot deny** — neither `{"permission":"deny"}` on stdout nor `exit 2` blocks the call |
| Enforcing mechanisms | `--deny-tool='shell(git push)'` (takes precedence even over `--allow-all-tools`); native path containment via the allowed-dir list |
| Deny grammar | `shell(cmd:*)`, `write`, `<mcp-server>(tool)`, `url(domain)` |
| Containment flags | `--add-dir <dir>` extends the allowed set; `--allow-all-paths` DISABLES containment |
| Headless | `-p/--prompt <text>`; `--allow-all-tools` required non-interactively |
| Model flags | `--model <model>` (**`auto` is an accepted value**), `--effort` ∈ `none｜low｜medium｜high｜xhigh｜max`, `--context` ∈ `default｜long_context` |
| Config home | `$COPILOT_HOME` (default `~/.copilot`); user-level `config.json` holds `hooks.preToolUse`; `disableAllHooks` kills all hooks |
| Repo-level `.github/hooks/*.json` | did **not** fire — unproven, must not be relied on |
| Telemetry | `COPILOT_OTEL_FILE_EXPORTER_PATH=<file>` writes OTel JSON-lines; `--output-format json` carries **no** token counts |
| OTel file shape | **mixed**: span records (`{ name, kind, attributes, startTime, endTime, instrumentationScope: { name: 'github.copilot' }, parentSpanId, resource }`) AND metric records (no `kind`, no `instrumentationScope`) |
| Token carriers | leaf `chat <model>` spans; parent `invoke_agent` span (**rolled-up sums**); `gen_ai.client.token.usage` metric — the SAME tokens appear three times |
| Skills | `SKILL.md` + YAML frontmatter `name` + `description`; `session.skills_loaded` enumerates `{ name, description, source, userInvocable, enabled, path }` |
| Plugin loading | `--plugin-dir <dir>` (repeatable, local, no install step) |
| Subagents | `task` tool + `list_agents`/`read_agent`; config `subagents.agents.<name>` with `model`/`effortLevel`/`contextTier` |

---

## Part 1 — Copilot adapter skeleton, CRAFT_ROOT resolver, registered suite

### Context

**Why this part is first**: `scripts/ci.sh`'s `run_suite` treats a zero-file enumeration as
a HARD ERROR (`ci: ${label} suite enumerated zero test files under ${suite_dir}` → `exit 1`).
So the CI registration and the first test file must land in the SAME commit. Every later
part then extends an already-green suite.

**Files to create**

1. `adapters/copilot/package.json` — mirror `adapters/opencode/package.json` verbatim in
   shape (that file is 8 lines: `name`, `type`, `private`, `scripts.test`). Exact content:
   ```json
   {
     "name": "@craft/adapter-copilot",
     "type": "module",
     "private": true,
     "scripts": {
       "test": "node --test 'test/**/*.test.js'"
     }
   }
   ```
   No `bin` field (unlike `adapters/pi/package.json`, which ships `craft-pi`) — this
   binding has no headless entrypoint of its own; Copilot loads it via `--plugin-dir`.

2. `adapters/copilot/src/craft-root.js` — port of `adapters/pi/src/craft-root.js` (79 lines).
   Read that file first; it is the template. Current signature to reproduce:
   ```js
   export function resolveCraftRoot(moduleUrl, fsOps = { existsSync, realpathSync })
   ```
   Internal helpers to reproduce: `toAbsoluteModuleDir(moduleUrl)` (wraps `fileURLToPath`
   in try/catch, sets `modulePath = ''` on failure so a non-`file://` URL fails the
   `isAbsolute` check with a named error instead of an uncaught `URL` throw),
   `assertRootExists(root, fsOps)`, `assertContainsEngineBin(root, fsOps)`.

   **The one deliberate difference from the pi source**: the up-walk constant. pi uses
   `['..','..','..','..']` (FOUR) because its caller sits at
   `adapters/pi/extensions/craft-guard/`. Copilot's two callers —
   `adapters/copilot/src/*.js` and `adapters/copilot/hooks/craft-observer.js` — are BOTH
   at depth three from the repo root, so:
   ```js
   const UP_LEVELS_TO_REPO_ROOT = ['..', '..', '..'];
   ```
   Do not copy pi's four-level comment; write the comment for the copilot placement.
   The depth is asserted by test from the REAL file location, never assumed.

3. `adapters/copilot/test/craft-root.test.js` — new suite. Model the assertion style on
   `adapters/pi/test/craft-root.test.js` (read it for the fsOps-injection idiom).

**Files to edit**

4. `scripts/ci.sh` line 53 — after `run_suite adapters/opencode adapters/opencode/test adapters/opencode`
   append exactly:
   ```
   run_suite adapters/copilot adapters/copilot/test adapters/copilot
   ```
   Insert BEFORE `run_suite process test` (line 54) so the adapter suites stay grouped.

5. `test/every-test-file-registers.test.js` (CommonJS) — the `SUITE_DIRS` array at lines
   10–15. Append a fourth entry after the `adapters/opencode` one:
   ```js
   { label: 'adapters/copilot', dir: path.join(ROOT, 'adapters', 'copilot', 'test') },
   ```
   This file walks nested dirs and excludes only `fixtures`; a suite dir that does not
   exist throws `ENOENT` from `fs.readdirSync` — hence the same-commit rule above.

### TDD steps

**RED 1** — `adapters/copilot/test/craft-root.test.js`: "Given the adapter's own module
url, when resolveCraftRoot runs, then it returns the repo root that contains engine/bin".
The test file itself sits at `adapters/copilot/test/`, which is also THREE levels from the
repo root, so compute the expected root as
`resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')` and assert
`existsSync(join(result, 'engine', 'bin'))`. Expected failure:
`Cannot find module '../src/craft-root.js'`.

**RED 2** — "Given a moduleUrl whose computed root does not exist, when resolveCraftRoot
runs, then it throws naming the computed root". Inject `fsOps = { existsSync: () => false,
realpathSync: (p) => p }`. Assert `assert.throws(..., /does not exist/)`.

**RED 3** — "Given a computed root without engine/bin, when resolveCraftRoot runs, then it
throws naming the wrong up-walk depth". Inject `existsSync` returning `true` for the root
and `false` for the `engine/bin` join. Assert `/does not contain engine\/bin/`.

**RED 4** — "Given a non-file:// moduleUrl, when resolveCraftRoot runs, then it throws
rather than surfacing a URL error". Pass `'https://example.test/x.js'`; assert
`/did not resolve to an absolute path/`.

**RED 5** — **the up-walk depth pin**: "Given the real on-disk placement of the resolver,
when the up-level count is applied to a hooks-directory sibling, then it lands on the same
repo root". Build a synthetic moduleUrl at `adapters/copilot/hooks/craft-observer.js` via
`pathToFileURL(join(repoRoot,'adapters','copilot','hooks','craft-observer.js'))` and assert
`resolveCraftRoot(thatUrl)` equals `resolveCraftRoot(import.meta.url)` computed root. This
is the test that makes the shared constant safe for both caller depths.

**Ordering note (not a RED)** — `test/every-test-file-registers.test.js`'s
`enumerateTestFiles` calls `fs.readdirSync` on each suite dir, so adding the
`adapters/copilot` entry before `adapters/copilot/test/` exists throws `ENOENT` rather than
producing a meaningful failure. Create the test file first, so every RED above is the
module-not-found of RED 1; add the `SUITE_DIRS` entry and the `ci.sh` line in the same
commit.

**GREEN** — write `package.json`, `src/craft-root.js` with the three-level constant, add
the `ci.sh` line and the `SUITE_DIRS` entry.

**REFACTOR** — verify no `>20`-line function, early returns only, no magic strings (the
error messages are the only literals; keep them in the throw sites as pi does). Confirm
zero provenance tokens in every new file.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-copilot-binding/adapters/copilot && node --test 'test/**/*.test.js'
cd /Users/scolladon/workspace/perso/craft-native-copilot-binding && node --test test/every-test-file-registers.test.js
bash /Users/scolladon/workspace/perso/craft-native-copilot-binding/scripts/ci.sh
```
(The full `ci.sh` runs here because this part edits `ci.sh` itself — a mis-placed
`run_suite` line is only visible there.)

### Commit

```
feat(copilot): adapter skeleton with CRAFT_ROOT resolver and registered suite
```

---

## Part 2 — Model tier map

### Context

**File to create**: `adapters/copilot/src/model-tier-map.js`.

**Template**: `adapters/opencode/src/model-tier-map.js` (31 lines) and
`adapters/pi/src/model-tier-map.js` (31 lines) are byte-parallel apart from the exported
name and the default ids. Reproduce that shape exactly:

```js
export const DEFAULT_TIER_MODELS = Object.freeze({ … });
export function resolveCopilotModel(tier, overrides = {}) {
  if (Object.hasOwn(overrides, tier)) return overrides[tier];
  if (Object.hasOwn(DEFAULT_TIER_MODELS, tier)) return DEFAULT_TIER_MODELS[tier];
  throw new Error(`resolveCopilotModel: unknown tier "${tier}" has no override and no default`);
}
```
The `Object.hasOwn` checks are load-bearing and non-negotiable: a bare `overrides[tier]`
resolves inherited members (`__proto__`, `constructor`, `hasOwnProperty`) to truthy values
instead of failing loud. Keep the existing explanatory comment's intent (why own-property,
not what it does).

**The default map — pinned, do NOT invent model ids.** Real Copilot model ids are served,
not static, and require an authenticated seat; the design defers them to the on-demand
smoke. The only model value confirmed accepted by the live binary is the sentinel `auto`.
Therefore every tier defaults to `auto`, and the tier's *differentiation* is carried by
the **reasoning-effort companion**, whose enum IS pinned (`none｜low｜medium｜high｜xhigh｜max`):

```js
export const DEFAULT_TIER_MODELS = Object.freeze({
  opus: 'auto',
  sonnet: 'auto',
  haiku: 'auto',
});

export const DEFAULT_TIER_EFFORTS = Object.freeze({
  opus: 'high',
  sonnet: 'medium',
  haiku: 'low',
});

export function resolveCopilotEffort(tier, overrides = {}) { /* same own-property shape */ }
```
Swapping in real ids once the smoke pins them is a data edit to `DEFAULT_TIER_MODELS`, not
a code change — that is the whole point of the seam. Do not add a "TODO"/"TBD" marker
(stub-lint scans touched sources); the `auto` default is a working value, not a placeholder.

**Surface**: both exports are internal to the binding. `adapters/copilot/agents/craft-*.md`
frontmatter (Part 5) is cross-checked against `resolveCopilotModel` by
`adapters/copilot/test/native-surface.test.js`, exactly as
`adapters/opencode/test/agents.test.js` cross-checks `resolveOpencodeModel` — Part 5 owns
that assertion; this part only ships the map.

### TDD steps

**RED 1** — "Given a known tier and no overrides, when resolveCopilotModel runs, then it
returns the committed default". Expected failure: module not found.

**RED 2** — "Given an override for a known tier, when resolveCopilotModel runs, then the
override wins over the committed default".

**RED 3** — "Given an unknown tier with no override, when resolveCopilotModel runs, then it
throws naming the tier". Assert `/unknown tier "nope"/`.

**RED 4** — **the prototype-pollution pin**, one test per key:
`for (const reserved of ['__proto__', 'constructor', 'hasOwnProperty'])` — "Given the
inherited member `<reserved>` as a tier, when resolveCopilotModel runs, then it throws
rather than resolving an inherited value". Assert `assert.throws`. This is the mutation
that a bare bracket lookup would survive; it must be a real test, not a comment.

**RED 5** — the same four shapes for `resolveCopilotEffort`, plus "Given every tier in
DEFAULT_TIER_MODELS, when the effort map is consulted, then each tier has an effort from
the pinned enum" (assert membership in
`new Set(['none','low','medium','high','xhigh','max'])`). This catches a tier added to one
map and forgotten in the other.

**RED 6** — "Given DEFAULT_TIER_MODELS, when a caller attempts to mutate it, then the value
is unchanged" (`Object.isFrozen` assertion — immutability by default).

**GREEN** — write the module.

**REFACTOR** — the two resolvers share the own-property/throw shape. **Keep them separate.**
Each error message names its own failing function, and that specificity is what makes the
fail-loud useful at a call site; collapsing them behind a `lookupOrThrow(map, key, label)`
helper trades a genuinely useful message for four saved lines. Expressivity over DRY here —
decided, not left open.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-copilot-binding/adapters/copilot && node --test 'test/**/*.test.js'
```

### Commit

```
feat(copilot): tier to model map with fail-loud own-property lookup
```

---

## Part 3 — Enforcing layers: deny-tool pattern set and containment launch flags

### Context

This part ships the **two enforcing** guard layers. They are the strong ones — both
live-proven. The advisory audit layer is Part 4.

**File to create**: `adapters/copilot/src/deny-tool-args.js`.

**What it exports** (internal to the binding):

```js
export const DENY_TOOL_PATTERNS = Object.freeze([ … ]);
export function buildLaunchArgs({ workingDir }) → string[]
```

**The deny set.** Grammar is pinned: `shell(cmd:*)`, `write`, `<mcp-server>(tool)`,
`url(domain)`. `shell(git push)` is the one live-proven pattern (it returned
`success=false`, `result=null`, no git output at all). The committed set covers craft's
destructive-git concerns using the same `shell(<command prefix>)` form:

```js
const DENY_TOOL_PATTERNS = Object.freeze([
  'shell(git push)',
  'shell(git reset --hard)',
  'shell(git clean -fd)',
  'shell(git branch -D)',
]);
```

**The launch args.** `--allow-all-tools` IS emitted (headless requires it, and the pinned
docs state denial rules take precedence **even over `--allow-all-tools`**). `--add-dir
<workingDir>` IS emitted (containment scope). `--allow-all-paths` is **NEVER** emitted —
it disables Copilot's native path verification, which is the only enforcing containment
this binding has. Emission shape:

```js
['--allow-all-tools', '--add-dir', workingDir, ...DENY_TOOL_PATTERNS.map(p => `--deny-tool=${p}`)]
```
Emit `--add-dir` as two argv elements (flag + value), never a single interpolated string —
this is an argv array, never shell-interpolated (untrusted-input discipline; the same rule
`adapters/pi/src/execution.js` follows for its subprocess args).

**Input validation at the boundary**: an absent/empty/non-absolute `workingDir` must throw
a named error, not silently emit `--add-dir undefined`. Fail loud.

**Its consumer lands in Part 5**, so this is not dead code: `adapters/copilot/src/probe.js`
builds the argv it hands to the injected `copilotRunner` by calling
`buildLaunchArgs({ workingDir: targetPath })`, and the probe suite re-asserts there that the
argv reaching the runner never carries `--allow-all-paths`. Part 5's Context repeats the
wiring; do not leave the module unreferenced.

### TDD steps

**RED 1** — "Given the committed deny set, when it is inspected, then the live-proven
`shell(git push)` pattern is present". Expected failure: module not found.

**RED 2** — "Given every committed deny pattern, when each is matched against the pinned
grammar, then it is well-formed". Assert each matches
`/^(shell\([^()]+\)|write|url\([^()]+\)|[a-z0-9_-]+\([^()]+\))$/` — a pattern with unbalanced
parens or an empty argument fails.

**RED 3** — **the never-emit pin**: "Given a working dir, when buildLaunchArgs runs, then
`--allow-all-paths` appears nowhere in the emitted argv". Assert over the JOINED argv AND
over each element (`assert.ok(!args.some(a => a.includes('--allow-all-paths')))`) so a
future single-string emission cannot slip past an element-only check.

**RED 4** — "Given a working dir, when buildLaunchArgs runs, then `--add-dir` is emitted as
a flag element immediately followed by the working dir element". Assert
`args[args.indexOf('--add-dir') + 1] === workingDir`.

**RED 5** — "Given a working dir, when buildLaunchArgs runs, then every committed deny
pattern is emitted as its own `--deny-tool=<pattern>` element".

**RED 6** — "Given a missing working dir, when buildLaunchArgs runs, then it throws naming
the missing containment root" — and the same for `''` and for a relative path. Three cases.

**RED 7** — "Given the emitted argv, when `--allow-all-tools` is checked, then it is present
(headless requirement) even though deny rules take precedence over it". This pins the
non-obvious pairing so a later reader does not 'fix' it by removing the flag.

**RED 8** — "Given DENY_TOOL_PATTERNS, when a caller attempts to mutate it, then the value
is unchanged" (`Object.isFrozen`).

**GREEN** — write the module.

**REFACTOR** — extract the validation into a small `assertContainmentRoot(workingDir)`
early-return guard; no nesting beyond one level.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-copilot-binding/adapters/copilot && node --test 'test/**/*.test.js'
```

### Commit

```
feat(copilot): enforcing deny-tool pattern set and containment launch flags
```

---

## Part 4 — Audit layer: preToolUse guard adapter over the shared gate predicate

### Context

This is the **highest-risk part in the plan**. Read the whole block before writing code.

**The predicate is reused VERBATIM — do not re-author it.**
`adapters/pi/src/gate.js` is the binding-neutral guard predicate. Its current exported
surface, unchanged by this part:

```js
export const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);
export function toolCallGuard(event) // event: { tool, tool_input, working_dir }
                                     // → { block: boolean, reason?: string }
```
It branches on exactly two things: `tool === 'Bash'` → `guardBashCommand(tool_input.command ?? '')`
(the `git diff`/`git show` without `--no-ext-diff` rule, with `--no-ext-diff` and
`rtk proxy` as compliant markers); and `WRITE_TOOLS.has(tool)` →
`guardWritePath(tool_input.file_path ?? '', working_dir)` (resolve-and-prefix containment).
Everything else returns `{ block: false }`.

The copilot adapter **imports it across the adapter boundary**:
```js
import { toolCallGuard, WRITE_TOOLS } from '../../pi/src/gate.js';
```
This is deliberate and settled — the predicate stays single-sourced across all four
bindings, and `adapters/copilot/` therefore ships **no `gate.js` of its own**. Do not copy
the file. Do not re-express the regex (unlike `adapters/opencode/src/git-guard-predicate.js`,
which re-expressed it under a different, earlier decision).

**Files to create**

1. `adapters/copilot/src/git-guard-adapter.js`

   Reference implementation to model on: `adapters/pi/src/tool-call-hook.js` (118 lines) —
   read it fully. It solves the identical problem for pi and carries the exact hazard this
   part must avoid, documented at its lines 19–28.

   Required behaviour, each clause load-bearing:

   - **Tool-name casing.** Copilot tool names are all lowercase. Map ONLY the tools the
     shared predicate branches on:
     ```js
     const COPILOT_TOOL_NAME_CASING = Object.freeze({ bash: 'Bash', create: 'Write', edit: 'Edit' });
     ```
     Three entries. Not `view` (read-only — the predicate has no branch for it, and an
     inert entry is dead weight that implies coverage that does not exist). Not
     `notebookedit` (Copilot has no such tool). Unknown names pass through unchanged and
     hit the predicate's `{ block: false }` tail.

   - **`toolArgs` is a JSON STRING.** The stdin payload is
     `{ sessionId, timestamp, cwd, toolName, toolArgs }` and `toolArgs` is JSON-encoded
     text, not an object. Parse it. **A parse failure fails CLOSED** — return
     `{ block: true }`, never `{}` and never a pass-through. The failure is handled (a
     block verdict is returned), not swallowed.

   - **The `path` → `file_path` bridge is UNCONDITIONAL.** Copilot has no `file_path`
     field anywhere in its tool schemas, while the shared predicate reads only
     `tool_input.file_path`. So:
     ```js
     return { ...parsedArgs, file_path: parsedArgs.path };
     ```
     **Never** `file_path: parsedArgs.file_path ?? parsedArgs.path`, and never a
     conditional `if (parsedArgs.path === undefined) return parsedArgs;` (pi needs that
     guard for back-compat events; Copilot does not, and it re-opens the hole). A
     preference for the inspected field over the executed field lets an in-tree
     `file_path` decoy mask an out-of-tree `path` — the escape this part exists to close.

   - **`working_dir`** comes from the payload's `cwd`.

   - **Never throws.** The exported entry wraps everything in `try { … } catch { return
     { block: true } }` — fail-safe, same posture as `toolCallHook`.

   Suggested exported surface (internal to the binding):
   ```js
   export function adaptCopilotEvent(payload)  // → { tool, tool_input, working_dir }  (throws on bad toolArgs)
   export function decideGuard(payload, guard = toolCallGuard)  // → { block, reason? }  (never throws)
   ```

2. `adapters/copilot/hooks/craft-observer.js` — the `preToolUse` observer. A THIN wrapper,
   structurally asserted rather than behaviourally re-tested (the logic lives in the
   adapter, which is unit-tested). It must:
   - read the stdin JSON payload,
   - call `decideGuard`,
   - **record** the verdict (audit) — write a single line to stderr; never stdout, so it
     cannot be mistaken for a permission response,
   - **always exit 0**, because the hook is observational: the live probe proved neither
     `{"permission":"deny"}` on stdout nor `exit 2` blocks the call, and
     `git push --force origin main` executed in both cases,
   - set `process.env.CRAFT_ROOT` from `resolveCraftRoot(import.meta.url)` (Part 1;
     the three-level up-walk was pinned by Part 1's RED 5 for exactly this file's depth),
   - carry a comment stating the audit-only posture — a future reader must not "fix" the
     exit code into a fake enforcement.

**Files to create (tests)**

3. `adapters/copilot/test/git-guard-adapter.test.js`
4. `adapters/copilot/test/git-guard-predicate.test.js` — proves the reuse is real. Model
   its cases on `adapters/pi/test/gate.test.js` (read it; it is the byte-source for the
   predicate cases). Two things to assert here that the pi suite does not: (a) the module
   the copilot adapter imports IS `adapters/pi/src/gate.js` — assert
   `existsSync(join(repoRoot,'adapters','pi','src','gate.js'))` and assert the copilot
   adapter source text matches `/\.\.\/\.\.\/pi\/src\/gate\.js/`; (b) no
   `adapters/copilot/src/gate.js` exists (a copy would silently fork the predicate).

### TDD steps

**RED 1** — "Given a lowercase `bash` tool call whose command is `git diff HEAD`, when
decideGuard runs, then it blocks with the ext-diff reason". `toolArgs` supplied as
`JSON.stringify({ command: 'git diff HEAD' })`. Expected failure: module not found.

**RED 2** — "Given a lowercase `bash` call carrying `--no-ext-diff`, when decideGuard runs,
then it passes". Same for a `rtk proxy` command.

**RED 3** — "Given a lowercase `create` call whose `path` is inside cwd, when decideGuard
runs, then it passes"; and "…whose `path` escapes cwd via `../`, then it blocks".

**RED 4** — the same in-tree/out-of-tree pair for lowercase `edit`.

**RED 5** — **THE DECOY TEST — the reason this part exists.** "Given a `create` call whose
`file_path` is in-tree but whose `path` escapes the working dir, when decideGuard runs,
then it blocks". Payload:
```js
{ cwd: '/repo', toolName: 'create',
  toolArgs: JSON.stringify({ file_path: '/repo/innocent.txt', path: '/etc/passwd', file_text: 'x' }) }
```
Assert `{ block: true }`. A `file_path ?? path` implementation passes this input — that is
precisely the failure mode being pinned.

**RED 6** — **fail-closed parse**: "Given a payload whose `toolArgs` is not valid JSON,
when decideGuard runs, then it blocks". Pass `toolArgs: '{not json'`. Assert
`{ block: true }`. Also: `toolArgs` absent entirely → blocks. Also: `toolArgs` present but
JSON-encoding a non-object (`'"a string"'`, `'42'`, `'null'`) → blocks. Four cases; each is
a distinct way the executed field could go unread.

**RED 7** — **never throws**: "Given a structurally hostile payload, when decideGuard runs,
then it returns a verdict rather than throwing". Cases: `undefined` payload, `null`
payload, a payload whose `cwd` is absent, a guard injection that throws
(`decideGuard(validPayload, () => { throw new Error('boom'); })`). Every case asserts a
returned object, and the throwing-guard case asserts `{ block: true }`.

**RED 8** — "Given an unmapped lowercase tool (`view`, `glob`, `task`), when decideGuard
runs, then it passes through unblocked". Three cases — pins that no inert casing entry was
added and that read tools are not accidentally guarded.

**RED 9** — "Given a `bash` payload, when the adapted event is inspected, then `working_dir`
carries the payload's `cwd`".

**RED 10** — `git-guard-predicate.test.js`: port the predicate cases from
`adapters/pi/test/gate.test.js` (git diff/show variants including the global-option forms
`git -C <dir> diff`, `git -c x diff`, `git --git-dir=<d> show`; the non-matching
`git stash show`, `git show-ref`, `git difftool`; the compliant markers; the containment
pass/block pair). Plus the two single-source assertions in the Context block above.
Expected failure for those two: the copilot adapter file does not yet import the pi gate.

**RED 11** — observer structure (in `git-guard-adapter.test.js` or a small describe block):
"Given the observer source text, when scanned, then it imports the tested adapter seam"
(`/\.\.\/src\/git-guard-adapter\.js/`); "…then it imports the tested craft-root seam"
(`/\.\.\/src\/craft-root\.js/` and `/resolveCraftRoot/`); "…then it sets
`process.env.CRAFT_ROOT`"; "…then it carries no phase/ADR/backlog reference". This mirrors
`adapters/pi/test/native-surface.test.js`'s extension-structure describe block.

**GREEN** — write `git-guard-adapter.js`, then `hooks/craft-observer.js`.

**REFACTOR** — keep `adaptCopilotEvent` and `decideGuard` each under 20 lines; the bridge is
its own named function (`bridgeExecutedPath`) with a WHY comment naming the decoy hazard.
No boolean parameters. Verify the fail-closed catch returns a verdict on every path.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-copilot-binding/adapters/copilot && node --test 'test/**/*.test.js'
```

### Commit

```
feat(copilot): preToolUse guard adapter over the shared gate predicate
```

---

## Part 5 — Native plugin surface, entrypoint skill, config template and acceptance probe

### Context

The single-part sizing here matches the precedent: the equivalent pi native-surface part
landed as ONE part. It is broad but mechanical — the bodies are COPIED, never authored.

**The single-sourcing rule (non-negotiable)**: phase procedures and agent bodies are
single-sourced from the shared craft sources. Only per-binding FRONTMATTER is
re-expressed. The proof that this holds today, verified against this tree: all nine
`adapters/opencode/agents/craft-<role>.md` bodies are byte-identical to their
`agents/<role>.md` counterparts (body = everything after the closing `---` fence, leading
blank lines stripped).

**Files to create**

1. `adapters/copilot/agents/craft-<role>.md` — nine files. Roles and their tiers (identical
   to `adapters/opencode/test/agents.test.js`'s `ROLE_TIERS`):

   | role | tier |
   |---|---|
   | `designer` | opus |
   | `planner` | opus |
   | `reviewer` | opus |
   | `requirements-writer` | opus |
   | `part-implementer` | sonnet |
   | `harness-triager` | sonnet |
   | `docs-writer` | sonnet |
   | `refactor-executor` | sonnet |
   | `backlog-ticker` | haiku |

   **Body**: byte-identical to `agents/<role>.md`'s body. Extract mechanically — do not
   retype, do not reflow, do not "improve" wording.
   **Frontmatter** — exactly four keys, decided here so no part re-opens it:
   `name: craft-<role>`, `description` (copied from the shared source's frontmatter),
   `model` (the value `resolveCopilotModel(tier)` returns), `effort` (the value
   `resolveCopilotEffort(tier)` returns). Do NOT carry opencode's `mode: subagent` /
   `permission:` block — that is opencode's schema, not Copilot's. Do NOT carry the shared
   source's bare tier string in `model:` — the tier→id mapping is the adapter's job and the
   test in RED 4 pins it.

2. `adapters/copilot/skills/craft-<phase>/SKILL.md` — Copilot's `SKILL.md` frontmatter is
   `name` + `description`, shape-identical to craft's Claude skills, so the shared skill
   bodies are copied verbatim. Frontmatter: `name: craft-<phase>` (matching the containing
   directory, which is how Copilot resolves the skill) and `description` copied from the
   shared source. Ship the same phase set the other bindings expose: `run`, `review`,
   `validation`, `init` (the four that `adapters/pi/prompts/craft-<phase>.md` and
   `adapters/opencode/commands/craft-<phase>.md` expose). Source bodies:
   `skills/run/SKILL.md`, `skills/review/SKILL.md`, `skills/validation/SKILL.md`,
   `skills/init/SKILL.md`.

   **Do not assert `userInvocable` anywhere.** Whether frontmatter can set it `true` is
   unverified — only `userInvocable: false` was ever observed, on a builtin skill. Both
   invocation paths work headlessly regardless (`{ skill: "craft-run" }` via the `skill`
   tool, or `copilot -p "/craft-run <input>"`), so this is an ergonomics question the smoke
   settles, not a blocker. A test asserting it would be asserting a guess.

3. `adapters/copilot/commands/craft-run.md` — the invocation surface. Its relationship to
   `skills/craft-run/SKILL.md` is deliberate and worth stating: **the skill carries the
   procedure body** (single-sourced from `skills/run/SKILL.md`, byte-identical, pinned by
   RED 2); **the command is the thin entry** that names the input and points at that
   procedure. Model it on `adapters/opencode/commands/craft-run.md` (21 lines, read it). It
   must thread `$ARGUMENTS` and point at `skills/run/SKILL.md` as the verbatim procedure —
   never restate or summarise the run procedure. **Do not copy opencode's
   `` !`node …` `` shell-expansion line**: `adapters/pi/test/native-surface.test.js`
   asserts prompt bodies carry no `` /!`[^`]*`/ `` shell-injection expansion, and this part
   applies the same rule (Copilot's headless `-p` path is not a place to smuggle a
   subshell). Express the pipeline-resolve step as an instruction, not an expansion.

4. `adapters/copilot/config.template.json` — the `$COPILOT_HOME/config.json` fragment.
   Model on `adapters/pi/settings.template.json` (a `$comment` key explaining how to merge
   it, then the keys). Required content:
   - `hooks.preToolUse` declared at **user level** — the repo-level hooks-directory path
     did not fire in the probe and must not be relied on. The hook command points at
     `<CRAFT_ROOT>/adapters/copilot/hooks/craft-observer.js`. Copilot has no plugin-root
     environment variable of its own, and this fragment is merged into a file OUTSIDE the
     repo, so the command cannot be repo-relative: the template ships the literal
     `<CRAFT_ROOT>` placeholder and the `$comment` instructs the user to substitute the
     absolute repo path. The observer then self-locates and exports `process.env.CRAFT_ROOT`
     for everything downstream, so this substitution is needed in exactly one place.
   - `disableAllHooks` **not set to true** (setting it kills the observer entirely).
   - `subagents.agents.<agent-name>` entries for the nine roles, each carrying
     `model`/`effortLevel` (both may be the string `"inherit"`), mirroring the tier map.
   - **No provider/model pin outside the tier map's vocabulary** — the manifest stays
     provider-neutral.

5. `adapters/copilot/README.md` — how to load the binding
   (`--plugin-dir <repo>/adapters/copilot`, repeatable, local, no install step), the
   distribution path (`copilot plugin install owner/repo:adapters/copilot`), the merge
   instruction for `config.template.json`, and the guard's honest enforcement profile:
   containment and `--deny-tool` enforce; the `preToolUse` observer is audit-only.
   **No provenance refs** — the README is scanned by the same regex.

6. `adapters/copilot/src/probe.js` — `runAcceptanceProbe`. `adapters/opencode/src/probe.js`
   (106 lines) and `adapters/pi/src/probe.js` (106 lines) are byte-parallel apart from the
   runner parameter name and one evidence field. Port it: same
   `PHASE_ID = 'implementation'`, `MODEL_TIER = 'sonnet'`,
   `PORTS_EXERCISED = ['Execution','Model','Gate','VCS']`, same
   `assertMutationsInsideThrowaway` / `assertGateGreenBeforeCommit` /
   `assertCommittedArtifact` / `evaluateTrace` / `buildEvidence` helpers. Signature:
   ```js
   export async function runAcceptanceProbe({ copilotRunner, fsOps })
   ```
   with `buildEvidence` carrying `copilotVersion` instead of `opencodeVersion`.

   **Two copilot-specific differences from the two siblings:**
   - the probe builds the argv it hands to `copilotRunner` via
     `buildLaunchArgs({ workingDir: targetPath })` from Part 3's
     `../src/deny-tool-args.js`, and passes it in the runner call alongside
     `phaseId`/`modelTier`/`workingDir`. This is the enforcing layers' only production
     consumer — without it Part 3 ships unreferenced.
   - keep the helper name `assertMutationsInsideThrowaway` for parity with the two
     siblings. It contains a class-A banned token, but `test/source-hygiene.test.js` scans
     `pipeline skills agents contracts templates engine/src docs/adapters docs/DOD.md
     docs/GUIDE-customizing.md README.md` — `adapters/**` is NOT in that set, so the name is
     safe here and consistent with the code the reviewer will diff it against.

**Files to create (tests)**

7. `adapters/copilot/test/native-surface.test.js` — model on
   `adapters/pi/test/native-surface.test.js` (322 lines; reuse its dependency-free
   `parseFrontmatter(content)` helper verbatim — a `---`-fenced split with a
   `/^([a-zA-Z_-]+):\s?(.*)$/` attr regex, no YAML dependency).
8. `adapters/copilot/test/config.test.js`
9. `adapters/copilot/test/probe.test.js` — model on `adapters/opencode/test/probe.test.js`.

### TDD steps

**RED 1** — **the byte-identity pin, one test per role**: "Given agent `craft-<role>.md`,
when its body is compared to the shared craft source, then the two are byte-identical".
Read `agents/<role>.md` and `adapters/copilot/agents/craft-<role>.md`, split each on its
closing `---` fence, strip leading blank lines, `assert.equal` the remainders. Nine tests.
Expected failure: the agent files do not exist.

**RED 2** — the same byte-identity pin for the four skills: "Given
`skills/craft-<phase>/SKILL.md`, when its body is compared to `skills/<phase>/SKILL.md`,
then the two are byte-identical". Four tests.

**RED 3** — frontmatter contract: per role, `description` non-empty; `model` non-empty;
`effort` non-empty. Per skill, `name` and `description` both non-empty (Copilot reads
exactly these two).

**RED 4** — **tier consistency**: per role, "Given role `<role>` pinned to tier `<tier>`,
when compared to resolveCopilotModel(), then the frontmatter model matches the tier map" —
and the same for `effort` against `resolveCopilotEffort()`. This is the assertion that
makes Part 2's map the single source; import it from `../src/model-tier-map.js`.

**RED 5** — hygiene, over every agent body, every skill body, `commands/craft-run.md` and
`README.md`: no provenance ref (`/\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i`); no
shell-injection expansion (`` /!`[^`]*`/ ``).

**RED 5b — the plugin-root rule, and why it is NOT opencode's rule.** Verified against this
tree: the shared agent bodies contain **zero** `${CLAUDE_PLUGIN_ROOT}` occurrences (which is
why `adapters/opencode/test/agents.test.js` can assert a flat prohibition over agent bodies),
but the shared **skill** bodies contain **seven** in `skills/run/SKILL.md`, one each in
`review` and `validation`, and five in `init`. A flat prohibition over skill bodies would
directly contradict RED 2's byte-identity requirement — the two assertions cannot both hold.
The reconciling rule, which is also the design's stated intent ("reuse the
`${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` shim"):

> `${CLAUDE_PLUGIN_ROOT}` may appear ONLY inside the exact shim
> `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}`. A bare occurrence is a failure.

Assert it that way across all four surfaces: strip every occurrence of the literal shim
string from the text, then assert the remainder contains no `${CLAUDE_PLUGIN_ROOT}`. Agent
bodies pass trivially (zero occurrences); skill bodies stay byte-identical; and the pin is
meaningful — it is exactly the condition under which the observer's `process.env.CRAFT_ROOT`
export (Part 4) makes the copied bodies resolve on a host that has no Claude plugin root.

**RED 6** — `commands/craft-run.md`: carries `$ARGUMENTS`; instructs loading the shared run
skill (`/skills\//`).

**RED 7** — `config.test.js`: parses as JSON; `hooks.preToolUse` is declared and its command
string references `hooks/craft-observer.js`; the command carries the `<CRAFT_ROOT>`
placeholder AND the `$comment` explains the substitution (a template that silently ships a
machine-specific absolute path is the failure this pins); `disableAllHooks` is not `true`;
`subagents.agents` carries an entry for each of the nine roles. Plus a resource-existence
block mirroring the pi suite's `package.json — pi manifest resource existence` describe:
for each declared path, strip the `<CRAFT_ROOT>/` prefix, resolve against the repo root, and
`existsSync`-check it — so a renamed hook file breaks the template loudly.

**RED 8** — `probe.test.js`: green trace → `{ passed: true }`; red gate outcome → `passed:
false`; gate-after-commit → `passed: false`; missing committed artifact → `passed: false`;
a path written outside the throwaway → `passed: false`; evidence carries `targetPath`,
`copilotVersion`, `model` and the four `portsExercised`.

**RED 9** — **the launch-args wiring**: "Given a probe run, when the injected runner is
called, then it receives the containment launch argv" — capture the runner's argument, assert
it contains `--add-dir` immediately followed by the throwaway path, and assert
`--allow-all-paths` appears in no element. This is the second, independent place the
never-emit rule is pinned, at the layer that actually launches.

**GREEN** — copy the bodies mechanically, author only frontmatter and the config template,
port `probe.js`.

**REFACTOR** — de-duplicate the two byte-identity readers into one
`bodyOf(filePath)` helper in the test file. Re-run the hygiene assertions; a copied shared
body containing a `${CLAUDE_PLUGIN_ROOT}` token means the wrong source was copied.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-copilot-binding/adapters/copilot && node --test 'test/**/*.test.js'
```

### Commit

```
feat(copilot): native plugin surface, entrypoint skill and acceptance probe
```

---

## Part 6 — Copilot OTel telemetry binding

### Context

**The engine is ADDITIVE-ONLY across Parts 6 and 7.** The only engine source files this
plan may touch are the new `adapters/copilot/telemetry.js` sibling (this part) and two
constant entries in `usage-mine-main.js` (Part 7). Nothing else in `engine/src` changes.

**File to create**: `engine/src/observability/adapters/copilot/telemetry.js`.

**Siblings to read first**: `engine/src/observability/adapters/pi/telemetry.js` (147 lines)
and `.../opencode/telemetry.js` (153 lines). Both end in the identical exported shape this
part must reproduce:

```js
export async function parseLines(lines, since = null)
  // lines: AsyncIterable<string>
  // → Promise<{ events: object[], skipped: number, markers: object[] }>
```
and both carry `const numOrZero = (v) => (Number.isFinite(v) ? v : 0);` — reuse that exact
coercion so non-finite token values cannot poison downstream cost math.

**The input is NOT `--output-format json`.** It is the OTel JSON-lines file exporter
(`COPILOT_OTEL_FILE_EXPORTER_PATH`). The JSONL result event carries no token counts, and
`session-store.db` has no token columns. The file is **mixed**: OTLP span records AND
metric records.

**The selection rule — the load-bearing part of this parser.** The same tokens appear
THREE times: on leaf `chat` spans, summed again on the parent `invoke_agent` span, and
again in the `gen_ai.client.token.usage` metric. A parser that ingests every token-bearing
record inflates cost ~3×. Count **exactly one tier**:

> Ingest only records that are spans — `instrumentationScope?.name === 'github.copilot'`
> **and** `kind` present (metric records have neither) — whose
> `attributes['gen_ai.operation.name'] === 'chat'`. Ignore `invoke_agent` for token math.
> Ignore `execute_tool`. Ignore every metric record.

Discriminate **structurally on `kind`/`instrumentationScope`, never on `name` alone** —
metric names and span names overlap in the `gen_ai.*` namespace.

`chat` spans are the leaves, so they are the only tier that sums correctly regardless of
fan-out depth.

**UsageEvent mapping** (the neutral shape the core consumes — field names must match the
siblings exactly):

| field | source |
|---|---|
| `run` | `attributes['gen_ai.conversation.id'] ?? null` |
| `slug` | `null` |
| `phase` | `null` (caller-injected, as pi does) |
| `role` | `null` (subagent attribution is unpinned; do not guess an attribute name) |
| `model` | `attributes['gen_ai.response.model'] ?? attributes['gen_ai.request.model'] ?? null` |
| `tokens.input` | `numOrZero(attributes['gen_ai.usage.input_tokens'])` |
| `tokens.output` | `numOrZero(attributes['gen_ai.usage.output_tokens'])` |
| `tokens.cacheRead` | `0` — no Copilot equivalent is pinned |
| `tokens.cacheCreation` | `0` — same |
| `cacheCreationTtl` | `null` |
| `messages` | `1` per `chat` span |
| `durationMs` | derived from `startTime`/`endTime`, else `0` |

**On `run`**: the design's prose names `result.sessionId` as a fallback. That field lives in
the `--output-format json` result event, which is a DIFFERENT stream and never appears in
the OTel file — so within this parser the fallback is `null`, and stable run identity is
supplied by the port's existing caller-side `deps.sessionId` seam (the same seam the claude
binding uses). Do not invent a sessionId read here; the adapter never receives a path.

**On `durationMs`**: the exact time encoding under a real GitHub-routed run is not pinned.
Write a defensive `toEpochMs(v)` helper: a finite number passes through; a string that
`Date.parse`es to a finite value converts; everything else yields `0`. Then
`durationMs = numOrZero(Math.max(0, end - start))` when both resolve, else `0`. Never throw
on a shape you did not expect.

**Port contract — the adapter NEVER throws.** Malformed lines are skipped and counted in
`skipped` (that IS the handling — the count is surfaced by the front door, not discarded).
A structurally hostile record (null `attributes`, missing `instrumentationScope`) must be
handled by optional chaining, not by a bare try/catch that hides a real defect. Partial
data returns a partial array; empty input returns `[]`.

**`since` cutoff**: mirror the siblings — when `since` is set, drop records whose start
time predates it. Use the span's `startTime`; the comparison shape is the siblings'
(`if (ts !== null && ts < since) continue;`).

**`markers` is always `[]`.** Copilot emits no auto-skip signal text for the parser to
scan, exactly as pi and opencode emit none. Return the empty array; do not invent a marker
vocabulary.

**Fixtures to create** — `engine/test/fixtures/copilot/` (the `engine/test/fixtures/pi/`
and `.../opencode/` dirs are the precedent; each holds 3 small `.jsonl` files):

- `single-chat.jsonl` — one `chat` span with known token values.
- `rollup-and-metric.jsonl` — **the no-double-count fixture**: two `chat` spans
  (input 1234 / output 56 each), their parent `invoke_agent` span carrying the rolled-up
  sums (input 2468 / output 112 — the live-observed `2468 = 2 × 1234`, `112 = 2 × 56`), one
  `execute_tool` span, and one `gen_ai.client.token.usage` metric record (no `kind`, no
  `instrumentationScope`) also carrying 2468/112.
- `malformed.jsonl` — one unparseable line plus one valid `chat` span.

**Test file**: `engine/test/copilot-telemetry.test.js`. Note the path: the repo convention
is FLAT (`engine/test/pi-telemetry.test.js`, `engine/test/opencode-telemetry.test.js`,
`engine/test/telemetry-claude.test.js`); the design's prose names a nested
`engine/test/observability/…` path that does not match this tree. Follow the repo. Model
the file header on `engine/test/pi-telemetry.test.js` (its `fixtureLines(name)` +
`async function* asyncLines(lines)` helpers port directly).

**No suite registration is needed for this part or Part 7.** `scripts/ci.sh` already runs
`run_suite engine engine/test engine` (a `find`-based enumeration that picks up any new
`*.test.js` under `engine/test`), and `test/every-test-file-registers.test.js` already walks
the `engine` suite dir recursively while excluding `fixtures` — so the new fixture directory
is correctly ignored and the new test file is automatically enrolled. Only the
`adapters/copilot` suite needed explicit registration, and Part 1 paid it.

**The class-B tripwire this part MUST pre-pay.** The literal `'github.copilot'` is required
(it is the OTel instrumentation-scope discriminator) and it lives in `engine/src`, which
`test/source-hygiene.test.js` scans with the case-sensitive `\bgh\b|\bgithub\b` pattern.
Add ONE content-scoped allowlist filter to the class-B test's filter array (lines 104–122),
in the existing commented style, naming the reviewed boundary — the OTel scope name is a
vendor protocol identifier at the adapter's own binding location, not a host-CLI reference:
```js
// engine/src/observability/adapters/copilot/telemetry.js: the OTel instrumentation-scope
// name is the protocol-level discriminator that separates span records from metric
// records — a vendor identifier at the vendor binding's own home, not a host-CLI call.
/engine\/src\/observability\/adapters\/copilot\/telemetry\.js:[0-9]+:.*github\.copilot/,
```
Without this the phase gate goes red on a file that is otherwise correct.

Also relevant: `test/source-hygiene.test.js`'s class-C check requires vendor-suffixed
basenames to live under `adapters/<vendor>/`. The new file's basename is `telemetry.js`
(neutral) at `.../adapters/copilot/`, so class-C passes unchanged — do not rename it to
`telemetry-copilot.js`.

### TDD steps

**RED 1** — "Given a single `chat` span line, when parseLines runs, then it emits one
UsageEvent carrying the conversation id as `run`, the response model, and the span's input
and output tokens". Expected failure: module not found.

**RED 2** — **THE NO-DOUBLE-COUNT TEST**: "Given two `chat` spans, their `invoke_agent`
roll-up, an `execute_tool` span and the `gen_ai.client.token.usage` metric, when parseLines
runs, then exactly two events are emitted and the token totals equal the two leaves, not
three times them". Assert `events.length === 2`, summed `input === 2468`, summed
`output === 112`. A parser ingesting every token-bearing record yields 7404/336 and fails
loudly. This is the highest-value assertion in the part.

**RED 3** — "Given a metric record with no `kind` and no `instrumentationScope`, when
parseLines runs, then it is ignored and no event is emitted". Standalone, so the
discrimination rule is pinned independently of the roll-up fixture.

**RED 4** — "Given an `invoke_agent` span in isolation, when parseLines runs, then no event
is emitted" (attribution-only, never tokens). Same for an `execute_tool` span.

**RED 5** — "Given a span whose `instrumentationScope.name` is some other library, when
parseLines runs, then it is ignored" — a foreign OTel producer writing to the same file
must not be counted.

**RED 6** — "Given a `chat` span with missing / non-finite token attributes (`'abc'`,
`NaN`, `null`, absent), when parseLines runs, then every token field coerces to 0". One
test per shape.

**RED 7** — "Given a malformed line among valid ones, when parseLines runs, then the line
is skipped, `skipped` is 1, and the valid events are still returned".

**RED 8** — **never throws (port contract)**: "Given structurally hostile records, when
parseLines runs, then it resolves rather than rejecting". Cases: `attributes: null`;
`instrumentationScope: null`; a JSON line encoding `null`; a line encoding an array; a line
encoding a bare number. Each asserts `assert.doesNotReject` and a defined result object.

**RED 9** — "Given empty input, when parseLines runs, then it returns
`{ events: [], skipped: 0, markers: [] }`".

**RED 10** — "Given a `since` cutoff later than the span's start time, when parseLines runs,
then the span is dropped"; and "…earlier than the start time, then it is kept".

**RED 11** — **redaction whitelist**: "Given any emitted event, when its keys are
enumerated, then they are exactly the neutral UsageEvent field set". Port the
`WHITELISTED_FIELDS` constant from `engine/test/pi-telemetry.test.js`
(`['run','slug','phase','role','model','tokens','cacheCreationTtl','messages','durationMs']`)
and `assert.deepEqual(Object.keys(event).sort(), WHITELISTED_FIELDS)`. No path, `$HOME`
fragment, username or prompt text may reach the core.

**RED 12** — **the property/round-trip lens the design calls for**: "Given a generated set
of well-formed `chat` span lines, when parsed and aggregated, then the aggregate token sums
equal the input sums". Build ~50 lines with pseudo-random-but-seeded token values (a plain
deterministic loop — no random, no clock), feed `parseLines` → `aggregate` from
`../src/observability/usage-aggregate.js`, and compare totals. `engine/test/pi-telemetry.test.js`
already imports `aggregate`/`serializeReport` for exactly this kind of end-to-end pass —
follow its import block.

**RED 13** — `test/source-hygiene.test.js` goes red on the `github.copilot` literal the
moment GREEN lands. Add the allowlist filter in the same commit and re-run
`node --test test/source-hygiene.test.js` to prove it passes with the filter and fails
without it (verify by temporarily removing the filter, then restore).

**GREEN** — write the fixtures, then the parser.

**REFACTOR** — extract `isCopilotSpan(record)`, `isChatSpan(record)`, `toEpochMs(v)` and
`eventFromChatSpan(record)` as named helpers, each under 20 lines with a WHY comment on the
discrimination rule. `parseLines` itself stays a thin loop mirroring the siblings.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-copilot-binding/engine && node --test test/copilot-telemetry.test.js
cd /Users/scolladon/workspace/perso/craft-native-copilot-binding && node --test test/source-hygiene.test.js
```

### Commit

```
feat(observability): copilot OTel telemetry binding counting chat spans only
```

---

## Part 7 — Front-door wiring and contract-equivalence proof

### Context

Two additive engine edits and two test extensions. Both edits are in
`engine/src/observability/usage-mine-main.js` (283 lines) — read its header comment first;
it documents the two containment roots and the one deliberate non-zero exit.

**Edit 1 — the source selector.** Current constant at lines 41–45:
```js
const SOURCES = Object.freeze({
  claude: claudeParseLines,
  opencode: opencodeParseLines,
  pi: piParseLines,
});
```
Add `copilot: copilotParseLines` **last**, and the matching import beside the three at
lines 29–31:
```js
import { parseLines as copilotParseLines } from './adapters/copilot/telemetry.js';
```
**Append last, do not reorder.** `unknownSourceMessage` interpolates
`Object.keys(SOURCES).join('|')`, and an existing test asserts the stderr contains the
adjacent pair `'claude|opencode'` (`engine/test/usage-mine-main.test.js` ~line 944, with a
comment explaining it pins the `|` separator against a `join("")` mutant). Appending keeps
that pair adjacent; reordering breaks a passing test for no reason.

**Edit 2 — the default read root.** Current constant at lines 51–54:
```js
const DEFAULT_READ_ROOTS = Object.freeze({
  claude: () => DEFAULT_PROJECTS_DIR,
  pi: () => process.env.PI_CODING_AGENT_SESSION_DIR || join(homedir(), '.pi', 'agent', 'sessions'),
});
```
Add:
```js
copilot: () => process.env.COPILOT_OTEL_FILE_EXPORTER_PATH
  ? dirname(process.env.COPILOT_OTEL_FILE_EXPORTER_PATH)
  : join(homedir(), '.copilot', 'otel'),
```
Three properties are load-bearing:
1. **It is a THUNK.** Every entry in this map is a function precisely so an env-backed
   default is read per invocation and never frozen stale at module-load time (the comment
   at lines 47–50 says so). A non-function value, or an env read hoisted to module scope,
   breaks the contract.
2. **`dirname`, because of a shape mismatch.** `DEFAULT_READ_ROOTS` entries are
   **directories** — `readTranscripts`/`readdirSync` iterate them — but
   `COPILOT_OTEL_FILE_EXPORTER_PATH` names a **single file**. The pi precedent
   (`PI_CODING_AGENT_SESSION_DIR`, already a directory) does not answer this. Resolving to
   the file's `dirname` keeps the env var the single source of truth without changing the
   port's directory contract. `dirname` must be added to the existing
   `import { resolve, join } from 'node:path';` at line 19.
3. **Empty string falls back.** Use the truthiness test shown (an empty env var is
   effectively unset), matching pi's `||` behaviour.

`resolveDefaultReadRoot(source)` at lines 58–60 needs no change — it already falls back to
the claude default for unknown sources and is exported as a direct unit-test seam.

**Test extension 1** — `engine/test/usage-mine-main.test.js` (~1000 lines). The pi
read-root tests at ~lines 876–900 are the exact template; put the copilot ones beside them.
Note the file's existing helpers: `makeTmp(prefix)`, `makeFixture()`, `makeIo({ projectsRoot,
repoRoot })` (from `../test-helpers/capture-io.js`), and the env save/restore
`try { … } finally { if (previousEnv === undefined) delete … else … }` idiom — reuse it;
leaking an env var across tests is a cross-test-pollution bug.

**Test extension 2** — `engine/test/contract-equivalence.test.js` (227 lines). It loops
over every descriptor in `pipeline/default.yml` and already carries TWO paired blocks per
binding: an opencode pair at lines 143–183 and a pi pair at lines 185–226. Add a third,
copilot pair with the identical shape. The Copilot binding is agent-mode (it has real
subagents), so it takes the same agent-mode carve-outs as Claude and opencode: the block is
byte-identical to Claude's — an actual **zero-line diff** — and `assembleContract` has no
binding dimension, so a `binding: 'copilot'` hint must be IGNORED. **No `engine/src/contract.js`
change; no third variant set.** Existing constants to reuse, already in the file:
`diffLines(a, b)`, `AGENT_CARVE_OUT_FRAGMENTS`, `FRAGMENTS`, `DESCRIPTORS`.

### TDD steps

**RED 1** — "Given `COPILOT_OTEL_FILE_EXPORTER_PATH` is unset, when resolveDefaultReadRoot
runs for source copilot, then it resolves to the literal `~/.copilot/otel` path". Assert
`join(homedir(), '.copilot', 'otel')`. Expected failure: falls back to the claude projects
dir (no `copilot` entry yet).

**RED 2** — "Given `COPILOT_OTEL_FILE_EXPORTER_PATH` names a file, when
resolveDefaultReadRoot runs for source copilot, then it resolves to that file's containing
directory". Set the env to `/some/dir/otel.jsonl`; assert `/some/dir`.

**RED 3** — **the per-invocation pin**: "Given the read root is resolved, when the env var
changes and it is resolved again, then the second result reflects the new value". Two
`resolveDefaultReadRoot('copilot')` calls straddling an env mutation, asserting the results
differ. A module-load-frozen default passes call one and fails call two.

**RED 4** — "Given `COPILOT_OTEL_FILE_EXPORTER_PATH` set to the empty string, when
resolveDefaultReadRoot runs, then it falls back to the default root".

**RED 5** — "Given `--source copilot` with no `io.projectsRoot` override and the env naming
a temp OTel file, when main runs, then it mines the fixture directory and exits 0". Mirror
the pi analogue at ~line 891: create a temp dir, copy
`engine/test/fixtures/copilot/single-chat.jsonl` into it, point the env at a file path
INSIDE that dir, and assert `report.json` was written with the expected token totals.

**RED 6** — "Given `--source copilot`, when main runs, then it is accepted rather than
rejected as a config error" — asserts exit 0, complementing the existing unknown-source
tests.

**RED 7** — re-run the existing unknown-source test asserting `'claude|opencode'` adjacency.
It must still pass. If it does not, `SOURCES` was reordered — restore append-last order.

**PIN 8 (a confinement test, not a RED)** — `contract-equivalence.test.js`, inside the
descriptor loop: "Given a copilot binding hint on descriptor `<id>`, when assembled, then it
is ignored and the block equals plain agent-mode assembly". Assert
`diffLines(copilotHintedBlock, agentModeBlock).length === 0`. **State the framing honestly:
this is green on arrival**, because `assembleContract` has no binding dimension and the
Copilot block is byte-identical to Claude's — that zero-line diff IS the property being
asserted. Its value is regression confinement: the day someone keys a variant off a
binding, it trips. The file already carries two structurally identical pins for opencode
(lines 147–160) and pi (lines 189–202); this is the third, and it is required, not
optional. To satisfy yourself the assertion has teeth, temporarily make
`assembleContract` return a modified block for a `binding` hint, watch all three pins fail,
then revert — do not commit that experiment.

**PIN 9 (same framing)** — "Given descriptor `<id>`, when the copilot-binding carve-out set
is checked, then the agent-vs-inline diff is confined to the two known carve-out lines".
Assert `diffs.length === 2` and that every differing line matches one of
`AGENT_CARVE_OUT_FRAGMENTS`. Mirrors the opencode and pi confinement tests verbatim.

**GREEN** — apply the two `usage-mine-main.js` edits and the `dirname` import.

**REFACTOR** — none expected; both edits are single constant entries. Confirm the thunk is
a function and that no env read escaped to module scope.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-copilot-binding/engine && node --test test/usage-mine-main.test.js test/contract-equivalence.test.js test/copilot-telemetry.test.js
```

### Commit

```
feat(observability): wire copilot source and read root into usage-mine
```

---

## Part 8 — Port-doc binding sets, Copilot sections, PoC record and the missing opencode gate section

### Context

Docs-only part: **no `src/` delta**. The two test edits it carries are registry/allowlist
maintenance (living corpus, source hygiene), not new coverage — legitimately standalone.

**The binding sets are NOT uniform, and making them uniform would be a lie.** Verified
against this tree. Change exactly these, and nothing else:

| Port doc | Current line | After |
|---|---|---|
| `docs/adapters/execution.md` line 44 | `{ claude, pi, opencode }` | `{ claude, pi, opencode, copilot }` |
| `docs/adapters/model.md` line 36 | `{ claude, pi, opencode }` | `{ claude, pi, opencode, copilot }` |
| `docs/adapters/telemetry.md` line 34 | `{ claude, pi, opencode }` | `{ claude, pi, opencode, copilot }` |
| `docs/adapters/gate.md` line 31 | `{ claude, pi }` | `{ claude, pi, opencode, copilot }` |
| `docs/adapters/memory.md`, `vcs.md`, `policy.md` | `{ claude, pi }` | **UNCHANGED** — this change binds none of those ports |
| `docs/adapters/backlog.md`, `intention.md` | (no `Binding set` line at all) | **UNTOUCHED** |

**Sections to author.**

1. `docs/adapters/execution.md` — a `## Copilot binding` section after the existing
   `## opencode binding` (lines 88–111). Content: `spawn` dispatches a Copilot subagent via
   the `task` tool (`{ name, prompt, agent_type, description, model?, reasoning_effort?,
   context_tier?, mode: 'background'|'sync' }`), with `subagents.agents.<name>` carrying
   per-subagent `model`/`effortLevel`/`contextTier`; `list_agents`/`read_agent` are the
   discovery surface; `/fleet` enables parallel subagent execution. `runInline` is the
   primary agent in-session with the inline carve-outs. Native discoverable surface:
   `--plugin-dir <repo>/adapters/copilot` carrying `skills/` and `agents/`, with
   `copilot plugin install owner/repo:adapters/copilot` as the distribution path; the
   entrypoint is a `craft-run` skill, invoked via the `skill` tool or headlessly as
   `copilot -p "/craft-run <input>"`. Artifact-is-the-handoff and dead-worker-respawn hold
   unchanged.

2. `docs/adapters/model.md` — a `## Copilot binding` section after `## opencode binding`
   (lines 62–76). `select`: the tier maps via `adapters/copilot/src/model-tier-map.js`
   (`resolveCopilotModel`), with `--effort` as the tier's reasoning-effort companion
   (`resolveCopilotEffort`) and `--context` available for context tier; the frontmatter
   `model:`/`effort:` on `adapters/copilot/agents/craft-<role>.md` is the Copilot binding of
   the same tier string. State honestly that real model ids await the on-demand smoke and
   the map ships the `auto` sentinel, swappable without a code change. `isAvailable`: probe
   whether the tier-mapped model is reachable for the configured seat/BYOK provider.

3. `docs/adapters/telemetry.md` — a `## Copilot binding` section after `## Pi binding`
   (lines 73–100). Content: the binding reads the **OTel JSON-lines file exporter**
   (`COPILOT_OTEL_FILE_EXPORTER_PATH`), NOT `--output-format json` (whose result event
   carries no token counts) and NOT `session-store.db` (no token columns). Document the
   **structural discrimination** (span vs metric records) and the **single-tier selection
   rule** with its rationale: the same tokens appear on leaf `chat` spans, again summed on
   the parent `invoke_agent` span, and again in the token-usage metric, so only leaf `chat`
   spans are counted. `role` is `null` pending subagent attribution; cache token fields
   have no pinned equivalent and are `0`. Selected via `--source copilot`; the read root
   resolves the exporter env var to its containing directory.
   **This page declares `subjects: ['engine/src/observability/**']` in its frontmatter and
   Parts 6–7 land inside that scope — refreshing it is this change's own living-intention
   obligation, not optional.**

4. `docs/adapters/gate.md` — the biggest doc delta. Three things:
   - **State the listing criterion explicitly**: a binding is listed when it **ships a guard
     binding**, regardless of enforcement strength. Because the set no longer conveys
     strength, **each per-binding section must state its own enforcement profile.**
   - **Author the previously-absent `## opencode binding` section.** The file today has
     `## Claude binding` (line 33) and `## Pi binding` (line 53) and nothing for opencode,
     even though `adapters/opencode/plugins/git-guard.ts` ships. Document it: the plugin's
     `tool.execute.before(input, output)` hook composing
     `adapters/opencode/src/git-guard-adapter.js` (`commandFromToolEvent` reading
     `output.args.command` with an `input.args.command` defensive fallback) over
     `adapters/opencode/src/git-guard-predicate.js`; plus `opencode.json`'s
     `permission.external_directory: deny` as the containment mechanism. **No opencode
     source is touched — this is documentary only.**
   - **Author the `## Copilot binding` section with its honest three-layer profile**:

     | Layer | Mechanism | Enforcing? |
     |---|---|---|
     | Containment | native path verification; `--add-dir <worktree>` required, `--allow-all-paths` forbidden | **Yes** (live-proven: an out-of-tree `create` was blocked with no `--allow-all-paths`) |
     | Command policy | the `--deny-tool` pattern set from `adapters/copilot/src/deny-tool-args.js` | **Yes** (live-proven; denial rules take precedence even over `--allow-all-tools`) |
     | Audit | `preToolUse` hook → `adapters/copilot/src/git-guard-adapter.js` → the shared predicate | **No — observational** |

     **The carve-out must be written down, never papered over**: for this binding the
     ext-diff rule is advisory, because Copilot exposes no denying hook — a live probe
     showed `git push --force origin main` executing unimpeded under a firing-but-
     observational hook. The containment and destructive-git rules are enforced natively
     and are strictly stronger than an advisory hook. Never imply the audit layer enforces.

5. `docs/adapters/copilot-poc-record.md` — **new file**, mirroring
   `docs/adapters/pi-poc-record.md` (9.7K) and `docs/adapters/opencode-poc-record.md` (7.0K)
   in structure. Neither carries frontmatter; neither should this one. Required structure,
   following the sibling headings: an opening blockquote pair stating which seams are
   CI-proven by `adapters/copilot/test/` and that the live run is **not CI-gated**, naming
   `runAcceptanceProbe` from `adapters/copilot/src/probe.js` as the entry point; then the
   full **CONFIRMED** matrix (all 18 pinned rows, including the probe method: throwaway
   `mktemp -d` with isolated `HOME`/`XDG_CONFIG_HOME`/`COPILOT_HOME`, the background-
   watchdog cap because macOS has no `timeout`, and the BYOK
   `COPILOT_PROVIDER_BASE_URL` fake-SSE-provider enabler that drove real tool calls with
   zero credentials, zero credits and no network); then the **DEFERRED** matrix (D1–D7)
   with the reason each is deferred; then reproduction notes.

**Registry edits this part must pre-pay**

6. `test/living-corpus.test.js` — the new page is auto-discovered by
   `scripts/living-corpus.sh` (`find docs/adapters -maxdepth 1 -name '*.md'`), so the
   pinned `EXPECTED` set at lines 14–34 goes stale the moment the file lands. Add
   `'docs/adapters/copilot-poc-record.md'` between `'docs/adapters/backlog.md'` and
   `'docs/adapters/execution.md'` (the set assertion is order-independent; alphabetical
   placement keeps the source readable and matches the file's existing ordering).

7. `test/source-hygiene.test.js` — **two tripwires**, both verified against this tree:
   - **class-A** (`…|mutation|mutant|…`): `docs/adapters/**` is scanned. `pi-poc-record.md`
     needed an allowlist filter for exactly this. **Prefer avoidance**: write the PoC
     record's containment prose as "state-changing probes" / "writes confined to the
     throwaway", never "mutation"/"mutating". Only if a class-A word proves unavoidable,
     add a `/\/docs\/adapters\/copilot-poc-record\.md:/` filter in the existing commented
     style.
   - **class-B** (`\bgh\b|\bgithub\b`, **case-sensitive**): `GitHub` capitalised does NOT
     match — write prose that way throughout. Two lowercase literals are hazardous:
     `.github/hooks/*.json` (name it "the repo-level hooks directory" instead, and note it
     did not fire in the probe) and `github.copilot` (the OTel scope name). If the
     telemetry section needs the scope literal to be precise — it does — add ONE
     content-scoped filter naming the reviewed boundary, mirroring the Part 6 filter:
     ```js
     // docs/adapters/telemetry.md: the OTel instrumentation-scope name is the protocol
     // discriminator the copilot binding matches on — a vendor identifier documented at
     // the telemetry port, not a host-CLI reference.
     /\/docs\/adapters\/telemetry\.md:[0-9]+:.*github\.copilot/,
     ```
     Run `grep -rEn '\bgh\b|\bgithub\b' docs/adapters README.md` after writing to confirm
     zero un-allowlisted hits BEFORE committing.

8. `README.md` — the adapter listing at lines 84–85 enumerates
   `adapters/pi/` and `adapters/opencode/`. Add the `adapters/copilot/` bullet in the same
   voice (native Copilot binding: plugin `skills/`+`agents/`, `commands/`, `hooks/`, the
   three-layer guard). `README.md` is also inside the source-hygiene scanned set — keep
   `GitHub` capitalised there.

**Lints this part must satisfy** (all run by `ci.sh`): `docs-structure-lint.sh` (no dated
`-P<n>-`/`SC5-*`/`SPIKE.md` filename outside `docs/archive/` — the new filename is fine);
`intention-lint.js` over the living corpus (the new page carries no `subjects`, matching its
two PoC-record siblings — a `no-subjects` classification, not an error); `prose-lint.js` on
touched `.md` (`docs/adr/**`, `docs/design/**` and `docs/archive/**` are exempt;
`docs/adapters/**` is NOT). **Posture, verified on this branch**: `node engine/bin/hygiene-gate.js
.claude/workflow.md` exits non-zero, so `ci.sh`'s `|| echo advisory` degrades both hygiene
lints to **advisory** — their findings print but do not fail the build. Fix the findings
anyway by rewriting the prose; do not lean on the posture and do not add waiver markers. The
gates that genuinely block this part are `living-corpus`, `source-hygiene` and
`docs-structure-lint`.

### TDD steps

Docs-first, then the registry tests that mechanically pin them.

**RED 1** — write `docs/adapters/copilot-poc-record.md`, then run
`cd <root> && node --test test/living-corpus.test.js`. It goes RED:
`expected no duplicate emission` / set mismatch, because `living-corpus.sh` now discovers a
20th page the pinned set does not contain. **GREEN**: add the entry to `EXPECTED`.

**RED 2** — run `node --test test/source-hygiene.test.js` after the doc edits. Expect
class-A and/or class-B failures naming the exact offending lines. **GREEN**: rewrite the
prose to avoid the tokens where possible; add the minimum content-scoped filters where the
literal is load-bearing. Re-run and confirm zero offenders.

**RED 3** — `bash scripts/ci.sh`'s `run_intention_lint` and `run_prose_lint` over the
touched docs. Fix findings by rewriting prose; do not add waiver markers.

**Verification without a mechanical assertion** — state this plainly rather than implying
coverage that does not exist: the `Binding set` lines and the per-binding
enforcement-profile prose (the new **Copilot binding** section AND the previously-absent
**opencode binding** section) are prose the repo lints for structure, not content. Their
correctness rides on review against the three-layer table above. The *behaviour* those
sections describe IS covered — by `adapters/copilot/test/git-guard-adapter.test.js` and
`adapters/copilot/test/deny-tool-args.test.js` — only the *description* is unasserted.
Self-check before committing:
- every `Binding set` line matches the table in this Context block exactly;
- `memory.md`, `vcs.md`, `policy.md` are byte-unchanged (`git diff --no-ext-diff --stat`
  must not list them);
- `backlog.md` and `intention.md` are byte-unchanged;
- the Copilot gate section never claims the `preToolUse` hook enforces;
- the opencode gate section names `adapters/opencode/plugins/git-guard.ts` and touches no
  opencode source.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-copilot-binding && node --test test/living-corpus.test.js test/source-hygiene.test.js test/docs-structure-lint.test.js
bash /Users/scolladon/workspace/perso/craft-native-copilot-binding/scripts/ci.sh
```

### Commit

```
docs(adapters): copilot binding sections, poc record and gate opencode section
```
