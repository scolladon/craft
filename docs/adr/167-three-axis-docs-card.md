# 167 — three-axis customizing card reframes GUIDE §3

- **Status:** accepted
- **Date:** 2026-06-27
- **Design:** docs/design/simpler-phase-authoring.md · **Supersedes/Refines:** none

## Context

`docs/GUIDE-customizing.md` presents customization as a flat catalog of ~12 numbered
injection points organized by cost tier. That inventory is the implementation's shape, not
the author's mental model.

## Options considered

- (a) Reframe §3 with the card as the organizing spine; re-index every catalog point by
  axis cell; ports as a 4th row; keep every example link.
- (b) Add the card above an otherwise-unchanged catalog (augment).
- (c) Fully replace the catalog, dropping per-point detail.

## Decision

(a), user-ratified. The card:

- **WHO** runs it — `role` / `model` / `execution`
- **WHAT** it does — `procedure` / `override`
- **HOW** it's checked — `gate` / `harness`
- **reshape the spine** — `skip` / `insert` / `reorder` / `extends` / `context`
- **the floor you cannot touch** — invariant Preamble, core contract, gate cadence

Every existing catalog point (#1–#13) maps to a cell and keeps its runnable example link.

## Consequences

- One mental model; no content or example link lost.
- (b) leaves two competing models side by side; (c) loses the per-point reference.
