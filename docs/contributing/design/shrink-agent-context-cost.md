# Design — shrink-agent-context-cost

> Brief: cut craft's own token cost by shrinking the per-turn context every spawned
> agent re-reads. Cost is the sum of context size over turns, context never shrinks
> within an agent, and cost scales as turns^1.4 — so the levers are the spawn floor
> (what every first turn pays), the tool-output re-read (what every later turn
> re-pays), and the turn count itself. Five changes land in one run, ordered
> D→A→C→E→B. These are TOKEN levers, not time levers: per-turn latency is flat in
> context size, and no part of this design is justified by speed.
> Status: draft → self-reviewed ×3 → accepted-pending-ADR

## Context

### What exists today

**The instrument (Part D).** Two observability surfaces coexist and only one is
mechanical.

- `.claude/craft-metrics.md` — the committed, append-only per-phase ledger (ADR-119).
  Its rows are written by the SESSION, by hand, under a prose procedure in
  `skills/run/SKILL.md` §Done ("Metrics artifact (separate, append-only)"). The
  procedure already says to source each row from that phase's own sub-agent transcript
  (ADR-330) rather than from the spawn's returned usage block, and to degrade to
  `cache=na` when the transcript is unavailable. Nothing enforces either rule. Across
  three repos, 155 of 951 agent rows carry the cache columns and 11 of those are false
  zeros — the most recent run recorded `cache_read=0 cache_creation=0` for a 414k-token
  validation triager.
- `engine/src/observability/` — the mechanical miner: a vendor-neutral port
  (`docs/contributing/specs/telemetry.md`), a pure core (`usage-aggregate.js`), six
  bindings, and one composition root (`usage-mine-main.js` behind `engine/bin/usage-mine.js`
  and `scripts/mine-transcripts.sh`). `adapters/claude/metrics-split.js` exports
  `formatCacheSplit(usage)`, which correctly returns `cache=na` when the usage object
  carries neither cache field — and no bin calls it.

The pure core's per-turn accounting is scoped to one phase: `buildReviewCycles`
(`usage-aggregate.js` L198-223) opens with `if (evt.phase !== 'review') continue`, so
the 66.4% of spend that lives in `part-implementer` produces no turn count at all.
`reviewWasteRecs` keys on `billedTurns > REVIEW_WASTE_BILLED_TURNS` (85) per ADR-343,
whose recalibration rule binds any new threshold this change introduces: a threshold is
set from the committed baseline's own distribution and placed inside an empty band
between clusters, never at a percentile.

**The contract assembler (Parts B and C).** `contracts/core.md` is a nine-line numbered
fragment carrying two expansion markers, `@@ARTIFACT_HANDOFF@@` and
`@@MODEL_RESOLUTION@@`. `engine/src/contract.js` resolves both from `opts.execution`
alone (`AGENT_VARIANTS` vs `INLINE_VARIANTS`) and `assembleContract(descriptor, manifest,
fragments, opts)` joins core + bundles + the derived retrieval note + manifest context.
`contracts/harness-exec.md` line 4 already carries a digest-at-boundary rule, binding
exactly one contract bundle. `engine/src/contracts-lint-main.js` refuses any bundle file
containing the string "retrieval" (case-insensitive), because the engine derives that
note rather than storing it.

**The agent definitions (Part A).** All nine `agents/*.md` carry exactly `name`,
`description`, `model` — no `tools:` key — so every craft agent inherits the full tool
surface of whatever harness spawns it, every MCP server included.
`scripts/sync-adapter-agents.sh` mirrors these files into seven adapters and replaces
the BODY only; its header states it never generates frontmatter.
`contracts/harness-read.md` line 1 asserts "Read-only: never edit, never commit." in
prose, with nothing mechanical behind it.

**The planner (Part E).** `templates/plan.md` §Sizing rules and `agents/planner.md`
both state a FLOOR ("a part must earn its agent lifecycle", plus ADR-044's test-infra
and docs-only carve-out) and no ceiling. `engine/src/plan-lint-main.js` already resolves
each part's declared files from its `### Context` backticked spans
(`declaredFiles`, L175) and already reports cross-part overlap — advisory only, per
ADR-306, which ruled overlap "a cost and a risk to be seen, not a defect to be blocked".

### Constraints inherited, not chosen

| Source | Constraint |
|---|---|
| ADR-065 | No phase agent reports its own usage; no typed engine telemetry object. Part D's emitter is orchestrator-invoked and transcript-sourced, so it stays inside this rule. |
| ADR-119 / ADR-330 | Metrics live in the separate append-only artifact; each row is sourced from that phase's sub-agent transcript. |
| ADR-331 | A metrics-format change is ANNOTATED, never migrated: a boundary marker line is appended and rows above it are never compared to rows below. |
| ADR-343 | A recommendation threshold comes from the committed baseline's distribution, inside an empty band between clusters. |
| ADR-015 / ADR-017 | An invariant that must survive an agent swap belongs in `core` or a bundle; a method particular to one role belongs in the agent file. |
| ADR-006 | `contract:` is a closed vocabulary; a bare string is sugar for a one-element list. Part A's `tools:` knob follows the same sugar rule. |
| ADR-306 | Cross-part overlap warns; it does not block. Part E's ceiling has to justify a different posture on the same surface. |
| `contract-equivalence.test.js` L59-67, L108-119 | Exactly two lines may differ between agent-mode and inline-mode assembly, for every descriptor. Any new core line must resolve IDENTICALLY in both modes. |
| `architecture-boundaries.test.js` R3 | Only the file named by `COMPOSITION_ROOT_FILE` may import an adapter module; a look-alike `-main.js` is still flagged. |
| `contracts-lint-main.js` | No bundle file may contain the string "retrieval". |

### The baseline this run establishes

This run executes ENTIRELY under pre-change agent and contract definitions. The live
plugin root is the main checkout; the work lands in a separate worktree
(`craft-shrink-agent-context-cost`). Every agent spawned
during this run therefore reads the nine tool-less agent definitions and the nine-line
core contract. Its `.claude/craft-metrics.md` rows are a clean BEFORE measurement, and
the first run that reads the changed definitions is the AFTER. No part of this change
may claim a post-change number; the numbers arrive on the next run, through the
instrument Part D builds.

## Requirements

1. `engine/bin/metrics-emit.js` emits one metrics ledger row per agent-spawned phase,
   computed from that phase's sub-agent transcript(s), with no hand-assembly step.
2. The row carries `turns`, `tool_calls`, `tokens`, `duration_ms`, `cache_read`,
   `cache_creation`, `output`, `avg_ctx`, `equiv`, prefixed by run-id and phase-id.
3. A field whose inputs are unavailable is emitted as `na`, never as `0`. When the
   cache split is unavailable the row carries `cache=na` and, with it, `tokens=na`,
   `avg_ctx=na` and `equiv=na` — all three derive from the missing inputs. An
   agent-spawned phase whose transcript cannot be found emits `transcript=na` rather
   than nothing.
4. Billed turns are counted by distinct `message.id`, not by transcript line. A
   line-counting implementation over-reads `cache_read` by roughly 2x (pinned below).
