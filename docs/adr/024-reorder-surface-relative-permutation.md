# 024 — Reorder surface: relative-permutation `[id, …]`

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P7-pipeline-editing.md · **Supersedes/Refines:** refines ADR-005 (ends the OQ1 reorder deferral)

## Context

ADR-005 deferred arbitrary reorder (OQ1) — "insert+skip first". P7 ends the deferral. The
ordering machinery already exists: `validatePipeline → checkEdgesSatisfied →
nearestEarlierProducer` (`graph.js`) refuses a consumer placed before its producer, so reorder
is mostly a **surface/UX choice** — apply a permutation, then let the existing graph check
reject bad orders. The question: what does `pipeline.reorder` look like in the manifest?

## Options considered

1. **Relative-permutation `reorder: [id, id, …]`** — the listed ids' current *slots* (positions
   in the post-insert descriptor list) are refilled in the listed order; every unlisted phase
   keeps its exact position. One terse list expresses a reshuffle of any subset. *(user choice)*
2. **Move-directives `reorder: [{id, after}|{id, before}]`** — symmetric with `insert`'s
   `after:`/`before:` anchors; each entry moves one phase relative to an anchor. *(designer
   recommended — minimal new vocabulary)*
3. **Keep reorder deferred again** — ship only skip+insert hardening, re-defer per OQ1.

## Decision

`pipeline.reorder` is a **relative-permutation list of ids**. Semantics: collect the indices
(over the full post-insert descriptor list, scanned left-to-right) of the descriptors whose id
is in the list — these are the *slots*; refill the k-th slot (in ascending position order) with
the descriptor named by `reorder[k]`; leave every position not in the set untouched. Listed ids
must name **enabled** phases present after `applyInserts`. The list is alias-resolved in
`aliasResolve` alongside `pipeline.skip`/`pipeline.insert` ids. `manifest.js` adds `reorder` to
`PIPELINE_KEYS` and validates its **shape** (a list of strings) via a named private
`validateReorder` called from `validatePipelineKeys` — mirroring the existing
`validateModels`/`validateGates`/`validatePr`/`validateScripts` pattern (DC-C). Semantic checks
(applicability, ordering) are the resolver's domain, not `manifest.js`'s.

## Consequences

A whole-subset reshuffle is one line; unlisted phases are positionally stable by construction, so
a reorder never silently displaces a phase the author didn't name. Because slots are collected
over the *full* post-insert list, disabled descriptors sandwiched between reordered phases keep
their positions and drop out only at the `effective` filter — the worked SC3 example relies on
this. The relative-permutation form is a *second* positional mental model alongside insert's
anchors (the rejected option 2's symmetry cost), accepted for its terseness. Ordering validity
(consumer-before-producer) is **not** re-implemented here — see ADR-026.
