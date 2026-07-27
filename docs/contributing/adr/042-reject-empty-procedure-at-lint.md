# 042 — Reject empty-string `procedure:` at lint

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P9-hardening.md · **Supersedes/Refines:** refines ADR-040 (procedure override field)

## Context

ADR-040 made `phases.<id>.procedure` a first-class per-phase override with a string shape-check in
`manifest.js`. But `typeof '' === 'string'`, so `phases.<id>.procedure: ""` lint-passes today — an
empty procedure reaches resolution and only STOPs three phases later at the walk's dispatch step
("resolves to no installed skill"). This is the ADV-3 boundary the P9 validation advisories flagged.

## Options considered

1. **Reject at lint** — add an emptiness guard (`value.trim() === ''` → error) to the `procedure`
   shape branch in `manifest.js`. Fail-fast at the system boundary. *(designer's recommendation; chosen)*
2. **Accept; STOP at dispatch** — leave lint permissive; the walk's existing dispatch STOP catches it.

## Decision

`manifest.js`'s `procedure` shape-check rejects an empty/whitespace-only value with a clear
`phases.<id>.procedure must be a non-empty string` error, folding the non-string and empty cases into one clear message. An
empty procedure is never meaningful, so it fails at the manifest boundary rather than three phases
later — matching the house "validate at system boundaries, fail fast" rule.

## Consequences

A typo'd/blank `procedure` is caught at lint with a precise message. Scope is deliberately limited
to `procedure` (the ADV-3 subject); `role`/`model` empty-string rejection is NOT swept in here (no
evidence it bites, and a blanket empty-string sweep is out of this batch's scope) — a possible
follow-up if symmetry is later wanted. One added boolean condition on an existing shape branch; no
new field, no surface change.
