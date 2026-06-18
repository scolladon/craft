# Design — P13: NFR hardening (speed · tokens · model-class · bin mutation coverage)

> Brief: P13 makes craft's three non-functional requirements *measurable and tracked* on the
> scenario set — **speed** (wall-clock), **tokens** (tokens/run + per-phase budget telemetry in
> the run record), and **model-class resistance** (runs reliably across the Claude class,
> Haiku-4.5 and up) — and lands the **deferred bin mutation coverage** (an in-process bin
> harness so `engine/bin/*.js` becomes mutation-testable). PRD §17 P13, goal G12, success-criterion SC6.
> Status: draft → self-reviewed ×3 → ready for the decisions phase.

## Context

**The dogfooding repo.** craft is a customizable, opinionated SE workflow engine, built and
maintained *through itself* (`/craft:run`). The engine is a hexagon: a pure resolution core
(`engine/src/**`, no I/O, immutable transforms) behind run-on-import bin entry points
(`engine/bin/*.js`) that the orchestrator (`skills/run/SKILL.md`) drives, with a substrate gate
(`scripts/ci.sh`) shared by CI and local. P0–P12 built and documented the customization surface;
P13 is the NFR-measurement phase (PRD §17 P13 → G12 → SC6), and the home for the bin
mutation-coverage follow-up parked at P9.5 (`BACKLOG.md` "Parked from P9 — ✅ DONE").

