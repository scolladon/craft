# Plan — P15: second-instantiation validation (non-tsgit, zero manifest) — code-touching parts

> Source: design doc `docs/DESIGN-P15-second-instantiation.md` · ADRs `076`–`082` (all ratified)
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Scope of this plan

This run plans **only the two code/CI-touching parts** of P15, as scoped by the user:

- **Part 1 (ADR-078, Part A):** the explicit SC5 CI scenario — a resolver-toolchain-neutrality
  guard test (test-infra-only, no `src/` delta).
- **Part 2 (ADR-082, Part B):** the propose-gate-on-runtime-no-op clause — a bounded
  orchestrator-prose edit across two skill files (docs/prose, no `src/` delta).

**Deferred, NOT planned here** (until the user names the Python repo): the real-repo SC5 smoke
in `skills/run/SKILL.md`, the SC5 validation-record doc, and the docs refresh
(README / GUIDE §1 / DESIGN-customizable-engine / BACKLOG flip). These are the documentation/smoke
parts of P15 and are out of scope for this plan.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  mutation/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.

**Both parts are legitimately standalone under the EXCEPTION:** P15 adds **no `src/` /
`engine/src/` / `pipeline/default.yml` / `contracts/` change** (Design §"Files this touches":
the engine resolution layer is already toolchain-neutral — R1). Part 1 is a test-infra-only
regression guard for already-correct resolver behaviour; Part 2 is an orchestrator-prose edit
whose runtime guard is the deferred SC5 smoke (ADR-082 §Consequences: "no `node --test`
surface"). Neither has an implementation part to fold into. They are independent and may land
in either order; the plan keeps the audit order (A then B).

## Public-surface decision

P15 introduces **no new exported symbol** — no engine API, no new bin, no new barrel entry, no
new skill, no new command. Part 1 adds a fixture directory + test cases inside an existing
suite (`engine/test/scenarios.test.js`) and bumps one constant (`EXPECTED_TESTS`); Part 2 edits
prose inside two existing `SKILL.md` files. There is **no public surface to gate** (no
exhaustiveness switch, no generated API report, no README/registry surface touched). The
only mechanical surface gate in play is `scripts/ci.sh`'s `EXPECTED_TESTS` test-count assertion,
which Part 1 pre-pays in-part (see its Context).

## Decision candidates

**None — fully pre-decided by ADRs 076–082.** Every load-bearing choice is ratified:
- DC-3 → ADR-078 (option 1: one explicit SC5 scenario, fixture under
  `engine/test/fixtures/scenarios/SC5/`, `EXPECTED_TESTS` reconciled).
- DC-7 → ADR-082 (option 1: a bounded orchestrator-prose clause in `skills/run/SKILL.md` +
  a one-line note in `skills/propose/SKILL.md`; no engine surface).
- DC-1/076, DC-2/077, DC-4/079, DC-5/080, DC-6/081 scope the deferred (out-of-plan) work.

No implementation-level micro-choice surfaced during exploration that the ADRs leave open. The
SC5 fixture shape (an empty manifest = `# comment` only) is fixed by the SC1 precedent; the
assertion content (mirror the SC1 gate-string pin + add a language-freedom refutation) is fixed
by ADR-078's "placeholders unchanged and language-free" wording.

## Part 1 — SC5 CI scenario: resolver toolchain-neutrality guard

### Context

**Nature:** test-infra-only regression/characterization guard. No `src/` delta. The resolver
is *already* toolchain-neutral (Design R1, pinned); this part makes that neutrality a named,
diffable CI guarantee per ADR-078, distinct from SC1's value-pin.

**Files to create / touch (exact paths):**

1. **CREATE** `engine/test/fixtures/scenarios/SC5/manifest.yml` — an **empty manifest**, same
   shape as SC1's fixture. SC1's fixture is literally one comment line:
   ```
   # SC1: zero-config — no manifest overrides
   ```
   so `loadScenarioManifest('SC1')` does `load(text) ?? {}` → `{}`. SC5's fixture is the same:
   a single comment line representing "a non-tsgit repo, zero config", e.g.:
   ```
   # SC5: zero-config on a non-tsgit repo — no manifest, no gates: block
   ```
   The comment text is the only difference from SC1; the resolved manifest is `{}` for both
   (the point: identical resolution regardless of target toolchain). Do **NOT** add a `gates:`
   block or any key — the assertion depends on there being no `gates` override so the resolver
   emits its default placeholders.

2. **EDIT** `engine/test/scenarios.test.js` — add a new `// ─── SC5 ───` section. The closest
   existing block to mirror is the **SC1 gate-string pin at lines 198–216**. Helpers already in
   the file (do not re-import): `loadDefault()` (line 33, parses `pipeline/default.yml` via
   `parsePipeline`), `loadScenarioManifest(name)` (line 37, reads the fixture, `load() ?? {}`),
   `resolvePipeline` (imported line 21 from `../src/resolve.js`). House style for every test:
   `test('SC5 Given …, when resolvePipeline runs, then …', () => { … })` — Given/When/Then
   title, AAA body, `const sut = resolvePipeline`, `const result = sut(defaults, manifest)`.
   The gate accessor pattern is `const gateOf = id => result.gateDecisions.find(g => g.phaseId === id)?.gate;`
   (verbatim from line 206).

**Pinned resolved gate strings the resolver emits for a zero manifest** (from the SC1 pin,
lines 208–215 — SC5 must observe the same, proving toolchain-independence):
```
gateOf('planning')        === 'plan-lint'
gateOf('implementation')  === '<gates.phase>'
gateOf('review')          === '<gates.phase>'
gateOf('refactoring')     === '<gates.phase>'
gateOf('validation')      === '<validation gate>'
gateOf('propose')         === 'pr.pre-pr-gate'
gateOf('workspace')       === ''
gateOf('documentation')   === ''
```

**The SC5-specific value-add over SC1** (ADR-078 §Decision — "placeholders unchanged and
**language-free**"): assert that **no** resolved `gateDecisions[].gate` string contains a
concrete toolchain token. Refute against every gate decision, e.g.:
```
const TOOLCHAIN_TOKENS = /\b(npm|npx|node --test|node|pnpm|yarn|bun|jest|stryker|bats|pytest|cargo|go test|go |mvn|gradle)\b/;
for (const d of result.gateDecisions) {
  assert.ok(!TOOLCHAIN_TOKENS.test(d.gate), `gate for ${d.phaseId} must be language-free; got: "${d.gate}"`);
}
```
This is the assertion SC1 does not make: SC1 pins gate values; SC5 names the *neutrality
guarantee* (the resolver never bakes a language command into any gate string, deferring command
resolution to the repo-probing skill layer). Note the empty-string gates (`workspace`,
`documentation`) and the placeholder/internal gates (`<gates.phase>`, `<validation gate>`,
`plan-lint`, `pr.pre-pr-gate`) all trivially pass the refutation — that is the proof.

**`EXPECTED_TESTS` surface gate (pre-pay in this part):** `scripts/ci.sh:10` pins
`EXPECTED_TESTS=631`; `ci.sh:12-22` runs `cd engine && node --test 'test/**/*.test.js'` and
asserts the awk-extracted `# tests` count equals `EXPECTED_TESTS`, else exits 1 on drift. Adding
N `test()` cases REQUIRES bumping `EXPECTED_TESTS` to `631 + N` in the **same** part/commit,
else `scripts/ci.sh` (the phase gate) goes red. Pick the case count deliberately and bump to
match. Suggested split (3 cases, → `EXPECTED_TESTS=634`): (a) gate-string value pin mirroring
SC1; (b) the language-freedom refutation over all `gateDecisions`; (c) a shape assertion that
the zero-SC5 manifest resolves to the same 11-phase `effective[]` ids as `SC1_IDS` (the const at
lines 69–81) — proving resolution is identical, not just the gates. If you author a different
count, set `EXPECTED_TESTS` to `631 + (your count)`.

**Guards (do not violate):**
- **G9 / SC1 byte-identical** (Design R9): do NOT touch SC1's fixture or its assertions
  (lines 89–216). SC5 is purely additive — a new fixture dir + a new test section.
- This is a guard test, not behaviour-adding: there is no production code to fold it into; do
  **not** invent any `src/` change. Frame the RED honestly (below).

### TDD steps

This part is a **regression guard for already-correct behaviour** — the resolver is already
toolchain-neutral. Honest RED/GREEN framing (two RED layers, both mechanical):

- **RED (part gate):** Write the SC5 test cases FIRST, before creating the fixture. Run the
  part gate (`node --test 'test/scenarios.test.js'`). Expected failure: `loadScenarioManifest('SC5')`
  throws `ENOENT` reading `fixtures/scenarios/SC5/manifest.yml` — the test errors because the
  fixture does not exist yet. This proves the cases are wired to the real fixture loader.
- **GREEN (part gate):** Create `engine/test/fixtures/scenarios/SC5/manifest.yml` (the
  one-comment empty manifest above). Re-run the part gate — the new cases now pass (the resolver
  is already neutral, so the assertions hold immediately; that is correct for a guard test — it
  would only go RED against a *future* mutation that bakes a command into a gate string).
- **RED→GREEN (phase gate / surface gate):** Run `scripts/ci.sh`. It fails with
  `ci: test count drift — expected 631, got 634` because the new cases landed without the
  constant bump. Bump `EXPECTED_TESTS` in `scripts/ci.sh` from `631` to `631 + N` (e.g. `634` for
  3 cases) in this same commit. Re-run `scripts/ci.sh` — green: all cases pass and the count
  reconciles. (This is the `EXPECTED_TESTS` surface gate pre-paid in-part.)
- **REFACTOR:** Factor the `gateOf` accessor and the `TOOLCHAIN_TOKENS` regex to module-top
  consts only if it improves the section's readability without touching SC1's block; keep each
  test single-assert-intent and AAA. No magic values — name the token regex. Do not extend the
  refutation to a denylist that could false-positive on the existing placeholders
  (`<gates.phase>` etc. must pass).

### Gate

Part gate (engine-default capability probe, no manifest — `gates.part` → repo test runner
over touched files):

```
cd /Users/scolladon/workspace/perso/craft-p15-second-instantiation/engine && node --test 'test/scenarios.test.js'
```

Phase-boundary gate (the substrate gate; this is where the `EXPECTED_TESTS` reconciliation is
enforced):

```
bash /Users/scolladon/workspace/perso/craft-p15-second-instantiation/scripts/ci.sh
```

### Commit

```
test(engine): pin SC5 resolver toolchain-neutrality
```

## Part 2 — propose-gate releases on a recorded executing-harness runtime no-op

### Context

**Nature:** docs/prose — a bounded orchestrator-prose edit across two `SKILL.md` files. No
`src/` delta, **no `node --test` surface** (ADR-082 §Consequences: "it is orchestrator prose; its
runtime guard is the SC5 smoke reaching `propose`"). The deferred SC5 real-repo smoke (out of
scope of this plan) is this clause's behaviour guard; here the edit's only structural guard is
that `scripts/ci.sh` stays green (the markdown edit must break no test).

**What the clause says (ADR-082 §Decision):** an executing-harness in `propose.awaitingHarnesses`
that, *at runtime*, **records a no-op** (its tool probe finds nothing and the phase ends with a
note — e.g. validation on a non-JS repo with no mutation config) **releases its propose-gate
entry**, symmetric to a skip/disable waiver. This is distinct from the engine waiver path: the
engine (`engine/src/gates.js`, `emitWaivers` / `WAIVABLE_PHASE_IDS`) emits a waiver **only** for
skip/disable when the phase is absent from `effective[]`; a runtime no-op'd validation is
*enabled and in* `effective[]`, so it gets no engine waiver and IS in `awaitingHarnesses`. No
engine surface is added in P15 — this is prose only.

**Edit site 1 — `skills/run/SKILL.md`, the "Executing-harness triage gates `propose`" bullet,
lines 212–221.** The bullet currently ends (lines 219–221):
```
  If an executing-harness was waived (skipped via `pipeline.skip`), its gate is
  released — the waiver is in `Resolution.waivers[]` and pre-formatted in
  `Resolution.record[]` — and `propose` may proceed without waiting for it.
```
**Add a new clause to this same bullet** (after the existing skip-waiver sentence) stating the
runtime-no-op release. Required content (paraphrase in house voice — concise prose, no
provenance refs like ADR/phase numbers in the text):
- An awaited executing-harness that **records a runtime no-op** — it is enabled and in
  `effective[]` (so it carries no engine waiver and IS in `awaitingHarnesses`), but at runtime
  its tool-agnostic probe finds nothing and the phase ends with a note, never landing a run —
  **likewise releases its `awaitingHarnesses` entry**, symmetric to a skip-waiver.
- Distinguish it explicitly from the engine waiver path: this release is NOT an engine waiver
  (the engine waiver covers skip/disable only); it is the orchestrator treating a recorded no-op
  as a release at gate-check time. `propose` may then proceed without waiting for the no-op'd
  harness.

**Edit site 2 — `skills/propose/SKILL.md`, the cross-phase invariant check, lines 12–13.**
Current text:
```
2. **Cross-phase invariant check:** the validation phase's run has landed, survivors are
   triaged, `gates.phase` is green. Not yet → wait; never create the PR early.
```
**Amend** the landed clause to: "…the validation phase's run **has landed or recorded a no-op**,
survivors are triaged, `gates.phase` is green…" (ADR-082: "landed **or** recorded a no-op").
Keep the rest of the sentence (the "Not yet → wait; never create the PR early" guard) intact.

**Guards (do not violate):**
- **SC1-neutral / G9** (ADR-082 §Consequences): the clause fires only on a runtime no-op, which
  the tsgit default path (Stryker present, validation lands a real run) never hits — so default
  tsgit behaviour is unchanged. No test asserts these prose lines, so SC1 cannot regress.
- **No engine edit**: do NOT touch `engine/src/gates.js`, `WAIVABLE_PHASE_IDS`, or any engine
  surface. The clause is prose; the engine waiver path stays skip/disable-only.
- **No provenance refs in the prose**: do not write "ADR-082" / "P15" / "DC-7" into the skill
  text (this is source/skill content; the no-provenance ban applies). The PLAN doc may name
  them; the edited SKILL.md prose may not.
- Keep both edits diff-minimal (add one clause; amend one phrase) — do not rewrite surrounding
  paragraphs.

### TDD steps

This is an **orchestrator-prose edit with no `node --test` surface** — there is no RED test to
write (ADR-082 is explicit). Honest framing:

- **No RED:** the clause has no engine/test surface; its runtime behaviour guard is the
  **deferred SC5 real-repo smoke** (out of scope of this plan — it observes the walk reaching
  `propose` on a non-JS repo without deadlocking on the no-op'd validation). Note this explicitly
  rather than fabricating a RED/GREEN.
- **EDIT (the change):** apply edit site 1 (`skills/run/SKILL.md` — add the runtime-no-op release
  clause to the propose-gate bullet) and edit site 2 (`skills/propose/SKILL.md` — amend "landed"
  → "landed or recorded a no-op").
- **VERIFY (structural):** run the phase gate below; it must stay **green** — the markdown edit
  must break no existing test and no lint. Confirm the two edits read coherently with the
  surrounding skip-waiver prose (the runtime-no-op release is symmetric to, not duplicative of,
  the skip-waiver) and that the SC1/Stryker path is visibly excluded by the wording.

### Gate

Structural gate — the markdown edit must not break any test or lint (there is no per-part test
runner over a `.md` edit; the substrate gate is the guard):

```
bash /Users/scolladon/workspace/perso/craft-p15-second-instantiation/scripts/ci.sh
```

(`ci.sh` runs `node --test`, `bats`, `shellcheck scripts/*.sh hooks/*.sh`, and the engine bin
lints. `scripts/manifest-lint.sh` is **N/A** here — it lints manifest YAML, not skill markdown,
and no manifest is touched.)

### Commit

```
docs(skill): release propose-gate on a recorded executing-harness no-op
```
