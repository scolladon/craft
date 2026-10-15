---
subjects:
  - adapters/codex/src/execpolicy-rules.js
  - adapters/codex/craft.rules
---
# 573 — The generated craft.rules disclosure is worded version-free

- **Status:** accepted
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/codex-0162-reprobe.md · **Supersedes/Refines:** refines ADR-255

## Context

`buildExecpolicyRules()` emits a header saying a malformed `.rules` file "does not fail closed".
On codex-cli 0.162.1 that is false on the binding's own launch path: `codex exec` refuses to start on
a malformed `$CODEX_HOME/rules` file (3/3), while the app-server thread/turn path still skips the
rules and runs the command (3/3). The header is byte-pinned by `assertRulesIntegrity` and a drift
test, so any wording change is a code change.

## Options considered

1. **Docs only** — pros: the run stays docs-only / cons: a falsified sentence stays in a file
   operators copy.
2. **Version-free reword, regenerated, with a RED pin** — pros: true on both observed surfaces and
   across future re-probes / cons: one code part in a mostly-docs run. *(designer's recommendation)*
3. **Version-pinned surface split in the generated file** — pros: most precise / cons: every
   re-probe becomes a code and test change through the byte pin.

## Decision

Option 2, ratified by the user. The generated disclosure, the `assertRulesIntegrity` JSDoc and its
refusal message state that a malformed `.rules` file is not a reliable denial: depending on the codex
entry point it either refuses to start or skips the rules and runs commands, so treat it as fail
open. They carry no codex version; version-pinned observations live in the POC record.

## Consequences

- `adapters/codex/craft.rules` is regenerated in the same commit; the drift test stays green.
- A test pins the new wording and rejects the old "does not fail closed" universal.
- ADR-255's fail-open posture is kept, not softened.