**Constraining sections.** PRD §12 (NFR table: G12-speed / G12-tokens / G12-model — targets,
levers, verification columns); §11 invariant "the run record logs every
skip/insert/swap/inline/override/degradation — flexibility *with visible accountability*"; §13
(scenario suite asserts resolution + gate decisions, **not LLM prose**); §18 SC6 ("NFR targets
(speed/tokens) tracked and met on the scenario set; model-class matrix green"); SP5 (§14) + risk
R10. P12's `DESIGN-P12-dx.md` is the nearest altitude precedent (tight, decision-led).

**The current state, pinned by reading the code:**

- **The run record has no telemetry.** It is an *in-session ledger* (`skills/run/SKILL.md`
  step 4), seeded from `Resolution.record[]` (step 1c) and appended per phase outcome. There is
  no persisted run-record file. `Resolution.record[]` is a **`string[]`** of prose event lines
  (`engine/src/resolve.js` builds it: `execution: <id> → …`, `backlog: source …`,
  `models.fallback: …`, `WAIVER: …`). There is **no** numeric token or timing field anywhere in
  the resolution or the ledger.
- **The scenario set is pure, deterministic, zero-token.** `engine/test/scenarios.test.js`
  (S1–S9 + the SC1 anchor) runs `resolvePipeline` against manifest fixtures and asserts slices of
  the `Resolution` (effective pipeline, gate decisions, waivers). Sub-second, no LLM, no spend.
- **Mutation scope is src-only.** `engine/stryker.conf.json`: `mutate:
  ["engine/src/**/*.js"]`, `testRunner: tap`, `coverageAnalysis: perTest`, `tap.testFiles:
  ["engine/test/**/*.test.js"]`. The six bins are **excluded** — never mutation-tested. Stryker
  was stood up at P9.5 (`@stryker-mutator/core@8.7.1` + `tap-runner`); the changed src hunk
  scored 16/16; "Bin mutation-coverage + a full engine/src baseline ride as a P9.5 follow-up."
- **The bins are run-on-import scripts.** All six (`contract-assemble`, `contracts-lint`,
  `manifest-lint`, `normalize-findings`, `pipeline-lint`, `pipeline-resolve`) parse `process.argv`
  at top level, `process.exit`, and `process.stdout.write` with **no exported function** — they
  *do work as a side-effect of being imported*. Their tests
  (`pipeline-resolve.bin.test.js`, `contract-assemble.test.js`, `normalize-findings-bin.test.js`)
  drive them via `spawnSync(process.execPath, [binPath, …])` — a **child process**. This is
  exactly why they are not mutation-covered (pinned empirically below).
- **The substrate gate is exact-count.** `scripts/ci.sh`: `EXPECTED_TESTS=448` asserted against
  `node --test`'s `# tests` line (verified: `# tests 448`), then `bats test/`, `shellcheck`,
  `pipeline-lint`, `pipeline-resolve`, `contracts-lint`. **Any** new `node --test` test changes
  the 448 count and must bump `EXPECTED_TESTS` in the same commit. The file's banner mandates
  slices append to it "so CI never references a binary before it exists."
- **House precedent for un-gated procedures.** `skills/run/SKILL.md` already carries a
  "Manual acceptance check (inline fidelity) — **not CI-gated**" section: a documented,
  on-demand procedure whose result is logged to the run record. The model-class matrix has the
  same shape.

**SP5 already pinned the portability floor.** Twelve contract-adherence probes (planner /
slice-TDD / structured-review / blocker) all PASS across opus/sonnet/haiku → class = Haiku-4.5
and up; the fallback chain is contract-safe (degrades quality, never breaks a contract). The
caveat (R10, §14 SP5): these are *short isolated contract probes, not full multi-phase runs*, and
output **shape** varies by model (Haiku emitted review findings as JSON, not one-per-line). PRD
§12 is explicit that "**P13 adds the full-pipeline + output-quality matrix**" on top of SP5.

## Requirements

What must be true when P13 ships. "Tracked over time" here concretely means: a committed
baseline artifact in the repo (numbers a future run diffs against), not a dashboard or a service.

1. **Speed measurement (G12-speed → SC6).** A repeatable command produces a wall-clock number
   for the scenario set; a committed baseline records the current number so any future change can
   be compared against it. Deterministic (no LLM) so CI *can* assert a regression budget if the
   decisions phase opts in.
2. **Token / per-phase budget telemetry (G12-tokens → SC6, §11).** The run record carries a
   per-phase token-budget field and a per-phase wall-clock field; the schema (field names, value
   types, where each lives, who writes each) is defined and asserted by a test. Whatever portion
   is deterministic is CI-gated; the live-spend portion (real tokens/run) is whatever the scope
   choice (DC-1) admits.
3. **Model-class matrix (G12-model → SC6, S8).** A defined, repeatable procedure exercises craft
   across the Claude class (Haiku-4.5 and up) at a fidelity beyond SP5's isolated contract probes
   (per PRD §12 "full-pipeline + output-quality matrix"); its result is recorded as a committed
   tier×dimension matrix; R10 (shape-varies-by-model) is handled by pinning the asserted surface
   to format-independent signals (the resolution/gate-decision layer and the
   already-shape-robust `normalizeFindings` parser), never raw prose layout.
4. **Bin mutation coverage (P9.5 follow-up → G11/SC4 adjacency).** The logic currently reachable
   only through `engine/bin/*.js` becomes mutation-testable: mutants on that logic are *coverable*
   (no `[NoCoverage]`) and killed by in-process tests. The mutate scope is widened to include the
   newly-reachable surface; the structural boilerplate (argv-dispatch, `process.exit`) is **not**
   dragged into the mutate surface as unkillable noise (pinned below).

## Design

The phase is **mostly authoring + one engine refactor**: a telemetry schema + harness/CLI, a
documented model-class procedure, and the bin-coverage refactor. The decisions phase (DC-1) sets
how far live spend goes; everything below is written so the deterministic spine stands on its own
and the live matrix bolts on as a documented, un-gated procedure (matching the existing
inline-fidelity precedent).

### Empirically-pinned matrix — why the bins are mutation-invisible, and the cleanest fix

Run in a throwaway `mktemp` dir (never the worktree), reusing the worktree's installed
`@stryker-mutator/core@8.7.1` + `tap-runner` via a symlinked `node_modules`; the symlink and
the probe dir were removed after, the worktree's `node_modules` verified intact. A `src/add`
function, a bin that imports it, and four test/scope shapes:

| # | Mutate scope | Test that runs | Result on the logic mutants |
|---|---|---|---|
| A | `src/**` | **child-process** (spawnSync the bin) | `[NoCoverage]` · `covered 0` · 0 killed |
| B | `src/**` | **in-process** (import the src fn) | **killed 2** · 100% (control) |
| C | the **bin** directly | in-process import of an exported `main()` | 14% — the run-on-direct-invoke guard + `process.exit` dispatch **survive** unkillably (2 NoCoverage + guard-clause survivors) |
| D | **extracted-to-src logic** | in-process import of the extracted fn | every mutant coverable; survivor = a real test-strength gap, **no structural artifacts** |

The takeaways are load-bearing:

- **A vs B is the root cause, proven.** Stryker `perTest` + tap-runner attributes coverage by
  what the test process executes; a `spawnSync` child process is opaque to it. The bins'
  child-process tests pass, yet the logic shows up as `[NoCoverage]` — *not* "survived", which is
  why widening `mutate` to `engine/bin/**` without changing the tests would report the bins as
  uncovered, not killed. The fix space is forced: the logic must be reachable **in-process**.
- **C vs D is the bin-harness decision (DC-4).** Mutating the run-on-import bin *directly* drags
  the dispatch boilerplate — the `if (process.argv[1] === entrypoint)` guard and the
  `process.exit(main(...))` line — into the mutate surface, where it survives unkillably (an
  in-process import deliberately *avoids* the entrypoint branch, so no in-process test can ever
  reach it). **Extracting the logic into `engine/src/` keeps the mutate scope pure** (logic only,
  no dispatch boilerplate); the bin shrinks to a thin wrapper that imports the src module.

### Bin mutation coverage — the in-process harness

The bins already follow a src↔bin split for most logic (`pipeline-resolve` → `resolve.js` +
`cli-overlay.js`; `contract-assemble` → `contract.js`; `normalize-findings` → `findings.js`;
`manifest-lint` → `manifest.js` + `frontmatter.js`; `pipeline-lint`/`contracts-lint` → `graph.js`).
The **residual, mutation-invisible logic is the bin glue itself**: argv parsing
(`parseArgs`/`takeValue`), the fileExists/roleExists closures, the usage/error-exit branches, the
stdout-shaping. Today that glue is exercised only through `spawnSync` (probe row A → invisible).

The harness: extract each bin's glue into a callable, I/O-injected `main(argv, io)` (or per-bin
`buildX`/`parseArgs` helpers) **in an `engine/src/` module** the bin thinly wraps — `io` is a
`{ stdout, stderr }`-shaped object and the return value is the exit code, so the function is pure
of `process.*` side-effects and importable in-process. The bin becomes:

