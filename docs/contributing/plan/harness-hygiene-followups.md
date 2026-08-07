# Plan — harness hygiene follow-ups

> Source: design doc `docs/contributing/design/harness-hygiene-followups.md` · ADRs 343, 344,
> 345, 346, 347, 348, 349, 350 (all accepted; ADR-348 supersedes ADR-050)
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

## Preamble — read this once

**Working tree.** All seven parts land sequentially in the same worktree
(`chore/harness-hygiene-followups`). Each part is one atomic conventional commit. Never
commit on a red gate.

**No provenance refs.** Source and test files must carry no ADR numbers, phase numbers,
backlog ids, or "DC-n" tokens. Explain *why* in plain terms instead. `test/p22-memory.test.js`
actively greps `engine/src/observability/memory.js` and `engine/test/memory.test.js` for
`P22|ADR-[0-9]` and fails if either appears.

**No suppression directives** of any flavour, and no swallowed errors.

**Ordering is load-bearing, in three places.**

1. Part 1 first. The tree is **already red** on `node engine/bin/readme-drift.js` — the
   decisions phase landed eight ADRs and this plan file lands a 27th plan, while `README.md`
   still advertises 342 ADRs and 26 plans. Until Part 1 lands, `bash scripts/ci.sh` cannot be
   green for reasons unrelated to any other part.
2. Part 2 (hermetic pi CLI test) **must precede** Part 3 (the `spawnPi` stdin fix). `pi` IS
   installed on this machine. Today `adapters/pi/test/cli.test.js` spawns it and hangs, because
   the child blocks on an open stdin forever. Part 3 unblocks that child — so if Part 3 landed
   first, that same test would reach a *working* `pi` and do real, billed provider work on every
   suite run. Hermeticity first, then the production fix.
3. Part 5 (engine declines a degraded save) **must precede** Part 6 (the store data repair).
   No gate forces this — it is a data-safety ordering. `.claude/craft-memory.md` is unreadable
   right now, so for as long as it stays that way any `save` that completes rewrites it as that
   run's delta alone and the 67 entries are gone irreversibly — including a save from the very
   session running this change. Part 5 closes that window; Part 6 then repairs the data behind
   an already-closed window.

Parts 4 and 7 are order-independent relative to the rest; keep them where they are.

**Cross-part file overlaps, stated rather than merged.** Three paths are named by more than one
part's context block. Each split is deliberate (`plan-lint`'s overlap detector under-reports
here — its backtick pairing is confused by fenced code blocks — so treat this list, not the
lint output, as the record):

- `adapters/pi/src/run.js` — Part 2 needs its walk order to justify the synthetic PATH
  contents; Part 3 changes one function inside it; Part 7 names it only to say what NOT to
  edit. Merging 2 and 3 would put a production fix and the test-environment fix in one commit
  and destroy the ordering constraint above.
- `engine/src/observability/memory.js` — Part 5 *changes* it; Part 6 only *calls* its
  `parseStore`/`serializeStore` to canonicalize a data file. Separate because one is a
  behaviour change with unit coverage and the other is a data repair with a real-store guard;
  they fail for different reasons and revert independently.
- `engine/src/observability/usage-aggregate.js` — Part 4 changes it; Part 7's boundary rule
  names it as the pure-core anchor and must not modify it. Merging would fold a threshold
  recalibration into a phase-enablement commit.

**Out of scope — do not touch.** `docs/contributing/metrics-baseline.report.json` (do not
re-mine, do not regenerate — it is current and Part 4 only reads it); the declined `--until`
flag; any published cost figure in `README.md` or `docs/guides/comparison.md`. One
`telemetry.js` LogicalOperator survivor reported by the mutation runner is a known runner
artifact — do not chase it and do not plan work for it. **No part in this plan requires
touching anything on that list** — Part 4 reads the baseline report and never writes it, and
Part 1's README edit is a corpus count, not a cost figure.

**Already done, do not redo.** `docs/contributing/adr/050-architecture-report-gate-and-exceptions.md`
already carries `Status: superseded by ADR-348` and its superseding note — the decisions phase
landed it. No part touches that file.

**Phase gate**, run once at the phase boundary, from the repo root, with **no PATH preamble**:
`bash scripts/ci.sh`.

## Part 1 — Recount the advertised ADR and plan corpora

### Context

`README.md` lines 180-181 read exactly:

```
receipts: [28 design docs](docs/contributing/design/), [26 parted plans](docs/contributing/plan/),
[342 ADRs](docs/contributing/adr/), and [raw telemetry for 25 runs](docs/contributing/metrics-baseline.report.json)
```

`engine/src/readme-drift-main.js` → `corpusCountFindings(root, corpusClaims)` (around L119-127)
recounts each linked directory's `*.md` files and emits
`corpus-counts: <dir> claims <n>, tree holds <m>` on a mismatch. The sub-test *"Given the live
repo tree, when readme-drift runs, then it exits 0 with no findings"*
(`test/readme-drift.test.js:96-102`, assertion at L100) runs the whole guard against the real
repo root inside `run_suite process test`.

Measured in this worktree right now:

```
$ node engine/bin/readme-drift.js
readme-drift: corpus-counts: docs/contributing/adr/ claims 342, tree holds 350
exit=1
```

Once this plan file is committed the plan directory holds 27, so a second finding appears.
Design docs are already correct at 28 (the design commit bumped 27 → 28).

Change exactly two numbers on those two lines: `26 parted plans` → `27 parted plans` and
`342 ADRs` → `350 ADRs`; leave `28 design docs` and `raw telemetry for 25 runs` untouched.

**Do not touch any cost figure.** The README FAQ cost sentence is guarded by a *different*
sub-guard (`telemetryFindings`, recomputed from
`docs/contributing/metrics-baseline.report.json`) and is explicitly out of scope; it is
currently clean.

**Do not touch the README phase list or the yaml manifest snippet.** The `phase-names`
sub-guard derives its truth set from `pipeline/default.yml` via `enabledPhaseIds`, not from
`.claude/workflow.md`, so Part 7's manifest edit does not touch this surface either.

**Public surface:** none. No new exported symbol; this part edits prose counts only.

### TDD steps

1. **RED** — from the repo root, run `node --test test/readme-drift.test.js`. Expected
   failure: the live-tree sub-test fails with `actual 1, expected 0`, and its message carries
   `corpus-counts: docs/contributing/adr/ claims 342, tree holds 350` plus
   `corpus-counts: docs/contributing/plan/ claims 26, tree holds 27`. This is a pre-existing
   red, not one you introduce — confirm **both** findings appear before editing. The other
   three sub-tests (phase-names, manifest-snippet, telemetry) must already be green; if one is
   not, raise a blocker rather than absorbing it here.
2. **GREEN** — edit the two `README.md` lines to `27 parted plans` and `350 ADRs`. Re-run;
   `node engine/bin/readme-drift.js` must print nothing and exit 0.
3. **REFACTOR** — none available; this is a two-token prose correction. Re-verify by recount:
   `ls docs/contributing/adr/*.md | wc -l` → 350, `ls docs/contributing/plan/*.md | wc -l` → 27,
   `ls docs/contributing/design/*.md | wc -l` → 28.

### Gate

```
node --test test/readme-drift.test.js          # cwd: repo root
node engine/bin/readme-drift.js                # cwd: repo root — must print nothing, exit 0
```

### Commit

`fix(readme-drift): recount the advertised ADR and plan corpora`

## Part 2 — Pin the pi subprocess guard's own environment

### Context

`adapters/pi/test/cli.test.js` is ESM (`import { describe, it } from 'node:test';`). Its
current head:

```js
const __dir = dirname(fileURLToPath(import.meta.url));
const PKG_PATH = join(__dir, '..', 'package.json');
const CLI_PATH = join(__dir, '..', 'src', 'cli.js');

function runCli(...args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' });
}
```

The first `describe` block (`cli.js — thin bin entrypoint`, three tests) only reads files —
leave it completely alone. The second block, `cli.js — subprocess execution guard`, holds the
three tests that call `runCli()`. Above it sits a comment block that states the false premise
this part removes:

