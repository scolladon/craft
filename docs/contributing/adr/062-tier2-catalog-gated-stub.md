# 062 — Tier-2 catalog entry ships as a gated stub (documented after P14)

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P12-dx.md · **Supersedes/Refines:** none

## Context

The injection catalog (PRD §7) has three tiers; Tier 2 is the **derived-plugin extension surface**
(point #12) — register your own phases/agents/profiles/backlog-adapters from a plugin that depends on
craft. Cross-plugin dispatch is spike-confirmed GREEN (SP2, SPIKE.md), so Tier 2 is *real*. But the
extension surface itself lands at **P14**, after P12. PRD §17 is explicit: *"P12's Tier-2
documentation is still written only after P14 lands, so the catalog never advertises an unproven
surface."* How should P12's guide present Tier 2 today?

## Options considered

1. **Gated stub** — list Tier 2 in the catalog with its value/cost, but mark it *"documented after
   P14"* and link the PRD, instead of a how-to + sample. pros: honest — shows the tier exists and is
   confirmed, without advertising steps a user can't yet run; matches PRD §17 sequencing. *(chosen)*
2. **Full Tier-2 docs now** — write the registration how-to + a derived-plugin sample. cons:
   advertises a surface P14 hasn't shipped; the sample would not be exercisable, violating the same
   anti-rot discipline that makes the catalog trustworthy ([[063-lintable-examples-and-ci-gate]]).
3. **Omit Tier 2 entirely** — only document Tier 0/1. cons: hides a real, confirmed capability; a
   newcomer can't see the ceiling of what craft will support.

## Decision

Tier 2 is a **gated stub** in both `docs/GUIDE-customizing.md` and `examples/README.md`: the catalog
row names the point and its trade-off, states *"documented after P14,"* and links PRD §7/§17. No
how-to, no derived-plugin sample ships at P12. Relatedly, point #11 *insert a phase* carries a
caveat: dispatch works today (P7), but full inserted-phase **contract execution** for a brand-new
descriptor id is wired at P14 — so the guide marks it rather than implying full support.

## Consequences

- The catalog is complete (all 12 points visible) yet advertises only what runs today.
- When P14 lands, the stub becomes the Tier-2 how-to + a derived-plugin example, and the #11 caveat is
  lifted — a bounded, pre-identified follow-up.
- Cross-links: the single-doc decision [[061-dx-guide-single-entry-doc]]; the anti-rot gate
  [[063-lintable-examples-and-ci-gate]].
