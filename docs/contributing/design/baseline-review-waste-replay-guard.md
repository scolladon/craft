# Design — baseline-review-waste-replay-guard

> Brief (BACKLOG.md, Open "scoped 2026-08-07"): the committed baseline's `review-waste`
> recommendations are stale against the threshold that produced them. Add a guard that fails when
> a committed report's recommendations disagree with a replay of that report's own data through
> the current rules, and bring the committed report into agreement.
> Status: draft → self-reviewed ×3

Every fact below was re-checked in the worktree at `9d24b64` (node v22.22.3, git 2.56.0, darwin).
State-mutating probes ran in mktemp throwaways, shown as `<tmp>`. The probes re-implement the
private rule builders line for line, because the builders are not exported. They are pins, not
shipped code.

## Context

### The committed report

`docs/contributing/metrics-baseline.report.json`:

- Top keys are `recommendations` (38), `runs` (25) and `schemaVersion` (1).
- `recommendations` by kind: `model-routing` 2, `phase-skip` 21, `review-waste` 15. There are no
  `turn-budget` or `cache-hotspot` entries.
- Every `runs[]` entry has exactly the keys `groups, reviewCycles, run, slug`. **No run carries
  `phaseTurns`**, so the report predates the turn-budget rule.
- `runs.flatMap(r => r.reviewCycles)` holds 16 cycles. Each is
  `{billedTurns, cycles, maxCost, meanCost, role, totalCost}`, with billed turns
  `116 155 20 278 35 30 58 112 65 30 36 35 53 43 38 59`.
- Report groups carry `cacheEfficiency, cost, durationMs, messages, model, phase, role, tokens`.
  They do **not** carry `cacheCreationTtl` or `pricedCreationCost`, and the report does not record
  which price table produced `cost.priced`.
- Format: `serializeReport(JSON.parse(raw)) === raw` is `true` (2-space indent, deep-sorted keys,
  trailing newline). The committed `recommendations` order equals `sortedRecs` order (`true`).
- The 15 `review-waste` entries use the retired shape `detail: "role reviewer has N review
  cycles"`, selected by `cycles > 2` (15 of 16 cycles).

### The rules (`engine/src/observability/usage-aggregate.js`)

| Kind | Builder | Input | Input in the report? |
|---|---|---|---|
| `review-waste` | `reviewWasteRecs(runs)` :381 | `run.run`, `run.reviewCycles[]`, `REVIEW_WASTE_BILLED_TURNS = 85` (:12) | **yes, complete** |
| `turn-budget` | `turnBudgetRecs(runs)` :398 | `run.run`, `run.phaseTurns[]`, `TURN_BUDGET_BILLED_TURNS = 200` | only in reports mined after `phaseTurns` shipped; **absent from the committed one** |
| `cache-hotspot` | `cacheHotspotRecs(enrichedGroups)` :330 | enriched groups: `pricedCreationCost`, which comes from `cacheCreationTtl` and the price table | **no** (TTL and price table not persisted) |
| `model-routing` | `modelRoutingRecs(enrichedGroups, priceTable)` :365 | enriched groups plus `cacheCreationTtl` plus the price table | **no** (same) |
| `phase-skip` | `phaseSkipRecs(markers)` in `skip-signals.js` | auto-skip markers | **no**. The rec is its own evidence. |

- `aggregate(events, priceTable, baselineReport, threshold, skipMarkers, compactions)` (:569)
  composes all five into `sortedRecs([...])`. `reviewWasteRecs` and `turnBudgetRecs` already take
  `runs` (the report-shaped run objects that `buildRunData` returns), so they run unchanged on a
  parsed report's `runs`.
- `turnBudgetRecs` dereferences `run.phaseTurns.filter` directly. On the committed report it throws
  a `TypeError`, because no run has `phaseTurns`.
- `sortedRecs(recs)` sorts in place by `kind\0run\0phase\0model`. `serializeReport(report)` is
  `JSON.stringify(sortDeep(report), null, 2) + '\n'`.

### Pinned replay matrix (committed report, current rules)

