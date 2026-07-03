# 200 — Intention port verb set: consult / record / assert-fresh

- **Status:** accepted
- **Date:** 2026-07-03
- **Design:** docs/design/intention-port.md · **Refines:** ADR-199

## Context

The intention port needs a verb set. The genericity requirement means the freshness
guard must work for any backend, not just the in-repo file adapter — so the guard has
to live behind the port, not as an engine-side file-only lint.

## Options considered

1. **`consult(scope)` / `record(entry)` / `assert-fresh(change)`** (recommended) —
   pros: the guard lives behind the port, so non-file backends (wiki, RAG, code-graph)
   are guardable too / cons: three verbs to specify per adapter.
2. **`consult` / `record` only, guard as engine lint** — pros: two verbs / cons: the
   freshness guard becomes file-backend-only; a custom backend is unguardable.
3. **`load` / `save` (memory mirror)** — pros: symmetry with the memory port / cons: no
   guard verb at all; loses the whole point of the port.

## Decision

The port exposes `consult(scope) → view`, `record(entry) → refs`, and
`assert-fresh(change) → report`. `assert-fresh` never throws; whether a finding gates is
an engine decision per the manifest knob, not the adapter's. **Adopted as recommended
(no user judgment): follows directly from ADR-199 + the genericity requirement.**

## Consequences

Every adapter (built-in `file` and any `custom`) implements three verbs. The custom
argv contract carries `consult`/`record`/`assert` subcommands (see the manifest ADR).
