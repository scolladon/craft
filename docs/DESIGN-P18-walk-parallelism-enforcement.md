# Design — P18: Walk / parallelism enforcement

> Brief: three review-harness knobs validate and reach the resolved descriptor but are
> honored by walk-judgment, not the engine. P18 makes them engine-enforced: (1) `passes > 1`
> multi-reviewer fan-out, (2) numeric `convergence: <n>` stopping, (3) the re-parked
> per-invocation `--harness` CLI flag (ADR-064) writing nested `phases.<id>.harness.<knob>`.
> Status: draft → self-reviewed ×3 → accepted

## Context

### The central tension — "engine-enforced" for behaviours the engine never executes

The Node engine (`engine/src/*`, `engine/bin/*`) does three things: it **parses** the
pipeline, **validates** the manifest, and **resolves** the effective descriptor list. It
does **not** spawn reviewers, count findings, or run any review loop. That work is the
orchestrator *walk* — the `craft:review` SKILL (`skills/review/SKILL.md`) — interpreting the
resolved `phase.harness` block. P8 wired the knobs end-to-end *up to that boundary* and then
**explicitly parked** the two behaviours that live past it:

- `skills/review/SKILL.md` lines 45–49 — "`passes > 1` … and a numeric `convergence: <n>`
  are honored by the session as self-directed constraints — the engine validates and carries
  them on the descriptor, but the multi-reviewer fan-out and arbitrary-threshold stopping are
  walk judgment, not engine-enforced in P8."
- `docs/DESIGN-P8-harness-config.md` R11 / lines 505–506 — the same two items, recorded as
  "not a silent cap — stated explicitly," with the numeric stop rule (finding-count vs
  severity-weighted) called out as "walk-judgment; not engine-enforced in P8."

So P18 cannot mean "move review execution into Node" — the engine has no review runtime and
P18 does not build one. What "engine-enforced" *can* mean here was the design's first
load-bearing question (DC-A); it is **resolved by ADR-096 to option (b)**: the resolver emits
an explicit `reviewPlan { passes, stop_rule }` on the resolved review descriptor, and the walk
reads it mechanically instead of re-deriving the knobs. So items (1)+(2) land as a combination
of **un-parking** — promoting walk prose from advisory ("honored by the session") to **binding
invariant** ("the walk MUST") — **and** a thin engine surface (the `reviewPlan` derivation)
that makes the numbers and the stop rule engine-owned data rather than walk judgment. Item (3)
— the `--harness` flag — is the larger genuinely-new **engine** path in this change, but it is
no longer the *only* engine surface: Layer A now carries the `reviewPlan` derivation too.

### What the engine already provides (verified — do not redesign)

- **Validation is done.** `engine/src/manifest.js` → `validateHarness(harness, phaseName, errors)`
  (lines 242–280) already type-checks every knob: `passes` = positive integer (>0),
  `convergence` = `CONVERGENCE_STRINGS {'low-only','none'}` OR `Number.isFinite(c) && c >= 0`,
  `max_cycles`, `dimensions`, `tool`, `scope`, `incremental`; unknown sub-keys pass (ADR-030).
  P18 items (1)+(2) are **not** "add validation."
- **The descriptor carries the knobs.** Empirically pinned (resolved `pipeline/default.yml` +
  a `phases.review.harness: {passes: 2, convergence: 3}` manifest override):

  ```json
  // resolution.effective[ id==="review" ].harness
  { "dimensions": ["code","security","tests","perf"],
    "passes": 2, "max_cycles": 3, "convergence": 3 }
  ```

  The overlay deep-merges manifest harness over the `pipeline/default.yml` defaults
  (ADR-029/ADR-031); the walk reads `effective[].harness` per `skills/run/SKILL.md` §3.
  This same resolved harness block is the **input** from which Layer A derives `reviewPlan`
  (ADR-096) — see the resolve seam pinned in Layer A below.
- **The CLI-overlay seam.** `engine/src/cli-overlay.js` → `applyCliOverlay(manifest, {profile, skip})`
  does a **flat** overlay: sets `pipeline.profile`, union-extends `pipeline.skip`. Pure,
  immutable (always returns a fresh top-level object and a fresh `pipeline`), no I/O.