```
// These run cli.js as a real Node subprocess so the import.meta.url guard fires
// and process.exit is actually called. The pi binary is not installed in CI so
// main() always exits 2 — but the exit code and stderr are sufficient to prove
// the guard ran, the block ran, process.argv was sliced, and io was wired.
```

That premise is a property of the CI runner's inventory. `pi` resolves to
`/Users/scolladon/.n/bin/pi` on this machine, and `node` resolves to
`/Users/scolladon/.n/bin/node` — the **same directory**, so the two cannot be separated by
dropping a PATH entry. The fix is to construct the environment, not to filter one.

**Walk order that decides what the synthetic PATH must contain.** `adapters/pi/src/cli.js`
calls `main()` in `adapters/pi/src/run.js`, which walks the resolved pipeline:

- `workspace` is role-less and calls `gitProbe.isGitRepo()` →
  `spawnSync('git', ['rev-parse', '--is-inside-work-tree'])` via
  `buildRolelessProbes` in `adapters/pi/src/roleless-probes.js`. `adapters/pi/src/roleless.js`
  `workspace()` blocks with `{ unit: workspace, reason: no git repository in checkout }` when
  that probe fails.
- `requirements` is disabled.
- `design` is a worker phase (`WORKER_PHASE_IDS` in `adapters/pi/src/run.js`) → `spawnPi`.
- `gh` is only reached at `propose`, and the pi manifest's `node --test` gate only runs on
  code-producing phases. Neither is reachable before the blocker.

So the synthetic PATH needs **node and git, and nothing else** — and the cwd must be a real
git repo, or the walk blocks one phase too early with a message that contains no `pi` and the
test would fail loudly instead of passing vacuously.

**Measured, on this machine, with `pi` installed** (a `mkdtemp` root holding `bin/` with
symlinks to `process.execPath` and the resolved `git`, plus `repo/` after `git init -q`):

| PATH | cwd | Outcome |
|---|---|---|
| ambient | throwaway git repo | hangs — SIGTERM at a 30 s bound, `status=null`, empty stderr |
| synthetic (`node` + `git` only) | throwaway git repo | **exit 2 in ~157 ms**, stderr exactly `{ unit: pi-run, reason: spawn pi ENOENT }` |
| synthetic (`node` + `git` only) | non-git dir | exit 2, stderr `{ unit: workspace, reason: no git repository in checkout }` |

Reproduced through `spawnSync` with `env: { ...process.env, PATH: binDir }`:

```
status 2
stderr JSON: "{ unit: pi-run, reason: spawn pi ENOENT }"     ← no trailing newline
stdout JSON: ""
```

Negative control, same synthetic PATH: `spawnSync('pi', ['--version'])` yields
`status === null` and `error.code === 'ENOENT'`.

**Precedent to follow: `test/hermetic-suite.test.js`.** Its discipline is to build the hostile
ambient inside the test with `fs.mkdtempSync`, hand it to the child, and tear it down in a
`finally` with `fs.rmSync(dir, { recursive: true, force: true })`.

Two construction constraints that are easy to get wrong:

- Root the temp tree at `os.tmpdir()`, **never inside the worktree**. A directory inside the
  craft checkout is already inside a git work-tree, so `git rev-parse --is-inside-work-tree`
  would pass for the wrong reason, and the tree would be polluted.
- Do **not** seed a manifest into the temp cwd. `adapters/pi/src/run.js` (around L269-270)
  resolves its manifest against `adapters/pi/.claude/workflow.md` — the adapter's own directory
  — not against the process cwd. A bare `git init` directory is all the walk needs, which is
  what the measured row above used.

**Resolving `git` without a swallowed error.** Resolve it from the ambient PATH *before*
imposing the synthetic one, and fail the test loudly if it cannot be found. Use a throw-free
scan rather than `accessSync` in a `try`:

```js
function resolveOnPath(binary) {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, binary);
    const stat = statSync(candidate, { throwIfNoEntry: false });
    if (stat?.isFile() && (stat.mode & 0o111) !== 0) return candidate;
  }
  return null;
}
```

`node` needs no resolution — it is `process.execPath` (absolute).

**Public surface:** none. This is a test-infra-only part; it produces no `src/` delta, which is
exactly why it is standalone (there is no implementation part to fold it into).

**PROOF OBLIGATION — this part is not done until it is discharged.** `pi` is installed on this
machine. After the part's own gate is green, run `bash scripts/ci.sh` from the repo root with
**no PATH preamble, no stubs, nothing prepended**, and confirm it completes. That completion —
not the unit gate — is the acceptance evidence that the hang is gone. If ci.sh surfaces a red
unrelated to this part, raise a blocker `{ unit, reason, ≤3 options }` rather than absorbing it
here.

### TDD steps

1. **RED (a) — the hermetic construction is absent.** Add the negative-control test to the
   `cli.js — subprocess execution guard` block first: build the throwaway root, then assert
   `spawnSync('pi', ['--version'], { env: { ...process.env, PATH: binDir } })` yields
   `error.code === 'ENOENT'`. Expected failure before the root exists: `binDir` is undefined /
   the helper does not exist — a `ReferenceError`/`TypeError` from the test file. This test is
   the guard against the whole construction silently degrading back to the ambient PATH.
2. **RED (b) — the assertion is not yet strict.** Tighten the second existing test from
   `assert.ok(result.stderr.includes('pi'))` to
   `assert.equal(result.stderr.trim(), '{ unit: pi-run, reason: spawn pi ENOENT }')`.
   Expected failure on the current `runCli`: on this machine the subprocess hangs and is killed,
   so `result.status` is `null` (not 2) and `result.stderr` is empty — the run does not even
   reach the string comparison within a sane bound.
3. **GREEN** — rewrite `runCli` to spawn under the constructed environment:
   - `before()` (from `node:test`, scoped to this `describe`): `root = mkdtempSync(join(tmpdir(), 'craft-pi-cli-'))`;
     `mkdirSync(join(root, 'bin'))`; `symlinkSync(process.execPath, join(root, 'bin', 'node'))`;
     resolve `git` via `resolveOnPath('git')` and `assert.ok(gitPath, …)` — an unresolvable
     `git` fails the test loudly; `symlinkSync(gitPath, join(root, 'bin', 'git'))`;
     `mkdirSync(join(root, 'repo'))`; `spawnSync(gitPath, ['init', '-q', join(root, 'repo')])`
     and assert its status is 0.
   - `runCli(...args)` becomes
     `spawnSync(process.execPath, [CLI_PATH, ...args], { cwd: repoDir, env: { ...process.env, PATH: binDir }, encoding: 'utf8' })`.
   - `after()`: `rmSync(root, { recursive: true, force: true })`.
   All three existing subprocess tests keep their assertions and now run under this environment;
   the first (`typeof result.status === 'number'`) and third (`result.status !== null`) become
   meaningful rather than accidental.
4. **REFACTOR** — replace the stale comment block above the `describe` so it states what is
   true: the tests construct a temporary root with a synthetic PATH holding only `node` and
   `git` and a `git init` cwd, so `pi` is genuinely absent and the OS produces a real `ENOENT`
   — never a stub returning a rehearsed code. Do not name an ADR. Keep the two mutant-analysis
   notes inside the tests (they are still accurate) and re-read them for wording that still
   claims CI inventory.
5. **PROOF** — `bash scripts/ci.sh` from the repo root, no PATH preamble. Record the wall time;
   it must complete rather than hang.

### Gate

```
cd adapters/pi && node --test test/cli.test.js
bash scripts/ci.sh                              # cwd: repo root, NO PATH preamble — the proof obligation
```

### Commit

`test(pi): pin the subprocess guard's environment instead of the machine's`

## Part 3 — End the child's stdin instead of an option execFile drops

### Context

`adapters/pi/src/run.js`, current signature and body (around L73-84):

```js
function runSubprocess(file, args, options, unit, execFileFn) {
  return new Promise((resolve, reject) => {
    execFileFn(file, args, options, (err, stdout, stderr) => {
      if (err) {
        const detail = stderr.trim() || err.message;
        reject(new Error(`{ unit: ${unit}, reason: ${detail} }`));
        return;
      }
      resolve(stdout);
    });
  });
}
```

