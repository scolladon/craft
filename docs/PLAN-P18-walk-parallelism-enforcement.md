# Plan — P18: Walk / parallelism enforcement

> Source: design doc `docs/DESIGN-P18-walk-parallelism-enforcement.md` · ADRs `096, 097, 098, 099`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  mutation/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.

> **Scope is fixed by ADR-099:** exactly two parts, Layer A before Layer B. Part 1
> (Layer A) carries engine code under ADR-096 (the `reviewPlan` emission) — it is NOT
> SKILL-only. Part order satisfies item 3's precondition (the `--harness` flag rides on
> the two knobs being engine-enforced). The coupled SKILL/backlog prose changes ride their
> engine part (they read fields the same part emits) — not standalone.

## Part 1 — Layer A: emit `reviewPlan` on the resolved review descriptor + un-park `passes`/`convergence`

### Context

**What lands:** a pure `deriveReviewPlan(harness)` helper in the resolver that projects an
engine-owned `reviewPlan { passes, stop_rule }` onto each harness-carrying descriptor's
`harness` block, plus the SKILL prose that reads it as a binding invariant (and removal of
the parked block). Engine fact + coupled prose. R1, R2, R7. ADR-096, ADR-097.

**File 1 — `engine/src/resolve.js` (the derivation seam).**
- `export function resolvePipeline(defaults, manifest, opts)` is at **line 212**. Its
  signature and the module export surface MUST NOT change (R7, ADR-022) — `reviewPlan` is a
  derived field on an existing block, not a new export or a new resolver argument.
- The enabled descriptor list is built at **line 278**:
  `const effective = execResult.descriptors.filter(d => d.enabled);`
  This is the verified insertion seam. The derivation maps over this list, replacing each
  descriptor that carries a `harness` block with a fresh descriptor whose `harness` gains
  `reviewPlan`. Apply it to the `effective` list (post-enabled-filter) so only returned
  descriptors carry the plan and non-enabled descriptors are untouched. Keep the existing
  `roleErrors`/`resolveGatesAndWaivers` flow below it operating on the mapped list — map
  `effective` immediately after line 278, before the `roleErrors` computation reads it, so
  downstream consumers see the enriched list.
- **Resolver discipline (mirror it):** every transform here is pure and returns fresh
  objects (`resolveExecution` at lines 102–113 does `{ ...d, execution }`; `aliasResolve`
  spreads). Follow the same: write `{ ...d, harness: { ...d.harness, reviewPlan } }`. NEVER
  mutate `d` or `d.harness`. Descriptors with no `harness` block pass through unchanged
  (`d.harness` absent ⇒ no `reviewPlan` attached).
