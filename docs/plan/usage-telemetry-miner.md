# Plan — usage-telemetry-miner

> Source: design doc `docs/design/usage-telemetry-miner.md` · ADRs `182, 183, 184, 185, 186, 187, 188`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone.
- A part that would be a pure test pass over already-landed code merges into its neighbour.

## Plan shape (7 parts, sequential, one working tree `feat/usage-telemetry-miner`)

| # | Part | Archetype | src delta |
|---|---|---|---|
| 1 | Pure core `usage-aggregate.js` (+ md render + canonical serialize) | pure-module | yes |
| 2 | Pricing binding `pricing-claude.js` | schema/data-module | yes |
| 3 | Claude parse binding `telemetry-claude.js` + sanitized fixtures | binding + fixtures | yes |
| 4 | Streaming entrypoint `usage-mine-main.js` + bin shim + `mine-transcripts.sh` | examples-adapter + bash-helper | yes |
| 5 | Metrics-writer cache-split helper `metrics-split.js` + run-skill emit edit | pure-module + prose | yes |
| 6 | `craft:metrics` front-door skill `skills/metrics/SKILL.md` | docs-prose (standalone) | no |
| 7 | Port spec + `report.json` schema `docs/adapters/telemetry.md` | docs-prose (standalone) | no |

Ordering is load-bearing: 1 fixes the `UsageEvent` seam + `report.json` shape that 3, 4
and 7 build on; 2 supplies the price table 4 injects; 3 supplies the parser 4 streams
through and 5 reuses; 5 depends on 3's exported usage extractor; 7 documents the byte
shape 1 froze. Parts 1–3 share no source file and are otherwise independent.

## Binding-file naming — RATIFIED (design proposal kept verbatim)

The design's `engine/src/usage-aggregate.js` (core) + `engine/src/telemetry-claude.js`
(parse binding) + `engine/src/pricing-claude.js` (price binding) + `engine/src/usage-mine-main.js`
(entrypoint) + `engine/bin/usage-mine.js` (shim) are **adopted as written**. The repo carries
BOTH binding shapes: an in-module seam where the "binding" is just injected `deps` fs functions
(`memory.js`, `policy.js` — thin seams, no separate file), AND a multi-file split where
substantial pure logic is separated from I/O (`init-emit.js`/`init-emit-main.js`, the extracted
`contain.js`). The telemetry parse binding is substantial vendor-specific code (JSONL field names,
`Agent`/`Task` names, model normalization, `~/.claude/projects` resolution) — NOT a thin fs-deps
seam — so the multi-file split mirrors the `init-emit` precedent, not the `memory` seam. The
`-claude` suffix makes the vendor boundary legible and is **not** scanned by `test/source-hygiene.test.js`
(it bans only Class-A mutation-tooling tokens and Class-B `gh`/`github`; `claude` and JSONL field
names are legitimate under `engine/src`).

## Public-surface decision — ALL new modules are INTERNAL (no barrel entry)

`engine/src/index.js` is a CURATED public barrel (descriptor, graph, alias-map, resolve, contract,
findings, manifest, policy). It deliberately omits `memory.js`, `contain.js`, `init-emit.js`,
`init-emit-main.js`, `dod.js` — every module reached via a bin shim rather than imported by another
engine module. The miner is reached the same way: `engine/bin/usage-mine.js` → `usage-mine-main.js`
→ core + bindings. **No new module is added to `engine/src/index.js`.** No barrel-completeness test
exists (`test/mutation-scope.test.js` only inspects `.claude/workflow.md`), so internal is both the
precedent and lint-safe. The ONLY downstream consumer surface this feature publishes is the
`report.json` schema documented in Part 7 (the stable contract `craft:init` will later read) — its
gate is doc prose, not an export.

## Surface gates EVERY engine-code part must pre-pay (Parts 1–5)

> **Cumulative-counter rule — the LAST step before each engine-code commit.**
> `scripts/ci.sh:10` `EXPECTED_TESTS` (currently **1260**) is a GLOBAL total asserted TWICE
> (engine-cwd run and repo-root run, both equal the one variable). It is NOT a delta. The part
> gate `npm --prefix engine test` does NOT check it, so a part is green at its own gate without
> touching it — but the phase-boundary `bash scripts/ci.sh` fails until it equals the emitted
> `# tests <N>`. As the final pre-commit step of each engine-code part: run `bash scripts/ci.sh`,
> read the actually-emitted `# tests <N>` from each engine run, set `EXPECTED_TESTS` to that exact
> number. Do not trust per-part estimates. `EXPECTED_PI_TESTS=202` and `EXPECTED_PROC_TESTS=121`
> are untouched by every part in this plan (no `adapters/pi/` or repo-`test/` files are added;
> the two `test/source-hygiene.test.js` cases just grep the new files, the test COUNT is unchanged).

Other gates the parts pre-pay in-part: `shellcheck scripts/*.sh` runs in ci.sh (Part 4's new
`scripts/mine-transcripts.sh` must pass shellcheck); `test/source-hygiene.test.js` greps
`docs/adapters`, `skills`, `engine/src` for Class-A (`mutation`/`mutant`/`stryker`/…) and Class-B
(`\bgh\b`/`\bgithub\b`) — so Part 6 (`skills/metrics/SKILL.md`) and Part 7 (`docs/adapters/telemetry.md`)
MUST NOT contain those words (write around them); JSONL field names / `claude` / `~/.claude` are
unscanned and live safely in `engine/src`.

## Vendor-neutral seam — `UsageEvent` (pinned; Parts 1 and 3 must agree byte-for-byte)

The `claude` binding flattens each spawn rollup into one `UsageEvent`; the core never sees a JSONL
field name, a model literal it interprets, or a path:

