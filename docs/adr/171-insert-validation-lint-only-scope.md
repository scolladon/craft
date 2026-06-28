# 171 — insert-shape enforcement is lint-only; resolve stays permissive

- **Status:** accepted
- **Date:** 2026-06-27
- **Design:** docs/DESIGN-nested-insert-fail-loud.md · **Refines:** 169

## Context

The nested insert also produces a `null`-id phantom at resolve time (`ok: true`). ADR-169
catches the nested shape at lint. Question: should `applyInserts`/`resolvePipeline` *also*
reject the nested / `null`-id shape (defense in depth)?

## Options considered

- (a) Lint-only — `manifest-lint` is the boundary; `resolvePipeline` stays permissive.
- (b) Lint + resolve both reject the nested / `null`-id shape.

## Decision

(a). Honours the brief ("catch it at lint, before resolution") and keeps scope tight —
`manifest-lint` is the gate CI runs, and any real manifest reaches resolve only after lint.
The `null`-id-phantom-with-`ok:true` resolve path is recorded as a documented residual /
follow-up in the design's "Out of scope", not widened scope here.

## Consequences

- `engine/src/edits.js` and `engine/src/resolve.js` are untouched.
- Governance / contracts are untouched — this is input-validation hardening, not a contract
  change.
- Follow-up candidate (deferred): resolve-time hardening of the `null`-id insert path.
