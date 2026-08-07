# Design — usage-miner-subagent-transcripts

> Brief: craft's own usage miner under-reports cost by ~100x on sub-agent work, so
> `/craft:metrics` and `.claude/craft-metrics.md` cannot be trusted. Read token truth from
> the per-sub-agent transcripts on disk instead of the spawn rollup's final-message usage,
> without double-counting, without dropping in-flight sub-agents, and without turning the
> advisory observability port into a gate.
> Status: draft → self-reviewed ×3 → accepted-pending-ADR → **revised against ADR-328…338, self-reviewed ×3, accepted**

## Context

**Eleven decisions are ratified and binding. Nothing in this section is open.** The planner
reads a settled design; it must not re-litigate any of the following, and the *Decision
candidates* table below records each as SETTLED with its ADR.

| ADR | Settled |
|---|---|
| 328 | Sub-agent labels come from the `agent-<id>.meta.json` sidecar; spawn rollups are never read — not for tokens, not for labels |
| 329 | Main-loop usage is **included by default**, as one `role: 'main-loop'`, `phase: null` group; `--no-inline` opts out; refines ADR-187 |
| 330 | The `.claude/craft-metrics.md` row is sourced from the phase's own sub-agent transcript; `skills/run/SKILL.md` **is in scope**; refines ADR-119/184 |
| 331 | The 372 historical ledger rows are annotated with one boundary marker, never migrated |
| 332 | The drift baseline is regenerated in this change, **after** the pricing correction and **with** main-loop inclusion on |
| 333 | Two-level discovery lives in the claude adapter as `discover({ listDir, readText })`; the front door keeps every path, containment check, and I/O |
| 334 | The sidecar context reaches `parseLines` as an opaque third argument the front door never inspects |
| 335 | The walk is a pinned two-level shape, not a generic recursion |
| 336 | The zero-arg read root resolves the dashed cwd under `~/.claude/projects` |
| 337 | Sub-agent `messages`/`durationMs` derive from the transcript, not from a rollup join |
| 338 | **Priced cost is corrected in this change** — the two current model entries *and* the missing `1e6` divisor |

**ADR-338 deviates from what this doc originally recommended, and it moves real work.** The
earlier draft recommended DC-10(a) — tokens only, document the dollar gap, file follow-ups —
honoring the brief's "pricing table updates are out of scope" line. The user chose (c). The
priced-cost path is therefore designed here, not deferred, and `$297.55` became a claim this
change must verify rather than a gap it may document. ADR-330 likewise widened the boundary:
`skills/run/SKILL.md` is in. The *Out of scope* section states the ratified boundary, not the
brief's original one.

What exists today, and the patterns this feature must follow:

