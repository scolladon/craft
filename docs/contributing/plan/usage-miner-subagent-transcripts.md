# Plan — usage-miner-subagent-transcripts

> Source: design doc `docs/contributing/design/usage-miner-subagent-transcripts.md` · ADRs `328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340`
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

## Plan shape (6 parts, sequential, one working tree `fix/usage-miner-subagent-transcripts`)

| # | Part | Archetype | src delta |
|---|---|---|---|
| 1 | Priced cost in dollars: the `1e6` divisor + the two current model rates | pure-module + schema-module | yes |
| 2 | One event per usage-bearing line: the claude parser inverts | pure-module (binding) | yes |
| 3 | Two-level transcript discovery inside the claude adapter | pure-module (new file) | yes |
| 4 | Front-door wiring: discovery ports, `--no-inline`, zero-arg read root | resolver-wiring + native-surface | yes |
| 5 | The metrics ledger: transcript-sourced rows + one boundary marker | docs-prose (standalone) | no |
| 6 | Regenerate the drift baseline and move the README claims with it | mutation-baseline-file (standalone) | no |

## HARD ORDERING CONSTRAINT — read this before touching anything

ADR-332 and ADR-338 impose an order the parts encode. **Parts may not be reordered, and
Part 6 may not be run early "to see what it looks like".**

1. **Part 1 lands first.** The priced-cost correction (`TOKENS_PER_MTOK` divisor + the
   `claude-opus-5` / `claude-sonnet-5` rates) must be in the tree before any report is
   regenerated. Half the corpus prices to `null` without the rates; every priced value
   is 10⁶ too large without the divisor.
2. **Parts 2–4 land next.** Main-loop inclusion by default (ADR-329) and sub-agent
   transcript mining must both be in effect.
3. **Only then Part 6 regenerates `docs/contributing/metrics-baseline.report.json`.**

Regenerating before either bakes a *second* stale baseline: one still carrying `null`
for half its groups, or one missing main-loop cost entirely, or one 10⁶ off in dollars.
Part 6's gate asserts all three mechanically so an accidental reorder cannot pass.

Part 5 is order-independent between Part 4 and Part 6; it is placed there so the ledger
boundary marker is appended once the code that ends the false accounting is in the tree.

## Public-surface decision — every new export is INTERNAL

`engine/src/index.js` is a **curated** public barrel (descriptor, graph, alias-map,
resolve, contract, findings, manifest, policy). It deliberately omits every module that
is reached through a bin shim rather than imported by another engine module —
`contain.js`, `init-emit.js`, `usage-aggregate.js`, `usage-mine-main.js`, and the whole
of `engine/src/observability/`. This change adds **nothing** to that barrel.

New exported symbols and their status:

| Symbol | File | Status |
|---|---|---|
| `discover` | `engine/src/observability/adapters/claude/discovery.js` | internal — imported only by `usage-mine-main.js`; not in the barrel |
| `dashedCwd` | `engine/src/observability/usage-mine-main.js` | internal unit-test seam, mirroring the existing `resolveDefaultReadRoot` / `resolveSourceFilter` seams |
| `resolveDefaultTranscriptDir` | `engine/src/observability/usage-mine-main.js` | internal unit-test seam, same precedent |

Downstream surface gates this repo enforces, and where each is pre-paid:

- **`engine/src/index.js` barrel** — nothing added. No barrel-completeness test exists;
  internal is both the precedent and lint-safe.
- **`test/source-hygiene.test.js`** (run by `run_suite process test` inside `ci.sh`) —
  greps `pipeline/ skills/ agents/ contracts/ templates/ engine/src/ docs/contributing/specs/ docs/contributing/DOD.md docs/guides/customizing.md README.md` for
  Class A (`stryker`, `cosmic-ray`, `cargo-mutants`, `dependency-cruiser`, `depcruise`,
  and the two words for altering-code-to-test-tests) and
  Class B (`\bgh\b|\bgithub\b`) tokens. **Parts 4, 5 and 6 write into `skills/` and
  `README.md` and MUST avoid those words.** Class C bans vendor-suffixed *basenames*
  (`-claude.js`) outside `adapters/<vendor>/`; the new `discovery.js` sits under
  `adapters/claude/` and carries no vendor suffix, so it is clean either way.
- **`scripts/ci.sh` `run_suite`** — enumerates `*.test.js` with `find`, no expected-count
  variable. New test files are picked up automatically; a **renamed or deleted** test file
  is fine, a zero-file suite is a hard error. No counter to bump.
- **`scripts/readme-drift.sh`** (a separate CI job, NOT part of `ci.sh`) — recounts
  `docs/contributing/design/`, `docs/contributing/plan/`, `docs/contributing/adr/`
  against the README's advertised numbers, and recomputes the FAQ telemetry claims from
  the committed baseline. **It is already red on this branch** (design claims 26, tree
  holds 27; ADRs claim 327, tree holds 340) because the design doc and the thirteen ADRs
  are already committed, and this plan file makes the plan count move too. **Part 6 owns
  fixing it and gates on it.**
- **`prose-lint`** — runs advisory (`hygiene-gate` resolves `advisory` from
  `.claude/workflow.md`) over touched `.md` outside `adr/ design/ archive/ specs/ prd/ plan/`.
  So `README.md` and `skills/**` are scanned. Ban list: `delve`, `leverage`, `seamless`,
  `robust`, `it's important to note`, `in conclusion`. Advisory, but write around them.
- **`scripts/docs-structure-lint.sh docs/contributing`** — this plan file lives under
  `docs/contributing/plan/`, alongside 25 existing plans; no new structure.
- **`intention-lint`** (`scripts/living-corpus.sh`: `docs/contributing/specs/*.md`,
  `docs/contributing/prd/DESIGN-*.md`, `docs/contributing/DOD.md`,
  `docs/guides/customizing.md`, `BACKLOG.md`) — plan and design docs are **outside** it.
  `docs/contributing/specs/telemetry.md` is inside it and is refreshed by the
  **documentation phase**, not by a part here (see the handoff section below).

## Cross-part file overlap — declared, deliberate

`plan-lint` emits an advisory cognitive-locality warning when two parts declare the same
file. Three files are deliberately touched by more than one part, and merging the parts
would be worse than the warning:

- `engine/src/observability/usage-aggregate.js` — Part 1 only. No overlap.
- `engine/src/observability/adapters/claude/telemetry.js` — Part 2 only. No overlap.
- `engine/test/usage-mine-main.test.js` — Part 1 (one `--prices` unit assertion),
  Part 2 (fixture-constant repair forced by the emission-rule flip), Part 4 (the new
  front-door behaviour). Each part must leave this file green at its own gate; they are
  separate because the *production* files they exercise are separate and land in a
  strict order.
- `engine/src/observability/usage-mine-main.js` — Part 4 only. No overlap.
- `docs/contributing/metrics-baseline.report.json` — Part 6 only.

## The seam this change pins — read once, it is referenced by Parts 2, 3 and 4

```
TranscriptEntry = { relPath: string, context: object }
    relPath  — RELATIVE to the resolved READ root; the adapter never holds an absolute path
    context  — OPAQUE to the front door. Authored by the claude adapter's discover(),
               consumed by the claude adapter's parseLines(). The front door never reads
               a field of it; it only spreads its own `includeInline` flag alongside.

discover({ listDir, readText }) → { entries: TranscriptEntry[], unreadable: number }
    listDir(relPath) → string[] | null     // null = could not list; [] = listed, empty
    readText(relPath) → string | null      // null = could not read
    Both ports are front-door-implemented over already-contained paths and NEVER throw.

parseLines(lines, since = null, context = null) → { events, skipped, markers, unlabelled }
```

Two shapes deviate from the design doc's sketch. Both are mechanical consequences of
requirements the design itself states; neither is a new load-bearing choice:

1. **`listDir` returns `null` on failure, not `[]`.** The design's advisory table demands
   distinguishing "`subagents/` exists but is empty — contributes nothing, no note" from
   "listing `subagents/` threw — caught, **counted**". `[]` cannot express both. `null`
   can, and the port still never throws.
2. **`discover` returns `{ entries, unreadable }`, not a bare array.** The `unreadable`
   tally is the counted skip the advisory table requires. Only `discover` knows a
   `subagents` name was present in the parent listing and then failed to list — the front
   door cannot know that without reading claude layout knowledge it must not hold.

Where the counting lives, once each, so no tally is double-reported:

| Counter | Owner | Meaning |
|---|---|---|
| `skipped` | `parseLines` | malformed JSON lines (existing behaviour, unchanged) |
| `unlabelled` | `parseLines` | 1 when this stream emitted at least one event with `role === null`; else 0 |
| `unreadable` | `discover` | a `subagents` child was named in its parent's listing but `listDir` returned `null` |
| `refused` | `streamTranscriptFiles` | an entry's `relPath` failed `containByRealpath` before opening |

## Documentation-phase handoff (NOT a part — do not implement it here)

`docs/contributing/specs/telemetry.md` declares `subjects: ['engine/src/observability/**']`,
so it is this change's living-intention obligation. It is documentation work and the
**documentation phase** owns it. Recorded here so it cannot be dropped. Sections needing
refresh:

- **`## Claude binding`** — two-level discovery, the single emission rule, sidecar labelling.
- **`## Inline gap / --include-inline (ADR-187)`** — rewritten (not deleted) for the
  default-on main-loop group and the `--no-inline` escape.
- **`## Failure semantics`** — the new counted-fallback branches and their stderr lines.
- **The wrong-level `--dir` caveat** — currently present only for `--source codex`; the
  claude binding needs the equivalent paragraph (pointing `--dir` at a *session* dir
  instead of a *project* dir finds neither `<dir>/*.jsonl` nor
  `<dir>/*/subagents/agent-*.jsonl`, and reports a silent zero).
- **The `report.json` schema section** — needs **no** unit change. It already documents
  `"priced": 0.00123` against `"relative": 4500`, i.e. dollars, which is what Part 1
  makes true.
- **Its final line** — points at `docs/metrics-baseline.report.json`, a **stale path**.
  The real file is `docs/contributing/metrics-baseline.report.json`.
- **The opt-in live reconciliation recipe** (design Test strategy tier 3) — a short
  reproduction recipe so a maintainer can re-derive the corpus numbers locally. It must
  name the craft arm's window caveat: that session was resumed the next day, so mining
  the whole directory yields 753,224,548 tokens / $425.62 rather than the published
  544,271,827 / $297.55, and the CLI has no upper time bound (ADR-339 declined `--until`).

## Proving the fix against real data without committing transcripts

The live corpus is ~3.9B tokens across 274 files and is never committed. Three tiers:

1. **Frozen minimal fixtures (committed, Parts 2–4).** A new
   `engine/test/fixtures/telemetry/projects/` tree mirroring the pinned layout with real
   field names and hand-chosen small numbers, total well under 20KB — same discipline as
   `engine/test/fixtures/{codex,pi,opencode,copilot}/`.
2. **Arithmetic pinned by assertion, not by data (Parts 1 and 2).** The token convention
   (`input + output + cache_read + ephemeral_5m + ephemeral_1h`) is asserted directly;
   the published dollar figures are asserted as a **golden vector** over measured
   per-model class totals against the **real** `DEFAULT_PRICES` (ADR-339).
   **No test asserts a corpus absolute** — the corpus grows under the miner's feet.
