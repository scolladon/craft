# 061 — The DX guide is one entry doc (mental model + catalog + index)

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P12-dx.md · **Supersedes/Refines:** none

## Context

P12 (PRD §17, G10) ships the DX surface: a *clear mental model + injection catalog + repo samples*.
The raw material already exists but is developer-facing and scattered — the hexagon/ports model in
`docs/DESIGN-customizable-engine.md`, the injection catalog in `docs/PRD-customizable-engine.md §7`.
The success criterion is **SC7**: a newcomer tailors the pipeline (skip + insert + harness tune)
*from the docs alone in one sitting*. Where should the user-facing DX content physically live?

## Options considered

1. **One entry doc** — `docs/GUIDE-customizing.md` holds mental model → injection catalog →
   examples index → a one-sitting walkthrough, in that order. pros: a single place a newcomer reads
   end-to-end; matches the single-sitting SC7 task; one link from README + examples/README. cons:
   one longer file. *(chosen)*
2. **Two docs** — split `GUIDE-mental-model.md` + `CATALOG-injection.md`. cons: the one-sitting story
   straddles two files and two entry points; the catalog rows reference the model constantly, so the
   split adds cross-doc hops without adding clarity.
3. **Fold into README + examples/README** — no new top-level doc. cons: buries a load-bearing G10
   deliverable in existing files and crowds the README; no single "read this first" surface.

## Decision

One entry doc, **`docs/GUIDE-customizing.md`**, with four sections: (1) the mental model — hexagon
(core/ports/adapter) + the archetypes; (2) the invariant core (§11) framed as *what you cannot
inject*; (3) the tiered injection catalog with a sample link per point; (4) a *tailor in one sitting*
worked manifest + lint + run. README's Customize section and `examples/README.md` point at it as the
primary entry; `DESIGN`/`PRD` remain the deeper provenance.

## Consequences

- New file `docs/GUIDE-customizing.md`; `README.md` and `examples/README.md` link it first.
- The catalog reuses the canonical hexagon ASCII diagram and §11 invariant list rather than redrawing
  — one home for the model, the guide *presents* it.
- Tier-2 is shown as a gated stub ([[062-tier2-catalog-gated-stub]]); each catalog row links a
  lint-clean sample ([[063-lintable-examples-and-ci-gate]]).
