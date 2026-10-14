---
subjects:
  - hooks/git-no-ext-diff.sh
  - docs/contributing/specs/gate.md
---
# 552 — The timeout text states the process-tree TERM and the SIGKILL escalation

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/claude-hook-foreground-stall-probe.md · **Supersedes/Refines:** none

## Context

The header says Claude Code "sends SIGTERM at the deadline", and ADR-541 says the TERM trap waits for a foreground child. Read together, a maintainer can infer the deny lands only when the child returns, or that a slow child hangs the session. The probe shows neither: the TERM reaches the whole tree, and survivors are SIGKILLed.

## Options considered

1. **Drop the qualifier only** ("a stall in a foreground command fails open the same way") — pros: shortest / cons: leaves the hang reading open.
2. **State the mechanism in both places** *(recommended)* — header: SIGTERM to the whole process tree, so a stalled `cat`, `jq`, `grep` or `sed` dies, and survivors are SIGKILLed; `gate.md` adds the by-parent-pid walk and the 1.2–1.7 s bracket.
3. **Mechanism in `gate.md` only, minimal header** — cons: the header is where a maintainer weighing a trap change or a self-deadline reads first.

## Decision

The user chose option 2. The process-group detail and the delay bracket stay out of the header: no hook code depends on them. Placement stays as ADR-538 and ADR-547 set it.

## Consequences

The header grows by about one line. Both texts rule out a hang and a late deny without the reader joining two ADRs.
