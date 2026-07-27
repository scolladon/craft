# 238 — the reserved `pi` telemetry source slot is repurposed for the pidev coding agent

- **Status:** accepted
- **Date:** 2026-07-19
- **Design:** docs/design/native-pi-binding.md · **Supersedes/Refines:** Refines the RESERVED Pi binding note in docs/adapters/telemetry.md

## Context

`docs/adapters/telemetry.md` currently reserves the `pi` telemetry source-slot for a **Raspberry-Pi / single-board-computer** metrics source ("bind a Raspberry Pi… device's equivalent of transcript records"). The brief mandates `--source pi` mean the **pidev coding agent** (`pi --mode json`). The designer flagged this as intention-drift on an invariant-bearing port page, surfacing it as a decision rather than deciding it.

## Options considered

1. **Repurpose the reserved `pi` slot for the pidev binding + rewrite the Raspberry-Pi wording** *(designer recommendation)* — pros: matches the brief's `--source pi` selector; the reserved slot's purpose was extensibility. Cons: overwrites the originally-documented (never-built) hardware intent.
2. **Name the pidev source `pidev`; leave `pi` reserved for hardware** — cons: diverges from the brief's `--source pi`.
3. **Keep both conceptually under `pi`** — cons: ambiguous selector semantics.

## Decision

*Ratified by the user.* Option 1. The `pi` telemetry source-slot names the **pidev coding agent** (`pi --mode json` → `UsageEvent[]`). `docs/adapters/telemetry.md`'s Pi binding section is rewritten from the Raspberry-Pi wording to the pidev binding; `usage-mine --source pi` == pidev. The never-built hardware-metrics intent is retired (extensibility remains open under a differently-named future slot).

## Consequences

- The `--source pi` selector (ADR-233) has a single, unambiguous meaning: the pidev coding agent.
- This is a sanctioned edit to an invariant-bearing port page; the intention corpus is updated to match, so a later `assert-fresh` walk sees no lingering drift.
- The documentation phase carries this reconciliation into the affected port page and the PR body.
