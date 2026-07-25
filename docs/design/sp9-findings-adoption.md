# Design — SP9 findings adoption

> Brief: adopt the three SP9 spike findings as one delivered change — status-tagged
> reviewer claims, the deliberation-review methodology declination promoted into the
> examples catalog, and the bounded-state intra-phase threading convention codified.
> Status: draft → self-reviewed ×2 → accepted

## Context

SP9 (`docs/archive/SPIKE.md` on branch `spike/recursivemas`; NO-GO for integrating
RecursiveMAS itself) closed with three *text-space* takeaways that DO fit craft. This
change lands all three. They are independent surfaces that share one spine — a **bounded,
status-tagged findings record threaded between review rounds** — so they ship together.

What exists today, per read of the current tree:

- **Reviewer output → canonical `Finding[]`.** `agents/reviewer.md` (a read-only,
  single-dimension `craft:reviewer`, `model: opus`) ends by emitting a structured findings
  list. `skills/review/SKILL.md` step 2 pipes each reviewer's raw output through
  `node engine/bin/normalize-findings.js` (a 5-line shim over
  `engine/src/normalize-findings-main.js` → `main(argv, io)`) into a canonical
  `Finding[]`. The parser is `engine/src/findings.js` → `normalizeFindings(raw)`:
  - Canonical shape (typedef): `{ file: string, line: number, severity: string,
    finding: string, fix?: string }`. `fix` is the **only** optional field; it is
    *omitted* (not `undefined`) when absent — see `toFinding`.
  - Two wire shapes accepted interchangeably (R10 — key on fields, never on layout):
    a **JSON array** of those objects, or a **per-line** list
    `<severity> <file>:<line> — <finding> [ | <fix>]` matched by
    `LINE_HEAD_PATTERN = /^(\S+)\s+(\S+):(\d+)\s+[—–-]\s+(.*\S)$/u`, split on
    `PIPE_DELIMITER = /\s+\|\s+/u`. `REQUIRED_JSON_FIELDS = ['file','line','severity','finding']`.
  - Severity is **not** validated — stored as `String(severity)`. Empty input → `[]`.
    Structurally-unrecoverable input **throws** (`Cannot parse findings: …`).
- **The injected contract** for the review phase is `contracts/harness-read.md`:
  `Structured findings: each finding reported as { file:line, severity:
  CRITICAL|HIGH|MEDIUM|LOW, finding, suggested fix }.` plus a fix-delta clause:
  `verify each prior finding's resolution and review the fix diff itself — do not re-read
  the full original diff.` `docs/DESIGN-customizable-engine.md` fixes the same field set as
  the `harness-read` producer contract and the R10 normaliser seam (`findings-normalize`).
- **The review convergence loop** (`skills/review/SKILL.md`, Procedure): round 1 fans out
  reviewers per dimension; step 3 the **session applies every accepted finding**; step 4
  converges up to `max_cycles` per the engine-emitted `stop_rule`
  (`low-only` | `none` | `non-low-count<=<n>`), where a MEDIUM+ remainder relaunches a
  **fresh reviewer scoped to the FIX DELTA only** carrying **prior findings + the fix
  commits' diff**. This loop *already* threads a bounded structured artifact (the
  normalized `Finding[]` + a diff), never an accumulated transcript.
- **The deliberation-review prototype** exists only on `spike/recursivemas` at
  `examples/deliberation-review/workflow.md`: a `phases.review.role: deliberation-reviewer`
  swap running the RecursiveMAS "Deliberation" topology in text space, with a `REFINED-STATE`
  block (≤20 lines, every line prefixed `VERIFIED:`/`SUSPECT:`/`RULED-OUT:`/`PROBE:`) as the
  only thing threaded between rounds. It must be ported onto this branch as a stable
  catalog example.
