# Plan — native OpenAI Codex CLI binding (fifth Execution-port binding)

> Source: design doc `docs/design/native-codex-binding.md` · ADRs `252–264`
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

- **Working directory**: `/Users/scolladon/workspace/perso/craft-native-codex-binding`
  (git worktree, branch `feat/native-codex-binding`). Work ONLY there. Absolute paths in
  every command.
- **Toolchain**: npm, nested package at `engine/`. Node's built-in runner only —
  `node:test` + `node:assert/strict`. No test framework dependency exists; do not add one.
- **House test style**: Given/When/Then titles, AAA body, a `sut` variable naming the unit
  under test. Every existing suite follows it; match it exactly.
- **Module style**: ESM (`"type": "module"`) everywhere under `adapters/` and `engine/src`.
  The files in `test/` at repo root are CommonJS (`'use strict'; require(...)`) — when a
  part edits one of those, keep CommonJS.
- **No provenance refs in source or test**: no `ADR-<n>`, `P<n>`, `Part <n>`,
  `backlog #<n>` in any `.js`/`.json`/`.toml`/`SKILL.md`/agent-md file this plan creates.
  Live suites grep for exactly `/\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i`
  (`adapters/pi/test/native-surface.test.js`, `adapters/opencode/test/agents.test.js`,
  and the codex `native-surface` suite this plan adds). Provenance belongs in `docs/` only.
  Note the trap: model ids like `gpt-5.6-sol` are safe, but a comment reading
  "part 2 of the patch" would trip `Part\s+\d+`.
- **No suppression directives** (`@ts-ignore`, `eslint-disable`, coverage-ignore, lint
  silencers). **No swallowed errors** — every deliberate `catch` this plan introduces
  (guard adapter fail-closed, telemetry line-skip) RETURNS a defined verdict or increments
  a skip count; none discards a failure silently.
- **`test/source-hygiene.test.js` is a live tripwire.** It greps `pipeline skills agents
  contracts templates engine/src docs/adapters docs/DOD.md docs/GUIDE-customizing.md
  README.md` for:
  - class-A: `stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise`
  - class-B: `\bgh\b|\bgithub\b` (**case-sensitive** — `GitHub` does NOT match)
  - class-C: a source basename matching `-(claude|anthropic|openai|gemini)\.(js|ts)$` must
    live under `adapters/<vendor>/`. **This is a real hazard for this change**: never name
    a file `telemetry-openai.js` or `guard-openai.js`. Every filename this plan creates is
    already clear of it — keep it that way.

  `engine/src` is scanned, so the new `engine/src/guards/` module and the codex telemetry
  adapter must carry no class-A/class-B token. `docs/adapters/**` is scanned, so the docs
  part must write "state-changing probe", never "mutation"; and write `GitHub` capitalised
  if it must appear at all (it should not need to).
- **No test in this plan spawns the real `codex` binary**, and **no part runs the `codex`
  binary at all**. Every seam is exercised through injected dependencies. `codex` IS
  installed on this machine; a shelling-out test costs minutes and real quota locally while
  passing vacuously in CI, which has no binary.
- **Before any `bash scripts/ci.sh` run**, prepend fast-failing stubs or `ci.sh` hangs for
  tens of minutes:
  ```
  mkdir -p /tmp/craft-codex-stubs
  for b in codex pi opencode copilot; do
    printf '#!/bin/sh\nexit 127\n' > /tmp/craft-codex-stubs/$b
    chmod +x /tmp/craft-codex-stubs/$b
  done
  export PATH="/tmp/craft-codex-stubs:$PATH"
  ```
- **`git diff` / `git show` must carry `--no-ext-diff`** — difftastic is the configured
  external diff and mangles scripted output. Run `git commit` as its own command.
- **Never commit on a red gate.** Each part lands as ONE atomic conventional commit after
  its gate is green.
- **Correction to the design doc — do not act on it.** `docs/design/native-codex-binding.md`
  §Context claims `test/living-corpus.test.js` is RED on this branch because
  `docs/adapters/codex-poc-record.md` is missing from the pinned `EXPECTED` set. **That is
  stale.** Commit `7c4136e` ("test: pin codex poc record in the living corpus set") already
  added it — `EXPECTED` line 24 carries it today and the suite passes 3/3. Requirement 6 is
  already satisfied. **Do not re-add the entry** (a duplicate would trip the
  "no duplicate emission" assertion). The living-corpus set only needs an edit again if a
  part creates a NEW `docs/adapters/*.md` page — no part in this plan does.

### Public-surface decision — settled once, here

- Every symbol exported from `adapters/codex/src/**` and `adapters/codex/hooks/**` is
  **internal to the binding**: no barrel, no re-export, no package `exports` map, no engine
  import of adapter code. The dependency runs one way only — **adapter → engine, never
  engine → adapter**.
- `engine/src/guards/tool-call-guard.js` exports `toolCallGuard` and `WRITE_TOOLS` as a
  **public engine surface** consumed across the adapter boundary by pi, copilot and codex.
  Its downstream surface gates are enumerated in Part 1 and pre-paid there.
- `engine/src/observability/adapters/codex/telemetry.js` exports `parseLines` as the
  **public** telemetry-port surface, consumed by exactly one caller
  (`engine/src/observability/usage-mine-main.js`). Its downstream gates are pre-paid in
  Part 9.
- This repo has **no** generated API report, **no** barrel file, and **no** exhaustiveness
  switch. The registries that DO exist and must be pre-paid, with the part that pays each:
  `scripts/ci.sh` (Part 2), `test/every-test-file-registers.test.js` (Part 2), `SOURCES` +
  `DEFAULT_READ_ROOTS` (Part 9), `README.md`'s adapter listing (Part 10),
  `engine/stryker.conf.json` mutate scope (Part 11).

### Pinned external contract the parts reproduce — do not re-derive, do not probe

Every row is authoritative, live-pinned against `codex-cli 0.144.6` and recorded in
`docs/adapters/codex-poc-record.md`.

| Fact | Value |
|---|---|
| Headless | `codex exec [PROMPT]`; one user message runs the WHOLE run to completion (many tool calls, many subagent spawns), then exits — one invocation walks all phases |
| Shell tool | **`exec_command`**, argument `cmd` is a **STRING** (an argv array is rejected: `invalid type: sequence, expected a string`) |
| Write tool | **`apply_patch`** — a `custom` **freeform Lark-grammar** tool. **NO structured path field.** Payload is raw patch text |
| Patch directives | `*** Begin Patch` / `*** Add File: <p>` / `*** Update File: <p>` / `*** Delete File: <p>` / `*** Move to: <p>` / `*** End Patch`; ONE patch may touch MANY files |
| Tool surface varies by model | `gpt-5.4`/`gpt-5.2` send `apply_patch`; an unknown id drops `apply_patch`+`tool_search` and adds `multi_agent_v1`; **`gpt-5.6-sol` sends no `tools` key at all** |
| **Guard keying** | Key off the **PreToolUse hook payload** — `tool_name` / `tool_input` — **NOT** the request body. The hook fires regardless of how the tool was delivered; it is the only surface present across all three model cases |
| PreToolUse CAN DENY | **Proven live.** A `command` handler exiting **code 2** with the reason on **stderr** blocks the call; the command never runs; the denial is fed back to the model as `function_call_output` |
| `hooks.json` schema | `{"description": …, "hooks": {"PreToolUse": [{"matcher": …, "hooks": [{"type":"command","command":"…"}]}]}}`. The `{description, hooks}` wrapper is **mandatory**; a flat Claude-style `{"PreToolUse":[…]}` is rejected: `unknown field 'PreToolUse', expected 'description' or 'hooks'` |
| `matcher` semantics | **UNPINNED.** Use the broadest value the schema accepts; filtering lives in the predicate, never in an unverified matcher |
| Hook trust | Automation needs `--dangerously-bypass-hook-trust`, which emits a visible warning item every run |
| Execpolicy `.rules` | Starlark. `prefix_rule(pattern=[…], decision="forbidden"｜"allow"｜"prompt", justification="…")`. Nested-list alternation works: `pattern=["git", ["push","clean"]]` |
| Execpolicy bypass | `git -C . push`, `git --git-dir=.git push`, `bash -lc 'git push'` all **NO MATCH** — token-prefix over argv, not adversarial |
| Malformed `.rules` at runtime | **Treat as FAIL-OPEN** (unresolved) |
| Sandbox | `-s/--sandbox <read-only｜workspace-write｜danger-full-access>`; `writable_roots`, `network_access`. **Per-mode blocking NOT measured — claim nothing** |
| Config home | **`CODEX_HOME`** (default `~/.codex`); TOML at `$CODEX_HOME/config.toml` |
| Sessions | `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl` |
| `--ephemeral` | Suppresses session-file persistence — **mutually exclusive with telemetry**. NEVER emit it |
| Token counts | `turn.completed.usage` = `{input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens}` — CONFIRMED **in-stream**; whether the persisted rollout file carries the same envelope is **DEFERRED** |
| Stream envelope | `thread.started` → `turn.started` → `item.completed` → `turn.completed` |
| Subagents | namespace `multi_agent_v1`: `spawn_agent`, `send_input`, `wait_agent`, `resume_agent`, `close_agent`. **4 slots "including you" → usable width 3** |
| Delegation constraint | Codex injects `Do not spawn sub-agents unless the user or applicable AGENTS.md/skill instructions explicitly ask…` — **the binding MUST explicitly ask** or fan-out silently degrades to sequential |
| Models | `gpt-5.6-sol` (frontier, priority 1), `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.2`. Reasoning: `low｜medium｜high｜xhigh｜max` (+`ultra` on sol/terra ONLY) |
| Unknown model id | Does NOT error — falls back with a warning **and changes which tools are registered**, potentially removing `multi_agent_v1` and silently collapsing fan-out |
| Plugin manifest | `{name, version, description, author, skills, hooks, mcpServers, apps, interface{…}}` — `skills`/`hooks`/`mcpServers`/`apps` all **path-valued**. Manifest **filename UNPINNED** |
| Plugin install | local file-backed marketplace, `"source": "local"`; `codex plugin marketplace add` then `codex plugin add` |
| Skills load location | `$CODEX_HOME/skills/<name>/SKILL.md` — the documented fallback route |
| CRAFT_ROOT levers | `CLAUDE_PLUGIN_ROOT`/`PLUGIN_ROOT` matched as strings in the binary, **never observed substituting** — do not build on them |

### Part order and why

Part 1 lifts the shared guard predicate into the engine — Parts 5 and 11 depend on its new
home, and pi/copilot must be repointed before any new importer appears. Part 2 registers the
suite so every later adapter part has a green home. Parts 3–7 build the binding bottom-up
(pure modules before their consumers). Parts 8–9 add telemetry and its front door. Part 10 is
docs-only. Part 11 is tooling-config-only and last, so a noisy mutation triage can never red a
feature part. The tree is green at every commit.

---

## Part 1 — Lift the guard predicate to `engine/src/guards/`

### Context

**Relocation, not a rewrite.** The predicate body is moved byte-for-byte; behaviour must be
identical for pi and copilot afterwards. No new branch, no renamed export, no signature change.

**Source of truth being moved**: `adapters/pi/src/gate.js` (63 lines). It exports:

```js
export const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);
export function toolCallGuard(event) → { block: boolean, reason?: string }
//   event: { tool: string, tool_input: object, working_dir: string }
```

plus module-private `BASH_TOOL = 'Bash'`, `COMPLIANT_MARKERS = ['--no-ext-diff','rtk proxy']`,
`GIT_DIFF_SHOW_RE`, `REASON_GIT_EXT_DIFF`, `guardBashCommand`, `guardWritePath`. The regex is
load-bearing and must survive verbatim:

```js
const GIT_DIFF_SHOW_RE =
  /(^|[;&|]\s*)git(\s+(-C\s+\S+|-c\s+\S+|--git-dir=\S+|--work-tree=\S+))*\s+(diff|show)(\s|$)/;
```

**Destination**: `engine/src/guards/tool-call-guard.js` — new directory, new file, same
content plus a header comment saying it is the binding-neutral predicate shared by every
guard binding. Delete `adapters/pi/src/gate.js` (use `git mv` so the move is legible in
history, then edit the import line inside it).

**Exact edits — this is the complete list, verified by `grep -rn "gate.js" adapters engine test scripts`:**

| File | Line | Current | After |
|---|---|---|---|
| `adapters/pi/src/tool-call-hook.js` | 3 | `import { toolCallGuard, WRITE_TOOLS } from './gate.js';` | `… from '../../../engine/src/guards/tool-call-guard.js';` |
| `adapters/copilot/src/git-guard-adapter.js` | 7 | `import { toolCallGuard, WRITE_TOOLS } from '../../pi/src/gate.js';` | `… from '../../../engine/src/guards/tool-call-guard.js';` |
| `adapters/pi/test/gate.test.js` | 3 | `import { toolCallGuard } from '../src/gate.js';` | moved file, see below |