| Kind | Committed | Replay from report data | Faithful? |
|---|---|---|---|
| `review-waste` | 15 (`cycles > 2`) | **4**: `0dc14aa5`:116, `2c4cd054`:155, `3bb0b485`:278, `aee6119c`:112 | yes, because `reviewWasteRecs` reads only `reviewCycles` |
| `turn-budget` | 0 | not computable (no `phaseTurns`) | n/a |
| `model-routing` | 2 | 4, with `0dfda430` projected `9.59` against the committed `10.27`, plus two **same-model** recs (`claude-opus-5 → claude-opus-5`) | **no** |
| `cache-hotspot` | 0 | 0 (no group has `cacheEfficiency ≥ 0.5`) | coincidental: `pricedCreationCost` needs TTL |
| `phase-skip` | 21 | not computable (markers not persisted) | n/a |

Why model-routing is unfaithful: recomputing `cost.priced` from report `tokens` with TTL unknown
(5m pricing) disagrees with the stored value on **25 of 110** priced groups. The 1h-TTL share is
lost. A same-model rec can never come from `aggregate`, because projecting the expensive group's
true TTL tokens at its own price equals its cost, so `projected >= cost` and the rec drops. It shows
up in the replay only because the TTL was dropped.

### Fixing by replay (pinned in `<tmp>`)

`serializeReport({ ...report, recommendations: sortedRecs([...nonReviewWaste, ...reviewWasteRecs(report.runs)]) })`
against the committed file gives:

- `4 insertions(+), 268 deletions(-)`. The hunks sit only inside `recommendations`: the 11
  dropped entries, plus the 4 kept entries whose `detail` line becomes
  `"role reviewer billed <n> turns across review"`. Their `evidence` is byte-identical.
- `runs` byte-identical: `true`. New counts: `model-routing` 2, `phase-skip` 21, `review-waste` 4.
- With the fixed file in a `git archive HEAD` copy: `bash scripts/readme-drift.sh` exits 0;
  `engine` `node --test test/usage-aggregate.test.js test/readme-drift-main.test.js
  test/readme-drift.bin.test.js test/tune-plan.test.js` gives 203/203 pass, the calibration pin
  ("exactly 4 of the 16") included; `node --test test/readme-drift.test.js` gives 4/4 pass.

### Couplings that must stay untouched

- README cost FAQ (`README.md:180`, `:238`, "25 runs"): `engine/src/telemetry-claims.js` derives it
  from `runs` only, and `runs` does not change.
- Calibration pin in `engine/test/usage-aggregate.test.js` ("exactly 4 of the 16 fire …"): it reads
  `runs[].reviewCycles[].billedTurns` only.
- `engine/src/tune-plan.js:154` reads `review-waste` recs as advisory text from `evidence.role` and
  `evidence.billedTurns`. No test feeds it the committed file.
- No file pins the old detail string or the count 15. `BACKLOG.md:533` is the entry itself.

### Re-mine is not needed and is destructive

The orchestrator measured that a re-mine finds about 5 runs against the committed 25, because
transcript retention purged the rest (not re-run here: it reads the live transcript store). That
would change the FAQ claims and break the calibration pin. Parked artifacts from an earlier refresh
attempt sit in the main checkout's `.claude/baseline-refresh.pending/` (gitignored): a 5-run report,
a README, and a calibration patch that freezes the 16 billed-turn counts into the test. They are
not touched here. A future refresh made by the current `aggregate` would pass the new guard by
construction, because it uses the same builders (see DC-4).

### House patterns

- Tests over committed files: `test/*.test.js`, CJS, run by `run_suite process test` in
  `scripts/ci.sh`. ESM engine modules are loaded with `import(pathToFileURL(...).href)`
  (`test/memory-store.test.js:13-16`). Guards are two-sided: a live-tree pass plus a corrupted
  copy that fails (`test/readme-drift.test.js:97-130`, `test/architecture-boundaries.test.js`
  header).
- Engine unit suite: `engine/test/usage-aggregate.test.js` (node:test, Given/When/Then titles,
  AAA, `sut`). Fixtures: `makeEvent` :30, `reviewCycleEvents(turnCount, {spawnCount, ...})` :46,
  `PRICE_TABLE` :25.
