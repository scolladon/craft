# Plan — SP9 findings adoption: status-tagged findings, deliberation example, bounded-state convention

> Source: design doc `docs/design/sp9-findings-adoption.md` · ADRs 277–282
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules applied

- The design's three findings map to **3 parts**, cut on **file ownership** so no file is
  edited by two parts (findings 1 and 3 share `contracts/harness-read.md` and
  `skills/review/SKILL.md`, so a finding-per-part split is impossible without splitting a
  file across parts — the worse option). One part owns each file end to end.
- **Part 1** is the only `src/` delta (`engine/src/findings.js`); its engine tests + new
  fixtures fold in (no standalone test-only part for feature code). **Part 2** and **Part 3**
  are docs/prose-only (contract + agent + skill + living-corpus docs; and the examples
  catalog) — no `src/` delta, so they are legitimately standalone (nothing to fold into).
  Part 3 adds one presence test (`test/examples-deliberation-review.test.js`), test-infra
  with no `src/` delta, folded into the part it guards.
- **Ordering.** 1 (engine schema) → 2 (the prose that documents that schema + the
  bounded-state convention) → 3 (the example). Part 2 depends on Part 1's concrete schema
  decisions (vocabulary, per-line encoding, omit-when-absent, key order). Part 3 is
  independent of 1 and 2 (the deliberation `REFINED-STATE` already uses the same four
  tokens on the spike) but lands last on the shared tree. Parts are sequential on one
  working tree; each builds on the last.

**Public-surface decision, up front.** The new `status` field on the canonical `Finding`
is a **public data-contract field** (the reviewer wire shape). This engine has no
barrel/registry/facade/exhaustiveness-switch for a typedef field, so Part 1 ships engine +
tests only. `status`'s downstream doc/contract surfaces — `contracts/harness-read.md`,
`docs/DESIGN-customizable-engine.md` harness-read row, `agents/reviewer.md`,
`skills/review/SKILL.md` — are enumerated here and delivered in **Part 2** (the immediately
following prose part), never deferred to the phase-boundary validate. No gate couples the
engine field to its docs (contracts-lint checks only non-empty + no "retrieval";
intention-lint checks `subjects` frontmatter + BACKLOG SoT pointers), so Part 1 and Part 2
are each independently phase-gate-green. The new **catalog example** (`examples/deliberation-review/`)
is likewise a public surface: its downstream gates — `examples/README.md` index row,
`docs/GUIDE-customizing.md` §4 index row, `examples-lint` auto-coverage, lychee — are all
pre-paid inside Part 3.