**The predicate suite moves with the predicate.** `git mv adapters/pi/test/gate.test.js
engine/test/tool-call-guard.test.js` (322 lines, unchanged except its import line →
`'../src/guards/tool-call-guard.js'`). Two reasons: the code under test now lives in the
engine, and `engine/stryker.conf.json` already mutates `engine/src/**/*.js` with
`testFiles: ["engine/test/**/*.test.js"]` — so the move buys the security-critical predicate
executed mutation coverage for free, with zero config change. `adapters/pi/test/` still holds
12 other suites, so `run_suite adapters/pi` never enumerates zero files.

**`adapters/copilot/test/git-guard-predicate.test.js` has structural assertions pinned to the
OLD path and WILL go red — that is expected, and retargeting them is part of this part.** In
`describe('gate.js — single-sourced across bindings', …)`:

- line ~95: `existsSync(join(repoRoot, 'adapters', 'pi', 'src', 'gate.js'))` → assert
  `engine/src/guards/tool-call-guard.js` exists instead.
- line ~110: `assert.match(sut, /\.\.\/\.\.\/pi\/src\/gate\.js/)` → match the new engine path.
- line ~116: `existsSync(… 'adapters','copilot','src','gate.js') === false` — **keep**, and
  ADD a sibling asserting `adapters/pi/src/gate.js` no longer exists (so a future re-fork of
  the old home fails loudly).
- Rename the `describe` label to name the module, not the old filename.

**opencode is NOT repointed, and that is correct.** `adapters/opencode/src/git-guard-predicate.js`
exports a *narrower* `gitGuardPredicate(command)` with no event shape and no path-containment
branch — it never imported `gate.js`, so there is nothing to repoint. What it duplicates
verbatim is only the trio `COMPLIANT_MARKERS` / `GIT_DIFF_SHOW_RE` / `REASON_GIT_EXT_DIFF`,
and resolving that duplication is explicitly out of scope for this lift (a parked follow-up).
**Do not touch any opencode source or test in this part.**

**Downstream surface gates for the new public export** — all pre-paid here, none deferred:
no barrel/index to update (`engine/src` has none), no package `exports` map
(`engine/package.json` declares none), no generated API report, no exhaustiveness switch.
`engine/stryker.conf.json` needs **no** edit (the glob `engine/src/**/*.js` already covers the
new file). `scripts/ci.sh` needs no edit (both suites are inside already-registered dirs).
`test/every-test-file-registers.test.js` needs no edit (it enumerates `engine/test`
recursively). `adapters/pi/stryker.conf.json` needs **no** edit either — its
`mutate: ["adapters/pi/src/**/*.js"]` glob simply stops matching the moved file, and the
config is wired into nothing anyway; leave it exactly as it is. No doc under `docs/adapters/`
names `adapters/pi/src/gate.js` (verified by grep), so no doc edit is owed here — the
`BACKLOG.md` entry that does name it is handled in Part 10. The only surface that changes is
the import path, and all three importers are in the table above.

### TDD steps

**RED 1** — `git mv adapters/pi/src/gate.js engine/src/guards/tool-call-guard.js` and
`git mv adapters/pi/test/gate.test.js engine/test/tool-call-guard.test.js`. Run
`cd <wt>/engine && node --test 'test/**/*.test.js' 2>&1 | tail -30`. Expected failure:
`Cannot find module '../src/gate.js'` — the moved suite still imports the old relative path.

**RED 2** — run `cd <wt>/adapters/pi && node --test 'test/**/*.test.js' 2>&1 | tail -30`.
Expected failure: `Cannot find module './gate.js'` from `src/tool-call-hook.js`.

**RED 3** — run `cd <wt>/adapters/copilot && node --test 'test/**/*.test.js' 2>&1 | tail -30`.
Expected TWO distinct failures: a module-resolution error from `src/git-guard-adapter.js`,
and — once that import is fixed — the three structural assertions in
`describe('gate.js — single-sourced across bindings')` failing on the stale paths.

**GREEN** — apply the three import edits and the four assertion retargets from the tables
above. Nothing else.

**RED 4 (new coverage, and the only new test in this part)** — in
`engine/test/tool-call-guard.test.js` add: "Given the repo tree, when the lifted predicate's
old adapter home is checked, then `adapters/pi/src/gate.js` no longer exists". Expected
failure only if the delete was missed. This is the regression that stops a future agent from
re-creating the fork.

**REFACTOR** — none. A relocation that also refactors is no longer reviewable as a
relocation. Resist. If the moved file needs a comment, limit it to the one-line header
naming its new neutral role.

**Behaviour-identity check before committing** (not a new test — a verification step):
`git diff --no-ext-diff -M --stat HEAD` must show the two moves as renames with a 1-line
content delta each, and no other `.js` file may show more than an import-line change.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-codex-binding/engine && node --test 'test/**/*.test.js' 2>&1 | tail -30
cd /Users/scolladon/workspace/perso/craft-native-codex-binding/adapters/pi && node --test 'test/**/*.test.js' 2>&1 | tail -20
cd /Users/scolladon/workspace/perso/craft-native-codex-binding/adapters/copilot && node --test 'test/**/*.test.js' 2>&1 | tail -20
cd /Users/scolladon/workspace/perso/craft-native-codex-binding && node --test 'test/*.test.js' 2>&1 | tail -20
```

### Commit

```
refactor(guards): lift the binding-neutral tool-call guard into the engine
```

---

## Part 2 — Codex adapter skeleton: CRAFT_ROOT, model tier map, registered suite

### Context

Creates `adapters/codex/` and makes its suite a first-class CI citizen. **The two registry
edits MUST land in this same commit**: `scripts/ci.sh`'s `run_suite` treats a zero-file
enumeration as a hard error, so registering the dir before it holds test files breaks CI, and
registering it after leaves a suite that never runs.

**Files to create:**

`adapters/codex/package.json` — copy the copilot shape exactly:
```json
{ "name": "@craft/adapter-codex", "type": "module", "private": true,
  "scripts": { "test": "node --test 'test/**/*.test.js'" } }
```

`adapters/codex/src/craft-root.js` — port `adapters/copilot/src/craft-root.js` (77 lines)
verbatim, changing only the header comment's binding name. Signature:
```js
export function resolveCraftRoot(moduleUrl, fsOps = { existsSync, realpathSync }) → string
```
It up-walks `const UP_LEVELS_TO_REPO_ROOT = ['..','..','..']`, asserts the root exists AND
contains `engine/bin`, then returns `fsOps.realpathSync(root)`. **The depth is three because
callers sit at `adapters/codex/src/*.js` and `adapters/codex/hooks/*.js` — both exactly three
levels below the repo root.** Assert it from the real file location; never assume it.
Three throw paths, each with its own message: non-`file://` moduleUrl, non-existent root,
missing `engine/bin`.

`adapters/codex/src/model-tier-map.js` — mirror `adapters/copilot/src/model-tier-map.js`
(62 lines) structurally: a private `resolveTierValue(tier, defaults, overrides, label)` using
`Object.hasOwn` for BOTH lookups, overrides beating defaults, and an unknown tier
**throwing** `` `${label}: unknown tier "${tier}" has no override and no default` ``.
The committed maps, both `Object.freeze`d:
```js
export const DEFAULT_TIER_MODELS  = { opus: 'gpt-5.6-sol', sonnet: 'gpt-5.6-terra', haiku: 'gpt-5.4-mini' };
export const DEFAULT_TIER_EFFORTS = { opus: 'high',        sonnet: 'medium',        haiku: 'low' };
export function resolveCodexModel(tier, overrides = {}) → string
export function resolveCodexEffort(tier, overrides = {}) → string
```
**Why fail-loud matters more here than for copilot**: an unknown Codex model id does not
error — it falls back with a warning and *changes which tools are registered*, potentially
removing `multi_agent_v1` and silently collapsing fan-out to sequential. A typo is a topology
bug that presents as "the run was just slower".
**`ultra` must never appear in `DEFAULT_TIER_EFFORTS`** — it exists only on `sol`/`terra`, and
a tier whose model can be overridden to another id would then carry an invalid effort.

**Registry edits (same commit):**

1. `scripts/ci.sh` — after line 54 (`run_suite adapters/copilot adapters/copilot/test adapters/copilot`)
   add `run_suite adapters/codex adapters/codex/test adapters/codex`. Keep it BEFORE
   `run_suite process test`.
2. `test/every-test-file-registers.test.js` — this file is **CommonJS**; keep it that way.
   In `SUITE_DIRS` (lines 10–16) add, after the copilot entry:
   `{ label: 'adapters/codex', dir: path.join(ROOT, 'adapters', 'codex', 'test') },`

**Test files to create** (all must exist before ci.sh is run, or `run_suite` hard-errors):
`adapters/codex/test/craft-root.test.js`, `adapters/codex/test/model-tier-map.test.js`, and
`adapters/codex/test/registration.test.js`. Mirror `adapters/copilot/test/craft-root.test.js`
and `.../model-tier-map.test.js` for the first two.

`registration.test.js` is the explicit home for the "am I actually wired into CI?" assertions,
which belong to neither of the other two files. It reads `scripts/ci.sh` and
`test/every-test-file-registers.test.js` as **text** and asserts each names this suite — the
established pattern (see `test/hygiene-gates-ci.test.js`, which reads `ci.sh` the same way).
This matters because a missing `run_suite` line is **silent**: the suite simply never runs in
CI and every later part passes locally while proving nothing.

### TDD steps

**RED 1** — "Given a codex adapter src module URL, when resolveCraftRoot runs, then it
returns a root containing `engine/bin`". Assert from `import.meta.url` of the TEST file
adjusted to the src depth, and assert the returned path equals the realpath'd worktree root.
Expected failure: module not found.

**RED 2** — "Given a moduleUrl that is not a `file://` URL, when resolveCraftRoot runs, then
it throws naming the unresolvable moduleUrl". Pass `'https://example.test/x.js'`.

**RED 3** — "Given an injected fsOps whose existsSync reports the computed root absent, when
resolveCraftRoot runs, then it throws naming the computed root".

**RED 4** — "Given an injected fsOps where the root exists but `engine/bin` does not, when
resolveCraftRoot runs, then it throws naming the wrong up-walk depth". Inject an `existsSync`
returning `true` for the root and `false` for the `engine/bin` join.

**RED 5** — "Given the up-walk depth, when a real `adapters/codex/src` module resolves, then
the result is the repo root and NOT one level off". Assert `existsSync(join(result,'engine','bin'))`
AND `existsSync(join(result,'adapters','codex'))` — the second catches an over-deep walk that
the first alone would miss.

**RED 6** — "Given tier `opus`, when resolveCodexModel runs, then it returns `gpt-5.6-sol`".
Then `sonnet` → `gpt-5.6-terra`, `haiku` → `gpt-5.4-mini`. Three cases.

**RED 7** — "Given tier `opus` and an explicit override, when resolveCodexModel runs, then
the override wins over the committed default".

**RED 8** — "Given an unknown tier with no override, when resolveCodexModel runs, then it
throws naming the tier". Same for `resolveCodexEffort`.

**RED 9** — **prototype-pollution pin**: "Given tier `__proto__`, when resolveCodexModel runs,
then it throws rather than resolving an inherited member". Repeat for `'constructor'` and
`'toString'`. Three cases per resolver.

**RED 10** — "Given the committed effort map, when every value is inspected, then none is
`ultra`". Assert `Object.values(DEFAULT_TIER_EFFORTS).every(e => e !== 'ultra')`.

**RED 11** — "Given every committed effort value, when checked against the pinned reasoning
scale, then each is one of `low｜medium｜high｜xhigh｜max`".

**RED 12** — "Given DEFAULT_TIER_MODELS, when a caller attempts to mutate it, then the value
is unchanged" (`Object.isFrozen`). Same for efforts.

**RED 13** (`registration.test.js`) — "Given `scripts/ci.sh`, when read, then it registers the
codex adapter suite". Assert the text contains `run_suite adapters/codex`. Expected failure
until the ci.sh edit lands.

**RED 14** (`registration.test.js`) — "Given `test/every-test-file-registers.test.js`, when
read, then its suite list names the codex test directory". Assert the text contains
`'adapters', 'codex', 'test'`. Both registries are load-bearing and both fail silently if
missed, so each gets its own case.

**GREEN** — write `package.json`, `craft-root.js`, `model-tier-map.js`, and apply both
registry edits.

**REFACTOR** — extract the repeated "assert throws naming X" test helper only if it removes
real duplication; do not over-abstract a 3-case loop.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-codex-binding/adapters/codex && node --test 'test/**/*.test.js' 2>&1 | tail -30
cd /Users/scolladon/workspace/perso/craft-native-codex-binding && node --test 'test/*.test.js' 2>&1 | tail -20
export PATH="/tmp/craft-codex-stubs:$PATH" && cd /Users/scolladon/workspace/perso/craft-native-codex-binding && bash scripts/ci.sh 2>&1 | tail -30
```

### Commit

```
feat(codex): adapter skeleton with craft-root resolver and model tier map
```

---

## Part 3 — `apply_patch` patch-text path extraction

### Context

**The highest-risk unit in this change, and the reason it gets its own part.** Codex's write
tool `apply_patch` is a **freeform Lark-grammar tool with NO structured path field**. The
paths live inside the raw patch text, and **one patch may carry many hunks touching many
files**. Checking only the first filename reproduces the known decoy hazard in a new shape:
an in-tree leading hunk masking an out-of-tree later one.

**File to create**: `adapters/codex/src/apply-patch-paths.js`. Pure, no I/O, no `node:fs`.

```js
export const PATCH_PATH_DIRECTIVES = Object.freeze([
  '*** Add File:', '*** Update File:', '*** Delete File:', '*** Move to:',
]);
/**
 * Extract EVERY filename a patch body touches.
 * @param {string} patchText
 * @returns {string[]} — every path named by any directive, in document order
 */
