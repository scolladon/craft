---
subjects:
  - engine/test
  - adapters/codex/test
---
# 565 — The entry swap-race tests run unconditionally

- **Status:** accepted
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/entry-guard-symlink-swap-race.md · **Supersedes/Refines:** none

## Context

The race tests need `import.meta.main` and `module.registerHooks`. Both exist on every Node ADR-564 supports; neither on Node 20. The design proposed a `skip` on Node without `import.meta.main`, premised on keeping the fallback.

## Options considered

1. **Skip when `import.meta.main` is not a boolean** — cons: the repo's first `skip`, guarding only a Node that ADR-564 no longer supports.
2. **Run always** *(recommended once ADR-564 settled)* — pros: no skip; any supported Node runs them.

## Decision

Option 2, ratified by the user after ADR-564 voided the skip's premise. No `skip` option. The unsupported-Node behaviour is pinned in-process by a unit test: `isEntryPoint` with no boolean `main` throws.

## Consequences

Running the suite on unsupported Node fails, as every bin spawn already does there.
