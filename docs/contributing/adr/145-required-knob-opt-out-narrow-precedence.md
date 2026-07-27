# 145 — `phases.<id>.required` knob: opt-out default, narrow precedence

- **Status:** accepted
- **Date:** 2026-06-23
- **Design:** docs/DESIGN-P26-auto-skip-unnecessary-phases.md · **Supersedes/Refines:** none

## Context

`required:` is the operator's escape hatch against a wrong auto-skip evaluation — a pin that
forces an eligible phase to run regardless of the necessity probe. Its shape, default, and
precedence against the *existing* skip mechanisms (`pipeline.skip`/`--skip`, `enabled: false`)
must be settled. Empirically, `phases.<id>.required: true` is rejected today
(`unknown field on phase <id>: required`); `PHASE_FIELDS` is the frozen whitelist.

## Options considered

1. **Narrow semantics + opt-out default + lint error on collision** *(designer + user choice)* — `required:` defends a phase **only against auto-skip** (and against a silent runtime drop); the default is opt-out per phase (absent = participates in evaluation); an explicit operator `pipeline.skip`/`--skip`/`enabled: false` **still wins** (the operator's loud, ADR-005-recorded waiver outranks a "don't auto-skip" pin); a same-phase `skip`+`required` is a **hard lint error** (surfaced, never silently resolved). Pros: preserves the operator-intent precedence ladder (ADR-022); `required:` is scoped to defeating *craft's* automatic evaluation, not the *operator's* explicit choice; collisions surface loudly.
2. **Strong semantics — `required` overrides operator skip** — Cons: a committed manifest would silently veto a deliberate CLI `--skip`, inverting the precedence ladder.
3. **Narrow + loud-record precedence (no lint error)** — like (1) but the `skip`+`required` collision is resolved by a record line, not a lint error. Cons: lets a contradictory manifest through with only a note; weaker than craft's "surface, never silently resolve" ethos.

## Decision

*Adopted-as-recommended (user-confirmed).* Add `required` to `PHASE_FIELDS` with a
boolean-type validation arm mirroring the existing `enabled` arm (`phases.<id>.required must be
a boolean`). Default is **opt-out per phase** (absent ⇒ `false` ⇒ eligibility decided by
ADR-144). Semantics are **narrow**: `required: true` makes a phase ineligible for auto-skip and
forces it to run; it does **not** override an explicit operator skip/disable. A same-phase
`pipeline.skip: [<id>]` **and** `phases.<id>.required: true` is a **lint error** (`validateManifest`
exit 2), surfaced rather than silently resolved. Floors remain categorically ineligible **in code**
(ADR-144), never expressed as an overridable `required` default.

## Consequences

- The knob rides the existing `phases.<id>` → `phaseOverrides` channel; no new top-level key.
- Operator authority is preserved: CLI/manifest skip > `required` pin.
- A contradictory `skip`+`required` config fails the lint loudly, before any run.
- `required` is purely additive: an absent knob leaves every phase's behaviour exactly as ADR-144.