export function extractPatchPaths(patchText) → string[]
```

**Extraction rules, each load-bearing:**

- Scan **every line**, not just the first match. `String.prototype.matchAll` or a per-line
  loop — never `String.prototype.match` without `/g`, and never `.find()`.
- A directive line is one whose trimmed-left form **starts with** one of the four directive
  prefixes. The path is the remainder after the prefix, `.trim()`ed.
- `*** Move to:` names the **destination**. Both the `*** Update File:` source line and the
  `*** Move to:` destination line appear in a rename hunk, and **both must be extracted** —
  a rename whose destination escapes the worktree is exactly as dangerous as a write that does.
- **Over-extraction is safe; under-extraction is the hazard.** If a patch *content* line
  happens to look like a directive, extracting it too only adds a path to the check set,
  which can only make the guard stricter. Do NOT add cleverness to suppress those — a
  suppression rule is a bypass primitive. Write this reasoning as a `why` comment.
- An empty path after a directive prefix (`*** Add File:` with nothing after it) is extracted
  as the empty string, **not** silently dropped — the consumer in Part 5 treats an empty path
  as fail-closed, and dropping it here would convert that into a pass.
- A non-string / null / undefined `patchText` returns `[]`. It never throws. The **consumer**
  turns "zero paths from a non-empty patch" into a block; that policy lives in Part 5, not
  here, so this module stays a pure extractor with one job.

**No containment logic in this module.** Resolution against the working dir is
`guardWritePath`'s job inside `engine/src/guards/tool-call-guard.js` (Part 1), reached through
the event adapter in Part 5. Keeping extraction and containment in separate units is what
makes the multi-path fan-out testable.

**Consumer lands in Part 5** — `adapters/codex/src/git-guard-adapter.js` calls
`extractPatchPaths` and runs the shared predicate once per extracted path. This module is not
dead code; Part 5's context restates the wiring.

**Test file**: `adapters/codex/test/apply-patch-paths.test.js`.

**Fixture patches to define at the top of the suite** (shared across cases, as string
constants — no external fixture files needed):

```
SINGLE_ADD          — Begin/Add File: src/a.js/End
MULTI_HUNK_ALL_IN   — Update File: src/a.js  +  Add File: src/b.js
MULTI_HUNK_DECOY    — Update File: src/a.js  +  Add File: ../../../etc/evil
RENAME              — Update File: src/a.js  +  Move to: src/b.js
RENAME_ESCAPE       — Update File: src/a.js  +  Move to: ../../outside.js
DELETE_ESCAPE       — Delete File: /etc/passwd
EMPTY_PATH          — "*** Add File:" with nothing after the colon
NO_DIRECTIVE        — a Begin/End envelope with no path directive at all
```

### TDD steps

**RED 1** — "Given a single-hunk add patch, when extractPatchPaths runs, then it returns the
one named path". Expected failure: module not found.

**RED 2** — **the decoy test, and the reason this part exists**: "Given a two-hunk patch whose
first hunk is in-tree and whose second names an out-of-tree path, when extractPatchPaths runs,
then BOTH paths are returned". Assert `result.length === 2` and that the out-of-tree path is
present. A `.find()`-shaped implementation passes RED 1 and fails here — that is the point.

**RED 3** — "Given a rename patch, when extractPatchPaths runs, then both the source and the
`*** Move to:` destination are returned".

**RED 4** — "Given a rename patch whose destination escapes the tree, when extractPatchPaths
runs, then the escaping destination is among the returned paths".

**RED 5** — "Given a delete-only patch naming an absolute path, when extractPatchPaths runs,
then that path is returned". Covers `*** Delete File:`.

**RED 6** — "Given a patch whose directive carries no path, when extractPatchPaths runs, then
an empty string is returned in that position rather than the entry being dropped". Assert
`result.includes('')` and `result.length === 1`.

**RED 7** — "Given a patch envelope with no path directive at all, when extractPatchPaths
runs, then an empty array is returned".

**RED 8** — "Given a patch with many hunks, when extractPatchPaths runs, then every path is
returned in document order". Use a five-hunk fixture mixing all four directives; assert the
exact array, not just the length.

**RED 9** — "Given a non-string input, when extractPatchPaths runs, then it returns an empty
array without throwing". Cases: `null`, `undefined`, `42`, `{}`.

**RED 10** — "Given directive text with irregular surrounding whitespace, when
extractPatchPaths runs, then the path is returned trimmed". A leading-space directive line and
a trailing-space path.

**RED 11** — "Given PATCH_PATH_DIRECTIVES, when a caller attempts to mutate it, then the value
is unchanged" (`Object.isFrozen`).

**GREEN** — write the extractor. Per-line loop with an early `continue` for non-directive
lines; no nesting beyond one level.

**REFACTOR** — extract a `directivePrefixOf(line)` returning the matched prefix or `null`, so
the main loop reads as a two-line early-return. Keep the `why` comment about over-extraction
being the safe direction — it is the one comment a future reader most needs.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-codex-binding/adapters/codex && node --test 'test/**/*.test.js' 2>&1 | tail -30
```

### Commit

```
feat(codex): extract every path a freeform apply_patch body touches
```

---

## Part 4 — PreToolUse event adapter over the shared predicate

### Context

Reshapes a Codex **PreToolUse hook payload** into the event shape
`engine/src/guards/tool-call-guard.js` expects, then applies that predicate unmodified.
**Key off the hook payload (`tool_name` / `tool_input`), NEVER the request body** — the tool
surface varies by model (`gpt-5.6-sol` sends no `tools` key at all), and the hook payload is
the only surface present across every model case.

**File to create**: `adapters/codex/src/git-guard-adapter.js`.

```js
import { toolCallGuard, WRITE_TOOLS } from '../../../engine/src/guards/tool-call-guard.js';
import { extractPatchPaths } from './apply-patch-paths.js';

export function adaptCodexEvent(payload) → { tool, tool_input, working_dir }  // may THROW
export function decideGuard(payload, guard = toolCallGuard) → { block, reason? }  // NEVER throws
```

**Tool-name map — map ONLY the names the shared predicate branches on.** The predicate
branches on `'Bash'` and on `WRITE_TOOLS = {Write, Edit, NotebookEdit}`. Codex's pinned names:

```js
const CODEX_TOOL_NAMES = Object.freeze(
  Object.assign(Object.create(null), { exec_command: 'Bash', apply_patch: 'Write' }),
);
```
Null-prototype and frozen, exactly as copilot's map is, so a tool named `constructor` or
`__proto__` falls through to the raw name instead of resolving an inherited member.
**No inert entries** — `write_stdin`, `update_plan`, `view_image`, `web_search`, `tool_search`,
`request_user_input`, the `multi_agent_v1` verbs and the goal verbs get NO entry; they pass
through unchanged and hit the predicate's `{ block: false }` tail.

**Field bridging — the two disciplines, both non-negotiable:**

1. **`exec_command` carries `cmd` as a STRING.** The predicate reads `tool_input.command`.
   Bridge `cmd` → `command` **unconditionally**: `{ ...toolInput, command: cmd }`. Never
   `command ?? cmd` — an inspected decoy `command` must never mask the `cmd` the tool
   actually executes. If `cmd` is absent or not a non-empty string on an `exec_command`
   payload, **throw** so `decideGuard` converts it to a fail-CLOSED `{ block: true }`.
   Codex rejects an argv array for `cmd` (`invalid type: sequence, expected a string`), so a
   non-string `cmd` is a malformed payload, not an alternate encoding — fail closed.
2. **`apply_patch` has no path field at all.** Its payload is raw patch text. The field name
   holding that text is **UNPINNED**, so resolve it defensively, in this order, taking the
   first non-empty string found: `tool_input` itself when it is a string; else
   `tool_input.input`; else `tool_input.patch`; else `tool_input.text`. **If none yields a
   non-empty string, throw** → fail closed. Write the unpinned-field reasoning as a `why`
   comment; do not silently pass an unrecognised shape.

**Multi-path containment — the shape that makes the decoy test meaningful:**

`toolCallGuard` checks ONE `file_path` per call. `apply_patch` may name many. So
`decideGuard` runs the guard **once per extracted path** and returns the FIRST blocking
verdict; only if every path passes does it return `{ block: false }`. Zero extracted paths
from a non-empty patch is a **block** — an unparsed patch must never pass.

```js
// sketch — the loop is the containment, not the predicate.
// WRITE_TOOLS gates the loop, so the imported set is load-bearing, never a dead import:
// only a tool the shared predicate treats as a write gets its paths fanned out.
if (WRITE_TOOLS.has(tool)) {
  for (const p of paths) {
    const verdict = guard({ tool, tool_input: { ...base, file_path: p }, working_dir });
    if (verdict.block) return verdict;
  }
  return { block: false };
}
```

**`decideGuard` never throws.** Wrap `adaptCodexEvent` + the guard loop in one `try`; the
`catch` **returns** `{ block: true }` (a defined fail-closed verdict — not a swallowed error).
Unlike copilot's observer, this verdict is genuinely enforcing: `{ block: true }` here stops a
real call in Part 5. Say so in the module header so nobody "simplifies" it to `{ block: false }`.

**Working dir**: the payload field is `cwd`. An absent/empty `cwd` throws → fail closed;
`guardWritePath` coerces a missing dir into `resolve('')` = `process.cwd()`, which would
silently contain against the wrong root.

**Test file**: `adapters/codex/test/git-guard-adapter.test.js`.
**Also create** `adapters/codex/test/git-guard-predicate.test.js`, mirroring
`adapters/copilot/test/git-guard-predicate.test.js` (the reuse proof): the ext-diff regex
cases driven through `decideGuard`, the write-containment cases, plus the structural
assertions that `engine/src/guards/tool-call-guard.js` exists, that
`adapters/codex/src/git-guard-adapter.js` **imports** it (regex over the source text), and
that `adapters/codex/src/gate.js` does **not** exist (no forked copy).

Payload helpers for the suite:
```js
const WORKING_DIR = '/repo';
const execPayload  = (cmd)   => ({ cwd: WORKING_DIR, tool_name: 'exec_command', tool_input: { cmd } });
const patchPayload = (text)  => ({ cwd: WORKING_DIR, tool_name: 'apply_patch',  tool_input: { input: text } });
```

### TDD steps

**RED 1** — "Given an `exec_command` payload whose `cmd` is `git diff`, when decideGuard runs,
then it blocks with the ext-diff reason". Expected failure: module not found.

**RED 2** — "Given an `exec_command` payload whose `cmd` carries `--no-ext-diff`, when
decideGuard runs, then it does not block". Then `rtk proxy` as a second compliant marker.

**RED 3** — **the string-not-argv pin**: "Given an `exec_command` payload whose `cmd` is an
argv array, when decideGuard runs, then it blocks (fail-closed)". Codex itself rejects an
array; a guard that quietly `join(' ')`ed it would invent a shape the binary never sends.

**RED 4** — **the decoy test for shell**: "Given an `exec_command` payload carrying both a
compliant `command` decoy and a non-compliant executed `cmd`, when decideGuard runs, then it
blocks". Payload `tool_input: { command: 'git diff --no-ext-diff', cmd: 'git diff' }`.
An `command ?? cmd` implementation passes RED 1 and fails here.

**RED 5** — "Given an `apply_patch` payload whose single hunk writes inside the working dir,
when decideGuard runs, then it does not block".

**RED 6** — **the multi-hunk decoy test, the headline of this part**: "Given an `apply_patch`
payload whose first hunk is in-tree and whose second escapes the working dir, when decideGuard
runs, then it blocks". A first-path-only implementation passes RED 5 and fails here.

**RED 7** — "Given an `apply_patch` payload whose `*** Move to:` destination escapes the
working dir, when decideGuard runs, then it blocks".