3. **One live regeneration, committed as an artifact (Part 6).** The baseline is produced
   by running the fixed miner over the local corpus once and committing the result. Its
   gate is a set of *structural* assertions (no `null` price on the two `-5` models, a
   `main-loop` group present, the dollar sum of order 10³), never an absolute total.

---

## Part 1 — Priced cost in dollars: the `1e6` divisor and the two current model rates

### Context

Discharges **ADR-338** (both defects, option 3) and **ADR-339** (the reconciliation is a
core golden vector, no `--until` flag). Satisfies design Requirements 11, 12, 13 and the
first clause of 14. **This part lands FIRST — see the hard ordering constraint above.**

**Files to change**

- `engine/src/observability/adapters/claude/pricing.js` (101 lines)
- `engine/src/observability/usage-aggregate.js` (445 lines)
- `engine/test/usage-aggregate.test.js` (1426 lines)
- `engine/test/usage-mine-main.test.js` (one added case only)
- `engine/test/tune-smoke.test.js` (one added assertion only)
- `docs/contributing/plan/usage-telemetry-miner.md` (one stale sentence)

**`pricing.js` — current state and the exact edits**

`DEFAULT_PRICES` (line 59) currently holds `claude-opus-4-8/4-7/4-6` at `priceEntry(5, 25)`,
`claude-sonnet-4-6` at `priceEntry(3, 15)`, `claude-fable-5` and `claude-mythos-5` at
`priceEntry(10, 50)`, `claude-haiku-4-5` at `priceEntry(1, 5)`.

- **Add** `'claude-opus-5': priceEntry(5, 25)` and `'claude-sonnet-5': priceEntry(3, 15)`.
  These are **not** looked-up values — they are the only rates that reproduce the
  published dollars to the cent (ADR-339 verified them on all three benchmark arms).
- **`priceEntry` (line 42) and the three cache multipliers (lines 31–33) are UNTOUCHED.**
  `CACHE_READ_MULTIPLIER = 0.1`, `CACHE_CREATION_5M_MULTIPLIER = 1.25`,
  `CACHE_CREATION_1H_MULTIPLIER = 2.0` all stay. Rates remain **per-MTok**.
- **Correct the module header, line 9:** *"The core stores per-MTok rates directly; no 1e6
  scaling is applied"* is now false. Replace with a statement that the core divides the
  summed `Σ(tokens × per-MTok rate)` by one million once per emitted dollar value, and
  that the table's own entries — including `--prices` overrides — stay per-MTok.

**The trap that decides this whole part: the `1e6` divides the Σ, never the rates.**
`--prices` override entries are documented per-MTok (ADR-183), and `mergePrices` does a
field-level merge on top of `DEFAULT_PRICES`. Dividing inside `priceEntry` would leave
every override entry 10⁶ off against the defaults it merges with — a worse footgun than
the one being fixed. **Do not touch `priceEntry`, `mergePrices`, or `loadPriceTable`.**

**`usage-aggregate.js` — the full call-site inventory. Divide at exactly two sites.**

| # | Site | line | Today | After |
|---|---|---|---|---|
| 1 | `computePricedCost(tokens, cacheCreationTtl, prices)` | 35 | Σ | **`Σ / TOKENS_PER_MTOK`** |
| 2 | `computePricedCreation(...)` **as composed inside site 1** | 27, called at 36 | Σ | **unchanged — must stay undivided**, or site 1 double-divides the creation term (10⁻¹²) |
| 3 | `buildEnrichedGroup` → `pricedCreationCost` | 91–93 | Σ | **must be divided at this site** — the only emitter that does not inherit site 1 |
| 4 | `computeCost` → `cost.priced` | 43–47 | Σ | inherits ÷ |
| 5 | `buildReviewCycles` → `costPerCycle[i]` | 131–134 | Σ | inherits ÷ |
| 6 | `buildRoutingRec` → `projected`, `evidence.currentPricedCost`, `.projectedPricedCost` | 181–196 | Σ | inherits ÷ on both sides of `projected >= expensive.cost.priced` — scale-invariant, routing behaviour unchanged |
| 7 | `cacheHotspotRecs` → `evidence.shareOfRunCost` | 163–178 | ratio | **stays a ratio only if site 3 is divided**; a fix applied only at site 1 breaks a field that is correct today |
| 8 | `computeBaselineDeltas` → `pricedCostDelta` | 265–278 | Σ | inherits ÷ |
| 9 | `renderMarkdown` cost string | 422–424 | `g.cost.priced / 1e6` **compensator** | **DELETE the `/1e6` and the `C2:` comment above it** — leaving it renders `$0.0000` for every group |

Shape: one named constant `const TOKENS_PER_MTOK = 1_000_000;` near
`CACHE_HOTSPOT_THRESHOLD` (line 10), and one named private helper used at sites 1 and 3
so both emitters read as a unit conversion rather than a magic divisor — for example
`function toDollars(summedRateProduct) { return summedRateProduct / TOKENS_PER_MTOK; }`.
`TOKENS_PER_MTOK` stays **private** (not exported).

`computePricedCreation` keeps its current signature and semantics; the division wraps the
call at site 3, it does not move inside the function.

**The six existing assertions that must be rescaled, with exact locations**

`engine/test/usage-aggregate.test.js`, synthetic `PRICE_TABLE` at line 16
(`model-a: { input: 5, cacheRead: 0.5, cacheCreation5m: 6.25, cacheCreation1h: 10, output: 25 }`),
`makeEvent` helper at line 21:

| § | line | Currently asserts | After |
|---|---|---|---|
| 1 | 36–48 | `group.cost.priced === 2*5 + 100*0.5 + 50*6.25 + 10*25` (= 622.5) | same expression `/ TOKENS_PER_MTOK` written as `/ 1e6`; the title's `Σ class×rate` becomes `Σ class×rate ÷ 1 MTok` |
| 3 | 66–78 | `group.cost.priced === 200*6.25 + 100*10` (= 2250) | `(200*6.25 + 100*10) / 1e6` |
| 17 | 364–381 | `assert.equal(group.cost.priced, 2325, …)` | `2325 / 1e6`; the inline comment arithmetic stays, gains the `÷ 1e6` step |
| 22 | 444–461 | `cycle.costPerCycle[0] === 500`, `[1] === 500` | `500 / 1e6` both |
| 36 | 695–710 | `$0.0006` **and a title + comment asserting the render-time `/1e6` compensator is correct** | **REWRITE — see below** |
| 51 | 904–917 | `delta.pricedCostDelta === 622.5 - 30` | `(622.5 - 30) / 1e6` |

**§36 is the trap and the reason this is a rewrite, not a renumber.** `622.5 → 0.0006225
→ "$0.0006"` holds **both** before the fix (divide at render) and after it (divide at
compute), so the assertion survives while its title
(*"then the cost string is in the $X.XXXX format divided by 1e6"*) and its two comments
(*"cost.priced = 622.5 → divided by 1e6 → …"*) become false — they currently document the
bug as intended behaviour. Rewrite the title and comments to state the invariant that
actually holds: **`renderMarkdown` formats `cost.priced` as dollars with no further
scaling.** Then add the regression it should always have been guarding: a group whose
`cost.priced` is already a dollar figure must NOT render `$0.0000` — i.e. assert the
rendered string is `$0.0006` for a `cost.priced` of `0.0006225`, and separately assert
that the output does **not** contain `$0.0000`. That second assertion is what catches a
surviving compensator (call-site row 9) and a double division (rows 1+2).

**The golden vector (ADR-339 / design Requirement 13).** New case in
`engine/test/usage-aggregate.test.js`, alongside the existing exact-arithmetic cases,
using the **real** `DEFAULT_PRICES` imported from
`../src/observability/adapters/claude/pricing.js` — this is the one test whose point is
that the shipped rates are right, so the file's synthetic `PRICE_TABLE` is wrong for it.

> *Given two UsageEvents carrying the measured per-model token-class totals of the
> published craft benchmark arm — `claude-opus-5` with
> `{ input: 2_800, output: 815_845, cacheRead: 226_695_412, cacheCreation: 6_078_085 }`
> and `cacheCreationTtl { creation5m: 5_092_346, creation1h: 985_739 }`, and
> `claude-sonnet-5` with
> `{ input: 11_534, output: 319_302, cacheRead: 303_340_224, cacheCreation: 7_008_625 }`
> and `cacheCreationTtl { creation5m: 7_008_625, creation1h: 0 }` — when aggregate runs
> against the shipped price table, then the summed `cost.relative` is `544_271_827` and
> the summed `cost.priced` is `297_550_926.45 / 1e6`.*

The arithmetic it pins, for the comment body:

```
claude-opus-5    in 2,800×5 + out 815,845×25 + cacheRead 226,695,412×0.5
                 + c5m 5,092,346×6.25 + c1h 985,739×10          = 175,442,383.50
claude-sonnet-5  in 11,534×3 + out 319,302×15 + cacheRead 303,340,224×0.3
                 + c5m 7,008,625×3.75 + c1h 0×6                 = 122,108,542.95
                                                          Σ     = 297,550,926.45
                                                    ÷ 1e6       = $297.550926
tokens: 233,592,142 (opus-5) + 310,679,685 (sonnet-5)           = 544,271,827
```

Three precision notes — do **not** discover these at the keyboard:

- **Build both events through the file's existing `makeEvent` helper** (line 21).
  `accumulateGroup` (line 63) adds `event.messages` and `event.durationMs` unguarded, so
  a hand-rolled literal that omits them poisons the group with `NaN` and the failure
  reads as a pricing bug.
- **Assert the expression, not a decimal literal.** `297.55092645` typed by hand is not
  necessarily the double that `297_550_926.45 / 1e6` evaluates to.
- **Sum the two groups' `cost.priced` the same way the report does** — per group, then
  add. Dividing one summed Σ and summing two divided Σs are not bit-identical in
  IEEE-754. If either bites, assert against a relative epsilon **and say so in the test
  name**; never widen it silently.

This vector fails three distinct ways on three distinct pre-fix states, which is what
makes it worth writing: `cost.priced` is `null` without the two model entries; it is
`297_550_926.45` without the divisor; and it renders `$0.0000` if the divisor lands while
`renderMarkdown` keeps its compensator.

**The `shareOfRunCost` companion (call-site rows 3 + 7).** The golden vector alone does
not distinguish a division applied at the composed site (row 2) from one applied at the
emitting site (row 3). Add:

> *Given a group whose `cacheEfficiency` clears `CACHE_HOTSPOT_THRESHOLD`, when aggregate
> runs, then `recommendations[*].evidence.pricedCreationCost` is in the same unit as
> `cost.priced` and `evidence.shareOfRunCost` lies in `[0, 1]`.*

§25 (lines 492–508) already asserts `shareOfRunCost === 1` exactly for an
all-creation-cost group and must **stay green untouched** — it is scale-invariant and is
the existing guard that row 3 was not skipped.

