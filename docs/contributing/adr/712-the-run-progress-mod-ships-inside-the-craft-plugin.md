---
subjects:
  - hooks/hooks.json
  - hooks/progress/register.tsx
---
# 712 — The run-progress mod ships inside the craft plugin

- **Status:** accepted
- **Date:** 2026-10-27
- **Design:** docs/contributing/design/run-visibility-task-list.md · **Supersedes/Refines:** none

## Context

Probes showed one `hooks/hooks.json` may carry both `"hooks"` and `"modules"` (`claude plugin validate` passes), a module inside the craft plugin can import the pure engine, and a separate mod plugin cannot import from outside its own folder.

## Options considered

1. **Inside the craft plugin: `hooks/hooks.json` `"modules"` plus `hooks/progress/`** *(recommended)* — pros: one plugin; imports `engine/src` directly; finds `run-ledger.sh` from its own root / cons: loads in every craft session
2. **A separate plugin dir listed in the marketplace** — cons: vendored engine copy behind a sync check; cannot learn craft's root
3. **User-local mods folder** — cons: unversioned, untested

## Decision

Option 1, ratified by the user.

## Consequences

The module is inert without a run pointer: one `run-ledger.sh dir` call per session. Whether craft's command hooks still fire with mods turned off is a user-run live check.
