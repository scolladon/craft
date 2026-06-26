# Definition of Done — craft

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

## Gates green

- [ ] `bash scripts/ci.sh` passes in full: engine node:test count matches `EXPECTED_TESTS`,
  pi adapter tests match `EXPECTED_PI_TESTS`, bats suite passes, shellcheck clean,
  pipeline-lint and contracts-lint clean.
- [ ] Nothing committed on a red gate; every part is gated before commit.
- [ ] Harness techniques triaged-or-documented: every surviving finding from each executing-harness
  is either addressed (killed / fixed) or documented as provably equivalent / acceptable, with the
  argument recorded in the triage commit. No unreviewed survivors accepted.

---

## Architecture boundaries

- [ ] N/A — the `architecture` phase ships `enabled: false` in `pipeline/default.yml` for
  this repo; the architecture boundary check did not run. The gap is stated here honestly and
  not claimed as verified.

---

## Per-change acceptance criteria

Per-change acceptance criteria are **not** listed here. They belong to the change's own design
doc (`docs/DESIGN-<change>.md`), where they are authored and reviewed for that change, and are
verified by that change's TDD plan, review, and tests — not as DoD checklist lines.

This file holds **only** the durable, every-change bar above. A change-specific section here is
what kept going stale (the criteria for one change were re-asserted, unchanged, against the next
across P21–P24); keeping per-change criteria in the design doc removes that staleness by
construction. The `validation` phase asserts the durable criteria from this file verbatim; the
design doc is where a change states what "done" means for itself.

---

_Reference (kept out of the verbatim-asserted checklist lines above): the DoD-assertion mechanism
is specified in `docs/DESIGN-P20-dod-aware-verification.md` and ADRs 104–110._
