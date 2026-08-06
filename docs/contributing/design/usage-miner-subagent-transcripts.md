# Design — usage-miner-subagent-transcripts

> Brief: craft's own usage miner under-reports cost by ~100x on sub-agent work, so
> `/craft:metrics` and `.claude/craft-metrics.md` cannot be trusted. Read token truth from
> the per-sub-agent transcripts on disk instead of the spawn rollup's final-message usage,
> without double-counting, without dropping in-flight sub-agents, and without turning the
> advisory observability port into a gate.
> Status: draft → self-reviewed ×3 → accepted-pending-ADR

## Context

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

- **Prior decisions this design is bound by.** ADR-186 (run identity is the `sessionId`,
  so re-mining the same session yields identical `run` values and diffing is meaningful).
  ADR-187 (inline per-turn usage is a noted gap; `--include-inline` is the opt-in — this
  design proposes revisiting it, which is why it is a decision candidate and not a
  unilateral change). ADR-119 (`.claude/craft-metrics.md` is a separate append-only metrics
  artifact, never the learnings store). **ADR-184** is the one this change most directly
  strains: it settled that the miner *complements* the ledger — "cheap append = live
  breadcrumb; miner = offline deep read" — and pinned the ledger writer's data source as
  the live `Agent` `<usage>` block, which "exposes only `subagent_tokens`". That block is
  precisely the final-message usage this design proves is ~100x low, so ADR-184's
  cheap-breadcrumb premise and this change's correctness goal now pull in opposite
  directions. DC-3a is where that is settled.

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
  `.claude/craft-metrics.md` (append-only, 30.6K, 372 rows, **372 of them `cache=na`**); `README.md` and
  `docs/guides/comparison.md` (which quote `544.3M tokens / $297.55` from the *external*
  collector, never from craft).

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
   — see defect 3 below. (Subject to DC-8.)

9. **Determinism.** No clock, no random, no network in any new code path; identical input
   trees produce byte-identical `report.json` through `serializeReport`.

10. **Baseline coherence.** After the change, `--baseline docs/contributing/metrics-baseline.report.json`
    does not report every phase as drifted. Since drift compares per-phase *means* and the
    correction is ~100x, this is only satisfiable by regenerating the baseline in the same
    change (DC-4).

11. **Acceptance.** `bash scripts/ci.sh` green; `npm --prefix engine run mutation` holds its
    threshold over `engine/src/observability/**`; a regression test fails on the pre-fix
    parser (Test strategy §"the 100x regression test"); no provenance refs, no suppression
    directives, no swallowed errors in any touched source or test.

## Design

### Empirically pinned corpus matrix

Measured on this box on 2026-08-06 against
`~/.claude/projects/-Users-scolladon-workspace-perso-craft`. Every number below was
re-derived here; the orchestrator's pre-chew is corrected where it differs (marked ⚠).

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
external collector's token formula exactly, with no new arithmetic.

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
"cannot be trusted" is an understatement. Fixing it is DC-8.

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

Recommended resolution (DC-5/DC-6): **the adapter exports a port-injected discovery
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

**The walk is a pinned shape, not a generic recursion** (DC-7). `discover` reads exactly:

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
claude binding needs the equivalent paragraph, and DC-8(a) removes the common case of hitting
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
| `slug` | `null` | absent from sub-agent lines. `groupByRun` takes the first non-null slug per run, so the run's slug is inherited from the main-loop events — **only if main-loop events are in the stream**, which couples this to DC-2 |
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
transcript, so per-group sums stay meaningful. DC-9 covers the alternative of joining the
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
would be `null` — which is why DC-2 (the `--include-inline` default) is coupled to DC-1 and
not independent: **if rollups stop being a token source and inline stays opt-in, the default
report loses main-loop cost entirely and gains nothing to replace it.** The recommended
resolution attributes all main-loop turns to a single `role: 'main-loop'`, `phase: null`
group — an exact total with an honest refusal to split it per phase, rather than ADR-187's
approximate bucketing. ADR-187's stated objection ("the orchestrator session's `cache_read`
accumulates across phases, inflating any single inline phase") is an objection to the
*per-phase split*, not to the *total*; the total is exact.

### Pricing reconciliation — what reproduces and what cannot

The brief asks whether the fixed miner reproduces the published `544.3M tokens / $297.55`.
Investigated rather than assumed:

