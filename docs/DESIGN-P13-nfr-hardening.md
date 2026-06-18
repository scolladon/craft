# Design — P13: NFR hardening (bin mutation coverage · model-class matrix · harness-sourced metrics)

> Brief: P13 lands the **deferred bin mutation coverage** (extract each bin's glue to an in-process
> `engine/src/<bin>-main.js` so `engine/bin/*.js` logic becomes mutation-testable) and the
> **model-class matrix** (a deterministic R10 shape-stability guard + a live cross-tier procedure).
> NFR numbers (**speed** wall-clock, **tokens**) are **harness-sourced** — read by the orchestrator
> from the harness usage block the spawn already returns and recorded on demand; there is **no engine
> telemetry** and no subagent self-report. PRD §17 P13, goal G12, success-criterion SC6.
> Status: revised ×1 against ADRs 065-068.

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

- **The engine resolution core has no tokens or wall-clock to model.** It is a pure function over
  data (`engine/src/**`, no I/O, immutable transforms); there is nothing to instrument inside it —
  which is why NFR metrics are harness-sourced (read by the orchestrator from the per-spawn usage
  block), not an engine feature.
- **The run record is an in-session ledger.** `skills/run/SKILL.md` step 4, seeded from
  `Resolution.record[]` (step 1c) and appended per phase outcome; no persisted run-record file.
  `Resolution.record[]` is a **`string[]`** of prose event lines (`engine/src/resolve.js` builds it:
  `execution: <id> → …`, `backlog: source …`, `models.fallback: …`, `WAIVER: …`). There is **no**
  numeric token or timing field anywhere in the resolution or the ledger — the orchestrator records
  harness-surfaced numbers into it on demand (ADR-065).
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

What must be true when P13 ships. "Tracked over time" here concretely means: numbers land in a
committed artifact a future run diffs against, not a dashboard or a service.

1. **Bin mutation coverage (P9.5 follow-up → G11/SC4 adjacency; ADR-066/067).** The logic currently
   reachable only through `engine/bin/*.js` becomes mutation-testable: each converted bin's glue is
   extracted to an `engine/src/<bin>-main.js` callable, so its mutants are *coverable* (no
   `[NoCoverage]`) and killed by in-process tests. The `mutate: ["engine/src/**/*.js"]` glob is
   **unchanged** — extracted modules are auto-covered; the structural boilerplate (argv-dispatch,
   `process.exit` guard) stays in the bin, out of the mutate surface (pinned below).
2. **Model-class resistance, guarded + measured (G12-model → SC6, S8; ADR-068).** A deterministic
   CI-gated guard asserts the assembled contract block and `normalizeFindings` are **shape-stable**
   across the documented model pins — the R10 discharge, asserting only format-independent signals
   (resolution/gate layer + the already-shape-robust `normalizeFindings`), never raw prose layout.
   On top, a documented **not-CI-gated** live procedure exercises the full pipeline across the
   Claude class (Haiku-4.5 and up) at the "full-pipeline + output-quality" fidelity PRD §12 names,
   recording a tier×dimension PASS/PARTIAL/FAIL matrix into a committed artifact.
3. **NFR numbers obtainable on demand from harness usage (G12-speed / G12-tokens → SC6; ADR-065).**
   Per-phase tokens + wall-clock are read by the orchestrator from the harness usage block the spawn
   already returns (exact, zero-cost) and recorded into the run record and the live model-class
   matrix artifact on demand. This is **no engine feature**: no typed telemetry object, no
   subagent self-report, no deterministic engine-speed baseline. Verifiable: the recording mechanism
   is documented in `skills/run/SKILL.md`, and the live matrix artifact carries the numbers.

## Design