```
UsageEvent {
  run:        string,          // opaque run id = sessionId (ADR-186); slug is a separate label
  phase:      string,          // neutral label: "design" | "implementation" | "review" | ...
  role:       string | null,   // finer label: "part-implementer" | "reviewer" | ...
  model:      string,          // opaque price-table key (binding already normalized "[1m]")
  tokens:     { input, cacheRead, cacheCreation, output },   // neutral names, numbers
  cacheCreationTtl: { ms5m, ms1h } | null,   // exact write pricing; null when absent
  messages:   number,          // turn / tool-use count (totalToolUseCount or turn count)
  durationMs: number,          // from totalDurationMs — event data, never Date.now()
  slug:       string | null,   // descriptive feature label carried for the report (no path/PII)
}
```

## `report.json` consumer contract (schemaVersion 1) — pinned in Part 1, documented in Part 7

```
{
  "schemaVersion": 1,
  "runs": [
    {
      "run": "<sessionId>",
      "slug": "<feature-label|null>",
      "groups": [
        { "phase": "design", "role": "designer", "model": "claude-opus-4-8",
          "messages": <int>, "durationMs": <int>,
          "tokens": { "input": <int>, "cacheRead": <int>, "cacheCreation": <int>, "output": <int> },
          "cacheEfficiency": <number 0..1>,
          "cost": { "priced": <number|null>, "relative": <number> } }
      ],
      "reviewCycles": [ { "role": "<role>", "cycles": <int>, "costPerCycle": [<number>, ...] } ]
    }
  ],
  "recommendations": [
    { "kind": "cache-hotspot"|"model-routing"|"review-waste",
      "run": "<sessionId>", "phase": "<phase>", "model": "<key>",
      "detail": "<neutral string>", "evidence": { <numbers only> } }
  ],
  "baselineDeltas": [ ... ],   // present ONLY with --baseline
  "note": "<reason>"           // present ONLY on advisory no-op / partial
}
```

Determinism rules (the byte-stable contract): keys serialized in sorted order recursively; `runs`
sorted by `run`; `groups` sorted by `(phase, role, model)`; `recommendations` sorted by
`(kind, run, phase, model)`. **No generation timestamp anywhere** (a clock would break byte
stability). Empty/absent input → `{ "schemaVersion": 1, "runs": [], "note": "<reason>" }`, exit 0.

---

## Part 1 — Pure core `usage-aggregate.js` (aggregate + markdown + canonical serialize)

### Context

**Goal.** A pure, deterministic, mutation-clean core that folds a `UsageEvent[]` plus an injected
`priceTable` into the `report.json` object pinned above, renders the human `report.md`, and
serializes byte-stably. NO `Date.now()`, NO `Math.random()`, NO JSONL field name, NO model
literal, NO path — every runtime fact arrives as a function argument (ADR-182 boundary is genuine,
not just review discipline: the module imports nothing vendor-specific).

**File to create.** `engine/src/usage-aggregate.js`. Pattern to mirror: `engine/src/policy.js`
(frozen exported constants, inputs never mutated, every returned object freshly constructed,
JSDoc on each export, early returns, named numeric constants — no magic values). Do NOT add it to
`engine/src/index.js` (internal; see plan header).

**Exports (all pure):**
- `aggregate(events, priceTable) → report` — `events: UsageEvent[]` (seam pinned in plan header),
  `priceTable: { [modelKey]: { input, cacheRead, cacheCreation5m, cacheCreation1h, output } }` in
  price-per-token (or per-MTok — a fixed unit; the core only multiplies, never interprets the
  magnitude). Returns the `report` object (schemaVersion 1).
- `renderMarkdown(report) → string` — deterministic human ranking: top token sinks, worst
  cache-busters (high `cacheEfficiency`), and the `recommendations` list, all with numbers. No
  clock, no randomness; stable ordering identical to the JSON arrays.
- `serializeReport(report) → string` — canonical JSON with recursively sorted keys + trailing
  newline; this is the byte-stable artifact writer (used by Part 4). A small recursive
  `sortedStringify` helper (private) drives it.

**Aggregation rules (per `(run, phase, role, model)` group):**
- `tokens` summed by class; `messages` summed; `durationMs` summed.
- `cacheEfficiency = cacheCreation / (cacheRead + cacheCreation)`; when the denominator is `0`,
  `cacheEfficiency = 0` (guard the divide-by-zero — fail-closed to 0, never `NaN`).
- `cost.relative` ALWAYS available: token-weighted units (e.g. `input + cacheRead + cacheCreation + output`,
  or a fixed neutral weighting — pick one and pin it in the test); never needs the table.
- `cost.priced`: `Σ class×rate`; cacheCreation split by `cacheCreationTtl` when present (ms5m→
  `cacheCreation5m`, ms1h→`cacheCreation1h`), else the whole creation amount at the `cacheCreation5m`
  rate. When the group's `model` key is ABSENT from `priceTable` → `cost.priced = null` (relative
  units only; NEVER throw — ADR-183 missing-model path).
- Run identity = `run` (sessionId); `slug` carried as the run's label (first non-null slug seen for
  that run).
- Review cycles: within a run, group `phase == "review"` events by `role`, count cycles, emit
  `costPerCycle` (priced when available, else relative).

**Recommendations (derived from injected data only — no hardcoded model literal):**
- `cache-hotspot`: for each group with `cacheEfficiency ≥ CACHE_HOTSPOT_THRESHOLD` (a named const,
  e.g. `0.5`) AND a non-trivial priced creation cost, emit one with `evidence` = `{ cacheCreation,
  pricedCreationCost, shareOfRunCost }`. Acceptance requires this to surface "the cache-creation
  cost hotspot" with numbers.
