# Plan — baseline-review-waste-replay-guard

> Source: design doc `docs/contributing/design/baseline-review-waste-replay-guard.md` · ADRs `493, 494, 495, 496, 497, 498, 499`
> (all seven take the design's recommended options: the guard replays the report instead of
> re-mining (493); the replay judges only the run-derived kinds `review-waste` and `turn-budget`
> (494); a run-derived rec is judged per rec by its run (495); `aggregate` and the replay share
> one run-derived rule table (496); the guard is a root test (497); the committed report is fixed
> by the replay function, not by hand (498); `skills/metrics/SKILL.md` is left untouched (499))
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.
- A part should land in ~100 tool calls. More than ~5 RED→GREEN cycles, or more than 6
  files in its `### Context` block, is two parts. What counts is a backticked path:
  backtick the files the part CREATES or EDITS, and write read-only reference paths in
  plain text.

## Plan shape (2 parts)

| # | Part | Size class | src delta | Files |
|---|---|---|---|---|
| 1 | Replay a report's run-derived recommendations | pure-module | `engine/src/observability/usage-aggregate.js` (+30 / −2) | the module, its unit suite, the telemetry spec |
| 2 | Guard the committed baseline with its replay and regenerate it | test-infra + data | none | new root guard, the committed report, the telemetry spec, BACKLOG |

Part 2 is not a test-only part over Part 1's code: it is the repo-state guard (a root
`test/` suite, no `src/` delta) plus the data fix it forces, and the guard and the
regenerated report must land in one commit so no red commit exists. Folding it into Part 1
would mix a mutation-scoped unit change with a repo-state guard and a 268-line data diff.

`docs/contributing/specs/telemetry.md` is declared by both parts on purpose (plan-lint prints a
cognitive-locality warning for it). Part 1 writes the replay contract in the same commit as the
code it documents. Part 2 appends the guard paragraph and the regeneration command, because
they name `test/metrics-baseline-replay.test.js`, which does not exist until Part 2.

Every edit below was applied to a throwaway `git clone` of the branch tip (`2d8d658`) and
checked there:

| Check | Shipped | After Part 1 | After Part 2 |
|---|---|---|---|
| `node --test engine/test/usage-aggregate.test.js` | 127 pass | 137 pass / 0 fail | 137 / 0 |
| `npm --prefix engine test` | — | 2859 pass / 0 fail | 2859 / 0 |
| `node --test test/metrics-baseline-replay.test.js` | — | 2 pass / 1 fail (the RED guard, before regeneration) | 3 / 0 |
| report diff `--stat` | — | — | `4 insertions(+), 268 deletions(-)`; every hunk sits above `"runs"` (report line 338) |
| report rec counts | `model-routing` 2, `phase-skip` 21, `review-waste` 15 | — | 2, 21, 4 |
| `bash scripts/ci.sh` (after committing in the clone) | — | — | exit 0 (process suite 681 pass) |
| prose-lint `--gate blocking` on telemetry.md and BACKLOG.md | — | — | exit 0 |

Hand-mutation run (one mutant at a time, final code, `node --test
engine/test/usage-aggregate.test.js`): 33 of 33 killed.

| Mutant | Killed by (test) |
|---|---|
| `report.runs ?? []` → `?? ['Stryker was here']` | no-runs-key only (the runless rec finds the injected entry, which has no `run` either, and is kept) |
| `report.runs ?? []` → `&& []` | faithful-replay, lacks-input, no-runs-key |
| `report.recommendations ?? []` → `?? ['Stryker was here']` | empty / no-recommendations-key only |
| `report.recommendations ?? []` → `&& []` | faithful-replay and five more |
| committed filter negated, or forced `true` | faithful-replay, threshold, absent-run |
| rebuild filter `Array.isArray(run[rule.input])` → `true`, or the filter dropped | lacks-input only (TypeError) |
| rebuild filter → `false` | faithful-replay, retired-detail |
| `candidate.kind === rec.kind` → `true` / `!==` | pass-through, lacks-input |
| `candidate.kind === rec.kind` → `false` | faithful-replay, threshold, absent-run |
| `if (rule === undefined) return false;` → `if (false)`, removed, `return true` | faithful-replay, pass-through |
| `if (rule === undefined) return false;` → `if (true)`, `!==` | threshold, absent-run |
| `candidate.run === rec.run` → `true` / `false` / `!==` | lacks-input only (its two-run layout) |
| `run === undefined \|\| …` → `&&` | faithful-replay, threshold |
| `run === undefined \|\| …` → `false \|\| …` | absent-run, no-runs-key (TypeError) |
| `run === undefined \|\| …` → `true \|\| …` / `run !== undefined \|\| …` | lacks-input |
| `\|\| Array.isArray(run[rule.input])` → `\|\| true` | lacks-input only |
| `\|\| Array.isArray(run[rule.input])` → `\|\| false` | faithful-replay, retired-detail, threshold |
| either table `kind` → `''` | faithful-replay, threshold |
| `input: 'reviewCycles'` → `''` | retired-detail, threshold |
| `input: 'phaseTurns'` → `''` | threshold only (its turn-budget row) |
| `runDerivedRecs` body → `[]`, or either table row removed | the `aggregate` kind-order guard plus the existing `aggregate` rec tests (:748, :1754) |