- New pure helper `deriveReviewPlan(harness)` — place it in the "manifest-level record
  entries" / helper region of the file (e.g. after `resolveExecution`, before
  `buildManifestRecords` at line 138), module-private (NOT exported). CQS: a pure query, no
  error path, no validation. It performs NO validation — `harness` is already typed-valid
  (manifest path is linted at `skills/run/SKILL.md` §1 by `manifest-lint`; the `--harness`
  overlay is re-validated by Part 2's B4 before `resolvePipeline`).

**`deriveReviewPlan(harness)` shape (design-pinned, ADR-096/ADR-097):**
```
reviewPlan = { passes, stop_rule }
passes    = Number.isInteger(harness.passes) ? harness.passes : 1
stop_rule = 'low-only'              when harness.convergence === 'low-only' OR absent
          = 'none'                  when harness.convergence === 'none'
          = `non-low-count<=${n}`   when harness.convergence === n (a finite number)
```
- Classify convergence by the SAME string-vs-number distinction `validateHarness` uses
  (`manifest.js` line 55 `CONVERGENCE_STRINGS = {'low-only','none'}` vs `Number.isFinite`).
  An absent `convergence` maps to `'low-only'` (the `pipeline/default.yml` default — the
  resolved review descriptor always carries one).
- Numeric threshold is interpolated verbatim: `convergence: 3` → `'non-low-count<=3'`;
  `convergence: 0` → `'non-low-count<=0'` (zero is valid: `validateHarness` accepts
  `Number.isFinite(c) && c >= 0`). Use the raw number in the template literal — do not
  re-coerce.

**Pinned input data — `pipeline/default.yml` review descriptor (lines 78–94):** archetype
`harness`, `harness: { dimensions: [code, security, tests, perf], passes: 1, max_cycles: 3,
convergence: low-only }`. So the default resolved review descriptor yields
`reviewPlan { passes: 1, stop_rule: 'low-only' }`.

**File 2 — `skills/review/SKILL.md` (coupled prose, rides this part — reads the field this
part emits, no separate test):**
- **Delete the parked block at lines 45–49** (the `> **Harness-knob fidelity (parked, not a
  silent cap):** …` blockquote). No silent cap may remain (R1).
- **Step 1 (line 21, fan-out):** today reads "fan out `passes` read-only **craft:reviewer**
  per dimension in parallel (one message, N×`passes` spawns)". Rewrite to read
  `phase.harness.reviewPlan.passes` (the engine-emitted plan number) instead of the raw
  `passes` knob, and state it as a **binding** invariant: the Round-1 fan-out MUST spawn
  exactly `reviewPlan.passes` reviewers per dimension in one message
  (`dimensions.length × reviewPlan.passes` spawns) — "MUST", not "may".
- **Step 4 (lines 35–40, convergence):** today reads "`<n>` (numeric ≥0) → stop when
  remaining findings ≤ n". Rewrite to read `phase.harness.reviewPlan.stop_rule`
  mechanically: `low-only` / `none` keep their meanings; `non-low-count<=<n>` means **stop
  when the count of remaining non-LOW (severity ≥ MEDIUM) findings is ≤ n** (ADR-097),
  counted off the normalized `Finding[]` (`{file, line, severity, finding, fix?}`) that step
  2 already produces via `engine/bin/normalize-findings.js`. Remove the "walk judgment"
  hedge — state the rule precisely and unambiguously (R2).
- The **preamble (lines 12–17)** probe of raw `passes`/`convergence` knobs may stay as the
  fallback-defaults description; the binding read is in steps 1+4 via `reviewPlan`.

**Test file — `engine/test/resolve.test.js`** (node `--test`, Given/When/Then titles, AAA
body, `sut` variable). Mirror its harness/style:
- Imports (lines 1–8): `parsePipeline`, `resolvePipeline`, `load` from `js-yaml`.
- `loadDefault()` (line 13) → `parsePipeline(readFileSync(defaultYml))`; `sut = loadDefault()`.
- Inline-manifest construction style (lines 205–208, 222–224): build a plain object
  `{ phases: { review: { harness: { … } } } }` and call `resolvePipeline(sut, manifest)`.
- Read the resolved descriptor via `result.effective.find(d => d.id === 'review')` (the
  established lookup idiom, lines 211, 226).
- Additive safety (verified): no existing test deep-equals the review descriptor's full
  `harness`; existing harness assertions live in `edits.test.js` on a different (edits) path.
  `reviewPlan` is purely additive — existing `resolve.test.js`/`scenarios.test.js`/
  `contract-equivalence.test.js` assertions read named knobs and stay green.

### TDD steps

RED (write all in `engine/test/resolve.test.js`, run, watch each fail because
`deriveReviewPlan` does not exist / `harness.reviewPlan` is `undefined`):
1. **Default plan** — Given default `pipeline/default.yml` (`passes: 1`, `convergence:
   low-only`) resolved with `null`/empty manifest, then
   `result.effective.find(d => d.id==='review').harness.reviewPlan` deep-equals
   `{ passes: 1, stop_rule: 'low-only' }`. *Fails: `reviewPlan` undefined.*
2. **Passes echo** — Given manifest `{ phases: { review: { harness: { passes: 2 } } } }`,
   then `reviewPlan.passes === 2` and `reviewPlan.stop_rule === 'low-only'` (inherited
   default convergence). *Fails: undefined.*
3. **stop_rule none** — Given `{ phases: { review: { harness: { convergence: 'none' } } } }`,
   then `reviewPlan.stop_rule === 'none'`. *Fails: undefined.*
4. **stop_rule numeric** — Given `{ …review.harness: { convergence: 3 } }`, then
   `reviewPlan.stop_rule === 'non-low-count<=3'`; and a separate `convergence: 0` case yields
   `'non-low-count<=0'`. *Fails: undefined.*
5. **Non-harness phase untouched** — Given a resolved non-harness descriptor (e.g.
   `result.effective.find(d => d.archetype !== 'harness')` — design phase), then it has no
   `harness.reviewPlan` (the derivation runs only for descriptors carrying a `harness`
   block). *Fails: helper may attach to all / TypeError.*
6. **Immutability** — Given a manifest, when resolved, then the resolved review descriptor's
   `harness` is a fresh object: assert `reviewPlan` is present AND the sibling knobs
   (`passes`, `convergence`, `dimensions`, `max_cycles`) are intact (added without rewriting
   siblings). *Fails: undefined.*

GREEN:
- Add module-private `deriveReviewPlan(harness)` to `resolve.js` per the pinned shape.
- At line 278, map the `effective` list: for each `d`, if `d.harness` is a non-array object,
  return `{ ...d, harness: { ...d.harness, reviewPlan: deriveReviewPlan(d.harness) } }`,
  else return `d` unchanged. Run targeted gate → green.

REFACTOR:
- Keep `deriveReviewPlan` ≤20 lines, early-returns for each convergence case (no nesting >2),
  named — no magic strings beyond the three pinned rule names. Confirm no input mutation.
- Edit `skills/review/SKILL.md`: delete lines 45–49; rewrite steps 1 and 4 to the binding
  `reviewPlan`-reading prose above. (Prose — verified at review/doc phase, no engine test.)

### Gate

- Part: `cd engine && node --test test/resolve.test.js`
- Phase-boundary: `cd engine && npm run ci`

### Commit

`feat(engine): emit reviewPlan on resolved review descriptor; un-park passes/convergence`

## Part 2 — Layer B: `--harness` per-invocation overlay (parse, coerce, nested-write, re-validate, forward)

### Context

**What lands:** the repeatable `--harness <phase>.<knob>=<value>` flag end-to-end — grammar
parse + type-coercion in `pipeline-resolve-main.js`, a nested-write deep-merge path in
`applyCliOverlay`, a new re-validation call site (R4) via an exported `validatePhases`, and
the coupled run-SKILL forwarding + backlog status prose. R3–R8. ADR-098, ADR-022, ADR-029/031,
ADR-030. Builds on Part 1 in the same working tree (Layer A already landed).

**PUBLIC-SURFACE DECISION (up front):** Part 2 introduces ONE new exported symbol —
`validatePhases` is exported from `engine/src/manifest.js` (currently module-private at line
347). Decision: **export it (or a thin `validateTouchedPhases` wrapper) — public module
export.** This is the design's "one small surface addition" (DESIGN B4). It is explicitly
**NOT** part of the ADR-022 frozen *resolver* surface (that surface is `resolvePipeline` + the
resolver exports in `resolve.js` — a different module). Downstream surface gates for this
export (the repo has NO engine barrel/index.js and NO generated API report — exports are
consumed by direct `import { … } from '../src/manifest.js'`): the single new consumer is
`engine/src/pipeline-resolve-main.js`. Pre-pay it in this part (the import is part of B4
below). No other registry/facade/exhaustiveness switch touches this symbol.

**File 1 — `engine/src/manifest.js` (export `validatePhases`).**
- `validatePhases(phases, fileExists, errors)` is at **line 347**. It iterates
  `Object.entries(phases)`, pushing `unknown phase: ${phaseName}` when
  `!PHASE_NAMES.has(resolveAlias(phaseName))` (line 350–351) AND dispatching each block's
  `harness` to `validateHarness` via `validatePhaseBlock` (line 353 → line 335–337). This is
  the seam that reuses BOTH gates (phase-existence + knob-typing) with ONE call.
- `PHASE_NAMES` (line 23) and `validateHarness` (line 242) stay module-private — only
  `validatePhases` is exported.
- Add `export` to the `function validatePhases` declaration. The canonical messages (verified
  bytes, the R4 "same message" identity source):
  - passes: `phases.${phaseName}.harness.passes must be a positive integer` (line 256)
  - convergence: `phases.${phaseName}.harness.convergence must be 'low-only', 'none', or a non-negative number` (line 268)
  - unknown phase: `unknown phase: ${phaseName}` (line 351)
  - `max_cycles`/`tool`/`scope`/`incremental`/`dimensions` messages: lines 250/261/272/275/278.
- `validatePhases` signature takes `fileExists` (used for `context`/`override` file-refs in
  `validatePhaseBlock`); for the harness-only re-validation, inject `() => true` (no file
  refs in a `--harness` overlay).

**File 2 — `engine/src/cli-overlay.js` (nested-write overlay, R3/R5).**
- `export function applyCliOverlay(manifest, { profile, skip } = {})` at **line 36**;
  `unionSkip` helper at line 14. The current flat path (lines 37–55) sets `pipeline.profile`
  and unions `pipeline.skip`, always returning a fresh top-level object + fresh `pipeline`.
- **Extend the signature** to `{ profile, skip, harness } = {}` where
  `harness: Array<{ phase: string, knob: string, value: <coerced> }> | undefined`.
- **Empty/absent `harness` → the existing flat path is byte-for-byte untouched** so the 8
  existing cli-overlay tests stay green verbatim (verified count: `engine/test/cli-overlay.test.js`
  has 8 `test(...)` blocks, lines 8, 19, 30, 41, 52, 63, 75, 86). Guard with
  `Array.isArray(harness) && harness.length > 0`.
- **Nested write (when present):** for each `{phase, knob, value}`, write
  `merged.phases[phase].harness[knob] = value`, **deep-merging** over any manifest-supplied
  harness for that phase (highest precedence — CLI-wins, ADR-029-consistent), freshly
  constructing `phases`, the phase block, and its `harness` on the write path — input NEVER
  mutated (R5). Extract a module-private `mergeHarnessOverlay(phases, entries)` (sibling to
  `unionSkip`) so `applyCliOverlay` stays ≤2 nesting depth (Object Calisthenics). Compose with
  the profile/skip path: both may apply in one call (the `--harness` + `--profile` + `--skip`
  fold).

**File 3 — `engine/src/pipeline-resolve-main.js` (parse + coerce + thread + re-validate).**
- `parseArgs(argv, io)` at **lines 47–85**; `takeValue` closure at lines 53–60 (writes
  `pipeline-resolve: option ${flag} requires a non-flag value\n`, returns null). `main` at
  **lines 95–149**.
- **`parseArgs`** — add a repeatable `--harness` branch in the for-loop (after the `--skip`
  branch, before the `arg.startsWith('-')` catch-all at line 74):
  - `const value = takeValue(i, arg); if (value === null) return null; i++;` (reuse
    `takeValue` for the missing-value → exit-2 path, R6 last row).
  - Parse `value` as `<phase>.<knob>=<value>`. **Grammar faults (R6, parse-time) → write a
    grammar error to `io.stderr` and `return null`** (→ exit 2): no `=`; empty phase; empty
    knob; a dotted path that is not exactly `<phase>.<knob>` (more than one `.` before `=`).
    Message family (ADR-098 / DESIGN error table):
    `pipeline-resolve: --harness expects <phase>.<knob>=<value>\n`.
  - Coerce the raw string per the **knob-keyed table** (closed map, design B2):

    | Knob | Coerces to | From string |
    |---|---|---|
    | `passes`, `max_cycles` | integer | `Number.parseInt`, must round-trip (`String(n) === raw`); else leave raw string |
    | `convergence` | number OR string | `'low-only'`/`'none'` stay string; else `Number(raw)` (leave string if `NaN`) |
    | `incremental` | boolean | `'true'`→true, `'false'`→false; else leave raw string |
    | `dimensions` | string list | comma-split, `.trim()`, `.filter(Boolean)` (mirrors `--skip`, line 72) |
    | `tool`, `scope`, *(unknown knob)* | string | identity passthrough |

    Coercion is **best-effort, never throwing**: an uncoercible value is left as the raw
    string so B4's `validateHarness` rejects it with the canonical per-knob message (one error
    vocabulary, R4). Accumulate `{phase, knob, value}` into a `harness` array (repeatable).
  - Extract a module-private `coerceHarnessValue(knob, raw)` helper so the branch stays small
    (early returns, no nesting >2).
