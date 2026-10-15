---
subjects:
  - adapters/copilot/hooks/craft-guard.js
  - adapters/copilot/config.template.json
supersedes: []
---
# 586 — The copilot hook is renamed craft-guard

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md

## Context

`craft-observer.js` names an audit-only layer; the hook now enforces. Codex, cursor and antigravity
name their guard `craft-guard.js`.

## Options considered

1. **Rename to `craft-guard.js`** *(recommended)* — a stale config pointing at the old path makes
   node exit 1, which denies (fails closed, loudly).
2. **Keep the name** — cons: the name says the opposite of what it does.

## Decision

Adopted-as-recommended (no user judgment): option 1; aligns with the sibling bindings' naming.

## Consequences

Users re-merge `config.template.json`; the README says so.
