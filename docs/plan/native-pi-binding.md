# Plan — native pi binding (convert the headless `craft-pi` adapter into a discoverable pi package)

> Source: design doc `docs/design/native-pi-binding.md` · ADRs `229..239`
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

- **Working tree**: `/Users/scolladon/workspace/perso/craft-native-pi-binding` (branch
  `feat/native-pi-binding`, baseline green). Work ONLY here; absolute paths.
- **The pi adapter package already exists and is CI-wired.** `adapters/pi/` has
  `package.json`, `src/*.js`, `test/*.test.js`, `.claude/workflow.md`, `stryker.conf.json`;
  `scripts/ci.sh` line 52 already runs its suite; `test/every-test-file-registers.test.js`
  already enumerates it. **No scaffold part is needed.** This plan REUSES the proven seams
  (`gate.js`, `tool-call-hook.js`, `execution.js`, `roleless*.js`, `engine.js`, `run.js`,
  `cli.js`, `probe.js`) and adds only the native discoverable surface plus the aligned/new seams.
- **Provenance is one-way** (`test/source-hygiene.test.js`): NO phase/ADR/backlog refs in any
  source, test, prompt, or adapter markdown file you write. This plan/PR carries provenance; the
  adapter code and its README/prompts must not. No suppression directives (`@ts-ignore`,
  `eslint-disable`, coverage-ignore). No swallowed errors (handle / rethrow / log-with-context).
- **Engine-bin shim convention**: engine bins are ~5-line shims over `engine/src/<name>-main.js`;
  ALL logic lives in `engine/src/**` (Stryker mutates `engine/src/**` only). The telemetry sibling
  (Part 5) and the `usage-mine` touch (Part 6) honour this — logic in `engine/src`, no bin edits.
- **Keep testable logic in JS, never in the `.ts` extension** (design sizing nuance): the pi
  extension entry `adapters/pi/extensions/craft-guard/index.ts` is loaded by pi via jiti and is NOT
  reachable by `node --test`. ALL guard/root/flag logic lives in the node-tested `adapters/pi/src/*.js`
  seams; `index.ts` is a THIN wrapper importing them (Part 8). Its wiring is smoke-verified, not CI-tested.
- **Gate commands** (resolved per part, verbatim):
  - `adapters/pi/` parts → `cd adapters/pi && node --test 'test/**/*.test.js'`
  - `engine/` parts → `cd engine && node --test 'test/**/*.test.js'`
  - a part touching a living-corpus doc (`docs/adapters/*.md`) or new `.md`/`.ts`/config that the
    hygiene lints see → also `bash scripts/ci.sh`.
- **No new CI-level runtime dependency**: only `node` built-ins + `bash`. The pi extension `.ts`
  needs pi/jiti (NOT in CI) — so all its logic lives in node-tested `.js`, and the `.ts` is a thin
  wrapper proven by the on-demand smoke (design Test strategy).
- **Pinned pi 0.80.10 facts used across parts** (design §D2, probed against the live binary):
  - tool_call event: `event.toolName` (lowercase `bash|write|edit|read|grep|find|ls`), `event.input`
    (bash `{command,timeout?}`, write/edit `{path,content}` — **`path`, NOT `file_path`**); blocks by
    RETURN `{block:true,reason?}` (row 13/14).
  - `--mode json` stream: assistant `message.usage={input,output,cacheRead,cacheWrite,totalTokens,cost{…}}`,
    `message.model`, `message.provider`, `message.stopReason`; session header line `{type:"session","id":…}`;
    **NO top-level `{type:"usage"}` event** (row 15).
  - model ids from `pi --list-models`: `anthropic claude-opus-4-5 / claude-sonnet-4-5 / claude-haiku-4-5`
    (row 17). These are the PI-native ids — **distinct from** the Claude/opencode harness SKUs
    (`claude-opus-4-8`/`claude-sonnet-4-6`). Do NOT copy opencode's tier-map values.
