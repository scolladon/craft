# 227 — opencode telemetry lives in the port home; a generic `--source` selector wires it

- **Status:** accepted
- **Date:** 2026-07-17
- **Design:** docs/design/opencode-adapter.md · **Supersedes/Refines:** Refines ADR-085

## Context

The telemetry `collect` binding's established home is `engine/src/observability/adapters/<binding>/` (the claude binding lives there; pi is reserved there) — an explicit exception to ADR-085's top-level-adapters rule, bound to the `UsageEvent` contract. Adding opencode needs a generic `--source claude|opencode` selector in `usage-mine-main.js`, an additive engine/src touch. R-SC2 lists "engine untouched" as a success criterion, so this is the one place the port would (generically) edit `engine/src`.

## Options considered

1. **Sibling at `engine/src/observability/adapters/opencode/telemetry.js` + a generic `--source claude|opencode` selector in `usage-mine-main.js`** *(designer recommendation)* — pros: consistent with where the claude binding already lives; the selector benefits any binding (telemetry.md already carries a `source` concept); `report.json` byte-parity preserved. Cons: one additive engine/src touch.
2. **Strictly additive under `adapters/opencode/`, feed a thin CLI into engine `aggregate`** — pros: engine literally untouched. Cons: splits the telemetry binding away from its established port home.
3. **Defer telemetry** — cons: forfeits `report.json` parity.

## Decision

*Ratified by the user.* Option 1. The opencode `collect` binding lives at `engine/src/observability/adapters/opencode/telemetry.js`; `usage-mine-main.js` gains a generic `--source claude|opencode` selector. This is the single, additive, generic `engine/src` touch the port makes — reusing the pure `aggregate` + `serializeReport` core unchanged.

## Consequences

- `report.json` byte-parity preserved (schema deep-sorted, 2-space, single trailing newline).
- R-SC2's "engine untouched" is read as **no functional change beyond the additive sibling + the generic source selector** — both behaviour-preserving for existing bindings.
- The exact `opencode run --format json` event schema (token/model/duration/role/session fields) is a live-smoke item (design §D9 row 25); CI fixtures are frozen captures pending the pin.
