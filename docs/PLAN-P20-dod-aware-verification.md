# Plan — Definition-of-Done artifact + DoD-aware verification (P20)

> Source: design doc `docs/DESIGN-P20-dod-aware-verification.md` · ADRs `104, 105, 106, 107, 108, 109, 110`
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

### P20-specific scope facts (read once, applies to every part)

- **The ONLY `src/` delta is Part 1** (`engine/src/manifest.js`). Parts 2–3 are skill
  prose; Parts 4–5 are docs + a docs guard. No new descriptor, contract bundle, gate,
  resolver path, or `awaitingHarnesses` entry (ADR-104 folds into existing `validation`;
  Out-of-scope in the design). Do not touch `pipeline/default.yml`, `engine/src/gates.js`,
  `contracts/`, `skills/documentation/SKILL.md`, or `skills/propose/SKILL.md`.
- **Phase-boundary gate = `bash scripts/ci.sh`** (this repo has no manifest, so the engine
  probes defaults; `gates.phase` is the substrate gate `scripts/ci.sh`). It runs, in order:
  `cd engine && node --test 'test/**/*.test.js'` with a hard `EXPECTED_TESTS=699`
  count-drift check; `cd adapters/pi && node --test …` with `EXPECTED_PI_TESTS=202`;
  `bats test/`; `shellcheck scripts/*.sh hooks/*.sh`; `node engine/bin/pipeline-lint.js
  pipeline/default.yml`; `node engine/bin/pipeline-resolve.js pipeline/default.yml`;
  `node engine/bin/contracts-lint.js contracts`.
- **EXPECTED_TESTS bump rule:** any part that adds engine `node --test` cases MUST update
  `EXPECTED_TESTS` in `scripts/ci.sh` in the SAME commit, or `ci.sh` fails on count drift.
  Only Part 1 adds engine tests (current count: `# tests 699`; Part 1 adds 4 → 703).
  No part touches `adapters/pi`, so `EXPECTED_PI_TESTS` stays 202. **`bats test/` has NO
  count gate** — adding a new bats file (Part 5) needs no count bump.
- **Ordering keeps CI green at every commit.** Parts 1–3 leave `bash scripts/ci.sh` green
  on their own. Part 5 (a bats guard that asserts `docs/DOD.md` exists) MUST land after
  Part 4 (which authors `docs/DOD.md`) — never before. Sequential parts share one
  working tree and build on each other.

## Part 1 — manifest-lint validates `paths.dod` file-ref (ADR-110)

### Context

The single `src/` delta of P20. Today `paths` is a recognized-but-inert top-level key.

- File: `engine/src/manifest.js`.
  - `TOP_KEYS` (line 13): already includes `'paths'` — **no change** to the key set.
  - The dispatch `switch (key)` in `validateManifest` (lines 603–632): every recognized
    sub-validated key has a `case`; `paths`/`retrieval`/`execution` fall through the
    terminal comment `// paths, retrieval, execution: recognized; no sub-validation`
    (line 631). **Add a `case 'paths':` before that comment**, calling a new
    `validatePaths(value, fileExists, errors)` helper; leave the comment covering
    `retrieval, execution` only.
  - Existing helper `checkFileRef(label, value, fileExists, errors)` (lines 91–99) — the
    exact symbol to reuse. Signature: `label` (string for the error message), `value`
    (string | string[] | absent-sentinel), `fileExists` (injected predicate), `errors`
    (accumulator array). It already (a) returns early for absent sentinels via
    `isAbsentPath` (`null`/`undefined`/`''`/`'~'`, lines 68–70) and (b) pushes
    `` `${label} references missing file: ${path}` `` on a miss (line 96). So
    `checkFileRef('paths.dod', value.dod, fileExists, errors)` gives the exact required
    message `paths.dod references missing file: <path>` for free, and absent `paths.dod`
    passes with no special-casing.
  - Mirror the shape of `validateScripts(scripts, fileExists, errors)` (lines 152–160) but
    **only** for the `dod` key: iterate nothing else, raise no "unknown key" errors (the
    `paths.*` family stays reserved-but-inert per ADR-110 — `paths.repo`, `paths.foo`, etc.
    are untouched). Guard the non-object case the same way `validateScripts` does
    (`if (!paths || typeof paths !== 'object' || Array.isArray(paths)) return;`). Read only
    `paths.dod` via `checkFileRef`; touch no other sub-key.
  - Callers of `checkFileRef` for precedent: `validateScripts` line 158
    (`checkFileRef(\`scripts.${key}\`, value, …)`), `case 'context'` line 608
    (`checkFileRef('context', value, …)`). Same call convention.
