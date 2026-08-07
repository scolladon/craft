# Design — harness hygiene follow-ups

> Brief: close the four follow-ups left open by commit `5bdbf5a` — recalibrate the
> review-waste threshold, make the pi CLI test hermetic instead of accidentally green,
> decide whether craft dogfoods its own `architecture` phase, and repair a memory store
> that has been unreadable — and primed to erase itself — since `1f7e76f`.
> Status: draft → self-reviewed ×3 → accepted

## Context

The four items share one theme, and it is worth naming: **craft's harness lies to us about
its own state.** Each item is a different dialect of the same lie.

| # | The lie | The mechanism |
|---|---|---|
| 1 | *"Your reviews are wasteful."* | A threshold that fires on 15 of 16 reviews carries no information. |
| 2 | *"The pi CLI test passes."* | It passes because the CI runner has no `pi` binary, not because the code is right. |
| 3 | *"Architecture boundaries: N/A."* | `docs/contributing/DOD.md` records the gap honestly, and nothing has ever checked it. |
| 4 | *"67 learnings are on file."* | The committed file shows 67 entries; `load()` has returned `{ loadNote: 'malformed store' }` and an empty view to every run since `1f7e76f`. |

All four are self-observation defects, not user-facing ones — which is exactly why they
survived. Nothing downstream fails when a recommendation over-fires, when a test is green
for the wrong reason, when a default-off phase stays off, or when an advisory store reads
empty. The advisory-only postures that make craft safe (ADR-116 memory load no-op,
ADR-120 save-is-a-warning, ADR-147 auto-skipped harness releases the propose gate) are
also what let these rot silently.

### Item 1 — the review-waste threshold predates its own input

`engine/src/observability/usage-aggregate.js`:

- L11 `export const REVIEW_WASTE_CYCLES = 2;`
- L302 `function reviewWasteRecs(runs)` filters `rc.cycles > REVIEW_WASTE_CYCLES` and emits
  `{ kind: 'review-waste', run, phase: 'review', model: null, detail, evidence }` where
  `detail` is `` `role ${rc.role} has ${rc.cycles} review cycles` `` and `evidence` is
  `{ role, cycles, billedTurns, totalCost, maxCost, meanCost }`.

`cycles` used to mean billed turns. Commit `5bdbf5a` redefined it as **distinct sub-agent
spawns** (`new Set(events.map(e => e.spawnId)).size`, `docs/contributing/specs/telemetry.md`
§reviewCycles) and kept the old per-turn count beside it as `billedTurns`. The threshold
never moved.

Downstream consumers of the emitted shape:

- `engine/src/tune-plan.js` L98-100 — `advisoryProposal('review-waste', …)` renders
  `` `${rec.evidence?.role ?? 'reviewer'} burned ${rec.evidence?.cycles ?? '?'} review cycles — consider a cheaper reviewer tier` ``.
- `engine/src/observability/usage-aggregate.js` L518-522 — `renderMarkdown` prints
  `rec.kind` and `rec.detail` verbatim.
- `docs/contributing/specs/telemetry.md` L461-482 — the documented `review-waste` example.

### Item 2 — the pi CLI test is green by accident of machine inventory

`adapters/pi/test/cli.test.js` L12-14:

```js
function runCli(...args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' });
}
```

`CLI_PATH` is `adapters/pi/src/cli.js`, which calls `main()` in `adapters/pi/src/run.js`,
which walks the pipeline and reaches `spawnPi` (L100-108) at the first worker phase. The
three tests in the `cli.js — subprocess execution guard` describe block (L51-85) assert
exit 2 with the comment at L47: *"The pi binary is not installed in CI so main() always
exits 2"*. On a developer machine with `pi` installed, `bash scripts/ci.sh` hangs.

`adapters/pi/test/cli.test.js:13` is the **only** adapter test whose subprocess transitively
spawns a real agent binary; the `craft-guard-hook` tests in `adapters/{antigravity,codex,cursor}`
spawn `node` against a hook script that reads stdin and exits, and
`adapters/pi/test/craft-root.test.js:79` runs `bash -c echo`. The brief's single-site claim
holds.

### Item 3 — the `architecture` phase has never run, and the DoD says so

`pipeline/default.yml` L125-139 ships `architecture` with `enabled: false`,
`harness: { techniques: [] }`, `gate: <arch gate>`, `role: craft:harness-triager`,
`model: opus`. `skills/architecture/SKILL.md` **does** exist (2743 bytes) — the original
brief's claim that it does not is wrong — so enabling the phase would not hit the
"procedure resolves to no installed skill" STOP.

`docs/contributing/DOD.md` L72-76 carries the consequence as a standing criterion:

> - [ ] N/A — the `architecture` phase ships `enabled: false` in `pipeline/default.yml` for
>   this repo; the architecture boundary check did not run. The gap is stated here honestly
>   and not claimed as verified. `architecture-gap-honest`

ADR-108 pre-describes the exit: *"When the `architecture` phase is enabled and green, that
gate is the mechanical evidence for the criterion."* ADR-050 pins `<arch gate>` to
"dependency-cruiser exits 0 over the scope" — written 2026-06-18, before ADR-149
de-specialized harness techniques into repo-declared `harness.techniques` entries.

Repo facts constraining the technique choice:

- No dependency-cruiser / madge / eslint anywhere. `engine/package.json` carries one
  dependency (`js-yaml`) and two devDependencies. There is no root `package.json`.
- `test/source-hygiene.test.js` and `test/hermetic-suite.test.js` already express
  repo-wide structural rules as plain Node test files over source text — zero dependencies,
  and `test/source-hygiene.test.js` already implements ADR-050's "exceptions in the tool's
  own rule config, with one line of why" as commented `allowlistFilters` regexes.
- `test/source-hygiene.test.js` L26 bans the literal tokens `dependency-cruiser|depcruise`
  from `engine/src`, `skills`, `agents`, `contracts`, `templates`, `pipeline`,
  `docs/contributing/specs`, `docs/contributing/DOD.md`, `docs/guides/customizing.md` and
  `README.md`. `.claude/` is not scanned, so a tool name may live in the consumer manifest
  (as `stryker` already does).

The layering that exists today, verified by dumping every `import … from` edge under
`engine/src/observability/`:

