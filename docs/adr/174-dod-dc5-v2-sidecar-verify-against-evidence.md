# 174 — DC-5 v2 DoD: structured sidecar, criteria verified against engine-recorded evidence

- **Status:** accepted
- **Date:** 2026-06-28
- **Design:** docs/design/clear-backlog-candidates-gated.md · **Builds on:** 109

## Context

P20 shipped a free-text DoD at `docs/DOD.md` / `paths.dod` (ADR-109). Two follow-ups were
parked: a structured/checkable schema (DC-5 v2) and the contributor-branch trust model. They
are coupled — the structured form is where the trust property is enforced.

## Options considered

- Schema: (2a) optional structured sidecar at `paths.dod`; (2b) new top-level `dod:` key; (2c)
  keep free-text.
- Trust: (3a) criteria are claims verified against engine-recorded gate evidence (named by
  phase id); (3b) trusted-path / diff-vs-default-branch flag; (3c) signed DoD.

## Decision

**2a + 3a.** A structured DoD is an optional sidecar the existing `paths.dod` knob already
points at (back-compat: free-text still parses; structured form is opt-in). Each criterion is
tagged `auto` (machine-checkable) or `judgment`. An `auto` criterion names a phase whose result
the **engine recorded** (`assert.gate: <phase-id>`) or a `file-exists` assertion — never a
command the DoD document itself supplies.

This is what makes it injection-safe on contributor branches: a contributor editing the DoD
can only reference evidence the engine already produced; they cannot inject a command, nor
assert green for a gate that ran red. Asserting agents treat every criterion as a **claim to
verify against phase evidence**, never as ground truth, and the DoD content is part of the
reviewed diff. The existing fence (DoD is data, never engine instructions) is unchanged; this
adds mechanical met-ness for the `auto` subset on top of it.

## Consequences

- New pure `engine/src/dod.js` (parse + classify + assert-against-evidence); `manifest.js`
  validates the structured shape when present; the validation skill prose reads it.
- `judgment` criteria stay human-asserted; absence still records the non-blocking
  `NO-OP(verify): no DoD declared` line.
- No new manifest top-level key; no engine gate floor changes.