```
import { main } from '../src/<bin>-main.js';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
}
```

The run-on-direct-invoke guard stays in the **bin** (excluded from mutate); the testable logic
lives in **src** (in mutate scope). Tests import `main` and assert on the returned exit code +
captured `io` writes — converting the child-process bin tests to in-process is the test-count
delta (DC re: count). Whether to widen `mutate` to `engine/bin/**` at all, or only to the new
`engine/src/<bin>-main.js` modules, is DC-5 — probe D says src-only is the clean answer.

### Telemetry schema — per-phase wall-clock + token budget

The run record is the natural home (PRD §11: "the run record logs every … degradation"). Today it
is an in-session prose ledger seeded from `Resolution.record[]: string[]`. Two shape questions are
load-bearing and *not* pre-decided (DC-2, DC-3):

- **Shape.** A typed per-phase telemetry object — `{ phaseId, execution, wallClockMs,
  tokensIn, tokensOut, budget? }` — is *engine-assertable* (a serializer/validator in
  `engine/src/`, mutation-covered, schema-pinned by a test). Today's `record[]` is free prose,
  which a test can only assert loosely. The recommendation (DC-2) is to add a typed
  `Resolution.telemetry` (or a sibling `telemetrySchema` the orchestrator fills) so the *schema*
  is engine-owned and CI-asserted, while the orchestrator fills live values per phase
  (`skills/run/SKILL.md` step 4 / "Record outcome").