Two callers, both in the same file:

```js
export function spawnPi(argv, opts, execFileFn = _execFile) {
  const options = { cwd: opts.cwd, env: opts.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  return runSubprocess('pi', argv, options, 'pi-run', execFileFn);
}

export function runGate(command, opts, execFileFn = _execFile) {
  const [file, ...args] = command.split(/\s+/);
  const options = { cwd: opts.cwd, encoding: 'utf8' };
  return runSubprocess(file, args, options, 'gate', execFileFn);
}
```

`spawnPi`'s doc comment pins the discipline as *"stdio[0] === 'ignore' (stdin ignored — pi
hangs on an open stdin pipe in -p mode)"*. **`child_process.execFile` silently drops `stdio`**
— it is not in its option set. Measured on this machine:

```
execFile('cat', [], { encoding:'utf8', stdio:['ignore','pipe','pipe'] }, cb)
  → callback never fires; STILL BLOCKED at 2500 ms
same call + child?.stdin?.end()
  → child.stdin is a Socket; callback fires at 6 ms with err=null, stdout=""
```

Against the real binary: `execFile('pi', …, { stdio: ['ignore', …] })` is killed by SIGTERM at
a 20 s bound with empty stdout and stderr, while `spawn` with the same intent exits 0 in
1317 ms with a real JSONL stream.

**The fix, minimal and DI-preserving:** capture the child `execFileFn` returns and end its
stdin.

```js
const child = execFileFn(file, args, options, (err, stdout, stderr) => { /* unchanged */ });
child?.stdin?.end();
```

The optional chaining is **load-bearing, not defensive garnish**: every existing test injects
an `execFileFn` double (`makeExecFileDouble()` at `adapters/pi/test/run.test.js:476-485`) that
returns `undefined`. Without `?.` the whole existing suite throws. Keep the `execFileFn` seam
exactly as it is — no signature change, no new parameter, no switch to `spawn`.

`runGate` shares `runSubprocess` and inherits the fix; that is intended, and it is why the fix
goes in the shared wrapper rather than in `spawnPi`.

**The two construction assertions stay but stop counting as coverage.**
`adapters/pi/test/run.test.js:488` (*"then stdio[0] is ignore (stdin ignored)"*, asserting
`captured.options.stdio[0] === 'ignore'`) and `:717` (*"then stdio is [ignore, pipe, pipe]"*,
asserting `deepEqual(captured.options.stdio, ['ignore','pipe','pipe'])`) prove the option was
*constructed* on a spy. They may remain as caller-contract checks. They cannot distinguish the
current behaviour from the fixed one, so the new effect test is the behavioural coverage.

**Public surface:** none. `runSubprocess` is module-private; `spawnPi` and `runGate` keep their
exported signatures byte-for-byte.

### TDD steps

