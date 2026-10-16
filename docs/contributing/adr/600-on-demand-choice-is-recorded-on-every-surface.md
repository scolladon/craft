---
subjects:
  - adapters/codex/src/execpolicy-rules.js
  - docs/contributing/specs/codex-poc-record.md
  - BACKLOG.md
---
# 600 — The on-demand choice is recorded on every surface that describes the check

- **Status:** accepted
- **Date:** 2026-10-16
- **Design:** docs/contributing/design/rules-integrity-launch-wiring.md · **Supersedes/Refines:** refines ADR-576

## Context

ADR-599 keeps `assertRulesIntegrity` on demand. The JSDoc says "Nothing in the binding calls this
check yet", which implies a pending wiring that is no longer planned. The POC record row 3, its
integrity re-probe row and the delivered malformed-rules BACKLOG entry call the check unwired without
saying it is a decision. The probe that an empty or comments-only file parses cleanly is recorded
nowhere, and the open deploy-step entry is where it matters.

## Options considered

1. **Full record** — tick the entry with its reasons; replace the JSDoc "yet" with the on-demand
   reason; add "kept on demand" to POC row 3, the integrity re-probe row and the delivered BACKLOG
   entry; record the `execpolicy check` rows; append the empty-file fact to the deploy-step entry —
   pros: no surface implies a wiring that will not come / cons: edits one source comment.
   *(designer's recommendation)*
2. **Minimal** — the same without the JSDoc and deploy-entry edits — pros: docs-only / cons: the
   source keeps the false "yet"; the deploy step's scheduler misses the empty-file fact.
3. **Full record plus a README sentence on running the check** — pros: discoverable / cons: the README
   would document checking a file it never tells anyone to deploy.

## Decision

Option 1, ratified by the user. Every surface that describes the check states it is kept on demand
because the binding has no launch path of its own; none implies a future wiring. The README stays
silent on the symbol.

## Consequences

- The JSDoc changes; the thrown message, `buildExecpolicyRules()` and `craft.rules` do not, so the
  generated file is not regenerated (ADR-573 holds).
- The deploy-step entry stays open and unsolved, carrying the empty-file fact for whoever schedules it.
