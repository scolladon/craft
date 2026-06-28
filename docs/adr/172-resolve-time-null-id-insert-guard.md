# 172 — resolve-time null-id insert guard fails closed

- **Status:** accepted
- **Date:** 2026-06-28
- **Design:** docs/design/clear-backlog-candidates-gated.md · **Refines:** 171

## Context

ADR-171 kept `resolvePipeline`/`applyInserts` permissive: lint rejects the nested
`pipeline.insert` shape at exit 2, but at resolve time a malformed insert still yields a
descriptor with no valid string `id` (the `null`-id phantom) and returns `ok: true`. That
residual was recorded as a deferred follow-up. This change closes it for defence in depth.

## Options considered

- (a) Fail-closed — `applyInserts` detecting an insert that produces a descriptor with no
  valid string `id` makes `resolvePipeline` return `ok: false` with `errors[]`, reusing the
  `validateInsert` label/error vocabulary.
- (b) Drop-and-record — silently drop the phantom descriptor, record a note, continue
  `ok: true`.

## Decision

(a) fail-closed. Consistent with every other `resolvePipeline` early-return and the
ADR-169/170 reject-nested-insert / fail-loud direction. The error message reuses the
`validateInsert` vocabulary (`pipeline.insert[<label>].id must be a non-empty string`) and
the `insertLabel` helper so the resolve-time and lint-time messages read identically.

## Consequences

- `engine/src/edits.js` gains an id-validity check in `applyInserts`; the failure surfaces
  as a resolver error, not a thrown exception.
- `engine/src/resolve.js` threads the insert error into the existing `{ ok: false, errors }`
  path.
- The orchestrator's existing non-zero-exit / `ok:false` walk error-path covers it — no walk
  change.
- Governance / contracts untouched — input-validation hardening only.
