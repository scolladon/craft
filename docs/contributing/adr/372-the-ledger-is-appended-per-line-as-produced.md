---
subjects:
  - skills/run/SKILL.md
  - docs/contributing/specs/run-record.md
supersedes:
  - adr: "302"
    scope: "one append per phase boundary plus open and Done; resume granularity is the phase"
---
# 372 — The run ledger is appended per line, as each line is produced

- **Status:** accepted
- **Date:** 2026-09-22
- **Design:** docs/contributing/design/auto-compaction-safety.md · **Supersedes/Refines:** supersedes ADR-302 (write cadence only)

## Context

Auto-compaction fires on a token threshold at any API-call boundary, and the model cannot choose
the moment. ADR-302 flushes the ledger once per phase boundary, so everything a phase has produced
since its start (gate results, part outcomes, waivers) exists only in session context until the
phase closes. A compaction in that window hands the orchestrator a summary in place of those
facts, and the spike measured a summary losing or distorting a fact that came from a tool result.

## Options considered

1. **Per line, in the tool call that produces the line or the orchestrator's very next call** —
   pros: the loss window shrinks to one API call; every fact in it is re-derivable or
   re-producible / cons: more small appends.
2. **Keep the phase-boundary flush** — pros: fewest writes / cons: a mid-phase compaction loses the
   phase's lines, which is the failure this change exists to close.
3. **Per event class (gates, blockers) only** — cons: "what is an event" is undefined, the objection
   ADR-302 already raised.

## Decision

Ratified by the user in the brief (scope item 1). From the moment the run-id exists, every
run-record line is appended in the tool call that produces it or in the orchestrator's very next
tool call. The phase-boundary flush and the `Done` residual flush are removed.

Superseded from ADR-302: the write cadence, meaning "one append at each phase boundary (walk step 7),
plus one at open and one at `Done`", and its consequence that resume granularity is the phase.

Carried forward from ADR-302: the single-writer rule. Only the orchestrator's own tool calls write the
ledger; role agents never do, and agent contracts carry no ledger clause.

## Consequences

- The run skill and the run-record spec state the same flush-per-line rule, and a test pins both.
- Resume granularity becomes the line. A fact lost in the one-call gap is either re-derivable (the
  gate re-runs) or re-producible (respawn from the committed artifact).
- The only remaining in-session buffer is §0 before the run-id exists, which is bounded and
  re-derivable by re-running §0.