## Public-surface decision

One new exported symbol: `replayRecommendations(report)` in
`engine/src/observability/usage-aggregate.js` is **public** (a module export). Its consumers are
the root guard `test/metrics-baseline-replay.test.js` and the regeneration one-off documented
in `docs/contributing/specs/telemetry.md`. Surface gates, all pre-paid in the part that creates
it: the engine has no barrel, no `exports` map in `engine/package.json`, no generated API report
and no registry; the one doc surface is the telemetry spec, written in Part 1 beside the code.
`test/architecture-boundaries.test.js` treats this file as the pure core: the new code adds no
import, so no boundary edge changes.

`RUN_DERIVED_RULES`, `runDerivedRecs` and `isJudgedByReplay` are **internal** (module-private,
not exported). `aggregate`, `serializeReport`, `reviewWasteRecs`, `turnBudgetRecs` and
`sortedRecs` keep their signatures.

## Decision candidates

None. ADRs 493 to 499 ratify every load-bearing choice, and the plan follows them. Details the
design left implicit are fixed here, not by a decision:

- `isJudgedByReplay` looks the rule up in `RUN_DERIVED_RULES` with `find`, so the table stays
  the one source of the kind → input mapping (no second kind-keyed map).
- Four test choices go beyond the design's T1-T8, each the only killer of a mutant the
  design's set leaves alive (proven by the hand-mutation run above): the turn-budget row of
  the threshold test (`input: 'phaseTurns'` → `''`); two runs in the lacks-input test, each
  lacking a different key (every run-lookup mutant); a runless review-waste rec in a report
  with no `runs` key (the `report.runs ?? []` array mutant); and an `aggregate` kind-order
  guard pinned before the one-line refactor. The pass-through test also puts each kind on an
  absent run: that is the design's treatment table (any non-run-derived kind is kept whatever
  its run), not a mutant killer.
- The design's T10 and T11 (the two-sided root rows) already pass against the stale file,
  because it disagrees with its replay anyway. They are GUARD entries at the RED step; after
  regeneration they are what proves the live row is not vacuous.
- The telemetry spec section is split across the two parts (see Plan shape).

## Validation-phase notes

- Stryker: `engine/src/**/*.js` is in scope (engine/stryker.conf.json, runner `tap`). Mutate only
  Part 1's hunks, passed as ONE comma-separated `--mutate` value (repeated flags drop all but the
  last). In the prototype they sit at `engine/src/observability/usage-aggregate.js:413-432`
  (table, `runDerivedRecs`, `isJudgedByReplay`), `:607-607` (the `aggregate` spread line) and
  `:617-625` (`replayRecommendations`); re-read the ranges from `git diff --no-ext-diff -U0`
  against the Part 1 commit's parent before running. Narrow the test corpus with an override of
  engine/stryker.conf.json whose `tap.testFiles` lists only engine/test/usage-aggregate.test.js;
  hand-check any survivor against the full engine suite. Confirm the instrumented mutant count is
  at least 3 (one per hunk) before trusting the score.
- Pre-existing advisory findings: `node engine/bin/stub-lint.js --gate blocking --
  engine/test/usage-aggregate.test.js` reports `PLACEHOLDER@L1820` and `PLACEHOLDER@L1842` on
  the shipped tree (two test titles that say "placeholder row"); after Part 1's import line they
  read `L1821` / `L1843`. `hygiene.gate` is advisory here, so `ci.sh` stays green. Out of scope:
  do not reword them.
- The README couplings stay untouched by design: `engine/src/telemetry-claims.js` derives the
  cost FAQ from `runs` only, and the calibration pin ("exactly 4 of the 16") reads
  `runs[].reviewCycles[].billedTurns` only. `runs` is byte-identical after Part 2.
- `README.md:180` already reads "54 design docs"; the plan commit bumps "52 parted plans" to 53.
  Neither part edits README.md.

## Out of scope

- Re-mining or refreshing the baseline, including the parked `.claude/baseline-refresh.pending/`
  artifacts in the main checkout.
- `skills/metrics/SKILL.md` (ADR 499): a re-mined report agrees with its replay by construction.
- Persisting `cacheCreationTtl`, the price table or skip markers so that `model-routing`,
  `cache-hotspot` or `phase-skip` become replayable.
- A byte-format guard (`serializeReport(parse(raw)) === raw`) over the committed file.
- Follow-up: `docs/contributing/specs/telemetry.md:520` says "Four kinds are currently emitted",
  but `phase-skip` is a fifth; not fixed here.

## Part 1 — Replay a report's run-derived recommendations

### Context

**What changes.** `engine/src/observability/usage-aggregate.js` gains a run-derived rule table
that `aggregate` and a new exported query `replayRecommendations(report)` both consume. The
query returns the recommendations the current rules derive from the report's own `runs`:
`review-waste` and `turn-budget` recs are rebuilt from runs that carry the rule's input key;
every other kind is returned verbatim. `aggregate`'s output is byte-identical.

