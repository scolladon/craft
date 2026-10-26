---
subjects:
  - skills/impact-triage/SKILL.md
supersedes: []
---
# 705 — The session writes triaged backlog entries

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/discovered-impacts.md · **Supersedes/Refines:** none

## Context

`contracts/delivery.md` forbids role agents writing backlog files, and the triager has no write tool.

## Options considered

1. **The session writes, from the triager's drafted entries** *(recommended)* — pros: honours the delivery contract / cons: none
2. **The triager writes with Edit scoped to the backlog** — cons: a contract carve-out and a write tool on a Bash-capable agent

## Decision

Option 1. The triager drafts; the session writes the `backlog:*` entries in one run-scoped section and one commit.

## Consequences

The triager stays read-only.