**`--prices` override unit contract.** There is no dedicated `pricing.test.js`;
`mergePrices` / `loadPriceTable` are exercised through `engine/test/usage-mine-main.test.js`
§7 (line 356, *"--prices override — custom model is priced"*, which writes
`{ 'claude-opus-4-8': { input: 999, output: 999, cacheRead: 99, cacheCreation5m: 1249, cacheCreation1h: 1998 } }`
and asserts total cost `> 0`). Add one case in that file asserting that a per-MTok
override entry prices in **dollars** — i.e. an exact expected value computed as
`Σ(class × overrideRate) / 1e6`. That is the assertion that breaks if the divisor is ever
pushed into `priceEntry`.

**Scale-invariance guards that must stay green untouched, asserted rather than assumed**

- `engine/test/tune-plan*.test.js` and `tune-plan.bin.test.js` build reports by hand with
  literal `cost: { priced: 100 }` and never reach `computePricedCost` — untouched.
- `engine/test/tune-smoke.test.js` goes through `aggregate` and asserts a *relative*
  outcome (the flagged phase's priced cost drops to the projected figure), so it is
  scale-invariant. **Add one explicit assertion that it is** — e.g. that the observed
  post-tune priced cost equals the rec's `evidence.projectedPricedCost` exactly — rather
  than leaving the invariance implicit.

**The stale prose in a historical plan.**
`docs/contributing/plan/usage-telemetry-miner.md` line 154 reads
*"price-per-token (or per-MTok — a fixed unit; the core only multiplies, never interprets
the magnitude)"*. That statement is now false: the core **does** interpret the injected
table's unit as per-MTok, and that is a load-bearing contract of the port rather than an
incidental convention. Correct that clause only. Every dated measurement in that file
stays untouched.

**Guardrails for this part**

- No provenance refs (no ADR/phase/backlog numbers) in any source or test file.
- No suppression directives of any flavour.
- `cost.priced` changes its **magnitude** only — never its name, type, or nullability
  contract. No new report field, no `UsageEvent` field.

### TDD steps

1. **RED — golden vector.** Add the two-event ADR-339 vector to
   `engine/test/usage-aggregate.test.js` against the real `DEFAULT_PRICES`. Expected
   failure: `cost.priced` is `null` for both groups, because `claude-opus-5` and
   `claude-sonnet-5` are absent from `DEFAULT_PRICES`.
2. **GREEN — model rates.** Add `'claude-opus-5': priceEntry(5, 25)` and
   `'claude-sonnet-5': priceEntry(3, 15)` to `DEFAULT_PRICES`. The vector now fails on the
   *dollar* assertion instead — `297_550_926.45` against the expected
   `297_550_926.45 / 1e6`. That second failure is the divisor defect, now observable.