**Files edited.**

- `engine/src/observability/usage-aggregate.js` (shipped 666 lines, ESM, pure: no I/O, no
  clock, no model-id literals).
  - :12 `export const REVIEW_WASTE_BILLED_TURNS = 85;`, :15 `TURN_BUDGET_BILLED_TURNS = 200`.
  - :328 banner `// ── Private: recommendation builders ──…`.
  - :381-395 `function reviewWasteRecs(runs)`: `runs.flatMap(run => run.reviewCycles.filter(rc
    => rc.billedTurns > REVIEW_WASTE_BILLED_TURNS).map(...))`; rec shape `{ kind:
    'review-waste', run: run.run, phase: 'review', model: null, detail, evidence: { role,
    cycles, billedTurns, totalCost, maxCost, meanCost } }`, detail text "role <role> billed
    <n> turns across review".
  - :398-411 `function turnBudgetRecs(runs)`: dereferences `run.phaseTurns.filter` directly, so
    it throws a TypeError on a run without `phaseTurns`; rec shape adds a top-level `role` and
    `evidence.threshold`, `evidence.toolCalls`.
  - :413-419 `function sortedRecs(recs)`: sorts IN PLACE by `kind\0run\0phase\0model` with
    `localeCompare` (stable).
  - Insert the new private block between `turnBudgetRecs` (ends :411) and `sortedRecs` (:413).
  - :569 `export function aggregate(events, priceTable, baselineReport, threshold =
    DEFAULT_DRIFT_THRESHOLD, skipMarkers = [], compactions = [])`; :584-590 the
    `sortedRecs([...])` composition; :587 `...reviewWasteRecs(runs),` and :588
    `...turnBudgetRecs(runs),` become one line. `aggregate`'s runs come from `buildRunData`
    (:262-271) and always carry both `reviewCycles` and `phaseTurns`.
  - :600-602 `export function serializeReport(report)` (`JSON.stringify(sortDeep(report), null,
    2) + '\n'`). Insert `replayRecommendations` between `aggregate`'s closing brace (:598) and
    `serializeReport` (:600), under the existing `// ── Public exports ──` banner (:567).
