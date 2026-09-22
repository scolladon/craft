---
subjects: ['engine/src/observability/**']
---
# Telemetry adapter spec

`engine/src/observability/memory.js` also falls under this page's `subjects` glob, but it is
specified by [`docs/contributing/specs/memory.md`](./memory.md), which now declares it
explicitly. The glob is left as-is rather than narrowed — the same advisory over-flag trade-off
`docs/contributing/specs/intention.md` documents inline for `engine/src/glob.js`.

## Port interface

- `collect(opts, deps) → UsageEvent[]` — parse transcript data into a vendor-neutral stream of
  usage events that the pure core can aggregate.
  - **pre**: `opts` carries a `runFilter` (optional, restricts which run IDs to include),
    `includeInline` flag (default `true` — main-loop usage is included unless the front door's
    `--no-inline` opts it back out, see [main-loop inclusion](#main-loop-inclusion----no-inline-adr-329));
    `deps` carries
    `readTranscripts: () => AsyncIterable<string>` and an optional `sessionId` (the run-identity
    string, see [ADR-186 below](#run-identity-sessionid-adr-186)). The adapter never receives an absolute
    path; the `readTranscripts` provider owns the runtime path.
  - **post**: each returned `UsageEvent` is path-free, PII-free, and carries only the fields the
    core expects: `run`, `slug?`, `phase`, `role?`, `model`, `tokens`, `messages`,
    `durationMs`, `cacheCreationTtl?`, `spawnId?`, `toolCalls?`. The adapter never throws; partial
    data returns a partial (possibly empty) array, never a rejection.
  - `spawnId` is an opaque per-transcript ordinal (never a path, filename, or agent id) that
    identifies which sub-agent spawn an event came from — see
    [reviewCycles](#reviewcycles-runsreviewcycles) below for why the core needs it. Only the
    claude binding populates it (`null` on its main-loop events, since a main-loop transcript is
    not itself a spawn); every other binding omits the field, which the core treats identically to
    `null`.
  - `toolCalls` is a count of tool invocations, never a tool name, argument, or path. Tool-use
    blocks are PARTITIONED across the lines of one assistant message and are summed, the opposite
    direction from `tokens`/`cacheCreationTtl`, which repeat per line and fold last-wins. Only the
    claude binding populates it; every other binding omits the field, which the core treats as
    `null`.
  - `collect` also returns `compactions: CompactionEstimate[]` alongside the `UsageEvent[]` stream
    — path-free, text-free estimates of a compaction boundary's summary-call cost (see
    [Claude binding](#claude-binding) below for the shape and formula). Only the claude binding
    populates it; every other binding returns none. The front door defaults an absent or omitted
    array to `[]` before calling `aggregate`.

- `aggregate(events, priceTable, baselineReport?, threshold?, skipMarkers?, compactions?) → report`
  — pure core function consuming the `UsageEvent[]` stream produced by `collect`; emits the
  structured `report` object documented in the [report.json schema](#reportjson-schema) section.
  Lives in `engine/src/observability/usage-aggregate.js` and is fully deterministic: no clock, no
  random, no runtime paths. `threshold` (default `DEFAULT_DRIFT_THRESHOLD`, `0.25`) only matters
  when `baselineReport` is supplied — it feeds the advisory [drift](#drift-drift) signal and has no
  effect on `groups`, `reviewCycles`, `recommendations`, or `baselineDeltas`. `compactions`
  (default `[]`) feeds only the advisory `compactionEstimate` key on its matching run (see
  [Per run](#per-run-runs) below) — it is never read by `groups`, `recommendations`, `drift`, or
  `baselineDeltas`.

- `serializeReport(report) → string` — stable serialization: `JSON.stringify(sortDeep(report), null, 2) + '\n'`.
  All object keys deep-sorted alphabetically; 2-space indent; single trailing newline. The serialized
  form is the stable artifact written to `report.json` or stdout.

## Binding set

The valid bindings are **`{ claude, pi, opencode, copilot, codex, aider }`**.

## Claude binding

`engine/src/observability/adapters/claude/telemetry.js` — the single binding that owns every runtime specific:

- **JSONL parsing**: reads Claude Code transcript JSONL files; maps vendor-specific field names to
  the vendor-neutral `UsageEvent` shape.
- **Path resolution**: the `~/.claude/projects` location and the cwd-to-dashes slug mapping live
  exclusively here; the core never sees an absolute path.
- **Two-level discovery**: `engine/src/observability/adapters/claude/discovery.js` exports
  `discover({ listDir, readText }) → { entries, unreadable }`, a pinned two-level walk —
  `<root>/*.jsonl` (main-loop) plus `<root>/<sessionId>/subagents/agent-*.jsonl` (sub-agent) —
  that performs no I/O of its own. `listDir`/`readText` are front-door-owned, already
  realpath-contained ports; `discover` only ever names relative paths, so it holds no
  path-resolution power of its own and is unit-testable against fakes with zero filesystem.
- **Sidecar labelling, not rollups** (ADR-328): rollups are never read, for tokens or for
  labels. Each sub-agent transcript's role/phase comes from the adjacent
  `agent-<id>.meta.json` sidecar's `agentType` field, read by `discover` and carried as opaque
  `context` into `parseLines`; every other sidecar field is discarded at the adapter boundary. A
  missing or malformed sidecar resolves to `role: null` — a counted fallback (see
  [Failure semantics](#failure-semantics)), never a throw.
- **Emission keyed on the assistant message, not the line**: Claude Code writes one transcript
  line per content block of a single assistant response (thinking, text, each `tool_use`), and
  every such line repeats the same `message.id` and the same request-level `input`/`cache_read`
  counts. `parseLines` emits exactly one `UsageEvent` per distinct `message.id`: the first
  usage-bearing line for an id pushes the event; a later line sharing that id replaces its
  `tokens`/`cacheCreationTtl` in place rather than pushing a duplicate, since `output_tokens` is
  monotonic across a turn's blocks and the last line carries the complete turn. A line carrying
  no `message.id` always pushes. `messages` on the resulting group therefore counts billed
  turns, not transcript lines. A rollup rides on a `user` line's `toolUseResult` and never
  carries `message.usage`, so it can never satisfy this rule — the two shapes are structurally
  disjoint.
- **sessionId injection** (ADR-186): when the caller supplies a `sessionId` the binding attaches
  it as the `run` field on each event, providing stable run identity across re-runs of the same
  session.
- **Spawn identity**: the front door (`usage-mine-main.js`) discovers one entry per transcript
  file and stamps an opaque positional ordinal onto each entry's parse context as `spawnId`
  before calling this binding — never the path, filename, or agent id. Because `parseLines` is
  invoked exactly once per sub-agent transcript, and one sub-agent transcript IS one spawn, every
  event a single call emits carries that call's `spawnId`, however many billed turns the
  transcript contains. Main-loop events always carry `spawnId: null`.
- **Compaction-cost estimate**: a `system` line whose `subtype` is `compact_boundary` opens a
  pending compaction keyed on the line's `sessionId` (the `run`) and its `sourceKind` (`'main'` or
  `'subagent'`, from the parse context); `cacheRead` is the boundary's `compactMetadata.preTokens`
  (a non-finite value coerces to `0`). The next `user` line carrying `isCompactSummary: true`
  closes it: `input` is the fixed band `[3000, 5500]`; `t = Math.ceil(summaryChars / 4)` from the
  summary message's character count; `output = [Math.round(1.2 * t), Math.round(2.8 * t)]`;
  `summaryMissing: false`. A pending compaction that never gets its summary line — the stream ends,
  or a second boundary opens first — closes instead with the fallback band `output = [1300, 2600]`
  and `summaryMissing: true`. Every `CompactionEstimate` this binding emits has the shape
  `{ run, sourceKind, cacheRead, input, output, summaryMissing }`; it carries no path and no
  summary text. Boundary and summary lines contribute no `UsageEvent` — they carry no
  `message.usage`.

The binding is called once per invocation by the CLI front-door (`engine/src/observability/usage-mine-main.js`),
which resolves flags, injects deps, and passes the resulting `UsageEvent[]` to `aggregate`.

## opencode binding

`engine/src/observability/adapters/opencode/telemetry.js` — the `opencode run --format json`
collect binding:

- **JSON-lines parsing**: reads `opencode run --format json` event lines; maps its field names
  (`sessionID`, `agent`, `tokens`, `toolCalls`, `durationMs`, …) to the same vendor-neutral
  `UsageEvent` shape the claude binding produces.
- **Core reused unchanged**: `aggregate`/`serializeReport` from `usage-aggregate.js` are consumed
  exactly as the claude binding consumes them — no core changes were required to add this binding.
- **Redaction**: whitelist-only, same discipline as the claude binding — only the fields listed in
  the `UsageEvent` shape are mapped; no path/`$HOME`/username/prompt fields ever reach the core.
- **Schema status**: the exact upstream opencode event schema is DEFERRED — the binding is pinned
  against frozen synthetic fixtures (`engine/test/fixtures/opencode/`) and will be re-pinned once a
  real opencode event stream is observed in a live smoke run.

Selected via `--source opencode` on the `usage-mine` front-door
(`engine/src/observability/usage-mine-main.js`), which resolves the binding, injects deps, and
passes the resulting `UsageEvent[]` to `aggregate` — identical wiring to the claude path.

## Pi binding

`engine/src/observability/adapters/pi/telemetry.js` — the `pi --mode json` collect binding for
the pidev coding agent:

- **JSON-lines parsing**: reads `pi --mode json` event lines; maps the pinned assistant
  `message.usage`/`message.model` fields, plus the session-header `id`, to the same
  vendor-neutral `UsageEvent` shape the claude and opencode bindings produce.
- **Stateful session id**: unlike the claude/opencode streams, pi's per-turn message lines do not
  repeat the session id — the binding holds the id from the header line across the stream and
  stamps it onto every event derived from later lines.
- **role/phase**: `role` is always `null` — pi has no subagent attribution. `phase` is
  caller-injected rather than read from the stream.
- **Core reused unchanged**: `aggregate`/`serializeReport` from `usage-aggregate.js` are consumed
  exactly as the claude and opencode bindings consume them — no core changes were required to add
  this binding.
- **Redaction**: whitelist-only, same discipline as the other bindings — only the fields listed in
  the `UsageEvent` shape are mapped; no path/`$HOME`/username/prompt fields ever reach the core.
- **Schema status**: the exact canonical per-turn usage line and real non-zero values are pinned
  against frozen synthetic fixtures (`engine/test/fixtures/pi/`); confirmation against a live
  `pi --mode json` stream is DEFERRED to the on-demand smoke.

Selected via `--source pi` on the `usage-mine` front-door
(`engine/src/observability/usage-mine-main.js`), which resolves the binding, injects deps, and
passes the resulting `UsageEvent[]` to `aggregate` — identical wiring to the claude and opencode
paths. The read root defaults to the pi coding agent's session directory rather than the claude
projects directory (source-aware read root — see the front-door module for the resolution order).

## Copilot binding

`engine/src/observability/adapters/copilot/telemetry.js` — the **OTel JSON-lines file exporter**
binding (`COPILOT_OTEL_FILE_EXPORTER_PATH`), deliberately **not** `--output-format json` (whose
`result` event carries no token counts) and **not** `session-store.db` (no token columns in any
table):

- **Structural discrimination, not name-based**: the exporter file is a mixed stream of OTLP
  **span** records and **metric** records, and `gen_ai.*` names overlap between the two tiers. The
  binding classifies a record as a span only when it carries both a `kind` field and an
  `instrumentationScope.name` equal to `github.copilot` (the OTel instrumentation-scope identifier
  the Copilot CLI emits) — never by inspecting `name` alone.
- **Single-tier selection rule**: the same tokens appear on three tiers — the leaf `chat <model>`
  span, summed again on the parent `invoke_agent` span, and summed again in the
  `gen_ai.client.token.usage` metric record. Ingesting more than one tier inflates reported cost
  up to 3x. The binding therefore counts **only** leaf `chat` spans (`gen_ai.operation.name ===
  'chat'`); `invoke_agent` and `execute_tool` spans and every metric record are excluded from
  token math structurally, not filtered after the fact.
- **role/phase**: `role` is `null` — no live subagent fan-out has yet pinned which attribute
  carries craft-role identity under `invoke_agent`, so it ships unset rather than guessed. `phase`
  is caller-injected, as in the pi and opencode bindings.
- **Cache fields**: `cacheRead`/`cacheCreation` have no pinned Copilot equivalent and are always
  `0`.
- **Core reused unchanged**: `aggregate`/`serializeReport` are consumed exactly as the other three
  bindings consume them — no core changes were required to add this binding.
- **Read root**: `DEFAULT_READ_ROOTS.copilot` resolves `COPILOT_OTEL_FILE_EXPORTER_PATH` to its
  containing directory per invocation (the env var names a single file, not a directory, unlike
  the claude/opencode/pi read roots), never frozen at module load.
- **Redaction**: whitelist-only, same discipline as the other three bindings.

Selected via `--source copilot` on the `usage-mine` front-door
(`engine/src/observability/usage-mine-main.js`), identical wiring to the other three sources.

**This page's `subjects: ['engine/src/observability/**']` frontmatter binds it to every change
under that path** — this Copilot binding lands inside that scope, so refreshing this section is
this change's own living-intention obligation, not an optional add-on.

## Codex binding

`engine/src/observability/adapters/codex/telemetry.js` — the `codex exec --json` stream binding,
whose envelope-shaped parser also reads a persisted rollout file sharing the same shape:

- **Envelope, not location, shaped**: the parser matches a `turn.completed` line wherever it
  appears in the stream rather than assuming a fixed position, because whether the *persisted*
  rollout `.jsonl` (what `--source codex` actually reads) carries the same envelope as the *live*
  `codex exec --json` stream (where the envelope is confirmed) is an open question — no local
  rollout history existed to read at implementation time. A shape mismatch fails safe: zero
  events, never a wrong count.
- **The leaf-vs-containment-root caveat is the load-bearing paragraph.** The miner's directory
  read is non-recursive, so `DEFAULT_READ_ROOTS.codex` resolves only the containment boundary
  (`$CODEX_HOME/sessions`) — `--dir` at invocation time must still name the `YYYY/MM/DD` leaf
  underneath it. Pointing `--dir` at the `sessions/` boundary itself yields a zero-cost report
  that reads as success: no error, no warning, just an empty `runs: []`. This is the same failure
  shape as an empty transcript source, and nothing distinguishes the two from the report alone.
- **`--ephemeral` is mutually exclusive with this source.** `--ephemeral` suppresses the very
  session files this binding mines, so the launch-args module never emits it — passing it would
  turn telemetry into a silent zero that reads as a successful, cost-free run.
- **Token arithmetic**: `turn.completed.usage` supplies
  `{input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens}`. `cacheRead` is
  capped at `min(cached_input_tokens, input_tokens)` and `input` is the remainder
  (`input_tokens - cacheRead`), so `input + cacheRead` reconstructs the reported `input_tokens`
  exactly on every turn regardless of which vendor convention (subset vs. disjoint cache
  accounting) actually applies — see ADR-258 and its amendment. `output` is `output_tokens` alone;
  `reasoning_output_tokens` is never added to it, the safe (never-over-report) direction.
- **role/phase**: `role` is `null` — subagent attribution is not yet pinned. `phase` is
  caller-injected, as in the pi, opencode, and copilot bindings.
- **Cache fields**: `cacheCreation` is always `0` — Codex has no pinned cache-write equivalent.
- **Session id**: like pi, the per-turn lines do not repeat the session id; it arrives once on
  `thread.started` and is held across the stream and stamped onto every later event.
- **Core reused unchanged**: `aggregate`/`serializeReport` are consumed exactly as the other four
  bindings consume them — no core changes were required to add this binding.
- **Redaction**: whitelist-only, same discipline as the other bindings.

Selected via `--source codex` on the `usage-mine` front-door
(`engine/src/observability/usage-mine-main.js`), identical wiring to the other four sources.

**This page's `subjects: ['engine/src/observability/**']` frontmatter binds it to every change
under that path** — this Codex binding lands inside that scope, so refreshing this section is
this change's own living-intention obligation, not an optional add-on.

## Aider binding

`engine/src/observability/adapters/aider/telemetry.js` — the persisted **markdown** transcript
binding for `.aider.chat.history.md`, written at the git root:

- **No live JSON stream**: Aider emits no live JSON stream and no structured usage envelope at
  all, unlike the codex/copilot bindings — the persisted `.aider.chat.history.md` markdown
  transcript IS the record; there is nothing else to parse.
- **Token-bearing line**: the parser scans for `> Tokens: <sent> sent, <received> received.`. A
  paid-provider run appends a `Cost: …` clause to the same line; the match carries no end anchor,
  so the clause is present but ignored.
- **Token convention**: `sent` maps to `input`, `received` maps to `output`. Aider reports no
  cache figures at all, so `cacheRead`/`cacheCreation` are always `0` — a SUBSET-style mapping
  where the two cache fields are simply absent, in contrast to codex's capped `cacheRead` and
  cursor's disjoint counts.
- **Model / session id**: the held `> Model:` header stamps the model onto every event emitted
  afterward. Aider transcripts carry no session id at all, so `run` is always `null`.
- **Counted skip, never silent-zero**: a `> Tokens:` line that does not yield two integers (a
  `k`/`M`/comma large-count form, or the unpinned `Cost:`-only form) is a counted skip — never a
  silent-zero event.
- **Pinned against a real session**: the parser is pinned against a real captured transcript
  fixture, `engine/test/fixtures/aider/real-session.md` (`781 sent, 19 received`).

Selected via `--source aider` on the `usage-mine` front-door
(`engine/src/observability/usage-mine-main.js`), discovering `.aider.chat.history.md` via the
per-source file matcher.

## Failure semantics

**Telemetry is advisory. It never gates a run.**

- A missing, empty, or unreadable transcript source returns an empty `UsageEvent[]`; `aggregate`
  emits `{ schemaVersion: 1, runs: [], note: 'no events provided' }`. No error is thrown.
- A transcript line that fails to parse is skipped silently; the surrounding lines are unaffected.
- The claude binding's two-level discovery adds four more counted-fallback branches, each
  surfaced as its own stderr line and none affecting the exit code: a sub-agent transcript whose
  `agentType` cannot be resolved from its sidecar (unlabelled), an unreadable `subagents/`
  directory, a discovered path refused by read containment, and a transcript that failed to open
  or parse. Every one degrades to a recorded fallback, never a throw.
- An unpriced model (not in the price table) produces a group with `cost.priced: null`; the
  `relative` cost (total token count) is always present.
- `baselineDeltas` is omitted when no `--baseline` file is supplied; its presence never affects
  aggregation correctness.
- `drift` is omitted under the same condition as `baselineDeltas` (no `--baseline` file
  supplied); an absent baseline means no drift block at all — advisory exit-0/continue, never a
  gate, never a STOP. An invalid or missing `--threshold` value silently falls back to
  `DEFAULT_DRIFT_THRESHOLD` (`0.25`) rather than erroring.
- **Config errors** (unknown binding, missing required opt) are caught at startup by the CLI
  validator and surfaced as a non-zero exit before any I/O begins — the same pattern as other
  adapter specs. `--source` accepts `claude` (default), `opencode`, `pi`, `copilot`, `codex`, or `aider`;
  any other value is rejected at startup with a targeted stderr message and a non-zero exit — the
  one deliberate exception to the miner's otherwise-always-0 advisory contract.

## Redaction

The report is **path-free by positive whitelist**. Only the fields explicitly listed in the
`UsageEvent` shape and the `report.json` schema below may appear in the output. Specifically:

- No absolute paths, `$HOME`, usernames, or hostname strings.
- No prompt text or response text.
- No PII of any kind.

Compliance rests on the claude binding's `collect` implementation mapping only the whitelisted
fields plus human review of any new binding's field set. There is no reject-at-write code; this
spec is the enforcement layer.

## Run identity: sessionId (ADR-186)

Each `UsageEvent` carries a `run` field that identifies the logical craft run the event belongs
to. The claude binding derives this from the `sessionId` supplied by the caller (the CLI reads it
from the session's stored metadata). A stable `sessionId` guarantees that re-running the miner
against the same session produces identical `run` values, making report diffing meaningful. The
`slug` field (human-readable run label, e.g. `feat/my-feature`) is distinct from `run` and is
optional.

## Main-loop inclusion / --no-inline (ADR-329)

Main-loop usage is **included by default**. Every main-loop assistant turn is attributed to a
single `role: 'main-loop'`, `phase: null` group per model — an exact total, deliberately not
split per phase (ADR-187's stated objection was to an approximate per-phase split, not to the
total; ADR-329 sidesteps it by never splitting). `messages` on that group counts billed
main-loop turns; `durationMs` stays `0` on every main-loop event (ADR-340) — the orchestrator's
wallclock span overlaps every sub-agent span spawned within it, so attributing it would roughly
double a run-hours figure the README FAQ scopes to role-agent activity alone.

- `--no-inline` drops the `role: 'main-loop'` group and nothing else. `auto-skip:` phase markers
  are still scanned from main-loop assistant text unconditionally — they carry no cost dimension
  and the scan runs before the inclusion check.
- `--include-inline` no longer exists.

## report.json schema

All object keys are **deep-sorted alphabetically** in the serialized file (see `serializeReport`).
The examples below reflect that sort order.

### Top level

```json
{
  "recommendations": [...],
  "runs": [...],
  "schemaVersion": 1
}
```

`baselineDeltas`, `drift`, and `note` are conditional:

- `baselineDeltas` appears only when `--baseline <file>` is passed.
- `drift` appears only when `--baseline <file>` is passed (same condition as `baselineDeltas`).
- `note` appears only when the input has no events: `"note": "no events provided"`.

Empty/advisory report (no events):

```json
{
  "note": "no events provided",
  "recommendations": [],
  "runs": [],
  "schemaVersion": 1
}
```

### Per run (`runs[*]`)

Keys deep-sorted: `groups`, `phaseTurns`, `reviewCycles`, `run`, `slug`.

```json
{
  "groups": [...],
  "phaseTurns": [...],
  "reviewCycles": [...],
  "run": "session-abc123",
  "slug": "feat/my-feature"
}
```

`slug` is `null` when no slug was recorded.

`compactionEstimate` is optional: present only when at least one `CompactionEstimate` (see
[Claude binding](#claude-binding) above) was attributed to this run (`count > 0`); omitted
entirely otherwise, so every byte-identical baseline report fixture stays untouched at count `0`.
Its own keys are deep-sorted too:

```json
{
  "basis": "estimate",
  "cacheRead": 24715,
  "count": 1,
  "equiv": [10542, 19802],
  "input": [3000, 5500],
  "main": 1,
  "output": [1014, 2366],
  "subagent": 0
}
```

`count`/`main`/`subagent` count the compactions folded into this run, split by
`CompactionEstimate.sourceKind`. `input`, `cacheRead`, and `output` are each summed across those
compactions. `equiv[i] = Math.round(input[i] * EQUIV_WEIGHT_INPUT + cacheRead *
EQUIV_WEIGHT_CACHE_READ + output[i] * EQUIV_WEIGHT_OUTPUT)`, the same three weights the
[metrics ledger row](#metrics-ledger-row) below shares from `metrics-line.js` (`1`, `0.1`, `5`).
`basis: 'estimate'` marks the whole key as advisory — it is never read by `groups`,
`recommendations`, `baselineDeltas`, or `drift`, and its presence leaves `schemaVersion` at `1`
(additive).

`report.md` renders one line right after the run's group lines when this key is present:
`Compactions: <count> (main <main>, sub-agent <subagent>) — estimated summary-call cost
<lo>k–<hi>k equiv (estimate; not in totals)`, with `<lo>`/`<hi>` = `Math.round(equiv[i] / 1000)`. A
run with no `compactionEstimate` renders no `Compactions:` line.

### Per group (`runs[*].groups[*]`)

Keys deep-sorted: `cacheEfficiency`, `cost`, `durationMs`, `messages`, `model`, `phase`,
`role`, `tokens`.

```json
{
  "cacheEfficiency": 0.42,
  "cost": { "priced": 0.00123, "relative": 4500 },
  "durationMs": 12400,
  "messages": 3,
  "model": "claude-sonnet-4-5",
  "phase": "implement",
  "role": "part-implementer",
  "tokens": {
    "cacheCreation": 1200,
    "cacheRead": 800,
    "input": 2000,
    "output": 500
  }
}
```

**tokens** keys deep-sorted: `cacheCreation`, `cacheRead`, `input`, `output`.

**cost** keys deep-sorted: `priced`, `relative`.
`priced` is the group's cost in **USD dollars** (`Σ(tokenClass × perMTokRate) / 1e6`), `null`
when the model is not in the price table; `relative` (sum of all token counts) is always
present.

**cacheEfficiency**: `cacheCreation / (cacheRead + cacheCreation)`, or `0` when the denominator
is zero.

### phaseTurns (`runs[*].phaseTurns[*]`)

Keys deep-sorted: `billedTurns`, `cycles`, `maxCost`, `meanCost`, `phase`, `role`, `toolCalls`,
`totalCost`.

```json
{
  "billedTurns": 127,
  "cycles": 3,
  "maxCost": { "priced": 0.0015, "relative": 5200 },
  "meanCost": { "priced": 0.00135, "relative": 4750 },
  "phase": "implementation",
  "role": "part-implementer",
  "toolCalls": 214,
  "totalCost": { "priced": 0.0027, "relative": 9500 }
}
```

One entry per distinct `(phase, role)` pair, over every event whose `phase` is non-`null` —
a main-loop event (`phase: null`) is not a phase and never contributes an entry. `cycles` is the
count of **distinct sub-agent spawns**, not billed turns: a single sub-agent can emit many
billed-turn events (one per assistant `message.id`), and each event carries the opaque `spawnId`
its transcript file was assigned (see [Spawn identity](#claude-binding) above) — `cycles` is
`new Set(events.map(e => e.spawnId)).size` over the pair's events. Events sharing no spawn
identity at all (an `undefined` `spawnId`, e.g. a binding with no per-spawn transcript boundary)
collapse into a single cycle rather than being assumed distinct. `billedTurns` is the size of the
underlying event list — a cost/schedule signal kept alongside `cycles` rather than dropped.
`toolCalls` is `Σ event.toolCalls`, treating a missing field (a non-claude binding) as `0`.

`totalCost`, `maxCost`, and `meanCost` are O(1)-per-pair aggregates over **all** of the pair's
events (every billed turn, not deduplicated by spawn), computed in the same pass that builds
`groups` — `phaseTurns` size stays proportional to distinct `(run, phase, role)` triples, never to
turn/message count. Each mirrors the `cost: { priced, relative }` shape every group already
carries: `priced` and `relative` are aggregated as two separate dimensions, never collapsed
together. `priced` is `null` for all three fields the moment any one turn's model lacks pricing —
a partial sum would misrepresent the pair's true cost, not merely omit a data point; `relative` is
always present.

### reviewCycles (`runs[*].reviewCycles[*]`)

Keys deep-sorted: `billedTurns`, `cycles`, `maxCost`, `meanCost`, `role`, `totalCost`.

```json
{
  "billedTurns": 5,
  "cycles": 2,
  "maxCost": { "priced": 0.0015, "relative": 5200 },
  "meanCost": { "priced": 0.00135, "relative": 4750 },
  "role": "reviewer",
  "totalCost": { "priced": 0.0027, "relative": 9500 }
}
```

`reviewCycles` is the `phase === 'review'` projection of [`phaseTurns`](#phaseturns-runsphaseturns)
above, with `phase` and `toolCalls` dropped — it predates `phaseTurns` and stays byte-identical to
what it emitted before `phaseTurns` existed, so the committed baseline snapshot and every consumer
already reading `reviewCycles` are unaffected. The two exist side by side because `reviewCycles` is
the narrower, older surface (`review-waste` reads it directly) while `phaseTurns` is the general
one every phase needs (`turn-budget` reads it). See phaseTurns above for what each field means;
`cycles` there is `new Set(events.map(e => e.spawnId)).size` over the role's review-phase events.

### Recommendations (`recommendations[*]`)

Keys deep-sorted: `detail`, `evidence`, `kind`, `model`, `phase`, `run`. `model-routing` and
`turn-budget` additionally carry a top-level `role`.

Four kinds are currently emitted:

**cache-hotspot** — phase has high cache-creation ratio relative to total run cost:

```json
{
  "detail": "phase implement has high cache-creation ratio",
  "evidence": {
    "cacheCreation": 1200,
    "pricedCreationCost": 0.0008,
    "shareOfRunCost": 0.65
  },
  "kind": "cache-hotspot",
  "model": "claude-sonnet-4-5",
  "phase": "implement",
  "run": "session-abc123"
}
```

**model-routing** — a cheaper model could serve the same phase at lower priced cost:

```json
{
  "detail": "consider claude-haiku-4-5 for phase review",
  "evidence": {
    "candidateModel": "claude-haiku-4-5",
    "currentModel": "claude-sonnet-4-5",
    "currentPricedCost": 0.0045,
    "projectedPricedCost": 0.0011
  },
  "kind": "model-routing",
  "model": "claude-sonnet-4-5",
  "phase": "review",
  "run": "session-abc123"
}
```

**review-waste** — a review role billed more turns than the configured threshold:

```json
{
  "detail": "role reviewer billed 112 turns across review",
  "evidence": {
    "billedTurns": 112,
    "cycles": 5,
    "maxCost": { "priced": 0.001, "relative": 3500 },
    "meanCost": { "priced": 0.001, "relative": 3500 },
    "role": "reviewer",
    "totalCost": { "priced": 0.005, "relative": 17500 }
  },
  "kind": "review-waste",
  "model": null,
  "phase": "review",
  "run": "session-abc123"
}
```

`evidence` mirrors its `reviewCycles` entry exactly, `billedTurns` included — see
[reviewCycles](#reviewcycles-runsreviewcycles) above for what each field means.

**turn-budget** — a phase/role pair billed more turns than the configured threshold. Unlike the
other three kinds, its scope is not limited to `review`: it fires for any phase in
[`phaseTurns`](#phaseturns-runsphaseturns):

```json
{
  "detail": "role part-implementer billed 291 turns in phase implementation",
  "evidence": {
    "billedTurns": 291,
    "cycles": 3,
    "phase": "implementation",
    "role": "part-implementer",
    "threshold": 200,
    "toolCalls": 312
  },
  "kind": "turn-budget",
  "model": null,
  "phase": "implementation",
  "role": "part-implementer",
  "run": "session-abc123"
}
```

`role` rides at the top level, the way `model-routing`'s does, so a downstream consumer routes on
it without reaching into `evidence`. `evidence` mirrors its `phaseTurns` entry plus `threshold`
(the exact `TURN_BUDGET_BILLED_TURNS` value compared against) — see phaseTurns above for what
`billedTurns`, `cycles`, and `toolCalls` mean. Comparison is strict `>`, matching `review-waste`.

### Baseline deltas (`baselineDeltas[*]`)

Present only with `--baseline <file>`. One entry per group that exists in both the current and
baseline reports (matched by `run + phase + role + model`). Keys deep-sorted:
`cacheEfficiencyDelta`, `model`, `phase`, `pricedCostDelta`, `role`, `run`, `tokensDelta`.

```json
{
  "cacheEfficiencyDelta": 0.05,
  "model": "claude-sonnet-4-5",
  "phase": "implement",
  "pricedCostDelta": -0.0003,
  "role": "part-implementer",
  "run": "session-abc123",
  "tokensDelta": {
    "cacheCreation": 100,
    "cacheRead": -50,
    "input": 200,
    "output": -80
  }
}
```

`pricedCostDelta` is `null` when either the current or the baseline group has `cost.priced: null`.
`tokensDelta` keys deep-sorted: `cacheCreation`, `cacheRead`, `input`, `output`.

### Drift (`drift[*]`)

Present only with `--baseline <file>` (same condition as `baselineDeltas`). An advisory
prompt-regression signal, computed by `computeDrift` in `usage-aggregate.js`: flags `(phase,
dimension)` pairs whose usage moved enough since the baseline to be worth a look. Keys
deep-sorted: `delta`, `dimension`, `phase`, `threshold`.

```json
{
  "delta": 0.31,
  "dimension": "tokens-total",
  "phase": "implement",
  "threshold": 0.25
}
```

- **Dimensions**: `tokens-total` (sum of all token kinds) and `durationMs`, checked
  independently — a phase can drift on one and not the other.
- **Values compared are per-phase MEANS per group occurrence, not sums.** The miner re-mines an
  accumulating transcript corpus, so raw sums grow with corpus size while means stay comparable —
  this makes the signal corpus-size-invariant; re-mining a grown corpus does not itself read as
  drift.
- **Phases are matched by name across sessions, never by run id** — a committed baseline snapshot
  can never share a run id with a fresh mining run.
- `delta` is the relative change from the baseline mean to the current mean:
  `(current - baseline) / baseline`.
  - `delta: null` — the phase has current-run activity but no baseline activity to compare
    against; `report.md` renders this as `"new (no baseline activity)"`.
  - A phase present in the baseline but absent from the current report yields `delta: -1` (its
    mean drops to zero).
- Only pairs that actually drifted are included: `delta === null`, or `|delta| > threshold`. A
  stable phase produces no entry — an empty `drift: []` means nothing crossed the threshold, not
  that no baseline was supplied (an absent baseline omits the `drift` key entirely instead).
- `threshold` is the value applied to that entry: `0.25` by default (`DEFAULT_DRIFT_THRESHOLD`),
  overridable per invocation with `--threshold <n>`; an invalid or missing value falls back to the
  default rather than erroring.

`report.md` renders a matching `## Phases drifted since baseline` section, one line per drifted
`(phase, dimension)` pair, when `drift` is non-empty.

The default committed baseline snapshot lives at
`docs/contributing/metrics-baseline.report.json`, refreshed on demand as part of a closing chore.

## Metrics ledger row

A second, distinct committed artifact from `report.json`: one append-only row per
agent-spawned phase in `.claude/craft-metrics.md`, written by `engine/bin/metrics-emit.js`
(invoked via `scripts/emit-metrics.sh`), formatted by the pure
`formatMetricsRow` (`engine/src/observability/metrics-line.js`). Field order is fixed:

```
<run-id> <phase-id> turns=<n> tool_calls=<n> tokens=<n> duration_ms=<n> cache_read=<n> cache_creation=<n> output=<n> avg_ctx=<n> equiv=<n>
```

- `turns` — the phase's billed-turn count (the slice's event count).
- `tool_calls` — summed `toolCalls` across the slice; `0` for a binding that supplies none.
- `tokens` — transcript-derived: `input + cache_read + cache_creation + output`, never the
  spawn's returned final-message usage block.
- `duration_ms` — summed AGENT time across the phase's spawns, never wall clock.
- `cache_read` / `cache_creation` — summed across the slice.
- `output` — summed output tokens.
- `avg_ctx` — `round((input + cache_read + cache_creation) / turns)`.
- `equiv` — a **relative unit, never a currency figure**:
  `input×1 + cache_read×0.1 + cache_creation×1.25 + output×5`, rounded. The weights are
  fixed constants so rows stay comparable to each other across the append-only ledger
  regardless of any price-table change.

**Two degraded forms**, never a silent `0`:

- No transcript found for the phase: the whole row collapses to
  `<run-id> <phase-id> transcript=na`.
- A transcript exists but at least one event in the slice lacks a cache split: the row
  keeps `turns`/`tool_calls`/`duration_ms`/`output`, the cache fragment renders
  `cache=na`, and `tokens`/`avg_ctx`/`equiv` — every field that would otherwise fold in
  the missing cache counts — cascade to `na` together rather than a misleading `0`.

**Emitter flags** (`engine/bin/metrics-emit.js` / `scripts/emit-metrics.sh`): `--run`
(required), `--phase` (narrows to one phase; an empty slice still renders, as
`transcript=na`), `--session`, `--dir`, `--ledger`, and `--since` — **not decoration**.
One session directory can hold two spawns of the same phase (a revision round, or
validation and architecture sharing one role); without `--since` as a lower bound on that
second call, its row re-counts the first spawn's events instead of describing only what
ran after it. Only sub-agent transcripts are parsed — a main-loop transcript is narrowed
out before the parse, since it carries no phase label and would be filtered out
downstream anyway.

Config errors (exit 1, one stderr line naming the flag): a missing `--run`; a `--run` or
`--phase` that fails `ROW_TOKEN` (`/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/`) — these are the
only caller-supplied strings that reach the committed ledger, the run-id originates in a
free-text brief relayed onto a command line, and an unchecked newline would append forged
rows to an append-only artifact; an unparseable `--since`; or a `--dir`/`--ledger` that
escapes its containment root.

A ledger read failure that is anything other than absent (`ENOENT`) refuses to write:
one stderr line (`ledger read failed (<code>), refusing to write`), exit 0 (advisory),
nothing written. Only a genuinely absent ledger starts a new one — any other read
failure leaves the prior content unknown, and writing would replace the append-only
history with header-plus-new-rows.

Unreadable transcripts and transcripts refused by containment are counted, not dropped:
when either count is non-zero the emitter writes one advisory line (`<n>
transcript(s) unreadable, <m> refused by containment`), exit unchanged.