- **The examples catalog** is `examples/README.md` + the §4 index in
  `docs/GUIDE-customizing.md`. Every `examples/*/workflow.md` is gated by
  `test/examples-lint.test.js`, which runs `scripts/manifest-lint.sh` per file and asserts
  exit 0 + `valid.`. `manifest-lint` checks `phases.<id>.role` is a *string* only — role
  *resolution* is a runtime `pipeline-resolve` concern, so a bare local `role:` passes the
  gate (as `examples/role-swap/` already does with `acme:tdd-specialist`).
- **The concept frame** for on-disk / bounded state is `docs/GUIDE-concepts.md` Frame 1
  (Karpathy: "write the loop, not the prompt"; "State on disk, not in the model"; "A loop
  that only lives in a chat transcript dies with the transcript"). `docs/GUIDE-concepts.md`,
  `docs/GUIDE-customizing.md`, and every `docs/DESIGN-*.md` are in the intention living
  corpus (`scripts/living-corpus.sh`) and are `intention-lint`-gated.

Binding invariants for this change: no provenance refs (SP9/ADR/backlog/`P<n>`) in source
or test code — `engine/test/source-hygiene.test.js` scans `engine/src/**` for the
`PROVENANCE_REF` pattern; provenance lives in docs/design only. Engine bins stay 5-line
shims over `engine/src/<name>-main.js` (bin logic in `src` so Stryker, which mutates
`engine/src/**`, covers it). `scripts/ci.sh` is the single phase gate; the offline lychee
job verifies every relative link + `#fragment` across all markdown.

## Requirements

When this ships, all of the following are verifiably true.

**Finding (1) — status-tagged claims.**

1. The canonical `Finding` gains an **optional** `status` field over a closed vocabulary
   `{VERIFIED, SUSPECT, RULED-OUT, PROBE}`. Like `fix`, it is *omitted* when absent, never
   set to `undefined`/`null`/`"null"`.
2. **Backward compatibility is total.** Every existing fixture
   (`engine/test/fixtures/findings/{array.json,per-line.txt,mixed-whitespace.txt,empty.json}`)
   and every status-less reviewer line/object parses to the *same* `Finding[]` it produces
   today, with no `status` key present. No existing `findings.test.js`,
   `normalize-findings-main.test.js`, or `normalize-findings-bin.test.js` assertion changes
   meaning.
3. Both wire shapes carry `status` interchangeably: a JSON object with a `status` key and a
   per-line record with a status marker normalize to the *deeply equal* `Finding`
   (the R10 anchor extends to the new field).
4. `contracts/harness-read.md` and the `harness-read` field set in
   `docs/DESIGN-customizable-engine.md` document the `status` field and its vocabulary.
   `agents/reviewer.md` instructs the reviewer to tag each finding's status.
5. `skills/review/SKILL.md` defines, in prose: which statuses are **actionable** (the
   session applies them) vs **record-only**; how `RULED-OUT` interacts with the convergence
   stop-rule; and how `RULED-OUT` claims are carried into the next cycle's fix-delta reviewer
   spawn so ruled-out non-issues are not re-litigated.
6. The `status` change is proven by engine tests that survive Stryker mutation of the new
   `engine/src/findings.js` branches.

**Finding (2) — deliberation-review example.**

7. `examples/deliberation-review/workflow.md` exists on this branch, passes
   `manifest-lint` (hence `examples-lint`), and every relative link / `#fragment` in it
   resolves on this branch (lychee-clean) — it must not link to spike-branch-only content.
8. `examples/README.md` and the `docs/GUIDE-customizing.md` §4 examples index reference the
   new example. It is presented as **opt-in, explicitly NOT a default** (~2× cost for
   depth), wired via the existing `role:` (#10) + `harness` (#6) injection points.
9. The example does not introduce a new numbered injection point and does not alter any
   default pipeline behavior.

**Finding (3) — bounded-state threading convention.**

10. The convention "multi-round intra-phase loops thread a **bounded structured state**
    (the normalized, status-tagged `Finding[]` + the fix diff), never an accumulated
    transcript" is stated explicitly where multi-round loops are described.
11. The codification is **behavior-preserving** by default: review convergence already
    threads bounded state, so no round today starts threading a transcript. Any mechanical
    change (if chosen) must be a no-op on current behavior and covered by tests.
12. All touched living-corpus pages remain `intention-lint`-clean; all touched markdown
    remains lychee-clean and `prose-lint`/`docs-structure-lint`-clean.

## Design

### Pinned empirical matrix (SP9 probe, 2026-07-25 — cite-as-given)

The external behaviour this change echoes is the SP9 A/B/C probe. Per the brief these
numbers are already measured (headless `env -u ANTHROPIC_API_KEY claude -p --model sonnet
--allowedTools "" --output-format json`, one 4-planted-bug diff, diff-only) and are cited,
not re-run (re-running needs the spike scratchpad + is directional, n=1):

| arm | shape | calls | output tokens | planted caught | extra real findings |
|---|---|---|---|---|---|
| A | craft default reviewer, single pass | 1 | 7,860 | 4/4 | 2 |
| B | deliberation, ≤20-line refined state | 3 | 18,289 | 4/4 | 2 (incl. 1 A missed) |
| C | deliberation, full-transcript threading | 3 | 26,340 | 4/4 | 4 |

Reads that bind the design: (i) catch-rate saturates at baseline on a small diff — the
topology buys *depth*, not *catch rate*, at ~1.8–2.1× cost → **not a default**, a candidate
for high-stakes dimensions (finding 2). (ii) **B vs C**: bounded-state threading held
comparable quality at **~31% fewer output tokens** than transcript threading → the
artifact-over-transcript rule applied *inside* a phase (finding 3). (iii) Round 2 did real
work inside the ≤20-line bound (promoted SUSPECT/PROBE→VERIFIED, demoted to RULED-OUT) →
the status vocabulary is load-bearing, not decoration (finding 1). Caveat carried into every
doc surface: n=1, one synthetic diff, one tier — directional.

### Finding (1) — status-tagged claims

**Schema.** `Finding` becomes
`{ file, line, severity, finding, fix?, status? }`. `status` is optional over the closed
set `{VERIFIED, SUSPECT, RULED-OUT, PROBE}` — the same four the deliberation `REFINED-STATE`
already uses, so one vocabulary spans both artifacts. `toFinding` extends exactly as `fix`
is handled: build a base object, then attach `status` only when the raw value is **present
and non-null** — never inject an `undefined`/default key (Req 1, 2). Recognition of the four
tokens happens *upstream*: the per-line parser supplies `status` only from the colon-peel
below; the JSON parser passes the key through (DC2). The canonical key order
(`file, line, severity, finding, fix?, status?`) is pinned so the byte-exact main/bin CLI
tests stay deterministic.

**Per-line encoding (recommended in DC1).** An optional leading status marker, colon-suffixed
to mirror the deliberation prefixes and the memory-hint "fixed `TOKEN:`" convention:

```
[<STATUS>:] <severity> <file>:<line> — <finding> [ | <fix>]
RULED-OUT: HIGH src/limiter.js:42 — off-by-one at the window edge | use < not <=
HIGH src/limiter.js:42 — off-by-one at the window edge          (status-less, unchanged)
```

Disambiguation is by the **disjoint vocabulary**: the status set
`{VERIFIED,SUSPECT,RULED-OUT,PROBE}` shares no member with the severity set
`{CRITICAL,HIGH,MEDIUM,LOW}` (and with the free-form severities the parser already
tolerates, a colon-suffixed leading token is the signal). The parser peels a leading
`^(VERIFIED|SUSPECT|RULED-OUT|PROBE):\s+` off the line *before* applying the unchanged
`LINE_HEAD_PATTERN`; if no such prefix is present the line is parsed exactly as today
(status absent). This is why old lines are untouched — the head pattern never sees the new
token. The peel is a separate, anchored, backtracking-free regex — it does not reintroduce
the ReDoS shape `findings.test.js` already guards.

**JSON encoding.** An optional `status` key on the object; `parseJsonShape`/`mapJsonItem`
add it to `toFinding`. `REQUIRED_JSON_FIELDS` is unchanged (status is optional). Validation
strictness is DC2; recommended pass-through (`String(status)`), mirroring how `severity` is
already handled — the deterministic seam stays dumb, the consumer (review skill) owns
semantics.

**R10 anchor.** A JSON object with `status: "RULED-OUT"` and the per-line
`RULED-OUT: …` record normalize to the deeply-equal `Finding` — the existing
"both layouts produce identical field-keyed output" property extends to `status`.

**Consumer semantics (review skill; DC3 + DC4).** `skills/review/SKILL.md`:
- **Actionable set = status ∈ {absent, VERIFIED, SUSPECT, PROBE}.** "Actionable" means the
  session *engages* the claim (verify → fix, or investigate a SUSPECT/PROBE and either fix it
  or record it as RULED-OUT), exactly as today for the status-less case. **`RULED-OUT` is
  record-only** — there is nothing to fix; it is written to the run record as "examined, not
  a defect," and dropped from the fix set. (In practice a deliberation reviewer resolves
  SUSPECT/PROBE *inside* its rounds and emits a final list; SUSPECT/PROBE reaching the session
  is the default-reviewer case, where the session applies the same engage-or-rule-out judgment.)
- **Stop-rule accounting operates on the actionable set.** The `non-low-count<=<n>` and
  `low-only` rules count remaining *actionable* MEDIUM+ findings; `RULED-OUT` records never
  block convergence (a ruled-out claim is resolved, not remaining). This is the one
  behavioural subtlety and is covered by the review-skill prose + noted for the planner.
- **Carry-forward (DC4, recommended prose-only).** Step 4 already feeds *prior findings* to
  the fix-delta reviewer. Include the `RULED-OUT` records in that prior-findings payload,
  labelled, with the standing instruction: *do not re-raise a RULED-OUT claim unless the fix
  diff reintroduces the condition.* `RULED-OUT` rides the existing bounded-state channel —
  no new artifact, no engine change beyond the schema. This is the mechanism by which
  "convergence cycles stop re-litigating ruled-out non-issues," and it is the concrete
  instance of finding (3).

**Contract + agent text.** `contracts/harness-read.md` line 2 gains the `status` field and
vocabulary; the `harness-read` field-set row in `docs/DESIGN-customizable-engine.md` is
updated to match (living-corpus page). `agents/reviewer.md` gains one instruction: tag each
emitted finding with its claim status, defaulting to the actionable case when a plain defect
is reported. No provenance tokens enter any of these (docs are exempt but the agent/contract
text stays provenance-free by habit).

### Finding (2) — deliberation-review example

Port `examples/deliberation-review/workflow.md` from `spike/recursivemas` to this branch as
a stable catalog declination. Content changes required for the new home:

- **Manifest** (unchanged shape): `phases.review.role: deliberation-reviewer` +
  `phases.review.harness: { dimensions: [code], max_cycles: 2 }`. This passes
  `manifest-lint` (role-as-string; harness shape identical to `examples/review-harness/`).
- **De-spike the framing** (DC5): recast "SP9 spike prototype" as a stable *methodology
  declination*; keep the empirical table with its honest caveat and cite the probe date as
  provenance in prose. The design doc (this file) is the durable home of the full method +
  matrix — the example links here, not to spike-only `docs/archive/SPIKE.md` content
  (this branch's `SPIKE.md` has no SP9 section → a deep link would be a dangling
  reference; Req 7).
- **Per-dimension framing.** The `role:` swap replaces *the whole phase's* reviewer, not one
  dimension. The high-stakes-dimension use is expressed by *narrowing* `harness.dimensions`
  to the costly lens (e.g. `[security]`) and swapping the role — so deliberation runs on that
  dimension alone. The example states this constraint explicitly so a reader does not expect
  per-dimension mixing within one review phase.
- **Agent delivery (DC5).** House style: the example ships the agent body as a fenced block
  in the prose with the instruction to save it to `.claude/agents/deliberation-reviewer.md`
  (as the prototype does; the catalog does not ship live agents). The G5 note stays: the
  engine still injects the `harness-read` contract around the swapped role, so the
  deliberation rounds happen beneath the artifact boundary.
- **Catalog wiring** (DC5): add a row to `examples/README.md` (the "Integrating external
  skill collections → Methodology" section is the natural anchor, since this is a
  methodology declination, not a new injection point) and a row to the
  `docs/GUIDE-customizing.md` §4 examples index. Both must say **opt-in, ~2× cost, not a
  default**.
- **Model pin.** The fenced agent body keeps `model: opus` per the prototype (depth work on
  a high-stakes dimension); this is a copyable illustration, not a repo default.

### Finding (3) — bounded-state threading convention

The convention is: *a multi-round intra-phase loop threads a bounded structured state — the
normalized, status-tagged `Finding[]` plus the fix diff — never an accumulated transcript.*
Craft already obeys it (review step 4 threads prior findings + fix diff), so the default
delivery is **convention-text, behaviour-preserving** (DC6):

- `docs/GUIDE-concepts.md` Frame 1 — add the convention as a first-class row/prose beside
  "State on disk, not in the model," grounded in the B-vs-C ~31% result: bounded state is
  the artifact-over-transcript invariant applied *inside* a phase.
- `skills/review/SKILL.md` step 4 — one sentence naming the threaded payload as bounded
  status-tagged findings-state (not a growing transcript), which is also where finding (1)'s
  `RULED-OUT` carry-forward is specified. The two findings share this sentence.
- `contracts/harness-read.md` fix-delta clause already embodies it ("do not re-read the full
  original diff") — extend it to name the bounded status-tagged state as the carried memory.

No mechanical change to *what* convergence threads is required or recommended: the payload is
already the bounded `Finding[]` + diff. The alternative (mechanically enforce a size/shape
bound on the threaded state) is a bigger surface with no current defect to fix and is left in
Out of scope / DC6.

### Surfaces touched (for the planner's parting)

| # | File | Change | Gate that proves it |
|---|---|---|---|
| 1 | `engine/src/findings.js` | optional `status` in both shapes | `engine/test/findings.test.js` + Stryker |
| 1 | `engine/test/findings.test.js` + new fixtures `with-status.{txt,json}` | status cases + backward-compat anchor | `node --test` |
| 1 | `engine/test/normalize-findings-{main,bin}.test.js` | status passes through CLI unchanged | `node --test` |
| 1 | `contracts/harness-read.md` | document `status` field + vocab | `contracts-lint` |
| 1 | `agents/reviewer.md` | instruct status tagging | (prose) |
| 1,3 | `skills/review/SKILL.md` | actionable set, stop-rule, carry-forward, bounded-state sentence | (prose) |
| 1,3 | `docs/DESIGN-customizable-engine.md` | `harness-read` field set + R10 note gain `status` | `intention-lint`, lychee |
| 2 | `examples/deliberation-review/workflow.md` (new) | ported, de-spiked, relinked | `examples-lint`, lychee |
| 2 | `examples/README.md` | methodology index row | lychee |
| 2 | `docs/GUIDE-customizing.md` | §4 examples index row | `intention-lint`, lychee |
| 3 | `docs/GUIDE-concepts.md` | Frame 1 bounded-state convention | `intention-lint`, lychee |

**Docs-impact for the documentation phase:** the intention living-corpus pages
`docs/GUIDE-customizing.md`, `docs/GUIDE-concepts.md`, and `docs/DESIGN-customizable-engine.md`
are all touched — the documentation phase must keep them intention-lint-clean and their tables
in sync with the shipped `status` field and the new example row.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | Per-line + JSON encoding of the finding `status` | (a) optional leading colon-suffixed status token (`RULED-OUT: HIGH file:line — …`) peeled before the unchanged head pattern; JSON gains an optional `status` key; absent → omitted like `fix`. (b) trailing status column after the finding/fix. (c) keep `status` out of the canonical `Finding` — carry it only in the deliberation `REFINED-STATE` prose, never in the normalized list. | **(a)** | Mirrors the existing optional-`fix` handling and the deliberation vocabulary exactly; the status/severity vocabularies are disjoint so old status-less lines parse byte-for-byte unchanged; keeps R10 field-keyed consumption. (c) would leave the normalized findings list — the thing convergence threads — unable to express RULED-OUT, defeating the brief. |
| 2 | `status` validation strictness in the normaliser seam | (a) closed-set validated — an unknown `status` value throws like a missing required field. (b) pass-through `String(status)`, unvalidated, mirroring today's `severity`. (c) closed vocab used only for per-line status-vs-severity disambiguation; JSON `status` passed through. | **(c)** | Matches the existing `severity` precedent (findings.js does not validate severity) and keeps the deterministic seam dumb; the review skill (consumer) owns semantics and treats only `RULED-OUT` specially, everything else actionable. (a) risks rejecting legitimate reviewer output on a typo and diverges from severity handling. |
| 3 | Review-skill semantics of `status` (actionable set + convergence accounting) | (a) actionable = status ∈ {absent, VERIFIED, SUSPECT, PROBE}; `RULED-OUT` record-only; stop-rule counts only actionable MEDIUM+. (b) every status actionable (`RULED-OUT` also "applied" as a no-op record); stop-rule unchanged. (c) only VERIFIED actionable; SUSPECT/PROBE also record-only (require promotion before a fix). | **(a)** | Preserves today's behaviour for the status-less common case, makes `RULED-OUT` the one record-only status (its whole purpose), and lets convergence terminate when only ruled-out claims remain. (c) would stall fixes behind a promotion step the single-pass reviewer never performs. |
| 4 | How `RULED-OUT` claims are carried into the next convergence cycle's reviewer spawn | (a) prose-only — include RULED-OUT records in the existing prior-findings payload step 4 already threads, with a "don't re-raise unless reintroduced" instruction. (b) a separate carried "ruled-out ledger" artifact distinct from prior findings. (c) engine-mechanical — a bin computes the carried-forward set. | **(a)** | The convergence loop already threads the normalized `Finding[]` as prior findings; `RULED-OUT` is just a status on those same records, so it rides the existing bounded-state channel with a one-line instruction — minimal surface and the concrete instance of finding (3). (b)/(c) add an artifact/bin for no behavioural gain. |
| 5 | Deliberation-review example: catalog placement, agent delivery, provenance/linking, model pin | (a) `examples/deliberation-review/` with the agent body fenced in the prose (save-to-`.claude/agents/`), indexed under "Methodology" in `examples/README.md` + §4 GUIDE index, de-spiked framing, links to this design doc (not spike-only SPIKE.md content), `model: opus` in the fenced agent. (b) ship a live `agents/deliberation-reviewer.md` in the repo and index it as a first-class agent. (c) also port the SP9 method section into this branch's `docs/archive/SPIKE.md` and deep-link it. | **(a)** | House style keeps catalog examples as manifest + prose (no live agents shipped); links must resolve on this branch for lychee, and this design doc is the durable method home. (b) pollutes the repo agent set with an opt-in prototype; (c) drags spike-branch content + provenance into the archive for one link. |
| 6 | Bounded-state threading (finding 3): delivery + codification home | (a) convention-text only, behaviour-preserving — state it in `docs/GUIDE-concepts.md` Frame 1 + `skills/review/SKILL.md` step 4 + the `harness-read` fix-delta clause; no mechanical change. (b) mechanically enforce a bounded shape/size on the threaded review state (reject/trim an oversized carry). (c) text only, in a single home (concepts frame) without touching the review skill/contract. | **(a)** | Review convergence already threads bounded state, so (a) codifies the existing invariant without behavioural risk and puts it where multi-round loops are actually described. (b) is a new enforcement surface with no current defect to fix (Out of scope). (c) under-specifies — the review skill is where the convention binds a real loop. |

## Test strategy

**Finding (1) — engine (Stryker-covered `engine/src/findings.js`).**
- New fixtures `engine/test/fixtures/findings/with-status.txt` and `with-status.json`
  carrying the four statuses (incl. a `RULED-OUT: … | fix` line proving status + fix
  coexist); expected `Finding[]` includes `status`.
- Per-line: `RULED-OUT: HIGH src/x.js:1 — …` → `status: 'RULED-OUT'`; a status-less line →
  no `status` key (`assert.ok(!('status' in f))`, mirroring the `fix`-absent tests).
- JSON: object with `status` → carried; object without → omitted; explicit `status: null` →
  omitted (mirror the existing `fix: null` test).
- **R10 property anchor:** the JSON and per-line status fixtures normalize `deepEqual`
  (extends the existing "identical field-keyed output" test).
- **Backward-compat anchor (regression):** re-run the *unmodified* `EXPECTED_FINDINGS`
  assertions against `array.json`/`per-line.txt`/`mixed-whitespace.txt` — they must still
  produce no `status` key. This is the "old-format lines still parse" proof.
- **Disambiguation edge matrix:** a leading token that is a severity-like word but not in the
  status set (e.g. `INFO src/x.js:1 — …`) parses as severity, status absent; a
  status token *without* the colon is treated as severity/finding text, not status
  (the peel is colon-anchored).
- **ReDoS guard intact:** the pathological trailing-space-then-pipe test still rejects
  promptly (the status peel is a separate anchored regex, not a new backtracking group).
- CLI: extend `normalize-findings-main.test.js` / `normalize-findings-bin.test.js` — a
  status-bearing input file/stdin round-trips to canonical JSON bytes including `status`.

**Finding (2) — example gate.**
- `test/examples-lint.test.js` now covers `examples/deliberation-review/workflow.md`
  automatically (directory scan) — it must exit 0 + `valid.` from `manifest-lint`.
- lychee (CI `links` job) verifies the ported file's relative links + fragments resolve on
  this branch — the acceptance check for "no spike-only links."
- Mirror `test/examples-github-adapter.test.js`'s index-presence assertion if a dedicated
  presence test is wanted: assert `examples/README.md` contains `deliberation-review`.

**Finding (3) — prose gates.**
- `intention-lint` over the touched living-corpus pages (`docs/GUIDE-concepts.md`,
  `docs/GUIDE-customizing.md`, `docs/DESIGN-customizable-engine.md`) stays green.
- `prose-lint` / `docs-structure-lint` over touched markdown stay green; lychee link-clean.
- No dedicated behavioural test — (3a) is behaviour-preserving convention text; the review
  loop's bounded-state behaviour is unchanged and already exercised by the review skill's
  existing operation. Any mechanical enforcement (DC6-b, not recommended) would need a
  dedicated engine test and is out of scope.

**Whole change:** `scripts/ci.sh` green end to end; `engine/test/source-hygiene.test.js`
confirms no provenance token entered `engine/src/**`; `design-lint` green on this doc.

## Out of scope

- **Mechanical bounded-state enforcement** (DC6-b): trimming/rejecting an oversized threaded
  review state. No current defect motivates it; the convention is documented, not policed.
- **A first-class per-dimension review topology** (deliberation on `security` while the
  default reviewer runs `code` in the *same* review phase). Today `role:` swaps the whole
  phase; per-dimension mixing is a walk/parallelism concern the run skill explicitly defers.
- **Making deliberation-review a default or a shipped repo agent.** It stays an opt-in
  catalog declination (~2× cost, depth-only on a saturated baseline).
- **Re-running the SP9 A/B/C probe.** n=1, one synthetic diff, one tier — the numbers are
  cited as directional, not re-measured; no CI harness is added for them.
- **Extending `status` to the executing-harness (`harness-exec`/validation) findings.** This
  change scopes status to the `harness-read` reviewer contract only; the triage bundle keeps
  its resolve-or-prove-benign shape.
- **Validating `severity` as a closed set.** Untouched — this change follows, not fixes, the
  existing pass-through precedent.
