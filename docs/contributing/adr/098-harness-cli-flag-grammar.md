# 098 — `--harness` flag grammar: repeatable phase-relative knob assignment

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P18-walk-parallelism-enforcement.md · **Supersedes/Refines:** refines ADR-064 (re-parked `--harness`); consistent with ADR-022 (CLI overlay precedence)

## Context

ADR-064 routed a per-invocation `--harness` flag to "the walk/parallelism pass," preconditioned
on `passes`/`convergence` being engine-enforced. P18 delivers that pass. The flag writes nested
`phases.<id>.harness.<knob>`, beyond the flat `--profile`/`--skip` overlay, so its grammar,
repeatability, and type-coercion source must be fixed.

## Options considered

1. **Repeatable `--harness <phase>.<knob>=<value>`**, phase-relative (the `.harness.` segment
   implied) *(chosen)* — pros: terse, matches the user's mental model ("set review's passes"),
   repeatable composes cleanly, avoids comma collision with `dimensions`'s own comma value;
   coercion keyed on the closed knob set; re-validated through the existing typed gate. Cons:
   the implied `.harness.` is a small piece of magic the overlay must own.
2. **Full-path `--harness phases.<id>.harness.<knob>=<value>`**, repeatable — pros: explicit.
   Cons: verbose and error-prone in every invocation.
3. **Single CSV `--harness review.passes=2,review.convergence=3`** — pros: one flag. Cons: the
   CSV separator collides with `dimensions=code,perf` values.

## Decision

The flag is **repeatable `--harness <phase>.<knob>=<value>`**, phase-relative: the overlay
inserts the `.harness.` segment, writing `phases.<phase>.harness.<knob>`. One knob per flag;
repeat for several. The CLI string is **type-coerced** per a fixed knob-keyed table
(`passes`/`max_cycles` → int; numeric `convergence` → number, with `low-only`/`none` kept as
string; `incremental` → bool; `dimensions` → comma-split list; else string), then
**re-validated through the existing `validatePhases` → `validateHarness`** so a bad value or an
unknown phase fails closed with the *same* canonical message a bad manifest produces. The
overlay folds at **CLI-wins** precedence (ADR-022), above the manifest harness and above
`pipeline/default.yml`. Grammar faults (no `=`, empty phase/knob, malformed dotted path) are
rejected at parse time, exit 2.

## Consequences

- `engine/src/cli-overlay.js` gains a pure nested-write path; `engine/src/pipeline-resolve-main.js`
  `parseArgs` gains a repeatable `--harness` branch + coercion, and `main` gains a re-validation
  call site before `resolvePipeline` (the resolve bin does not validate today).
- `validatePhases` (or a thin wrapper) is exported from `manifest.js` — a small surface
  addition, **not** part of the ADR-022 frozen *resolver* surface.
- `skills/run/SKILL.md` strips/forwards `--harness` (repeatable) alongside `--profile`/`--skip`.
- ADR-064's follow-up is discharged by this change.