- `engine/test/usage-aggregate.test.js` (shipped 2030 lines, node:test ESM, 127 tests).
  - :7-18 the named import list from ../src/observability/usage-aggregate.js; add
    `replayRecommendations,` after `computeDrift,` (:12).
  - Fixtures: `PRICE_TABLE` :25 (`model-a` expensive, `model-b` cheap), `makeEvent(overrides)`
    :30 (defaults `run: 'run-1'`, `phase: 'design'`, `role: 'designer'`, `model: 'model-a'`,
    cache-creation ratio 0.33, so no cache-hotspot), `reviewCycleEvents(turnCount, {
    spawnCount = turnCount, ...overrides })` :46 (review-phase reviewer events).
  - Append the new section at the end of the file (after :2030).
  - Tests that must stay green UNEDITED (the refactor's safety net): review-waste detail :748,
    calibration pin :1042 ("exactly 4 of the 16"), phase-skip :1574, turn-budget :1754 and
    :1775.
- `docs/contributing/specs/telemetry.md` (living spec, `subjects:
  ['engine/src/observability/**']`). The paragraph "The default committed baseline snapshot
  lives at …, refreshed on demand as part of a closing chore." sits at :674-675; `## Metrics
  ledger row` is :677. The new `### Committed baseline replay` section goes between them.
  Touching this page in the same commit as the module keeps intention-lint fresh.

**Read-only references.** engine/src/observability/skip-signals.js (`phaseSkipRecs(markers)`
reads `{ run, phase }` markers; rec detail `phase <p> auto-skipped (evaluated unnecessary)`).
The design's § "replayRecommendations" holds the per-rec treatment table this part implements.

**Style.** node:test, Given/When/Then titles, AAA bodies with blank lines between phases,
`const sut = <function>;` in every test, no provenance ids (ADR, DC-n, R-n, T-n, BACKLOG) in
titles, comments or source. Nothing under engine/src may contain the words mutation, mutant or
stryker. Plain-language comments that say why, never what.

### TDD steps

1. **GUARD — `aggregate`'s recommendation order and wording before the refactor.** Append at the
   end of engine/test/usage-aggregate.test.js:
   ~~~js

   // ── replayRecommendations: re-deriving a committed report's recommendations ──

   const REPLAY_SKIP_MARKER = { run: 'run-1', phase: 'documentation' };

   // One run whose events fire review-waste and turn-budget (the rules a replay
   // rebuilds) plus model-routing and phase-skip (the kinds it passes through).
   function replayableEvents() {
     return [
       ...reviewCycleEvents(REVIEW_WASTE_BILLED_TURNS + 1),
       ...reviewCycleEvents(TURN_BUDGET_BILLED_TURNS + 1, { phase: 'implementation', role: 'part-implementer', spawnCount: 3 }),
       makeEvent({ model: 'model-a', tokens: { input: 0, cacheRead: 1000, cacheCreation: 0, output: 5 } }),
       makeEvent({ model: 'model-b', tokens: { input: 0, cacheRead: 1000, cacheCreation: 0, output: 5 } }),
     ];
   }

   test('Given a run firing review-waste, turn-budget, model-routing and phase-skip, when aggregate runs, then the recommendations keep their kind order and detail lines', () => {
     const sut = aggregate;

     const result = sut(replayableEvents(), PRICE_TABLE, undefined, DEFAULT_DRIFT_THRESHOLD, [REPLAY_SKIP_MARKER]);

     assert.deepEqual(result.recommendations.map(rec => [rec.kind, rec.run, rec.phase, rec.detail]), [
       ['model-routing', 'run-1', 'design', 'consider model-b for phase design'],
       ['phase-skip', 'run-1', 'documentation', 'phase documentation auto-skipped (evaluated unnecessary)'],
       ['review-waste', 'run-1', 'review', `role reviewer billed ${REVIEW_WASTE_BILLED_TURNS + 1} turns across review`],
       ['turn-budget', 'run-1', 'implementation', `role part-implementer billed ${TURN_BUDGET_BILLED_TURNS + 1} turns in phase implementation`],
     ]);
   });
   ~~~
   Passes today (shipped `aggregate`, 128/0). It pins the order and wording the step-3
   refactor must keep, and it is the fixture the replay tests below reuse.

2. **RED — the replay is faithful, and a retired detail line is rebuilt.** Add
   `replayRecommendations,` to the import list after `computeDrift,` (:12), then append:
   ~~~js

   const RETIRED_REVIEW_WASTE_DETAIL = 'role reviewer has 6 review cycles';
   const NO_COST = Object.freeze({ priced: null, relative: 0 });

   // The serialized shape a committed report carries, re-parsed so each test owns a fresh copy.
   function replayableReport() {
     const report = aggregate(replayableEvents(), PRICE_TABLE, undefined, DEFAULT_DRIFT_THRESHOLD, [REPLAY_SKIP_MARKER]);
     return JSON.parse(serializeReport(report));
   }

   const committedRec = (kind, run, overrides = {}) => ({
     kind, run, phase: 'review', model: null, detail: `${kind} as committed`, evidence: {}, ...overrides,
   });

   const reviewCycle = (billedTurns) => ({
     role: 'reviewer', cycles: 1, billedTurns, totalCost: NO_COST, maxCost: NO_COST, meanCost: NO_COST,
   });

   const phaseTurn = (billedTurns) => ({
     phase: 'implementation', role: 'part-implementer', cycles: 1, billedTurns, toolCalls: 0,
     totalCost: NO_COST, maxCost: NO_COST, meanCost: NO_COST,
   });

   function deepFreeze(value) {
     if (value === null || typeof value !== 'object') return;
     Object.values(value).forEach(deepFreeze);
     Object.freeze(value);
   }

   test('Given a report produced by aggregate, when replayRecommendations runs, then it returns the report recommendations unchanged', () => {
     const sut = replayRecommendations;
     const report = replayableReport();

     const result = sut(report);

     assert.deepEqual(result, report.recommendations);
   });

   test('Given a committed review-waste rec carrying a retired detail line, when replayRecommendations runs, then the rec comes back rebuilt by the current rule', () => {
     const sut = replayRecommendations;
     const report = replayableReport();
     report.recommendations.find(rec => rec.kind === 'review-waste').detail = RETIRED_REVIEW_WASTE_DETAIL;

     const result = sut(report);

     assert.deepEqual(result, replayableReport().recommendations);
   });
   ~~~
   Fails today: the suite does not load. `node --test engine/test/usage-aggregate.test.js`
   reports 0 pass / 1 fail with `SyntaxError: The requested module
   '../src/observability/usage-aggregate.js' does not provide an export named
   'replayRecommendations'`.

3. **GREEN — the shared rule table, the `aggregate` refactor, a kind-level replay.** In
   engine/src/observability/usage-aggregate.js, insert between `turnBudgetRecs` and
   `sortedRecs`:
   ~~~js
   // Rules whose whole input is persisted on each report run, so a committed report can be
   // re-checked against the current thresholds without the transcripts that produced it.
   const RUN_DERIVED_RULES = Object.freeze([
     Object.freeze({ kind: 'review-waste', input: 'reviewCycles', build: reviewWasteRecs }),
     Object.freeze({ kind: 'turn-budget', input: 'phaseTurns', build: turnBudgetRecs }),
   ]);

   function runDerivedRecs(runs) {
     return RUN_DERIVED_RULES.flatMap(rule => rule.build(runs));
   }

   function isJudgedByReplay(rec) {
     return RUN_DERIVED_RULES.some(rule => rule.kind === rec.kind);
   }

   ~~~
   In `aggregate`, replace `...reviewWasteRecs(runs),` and `...turnBudgetRecs(runs),` with the
   single line `...runDerivedRecs(runs),`. Between `aggregate` and `serializeReport`:
   ~~~js
   export function replayRecommendations(report) {
     return sortedRecs([
       ...report.recommendations.filter(rec => !isJudgedByReplay(rec)),
       ...runDerivedRecs(report.runs),
     ]);
   }

   ~~~
   The two step-2 tests and the step-1 guard pass (130/0).

4. **GUARD — thresholds, orphan runs, pass-through kinds, no mutation.** Append:
   ~~~js

   test('Given committed run-derived recs whose run data sits exactly at each threshold, when replayRecommendations runs, then both recs are dropped', () => {
     const sut = replayRecommendations;
     const report = {
       runs: [{ run: 'run-1', reviewCycles: [reviewCycle(REVIEW_WASTE_BILLED_TURNS)], phaseTurns: [phaseTurn(TURN_BUDGET_BILLED_TURNS)] }],
       recommendations: [committedRec('review-waste', 'run-1'), committedRec('turn-budget', 'run-1', { phase: 'implementation' })],
     };

     const result = sut(report);

     assert.deepEqual(result, []);
   });

   test('Given committed run-derived recs naming a run absent from the report runs, when replayRecommendations runs, then each rec is dropped', () => {
     const sut = replayRecommendations;
     const report = {
       runs: [{ run: 'run-1', reviewCycles: [], phaseTurns: [] }],
       recommendations: [committedRec('review-waste', 'run-gone'), committedRec('turn-budget', 'run-gone', { phase: 'implementation' })],
     };

     const result = sut(report);

     assert.deepEqual(result, []);
   });

   test('Given model-routing, cache-hotspot and phase-skip recs on a present run and on an absent one, when replayRecommendations runs, then each is returned verbatim', () => {
     const sut = replayRecommendations;
     const passThrough = [
       committedRec('cache-hotspot', 'run-1', { model: 'model-a' }),
       committedRec('cache-hotspot', 'run-gone', { model: 'model-a' }),
       committedRec('model-routing', 'run-1', { model: 'model-a' }),
       committedRec('model-routing', 'run-gone', { model: 'model-a' }),
       committedRec('phase-skip', 'run-1'),
       committedRec('phase-skip', 'run-gone'),
     ];
     const report = { runs: [{ run: 'run-1', reviewCycles: [], phaseTurns: [] }], recommendations: passThrough };

     const result = sut(report);

     assert.deepEqual(result, passThrough);
   });

   test('Given a deep-frozen report, when replayRecommendations runs, then it returns a fresh array and leaves the report untouched', () => {
     const sut = replayRecommendations;
     const report = replayableReport();
     deepFreeze(report);

     const result = sut(report);

     assert.notStrictEqual(result, report.recommendations);
     assert.deepEqual(report.recommendations, replayableReport().recommendations);
   });
   ~~~
   All four pass on step 3's code (134/0): every run-derived rec is discarded and rebuilt only
   from runs, so a rec at the threshold or on an absent run is not rebuilt; the other kinds are
   never judged; `sortedRecs` sorts the fresh spread array, never the frozen input. They
   constrain the per-rec GREEN of step 6: it must still drop the absent-run recs and keep
   every non-run-derived rec, including those on an absent run.

5. **RED — a run without a rule's input keeps its rec verbatim.** Append:
   ~~~js

   test('Given committed run-derived recs whose run lacks that rule input, when replayRecommendations runs, then each rec is returned verbatim without throwing', () => {
     const sut = replayRecommendations;
     const reviewWaste = committedRec('review-waste', 'run-2');
     const turnBudget = committedRec('turn-budget', 'run-1', { phase: 'implementation' });
     const report = {
       runs: [{ run: 'run-1', reviewCycles: [] }, { run: 'run-2', phaseTurns: [] }],
       recommendations: [reviewWaste, turnBudget],
     };

     const result = sut(report);

     assert.deepEqual(result, [reviewWaste, turnBudget]);
   });
   ~~~
   Fails on step 3's code: `TypeError: Cannot read properties of undefined (reading
   'filter')` — the builders dereference `run.reviewCycles` / `run.phaseTurns` on a run that
   lacks it. Keep the two runs, each missing a different key, in this order: that layout is
   what makes the run lookup inside `isJudgedByReplay` observable.

6. **GREEN — judge each rec by its run.** Replace step 3's `isJudgedByReplay` with:
   ~~~js
   // A run-derived rec is judged only when its run carries that rule's input; a rec naming a
   // run the report no longer holds is stale, so it is judged too and nothing rebuilds it.
   function isJudgedByReplay(rec, runs) {
     const rule = RUN_DERIVED_RULES.find(candidate => candidate.kind === rec.kind);
     if (rule === undefined) return false;
     const run = runs.find(candidate => candidate.run === rec.run);
     return run === undefined || Array.isArray(run[rule.input]);
   }
   ~~~
   and `replayRecommendations` with:
   ~~~js
   export function replayRecommendations(report) {
     const { runs, recommendations } = report;
     return sortedRecs([
       ...recommendations.filter(rec => !isJudgedByReplay(rec, runs)),
       ...RUN_DERIVED_RULES.flatMap(rule => rule.build(runs.filter(run => Array.isArray(run[rule.input])))),
     ]);
   }
   ~~~
   `runDerivedRecs` stays: `aggregate` uses it. 135/0.

7. **RED — a report missing `runs` or `recommendations`.** Append:
   ~~~js

   test('Given a report with no runs key, when replayRecommendations runs, then a review-waste rec naming no run is dropped and a phase-skip rec is kept', () => {
     const sut = replayRecommendations;
     const runlessReviewWaste = { kind: 'review-waste', phase: 'review', model: null, detail: 'review-waste as committed', evidence: {} };
     const phaseSkip = committedRec('phase-skip', 'run-1');

     const result = sut({ recommendations: [runlessReviewWaste, phaseSkip] });

     assert.deepEqual(result, [phaseSkip]);
   });

   test('Given an empty report and a report with no recommendations key, when replayRecommendations runs, then each returns no recs', () => {
     const sut = replayRecommendations;

     const empty = sut({ runs: [], recommendations: [] });
     const noRecommendations = sut({ runs: [{ run: 'run-1', reviewCycles: [], phaseTurns: [] }] });

     assert.deepEqual(empty, []);
     assert.deepEqual(noRecommendations, []);
   });
   ~~~
   Both fail on step 6's code: the first with `TypeError: … (reading 'find')` (`runs` is
   undefined inside `isJudgedByReplay`), the second with `TypeError: … (reading 'filter')`
   (`recommendations` is undefined). The runless rec is deliberate: with `runs` defaulted to
   any non-empty array it would match an entry whose `run` is also undefined, so it pins the
   default to exactly `[]`.

8. **GREEN — default both keys.** In `replayRecommendations`, replace the destructuring line
   with:
   ~~~js
     const runs = report.runs ?? [];
     const committed = report.recommendations ?? [];
   ~~~
   and filter `committed` instead of `recommendations`. 137/0. Final shape:
   ~~~js
   export function replayRecommendations(report) {
     const runs = report.runs ?? [];
     const committed = report.recommendations ?? [];
     return sortedRecs([
       ...committed.filter(rec => !isJudgedByReplay(rec, runs)),
       ...RUN_DERIVED_RULES.flatMap(rule => rule.build(runs.filter(run => Array.isArray(run[rule.input])))),
     ]);
   }
   ~~~

9. **REFACTOR + spec.** No code refactor is due (every new function is under 10 lines, nesting
   1). In `docs/contributing/specs/telemetry.md`, insert after the "default committed baseline
   snapshot" paragraph (:675), before `## Metrics ledger row`, exactly:
   ~~~~markdown

   ### Committed baseline replay

   `replayRecommendations(report)` (`usage-aggregate.js`) is a pure query: it returns the
   recommendations the current rules derive from a report's own data, without the transcripts that
   produced it. Only the run-derived rules are replayed, because their whole input is persisted on
   each `runs[*]` entry. `aggregate` composes the same rule table, so a new run-level rule cannot
   ship in one and be missing from the other.

   | Kind | Run input |
   |---|---|
   | `review-waste` | `runs[*].reviewCycles` |
   | `turn-budget` | `runs[*].phaseTurns` |

   Each committed recommendation is treated on its own:

   | Committed recommendation | Replay |
   |---|---|
   | any other kind (`cache-hotspot`, `model-routing`, `phase-skip`, unknown) | kept verbatim: its input (cache-creation TTL, price table, skip markers) is not persisted |
   | run-derived kind, its run present without that input key | kept verbatim: no data to judge it |
   | run-derived kind, its run present with that input key | replaced by the recommendations the rule rebuilds |
   | run-derived kind, its run absent from `runs` | dropped as stale |

   The result is sorted like `aggregate`'s, and the input report is never mutated. On a report
   produced by the current `aggregate`, the replay equals `recommendations`, so a re-mined refresh
   agrees by construction.
   ~~~~
   Any wording change must stay clean under the prose-lint ban list (see the Gate).