5. Part D appends an ADR-331 boundary marker line to `.claude/craft-metrics.md` stating
   the date and the format change; rows above it are never compared to rows below.
6. `aggregate` reports per-phase turn counts for EVERY phase, not review only, without
   changing the serialized shape of the existing `reviewCycles` array.
7. A `turn-budget` recommendation kind is emitted when a phase's per-spawn billed turns
   exceed the miner's threshold; `tune-plan` surfaces it (advisory after D, auto-patched
   after B).
8. Every `agents/*.md` declares a `tools:` list. The reviewer's list contains no
   declared mutating tool.
9. No agent's list declares an MCP tool (`mcp__*`) or a sub-agent-spawning tool. These
   two exclusions are the spawn-floor lever; the rest of each list is role fit.
10. `manifest-lint` accepts `phases.<id>.tools` and `phases.<id>.turn_budget` and rejects
    malformed values for both.
11. `contracts/core.md` carries an output-digest line covering both command output and
    file reads, and a turn-budget protocol line.
12. `contract-equivalence.test.js` still asserts exactly two differing lines for every
    descriptor, and `CORE_MARKERS` grows to cover both new core lines.
13. `plan-lint` FAILS (non-zero exit) a part whose `### Context` declares more than the
    file ceiling; the existing overlap warning keeps its advisory posture unchanged.
14. `templates/plan.md` and `agents/planner.md` state the ceiling alongside the existing
    floor.
15. `pipeline/default.yml` descriptors carry a `turn_budget` field that survives
    `normalizeEntry` and reaches `assembleContract`.
16. `scripts/ci.sh` is green, including `contracts-lint`, `design-lint`,
    `sync-adapter-agents.sh --check`, and `test/architecture-boundaries.test.js`.

## Design

### Order and what each part owes the previous one

```
  D  instrument            A  spawn floor         C  per-turn re-read
  ─────────────────        ────────────────       ──────────────────
  metrics-emit bin         tools: on 9 agents     core output-digest line
  per-phase turn counts    phases.<id>.tools      harness-exec L4 narrowed
  turn-budget rec kind            │                       │
        │                         │                       │
        │  measures ──────────────┴───────────────────────┤
        │                                                 │
        ├──────────────────────────► E  turn count        │
        │                            ──────────────       │
        │                            plan-lint file ceiling
        │                            planner prose ceiling
        │                                    │
        └──────────────────────────► B  safety net ◄──────┘
                                     ──────────────
                                     turn_budget descriptor field
                                     phases.<id>.turn_budget
                                     @@TURN_BUDGET@@ core line
```

- **D first** because every other part's effect is invisible without it. D touches no
  other part's surface.
- **A** needs nothing from D, but its effect on the 53k spawn floor is only readable
  through D's `avg_ctx`.
- **C** needs nothing from D or A. It is placed third because it is the smallest
  contract change and it proves the core-fragment edit path before B makes a harder one.
- **E** is the primary turn-count fix and needs nothing from D, A or C. It is placed
  before B so that B ships as a net, not as the mechanism.
- **B last**, and it has one hard dependency on D: D's `turn-budget` recommendation
  lands as an ADVISORY in `tune-plan`, because `craft:tune` only auto-patches knobs that
  exist in `PHASE_FIELDS`. B introduces `phases.<id>.turn_budget`; B therefore also adds
  the auto-patch arm to `tune-plan.js`. D's advisory arm is not a temporary stand-in —
  it is the correct treatment of a signal with no knob behind it, and it stays as the
  fallback for a report whose phase has no budget declared.

---

### Part D — the instrument

#### Pinned transcript matrix

Pinned empirically, read-only, against real sub-agent transcripts under
`~/.claude/projects/*/<session>/subagents/`. Nothing here is designed from memory of the
transcript format.

| Property | Pinned value |
|---|---|
| Line `.type` values | `assistant`, `user`, `attachment` |
| Usage location | `.message.usage` on assistant lines |
| Usage keys | `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `cache_creation`, `service_tier`, `server_tool_use` |
| `cache_creation` | an OBJECT (`{ephemeral_1h_input_tokens, ephemeral_5m_input_tokens}`), distinct from the scalar `cache_creation_input_tokens` |
| Content block types | `text`, `thinking`, `tool_use`, `tool_result` |
| Sidecar (`agent-*.meta.json`) | `{agentType, description, toolUseId, spawnDepth, model}` |

Two reference transcripts, both read with the fold rule and with a naive per-line sum:

| Transcript | agentType | assistant lines | distinct `message.id` | `tool_use` blocks (raw = unique ids) | `cache_read` folded | `cache_read` naive |
|---|---|---|---|---|---|---|
| reference A | `craft:reviewer` | 68 | 28 | 40 | 2,661,903 | 6,089,935 (2.29x) |
| reference B | `craft:part-implementer` | 79 | 37 | 48 | 4,394,443 | 8,780,300 (2.00x) |

The mechanism behind the 2x, pinned on the four lines sharing
`msg_011CeLKAJDRGYBCWjYZ1pJci`:

```
{"i":2,"cr":40479,"cc":14765,"o":5,  "blocks":["thinking"]}
{"i":2,"cr":40479,"cc":14765,"o":5,  "blocks":["text"]}
{"i":2,"cr":40479,"cc":14765,"o":5,  "blocks":["tool_use"]}
{"i":2,"cr":40479,"cc":14765,"o":576,"blocks":["tool_use"]}
```

Two asymmetric folding rules fall out of this, and the design states both because they
are opposite:

- **Usage folds by `message.id`, last-wins.** The input and cache figures repeat
  verbatim on every line of one message; `output_tokens` is a running count whose LAST
  value is the true one. `foldEventByMessageId` in `adapters/claude/telemetry.js`
  already implements exactly this.
- **`tool_use` blocks do NOT fold.** The blocks are PARTITIONED across the lines of one
  message, never duplicated — 40 raw blocks, 40 unique ids. Counting tool calls per
  message id would lose most of them.

A hand-assembling session reading lines rather than messages therefore reports roughly
double the cache figures and cannot report turns at all. That is the defect, and it is
not fixable by rewording the procedure.

#### Per-role distribution on this box (n=778 craft sub-agent transcripts)

Measured the same way, to ground the archetype budgets the brief's table does not cover.
It corroborates the brief's independent corpus (part-implementer median 96 turns, p90
270 against the brief's 273) rather than replacing it.

| agentType | n | turns med / p90 / max | tool_calls med / p90 / max |
|---|---|---|---|
| `craft:reviewer` | 282 | 25 / 52 / 140 | 35 / 60 / 154 |
| `craft:part-implementer` | 330 | 96 / 270 / 1285 | 108 / 291 / 1294 |
| `craft:harness-triager` | 41 | 121 / 310 / 723 | 126 / 313 / 726 |
| `craft:designer` | 59 | 57 / 122 / 151 | 82 / 131 / 171 |
| `craft:planner` | 32 | 60 / 87 / 287 | 70 / 100 / 341 |
| `craft:docs-writer` | 21 | 44 / 130 / 196 | 56 / 151 / 199 |
| `craft:refactor-executor` | 12 | 42 / 123 / 131 | 51 / 129 / 132 |
| `craft:backlog-ticker` | 1 | 8 | 7 |

`tool_calls ≈ 1.1 × turns` across every role. This matters for Part B: a turn is an
API-side notion an agent cannot observe, while a tool call is one it can count. The
budget is therefore expressed in TOOL CALLS, and the brief's turn-derived numbers
convert at that ratio.

#### The row

Fields are `key=value`, so order is cosmetic; the order below follows the brief.

```
<run-id> <phase-id> turns=<n> tool_calls=<n> tokens=<n> duration_ms=<n> cache_read=<n> cache_creation=<n> output=<n> avg_ctx=<n> equiv=<n>
```

Degraded forms, one per genuinely-missing input:

```
<run-id> <phase-id> turns=<n> tool_calls=<n> tokens=na duration_ms=<n> cache=na output=<n> avg_ctx=na equiv=na
<run-id> <phase-id> transcript=na
```

Arithmetic, worked on the pinned reviewer transcript (28 turns; input 56, cache_read
2,661,903, cache_creation 115,993, output 30,596):

| Field | Definition | Value |
|---|---|---|
| `turns` | distinct `message.id` with usage, summed over the phase's spawns | 28 |
| `tool_calls` | `tool_use` blocks across all lines | 40 |
| `tokens` | `input + cache_read + cache_creation + output` (the report's `cost.relative`) | 2,808,548 |
| `duration_ms` | last timestamp − first timestamp, per transcript, summed | 469,000 |
| `cache_read` / `cache_creation` | via `formatCacheSplit`, which yields `cache=na` when neither field is present | 2,661,903 / 115,993 |
| `output` | `output_tokens`, last-wins per message id | 30,596 |
| `avg_ctx` | `(input + cache_read + cache_creation) / turns` | 99,213 |
| `equiv` | `input + 0.1·cache_read + 1.25·cache_creation + 5·output`, rounded | 564,218 |

`tokens` changes meaning: the historical column came from the spawn's returned
`subagent_tokens`, which is not reproducible from a transcript. Per ADR-331 the rows are
annotated, not migrated — Part D appends one boundary marker line and the rows above it
are never compared to the rows below.

`duration_ms` also changes meaning for a fan-out phase. It is AGENT time summed across
the phase's spawns, not wall clock: `review` running four reviewers in parallel for ten
minutes records forty agent-minutes. The historical column happened to coincide because
each row came from a single spawn. The ledger's header comment states the unit so no
reader has to infer it.

#### The bin's surface

```
metrics-emit --run <run-id> [--phase <phase-id>] [--session <id>] [--dir <transcript-dir>]
             [--since <iso8601>] [--ledger <path>]
