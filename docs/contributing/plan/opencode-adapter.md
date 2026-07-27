# Plan — opencode adapter (native opencode binding of the craft harness)

> Source: design doc `docs/design/opencode-adapter.md` · ADRs `215..228`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/property suites, docs/prose) with no `src/` delta ARE standalone.
- A part that would be a pure test pass over already-landed code merges into its neighbour.

## Global context (read once — applies to every part)

- **Working tree**: `/Users/scolladon/workspace/perso/craft-opencode-adapter` (branch
  `feat/opencode-adapter`, baseline green). Work ONLY here; absolute paths.
- **Provenance is one-way** (`test/source-hygiene.test.js`): NO phase/ADR/backlog refs in
  any source or test file you write. This plan/PR carries provenance; the adapter code
  must not. No suppression directives (`@ts-ignore`, `eslint-disable`, coverage-ignore).
  No swallowed errors.
- **Engine-bin shim convention**: engine bins are ~5-line shims over
  `engine/src/<name>-main.js`; ALL logic lives in `engine/src/**` (Stryker mutates
  `engine/src/**` only). Honour for any engine/src touch.
- **Gate commands** (resolved per part):
  - `adapters/opencode/` parts → `cd adapters/opencode && node --test 'test/**/*.test.js'`
  - engine parts → `cd engine && node --test 'test/**/*.test.js'` (== `npm --prefix engine test`)
  - Claude-surface / docs / phase-boundary → `bash scripts/ci.sh`
- **No new CI-level runtime dependency**: only `node` built-ins + `bash`. The `.ts` plugin
  needs Bun/opencode, which is NOT in CI — so all guard *logic* lives in node-tested `.js`
  and the `.ts` is a thin Bun shim proven by an on-demand smoke (design Test strategy).
- **Public-surface note per part**: every NEW exported symbol is decided public-or-internal
  in the part that creates it. The only repo-wide surface here is the engine telemetry
  binding + `usage-mine` front-door (Parts 7–8) and the port docs (Part 14) — enumerated
  in those parts' Context blocks. `adapters/opencode/src/*` exports are package-internal
  (imported only within `adapters/opencode/`); there is no engine barrel or API report.

---

## Part 1 — opencode adapter package scaffold + CI wiring

### Context

Establishes the `adapters/opencode/` package so every later part has a test substrate;
mirrors `adapters/pi/` exactly (ADR-215).

Files to CREATE:
- `adapters/opencode/package.json` — mirror `adapters/pi/package.json` verbatim except the
  name and drop the `bin` block (opencode is declarative, no CLI):
  `{ "name": "@craft/adapter-opencode", "type": "module", "private": true, "scripts": { "test": "node --test 'test/**/*.test.js'" } }`.
- `adapters/opencode/README.md` — install/copy instructions: "copy `adapters/opencode/`
  contents into a target repo's `.opencode/` (commands/, agents/, plugins/, opencode.json)".
  Provider-neutral prose; no ADR/phase refs. (README is docs-prose; keep it short.)
- `adapters/opencode/test/package.test.js` — smoke test asserting the package contract:
  `package.json` parses, `type === "module"`, `scripts.test` is the node --test command,
  `name === "@craft/adapter-opencode"`. Given/When/Then titles, `sut` variable, AAA body
  (mirror the node:test import style in `adapters/pi/test/gate.test.js` — `import { describe, it }`
  / `import assert from 'node:assert/strict'`). This test both satisfies the zero-file rule
  below AND is real coverage of the package manifest.

Files to EDIT (mirror how pi is wired — READ both before editing):
- `scripts/ci.sh` line 52 (`run_suite adapters/pi adapters/pi/test adapters/pi`): add
  immediately after it `run_suite adapters/opencode adapters/opencode/test adapters/opencode`.
  `run_suite` hard-errors on a zero-file suite (lines 22–25), so this line is only valid
  once `test/package.test.js` exists — land them together in this part.
- `test/every-test-file-registers.test.js` — `SUITE_DIRS` array (lines 10–14): add
  `{ label: 'adapters/opencode', dir: path.join(ROOT, 'adapters', 'opencode', 'test') }`.
  This extends the "every test file registers a test" guarantee to opencode tests.

No `stryker.conf.json` in this part (mutation config for `adapters/opencode/src` is a
possible later follow-up, not gate-critical; adding it now with no src would be dead config).

### TDD steps

- RED: write `test/package.test.js` (the four assertions above). Run
  `cd adapters/opencode && node --test 'test/**/*.test.js'` → fails: no `package.json`
  (module resolution / read error).
- GREEN: create `package.json` + `README.md`. Test passes.
- GREEN: wire `scripts/ci.sh` + `every-test-file-registers.test.js`; run `bash scripts/ci.sh`
  → the new `run_suite adapters/opencode` block enumerates ≥1 file and passes; the
  registration meta-test sees the opencode suite and passes.
- REFACTOR: none (config only).

### Gate

`bash scripts/ci.sh`

### Commit

`chore(opencode): scaffold adapter package and wire CI suite`

---

## Part 2 — git-guard pure predicate

### Context

The only mandatory code seam is the git-diff guard (ADR-222/223/224). This part is the
pure predicate, re-expressed from the two existing sources (READ both):
- `hooks/git-no-ext-diff.sh` line 24: `GIT_RE='(^|[;&|]\s*)git(\s+(-C\s+\S+|-c\s+\S+|--git-dir=\S+|--work-tree=\S+))*\s+(diff|show)(\s|$)'`
- `adapters/pi/src/gate.js` lines 10–16: `COMPLIANT_MARKERS = ['--no-ext-diff', 'rtk proxy']`
  and the identical `GIT_DIFF_SHOW_RE`.