| Module | Imports |
|---|---|
| `usage-aggregate.js` (pure core) | `./skip-signals.js` only |
| `adapters/claude/telemetry.js` | `../../skip-signals.js`, `../../role-phase.js` |
| `adapters/opencode/telemetry.js` | `../../role-phase.js` |
| `adapters/claude/metrics-split.js` | `./telemetry.js` (intra-adapter) |
| `adapters/{aider,codex,copilot,cursor,pi}/telemetry.js` | nothing |
| `usage-mine-main.js` (composition root) | seven adapter modules at L45-51 and `./adapters/claude/pricing.js` at L53, plus `./usage-aggregate.js` at L52 |
| `memory.js` | `node:path`, `js-yaml`, `../frontmatter.js`, `../contain.js` |

`usage-aggregate.js`'s own header states the invariant in prose — *"No clock, no random,
no model-id literals, no runtime paths"* — with nothing enforcing it. Commit `5bdbf5a` is
exactly the change shape a boundary rule would police: it added
`engine/src/observability/adapters/claude/discovery.js` and hoisted shared vocabulary out
of two bindings into `engine/src/observability/role-phase.js`.

### Item 4 — the memory store is dead and primed to erase itself

Layer 1 is already handled: commit `ae4d9a1` on this branch carried the PR #12 run's four
`findings` and two `part-sizing` entries onto the worktree.

Layer 2 is the store itself. `load()` over the committed store returns
`{ entries: <all five concerns empty>, evicted: [], loadNote: 'malformed store' }` — pinned
below. The read path is `load()` (L199) → `parseStore()` (L86) → `extractFrontmatter` →
`yamlLoad` → **throws** → `catch { return null }` (L104-106) → `emptyView('malformed store')`
(L215). The write path `save(repoRoot, view, delta, deps)` (L626) then calls
`reconcile(view.entries, delta, provenance)` (L633) over that empty view.

`engine/src/tune-plan-main.js` L53-64 `loadMemory` calls the same `parseStore`, so
`/craft:tune` has been blind to recurring findings for the same reason.

## Requirements

1. `bash scripts/ci.sh` completes on a machine where `pi` **is** installed (this one), with
   no PATH manipulation by the operator and no test skipped.
2. `adapters/pi/test/cli.test.js`'s pi-absent assertions hold **by construction** on every
   machine: the `pi`-not-found path is produced by a controlled environment the test builds,
   never by the ambient inventory. The assertion is strictly stronger than today's
   `result.stderr.includes('pi')`.
3. No agent-binary stub is placed on the PATH of any suite other than the one test that
   needs the binary absent. No test passes vacuously as a result of this change.
4. `engine/src/observability/usage-aggregate.js`'s review-waste rule fires on a minority of
   the reviews in `docs/contributing/metrics-baseline.report.json`, and the reviews it
   selects are the expensive ones. Today it fires on 15 of 16 (94%) and accounts for 15 of
   the 38 recommendations (39%) the committed report carries.
5. The exported threshold constant's name matches what it thresholds. If the rule keys on
   effort rather than round count, `REVIEW_WASTE_CYCLES` is renamed accordingly and
   `engine/test/usage-aggregate.test.js` L301-311 (the "positive integer" pin) follows.
6. Any change to the emitted `review-waste` `kind` / `detail` / `evidence` keys is mirrored
   in `docs/contributing/specs/telemetry.md` §Recommendations **in the same change**, and in
   `engine/src/tune-plan.js`'s advisory sentence so the rendered advice names the axis the
   rule actually used.
7. `docs/contributing/specs/telemetry.md` is touched by this change regardless. Its
   frontmatter declares `subjects: ['engine/src/observability/**']`, which covers both
   `usage-aggregate.js` and `memory.js`; leaving it untouched emits
   `INTENTION-DRIFT(docs/contributing/specs/telemetry.md): …` per
   `docs/contributing/specs/intention.md`.
8. `load()` over the committed `.claude/craft-memory.md` returns all 67 entries with
   `loadNote: null` and `evicted: []`.
9. A subsequent `save()` with an empty or partial `delta` does not reduce the store to that
   delta. This must hold against **both** wipe vectors pinned below: the malformed-load
   vector, and the decay-cliff vector where every entry sits at or below `FLOOR + STEP`.
10. Every stored `confidence` is an integer in `FLOOR+STEP..CEILING` (1..5), per
    `docs/contributing/specs/memory.md` §Content whitelist. 45 of the 67 entries violate this
    today.
11. `README.md` L180's advertised design-doc count is bumped 27 → 28 for this document.
    `engine/src/readme-drift-main.js` L119-125 `corpusCountFindings` recounts the tree, and
    `test/readme-drift.test.js:100` runs the guard against the real root inside
    `run_suite process test`.
12. `bash scripts/design-lint.sh docs/contributing/design/harness-hygiene-followups.md`
    passes (six required headings), as does `bash scripts/ci.sh` end to end.

## Design

### Pinned matrix A — review-waste discrimination (`docs/contributing/metrics-baseline.report.json`, n=16, all `role=reviewer`)

```
cycles      sorted: [2,3,4,4,4,4,5,5,5,5,5,6,6,6,7,10]      median 5, mean 5.06
billedTurns sorted: [20,30,30,35,35,36,38,43,53,58,59,65,112,116,155,278]
                                                            median 43, mean 72.7
```

| Threshold | `cycles > T` | | Threshold | `billedTurns > T` |
|---|---|---|---|---|
| 2 (today) | 15/16 (94%) | | 50 | 8/16 (50%) |
| 3 | 14/16 (88%) | | 60 | 5/16 (31%) |
| 4 | 10/16 (63%) | | 80 | 4/16 (25%) |
| 5 | 5/16 (31%) | | 100 | 4/16 (25%) |
| 6 | 2/16 (13%) | | 110 | 4/16 (25%) |
| 7 | 1/16 (6%) | | 120 | 2/16 (13%) |

Recomputed from the committed report; matches the brief exactly. Three structural facts
decide this, and they matter more than any percentile:

**(a) `cycles` is a weak discriminator.** Twelve of sixteen values sit in 4..6. Every
cycles-only threshold either fires on nearly everything (T≤3) or cliff-edges through the
dense middle (T=4 → 63%, T=5 → 31%, T=6 → 13%). There is no stable place to stand.

**(b) `billedTurns` has one real cluster boundary.** The sorted values jump 65 → 112 with
nothing between. Four entries (112, 116, 155, 278) sit far above a dense low cluster
(20..65). Any T in [65, 112) selects exactly the same four entries — the threshold is
insensitive to its own value across a 47-turn band, which is what a real boundary looks
like and what a percentile artifact does not.

**(c) `billedTurns` tracks the cost the recommendation exists to flag; `cycles` does not.**
Correlating each axis against the same entry's `totalCost.priced`:

