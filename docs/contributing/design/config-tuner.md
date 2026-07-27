# Design — config-tuner (`craft:tune`)

> Brief: close the observe→improve loop the telemetry miner leaves half-built.
> `craft:metrics` mines transcripts into `report.json`; its consumer #1 ("workflow
> improvement") is hand-run. `craft:tune` is the acting half — it reads the
> machine-derived signals and PROPOSES a manifest patch to a NAMED config, landed
> by the human through the same emit→lint→land path `craft:init` uses. CQS:
> `craft:metrics` stays the read-only miner; `craft:tune` acts. It complements the
> miner, never replaces it, and NEVER touches the live `.claude/workflow.md`.
> Status: draft → self-reviewed ×3 → accepted-pending-ADR

## Context

What exists today, and the patterns this feature must follow:

- **The miner is the observer.** `skills/metrics/SKILL.md` → `engine/bin/usage-mine.js`
  writes `report.json` (gitignored) + `report.md`. With
  `--baseline docs/metrics-baseline.report.json`, `report.json` gains `drift[]`
  (per-`(phase,dimension)` regression flags, corpus-size-invariant means) and
  `baselineDeltas[]`. The report already carries `recommendations[]` of three kinds —
  `model-routing`, `cache-hotspot`, `review-waste` — plus per-run `groups[]`
  each `{ phase, role, model, tokens, cost:{priced,relative}, cacheEfficiency }`.
  This design ADDS a fourth recommendation kind, `phase-skip`, sourced from the
  run-record tokens (below), so the tuner consumes ONE machine surface (`report.json`)
  rather than a second run-record parser.
- **emit→lint→land is the write path.** `engine/src/init-emit.js` builds manifest
  frontmatter; `joinManifest({frontmatter, prose})` serializes it; the skill writes an
  `mktemp` temp inside the destination `.claude/` and calls `engine/bin/init-land.js
  <tmp> <name> --scope <s>`, which lints via `manifest-lint` and does a POSIX atomic
  rename ONLY on a clean lint (`engine/src/init-land.js` `land()`). `craft:init` and
  `craft:promote-config` both land through it. `craft:tune` reuses it verbatim.
- **Two-scope named-config resolution.** `engine/bin/config-resolve.js <name>`
  (`engine/src/config-resolve-main.js`) resolves the `--config <name>` manifest across
  local (`./.claude/craft-<name>.md`) then user (`~/.claude/craft-<name>.md`) scope,
  reusing `resolveConfigPath` (`init-config.js`) and `cli-io.js`. Neither present is a
  loud both-scopes STOP. `craft:tune` uses it to locate the base config to patch.
- **The patch surface is the manifest vocabulary.** `engine/src/manifest-vocabulary.js`
  freezes `MODELS_KEYS` (`designer`, `planner`, `reviewer`, `part-implementer`,
  `refactor-executor`, `harness-triager`, `docs-writer`, `backlog-ticker`, `fallback`),
  `PIPELINE_KEYS` (`profile`, `skip`, `insert`, `reorder`), `PHASE_NAMES` (the 13
  canonical phases), and `PHASE_FIELDS`. Only two signals map to a knob that both exists
  and lints clean: `model-routing → models.<role>` and `phase-skip → pipeline.skip`.
  There is NO `harness.passes` or per-phase `checkpoint` field — so `review-waste` and
  `cache-hotspot` have no lint-clean knob and are surfaced ADVISORY, never patched.
- **Repo-local memory.** `engine/src/observability/memory.js` `parseStore(content)`
  parses `.claude/craft-memory.md` into a view whose `findings` concern carries recurring
  review findings with `{ file, pattern, severity, confidence }`. Advisory-only
  (ADR-116). The tuner reads it as advisory rationale, never as a knob source.
- **Run-record tokens are fixed and greppable.** A phase can not-run for three audited
  reasons, each a single fixed prefix (ADR-005 / ADR-103 / ADR-146):
  `WAIVER:` (operator chose to skip), `NO-OP(<phase>):` (ran, found nothing), and
  `auto-skip: <phase> — evaluated unnecessary (<signal>)` (didn't run; necessity probe
  proved it empty). They flow into the run record and the PR body. `auto-skip` is the
  "didn't-need-to-run" signal — the one whose repetition argues for a committed
  `pipeline.skip`. `WAIVER` (operator intent, not phase-attributed in the token) and
  `NO-OP` (ran and added assurance) do NOT drive an auto-patch.

Prior constraints that bind this design (non-negotiable): the miner stays read-only
(CQS); `.claude/workflow.md` is never written; every proposal is machine-derived (no new
capture surface — the tokens already exist, the miner already reads transcripts);
propose-diff only (advisory, never auto-applied — the human confirm IS the gate); the
core is deterministic (no `Date.now()`/random; sorted, byte-stable); a user-scope tuned
config must be self-contained (the destination lint enforces it).