- `engine/src/**` is in Stryker scope. Per-hunk runs use ONE combined `--mutate` (`.claude/workflow.md`
  "Per-hunk mutation scope").
- `docs/contributing/specs/telemetry.md` has `subjects: ['engine/src/observability/**']`. Any change
  to `usage-aggregate.js` without touching that page is an `INTENTION-DRIFT` stale row
  (`engine/src/intention.js` `assertFresh`).
- `README.md:179` claims "53 design docs". This doc makes it 54, and the readme-drift corpus-count
  sub-guard (live-tree test `test/readme-drift.test.js:97`) needs the bump in the same commit.

## Requirements

- R1. A pure query `replayRecommendations(report)` returns the recommendations the current rules
  derive from the report's own data. For every kind whose input the report does not carry, the
  committed entries come back verbatim.
- R2. Replay is faithful: on a report produced by `aggregate`, `replayRecommendations(report)`
  deep-equals `report.recommendations`.
- R3. A guard over `docs/contributing/metrics-baseline.report.json` fails `bash scripts/ci.sh` when
  its `recommendations` disagree with `replayRecommendations` of itself. Its message names the
  regeneration procedure.
- R4. The committed report agrees, and the fix is produced by `replayRecommendations` plus
  `serializeReport`, not by hand. The diff is confined to `recommendations`, and `runs` stays
  byte-identical.
- R5. No re-mine. README claims, the calibration pin, and every other reader of the file stay green
  without edits.
- R6. A rec of a replayable kind that names a run absent from `runs` is stale: the replay drops
  it and the guard fails.
- R7. `telemetry.md` documents the replay contract in the same change as the code. The BACKLOG
  entry is flipped to delivered.

## Design

### `replayRecommendations(report)`, in `usage-aggregate.js` (DC-3, DC-4)

One table names the run-derived rules and the run key each one reads. `aggregate` and the replay
both consume it, so a future run-level rule cannot ship in `aggregate` and be missing from the
replay:

```js
// Rules whose whole input is persisted on each report run, so a committed report can be
// re-checked against the current thresholds without the transcripts that produced it.
const RUN_DERIVED_RULES = Object.freeze([
  Object.freeze({ kind: 'review-waste', input: 'reviewCycles', build: reviewWasteRecs }),
  Object.freeze({ kind: 'turn-budget', input: 'phaseTurns', build: turnBudgetRecs }),
]);

function runDerivedRecs(runs) {
  return RUN_DERIVED_RULES.flatMap(rule => rule.build(runs));
}
```

`aggregate`'s two spread lines `...reviewWasteRecs(runs), ...turnBudgetRecs(runs)` become
`...runDerivedRecs(runs)`. The output is byte-identical, because `sortedRecs` re-sorts and
`aggregate`'s runs always carry both keys.

```js
export function replayRecommendations(report) {
  const runs = report.runs ?? [];
  const committed = report.recommendations ?? [];
  return sortedRecs([
    ...committed.filter(rec => !isJudgedByReplay(rec, runs)),
    ...RUN_DERIVED_RULES.flatMap(rule => rule.build(runs.filter(run => Array.isArray(run[rule.input])))),
  ]);
}
```

`isJudgedByReplay(rec, runs)` decides per rec (DC-3 (a)). It returns `true` for the rows marked
replaced or dropped:

| Rec | Treatment |
|---|---|
| kind not in `RUN_DERIVED_RULES` (`phase-skip`, `model-routing`, `cache-hotspot`, unknown) | kept verbatim |
| run-derived kind, and its run is in `runs` **without** the input key | kept verbatim: no data to judge it |
| run-derived kind, and its run is in `runs` **with** the input key | replaced by the rebuilt recs |
| run-derived kind, and its run is **not** in `runs` | dropped (R6) |