### Gate

- `node --test engine/test/usage-aggregate.test.js` → 137 pass / 0 fail.
- `npm --prefix engine test` → 0 fail (2859 pass in the prototype).
- `node engine/bin/prose-lint.js --gate blocking -- docs/contributing/specs/telemetry.md` → exit 0.

### Commit

`feat(metrics): replay a report's run-derived recommendations through the current rules`

## Part 2 — Guard the committed baseline with its replay and regenerate it

### Context

**What changes.** A new root guard fails `bash scripts/ci.sh` whenever
`docs/contributing/metrics-baseline.report.json`'s `recommendations` disagree with
`replayRecommendations` of the same report (landed in Part 1). The committed report disagrees
today (15 `review-waste` entries under the retired `cycles > 2` rule against the 4 that
`billedTurns > 85` selects), so this part watches the guard go RED, regenerates the report with
the replay function, and lands guard and report in ONE commit. No red commit may exist.

**Files created / edited.**

- `test/metrics-baseline-replay.test.js` (new, CJS, `'use strict'`). Runs in ci.sh's `process`
  suite (`run_suite process test`, scripts/ci.sh:60) with no wiring;
  test/every-test-file-registers.test.js only requires it to register a test. Load the ESM
  module the way test/memory-store.test.js:13-16 does (`import(pathToFileURL(path.join(ROOT,
  'engine/src/observability/usage-aggregate.js')).href)`).