- **Location.** In-session ledger only (ephemeral, in the summary/PR body) vs a persisted
  run-record file under the worktree (DC-3). The deterministic baseline (req 1) needs *somewhere
  committed*; the live per-run telemetry does not have to persist. Recommendation: schema +
  deterministic baseline committed; live per-run telemetry stays in the ledger (no new persisted
  per-run artifact), matching the no-DB "tracked = committed baseline" reading.

Who writes what: the engine owns the **schema** and the deterministic fields (execution mode,
the resolution-derived budget hints); the orchestrator fills the **live** fields (wall-clock,
tokens) per phase at "Record outcome" — exactly where it already appends ledger lines. The
assertion: a `node --test` test pins the schema shape + the deterministic-field values; the live
fields are asserted as *present and well-typed*, never as fixed numbers (they vary per run).
Honesty note: a *real* per-phase token count is only observable during live spend (the harness
must surface usage) — so the token field has a defined schema slot everywhere, but a populated
value only exists in the DC-1 live half; the deterministic half asserts the slot, not a number.

### Speed measurement

Deterministic, because the scenario set is deterministic. A harness/CLI times
`resolvePipeline` over the S1–S9 fixtures (wall-clock for the resolution layer end-to-end) and
emits the number; a committed baseline file records it. Because it is deterministic, the
decisions phase *may* opt to gate a regression budget in `ci.sh` (DC-6: committed-baseline-file
vs telemetry-only). Note the honesty gap this must state plainly: **resolution-layer wall-clock
is microseconds and bears no relation to live `/craft:run` wall-clock** (which is dominated by LLM
latency + spawn round-trips, exactly the G12-speed levers). So the deterministic speed number
tracks *engine* regression, not *delivery* speed; the delivery-speed number only exists in the
live matrix (DC-1).

### Model-class matrix (R10-safe, gating per DC)

SP5 pinned the contract floor with 12 isolated probes; PRD §12 asks P13 for the **full-pipeline +
output-quality** matrix. The fidelity question (resolution-only vs contract-assembly-across-pins
vs live) is folded into DC-1 (the scope spine) and DC re: matrix gating. The R10 handling is the
fixed part regardless of scope: **assert only format-independent signals** — the resolution + gate
decisions (the §13 "not LLM prose" rule) and `normalizeFindings`, which already canonicalizes both
the one-per-line and the JSON shapes Haiku produced (proven by `normalize-findings-bin.test.js`).
The matrix records a tier×dimension PASS/PARTIAL/FAIL table (the SP5 format) as a committed
artifact; if any portion is live it follows the inline-fidelity precedent: a documented,
on-demand, **not-CI-gated** procedure whose result lands in the run record. Model ids per SP5:
opus=`claude-opus-4-8`, sonnet=`claude-sonnet-4-6`, haiku=`claude-haiku-4-5-20251001`.

## Decision candidates