**Cross-cutting invariants every part obeys.** Never commit on a red gate. No provenance
refs (`ADR-?\d+`, `P\d+`, `Part \d+`, `backlog #\d+` — the `PROVENANCE_REF` pattern in
`engine/test/source-hygiene.test.js`) in any `engine/src/**` or test byte; provenance
(SP9/ADR numbers, the empirical matrix's honest caveat) lives only in `docs/` prose. No
suppression directives, no swallowed errors. `contracts/harness-read.md` must not contain
the substring "retrieval" (case-insensitive — `contracts-lint` rejects it; the engine
derives retrieval). Every touched `.md` stays lychee-clean (offline relative-link +
`#fragment` resolution); `--offline` does not check external `https://` URLs. Bounded
scope: work only in `/Users/scolladon/workspace/perso/craft-sp9-findings-adoption`.

---

## Part 1 — Optional `status` field in the findings normalizer (`engine/src/findings.js`)

### Context

Single `src/` delta of the change. File: `engine/src/findings.js` (ESM, exports
`normalizeFindings(raw): Finding[]`). Current shape to extend:

- **Typedef (lines 1–3):** `@typedef {{ file: string, line: number, severity: string,
  finding: string, fix?: string }} Finding`. Extend to add `status?: string`. Pin the
  canonical key order **`file, line, severity, finding, fix?, status?`** (ADR 277).
- **Constants (lines 13–16):** `PIPE_DELIMITER = /\s+\|\s+/u`;
  `LINE_HEAD_PATTERN = /^(\S+)\s+(\S+):(\d+)\s+[—–-]\s+(.*\S)$/u`;
  `REQUIRED_JSON_FIELDS = ['file','line','severity','finding']` — **unchanged** (`status`
  is optional; ADR 277/278).
- **`toFinding({ file, line, severity, finding, fix })` (lines 25–33):** builds `base`
  (`file`/`line`/`severity`/`finding`), then `fix != null ? { ...base, fix: String(fix).trim() } : base`.
  Note it **rebuilds** the object (never spreads the raw input), which is what pins the
  output key order regardless of source key order. Extend: destructure `status` too; after
  the fix step, attach `status` **only when present and non-null**, as the last key —
  `status != null ? { ...withFix, status: String(status) } : withFix`. Mirror `severity`
  (pass-through, **unvalidated, un-trimmed** — `String(status)`, ADR 278); do **not** inject
  an `undefined`/default key (Req 1, 2). Comment the "mirrors severity" rationale in prose
  — **no ADR/provenance token** in the source.
- **Per-line path — add the status peel.** New anchored, backtracking-free constant beside
  the others: `STATUS_PREFIX_PATTERN = /^(VERIFIED|SUSPECT|RULED-OUT|PROBE):\s+/u` (the four
  tokens are the deliberation `REFINED-STATE` vocabulary and are **disjoint** from the
  severity set, so they disambiguate). In `parseLine` (lines 90–107): on the trimmed line,
  match `STATUS_PREFIX_PATTERN` **before** `LINE_HEAD_PATTERN`; if it matches, capture
  `status = m[1]` and strip the prefix from the remainder; if not, `status` stays
  `undefined` and the line is parsed exactly as today. Then split the remainder on
  `PIPE_DELIMITER` and run the **unchanged** `LINE_HEAD_PATTERN`. Pass `status` into the
  `toFinding({ file, line, severity, finding, fix, status })` call at the end. The peel is
  **colon-anchored**: a leading status word without the trailing colon (`PROBE src/x.js:1 — …`)
  does not peel and is parsed as `severity`; a non-status leading word (`INFO src/x.js:1 — …`)
  is likewise a severity (Req disambiguation matrix). The peel is a **separate** anchored
  regex, not a new backtracking group — it must not reintroduce the ReDoS shape the existing
  pathological test guards.
- **JSON path — no structural change.** `mapJsonItem` (52–62) still validates only
  `REQUIRED_JSON_FIELDS` then calls `toFinding(item)`; because `toFinding` now destructures
  `status`, a JSON `status` key flows through automatically and unvalidated (ADR 278). An
  object with `status: null` → omitted (the `status != null` guard). `parseJsonShape`,
  `looksLikeJsonArray`, `parseLineShape`, `normalizeFindings` are untouched.

**Fixtures** live in `engine/test/fixtures/findings/` (`array.json`, `per-line.txt`,
`mixed-whitespace.txt`, `empty.json`, `malformed.txt`). Add two **mirror** fixtures whose
normalized `Finding[]` are deeply equal (the R10 anchor):
- `with-status.txt` — the four statuses across the four severities, including a
  `RULED-OUT: … | <fix>` line (proves `status` + `fix` coexist) **and** a status-less line
  (proves omission). Example rows:
  `VERIFIED: CRITICAL src/a.js:1 — real defect | patch it` /
  `SUSPECT: HIGH src/b.js:2 — maybe unsafe` /
  `PROBE: MEDIUM src/c.js:3 — check this path` /
  `RULED-OUT: LOW src/d.js:4 — not a bug | no change` /
  `error src/e.js:5 — plain finding`.
- `with-status.json` — the same five records as a JSON array, `status` key present on the
  first four, absent on the fifth (identical field values so the two fixtures normalize
  `deepEqual`).

**Tests** (fold in — no standalone test part). Engine tests are `node:test`, G/W/T titles,
AAA, `sut` variable.
- `engine/test/findings.test.js` — helpers: `readFixture(name)` (11–13),
  `EXPECTED_FINDINGS` (17–32). Add: with-status per-line → each `status` carried and a
  status-less row asserts `assert.ok(!('status' in f))`; JSON with-status → carried; JSON
  without → omitted; JSON `status: null` → omitted (mirror the existing `fix: null` test at
  163–172); **R10 deepEqual** of `with-status.json` vs `with-status.txt`; a
  **backward-compat anchor** re-running `EXPECTED_FINDINGS` on `array.json`/`per-line.txt`/
  `mixed-whitespace.txt` **plus** explicit `!('status' in result[0])`; disambiguation matrix
  (`INFO … ` → severity `INFO`, no status; `PROBE … ` without colon → severity `PROBE`, no
  status); a status-prefixed pathological line still rejects promptly (peel does not
  reintroduce backtracking); a JSON object with `status` **before** `fix` in input still
  serializes fix-then-status (key-order pin).
- `engine/test/normalize-findings-main.test.js` — constants at 37–39
  (`JSON_INPUT`/`LINE_INPUT`/`EXPECTED`). Add a status trio:
  `LINE_STATUS = 'RULED-OUT: HIGH a.js:3 — x | y'`,
  `JSON_STATUS = JSON.stringify([{ file:'a.js', line:3, severity:'HIGH', finding:'x', fix:'y', status:'RULED-OUT' }])`,
  `EXPECTED_STATUS = JSON.stringify([{ file:'a.js', line:3, severity:'HIGH', finding:'x', fix:'y', status:'RULED-OUT' }], null, 2) + '\n'`;
  assert both file-path inputs round-trip to the **byte-identical** `EXPECTED_STATUS`.
- `engine/test/normalize-findings-bin.test.js` — constants at 27–34. Add the same status
  trio; assert stdin JSON and per-line status inputs both emit byte-identical
  `EXPECTED_STATUS`, and that the emitted bytes contain `"status": "RULED-OUT"` after `"fix"`.
- `engine/test/source-hygiene.test.js` (unchanged) scans `engine/src/**` for
  `PROVENANCE_REF`; keep every new comment/identifier free of it (`STATUS_PREFIX_PATTERN`,
  `STATUS_*` names are fine; "R10" is fine — it is not a banned token).

### TDD steps

- **RED** — add `with-status.{txt,json}` and the new assertions above; run
  `npm --prefix engine test`. Failing reasons: `normalizeFindings` drops the leading
  `RULED-OUT:` token (per-line line fails `LINE_HEAD_PATTERN`, `parseLineShape` throws
  "Cannot parse findings"); JSON `status` never appears on the output (`toFinding` doesn't
  read it); the deepEqual/byte-exact CLI assertions mismatch (no `status` key emitted).
- **GREEN** — extend the typedef; add `STATUS_PREFIX_PATTERN`; peel in `parseLine`; attach
  `status` in `toFinding` (present-and-non-null, last key). Minimal — no JSON path edit
  beyond the `toFinding` destructure. Re-run: all green, existing tests unchanged in meaning.
- **REFACTOR** — confirm the peel is a single anchored regex (no nested quantifier); confirm
  key order is rebuilt in `toFinding` (not input-order-dependent); confirm no provenance
  token entered `findings.js`. Run `cd engine && npm run mutation` (Stryker over
  `engine/src/**`, Req 6) — the new branches (`STATUS_PREFIX_PATTERN` match/no-match; the
  `status != null` ternary) must have both arms killed by the present/absent/null tests; add
  a targeted case if a mutant survives.

### Gate

- Part gate: `npm --prefix engine test` (runs `engine/test/**/*.test.js`: findings,
  normalize-findings-main, normalize-findings-bin, source-hygiene).
- Mutation obligation (Req 6): `cd engine && npm run mutation` — new `findings.js` branches
  survive (no surviving mutant on the status peel / attach).
- Phase-boundary: `bash scripts/ci.sh`.

### Commit

`feat(engine): optional status field in the findings normalizer`

---

## Part 2 — Status semantics + bounded-state convention across the review contract, agent, skill, and living-corpus docs

### Context

Docs/prose-only — **no `src/` delta**. Delivers Findings 1 (consumer semantics + producer
docs) and 3 (bounded-state convention) across five files. It documents the schema Part 1
shipped; land Part 1 first. Files and exact edits:

1. **`contracts/harness-read.md`** (4 lines; the `harness-read` bundle injected into the
   review phase; `contracts-lint`-gated). Current line 2:
   `Structured findings: each finding reported as { file:line, severity: CRITICAL|HIGH|MEDIUM|LOW, finding, suggested fix }.`
   Extend the field set to `{ file:line, severity: CRITICAL|HIGH|MEDIUM|LOW, finding,
   suggested fix, status?: VERIFIED|SUSPECT|RULED-OUT|PROBE }` and add that `status` is
   optional — tag each finding's claim status, defaulting to the actionable case for a plain
   defect (Req 4). Current line 4 (fix-delta clause,
   `verify each prior finding's resolution and review the fix diff itself — do not re-read
   the full original diff.`): extend to name the **carried memory** as the bounded,
   status-tagged findings-state (not a growing transcript), and to carry `RULED-OUT` records
   forward with a do-not-re-raise-unless-reintroduced instruction (Finding 3 + ADR 280).
   **Constraint:** the file must not contain the substring "retrieval" (case-insensitive) —
   `contracts-lint` (`engine/src/contracts-lint-main.js`) rejects it.
2. **`agents/reviewer.md`** (contract bullets at lines 12–19; `model: opus`; final-message
   instruction at line 19). Add one contract bullet: tag each emitted finding with its claim
   `status` over `{VERIFIED, SUSPECT, RULED-OUT, PROBE}`, defaulting to the actionable case
   when reporting a plain defect (omit `status` when not deliberating) (Req 4). Prose-only
   (advisory prose-lint); no links.
3. **`skills/review/SKILL.md`** (Procedure steps at lines 39–56). Three edits (ADR 279, 280,
   282):
   - **Step 2** (normalize, 39–42): note the canonical `Finding` now carries an optional
     `status` — `{file, line, severity, finding, fix?, status?}` — keyed on the field, never
     on layout.
   - **Step 3** (fixes, 43–46): define the **actionable set** = `status ∈ {absent, VERIFIED,
     SUSPECT, PROBE}` (the session engages them exactly as today); **`RULED-OUT` is
     record-only** — written to the run record as "examined, not a defect" and dropped from
     the fix set (ADR 279).
   - **Step 4** (converge, 47–56): the stop-rule (`low-only` / `non-low-count<=<n>`) counts
     only **actionable** MEDIUM+ findings — `RULED-OUT` records never block convergence;
     carry `RULED-OUT` records inside the existing prior-findings payload the fix-delta
     reviewer already receives, labelled, with "do not re-raise a RULED-OUT claim unless the
     fix diff reintroduces the condition" (ADR 280); and name the threaded payload as a
     **bounded, status-tagged findings-state (never an accumulated transcript)** — the one
     sentence Findings 1 and 3 share (ADR 282).
4. **`docs/DESIGN-customizable-engine.md`** (living-corpus, intention-lint-gated). Line 366,
   the `harness-read` bundle-table row (`structured findings {file:line, severity, finding,
   fix}`): add `status?`. The R10 note (lines 401–411, "pins a canonical field set… keys on
   the fields"): extend the pinned harness-read field set to include `status` so R10
   interchangeability covers it. Body edits only — this file has **no `subjects` frontmatter**
   (checked: none present), so intention-lint's frontmatter check is unaffected.
5. **`docs/GUIDE-concepts.md`** (living-corpus, intention-lint-gated). Frame 1 (lines 25–65):
   the mapping table at 52–58 has a "State on disk, not in the model" row. Add a first-class
   sibling row/prose for the **bounded-state threading convention**: a multi-round
   intra-phase loop threads a bounded structured state — the normalized, status-tagged
   `Finding[]` plus the fix diff — never an accumulated transcript; ground it in the B-vs-C
   ~31%-fewer-output-tokens result with the honest n=1/one-diff **directional** caveat; owning
   doc/key → `skills/review` + `contracts/harness-read.md`. Any new relative link must
   resolve on this branch (lychee). No `subjects` frontmatter present here either.

**Gate mechanics to pre-pay in-part** (so nothing surfaces at the phase boundary):
`node --test 'test/**/*.test.js'` runs `test/intention-lint-ci.test.js`, which enumerates the
living corpus (`scripts/living-corpus.sh` → includes `DESIGN-*.md`, `GUIDE-concepts.md`) and
runs `engine/bin/intention-lint.js` over it — so the DESIGN + concepts edits are covered by
the part gate. `contracts-lint`, `docs-structure-lint`, prose-lint and lychee are **not**
run by `node --test`; run them locally before committing (commands below).

### TDD steps

- **RED** (executable expectations for prose): `grep -i 'status' contracts/harness-read.md`
  → no match; `grep -n 'RULED-OUT\|actionable' skills/review/SKILL.md` → no match;
  `grep -n 'status' docs/DESIGN-customizable-engine.md` line 366 lacks it; Frame 1 has no
  bounded-state convention row. These are the gaps the edits close.
- **GREEN** — apply the five edits above. Verify: `node engine/bin/contracts-lint.js contracts`
  exits 0 (`harness-read` still valid, no "retrieval"); `node --test test/intention-lint-ci.test.js`
  prints `craft-intention: OK`; lychee resolves every relative link/fragment in the touched
  docs.
- **REFACTOR** — consistency pass across all five files: identical `status` vocabulary
  spelling `{VERIFIED, SUSPECT, RULED-OUT, PROBE}`; identical bounded-state framing between
  the SKILL.md step-4 sentence, the harness-read fix-delta clause, and the concepts row; the
  n=1 directional caveat present wherever the empirical result is cited; no provenance token
  in the contract/agent/skill (docs may name SP9/ADRs; the agent + contract stay
  provenance-free by habit).

### Gate

- Part gate: `node --test 'test/**/*.test.js'` (includes `intention-lint-ci` over the living
  corpus → DESIGN + concepts edits).
- `node engine/bin/contracts-lint.js contracts` (harness-read stays valid).
- `bash scripts/docs-structure-lint.sh docs`.
- `lychee --offline --include-fragments --no-progress --exclude-path engine/node_modules './**/*.md'`
  (or, if lychee is unavailable locally, verify each new relative link + `#fragment` target
  exists on-branch by hand).
- prose-lint (advisory) on each touched `.md`:
  `node engine/bin/prose-lint.js --gate advisory --waiver-source <f> -- <f>`.
- Phase-boundary: `bash scripts/ci.sh`.

### Commit

`feat(review): status-tagged findings semantics and bounded-state threading convention`

---

## Part 3 — Deliberation-review methodology declination in the examples catalog

### Context

Docs/example-only — **no `src/` delta**. Independent of Parts 1–2; lands last on the shared
tree. Ports the spike prototype into a stable, opt-in catalog example (ADR 281, Finding 2).
Files:

1. **`examples/deliberation-review/workflow.md`** (NEW). Port the body from
   `spike/recursivemas:examples/deliberation-review/workflow.md` (retrieve with
   `git show --no-ext-diff spike/recursivemas:examples/deliberation-review/workflow.md` — the
   `--no-ext-diff` flag is mandatory here). **De-spike per ADR 281 / Req 7–9:**
   - Frontmatter manifest: keep the shape `phases.review.role: deliberation-reviewer` +
     `phases.review.harness: { dimensions: [...], max_cycles: 2 }` (identical to
     `examples/review-harness/` and `examples/role-swap/`, both manifest-lint-valid — the
     linter only checks `phases.<id>.role` is a string). Express the **high-stakes-dimension**
     use by narrowing `dimensions` to a single costly lens — the design suggests `[security]`
     (the spike used `[code]`); either is manifest-valid. State in prose that `role:` swaps
     the **whole** review phase (not one dimension), so narrowing `dimensions` is how you
     scope deliberation to the costly lens — no per-dimension mixing within one phase (Req 9;
     Out-of-scope §2).
   - Recast the frontmatter comment and the "Status: spike prototype (SP9)" heading as a
     **stable methodology declination** (not a spike artifact). Keep the empirical A/B/C table
     **with its honest caveat** (n=1, one synthetic diff, directional) and cite the probe date
     (2026-07-25) as prose provenance.
   - **Relink** (Req 7 — must resolve on THIS branch, lychee-clean): the spike links
     `docs/archive/SPIKE.md` as the "full method" home; on this branch SPIKE.md has no SP9
     section, so a deep `#fragment` there would dangle. Point the method/matrix reference at
     the durable home `../../docs/design/sp9-findings-adoption.md` instead — **link the file
     (no `#fragment`)** unless a heading slug is verified to exist. The
     `https://github.com/RecursiveMAS/RecursiveMAS` external URL may stay (lychee `--offline`
     does not check it). The `.claude/agents/deliberation-reviewer.md` save-path stays inside
     the fenced agent block / inline code (not a markdown link — not lychee-checked).
   - Keep the agent body **fenced in the prose** with the "save to `.claude/agents/…`"
     instruction (house style ships no live opt-in agent) and keep `model: opus` in the
     fenced frontmatter (ADR 281). Keep the G5 note (engine still injects the `harness-read`
     contract around the swapped role). Present the example as **opt-in, ~2× cost for depth,
     explicitly NOT a default** (Req 8). Optional cross-link: the `REFINED-STATE` status
     tokens are the same set the normalized `Finding.status` now carries (ties to Part 1).
2. **`examples/README.md`** (index; lychee-gated; prose-lint advisory). Add the example under
   the **"Integrating external skill collections → Methodology"** section (the natural anchor
   — this is a methodology declination that *does* land, unlike the Superpowers peer row).
   Link `[deliberation-review/](deliberation-review/)`; label it opt-in, ~2× cost, not a
   default; note it wires via the existing `role:` (#10) + `harness:` (#6) points and adds
   **no new injection point** (Req 9).
3. **`docs/GUIDE-customizing.md`** §4 examples index (table at lines 362–376; living-corpus,
   intention-lint-gated; lychee-gated). Add an **unnumbered** row (like the "enable a
   default-off phase" row — it is NOT a numbered injection point, Req 9):
   `| methodology declination (opt-in) | [deliberation-review/](../examples/deliberation-review/) | per-phase role swap for a high-stakes review lens; ~2× cost, not a default |`.
   Body edit only — no `subjects` frontmatter present (checked).
4. **`test/examples-deliberation-review.test.js`** (NEW; test-infra, no `src/` delta —
   folded into this part). Mirror `test/examples-github-adapter.test.js`: assert
   `examples/deliberation-review/workflow.md` exists; `bash scripts/manifest-lint.sh <workflow>`
   output includes `valid.`; `examples/README.md` includes the string `deliberation-review`.
   (`test/examples-lint.test.js` already **auto-covers** the new manifest via its directory
   scan — this dedicated test pins presence + the index entry for a clean RED→GREEN.)

### TDD steps

- **RED** — add `test/examples-deliberation-review.test.js`; run
  `node --test test/examples-deliberation-review.test.js`. Failing reasons: `workflow.md`
  does not exist (ENOENT); `examples/README.md` lacks `deliberation-review`. Also
  `test/examples-lint.test.js` would fail once the directory exists with an as-yet-absent or
  invalid manifest.
- **GREEN** — create the de-spiked, relinked `workflow.md`; add the `examples/README.md`
  Methodology entry and the `docs/GUIDE-customizing.md` §4 row. Re-run
  `node --test 'test/**/*.test.js'` — `examples-lint` (manifest valid), the new presence
  test, and `intention-lint-ci` (GUIDE-customizing) all green.
- **REFACTOR** — read the ported file end to end for spike residue (no "spike"/"SP9-only"
  framing left as status; the empirical caveat intact); confirm every relative link +
  fragment resolves on this branch with lychee; confirm the "not a default / ~2× cost /
  no new injection point / whole-phase swap" framing appears in all three surfaces.

### Gate

- Part gate: `node --test 'test/**/*.test.js'` (includes `examples-lint` auto-covering the
  new manifest, the new `examples-deliberation-review` presence test, and `intention-lint-ci`
  for GUIDE-customizing).
- `bash scripts/docs-structure-lint.sh docs`.
- `lychee --offline --include-fragments --no-progress --exclude-path engine/node_modules './**/*.md'`
  (the acceptance check for "no spike-only links"; or verify each target on-branch by hand
  if lychee is unavailable).
- prose-lint (advisory) on the touched `.md`:
  `node engine/bin/prose-lint.js --gate advisory --waiver-source <f> -- <f>`.
- Phase-boundary: `bash scripts/ci.sh`.

### Commit

`docs(examples): add deliberation-review methodology declination`