| Axis | Pearson r vs priced cost | Spearman ρ vs priced cost |
|---|---|---|
| `cycles` | 0.829 | 0.715 |
| `billedTurns` | **0.988** | **0.891** |

Per-entry, sorted by `billedTurns`:

| cycles | billedTurns | totalCost.priced |
|---:|---:|---:|
| 10 | 278 | $26.80 |
| 7 | 155 | $17.84 |
| 6 | 116 | $13.63 |
| **4** | **112** | **$12.45** |
| 6 | 65 | $5.72 |
| 5 | 59 | $5.94 |
| 5 | 58 | $8.04 |
| 6 | 53 | $5.92 |
| 5 | 43 | $3.86 |
| 4 | 38 | $3.71 |
| 4 | 36 | $4.31 |
| **5** | **35** | **$4.35** |
| 4 | 35 | $3.85 |
| **5** | **30** | **$4.29** |
| 3 | 30 | $3.12 |
| 2 | 20 | $2.32 |

The bolded rows are the disagreement. `cycles=4, billedTurns=112, $12.45` is the
fourth-most-expensive review in the corpus and sits below every useful cycles threshold;
`cycles=5` reviews at 30 and 35 turns cost $4.29 and $4.35 and would fire under a
cycles-only rule at T=4. A cycles-only rule both misses expensive reviews and flags cheap
ones — that is the failure, not the fire rate.

**Recommended rule.** Filter on `rc.billedTurns > REVIEW_WASTE_BILLED_TURNS` with the
constant at **85** — inside the 65 → 112 gap at its geometric midpoint (√(65×112) ≈ 85.3),
so it is maximally far from both clusters. This selects 4/16 (25%), the four most expensive
reviews, and satisfies Requirement 4. `evidence` keeps **both** axes unchanged (`cycles` and
`billedTurns` already ship side by side per `docs/contributing/specs/telemetry.md`
§reviewCycles) — only the filter and the `detail` string change. The final axis and value
are DC-1; the shape consequences below hold for whichever alternative lands.

**Emitted-shape consequences** (Requirements 5-7 — this is the
`docs/contributing/specs/telemetry.md` obligation, stated explicitly as the brief asks):

| Surface | Change |
|---|---|
| `usage-aggregate.js` L11 | `REVIEW_WASTE_CYCLES` → `REVIEW_WASTE_BILLED_TURNS` (name must match what it thresholds) |
| `usage-aggregate.js` L304 | `rc.cycles > …` → `rc.billedTurns > …` |
| `usage-aggregate.js` L306 `detail` | `` `role ${rc.role} has ${rc.cycles} review cycles` `` → a string naming billed turns and the role |
| `usage-aggregate.js` `evidence` | **unchanged** — same six keys, same values |
| `kind` | **unchanged** — `review-waste` stays; the concept did not change, its measure did |
| `tune-plan.js` L98-100 | advisory sentence must name the axis that fired, not "burned N review cycles" |
| `docs/contributing/specs/telemetry.md` L461-482 | example `detail` refreshed; §review-waste prose restated in terms of effort rather than round count |
| `engine/test/usage-aggregate.test.js` L10, L301-311 | import + "positive integer" pin follow the rename |

Degradation on older data follows the module's existing discipline (L26-29: *"Numerically
safe on malformed/older-schema groups"*): a `reviewCycles` entry with no `billedTurns` yields
`undefined > 85` → `false` → no recommendation, never a `NaN` comparison and never a throw.
Reports predating `5bdbf5a` carry no `billedTurns`, so they simply stop producing
review-waste recs rather than producing wrong ones.

`kind` deliberately does not change: `tune-plan.js` L98 branches on
`rec.kind === 'review-waste'`, `sortedRecs` L318-322 orders on it, and
`docs/contributing/adr/213-config-tuner-propose-diff.md` names it. Renaming the kind would
churn four surfaces to express a measurement change that `detail` already carries.

### Pinned matrix B — the pi hang, measured on this machine

`pi` resolves to `/Users/scolladon/.n/bin/pi`; `node` to `/Users/scolladon/.n/bin/node`
(same directory — the two cannot be separated by dropping a PATH entry); `git` to
`/opt/homebrew/bin/git`.

The reported cause ("pi is installed, so the spawn does slow provider work") is one layer
short. Probing `node:child_process` directly:

| Call | Result |
|---|---|
| `execFile('cat', [], { stdio: ['ignore','pipe','pipe'], timeout: 4000 })` | killed SIGTERM at 4007 ms |
| `spawn('cat', [], { stdio: ['ignore','pipe','pipe'] })` | exit 0 in 6 ms |

`execFile` does not forward `stdio` to `spawn`; it is not in `execFile`'s option set and is
silently dropped. `adapters/pi/src/run.js` L100-108 `spawnPi` builds
`options = { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }` and hands it
to `runSubprocess` (L73-84), which calls `execFileFn(file, args, options, cb)`. With the real
`_execFile` the `stdio` entry is inert, so the child gets an **open stdin pipe that is never
ended** — precisely the condition the module's own doc comment at L90 warns about:

```
 * - stdio[0] === 'ignore' (stdin ignored — pi hangs on an open stdin pipe in -p mode)
```

Confirmed against the real binary, in a throwaway `git init` repo:

| Call | Result |
|---|---|
| `execFile('pi', ['--mode','json','-p', …], { stdio: ['ignore','pipe','pipe'], timeout: 20000 })` | **killed SIGTERM at 20023 ms**, empty stdout, empty stderr |
| `spawn('pi', <same argv>, { stdio: ['ignore','pipe','pipe'] })` | **exit 0 in 1317 ms**, real JSONL stream |

So the hang is unconditional on a pi-installed machine: it is not provider latency, it is a
child blocked on stdin forever. And `adapters/pi/test/run.test.js:488` and `:717` assert
`captured.options.stdio[0] === 'ignore'` and `deepEqual(captured.options.stdio, [...])`
against an **injected** `execFileFn` spy — they prove the option was *constructed*, never
that stdin was *closed*. Two green tests over a production hang: the same lie as item 2's
headline, one directory over.

Full-CLI matrix, each row measured:

| PATH | cwd | Outcome |
|---|---|---|
| ambient (pi present) | throwaway git repo | **hangs** — SIGTERM at a 30 s bound, `status=null`, empty stderr |
| synthetic (`node` + `git` symlinks only) | throwaway git repo | **exit 2 in 157 ms**, stderr `{ unit: pi-run, reason: spawn pi ENOENT }` |
| synthetic (`node` + `git` symlinks only) | non-git dir | exit 2, stderr `{ unit: workspace, reason: no git repository in checkout }` |