Behaviour on the committed report: the 15 `review-waste` entries are replaced by 4 rebuilt ones;
`turn-budget` replays over zero runs and keeps zero entries; the 23 others pass through. The
function is a query: it never mutates `report`, and `sortedRecs` sorts a fresh array. Order
matches `aggregate`'s on ties too: `Array.prototype.sort` is stable, rebuilt recs come from the
same builders over the same run order, and pass-through recs keep their committed relative order. An empty
report (`runs: []`, `recommendations: []`) returns `[]`.

### The guard: `test/metrics-baseline-replay.test.js` (DC-5)

A CJS root test that loads the module with `import(pathToFileURL(...).href)`:

- Live: parse the committed file, then
  `assert.deepStrictEqual(sut(report), report.recommendations, msg)`. The message names
  `docs/contributing/specs/telemetry.md` § "Committed baseline replay" for the regeneration command.
- Two-sided: the same file with one `review-waste` entry restored to the retired shape (its
  `detail` changed back to `"role reviewer has 6 review cycles"`) must disagree. That is the
  rule-change case. A copy with a fabricated `review-waste` entry for a cycle under the threshold
  (`billedTurns` 20) must also disagree. That is the stale-selection case. Both are in-memory
  edits; no file is written.

`deepStrictEqual` on parsed objects ignores key order, so the guard judges content, and the
serialization format stays `serializeReport`'s job.

### Bringing the committed report into agreement (DC-6)

The implementing part writes the guard first and sees it RED (15 committed against 4 replayed).
It then regenerates with a throwaway command, run from the repo root and not committed:

```sh
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
import { replayRecommendations, serializeReport } from './engine/src/observability/usage-aggregate.js';
const p = 'docs/contributing/metrics-baseline.report.json';
const r = JSON.parse(readFileSync(p, 'utf8'));
writeFileSync(p, serializeReport({ ...r, recommendations: replayRecommendations(r) }));"
```

Expected diff: `4 insertions(+), 268 deletions(-)`, all inside `recommendations`. The guard and
the fix share one source, so they cannot disagree.

### Docs (DC-7)

- `docs/contributing/specs/telemetry.md`: a new `### Committed baseline replay` section after the
  "default committed baseline snapshot" paragraph (:674-675). It records the kind/input table
  above, the per-rec treatment table, the guard path, and the regeneration command. One sentence
  says that a refresh produced by the current `aggregate` agrees by construction. This touches the
  living spec in the same change as its subject.
- `BACKLOG.md:532-540`: flip in place to the sibling shape
  "**… — delivered 2026-MM-DD** (chore/baseline-review-waste-replay-guard)." with a one-paragraph
  outcome and a design link.
- `README.md:179`: "53 design docs" becomes "54" (this commit, so the corpus-count guard stays
  green). The plan doc's own "parted plans" bump belongs to the plan commit.
- `skills/metrics/SKILL.md`: untouched. Its re-mine procedure stays correct, because a re-mined
  report agrees by construction. Touching `skills/` would also fire integrate's drift-baseline
  refresh offer (`skills/integrate/SKILL.md:42-47`), and the refresh it offers is the destructive
  re-mine.

### Suggested parts

1. Engine: `RUN_DERIVED_RULES`, `runDerivedRecs` and `replayRecommendations` in `usage-aggregate.js`,
   their unit tests, and the `telemetry.md` section. Gate: `npm --prefix engine test`, plus a
   per-hunk Stryker run on the new hunks.