- `model-routing`: across groups of the SAME `phase` within a run, when an expensive `model` key
  handled a low-output / high-cache-read profile and a CHEAPER key (lower per-token `input`+`output`
  rate in the SAME injected `priceTable`) exists, emit one with `evidence` = `{ currentModel,
  currentPricedCost, candidateModel, projectedPricedCost }`. Acceptance requires ≥1 of these.
- `review-waste`: when a run's review cycles exceed `REVIEW_WASTE_CYCLES` (named const), emit one
  with the per-cycle cost evidence.

**Baseline deltas.** `aggregate` takes an OPTIONAL third arg `baselineReport` (default `undefined`);
when present, emit `baselineDeltas` (per-phase token / priced-cost / cacheEfficiency deltas). The
miner entrypoint (Part 4) supplies it from `--baseline`.

### TDD steps

RED → GREEN → REFACTOR, London-school, Given/When/Then titles, AAA bodies, `sut` variable
(`engine/test/usage-aggregate.test.js`):

1. RED: `Given a single designer UsageEvent and a fixed price table, when aggregate runs, then the
   group carries summed token classes, the right cacheEfficiency, and cost.priced = Σ class×rate`.
   Fails: `usage-aggregate.js` does not exist → import throws.
2. RED: `Given an event whose model key is absent from the price table, when aggregate runs, then
   cost.priced is null and cost.relative is a number` (no throw — ADR-183).
3. RED: `Given a cacheCreationTtl split, when aggregate prices creation, then ms5m uses the 5m rate
   and ms1h uses the 1h rate`.
4. RED: `Given two runs of review events grouped by role, when aggregate runs, then reviewCycles
   counts the cycles and emits costPerCycle`.
5. RED (property / order-invariance): `Given the same event list in a permuted order, when aggregate
   then serializeReport runs, then the bytes are identical` (fold is order-invariant; sorted keys +
   stable array sort).
6. RED (byte-stable round-trip): `Given a fixture event list, when aggregate→serializeReport→
   JSON.parse→aggregate→serializeReport, then the two serializations are byte-identical` (no clock,
   no randomness).
7. RED: `Given a group with cacheEfficiency above the hotspot threshold, when aggregate runs, then a
   cache-hotspot recommendation with numeric evidence is present`.
8. RED: `Given two models for one phase where a cheaper table key exists, when aggregate runs, then a
   model-routing recommendation naming the candidate model with projected cost is present`.
9. RED: `Given an empty event list, when aggregate runs, then the report is { schemaVersion:1, runs:[],
   note:<reason> }` and `renderMarkdown` returns a non-empty advisory string.
10. RED: `Given a cacheRead+cacheCreation sum of zero, when aggregate computes cacheEfficiency, then
    it is 0, never NaN` (divide-by-zero guard).
11. RED: `Given a report, when renderMarkdown runs twice, then both strings are byte-identical and
    contain the hotspot and a model-routing recommendation with numbers`.
12. GREEN: implement `aggregate`, `renderMarkdown`, `serializeReport` (+ private `sortedStringify`,
    named constants `CACHE_HOTSPOT_THRESHOLD`, `REVIEW_WASTE_CYCLES`, neutral cost weighting).
13. REFACTOR: extract the per-group reducer and the recommendation derivors into small named pure
    helpers (<20 lines each, nesting ≤2, early returns); ensure ≥80% coverage of `usage-aggregate.js`.

### Gate

`npm --prefix engine test` (= `node --test 'test/**/*.test.js'`, cwd=engine) — all green.
Then the cumulative-counter step: `bash scripts/ci.sh`, set `scripts/ci.sh:10 EXPECTED_TESTS` to the
emitted `# tests <N>`; re-run `bash scripts/ci.sh` → green. (`EXPECTED_PI_TESTS`/`EXPECTED_PROC_TESTS`
unchanged.)

### Commit

`feat(telemetry): pure usage-aggregate core with byte-stable report`

---

## Part 2 — Pricing binding `pricing-claude.js`

### Context

**Goal.** Binding-owned price DATA + a `--prices` merge, so the core stays vendor-neutral (ADR-183).
A model id absent from the merged table degrades to relative units in the core (Part 1), never a
crash.

**File to create.** `engine/src/pricing-claude.js`. Pattern: `engine/src/policy.js` frozen-constant
discipline (`Object.freeze`, JSDoc, pure functions, inputs never mutated). Internal (not in `index.js`).

**Exports:**
- `PRICES_AS_OF` — a frozen `'YYYY-MM-DD'` string staleness marker (use the run date; mark
  **update-needed** in a JSDoc comment pointing maintainers at the `claude-api` skill as the
  authority).
- `DEFAULT_PRICES` — a frozen table keyed by model id, values
  `{ input, cacheRead, cacheCreation5m, cacheCreation1h, output }`. VERIFIED against the `claude-api`
  skill (mark update-needed); per-MTok base + multipliers:
  - `claude-opus-4-8`:   input `5`,  output `25`
  - `claude-sonnet-4-6`: input `3`,  output `15`
  - `claude-fable-5`:    input `10`, output `50`
  - `claude-haiku-4-5`:  input `1`,  output `5`
  - cacheRead = `input × 0.1`; cacheCreation5m = `input × 1.25`; cacheCreation1h = `input × 2`.
  Pick ONE fixed unit (per-MTok) and keep it consistent — the core only multiplies, so the unit is
  cosmetic as long as it is uniform. Document the chosen unit in a JSDoc line.
  NOTE: the binding's `resolvedModel` normalization (`claude-opus-4-8[1m]` → `claude-opus-4-8`)
  lives in Part 3's `telemetry-claude.js`, so this table is keyed on the NORMALIZED id only.
- `mergePrices(defaults, override) → table` — pure, returns a freshly constructed table; `override`
  (parsed from `--prices <file>` JSON by Part 4) wins per-key; absent/null override → a copy of
  defaults; inputs never mutated.
