---
subjects:
  - skills/run/SKILL.md
  - engine/bin/metrics-emit.js
---
# 363 — The metrics bin replaces the run skill's prose procedure

- **Status:** accepted
- **Date:** 2026-09-20
- **Design:** docs/contributing/design/shrink-agent-context-cost.md · **Supersedes/Refines:** refines ADR-119

## Context

`.claude/craft-metrics.md` is written by a prose procedure in the run skill's Done section
that asks the session to read a sub-agent transcript, match it to a phase by a sidecar
field, and hand-assemble the ledger line. Across three repos only 155 of 951 agent lines
carry cache columns, and 11 of those are false zeros — including `cache_read=0
cache_creation=0` for a 414k-token triager. `formatCacheSplit`, which degrades correctly to
`cache=na`, exists and no bin calls it.

## Options considered

1. **The bin replaces the prose outright** (recommended) — pros: one writer, no procedure to
   get wrong / cons: a phase whose transcript is missing needs the bin to say so rather than
   a human to improvise.
2. **Prose stays and calls the bin, manual path kept as fallback** — pros: a documented
   escape hatch / cons: keeps the failing path available under exactly the conditions that
   produce the failure — a long run, an exhausted context.
3. **Add the bin, leave the prose alone** — pros: smallest edit / cons: two independent
   writers for one append-only ledger.

## Decision

The Done section calls the emitter once and states nothing about transcript reading,
message-id folding, or cache columns. The bin is the only writer of the metrics ledger.

The procedure is the defect, not a victim of it: it asks a session to fold usage by message
id and to partition tool-use blocks by hand, and the false zeros are the evidence that this
does not survive a long run.

## Consequences

- A missing transcript becomes `transcript=na`, an explicit recorded outcome, rather than an
  improvised row or a silent omission.
- The rule "never emit 0 for an unknown" is enforced in code instead of asked for in prose.
- Bindings other than Claude need their own emitter path; the prose fallback no longer
  silently covers them.
