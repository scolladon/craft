# 281 — Deliberation-review ships as a catalog example: fenced agent, de-spiked, design-doc-linked

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-07-25
- **Design:** docs/design/sp9-findings-adoption.md · **Supersedes/Refines:** none

## Context

The deliberation-review declination (prototyped on a spike branch) is promoted into the
examples catalog as an opt-in per-phase review topology for high-stakes dimensions. The
catalog has a house style: one `workflow.md` per example, manifest frontmatter + prose; the
repo ships no live opt-in agents; links must resolve on this branch (lychee).

## Options considered

1. **`examples/deliberation-review/` with the agent body fenced in prose
   (save-to-`.claude/agents/`), indexed in `examples/README.md` + the GUIDE §4 index,
   de-spiked framing, linking to the design doc as the durable method home, `model: opus`
   pin in the fenced agent** *(recommended)* — pros: house style; branch-resolvable links;
   honest opt-in framing / cons: users copy one file by hand.
2. **Ship a live `agents/deliberation-reviewer.md` as a first-class repo agent** — pros:
   zero-copy adoption / cons: pollutes the default agent set with an opt-in prototype.
3. **Also port the spike's method section into this branch's archive and deep-link it** —
   pros: fuller provenance / cons: drags spike-branch content into the archive for one link.

## Decision

Option 1. The example presents deliberation as explicitly NOT a default (~2× cost for
depth), wired via the existing `role:` + `harness:` injection points; the whole-phase
`role:` swap constraint (narrow `dimensions` to the costly lens) is stated in the example.

## Consequences

The catalog stays uniform; no new injection point, no default behaviour change. The design
doc is the durable home of the SP9 method and measured matrix.
