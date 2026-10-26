---
subjects:
  - skills/run/SKILL.md
  - skills/documentation/SKILL.md
supersedes:
  - adr: "609"
    scope: "the fold rule lives in documentation synthesis and the run delivery bullet"
---
# 709 — The fold-or-defer rule is a cross-phase invariant

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/discovered-impacts.md · **Supersedes/Refines:** supersedes ADR-609

## Context

Every phase now captures impacts at discovery, and the orchestrator holds the run skill for the whole walk. ADR-609 placed the fold rule in documentation step 3, a later phase review and implementation would have to consult.

## Options considered

1. **A cross-phase invariant in `skills/run/SKILL.md`; documentation step 3 cites it** *(recommended)* — pros: one place every phase reaches
2. **Keep it in documentation step 3; capture points cite that skill** — cons: earlier phases consult a later phase's skill

## Decision

Option 1. The run skill gains the invariant "Impacts: fold or defer at discovery" after "Scope expansion re-enters the harness-read phase". Documentation step 3 cites it, and its file sub-step becomes defer.

Superseded from ADR-609: the fold rule lives in documentation synthesis and the run delivery bullet.

Carried forward from ADR-609: the fold step still precedes any deferral within documentation step 3, and the skill frontmatter still names folding.

## Consequences

ADR-609 is superseded for where the rule lives.
