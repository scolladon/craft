# 276 — Phase-name guard asserts set-equality over enabled ids only

- **Status:** accepted
- **Date:** 2026-07-25
- **Design:** docs/design/readme-drift-guards.md · **Supersedes/Refines:** 271

## Context

The README's mermaid diagram groups phases in presentational subgraphs and decorates
two nodes with a 🧑 marker; the timeline lists the same phases line by line. The guard
needs a comparison strict enough to catch renames but robust to presentation.

## Options considered

1. **Set-equality: mermaid set = timeline set = enabled-id set** *(designer
   recommendation)* — pros: catches rename/add/remove; robust to reordering and
   subgraph labels / cons: ignores ordering.
2. **Also guard the default-off prose** — pros: covers requirements/architecture
   mentions / cons: couples to fragile sentence wording for marginal value.
3. **Order-sensitive sequence match** — pros: catches reordering / cons: benign
   presentational reordering becomes a false failure.

## Decision

The three sets — mermaid node labels (subgraph group labels excluded, 🧑 markers
stripped), timeline first-tokens (lines containing `→`), and enabled descriptor ids —
must be pairwise equal, order-insensitive. Any difference is reported naming the
surface with the extra or missing phase.

## Consequences

A renamed, added, or removed enabled phase breaks CI on both README surfaces.
Reordering the diagram or renaming subgraph groups stays a non-event. The default-off
prose (`requirements`/`architecture`) is deliberately unguarded.