- **Tokens: yes.** The oracle's formula is `input + output + cache_read + ephemeral_5m +
  ephemeral_1h`. `tokensFromClaudeUsage` maps `cache_creation_input_tokens` into
  `tokens.cacheCreation`, and `cache_creation_input_tokens === ephemeral_5m + ephemeral_1h`
  on 1618/1618 measured usage lines. `computeRelativeCost` sums all four. So
  `cost.relative` is the oracle's number, exactly, with no new arithmetic.
- **Dollars: no, and for two reasons neither of which this change may touch.**
  1. `DEFAULT_PRICES` in `adapters/claude/pricing.js` contains
     `claude-opus-4-8/4-7/4-6, claude-sonnet-4-6, claude-fable-5, claude-mythos-5,
     claude-haiku-4-5` — **no `claude-opus-5`, no `claude-sonnet-5`**. Every group in a
     corrected report gets `cost.priced: null`. The oracle has both
     (`opus-5 = RATE(5,25)`, `sonnet-5 = RATE(3,15)`). Adding them is a pricing-table
     update, explicitly out of scope.
  2. `computePricedCost` multiplies raw token counts by **per-MTok** rates with no `1e6`
     divisor (`pricing.js` header: *"The core stores per-MTok rates directly; no 1e6 scaling
     is applied"*). Summing `cost.priced` across the committed baseline yields
     **$31,171,735.70** for 39.7M tokens — the values are dollars × 10⁶, not dollars. This
     is a pre-existing core arithmetic defect independent of this change.

  **The README/comparison figures are therefore not wrong — they are simply not craft-derived,
  and craft cannot currently derive them.** DC-10 asks how far this change should reach.

### Artifact reconciliation

- **`docs/contributing/metrics-baseline.report.json`** — 27 runs / 144 groups / 39.7M
  relative tokens, all from the broken path, including one all-zero `claude-sonnet-5`
  `phase: null, role: null` noise group (an untyped rollup, per the analysis above) and 17
  `phase: null` groups from the retired `slice-implementer` role. Drift compares per-phase
  *means*; a ~100x correction reads as drift on every phase, permanently, until the baseline
  is regenerated. Regeneration in the same change is effectively forced by Requirement 10 —
  DC-4 decides its form.
- **`.claude/craft-metrics.md`** — ⚠ **not written by the miner.** `skills/run/SKILL.md`
  §metrics artifact instructs the session to append
  `<run-id> <phase-id> tokens=<subagent_tokens> duration_ms=<n> cache_read=<n> cache_creation=<n>`
  from *"the usage block the spawn already returns"* — the identical final-message usage the
  miner reads, so identically ~100x low (row magnitudes 60k–200k match rollup `totalTokens`
  exactly). **Fixing the miner does not fix future ledger rows.** That makes two separate
  questions — the writer (DC-3a) and the historical rows (DC-3b).

  ⚠ **A fourth defect surfaces here: the ADR-184 writer upgrade never took effect.**
  ADR-184 replaced the lossy `cache=na` field with a real `cache_read=`/`cache_creation=`
  split, degrading to `cache=na` only "if the split is genuinely unavailable for a given
  spawn". Measured on the committed file: **372 of 372 rows are `cache=na`; zero rows carry
  `cache_read=`.** The degradation path is the only path that has ever executed. The cause
  is the same one this whole design is about — the split was to be recovered "by parsing the
  run's own spawn-rollup lines", and the untyped/usage-less rollups plus the final-message-only
  `usage` make that recovery empty in practice. Any DC-3a option other than (a) should fix
  this in the same stroke, since it has the same root cause and the same file.
- **`docs/contributing/specs/telemetry.md`** — the living-intention page for this scope.
  Sections needing refresh: *Claude binding* (discovery + emission rule + sidecar labelling),
  *Inline gap / --include-inline (ADR-187)* (whatever DC-2 lands), *Failure semantics* (the
  new counted-fallback branches), and its final line, which points at the stale path
  `docs/metrics-baseline.report.json` — the real path is
  `docs/contributing/metrics-baseline.report.json`.

## Decision candidates

The designer never decides these; the user does, in the ADR phase. DC-1 and DC-2 are coupled
— see the *Main-loop events* section.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | **Where role/phase labels come from once transcripts supply tokens** | (a) rollups stay the labelling source, transcripts supply tokens (the brief's framing); (b) **rollups go entirely** — the `agent-<id>.meta.json` sidecar supplies `agentType`; (c) sidecar primary, rollup `agentType` as a fallback when the sidecar is missing or unparseable | **(b)** | Coverage decides it: sidecar `agentType` is **243/243**, rollup `agentType` is **188/237** corpus-wide and **13/20** in the reference session — and the 7 unlabelled rollups there are the *same* lines that carry no `usage`, so (a) leaves exactly the reviewer work both unlabelled and uncosted. (b) also makes Requirement 2 structural: if rollups are never read, they cannot be double-counted, and the depth-2 nested-rollup vector disappears without a special case. Risk to weigh: the sidecar is an undocumented upstream file, so an upstream rename silently unlabels everything — mitigated by the counted fallback (Requirement 4), never a silent `null`. (c) buys back rollup parsing plus a precedence rule for a set the sidecar already fully covers. |
| 2 | **`--include-inline` default** | (a) stays opt-in (status quo, ADR-187); (b) **default-on**, main-loop turns aggregated into one `role: 'main-loop'`, `phase: null` group with no fabricated per-phase split, `--no-inline` to opt out; (c) default-on **with** ADR-187's per-phase bucketing heuristic | **(b)** | Under DC-1(b) rollups stop being a token source, so (a) makes the default report omit main-loop cost entirely — 190.6M of 392.7M tokens in the reference session, 2.36B of 3.92B corpus-wide. ADR-187's objection (accumulating `cache_read` inflates any single inline phase) is an objection to the per-phase *split*, not the *total*; (b) publishes the exact total and refuses the split, which is the honest shape and keeps ADR-187's "never fabricate" intact. (b) also restores run `slug` on sub-agent groups (`groupByRun` inherits the first non-null slug). (c) re-adopts the approximation ADR-187 deliberately gated. Requires amending ADR-187. |
| 3a | **`.claude/craft-metrics.md` — the writer (future rows)** | (a) leave `skills/run/SKILL.md` as-is; new rows keep the ~100x under-report and the permanent `cache=na`; (b) **change the instruction** to source the row from the phase's own sub-agent transcript instead of the returned spawn usage block — which also finally delivers the ADR-184 cache split; (c) retire per-phase row writing and let `craft:metrics` be the single source | **(b)** | The brief says "fix the measurement", and this ledger is the second consumer of the same broken number — the miner fix does not reach it (the row is written by the session at run time, ADR-119). (a) leaves a known-false artifact accruing and leaves 372/372 `cache=na` unexplained. Cost objection to weigh: ADR-184 chose the returned usage block because it was "exact, zero extra cost"; reading one transcript per phase is no longer zero-cost, though it is one file read, not the corpus scan ADR-184 rejected — **ADR-184 needs amending either way**, because its stated data source is now known to be wrong, not merely expensive. (c) is the cleanest end state but drops per-phase-id granularity the miner cannot reconstruct (the ledger keys on `implementation-part7-mirror-sync`; the miner on `phase: implementation`). Note this touches `skills/run/SKILL.md`, outside `adapters/` — confirm it is in scope. |
| 3b | **`.claude/craft-metrics.md` — the 372 historical rows** | (a) **leave + annotate**: append one boundary marker line naming the date and the correction, so old and new rows are never silently compared; (b) migrate — recompute historical rows from the surviving transcripts; (c) leave untouched, document the break in the spec page only | **(a)** | Cheapest thing that prevents the real harm (a reader trending across the boundary). (b) is only partially possible — transcripts are pruned over time, and the 27 baseline runs span sessions whose transcripts no longer all exist, so a migration would silently produce a mixed-fidelity file, which is worse than an annotated break. (c) leaves the artifact self-contradicting for anyone who does not read the spec. Note the file is append-only by ADR-119, which (a) honors and (b) violates. |
| 4 | **`docs/contributing/metrics-baseline.report.json` regeneration** | (a) **regenerate in this change** from the full local corpus with the fixed miner; (b) regenerate **and** keep the pre-fix file as an archived snapshot beside it; (c) delete it and re-seed on the next run | **(a)** | Drift compares per-phase means; a ~100x correction against a stale baseline flags every phase forever, which is Requirement 10 failing. (b) preserves history but the archived file has no consumer and its only use — comparing across the accounting change — is exactly the comparison that is invalid. (c) leaves `--baseline` broken for the intervening period and loses the drift signal on the very change most likely to need it. Consequence to accept under (a): `test/telemetry-claims.test.js` and the README FAQ numbers recomputed from this file (run count, median/min/max hours) will move, and the `readme-drift` guard will demand the README be updated in the same commit. |
| 5 | **Where the two-level discovery lives** | (a) a `SOURCE_DISCOVERY` frozen per-source lookup in `usage-mine-main.js` holding the walk inline; (b) **the claude adapter exports `discover({ listDir, readText })`**, both ports front-door-owned and contained; the front door calls it through the same per-source lookup and keeps all paths, containment, and I/O; (c) pass the adapter an absolute path and let it discover | **(b)** | (c) violates the spec's explicit *"the adapter never receives an absolute path"* contract. (a) honors the contract but puts the `<sessionId>/subagents/agent-*.jsonl` shape — pure claude knowledge — inside the shared selector, next to five other sources that must not know it. (b) keeps the layout knowledge with the binding that owns every other claude runtime specific, keeps the front door the sole path-holder and the sole realpath-checker, and makes the walk unit-testable against fake ports with no filesystem. Costs one new file. |
| 6 | **How the sidecar label reaches the parser** | (a) widen the port to `parseLines(lines, since, context)` with the **front door** building the context (it must then read and parse the sidecar itself); (b) **same signature, but the adapter's `discover` builds the context** and the front door passes it through as an opaque blob it never inspects; (c) prepend the sidecar as a synthetic first line of the stream | **(b)** | Same one-argument widening either way — the question is who authors the blob. (b) keeps sidecar parsing, field names, and fallback policy inside the claude adapter; the front door's contract becomes "carry this opaque value from discovery to parse", which is source-agnostic and needs no claude knowledge. (a) drags `agentType`/`spawnDepth`/the sidecar filename convention into the shared front door. (c) corrupts the line stream's meaning and would trip the malformed-line counter in every other reader of that stream. The third argument is optional; the other six adapters are unchanged. |
| 7 | **Walk shape** | (a) **pinned two-level shape** — `<root>/*.jsonl` and `<root>/<dir>/subagents/agent-*.jsonl`, nothing else; (b) generic bounded-depth recursive walk for `*.jsonl`; (c) glob pattern from config | **(a)** | Fail-closed. A `memory/` directory already sits in the projects root and upstream may add more; (b) would descend it and anything future, and would pick up files whose shape the parser has never seen — producing counted skips that look like corruption. Pinned: **no** nested directories exist inside any of the 19 `subagents/` dirs, and depth-2 sub-agents are flat siblings — so recursion buys nothing that the pinned shape does not already cover. (c) makes the containment surface user-controlled. Cost of (a): an upstream layout change breaks discovery loudly rather than degrading — which is the preferred direction here. |
| 8 | **The zero-arg read root (defect 3)** | (a) **fix here** — `DEFAULT_READ_ROOTS.claude` resolves `join(projectsDir, dashed(cwd))`, containment root stays `~/.claude/projects`; (b) fix `skills/metrics/SKILL.md` instead to require an explicit `--dir`; (c) out of scope — separate change | **(a)** | Without it the entire fix is unobservable through the advertised front door: `/craft:metrics` with no flags returns `"no .jsonl transcript files found"` today and would keep doing so. The dashed-cwd mapping is already what the SKILL *documents*, so (a) makes code match the contract rather than adding one. It is ~5 lines in an existing seam, in the file this change already opens. (b) documents the defect instead of fixing it and leaves per-repo scoping to the caller. (c) ships a fix nobody can see. |
| 9 | **`messages` / `durationMs` for sub-agent events** | (a) **derive from the transcript** — `messages` = billed turns, `durationMs` = `last − first` timestamp span attributed once per transcript; (b) join the rollup by `agentId` for these two dimensions only, tokens still from the transcript; (c) emit `0` for both on sub-agent events | **(a)** | `durationMs` is a `drift` dimension; (c) silently disables half the drift signal. (b) reintroduces a rollup read purely for metadata, brings back the 6/243 orphan blind spot (in-flight sub-agents would get 0), and reopens the double-count question for a future maintainer who sees rollups being parsed again. (a) is self-contained and every input is pinned present (timestamps 2707/2707). Accept the semantic shift and record it: rollup `totalToolUseCount` 74 vs 138 billed turns; rollup `totalDurationMs` 921,407 vs wallclock span 1,134,897 — these are different quantities, so cross-boundary comparison of these two fields is invalid, same as DC-3b/DC-4. |
| 10 | **How far cost reconciliation reaches** | (a) **tokens only** — prove `cost.relative` reproduces the oracle exactly, document that `cost.priced` cannot match the published dollars, file two follow-ups; (b) add `claude-opus-5`/`claude-sonnet-5` to `DEFAULT_PRICES` here; (c) (b) plus fix the missing `1e6` divisor in `computePricedCost` | **(a)** | Honors the brief's stated out-of-scope line ("pricing table updates"). It also keeps the change honest: (b) alone would publish `cost.priced` values that are 10⁶× the real dollars, which is a *worse* false number than the current `null`. (c) is the only alternative that would actually reproduce `$297.55`, but it changes every historical `priced` value in the baseline and in every consumer, which deserves its own change and its own ADR. Under (a) the answer to "does the fixed miner reproduce the README figures" is: **544.3M tokens yes, $297.55 no** — and the README figures are correct, just externally sourced. |

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

3. **An opt-in live reconciliation script, not a test.** `scripts/` gains no new gate; a
   short reproduction recipe goes in the spec page so any maintainer can re-derive the
   corpus numbers on their own machine in one command. It never runs in CI (no corpus in
   CI, and the numbers are machine-specific).

### The 100x regression test (Requirement 11)

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
  DC-8(a) via the exported `resolveDefaultReadRoot` seam.
- **`engine/test/usage-mine.bin.test.js`** (extend) — one subprocess smoke over the new
  fixture tree in a mktemp throwaway: exit 0, `report.json` + `report.md` written, sub-agent
  groups present with non-null roles.
- **`engine/test/usage-aggregate.test.js`** (extend, only if `aggregate` changes) — expected
  unchanged; assert it: a `role: 'main-loop'`, `phase: null` group aggregates and prices
  like any other, and `groupByRun` propagates the main-loop `slug` onto slug-less sub-agent
  events sharing a `run`.
- **`engine/test/metrics-split.test.js`** — must stay green untouched; `tokensFromClaudeUsage`
  keeps its signature and semantics (it is the shared dependency).
- **`engine/test/telemetry-claims.test.js`** — will move with the regenerated baseline
  (DC-4); the recomputed run count / median / min / max hours must be updated in the same
  commit as the baseline and the README, or the `readme-drift` CI job fails.
- **Property lens** (parser/matcher pair touched): over generated line streams mixing
  `user`-rollup lines, `assistant`-usage lines, blank lines, and malformed JSON in arbitrary
  order — total emitted tokens equal the sum over `assistant` lines alone, invariant under
  permutation and under interleaving; `skipped` equals the malformed count exactly.
- **Gate:** `bash scripts/ci.sh` green; `npm --prefix engine run mutation` at threshold over
  `engine/src/observability/**`; `bash scripts/design-lint.sh` on this doc; `intention-lint`
  satisfied by the refreshed `docs/contributing/specs/telemetry.md`.

## Out of scope

- **Pricing table updates** — `claude-opus-5`/`claude-sonnet-5` are absent from
  `DEFAULT_PRICES`, so a corrected report prices them `null`. Named as a follow-up; DC-10
  confirms the boundary.
- **The missing `1e6` divisor in `computePricedCost`** — `cost.priced` is dollars × 10⁶
  today (the committed baseline sums to $31,171,735.70 for 39.7M tokens). A pre-existing
  core defect, independent of this change, that would rewrite every historical `priced`
  value; its own change and its own ADR.
- **New report formats or fields** — `report.json`/`report.md` schemas are unchanged. No new
  `UsageEvent` field, which is also what keeps the redaction whitelist intact.
- **Any adapter other than `adapters/claude/`** — opencode, pi, copilot, codex, aider, and
  the unwired cursor binding keep today's flat discovery and today's two-argument
  `parseLines` call. The optional third argument is additive.
- **Sub-agent attribution for the other bindings** — every non-claude binding ships
  `role: null` today; none has a pinned sub-agent-transcript equivalent, and pinning one
  needs a live run per tool.
- **Retro-mining sessions whose transcripts have been pruned** — transcript retention is
  upstream-controlled, so historical accuracy is bounded by what is still on disk. This is
  the substantive argument against DC-3b(b) migration.
- **Making telemetry gate anything** — the port stays advisory (exit 0 on every input
  failure). A wrong number is a bad report, never a blocked run.
- **`docs/guides/comparison.md` and the README *cost* figures** (`544.3M tokens / $297.55`)
  — investigated (see Design): externally collected and correct. They are not restated from
  craft's own miner in this change, because craft cannot yet produce the dollar figure.
  **Not** out of scope, and easy to conflate with the above: the README FAQ's *telemetry
  claims* (run count, median/min/max run hours) are recomputed from
  `docs/contributing/metrics-baseline.report.json` and guarded by the `readme-drift` CI job,
  so regenerating the baseline under DC-4 forces them to move in the same commit.
