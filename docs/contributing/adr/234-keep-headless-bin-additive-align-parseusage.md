# 234 — keep the headless bin additive, and align its stale `parseUsage` to pi 0.80.10

- **Status:** accepted
- **Date:** 2026-07-19
- **Design:** docs/design/native-pi-binding.md · **Supersedes/Refines:** Refines ADR-086/090

## Context

The native surface is additive to the headless `craft-pi` bin (ADR-086/090 keep the subprocess Execution binding). Live-pinning found a latent bug: `adapters/pi/src/execution.js#parseUsage` expects a `{type:"usage"}` event that pi 0.80.10 no longer emits — usage moved to assistant `message.usage` (design §D2 row 15). So `parseUsage` is dead against the installed pi. The build touches pi telemetry parsing anyway (ADR-233), making the fix thematically adjacent.

## Options considered

1. **Keep the headless bin as-is; log the `parseUsage` staleness as a follow-up** *(designer recommendation)* — pros: tightest scope; the headless path is the 0.79.8 binding. Cons: ships a known-dead usage parser.
2. **Keep the bin additive AND align `execution.js#parseUsage` to the 0.80.10 `message.usage` shape in this change** — pros: fixes a real latent bug adjacent to the new telemetry sibling; one shared pinned shape feeds both paths. Cons: widens scope into the headless path.

## Decision

*Ratified by the user* (deviates from the designer's recommendation). Option 2. The native surface stays additive (the headless bin is not replaced), AND `adapters/pi/src/execution.js#parseUsage` is aligned to read pi 0.80.10's `message.usage` (`{input,output,cacheRead,cacheWrite,...}`) with RED→GREEN test cover over the pinned shape. The pinned `message.usage` shape (design §D2 row 15) is single-sourced conceptually between the headless `parseUsage` and the telemetry sibling (ADR-233).

## Consequences

- The scope-fold rule applies: because this deviates from the design's recommendation, the design doc is revised against this ADR before planning.
- The headless bin's usage extraction works against the installed pi again (was dead on 0.80.10).
- The planner must include a headless-`parseUsage` alignment part alongside the telemetry-sibling part, both keyed off the same pinned `message.usage` shape.