- **`parseArgs` return** (line 84) extends to include `harness` (the accumulated array, or
  `undefined`/empty when no `--harness` seen). Update the JSDoc return type (lines 45–46).
- **`main`** — destructure `harness` from `parsed` (line 99); thread into
  `applyCliOverlay(manifest ?? {}, { profile, skip, harness })` (line 124). Update the usage
  string (line 102) to include `[--harness <phase>.<knob>=<value>]…`.
- **B4 re-validation hook (R4, R6) — the new call site, BEFORE `resolvePipeline` (line 134):**
  - `import { validatePhases } from './manifest.js'` (add to imports, lines 1–7).
  - After `applyCliOverlay`, when a `--harness` overlay was applied, build
    `{ phases: <only the --harness-touched phases of effectiveManifest> }` and run
    `const errors = []; validatePhases(touched, () => true, errors);`. On
    `errors.length > 0`: write each to `io.stderr` (e.g. `  - ${error}\n`, matching the
    `resolution.errors` loop at lines 141–143) and `return 2`. This reuses BOTH gates:
    unknown-phase id (`unknown phase: <id>`, R6) AND bad knob value
    (`phases.<id>.harness.<knob> must …`, R4) with bytes identical to the manifest path.
  - Validate ONLY the `--harness`-touched phases (not the whole manifest — full-manifest lint
    is the upstream responsibility of `manifest-lint` at `run` §1; re-linting here would
    duplicate that gate and surface pre-existing manifest issues out of context).