## Requirements

Verifiable statements that must hold when this ships:

1. **Acting front door, separate from the miner.** A skill (`skills/tune/SKILL.md`)
   the session runs in-place, given a `<name>` and optional `--scope user|local`.
   It reads `report.json` (produced by `craft:metrics`), the base named config, and
   optional memory; it never mines transcripts itself and never mutates `report.json`.
2. **Machine-derived proposals only.** Every proposal is grounded in a `report.json`
   recommendation, a `drift[]` entry, or a memory finding. No proposal is synthesized
   from operator judgement or hand input.
3. **Two lint-clean auto-patches.** `model-routing` recs → `models.<role>` (role
   recovered from `report.runs[].groups[]`, membership-checked against `MODELS_KEYS`);
   `phase-skip` recs repeated across ≥2 runs → `pipeline.skip:[<phase>]` (phase
   membership-checked against `PHASE_NAMES`, never proposed for a phase the base marks
   `required: true`).
4. **Advisory surfacings never patch.** `cache-hotspot`, `review-waste`, `drift[]`,
   and recurring memory findings appear in the proposal narrative with `to: null` and
   alter no frontmatter — no manifest knob exists for them.
5. **Prose preserved.** Patching an existing config keeps its frontmatter (deep-merged
   with the accepted proposals) AND its markdown body verbatim, plus an appended tuned
   note; it never clobbers the body with a fresh header.
6. **Never auto-applied; landed by the human through the shared path.** The skill
   presents the diff, takes an explicit human confirm (the gate), stages an `mktemp`
   temp in the destination `.claude/`, and lands via `init-land.js` (lint-then-move).
   A lint failure lands nothing; the prior config is untouched byte-for-byte. The live
   `.claude/workflow.md` is never a target.
7. **Advisory / deterministic.** Absent `report.json` → STOP telling the user to run
   `/craft:metrics` first. Absent named config → STOP naming both scopes. Empty proposal
   set → a recorded `NO-OP(tune)` no-op, exit 0. The core takes no clock/random; its
   output sorts stably.
8. **Acceptance (SC-style two-run smoke).** mine → tune → re-mine: a `report.json`
   whose phase X on an expensive model yields a `model-routing` rec makes `planTune`
   propose `models.<role-of-X> = <cheaper>`; applying the patch and re-mining a corpus
   where X now runs on the cheaper model shows X's priced cost dropped — the loop moved
   the flagged phase's economics. Core ≥80% coverage + mutation-clean; lint / CI green.

## Design

### The observe/act split (CQS)

`craft:metrics` OBSERVES: it mines transcripts and emits `report.json`. `craft:tune`
ACTS: it maps `report.json` recommendations to manifest knobs and lands a patched named
config. The miner is extended only to OBSERVE one more signal (the run-record `auto-skip`
token, surfaced as a `phase-skip` recommendation) — emitting a recommendation is
observation, not action. All tuning judgement (which recs cross which threshold, how they
compose into a patch) lives in the tuner.

### Signal → proposal mapping (the heart)

| `report.json` source | Proposal | Knob (lint-clean) |
|---|---|---|
| `recommendations[kind=model-routing]` | route the expensive phase's role to the cheaper model | `models.<role>` |
| `recommendations[kind=phase-skip]` repeated ≥ `SKIP_MIN_RUNS` | drop the always-auto-skipped phase | `pipeline.skip:[<phase>]` |
| `recommendations[kind=cache-hotspot]` | advisory: consider a manual checkpoint at the phase | — (no knob) |
| `recommendations[kind=review-waste]` | advisory: reviewer burned N cycles; consider a cheaper reviewer tier | — (no knob) |
| `drift[]` | advisory: phase drifted M% vs baseline — investigate the prompt | — (no knob) |
| memory `findings` (recurring, high-confidence) | advisory: recurring finding — consider a context rule | — (no knob) |

Each proposal is `{ source, path, from, to, rationale, evidence }`. Advisory proposals
carry `to: null` and never enter `patchedFrontmatter`. Auto-patch proposals deep-merge
into `patchedFrontmatter` over the base.

### Miner extension — the `phase-skip` signal

- `engine/src/observability/skip-signals.js` (NEW, pure, vendor-neutral): 
  `autoSkipPhasesInText(text) → string[]` matches the fixed `auto-skip: <phase>` prefix
  and returns the canonical phase names; `phaseSkipRecs(markers) → recs[]` folds
  per-`(run, phase)` markers into `{ kind:'phase-skip', run, phase, model:null, detail,
  evidence:{ marker:'auto-skip' } }` recommendations (one per distinct run+phase).