- `docs/contributing/metrics-baseline.report.json` (shipped: 38 recs = `model-routing` 2,
  `phase-skip` 21, `review-waste` 15; 25 runs, none with `phaseTurns`; 16 review cycles). Never
  hand-edited: only the regeneration command in step 2 writes it. Expected after: 27 recs
  (2 / 21 / 4), the 4 `review-waste` recs on runs `0dc14aa5…` (116), `2c4cd054…` (155),
  `3bb0b485…` (278), `aee6119c…` (112), each `detail` now `role reviewer billed <n> turns
  across review` with byte-identical `evidence`; `runs` byte-identical.
- `docs/contributing/specs/telemetry.md`: Part 1 left a `### Committed baseline replay`
  section ending "… so a re-mined refresh agrees by construction." directly above `## Metrics
  ledger row`. Append the guard paragraph and the command after that sentence.
- `BACKLOG.md`: the entry at :532-540 ("**The committed baseline's `review-waste`
  recommendations are stale against the threshold that produced them.**", under the heading
  "### Open (scoped 2026-08-07 — …)" at :530). Flip it in place to the delivered sibling shape
  used at :180 and :541: bold title ending "— delivered 2026-10-12**", then
  "(chore/baseline-review-waste-replay-guard)." and a one-paragraph outcome ending with a design
  link.

