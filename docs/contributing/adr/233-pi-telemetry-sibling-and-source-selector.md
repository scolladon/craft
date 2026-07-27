# 233 — build the pi telemetry sibling + a generic `--source pi` selector now

- **Status:** accepted
- **Date:** 2026-07-19
- **Design:** docs/design/native-pi-binding.md · **Supersedes/Refines:** Mirrors ADR-227 (opencode telemetry)

## Context

The telemetry `collect` binding's established home is `engine/src/observability/adapters/<binding>/` — an explicit exception to ADR-085 bound to the `UsageEvent` contract (the claude and opencode bindings live there). pi's `--mode json` usage shape is pinned (design §D2 row 15: usage on assistant `message.usage={input,output,cacheRead,cacheWrite,totalTokens,cost}`, no top-level `{type:"usage"}` event). Mirroring the opencode telemetry port (ADR-227) keeps the three bindings symmetric.

## Options considered

1. **Build `engine/src/observability/adapters/pi/telemetry.js` + `--source pi` now** *(designer recommendation)* — pros: the `--mode json` shape is pinned; mirrors ADR-227; gives the `report.json`-parity success criterion. Cons: one additive engine/src touch (the sibling) + a generic selector touch.
2. **Defer telemetry; metrics via existing paths only** — cons: forfeits `report.json` parity across bindings.

## Decision

*Adopted as recommended (no user judgment).* Option 1, mirroring ADR-227. The pi `collect` binding is `engine/src/observability/adapters/pi/telemetry.js`, parsing the pinned `pi --mode json` event lines → the vendor-neutral `UsageEvent[]` (reusing `aggregate`/`serializeReport` unchanged). `usage-mine-main.js` gains `pi` in its `SOURCES` map (the `Object.hasOwn` fail-closed gate already guards it) and a **source-aware read root** (claude→`~/.claude/projects`, pi→`~/.pi/agent/sessions`/`PI_CODING_AGENT_SESSION_DIR`) so containment is checked against the right root. Both engine touches are generic and binding-neutral.

## Consequences

- `report.json` byte-parity preserved (schema deep-sorted, 2-space, single trailing newline).
- pi cannot attribute `role`/`phase` per event (no subagent field): `role` is `null`, `phase` is caller-injected (ADR mirrors the role-less semantics, design §D6).
- The source name `pi` == the pidev coding agent (ADR-238 repurposes the reserved slot).
- Real non-zero usage values + the canonical per-turn usage line choice are DEFERRED to the smoke (design §D2 rows 22/24).
