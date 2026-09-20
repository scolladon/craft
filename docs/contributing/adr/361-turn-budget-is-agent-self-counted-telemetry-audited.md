---
subjects:
  - contracts/core.md
  - engine/src/contract.js
---
# 361 — Turn budget is enforced by agent self-count, audited by telemetry

- **Status:** accepted
- **Date:** 2026-09-20
- **Design:** docs/contributing/design/shrink-agent-context-cost.md · **Supersedes/Refines:** none

## Context

Part B adds a turn budget so a part-implementer that has run past its useful life hands
back instead of continuing. But craft cannot count another agent's turns: the spawn
surface exposes no counter, and a running sub-agent reports nothing until it returns. The
enforcement point therefore has to be chosen knowing that none of the options is airtight.

## Options considered

1. **Agent self-counts its tool calls against the contract line** (recommended) — pros: the
   only option where the budget can fire mid-part, which is the whole point / cons:
   unreliable; the agent obeys or it does not.
2. **Orchestrator checkpoints on commit cadence** — pros: the session does the counting /
   cons: can only act at commits the agent chooses to make, so a runaway that never commits
   is never caught. Coarse and still agent-dependent.
3. **Contract line only, telemetry as after-the-fact audit** — pros: honest about what craft
   can do / cons: option 1 minus the instruction to act.

## Decision

The budget is a contract line the agent applies to itself, denominated in **tool calls**
(a unit the agent can observe; billed turns it cannot). On reaching the budget the agent
commits what is green, writes a handback naming done / remains / next RED, and returns.
The orchestrator respawns fresh from the artifact against the same part.

Enforcement is honest-unreliable by construction. What makes it correctable rather than
decorative is the audit: Part D emits per-phase tool-call counts, so an agent that sails
past its budget shows up in the ledger and in a `turn-budget` recommendation.

## Consequences

- The handback-respawn path, which today fires only for a DEAD agent, becomes a normal
  outcome that a healthy agent can choose.
- A budget breach is visible run-over-run rather than silent; the rule can be tightened or
  relaxed against evidence.
- Craft never claims the budget is a hard limit. Any future hard limit needs a spawn-side
  counter that does not exist today.