**Test file A — `engine/test/cli-overlay.test.js`** (8 existing tests stay green; add nested
cases). Style: `const sut = applyCliOverlay;`, `assert.deepEqual`/`assert.notStrictEqual`.
**Test file B — `engine/test/pipeline-resolve-main.test.js`** (node `--test`; `makeCaptureIo`
from `../test-helpers/capture-io.js`, line 8; `pipelinePath` = `pipeline/default.yml`, line
11; `manifestsDir`, line 12; `const sut = main;` `const io = makeCaptureIo();` idiom). Assert
exit codes + `io.stderr.joined()` / `io.stdout.joined()`.
**Test file C — `engine/test/pipeline-resolve.bin.test.js`** (spawn-based, `run(...args)` →
`spawnSync`, lines 12–14; `result.status` / `result.stdout`) for the end-to-end bin tie.

**Coupled prose (rides this part — forwards the flag this part parses):**
- `skills/run/SKILL.md` §0a (**lines 19–26**): add repeatable `--harness <phase>.<knob>=<value>`
  to the strip list (may appear multiple times, lead/trail) alongside `--profile`/`--skip`;
  add the CLI-wins precedence note (`--harness` wins over manifest harness and over
  `pipeline/default.yml`). §1b (**lines 33–39**): append each `--harness` occurrence to the
  bin invocation; update the usage line.