- **Public-surface decisions** are made in the part that creates each symbol (noted per part). The
  only repo-wide (engine) surface here is the telemetry `collect` binding + the `usage-mine`
  front-door (Parts 5–6) and the telemetry-port doc (Part 6) — enumerated there. All
  `adapters/pi/src/*` exports are package-internal (imported only within `adapters/pi/`, plus the
  package's own `.ts` extension); there is no engine barrel or generated API report to update.
- **Contract untouched (ADR-239)**: `engine/src/contract.js` is NOT edited. The pi binding assembles
  in agent mode (`run.js → assembleBlock`) and adds ZERO carve-out variants → its block is
  byte-identical to Claude's. Part 7 asserts this; no engine wording changes.
- **Docs phasing (no double-scheduling):** this plan OWNS the telemetry.md Pi-section reconciliation
  (Part 6 — it becomes factually wrong the moment `--source pi` ships) and the pi-poc-record
  native-surface agenda (Part 9). The `docs/adapters/{execution,model}.md` Pi-binding sections are
  **DEFERRED to the documentation phase** — design §D4 keeps them substance-unchanged (native surface
  changes discoverability, not the port verbs), and no implementation gate forces them (they carry no
  `subjects:` frontmatter, so intention-lint does not require a mention of the new `adapters/pi/src`
  seams). The documentation phase refreshes those two pages from the design; do not touch them here.

---

## Part 1 — pi git-guard event adapter re-expressed for 0.80.10

### Context

The one mandatory code seam is the git-diff/path guard (ADR-232/237). The pure predicate
`adapters/pi/src/gate.js#toolCallGuard` is **REUSED VERBATIM** (do NOT edit `gate.js`): it keys off
Claude-cased tool names (`BASH_TOOL = 'Bash'`, `WRITE_TOOLS = {'Write','Edit','NotebookEdit'}`),
reads `tool_input.command` (bash) and `tool_input.file_path` (write), and carries the proven
`GIT_DIFF_SHOW_RE` + `COMPLIANT_MARKERS = ['--no-ext-diff','rtk proxy']`. Only the **event adapter**
must track pi 0.80.10's real shapes.

EDIT `adapters/pi/src/tool-call-hook.js` — the private `adaptPiEvent(event, ctx)` (lines 12–20). It
currently reads `event.tool ?? event.name` and `event.input ?? event.arguments` (pinned to 0.79.8) and
passes `tool_input` straight through. Re-express it for 0.80.10 (design §D7 mismatches 1–3), keeping
the 0.79.8 reads as back-compat fallbacks so the existing tests stay green:
- **Tool field + casing bridge**: read `event.toolName ?? event.tool ?? event.name`, then normalize via
  a module-const casing map (lowercase pi → Claude predicate names): `bash→Bash`, `write→Write`,
  `edit→Edit` (add `read→Read`, `grep→Grep`, `ls→Ls`, `find→Find` for completeness — only Bash/Write/Edit
  are load-bearing for the predicate; unknown/already-capitalized names pass through unchanged so the
  existing `'Bash'`/`'Write'`/`'Read'` back-compat fixtures still resolve). This keeps the shared
  predicate binding-neutral (Claude names) — the casing lives in the pi adapter where it belongs (DC-9).
- **Write field**: pi write/edit input uses `path`, not `file_path`. Produce the guard's `tool_input`
  so `file_path` is populated from pi's `path`: `{ ...rawInput, file_path: rawInput.file_path ?? rawInput.path }`.
  Both `toolCallGuard` and `symlinkRecheck` (which BOTH read `tool_input.file_path`) then work unchanged;
  bash's `command` field already matches pi.
- **Blocking stays by RETURN**: `toolCallHook()`'s returned function already produces
  `{block:true,reason}` — pi blocks by return (row 13), matching the existing hook contract. No change
  to `toolCallHook`/`symlinkRecheck` bodies.

Keep `adaptPiEvent` <20 lines with early returns; extract the casing map + the normalize step to tiny
named helpers/consts if it reads clearer (Object Calisthenics). Update the JSDoc `@param` on
`adaptPiEvent` from the 0.79.8 field list to the 0.80.10 shape (`toolName`, `input.path`), no ADR/phase ref.

EXTEND `adapters/pi/test/tool-call-hook.test.js` (add a describe block; the file's `piToolCallEvent`
builder currently sets `name`/`tool`/`arguments`/`input` — add a variant that sets `toolName`). Fixtures
are the real 0.80.10 shapes:
- `{ toolName: 'bash', input: { command: 'git diff HEAD~1' } }` → `block:true` + string reason (the
  git-diff branch fires against a real 0.80.10 event — it never did before; the pi live smoke did not
  exercise the guard). Pin the compliant escape too: `{ toolName:'bash', input:{ command:'git diff --no-ext-diff HEAD~1' } }` → `block:false`.
- casing/field mapping via a recording guard (mirror the existing "recordingGuard" test): given
  `{ toolName:'write', input:{ path:'sub/x', content:'y' } }`, assert the guard receives
  `tool === 'Write'` and `tool_input.file_path === 'sub/x'`. Same for `{ toolName:'edit', input:{ path } }`
  → `tool === 'Edit'`.
- return-to-block shape unchanged: a blocked verdict has no `permission` field (extend the existing
  "pinned veto shape" assertion to a `toolName`-shaped event).
- keep ALL existing back-compat tests (capitalized `name` + `file_path` + `arguments`) green.

Public-surface: no new exported symbol — `adaptPiEvent` is private; `toolCallHook`/`WRITE_TOOLS`
exports are unchanged. Package-internal (the Part 8 extension imports `toolCallHook`). Nothing to pre-pay.

### TDD steps

- RED: add the 0.80.10 fixtures/assertions above. Run `cd adapters/pi && node --test 'test/**/*.test.js'`
  → fails: `toolName`-shaped bash event yields `block:false` (adaptPiEvent reads `tool`/`name` =
  undefined ≠ 'Bash'); the write casing/`path` assertions fail (`tool` undefined, `file_path` undefined).
- GREEN: re-express `adaptPiEvent` (toolName read + casing map + `path`→`file_path`). New tests pass;
  existing back-compat + symlink-recheck tests stay green.
- REFACTOR: name the casing map + normalize helper; early returns; no boolean params.

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'`

### Commit

`feat(pi): re-express git-guard event adapter for pi 0.80.10 tool_call shape`

---

## Part 2 — pi model tier map

### Context

A committed default `opus|sonnet|haiku → provider/model` map, unit-tested, the single home of the pi
tier→id table (ADR-221 parallel; design §D8). `.claude/workflow.md` stays provider-neutral (tier
strings only); the tier→`provider/model` mapping is pi-binding-local. Mirror the SHAPE of
`adapters/opencode/src/model-tier-map.js` (READ it) but with the **pi-native ids** (NOT opencode's SKUs).

CREATE `adapters/pi/src/model-tier-map.js`:
```
export const DEFAULT_TIER_MODELS = Object.freeze({
  opus:   'anthropic/claude-opus-4-5',
  sonnet: 'anthropic/claude-sonnet-4-5',
  haiku:  'anthropic/claude-haiku-4-5',
});
export function resolvePiModel(tier, overrides = {}) -> string
```
- **ids**: the three `anthropic/claude-{opus,sonnet,haiku}-4-5` strings — the ids confirmed present in
  `pi --list-models` (design §D2 row 17, §D8). These are the pi catalog's 4-5 line; do NOT reuse
  opencode's `claude-opus-4-8`/`claude-sonnet-4-6`.
- **precedence** (design §D8): explicit `overrides[tier]` (from pi settings, or portably manifest
  `models.<role>`) wins over `DEFAULT_TIER_MODELS[tier]`. Unknown tier with no override → throw a named
  Error (fail-loud; a tier resolving to no provider is a runtime blocker per `model.md`, not a silent pass).
- pure, <20 lines, early returns, no boolean params.

Public-surface: package-internal, no engine symbol, no barrel. This is a standalone committed + unit-tested
default map; it has **no compile-time consumer in this change** — the provider-neutral settings/prompts
(Part 8) and `.claude/workflow.md` deliberately do NOT reference it (they cannot import JS and stay
tier-string-only). Its live consumer is the on-demand smoke's piRunner picking `--model provider/model`
(and any settings/manifest override), proven against one reachable provider (R-4). So there is no
downstream surface gate to pre-pay.

CREATE `adapters/pi/test/model-tier-map.test.js` (table-driven, `sut = resolvePiModel`, Given/When/Then
titles, AAA body):
- each of `opus|sonnet|haiku` (no overrides) → the `DEFAULT_TIER_MODELS` value (pins the pi-native ids).
- override precedence: `resolvePiModel('sonnet', { sonnet: 'google/gemini-2.5-flash' })` → the override
  (proves provider-agnostic swap — the pi-Gemini precedent that the live PoC already exercised, R-4).
- unknown tier (e.g. `'mega'`) with no override → throws (named Error).
- `DEFAULT_TIER_MODELS` is frozen (mutation attempt does not change it).

### TDD steps

- RED: write the table-driven test. Run `cd adapters/pi && node --test 'test/**/*.test.js'` → fails (no module).
- GREEN: implement `model-tier-map.js` (default table + precedence + fail-loud).
- REFACTOR: keep `resolvePiModel` small; extract nothing that would hurt readability.

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'`

### Commit

`feat(pi): tier→provider/model map, pi-native anthropic default, swappable`

---

## Part 3 — CRAFT_ROOT resolver

### Context

The pi `craft-guard` extension factory (Part 8) self-locates the engine and sets
`process.env.CRAFT_ROOT` before `session_start` (ADR-235, design §D2 row 21 / §D8). This part is the
pure resolver only; the extension that CONSUMES it is Part 8. The `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}`
skill-body shim **already exists on the surface** (landed by the opencode binding — confirmed present in
`skills/*/SKILL.md`); behaviour-preserving for Claude (`CRAFT_ROOT` unset → bash default-expansion yields
`CLAUDE_PLUGIN_ROOT`, still set by Claude). This part does NOT rewrite any skill/hook file.

CREATE `adapters/pi/src/craft-root.js` — mirror the self-location IDIOM in `adapters/pi/src/engine.js`
(`const __dir = dirname(fileURLToPath(import.meta.url)); join(__dir, …)`) and the injected-`fsOps`
discipline in `adapters/pi/src/probe.js`:
```
export function resolveCraftRoot(moduleUrl, fsOps = { existsSync, realpathSync }) -> string
```
- `moduleUrl` = the CALLER's `import.meta.url`; the sole real caller is the extension at
  `adapters/pi/extensions/craft-guard/index.ts`, so the resolver walks **FOUR** dirs up from the module
  dir (`craft-guard` → `extensions` → `pi` → `adapters` → repo root) — NOT `engine.js`'s three-up
  (`engine.js` is one level shallower, in `src/`). Do NOT copy engine.js's depth; compute FOUR explicitly
  with a WHY comment. Compute an ABSOLUTE, EXISTING, containment-checked root: `fileURLToPath(moduleUrl)`
  → `dirname` → `join(dir,'..','..','..','..')`; `resolve()` it; assert absolute; verify it exists via
  injected `existsSync`; **verify `<root>/engine/bin` exists** so a wrong depth fails loud; return its
  `realpathSync`.
- Failure contract (fail-loud, no swallow): a non-absolute / non-existent / escaping root throws a named
  Error naming the offending value. The extension surfaces it; the engine never reads `CRAFT_ROOT`.
- Inject `fsOps` (default node `fs`) so tests run without touching the real FS.

Public-surface: package-internal (consumed by the Part 8 extension). No engine symbol.

CREATE `adapters/pi/test/craft-root.test.js`:
- inject `fsOps` stubs: a `moduleUrl` whose resolved root exists → returns the realpath'd root; assert it
  ends at the repo root (contains `engine/bin`, using the injected `existsSync`).
- non-existent root (injected `existsSync` false) → throws.
- a `moduleUrl` resolving to a non-absolute/empty path → throws.
- symlinked root: injected `realpathSync` returns a different path → that realpath is returned.
- **bash-layer default-expansion assertion** (design §D8 / R-8 "the `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}`
  default-expansion asserted at the bash layer") — via `child_process.execFileSync('bash', ['-c', ...])`
  in a throwaway env (NEVER the worktree): `CRAFT_ROOT` unset + `CLAUDE_PLUGIN_ROOT=/x` →
  `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` expands to `/x` (Claude behaviour preserved); `CRAFT_ROOT=/y CLAUDE_PLUGIN_ROOT=/x`
  → `/y` (pi override wins). This proves the shim contract the extension relies on.

### TDD steps

- RED: write `craft-root.test.js` with injected fsOps + the bash-expansion assertion. Run
  `cd adapters/pi && node --test 'test/**/*.test.js'` → fails (no module).
- GREEN: implement `craft-root.js` (self-locate + absolute/exists/realpath/contain, named errors).
- REFACTOR: extract the up-walk depth to a named constant with a WHY comment; keep the function small.

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'`

### Commit

`feat(pi): CRAFT_ROOT resolver self-locating the engine from the extension module`

---

## Part 4 — headless `parseUsage` aligned to pi 0.80.10 `message.usage`

### Context

`adapters/pi/src/execution.js#parseUsage` is a **latent bug** against the installed pi: it scans for a
top-level `{type:"usage"}` event that pi 0.80.10 no longer emits (usage moved to assistant
`message.usage`, design §D2 row 15) — so the headless bin's usage extraction is **dead** on 0.80.10.
ADR-234 folds the fix into this change (its own TDD part, distinct from the telemetry sibling — R-10,
§D6b). The SAME pinned `message.usage` shape feeds both this parser and the telemetry sibling (Part 5) —
one shape, two consumers, no second pin.

EDIT `adapters/pi/src/execution.js#parseUsage` (lines 26–44). Current: splits on `\n`, returns the first
`event.type === 'usage'` event's `event.usage`. Re-express to read the assistant `message.usage`:
- keep the LF-only split + `tryParseJson` skip-on-malformed/empty discipline (shape-agnostic — preserve).
- for each parsed line, when it carries an assistant `message.usage` (per row 15, the assistant
  `message_end` — equivalently `turn_end` — line: `{type:"message_end", message:{ usage:{input,output,cacheRead,cacheWrite,totalTokens,cost}, model, provider, … }}`), return that `message.usage` object.
  Return `null` when no such line is present. Remove the dead `USAGE_EVENT_TYPE = 'usage'` const.
- Update the function JSDoc to the 0.80.10 shape (no ADR/phase ref).

**Cross-file impact (pre-chewed — must land atomically green):** `parseUsage`'s return flows into
`adapters/pi/src/run.js:166` (`const usage = parseUsage(stdout)`) and is stored raw into
`record.usage` (line 173, not field-accessed in `run.js` — safe). BUT two test files pin the OLD shape
and WILL break — update them in this part:
- `adapters/pi/test/execution.test.js` — the `describe('parseUsage() — JSONL stream parsing')` block
  (lines 120–213) pins `{type:'usage', usage:{input_tokens,output_tokens}}`. **Rewrite that block** to
  the 0.80.10 `message.usage` shape: the "returns the usage object" case feeds a `message_end` line
  carrying `message.usage`; keep the shape-agnostic cases (whitespace-only line skipped, malformed line
  skipped, empty string → null, no-usage stream → null, LF-only split with trailing partial line, CRLF
  tolerance) but source their "usage" line from a `message.usage`-bearing line. Do NOT keep any
  `{type:'usage'}` fixture (that event does not exist in 0.80.10).
- `adapters/pi/test/run.test.js` — `USAGE_JSONL` (line 49, the SHARED default `spawnPi` stdout reused at
  lines 59 and 203) and the usage-recording test (lines ~300–315,
  `usageFixture = {type:'usage', usage:{input_tokens:42,output_tokens:7}}`, asserting
  `r.usage.input_tokens === 42` / `r.usage.output_tokens === 7`). **Update** `USAGE_JSONL` to a
  `message_end` line carrying `message.usage` (its two reuse sites follow automatically) and the
  usage-recording fixture/assertions to the new field names (`message.usage:{input:42, output:7, …}` →
  `r.usage.input === 42` / `r.usage.output === 7`). run.js stores the object verbatim, so only the
  fixture + field names change.

Public-surface: `parseUsage` is already exported and its sole consumer is `run.js` (package-internal);
the return-shape change is absorbed by the two test updates above. No engine/barrel surface.

### TDD steps

- RED: rewrite the `execution.test.js` parseUsage block + the `run.test.js` fixture/assertions to the
  0.80.10 `message.usage` shape. Run `cd adapters/pi && node --test 'test/**/*.test.js'` → fails: the old
  `parseUsage` returns `null` against a `message.usage`-bearing stream (no `{type:'usage'}` event).
- GREEN: re-express `parseUsage` to read `message.usage`. Both suites pass.
- REFACTOR: keep the loop small; name the message-usage extractor helper; no swallowed errors.

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'`

### Commit

`fix(pi): align headless parseUsage to pi 0.80.10 message.usage`

---

## Part 5 — pi telemetry collect binding (engine sibling) + report byte-match

### Context

Additive telemetry `collect` binding at `engine/src/observability/adapters/pi/telemetry.js` (ADR-233 —
the established telemetry-home exception to the top-level-adapters rule; the claude and opencode bindings
are the siblings). Reuses the pure `aggregate` + `serializeReport` core UNCHANGED. ENGINE part.

READ `engine/src/observability/adapters/opencode/telemetry.js` (the closest sibling) and
`engine/src/observability/adapters/claude/telemetry.js` for the exact `UsageEvent` shape + `parseLines`
contract to mirror:
- `UsageEvent` fields: `run`, `slug?`, `phase`, `role?`, `model`, `tokens{input,cacheRead,cacheCreation,output}`,
  `cacheCreationTtl?`, `messages`, `durationMs`.
- `parseLines(lines, since = null) -> { events, skipped, markers }`: async-iterates raw lines,
  `JSON.parse` per non-empty trimmed line, malformed → `skipped++` & skip, synthetic-model rollups
  excluded (return null), `since` ISO cutoff filter (internal only, never emitted), `numOrZero` coercion,
  redaction = positive whitelist (ONLY the whitelisted fields; no paths/`$HOME`/username/prompt text).

CREATE `engine/src/observability/adapters/pi/telemetry.js`:
- `export async function parseLines(lines, since = null) -> { events, skipped, markers }` mapping pinned
  `pi --mode json` event lines → `UsageEvent[]`. **Field mapping (design §D6 table, the pi carve-out):**
  | `UsageEvent` field | pi `--mode json` source |
  |---|---|
  | `run` | session-header `id` (first line `{type:"session","id":…}`) — **stateful**: hold the current session id and stamp it on each event (pi's message lines do NOT repeat it; the claude/opencode bindings read a per-line `sessionId`/`sessionID` — pi cannot) |
  | `slug` | caller-injected (null default) |
  | `phase` | **caller-injected** (null default) — pi has no `agentType`/`agent` field |
  | `role` | **null** — pi has no subagents (R-7) |
  | `model` | assistant `message.model` |
  | `tokens.input` | `message.usage.input` |
  | `tokens.cacheRead` | `message.usage.cacheRead` |
  | `tokens.cacheCreation` | `message.usage.cacheWrite` (pi cache-write == cache-creation) |
  | `tokens.output` | `message.usage.output` |
  | `cacheCreationTtl` | `null` (pi does not split 5m/1h TTL) |
  | `messages` | assistant/tool message count (e.g. `turn_end.toolResults.length`, else 1 per assistant `message_end`) |
  | `durationMs` | derived from message timestamps, else `0` |
- canonical usage line = one `UsageEvent` per assistant `message_end` (equivalently `turn_end`) carrying
  `message.usage` (the exact canonical choice + real non-zero values are DEFERRED to the smoke — rows
  22/24; pin against the frozen fixtures now). `since` filter: drop lines whose message timestamp predates
  the cutoff (internal only). Synthetic-model (`<synthetic>`) exclusion + malformed-line skip match the
  claude binding. Reuse `numOrZero`; no clock/random/model-id literals in core paths.

Public-surface: **engine-public** — a `collect` binding under the telemetry-port home. Its sole
downstream consumer is the `usage-mine` front-door selector (Part 6), which imports it directly (same as
the claude/opencode bindings — no engine barrel). The telemetry.md "Binding set" already reads
`{ claude, pi, opencode }`; the Pi-section prose is rewritten in Part 6 (where `--source pi` ships).

CREATE FROZEN fixtures `engine/test/fixtures/pi/*.jsonl` (mirror `engine/test/fixtures/opencode/`'s three
files — READ them for the PII-leak-bait pattern):
- `single-run.jsonl` — a session-header line `{type:"session","id":"pi-sess-aaa","cwd":"/repo"}` followed
  by one assistant `message_end` line carrying `message.usage:{input,output,cacheRead,cacheWrite,totalTokens,cost}`,
  `message.model` (a distinguishable id, e.g. `anthropic/claude-sonnet-4-5`), plus **PII-leak bait**
  fields (`cwd`, a `home`/`user`/`prompt` on the header) that must NOT reach any emitted event.
- `malformed.jsonl` — a valid header + one valid message line + a trailing `NOT_VALID_JSON{{{` (skip-counted).
- `with-synthetic.jsonl` — a header + a `message.model: "<synthetic>"` line (excluded).

CREATE `engine/test/pi-telemetry.test.js` (mirror `engine/test/opencode-telemetry.test.js`; `import { test } from 'node:test'`):
- valid lines → `UsageEvent[]` with correct mapping: `run` from the header id (stamped on the event even
  though the message line lacks it), `role: null`, `phase: null`, `model` from `message.model`,
  `tokens.cacheCreation` from `message.usage.cacheWrite`.
- malformed line → skipped, counted in `skipped`; surrounding lines unaffected.
- synthetic-model line → excluded.
- redaction: no `cwd`/`home`/`user`/`prompt`/path key appears on any emitted event (whitelist-only).
- `since` cutoff drops a pre-cutoff line.
- **report byte-match (folds in here** — exercises this binding feeding the reused core, the
  `pure-aggregate-core` shape): `import { aggregate, serializeReport } from '../src/observability/usage-aggregate.js'`;
  feed the pi `UsageEvent[]` → `aggregate` → `serializeReport`; assert the output is deep-sorted,
  2-space-indented, single-trailing-newline JSON byte-identical in SCHEMA to the claude path (same
  top-level key order; `serializeReport(report) === JSON.stringify(sortDeep(report), null, 2) + '\n'`
  shape — use a small fixed report to pin bytes).

### TDD steps

- RED: write `pi-telemetry.test.js` + the frozen fixtures. Run `cd engine && node --test 'test/**/*.test.js'`
  → fails (no module).
- GREEN: implement `adapters/pi/telemetry.js#parseLines` (stateful session-id, message.usage mapping,
  skip/exclude/redaction). Parse/skip/redaction tests pass.
- GREEN: add the report byte-match assertion (import the unchanged `aggregate`/`serializeReport`).
- REFACTOR: extract token-mapping + session-id-tracking helpers; keep functions small, no swallow.

### Gate

`cd engine && node --test 'test/**/*.test.js'`

### Commit

`feat(observability): pi telemetry collect binding + report byte-match`

---

## Part 6 — `usage-mine --source pi` + source-aware read root + telemetry.md reconciliation

### Context

Wire the pi binding into the `usage-mine` front-door and make the READ root source-aware (ADR-233,
design §D6). ENGINE part; builds on Part 5. `usage-mine-main.js` ALREADY has `--source` + a `SOURCES`
map (`{ claude, opencode }`) guarded by an `Object.hasOwn` fail-closed gate — this part adds `pi` and a
source→read-root map. Also folds the telemetry.md Pi-section reconciliation (ADR-238) — the surface gate
this change owes the moment `--source pi` becomes real.

READ `engine/src/observability/usage-mine-main.js`:
- `SOURCES` (lines 40–43) is `Object.freeze({ claude: claudeParseLines, opencode: opencodeParseLines })`.
- `DEFAULT_PROJECTS_DIR = join(homedir(), '.claude', 'projects')` (line 44) is the SINGLE read root today;
  `main` destructures `projectsRoot = DEFAULT_PROJECTS_DIR` (line 203) and checks
  `containByRealpath(projectsRoot, transcriptDir)` (line 225). A `--source pi --dir ~/.pi/agent/sessions`
  run would fail containment against the claude root — hence the source-aware root.
- the `--source` selector + validation (`Object.hasOwn(SOURCES, source)`, `unknownSourceMessage`) is at
  lines 212–217; `main` returns `EXIT_CONFIG_ERROR` for an unknown source before any I/O.

EDIT `engine/src/observability/usage-mine-main.js`:
- import `parseLines as piParseLines` from `./adapters/pi/telemetry.js`; add `pi: piParseLines` to `SOURCES`
  (the `Object.hasOwn` gate already guards it — no other validation change needed).
- add a source→default-read-root map, e.g.
  `DEFAULT_READ_ROOTS = Object.freeze({ claude: join(homedir(),'.claude','projects'), pi: <pi sessions dir> })`
  where the pi dir honours `process.env.PI_CODING_AGENT_SESSION_DIR` else `join(homedir(),'.pi','agent','sessions')`
  (design §D6 / §D2 row 2). Make the READ root source-aware: keep the `io.projectsRoot` override winning
  (tests inject it), but when NOT overridden resolve the default from `DEFAULT_READ_ROOTS[source]` instead
  of the fixed claude default. Preserve claude's default (`~/.claude/projects`) byte-for-byte so existing
  behaviour is unchanged. This is a GENERIC capability (any file-based source needs its own read root),
  named per DC-5 — not a pi special-case.
- keep the "always advisory exit 0" contract; the only non-zero remains the unknown-`--source` config
  error (unchanged). Update the module-header comment's "claude or opencode" mention to include pi.

EDIT existing engine test `engine/test/usage-mine-main.test.js` (extend the `--source` selector block
around lines 822–866; it already covers default→claude, `--source opencode`, unknown-source rejection —
mirror the opencode case for pi):
- `--source pi --dir <pi fixture dir>` (reuse Part 5's `engine/test/fixtures/pi/`, inject
  `io.projectsRoot` = the pi fixtures root so containment passes) routes to `piParseLines` and produces a
  report reflecting pi-parsed events — assert a pi-distinguishing property (e.g. every group's `role` is
  null, or the `run` equals the session-header id). Do NOT rely on the claude model-id sniff.
- source-aware read root: with `--source pi` and NO `io.projectsRoot` override, assert the resolved read
  root is the pi sessions dir — set `process.env.PI_CODING_AGENT_SESSION_DIR` to a temp dir and assert a
  `--dir` inside it passes containment while the same `--dir` is outside the claude default. **Save and
  restore `PI_CODING_AGENT_SESSION_DIR` in an `after`/`finally`** so the process env is not leaked to
  sibling tests. Keep it hermetic — no real `~/.pi` access.
- default (no `--source`) still routes to claude and exits 0 (regression — leave the existing case).

EDIT `docs/adapters/telemetry.md` (the telemetry-port surface — living-corpus doc; ADR-238 reconciliation):
- Rewrite the `## Pi binding` section (lines 73–86) from the **Raspberry-Pi / single-board-computer**
  wording to the **pidev coding agent** binding: `engine/src/observability/adapters/pi/telemetry.js` — the
  `pi --mode json` collect binding; maps the pinned assistant `message.usage`/`message.model` + the
  session-header `id` → the same vendor-neutral `UsageEvent` shape; `role` is null and `phase` is
  caller-injected (pi has no subagent attribution); `aggregate`/`serializeReport` reused unchanged;
  whitelist-only redaction; the exact canonical per-turn usage line + real non-zero values DEFERRED to
  the live smoke. Selected via `--source pi`.
- Update the **Failure semantics** section (lines 104–107): `--source` now accepts `claude` (default),
  `opencode`, or `pi`; only a value outside that set is the config-error non-zero exit. Remove the
  "including `pi`, until built" clause. Keep the `subjects:` frontmatter and the advisory-never-gates floor.
- This is a SANCTIONED edit to an invariant-bearing port page (ADR-238) — the documentation phase must
  NOT re-touch telemetry.md. Keeps `docs-structure-lint`/intention-lint green (docs/adapters/*.md is in
  the living corpus via `scripts/living-corpus.sh`).

Public-surface: no new exported symbol (`main` signature unchanged). The telemetry.md Pi section is the
doc surface the Part 5 binding owes — satisfied here.

### TDD steps

- RED: extend `usage-mine-main.test.js` with the `--source pi` routing + source-aware-read-root cases.
  Run `cd engine && node --test 'test/**/*.test.js'` → fails (pi not in `SOURCES`; read root not source-aware).
- GREEN: add `pi` to `SOURCES` + the `DEFAULT_READ_ROOTS` source-aware root. Tests pass; existing
  default/opencode/unknown cases stay green.
- GREEN: rewrite the telemetry.md Pi section + Failure-semantics `--source` line.
- REFACTOR: keep the read-root resolution a small pure lookup; named constants; no boolean params.

### Gate

`cd engine && node --test 'test/**/*.test.js'` then `bash scripts/ci.sh` (for the telemetry.md
intention/structure/prose lints)

### Commit

`feat(observability): --source pi front-door selector + source-aware read root`

---

## Part 7 — contract-equivalence pi zero-line-diff assertion

### Context

Prove R-6 mechanically: the pi binding assembles in agent mode (`run.js → assembleBlock`) and REUSES the
agent variants, adding ZERO carve-out variants → its assembled block is byte-identical to the
Claude-binding block for the same phase+mode (ADR-239, zero-line diff — no `contract.js` touch, R-1).
This is a **test-infra-only** extension to an engine test with NO `src/` delta (`contract.js` is
deliberately untouched) — legitimately standalone. ENGINE part.

READ `engine/test/contract-equivalence.test.js` (the harness to extend) — it ALREADY contains the
opencode-binding fidelity assertions (lines 143–183): a `binding: 'opencode'` hint on
`assembleContract(descriptor, {}, FRAGMENTS, { execution:'agent', binding:'opencode' })` must be ignored
(zero-line diff vs plain agent mode), and the agent-vs-inline diff is confined to the two carve-out
fragments (`AGENT_CARVE_OUT_FRAGMENTS`). `assembleContract` has NO binding dimension — the hint is inert.

EXTEND `engine/test/contract-equivalence.test.js` (reuse the existing `DESCRIPTORS`, `FRAGMENTS`,
`assembleContract`, `diffLines`, `AGENT_CARVE_OUT_FRAGMENTS`; mirror the opencode block with `binding: 'pi'`):
- for each descriptor: "Given a pi binding hint, when assembled, then it is ignored and the block equals
  plain agent-mode assembly" — assert `diffLines(assembleContract(descriptor,{},FRAGMENTS,{execution:'agent',binding:'pi'}),
  assembleContract(descriptor,{},FRAGMENTS,{execution:'agent'}))` has `length === 0` (the pi binding adds
  no variant; zero-line diff is the strongest form of R-6).
- re-anchor the two-carve-out-line confinement under the pi-binding concern (mirror the opencode
  confinement test) so a future `PI_VARIANTS` regression (a third differing line) trips this test.

Public-surface: none (test-only; asserts an invariant of untouched engine code).

### TDD steps

- RED: add the pi-binding assertions. Against the intended zero-variant design they may pass on first
  write (a pinning/property assertion over reused code — Sizing-rules exception: harness suite, no src
  delta). To confirm the assertion has teeth, temporarily inject a fake pi variant into a local copy and
  verify it FAILS, then remove the injection (do NOT commit any `contract.js` change).
- GREEN: with `contract.js` untouched, the assertions hold.
- REFACTOR: fold shared setup into the existing helpers; no duplication with the opencode block.

### Gate

`cd engine && node --test 'test/**/*.test.js'`

### Commit

`test(contract): pi binding reuses agent carve-out (zero-line diff)`

---

## Part 8 — native pi surface: package manifest + settings + prompts + guard extension + README

### Context

The discoverable native surface (ADR-229/230/231/235; design §D3/§D9) — a **pi package**: a `pi` manifest
so `pi install ./adapters/pi` registers extensions/skills/prompts (local path, no copy), thin `/craft-*`
prompt-template dispatchers, a settings template, one thin `.ts` extension wrapping the already-tested src
seams, and a README. Config + thin-code + docs, validated by one structure test. Comes LAST among code —
it references Part 1's `toolCallHook` and Part 3's `resolveCraftRoot`.

READ for the mirror shape: `adapters/opencode/README.md`, `adapters/opencode/commands/craft-run.md`
(thin dispatcher), `adapters/opencode/opencode.json`, `adapters/pi/.claude/workflow.md` (provider-neutral
manifest — reused, do NOT edit), `adapters/pi/package.json` (current: `name`, `type:module`, `private`,
`scripts.test`, `bin.craft-pi`). Repo craft skill dirs live at `skills/<phase>/SKILL.md`.

CREATE / EDIT:
- **EDIT `adapters/pi/package.json`** — add a `pi` manifest key `{ "extensions": ["extensions/craft-guard"],
  "skills": [], "prompts": ["prompts"] }` and `"keywords": ["pi-package"]` (design §D2 rows 5/6 — the
  local-path install registers all three resource kinds). Keep `name`/`type`/`private`/`scripts`/`bin`
  unchanged (the headless `craft-pi` bin stays — additive, DC-6). `manifest.test.js` reads
  `.claude/workflow.md`, NOT package.json, so it is unaffected.
- **CREATE `adapters/pi/settings.template.json`** — provider-neutral pi settings the README tells users to
  merge into `.pi/settings.json` (design §D9): a `skills[]` pointing at the repo's craft skill dirs (row 9
  lets pi consume arbitrary/`.claude`-style skill dirs — single-source the procedure bodies, NEVER
  re-author, the R-2 rule), a `prompts[]` pointing at `prompts/`, an `extensions[]` pointing at
  `extensions/craft-guard`, and a `defaultProjectTrust` guidance comment/value (row 19 — project-local
  resources + the guard extension load only when trust is satisfied; document `--approve` as the smoke
  path and `defaultProjectTrust:"always"` as the committed-repo path — a silent `ask`/`never` would drop
  the guard, a safety regression). NO `provider/model` here (provider-neutral; the tier map owns ids).
- **CREATE `adapters/pi/prompts/craft-run.md`** (+ `craft-review.md`, `craft-validation.md`,
  `craft-init.md` — the mandatory set, mirroring opencode's R-SC6 four). Each is a THIN prompt-template
  dispatcher (design §D3/§D9 row 10): frontmatter `description` (+ optional `argument-hint`); body carries
  `$ARGUMENTS` and instructs the model to load the corresponding craft skill
  (`skills/<phase>/SKILL.md`) and run the phase — single-sourced, never restating procedure text. pi
  prompt templates do NOT run shell at expansion (row 10, unlike opencode's `` !`cmd` ``), so the
  template carries NO engine-bin invocation itself — the SKILL body tells the model to run
  `node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/*` via the bash tool. Filename `craft-run.md` →
  `/craft-run` (the pi-native rendering of `/craft:run`; colon-in-filename avoided). Provider-neutral; no
  provenance refs.
- **CREATE `adapters/pi/extensions/craft-guard/index.ts`** — the THIN TS wrapper (design §D3/§D9 row
  11/12), loaded by pi via jiti (no compile). `export default function(pi){ … }` factory that:
  (1) on load, computes `CRAFT_ROOT` via `resolveCraftRoot(import.meta.url)` (Part 3) and sets
  `process.env.CRAFT_ROOT` before `session_start` (row 21); (2) registers the git-guard on the real
  `tool_call` event: `pi.on('tool_call', (event, ctx) => toolCallHook()(event, ctx))` — `toolCallHook`
  from `../../src/tool-call-hook.js` (Part 1; jiti imports `.js` transparently) — pi blocks by RETURN
  `{block:true,reason}` (row 13), which `toolCallHook` already produces; (3) registers a craft flag via
  `pi.registerFlag` (the `--profile`/`--skip` analog, row 12). Keep it minimal — ALL logic is the tested
  src seams; NO decidable logic in the `.ts`. Top-of-file comment: runtime-proven by the on-demand smoke
  (Part 9 D-rows 22–27), not by CI (no pi/jiti in CI).
- **CREATE `adapters/pi/README.md`** — install/usage: `pi install ./adapters/pi` (or `-l` for project
  scope; local path added to settings WITHOUT copying, row 5), the `--approve` vs `defaultProjectTrust`
  trust path (row 19), merging `settings.template.json`, and the provider-neutral model note (tier map is
  swappable; `.claude/workflow.md` stays tier-strings-only). Short, provider-neutral, no provenance refs.

CREATE `adapters/pi/test/native-surface.test.js` (one structure/validation test — mirror
`adapters/opencode/test/config.test.js` + `commands.test.js`; `.ts` is read as TEXT, not imported —
node --test cannot load it):
- `package.json` parses; `pi.extensions`/`pi.prompts` present; `keywords` includes `pi-package`; the
  `bin.craft-pi` + `name`/`type` are still present (additive, not a replacement).
- `settings.template.json` parses as JSON; has `skills`/`prompts`/`extensions` arrays and a
  `defaultProjectTrust` key/guidance.
- each of the four `prompts/craft-*.md` exists; has a non-empty `description` frontmatter; body contains
  `$ARGUMENTS`; body instructs loading a craft skill (references `skills/`); NO shell-injection
  `` !`…` `` (pi templates don't expand shell); no provenance ref.
- `extensions/craft-guard/index.ts` exists; text references `../../src/tool-call-hook.js` and
  `../../src/craft-root.js` (or `resolveCraftRoot`), `pi.on('tool_call'` (or `tool_call`),
  `registerFlag`, and `process.env.CRAFT_ROOT` (structural — the logic lives in the tested src).
- every `pi.extensions`/`pi.prompts` path declared in `package.json` resolves to a file/dir that EXISTS
  (the manifest cannot reference a missing resource).

Public-surface: the pi-package resource surface (manifest/settings/prompts/extension) — consumed by pi's
own discovery (external contract). No engine symbol. The extension imports the package-internal src seams.

### TDD steps

- RED: write `native-surface.test.js`. Run `cd adapters/pi && node --test 'test/**/*.test.js'` → fails
  (no manifest key / settings / prompts / extension).
- GREEN: add the `pi` manifest + keyword to `package.json`; author `settings.template.json`, the four
  `prompts/craft-*.md`, `extensions/craft-guard/index.ts`, `README.md`. Test passes.
- GREEN: run `bash scripts/ci.sh` — the new `.md`/`.ts`/config keep the stub/prose hygiene + shellcheck
  green (the `.ts` is a thin wrapper, no stub markers; prompts/README are prose, waiver-sourced).
- REFACTOR: factor a shared front-matter/prompt-body snippet if the four dispatchers duplicate it; keep
  single-sourced; keep the extension `.ts` minimal.

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'` then `bash scripts/ci.sh`

### Commit

`feat(pi): native discoverable surface (pi manifest, settings, prompts, guard extension, README)`

---

## Part 9 — pi-poc-record native-surface smoke agenda

### Context

Extend the on-demand live-smoke evidence record with the NATIVE-surface agenda (R-9, ADR-236; design Test
strategy). Docs-only, standalone (no `src/` delta). `docs/adapters/pi-poc-record.md` ALREADY exists with
the 0.79.8 headless PASS record — this part ADDS the native-surface smoke section (the deferred D-rows),
it does not replace the existing record. Gate `bash scripts/ci.sh` (the file is in the intention-lint
living corpus + docs-structure-lint scope). The acceptance-probe entry point
`adapters/pi/src/probe.js#runAcceptanceProbe` (injected `piRunner` + `fsOps.mktemp`) is REUSED unchanged —
no probe code part is needed.

READ `docs/adapters/pi-poc-record.md` (current structure: Verdict, Target-repo table, Ports-exercised
table, Per-phase outcome table, Reproduction notes; "Not CI-gated" banner; entry point
`runAcceptanceProbe`) and `docs/adapters/opencode-poc-record.md` (the sibling scaffold, if present, for
the D-rows-agenda shape).

EDIT `docs/adapters/pi-poc-record.md` — ADD a "Native surface smoke (on-demand)" section that is the
agenda + shape (filled when the live smoke actually runs), pinned to an exact pi version at
implementation time (0.80.10):
- entry: `pi install ./adapters/pi -l` + a merged `.pi/settings.json` + `--approve` (rows 19/27), a
  `/craft-run`-driven construction phase on a reachable provider (row 17), gate green before commit,
  mutations confined to a `mktemp` throwaway (state-mutating-probe rule), committed artifact = handoff,
  and **the guard blocking a non-compliant `git diff`** (the item the pi PoC never exercised live).
- **D-rows agenda** (the live items to resolve against the pinned pi version — design §D2 rows 23–28, as
  pending rows to fill at smoke time): row 23 (bash tool inherits `process.env.CRAFT_ROOT` set by the
  extension end-to-end via the `${CRAFT_ROOT:-…}` shim); row 24 (non-error `--mode json` usage numbers +
  canonical per-turn usage line choice); row 25 (persisted session-file `.jsonl` schema parity with the
  live `--mode json` stream); row 26 (`/craft-*` entrypoint threads phase id + part text + gate + artifact
  paths in a live TUI); row 27 (trusted native install end-to-end loads skills+extension and runs a
  construction phase); row 28 (`edit` tool full arg schema beyond `path`/`content`, only if a path guard
  inspects edit args).
- Provider-neutral prose; reference by concept, not by ADR/phase number (provenance one-way — though
  `docs/adapters/*` prose-lint waives design-word noise, keep the record clean of ADR numbers).

Public-surface: none (docs record).

### TDD steps

- RED: `bash scripts/ci.sh` baseline green; docs-only (no unit test). Confirm `scripts/living-corpus.sh`
  enumerates `docs/adapters/pi-poc-record.md` and the file has no dated-doc filename (structure-lint safe).
- GREEN: author the native-surface section + D-rows agenda; run `bash scripts/ci.sh` → intention-lint +
  docs-structure-lint + prose-lint stay green.
- REFACTOR: match the existing table shapes for parity with the headless record.

### Gate

`bash scripts/ci.sh`

### Commit

`docs(adapters): pi native-surface on-demand smoke agenda`