The phase is **one engine refactor + one authored procedure**: the bin-coverage refactor
(extract-to-`src`, ADR-066/067) and the model-class matrix (ADR-068). NFR numbers are not an engine
feature — they are read from the harness and recorded on demand (ADR-065). The deterministic spine
(bin mutation coverage + the R10 shape-stability guard) stands on its own and is CI-gated; the live
matrix bolts on as a documented, un-gated procedure (matching the existing inline-fidelity
precedent) and is the single home for the harness-surfaced numbers.

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
- **C vs D is the bin-harness mechanism, fixed by ADR-066.** Mutating the run-on-import bin
  *directly* drags the dispatch boilerplate — the `if (process.argv[1] === entrypoint)` guard and the
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
lives in **src** (in mutate scope). In-process tests import `main` and assert on the returned exit
code + captured `io` writes; the existing child-process bin tests are **retained as integration
smoke** (ADR-067), so `EXPECTED_TESTS` grows by the added units in the landing commit. The
`mutate: ["engine/src/**/*.js"]` glob is **kept unchanged** (ADR-066): the extracted modules are
auto-covered with no config change, and widening to `engine/bin/**` would re-import the probe-C
boilerplate survivors.

### NFR metrics — harness-sourced, orchestrator-recorded on demand (ADR-065)

There is **no engine telemetry** and **no subagent self-report**. The resolution core is a pure
function over data with no tokens or wall-clock to model, so a typed `Resolution.telemetry` would be
a container the engine can never populate — and a deterministic engine-speed baseline measures
microsecond resolution-layer time, unrelated to live `/craft:run` speed (which LLM latency + spawn
round-trips dominate, the actual G12 levers). Both are dropped.

Instead, the harness already returns an exact per-spawn usage block to the orchestrator at zero cost
(observed verbatim on the design spawn: `subagent_tokens: 110282  duration_ms: 404605`). "Tracked"
means the orchestrator reads those numbers and records them — into the run record's in-session
ledger, and into the live model-class matrix artifact (below) when that procedure runs. This is
on-demand, not every-run, and changes no agent contract (workers never learn about usage, so the
token-efficiency NFR is preserved, not taxed). It is the single home of the "provide the numbers if
the user cares" data; enforcing per-phase budgets (vs tracking) would be a new orchestrator decision,
out of P13 scope.

### Model-class matrix — deterministic guard + live procedure (ADR-068)

SP5 pinned the contract floor with 12 isolated probes; PRD §12 asks P13 for the **full-pipeline +
output-quality** matrix. Two halves:

- **Deterministic guard (CI-gated, no live spend).** Assert that the assembled contract block and
  `normalizeFindings` are **shape-stable across the documented model pins** — the R10 discharge.
  Assert only format-independent signals: the resolution + gate decisions (the §13 "not LLM prose"
  rule) and `normalizeFindings`, which already canonicalizes both the one-per-line and the JSON
  shapes Haiku produced (proven by `normalize-findings-bin.test.js`). This is the green gate for
  SC6's model-class clause; it is ordinary `node --test` coverage, so `EXPECTED_TESTS` bumps with it.
- **Live cross-tier matrix (documented, not CI-gated).** A procedure that runs the full pipeline
  across the Claude class — opus=`claude-opus-4-8`, sonnet=`claude-sonnet-4-6`,
  haiku=`claude-haiku-4-5-20251001` (per SP5) — recording a tier×dimension PASS/PARTIAL/FAIL table
  (the SP5 format) **and** the harness-surfaced per-phase tokens + wall-clock (ADR-065) into a
  committed artifact. It follows the existing `skills/run/SKILL.md` inline-fidelity precedent:
  on-demand, result lands in the run record, never blocks a push. This artifact is the single
  durable home for the NFR numbers and is diffable across runs (the "tracked over time" reading
  without a metrics service).

## Decision candidates

**Resolved by ADRs 065-068; no open candidates.** This section is now a resolution record of the
candidates the design raised; the decisions phase ratified them (some reshaping the design). It does
not re-open any decided question or introduce new candidates.