The designer never decides these; the decisions phase (ADRs) does. Row 1 is the spine.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| **DC-1** | **NFR-hardening scope** (dominates speed+tokens+model-class) | (a) **deterministic telemetry**: run-record schema (per-phase wall-clock + token budget) + harness/CLI emitting & asserting it, CI-gated, zero LLM spend, + bin mutation coverage; (b) **live end-to-end matrix**: instrument real `/craft:run` across the model class on representative briefs, real wall-clock + tokens; (c) **hybrid**: (a) CI-gated now + a documented, manually-run live matrix on top, not CI-gated | **(c) hybrid** | (a) alone makes "tokens/run on the scenario set" toothless — the scenario set is zero-token, so the deterministic number can't *measure* the NFR it claims to; (b) alone is non-deterministic, costs tokens, and can't CI-gate, so it can't be a green gate for SC6. (c) gets a CI-gated deterministic floor (schema + bin coverage + engine speed regression) *and* a real-fidelity live matrix that honestly measures tokens/wall-clock — and it matches the repo's existing "inline-fidelity check, not CI-gated" precedent. The live half is a procedure, not a gate. |
| **DC-2** | **Telemetry schema shape** | (a) typed engine object `Resolution.telemetry` / sibling schema (serializer + validator in `engine/src/`, mutation-covered); (b) keep the free-prose `record[]` and append `tokens=…/ms=…` substrings; (c) a separate JSON sidecar schema the orchestrator owns, engine untouched | **(a) typed engine object** | Engine-owned schema = CI-assertable + mutation-coverable (the whole point of P13's measurability); prose substrings (b) can only be asserted by brittle regex and aren't mutation-meaningful; (c) splits the schema from the resolver that already builds `record[]`. |
| **DC-3** | **Telemetry location** | (a) in-session ledger only (live values ephemeral) + committed deterministic baseline; (b) persisted per-run run-record file under the worktree; (c) both (ledger + persisted file per run) | **(a)** | "Tracked over time" = a committed baseline to diff against, not a per-run history store; per-run persistence (b/c) adds a teardown/lock surface and an artifact nobody reads, for no SC6 requirement. |
| **DC-4** | **Bin-harness mechanism** | (a) **extract logic to `engine/src/<bin>-main.js`**, bin becomes a thin guarded wrapper; (b) refactor each bin to **export `main(argv, io)`** in place (logic stays in `engine/bin/`); (c) an in-process import shim that runs the bin module under a captured `process.exit`/stdout | **(a) extract-to-src** | Probe C vs D: mutating bin-resident code (b) drags the run-on-direct-invoke guard + `process.exit` dispatch into the mutate surface as **unkillable survivors**; (c) is fragile (monkey-patching `process.exit`/`process.stdout` per test) and still exercises the guard. (a) keeps the mutate scope pure logic, reuses the existing src↔bin split, and the bin shrinks to a one-line guard that mutate excludes. |
| **DC-5** | **Mutate-scope widening** | (a) widen to the new `engine/src/<bin>-main.js` modules only (bins stay excluded); (b) widen to `engine/bin/**` too; (c) keep `engine/src/**` glob — extracted modules are included automatically | **(c) keep the glob** | The current `mutate: ["engine/src/**/*.js"]` already covers any new `engine/src/` module — extracting (DC-4a) makes the glue mutation-covered with **no config change**. (b) re-imports the boilerplate survivors probe C found; (a) is a redundant explicit list. |
| **DC-6** | **Speed-baseline storage** | (a) committed baseline file (e.g. `docs/` or a `bench/` artifact) the harness diffs; (b) telemetry-only (number lives in the run record, no committed baseline); (c) committed baseline + a CI regression-budget assertion in `ci.sh` | **(a) committed baseline file** | "Tracked over time" needs a committed anchor (b can't compare across runs). Gating a budget in CI (c) risks flaky failures on shared-runner jitter for a microsecond-scale number; ship the baseline first, let a later pass add a gate if the number proves stable. |
| **DC-7** | **Model-class matrix fidelity & gating** | (a) **resolution-layer only** (extend `scenarios.test.js`-style goldens; CI-gated, deterministic); (b) **contract-assembly across model pins** (assert the assembled block + `normalizeFindings` are shape-stable; CI-gated, deterministic, no live spend); (c) **live full-pipeline** across tiers (highest fidelity, manual, not CI-gated) | **(b) deterministic + (c) as the documented manual procedure** (folds into DC-1c) | (a) adds nothing over the existing suite. (b) is the deterministic teeth that *can* be green-gated for SC6 and directly discharges R10 (pin format / parse robustly) on the already-shape-robust `normalizeFindings`. (c) supplies the "full-pipeline + output-quality" fidelity PRD §12 names, but as a not-CI-gated procedure per the inline-fidelity precedent. |
| **DC-8** | **`EXPECTED_TESTS` handling for the converted bin tests** | (a) convert child-process bin tests to in-process **in place** (count may shift; bump `EXPECTED_TESTS` in the same commit); (b) **add** in-process tests alongside the existing child-process ones (count grows; child-process tests retained as integration smoke); (c) replace child-process bin tests entirely with in-process | **(b) add alongside** | The child-process tests are the only thing asserting the *real* `process.exit` codes + argv wiring end-to-end (the guard line mutate excludes); keeping them as integration smoke + adding in-process unit tests preserves both surfaces. Bump `EXPECTED_TESTS` to the new total in the landing commit per the `ci.sh` append-only convention. |

## Test strategy

- **Telemetry schema** — a `node --test` unit on the engine serializer/validator (DC-2a):
  the schema shape, the deterministic-field values (execution mode, resolution-derived budget
  hints), and the live fields asserted *present + well-typed*, never as fixed numbers. Mutation
  scope covers it automatically (`engine/src/**`). If a serializer/parser pair is introduced, add
  a **round-trip lens** (serialize → parse → deep-equal) and a property-style lens over the field
  domains (phase ids, non-negative numerics).
- **Bin-coverage harness** — in-process unit tests on each new `engine/src/<bin>-main.js`
  (`main(argv, io)`: assert returned exit code + captured `io` writes), driving the previously
  `[NoCoverage]` glue (argv branches, usage/error exits, closures). Retain the child-process bin
  tests as integration smoke (DC-8b). Mutation-adequacy plan: run Stryker scoped to the new src
  modules (per-hunk per `skills/validation/SKILL.md`); every glue mutant must be *coverable* (no
  `[NoCoverage]`, per probe D) and killed or proved equivalent by the validation phase.
- **Speed harness** — a runnable that times `resolvePipeline` over S1–S9 and writes the
  baseline; a structural test that the harness runs and the baseline file parses. No fixed-time
  assertion (jitter) unless DC-6c is chosen.
- **Model-class matrix** — deterministic half (DC-7b): assert the assembled contract block +
  `normalizeFindings` are shape-stable across the documented model pins (reusing the existing
  `normalize-findings-bin.test.js` shape-equivalence lens, which already proves the
  one-per-line/JSON pair canonicalize identically — the exact R10 surface). Live half: a
  documented, not-CI-gated procedure (no test).
- **`EXPECTED_TESTS`** — **will change**. Every added `node --test` test (telemetry unit, the
  new in-process bin units, the speed structural test, the matrix shape tests) increments the
  count; the landing commit bumps `EXPECTED_TESTS=448 → <new>` in `scripts/ci.sh` in lockstep
  (the file's append-only convention). Any new bin/harness referenced by `ci.sh` is appended only
  after it exists.
- **Fixtures to extend** — `engine/test/fixtures/scenarios/` (matrix goldens if DC-7b adds any),
  `engine/test/fixtures/manifests/` and `engine/test/fixtures/contracts/` (telemetry/assembly
  pins); the `mkdtemp`/`spawnSync` helper pattern in `contract-assemble.test.js` /
  `normalize-findings-bin.test.js` is the model for the retained child-process smoke tests.

## Out of scope

- **P13.5 ban-enforcement boundary** — a separate, *discussion-first* backlog item (NOT a PRD
  §17 phase; `BACKLOG.md` ~L296); splitting engine-invariant from adapter-mechanism for the
  enforced bans is its own design conversation, not P13.
- **P14 derived-plugin extension surface** — the registration surface (`craft.extends:`, Tier-2
  injection catalog) is P14; the model-class matrix only exercises what the manifest already
  names, never a derived phase.
- **Live-provider / cross-provider work** beyond whatever DC-1 admits — cross-*provider*
  portability (non-Claude) is G13/P16; P13 pins the *Claude* class only (SP5 caveat).
- **A full `engine/src` mutation baseline** — P9.5 named it as a sibling follow-up to bin
  coverage; P13 lands the bin-coverage *mechanism* and its scoped adequacy, not a tree-wide
  baseline run (out of the §13/SC6 NFR remit; would ride a dedicated hardening pass).
- **Per-run telemetry persistence / a metrics service** — DC-3 recommends committed-baseline +
  ephemeral ledger; a history store or dashboard is beyond "tracked over time" as SC6 frames it.
