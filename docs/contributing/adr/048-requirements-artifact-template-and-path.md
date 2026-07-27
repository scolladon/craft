# 048 — `requirements` artifact: dedicated template + `docs/requirements/` path

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P10-default-phases.md · **Supersedes/Refines:** none

## Context

The default-off `requirements` phase (archetype `specification`, contract `[producer]`)
produces a `requirements` artifact that the `design` phase consumes. P10 must decide the
artifact's form, where it is written, and whether it gets a first-class template — the
spec-driven-team persona (S4) starts from this capture.

## Options considered

1. **New small `templates/requirements.md`, output `docs/requirements/<slug>.md`
   (probe `paths.requirements`, else that default)** — pros: first-class artifact `design`
   consumes; mirrors the design skill's "probe template, else plugin template" preamble;
   `paths` is unvalidated passthrough so no engine change / cons: one more template to
   maintain. *(designer's recommendation)*
2. **Reuse design's "Requirements"-section shape, no new template** — pros: nothing new /
   cons: no standalone artifact for `design` to consume; blurs the producer boundary.
3. **Free-form doc, no template** — pros: zero structure / cons: no house schema; the
   producer bundle's "fill the named template" invariant has nothing to bind to.

## Decision

The `requirements` phase fills a dedicated `templates/requirements.md` (a small
product-requirements capture: goals, personas/stories, acceptance criteria, NFRs,
out-of-scope) and writes `<requirements-dir>/<slug>.md`, where the dir is probed
`paths.requirements` and defaults to `docs/requirements/` (created if absent). This folds
in the DC-6 path-probe sub-choice: probe, do not hardcode.

## Consequences

- Adds `templates/requirements.md` and a `skills/requirements/SKILL.md` preamble that
  probes `paths.requirements`/template exactly like `skills/design/SKILL.md`.
- The captured doc IS the `requirements` artifact; `design` consumes it when the phase is
  ON, and self-supplies (its own section) when OFF — the descriptor's
  `consumes`/`self_supply` already encodes both (see ADR-053 for the design-skill note).
- No `engine/src` change: `paths` passthrough and the `prd→requirements` alias already exist.