- Test file: `engine/test/manifest.test.js` (node:test; G/W/T titles, AAA bodies, `sut`
  variable). Helpers already at the top: `ALWAYS_EXISTS = () => true` and
  `NEVER_EXISTS = () => false` (lines 10–11). The file imports `{ validateManifest }`
  from `../src/manifest.js` (line 8).
  - Add a new section after the scripts block (which ends at line 331), header style
    `// ─── paths.dod validation ─────`. The scripts file-ref tests at lines 284–331 are
    the precise pattern to copy (assert via
    `result.errors.some(e => e.includes('references missing file'))` for the failure case
    and `assert.deepEqual(result, { ok: true, errors: [] })` for the pass case).
  - Regression-guard fact: the comprehensive "all known top-level keys" fixture (lines
    50–69) uses `paths: { repo: '.' }` under `ALWAYS_EXISTS` and asserts `ok: true`. The
    new `validatePaths` must keep that green (it only ever reads `dod`). The inert
    regression test below proves it under `NEVER_EXISTS` so `paths.repo`/`paths.foo`
    can't be made to error.
- Gate file: `scripts/ci.sh` — `EXPECTED_TESTS=699` (line ~12). This part adds **exactly
  4** engine tests, so the literal becomes **703** (699 + 4). Update it in the same commit.
  Confirmed current count: `cd engine && node --test 'test/**/*.test.js'` prints
  `# tests 699`.
- **Test-location pin (deliberate):** unit coverage goes in `engine/test/manifest.test.js`
  (the design's "MECHANICAL `engine/test/` manifest-lint cases", §Test strategy), NOT in
  `test/manifest-lint.bats`. The bats suite is fixture-driven (`load helpers/manifest-lint`,
  `run_lint "${FIXTURES}/…"`); the unit suite is the direct `validateManifest` surface and
  matches the `scripts:`/`context:` file-ref precedent. No bats fixture is added — the
  mechanical requirement is fully met by the unit cases, and this keeps the part tight.

### TDD steps

- **The true RED is RED 2** (declared + missing must fail) — it is the only case that fails
  before the impl and is what drives the production change. RED 1/3/4 are deepEqual/behaviour
  locks that pass on arrival (because `paths` is inert today) and exist to pin the pass-path
  and inertness the change must NOT regress; they are not no-op tests (each asserts a
  distinct, load-bearing invariant of the new `validatePaths`).
- RED 1 — *declared + present passes*: add test "Given a manifest with `paths.dod`
  pointing to an existing file, when validateManifest runs, then it returns ok"
  (`sut({ paths: { dod: 'docs/DOD.md' } }, { fileExists: ALWAYS_EXISTS })`, assert
  `deepEqual(result, { ok: true, errors: [] })`). Fails today: `paths` is inert so this
  already returns ok — **this case is GREEN-on-arrival and is the lock that proves we did
  not regress the pass path**; keep it (a deepEqual lock, not a no-op test).
- RED 2 — *declared + missing fails with the exact message*: add test "Given a manifest
  with `paths.dod` pointing to a missing file, when validateManifest runs, then it returns
  an error `paths.dod references missing file`" (`sut({ paths: { dod: 'docs/DOD.md' } },
  { fileExists: NEVER_EXISTS })`, assert `result.ok === false` and
  `result.errors.some(e => e === 'paths.dod references missing file: docs/DOD.md')`).
  Expected failure NOW: `result.ok` is `true` (inert fall-through), no error pushed.
- RED 3 — *absent `paths.dod` passes*: add test "Given a manifest with `paths` but no
  `dod` key, when validateManifest runs, then it returns ok"
  (`sut({ paths: { repo: '.' } }, { fileExists: NEVER_EXISTS })`, assert
  `deepEqual(result, { ok: true, errors: [] })`). GREEN-on-arrival lock — proves absence
  is not a lint error (ADR-110) even when nothing exists on disk.
- RED 4 — *non-`dod` `paths.*` stays inert (regression)*: add test "Given a manifest with
  a non-dod `paths` key, when validateManifest runs, then it stays inert and returns ok"
  (`sut({ paths: { foo: 'nope/missing.txt' } }, { fileExists: NEVER_EXISTS })`, assert
  `deepEqual(result, { ok: true, errors: [] })`). Expected failure ONLY if the impl
  over-reaches and validates keys other than `dod`; under the correct impl it is green.
- GREEN — in `engine/src/manifest.js`: add `validatePaths(paths, fileExists, errors)`
  (guard non-object → return; `checkFileRef('paths.dod', paths.dod, fileExists, errors)`;
  read no other key). Wire `case 'paths': validatePaths(value, fileExists, errors); break;`
  immediately above the `// retrieval, execution: recognized; no sub-validation` comment
  (trim `paths,` out of that comment). Re-run the 4 tests → all green.
