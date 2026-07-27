# 254 — Codex execution topology: subagent fan-out

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-codex-binding.md · **Supersedes/Refines:** Mirrors ADR-244 (copilot execution topology subagent fan-out); contrasts ADR-229 (pi role-less/sequential)

## Context

Row 15 pins Codex as subagent-capable: namespace `multi_agent_v1` (`spawn_agent`, `send_input`, `wait_agent`, `resume_agent`, `close_agent`), read directly off the request body under the BYOK harness. "4 available concurrency slots… including you" is the pinned text. Row 15a is the trap: Codex injects `<multi_agent_mode>Do not spawn sub-agents unless the user or applicable AGENTS.md/skill instructions explicitly ask for sub-agents, delegation, or parallel agent work.` — fan-out silently degrades to sequential, with no error, unless the binding explicitly asks.

## Options considered

1. **Fan-out via `multi_agent_v1`, ask carried in the adapter-authored entrypoint** (a "skill instruction", one of the three sources Codex names as authoritative), batched to the concurrency cap *(chosen)* — pros: uses a live-confirmed capability; the ask lives in a single-sourced, adapter-authored surface. Cons: none material.
2. **Ask carried in the `codex exec` prompt string** the user types — cons: puts a load-bearing invariant in a string a human retypes, exactly the drift R-G2 exists to prevent.
3. **Ship sequential-only, mirroring `adapters/pi`** — cons: discards a live-confirmed capability and is strictly worse than opencode/copilot for no reason.

## Decision

*Adopted as recommended (no user judgment).* Option 1. `adapters/codex/` mirrors `adapters/copilot/` and `adapters/opencode/` — agents/ + entrypoint + guard binding — not `adapters/pi/`'s role-less sequential rendering. The adapter-local entrypoint carries one Codex-native paragraph explicitly asking for delegation via `multi_agent_v1`/`spawn_agent`, without restating the shared `run` skill's procedure. **The 4-slot cap includes the orchestrator — usable fan-out width is 3, not 4** — and craft's review phase, which fans out one worker per dimension, must batch to that cap since over-subscription behaviour at `spawn_agent` (block, queue, or error) is unpinned. `codex exec` takes one user message and runs the whole run to completion — **one invocation walking all phases**, the copilot/opencode shape, **not** one invocation per phase (pi's shape, forced there only by the absence of subagents).

## Consequences

- A test asserts the delegation-ask text is present in the entrypoint, since degradation to sequential is silent and would otherwise pass undetected.
- The review phase's fan-out is explicitly batched to 3 concurrent workers rather than assumed unbounded.
- The nine `agents/craft-*.md` files carry bodies byte-identical to the shared craft agent bodies (ADR-251's agents clause), only frontmatter re-expressed.