**Read-only references.** test/memory-store.test.js:1-16 (CJS header, dynamic import);
test/readme-drift.test.js:97-130 (two-sided guard pattern: live pass plus a corrupted copy that
fails); engine/test/usage-aggregate.test.js calibration pin (reads `runs` only, stays green);
engine/src/telemetry-claims.js (README cost FAQ derives from `runs` only, stays green). Run
`2ccfd2aa-a0d5-479b-bbf0-b3750ad53982` holds the one cycle under the threshold (`role
reviewer`, `cycles` 2, `billedTurns` 20).

**Style.** As Part 1: Given/When/Then, AAA, `sut`, no provenance ids in titles or comments.

### TDD steps

1. **RED — the live replay row, plus its two GUARD rows.** Create
   test/metrics-baseline-replay.test.js:
   ~~~js
   'use strict';
   const { test } = require('node:test');
   const assert = require('node:assert');
   const fs = require('node:fs');
   const path = require('node:path');
   const { pathToFileURL } = require('node:url');

   const ROOT = path.join(__dirname, '..');
   const REPORT_PATH = path.join(ROOT, 'docs', 'contributing', 'metrics-baseline.report.json');
   const RETIRED_REVIEW_WASTE_DETAIL = 'role reviewer has 6 review cycles';
   const BELOW_THRESHOLD_RUN = '2ccfd2aa-a0d5-479b-bbf0-b3750ad53982';
   const DISAGREEMENT_MESSAGE =
     'docs/contributing/metrics-baseline.report.json recommendations disagree with a replay of its own runs ' +
     'through the current rules; regenerate them with the command in docs/contributing/specs/telemetry.md ' +
     '§ "Committed baseline replay"';

   function importReplay() {
     return import(pathToFileURL(path.join(ROOT, 'engine/src/observability/usage-aggregate.js')).href)
       .then(aggregateModule => aggregateModule.replayRecommendations);
   }

   function readCommittedReport() {
     return JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
   }

   test('Given the committed metrics baseline, when its recommendations are replayed through the current rules, then the replay equals them', async () => {
     const sut = await importReplay();
     const report = readCommittedReport();

     const result = sut(report);

     assert.deepStrictEqual(result, report.recommendations, DISAGREEMENT_MESSAGE);
   });

   test('Given the committed metrics baseline with one review-waste detail reverted to the retired shape, when replayed, then the replay disagrees', async () => {
     const sut = await importReplay();
     const report = readCommittedReport();
     report.recommendations.find(rec => rec.kind === 'review-waste').detail = RETIRED_REVIEW_WASTE_DETAIL;

     const result = sut(report);

     assert.notDeepStrictEqual(result, report.recommendations);
   });

   test('Given the committed metrics baseline plus a review-waste rec for a cycle under the billed-turn threshold, when replayed, then the replay disagrees', async () => {
     const sut = await importReplay();
     const report = readCommittedReport();
     const [cycle] = report.runs.find(run => run.run === BELOW_THRESHOLD_RUN).reviewCycles;
     report.recommendations.push({
       kind: 'review-waste', run: BELOW_THRESHOLD_RUN, phase: 'review', model: null,
       detail: `role ${cycle.role} billed ${cycle.billedTurns} turns across review`,
       evidence: {
         role: cycle.role, cycles: cycle.cycles, billedTurns: cycle.billedTurns,
         totalCost: cycle.totalCost, maxCost: cycle.maxCost, meanCost: cycle.meanCost,
       },
     });

     const result = sut(report);

     assert.notDeepStrictEqual(result, report.recommendations);
   });
   ~~~
   Run `node --test test/metrics-baseline-replay.test.js > <tmp>/guard.log 2>&1` and read back
   only the summary (`grep "^# \(pass\|fail\)\|^not ok"`). Expected: 2 pass / 1 fail. The
   live row is RED: the replay returns 4 `review-waste` recs (`role reviewer billed <n> turns
   across review`) against the 15 committed ones (`role reviewer has <n> review cycles`), and
   the failure prints `DISAGREEMENT_MESSAGE`. The two disagreement rows are GUARD entries here:
   they pass because the stale file already disagrees with its replay. After step 2 they are
   what proves the live row is not vacuous (a rule-change edit and a stale-selection edit each
   still turn it red). Do NOT commit at this point.

