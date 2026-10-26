---
subjects:
  - contracts/core.md
  - agents/part-implementer.md
supersedes: []
---
# 708 — Every spawn reports out-of-perimeter findings as IMPACT lines

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/discovered-impacts.md · **Supersedes/Refines:** none

## Context

Today agents note out-of-scope findings as free-form handback prose, and the part-implementer's "deferred observations" are consumed by no skill.

## Options considered

1. **One line in `contracts/core.md`** *(recommended)* — pros: injected into every spawn, inserted and registered roles included
2. **A line in each agent def** — cons: misses third-party roles
3. **Nothing; harvest free-form notes** — cons: today's behaviour, the one being replaced

## Decision

Option 1. The core contract tells every agent to report an out-of-perimeter finding in its final message as `IMPACT(<file>): <finding> — proof: <command> ⇒ <expected>`, and never to fix it.

## Consequences

Every spawn prompt grows by one line.
