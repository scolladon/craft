---
subjects:
  - skills/decisions/SKILL.md
supersedes:
  - adr: "433"
    scope: "the adopt threshold: adopt only a clear recommendation aligned with an ADR or stated principle, escalate the rest"
---
# 727 — decisions escalates only on conflict, irreversibility, or an uncovered trade-off

- **Status:** accepted
- **Date:** 2026-11-05
- **Design:** docs/contributing/design/decisions-doctrine-layer.md · **Supersedes/Refines:** supersedes ADR-433 (threshold)

## Context

Of 177 user-ratified ADRs, 9 went against the design's recommendation. Under ADR-433 every candidate without an aligning ADR escalates, including mechanical choices with no trade-off, so most escalations change nothing.

## Options considered

1. **Escalate only on (a) conflict with an ADR or doctrine entry, (b) an irreversible or outward-facing choice, (c) a real trade-off no ADR or entry covers; adopt the rest citing `ADR-NNN`, `DOCTRINE(D-<n>)` or `no trade-off`** *(recommended)* — pros: asks only where a ruling can change the outcome / cons: "no trade-off" is a new session judgment.
2. **Keep ADR-433; add doctrine as an alignment source only** — cons: mechanical choices still escalate.

## Decision

Ratified by the user: option 1. A candidate is escalated only when (a), (b) or (c) holds; any trigger escalates, and a covering entry does not override (a) or (b). A candidate without a clear recommendation falls under (c). Every other candidate is adopted, and its ADR marks `**adopted-as-recommended (no user judgment)** — <basis>`. The PR body lists adopted ADRs apart from ratified ones, each with its basis.

Superseded from ADR-433: the adopt threshold (adopt only a clear recommendation aligned with an ADR or stated principle; escalate every other candidate).

Carried forward from ADR-433: adopted candidates are still authored as ADRs marked adopted-as-recommended; whether an ADR or entry aligns or covers stays a session judgment; the no-op path is unchanged.

## Consequences

- Fewer escalations; a mistaken adoption is reversed by supersession after the PR.
- The clear-and-covered-trade-off case gets an eval (ADR-729).