3. **GREEN — the divisor.** Introduce `TOKENS_PER_MTOK` and the named conversion in
   `usage-aggregate.js`; apply it at call site 1 (`computePricedCost`) and call site 3
   (`buildEnrichedGroup`'s `pricedCreationCost`) only. Vector goes green.
4. **RED — the render compensator.** Extend the rewritten §36 with the "must not render
   `$0.0000`" assertion. Expected failure: `renderMarkdown` still divides by `1e6`, so a
   `cost.priced` of `0.0006225` renders `$0.0000`.
5. **GREEN — delete the compensator.** Remove `/ 1e6` and the `C2:` comment from
   `renderMarkdown`'s cost string (line 422–424).
6. **RED — `shareOfRunCost` companion.** Add the unit-consistency case. Expected failure
   if and only if call site 3 was skipped or call site 2 was divided: `shareOfRunCost`
   comes out at 10⁶ or 10⁻⁶ instead of inside `[0, 1]`.
7. **GREEN** — confirm site 3 divided and site 2 undivided; the case passes.
8. **RED → GREEN — the six rescales.** Update §1, §3, §17, §22, §51 to the `/ 1e6` forms.
   **Rewrite §36's title and comments** to state the no-further-scaling invariant.
9. **RED — `--prices` unit contract.** Add the per-MTok override case to
   `engine/test/usage-mine-main.test.js` with an exact expected dollar value. Expected
   failure only if a later edit pushes the divisor into `priceEntry`; it must pass on the
   implementation from step 3.
10. **GREEN — scale-invariance assertion** in `engine/test/tune-smoke.test.js`.
11. **REFACTOR.** Correct the `pricing.js` module header (line 9). Correct the stale
    clause in `docs/contributing/plan/usage-telemetry-miner.md` line 154. Re-read the
    nine-row call-site table and confirm each row's post-state by inspection; confirm no
    magic `1e6` literal survives outside the named constant and the test expectations.

### Gate

```
npm --prefix engine test
```

### Commit

```
fix(telemetry): denominate priced cost in dollars and add the current model rates
```

---

## Part 2 — One event per usage-bearing line: the claude parser inverts

### Context

Discharges **ADR-328** (rollups are never read, for tokens or labels), **ADR-329**
(main-loop turns are events), **ADR-334** (the sidecar context is an opaque third
argument), **ADR-337** (sub-agent `messages`/`durationMs` derive from the transcript) and
**ADR-340** (main-loop `durationMs = 0`). Satisfies design Requirements 1, 2, 4, 9, 10.

**Files to change**

- `engine/src/observability/adapters/claude/telemetry.js` (216 lines)
- `engine/test/telemetry-claude.test.js` (628 lines, 32 cases)
- `engine/test/fixtures/telemetry/` (fixture set)
- `engine/test/usage-mine-main.test.js` — **fixture-constant repair only** (the emission
  flip breaks this file's default fixture; see below)

**Current `telemetry.js` — what stays, what goes**

Stays, unchanged in signature and semantics:

- `tokensFromClaudeUsage(usage)` (line 92, **exported**) — `metrics-split.js`
  (`engine/src/observability/adapters/claude/metrics-split.js`) imports it together with
  `CACHE_READ_FIELD` and `CACHE_CREATION_FIELD`. `engine/test/metrics-split.test.js` must
  stay green **untouched** — treat that as a hard constraint on this part.
- `CACHE_READ_FIELD` / `CACHE_CREATION_FIELD` (lines 19–20, exported).
- `numOrZero` (line 23), `ROLE_TO_PHASE` (line 29), `normalizeModel` (line 48),
  `roleFromAgentType` (line 62), `phaseFromAgentType` (line 76), `assistantTextOf`
  (line 161), the `autoSkipPhasesInText` import (line 13).

**Deleted — they become dead code the moment rollups stop being read:**

- `eventFromRollup` (lines 120–138, exported). Grep confirms **zero non-test callers**;
  it is imported only by `engine/test/telemetry-claude.test.js`.
- `isRollupLine` (lines 146–153, private).
- `SYNTHETIC_MODEL` (line 15) and the `<synthetic>` filter. Synthetic models rode on
  *rollup* `resolvedModel`; the pinned assistant-line shape carries full priceable ids in
  `message.model`. A hypothetical `<synthetic>` assistant line would now produce a group
  priced `null`, which is advisory-safe.
- Fixture `engine/test/fixtures/telemetry/with-synthetic.jsonl` and its §10 case.

**The new emission rule — one sentence, and it is why no-double-count is structural**

> **Emit exactly one `UsageEvent` per line carrying `message.usage`.**

Measured over the whole 273-file corpus: lines matching the old `isRollupLine` are
**240**, all `type: 'user'`; lines carrying `message.usage` are **23,540**, all
`type: 'assistant'`; lines carrying **both: 0**. The two sets are disjoint by
construction — a rollup rides on a `user` line's `toolUseResult`, usage rides on an
`assistant` line's `message`. **Do not reintroduce a filter step, a de-duplication pass,
or a `type` check.** The disjointness must remain a property of the rule, not of a guard.
It is also what disposes of the depth-2 nested-spawn vector for free: the rollups for
depth-2 sub-agents live *inside* sibling depth-1 transcripts, where they are `user` lines
that contribute nothing.

**New signature**

```js
export async function parseLines(lines, since = null, context = null)
  → { events, skipped, markers, unlabelled }
```

The third parameter is **optional**; the other five adapters' `parseLines(lines, since)`
are untouched and the front door's existing two-argument call sites keep working.

**The one boolean that drives three behaviours**

```js
const isSubagent = context?.sourceKind === 'subagent';
```

`sourceKind` is authored by the claude adapter's `discover` (Part 3). Anything that is
not the literal `'subagent'` — including a `null` context — is treated as a main-loop
stream. That default is deliberate and fail-safe: a bare line stream with no discovery
context *is* a main-loop transcript, cost is still counted, and no existing caller breaks.

| Behaviour | main-loop (`!isSubagent`) | sub-agent (`isSubagent`) |
|---|---|---|
| `role` | the literal `'main-loop'` | `roleFromAgentType(context.agentType)` |
| `phase` | `null` | `phaseFromAgentType(context.agentType)` |
| `auto-skip:` marker scan | **yes** | **no** |
| event emission | only when `context?.includeInline !== false` | always |
| `durationMs` | **0 on every event** | `0`, with the transcript span folded onto the **last** emitted event |

**Field resolution for every emitted event** (design's Event field resolution table):

| Field | Source |
|---|---|
| `run` | `parsed.sessionId ?? null` — for a sub-agent line this is the **parent** session id (pinned 20/20), so run identity survives and sub-agent groups land in the same run as the main loop |
| `slug` | `parsed.slug ?? null` — one rule, no branch. Sub-agent lines have no `slug`, so they yield `null`; `groupByRun` inherits the run's slug from the main-loop events, which is exactly why main-loop inclusion restores slugs |
| `phase` / `role` | per the table above |
| `model` | `normalizeModel(parsed.message?.model ?? null)` — per turn, not per file, so a mid-run model switch attributes correctly. The `[1m]` strip is reused unchanged |
| `tokens` / `cacheCreationTtl` | `tokensFromClaudeUsage(parsed.message.usage)` — unchanged function |
| `messages` | `1` per emitted event, so a group's `messages` becomes the count of billed turns |
| `durationMs` | per the table above |

**`--since` and the duration span.** The cutoff (line 199–202) drops lines whose top-level
`timestamp` predates it, **before** anything else. The span is therefore computed over the
*surviving* lines only — a transcript straddling the cutoff reports its post-cutoff span,
not its full lifetime. That is the consistent reading (tokens are likewise counted only
over surviving lines). Compute the span from the first and last surviving *emitted* line's
`timestamp` via `Date.parse`; a non-finite result contributes `0`. `Date.parse` over event
data is not a clock read — **no `Date.now()`, no `new Date()` without an argument**.

**ADR-340's asymmetry with ADR-337 is deliberate and MUST be commented at the emission
site**, in prose, with no ADR number. A future maintainer will otherwise "fix" it and
silently falsify a published README sentence. The reason to state: the report's duration
sum feeds a published claim scoped to *role-agent activity*; the orchestrator's own
wallclock span overlaps every sub-agent span in the same run, so attributing it would
roughly double a figure whose prose says it excludes exactly that. Main-loop `messages`
is **not** zeroed — a billed-turn count is real and nothing else reconstructs it.

**The `auto-skip:` gate is new behaviour and needs its own test.** `autoSkipPhasesInText`
(`engine/src/observability/skip-signals.js`, regex `/auto-skip:\s*([a-z][a-z-]*)/g`)
currently scans **every** parsed line (lines 206–208), before the rollup gate. Those tokens
ride in *orchestrator* assistant text. Opening sub-agent transcripts for the first time
creates a new vector: a docs-writer sub-agent that writes `auto-skip:` in its own output
would inject a false run-record marker into `phaseSkipRecs`. Gate the scan on
`!isSubagent`. It cannot inherit the existing marker tests — it needs one that feeds the
**identical text** through both a `sourceKind: 'main'` and a `sourceKind: 'subagent'`
context and asserts markers only from the former.

**`unlabelled` counting rule — one site, one sentence:**

> `unlabelled` is `1` when this stream emitted at least one event whose `role` is `null`;
> otherwise `0`.

That single rule covers a sub-agent transcript whose sidecar was missing, unreadable,
malformed, or carried no `agentType` — all of which reach `parseLines` as
`context.agentType == null`. It never fires for a main-loop stream (`role` is the literal
`'main-loop'`). No silent `null` role can escape uncounted.

**Fixtures.** `engine/test/fixtures/telemetry/` currently holds `single-rollup.jsonl`,
`with-synthetic.jsonl`, `malformed.jsonl`, read via the file's `fixtureLines(name)` helper
(line 16). After the flip, `single-rollup.jsonl` produces **zero** events by design —
keep it under a name that says so (it is now the *proof* that a rollup line yields
nothing) and delete `with-synthetic.jsonl`. Add a small main-loop assistant fixture and a
small sub-agent assistant fixture with real field names and hand-chosen numbers.

**The blast radius in `engine/test/usage-mine-main.test.js` — repair it in this part.**
That file's `ROLLUP_LINE` constant (line 40) is the default of `makeFixture()` (line 90),
used by **35** call sites. After the flip it emits **zero** events, so every one of those
tests would fall onto the no-op path and fail on unrelated assertions. Repair:

- Add a `MAIN_USAGE_LINE` constant: `type: 'assistant'`, `sessionId: 'sess-aaa'`,
  `slug: 'feature-x'`, `timestamp: '2026-01-01T00:00:00.000Z'`,
  `message: { role: 'assistant', model: 'claude-opus-4-8', usage: { input_tokens: 2, cache_read_input_tokens: 196062, cache_creation_input_tokens: 255, output_tokens: 900, cache_creation: { ephemeral_5m_input_tokens: 255, ephemeral_1h_input_tokens: 0 } } }`
  — the same token numbers `ROLLUP_LINE` carries, so the drift-fixture arithmetic below
  still lines up (group total `2 + 196062 + 255 + 900 = 197219`).
- Make it `makeFixture`'s default. Keep `ROLLUP_LINE` only where a test's point is that a
  rollup contributes nothing.
- Repair the assertions that name the old labels:
  - line 284 `makeDriftedBaselineReport` — `phase: 'design', role: 'designer'` becomes
    `phase: null, role: 'main-loop'`, and line 312's
    `d.phase === 'design'` becomes `d.phase === null`. The token arithmetic in the
    comment (197219 mined vs 150000 baseline, relDelta ≈ 0.31 > 0.25) is unchanged.
  - line 548 (`--since` case) — its two hand-built rollup lines become assistant usage
    lines carrying `message.model: 'claude-sonnet-4-6'` and the same timestamps.
  - line 879 — `groups[0].model === 'claude-opus-4-8'` still holds with `MAIN_USAGE_LINE`.
  - lines 381–396 (§8, *"--include-inline OFF default → noted gap"*) and 442–453
    (*"--include-inline ON path"*) both encode the retired inline gap. **Leave them
    failing is not an option and rewriting them fully belongs to Part 4** (which owns the
    flag). In this part, restate them minimally against the new default: an
    `INLINE_LINE`-only dir now yields a `role: 'main-loop'` group and a non-empty
    `runs` array. Part 4 then adds the `--no-inline` cases.
  - line 863 (`phase-skip` markers through the front door) — `makeFixture({ lines: [ROLLUP_LINE, autoSkipLine] })`
    keeps working because the front door still passes no context, so the stream is treated
    as main-loop and markers are still harvested. Confirm rather than assume.
- `engine/test/usage-mine.bin.test.js` passes `fixtures/telemetry` as `--dir`; containment
  rejects it (not under `~/.claude/projects`) and it writes a no-op report, so its
  assertions are indifferent to the fixture contents. Confirm it stays green.

**Test cases this part must land in `engine/test/telemetry-claude.test.js`** (extend; the
file uses `asyncLines(lines)` at line 20 to feed `parseLines`):

- an `assistant` line with `message.usage` yields exactly **one** event;
- a `user` line carrying a rollup yields **zero** events (the structural disjointness);
- an injected `{ sourceKind: 'subagent', agentType: 'craft:designer' }` context supplies
  `role: 'designer'` / `phase: 'design'`;
- a `{ sourceKind: 'subagent', agentType: null }` context yields `role: null`, `phase: null`
  **and `unlabelled === 1`** — never a silent null;
- a `null` context yields `role: 'main-loop'`, `phase: null`;
- `model` comes from `message.model` per turn with `[1m]` stripped;
- `run` is the line's `sessionId`; a sub-agent line's `slug` is `null`;
- `--since` still filters on the top-level `timestamp`, and the derived span covers only
  surviving lines;
- sub-agent `durationMs` is `0` on every event but the last, which carries the whole span;
  main-loop `durationMs` is `0` on **every** event including the last;
- `messages` is `1` per event on both stream kinds;
- `context.includeInline === false` on a main-loop stream emits **zero** events **but
  still returns its markers**;
- the `auto-skip:` false-marker guard described above.

The twelve existing `eventFromRollup` cases (§4–§8 lines 72–189, §15 line 306, §16 line
338, §19–§20, §25–§27) are deleted or **re-anchored on `parseLines`** where the case's real
subject survives — §15 (`ROLE_TO_PHASE` coverage for all recognized craft agent types) and
§16 (`normalizeModel` passthrough for a non-string model) are about live functions and must
be re-expressed through `parseLines` with an injected sub-agent context rather than
dropped.

**Property lens** (the design's parser/matcher pair): over generated line streams mixing
`user`-rollup lines, `assistant`-usage lines, blank lines and malformed JSON in arbitrary
order — total emitted tokens equal the sum over `assistant` lines alone, invariant under
permutation and under interleaving, and `skipped` equals the malformed count exactly.

### TDD steps

1. **RED — the emission rule.** Add the two anchor cases: an `assistant` line carrying
   `message.usage` yields one event; a `user` rollup line yields zero. Expected failure:
   today's parser does the exact opposite on both.
2. **GREEN — invert.** Rewrite `parseLines`' body to emit one event per line carrying
   `message.usage`, mapping every field per the resolution table. Delete
   `eventFromRollup`, `isRollupLine`, `SYNTHETIC_MODEL` and the `<synthetic>` filter.
   Delete their tests and `with-synthetic.jsonl`; re-anchor §15 and §16 on `parseLines`.
3. **RED — the sidecar context.** Add the `{ sourceKind: 'subagent', agentType }` cases,
   including the `agentType: null` → `role: null` + `unlabelled === 1` case. Expected
   failure: `parseLines` takes no third argument and returns no `unlabelled`.
4. **GREEN — the third argument.** Add the optional `context` parameter, the `isSubagent`
   boolean, the role/phase branch, and the `unlabelled` counter.
5. **RED — main-loop labelling.** Assert a `null`-context stream yields
   `role: 'main-loop'`, `phase: null`, `messages: 1` per event. Expected failure: role is
   currently derived only from an `agentType`.
6. **GREEN** — the main-loop branch.
7. **RED — duration asymmetry.** Two cases: a sub-agent stream's span lands on the last
   event only; a main-loop stream carries `durationMs: 0` on every event. Expected
   failure: no span is computed at all today, and the old events copied
   `rollup.totalDurationMs`.
8. **GREEN — the span**, plus the prose comment at the emission site explaining why
   main-loop duration is deliberately zero. **No ADR number in the comment.**
9. **RED — the false-marker guard.** Feed identical `auto-skip: review` text through a
   `sourceKind: 'main'` context and a `sourceKind: 'subagent'` context; assert one marker
   and zero markers respectively. Expected failure: the scan is currently unconditional.
10. **GREEN — gate the scan** on `!isSubagent`, keeping it **before** any emission
    decision so it survives the `includeInline === false` path.
11. **RED — the inline suppression path.** Assert `context.includeInline === false` on a
    main-loop stream emits zero events but still returns its markers. Expected failure:
    no such branch exists.
12. **GREEN** — the emission gate.
13. **RED → GREEN — the property lens** over permuted mixed streams.
14. **GREEN — front-door fixture repair.** Apply the `engine/test/usage-mine-main.test.js`
    repairs listed above until that file is green.
15. **REFACTOR.** Update the `telemetry.js` module header (lines 1–11) — its
    *"Handles both Agent and Task spawn shapes"* and *"Inline per-turn usage is a noted
    gap — not emitted by default; opt-in belongs at the CLI layer via --include-inline"*
    are both false now. Confirm `engine/test/metrics-split.test.js` is green **untouched**.
    Confirm no `type` check, no de-duplication pass, and no rollup reference survives.

### Gate

```
npm --prefix engine test
```

### Commit

```
fix(telemetry): emit one usage event per usage-bearing transcript line
```

---

## Part 3 — Two-level transcript discovery inside the claude adapter

### Context

Discharges **ADR-333** (discovery lives in the claude adapter behind injected ports),
**ADR-334** (the adapter authors the opaque context) and **ADR-335** (a pinned two-level
shape, not a generic recursion). Satisfies design Requirements 3, 6 and 7.

**Files**

- **NEW** `engine/src/observability/adapters/claude/discovery.js`
- **NEW** `engine/test/telemetry-claude-discovery.test.js`

No other file changes in this part. The front door does not import `discover` until
Part 4, so this part is a pure module with its own unit suite and no wiring risk.

**Why it lives here.** `docs/contributing/specs/telemetry.md` states plainly that *"the
adapter never receives an absolute path; the `readTranscripts` provider owns the runtime
path."* The `<sessionId>/subagents/agent-*.jsonl` layout is pure claude knowledge; paths,
containment and I/O are front-door responsibilities. Injected ports satisfy both: the
adapter names **relative** paths and reads what the ports return; the front door joins,
realpath-contains, opens and reads. `discover` performs **no I/O of its own** — that is
the property that makes containment un-bypassable by the adapter even in principle, and
makes this module unit-testable against fakes with zero filesystem.

**Exact signature**

```js
/**
 * @param {{ listDir: (relPath: string) => string[] | null,
 *           readText: (relPath: string) => string | null }} ports
 * @returns {{ entries: { relPath: string, context: object }[], unreadable: number }}
 */
export function discover(ports)
```

Both ports are front-door-implemented over already-contained paths and **never throw**.
`listDir` returns `null` when it could not list (containment refusal, ENOENT, EACCES,
ENOTDIR) and `[]` when it listed an empty directory — the two must stay distinguishable,
because an empty `subagents/` is a normal no-op while an unlistable one is a counted skip.

**The walk — pinned, exactly two levels, nothing else**

```
<root>/*.jsonl                        → { relPath, context: { sourceKind: 'main' } }
<root>/<dir>/subagents/agent-*.jsonl  → { relPath, context: { sourceKind: 'subagent', agentType } }
```

Algorithm, and it must not become a generic recursion:

1. `listDir('')` → `null` ⇒ return `{ entries: [], unreadable: 0 }`.
2. For each name, sorted: a name ending `.jsonl` is a **main-loop entry**. Every other
   name is probed as a candidate session directory.
3. `listDir(name)` → `null` ⇒ **skip silently, uncounted**. This is the normal negative
   answer of a probe (a stray file, a directory the walk has no business in). It is not
   an anomaly and must not inflate a tally.
4. If the returned listing does **not** contain `subagents` ⇒ skip. This is how `memory/`
   and every other non-session directory in the projects root is refused **by shape**.
   A generic recursive walk would descend it, and would also follow whatever a future
   upstream release drops there.
5. `listDir(`${name}/subagents`)` → `null` ⇒ **`unreadable++`**, skip that session's
   sub-agents. This is the one surprising failure: the child was named in its parent's
   listing and still could not be listed — an unreadable directory, or a symlink whose
   realpath escaped the read root and was refused by containment. Refused and counted,
   never followed, and never partially trusted.
6. For each name in the `subagents` listing, sorted: accept only `agent-*.jsonl`.
   **`agent-*.meta.json` must never be returned as a transcript entry.**
7. For each accepted transcript `agent-<id>.jsonl`, read its sibling sidecar via
   `readText(`${name}/subagents/agent-<id>.meta.json`)`. Parse it as JSON in a `try`.
   Take **`agentType` and nothing else**; `null` when the read returned `null`, the JSON
   is malformed, or `agentType` is absent or not a string. Never throw.

Depth is bounded at exactly these two levels. An entry is accepted only if it matches
`agent-*.jsonl` **and** sits directly under a `subagents/` child of a root-level
directory. Fail-closed by shape: an upstream layout change breaks discovery loudly rather
than degrading silently, which is the preferred direction for an advisory signal that
must never quietly under-report again.

**Redaction (design Requirement 7) is trivially true here, by discarding at this
boundary.** The sidecar's real shape is one line:

```json
{"agentType":"craft:reviewer","description":"Review: tests dimension",
 "toolUseId":"toolu_01WN6xT7zHD21vTju7KnpJ6L","spawnDepth":1}
```

`description`, `toolUseId` and `spawnDepth` are **read and discarded here**; they never
enter a `context` and therefore can never reach `report.json`. `model` is likewise
discarded and must not be used: it is present on only **64/243** sidecars and is a short
alias (`sonnet`/`opus`), not a priceable id. Model comes from `message.model` per turn.
The filename's `<id>` never leaves this module either.

**Determinism (design Requirement 9).** Sort every listing before iterating so the entry
order is a function of the input tree alone. No clock, no random, no network.

**Nested spawns need no special case.** Depth-2 sub-agents are **flat siblings in the same
`subagents/` directory** — verified across all 19 `subagents/` dirs, no nested directories
anywhere. Their rollups live inside a sibling depth-1 transcript, where Part 2's emission
rule makes them `user` lines that contribute nothing.

**Test cases for `engine/test/telemetry-claude-discovery.test.js`** — fake `listDir` /
`readText` ports built from a plain object map, **zero filesystem**:

- the two-level shape is found: one main entry and one sub-agent entry, with the right
  `relPath` and `context`;
- a non-session directory (`memory/`-style, listing contains no `subagents`) yields
  nothing and is **not** counted as unreadable;
- a session dir with no `subagents/` child yields its main-loop entries only;
- an **empty** `subagents/` (`listDir` returns `[]`) yields nothing and is **not** counted;
- an **unlistable** `subagents/` (`listDir` returns `null` for the child but the parent
  listing named it) yields nothing and **is** counted in `unreadable`;
- `agent-<id>.meta.json` is never returned as a transcript entry;
- a `.jsonl` sitting directly under a session dir (not under `subagents/`) is **not**
  accepted;
- depth-2 flat siblings are returned like any other sub-agent entry;
- a transcript with **no** sidecar (`readText` → `null`) still yields an entry, with
  `context.agentType === null`;
- a malformed sidecar (`readText` → `'not json'`) and a sidecar with no `agentType` both
  yield `context.agentType === null` and **do not throw**;
- a root-level `listDir('')` returning `null` yields zero entries and does not throw;
- output ordering is deterministic: the same fake tree fed in a shuffled listing order
  produces byte-identical entry arrays.

**Guardrails:** no absolute path anywhere in this module; no `node:fs` import; no
provenance refs; no suppression directives; no swallowed error that loses information —
every `catch` here converts a known-shaped failure into the documented `null`/counted
outcome, and that intent must be stated in a comment.

### TDD steps

1. **RED — the pinned two-level shape.** Write the first case: a fake tree with
   `sess-a.jsonl` at the root and `sess-a/subagents/agent-1.jsonl` + `agent-1.meta.json`
   yields two entries with the right `relPath`s and contexts. Expected failure: the module
   does not exist.
2. **GREEN — minimal walk.** Create `discovery.js` with `discover(ports)`, the root
   listing, the `.jsonl` main-entry rule, and the session-dir probe.
3. **RED — the `subagents` gate.** Add the `memory/`-style case (parent listing has no
   `subagents`) and the "`.jsonl` directly under a session dir is not accepted" case.
   Expected failure: a naive walk returns them.
4. **GREEN — gate on the literal `subagents` child** and on the `agent-*.jsonl` prefix.
5. **RED — sidecar labelling.** Add the happy sidecar case, the missing sidecar, the
   malformed sidecar, and the sidecar with no `agentType`. Expected failure: no sidecar is
   read at all; the malformed one throws once reading starts.
6. **GREEN — `readText` + guarded JSON parse**, taking `agentType` and discarding every
   other field.
7. **RED — the counted skip.** Add the unlistable-`subagents` case asserting
   `unreadable === 1`, and the empty-`subagents` case asserting `unreadable === 0`.
   Expected failure: the two are indistinguishable until `null` and `[]` are treated
   differently.
8. **GREEN** — the `null` vs `[]` distinction and the `unreadable` counter.
9. **RED → GREEN — determinism.** Shuffled fake listings must produce byte-identical
   output; add the sort.
10. **REFACTOR.** Module header stating the port contract, the two-level shape, the
    discard-at-boundary redaction rule, and why the walk is pinned rather than recursive.
    Confirm zero `node:fs` imports and zero absolute paths.

### Gate

```
npm --prefix engine test
```

### Commit

```
feat(telemetry): discover sub-agent transcripts in the claude binding
```

---

## Part 4 — Front-door wiring: discovery ports, `--no-inline`, zero-arg read root

### Context

Discharges **ADR-329** (the flag path that does not exist yet), **ADR-333** (the front
door keeps every path, containment check and byte of I/O) and **ADR-336** (the zero-arg
read root resolves the dashed cwd). Satisfies design Requirements 1, 3, 5, 6, 8, 10 and
the second clause of 14.

**Files to change**

- `engine/src/observability/usage-mine-main.js` (355 lines)
- `engine/test/usage-mine-main.test.js`
- `engine/test/usage-mine.bin.test.js` (96 lines)
- `engine/test/fixtures/telemetry/projects/` (**new** fixture tree)
- `skills/metrics/SKILL.md` (two lines — see below)

**Current front-door anatomy, by line**

| Symbol | line | Role |
|---|---|---|
| `EXIT_OK` / `EXIT_CONFIG_ERROR` | 38, 41 | `0` everywhere; `1` only for an unknown `--source` |
| `SOURCES` | 44 | frozen source→`parseLines` lookup, six entries |
| `DEFAULT_PROJECTS_DIR` | 52 | `join(homedir(), '.claude', 'projects')` |
| `DEFAULT_READ_ROOTS` | 57 | frozen source→thunk lookup; **this is the containment root**, not the transcript dir |
| `SOURCE_FILE_MATCHERS` | 87 | frozen source→`{ match, label }`; only `aider` has an entry |
| `resolveSourceFilter` / `resolveFileMatcher` / `resolveFileLabel` | 99–113 | exported unit-test seams over that lookup |
| `resolveDefaultReadRoot` | 120 | exported unit-test seam over `DEFAULT_READ_ROOTS` |
| `INLINE_GAP_NOTE` | 128 | one of four notes the port can emit |
| `UNCONTAINED_NOTE` / `ABSENT_NOTE` / `NO_EVENTS_NOTE` | 131–133 | the other three |
| `noOpReport` / `noFilesNote` | 137, 144 | note plumbing |
| `parseArgs` | 148 | flags, including the inert `--include-inline` at line 175 |
| `resolveTranscriptDir` | 192 | `parsedDir ? resolve(parsedDir) : projectsRoot` |
| `streamTranscriptFiles` | 212 | per-file containment (line 218), `createReadStream` + `readline`, calls `parseTranscriptLines(lines, since)` at line 224 |
| `attemptWriteReports` | 237 | write containment + `serializeReport` + `renderMarkdown` |
| `main` | 281 | the whole flow; io destructure at 282–292 |

**Trap 1 — `--include-inline` is inert today, so ADR-329 requires BUILDING a flag path.**
`parsed.includeInline` is read in exactly **one** place, line 345:

```js
if (!events.length) { writeNoOp(parsed.includeInline ? NO_EVENTS_NOTE : INLINE_GAP_NOTE); return EXIT_OK; }
```

It selects between two **note strings** on the zero-event path. It is never passed to
`parseLines`. `--no-inline` cannot be implemented by inverting it, because there is
nothing to invert.

Changes:

- `parseArgs` (line 148): the parsed field's default **inverts** — `includeInline: true`.
  Delete `case '--include-inline'` (line 175). Add `case '--no-inline': parsed.includeInline = false; break;`.
- **Delete `INLINE_GAP_NOTE`** (line 128). Every clause of
  *"no rollup events found; inline phases excluded by default (pass --include-inline to include)"*
  is false now: rollups are not events, inline is not excluded, and the flag it names no
  longer exists. Line 345 becomes the unconditional
  `if (!events.length) { writeNoOp(NO_EVENTS_NOTE); return EXIT_OK; }`. **The port emits
  three notes plus `noFilesNote(source)`, not five — do not invent a replacement note.**

**Trap 2 — `--no-inline` must drop main-loop *events*, never main-loop *markers*.**
`auto-skip:` phase tokens are harvested from main-loop assistant text and feed
`phaseSkipRecs`; that is a behavioural signal with no cost dimension. Implemented as "skip
main-loop lines", `--no-inline` would silently disable phase-skip recommendations as a
side effect. The drop applies to the emitted `UsageEvent[]` only, and Part 2 already put
the marker scan **before** the emission gate inside the adapter. The front door's job is
only to carry the flag.

**How the flag reaches the adapter without the front door reading the opaque context.**
ADR-334 pins `parseLines(lines, since, context)` — three arguments. The front door spreads
its own key alongside the adapter's:

```js
const parseContext = { ...(entry.context ?? {}), includeInline };
```

The front door **authors** `includeInline` and **reads nothing** of `entry.context`. Any
adapter that ignores the third argument (all five others) is unaffected. Do not add a
fourth `parseLines` parameter; do not teach the front door what `sourceKind` means.

**Trap 3 — ADR-336 must not tighten the containment root.** `main` currently uses one
value for both roles (line 307: `projectsRoot = projectsRootOverride ?? resolveDefaultReadRoot(source)`,
then line 315 `containByRealpath(projectsRoot, transcriptDir)`). If
`resolveDefaultReadRoot` were changed to return the dashed cwd directory, the **containment
root** would shrink to that one project and every explicit `--dir <another project>` would
start being refused. ADR-336 says the containment root is unchanged.

Split the two roles instead. `DEFAULT_READ_ROOTS` and `resolveDefaultReadRoot` stay
exactly as they are (containment root). Add a second, one-entry frozen lookup mirroring
the `SOURCE_FILE_MATCHERS` precedent (which likewise carries a single `aider` entry plus a
default):

```js
// Only the claude layout nests a per-project directory under its projects root.
const DEFAULT_TRANSCRIPT_DIRS = Object.freeze({
  claude: (root, cwd) => join(root, dashedCwd(cwd)),
});
const DEFAULT_TRANSCRIPT_DIR = (root) => root;   // today's behaviour, every other source

export function dashedCwd(cwd) { … }
export function resolveDefaultTranscriptDir(source, projectsRoot, cwd) { … }
```

Use `Object.hasOwn` for the lookup, exactly as `resolveDefaultReadRoot` (line 121) and
`resolveSourceFilter` (line 100) already do — a bare index would resolve inherited members
(`__proto__`, `constructor`, …) to a truthy entry and slip past the fallback.

`resolveTranscriptDir` (line 192) takes the resolved default instead of the containment
root: `parsedDir ? resolve(parsedDir) : defaultTranscriptDir`. An explicit `--dir` is
untouched in every respect.

**`dashedCwd` — the mapping, and what is and is not verified.** Every path separator and
every `.` becomes `-`. Verified against the live projects root:
`/Users/scolladon/workspace/perso/craft` → `-Users-scolladon-workspace-perso-craft`, and a
nested case producing a doubled dash
(`/private/tmp/claude-501/-Users-…-craft/…/scratchpad/sp9` →
`-private-tmp-claude-501--Users-…-craft-…-scratchpad-sp9`). **No path on this box contains
a `.`, so the dot rule is unverified locally** — record that in a comment, and record
ADR-336's own consequence: a repo whose transcripts live under a differently-derived slug
still needs an explicit `--dir`. `main` gains `cwd = process.cwd()` in its `io` destructure
(line 282) so this is injectable, and `dashedCwd` is exported as a direct unit-test seam.

Why this matters at all: today `resolveTranscriptDir(null, projectsRoot)` returns
`~/.claude/projects` itself, whose non-recursive listing contains **directories only** —
zero `.jsonl`. Verified live: `node engine/bin/usage-mine.js` with zero args prints
`{"note":"no .jsonl transcript files found","runs":[],"schemaVersion":1}` and exits 0. So
the advertised zero-argument `/craft:metrics` path has **always** produced an empty report;
every non-empty report ever produced came from an explicit `--dir`.

**The discovery seam — the fourth per-source frozen lookup**

```js
import { discover as claudeDiscover } from './adapters/claude/discovery.js';

const SOURCE_DISCOVERY = Object.freeze({ claude: claudeDiscover });
```

Sources with **no** entry keep today's flat `readdirSync` + `resolveFileMatcher` path and
today's `parseLines(lines, since)` call verbatim — opencode, pi, copilot, codex, aider and
the unwired cursor binding are all untouched. That no-regression property needs its own
test (the existing opencode / pi / codex / aider fixture cases at lines ~880–1160 already
cover the shape; assert one of them explicitly as the guard).

**The ports the front door implements — it never lets the adapter hold path power**

```js
function makeDiscoveryPorts(readRoot, { readdirSync, readFileSync, containByRealpath }) {
  const safe = (relPath) => containByRealpath(readRoot, join(readRoot, relPath));
  return {
    listDir(relPath) { const p = safe(relPath); if (!p) return null;
                       try { return readdirSync(p); } catch { return null; } },
    readText(relPath) { const p = safe(relPath); if (!p) return null;
                        try { return readFileSync(p, 'utf8'); } catch { return null; } },
  };
}
```

Both absorb their own failures into the documented `null` and **never throw** — that is
what lets `discover` be a pure walk. Containment is applied **before** every listing and
every read, so the adapter cannot bypass it even in principle.

**Preserving the existing advisory notes.** The current `readdirSync` in `main` (line 321)
is what produces `ABSENT_NOTE` on ENOENT and `cannot read transcript dir (<code>)`
otherwise. Keep that probe exactly where it is, unfiltered, as the note-producing read:

```js
let rootListing;
try { rootListing = readdirSync(safeTranscriptDir); }
catch (e) { writeNoOp(e.code === 'ENOENT' ? ABSENT_NOTE : `cannot read transcript dir (${e.code ?? 'unknown'})`); return EXIT_OK; }
```

Then branch: with a `SOURCE_DISCOVERY` entry, call `discover(makeDiscoveryPorts(...))`;
without one, `entries = rootListing.filter(resolveFileMatcher(source)).map(relPath => ({ relPath, context: null }))`.
`if (!entries.length) { writeNoOp(noFilesNote(source)); return EXIT_OK; }` is unchanged in
meaning — and `noFilesNote` still resolves its label through `resolveFileLabel`, so the
claude zero-file note stays `no .jsonl transcript files found` and stays **accurate**:
`.jsonl` is exactly what the descriptor looks for at both levels.

**Containment across the recursion — extended in reach, unchanged in kind.**
`streamTranscriptFiles` (line 212) takes `entries` instead of filenames and calls
`containByRealpath(transcriptDir, join(transcriptDir, entry.relPath))` per entry, exactly
as line 218 does today — the entry is a three-segment relative path instead of a filename,
and **nothing else differs**. Verified live against the real root: a three-level-deep
`<root>/<proj>/<sid>/subagents/agent-<id>.jsonl` is ALLOWED, `<root>` itself is ALLOWED,
`<root>/../../etc/passwd` is REJECTED. A refusal now increments `refused` instead of
silently `continue`-ing.

**No silent zeros — the four stderr lines.** A run that silently counts nothing is
indistinguishable from a cost-free run, which is the failure this whole change exists to
end. Emit each only when its count is `> 0`, alongside the existing line at 343:

```
usage-mine: skipped ${skipped} malformed line(s)
usage-mine: ${unlabelled} transcript(s) with no resolvable agent label
usage-mine: ${unreadable} unreadable sub-agent directory(ies)
usage-mine: ${refused} path(s) refused by read containment
```

These strings are the observable contract of the counted-fallback discipline the codex and
aider bindings already carry — pin them, do not paraphrase them.

**The advisory contract must hold across every new surface. Nothing new exits non-zero.**

| Condition | Behaviour | Exit |
|---|---|---|
| session dir has no `subagents/` child | that session contributes main-loop entries only | 0 |
| `subagents/` exists but is empty | contributes nothing; no note of its own | 0 |
| listing `subagents/` fails | caught, `unreadable++`, that session's sub-agents skipped | 0 |
| transcript has no sidecar | entry still emitted; `agentType` unresolved → `unlabelled++` | 0 |
| sidecar malformed / missing `agentType` | same counted fallback; never throws | 0 |
| transcript line malformed | existing `skipped++` path, unchanged | 0 |
| every discovery path yields nothing | existing `noFilesNote(source)` no-op report | 0 |
| entry fails containment | existing per-entry `continue`, now `refused++` | 0 |
| unknown `--source` | existing config-error gate, **before any I/O** | **1** |

**The 100x regression test — the single most important case in this plan.** Place it in
`engine/test/usage-mine-main.test.js` (front door, injected `io`, existing `makeIo` /
`makeCaptureIo` helpers at lines 100 and `engine/test-helpers/capture-io.js`), so it
exercises discovery, containment, streaming, parsing and aggregation together — the seam
where the defect actually lives:

> *Given a session fixture whose main-loop file carries a spawn rollup with `usage`
> summing to 1,000 tokens, and whose `<sid>/subagents/agent-<id>.jsonl` carries assistant
> turns summing to 100,000 tokens, when the miner runs, then the report's total relative
> cost for that run is 100,000 — not 1,000, and not 101,000.*

The three-way assertion is the whole point: **1,000** is today's under-report, **101,000**
is the double-count, **100,000** is truth. Assert all three explicitly.

**The committed fixture tree** — `engine/test/fixtures/telemetry/projects/`, mirroring the
pinned layout, real field names, hand-chosen small numbers, **total well under 20KB**:

```
projects/
  <proj>/
    <sid>.jsonl                                  main loop: assistant usage lines + one rollup line + one auto-skip line
    <sid>/subagents/agent-<id>.jsonl             assistant usage lines
    <sid>/subagents/agent-<id>.meta.json         {"agentType":"craft:designer","description":"…","toolUseId":"…","spawnDepth":1}
    <sid>/subagents/agent-<nosidecar>.jsonl      transcript with NO sidecar
    <sid>/subagents/agent-<bad>.jsonl            + agent-<bad>.meta.json holding malformed JSON
    <sid>/subagents/agent-<notype>.meta.json     sidecar with no agentType
    <sid2>/                                      session dir with NO subagents/ child
    <sid3>/subagents/                            empty subagents/
    memory/                                      non-session directory — must be skipped by shape
```

Structurally identical to the pinned shapes in the design's *Empirically pinned corpus
matrix*. This is the same discipline `engine/test/fixtures/{codex,pi,opencode,copilot}/`
already use.

**Front-door cases to add** (extend `engine/test/usage-mine-main.test.js`):

- the 100x regression test above;
- **`--no-inline` drops the `role: 'main-loop'` group and nothing else** — the same fixture
  still yields its `auto-skip:` phase-skip recommendations. This is Trap 2's guard;
- the default run **includes** a `role: 'main-loop'`, `phase: null` group with the exact
  main-loop token total, and no per-phase split of that total anywhere in the report;
- sub-agent groups carry non-null roles resolved from the sidecar;
- a sub-agent transcript with no sidecar yields a group with `role: null` **and** the
  `no resolvable agent label` stderr line;
- each advisory row of the table above asserts exit `0` and the expected note;
- a `subagents/` **symlink escaping the READ root is refused and counted** — build it in a
  `mktemp` tree using the file's existing containment-test pattern (`makeTmp`, real
  `containByRealpath`);
- the run `slug` is restored onto slug-less sub-agent groups sharing a `run` with
  main-loop events;
- **zero-arg read-root resolution**: direct unit assertions on the exported `dashedCwd`
  and `resolveDefaultTranscriptDir` seams (including that a non-claude source resolves to
  the root unchanged);
- **no-regression for the other five bindings**: a source with no `SOURCE_DISCOVERY` entry
  (the opencode fixture dir at line ~885) behaves exactly as before.

**The bin smoke (`engine/test/usage-mine.bin.test.js`) — and the trap in building it.**
The design asks for one subprocess smoke over the new fixture tree in a `mktemp`
throwaway: exit 0, `report.json` + `report.md` written, sub-agent groups present with
non-null roles, and `report.md`'s cost string a plausible dollar figure rather than
`$0.0000` (the end-to-end guard on Part 1's call-site row 9). The existing cases all rely
on containment **rejecting** `fixtures/telemetry`, so they never reach discovery.

To reach it, the subprocess needs a read root it can pass containment against. Spawn with
`env: { ...process.env, HOME: tmpHome }` — `os.homedir()` reads `$HOME` on this platform,
and `DEFAULT_PROJECTS_DIR` is computed at module load **inside the subprocess**, after the
env is set. Copy the fixture tree to `tmpHome/.claude/projects/<dashed>/`. Two traps:

- **Realpath.** `os.tmpdir()` on this platform resolves through a symlink
  (`/var` → `/private/var`), and `containByRealpath` compares realpaths while
  `process.cwd()` in the child reports the resolved path. Compute the dashed slug from
  `realpathSync(repoRoot)`, not from the raw `mkdtemp` return.
- Run the child with **no arguments** and `cwd: repoRoot`. That makes this single case the
  end-to-end proof of ADR-336 as well: the advertised zero-argument front door now reports
  something.

**`skills/metrics/SKILL.md` — two lines this commit makes false or true**

- Line 65, the flag table row `| \`--include-inline\` | Include inline-phase transcript segments |`
  → a `--no-inline` row describing what it suppresses (the main-loop group) and noting
  that main-loop usage is included by default.
- Lines 38–40, §2 *"The miner resolves the transcript directory for the current working
  directory internally (`cwd → dashes` mapping)"* — this becomes **true for the first
  time** under ADR-336. Confirm the wording matches the implemented mapping rather than
  rewriting it for its own sake.
- **`skills/` is scanned by `test/source-hygiene.test.js`** — no `gh`/`github` and none of
  the Class A tokens in what you write there. Advisory `prose-lint` also applies.

**Guardrails:** exit codes unchanged (`0` everywhere except unknown `--source`); no new
`report.json` field; no path, `$HOME` fragment, username or prompt text may reach the
report (the existing no-leak bin case at `usage-mine.bin.test.js` guards this — keep it
green); no provenance refs; no suppression directives; no swallowed error left
uncommunicated.

### TDD steps

1. **RED — the 100x regression test.** Add it against a `mktemp` projects tree carrying a
   main-loop file with a 1,000-token rollup and `<sid>/subagents/agent-<id>.jsonl` with
   100,000 tokens of assistant turns. Expected failure: the flat `readdirSync` never
   descends, so the report's total is 0 (the rollup no longer emits after Part 2) — not
   100,000.
2. **GREEN — wire discovery.** Add `SOURCE_DISCOVERY`, `makeDiscoveryPorts`, the
   `rootListing` probe split, and the entry-based `streamTranscriptFiles`, passing
   `{ ...(entry.context ?? {}), includeInline }` as the third `parseLines` argument.
3. **RED — the counted fallbacks.** Assert the three new stderr lines for a no-sidecar
   transcript, an unlistable `subagents/`, and a containment-refused entry. Expected
   failure: none of the counters exist and the refusal path still `continue`s silently.
4. **GREEN — thread `unlabelled`, `unreadable`, `refused`** through
   `streamTranscriptFiles` and `main`, emitting each line only when its count is `> 0`.
5. **RED — the symlink refusal.** Build a `subagents/` symlink escaping the READ root in a
   `mktemp` tree; assert the session's sub-agents are skipped, `unreadable` is 1, and the
   exit is 0. Expected failure until the port's `safe()` guard is in place.
6. **GREEN** — confirm the port contains before it lists.
7. **RED — `--no-inline`.** Assert the flag drops the `role: 'main-loop'` group **and**
   that the same fixture still yields its `auto-skip:` phase-skip recommendation. Expected
   failure: `parseArgs` has no `--no-inline` case, so the flag is ignored entirely.
8. **GREEN — the flag.** Invert the `parseArgs` default to `includeInline: true`, delete
   `--include-inline`, add `--no-inline`, delete `INLINE_GAP_NOTE`, and make line 345
   unconditional on `NO_EVENTS_NOTE`.
9. **RED — the zero-arg read root.** Unit-assert `dashedCwd` against the two verified live
   mappings, and `resolveDefaultTranscriptDir('claude', root, cwd)` against
   `join(root, dashedCwd(cwd))`; assert a non-claude source resolves to `root` unchanged.
   Expected failure: neither export exists.
10. **GREEN — `DEFAULT_TRANSCRIPT_DIRS`, `dashedCwd`, `resolveDefaultTranscriptDir`**, the
    `io.cwd` injection point, and `resolveTranscriptDir` taking the resolved default.
    **Confirm the containment root is still `projectsRoot`** by asserting an explicit
    `--dir` pointing at a *different* project directory under the same root is still
    accepted.
11. **RED — the bin smoke.** Add the `HOME`-scoped subprocess case asserting exit 0,
    both reports written, non-null sub-agent roles, and that `report.md` contains a
    non-`$0.0000` dollar figure. Expected failure until steps 2–10 are all in.
12. **GREEN** — confirm; fix the realpath-slug trap if the child reports a resolved cwd.
13. **RED → GREEN — the no-regression guard** for a source with no `SOURCE_DISCOVERY`
    entry.
14. **REFACTOR.** Update the `usage-mine-main.js` module header (lines 1–17) for the
    two-level discovery and the new counted branches. Update the two
    `skills/metrics/SKILL.md` lines. Re-read the advisory table row by row against the
    implementation and confirm every branch exits 0.

### Gate

```
npm --prefix engine test
```

### Commit

```
feat(telemetry): mine sub-agent transcripts and include main-loop usage by default
```

---

## Part 5 — The metrics ledger: transcript-sourced rows and one boundary marker

### Context

Discharges **ADR-330** (the row's data source moves to the phase's own sub-agent
transcript; `skills/run/SKILL.md` is explicitly in scope) and **ADR-331** (the 372
historical rows are annotated with one appended boundary marker, never migrated).
Satisfies design Requirement 16. **Docs-only — no `src/` delta**, which is why it is a
standalone part under the sizing rules.

**Files to change**

- `skills/run/SKILL.md` — two blocks
- `.claude/craft-metrics.md` — **one appended line, nothing else**

**Why this part exists at all: fixing the miner does not fix the ledger.**
`.claude/craft-metrics.md` is **not written by the miner**. `skills/run/SKILL.md` instructs
the *session* to append each row at run time from the usage block the spawn returns — the
identical final-message usage this change proves is ~100x short. Row magnitudes
(60k–200k) match rollup `totalTokens` exactly.

**Corroborating defect: the previous writer upgrade never took effect.** ADR-184 replaced
a lossy `cache=na` field with a real `cache_read=` / `cache_creation=` split, degrading to
`cache=na` only *"if the split is genuinely unavailable for a given spawn"*. Measured on
the committed file: **372 of 372 rows are `cache=na`; zero rows carry `cache_read=`.** The
degradation path is the only path that has ever executed, because the split was to be
recovered by parsing the run's own spawn-rollup lines, and the untyped/usage-less rollups
plus the final-message-only `usage` make that recovery empty in practice. The sub-agent
transcript carries `cache_read_input_tokens` and `cache_creation` on **every**
usage-bearing line, so the split the ledger has never once recorded becomes available from
the same read that supplies the token total.

**Edit 1 — `skills/run/SKILL.md`, the metrics-artifact instruction (around line 528).**
Current text:

> **Metrics artifact (separate, append-only).** For each agent-spawned phase that returned
> a usage block, append one line to `.claude/craft-metrics.md` (ADR-119):
> `<run-id> <phase-id> tokens=<subagent_tokens> duration_ms=<duration_ms> cache_read=<n> cache_creation=<n>`
> (degrades to `cache=na` when the split is unavailable).
> Source: the usage block the spawn already returns — exact, zero extra cost. Role-less /
> inline phases have no spawn usage block; omit them. …

Rewrite the **source** sentence so the session reads `tokens=`, `duration_ms=`,
`cache_read=` and `cache_creation=` from **that phase's own sub-agent transcript** rather
than from the returned spawn usage block. The row **format is unchanged** — the same four
fields, the same `<run-id> <phase-id>` prefix, the same finer phase-id granularity the
ledger keys on (`implementation-part7-mirror-sync` rather than the miner's coarse
`implementation`). Only the source moves. Keep the `cache=na` degradation clause: it must
now fire only when the transcript itself is genuinely unavailable.

**Edit 2 — `skills/run/SKILL.md`, the "Numbers are harness-sourced" note (around line
449).** Current text: *"The orchestrator reads `subagent_tokens` and `duration_ms` from the
usage block the spawn already returns — exact, zero-cost."* That rationale no longer holds
and must be corrected **in the same edit** rather than left contradicting the new
instruction: the returned block is the sub-agent's final message, not its cumulative
usage, and the honest cost is now one transcript read per phase. Keep the sentence that
follows — *"No agent is asked to report its own usage"* — which is still true and is the
property that keeps the number trustworthy.

**Edit 3 — `.claude/craft-metrics.md`, exactly one appended line.** The file is
append-only (372 rows, first line `# craft per-phase metrics (append-only)`, last row
`scheduled-backlog-sweep documentation tokens=191984 duration_ms=443475 cache=na`).
Append **one** boundary marker line naming the date and the correction, so a reader
trending across the boundary does not read a ~100x accounting correction as a real cost
explosion. **Do not edit, recompute, renumber or reformat a single existing row** —
migration is foreclosed, because transcript retention is upstream-controlled and a partial
recompute yields a silently mixed-fidelity artifact. The append itself is what honors the
append-only property.

The marker must be greppable and self-explaining without reference to any document: a
fixed leading token, the date, and one sentence stating that rows above it were sourced
from the spawn's final-message usage and are ~100x low, that rows below it are sourced
from the phase's own sub-agent transcript, and that the two must never be compared.

**Guardrails**

- **`skills/` is scanned by `test/source-hygiene.test.js`** for Class A
  (the tool names listed in this plan's surface-gates section) and Class B
  (`\bgh\b|\bgithub\b`) tokens. Write around them.
- `.claude/` is **never** scanned by source-hygiene and is excluded from `prose-lint`'s
  corpus, but `skills/run/SKILL.md` is prose-linted (advisory): avoid `delve`, `leverage`,
  `seamless`, `robust`, `it's important to note`, `in conclusion`.
- `.claude/craft-metrics.md` is explicitly re-included by `.gitignore`
  (`!.claude/craft-metrics.md`) — it **is** committed. Verify with `git status` before
  committing that exactly the two intended files are staged.
- No provenance refs in the marker line itself — state the correction in prose, not by
  decision number.

### TDD steps

There is no `src/` delta and no automated assertion over these two artifacts, so the
verification is mechanical and must be performed and reported rather than assumed. RED
here is *"the artifact currently states the false thing"*, established by reading it.

1. **RED (established by reading).** `grep -c 'cache=na' .claude/craft-metrics.md` returns
   372 and `grep -c 'cache_read=' .claude/craft-metrics.md` returns 0 — record both counts
   before touching anything. `skills/run/SKILL.md` still names the spawn usage block as the
   row's source in two places.
2. **GREEN — edit 1.** Rewrite the metrics-artifact source sentence to the phase's own
   sub-agent transcript, leaving the row format and the `cache=na` degradation clause
   intact.
3. **GREEN — edit 2.** Correct the "Numbers are harness-sourced" rationale in the same
   file, in the same commit.
4. **GREEN — edit 3.** Append exactly one boundary marker line to
   `.claude/craft-metrics.md`.
5. **VERIFY.** `git diff --no-ext-diff --stat` shows exactly two files;
   `git diff --no-ext-diff .claude/craft-metrics.md` shows exactly **one added line and
   zero removed lines**; `grep -c 'cache=na'` still returns 372 (no historical row was
   touched). Re-read both `skills/run/SKILL.md` blocks and confirm they no longer
   contradict each other.
6. **GREEN — the substrate gate.** `npm --prefix engine test` must stay green (no test
   reads either file, so a failure here means something unintended was staged).
7. **REFACTOR.** Re-read the rewritten instruction as a zero-context session would and
   confirm it names *where* the transcript is, not merely that one exists.

### Gate

```
npm --prefix engine test
```

### Commit

```
docs(metrics): source ledger rows from the phase transcript and mark the boundary
```

---

## Part 6 — Regenerate the drift baseline and move the README claims with it

### Context

Discharges **ADR-332** (regenerate in this change, after the pricing correction and with
main-loop inclusion on). Satisfies design Requirements 14, 15 and the acceptance half of
17. **This part MUST be last** — see the hard ordering constraint. Docs/artifact-only,
no `src/` delta.

**Files to change**

- `docs/contributing/metrics-baseline.report.json` — regenerated wholesale
- `README.md` — the FAQ telemetry claims **and** the advertised corpus counts

**Why it cannot be skipped, and why it cannot be early.** `docs/contributing/metrics-baseline.report.json`
is the committed drift baseline: 27 runs, 144 groups, 39.7M relative tokens, produced
entirely by the broken path — including one all-zero `claude-sonnet-5`
`phase: null, role: null` noise group (an untyped rollup) and 17 `phase: null` groups from
the retired `slice-implementer` role. `computeDrift` compares per-phase **means**, so a
~100x token correction reads as drift on **every** phase, permanently, until the baseline
is regenerated — the advisory signal failing exactly when the change most needs it.
Regenerating before Part 1 bakes a baseline still carrying `null` for half its groups and
dollars 10⁶ too large; regenerating before Part 4 bakes one missing main-loop cost
entirely.

**How to regenerate.** Run the fixed miner from the worktree root against the craft repo's
own project directory — **not** the worktree's, which has almost no history:

```
node engine/bin/usage-mine.js --dir "$HOME/.claude/projects/-Users-scolladon-workspace-perso-craft"
```

`report.json` and `report.md` land in the repo root and are **gitignored**
(`/report.json`, `/report.md`). Move `report.json` to
`docs/contributing/metrics-baseline.report.json` and delete the stray `report.md`. The
output is byte-stable through `serializeReport` (deep-sorted keys, trailing newline), so
a re-run over the same tree is reproducible.

**Sanity anchors, measured on the live corpus on 2026-08-06 — order-of-magnitude only.**
The corpus is live and grows under the miner's feet (it was re-measured the same day at
274 files / 244 sidecars / 3,945,021,795 tokens against an earlier 273 / 243 / ~3.92B).
**No assertion in this change may pin a corpus absolute.** Expect roughly: 274 files
(30 main-loop, 244 sub-agent), ~3.9B relative tokens, **~$3,600** priced — of which
~$1,400 was unpriceable before Part 1 — and runs moving from 27 to **≈30**, since
enumeration becomes transcript-driven and sub-agent lines carry the parent session id.

**The four mechanical checks — this part's real gate (design Requirement 14).** Run them
against the regenerated file and report each result:

1. **No group carrying `claude-opus-5` or `claude-sonnet-5` has `cost.priced: null`.**
   Proves the two model entries landed.
2. **At least one group has `role: "main-loop"`.** Proves main-loop inclusion was on.
3. **The sum of `cost.priced` across the file is of order 10³ dollars, not 10⁹.** The
   current committed file sums to **31,171,735.70**; any regenerated value above ~10⁶ is
   proof the divisor did not land. Report the actual sum.
4. **`--baseline docs/contributing/metrics-baseline.report.json` does not report every
   phase as drifted** (design Requirement 15). Re-run the miner with `--baseline` pointed
   at the freshly committed file and confirm the `drift` array is empty or near-empty.
   This is only satisfiable by regenerating; it is the check that proves the ordering was
   respected end to end.

**`README.md` — two independent surfaces, and conflating them is the easy mistake.**

- **The cost comparison table (§"What it costs, measured", line ~116) and
  `docs/guides/comparison.md` need NO numeric change.** Their three-arm figures
  (`88.6M/$62.72`, `154.3M/$103.95`, `544.3M/$297.55`) were collected by this design's own
  method and were re-derived to the cent against the transcripts still on disk. They
  describe a *different repository* (`sgd-bench-arm-c-craft`, one run), not craft's own
  3.95B-token history, so the regenerated baseline neither confirms nor contradicts them.
  **Do not touch them.**
- **The FAQ telemetry claims (line ~231) WILL move.** *"Across the [27 telemetered runs]…
  the median run logs ≈1.3 hours of role-agent activity, from half an hour for a small
  change to ≈5 hours for the largest feature"* is recomputed from the baseline by
  `engine/src/telemetry-claims.js` → `recomputeClaims` and guarded by `readme-drift`.
  Update the run count and the median/min/max wording to whatever the regenerated file
  actually yields. **The *sentence* stays true without a rewrite**: ADR-340 gives
  main-loop events `durationMs = 0`, so `recomputeClaims`' duration sum continues to mean
  role-agent activity only. If a `readme-drift` finding says otherwise, that is a signal
  the main-loop duration did not land at zero — investigate rather than rewriting the
  prose.
- **The advertised corpus counts (line ~173) are ALREADY drifted on this branch** and are
  this part's responsibility: *"[26 design docs](…), [25 parted plans](…), [327 ADRs](…),
  and [raw telemetry for 27 runs](…)"*. The design doc and the thirteen ADRs are already
  committed, and this plan file itself moved the plan count. **Do not copy numbers from
  this document** — `scripts/readme-drift.sh` prints the tree's actual count in each
  finding (`corpus-counts: <dir> claims N, tree holds M`). Run it, take `M`, and re-run
  until clean. The run-count link text must match the regenerated baseline's `runs.length`.

**Tests that must stay green untouched.** `engine/test/readme-drift-main.test.js` and
`engine/test/readme-drift.bin.test.js` build **synthetic** fixture trees in `mktemp` and
never read the committed baseline, so they are unaffected — confirm rather than assume.
`engine/test/telemetry-claims.test.js` is entirely pure unit tests over synthetic reports
and hand-written claim objects; it does not read the real baseline either.
`engine/test/readme-regions.test.js` pins README *region-extraction* shapes against literal
example strings, not against the live README — but it does contain the literal
`'**What does a run cost?** Across the [27 telemetered runs](docs/contributing/metrics-baseline.report.json)'`
at lines 63, 224 and 354 as a **parser fixture**. Read those three sites before editing the
README and confirm they are fixtures, not assertions about the live file; if any of them
reads the real `README.md`, it moves with the FAQ in this commit.

**`readme-drift.sh` is a separate CI job, not part of `scripts/ci.sh`.** The part gate
below will not catch a drift finding. **Run `bash scripts/readme-drift.sh` explicitly and
require exit 0 before committing.**

**Guardrails**

- `README.md` is scanned by `test/source-hygiene.test.js` for Class A and Class B tokens.
  The canonical repo URL is allowlisted; a bare `gh`/`github` on the same line is not.
- `README.md` is prose-linted (advisory): avoid `delve`, `leverage`, `seamless`, `robust`,
  `it's important to note`, `in conclusion`.
- Commit **only** `docs/contributing/metrics-baseline.report.json` and `README.md`. The
  generated `report.json` / `report.md` in the repo root are gitignored — verify with
  `git status` that neither is staged.
- No provenance refs anywhere in the README prose.

### TDD steps

The artifact is generated, not hand-written, so RED is established by measurement against
the *pre-regeneration* file and each check is asserted by running it.

1. **RED — record the pre-state.** On the committed baseline, compute and record: the sum
   of `cost.priced` (**31,171,735.70** today), the count of groups whose model is
   `claude-opus-5` or `claude-sonnet-5` with `cost.priced: null` (non-zero today), and the
   count of groups with `role: "main-loop"` (**zero** today). All three are the failure
   state this part exists to end.
2. **RED — the drift check.** Run the fixed miner with
   `--baseline docs/contributing/metrics-baseline.report.json` against the live corpus and
   record how many phases the `drift` array flags. Expect **every** phase — that is design
   Requirement 15's failure state.
3. **GREEN — regenerate.** Run the miner against
   `$HOME/.claude/projects/-Users-scolladon-workspace-perso-craft`, move `report.json`
   over `docs/contributing/metrics-baseline.report.json`, delete the stray `report.md`.
4. **GREEN — the four mechanical checks.** Re-run checks 1–4 from the Context block against
   the regenerated file and report every actual number. Any failure here means a part was
   reordered or a call site was missed — **stop and report as a blocker; do not
   re-regenerate on top of a bad state.**
5. **RED — `readme-drift`.** `bash scripts/readme-drift.sh` — expect findings for the
   corpus counts (already drifted before this part) and for the telemetry claims (newly
   drifted by step 3).
6. **GREEN — README.** Update the FAQ telemetry claims and the advertised corpus counts
   using the counts the tool itself reports. Re-run until `bash scripts/readme-drift.sh`
   exits 0.
7. **GREEN — the substrate gate.** `npm --prefix engine test`, then `bash scripts/ci.sh`
   from the repo root. Confirm `readme-drift-main`, `readme-drift.bin` and
   `telemetry-claims` are green **untouched**.
8. **REFACTOR.** Re-read the README FAQ sentence end to end against the regenerated
   numbers and confirm it is *true*, not merely arithmetically consistent. Confirm the
   cost comparison table and `docs/guides/comparison.md` were **not** touched.

### Gate

```
npm --prefix engine test
bash scripts/readme-drift.sh
bash scripts/ci.sh
```

### Commit

```
chore(telemetry): regenerate the drift baseline under the corrected miner
```

---

## Phase-boundary gate

After Part 6, from the repo root:

```
bash scripts/ci.sh
bash scripts/readme-drift.sh
npm --prefix engine run mutation
```

`scripts/ci.sh` covers the engine suite, all seven adapter suites, the repo-root process
suite (including `test/source-hygiene.test.js`), `intention-lint` over the living corpus,
`shellcheck`, the pipeline/contracts/backlog/design lints, the docs-structure lints, the
adapter-agent sync check, and the advisory stub/prose hygiene lints.
`npm --prefix engine run mutation` must hold its threshold over `engine/src/observability/**`
— the mutation target that covers every file this change touches under `engine/src/`.