- `BACKLOG.md` P18 section (**lines 59–72**): add a status line noting P18 shipped and the
  ADR-064 `--harness` follow-up is discharged (R8). (Prose/status — exact wording finalized
  at the docs phase; the part records the discharge.)

### TDD steps

RED — **cli-overlay.test.js** (run, fail because `harness` arg is ignored / `phases`
undefined):
1. **Nested write + immutability** — Given a manifest and
   `harness: [{phase:'review',knob:'passes',value:2}]`, when `applyCliOverlay` runs, then
   `result.phases.review.harness.passes === 2` AND input not mutated — assert
   `notStrictEqual` on `result.phases`, `result.phases.review`, `result.phases.review.harness`
   vs any input refs. *Fails: `result.phases` undefined.*
2. **Deep-merge preserves siblings** — Given a manifest with existing
   `phases.review.harness.convergence:'low-only'` and an overlay setting `passes`, when
   applied, then `convergence` preserved AND `passes` added (merge, not replace). *Fails.*
3. **Multi-phase** — Given overlays for two distinct phases, then both phase blocks carry
   their knob and unrelated phases untouched. *Fails.*
4. **Fold with profile+skip** — Given `harness` overlay together with `profile`+`skip`, then
   all three fold; CLI harness over manifest harness. *Fails.*
