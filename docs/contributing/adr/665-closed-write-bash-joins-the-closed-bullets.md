---
subjects:
  - docs/contributing/specs/gate.md
  - adapters/copilot/README.md
supersedes: []
---
# 665 — The closed write_bash fact joins the existing closed bullets

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-21
- **Design:** docs/contributing/design/copilot-write-bash-pty-probe.md · **Supersedes/Refines:** none

## Context

`docs/contributing/specs/gate.md` and `adapters/copilot/README.md` each list the copilot
`write_bash` pty channel as an unguarded residual. On copilot 1.0.98 the tool is not registered for
the model in either session mode, so the residual closes. Both files already carry a closed-family
bullet, and the codex `write_stdin` residual was closed by joining it.

## Options considered

1. **Delete the residual bullet and append the fact to the existing closed bullet** *(recommended)*
   — pros: mirrors the codex `write_stdin` close; one closed-family bullet per file / cons: that
   bullet grows longer
2. **Fold it into the cross-call shell-state bullets** — pros: shell facts sit together / cons:
   mixes in a fact with a different version pin
3. **A standalone closed bullet in each file** — pros: easy to find / cons: a third closed-bullet
   shape

## Decision

Ratified by the user: option 1. Each file loses its residual bullet, and its closed bullet gains the
1.0.98 fact, the hook-sees-`write_bash` note and the re-open trigger: a copilot version whose
request `tools` list carries `write_bash` again.

## Consequences

The re-open trigger is worded the same in both files and in the PoC record, so one re-probe updates
all three.
