# 121 — Memory is configured via a new top-level `memory:` manifest key, validated like `backlog`

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P22-repo-local-craft-memory.md · **Supersedes/Refines:** none

## Context

The store's location (ADR-118) and source must be operator-configurable per repo. craft already
validates per-port config via top-level manifest keys (`backlog: {source, ref}`, model selection).

## Options considered

1. **New top-level `memory:` key** (`{ source: file|custom, ref }`) validated like `backlog`
   *(designer recommendation)* — pros: mirrors the backlog/model port config shape, leaves room for a
   `custom` adapter. Cons: one new key in `TOP_KEYS`.
2. **Ride `paths` (`paths.memory`)** — cons: `paths` is for plain file refs (dod), no source/binding
   notion.
3. **No config — fixed path** — cons: blocks the per-repo location choice (ADR-118).

## Decision

*Adopted as recommended (no user judgment — mirrors the backlog port, ADR-022-compatible).* Memory is
configured via a **new top-level `memory:` key** `{ source: file|custom, ref }`, validated in
`engine/src/manifest.js` exactly like `backlog` (added to `TOP_KEYS`). `source: file` (default) with
`ref` = the store path; `custom` is reserved for a future adapter (documented, unbuilt). The default
`ref` is `.claude/craft-memory.md` (ADR-118).

## Consequences

- One key added to the manifest validator and its test surface (mirror the `validateBacklog` tests).
- Scoping stays per-repo (no user/global layer), trivially ADR-022-compatible.
- Per-invocation overlay (CLI) can override `memory:` at highest precedence, like other config.
