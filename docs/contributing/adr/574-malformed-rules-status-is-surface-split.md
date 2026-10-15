---
subjects:
  - docs/contributing/specs/codex-poc-record.md
  - adapters/codex/README.md
  - BACKLOG.md
---
# 574 — The malformed-rules status is recorded per codex surface, version-pinned

- **Status:** accepted
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/codex-0162-reprobe.md · **Supersedes/Refines:** refines ADR-255

## Context

The 2026-07-21 entry recorded a malformed `.rules` file as failing open at runtime. The 0.162.1
re-probe split that: `codex exec` refuses to start (fail closed, 3/3), the app-server thread/turn
path emits a `configWarning` and runs the command (fail open, 3/3), and the interactive TUI was not
probed.

## Options considered

1. **Surface split, version-pinned, still treated as fail open** — pros: keeps ADR-255's posture and
   records the new fact / cons: longer wording. *(designer's recommendation)*
2. **"Fails open on at least one surface"** — pros: short / cons: drops that the launch path now
   refuses loudly.
3. **"Fails closed on the binding's launch path"** — pros: matches the binding's own path / cons:
   overclaims, since the TUI is unprobed and any app-server client is exposed.

## Decision

Option 1, adopted-as-recommended (no user judgment): it follows ADR-255's fail-open posture and
ADR-320's rule to version-pin every observation. The POC record, the adapter README and BACKLOG state
the split pinned to 0.162.1, name the TUI as unprobed, and keep "treat it as fail open".

## Consequences

- Existing `/fail open/i` honesty pins keep matching.
- A future re-probe adds a dated row per surface rather than rewriting the status.