```

`--run` is the only required flag — it is the row's first field and the orchestrator
holds it. **`--phase` is optional and that is deliberate:** the bin parses the session's
transcripts once and groups the resulting events by `evt.phase`, so with `--phase` it
emits one row and without it a row per phase found, from the same single parse. §Done
calls it once, with no `--phase`; a phase-boundary call passes one. Neither path costs
more than the other, and a run that dies before §Done can still have per-phase rows.

The grouping needs no new export: `parseLines` already stamps `phase` and `role` on
every event from the sidecar's `agentType`, so the bin filters on a field it is handed
rather than re-deriving the mapping.

`--dir` defaults the way the miner's does, through `dashedCwd(cwd)` and
`resolveDefaultTranscriptDir`, so the common call passes neither it nor `--session`.
`--since` narrows the transcript window (see DC11). `--ledger` defaults to
`.claude/craft-metrics.md` resolved at the ROOT OF THE TREE THE RUN IS WORKING IN — the
worktree, not the pre-worktree checkout — matching how `skills/run/SKILL.md` §0 step 4
roots the run-record ledger. Unlike that ledger, this one is committed (the ADR-118
re-include), so it travels with the branch and lands through the PR.

The bin APPENDS and also prints what it appended, so the session can surface the rows
without a second read. A `--ledger` path that escapes the repo root is refused through
`containByRealpath`, the same containment `usage-mine-main` applies to its report
writes. Exit is 0 on every advisory degradation, per the telemetry spec's failure
semantics; a non-zero exit is reserved for a config error — a missing `--run`, an
unparseable `--since`, an uncontained `--dir` or `--ledger`.

The ADR-331 boundary marker (R5) is written ONCE, by hand, in the implementing part's
commit. It is a statement about a format change on a particular date, not something a
bin can decide to emit.

#### Modules

| File | Change |
|---|---|
| `engine/src/observability/metrics-line.js` | NEW, PURE. Turns a per-phase event slice into the row string. No I/O, no clock. Home of the `equiv` weights and the `na` rule. |
| `engine/src/observability/metrics-emit-main.js` | NEW composition root. Resolves the session transcript dir (reusing `dashedCwd` / `resolveDefaultTranscriptDir` from `usage-mine-main.js`), discovers via `adapters/claude/discovery.js` `discover({listDir, readText})`, parses via `parseLines(lines, since, context)`, formats via `metrics-line.js`, appends to the ledger. |
| `engine/bin/metrics-emit.js` | NEW 5-line async shim, the `usage-mine.js` variant (`process.exit(await main(...))`). |
| `scripts/emit-metrics.sh` | NEW thin wrapper forwarding `"$@"`, mirroring `scripts/mine-transcripts.sh`. |
| `engine/src/observability/adapters/claude/telemetry.js` | `parseLines` counts `tool_use` blocks per message and stamps `toolCalls` on each event (subject to DC8). |
| `engine/src/observability/adapters/claude/metrics-split.js` | Gains its first caller. Unchanged. |
| `engine/src/observability/usage-aggregate.js` | `buildReviewCycles` generalises to `buildPhaseTurns`. |
| `engine/src/tune-plan.js` | `recAdvisories` gains the `turn-budget` kind. |
| `skills/run/SKILL.md` §Done | The prose procedure is replaced or wrapped (DC3). |
| `docs/contributing/specs/telemetry.md` | The `UsageEvent` post-condition field list is a positive redaction whitelist — `toolCalls` and the `phaseTurns` array are added there, plus a "Metrics ledger row" section for the emitter. |
| `docs/contributing/specs/run-record.md` | Its `subjects` glob is `skills/run/SKILL.md`, which Part D edits; its Ledger-vs-store table gains a cross-link to the metrics row section so the two ledgers stay distinguishable. |
| `test/architecture-boundaries.test.js` | `COMPOSITION_ROOT_FILE` (a single string) becomes a SET of two. R3 excuses by exact file identity, so a second bin is a second declared root — the alternative, importing `usage-mine-main.js` from `metrics-emit-main.js`, makes one bin depend on another bin's composition and is plainly worse. |

#### Per-phase turn counting without a schema break

`buildReviewCycles(events, priceTable)` becomes `buildPhaseTurns(events, priceTable)`,
grouping by `(phase, role)` instead of `role`, over ALL events rather than
`evt.phase === 'review'`. Entry shape, keys deep-sorted per the spec:
`billedTurns`, `cycles`, `maxCost`, `meanCost`, `phase`, `role`, `toolCalls`,
`totalCost`. `cycles` keeps its existing meaning (distinct `spawnId` count).

`reviewCycles` is then the `phase === 'review'` projection of `phaseTurns` with `phase`
and `toolCalls` dropped — byte-identical to today's output, so
`docs/contributing/metrics-baseline.report.json` does not need refreshing and ADR-343's
`review-waste` selector is untouched. One builder, two views.

The new `turn-budget` recommendation mirrors the existing rec shape and carries `role`
the way `model-routing` does:

```json
{
  "detail": "role part-implementer billed 291 turns in phase implementation",
  "evidence": { "billedTurns": 291, "cycles": 3, "phase": "implementation",
                "role": "part-implementer", "threshold": 0, "toolCalls": 312 },
  "kind": "turn-budget", "model": null, "phase": "implementation", "run": "session-abc123"
}
```

`TURN_BUDGET_BILLED_TURNS` is a new exported constant next to
`REVIEW_WASTE_BILLED_TURNS`. Its VALUE is deliberately not fixed here: ADR-343 requires
it be read off the committed baseline's own distribution and placed inside an empty band
between clusters. The implementing part derives it against
`docs/contributing/metrics-baseline.report.json` and records the band it found. The
measured p90s above (270 for `part-implementer`, 310 for `harness-triager`) are the
candidate region, not the answer.

`renderMarkdown` gains a matching `## Turns by phase` section, one line per
`phaseTurns` entry. A signal that exists only in `report.json` is a signal no human
reads, and `report.md` is the surface `craft:metrics` puts in front of one.