- GREEN (gate count) — set `EXPECTED_TESTS=703` in `scripts/ci.sh` (699 + 4 new tests).
- REFACTOR — confirm `validatePaths` carries a JSDoc block matching `validateScripts`'s
  style (`@param` lines); confirm no magic strings beyond the `'paths.dod'` label;
  confirm the comprehensive-keys fixture (lines 50–69) still asserts `ok: true`.

### Gate

- Targeted (part): `cd engine && node --test 'test/**/*.test.js'` (asserts the 4 new
  cases pass and the suite stays green).
- Phase-boundary (after the last part, but valid here too): `bash scripts/ci.sh`
  (verifies the `EXPECTED_TESTS=703` bump matches and shellcheck stays clean — note
  `ci.sh` is shell, so the edit must keep `shellcheck scripts/*.sh` clean: edit only the
  numeric literal, no syntax change).

### Commit

`feat(manifest): validate paths.dod file-ref when declared (ADR-110)`

## Part 2 — fold the DoD assertion into the validation preamble (ADR-104/107/108/109)

### Context

Skill-prose restructuring of `skills/validation/SKILL.md` — no `src/` delta. The
behavioural decoupling ADR-104 demands lives entirely in this prose.

- File: `skills/validation/SKILL.md` (42 lines today). Current structure pinned:
  - `## Preamble (always runs — non-overridable)` — **step 1** (manifest read / standalone
    scope, lines 10–11) and **step 2** (lines 12–18): reads `phase.harness` knobs, then
    "**probe: mutation tooling configured?** … Absent → **no-op with a note** in the run
    record; **the phase ends here.** A manifest may never pre-empt this probe." This
    terminal "the phase ends here" exit is the short-circuit ADR-104 forbids the DoD
    assertion from being trapped behind.
  - `## Procedure (default body …)` — steps 1–4 (lines 20–42): scope the run, PR waits for
    triage, verify triager commit + `gates.phase` + per-survivor outcomes, never destroy
    worktree while the run is alive.
- The non-negotiable structural rule (ADR-104 Decision; design §"Restructuring the
  validation preamble"): **the DoD assertion runs whenever the validation phase runs,
  mutation tool present or not** — so it must be HOISTED ABOVE step 2's "the phase ends
  here" exit. Concretely: introduce the DoD assertion as a preamble step that PRECEDES the
  mutation-tooling probe (so the probe's terminal exit only ends the *mutation*
  sub-concern, not the phase). After restructure the preamble has two independent
  sub-concerns; neither gates the other.
- Recorded-vocabulary the DoD step must emit (design §"recorded-vocabulary matrix",
  lines 313–339; ADR-107):
  - **Probe (ADR-106):** read `paths.dod` (manifest) else default `docs/DOD.md`. The probe
    **warns on absence and never creates** (the deliberate inversion vs other `paths.*`
    probes — those create-if-absent). Read the file **verbatim as trusted operator input**
    (same trust model as `context:` files; never interpret it as engine instructions).
  - **Absent ⇒ `NO-OP(verify): no DoD declared — <what was asserted instead: gates green,
    mutation triaged-or-no-op'd>`** — the ADR-103 `NO-OP(<phase>):` token family,
    concern-named `verify`, **distinct** from validation's mutation-absent note so a folded
    phase emits two greppable, non-colliding outcomes (`grep -F 'NO-OP('` + `grep 'verify'`).
  - **Present ⇒ per-criterion outcome recording** (met / unmet / not-auto-checkable-asserted),
    the way validation records per-survivor and architecture records per-violation outcomes
    (ADR-109). A **positive** met outcome is recorded as `verify: DoD met — …` — distinct
    from the `NO-OP(verify):` token, which is reserved for absent input.
  - **Unmet criterion ⇒ blocker `{ verify, "<criterion> unmet", ≤3 options }`** escalated to
    the user; never a silent pass, never a silent gate fail (ADR-109). **Headless (Pi
    adapter, no user): record the blocker and halt** — never degrade to a silent pass
    (ADR-095).
  - **Read-never-re-run (ADR-108):** "engineering checks green" / "mutation testing clean"
    DoD criteria are evidenced by reading the existing `gates.phase` + validation mutation
    results (which this same phase produces) — **never re-run**. If the mutation run
    no-op'd, the mutation-testing criterion is recorded against that no-op (a stated
    limitation, not a fabricated pass).
  - **DoD subsumes (1) + honest gap-note (ADR-108):** architecture-alignment is a DoD
    criterion the repo writes. When `architecture` ran enabled+green, its gate is the
    mechanical evidence; when OFF/no-op'd, the criterion is asserted on the DoD's terms;
    when **no DoD exists at all**, pair the `NO-OP(verify): no DoD declared` line with an
    honest gap-note — *the architecture boundary check did not run* — **never fabricate
    alignment**.
