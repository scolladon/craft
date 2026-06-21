# Definition of Done — craft-dod-aware-verification

Applies to every craft change in this repo. The `validation` phase reads this file verbatim
and records a per-criterion outcome; an unmet criterion is a blocker, never a silent pass.

---

## General (every craft change)

- [ ] TDD: Red → Green → Refactor followed; failing test written before implementation.
- [ ] Coverage ≥ 80 % for every changed source file (engine node:test + bats).
- [ ] Design doc and ADRs authored for load-bearing choices; backlog entry closed.
- [ ] Conventional commit: one-line `<type>(scope): description`, no co-author trailer.
- [ ] No dead code, no primitive obsession, no nesting > 2, no magic values.
- [ ] All errors handled or re-thrown with context; none swallowed silently.

---

## Mutation testing

- [ ] All surviving mutants triaged: each mutant is either killed by a new or existing test,
  or documented as provably equivalent (with the equivalence argument recorded in the
  triage commit). No unreviewed survivors are accepted.
- [ ] Per-hunk mutation run is clean: `stryker run` exits green (score meets threshold or
  every survivor below the threshold is listed as equivalent in the triage log).
- [ ] Mutation-testing criterion is evidenced by reading the `validation` phase results
  produced in this same run — never re-run separately.

---

## Gates green

- [ ] `bash scripts/ci.sh` passes in full: engine node:test count matches `EXPECTED_TESTS`,
  pi adapter tests match `EXPECTED_PI_TESTS`, bats suite passes, shellcheck clean,
  pipeline-lint and contracts-lint clean.
- [ ] Nothing committed on a red gate; every slice is gated before commit.

---

## Architecture boundaries

- [ ] N/A — the `architecture` phase ships `enabled: false` in `pipeline/default.yml` for
  this repo; no dependency-cruiser boundary check runs. The gap is stated here honestly and
  not claimed as verified.

---

## Feature-acceptance criteria (current change)

- [ ] The DoD assertion runs independently of the mutation-tooling no-op: when mutation
  tooling is absent the mutation sub-concern emits its own no-op note AND the verify
  sub-concern still records its `verify: DoD met — …` outcome (the two are decoupled).
- [ ] `NO-OP(verify): no DoD declared` is distinct from the mutation-absent note: the two
  outcomes are separately greppable (`grep -F 'NO-OP('` and `grep 'verify'` yield
  non-colliding results within one phase record).
- [ ] `paths.dod` file-ref is validated when declared: if a manifest declares `paths.dod`
  pointing to a missing file, `manifest-lint` emits
  `paths.dod references missing file: <path>` and returns `ok: false`.
- [ ] Absent `paths.dod` lints clean: a manifest with `paths.dod` omitted (or `paths`
  omitted entirely) passes manifest-lint without error.
- [ ] Per-criterion outcomes are recorded by the validation phase: each checklist line
  produces a distinct `verify: DoD met — …` or blocker entry in the run record.
- [ ] An unmet criterion is a blocker: the phase emits `{ verify, "<criterion> unmet",
  ≤3 options }` and escalates to the user; under the headless Pi adapter it records the
  blocker and halts — never degrades to a silent pass.
- [ ] Engineering-check criteria (gates green, mutation triaged) are read from the phase's
  own results — never re-run.
- [ ] When no DoD is declared, the validation phase pairs `NO-OP(verify): no DoD declared`
  with an honest gap-note when the architecture phase is OFF, rather than fabricating
  alignment.

---

_References (kept out of the verbatim-asserted checklist lines above): this DoD mechanism is
specified in `docs/DESIGN-P20-dod-aware-verification.md` and ADRs 104–110._