5. **Property/idempotence lens** — for a manifest and a list of `{phase,knob,value}`, the
   result deep-merges without mutating input and is idempotent under re-application of the
   same overlay (apply twice ⇒ deep-equal). *Fails.*
6. **Empty harness = identity (guard the 8 existing)** — Given `harness: []` (or absent), then
   the flat path result deep-equals the no-harness result. *Fails only if guard wrong.*

RED — **pipeline-resolve-main.test.js** (run, fail because `--harness` is an unknown option →
current exit 2 for wrong reason / no coercion):
7. **Coercion table, one case per row** (assert via resolved `effective[review].harness` or
   the parsed overlay effect): `review.passes=2`→int 2; `review.passes=two`→string then B4
   rejects (step 9); `review.convergence=3`→number 3 (and Part-1 `reviewPlan.stop_rule ===
   'non-low-count<=3'`); `review.convergence=low-only`→string `'low-only'`;
   `validation.incremental=true`→bool true; `review.dimensions=code,perf`→`['code','perf']`;
   unknown knob (e.g. `review.foo=bar`)→string passthrough (accepted, ADR-030).
8. **Repeatable** — two `--harness` flags accumulate two overlay entries (e.g.
   `--harness review.convergence=3 --harness review.passes=2` both apply).
9. **Re-validation exit-2, message identity (R4)** — `--harness review.passes=0` → exit 2,
   `io.stderr` contains `phases.review.harness.passes must be a positive integer` (byte-
   identical to the manifest path).
10. **Unknown phase (R6, downstream B4)** — `--harness nope.passes=2` → exit 2, stderr
    contains `unknown phase: nope` (byte-identical to manifest path).
11. **Grammar faults (R6, parse-time)** — each exits 2 with the grammar message family:
    `--harness review.passes` (no `=`); `--harness .passes=2` (empty phase);
    `--harness review.=2` (empty knob); `--harness a.b.c=2` (bad dotted form).
12. **Missing value (R6)** — `--harness` at end of argv (or followed by a flag) → exit 2 via
    `takeValue` (`option --harness requires a non-flag value`).
13. **Composition** — `--profile lean --skip planning --harness review.passes=2` → exit 0,
    all three applied; flags in any order.

RED — **pipeline-resolve.bin.test.js** (spawn):
14. **End-to-end (ties Layer A+B)** — resolving `pipeline/default.yml` with
    `--harness review.passes=2` → `effective[review].harness.passes === 2` AND
    `effective[review].harness.reviewPlan.passes === 2`; and `--harness review.convergence=2`
    → `effective[review].harness.reviewPlan.stop_rule === 'non-low-count<=2'` (proves the CLI
    override flows through `validateHarness` into the Part-1-recomputed plan — no extra
    wiring).

GREEN:
- Export `validatePhases` from `manifest.js`.
- Add nested `mergeHarnessOverlay` + `harness` branch to `applyCliOverlay`.
- Add the `--harness` parse branch + `coerceHarnessValue` to `parseArgs`; thread `harness`
  through `main`; add the B4 `validatePhases` call site + import + exit-2 path. Run targeted
  gates → green.

REFACTOR:
- Keep `applyCliOverlay`, `mergeHarnessOverlay`, `coerceHarnessValue`, and the `--harness`
  parse branch each ≤20 lines, nesting ≤2 (extract helpers), early-returns, no magic strings
  (name the grammar message + the coercion knob keys). No swallowed errors — grammar/value
  faults surface to stderr and exit 2. No suppression directives.
- Edit `skills/run/SKILL.md` §0a/§1b and the `BACKLOG.md` P18 status line. (Prose — verified
  at review/doc phase.)

### Gate

- Part: `cd engine && node --test test/cli-overlay.test.js test/pipeline-resolve-main.test.js`
  (add `test/pipeline-resolve.bin.test.js` for the end-to-end tie, or fold it into the same
  `node --test` invocation).
- Phase-boundary: `cd engine && npm run ci`

### Commit

`feat(engine): add repeatable --harness CLI overlay with coercion and re-validation`
