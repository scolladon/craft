# 087 — Execution/Model ports extracted as documented seams only (no engine/src shim)

- **Status:** accepted
- **Date:** 2026-06-20
- **Design:** docs/DESIGN-P16-provider-agnostic.md · **Supersedes/Refines:** none

## Context
The Execution and Model ports are named in `DESIGN-customizable-engine.md` §2.1 but bound inline
in the Claude adapter's prose (`run/SKILL.md`, agent frontmatter). P16 must "extract" them. The
realised hexagon (ADR-002) is *policy text + data + portable Node core*, not a class graph — the
two already-extracted ports (Gate, VCS) are scripts + spec docs, not `engine/src` interfaces.

## Options
1. **Document-the-seam-only** — spec docs + prose anchors; no executable port-interface module. pros: matches the realised-hexagon discipline, no speculative generality / cons: the seam is a documented discipline, not a compiler-enforced one. *(designer's recommendation, chosen)*
2. **Thin executable shim in `engine/src`** — a port-interface module the orchestrator calls. pros: one call site / cons: YAGNI — one consumer, speculative abstraction.
3. **Full inversion (orchestrator calls an adapter object)** — pros: textbook hexagon / cons: large rewrite of the core for no proven need.

## Decision
Extract Execution/Model as **documented seams**: new `docs/adapters/execution.md` and
`docs/adapters/model.md` spec docs, plus one-line anchors in `run/SKILL.md` marking the Claude
binding as the port's implementation. No executable port-interface abstraction is added to
`engine/src`. (This is independent of ADR-092's `model:` data passthrough, which moves a data
field, not a port-abstraction layer.)

## Consequences
- The seam is a spec-and-discipline contract; the Pi adapter is the empirical proof it holds.
- No speculative `engine/src` port-interface module to maintain.
- A machine-checkable conformance harness stays out of scope (the conformance checklist is the spec).