The committed baseline at `docs/contributing/metrics-baseline.report.json` does not have
to move for this. `baselineDeltas` matches groups by `run + phase + role + model` and
`computeDrift` works on phase means, so neither notices a new sibling key on `runs[*]`;
`reviewCycles` is byte-identical by construction; `readme-drift` reads named literals,
not the whole shape. The baseline gains `phaseTurns` at its next on-demand refresh, as a
closing chore, exactly as the telemetry spec already describes.

The miner's threshold and Part B's per-archetype budgets stay SEPARATE numbers with
separate jobs: the budget governs an agent's behaviour mid-run; the threshold governs a
recommendation made after the fact over a corpus. `usage-aggregate` is pure and has no
descriptor access, so it could not read the budget even if they were meant to agree.

---

### Part A — tool allowlists

#### Pinned frontmatter matrix

Pinned by reading real agent definitions on this box that already declare the key.

| Property | Pinned value |
|---|---|
| Key | `tools:` in the YAML frontmatter fence |
| Flow form | `tools: ["Read", "Grep", "Glob", "Bash"]` |
| Block form | `tools:` followed by `- Read` items |
| MCP addressing | full tool name, e.g. `mcp__context7__resolve-library-id` |
| Spawn-time override | none — the Agent/Task spawn API takes `subagent_type`, `prompt`, `description`, `model`, `isolation`. There is no `tools` parameter. |

That last row is the load-bearing one: a manifest-declared widening cannot be applied at
spawn time on this binding. Whatever `phases.<id>.tools` means, it cannot mean "craft
passes a wider list to the Task call". DC2 carries the three honest readings.

#### The lists

Derived from the measured mix (part-implementer 64.6% Bash / 16.9% Read / 15.3% Edit;
reviewer 93.6 / 3.8 / 0.1; harness-triager 71.0 / 13.1 / 14.4) and from each role's
declared output.

| agent | tools |
|---|---|
| `backlog-ticker` | Read, Edit, Bash |
| `designer` | Read, Grep, Glob, Bash, Write, Edit |
| `docs-writer` | Read, Grep, Glob, Bash, Write, Edit |
| `harness-triager` | Read, Grep, Glob, Bash, Write, Edit |
| `part-implementer` | Read, Grep, Glob, Bash, Write, Edit |
| `planner` | Read, Grep, Glob, Bash, Write |
| `refactor-executor` | Read, Grep, Glob, Bash, Edit |
| `requirements-writer` | Read, Grep, Glob, Bash, Write |
| `reviewer` | Read, Grep, Glob, Bash |

Three deliberate exclusions, each stated rather than implied:

- **No MCP tool on any list.** The MCP schemas are the bulk of the 35k system-and-schema
  half of the 53k floor. A repo that needs one widens through DC2's chosen path.
- **No Task/Agent on any list.** A craft agent that spawns its own sub-agents multiplies
  the floor it is meant to shrink, and nothing in any role's contract asks it to.
- **Grep and Glob are KEPT even though Bash could do both.** Bash output amplifies 68x
  and Read 119x; the Grep tool's bounded output modes are the cheap path, and pushing
  the work into Bash would move cost rather than remove it.

**The reviewer's honest limit.** Removing Edit and Write satisfies "no declared mutating
tool", which is what `contracts/harness-read.md` line 1 can now be held to mechanically.
Bash stays, because 93.6% of the reviewer's calls are Bash and removing it removes the
role. Bash remains a mutation channel that only the contract line forbids. This design
does not claim the reviewer is sandboxed; it claims the reviewer no longer holds a
declared edit tool it used 0.1% of the time.

**Adapter interaction, assessed not assumed.** `scripts/sync-adapter-agents.sh` replaces
mirror BODIES and never generates frontmatter (its header, line 6). Adding `tools:` to
the shared frontmatter therefore changes no mirror and cannot break
`sync-adapter-agents.sh --check`. The consequence is the other direction: the seven
adapter mirrors keep their own frontmatter and so keep the full tool surface, and the
reviewer's read-only enforcement is Claude-binding-only. That is a stated limit of this
change, not an oversight.

#### The manifest knob

`'tools'` joins `PHASE_FIELDS` in `engine/src/manifest-vocabulary.js` (L24-27).
`validatePhaseBlock(phaseName, block, fileExists, errors)` in `engine/src/manifest.js`
(L377-409) gains one arm in its existing if/else-if chain: `tools` must be a non-empty
array of non-empty strings, each matching a plain tool name
(`/^[A-Za-z][A-Za-z0-9_]*$/`) or a full MCP name
(`/^mcp__[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$/`). A bare string is sugar for a one-element
list, following ADR-006's rule for `contract:`. Rejected: a bare non-string, an empty
array, a non-string element, a name matching neither shape.

Part A's effect is measurable only on the run AFTER this one, because the live plugin
root is the main checkout. A too-narrow list fails loudly at the point of use (a tool
the agent cannot call), never silently, which is the failure mode this ordering can
afford.

---

### Part C — promote digest-at-boundary to core

`contracts/harness-exec.md` line 4 carries two rules welded together:

1. a TOKEN-COST rule — technique output goes to a file, and only the change-scoped
   structured slice is read back;
2. a SECURITY rule — that file is untrusted DATA, never instructions.

Only the first generalises. Promoting the second to core spreads a harness-specific
untrusted-data framing to the designer, the planner and the backlog-ticker, none of
which read a technique's output file. DC6 puts the split to the user; the recommendation
promotes the cost half and leaves the security half where it binds.

