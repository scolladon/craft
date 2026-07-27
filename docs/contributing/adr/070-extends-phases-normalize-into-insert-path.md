# 070 — Registered `extends.phases` resolve through the insert path

- **Status:** accepted
- **Date:** 2026-06-19
- **Design:** docs/DESIGN-P14-derived-plugin-extension.md · **Supersedes/Refines:** none (DC-2 as recommended); paired with ADR-073

## Context

A registered phase needs a descriptor in `effective[]` carrying a contract bundle, edges, and a gate —
exactly what `applyInserts` (`engine/src/edits.js:101`) already produces for `pipeline.insert`, after
which the descriptor flows through the shared graph/strand/gate machinery (`resolve.js`). The question
is whether registered phases reuse that path or get a parallel one.

## Options considered

1. **Normalize `extends.phases` into the insert list before `applyInserts`** — pro: one
   graph/strand/gate code path, no drift, minimal diff; a registered phase *is* an insert with a richer
   validated descriptor / con: the insert path must learn the override branch (ADR-073). *(designer's
   recommendation)*
2. **A parallel `applyRegistrations` pass** — pro: separates concerns / con: duplicates the insert
   machinery; two resolution paths that can drift.
3. **Require the user to also write `pipeline.insert`** (extends only validates) — con: defeats a
   first-class registration surface; double declaration.

## Decision

`extends.phases` is **normalized into the insert list** before `applyInserts`; registered phases share
the single insert→graph→strand→gate resolution path. There is **no second resolution path**. The
override sub-case (a registered id matching a default id) is handled by an override-aware branch within
this same path (ADR-073), not a parallel pass.

## Consequences

- One resolution path to test and reason about; `pipeline/default.yml` stays untouched (registrations
  live only in the manifest).
- The insert path gains override-awareness (ADR-073) — `checkUniqueIds` still guards genuine duplicate
  *new* inserts, but a same-id registration replaces rather than collides.
- `validateExtends` must fully shape-check a registered phase descriptor, because the insert path does
  **not** run `normalizeEntry`/`deepFreeze` (verified: inserted descriptors are unfrozen and
  uncoerced). The validator is the sole shape guard for registered phases.