- **Gate satisfaction vs release (the subtlety the fold introduces, design lines 328–339):**
  `validation` keeps its SINGLE propose-gate entry (one phase, one entry). It is
  **satisfied** when a mutation run lands and triages green; it is **released** (ADR-082)
  only when the phase records a runtime no-op landing *no* run. A `NO-OP(verify): no DoD
  declared` line is the DoD sub-concern's recorded outcome — it never *blocks* propose, and
  it only *drives* release in the case where the mutation sub-concern ALSO no-op'd. The
  prose here must NOT claim the verify no-op releases the gate on its own. (The matching
  run-skill gate-release wording is Part 3 — keep the two consistent.)
- House-style anchor: the no-op token family + carry-to-PR-body model is P19
  (`docs/DESIGN-P19-noop-first-class-phase-outcome.md`); reuse the exact `NO-OP(<phase>):`
  shape, do not invent a new severity channel.
- Mechanical proof target (design §Test strategy, "Validation-skill prose verification …
  MECHANICAL"): the restructured file must contain, in textual order, the DoD probe step
  BEFORE the mutation "the phase ends here" exit; a `verify: DoD met` outcome; a
  `NO-OP(verify):` absent-DoD line distinct from the mutation note. There is NO automated
  prose-grep test harness in this repo for skill bodies, so the gate for this part is the
  substrate gate plus a self-verified `grep` checklist (below) — no new test file is added
  (adding one would be a standalone prose-only artifact the design does not call for here;
  the `docs/DOD.md` existence guard in Part 5 is the only new mechanical guard P20 adds).

### TDD steps

- RED (self-verified grep checklist — the mechanical assertions the restructured prose must
  satisfy; run each `grep` against `skills/validation/SKILL.md` and confirm it was failing
  before the edit):
  - `grep -n 'docs/DOD.md' skills/validation/SKILL.md` → matches (probe default path
    present). Fails before edit.
  - `grep -n 'NO-OP(verify):' skills/validation/SKILL.md` → matches (concern-named
    absent-DoD token). Fails before edit.
  - `grep -n 'verify: DoD met' skills/validation/SKILL.md` → matches (positive recorded
    outcome). Fails before edit.
  - Ordering assertion: the line number of the DoD probe step is LESS THAN the line number
    of "the phase ends here" — i.e. the DoD step is hoisted above the mutation terminal
    exit. Verify by reading the two line numbers; fails before edit (no DoD step exists).
  - `grep -n 'paths.dod' skills/validation/SKILL.md` → matches (manifest override key named
    alongside the default). Fails before edit.
- GREEN — restructure the `## Preamble` so the DoD assertion is a step that runs before the
  mutation-tooling probe's "the phase ends here" exit. Encode: the probe (`paths.dod` else
  `docs/DOD.md`; warn-on-absence, never create; read verbatim); the absent ⇒
  `NO-OP(verify): no DoD declared — …` outcome; the present ⇒ per-criterion recording with
  `verify: DoD met — …` positive token; unmet ⇒ blocker `{ verify, … , ≤3 options }`
  (headless ⇒ record + halt, ADR-095); read-never-re-run of gate/mutation results; DoD
  subsumes (1) with the honest arch gap-note fallback when no DoD exists. Keep the existing
  mutation probe + Procedure steps 1–4 intact and unmodified except for being repositioned
  below the DoD step (the mutation "the phase ends here" now ends only the mutation
  sub-concern). Do NOT add a `consumes`/`produces` edit anywhere; the DoD is a probe input,
  not a pipeline artifact.