**RED 8** — "Given an `apply_patch` payload naming an absolute out-of-tree delete, when
decideGuard runs, then it blocks".

**RED 9** — "Given an `apply_patch` payload whose patch body names no path at all, when
decideGuard runs, then it blocks (fail-closed)".

**RED 10** — "Given an `apply_patch` payload whose patch text is absent from every candidate
field, when decideGuard runs, then it blocks (fail-closed)". `tool_input: {}`.

**RED 11** — "Given an `apply_patch` payload whose `tool_input` is itself the raw patch
string, when decideGuard runs, then the patch is parsed and containment applies". Pins the
first branch of the defensive field resolution.

**RED 12** — "Given a payload whose `cwd` is missing, when decideGuard runs, then it blocks".
Same for `cwd: ''`.

**RED 13** — "Given an unmapped tool name, when decideGuard runs, then it does not block".
Use `web_search` and `update_plan`. Pins the pass-through tail.

**RED 14** — **prototype pin**: "Given a tool name of `__proto__`, when decideGuard runs, then
it falls through to the raw name rather than resolving an inherited member". Repeat for
`constructor`. Assert the verdict is `{ block: false }` and that nothing throws.

**RED 15** — "Given a structurally hostile payload, when decideGuard runs, then it returns a
blocking verdict rather than throwing". Cases: `null`, `undefined`, `{}`, `{ tool_name: 42 }`.
Assert with `assert.doesNotThrow` plus the verdict.

**RED 16** — "Given an injected guard that throws, when decideGuard runs, then it returns
`{ block: true }`". Proves the fail-closed catch is reached, not just the adapt path.

**RED 17** — "Given a path containing `..` that normalises back inside the working dir, when
decideGuard runs, then it does not block". `src/../src/a.js`. Pins that containment is
resolution-based, not string-prefix-based.

**RED 18** (in `git-guard-predicate.test.js`) — "Given the codex adapter source text, when
scanned, then it imports the engine guards module"; "Given the repo tree, when checked, then
`adapters/codex/src/gate.js` does not exist".

**GREEN** — write the adapter.