- **The flag parser + resolve wiring.** `engine/src/pipeline-resolve-main.js` → `parseArgs`
  (lines 47–85) parses `--profile`/`--skip` via `takeValue`; `main` (87–149) calls
  `applyCliOverlay(manifest ?? {}, {profile, skip})` then `resolvePipeline`. The orchestrator
  forwards these flags at highest precedence (`skills/run/SKILL.md` §0a/§1b, ADR-022).
- **The two validation layers are separate, and the resolve bin does NOT validate.** Pinned:
  `pipeline-resolve-main.js` imports neither `validateManifest` nor `validateHarness`.
  Static-manifest validation lives only in `manifest-lint.js` (`scripts/manifest-lint.sh`,
  run at `skills/run/SKILL.md` §1). A bad `phases.review.harness.passes: 0` in the manifest is
  caught there with the message `phases.review.harness.passes must be a positive integer`
  (pinned). **Consequence:** a value injected by `--harness` enters resolution *downstream* of
  the only lint layer — so the overlay path must carry its own re-validation, or a bad
  `--harness review.passes=0` would slip through silently. This is a real new wiring concern
  (DC-C), not pure reuse.

### Constraining ADRs / prior docs

- **ADR-022** — per-invocation CLI overlay merges in the bin at **CLI-wins** precedence;
  `resolvePipeline` and the frozen export surface stay untouched. `--harness` must fold the
  same way.
- **ADR-064** — the `--harness` flag was re-parked at P12 *because* its precondition (the two
  knobs being engine-enforced) was unmet; it "lands with the future walk/parallelism pass" as
  "a bounded follow-up reusing the `--profile`/`--skip` overlay pattern." P18 **is** that pass.
- **ADR-029 / ADR-031** — harness deep-merge precedence and review defaults living as data in
  `pipeline/default.yml`. The `--harness` overlay folds **above** both.
- **ADR-030** — `validateHarness` is the single typed gate for harness knobs; the `--harness`
  path reuses it so CLI and manifest fail closed identically.
- **P8 design** (`docs/DESIGN-P8-harness-config.md`) — the SoT for knob semantics and the
  parked-item record this change resolves.

## Requirements

When P18 ships, all of the following are verifiable:

- **R1** — the resolver emits `reviewPlan { passes, stop_rule }` on the resolved review
  descriptor at `effective[review].harness.reviewPlan` (ADR-096); `reviewPlan.passes` echoes the
  resolved `harness.passes` (default `1`). This is an **engine fact** testable in
  `resolve.test.js`. `skills/review/SKILL.md` reads `phase.harness.reviewPlan.passes`
  mechanically and states `passes > 1` as a **binding** walk invariant: the Round-1 fan-out MUST
  spawn exactly `passes` reviewers per dimension in one message
  (`dimensions.length × passes` spawns), not "may." The parked-note block (lines 45–49) is
  removed; no silent cap remains.
- **R2** — `reviewPlan.stop_rule` is a named string encoding the resolved convergence case
  (ADR-097): the numeric `convergence: <n>` case is encoded as the non-LOW-finding-count rule,
  with `low-only` / `none` for those cases (exact names pinned in Layer A). This is an **engine
  fact** testable in `resolve.test.js`. `skills/review/SKILL.md` reads
  `phase.harness.reviewPlan.stop_rule` mechanically and states the stop rule **precisely and
  unambiguously** as a binding walk invariant — the rule is no longer "left to the walk" to
  derive.
- **R3** — `engine/bin/pipeline-resolve.js` accepts a per-invocation **`--harness` flag** that
  writes nested `phases.<id>.harness.<knob>` onto the effective manifest at highest precedence
  (above manifest, above `pipeline/default.yml`), composing with `--profile`/`--skip`.
- **R4** — the `--harness` value is **type-coerced** off the CLI string per a fixed table
  (`passes`/`max_cycles` → int; numeric `convergence` → number; `incremental` → bool;
  `dimensions` → list; everything else → string), then **re-validated through `validateHarness`**
  so a bad `--harness review.passes=0` exits non-zero with the **same** message a bad manifest
  produces (pinned: `phases.review.harness.passes must be a positive integer`).
