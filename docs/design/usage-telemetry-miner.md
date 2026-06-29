# Design — usage-telemetry-miner (`craft:metrics`)

> Brief: a reusable, zero-arg front-door tool that mines Claude Code session
> transcripts into an empirical per-phase cost / cache / duration model of craft
> runs, so evidence — not guesswork — drives optimization (improve craft itself;
> feed `craft:init` a data-driven manifest). Hexagonal: vendor-neutral core +
> `claude` parse binding, `pi` seam reserved.
> Status: draft → self-reviewed ×3 → accepted-pending-ADR

## Context

What exists today, and the patterns this feature must follow:

- **Hexagonal port pattern is established.** The Execution and Memory ports each
  carry a pure core plus a `{claude, pi}` binding set, with the contract in
  `docs/adapters/<port>.md`. See `docs/adapters/execution.md` (the `spawn`/`runInline`
  verbs, the "contribution is in a committed artifact" post-condition, and the
  documented fact that `result` carries the worker's **usage block**) and
  `docs/adapters/memory.md` (advisory-only invariant ADR-116; content-whitelist /
  no-leak; per-repo `repoRoot` scoping; traversal containment on every path). The
  telemetry port mirrors this exact shape: pure core in `engine/src/`, a `claude`
  binding holding every runtime specific, a reserved (un-built) `pi` seam.
- **`engine/bin` shim convention (conf 0.7).** Bins are ~5-line shims over
  `engine/src/<name>-main.js`; all logic lives in `engine/src/` so mutation testing
  (`npm --prefix engine run mutation`, scope `engine/src/**` per `engine/stryker.conf.json`)
  covers it. Bins are never mutated; their spawn-smoke tests go in
  `engine/test/<name>.bin.test.js`. Reference: `engine/bin/init-emit.js` →
  `engine/src/init-emit-main.js` → `engine/test/init-emit.bin.test.js`.
- **External-read boundary helper.** `engine/src/contain.js` (`containByRealpath`)
  does realpath-hardened, fail-closed containment: lexical reject, then symlink-leaf
  reject, then realpath-escape reject; returns the **lexical** target on success.
  Its documented TOCTOU caveat (the returned value is lexical and the caller does
  the real I/O on it) is acceptable under the local advisory threat model — the same
  basis `policy.js`/`memory.js` rely on. This feature routes the out-of-repo
  transcript dir and the in-repo output path through it (two roots — see Design).
- **Source-hygiene (post-P27).** `test/source-hygiene.test.js` greps a fixed
  `SCANNED_PATHS` set (which **includes** `engine/src` and `docs/adapters`) for two
  pattern classes only: Class A = mutation-technique tool names; Class B = VCS-host
  CLI (`\bgh\b|\bgithub\b`). It does **not** scan for `claude`/`anthropic`/JSONL
  field names — `engine/src` already legitimately contains `.claude/...` paths and a
  `claude:` binding key (`policy.js`). So the real constraint here is **architectural,
  not lexical**: the JSONL schema, the `~/.claude/projects` location, the cwd→dashes
  mapping, and field names like `cache_read_input_tokens` live in the `claude`
  binding (`engine/src/telemetry-claude.js`), never in the vendor-neutral core
  (`engine/src/usage-aggregate.js`). Enforcement is the boundary in this doc + review,
  exactly as the Memory content-whitelist is document-enforced (ADR-123).
- **Existing metrics writer.** `.claude/craft-metrics.md` is an append-only file the
  orchestrator writes per phase (ADR-119) as
  `<run-id> <phase-id> tokens=… duration_ms=… cache=<…>`. Today every row reads
  `cache=na`. The Memory adapter doc states metrics "come from the usage block the
  spawn already returns — zero extra cost". This design proves that file is a lossy
  projection of data captured in full fidelity by the runtime (see the empirical pin
  below), and proposes upgrading the lossy `cache=na` field (decision candidate 3).

Prior constraints that bind this design (from the brief, non-negotiable):
advisory-never-gating (absent/empty/malformed dir = recorded no-op, never an error —
Memory-port parity); redaction/no-leak (no absolute paths, `$HOME`, usernames, PII,
or prompt/response text in output); deterministic core (no `Date.now()`/random; all
time from event data → byte-stable fixture round-trips); pricing as overridable data;
stream the largest transcript without OOM.

## Requirements

Verifiable statements that must hold when this ships:

1. **Front door.** A zero-arg skill (`skills/metrics/SKILL.md`) anyone runs in-place,
   like `craft:init`: it resolves the current repo's transcript dir, mines it, and
   writes the report inside the repo. Flags on the underlying bin: `--dir <path>`
   (override), `--baseline <dir|run-id>` (run-over-run diff), `--since <date|run-id>`.
2. **Streaming parse.** The largest transcript (~tens-to-hundreds of MB; the corpus is
   ~631 MB total) is read line-by-line via `node:readline` over a `createReadStream`
   — never `readFileSync` of a whole file. Memory stays bounded regardless of file size.
3. **Empirically-derived schema.** The `claude` binding parses the JSONL shape pinned
   below from REAL transcripts (not remembered field names — one remembered name was
   wrong; see the matrix).
4. **Attribution.** Each spawned worker's usage rollup maps `agentType` → craft
   phase/role; inline phases with no rollup are a **noted gap**, never fabricated.
5. **Aggregation.** Per `(run, phase/role, model)`: token sums by class, message count,
   wall-clock, and **cost** in two forms — priced (declared overridable table) and
   relative units (when prices absent). Derived: `cacheEfficiency = creation /
   (read + creation)`; review-cycle count + per-cycle cost; run-over-run deltas vs
   `--baseline`.
6. **Two artifacts inside the repo.** A machine `report.json` (STABLE, versioned,
   documented schema — the consumer contract `craft:init` will read) and a human
   `report.md` ranking the biggest token sinks, worst cache-busters, and concrete
   recommendations.
7. **Advisory/no-leak/deterministic** as stated in Context. Output contains only
   mechanically-derived numbers + phase/model labels; paths are dropped.
8. **Acceptance:** runs over both craft's own and the tsgit transcripts and produces
   `report.{json,md}`; surfaces, with numbers, the cache-creation cost hotspot and ≥1
   model-routing recommendation; a fixture stream round-trips byte-stable; core ≥80%
   coverage + mutation-clean; lint / source-hygiene / CI green.

## Design

### Empirically-pinned JSONL matrix (the foundation of the parse binding)

Sampled live from `~/.claude/projects/-Users-scolladon-workspace-perso-craft/*.jsonl`
(craft's own runs) and cross-checked against `…-node-tsgit/*.jsonl`, streaming with
`head`/`grep`/`jq` (never catting a whole file). **Recorded facts, not memory:**

**Per-line top-level fields** (every non-summary line): `type`, `message`,
`isSidechain`, `parentUuid`, `sessionId`, `timestamp` (ISO-8601, e.g.
`2026-06-25T13:41:19.356Z`), `cwd`, `gitBranch`, `slug`, `uuid`, `version`,
`userType`, `entrypoint`. On a subset: `attributionPlugin` (`"craft"`),
`attributionSkill` (`"craft:design"`, `"craft:implementation"`, `"craft:review"`, …),
`toolUseResult`, `promptId`, `sourceToolAssistantUUID`, `sourceToolUseID`, `isMeta`,
`requestId`.

**Assistant line** (`type=="assistant"`): `message.role=="assistant"`,
`message.type=="message"`, `message.model`, `message.usage`:

| Field | Meaning |
|---|---|
| `message.usage.input_tokens` | uncached input tokens (full price) |
| `message.usage.cache_read_input_tokens` | served from cache (≈0.1× input price) |
| `message.usage.cache_creation_input_tokens` | written to cache (1.25× 5m / 2× 1h) |
| `message.usage.output_tokens` | output tokens |
| `message.usage.cache_creation` | `{ ephemeral_5m_input_tokens, ephemeral_1h_input_tokens }` — the TTL split of creation, enabling exact cache-write pricing |
| `message.usage.{server_tool_use,service_tier,inference_geo,iterations,speed}` | present; not load-bearing here |
| `message.model` | `"claude-opus-4-8"` **or** `"<synthetic>"` — synthetic = injected, zero-cost; **must be excluded** |

**CORRECTION TO THE REMEMBERED SHAPE — the spawn tool is `Agent`, not `Task`.**
In this corpus the sub-agent spawn is an assistant `message.content[]` block of
`type=="tool_use"` with `name=="Agent"` (the stock-Claude-Code alias is `Task`; the
binding accepts both — see DC7). Its `input` carries `subagent_type`
(`"craft:designer"`, `"craft:part-implementer"`, `"craft:reviewer"`, `"craft:planner"`,
`"craft:validation-triager"`, `"craft:harness-triager"`, `"craft:docs-writer"`, …),
`description`, `prompt`, `subject`, and `input.model` (frequently `null` — the model is
not pinned in the spawn input).

**THE ATTRIBUTION + USAGE ROLLUP — the gold, and it is NOT a sidechain.** In this
corpus `isSidechain` is **never `true`** in either the craft or tsgit projects;
sub-agents do not appear as inline `isSidechain`/`parentUuid` messages. Instead, each
`Agent` spawn's **result line** carries a `toolUseResult` object that is a complete
per-spawn rollup:

| `toolUseResult` field | Meaning |
|---|---|
| `agentType` | `= subagent_type` → maps to craft phase/role |
| `resolvedModel` | the ACTUAL model the worker ran on (see distinct values below) |
| `status` | `"completed"` etc. |
| `totalDurationMs` | wall-clock for the spawn |
| `totalTokens` | sum of the four token classes (see proof below) |
| `totalToolUseCount` | tool calls made |
| `toolStats` | `{ bashCount, editFileCount, linesAdded, linesRemoved, otherToolCount, readCount, searchCount }` |
| `usage` | **aggregate sums** over the worker's turns: the same four token-class fields + `cache_creation` TTL split |
| `agentId` | opaque id |

**Proof the rollup reconstructs (and enriches) the metrics file.** For the
`craft:designer` spawn with `totalDurationMs=589907`: `totalTokens=197219`, and
`usage = {input:2, cache_read:196062, cache_creation:255, output:900}` → `2 + 196062 +
255 + 900 = 197219`. The hand-rolled `.claude/craft-metrics.md` row reads
`p27-despecialize-craft-sources design tokens=197219 duration_ms=589907 cache=na`.
**Both numbers match exactly** — the metrics file's `tokens=` is `totalTokens`, its
`duration_ms` is `totalDurationMs`, and its `cache=na` is precisely the read/creation
split already present in `toolUseResult.usage`. The file is a lossy projection; the
miner is the lossless read.

**Cross-corpus note (acceptance over tsgit):** the tsgit project used a non-craft
skill (`attributionSkill=="apply-workflow"`) and carries **no `craft:*` `Agent`
spawns** — so its report is spawn-rollup-sparse and exercises the inline path (DC6),
not the per-phase rollup path. It still "produces `report.{json,md}`" (acceptance 8);
the binding's `agentType`→phase map simply has nothing to key on there, which is a
correct empty/inline result, not an error.

Distinct `resolvedModel` across the craft corpus: `claude-opus-4-8[1m]` (×199),
`claude-sonnet-4-6` (×165), `claude-fable-5` (×2). The `[1m]` suffix is the
1M-context variant; per the `claude-api` skill, Opus 4.8 is 1M context at standard
price (no long-context premium), so the binding **normalizes** `claude-opus-4-8[1m]` →
`claude-opus-4-8` for price lookup. Assistant-line `message.model` across the corpus:
`claude-opus-4-8` (×11406) and `<synthetic>` (×31, filtered).

### Hexagonal layout (ratifies the brief's proposal)

| File | Role |
|---|---|
| `engine/src/usage-aggregate.js` | **Pure core.** `(UsageEvent[], priceTable) → report` object. Vendor-neutral: no field names, no paths, no model literals, no `Date.now()`/random. |
| `engine/src/telemetry-claude.js` | **`claude` binding.** JSONL line → `UsageEvent`. Owns: `~/.claude/projects/<cwd→dashes>` resolution, the schema above, the `Agent`/`Task` tool name, synthetic-model filter, `agentType`→phase map, `resolvedModel` normalization. |
| `engine/src/pricing-claude.js` | **Binding-owned price data** (see DC2): `{ [modelId]: { input, cacheRead, cacheCreation5m, cacheCreation1h, output } }`, marked `PRICES_AS_OF`, overridable via `--prices`. |
| `engine/src/usage-mine-main.js` | **Streaming orchestration entrypoint.** arg-parse → resolve+contain dir → stream files → parse via binding → aggregate via core → redact → write `report.{json,md}` (contained to repo). |
| `engine/bin/usage-mine.js` | ~5-line shim over `usage-mine-main.js` (mutate scope excludes it). |
| `scripts/mine-transcripts.sh` | thin convenience wrapper invoking the bin. |
| `skills/metrics/SKILL.md` | zero-arg front door: probe dir → invoke bin → report path back. |
| `docs/adapters/telemetry.md` | **port spec + `report.json` schema** — the stable consumer contract. |
| `test/fixtures/telemetry/*.jsonl` | tiny sanitized fixtures, no PII. |
| `engine/test/usage-aggregate.test.js`, `engine/test/telemetry-claude.test.js`, `engine/test/usage-mine.bin.test.js` | tests. |

### The vendor-neutral seam: `UsageEvent`

The binding flattens each spawn rollup into one `UsageEvent`; the core never sees a
JSONL field name, a model literal it interprets, or a path:

```
UsageEvent {
  run:        string,   // opaque run id (sessionId) — see DC5
  phase:      string,   // vendor-neutral label: "design" | "implementation" | "review" | ...
  role:       string | null,   // finer label: "part-implementer" | "reviewer:security" | ...
  model:      string,   // opaque price-table key (binding already normalized "[1m]")
  tokens:     { input, cacheRead, cacheCreation, output },   // neutral field names
  cacheCreationTtl: { ms5m, ms1h } | null,   // for exact write pricing; null when absent
  messages:   number,   // turn / tool-use count
  durationMs: number,   // wall-clock from totalDurationMs (event data, not the clock)
}
```

`priceTable` is injected into the core as data: `{ [modelKey]: { input, cacheRead,
cacheCreation5m, cacheCreation1h, output } }` in price-per-token (or per-MTok, fixed
unit). Missing key → that event is priced in **relative units only** (token-weighted),
never a crash.

### Core: `usage-aggregate.js` (deterministic)

Consumes `UsageEvent[]` + `priceTable`, produces the report object. Pure reductions,
stable sort by `(run, phase, model)`, JSON serialized with sorted keys → byte-stable.

- Per `(run, phase, model)` group: `tokens` sums by class; `messages`; `durationMs`;
  `cost.priced` (sum of class×rate; creation split by `cacheCreationTtl` when present,
  else default to the 5m rate) and `cost.relative` (token-weighted units, always
  available); `cacheEfficiency = cacheCreation / (cacheRead + cacheCreation)` (→1 = a
  cache-busting phase).
- Review cycles: group `phase=="review"` events by `role` dimension, count cycles
  (`review-code`, `review-code-cycle2`, …), emit per-cycle cost.
- Run-over-run deltas: when a baseline report/run is supplied, emit per-phase token /
  cost / cacheEfficiency deltas.
- `report.md` ranks: top token sinks, worst cache-busters (high `cacheEfficiency`),
  recommendations (over-tiered role → cheaper model; cache-busting phase →
  reorder/stabilize prefix; review-cycle waste → `harness.incremental`).

The cache-creation hotspot the brief asks us to quantify falls straight out: with
cache_read priced ≈0.1× and cache_creation 1.25–2×, a phase whose `cache_creation_input_tokens`
is a small fraction of total tokens can still be a large fraction of *cost* — the core
reports the priced split per phase so the hotspot is a number, not a claim.

### Streaming entrypoint & external-read boundary

`usage-mine-main.js`:

1. Resolve the transcript dir. Default = `~/.claude/projects/<cwd-with-/→->`; `--dir`
   overrides. **Containment 1 (read):** `containByRealpath(<~/.claude/projects>, resolvedDir)`
   — root is the projects dir, so a `--dir` that escapes it via traversal/symlink is
   rejected (returns the lexical dir on success). The brief's "route through the same
   realpath containment the memory/policy helpers use" is satisfied with the projects
   dir as the root rather than the repo root, because the transcript dir is *outside*
   the repo by construction.
2. For each `*.jsonl`: `readline` over `createReadStream` → `JSON.parse` each line
   (malformed line skipped with a counted note, never a throw — advisory). Filter
   `<synthetic>`; extract `Agent`/`Task` rollups → `UsageEvent[]`.
3. Aggregate via the core; redact (drop paths — DC4); write `report.json` then
   `report.md`. **Containment 2 (write):** `containByRealpath(repoRoot, outputPath)` —
   output lands only inside the repo.

Note the `contain.js` TOCTOU caveat: the returned dir is lexical and we then stream it.
Acceptable under the local advisory threat model (identical basis to memory/policy);
documented, not closed.

### Advisory / no-leak / determinism

- Absent / empty / malformed / out-of-bounds dir → recorded no-op report
  (`{ schemaVersion, runs: [], note: "<reason>" }`), exit 0. Never an error or blocker
  (Memory-port / ADR-116 parity).
- Output is numbers + phase/model labels only. `sessionId` is opaque (a UUID, not a
  path); `slug` is a feature name the user chose (no `$HOME`/username) — included as a
  label. No prompt/response text ever enters the report.
- Core takes all time from `durationMs`/`timestamp` in event data; no `Date.now()`,
  no random; JSON keys sorted → fixture round-trip is byte-stable.

### `report.json` consumer contract (documented in `docs/adapters/telemetry.md`)

Versioned (`schemaVersion`), stable shape `craft:init` can read to suggest
`models.<agent>` / profile / skip candidates from a repo's own measured runs. Wiring
`craft:init` to consume it is a FOLLOW-UP (non-goal); the schema is designed and
documented as that stable input now.

## Decision candidates

The designer never decides these; the user does, in the ADR phase.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | **New Telemetry port** vs extend Execution for the parse binding | (a) New dedicated Telemetry port: pure core + `{claude,pi}`, spec in `docs/adapters/telemetry.md`; (b) extend the Execution port (parse "reads back" what `spawn` produced); (c) plain module pair, no port ceremony | **(a)** | Execution is about *running* workers (`spawn`/`runInline`); telemetry is about *reading their recorded exhaust* — opposite direction, different lifecycle, different binding (a file-format parser vs a process launcher). A new port mirrors the established `{claude,pi}` shape and reserves the `pi` seam cleanly; folding it into Execution overloads that port. |
| 2 | **Pricing table location + how it stays current** | (a) Binding-owned data module `engine/src/pricing-claude.js`, `PRICES_AS_OF` marker, `--prices <file>` override, doc links the `claude-api` skill as authority; (b) external committed `prices.json` loaded at runtime; (c) core constant | **(a) + `--prices`** | Pricing is claude-runtime data → belongs in the binding, not the vendor-neutral core (rules out (c)). The doc records the pinned default table sourced from `claude-api` (opus-4-8 $5/$25, sonnet-4-6 $3/$15, fable-5 $10/$50, haiku-4-5 $1/$5 per MTok; cacheRead ≈0.1×input, cacheWrite 1.25×/2×) with an explicit update-needed marker; `--prices` lets any repo override without patching engine code. Missing model → relative units. |
| 3 | **Supersede vs complement `.claude/craft-metrics.md`** (and upgrade `cache=na`) | (a) Complement: miner = deep offline read, metrics file = cheap live append; ALSO upgrade the writer's `cache=na` → `cache_read=…/cache_creation=…` (already in `toolUseResult.usage`, zero extra cost); (b) supersede: stop writing the file, reconstruct on demand; (c) complement now, deprecate later | **(a)** | The miner *proves* the file is a lossy projection (durations + `tokens=` matched exactly; `cache=na` is the recoverable read/creation split). But the file is a cheap, diffable, in-repo, dependency-free live breadcrumb the orchestrator already appends — keep it, upgrade its one lossy field, and let the miner be the offline ~631 MB deep read. Superseding would couple every run to a full transcript scan. *(Flag for ADR: the writer upgrade is a small orchestration change — may land as a follow-up.)* |
| 4 | **Redaction strength: drop vs hash paths** | (a) Drop — output has zero paths, only numbers + phase/model labels (Memory content-whitelist parity); (b) hash absolute paths with a stable salt for cross-run correlation; (c) relativize (strip `$HOME`/repo-root, keep tail) | **(a) drop** | The consumer contract needs numbers + phase/model labels, not paths; runs already correlate by opaque `sessionId`, so hashing adds a salt-management surface for a need the report doesn't have. Dropping is the simplest provable no-leak and matches the memory port. |
| 5 | **Run-identity key** | (a) `sessionId` (one orchestrator session = one run), `slug` as label; (b) `slug` (matches metrics-file grouping; merges resumed sessions); (c) composite `slug+firstSessionId` | **(a), slug as label** | `sessionId` is the only field that cleanly bounds one transcript; `slug` can repeat across reruns and a resumed run spans sessions. Document multi-session-run merging as a known limitation / follow-up. |
| 6 | **Inline-phase usage** (phases run in-session with no `Agent` rollup: workspace, requirements, decisions, propose, integrate, doc-tick) | (a) noted gap — count as "no spawn usage block", don't fabricate (brief's default); (b) bucket the orchestrator's own `attributionSkill`-tagged assistant lines into per-phase sums; (c) hybrid: gap by default, `--include-inline` opt-in for the approximate bucketing | **(c)** | Honors "don't fabricate" by default while leaving the richer signal reachable. The approximation's caveat — the orchestrator session's `cache_read` accumulates across phases, inflating any single inline phase — is documented so consumers don't over-trust it. |
| 7 | **Spawn-tool name robustness** | (a) accept both `Agent` (pinned in this corpus) and `Task` (stock Claude Code) tool names, and both `toolUseResult.agentType` and `input.subagent_type`; (b) `Agent`-only (this corpus); (c) `Task`-only (remembered) | **(a) accept both** | The empirical pin corrected the remembered `Task`→`Agent`. Accepting both names + both attribution keys makes the binding robust across harness versions for one extra `||`; pinning to a single name silently zero-attributes the other harness. |

## Test strategy

- **Core (`usage-aggregate.test.js`)** — TDD, ≥80% coverage + mutation-clean (the
  mutate target). Given hand-built `UsageEvent[]` + a fixed price table, assert: per-group
  token/cost/duration sums; `cacheEfficiency`; review-cycle counting; baseline deltas;
  relative-units fallback when a model is absent from the table; deterministic byte-stable
  JSON (sorted keys, no clock). Property lens: aggregate is a fold — sum over a permuted
  event list is order-invariant; round-trip of a fixture event stream is byte-stable.
- **Binding (`telemetry-claude.test.js`)** — feed sanitized fixture JSONL lines (the
  pinned shapes: an `Agent` rollup, a `Task` alias, a `<synthetic>` assistant line, a
  malformed line, a `claude-opus-4-8[1m]` model). Assert: correct `UsageEvent` extraction;
  `[1m]` normalization; synthetic exclusion; malformed line skipped+counted, never thrown;
  `agentType`→phase map. Containment: a `--dir` escaping `~/.claude/projects` and an
  `outputPath` escaping the repo are both rejected.
- **Bin smoke (`usage-mine.bin.test.js`)** — `spawnSync` the shim against a tiny fixture
  dir in a `mktemp` throwaway (never the worktree): exits 0, writes `report.{json,md}`
  inside the temp repo; empty/absent dir → exit 0 + no-op report with a note.
- **Acceptance (manual, recorded in the doc/PR, not CI-gated like the Pi PoC):** run over
  the real craft and tsgit transcript dirs; confirm `report.{json,md}` produced, the
  cache-creation hotspot quantified, ≥1 model-routing recommendation surfaced, and the
  largest transcript streamed without OOM.
- **Lints:** `test/source-hygiene.test.js` stays green (core + binding under `engine/src`
  carry no Class-A/B tokens — `claude`/JSONL field names are not scanned); live-doc /
  structure lints over the new design doc and `docs/adapters/telemetry.md`.

## Out of scope

- **Wiring `craft:init` to auto-consume `report.json`** — follow-up; the schema is
  designed and documented as that stable input now, but the wiring is a separate change.
- **The `pi` transcript binding** — the seam is reserved in `docs/adapters/telemetry.md`,
  not built (parity with the Pi-PoC posture).
- **Live dashboards / continuous collection** — the miner is an on-demand offline read.
- **Multi-session run merging by `slug`** — runs key by `sessionId` (DC5); merging a
  resumed run's sessions is a documented limitation / follow-up.
> **Note (ADR-184):** the `.claude/craft-metrics.md` writer upgrade (DC3 `cache=na` →
> read/creation split) is **in scope this run** — the ratified decision folds it in. The
> writer recovers the split by parsing the run's own spawn-rollup lines through the same
> `telemetry-claude` parser (the live `Agent` `<usage>` block exposes only
> `subagent_tokens`), degrading to `cache=na` only when a spawn's split is genuinely
> absent. Planning carries it as its own part.