- `loadPriceTable(overrideJsonOrNull) → table` — thin wrapper: `mergePrices(DEFAULT_PRICES, overrideJsonOrNull)`.

### TDD steps

`engine/test/pricing-claude.test.js`:
1. RED: `Given DEFAULT_PRICES, when read, then opus-4-8 input is 5 and output is 25 and cacheRead is
   input×0.1`. Fails: module missing.
2. RED: `Given DEFAULT_PRICES, when an attempt mutates a value, then it throws / the table is frozen`.
3. RED: `Given an override that changes one model and adds one model, when mergePrices runs, then the
   result has the override's values and the untouched defaults, and DEFAULT_PRICES is unchanged`.
4. RED: `Given a null override, when loadPriceTable runs, then it returns a table deep-equal to
   DEFAULT_PRICES but a distinct object`.
5. RED: `Given PRICES_AS_OF, when read, then it matches /^\d{4}-\d{2}-\d{2}$/`.
6. GREEN: implement the table, `PRICES_AS_OF`, `mergePrices`, `loadPriceTable`.
7. REFACTOR: derive cacheRead/cacheCreation multipliers from a single named multiplier constant set
   so the table stays DRY; ≥80% coverage.

### Gate

`npm --prefix engine test` — green. Then the cumulative-counter step (set `EXPECTED_TESTS` to the
emitted `# tests <N>`; `bash scripts/ci.sh` green).

### Commit

`feat(telemetry): claude pricing table with --prices override`

---

## Part 3 — Claude parse binding `telemetry-claude.js` + sanitized fixtures

### Context

**Goal.** The ONLY module that knows the empirically-pinned JSONL shape, the `~/.claude/projects`
location, the cwd→dashes mapping, the `Agent`/`Task` tool names, the synthetic-model filter, the
`agentType`→phase map, and `[1m]` normalization (ADR-182, ADR-188). Streams lines lazily (OOM-safe),
flattening each spawn rollup into one `UsageEvent` (seam pinned in plan header). Never throws on a
malformed line — counts and skips it (advisory; ADR-116 parity).

**File to create.** `engine/src/telemetry-claude.js`. Internal (not in `index.js`). Reuse
`engine/src/contain.js` is NOT here — containment is wired in Part 4; this module is the pure-ish
parser + path RESOLUTION (lexical), no I/O of its own beyond consuming an injected line iterable.

**Empirically-pinned JSONL facts to honour (from the design's recorded matrix — cite these real
field names, do not invent):**
- Per-line top-level: `type`, `message`, `isSidechain` (NEVER `true` in this corpus — sub-agents are
  NOT inline sidechains), `sessionId`, `timestamp` (ISO-8601), `cwd`, `slug`, `uuid`,
  `attributionSkill` (`"craft:design"`, …, or `"apply-workflow"` in tsgit).
- Assistant line (`type=="assistant"`): `message.model` is `"claude-opus-4-8"` OR `"<synthetic>"`
  (synthetic = injected, zero-cost → **must be excluded**, no event).
- Spawn rollup is the GOLD and is NOT a sidechain: an `Agent` (∥ `Task`) `tool_use` block, whose
  RESULT line carries `toolUseResult` with: `agentType` (= `subagent_type`; e.g. `"craft:designer"`),
  `resolvedModel` (the ACTUAL model — e.g. `"claude-opus-4-8[1m]"`), `totalDurationMs`, `totalTokens`,
  `totalToolUseCount`, and `usage` = aggregate `{ input_tokens, cache_read_input_tokens,
  cache_creation_input_tokens, output_tokens, cache_creation: { ephemeral_5m_input_tokens,
  ephemeral_1h_input_tokens } }`.
- The spawn `input` carries `subagent_type` and `input.model` (frequently `null`).
- Proof to assert in a fixture: designer rollup with `totalDurationMs=589907`,
  `usage = { input:2, cache_read:196062, cache_creation:255, output:900 }`, `totalTokens=197219`
  (and `2 + 196062 + 255 + 900 = 197219`).

**Exports:**
- `resolveTranscriptDir(cwd, homeDir, overrideDir) → string` — when `overrideDir` is set, return its
  lexical resolve; else `join(homeDir, '.claude', 'projects', cwd.replaceAll('/', '-'))`. e.g. cwd
  `/Users/x/workspace/perso/craft` → dir `…/.claude/projects/-Users-x-workspace-perso-craft`. Lexical
  only — containment is Part 4's job.
- `tokensFromClaudeUsage(usageObj) → { input, cacheRead, cacheCreation, output, cacheCreationTtl }` —
  maps the JSONL `*_input_tokens` field names to the neutral `UsageEvent.tokens` shape +
  `cacheCreationTtl: { ms5m, ms1h } | null` from `cache_creation.ephemeral_5m_input_tokens` /
  `ephemeral_1h_input_tokens`. **Exported for reuse by Part 5** (the metrics-split helper). Tolerates
  missing fields → `0` / `null`.
- `normalizeModel(resolvedModel) → string` — strips a trailing `[1m]` (and any `[…]` context suffix):
  `claude-opus-4-8[1m]` → `claude-opus-4-8`.
- `phaseRoleFromAgentType(agentType) → { phase, role }` — the binding-owned map (document it in
  Part 7). Known map:
  - `craft:designer` → `{ design, designer }`
  - `craft:planner` → `{ planning, planner }`
  - `craft:part-implementer` → `{ implementation, part-implementer }`
  - `craft:reviewer` → `{ review, reviewer }`
  - `craft:validation-triager` → `{ validation, validation-triager }`
  - `craft:harness-triager` → `{ validation, harness-triager }`
  - `craft:docs-writer` → `{ documentation, docs-writer }`
  - UNKNOWN agentType → `{ phase: <agentType with leading "craft:" stripped>, role: null }` (never
    fabricate; advisory).