- **The telemetry port is hexagonal (ADR-182) and already has six wired bindings**
  (`claude, opencode, pi, copilot, codex, aider` — plus an unwired `adapters/cursor/`
  on disk, absent from the `SOURCES` map and from the spec's binding set).
  `docs/contributing/specs/telemetry.md` (frontmatter `subjects: ['engine/src/observability/**']`)
  is the living-intention page for everything under that path — this change lands squarely
  inside its scope, so refreshing it is part of the work, not an add-on. The port is
  `collect(opts, deps) → UsageEvent[]` + a pure `aggregate(events, priceTable, …) → report`
  core. The spec's binding contract is explicit and constrains this design:
  *"The adapter never receives an absolute path; the `readTranscripts` provider owns the
  runtime path."* Discovery therefore lives on the front-door side of the seam, token
  interpretation on the adapter side.

- **The front door owns discovery, containment, and I/O.**
  `engine/src/observability/usage-mine-main.js` resolves flags, picks the binding from a
  frozen `SOURCES` lookup, resolves a source-aware READ root from `DEFAULT_READ_ROOTS`,
  discovers files with a source-aware matcher from `SOURCE_FILE_MATCHERS`, realpath-contains
  every path through `engine/src/contain.js`, streams each file through
  `createReadStream` + `readline`, and hands the resulting `UsageEvent[]` to `aggregate`.
  The three per-source frozen lookups are the established extension seam — a new
  per-source behaviour goes in a fourth lookup of the same shape, never in a conditional.

- **Two containment roots, both fail-closed.** READ root — the transcript dir must be inside
  the source-aware projects root. WRITE root — output paths must be inside `repoRoot`. Each
  discovered child is separately realpath-checked in `streamTranscriptFiles` before it is
  opened. This is a security boundary with a documented TOCTOU caveat, not a formality; any
  recursion this design introduces stays inside `containByRealpath`.

- **The port is advisory.** Absent, empty, malformed, or out-of-bounds input produces a
  *recorded* no-op report and exit 0. The single deliberate non-zero exit is an unknown
  `--source`, a config error caught before any I/O. The spec's *Failure semantics* section
  is the contract; nothing in this change may add a second non-zero exit.

- **Redaction is a positive whitelist (ADR-185, "report output drops paths entirely").**
  Only the fields named in the `UsageEvent` shape and the `report.json` schema may reach the
  output — no paths, no `$HOME` fragments, no usernames, no prompt text. Anything new this
  change reads (a sidecar file, a filename) must be mapped into the existing whitelisted
  fields or dropped; nothing new gets emitted.

- **Prior decisions this design is bound by, and the three it amends.** ADR-186 (run identity
  is the `sessionId`, so re-mining the same session yields identical `run` values and diffing
  stays meaningful) holds unchanged — sub-agent lines carry the *parent* session id, so the
  identity survives the new event source. ADR-183 (the price table is claude-binding-owned,
  overridable via `--prices`) holds and constrains where the `1e6` may go. Three are amended
  by this change, each by a ratified ADR rather than by this doc:
  **ADR-187** (inline usage opt-in) → refined by ADR-329, which flips the default and forbids
  the per-phase split it objected to;
  **ADR-119** (`.claude/craft-metrics.md` is a separate append-only metrics artifact) → kept,
  with ADR-330 changing the row's *data source* and ADR-331 honoring append-only by making the
  boundary marker itself an append;
  **ADR-184** (the miner *complements* the ledger — "cheap append = live breadcrumb; miner =
  offline deep read", ledger sourced from the live `Agent` `<usage>` block that "exposes only
  `subagent_tokens`") → the strained one. That block is precisely the final-message usage this
  design proves is ~100x low, so ADR-184's stated data source is now known to be *wrong*, not
  merely cheap. ADR-330 replaces it with a per-phase transcript read.

- **`prose-lint` and design docs.** Docs under `docs/contributing/design/` are outside the
  `prose-lint` corpus and outside `intention-lint`'s living set, so this doc may quote
  banned words and stale strings freely; the pre-PR gate checks it only through
  `scripts/design-lint.sh` (six required `##` headings).

- **`engine/bin` shim convention.** Bins are ~5-line shims over `engine/src/<name>-main.js`;
  all logic lives in `engine/src/` so mutation testing (`npm --prefix engine run mutation`,
  scope `engine/src/**`) covers it. Bin smoke tests go in `engine/test/<name>.bin.test.js`,
  core tests in `engine/test/<name>.test.js`. `usage-mine` already follows it.

- **The artifacts that encode the broken accounting.**
  `docs/contributing/metrics-baseline.report.json` (the committed drift baseline — 27 runs,
  144 groups, 39.7M total relative tokens, produced entirely by the broken path);
  `.claude/craft-metrics.md` (append-only, 30.6K, 372 rows, **372 of them `cache=na`**);
  `README.md` (FAQ run-count and run-hours claims, guarded by the `readme-drift` CI job).

- **The artifacts that encode the *correct* accounting, and are therefore the oracle.**
  `README.md` §"What it costs, measured" and `docs/guides/comparison.md` publish a three-arm
  table (`88.6M/$62.72`, `154.3M/$103.95`, `544.3M/$297.55`). `comparison.md` §"Measuring this
  yourself" states the method those figures were collected by, and it is *this* design's
  method: *"Sub-agent cost is not in the spawn rollup… Read the nested per-sub-agent
  transcripts instead"* — with craft's own ledger called out in the same paragraph as carrying
  the error. The three arms' transcripts are still on disk, so those figures are not an
  external claim to be taken on trust: they are a runnable oracle. They are reconciled to the
  cent in `## Design`.

## Requirements

Verifiable statements that must hold when this ships:

1. **Sub-agent token truth.** For a session whose sub-agent transcripts exist on disk, the
   report's sub-agent token total equals the sum of `message.usage` over those transcripts
   under the convention `input + output + cache_read + cache_creation.ephemeral_5m +
   cache_creation.ephemeral_1h` — not the spawn rollup's final-message `usage`. Pinned
   target for session `2c4cd054-…`: **202,108,045** sub-agent tokens across 20 transcripts,
   against the **2,015,931** the current miner reports (100.3x).

2. **No double counting, structurally.** No token is counted twice when both a rollup and
   its sub-agent transcript are present, and the guarantee holds by construction (a single
   emission rule that rollup lines cannot satisfy) — not by a post-hoc de-duplication
   filter over emitted events.

3. **In-flight sub-agents are not dropped.** Enumeration is driven by transcript files, so a
   sub-agent that has a transcript but no rollup yet is counted. Pinned: **6 of 243**
   transcripts in the local corpus have no rollup; **0** rollups have no transcript.

4. **Every sub-agent event carries a role.** `role`/`phase` resolve for sub-agents whose
   parent rollup carries no `agentType`. Pinned: rollup-`agentType` coverage is 188/237
   corpus-wide (13/20 in the reference session); the `agent-<id>.meta.json` sidecar carries
   `agentType` on **243/243**. An unresolvable label is a *counted* fallback surfaced on
   stderr, never a silent `null`.

5. **Advisory contract intact.** A session directory with no `subagents/` child, an empty
   `subagents/`, an unreadable one, a transcript with no sidecar, a malformed sidecar, and a
   malformed transcript line each produce a recorded no-op or a counted skip and exit 0.
   Exit codes are unchanged: `0` everywhere except unknown `--source`.

6. **Containment preserved across the recursion.** Every path opened under the new discovery
   is realpath-contained against the READ root before it is opened, by the same
   `containByRealpath` call chain that guards today's flat discovery. A symlinked
   `subagents/` pointing outside the root is refused and counted, not followed.

7. **Redaction unchanged.** No new field reaches `report.json`/`report.md`; sidecar contents
   (`description`, `toolUseId`) and filenames never leave the adapter.

8. **The advertised front door reports something.** A zero-argument
   `node engine/bin/usage-mine.js` from a repo with transcript history produces a report
   with runs in it. Today it produces `{"note":"no .jsonl transcript files found","runs":[]}`
   — see defect 3 below (ADR-336).

9. **Determinism.** No clock, no random, no network in any new code path; identical input
   trees produce byte-identical `report.json` through `serializeReport`.

10. **Main-loop cost is in the default report.** Without any flag, a report over a corpus with
    main-loop turns carries a `role: 'main-loop'`, `phase: null` group whose tokens are the
    exact sum over main-loop `message.usage` lines, with no per-phase split of that total
    anywhere in the report. `--no-inline` suppresses that group and nothing else (ADR-329).
    Pinned: `--include-inline` today reaches only the zero-event *note text* and has never
    caused a single inline event to be emitted — see defect 4 — so this requirement is about
    building a flag path that does not exist, not about flipping one that does.

11. **`cost.priced` is denominated in dollars.** For a group whose model is in the price table,
    `cost.priced` equals `Σ(tokenClass × perMTokRate) / 1e6` USD. The unit holds across
    **every** field derived from it — `runs[*].groups[*].cost.priced`,
    `runs[*].reviewCycles[*].costPerCycle[i]`,
    `recommendations[*].evidence.pricedCreationCost`, `.currentPricedCost`,
    `.projectedPricedCost`, and `baselineDeltas[*].pricedCostDelta` — and `renderMarkdown`
    applies **no** further scaling. Verifiable end-to-end: a group whose `cost.priced` is
    `0.0006225` renders as `$0.0006`, and `evidence.shareOfRunCost` stays a ratio in `[0,1]`
    (it is a quotient of two priced values and breaks by a factor of 10⁶ if only one of them
    is converted — see the call-site table in `## Design`).

12. **The two current models are priced.** `DEFAULT_PRICES` gains `claude-opus-5` at
    `priceEntry(5, 25)` and `claude-sonnet-5` at `priceEntry(3, 15)`. Verifiable against the
    live corpus: **1,955,354,633 of 3,945,021,795 tokens (49.6%) currently price to `null`**
    because they carry one of those two ids; after the change, zero do.

13. **The published comparison figures reconcile, to the cent.** With ADR-328/329/338 in
    force, the miner run over each experiment arm's own project directory reproduces the
    `README.md` / `docs/guides/comparison.md` table exactly:

    | Arm | `--dir` (under `~/.claude/projects/`) | Window | `cost.relative` | `cost.priced` |
    |---|---|---|---|---|
    | plain | `-Users-scolladon-workspace-perso-node-sgd-bench-arm-a-plain` | whole dir | **88,634,469** (88.6M ✓) | **$62.722473** ($62.72 ✓) |
    | staged | `-Users-scolladon-workspace-perso-node-sgd-bench-arm-b-staged` | whole dir | **154,307,277** (154.3M ✓) | **$103.950712** ($103.95 ✓) |
    | craft | `-Users-scolladon-workspace-perso-node-sgd-bench-arm-c-craft` | lines before `2026-08-05T00:00:00Z` | **544,271,827** (544.3M ✓) | **$297.550926** ($297.55 ✓) |

    The craft arm needs the window because that session was resumed the following day; the
    whole directory yields 753,224,548 / $425.62 (see *Reconciling the published figures*).
    **How this is verified without a corpus in CI:** as a golden vector over the measured
    per-model token-class totals, in the pure core — DC-11(a) and Test strategy §"the dollar
    reconciliation test". An exact *live* re-derivation of the craft arm additionally needs an
    upper time bound the CLI does not have; that is DC-11(b), and it is not required for this
    requirement to hold.

14. **Ordering (ADR-332).** The pricing correction (Req 11 + 12) lands **before**
    `docs/contributing/metrics-baseline.report.json` is regenerated, and the regeneration runs
    with main-loop inclusion **on** (Req 10). Mechanically verifiable on the committed
    baseline: no group carrying `claude-opus-5` or `claude-sonnet-5` has `cost.priced: null`;
    at least one group has `role: "main-loop"`; and the sum of `cost.priced` across the file is
    of order 10³ dollars, not 10⁹ — the current file sums to 31,171,735.70, so any regenerated
    value above ~10⁶ is proof the divisor did not land.

15. **Baseline coherence.** After the change, `--baseline docs/contributing/metrics-baseline.report.json`
    does not report every phase as drifted. Since drift compares per-phase *means* and the
    token correction is ~100x, this is only satisfiable by the ADR-332 regeneration.

16. **The ledger stops accruing false rows, and the break is visible.**
    `skills/run/SKILL.md` instructs the session to source `tokens=` / `duration_ms=` /
    `cache_read=` / `cache_creation=` from that phase's own sub-agent transcript rather than
    from the returned spawn usage block (ADR-330), so a new row can carry the real cache split
    instead of degrading to `cache=na`. One boundary marker line is appended to
    `.claude/craft-metrics.md` naming the date and the correction (ADR-331); the 372 existing
    rows are left in place, unedited.

17. **Acceptance.** `bash scripts/ci.sh` green (including the `readme-drift` job, which will
    demand the README FAQ claims move with the regenerated baseline);
    `npm --prefix engine run mutation` holds its threshold over
    `engine/src/observability/**`; a regression test fails on the pre-fix parser
    (Test strategy §"the 100x regression test") and a second one fails on the pre-fix pricing
    path (§"the dollar reconciliation test"); no provenance refs, no suppression directives,
    no swallowed errors in any touched source or test.

## Design

### Empirically pinned corpus matrix

Measured on this box on 2026-08-06 against
`~/.claude/projects/-Users-scolladon-workspace-perso-craft`. Every number below was
re-derived here; the orchestrator's pre-chew is corrected where it differs (marked ⚠).

**The corpus is live and grows under the miner's feet.** Re-measured later the same day while
revising this doc against the ADRs, it read 274 files / 244 sidecars / 3,945,021,795 tokens
against the 273 / 243 / ~3.92B below. Nothing contradicts — one session was added in between.
Every ratio, coverage fraction, and structural pin held identically across both measurements.
Treat the absolute counts as dated anchors and the *ratios* as the load-bearing claims; no test
may assert a corpus absolute (see `## Test strategy`, tier 2).

**Layout** — verified, non-negotiable:

```
~/.claude/projects/<dashed-cwd>/
  <sessionId>.jsonl                            main loop      (miner reads ONLY these today)
  <sessionId>/subagents/agent-<id>.jsonl       one per sub-agent (never opened today)
  <sessionId>/subagents/agent-<id>.meta.json   sidecar, 1:1 with the transcript
  memory/                                      ⚠ a NON-session directory sits in the root
```

**Corpus census:**

| Measure | Value |
|---|---|
| top-level `<sessionId>.jsonl` (main loop) | 30 |
| directories in the projects dir | 21 (20 session dirs + `memory/`) |
| session dirs carrying a `subagents/` child | 19 |
| sub-agent transcripts | 243 |
| sidecars (`.meta.json`) | 243 — 1:1, no orphan on either side |
| sidecars carrying `agentType` | **243 / 243** |
| sidecars carrying `spawnDepth` | 243 / 243 (240 at depth 1, **3 at depth 2**) |
| sidecars carrying `model` | ⚠ **64 / 243**, and it is a short alias (`sonnet`/`opus`), not a priceable model id |
| main-loop tokens (corpus) | 2,359,008,527 |
| sub-agent tokens (corpus) | 1,561,804,664 |
| rollup `usage` tokens (corpus) | 22,630,752 over 237 rollups (188 carrying `agentType`) |
| corpus under-report ratio | **69.0x** |
| transcripts with **no** rollup (in-flight / orphan) | **6** |
| rollups with **no** transcript | **0** |

**Reference session `2c4cd054-388d-4e72-9c03-eb8b9aa445d6`:**

| Measure | Value |
|---|---|
| main-loop tokens | 190,556,942 |
| sub-agent tokens | 202,108,045 (20 transcripts) |
| total | 392,664,987 |
| rollup-reported sub-agent tokens | 2,015,931 |
| **under-report ratio** | **100.3x** |
| rollup lines | ⚠ **20**, not 13 — all 20 carry `agentId`; only **13** carry `agentType` |
| join `rollup.agentId` ↔ `agent-<id>.jsonl` ↔ in-file `agentId` | ⚠ **20/20**, zero misses either direction |

⚠ **The pre-chew's "7 orphaned reviewer transcripts" is wrong, and the real shape matters
more.** In this session *every* transcript has a rollup. The 7 unlabelled ones are rollups
that carry `agentId` + `resolvedModel` but **no `agentType`, no `usage`, and no
`totalTokens`** — the shape a cancelled or errored spawn leaves behind. All 7 are
`craft:reviewer` per their sidecars. `isRollupLine` still matches them (`resolvedModel != null`),
so the current miner emits 7 events with zero tokens, `phase: null`, `role: null`. They are
visible in the committed baseline as
`{"model":"claude-sonnet-5","phase":null,"role":null,"cost":{"priced":null,"relative":0}}` —
noise groups the current design manufactures. So the failure is *not* "some sub-agents have
no rollup"; it is "some rollups carry neither the label nor the cost". Rollup-driven
enumeration under-labels **and** under-counts on the same lines.

**Per-sub-agent detail (reference session), rollup vs. truth:**

| agentId | rollup `agentType` | rollup `totalTokens` | rollup `usage` sum | transcript truth |
|---|---|---|---|---|
| a0fb0a93… | `craft:designer` | 189,080 | 189,080 | **19,606,787** |
| a08b858c… | `craft:planner` | 211,968 | 211,968 | **26,870,771** |
| a129dbeb… | `craft:part-implementer` | 233,720 | 233,720 | **33,311,755** |
| ac97ec3d… | `craft:part-implementer` | 201,723 | 201,723 | **26,074,639** |
| a99955db… | `craft:harness-triager` | 204,933 | 204,933 | **16,029,644** |
| a64c94bc… | `craft:docs-writer` | 158,005 | 158,005 | **12,587,600** |
| a2a27422… | *(absent)* | *(absent)* | 0 | **6,090,962** |
| a305e152… | *(absent)* | *(absent)* | 0 | **7,478,507** |
| a501bb8e… | *(absent)* | *(absent)* | 0 | **5,595,677** |
| a79f8bbf… | *(absent)* | *(absent)* | 0 | **4,001,816** |
| a4b4a4af… | *(absent)* | *(absent)* | 0 | **3,753,962** |
| a79ba544… | *(absent)* | *(absent)* | 0 | **2,943,902** |
| a7c27c4d… | *(absent)* | *(absent)* | 0 | **2,942,364** |

`rollup.totalTokens` is identical to the sum over `rollup.usage` on every typed row — it
corroborates nothing, exactly as the brief states.

**Sidecar shape** (`agent-<id>.meta.json`, one line):

```json
{"agentType":"craft:reviewer","description":"Review: tests dimension",
 "toolUseId":"toolu_01WN6xT7zHD21vTju7KnpJ6L","spawnDepth":1}
```

`model` is present on only 64/243 and is a short alias — **not** a usable model source.

**Sub-agent transcript line shape** — top-level keys `agentId, cwd, entrypoint, gitBranch,
isSidechain, message, parentUuid, promptId, sessionId, timestamp, type, userType, uuid,
version`. Pinned properties:

| Property | Measured |
|---|---|
| `isSidechain` | `true` on every line |
| `sessionId` | the **parent** session id on 20/20 transcripts — run identity resolves unchanged (ADR-186) |
| `timestamp` | present on **2707/2707** lines — `--since` keeps working |
| `message.model` | full priceable ids (`claude-opus-5`, `claude-sonnet-5`); **never varies within a transcript** (0/20 files) |
| `slug` | absent |
| `agentId` | equals the filename's `<id>` on every line |
| `cache_creation_input_tokens` vs `ephemeral_5m + ephemeral_1h` | **equal on 1618/1618** usage lines (8,996,735 both ways) |

That last row is what makes `tokensFromClaudeUsage` + `computeRelativeCost` reproduce the
published comparison's token formula exactly, with no new arithmetic. It was re-confirmed on a
second, independent corpus while revising this doc: 0 mismatches across all 3,607 usage lines of
the three benchmark arms — see *Reconciling the published figures*.
`message.model` also carries `claude-opus-4-8` and `claude-fable-5` elsewhere in the corpus,
both already in `DEFAULT_PRICES`; only the two `-5` ids are missing (defect 7).

### Defect 1 — non-recursive discovery (the structural root cause)

`readdirSync(safeTranscriptDir).filter(f => f.endsWith('.jsonl'))` is flat. It can only ever
see top-level main-loop files and can never descend into the sibling `<sessionId>/`
directory. 243 sub-agent transcripts exist right now, all invisible.

### Defect 2 — rollup `usage` is the final assistant message only

`eventFromRollup` reads `toolUseResult.usage`, which is the sub-agent's **last** message's
usage block. `totalTokens` is derived from the same block. Neither is cumulative. Ratio
measured above: 100.3x on the reference session, 69.0x corpus-wide. Ratio is *not* a
constant — it scales with how long the sub-agent ran, so no correction factor is possible.

### Defect 3 — the zero-arg front door reports nothing (⚠ not in the brief)

`resolveTranscriptDir(null, projectsRoot)` returns `~/.claude/projects` itself. Its
non-recursive listing contains directories only — zero `.jsonl`. Verified live in a mktemp
throwaway:

```
$ node engine/bin/usage-mine.js          # zero args, the documented craft:metrics path
exit=0
{"note":"no .jsonl transcript files found","runs":[],"schemaVersion":1}
```

`skills/metrics/SKILL.md` states *"The miner resolves the transcript directory for the
current working directory internally (`cwd → dashes` mapping)"*. **That mapping does not
exist anywhere in `engine/`** (grep for `dashed`/`toDashes`/`replace(/\//g` → no hits). So
the advertised zero-argument `/craft:metrics` has always produced an empty report; every
non-empty report ever produced — including the committed baseline — came from an explicit
`--dir`. This is a third independent defect on the same feature and is why the brief's
"cannot be trusted" is an understatement. Fixing it is ADR-336.

### Defect 4 — `--include-inline` is inert (⚠ not in the brief, and it changes ADR-329's shape)

`parseArgs` sets `parsed.includeInline`, and that value is read in exactly **one** place:

```js
if (!events.length) { writeNoOp(parsed.includeInline ? NO_EVENTS_NOTE : INLINE_GAP_NOTE); return EXIT_OK; }
```

It selects between two *note strings* on the zero-event path. It is never passed to
`parseLines`, and the claude adapter takes no such parameter — its `parseLines(lines, since)`
signature has no third argument today, and its body `continue`s on every non-rollup line
unconditionally. **So `--include-inline` has never included one inline token**, and ADR-187's
"opt-in" was documented but never wired.

This matters for how ADR-329 is built: `--no-inline` cannot be implemented by inverting an
existing flag path, because there is no existing flag path. The inclusion decision must reach
the parser (or the front door must filter the parser's output), which is one more reason the
`context` argument of ADR-334 carries `sourceKind` — a `sourceKind: 'main'` event is exactly
the set `--no-inline` drops, and the front door can drop it without knowing what `sourceKind`
means beyond the value the adapter's own discovery put there. Under ADR-334's opaque-blob
contract the cleanest expression is that the *adapter* honors the flag: the third argument is
authored by `discover`, so the front door passes the flag alongside it and the adapter decides.
Either placement satisfies ADR-329; neither is a new load-bearing choice, because the observable
contract — "no main-loop group in the report" — is identical.

**Two more surfaces the flag drags along.** `INLINE_GAP_NOTE` reads
*"no rollup events found; inline phases excluded by default (pass --include-inline to include)"*
— every clause of it is false after ADR-328 and ADR-329 (rollups are not events, inline is not
excluded, and the flag it names no longer exists). It is one of only four notes the port can
emit, so it is part of the observable contract and its replacement belongs in the same commit as
the flag. And `parseArgs` has no `--no-inline` case at all; adding one is not symmetric with
deleting `--include-inline`, because the parsed field's default inverts.

**The trap in that flag: `--no-inline` must drop main-loop *events*, never main-loop *markers*.**
`auto-skip:` phase tokens are harvested from main-loop assistant text and feed `phaseSkipRecs`,
which is a behavioural signal with no cost dimension. A `--no-inline` implemented as "skip
main-loop lines" silently disables phase-skip recommendations as a side effect. The drop applies
to the emitted `UsageEvent[]` only; the marker scan runs first and is unconditional.

### The emission rule — how double counting is structurally prevented

The current parser emits one event per **rollup** line. The fix inverts it:

> **Emit exactly one `UsageEvent` per line carrying `message.usage`.**

That single rule is simultaneously the main-loop rule and the sub-agent rule, and it
excludes every rollup *by shape*, not by filter. Proven across the whole 273-file corpus:

| Line class | Count | `type` |
|---|---|---|
| lines matching `isRollupLine` | 240 | `user` (240/240) |
| lines carrying `message.usage` | 23,540 | `assistant` (23,540/23,540) |
| **lines carrying both** | **0** | — |

The two sets are disjoint by construction: a rollup rides on a `user` line's
`toolUseResult`; usage rides on an `assistant` line's `message`. A rollup can therefore
never satisfy the emission rule, so a rollup's derived summary can never be added to the
transcript it summarises. This is the structural guarantee Requirement 2 asks for — there is
no de-duplication step to get wrong, because there is no second token source in the rule.

It also disposes of the **nested-spawn** vector without a special case. Pinned: session
`aee6119c-…` has 3 `spawnDepth: 2` sub-agents; their transcripts are **flat siblings in the
same `subagents/` directory** (no nested directories anywhere — verified across all 19
`subagents/` dirs), and the rollups for them live **inside a sibling depth-1 transcript**
(`agent-aff7b295…jsonl`), not in the main-loop file. A design that mixed rollups and
transcripts would double-count depth-2 work while looking correct at depth 1. Under the
single emission rule those in-transcript rollups are `user` lines and contribute nothing.

Complementary structural fact: main-loop files contain **zero** `isSidechain: true` lines and
**zero** lines carrying `agentId` (0/30 files). Sub-agent turns are never interleaved into
the parent file. So "main-loop file" and "sub-agent transcript" partition the token space
with no overlap, and summing both is addition over disjoint sets.

### Discovery and recursion — where it lives

The design tension named in the brief is real: file **discovery** lives in
`usage-mine-main.js`, token **truth** lives in files only the claude adapter knows how to
interpret, and the spec forbids handing the adapter an absolute path.

Ratified resolution (ADR-333 / ADR-334): **the adapter exports a port-injected discovery
descriptor; the front door remains the only holder of paths, containment, and I/O.**

```
engine/src/observability/adapters/claude/discovery.js   (new)
  discover(ports) → TranscriptEntry[]
      ports = { listDir(relPath) → string[],      // front-door-owned, contained, [] on failure
                readText(relPath) → string|null } // front-door-owned, contained, null on failure
      TranscriptEntry = { relPath: string, context: object }  // context OPAQUE to the front door

engine/src/observability/adapters/claude/telemetry.js   (changed)
  parseLines(lines, since, context) → { events, skipped, markers }

engine/src/observability/usage-mine-main.js             (changed)
  SOURCE_DISCOVERY   frozen per-source lookup, mirroring DEFAULT_READ_ROOTS /
                     SOURCE_FILE_MATCHERS; entry absent ⇒ today's flat matcher
  streamTranscriptFiles(entries, …)   contains + opens each entry.relPath, passes
                                      entry.context straight through to parseLines
```

Why this shape:

- **The spec contract holds literally.** The adapter still never receives an absolute path.
  It reasons in *relative* paths and parses a line stream. The front door joins,
  realpath-contains, opens, and reads.
- **`discover` performs no I/O of its own.** Every listing and every sidecar read goes
  through the injected `listDir`/`readText`, which the front door implements over
  already-contained paths and which absorb their own failures (`[]` / `null`). The walk is
  therefore unit-testable against fake ports with no filesystem, and containment cannot be
  bypassed by the adapter even in principle.
- **`context` is opaque.** The front door never reads a field of it. The claude adapter
  authors it (`{ sourceKind, agentType }`) and the claude adapter consumes it. No
  claude-specific knowledge leaks into the shared selector — the same discipline that keeps
  `SOURCE_FILE_MATCHERS` generic. The sidecar's other fields (`description`, `toolUseId`,
  `spawnDepth`, the unreliable `model`) are read and **discarded at the adapter boundary**;
  nothing but `agentType` survives into the context, which is what keeps the redaction
  whitelist (Requirement 7) trivially true.
- **It is the house extension seam.** Three per-source frozen lookups already exist; this is
  the fourth, not a conditional inside a shared function.
- **Sources with no entry are untouched.** opencode/pi/copilot/codex/aider keep today's flat
  `readdirSync` + matcher path and today's two-argument `parseLines` call (the third
  argument is optional and ignored). No other adapter changes.

**The walk is a pinned shape, not a generic recursion** (ADR-335). `discover` reads exactly:

```
<root>/*.jsonl                        → { relPath, context: { sourceKind: 'main' } }
<root>/<dir>/subagents/agent-*.jsonl  → { relPath, context: { sourceKind: 'subagent', agentType } }
                                          agentType read from the adjacent .meta.json sidecar;
                                          every other sidecar field discarded here
```

Depth is bounded at exactly these two levels, and an entry is accepted only if it matches
`agent-*.jsonl` **and** sits directly under a `subagents/` child of a root-level directory.
`memory/` and any other non-session directory are listed, found to have no `subagents/`
child, and skipped — a generic recursive walk would descend them, and would also follow
whatever a future upstream release drops there. Fail-closed by shape.

Two front-door details follow from replacing the matcher with a descriptor for the claude
source. `SOURCE_FILE_MATCHERS` and `resolveSourceFilter` are untouched and keep serving the
five sources with no `SOURCE_DISCOVERY` entry; `noFilesNote(source)` still resolves its
label through `resolveFileLabel`, so the zero-file note for claude remains
`no .jsonl transcript files found` and stays accurate — `.jsonl` is exactly what the
descriptor looks for at both levels.

### Containment across the recursion

Unchanged in kind, extended in reach. `containByRealpath(READ_ROOT, join(READ_ROOT, relPath))`
is called on **every** discovered entry before it is opened, exactly as `streamTranscriptFiles`
does today — the entry is a three-segment relative path instead of a filename, and nothing
else differs. Verified live against the real root:

| Target | Verdict |
|---|---|
| `<root>/<proj>/<sid>/subagents/agent-<id>.jsonl` (3 levels deep) | ALLOWED |
| `<root>` itself | ALLOWED |
| `<root>/../../etc/passwd` | REJECTED |

The sidecar read is a second contained path (`…/agent-<id>.meta.json`) and goes through the
same check. A symlinked `subagents/` resolving outside the root fails the realpath check, is
counted, and the whole session's sub-agent set is skipped — no partial trust. The directory
listings themselves (`readdirSync` on `<root>/<dir>` and `<root>/<dir>/subagents`) are
performed by the **front door's** `listDir` implementation, which contains before it lists;
the adapter's `discover` only names relative paths and reads what the injected ports return,
so it holds no path-resolution power of its own and is testable against fakes.

**Wrong-level `--dir` is a silent-zero footgun, same shape as the codex binding's.** The walk
is anchored on the project directory: `<dir>/*.jsonl` plus `<dir>/*/subagents/agent-*.jsonl`.
Pointing `--dir` one level *down* at a session directory finds neither — no `.jsonl` sits
directly in a session dir, and the sub-agent probe would look for `<sid>/subagents/subagents/`.
The result is `no .jsonl transcript files found`, exit 0, which reads as a cost-free run.
`docs/contributing/specs/telemetry.md` already carries this caveat for `--source codex`; the
claude binding needs the equivalent paragraph, and ADR-336 removes the common case of hitting
it by making the zero-arg default resolve the correct level automatically.

### Advisory contract across the new surface

Every new failure mode maps onto an existing advisory branch. Nothing new can exit non-zero.

| Condition | Behaviour | Exit |
|---|---|---|
| session dir has no `subagents/` child | that session contributes main-loop entries only | 0 |
| `subagents/` exists but is empty | contributes nothing; no note of its own | 0 |
| `readdirSync` on `subagents/` throws (EACCES/ENOENT/…) | caught, counted, that session's sub-agents skipped | 0 |
| transcript has **no** sidecar | entry still emitted; `agentType` unresolved → counted fallback on stderr | 0 |
| sidecar is malformed JSON / missing `agentType` | same counted fallback; never throws | 0 |
| transcript line malformed | existing `skipped++` path, unchanged | 0 |
| every discovery path yields nothing | existing `noFilesNote(source)` no-op report | 0 |
| entry fails containment | existing per-file `continue`, now also counted | 0 |
| unknown `--source` | existing config-error gate, before any I/O | **1** |

The counted-fallback tally rides out on stderr alongside the existing
`usage-mine: skipped N malformed line(s)` line — the "no silent zeros" discipline the codex
and aider bindings already carry. A run that silently counts nothing is indistinguishable
from a cost-free run, which is the failure this whole change exists to end.

### Event field resolution for a sub-agent event

| Field | Source | Notes |
|---|---|---|
| `run` | the line's `sessionId` | the **parent** session id (pinned 20/20) — ADR-186 identity holds; sub-agent groups land in the same run as the main loop |
| `slug` | `null` | absent from sub-agent lines. `groupByRun` takes the first non-null slug per run, so the run's slug is inherited from the main-loop events — **only if main-loop events are in the stream**, which ADR-329 guarantees by default |
| `role` | `roleFromAgentType(context.agentType)` — sidecar | 243/243 coverage; existing `craft:` prefix strip reused unchanged |
| `phase` | `phaseFromAgentType(context.agentType)` — existing `ROLE_TO_PHASE` | unrecognised type ⇒ `null`, as today |
| `model` | `normalizeModel(line.message.model)`, **per turn** | full priceable ids; `[1m]` strip reused. Per-turn rather than per-file so a mid-run model switch attributes correctly even though none was observed (0/20) |
| `tokens` | `tokensFromClaudeUsage(line.message.usage)` | unchanged function; `cacheCreationTtl` picked up from `cache_creation` as today |
| `messages` | 1 per emitted event | aggregate sums them ⇒ a group's `messages` becomes the count of billed turns |
| `durationMs` | 0 per event; per-transcript span folded onto the last event | see below |

`messages` and `durationMs` change meaning, and that must be stated rather than absorbed.
Pinned on `a0fb0a93…`: rollup `totalToolUseCount` = **74** vs **138** usage-bearing lines;
rollup `totalDurationMs` = **921,407** vs transcript wallclock span **1,134,897** ms. These
are different quantities (tool-uses vs. billed turns; agent-active time vs. wallclock
including queueing). `durationMs` is a `drift` dimension, so it cannot become zero without
silently disabling half the drift signal — the design derives it from the transcript's
`last(timestamp) − first(timestamp)` and attributes the whole span to one event per
transcript, so per-group sums stay meaningful. ADR-337 ratified this over the alternative of joining the
rollup for these two dimensions only.

**`--since` interacts with the span and must not be papered over.** The cutoff drops lines
before the timestamp, so the span is computed over the *surviving* lines — a transcript that
straddles the cutoff reports the post-cutoff span, not its full lifetime. That is the
consistent reading (tokens are likewise counted only over surviving lines), and it is the
same convention the existing rollup path effectively has (a rollup either survives the
cutoff whole or is dropped whole). It is recorded here so a reader comparing a `--since`
run against a full run does not read the difference as drift.

**Auto-skip markers are scanned on main-loop entries only.** `parseLines` also harvests
`auto-skip:` phase tokens from assistant text via `autoSkipPhasesInText`. Those tokens ride
in *orchestrator* assistant text; a sub-agent that quotes or writes the token — a docs-writer
editing a page about skip signals, for instance — would inject a false marker into the run
record. The scan is therefore gated on `context.sourceKind === 'main'`. This is new
behaviour introduced by opening files that were never read before, so it needs its own test
rather than inheriting the existing marker tests.

### Main-loop events

Under the single emission rule, main-loop `assistant` lines carrying `message.usage` are
event-bearing on exactly the same terms. Their `agentType` is undefined, so `role`/`phase`
would be `null`. ADR-329 settles what happens next: **all main-loop turns are attributed to a
single `role: 'main-loop'`, `phase: null` group, included by default** — an exact total with an
honest refusal to split it per phase, rather than ADR-187's approximate bucketing. ADR-187's
stated objection ("the orchestrator session's `cache_read` accumulates across phases, inflating
any single inline phase") is an objection to the *per-phase split*, not to the *total*; the
total is exact. Without ADR-329 the default report would omit 2.36B of the corpus's 3.95B
tokens, since ADR-328 simultaneously removes rollups as a token source.

Two consequences the planner must carry:

- **"One group" means one group *per model*.** `buildGroupKey` is `phase \x00 role \x00 model`,
  so a session whose main loop switched models — a degradation, which craft records
  deliberately — yields one `main-loop`/`null` group per model, exactly like every other group
  in the report. ADR-329's "one group" is about refusing a *per-phase* split, not about
  collapsing models. Nothing extra is needed for this; it is stated so nobody implements a
  model-flattening special case to satisfy the ADR's wording.
- **`slug` is restored by side effect.** Sub-agent lines have no `slug`; `groupByRun` takes the
  first non-null slug per run, which only main-loop lines carry. Main-loop events being in the
  default stream is what gives sub-agent groups a run slug at all.
- **A main-loop event's `messages` and `durationMs` are NOT settled by ADR-337**, which speaks
  only to sub-agent events. That gap is DC-12 below, one of the two open choices this revision
  surfaces.

### Priced cost — two defects, their interaction, and where the `1e6` goes

ADR-338 put this path in scope, overriding this doc's earlier recommendation and the brief's
"pricing table updates are out of scope" line. Both defects are pre-existing, independent of
the transcript work, and must land **before** the ADR-332 baseline regeneration.

**Defect 6 — `cost.priced` is not denominated in dollars.**
`DEFAULT_PRICES` entries are documented as *"USD per million tokens (per-MTok)"*, and
`computePricedCost` multiplies raw token counts by those rates with no divisor, so every
emitted `cost.priced` is `dollars × 10⁶`. Summing the committed baseline's `priced` values
gives **$31,171,735.70** for 39.7M tokens — i.e. $31.17. The defect is masked, not absent:
`renderMarkdown` carries a compensating `/1e6` at the render boundary
(`` `$${(g.cost.priced / 1e6).toFixed(4)}` ``, commented *"C2: divide by 1e6 for display"*), so
`report.md` has always shown plausible dollars while `report.json` — the machine-readable
artifact that `craft:init`, `tune-plan`, the baseline and the drift signal all consume — has
always carried the scaled value. `docs/contributing/specs/telemetry.md` documents the field as
`"priced": 0.00123` against `"relative": 4500`, i.e. **as dollars**. The fix therefore makes the
code match its own spec; the spec's schema section needs no change.

**Defect 7 — the two models craft actually runs on are absent from the table.**
`DEFAULT_PRICES` holds `claude-opus-4-8/4-7/4-6`, `claude-sonnet-4-6`, `claude-fable-5`,
`claude-mythos-5`, `claude-haiku-4-5` — no `claude-opus-5`, no `claude-sonnet-5`. Measured on
the live corpus (2026-08-06): **1,955,354,633 of 3,945,021,795 tokens (49.6%) carry one of
those two ids** and therefore price to `null` today.

**How they interact — and why ADR-338 forecloses fixing only one.** Fixing 7 alone converts
half the corpus from `null` (honestly "unknown") to a confidently wrong number 10⁶ too large.
Fixing 6 alone leaves half the corpus unpriced, so the correction is unobservable on exactly the
groups this change creates. Only both together make `cost.priced` mean anything — which is what
ADR-338 ratified and why its option 2 is explicitly foreclosed.

#### What the `1e6` divides, and where — stated so it cannot be applied at the wrong level

The divisor converts a **Σ of (token count × dollars-per-million-tokens)** into **dollars**. It
is applied **once per emitted dollar value**, at the boundary where a Σ becomes a reported
field. It is *not* applied to the rates, and *not* applied per token class:

- **Not to the rates.** `--prices <file>` overrides are documented as per-MTok (ADR-183), and
  `PRICES_AS_OF` exists so the table can be spot-checked against the vendor's per-MTok list
  price. Dividing inside `priceEntry` would silently leave `mergePrices`' override entries
  un-divided — a partial override would then be 10⁶ off against the defaults it merges with,
  which is a worse footgun than the one being fixed. Rates stay per-MTok; the price table's
  unit contract is unchanged.
- **Not per token class.** Arithmetically identical, but it multiplies the number of division
  sites by five and gives a future edit five chances to miss one.

The hazard is that `computePricedCreation` is **both** composed by `computePricedCost` **and**
emitted directly. Dividing in both double-divides (10⁻¹²); dividing in neither leaves an
emitted field scaled. Full call-site inventory of
`engine/src/observability/usage-aggregate.js`:

| # | Site | Reads | Today | After |
|---|---|---|---|---|
| 1 | `computePricedCost(tokens, cacheCreationTtl, prices)` | `computePricedCreation` + 3 class terms | Σ | **Σ / `TOKENS_PER_MTOK`** — the single division named by ADR-338 |
| 2 | `computePricedCreation(cacheCreationTtl, cacheCreation, prices)` **as called from site 1** | — | Σ | **unchanged — must stay undivided**, or site 1 double-divides the creation term |
| 3 | `buildEnrichedGroup` → `pricedCreationCost` | `computePricedCreation` **directly** | Σ | **must be divided at this site** — the only emitter that does not inherit site 1 |
| 4 | `computeCost` → `cost.priced` | site 1 | Σ | inherits ÷ |
| 5 | `buildReviewCycles` → `costPerCycle[i]` | `computeCost().priced` | Σ | inherits ÷ |
| 6 | `buildRoutingRec` → `projected`, `evidence.projectedPricedCost`, `.currentPricedCost` | site 1 + `cost.priced` | Σ | inherits ÷ on both sides of the `projected >= expensive.cost.priced` comparison — scale-invariant, so routing behaviour is unchanged |
| 7 | `cacheHotspotRecs` → `evidence.shareOfRunCost` | `pricedCreationCost / Σ cost.priced` | ratio, unit-consistent | **stays a ratio only if site 3 is divided** — otherwise it becomes 10⁶ |
| 8 | `computeBaselineDeltas` → `pricedCostDelta` | difference of two `cost.priced` | Σ | inherits ÷ |
| 9 | `renderMarkdown` cost string | `g.cost.priced / 1e6` | compensator | **delete the `/1e6`** — leaving it renders `$0.0000` for every group |

Row 7 is the reason row 3 cannot be skipped: `shareOfRunCost` is currently *correct* precisely
because numerator and denominator are scaled identically. A fix applied only to
`computePricedCost` breaks a field that works today. Row 9 is the reason the fix cannot be
applied without touching the renderer: the compensator and the correction cancel to a
1000000× under-report in `report.md`.

Shape: one named constant (`TOKENS_PER_MTOK = 1e6`) and one named conversion used at sites 1
and 3, so both emitters read as a unit conversion rather than as a magic divisor. `pricing.js`'s
header line *"The core stores per-MTok rates directly; no 1e6 scaling is applied"* and
`docs/contributing/plan/usage-telemetry-miner.md`'s *"the core only multiplies, never interprets
the unit"* both become false and must be corrected in the same change — after this, the core
**does** interpret the injected table's unit as per-MTok, and that is now a load-bearing
contract of the port rather than an incidental convention.

#### Reconciling the published figures — measured, not assumed

`README.md` and `docs/guides/comparison.md` publish a three-arm table. `comparison.md`
§"Measuring this yourself" states the collection method, and it is this design's method:
*"Sub-agent cost is not in the spawn rollup… Read the nested per-sub-agent transcripts
instead"*, with the ~58x under-report and craft's own broken ledger named in the same
paragraph. All three arms' transcripts are still on disk, so the figures were re-derived rather
than trusted. Measured on this box on 2026-08-06 with the design's token convention and the
corrected pricing path (`opus-5 = priceEntry(5,25)`, `sonnet-5 = priceEntry(3,15)`, cache
multipliers `0.1 / 1.25 / 2.0`, one `1e6` division):

| Arm | Project dir under `~/.claude/projects/` | Files | Published | Re-derived tokens | Re-derived dollars |
|---|---|---|---|---|---|
| plain | `…-sgd-bench-arm-a-plain` | 1 main, 0 sub | 88.6M / $62.72 | **88,634,469** | **$62.722473** |
| staged | `…-sgd-bench-arm-b-staged` | 1 main, 0 sub | 154.3M / $103.95 | **154,307,277** | **$103.950712** |
| craft | `…-sgd-bench-arm-c-craft` | 1 main, 20 sub | 544.3M / $297.55 | **544,271,827** | **$297.550926** |

**All three reconcile exactly.** The craft arm's arithmetic in full, from the per-model class
totals over lines timestamped before `2026-08-05T00:00:00Z`:

```
claude-opus-5    in 2,800×5 + out 815,845×25 + cacheRead 226,695,412×0.5
                 + c5m 5,092,346×6.25 + c1h 985,739×10          = 175,442,383.50
claude-sonnet-5  in 11,534×3 + out 319,302×15 + cacheRead 303,340,224×0.3
                 + c5m 7,008,625×3.75 + c1h 0×6                 = 122,108,542.95
                                                          Σ    = 297,550,926.45
                                                    ÷ 1e6      = $297.550926 → $297.55 ✓
tokens: 233,592,142 (opus-5) + 310,679,685 (sonnet-5)           = 544,271,827 → 544.3M ✓
sub-agent share: 411,039,909 / 544,271,827 = 75.5%  (comparison.md: "75% of tokens here") ✓
```

What this pins, beyond the headline:

- The token convention (`input + output + cache_read + ephemeral_5m + ephemeral_1h`) is
  confirmed against an independent oracle on 2,853 usage lines.
- Both new rate entries are confirmed to the cent. `claude-opus-5 = priceEntry(5, 25)` and
  `claude-sonnet-5 = priceEntry(3, 15)` are not looked-up values; they are the only rates that
  reproduce the published dollars.
- **Every cache multiplier is independently exercised.** Arms A and B carry `ephemeral_1h` with
  zero `ephemeral_5m` (confirming `2.0×`); arm C carries both (confirming `1.25×`); all three
  are cache-read-dominated (confirming `0.1×`).
- The `1e6` divisor is confirmed as the correct and only scaling: the published dollars *are*
  `Σ(tokens × per-MTok rate) / 1e6`.
- **ADR-329 is load-bearing for the reconciliation, not just for completeness.** Arms A and B
  have **zero** sub-agent transcripts — their entire cost is main-loop. Under today's default
  the miner emits no events for them at all and writes the `INLINE_GAP_NOTE` no-op. Two thirds
  of the oracle is unreachable without main-loop inclusion on by default.
- `cache_creation_input_tokens === ephemeral_5m + ephemeral_1h` held on **every** usage line in
  all three arms (0 mismatches / 3,607 lines), corroborating the 1618/1618 pin above.

**The one caveat, and it is not a doc defect.** The craft arm's session was *resumed* on
2026-08-05 (two further sub-agents, 10:43 and 12:17). Mining the whole directory therefore
yields **753,224,548 tokens / $425.62** — the published figures plus 208,952,721 tokens /
$128.07 of post-experiment work. The miner has `--since` (a lower bound) and **no upper
bound**, so an exact live re-derivation of the craft arm is not expressible through today's
CLI. That is DC-11 below. The published numbers are correct for the window they claim; the
directory has simply moved on since.

**Verdict on the brief's standing question.** Both halves of `544.3M tokens / $297.55` are
reproducible by the corrected miner, and the README and `comparison.md` figures are correct as
published. They are *not*, however, reproducible from craft's own corpus or its regenerated
baseline — those describe a different repository (`sgd-bench-arm-c-craft`, one run) than the
craft repo's own 3.95B-token history. Nothing in README or `comparison.md` needs a numeric
correction on account of this change. What does change there is the FAQ's *telemetry claims*
(run count, median/min/max run hours), which are recomputed from the regenerated baseline —
see *Artifact reconciliation*.

### Artifact reconciliation

- **`docs/contributing/metrics-baseline.report.json`** — 27 runs / 144 groups / 39.7M
  relative tokens, all from the broken path, including one all-zero `claude-sonnet-5`
  `phase: null, role: null` noise group (an untyped rollup, per the analysis above) and 17
  `phase: null` groups from the retired `slice-implementer` role. Drift compares per-phase
  *means*; a ~100x correction reads as drift on every phase, permanently, until the baseline
  is regenerated. ADR-332 regenerates it here, under a **strict ordering**: the pricing
  correction (defects 6 + 7) lands first, then main-loop inclusion (ADR-329) is on, then the
  baseline is regenerated. Regenerating before either would bake a second stale baseline —
  one still carrying `null` for half its groups, or one missing main-loop cost entirely.

  Sanity targets for the regeneration, measured on the live corpus 2026-08-06 (it grows, so
  these are order-of-magnitude anchors, not assertions): 274 files (30 main-loop, 244
  sub-agent), 3,945,021,795 relative tokens, **$3,628.82** priced — of which **$1,397.29** is
  currently unpriceable for want of the two model entries. Runs move from 27 to ≈30, since
  enumeration becomes transcript-driven and sub-agent lines carry the parent session id.
- **`.claude/craft-metrics.md`** — ⚠ **not written by the miner.** `skills/run/SKILL.md`
  (§metrics artifact, and the "Numbers are harness-sourced" note above it) instructs the
  session to append
  `<run-id> <phase-id> tokens=<subagent_tokens> duration_ms=<n> cache_read=<n> cache_creation=<n>`
  from *"the usage block the spawn already returns — exact, zero extra cost"* — the identical
  final-message usage the miner reads, so identically ~100x low (row magnitudes 60k–200k match
  rollup `totalTokens` exactly). **Fixing the miner does not fix future ledger rows.** ADR-330
  settles the writer (source the row from that phase's own sub-agent transcript) and ADR-331
  settles the history (append one boundary marker; never migrate). Both edits are in scope;
  `skills/run/SKILL.md` is explicitly authorized by ADR-330, and the "exact, zero extra cost"
  rationale must be corrected in the same edit rather than left contradicting the new
  instruction.

  ⚠ **Defect 5 surfaces here: the ADR-184 writer upgrade never took effect.**
  ADR-184 replaced the lossy `cache=na` field with a real `cache_read=`/`cache_creation=`
  split, degrading to `cache=na` only "if the split is genuinely unavailable for a given
  spawn". Measured on the committed file: **372 of 372 rows are `cache=na`; zero rows carry
  `cache_read=`.** The degradation path is the only path that has ever executed. The cause
  is the same one this whole design is about — the split was to be recovered "by parsing the
  run's own spawn-rollup lines", and the untyped/usage-less rollups plus the final-message-only
  `usage` make that recovery empty in practice. ADR-330 fixes it in the same stroke: the
  sub-agent transcript carries `cache_read_input_tokens` and `cache_creation` on every
  usage-bearing line, so the split the ledger has never once recorded becomes available from
  the same read that supplies the token total.
- **`README.md`** — two independent surfaces, and conflating them is the easy mistake.
  The *cost comparison table* (§"What it costs, measured") and `docs/guides/comparison.md`
  need **no** numeric change: their figures were collected by this design's own method and
  reconcile to the cent (above). The *FAQ telemetry claims* (`27 telemetered runs`, median
  ≈1.3 h, min ≈0.5 h, max ≈5 h) are recomputed from the regenerated baseline by
  `engine/src/telemetry-claims.js` → `recomputeClaims`, guarded by the `readme-drift` CI job,
  and **will** move. Note that `recomputeClaims` sums `durationMs` across *all* groups in a
  run, and the FAQ prose scopes that sum to *"role-agent activity"* — a claim that main-loop
  groups would falsify by construction. That is DC-12.
- **`docs/contributing/specs/telemetry.md`** — the living-intention page for this scope
  (`subjects: ['engine/src/observability/**']`). Sections needing refresh: *Claude binding*
  (discovery + emission rule + sidecar labelling), *Inline gap / `--include-inline` (ADR-187)*
  (rewritten for ADR-329's default-on + `--no-inline`, not deleted), *Failure semantics* (the
  new counted-fallback branches), the wrong-level `--dir` caveat for the claude binding
  (currently present only for codex), and its final line, which points at the stale path
  `docs/metrics-baseline.report.json` — the real path is
  `docs/contributing/metrics-baseline.report.json`. Its `report.json` schema section needs
  **no** unit change: it already documents `cost.priced` as dollars (`0.00123` against
  `4500` relative), which is what defect 6 makes true.
- **`skills/metrics/SKILL.md`** — its flag table lists `--include-inline` ("Include inline-phase
  transcript segments"); under ADR-329 that row becomes `--no-inline`. Its §2 claim that the
  miner resolves the transcript directory via a `cwd → dashes` mapping becomes true for the
  first time under ADR-336.
- **`engine/src/tune-plan.js`** — `modelRoutingProposals` computes
  `savings = currentPricedCost − projectedPricedCost` and interpolates it into a rationale
  string as `saves ~${savings} priced`. Both operands rescale together, so proposal *selection*
  is unchanged; only the printed magnitude and its unit change. The word "priced" in that
  string now means dollars and should say so.

## Decision candidates

**All eleven original candidates are SETTLED.** They were put to the user in the ADR phase and
ratified as ADR-328…338; the table below records each choice and its record so the planner
never re-opens one. Ten went the way this doc recommended; **DC-10 did not** — the user chose
(c) over the recommended (a), which is why the priced-cost path is designed above rather than
deferred, and why this doc was revised before planning.

| # | Choice | Ratified | Record | Deviation |
|---|---|---|---|---|
| 1 | Where role/phase labels come from once transcripts supply tokens | **(b)** sidecar only; rollups are never read, for tokens or labels | ADR-328 | — |
| 2 | `--include-inline` default | **(b)** default-on, one `role: 'main-loop'` / `phase: null` group, no fabricated per-phase split, `--no-inline` opts out | ADR-329 | — (refines ADR-187) |
| 3a | `.claude/craft-metrics.md` — the writer | **(b)** source each row from that phase's own sub-agent transcript; `skills/run/SKILL.md` is in scope | ADR-330 | — (refines ADR-119, ADR-184) |
| 3b | `.claude/craft-metrics.md` — the 372 historical rows | **(a)** leave + one appended boundary marker; migration foreclosed | ADR-331 | — (refines ADR-119) |
| 4 | Drift-baseline regeneration | **(a)** regenerate in this change, after the pricing correction and with main-loop inclusion on | ADR-332 | — |
| 5 | Where the two-level discovery lives | **(b)** the claude adapter exports `discover({ listDir, readText })`; the front door keeps paths, containment, I/O | ADR-333 | adopted as recommended, no user judgment |
| 6 | How the sidecar label reaches the parser | **(b)** `parseLines(lines, since, context)`, context authored by `discover`, opaque to the front door | ADR-334 | adopted as recommended, no user judgment |
| 7 | Walk shape | **(a)** pinned two-level shape; no generic recursion, no config glob | ADR-335 | adopted as recommended, no user judgment |
| 8 | The zero-arg read root (defect 3) | **(a)** `DEFAULT_READ_ROOTS.claude` resolves `join(projectsDir, dashed(cwd))`; containment root unchanged | ADR-336 | — |
| 9 | `messages` / `durationMs` for **sub-agent** events | **(a)** derive from the transcript — billed turns, and `last − first` span attributed once per transcript | ADR-337 | adopted as recommended, no user judgment |
| 10 | How far cost reconciliation reaches | **(c)** add `claude-opus-5` / `claude-sonnet-5` **and** fix the missing `1e6` divisor | ADR-338 | ⚠ **user overrode the recommended (a)** — option (b) explicitly foreclosed as a partial step |

### Open — surfaced by this revision, covered by no ADR

Two load-bearing choices fall out of the ratified set rather than out of the brief. Both are
consequences of ADR-329 and ADR-338 interacting with surfaces the ADRs did not reach. The
designer does not decide these.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 11 | **How the published-dollar reconciliation is made assertable and reproducible.** ADR-338's consequences require the test strategy to assert `$297.55`, but the exact live re-derivation needs an *upper* time bound the CLI does not have: the craft arm's session was resumed the day after the experiment, so mining its directory yields $425.62, not $297.55. | (a) **assert it as a golden vector in the pure core** — an `aggregate` test over events carrying the measured per-model class totals, asserting `544,271,827` relative and `297,550,926.45 / 1e6` priced; the live recipe in the spec page documents the window as prose and accepts that a whole-directory run reports more; (b) (a) **plus add `--until <iso>`**, the mirror of `--since`, so the recipe reproduces the published number exactly through the front door; (c) live opt-in script only, no CI assertion | **(a)** | (a) satisfies ADR-338's "the test strategy must assert it" with a deterministic, corpus-free, CI-runnable test that pins the exact published claim, and needs no new user-facing surface. (b) is genuinely useful — an upper bound is the natural mirror of `--since` and would make any historical window re-derivable — but it adds a CLI flag, a spec section, and a containment-neutral but test-bearing code path to a change that already spans discovery, pricing, a skill, and a baseline. (c) is ruled out by ADR-338 as written. If (b) is chosen, note that `--until` must filter on the same top-level `timestamp` as `--since` and interact with the ADR-337 duration span identically (span computed over surviving lines only). |
| 12 | **What `messages` and `durationMs` a main-loop event carries.** ADR-337 settles this for sub-agent events only, and ADR-329 puts main-loop events in the default report for the first time. `engine/src/telemetry-claims.js` → `recomputeClaims` sums `durationMs` across **all** groups in a run and feeds the README FAQ's run-hours claims through the `readme-drift` gate; the FAQ prose scopes that number to *"role-agent activity"*. A main-loop group's span overlaps every sub-agent span in the same run, so including it roughly doubles a figure the prose says excludes it. | (a) **`messages` = billed main-loop turns, `durationMs` = 0** — the main-loop group carries exact cost and message count but contributes no duration, keeping run-hours "role-agent activity" as the README states; (b) **symmetric with ADR-337** — `durationMs` = the main-loop transcript's `last − first` span, and the README prose is rewritten to say what the number now means (orchestrator wallclock + summed role-agent spans); (c) main-loop `durationMs` = span, and `recomputeClaims` is changed to exclude `phase: null` groups | **(a)** | It is the only option that leaves the README's *sentence* true, not merely its numbers refreshed, and it keeps `durationMs` meaning one thing across the report — "time attributable to a labelled role". Losing the orchestrator's wallclock costs nothing measurable: it is already recoverable as the run's own span, and no consumer reads it. (b) is more symmetric and arguably more honest as raw telemetry, but it silently redefines a published claim and makes the drift dimension mix two incomparable quantities. (c) fixes the README at the cost of putting report-schema knowledge (`phase: null` means orchestrator) inside the drift-guard, which is the coupling `recomputeClaims` was written to avoid. Whichever is chosen, `messages` for a main-loop event is 1 per billed turn under every option — that is not in question. |

## Test strategy

TDD, London-school, Given/When/Then titles, AAA bodies, `sut` variable; ≥80% coverage;
`engine/src/observability/**` is the mutation target. Existing harnesses are extended — no
new test framework, no new fixture root. No provenance refs, no suppression directives, no
swallowed errors in any touched source or test.

### Proving against real data without committing 240MB

The corpus is ~3.9B tokens across 273 files. Three tiers, none of which commits bulk data:

1. **Frozen minimal fixtures (committed).** A new `engine/test/fixtures/telemetry/subagents/`
   tree mirroring the pinned layout exactly — one main-loop `<sid>.jsonl`, one
   `<sid>/subagents/agent-<id>.jsonl` + `.meta.json`, plus targeted degenerate cases
   (transcript with no sidecar; malformed sidecar; sidecar without `agentType`; a depth-2
   sibling whose rollup lives in a depth-1 transcript; an empty `subagents/`; a session dir
   with no `subagents/`; a `memory/`-style non-session directory). Each transcript is a
   handful of lines with **real field names and hand-chosen small numbers**, structurally
   identical to the pinned shapes recorded in `## Design`. Total well under 20KB. This is
   the same discipline `engine/test/fixtures/{codex,pi,opencode,copilot}/` already use.

2. **Arithmetic pinned to the real corpus by assertion, not by data.** The measured totals
   in `## Design` (202,108,045 / 2,015,931 / 100.3x; 20 rollups, 13 typed; 243/243 sidecar
   coverage; 6 orphan transcripts) are recorded in this doc as the reproduction record. A
   `engine/test/telemetry-claude-subagents.test.js` case asserts the *token convention*
   — that `tokensFromClaudeUsage` + `computeRelativeCost` over a usage block equals
   `input + output + cache_read + ephemeral_5m + ephemeral_1h` — which is the one property
   the corpus reconciliation actually depends on (pinned equal on 1618/1618 real lines).

3. **An opt-in live reconciliation recipe, not a test.** `scripts/` gains no new gate; a
   short reproduction recipe goes in the spec page so any maintainer can re-derive the
   corpus numbers on their own machine in one command. It never runs in CI (no corpus in
   CI, and the numbers are machine-specific). The recipe must name the craft arm's window
   caveat explicitly — see DC-11.

### The dollar reconciliation test (Requirements 11, 12, 13)

ADR-338's consequences require this change to *assert* the published dollar figure, not merely
claim it. The assertion is a **golden vector in the pure core** — deterministic, corpus-free,
CI-runnable, and pinning the exact published claim (DC-11(a); if the user picks (b) this test
stays and gains a live counterpart):

> *Given two `UsageEvent`s carrying the measured per-model token-class totals of the published
> craft arm — `claude-opus-5` with `{input: 2_800, output: 815_845, cacheRead: 226_695_412,
> cacheCreation: 6_078_085}` and `cacheCreationTtl {creation5m: 5_092_346, creation1h: 985_739}`,
> and `claude-sonnet-5` with `{input: 11_534, output: 319_302, cacheRead: 303_340_224,
> cacheCreation: 7_008_625}` and `cacheCreationTtl {creation5m: 7_008_625, creation1h: 0}` —
> when `aggregate` runs against `DEFAULT_PRICES`, then the summed `cost.relative` is
> **544,271,827** and the summed `cost.priced` is **`297_550_926.45 / 1e6`** (297.55092645),
> which renders as `$297.5509`.*

It fails three distinct ways on three distinct pre-fix states, which is what makes it worth
writing: `cost.priced` is `null` without the two model entries (defect 7); it is
`297_550_926.45` without the divisor (defect 6); and it renders `$0.0000` if the divisor lands
while `renderMarkdown` keeps its compensator (call-site row 9). Placed in
`engine/test/usage-aggregate.test.js` alongside the existing exact-arithmetic cases, using the
**real** `DEFAULT_PRICES` rather than the file's synthetic `PRICE_TABLE` — this is the one test
whose point is that the shipped rates are right. Build the two events through the file's
existing `makeEvent` helper: `accumulateGroup` adds `event.messages` and `event.durationMs`
unguarded, so a hand-rolled event literal that omits them poisons the group with `NaN` and the
failure reads as a pricing bug.

A companion unit case pins the hazard the call-site table names, since the golden vector alone
does not distinguish it:

> *Given a group whose `cacheEfficiency` clears the hotspot threshold, when `aggregate` runs,
> then `recommendations[*].evidence.pricedCreationCost` is in the same unit as
> `cost.priced` and `evidence.shareOfRunCost` lies in `[0, 1]`.*

That is the assertion that fails if `computePricedCreation` is divided at the composed site
(row 2) or left undivided at the emitting site (row 3).

Two precision notes the planner must not discover at the keyboard. **Assert the expression, not
a decimal literal** — `297.55092645` typed by hand is not necessarily the double that
`297_550_926.45 / 1e6` evaluates to. And **sum the two groups' `cost.priced` in the test the
same way the report does** (per group, then add); dividing a summed Σ and summing two divided Σs
are not bit-identical in IEEE-754, so an `assert.equal` written against the wrong association
will fail for a reason that has nothing to do with the fix. If either bites, assert against a
relative epsilon and say so in the test name — never widen it silently.

**Existing tests that must change, and why each is a rewrite rather than a renumber.** These
encode the defect and will otherwise mask the fix:

| Test | Currently asserts | After |
|---|---|---|
| `usage-aggregate.test.js` §1 "…`cost.priced` = Σ class×rate" | `622.5` | `622.5 / 1e6`; the title's "Σ class×rate" is now "Σ class×rate ÷ 1 MTok" |
| §3 "cacheCreationTtl split" | `2250` | `2250 / 1e6` |
| §17 "…reflects the accumulated TTL split" | `2325` | `2325 / 1e6` |
| §22 "costPerCycle carries exact priced cost" | `500` | `500 / 1e6` |
| §36 "…cost string … divided by 1e6" | `$0.0006` **and a title + comment asserting the compensator is correct** | passes numerically either way once both edits land — so it must be **rewritten**, not left: as written it documents the bug as intended behaviour |
| §51 "…exact priced cost difference" | `622.5 - 30` | `(622.5 - 30) / 1e6` |

§36 is the trap. `622.5 → 0.0006225 → "$0.0006"` before the fix (divide at render) and after it
(divide at compute), so the assertion survives while its title and comments become false. It
catches the *double*-division and nothing else. Rewrite its title and comment to state the
invariant that actually holds — `renderMarkdown` formats `cost.priced` as dollars with no
scaling — and add the `$0.0000` regression it should have been guarding.

`engine/test/tune-plan*.test.js` and `tune-plan.bin.test.js` build reports by hand with literal
`cost: { priced: 100 }` and never reach `computePricedCost`; they stay green untouched.
`engine/test/tune-smoke.test.js` goes through `aggregate` but asserts a *relative* outcome (the
flagged phase's priced cost drops to the projected figure), so it is scale-invariant — assert
that it is, rather than assuming it.

### The 100x regression test (Requirement 17)

The test that would have caught this, stated so it fails on the pre-fix parser:

> *Given a session fixture whose main-loop file carries a spawn rollup with
> `usage` summing to 1,000 tokens, and whose `<sid>/subagents/agent-<id>.jsonl` carries
> assistant turns summing to 100,000 tokens, when the miner runs, then the report's total
> relative cost for that run is 100,000 — not 1,000, and not 101,000.*

The three-way assertion is the whole point: `1,000` is today's under-report, `101,000` is
the double-count the brief warns about, `100,000` is truth. Placed in
`engine/test/usage-mine-main.test.js` (front-door, injected `io`, existing `makeCaptureIo`
helper), so it exercises discovery, containment, streaming, parsing, and aggregation
together — the seam where the defect actually lives.

### Per-surface

- **`engine/test/telemetry-claude.test.js`** (extend) — the emission rule: an `assistant`
  line with `message.usage` yields exactly one event; a `user` line carrying a rollup yields
  **zero** events (the structural disjointness, pinned 0/273-files); the injected `context`
  supplies `role`/`phase`; absent/malformed context ⇒ `role: null` **and** a counted
  fallback, never a silent one; `model` comes from `message.model` per turn with the `[1m]`
  suffix stripped; `run` comes from the line's `sessionId` (parent id); `slug` is `null`;
  `--since` still filters on the top-level `timestamp`, and the derived `durationMs` span
  covers only surviving lines; **auto-skip markers are harvested from a `sourceKind: 'main'`
  stream and NOT from a `sourceKind: 'subagent'` stream carrying the identical text** (the
  false-marker guard).
- **`engine/test/telemetry-claude-discovery.test.js`** (new) — `discover` against fake
  `listDir`/`readText` ports, zero filesystem: the two-level shape is found; a non-session
  directory (`memory/`) yields nothing; a session with no `subagents/` yields main-loop
  entries only; `agent-*.meta.json` is never returned as a transcript entry; a `.jsonl`
  directly under a session dir (not under `subagents/`) is not accepted; depth-2 flat
  siblings are returned like any other; a `listDir` returning `[]` and a `readText`
  returning `null` both degrade to the counted-fallback path rather than throwing; output
  ordering is deterministic.
- **`engine/test/usage-mine-main.test.js`** (extend) — the regression test above, plus:
  each advisory row of the failure-semantics table asserts exit 0 and the expected note;
  containment is refused for a `subagents/` symlink escaping the READ root (mktemp tree,
  the existing containment-test pattern) and the refusal is counted; a source with no
  `SOURCE_DISCOVERY` entry (opencode fixture dir) behaves exactly as before — the
  no-regression guard for the other five bindings; zero-arg read-root resolution under
  ADR-336 via the exported `resolveDefaultReadRoot` seam; **`--no-inline` drops the
  `role: 'main-loop'` group and nothing else — the same fixture still yields its `auto-skip:`
  phase markers** (the ADR-329 trap named in defect 4).
- **`engine/test/usage-mine.bin.test.js`** (extend) — one subprocess smoke over the new
  fixture tree in a mktemp throwaway: exit 0, `report.json` + `report.md` written, sub-agent
  groups present with non-null roles, and `report.md`'s cost string is a plausible dollar
  figure rather than `$0.0000` (the end-to-end guard on call-site row 9).
- **`engine/test/usage-aggregate.test.js`** (extend + amend) — the dollar reconciliation test
  and its `shareOfRunCost` companion above; the six existing assertions rescaled per the table
  above; plus: a `role: 'main-loop'`, `phase: null` group aggregates and prices like any
  other, and `groupByRun` propagates the main-loop `slug` onto slug-less sub-agent events
  sharing a `run`.
- **`engine/src/observability/adapters/claude/pricing.js`** — the two new entries are data, but
  the module header's *"no 1e6 scaling is applied"* is now false and must change with them.
  There is no dedicated `pricing.test.js`; `mergePrices`/`loadPriceTable` are exercised through
  `usage-mine-main.test.js` §7 (`--prices` override). Add a case asserting a per-MTok override
  entry prices in dollars — i.e. that the unit contract for overrides is unchanged by the fix,
  which is the property that breaks if the divisor is pushed into `priceEntry`.
- **`engine/test/metrics-split.test.js`** — must stay green untouched; `tokensFromClaudeUsage`
  keeps its signature and semantics (it is the shared dependency).
- **`engine/test/telemetry-claims.test.js`** — its last case pins the live README figures
  (`runCount: 27`, `medianHours: 1.2942`, …) against `compareClaims`; the rest are pure unit
  tests over synthetic reports and are unaffected. That one case, the README FAQ numbers, and
  the regenerated baseline must move in the same commit or the `readme-drift` CI job fails.
  Whether the run-hours figure *should* move at all depends on DC-12.
- **Property lens** (parser/matcher pair touched): over generated line streams mixing
  `user`-rollup lines, `assistant`-usage lines, blank lines, and malformed JSON in arbitrary
  order — total emitted tokens equal the sum over `assistant` lines alone, invariant under
  permutation and under interleaving; `skipped` equals the malformed count exactly.
- **Gate:** `bash scripts/ci.sh` green; `npm --prefix engine run mutation` at threshold over
  `engine/src/observability/**`; `bash scripts/design-lint.sh` on this doc; `intention-lint`
  satisfied by the refreshed `docs/contributing/specs/telemetry.md`.

## Out of scope

This is the **ratified** boundary, not the brief's. ADR-338 pulled the whole priced-cost path
*in*; ADR-330 pulled `skills/run/SKILL.md` *in*. Both were out of scope when this doc was first
written; neither is now.

**In scope, stated here because the brief said otherwise and the conflation is easy:**

- **`DEFAULT_PRICES` gains `claude-opus-5` and `claude-sonnet-5`** (ADR-338). The brief's
  "pricing table updates are out of scope" line is superseded.
- **The missing `1e6` divisor in `computePricedCost`** (ADR-338), together with the
  compensating `/1e6` in `renderMarkdown` and the direct `pricedCreationCost` emission — all
  nine call sites in the table above move as one unit or the report becomes internally
  inconsistent. It rewrites every historical `priced` value; that is accepted, and it is why
  ADR-332 orders the baseline regeneration after it.
- **`skills/run/SKILL.md`** (ADR-330) — the metrics-ledger row's data source, and the
  "exact, zero extra cost" rationale that no longer holds.
- **`.claude/craft-metrics.md`** (ADR-331) — one appended boundary marker. Not an edit of any
  existing row.

**Genuinely out of scope:**

- **New report formats or fields** — `report.json` / `report.md` schemas are unchanged. No new
  `UsageEvent` field, which is also what keeps the redaction whitelist intact. `cost.priced`
  changes its *magnitude*, never its name, type, or nullability contract.
- **`costPerCycle`'s priced/relative unit mixing.** `buildReviewCycles` falls back to
  `computeRelativeCost(e.tokens)` — a raw token count — when a model is unpriced, so one array
  can hold dollars and token counts. `docs/contributing/specs/telemetry.md` documents exactly
  this behaviour, and no ADR authorizes changing a documented field. The correction makes the
  mismatch starker (dollars are now ~10⁶ smaller than the fallback rather than comparable in
  magnitude), but ADR-338 both models being added means the fallback stops firing for craft's
  own corpus. **Named as a follow-up**, not silently absorbed: the honest fix is a discriminated
  value, not a wider divisor.
- **Any adapter other than `adapters/claude/`** — opencode, pi, copilot, codex, aider, and
  the unwired cursor binding keep today's flat discovery and today's two-argument
  `parseLines` call. The optional third argument is additive.
- **Sub-agent attribution for the other bindings** — every non-claude binding ships
  `role: null` today; none has a pinned sub-agent-transcript equivalent, and pinning one
  needs a live run per tool.
- **Retro-mining sessions whose transcripts have been pruned** — transcript retention is
  upstream-controlled, so historical accuracy is bounded by what is still on disk. This is
  the substantive argument ADR-331 accepted against migrating the ledger.
- **Making telemetry gate anything** — the port stays advisory (exit 0 on every input
  failure). A wrong number is a bad report, never a blocked run. Every branch added by the
  priced-cost work is pure arithmetic over already-parsed data and cannot introduce an exit
  path at all.
- **`docs/guides/comparison.md` and the README *cost comparison table*** — investigated, not
  assumed (see *Reconciling the published figures*): all three arms reproduce to the cent under
  the corrected miner, so **no figure there needs correcting**. The change does not restate them
  from craft's own corpus either, because they describe a different repository's single run.
  **Not** out of scope, and easy to conflate: the README FAQ's *telemetry claims* (run count,
  median/min/max run hours) are recomputed from
  `docs/contributing/metrics-baseline.report.json` and guarded by the `readme-drift` CI job, so
  the ADR-332 regeneration forces them to move in the same commit — and DC-12 decides whether
  the run-hours *sentence* survives that move unchanged.
- **An `--until` flag** — the mirror of `--since` that would make the craft arm's published
  window re-derivable through the front door. Deliberately parked as DC-11(b) rather than
  assumed; DC-11(a) meets ADR-338's assertion requirement without it.