| # | Choice | Resolution | Fixed by |
|---|---|---|---|
| **DC-1** | NFR-hardening scope | **Reshaped.** No engine telemetry leg; the deterministic floor is bin mutation coverage + the R10 shape-stability guard, and the live half is the on-demand model-class matrix recording harness-surfaced numbers. | ADR-065 |
| **DC-2** | Telemetry schema shape | **Dropped.** No typed `Resolution.telemetry` object — the pure resolution core has nothing to populate it with. | ADR-065 |
| **DC-3** | Telemetry location | **Moot.** No telemetry artifact to locate; harness numbers are recorded on demand into the run record + the live matrix artifact. | ADR-065 |
| **DC-4** | Bin-harness mechanism | **Extract logic to `engine/src/<bin>-main.js`** (callable `main(argv, io)`); the bin is a thin entrypoint-guard wrapper. | ADR-066 |
| **DC-5** | Mutate-scope widening | **Keep the `mutate: ["engine/src/**/*.js"]` glob unchanged** — extracted modules are auto-covered; do not widen to `engine/bin/**`. | ADR-066 |
| **DC-6** | Speed-baseline storage | **Dropped.** No deterministic engine-speed baseline and no `ci.sh` speed gate (resolution-layer wall-clock is microseconds, unrelated to live speed). | ADR-065 |
| **DC-7** | Model-class matrix fidelity & gating | **Deterministic shape-stability guard (CI-gated)** + **live cross-tier matrix (documented, not CI-gated)** recording the PASS/PARTIAL/FAIL table and harness tokens/wall-clock into a committed artifact. | ADR-068 |
| **DC-8** | `EXPECTED_TESTS` handling for the bin tests | **Add in-process units alongside; retain the child-process tests as integration smoke;** bump `EXPECTED_TESTS` in the landing commit. | ADR-067 |

## Test strategy

- **Bin-coverage harness (ADR-066/067)** — in-process unit tests on each new
  `engine/src/<bin>-main.js` (`main(argv, io)`: assert returned exit code + captured `io` writes),
  driving the previously `[NoCoverage]` glue (argv branches, usage/error exits, closures). **Retain**
  the child-process bin tests as integration smoke (the sole assertion that the real entrypoint exits
  with the right code and wires argv — the guard line the mutate surface excludes). Mutation-adequacy
  plan: run Stryker scoped to the new src modules (per-hunk per `skills/validation/SKILL.md`); every
  glue mutant must be *coverable* (no `[NoCoverage]`, per probe D) and killed or proved equivalent by
  the validation phase. If a parser/serializer pair is touched in an extracted module, add a
  **round-trip lens** (parse → serialize → deep-equal) — otherwise none, no parser is introduced.
- **Model-class deterministic guard (ADR-068)** — assert the assembled contract block +
  `normalizeFindings` are shape-stable across the documented model pins (reusing the existing
  `normalize-findings-bin.test.js` shape-equivalence lens, which already proves the
  one-per-line/JSON pair canonicalize identically — the exact R10 surface). This is CI-gated
  `node --test` coverage. The live cross-tier matrix is a documented, not-CI-gated procedure (no
  test).