- **R5** — the overlay remains **pure and immutable**: `applyCliOverlay` never mutates input;
  `phases`, the targeted phase block, and its `harness` are freshly constructed on write;
  `pipeline.profile`/`pipeline.skip` behaviour is unchanged (existing tests stay green).
- **R6** — a malformed `--harness` token never silently no-ops: a *grammar* fault (no `=`, empty
  phase or knob, a dotted path that is not `<phase>.<knob>`) is rejected at parse time; an
  *unknown phase id* is rejected downstream by the B4 re-validation. Both exit 2 with a clear
  stderr message (grammar faults mirror `takeValue`'s fail-loud contract; unknown phase reuses
  the canonical `unknown phase: <id>`).
- **R7** — the frozen engine export surface and `pipeline/default.yml` are untouched
  (ADR-022 surface gate); `resolvePipeline` signature is unchanged.
- **R8** — `skills/run/SKILL.md` forwards `--harness` from `$ARGUMENTS` to the resolve bin
  alongside `--profile`/`--skip` (§0a strip, §1b append), and `BACKLOG.md` P18 is ticked with
  the ADR-064 follow-up discharged.

## Design

The change splits into an **engine + doc/SKILL layer** for items 1+2 (Layer A — the
`reviewPlan` emission plus the SKILL un-parking) and an **engine layer** for item 3 (Layer B —
the new `--harness` overlay). Sizing is honest: Layer A is a thin pure derivation in the
resolve path plus prose promotion in the SKILL; Layer B is the larger new engine code (~one
parser branch + one overlay function + re-validation hook). Per ADR-096 and ADR-099, **Layer A
is no longer SKILL-only** — it carries the engine `reviewPlan` derivation.

### Layer A — emit `reviewPlan` and un-park `passes`/`convergence` (R1, R2)

The descriptor already carries `passes` and numeric `convergence` to the walk (pinned above).
What is missing is an **engine-owned plan** the walk reads mechanically (the `passes` count and
a named stop rule), plus **bindingness** in the SKILL. Two engine + doc surfaces change.

**A0. Engine — `reviewPlan` derivation in the resolve path (R1, R2; ADR-096/ADR-097).** The
resolver computes a pure `reviewPlan { passes, stop_rule }` from each review descriptor's
resolved `harness` block and attaches it **nested on that block** as
`effective[review].harness.reviewPlan`.