- `eventFromRollup(line) → UsageEvent | null` — given a parsed JSON object, return a `UsageEvent`
  when it is an `Agent`∥`Task` spawn-result line carrying `toolUseResult` (read `agentType` from
  `toolUseResult.agentType` ∥ the spawn `input.subagent_type`; ADR-188 accepts both), else `null`.
  Excludes `<synthetic>`. `messages` = `totalToolUseCount` (fallback 0); `durationMs` =
  `totalDurationMs`; `model` = `normalizeModel(resolvedModel)`; `run` = `sessionId`; `slug` = `slug` ∥ null.
- `parseLines(asyncLineIterable) → Promise<{ events: UsageEvent[], skipped: number }>` — consumes the
  injected async iterable of strings LINE BY LINE (`for await`), `JSON.parse` each, route through
  `eventFromRollup`; a line that fails `JSON.parse` increments `skipped` and is dropped (NEVER
  thrown). This is the OOM-safe seam: it holds only the running `events` accumulator + `skipped`
  counter, never the whole file. (Part 4 feeds it `readline` over `createReadStream`.)

**Fixtures (fold into THIS part — `engine/test/fixtures/telemetry/`):** sanitized JSONL, no real
paths/usernames/PII (fake `/repo` cwd, fake UUID sessionIds, fake slug like `"feature-x"`):
- `craft-sample.jsonl`: one `Agent` designer rollup (the pinned proof numbers), one `Task`-alias
  rollup using `input.subagent_type`, one assistant `<synthetic>` line, one assistant
  `claude-opus-4-8[1m]`-bearing rollup, one MALFORMED line (`this is not json {{{`).
- `tsgit-sparse.jsonl`: lines with `attributionSkill:"apply-workflow"` and ZERO `craft:*` Agent
  spawns (spawn-rollup-sparse — exercises the empty/inline path; ADR-187). Reused by Part 4's bin
  smoke.

### TDD steps

`engine/test/telemetry-claude.test.js`:
1. RED: `Given a cwd and home dir, when resolveTranscriptDir runs with no override, then it joins
   ~/.claude/projects/<cwd-with-slashes-as-dashes>`; and with an override returns the override's
   resolve. Fails: module missing.
2. RED: `Given the pinned designer rollup line, when eventFromRollup runs, then it returns a
   UsageEvent with phase "design", role "designer", model "claude-opus-4-8", durationMs 589907, and
   tokens {input:2,cacheRead:196062,cacheCreation:255,output:900}` (and the four sum to 197219).
3. RED: `Given resolvedModel "claude-opus-4-8[1m]", when normalizeModel runs, then it returns
   "claude-opus-4-8"`.
4. RED: `Given an assistant line whose message.model is "<synthetic>", when routed, then no event is
   produced`.
5. RED: `Given a Task-alias line carrying input.subagent_type, when eventFromRollup runs, then it
   produces the same shaped event as the Agent line` (ADR-188 both names + both attribution keys).
6. RED: `Given an unknown agentType "craft:something-new", when phaseRoleFromAgentType runs, then
   phase is "something-new" and role is null` (no fabrication).
7. RED (advisory): `Given an async iterable whose 3rd line is malformed JSON, when parseLines runs,
   then it returns the valid events and skipped===1 and never throws`.
8. RED (OOM-safe / streaming proof): `Given a generator-backed async iterable that lazily yields
   50_000 lines (and would be impossible to materialize as one string), when parseLines runs, then it
   returns the aggregated events without ever buffering the whole input` — assert by feeding an
   `async function*` source (proves line-by-line `for await`, not a full-read) and asserting it
   completes with bounded retained state.
9. RED: `Given craft-sample.jsonl read into lines, when parseLines runs, then the designer rollup
   round-trips and the synthetic + malformed lines are excluded/counted`.
10. RED: `Given tsgit-sparse.jsonl, when parseLines runs, then events is empty and skipped===0`
    (sparse path; ADR-187 — a correct empty result, not an error).
11. GREEN: implement `resolveTranscriptDir`, `tokensFromClaudeUsage`, `normalizeModel`,
    `phaseRoleFromAgentType`, `eventFromRollup`, `parseLines`; author the two fixtures.
12. REFACTOR: extract the spawn-shape detection (`Agent`∥`Task`, both attribution keys) into a small
    named helper; keep each function <20 lines, nesting ≤2; ≥80% coverage of `telemetry-claude.js`.

### Gate

`npm --prefix engine test` — green. Then the cumulative-counter step (set `EXPECTED_TESTS` to the
emitted `# tests <N>`; `bash scripts/ci.sh` green). NOTE: source-hygiene stays green — `claude`,
`~/.claude`, and JSONL field names under `engine/src` are NOT scanned; verify no Class-A/B token
crept into the new code.

### Commit

`feat(telemetry): claude JSONL parse binding → UsageEvent[]`

---

## Part 4 — Streaming entrypoint `usage-mine-main.js` + bin shim + `mine-transcripts.sh`

### Context

**Goal.** Wire the binding (Part 3) + pricing (Part 2) + core (Part 1) into a streaming, contained,
advisory CLI that writes `report.{json,md}` inside the repo. Streams the largest transcript without
OOM (`readline` over `createReadStream` — never `readFileSync` of a whole transcript). Two
containment roots (read = `~/.claude/projects`, write = repoRoot). Absent/empty/malformed/
out-of-bounds dir → recorded no-op report, exit 0 (ADR-116 parity).

**Files to create.**
- `engine/src/usage-mine-main.js` — logic. Pattern: `engine/src/init-emit-main.js`
  (`export function main(argv, io) → exitCode`; `io` carries `{ stdout, stderr }` + injectable deps;
  `fail(message, io)` writes a `usage-mine: …` diagnostic and returns the error code; comprehensive
  try/catch around I/O; no swallowed errors). Internal (not in `index.js`).