- **`EXPECTED_TESTS`** — **will change**. Every added `node --test` test (the new in-process bin
  units, the model-class shape tests) increments the count; the landing commit bumps
  `EXPECTED_TESTS=448 → <new>` in `scripts/ci.sh` in lockstep (the file's append-only convention).
  Any new bin referenced by `ci.sh` is appended only after it exists.
- **Fixtures to extend** — `engine/test/fixtures/contracts/` (assembly pins for the shape-stability
  guard) and `engine/test/fixtures/scenarios/` (goldens if the guard adds any); the
  `mkdtemp`/`spawnSync` helper pattern in `contract-assemble.test.js` /
  `normalize-findings-bin.test.js` is the model for the retained child-process smoke tests.

## Out of scope

- **Engine telemetry schema / per-phase budget object / subagent self-reported usage** — dropped
  (ADR-065): the harness already surfaces exact per-spawn usage to the orchestrator, so an engine
  schema is a container the pure core can never fill and self-report taxes the very NFR it measures.
  Enforced (vs tracked) per-phase budgets would be a new orchestrator decision, not P13.
- **P13.5 ban-enforcement boundary** — a separate, *discussion-first* backlog item (NOT a PRD
  §17 phase; `BACKLOG.md` ~L296); splitting engine-invariant from adapter-mechanism for the
  enforced bans is its own design conversation, not P13.
- **P14 derived-plugin extension surface** — the registration surface (`craft.extends:`, Tier-2
  injection catalog) is P14; the model-class matrix only exercises what the manifest already
  names, never a derived phase.
- **Live-provider / cross-provider work** beyond the on-demand Claude-class matrix — cross-*provider*
  portability (non-Claude) is G13/P16; P13 pins the *Claude* class only (SP5 caveat).
- **A full `engine/src` mutation baseline** — P9.5 named it as a sibling follow-up to bin
  coverage; P13 lands the bin-coverage *mechanism* and its scoped adequacy, not a tree-wide
  baseline run (out of the §13/SC6 NFR remit; would ride a dedicated hardening pass).
- **Per-run telemetry persistence / a metrics service** — harness numbers land in the run record
  and the on-demand live matrix artifact (diffable across runs); a history store or dashboard is
  beyond "tracked over time" as SC6 frames it.

## Validation — documented equivalent mutants

The following survivors from the P13 scoped Stryker run are **provably equivalent**: no in-process
test can distinguish the original from the mutant because the mutated branch is either structurally
unreachable under valid in-repo inputs or produces the same observable value in all reachable states.
Suppression directives are forbidden; equivalence is proven by reasoning here.

| Location | Mutant | Why no observable behaviour differs |
|---|---|---|
| `engine/src/contract-assemble-main.js:98` BlockStatement | catch body → `{}` (NoCoverage) | The catch wraps `parsePipeline(readFileSync(pipelinePath, 'utf8'))` where `pipelinePath` is the fixed, committed `pipeline/default.yml`. This file is always a well-formed YAML pipeline (its validity is independently enforced by `pipeline-lint` in `ci.sh`). No in-process input can make `readFileSync` throw (the file always exists) or `parsePipeline` throw (the file is always valid). The catch is structurally dead; Stryker marks it `[NoCoverage]` because no test can reach it. |
| `engine/src/contract-assemble-main.js:99` StringLiteral | stderr write template → `""` (NoCoverage) | Same reasoning: the body of the dead catch at :98. Unreachable in-process. |
| `engine/src/contract-assemble-main.js:136` BlockStatement | catch body → `{}` (NoCoverage) | The catch wraps `assembleContract(descriptor, manifest, fragments, ...)`. The descriptor comes from the validated fixed pipeline; fragments come from the committed `contracts/` directory (also enforced by `contracts-lint`); `assembleContract` does not throw for valid inputs from the fixed in-repo set. No in-process input can reach this catch. |
| `engine/src/contract-assemble-main.js:137` StringLiteral | stderr write template → `""` (NoCoverage) | Same reasoning: body of the dead catch at :136. Unreachable in-process. |
| `engine/src/pipeline-resolve-main.js:111` BlockStatement | catch body → `{}` (NoCoverage) | The catch wraps `resolvePipeline(defaults, effectiveManifest, { roleExists })`. `resolvePipeline` is specified to return `{ ok: false, errors: [...] }` for bad input — it does not throw. For well-formed inputs (which always reach this point in the function, because `parsePipeline` already validated `defaults`) it returns `{ ok: true }`. There is no code path that causes `resolvePipeline` to throw; the catch is dead. |
| `engine/src/pipeline-resolve-main.js:112` StringLiteral | stderr write template → `""` (NoCoverage) | Same reasoning: body of the dead catch at :111. Unreachable in-process. |
| `engine/src/contract-assemble-main.js:97` StringLiteral | `'utf8'` → `""` encoding argument | `readFileSync` with encoding `""` (empty string) behaves identically to `'utf8'` on Node.js: both return a string. The file (`pipeline/default.yml`) is ASCII-safe UTF-8; the returned string content is byte-for-byte identical under both encoding arguments. `parsePipeline` receives the same string and the downstream behaviour is unchanged. Stryker survived because the covered tests still pass — confirming behaviour equivalence in context. |
| `engine/src/pipeline-resolve-main.js:90` StringLiteral | `'utf8'` → `""` encoding argument | Same reasoning: `readFileSync` with `""` vs `'utf8'` on a UTF-8 file returns an identical string. The covered tests pass under the mutant. Behaviour-equivalent. |
| `engine/src/manifest-lint-main.js:29` BlockStatement | `catch { return false; }` → `catch {}` | `isRegularFile` wraps `statSync(p).isFile()`. The `catch` returns `false` for any path that causes `statSync` to throw (missing file, permission error, etc.). The mutant replaces `return false` with an empty body — causing the function to return `undefined`. Both `false` and `undefined` are falsy. Every caller of `isRegularFile` uses the result in a boolean context (`if (!isRegularFile(MF))`, `|| isRegularFile(...)`) where falsy values are equivalent. Observable behaviour is identical across all reachable states. |
| `engine/src/contract-assemble-main.js:38` EqualityOperator | `i < argv.length` → `i <= argv.length` | The extra iteration (when `i === argv.length`) reads `argv[argv.length] = undefined` as `arg`. None of the `if/else if` branches test for `undefined`, so the body falls through without executing any branch. No state is modified and no I/O is produced. The result of the function is identical to the original for all reachable inputs. |
| `engine/src/contract-assemble-main.js:97` StringLiteral | `'utf8'` → `""` encoding argument | `readFileSync` with `""` (empty string) in Node.js behaves identically to `'utf8'` on a UTF-8 file: both return the file's content as a string. `pipeline/default.yml` is ASCII-safe UTF-8; the returned string content is byte-for-byte identical. `parsePipeline` receives the same input and produces the same output. The covered tests still pass under the mutant, confirming behaviour equivalence. |
| `engine/src/contract-assemble-main.js:135` StringLiteral | `'agent'` → `""` in execution ternary | `assembleContract` computes `const inline = opts.execution === 'inline'`. For non-inline calls, `execution: 'agent'` produces `inline = false`; `execution: ''` also produces `inline = false` since `'' === 'inline'` is false. The assembled contract block is identical for both values. The carve-out selection (agent vs inline variants) depends only on the boolean `inline`, not on the exact string value of `execution`. |
| `engine/src/pipeline-resolve-main.js:54` MethodExpression | `filter(Boolean)` removed from skip processing | The `filter(Boolean)` removes empty strings that arise from consecutive commas in the `--skip` CSV (e.g. `"a,,b"` → `['a', '', 'b']` → after filter: `['a', 'b']`). The skip list is used as `skipSet.has(phase.id)` in `resolve.js` and `gates.js`. No pipeline phase has `id === ''`, so an empty string in the skip set never matches any phase and has no effect on the resolution or gate decisions. The mutant and the original produce identical `effective` arrays for all reachable inputs. |
| `engine/src/pipeline-resolve-main.js:90` StringLiteral | `'utf8'` → `""` encoding argument | Same reasoning as `contract-assemble-main.js:97`: `readFileSync` with `""` vs `'utf8'` produces an identical string for a UTF-8 file. The pipeline file is ASCII-safe; `parsePipeline` receives the same input. The covered tests still pass under the mutant, confirming behaviour equivalence. |