- **Seam.** In `engine/src/resolve.js`, `resolvePipeline` finalizes the enabled descriptors at
  `const effective = execResult.descriptors.filter(d => d.enabled);` (the single line that
  builds the returned `effective` list). The derivation is a new pure helper —
  `deriveReviewPlan(harness)` — applied per descriptor when mapping `effective`, writing a fresh
  descriptor with `harness: { ...d.harness, reviewPlan }` (immutable, no input mutation,
  consistent with the resolver's pure-transform discipline). It runs only for descriptors that
  carry a `harness` block (the review descriptor does; non-harness phases are untouched).
  `resolvePipeline`'s signature and the frozen export surface are unchanged (R7) — `reviewPlan`
  is a derived field on an existing block, not a new export or a new resolver argument.
- **Shape.** `reviewPlan = { passes: <int>, stop_rule: <string> }`.
  - `passes` = `Number.isInteger(harness.passes) ? harness.passes : 1` — echoes the resolved
    `harness.passes`, defaulting to `1` when absent (matches the `pipeline/default.yml` default
    and the SKILL preamble fallback).
  - `stop_rule` names the convergence case off `harness.convergence`:
    - `'low-only'` when `harness.convergence === 'low-only'` (or absent — the
      `pipeline/default.yml` default is `low-only`, so the resolved review descriptor always
      carries it unless overridden);
    - `'none'` when `harness.convergence === 'none'`;
    - `'non-low-count<=<n>'` for a numeric `harness.convergence === n` — the ADR-097 rule
      (stop when the count of remaining non-LOW / severity-≥-MEDIUM findings is `≤ n`). The
      threshold `n` is interpolated into the name (e.g. `convergence: 3` → `'non-low-count<=3'`,
      `convergence: 0` → `'non-low-count<=0'`) so the walk reads the exact threshold off one
      string with no re-derivation.

  `deriveReviewPlan` performs no validation of its own. In the run flow the harness block is
  already typed-valid before resolution — `manifest-lint` runs at `skills/run/SKILL.md` §1, and
  any `--harness` overlay is re-validated by Layer B's B4 hook before `resolvePipeline` — so
  `convergence` is one of `'low-only'`/`'none'`/a finite `≥ 0` number. The derivation classifies
  by the same string-vs-number distinction `validateHarness` uses (`CONVERGENCE_STRINGS` vs
  `Number.isFinite`); an absent `convergence` maps to the `'low-only'` default (the resolved
  review descriptor always carries one). It does not re-implement the type gate — `reviewPlan`
  is a *projection* of already-validated data, not a second validation site (CQS: a pure query,
  no error path).

**A1. `skills/review/SKILL.md` Procedure step 1 (fan-out).** Today step 1 reads "fan out
`passes` read-only **craft:reviewer** per dimension in parallel (one message, N×`passes`
spawns)." That is already imperative; the **parked block at lines 45–49 contradicts it** by
calling it "self-directed." Resolution: **delete lines 45–49**, and have the walk read
`phase.harness.reviewPlan.passes` (the engine-emitted plan number) instead of re-deriving
`passes` from the raw knob. There is no Node loop to add; "engine-enforced" for fan-out means
the engine **emits the concrete `passes` count on `reviewPlan`** (derived from the validated,
present knob), and the walk is **bound** to spawn exactly that many reviewers per dimension.

**A2. `skills/review/SKILL.md` Procedure step 4 (convergence).** Today: "`<n>` (numeric ≥0) →
stop when remaining findings ≤ n." The ambiguity P18 must kill is **what "remaining findings"
counts** — raw finding count vs a severity weighting (DC-B / ADR-097). The walk now reads
`phase.harness.reviewPlan.stop_rule` mechanically: `low-only` / `none` keep their meanings, and
`non-low-count<=<n>` means **stop when the count of remaining non-LOW findings is ≤ n**. The
count is well-defined because findings are already normalized to a canonical `Finding[]`
(`{file, line, severity, finding, fix?}`) by `engine/bin/normalize-findings.js` (step 2) — so
"count" has an unambiguous, engine-defined denominator. Step 4 is rewritten to read the named
`stop_rule` and apply it, without the "walk judgment" hedge. This is the lever that makes
numeric `convergence` *mechanical*: the stop predicate reads off a named rule the engine emits
and a normalized array the engine produces, not a reviewer's prose.

### Layer B — the `--harness` per-invocation overlay (R3–R6)

This is the new engine path. It reuses the `--profile`/`--skip` shape exactly: orchestrator
strips the flag from `$ARGUMENTS` and forwards it to `pipeline-resolve.js`; the bin folds it
into the effective manifest at highest precedence before `resolvePipeline`.

**B1. Grammar (DC-C).** Recommendation: **repeatable `--harness <phase>.<knob>=<value>`**,
phase-relative (the `.harness.` segment is implied). One flag = one knob; repeat for several.
Examples:

```
--harness review.passes=2
--harness review.convergence=3 --harness review.passes=2
--harness validation.incremental=true
```

Phase-relative `<phase>.<knob>` (not full `phases.review.harness.passes`) keeps the surface
terse and mirrors how a user thinks ("set review's passes"); the `.harness.` insertion is the
overlay's job. **Parse-time** rejects only *grammar* faults — no `=`, empty phase or knob, more
than one `.` separating phase from knob. **Phase-id existence is checked downstream** by the B4
re-validation (via `validatePhases`), not at parse time, because the known-phase set is private
to `manifest.js` and aliased through `resolveAlias` — so an unknown `--harness nope.passes=2`
surfaces as `unknown phase: nope` from the existing validator, with zero phase-set duplication.

**B2. Type-coercion table (DC-C).** The CLI value is always a string; coercion is keyed on the
knob name (a closed, engine-owned map — the same knobs `validateHarness` types):

| Knob | Coerces to | From string | Note |
|---|---|---|---|
| `passes` | integer | `Number.parseInt`, must round-trip | non-int → leave as string → `validateHarness` rejects |
| `max_cycles` | integer | `Number.parseInt`, must round-trip | same |
| `convergence` | number **or** string | `low-only`/`none` stay string; else `Number` | preserves the string\|numeric union |
| `incremental` | boolean | `true`/`false` only | any other → leave string → `validateHarness` rejects |
| `dimensions` | string list | comma-split, trim, drop empties | mirrors `--skip` splitting |
| `tool`, `scope` | string | identity | |
| *(unknown knob)* | string | identity | passes through; `validateHarness` allows unknown sub-keys (ADR-030) |

Coercion is **best-effort, never throwing**: a value that cannot be coerced to its declared
type is left as the raw string and then **rejected by `validateHarness`** with the canonical
per-knob message. This keeps one error vocabulary for CLI and manifest (R4).

**B3. Overlay function — nested write, immutable.** A new pure helper (sibling to
`unionSkip`) folds the parsed `--harness` entries into the manifest. Unlike the flat
profile/skip overlay it writes a **nested** path `phases.<id>.harness.<knob>`, **deep-merging**
over any manifest-supplied harness for that phase (highest precedence, ADR-029-consistent),
freshly constructing `phases`, the phase block, and its `harness` on the write path — input
never mutated (R5). Signature extends the existing overlay:

```js
applyCliOverlay(manifest, { profile, skip, harness })
//   harness: Array<{ phase: string, knob: string, value: <coerced> }>  | undefined
```

Empty/absent `harness` → the existing flat path is untouched (the current 8 cli-overlay tests
stay green verbatim). The function stays one screen; the nested-merge helper is extracted so
`applyCliOverlay` does not grow nesting depth (>2 forbidden).

**B4. Re-validation hook (R4) — the new wiring concern.** Because `pipeline-resolve-main.js`
does not call `validateManifest` (pinned), the coerced overlay must be re-validated *in the
resolve bin* before `resolvePipeline`. Two facts shape the mechanism (pinned): the known-phase
set `PHASE_NAMES` is **module-private** to `manifest.js` (not exported), and phase ids are
normalized through the shared `resolveAlias`. So validating *just* the harness block via
`validateHarness` would catch a bad knob **value** but NOT an unknown phase **id** — and the
overlay's nested `phases.<id>.harness` write means an unknown `<id>` must be rejected too (R6).

Recommendation: re-validate **only the `--harness`-touched phases** through the existing
**`validatePhases`** (which already does `PHASE_NAMES.has(resolveAlias(phaseName))` →
`unknown phase: <id>` *and* dispatches each block's `harness` to `validateHarness`), not
through `validateHarness` in isolation. Construct a `{ phases: <touched-subset> }` object from
the overlay result and run `validatePhases(that, () => true, errors)`. This reuses **both**
gates (phase-existence + knob-typing) with zero new phase-set export and zero new error
vocabulary. On any error, write the accumulated messages to stderr and exit 2 — the same
non-zero path `parseArgs`/`resolvePipeline` already use. It validates only the overlay's own
phases (not the whole manifest — that was already linted upstream at `run` §1; re-linting here
would duplicate that gate and could surface pre-existing manifest issues out of context). This
is the honest "fail closed identically to a bad manifest" requirement, and it is a genuinely
new call site, so it is sized as such. (`validatePhases` is currently module-private in
`manifest.js`; exporting it — or a thin `validateTouchedPhases` wrapper — is the one small
surface addition Layer B needs; it is **not** part of the ADR-022 frozen *resolver* surface,
which is `resolvePipeline` + the 7 exports.)

**B5. Parse + thread in `pipeline-resolve-main.js`.** `parseArgs` gains a `--harness` branch
(repeatable: accumulate into an array via `takeValue`, then parse `<phase>.<knob>=<value>` and
coerce per B2). `main` threads the parsed `harness` array into `applyCliOverlay` and runs the
B4 re-validation. Usage string updated. Unknown-option / missing-value behaviour reuses the
existing `takeValue` and `arg.startsWith('-')` guards.

**B6. Orchestrator forwarding (R8).** `skills/run/SKILL.md` §0a today strips `--profile`/`--skip`
as single-occurrence flags; P18 adds **repeatable** `--harness <phase>.<knob>=<value>` stripping
(may appear multiple times, anywhere in `$ARGUMENTS`) and §1b appends each occurrence to the bin
invocation. The §1b usage line and the §0a strip list both grow one flag. Precedence note added:
`--harness` wins over manifest harness and over `pipeline/default.yml` (ADR-022 CLI-wins, extended
to the nested knob path). The non-flag remainder rule (flags-only ⇒ empty brief ⇒ ambiguous STOP)
is unchanged.

### Error semantics (consolidated)

| Condition | Where caught | Exit | Message family |
|---|---|---|---|
| `--harness` token missing `=` / empty phase or knob / bad dotted form | `parseArgs` (grammar) | 2 | `pipeline-resolve: --harness expects <phase>.<knob>=<value>` |
| `--harness` phase id not a known phase | B4 `validatePhases` (downstream) | 2 | `unknown phase: <id>` (canonical, identical to manifest) |
| coerced knob value invalid (e.g. `passes=0`, `passes=two`) | B4 `validatePhases`→`validateHarness` | 2 | `phases.<id>.harness.<knob> must be …` (canonical, identical to manifest) |
| missing value after `--harness` | `takeValue` | 2 | `pipeline-resolve: option --harness requires a non-flag value` |

## Decision candidates

All four candidates are **resolved** (ADRs 096–099, accepted 2026-06-21). The table records
the ratified outcome; the "Recommendation" column preserves the original designer
recommendation for provenance, and the **Resolution** cell states what was ratified.

| # | Choice | Alternatives (≤3) | Recommendation | Resolution |
|---|---|---|---|---|
| DC-A | What "engine-enforced" means for `passes`/`convergence` (items 1+2), given the engine runs no review loop | (a) **Un-park as walk-binding invariants** — delete the parked block, rewrite `skills/review/SKILL.md` steps 1+4 to MUST-honor `passes`/numeric-`convergence`; engine's guarantee = the knobs are well-formed + present on every review descriptor (already true). Lightest: doc/SKILL only, zero engine code for 1+2. (b) **Engine emits an explicit review-plan** — resolution adds a concrete `passes` int + named `stop_rule` to the resolved review descriptor; the walk reads them mechanically. Moves the *numbers* to engine ownership; execution still in walk. Adds an engine field + a descriptor test. (c) **Hybrid** — (a)'s prose binding + (b)'s `stop_rule` name only (no separate `passes` echo, since `passes` already rides the descriptor). | designer recommended **(a)** (lightest, no duplicated state). | **Resolved to (b)** (ADR-096) — **the user chose the engine review-plan field over the prose-only recommendation**. The resolver emits `reviewPlan { passes, stop_rule }` on the resolved review descriptor (`effective[review].harness.reviewPlan`); the walk reads it mechanically. Layer A therefore carries engine code (it is **not** SKILL-only). Folded through Context, R1/R2, Layer A (A0), and Test strategy. |
| DC-B | Numeric `convergence: <n>` stop-rule semantics (undefined today: finding-count vs severity-weighted) | (a) **Count of remaining non-LOW findings ≤ n** — stop when ≤ n MEDIUM-or-higher findings remain (LOW already excluded by the `low-only` sibling rule; counts off the normalized `Finding[]`). (b) **Count of all remaining findings ≤ n** — includes LOW. (c) **Severity-weighted score ≤ n** — e.g. CRITICAL=4/HIGH=3/MEDIUM=2/LOW=1 summed. | designer recommended **(a)**. | **Resolved to (a)** (ADR-097) — matches the recommendation. Numeric `convergence: <n>` stops when the count of remaining non-LOW (severity ≥ MEDIUM) findings is ≤ n, off the normalized `Finding[]`. This is what `reviewPlan.stop_rule` encodes as `non-low-count<=<n>` for the numeric case. |
| DC-C | `--harness` flag grammar + repeatability + type-coercion source | (a) **Repeatable `--harness <phase>.<knob>=<value>`**, phase-relative (`.harness.` implied), one knob per flag, coercion keyed on knob name. (b) **Full-path `--harness phases.<id>.harness.<knob>=<value>`**, repeatable — explicit, no implied segment. (c) **Single CSV `--harness review.passes=2,review.convergence=3`** — one flag, comma-split. | designer recommended **(a)**. | **Resolved to (a)** (ADR-098) — matches the recommendation. Repeatable phase-relative `--harness <phase>.<knob>=<value>`; coercion table; re-validate via `validatePhases` → `validateHarness`; CLI-wins precedence. Layer B is unchanged by the fold. |
| DC-D | Scope/sequencing of the three items (item 3 preconditioned on 1+2) | (a) **All three in this change**, two slices: Slice 1 = Layer A; Slice 2 = Layer B (`--harness` engine path). (b) **Items 1+2 only**, defer the flag to a follow-up. (c) **Item 3 only**, treat 1+2 as already-done since the descriptor carries them. | designer recommended **(a)** (slice 1 originally framed as SKILL-only). | **Resolved to (a)** (ADR-099) — matches the recommendation: all three, two slices, A before B. **Per ADR-096, Slice 1 / Layer A is no longer SKILL-only** — it carries the engine `reviewPlan` emission. Slice order (A before B) still satisfies item 3's precondition. |

## Test strategy

All engine tests are `node --test` BDD (`engine/test/*.test.js`), Given/When/Then titles, AAA
body, `sut` variable, mirroring `engine/test/cli-overlay.test.js` and
`engine/test/pipeline-resolve-main.test.js`.

### Must stay green (the surface gate — R7)

- `engine/test/cli-overlay.test.js` — all 8 existing cases unchanged (flat profile/skip path
  untouched; empty `harness` overlay = identity).
- `engine/test/resolve.test.js`, `scenarios.test.js`, `contract-equivalence.test.js` — existing
  assertions stay green. **Under ADR-096 there IS a new resolved field** (`harness.reviewPlan`);
  existing assertions that read named harness knobs (`passes`, `convergence`, `dimensions`,
  `max_cycles`) are unaffected because `reviewPlan` is additive on the block. New `reviewPlan`
  assertions are added under the Layer A test section below.
- `engine/test/manifest.test.js` — `validateHarness` cases unchanged (reused, not modified;
  `reviewPlan` is derived post-validation, not a validated input knob).

### Layer B — `applyCliOverlay` nested harness (new cases in `cli-overlay.test.js`)

- Given a manifest and a `harness` overlay `[{phase:'review',knob:'passes',value:2}]`, when
  `applyCliOverlay` runs, then `result.phases.review.harness.passes === 2` and the input is not
  mutated (fresh `phases`/block/`harness` — assert `notStrictEqual` on each level).
- Given a manifest with existing `phases.review.harness.convergence:'low-only'` and a harness
  overlay setting `passes`, when applied, then `convergence` is preserved and `passes` added
  (deep-merge, not replace).
- Given overlays for two distinct phases, when applied, then both phase blocks carry their
  knob and unrelated phases are untouched.
- Given `harness` overlay together with `profile`+`skip`, when applied, then all three fold and
  precedence holds (CLI harness over manifest harness).
- Property-test lens (overlay is a merge): for any manifest and any list of `{phase,knob,value}`,
  the result deep-merges without mutating input and is idempotent under re-application of the
  same overlay.

### Layer B — `parseArgs`/`main` coercion + re-validation (`pipeline-resolve-main.test.js`)

- Coercion table, one case per row: `passes=2`→int 2; `passes=two`→string (then B4 rejects);
  `convergence=3`→number 3; `convergence=low-only`→string `'low-only'`; `incremental=true`→bool;
  `dimensions=code,perf`→`['code','perf']`; unknown knob→string passthrough.
- Repeatable: two `--harness` flags accumulate into two overlay entries.
- Re-validation (B4): `--harness review.passes=0` → exit 2, stderr contains the canonical
  `phases.review.harness.passes must be a positive integer` (assert message identity with the
  manifest path — the R4 "same message" guarantee).
- Malformed grammar (R6, parse-time): `--harness review.passes` (no `=`) → exit 2;
  `--harness .passes=2` (empty phase) → exit 2; `--harness review.=2` (empty knob) → exit 2;
  `--harness` (missing value) → exit 2 via `takeValue`.
- Unknown phase (R6, downstream B4): `--harness nope.passes=2` → exit 2, stderr contains
  `unknown phase: nope` (message identity with the manifest path).
- Composition (ADR-023 style): `--profile lean --skip planning --harness review.passes=2`
  resolves with all three applied; flags in any order.
- End-to-end (bin-level, alongside `pipeline-resolve.bin.test.js`): resolving
  `pipeline/default.yml` with `--harness review.passes=2` yields `effective[review].harness.passes === 2`.

### Layer A — `reviewPlan` derivation (`resolve.test.js`) + SKILL prose

Under ADR-096 Layer A carries an engine field, so it **needs a resolution test** pinning
`effective[review].harness.reviewPlan`. New cases in `engine/test/resolve.test.js` (mirroring
its existing `resolvePipeline(defaults, manifest)` style), each asserting the plan shape and
values:

- Given the default `pipeline/default.yml` review descriptor (`passes: 1`,
  `convergence: low-only`), when resolved with an empty manifest, then
  `effective[review].harness.reviewPlan` deep-equals `{ passes: 1, stop_rule: 'low-only' }`
  (the **default** when `passes`/`convergence` are not overridden).
- Given a manifest override `phases.review.harness: { passes: 2 }`, when resolved, then
  `reviewPlan.passes === 2` (the **passes echo**) and `stop_rule === 'low-only'` (inherited
  default convergence).
- Given `phases.review.harness: { convergence: 'none' }`, when resolved, then
  `reviewPlan.stop_rule === 'none'`.
- Given `phases.review.harness: { convergence: 3 }`, when resolved, then
  `reviewPlan.stop_rule === 'non-low-count<=3'` (the **numeric** case, ADR-097); and a
  `convergence: 0` case yields `'non-low-count<=0'`.
- Given a non-harness phase (no `harness` block), when resolved, then no `reviewPlan` is
  attached — the derivation runs only for descriptors carrying a `harness` block.
- Immutability: the resolved descriptor's `harness` is a fresh object (input defaults/manifest
  not mutated) — `reviewPlan` is added without rewriting the sibling knobs.

End-to-end (bin-level) ties Layer A and Layer B: resolving with `--harness review.convergence=2`
yields `effective[review].harness.reviewPlan.stop_rule === 'non-low-count<=2'`, proving the CLI
override flows through `validateHarness` into the recomputed plan (ADR-096 consequence: the
overlay tunes the input knob, `reviewPlan` is recomputed from it — no extra wiring).

The SKILL-prose half (steps 1+4 reading `reviewPlan` mechanically, parked block removed) is a
prose change verified at the review/doc phase, not an engine test.

## Out of scope

- **A Node review runtime.** P18 does not move reviewer spawning or finding-counting into the
  engine; there is none and building one is not in the brief. Emitting `reviewPlan` (ADR-096)
  is **not** running the loop — the resolver computes a plan from validated knobs, but the walk
  still spawns reviewers and counts findings. "Engine-enforced" is bounded to: the engine emits
  `reviewPlan { passes, stop_rule }` on the resolved review descriptor + binding walk prose that
  reads it + the new `--harness` overlay (DC-A=(b), DC-C).
- **Severity-weighted convergence scoring** (DC-B alt c). Deferred as YAGNI; the numeric
  threshold is a plain non-LOW count. A future repo that wants weighting can add a knob under
  ADR-030's forward-compat.
- **Non-review harness knobs via `--harness`.** The flag is general (any `phases.<id>.harness.<knob>`),
  but P18's behavioural enforcement work (items 1+2) is review-only; validation/architecture
  harness knobs already flow through the descriptor and are out of this change's prose scope.
- **`pipeline/default.yml` edits.** The defaults are correct (ADR-031); the surface gate forbids
  touching them. `--harness` overrides at runtime, not the data SoT.
- **Whole-manifest re-validation in the resolve bin.** B4 re-validates only the `--harness`-touched
  phases; full-manifest lint stays the single upstream responsibility of `manifest-lint`
  (`skills/run/SKILL.md` §1) to avoid a duplicated gate.
