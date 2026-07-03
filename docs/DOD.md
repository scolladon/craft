---
criteria:
  - id: implementation-gate-green
    kind: auto
    assert:
      gate: implementation
  - id: review-gate-green
    kind: auto
    assert:
      gate: review
  - id: tdd-followed
    kind: judgment
  - id: coverage-80
    kind: judgment
  - id: design-adrs-authored
    kind: judgment
  - id: conventional-commits
    kind: judgment
  - id: code-quality
    kind: judgment
  - id: error-handling
    kind: judgment
  - id: no-red-commits
    kind: judgment
  - id: techniques-triaged
    kind: judgment
  - id: architecture-gap-honest
    kind: judgment
---

# Definition of Done — craft

Applies to every craft change in this repo. The `validation` phase reads this file verbatim
and records a per-criterion outcome; an unmet criterion is a blocker, never a silent pass.
The frontmatter above is the structured sidecar: `auto` criteria assert mechanically against
engine-recorded gate evidence (only gates recorded *before* DoD assertion time — the
validation phase's own gate cannot evidence itself); `judgment` criteria are asserted on the
checklist's stated terms. Each checklist line names its criterion id.

---

## General (every craft change)

- [ ] TDD: Red → Green → Refactor followed; failing test written before implementation. `tdd-followed`
- [ ] Coverage ≥ 80 % for every changed source file (engine + process node:test suites). `coverage-80`
- [ ] Design doc and ADRs authored for load-bearing choices; backlog entry closed. `design-adrs-authored`
- [ ] Conventional commit: one-line `<type>(scope): description`, no co-author trailer. `conventional-commits`
- [ ] No dead code, no primitive obsession, no nesting > 2, no magic values. `code-quality`
- [ ] All errors handled or re-thrown with context; none swallowed silently. `error-handling`

---

## Gates green

- [ ] `bash scripts/ci.sh` passes in full: every enumerated `*.test.js` in the engine,
  pi-adapter, and process suites runs green (enumerate-and-run — a suite enumerating zero
  files is a hard error, and the registration meta-test proves every file registers ≥ 1
  test), shellcheck clean, pipeline-lint, contracts-lint, backlog-lint, design-lint, and
  docs-structure-lint clean. `implementation-gate-green` / `review-gate-green`
- [ ] Nothing committed on a red gate; every part is gated before commit. `no-red-commits`
- [ ] Harness techniques triaged-or-documented: every surviving finding from each executing-harness
  is either addressed (killed / fixed) or documented as provably equivalent / acceptable, with the
  argument recorded in the triage commit. No unreviewed survivors accepted. `techniques-triaged`

---

## Architecture boundaries

- [ ] N/A — the `architecture` phase ships `enabled: false` in `pipeline/default.yml` for
  this repo; the architecture boundary check did not run. The gap is stated here honestly and
  not claimed as verified. `architecture-gap-honest`

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
is specified in `docs/archive/DESIGN-P20-dod-aware-verification.md` and ADRs 104–110._

_Structured sidecar (opt-in): a DoD file may carry a YAML frontmatter `criteria` list tagging
each entry `kind: auto` or `kind: judgment`. Auto criteria are verified mechanically against
engine-recorded gate evidence (`assert.gate: <phase-id>`) or a `file-exists` check — they are
never executed as commands. Free-text DoD files with no frontmatter remain fully valid._
