# Telemetry adapter spec

## Port interface

- `collect(opts, deps) → UsageEvent[]` — parse transcript data into a vendor-neutral stream of
  usage events that the pure core can aggregate.
  - **pre**: `opts` carries a `runFilter` (optional, restricts which run IDs to include),
    `includeInline` flag (opt-in, see [ADR-187 gap](#inline-gap)); `deps` carries
    `readTranscripts: () => AsyncIterable<string>` and an optional `sessionId` (the run-identity
    string, see [ADR-186 below](#run-identity-sessionid)). The adapter never receives an absolute
    path; the `readTranscripts` provider owns the runtime path.
  - **post**: each returned `UsageEvent` is path-free, PII-free, and carries only the fields the
    core expects: `run`, `slug?`, `phase`, `role?`, `model`, `tokens`, `messages`,
    `durationMs`, `cacheCreationTtl?`. The adapter never throws; partial data returns a partial
    (possibly empty) array, never a rejection.

- `aggregate(events, priceTable, baselineReport?) → report` — pure core function consuming the
  `UsageEvent[]` stream produced by `collect`; emits the structured `report` object documented
  in the [report.json schema](#reportjson-schema) section. Lives in `engine/src/usage-aggregate.js`
  and is fully deterministic: no clock, no random, no runtime paths.

- `serializeReport(report) → string` — stable serialization: `JSON.stringify(sortDeep(report), null, 2) + '\n'`.
  All object keys deep-sorted alphabetically; 2-space indent; single trailing newline. The serialized
  form is the stable artifact written to `report.json` or stdout.

## Binding set

The valid bindings are **`{ claude, pi }`**.

## Claude binding

`engine/src/telemetry-claude.js` — the single binding that owns every runtime specific:

- **JSONL parsing**: reads Claude Code transcript JSONL files; maps vendor-specific field names to
  the vendor-neutral `UsageEvent` shape.
- **Path resolution**: the `~/.claude/projects` location and the cwd-to-dashes slug mapping live
  exclusively here; the core never sees an absolute path.
- **Spawn-rollup shape**: events that represent rolled-up spawn usage are mapped to their logical
  `phase`/`role` before entering the core stream.
- **sessionId injection** (ADR-186): when the caller supplies a `sessionId` the binding attaches
  it as the `run` field on each event, providing stable run identity across re-runs of the same
  session.

The binding is called once per invocation by the CLI front-door (`engine/src/usage-mine-main.js`),
which resolves flags, injects deps, and passes the resulting `UsageEvent[]` to `aggregate`.

## Pi binding

**RESERVED — not built.**

The seam is documented here so a future implementer can bind a Raspberry Pi (or equivalent
single-board-computer) metrics source without touching the engine core. The contract is:

- Supply a `deps.readTranscripts` that yields the device's equivalent of Claude Code transcript
  records in the same JSONL line-object shape the claude binding uses (or pre-map them to
  `UsageEvent[]` directly).
- The `aggregate` + `serializeReport` path is fully reusable; only the `collect` binding changes.

The validator rejects `source: pi` at startup with a targeted hint to wait for the built binding.
Only the `claude` binding is currently valid.

## Failure semantics

**Telemetry is advisory. It never gates a run.**

- A missing, empty, or unreadable transcript source returns an empty `UsageEvent[]`; `aggregate`
  emits `{ schemaVersion: 1, runs: [], note: 'no events provided' }`. No error is thrown.
- A transcript line that fails to parse is skipped silently; the surrounding lines are unaffected.
- An unpriced model (not in the price table) produces a group with `cost.priced: null`; the
  `relative` cost (total token count) is always present.
- `baselineDeltas` is omitted when no `--baseline` file is supplied; its presence never affects
  aggregation correctness.
- **Config errors** (unknown binding, missing required opt) are caught at startup by the CLI
  validator and surfaced as a non-zero exit before any I/O begins — the same pattern as other
  adapter specs.

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

## Inline gap / --include-inline (ADR-187)

Phase usage emitted by the orchestrator's inline execution path (phases that run without spawning
a subprocess) is not captured in transcript rollup records. This is a known gap:

- By default the miner omits inline phase events; the `runs[*].groups` for those phases will be
  absent.
- Passing `--include-inline` opts in to experimental inline-event capture. The `UsageEvent[]`
  stream may then contain additional events tagged with `role: 'inline'`; coverage and accuracy
  depend on transcript completeness.

Document this gap in any dashboard or report that presents per-phase totals.

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

`baselineDeltas` and `note` are conditional:

- `baselineDeltas` appears only when `--baseline <file>` is passed.
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

Keys deep-sorted: `groups`, `reviewCycles`, `run`, `slug`.

```json
{
  "groups": [...],
  "reviewCycles": [...],
  "run": "session-abc123",
  "slug": "feat/my-feature"
}
```

`slug` is `null` when no slug was recorded.

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
  "role": "craft:part-implementer",
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
`priced` is `null` when the model is not in the price table; `relative` (sum of all token
counts) is always present.

**cacheEfficiency**: `cacheCreation / (cacheRead + cacheCreation)`, or `0` when the denominator
is zero.

### reviewCycles (`runs[*].reviewCycles[*]`)

Keys deep-sorted: `costPerCycle`, `cycles`, `role`.

```json
{
  "costPerCycle": [0.0012, 0.0015],
  "cycles": 2,
  "role": "craft:reviewer"
}
```

`costPerCycle` is an array with one entry per review cycle. Each entry is the priced cost of that
cycle when the model is priced, or the relative cost otherwise.

### Recommendations (`recommendations[*]`)

Keys deep-sorted: `detail`, `evidence`, `kind`, `model`, `phase`, `run`.

Three kinds are currently emitted:

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

**review-waste** — a review role accumulated more cycles than the configured threshold:

```json
{
  "detail": "role craft:reviewer has 5 review cycles",
  "evidence": {
    "costPerCycle": [0.001, 0.001, 0.001, 0.001, 0.001],
    "cycles": 5,
    "role": "craft:reviewer"
  },
  "kind": "review-waste",
  "model": null,
  "phase": "review",
  "run": "session-abc123"
}
```

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
  "role": "craft:part-implementer",
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