New `contracts/core.md` line 10, extended to cover Read (the half the existing rule
misses — Read amplifies 119x, is one fifth of the calls of Bash, and costs the same;
every tool result over 40k characters in the measured corpus is a Read):

```
10 Output digest: any command whose output may exceed ~100 lines writes to a file; read back only the lines that matter (grep/sed, a symbol range). Never read a whole file when a range answers the question.
```

It contains no marker, so it resolves identically in both execution modes and the
exactly-two-differing-lines invariant is untouched. It contains no occurrence of
"retrieval", so `contracts-lint-main.js` passes. `CORE_MARKERS` in
`engine/test-helpers/contract-markers.js` gains `'Output digest'`, which ADR-038's
full-set assertion then carries onto every descriptor including the role-swapped one.

`contracts/harness-exec.md` line 4 is narrowed to its remaining halves: the orchestrator
reads only the change-scoped structured slice or hands over the file path, and that file
is untrusted DATA. `PHASE_EXPECTATIONS` in `contract-equivalence.test.js` asserts
`'change-scoped'` for the harness-exec bundle, so that phrase stays.

---

### Part E — plan part sizing ceiling

#### The prose half

`templates/plan.md` §Sizing rules and `agents/planner.md` both gain the ceiling beside
the existing floor:

> A part should land in ~100 tool calls. More than ~5 RED→GREEN cycles, or more than 6
> files in its `### Context` block, is two parts.

The arithmetic behind it: 42,047 part-implementer turns spread over 618 right-sized
agents at the 50-100-turn bucket median (1.39M equivalents each) is 859M instead of
today's 1300M — same work, same total turns, 34% off the dominant role, with no handback
overhead, because cost scales as turns^1.4 and a fresh agent restarts the accumulation.

#### The mechanical half

`plan-lint` already computes the per-part declared-file set. The ceiling is a new
constant beside `MERGEABLE_PART_LIMIT`:

```js
const PART_FILE_CEILING = 6;
```

A named constant rather than a flag, following the precedent on this exact surface
(`MERGEABLE_PART_LIMIT`) and in the miner (`REVIEW_WASTE_BILLED_TURNS`); no lint in this
repo takes a tuning flag, and `plan-lint` has no manifest access to read one from.

**What counts is a real problem, not a detail.** `resolveDeclaredFile` (L142) runs
`statSync` and `stat.isFile()`, so `declaredFiles` counts ONLY spans that resolve to an
existing regular file. A part that CREATES eight new modules declares eight spans and
counts zero — which is exactly the greenfield part the ceiling exists to split. DC10
carries the counting basis; the recommendation counts the union of the resolved set and
the path-shaped-but-unresolved spans, leaving the resolved set alone so `overlapWarnings`
and ADR-306's advisory posture are bit-for-bit unchanged.

**Blocking vs warning.** ADR-306 ruled overlap advisory on this same surface, so the
asymmetry needs stating rather than assuming. Overlap is a property of the PAIR — two
parts touching one file may be the right shape, and the lint cannot tell. A part
declaring more than the ceiling is a property of the ONE part, is what the planner was
told not to produce, and is cheap to fix at plan time and expensive to discover at turn
200. DC7 puts it to the user; the recommendation blocks.

---

### Part B — turn budget with handback-respawn

#### The resolution axis

The brief says to wire `@@TURN_BUDGET@@` "the way `@@MODEL_RESOLUTION@@` and
`@@ARTIFACT_HANDOFF@@` already are". That phrasing is loose and the difference is
load-bearing. Both existing markers are EXECUTION-MODE variants: `applyCarveOuts(line,
inline)` reduces over `AGENT_VARIANTS` or `INLINE_VARIANTS` keyed on `opts.execution`
alone. A turn budget is not a property of the execution mode; it is a property of the
descriptor. If it resolved on the mode axis it would produce a THIRD differing line and
`contract-equivalence.test.js` L108-119 would fail for all twelve descriptors, which
acceptance forbids.

So `@@TURN_BUDGET@@` resolves on a different axis and must resolve IDENTICALLY in both
modes. The mechanical change in `engine/src/contract.js`:

```
applyCarveOuts(line, inline)        →  applyCarveOuts(line, variants)
expandCore(coreText, inline)        →  expandCore(coreText, variants)
assembleContract builds  variants = { ...(inline ? INLINE_VARIANTS : AGENT_VARIANTS),
                                      [MARKER_TURN_BUDGET]: turnBudgetText(budget) }
```

`applyCarveOuts` keeps reducing over a map; it just stops deciding which map. Resolution
precedence, mirroring the Model port's manifest→descriptor→default chain:

```
manifest.phases[descriptor.id].turn_budget
  ?? descriptor.turn_budget
  ?? ARCHETYPE_TURN_BUDGET[key(descriptor)]
  ?? null
```

`contract-equivalence.test.js` calls `assembleContract(descriptor, {}, FRAGMENTS, …)` —
an empty manifest — so the descriptor and the archetype table carry the whole resolution
there, identically on both calls. The invariant holds by construction.

#### The core line

```
11 Turn budget: @@TURN_BUDGET@@
```

Expansions, both mode-independent:

- budgeted: `~<n> tool calls for this phase. On reaching it, commit what is green, write
  a handback (done / remains / next RED), and return — never continue past it. The unit
  of work resumes from the artifact with a fresh context.`
- unbudgeted: `none declared for this phase — run to completion.`

The closing sentence is deliberately mode-NEUTRAL. "The orchestrator respawns you" is
true in agent mode and false inline, and the two-line invariant forbids saying different
things in the two modes. "Resumes from the artifact with a fresh context" is true of
both a respawn and an inline reset, and it is the same claim `@@ARTIFACT_HANDOFF@@`
already makes on line 2. `CORE_MARKERS` gains `'Turn budget'` — the literal prefix lives
outside the marker, so it is present whether or not a budget resolved.

**The budget's unit is tool calls, not turns.** An agent cannot observe an API-side
billed turn; it can count the calls it makes. The measured `tool_calls ≈ 1.1 × turns`
ratio (table above) converts the brief's turn-derived numbers, and the conversion is
inside the rounding those numbers already carry — so the brief's 150 / 150 / 60 / 100
are adopted verbatim as TOOL-CALL budgets rather than multiplied up. The unit is named
in the expanded line so an agent is never left inferring it.

**A budget on a role-less or inline phase binds the session.** `decisions`, `propose`
and `integrate` assemble a contract block with no agent behind it, so the line lands in
the session's own governing block. That is the same posture DC1(a) takes for an agent:
a self-counted limit with the handback written to the artifact. It is not a separate
mechanism and needs no separate wiring.

#### Descriptor threading

`normalizeEntry(raw, index)` in `engine/src/descriptor.js` (L46) builds its `entry`
object field by field and DROPS unknown keys. `turn_budget` must be added there
explicitly or it will never reach `assembleContract`, however carefully
`pipeline/default.yml` declares it. It is optional (not in `REQUIRED_FIELDS`) and
validated as a positive integer when present.

The manifest knob mirrors Part A's: `'turn_budget'` joins `PHASE_FIELDS`, and
`validatePhaseBlock` gains an arm requiring a positive integer.