CREATE `adapters/opencode/src/git-guard-predicate.js`. Signature per design §D7 — the
opencode plugin extracts the bash command string, so the predicate takes the STRING (not
pi's `event` object):
```
export function gitGuardPredicate(command) -> { block: boolean, reason?: string }
```
Carry `GIT_DIFF_SHOW_RE` and `COMPLIANT_MARKERS` as module constants (re-expressed, single
copy within this binding). Logic mirrors `gate.js#guardBashCommand`: if any COMPLIANT_MARKER
substring present → `{ block: false }`; else if `!GIT_DIFF_SHOW_RE.test(command)` →
`{ block: false }`; else `{ block: true, reason: <message mentioning --no-ext-diff and that
external diff mangles parsed output> }`. Export `GIT_DIFF_SHOW_RE` and `COMPLIANT_MARKERS`
too so Part 3's adapter/test can reference them (package-internal exports).

Public-surface: package-internal (imported by `plugins/git-guard.ts` and Part 3's adapter).
No engine barrel, no API report — nothing to pre-pay beyond this package.

CREATE `adapters/opencode/test/git-guard-predicate.test.js` — table-driven, mirroring the
matrix in `adapters/pi/test/gate.test.js` describe blocks "git diff/show regex pin" +
"reason string content". Pin exactly:
- BLOCK: `git diff`, `git show`, `git diff HEAD~1`, `git show HEAD`, `cd /repo; git diff HEAD`
  (post-`;`), global-opt forms `git -C /x diff`, `git -c k=v show`, `git --git-dir=.g diff`,
  `git --work-tree=. show`.
- PASS: `git diff --no-ext-diff HEAD~1`, `git --no-ext-diff show HEAD`, `rtk proxy git diff`,
  `git difftool`, `git show-ref`, `git stash show`, `ls -la`, empty string.
- Property lens: any command containing `--no-ext-diff` never blocks; any bare `git diff`/
  `git show` (no compliant marker) always blocks; the reason mentions `--no-ext-diff`.

### TDD steps

- RED: write the table-driven test. Run adapters/opencode suite → fails (no module).
- GREEN: implement `git-guard-predicate.js`. Test passes.
- REFACTOR: extract the reason string to a named const; keep functions <20 lines, early returns.

### Gate

`cd adapters/opencode && node --test 'test/**/*.test.js'`

### Commit

`feat(opencode): git-guard predicate mirrored from bash/pi matrix`

---

## Part 3 — git-guard plugin wiring (JS adapter + thin `.ts` shim)

### Context

Wire the predicate into opencode's `tool.execute.before` (ADR-222). The exact tool-input
field carrying the bash command is DEFERRED to live smoke (design §D9 row 24), so the
event→command extraction reads candidate fields with fallbacks (mirroring how
`adapters/pi/src/tool-call-hook.js#adaptPiEvent` does `event.input ?? event.arguments`).
Keep all decidable logic in node-testable `.js`; the `.ts` is a ~5-line Bun shim (no CI
runtime for it — design Test strategy).

CREATE `adapters/opencode/src/git-guard-adapter.js` (pure, node-testable):
- `export function commandFromToolEvent(input) -> string` — extract the bash command from
  opencode's `tool.execute.before` first arg. Candidate access chain (frozen against the
  DEFERRED shape, to be re-pinned live): `input?.args?.command ?? input?.tool?.args?.command
  ?? input?.command ?? ''`. Return `''` when absent (safe: empty never blocks).
- `export function decideGuard(input, guard = gitGuardPredicate) -> { block, reason? }` —
  compose `commandFromToolEvent` + the Part 2 predicate. Import `gitGuardPredicate` from
  `./git-guard-predicate.js`.

CREATE `adapters/opencode/plugins/git-guard.ts` — the thin Bun plugin. Signature pinned by
design §D9 row 12: `export const GitGuardPlugin = async ({ project, client, $, directory,
worktree }) => ({ hooks: { 'tool.execute.before': async (input, output) => { const v =
decideGuard(input); if (v.block) throw new Error(v.reason); } } })`. It imports the `.js`
adapter+predicate (Bun/TS import `.js` transparently — single-sourced within the binding).
`.before` THROWS to block (design §D9 row 13). Keep it minimal; no logic beyond the throw.
Add a top-of-file comment: runtime-proven by the on-demand plugin smoke (see Part 15's
poc-record D-row 24), not by CI.

Public-surface: both `.js` exports are package-internal; `GitGuardPlugin` is the opencode
entrypoint referenced by `opencode.json` `plugin[]` (Part 12) — that reference is the only
downstream surface, pre-paid there.

CREATE `adapters/opencode/test/git-guard-adapter.test.js`:
- `commandFromToolEvent`: extracts from `{ args: { command } }`, from `{ tool: { args:
  { command } } }`, from `{ command }`, and returns `''` for `{}` / `undefined`.
- `decideGuard`: given `{ args: { command: 'git diff' } }` → `{ block: true }` with a
  reason; given `{ args: { command: 'git diff --no-ext-diff' } }` → `{ block: false }`;
  given `{}` → `{ block: false }`. Optionally inject a spy `guard` to assert delegation.
The `.ts` throw path is NOT unit-tested in CI (no Bun); it is a documented on-demand smoke.

### TDD steps

- RED: write `git-guard-adapter.test.js`. Run adapters/opencode suite → fails (no module).
- GREEN: implement `git-guard-adapter.js`. Test passes.
- GREEN: add `plugins/git-guard.ts` (thin shim over the tested adapter). No CI assertion on
  the `.ts` — its logic is the tested adapter; the throw is smoke-verified.
- REFACTOR: dedupe the candidate-field chain into a small helper if it reads clearer.

### Gate

`cd adapters/opencode && node --test 'test/**/*.test.js'`

### Commit

`feat(opencode): git-guard plugin wiring over the pure predicate`

---

## Part 4 — CRAFT_ROOT resolver

### Context

The opencode plugin must export a `CRAFT_ROOT` computed from its plugin context
(`directory`/`worktree`, design §D9 row 12). The resolver logic is a pure unit-tested seam
(ADR-217 consequence; design §D3 close). This part is that resolver only; the shim rewrite
that CONSUMES `CRAFT_ROOT` is Part 5, and the plugin export mechanism is a live item (D-row 30).

CREATE `adapters/opencode/src/craft-root.js`:
```
export function resolveCraftRoot(ctx, fsOps = { realpathSync, existsSync }) -> string
```
- `ctx` = the opencode plugin context stub `{ worktree?, directory? }`. Prefer `worktree`,
  fall back to `directory`. Compute an ABSOLUTE, EXISTING, containment-checked root:
  `resolve()` the chosen path; assert it is absolute; verify it exists via injected
  `existsSync`; return its `realpathSync`. Inject `fsOps` (default node `fs`) so tests run
  without touching the real FS — mirror the injected-`fsOps`/`mktemp` discipline in
  `adapters/pi/src/probe.js`.
- Failure contract (fail-loud, no swallow): a missing/non-absolute/empty context path throws
  an Error naming the offending value (the plugin surfaces it; the engine never reads
  CRAFT_ROOT — §D3 "the seam is entirely a binding-surface concern").

Public-surface: package-internal (consumed by `plugins/git-guard.ts`'s env export in a later
live-smoke iteration; not an engine symbol).

CREATE `adapters/opencode/test/craft-root.test.js` (inject fsOps stubs):
- `{ worktree: '/repo' }` (exists) → `/repo` (realpath'd); `worktree` wins over `directory`.
- `{ directory: '/repo' }` (no worktree) → `/repo`.
- relative or empty path → throws.
- non-existent path (injected `existsSync` false) → throws.
- Given a realpath that differs (symlink), asserts the realpath is returned.

### TDD steps

- RED: write `craft-root.test.js` with injected fsOps. Run suite → fails (no module).
- GREEN: implement `craft-root.js` with injected `fsOps`, early returns, named errors.
- REFACTOR: extract the pick-`worktree`-or-`directory` step to a tiny helper if clearer.

### Gate

`cd adapters/opencode && node --test 'test/**/*.test.js'`

### Commit

`feat(opencode): CRAFT_ROOT resolver from plugin context`

---

## Part 5 — CRAFT_ROOT shim rewrite across the Claude binding surface

### Context

Rewrite the operational `${CLAUDE_PLUGIN_ROOT}` path invocations to the binding-neutral shim
`${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` (ADR-217, option a — ratified). Behaviour-preserving
for Claude: `CRAFT_ROOT` is unset under Claude so bash default-expansion yields
`CLAUDE_PLUGIN_ROOT` (still set by Claude). Touches ONLY the Claude binding surface
(`skills/` + `hooks/`) — never `engine/`, `contracts/`, `pipeline/`, `templates/` (R-SC2's
protected set). Engine self-locates via `import.meta.url` (0 references).

EXACT rewrite targets — **34 path-invocation occurrences** (`${CLAUDE_PLUGIN_ROOT}/…`) across
**15 files**. Rewrite every `${CLAUDE_PLUGIN_ROOT}/` → `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/`
in these files (counts pinned by `grep -rc '\${CLAUDE_PLUGIN_ROOT}/'`):
- `hooks/hooks.json` (1) — the `"command"` string, run through a shell so bash default-expansion applies.
- `skills/decisions/SKILL.md` (1), `skills/design/SKILL.md` (1), `skills/documentation/SKILL.md` (1),
  `skills/init/SKILL.md` (5), `skills/integrate/SKILL.md` (1), `skills/metrics/SKILL.md` (2),
  `skills/planning/SKILL.md` (2), `skills/promote-config/SKILL.md` (4), `skills/requirements/SKILL.md` (1),
  `skills/review/SKILL.md` (1), `skills/run/SKILL.md` (6), `skills/tune/SKILL.md` (5),
  `skills/validation/SKILL.md` (1), `skills/workspace/SKILL.md` (2).

**Do NOT rewrite the 3 non-path prose mentions** (they are not invocations):
- `skills/metrics/SKILL.md:29` `Confirm \`${CLAUDE_PLUGIN_ROOT}\` is set…`
- `skills/metrics/SKILL.md:128` `…check CLAUDE_PLUGIN_ROOT` (bare word, no `${}`)
- `skills/run/SKILL.md:80` `…at the repo ROOT (… NEVER \`${CLAUDE_PLUGIN_ROOT}\`…)` — this is a
  repo-local-state instruction; rewriting it would be wrong (ADR-225).

No existing test references `CLAUDE_PLUGIN_ROOT` (`grep -rn CLAUDE_PLUGIN_ROOT test/ engine/test/`
returns nothing) and `test/hooks.test.js` only runs `hooks/git-no-ext-diff.sh` (which has 0
references) — so no existing test breaks. `git-no-ext-diff.sh` is unchanged (shellcheck stays green).

CREATE `test/craft-root-shim.test.js` (repo-root "process" suite — enumerated by ci.sh's
`run_suite process test` and by `every-test-file-registers`). Use CommonJS `require` like the
sibling `test/hooks.test.js`. Assertions:
- **grep-gate**: for each of the 15 files, read it and assert every `${CLAUDE_PLUGIN_ROOT}/`
  occurrence is immediately preceded by `${CRAFT_ROOT:-` (i.e. is inside the shim). Equivalent:
  a regex `/\$\{CLAUDE_PLUGIN_ROOT\}\//` never matches OUTSIDE `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/`.
- **prose preserved**: assert the 3 excluded mentions are still present verbatim (untouched).
- **bash expansion** (via `child_process.execFileSync('bash', ['-c', ...])`, throwaway env,
  never the worktree): `CRAFT_ROOT` unset + `CLAUDE_PLUGIN_ROOT=/x` → `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}`
  expands to `/x` (Claude behaviour preserved); `CRAFT_ROOT=/y CLAUDE_PLUGIN_ROOT=/x` → `/y`
  (opencode override wins).

Public-surface: none (text rewrites + one process-suite test).

### TDD steps

- RED: write `test/craft-root-shim.test.js`. Run `node --test test/craft-root-shim.test.js`
  → fails: files still contain bare `${CLAUDE_PLUGIN_ROOT}/` invocations.
- GREEN: rewrite the 34 path invocations across the 15 files (leave the 3 prose mentions).
  Test passes.
- REFACTOR: none (mechanical rewrite).

### Gate

`bash scripts/ci.sh`

### Commit

`refactor(opencode): CRAFT_ROOT shim over plugin-root on the Claude surface`

---

## Part 6 — model tier map

### Context

Committed default `opus|sonnet|haiku → anthropic/<sku>` map (ADR-221), the single home of the
tier→SKU table, unit-tested (R-SC4). `.claude/workflow.md` stays provider-neutral (tier
strings only); the tier→`provider/model` mapping is opencode-binding-local.

CREATE `adapters/opencode/src/model-tier-map.js`:
```
export const DEFAULT_TIER_MODELS = Object.freeze({
  opus:   'anthropic/claude-opus-4-8',
  sonnet: 'anthropic/claude-sonnet-4-6',
  haiku:  'anthropic/claude-haiku-4-5',
});
export function resolveOpencodeModel(tier, overrides = {}) -> string
```
- **SKU strings**: `anthropic/<current-anthropic-sku>` for each tier. The exact SKUs are the
  implementer's call, confirmed at implementation time against opencode's anthropic provider
  catalog AND the `claude-api` skill (current ids: opus `claude-opus-4-8`, sonnet
  `claude-sonnet-4-6`/`claude-sonnet-5`, haiku `claude-haiku-4-5`). They MUST be byte-identical
  to the `model:` frontmatter pins landed in Part 10 (the two express the same map — design §D8).
- Precedence (design §D8): explicit `overrides[tier]` (from `opencode.json` `agent.<role>.model`
  or manifest `models.<role>`) wins over `DEFAULT_TIER_MODELS[tier]`. Unknown tier with no
  override → throw a named Error (fail-loud; a tier resolving to no provider is a runtime
  blocker per model.md, not a silent pass).

Public-surface: package-internal (consumed by opencode config authoring + tests). No engine
symbol. Downstream surface = the Part 10 frontmatter pins (kept in sync, noted above).

CREATE `adapters/opencode/test/model-tier-map.test.js` (table-driven, `sut` = resolveOpencodeModel):
- each of `opus|sonnet|haiku` (no overrides) → the DEFAULT_TIER_MODELS value.
- override precedence: `resolveOpencodeModel('sonnet', { sonnet: 'google/gemini-2.5-flash' })`
  → the override (proves provider-agnostic swap — the pi-Gemini precedent, R-G5).
- unknown tier (e.g. `'mega'`) with no override → throws.
- `DEFAULT_TIER_MODELS` is frozen (mutation attempt does not change it).

### TDD steps

- RED: write the table-driven test. Run suite → fails (no module).
- GREEN: implement `model-tier-map.js` with the default table + precedence + fail-loud.
- REFACTOR: keep `resolveOpencodeModel` <20 lines, early returns, no boolean params.

### Gate

`cd adapters/opencode && node --test 'test/**/*.test.js'`

### Commit

`feat(opencode): tier→provider/model map, anthropic default, swappable`

---

## Part 7 — opencode telemetry collect binding (engine sibling)

### Context

Additive telemetry `collect` binding at `engine/src/observability/adapters/opencode/telemetry.js`
(ADR-227 — the one exception to the top-level-adapters rule; the claude binding is the
sibling at `engine/src/observability/adapters/claude/telemetry.js`). Reuses the pure
`aggregate` + `serializeReport` core UNCHANGED. This is an ENGINE part (gate the engine suite).

READ `engine/src/observability/adapters/claude/telemetry.js` for the exact `UsageEvent` shape
and the `parseLines(lines, since)` contract to mirror:
- `UsageEvent` fields: `run`, `slug?`, `phase`, `role?`, `model`, `tokens{input, cacheRead,
  cacheCreation, output}`, `messages`, `durationMs`, `cacheCreationTtl?`.
- `parseLines(lines, since=null) -> { events, skipped, markers }`: async-iterates raw lines,
  `JSON.parse` per non-empty trimmed line, malformed lines `skipped++` and skipped,
  synthetic/zero-cost rollups excluded (return null), `--since` timestamp filter (internal
  only, never emitted). Redaction = positive whitelist (ONLY the whitelisted fields; no paths,
  `$HOME`, usernames, prompt/response text).

CREATE `engine/src/observability/adapters/opencode/telemetry.js`:
- `export async function parseLines(lines, since = null) -> { events, skipped, markers }`
  mapping `opencode run --format json` events → `UsageEvent[]`, same skip/redaction discipline
  as the claude binding. The exact opencode event schema (which fields carry tokens/model/
  duration/role/session) is DEFERRED (design §D9 row 25) — map against FROZEN synthetic
  fixtures, re-pinned live. Reuse the claude binding's `numOrZero` coercion pattern and
  `ROLE_TO_PHASE`-style role→phase mapping (the 9 craft roles → phases as in the claude
  binding's `ROLE_TO_PHASE`). Keep `markers` as `[]` unless the opencode format carries
  auto-skip tokens (defer — return `[]` for now).

Public-surface: **engine-public** (a `collect` binding under the telemetry-port home). Its
sole downstream consumer is the `usage-mine` front-door selector (Part 8), which imports it
directly (same as the claude binding is imported directly today — no engine barrel). The
telemetry.md doc "Binding set" surface is updated in Part 8 (where `--source opencode` is wired).

CREATE FROZEN fixtures `engine/test/fixtures/opencode/*.jsonl` (or inline in the test) — one
synthetic `opencode run --format json` event per line, covering: a valid rollup (tokens+model+
role+duration), a malformed line, a synthetic/zero-cost rollup, a line to be dropped by `--since`.

CREATE `engine/test/opencode-telemetry.test.js` (mirror the structure of the claude parseLines
tests; `import { test } from 'node:test'`, `import assert from 'node:assert/strict'`):
- valid events → `UsageEvent[]` with correct field mapping + role→phase.
- malformed line → skipped, counted in `skipped`; surrounding lines unaffected.
- synthetic/zero-cost rollup → excluded.
- redaction: no path/`$HOME`/username/prompt keys appear on any emitted event (whitelist-only).
- `--since` filter drops the pre-cutoff line.
- **report byte-match** (folds in here — exercises this binding feeding the reused core):
  `import { aggregate, serializeReport } from '../src/observability/usage-aggregate.js'`; feed
  the opencode `UsageEvent[]` → `aggregate` → `serializeReport`; assert the output is a
  deep-sorted, 2-space-indented, single-trailing-newline JSON string byte-identical in SCHEMA
  to the claude path (same top-level keys/order; assert `serializeReport` round-trip equals
  `JSON.stringify(sortDeep(report), null, 2) + '\n'` shape — use a small fixed report to pin bytes).

### TDD steps

- RED: write `opencode-telemetry.test.js` + fixtures. Run `cd engine && node --test 'test/**/*.test.js'`
  → fails (no module).
- GREEN: implement `adapters/opencode/telemetry.js#parseLines`. Parse/skip/redaction tests pass.
- GREEN: add the report byte-match assertion (import the unchanged `aggregate`/`serializeReport`).
- REFACTOR: extract token-mapping + role-mapping helpers; keep functions small, no swallow.

### Gate

`cd engine && node --test 'test/**/*.test.js'`

### Commit

`feat(observability): opencode telemetry collect binding + report byte-match`

---

## Part 8 — usage-mine `--source claude|opencode` selector + telemetry.md binding

### Context

Add a generic `--source claude|opencode` selector to the `usage-mine` front-door (ADR-227 —
the one additive, generic engine/src touch), routing to the right `collect` binding. This is
an ENGINE part. Builds on Part 7's binding.

READ `engine/src/observability/usage-mine-main.js` (the front-door):
- `parseArgs(argv)` returns `{ dir, baseline, since, pricesFile, includeInline, threshold }`
  via a `switch` over flags (lines 49–81). `parseLines` is imported hard-wired from
  `./adapters/claude/telemetry.js` (line 27) and called inside `streamTranscriptFiles`
  (line 116). `main(argv, io)` currently always returns `EXIT_OK` (0) — advisory.
- The bin `engine/bin/usage-mine.js` is the ~5-line shim calling `main` and `process.exit`.

EDIT `engine/src/observability/usage-mine-main.js`:
- `parseArgs`: add `case '--source': parsed.source = argv[++i] ?? null; break;` and default
  `source: null` in the initial object.
- Add a validated selector: `const SOURCES = { claude: claudeParseLines, opencode:
  opencodeParseLines }` (import both bindings). Resolve `const source = parsed.source ?? 'claude'`;
  if `source` is not a key of `SOURCES` → write a targeted message to `stderr` and return a
  NON-ZERO exit (config error before I/O, matching telemetry.md "Config errors … non-zero exit
  before any I/O begins"). This is the one deliberate change to the "always 0" contract — for
  an unknown/unbuilt source only; the default (claude) and all existing advisory paths keep
  exit 0. Update the module-header/JSDoc note on `main`'s return to reflect the startup-validation
  exit.
- Thread the selected parser into `streamTranscriptFiles` as a parameter (replace the hard-wired
  import call). `.jsonl` line-file discovery stays generic (both bindings consume line streams);
  only the per-line mapping differs by binding. The opencode-specific transcript-dir/root
  default is DEFERRED (design §D9 row 25) — out of scope here; the selector routes the parser,
  the dir is still resolved as today via `--dir`.

EDIT existing engine test `engine/test/usage-mine-main.test.js` (extend, don't replace):
- default (no `--source`) routes to the claude binding — assert existing behaviour unchanged
  (exit 0 on the existing fixtures).
- `--source opencode --dir <fixtureDir>` routes to the opencode binding — feed a fixture dir of
  `.jsonl` files in the opencode event format (reuse Part 7's frozen fixtures) and assert the
  emitted report reflects opencode-parsed events.
- unknown `--source bogus` → non-zero exit + stderr message; NO report write attempted before
  the rejection.
Optionally extend `engine/test/usage-mine.bin.test.js` with a `--source` smoke if cheap.

EDIT `docs/adapters/telemetry.md` (the telemetry-port doc surface the Part 7 export owes):
- Change "Binding set" (line 34) from `{ claude, pi }` to `{ claude, pi, opencode }`.
- Replace the "Pi binding RESERVED / validator rejects `source: pi` / only claude valid"
  wording (lines 53–66) so it documents opencode as a REAL binding: add a short "## opencode
  binding" section (the `opencode run --format json` collect binding, same `UsageEvent` shape,
  reused `aggregate`/`serializeReport`, whitelist redaction, schema DEFERRED to live smoke),
  and update the failure/validator note so `--source` accepts `claude|opencode` (unknown →
  non-zero at startup). Keep pi documented as reserved. Keep the doc's `subjects:` frontmatter.
  This keeps `docs-structure-lint`/intention-lint green (docs/adapters/*.md is in the living corpus).

### TDD steps

- RED: extend `usage-mine-main.test.js` with the three routing/validation cases. Run engine
  suite → fails (no `--source` handling; opencode route unimplemented).
- GREEN: add `--source` to `parseArgs`, the `SOURCES` selector + validation, thread the parser
  into `streamTranscriptFiles`. Tests pass; existing default-path tests stay green.
- GREEN: update `docs/adapters/telemetry.md` (Binding set + opencode section + validator note).
- REFACTOR: keep the selector a small pure lookup; no boolean params; named error message.

### Gate

`cd engine && node --test 'test/**/*.test.js'` then `bash scripts/ci.sh` (for the telemetry.md
intention/structure lints)

### Commit

`feat(observability): --source claude|opencode front-door selector`

---

## Part 9 — contract-equivalence opencode zero-line-diff assertion

### Context

Prove R-SC5/R-G6 mechanically: the opencode subagent binding REUSES agent-mode assembly, so
its assembled block is byte-identical to the Claude-binding block for the same phase+mode
(ADR-220, zero-line diff — no `contract.js` touch, R-G1). This is a test-infra-only extension
to an engine test with NO `src/` delta (contract.js is deliberately untouched) — legitimately
standalone. ENGINE part.

READ `engine/test/contract-equivalence.test.js` (the harness to extend) and
`engine/src/contract.js`:
- `assembleContract(descriptor, manifest, fragments, opts)` — `opts.execution` is `'agent'`
  or `'inline'`; there is NO `--binding`/runtime param. `AGENT_VARIANTS` carry two binding-
  neutral carve-out lines (`the agent commit is the handoff…`, `the role model resolved from
  manifest→agent-pin→fallback`). The existing test already asserts agent-vs-inline differ by
  exactly 2 lines and enumerates markers via `FRAGMENTS`, `DESCRIPTORS` (from `parsePipeline`),
  `diffLines`, `linesOf`.

EXTEND `engine/test/contract-equivalence.test.js` (add a per-descriptor test block — reuse the
existing `FRAGMENTS`, `DESCRIPTORS`, `assembleContract`, `diffLines`):
- For each descriptor: "Given the opencode binding, when it assembles a phase, then its block
  is byte-identical to the Claude-binding agent-mode block" — assert
  `diffLines(assembleContract(descriptor, {}, FRAGMENTS, { execution: 'agent' }),
  assembleContract(descriptor, {}, FRAGMENTS, { execution: 'agent' }))` is `length === 0`
  (both bindings call the SAME function with the SAME args — the opencode binding adds no
  variant; zero-line diff is the fidelity statement).
- Assert the two carve-out lines are the ONLY binding-nameable slots: reuse the existing
  agent-vs-inline diff to confirm the diff set ⊆ the two carve-out lines (re-anchor the
  existing assertion under the opencode-SC name so a future `OPENCODE_VARIANTS` regression
  trips this test).

Public-surface: none (test-only; asserts an invariant of untouched engine code).

### TDD steps

- RED: add the opencode-binding assertions. If contract.js were accidentally forked with an
  opencode variant, this fails; against the intended zero-variant design it may pass on first
  write — that is acceptable for a pinning/property assertion over reused code (Sizing-rules
  exception: harness/property suite, no src delta). Confirm it FAILS if you temporarily inject
  a fake opencode variant, then remove the injection.
- GREEN: with contract.js untouched, the assertions hold.
- REFACTOR: fold shared setup into the existing helpers; no duplication.

### Gate

`cd engine && node --test 'test/**/*.test.js'`

### Commit

`test(contract): opencode binding reuses agent carve-out (zero-line diff)`

---

## Part 10 — opencode subagent definitions (9 roles)

### Context

Nine `agents/craft-<role>.md` subagent defs (ADR-218/219): `mode: subagent`,
`model: anthropic/<sku>` per the tier map (Part 6), a `permission:` map, `description` drives
dispatch, `hidden` where appropriate. Config part; validated by a frontmatter test (gate the
adapters/opencode suite).

READ the source agent bodies + tiers in `agents/*.md` (reuse each body; the tier per role,
pinned by `grep -m1 '^model:'`):
| role | tier → opencode `model:` |
|---|---|
| designer | opus → `anthropic/claude-opus-4-8` |
| planner | opus → `anthropic/claude-opus-4-8` |
| reviewer | opus → `anthropic/claude-opus-4-8` |
| requirements-writer | opus → `anthropic/claude-opus-4-8` |
| part-implementer | sonnet → `anthropic/claude-sonnet-4-6` |
| harness-triager | sonnet → `anthropic/claude-sonnet-4-6` |
| docs-writer | sonnet → `anthropic/claude-sonnet-4-6` |
| refactor-executor | sonnet → `anthropic/claude-sonnet-4-6` |
| backlog-ticker | haiku → `anthropic/claude-haiku-4-5` |

**SKU strings MUST be byte-identical to Part 6's `DEFAULT_TIER_MODELS`** (design §D8 — the
frontmatter pin and the pure map express the same table; a mismatch is a fidelity bug). If
Part 6 adjusted the exact SKUs, mirror them here.

CREATE `adapters/opencode/agents/craft-<role>.md` for all 9 roles. opencode agent frontmatter
(pinned design §D9 row 6): `description` (required — reuse the source agent's `description`),
`mode: subagent`, `model: anthropic/<sku>`, a `permission:` map (grant the tools the role
needs — e.g. `bash`, `edit`, `read`, `grep`; deny what it must not; keep least-privilege). The
body = the reused role body from `agents/<role>.md` (provider-neutral; NO provenance refs).

Public-surface: these files are the opencode subagent surface; the only downstream reference is
`opencode.json` `agent.<role>` wiring (Part 12), pre-paid there.

CREATE `adapters/opencode/test/agents.test.js` (parse the 9 files' YAML frontmatter — a small
front-matter splitter over the `---\n…\n---` block; no yaml dep, split on the fence and read
`key: value` lines):
- all 9 expected role files exist.
- each has a non-empty `description`, `mode: subagent`, and a `model:` value.
- each `model:` equals the tier map value for that role — import `DEFAULT_TIER_MODELS` /
  `resolveOpencodeModel` from `../src/model-tier-map.js` and assert consistency (this is the
  mechanical guard that the two expressions of the map stay in sync).
- each file body carries no `${CLAUDE_PLUGIN_ROOT}`-style Claude token and no phase/ADR/backlog
  ref (provenance hygiene within the fixture).

### TDD steps

- RED: write `agents.test.js`. Run suite → fails (no agent files).
- GREEN: author the 9 `craft-<role>.md` files (frontmatter + reused body). Test passes;
  model-consistency assertion ties them to Part 6.
- REFACTOR: factor the frontmatter parse helper in the test; keep it small.

### Gate

`cd adapters/opencode && node --test 'test/**/*.test.js'`

### Commit

`feat(opencode): craft subagent definitions for the 9 roles`

---

## Part 11 — opencode command dispatchers

### Context

Thin `commands/craft-<phase>.md` dispatchers (ADR-216) for at least `run`, `review`,
`validation`, `init` (R-SC6). Each carries `$ARGUMENTS`, dispatches via `` !`…CRAFT_ROOT…` ``
shell injection, invariant procedure single-sourced (never re-authored). Config part; gate
the adapters/opencode suite.

READ design §D9 rows 8–10 for command frontmatter + templating:
- Command frontmatter: `description` (required), optional `agent`, `model`, `subtask`(bool).
  `/craft:run` MUST run as a PRIMARY agent (not `subtask: true`) so role spawns stay at depth 1
  (ADR-219).
- Body = prompt template; templating tokens `$ARGUMENTS`, `$1`,`$2`…; shell injection
  `` !`cmd` `` (runs in project root, output inlined). The dispatch invokes the engine via
  `` !`node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/…"` `` (the shim from Part 5).

CREATE `adapters/opencode/commands/craft-run.md`, `craft-review.md`, `craft-validation.md`,
`craft-init.md` (the R-SC6 mandatory set). Each:
- frontmatter `description:` (required); `craft-run.md` must NOT set `subtask: true`.
- body carries `$ARGUMENTS` and dispatches through the CRAFT_ROOT shim; flags
  (`--profile`/`--skip`/`--config`/`--harness`/`--policy`) parse identically to the Claude
  binding (pass `$ARGUMENTS` through — the engine parses them). Provider-neutral; no provenance.
Additional phase commands may be added the same way if cheap, but the 4 above are the required
deliverable for this part.

Public-surface: the opencode command surface; downstream reference is `opencode.json`
`command.<name>` (Part 12), pre-paid there.

CREATE `adapters/opencode/test/commands.test.js`:
- the 4 mandatory command files exist.
- each has a non-empty `description` frontmatter.
- each body contains `$ARGUMENTS`.
- each body references `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` in its dispatch (proves the shim
  is used, not a bare plugin-root or a re-expressed root).
- `craft-run.md` frontmatter does NOT set `subtask: true` (primary-mode invariant, ADR-219).
- no provenance refs in any command body.

### TDD steps

- RED: write `commands.test.js`. Run suite → fails (no command files).
- GREEN: author the 4 dispatchers. Test passes.
- REFACTOR: factor a shared dispatch snippet if the four bodies duplicate it; keep single-sourced.

### Gate

`cd adapters/opencode && node --test 'test/**/*.test.js'`

### Commit

`feat(opencode): thin command dispatchers (run/review/validation/init)`

---

## Part 12 — opencode.json config template + provider-neutral workflow manifest

### Context

The two install-time config artifacts (ADR-221/225/219). Config part; gate the adapters/opencode
suite. Merged into one part (both are small install templates, one validation test).

READ `adapters/pi/.claude/workflow.md` (the provider-neutral manifest precedent):
```
---
gates:
  phase: "node --test"
---
# craft-… manifest (policy rationale in prose body — never reaches YAML parser)
```

CREATE `adapters/opencode/opencode.json` — config template (pinned keys, design §D9 row 15):
- `"$schema": "https://opencode.ai/config.json"`.
- `"subagent_depth": 1` (ADR-219 floor).
- `"agent"`: map the 9 `craft-<role>` agents (or rely on `agents/` dir discovery + per-agent
  overrides here); `"command"`: the exposed commands; `"permission"`: a map including
  `task`/`bash` (the git-guard covers `bash` diff-mangle; least-privilege elsewhere);
  `"plugin"`: `["./plugins/git-guard.ts"]` (references Part 3's `GitGuardPlugin`);
  `"instructions"`: paths/globs the binding should load.

CREATE `adapters/opencode/.claude/workflow.md` — provider-neutral manifest fixture mirroring
pi's: YAML frontmatter with `gates.phase: "node --test"`; `models.<role>` (if present) carries
TIER strings only (`opus|sonnet|haiku`), NEVER `provider/model` (ADR-221 — the manifest stays
portable across bindings). Prose body carries rationale (never reaches the YAML parser). No
provenance refs.

Public-surface: `opencode.json` is the opencode config entrypoint; `.claude/workflow.md` is
repo-local engine state read by the engine at repo root (ADR-225). Neither is an engine symbol.

CREATE `adapters/opencode/test/config.test.js`:
- `opencode.json` parses as JSON; has `$schema`; `subagent_depth === 1`; `plugin` array
  includes the `git-guard.ts` path; `permission` has `task` and `bash` keys; `instructions`
  present.
- `.claude/workflow.md` frontmatter parses; `gates.phase` present; any `models.<role>` value
  is a bare tier string in `{opus,sonnet,haiku}` — assert NO value contains `/` (would be a
  `provider/model` leak, violating provider-neutrality).

### TDD steps

- RED: write `config.test.js`. Run suite → fails (no config files).
- GREEN: author `opencode.json` + `.claude/workflow.md`. Tests pass.
- REFACTOR: none (config); keep the workflow manifest minimal.

### Gate

`cd adapters/opencode && node --test 'test/**/*.test.js'`

### Commit

`feat(opencode): opencode.json config template and provider-neutral manifest`

---

## Part 13 — acceptance-probe harness (deterministic seams)

### Context

Mirror `adapters/pi/src/probe.js#runAcceptanceProbe` so the structural assertions
(`gateGreenBeforeCommit`, `committedArtifact`, `mutationsInsideThrowaway`) are unit-testable
WITHOUT a live opencode (ADR-226/228; design Test strategy). Injected runner + `fsOps.mktemp`;
the whole probe runs in a `mktemp` throwaway (state-mutating-probe rule — never the worktree).

READ `adapters/pi/src/probe.js` (the shape to mirror) and `adapters/pi/test/probe.test.js`:
- `runAcceptanceProbe({ runner, fsOps })` → `{ passed, evidence }`; `fsOps.mktemp()` yields
  the throwaway; `runner({ phaseId, modelTier, workingDir })` returns a run-trace; helpers
  `assertGateGreenBeforeCommit(trace)`, `assertCommittedArtifact(trace)`,
  `assertMutationsInsideThrowaway(mutatedPaths, throwawayPath)`, `evaluateTrace`, `buildEvidence`.
  `PHASE_ID='implementation'`, `MODEL_TIER='sonnet'`, `PORTS_EXERCISED=['Execution','Model','Gate','VCS']`.

CREATE `adapters/opencode/src/probe.js` — the opencode analog:
- `export async function runAcceptanceProbe({ opencodeRunner, fsOps }) -> { passed, evidence }`.
- Same structural assertions as pi (drive ONE construction-bearing phase end-to-end: gate green
  before commit, mutations confined to the throwaway, committed artifact = handoff — ADR-228).
- `buildEvidence` carries `targetPath`, `opencodeVersion`, `model`, `portsExercised`, `phases`.
- Injected `opencodeRunner` (shells to a real `opencode` in the on-demand smoke) + `fsOps.mktemp`.
  Provider may be non-Anthropic (R-G5).

Public-surface: package-internal (entrypoint for the on-demand live smoke; not CI-gated,
not an engine symbol).

CREATE `adapters/opencode/test/probe.test.js` (mirror `adapters/pi/test/probe.test.js` — inject
a fake `opencodeRunner` returning a synthetic trace + a fake `fsOps.mktemp`):
- passing trace (gate green before commit, committed artifact non-empty, mutations inside the
  throwaway) → `{ passed: true }` with evidence carrying targetPath/version/model/portsExercised.
- red gate → `{ passed: false }`.
- mutation outside the throwaway path → `{ passed: false }`.
- missing/empty committed artifact → `{ passed: false }`.

### TDD steps

- RED: write `probe.test.js` with injected fakes. Run suite → fails (no module).
- GREEN: implement `probe.js` (structural asserts + evidence builder), injected deps.
- REFACTOR: keep each assertion helper single-purpose; no live opencode reachable from tests.

### Gate

`cd adapters/opencode && node --test 'test/**/*.test.js'`

### Commit

`feat(opencode): acceptance-probe harness with injected runner`

---

## Part 14 — Execution & Model port opencode-binding doc sections

### Context

Grow the Execution and Model port specs to `Binding set = { claude, pi, opencode }` and append
an opencode binding section to each (design §D4). Docs-only part; gate `bash scripts/ci.sh`
(docs/adapters/*.md is in the intention-lint living corpus via `scripts/living-corpus.sh`;
`docs-structure-lint` also runs). Mirror the shape of the existing Pi sections.

READ `docs/adapters/execution.md` (Binding set line 44; Pi binding section 60–76; Failure→blocker
78–99) and `docs/adapters/model.md` (Binding set line 36; Pi binding 48–58; Failure→blocker 59+).

EDIT `docs/adapters/execution.md`:
- "Binding set" → `{ claude, pi, opencode }`.
- Append "## opencode binding" (design §D4 content): `spawn(role, ctx)` dispatches the opencode
  subagent `craft:<role>` (`agents/craft-<role>.md`, `mode: subagent`) via the task tool /
  `@craft-<role>`, gated by `permission.task`; prepend `ctx.injectedBlock` (agent-mode
  `contract-assemble` output) then working dir + task dynamics + artifact paths; await the
  commit; verify on return. Artifact-is-the-handoff + dead-worker-respawn hold unchanged. Review
  fan-out = N parallel subagents. `runInline(ctx)` = the opencode primary agent in-session
  (inline carve-outs). Subagent-depth topology: `subagent_depth: 1`, orchestrator runs primary
  (ADR-219); document the sequential-per-phase fallback if depth-1 fan-out degrades (live item).
  Failure→blocker: unreachable subagent / non-zero guard block / dead subagent without a
  committed artifact escalate via the injected `{ unit, reason, ≤3 options }` protocol; startup
  vs mid-phase split identical to the Pi section.

EDIT `docs/adapters/model.md`:
- "Binding set" → `{ claude, pi, opencode }`.
- Append "## opencode binding": `select(model)` binds `provider/model` via the agent def
  `model:` frontmatter (or `opencode.json` `agent.<role>.model`, or `opencode run -m
  provider/model`); the adapter maps the craft tier → `provider/model` via the tier map
  (`adapters/opencode/src/model-tier-map.js`); the resolution ORDER stays core policy (restated
  nowhere). `isAvailable(model)` probes whether the mapped provider is configured. Failure:
  model-down → core fallback re-resolution + respawn (NOT the blocker protocol); a tier that
  resolves to no provider after exhausting the order is a runtime blocker. Semantics identical
  to the Claude/Pi sections.

Public-surface: the port docs are the "Binding set" registry surface; growing them to include
opencode is the doc gate the new binding owes (satisfied here).

No new test file (docs-only; the CI intention/structure lints are the gate). Keep the design-doc
required-section structure intact for any lint that checks headings.

### TDD steps

- RED: run `bash scripts/ci.sh` first to confirm baseline green; the "binding set" edits are
  prose (no failing unit test to author — docs-only exception). Verify intention-lint enumerates
  both files (`bash scripts/living-corpus.sh` lists them).
- GREEN: apply the Binding-set + opencode-binding-section edits to both files; run
  `bash scripts/ci.sh` → intention-lint + docs-structure-lint stay green.
- REFACTOR: align the opencode section wording with the Pi section's shape (parallel structure).

### Gate

`bash scripts/ci.sh`

### Commit

`docs(adapters): opencode binding sections for execution and model ports`

---

## Part 15 — opencode live-smoke record scaffold

### Context

The on-demand live-smoke evidence record (ADR-226/228), mirroring
`docs/adapters/pi-poc-record.md`. Docs-only part; gate `bash scripts/ci.sh` (new file lands
under `docs/adapters/`, in the intention-lint living corpus + docs-structure-lint scope).

READ `docs/adapters/pi-poc-record.md` for the exact structure to mirror (Verdict, Target repo
table, Ports exercised table, Per-phase outcome table, Reproduction notes; "Not CI-gated"
banner; entry point = `runAcceptanceProbe` from the adapter's `src/probe.js`).

CREATE `docs/adapters/opencode-poc-record.md` — a SCAFFOLD (the record is filled when the live
smoke actually runs; here it is the agenda + shape):
- Header + "Not CI-gated" banner; entry point `runAcceptanceProbe` from
  `adapters/opencode/src/probe.js` (Part 13), requiring an injected `opencodeRunner` that shells
  to a real `opencode` in a git-isolated `mktemp` throwaway (state-mutating-probe rule).
- Target-repo table (throwaway repo, opencode version DEFERRED, phase `implementation`, model
  tier `sonnet` → a `provider/model` — provider may be non-Anthropic, R-G5).
- Ports-exercised table (Execution/Model/Gate/VCS) and per-phase outcome table (RED→GREEN→commit,
  gate green before commit, mutations confined, committed artifact = handoff) — as pending rows
  to be filled at smoke time.
- **D-rows agenda** (the live items to resolve at implementation-time against a pinned opencode
  version, design §D9): rows 23 (plural/singular dir names), 24 (bash tool-input field for the
  guard), 25 (`opencode run --format json` event schema for telemetry), 26 (depth-1 fan-out
  topology), 27 (skill vs command dynamics), 28 (`question` permission reachability), 29 (min
  opencode version floor), 30 (CRAFT_ROOT export into the `` !`cmd` `` shell), 31 (per-invocation
  usage block returned to the orchestrator).
- Provider-neutral prose; NO ADR/phase numbers in the body (provenance is one-way; this file
  is `docs/adapters/`, which prose-lint waives for design docs but keep source/adapter tokens
  clean — reference by concept, not by ADR number).

Public-surface: none (docs record).

### TDD steps

- RED: `bash scripts/ci.sh` baseline green; docs-only (no unit test). Confirm `living-corpus.sh`
  will enumerate the new `docs/adapters/opencode-poc-record.md`.
- GREEN: author the scaffold mirroring `pi-poc-record.md`; run `bash scripts/ci.sh` →
  intention-lint + docs-structure-lint green (dated-doc rule not triggered — no `-P<n>-`/`SC5-`/
  `SPIKE` filename).
- REFACTOR: match the pi-poc table shapes for parity.

### Gate

`bash scripts/ci.sh`

### Commit

`docs(adapters): opencode live-smoke record scaffold`