1. **RED — an effect test that spawns a real child blocked on stdin.** Add a
   `describe('runSubprocess() — stdin discipline', …)` block near the existing `spawnPi()`
   blocks in `adapters/pi/test/run.test.js`. It must observe a real OS child, not a spy.
   Inject a **capturing pass-through** rather than the default so the test can clean up on the
   red path:

   ```js
   import { execFile as realExecFile } from 'node:child_process';
   let child = null;
   const capturing = (file, args, options, cb) => {
     child = realExecFile(file, args, options, cb);
     return child;                       // runSubprocess ends THIS child's stdin
   };
   ```

   Call `runGate('cat', { cwd: process.cwd() }, capturing)`. `cat` with no argv reads stdin to
   EOF and exits 0, so a resolved promise proves stdin was closed and a hang proves it was not
   — the pass-through itself never touches stdin, so the only thing that can close it is the
   code under test. Bound it: race the promise against a `setTimeout` rejection (2000 ms is
   ~300× the measured 6 ms), assert the resolution won with a message naming the defect ("the
   child's stdin was never ended"), and in a `finally` clear the timer **and** `child?.kill()`
   — without the kill, a red run leaves an immortal `cat` holding the event loop and the test
   runner never exits. This test needs no `pi`, no network, and runs anywhere Node runs.
   Expected failure before the fix: the timeout wins at 2000 ms (measured: the callback has
   still not fired at 2500 ms).
2. **GREEN** — add the two-token change to `runSubprocess`: capture the return value as `child`
   and call `child?.stdin?.end();` immediately after the `execFileFn(...)` call, inside the
   Promise executor.
3. **REFACTOR** — update `spawnPi`'s doc comment so it states the mechanism honestly: stdin is
   closed by ending the child's stdin stream, because the `stdio` option is not honoured by the
   underlying runner. Keep the `stdio: ['ignore','pipe','pipe']` entry in the options bag (it is
   still the declared intent and two tests pin it) but stop describing it as the thing that does
   the work. No ADR numbers, no phase refs.
4. Confirm the whole `adapters/pi` suite is still green — the injected doubles must not throw,
   which is what `?.` buys.

### Gate

```
cd adapters/pi && node --test test/run.test.js
cd adapters/pi && node --test test/cli.test.js   # Part 2's hermetic suite must stay green under the fix
```

### Commit

`fix(pi): end the child's stdin instead of an option execFile drops`

## Part 4 — Key review-waste on billed turns rather than spawn count

### Context

`engine/src/observability/usage-aggregate.js` — the pure aggregate core (module header:
*"No clock, no random, no model-id literals, no runtime paths"*). Three sites change.

L11, the exported constant:

```js
export const REVIEW_WASTE_CYCLES = 2;
```

L302-314, the rule:

```js
function reviewWasteRecs(runs) {
  return runs.flatMap(run =>
    run.reviewCycles
      .filter(rc => rc.cycles > REVIEW_WASTE_CYCLES)
      .map(rc => ({
        kind: 'review-waste', run: run.run, phase: 'review', model: null,
        detail: `role ${rc.role} has ${rc.cycles} review cycles`,
        evidence: {
          role: rc.role, cycles: rc.cycles, billedTurns: rc.billedTurns,
          totalCost: rc.totalCost, maxCost: rc.maxCost, meanCost: rc.meanCost,
        },
      }))
  );
}
```

The changes, and only these:

| Site | From | To |
|---|---|---|
| L11 | `export const REVIEW_WASTE_CYCLES = 2;` | `export const REVIEW_WASTE_BILLED_TURNS = 85;` |
| L305 filter | `rc.cycles > REVIEW_WASTE_CYCLES` | `rc.billedTurns > REVIEW_WASTE_BILLED_TURNS` |
| L307 `detail` | `` `role ${rc.role} has ${rc.cycles} review cycles` `` | a string naming the role and the **billed turns**, e.g. `` `role ${rc.role} billed ${rc.billedTurns} turns across review` `` |
| `evidence` | six keys | **unchanged, byte for byte** — `{ role, cycles, billedTurns, totalCost, maxCost, meanCost }` |
| `kind` | `review-waste` | **unchanged** |

`evidence` mirrors its source `reviewCycles` entry, not the filter — a field earns its place by
being part of the entry the recommendation points at, not by being read by the predicate. Do not
add a `firedOn` discriminator. Do not drop `cycles`.

**Why 85.** Over `docs/contributing/metrics-baseline.report.json` (n=16 `reviewCycles` entries,
all `role: reviewer`): `cycles` sorted is `[2,3,4,4,4,4,5,5,5,5,5,6,6,6,7,10]` — 12 of 16 sit
in 4..6, so no cycles threshold separates cheap reviews from expensive ones. `billedTurns`
sorted is `[20,30,30,35,35,36,38,43,53,58,59,65,112,116,155,278]` — one genuine empty band at
65 → 112. 85 is that band's geometric midpoint (√(65×112) ≈ 85.3), so any value in the band is
behaviourally identical. `billedTurns` correlates with priced cost at r=0.988 (ρ=0.891) versus
`cycles` at r=0.829 (ρ=0.715). Today's rule fires 15/16 (94%); the new one fires 4/16 (25%) —
the four most expensive reviews, including a `cycles: 4` / 112-turn / $12.45 review that every
useful cycles threshold misses.

**Degradation on older data is already correct and must stay so.** A `reviewCycles` entry
predating the `billedTurns` field yields `undefined > 85` → `false` → no recommendation. Never
a `NaN`, never a throw. This matches the module's stated discipline ("Numerically safe on
malformed/older-schema groups").

**How the two axes are computed** (`buildReviewCycles`, L201-224) — you need this to build
fixtures: entries are grouped by `role` within a run; `cycles = distinctSpawnCount(evts)`,
`billedTurns = evts.length`. So N review events with the same `role` and only 3 distinct
`spawnId`s give `cycles: 3, billedTurns: N`. That shape is the discriminating case worth a test.

**Consumer — `engine/src/tune-plan.js` L97-99**, inside `recAdvisories`:

```js
} else if (rec.kind === 'review-waste') {
  out.push(advisoryProposal('review-waste',
    `${rec.evidence?.role ?? 'reviewer'} burned ${rec.evidence?.cycles ?? '?'} review cycles — consider a cheaper reviewer tier`, rec.evidence));
}
```

This must name the axis that actually fired (`billedTurns`), keeping the `?? 'reviewer'` /
`?? '?'` fallbacks — three tests pin them.

**Test surfaces to extend, never duplicate** — `engine/test/usage-aggregate.test.js`
(`makeEvent(overrides)` helper at L22-34; `PRICE_TABLE` at L17-20):

| Line | What it is | What it needs |
|---|---|---|
| L10 | import list | `REVIEW_WASTE_CYCLES` → `REVIEW_WASTE_BILLED_TURNS` |
| L308-311 | exported-constant pin ("positive integer") | follows the rename; still a positive integer |
| L394-420 | "three review events from three distinct spawns … `evidence.cycles === 3`, `evidence.billedTurns === 3`" | its real subject is the `evidence` aggregates — keep those assertions, rebuild the fixture so it crosses the new threshold |
| L713-729 | `detail` string + `phase: 'review'` | `detail` expectation follows the new wording; `phase` unchanged; fixture must fire |
| L733-748 | `sortedRecs` ordering across kinds | `kind` does not change, but the fixture must still produce a firing review-waste rec |
| L879, L905 | `Array.from({ length: REVIEW_WASTE_CYCLES + 1 }, …)` in the renderMarkdown / serializeReport tests | length follows the new constant |
| L982-990 | strict-inequality boundary ("exactly the threshold must not fire; it is `>`, not `>=`") | re-point at billed turns; extend to a T-1 / T / T+1 edge matrix |

`engine/test/tune-plan.test.js`: L203-233 deep-equals the advisory proposal object including
`rationale: 'reviewer burned 4 review cycles — consider a cheaper reviewer tier'` with
`evidence: { role: 'reviewer', cycles: 4 }` — extend the evidence with `billedTurns` and follow
the reworded sentence. L235-245 and L375-382 pin the two fallback paths (missing role/cycles,
and no `evidence` object at all) — both assert the same rationale string and must follow.
L384-401 asserts proposal source ordering; its `review-waste` fixture is shape-only.

**Living-intention obligation — `docs/contributing/specs/telemetry.md`.** Its frontmatter is
`subjects: ['engine/src/observability/**']`, which covers this file. Its §Recommendations
`review-waste` example is at L461-482 and reads *"a review role accumulated more cycles than the
configured threshold"* with `"detail": "role reviewer has 5 review cycles"`. Restate the prose
in terms of billed effort, refresh the `detail` line, and leave the `evidence` block exactly as
it is — the sentence below it (*"`evidence` mirrors its `reviewCycles` entry exactly,
`billedTurns` included"*) is now doubly load-bearing and must stay true. Note this page is
scanned by `test/source-hygiene.test.js` class A: do not introduce the words `mutation`/`mutant`
or a dependency-analysis tool name into it.

**Public surface — decided here, not later.** `REVIEW_WASTE_BILLED_TURNS` is a **public** engine
export replacing a public one. The repo has no barrel/index files, so the complete downstream
surface is: the import list at `engine/test/usage-aggregate.test.js:10`, and the living page
`docs/contributing/specs/telemetry.md`. `engine/src/observability/usage-mine-main.js` L52 imports
only `aggregate, serializeReport, renderMarkdown, DEFAULT_DRIFT_THRESHOLD` — untouched. Pre-pay
both surfaces in this part. `docs/contributing/plan/usage-telemetry-miner.md` L188/L226 name the
old constant: **leave it stale on purpose** — it is a dated record of what was built then, and
rewriting history is not a surface gate.

### TDD steps

1. **RED (a) — the constant.** Rename the import at `engine/test/usage-aggregate.test.js:10`
   and the pin at L308-311 to `REVIEW_WASTE_BILLED_TURNS`. Expected failure:
   `SyntaxError: The requested module … does not provide an export named
   'REVIEW_WASTE_BILLED_TURNS'`.
2. **RED (b) — the axis, expressed as the case the old rule gets wrong.** Add a test whose
   fixture has a *high* cycle count and a *low* billed-turn count: five review events, same
   `run`, same `role: 'reviewer'`, five distinct `spawnId`s → `cycles: 5`, `billedTurns: 5`.
   Assert **no** `review-waste` rec is emitted — five spawns over five turns is a cheap review.
   Expected failure before the change: `5 > 2` fires the rule, so `waste.length` is 1 where 0 is
   expected. This is exactly the "flags cheap reviews" half of the defect.
3. **RED (c) — the boundary matrix.** Re-point L982-990 and extend it to three cases built with
   `Array.from({ length: N }, (_, spawnId) => makeEvent({ phase: 'review', role: 'reviewer', spawnId }))`:
   `N = REVIEW_WASTE_BILLED_TURNS - 1` (84 → no rec), `N = REVIEW_WASTE_BILLED_TURNS`
   (85 → no rec; the threshold is `>`, not `>=`), `N = REVIEW_WASTE_BILLED_TURNS + 1`
   (86 → exactly one rec). Expected failure at 84 and 85: the old rule fires (84 and 85 distinct
   spawns are both `> 2`), so `waste.length` is 1 where 0 is expected.
4. **RED (d) — the detail prose.** Update L713-729's fixture to a firing one and change its
   assertions from *"detail must include cycle count"* to detail naming the role and the billed
   turn count. Expected failure: the current detail says `has 3 review cycles`.
5. **RED (e) — the advisory sentence.** Update `engine/test/tune-plan.test.js` L203-233,
   L235-245 and L375-382 to the reworded rationale (billed turns, same `?? 'reviewer'` /
   `?? '?'` fallbacks). Expected failure: `deepEqual` on the proposal object reports the old
   `burned 4 review cycles` string.
6. **GREEN** — apply the three `usage-aggregate.js` edits and the one `tune-plan.js` edit from
   the table above. Nothing else in either file moves.
7. **GREEN-side pin — the case the old rule also gets wrong, in the other direction.** Rebuild
   L394-420's fixture to a *low* cycle count with a *high* billed-turn count: 86 review events,
   same `run`, same `role: 'reviewer'`, `spawnId` cycling over exactly three values →
   `cycles: 3`, `billedTurns: 86`. Keep its existing assertions (a rec IS emitted; numeric
   `totalCost`/`meanCost` aggregates; `totalCost.priced === meanCost.priced * billedTurns`) and
   update the two evidence numbers. This is the `cycles: 4` / 112-turn / $12.45 shape from the
   real corpus — a review no useful cycles threshold catches. It is not a RED entry: the old
   rule also fires here, for the wrong reason. It is the pin that stops a future "just raise the
   cycles threshold" from looking correct.
8. **REFACTOR + fixture repair** — the length-based fixtures at L879 and L905 and the
   `sortedRecs` fixtures at L733-748 must still produce a firing rec; switch them to the new
   constant. Extract the repeated "N review events for one reviewer role, over M distinct
   spawns" builder into one local helper in `engine/test/usage-aggregate.test.js` rather than
   repeating `Array.from(...)` six times.
9. **Acceptance evidence for the fire-rate requirement (not a unit test).** Read
   `docs/contributing/metrics-baseline.report.json` in a scratch script and confirm, over
   `runs[*].reviewCycles` (n=16, all `role: reviewer`): `cycles > 2` selects 15 entries while
   `billedTurns > 85` selects exactly 4 — the four most expensive, at
   `(cycles 6, 116 turns, $13.63)`, `(7, 155, $17.84)`, `(10, 278, $26.80)` and
   `(4, 112, $12.45)`. The committed report's own `recommendations` array carries 15
   `review-waste` entries out of 38; those stay as they are. **Do not regenerate or rewrite that
   report** — read it only, and do not commit the scratch script.
10. Refresh `docs/contributing/specs/telemetry.md` §Recommendations per the Context block.

### Gate

```
cd engine && node --test test/usage-aggregate.test.js test/tune-plan.test.js
node --test test/source-hygiene.test.js      # cwd: repo root — telemetry.md is in its scanned set
```

### Commit

`fix(telemetry): key review-waste on billed turns rather than spawn count`

## Part 5 — Decline the save when the load was degraded

### Context

`engine/src/observability/memory.js` (650 lines). Relevant shapes as they stand today.

The view factory (L69-71):

```js
function emptyView(note) {
  return { entries: emptyEntries(), evicted: [], loadNote: note };
}
```

`load` (L199-218) has four exits:

```js
export function load(repoRoot, deps) {
  const storePath = resolveStorePath(repoRoot, deps.ref);
  if (!storePath) return emptyView('store path outside repo');      // ← DEGRADED
  let rawContent;
  try { rawContent = deps.readStore(storePath); }
  catch { return emptyView('no store'); }                            // ← cold start, NOT degraded
  if (!rawContent) return emptyView('no store');                     // ← cold start, NOT degraded
  const parsed = parseStore(rawContent);
  if (!parsed) return emptyView('malformed store');                  // ← DEGRADED
  return applyValidators(parsed.entries, deps.validators ?? {});     // ← real read
}
```

`applyValidators` (L265-283) returns `{ entries, evicted, loadNote }` where `loadNote` is
`'some entries failed validate-on-read'` or `null`.

`save` (L626-650) ends:

```js
  const finalView = { entries: evictedEntries, evicted: [], loadNote: null };
  const storePath = resolveStorePath(repoRoot, deps.ref);
  if (!storePath) return { writeNote: 'save skipped: store path outside repo', view: finalView };
  const content = serializeStore(finalView);
  try { deps.writeStore(storePath, content); return { writeNote: null, view: finalView }; }
  catch (err) { … return { writeNote: `save failed: ${reason}`, view: finalView }; }
```

**The composition defect.** With `loadNote: 'malformed store'` the view's `entries` are empty,
so `reconcile(view.entries, delta, provenance)` (L633) produces exactly this run's delta and
`serializeStore` writes it as the *whole* store. One malformed byte plus one run destroys every
accumulated entry. Nothing throws and nothing gates — which is why it survived.

**The change.**

1. Add a private `degradedView(note)` beside `emptyView`, returning
   `{ ...emptyView(note), degraded: true }`. Use a second function rather than a boolean
   parameter on `emptyView` — a boolean param at the call site reads as noise and the two
   call sites mean genuinely different things.
2. `emptyView` returns `degraded: false`; `applyValidators`'s return gains `degraded: false`.
   The field is **always present and always boolean** — never `undefined`, so no caller needs a
   truthiness dance.
3. Route the two failure exits through `degradedView`: `'store path outside repo'` and
   `'malformed store'`. **`'no store'` keeps `emptyView`** — a cold repo with no store file yet
   must still get its first write. That distinction is the whole point of this part; test it
   explicitly in both directions.
4. `save` gains one guard, placed after `finalView` is built and immediately before the existing
   `storePath` guard, so the two skip paths read as siblings:

```js
  const finalView = { entries: evictedEntries, evicted: [], loadNote: null };   // unchanged
  if (view.degraded) return { writeNote: 'save skipped: load was degraded', view: finalView };
  const storePath = resolveStorePath(repoRoot, deps.ref);                        // unchanged
```

   Returning `finalView` (rather than the input view) matches the existing
   `'save skipped: store path outside repo'` sibling exactly and keeps `save`'s return contract
   uniform. Nothing throws, nothing gates, no new failure mode.

**Consequence worth pinning in a test:** a view produced by `load` with an escaping `ref` is now
degraded, so a subsequent `save` short-circuits at the new guard with
`'save skipped: load was degraded'` rather than at the path guard. The existing test at
`engine/test/memory.test.js:970-978` builds its view with `makeLoadedView([])` (not degraded)
and passes an escaping `ref` to `save`, so it still exercises — and still asserts —
`'save skipped: store path outside repo'`. It must stay green unchanged.

**Nothing leaks into the store file.** `serializeStore` (L110-129) writes only
`frontmatterData[concern] = view.entries[concern] ?? []` for each of `CONCERNS`, so the new
field never reaches disk. Verify this rather than assume it.

**Test surfaces** — `engine/test/memory.test.js` (2465 lines, ESM, fully fixture-driven with
injected deps; imports `CONCERNS, parseStore, serializeStore, load, save, FLOOR, CEILING, STEP, WINDOW`
at L14):

- The two malformed-store load tests sit at L111-124 and L156-161; put the new degraded-flag
  load assertions beside them.
- The `'no store'` tests are just above (around L100-109).
- The save-path suite runs from ~L1218 to ~L1885 and is the reconciler's regression surface. It
  must stay **green and unchanged** — that is the evidence this part is additive rather than a
  behaviour change. Its `makeSaveDeps(...)` helper (used at L950, L975, and throughout) is the
  `writeStore` spy to reuse.
- No test deep-equals a whole view object, so adding a field breaks nothing (verified by grep).

**Public surface — decided here.** No new exported symbol. The change is a **public field on the
returned `MemoryView`** (`degraded: boolean`) and a new `writeNote` value. Its downstream
surface gates in this repo: (a) `docs/contributing/specs/memory.md` — the governing spec, which
must state the semantics on **both** verbs (`load` post, `save` pre and post); (b)
`docs/contributing/specs/telemetry.md` carries `subjects: ['engine/src/observability/**']` and
is refreshed by Part 4 in this same change, which discharges the living-intention obligation for
this file too. `skills/run/SKILL.md` (around L505-522) describes the `save` call site — read it
and confirm no wording there becomes false; it already frames a failed save as a recorded,
non-blocking warning, which this reuses, so no edit is expected. `engine/src/tune-plan-main.js`
`loadMemory` uses `parseStore` only, never `load`/`save` — unaffected.

`docs/contributing/specs/memory.md` has **no** `subjects:` frontmatter, so the intention lint
never watches it — updating it is a plan obligation, not something a gate will remind you of.
Giving it a `subjects:` declaration is explicitly out of scope for this change.

### TDD steps

1. **RED (a) — malformed load marks the view.** Beside the existing malformed-store tests, add:
   `load('/repo', { readStore: () => '---\na: b: c\n---\n', validators: ALL_PASS_VALIDATORS })`
   → `result.degraded === true` and `result.loadNote === 'malformed store'`. Expected failure:
   `undefined !== true`.
2. **RED (b) — a cold start is NOT degraded.** `load('/repo', { readStore: () => null, … })` →
   `result.loadNote === 'no store'` and `result.degraded === false`. Expected failure:
   `undefined !== false`. Add the same for a `readStore` that throws.
3. **RED (c) — the escaping ref is degraded.** `load('/repo', { ref: '../../etc/passwd', … })` →
   `loadNote === 'store path outside repo'` and `degraded === true`. Expected failure:
   `undefined !== true`.
4. **RED (d) — a clean load is not degraded.** A well-formed store through `applyValidators` →
   `degraded === false`, including the partial-eviction path where
   `loadNote === 'some entries failed validate-on-read'`. Expected failure: `undefined !== false`.
5. **RED (e) — save declines over a degraded view.** Build the view by actually calling `load`
   over a malformed store (not by hand-rolling a literal), so the test pins the **composition**
   that is the defect, not just the flag plumbing:
   `const view = load('/repo', { readStore: () => '---\na: b: c\n---\n', validators: ALL_PASS_VALIDATORS });`
   then `save('/repo', view, delta, deps)` with a non-empty `delta` and an injected `writeStore`
   spy → the spy is called **zero** times, `writeNote === 'save skipped: load was degraded'`, and
   the call does not throw. Expected failure: the spy is called once and `writeNote` is `null` —
   the erasing write, asserted before it is fixed.
   Add the sibling-precedence pin in the same test block: a view from `load` with an escaping
   `ref` is degraded, so `save` returns `'save skipped: load was degraded'` (the new guard fires
   first), while the pre-existing test at `engine/test/memory.test.js:970-978` — which builds a
   *non*-degraded view and passes an escaping `ref` only to `save` — must keep returning
   `'save skipped: store path outside repo'`, unchanged.
6. **Over-reach guard (green before AND after — say so, do not call it RED).** `save` over a
   cold-start view (`loadNote: 'no store'`, `degraded: false`, empty entries) with a non-empty
   delta → the spy IS called exactly once and `writeNote === null`. It passes today and must
   keep passing; its only job is to fail if the GREEN step marks too much as degraded. Write it
   in the same batch so it is present the moment the guard lands.
7. **Leak guard (same posture).** Assert the serialized content from that cold-start write
   contains no `degraded` key — `assert.ok(!content.includes('degraded'))` — and that
   `parseStore(content)` round-trips to the same entries. `serializeStore` only ever writes
   `CONCERNS`-keyed arrays, so this is a pin on that fact, not a suspicion about it.
8. **GREEN** — add `degradedView`, thread `degraded: false` through `emptyView` and
   `applyValidators`, route the two failure exits, add the single `save` guard.
9. **REFACTOR** — update the module header and the `load`/`save` JSDoc `@returns` shapes to name
   the `degraded` field and state the invariant in plain terms: *a write derived from a view
   that never saw the store is an erasure, not a write*. No ADR numbers, no phase refs (the
   repo-level guard greps this file for them).
10. Update `docs/contributing/specs/memory.md` §Port interface: `load`'s **post** gains the
    degraded marker and the malformed/outside-repo vs cold-start distinction; `save`'s **pre**
    states it reads `view.degraded`, and its **post** states it declines the write and returns
    `writeNote: 'save skipped: load was degraded'` — still never throwing and never blocking.
11. Re-run the full engine memory suite and confirm the save-path suite (~L1218-1885) is green
    with **zero** edits.

### Gate

```
cd engine && node --test test/memory.test.js
node --test test/p22-memory.test.js          # cwd: repo root — greps this file for provenance tokens
```

### Commit

`fix(memory): decline the save when the load was degraded`

## Part 6 — Repair the store's malformed scalars and confidence scale

### Context

`.claude/craft-memory.md` is committed (via a `.gitignore` re-include) and 674 lines long; its
YAML frontmatter runs from line 1 to line 586. It has been **unparseable since `1f7e76f`**.
Confirmed in this worktree:

```
load(repoRoot, { readStore: readFileSync }) →
  loadNote = 'malformed store', evicted = 0, every concern empty
```

**Defect class 1 — three malformed scalars, in TWO different classes.** A repair that greps for
`: ` fixes two of three and leaves the store just as dead.

| File line | Key | Cause |
|---|---|---|
| 221 | `pattern:` | unquoted plain scalar containing a **colon-space**: `… unconditionally). Also: only map …` |
| 257 | `pattern:` | unquoted plain scalar containing a **colon-space** inside an embedded JSON fragment: ``(pi declares `"skills": ["skills"]`;`` |
| 392 | `pattern:` | value **opens with a backtick** — `` `[a-z]*` is NOT ASCII under en_US.UTF-8 … `` — a YAML reserved indicator that cannot start a plain scalar. **No colon-space anywhere in this value.** |

js-yaml reports all three identically as *"bad indentation of a mapping entry"*, so the error
message is not a usable signature.

**Defect class 2 — every confidence is at or below the decay cliff.** Once the three scalars are
quoted the store parses and yields exactly 67 entries:

```
toolchain 1 · gate-cmd 2 · validation-tool 1 · findings 43 · part-sizing 20 = 67
```

Confidence histogram over the parsed store (measured):

| confidence | 0.5 | 0.6 | 0.65 | 0.7 | 0.75 | 0.8 | 0.85 | 0.9 | **1** |
|---|---|---|---|---|---|---|---|---|---|
| entries | 6 | 4 | 2 | 5 | 4 | 13 | 5 | 6 | **22** |

45 are fractional (schema says integer `FLOOR..CEILING`); 22 sit at exactly `1`.
`reconcileConcern` (`engine/src/observability/memory.js` L451-454) decays a non-re-observed
entry with `const newConf = entry.confidence - STEP;` and keeps it only `if (newConf > FLOOR)`
— `FLOOR = 0`, `CEILING = 5`, `STEP = 1`, and the comparison is **strict**. So `0.9 - 1 = -0.1`
and `1 - 1 = 0` both fail it: **survive = 0, evaporate = 67**. Repairing only the quoting
converts a silently-empty read into a silently-emptied write.

**The normalization, applied to all 67 entries.** For each entry's `confidence` `v`:

- `v` is the integer `1` → **`2`** (lift off the floor). Those 22 sat at the ADDED floor only
  because `load` could never hand a run the view it needed to refresh them; decaying them out
  now would let the bug claim its own evidence. One `STEP` is the minimum that restores the
  decay model's ability to discriminate, and no more.
- otherwise → `max(1, min(5, round(v * 5)))` (rescale onto the integer ladder; the only mapping
  that preserves the author's intended ordering).

Order matters: rescale must not be applied to the integer `1`s (`1 * 5 = 5` would be wrong).
Measured mapping and the resulting histogram:

```
0.5→3  0.6→3  0.65→3  0.7→4  0.75→4  0.8→4  0.85→4  0.9→5  1→2
after: 2×22 · 3×12 · 4×27 · 5×6  = 67 entries, min 2, max 5, all integers, nothing at 1
```

**The repair procedure — three steps, ending in the engine's own canonical form.**

1. Quote the three scalars at file lines 221, 257, 392 so the frontmatter parses at all.
   Single-quote the value and double any embedded `'`.
2. Apply the normalization above to all 67 entries.
3. **Round-trip through the engine**: `parseStore(content)` → transform confidences →
   `serializeStore({ entries, evicted: [], loadNote: null })` → write back to
   `.claude/craft-memory.md`. This canonicalizes quoting by construction (`yamlDump` at L125-129)
   instead of relying on a human to spot the next hazard character, **and** regenerates the
   markdown body — `buildBody` derives the body from the frontmatter on every serialize (L131)
   and never parses it, so a hand YAML edit would leave the body's rendered
   `- confidence: … | provenance: …` lines silently stale in a committed, human-reviewed file.

Step 3 is measured, not assumed. Over the round-tripped store: all 67 entries survive,
`parseStore(serializeStore(v))` deep-equals `v`, and a second `serializeStore` is
**byte-identical** to the first. Both hazard classes come back single-quoted:

```
pattern: '`[a-z]*` is NOT ASCII under en_US.UT…       ← was a bare leading backtick
pattern: 'a field-bridge that prefers the guard''s …  ← was an unquoted colon-space scalar
```

Applying the content-whitelist validate-on-read predicates to the repaired store evicts **0**
entries in every concern — the content is schema-clean. The store is not corrupt, it is
unquoted. Cap eviction is not a factor either: `evictToCaps` runs against
`{ maxEntries: 1000, maxBytes: Infinity }` and 67 clears both.

**Do the transform with a throwaway script** (write it under the scratchpad or a `mktemp` dir,
not in the worktree, and do not commit it). The only committed artifact of this part is the
repaired `.claude/craft-memory.md` plus the guard tests.

**Where the guards go — `test/p22-memory.test.js`, not `engine/test/memory.test.js`.**
`engine/test/memory.test.js` is 130 KB of thorough, entirely fixture-driven coverage — including
two malformed-store tests — and the real store died underneath all of it for months. A fixture
suite cannot notice that its subject died. `test/p22-memory.test.js` is the repo-level suite
that already guards the store's `.gitignore` re-include and its spec's presence; it is
**CommonJS** (`'use strict'; const { test } = require('node:test');`), so load the ESM port with
a dynamic `import()` inside an `async` test:

```js
const { load, parseStore, serializeStore, FLOOR, CEILING, STEP } =
  await import(require('node:url').pathToFileURL(
    path.join(ROOT, 'engine/src/observability/memory.js')).href);
```

**Public surface:** none. No exported symbol, no signature, no doc surface — the spec already
states the integer `FLOOR..CEILING` schema this repair brings the data back into compliance
with.

### TDD steps

1. **RED (a) — the committed store parses.** In `test/p22-memory.test.js`, add: `load(ROOT, { readStore: (p) => fs.readFileSync(p, 'utf8') })`
   returns `loadNote === null`, `evicted` empty, and exactly 67 entries distributed
   `toolchain 1 / gate-cmd 2 / validation-tool 1 / findings 43 / part-sizing 20`. Expected
   failure: `loadNote` is `'malformed store'` and every concern is empty. **This one assertion
   is the guard whose absence let the store die.**
2. **RED (b) — every confidence is a legal integer.** Every loaded entry's `confidence` is an
   integer with `FLOOR < confidence <= CEILING`. Expected failure: the view is empty, so write
   the assertion so an empty view fails (assert a non-zero entry count first, then the
   per-entry predicate) — a vacuous `every` over `[]` must not pass.
3. **RED (c) — every entry survives one decay.** Every loaded entry satisfies
   `confidence - STEP > FLOOR`. This is **strictly stronger** than (b): a legal confidence of
   `1` passes the schema check and still fails this one. Expected failure: empty view (and, after
   only a quoting repair, 67 failures).
4. **RED (d) — canonical round-trip.** `parseStore(serializeStore(view))` deep-equals `view`'s
   entries, and `serializeStore` applied twice is byte-identical. Expected failure: `parseStore`
   over the committed file returns `null`.
5. **GREEN** — run the throwaway repair script (three steps above) against
   `.claude/craft-memory.md` and write the canonical output back.
6. **REFACTOR** — none in code. Read the regenerated markdown body of the committed store and
   confirm it renders the *new* confidences (this is what step 3 buys); spot-check the three
   previously-malformed `pattern` values survived verbatim inside their quotes, character for
   character — a repair that silently rewrites a learning's text is a worse defect than the one
   it fixes.
7. Confirm `engine/test/memory.test.js` is untouched and still green: this part changes data, not
   behaviour.

### Gate

```
node --test test/p22-memory.test.js          # cwd: repo root
cd engine && node --test test/memory.test.js # must still be green, unchanged
```

### Commit

`fix(memory): repair the store's malformed scalars and confidence scale`

## Part 7 — Dogfood the architecture phase with a repo-native boundary rule

### Context

Three artifacts land together: the rule file, the technique declaration, and the DoD line.

**(1) `test/architecture-boundaries.test.js` — new, CommonJS, zero new dependencies.** The repo
has no dependency-analysis tool, no linter, and no root `package.json`; `engine/package.json`
carries one dependency (`js-yaml`). The idiom to follow is `test/source-hygiene.test.js`:
architectural rules expressed as plain Node tests over source text, with `git ls-files` for the
tracked set and commented allowlist entries for exceptions. `test/` is **not** in
`source-hygiene`'s `SCANNED_PATHS`, so the new file is unconstrained by its class-A/B token bans.

The verified import graph under `engine/src/observability/` (every `from '…'` edge, dumped):

| Module | Imports |
|---|---|
| `usage-aggregate.js` (pure core) | `./skip-signals.js` only |
| `adapters/claude/telemetry.js` | `../../skip-signals.js`, `../../role-phase.js` |
| `adapters/opencode/telemetry.js` | `../../role-phase.js` |
| `adapters/claude/metrics-split.js` | `./telemetry.js` (intra-adapter) |
| `adapters/{aider,codex,copilot,cursor,pi}/telemetry.js`, `adapters/claude/{discovery,pricing}.js`, `role-phase.js`, `skip-signals.js` | nothing |
| `usage-mine-main.js` (composition root) | six adapter `telemetry.js` modules + `adapters/claude/discovery.js` (L45-51) + `adapters/claude/pricing.js` (L53), plus `./usage-aggregate.js` (L52) |
| `memory.js` | `node:path`, `js-yaml`, `../frontmatter.js`, `../contain.js` |

The three rules, each **holding on the current tree**:

- **R1** — the pure core `engine/src/observability/usage-aggregate.js` imports nothing under
  `engine/src/observability/adapters/`. Its own header already declares the constraint in prose
  (*"No clock, no random, no model-id literals, no runtime paths"*) with nothing enforcing it.
- **R2** — no module under `engine/src/observability/adapters/<a>/` imports from
  `engine/src/observability/adapters/<b>/` where `a ≠ b`. Intra-adapter imports are allowed
  (`adapters/claude/metrics-split.js` → `./telemetry.js`).
- **R3** — only a composition root (basename ending `-main.js`) may import
  `engine/src/observability/adapters/**`. `usage-mine-main.js` is the only such importer today.

Implementation shape:

- Enumerate the tracked scan set with `execFileSync('git', ['ls-files', '--', 'engine/src/observability'])`,
  filtered to `*.js` (mirror `listTrackedFiles` in `test/source-hygiene.test.js`).
- Extract specifiers with a global `from '([^']+)'` match over each file's text. Multi-line
  import statements exist (`usage-mine-main.js` L36-42), so match on the `from` clause rather
  than on a statement-anchored pattern. Document that limitation in a comment. **If the
  extractor ever picks up a `from '…'` occurrence inside a comment or a string and manufactures
  a false offender, tighten the extractor** (require an `import`/`export` token opening the
  statement) — never relax a rule to make a false positive go away.
- Resolve each relative specifier against the file's directory to a repo-relative path; ignore
  bare specifiers (`node:*`, `js-yaml`).
- Express each rule as a **pure detector function** over a `{ file → resolved specifiers }` map,
  so the synthetic and real cases share one code path.
- **Two-sided pinning, per `test/source-hygiene.test.js`'s class-C idiom:** each rule asserts
  that its detector flags a synthetic offender map *and* finds nothing in the real tracked tree.
  A rule that can only report "clean" rots into vacuity the moment the tree it polices moves.
- **Staleness guard**, mirroring `test/source-hygiene.test.js` L94-109: assert the scan set is
  non-empty and that the named anchors are present —
  `engine/src/observability/usage-aggregate.js`, `engine/src/observability/usage-mine-main.js`,
  and at least two distinct `engine/src/observability/adapters/<tool>/telemetry.js` files. A
  moved directory then fails loud instead of scanning nothing.
- **Exception allowlist**, since a deliberate exception must be encoded once in the rule's own
  expression with one line of why: a module-level `ALLOWED_CROSS_LAYER_EDGES` list of
  `{ from, to, why }` that the detectors filter through. It is **empty today** — so pin it live
  with a test that runs a detector over a synthetic offender *plus* a matching allowlist entry
  and asserts the edge is excused. An allowlist nothing exercises is dead code.

**Derive the rules from what the tree actually is.** This is a boundary check, not a refactor
mandate. **If a rule you write goes red on existing code, that is a finding: raise a blocker
`{ unit, reason, ≤3 options }`. Do NOT relax the rule silently, and do NOT refactor production
code to satisfy it.**

`test/every-test-file-registers.test.js` enumerates `test/**/*.test.js` (its `process` suite dir)
and requires ≥1 registered test per file, so it picks the new file up automatically. `ci.sh`'s
`run_suite process test` enumerates it too — meaning the rule gates every run the moment it
lands, phase or no phase.

**(2) `.claude/workflow.md` — the technique declaration.** The current frontmatter carries
`paths:` and a single `phases.validation.harness.techniques` entry; mirror its exact shape and
append a sibling `architecture:` block under `phases:`:

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

Pinned by running the real resolver against exactly this manifest shape in a throwaway:

```
ok= True   errors= []
effective ids: workspace design decisions planning implementation review refactoring
               validation architecture documentation propose integrate
architecture.harness.techniquePlan = [{ id: boundaries, scope: per-hunk, mode: gate,
                                        runStyle: sync, commitPrefix: fix, probe: …, run: … }]
gateDecision = { phaseId: architecture, gate: "<arch gate>", codeProducing: false }
```

Two notes: `scope` is deliberately **omitted** — `deriveTechniquePlan` defaults it to
`per-hunk`, and `engine/src/manifest-harness.js` allows only `per-hunk|per-file`; an import-graph
rule reads the whole tree by construction, so the label is cosmetic here and inventing a third
enum value is not worth an engine change. And `<arch gate>` now resolves to **the declared
technique's own `run` exiting 0** — the same technique-agnostic shape `<validation gate>`
already has. Do **not** add a substitution for it in `adapters/pi/src/run.js`; `architecture`
resolves `codeProducing: false` so no binding executes the placeholder, and pi's own manifest
never enables the phase.

`pipeline/default.yml` L125-139 keeps `enabled: false` — the repo manifest overrides it. This
also means `README.md`'s advertised phase list stays correct: `readme-drift`'s `phase-names`
sub-guard derives its truth set from `pipeline/default.yml`, not from the consumer manifest.

**Gotcha, measured:** `bash scripts/manifest-lint.sh` resolves `paths.dod` relative to the
manifest's own directory. Running it against a copy in a temp dir fails with
`paths.dod references missing file: docs/contributing/DOD.md`. Run it against the **real**
`.claude/workflow.md` in place.

`test/mutation-scope.test.js` asserts two exact sentences exist in this file's markdown body:
`--mutate "fileA:r1,fileB:r2"` and `instrumented mutant count is >= the adjacent-hunk count`.
Leave both byte-identical. Add a short body paragraph documenting the `boundaries` technique in
the same register as the existing prose.

**(3) `docs/contributing/DOD.md` — the architecture line stops being unbacked.** Today L72-76:

```
- [ ] N/A — the `architecture` phase ships `enabled: false` in `pipeline/default.yml` for
  this repo; the architecture boundary check did not run. The gap is stated here honestly and
  not claimed as verified. `architecture-gap-honest`
```

Restate it as a met criterion. Constraints on the rewrite:

- **Keep the criterion id `architecture-gap-honest`** and its frontmatter entry (L27-28)
  unchanged. It is a stable key referenced by `test/p20-dod.test.js`'s wrapped-bullet comment
  and by two committed docs; renaming is churn no decision asks for.
- **Keep `kind: judgment`.** Do NOT promote it to `kind: auto` with `assert: { gate: architecture }`.
  `dod-assert`'s green-gate set comes from `argv[2]`, and `architecture` is `autoSkipEligible`
  — an auto criterion would report unmet on every run the phase legitimately auto-skips.
- **Keep the wrapped-bullet shape** ending on its own last physical line with
  `` `architecture-gap-honest` `` — `test/p20-dod.test.js` matches criterion bullets with
  `/^- \[ \] [^\n]*(?:\n(?!- \[)[^\n]*)*`<id>`$/m`.
- The honest statement is that the rule file runs in `bash scripts/ci.sh` on **every** change,
  and that when the `architecture` phase executes, its declared technique's `run` exiting 0 is
  the recorded evidence and every violation carries a per-violation triage outcome (fixed, or a
  scoped exception with one line of why). Say that; do not claim the phase runs every time.
- `docs/contributing/DOD.md` **is** in `test/source-hygiene.test.js`'s `SCANNED_PATHS`: the new
  wording must contain none of `mutation`, `mutant`, `dependency-cruiser`, `depcruise`, or a
  bare VCS-host CLI token.

**Public surface — decided here.** The new manifest key `phases.architecture` is a **public
config surface**. Its downstream gates, all pre-paid in this part: `scripts/manifest-lint.sh`
against the real path, `node engine/bin/pipeline-resolve.js pipeline/default.yml .claude/workflow.md`
resolving `ok: true` with `architecture` in `effective[]`, `test/mutation-scope.test.js`'s two
pinned sentences, and `docs/contributing/DOD.md`. `test/architecture-boundaries.test.js` exports
nothing (CommonJS test file); it registers into the `process` suite automatically. No README
surface changes.

### TDD steps

1. **RED (a) — R1, both sides.** Create `test/architecture-boundaries.test.js` with the
   scan/extract/resolve helpers and the R1 detector. Assert the detector flags a synthetic map
   `{ 'engine/src/observability/usage-aggregate.js': ['engine/src/observability/adapters/claude/telemetry.js'] }`,
   and finds zero offenders over the real tracked tree. Expected first failure: the file does not
   exist / the detector is unimplemented.
2. **RED (b) — R2, both sides.** Synthetic offender:
   `{ 'engine/src/observability/adapters/pi/telemetry.js': ['engine/src/observability/adapters/claude/telemetry.js'] }`
   must be flagged, while the real intra-adapter edge
   `adapters/claude/metrics-split.js → ./telemetry.js` must NOT be. Real tree: zero offenders.
3. **RED (c) — R3, both sides.** Synthetic offender:
   `{ 'engine/src/observability/usage-aggregate.js': ['engine/src/observability/adapters/pi/telemetry.js'] }`
   flagged; `{ 'engine/src/observability/usage-mine-main.js': [<same>] }` not flagged. Real tree:
   zero offenders.
4. **RED (d) — the allowlist is live.** Run one detector over a synthetic offender *with* a
   matching `ALLOWED_CROSS_LAYER_EDGES` entry and assert the edge is excused. This is what keeps
   an empty allowlist from being dead code.
5. **RED (e) — the staleness guard.** Assert the tracked scan set is non-empty and contains the
   three named anchors. Expected failure while the helpers are stubs.
6. **GREEN** — implement the helpers and the three detectors until every assertion in 1-5 passes
   over the real tree. **If any rule reports a real offender, stop and raise a blocker.**
7. **REFACTOR** — collapse the three detectors onto one shared "edges under the adapter segment"
   primitive; keep each rule's *statement* separate and readable. Add the one-line-why comment
   convention above `ALLOWED_CROSS_LAYER_EDGES`. No ADR numbers anywhere in the file.
8. **GREEN (manifest)** — append the `architecture:` block to `.claude/workflow.md` frontmatter
   plus a short body paragraph. Verify:
   `bash scripts/manifest-lint.sh .claude/workflow.md` exits 0 (real path, not a copy), and
   `node engine/bin/pipeline-resolve.js pipeline/default.yml .claude/workflow.md` prints
   `ok: true` with `architecture` in `effective[]` and a one-entry `techniquePlan`. Confirm
   `node --test test/mutation-scope.test.js` is still green.
9. **GREEN (DoD)** — rewrite the `architecture-gap-honest` checklist bullet per the Context
   constraints. Verify `node --test test/p20-dod.test.js` and
   `node engine/bin/dod-assert.js docs/contributing/DOD.md . ''` still exit 0 with the criterion
   reported as `judgment`, and `node --test test/source-hygiene.test.js` stays green.
10. Run the technique's own `run` command exactly as declared —
    `node --test test/architecture-boundaries.test.js` — and confirm it exits 0. That command
    *is* `<arch gate>`.

### Gate

```
node --test test/architecture-boundaries.test.js test/every-test-file-registers.test.js \
            test/mutation-scope.test.js test/p20-dod.test.js test/source-hygiene.test.js   # cwd: repo root
bash scripts/manifest-lint.sh .claude/workflow.md
node engine/bin/pipeline-resolve.js pipeline/default.yml .claude/workflow.md
```

### Commit

`feat(architecture): dogfood the phase with a repo-native boundary rule`