2. Guard and fix: `test/metrics-baseline-replay.test.js` (RED on the committed file), the
   regenerated committed report (GREEN), and the BACKLOG flip. Gate: `bash scripts/ci.sh`. The test
   and the regenerated report land in one commit, so no red commit exists.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Regenerate first, or replay from the report? (user's challenge to "prerequisite") | (a) **Replay from the report**: the guard and the fix both come from `replayRecommendations` over the committed `runs`; no re-mine. (b) **Re-mine first** (the parked refresh), then add the guard. (c) Replay fix now, and schedule the parked refresh as its own later run. | (a) | The data supports it. All 16 `reviewCycles` with `billedTurns` are in the report, so the replay gives exactly the 4 the current rule selects, `runs` stays byte-identical, and every coupled check passed in `<tmp>` (readme-drift exit 0, 203/203 engine, 4/4 root). The entry's "prerequisite" holds only for a guard that re-mines. (b) is destructive (about 25 → 5 runs, the FAQ claims change, the calibration pin breaks), for no gain on this entry. (c) is (a) plus a follow-up nobody asked for; a later refresh would pass the guard by construction anyway. |
| DC-2 | Which kinds does the replay judge? | (a) `review-waste` only. (b) **Every run-derived kind** (`review-waste`, `turn-budget`): the kinds whose whole input is persisted on report runs. (c) All kinds, with `model-routing`/`cache-hotspot` rebuilt from report groups and `DEFAULT_PRICES`. | (b) | Pinned: (c) is unfaithful. It gives 4 `model-routing` against 2, a different projected cost (9.59 vs 10.27), and two impossible same-model recs; 25/110 groups do not reproduce `cost.priced` without `cacheCreationTtl`; the price table is not persisted. A guard on (c) would be red on a correct report. `turn-budget` costs one table row and covers the next threshold change in reports that carry `phaseTurns`. (a) leaves `turn-budget` unguarded once a refresh brings `phaseTurns` in. |
| DC-3 | How is a run-derived rec treated when its run lacks the input key? | (a) **Per-rec**: kept verbatim when its run exists without the key; dropped when its run is absent from `runs`. (b) Per kind: replay a kind only if every run carries its key, else pass the whole kind through. (c) Fail. | (a) | (c) is red today on the committed report (0/25 runs have `phaseTurns`), and the only way to green is the destructive re-mine. (a) and (b) agree on single-pass reports; (a) also judges a mixed report run by run, and catches orphan recs (R6) instead of passing them. Cost of (a): about four more lines than (b). |
| DC-4 | Where does the replay live, and does `aggregate` share it? | (a) **`replayRecommendations` in `usage-aggregate.js`, plus a `RUN_DERIVED_RULES` table that `aggregate` also consumes.** (b) The same function, calling the two builders directly; `aggregate` untouched. (c) A new module `engine/src/observability/report-replay.js`. | (a) | The builders are private to `usage-aggregate.js`, so (c) means exporting them and widening the pure core's surface. (b) works today but lets a third run-derived rule ship in `aggregate` and be missing from the replay, which leaves the guard quietly incomplete, the same failure mode as this entry. (a) changes `aggregate` by one line, with byte-identical output. |
| DC-5 | Where does the guard run? | (a) **Root test `test/metrics-baseline-replay.test.js`** in ci.sh's `process` suite. (b) An engine test beside the calibration pin in `engine/test/usage-aggregate.test.js`. (c) A bin `engine/bin/baseline-replay.js` plus a `scripts/static-lints.sh` line. | (a) | House convention: checks over committed files live in `test/` (readme-drift, source-hygiene, architecture-boundaries); the engine suite unit-tests pure code. It goes red under `bash scripts/ci.sh` with no new bin or wiring. (b) works, and the calibration pin is a precedent, but it mixes a repo-state guard into a mutation-scoped unit suite. (c) adds a bin, a `-main` module and its tests, for a check with no CLI user. |
| DC-6 | How is the committed report brought into agreement? | (a) **Generated**: a throwaway one-off runs `replayRecommendations` plus `serializeReport`; the command is documented in `telemetry.md`. (b) A committed `--write` mode on a bin. (c) Hand-edit the 15 entries. | (a) | One source for guard and fix. The pinned diff is confined to `recommendations` (+4/−268). (b) is only needed if regeneration becomes frequent, and it is needed only on a rule change without a re-mine. (c) is how a hand-made report drifts from the code, the defect being fixed. |
| DC-7 | Which docs change? | (a) **`telemetry.md` replay section, the BACKLOG flip, and the README design count**; `skills/metrics/SKILL.md` untouched. (b) (a) plus a "rule change without re-mine" step in `skills/metrics/SKILL.md`. | (a) | `telemetry.md` is the living spec for the module that changes, and it must be touched anyway (assert-fresh). The SKILL's re-mine procedure stays correct. Editing `skills/` makes integrate offer the destructive refresh (`skills/integrate/SKILL.md:42-47`). The guard's message points contributors at the spec. |

## Test strategy

TDD per part: write each test RED first and confirm it fails for the stated reason. Titles use
Given/When/Then, bodies use AAA, and the unit under test is bound to `sut`. No provenance keys
(DC-n, R-n, BACKLOG lines) go in test or source text.

**Part 1, `engine/test/usage-aggregate.test.js`** (`sut = replayRecommendations`). Until the export
exists, every test is RED on `replayRecommendations is not a function`.

- T1: Given a report produced by `aggregate` with a review-waste rec, a turn-budget rec, a
  model-routing rec and a phase-skip rec (built from `reviewCycleEvents`, `PRICE_TABLE`, and one
  `{ run, phase }` skip marker, the shape `phaseSkipRecs` reads), when replayed, then the result deep-equals `report.recommendations` (R2, faithful).
- T2: Given that report with its review-waste rec's `detail` rewritten to the retired
  `"role reviewer has N review cycles"`, when replayed, then the rec comes back with the current
  `detail`.
- T3: Given a run whose `reviewCycles` holds one cycle at `REVIEW_WASTE_BILLED_TURNS` and a
  committed review-waste rec for it, when replayed, then no review-waste rec remains (strict `>`).
- T4: Given runs without `phaseTurns` and a committed turn-budget rec on one of them, when
  replayed, then the turn-budget rec is returned verbatim and no `TypeError` is thrown.
- T5: Given a committed review-waste rec whose `run` is absent from `runs`, when replayed, then
  it is dropped.
- T6: Given model-routing, cache-hotspot and phase-skip recs whose evidence the runs contradict,
  when replayed, then each is returned verbatim.
- T7: Given `{ runs: [], recommendations: [] }`, and separately a report with no
  `recommendations` key, when replayed, then the result is `[]`.
- T8: Given a frozen report (`Object.freeze` deep on `recommendations`), when replayed, then no
  throw and the input array is unchanged (query, no mutation).
- Parity for `aggregate`: the existing review-waste and turn-budget tests stay green unchanged.
  That is the refactor's safety net, so none is rewritten.
- Mutation: one combined `--mutate "engine/src/observability/usage-aggregate.js:<hunks>"` run.
  A surviving mutant in `isJudgedByReplay` gets a test, not an exemption.

**Part 2, `test/metrics-baseline-replay.test.js`** (`sut = replayRecommendations` from a dynamic
import).

- T9: Given the committed baseline report, when replayed, then the result deep-equals its
  `recommendations`. RED on the current file: 15 committed review-waste entries against 4
  replayed. GREEN after the regeneration command.
- T10: Given the committed report with one review-waste `detail` reverted to the retired shape,
  when replayed, then it disagrees with the committed recs (the guard cannot pass vacuously).
- T11: Given the committed report plus a fabricated review-waste rec for the 20-billed-turn cycle
  (run `2ccfd2aa-a0d5-479b-bbf0-b3750ad53982`, 2 cycles), when replayed, then it disagrees.
- Gate: `bash scripts/ci.sh` (the `process` suite runs T9-T11; readme-drift live-tree and the
  calibration pin must stay green with no edits). Check the committed diff:
  `git diff --no-index --no-ext-diff --stat` shape `+4/−268`, every hunk inside `recommendations`.

## Out of scope

- Re-mining or refreshing the baseline, including the parked `.claude/baseline-refresh.pending/`
  artifacts.
- Persisting `cacheCreationTtl` or the price table in report groups so that `model-routing` and
  `cache-hotspot` become replayable. That is a schema change.
- Persisting skip markers so that `phase-skip` becomes replayable.
- A byte-format guard (`serializeReport(parse(raw)) === raw`) over the committed file. It holds
  today (`true`), and nothing asked for it.
- `docs/contributing/specs/telemetry.md:520` says "Four kinds are currently emitted", but
  `phase-skip` is a fifth (21 entries in the committed report; `grep -c phase-skip` on the spec
  gives 0). This is a proven spec gap and is not fixed here.