- `engine/bin/usage-mine.js` — ~5-line shim. EXACT pattern of `engine/bin/init-emit.js`:
  ```
  #!/usr/bin/env node
  import { fileURLToPath } from 'node:url';
  import { main } from '../src/usage-mine-main.js';
  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
  }
  ```
  Bins are NEVER mutated (Stryker scope is `engine/src/**` per `engine/stryker.conf.json`); all logic
  stays in `usage-mine-main.js`.
- `scripts/mine-transcripts.sh` — thin convenience wrapper invoking the bin (`node "${…}/engine/bin/usage-mine.js" "$@"` style). MUST pass `shellcheck` (ci.sh line 52 runs `shellcheck scripts/*.sh`):
  `#!/usr/bin/env bash`, `set -euo pipefail`, quote every expansion, resolve the plugin/engine path
  from `$(dirname "${BASH_SOURCE[0]}")` like `scripts/worktree-setup.sh`.

**Flags (on the bin):** `--dir <path>` (override transcript dir), `--baseline <dir|run-id>`
(run-over-run diff → feeds `aggregate`'s third arg), `--since <date|run-id>`, `--prices <file>`
(JSON override → `loadPriceTable`), `--include-inline` (ADR-187 opt-in; default OFF = inline phases
are a noted gap, never fabricated). Output defaults inside the repo (e.g. `<repoRoot>/report.json` +
`report.md`); the exact output path is the entrypoint's choice but MUST pass write-containment.

**Containment (reuse `engine/src/contain.js` — `containByRealpath(root, target) → string|null`,
fail-closed):**
1. READ root = `resolveTranscriptDir(...)`'s PARENT projects dir `~/.claude/projects`. Validate the
   resolved transcript dir via `containByRealpath(projectsRoot, resolvedDir)`; `null` (lexical
   escape / symlink leaf / realpath escape / non-ENOENT fs error) → recorded no-op note, exit 0. The
   projects dir is the root because the transcript dir is OUTSIDE the repo by construction.
2. WRITE root = repoRoot. Validate the output path via `containByRealpath(repoRoot, outputPath)`;
   `null` → recorded no-op note, exit 0 (output lands ONLY inside the repo).
   Carry forward `contain.js`'s documented TOCTOU caveat: the returned value is LEXICAL and the
   entrypoint does the real stream/write on it; acceptable under the local advisory threat model
   (identical basis to memory/policy). Do NOT pretend it is atomic — note it in a code comment
   ("why", not "what").

**Streaming.** For each `*.jsonl` in the contained dir: `createReadStream(file)` →
`readline.createInterface({ input, crlfDelay: Infinity })` → feed the line async-iterable to Part 3's
`parseLines`. Accumulate `UsageEvent[]` across files; aggregate via Part 1's `aggregate(events,
priceTable, baselineReport?)`; write `serializeReport(report)` to `report.json` and
`renderMarkdown(report)` to `report.md` (both Part 1 exports). Redaction is structural — `UsageEvent`
carries no path, so the report is path-free by construction (positive whitelist; ADR-185). Inject the
fs/readline seam through `io` deps so the unit tests can drive it without real `~/.claude`.

### TDD steps

Two test files. Unit: `engine/test/usage-mine.test.js`. Bin smoke (mktemp throwaway, NEVER the
worktree): `engine/test/usage-mine.bin.test.js` (mirror `engine/test/init-emit.bin.test.js` — `spawnSync`
the shim, `mkdtemp` under `tmpdir()`, `after(() => rmSync(...))`).

1. RED (unit): `Given a contained fixture dir of jsonl lines, when main streams it, then it writes
   report.json (serializeReport) and report.md (renderMarkdown) inside the contained repo and exits 0`.
   Fails: module missing.
2. RED (unit, containment-read): `Given a --dir that escapes ~/.claude/projects via traversal, when
   main runs, then it is rejected (containByRealpath null) and writes a no-op report with a note and
   exits 0` (never an error).
3. RED (unit, containment-write): `Given an output path that escapes repoRoot, when main runs, then it
   is rejected and the run is a recorded no-op, exit 0`.
4. RED (unit, advisory): `Given an absent / empty / malformed-only dir, when main runs, then the report
   is { schemaVersion:1, runs:[], note:<reason> } and exit is 0` (ADR-116 parity).
5. RED (unit, streaming proof): `Given a transcript file whose lines are produced by a lazy stream,
   when main streams it, then it never readFileSync's the whole transcript` — inject a deps seam whose
   `readFileSync` throws-if-called for transcripts, prove only the `createReadStream`/`readline` path
   is used.
6. RED (unit, --baseline): `Given a baseline report and a current run, when main runs with --baseline,
   then report.json carries baselineDeltas`.
7. RED (unit, --prices): `Given a --prices override file, when main runs, then a model only in the
   override is priced (not relative)`.
8. RED (unit, --include-inline OFF default): `Given a spawn-sparse (tsgit-style) dir without
   --include-inline, when main runs, then inline phases are a noted gap (no fabricated cost) and the
   report still has runs:[] / note (ADR-187)`.
9. RED (bin smoke): `Given a tiny fixture dir (engine/test/fixtures/telemetry/) in a mktemp repo, when
   the usage-mine bin runs, then it exits 0 and report.json + report.md exist inside the temp repo`.
10. RED (bin smoke, no-leak): `Given the produced report.json, when scanned, then it contains no
    absolute path, no $HOME, no username` (redaction is structural; positive-whitelist proof).
11. GREEN: implement `usage-mine-main.js` (arg-parse, two-root containment, streaming loop, write),
    the `engine/bin/usage-mine.js` shim, `scripts/mine-transcripts.sh`.