- REFACTOR — re-read the whole file: confirm the two sub-concerns are visibly independent
  (neither nested inside the other's terminal branch); confirm no provenance refs leak as
  engine instructions (ADR/phase numbers are fine in prose context but the tokens must be
  the bare `NO-OP(verify):` / `verify:` forms); confirm the gate satisfaction-vs-release
  wording matches Part 3.

### Gate

- Targeted (part): the self-verified grep checklist above (all five assertions pass), read
  back against `skills/validation/SKILL.md`.
- Phase-boundary: `bash scripts/ci.sh` (prose edit to a `.md` under `skills/` changes no
  executable surface; ci must stay green — confirms no accidental shell/test/pipeline
  breakage).

### Commit

`feat(validation): fold DoD-met assertion into the preamble, decoupled from the mutation no-op (ADR-104)`

## Part 3 — name the validation `NO-OP(verify):` sub-outcome in the run no-op vocabulary (ADR-107)

### Context

Skill-prose only — extend `skills/run/SKILL.md`'s no-op/release vocabulary so a
`validation`-recorded `NO-OP(verify):` is a named, non-gap terminal sub-outcome and the
existing gate-release clause is confirmed to cover it without change in behaviour. No `src/`
delta, no `gates.js` edit (ADR-104: no new gate entry).

- File: `skills/run/SKILL.md`. Pinned anchors:
  - **§Walk step 6 — "Record outcome"** (lines 187–192): names the judgment-phase no-op
    vocabulary — `NO-OP(decisions): …` and `NO-OP(refactoring): …` — and states such a line
    "has produced its outcome; it is NOT a missing artifact and never re-runs or escalates
    as a gap." This is where the `validation`-emitted `NO-OP(verify):` sub-outcome should be
    NAMED as the same kind of first-class, non-gap terminal outcome (so a reader greps
    `NO-OP(` and understands the verify line is intentional, not a failure).
  - **§Cross-phase invariants — runtime-no-op release clause** (lines 229–237): "if an
    awaited executing-harness **records a runtime no-op** … never landing a run — its
    `awaitingHarnesses` entry is released, symmetric to the skip-waiver." This is the clause
    that governs `validation`'s gate release. The P20 subtlety (design lines 328–339): the
    `validation` entry now carries TWO recorded sub-outcomes (mutation note + verify
    outcome), but the release condition is **unchanged** — the entry releases ONLY when **no
    run lands** (mutation sub-concern no-op'd); a landed mutation run **satisfies** the
    single gate entry directly, and a `NO-OP(verify):` line riding alongside a landed run is
    a recorded note that does NOT independently release or block the gate.
  - **§0 step 1e — waivers** (lines 59–66) and **§1c — seed the run record** (lines 49–51):
    background on how `proposeGateReleased`/`waivers[]` and recorded outcomes flow into the
    ledger and PR body (ADR-102 carry). No edit needed here — context only.
- Decision (edit-vs-coverage-check, per the design's scope item): the judgment-phase no-op
  list at step 6 does NOT today name `verify`, so a **minimal edit** is warranted to add it
  to the named vocabulary; the release clause at 229–237 already covers the mechanics, so it
  gets a **one-clause clarification** (validation carries two sub-outcomes; release condition
  unchanged) — NOT a behavioural change. Do not add any new `awaitingHarnesses` expectation
  or gate entry.
- Out of scope here: `gates.js`, `pipeline/default.yml`, `skills/propose/SKILL.md` (its
  cross-phase invariant step 2 already covers the gate verbatim — design §Test strategy
  "Cross-phase invariant unchanged"), `skills/documentation/SKILL.md`.

### TDD steps

- RED (self-verified grep checklist against `skills/run/SKILL.md`, confirmed failing
  before the edit):
  - `grep -n 'NO-OP(verify)' skills/run/SKILL.md` → matches (the verify sub-outcome is named
    in the run vocabulary). Fails before edit.
  - Confirm the addition sits in the step-6 no-op vocabulary neighbourhood (lines ~187–192)
    alongside `NO-OP(decisions)`/`NO-OP(refactoring)` — read back the surrounding lines to
    confirm it is named as a non-gap terminal outcome, not as a gap/failure.
  - Confirm the runtime-no-op release clause (lines ~229–237) gained the
    "validation carries two recorded sub-outcomes; the entry releases only when no run
    lands" clarification, and that it does NOT assert the verify no-op releases the gate on
    its own (consistency with Part 2's satisfaction-vs-release wording).
- GREEN — minimal prose edits:
  1. In §Walk step 6, add `NO-OP(verify): no DoD declared — …` to the named first-class
     no-op vocabulary (the `validation` phase's DoD sub-concern), stated as "produced its
     outcome; NOT a missing artifact; never re-runs or escalates as a gap" — same framing as
     the existing entries.
  2. In the runtime-no-op release clause (229–237), add one clause: the `validation` entry
     may carry two recorded sub-outcomes (the mutation note AND a `NO-OP(verify):` line);
     the entry is **released** only when no mutation run lands, and is **satisfied** by a
     landed+triaged run regardless of the verify line — the verify no-op never independently
     blocks or releases the single gate entry.
- REFACTOR — re-read both edited regions; confirm wording is consistent with Part 2's
  matrix; confirm `grep -F 'NO-OP('` semantics still hold (one grep finds every no-op
  including the new verify one); confirm no new severity channel or gate entry was
  introduced.

### Gate

- Targeted (part): the self-verified grep checklist above against `skills/run/SKILL.md`.
- Phase-boundary: `bash scripts/ci.sh` (prose edit to a `.md`; no executable surface
  changes; ci stays green).

### Commit

`feat(run): name the validation NO-OP(verify) sub-outcome in the no-op vocabulary (ADR-107)`

## Part 4 — author this repo's own `docs/DOD.md` (ADR-105/108/109) — docs-only

### Context

Docs-only part (no `src/` delta), legitimately standalone. Because the DoD check is
default-ON (ADR-105) and folds into the always-enabled `validation` phase (ADR-104), this
repo's own craft runs would otherwise record `NO-OP(verify): no DoD declared` on every run.
Authoring `docs/DOD.md` at the **default probe path** makes those runs clean.

- New file: `docs/DOD.md`. **Default probe path is correct** — this repo has NO manifest
  (no `.craft/workflow.md` / `.claude/workflow.md`; confirmed absent), so the validation
  probe falls back to `docs/DOD.md` (ADR-106). Do NOT create a manifest.
- Shape (ADR-109): a **free-text markdown checklist** of acceptance-criteria lines, read
  verbatim. No schema, no fences, no parser. Markdown checkbox lines (`- [ ] …`).
- Required content (design §"The concrete deliverable — this repo's own docs/DOD.md",
  lines 288–306; ADR-105/108/109):
  - **Mutation testing** line — survivors all triaged (killed or proven equivalent) +
    mutation-score / per-hunk-survivors-triaged language. **This line is mandatory** — it is
    the concrete instance of a DoD subsuming engineering-check (2), and Part 5's guard
    asserts a mutation-testing line is present.
  - **Gates green** line — `gates.phase` passes; nothing committed on red.
  - **Architecture boundaries** line — stated explicitly **N/A** for this repo (the
    `architecture` phase ships `enabled: false` in `pipeline/default.yml`), so the gap is
    *stated, not silently claimed* (ADR-108 honest-gap discipline). Do not claim alignment.
  - **P20 feature-acceptance criteria** — verifiable acceptance lines for this very change,
    e.g.: the DoD assertion runs independently of the mutation no-op; `NO-OP(verify):` is
    distinct from the mutation note; `paths.dod` file-ref is validated when declared;
    per-criterion outcomes are recorded; an unmet criterion is a blocker.
- Provenance note (design lines 308–311): a docs artifact MAY carry P20/ADR references in
  its prose (like the design doc itself); the no-provenance-in-source/test rule does not
  bind this markdown checklist. Keep it readable, not a spec dump.
- House-style: a markdown checklist; sibling docs live FLAT at `docs/` — place it at
  `docs/DOD.md` exactly.

### TDD steps

- RED — the guard that fails on this file's absence is authored in Part 5; for this
  docs-only part the "test" is the design's content contract verified by reading the file
  back: `test -f docs/DOD.md` is false before this part; after authoring, the file exists,
  is a non-empty markdown checklist, and contains a mutation-testing line
  (`grep -i 'mutation' docs/DOD.md` matches). Confirm each was failing before the write.
- GREEN — write `docs/DOD.md` with the four content blocks above (mutation testing; gates
  green; architecture boundaries N/A with the gap stated; P20 feature-acceptance criteria),
  as `- [ ]`/`- [x]` checklist lines under short headings.
- REFACTOR — re-read: confirm the architecture line is an explicit N/A (no fabricated
  alignment); confirm the mutation line is present and unambiguous (Part 5 greps for it);
  confirm it is free-text (no schema/fences) and self-contained.

### Gate

- Targeted (part): `test -f docs/DOD.md && grep -qi 'mutation' docs/DOD.md` (the file
  exists and carries a mutation-testing line).
- Phase-boundary: `bash scripts/ci.sh` (adding a docs file changes no executable surface;
  ci stays green — note Part 5's guard is not yet present, so ci is green here regardless).

### Commit

`docs(dod): author this repo's own DoD checklist at the default probe path (ADR-105)`

## Part 5 — guard that `docs/DOD.md` exists and is a non-empty checklist with a mutation line (ADR-105) — test-infra

### Context

Test-infra-only part (no `src/` delta), legitimately standalone. Adds a structure guard so
this repo's default-ON DoD probe can never silently regress to `NO-OP(verify): no DoD
declared` — the guard fails CI if `docs/DOD.md` is deleted, emptied, or loses its
mutation-testing line. MUST land after Part 4 (the file it guards must already exist).

- New file: `test/p20-dod.bats` (new bats file; gated by `bats test/` in `scripts/ci.sh`).
  **`bats test/` has NO count gate** — no `EXPECTED_TESTS` change, no `scripts/ci.sh` edit.
- Precedent to mirror exactly: `test/p10-structure.bats` — the repo's structure-guard
  pattern. It opens with
  `ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"`, then `@test "Given … checked, exists" {
  [ -f "${ROOT}/<path>" ] }` and `grep -qx '<heading>' "${ROOT}/<file>"` assertions. Copy
  that idiom (the `ROOT` resolution, the `[ -f … ]` existence check, the `grep -q`
  content check).
- Guard assertions (design §Test strategy "`docs/DOD.md` exists in the repo (ADR-105),
  MECHANICAL"): assert `docs/DOD.md` (a) exists, (b) is non-empty, (c) is a markdown
  checklist (contains at least one `- [ ]` or `- [x]` line), and (d) includes a
  mutation-testing line. Keep each as a separate `@test` for clear failure attribution.
- shellcheck note: bats files are NOT linted by `shellcheck scripts/*.sh hooks/*.sh` (only
  `scripts/` and `hooks/` shell), so no shellcheck concern for `test/p20-dod.bats`.

### TDD steps

- RED — author `test/p20-dod.bats` with the four `@test` cases below; run
  `bats test/p20-dod.bats`. To prove the guard bites, RED is demonstrated by reasoning the
  guard against an absent/empty/mutation-less `docs/DOD.md` (the Part-4 file satisfies it,
  so the guard is GREEN once both land — the RED demonstration is: temporarily point one
  assertion at a non-existent path in a `mktemp` scratch copy, confirm it fails, then revert;
  never mutate the worktree's `docs/DOD.md`).
  - `@test` 1: `docs/DOD.md` exists — `[ -f "${ROOT}/docs/DOD.md" ]`.
  - `@test` 2: it is non-empty — `[ -s "${ROOT}/docs/DOD.md" ]`.
  - `@test` 3: it is a markdown checklist — `grep -qE '^- \[[ xX]\] ' "${ROOT}/docs/DOD.md"`.
  - `@test` 4: it includes a mutation-testing line —
    `grep -qi 'mutation' "${ROOT}/docs/DOD.md"`.
- GREEN — with Part 4's `docs/DOD.md` in place, `bats test/p20-dod.bats` passes all four.
- REFACTOR — confirm G/W/T-style `@test` titles ("Given the repo ships a DoD, the DoD file
  is checked, then it exists", etc.); confirm `ROOT` resolution matches the p10 precedent;
  confirm no assertion mutates the worktree.

### Gate

- Targeted (part): `bats test/p20-dod.bats` (all four cases pass against the landed
  `docs/DOD.md`).
- Phase-boundary: `bash scripts/ci.sh` (the new bats file is picked up by `bats test/`; no
  count gate; ci stays green).

### Commit

`test(dod): guard docs/DOD.md exists as a non-empty checklist with a mutation line (ADR-105)`
