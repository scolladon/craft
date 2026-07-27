# 073 — `extends.phases` may override a default id (full-replace, override-aware pass)

- **Status:** accepted
- **Date:** 2026-06-19
- **Design:** docs/DESIGN-P14-derived-plugin-extension.md · **Supersedes/Refines:** refines ADR-070 (override branch of the shared insert path); **deviates from the design's DC-5 recommendation (insert-only)**

## Context

The design recommended `extends.phases` be **insert-only** (default-phase swaps staying in the Tier-1
`phases.<id>.role`/`procedure` surface), because the chosen wiring normalizes registrations into the
insert path (ADR-070) and `applyInserts`→`checkUniqueIds` rejects a duplicate id. The user chose to
**allow same-id override** so a derived plugin can fully take over a default phase's slot — which
re-opens how the override resolves without colliding with `checkUniqueIds`.

## Options considered

1. **Full replace via an override-aware pass** — a same-id `extends.phases` entry replaces the default
   descriptor entirely (registration supplies the whole descriptor); new ids still insert; resolution
   branches: id exists → replace-in-place, id new → insert / pro: clear "this id is now this registered
   phase"; the registration already carries a complete descriptor / con: the insert path gains a
   branch. *(user choice)*
2. **Field-merge over the default** (mirroring `phases.<id>` Tier-1 override) — con: two merge surfaces
   for the same job; ambiguous precedence when both `phases.<id>` and `extends` touch one id.
3. **Forbid same-id (insert-only)** — the design's recommendation / con: rejected by the user; a fully
   derived pipeline can't replace a default slot via `extends`.

## Decision

`extends.phases` **may override a default phase by reusing its id**, resolved as a **full descriptor
replace** inside the shared insert path (ADR-070): when a registered id matches a default id, the
default descriptor is replaced in place by the registered one; a registered id with no default match is
inserted; `checkUniqueIds` still guards two registrations claiming the same *new* id. The replaced
phase runs under the **same engine-owned core bundle** as any other (R9/G5) — override changes *which
worker and descriptor* fill the slot, never the invariant floor.

## Consequences

- The insert/normalize path (ADR-070) carries an override branch: detect id-collision-with-default →
  replace; else insert. Existing P7 insert tests (genuine new-id inserts) must stay green.
- A default phase can be wholly re-homed to a derived plugin (procedure + role + contract + edges +
  gate), enabling a fully derived pipeline — the capability the user wanted over insert-only.
- Override is a **full replace**, not a merge: an overriding registration must supply every field it
  needs; it does not inherit unspecified fields from the default it replaces. The Tier-1
  `phases.<id>.role`/`procedure` field-merge surface remains the way to tweak (not replace) a default.
- The design doc is revised to fold in this override mechanism before planning (scope-fold).
