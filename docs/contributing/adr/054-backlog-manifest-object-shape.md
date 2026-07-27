# 054 — Backlog manifest shape: object `{ source, ref }`, bare string rejected

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P11-backlog-port.md · **Supersedes/Refines:** none

## Context

The backlog port needs to carry two facts the old form could not: *which* tracker
(`source`) and *where* (`ref`). Today `backlog` is a bare scalar string — two green tests
ship it (`engine/test/manifest.test.js` `backlog: 'my-backlog'`; the S6 fixture
`backlog: PROJ-42`). P11 must decide whether the legacy string keeps working or is replaced.

## Options considered

1. **Migrate-with-record** — accept the string, coerce to `{ source: file, ref: <string> }`,
   emit a run-record line, do NOT path-check the coerced ref (`PROJ-42` is a ticket id, not a
   path). pros: keeps the two tests + every existing manifest green / cons: two accepted
   shapes for one key; the coercion is a forever-compat carry. *(designer's recommendation)*
2. **Hard-reject** — require the object form `{ source, ref }`; a bare string fails validation
   loudly. pros: one canonical shape, no silent coercion, no legacy carry / cons: breaks the
   two existing green tests and any string-form manifest (they must be migrated).
3. **Accept silently as file** — coerce, no record. cons: violates the visible-accountability
   invariant (§11).

## Decision

⚑ **User overrode the recommendation:** `backlog` MUST be an object `{ source, ref }`. A bare
string (or any non-object) is rejected at validation with a named error
(`backlog must be an object { source, ref }`), surfaced by `manifest-lint` / `pipeline-resolve`
as a non-zero-exit loud STOP. There is no string→file coercion and therefore no migration
carry. The two existing string-form tests and the S6 fixture migrate to the object form as
part of this change.

## Consequences

- `engine/src/manifest.js` gains a `validateBacklog` helper (a `case 'backlog':` in the switch)
  that rejects non-object `backlog` and unknown sub-keys.
- `engine/test/manifest.test.js` (`backlog: 'my-backlog'`) and
  `engine/test/fixtures/scenarios/S6/manifest.yml` (`backlog: PROJ-42`) migrate to
  `{ source, ref }`; the S6 scenario assertion updates accordingly.
- The `resolve.js` seam that keyed on `typeof manifest.backlog === 'string'` is replaced by
  object-shaped reading (see [[055-backlog-two-source-model]] for the source set).
- No backward-compat for the string form — deliberate; this is pre-1.0 engine surface.