2. **GREEN — regenerate the report with the replay function.** From the worktree root, run
   this one-off (not committed anywhere):
   ~~~sh
   node --input-type=module -e "
   import { readFileSync, writeFileSync } from 'node:fs';
   import { replayRecommendations, serializeReport } from './engine/src/observability/usage-aggregate.js';
   const p = 'docs/contributing/metrics-baseline.report.json';
   const r = JSON.parse(readFileSync(p, 'utf8'));
   writeFileSync(p, serializeReport({ ...r, recommendations: replayRecommendations(r) }));"
   ~~~
   Then check, without reading the whole diff:
   - `git diff --no-ext-diff --stat -- docs/contributing/metrics-baseline.report.json` →
     `1 file changed, 4 insertions(+), 268 deletions(-)`.
   - `git diff --no-ext-diff -U0 -- docs/contributing/metrics-baseline.report.json | grep '^@@'`
     → two hunks, `@@ -314,73 +314 @@` and `@@ -408,192 +335,0 @@`: both sit above the
     `"runs": [` line (`grep -n '"runs"'` on the regenerated file → 338; 602 before), so the
     change is confined to `recommendations`.
   - `node --test test/metrics-baseline-replay.test.js` → 3 pass / 0 fail.
   If the stat differs, stop and hand back with the observed stat: never hand-edit the report.

3. **Docs — the guard paragraph and the command.** In `docs/contributing/specs/telemetry.md`,
   after the sentence ending "so a re-mined refresh agrees by construction." append:
   ~~~~markdown

   `test/metrics-baseline-replay.test.js` fails `bash scripts/ci.sh` when the committed baseline's
   `recommendations` disagree with their replay — the case a threshold change without a re-mine
   produces. Regenerate them from the repo root; only `recommendations` changes:

   ```sh
   node --input-type=module -e "
   import { readFileSync, writeFileSync } from 'node:fs';
   import { replayRecommendations, serializeReport } from './engine/src/observability/usage-aggregate.js';
   const p = 'docs/contributing/metrics-baseline.report.json';
   const r = JSON.parse(readFileSync(p, 'utf8'));
   writeFileSync(p, serializeReport({ ...r, recommendations: replayRecommendations(r) }));"
   ```
   ~~~~

4. **Docs — flip the BACKLOG entry.** Replace the whole entry at BACKLOG.md:532-540 with:
   ~~~~markdown
   **The committed baseline's `review-waste` recommendations are stale against the threshold that
   produced them — delivered 2026-10-12** (chore/baseline-review-waste-replay-guard).
   `replayRecommendations` in `engine/src/observability/usage-aggregate.js` re-derives a report's
   run-derived recommendations (`review-waste`, `turn-budget`) from its own `runs` through the
   current rules, and passes every other kind through verbatim. The new root guard
   `test/metrics-baseline-replay.test.js` fails `bash scripts/ci.sh` when the committed baseline
   disagrees with that replay. The committed report was regenerated by the same function, with no
   re-mine: its 15 `review-waste` entries became the 4 that `billedTurns > 85` selects, and `runs`
   is byte-identical, so the README cost claims and the calibration pin are unchanged. The
   regeneration command lives in `docs/contributing/specs/telemetry.md` § "Committed baseline
   replay". Design:
   [baseline-review-waste-replay-guard](docs/contributing/design/baseline-review-waste-replay-guard.md).
   ~~~~
   Leave the "### Open (scoped 2026-08-07 — …)" heading above it as is (delivered siblings keep
   their headings).

5. **Gate, then ONE commit** of exactly the four files above (test, report, spec, BACKLOG).

### Gate

- `node --test test/metrics-baseline-replay.test.js` → 3 pass / 0 fail.
- `bash scripts/ci.sh > <tmp>/ci.log 2>&1; echo $?` → `0`; read back only `grep -n "^# fail\|^not
  ok" <tmp>/ci.log`. The readme-drift live-tree row, the calibration pin and backlog-lint must
  be green with no edits of their own.
- `node engine/bin/prose-lint.js --gate blocking -- docs/contributing/specs/telemetry.md
  BACKLOG.md` → exit 0.

### Commit

`chore(metrics): guard the committed baseline with its replay and regenerate its review-waste recs`