- `engine/src/observability/adapters/claude/telemetry.js` `parseLines` also returns
  `markers: [{ run, phase }]` — scanned from assistant-message text via the neutral
  `autoSkipPhasesInText` (the token grammar is vendor-neutral prose, not a JSONL field,
  so it stays in the shared core). Markers carry ONLY `run` (sessionId, already a report
  label) + `phase` (a canonical label) — redaction-safe, no paths/prompt text.
- `engine/src/observability/usage-aggregate.js` `aggregate(events, priceTable,
  baselineReport, threshold, skipMarkers = [])` appends `...phaseSkipRecs(skipMarkers)`
  to the recommendation list before the existing central sort. Backward-compatible:
  the added parameter defaults to `[]`, existing callers are unchanged. `renderMarkdown`
  renders the new kind through its existing generic recommendation loop.

### Tuner core — `engine/src/tune-plan.js` (pure)

`planTune({ report, memory, baseFrontmatter }) → { proposals, patchedFrontmatter }`:

- `proposeModelRouting(report, base)` — per `model-routing` rec, recover the expensive
  group's `role` from `report.runs` (match run+phase+`evidence.currentModel`); if the role
  is in `MODELS_KEYS` and differs from the base, propose `models.<role> = candidateModel`.
  Dedupe per role, keeping the largest-saving proposal. Deterministic order.
- `proposePipelineSkip(report, base)` — group `phase-skip` recs by phase, count distinct
  runs; if ≥ `SKIP_MIN_RUNS` (2) and the phase is a valid `PHASE_NAMES` member not already
  skipped and not `required: true` in the base, propose adding it to `pipeline.skip`.
- `advisories(report, memory)` — `cache-hotspot`, `review-waste`, `drift[]`, and recurring
  high-confidence memory `findings` become `to: null` advisory proposals.

`patchedFrontmatter` = deep-merge(base, auto-patch proposals). Immutable — never mutates
`baseFrontmatter`. Proposals sorted by `(source, path)` for byte-stable output.

### Tuner entrypoint — `engine/src/tune-plan-main.js` + `engine/bin/tune-plan.js`

Reads `report.json`, the base named-config file, and optional memory; splits the base into
`{ frontmatter, prose }` (`parseManifestContent` + a prose-after-second-fence slice); runs
`planTune`; emits to stdout `{ proposals, patchedManifest }` where `patchedManifest` is
`joinManifest({ frontmatter: patchedFrontmatter, prose: <base prose + tuned note> })`.
Absent report → STOP; absent base config → STOP; empty proposals → a `no-op` marker in the
output so the skill records `NO-OP(tune)`. The bin is a ~5-line shim (mutate scope excludes
it); its smoke test is `engine/test/tune-plan.bin.test.js`.

### Skill — `skills/tune/SKILL.md`

Session-owned, no worker agent. Preamble (read-only): plugin-root probe; resolve
`report.json` (default `./report.json`, `--report` override) — absent → STOP "run
`/craft:metrics` first"; resolve the base config via `config-resolve.js` — absent → STOP
naming both scopes. Procedure: run `tune-plan.js` → present the proposal diff → **explicit
human confirm (the gate — never auto-applied)** → stage `mktemp` temp in the destination
`.claude/` → `init-land.js <tmp> <name> --scope <s>` (lint-then-move) → report the landed
path and the greppable token `TUNE(<name>): <n> proposals landed` (defined only here — it
does not join the `skills/run` run-token family). Empty proposals → `NO-OP(tune)`, exit 0.

### Layout

| File | Role |
|---|---|
| `engine/src/observability/skip-signals.js` | NEW pure: `auto-skip` token grammar + `phaseSkipRecs`. |
| `engine/src/observability/adapters/claude/telemetry.js` | `parseLines` also returns `markers`. |
| `engine/src/observability/usage-aggregate.js` | `aggregate` gains optional `skipMarkers`; emits `phase-skip` recs. |
| `engine/src/tune-plan.js` | NEW pure tuner core: `planTune`. |
| `engine/src/tune-plan-main.js` | NEW entrypoint: read inputs, STOP semantics, emit patched manifest. |
| `engine/bin/tune-plan.js` | ~5-line shim. |
| `skills/tune/SKILL.md` | acting front door. |
| `engine/test/skip-signals.test.js`, `engine/test/tune-plan.test.js`, `engine/test/tune-plan-main.test.js`, `engine/test/tune-plan.bin.test.js`, `engine/test/tune-smoke.test.js` | tests. |

## Decision candidates

