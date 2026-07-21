# 257 — Codex telemetry built now

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-codex-binding.md · **Supersedes/Refines:** Mirrors ADR-245 (copilot telemetry built now against OTel), contrasts on source strength

## Context

`turn.completed.usage` = `{input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens}` is **CONFIRMED in-stream** (row 4) — the key contrast with Copilot, whose stream carries no token counts at all. Session persistence is `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl` (row 5). Whether the persisted rollout file carries the same envelope observed in the stream is row 5a, **DEFERRED** — not parsed.

## Options considered

1. **Build `collect` + `--source codex` now against the CONFIRMED `turn.completed` envelope**, parsing wherever it appears, with row 5a recorded as an open DEFERRED row *(chosen)* — pros: ships the strongest telemetry position of any binding without delay. Cons: if the persisted rollout shape differs from the stream shape, the miner reports zero against real history until row 5a is closed.
2. **Build now, but pin the persisted rollout shape first** (read one existing rollout `.jsonl`, or generate one under a `mktemp` throwaway `CODEX_HOME` with the BYOK harness) — the designer's recommendation — pros: closes row 5a before shipping. Cons: an extra probe step gating the change.
3. **Defer the binding entirely until a rollout file is parsed** — cons: wastes the strongest telemetry position of any binding for no proportionate reason.

## Decision

**Ratified by the user — deviates from the designer's recommended option 2.** Option 1. `engine/src/observability/adapters/codex/telemetry.js` plus additive `SOURCES.codex` / `DEFAULT_READ_ROOTS.codex` entries ship now. Row 5a stays explicitly **DEFERRED** in `docs/adapters/codex-poc-record.md` — the parser is envelope-shaped, not location-shaped, so a shape mismatch fails safe (zero events, never a wrong number) but is a real, documented gap, not a silently assumed one. Two hazards are stated, not glossed: **`--ephemeral` suppresses the very session files `--source codex` mines** — mutually exclusive, and launch args must never set it for a telemetry-bearing run; and **`usage-mine`'s `readdirSync` is non-recursive**, so `DEFAULT_READ_ROOTS.codex` is the containment boundary (`$CODEX_HOME/sessions`) while `--dir` at invocation time must name the `YYYY/MM/DD` leaf — pointing `--dir` at `sessions/` yields a zero-cost report that reads as success.

## Consequences

- No engine core logic changes; both entries are additive to lookups that already exist for this purpose.
- Row 5a remains visibly DEFERRED until a rollout file is actually parsed — a follow-up, not a silently closed row.
- `docs/adapters/telemetry.md`'s Codex section documents the leaf-vs-containment-root distinction explicitly, since the failure mode reads as success.
