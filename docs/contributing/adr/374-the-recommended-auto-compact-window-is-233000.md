---
subjects:
  - docs/guides/customizing.md
---
# 374 — craft recommends `autoCompactWindow: 233000` and never writes it

- **Status:** accepted
- **Date:** 2026-09-22
- **Design:** docs/contributing/design/auto-compaction-safety.md · **Supersedes/Refines:** none

## Context

Compaction fires at `T = autoCompactWindow − 33000` on a 1M-window model, so the default fires at
967k: a run that reached 761k never compacted and paid full context on every turn. The value is
read at launch only and every Agent spawn inherits it unchanged, so one setting governs both the
orchestrator and its spawns.

## Options considered

1. **233000 (fires at 200k)** *(recommended)* — pros: keeps orchestrator turns at or below 200k /
   cons: planning spawns (last run: average context 222k) and validation spawns (250k) will compact
   mid-task; the net token effect on spawns is extrapolated, not measured.
2. **283000 (fires at 250k)** — pros: spares most planning spawns / cons: up to 50k more context on
   every orchestrator turn before compaction.
3. **Document the formula, no value** — cons: every user re-derives the same number.

## Decision

Ratified by the user as recommended. `docs/guides/customizing.md` recommends
`autoCompactWindow: 233000`. It shows how to scope it to a craft session
(`claude --settings '{"autoCompactWindow":233000}'`) or to user settings, and states the formula,
the launch-only read and the inheritance by spawns. craft documents the setting and never writes
the user's settings.

## Consequences

- Spawns above 200k will compact mid-task; the sub-agent survival rule (ADR-376) is what makes that
  safe.
- The first runs under this setting are the measurement that confirms or revises the value.