The designer never decides these; the user does, in the ADR phase.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | Where the `auto-skip` signal is detected | (a) extend the miner to emit a `phase-skip` recommendation; (b) tune re-scans transcripts itself; (c) tune parses the PR-body/run-record text | **(a)** | One transcript reader, one machine surface (`report.json`); emitting a recommendation is observation, so the miner stays read-only (CQS intact). (b)/(c) duplicate transcript I/O and containment logic and couple the tuner to a second format. |
| 2 | Which signals auto-patch vs surface advisory | (a) auto-patch only `model-routing` + `phase-skip` (the two lint-clean knobs), surface the rest; (b) also emit `harness.passes` for `review-waste`; (c) also emit a per-phase `checkpoint` for `cache-hotspot` | **(a)** | Only `models.<role>` and `pipeline.skip` are real manifest knobs that pass `manifest-lint`. (b)/(c) would emit fields the schema rejects (or silently ignores) — an un-landable patch. Advisory surfacing is the honest treatment of a signal with no knob. |
| 3 | Base config the tuner patches | (a) require an existing named config (patch a base); (b) seed a fresh minimal config when absent; (c) tune the resolved `.claude/workflow.md` | **(a)** | "Propose a patch" implies a base, and the two-run smoke needs one. (c) is ruled out by the never-touch-`workflow.md` invariant. (b) (seed-from-scratch) is a clean follow-up, not v1. |
| 4 | Apply posture | (a) propose-diff, human confirms, land through `init-land`; (b) auto-apply on a clean lint; (c) write a `.patch` file for the human to apply manually | **(a)** | Advisory-never-auto-applied is the binding constraint; the human confirm is the gate. Reusing `init-land` gets the same atomic lint-then-move `craft:init`/`promote-config` rely on — a lint failure lands nothing. |
| 5 | `pipeline.skip` threshold | (a) `auto-skip` in ≥2 distinct runs; (b) any single `auto-skip`; (c) `auto-skip` in ALL observed runs | **(a)** | A single run over-fits; requiring ALL runs never fires on a growing corpus where an early run pre-dated the phase. ≥2 distinct runs is the conservative "repeated" floor the brief asks for. |

## Test strategy

- **`skip-signals.test.js`** — TDD, mutation-clean. `autoSkipPhasesInText`: extracts the
  phase from a fixed `auto-skip: <phase> — …` line; ignores `WAIVER:`/`NO-OP(<phase>):`;
  returns `[]` on unrelated text; multiple markers in one blob. `phaseSkipRecs`: one rec
  per distinct `(run, phase)`; stable shape; empty in → empty out.
- **`usage-aggregate.test.js` (extend)** — `aggregate` with `skipMarkers` emits sorted
  `phase-skip` recs alongside the existing kinds; the default `[]` leaves existing reports
  byte-identical (backward-compat pin).
- **`telemetry.test.js` (extend)** — `parseLines` returns `markers` scanned from an
  assistant text line carrying `auto-skip: review …`; markers carry only `run`+`phase`
  (redaction pin — no path/prompt fields).
- **`tune-plan.test.js`** — `planTune` on a hand-built report: `model-routing` →
  `models.<role>` (role recovered; `MODELS_KEYS` gate; dedupe keeps largest saving);
  `phase-skip` ≥2 runs → `pipeline.skip` (PHASE_NAMES gate; not proposed for a
  `required:true` phase or an already-skipped one); `cache-hotspot`/`review-waste`/`drift`/
  memory findings → advisory `to:null`; `patchedFrontmatter` deep-merges without mutating
  the base; empty report → empty proposals; deterministic byte-stable proposal order.
- **`tune-plan-main.test.js`** — absent report → STOP; absent base config → STOP; a valid
  run emits `{proposals, patchedManifest}` with the base prose preserved; empty proposals →
  a `no-op` marker.
- **`tune-plan.bin.test.js`** — `spawnSync` the shim in a `mktemp` throwaway: a fixture
  report + base config produce a patched manifest on stdout; missing report exits non-zero.
- **`tune-smoke.test.js` (acceptance)** — the two-run loop of requirement 8: report-A →
  `planTune` proposes the routing → merge into the base → a report-B representing the applied
  world shows the flagged phase's priced cost dropped.
- **Lints:** `design-lint` over this doc; the new `engine/src` modules carry no
  Class-A/B source-hygiene tokens and no model-id literals (models arrive as report data);
  `stub-lint`/`prose-lint` green on the touched skill and records.

## Out of scope

- **Seeding a fresh config from scratch** when `<name>` is absent — v1 requires an existing
  base (DC3); seed-from-scratch is a follow-up.
- **`review-waste`/`cache-hotspot` auto-patches** — no lint-clean manifest knob exists for
  review cadence or checkpoint placement; both stay advisory until such a knob does (DC2).
- **`WAIVER:`/`NO-OP(<phase>):` → `pipeline.skip`** — only `auto-skip` ("didn't need to
  run") drives the skip proposal; operator waivers and ran-empty no-ops do not.
- **Auto-apply / unattended tuning** — the human confirm is a hard gate (DC4).
- **Multi-config fan-out** — the tuner patches one named config per run.
