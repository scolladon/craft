---
subjects:
  - engine/src/rulings-hint-main.js
  - engine/bin/rulings-hint.js
  - engine/src/intention.js
  - scripts/governing-corpus.sh
  - skills/run/SKILL.md
  - docs/contributing/specs/intention.md
supersedes:
  - adr: "351"
    scope: "how governing decisions reach the phases: a rulings-hint bin at design, decisions and planning entry replaces consult's governing lane"
---
# 739 — The rulings slice reaches the phases through a `rulings-hint` bin

- **Status:** accepted
- **Date:** 2026-11-20
- **Design:** docs/contributing/design/doctrine-register.md · **Supersedes/Refines:** supersedes ADR-351 (governing lane)

## Context

Today `consult` loads the governing ADR slice once, at run start. The decisions phase writes rulings mid-run, and planning must see them.

## Options considered

1. **A `rulings-hint` bin at each `design`/`decisions`/`planning` entry, touched set on stdin, reading the working-tree register; the governing lane is removed from `consult`** *(recommended)* — pros: planning sees this run's rulings; no in-session state; reuses the `lessons-hint` shape / cons: one more bin.
2. **Keep `consult`'s governing lane, its source switched to register lines** — cons: loads before the decisions phase writes, so planning misses this run's rulings.

## Decision

**adopted-as-recommended (no user judgment)** — no trade-off: option 2 is strictly worse for planning. Lines print verbatim, superseded and rejected ones with their status, uncapped; path-less lines are counted, never sliced.

Superseded from ADR-351: the governing lane inside `consult` as the way decisions reach the phases.

Carried forward from ADR-351: decision memory enters the phases through its own channel, never through the living-page lane.

## Consequences

- `deps.listGoverning` is deleted; `scripts/governing-corpus.sh` stays for its lessons-directory listing and loses its ADR use.