#### The archetype table and the brief's mismatch

The brief names budgets for `construction 150, harness-exec 150, harness-read 60,
specification 100`. Two of those four are not archetypes: `harness-exec` and
`harness-read` are CONTRACT BUNDLE names, and both of their phases carry
`archetype: harness`. Three archetypes in `VALID_ARCHETYPES` are uncovered entirely:
`setup`, `refinement`, `delivery`.

The distinguishing predicate already exists and needs no new vocabulary:
`isExecutingHarness(descriptor)` in `engine/src/exec-harness.js` is precisely the
harness-exec/harness-read split, and `governance-invariance.test.js` already pins that
it cannot be manufactured from an inferred archetype. DC5 puts the keying and the three
uncovered values to the user; the measured medians and p90s in the Part D table are the
grounding for the candidates.

`setup` is a special case worth naming: `workspace` is the only setup descriptor, it is
role-less, it spawns no agent, and it has no transcript in the 778-row sample. A budget
for it would bind nothing.

---

### Why two rules and not two facts

This change adds two decision procedures to `contracts/core.md`, and the repo's own principle
(`docs/guides/concepts.md`, Frame 5) is that stating one missing fact usually beats encoding a
procedure for finding it. Each rule has to earn the exception.

**Output digest.** The fact would be: every tool result is re-read on every later turn, and a
Read costs roughly 119 times its own size over a part's life. That fact is true and it is not
enough, because of *when* the decision is made. An agent chooses between reading a whole file
and reading a range while it is composing the command — before the output exists and before its
size is known. A cost fact becomes actionable only once the output is known to be large, and by
then it is already in context and is being paid for on every later turn. The rule turns the cost
into a pre-commitment keyed on something the agent can estimate up front ("may exceed ~100
lines"), and it names the substitute — a file read back by `grep`/`sed`, or a symbol range — which
a cost fact does not.

**Turn budget.** The fact would be: cost grows as roughly turns^1.4, and past ~150 tool calls a
part is in the expensive tail. A fact triggers nothing. The budget is the trigger for a
*protocol* — commit what is green, write a handback naming done / remains / next RED, and return
— and the orchestrator respawns fresh from that handback's known shape. A fact gives the agent
no stopping point and gives the orchestrator no handback to respawn from. It is also stated in a
unit the agent cannot use: an agent cannot observe its own billed turns or its own context size,
so the rule is denominated in tool calls, the one quantity it can count.

### Surfaces, one table

| File | Part | Change |
|---|---|---|
| `engine/src/observability/metrics-line.js` | D | NEW pure formatter |
| `engine/src/observability/metrics-emit-main.js` | D | NEW composition root |
| `engine/bin/metrics-emit.js`, `scripts/emit-metrics.sh` | D | NEW shim + wrapper |
| `engine/src/observability/adapters/claude/telemetry.js` | D | `toolCalls` on events |
| `engine/src/observability/usage-aggregate.js` | D | `buildPhaseTurns`, `turn-budget` recs |
| `engine/src/tune-plan.js` | D, B | advisory arm (D), auto-patch arm (B) |
| `skills/run/SKILL.md` | D | §Done metrics procedure |
| `docs/contributing/specs/telemetry.md`, `run-record.md` | D | field whitelist + row spec |
| `test/architecture-boundaries.test.js` | D | second composition root |
| `agents/*.md` (9) | A | `tools:` frontmatter |
| `engine/src/manifest-vocabulary.js` | A, B | `tools`, `turn_budget` in `PHASE_FIELDS` |
| `engine/src/manifest.js` | A, B | two `validatePhaseBlock` arms |
| `contracts/core.md` | C, B | lines 10 and 11 |
| `contracts/harness-exec.md` | C | line 4 narrowed |
| `engine/test-helpers/contract-markers.js` | C, B | two markers |
| `engine/src/plan-lint-main.js` | E | `PART_FILE_CEILING`, blocking check |
| `templates/plan.md`, `agents/planner.md` | E | ceiling prose |
| `engine/src/contract.js` | B | variants map, `@@TURN_BUDGET@@` |
| `engine/src/descriptor.js` | B | `turn_budget` threading, archetype table |
| `pipeline/default.yml` | B | `turn_budget` per descriptor |

## Decision candidates

The designer never decides these; the user does, in the ADR phase.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | Where `turn_budget` is enforced | (a) the agent self-counts its tool calls against the contract line; (b) the orchestrator checkpoints on commit cadence; (c) contract-line-only, with Part D telemetry as the after-the-fact audit | **(a)** | craft cannot count another agent's turns, and the Task API exposes no counter, so (b) can only checkpoint at commits the agent chooses to make — coarse AND still dependent on the agent. (a) is unreliable but it is the only reading where the budget can fire mid-part; (c) is (a) minus the instruction. Part D's `turn-budget` rec makes (a)'s failures visible, which is what turns an unenforced rule into a correctable one. |
| 2 | What `tools:` is, given that the spawn API has no `tools` parameter | (a) hard allowlist in the agent def; `phases.<id>.tools` is lint-validated and surfaced in the injected contract block, never applied at spawn; (b) the agent def carries a default and `craft:init`/`init-land` emits a repo-local agent override file from the knob; (c) no knob — a repo that needs more forks the agent def | **(a)** | The pinned spawn surface rules out mechanical widening. (b) buys real enforcement but adds a whole new emit target and a second place agent definitions live — a large change hiding inside a small knob. (c) is honest but loses the declaration. (a) keeps the floor reduction (which is real and static) and keeps the widening declarable and lintable; DC1's posture already accepts a contract-line rule as the unit of enforcement. |
| 3 | Part D's bin vs the `skills/run` §Done prose | (a) the bin replaces the prose outright — §Done calls `scripts/emit-metrics.sh` once and states nothing about transcript reading, message-id folding or cache columns; (b) the prose stays and calls the bin, keeping the manual path as a fallback; (c) the bin is added, the prose is left alone | **(a)** | The prose IS the defect: it asks a session to fold usage by message id and partition tool_use blocks by hand, and 11 false zeros say it cannot. Keeping a manual fallback (b) keeps the failure mode available under exactly the conditions that produce it (a long run, a tired context). (c) leaves two writers for one file. |
| 4 | `@@TURN_BUDGET@@` resolution axis | (a) descriptor-driven — `manifest.phases.<id>.turn_budget → descriptor.turn_budget → archetype table`, resolving identically in both execution modes; (b) mode-driven like the two existing markers; (c) no marker — the budget is injected as a separate line appended after the core block | **(a)** | (b) introduces a third differing line and fails `contract-equivalence` for all twelve descriptors, which acceptance forbids. (c) sidesteps the assembler but puts an invariant outside the core fragment, against ADR-015's boundary rule. (a) costs one small refactor (`applyCarveOuts` takes the variants map instead of choosing it) and keeps the invariant provable. |
| 5 | Budget keying, and the three uncovered archetypes | (a) key on `archetype` plus `isExecutingHarness(descriptor)` — construction 150, harness-exec 150, harness-read 60, specification 100, refinement 130, delivery 150, setup none (all in tool calls); (b) key on archetype alone, `harness` gets one number for both its phases; (c) key on descriptor id, no archetype table — every budget declared in `pipeline/default.yml` | **(a)** | `isExecutingHarness` already exists and already distinguishes exactly the two cases the brief's table conflates; (b) forces a reviewer (p90 60 tool calls) and a triager (p90 313) onto one number. **The brief's four numbers are not one rule, and the two uncovered values follow the rule they do imply.** For a role already the right size the budget sits AT its measured p90 and is a pure no-op net: harness-read 60 against reviewer p90 60, specification 100 against planner p90 100. For the two roles that blow up it sits well BELOW p90 and is meant to fire: construction 150 against part-implementer p90 291, harness-exec 150 against triager p90 313 — that is Part E's arithmetic expressed as a limit. Refinement 130 (refactor-executor p90 129) and delivery 150 (docs-writer p90 151) are no-op nets by the first rule; neither role shows the runaway tail that earns a squeeze, and n=12 and n=21 are too thin to justify one. `setup` spawns no agent and appears in no transcript, so a budget for it would bind nothing. (c) gives the most control and no default, so a third-party descriptor silently gets no budget. |
| 6 | How much of `harness-exec` line 4 promotes to core | (a) the token-cost half only; the untrusted-DATA half and the orchestrator hand-off clause stay in `harness-exec`; (b) the whole line promotes and `harness-exec` line 4 is deleted; (c) the cost half plus a generically-reworded untrusted-input rule promote, leaving only the slice clause | **(a)** | The security half is about a technique's output file, which only the two harness phases ever read; promoting it makes the backlog-ticker read a rule about triage artifacts. (b) also drops the phrase `change-scoped` that `PHASE_EXPECTATIONS` asserts for that bundle. (c) is defensible if you want a general untrusted-input rule, but that is a security change riding inside a token-cost change — its own decision, not this one's. |
| 7 | Plan-lint ceiling posture | (a) blocks (non-zero exit), while `overlapWarnings` keeps warning; (b) warns like overlap, consistent with ADR-306; (c) warns for one run, then blocks | **(a)** | Acceptance says fail. The asymmetry with ADR-306 is justifiable: overlap is a property of a PAIR that the lint cannot judge, while over-ceiling is a property of ONE part and is exactly what the planner was told not to produce. (b) produces a warning that lands on the orchestrator after the planner has returned and its context is gone — acting on it means re-spawning the planner, which is the cost of a block without the obligation of one. (c) adds a state the lint has no way to hold. |
| 8 | Where `tool_calls` is counted | (a) `parseLines` stamps `toolCalls` on every `UsageEvent`; the spec's field whitelist and `phaseTurns` grow with it; (b) `metrics-emit-main` counts `tool_use` blocks itself, leaving the port untouched; (c) drop `tool_calls` from the row | **(a)** | Tool calls are the unit Part B's budget is denominated in and the unit `turn-budget` recommendations should carry, so the pure core needs them, which means the port needs them. (a) obliges every binding to either populate or omit the field — the same treatment `spawnId` already gets. (b) duplicates transcript parsing and puts the count somewhere `aggregate` cannot see it. (c) fails acceptance. |
| 9 | `equiv` weights | (a) named constants in `metrics-line.js` — `input 1, cache_read 0.1, cache_creation 1.25, output 5` — the measured ratios, model-independent; (b) derived per-row from the `--prices` table, so `equiv` is model-accurate; (c) no `equiv` column, leave the weighting to the reader | **(a)** | The ledger is append-only and ADR-331 makes a format change a hard comparison boundary, so these weights are effectively permanent — a value that changes with a price table would make every row incomparable to every other. (a) also matches the existing `cost.relative` / `cost.priced` split, where the relative axis is deliberately price-free. (b) belongs in the miner's `priced` figure, which already exists. |
| 10 | What counts toward the file ceiling | (a) `declaredFiles` unchanged — spans that resolve to an existing regular file; (b) all backticked spans that LOOK like a repo path (contain `/` or a known extension), resolved or not; (c) the union of (a) and (b) | **(c)** | (a) counts zero for a part that creates eight new modules, which is the exact case the ceiling exists to split — the check would be dead on greenfield work. (b) misses an existing file declared as a bare basename (`ci.sh`). (c) adds one path-shape predicate and nothing else, and leaves the resolved set untouched so `overlapWarnings` and ADR-306's posture do not move. |
| 11 | How the emitter identifies a phase's transcript(s) | (a) the orchestrator passes the spawn's `toolUseId` and the bin matches it against the sidecars; (b) the bin groups the parsed events by the `phase` `parseLines` already stamps on them, narrowed by an optional `--since` the orchestrator passes at phase entry; (c) `--since` alone — every transcript in the window, whatever its agentType | **(b)** | (a) is the most precise and depends on the session reliably knowing its own tool-use id, which is the same "the session reads a field by hand" assumption that produced the 11 false zeros. (b) uses a mapping the adapter already owns and aggregates a fan-out phase's parallel spawns correctly (review spawns several per round). **`--since` is not optional decoration in (b): it is what keeps a re-run phase honest.** One session dir can hold two `design` spawns — the ledger already carries a `design-revision` row — and agentType alone cannot tell them apart, so without a window the second row would re-count the first. `--since` absent means "every transcript for this phase", which is the correct reading for a phase that ran once. (c) drops the role mapping and mis-attributes any spawn that overlaps the window. |

## Test strategy

TDD throughout, Given/When/Then titles, AAA bodies, `sut` variable. Every new engine
module is covered by a pure unit suite plus a `spawnSync` bin suite in a `mktemp`
throwaway, matching `tune-plan` / `usage-mine`.

**Part D**

- `engine/test/metrics-line.test.js` (NEW, pure) — row formatting for the full case;
  `cache=na` when neither cache field is present, and `avg_ctx=na`/`equiv=na` with it;
  `transcript=na` for an agent-spawned phase with no transcript; the `equiv` and
  `avg_ctx` arithmetic pinned on the worked reviewer vector (28 turns, 2,661,903
  cache_read → `avg_ctx=99213`, `equiv=564218`); zero is never emitted for an unknown;
  field order is stable.
- `engine/test/telemetry-claude.test.js` (EXTEND) — `parseLines` counts `tool_use`
  blocks across ALL lines of one message id (the 4-line / 1-message fixture from the
  pinned matrix yields 2, not 1) while usage folds last-wins; `toolCalls` is 0 for a
  transcript with no tool use; the redaction whitelist is unbroken (no path, no prompt
  text on the event).
- `engine/test/metrics-split.test.js` (EXTEND) — `formatCacheSplit` now has a caller;
  pin the `cache=na` branch through `metrics-line`.
- `engine/test/usage-aggregate.test.js` (EXTEND) — `buildPhaseTurns` emits one entry per
  distinct `(phase, role)` over non-review phases; `reviewCycles` is byte-identical to
  the pre-change output for a review-only event set (backward-compat pin);
  `turn-budget` recs sort correctly among the existing kinds via `sortedRecs`; empty in
  → empty out; `renderMarkdown` emits `## Turns by phase` when `phaseTurns` is non-empty
  and omits the heading entirely when it is not.
- `engine/test/metrics-emit-main.test.js` (NEW) — transcript dir absent → a
  `transcript=na` row and exit 0 (advisory, never a gate, per the telemetry spec's
  failure semantics); a fan-out phase with three sub-agent transcripts aggregates into
  ONE row; an unreadable sidecar degrades to the unlabelled path rather than throwing;
  the ledger append is `>>` semantics with the header written only when absent.
- `engine/test/metrics-emit.bin.test.js` (NEW) — `spawnSync` the shim against a fixture
  transcript tree under `mktemp`; stdout row matches; a missing required flag exits
  non-zero with a targeted stderr line.
- `engine/test/tune-plan.test.js` (EXTEND) — a `turn-budget` rec becomes an advisory
  proposal (`to: null`) before Part B; after B it becomes a `phases.<id>.turn_budget`
  patch.
- `test/architecture-boundaries.test.js` (EXTEND) — the composition-root set holds
  exactly the two declared bins; a third `-main.js` importing an adapter is still
  flagged; the pure core still imports no adapter.
- Fixtures: a new `engine/test/fixtures/telemetry/` session tree with a multi-line
  single-message transcript (the streaming-partial case), a no-cache-fields transcript,
  and a three-spawn review phase.

**Part A**

- `test/p10-structure.test.js` (EXTEND) — every `agents/*.md` declares a non-empty
  `tools:` list; `agents/reviewer.md` declares no member of the mutating set
  (`Edit`, `Write`, `NotebookEdit`); no agent declares `Task`/`Agent` or any
  `mcp__*` name.
- `test/sync-adapter-agents.test.js` (EXTEND) — `--check` stays green with `tools:`
  present in the shared frontmatter, proving the body-only contract holds.
- `engine/test/manifest-lint.test.js` and `test/manifest-lint.test.js` (EXTEND) —
  `phases.<id>.tools` accepted as a list and as the one-element string sugar; rejected
  for an empty list, a non-string element, and a name matching neither the plain nor the
  MCP shape.
- `engine/test/manifest-lint.bin.test.js` (EXTEND) — the bin's exit code and message for
  a malformed `tools` value.

**Part C**

- `engine/test/contract.test.js` (EXTEND) — the output-digest line survives assembly in
  both execution modes with identical text.
- `engine/test/contract-equivalence.test.js` (EXTEND) — `CORE_MARKERS` grows; the
  exactly-two-differing-lines assertion still passes for every descriptor;
  `PHASE_EXPECTATIONS`' `'change-scoped'` marker still resolves after `harness-exec`
  line 4 is narrowed.
- `engine/test/contracts-lint-main.test.js` (EXTEND) — the amended `core.md` and
  `harness-exec.md` contain no "retrieval" occurrence and stay non-empty regular files.
- `engine/test/governance-invariance.test.js` (EXTEND) — the new core lines are present
  on a descriptor with `contract: []`, proving they are a floor and not a bundle.

**Part E**

- `engine/test/plan-lint-main.test.js` (EXTEND) — a part declaring `PART_FILE_CEILING`
  files passes; one more fails with exit 2 and a message naming the part label and the
  count; the failure is independent of the overlap warning; a part declaring files that
  do not yet exist still counts them (DC10's union); a bare-basename span still counts;
  a part with no `### Context` block is already failed by `missingSections` and the
  ceiling check adds no second finding for it; a backticked span that is prose rather
  than a path (`` `sut` ``, `` `RED→GREEN` ``) counts toward neither set.
- `engine/test/plan-lint.bin.test.js` and `test/plan-lint.test.js` (EXTEND) — exit code
  through the shim and the bash wrapper.
- `test/plan-doc-fences.test.js` (EXTEND) — the ceiling prose in `templates/plan.md`
  does not break the template's fence structure.

**Part B**

- `engine/test/contract.test.js` (EXTEND) — `@@TURN_BUDGET@@` resolves from
  `descriptor.turn_budget`; the manifest knob overrides the descriptor; the archetype
  table is the last fallback; an unbudgeted descriptor expands to the run-to-completion
  text; the SAME text results in agent and inline mode for one descriptor.
- `engine/test/contract-equivalence.test.js` (EXTEND) — the two-line invariant holds for
  every descriptor WITH budgets declared, which is the assertion that would have caught
  a mode-keyed marker; `'Turn budget'` is in `CORE_MARKERS`.
- `engine/test/descriptor.test.js` (EXTEND) — `normalizeEntry` carries `turn_budget`
  through; an absent value is `null`, not dropped-and-undefined; a non-integer or
  non-positive value is rejected at normalize time.
- `engine/test/archetype.test.js` (EXTEND) — the archetype budget table covers every
  member of `VALID_ARCHETYPES`, including the setup/none entry, so a new archetype
  cannot be added without a budget decision.
- `engine/test/contract-assemble-main.test.js` (EXTEND) — the budget survives the
  `--descriptor-json` stdin path and the `--manifest` path.
- `engine/test/manifest-lint.test.js` (EXTEND) — `phases.<id>.turn_budget` accepted as a
  positive integer, rejected for `0`, a negative, a float and a string.

**Gates.** Part gate `node --test 'test/**/*.test.js'`; phase gate `bash scripts/ci.sh`
(which runs `design-lint` over this doc, `contracts-lint`, `sync-adapter-agents.sh
--check`, `intention-lint` over the living corpus, `stub-lint`, `prose-lint` and
`adr-lint`); validation by Stryker mutation over the touched modules; architecture by
`node --test test/architecture-boundaries.test.js`. New test files are picked up by
`ci.sh`'s `find`-based enumeration and must satisfy
`test/every-test-file-registers.test.js`.

## Out of scope

- **The ~19k-per-spawn attachment tax** (skill listings, project instructions, the rules corpus).
  It is harness configuration, not craft's surface to change, and it belongs to a
  separate session.
- **Model routing and `pipeline.skip`.** Existing knobs, already auto-patched by
  `craft:tune`; nothing in the measured decomposition points at them.
- **Adopting serena or graft into any agent's tool list.** Part A's effect on the spawn
  floor is measured first; adding MCP schemas back before that measurement exists would
  confound the one number this change is built to produce.
- **Mirroring `tools:` into the seven adapter agent definitions.**
  `sync-adapter-agents.sh` replaces bodies only and never generates frontmatter; each
  adapter's tool surface is its own binding's decision.
- **Review cadence.** The reviewer is 8.0% of spend at 0.60M per agent — already cheap.
  Nothing here touches its rounds, its fan-out, or `REVIEW_WASTE_BILLED_TURNS`.
- **Migrating historical `.claude/craft-metrics.md` rows to the new column set.**
  ADR-331 settles this: rows are annotated with a boundary marker, never rewritten.
- **A post-change measurement.** The live plugin root is the main checkout, so this run
  reads the pre-change definitions end to end. Its rows are the BEFORE; the first run
  after this one lands is the AFTER.
- **Enforcing the reviewer's read-only posture against Bash.** The allowlist removes the
  declared mutating tools; Bash stays because the role is 93.6% Bash, and the contract
  line remains the only thing standing between a reviewer and a write.