12. REFACTOR: extract arg-parse, the per-file stream reducer, and the two containment checks into small
    named helpers (early returns, nesting ≤2, no boolean params); ≥80% coverage of
    `usage-mine-main.js`. Confirm `shellcheck scripts/mine-transcripts.sh` passes.

### Gate

`npm --prefix engine test` — green. Then: `shellcheck scripts/mine-transcripts.sh` passes. Then the
cumulative-counter step: `bash scripts/ci.sh`, set `EXPECTED_TESTS` to the emitted `# tests <N>`,
re-run `bash scripts/ci.sh` → fully green (includes shellcheck of the new script).

### Commit

`feat(telemetry): streaming miner entrypoint, bin shim, and wrapper`

---

## Part 5 — Metrics-writer cache-split helper `metrics-split.js` + run-skill emit edit (ADR-184)

### Context

**Goal (two pieces).** (1) A TESTABLE `engine/src` helper that extracts the cache_read /
cache_creation split from a spawn-rollup `usage` object, reusing Part 3's parser; (2) the prose edit
to `skills/run/SKILL.md` instructing the orchestrator to emit the split in the metrics row instead of
the lossy `cache=na` / `cache=<hit|miss>` field. The miner PROVED `.claude/craft-metrics.md` is a
lossy projection (ADR-184): `tokens=` is `totalTokens`, `duration_ms` is `totalDurationMs`, and the
`cache=` field is precisely the recoverable read/creation split already in `toolUseResult.usage`.

**File to create.** `engine/src/metrics-split.js` (internal; not in `index.js`). It IMPORTS
`tokensFromClaudeUsage` from `./telemetry-claude.js` (the same parser — single source of truth).

**Export:**
- `formatCacheSplit(claudeUsageObj) → string` — returns `cache_read=<n> cache_creation=<n>` when the
  split is present, and degrades to the literal `cache=na` ONLY when the split is genuinely absent /
  the input is malformed (advisory; never throws). `<n>` are the integer token counts from
  `tokensFromClaudeUsage(...).cacheRead` / `.cacheCreation`.

**Prose edit — `skills/run/SKILL.md` "Done" → "Metrics artifact" section (current bytes to pin,
≈ lines 456–461):**
```
**Metrics artifact (separate, append-only).** For each agent-spawned phase that returned a
usage block, append one line to `.claude/craft-metrics.md` (ADR-119):
`<run-id> <phase-id> tokens=<subagent_tokens> duration_ms=<duration_ms> cache=<hit|miss>`.
```
Edit the format token from `cache=<hit|miss>` to `cache_read=<…>/cache_creation=<…>` and add one
sentence: the orchestrator recovers the split by passing the spawn's own rollup `usage` through the
`metrics-split` helper (`formatCacheSplit`), degrading to `cache=na` only when a spawn's split is
genuinely absent. Keep it a single appended row; do NOT introduce any banned token (`mutation`,
`mutant`, `gh`, `github`) — `cache_read`/`cache_creation`/`subagent_tokens` are all source-hygiene
safe under `skills/`.

### TDD steps

`engine/test/metrics-split.test.js`:
1. RED: `Given the pinned designer usage { input:2, cache_read:196062, cache_creation:255, output:900 },
   when formatCacheSplit runs, then it returns "cache_read=196062 cache_creation=255"`. Fails: module
   missing.
2. RED: `Given a usage object with no cache fields, when formatCacheSplit runs, then it returns
   "cache=na"`.
3. RED (advisory): `Given a null / malformed usage input, when formatCacheSplit runs, then it returns
   "cache=na" and never throws`.
4. RED: `Given a usage object, when formatCacheSplit runs, then the numbers match
   tokensFromClaudeUsage(...).cacheRead / .cacheCreation` (single source of truth — no re-parsing).
5. GREEN: implement `formatCacheSplit` importing `tokensFromClaudeUsage`.
6. GREEN (prose): edit `skills/run/SKILL.md` Metrics-artifact line per Context.
7. REFACTOR: keep it a single tiny pure function; ≥80% coverage of `metrics-split.js`.

### Gate

`npm --prefix engine test` — green. Then the cumulative-counter step (set `EXPECTED_TESTS` to the
emitted `# tests <N>`; `bash scripts/ci.sh` green — confirms `test/source-hygiene.test.js` still
finds zero Class-A/B tokens in the edited `skills/run/SKILL.md`).

### Commit

`feat(telemetry): metrics-writer cache-split helper + run-skill emit`

---

## Part 6 — `craft:metrics` front-door skill `skills/metrics/SKILL.md`

### Context

**Goal.** A zero-arg front-door skill anyone runs in-place, mirroring `craft:init`: probe the current
repo's transcript dir → invoke the miner bin → report the report path back. Standalone, docs-only
(no `src/` delta).

**File to create.** `skills/metrics/SKILL.md`. Pattern: `skills/init/SKILL.md` — YAML frontmatter
(`name`, `description` with trigger phrases, `argument-hint`), a read-only probe preamble, a
numbered procedure, a "Done" report, and an error-semantics table. Invoke the bin exactly as
`init` invokes its bins: `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/usage-mine.js" …`.

**Procedure shape:**
- Preamble (read-only probe): resolve the current repo's transcript dir for the cwd (the bin already
  does the `cwd→dashes` mapping internally — the skill just runs it in-place; an absent/empty dir is a
  recorded no-op, never an error, per the miner's advisory contract).
- Step 1 — Mine: run `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/usage-mine.js"` (zero-arg; optional
  pass-through of `--dir`, `--baseline`, `--since`, `--prices`, `--include-inline` when the user
  supplies them). The bin writes `report.{json,md}` inside the repo and exits 0 even on an empty dir.
