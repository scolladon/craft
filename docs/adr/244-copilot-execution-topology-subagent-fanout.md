# 244 — Copilot execution topology: subagent fan-out

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-copilot-binding.md · **Supersedes/Refines:** Contrasts ADR-229 (pi is role-less/sequential)

## Context

The two sibling adapters sit at opposite ends of the topology axis: opencode is subagent-capable, pi is role-less and sequential. Which one Copilot mirrors had to be pinned live, never fabricated. The probe confirmed a real subagent model: a `task` tool taking `{ name, prompt, agent_type, description, model?, reasoning_effort?, context_tier?, mode? }` with `mode: "background"｜"sync"`; companion tools `list_agents` and `read_agent`; per-subagent config under `subagents.agents.<name>` (`model`/`effortLevel`/`contextTier`, each possibly `"inherit"`); an `--agent <agent>` selector; a `/fleet` mode for parallel subagent execution; and a built-in `rubberDuck` subagent.

## Options considered

1. **Subagent fan-out — mirror `adapters/opencode/`** *(designer recommendation)* — pros: matches the live-pinned capability; lets craft role agents map onto real Copilot subagents. Cons: none — the capability is confirmed.
2. **Role-less / sequential — mirror `adapters/pi/`** — cons: discards a real, confirmed capability and would misrepresent the binding.
3. **Hybrid** — cons: no motivating constraint.

## Decision

*Adopted as recommended (no user judgment).* Option 1. Copilot is **subagent-capable**, so `adapters/copilot/` mirrors `adapters/opencode/` — `agents/` + `skills/` + a guard binding — not `adapters/pi/`'s role-less prompt rendering. The Execution port's `spawn` maps a craft role to a Copilot subagent via the `task` tool and `subagents.agents.<name>` configuration. No subagent model is fabricated; every element above is live-confirmed.

## Consequences

- `adapters/copilot/agents/craft-*.md` carries the nine craft role agents, bodies verbatim per ADR-242.
- The Model port's per-role tier maps onto `subagents.agents.<name>.model`, with `--effort` as the reasoning-effort companion.
- Subagent identity attribution in telemetry stays unpinned (D7) until the on-demand smoke; `role` ships as `null` rather than guessed.
