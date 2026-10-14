---
subjects:
  - engine/src/cli-io.js
  - engine/bin
  - adapters/codex/bin/trust-hook.js
  - adapters/pi/src/cli.js
---
# 563 — `isEntryPoint` takes the caller's `import.meta`

- **Status:** accepted
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/entry-guard-symlink-swap-race.md · **Supersedes/Refines:** refines ADR-556, ADR-561

## Context

Node's `import.meta.main` answers "is this module the entry" without re-reading argv[1], so a link swapped after load cannot change it. `import.meta` is per-module, so the shared helper in `engine/src/cli-io.js` cannot read the caller's. The 26 entries (24 `engine/bin/*.js`, `adapters/codex/bin/trust-hook.js`, `adapters/pi/src/cli.js`) all call `isEntryPoint(import.meta.url, process.argv[1])`.

## Options considered

1. **The caller passes `import.meta`; the helper reads `meta.main`** *(recommended)* — pros: one export (ADR-556), the decision stays in `mutate`, testable with plain objects on any Node, a leftover string argument fails loudly / cons: a signature change at 26 sites.
2. **Keep the signature; each call site writes `import.meta.main ?? isEntryPoint(…)`** — cons: the decisive expression lives in 26 copies outside `mutate`, the shape ADR-556 removed.
3. **A second export `isMainModule(meta, argv1)` wrapping today's helper** — cons: leaves the racy predicate exported for a future entry to pick.

## Decision

Option 1, ratified by the user. The signature is `isEntryPoint(meta)`: the `argv1` parameter is dropped because ADR-564 removes the fallback that read it. Every entry calls `if (isEntryPoint(import.meta)) {`. Refines ADR-556 (same name and home, new argument) and ADR-561 (the adapters' quoted call literal).

## Consequences

The 26 call sites change in one mechanical edit. The helper's unit tests pass plain `{ main, url }` objects, so both outcomes are tested in-process on any Node.