- Done — report the landed `report.json` / `report.md` paths + a one-line summary (the cache-creation
  hotspot and the top model-routing recommendation, read from the bin's output / report).
- Error semantics table: absent/empty/malformed/out-of-bounds dir → recorded no-op report, exit 0
  (advisory parity); never a blocker.

**HARD source-hygiene constraint:** `skills/` IS scanned. The file MUST NOT contain the words
`mutation`, `mutant`, `gh`, or `github` (Class-A/B). Write around them. (`claude` / `~/.claude` /
JSONL field names are NOT scanned, but this is a SKILL not `engine/src` — keep runtime field names
out of the prose anyway; the skill only invokes the bin and reports paths, mirroring `init`'s
delegation discipline.)

### TDD steps

Docs-prose, no engine test. Verification = lints stay green:
1. Author `skills/metrics/SKILL.md` per Context (frontmatter + preamble + Step 1 + Done + error table).
2. Verify `test/source-hygiene.test.js` finds zero Class-A/B tokens in the new file (run
   `bash scripts/ci.sh`); grep the file for `mutation|mutant|\bgh\b|\bgithub\b` → no hits.
3. Verify the bin-invocation path string matches the actual `engine/bin/usage-mine.js` (Part 4) and
   the flag names match Part 4's arg-parse.

### Gate

`bash scripts/ci.sh` — fully green (engine suites unchanged → `EXPECTED_TESTS` UNCHANGED; the two
`test/source-hygiene.test.js` cases now grep `skills/metrics/SKILL.md` and must find zero Class-A/B
hits; `EXPECTED_PROC_TESTS` UNCHANGED — no new repo-`test/` file).

### Commit

`feat(telemetry): zero-arg craft:metrics front-door skill`

---

## Part 7 — Port spec + `report.json` schema `docs/adapters/telemetry.md`

### Context

**Goal.** The Telemetry port spec + the STABLE, versioned `report.json` schema — the consumer
contract `craft:init` will later read (ADR-182). Standalone, docs-only (no `src/` delta). Mirrors the
existing adapter docs' structure.

**File to create.** `docs/adapters/telemetry.md`. Pattern: `docs/adapters/memory.md` /
`docs/adapters/execution.md` — `## Port interface`, `## Core policy retained (NOT port verbs)`,
`## Binding set` (state `{ claude, pi }`), `## Claude binding`, `## Pi binding` (RESERVED — documented,
NOT built; parity with the Pi-PoC posture), `## Failure → blocker` (advisory-only; absent/empty/
malformed/out-of-bounds = recorded no-op, never a gate — ADR-116 parity).

**Content the doc MUST pin (sourced from the design + the as-built modules):**
- The vendor-neutral `UsageEvent` seam (the plan-header shape) — the port's abstract stream.
- The STABLE `report.json` schema (schemaVersion 1 — the plan-header shape), field-by-field, marked
  as the consumer contract `craft:init` reads; note determinism (sorted keys, stable array order, NO
  timestamp → byte-stable fixture round-trips).
- The redaction guarantee (ADR-185): output drops paths entirely; only numbers + phase/model/sessionId
  + slug labels reach it; positive whitelist (new field defaults to excluded).
- Run identity = `sessionId`; `slug` is a label; multi-session-run merge is a documented limitation /
  follow-up (ADR-186).
- The `claude` binding owns: the `~/.claude/projects/<cwd→dashes>` resolution, the JSONL matrix, the
  `Agent`∥`Task` tool names + both attribution keys (ADR-188), the synthetic-model filter, the
  `agentType`→phase map (reproduce Part 3's map), `resolvedModel` `[1m]` normalization, and the price
  table location (`pricing-claude.js`, `PRICES_AS_OF`, `--prices` override, missing-model→relative
  units — ADR-183).
- The metrics-file relationship (ADR-184): the miner COMPLEMENTS `.claude/craft-metrics.md` (offline
  deep read vs cheap live append) and the writer's `cache=` field was upgraded to the read/creation
  split via `metrics-split.formatCacheSplit`.
- Out of scope: wiring `craft:init` to auto-consume `report.json` (follow-up); the `pi` transcript
  binding (reserved seam, not built); live dashboards.

**HARD source-hygiene constraint:** `docs/adapters` IS scanned. The file MUST NOT contain
`mutation`, `mutant`, `gh`, or `github`. Write around them (this is a telemetry/cost doc — there is
no legitimate need for any of those tokens).

**Cross-part constraint:** the schema documented here MUST match BYTE-FOR-BYTE the shape Part 1's
`serializeReport` emits and Part 1's tests froze. Author this part AFTER reading Part 1's
`usage-aggregate.test.js` fixtures so the doc and the code agree (the doc is the contract; the test is
the proof — they cannot diverge).

### TDD steps

Docs-prose, no engine test. Verification = lints stay green + schema fidelity:
1. Author `docs/adapters/telemetry.md` per Context (port interface, binding set, claude binding,
   reserved pi binding, advisory failure model, the `UsageEvent` seam, the `report.json` schema,
   redaction/run-identity/metrics-file/out-of-scope sections).
2. Cross-check the documented `report.json` schema against Part 1's emitted shape (read
   `engine/src/usage-aggregate.js` + `engine/test/usage-aggregate.test.js`); reconcile any drift in
   the DOC (Part 1 is the frozen source of truth).
3. Verify zero Class-A/B tokens: grep the file for `mutation|mutant|\bgh\b|\bgithub\b` → no hits; run
   `bash scripts/ci.sh`.

### Gate

`bash scripts/ci.sh` — fully green (engine suites unchanged → `EXPECTED_TESTS` UNCHANGED;
`test/source-hygiene.test.js` now greps `docs/adapters/telemetry.md` and must find zero Class-A/B
hits; `EXPECTED_PROC_TESTS` UNCHANGED).

### Commit

`docs(telemetry): port spec + stable report.json schema`