The third row matters: `adapters/pi/src/roleless.js` L7-12 `workspace` blocks first when cwd
is not a git repo, and that blocker string contains no `pi`, so the test would fail loudly
rather than pass vacuously. The construction must therefore control **both** axes.

**Recommended fix — make the test hermetic (root cause), following
`test/hermetic-suite.test.js`.** That file's discipline is to construct the hostile ambient
inside the test (`mkdtempSync` HOME + cwd, seeded with a bad manifest and a user policy)
and pass it to the child, so the assertion means what it says on any machine. The same
shape here:

1. `runCli` builds, once per suite, a throwaway root via `fs.mkdtempSync`: a `bin/`
   directory holding symlinks to the **resolved real** `node` (`process.execPath`) and
   `git`, and a `repo/` directory with `git init -q` run in it. `git` is resolved from the
   ambient PATH before the synthetic one is imposed; an unresolvable `git` fails the test
   loudly rather than silently producing the third matrix row. (The repo already requires
   `git` unconditionally — `test/source-hygiene.test.js` L72 shells `git ls-files` and
   `scripts/ci.sh` L95 shells `git merge-base`.)
2. `spawnSync(process.execPath, [CLI_PATH, ...args], { cwd: <repo>, env: { ...process.env, PATH: <bin> }, encoding: 'utf8' })`.
3. Teardown removes the root in a `finally`, exactly as `test/hermetic-suite.test.js` L73-76
   does.

`pi` is then genuinely absent — an `ENOENT` from the OS, not a stub returning a rehearsed
code — so nothing can pass vacuously (Requirement 3). This is proven, not projected: row
two of the matrix above **is** this construction, run on this machine with `pi` installed,
and it produced exit 2 in 157 ms.

The assertion tightens from `result.stderr.includes('pi')` to the exact blocker line
`{ unit: pi-run, reason: spawn pi ENOENT }`. That strictly strengthens the gate: today's
substring test is satisfied by any stderr containing the two letters `pi`; the pinned form
proves the walk reached `spawnPi` and rejected through `runSubprocess`'s blocker path.

Only `node` and `git` need to be on the synthetic PATH: the walk order is `workspace`
(role-less, `spawnSync('git', …)` via `adapters/pi/src/roleless-probes.js` L55) →
`requirements` (`enabled: false`) → `design` (worker → `spawnPi`). `gh` is only reached at
`propose`, and the gate command from `adapters/pi/.claude/workflow.md` (`node --test`) only
runs on code-producing phases — both unreachable before the blocker.

**The `spawnPi` stdin defect is a separate decision (DC-4).** Requirements 1-3 are satisfied
by the test change alone. But leaving `stdio` inert leaves a production hang behind two green
tests, and it is the mechanism of the very hang being closed. The minimal repair keeps the
DI seam and the shared `runSubprocess`: capture the `ChildProcess` that `execFileFn` returns
and end its stdin.

```js
function runSubprocess(file, args, options, unit, execFileFn) {
  return new Promise((resolve, reject) => {
    const child = execFileFn(file, args, options, (err, stdout, stderr) => { /* unchanged */ });
    child?.stdin?.end();
  });
}
```

This is honestly testable without `pi`: spawn a real child that blocks on an open stdin and
assert it exits (the `cat` probe above, at 6 ms vs a 4 s timeout, is the test in miniature).
It also fixes `runGate` (L121-125), which shares `runSubprocess`.

### Item 3 — the boundary rule and the phase

Pinned by running the real resolver against a throwaway manifest that sets
`phases.architecture.enabled: true` plus one declared technique:

```
$ node engine/bin/pipeline-resolve.js pipeline/default.yml <tmp>/workflow.md
ok= true  errors= []
effective ids: workspace design decisions planning implementation review refactoring
               validation architecture documentation propose integrate
architecture: { gate: "<arch gate>", model: "opus", role: "craft:harness-triager",
                autoSkipEligible: true,
                harness.techniquePlan: [{ id: "boundaries", scope: "per-hunk",
                                          mode: "gate", runStyle: "sync",
                                          commitPrefix: "fix", probe: …, run: … }] }
gateDecision: { phaseId: "architecture", gate: "<arch gate>", codeProducing: false }
```

So the mechanism works today: `enabled` is a validated boolean
(`engine/src/manifest.js` L373-374), `harness.techniques[]` is validated by
`engine/src/manifest-harness.js` L29-64, and `deriveTechniquePlan`
(`engine/src/resolve.js` L169-188) projects it. Enabling without a technique lands on
`skills/architecture/SKILL.md`'s terminal tier —
`NO-OP(architecture): no techniques declared/probed`, release the propose gate, phase ends —
so "enable it" alone buys nothing. The question is the technique.

**Recommended technique: a repo-native boundary test, zero new dependencies.**
`test/architecture-boundaries.test.js`, CommonJS, beside `test/source-hygiene.test.js` and
`test/hermetic-suite.test.js`, enforcing three rules derived from the verified import graph:

| Rule | Statement | Today |
|---|---|---|
| R1 | The pure core `engine/src/observability/usage-aggregate.js` imports nothing under `adapters/` | holds (only `./skip-signals.js`) |
| R2 | No `engine/src/observability/adapters/<a>/**` module imports from `adapters/<b>/**` where `a ≠ b`; intra-adapter imports are allowed | holds (`adapters/claude/metrics-split.js` → `./telemetry.js` is intra-adapter) |
| R3 | Only `*-main.js` may import `./adapters/**`; `usage-mine-main.js` is the composition root | holds — the only such imports in the tree are `usage-mine-main.js` L45-51 and L53 |

Following `test/source-hygiene.test.js`'s class-C idiom, each rule is pinned **positively**:
the detector is asserted to flag a synthetic offender *and* to find none in the real tree, so
a rule cannot rot into vacuity when the tree it polices moves. Exceptions live as commented
allowlist entries in the rule file — which is ADR-050's "exceptions in the tool's own rule
config, with one line of why", satisfied by the repo's own idiom instead of by
dependency-cruiser's.

Declared in `.claude/workflow.md` mirroring the existing `validation` block:

```yaml
  architecture:
    enabled: true
    harness:
      techniques:
        - id: boundaries
          probe: "test -f test/architecture-boundaries.test.js"
          run: "node --test test/architecture-boundaries.test.js"
          mode: gate
          commit-prefix: fix
```

Three consequences to state plainly rather than oversell:

1. **The phase does not add enforcement; it adds triage discipline and recorded evidence.**
   `scripts/ci.sh` L60 `run_suite process test` enumerates `test/*.test.js`, so the rule
   file gates every run the moment it lands, phase or no phase. What enabling the phase buys
   is the harness-triager contract (per-violation FIXED / EXCEPTION / FALSE), the run-record
   tokens, and the mechanical evidence ADR-108 names for the DoD criterion. What it costs is
   an opus-tier spawn per code-touching run (`autoSkipEligible: true` bounds this: a change
   touching no code in scope auto-skips and releases the propose gate, ADR-147).
2. **`docs/contributing/DOD.md` L72-76 must change.** Under DC-5(i) the
   `architecture-gap-honest` line becomes a met criterion evidenced by the phase gate; under
   DC-5(ii) it becomes a met criterion evidenced by the ci.sh rule; only under DC-5(iii)
   does it stay as-is. Leaving the "N/A — the check did not run" wording while a boundary
   check runs would be a new instance of the same lie this change exists to remove.
3. **`<arch gate>` stays unresolved, and ADR-050 conflicts** (DC-6). ADR-050 pins it to
   "dependency-cruiser exits 0 over the scope"; no engine code substitutes it
   (`grep` finds `<arch gate>` only in `pipeline/default.yml` L137 and the ADRs), and
   `adapters/pi/src/run.js` L22-26 `SUBSTITUTIONS` maps only `<gates.phase>` and
   `<validation gate>`. Since `gateDecision.codeProducing` is `false` for `architecture`, no
   binding executes the string today — the placeholder is inert, not dangerous. Under a
   repo-native technique the honest resolution is "the technique's own `run` command exits
   0", which supersedes ADR-050's tool-specific wording.

A note on scope labels: `deriveTechniquePlan` defaults the technique's `scope` to `per-hunk`,
and `engine/src/manifest-harness.js` L15 allows only `per-hunk|per-file`. An import-graph rule
is not hunk-decomposable — it reads the whole tree by construction, exactly as
`test/source-hygiene.test.js` does. The declaration omits `scope` and inherits `per-hunk`;
the label is cosmetic here because the `run` command is a single whole-tree invocation either
way. Inventing a third enum value to make a label accurate is not worth an engine change.

The pi adapter is unaffected: `adapters/pi/src/run.js` L269-270 resolves against
`adapters/pi/.claude/workflow.md`, not the repo manifest, so enabling `architecture` at the
repo root does not put an id into pi's walk that `WORKER_PHASE_IDS` (L128-130) and
`rolelessSteps` both lack. This is the same pre-existing situation as `requirements`.

### Item 4 — memory store repair

**Pinned defect 1 — three malformed scalars, in two different defect classes.** Reproduced
by iteratively repairing a copy in a throwaway directory until `yamlLoad` succeeds:

| Round | js-yaml error | Frontmatter line | File line | Key | Actual cause |
|---|---|---|---|---|---|
| 1 | `bad indentation of a mapping entry (220:377)` | 220 | **221** | `pattern:` | **colon-space** at value offset 363: `… unconditionally). Also: only map …` |
| 2 | `bad indentation of a mapping entry (256:313)` | 256 | **257** | `pattern:` | **colon-space** at value offset 299 (and 439, 467) — an embedded JSON fragment: ``(pi declares `"skills": ["skills"]`;`` |
| 3 | `bad indentation of a mapping entry (391:14)` | 391 | **392** | `pattern:` | **leading reserved indicator** — the value begins `` `[a-z]*` … ``, and a plain scalar may not start with `` ` ``. No colon-space anywhere in this value. |

Two classes, one symptom. Rounds 1-2 are unquoted plain scalars carrying a colon-space,
which terminates the scalar. Round 3 has **no** colon-space at all: it begins with a backtick,
a YAML reserved indicator that cannot open a plain scalar. js-yaml reports all three as *"bad
indentation of a mapping entry"*, so the error message is not a usable signature — a repair
that greps for `: ` finds two of the three and leaves the store just as unreadable as before.

The brief knew of the first. The robust repair is therefore not defect-by-defect: **quote
every scalar value in the store**, which is what `serializeStore`'s `yamlDump` (L125-129)
would produce anyway and what makes the file immune to whichever character the next hand-edit
introduces. After that, the frontmatter parses and yields:

```
toolchain 1 · gate-cmd 2 · validation-tool 1 · findings 43 · part-sizing 20   = 67 entries
```

Applying `docs/contributing/specs/memory.md` §Content whitelist validate-on-read predicates
to the repaired store: **0 entries would be evicted** in any concern. The content is
schema-clean. The store is not corrupt — it is unquoted.

**Pinned defect 2 — a second, independent wipe vector.** Confidence histogram over the
repaired store (none outside (0, 5]; none missing `provenance.date`):

| confidence | 0.5 | 0.6 | 0.65 | 0.7 | 0.75 | 0.8 | 0.85 | 0.9 | **1** |
|---|---|---|---|---|---|---|---|---|---|
| entries | 6 | 4 | 2 | 5 | 4 | 13 | 5 | 6 | **22** |

Forty-five are fractional and violate the whitelist's *integer `FLOOR`..`CEILING`*; the other
22 are legal. Per concern, the fractional ones are **all 43 `findings`** plus 2 `part-sizing`;
the 22 legal `1`s are the whole of `toolchain` (1/1), `gate-cmd` (2/2), `validation-tool`
(1/1) and 18/20 `part-sizing`. `reconcileConcern`
(`engine/src/observability/memory.js` L451-454) decays a non-re-observed entry with:

```js
const newConf = entry.confidence - STEP;      // STEP = 1
if (newConf > FLOOR) reconciled.push(…);      // FLOOR = 0 — strict, so 0 is NOT kept
```

Both groups fail that guard: `0.9 - 1 = -0.1`, and `1 - 1 = 0`, which is not `> 0`. Measured:
**`survive = 0, evaporate = 67`**. So the first successful `save()` empties the store
regardless of the YAML repair.

The two groups fail for different reasons and need different treatment. The 45 fractional
values are a **data defect** — they were hand-written on a 0..1 scale the engine's model does
not use. The 22 legal `1`s are the engine behaving **exactly as designed**: an ADDED entry
starts at `FLOOR + STEP = 1` and dies on the next run that does not re-observe it. That design
is sound in general, but these 22 could never be re-observed, because `load` has been handing
every run an empty view since `1f7e76f`. Repairing the quoting alone therefore converts a
silently-empty read into a silently-emptied write, and normalizing only the fractional 45
still loses the entire `toolchain`, `gate-cmd`, `validation-tool` concerns and 18 of 20
`part-sizing` entries on the next run. DC-7 covers all 67.

Cap eviction is not a factor: `evictToCaps` runs against `deps.caps ?? { maxEntries: 1000, maxBytes: Infinity }`
(L630) and 67 entries clear both by a wide margin.

**The repair procedure — three steps, ending in the engine's own canonical form.**

1. Quote the three scalars at file lines 221, 257, 392 so the frontmatter parses at all.
2. Apply the DC-7 confidence normalization across all 67 entries.
3. Round-trip the result through the engine: `parseStore` → `serializeStore` → write. This
   canonicalizes quoting by construction (`yamlDump`, L125-129) instead of relying on a
   human to spot the next hazard character, and regenerates the markdown body, which
   `buildBody` derives from the frontmatter on every serialize (L131) and never parses — a
   hand YAML edit would otherwise leave the body's rendered
   `- confidence: … | provenance: …` lines silently stale in a committed, human-reviewed file.

Step 3 is measured, not assumed. Over the round-tripped store: all 67 entries survive,
`parseStore(serializeStore(v))` deep-equals `v`, and a second serialize is **byte-identical**
to the first. Both hazard classes come back single-quoted:

```
pattern: '`[a-z]*` is NOT ASCII under en_US.UT…      ← was a bare leading backtick
pattern: 'to compute a git-diff touched set ON…     ← was an unquoted colon-space scalar
```

**Pinned defect 3 — the malformed-load erasing write.** With `loadNote: 'malformed store'`,
`view.entries` is empty, so `save`'s `reconcile(view.entries, delta, provenance)` (L633)
produces exactly this run's delta and `serializeStore` writes it as the whole store. The
advisory-only invariant (ADR-116, ADR-120) says a malformed store is a **non-blocking load
no-op**; it does not say a malformed load licenses an erasing write. Today it does. DC-8
decides whether the engine closes this.

The minimal engine hardening that preserves both ADRs — never throws, never gates — is to
carry the degradation in the view and have `save` decline the write:

- `emptyView('malformed store')` marks the view (a dedicated boolean, not a string match on
  `loadNote` — a note is a human-readable message, not a control signal).
- `emptyView('no store')` does **not** mark it: a cold repo must still get its first write.
- `emptyView('store path outside repo')` already skips the write at L639, unchanged.
- `save` returns `{ writeNote: 'save skipped: load was degraded', view: finalView }` —
  the existing warning channel, no new failure mode, no throw, no blocker.

This changes the `MemoryView` shape, so `docs/contributing/specs/memory.md` §Port interface
must be updated in the same change. Note that `docs/contributing/specs/memory.md` carries **no**
`subjects:` frontmatter, so the intention lint has never watched it — which is why the store
could die without any page going stale. `docs/contributing/specs/telemetry.md` does declare
`subjects: ['engine/src/observability/**']`, which covers `memory.js` and makes it stale on
any edit here regardless (Requirement 7).

### Change inventory

| Path | Item | Change |
|---|---|---|
| `engine/src/observability/usage-aggregate.js` | 1 | threshold constant + `reviewWasteRecs` filter + `detail` |
| `engine/src/tune-plan.js` | 1 | advisory sentence names the axis that fired |
| `engine/test/usage-aggregate.test.js` | 1 | import, constant pin, threshold-boundary tests |
| `engine/test/tune-plan.test.js` | 1 | advisory-rationale expectation |
| `docs/contributing/specs/telemetry.md` | 1, 4 | §review-waste example + prose; touched anyway per Req 7 |
| `adapters/pi/test/cli.test.js` | 2 | hermetic `runCli` + tightened assertions |
| `adapters/pi/src/run.js` | 2 (DC-4) | `runSubprocess` ends the child's stdin |
| `adapters/pi/test/run.test.js` | 2 (DC-4) | replace the two options-bag `stdio` assertions with a real blocked-stdin child |
| `test/architecture-boundaries.test.js` | 3 (DC-5) | new — R1/R2/R3 with positive pinning |
| `.claude/workflow.md` | 3 (DC-5) | `phases.architecture` enable + `boundaries` technique |
| `docs/contributing/DOD.md` | 3 (DC-5) | `architecture-gap-honest` restated truthfully |
| `.claude/craft-memory.md` | 4 | quote 3 scalars, normalize 67 confidences |
| `engine/src/observability/memory.js` | 4 (DC-8) | degraded-view flag; `save` declines the erasing write |
| `engine/test/memory.test.js` | 4 (DC-8) | round-trip + degraded-save tests |
| `docs/contributing/specs/memory.md` | 4 (DC-8) | `MemoryView` shape + save-declines wording |
| `README.md` | — | design-doc count 27 → 28 (Req 11) |

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Which axis and threshold the `review-waste` rule keys on | (a) keep `cycles`, raise `REVIEW_WASTE_CYCLES` 2 → 6 (fires 2/16); (b) switch to `billedTurns > 85` (fires 4/16, the four most expensive reviews); (c) two-axis AND: `cycles > 4 && billedTurns > 85` (fires 3/16) | **(b)** | `cycles` clusters 12-of-16 into 4..6 with no stable threshold, and correlates with priced cost at r=0.829 / ρ=0.715 versus `billedTurns` at r=0.988 / ρ=0.891. `billedTurns` has one genuine cluster boundary (65 → 112, no values between), so any T in that band is behaviourally identical — 85 is its geometric midpoint. (a) still selects on the weak axis and would miss the `cycles=4, 112-turn, $12.45` review. (c) is strictly worse than (b): the AND drops exactly that entry, trading the recommendation's most valuable hit for a narrower fire rate. |
| DC-2 | *(only if DC-1 ≠ (a))* Whether `evidence.cycles` stays in the emitted `review-waste` payload once the filter no longer reads it | (a) keep both `cycles` and `billedTurns` (status quo shape); (b) drop `cycles`, emit only the axis that fired; (c) keep both and add a `firedOn` discriminator naming the axis | **(a)** | `evidence` is documented as mirroring its `reviewCycles` entry exactly (`docs/contributing/specs/telemetry.md` L481-482), and both fields are already there. Dropping a field breaks that mirror and removes the context a reader needs to see *why* a 4-cycle review was flagged. (c) adds a key whose only consumer would be prose that `detail` already carries. |
| DC-3 | How `adapters/pi/test/cli.test.js` stops depending on ambient `pi` | (a) hermetic per-test environment: `mkdtemp` root with a synthetic PATH (`node` + `git` symlinks) and a `git init` cwd, pinning `spawn pi ENOENT`; (b) document the operator workaround — a PATH dir of `exit 127` stubs for `pi opencode copilot codex aider cursor claude antigravity` — in CONTRIBUTING and change no test; (c) skip the three subprocess tests when `pi` resolves on PATH | **(a)** | Proven on this machine: exit 2 in 157 ms with `{ unit: pi-run, reason: spawn pi ENOENT }`, versus SIGTERM at a 30 s bound today. It removes the hang *and* makes the assertion mean what it claims — `pi` is genuinely absent (an OS `ENOENT`), never a stub returning a rehearsed code, so nothing passes vacuously. (b) leaves the gate green-by-accident on the CI runner and adds a step every contributor must know; a stub for seven unproven binaries also risks exactly the vacuous pass the brief forbids. (c) is the worst of both: the suite would silently cover less on precisely the machines that develop the adapter. |
| DC-4 | Whether to fix the inert `stdio` in `adapters/pi/src/run.js` `spawnPi` in this change | (a) fix now — `runSubprocess` ends the returned child's stdin, with a test that spawns a real blocked-stdin child; (b) leave it, file a follow-up; (c) switch `runSubprocess` from `execFile` to `spawn` with explicit stdio and manual stream collection | **(a)** | Measured: `execFile` silently drops `stdio`, so `spawnPi` hangs forever against a real `pi` (SIGTERM at 20 s, zero output) while `spawn` with the same intent returns in 1317 ms. Two tests (`run.test.js:488`, `:717`) assert the option was *constructed* on an injected spy and are green over that hang — the same defect class as the item this change exists to close, and inside its scope line. (b) ships the fix for the symptom and leaves the cause. (c) is a larger rewrite of a function shared with `runGate` and loses the `execFileFn` DI seam every existing test injects. |
| DC-5 | Whether craft dogfoods the `architecture` phase | (i) land `test/architecture-boundaries.test.js` **and** declare it as the `boundaries` technique with `phases.architecture.enabled: true`; (ii) land the rule file only (ci.sh-enforced) and leave the phase default-off, restating the DoD line to cite the rule; (iii) leave everything as-is and record why | **(i)** | The rule file is the substance and lands under (i) or (ii); the difference is whether the repo also gets the triage contract, the run-record tokens, and the mechanical DoD evidence ADR-108 explicitly names ("when the `architecture` phase is enabled and green, that gate is the mechanical evidence"). Cost is one opus-tier spawn per code-touching run, bounded by `autoSkipEligible: true`. Be clear-eyed that (i) buys ceremony, not enforcement — ci.sh runs the rule either way. (iii) keeps a fourth standing lie in `DOD.md`. Enabling with no technique is not offered: it resolves to `NO-OP(architecture)` and buys nothing at the cost of a phase. |
| DC-6 | *(only if DC-5 = (i))* How `<arch gate>` resolves, given ADR-050 pins it to dependency-cruiser | (a) supersede ADR-050 with a new ADR: `<arch gate>` resolves to the declared technique's own `run` exiting 0; (b) keep ADR-050 and adopt dependency-cruiser as a devDependency; (c) leave ADR-050 and the placeholder untouched — `codeProducing: false` means no binding executes it today | **(a)** | ADR-050 (2026-06-18) predates ADR-149's de-specialization, which made techniques repo-declared and the engine technique-agnostic; its tool-specific wording is the last dependency-cruiser reference in an accepted ADR. (b) adds the repo's first non-`js-yaml` runtime dependency and a supply-chain decision for a rule three greps express. (c) leaves an accepted ADR describing a tool that is banned from plugin sources by `test/source-hygiene.test.js` L26 — a documented intention no code can honour. |
| DC-7 | How all 67 `confidence` values are normalized so the repaired store survives its first `save` | (a) rescale the 45 fractional values to `max(1, min(5, round(v × CEILING)))` (0.5→3, 0.7→4, 0.8→4, 0.9→5 — every value lands on 3, 4 or 5) and leave the 22 legal `1`s untouched; (b) as (a), **and** lift the 22 legal `1`s to `2`; (c) set all 67 to a single uniform value | **(b)** | The 45 fractional values are a data defect and (a)'s rescale is the only mapping that preserves the author's intended ordering. But (a) alone still loses the whole of `toolchain`, `gate-cmd`, `validation-tool` and 18 of 20 `part-sizing` on the first non-re-observing run, because a confidence of `1` decays to exactly `0` and `FLOOR` is strict. Those 22 sat at `1` only because `load` could never hand a run the view needed to refresh them — decaying them out now would charge the entries for the bug. (b) lifts them by one `STEP`, the smallest correction that lets the decay model start working. (c) discards the ordering (uniform-high claims corroboration nothing has; uniform-low re-arms the wipe). |
| DC-8 | Whether the engine hardens `save` against writing over a degraded load | (a) mark the view degraded in `emptyView('malformed store')` and have `save` decline with `writeNote: 'save skipped: load was degraded'`; (b) no engine change — repair the store and rely on human review of the committed diff; (c) `save` writes the reconciled result to a quarantine sidecar when the load was degraded | **(a)** | ADR-116/120 make a malformed store a non-blocking load no-op and a failed save a recorded warning; neither licenses an erasing write, and today one malformed byte plus one run silently destroys every accumulated entry. (a) closes it inside the existing warning channel — no throw, no gate, no new failure mode — and costs one boolean on the view. (b) leaves a live data-loss path armed for the next hand-edit, and this store proves hand-edits happen. (c) invents a second store location and a reconciliation question nobody has asked for. |

## Test strategy

**Item 1 — threshold recalibration.** Unit, `engine/test/usage-aggregate.test.js`, extending
rather than duplicating the four existing surfaces:

- L301-311 — the exported-constant pin; follows the rename and asserts the new name is a
  positive integer.
- L394-420 — "three review events from three distinct spawns … `evidence.cycles === 3`,
  `evidence.billedTurns === 3`". Under DC-1(b) this fixture no longer fires the rec; the
  test's real subject is the `evidence` aggregates, so it keeps its assertions and is
  rebuilt to cross the new threshold.
- L713-729 — `detail` string and `phase` field; the `detail` expectation follows the new
  wording, `phase: 'review'` unchanged.
- L982-990 — the strict-inequality boundary ("exactly `REVIEW_WASTE_CYCLES` must not fire;
  the threshold is `>`, not `>=`"); re-pointed at the new axis. Its edge matrix becomes
  `T-1` / `T` / `T+1` billed turns.
- L733-748 — `sortedRecs` ordering across kinds; unaffected because `kind` does not change,
  but its fixture must still produce a firing review-waste rec.

Consumer test: `engine/test/tune-plan.test.js` L203-223 constructs a
`{ kind: 'review-waste', evidence: { role, cycles } }` fixture and asserts the advisory
`rationale`; extended with `billedTurns` and the reworded sentence.

Corpus check, not a unit test but the acceptance evidence for Requirement 4: re-run the
aggregate over `docs/contributing/metrics-baseline.report.json` and confirm the review-waste
rec count drops from 15 to the count DC-1 implies (4 under (b)). The report file itself is
**not** regenerated (out of scope).

**Item 2 — hermeticity.** The proof obligation is explicit: the change must be demonstrated
on a machine where `pi` **is** installed.

- `bash scripts/ci.sh` runs to completion here, with `pi` on the ambient PATH and no operator
  PATH manipulation. That is the acceptance test for Requirement 1 and it is the only one that
  can fail for the original reason.
- `adapters/pi/test/cli.test.js` — the three `subprocess execution guard` tests use the
  hermetic `runCli`; the pi-blocker assertion pins the exact string
  `{ unit: pi-run, reason: spawn pi ENOENT }`.
- A negative control belongs in the same file: assert the synthetic PATH really lacks `pi`
  (a direct `spawnSync('pi', ['--version'], { env: { PATH: <bin> } })` yields `ENOENT`), so
  the suite cannot silently degrade into re-inheriting the ambient PATH and start hanging
  again.
- Teardown is asserted by construction (`finally` + `rmSync`), mirroring
  `test/hermetic-suite.test.js` L73-76.

Under DC-4, `adapters/pi/test/run.test.js` L488 and L717 are replaced rather than kept: an
options-bag assertion cannot distinguish the current behaviour from the fixed one. The
replacement spawns a real child that blocks on an open stdin through `runSubprocess` and
asserts it exits — the `cat` probe (6 ms with stdin closed, SIGTERM at 4 s without) is the
shape.

**Item 3 — boundary rule.** `test/architecture-boundaries.test.js`, CommonJS, following
`test/source-hygiene.test.js`'s two-sided idiom for each of R1/R2/R3: a synthetic offender
list the detector must flag, and the real tracked tree it must find clean. Plus the
staleness guard that file already carries at L94-109 — every scanned path resolves to at
least one tracked file, so a moved directory fails loud instead of scanning nothing.
`test/every-test-file-registers.test.js` picks the new file up automatically (it enumerates
`test/**/*.test.js` and requires ≥1 registered test).

Under DC-5(i), the technique's `probe` (`test -f test/architecture-boundaries.test.js`) and
`run` are exercised by running `/craft:architecture` once on this branch and confirming the
run record carries a technique outcome rather than
`NO-OP(architecture): no techniques declared/probed`.

**Item 4 — memory.** The load-bearing tests must run against the **real committed store**, not
a fixture. `engine/test/memory.test.js` is 130 KB of thorough, entirely fixture-driven
coverage — including two malformed-store tests at L113 and L156 that assert
`loadNote === 'malformed store'` — and the actual store was unreadable underneath all of it
for months. A fixture suite cannot notice that its subject died. The store guard therefore
extends `test/p22-memory.test.js` (the repo-level suite that already guards the store's
`.gitignore` re-include and its spec's presence), loading the port via a dynamic `import()`
from that CommonJS file:

- The committed `.claude/craft-memory.md` **parses**: `load(repoRoot, deps)` returns
  `loadNote: null`, `evicted: []`, and 67 entries across the five concerns (Requirement 8).
  This one assertion is the guard whose absence let the store die at `1f7e76f`.
- Every loaded entry's `confidence` is an integer in 1..5 (Requirement 10) — the guard that
  would have caught the fractional values the day they were hand-written.
- Every loaded entry survives one decay: `confidence - STEP > FLOOR` (Requirement 9,
  decay-cliff vector). Note this is strictly stronger than the previous bullet: a legal
  confidence of `1` passes the schema check and still fails this one.
- `parseStore(serializeStore(view))` deep-equals `view`, and a second `serializeStore` is
  byte-identical to the first — the mechanical guarantee behind repair step 3, and the
  regression guard for any future quoting hazard.

Unit-level, in `engine/test/memory.test.js` under DC-8: `save` over a view carrying the
degraded flag performs **no** `writeStore` call and returns the `writeNote`; `save` over
`emptyView('no store')` (cold repo) **does** write. Both assert against an injected
`writeStore` spy, beside the existing malformed-load tests at L111-160. The existing
save-path suite (L1218-1885) is the reconciler's regression surface and must stay green
unchanged — that is the evidence DC-8(a) is additive rather than a behaviour change.

**Gates.** `bash scripts/design-lint.sh` over this document,
`bash scripts/ci.sh` end to end (which also re-runs `test/readme-drift.test.js:100` against
the real root, catching Requirement 11 if the README count is not bumped), and the mutation
technique declared in `.claude/workflow.md` over the touched hunks. `test/mutation-scope.test.js`
pins the per-hunk `--mutate` contract sentences in `.claude/workflow.md`; a manifest edit
under DC-5 must not disturb them.

## Out of scope

- **Re-mining or regenerating `docs/contributing/metrics-baseline.report.json`.** It was
  regenerated three times in PR #12 and is current; item 1 reads it, never rewrites it.
- **The declined `--until` flag.** Deliberately foreclosed; nothing here reopens it.
- **Published cost figures in `README.md` or `docs/guides/comparison.md`.** Untouched. The
  design-doc *count* bump at `README.md` L180 (Requirement 11) is a corpus count, not a cost
  figure, and is required by the drift guard.
- **The known-flaky `telemetry.js` LogicalOperator mutant** that reports Survived under
  Stryker's tap runner even with `--coverageAnalysis all --disableBail`, while manually
  applying it fails the covering test. A runner artifact; not chased.
- **Giving `docs/contributing/specs/memory.md` a `subjects:` declaration** so the intention
  lint watches the memory port the way it watches telemetry. It is the reason the store could
  die without any page going stale, and it is a real gap — but it changes lint coverage for a
  page this change already updates by hand, and belongs in its own change with its own
  drift-corpus review.
- **Auditing the other seven agent binaries** (`opencode copilot codex aider cursor claude
  antigravity`) for the same spawn hazard. Only `pi` is evidenced; the grep over
  `adapters/*/test/*.js` in Context shows no other test spawning an agent binary, and
  speculatively stubbing seven binaries is the vacuous-pass risk the brief forbids.
- **Resolving `<arch gate>` in the pi adapter's `SUBSTITUTIONS` map.** `architecture`
  resolves `codeProducing: false`, so no binding executes the placeholder; adding pi support
  for a phase pi's own manifest never enables is speculative work.
