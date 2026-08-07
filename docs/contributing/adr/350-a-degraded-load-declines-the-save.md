# 350 — A degraded load declines the save

- **Status:** accepted
- **Date:** 2026-08-07
- **Design:** docs/contributing/design/harness-hygiene-followups.md · **Supersedes/Refines:** refines ADR-116, ADR-120

## Context

`save(repoRoot, view, delta, deps)` serializes `reconcile(view.entries, delta, …)`, where
`view` is the `MemoryView` returned by `load` at run start. When `load` fails to parse the
store it returns an empty view — by design, per ADR-116's advisory-only invariant.

Composing those two correct behaviours produces an incorrect one: with `view.entries`
empty, the next successful `save` rewrites the store as **only that run's delta**, silently
erasing every accumulated entry. One malformed byte plus one run destroys the store.

This is not hypothetical. The store carried that malformed byte for the whole window since
`1f7e76f`; it survived only because no `save` completed in that window. ADR-116 makes a
malformed store a non-blocking load no-op and ADR-120 makes a failed save a recorded
warning. Neither licenses an *erasing* write.

## Options considered

1. **Mark the view degraded and have `save` decline**, with
   `writeNote: 'save skipped: load was degraded'` — pros: closes the data-loss path inside
   the existing warning channel; no throw, no gate, no new failure mode; costs one boolean
   on the view / cons: a run whose store was malformed contributes nothing to memory — the
   correct outcome, but it must be visible. *(designer's recommendation)*
2. **No engine change** — repair the store and rely on human review of the committed diff —
   pros: smallest change / cons: leaves a live data-loss path armed for the next
   hand-edit, and this store proves hand-edits happen.
3. **Write the reconciled result to a quarantine sidecar** on a degraded load — pros: the
   run's observations are not lost / cons: invents a second store location and a
   reconciliation question nobody has asked for.

## Decision

`load` marks the view **degraded** whenever it returns early without having read the
store's real contents — the `malformed store` and `store path outside repo` paths. `save`
checks that flag and **declines to write**, returning normally with
`writeNote: 'save skipped: load was degraded'`.

The invariant this states: **a write derived from a view that never saw the store is not a
write, it is an erasure.** `save` reconciles against what `load` returned; when `load`
returned nothing *because it failed*, reconciliation has no baseline and the only safe
action is to leave the store alone.

This stays strictly inside ADR-116 and ADR-120: nothing throws, nothing gates, the run
proceeds, and the reason travels in the same `writeNote` channel a failed write already
uses. The distinction it draws is between an empty view because the store is **genuinely
empty** (a cold start — writing is correct) and an empty view because the store is
**unreadable** (writing is destructive).

## Consequences

- `emptyView` gains a `degraded` marker; `save` gains one guard. A cold start — no store
  file yet — is not degraded and still writes normally.
- A run against a malformed store now contributes nothing to memory and says so, instead of
  silently replacing the store with its own delta.
- The failure becomes recoverable by fixing the file: the next run loads cleanly and saves
  normally. Today the same sequence loses everything irreversibly.
- `docs/contributing/specs/memory.md` gains the degraded-view semantics on both verbs; it
  is the governing spec and must state this.
- The store remains hand-editable, and a malformed hand-edit remains possible — but its
  worst outcome falls from "every entry destroyed" to "one run's observations skipped".