**REFACTOR** — extract `resolvePatchText(toolInput)` and `bridgeExecutedCommand(toolInput)` as
named early-return helpers; the exported `adaptCodexEvent` should read as three lines. Keep
the `why` comments on unconditional bridging and the unpinned patch field.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-codex-binding/adapters/codex && node --test 'test/**/*.test.js' 2>&1 | tail -40
```

### Commit

```
feat(codex): PreToolUse event adapter with multi-path patch containment
```

---

## Part 5 — Enforcing PreToolUse hook and `hooks.json`

### Context

**This part is what makes the binding's guard real rather than recorded.** Codex's PreToolUse
hook genuinely denies — live-proven: a `command` handler exiting **code 2** with the reason on
**stderr** blocks the call, the command never runs, and the denial is fed back to the model as
`function_call_output`. This is the exact inverse of `adapters/copilot/hooks/craft-observer.js`,
whose always-exit-0 is deliberate because copilot's hook *cannot* deny. **Read that file for
the stdin/CRAFT_ROOT shape, then invert the exit policy** — and say so in the module header so
a future reader does not "fix" the exit code in either direction.

**File to create**: `adapters/codex/hooks/craft-guard.js`.

Behaviour contract:
- Read the full PreToolUse payload from stdin (`process.stdin`, utf8, accumulate to `end`) —
  same reader shape as the copilot observer.
- `process.env.CRAFT_ROOT = resolveCraftRoot(import.meta.url)` **inside** the try, not at
  module top level. `resolveCraftRoot` has three throw paths, and a top-level throw would
  crash before any verdict is produced.
- `JSON.parse` the payload, call `decideGuard(payload)` from `../src/git-guard-adapter.js`.
- **Block** → write `craft-guard: <reason>` to **stderr** and `process.exit(2)`.
  When the verdict carries no `reason` (the fail-closed path), write a fixed
  `craft-guard: denied (fail-closed)` string — a denial with a blank reason is
  indistinguishable from a crash in the Codex log.
- **Pass** → `process.exit(0)`, writing nothing to stdout. **Never write to stdout**: the JSON
  `hookSpecificOutput` form is a CONFIRMED schema but a DEFERRED path (the exit-2 route is the
  proven one), and stray stdout could be parsed as a permission response.
- **Any throw anywhere** → stderr reason + `process.exit(2)`. A guard that cannot decide must
  deny. This is the single most important inversion vs. the copilot observer, whose `finally`
  block exits 0 unconditionally. Do **not** copy that `finally`.

**File to create**: `adapters/codex/hooks.json`. The `{description, hooks}` wrapper is
**MANDATORY** — a flat Claude-style `{"PreToolUse":[…]}` is rejected with
`unknown field 'PreToolUse', expected 'description' or 'hooks'`.

```json
{
  "description": "craft guard — denies git diff/show without --no-ext-diff and writes outside the working directory",
  "hooks": {
    "PreToolUse": [
      { "matcher": "*",
        "hooks": [ { "type": "command", "command": "node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js" } ] }
    ]
  }
}
```
**`matcher` semantics are UNPINNED** — what it matches against (tool name, pattern, namespace)
was never varied in the denial probe. Use the **broadest** value the schema accepts so
filtering stays in the predicate, where it is tested, rather than in an unverified matcher
that could silently narrow enforcement. Record that reasoning as the `description` context in
the README (Part 7), not as a JSON comment (JSON has none).
**Use the `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` shim as the textual form** — the adapter's
hygiene check forbids a *bare* `${CLAUDE_PLUGIN_ROOT}`, and the shim keeps that check
carve-out-free.

**Testing an exit code without spawning `codex`**: spawn `node` on the hook script with
`node:child_process.spawnSync`, feeding the payload on stdin. That runs OUR script, never the
Codex binary — permitted and necessary. Use `process.execPath` as the node binary so the test
never depends on `PATH`.

**Test file**: `adapters/codex/test/craft-guard-hook.test.js`.
```js
const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'craft-guard.js');
const run = (payload) => spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });
```

**Test file**: `adapters/codex/test/config.test.js` — asserts the `hooks.json` shape. (Part 7
extends this same file with `config.template.toml` assertions; create it here.)

### TDD steps

**RED 1** — **the test that distinguishes a real guard from a recorded verdict**: "Given a
payload whose `exec_command` runs `git diff`, when the hook process runs, then it exits with
code 2". Expected failure: hook file not found (`status` 1, `MODULE_NOT_FOUND` on stderr).

**RED 2** — "Given a blocking payload, when the hook process runs, then the block reason
appears on stderr". Assert `result.stderr` contains `--no-ext-diff` and that
`result.stdout` is empty.

**RED 3** — "Given a compliant payload, when the hook process runs, then it exits 0 and writes
nothing to stdout".

**RED 4** — "Given a payload that is not valid JSON, when the hook process runs, then it exits
2". Feed `'{not json'`. **This is the inversion pin** — the copilot observer exits 0 here.

**RED 5** — "Given an `apply_patch` payload whose second hunk escapes the working dir, when the
hook process runs, then it exits 2". End-to-end proof that Part 3 + Part 4 reach the exit code.

**RED 6** — "Given empty stdin, when the hook process runs, then it exits 2".

**RED 7** — "Given a blocking verdict carrying no reason, when the hook process runs, then
stderr still carries a non-empty denial line". Drive it with a payload that fails closed
(`tool_name: 'apply_patch', tool_input: {}`) and assert stderr is non-empty and mentions
`craft-guard`.

**RED 8** (`config.test.js`) — "Given `hooks.json`, when parsed, then it carries the mandatory
`description` and `hooks` top-level keys and no top-level `PreToolUse` key". Assert
`Object.keys(parsed).sort()` deep-equals `['description','hooks']` — an extra top-level key is
what Codex rejects, so assert the exact key set, not just presence.

**RED 9** — "Given `hooks.json`, when the PreToolUse entry is read, then its handler is
`type: "command"` and its command names `adapters/codex/hooks/craft-guard.js`".

**RED 10** — "Given `hooks.json`, when its command template is scanned, then it uses the
`${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` shim and contains no bare `${CLAUDE_PLUGIN_ROOT}`".
Assert the shim substring is present AND that removing every shim occurrence leaves no
`${CLAUDE_PLUGIN_ROOT}` behind.

**RED 11** — "Given the hook source text, when scanned, then it contains no `finally` block".
The copilot observer's `finally { process.exit(0); }` is the exact copy-paste that would
silently disarm this binding, and a `finally` is the only way an exit-0 can preempt the
deny path. Asserting the absence of the construct is crisper than pattern-matching the exit
call, and it matches the REFACTOR step below (every path ends in a named terminal helper, no
`finally`). RED 4 is the behavioural primary; this is the structural tripwire.

**GREEN** — write `craft-guard.js` and `hooks.json`.

**REFACTOR** — extract `denyWith(reason)` and `allow()` as the two terminal helpers so every
path ends in one named call; no `finally`.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-codex-binding/adapters/codex && node --test 'test/**/*.test.js' 2>&1 | tail -40
```

### Commit

```
feat(codex): enforcing PreToolUse guard hook that denies via exit code 2
```

---

## Part 6 — Launch-args posture and generated execpolicy rules

### Context

Two posture modules, both pure, both text/argv seams with no I/O.

**File to create**: `adapters/codex/src/launch-args.js`.

```js
export function buildLaunchArgs({ workingDir }) → string[]
```
Emission rules, each with a pinned reason:
- `-s workspace-write` — sandbox mode is **always explicit, never defaulted**. Selecting a
  mode is not a containment claim: per-mode blocking was never measured. Say that in the
  header comment and in the README (Part 7); do not advertise containment.
- **`danger-full-access` is NEVER emitted**, in any code path.
- **`--ephemeral` is NEVER emitted.** It suppresses the session files `--source codex` mines,
  turning telemetry into a silent zero that reads as success. **The reason belongs in a
  comment at the construction site** — a future reader adding it "for hygiene" would break
  telemetry with no error anywhere.
- `--dangerously-bypass-hook-trust` IS emitted, because hook enforcement is the binding's
  strongest layer and automation cannot clear the trust prompt without it. It emits a visible
  warning item every run. That trade — a denying guard in exchange for a bypassed trust
  prompt — is the binding's central posture; the comment says so.
- `-C <workingDir>` as **two argv elements** (flag then value), never one interpolated string.
  This is an argv array, never shell-interpolated — the same discipline
  `adapters/pi/src/execution.js` follows.
- An absent / empty / non-absolute `workingDir` **throws a named error**. Never emit
  `-C undefined`.

**File to create**: `adapters/codex/src/execpolicy-rules.js`.

```js
export const FORBIDDEN_GIT_SUBCOMMANDS = Object.freeze(['push', 'clean', 'reset']);
export function buildExecpolicyRules() → string   // the full Starlark .rules text
```
Grammar, pinned: `prefix_rule(pattern=[…], decision="forbidden"|"allow"|"prompt", justification="…")`.
Nested-list alternation is CONFIRMED working: `pattern=["git", ["push","clean"]]`.

Hard constraints on the generated text:
- Every rule carries a **non-empty `justification`**.
- **No rule may degenerate to a bare `pattern=["git"]`** — that would deny *all* git and break
  craft's own git-heavy workflow. This is the same reason copilot rejected `shell(git:*)`.
- The generated text must state, in a Starlark comment, that this layer is **defence-in-depth
  only**: `git -C . push`, `git --git-dir=.git push` and `bash -lc 'git push'` all NO MATCH,
  and a malformed `.rules` file may **fail OPEN** at runtime.

**File to create**: `adapters/codex/craft.rules` — the committed output of
`buildExecpolicyRules()`. A test asserts the file's bytes equal the generator's output, so the
committed artifact can never drift from the generator.

**CI asserts the generated RULES TEXT, never live matcher behaviour.** `codex execpolicy check`
is deterministic and auth-free but needs the 248 MB binary, which CI does not have and must not
install. Matcher semantics stay in `docs/adapters/codex-poc-record.md` as an on-demand matrix.
**No test in this part shells out to anything.**

**Test files**: `adapters/codex/test/launch-args.test.js`,
`adapters/codex/test/execpolicy-rules.test.js`.

**`buildLaunchArgs` consumer lands in Part 7** (`adapters/codex/src/probe.js` builds the argv
it hands the injected `codexRunner`), so it is not left unreferenced.

### TDD steps

**RED 1** — "Given a working dir, when buildLaunchArgs runs, then `danger-full-access` appears
nowhere in the emitted argv". Assert over the JOINED argv AND over each element, so a future
single-string emission cannot slip past an element-only check. Expected failure: module not found.

**RED 2** — **the telemetry pin**: "Given a working dir, when buildLaunchArgs runs, then
`--ephemeral` appears nowhere in the emitted argv". Same joined-plus-element assertion.

**RED 3** — "Given a working dir, when buildLaunchArgs runs, then `-s` is emitted immediately
followed by `workspace-write`". Assert `args[args.indexOf('-s') + 1] === 'workspace-write'`.

**RED 4** — "Given a working dir, when buildLaunchArgs runs, then `-C` is emitted as its own
element immediately followed by the working dir element".

**RED 5** — "Given a working dir, when buildLaunchArgs runs, then
`--dangerously-bypass-hook-trust` is present". Pins the deliberate posture so a later reader
does not remove it as scary-looking and silently disarm the hook.

**RED 6** — "Given a missing working dir, when buildLaunchArgs runs, then it throws naming the
missing containment root". Repeat for `''` and for a relative path `'./x'`. Three cases.

**RED 7** — "Given the generated rules text, when scanned, then it contains at least one
`prefix_rule(` with `decision="forbidden"`".

**RED 8** — "Given every generated rule, when its justification is read, then it is non-empty".
Parse the text with a regex over `justification="([^"]*)"` and assert every capture is
non-empty AND that the count of justifications equals the count of `prefix_rule(`.

**RED 9** — **the never-deny-all-git pin**: "Given the generated rules text, when scanned, then
no rule uses a bare `pattern=["git"]`". Assert the text does not match
`/pattern=\[\s*"git"\s*\]/`.

**RED 10** — "Given the generated rules text, when scanned, then the forbidden git subcommands
appear inside a nested-list alternation". Assert the text matches a
`pattern=["git", [ … ]]`-shaped regex and that each of `push`/`clean`/`reset` appears inside it.

**RED 11** — **the honesty pin**: "Given the generated rules text, when scanned, then it
discloses the interposed-global-option bypass". Assert the text contains `git -C` and
`fail open` (case-insensitive). An honest carve-out silently deleted later would be worse than
never having written it.

**RED 12** — "Given the committed `craft.rules` file, when compared to the generator output,
then the two are byte-identical". Read the file with `readFileSync(…, 'utf8')` and
`assert.equal` against `buildExecpolicyRules()`.

**RED 13** — "Given FORBIDDEN_GIT_SUBCOMMANDS, when a caller attempts to mutate it, then the
value is unchanged" (`Object.isFrozen`).

**RED 14** — "Given the generated rules text, when scanned for provenance refs, then none is
present". `craft.rules` is a committed artifact and the hygiene rule applies to it.

**GREEN** — write both modules, then **generate** `craft.rules` from the generator; never
hand-write it, or RED 12 becomes a tautology the first time and a false alarm the next:

```
cd /Users/scolladon/workspace/perso/craft-native-codex-binding/adapters/codex
node --input-type=module -e "import('./src/execpolicy-rules.js').then(m => process.stdout.write(m.buildExecpolicyRules()))" > craft.rules
```
Then let RED 12 confirm the bytes match.

**REFACTOR** — extract `renderRule({ pattern, decision, justification })` so the rule list is
declarative data and the rendering is one function. Keep the disclosure comment block as a
named constant so RED 11 has a stable anchor.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-codex-binding/adapters/codex && node --test 'test/**/*.test.js' 2>&1 | tail -40
```

### Commit

```
feat(codex): launch-args posture and generated execpolicy rules
```

---

## Part 7 — Native surface: marketplace, plugins, agents, entrypoint, config, README, probe

### Context

The `native-surface` part shape, which has passed before: manifest + template + thin
dispatchers + one thin wrapper over already-tested `src/` seams + README + structure tests
that read the authored surfaces as TEXT.

**The by-reference discipline is the point of this part.** Shared craft skills load **by
reference, never by copy** — copying forces hygiene exemptions on exactly the files most
likely to drift (the shared bodies legitimately carry provenance refs and one bare
`${CLAUDE_PLUGIN_ROOT}`). Only **agents** are adapter-local, with bodies byte-identical to the
shared bodies and only frontmatter re-expressed.

**Structural constraint that drives the layout**: copilot takes *repeatable* `--plugin-dir`
flags; a Codex plugin manifest declares **ONE** `skills` path. So the shared tree and the
adapter's own surface need **two plugin entries in one local marketplace**.

**Layout to create:**

```
adapters/codex/
  marketplace.json                                  # local file-backed, "source": "local", two entries
  plugins/craft/plugin.json                         # skills → repo-root skills/ (by reference)
  plugins/craft-codex/plugin.json                   # hooks → ../../hooks.json ; agents ; entrypoint skill
  plugins/craft-codex/skills/craft-run/SKILL.md     # the ONE adapter-authored entrypoint
  agents/craft-<role>.md                            # 9 files
  config.template.toml
  README.md
  src/probe.js
```

**`adapters/codex/skills/` MUST NOT EXIST** — a test asserts its absence so a re-copy of the
19 shared skills fails loudly. Note the distinction the test must encode precisely:
`adapters/codex/skills/` is banned; `adapters/codex/plugins/craft-codex/skills/` is the
craft-codex plugin's own skills path and holds **exactly one** adapter-authored entrypoint,
never a copy of a shared skill. The test asserts both halves — absence of the former, and that
the latter contains exactly `['craft-run']`.

**`plugins/craft/plugin.json`** — the by-reference entry. `"skills": "../../../../skills"`
(four levels up from `adapters/codex/plugins/craft/` reaches the repo root). Whether Codex
resolves `skills` relative to the manifest is **UNPINNED**; the README documents the
assumption and the fallback. The test does not need Codex to verify the path — it resolves the
declared relative path from the manifest's own directory and asserts it lands on the repo-root
`skills/` directory (`realpathSync` equality), which is a fully deterministic seam.

**`plugins/craft-codex/plugin.json`** — `"hooks": "../../hooks.json"`,
`"skills": "./skills"`, and the agents surface. Same relative-resolution test treatment.

**`marketplace.json`** — declares both entries with `"source": "local"`.

**The nine agents.** Roles and their tiers (identical to every other binding — read from
`adapters/copilot/test/native-surface.test.js` lines 16–27):

| role | tier | model | effort |
|---|---|---|---|
| `designer`, `planner`, `reviewer`, `requirements-writer` | opus | `gpt-5.6-sol` | `high` |
| `part-implementer`, `harness-triager`, `docs-writer`, `refactor-executor` | sonnet | `gpt-5.6-terra` | `medium` |
| `backlog-ticker` | haiku | `gpt-5.4-mini` | `low` |

Each `adapters/codex/agents/craft-<role>.md` has frontmatter (`description`, `model`, `effort`)
and a body **byte-identical** to `agents/<role>.md` at the repo root. Reuse the
`parseFrontmatter` / `bodyOf` helpers from `adapters/copilot/test/native-surface.test.js` —
copy that helper block; it is a 20-line no-yaml-dependency parser already proven in three
suites.

**The entrypoint and the delegation ask — the silent-failure surface.** Codex injects
`Do not spawn sub-agents unless the user or applicable AGENTS.md/skill instructions explicitly
ask for sub-agents, delegation, or parallel agent work.` Of the three sources Codex names as
authoritative, only **skill instructions** are a surface this adapter controls and can
single-source. So `plugins/craft-codex/skills/craft-run/SKILL.md`:

0. Carries YAML frontmatter with `name` and `description` — the pinned skill contract is
   `SKILL.md` + frontmatter, and a skill without it is not discovered.
1. Defers **verbatim** to `skills/run/SKILL.md` for the procedure — the copilot
   `commands/craft-run.md` wording is the model to follow; do NOT restate, summarize or
   re-derive any step.
2. Adds ONE adapter-authored Codex-native paragraph that **explicitly asks for delegation**,
   naming `multi_agent_v1` / `spawn_agent`, and stating the **usable fan-out width is 3**
   (the pinned cap is 4 "including you"). Phases that fan out wider — review fans out one
   worker per dimension — **batch to 3**; what `spawn_agent` does at the ceiling is unpinned,
   so do not assume graceful queueing.
3. Carries the pipeline-resolve preamble in the `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` shim
   form, exactly as `adapters/copilot/commands/craft-run.md` lines 9–11 do.

That paragraph is adapter-authored, so no hygiene exemption is needed. **Degradation to
sequential is silent** — no error, artifacts still land — so a test asserts the ask text is
present.

**`config.template.toml`** — the `$CODEX_HOME/config.toml` fragment. Sandbox mode explicit
(`workspace-write`), approval policy, agent entries. **No `danger-full-access`.** Provider-
neutral: no model pin outside the tier map's own vocabulary. Lead with a `#` comment block
explaining it merges into `$CODEX_HOME/config.toml` (user level), mirroring the
`$comment` field in `adapters/copilot/config.template.json`.

**`README.md`** — the single source for launch + distribute + the honest guard profile. It
must carry, unsoftened:
- The marketplace install route (`codex plugin marketplace add <local>` then `codex plugin add`)
  **and** the named fallback for if by-reference skill loading fails end-to-end: symlink
  `$CODEX_HOME/skills/<name>` → `<repo>/skills/<name>` plus a `config.toml` hook path.
- The three-layer guard table: PreToolUse hook **enforcing** (live-proven denial fed back to
  the model); execpolicy `.rules` **partial** (defence-in-depth); sandbox **unmeasured**.
- The four verbatim statements: (a) `git -C . push` and `git --git-dir=.git push` **bypass**
  the execpolicy layer; (b) a malformed `.rules` file **may fail open** at runtime; (c)
  per-sandbox-mode blocking was **not measured** — the binding claims no containment
  guarantee; (d) hook enforcement costs `--dangerously-bypass-hook-trust`, which emits a
  visible warning every run.
- That `--ephemeral` is never passed, and why.

**`src/probe.js`** — `export async function runAcceptanceProbe({ codexRunner, fsOps })`.
Port `adapters/copilot/src/probe.js` (112 lines) structurally: `fsOps.mktemp()` for a throwaway
target, `buildLaunchArgs({ workingDir: targetPath })` for the argv, then `codexRunner({ phaseId,
modelTier, workingDir, launchArgs })`, then `evaluateTrace` asserting gate-green-before-commit,
a committed artifact, and every mutated path inside the throwaway.
`PORTS_EXERCISED = ['Execution','Model','Gate']` — **deliberately three, where copilot's is
four.** Copilot's includes `'VCS'`; this binding binds no VCS port, and the port doc's binding
set stays `{ claude, pi }` for `vcs.md`. Listing a port the binding does not bind would make
the probe's evidence object contradict the port docs Part 10 writes. **This is a knowingly
near-verbatim fourth copy of the pi/opencode/copilot harness** — deduplicating it is a parked
follow-up, explicitly out of scope here; do not extract it.
**The injected `codexRunner` is never the real binary**, in the module or in any test.

**Test files**: `adapters/codex/test/native-surface.test.js`,
`adapters/codex/test/probe.test.js`, and extensions to the existing
`adapters/codex/test/config.test.js` from Part 5.

**Hygiene checks the native-surface suite must run over EVERY authored adapter surface, with
no carve-out** (mirror `adapters/pi/test/native-surface.test.js`):
- `PROVENANCE_REF = /\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i` → zero hits
- `SHELL_INJECTION_PATTERN = /!`[^`]*`/` → zero hits
- bare `${CLAUDE_PLUGIN_ROOT}` (i.e. any occurrence not part of the
  `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` shim) → zero hits

### TDD steps

**RED 1** — "Given the codex adapter tree, when checked, then `adapters/codex/skills/` does not
exist". Expected failure: none yet — write it and confirm it passes immediately, then keep it.
This is the ADR-guarding tripwire; it must exist from the first commit of this part.

**RED 2** — "Given the craft-codex plugin's skills directory, when its entries are listed, then
it contains exactly `craft-run`". Guards against the entrypoint dir quietly becoming a second
copy of the shared tree.

**RED 3** — "Given the `craft` plugin manifest, when its declared `skills` path is resolved
from the manifest's own directory, then it resolves to the repo-root `skills/` directory".
Assert `realpathSync(resolved) === realpathSync(join(repoRoot,'skills'))`.

**RED 4** — "Given the repo-root skills tree, when `skills/run/SKILL.md` is checked, then it
exists". The entrypoint cites it; a broken citation must fail here.

**RED 5** — "Given the `craft-codex` plugin manifest, when its declared `hooks` path is
resolved, then it resolves to `adapters/codex/hooks.json`".

**RED 6** — "Given `marketplace.json`, when parsed, then it declares `source: "local"` and
exactly the two entries `craft` and `craft-codex`".

**RED 7** — for each of the nine roles: "Given agent `craft-<role>.md`, when its body is
compared to the shared craft source, then the two are byte-identical". Nine cases via a loop.

**RED 8** — for each role: "Given `craft-<role>.md`, when frontmatter is parsed, then
`description`, `model` and `effort` are each non-empty".

**RED 9** — for each role: "Given role `<role>` pinned to tier `<tier>`, when compared to
`resolveCodexModel()`, then the frontmatter model matches the tier map". Same for
`resolveCodexEffort()` / `effort`. This is what stops a hand-edited frontmatter from silently
resolving an unknown model id and dropping `multi_agent_v1`.

**RED 10** — **the silent-degradation pin**: "Given the entrypoint skill, when scanned, then it
explicitly asks for subagent delegation". Assert the text contains `multi_agent_v1` AND
`spawn_agent`. Fan-out degrading to sequential produces no error anywhere, so absence of the
ask must be caught here or not at all.

**RED 11** — "Given the entrypoint skill, when scanned, then it states the usable fan-out
width". Assert it names `3` in the context of concurrent workers.

**RED 12** — "Given the entrypoint skill, when scanned, then it defers to `skills/run/SKILL.md`
rather than restating the procedure". Assert the citation is present AND that the file is under
a small line budget (say 40 lines) — a restated procedure cannot fit, so the budget is the
mechanical proxy for "does not re-author".

**RED 13** — "Given every authored adapter surface, when scanned, then no provenance ref is
present". Enumerate `README.md`, `config.template.toml`, `hooks.json`, `craft.rules`, both
plugin manifests, `marketplace.json`, all nine agents, and the entrypoint. One case per file so
a failure names the offender.

**RED 14** — same enumeration, for the shell-injection pattern.

**RED 15** — same enumeration, for bare `${CLAUDE_PLUGIN_ROOT}` outside the shim.

**RED 16** (`config.test.js`) — "Given `config.template.toml`, when scanned, then it sets an
explicit sandbox mode and never names `danger-full-access`".

**RED 17** (`config.test.js`) — "Given `config.template.toml`, when scanned, then it pins no
model id outside the tier map's vocabulary". Assert every `gpt-` literal it contains is one of
the three committed tier models (or that it contains none at all — preferred).

**RED 18** — **the honesty pin**: "Given `README.md`, when scanned, then it discloses the
`git -C . push` execpolicy bypass". Assert the text contains `git -C`. Also assert it contains
`fail open`, `not measured`, and `--dangerously-bypass-hook-trust` — the four unsoftened
statements, each asserted separately so a failure names which one was dropped.

**RED 19** — "Given `README.md`, when scanned, then it documents the symlink fallback route".
Assert it names `$CODEX_HOME/skills`.

**RED 20** (`probe.test.js`) — "Given an injected runner returning a green-gate trace, when
runAcceptanceProbe runs, then it passes". Then: a red gate → fails; a missing committed
artifact → fails; a mutated path outside the throwaway → fails; the argv handed to the runner
never contains `--ephemeral` or `danger-full-access`. Five cases. **The runner is a stub
function throughout; nothing spawns a binary.**

**GREEN** — author every surface listed in the layout.

**REFACTOR** — hoist the shared `parseFrontmatter`/`bodyOf`/`ADAPTER_DIR` block to the top of
`native-surface.test.js` (mirroring the copilot suite) and drive the hygiene checks from one
`AUTHORED_SURFACES` array so RED 13–15 are three loops over one list rather than three
hand-maintained enumerations that drift apart.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-codex-binding/adapters/codex && node --test 'test/**/*.test.js' 2>&1 | tail -40
export PATH="/tmp/craft-codex-stubs:$PATH" && cd /Users/scolladon/workspace/perso/craft-native-codex-binding && bash scripts/ci.sh 2>&1 | tail -30
```

### Commit

```
feat(codex): native plugin surface, agents, delegating entrypoint and acceptance probe
```

---

## Part 8 — Codex telemetry parser

### Context

**PRECONDITION — do this FIRST, before writing a line of the parser.** The persisted rollout
record shape is **NOT yet pinned**. The `turn.completed` envelope is CONFIRMED in the
`codex exec --json` **stream**; whether the persisted rollout `.jsonl` carries the same
envelope is an open DEFERRED row, and `--source codex` reads the persisted files, not the
stream. So:

1. Attempt a **read-only** pin: glob
   `"${CODEX_HOME:-$HOME/.codex}"/sessions/*/*/*/rollout-*.jsonl` and, if any file exists,
   read one and record the actual token-bearing record shape. **Read-only — never write into,
   never delete from, the operator's real `~/.codex/`.**
2. If the glob is empty, **do not generate one** — that would mean running the `codex` binary,
   which this plan forbids outright. Proceed against the CONFIRMED stream envelope and leave
   the row visibly DEFERRED.
3. **Record the outcome either way** in `docs/adapters/codex-poc-record.md` in Part 10:
   CONFIRMED with the observed shape, or still DEFERRED with "no local rollout history
   available to read". A row closed silently is indistinguishable from a row assumed.

The parser is **envelope-shaped, not location-shaped** — it matches `turn.completed` wherever
it appears — so a shape mismatch fails safe (zero events, never a wrong number) but is a real,
documented gap.

**File to create**: `engine/src/observability/adapters/codex/telemetry.js`.
Signature (the port contract, identical across all bindings):
```js
export async function parseLines(lines, since = null)
  → Promise<{ events: object[], skipped: number, markers: object[] }>
```
Read `engine/src/observability/adapters/copilot/telemetry.js` (180 lines) and
`.../pi/telemetry.js` first — copilot for the `since`/`toEpochMs`/`numOrZero` shape, pi for
the **held session id** pattern this parser needs.

**The token arithmetic is the single riskiest line in this change.** Codex supplies
`{input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens}`; `UsageEvent`
needs `{input, cacheRead, cacheCreation, output}`. Whether `cached_input_tokens ⊂ input_tokens`
is **not pinned**, and the two vendor conventions disagree.

| `UsageEvent` field | Codex source |
|---|---|
| `tokens.input` | `Math.max(0, input_tokens - cached_input_tokens)` |
| `tokens.cacheRead` | `cached_input_tokens` |
| `tokens.cacheCreation` | `0` — no Codex equivalent pinned |
| `tokens.output` | `output_tokens` **alone** |
| `run` | thread/session id from `thread.started`, **held across the stream** and stamped on later events |
| `model` | resolved model id from the turn envelope |
| `slug`, `phase`, `role` | `null` |
| `cacheCreationTtl` | `null` |
| `messages` | `1` per `turn.completed` |
| `durationMs` | derived from turn start/end when present, else `0` |

**Why subtraction-with-a-floor and not the alternatives**: it is the only mapping whose total
is exactly `input_tokens` under **either** convention. If the subset assumption is wrong, only
the input/cache-read *attribution* shifts — the sum never moves. `input = input_tokens` with
`cacheRead = cached_input_tokens` **inflates every reported cost figure** if cached is a subset,
which is the convention Codex speaks. Same logic for reasoning: `output = output_tokens` alone
is exact if reasoning ⊂ output and under-reports (safe) if disjoint; **adding them is the only
variant that can over-report**. Write this as a `why` comment at the mapping site — a future
reader "fixing" the subtraction would silently inflate the whole telemetry surface.

**Port contract — the adapter NEVER throws.** Malformed lines are skipped and **counted** in
`skipped`. Partial data returns a partial array. Non-finite token values coerce to `0` via
`const numOrZero = (v) => (Number.isFinite(v) ? v : 0)`. Empty input returns `{ events: [],
skipped: 0, markers: [] }`. Codex emits no auto-skip signal text, so `markers` is always `[]`.

**The `since` cutoff trap**: normalise **both sides to epoch ms before comparing**. Comparing a
raw numeric timestamp against a raw ISO string coerces to `NaN` and fails the cutoff **open** —
the copilot adapter documents this explicitly; reuse its `toEpochMs` shape.

**Fixtures to create** under `engine/test/fixtures/codex/` (mirroring
`engine/test/fixtures/copilot/`):
- `single-turn.jsonl` — `thread.started` then `turn.completed` with a usage block where
  `cached_input_tokens < input_tokens`
- `malformed.jsonl` — one valid turn plus a line that is not JSON
- `multi-turn.jsonl` — one `thread.started` and several `turn.completed` lines, proving the
  session id is held and stamped on every later event

**Test file**: `engine/test/codex-telemetry.test.js`. **Note the naming convention** — the
design doc writes `engine/test/observability/codex-telemetry.test.js`, but `engine/test/` is
**flat** in this tree (`copilot-telemetry.test.js`, `pi-telemetry.test.js`,
`opencode-telemetry.test.js`). Follow the tree, not the design doc.

**No `SOURCES` / `DEFAULT_READ_ROOTS` edit in this part** — the front-door wiring is Part 9, so
this part's gate is the engine suite alone.

### TDD steps

**RED 1** — "Given a single `turn.completed` line, when parseLines runs, then one UsageEvent is
returned". Expected failure: module not found. Drive `parseLines` with an async generator over
the fixture's lines (the copilot suite's helper shape).

**RED 2** — **the sum-safety pin**: "Given a turn where cached_input_tokens is less than
input_tokens, when parseLines runs, then `input + cacheRead` equals `input_tokens` exactly".
This is the assertion that makes the arithmetic choice mechanical rather than a comment.

**RED 3** — "Given a turn where cached_input_tokens exceeds input_tokens, when parseLines runs,
then `input` floors at 0 and is never negative".

**RED 4** — "Given a turn carrying reasoning_output_tokens, when parseLines runs, then `output`
equals output_tokens alone and the reasoning tokens are not added".

**RED 5** — "Given a stream whose session id arrives on `thread.started`, when parseLines runs,
then every later event carries that id as `run`".

**RED 6** — "Given a stream with no `thread.started` line, when parseLines runs, then `run` is
null rather than undefined".

**RED 7** — "Given a stream containing a malformed line, when parseLines runs, then the line is
skipped and counted and the valid events still return". Assert `skipped === 1` and
`events.length` is unchanged from the clean fixture.

**RED 8** — "Given a turn whose token values are non-finite, when parseLines runs, then each
coerces to 0". Cases: a string, `null`, and a missing `usage` object entirely.

**RED 9** — "Given empty input, when parseLines runs, then it returns an empty event array with
zero skipped".

**RED 10** — **the never-throws pin**: "Given structurally hostile lines, when parseLines runs,
then it resolves rather than rejecting". Feed a JSON `null`, a JSON array, a JSON string, and a
deeply-nested object. Assert with `await assert.doesNotReject`.

**RED 11** — **the cutoff-open trap**: "Given a numeric turn timestamp and an ISO `since`
string, when parseLines runs, then the cutoff still applies". Two cases: a turn before the
cutoff is dropped, and a turn after it is kept. A naive raw comparison keeps both — that is the
mutant this kills.

**RED 12** — "Given a turn whose timestamp equals the cutoff, when parseLines runs, then it is
kept". The boundary is inclusive; pin it.

**RED 13** — "Given any stream, when parseLines runs, then `markers` is an empty array".

**RED 14** — "Given a `turn.completed` with start and end timestamps, when parseLines runs, then
`durationMs` is their difference"; and "Given reversed timestamps, then `durationMs` floors at 0".

**RED 15** — "Given a line that is not a `turn.completed` envelope, when parseLines runs, then
it contributes no event and is not counted as malformed". Use `turn.started` and
`item.completed`. Exclusion is handling, not a swallowed defect.

**RED 16** — **the property lens** (folded here, not a standalone part — it exercises this
part's code): "Given any generated set of well-formed turns, when parseLines runs, then
`sum(input + cacheRead)` equals `sum(input_tokens)` exactly". Generate ~200 turns with a seeded
deterministic pseudo-random generator (no `Math.random` — the suite must be reproducible) over
`input_tokens ∈ [0, 10000]` and `cached_input_tokens ∈ [0, 2 × input_tokens]` so the
`cached > input` floor branch is exercised too. This single property is what makes the
sum-safety a mechanical guarantee.

**GREEN** — write the parser.

**REFACTOR** — extract `tokensFromCodexUsage(usage)` as a named exported-or-private mapper (pi
exports its equivalent, `tokensFromPiUsage` — follow that if the test wants it directly), and
`eventFromTurn(turn, sessionId)`. Keep the arithmetic `why` comment at the mapper.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-codex-binding/engine && node --test 'test/**/*.test.js' 2>&1 | tail -30
```

### Commit

```
feat(codex): telemetry parser for turn.completed usage envelopes
```

---

## Part 9 — Front-door wiring and contract-equivalence proof

### Context

Two additive registry entries and one new equivalence test. **No engine core logic changes** —
both entries go into lookups that already exist for exactly this purpose.

**File to edit**: `engine/src/observability/usage-mine-main.js`.

1. Import, alongside the four existing adapter imports (lines 29–32):
   ```js
   import { parseLines as codexParseLines } from './adapters/codex/telemetry.js';
   ```
2. `SOURCES` (lines 42–47) gains `codex: codexParseLines,`.
3. `DEFAULT_READ_ROOTS` (lines 53–62) gains, as a **thunk**:
   ```js
   codex: () => join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions'),
   ```
   **A thunk, never a frozen constant** — it must re-read `process.env` per invocation, the
   pi/copilot precedent. `join` and `homedir` are already imported at lines 19–20.

**The read-root shape is the failure mode that reads as success — document it at the site.**
`usage-mine-main.js` line 264 does
`readdirSync(safeTranscriptDir).filter(f => f.endsWith('.jsonl'))` — **non-recursive**. Codex
sessions live at `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`, so pointing `--dir` at
`sessions/` enumerates only `2026/` and yields a **silent zero-cost report**. This is not an
engine bug to fix: it is exactly the claude shape, where the default root is the **containment
boundary** and `--dir` names the **leaf**. So `DEFAULT_READ_ROOTS.codex` is the boundary and the
caller passes `--dir $CODEX_HOME/sessions/2026/07/20`. Put that reasoning in a comment beside
the entry (the copilot entry above it has the same kind of comment), and Part 10 documents it in
`docs/adapters/telemetry.md`.

**Where the read-root tests live**: `engine/test/usage-mine-main.test.js`, alongside the
existing `resolveDefaultReadRoot` cases for pi (line ~878) and copilot (lines ~933–990).
`resolveDefaultReadRoot` is already exported (line 69) as a direct unit-test seam — extend that
file; do **not** create `engine/test/observability/read-root.test.js` (the design doc names it,
but `engine/test/` is flat and this seam already has a home).

**File to edit**: `engine/test/contract-equivalence.test.js`. Add a **fourth**
binding-fidelity test inside the existing `for (const descriptor of DESCRIPTORS)` loop, modelled
line-for-line on the opencode (lines 147–160), copilot (166–179) and pi (211–224) tests:

```js
test(`Given a codex binding hint on descriptor "${descriptor.id}", when assembled, then it is ignored and the block equals plain agent-mode assembly`, () => {
  const sut = assembleContract;
  const agentModeBlock  = sut(descriptor, {}, FRAGMENTS, { execution: 'agent' });
  const codexHintedBlock = sut(descriptor, {}, FRAGMENTS, { execution: 'agent', binding: 'codex' });
  const diffs = diffLines(codexHintedBlock, agentModeBlock);
  assert.equal(diffs.length, 0, `Descriptor "${descriptor.id}": a binding hint must not introduce a variant — the codex binding reuses agent-mode assembly, got ${JSON.stringify(diffs)}`);
});
```

**`engine/src/contract.js` and `contracts/**` stay BYTE-UNCHANGED.** Codex is agent-mode with
real subagents, so it takes the same carve-outs as Claude, opencode and copilot — the existing
`AGENT_VARIANTS`/`INLINE_VARIANTS` are reused with a **zero-line diff**. No third variant set.
Verify before committing: `git diff --no-ext-diff --stat HEAD -- engine/src/contract.js contracts/`
must print nothing.

### TDD steps

**RED 1** — "Given `--source codex`, when main runs against a fixture dir, then it is accepted
rather than rejected as an unknown source". In `engine/test/usage-mine-main.test.js`, drive
`main(['--source','codex','--dir',fixtureDir], io)` with an injected `io` and assert the exit
code is 0, not the `EXIT_CONFIG_ERROR` 1. Expected failure: `unknown --source 'codex'` on
stderr.

**RED 2** — "Given `--source codex` over a rollout fixture, when main runs, then the written
report carries the turn's tokens". Point `--dir` at a temp dir holding a copy of the Part 8
`single-turn.jsonl` fixture, inject `writeFileSync`, and assert the serialized report is not the
no-op shape. **The containment trap to pre-pay**: `main` realpath-contains the `--dir` inside
`projectsRoot`, which for source `codex` defaults to `$CODEX_HOME/sessions` — a temp dir is not
inside it, so the run would return a `'transcript dir not contained within projects root'`
no-op report that *looks* like a pass of the wrong assertion. Inject `io.projectsRoot` pointing
at the temp dir (an explicit override always wins over `resolveDefaultReadRoot`), exactly as
the existing copilot and pi cases in this file do.

**RED 3** — "Given `CODEX_HOME` set, when resolveDefaultReadRoot runs for source codex, then it
resolves under that home's `sessions` directory". Set and restore the env var in the test.

**RED 4** — "Given `CODEX_HOME` unset, when resolveDefaultReadRoot runs for source codex, then
it resolves to the literal `~/.codex/sessions` path".

**RED 5** — "Given `CODEX_HOME` set to the empty string, when resolveDefaultReadRoot runs for
source codex, then it falls back to the default root". Mirrors the copilot empty-string case at
line ~983; `||` (not `??`) is what makes this pass.

**RED 6** — **the thunk pin**: "Given `CODEX_HOME` changed between two calls, when
resolveDefaultReadRoot runs each time, then each call reflects the current value". A frozen
module-load constant passes RED 3 and fails here.

**RED 7** — "Given the unknown-source error message, when `--source nope` is passed, then the
expected-source list names codex". Assert the stderr string contains `codex` — pins that the
`SOURCES` key actually landed and is enumerated.

**RED 8** — "Given a codex binding hint on each descriptor, when assembled, then it is ignored
and the block equals plain agent-mode assembly". One case per descriptor via the existing loop.

**GREEN** — apply the three edits to `usage-mine-main.js` and add the equivalence test.

**REFACTOR** — none warranted; these are lookup entries. Do not restructure `SOURCES` or
`DEFAULT_READ_ROOTS` while adding to them.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-codex-binding/engine && node --test 'test/**/*.test.js' 2>&1 | tail -30
cd /Users/scolladon/workspace/perso/craft-native-codex-binding && git diff --no-ext-diff --quiet "$(git merge-base HEAD main)" -- engine/src/contract.js contracts/ && echo "contract byte-unchanged" || { echo "GATE FAILED: contract.js or contracts/ changed" >&2; false; }
export PATH="/tmp/craft-codex-stubs:$PATH" && cd /Users/scolladon/workspace/perso/craft-native-codex-binding && bash scripts/ci.sh 2>&1 | tail -30
```

`--quiet` exits non-zero on any difference, so this is a real gate rather than a printed
diagnostic; comparing against the merge-base (not `HEAD`) proves the invariant across the
**whole change**, not just this part.

### Commit

```
feat(codex): wire the telemetry source, read root and contract-equivalence proof
```

---

## Part 10 — Port docs, PoC record refresh, README and backlog

### Context

**Docs-only part: no `src/` delta, no test delta.** Legitimately standalone under the sizing
rules.

**Binding-set edits — exactly four files, and making them uniform would be a lie.** Verified
against this tree:

| Port doc | Heading line | Current set | After |
|---|---|---|---|
| `docs/adapters/execution.md` | `## Binding set` at line 42 | `{ claude, pi, opencode, copilot }` | `{ claude, pi, opencode, copilot, codex }` |
| `docs/adapters/model.md` | line 34 | `{ claude, pi, opencode, copilot }` | `{ claude, pi, opencode, copilot, codex }` |
| `docs/adapters/telemetry.md` | line 32 | `{ claude, pi, opencode, copilot }` | `{ claude, pi, opencode, copilot, codex }` |
| `docs/adapters/gate.md` | line 29 | `{ claude, pi, opencode, copilot }` | `{ claude, pi, opencode, copilot, codex }` |
| `docs/adapters/memory.md`, `vcs.md`, `policy.md` | — | `{ claude, pi }` | **UNCHANGED** — this change binds none of those ports |
| `docs/adapters/backlog.md`, `intention.md` | — | (no `Binding set` line at all) | **UNTOUCHED** |

**Four per-binding sections to author.** Each of the four docs already carries per-binding
sections in binding order (`## Claude binding`, `## Pi binding`, `## opencode binding`,
`## Copilot binding`). Add `## Codex binding` **after** the Copilot section and **before** the
trailing `## Failure → blocker` / `## Failure semantics` section in each.

1. **`docs/adapters/execution.md`** (Copilot section at 113–134). `spawn` dispatches via the
   `multi_agent_v1` namespace (`spawn_agent`, `send_input`, `wait_agent`, `resume_agent`,
   `close_agent`). **State the two non-obvious facts**: the 4-slot cap **includes the
   orchestrator**, so usable fan-out width is **3** and wide phases batch to it; and Codex
   **suppresses** fan-out unless a user turn, an `AGENTS.md`, or a **skill instruction**
   explicitly asks — the binding carries the ask in its adapter-authored entrypoint, and
   without it the run silently degrades to sequential. `codex exec` takes one user message and
   runs the whole run to completion: **one invocation walking all phases**, the copilot/opencode
   shape, not one invocation per phase. Native surface: local file-backed marketplace with two
   plugin entries (`craft` → repo-root `skills/` by reference; `craft-codex` → the adapter's
   hooks/agents/entrypoint).

2. **`docs/adapters/model.md`** (Copilot section at 78–91). `select` maps the tier via
   `adapters/codex/src/model-tier-map.js` (`resolveCodexModel`), with `resolveCodexEffort`
   supplying `model_reasoning_effort`. **Unlike the Copilot binding, real ids ship on day one**
   because the catalog renders with no auth. State the tier map, and state the stake: an unknown
   id does not error — it falls back with a warning and **changes which tools are registered**,
   potentially removing `multi_agent_v1`, so the map fails loud on an unknown tier and the ids
   are cross-checked against the auth-free catalog. Note `ultra` exists only on `sol`/`terra`
   and is mapped to no tier.

3. **`docs/adapters/telemetry.md`** (Copilot section at 101–137). `collect` reads
   `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`; the source is the `turn.completed.usage`
   envelope. **The leaf-vs-containment-root caveat is the load-bearing paragraph** — the miner's
   directory read is non-recursive, so `DEFAULT_READ_ROOTS.codex` is the containment boundary
   (`$CODEX_HOME/sessions`) while `--dir` at invocation time must name the `YYYY/MM/DD` leaf;
   pointing `--dir` at `sessions/` yields a zero-cost report **that reads as success**. Also
   state: `--ephemeral` suppresses the very files this source mines, so it is never passed; the
   token arithmetic is subtraction-with-a-floor and why; `role` is null pending subagent
   attribution; `cacheCreation` is 0 with no pinned equivalent. **This page declares
   `subjects: ['engine/src/observability/**']` in its frontmatter and Parts 8–9 land inside that
   scope — refreshing it is this change's own living-intention obligation, not optional.**

4. **`docs/adapters/gate.md`** (Copilot section at 88–136) — the biggest delta. The listing
   criterion is already stated in this file ("ships a guard binding, regardless of enforcement
   strength"), so only the per-binding section is new. Its three-layer table:

   | Layer | Mechanism | Enforcing? |
   |---|---|---|
   | PreToolUse hook | `hooks.json` → `hooks/craft-guard.js` → the shared engine guard; exit 2 + stderr reason | **Yes — live-proven; the command never runs and the denial is fed back to the model** |
   | Execpolicy `.rules` | `prefix_rule` with nested-list alternation | Partially — token-prefix over argv; defence-in-depth only |
   | Sandbox | `-s workspace-write` + `writable_roots` | Unmeasured — claims nothing |

   **The headline**: because this hook genuinely denies, the git-ext-diff rule ships
   **ENFORCED** here — the Copilot binding's advisory carve-out does **not** carry over. This is
   the strongest guard profile recorded across the five bindings.
   **Four statements ship verbatim, unsoftened**: (a) `git -C . push` and
   `git --git-dir=.git push` **bypass** the execpolicy layer, live-pinned NO MATCH — enumerating
   flag orders cannot close it, and a blanket `pattern=["git"]` would deny all git; (b) a
   malformed `.rules` file **may fail open** at runtime — treated as fail-open until proven
   otherwise; (c) per-sandbox-mode blocking was **not measured** — the binding selects a mode and
   documents the selection, it does not advertise containment; (d) hook enforcement costs
   `--dangerously-bypass-hook-trust`, which emits a visible warning every run.
   Also document the write-path story honestly: `apply_patch` is freeform with no structured
   path field, so containment parses **every** filename out of the patch body — `*** Add File:`,
   `*** Update File:`, `*** Delete File:` and `*** Move to:` — and a patch that yields no
   parsable path fails **closed**.

**`docs/adapters/codex-poc-record.md` — refresh, do not leave stale.** Every DEFERRED row this
change closes flips to CONFIRMED **with its evidence**; every row that stays DEFERRED stays
visibly DEFERRED. At minimum:
- The write-tool row (`apply_patch`, freeform, multi-file) is already CONFIRMED — cross-reference
  the containment approach now shipped.
- The rollout-record-shape row: whatever Part 8's read-only precondition established. If a local
  rollout file was read, flip to CONFIRMED with the observed shape; **if none existed, it stays
  DEFERRED with "no local rollout history available to read"** — a row closed silently is
  indistinguishable from a row assumed.
- Rows that stay DEFERRED and must be visibly so: end-to-end skills-by-reference, per-sandbox-mode
  blocking, malformed-`.rules` runtime behaviour, `CLAUDE_PLUGIN_ROOT` substitution, `matcher`
  semantics, the plugin manifest filename, whether `skills` is manifest-relative.

**`README.md`** — the adapter listing at lines 84–90 enumerates `adapters/pi/`,
`adapters/opencode/`, `adapters/copilot/`. Add an `adapters/codex/` bullet in the same voice:
native Codex CLI binding — local marketplace with two plugin entries, adapter-local `agents/`,
a **denying** PreToolUse guard hook, execpolicy rules as defence-in-depth, driving the same
engine core via `multi_agent_v1` subagent dispatch (on-demand, not CI-gated).

**`BACKLOG.md`** — three parked entries live as **prose paragraphs** (not checkboxes) under
`### Open (scoped 2026-07-20 — follow-ups surfaced by the copilot binding, not yet scheduled)`
at lines 180, 190 and 197. There is nothing to "tick"; follow whatever convention the file
itself uses for a completed entry, and run `bash scripts/backlog-lint.sh BACKLOG.md` after.

- **"Lift the binding-neutral guard predicate to a shared home"** (line 180) — **done** by
  Part 1. Its text says "have all three bindings import it"; that is now inaccurate — pi and
  copilot import the lifted module, **opencode never imported `gate.js` at all** and keeps its
  narrower `gitGuardPredicate`. Record the outcome accurately, and note that the residual
  `COMPLIANT_MARKERS`/`GIT_DIFF_SHOW_RE`/`REASON_GIT_EXT_DIFF` duplication with opencode
  **remains open**.
- **"Deduplicate the acceptance-probe harness across three bindings"** (line 190) — **not**
  done; this change adds a fourth near-verbatim copy. Update the count from three to four.
  Do not close it.
- **"Mutation-cover the adapter sources"** (line 197) — leave it alone in this part; Part 11
  closes it. Its current text prescribes adding a per-adapter `stryker.conf.json`, which the
  ratified decision **reverses** — so when Part 11 closes it, the entry must record that the
  fix was a consumer-level scope extension, not a per-adapter config. Flagged here so Part 11's
  author does not close it against its own stale prescription.

**Lints this part must satisfy** (all run by `ci.sh`):
- `test/source-hygiene.test.js` — `docs/adapters/**` and `README.md` are scanned. **class-A**
  (`mutation|mutant|stryker|…`): write "state-changing probe" / "writes confined to the
  throwaway", never "mutation". **class-B** (`\bgh\b|\bgithub\b`, case-sensitive): nothing in
  the codex surface needs it — keep `GitHub` capitalised if it appears at all. **Run
  `grep -rEn 'stryker|mutmut|mutation|mutant|\bgh\b|\bgithub\b' docs/adapters README.md` after
  writing and before committing**; target is zero un-allowlisted hits, so no new allowlist
  filter should be needed.
- `test/living-corpus.test.js` — **no edit needed**: this part creates no new
  `docs/adapters/*.md` page, and `codex-poc-record.md` is already in `EXPECTED`.
- `intention-lint.js` over the living corpus; `docs-structure-lint.sh`; `prose-lint.js` on
  touched `.md` (note `docs/adr/**`, `docs/design/**`, `docs/archive/**` are exempt but
  `docs/adapters/**` is **NOT**). **Posture, verified on this branch**: `node
  engine/bin/hygiene-gate.js .claude/workflow.md` prints `advisory` and exits **0**, so both
  hygiene lints run advisory — findings print but do not fail the build. **Fix the findings
  anyway by rewriting the prose; do not lean on the posture and do not add waiver markers.**
  The gates that genuinely block this part are `source-hygiene`, `living-corpus`,
  `docs-structure-lint` and `backlog-lint`.

### TDD steps

Docs-first, then the mechanical checks. There are no new assertions to write — every gate this
part must satisfy is an existing suite or lint. That is what makes it docs-only.

**RED 1** — before editing, capture the baseline: run
`cd <wt> && node --test 'test/*.test.js' 2>&1 | tail -20` and confirm green. Any red here is
pre-existing and must be reported as a blocker, not absorbed.

**RED 2** — author the four `Binding set` line edits and the four `## Codex binding` sections.
Run `node --test test/source-hygiene.test.js`. Expect it to go RED **only if** a class-A or
class-B token slipped in; the message names the exact offending line. **GREEN**: rewrite the
prose to avoid the token. Do not add an allowlist filter unless a literal is genuinely
load-bearing — none is expected for this binding.

**RED 3** — run `node engine/bin/intention-lint.js $(bash scripts/living-corpus.sh)`. Expect
green; a failure means a `subjects:` frontmatter scope no longer matches the edited page.
`telemetry.md`'s `subjects: ['engine/src/observability/**']` is the one this change lands
inside — the edit satisfies it rather than breaking it.

**RED 4** — refresh `docs/adapters/codex-poc-record.md`, then re-run
`node --test test/living-corpus.test.js`. Expect green (the file already exists and is already
pinned); a failure means a NEW page was accidentally created — remove it or add it to
`EXPECTED`, but do not duplicate the existing entry.

**RED 5** — edit `README.md` and `BACKLOG.md`, then run
`bash scripts/backlog-lint.sh BACKLOG.md` and `bash scripts/docs-structure-lint.sh docs`.

**GREEN** — all four suites and lints pass.

**REFACTOR** — read the four new per-binding sections back-to-back against the layer table in
this part's Context. The one failure mode that no lint catches is a softened claim: if any
section reads as though containment or execpolicy were guarantees, rewrite it. An honest
carve-out beats a fake guarantee, and the honesty is the deliverable here.

### Gate

```
export PATH="/tmp/craft-codex-stubs:$PATH" && cd /Users/scolladon/workspace/perso/craft-native-codex-binding && bash scripts/ci.sh 2>&1 | tail -40
cd /Users/scolladon/workspace/perso/craft-native-codex-binding && grep -rEn 'stryker|mutmut|mutation|mutant|\bgh\b|\bgithub\b' docs/adapters README.md || echo "clean"
```

### Commit

```
docs(codex): port binding sets, Codex sections, PoC record refresh and adapter listing
```

---

## Part 11 — Extend the consumer-level mutate scope to the adapter guard sources

### Context

**Tooling-config-only part: no `src/` delta, no new feature test.** Legitimately standalone
under the sizing rules, and deliberately **last** so a noisy surviving-mutant triage can never
red a feature part.

**Ship NO `adapters/codex/stryker.conf.json`.** The reframe that settled this: the config is
craft-*the-consumer* declaring its own JavaScript-specific validation technique in
`.claude/workflow.md`, not part of the toolchain-neutral engine contract — a Python consumer
would declare a different technique entirely. So no per-adapter config pattern is invented; a
future non-JS adapter inherits nothing nonsensical.

**`adapters/pi/stryker.conf.json` is an orphan** — no npm script references it, and
`.claude/workflow.md`'s probe is `test -f engine/stryker.conf.json` exclusively. **Do NOT
imitate it and do NOT delete it here** — its cleanup is tracked separately.

**File to edit**: `engine/stryker.conf.json`. Current content:

```json
{
  "testRunner": "tap",
  "coverageAnalysis": "perTest",
  "tap": { "testFiles": ["engine/test/**/*.test.js"] },
  "mutate": ["engine/src/**/*.js"],
  "concurrency": 2,
  "tempDirName": "engine/.stryker-tmp",
  "reporters": ["clear-text", "progress"]
}
```

Paths are **repo-root-relative** because `engine/package.json`'s script is
`"mutation": "cd .. && stryker run engine/stryker.conf.json"`. Keep that convention.

**The trap that makes this part non-trivial**: `mutate` and `tap.testFiles` must be extended
**together**. Adding adapter sources to `mutate` while leaving `testFiles` at
`engine/test/**` means every adapter mutant survives with no covering test, collapsing the
score and producing a triage list of pure noise. Both arrays grow, in the same edit.

**Scope — the guard sources only**, which is what "the security-critical predicate surfaces"
means. `engine/src/guards/tool-call-guard.js` needs no entry: Part 1 moved it under
`engine/src/**`, which is already covered, with its suite already under `engine/test/**`.
What remains uncovered:

| Add to `mutate` | Add to `tap.testFiles` |
|---|---|
| `adapters/codex/src/git-guard-adapter.js` | `adapters/codex/test/*.test.js` |
| `adapters/codex/src/apply-patch-paths.js` | (same) |
| `adapters/codex/src/execpolicy-rules.js` | (same) |
| `adapters/copilot/src/git-guard-adapter.js` | `adapters/copilot/test/*.test.js` |
| `adapters/opencode/src/git-guard-adapter.js` | `adapters/opencode/test/*.test.js` |
| `adapters/opencode/src/git-guard-predicate.js` | (same) |
| `adapters/pi/src/tool-call-hook.js` | `adapters/pi/test/*.test.js` |

List the `mutate` entries **explicitly by path**, never as a broad `adapters/**/src/**/*.js`
glob — a broad glob would pull in `probe.js`, `craft-root.js`, `model-tier-map.js` and every
future adapter source, which is a different and much larger decision than this one.

**Expect surviving mutants and budget for triage.** This is the first executed mutation
coverage any adapter source has ever had, so a non-trivial survivor list is the expected
outcome, not a failure. The established convention for a genuinely-equivalent survivor is an
inline `// equivalent mutant (<description>): <why it cannot diverge>` comment — see
`engine/src/observability/adapters/copilot/telemetry.js` lines 35–38, 50–53, 67–71, 89–93 for
the exact voice. **Kill what can be killed with a real assertion; document only what is
provably equivalent.** Never weaken an assertion to make a mutant disappear.

**Per-hunk scope gotcha, if a targeted re-run is needed**: emit ONE combined
`--mutate "fileA:r1,fileB:r2"` — repeated `--mutate` flags silently drop all but the last,
faking a clean score. Verify the instrumented mutant count is at least the adjacent-hunk count
before trusting a green score.

**Blocker protocol.** If the extended run does not converge in reasonable time (the tap runner
now drives four extra suites), do **not** silently narrow the scope and commit. Raise a
blocker: **unit** = this part; **reason** = the measured runtime or failure; **options** =
(a) keep only the three codex guard sources in scope and park the other four bindings as a
follow-up, (b) raise `concurrency` from 2 and re-measure, (c) keep the full scope and accept a
longer background validation run.

### TDD steps

Config-only; the "tests" are the mutation run itself plus the mechanical shape checks.

**RED 1** — run `cd <wt>/engine && npx --no-install stryker --version` to confirm the runner
resolves. If it does not, the part is blocked before any edit — raise it rather than installing
anything.

**RED 2** — establish the baseline **before** editing: `cd <wt>/engine && npm run mutation
2>&1 | tail -40`. Record the score and the survivor count. Without this number the post-edit
result is uninterpretable.

**RED 3** — extend **both** `mutate` and `tap.testFiles` per the table. Re-run
`npm run mutation 2>&1 | tail -60`. Expected: the adapter guard files now appear in the report,
with a survivor list.

**GREEN** — triage every survivor. For each: either add a real assertion to the owning suite
that kills it, or add an `// equivalent mutant (…)` comment proving it cannot diverge.
**A weakened assertion is never an acceptable fix.** Adding an assertion means editing an
adapter test file — that is expected and is why this part is not purely config.

**RED 4** — a shape check so a future edit cannot silently desynchronise the two arrays: assert
in `engine/test/` (a small new case in an existing suite, or a short standalone
`engine/test/mutation-config.test.js` — the latter is fine, this part is test-infra) that for
every `mutate` entry under `adapters/`, the corresponding `adapters/<binding>/test` glob is
present in `tap.testFiles`. Read `engine/stryker.conf.json` as JSON and derive the binding
segment from each path. **Naming the technique here is fine**: `test/source-hygiene.test.js`'s
scanned set explicitly excludes `engine/test/`, and `engine/stryker.conf.json` is not in it
either. The only naming constraint that applies is the repo-wide no-provenance-refs rule.

**Also update `BACKLOG.md`'s "Mutation-cover the adapter sources" entry (line ~197) in this
commit** — Part 10 deliberately left it open for this part. Its current text prescribes adding
a per-adapter `stryker.conf.json`; the ratified outcome is the **opposite** (no per-adapter
config; extend the consumer-level scope instead). Close it by recording what actually shipped,
not by marking the stale prescription done.

**GREEN** — the shape check passes.

**REFACTOR** — none. Config files do not get refactored; keep the arrays sorted and readable so
the next reader can diff them at a glance.

### Gate

```
cd /Users/scolladon/workspace/perso/craft-native-codex-binding/engine && npm run mutation 2>&1 | tail -60
cd /Users/scolladon/workspace/perso/craft-native-codex-binding/engine && node --test 'test/**/*.test.js' 2>&1 | tail -30
export PATH="/tmp/craft-codex-stubs:$PATH" && cd /Users/scolladon/workspace/perso/craft-native-codex-binding && bash scripts/ci.sh 2>&1 | tail -40
```

### Commit

```
test: extend the consumer mutate scope to the adapter guard sources
```
