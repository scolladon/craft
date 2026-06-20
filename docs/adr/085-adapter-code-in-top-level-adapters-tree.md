# 085 — Adapter code lives in a top-level adapters/ tree; engine/ stays core-only

- **Status:** accepted
- **Date:** 2026-06-20
- **Design:** docs/DESIGN-P16-provider-agnostic.md · **Supersedes/Refines:** none

## Context
P16 introduces a second adapter (Pi). The invariant the whole hexagon rests on is that
`engine/src/**` is the provider-neutral core every adapter reuses byte-for-byte. New adapter
code must not blur that boundary or perturb the core's test contract.

## Options
1. **Top-level `adapters/<name>/` tree; `engine/` stays core-only** — pros: the hexagon is visible on disk, the core stays untouched / cons: a new top-level dir. *(designer's recommendation, chosen)*
2. **Under `engine/adapters/`** — pros: one tree / cons: mixes adapter code into the core dir, blurs the exact boundary P16 exists to sharpen.
3. **Separate repo/package per adapter** — pros: hardest isolation / cons: premature for a PoC; release/dependency overhead.

## Decision
Pi adapter code lives under a new top-level `adapters/pi/`. `engine/**` remains the
provider-neutral core — adapters depend on it (calling `engine/bin/*`), never the reverse.

## Consequences
- `engine/src/**` keeps its role as the reused core; the 634-test core contract is unaffected by
  adapter code existing.
- Future adapters slot in as sibling `adapters/<name>/` trees.
- The Claude adapter remains expressed as `skills/` + `agents/` + `hooks/` (not relocated under
  `adapters/` in this run — see scope note in the design's Out of scope).
