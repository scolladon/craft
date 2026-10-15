---
subjects:
  - docs/contributing/specs/codex-poc-record.md
  - adapters/codex/README.md
  - BACKLOG.md
---
# 576 — Docs describe assertRulesIntegrity as an unwired check

- **Status:** accepted
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/codex-0162-reprobe.md · **Supersedes/Refines:** none

## Context

BACKLOG and the POC record call `assertRulesIntegrity` a "hermetic, scriptable install/launch
precondition". A search of the tracked tree finds it only in `adapters/codex/src/execpolicy-rules.js`
and its test: no bin, launch path or install step calls it.

## Options considered

1. **State it exactly: an exported, unit-tested check with no caller in the binding** — pros: every
   claim is backed by the code / cons: a weaker-sounding mitigation. *(designer's recommendation)*
2. **Keep "install/launch precondition"** — pros: no edit / cons: rewrites an unbacked claim into
   three re-touched surfaces.
3. **Wire it into a launch or trust path now** — pros: makes the claim true / cons: a fix, out of
   this re-check run's scope.

## Decision

Option 1, adopted-as-recommended (no user judgment): it follows ADR-320's rule to correct falsified
rows. Every surface this run touches calls the check unwired and says it protects only when something
invokes it. Wiring it is a follow-up (ADR-575), not this change.

## Consequences

- The mitigation wording now matches the code; a later wiring change updates it.
